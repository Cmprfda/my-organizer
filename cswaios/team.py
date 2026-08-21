# -*- coding: utf-8 -*-
"""As esperas da equipa, pela pasta partilhada.

O "à espera de alguém" (ver store.py) é uma marca NOSSA sobre uma linha da
folha: quem a está a segurar e até quando é razoável esperar. Só que ela vivia
no `waiting.json` de cada instalação — o botão **À espera** de cada pessoa era a
lista dela e mais nada. Numa equipa em que quatro pessoas trabalham a mesma
folha, isso é metade do que interessa: o que se quer saber é também que um
colega já está a cobrar aquela linha, para não se ir cobrar outra vez.

Aqui cada instalação publica as SUAS esperas na pasta partilhada — a mesma por
onde já chegam as atualizações, o changelog, o aviso do dono e o feedback — num
ficheiro seu (`team\\waiting-<pessoa>.json`). Um ficheiro por pessoa e não um
comum: duas instalações a gravar ao mesmo tempo nunca se pisam, e apagar o meu
não mexe no de ninguém.

Duas decisões de propósito:

- **Publicar é opt-in** (Definições → *Equipa*), como os avisos para fora. Sem o
  interruptor ligado nada sai desta máquina. Ler é sempre: quem não publica
  continua a ver as esperas de quem publica.
- **A chave é `aba||função||to do`**, sem o livro. O caminho do ficheiro é
  diferente em cada máquina (`C:\\Users\\...` de cada um) e o mesmo livro no
  OneDrive tem o mesmo id — sem o livro na chave, a linha é reconhecida por
  todos. É a mesma chave antiga que os overrides ainda aceitam (_legacy_key).
"""

import os
import re
import time
from datetime import datetime, timedelta

from .config import HERE
from .statefile import read_json, write_json
from .text import normalize

TEAM_CONFIG_FILE = os.path.join(HERE, "team_config.json")
TEAM_SUBDIR = "team"

# esperas publicadas há mais de isto deixam de contar: uma instalação que não é
# aberta há três semanas não pode continuar a dizer que alguém está a cobrar
TEAM_TTL_DAYS = 21

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def load_team_config():
    """{'share_waiting': bool} — nada sai desta máquina por omissão."""
    data = read_json(TEAM_CONFIG_FILE, {})
    if not isinstance(data, dict):
        data = {}
    return {"share_waiting": bool(data.get("share_waiting"))}


def save_team_config(share_waiting):
    cfg = {"share_waiting": bool(share_waiting)}
    write_json(TEAM_CONFIG_FILE, cfg, backup=False)
    return cfg


def team_dir(create=False):
    """A pasta das esperas na partilha, ou None se ela não estiver aqui."""
    # importado aqui, como no store.py: o updates.py é o dono da procura da
    # pasta e importa este lado de volta pela via do servidor
    from .updates import find_releases_dir
    try:
        pasta = find_releases_dir()
    except OSError:
        return None
    if not pasta:
        return None
    destino = os.path.join(pasta, TEAM_SUBDIR)
    if create:
        try:
            os.makedirs(destino, exist_ok=True)
        except OSError:
            return None
    return destino


def _slug(person):
    """Nome de ficheiro a partir do nome da pessoa (sem acentos nem espaços)."""
    base = _SLUG_RE.sub("-", normalize(person)).strip("-")
    return base[:60] or "sem-nome"


def _shared_key(key):
    """A chave partilhada (aba||função||to do) a partir da chave local."""
    partes = str(key).split("||")
    if len(partes) >= 4:
        return "||".join(partes[1:])
    return "||".join(partes)


def publish_waiting(person, waiting):
    """Publica as minhas esperas na partilha. Devolve o caminho, ou None.

    Só com o interruptor ligado e só se a pasta estiver ao alcance e aceitar
    escrita — quem tem a partilha só de leitura continua a usar a app como
    sempre, sem erro nenhum.
    """
    person = str(person or "").strip()[:80]
    if not person or not load_team_config()["share_waiting"]:
        return None
    pasta = team_dir(create=True)
    if not pasta:
        return None
    limpo = {}
    for key, entrada in (waiting or {}).items():
        if not isinstance(entrada, dict) or not entrada.get("who"):
            continue
        publicada = {
            "who": str(entrada.get("who") or "")[:80],
            "since": str(entrada.get("since") or "")[:10],
            "until": str(entrada.get("until") or "")[:10],
        }
        # do bloqueio vai só o NOME dele: o `ref` de um item da lista Por fazer
        # (ou de uma CCR) é um id desta instalação e não quer dizer nada no
        # computador de outra pessoa — saltar para lá daria a nada
        bloqueio = entrada.get("blocker")
        if isinstance(bloqueio, dict) and bloqueio.get("label"):
            publicada["blocker"] = {"kind": str(bloqueio.get("kind") or "")[:10],
                                    "label": str(bloqueio.get("label") or "")[:200]}
        limpo[_shared_key(key)] = publicada
    destino = os.path.join(pasta, f"waiting-{_slug(person)}.json")
    try:
        write_json(destino, {"person": person,
                             "updated": datetime.now().strftime("%Y-%m-%d %H:%M"),
                             "waiting": limpo}, backup=False)
    except OSError:
        return None    # partilha só de leitura: não é um erro da app
    return destino


def unpublish_waiting(person):
    """Apaga o meu ficheiro da partilha (o interruptor foi desligado)."""
    pasta = team_dir()
    if not pasta:
        return False
    try:
        os.remove(os.path.join(pasta, f"waiting-{_slug(str(person or ''))}.json"))
        return True
    except OSError:
        return False


# ---------------------------------------------------------------------------
# Conjuntos de filtros da equipa
#
# Os filtros personalizados (os botões que cada um monta sobre as colunas reais
# da folha) vivem no localStorage do browser de cada pessoa. Passavam-se por
# copiar/colar num chat — o que dá para uma vez, não para uma equipa: quem entra
# no projeto tem de pedir a alguém que lhe passe "os do costume".
#
# Aqui um conjunto pode ser PUBLICADO na mesma pasta partilhada das esperas, com
# nome, e quem quiser vai buscá-lo. Publicar é um clique explícito (não há nada
# a sair daqui sozinho, ao contrário das esperas, que têm um interruptor), e
# importar continua a passar pela mesma caixa de colar de sempre: quem recebe vê
# o que está a receber antes de aceitar.

# um conjunto de filtros não fica velho como uma espera: são as regras da folha,
# e essas duram meses
FILTERS_TTL_DAYS = 180
MAX_SETS = 12                  # conjuntos publicados por pessoa
MAX_SET_CHARS = 200_000        # um conjunto não é um ficheiro de dados


def _clean_set(bruto):
    """Um conjunto publicável: {name, sheet, filters, lists}. None se não presta."""
    if not isinstance(bruto, dict):
        return None
    nome = str(bruto.get("name") or "").strip()[:80]
    filtros = bruto.get("filters")
    if not nome or not isinstance(filtros, list) or not filtros:
        return None
    limpo = {
        "name": nome,
        "sheet": str(bruto.get("sheet") or "").strip()[:120],
        "filters": filtros,
        "lists": bruto.get("lists") if isinstance(bruto.get("lists"), list) else [],
    }
    import json as _json
    if len(_json.dumps(limpo, ensure_ascii=False)) > MAX_SET_CHARS:
        return None
    return limpo


def publish_filters(person, sets):
    """Publica os conjuntos desta pessoa. Devolve quantos ficaram, ou None.

    Substitui o que ela tinha publicado: o ficheiro é dela, e o que ela mandar
    agora é o que passa a valer.
    """
    person = str(person or "").strip()[:80]
    if not person:
        return None
    pasta = team_dir(create=True)
    if not pasta:
        return None
    limpos = [c for c in (_clean_set(s) for s in (sets or [])) if c][:MAX_SETS]
    destino = os.path.join(pasta, f"filters-{_slug(person)}.json")
    if not limpos:
        try:
            os.remove(destino)
        except OSError:
            pass
        return 0
    try:
        write_json(destino, {"person": person,
                             "updated": datetime.now().strftime("%Y-%m-%d %H:%M"),
                             "sets": limpos}, backup=False)
    except OSError:
        return None      # partilha só de leitura: não é um erro da app
    return len(limpos)


def load_team_filters(exclude_person=""):
    """Os conjuntos publicados, um por entrada: {person, updated, name, sheet,
    filters, lists}. Os meus ficam de fora quando `exclude_person` é dado."""
    pasta = team_dir()
    if not pasta:
        return []
    try:
        nomes = sorted(n for n in os.listdir(pasta)
                       if n.startswith("filters-") and n.endswith(".json"))
    except OSError:
        return []
    fora = normalize(exclude_person)
    corte = (datetime.now() - timedelta(days=FILTERS_TTL_DAYS)).strftime("%Y-%m-%d")
    out = []
    for nome in nomes:
        data = read_json(os.path.join(pasta, nome))
        if not isinstance(data, dict):
            continue
        quem = str(data.get("person") or "").strip()
        atualizado = str(data.get("updated") or "")
        if not quem or atualizado[:10] < corte:
            continue
        if fora and normalize(quem) == fora:
            continue
        for bruto in (data.get("sets") or [])[:MAX_SETS]:
            limpo = _clean_set(bruto)
            if limpo:
                out.append({"person": quem, "updated": atualizado, **limpo})
    out.sort(key=lambda s: (s["person"], s["name"]))
    return out


# As esperas dos colegas, guardadas por pouco tempo e pela marca da pasta. Quem
# chama isto é a leitura da folha, a cada pedido de cada janela aberta.
_TEAM_WAITING_TTL = 30.0
_team_waiting_cache = {}   # (pasta, pessoa de fora) -> (marca, momento, resultado)


def forget_team_waiting():
    """Esquece as esperas guardadas (linha de comandos e testes)."""
    _team_waiting_cache.clear()


def load_team_waiting(exclude_person=""):
    """As esperas dos OUTROS, por chave partilhada.

    {'aba||função||to do': {'who', 'since', 'until', 'by'}} — `by` é quem a
    marcou. Com duas pessoas a esperar a mesma linha fica a marca do ficheiro
    gravado mais recentemente, que é a informação mais fresca sobre a linha.
    """
    pasta = team_dir()
    if not pasta:
        return {}
    fora = normalize(exclude_person)
    # isto é pedido a cada leitura da folha, e cada pedido é uma listagem da
    # pasta partilhada mais a leitura de um ficheiro por colega. A marca da
    # pasta muda sempre que alguém publica (o write_json troca o ficheiro por
    # os.replace, dentro dela), por isso guardar pelo par (marca, prazo) nunca
    # esconde uma espera nova por mais do que o prazo.
    try:
        marca = os.stat(pasta).st_mtime_ns
    except OSError:
        return {}
    guardado = _team_waiting_cache.get((pasta, fora))
    if guardado and guardado[0] == marca and time.time() - guardado[1] < _TEAM_WAITING_TTL:
        return guardado[2]
    try:
        nomes = sorted(n for n in os.listdir(pasta)
                       if n.startswith("waiting-") and n.endswith(".json"))
    except OSError:
        return {}
    corte = (datetime.now() - timedelta(days=TEAM_TTL_DAYS)).strftime("%Y-%m-%d")
    out, quando = {}, {}
    for nome in nomes:
        data = read_json(os.path.join(pasta, nome))
        if not isinstance(data, dict):
            continue
        quem = str(data.get("person") or "").strip()
        if not quem or (fora and normalize(quem) == fora):
            continue
        atualizado = str(data.get("updated") or "")
        if atualizado[:10] < corte:
            continue      # instalação parada: as esperas dela já não dizem nada
        marcas = data.get("waiting")
        if not isinstance(marcas, dict):
            continue
        for key, entrada in marcas.items():
            if not isinstance(entrada, dict) or not entrada.get("who"):
                continue
            if key in out and quando.get(key, "") >= atualizado:
                continue
            out[key] = {"who": str(entrada.get("who") or "")[:80],
                        "since": str(entrada.get("since") or "")[:10],
                        "until": str(entrada.get("until") or "")[:10],
                        "by": quem}
            bloqueio = entrada.get("blocker")
            if isinstance(bloqueio, dict) and bloqueio.get("label"):
                out[key]["blocker"] = {
                    "kind": str(bloqueio.get("kind") or "")[:10],
                    "label": str(bloqueio.get("label") or "")[:200]}
            quando[key] = atualizado
    _team_waiting_cache[(pasta, fora)] = (marca, time.time(), out)
    return out


# ---------------------------------------------------------------------------
# Recados numa linha, bola passada e o kit de chegada
#
# As esperas dizem a QUEM se cobra e os anúncios falam para todos. O que não
# havia era uma mensagem DIRIGIDA a uma pessoa sobre UMA linha — "este TC falha
# no ramo do componente, vê o log X" — e, sobretudo, maneira de saber que ela
# chegou. Sem servidor, o aviso de leitura é só outro ficheiro: quem lê escreve
# no seu, quem mandou lê o dos outros.
#
# Três coisas viajam aqui, todas pelo mesmo caminho das esperas e dos filtros:
#   - recados:  `team\messages-<pessoa>.json`  (de quem manda)
#   - bola:     `team\handoff-<pessoa>.json`   (de quem passa)
#   - recibos:  `team\ack-<pessoa>.json`       (de quem recebe: leu / aceitou)
#   - cápsula:  `team\capsule-<pessoa>.json`   (o kit de chegada)
#
# O que NÃO viaja, de propósito: o texto que está a ser escrito, a lista Por
# fazer, as notas, e os tempos de resposta de cada pessoa (o "livro de dívidas"
# fica na máquina — publicá-lo fazia dele um quadro de honra ao contrário).

# um recado é sobre trabalho de agora; passado um mês já não é um recado
MESSAGES_TTL_DAYS = 30
MAX_MESSAGES = 60              # recados guardados por pessoa
MAX_MESSAGE_CHARS = 600
# a bola passada dura o que dura uma revisão
HANDOFF_TTL_DAYS = 30
MAX_HANDOFFS = 60
# a cápsula são as regras da folha e as preferências de quem chega: dura
CAPSULE_TTL_DAYS = 365
MAX_CAPSULE_CHARS = 300_000


def _team_files(prefixo):
    """Os ficheiros da partilha com aquele prefixo, por ordem de nome."""
    pasta = team_dir()
    if not pasta:
        return []
    try:
        return [os.path.join(pasta, n) for n in sorted(os.listdir(pasta))
                if n.startswith(prefixo) and n.endswith(".json")]
    except OSError:
        return []


def _team_write(nome, payload):
    """Grava um ficheiro na partilha. False quando ela não aceita escrita."""
    pasta = team_dir(create=True)
    if not pasta:
        return False
    try:
        write_json(os.path.join(pasta, nome), payload, backup=False)
    except OSError:
        return False      # partilha só de leitura: não é um erro da app
    return True


def _fresh(atualizado, dias):
    """A publicação ainda conta? (uma instalação parada deixa de falar)"""
    corte = (datetime.now() - timedelta(days=dias)).strftime("%Y-%m-%d")
    return str(atualizado or "")[:10] >= corte


def _now_min():
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def normalize_message(bruto):
    """Um recado publicável: {id, key, to, text, at}. None se não presta."""
    if not isinstance(bruto, dict):
        return None
    texto = str(bruto.get("text") or "").strip()[:MAX_MESSAGE_CHARS]
    key = str(bruto.get("key") or "").strip()[:400]
    para = str(bruto.get("to") or "").strip()[:80]
    ident = str(bruto.get("id") or "").strip()[:60]
    if not texto or not key or not ident:
        return None
    return {"id": ident, "key": _shared_key(key), "to": para, "text": texto,
            "at": str(bruto.get("at") or "")[:16] or _now_min(),
            # o nome da linha viaja para o recado se poder mostrar de que linha
            # fala mesmo na máquina de quem ainda não abriu aquele livro
            "label": str(bruto.get("label") or "")[:200]}


def publish_messages(person, messages):
    """Publica os recados desta pessoa (substitui o que ela tinha)."""
    person = str(person or "").strip()[:80]
    if not person:
        return None
    limpos = [m for m in (normalize_message(x) for x in (messages or [])) if m]
    limpos = limpos[-MAX_MESSAGES:]
    nome = f"messages-{_slug(person)}.json"
    if not limpos:
        pasta = team_dir()
        if pasta:
            try:
                os.remove(os.path.join(pasta, nome))
            except OSError:
                pass
        return 0
    ok = _team_write(nome, {"person": person, "updated": _now_min(),
                           "messages": limpos})
    return len(limpos) if ok else None


def load_team_messages(person=""):
    """Os recados que os outros deixaram, com o recibo de leitura já cruzado.

    Devolve uma lista de {id, key, text, at, from, to, label, seen}. Sem `person`
    vêm todos; com `person` vêm os que lhe são dirigidos (e os sem destinatário,
    que são para quem passar pela linha).
    """
    quem_sou = normalize(person)
    recibos = load_team_acks()
    out = []
    for caminho in _team_files("messages-"):
        data = read_json(caminho)
        if not isinstance(data, dict) or not _fresh(data.get("updated"),
                                                    MESSAGES_TTL_DAYS):
            continue
        autor = str(data.get("person") or "").strip()
        if not autor:
            continue
        meu = quem_sou and normalize(autor) == quem_sou
        for bruto in (data.get("messages") or [])[-MAX_MESSAGES:]:
            m = normalize_message(bruto)
            if not m:
                continue
            para = normalize(m["to"])
            # os meus vêm sempre (para eu ver se já foram lidos); os dos outros
            # só quando são para mim ou para quem passar pela linha
            if not meu and quem_sou and para and para != quem_sou:
                continue
            out.append({**m, "from": autor, "mine": bool(meu),
                        "seen": recibos.get(m["id"]) or []})
    out.sort(key=lambda m: m["at"], reverse=True)
    return out


def normalize_handoff(bruto):
    """Uma bola passada: {key, to, col, value, at, label}. None se não presta."""
    if not isinstance(bruto, dict):
        return None
    key = str(bruto.get("key") or "").strip()[:400]
    para = str(bruto.get("to") or "").strip()[:80]
    if not key or not para:
        return None
    return {"key": _shared_key(key), "to": para,
            "col": str(bruto.get("col") or "")[:60],
            "value": str(bruto.get("value") or "")[:120],
            "at": str(bruto.get("at") or "")[:16] or _now_min(),
            "label": str(bruto.get("label") or "")[:200]}


def publish_handoffs(person, tokens):
    """Publica as bolas que esta pessoa passou (substitui as anteriores)."""
    person = str(person or "").strip()[:80]
    if not person:
        return None
    limpos = [h for h in (normalize_handoff(x) for x in (tokens or [])) if h]
    limpos = limpos[-MAX_HANDOFFS:]
    nome = f"handoff-{_slug(person)}.json"
    if not limpos:
        pasta = team_dir()
        if pasta:
            try:
                os.remove(os.path.join(pasta, nome))
            except OSError:
                pass
        return 0
    ok = _team_write(nome, {"person": person, "updated": _now_min(),
                           "tokens": limpos})
    return len(limpos) if ok else None


def load_team_handoffs(person=""):
    """As bolas passadas: as que me passaram e as que eu passei.

    Cada uma leva `taken` (quando quem a recebeu já mexeu na linha) — é o que
    distingue "ainda não deu por ela" de "já está com ela".
    """
    quem_sou = normalize(person)
    recibos = load_team_acks()
    tomadas = {}
    for ident, quem in (recibos.get("__taken__") or {}).items():
        tomadas[ident] = quem
    out = []
    for caminho in _team_files("handoff-"):
        data = read_json(caminho)
        if not isinstance(data, dict) or not _fresh(data.get("updated"),
                                                    HANDOFF_TTL_DAYS):
            continue
        autor = str(data.get("person") or "").strip()
        if not autor:
            continue
        meu = quem_sou and normalize(autor) == quem_sou
        for bruto in (data.get("tokens") or [])[-MAX_HANDOFFS:]:
            h = normalize_handoff(bruto)
            if not h:
                continue
            if not meu and quem_sou and normalize(h["to"]) != quem_sou:
                continue
            out.append({**h, "from": autor, "mine": bool(meu),
                        "taken": tomadas.get(f"{normalize(autor)}||{h['key']}") or []})
    out.sort(key=lambda h: h["at"], reverse=True)
    return out


# ---------------------------------------------------------------------------
# Recibos: quem leu o recado, quem aceitou a bola
#
# Escritos SÓ por um ato explícito — abrir o recado, ou mexer na linha que me foi
# passada. Um recibo não diz mais nada sobre a pessoa: nem quando esteve na app,
# nem o que fez lá.

def load_team_acks():
    """{id_do_recado: [{who, at}]} e, na chave `__taken__`, as bolas aceites."""
    out = {"__taken__": {}}
    for caminho in _team_files("ack-"):
        data = read_json(caminho)
        if not isinstance(data, dict):
            continue
        quem = str(data.get("person") or "").strip()
        if not quem or not _fresh(data.get("updated"), MESSAGES_TTL_DAYS):
            continue
        for ident, quando in (data.get("seen") or {}).items():
            out.setdefault(str(ident)[:60], []).append(
                {"who": quem, "at": str(quando or "")[:16]})
        for chave, quando in (data.get("taken") or {}).items():
            out["__taken__"].setdefault(str(chave)[:460], []).append(
                {"who": quem, "at": str(quando or "")[:16]})
    return out


def ack_seen(person, message_ids=(), taken_keys=()):
    """Marca recados como lidos e bolas como aceites, no MEU ficheiro."""
    person = str(person or "").strip()[:80]
    if not person:
        return False
    nome = f"ack-{_slug(person)}.json"
    pasta = team_dir()
    atual = read_json(os.path.join(pasta, nome), {}) if pasta else {}
    if not isinstance(atual, dict):
        atual = {}
    vistos = atual.get("seen") if isinstance(atual.get("seen"), dict) else {}
    aceites = atual.get("taken") if isinstance(atual.get("taken"), dict) else {}
    agora = _now_min()
    for ident in list(message_ids or [])[:MAX_MESSAGES]:
        vistos[str(ident)[:60]] = agora
    for chave in list(taken_keys or [])[:MAX_HANDOFFS]:
        aceites[str(chave)[:460]] = agora
    # não crescem para sempre: os mais antigos saem primeiro
    vistos = dict(sorted(vistos.items(), key=lambda kv: kv[1])[-MAX_MESSAGES * 2:])
    aceites = dict(sorted(aceites.items(), key=lambda kv: kv[1])[-MAX_HANDOFFS * 2:])
    return _team_write(nome, {"person": person, "updated": agora,
                             "seen": vistos, "taken": aceites})


# ---------------------------------------------------------------------------
# Kit de chegada
#
# A primeira hora de quem entra no projeto é a pior conversa que a app tem com
# alguém: filtros por montar, limites por escolher, e o "estado do projeto" a
# viver na cabeça dos outros. A pasta partilhada — que TODAS as instalações já
# encontram sozinhas (updates.find_releases_dir) — serve de canal.
#
# O que a cápsula leva: filtros personalizados, preferências de vista e uma
# página escrita pela app com o estado do projeto. O que ela NÃO leva: estado
# (lista Por fazer, notas, CCRs, histórico) — isso é trabalho de alguém, não
# uma configuração.

def _clean_capsule(bruto):
    """Uma cápsula publicável: {name, sets, prefs, brief}. None se não presta."""
    if not isinstance(bruto, dict):
        return None
    sets = [c for c in (_clean_set(s) for s in (bruto.get("sets") or [])) if c]
    prefs = bruto.get("prefs") if isinstance(bruto.get("prefs"), dict) else {}
    brief = str(bruto.get("brief") or "")[:20000]
    if not sets and not prefs and not brief:
        return None
    limpo = {"name": str(bruto.get("name") or "").strip()[:80] or "kit",
             "sets": sets[:MAX_SETS],
             # só valores simples: uma preferência é um número, um texto ou um
             # sim/não — nunca uma estrutura que ninguém sabe validar
             "prefs": {str(k)[:40]: v for k, v in prefs.items()
                       if isinstance(v, (str, int, float, bool))},
             "brief": brief}
    import json as _json
    if len(_json.dumps(limpo, ensure_ascii=False)) > MAX_CAPSULE_CHARS:
        return None
    return limpo


def publish_capsule(person, capsule):
    """Publica o kit de chegada desta pessoa. Devolve True/False/None."""
    person = str(person or "").strip()[:80]
    if not person:
        return None
    limpo = _clean_capsule(capsule)
    if not limpo:
        return None
    return _team_write(f"capsule-{_slug(person)}.json",
                       {"person": person, "updated": _now_min(),
                        "capsule": limpo}) or None


def load_capsules():
    """Os kits publicados: [{person, updated, name, sets, prefs, brief}]."""
    out = []
    for caminho in _team_files("capsule-"):
        data = read_json(caminho)
        if not isinstance(data, dict) or not _fresh(data.get("updated"),
                                                    CAPSULE_TTL_DAYS):
            continue
        quem = str(data.get("person") or "").strip()
        limpo = _clean_capsule(data.get("capsule"))
        if quem and limpo:
            out.append({"person": quem, "updated": str(data.get("updated") or ""),
                        **limpo})
    out.sort(key=lambda c: c["person"].lower())
    return out
