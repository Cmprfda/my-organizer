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
