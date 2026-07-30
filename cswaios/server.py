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
from .config import APP_VERSION, DOWNLOAD_URL, HERE, SHARE_URL, lan_ip
from .feedback import (attach_server_log, deliver, flush_pending,
                       report_bug, stage_feedback_folder)
from .graph import (GraphError, ensure_graph_config, graph_browse, graph_login_start,
                    graph_logout, graph_pick, graph_state)
from .logs import LOG_FILE, log_event, trim_log
from .notepad import apply_action as notepad_action
from .notepad import image_file, image_type, load_notepad
from .store import (load_ccrs, load_notes, load_overrides, save_ccrs, save_notes,
                    save_overrides)
from .tasks import (build_payload, current_stamp, forget_web_cache, push_overrides,
                    warm_cache)
from .todos import (TODO_COLUMNS, load_todo, normalize_todo_item, save_todo,
                    stop_todo_timer, sync_todo_timer_with_column, todo_identity)
from .updates import GITHUB_REPO, check_update, find_releases_dir, github_latest
from . import cli

STATIC_ROOT = os.path.join(HERE, "static")
STATIC_TYPES = {
    ".css": "text/css", ".js": "application/javascript", ".json": "application/json",
    ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
    ".woff2": "font/woff2", ".ttf": "font/ttf", ".map": "application/json",
}


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
        elif parsed.path == "/api/notepad":
            self._send(200, json.dumps(load_notepad()), "application/json")
        elif parsed.path.startswith("/api/notepad/img/"):
            self.send_note_image(parsed.path[len("/api/notepad/img/"):])
        elif parsed.path == "/api/ping":
            # identificação da instância — usado pela linha de comandos para
            # confirmar que fala com o servidor desta pasta
            self._send(200, json.dumps({
                "ok": True, "version": APP_VERSION,
                "mode": "dev" if config.DEV_MODE else "stable", "home": HERE,
                "pending": sum(len(v) for v in load_overrides().values()
                               if isinstance(v, dict)),
            }), "application/json")
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
            # ligar/desligar a conta Microsoft (device code flow). Só a partir
            # deste PC: quem está na LAN não mexe na sessão do dono da app.
            if ip not in ("127.0.0.1", "::1", "localhost"):
                log_event(f"{ip} tentou mexer na sessão do OneDrive - recusado")
                self._send(403, json.dumps({"error": "só a partir deste computador"}),
                           "application/json")
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
                action = payload.get("action", "state")
                if action == "login":
                    state = graph_login_start()
                elif action == "logout":
                    graph_logout()
                    state = graph_state()
                elif action == "browse":
                    # navegar nas pastas do OneDrive/SharePoint para escolher um livro
                    listing = graph_browse(str(payload.get("drive_id") or ""),
                                           str(payload.get("item_id") or ""),
                                           str(payload.get("search") or ""))
                    self._send(200, json.dumps(listing), "application/json")
                    return
                elif action == "pick":
                    book = graph_pick(str(payload.get("drive_id") or ""),
                                      str(payload.get("item_id") or ""))
                    forget_web_cache()   # os dados em cache eram do livro anterior
                    self._send(200, json.dumps({"ok": True, "book": book,
                                                **graph_state()}), "application/json")
                    return
                else:
                    state = graph_state()
                self._send(200, json.dumps(state), "application/json")
            except GraphError as exc:
                self._send(200, json.dumps({**graph_state(), "error": str(exc)}),
                           "application/json")
            except Exception as exc:
                log_event(f"{ip} /api/graph FALHOU: {exc!r}")
                self._send(500, json.dumps({"error": "erro interno"}), "application/json")
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
                if action == "add":
                    title = str(payload.get("title") or "").strip()[:200]
                    kind = payload.get("kind")
                    if kind not in ("manual", "task", "ccr"):
                        kind = "manual"
                    if not title:
                        raise ValueError("tarefa vazia")
                    # referência à linha de origem (aba/função/to-do ou ID de CCR),
                    # para o botão "ver item original" saber onde ir
                    raw_ref = payload.get("ref")
                    ref = {k: str(v).strip()[:200] for k, v in raw_ref.items()
                           if k in ("sheet", "fn", "todo", "ccr") and v} if isinstance(raw_ref, dict) else {}
                    # repetidos: comparar pela origem, não só pelo título, senão
                    # linhas diferentes com o mesmo nome ficavam de fora
                    ident = todo_identity(kind, title, ref)
                    open_todos = [t for t in todos if not t.get("done")]
                    existing = next((t for t in open_todos
                                     if todo_identity(t.get("kind"), t.get("title"),
                                                      t.get("ref")) == ident), None)
                    legacy = None
                    if existing is None and ref:
                        # itens antigos foram guardados sem `ref`; adota-se o primeiro
                        # com o mesmo título em vez de criar um duplicado
                        legacy = next((t for t in open_todos
                                       if t.get("title") == title and t.get("kind") == kind
                                       and not t.get("ref")), None)
                    col = str(payload.get("col") or "").strip().lower()
                    if col not in TODO_COLUMNS:
                        col = "todo"
                    if existing is None and legacy is None:
                        item = {"id": f"t{int(time.time() * 1000)}", "title": title,
                                "kind": kind, "done": False,
                                "col": col,
                                "detail": str(payload.get("detail") or "").strip()[:300],
                                "elapsed_ms": 0,
                                "timer_started": int(time.time() * 1000) if col == "inprogress" else None,
                                "created": datetime.now().strftime("%d/%m %H:%M")}
                        if ref:
                            item["ref"] = ref
                        todos.append(item)
                        log_event(f"{ip} TODO + [{kind}] {title[:60]!r}")
                    elif legacy is not None:
                        # item antigo (sem referência): aproveita o novo arrasto para a preencher
                        legacy["ref"] = ref
                        log_event(f"{ip} TODO ref preenchida: {title[:60]!r}")
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
                    # checklist leve dentro do item (sem edição/reordenação)
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
                else:
                    raise ValueError(f"ação inválida: {action}")
                todos = [normalize_todo_item(t) for t in todos if normalize_todo_item(t)]
                save_todo(todos)
                self._send(200, json.dumps({"ok": True, "todo": todos}), "application/json")
            except Exception as exc:
                log_event(f"{ip} operação TODO FALHOU: {exc}")
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
                safe = re.sub(r"[^A-Za-z0-9_-]+", "_", str(payload.get("name") or "anon"))[:30]
                folder = stage_feedback_folder(
                    f"{datetime.now():%Y%m%d_%H%M%S}_{safe}")
                with open(os.path.join(folder, "feedback.txt"), "w", encoding="utf-8") as f:
                    f.write(f"De: {payload.get('name', '?')} ({ip})\n"
                            f"Data: {datetime.now():%d/%m/%Y %H:%M}\n"
                            f"App: v{APP_VERSION}\n\n{text}\n")
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
                pendente = not deliver(folder)
                flush_pending()      # aproveita para entregar o que ficou para trás
                log_event(f"{ip} feedback de {payload.get('name', '?')}: "
                          f"{text[:80]!r} + {count} imagem(ns) -> {nome}"
                          + (" (pendente: sem acesso à partilha)" if pendente else ""))
                self._send(200, json.dumps({"ok": True, "folder": nome,
                                            "pending": pendente}),
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
                key = f'{payload["sheet"]}||{payload.get("fn", "")}||{payload.get("todo", "")}'
                tag = (payload.get("tag") or "").strip()
                note = (payload.get("note") or "").strip()
                raw_checks = payload.get("checks") or {}
                checks = {k: bool(v) for k, v in raw_checks.items() if isinstance(k, str)}
                notes = load_notes()
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
                    env = dict(os.environ, BSP_SKIP_UPDATE="1")
                    # o browser já está aberto (foi de lá que veio o pedido) e vai
                    # recarregar sozinho (location.reload() em settings.js) — não
                    # abrir uma segunda janela/aba ao reiniciar
                    argv = [a for a in sys.argv[1:] if a != "--no-browser"]
                    subprocess.Popen([sys.executable,
                                      os.path.join(HERE, "app.py"), "--no-browser"] + argv,
                                     cwd=HERE, env=env)
                    os._exit(0)
                threading.Thread(target=_restart, daemon=True).start()
            else:
                log_event(f"{ip} pediu atualização — já na versão mais recente")
                self._send(200, json.dumps({"ok": True, "updated": False}), "application/json")
            return
        if path != "/api/update":
            self._send(404, "Not found", "text/plain")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            column = payload["column"]
            if column not in ("Status TC", "Status TP", "OBS"):
                raise ValueError(f"coluna inválida: {column}")
            key = f'{payload["sheet"]}||{payload.get("fn", "")}||{payload.get("todo", "")}'

            # a alteração fica só local (✎) até o utilizador carregar em Push;
            # a escrita no Excel/OneDrive acontece em /api/push
            overrides = load_overrides()
            entry = overrides.get(key, {})
            if payload.get("value") is None:
                entry.pop(column, None)          # repor o valor da folha
            else:
                # mantém a base original se já havia override para esta célula
                base = entry.get(column, {}).get("base", payload.get("base", ""))
                entry[column] = {"value": str(payload["value"]), "base": base}
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


def main():
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
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            pass
        print(f"O tracker já está a correr em {url} — a abrir o browser.")
        webbrowser.open(url)
        return
    except OSError:
        pass  # porto livre — arrancar
    server = ThreadingHTTPServer((args.host, port), Handler)
    trim_log()
    # feedback que ficou por entregar (partilha sem escrita) tenta seguir agora
    flush_pending()
    threading.Thread(target=warm_cache, daemon=True).start()
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
    print("Registos: tracker.log (ou /logs no browser). Ctrl+C para parar.")
    if not args.no_browser:
        threading.Timer(0.5, webbrowser.open, [url]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
