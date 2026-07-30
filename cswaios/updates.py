# -*- coding: utf-8 -*-
"""Auto-atualização a partir da pasta partilhada de releases (ou, se essa
pasta não existir na máquina, da página pública de Releases do GitHub —
a via que funciona para quem não tem a pasta OneDrive partilhada, como
amigos fora da Critical Software que instalaram a app pelo GitHub)."""

import filecmp
import glob
import json
import os
import shutil
import tempfile
import urllib.request
import zipfile

from .config import APP_VERSION, HERE, RELEASES_DIRNAME
from .logs import log_event

GITHUB_REPO = "Cmprfda/my-organizer"
GITHUB_API_LATEST = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
GITHUB_TIMEOUT = 10
_USER_AGENT = "my-organizer-app"


def find_releases_dir():
    """Pasta partilhada com as releases: no OneDrive do dono ou no atalho
    OneDrive de quem recebeu a partilha. Os atalhos podem ganhar um prefixo
    (ex.: "Carlos Manuel Andrade's files - BSP-G2-Tracker-App"), por isso a
    procura aceita qualquer nome que termine no nome da pasta."""
    home = os.path.expanduser("~")
    roots = glob.glob(os.path.join(home, "OneDrive*")) + \
        [os.path.join(home, "CRITICAL SOFTWARE, S.A")]
    candidates = []
    for base in roots:
        for pattern in (f"*{RELEASES_DIRNAME}", os.path.join("*", f"*{RELEASES_DIRNAME}")):
            candidates += glob.glob(os.path.join(base, pattern))
    for c in candidates:
        if os.path.isfile(os.path.join(c, "latest.json")):
            return c
    return candidates[0] if candidates else None


def github_latest():
    """Última release publicada no GitHub (repositório público, sem precisar
    de autenticação). Devolve (versão, url do zip, notas) ou (None, None, "")
    se não conseguir (sem rede, repositório em baixo, etc.)."""
    try:
        req = urllib.request.Request(GITHUB_API_LATEST, headers={
            "Accept": "application/vnd.github+json", "User-Agent": _USER_AGENT})
        with urllib.request.urlopen(req, timeout=GITHUB_TIMEOUT) as resp:
            data = json.load(resp)
    except (OSError, ValueError):
        return None, None, ""
    try:
        version = int(str(data.get("tag_name") or "").lstrip("vV"))
    except ValueError:
        return None, None, ""
    asset = next((a for a in data.get("assets") or []
                  if str(a.get("name", "")).endswith(".zip")), None)
    if not asset:
        return None, None, ""
    return version, asset.get("browser_download_url"), str(data.get("body") or "")


def _apply_zip(zip_path, new_version):
    """Extrai o zip de uma release (pasta partilhada ou GitHub) por cima da
    instalação atual."""
    with tempfile.TemporaryDirectory() as td:
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(td)
        src = os.path.join(td, "bsp-tracker")
        if not os.path.isdir(src):
            src = td
        for name in os.listdir(src):
            full = os.path.join(src, name)
            dest = os.path.join(HERE, name)
            if os.path.isdir(full):
                # pastas de código (cswaios/, static/): substituídas por inteiro
                shutil.copytree(full, dest, dirs_exist_ok=True)
                continue
            if not os.path.isfile(full):
                continue
            # o run.bat pode estar em execução (foi ele que lançou a app) —
            # reescrevê-lo em execução corrompe o cmd. Fica como .new e o
            # próprio run.bat aplica a troca no próximo arranque.
            if name.lower() == "run.bat":
                try:
                    if os.path.isfile(dest) and filecmp.cmp(full, dest, shallow=False):
                        continue  # não mudou — nada a fazer
                except OSError:
                    pass
                dest += ".new"
            shutil.copy2(full, dest)
    log_event(f"app atualizada v{APP_VERSION} -> v{new_version} a partir de {zip_path}")


def _print_news(lines):
    """Mostra (e regista) as novidades da atualização, se houver alguma."""
    lines = [line for line in lines if line]
    if not lines:
        return
    print()
    print("Novidades desta atualizacao:")
    for n in lines:
        print("  - " + n)
    print()
    for n in lines:
        log_event(f"novidade {n}")


def _check_update_local(rel):
    """Tenta atualizar a partir da pasta partilhada do OneDrive. Devolve True
    se atualizou, False se não havia nada mais recente (ou o zip falta)."""
    # utf-8-sig: tolera o BOM que editores/PowerShell costumam acrescentar
    with open(os.path.join(rel, "latest.json"), encoding="utf-8-sig") as f:
        latest = json.load(f)
    new_version = int(latest.get("version", 0))
    if new_version <= APP_VERSION:
        return False
    zip_path = os.path.join(rel, latest.get("file", ""))
    if not os.path.isfile(zip_path):
        return False

    print(f"Versão nova encontrada: v{new_version} (local: v{APP_VERSION}). A atualizar...")
    _apply_zip(zip_path, new_version)

    try:
        with open(os.path.join(rel, "changelog.json"), encoding="utf-8-sig") as f:
            changelog = json.load(f)
    except (OSError, ValueError):
        changelog = {}
    _print_news(f"v{v}: {line}" for v in range(APP_VERSION + 1, new_version + 1)
                for line in changelog.get(str(v), []))
    return True


def _check_update_github():
    """Tenta atualizar a partir da página pública de Releases do GitHub —
    funciona mesmo sem a pasta OneDrive partilhada (instalações fora da
    Critical Software). Devolve True se atualizou, False se não havia nada
    mais recente (ou não foi possível chegar ao GitHub)."""
    new_version, asset_url, body = github_latest()
    if not new_version or new_version <= APP_VERSION or not asset_url:
        return False

    print(f"Versão nova encontrada no GitHub: v{new_version} (local: v{APP_VERSION}). A descarregar...")
    with tempfile.TemporaryDirectory() as td:
        zip_path = os.path.join(td, "release.zip")
        req = urllib.request.Request(asset_url, headers={"User-Agent": _USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as resp, open(zip_path, "wb") as f:
            shutil.copyfileobj(resp, f)
        _apply_zip(zip_path, new_version)

    # o corpo da release do GitHub já vem com "- " no início de cada linha
    # (ver make_release.py); _print_news acrescenta o seu próprio traço
    _print_news(line.strip().lstrip("-").strip() for line in body.splitlines())
    return True


def check_update():
    """Se houver uma versão mais recente — na pasta partilhada do OneDrive
    ou, quando essa pasta não existe nesta máquina (ou a leitura falha), na
    página pública de Releases do GitHub —, substitui os ficheiros locais.
    Devolve True se atualizou (é preciso reiniciar)."""
    rel = find_releases_dir()
    if rel:
        try:
            return _check_update_local(rel)
        except (OSError, ValueError, zipfile.BadZipFile) as exc:
            log_event(f"atualizacao pela pasta partilhada falhou ({exc}) - a tentar o GitHub")
    try:
        return _check_update_github()
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        log_event(f"atualizacao pelo GitHub falhou ({exc})")
        return False
