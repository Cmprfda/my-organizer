# -*- coding: utf-8 -*-
"""Histórico de alterações das linhas do tracker.

O Excel não guarda quem mudou o quê nem quando. A app já compara cada leitura
da folha com um retrato da leitura anterior para mostrar os cartões de aviso
(static/js/notify.js), mas atira a diferença fora depois de a mostrar. Aqui a
mesma comparação é feita do lado do servidor, para TODAS as linhas da folha (não
só as ligadas a quem está a ver) e é guardada: é daqui que saem as tarefas
paradas (aging), o relatório da semana e a vista de métricas.

O retrato é por IDENTIDADE da linha (Function/TC + To Do, ver _ident) e não pelo
número dela na folha. Enquanto foi pelo número, inserir ou apagar uma linha
empurrava todas as de baixo, o retrato antigo passava a falar das linhas erradas
e a única saída era semeá-lo de novo: as idades voltavam todas a "≥ N dias" e o
botão Paradas ficava sem sentido durante dias. Pela identidade, a linha é
reconhecida onde quer que esteja — e uma linha renomeada (a app escreve o
Function/TC e o To Do) é reconhecida por estar na mesma posição, com o resto
igual (ver _same_row_renamed).
"""

import json
import os
import threading
import time
from datetime import datetime, timedelta

from .config import HERE
from .statefile import read_json, write_json
from .text import normalize

HISTORY_FILE = os.path.join(HERE, "history.json")

# colunas seguidas: as mesmas que a app sabe ler e escrever na folha (as de
# notify.js). Os valores comparados são sempre os da FOLHA (row_meta["orig"]),
# nunca os que já têm uma alteração local (✎) aplicada por cima — senão marcar
# um estado aqui aparecia no histórico duas vezes, uma ao editar e outra no Push.
HISTORY_COLS = ("Status TC", "Status TP", "OBS", "Function/TC", "To Do")

MAX_EVENTS = 5000          # eventos guardados (os mais antigos saem primeiro)
_RENAME_MAX = 5            # linhas renomeadas que se aceitam numa leitura
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


def _ident(fn, todo, xlrow):
    """A identidade de uma linha da folha: o que ela DIZ, não onde está.

    O retrato era guardado por número de linha, e por isso uma linha inserida (ou
    apagada) no meio da folha empurrava todas as de baixo: as datas herdadas
    passavam a pertencer à linha errada e a única saída era semear tudo de novo —
    as idades voltavam todas a "≥ N dias" e o botão Paradas ficava sem sentido
    durante dias. Aqui a linha é reconhecida pelo Function/TC + To Do, que é como
    as pessoas (e o resto da app: overrides, notas, "à espera de") já a
    identificam. Uma linha sem nenhum dos dois cai no número, que é tudo o que
    ela tem.
    """
    base = f"{normalize(fn)}||{normalize(todo)}"
    return base if base.strip("|").strip() else f"#{xlrow}"


def _snapshot_rows(book):
    """As linhas do retrato por identidade, migrando o retrato antigo.

    Os retratos gravados antes desta versão têm o número da linha como chave. As
    entradas já guardam o `fn` e o `todo`, por isso a identidade tira-se delas
    sem perder história — ninguém volta a "≥ N dias" por causa da atualização.
    """
    rows = book.get("rows") if isinstance(book.get("rows"), dict) else {}
    if book.get("keyed") == "ident":
        return {k: v for k, v in rows.items() if isinstance(v, dict)}
    out = {}
    for chave, entry in rows.items():
        if not isinstance(entry, dict):
            continue
        xlrow = _int_or_zero(entry.get("xlrow")) or _int_or_zero(chave)
        entry = dict(entry, xlrow=xlrow)
        out[_ident(entry.get("fn"), entry.get("todo"), xlrow)] = entry
    return out


def _same_row_renamed(prev, cols):
    """A linha é a mesma, com o nome mudado?

    Só se pergunta isto ao que sobrou depois de emparelhar por identidade e na
    MESMA linha da folha. Chega que uma das duas metades do nome se mantenha (é
    o caso normal: muda o Function/TC ou muda o To Do), ou que todas as outras
    colunas seguidas estejam iguais — aí o que mudou foi só o nome.
    """
    antes = prev.get("cols") if isinstance(prev.get("cols"), dict) else {}
    if normalize(antes.get("Function/TC", "")) == normalize(cols.get("Function/TC", "")):
        return True
    if normalize(antes.get("To Do", "")) == normalize(cols.get("To Do", "")):
        return True
    outras = [c for c in HISTORY_COLS if c not in ("Function/TC", "To Do")]
    return all(str(antes.get(c, "") or "") == str(cols.get(c, "") or "") for c in outras)


def _key(workbook_id, sheet):
    """Identidade de uma folha no histórico: livro||aba, como nos overrides."""
    return f"{workbook_id}||{sheet}"


def _empty():
    return {"version": 1, "snapshots": {}, "events": []}


def _load():
    """Chamar sempre com o _lock preso."""
    data = read_json(HISTORY_FILE)
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
    write_json(HISTORY_FILE, data)


def load_history():
    with _lock:
        return _load()


def mark_app_write(workbook_id, sheet, xlrow, col, value, batch=""):
    """Assinala que foi esta app a escrever esta célula (chamado pelo Push, ver
    push_overrides em tasks.py). A leitura seguinte encontra a alteração na folha
    e, por causa desta marca, anota-a como feita aqui em vez de "alguém mexeu"."""
    agora = time.time()
    for k, (_, ts, _lote) in list(_APP_WRITES.items()):
        if agora - ts > _APP_WRITE_TTL:
            _APP_WRITES.pop(k, None)
    _APP_WRITES[(normalize(workbook_id), normalize(sheet), int(xlrow), col)] = \
        (str(value or ""), agora, str(batch or ""))


def _app_write_batch(workbook_id, sheet, xlrow, col, value):
    """O Push de que esta alteração veio: "" quando veio da app sem lote
    conhecido, None quando não veio da app."""
    entry = _APP_WRITES.get((normalize(workbook_id), normalize(sheet), int(xlrow), col))
    if not entry:
        return None
    escrito, ts, lote = entry
    if escrito != str(value or "") or (time.time() - ts) > _APP_WRITE_TTL:
        return None
    return lote


def _row_entry(row, cols, prev, now):
    prev = prev or {}
    return {
        "fn": str(row.get("fn") or "")[:200],
        "todo": str(row.get("todo") or "")[:200],
        # onde a linha estava na última leitura: já não é a chave do retrato, mas
        # continua a ser por aqui que a interface (e as notificações) a encontram
        "xlrow": _int_or_zero(row.get("xlrow")),
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
        antes = _snapshot_rows(book)
        # o que esta leitura traz, pela identidade de cada linha
        lidas = []
        for row in rows:
            try:
                xlrow = int(row.get("xlrow"))
            except (TypeError, ValueError):
                continue
            crus = row.get("cols") if isinstance(row.get("cols"), dict) else {}
            cols = {c: str(crus.get(c, "") or "") for c in HISTORY_COLS}
            lidas.append((_ident(row.get("fn"), row.get("todo"), xlrow), xlrow, row, cols))
        # 1) emparelhar pela identidade: a linha é reconhecida onde quer que
        #    esteja, e uma linha inserida acima deixa de mexer com as outras
        sobra = dict(antes)
        pares = {}
        sem_par = []
        for ident, xlrow, row, cols in lidas:
            prev = sobra.pop(ident, None)
            if isinstance(prev, dict):
                pares[ident] = prev
            else:
                sem_par.append((ident, xlrow, cols))
        # 2) o que sobrou de um lado e do outro, NA MESMA linha da folha: é uma
        #    linha renomeada (a app escreve o Function/TC e o To Do). Só se
        #    aceitam poucas de uma vez — muitas ao mesmo tempo já não se
        #    distinguem de linhas novas, e adivinhar inventava história.
        if sem_par and sobra and len(sem_par) <= _RENAME_MAX:
            por_linha = {}
            for ident_antigo, entry in sobra.items():
                por_linha.setdefault(_int_or_zero(entry.get("xlrow")), []).append(ident_antigo)
            for ident, xlrow, cols in sem_par:
                candidatos = por_linha.get(xlrow) or []
                for ident_antigo in list(candidatos):
                    entry = sobra.get(ident_antigo)
                    if isinstance(entry, dict) and _same_row_renamed(entry, cols):
                        pares[ident] = sobra.pop(ident_antigo)
                        candidatos.remove(ident_antigo)
                        break
        depois, mudancas = {}, []
        for ident, xlrow, row, cols in lidas:
            prev = pares.get(ident)
            entry = _row_entry(row, cols, prev if isinstance(prev, dict) else None, now)
            if isinstance(prev, dict) and not primeira:
                prev_cols = prev.get("cols") if isinstance(prev.get("cols"), dict) else {}
                for col in HISTORY_COLS:
                    de = str(prev_cols.get(col, "") or "")
                    para = cols[col]
                    if de == para:
                        continue
                    lote = _app_write_batch(workbook_id, sheet, xlrow, col, para)
                    evento = {
                        "ts": now, "book": workbook_id, "sheet": sheet, "xlrow": xlrow,
                        "fn": entry["fn"], "todo": entry["todo"], "col": col,
                        "from": de[:300], "to": para[:300],
                        "via": "sheet" if lote is None else "app",
                        # a identidade acompanha o evento: o número da linha pode
                        # já não ser este quando alguém for ver o histórico
                        "ident": ident,
                    }
                    # o Push de que a alteração veio: é o que permite desfazer um
                    # envio inteiro de uma vez, e não célula a célula
                    # (ver batch_events e /api/history/undo)
                    if lote:
                        evento["batch"] = lote
                    mudancas.append(evento)
                    entry["changed"] = now
                    entry["changes"] += 1
            depois[ident] = entry
        book["rows"] = depois
        book["keyed"] = "ident"
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
        rows = _snapshot_rows(book) if isinstance(book.get("rows"), dict) else {}
        eventos = [e for e in data["events"]
                   if e.get("book") == workbook_id and e.get("sheet") == sheet]
    corte = (datetime.now() - timedelta(days=max(1, int(days)))).isoformat()
    eventos = [e for e in eventos if str(e.get("ts") or "") >= corte]
    # a interface encontra as linhas pelo número que a folha tem AGORA: o
    # retrato é guardado por identidade, e é aqui que se volta a essa chave
    linhas = {}
    for entry in rows.values():
        if not isinstance(entry, dict):
            continue
        xlrow = str(_int_or_zero(entry.get("xlrow")))
        linhas[xlrow] = {
            "changed": entry.get("changed") or entry.get("first") or "",
            # a linha ainda nunca foi vista a mudar: a data acima é a de quando
            # começámos a olhar para ela, por isso a idade é "pelo menos isto"
            # e não a verdadeira — a interface mostra-a com ≥
            "estimated": _int_or_zero(entry.get("changes")) == 0,
        }
    # quantas alterações levou cada Push desta folha: a caixa de detalhe de uma
    # tarefa só vê os eventos DELA, e é isto que lhe permite dizer "este envio
    # mexeu em 7 células" e oferecer o desfazer do envio inteiro
    lotes = {}
    for e in eventos:
        lote = str(e.get("batch") or "")
        if lote:
            lotes[lote] = lotes.get(lote, 0) + 1
    return {
        "seeded": book.get("seeded") or "",
        "rows": linhas,
        "events": eventos[-max(1, int(limit)):][::-1],   # mais recentes primeiro
        "batches": lotes,
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


def batch_events(batch):
    """As alterações de um Push (o `batch` dos eventos), das mais antigas para as
    mais recentes. Vazio quando o lote já saiu da janela guardada."""
    batch = str(batch or "").strip()
    if not batch:
        return []
    with _lock:
        return [dict(e) for e in _load()["events"] if str(e.get("batch") or "") == batch]


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
