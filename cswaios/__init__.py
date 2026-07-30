# -*- coding: utf-8 -*-
"""My Organizer (CSW.AI.OS) — camadas da aplicação.

    config / i18n / logs / text   base transversal (constantes, mensagens, log)
    store / todos / feedback      estado local em JSON (modelo)
    excel / graph / updates       fontes de dados e distribuição
    tasks                         serviço que compõe o que a interface consome
    server                        camada HTTP (controlador + rotas)
    cli                           linha de comandos
"""

import warnings

warnings.filterwarnings("ignore", module="openpyxl")

from .config import APP_VERSION  # noqa: E402  (a seguir ao filtro de avisos)

__all__ = ["APP_VERSION"]
