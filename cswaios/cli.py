# -*- coding: utf-8 -*-
"""Linha de comandos: `python app.py <comando>`."""

import argparse
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
import webbrowser

from . import config
from .config import APP_VERSION, HERE, SHARE_URL
from .excel import find_tracker_files
from .graph import GraphError, graph_login_start, graph_logout, graph_state
from .logs import LOG_FILE, log_event
from .store import load_overrides
from .tasks import _split_key, known_files, push_overrides
from .updates import GITHUB_REPO, _parse_version, check_update, find_releases_dir, github_latest

def _running_port(args=None):
    """Porto onde está a correr o tracker DESTA pasta, ou None. Confirmar a
    pasta evita, por exemplo, que um comando dado no projeto DEV mexa nos
    dados da instância estável."""
    ports = [getattr(args, "port", None)] if getattr(args, "port", None) else \
        ([8766, 8765] if getattr(args, "dev", False) else [8765, 8766])
    for port in ports:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/ping", timeout=2) as resp:
                info = json.load(resp)
        except (OSError, ValueError):
            continue
        if os.path.normcase(info.get("home", "")) == os.path.normcase(HERE):
            return port
    return None


def _shared_version():
    """(versão, ficheiro, fonte) publicados na pasta partilhada do OneDrive
    ou, se essa pasta não existir nesta máquina, na página pública de
    Releases do GitHub. A versão é a string publicada (ex.: "1.2.0") —
    compara-se com _parse_version, nunca como número. Devolve ("", "", "")
    se nenhuma das duas resultar (sem OneDrive e sem rede para o GitHub,
    por exemplo)."""
    rel = find_releases_dir()
    if rel:
        try:
            with open(os.path.join(rel, "latest.json"), encoding="utf-8-sig") as f:
                latest = json.load(f)
            version = str(latest.get("version", "") or "").strip()
            if version:
                return version, os.path.join(rel, latest.get("file", "")), "onedrive"
        except (OSError, ValueError):
            pass
    version, asset_url, _ = github_latest()
    if version:
        return version, asset_url, "github"
    return "", "", ""


def cmd_version(args):
    print(f"My Organizer v{APP_VERSION}")
    print(f"  pasta:    {HERE}")
    rel = find_releases_dir()
    print(f"  releases: {rel or 'nao encontrada (ver ' + SHARE_URL + ')'}")
    shared, _, source = _shared_version()
    if shared:
        print(f"  publicada: v{shared} (via {source})" +
              ("  <- ha uma versao nova (corre: app.py update)"
               if _parse_version(shared) > _parse_version(APP_VERSION) else ""))
    return 0


def cmd_update(args):
    shared, _, source = _shared_version()
    if not shared:
        print("Nao encontrei a pasta partilhada 'BSP-G2-Tracker-App' nem consegui")
        print("verificar a pagina de Releases do GitHub (falta rede?).")
        print("Pasta partilhada: abre este link e escolhe 'Adicionar atalho ao OneDrive':")
        print(f"  {SHARE_URL}")
        print(f"GitHub: https://github.com/{GITHUB_REPO}/releases/latest")
        return 1
    if args.check:
        if _parse_version(shared) > _parse_version(APP_VERSION):
            print(f"Ha uma versao nova: v{shared} (local: v{APP_VERSION}, via {source}).")
            return 0
        print(f"Ja estas na versao mais recente (v{APP_VERSION}).")
        return 0
    if not check_update():
        print(f"Ja estas na versao mais recente (v{APP_VERSION}).")
        return 0
    print("Atualizacao aplicada. Arranca a app outra vez (atalho \"My Organizer\") para a usar.")
    port = _running_port(args)
    if port:
        print(f"Nota: o tracker esta a correr em http://localhost:{port} — "
              "fecha essa janela e volta a abrir.")
    return 0


def cmd_status(args):
    print(f"Versao:     v{APP_VERSION}{' (DEV)' if args.dev else ''}")
    port = _running_port(args)
    print(f"Servidor:   {'a correr em http://localhost:' + str(port) if port else 'parado'}")
    shared, _, _ = _shared_version()
    if shared and _parse_version(shared) > _parse_version(APP_VERSION):
        print(f"Atualizacao: v{shared} disponivel (corre: app.py update)")
    state = graph_state()
    detalhe = state.get("error") or (f"ligado ({state['method']})"
                                     if state["connected"] else "pronto a ligar (corre: app.py login)")
    print(f"OneDrive:   {detalhe}")
    print(f"Livro:      {state.get('book_path') or state.get('book') or 'nenhum escolhido'}")
    files = find_tracker_files()
    print(f"Ficheiros:  {len(files)} encontrado(s) localmente")
    for f in files[:3]:
        print(f"   - {f}")
    overrides = load_overrides()
    pending = sum(len(v) for v in overrides.values() if isinstance(v, dict))
    print(f"Pendentes:  {pending} alteracao(oes) de estado por enviar" +
          (" (corre: app.py push)" if pending else ""))
    for key, entry in overrides.items():
        if not isinstance(entry, dict):
            continue
        _, _, fn, _ = _split_key(key)
        for col, o in entry.items():
            print(f"   - {fn} | {col} -> {o.get('value', '')}")
    return 0


def cmd_push(args):
    overrides = load_overrides()
    pending = sum(len(v) for v in overrides.values() if isinstance(v, dict))
    if not pending:
        print("Nao ha alteracoes locais para enviar.")
        return 0
    target = args.file
    if not target:
        # sem --file: assume-se o ficheiro mais recente conhecido, tal como
        # a app fazia antes de haver varios livros — só a CLI ainda escolhe
        # por omissão, a app em si exige sempre um livro explícito
        files = known_files()
        target = files[0] if files else None
    if not target:
        print("ERRO: nenhum ficheiro conhecido — indica um com --file")
        return 1
    port = _running_port(args)
    if port:
        # há um servidor a correr: o push tem de ser feito por ele, senão as
        # duas instâncias escrevem no mesmo ficheiro de overrides
        try:
            req = urllib.request.Request(
                f"http://127.0.0.1:{port}/api/push",
                data=json.dumps({"file": target}).encode("utf-8"),
                headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=180) as resp:
                out = json.load(resp)
        except urllib.error.HTTPError as exc:
            print(f"ERRO: {exc.read().decode('utf-8', 'replace')}")
            return 1
        except OSError as exc:
            print(f"ERRO a falar com o servidor: {exc}")
            return 1
        pushed, failed = out.get("pushed", 0), out.get("failed", [])
    else:
        try:
            _, pushed, failed = push_overrides(target)
        except Exception as exc:
            print(f"ERRO: {exc}")
            return 1
        log_event(f"cli push para o Excel: {pushed} enviada(s), {len(failed)} falhada(s)")
    print(f"Enviadas: {pushed}. Falhadas: {len(failed)}.")
    for f in failed:
        print(f"   - {f.get('fn', '?')}: {f.get('error', '')}")
    return 1 if failed else 0


def cmd_logs(args):
    try:
        with open(LOG_FILE, encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        print("Ainda nao ha registos (tracker.log).")
        return 0
    for line in lines[-args.n:]:
        print(line.rstrip())
    return 0


def cmd_open(args):
    port = _running_port(args)
    if not port:
        print("O tracker nao esta a correr. Arranca-o com o atalho \"My Organizer\".")
        return 1
    webbrowser.open(f"http://localhost:{port}")
    return 0


def cmd_stop(args):
    port = _running_port(args)
    if not port:
        print("O tracker nao esta a correr.")
        return 0
    ps = ("$c = Get-NetTCPConnection -LocalPort {0} -State Listen -ErrorAction SilentlyContinue;"
          "if ($c) {{ $p = Get-Process -Id $c[0].OwningProcess -ErrorAction SilentlyContinue;"
          "if ($p -and $p.ProcessName -like 'python*') {{ Stop-Process -Id $p.Id -Force;"
          "Write-Output 'parado' }} }}").format(port)
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                             capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError) as exc:
        print(f"ERRO a parar o tracker: {exc}")
        return 1
    if "parado" in out.stdout:
        print(f"Tracker do porto {port} parado.")
        return 0
    print(f"Nao consegui parar o processo do porto {port} (fecha a janela do tracker).")
    return 1


def cmd_login(args):
    if graph_state()["connected"]:
        print("Ja estas ligado ao OneDrive.")
        return 0
    try:
        state = graph_login_start()
    except GraphError as exc:
        print(f"ERRO: {exc}")
        return 1
    if state.get("code"):
        print(f"Abre {state['url']} e introduz o codigo: {state['code']}")
    else:
        print("Abriu-se o browser para a autenticacao. Conclui o login nessa janela.")
        webbrowser.open(state.get("url", ""))
    deadline = time.time() + 300
    while time.time() < deadline:
        time.sleep(2)
        st = graph_state()
        if st["connected"]:
            print(f"Ligado ao OneDrive ({st['method']}).")
            return 0
        if st.get("error"):
            print(f"ERRO: {st['error']}")
            return 1
    print("Tempo esgotado a espera da autenticacao.")
    return 1


def cmd_logout(args):
    graph_logout()
    print("Sessao do OneDrive terminada.")
    return 0


def cmd_fix_icon(args):
    # o Windows guarda em cache o icone associado a cada programa: se a app
    # correu antes de ter icone proprio, a barra de tarefas continua a mostrar
    # o icone generico do Python ate a cache ser limpa
    print("Vou limpar a cache de icones do Windows e reiniciar o Explorer.")
    print("Os icones e a barra de tarefas vao piscar durante um instante — e normal.")
    try:
        subprocess.run(["ie4uinit.exe", "-ClearIconCache"], timeout=15)
        subprocess.run(["taskkill", "/f", "/im", "explorer.exe"], timeout=15)
    except (OSError, subprocess.SubprocessError) as exc:
        print(f"AVISO ao limpar a cache/parar o Explorer: {exc}")
    finally:
        # reinicia o Explorer mesmo que os passos acima tenham falhado a meio —
        # se nao, o utilizador fica sem barra de tarefas nem ambiente de trabalho
        time.sleep(1)
        try:
            subprocess.Popen(["explorer.exe"])
        except (OSError, subprocess.SubprocessError) as exc:
            print(f"ERRO a reiniciar o Explorer — corre 'explorer.exe' manualmente: {exc}")
            return 1
    print("Cache de icones limpa e Explorer reiniciado.")
    print("Se o icone da app continuar errado na barra de tarefas: tira-a da barra")
    print("(clique direito > 'Remover da barra de tarefas'), fecha a app por")
    print("completo, abre-a outra vez e volta a fixa-la — um atalho fixado guarda")
    print("a sua propria referencia ao icone, independente desta cache.")
    return 0


def cmd_help(args):
    # `bsp` chama-se de uma janela NOVA: a janela do servidor esta ocupada a
    # servir a app e nao aceita comandos
    exe = "bsp" if os.path.isfile(os.path.join(HERE, "bsp.bat")) else "python app.py"
    if args.comando:
        if args.comando not in COMMANDS:
            print(f"Comando desconhecido: {args.comando}")
            print("Comandos: " + ", ".join(COMMANDS))
            return 1
        run_command([args.comando, "--help"])   # imprime a ajuda detalhada e sai
        return 0
    print(f"My Organizer v{APP_VERSION} - comandos")
    print()
    print(f"  Uso:  {exe} <comando> [opcoes]")
    print()
    for name, (_, help_text) in COMMANDS.items():
        print(f"  {name:<8}  {help_text}")
    print()
    print(f"  Detalhe de um comando:   {exe} help <comando>")
    print(f"  Exemplos:                {exe} update    |   {exe} logs -n 50")
    print()
    print("  A janela do servidor esta ocupada a servir a app e nao aceita")
    print("  comandos. Abre OUTRA janela (Terminal/PowerShell) na pasta da app")
    print("  - Shift + clique direito na pasta > 'Abrir janela do PowerShell'")
    print("  - e corre ai os comandos.")
    return 0


COMMANDS = {
    "help": (cmd_help, "mostra esta lista de comandos"),
    "update": (cmd_update, "procura e instala uma versao nova a partir da pasta partilhada"),
    "version": (cmd_version, "mostra a versao local e a publicada"),
    "status": (cmd_status, "resumo: servidor, ficheiros, OneDrive e alteracoes por enviar"),
    "push": (cmd_push, "envia para o Excel/OneDrive as alteracoes de estado pendentes"),
    "logs": (cmd_logs, "mostra as ultimas linhas do tracker.log"),
    "open": (cmd_open, "abre o tracker que esta a correr no browser"),
    "stop": (cmd_stop, "para o tracker que esta a correr"),
    "login": (cmd_login, "autentica no OneDrive/SharePoint"),
    "logout": (cmd_logout, "termina a sessao do OneDrive"),
    "fix-icon": (cmd_fix_icon, "limpa a cache de icones do Windows (se o icone da app aparecer errado)"),
}


def run_command(argv):
    """Executa `python app.py <comando> [opcoes]` e devolve o código de saída."""
    parser = argparse.ArgumentParser(
        prog="app.py", description="My Organizer — comandos",
        epilog="sem comando, arranca o servidor web (ver: app.py --help)")
    subs = parser.add_subparsers(dest="cmd", required=True)
    for name, (_, help_text) in COMMANDS.items():
        sub = subs.add_parser(name, help=help_text, description=help_text)
        sub.add_argument("--file", default=os.environ.get("BSP_TRACKER_FILE"),
                         help=argparse.SUPPRESS)
        sub.add_argument("--dev", action="store_true", help=argparse.SUPPRESS)
        sub.add_argument("--port", type=int, default=None,
                         help="porto do tracker a contactar (por omissao 8765)")
        if name == "help":
            sub.add_argument("comando", nargs="?",
                             help="comando sobre o qual queres saber mais")
        if name == "update":
            sub.add_argument("--check", action="store_true",
                             help="so verifica se ha versao nova, nao instala")
        if name == "logs":
            sub.add_argument("-n", type=int, default=30,
                             help="numero de linhas a mostrar (por omissao 30)")
    args = parser.parse_args(argv)
    config.FORCED_FILE = args.file
    config.DEV_MODE = args.dev
    return COMMANDS[args.cmd][0](args) or 0
