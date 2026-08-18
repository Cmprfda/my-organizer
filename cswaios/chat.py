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
ordens (o intent `help` lista-as). O motor `llm` é o encaixe para mais tarde —
está documentado e devolve um erro claro enquanto não estiver configurado, e
nesse caso a resposta cai no motor local com um aviso.
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
                  "- any other text searches everything that is open"),
    "help_write": ("**Alterações** (peço sempre confirmação; nada vai ao Excel sem o Push)\n"
                   "- `adiciona à lista: <tarefa>`\n"
                   "- `marca como feito: <tarefa>`\n"
                   "- `estado de <tarefa> para <valor>` (ou `estado tp de … para …`)\n"
                   "- `nota em <tarefa>: <texto>`",
                   "**Changes** (always confirmed first; nothing reaches Excel without the Push)\n"
                   "- `add to my list: <task>`\n"
                   "- `mark as done: <task>`\n"
                   "- `status of <task> to <value>` (or `status tp of … to …`)\n"
                   "- `note on <task>: <text>`"),
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
    achados = _find_todos(ctx, alvo)
    if not achados:
        return _reply(_lbl("todo_notfound", lang, q=alvo))
    if len(achados) > 1:
        nomes = ", ".join(f'"{t["title"]}"' for t in achados[:4])
        return _reply(_lbl("todo_ambiguous", lang, q=alvo, names=nomes),
                      items=[_todo_item(t) for t in achados[:MAX_HITS]])
    item = achados[0]
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
    achados = _find_rows(ctx, alvo)
    if not achados:
        return _reply(_lbl("task_notfound", lang, q=alvo))
    if len(achados) > 1:
        nomes = ", ".join(f'"{_row_label(r)}"' for r in achados[:4])
        return _reply(_lbl("task_ambiguous", lang, q=alvo, n=len(achados), names=nomes),
                      items=[_row_item(r) for r in achados[:MAX_HITS]])
    row = achados[0]
    valor = _resolve_status(valor, row["book"]["statuses"])
    rotulo = _lbl("status_col_tp" if coluna == "Status TP" else "status_col", lang)
    return _proposal(
        _lbl("ask_status", lang, col=rotulo, t=_row_label(row), v=valor),
        {"kind": "status_set", "column": coluna, "value": valor,
         "ref": {"workbook": row["book"]["name"], "sheet": row["book"]["sheet"],
                 "file": row["book"]["file"], "fn": row["fn"], "todo": row["todo"],
                 "xlrow": row["xlrow"]}},
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
    achados = _find_rows(ctx, alvo)
    if not achados:
        return _reply(_lbl("task_notfound", lang, q=alvo))
    if len(achados) > 1:
        nomes = ", ".join(f'"{_row_label(r)}"' for r in achados[:4])
        return _reply(_lbl("task_ambiguous", lang, q=alvo, n=len(achados), names=nomes),
                      items=[_row_item(r) for r in achados[:MAX_HITS]])
    row = achados[0]
    # a nota de uma linha é uma só: com uma já escrita, isto vai juntar-se a ela
    # (é o cliente que faz a junção, ver chatAddNote em static/js/chat.js)
    return _proposal(
        _lbl("ask_note_more" if row["note"] else "ask_note",
             lang, t=_row_label(row), n=texto),
        {"kind": "note_add", "note": texto,
         "ref": {"workbook": row["book"]["name"], "sheet": row["book"]["sheet"],
                 "file": row["book"]["file"], "fn": row["fn"], "todo": row["todo"],
                 "xlrow": row["xlrow"]}},
        items=[_row_item(row)])


# ---------------------------------------------------------------- motor local
# Ordem: primeiro as ordens (imperativas), depois as perguntas. O `search` é a
# última rede — nunca falha, no pior caso não encontra nada.
INTENTS = [
    ("help", r"^\s*(?:ajuda|help|\?)\s*$|\b(?:o que (?:sabes|podes|consegues)|"
             r"what can you|que comandos|comandos disponiveis|commands)\b", _do_help),
    ("todo_add", r"^\s*(?:adiciona|acrescenta|junta|cria|criar|add|create|new)\b", _do_todo_add),
    ("todo_done", r"^\s*(?:marca|marcar|conclui|concluir|fecha|fechar|termina|terminar|"
                  r"acaba|acabar|mark|complete|finish|close)\b", _do_todo_done),
    ("status_set", r"\b(?:estado|status)\b.*\b(?:para|como|to|=|->|passa a|fica)\b", _do_status_set),
    ("note_add", r"^\s*(?:nota|note|anota|anotar|apontamento)\b.*[:\-–]", _do_note_add),
    ("report_day", r"\b(?:o meu dia|my day|relatorio do dia|resumo do dia|"
                   r"day report|daily report)\b", _do_report_day),
    ("report", r"\b(?:relatorio|report|o meu periodo|my period|resumo do periodo|"
               r"a minha semana|my week|resumo da semana)\b", _do_report),
    ("summary", r"\b(?:resumo|panorama|situacao|estado geral|overview|summary|"
                r"como (?:esta|estamos))\b", _do_summary),
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
LLM_MODEL = "claude-opus-5"
# Não se mede em palavras: com o pensamento adaptável ligado (o normal nos
# modelos atuais) o raciocínio conta para este limite, e um limite curto corta a
# resposta a meio. Isto é um teto, não um alvo — só se paga o que for gerado.
LLM_MAX_TOKENS = 16000
# Quantas linhas de cada lista vão no pedido. O contexto já chega cortado
# (normalize_context), mas uma folha grande continua a dar centenas de linhas —
# e o que interessa a uma pergunta são as primeiras.
LLM_ROWS = 120
LLM_ITEMS = 60

LLM_SYSTEM = {
    "pt": (
        "És o assistente do My Organizer, uma app que um engenheiro de V&V usa "
        "para acompanhar as tarefas dele numa folha de Excel partilhada, uma "
        "lista Por fazer, CCRs e notas.\n"
        "Respondes SÓ com o que vem no contexto desta mensagem: é o retrato do "
        "que a app tem aberta neste momento. Nunca leste a folha nem o "
        "OneDrive.\n"
        "Se a resposta não estiver no contexto, di-lo com todas as letras e "
        "diz onde é que ela se poderia encontrar (que vista, que botão) — não "
        "inventes tarefas, estados, números nem nomes.\n"
        "Não mudas nada: não tens forma de escrever na folha, na lista ou nas "
        "notas. Se te pedirem uma alteração, explica que ela se pede em "
        "linguagem direta (\"adiciona à minha lista: X\", \"estado de X para "
        "Done\") e que a app mostra sempre o que vai fazer e espera por "
        "Confirmar.\n"
        "Escreve em português de Portugal, curto e direto, sem saudações nem "
        "fecho. Podes usar listas com \"-\" e **negrito**."
    ),
    "en": (
        "You are the My Organizer assistant, an app a V&V engineer uses to "
        "follow their own tasks on a shared Excel sheet, a TODO list, CCRs and "
        "notes.\n"
        "Answer ONLY from the context in this message: it is a snapshot of what "
        "the app has open right now. You have never read the sheet or "
        "OneDrive.\n"
        "If the answer is not in the context, say so plainly and say where it "
        "could be found (which view, which button) — never invent tasks, "
        "statuses, numbers or names.\n"
        "You change nothing: you have no way to write to the sheet, the list or "
        "the notes. If asked for a change, explain that it is asked in plain "
        "words (\"add to my list: X\", \"status of X to Done\") and that the app "
        "always shows what it is about to do and waits for Confirm.\n"
        "Write in short, direct English, no greeting and no sign-off. Lists "
        "with \"-\" and **bold** are fine."
    ),
}


def _llm_context_text(ctx, lang):
    """O contexto em texto, que é o que vai no pedido.

    Sai das mesmas listas que o motor local lê, no formato mais curto que ainda
    se percebe — cada linha é uma tarefa/item, com o que a distingue."""
    partes = [context_digest(ctx, lang)]
    if ctx["books"]:
        partes.append("\n## " + ("Linhas da folha" if lang == "pt" else "Sheet rows"))
        for row in ctx["rows"][:LLM_ROWS]:
            estados = " · ".join(_row_states(row)) or "—"
            idade = f" · {'>=' if row['age_est'] else ''}{row['age_days']}d" if row["age_days"] else ""
            # a aba pertence ao livro, não à linha (ver _norm_row)
            partes.append(f"- [{row['book']['name']}/{row['book']['sheet']}] "
                          f"{row['fn'] or '?'} | {_short(row['todo'], 90)} | {estados}"
                          f"{' | minha' if row['mine'] else ''}{idade}")
        if len(ctx["rows"]) > LLM_ROWS:
            partes.append(f"- (+{len(ctx['rows']) - LLM_ROWS} …)")
    if ctx["todos"]:
        partes.append("\n## " + ("Por fazer" if lang == "pt" else "TODO"))
        for item in ctx["todos"][:LLM_ITEMS]:
            jira = f" | Jira {', '.join(item['jira'])}" if item.get("jira") else ""
            partes.append(f"- {item['title']} | {item['col_label']} | "
                          f"{item['priority']}{jira}"
                          + (f" | {_short(item['detail'], 90)}" if item.get("detail") else ""))
    if ctx["ccrs"]:
        partes.append("\n## CCRs")
        for c in ctx["ccrs"][:LLM_ITEMS]:
            marca = "fechada" if c["closed"] else ("pronta a fechar" if c["ready"] else "aberta")
            partes.append(f"- {c['id']} | {marca}"
                          + (f" | {_short(c['note'], 90)}" if c.get("note") else ""))
    if ctx["notes"]:
        partes.append("\n## " + ("Notas" if lang == "pt" else "Notes"))
        for n in ctx["notes"][:LLM_ITEMS]:
            partes.append(f"- {n['title'] or '(sem título)'}"
                          + (f" ({n['folder']})" if n.get("folder") else "")
                          + f" | {_short(n['text'], 120)}")
    return "\n".join(partes)


def _llm_client(cfg_llm):
    """Cliente da Anthropic. A chave pode vir do chat_config.json ou do
    ambiente (ANTHROPIC_API_KEY) — sem nenhuma delas o SDK ainda encontra um
    perfil de `ant auth login`, por isso não se exige nada aqui.

    O SDK não é requisito da app (ver requirements.txt): o import fica cá
    dentro, e a falta dele é só mais um motivo para cair no motor local.
    """
    try:
        import anthropic
    except ImportError as exc:
        raise ChatEngineError("o pacote `anthropic` não está instalado") from exc
    chave = str((cfg_llm or {}).get("api_key") or "").strip()
    try:
        return anthropic.Anthropic(api_key=chave) if chave else anthropic.Anthropic()
    except Exception as exc:                       # sem credencial nenhuma
        raise ChatEngineError(f"cliente da Anthropic: {exc}") from exc


def _llm_reply(message, ctx, lang, cfg):
    """Resposta pelo modelo, para as perguntas que o motor local não cobre.

    O que este motor NÃO faz é escrever: as ordens (adicionar à lista, mudar um
    estado, escrever uma nota) continuam a passar pelo motor local, que devolve
    a `action` com a confirmação que o cliente sabe executar. Assim o caminho
    das escritas é o mesmo com ou sem LLM ligado — o modelo nunca é o que
    decide mexer nos dados de ninguém.

    Configuração (`chat_config.json`, estado local, fora das releases):
        {"engine": "llm",
         "llm": {"provider": "anthropic", "model": "claude-opus-5",
                 "api_key": "sk-ant-…"}}

    Qualquer falha (sem SDK, sem chave, sem rede, resposta recusada) sai como
    ChatEngineError e a pergunta é respondida pelo motor local.
    """
    cfg_llm = cfg.get("llm") if isinstance(cfg.get("llm"), dict) else {}
    provider = str(cfg_llm.get("provider") or "anthropic").strip().lower()
    if provider != "anthropic":
        raise ChatEngineError(f"provider desconhecido: {provider}")

    # ordens continuam a ser do motor local (ver o texto acima)
    texto = normalize(message)
    for nome, padrao, handler in _INTENTS:
        if nome in LLM_LOCAL_FIRST and padrao.search(texto):
            out = handler(message, ctx, lang)
            out.setdefault("intent", nome)
            out["engine"] = "local"
            return out

    client = _llm_client(cfg_llm)
    modelo = str(cfg_llm.get("model") or LLM_MODEL).strip() or LLM_MODEL
    conteudo = (f"{_llm_context_text(ctx, lang)}\n\n"
                f"## {'Pergunta' if lang == 'pt' else 'Question'}\n{message}")
    try:
        resposta = client.messages.create(
            model=modelo,
            max_tokens=LLM_MAX_TOKENS,
            system=LLM_SYSTEM["en" if lang == "en" else "pt"],
            messages=[{"role": "user", "content": conteudo}],
        )
    except Exception as exc:                       # rede, chave errada, 429…
        raise ChatEngineError(f"pedido ao modelo: {exc}") from exc
    if getattr(resposta, "stop_reason", "") == "refusal":
        raise ChatEngineError("o modelo recusou responder")
    partes = [b.text for b in (resposta.content or []) if getattr(b, "type", "") == "text"]
    reply = "\n".join(p for p in partes if p).strip()
    if not reply:
        raise ChatEngineError("resposta vazia do modelo")
    # Os itens continuam a sair da pesquisa local sobre o mesmo contexto: são
    # eles que dão os atalhos clicáveis, e são verificáveis — ao contrário de
    # uma lista que o modelo escrevesse.
    achados = _do_search(message, ctx, lang).get("items") or []
    return {"reply": reply, "items": achados[:8], "action": None, "confirm": None,
            "intent": "llm", "engine": "llm"}


# intents que continuam a ser do motor local mesmo com o LLM ligado: as ordens
# (que devolvem uma `action` a confirmar) e a ajuda (que descreve a app, não o
# modelo)
LLM_LOCAL_FIRST = {"help", "todo_add", "todo_done", "status_set", "note_add"}


ENGINES = {"local": None, "llm": _llm_reply}   # None = answer_local (o motor de base)


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
    motor = ENGINES.get(str(cfg.get("engine") or "local").strip().lower())
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
