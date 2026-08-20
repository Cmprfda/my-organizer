# -*- coding: utf-8 -*-
"""Contas pequenas partilhadas: medianas e distâncias entre datas.

Quase tudo o que a app passou a dizer sobre si mesma (quanto tempo uma linha
fica num estado, em quantos dias alguém devolve uma espera, quanto costuma
demorar um item que se repete) é a mesma conta feita sobre listas diferentes.
Fica aqui uma vez em vez de em cada módulo que precisa dela.

Medianas e não médias: um cronómetro esquecido a correr num fim de semana ou uma
linha que ficou parada nas férias de alguém puxam uma média para um valor que
nunca aconteceu, e é exatamente esse tipo de caso que estas listas têm.
"""

from datetime import datetime

# uma mediana feita de dois exemplos não é uma mediana: abaixo disto a conta
# existe mas quem a mostra tem de dizer com quantos casos fala
MIN_SAMPLE = 3


def mediana(valores):
    """Mediana de uma lista de números (None quando não há nenhum)."""
    ordenados = sorted(valores)
    n = len(ordenados)
    if not n:
        return None
    meio = n // 2
    if n % 2:
        return ordenados[meio]
    return (ordenados[meio - 1] + ordenados[meio]) / 2.0


def dias_entre(desde, ate):
    """Dias inteiros entre duas datas AAAA-MM-DD (None se alguma não presta).

    Aceita marcas com hora à frente ("2026-08-14 09:00"): conta-se o dia.
    """
    try:
        d1 = datetime.strptime(str(desde or "")[:10], "%Y-%m-%d")
        d2 = datetime.strptime(str(ate or "")[:10], "%Y-%m-%d")
    except ValueError:
        return None
    dias = (d2 - d1).days
    return dias if dias >= 0 else None


def horas_entre(ts1, ts2):
    """Horas (com casas decimais) entre duas marcas ISO (None se não prestam)."""
    try:
        d1 = datetime.fromisoformat(str(ts1 or "")[:26])
        d2 = datetime.fromisoformat(str(ts2 or "")[:26])
    except ValueError:
        return None
    horas = (d2 - d1).total_seconds() / 3600.0
    return horas if horas >= 0 else None
