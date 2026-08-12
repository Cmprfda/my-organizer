# -*- coding: utf-8 -*-
"""TODO list pessoal: normalização, cronómetros e persistência."""

import json
import os
import re
import time

from .config import HERE
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
    return out


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
    item["timer_started"] = None


def sync_todo_timer_with_column(item, old_col, new_col):
    now_ms = int(time.time() * 1000)
    if old_col == "inprogress" and new_col != "inprogress":
        stop_todo_timer(item, now_ms)
    elif old_col != "inprogress" and new_col == "inprogress":
        if item.get("timer_started") is None:
            item["timer_started"] = now_ms


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
    try:
        with open(TODO_FILE, encoding="utf-8") as f:
            data = json.load(f)
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
            if changed:
                save_todo(out)
            return out
    except (OSError, ValueError):
        return []


def save_todo(data):
    with open(TODO_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
