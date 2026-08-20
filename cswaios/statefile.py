# -*- coding: utf-8 -*-
"""Gravação do estado local em JSON: escrita atómica, cópias e trincos.

Todo o estado da app (lista Por fazer, notas de execução, CCRs, quadro das
notas, histórico) vive em ficheiros JSON aqui ao lado. Faltavam-lhe duas coisas:

- **atomicidade**: `open(..., "w")` corta o ficheiro antes de escrever, e o
  servidor é um `ThreadingHTTPServer` — a app fechada (ou o portátil a adormecer)
  no meio dessa escrita deixava o ficheiro a meio e o trabalho do utilizador
  perdido. Aqui escreve-se ao lado e só depois se troca com `os.replace`, que é
  atómico: ou fica o ficheiro antigo inteiro, ou o novo inteiro.
- **cópia de segurança**: antes da primeira gravação de cada dia guarda-se o que
  lá estava em `backups\\`. Nada disto se reconstrói a partir de outro sítio — o
  quadro das notas e o histórico não existem na folha de Excel.

Os trincos (`lock_for`) são o mesmo objeto para o mesmo caminho: dois pedidos ao
mesmo tempo (telemóvel + browser + segunda janela) deixam de fazer o ciclo
ler-mexer-gravar um por cima do outro, que é como se perdia um item da lista
acabado de criar.
"""

import json
import os
import re
import shutil
import threading
import time
from contextlib import contextmanager
from datetime import datetime

from . import events
from .config import HERE

try:                                  # Windows
    import msvcrt
except ImportError:                   # pragma: no cover - a app corre no Windows
    msvcrt = None
try:                                  # o resto (o CI corre os testes nos dois)
    import fcntl
except ImportError:
    fcntl = None

BACKUP_DIR = os.path.join(HERE, "backups")

# cópias guardadas por ficheiro. Eram uma por dia, e duas coisas apagadas no
# mesmo dia repunham-se as duas ao princípio do dia — a segunda perdia-se. Agora
# é uma por HORA nos dias recentes (dá para voltar ao que estava há pouco) e uma
# por dia nos antigos, que é para o que elas servem passada a tarde.
BACKUP_KEEP = 40
BACKUP_DIAS_FINOS = 2      # dias em que se guardam todas as horas

# o estado que é do utilizador e não se reconstrói de outro sítio. Serve para o
# botão "Guardar agora" e para a lista nas Definições saber o que mostrar; o
# resto (configuração, sessão do OneDrive) fica de fora de propósito — um token
# antigo reposto por engano é pior do que token nenhum.
STATE_FILES = (
    "todo.json",
    "todo_done_archive.json",
    "notes.json",
    "ccrs.json",
    "waiting.json",
    "notepad.json",
    "history.json",
    "status_overrides.json",
    "workbooks.json",
)

_BACKUP_RE = re.compile(r"^(?P<stem>.+)\.(?P<day>\d{8})(?:-(?P<n>\d+))?\.json$")

_locks = {}
_locks_guard = threading.Lock()

# trinco de um pedido POST inteiro: os handlers do servidor fazem
# `load_x()` -> mexem -> `save_x()` em passos separados, e a atomicidade da
# gravação não chega para isso. Reentrante porque um handler pode tocar em mais
# do que um ficheiro de estado (ex.: dar um item por feito grava a lista e o
# arquivo dos concluídos).
_post_lock = threading.RLock()


def lock_for(path):
    """O trinco deste ficheiro (o mesmo objeto para o mesmo caminho)."""
    key = os.path.normcase(os.path.abspath(path))
    with _locks_guard:
        trinco = _locks.get(key)
        if trinco is None:
            trinco = _locks[key] = threading.RLock()
    return trinco


def post_lock():
    """Trinco do pedido inteiro, para o ciclo ler-mexer-gravar dos handlers."""
    return _post_lock


def _os_trava(fh, prazo=5.0):
    """Prende o ficheiro de trinco para este PROCESSO. True se conseguiu.

    Espera até `prazo` segundos e desiste: mais vale gravar sem o trinco (e
    arriscar perder uma alteração da outra instância, que é o que já acontecia)
    do que ficar aqui pendurado e o clique do utilizador nunca responder.
    """
    fim = time.time() + prazo
    while True:
        try:
            if msvcrt is not None:
                msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
            elif fcntl is not None:
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            else:
                return False
            return True
        except OSError:
            if time.time() >= fim:
                return False
            time.sleep(0.05)


def _os_solta(fh):
    try:
        if msvcrt is not None:
            msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
        elif fcntl is not None:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
    except OSError:
        pass


@contextmanager
def state_lock(path):
    """Trinco deste ficheiro de estado entre fios E entre processos.

    O `lock_for` só vale dentro de um processo: duas instâncias da app na mesma
    pasta (a DEV e a estável, ou a app aberta duas vezes por engano) faziam o
    ciclo ler-mexer-gravar uma por cima da outra — sem partir o ficheiro, que a
    gravação é atómica, mas perdendo a alteração de uma delas. Aqui prende-se
    também um ficheiro `.lock` ao lado, que o sistema operativo só deixa uma
    instância ter de cada vez.
    """
    with lock_for(path):
        fh = None
        preso = False
        try:
            try:
                fh = open(path + ".lock", "a+b")
                preso = _os_trava(fh)
            except OSError:
                fh = None       # sem escrita na pasta: fica só o trinco de fios
            yield preso
        finally:
            if fh is not None:
                if preso:
                    _os_solta(fh)
                try:
                    fh.close()
                except OSError:
                    pass


def read_json(path, default=None):
    """Lê um JSON de estado; devolve `default` se não houver nada de jeito lá.

    A leitura fica dentro do mesmo trinco da gravação por causa do Windows: com
    o ficheiro aberto para ler, a troca do `os.replace` é recusada (violação de
    partilha) e a gravação falhava — um clique perdido só porque outro pedido
    estava a ler ao mesmo tempo.
    """
    with lock_for(path):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return default


def _replace_retry(tmp, path, tentativas=10):
    """`os.replace` com paciência: no Windows a troca é recusada enquanto outro
    programa tiver o ficheiro aberto (o Explorador, um editor, o antivírus a
    passar). São milissegundos — vale mais esperar do que perder a gravação."""
    for n in range(tentativas):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            if n == tentativas - 1:
                raise
            time.sleep(0.05)


def write_json(path, data, backup=True):
    """Grava o JSON de forma atómica, com cópia do que lá estava (uma por dia)."""
    with lock_for(path):
        if backup:
            backup_file(path)
        # nome do temporário por processo e por fio: dois a gravar o mesmo
        # ficheiro (instância DEV e estável na mesma pasta, por exemplo) nunca
        # escrevem no mesmo temporário
        tmp = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=1)
                f.flush()
                os.fsync(f.fileno())
            _replace_retry(tmp, path)
            # a partir daqui o ficheiro novo é o que vale: as outras janelas
            # (e as outras instâncias, quando ouvirem esta) podem recarregar
            events.publish("state", file=os.path.basename(path))
        except (OSError, ValueError, TypeError):
            # a troca é que é o compromisso: falhando, o ficheiro antigo fica
            # exatamente como estava em vez de ficar cortado
            try:
                os.remove(tmp)
            except OSError:
                pass
            raise


def backup_file(path, force=False):
    """Guarda uma cópia do ficheiro em `backups\\`. Devolve o caminho ou None.

    Uma por dia e por ficheiro: a gravação de estado acontece a cada clique e
    não vale a pena uma cópia de cada vez. Com `force` (o botão nas Definições)
    guarda mesmo que já haja a do dia, com um sufixo.
    """
    if not os.path.isfile(path):
        return None
    stem = os.path.splitext(os.path.basename(path))[0]
    # a pasta das cópias é vizinha do ficheiro, não a da app: os testes
    # redirecionam os ficheiros de estado para uma pasta temporária, e uma cópia
    # de teste a aterrar na pasta a sério ficava lá a poder ser reposta
    pasta = os.path.join(os.path.dirname(os.path.abspath(path)), "backups")
    agora = datetime.now()
    dia = agora.strftime("%Y%m%d")
    destino = os.path.join(pasta, f"{stem}.{dia}-{agora:%H}.json")
    try:
        os.makedirs(pasta, exist_ok=True)
        if os.path.exists(destino):
            if not force:
                return None
            # "Guardar agora" e o antes-de-repor: desce ao minuto, e ao segundo
            # se for preciso, para nunca escrever por cima de outra cópia
            destino = ""
            for sufixo in (f"{agora:%H%M}", f"{agora:%H%M%S}"):
                tenta = os.path.join(pasta, f"{stem}.{dia}-{sufixo}.json")
                if not os.path.exists(tenta):
                    destino = tenta
                    break
            if not destino:
                n = 2
                while os.path.exists(os.path.join(
                        pasta, f"{stem}.{dia}-{agora:%H%M%S}{n}.json")):
                    n += 1
                destino = os.path.join(pasta, f"{stem}.{dia}-{agora:%H%M%S}{n}.json")
        shutil.copy2(path, destino)
    except OSError:
        return None   # sem espaço ou sem escrita: a gravação em si não se perde
    _prune(pasta, stem)
    return destino


def _prune(pasta, stem):
    """Arruma as cópias deste ficheiro: todas as horas dos dias recentes, uma
    por dia nos antigos, e no fim nunca mais de `BACKUP_KEEP`.

    A ordem alfabética dos nomes é a ordem do tempo (o dia vem primeiro e as
    horas vêm com zeros à frente), por isso a primeira de cada dia é a mais
    antiga desse dia — a que interessa guardar, porque é o retrato de antes do
    trabalho daquele dia.
    """
    try:
        nomes = sorted(n for n in os.listdir(pasta)
                       if n.startswith(stem + ".") and _BACKUP_RE.match(n))
    except OSError:
        return
    por_dia = {}
    for nome in nomes:
        por_dia.setdefault(_BACKUP_RE.match(nome).group("day"), []).append(nome)
    finos = set(sorted(por_dia)[-BACKUP_DIAS_FINOS:])   # os dias recentes
    fica, sai = [], []
    for dia in sorted(por_dia):
        if dia in finos:
            fica.extend(por_dia[dia])
        else:
            fica.append(por_dia[dia][0])
            sai.extend(por_dia[dia][1:])
    if len(fica) > BACKUP_KEEP:
        sai.extend(fica[:len(fica) - BACKUP_KEEP])
    for nome in sai:
        try:
            os.remove(os.path.join(pasta, nome))
        except OSError:
            pass


def backup_now():
    """Cópia de todo o estado, agora. Devolve os ficheiros guardados."""
    feitos = []
    for nome in STATE_FILES:
        caminho = os.path.join(HERE, nome)
        with lock_for(caminho):
            destino = backup_file(caminho, force=True)
        if destino:
            feitos.append(os.path.basename(destino))
    return feitos


def _parsed(nome):
    """('todo.json', '2026-08-19') a partir de 'todo.20260819.json'."""
    m = _BACKUP_RE.match(nome)
    if not m:
        return None, ""
    dia = m.group("day")
    return f"{m.group('stem')}.json", f"{dia[:4]}-{dia[4:6]}-{dia[6:]}"


def list_backups():
    """As cópias existentes, da mais recente para a mais antiga."""
    try:
        nomes = os.listdir(BACKUP_DIR)
    except OSError:
        return []
    out = []
    for nome in nomes:
        alvo, dia = _parsed(nome)
        if not alvo:
            continue
        caminho = os.path.join(BACKUP_DIR, nome)
        try:
            st = os.stat(caminho)
        except OSError:
            continue
        out.append({
            "file": nome, "target": alvo, "day": dia, "size": st.st_size,
            "saved": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M"),
        })
    out.sort(key=lambda b: (b["saved"], b["file"]), reverse=True)
    return out


def restore_backup(nome):
    """Repõe uma cópia sobre o ficheiro de estado. Devolve o que foi reposto.

    O que estava em vigor não se perde: vai para `backups\\` com `force` antes
    da troca, para um restauro pedido por engano se poder desfazer.
    """
    nome = os.path.basename(str(nome or ""))
    alvo, _dia = _parsed(nome)
    if not alvo or alvo not in STATE_FILES:
        raise ValueError("cópia desconhecida")
    origem = os.path.join(BACKUP_DIR, nome)
    if not os.path.isfile(origem):
        raise ValueError("cópia já não existe")
    dados = read_json(origem)
    if dados is None:
        raise ValueError("cópia ilegível")
    destino = os.path.join(HERE, alvo)
    with lock_for(destino):
        backup_file(destino, force=True)
        shutil.copy2(origem, destino)
    # repor não passa pelo write_json (é uma cópia de ficheiro), por isso o aviso
    # sai daqui — é o que poupa o F5 à mão depois de um restauro
    events.publish("state", file=alvo, restored=True)
    return {"file": nome, "target": alvo}
