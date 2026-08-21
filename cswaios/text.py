# -*- coding: utf-8 -*-
"""Normalização e formatação de texto vindo das folhas."""

import unicodedata
from datetime import datetime, date

def normalize(text):
    """minúsculas + sem acentos, para comparações tolerantes."""
    text = str(text)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return text.lower().strip()


def person_matcher(person):
    """O mesmo teste de nome que as colunas da folha usam (ver
    tasks.build_payload): serve a célula que contenha o nome todo, ou que seja
    igual a UM dos nomes com pelo menos 4 letras — a folha escreve "Mariana"
    num sítio e "Mariana Ribeiro" noutro.

    Atenção: sem pessoa o teste dá sempre verdade, que é o que a leitura da
    folha espera (sem pessoa escolhida não se filtra nada). Quem precisar do
    contrário tem de tratar o caso vazio antes de chamar.
    """
    person_norm = normalize(person) if person else ""
    tokens = {t for t in person_norm.split() if len(t) >= 4}

    def matches(cell):
        c = normalize(cell)
        return person_norm in c or c in tokens
    return matches


def cell_to_text(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        if value.hour == 0 and value.minute == 0 and value.second == 0:
            return value.strftime("%d/%m/%Y")
        return value.strftime("%d/%m/%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, float) and value == int(value):
        return str(int(value))
    return str(value).strip()
