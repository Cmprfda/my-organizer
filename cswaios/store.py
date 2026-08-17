# -*- coding: utf-8 -*-
"""Estado local em JSON: overrides de estado, notas, CCRs e o aviso do dono."""

import hashlib
import json
import os
from datetime import datetime

from .config import HERE

# Alterações de estado feitas na app. Ficam num ficheiro local em vez de
# reescrever o .xlsx (reescrevê-lo com openpyxl destruiria validações de
# dados, gráficos e outras funcionalidades do ficheiro da equipa).
# Cada override guarda o valor da folha na altura ("base"): se entretanto a
# folha mudar, a folha ganha e o override é ignorado.
OVERRIDES_FILE = os.path.join(HERE, "status_overrides.json")


def load_overrides():
    try:
        with open(OVERRIDES_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_overrides(data):
    with open(OVERRIDES_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


# Notas de execução pessoais por tarefa (etiqueta + texto livre), partilhadas
# entre dispositivos porque vivem aqui no servidor.
NOTES_FILE = os.path.join(HERE, "notes.json")


def load_notes():
    try:
        with open(NOTES_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_notes(data):
    with open(NOTES_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


# CCRs acompanhadas na vista "CCRs": por ID, com os passos de fecho.
# Partilhadas entre dispositivos porque vivem aqui no servidor.
CCRS_FILE = os.path.join(HERE, "ccrs.json")


def load_ccrs():
    try:
        with open(CCRS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_ccrs(data):
    with open(CCRS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


# Aviso do dono da instalação: uma mensagem escrita nas Definições (só a partir
# do PC onde a app corre) que aparece a quem abrir a app. O `id` é o resumo do
# conteúdo: mudar o texto dá um id novo e o aviso volta a aparecer a toda a
# gente, sem ser preciso pedir nada a ninguém; reabrir a app com o mesmo texto
# não incomoda quem já o leu (o browser guarda o último id lido, ver
# static/js/announce.js).
#
# Onde vive: na pasta partilhada das releases, quando ela existir nesta máquina
# — a mesma por onde já chegam as atualizações e o changelog. Assim o aviso
# chega a todas as instalações da app (cada uma lê a pasta que tem no seu
# OneDrive), e não só a quem usa esta. Sem essa pasta (ou sem escrita nela) fica
# aqui ao lado do resto do estado local, e vale só para quem abre esta app.
ANNOUNCEMENT_NAME = "announcement.json"
ANNOUNCEMENT_FILE = os.path.join(HERE, ANNOUNCEMENT_NAME)

ANNOUNCEMENT_MAX = 4000

EMPTY_ANNOUNCEMENT = {"id": "", "title": "", "text": "", "updated": ""}


def _announcement_id(title, text):
    """Resumo curto do conteúdo — muda sempre que a mensagem muda."""
    base = f"{title}\n{text}".encode("utf-8")
    return hashlib.sha1(base).hexdigest()[:12]


def _shared_announcement_file():
    """O aviso na pasta partilhada (None se ela não estiver nesta máquina)."""
    # importado aqui e não no topo: o updates.py é o dono da procura da pasta e
    # importa este módulo de volta pela via do servidor
    from .updates import find_releases_dir
    try:
        pasta = find_releases_dir()
    except OSError:
        return None
    return os.path.join(pasta, ANNOUNCEMENT_NAME) if pasta else None


def _read_announcement(caminho):
    """Lê um ficheiro de aviso; devolve None se não houver nada de jeito lá."""
    try:
        with open(caminho, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    title = str(data.get("title") or "")[:200]
    text = str(data.get("text") or "")[:ANNOUNCEMENT_MAX]
    if not text.strip() and not title.strip():
        return None
    return {
        # o ficheiro pode ter sido escrito à mão: o id vale sempre o conteúdo
        "id": _announcement_id(title, text),
        "title": title, "text": text,
        "updated": str(data.get("updated") or ""),
    }


def load_announcement():
    """{'id', 'title', 'text', 'updated'} — tudo vazio quando não há aviso.

    O aviso da pasta partilhada manda: é o que o dono da app escreveu para toda
    a gente. Sem nenhum lá vale o local — o aviso de quem tem esta instalação
    para quem lhe chega pela rede local (e a cópia do que ele próprio escreveu,
    quando a pasta partilhada não estiver ao alcance)."""
    partilhado = _shared_announcement_file()
    data = _read_announcement(partilhado) if partilhado else None
    return data or _read_announcement(ANNOUNCEMENT_FILE) or dict(EMPTY_ANNOUNCEMENT)


def save_announcement(title, text):
    """Grava (ou apaga, com o texto vazio) o aviso. Devolve o que ficou."""
    title = str(title or "").strip()[:200]
    text = str(text or "").strip()[:ANNOUNCEMENT_MAX]
    destinos = [ANNOUNCEMENT_FILE]
    partilhado = _shared_announcement_file()
    if partilhado:
        destinos.append(partilhado)
    if not text and not title:
        for caminho in destinos:
            try:
                os.remove(caminho)
            except OSError:
                pass   # não existia, ou a pasta partilhada é só de leitura
        return dict(EMPTY_ANNOUNCEMENT)
    data = {"title": title, "text": text,
            "updated": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "id": _announcement_id(title, text)}
    escrito = False
    for caminho in destinos:
        try:
            with open(caminho, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=1)
            escrito = True
        except OSError:
            pass   # sem escrita na pasta partilhada: fica o que der
    if not escrito:
        raise OSError("não foi possível gravar o aviso")
    return data
