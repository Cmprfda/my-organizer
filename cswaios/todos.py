# -*- coding: utf-8 -*-
"""TODO list pessoal: normalização, cronómetros e persistência."""

import json
import os
import re
import time
from datetime import date, datetime, timedelta

from .config import HERE
from .statefile import read_json, write_json
from .text import normalize

# TODO list pessoal (itens próprios + tarefas/CCRs arrastadas para lá)
TODO_FILE = os.path.join(HERE, "todo.json")
# Colunas de sempre do Kanban (as que têm significado para a app: o cronómetro
# só corre em "inprogress" e "done" fecha o item).
TODO_BUILTIN_COLUMNS = ("todo", "inprogress", "review", "done")
# O utilizador pode criar as suas colunas no quadro ("à espera", "pendente"…) e
# esconder as que não usa. Essas colunas viajam no campo `col` do item como
# qualquer outra, por isso a validação não pode ser uma lista fechada: aceita-se
# qualquer id com forma de slug curto. A lista ordenada (com os nomes escolhidos
# e as escondidas) é uma preferência de apresentação e vive no browser — ver
# `todoColConf` em static/js/todo.js.
TODO_COLUMN_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,23}$")


def valid_todo_column(col):
    """Um id de coluna aceitável para o campo `col` de um item."""
    return bool(TODO_COLUMN_ID.match(str(col or "").strip().lower()))


class _TodoColumns:
    """Colunas aceitáveis num item: as fixas + as criadas pelo utilizador.

    Comporta-se como o conjunto fixo que substituiu (`col in TODO_COLUMNS`,
    iterável, `len`), mas o teste de pertença também deixa passar as colunas
    novas do quadro — sem isso o servidor recusava-as com "coluna TODO
    inválida" e o cartão nunca saía do sítio.
    """

    def __contains__(self, col):
        return valid_todo_column(col)

    def __iter__(self):
        return iter(TODO_BUILTIN_COLUMNS)

    def __len__(self):
        return len(TODO_BUILTIN_COLUMNS)

    def __repr__(self):
        return "TODO_COLUMNS(%s|custom)" % "|".join(TODO_BUILTIN_COLUMNS)


TODO_COLUMNS = _TodoColumns()
# prioridade do item, da mais baixa para a mais alta. Os itens antigos (e os
# criados sem a indicar) ficam em "normal" — é o valor neutro.
TODO_PRIORITIES = ("low", "normal", "high", "urgent")
TODO_PRIORITY_DEFAULT = "normal"
# repetição de um item: quando ele é dado como feito, nasce outro igual com a
# data-limite seguinte. "" = não repete (o valor de todos os itens antigos).
TODO_REPEATS = ("", "daily", "weekdays", "weekly", "biweekly", "monthly")
# data-limite: só o dia interessa (a hora não diz nada num quadro destes)
DUE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# dias guardados no registo do cronómetro. 400 é mais do que qualquer período
# que as Métricas saibam mostrar (92 dias) e chega para um ano de trabalho.
TIMER_SEGMENTS_MAX = 400
# origens que um item pode ter ligadas além da sua (só as que sabem apontar
# para uma linha: escrever à mão não tem para onde ir)
TODO_LINK_KINDS = ("task", "ccr")
# "workbook" = nome do livro a que a linha pertence (várias origens podem ter a
# mesma aba/função em livros diferentes)
TODO_REF_KEYS = ("workbook", "sheet", "fn", "todo", "ccr")


def normalize_ref(raw):
    if not isinstance(raw, dict):
        return {}
    return {k: str(v).strip()[:200] for k, v in raw.items() if k in TODO_REF_KEYS and v}


def row_key_text(value):
    """Um valor da chave da linha do Excel (função ou "o que fazer") pronto a
    comparar com o que está guardado no `ref` do item.

    A origem do item é guardada cortada a 200 caracteres (normalize_ref), mas a
    folha traz a célula inteira: sem o mesmo corte dos dois lados, uma linha com
    um "To Do" longo nunca voltava a bater certo com o item que dela nasceu — e
    então nem o item mudava de coluna quando o estado da linha mudava. É a mesma
    conta que o cliente faz em todoText (static/js/todo.js)."""
    return str(value or "").strip()[:200].strip()


def normalize_todo_link(raw):
    """Origem extra de um item: {kind, title, ref}."""
    if not isinstance(raw, dict):
        return None
    kind = str(raw.get("kind") or "").strip().lower()
    if kind not in TODO_LINK_KINDS:
        return None
    title = str(raw.get("title") or "").strip()[:200]
    ref = normalize_ref(raw.get("ref"))
    if not title or not ref:
        return None
    return {"kind": kind, "title": title, "ref": ref}


def normalize_subtask(sub):
    if not isinstance(sub, dict):
        return None
    title = str(sub.get("title") or "").strip()[:200]
    if not title:
        return None
    sub_id = str(sub.get("id") or "").strip()
    if not sub_id:
        return None
    return {"id": sub_id, "title": title, "done": bool(sub.get("done"))}


def normalize_jira_issue(issue):
    if not isinstance(issue, dict):
        return None
    key = str(issue.get("key") or "").strip()[:30]
    if not key:
        return None
    out = {"key": key, "summary": str(issue.get("summary") or "").strip()[:300]}
    parent_summary = str(issue.get("parentSummary") or "").strip()[:300]
    if parent_summary:
        out["parentSummary"] = parent_summary
    epic_key = str(issue.get("epicKey") or "").strip()[:30]
    if epic_key:
        out["epicKey"] = epic_key
        epic_name = str(issue.get("epicName") or "").strip()[:300]
        if epic_name:
            out["epicName"] = epic_name
    return out


def normalize_due(value):
    """Data-limite aceitável (YYYY-MM-DD) ou "" quando não há/não presta."""
    text = str(value or "").strip()[:10]
    return text if DUE_RE.match(text) else ""


def normalize_repeat(value):
    """Repetição aceitável ou "" (não repete)."""
    text = str(value or "").strip().lower()
    return text if text in TODO_REPEATS else ""


def normalize_segment(seg):
    """Um dia do registo do cronómetro: {d: YYYY-MM-DD, ms: int}."""
    if not isinstance(seg, dict):
        return None
    day = normalize_due(seg.get("d"))
    ms = _int_or_zero(seg.get("ms"))
    if not day or ms <= 0:
        return None
    return {"d": day, "ms": ms}


def merge_segments(segments):
    """Junta o tempo do mesmo dia numa entrada só, por ordem de data.

    O cronómetro pára e arranca várias vezes por dia (e um item pode ser
    reaberto dias depois), por isso a lista chega aqui com repetições."""
    total = {}
    for seg in segments:
        clean = normalize_segment(seg)
        if clean is None:
            continue
        total[clean["d"]] = total.get(clean["d"], 0) + clean["ms"]
    ordered = [{"d": day, "ms": total[day]} for day in sorted(total)]
    return ordered[-TIMER_SEGMENTS_MAX:]


def normalize_todo_item(item):
    if not isinstance(item, dict):
        return None
    out = dict(item)
    col = str(out.get("col") or "").strip().lower()
    if col not in TODO_COLUMNS:
        col = "done" if out.get("done") else "todo"
    out["col"] = col
    out["done"] = bool(out.get("done")) or col == "done"
    # prioridade: os itens gravados antes desta versão não a têm, ficam no
    # valor neutro (o load_todo regrava-os já com o campo preenchido)
    priority = str(out.get("priority") or "").strip().lower()
    out["priority"] = priority if priority in TODO_PRIORITIES else TODO_PRIORITY_DEFAULT
    out.pop("note", None)
    out.pop("note_title", None)
    out.pop("note_images", None)
    out.pop("note_count", None)
    out.pop("note_boxes", None)
    try:
        elapsed = int(out.get("elapsed_ms", 0))
    except (TypeError, ValueError):
        elapsed = 0
    out["elapsed_ms"] = max(0, elapsed)
    try:
        started = int(out.get("timer_started")) if out.get("timer_started") is not None else None
    except (TypeError, ValueError):
        started = None
    # só pode estar "a contar" quando está em Em curso
    out["timer_started"] = started if (started is not None and out["col"] == "inprogress") else None
    # subtarefas (checklist leve): lista de {id, title, done}
    raw_subs = out.get("subtasks")
    out["subtasks"] = [s for s in (normalize_subtask(s) for s in raw_subs) if s] if isinstance(raw_subs, list) else []
    # outras origens do mesmo trabalho (a mesma linha do Excel e um CCR, por
    # exemplo): a principal fica em kind/ref, as restantes aqui
    raw_links = out.get("links")
    links, seen = [], {todo_identity(out.get("kind"), out.get("title"), out.get("ref"))}
    for raw in (raw_links if isinstance(raw_links, list) else [])[:8]:
        link = normalize_todo_link(raw)
        if link is None:
            continue
        ident = todo_identity(link["kind"], link["title"], link["ref"])
        if ident in seen:
            continue
        seen.add(ident)
        links.append(link)
    out["links"] = links
    # issue do Jira ligada ao item: no máximo uma, {key, summary, parentSummary?, epic*?}
    raw_jira = out.get("jiraIssues")
    out["jiraIssues"] = [j for j in (normalize_jira_issue(j) for j in raw_jira[:1]) if j] \
        if isinstance(raw_jira, list) else []
    # esforço registado no Jira a partir deste item (acumulado, em segundos): só
    # conta o que passou pelo botão de registo do próprio item
    try:
        logged = int(out.get("jiraLoggedSeconds", 0))
    except (TypeError, ValueError):
        logged = 0
    out["jiraLoggedSeconds"] = max(0, logged)
    # tempo dos cronómetros que já foi para o Jira: o que ainda não foi é a
    # diferença para o elapsed_ms, e é isso que o registo de esforço propõe
    # (ver todoUnloggedMs em static/js/todo.js)
    out["jiraLoggedFromTimerMs"] = min(out["elapsed_ms"],
                                       max(0, _int_or_zero(out.get("jiraLoggedFromTimerMs"))))
    # data-limite (YYYY-MM-DD) e repetição: os itens gravados antes desta
    # versão não as têm — ficam sem data e sem repetir, que é o neutro
    due = normalize_due(out.get("due"))
    if due:
        out["due"] = due
    else:
        out.pop("due", None)
    out["repeat"] = normalize_repeat(out.get("repeat"))
    if not out["repeat"]:
        out.pop("repeat")
    # ocorrências que passaram sem o item ser fechado (ver catch_up_repeats): é
    # o que a interface mostra ao lado da data, para não parecer que a repetição
    # está em dia quando não está
    missed = _int_or_zero(out.get("missed"))
    if missed > 0 and not out["done"]:
        out["missed"] = missed
    else:
        out.pop("missed", None)
    # quando o tempo contado deste item foi posto a zero: o registo diário
    # anterior fica (é a folha de horas) e isto é o que explica a diferença
    restarted = str(out.get("restarted_at") or "").strip()[:32]
    if restarted:
        out["restarted_at"] = restarted
    else:
        out.pop("restarted_at", None)
    # registo do cronómetro dia a dia: é o que permite dizer QUANDO o tempo foi
    # contado (o elapsed_ms sozinho é só um total que não sabe a que dia
    # pertence — ver o relatório e as Métricas)
    raw_segs = out.get("segments")
    segs = merge_segments(raw_segs if isinstance(raw_segs, list) else [])
    if segs:
        out["segments"] = segs
    else:
        out.pop("segments", None)
    # quando o item foi fechado (ISO): é o que permite dizer o que se fechou
    # nesta semana. Os itens fechados antes desta versão não o têm.
    done_at = str(out.get("done_at") or "").strip()[:32]
    if out["done"] and done_at:
        out["done_at"] = done_at
    else:
        out.pop("done_at", None)
    return out


def _int_or_zero(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _now_iso():
    return datetime.now().replace(microsecond=0).isoformat()


def split_by_day(start_ms, end_ms):
    """Um intervalo do cronómetro repartido pelos dias que atravessa.

    Devolve [{d, ms}]. Um cronómetro esquecido a correr de um dia para o outro
    contava tudo ao dia em que se carregou no stop — e o registo diário
    (a folha de horas, o "tempo contado" do relatório) ficava a mentir."""
    if end_ms <= start_ms:
        return []
    out = []
    cursor = start_ms
    while cursor < end_ms:
        day = datetime.fromtimestamp(cursor / 1000.0).date()
        # meia-noite do dia seguinte, no fuso local (a hora legal muda duas
        # vezes por ano: usa-se o timestamp real da data, não +24h)
        next_day = datetime.combine(day + timedelta(days=1), datetime.min.time())
        boundary = int(next_day.timestamp() * 1000)
        chunk_end = min(end_ms, boundary)
        ms = chunk_end - cursor
        if ms > 0:
            out.append({"d": day.isoformat(), "ms": ms})
        cursor = chunk_end
    return out


def add_timer_segments(item, start_ms, end_ms):
    """Acrescenta ao registo diário do item o tempo entre dois instantes."""
    novos = split_by_day(int(start_ms), int(end_ms))
    if not novos:
        return
    antigos = item.get("segments")
    item["segments"] = merge_segments((antigos if isinstance(antigos, list) else []) + novos)


def stop_todo_timer(item, now_ms=None):
    now_ms = int(now_ms if now_ms is not None else time.time() * 1000)
    started = item.get("timer_started")
    if started is None:
        return
    try:
        started = int(started)
    except (TypeError, ValueError):
        item["timer_started"] = None
        return
    delta = max(0, now_ms - started)
    try:
        base = int(item.get("elapsed_ms", 0))
    except (TypeError, ValueError):
        base = 0
    item["elapsed_ms"] = max(0, base + delta)
    # o mesmo tempo, mas arrumado por dia (ver split_by_day)
    add_timer_segments(item, started, now_ms)
    item["timer_started"] = None


def sync_todo_timer_with_column(item, old_col, new_col):
    """Acerta o que depende da coluna quando um cartão muda de sítio: o
    cronómetro (só corre em "Em curso") e a data de fecho (só existe em "Done").
    """
    now_ms = int(time.time() * 1000)
    if old_col == "inprogress" and new_col != "inprogress":
        stop_todo_timer(item, now_ms)
    elif old_col != "inprogress" and new_col == "inprogress":
        if item.get("timer_started") is None:
            item["timer_started"] = now_ms
    if new_col == "done" and old_col != "done":
        item["done_at"] = _now_iso()
    elif new_col != "done" and old_col == "done":
        # reaberto: a data de fecho antiga já não diz nada
        item.pop("done_at", None)


def _next_slot(day, repeat, anchor=0):
    """A data agendada seguinte, logo depois de `day` (sem olhar a hoje)."""
    if repeat == "monthly":
        # o dia do mês é sempre o do original: sem isso um item do dia 31 ia
        # escorregando (31 -> 28 -> 28 ...) a cada mês curto que passasse
        return _add_month(day, anchor or day.day)
    passo = {"daily": timedelta(days=1), "weekdays": timedelta(days=1),
             "weekly": timedelta(days=7), "biweekly": timedelta(days=14)}[repeat]
    nova = day + passo
    while repeat == "weekdays" and nova.weekday() >= 5:
        nova = nova + passo      # sábado/domingo não contam num item de dias úteis
    return nova


def _due_date(due, fallback):
    """A data-limite como `date`, ou `fallback` quando não há (ou não presta)."""
    try:
        return date.fromisoformat(due) if normalize_due(due) else fallback
    except ValueError:
        return fallback


def next_due(due, repeat, today=None):
    """A data-limite seguinte de um item que se repete.

    Anda sempre para a frente a partir de HOJE: um item semanal esquecido três
    semanas não devolve outras três em atraso, devolve a próxima."""
    repeat = normalize_repeat(repeat)
    if not repeat:
        return ""
    today = today or date.today()
    base = _due_date(due, today)
    nova = base
    for _ in range(400):          # trava de segurança: nunca é preciso mais
        nova = _next_slot(nova, repeat, base.day)
        if nova > today:
            return nova.isoformat()
    return nova.isoformat()


def catch_up_repeats(todos, today=None):
    """Põe as datas dos itens que se repetem na ocorrência que calha agora.

    A repetição andava ao ritmo de quem fechava o item e não ao do calendário:
    um item diário deixado por fazer três dias ficava com a data de há três dias
    e, ao ser fechado, dava UMA ocorrência seguinte em vez de reconhecer as três
    que passaram. Aqui a data-limite anda para a frente até à última ocorrência
    já vencida (a de hoje, quando calha hoje) e o que ficou pelo caminho fica
    contado em `missed`, para a interface poder dizer que aquilo já devia ter
    sido feito N vezes. Não nascem cópias: um item que se repete é UM trabalho
    que volta, não uma pilha de trabalhos iguais em atraso.

    Devolve o número de itens mexidos (o load_todo regrava quando é > 0).
    """
    today = today or date.today()
    mexidos = 0
    for item in todos:
        if not isinstance(item, dict) or item.get("done"):
            continue
        repeat = normalize_repeat(item.get("repeat"))
        due = normalize_due(item.get("due"))
        if not repeat or not due:
            continue
        base = _due_date(due, today)
        if base >= today:
            continue
        atual, saltadas = base, 0
        for _ in range(400):
            seguinte = _next_slot(atual, repeat, base.day)
            if seguinte > today:
                break
            atual, saltadas = seguinte, saltadas + 1
        if not saltadas:
            continue
        item["due"] = atual.isoformat()
        item["missed"] = _int_or_zero(item.get("missed")) + saltadas
        mexidos += 1
    return mexidos


def restart_todo_timer(item, now_ms=None):
    """Põe o tempo contado deste item a zero, sem apagar a folha de horas.

    O `elapsed_ms` é o total DESTE item e é isso que se recomeça. O registo
    diário (`segments`) fica: aquelas horas foram contadas naqueles dias, e a
    folha de horas (ver report.py) é sobre os dias e não sobre este item —
    apagá-lo passava tempo já trabalhado para "não se sabe quando".
    """
    if not isinstance(item, dict):
        return
    item["elapsed_ms"] = 0
    item["jiraLoggedFromTimerMs"] = 0
    item["restarted_at"] = _now_iso()
    if str(item.get("col") or "") == "inprogress":
        item["timer_started"] = int(now_ms if now_ms is not None else time.time() * 1000)
    else:
        item["timer_started"] = None


def _add_month(day, anchor=0):
    """O mesmo dia do mês seguinte (dia 31 cai no último dia do mês curto)."""
    ano = day.year + (1 if day.month == 12 else 0)
    mes = 1 if day.month == 12 else day.month + 1
    ultimo = (date(ano + (1 if mes == 12 else 0), 1 if mes == 12 else mes + 1, 1)
              - timedelta(days=1)).day
    return date(ano, mes, min(anchor or day.day, ultimo))


def spawn_repeat(todos, item):
    """Nasce a ocorrência seguinte de um item que se repete, se for o caso.

    Chamado quando um item passa a feito. O item fechado fica onde está (é o
    registo do que se fez); o novo entra por fazer, sem tempo e com a checklist
    outra vez por marcar. Devolve o item novo ou None."""
    if not isinstance(item, dict) or not item.get("done"):
        return None
    repeat = normalize_repeat(item.get("repeat"))
    if not repeat:
        return None
    nova_data = next_due(item.get("due"), repeat)
    novo = {"id": f"t{int(time.time() * 1000)}r",
            "title": str(item.get("title") or ""),
            "kind": str(item.get("kind") or "manual"),
            "done": False, "col": "todo",
            "priority": str(item.get("priority") or TODO_PRIORITY_DEFAULT),
            "detail": str(item.get("detail") or ""),
            "elapsed_ms": 0, "timer_started": None,
            "repeat": repeat,
            "created": datetime.now().strftime("%d/%m %H:%M")}
    if nova_data:
        novo["due"] = nova_data
    # as ocorrências que o anterior deixou passar são história dele: a nova
    # nasce em dia (e o anterior, já fechado, deixa de as mostrar)
    item.pop("missed", None)
    if isinstance(item.get("ref"), dict) and item.get("ref"):
        novo["ref"] = dict(item["ref"])
    subs = item.get("subtasks") if isinstance(item.get("subtasks"), list) else []
    novo["subtasks"] = [{"id": f"{s.get('id')}r{int(time.time() * 1000)}",
                         "title": str(s.get("title") or ""), "done": False}
                        for s in subs if isinstance(s, dict) and s.get("title")]
    # o item que se repete deixa de o fazer depois de fechado: quem repete
    # agora é o novo (senão fechar o antigo outra vez fazia nascer um terceiro)
    item.pop("repeat", None)
    todos.append(novo)
    return novo


def timer_ms_in_period(item, since="", until=""):
    """Tempo do cronómetro deste item dentro do período (ms), pelo registo
    diário. Sem registo (itens anteriores a esta versão) devolve 0 — é o que
    permite dizer "isto não sabe a que dia pertence" em vez de mentir."""
    segs = item.get("segments") if isinstance(item.get("segments"), list) else []
    total = 0
    for seg in segs:
        clean = normalize_segment(seg)
        if clean is None:
            continue
        if since and clean["d"] < since:
            continue
        if until and clean["d"] > until:
            continue
        total += clean["ms"]
    return total


def sort_todos_by_priority(items):
    """Da prioridade mais alta para a mais baixa, sem mexer na ordem manual
    dentro da mesma prioridade (sorted é estável)."""
    def rank(item):
        priority = str((item or {}).get("priority") or "").strip().lower()
        if priority not in TODO_PRIORITIES:
            priority = TODO_PRIORITY_DEFAULT
        return -TODO_PRIORITIES.index(priority)
    return sorted(items, key=rank)


def sync_todo_review_from_tasks(todos, row_meta, sheet_name):
    """Move linked TODO items to Review when the source task enters
    "Ready for review" or "In review".
    """
    if not todos or not isinstance(row_meta, list):
        return False

    # key da linha -> coluna destino do TODO (regra por papel)
    # reviewer + "in review" => inprogress
    # author + "ready for review" => review
    target_by_key = {}
    for meta in row_meta:
        if not isinstance(meta, dict):
            continue
        fn = row_key_text(meta.get("fn"))
        todo = row_key_text(meta.get("todo"))
        if not fn:
            continue
        role = meta.get("todo_sync_role") if isinstance(meta.get("todo_sync_role"), dict) else {}
        author_statuses = [normalize(s) for s in (role.get("author") or [])]
        reviewer_statuses = [normalize(s) for s in (role.get("reviewer") or [])]

        target = None
        if any(s == "in review" for s in reviewer_statuses):
            target = "inprogress"
        elif any(s == "ready for review" for s in author_statuses):
            target = "review"
        target_by_key[(fn, todo)] = target

    changed = False
    sheet_norm = normalize(sheet_name or "")
    for item in todos:
        if not isinstance(item, dict) or item.get("done"):
            continue
        # a linha do Excel pode ser a origem do item ou uma origem ligada a ele
        links = item.get("links") if isinstance(item.get("links"), list) else []
        refs = [item.get("ref")] + [lk.get("ref") for lk in links
                                    if isinstance(lk, dict) and lk.get("kind") == "task"]
        new_col = None
        for ref in refs:
            if not isinstance(ref, dict) or not ref.get("fn"):
                continue
            ref_sheet = str(ref.get("sheet") or "")
            if ref_sheet and normalize(ref_sheet) != sheet_norm:
                continue
            new_col = target_by_key.get((row_key_text(ref.get("fn")), row_key_text(ref.get("todo"))))
            if new_col:
                break
        if not new_col:
            continue
        old_col = str(item.get("col") or "todo")
        if old_col == new_col:
            continue
        item["col"] = new_col
        item["done"] = False
        sync_todo_timer_with_column(item, old_col, new_col)
        changed = True
    return changed


def todo_identity(kind, title, ref):
    """Identidade de um item do TODO para efeitos de repetidos.

    O título sozinho não chega: várias linhas do Excel partilham o mesmo nome
    (ex.: "Multiple") e só diferem no "o que fazer". Sem a origem, só a
    primeira dessas linhas conseguia entrar na lista.
    """
    ref = ref or {}
    if kind == "ccr":
        return ("ccr", title, ref.get("ccr", ""))
    if kind == "task":
        return ("task", title, ref.get("sheet", ""), ref.get("fn", ""), ref.get("todo", ""))
    return ("manual", title)


def todo_sources(item):
    """Identidades de todas as origens do item: a principal + as ligadas."""
    item = item if isinstance(item, dict) else {}
    out = [todo_identity(item.get("kind"), item.get("title"), item.get("ref"))]
    for link in item.get("links") or []:
        if isinstance(link, dict):
            out.append(todo_identity(link.get("kind"), link.get("title"), link.get("ref")))
    return out


def todo_link_target(todos, kind, title):
    """Item por fechar que já representa este trabalho, mas vindo de outro sítio.

    Só junta origens de TIPOS diferentes (Excel + CCR + escrito à mão): duas
    linhas do Excel com o mesmo nome (ex.: "Multiple") são trabalhos distintos
    e continuam a ser itens separados.
    """
    for item in todos:
        if item.get("done") or str(item.get("title") or "") != title:
            continue
        if kind not in {src[0] for src in todo_sources(item)}:
            return item
    return None


def load_todo():
    data = read_json(TODO_FILE, [])
    if not isinstance(data, list):
        return []
    out = []
    changed = False
    for raw in data:
        normed = normalize_todo_item(raw)
        if normed is None:
            changed = True
            continue
        if normed != raw:
            changed = True
        out.append(normed)
    # a repetição passa a andar com o calendário e não com quem fecha o item: a
    # data-limite vencida sobe até à ocorrência de agora, aqui, ao ler
    if catch_up_repeats(out):
        changed = True
    if changed:
        save_todo(out)
    return out


def save_todo(data):
    write_json(TODO_FILE, data)


# Itens concluídos que foram apagados do quadro. Apagar um item do quadro é
# arrumar a lista, não desfazer o trabalho: sem este arquivo o relatório perdia
# o que já tinha sido feito no período (o relatório lê o todo.json, e o item
# deixara de lá estar). Guarda-se só o que o relatório usa.
DONE_ARCHIVE_FILE = os.path.join(HERE, "todo_done_archive.json")
DONE_ARCHIVE_MAX = 500


def load_done_archive():
    """Concluídos já apagados do quadro (lista; [] quando não há arquivo)."""
    data = read_json(DONE_ARCHIVE_FILE, [])
    return [x for x in data if isinstance(x, dict)] if isinstance(data, list) else []


def archive_done_todo(item):
    """Guarda um item concluído antes de ele sair do quadro.

    Só os concluídos com data de fecho: sem `done_at` o relatório não saberia
    a que período o item pertence e não o mostraria de qualquer maneira.
    """
    if not isinstance(item, dict) or not item.get("done") or not item.get("done_at"):
        return
    entrada = {"id": str(item.get("id") or ""),
               "title": str(item.get("title") or ""),
               "kind": str(item.get("kind") or "manual"),
               "elapsed_ms": _int_or_zero(item.get("elapsed_ms")),
               # o registo diário do cronómetro vem com o item: sem ele a folha
               # de horas perdia os dias em que este tempo foi contado e atirava
               # o total inteiro para o "sem registo" (ver build_report) — apagar
               # um item passava horas de um dia para "não se sabe quando"
               "segments": [s for s in (item.get("segments") or []) if isinstance(s, dict)],
               "done_at": str(item.get("done_at") or ""),
               "done": True,
               "jiraLoggedSeconds": _int_or_zero(item.get("jiraLoggedSeconds")),
               "jiraIssues": [j for j in (item.get("jiraIssues") or []) if isinstance(j, dict)]}
    arquivo = [x for x in load_done_archive() if x.get("id") != entrada["id"]]
    arquivo.append(entrada)
    write_json(DONE_ARCHIVE_FILE, arquivo[-DONE_ARCHIVE_MAX:])
