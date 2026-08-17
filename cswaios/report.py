# -*- coding: utf-8 -*-
"""Relatório "a minha semana": o que se fez, pronto a colar numa reunião.

Junta o que a app já sabe, sem pedir nada ao utilizador: as alterações que
levou à folha (histórico, cswaios/history.py), o que fechou na lista Por fazer,
o tempo que os cronómetros contaram e o esforço que foi registado no Jira.
Devolve os dados estruturados e o mesmo conteúdo em markdown — é o markdown que
se copia para o chat/e-mail.
"""

from datetime import datetime, timedelta

from .history import iso_day, recent_events
from .todos import load_todo

# rótulos do relatório (o resto da app usa i18n.msg, mas aqui são muitos e só
# servem para este ficheiro)
LBL = {
    "title": ("A minha semana", "My week"),
    "period": ("de {a} a {b}", "{a} to {b}"),
    "app_changes": ("Alterações que levei à folha", "Changes I pushed to the sheet"),
    "todo_done": ("Por fazer concluído", "TODO completed"),
    "todo_doing": ("Ainda em curso", "Still in progress"),
    "jira": ("Esforço registado no Jira", "Effort logged in Jira"),
    "jira_total": ("(total acumulado por tarefa, não só desta semana)",
                   "(running total per task, not just this week)"),
    "team": ("Atividade na folha fora desta app", "Sheet activity outside this app"),
    "team_line": ("{n} alteração(ões) em {r} tarefa(s).", "{n} change(s) across {r} task(s)."),
    "nothing": ("(nada a registar)", "(nothing to report)"),
    "empty": ("Sem atividade registada neste período.", "No activity recorded in this period."),
    "seed_hint": ("O histórico só conhece o que mudou desde que esta versão da app "
                  "começou a acompanhar a folha.",
                  "History only covers what changed since this version of the app "
                  "started tracking the sheet."),
}


def _lbl(key, lang, **kw):
    text = LBL[key][1 if lang == "en" else 0]
    return text.format(**kw) if kw else text


def _fmt_hm(total_seconds):
    """3h 05m a partir de segundos (0m quando não há nada contado)."""
    minutes = max(0, round((total_seconds or 0) / 60))
    h, m = divmod(minutes, 60)
    if h and m:
        return f"{h}h {m:02d}m"
    return f"{h}h" if h else f"{m}m"


def _fmt_ts(iso):
    try:
        d = datetime.fromisoformat(str(iso))
    except (TypeError, ValueError):
        return str(iso or "")
    return d.strftime("%d/%m %H:%M")


def _task_label(event):
    fn = str(event.get("fn") or "").strip()
    todo = str(event.get("todo") or "").strip()
    if fn and todo and todo != fn:
        return f"{fn} — {todo}"
    return fn or todo or f"linha {event.get('xlrow')}"


def _short(value, limit=80):
    text = " ".join(str(value or "").split())
    return text if len(text) <= limit else text[:limit - 1] + "…"


def build_report(days=7, lang="pt", since="", until=""):
    """Dados + markdown do relatório do período.

    O período são os últimos `days` dias ou, quando `since` e `until`
    (AAAA-MM-DD) vêm preenchidos, o intervalo de datas escolhido na vista de
    métricas — aí conta-se em dias inteiros, com os dois extremos incluídos.
    """
    lang = lang if lang in ("pt", "en") else "pt"
    days = max(1, min(90, int(days or 7)))
    dia_ini, dia_fim = iso_day(since), iso_day(until)
    if dia_ini and dia_fim:
        if dia_ini > dia_fim:
            dia_ini, dia_fim = dia_fim, dia_ini
        inicio = datetime.fromisoformat(dia_ini)
        # o último dia entra inteiro: até ao último segundo
        fim = datetime.fromisoformat(dia_fim) + timedelta(days=1, seconds=-1)
        days = (fim - inicio).days + 1
        events = recent_events(limit=2000, since=dia_ini, until=dia_fim)
    else:
        fim = datetime.now()
        inicio = fim - timedelta(days=days)
        events = recent_events(days=days, limit=2000)
    since_iso, until_iso = inicio.isoformat(), fim.isoformat()


    app_changes = [e for e in events if e.get("via") == "app"]
    team_changes = [e for e in events if e.get("via") != "app"]

    todos = load_todo()
    done, doing = [], []
    for item in todos:
        if not isinstance(item, dict):
            continue
        elapsed = int(item.get("elapsed_ms") or 0)
        entry = {"title": str(item.get("title") or ""), "elapsed_ms": elapsed,
                 "kind": str(item.get("kind") or "manual"),
                 "done_at": str(item.get("done_at") or "")}
        if item.get("done"):
            # só entra no período o que se sabe TER sido fechado nele: os itens
            # fechados antes desta versão não têm data de fecho e ficam de fora
            if entry["done_at"] and since_iso <= entry["done_at"] <= until_iso:
                done.append(entry)
        elif str(item.get("col") or "") == "inprogress":
            doing.append(entry)

    jira = {}
    for item in todos:
        if not isinstance(item, dict):
            continue
        segundos = int(item.get("jiraLoggedSeconds") or 0)
        if not segundos:
            continue
        for issue in (item.get("jiraIssues") or []):
            if isinstance(issue, dict) and issue.get("key"):
                jira[issue["key"]] = jira.get(issue["key"], 0) + segundos

    data = {
        "since": inicio.replace(microsecond=0).isoformat(),
        "until": fim.replace(microsecond=0).isoformat(),
        "days": days,
        "app_changes": app_changes,
        "team_changes": len(team_changes),
        "team_tasks": len({(e.get("book"), e.get("sheet"), e.get("xlrow")) for e in team_changes}),
        "todo_done": done,
        "todo_doing": doing,
        "jira": [{"key": k, "seconds": v} for k, v in sorted(jira.items())],
    }
    data["markdown"] = _markdown(data, lang)
    data["empty"] = not (app_changes or done or doing or jira or team_changes)
    return data


def _markdown(data, lang):
    since = _fmt_ts(data["since"])
    until = _fmt_ts(data["until"])
    out = [f"# {_lbl('title', lang)} — {_lbl('period', lang, a=since, b=until)}", ""]

    out.append(f"## {_lbl('app_changes', lang)} ({len(data['app_changes'])})")
    if data["app_changes"]:
        for e in data["app_changes"]:
            out.append(f"- **{_task_label(e)}** — {e.get('col')}: "
                       f"`{_short(e.get('from')) or '—'}` → `{_short(e.get('to')) or '—'}` "
                       f"({_fmt_ts(e.get('ts'))})")
    else:
        out.append(f"- {_lbl('nothing', lang)}")
    out.append("")

    out.append(f"## {_lbl('todo_done', lang)} ({len(data['todo_done'])})")
    if data["todo_done"]:
        for it in data["todo_done"]:
            tempo = f" — {_fmt_hm(it['elapsed_ms'] / 1000)}" if it["elapsed_ms"] else ""
            out.append(f"- {it['title']}{tempo} ({_fmt_ts(it['done_at'])})")
    else:
        out.append(f"- {_lbl('nothing', lang)}")
    out.append("")

    if data["todo_doing"]:
        out.append(f"## {_lbl('todo_doing', lang)} ({len(data['todo_doing'])})")
        for it in data["todo_doing"]:
            tempo = f" — {_fmt_hm(it['elapsed_ms'] / 1000)}" if it["elapsed_ms"] else ""
            out.append(f"- {it['title']}{tempo}")
        out.append("")

    if data["jira"]:
        out.append(f"## {_lbl('jira', lang)}")
        out.append(f"_{_lbl('jira_total', lang)}_")
        for entry in data["jira"]:
            out.append(f"- {entry['key']} — {_fmt_hm(entry['seconds'])}")
        out.append("")

    if data["team_changes"]:
        out.append(f"## {_lbl('team', lang)}")
        out.append(_lbl("team_line", lang, n=data["team_changes"], r=data["team_tasks"]))
        out.append("")

    out.append(f"_{_lbl('seed_hint', lang)}_")
    return "\n".join(out)
