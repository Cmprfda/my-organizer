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
from datetime import datetime, timedelta
import gzip
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from . import config
from . import events
from . import tray
from .authors import AuthorError, who_changed
from .chat import answer as chat_answer
from .config import APP_VERSION, DOWNLOAD_URL, HERE, SHARE_URL, lan_ip
from .excel import browse_local_file
from .feedback import (attach_server_log, deliver, drop_pending, flush_pending,
                       github_issue_url, pending_list, report_bug,
                       reveal_pending, stage_feedback_folder)
from .graph import (GraphError, ensure_graph_config, graph_browse, graph_ids_from_path,
                    graph_login_start, graph_logout, graph_pick, graph_state,
                    graph_state_public, graph_versions, is_graph_path,
                    save_login_email, save_onedrive_root)
from .history import (batch_events, diff_between, overwritten_pushes,
                      recent_events, reconstruct_at, sheet_history,
                      stale_summary, transition_stats)
from .jira import (create_issue, fetch_issue, issue_status, issue_transitions,
                   list_projects, load_jira_config, log_work, save_jira_config,
                   search_issues, transition_issue)
from .logs import LOG_FILE, install_crash_logging, log_event, trim_log
from .notify import (load_notify_config, save_notify_config, send_toast,
                     send_webhook)
from .notepad import apply_action as notepad_action
from .notepad import image_file, image_type, load_notepad
from .repo import (add_repo, browse_local_folder, list_dir, load_repos,
                   read_text, remove_repo, rename_repo, search_files)
from .report import (build_report, meeting_anchor, meeting_report,
                     period_comparison, set_meeting_anchor, timesheet_lines)
from .statefile import (backup_now, list_backups, restore_backup, state_lock)
from .team import (ack_seen, load_capsules, load_team_config,
                   load_team_filters, load_team_handoffs, load_team_messages,
                   publish_capsule, publish_filters, publish_handoffs,
                   publish_messages, publish_waiting, save_team_config, team_dir,
                   team_waiting_on, unpublish_waiting)
from .store import (CCRS_FILE, NOTES_FILE, OVERRIDES_FILE, WAITING_FILE,
                    archive_ccr, load_announcement, load_ccr_archive, load_ccrs,
                    load_notes, load_overrides, load_waiting, load_waiting_log,
                    log_waiting_closed, normalize_blocker, save_announcement,
                    save_ccrs, save_notes, save_overrides, save_waiting,
                    waiting_stats)
from .tasks import (_override_entry, _wb_key, build_payload, current_stamp,
                    discard_overrides, forget_web_cache, known_headers,
                    pending_overrides_summary, push_overrides,
                    queue_cellcat_override)
from .notepad import NOTEPAD_FILE
from .todos import (DUE_RE, TODO_FILE, TODO_COLUMNS, TODO_PRIORITIES, TODO_PRIORITY_DEFAULT,
                    TODO_REPEATS, archive_done_todo, due_accuracy, load_done_archive,
                    load_todo, normalize_due, normalize_ref, normalize_repeat,
                    pop_archived,
                    normalize_todo_item, occurrence_durations,
                    restart_todo_timer, save_todo, sort_todos_by_priority, spawn_repeat,
                    stop_todo_timer, sync_todo_timer_with_column, todo_identity,
                    todo_link_target, todo_sources)
from .export import EXPORT_DIR, write_export
from .text import normalize
from .updates import (GITHUB_REPO, check_update, find_releases_dir, github_latest,
                      read_changelog)
from . import cli

STATIC_ROOT = os.path.join(HERE, "static")
# linhas que um "estado em massa" pode mexer de uma vez. Não é uma limitação
# técnica: é para uma vista mal filtrada não encher a folha de ✎ sem se dar por
# isso (ver /api/update/bulk).
BULK_MAX = 200
_SERVER = None          # ThreadingHTTPServer em uso (preciso para o reinicio)
# janelas nativas abertas pelo ⧉, por endereço (ver open_extra_window)
_EXTRA_WINDOWS = {}
STATIC_TYPES = {
    ".css": "text/css", ".js": "application/javascript", ".json": "application/json",
    ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
    ".woff2": "font/woff2", ".ttf": "font/ttf", ".map": "application/json",
    ".webmanifest": "application/manifest+json",
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
        codificacao = ""
        # a mesma compressão que o send_static já faz aos ficheiros: a resposta
        # do /api/tasks passa das centenas de KB e é pedida de dois em dois
        # minutos por cada janela aberta — incluindo os telemóveis pela LAN.
        # Abaixo de 1 KB comprimir só gasta tempo dos dois lados.
        if len(data) > 1024 and "gzip" in (self.headers.get("Accept-Encoding") or ""):
            comprimido = gzip.compress(data, 6)
            if len(comprimido) < len(data):
                data, codificacao = comprimido, "gzip"
        self.send_response(code)
        self.send_header("Content-Type", content_type + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        if codificacao:
            self.send_header("Content-Encoding", codificacao)
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
        """Serve um ficheiro de `static/` (CSS/JS da interface).

        Duas coisas que faltavam aqui e custavam caro a cada F5: a interface são
        ~800 KB de JS/CSS que vinham inteiros outra vez em todos os arranques
        (`no-store`), e vinham sem compressão. Agora vão com `ETag` — o browser
        pergunta e leva um 304 sem corpo enquanto o ficheiro não mudar — e
        comprimidos, que é onde o texto encolhe para cerca de um quinto. Uma
        versão nova da app muda a data dos ficheiros, logo muda o ETag: ninguém
        fica preso à interface antiga, que era o medo por trás do `no-store`.
        """
        alvo = os.path.normpath(os.path.join(STATIC_ROOT, rel_path.lstrip("/")))
        # nunca sair da pasta static/ (path traversal)
        if os.path.commonpath([os.path.abspath(alvo), STATIC_ROOT]) != STATIC_ROOT                 or not os.path.isfile(alvo):
            self._send(404, "Not found", "text/plain")
            return
        tipo = STATIC_TYPES.get(os.path.splitext(alvo)[1].lower(),
                                "application/octet-stream")
        texto = tipo.startswith(("text/", "application/javascript",
                                 "application/json", "image/svg"))
        try:
            st = os.stat(alvo)
            etag = f'W/"{int(st.st_mtime)}-{st.st_size}"'
        except OSError:
            etag = ""
        if etag and etag in (self.headers.get("If-None-Match") or ""):
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            return
        with open(alvo, "rb") as f:
            data = f.read()
        codificacao = ""
        # abaixo de 1 KB comprimir só gasta tempo dos dois lados
        if texto and len(data) > 1024 and "gzip" in (
                self.headers.get("Accept-Encoding") or ""):
            comprimido = gzip.compress(data, 6)
            if len(comprimido) < len(data):
                data, codificacao = comprimido, "gzip"
        self.send_response(200)
        self.send_header("Content-Type", tipo + ("; charset=utf-8" if texto else ""))
        self.send_header("Content-Length", str(len(data)))
        if codificacao:
            self.send_header("Content-Encoding", codificacao)
        if etag:
            self.send_header("ETag", etag)
        # no-cache não é no-store: o browser guarda, mas pergunta sempre antes
        # de usar — e a resposta a essa pergunta é um 304 sem corpo
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def stream_events(self, query):
        """Ligação pendurada (SSE) por onde saem os avisos desta instância.

        Fica aqui até o cliente fechar — e prende um fio do servidor enquanto
        isso, que é a razão do teto em `events.MAX_OUVINTES`. Cheio, responde-se
        503 e a janela continua a perguntar de vez em quando, como fazia antes
        de isto existir.
        """
        fila = events.subscribe()
        if fila is None:
            self._send(503, json.dumps({"ok": False, "error": "ouvintes demais"}),
                       "application/json")
            return
        cid = (query.get("cid") or [""])[0][:64]
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        # travessia de proxies e do pywebview sem ficar tudo em buffer
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        def escreve(data):
            self.wfile.write(data)
            try:
                self.wfile.flush()
            except (AttributeError, ValueError):
                pass

        log_event(f"{self.client_address[0]} ouve os avisos"
                  + (f" (janela {cid})" if cid else ""))
        events.stream(fila, escreve)

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

    # ---------------------------------------------------------------
    # As rotas
    #
    # Isto eram duas cadeias de if/elif com 27 e 34 ramos, dentro de dois
    # métodos de 200 e 1250 linhas: cada endpoint novo mexia no mesmo sítio
    # que todos os outros, e o corpo de um ramo só se conseguia experimentar
    # a partir de um pedido a sério. Agora o caminho aponta para um método,
    # e um método chama-se num teste sem abrir servidor nenhum.
    #
    # O que NÃO está aqui: os caminhos que não são uma igualdade (a página,
    # os ficheiros de static/, as imagens das notas, as rotas com a chave da
    # issue pelo meio). Esses ficam na cadeia, depois da tabela — e a tabela
    # ganha sempre, porque um caminho fixo é sempre mais específico.
    GET_ROUTES = {
        "/sw.js": "get_sw_js",
        "/api/tasks": "get_api_tasks",
        "/api/modified": "get_api_modified",
        "/api/history": "get_api_history",
        "/api/history/recent": "get_api_history_recent",
        "/api/report/week": "get_api_report_week",
        "/api/notepad": "get_api_notepad",
        "/api/repos": "get_api_repos",
        "/api/changelog": "get_api_changelog",
        "/api/announcement": "get_api_announcement",
        "/api/team/config": "get_api_team_config",
        "/api/team/filters": "get_api_team_filters",
        "/api/team/messages": "get_api_team_messages",
        "/api/team/capsules": "get_api_team_capsules",
        "/api/backups": "get_api_backups",
        "/api/events": "get_api_events",
        "/api/ping": "get_api_ping",
        "/api/jira/config": "get_api_jira_config",
        "/api/jira/search": "get_api_jira_search",
        "/api/notify/config": "get_api_notify_config",
        "/api/history/authors": "get_api_history_authors",
        "/api/history/who": "get_api_history_who",
        "/api/history/stats": "get_api_history_stats",
        "/api/history/overwritten": "get_api_history_overwritten",
        "/api/history/asof": "get_api_history_asof",
        "/api/report/compare": "get_api_report_compare",
        "/api/report/meeting": "get_api_report_meeting",
        "/api/todo/stats": "get_api_todo_stats",
        "/api/todo/list": "get_api_todo_list",
        "/api/todo/archive": "get_api_todo_archive",
        "/api/montra": "get_api_montra",
        "/api/waiting/stats": "get_api_waiting_stats",
        "/api/jira/projects": "get_api_jira_projects",
        "/api/feedback/pending": "get_api_feedback_pending",
        "/logs": "get_logs",
    }

    POST_ROUTES = {
        "/api/fetch": "post_api_fetch",
        "/api/graph": "post_api_graph",
        "/api/workbook/browse_local": "post_api_workbook_browse_local",
        "/api/repo": "post_api_repo",
        "/api/bug": "post_api_bug",
        "/api/clientlog": "post_api_clientlog",
        "/api/todo": "post_api_todo",
        "/api/chat": "post_api_chat",
        "/api/waiting": "post_api_waiting",
        "/api/report/meeting/anchor": "post_api_report_meeting_anchor",
        "/api/notify/config": "post_api_notify_config",
        "/api/notify": "post_api_notify",
        "/api/export": "post_api_export",
        "/api/window": "post_api_window",
        "/api/team/filters": "post_api_team_filters",
        "/api/team/messages": "post_api_team_messages",
        "/api/team/ack": "post_api_team_ack",
        "/api/remote": "post_api_remote",
        "/api/team/capsule": "post_api_team_capsule",
        "/api/team/config": "post_api_team_config",
        "/api/backups": "post_api_backups",
        "/api/announcement": "post_api_announcement",
        "/api/jira/config": "post_api_jira_config",
        "/api/jira/create": "post_api_jira_create",
        "/api/jira/worklog/bulk": "post_api_jira_worklog_bulk",
        "/api/notepad": "post_api_notepad",
        "/api/overrides/clear": "post_api_overrides_clear",
        "/api/push": "post_api_push",
        "/api/feedback": "post_api_feedback",
        "/api/feedback/pending": "post_api_feedback_pending",
        "/api/ccrs": "post_api_ccrs",
        "/api/notes/clear": "post_api_notes_clear",
        "/api/note": "post_api_note",
        "/api/app-update": "post_api_app_update",
        "/api/cellcat/update": "post_api_cellcat_update",
        "/api/history/undo": "post_api_history_undo",
        "/api/update/bulk": "post_api_update_bulk",
    }

    def handle_get(self):
        parsed = urlparse(self.path)
        ip = self.client_address[0]
        # a tabela primeiro: um caminho fixo é um método deste objeto
        # (ver GET_ROUTES). O resto da cadeia é o que não é uma
        # igualdade — prefixos e caminhos com um valor pelo meio.
        metodo = self.GET_ROUTES.get(parsed.path)
        if metodo:
            getattr(self, metodo)(parsed, ip)
            return
        if parsed.path in ('/', '/index.html'):
            log_event(f"{ip} abriu a página")
            with open(os.path.join(HERE, "index.html"), encoding="utf-8") as f:
                self._send(200, f.read(), "text/html")
        elif parsed.path in ('/montra', '/remote'):
            # duas páginas leves e à parte da app: a montra (um ecrã para ler a
            # dois metros) e o comando (o telemóvel a conduzir o computador).
            # Nenhuma delas carrega a interface toda — são para ficar abertas.
            nome = f"{parsed.path.strip('/')}.html"
            try:
                with open(os.path.join(HERE, nome), encoding="utf-8") as f:
                    corpo = f.read()
            except OSError:
                # uma instalação que se atualizou a partir de uma release onde
                # estas páginas ainda não iam: dizê-lo é melhor do que um erro
                # interno (e um reporte automático) por um ficheiro que falta
                log_event(f"{ip} pediu {nome}, que não está nesta instalação")
                self._send(404, msg("err_page_missing", "pt", n=nome), "text/plain")
                return
            log_event(f"{ip} abriu {nome}")
            self._send(200, corpo, "text/html")
        elif parsed.path.startswith('/static/'):
            self.send_static(parsed.path[len("/static/"):])
        elif parsed.path.startswith('/api/notepad/img/'):
            self.send_note_image(parsed.path[len("/api/notepad/img/"):])
        elif re.match('^/api/jira/issue/[^/]+$', parsed.path):
            # confirma que a issue existe e devolve {key, summary, parentSummary?} -
            # usado para criar um cartão "placeholder" na página do Jira antes de
            # a issue estar ligada a qualquer tarefa
            key = parsed.path.split("/")[4]
            try:
                self._send(200, json.dumps(fetch_issue(key)), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
        elif re.match('^/api/jira/issue/[^/]+/state$', parsed.path):
            # em que pé está a issue e por onde pode seguir (ver jiraStateHtml,
            # static/js/jira.js). Os passos vêm do fluxo do projeto, que é
            # diferente em cada um — daí serem pedidos e não adivinhados
            key = parsed.path.split("/")[4]
            try:
                estado = issue_status(key)
                estado["transitions"] = issue_transitions(key)
                self._send(200, json.dumps(estado), "application/json")
            except Exception as exc:
                self._send(400, json.dumps({"error": str(exc)}), "application/json")
        else:
            log_event(f"{ip} pediu {parsed.path} - 404")
            self._send(404, "Not found", "text/plain")

    def get_sw_js(self, parsed, ip):
        # o service worker tem de ser servido da RAIZ: o alcance dele é a
        # pasta de onde vem, e em /static/js/ só valeria para os scripts
        # (ver static/js/sw.js)
        self.send_static("js/sw.js")

    def get_api_tasks(self, parsed, ip):
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

    def get_api_modified(self, parsed, ip):
        # pedido leve e repetido: sem registo no log para não o encher
        self._send(200, json.dumps(current_stamp(parse_qs(parsed.query))),
                   "application/json")

    def get_api_history(self, parsed, ip):
        # histórico de uma folha: quando cada linha mudou pela última vez
        # (tarefas paradas) e os eventos recentes. Pedido repetido a cada
        # leitura, por isso sem registo no log.
        # `fn`/`todo` pedem a história de UMA linha (o "ver mais atrás" da caixa
        # da tarefa), e aí a janela pode ser de anos: o limite existe para que um
        # pedido à mão não mande ler o arquivo todo desde sempre.
        q = parse_qs(parsed.query)
        fn = (q.get("fn") or [None])[0]
        todo = (q.get("todo") or [None])[0]
        try:
            dias = int((q.get("days") or ["30"])[0] or 30)
        except ValueError:
            dias = 30
        try:
            teto = int((q.get("limit") or ["400"])[0] or 400)
        except ValueError:
            teto = 400
        self._send(200, json.dumps(sheet_history(
            (q.get("file") or [""])[0], (q.get("sheet") or [""])[0],
            days=min(3660, max(1, dias)), limit=min(2000, max(1, teto)),
            fn=fn, todo=todo)), "application/json")

    def get_api_history_recent(self, parsed, ip):
        # atividade de todos os livros/abas (vista de métricas). `days` é a
        # janela relativa; com `since`/`until` (AAAA-MM-DD) é o intervalo de
        # datas escolhido na vista, em dias inteiros.
        q = parse_qs(parsed.query)
        self._send(200, json.dumps({"events": recent_events(
            days=int((q.get("days") or ["14"])[0] or 14),
            limit=min(5000, max(1, int((q.get("limit") or ["1000"])[0] or 1000))),
            since=(q.get("since") or [""])[0],
            until=(q.get("until") or [""])[0])}), "application/json")

    def get_api_history_stats(self, parsed, ip):
        # quanto tempo uma linha fica, tipicamente, em cada estado (ver
        # history.transition_stats). Conta feita sobre os eventos que já estão
        # gravados: não lê a folha nem o OneDrive.
        q = parse_qs(parsed.query)
        self._send(200, json.dumps({"ok": True, "cols": transition_stats(
            days=min(730, max(7, int((q.get("days") or ["120"])[0] or 120))),
            since=(q.get("since") or [""])[0],
            until=(q.get("until") or [""])[0])}), "application/json")

    def get_api_history_overwritten(self, parsed, ip):
        # células que a app enviou e a folha depois mudou por cima: o envio deu
        # certo, ninguém avisou de nada, e o valor já não é o que foi enviado
        q = parse_qs(parsed.query)
        self._send(200, json.dumps({"ok": True, "items": overwritten_pushes(
            days=min(365, max(1, int((q.get("days") or ["30"])[0] or 30))),
            since=(q.get("since") or [""])[0],
            until=(q.get("until") or [""])[0])}), "application/json")

    def get_api_history_asof(self, parsed, ip):
        # a folha naquele dia: reconstruída ao contrário a partir do presente
        # (ver history.reconstruct_at). Com `diff=1` responde o que mudou entre
        # a data pedida e agora (ou até `to`), que é a vista "agora vs antes".
        q = parse_qs(parsed.query)
        livro = (q.get("file") or [""])[0]
        aba = (q.get("sheet") or [""])[0]
        # uma data (AAAA-MM-DD) vale como o fim daquele dia: é assim que se
        # espera "como estava na terça"
        at = (q.get("at") or [""])[0]
        if len(at) == 10:
            at = f"{at}T23:59:59"
        ate = (q.get("to") or [""])[0]
        if len(ate) == 10:
            ate = f"{ate}T23:59:59"
        if (q.get("diff") or ["0"])[0] == "1":
            self._send(200, json.dumps({"ok": True,
                                        **diff_between(livro, aba, at, ate)}),
                       "application/json")
            return
        self._send(200, json.dumps({"ok": True, **reconstruct_at(livro, aba, at)}),
                   "application/json")

    def get_api_report_compare(self, parsed, ip):
        # a bitola: este período ao lado da tua própria mediana dos anteriores
        q = parse_qs(parsed.query)
        self._send(200, json.dumps({"ok": True, **period_comparison(
            days=int((q.get("days") or ["7"])[0] or 7),
            windows=int((q.get("windows") or ["8"])[0] or 8))}),
            "application/json")

    def get_api_report_meeting(self, parsed, ip):
        # "desde a última reunião": o período que nenhum seletor de datas sabe
        # pedir. A âncora só se move quando alguém carregar no botão (POST).
        q = parse_qs(parsed.query)
        self._send(200, json.dumps(meeting_report(
            lang=(q.get("lang") or ["pt"])[0],
            anchor=(q.get("anchor") or [""])[0])), "application/json")

    def get_api_todo_list(self, parsed, ip):
        # a lista Por fazer, sozinha e sem tocar no Excel: é o que as páginas
        # leves (a montra e o comando do telemóvel) precisam — pedir /api/tasks
        # para isto abria o livro por causa de quatro números
        self._send(200, json.dumps({"ok": True, "todo": load_todo()}),
                   "application/json")

    def get_api_todo_archive(self, parsed, ip):
        # os concluídos que já saíram do quadro (ver todos.load_done_archive):
        # existiam desde sempre, mas só o relatório e a exportação os liam —
        # ninguém os conseguia VER. Leitura pura, sem tocar no Excel.
        q = parse_qs(parsed.query)
        texto = normalize((q.get("q") or [""])[0])
        de = (q.get("from") or [""])[0]
        ate = (q.get("to") or [""])[0]
        itens = []
        for item in load_done_archive():
            quando = str(item.get("done_at") or "")[:10]
            if texto and texto not in normalize(item.get("title") or ""):
                continue
            if de and quando < de:
                continue
            if ate and quando > ate:
                continue
            itens.append(item)
        # os últimos fechados primeiro: é por eles que se procura
        itens.sort(key=lambda x: str(x.get("done_at") or ""), reverse=True)
        self._send(200, json.dumps({"ok": True, "items": itens}), "application/json")

    def get_api_montra(self, parsed, ip):
        # a montra: quatro números e um rodapé, para ler a dois metros. Contas
        # do servidor porque a página não carrega a interface toda.
        q = parse_qs(parsed.query)
        dias = min(60, max(1, int((q.get("days") or ["7"])[0] or 7)))
        hoje = datetime.now().strftime("%Y-%m-%d")
        # sem pessoa a montra nao pode dizer quem espera por mim (o nome vive em
        # cada browser, e chega no pedido)
        a_minha_espera = len(team_waiting_on((q.get("person") or [""])[0]))
        cobrar = 0
        for marca in (load_waiting() or {}).values():
            if not isinstance(marca, dict) or not marca.get("who"):
                continue
            ate = str(marca.get("until") or "")
            if not ate or ate < hoje:
                cobrar += 1        # sem prazo, ou prazo passado: é para cobrar
        todos = load_todo()
        linhas = timesheet_lines(
            todos, (datetime.now() - timedelta(days=60)).strftime("%Y-%m-%d"), hoje)
        eventos = [e for e in recent_events(days=2, limit=60) if e.get("via") != "app"]
        self._send(200, json.dumps({
            "ok": True,
            **stale_summary(dias),
            "chase": cobrar,
            "waitme": a_minha_espera,
            # o resumo é uma LISTA (uma entrada por campo por enviar), e não um
            # dicionário com um total: é o número de alterações que o próximo
            # Envio leva
            "pending": len(pending_overrides_summary()),
            "unlogged_ms": sum(int(l.get("ms") or 0) for l in linhas),
            "doing": len([t for t in todos if isinstance(t, dict)
                          and not t.get("done") and t.get("col") == "inprogress"]),
            "events": [{"ts": e.get("ts"), "fn": e.get("fn") or "", "col": e.get("col"),
                        "to": e.get("to")} for e in eventos[:20]],
        }), "application/json")

    def get_api_todo_stats(self, parsed, ip):
        # o que a lista Por fazer sabe sobre si mesma: quanto costuma levar cada
        # volta de um item que se repete, e a calibração das datas que a pessoa
        # se dá a si mesma (ver todos.occurrence_durations/due_accuracy)
        voltas = {}
        for item in load_todo():
            if not isinstance(item, dict):
                continue
            dados = occurrence_durations(item)
            if dados:
                voltas[str(item.get("id") or "")] = dados
        self._send(200, json.dumps({"ok": True, "repeats": voltas,
                                    "due": due_accuracy()}), "application/json")

    def post_api_report_meeting_anchor(self, path, ip):
        # a reunião de hoje passa a ser a âncora da próxima
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            at = set_meeting_anchor(str(payload.get("at") or ""))
            log_event(f"{ip} âncora da reunião marcada em {at}")
            self._send(200, json.dumps({"ok": True, "at": at}), "application/json")
        except Exception as exc:
            log_event(f"{ip} /api/report/meeting/anchor FALHOU: {exc}")
            self._send(400, json.dumps({"ok": False, "error": str(exc)}),
                       "application/json")
        return

    def get_api_report_week(self, parsed, ip):
        q = parse_qs(parsed.query)
        dias = int((q.get("days") or ["7"])[0] or 7)
        desde, ate = (q.get("since") or [""])[0], (q.get("until") or [""])[0]
        log_event(f"{ip} pediu o relatório de {desde or f'-{dias}d'} a {ate or 'agora'}")
        self._send(200, json.dumps(build_report(
            days=dias, lang=(q.get("lang") or ["pt"])[0],
            since=desde, until=ate)), "application/json")

    def get_api_notepad(self, parsed, ip):
        self._send(200, json.dumps(load_notepad()), "application/json")

    def get_api_repos(self, parsed, ip):
        # pastas de código abertas na vista "Código" (ver cswaios/repo.py).
        # Ler ficheiros do disco é só a partir deste PC — quem chega pela
        # rede local recebe a lista vazia e a vista fica a dizer porquê.
        if not _is_local(ip):
            self._send(200, json.dumps({"repos": [], "local": False}),
                       "application/json")
            return
        self._send(200, json.dumps({"repos": load_repos(), "local": True}),
                   "application/json")

    def get_api_changelog(self, parsed, ip):
        # novidades por versão para a janela "Novidades" — só quando o
        # utilizador a abre, por isso sem registo no log
        self._send(200, json.dumps({"currentVersion": APP_VERSION,
                                    "entries": read_changelog()}),
                   "application/json")

    def get_api_announcement(self, parsed, ip):
        # aviso do dono da instalação (ver store.py). Pedido uma vez por
        # arranque da interface, por isso sem registo no log. `canEdit` diz
        # à página das Definições se este cliente é o dono (só o PC onde a
        # app corre é que escreve o aviso).
        self._send(200, json.dumps({**load_announcement(),
                                    "canEdit": _is_local(ip)}), "application/json")

    def get_api_team_config(self, parsed, ip):
        # partilha das esperas com a equipa (ver team.py). `canEdit` porque
        # quem liga a partilha é o dono desta instalação, como no aviso.
        cfg = load_team_config()
        self._send(200, json.dumps({**cfg, "canEdit": _is_local(ip),
                                    "shareFound": team_dir() is not None}),
                   "application/json")

    def get_api_team_filters(self, parsed, ip):
        # os conjuntos de filtros publicados pela equipa (ver team.py). Ler
        # é para todos; publicar é só deste PC, como tudo o que escreve na
        # pasta partilhada.
        q = parse_qs(parsed.query)
        self._send(200, json.dumps({
            "sets": load_team_filters((q.get("person") or [""])[0]),
            "canPublish": _is_local(ip),
            "shared": bool(team_dir()),
        }), "application/json")

    def get_api_backups(self, parsed, ip):
        # cópias do estado local (ver statefile.py). Só quem está neste PC é
        # que pode repor uma, por isso a lista diz-lhe se pode.
        self._send(200, json.dumps({"backups": list_backups(),
                                    "canRestore": _is_local(ip)}),
                   "application/json")

    def get_api_events(self, parsed, ip):
        self.stream_events(parse_qs(parsed.query))

    def get_api_ping(self, parsed, ip):
        # identificação da instância — usado pela linha de comandos para
        # confirmar que fala com o servidor desta pasta
        self._send(200, json.dumps({
            "ok": True, "version": APP_VERSION,
            "mode": "dev" if config.DEV_MODE else "stable", "home": HERE,
            "pending": len(pending_overrides_summary()),
            "listeners": events.listeners(),
        }), "application/json")

    def get_api_jira_config(self, parsed, ip):
        cfg = load_jira_config()
        self._send(200, json.dumps({"configured": bool(cfg),
                                    "baseUrl": (cfg or {}).get("baseUrl", "")}),
                   "application/json")

    def get_api_jira_search(self, parsed, ip):
        # procura por palavras (resumo ou chave) para se escolher a issue
        # sem sair da app; devolve `more` quando ha mais do que o limite
        query = (parse_qs(parsed.query).get("q") or [""])[0]
        try:
            issues, more = search_issues(query)
            self._send(200, json.dumps({"issues": issues, "more": more}),
                       "application/json")
        except Exception as exc:
            self._send(400, json.dumps({"error": str(exc)}), "application/json")

    def get_api_notify_config(self, parsed, ip):
        cfg = load_notify_config()
        # o endereço de um webhook é um segredo (quem o tiver escreve no
        # canal): só o próprio computador o vê, como o token do Jira
        self._send(200, json.dumps({"enabled": cfg["enabled"],
                                    "url": cfg["url"] if _is_local(ip) else "",
                                    "canEdit": _is_local(ip)}),
                   "application/json")

    def get_api_history_authors(self, parsed, ip):
        # quem gravou o livro e quando (ver graph_versions): o histórico
        # sabe o que mudou e a que horas, mas a folha não diz por quem —
        # cruzando as horas com as gravações do OneDrive, fica-se a saber
        # de quem foi a gravação que trouxe cada alteração. Só a fonte web
        # tem versões; um ficheiro local devolve lista vazia.
        q = parse_qs(parsed.query)
        livro = (q.get("file") or [""])[0]
        try:
            drive_id, item_id = graph_ids_from_path(livro) if is_graph_path(livro) else ("", "")
            versoes = graph_versions(drive_id, item_id) if drive_id and item_id else []
            self._send(200, json.dumps({"versions": versoes}), "application/json")
        except Exception as exc:
            self._send(200, json.dumps({"versions": [], "error": str(exc)}),
                       "application/json")

    def get_api_history_who(self, parsed, ip):
        # quem mudou ESTA célula: vai-se ver à versão do livro (ver
        # cswaios/authors.py), em vez de adivinhar pela hora da gravação.
        # Custa uma descarga do livro por versão consultada, por isso é só
        # a pedido — quando alguém clica no ☁ de uma alteração.
        q = parse_qs(parsed.query)
        try:
            out = who_changed(
                (q.get("file") or [""])[0], (q.get("sheet") or [""])[0],
                int((q.get("xlrow") or ["0"])[0] or 0),
                (q.get("col") or [""])[0], (q.get("ts") or [""])[0],
                (q.get("from") or [""])[0], (q.get("to") or [""])[0])
            self._send(200, json.dumps({"ok": True, **out}), "application/json")
        except (AuthorError, ValueError) as exc:
            # não é um erro da app: é uma pergunta sem resposta possível
            # (ficheiro local, versões que já saíram, célula que mudou outra
            # vez desde então)
            self._send(200, json.dumps({"ok": False, "error": str(exc)}),
                       "application/json")

    def get_api_waiting_stats(self, parsed, ip):
        # o "Livro de dívidas": quantas esperas cada pessoa já resolveu e em
        # quantos dias. Fica na máquina (ver store.waiting_stats) — o que
        # viaja para a equipa são as esperas ABERTAS, nunca estes tempos.
        self._send(200, json.dumps({"ok": True, "people": waiting_stats(),
                                    "logged": len(load_waiting_log())}),
                   "application/json")

    def get_api_jira_projects(self, parsed, ip):
        try:
            self._send(200, json.dumps({"projects": list_projects()}), "application/json")
        except Exception as exc:
            self._send(400, json.dumps({"error": str(exc)}), "application/json")

    def get_logs(self, parsed, ip):
        try:
            with open(LOG_FILE, encoding="utf-8") as f:
                lines = f.readlines()
        except OSError:
            lines = []
        self._send(200, "".join(lines[-300:]) or "(sem registos)", "text/plain")


    # Ficheiro de estado que cada pedido mexe. Os handlers fazem
    # `load_x()` -> mexem na estrutura -> `save_x()`, e sem trinco dois pedidos
    # ao mesmo tempo (telemovel + browser + segunda janela, ou o /api/modified
    # de 20 em 20 segundos a cair no meio) gravavam um por cima do outro e o
    # item acabado de criar desaparecia. O trinco e POR FICHEIRO de proposito: o
    # Push pode levar um minuto no Excel e nao ha razao para travar quem esta a
    # escrever uma nota noutro dispositivo.
    STATE_POST_FILE = {
        "/api/todo": TODO_FILE,
        "/api/jira/create": TODO_FILE,      # a issue nasce ligada a um item
        "/api/jira/worklog/bulk": TODO_FILE,   # soma o esforço a cada item
        "/api/notepad": NOTEPAD_FILE,
        "/api/note": NOTES_FILE,
        "/api/notes/clear": NOTES_FILE,
        "/api/ccrs": CCRS_FILE,
        "/api/waiting": WAITING_FILE,
        "/api/history/undo": OVERRIDES_FILE,
        "/api/update": OVERRIDES_FILE,
        "/api/update/bulk": OVERRIDES_FILE,
        "/api/cellcat/update": OVERRIDES_FILE,
        "/api/overrides/clear": OVERRIDES_FILE,
        "/api/push": OVERRIDES_FILE,
    }

    def _worklog_one(self, entrada, todos):
        """Registo de esforço de UMA linha, no Jira e no item de onde ela veio.

        Partilhado pelo diálogo do esforço (uma issue) e pelo registo em lote da
        folha de horas: o caminho até ao Jira é o mesmo nos dois, e o que muda é
        só quantas vezes se percorre. Não grava o todo.json — quem chama é que
        sabe se grava uma vez ou no fim de todas.
        """
        key = str(entrada.get("key") or entrada.get("issue") or "").strip()
        try:
            if not key:
                raise ValueError("sem issue")
            result = log_work(key, entrada.get("timeSpent"), entrada.get("started"),
                              entrada.get("comment"))
        except Exception as exc:
            return {"ok": False, "key": key, "day": entrada.get("day") or "",
                    "error": str(exc)[:200]}
        item_id = entrada.get("item_id")
        alvo = next((t for t in todos if isinstance(t, dict) and t.get("id") == item_id),
                    None) if item_id else None
        if alvo is not None:
            alvo["jiraLoggedSeconds"] = int(alvo.get("jiraLoggedSeconds") or 0) \
                + int(result.get("timeSpentSeconds") or 0)
            try:
                timer_ms = max(0, int(entrada.get("timer_ms") or 0))
            except (TypeError, ValueError):
                timer_ms = 0
            if timer_ms:
                alvo["jiraLoggedFromTimerMs"] = \
                    int(alvo.get("jiraLoggedFromTimerMs") or 0) + timer_ms
        return {"ok": True, "key": key, "day": entrada.get("day") or "",
                "seconds": int(result.get("timeSpentSeconds") or 0)}

    # rotas cujo caminho traz um valor pelo meio (a chave da issue): não cabem
    # na tabela acima, e sem isto o registo de esforço mexia no todo.json sem
    # trinco nenhum — um clique no ⏱+ ao mesmo tempo que um arrastar na lista
    # dava a lista de um deles gravada por cima da do outro
    STATE_POST_PATTERNS = ((re.compile(r"^/api/jira/issue/[^/]+/worklog$"), TODO_FILE),)

    def _state_file_for(self, path):
        """O ficheiro de estado que este pedido mexe (None se não mexe em nenhum)."""
        alvo = self.STATE_POST_FILE.get(path)
        if alvo:
            return alvo
        for padrao, ficheiro in self.STATE_POST_PATTERNS:
            if padrao.match(path):
                return ficheiro
        return None

    def do_POST(self):
        try:
            # a janela que fez o pedido vai no aviso que sair daqui: ela já
            # sabe o que fez e não tem de se recarregar por causa do seu clique
            events.set_origin(self.headers.get("X-Csw-Client"))
            alvo = self._state_file_for(urlparse(self.path).path)
            if alvo:
                with state_lock(alvo):
                    self.handle_post()
            else:
                self.handle_post()
        except (ConnectionAbortedError, BrokenPipeError, ConnectionResetError):
            pass  # cliente fechou a ligacao a meio da resposta - nao e um erro da app
        except Exception:
            self.report_crash("POST " + self.path)

    def handle_post(self):
        path = urlparse(self.path).path
        ip = self.client_address[0]
        metodo = self.POST_ROUTES.get(path)
        if metodo:
            getattr(self, metodo)(path, ip)
            return
        m = re.match(r"^/api/jira/issue/([^/]+)/transition$", path)
        if m:
            # fazer a issue avançar sem sair da app: o passo é um dos que o
            # /state ofereceu, e o estado devolvido é relido do Jira
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                estado = transition_issue(m.group(1), payload.get("transition"))
                log_event(f'{ip} Jira {m.group(1)} -> {estado.get("status")!r}')
                self._send(200, json.dumps({"ok": True, **estado}), "application/json")
            except Exception as exc:
                log_event(f"{ip} transição do Jira FALHOU: {exc}")
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
        if path != "/api/update":
            self._send(404, "Not found", "text/plain")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            # a alteração fica só local (✎) até o utilizador carregar em Push;
            # a escrita no Excel/OneDrive acontece em /api/push
            overrides = load_overrides()
            what = queue_column_override(overrides, payload)
            save_overrides(overrides)
            log_event(f"{ip} alterou estado (local, à espera de Push): {what}")
            self._send(200, json.dumps({"ok": True, "queued": True}),
                       "application/json")
        except Exception as exc:
            log_event(f"{ip} alteração de estado FALHOU: {exc}")
            self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")

    def post_api_fetch(self, path, ip):
        # abre o link de download no browser predefinido; a sessão
        # SharePoint do utilizador trata da autenticação
        log_event(f"{ip} pediu download do SharePoint")
        webbrowser.open(DOWNLOAD_URL)
        self._send(200, json.dumps({"ok": True}), "application/json")
        return

    def post_api_graph(self, path, ip):
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

    def post_api_workbook_browse_local(self, path, ip):
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

    def post_api_repo(self, path, ip):
        # vista "Código": abrir/fechar uma pasta, ver a árvore e ler um
        # ficheiro. SÓ LEITURA — nada aqui escreve no disco do utilizador,
        # a não ser a lista das pastas escolhidas (repos.json).
        # Só a partir deste PC: são ficheiros locais, não têm que passar
        # pela rede local (o mesmo critério do /api/workbook/browse_local).
        if not _is_local(ip):
            log_event(f"{ip} tentou ler ficheiros locais - recusado")
            self._send(403, json.dumps({"ok": False,
                                        "error": "só a partir deste computador"}),
                       "application/json")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            action = str(payload.get("action") or "")
            rid = str(payload.get("id") or "")
            if action == "browse":
                escolhida = browse_local_folder()
                if escolhida == "unavailable":
                    # sem janela nativa não há diálogo: o cliente pergunta
                    # o caminho à mão (não é um erro, é outro caminho)
                    self._send(200, json.dumps({"ok": True, "unavailable": True}),
                               "application/json")
                    return
                if not escolhida:
                    self._send(200, json.dumps({"ok": True, "cancelled": True}),
                               "application/json")
                    return
                repos, novo = add_repo(escolhida)
                log_event(f"{ip} abriu a pasta de código {escolhida}")
                self._send(200, json.dumps({"ok": True, "repos": repos, "id": novo}),
                           "application/json")
                return
            if action == "add":
                repos, novo = add_repo(payload.get("path"))
                log_event(f"{ip} abriu a pasta de código {payload.get('path')}")
                self._send(200, json.dumps({"ok": True, "repos": repos, "id": novo}),
                           "application/json")
                return
            if action == "remove":
                self._send(200, json.dumps({"ok": True, "repos": remove_repo(rid)}),
                           "application/json")
                return
            if action == "rename":
                self._send(200, json.dumps(
                    {"ok": True, "repos": rename_repo(rid, payload.get("name"))}),
                    "application/json")
                return
            if action == "list":
                self._send(200, json.dumps({"ok": True,
                                            **list_dir(rid, payload.get("path"))}),
                           "application/json")
                return
            if action == "read":
                self._send(200, json.dumps({"ok": True,
                                            **read_text(rid, payload.get("path"))}),
                           "application/json")
                return
            if action == "search":
                self._send(200, json.dumps({"ok": True,
                                            **search_files(rid, payload.get("query"))}),
                           "application/json")
                return
            self._send(400, json.dumps({"ok": False, "error": "ação desconhecida"}),
                       "application/json")
        except ValueError as exc:
            self._send(200, json.dumps({"ok": False, "error": str(exc)}),
                       "application/json")
        except Exception as exc:
            log_event(f"{ip} /api/repo FALHOU: {exc!r}")
            self._send(500, json.dumps({"ok": False, "error": "erro interno"}),
                       "application/json")
        return

    def post_api_bug(self, path, ip):
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

    def post_api_clientlog(self, path, ip):
        # diagnóstico: erros/ações do browser dos utilizadores
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            log_event(f"{ip} [browser] {str(payload.get('msg', ''))[:300]}")
        except Exception:
            pass
        self._send(200, json.dumps({"ok": True}), "application/json")
        return

    def post_api_todo(self, path, ip):
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
                due = normalize_due(payload.get("due"))
                repeat = normalize_repeat(payload.get("repeat"))
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
                    if due:
                        item["due"] = due
                    if repeat:
                        item["repeat"] = repeat
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
                for t in list(todos):
                    if t.get("id") == payload.get("id"):
                        old_col = str(t.get("col") or "todo")
                        t["done"] = not t.get("done")
                        t["col"] = "done" if t["done"] else "todo"
                        sync_todo_timer_with_column(t, old_col, t["col"])
                        if spawn_repeat(todos, t) is not None:
                            result = "repeated"
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
                if spawn_repeat(todos, target) is not None:
                    result = "repeated"
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
                if spawn_repeat(todos, item) is not None:
                    result = "repeated"
            elif action == "delete":
                # o que já estava concluido fica arquivado: sai do quadro,
                # mas continua a contar no relatório do período
                for t in todos:
                    if t.get("id") == payload.get("id"):
                        archive_done_todo(t)
                todos = [t for t in todos if t.get("id") != payload.get("id")]
                log_event(f"{ip} TODO apagado: {payload.get('id')}")
            elif action == "reopen_archived":
                # tira do arquivo e devolve ao quadro, com o tempo que levava
                item = pop_archived(str(payload.get("id") or ""))
                if item is None:
                    raise ValueError("item do arquivo não encontrado")
                item["done"] = False
                item.pop("done_at", None)
                todos.insert(0, item)
                log_event(f"{ip} reabriu do arquivo: {str(item.get('title', ''))[:60]!r}")
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
                restart_todo_timer(target)
            elif action == "set_detail":
                # nota do item (os escritos à mão não têm origem no Excel/CCR
                # onde a nota pudesse viver)
                target = next((t for t in todos if t.get("id") == payload.get("id")), None)
                if target is None:
                    raise ValueError("item TODO não encontrado")
                target["detail"] = str(payload.get("detail") or "").strip()[:1000]
                log_event(f'{ip} TODO nota: {str(target.get("title", "?"))[:60]!r}')
            elif action == "set_due":
                # data-limite do item ("" tira-a)
                target = next((t for t in todos if t.get("id") == payload.get("id")), None)
                if target is None:
                    raise ValueError("item TODO não encontrado")
                raw_due = str(payload.get("due") or "").strip()
                due = normalize_due(raw_due)
                if raw_due and not due:
                    raise ValueError("data inválida (usa AAAA-MM-DD)")
                if due:
                    target["due"] = due
                else:
                    target.pop("due", None)
                # a data escolhida à mão é a que passa a valer: as
                # ocorrências falhadas até aqui deixam de ser cobradas
                target.pop("missed", None)
                log_event(f'{ip} TODO data-limite {due or "(sem)"}: '
                          f'{str(target.get("title", "?"))[:60]!r}')
            elif action == "set_repeat":
                # repetição do item ("" deixa de repetir)
                target = next((t for t in todos if t.get("id") == payload.get("id")), None)
                if target is None:
                    raise ValueError("item TODO não encontrado")
                raw_repeat = str(payload.get("repeat") or "").strip().lower()
                if raw_repeat not in TODO_REPEATS:
                    raise ValueError("repetição inválida")
                repeat = normalize_repeat(raw_repeat)
                if repeat:
                    target["repeat"] = repeat
                else:
                    target.pop("repeat", None)
                    target.pop("missed", None)   # sem repetição não há falhadas
                log_event(f'{ip} TODO repetição {repeat or "(sem)"}: '
                          f'{str(target.get("title", "?"))[:60]!r}')
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

    def post_api_chat(self, path, ip):
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

    def post_api_waiting(self, path, ip):
        # "à espera de alguém" numa linha (ver waiting.js): quem está a
        # segurá-la e até quando é razoável esperar. Enquanto a espera
        # durar, a linha não conta como parada — passado o prazo, volta a
        # contar e aparece no botão "À espera", que é a lista de quem há a
        # cobrar
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            livro = str(payload.get("file") or "")
            sheet = str(payload.get("sheet") or "")
            fn = str(payload.get("fn") or "")
            todo = str(payload.get("todo") or "")
            if not sheet or not fn:
                raise ValueError("linha não identificada")
            waiting = load_waiting()
            found_key, antes = _override_entry(waiting, livro, sheet, fn, todo)
            key = _wb_key(livro, sheet, fn, todo)
            waiting.pop(found_key, None)
            quem = str(payload.get("who") or "").strip()[:80]
            # a marca que sai daqui é a única medida de quanto tempo aquela
            # pessoa levou a devolver a linha: gravar agora ou nunca (ver
            # store.log_waiting_closed). Mudar só o prazo não fecha a espera —
            # fecha-a levantá-la ou passá-la a outra pessoa.
            if isinstance(antes, dict) and str(antes.get("who") or "") not in ("", quem):
                log_waiting_closed(found_key or key, antes)
            if quem:
                ate = str(payload.get("until") or "").strip()[:10]
                if ate and not DUE_RE.match(ate):
                    raise ValueError("data inválida (usa AAAA-MM-DD)")
                entrada = {"who": quem,
                           "since": str(payload.get("since") or "").strip()[:10]
                           or datetime.now().strftime("%Y-%m-%d")}
                if ate:
                    entrada["until"] = ate
                # o que a está a segurar, se for uma coisa e não só alguém
                bloqueio = normalize_blocker(payload.get("blocker"))
                if bloqueio:
                    entrada["blocker"] = bloqueio
                waiting[key] = entrada
                log_event(f"{ip} à espera de {quem!r} em {fn[:60]!r}"
                          f'{" até " + ate if ate else ""}')
            else:
                # sem nome é o mesmo que deixar de esperar
                waiting.pop(key, None)
                log_event(f"{ip} deixou de esperar em {fn[:60]!r}")
            save_waiting(waiting)
            # com a partilha ligada, a marca passa a valer para a equipa (só
            # as esperas, nada mais — ver team.py)
            publish_waiting(payload.get("person"), waiting)
            self._send(200, json.dumps({"ok": True}), "application/json")
        except Exception as exc:
            log_event(f"{ip} /api/waiting FALHOU: {exc}")
            self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
        return

    def post_api_notify_config(self, path, ip):
        # o endereço do webhook só se escreve a partir deste PC (é ele que
        # manda os avisos), tal como o token do Jira
        if not _is_local(ip):
            self._send(403, json.dumps({"ok": False, "error": "só a partir deste computador"}),
                       "application/json")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            cfg = save_notify_config(payload.get("url"), payload.get("enabled", True),
                                     payload.get("toasts"))
            log_event(f"{ip} webhook de avisos {'ligado' if cfg['enabled'] else 'desligado'}")
            self._send(200, json.dumps({"ok": True, **cfg, "canEdit": True}),
                       "application/json")
        except Exception as exc:
            log_event(f"{ip} configuração do webhook FALHOU: {exc}")
            self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
        return

    def post_api_notify(self, path, ip):
        # um aviso para fora (ver notify.js): sem webhook configurado não
        # sai nada — a resposta diz "sent: false" e a app segue
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            enviado = send_webhook(payload.get("text"), payload.get("title"))
            if enviado:
                log_event(f"{ip} aviso enviado para o webhook")
            # o aviso do Windows é levantado por ESTE processo, por isso vale
            # também com a janela fechada (ver notify.send_toast). Os botões
            # abrem um endereço da app no browser.
            botoes = [(str(b.get("label") or "")[:60], str(b.get("url") or "")[:400])
                      for b in (payload.get("buttons") or [])
                      if isinstance(b, dict) and b.get("label") and b.get("url")]
            aviso = send_toast(payload.get("text"), payload.get("title"), botoes)
            self._send(200, json.dumps({"ok": True, "sent": enviado, "toast": aviso}),
                       "application/json")
        except Exception as exc:
            log_event(f"{ip} aviso para o webhook FALHOU: {exc}")
            self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
        return

    def post_api_export(self, path, ip):
        # levar o período à vista para um ficheiro (CSV/markdown). O
        # ficheiro nasce no computador onde a app corre — quem chega pela
        # rede local recebe o caminho, mas quem o abre é este PC
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            out = write_export(str(payload.get("kind") or ""),
                               since=str(payload.get("since") or ""),
                               until=str(payload.get("until") or ""),
                               days=int(payload.get("days") or 7),
                               lang=str(payload.get("lang") or "pt"),
                               books=payload.get("books"))
            # abrir a pasta é uma comodidade de quem está ao computador;
            # pela rede não faria nada de útil (abriria aqui, não lá)
            if _is_local(ip) and payload.get("reveal"):
                try:
                    os.startfile(EXPORT_DIR)
                except OSError:
                    pass
            log_event(f"{ip} exportou {out['kind']}: {out['name']} ({out['rows']} linhas)")
            self._send(200, json.dumps({"ok": True, **out}), "application/json")
        except Exception as exc:
            log_event(f"{ip} /api/export FALHOU: {exc!r}")
            self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
        return

    def post_api_window(self, path, ip):
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

    def post_api_team_filters(self, path, ip):
        if not _is_local(ip):
            self._send(403, json.dumps({"ok": False,
                                        "error": "só a partir deste computador"}),
                       "application/json")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            quantos = publish_filters(payload.get("person"), payload.get("sets"))
            if quantos is None:
                raise ValueError("a pasta partilhada não está ao alcance "
                                 "(ou é só de leitura)")
            log_event(f"{ip} publicou {quantos} conjunto(s) de filtros")
            self._send(200, json.dumps({"ok": True, "published": quantos}),
                       "application/json")
        except Exception as exc:
            self._send(400, json.dumps({"ok": False, "error": str(exc)}),
                       "application/json")
        return

    def get_api_team_messages(self, parsed, ip):
        # os recados que os outros deixaram nas linhas, já com o recibo de
        # leitura cruzado (ver team.load_team_messages)
        q = parse_qs(parsed.query)
        pessoa = (q.get("person") or [""])[0]
        self._send(200, json.dumps({
            "ok": True,
            "messages": load_team_messages(pessoa),
            "handoffs": load_team_handoffs(pessoa),
            # o outro lado das esperas: as marcas dos colegas que me cobram a
            # mim (ver team.team_waiting_on)
            "waiting_me": team_waiting_on(pessoa),
        }), "application/json")

    def post_api_team_messages(self, path, ip):
        # publicar os MEUS recados (substitui os anteriores) e/ou as bolas que
        # passei. Escrita para fora desta máquina: só a partir deste computador,
        # como a publicação dos filtros.
        if not _is_local(ip):
            self._send(403, json.dumps({"ok": False,
                                        "error": "só a partir deste computador"}),
                       "application/json")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            pessoa = payload.get("person")
            saida = {"ok": True}
            if isinstance(payload.get("messages"), list):
                quantos = publish_messages(pessoa, payload["messages"])
                if quantos is None:
                    raise ValueError("a pasta partilhada não está ao alcance "
                                     "(ou é só de leitura)")
                saida["messages"] = quantos
            if isinstance(payload.get("handoffs"), list):
                quantos = publish_handoffs(pessoa, payload["handoffs"])
                if quantos is None:
                    raise ValueError("a pasta partilhada não está ao alcance "
                                     "(ou é só de leitura)")
                saida["handoffs"] = quantos
            log_event(f"{ip} publicou recados/bolas: {saida}")
            self._send(200, json.dumps(saida), "application/json")
        except Exception as exc:
            self._send(400, json.dumps({"ok": False, "error": str(exc)}),
                       "application/json")
        return

    def post_api_remote(self, path, ip):
        # o comando do telemóvel: além de mexer na lista pelos caminhos de
        # sempre, manda as janelas do computador saltarem para o mesmo sítio.
        # Os avisos já levam a janela de origem, por isso quem manda não se
        # recarrega por causa do próprio clique (ver events.set_origin).
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            acao = str(payload.get("action") or "")[:40]
            if not acao:
                raise ValueError("sem ação")
            events.publish("command", action=acao,
                           ref=str(payload.get("ref") or "")[:400],
                           label=str(payload.get("label") or "")[:200])
            self._send(200, json.dumps({"ok": True}), "application/json")
        except Exception as exc:
            self._send(400, json.dumps({"ok": False, "error": str(exc)}),
                       "application/json")
        return

    def post_api_team_ack(self, path, ip):
        # o recibo: abri o recado, ou aceitei a bola. Escrito por um ato
        # explícito e nunca por passar os olhos pela lista (ver team.ack_seen)
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            ok = ack_seen(payload.get("person"),
                          payload.get("seen") or [],
                          payload.get("taken") or [])
            self._send(200, json.dumps({"ok": bool(ok)}), "application/json")
        except Exception as exc:
            self._send(400, json.dumps({"ok": False, "error": str(exc)}),
                       "application/json")
        return

    def get_api_team_capsules(self, parsed, ip):
        # os kits de chegada publicados (ver team.load_capsules)
        self._send(200, json.dumps({"ok": True, "capsules": load_capsules()}),
                   "application/json")

    def post_api_team_capsule(self, path, ip):
        if not _is_local(ip):
            self._send(403, json.dumps({"ok": False,
                                        "error": "só a partir deste computador"}),
                       "application/json")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            # a página do estado do projeto é escrita pela app, não por quem
            # publica: é a mesma conta do relatório do período (ver report.py)
            capsula = dict(payload.get("capsule") or {})
            if not capsula.get("brief"):
                try:
                    capsula["brief"] = build_report(days=14, lang="pt")["markdown"]
                except Exception:
                    capsula["brief"] = ""
            if publish_capsule(payload.get("person"), capsula) is None:
                raise ValueError("a pasta partilhada não está ao alcance "
                                 "(ou é só de leitura), ou o kit vinha vazio")
            log_event(f"{ip} publicou o kit de chegada")
            self._send(200, json.dumps({"ok": True}), "application/json")
        except Exception as exc:
            self._send(400, json.dumps({"ok": False, "error": str(exc)}),
                       "application/json")
        return

    def post_api_team_config(self, path, ip):
        # ligar/desligar a partilha das esperas: é escrita para fora desta
        # máquina, por isso só a partir dela (como o webhook e o aviso)
        if not _is_local(ip):
            self._send(403, json.dumps({"error": "só a partir deste computador"}),
                       "application/json")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            partilhar = bool(payload.get("share_waiting"))
            cfg = save_team_config(partilhar)
            pessoa = str(payload.get("person") or "")
            if partilhar:
                escrito = publish_waiting(pessoa, load_waiting())
            else:
                # desligar não deixa a última publicação lá para sempre
                unpublish_waiting(pessoa)
                escrito = None
            log_event(f"{ip} partilha das esperas "
                      f"{'ligada' if partilhar else 'desligada'}")
            self._send(200, json.dumps({"ok": True, **cfg, "canEdit": True,
                                        "shareFound": team_dir() is not None,
                                        "published": bool(escrito)}),
                       "application/json")
        except Exception as exc:
            log_event(f"{ip} partilha das esperas FALHOU: {exc!r}")
            self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
        return

    def post_api_backups(self, path, ip):
        # guardar agora / repor uma cópia do estado local. Repor por cima do
        # estado é uma coisa séria: só a partir deste PC, como o aviso e o
        # Jira. O que estava em vigor fica também guardado, para um restauro
        # pedido por engano se poder desfazer (ver statefile.restore_backup).
        if not _is_local(ip):
            log_event(f"{ip} tentou mexer nas cópias do estado - recusado")
            self._send(403, json.dumps({"error": "só a partir deste computador"}),
                       "application/json")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            action = str(payload.get("action") or "save")
            if action == "restore":
                feito = restore_backup(payload.get("file"))
                log_event(f"{ip} repôs {feito['target']} da cópia {feito['file']}")
                self._send(200, json.dumps({"ok": True, "restored": feito,
                                            "backups": list_backups(),
                                            "canRestore": True}),
                           "application/json")
                return
            feitos = backup_now()
            log_event(f"{ip} guardou cópia do estado ({len(feitos)} ficheiro(s))")
            self._send(200, json.dumps({"ok": True, "saved": feitos,
                                        "backups": list_backups(),
                                        "canRestore": True}), "application/json")
        except Exception as exc:
            log_event(f"{ip} cópias do estado FALHOU: {exc!r}")
            self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
        return

    def post_api_announcement(self, path, ip):
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

    def post_api_jira_config(self, path, ip):
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

    def post_api_jira_create(self, path, ip):
        # nasce uma issue a partir de um item do quadro (ou de uma CCR): a
        # issue é criada no Jira e, com item_id, fica logo ligada ao item —
        # é a mesma ligação do jira_link, feita sem passar pelo Jira à mão
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            issue = create_issue(payload.get("project"), payload.get("summary"),
                                 payload.get("type"), payload.get("description"))
            item_id = payload.get("item_id")
            todos = None
            if item_id:
                todos = load_todo()
                alvo = next((t for t in todos if t.get("id") == item_id), None)
                if alvo is None:
                    raise ValueError("item TODO não encontrado")
                alvo["jiraIssues"] = [issue]
                todos = [normalize_todo_item(t) for t in todos if normalize_todo_item(t)]
                save_todo(todos)
            log_event(f'{ip} criou a issue {issue["key"]} no Jira'
                      + (f" e ligou-a a {item_id}" if item_id else ""))
            self._send(200, json.dumps({"ok": True, "issue": issue,
                                        "todo": todos}), "application/json")
        except Exception as exc:
            log_event(f"{ip} criação de issue no Jira FALHOU: {exc}")
            self._send(400, json.dumps({"ok": False, "error": str(exc)}), "application/json")
        return

    def post_api_jira_worklog_bulk(self, path, ip):
        # registar de uma vez o que a folha de horas já sabe (ver
        # report.timesheet_lines): uma viagem em vez de N pelo diálogo do
        # esforço. Cada linha é registada por si — uma que falhe não leva as
        # outras atrás, e a resposta diz o que foi e o que não foi.
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            entradas = payload.get("entries")
            if not isinstance(entradas, list) or not entradas:
                raise ValueError("nada para registar")
            if len(entradas) > 60:
                raise ValueError("demasiadas linhas de uma vez (máximo 60)")
            todos = load_todo()
            resultados, feitos = [], 0
            for entrada in entradas:
                if not isinstance(entrada, dict):
                    continue
                resultado = self._worklog_one(entrada, todos)
                resultados.append(resultado)
                if resultado.get("ok"):
                    feitos += 1
            if feitos:
                todos = [normalize_todo_item(t) for t in todos
                         if normalize_todo_item(t)]
                save_todo(todos)
            log_event(f"{ip} registou {feitos}/{len(resultados)} linhas no Jira")
            self._send(200, json.dumps({"ok": True, "results": resultados,
                                        "logged": feitos,
                                        "todo": todos if feitos else None}),
                       "application/json")
        except Exception as exc:
            log_event(f"{ip} registo em lote no Jira FALHOU: {exc}")
            self._send(400, json.dumps({"ok": False, "error": str(exc)}),
                       "application/json")
        return

    def post_api_notepad(self, path, ip):
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

    def post_api_overrides_clear(self, path, ip):
        # Com um livro no pedido descarta-se só o dele: o botão vive ao lado
        # do Push de UM livro e o número que mostra é o desse livro (ver
        # pending_for_book) — apagar em silêncio o que estava por enviar
        # noutro separador era descartar trabalho que ninguém pediu.
        # Sem livro (linha de comandos, testes) continua a apagar tudo.
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        except (TypeError, ValueError):
            payload = {}
        alvo = str((payload or {}).get("file") or "")
        if alvo:
            restantes = discard_overrides(alvo)
            log_event(f"{ip} descartou as alterações locais de "
                      f"{os.path.basename(alvo)} ({restantes} noutros livros)")
            self._send(200, json.dumps({"ok": True, "pending_all": restantes}),
                       "application/json")
            return
        save_overrides({})
        log_event(f"{ip} descartou todas as alterações locais de estado")
        self._send(200, json.dumps({"ok": True, "pending_all": 0}), "application/json")
        return

    def post_api_push(self, path, ip):
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

    def post_api_feedback(self, path, ip):
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

    def get_api_feedback_pending(self, parsed, ip):
        # o feedback que ficou neste PC por entregar: sem isto só se via o
        # reporte que acabou de ser escrito, e os anteriores ficavam esquecidos
        # numa pasta que ninguém abre (ver feedback.pending_list)
        try:
            itens = pending_list()
            self._send(200, json.dumps({"ok": True, "items": itens,
                                        # abrir a pasta das imagens só faz
                                        # sentido para quem está a este teclado
                                        "canReveal": _is_local(ip)}),
                       "application/json")
        except Exception as exc:
            log_event(f"{ip} /api/feedback/pending FALHOU: {exc!r}")
            self._send(400, json.dumps({"ok": False, "error": str(exc)}),
                       "application/json")
        return

    def post_api_feedback_pending(self, path, ip):
        # o que se faz a um feedback pendente: tentar entregá-lo outra vez,
        # abrir a pasta das imagens (que a issue do GitHub não recebe por URL)
        # ou descartá-lo, quando a issue já foi aberta à mão
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            action = str(payload.get("action") or "").strip()
            nome = str(payload.get("name") or "").strip()
            if action == "flush":
                entregues = flush_pending()
                log_event(f"{ip} tentou entregar o feedback pendente: {entregues}")
                self._send(200, json.dumps({"ok": True, "delivered": entregues,
                                            "items": pending_list()}),
                           "application/json")
                return
            if action == "reveal":
                if not _is_local(ip):
                    raise ValueError("a pasta só se abre no computador da app")
                reveal_pending(nome)
                self._send(200, json.dumps({"ok": True}), "application/json")
                return
            if action == "drop":
                drop_pending(nome)
                self._send(200, json.dumps({"ok": True, "items": pending_list()}),
                           "application/json")
                return
            raise ValueError(f"ação desconhecida: {action[:30]!r}")
        except Exception as exc:
            log_event(f"{ip} /api/feedback/pending FALHOU: {exc!r}")
            self._send(400, json.dumps({"ok": False, "error": str(exc)}),
                       "application/json")
        return

    def post_api_ccrs(self, path, ip):
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            action = payload.get("action", "update")
            ccr_id = str(payload.get("id", "")).strip()
            if not ccr_id:
                raise ValueError("ID da CCR vazio")
            ccrs = load_ccrs()
            if action == "delete":
                # o que tiver trabalho feito vai para o arquivo antes de sair da
                # vista: apagar arruma a lista, nao apaga o registo
                archive_ccr(ccr_id, ccrs.get(ccr_id))
                ccrs.pop(ccr_id, None)
                log_event(f"{ip} apagou a CCR {ccr_id}")
            elif action == "add":
                if ccr_id not in ccrs:
                    ccrs[ccr_id] = {"checks": {},
                                    "created": datetime.now().strftime("%d/%m %H:%M"),
                                    # o `created` antigo nao leva o ano, e sem
                                    # ano nao se consegue dizer a idade
                                    "created_iso": datetime.now().strftime("%Y-%m-%d")}
                    log_event(f"{ip} adicionou a CCR {ccr_id}")
            else:
                entry = ccrs.setdefault(ccr_id, {
                    "created": datetime.now().strftime("%d/%m %H:%M"),
                    "created_iso": datetime.now().strftime("%Y-%m-%d")})
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

    def post_api_notes_clear(self, path, ip):
        save_notes({})
        log_event(f"{ip} limpou TODAS as notas de execução")
        self._send(200, json.dumps({"ok": True}), "application/json")
        return

    def post_api_note(self, path, ip):
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

    def post_api_app_update(self, path, ip):
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

    def post_api_cellcat_update(self, path, ip):
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

    def post_api_history_undo(self, path, ip):
        # desfazer um ENVIO inteiro: o histórico já sabe o antes e o depois
        # de cada célula que aquele Push escreveu (o `batch` dos eventos), e
        # aqui volta-se ao antes em todas de uma vez. Como qualquer
        # alteração de estado, fica local (✎) à espera do Push seguinte —
        # nada aqui escreve no Excel.
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            eventos = batch_events(payload.get("batch"))
            if not eventos:
                raise ValueError("envio desconhecido (ou já fora do histórico)")
            overrides = load_overrides()
            feitos, falhas = 0, []
            for e in eventos:
                pedido = {
                    "file": e.get("book", ""), "sheet": e.get("sheet", ""),
                    "fn": e.get("fn", ""), "todo": e.get("todo", ""),
                    "column": e.get("col", ""),
                    "value": str(e.get("from") or ""),
                    # a base é o valor que o Push deixou na folha: se
                    # entretanto alguém mexeu na célula, o Push desiste dela
                    # em vez de calcar trabalho de outra pessoa
                    "base": str(e.get("to") or ""),
                }
                try:
                    queue_column_override(overrides, pedido)
                    feitos += 1
                except Exception as exc:
                    falhas.append(f'{e.get("fn", "?")} [{e.get("col", "?")}]: {exc}')
            save_overrides(overrides)
            lote = str(payload.get("batch") or "")
            log_event(f"{ip} desfez o envio {lote} "
                      f"({feitos} célula(s), à espera de Push)"
                      + (f" | {len(falhas)} falharam" if falhas else ""))
            self._send(200, json.dumps({"ok": True, "queued": feitos,
                                        "failed": falhas[:10]}), "application/json")
        except Exception as exc:
            log_event(f"{ip} desfazer envio FALHOU: {exc}")
            self._send(400, json.dumps({"ok": False, "error": str(exc)}),
                       "application/json")
        return

    def post_api_update_bulk(self, path, ip):
        # o mesmo estado em muitas linhas de uma vez (ver openBulkStatus,
        # static/js/tasks.js): tudo fica local (✎) à espera do Push, como
        # uma alteração feita à mão — só se poupa a ida e volta por linha
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            itens = payload.get("items")
            if not isinstance(itens, list) or not itens:
                raise ValueError("nada para alterar")
            if len(itens) > BULK_MAX:
                raise ValueError(f"demasiadas linhas de uma vez (máximo {BULK_MAX})")
            overrides = load_overrides()
            feitos, falhas = 0, []
            for item in itens:
                if not isinstance(item, dict):
                    continue
                pedido = {**item,
                          "file": payload.get("file", ""),
                          "sheet": payload.get("sheet", ""),
                          "column": payload.get("column", ""),
                          "value": payload.get("value")}
                try:
                    queue_column_override(overrides, pedido)
                    feitos += 1
                except Exception as exc:
                    # uma linha que não dê não deve levar as outras atrás
                    falhas.append(f'{item.get("fn", "?")}: {exc}')
            save_overrides(overrides)
            log_event(f"{ip} estado em massa (local, à espera de Push): "
                      f'{feitos} linha(s) [{payload.get("column")}] -> '
                      f'{payload.get("value")!r}'
                      + (f" | {len(falhas)} falharam" if falhas else ""))
            self._send(200, json.dumps({"ok": True, "queued": feitos,
                                        "failed": falhas[:10]}),
                       "application/json")
        except Exception as exc:
            log_event(f"{ip} estado em massa FALHOU: {exc}")
            self._send(400, json.dumps({"ok": False, "error": str(exc)}),
                       "application/json")
        return



def queue_column_override(overrides, payload):
    """Põe (ou tira) uma alteração local numa célula, no dicionário recebido.

    É o miolo do /api/update, à parte para o /api/update/bulk poder fazer o
    mesmo a muitas linhas e gravar o ficheiro uma vez só. Devolve o texto para
    o registo. Nada aqui escreve no Excel: isso é o /api/push."""
    column = payload["column"]
    if column not in ("Status TC", "Status TP", "OBS", "Function/TC", "To Do"):
        headers = known_headers(payload.get("file", ""), payload.get("sheet", ""))
        if not headers or column not in headers:
            raise ValueError(f"coluna inválida: {column}")
    workbook_id = payload.get("file", "")
    sheet, fn, todo = payload["sheet"], payload.get("fn", ""), payload.get("todo", "")
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
    return (f'{payload.get("fn", "?")} [{column}] -> {payload["value"]!r}'
            if payload.get("value") is not None
            else f'{payload.get("fn", "?")} [{column}] reposto para o valor da folha')


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


# ---------------------------------------------------------------------------
# O vigia: os avisos que só fazem sentido com a app FECHADA
#
# Os avisos do browser (static/js/notify.js) precisam de uma janela aberta. Este
# fio corre no processo do servidor — que fica de pé com a janela fechada — e
# levanta um aviso do Windows nos dois casos em que ninguém está a olhar:
#
#   - um cronómetro esquecido a correr (o caso que enche a folha de horas de
#     dias de 9 horas);
#   - alterações na folha nas linhas de quem usa esta instalação, desde a última
#     vez que o vigia falou.
#
# Só faz alguma coisa com os avisos do Windows LIGADOS (Definições → Avisos),
# que estão desligados por omissão. Sem isso o fio acorda, não vê nada para
# fazer, e volta a dormir.

VIGIA_INTERVALO = 15 * 60          # de quanto em quanto tempo acorda
VIGIA_CRONOMETRO_H = 3             # horas a correr a partir das quais avisa
VIGIA_SILENCIO = 6 * 3600          # não repete o mesmo aviso antes disto


def _vigia_url(fragmento=""):
    """Um endereço desta app para o botão do aviso abrir."""
    return f"http://127.0.0.1:{config.SERVER_PORT}/{fragmento}"


def _vigia_cronometro(ultimo):
    """Aviso do cronómetro esquecido a correr, ou None."""
    agora = time.time()
    for item in load_todo():
        if not isinstance(item, dict) or item.get("timer_started") is None:
            continue
        try:
            desde = float(item.get("timer_started")) / 1000.0
        except (TypeError, ValueError):
            continue
        horas = (agora - desde) / 3600.0
        if horas < VIGIA_CRONOMETRO_H:
            continue
        chave = f"timer:{item.get('id')}"
        if agora - ultimo.get(chave, 0) < VIGIA_SILENCIO:
            continue
        ultimo[chave] = agora
        return (chave,
                msg("toast_timer_title", "pt"),
                msg("toast_timer", "pt", h=int(horas),
                    t=str(item.get("title") or "")[:60]),
                [(msg("toast_timer_btn", "pt"), _vigia_url("#todo"))])
    return None


def _vigia_folha(ultimo):
    """Aviso do que mexeu na folha desde a última vez, ou None."""
    agora = time.time()
    if agora - ultimo.get("sheet", 0) < VIGIA_SILENCIO:
        return None
    desde = ultimo.get("sheet_ts") or (
        datetime.now() - timedelta(seconds=VIGIA_INTERVALO * 2)).isoformat()
    eventos = [e for e in recent_events(days=2, limit=500)
               if str(e.get("ts") or "") > desde and e.get("via") != "app"]
    ultimo["sheet_ts"] = datetime.now().isoformat()
    if not eventos:
        return None
    ultimo["sheet"] = agora
    linhas = {str(e.get("fn") or e.get("xlrow") or "") for e in eventos}
    return ("sheet",
            msg("toast_sheet_title", "pt"),
            msg("toast_sheet", "pt", n=len(eventos), r=len(linhas)),
            [(msg("toast_sheet_btn", "pt"), _vigia_url())])


def _vigia():
    """O fio do vigia: acorda, olha, e cala-se outra vez."""
    ultimo = {}
    while True:
        time.sleep(VIGIA_INTERVALO)
        try:
            if not load_notify_config().get("toasts"):
                continue
            for olhar in (_vigia_cronometro, _vigia_folha):
                aviso = olhar(ultimo)
                if not aviso:
                    continue
                _chave, titulo, texto, botoes = aviso
                if send_toast(texto, titulo, botoes):
                    log_event(f"vigia: aviso do Windows levantado ({_chave})")
        except Exception as exc:      # um vigia que rebenta deixa de vigiar
            log_event(f"vigia falhou (segue): {exc!r}")


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
    # o vigia dos avisos do Windows (desligados por omissão): é o que faz um
    # cronómetro esquecido a correr ser dito com a janela fechada
    threading.Thread(target=_vigia, daemon=True).start()
    # o farol: um ícone ao lado do relógio com o estado da app (ver tray.py).
    # Nunca levanta exceção — sem ele a app é exatamente o que era.
    tray.start(url)
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
