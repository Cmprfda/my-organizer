# -*- coding: utf-8 -*-
"""Assistente: perguntas e ações sobre o que a app já tem à frente.

Duas regras desenham este módulo:

1. **Os dados vêm do cliente, não da folha.** O contexto (linhas dos livros
   abertos, Por fazer, CCRs, notas) chega no pedido, tirado do que o browser já
   tem em memória — o mesmo material da pesquisa global (static/js/search.js).
   Este módulo NUNCA chama `build_payload`/`read_sheet`: uma pergunta ao
   assistente não pode abrir o Excel por COM nem ir ao OneDrive.

2. **As escritas são propostas, não escritas.** Um pedido que muda dados
   devolve uma `action` com o que fazer; é o cliente que a executa, depois de
   confirmada, pelos caminhos que já existem (`/api/todo`, `/api/update`,
   `/api/note`). Assim não há uma segunda via para gravar as mesmas coisas, e
   nada chega ao Excel sem o Push de sempre.

O "motor" é escolhido em `chat_config.json` (estado local, fora das releases):

    {"engine": "local"}                     # por omissão
    {"engine": "llm", "llm": {...}}         # ver _llm_reply

O motor `local` é determinístico: reconhece um conjunto definido de perguntas e
ordens (o intent `help` lista-as). O motor `llm` responde às perguntas escritas
à maneira de cada um, com FERRAMENTAS sobre o mesmo retrato (procurar, listar
linhas, listar itens, contas — ver LLM_TOOLS): assim uma folha grande é
respondida por inteiro e não só pelas primeiras linhas. Sem SDK, sem chave ou
sem rede, a resposta cai no motor local com um aviso.
"""

import json
import os
import re
from datetime import datetime

from .config import HERE
from .report import build_report
from .text import normalize

CHAT_CONFIG_FILE = os.path.join(HERE, "chat_config.json")

# limites do contexto: o pedido vem do browser (e da LAN), por isso nada aqui
# confia no tamanho do que chega
MAX_BOOKS = 4
MAX_ROWS = 800
MAX_TODOS = 300
MAX_CCRS = 200
MAX_NOTES = 200
MAX_TEXT = 400
# quantos itens uma resposta lista (o cabeçalho diz quando corta)
MAX_HITS = 8


class ChatEngineError(Exception):
    """O motor escolhido não pode responder (ex.: LLM sem configuração)."""


# ---------------------------------------------------------------- rótulos
# (o resto da app usa i18n.msg; aqui são muitos e só servem para este ficheiro)
LBL = {
    "empty": ("Escreve uma pergunta.", "Type a question."),
    "no_data": ("Ainda não tenho nada à frente: abre um livro ou uma vista e pergunta outra vez.",
                "I have nothing in front of me yet: open a workbook or a view and ask again."),
    "help_intro": ("Respondo sobre o que a app já tem aberto e proponho alterações locais. Sei fazer:",
                   "I answer about what the app already has open and propose local changes. I can:"),
    "help_read": ("**Perguntas**\n"
                  "- `as minhas tarefas` · `tarefas em curso` · `tarefas por fechar`\n"
                  "- `tarefas paradas` — sem mexer há mais de N dias\n"
                  "- `alterações por enviar` — o que espera pelo Push (✎)\n"
                  "- `quantas tarefas em curso?` · `quantos itens por fazer?`\n"
                  "- `ccrs` · `ccrs prontas a fechar`\n"
                  "- `o que tenho por fazer` · `em curso`\n"
                  "- `notas sobre <texto>`\n"
                  "- `relatório da semana` · `o meu dia` · `resumo`\n"
                  "- `o que faço a seguir` · `urgentes`\n"
                  "- `estatísticas` · `linhas sem estado`\n"
                  "- `livros abertos`\n"
                  "- qualquer outro texto procura em tudo o que está aberto",
                  "**Questions**\n"
                  "- `my tasks` · `tasks in progress` · `unfinished tasks`\n"
                  "- `stale tasks` — untouched for more than N days\n"
                  "- `pending changes` — what is waiting for the Push (✎)\n"
                  "- `how many tasks in progress?` · `how many todo items?`\n"
                  "- `ccrs` · `ccrs ready to close`\n"
                  "- `what do I have to do` · `in progress`\n"
                  "- `notes about <text>`\n"
                  "- `week report` · `summary`\n"
                  "- `what next` · `urgent`\n"
                  "- `statistics` · `rows with no status`\n"
                  "- `open workbooks`\n"
                  "- any other text searches everything that is open"),
    "help_write": ("**Alterações** (peço sempre confirmação; nada vai ao Excel sem o Push)\n"
                   "- `adiciona à lista: <tarefa>`\n"
                   "- `marca como feito: <tarefa>`\n"
                   "- `estado de <tarefa> para <valor>` (ou `estado tp de … para …`)\n"
                   "- `nota em <tarefa>: <texto>` · `obs em <tarefa>: <texto>`\n"
                   "- `move <item> para em curso` · `prioridade de <item> para alta`\n"
                   "- `remove da lista: <item>`\n"
                   "- `cria uma nota: <título>` · `cria uma nota com as minhas tarefas paradas`",
                   "**Changes** (always confirmed first; nothing reaches Excel without the Push)\n"
                   "- `add to my list: <task>`\n"
                   "- `mark as done: <task>`\n"
                   "- `status of <task> to <value>` (or `status tp of … to …`)\n"
                   "- `note on <task>: <text>` · `obs on <task>: <text>`\n"
                   "- `move <item> to in progress` · `priority of <item> to high`\n"
                   "- `remove from my list: <item>`\n"
                   "- `create a note: <title>` · `create a note with my stale tasks`"),
    "tasks_none": ("Nenhuma tarefa corresponde a isso no que está aberto.",
                   "No task matches that in what is open."),
    "tasks_head": ("{n} tarefa(s) {what}:", "{n} task(s) {what}:"),
    "what_all": ("no que está aberto", "in what is open"),
    "what_mine": ("tuas", "of yours"),
    "what_open": ("por fechar", "unfinished"),
    "what_doing": ("em curso", "in progress"),
    "what_done": ("concluídas", "done"),
    "what_blocked": ("bloqueadas", "blocked"),
    "what_stale": ("paradas há {d} dias ou mais", "stale for {d} days or more"),
    "what_text": ("com \"{q}\"", "matching \"{q}\""),
    "showing": ("(mostro os primeiros {n})", "(showing the first {n})"),
    "stale_none": ("Nada parado há {d} dias ou mais. 👌",
                   "Nothing stale for {d} days or more. 👌"),
    "stale_no_history": ("Ainda não tenho histórico para medir tarefas paradas — a app precisa "
                         "de ler a folha algumas vezes primeiro.",
                         "I have no history yet to measure stale tasks — the app needs to read "
                         "the sheet a few times first."),
    "pending_none": ("Não há alterações locais à espera do Push.",
                     "There are no local changes waiting for the Push."),
    "pending_head": ("{n} alteração(ões) local(is) à espera do Push (✎):",
                     "{n} local change(s) waiting for the Push (✎):"),
    "pending_more": ("(o servidor tem {n} no total — as outras são de linhas ou livros "
                     "que não estão à vista)",
                     "(the server has {n} in total — the others belong to rows or workbooks "
                     "that are not in view)"),
    "todos_none": ("A tua lista Por fazer está vazia.", "Your TODO list is empty."),
    "todos_head": ("{n} item(ns) em Por fazer:", "{n} item(s) in your TODO list:"),
    "todos_none_col": ("Nada em \"{c}\".", "Nothing in \"{c}\"."),
    "ccrs_none": ("Sem CCRs.", "No CCRs."),
    "ccrs_head": ("{n} CCR(s):", "{n} CCR(s):"),
    "ccrs_ready": ("{n} CCR(s) pronta(s) a fechar:", "{n} CCR(s) ready to close:"),
    "ccrs_ready_none": ("Nenhuma CCR está pronta a fechar.", "No CCR is ready to close."),
    "notes_none": ("Não encontrei notas com isso.", "I found no notes matching that."),
    "notes_head": ("{n} nota(s):", "{n} note(s):"),
    "count_tasks": ("{n} tarefa(s) {what}.", "{n} task(s) {what}."),
    "count_todos": ("{n} item(ns) em Por fazer ({open} por fechar).",
                    "{n} item(s) in the TODO list ({open} unfinished)."),
    "count_ccrs": ("{n} CCR(s), {ready} pronta(s) a fechar.",
                   "{n} CCR(s), {ready} ready to close."),
    "count_notes": ("{n} nota(s) no quadro.", "{n} note(s) on the board."),
    "search_none": ("Não encontrei nada com \"{q}\". Escreve `ajuda` para ver o que sei fazer.",
                    "I found nothing matching \"{q}\". Type `help` to see what I can do."),
    "search_head": ("Encontrei isto com \"{q}\":", "Here is what I found for \"{q}\":"),
    "summary": ("Neste momento:", "Right now:"),
    "sum_books": ("- {n} livro(s) aberto(s): {names}", "- {n} workbook(s) open: {names}"),
    "sum_rows": ("- {n} linha(s) à vista, {mine} tua(s), {open} por fechar",
                 "- {n} row(s) in view, {mine} yours, {open} unfinished"),
    "sum_pending": ("- {n} alteração(ões) à espera do Push (✎)",
                    "- {n} change(s) waiting for the Push (✎)"),
    "sum_todos": ("- {n} item(ns) em Por fazer ({doing} em curso)",
                  "- {n} item(s) in the TODO list ({doing} in progress)"),
    "sum_ccrs": ("- {n} CCR(s), {ready} pronta(s) a fechar", "- {n} CCR(s), {ready} ready to close"),
    "sum_notes": ("- {n} nota(s) no quadro", "- {n} note(s) on the board"),
    "report_fail": ("Não consegui montar o relatório.", "I could not build the report."),
    "need_title": ("Diz-me o que acrescentar, por exemplo `adiciona à lista: rever o TC-42`.",
                   "Tell me what to add, for example `add to my list: review TC-42`."),
    "need_note": ("Escreve `nota em <tarefa>: <texto>`.", "Type `note on <task>: <text>`."),
    "todo_notfound": ("Não encontrei \"{q}\" na tua lista Por fazer.",
                      "I could not find \"{q}\" in your TODO list."),
    "todo_ambiguous": ("\"{q}\" dá em mais do que um item: {names}. Sê mais específico.",
                       "\"{q}\" matches more than one item: {names}. Be more specific."),
    "todo_already": ("\"{t}\" já está concluído.", "\"{t}\" is already done."),
    "task_notfound": ("Não encontrei a tarefa \"{q}\" nos livros abertos.",
                      "I could not find the task \"{q}\" in the open workbooks."),
    "task_ambiguous": ("\"{q}\" dá em {n} linhas ({names}). Sê mais específico.",
                       "\"{q}\" matches {n} rows ({names}). Be more specific."),
    "ask_add": ("Acrescento \"{t}\" à tua lista Por fazer?",
                "Shall I add \"{t}\" to your TODO list?"),
    "ask_done": ("Marco \"{t}\" como concluído?", "Shall I mark \"{t}\" as done?"),
    "ask_status": ("Ponho **{col}** de \"{t}\" em \"{v}\"? Fica só local (✎) até carregares em Enviar.",
                   "Shall I set **{col}** of \"{t}\" to \"{v}\"? It stays local (✎) until you Push."),
    "ask_note": ("Escrevo esta nota de execução em \"{t}\"?\n\n> {n}",
                 "Shall I write this execution note on \"{t}\"?\n\n> {n}"),
    "ask_note_more": ("Junto esta linha à nota que \"{t}\" já tem?\n\n> {n}",
                      "Shall I add this line to the note \"{t}\" already has?\n\n> {n}"),
    "status_col": ("Estado TC", "Status TC"),
    "status_col_tp": ("Estado TP", "Status TP"),
    # ---- comandos acrescentados depois (números, o que a seguir, notas novas) ----
    "stats_total": ("{n} linha(s) em {b} livro(s) — {mine} tua(s), {open} por fechar:",
                    "{n} row(s) in {b} workbook(s) — {mine} yours, {open} unfinished:"),
    "stats_book": ("- **{book}**: {n} linha(s) — {done} concluída(s), {doing} em curso, "
                   "{blocked} bloqueada(s), {other} noutro estado",
                   "- **{book}**: {n} row(s) — {done} done, {doing} in progress, "
                   "{blocked} blocked, {other} in another state"),
    "stats_todos": ("- Por fazer: {n} item(ns), {doing} em curso, {high} com prioridade "
                    "alta ou urgente",
                    "- TODO: {n} item(s), {doing} in progress, {high} high or urgent"),
    "gaps_none": ("Todas as linhas à vista têm estado preenchido. 👌",
                  "Every row in view has a status filled in. 👌"),
    "gaps_head": ("{n} linha(s) sem Estado TC nem Estado TP:",
                  "{n} row(s) with neither Status TC nor Status TP:"),
    "next_none": ("Não vejo nada à espera de ti no que está aberto.",
                  "I see nothing waiting for you in what is open."),
    "next_head": ("Por onde eu começava:", "Where I would start:"),
    "urgent_none": ("Nada com prioridade alta ou urgente por fechar.",
                    "Nothing high or urgent left open."),
    "urgent_head": ("{n} item(ns) com prioridade alta ou urgente:",
                    "{n} item(s) with high or urgent priority:"),
    "where_none": ("Não tens livros abertos.", "You have no workbooks open."),
    "where_head": ("{n} livro(s) aberto(s):", "{n} workbook(s) open:"),
    "where_book": ("- **{name}** · {sheet} · {n} linha(s), {open} por fechar{active}",
                   "- **{name}** · {sheet} · {n} row(s), {open} unfinished{active}"),
    "where_active": (" · **à vista**", " · **in view**"),
    "where_view": ("Estás na vista `{v}`.", "You are on the `{v}` view."),
    "need_obs": ("Escreve `obs em <tarefa>: <texto>`.", "Type `obs on <task>: <text>`."),
    "ask_obs": ("Escrevo isto na **OBS** de \"{t}\"? Fica só local (✎) até carregares "
                "em Enviar.\n\n> {v}",
                "Shall I write this in the **OBS** of \"{t}\"? It stays local (✎) until "
                "you Push.\n\n> {v}"),
    "need_move": ("Escreve `move <item> para em curso`.", "Type `move <item> to in progress`."),
    "move_unknown": ("Não conheço a coluna \"{c}\". As do teu quadro são: {names}.",
                     "I do not know the column \"{c}\". Yours are: {names}."),
    "move_same": ("\"{t}\" já está em {c}.", "\"{t}\" is already in {c}."),
    "ask_move": ("Passo \"{t}\" para **{c}**?", "Shall I move \"{t}\" to **{c}**?"),
    "cols_default": ("Por fazer, Em curso, Feito", "To do, In progress, Done"),
    "col_todo": ("Por fazer", "To do"), "col_inprogress": ("Em curso", "In progress"),
    "col_done": ("Feito", "Done"),
    "need_prio": ("Escreve `prioridade de <item> para alta`.",
                  "Type `priority of <item> to high`."),
    "prio_unknown": ("Não conheço a prioridade \"{p}\". Usa baixa, normal, alta ou urgente.",
                     "I do not know the priority \"{p}\". Use low, normal, high or urgent."),
    "prio_same": ("\"{t}\" já tem prioridade {p}.", "\"{t}\" is already {p} priority."),
    "ask_prio": ("Ponho \"{t}\" com prioridade **{p}**?",
                 "Shall I set \"{t}\" to **{p}** priority?"),
    "prio_low": ("baixa", "low"), "prio_normal": ("normal", "normal"),
    "prio_high": ("alta", "high"), "prio_urgent": ("urgente", "urgent"),
    "need_remove": ("Diz-me o que apagar, por exemplo `remove da lista: rever o TC-42`.",
                    "Tell me what to delete, for example `remove from my list: review TC-42`."),
    "ask_remove": ("Apago \"{t}\" da lista Por fazer? Isto não se desfaz.",
                   "Shall I delete \"{t}\" from the TODO list? This cannot be undone."),
    "need_note_title": ("Diz-me o nome da nota, por exemplo `cria uma nota: Reunião de sexta`.",
                        "Tell me the note's name, for example `create a note: Friday meeting`."),
    "note_new_empty": ("Não encontrei nada para pôr na tabela dessa nota.",
                       "I found nothing to put in that note's table."),
    "ask_note_new": ("Crio a nota \"{t}\" no quadro?",
                     "Shall I create the note \"{t}\" on the board?"),
    "ask_note_new_table": ("Crio a nota \"{t}\" no quadro, com uma tabela de {n} linha(s)?",
                           "Shall I create the note \"{t}\" on the board, with a table of "
                           "{n} row(s)?"),
    "tbl_task": ("Tarefa", "Task"), "tbl_todo": ("O que fazer", "To do"),
    "tbl_status": ("Estado", "Status"), "tbl_book": ("Livro", "Workbook"),
    "tbl_item": ("Item", "Item"), "tbl_col": ("Coluna", "Column"),
    "tbl_prio": ("Prioridade", "Priority"), "tbl_state": ("Situação", "State"),
    "tbl_note": ("Nota", "Note"), "tbl_folder": ("Pasta", "Folder"),
    "ttl_tasks": ("Tarefas", "Tasks"), "ttl_todos": ("Por fazer", "TODO"),
    "ttl_ccrs": ("CCRs", "CCRs"), "ttl_notes": ("Notas", "Notes"),
    "ccr_open": ("aberta", "open"), "ccr_ready": ("pronta a fechar", "ready to close"),
    "ccr_closed": ("fechada", "closed"),
    "llm_off": ("O motor LLM não está configurado — respondi com o motor local.",
                "The LLM engine is not configured — I answered with the local engine."),
}


def _lbl(key, lang, **kw):
    text = LBL[key][1 if lang == "en" else 0]
    return text.format(**kw) if kw else text


# ---------------------------------------------------------------- configuração
def load_chat_config():
    """`chat_config.json` (motor e, mais tarde, credenciais do LLM). {} se não existir."""
    try:
        with open(CHAT_CONFIG_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_chat_config(engine, model="", api_key=None):
    """Grava o `chat_config.json` (motor do assistente e, com o motor do
    modelo, o modelo e a chave).

    `api_key=None` (ou vazia) MANTÉM a chave que lá estiver: a interface nunca
    a vê de volta, por isso "não mexer nela" tem de ser possível. Grava-se com
    `json.dump` e não com o `write_json` do estado, para a chave não ir também
    para as cópias em `backups\\`.
    """
    engine = str(engine or "").strip()
    if engine not in ("local", "llm"):
        raise ValueError("motor inválido (usa 'local' ou 'llm')")
    atual = load_chat_config()
    cfg = {"engine": engine}
    if engine == "llm":
        llm = dict(atual.get("llm") or {}) if isinstance(atual.get("llm"), dict) else {}
        llm["provider"] = "anthropic"
        # modelo vazio: fica o que lá estava, ou nenhum — e sem nenhum o
        # chatllm usa o de omissão (ver LLM_MODEL)
        llm["model"] = str(model or "").strip() or str(llm.get("model") or "")
        if isinstance(api_key, str) and api_key.strip():
            llm["api_key"] = api_key.strip()
        cfg["llm"] = llm
    with open(CHAT_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=1)
    return chat_config_view()


def chat_config_view():
    """O que a interface pode ver do `chat_config.json`.

    NUNCA a chave — só se existe uma. É a mesma doutrina do Jira (ver
    get_api_jira_config, que devolve `configured` e não o token): a resposta
    desta rota atravessa a LAN e vai aos registos.
    """
    cfg = load_chat_config()
    llm = cfg.get("llm") if isinstance(cfg.get("llm"), dict) else {}
    return {"engine": "llm" if str(cfg.get("engine")) == "llm" else "local",
            "model": str(llm.get("model") or ""),
            "hasKey": bool(str(llm.get("api_key") or "").strip())}


# ---------------------------------------------------------------- contexto
def _txt(value, limit=MAX_TEXT):
    return str(value or "").strip()[:limit]


def status_class(text):
    """done/doing/blocked/other — a mesma conta que statusClass (static/js/utils.js)."""
    t = normalize(text)
    if re.search(r"(conclu|done|closed|fechad|complet|finaliz|\bok\b)", t):
        return "done"
    if re.search(r"(progress|em curso|ongoing|doing|andamento|review|analise)", t):
        return "doing"
    if re.search(r"(bloq|blocked|impedid|on hold|hold|stuck)", t):
        return "blocked"
    return "other"


def _row_states(row):
    """Estados aplicáveis da linha (sem os vazios e sem N/A)."""
    return [s for s in (row.get("tc"), row.get("tp"))
            if str(s or "").strip() and normalize(s) != "n/a"]


def _row_done(row):
    """Sem trabalho à espera de ninguém — como taskIsDone (static/js/history.js)."""
    estados = _row_states(row)
    if not estados:
        return True
    return all(status_class(s) == "done" for s in estados)


def _norm_row(raw, book):
    if not isinstance(raw, dict):
        return None
    fn = _txt(raw.get("fn"), 200)
    todo = _txt(raw.get("todo"), 200)
    if not (fn or todo):
        return None
    try:
        xlrow = int(raw.get("xlrow") or 0)
    except (TypeError, ValueError):
        xlrow = 0
    try:
        age = int(raw.get("age_days"))
    except (TypeError, ValueError):
        age = None
    return {
        "book": book, "fn": fn, "todo": todo, "xlrow": xlrow,
        "tc": _txt(raw.get("tc"), 120), "tp": _txt(raw.get("tp"), 120),
        "obs": _txt(raw.get("obs")), "people": _txt(raw.get("people"), 200),
        "note": _txt(raw.get("note")),
        "mine": bool(raw.get("mine")),
        "over": [_txt(c, 60) for c in (raw.get("over") or [])
                 if isinstance(c, str)][:12],
        "age_days": age, "age_est": bool(raw.get("age_est")),
        "text": _txt(raw.get("text"), 1000),
    }


def normalize_context(raw):
    """Retrato do que o cliente tem em memória, cortado a tamanhos seguros."""
    raw = raw if isinstance(raw, dict) else {}
    books, rows = [], []
    for b in (raw.get("books") or [])[:MAX_BOOKS]:
        if not isinstance(b, dict):
            continue
        book = {
            "name": _txt(b.get("name"), 200), "sheet": _txt(b.get("sheet"), 200),
            "file": _txt(b.get("file"), 400), "active": bool(b.get("active")),
            "view": _txt(b.get("view"), 60),
            # vocabulário de estados da aba: um estado escrito à mão é resolvido
            # contra esta lista antes de ser proposto (ver _resolve_status)
            "statuses": [_txt(s, 120) for s in (b.get("statuses") or [])
                         if isinstance(s, str)][:80],
        }
        books.append(book)
        for r in (b.get("rows") or [])[:MAX_ROWS]:
            linha = _norm_row(r, book)
            if linha:
                rows.append(linha)

    todos = []
    for t in (raw.get("todos") or [])[:MAX_TODOS]:
        if not isinstance(t, dict):
            continue
        todos.append({
            "id": _txt(t.get("id"), 60), "title": _txt(t.get("title"), 200),
            "col": _txt(t.get("col"), 40) or "todo",
            "col_label": _txt(t.get("col_label"), 60),
            "priority": _txt(t.get("priority"), 20) or "normal",
            "done": bool(t.get("done")), "detail": _txt(t.get("detail")),
            "jira": [_txt(k, 30) for k in (t.get("jira") or []) if isinstance(k, str)][:5],
        })

    ccrs = []
    for c in (raw.get("ccrs") or [])[:MAX_CCRS]:
        if not isinstance(c, dict):
            continue
        ccrs.append({"id": _txt(c.get("id"), 60), "note": _txt(c.get("note")),
                     "ready": bool(c.get("ready")), "closed": bool(c.get("closed"))})

    notes = []
    for n in (raw.get("notes") or [])[:MAX_NOTES]:
        if not isinstance(n, dict):
            continue
        notes.append({"id": _txt(n.get("id"), 60), "title": _txt(n.get("title"), 200),
                      "folder": _txt(n.get("folder"), 200), "text": _txt(n.get("text"), 600)})

    try:
        stale_days = max(1, min(60, int(raw.get("stale_days") or 5)))
    except (TypeError, ValueError):
        stale_days = 5
    try:
        pending = max(0, int(raw.get("pending") or 0))
    except (TypeError, ValueError):
        pending = 0

    return {"person": _txt(raw.get("person"), 120), "view": _txt(raw.get("view"), 60),
            "stale_days": stale_days, "pending": pending,
            "books": books, "rows": rows, "todos": todos, "ccrs": ccrs, "notes": notes}


def context_digest(ctx, lang="pt"):
    """Resumo em texto do contexto — usado pelo intent `resumo` e pelo motor LLM."""
    rows = ctx["rows"]
    linhas = [_lbl("summary", lang)]
    if ctx["books"]:
        linhas.append(_lbl("sum_books", lang, n=len(ctx["books"]),
                           names=", ".join(b["name"] or "?" for b in ctx["books"])))
        linhas.append(_lbl("sum_rows", lang, n=len(rows),
                           mine=sum(1 for r in rows if r["mine"]),
                           open=sum(1 for r in rows if not _row_done(r))))
    if ctx["pending"]:
        linhas.append(_lbl("sum_pending", lang, n=ctx["pending"]))
    if ctx["todos"]:
        linhas.append(_lbl("sum_todos", lang, n=len(ctx["todos"]),
                           doing=sum(1 for t in ctx["todos"] if t["col"] == "inprogress")))
    if ctx["ccrs"]:
        linhas.append(_lbl("sum_ccrs", lang, n=len(ctx["ccrs"]),
                           ready=sum(1 for c in ctx["ccrs"] if c["ready"])))
    if ctx["notes"]:
        linhas.append(_lbl("sum_notes", lang, n=len(ctx["notes"])))
    if len(linhas) == 1:
        return _lbl("no_data", lang)
    return "\n".join(linhas)


# ---------------------------------------------------------------- itens
def _short(value, limit=70):
    texto = " ".join(str(value or "").split())
    return texto if len(texto) <= limit else texto[:limit - 1] + "…"


def _row_item(row):
    estado = " · ".join(_row_states(row)) or "—"
    # "o que fazer" entra sempre: numa folha com a mesma função em várias linhas
    # (o caso normal) é o único texto que as distingue
    idade = ""
    if row["age_days"]:
        idade = f"{'≥ ' if row['age_est'] else ''}{row['age_days']}d"
    return {
        "kind": "task",
        "title": row["fn"] or row["todo"] or f"linha {row['xlrow']}",
        "sub": " · ".join(x for x in (_short(row["todo"]), estado, idade,
                                      row["book"]["name"]) if x),
        "source": {"view": row["book"]["view"] or "excel", "workbook": row["book"]["name"],
                   "sheet": row["book"]["sheet"], "fn": row["fn"], "todo": row["todo"]},
    }


def _row_label(row):
    """Nome de uma linha numa frase (função + o que fazer, quando ajuda)."""
    fn, todo = row["fn"], _short(row["todo"], 40)
    if fn and todo and normalize(todo) != normalize(fn):
        return f"{fn} — {todo}"
    return fn or todo or f"linha {row['xlrow']}"


def _todo_item(t):
    return {"kind": "todo", "title": t["title"],
            "sub": " · ".join(x for x in (t["col_label"] or t["col"], t["detail"]) if x),
            "source": {"view": "todo", "todoId": t["id"]}}


def _ccr_item(c):
    return {"kind": "ccr", "title": f"CCR {c['id']}", "sub": c["note"],
            "source": {"view": "ccrs", "ccr": c["id"]}}


def _note_item(n):
    return {"kind": "note", "title": n["title"],
            "sub": n["folder"], "source": {"view": "notes", "noteId": n["id"]}}


def _listing(head, items, lang):
    """Cabeçalho + os primeiros MAX_HITS itens.

    O corte é dito no próprio cabeçalho: a lista é desenhada DEPOIS do texto, e
    um "e mais N" no fim do texto aparecia antes dos itens que contava."""
    reply = head
    if len(items) > MAX_HITS:
        reply += " " + _lbl("showing", lang, n=MAX_HITS)
    return {"reply": reply, "items": items[:MAX_HITS]}


# ---------------------------------------------------------------- comparações
_STOP = set("""a o as os um uma uns umas de do da dos das em no na nos nas por para com que e ou
quais quantas quantos qual meu minha meus minhas eu me mim tenho ha estao esta estou sao sobre
tarefa tarefas task tasks item itens lista list mostra mostrar ver lista-me diz dizme quero
the a an of in on for with what which how many my mine me i do does are is show list tell about
""".split())


def _terms(text):
    """Palavras significativas do que foi escrito (para procurar)."""
    return [w for w in re.split(r"[^0-9a-z_]+", normalize(text))
            if len(w) > 1 and w not in _STOP]


def _matches(haystack, termos):
    t = normalize(haystack)
    return all(term in t for term in termos)


def _find_rows(ctx, texto):
    """Linhas dos livros abertos que batem certo com um nome escrito à mão."""
    termos = _terms(texto)
    if not termos:
        return []
    alvo = normalize(texto)
    exatas = [r for r in ctx["rows"] if normalize(r["fn"]) == alvo]
    return exatas or [r for r in ctx["rows"]
                      if _matches(f"{r['fn']} {r['todo']}", termos)]


def _find_todos(ctx, texto, only_open=False):
    termos = _terms(texto)
    if not termos:
        return []
    alvo = normalize(texto)
    pool = [t for t in ctx["todos"] if not (only_open and t["done"])]
    exatas = [t for t in pool if normalize(t["title"]) == alvo]
    return exatas or [t for t in pool if _matches(f"{t['title']} {t['detail']}", termos)]


def _row_ref(row):
    """Como o cliente reencontra a linha na altura de executar a proposta."""
    return {"workbook": row["book"]["name"], "sheet": row["book"]["sheet"],
            "file": row["book"]["file"], "fn": row["fn"], "todo": row["todo"],
            "xlrow": row["xlrow"]}


def _pick_row(ctx, texto, lang):
    """(linha, resposta): a linha única que bate certo, ou o que responder.

    Uma ordem sobre uma linha só se propõe quando não há dúvida nenhuma sobre
    qual é — daí a resposta pronta para os outros dois casos."""
    achados = _find_rows(ctx, texto)
    if not achados:
        return None, _reply(_lbl("task_notfound", lang, q=texto))
    if len(achados) > 1:
        nomes = ", ".join(f'"{_row_label(r)}"' for r in achados[:4])
        return None, _reply(_lbl("task_ambiguous", lang, q=texto, n=len(achados), names=nomes),
                            items=[_row_item(r) for r in achados[:MAX_HITS]])
    return achados[0], None


def _pick_todo(ctx, texto, lang):
    """O mesmo que _pick_row, para os itens da lista Por fazer."""
    achados = _find_todos(ctx, texto)
    if not achados:
        return None, _reply(_lbl("todo_notfound", lang, q=texto))
    if len(achados) > 1:
        nomes = ", ".join(f'"{t["title"]}"' for t in achados[:4])
        return None, _reply(_lbl("todo_ambiguous", lang, q=texto, names=nomes),
                            items=[_todo_item(t) for t in achados[:MAX_HITS]])
    return achados[0], None


# ---------------------------------------------------------------- respostas de leitura
def _reply(reply, **extra):
    """Resposta base; `extra` acrescenta items/action/confirm (ver _listing)."""
    out = {"reply": reply, "items": [], "action": None, "confirm": None}
    out.update(extra)
    return out


def _do_help(_m, _ctx, lang):
    return _reply(f"{_lbl('help_intro', lang)}\n\n{_lbl('help_read', lang)}\n\n"
                  f"{_lbl('help_write', lang)}")


def _do_summary(_m, ctx, lang):
    return _reply(context_digest(ctx, lang))


def _do_report(_m, _ctx, lang):
    try:
        data = build_report(days=7, lang=lang)
    except Exception:
        return _reply(_lbl("report_fail", lang))
    return _reply(data.get("markdown") or _lbl("report_fail", lang))


def _do_report_day(_m, _ctx, lang):
    """O mesmo relatório, mas só de hoje — o que o botão "O meu dia" mostra."""
    hoje = datetime.now().strftime("%Y-%m-%d")
    try:
        data = build_report(since=hoje, until=hoje, lang=lang)
    except Exception:
        return _reply(_lbl("report_fail", lang))
    return _reply(data.get("markdown") or _lbl("report_fail", lang))


# filtros de estado reconhecidos no texto: (padrão, classe). Os rótulos de cada
# classe estão em _STATE_LABELS, que é o que `_describe` usa para responder.
_STATE_FILTERS = [
    (r"(em curso|a correr|in progress|ongoing|doing)", "doing"),
    (r"(bloquead|blocked|impedid|on hold)", "blocked"),
    (r"(conclu[ií]d|feit|acabad|done|finished|closed|fechad)", "done"),
    (r"(por fechar|por acabar|abertas?|em aberto|unfinished|open)", "open"),
]
_STATE_LABELS = {"doing": "what_doing", "blocked": "what_blocked",
                 "done": "what_done", "open": "what_open"}


# palavras que descrevem o filtro e não a tarefa: não entram na procura por texto
_FILTER_WORDS = set("""curso correr progress ongoing doing bloqueada bloqueadas bloqueado
bloqueados blocked concluida concluidas concluido concluidos feita feitas feito feitos done
closed fechar fechadas fechado aberta abertas aberto abertos em unfinished open paradas parada
parado parados stale excel folha sheet linhas linha row rows""".split())


def _task_filters(msg, ctx):
    """(linhas, marcadores do que foi filtrado) a partir do texto da pergunta.

    Os marcadores são traduzidos por `_describe` — aqui não se sabe o idioma."""
    t = normalize(msg)
    rows, partes = ctx["rows"], []

    # de quem: só as minhas quando a pergunta o diz, senão tudo o que está aberto
    if re.search(r"\b(minhas|meus|minha|meu|my|mine|para mim)\b", t):
        rows = [r for r in rows if r["mine"]]
        partes.append("__mine__")

    classe = None
    for padrao, cls in _STATE_FILTERS:
        if re.search(padrao, t):
            classe = cls
            partes.append(f"__state:{cls}__")
            break
    if classe == "open":
        rows = [r for r in rows if not _row_done(r)]
    elif classe == "done":
        rows = [r for r in rows if _row_done(r)]
    elif classe:
        rows = [r for r in rows
                if any(status_class(s) == classe for s in _row_states(r))]

    # texto livre: o que sobra depois de tirar as palavras do próprio filtro
    termos = [w for w in _terms(msg) if w not in _FILTER_WORDS]
    if termos:
        rows = [r for r in rows if _matches(f"{r['fn']} {r['todo']} {r['obs']} {r['text']}", termos)]
        partes.append("__text:" + " ".join(termos) + "__")
    return rows, partes


def _describe(partes, lang):
    """Traduz os marcadores devolvidos por _task_filters."""
    fora = []
    for p in partes:
        if p == "__mine__":
            fora.append(_lbl("what_mine", lang))
        elif p.startswith("__state:"):
            fora.append(_lbl(_STATE_LABELS[p[len("__state:"):-2]], lang))
        elif p.startswith("__text:"):
            fora.append(_lbl("what_text", lang, q=p[len("__text:"):-2]))
    return " ".join(fora) if fora else _lbl("what_all", lang)


def _do_tasks(msg, ctx, lang):
    if not ctx["rows"]:
        return _reply(_lbl("no_data", lang))
    rows, partes = _task_filters(msg, ctx)
    if not rows:
        return _reply(_lbl("tasks_none", lang))
    head = _lbl("tasks_head", lang, n=len(rows), what=_describe(partes, lang))
    return _reply(**_listing(head, [_row_item(r) for r in rows], lang))


def _do_stale(_msg, ctx, lang):
    if not ctx["rows"]:
        return _reply(_lbl("no_data", lang))
    dias = ctx["stale_days"]
    com_idade = [r for r in ctx["rows"] if r["age_days"] is not None]
    if not com_idade:
        return _reply(_lbl("stale_no_history", lang))
    paradas = [r for r in com_idade if not _row_done(r) and r["age_days"] >= dias]
    if not paradas:
        return _reply(_lbl("stale_none", lang, d=dias))
    paradas.sort(key=lambda r: -r["age_days"])
    head = _lbl("tasks_head", lang, n=len(paradas), what=_lbl("what_stale", lang, d=dias))
    return _reply(**_listing(head, [_row_item(r) for r in paradas], lang))


def _do_pending(_msg, ctx, lang):
    linhas = [r for r in ctx["rows"] if r["over"]]
    if not linhas and not ctx["pending"]:
        return _reply(_lbl("pending_none", lang))
    if not linhas:
        # há alterações locais, mas de linhas/livros que não estão à vista
        return _reply(_lbl("pending_head", lang, n=ctx["pending"]))
    head = _lbl("pending_head", lang, n=len(linhas))
    if ctx["pending"] > len(linhas):
        head += " " + _lbl("pending_more", lang, n=ctx["pending"])
    itens = []
    for r in linhas:
        item = _row_item(r)
        item["sub"] = " · ".join(x for x in (r["book"]["name"], ", ".join(r["over"])) if x)
        itens.append(item)
    return _reply(**_listing(head, itens, lang))


def _do_todos(msg, ctx, lang):
    if not ctx["todos"]:
        return _reply(_lbl("todos_none", lang))
    t = normalize(msg)
    itens = ctx["todos"]
    if re.search(r"(em curso|a correr|in progress|ongoing|doing)", t):
        itens = [x for x in itens if x["col"] == "inprogress"]
    elif re.search(r"(conclu[ií]d|feit|done|finished)", t):
        itens = [x for x in itens if x["done"]]
    else:
        itens = [x for x in itens if not x["done"]]
    if not itens:
        return _reply(_lbl("todos_none_col", lang, c=msg.strip()))
    head = _lbl("todos_head", lang, n=len(itens))
    return _reply(**_listing(head, [_todo_item(x) for x in itens], lang))


def _do_ccrs(msg, ctx, lang):
    if not ctx["ccrs"]:
        return _reply(_lbl("ccrs_none", lang))
    if re.search(r"(pronta|ready|fechar|close)", normalize(msg)):
        prontas = [c for c in ctx["ccrs"] if c["ready"] and not c["closed"]]
        if not prontas:
            return _reply(_lbl("ccrs_ready_none", lang))
        return _reply(**_listing(_lbl("ccrs_ready", lang, n=len(prontas)),
                                 [_ccr_item(c) for c in prontas], lang))
    head = _lbl("ccrs_head", lang, n=len(ctx["ccrs"]))
    return _reply(**_listing(head, [_ccr_item(c) for c in ctx["ccrs"]], lang))


def _do_notes(msg, ctx, lang):
    if not ctx["notes"]:
        return _reply(_lbl("notes_none", lang))
    termos = [w for w in _terms(msg) if w not in ("nota", "notas", "note", "notes", "quadro")]
    notas = ctx["notes"]
    if termos:
        notas = [n for n in notas if _matches(f"{n['title']} {n['folder']} {n['text']}", termos)]
    if not notas:
        return _reply(_lbl("notes_none", lang))
    head = _lbl("notes_head", lang, n=len(notas))
    return _reply(**_listing(head, [_note_item(n) for n in notas], lang))


def _do_count(msg, ctx, lang):
    t = normalize(msg)
    if re.search(r"(por fazer|todo|to-?do|minha lista|my list)", t):
        return _reply(_lbl("count_todos", lang, n=len(ctx["todos"]),
                           open=sum(1 for x in ctx["todos"] if not x["done"])))
    if re.search(r"\bccrs?\b", t):
        return _reply(_lbl("count_ccrs", lang, n=len(ctx["ccrs"]),
                           ready=sum(1 for c in ctx["ccrs"] if c["ready"])))
    if re.search(r"\bnotas?\b|\bnotes?\b", t):
        return _reply(_lbl("count_notes", lang, n=len(ctx["notes"])))
    if not ctx["rows"]:
        return _reply(_lbl("no_data", lang))
    rows, partes = _task_filters(msg, ctx)
    return _reply(_lbl("count_tasks", lang, n=len(rows), what=_describe(partes, lang)))


def _do_search(msg, ctx, lang):
    termos = _terms(msg)
    if not termos:
        return _reply(_lbl("empty", lang))
    q = " ".join(termos)
    itens = []
    itens += [_row_item(r) for r in ctx["rows"]
              if _matches(f"{r['fn']} {r['todo']} {r['obs']} {r['text']}", termos)]
    itens += [_todo_item(t) for t in ctx["todos"]
              if _matches(f"{t['title']} {t['detail']}", termos)]
    itens += [_ccr_item(c) for c in ctx["ccrs"]
              if _matches(f"CCR {c['id']} {c['note']}", termos)]
    itens += [_note_item(n) for n in ctx["notes"]
              if _matches(f"{n['title']} {n['folder']} {n['text']}", termos)]
    if not itens:
        return _reply(_lbl("search_none", lang, q=q))
    return _reply(**_listing(_lbl("search_head", lang, q=q), itens, lang))


# ---- números, buracos, por onde começar, onde estou ----
_CLASSES = ("done", "doing", "blocked", "other")


def _row_class(row):
    """A classe da linha para as contagens (a mesma conta de `_row_done`)."""
    if _row_done(row):
        return "done"
    estados = _row_states(row)
    for cls in ("blocked", "doing"):
        if any(status_class(s) == cls for s in estados):
            return cls
    return "other"


def _book_rows(ctx, book):
    """As linhas de um livro (o `book` de cada linha É este dicionário)."""
    return [r for r in ctx["rows"] if r["book"] is book]


def _do_stats(_msg, ctx, lang):
    linhas = []
    rows = ctx["rows"]
    if rows:
        linhas.append(_lbl("stats_total", lang, n=len(rows), b=len(ctx["books"]),
                           mine=sum(1 for r in rows if r["mine"]),
                           open=sum(1 for r in rows if not _row_done(r))))
        for book in ctx["books"]:
            do_livro = _book_rows(ctx, book)
            contas = dict.fromkeys(_CLASSES, 0)
            for row in do_livro:
                contas[_row_class(row)] += 1
            linhas.append(_lbl("stats_book", lang, book=book["name"] or "?",
                               n=len(do_livro), **contas))
    if ctx["pending"]:
        linhas.append(_lbl("sum_pending", lang, n=ctx["pending"]))
    if ctx["todos"]:
        linhas.append(_lbl("stats_todos", lang, n=len(ctx["todos"]),
                           doing=sum(1 for t in ctx["todos"] if t["col"] == "inprogress"),
                           high=sum(1 for t in ctx["todos"]
                                    if not t["done"] and t["priority"] in ("high", "urgent"))))
    if ctx["ccrs"]:
        linhas.append(_lbl("sum_ccrs", lang, n=len(ctx["ccrs"]),
                           ready=sum(1 for c in ctx["ccrs"] if c["ready"])))
    if ctx["notes"]:
        linhas.append(_lbl("sum_notes", lang, n=len(ctx["notes"])))
    if not linhas:
        return _reply(_lbl("no_data", lang))
    return _reply("\n".join(linhas))


def _do_gaps(_msg, ctx, lang):
    """Linhas por preencher: sem Estado TC nem Estado TP escritos na folha."""
    if not ctx["rows"]:
        return _reply(_lbl("no_data", lang))
    vazias = [r for r in ctx["rows"] if not r["tc"].strip() and not r["tp"].strip()]
    if not vazias:
        return _reply(_lbl("gaps_none", lang))
    return _reply(**_listing(_lbl("gaps_head", lang, n=len(vazias)),
                             [_row_item(r) for r in vazias], lang))


def _do_next(_msg, ctx, lang):
    """Uma lista curta por onde começar, sempre pela mesma ordem: o que é
    urgente, o que já está em curso, o que está parado há mais tempo."""
    itens, vistos = [], set()

    def junta(item, chave):
        if chave not in vistos:
            vistos.add(chave)
            itens.append(item)

    for nivel in ("urgent", "high"):
        for t in ctx["todos"]:
            if not t["done"] and t["priority"] == nivel:
                junta(_todo_item(t), ("todo", t["id"]))
    for t in ctx["todos"]:
        if not t["done"] and t["col"] == "inprogress":
            junta(_todo_item(t), ("todo", t["id"]))
    minhas = [r for r in ctx["rows"] if r["mine"] and not _row_done(r)]
    paradas = sorted([r for r in minhas if (r["age_days"] or 0) >= ctx["stale_days"]],
                     key=lambda r: -(r["age_days"] or 0))
    for row in paradas:
        junta(_row_item(row), ("row", row["book"]["name"], row["xlrow"], row["fn"]))
    for row in minhas:
        if any(status_class(s) == "doing" for s in _row_states(row)):
            junta(_row_item(row), ("row", row["book"]["name"], row["xlrow"], row["fn"]))
    if not itens:
        return _reply(_lbl("next_none", lang))
    return _reply(**_listing(_lbl("next_head", lang), itens, lang))


def _do_urgent(_msg, ctx, lang):
    ordem = {"urgent": 0, "high": 1}
    itens = [t for t in ctx["todos"] if not t["done"] and t["priority"] in ordem]
    if not itens:
        return _reply(_lbl("urgent_none", lang))
    itens.sort(key=lambda t: ordem[t["priority"]])
    return _reply(**_listing(_lbl("urgent_head", lang, n=len(itens)),
                             [_todo_item(t) for t in itens], lang))


def _do_where(_msg, ctx, lang):
    """O que está aberto: livros, abas, quantas linhas e qual está à vista."""
    if not ctx["books"]:
        return _reply(_lbl("where_none", lang))
    linhas = [_lbl("where_head", lang, n=len(ctx["books"]))]
    for book in ctx["books"]:
        do_livro = _book_rows(ctx, book)
        linhas.append(_lbl("where_book", lang, name=book["name"] or "?",
                           sheet=book["sheet"] or "—", n=len(do_livro),
                           open=sum(1 for r in do_livro if not _row_done(r)),
                           active=_lbl("where_active", lang) if book["active"] else ""))
    if ctx["pending"]:
        linhas.append(_lbl("sum_pending", lang, n=ctx["pending"]))
    if ctx["view"]:
        linhas.append(_lbl("where_view", lang, v=ctx["view"]))
    return _reply("\n".join(linhas))


# ---------------------------------------------------------------- respostas com ação
# Uma ação é uma PROPOSTA: o cliente executa-a, depois de confirmada, pelos
# endpoints que já existem. Ver static/js/chat.js (runChatAction).
def _proposal(confirm, action, **extra):
    return _reply(confirm, action=action, confirm=confirm, **extra)


_ADD_PREFIX = re.compile(
    r"^(?:adiciona(?:r)?|acrescenta(?:r)?|junta(?:r)?|cria(?:r)?|p[oõ]e|add|create|new)\b"
    r"(?:\s+(?:uma|um|an|a|o|the)\b)?"
    r"(?:\s+(?:item|tarefas?|tasks?|to-?dos?|entrada|linha)\b)?"
    r"(?:\s+(?:aos|ao|as|ás|à|a|em|na|no|para|into|in|onto|on|to)\b)?"
    r"(?:\s+(?:minha|meu|my|the|à|a|o)\b)?"
    r"(?:\s+(?:lista|list|por\s+fazer|to-?dos?)\b)?"
    r"\s*[:\-–]?\s*", re.IGNORECASE)


def _do_todo_add(msg, _ctx, lang):
    titulo = _ADD_PREFIX.sub("", msg.strip(), count=1).strip(" .:-–")
    if not titulo:
        return _reply(_lbl("need_title", lang))
    titulo = titulo[:200]
    return _proposal(_lbl("ask_add", lang, t=titulo),
                     {"kind": "todo_add", "title": titulo})


_DONE_PREFIX = re.compile(
    r"^(?:marca(?:r)?|conclui(?:r)?|fecha(?:r)?|termina(?:r)?|acaba(?:r)?|mark|complete|finish|close)\b"
    r"(?:\s+(?:os|as|the|o|a)\b)?"
    r"(?:\s+(?:item|tarefas?|tasks?|to-?dos?)\b)?"
    # "marca COMO FEITO: x" — o estado pode vir antes do nome ou depois dele
    r"(?:\s+(?:como|as)\b)?"
    r"(?:\s+(?:conclu[ií]d[oa]|feit[oa]|done|finished|completed?)\b)?"
    r"\s*[:\-–]?\s*", re.IGNORECASE)
_DONE_SUFFIX = re.compile(
    r"\s*(?:como|as)?\s*(?:conclu[ií]d[oa]|feit[oa]|done|finished|complete[d]?)\s*$",
    re.IGNORECASE)


def _do_todo_done(msg, ctx, lang):
    alvo = _DONE_SUFFIX.sub("", _DONE_PREFIX.sub("", msg.strip(), count=1)).strip(" .:-–")
    if not alvo:
        return _reply(_lbl("need_title", lang))
    item, resposta = _pick_todo(ctx, alvo, lang)
    if resposta:
        return resposta
    if item["done"]:
        return _reply(_lbl("todo_already", lang, t=item["title"]), items=[_todo_item(item)])
    return _proposal(_lbl("ask_done", lang, t=item["title"]),
                     {"kind": "todo_done", "id": item["id"], "title": item["title"]},
                     items=[_todo_item(item)])


_STATUS_RE = re.compile(
    r"(?:estado|status)\s*(?P<vert>tc|tp)?\s*(?:de|do|da|of|for|em|in)?\s+"
    r"(?P<fn>.+?)\s+(?:para|como|to|=|->|passa a|fica)\s+(?P<value>.+?)\s*$",
    re.IGNORECASE)


def _resolve_status(value, statuses):
    """O estado escrito à mão, com o nome exato da lista da aba quando lá está.

    Escrever "done" e o Excel ficar com "done" em vez de "Done" seria uma
    célula fora do vocabulário da folha — daí esta resolução (igual, começa
    por, contém)."""
    alvo = normalize(value)
    if not alvo:
        return value
    for teste in (lambda s: s == alvo, lambda s: s.startswith(alvo), lambda s: alvo in s):
        for s in statuses:
            if teste(normalize(s)):
                return s
    return value


def _do_status_set(msg, ctx, lang):
    m = _STATUS_RE.search(msg.strip())
    if not m:
        return {**_do_search(msg, ctx, lang), "intent": "search"}
    coluna = "Status TP" if (m.group("vert") or "").lower() == "tp" else "Status TC"
    alvo = m.group("fn").strip(" \"'.:-–")
    valor = m.group("value").strip(" \"'.:-–")[:120]
    if not alvo or not valor:
        return {**_do_search(msg, ctx, lang), "intent": "search"}
    row, resposta = _pick_row(ctx, alvo, lang)
    if resposta:
        return resposta
    valor = _resolve_status(valor, row["book"]["statuses"])
    rotulo = _lbl("status_col_tp" if coluna == "Status TP" else "status_col", lang)
    return _proposal(
        _lbl("ask_status", lang, col=rotulo, t=_row_label(row), v=valor),
        {"kind": "status_set", "column": coluna, "value": valor,
         "ref": _row_ref(row)},
        items=[_row_item(row)])


_NOTE_RE = re.compile(
    r"^(?:nota|note|anota(?:r)?|apontamento)\s*(?:de execu[cç][aã]o)?\s*"
    r"(?:em|no|na|on|in|para|for|a|à)?\s+(?P<fn>.+?)"
    # o separador é ":" ou um "-" isolado: sem isto, o "-" de "TC-42" partia o
    # nome da tarefa em duas ("TC" + "42: …")
    r"\s*(?::|\s[-–]\s)\s*(?P<text>.+)$",
    re.IGNORECASE)


def _do_note_add(msg, ctx, lang):
    m = _NOTE_RE.search(msg.strip())
    if not m:
        return _reply(_lbl("need_note", lang))
    alvo = m.group("fn").strip(" \"'.")
    texto = m.group("text").strip()[:1000]
    if not alvo or not texto:
        return _reply(_lbl("need_note", lang))
    row, resposta = _pick_row(ctx, alvo, lang)
    if resposta:
        return resposta
    # a nota de uma linha é uma só: com uma já escrita, isto vai juntar-se a ela
    # (é o cliente que faz a junção, ver chatAddNote em static/js/chat.js)
    return _proposal(
        _lbl("ask_note_more" if row["note"] else "ask_note",
             lang, t=_row_label(row), n=texto),
        {"kind": "note_add", "note": texto,
         "ref": _row_ref(row)},
        items=[_row_item(row)])


# ---- OBS: a mesma escrita local (✎) dos estados, noutra coluna ----
_OBS_RE = re.compile(
    r"^(?:obs|observa[cç][oõ]es|observa[cç][aã]o)\s*"
    r"(?:de|do|da|em|no|na|of|on|in|for)?\s+(?P<fn>.+?)"
    r"\s*(?::|\s[-–]\s)\s*(?P<value>.+)$",
    re.IGNORECASE)


def _do_obs_set(msg, ctx, lang):
    m = _OBS_RE.search(msg.strip())
    if not m:
        return _reply(_lbl("need_obs", lang))
    alvo = m.group("fn").strip(" \"'.")
    valor = m.group("value").strip()[:400]
    if not alvo or not valor:
        return _reply(_lbl("need_obs", lang))
    row, resposta = _pick_row(ctx, alvo, lang)
    if resposta:
        return resposta
    # a OBS é escrita pelo mesmo caminho dos estados (/api/update): fica local
    # até ao Push, como qualquer outra alteração de célula
    return _proposal(
        _lbl("ask_obs", lang, t=_row_label(row), v=valor),
        {"kind": "status_set", "column": "OBS", "value": valor, "ref": _row_ref(row)},
        items=[_row_item(row)])


# ---- quadro Por fazer: mover de coluna, prioridade, apagar ----
_MOVE_RE = re.compile(
    r"^(?:move(?:r)?|passa(?:r)?|manda(?:r)?|arrasta(?:r)?|put|send)\s+"
    r"(?:o|a|os|as|the|item|tarefas?|tasks?)?\s*(?P<title>.+?)\s+"
    r"(?:para|pra|to|into)\s+(?:a|o|the)?\s*(?:coluna|column)?\s*(?P<col>.+?)\s*$",
    re.IGNORECASE)

# As colunas do quadro não são uma lista fechada (ver TODO_COLUMNS, todos.py):
# o nome escrito é resolvido primeiro contra as que o contexto traz — as deste
# quadro, com o nome que quem usa a app lhes deu — e só depois por estes nomes.
_COL_ALIASES = [
    (r"^(?:por fazer|a fazer|todo|to-?do|backlog|lista)$", "todo"),
    (r"^(?:em curso|a correr|curso|in progress|progress|doing|ongoing)$", "inprogress"),
    (r"^(?:feito|feitos|conclu[ií]d[oa]s?|done|finished|closed|fechad[oa]s?)$", "done"),
]


def _resolve_todo_col(nome, ctx):
    """O id da coluna do quadro a partir do que foi escrito ("em curso")."""
    alvo = normalize(nome).strip(" .:")
    if not alvo:
        return ""
    for item in ctx["todos"]:
        if alvo in (normalize(item["col"]), normalize(item["col_label"])):
            return item["col"]
    for padrao, col in _COL_ALIASES:
        if re.match(padrao, alvo):
            return col
    return ""


def _col_label(col, ctx, lang):
    """O nome que a coluna tem neste quadro (ou o nome de fábrica)."""
    for item in ctx["todos"]:
        if item["col"] == col and item["col_label"]:
            return item["col_label"]
    chave = f"col_{col}"
    return _lbl(chave, lang) if chave in LBL else col


def _col_names(ctx, lang):
    """As colunas que este quadro tem, para dizer quais são quando não se acerta."""
    nomes = []
    for item in ctx["todos"]:
        nome = item["col_label"] or item["col"]
        if nome and nome not in nomes:
            nomes.append(nome)
    return ", ".join(nomes) or _lbl("cols_default", lang)


def _do_todo_move(msg, ctx, lang):
    m = _MOVE_RE.search(msg.strip())
    if not m:
        return _reply(_lbl("need_move", lang))
    alvo = m.group("title").strip(" \"'.:-–")
    coluna = m.group("col").strip(" \"'.:-–")
    if not alvo or not coluna:
        return _reply(_lbl("need_move", lang))
    col = _resolve_todo_col(coluna, ctx)
    if not col:
        return _reply(_lbl("move_unknown", lang, c=coluna, names=_col_names(ctx, lang)))
    item, resposta = _pick_todo(ctx, alvo, lang)
    if resposta:
        return resposta
    rotulo = _col_label(col, ctx, lang)
    if item["col"] == col:
        return _reply(_lbl("move_same", lang, t=item["title"], c=rotulo),
                      items=[_todo_item(item)])
    return _proposal(_lbl("ask_move", lang, t=item["title"], c=rotulo),
                     {"kind": "todo_col", "id": item["id"], "col": col,
                      "title": item["title"]},
                     items=[_todo_item(item)])


_PRIO_RE = re.compile(
    r"^(?:prioridade|priority|prio)\s*(?:de|do|da|of|for|em|no|na)?\s+(?P<title>.+?)"
    r"\s+(?:para|to|=|->|como|as)\s+(?P<value>.+?)\s*$",
    re.IGNORECASE)

_PRIO_ALIASES = [
    (r"^(?:urgente|urgentes|urgent|maxima|top)$", "urgent"),
    (r"^(?:alta|alto|elevada|high)$", "high"),
    (r"^(?:normal|media|medium|nenhuma|none)$", "normal"),
    (r"^(?:baixa|baixo|low|menor)$", "low"),
]


def _resolve_priority(valor):
    alvo = normalize(valor).strip(" .:")
    for padrao, prio in _PRIO_ALIASES:
        if re.match(padrao, alvo):
            return prio
    return ""


def _do_todo_priority(msg, ctx, lang):
    m = _PRIO_RE.search(msg.strip())
    if not m:
        # "prioridade alta" não é uma ordem, é uma pergunta pelo que é urgente
        return {**_do_urgent(msg, ctx, lang), "intent": "urgent"}
    alvo = m.group("title").strip(" \"'.:-–")
    prio = _resolve_priority(m.group("value"))
    if not prio:
        return _reply(_lbl("prio_unknown", lang, p=m.group("value").strip()))
    item, resposta = _pick_todo(ctx, alvo, lang)
    if resposta:
        return resposta
    rotulo = _lbl(f"prio_{prio}", lang)
    if item["priority"] == prio:
        return _reply(_lbl("prio_same", lang, t=item["title"], p=rotulo),
                      items=[_todo_item(item)])
    return _proposal(_lbl("ask_prio", lang, t=item["title"], p=rotulo),
                     {"kind": "todo_priority", "id": item["id"], "priority": prio,
                      "title": item["title"]},
                     items=[_todo_item(item)])


_REMOVE_PREFIX = re.compile(
    r"^(?:remove(?:r)?|retira(?:r)?|apaga(?:r)?|elimina(?:r)?|tira(?:r)?|delete|drop)\b"
    r"(?:\s+(?:o|a|os|as|the)\b)?"
    r"(?:\s+(?:item|tarefas?|tasks?|to-?dos?|entrada)\b)?"
    r"(?:\s+(?:d[aeo]s?|from|out of)\b)?"
    r"(?:\s+(?:minha|meu|my|the)\b)?"
    r"(?:\s+(?:lista|list|por\s+fazer|to-?dos?)\b)?"
    r"\s*[:\-–]?\s*", re.IGNORECASE)
_REMOVE_SUFFIX = re.compile(
    r"\s*(?:d[ao]s?\s+(?:minha\s+)?lista(?:\s+por\s+fazer)?|"
    r"from\s+(?:my\s+)?(?:list|to-?do(?:\s+list)?))\s*$", re.IGNORECASE)


def _do_todo_remove(msg, ctx, lang):
    alvo = _REMOVE_SUFFIX.sub("", _REMOVE_PREFIX.sub("", msg.strip(), count=1)).strip(" .:-–")
    if not alvo:
        return _reply(_lbl("need_remove", lang))
    item, resposta = _pick_todo(ctx, alvo, lang)
    if resposta:
        return resposta
    return _proposal(_lbl("ask_remove", lang, t=item["title"]),
                     {"kind": "todo_delete", "id": item["id"], "title": item["title"]},
                     items=[_todo_item(item)])


# ---- notas novas no quadro, com o que está aberto em tabela ----
# A caixa de uma nota desenha tabelas escritas em "| coluna |" com uma linha de
# separação por baixo (ver noteTableBlock, static/js/notes.js) — é esse o
# formato em que estas saem.
MAX_TABLE = 40

_NOTE_NEW_RE = re.compile(
    r"^(?:cria(?:r)?|nova|novo|abre|abrir|faz(?:er)?|create|new|make|start|add)\s+"
    r"(?:uma|um|a|an)?\s*(?:nota|note)\b\s*"
    r"(?:chamada|chamado|intitulada|com o t[ií]tulo|called|named|titled)?\s*"
    r"[:\-–]?\s*(?P<rest>.*)$", re.IGNORECASE)
# "cria uma nota COM as minhas tarefas paradas": o que vem a seguir descreve o
# que meter na tabela. O "com" pode abrir a frase (sem título nenhum antes).
_WITH_RE = re.compile(r"(?:^|\s+)(?:com|contendo|with|containing)\s+", re.IGNORECASE)
# ... mas só quando o que se segue fala do que a app tem aberto: um título como
# "Reunião com o fornecedor" continua a ser só um título
_SPEC_RE = re.compile(
    r"\b(?:tarefas?|tasks?|linhas?|rows?|excel|folha|sheet|por fazer|to-?dos?|lista|list|"
    r"kanban|ccrs?|notas?|notes?|parad[ao]s?|stale|em curso|in progress|urgentes?|urgent|"
    r"minhas|meus|my)\b")


def _cell(value, limit=60):
    """Uma célula da tabela: sem "|" nem mudanças de linha, que a partiriam."""
    return _short(str(value or "").replace("|", "/").replace("\n", " "), limit) or "—"


def _table(cabecalho, linhas):
    fora = ["| " + " | ".join(cabecalho) + " |",
            "| " + " | ".join("---" for _ in cabecalho) + " |"]
    fora += ["| " + " | ".join(celulas) + " |" for celulas in linhas]
    return "\n".join(fora)


def _spec_rows(spec, ctx):
    """As linhas que a descrição pede ("as minhas tarefas paradas")."""
    if re.search(r"(parad[ao]s?|stale|sem mexer|esquecid[ao]s?)", normalize(spec)):
        return sorted([r for r in ctx["rows"]
                       if not _row_done(r) and (r["age_days"] or 0) >= ctx["stale_days"]],
                      key=lambda r: -(r["age_days"] or 0))
    rows, _ = _task_filters(spec, ctx)
    return rows


def _note_table(spec, ctx, lang):
    """(título, tabela, nº de linhas) do que foi pedido para dentro da nota."""
    t = normalize(spec)
    if re.search(r"(por fazer|to-?dos?|minha lista|my list|kanban)", t):
        itens = [x for x in ctx["todos"] if not x["done"]][:MAX_TABLE]
        linhas = [[_cell(x["title"]), _cell(x["col_label"] or x["col"], 30),
                   _cell(_lbl(f"prio_{x['priority']}", lang)
                         if f"prio_{x['priority']}" in LBL else x["priority"], 20)]
                  for x in itens]
        cabecalho = [_lbl("tbl_item", lang), _lbl("tbl_col", lang), _lbl("tbl_prio", lang)]
        return _lbl("ttl_todos", lang), (_table(cabecalho, linhas) if linhas else ""), len(linhas)
    if re.search(r"\bccrs?\b", t):
        itens = ctx["ccrs"][:MAX_TABLE]
        linhas = [[_cell(f"CCR {c['id']}", 30),
                   _cell(_lbl("ccr_closed" if c["closed"] else
                              ("ccr_ready" if c["ready"] else "ccr_open"), lang), 30),
                   _cell(c["note"])] for c in itens]
        cabecalho = ["CCR", _lbl("tbl_state", lang), _lbl("tbl_note", lang)]
        return _lbl("ttl_ccrs", lang), (_table(cabecalho, linhas) if linhas else ""), len(linhas)
    if re.search(r"\bnotas?\b|\bnotes?\b", t):
        itens = ctx["notes"][:MAX_TABLE]
        linhas = [[_cell(n["title"]), _cell(n["folder"], 40)] for n in itens]
        cabecalho = [_lbl("tbl_note", lang), _lbl("tbl_folder", lang)]
        return _lbl("ttl_notes", lang), (_table(cabecalho, linhas) if linhas else ""), len(linhas)
    rows = _spec_rows(spec, ctx)[:MAX_TABLE]
    linhas = [[_cell(r["fn"]), _cell(r["todo"]),
               _cell(" · ".join(_row_states(r)) or "—", 40),
               _cell(r["book"]["name"], 40)] for r in rows]
    cabecalho = [_lbl("tbl_task", lang), _lbl("tbl_todo", lang),
                 _lbl("tbl_status", lang), _lbl("tbl_book", lang)]
    return _lbl("ttl_tasks", lang), (_table(cabecalho, linhas) if linhas else ""), len(linhas)


def _do_note_new(msg, ctx, lang):
    """Uma nota nova no quadro — vazia, ou já com uma tabela do que está aberto."""
    m = _NOTE_NEW_RE.search(msg.strip())
    if not m:
        return _reply(_lbl("need_note_title", lang))
    resto = m.group("rest").strip(" \"'.:-–")
    titulo, spec = resto, ""
    partes = _WITH_RE.split(resto, 1)
    if len(partes) == 2 and _SPEC_RE.search(normalize(partes[1])):
        titulo, spec = partes[0].strip(" \"'.:-–"), partes[1].strip()
    texto = ""
    if spec:
        nome, tabela, quantas = _note_table(spec, ctx, lang)
        if not tabela:
            return _reply(_lbl("note_new_empty", lang))
        titulo = titulo or nome
        texto = f"**{titulo}**\n\n{tabela}"[:5000]
    if not titulo:
        return _reply(_lbl("need_note_title", lang))
    titulo = titulo[:120]
    if texto:
        return _proposal(_lbl("ask_note_new_table", lang, t=titulo, n=quantas),
                         {"kind": "note_new", "title": titulo, "text": texto})
    return _proposal(_lbl("ask_note_new", lang, t=titulo),
                     {"kind": "note_new", "title": titulo, "text": ""})


# ---------------------------------------------------------------- motor local
# Ordem: primeiro as ordens (imperativas), depois as perguntas. O `search` é a
# última rede — nunca falha, no pior caso não encontra nada.
INTENTS = [
    ("help", r"^\s*(?:ajuda|help|\?)\s*$|\b(?:o que (?:sabes|podes|consegues)|"
             r"what can you|que comandos|comandos disponiveis|commands)\b", _do_help),
    # antes do todo_add: "cria uma NOTA" não é um item da lista Por fazer
    ("note_new", r"^\s*(?:cria|criar|nova|novo|abre|abrir|faz|fazer|create|new|make|start|add)"
                 r"\s+(?:uma|um|a|an)?\s*(?:nota|note)\b", _do_note_new),
    ("todo_add", r"^\s*(?:adiciona|acrescenta|junta|cria|criar|add|create|new)\b", _do_todo_add),
    ("todo_done", r"^\s*(?:marca|marcar|conclui|concluir|fecha|fechar|termina|terminar|"
                  r"acaba|acabar|mark|complete|finish|close)\b", _do_todo_done),
    ("todo_move", r"^\s*(?:move|mover|passa|passar|manda|mandar|arrasta|arrastar|put|send)\b"
                  r".*\b(?:para|pra|to|into)\b", _do_todo_move),
    ("todo_priority", r"^\s*(?:prioridade|priority|prio)\b", _do_todo_priority),
    ("todo_remove", r"^\s*(?:remove|remover|retira|retirar|apaga|apagar|elimina|eliminar|"
                    r"tira|tirar|delete|drop)\b", _do_todo_remove),
    ("obs_set", r"^\s*(?:obs|observacoes|observacao)\b", _do_obs_set),
    ("status_set", r"\b(?:estado|status)\b.*\b(?:para|como|to|=|->|passa a|fica)\b", _do_status_set),
    ("note_add", r"^\s*(?:nota|note|anota|anotar|apontamento)\b.*[:\-–]", _do_note_add),
    ("report_day", r"\b(?:o meu dia|my day|relatorio do dia|resumo do dia|"
                   r"day report|daily report)\b", _do_report_day),
    ("report", r"\b(?:relatorio|report|o meu periodo|my period|resumo do periodo|"
               r"a minha semana|my week|resumo da semana)\b", _do_report),
    ("summary", r"\b(?:resumo|panorama|situacao|estado geral|overview|summary|"
                r"como (?:esta|estamos))\b", _do_summary),
    ("stats", r"\b(?:estatisticas|numeros|stats|statistics|breakdown|"
              r"por estado|contagem geral)\b", _do_stats),
    ("gaps", r"\b(?:sem estados?|por preencher|em branco|por classificar|"
             r"no status|missing status|blank status|unfilled)\b", _do_gaps),
    ("next", r"\b(?:a seguir|proxim[oa]s?|por onde comeco|o que faco|"
             r"what next|next up|what should i do)\b", _do_next),
    ("urgent", r"\b(?:urgentes?|urgent|prioridade alta|alta prioridade|"
               r"high priority|prioridades)\b", _do_urgent),
    ("where", r"\b(?:livros abertos|que livros|abas abertas|onde estou|"
              r"open workbooks|which workbooks|where am i)\b", _do_where),
    ("stale", r"\b(?:parad[ao]s?|stale|sem mexer|stuck|esquecid[ao]s?)\b", _do_stale),
    ("pending", r"\b(?:por enviar|nao enviad[ao]s?|pendentes?|pending|"
                r"alteracoes locais|local changes|push)\b", _do_pending),
    ("count", r"^\s*(?:quant[oa]s|how many|numero de|number of)\b", _do_count),
    ("ccrs", r"\bccrs?\b", _do_ccrs),
    ("todos", r"\b(?:por fazer|to-?dos?|to do|minha lista|my list|kanban)\b", _do_todos),
    ("notes", r"\b(?:notas?|notes?)\b", _do_notes),
    ("tasks", r"\b(?:tarefas?|tasks?|linhas?|rows?|excel|folha|sheet)\b", _do_tasks),
    ("search", r".", _do_search),
]
_INTENTS = [(nome, re.compile(padrao), fn) for nome, padrao, fn in INTENTS]


def answer_local(message, ctx, lang="pt"):
    """Motor determinístico: o primeiro intent que bate certo responde."""
    texto = normalize(message)
    for nome, padrao, handler in _INTENTS:
        if padrao.search(texto):
            out = handler(message, ctx, lang)
            out.setdefault("intent", nome)
            out["engine"] = "local"
            return out
    return {**_do_search(message, ctx, lang), "intent": "search", "engine": "local"}


# ---------------------------------------------------------------- motor LLM
# Modelo por omissão. O motor local percebe um conjunto fechado de frases (ver
# INTENTS); este responde a perguntas escritas à maneira de cada um — mas
# continua a só saber o que a app tem aberto, porque é isso (e nada mais) que
# vai no pedido.
# O motor pelo modelo vive no `chatllm.py`: são dois assuntos diferentes (um é
# determinista e é o que responde sempre, o outro fala com um serviço lá fora e
# pode falhar) e estavam no mesmo ficheiro de 84 KB. O import é aqui dentro de
# propósito — o chatllm importa deste módulo, e ao contrário ficava um ciclo.
LLM_LOCAL_FIRST = {"help", "todo_add", "todo_done", "todo_move", "todo_priority",
                   "todo_remove", "status_set", "obs_set", "note_add", "note_new"}


def engine_fn(nome):
    """O motor a usar: None quando é o local (que é o que responde sempre)."""
    if str(nome or "").strip().lower() != "llm":
        return None
    from . import chatllm
    return chatllm.llm_reply


ENGINE_NAMES = ("local", "llm")



def answer(message, context=None, lang="pt"):
    """Resposta do assistente ao que foi escrito.

    Devolve {reply, items, action, confirm, intent, engine[, engine_note]}.
    Nunca lê a folha: o `context` é o retrato que o cliente já tem em memória.
    """
    lang = lang if lang in ("pt", "en") else "pt"
    mensagem = str(message or "").strip()[:1000]
    ctx = normalize_context(context)
    if not mensagem:
        return {**_reply(_lbl("empty", lang)), "intent": "empty", "engine": "local"}

    cfg = load_chat_config()
    motor = engine_fn(cfg.get("engine"))
    if motor is not None:
        try:
            out = motor(mensagem, ctx, lang, cfg)
            out.setdefault("engine", "llm")
            return out
        except ChatEngineError:
            # o motor local responde sempre: vale mais do que devolver um erro
            out = answer_local(mensagem, ctx, lang)
            out["engine_note"] = _lbl("llm_off", lang)
            return out
    return answer_local(mensagem, ctx, lang)
