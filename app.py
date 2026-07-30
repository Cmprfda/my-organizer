"""
My Organizer — visualizador web de folhas de Excel (CSW.AI.OS).

Ponto de entrada. A lógica vive no pacote `cswaios/`:

    cswaios/config.py    constantes e definições globais
    cswaios/i18n.py      mensagens do servidor (PT/EN)
    cswaios/logs.py      registo de eventos
    cswaios/text.py      normalização de texto das folhas
    cswaios/store.py     estado local (overrides, notas, CCRs)
    cswaios/todos.py     TODO list pessoal
    cswaios/feedback.py  feedback e reporte automático de erros
    cswaios/updates.py   auto-atualização a partir da pasta partilhada
    cswaios/excel.py     leitura/escrita do ficheiro Excel
    cswaios/graph.py     leitura/escrita de livros no OneDrive (Microsoft Graph)
    cswaios/tasks.py     serviço de dados que alimenta a interface
    cswaios/server.py    servidor HTTP (rotas)
    cswaios/cli.py       comandos de linha de comandos

Uso:
    python app.py                      # procura o ficheiro automaticamente
    python app.py --file caminho.xlsx  # usa um ficheiro específico
    python app.py --port 8765

Comandos (executam uma ação e saem, sem arrancar o servidor):
    python app.py help                 # lista todos os comandos
    python app.py update               # instala a versão nova da pasta partilhada
    python app.py status               # servidor, ficheiros, OneDrive, pendentes
    python app.py push                 # envia as alterações de estado pendentes
"""

import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))

# a consola do Windows é cp1252: sem isto, imprimir um caractere fora dessa
# tabela (ex.: uma seta no changelog) rebenta a app a meio da auto-atualização
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="replace")
    except (AttributeError, OSError):
        pass


def _install_payload():
    """Instala as pastas `cswaios/` e `static/` a partir de `app_payload.zip`.

    As versões antigas da app só sabiam copiar ficheiros soltos ao
    auto-atualizar; o payload garante que essas instalações também recebem o
    código novo, que passou a viver em pastas."""
    payload = next((os.path.join(HERE, n) for n in ("app_payload.zip", "bsp_payload.zip")
                    if os.path.isfile(os.path.join(HERE, n))), None)
    if not payload:
        return
    marker = os.path.join(HERE, "cswaios", "__init__.py")
    try:
        if os.path.isfile(marker) and \
                os.path.getmtime(marker) >= os.path.getmtime(payload):
            return  # já instalado
        with zipfile.ZipFile(payload) as z:
            for name in z.namelist():
                # só as pastas de código, e nunca caminhos a sair da pasta
                if name.startswith(("cswaios/", "static/")) and ".." not in name:
                    z.extract(name, HERE)
        os.utime(marker, None)   # marca como instalado (mais recente que o zip)
        print("Ficheiros de codigo atualizados a partir de " + os.path.basename(payload) + ".")
    except (OSError, zipfile.BadZipFile) as exc:
        print(f"Aviso: nao consegui instalar o payload de codigo ({exc})")


_install_payload()

from cswaios import cli, server                # noqa: E402
from cswaios.config import APP_VERSION         # noqa: E402  (lido por scripts externos)

if __name__ == "__main__":
    # `python app.py <comando>` executa a ação e sai; sem comando arranca o servidor
    HELP_ALIASES = ("--help-commands", "-?", "/?", "ajuda", "comandos")
    if len(sys.argv) > 1 and (sys.argv[1] in cli.COMMANDS or sys.argv[1] in HELP_ALIASES):
        argv = sys.argv[1:]
        if argv[0] in HELP_ALIASES:
            argv = ["help"]
        sys.exit(cli.run_command(argv))
    server.main()
