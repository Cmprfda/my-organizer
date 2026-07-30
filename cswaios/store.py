# -*- coding: utf-8 -*-
"""Estado local em JSON: overrides de estado, notas e CCRs."""

import json
import os

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
