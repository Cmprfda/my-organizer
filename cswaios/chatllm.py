# -*- coding: utf-8 -*-
"""Motor do assistente pelo modelo (LLM), com ferramentas sobre o que está aberto.

Vivia dentro do `chat.py`, que tinha 84 KB e dois assuntos: o motor local, que é
determinista e responde sempre, e este, que fala com um serviço lá fora e pode
falhar de dez maneiras. São ficheiros separados desde a v155 — o `chat.py`
importa este aqui só quando o motor escolhido é o `llm` (ver `chat.engine_fn`).

O que este motor NÃO faz continua igual: não escreve. As ordens (adicionar à
lista, mudar um estado, escrever uma nota) passam pelo motor local, que devolve
a `action` com a confirmação que o cliente executa. E não lê a folha: as
ferramentas trabalham sobre o retrato que o cliente mandou e sobre o que o
servidor já tem em memória (ver tasks.cached_rows) — nunca sobre o disco ou a
nuvem.
"""

from .chat import (ChatEngineError, _CLASSES, _INTENTS, _do_search, _do_stats,
                   _matches, _row_class, _row_done, _row_label, _row_states,
                   _short, _terms, context_digest)
from .history import recent_events
from .tasks import cached_books, cached_rows
from .text import normalize

LLM_MODEL = "claude-opus-5"
# Não se mede em palavras: com o pensamento adaptável ligado (o normal nos
# modelos atuais) o raciocínio conta para este limite, e um limite curto corta a
# resposta a meio. Isto é um teto, não um alvo — só se paga o que for gerado.
LLM_MAX_TOKENS = 16000
# Quantas linhas de cada lista vão no PRIMEIRO pedido. Isto é só o retrato de
# entrada: o que o modelo não vê aqui vai buscar com as ferramentas (ver
# LLM_TOOLS), em vez de a resposta ficar limitada às primeiras linhas.
LLM_ROWS = 120
LLM_ITEMS = 60
# ferramentas: quanto cada chamada devolve e quantas idas e voltas se aceitam
# antes de responder com o que houver (uma pergunta não pode ficar a rodar)
LLM_TOOL_MAX = 40
LLM_MAX_STEPS = 6

LLM_SYSTEM = {
    "pt": (
        "És o assistente do My Organizer, uma app que um engenheiro de V&V usa "
        "para acompanhar as tarefas dele numa folha de Excel partilhada, uma "
        "lista Por fazer, CCRs e notas.\n"
        "Respondes SÓ com o que a app tem aberto neste momento. A primeira "
        "mensagem traz o princípio de cada lista; o resto vais buscar com as "
        "ferramentas — elas leem o que já está em memória, nunca a folha nem "
        "o OneDrive. As ferramentas: procurar e listar (sobre o retrato "
        "desta janela), `sheet_rows` (TODAS as linhas de TODAS as folhas "
        "que o servidor já leu, sem teto e sem ser só desta janela), "
        "`history` (o que mudou na folha nos últimos dias, que o Excel "
        "não guarda) e as contas. Se a pergunta for sobre linhas que não "
        "estão no princípio da lista, usa as ferramentas em vez de "
        "responder pelo que viste.\n"
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
        "Answer ONLY from what the app has open right now. The first message "
        "carries the beginning of each list; get the rest with the tools "
        "— they read what is already in memory, never the sheet or OneDrive. "
        "The tools: search and list (over this window's snapshot), "
        "`sheet_rows` (EVERY row of EVERY sheet the server has read, no "
        "cap and not just this window), `history` (what changed on the "
        "sheet in the last days, which Excel does not keep) and counts. "
        "If the question is about rows beyond the beginning of the list, "
        "use the tools instead of answering from what you were shown.\n"
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


# ---------------------------------------------------------------- ferramentas
# O motor LLM levava no pedido as primeiras 120 linhas e 60 itens de cada lista:
# numa folha grande respondia sobre essa fatia e não sabia que havia mais. As
# ferramentas abaixo dão-lhe o resto SEM abrir nada — leem o mesmo `ctx` que o
# cliente mandou, que é o retrato do que a app tem aberto. Continuam a não
# escrever: as ordens são do motor local (ver LLM_LOCAL_FIRST).
LLM_TOOLS = [
    {
        "name": "search",
        "description": ("Search everything the app has open — sheet rows, TODO items, "
                        "CCRs and notes — for a text. Use it whenever the question "
                        "names a task, a function, a CCR or a person."),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Words to look for."},
                "limit": {"type": "integer",
                          "description": f"How many hits to return (max {LLM_TOOL_MAX})."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "list_rows",
        "description": ("Page through the sheet rows the app has open. Use `offset` to "
                        "walk past the rows you have already seen."),
        "input_schema": {
            "type": "object",
            "properties": {
                "book": {"type": "string",
                         "description": "Workbook name (part of it is enough). Omit for all."},
                "state": {"type": "string", "enum": ["any", "done", "doing", "blocked", "other"],
                          "description": "Only rows whose status falls in this class."},
                "mine": {"type": "boolean", "description": "Only rows that are mine."},
                "stale": {"type": "boolean",
                          "description": "Only unfinished rows with no change for stale_days."},
                "offset": {"type": "integer", "description": "Rows to skip."},
                "limit": {"type": "integer",
                          "description": f"How many rows to return (max {LLM_TOOL_MAX})."},
            },
        },
    },
    {
        "name": "list_items",
        "description": "Page through the TODO list, the CCRs or the board notes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": ["todos", "ccrs", "notes"]},
                "offset": {"type": "integer", "description": "Items to skip."},
                "limit": {"type": "integer",
                          "description": f"How many items to return (max {LLM_TOOL_MAX})."},
            },
            "required": ["kind"],
        },
    },
    {
        "name": "sheet_rows",
        "description": ("Page through EVERY row of the sheets the server has already "
                        "read - all workbooks, not only the ones in the asking "
                        "window, and with no cap on how far down the sheet. Use it "
                        "when `list_rows` and `search` come up short, or when the "
                        "question is about a row nobody has on screen. Reads memory "
                        "only, never the file."),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string",
                          "description": "Words that must all appear in the row."},
                "book": {"type": "string", "description": "Workbook name (part is enough)."},
                "sheet": {"type": "string", "description": "Sheet name (part is enough)."},
                "offset": {"type": "integer", "description": "Rows to skip."},
                "limit": {"type": "integer",
                          "description": f"How many rows to return (max {LLM_TOOL_MAX})."},
            },
        },
    },
    {
        "name": "history",
        "description": ("What changed on the sheets in the last days: date, workbook, "
                        "row, column, old to new value, and whether it was pushed from "
                        "this app or edited by someone in the workbook. Excel keeps "
                        "none of this. Use it for what happened to a task, who has "
                        "been changing it, or what moved this week."),
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "How many days back (default 7)."},
                "query": {"type": "string",
                          "description": "Only changes whose row or value matches these words."},
                "limit": {"type": "integer",
                          "description": f"How many changes to return (max {LLM_TOOL_MAX})."},
            },
        },
    },
    {
        "name": "counts",
        "description": ("Totals of everything open: rows per workbook and per status "
                        "class, mine, unfinished, pending changes, TODO, CCRs and notes. "
                        "Use this for \"how many\" instead of paging through the rows."),
        "input_schema": {"type": "object", "properties": {}},
    },
]


def _llm_limit(args, default=10):
    try:
        n = int(args.get("limit") or default)
    except (TypeError, ValueError):
        n = default
    return max(1, min(LLM_TOOL_MAX, n))


def _llm_offset(args):
    try:
        return max(0, int(args.get("offset") or 0))
    except (TypeError, ValueError):
        return 0


def _llm_row_line(row):
    """Uma linha da folha em texto, com o que serve para responder sobre ela."""
    partes = [f"linha {row['xlrow']}", _row_label(row)]
    estados = " · ".join(_row_states(row))
    if estados:
        partes.append(estados)
    if row["people"]:
        partes.append(row["people"])
    if row["age_days"] is not None:
        partes.append(("≥" if row["age_est"] else "") + f"{row['age_days']}d")
    if row["obs"]:
        partes.append(f"OBS: {_short(row['obs'], 90)}")
    if row["over"]:
        partes.append("por enviar: " + ", ".join(row["over"]))
    return f"- [{row['book']['name']}] " + " | ".join(partes)


def _llm_tool_search(ctx, args):
    termos = _terms(str(args.get("query") or ""))
    if not termos:
        return "sem termos de procura"
    limite = _llm_limit(args, 12)
    linhas = []
    for r in ctx["rows"]:
        if _matches(f"{r['fn']} {r['todo']} {r['obs']} {r['text']}", termos):
            linhas.append(_llm_row_line(r))
    for t in ctx["todos"]:
        if _matches(f"{t['title']} {t['detail']}", termos):
            linhas.append(f"- [Por fazer] {t['title']} | {t['col_label'] or t['col']}"
                          f" | {t['priority']}")
    for c in ctx["ccrs"]:
        if _matches(f"CCR {c['id']} {c['note']}", termos):
            estado = "fechada" if c["closed"] else ("pronta a fechar" if c["ready"] else "aberta")
            linhas.append(f"- [CCR] {c['id']} | {estado} | {_short(c['note'], 90)}")
    for n in ctx["notes"]:
        if _matches(f"{n['title']} {n['folder']} {n['text']}", termos):
            linhas.append(f"- [Nota] {n['title'] or '(sem título)'} | {n['folder']}"
                          f" | {_short(n['text'], 90)}")
    if not linhas:
        return "nada encontrado"
    return (f"{len(linhas)} encontrado(s)"
            + (f", os primeiros {limite}" if len(linhas) > limite else "") + ":\n"
            + "\n".join(linhas[:limite]))


def _llm_tool_rows(ctx, args):
    livro = normalize(str(args.get("book") or ""))
    estado = str(args.get("state") or "any").strip().lower()
    rows = ctx["rows"]
    if livro:
        rows = [r for r in rows if livro in normalize(r["book"]["name"])]
    if estado in _CLASSES:
        rows = [r for r in rows if _row_class(r) == estado]
    if args.get("mine"):
        rows = [r for r in rows if r["mine"]]
    if args.get("stale"):
        # a mesma regra do intent "tarefas paradas" (_do_stale): por fechar e sem
        # mexer há tantos dias como o que está escolhido nas Definições
        rows = [r for r in rows
                if r["age_days"] is not None and not _row_done(r)
                and r["age_days"] >= ctx["stale_days"]]
    inicio, limite = _llm_offset(args), _llm_limit(args)
    fatia = rows[inicio:inicio + limite]
    if not fatia:
        return f"{len(rows)} linha(s) no total; nada a partir da posição {inicio}"
    return (f"{len(rows)} linha(s) no total, da posição {inicio}:\n"
            + "\n".join(_llm_row_line(r) for r in fatia))


def _llm_tool_items(ctx, args):
    kind = str(args.get("kind") or "todos").strip().lower()
    inicio, limite = _llm_offset(args), _llm_limit(args)
    if kind == "ccrs":
        fonte = [f"- {c['id']} | "
                 + ("fechada" if c["closed"] else ("pronta a fechar" if c["ready"] else "aberta"))
                 + (f" | {_short(c['note'], 90)}" if c["note"] else "")
                 for c in ctx["ccrs"]]
    elif kind == "notes":
        fonte = [f"- {n['title'] or '(sem título)'}"
                 + (f" ({n['folder']})" if n["folder"] else "")
                 + f" | {_short(n['text'], 120)}"
                 for n in ctx["notes"]]
    else:
        fonte = [f"- {t['title']} | {t['col_label'] or t['col']} | {t['priority']}"
                 + (" | feito" if t["done"] else "")
                 + (f" | {_short(t['detail'], 90)}" if t["detail"] else "")
                 for t in ctx["todos"]]
    fatia = fonte[inicio:inicio + limite]
    if not fatia:
        return f"{len(fonte)} item(ns) no total; nada a partir da posição {inicio}"
    return (f"{len(fonte)} item(ns) no total, da posição {inicio}:\n" + "\n".join(fatia))


def _llm_tool_counts(ctx, lang):
    # as contas são as MESMAS do motor local: uma resposta do modelo e o cartão
    # das Métricas não podem dar números diferentes sobre a mesma folha
    return _do_stats("", ctx, lang).get("reply") or "sem nada aberto"


def _llm_tool_sheet_rows(args):
    """Linhas do que o servidor tem em memória (ver tasks.cached_rows).

    É a ferramenta que tira o teto ao que o modelo pode saber: o retrato do
    cliente traz as primeiras LLM_ROWS linhas de cada livro aberto NAQUELA
    janela, e isto vê todas as folhas já lidas por esta instância — incluindo
    livros que quem está a perguntar não tem sequer abertos.
    """
    out = cached_rows(book=args.get("book") or "", sheet=args.get("sheet") or "",
                      query=args.get("query") or "",
                      limit=_llm_limit(args), offset=_llm_offset(args))
    if not out["rows"]:
        lidas = cached_books()
        if not lidas:
            return "o servidor ainda não leu nenhuma folha"
        onde = ", ".join(f"{b['book']}/{b['sheet']} ({b['rows']} linhas)"
                         for b in lidas[:8])
        return f"nada corresponde. Folhas em memória: {onde}"
    cabeca = (f"{out['total']} linha(s) correspondem; {len(out['rows'])} aqui "
              f"(offset {_llm_offset(args)})")
    corpo = [f"- [{r['book']}/{r['sheet']} L{r['xlrow']}] {r['text']}"
             for r in out["rows"]]
    return cabeca + ":\n" + "\n".join(corpo)


def _book_label(book):
    """Nome curto do livro para uma linha de texto. O `book` dos eventos é a
    identidade dele (um caminho, ou o id do item no OneDrive) e um id de 90
    caracteres no meio da resposta não diz nada a ninguém."""
    texto = str(book or "")
    if texto.startswith("onedrive:"):
        return "OneDrive"
    return texto.replace(chr(92), "/").rsplit("/", 1)[-1] or texto


def _llm_tool_history(args):
    """As alterações da folha nos últimos dias (o histórico do servidor).

    Isto não vem no retrato do cliente e não existe no Excel: é a app que o
    guarda (ver cswaios/history.py). Sem ferramenta, o modelo não tinha como
    responder ao "o que mudou nesta semana" a não ser inventando.
    """
    try:
        dias = max(1, min(92, int(args.get("days") or 7)))
    except (TypeError, ValueError):
        dias = 7
    termos = _terms(str(args.get("query") or ""))
    linhas = []
    for e in recent_events(days=dias, limit=400):
        texto = (f"{str(e.get('ts') or '')[:16].replace('T', ' ')} "
                 f"[{_book_label(e.get('book'))}/{e.get('sheet') or ''}] "
                 f"L{e.get('xlrow') or '?'} "
                 f"{e.get('fn') or ''} {e.get('todo') or ''} · {e.get('col') or ''}: "
                 f"{_short(e.get('from') or '(vazio)', 60)} -> "
                 f"{_short(e.get('to') or '(vazio)', 60)}"
                 f" ({'app' if e.get('via') == 'app' else 'folha'})")
        if termos and not _matches(texto, termos):
            continue
        linhas.append("- " + texto)
        if len(linhas) >= _llm_limit(args):
            break
    if not linhas:
        return f"nenhuma alteração registada nos últimos {dias} dias"
    return f"alterações dos últimos {dias} dias:\n" + "\n".join(linhas)


def _llm_run_tool(name, args, ctx, lang):
    """Corre uma ferramenta e devolve o texto do tool_result."""
    args = args if isinstance(args, dict) else {}
    try:
        if name == "search":
            return _llm_tool_search(ctx, args)
        if name == "list_rows":
            return _llm_tool_rows(ctx, args)
        if name == "list_items":
            return _llm_tool_items(ctx, args)
        if name == "sheet_rows":
            return _llm_tool_sheet_rows(args)
        if name == "history":
            return _llm_tool_history(args)
        if name == "counts":
            return _llm_tool_counts(ctx, lang)
    except Exception as exc:                        # uma ferramenta não parte a resposta
        return f"a ferramenta falhou: {exc}"
    return f"ferramenta desconhecida: {name}"


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


def llm_reply(message, ctx, lang, cfg):
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
    mensagens = [{"role": "user", "content": conteudo}]
    # Ciclo de ferramentas: o modelo pede o que lhe falta (procurar, listar,
    # contar) e as ferramentas respondem a partir do mesmo retrato em memória.
    # O teto de passos é uma questão de paciência de quem escreveu a pergunta:
    # chegado lá, pede-se a resposta com o que houver.
    resposta = None
    for passo in range(LLM_MAX_STEPS):
        try:
            resposta = client.messages.create(
                model=modelo,
                max_tokens=LLM_MAX_TOKENS,
                system=LLM_SYSTEM["en" if lang == "en" else "pt"],
                thinking={"type": "adaptive"},
                tools=LLM_TOOLS,
                messages=mensagens,
            )
        except Exception as exc:                   # rede, chave errada, 429…
            raise ChatEngineError(f"pedido ao modelo: {exc}") from exc
        if getattr(resposta, "stop_reason", "") == "refusal":
            raise ChatEngineError("o modelo recusou responder")
        pedidos = [b for b in (resposta.content or [])
                   if getattr(b, "type", "") == "tool_use"]
        if not pedidos:
            break
        mensagens.append({"role": "assistant", "content": resposta.content})
        # todos os resultados na MESMA mensagem, como a API pede
        mensagens.append({"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": b.id,
             "content": _llm_run_tool(b.name, b.input, ctx, lang)}
            for b in pedidos]})
        if passo == LLM_MAX_STEPS - 2:
            mensagens.append({"role": "user", "content":
                              "Responde agora, com o que já tens."
                              if lang == "pt" else
                              "Answer now, with what you already have."})
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
LLM_LOCAL_FIRST = {"help", "todo_add", "todo_done", "todo_move", "todo_priority",
                   "todo_remove", "status_set", "obs_set", "note_add", "note_new"}
