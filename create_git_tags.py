# -*- coding: utf-8 -*-
"""
Cria tags git para todas as versões do changelog.

Uso: python create_git_tags.py
"""

import json
import os
import subprocess

DEV_DIR = r"c:\Users\cm-andrade\Desktop\my_projects\bsp-tracker"
CHANGELOG_PATH = r"C:\Users\cm-andrade\OneDrive - CRITICAL SOFTWARE, S.A\BSP-G2-Tracker-App\changelog.json"

def run_cmd(cmd):
    """Executa comando e devolve (ok, output)."""
    try:
        result = subprocess.run(cmd, cwd=DEV_DIR, capture_output=True, text=True, encoding="utf-8", errors="replace")
        return result.returncode == 0, (result.stdout + result.stderr).strip()
    except Exception as e:
        return False, str(e)

def init_git():
    """Inicializa git se ainda não estiver."""
    print("🔧 Inicializando repositório git...")
    
    ok, output = run_cmd(["git", "rev-parse", "--is-inside-work-tree"])
    if ok:
        print("  ✓ Repositório git já inicializado.")
        return True
    
    ok, output = run_cmd(["git", "init"])
    if not ok:
        print(f"  ❌ Erro ao inicializar git: {output}")
        return False
    
    print("  ✓ Repositório git inicializado.\n")
    return True

def create_tags():
    """Cria tags para cada versão no changelog."""
    print("🏷️ A criar tags git...")
    
    with open(CHANGELOG_PATH, "r", encoding="utf-8") as f:
        changelog = json.load(f)
    
    # Ordenar versões em ordem crescente para criar tags
    versions = sorted(changelog.keys(), key=lambda v: tuple(map(int, v.split("."))))
    
    created = 0
    for version in versions:
        tag = f"v{version}"
        message = f"Release {tag}: {changelog[version][0][:60]}..." if changelog[version] else f"Release {tag}"
        
        # Criar tag anotada
        ok, output = run_cmd(["git", "tag", "-a", tag, "-m", message, "HEAD"])
        
        if "already exists" in output or "fatal: tag" in output:
            print(f"  ⚠️ Tag {tag} já existe, pulando...")
            continue
        elif not ok:
            print(f"  ⚠️ Erro ao criar {tag}: {output}")
            continue
        else:
            print(f"  ✓ {tag}")
            created += 1
    
    print(f"\n✓ {created} tags criadas.\n")
    return created > 0

def main():
    print("="*60)
    print("  Criação de Tags Git — Versões Semânticas")
    print("="*60 + "\n")
    
    if not os.path.exists(DEV_DIR):
        print(f"❌ Pasta não encontrada: {DEV_DIR}")
        return False
    
    if not os.path.exists(CHANGELOG_PATH):
        print(f"❌ Arquivo não encontrado: {CHANGELOG_PATH}")
        return False
    
    # Inicializar git
    if not init_git():
        return False
    
    # Criar tags
    if not create_tags():
        return False
    
    print("="*60)
    print("✅ Tags criadas com sucesso!")
    print("="*60)
    print("\nVocê pode agora fazer push dos tags com:")
    print("  git push origin --tags")
    print("\nOu fazer push de uma tag específica:")
    print("  git push origin v1.0.0")
    print("")

if __name__ == "__main__":
    main()
