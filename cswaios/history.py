# -*- coding: utf-8 -*-
"""Histórico de alterações das linhas do tracker.

O Excel não guarda quem mudou o quê nem quando. A app já compara cada leitura
da folha com um retrato da leitura anterior para mostrar os cartões de aviso
(static/js/notify.js), mas atira a diferença fora depois de a mostrar. Aqui a
mesma comparação é feita do lado do servidor, para TODAS as linhas da folha (não
só as ligadas a quem está a ver) e é guardada: é daqui que saem as tarefas
paradas (aging), o relatório da semana e a vista de métricas.

O retrato é por número de linha da folha, como em notify.js. Inserir ou apagar
uma linha empurra todas as outras e faria parecer que meio livro mudou de uma
vez: quando a diferença é grande demais para ser trabalho de gente, o retrato é
apenas semeado de novo, sem inventar história (ver _looks_like_row_shift).
"""

import json
import os
import threading
import time
from datetime import datetime, timedelta

from .config import HERE
from .text import normalize

HISTORY_FILE = os.path.join(HERE, "history.json")

# colunas seguidas: as mesmas que a app sabe ler e escrever na folha (as de
# notify.js). Os valores comparados são sempre os da FOLHA (row_meta["orig"]),
# nunca os que já têm uma alteração local (✎) aplicada por cima — senão marcar
# um estado aqui aparecia no histórico duas vezes, uma ao editar e outra no Push.
HISTORY_COLS = ("Status TC", "Status TP", "OBS", "Function/TC", "To Do")

MAX_EVENTS = 5000          # eventos guardados (os mais antigos saem primeiro)
_SHIFT_MIN_ROWS = 8        # abaixo disto nunca se assume linha inserida/apagada
_SHIFT_RATIO = 0.4         # ... acima desta fração das linhas da folha, assume-se
_APP_WRITE_TTL = 3600      # segundos que uma escrita da app fica reconhecível
# limite superior "sem fim" para comparar com marcas ISO como texto: qualquer
# data real começa por um dígito menor do que o 9 do ano 9999
_SEM_FIM = "9999-99-99"

_lock = threading.Lock()

# Escritas feitas por esta app (Push para o Excel), para o histórico poder
# distinguir "fui eu daqui" de "alguém mexeu na folha". Só em memória e de vida
# curta: é uma etiqueta melhor no evento, não um registo de que se dependa.
# (livro, aba, linha, coluna) -> (valor escrito, instante)
_APP_WRITES = {}


def _now_iso():
    return datetime.now().replace(microsecond=0).isoformat()


def iso_day(value):
    """"AAAA-MM-DD" válido, ou "" — as marcas dos eventos são ISO em hora local,
    por isso comparam-se como texto e basta o prefixo do dia."""
    text = str(value or "").strip()[:10]
    try:
        datetime.strptime(text, "%Y-%m-%d")
    except ValueError:
        return ""
    return text


def _next_day(iso_day):
    """O dia seguinte, para servir de limite superior ABERTO: assim o último dia
    do intervalo entra inteiro, com as horas todas."""
    return (datetime.strptime(iso_day, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")


def range_bounds(days=7, since="", until=""):
    """Limites (baixo incluído, alto excluído) para filtrar as marcas ISO dos
    eventos, como texto.

    Com `since`/`until` (AAAA-MM-DD, escolhidos na vista de métricas) o período é
    o intervalo pedido, em dias inteiros; sem eles, os últimos `days` dias até
    agora — o que a app fazia antes de se poderem escolher datas.
    """
    inicio, fim = iso_day(since), iso_day(until)
    if inicio and fim and inicio > fim:
        inicio, fim = fim, inicio
    if inicio or fim:
        return (inicio, _next_day(fim) if fim else _SEM_FIM)
    return ((datetime.now() - timedelta(days=max(1, int(days)))).isoformat(), _SEM_FIM)


def _key(workbook_id, sheet):
    """Identidade de uma folha no histórico: livro||aba, como nos overrides."""
    return f"{workbook_id}||{sheet}"


def _empty():
    return {"version": 1, "snapshots": {}, "events": []}


def _load():
    """Chamar sempre com o _lock preso."""
    try:
        with open(HISTORY_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return _empty()
    if not isinstance(data, dict):
        return _empty()
    out = _empty()
    if isinstance(data.get("snapshots"), dict):
        out["snapshots"] = data["snapshots"]
    if isinstance(data.get("events"), list):
        out["events"] = [e for e in data["events"] if isinstance(e, dict)]
    return out


def _save(data):
    """Chamar sempre com o _lock preso."""
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


def load_history():
    with _lock:
        return _load()


def mark_app_write(workbook_id, sheet, xlrow, col, value):
    """Assinala que foi esta app a escrever esta célula (chamado pelo Push, ver
    push_overrides em tasks.py). A leitura seguinte encontra a alteração na folha
    e, por causa desta marca, anota-a como feita aqui em vez de "alguém mexeu"."""
    agora = time.time()
    for k, (_, ts) in list(_APP_WRITES.items()):
        if agora - ts > _APP_WRITE_TTL:
            _APP_WRITES.pop(k, None)
    _APP_WRITES[(normalize(workbook_id), normalize(sheet), int(xlrow), col)] = \
        (str(value or ""), agora)


def _was_app_write(workbook_id, sheet, xlrow, col, value):
    entry = _APP_WRITES.get((normalize(workbook_id), normalize(sheet), int(xlrow), col))
    if not entry:
        return False
    escrito, ts = entry
    return escrito == str(value or "") and (time.time() - ts) <= _APP_WRITE_TTL


def _row_entry(row, cols, prev, now):
    prev = prev or {}
    return {
        "fn": str(row.get("fn") or "")[:200],
        "todo": str(row.get("todo") or "")[:200],
        "cols": cols,
        # primeira vez que esta linha foi vista: é o melhor limite inferior para
        # a idade de uma linha que ainda nunca mudou desde que há histórico
        "first": prev.get("first") or now,
        "changed": prev.get("changed") or now,
        # quantas vezes já se viu esta linha mudar. A zero, a data acima é a da
        # primeira vez que se olhou para ela, não a de uma alteração: a idade
        # que dela sai é "pelo menos isto" (ver `estimated` em sheet_history).
        # Não se pode usar changed == first para isto — duas leituras no mesmo
        # segundo davam datas iguais e a alteração passava por estimativa.
        "changes": max(0, _int_or_zero(prev.get("changes"))),
    }


def _int_or_zero(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _looks_like_row_shift(changed_rows, total_rows):
    """True quando a diferença é grande demais para ser trabalho de pessoas —
    o sinal de uma linha inserida/apagada a empurrar o número de todas as
    outras. Nesse caso o retrato é semeado de novo e não se anota nada."""
    return (changed_rows >= _SHIFT_MIN_ROWS
            and changed_rows >= _SHIFT_RATIO * max(1, total_rows))


def record_read(workbook_id, sheet, rows):
    """Compara esta leitura da folha com o retrato anterior e anota o que mudou.

    `rows` é uma lista de {"xlrow", "fn", "todo", "cols"} com os valores CRUS da
    folha (uma entrada por linha não vazia, seja de quem for a tarefa).
    Devolve o número de alterações anotadas (0 na primeira leitura de uma folha,
    que só semeia o retrato).
    """
    if not workbook_id or not sheet or not isinstance(rows, list):
        return 0
    now = _now_iso()
    with _lock:
        data = _load()
        key = _key(workbook_id, sheet)
        book = data["snapshots"].get(key)
        primeira = not isinstance(book, dict) or not isinstance(book.get("rows"), dict)
        if primeira:
            book = {"seeded": now, "rows": {}}
        antes = book["rows"]
        depois, mudancas = {}, []
        for row in rows:
            try:
                xlrow = int(row.get("xlrow"))
            except (TypeError, ValueError):
                continue
            crus = row.get("cols") if isinstance(row.get("cols"), dict) else {}
            cols = {c: str(crus.get(c, "") or "") for c in HISTORY_COLS}
            prev = antes.get(str(xlrow))
            entry = _row_entry(row, cols, prev if isinstance(prev, dict) else None, now)
            if isinstance(prev, dict) and not primeira:
                prev_cols = prev.get("cols") if isinstance(prev.get("cols"), dict) else {}
                for col in HISTORY_COLS:
                    de = str(prev_cols.get(col, "") or "")
                    para = cols[col]
                    if de == para:
                        continue
                    mudancas.append({
                        "ts": now, "book": workbook_id, "sheet": sheet, "xlrow": xlrow,
                        "fn": entry["fn"], "todo": entry["todo"], "col": col,
                        "from": de[:300], "to": para[:300],
                        "via": "app" if _was_app_write(workbook_id, sheet, xlrow, col, para)
                               else "sheet",
                    })
            depois[str(xlrow)] = entry
        linhas_mudadas = len({m["xlrow"] for m in mudancas})
        if _looks_like_row_shift(linhas_mudadas, len(rows)):
            # linha inserida/apagada: o retrato antigo já não fala das mesmas
            # linhas, por isso as datas herdadas pertencem à linha errada.
            # Semeia-se tudo de novo (first = changed = agora, ou seja, idade
            # "≥ isto") em vez de inventar história.
            mudancas = []
            depois = {k: dict(v, first=now, changed=now, changes=0)
                      for k, v in depois.items()}
            book["seeded"] = now
        for m in mudancas:
            entry = depois[str(m["xlrow"])]
            entry["changed"] = now
            entry["changes"] += 1
        book["rows"] = depois
        data["snapshots"][key] = book
        if mudancas:
            data["events"] = (data["events"] + mudancas)[-MAX_EVENTS:]
        if mudancas or antes != depois:
            _save(data)
        return len(mudancas)


def sheet_history(workbook_id, sheet, days=30, limit=400):
    """O que a interface precisa de saber sobre uma folha: quando cada linha
    mudou pela última vez (para as tarefas paradas) e os eventos recentes."""
    key = _key(workbook_id, sheet)
    with _lock:
        data = _load()
        book = data["snapshots"].get(key) or {}
        rows = book.get("rows") if isinstance(book.get("rows"), dict) else {}
        eventos = [e for e in data["events"]
                   if e.get("book") == workbook_id and e.get("sheet") == sheet]
    corte = (datetime.now() - timedelta(days=max(1, int(days)))).isoformat()
    eventos = [e for e in eventos if str(e.get("ts") or "") >= corte]
    linhas = {}
    for xlrow, entry in rows.items():
        if not isinstance(entry, dict):
            continue
        linhas[xlrow] = {
            "changed": entry.get("changed") or entry.get("first") or "",
            # a linha ainda nunca foi vista a mudar: a data acima é a de quando
            # começámos a olhar para ela, por isso a idade é "pelo menos isto"
            # e não a verdadeira — a interface mostra-a com ≥
            "estimated": _int_or_zero(entry.get("changes")) == 0,
        }
    return {
        "seeded": book.get("seeded") or "",
        "rows": linhas,
        "events": eventos[-max(1, int(limit)):][::-1],   # mais recentes primeiro
    }


def recent_events(days=7, limit=1000, since="", until=""):
    """Eventos de todos os livros/abas no período (relatório da semana e vista de
    métricas), dos mais recentes para os mais antigos. O período são os últimos
    `days` dias ou, com `since`/`until`, o intervalo de datas pedido (ver
    range_bounds)."""
    baixo, alto = range_bounds(days, since, until)
    with _lock:
        eventos = [e for e in _load()["events"]
                   if baixo <= str(e.get("ts") or "") < alto]
    return eventos[-max(1, int(limit)):][::-1]


def forget_history(workbook_id=None):
    """Esquece o histórico (de um livro, ou todo). Usado pela linha de comandos
    e pelos testes — nunca no arranque normal da app."""
    with _lock:
        data = _load()
        if workbook_id is None:
            data = _empty()
        else:
            data["snapshots"] = {k: v for k, v in data["snapshots"].items()
                                 if not k.startswith(f"{workbook_id}||")}
            data["events"] = [e for e in data["events"] if e.get("book") != workbook_id]
        _save(data)
