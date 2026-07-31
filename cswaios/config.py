# -*- coding: utf-8 -*-
"""Configuração e constantes globais da app.

Valores mutáveis em execução (FORCED_FILE, SERVER_PORT, DEV_MODE) devem ser
lidos sempre como `config.X` — nunca importados por valor.
"""

import os
import socket
import sys

# raiz do projeto (o pacote bsp/ vive dentro dela)
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# a consola do Windows é cp1252: sem isto, imprimir um caractere fora dessa
# tabela (ex.: uma seta no changelog) rebenta a app a meio da auto-atualização
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="replace")
    except (AttributeError, OSError):
        pass

APP_VERSION = 90  # incrementado a cada release publicada na pasta partilhada

DEFAULT_SHEET = "PRJ_CFG1_reworks_julho"
DEFAULT_PERSON = "Carlos Andrade"
FILE_PATTERN = "BSP-G2_Daily_Tracker*.xlsx"

# Locais onde o ficheiro é procurado (o mais recente ganha)
CANDIDATE_DIRS = [
    HERE,
    os.path.join(os.path.expanduser("~"), "Downloads"),
    os.path.join(os.path.expanduser("~"), "CRITICAL SOFTWARE, S.A", "WRSHALLOWFORD - Documents"),
    os.path.join(os.path.expanduser("~"), "OneDrive - CRITICAL SOFTWARE, S.A"),
]

FORCED_FILE = None  # definido por --file / BSP_TRACKER_FILE
SERVER_PORT = 8765  # atualizado no main()
DEV_MODE = False    # --dev: instância de desenvolvimento (sem auto-atualização)


def lan_ip():
    """IP desta máquina na rede local (None se não determinável)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))  # não envia tráfego nenhum
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return None


STATUS_ORDER = ["Not ready to start", "Ready to start", "In progress", "In rework",
                "Ready for rework", "Ready for review", "Done by us (Informal Review)",
                "Done", "N/A"]


# vocabulário de último recurso, quando a aba "Admin" não estiver acessível
BASE_STATUSES = ["Not ready to start", "Ready to start", "In progress", "In rework",
                 "Ready for rework", "Ready for review", "Done by us (Informal Review)",
                 "N/A"]


# Link de download direto do tracker no SharePoint. Abri-lo no browser (com a
# sessão Microsoft do utilizador) descarrega o ficheiro para a pasta Downloads,
# onde a app o encontra automaticamente.
DOWNLOAD_URL = ("https://criticalsoftwaresa.sharepoint.com/sites/WRSHALLOWFORD/"
                "_layouts/15/download.aspx?UniqueId=107B4AEF-D629-4094-92D1-3F681C4B12EF")


RELEASES_DIRNAME = "BSP-G2-Tracker-App"

# Link de partilha da pasta de releases. Quem ainda não tiver o atalho no seu
# OneDrive abre este link e escolhe "Adicionar atalho ao OneDrive" — a partir
# daí a app atualiza-se sozinha.
SHARE_URL = ("https://criticalsoftwaresa-my.sharepoint.com/:f:/g/personal/"
             "cm-andrade_criticalsoftware_com/IgCcVCwvzrAHSpBAGR-J3JRqATJDp1V62WRx7ddKad0tCzM?e=I4g1ot")

# Pasta partilhada onde aterra o feedback. Ao contrário da pasta de releases
# (só de leitura para quem a recebe), este link dá escrita a qualquer pessoa da
# Critical Software, por isso o feedback é entregue por aqui, via Microsoft
# Graph, sem precisar de atalho no OneDrive de cada um.
FEEDBACK_SHARE_URL = ("https://criticalsoftwaresa-my.sharepoint.com/:f:/g/personal/"
                      "cm-andrade_criticalsoftware_com/"
                      "IgDUjvQ1-ogfRKJ3RnCYSO-hAeyfl9BmznjVN-Lpx-BuZAI?e=Wu7ibn")
