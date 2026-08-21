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
import re
import threading
import time
from datetime import datetime, timedelta

from .config import HERE
from .statefile import read_json, write_json
from .stats import MIN_SAMPLE, horas_entre, mediana
from .text import normalize

HISTORY_FILE = os.path.join(HERE, "history.json")

# Arquivo do que sai da janela viva, um ficheiro por mês. O `history.json` guarda
# os últimos MAX_EVENTS eventos e nada mais: numa folha com movimento isso são
# semanas, e o que passava desse limite desaparecia — com ele desaparecia o
# desfazer de um Push antigo (precisa dos eventos DAQUELE envio) e a vista de
# métricas de um período mais atrás ficava vazia sem dizer porquê. Agora só sai
# da memória viva, não da app.
ARCHIVE_DIRNAME = "history"

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

# (pasta, mês) -> ((mtime, tamanho), eventos): ler o arquivo do disco a cada pergunta das
# métricas custava mais do que o valor de o ter
_ARCHIVE_CACHE = {}

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


def _mes(ts):
    """"2026-08" a partir da marca de um evento ("" se ela não presta)."""
    m = str(ts or "")[:7]
    return m if len(m) == 7 and m[4] == "-" else ""


def _archive_dir():
    """A pasta do arquivo é vizinha do `history.json` e não a da app: os testes
    apontam o HISTORY_FILE para uma pasta temporária, e um arquivo de teste a
    aterrar na pasta a sério ficava lá a contar história que não aconteceu."""
    return os.path.join(os.path.dirname(os.path.abspath(HISTORY_FILE)),
                        ARCHIVE_DIRNAME)


def _archive_path(mes):
    return os.path.join(_archive_dir(), f"history-{mes}.json")


def _archive(eventos):
    """Manda para o arquivo do mês os eventos que saem da janela viva.

    Sem cópia de segurança de propósito: o arquivo só cresce por acrescento e
    uma cópia diária de um ficheiro destes seria a mesma coisa outra vez.
    """
    por_mes = {}
    for e in eventos:
        mes = _mes(e.get("ts"))
        if mes:
            por_mes.setdefault(mes, []).append(e)
    for mes, lista in por_mes.items():
        caminho = _archive_path(mes)
        atual = read_json(caminho)
        try:
            os.makedirs(_archive_dir(), exist_ok=True)
            write_json(caminho, (atual if isinstance(atual, list) else []) + lista,
                       backup=False)
        except OSError:
            # sem escrita na pasta: perde-se o arquivo, não o resto do histórico
            pass
        _ARCHIVE_CACHE.pop((_archive_dir(), mes), None)


def _archive_read(mes):
    """Os eventos arquivados de um mês (em cache, revalidada pela data)."""
    caminho = _archive_path(mes)
    try:
        st = os.stat(caminho)
        marca = (int(st.st_mtime), st.st_size)
    except OSError:
        return []
    chave = (_archive_dir(), mes)
    guardado = _ARCHIVE_CACHE.get(chave)
    if guardado and guardado[0] == marca:
        return guardado[1]
    lista = read_json(caminho)
    lista = [e for e in lista if isinstance(e, dict)] if isinstance(lista, list) else []
    _ARCHIVE_CACHE[chave] = (marca, lista)
    return lista


def _meses_entre(baixo, alto):
    """Os meses que um intervalo ISO toca, do mais antigo para o mais recente."""
    a, b = _mes(baixo), _mes(alto)
    if not a:
        return []
    # nunca há arquivo do futuro: sem este teto, um limite aberto (_SEM_FIM)
    # dava 240 procuras no disco por cada pergunta ao histórico
    hoje = datetime.now().strftime("%Y-%m")
    if not b or b > hoje:
        b = hoje
    if b < a:
        b = a
    out, ano, mes = [], int(a[:4]), int(a[5:7])
    while f"{ano:04d}-{mes:02d}" <= b and len(out) < 240:
        out.append(f"{ano:04d}-{mes:02d}")
        mes += 1
        if mes > 12:
            ano, mes = ano + 1, 1
    return out


def archived_events(baixo, alto):
    """Os eventos arquivados dentro de [baixo, alto) — só os meses que ele toca."""
    out = []
    for mes in _meses_entre(baixo, alto):
        out.extend(e for e in _archive_read(mes)
                   if baixo <= str(e.get("ts") or "") < alto)
    return out


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
            todos = data["events"] + mudancas
            if len(todos) > MAX_EVENTS:
                _archive(todos[:len(todos) - MAX_EVENTS])
            data["events"] = todos[-MAX_EVENTS:]
        if mudancas or antes != depois:
            _save(data)
        return len(mudancas)


def sheet_history(workbook_id, sheet, days=30, limit=400, fn=None, todo=None):
    """O que a interface precisa de saber sobre uma folha: quando cada linha
    mudou pela última vez (para as tarefas paradas) e os eventos recentes.

    Com `fn`/`todo` responde só sobre UMA linha, pela identidade dela e não pelo
    número (o número muda de mês para mês, a identidade não) — é o que permite à
    caixa de uma tarefa ir buscar a história toda dela sem arrastar a folha
    inteira do arquivo.
    """
    key = _key(workbook_id, sheet)
    with _lock:
        data = _load()
        book = data["snapshots"].get(key) or {}
        rows = _snapshot_rows(book) if isinstance(book.get("rows"), dict) else {}
        eventos = [e for e in data["events"]
                   if e.get("book") == workbook_id and e.get("sheet") == sheet]
    corte = (datetime.now() - timedelta(days=max(1, int(days)))).isoformat()
    # o arquivo entra primeiro: os eventos ficam por ordem de tempo, que é o que
    # o `[-limit:]` lá abaixo assume para cortar pelos mais recentes
    eventos = [e for e in archived_events(corte, _SEM_FIM)
               if e.get("book") == workbook_id and e.get("sheet") == sheet] + eventos
    eventos = [e for e in eventos if str(e.get("ts") or "") >= corte]
    if fn is not None or todo is not None:
        alvo_fn, alvo_todo = normalize(fn or ""), normalize(todo or "")
        eventos = [e for e in eventos
                   if normalize(e.get("fn") or "") == alvo_fn
                   and normalize(e.get("todo") or "") == alvo_todo]
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
        # idas e voltas de cada linha (ver bounce_counts): sai dos eventos que
        # já estão aqui em mão, por isso não custa uma leitura a mais
        "bounces": bounce_counts(eventos),
    }


def recent_events(days=7, limit=1000, since="", until=""):
    """Eventos de todos os livros/abas no período (relatório da semana e vista de
    métricas), dos mais recentes para os mais antigos. O período são os últimos
    `days` dias ou, com `since`/`until`, o intervalo de datas pedido (ver
    range_bounds)."""
    baixo, alto = range_bounds(days, since, until)
    with _lock:
        vivos = [e for e in _load()["events"]
                 if baixo <= str(e.get("ts") or "") < alto]
    # um período que chegue mais atrás do que a janela viva vinha vazio: os
    # eventos estão no arquivo do mês (ver _archive)
    eventos = archived_events(baixo, alto) + vivos
    return eventos[-max(1, int(limit)):][::-1]


def batch_events(batch):
    """As alterações de um Push (o `batch` dos eventos), das mais antigas para as
    mais recentes. Vazio quando o lote já saiu da janela guardada."""
    batch = str(batch or "").strip()
    if not batch:
        return []
    with _lock:
        vivos = [dict(e) for e in _load()["events"] if str(e.get("batch") or "") == batch]
    if vivos:
        return vivos
    # o lote saiu da janela viva: o nome dele é "p" + o instante do Push em
    # milissegundos, e é isso que diz em que mês do arquivo ele está — assim não
    # se lê o arquivo todo para desfazer um envio
    quando = _batch_month(batch)
    if not quando:
        return []
    for mes in quando:
        achados = [dict(e) for e in _archive_read(mes)
                   if str(e.get("batch") or "") == batch]
        if achados:
            return achados
    return []


def _batch_month(batch):
    """Os meses onde procurar um lote: o do instante no nome dele e os vizinhos
    (um Push à meia-noite do dia 1 pode ter eventos dos dois lados)."""
    if not (batch.startswith("p") and batch[1:].isdigit()):
        return []
    try:
        quando = datetime.fromtimestamp(int(batch[1:]) / 1000.0)
    except (OverflowError, OSError, ValueError):
        return []
    mes, ano = quando.month, quando.year
    vizinhos = [(ano, mes)]
    vizinhos.append((ano - 1, 12) if mes == 1 else (ano, mes - 1))
    vizinhos.append((ano + 1, 1) if mes == 12 else (ano, mes + 1))
    return [f"{a:04d}-{m:02d}" for a, m in vizinhos]


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


# ---------------------------------------------------------------------------
# Dobras sobre o que já está gravado
#
# Estas funções não leem a folha nem a rede: pegam nos eventos que já existem
# (a janela viva mais o arquivo) e dobram-nos noutra pergunta. Nenhuma delas
# precisa de dados novos — o que faltava era fazer a conta.
# ---------------------------------------------------------------------------

# estados só fazem sentido nas colunas de estado: o OBS e o Function/TC mudam
# de valor sem "estar num estado" durante x dias
STATUS_COLS = ("Status TC", "Status TP")



def _por_ident_col(eventos, cols=None):
    """Eventos agrupados por (ident, coluna) e ordenados no tempo."""
    grupos = {}
    for e in eventos:
        col = str(e.get("col") or "")
        if cols and col not in cols:
            continue
        ident = str(e.get("ident") or "")
        if not ident:
            continue
        grupos.setdefault((ident, col), []).append(e)
    for chave in grupos:
        grupos[chave].sort(key=lambda x: str(x.get("ts") or ""))
    return grupos


def transition_stats(days=120, since="", until=""):
    """Quanto tempo, tipicamente, uma linha fica em cada estado.

    O histórico é mostrado como uma lista do que aconteceu e nunca foi dobrado
    em DURAÇÕES, que é o que permite dizer "a mediana em *In progress* são 2,1
    dias — esta vai no dia 6" e projetar uma data provável de fim.

    A conta: para cada linha e coluna, dois eventos seguidos delimitam o tempo
    que ela passou no valor a que o primeiro a levou. O último valor de cada
    linha não conta (ainda está a correr — não se sabe quanto vai durar), por
    isso isto mede o passado fechado e não o presente.
    """
    eventos = recent_events(days=days, limit=100000, since=since, until=until)
    grupos = _por_ident_col(eventos, STATUS_COLS)
    horas = {}
    for (_ident, col), seq in grupos.items():
        for anterior, seguinte in zip(seq, seq[1:]):
            valor = str(anterior.get("to") or "").strip()
            if not valor:
                continue
            passou = horas_entre(anterior.get("ts"), seguinte.get("ts"))
            if passou is None:
                continue
            horas.setdefault(col, {}).setdefault(valor, []).append(passou)
    saida = {}
    for col, valores in horas.items():
        linhas = []
        for valor, amostra in valores.items():
            meio = mediana(amostra)
            linhas.append({"value": valor,
                           "n": len(amostra),
                           "median_days": round(meio / 24.0, 2),
                           "max_days": round(max(amostra) / 24.0, 2),
                           # com poucos casos a interface diz "por 2 casos"
                           # em vez de apresentar isto como uma mediana
                           "thin": len(amostra) < MIN_SAMPLE})
        linhas.sort(key=lambda x: (-x["n"], x["value"].lower()))
        saida[col] = linhas
    return saida


def overwritten_pushes(days=30, since="", until=""):
    """Células que a app escreveu e a folha depois mudou por cima.

    Hoje isto só se descobre por acaso, a reler o histórico daquela linha: o
    envio deu certo, ninguém avisou de nada, e o valor já não é o que foi
    enviado. A deteção é mecânica — um evento `via:"app"` seguido, na mesma
    linha e coluna, de um `via:"sheet"`.
    """
    eventos = recent_events(days=days, limit=100000, since=since, until=until)
    grupos = _por_ident_col(eventos)
    saida = []
    for (ident, col), seq in grupos.items():
        for anterior, seguinte in zip(seq, seq[1:]):
            if str(anterior.get("via")) != "app" or str(seguinte.get("via")) != "sheet":
                continue
            saida.append({
                "ident": ident,
                "col": col,
                "book": anterior.get("book") or "",
                "sheet": anterior.get("sheet") or "",
                "xlrow": _int_or_zero(seguinte.get("xlrow") or anterior.get("xlrow")),
                "fn": seguinte.get("fn") or anterior.get("fn") or "",
                "todo": seguinte.get("todo") or anterior.get("todo") or "",
                "mine": str(anterior.get("to") or ""),
                "now": str(seguinte.get("to") or ""),
                "pushed_at": str(anterior.get("ts") or ""),
                "changed_at": str(seguinte.get("ts") or ""),
                # o ☁ da interface vai daqui buscar quem gravou (authors.py)
                "batch": str(anterior.get("batch") or ""),
                # voltar ao valor de antes é o caso mais gritante: alguém
                # desfez o que a app enviou
                "reverted": str(seguinte.get("to") or "") == str(anterior.get("from") or ""),
            })
    saida.sort(key=lambda x: x["changed_at"], reverse=True)
    return saida


def bounce_counts(eventos):
    """Quantas vezes cada linha VOLTOU a um estado onde já tinha estado.

    Uma linha que foi A→B e mais tarde B→A ricocheteou: na prática, voltou da
    revisão. A app já guardava cada reversão mas trata cada evento como uma
    linha isolada, e a contagem de idas e voltas não estava em sítio nenhum.

    Recebe a lista de eventos já lida por quem chama (é o `sheet_history` que
    chama isto, com os eventos que de qualquer maneira ia devolver): a conta não
    custa uma leitura a mais, mas em troca só vê a janela de dias que essa
    leitura trouxe — um ricochete mais antigo do que isso não é contado.

    Devolve {xlrow: {"n": vezes, "cols": [colunas]}} — pela linha que a folha
    tem AGORA, que é como a interface a encontra.
    """
    grupos = _por_ident_col(eventos, STATUS_COLS)
    por_ident = {}
    for (ident, col), seq in grupos.items():
        vistos = set()
        voltas = 0
        for e in seq:
            de = str(e.get("from") or "").strip().lower()
            para = str(e.get("to") or "").strip().lower()
            if de:
                vistos.add(de)
            if para and para in vistos:
                voltas += 1
            if para:
                vistos.add(para)
        if voltas:
            alvo = por_ident.setdefault(ident, {"n": 0, "cols": [], "xlrow": 0})
            alvo["n"] += voltas
            alvo["cols"].append(col)
            alvo["xlrow"] = _int_or_zero(seq[-1].get("xlrow")) or alvo["xlrow"]
    saida = {}
    for dados in por_ident.values():
        if dados["xlrow"]:
            saida[str(dados["xlrow"])] = {"n": dados["n"],
                                          "cols": sorted(set(dados["cols"]))}
    return saida


# ---------------------------------------------------------------------------
# A montra: quatro números para ler a dois metros
#
# Toda a app assume um leitor a 50 cm que INTERAGE. A montra é o contrário: uma
# página para ficar aberta num segundo monitor (ou num tablet reformado apontado
# ao endereço da rede local), sem botões, com números grandes e um rodapé do que
# mexeu. Ninguém clica nela — olha-se de passagem.
#
# Os números saem daqui e não do cliente porque a montra não carrega a interface
# toda (são ~800 KB de JS para mostrar quatro números): é um pedido, uma resposta.

# um estado que já não espera trabalho de ninguém — o gémeo do statusIsFinal da
# interface (static/js/utils.js). Os dois têm de dizer o mesmo: se divergirem, a
# montra e a vista de Tarefas contam paradas diferentes da mesma folha.
_FINAL_RE = re.compile(
    r"(conclu|done|closed|fechad|complet|finaliz|\breviewed\b|\brevisto\b|\bok\b"
    r"|\bremoved\b|\bremovid)")


def status_is_final(texto):
    """O estado já não espera trabalho de ninguém."""
    return bool(_FINAL_RE.search(normalize(texto or "")))


def stale_summary(days=7):
    """Quantas linhas não acabadas não mexem há mais de `days` dias.

    Sai do RETRATO do histórico (as colunas de cada linha estão lá, ver
    _row_entry), e não das folhas em memória: assim a conta existe mesmo antes de
    alguém abrir a vista de Tarefas nesta sessão.
    """
    dias = max(1, int(days or 7))
    corte = (datetime.now() - timedelta(days=dias)).isoformat()
    paradas, abertas, nunca_vistas = 0, 0, 0
    with _lock:
        snapshots = dict(_load()["snapshots"])
    for book in snapshots.values():
        if not isinstance(book, dict):
            continue
        for entry in _snapshot_rows(book).values():
            if not isinstance(entry, dict):
                continue
            cols = entry.get("cols") if isinstance(entry.get("cols"), dict) else {}
            estados = [str(cols.get(c) or "").strip()
                       for c in ("Status TC", "Status TP")]
            estados = [e for e in estados if e and normalize(e) != "n/a"]
            # sem estado nenhum não há trabalho à espera de ninguém, e uma linha
            # toda acabada também não (a mesma regra do taskIsDone da interface)
            if not estados or all(status_is_final(e) for e in estados):
                continue
            abertas += 1
            quando = str(entry.get("changed") or entry.get("first") or "")
            if quando and quando < corte:
                paradas += 1
                if not _int_or_zero(entry.get("changes")):
                    nunca_vistas += 1
    return {"stale": paradas, "open": abertas, "estimated": nunca_vistas,
            "days": dias}


# ---------------------------------------------------------------------------
# A folha naquele dia
#
# O histórico guarda o retrato de AGORA (por identidade de linha, com as colunas
# seguidas) e, para cada alteração, o antes e o depois. Com essas duas coisas a
# folha de uma data passada não precisa de ter sido guardada: reconstrói-se ao
# contrário — parte-se do presente e desfazem-se, uma a uma, as alterações que
# aconteceram DEPOIS do instante pedido.
#
# Limites que a vista tem de dizer (e diz):
#   - só as colunas seguidas (HISTORY_COLS): das outras não há antes nem depois;
#   - só até onde o histórico chega (o `seeded` de cada folha);
#   - uma linha criada depois da data pedida aparece como não existindo então.

def reconstruct_at(workbook_id, sheet, at):
    """A folha como estava no instante `at` (ISO), pelas colunas seguidas.

    Devolve {"at", "seeded", "rows": [...], "undone", "partial"} — `partial` é
    True quando a data pedida é anterior ao início do histórico desta folha, que
    é o caso em que a resposta é o mais antigo que se sabe e não a verdade.
    """
    alvo = str(at or "")
    if not alvo:
        return {"at": "", "seeded": "", "rows": [], "undone": 0, "partial": True}
    key = _key(workbook_id, sheet)
    with _lock:
        data = _load()
        book = data["snapshots"].get(key) or {}
        agora = _snapshot_rows(book) if isinstance(book.get("rows"), dict) else {}
        vivos = [e for e in data["events"]
                 if e.get("book") == workbook_id and e.get("sheet") == sheet]
    semeado = str(book.get("seeded") or "")
    # os eventos que aconteceram DEPOIS do instante pedido, do mais recente para
    # o mais antigo: é essa a ordem por que se desfaz
    eventos = [e for e in archived_events(alvo, _SEM_FIM)
               if e.get("book") == workbook_id and e.get("sheet") == sheet] + vivos
    eventos = sorted((e for e in eventos if str(e.get("ts") or "") > alvo),
                     key=lambda e: str(e.get("ts") or ""), reverse=True)
    # o presente, por identidade, só com as colunas seguidas
    linhas = {}
    for ident, entry in agora.items():
        if not isinstance(entry, dict):
            continue
        cols = entry.get("cols") if isinstance(entry.get("cols"), dict) else {}
        linhas[ident] = {
            "ident": ident,
            "xlrow": _int_or_zero(entry.get("xlrow")),
            "fn": str(entry.get("fn") or ""),
            "todo": str(entry.get("todo") or ""),
            "cols": {c: str(cols.get(c, "") or "") for c in HISTORY_COLS},
            "now": {c: str(cols.get(c, "") or "") for c in HISTORY_COLS},
            # a linha existia naquela data? assume-se que sim e desmente-se
            # quando se encontrar a alteração que lhe deu o primeiro valor
            "existed": True,
        }
    desfeitas = 0
    for e in eventos:
        ident = str(e.get("ident") or "")
        col = str(e.get("col") or "")
        if col not in HISTORY_COLS:
            continue
        linha = linhas.get(ident)
        if linha is None:
            # a linha já não está na folha: reaparece com o valor que tinha
            linha = {"ident": ident, "xlrow": _int_or_zero(e.get("xlrow")),
                     "fn": str(e.get("fn") or ""), "todo": str(e.get("todo") or ""),
                     "cols": {c: "" for c in HISTORY_COLS},
                     "now": {c: "" for c in HISTORY_COLS},
                     "existed": True, "gone": True}
            linhas[ident] = linha
        linha["cols"][col] = str(e.get("from") or "")
        desfeitas += 1
    # uma linha cujas colunas de nome estavam todas vazias naquela data ainda não
    # existia: mostrá-la vazia seria inventar uma linha em branco na folha
    saida = []
    for linha in linhas.values():
        nome = f"{linha['cols'].get('Function/TC', '')}{linha['cols'].get('To Do', '')}"
        linha["existed"] = bool(nome.strip())
        if linha["existed"]:
            saida.append(linha)
    saida.sort(key=lambda l: (l["xlrow"], l["ident"]))
    return {"at": alvo, "seeded": semeado, "rows": saida, "undone": desfeitas,
            # antes do início do histórico não se sabe: diz-se, em vez de
            # apresentar o mais antigo que se sabe como se fosse aquele dia
            "partial": bool(semeado and alvo < semeado)}


def diff_between(workbook_id, sheet, de, para=""):
    """O que mudou nas colunas seguidas entre duas datas (ou até agora).

    Devolve {"from", "to", "changes": [{ident, fn, todo, xlrow, col, before,
    after}], "partial"} — é a vista "agora vs há duas semanas".
    """
    antes = reconstruct_at(workbook_id, sheet, de)
    if para:
        depois = reconstruct_at(workbook_id, sheet, para)
        mapa = {l["ident"]: l["cols"] for l in depois["rows"]}
        parcial = antes["partial"] or depois["partial"]
    else:
        # sem segunda data, o "depois" é o presente, que já vem em cada linha
        mapa = {l["ident"]: l["now"] for l in antes["rows"]}
        parcial = antes["partial"]
    mudancas = []
    for linha in antes["rows"]:
        agora = mapa.get(linha["ident"])
        if agora is None:
            continue
        for col in HISTORY_COLS:
            velho = str(linha["cols"].get(col, "") or "")
            novo = str(agora.get(col, "") or "")
            if velho != novo:
                mudancas.append({"ident": linha["ident"], "fn": linha["fn"],
                                 "todo": linha["todo"], "xlrow": linha["xlrow"],
                                 "col": col, "before": velho, "after": novo})
    mudancas.sort(key=lambda m: (m["xlrow"], m["col"]))
    return {"from": de, "to": para, "changes": mudancas, "partial": parcial,
            "seeded": antes["seeded"]}
