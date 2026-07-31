# -*- coding: utf-8 -*-
"""TODO list pessoal: normalização, cronómetros e persistência."""

import json
import os
import time

from .config import HERE
from .text import normalize

# TODO list pessoal (itens próprios + tarefas/CCRs arrastadas para lá)
TODO_FILE = os.path.join(HERE, "todo.json")
TODO_COLUMNS = {"todo", "inprogress", "review", "done"}
# prioridade do item, da mais baixa para a mais alta. Os itens antigos (e os
# criados sem a indicar) ficam em "normal" — é o valor neutro.
TODO_PRIORITIES = ("low", "normal", "high", "urgent")
TODO_PRIORITY_DEFAULT = "normal"


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
    # issue do Jira ligada ao item: no máximo uma, {key, summary, parentSummary?}
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
        fn = str(meta.get("fn") or "")
        todo = str(meta.get("todo") or "")
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
        ref = item.get("ref") if isinstance(item.get("ref"), dict) else None
        if not ref or not ref.get("fn"):
            continue
        ref_sheet = str(ref.get("sheet") or "")
        if ref_sheet and normalize(ref_sheet) != sheet_norm:
            continue
        key = (str(ref.get("fn") or ""), str(ref.get("todo") or ""))
        new_col = target_by_key.get(key)
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
