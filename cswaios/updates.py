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
import time
import urllib.request
import zipfile

from .config import APP_VERSION, HERE, RELEASES_DIRNAME
from .logs import log_event

GITHUB_REPO = "Cmprfda/my-organizer"
GITHUB_API_LATEST = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
GITHUB_TIMEOUT = 10
_USER_AGENT = "my-organizer-app"


def _parse_version(version_str):
    """Converte uma versão (inteira ou semântica) para tuple comparável.

    O primeiro elemento é o marcador de esquema (0 = versão inteira antiga,
    1 = versão semântica), para que qualquer versão semântica seja sempre
    considerada mais recente que qualquer versão inteira antiga (senão
    (107,) > (1, 2, 0) e quem está na v107 nunca deteta atualizações).

    Exemplos:
    - "106" ou "v106" → (0, 106)
    - "1.0.107" ou "v1.0.107" → (1, 1, 0, 107)
    - vazio/inválido → (0, 0)
    """
    v = str(version_str or "").lstrip("vV").strip()
    if not v:
        return (0, 0)
    try:
        # Se tem pontos, é semântica (X.Y.Z)
        if "." in v:
            return (1,) + tuple(int(x) for x in v.split("."))
        # Senão, é inteira (N) — esquema antigo, ordena sempre abaixo
        return (0, int(v))
    except (ValueError, AttributeError):
        return (0, 0)


def _version_tuple(version_str_or_obj):
    """Extrai versão de string ou dict e converte para tuple."""
    if isinstance(version_str_or_obj, dict):
        version_str_or_obj = version_str_or_obj.get("version", "0")
    return _parse_version(version_str_or_obj)


# A pasta partilhada, guardada por um minuto. A procura varre raízes do
# OneDrive, e ficheiros "só na nuvem" podem pendurar cada varredura — e isto era
# pedido no caminho de cada leitura da folha (pelas esperas da equipa, pelo
# aviso, pelo feedback). O prazo é curto: uma pasta que acabe de aparecer entra
# ao minuto seguinte, muito antes de fazer diferença para quem está a usar.
_RELEASES_TTL = 60.0
_releases_cache = None   # (momento, caminho ou None)


def forget_releases_dir():
    """Esquece a pasta guardada: a procura seguinte varre outra vez."""
    global _releases_cache
    _releases_cache = None


def find_releases_dir():
    """Pasta partilhada com as releases: no OneDrive do dono ou no atalho
    OneDrive de quem recebeu a partilha. Os atalhos podem ganhar um prefixo
    (ex.: "Carlos Manuel Andrade's files - BSP-G2-Tracker-App"), por isso a
    procura aceita qualquer nome que termine no nome da pasta."""
    global _releases_cache
    agora = time.time()
    if _releases_cache and agora - _releases_cache[0] < _RELEASES_TTL:
        return _releases_cache[1]
    home = os.path.expanduser("~")
    roots = glob.glob(os.path.join(home, "OneDrive*")) + \
        [os.path.join(home, "CRITICAL SOFTWARE, S.A")]
    candidates = []
    for base in roots:
        for pattern in (f"*{RELEASES_DIRNAME}", os.path.join("*", f"*{RELEASES_DIRNAME}")):
            candidates += glob.glob(os.path.join(base, pattern))
    found = None
    for c in candidates:
        if os.path.isfile(os.path.join(c, "latest.json")):
            found = c
            break
    if found is None:
        found = candidates[0] if candidates else None
    # guarda-se também o "não encontrei": é justamente esse o caso em que a
    # procura custa mais (varre tudo e não acha nada)
    _releases_cache = (agora, found)
    return found


def github_latest():
    """Última release publicada no GitHub (repositório público, sem precisar
    de autenticação). Devolve (tag da versão, url do zip, notas) — a tag tal
    como o GitHub a publica (ex.: "v1.2.0"), em string — ou (None, None, "")
    se não conseguir (sem rede, repositório em baixo, tag que não é uma
    versão, etc.)."""
    try:
        req = urllib.request.Request(GITHUB_API_LATEST, headers={
            "Accept": "application/vnd.github+json", "User-Agent": _USER_AGENT})
        with urllib.request.urlopen(req, timeout=GITHUB_TIMEOUT) as resp:
            data = json.load(resp)
    except (OSError, ValueError):
        return None, None, ""
    tag = str(data.get("tag_name") or "")
    if _parse_version(tag) in (None, (0, 0)):
        return None, None, ""   # tag que não é uma versão (ex.: "beta")
    asset = next((a for a in data.get("assets") or []
                  if str(a.get("name", "")).endswith(".zip")), None)
    if not asset:
        return None, None, ""
    return tag, asset.get("browser_download_url"), str(data.get("body") or "")


def read_changelog():
    """Novidades por versão, para a janela "Novidades" da app: lista de
    {"version": N, "notes": [...]} da mais recente para a mais antiga, só até
    à versão instalada. Lê o changelog.json da pasta partilhada e, se essa
    pasta não existir (ou a leitura falhar), cai nas Releases do GitHub —
    a mesma ordem de preferência do check_update(). Nunca levanta erros:
    devolve [] quando não consegue nada."""
    rel = find_releases_dir()
    current_version = _parse_version(APP_VERSION)
    
    if rel:
        try:
            # utf-8-sig: tolera o BOM que editores/PowerShell acrescentam
            with open(os.path.join(rel, "changelog.json"), encoding="utf-8-sig") as f:
                changelog = json.load(f)
            entries = []
            for key, notes in (changelog or {}).items():
                version_tuple = _parse_version(key)
                if version_tuple <= current_version:
                    entries.append({"version": key, "notes": list(notes or [])})
            return sorted(entries, key=lambda e: _parse_version(e["version"]), reverse=True)
        except (OSError, ValueError):
            pass  # sem pasta partilhada utilizável — tenta o GitHub

    try:
        req = urllib.request.Request(
            f"https://api.github.com/repos/{GITHUB_REPO}/releases?per_page=50",
            headers={"Accept": "application/vnd.github+json", "User-Agent": _USER_AGENT})
        with urllib.request.urlopen(req, timeout=GITHUB_TIMEOUT) as resp:
            releases = json.load(resp)
        entries = []
        for rlz in releases or []:
            try:
                version_tuple = _parse_version(rlz.get("tag_name") or "")
                if not version_tuple or version_tuple == (0, 0):
                    continue  # tag que não é uma versão (ex.: "beta")
            except ValueError:
                continue
            if version_tuple > current_version:
                continue
            # o corpo da release já vem com "- " no início de cada linha
            # (ver make_release.py): tira-se o traço para ficar só o texto
            notes = [line.strip().lstrip("-").strip()
                     for line in str(rlz.get("body") or "").splitlines()
                     if line.strip()]
            entries.append({"version": rlz.get("tag_name", ""), "notes": notes})
        return sorted(entries, key=lambda e: _parse_version(e["version"]), reverse=True)
    except (OSError, ValueError):
        return []


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
            # o run-with-server.bat pode estar em execução (foi ele que lançou
            # a app) — reescrevê-lo em execução corrompe o cmd. Fica como
            # .new e o próprio run-with-server.bat aplica a troca no próximo
            # arranque.
            if name.lower() == "run-with-server.bat":
                try:
                    if os.path.isfile(dest) and filecmp.cmp(full, dest, shallow=False):
                        continue  # não mudou — nada a fazer
                except OSError:
                    pass
                dest += ".new"
            shutil.copy2(full, dest)
    # v88: run.bat foi renomeado para run-with-server.bat — o zip novo já não
    # o traz, por isso o ficheiro antigo (de instalações anteriores) fica
    # órfão; remove-se aqui em vez de o deixar parado na pasta para sempre.
    stale_run_bat = os.path.join(HERE, "run.bat")
    if os.path.isfile(stale_run_bat):
        try:
            os.remove(stale_run_bat)
        except OSError:
            pass
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
    new_version = latest.get("version", "0")
    new_version_tuple = _parse_version(new_version)
    current_version_tuple = _parse_version(APP_VERSION)
    
    if new_version_tuple <= current_version_tuple:
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
    
    # Gerar notas para todas as versões entre current e new
    news_lines = []
    for version_key in sorted(changelog.keys(), key=_parse_version):
        version_tuple = _parse_version(version_key)
        if current_version_tuple < version_tuple <= new_version_tuple:
            for line in changelog.get(version_key, []):
                news_lines.append(f"v{version_key}: {line}")
    _print_news(news_lines)
    return True


def _check_update_github():
    """Tenta atualizar a partir da página pública de Releases do GitHub —
    funciona mesmo sem a pasta OneDrive partilhada (instalações fora da
    Critical Software). Devolve True se atualizou, False se não havia nada
    mais recente (ou não foi possível chegar ao GitHub)."""
    new_tag, asset_url, body = github_latest()
    new_version_tuple = _parse_version(new_tag)
    current_version_tuple = _parse_version(APP_VERSION)

    if not new_tag or new_version_tuple <= current_version_tuple or not asset_url:
        return False

    # a tag pode vir com "v" à frente ("v1.2.0"), como o _parse_version já tolera
    new_version_str = str(new_tag).lstrip("vV").strip()
    print(f"Versão nova encontrada no GitHub: v{new_version_str} (local: v{APP_VERSION}). A descarregar...")
    with tempfile.TemporaryDirectory() as td:
        zip_path = os.path.join(td, "release.zip")
        req = urllib.request.Request(asset_url, headers={"User-Agent": _USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as resp, open(zip_path, "wb") as f:
            shutil.copyfileobj(resp, f)
        _apply_zip(zip_path, new_version_str)

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
