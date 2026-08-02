# -*- coding: utf-8 -*-
"""
Script de Automação de Release — My Organizer (CSW.AI.OS)
Executar a partir da pasta DEV (bsp-tracker) para publicar uma nova release.
"""

import json
import os
import py_compile
import re
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime

# a consola do Windows e cp1252: sem isto, os "check marks" (u2713) usados
# abaixo para assinalar cada passo rebentam o script a meio (mesmo bug que o
# app evita em cswaios/config.py)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="replace")
    except (AttributeError, OSError):
        pass

# Path Configuration
DEV_DIR = os.path.dirname(os.path.abspath(__file__))
RELEASES_SHARE_DIR = r"C:\Users\cm-andrade\OneDrive - CRITICAL SOFTWARE, S.A\BSP-G2-Tracker-App"
# Repositorio onde o zip da release e publicado (pagina de download para quem
# so quer usar a app). Vazio ou BSP_GITHUB_REPO="" desliga esta publicacao.
GITHUB_REPO = os.environ.get("BSP_GITHUB_REPO", "Cmprfda/my-organizer")
GITHUB_BRANCH = "main"
CHANGELOG_PATH = os.path.join(RELEASES_SHARE_DIR, "changelog.json")
LATEST_PATH = os.path.join(RELEASES_SHARE_DIR, "latest.json")
RELEASES_MD_PATH = os.path.join(RELEASES_SHARE_DIR, "RELEASES.md")
RELEASES_ZIP_DIR = os.path.join(RELEASES_SHARE_DIR, "releases")
MIRROR_ZIP_PATH = os.path.abspath(os.path.join(DEV_DIR, "..", "bsp-tracker.zip"))

CORE_FILES = ["app.py", "index.html", "run-with-server.bat", "My Organizer.vbs", "bsp.bat", "setup.bat",
              "README.md", "requirements.txt", "graph_config.example.json", "app-icon.ico"]
# pastas de código enviadas na íntegra (o pacote Python e os ficheiros da interface)
CORE_DIRS = ["cswaios", "static"]
# as versões antigas da app só copiavam ficheiros soltos ao auto-atualizar; este
# zip vai à raiz da release e o app.py novo desempacota-o no primeiro arranque
PAYLOAD_NAME = "app_payload.zip"

# Map special characters to ASCII/cp1252 safe chars to prevent Windows console crash during auto-update
CHAR_REPLACEMENTS = {
    "✎": "[edit]",
    "⇄": "<->",
    "✕": "[x]",
    "→": "->",
    "↑": "^",
    "–": "-",
    "—": "-"
}

def sanitize_text(text: str) -> str:
    """Substitui caracteres fora da tabela cp1252 por equivalentes ASCII."""
    for char, replacement in CHAR_REPLACEMENTS.items():
        text = text.replace(char, replacement)
    return text

def iter_core_dir_files():
    """Ficheiros das pastas de código, em caminhos relativos com '/'."""
    for folder in CORE_DIRS:
        root_dir = os.path.join(DEV_DIR, folder)
        if not os.path.isdir(root_dir):
            print(f"  ⚠️ Aviso: pasta essencial não encontrada: {folder}")
            continue
        for root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d != "__pycache__"]
            for name in sorted(files):
                if name.endswith((".pyc", ".pyo")):
                    continue
                full = os.path.join(root, name)
                yield full, os.path.relpath(full, DEV_DIR).replace("\\", "/")


def build_payload_zip() -> str:
    """Cria o app_payload.zip (cswaios/ + static/) e devolve o caminho."""
    payload_path = os.path.join(DEV_DIR, PAYLOAD_NAME)
    with zipfile.ZipFile(payload_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for full, rel in iter_core_dir_files():
            zipf.write(full, rel)
    return payload_path


def find_gh():
    """Caminho para o GitHub CLI (gh), ou None se nao estiver instalado."""
    exe = shutil.which("gh")
    if exe:
        return exe
    fallback = os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"),
                            "GitHub CLI", "gh.exe")
    return fallback if os.path.isfile(fallback) else None


def _run(cmd):
    """Corre um comando e devolve (ok, saida)."""
    proc = subprocess.run(cmd, cwd=DEV_DIR, capture_output=True, text=True,
                          encoding="utf-8", errors="replace")
    return proc.returncode == 0, ((proc.stdout or "") + (proc.stderr or "")).strip()


def warn_unpushed():
    """O tag da release aponta para o ultimo commit que esta no GitHub; avisa
    se o codigo local ainda nao la estiver."""
    ok, _ = _run(["git", "rev-parse", "--is-inside-work-tree"])
    if not ok:
        return
    ok, dirty = _run(["git", "status", "--porcelain"])
    if ok and dirty:
        print("  ⚠️ Ha alteracoes por commitar; o tag da release nao as inclui.")
    ok, ahead = _run(["git", "log", "--oneline", f"origin/{GITHUB_BRANCH}..HEAD"])
    if ok and ahead:
        print("  ⚠️ Ha commits por enviar (git push); o tag da release nao os inclui.")


def publish_github_release(version, zip_path, changes):
    """Publica o zip na pagina de Releases do GitHub.

    Falhar aqui nao invalida a release: a pasta partilhada continua a ser a
    fonte da auto-atualizacao da app.
    """
    if not GITHUB_REPO:
        print("  - Publicacao no GitHub desligada (GITHUB_REPO vazio).")
        return
    gh = find_gh()
    if not gh:
        print("  ⚠️ GitHub CLI (gh) nao encontrado: publicacao no GitHub ignorada.")
        print("     Instalar com: winget install --id GitHub.cli")
        return
    ok, _ = _run([gh, "auth", "status", "--hostname", "github.com"])
    if not ok:
        print("  ⚠️ gh sem sessao iniciada: publicacao no GitHub ignorada.")
        print("     Iniciar com: gh auth login")
        return

    warn_unpushed()
    tag = f"v{version}"
    if _run([gh, "release", "view", tag, "--repo", GITHUB_REPO])[0]:
        print(f"  - Release {tag} ja existe: a substituir o ficheiro.")
        ok, out = _run([gh, "release", "upload", tag, zip_path,
                        "--repo", GITHUB_REPO, "--clobber"])
    else:
        notes = "\n".join("- " + c for c in changes)
        ok, out = _run([gh, "release", "create", tag, zip_path,
                        "--repo", GITHUB_REPO, "--target", GITHUB_BRANCH,
                        "--title", f"My Organizer {tag}", "--notes", notes])
    if ok:
        print(f"  ✓ Publicada em https://github.com/{GITHUB_REPO}/releases/tag/{tag}")
    else:
        print(f"  ⚠️ Nao foi possivel publicar no GitHub: {out}")


def validate_python_syntax():
    print("[1/9] A validar sintaxe do app.py e do pacote cswaios/...")
    alvos = [os.path.join(DEV_DIR, "app.py")]
    alvos += [full for full, rel in iter_core_dir_files() if rel.endswith(".py")]
    for alvo in alvos:
        try:
            py_compile.compile(alvo, doraise=True)
        except py_compile.PyCompileError as e:
            print(f"  ❌ Erro de sintaxe em {os.path.relpath(alvo, DEV_DIR)}: {e}")
            sys.exit(1)
    print(f"  ✓ {len(alvos)} ficheiros Python validados com sucesso.")

def get_current_app_version() -> str:
    """Lê APP_VERSION (formato X.Y.Z) de cswaios/config.py."""
    config_py = os.path.join(DEV_DIR, "cswaios", "config.py")
    with open(config_py, "r", encoding="utf-8") as f:
        content = f.read()
    match = re.search(r'APP_VERSION\s*=\s*["\']([0-9.]+)["\']', content)
    if not match:
        print("  ❌ Não foi possível encontrar APP_VERSION em cswaios/config.py.")
        sys.exit(1)
    return match.group(1)

def bump_version(current: str, bump_type: str) -> str:
    """Incrementa versão semântica (X.Y.Z).
    
    bump_type: 'major' (X+1.0.0), 'minor' (X.Y+1.0), 'patch' (X.Y.Z+1)
    """
    # Suporta legado: se receber inteiro, converte para 1.0.N
    if "." not in current:
        try:
            version_int = int(current)
            # Mapear v107 → 1.0.106 (v1 → 1.0.0, v2 → 1.0.1, etc)
            current = f"1.0.{version_int - 1}"
        except ValueError:
            print(f"  ❌ Versão inválida: {current}. Formato esperado: X.Y.Z")
            sys.exit(1)
    
    # Processar semântico X.Y.Z
    parts = current.split(".")
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        print(f"  ❌ Versão inválida: {current}. Formato esperado: X.Y.Z")
        sys.exit(1)
    major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])
    
    if bump_type == "major":
        major += 1
        minor = 0
        patch = 0
    elif bump_type == "minor":
        minor += 1
        patch = 0
    elif bump_type == "patch":
        patch += 1
    else:
        print(f"  ❌ Tipo de bump inválido: {bump_type}")
        sys.exit(1)
    return f"{major}.{minor}.{patch}"

def update_app_version_in_config(new_version: str):
    """Atualiza APP_VERSION em cswaios/config.py."""
    config_py = os.path.join(DEV_DIR, "cswaios", "config.py")
    with open(config_py, "r", encoding="utf-8") as f:
        content = f.read()
    content = re.sub(
        r'APP_VERSION\s*=\s*["\']([0-9.]+)["\']',
        f'APP_VERSION = "{new_version}"',
        content
    )
    with open(config_py, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print(f"  ✓ APP_VERSION atualizado para {new_version} em cswaios/config.py.")

def update_releases_md(changelog_data: dict):
    """Regenera o RELEASES.md a partir do changelog.json sem BOM em UTF-8."""
    lines = ["# My Organizer - historico de versoes", ""]
    # Ordenar versões semanticamente (X.Y.Z) em ordem descendente
    sorted_versions = sorted(
        changelog_data.keys(),
        key=lambda v: tuple(map(int, v.split("."))),
        reverse=True
    )
    for version in sorted_versions:
        lines.append(f"## v{version}")
        for item in changelog_data[version]:
            lines.append(f"- {item}")
        lines.append("")

    content = "\n".join(lines)
    with open(RELEASES_MD_PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print("  ✓ RELEASES.md regenerado.")

def main():
    print("==================================================")
    print("      My Organizer — Automação de Release      ")
    print("==================================================\n")

    # 1. Validar sintaxe do app.py
    validate_python_syntax()

    # 2. Obter versão atual
    current_version = get_current_app_version()
    print(f"\n[2/9] Versão atual detetada em cswaios/config.py: v{current_version}")
    
    # 3. Perguntar qual parte bumpar
    print("\n[3/9] Escolha a parte a incrementar:")
    print(f"  [p]atch (v{bump_version(current_version, 'patch')})")
    print(f"  [m]inor (v{bump_version(current_version, 'minor')})")
    print(f"  [M]ajor (v{bump_version(current_version, 'major')})")
    print("  ou introduza uma versão customizada (ex: 1.0.107)")
    
    choice = input("  > ").strip().lower()
    
    if choice == "p":
        new_version = bump_version(current_version, "patch")
    elif choice == "m":
        new_version = bump_version(current_version, "minor")
    elif choice == "M":
        new_version = bump_version(current_version, "major")
    else:
        # Validar versão customizada (semântica)
        if not re.match(r'^[0-9]+\.[0-9]+\.[0-9]+$', choice):
            print("  ❌ Formato inválido. Use X.Y.Z (ex: 1.0.107)")
            sys.exit(1)
        new_version = choice
    
    print(f"  → Nova versão: v{new_version}")
    
    # 4. Atualizar APP_VERSION em config.py
    print("\n[4/9] A atualizar APP_VERSION em cswaios/config.py...")
    update_app_version_in_config(new_version)
    
    # 5. Pergunta notas da release ao utilizador
    print("\n[5/9] Introduza as notas da release (uma por linha).")
    print("      Pressione Enter numa linha vazia quando terminar:")
    changes = []
    while True:
        line = input("  > ").strip()
        if not line:
            if not changes:
                print("  ⚠️ Deve introduzir pelo menos uma nota para o changelog.")
                continue
            break
        changes.append(sanitize_text(line))

    # 6. Atualizar changelog.json
    print("\n[6/9] A atualizar changelog.json...")
    changelog = {}
    if os.path.exists(CHANGELOG_PATH):
        with open(CHANGELOG_PATH, "r", encoding="utf-8-sig") as f:
            changelog = json.load(f)

    if not isinstance(changelog, dict):
        print("  ❌ changelog.json inesperado: era esperado um objeto {versao: [notas]}.")
        sys.exit(1)

    # a app lê o changelog como {"1.0.0": ["nota", ...]}; re-executar sobrepõe a versao
    changelog[new_version] = changes
    changelog = {k: changelog[k] for k in sorted(changelog, key=lambda v: tuple(map(int, v.split("."))))}

    with open(CHANGELOG_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(changelog, f, indent=2, ensure_ascii=False)
    print("  ✓ changelog.json atualizado (UTF-8 sem BOM).")

    # 7. Regenerar RELEASES.md
    print("\n[7/9] A regenerar RELEASES.md...")
    update_releases_md(changelog)

    # 8. Criar ZIP da release
    print("\n[8/9] A empacotar ficheiros no ZIP da release...")
    os.makedirs(RELEASES_ZIP_DIR, exist_ok=True)
    zip_filename = f"bsp-tracker-v{new_version}.zip"
    zip_target_path = os.path.join(RELEASES_ZIP_DIR, zip_filename)

    with zipfile.ZipFile(zip_target_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for file_name in CORE_FILES:
            file_src = os.path.join(DEV_DIR, file_name)
            if os.path.exists(file_src):
                # Guarda dentro de 'bsp-tracker/' no zip
                arcname = os.path.join("bsp-tracker", file_name)
                zipf.write(file_src, arcname)
            else:
                print(f"  ⚠️ Aviso: Ficheiro essencial não encontrado: {file_name}")
        n_dirs = 0
        for full, rel in iter_core_dir_files():
            zipf.write(full, "bsp-tracker/" + rel)
            n_dirs += 1
        payload_path = build_payload_zip()
        zipf.write(payload_path, "bsp-tracker/" + PAYLOAD_NAME)
        os.remove(payload_path)

    print(f"  ✓ {n_dirs} ficheiros de cswaios/ e static/ incluídos (+ {PAYLOAD_NAME}).")
    print(f"  ✓ Release zip criada em: {zip_target_path}")

    # 9. Atualizar latest.json
    print("\n[9/9] A atualizar latest.json...")
    # preservar campos extras (ex.: relay_server) ja existentes no ficheiro
    try:
        with open(LATEST_PATH, encoding="utf-8") as f:
            existing_latest = json.load(f)
    except (OSError, ValueError):
        existing_latest = {}
    latest_data = {
        **{k: v for k, v in existing_latest.items()
           if k not in ("version", "id", "file", "released")},
        "version": new_version,
        "id": f"v{new_version}",
        "file": f"releases/{zip_filename}",
        "released": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    with open(LATEST_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(latest_data, f, indent=2, ensure_ascii=False)
    print("  ✓ latest.json atualizado.")

    # 10. Sincronizar Zip de Espelho
    print("\n[10/9] A espelhar zip para ..\\bsp-tracker.zip...")
    shutil.copy2(zip_target_path, MIRROR_ZIP_PATH)
    print("  ✓ Espelho atualizado com sucesso.")

    # 11. Publicar o zip na pagina de Releases do GitHub
    print("\n[11/9] A publicar o zip no GitHub...")
    publish_github_release(new_version, zip_target_path, changes)

    print("\n==================================================")
    print(f"🎉 RELEASE v{new_version} PUBLICADA COM SUCESSO!")
    print("==================================================")
    print("Próximos passos:")
    print(" 1. Reiniciar a instância DEV via `run-dev.bat` (Porto 8766).")
    print(" 2. Confirmar com: Invoke-RestMethod http://localhost:8766/api/tasks")
    print(" 3. A versão estável (8765) irá auto-atualizar no próximo arranque.\n")

if __name__ == "__main__":
    main()