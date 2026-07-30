# -*- coding: utf-8 -*-
"""Auto-atualização a partir da pasta partilhada de releases."""

import filecmp
import glob
import json
import os
import shutil
import tempfile
import zipfile

from .config import APP_VERSION, HERE, RELEASES_DIRNAME
from .logs import log_event

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


def check_update():
    """Se a pasta de releases tiver uma versão mais recente, substitui os
    ficheiros locais. Devolve True se atualizou (é preciso reiniciar)."""
    rel = find_releases_dir()
    if not rel:
        return False
    try:
        # utf-8-sig: tolera o BOM que editores/PowerShell costumam acrescentar
        with open(os.path.join(rel, "latest.json"), encoding="utf-8-sig") as f:
            latest = json.load(f)
        new_version = int(latest.get("version", 0))
    except (OSError, ValueError):
        return False
    if new_version <= APP_VERSION:
        return False
    zip_path = os.path.join(rel, latest.get("file", ""))
    if not os.path.isfile(zip_path):
        return False

    print(f"Versão nova encontrada: v{new_version} (local: v{APP_VERSION}). A atualizar...")
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
                # pastas de código (bsp/, static/): substituídas por inteiro
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

    # mostrar o que mudou nas versões que acabámos de receber
    try:
        with open(os.path.join(rel, "changelog.json"), encoding="utf-8-sig") as f:
            changelog = json.load(f)
    except (OSError, ValueError):
        changelog = {}
    news = [f"v{v}: {line}"
            for v in range(APP_VERSION + 1, new_version + 1)
            for line in changelog.get(str(v), [])]
    if news:
        print()
        print("Novidades desta atualizacao:")
        for n in news:
            print("  - " + n)
        print()
        for n in news:
            log_event(f"novidade {n}")
    return True
