# -*- coding: utf-8 -*-
"""Levar o que está nas Métricas para fora da app: CSV (e o relatório em .md).

O markdown do relatório serve para colar num chat; para a folha do ponto de
situação do mês é preciso um ficheiro. Aqui escreve-se esse ficheiro para uma
pasta ao lado da app e devolve-se o caminho — em vez de o entregar pelo browser,
que na janela nativa (pywebview) não sabe guardar nada.
"""

import csv
import io
import os
import re
from datetime import datetime

from .config import HERE
from .graph import graph_path_for, load_books
from .history import recent_events
from .report import build_report
from .todos import load_done_archive, load_todo

# pasta dos ficheiros exportados (fica ao lado da app, como os registos)
EXPORT_DIR = os.path.join(HERE, "exports")
EXPORT_KINDS = ("activity", "timesheet", "report")
# ficheiros guardados por tipo: o suficiente para se voltar a um de ontem sem
# a pasta crescer para sempre
EXPORT_KEEP = 30


def _stamp():
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def _clean(name):
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", str(name or "")).strip("_") or "export"


def _csv_text(header, rows):
    """CSV com BOM e ; como separador — é assim que o Excel em PT o abre com as
    colunas já separadas, sem passar pelo assistente de importação."""
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";", lineterminator="\r\n")
    writer.writerow(header)
    for row in rows:
        writer.writerow(["" if v is None else v for v in row])
    return "﻿" + buf.getvalue()


def _day(iso):
    return str(iso or "")[:10]


def _book_names():
    """id do livro -> nome do ficheiro, pelos livros que a app conhece.

    O histórico guarda o livro pelo id (que no OneDrive é uma linha ilegível de
    identificadores): num CSV para ler, o que se quer é o nome."""
    nomes = {}
    livros = load_books()
    for livro in ([livros.get("current")] + list(livros.get("recent") or [])):
        if isinstance(livro, dict) and livro.get("drive_id") and livro.get("item_id"):
            nomes[graph_path_for(livro["drive_id"], livro["item_id"])] = livro.get("name") or ""
    return nomes


def _hm(ms):
    """1h 05m a partir de ms — o mesmo formato que o relatório mostra."""
    minutos = max(0, round((ms or 0) / 60000))
    h, m = divmod(minutos, 60)
    if h and m:
        return f"{h}h {m:02d}m"
    return f"{h}h" if h else f"{m}m"


def activity_csv(since="", until="", days=7):
    """Todas as alterações do período: uma linha por alteração."""
    if since and until:
        eventos = recent_events(limit=5000, since=since, until=until)
    else:
        eventos = recent_events(days=days, limit=5000)
    header = ["Dia", "Hora", "Livro", "Aba", "Linha", "Tarefa", "O que fazer",
              "Coluna", "Antes", "Depois", "Origem"]
    nomes = _book_names()
    linhas = []
    for e in eventos:
        ts = str(e.get("ts") or "")
        livro = str(e.get("book") or "")
        linhas.append([
            _day(ts), ts[11:16], nomes.get(livro) or os.path.basename(livro) or livro,
            e.get("sheet"), e.get("xlrow"),
            e.get("fn"), e.get("todo"), e.get("col"), e.get("from"), e.get("to"),
            "app" if e.get("via") == "app" else "folha",
        ])
    return _csv_text(header, linhas), len(linhas)


def timesheet_csv(since="", until=""):
    """Folha de horas: uma linha por dia e por item, pelo registo diário do
    cronómetro. Os itens anteriores a esta versão não têm registo diário e por
    isso não aparecem aqui — o total deles vai numa linha à parte, para não
    parecer que o tempo se perdeu."""
    itens = load_todo()
    vivos = {str(t.get("id")) for t in itens if isinstance(t, dict)}
    itens = itens + [a for a in load_done_archive() if str(a.get("id")) not in vivos]
    header = ["Dia", "Item", "Tipo", "Tempo", "ms"]
    linhas, sem_registo = [], 0
    for item in itens:
        if not isinstance(item, dict):
            continue
        segs = item.get("segments") if isinstance(item.get("segments"), list) else []
        if not segs:
            sem_registo += int(item.get("elapsed_ms") or 0)
            continue
        for seg in segs:
            if not isinstance(seg, dict):
                continue
            dia = str(seg.get("d") or "")
            if not dia or (since and dia < since) or (until and dia > until):
                continue
            ms = int(seg.get("ms") or 0)
            linhas.append([dia, item.get("title"), item.get("kind") or "manual",
                           _hm(ms), ms])
    linhas.sort(key=lambda r: (str(r[0]), str(r[1])))
    if sem_registo:
        linhas.append(["", "(itens sem registo diário — anteriores a esta versão)",
                       "", _hm(sem_registo), sem_registo])
    return _csv_text(header, linhas), len(linhas)


def write_export(kind, since="", until="", days=7, lang="pt"):
    """Escreve o ficheiro e devolve {path, name, rows, kind}."""
    if kind not in EXPORT_KINDS:
        raise ValueError(f"exportação inválida: {kind}")
    os.makedirs(EXPORT_DIR, exist_ok=True)
    periodo = f"{_clean(since)}_{_clean(until)}" if since and until else f"{days}d"
    if kind == "activity":
        texto, linhas = activity_csv(since, until, days)
        nome = f"alteracoes_{periodo}_{_stamp()}.csv"
    elif kind == "timesheet":
        texto, linhas = timesheet_csv(since, until)
        nome = f"horas_{periodo}_{_stamp()}.csv"
    else:
        dados = build_report(days=days, lang=lang, since=since, until=until)
        texto = dados.get("markdown") or ""
        linhas = len(texto.splitlines())
        nome = f"relatorio_{periodo}_{_stamp()}.md"
    caminho = os.path.join(EXPORT_DIR, nome)
    with open(caminho, "w", encoding="utf-8", newline="") as f:
        f.write(texto)
    _trim(kind)
    return {"path": caminho, "name": nome, "rows": linhas, "kind": kind}


def _trim(kind):
    """Deixa só os últimos EXPORT_KEEP ficheiros deste tipo."""
    prefixo = {"activity": "alteracoes_", "timesheet": "horas_", "report": "relatorio_"}[kind]
    try:
        nomes = sorted(n for n in os.listdir(EXPORT_DIR) if n.startswith(prefixo))
    except OSError:
        return
    for nome in nomes[:-EXPORT_KEEP]:
        try:
            os.remove(os.path.join(EXPORT_DIR, nome))
        except OSError:
            pass
