# -*- coding: utf-8 -*-
"""Camada HTTP: encaminha os pedidos para a camada de dados."""

import argparse
import base64
import json
import os
import re
import socket
import subprocess
import sys
import threading
import time
import traceback
import webbrowser
from datetime import datetime
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from . import config
from .chat import answer as chat_answer
from .config import APP_VERSION, DOWNLOAD_URL, HERE, SHARE_URL, lan_ip
from .excel import browse_local_file
from .feedback import (attach_server_log, deliver, flush_pending,
                       github_issue_url, report_bug, stage_feedback_folder)
from .graph import (GraphError, ensure_graph_config, graph_browse, graph_login_start,
                    graph_logout, graph_pick, graph_state, graph_state_public,
                    save_login_email, save_onedrive_root)
from .history import recent_events, sheet_history
from .jira import (fetch_issue, load_jira_config, log_work, save_jira_config,
                   search_issues)
from .logs import LOG_FILE, install_crash_logging, log_event, trim_log
from .notepad import apply_action as notepad_action
from .notepad import image_file, image_type, load_notepad
from .report import build_report
from .store import (load_announcement, load_ccrs, load_notes, load_overrides,
                    save_announcement, save_ccrs, save_notes, save_overrides)
from .tasks import (_override_entry, _wb_key, build_payload, current_stamp,
                    forget_web_cache, known_headers, pending_overrides_summary,
                    push_overrides, queue_cellcat_override)
from .todos import (TODO_COLUMNS, TODO_PRIORITIES, TODO_PRIORITY_DEFAULT,
                    archive_done_todo, load_todo, normalize_ref,
                    normalize_todo_item, save_todo, sort_todos_by_priority,
                    stop_todo_timer, sync_todo_timer_with_column, todo_identity,
                    todo_link_target, todo_sources)
from .updates import (GITHUB_REPO, check_update, find_releases_dir, github_latest,
                      read_changelog)
from . import cli

STATIC_ROOT = os.path.join(HERE, "static")
_SERVER = None          # ThreadingHTTPServer em uso (preciso para o reinicio)
# janelas nativas abertas pelo ⧉, por endereço (ver open_extra_window)
_EXTRA_WINDOWS = {}
STATIC_TYPES = {
    ".css": "text/css", ".js": "application/javascript", ".json": "application/json",
    ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
    ".woff2": "font/woff2", ".ttf": "font/ttf", ".map": "application/json",
}


def _is_local(ip):
    """Pedido feito no PC onde a app corre.

    Só esses mexem em configuração (sessão do OneDrive, token do Jira, aviso do
    dono) ou abrem janelas: quem chega pela rede local usa a app, não a
    configura."""
    return ip in ("127.0.0.1", "::1", "localhost")


def _local_origin(host_header):
    """Origem (esquema + nome + porto) onde abrir outra janela desta app.

    Tem de ser a MESMA da janela que a pediu: o localStorage é por origem, e
    uma janela nascida em http://127.0.0.1 não via nada do que está guardado em
    http://localhost — abria sem livros nenhuns, com cara de app acabada de
    instalar (ver openWorkbookWindow em static/js/workbooks.js). Só se aceita um
    nome deste computador; o porto é sempre o nosso."""
    host = str(host_header or "").strip()
    if host.startswith("["):                       # [::1]:8765
        host = host[1:].split("]", 1)[0]
    else:
        host = host.rsplit(":", 1)[0] if host.count(":") == 1 else host
    host = host.lower()
    if host not in ("localhost", "127.0.0.1", "::1"):
        host = "localhost"     # a janela abre neste PC: mais nada serve
    if ":" in host:
        host = f"[{host}]"     # ::1
    return f"http://{host}:{config.SERVER_PORT}"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # silencia o log por pedido
        pass

    def _send(self, code, body, content_type):
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _graph_state_for(self, ip):
        """Estado do OneDrive tal como este cliente o pode ver.

        `local` diz à interface se vale a pena oferecer o que só funciona neste
        PC (ligar/desligar a conta, escolher a conta, o diálogo de ficheiros do
        Windows); de quem chega pela rede local esconde-se a identidade da
        conta, tal como já acontece no /api/tasks."""
        local = _is_local(ip)
        state = graph_state()
        return {**(state if local else graph_state_public(state)), "local": local}

    def send_static(self, rel_path):
        """Serve um ficheiro de `static/` (CSS/JS da interface)."""
        alvo = os.path.normpath(os.path.join(STATIC_ROOT, rel_path.lstrip("/")))
        # nunca sair da pasta static/ (path traversal)
        if os.path.commonpath([os.path.abspath(alvo), STATIC_ROOT]) != STATIC_ROOT \
                or not os.path.isfile(alvo):
            self._send(404, "Not found", "text/plain")
            return
        tipo = STATIC_TYPES.get(os.path.splitext(alvo)[1].lower(),
                                "application/octet-stream")
        with open(alvo, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", tipo + ("; charset=utf-8" if tipo.startswith(
            ("text/", "application/javascript", "application/json", "image/svg")) else ""))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        try:
            self.handle_get()
        except (ConnectionAbortedError, BrokenPipeError, ConnectionResetError):
            pass  # cliente fechou a ligacao a meio da resposta - nao e um erro da app
        except Exception:
            self.report_crash("GET " + self.path)

    def send_note_image(self, name):
        """Serve uma imagem colada numa nota (nomes gerados pela app)."""
        alvo = image_file(name)
        if not alvo:
            self._send(404, "Not found", "text/plain")
            return
        with open(alvo, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", image_type(name))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def report_crash(self, what):
        """Exceção não prevista a servir um pedido: reportar e responder 500."""
        detalhe = traceback.format_exc()
        ip = self.client_address[0]
        log_event(f"{ip} ERRO INTERNO em {what}: {detalhe.strip().splitlines()[-1]}")
        report_bug("servidor", f"Erro interno em {what}", detalhe, ip)
        try:
            self._send(500, json.dumps({"ok": False, "error": "erro interno (reportado)"}),
                       "application/json")
        except Exception:
            pass

    def handle_get(self):
        parsed = urlparse(self.path)
        ip = self.client_address[0]
        if parsed.path in ("/", "/index.html"):
            log_event(f"{ip} abriu a página")
            with open(os.path.join(HERE, "index.html"), encoding="utf-8") as f:
                self._send(200, f.read(), "text/html")
        elif parsed.path.startswith("/static/"):
            self.send_static(parsed.path[len("/static/"):])
        elif parsed.path == "/api/tasks":
            payload = build_payload(parse_qs(parsed.query))
            if "error" in payload:
                log_event(f"{ip} pediu tarefas - ERRO: {payload['error']}")
            else:
                log_event(f"{ip} pediu tarefas - {len(payload['rows'])}/{payload['total_rows']} "
                          f"({payload['person']}, aba {payload['sheet']}, "
                          f"{os.path.basename(payload['file'])}) "
                          f"gravado {payload.get('modified') or '?'} "
                          f"#{payload.get('digest') or '?'}")
            self._send(200, json.dumps(payload), "application/json")
        elif parsed.path == "/api/modified":
            # pedido leve e repetido: sem registo no log para não o encher
            self._send(200, json.dumps(current_stamp(parse_qs(parsed.query))),
                       "application/json")
        elif parsed.path == "/api/history":
            # histórico de uma folha: quando cada linha mudou pela última vez
            # (tarefas paradas) e os eventos recentes. Pedido repetido a cada
            # leitura, por isso sem registo no log.
            q = parse_qs(parsed.query)
            self._send(200, json.dumps(sheet_history(
                (q.get("file") or [""])[0], (q.get("sheet") or [""])[0],
                days=int((q.get("days") or ["30"])[0] or 30))), "application/json")
        elif parsed.path == "/api/history/recent":
            # atividade de todos os livros/abas (vista de métricas). `days` é a
            # janela relativa; com `since`/`until` (AAAA-MM-DD) é o intervalo de
            # datas escolhido na vista, em dias inteiros.
            q = parse_qs(parsed.query)
            self._send(200, json.dumps({"events": recent_events(
                days=int((q.get("days") or ["14"])[0] or 14),
                limit=min(5000, max(1, int((q.get("limit") or ["1000"])[0] or 1000))),
                since=(q.get("since") or [""])[0],
                until=(q.get("until") or [""])[0])}), "application/json")
        elif parsed.path == "/api/report/week":
            q = parse_qs(parsed.query)
            dias = int((q.get("days") or ["7"])[0] or 7)
            desde, ate = (q.get("since") or [""])[0], (q.get("until") or [""])[0]
            log_event(f"{ip} pediu o relatório de {desde or f'-{dias}d'} a {ate or 'agora'}")
            self._send(200, json.dumps(build_report(
                days=dias, lang=(q.get("lang") or ["pt"])[0],
                since=desde, until=ate)), "application/json")
        elif parsed.path == "/api/notepad":
            self._send(200, json.dumps(load_notepad()), "application/json")
        elif parsed.path == "/api/changelog":
            # novidades por versão para a janela "Novidades" — só quando o
            # utilizador a abre, por isso sem registo no log
            self._send(200, json.dumps({"currentVersion": APP_VERSION,
                                        "entries": read_changelog()}),
                       "application/json")
        elif parsed.path == "/api/announcement":
            # aviso do dono da instalação (ver store.py). Pedido uma vez por
            # arranque da interface, por isso sem registo no log. `canEdit` diz
            # à página das Definições se este cliente é o dono (só o PC onde a
            # app corre é que escreve o aviso).
            self._send(200, json.dumps({**load_announcement(),
                                        "canEdit": _is_local(ip)}), "application/json")
        elif parsed.path.startswith("/api/notepad/img/"):
            self.send_note_image(parsed.path[len("/api/notepad/img/"):])
        elif parsed.path == "/api/ping":
            # identificação da instância — usado pela linha de comandos para
            # confirmar que fala com o servidor desta pasta
            self._send(200, json.dumps({
                "ok": True, "version": APP_VERSION,
                "mode": "dev" if config.DEV_MODE else "stable", "home": HERE,
                "pending": len(pending_overrides_summary()),
            }), "application/json")
        elif parsed.path == "/api/jira/config":
            cfg = load_jira_config()
            self._send(200, json.dumps({"configured": bool(cfg),
                                        "baseUrl": (cfg or {}).get("baseUrl", "")}),
                       "application/json")
        elif parsed.path == "/api/jira/search":
            # procura por palavras (resumo ou chave) para se escolher a issue
            # sem sair da app; devolve `more` quando ha mais do que o limite
            query = (parse_qs(parsed.query).get("q") or [""])[0]
            try:
                issues, more = search_issues(query)
                self._send(200, json.dumps({"issues": issues, "more": more}),
                           "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
        elif re.match(r"^/api/jira/issue/[^/]+$", parsed.path):
            # confirma que a issue existe e devolve {key, summary, parentSummary?} -
            # usado para criar um cartão "placeholder" na página do Jira antes de
            # a issue estar ligada a qualquer tarefa
            key = parsed.path.split("/")[4]
            try:
                self._send(200, json.dumps(fetch_issue(key)), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
        elif parsed.path == "/logs":
            try:
                with open(LOG_FILE, encoding="utf-8") as f:
                    lines = f.readlines()
            except OSError:
                lines = []
            self._send(200, "".join(lines[-300:]) or "(sem registos)", "text/plain")
        else:
            log_event(f"{ip} pediu {parsed.path} - 404")
            self._send(404, "Not found", "text/plain")

    def do_POST(self):
        try:
            self.handle_post()
        except (ConnectionAbortedError, BrokenPipeError, ConnectionResetError):
            pass  # cliente fechou a ligacao a meio da resposta - nao e um erro da app
        except Exception:
            self.report_crash("POST " + self.path)

    def handle_post(self):
        path = urlparse(self.path).path
        ip = self.client_address[0]
        if path == "/api/fetch":
            # abre o link de download no browser predefinido; a sessão
            # SharePoint do utilizador trata da autenticação
            log_event(f"{ip} pediu download do SharePoint")
            webbrowser.open(DOWNLOAD_URL)
            self._send(200, json.dumps({"ok": True}), "application/json")
            return
        if path == "/api/graph":
            # O que MEXE na sessão ou na configuração continua a ser só deste PC:
            # quem está na LAN não liga, não desliga nem escolhe a conta do dono
            # da app. O que apenas LÊ (estado, navegar no OneDrive, abrir um
            # livro) é para toda a gente — é assim que o telemóvel chega aos
            # ficheiros de Excel, usando a sessão que este PC já tem aberta.
            local = _is_local(ip)
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
                action = payload.get("action", "state")
                if not local and action in ("login", "logout", "set_login_email",
                                            "set_onedrive_root"):
                    log_event(f"{ip} tentou mexer na sessão do OneDrive - recusado")
                    self._send(403, json.dumps({"error": "só a partir deste computador"}),
                               "application/json")
                    return
                if action == "login":
                    state = {**graph_login_start(), "local": True}
                elif action == "logout":
                    graph_logout()
                    state = self._graph_state_for(ip)
                elif action == "browse":
                    # navegar nas pastas do OneDrive/SharePoint para escolher um livro
                    listing = graph_browse(str(payload.get("drive_id") or ""),
                                           str(payload.get("item_id") or ""),
                                           str(payload.get("search") or ""))
                    self._send(200, json.dumps(listing), "application/json")
                    return
                elif action == "pick":
                    book = graph_pick(str(payload.get("drive_id") or ""),
                                      str(payload.get("item_id") or ""), remember=local)
                    if local:
                        forget_web_cache()   # os dados em cache eram do livro anterior
                    self._send(200, json.dumps({"ok": True, "book": book,
                                                **self._graph_state_for(ip)}),
                               "application/json")
                    return
                elif action == "set_login_email":
                    # conta Microsoft a pré-escolher no login, escrita à mão nas
                    # Definições (ex.: o PC tem várias contas e a lista da
                    # Microsoft aparecia sempre na errada)
                    save_login_email(str(payload.get("login_email") or ""))
                    log_event(f"{ip} definiu a conta do OneDrive")
                    state = self._graph_state_for(ip)
                elif action == "set_onedrive_root":
                    # OneDrive/site extra a seguir na navegação, escolhido pelo
                    # utilizador nas Definições (ex.: o livro vive no OneDrive
                    # de um colega, não no do dono desta instalação)
                    save_onedrive_root(str(payload.get("onedrive_url") or ""))
                    log_event(f"{ip} configurou o OneDrive extra")
                    state = self._graph_state_for(ip)
                else:
                    state = self._graph_state_for(ip)
                self._send(200, json.dumps(state), "application/json")
            except ValueError as exc:
                self._send(200, json.dumps({**self._graph_state_for(ip), "error": str(exc)}),
                           "application/json")
            except GraphError as exc:
                self._send(200, json.dumps({**self._graph_state_for(ip), "error": str(exc)}),
                           "application/json")
            except Exception as exc:
                log_event(f"{ip} /api/graph FALHOU: {exc!r}")
                self._send(500, json.dumps({"error": "erro interno"}), "application/json")
            return
        if path == "/api/workbook/browse_local":
            # escolher um .xlsx no disco pela janela do Windows. Só a partir
            # deste PC: o diálogo abre na máquina onde a app corre, quem está
            # na LAN não tem nada que o abrir.
            if ip not in ("127.0.0.1", "::1", "localhost"):
                log_event(f"{ip} tentou abrir o diálogo de ficheiros - recusado")
                self._send(403, json.dumps({"error": "só a partir deste computador"}),
                           "application/json")
                return
            try:
                escolhido = browse_local_file()
            except Exception as exc:
                log_event(f"{ip} /api/workbook/browse_local FALHOU: {exc!r}")
                self._send(500, json.dumps({"error": "erro interno"}), "application/json")
                return
            if escolhido == "unavailable":
                self._send(200, json.dumps(
                    {"path": None, "error": "procurar ficheiros só funciona na janela "
                                            "da app (no browser não há diálogo)"}),
                    "application/json")
                return
            if not escolhido:
                self._send(200, json.dumps({"path": None}), "application/json")
                return
            log_event(f"{ip} escolheu o livro local {escolhido}")
            self._send(200, json.dumps({"path": escolhido,
                                        "name": os.path.basename(escolhido)}),
                       "application/json")
            return
        if path == "/api/bug":
            # erro apanhado no browser: reportar automaticamente
            folder = None
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                folder = report_bug(
                    "browser",
                    str(payload.get("message") or "erro sem mensagem")[:500],
                    str(payload.get("stack") or "")[:4000],
                    ip,
                    str(payload.get("name") or ""),
                    {"página": str(payload.get("url") or "")[:200],
                     "browser": str(payload.get("ua") or "")[:200],
                     "vista": str(payload.get("view") or "")[:40]},
                )
            except Exception as exc:
                log_event(f"{ip} /api/bug FALHOU: {exc}")
            self._send(200, json.dumps({"ok": True, "folder": folder}), "application/json")
            return
        if path == "/api/clientlog":
            # diagnóstico: erros/ações do browser dos utilizadores
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                log_event(f"{ip} [browser] {str(payload.get('msg', ''))[:300]}")
            except Exception:
                pass
            self._send(200, json.dumps({"ok": True}), "application/json")
            return
        if path == "/api/todo":
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                action = payload.get("action", "")
                todos = load_todo()
                # o que aconteceu ao pedido de "add": novo, repetido ou ligado a
                # um item que já existia (a UI dá avisos diferentes)
                result = None
                if action == "add":
                    title = str(payload.get("title") or "").strip()[:200]
                    kind = payload.get("kind")
                    if kind not in ("manual", "task", "ccr"):
                        kind = "manual"
                    if not title:
                        raise ValueError("tarefa vazia")
                    # referência à linha de origem (aba/função/to-do ou ID de CCR),
                    # para o botão "ver item original" saber onde ir
                    ref = normalize_ref(payload.get("ref"))
                    # repetidos: comparar pela origem, não só pelo título, senão
                    # linhas diferentes com o mesmo nome ficavam de fora
                    ident = todo_identity(kind, title, ref)
                    open_todos = [t for t in todos if not t.get("done")]
                    existing = next((t for t in open_todos if ident in todo_sources(t)), None)
                    legacy = None
                    if existing is None and ref:
                        # itens antigos foram guardados sem `ref`; adota-se o primeiro
                        # com o mesmo título em vez de criar um duplicado
                        legacy = next((t for t in open_todos
                                       if t.get("title") == title and t.get("kind") == kind
                                       and not t.get("ref")), None)
                    # mesmo trabalho vindo de outro lado (Excel + CCR + escrito à
                    # mão): fica um só item, ligado a ambas as origens
                    link_target = None
                    if existing is None and legacy is None:
                        link_target = todo_link_target(open_todos, kind, title)
                    col = str(payload.get("col") or "").strip().lower()
                    if col not in TODO_COLUMNS:
                        col = "todo"
                    # prioridade é opcional na criação: sem ela fica no valor neutro
                    priority = str(payload.get("priority") or "").strip().lower()
                    if priority not in TODO_PRIORITIES:
                        priority = TODO_PRIORITY_DEFAULT
                    detail = str(payload.get("detail") or "").strip()[:300]
                    if existing is not None:
                        result = "exists"
                    elif legacy is not None:
                        # item antigo (sem referência): aproveita o novo arrasto para a preencher
                        legacy["ref"] = ref
                        result = "exists"
                        log_event(f"{ip} TODO ref preenchida: {title[:60]!r}")
                    elif link_target is not None:
                        result = "linked"
                        if ref:
                            links = link_target.get("links")
                            link_target["links"] = (links if isinstance(links, list) else []) + \
                                [{"kind": kind, "title": title, "ref": ref}]
                        if detail and not str(link_target.get("detail") or "").strip():
                            link_target["detail"] = detail
                        log_event(f"{ip} TODO ligado [{kind}] a {title[:60]!r}")
                    else:
                        item = {"id": f"t{int(time.time() * 1000)}", "title": title,
                                "kind": kind, "done": False,
                                "col": col,
                                "priority": priority,
                                "detail": detail,
                                "elapsed_ms": 0,
                                "timer_started": int(time.time() * 1000) if col == "inprogress" else None,
                                "created": datetime.now().strftime("%d/%m %H:%M")}
                        if ref:
                            item["ref"] = ref
                        todos.append(item)
                        result = "added"
                        log_event(f"{ip} TODO + [{kind}] {title[:60]!r}")
                elif action == "unlink_source":
                    # desfaz uma ligação feita por engano (títulos iguais de
                    # origens diferentes); a origem principal do item fica
                    target = next((t for t in todos if t.get("id") == payload.get("id")), None)
                    if target is None:
                        raise ValueError("item TODO não encontrado")
                    kind = str(payload.get("kind") or "").strip().lower()
                    ident = todo_identity(kind, str(payload.get("title") or "").strip()[:200],
                                          normalize_ref(payload.get("ref")))
                    links = target.get("links") if isinstance(target.get("links"), list) else []
                    target["links"] = [link for link in links
                                       if todo_identity(link.get("kind"), link.get("title"),
                                                        link.get("ref")) != ident]
                elif action == "toggle":
                    for t in todos:
                        if t.get("id") == payload.get("id"):
                            old_col = str(t.get("col") or "todo")
                            t["done"] = not t.get("done")
                            t["col"] = "done" if t["done"] else "todo"
                            sync_todo_timer_with_column(t, old_col, t["col"])
                            log_event(f'{ip} TODO {"feito" if t["done"] else "reaberto"}: '
                                      f'{t.get("title", "?")[:60]!r}')
                elif action == "set_col":
                    target = next((t for t in todos if t.get("id") == payload.get("id")), None)
                    col = str(payload.get("col") or "").strip().lower()
                    if target is None:
                        raise ValueError("item TODO não encontrado")
                    if col not in TODO_COLUMNS:
                        raise ValueError("coluna TODO inválida")
                    old_col = str(target.get("col") or "todo")
                    target["col"] = col
                    target["done"] = (col == "done")
                    sync_todo_timer_with_column(target, old_col, col)
                elif action == "set_priority":
                    target = next((t for t in todos if t.get("id") == payload.get("id")), None)
                    priority = str(payload.get("priority") or "").strip().lower()
                    if target is None:
                        raise ValueError("item TODO não encontrado")
                    if priority not in TODO_PRIORITIES:
                        raise ValueError("prioridade TODO inválida")
                    target["priority"] = priority
                    # mudar a prioridade arruma logo a lista (mais importante
                    # primeiro); a ordem manual mantém-se dentro de cada nível
                    todos = sort_todos_by_priority(todos)
                elif action == "move_kanban":
                    ids = [t.get("id") for t in todos]
                    task_id = payload.get("id")
                    if task_id not in ids:
                        raise ValueError("item TODO não encontrado")
                    col = str(payload.get("col") or "").strip().lower()
                    if col not in TODO_COLUMNS:
                        raise ValueError("coluna TODO inválida")
                    before = payload.get("before")
                    item = todos.pop(ids.index(task_id))
                    old_col = str(item.get("col") or "todo")
                    item["col"] = col
                    item["done"] = (col == "done")
                    sync_todo_timer_with_column(item, old_col, col)
                    if before and before in [t.get("id") for t in todos]:
                        pos = [t.get("id") for t in todos].index(before)
                        todos.insert(pos, item)
                    else:
                        # sem alvo explícito: entra no fim da coluna de destino
                        pos = max([i for i, t in enumerate(todos) if t.get("col") == col], default=-1) + 1
                        todos.insert(pos, item)
                elif action == "delete":
                    # o que já estava concluido fica arquivado: sai do quadro,
                    # mas continua a contar no relatório do período
                    for t in todos:
                        if t.get("id") == payload.get("id"):
                            archive_done_todo(t)
                    todos = [t for t in todos if t.get("id") != payload.get("id")]
                    log_event(f"{ip} TODO apagado: {payload.get('id')}")
                elif action == "move":
                    ids = [t.get("id") for t in todos]
                    if payload.get("id") in ids:
                        item = todos.pop(ids.index(payload.get("id")))
                        to = max(0, min(len(todos), int(payload.get("to", 0))))
                        todos.insert(to, item)
                elif action == "toggle_timer":
                    target = next((t for t in todos if t.get("id") == payload.get("id")), None)
                    if target is None:
                        raise ValueError("item TODO não encontrado")
                    if str(target.get("col") or "") != "inprogress":
                        raise ValueError("o cronometro so funciona em 'Em curso'")
                    if target.get("timer_started") is None:
                        target["timer_started"] = int(time.time() * 1000)
                    else:
                        stop_todo_timer(target)
                elif action == "restart_timer":
                    target = next((t for t in todos if t.get("id") == payload.get("id")), None)
                    if target is None:
                        raise ValueError("item TODO não encontrado")
                    target["elapsed_ms"] = 0
                    if str(target.get("col") or "") == "inprogress":
                        target["timer_started"] = int(time.time() * 1000)
                    else:
                        target["timer_started"] = None
                elif action == "set_detail":
                    # nota do item (os escritos à mão não têm origem no Excel/CCR
                    # onde a nota pudesse viver)
                    target = next((t for t in todos if t.get("id") == payload.get("id")), None)
                    if target is None:
                        raise ValueError("item TODO não encontrado")
                    target["detail"] = str(payload.get("detail") or "").strip()[:1000]
                    log_event(f'{ip} TODO nota: {str(target.get("title", "?"))[:60]!r}')
                elif action == "add_subtask":
                    # checklist leve dentro do item
                    target = next((t for t in todos if t.get("id") == payload.get("id")), None)
                    if target is None:
                        raise ValueError("item TODO não encontrado")
                    title = str(payload.get("title") or "").strip()[:200]
                    if not title:
                        raise ValueError("subtarefa vazia")
                    subs = target.get("subtasks")
                    if not isinstance(subs, list):
                        subs = []
                    subs.append({"id": f"s{int(time.time() * 1000)}", "title": title, "done": False})
                    target["subtasks"] = subs
                    log_event(f'{ip} subtarefa + em {str(target.get("title", "?"))[:60]!r}: {title[:60]!r}')
                elif action == "toggle_subtask":
                    target = next((t for t in todos if t.get("id") == payload.get("id")), None)
                    if target is None:
                        raise ValueError("item TODO não encontrado")
                    subs = target.get("subtasks") if isinstance(target.get("subtasks"), list) else []
                    sub = next((s for s in subs if isinstance(s, dict) and s.get("id") == payload.get("sub_id")), None)
                    if sub is None:
                        raise ValueError("subtarefa não encontrada")
                    sub["done"] = not sub.get("done")
                elif action == "jira_link":
                    # liga uma issue do Jira ao item (confirma-se que existe); cada
                    # item só pode ter uma issue ligada, por isso substitui a que
                    # já lá estivesse em vez de a acrescentar
                    target = next((t for t in todos if t.get("id") == payload.get("id")), None)
                    if target is None:
                        raise ValueError("item TODO não encontrado")
                    key = str(payload.get("key") or "").strip().upper()
                    if not key:
                        raise ValueError("chave da issue vazia")
                    existing = target.get("jiraIssues") if isinstance(target.get("jiraIssues"), list) else []
                    if any(isinstance(j, dict) and j.get("key") == key for j in existing):
                        raise ValueError(f"{key} já está ligada")
                    issue = fetch_issue(key)
                    target["jiraIssues"] = [issue]
                    log_event(f'{ip} ligou o Jira {key} a {str(target.get("title", "?"))[:60]!r}')
                elif action == "jira_unlink":
                    target = next((t for t in todos if t.get("id") == payload.get("id")), None)
                    if target is None:
                        raise ValueError("item TODO não encontrado")
                    key = str(payload.get("key") or "").strip().upper()
                    existing = target.get("jiraIssues") if isinstance(target.get("jiraIssues"), list) else []
                    target["jiraIssues"] = [j for j in existing
                                            if not (isinstance(j, dict) and j.get("key") == key)]
                elif action == "rename":
                    # só as tarefas criadas na app podem ser renomeadas — as de
                    # Excel/CCR têm de manter o título igual à origem
                    target = next((t for t in todos if t.get("id") == payload.get("id")), None)
                    if target is None:
                        raise ValueError("item TODO não encontrado")
                    if (target.get("kind") or "manual") != "manual":
                        raise ValueError("só as tarefas criadas na app podem ser renomeadas")
                    title = str(payload.get("title") or "").strip()[:200]
                    if not title:
                        raise ValueError("título vazio")
                    target["title"] = title
                    log_event(f'{ip} TODO renomeado: {title[:60]!r}')
                elif action == "rename_subtask":
                    target = next((t for t in todos if t.get("id") == payload.get("id")), None)
                    if target is None:
                        raise ValueError("item TODO não encontrado")
                    subs = target.get("subtasks") if isinstance(target.get("subtasks"), list) else []
                    sub = next((s for s in subs if isinstance(s, dict) and s.get("id") == payload.get("sub_id")), None)
                    if sub is None:
                        raise ValueError("passo não encontrado")
                    title = str(payload.get("title") or "").strip()[:200]
                    if not title:
                        raise ValueError("passo vazio")
                    sub["title"] = title
                elif action == "delete_subtask":
                    target = next((t for t in todos if t.get("id") == payload.get("id")), None)
                    if target is None:
                        raise ValueError("item TODO não encontrado")
                    subs = target.get("subtasks") if isinstance(target.get("subtasks"), list) else []
                    target["subtasks"] = [s for s in subs
                                          if not (isinstance(s, dict) and s.get("id") == payload.get("sub_id"))]
                elif action == "reorder_subtask":
                    target = next((t for t in todos if t.get("id") == payload.get("id")), None)
                    if target is None:
                        raise ValueError("item TODO não encontrado")
                    subs = target.get("subtasks") if isinstance(target.get("subtasks"), list) else []
                    ids = [s.get("id") for s in subs if isinstance(s, dict)]
                    sub_id = payload.get("sub_id")
                    if sub_id not in ids:
                        raise ValueError("subtarefa não encontrada")
                    sub = subs.pop(ids.index(sub_id))
                    to = max(0, min(len(subs), int(payload.get("to", 0))))
                    subs.insert(to, sub)
                    target["subtasks"] = subs
                else:
                    raise ValueError(f"ação inválida: {action}")
                todos = [normalize_todo_item(t) for t in todos if normalize_todo_item(t)]
                save_todo(todos)
                self._send(200, json.dumps({"ok": True, "todo": todos, "result": result}),
                           "application/json")
            except Exception as exc:
                log_event(f"{ip} operação TODO FALHOU: {exc}")
                self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
            return
        if path == "/api/chat":
            # assistente: pergunta + retrato do que o cliente tem em memória.
            # Não escreve nada e não lê a folha — quando propõe uma alteração,
            # é o cliente que a executa pelos endpoints normais depois de
            # confirmada (ver cswaios/chat.py).
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
                pergunta = str(payload.get("message") or "")
                out = chat_answer(pergunta, payload.get("context"),
                                  str(payload.get("lang") or "pt"))
                log_event(f"{ip} assistente [{out.get('intent')}]: {pergunta[:80]!r}")
                self._send(200, json.dumps({"ok": True, **out}), "application/json")
            except Exception as exc:
                log_event(f"{ip} assistente FALHOU: {exc!r}")
                self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
            return
        if path == "/api/window":
            # segunda janela da app (ver openWorkbookWindow em workbooks.js):
            # só a partir deste PC, porque a janela abre onde a app corre —
            # quem chega pela rede local abre-a no seu próprio browser, com o
            # window.open que já tentou antes de chegar aqui
            if not _is_local(ip):
                self._send(403, json.dumps({"ok": False, "error": "só a partir deste computador"}),
                           "application/json")
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
                destino = str(payload.get("path") or "/")
                # caminho desta app e mais nada: nunca abrir um endereço vindo
                # de fora ("//outro.site", "http://…") numa janela nossa
                if not destino.startswith("/") or destino.startswith("//"):
                    destino = "/"
                url = f"{_local_origin(self.headers.get('Host'))}{destino}"
                aberta = open_extra_window(url)
                log_event(f"{ip} abriu outra janela em {destino}"
                          f"{'' if aberta else ' (no browser)'}")
                self._send(200, json.dumps({"ok": True, "native": aberta}), "application/json")
            except Exception as exc:
                log_event(f"{ip} /api/window FALHOU: {exc!r}")
                self._send(500, json.dumps({"ok": False,
                                            "error": "não consegui abrir outra janela"}),
                           "application/json")
            return
        if path == "/api/announcement":
            # escrever/apagar o aviso mostrado a quem abre a app: só a partir
            # deste PC, tal como o /api/graph e o /api/jira/config
            if not _is_local(ip):
                log_event(f"{ip} tentou mexer no aviso - recusado")
                self._send(403, json.dumps({"error": "só a partir deste computador"}),
                           "application/json")
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
                if payload.get("action") == "clear":
                    data = save_announcement("", "")
                    log_event(f"{ip} apagou o aviso")
                else:
                    data = save_announcement(payload.get("title"), payload.get("text"))
                    log_event(f"{ip} gravou o aviso ({len(data['text'])} caracteres)")
                self._send(200, json.dumps({"ok": True, **data, "canEdit": True}),
                           "application/json")
            except Exception as exc:
                log_event(f"{ip} aviso FALHOU: {exc!r}")
                self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
            return
        if path == "/api/jira/config":
            # grava o token do Jira: só a partir deste PC, tal como o /api/graph
            if ip not in ("127.0.0.1", "::1", "localhost"):
                log_event(f"{ip} tentou configurar o Jira - recusado")
                self._send(403, json.dumps({"error": "só a partir deste computador"}),
                           "application/json")
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                save_jira_config(payload.get("baseUrl"), payload.get("token"))
                log_event(f"{ip} configurou o Jira")
                self._send(200, json.dumps({"ok": True}), "application/json")
            except Exception as exc:
                log_event(f"{ip} configuração do Jira FALHOU: {exc}")
                self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
            return
        m = re.match(r"^/api/jira/issue/([^/]+)/worklog$", path)
        if m:
            # registo de esforço: vai sempre ao Jira; só mexe no todo.json quando
            # o pedido vem de um item concreto (item_id), para lhe somar o esforço
            # registado a partir dele (jiraLoggedSeconds, ver todos.py)
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                result = log_work(m.group(1), payload.get("timeSpent"),
                                  payload.get("started"), payload.get("comment"))
                out = {"ok": True, **result}
                item_id = payload.get("item_id")
                if item_id:
                    todos = load_todo()
                    target = next((t for t in todos if isinstance(t, dict) and t.get("id") == item_id), None)
                    if target is not None:
                        target["jiraLoggedSeconds"] = int(target.get("jiraLoggedSeconds") or 0) \
                            + int(result.get("timeSpentSeconds") or 0)
                        # `timer_ms` = quanto do cronómetro este registo cobre
                        # (vem do botão que propõe o tempo por registar): sem
                        # isto o mesmo tempo voltava a ser proposto a seguir
                        try:
                            timer_ms = max(0, int(payload.get("timer_ms") or 0))
                        except (TypeError, ValueError):
                            timer_ms = 0
                        if timer_ms:
                            target["jiraLoggedFromTimerMs"] = \
                                int(target.get("jiraLoggedFromTimerMs") or 0) + timer_ms
                        todos = [normalize_todo_item(t) for t in todos if normalize_todo_item(t)]
                        save_todo(todos)
                        out["todo"] = todos
                log_event(f"{ip} registou trabalho no Jira {m.group(1)}: "
                          f"{payload.get('timeSpent')}")
                self._send(200, json.dumps(out), "application/json")
            except Exception as exc:
                log_event(f"{ip} registo de trabalho no Jira FALHOU: {exc}")
                self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
            return
        if path == "/api/notepad":
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
                data = notepad_action(payload)
                log_event(f"{ip} notas: {str(payload.get('action'))[:30]}")
                self._send(200, json.dumps({"ok": True, "notepad": data}), "application/json")
            except Exception as exc:
                log_event(f"{ip} operação de notas FALHOU: {exc}")
                self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
            return
        if path == "/api/overrides/clear":
            save_overrides({})
            log_event(f"{ip} descartou todas as alterações locais de estado")
            self._send(200, json.dumps({"ok": True}), "application/json")
            return
        if path == "/api/push":
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                _, pushed, failed = push_overrides(payload.get("file"))
                log_event(f"{ip} push para o Excel: {pushed} enviada(s), {len(failed)} falhada(s)")
                self._send(200, json.dumps({"ok": True, "pushed": pushed, "failed": failed}),
                           "application/json")
            except Exception as exc:
                log_event(f"{ip} push FALHOU: {exc}")
                self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
            return
        if path == "/api/feedback":
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                text = str(payload.get("text") or "").strip()
                images = payload.get("images") or []
                if not text and not images:
                    raise ValueError("feedback vazio")
                # página/vista onde o utilizador estava (opcional: quem limpar o
                # campo no formulário não a vê no reporte)
                page = re.sub(r"\s+", " ", str(payload.get("page") or "")).strip()[:80]
                safe = re.sub(r"[^A-Za-z0-9_-]+", "_", str(payload.get("name") or "anon"))[:30]
                folder = stage_feedback_folder(
                    f"{datetime.now():%Y%m%d_%H%M%S}_{safe}")
                with open(os.path.join(folder, "feedback.txt"), "w", encoding="utf-8") as f:
                    f.write(f"De: {payload.get('name', '?')} ({ip})\n"
                            f"Data: {datetime.now():%d/%m/%Y %H:%M}\n"
                            f"App: v{APP_VERSION}\n"
                            + (f"Página: {page}\n" if page else "")
                            + f"\n{text}\n")
                count = 0
                for img in images[:10]:
                    fname = re.sub(r"[^A-Za-z0-9._-]+", "_", str(img.get("name") or "img.png"))[:60]
                    data = base64.b64decode(str(img.get("data") or ""))
                    if not data or len(data) > 10 * 1024 * 1024:
                        continue
                    count += 1
                    with open(os.path.join(folder, f"{count:02d}_{fname}"), "wb") as f:
                        f.write(data)
                # junta os logs do servidor — costumam ter contexto útil
                attach_server_log(folder)
                nome = os.path.basename(folder)
                pendente = not deliver(folder, allow_relay=not payload.get("relay"))
                # sem via de entrega: fica a saída pública — uma issue no
                # GitHub, aberta pelo próprio no browser (repo público, não
                # precisa de ser colaborador)
                issue = github_issue_url(folder) if pendente else ""
                flush_pending()      # aproveita para entregar o que ficou para trás
                log_event(f"{ip} feedback de {payload.get('name', '?')}: "
                          f"{text[:80]!r} + {count} imagem(ns) -> {nome}"
                          + (f" [pagina: {page}]" if page else "")
                          + (" (pendente: sem acesso à partilha)" if pendente else ""))
                self._send(200, json.dumps({"ok": True, "folder": nome,
                                            "pending": pendente,
                                            "issue_url": issue}),
                           "application/json")
            except Exception as exc:
                log_event(f"{ip} feedback FALHOU: {exc}")
                self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
            return
        if path == "/api/ccrs":
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                action = payload.get("action", "update")
                ccr_id = str(payload.get("id", "")).strip()
                if not ccr_id:
                    raise ValueError("ID da CCR vazio")
                ccrs = load_ccrs()
                if action == "delete":
                    ccrs.pop(ccr_id, None)
                    log_event(f"{ip} apagou a CCR {ccr_id}")
                elif action == "add":
                    if ccr_id not in ccrs:
                        ccrs[ccr_id] = {"checks": {},
                                        "created": datetime.now().strftime("%d/%m %H:%M")}
                        log_event(f"{ip} adicionou a CCR {ccr_id}")
                else:
                    entry = ccrs.setdefault(ccr_id, {"created": datetime.now().strftime("%d/%m %H:%M")})
                    detail = []
                    if "checks" in payload:
                        raw = payload.get("checks") or {}
                        entry["checks"] = {k: bool(v) for k, v in raw.items() if isinstance(k, str)}
                        detail.append("checks=" + (",".join(k for k, v in entry["checks"].items() if v) or "-"))
                    if "note" in payload:
                        entry["note"] = str(payload.get("note") or "").strip()
                        detail.append(f'nota={entry["note"][:60]!r}')
                    log_event(f"{ip} CCR {ccr_id}: {'; '.join(detail) or 'sem alterações'}")
                save_ccrs(ccrs)
                self._send(200, json.dumps({"ok": True, "ccrs": ccrs}), "application/json")
            except Exception as exc:
                log_event(f"{ip} operação de CCR FALHOU: {exc}")
                self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
            return
        if path == "/api/notes/clear":
            save_notes({})
            log_event(f"{ip} limpou TODAS as notas de execução")
            self._send(200, json.dumps({"ok": True}), "application/json")
            return
        if path == "/api/note":
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                workbook_id = payload.get("file", "")
                sheet, fn, todo = payload["sheet"], payload.get("fn", ""), payload.get("todo", "")
                tag = (payload.get("tag") or "").strip()
                note = (payload.get("note") or "").strip()
                raw_checks = payload.get("checks") or {}
                checks = {k: bool(v) for k, v in raw_checks.items() if isinstance(k, str)}
                notes = load_notes()
                found_key, _ = _override_entry(notes, workbook_id, sheet, fn, todo)
                key = _wb_key(workbook_id, sheet, fn, todo)
                notes.pop(found_key, None)   # migra para a chave nova (com livro) ao gravar
                if not tag and not note and not any(checks.values()):
                    notes.pop(key, None)
                    log_event(f'{ip} limpou a nota de {payload.get("fn", "?")}')
                else:
                    notes[key] = {"tag": tag, "note": note, "checks": checks,
                                  "updated": datetime.now().strftime("%d/%m %H:%M")}
                    feitos = ",".join(k for k, v in checks.items() if v) or "-"
                    log_event(f'{ip} nota em {payload.get("fn", "?")}: '
                              f'[{tag}] checks={feitos} {note[:60]!r}')
                save_notes(notes)
                self._send(200, json.dumps({"ok": True}), "application/json")
            except Exception as exc:
                log_event(f"{ip} gravação de nota FALHOU: {exc}")
                self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
            return
        if path == "/api/app-update":
            if ip not in ("127.0.0.1", "::1", "localhost"):
                self._send(403, json.dumps({"error": "só a partir deste computador"}),
                           "application/json")
                return
            try:
                updated = check_update()
            except Exception as exc:
                self._send(500, json.dumps({"ok": False, "error": str(exc)}),
                           "application/json")
                return
            if updated:
                log_event(f"{ip} pediu atualização da app — a reiniciar com a versão nova")
                self._send(200, json.dumps({"ok": True, "updated": True}), "application/json")
                def _restart():
                    time.sleep(0.8)
                    env = dict(os.environ, BSP_SKIP_UPDATE="1", BSP_RESTART="1")
                    argv = [a for a in sys.argv[1:] if a != "--no-browser"]
                    try:
                        import webview  # noqa: F401
                        has_webview = True
                    except ImportError:
                        has_webview = False
                    # janela nativa (pywebview): é deste processo, por isso morre
                    # com ele — o processo novo tem de abrir a sua própria janela,
                    # não pode levar --no-browser. Sem pywebview a UI é uma aba do
                    # browser normal, que sobrevive a este processo e recarrega-se
                    # sozinha (location.reload() em settings.js); nesse caso mantém-se
                    # --no-browser para não abrir uma segunda aba.
                    new_argv = argv if has_webview else (["--no-browser"] + argv)
                    # largar o porto ANTES de arrancar o processo novo: senao ele
                    # ligava-se a este servidor, concluia "ja esta a correr", abria
                    # so a janela e ficava sem servidor quando este processo morre
                    if _SERVER is not None:
                        try:
                            _SERVER.server_close()
                        except Exception:
                            pass
                    subprocess.Popen([sys.executable, os.path.join(HERE, "app.py")] + new_argv,
                                     cwd=HERE, env=env)
                    os._exit(0)
                threading.Thread(target=_restart, daemon=True).start()
            else:
                log_event(f"{ip} pediu atualização — já na versão mais recente")
                self._send(200, json.dumps({"ok": True, "updated": False}), "application/json")
            return
        if path == "/api/cellcat/update":
            # categoria livre da vista mapeada à medida (com ou sem lista
            # predefinida): fica só local (✎) até ao Push, tal como
            # /api/update — mas identificada por posição na folha, não por
            # Function/TC+To Do (ver queue_cellcat_override, cswaios/tasks.py)
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                workbook_id = payload.get("file", "")
                sheet = payload.get("sheet", "")
                xlrow, col0 = int(payload["xlrow"]), int(payload["col0"])
                queue_cellcat_override(workbook_id, sheet, xlrow, col0,
                                       payload.get("value"), payload.get("base", ""),
                                       payload.get("list"))
                log_event(f"{ip} alterou categoria livre (local, à espera de Push): "
                          f"{sheet} linha {xlrow} coluna {col0 + 1}")
                self._send(200, json.dumps({"ok": True, "queued": True}), "application/json")
            except Exception as exc:
                log_event(f"{ip} alteração de categoria livre FALHOU: {exc}")
                self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
            return
        if path != "/api/update":
            self._send(404, "Not found", "text/plain")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            column = payload["column"]
            if column not in ("Status TC", "Status TP", "OBS", "Function/TC", "To Do"):
                headers = known_headers(payload.get("file", ""), payload.get("sheet", ""))
                if not headers or column not in headers:
                    raise ValueError(f"coluna inválida: {column}")
            workbook_id = payload.get("file", "")
            sheet, fn, todo = payload["sheet"], payload.get("fn", ""), payload.get("todo", "")

            # a alteração fica só local (✎) até o utilizador carregar em Push;
            # a escrita no Excel/OneDrive acontece em /api/push
            overrides = load_overrides()
            found_key, entry = _override_entry(overrides, workbook_id, sheet, fn, todo)
            entry = dict(entry) if entry else {}
            if payload.get("value") is None:
                entry.pop(column, None)          # repor o valor da folha
            else:
                # mantém a base original se já havia override para esta célula
                base = entry.get(column, {}).get("base", payload.get("base", ""))
                entry[column] = {"value": str(payload["value"]), "base": base}
            key = _wb_key(workbook_id, sheet, fn, todo)
            overrides.pop(found_key, None)    # migra para a chave nova (com livro) ao gravar
            if entry:
                overrides[key] = entry
            else:
                overrides.pop(key, None)
            save_overrides(overrides)
            what = (f'{payload.get("fn", "?")} [{column}] -> {payload["value"]!r}'
                    if payload.get("value") is not None
                    else f'{payload.get("fn", "?")} [{column}] reposto para o valor da folha')
            log_event(f"{ip} alterou estado (local, à espera de Push): {what}")
            self._send(200, json.dumps({"ok": True, "queued": True}),
                       "application/json")
        except Exception as exc:
            log_event(f"{ip} alteração de estado FALHOU: {exc}")
            self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")


def port_free(port, wait=0.0):
    """True se ninguém responde no porto. Com `wait`, espera até esse limite
    (segundos) — usado no reinício da auto-atualização, em que o processo
    antigo pode ainda estar a largar o porto."""
    deadline = time.time() + wait
    while True:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                pass
        except OSError:
            return True
        if time.time() >= deadline:
            return False
        time.sleep(0.3)


def open_extra_window(url):
    """Abre outra janela da app (ver /api/window). True se for janela nativa.

    Quem está a usar a app na janela nativa (pywebview) pediu OUTRA JANELA DA
    APP — nunca o browser: é a mesma app, o mesmo servidor e a mesma sessão do
    OneDrive, só noutra janela. Se a janela não puder abrir, o cliente mostra o
    erro em vez de aparecer uma aba do browser. Só quando a app está a ser usada
    numa aba do browser é que se abre lá o endereço, que é o que o browser faria.

    Carregar duas vezes no ⧉ do mesmo livro traz à frente a janela que já está
    aberta, em vez de abrir outra igual (é o que o nome da janela já fazia no
    browser)."""
    if config.WEBVIEW_WINDOW is not None:
        import webview
        aberta = _EXTRA_WINDOWS.get(url)
        if aberta is not None:
            try:
                aberta.show()
                return True
            except Exception as exc:
                # janela já destruída sem passarmos pelo evento 'closed'
                log_event(f"janela de {url} já não existe ({exc!r}) - a abrir outra")
                _EXTRA_WINDOWS.pop(url, None)
        janela = webview.create_window("My Organizer", url, width=1300, height=850,
                                       min_size=(1000, 650))
        _EXTRA_WINDOWS[url] = janela
        try:
            janela.events.closed += lambda *a: _EXTRA_WINDOWS.pop(url, None)
        except Exception:
            pass   # sem o evento perde-se só o "trazer à frente"
        return True
    webbrowser.open(url)
    return False


def open_ui(url):
    """Abre a interface: janela nativa (pywebview) se disponível, senão o browser.

    Bloqueia até a janela ser fechada (ou, sem pywebview, para sempre — Ctrl+C
    para parar); o servidor HTTP corre à parte, numa thread daemon."""
    try:
        import webview
    except ImportError:
        log_event("pywebview não instalado — a abrir no browser")
        webbrowser.open(url)
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            pass
        return
    # sem isto o Windows agrupa a janela sob o icone do python.exe na barra de
    # tarefas (herdado do interpretador), em vez do icone proprio da app
    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("CSW.MyOrganizer")
    except (AttributeError, OSError):
        pass
    # private_mode=False: preserva localStorage (preferência de tema, etc.)
    # entre arranques da app, tal como um browser normal faria.
    window = webview.create_window("My Organizer", url, width=1300, height=850,
                                   min_size=(1000, 650))
    # guardada para quem precise de diálogos nativos (escolher um .xlsx no disco)
    config.WEBVIEW_WINDOW = window
    webview.start(private_mode=False,
                  icon=os.path.join(HERE, "static", "img", "app-icon.ico"))


def main():
    global _SERVER
    parser = argparse.ArgumentParser(
        epilog="comandos disponiveis (" + ", ".join(cli.COMMANDS) +
               "): ver 'python app.py help'")
    parser.add_argument("--file", default=os.environ.get("BSP_TRACKER_FILE"))
    parser.add_argument("--port", type=int, default=None,
                        help="porto (por omissão 8765; 8766 em modo dev)")
    parser.add_argument("--host", default="0.0.0.0",
                        help="0.0.0.0 = acessível na rede local; 127.0.0.1 = só neste PC")
    parser.add_argument("--no-browser", action="store_true",
                        help="não abrir o browser automaticamente")
    parser.add_argument("--dev", action="store_true",
                        help="instância de desenvolvimento: outro porto e sem auto-atualização")
    parser.add_argument("--no-update", action="store_true",
                        help="não procurar versões novas na pasta partilhada")
    args = parser.parse_args()
    config.FORCED_FILE = args.file
    port = args.port or (8766 if args.dev else 8765)
    config.SERVER_PORT = port
    config.DEV_MODE = args.dev
    install_crash_logging()

    # auto-atualização a partir da pasta partilhada (uma tentativa por arranque).
    # Em modo dev fica desligada: o código local é o que está a ser trabalhado.
    skip = args.dev or args.no_update or os.environ.get("BSP_SKIP_UPDATE") == "1"
    if not skip and check_update():
        print("A reiniciar com a versão nova...")
        env = dict(os.environ, BSP_SKIP_UPDATE="1")
        subprocess.Popen([sys.executable, os.path.join(HERE, "app.py")] + sys.argv[1:],
                         cwd=HERE, env=env)
        return
    if not skip and find_releases_dir() is None:
        # sem a pasta do OneDrive: as atualizacoes ainda podem vir do GitHub
        # (ver check_update) -- so avisa que estao mesmo desligadas se nem
        # isso for possivel de verificar (sem rede, por exemplo)
        github_version, _, _ = github_latest()
        print()
        if github_version:
            print(f"Pasta partilhada 'BSP-G2-Tracker-App' nao encontrada — atualizacoes automaticas"
                  f" a usar o GitHub ({GITHUB_REPO}).")
        else:
            print("Atualizacoes automaticas desligadas: nao encontrei a pasta 'BSP-G2-Tracker-App'")
            print("nem consegui verificar o GitHub (falta rede?).")
            print("Pasta partilhada: abre este link e escolhe 'Adicionar atalho ao OneDrive':")
            print(f"  {SHARE_URL}")
            print(f"GitHub: https://github.com/{GITHUB_REPO}/releases/latest")
        print()

    url = f"http://localhost:{port}"
    # instalação nova: deixa a ligação ao OneDrive pronta a usar
    ensure_graph_config()
    # no Windows, o bind com SO_REUSEADDR não falha mesmo com o porto em uso,
    # por isso verificamos ligando-nos ao porto
    if not port_free(port, wait=10.0 if os.environ.get("BSP_RESTART") == "1" else 0.0):
        print(f"O tracker já está a correr em {url} — a abrir.")
        if not args.no_browser:
            open_ui(url)
        return
    server = ThreadingHTTPServer((args.host, port), Handler)
    _SERVER = server
    trim_log()
    # feedback que ficou por entregar (partilha sem escrita) tenta seguir agora
    flush_pending()
    ip = lan_ip() if args.host == "0.0.0.0" else None
    log_event(f"servidor v{APP_VERSION}{' DEV' if args.dev else ''} iniciado em {url}" +
              (f" | rede: http://{ip}:{port}" if ip else ""))
    if ip:
        print()
        print("  " + "=" * 58)
        if args.dev:
            print("   *** INSTANCIA DE DESENVOLVIMENTO (sem auto-atualizacao) ***")
        print(f"   Neste PC:            {url}")
        print(f"   Telemovel / outro PC (mesma rede):")
        print(f"                        http://{ip}:{port}")
        print("  " + "=" * 58)
        print()
    print("Registos: tracker.log (ou /logs no browser).")
    threading.Thread(target=server.serve_forever, daemon=True).start()
    if args.no_browser:
        # instância interna (ex.: reinicio a pedido do /api/update): a janela/
        # browser antigos já estão abertos e vão recarregar-se sozinhos
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            pass
    else:
        open_ui(url)  # bloqueia até a janela nativa ser fechada
