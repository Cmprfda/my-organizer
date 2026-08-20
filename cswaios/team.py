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


def load_team_waiting(exclude_person=""):
    """As esperas dos OUTROS, por chave partilhada.

    {'aba||função||to do': {'who', 'since', 'until', 'by'}} — `by` é quem a
    marcou. Com duas pessoas a esperar a mesma linha fica a marca do ficheiro
    gravado mais recentemente, que é a informação mais fresca sobre a linha.
    """
    pasta = team_dir()
    if not pasta:
        return {}
    try:
        nomes = sorted(n for n in os.listdir(pasta)
                       if n.startswith("waiting-") and n.endswith(".json"))
    except OSError:
        return {}
    fora = normalize(exclude_person)
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
    return out
