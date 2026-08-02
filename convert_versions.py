# -*- coding: utf-8 -*-
"""
Converte todas as versões do changelog de formato inteiro (1, 2, 3...) 
para formato semântico (1.0.0, 1.0.1, 1.0.2...).

Uso: python convert_versions.py
"""

import json
import os
import re

CHANGELOG_PATH = r"C:\Users\cm-andrade\OneDrive - CRITICAL SOFTWARE, S.A\BSP-G2-Tracker-App\changelog.json"
RELEASES_MD_PATH = r"C:\Users\cm-andrade\OneDrive - CRITICAL SOFTWARE, S.A\BSP-G2-Tracker-App\RELEASES.md"
LATEST_PATH = r"C:\Users\cm-andrade\OneDrive - CRITICAL SOFTWARE, S.A\BSP-G2-Tracker-App\latest.json"

def int_to_semver(version_int: int) -> str:
    """Converte versão inteira para semântica.
    
    Estratégia: cada versão inteira (1, 2, 3...) vira X.0.Z onde:
    - X = versão inteira dividida por 10 (inteiro)
    - Z = versão inteira modulo 10
    
    Assim: v1-v9 => 1.0.0-1.0.9
           v10-v19 => 1.0.10-1.0.19
           v20-v29 => 2.0.0-2.0.9
           etc.
    
    Alternativa mais simples: v1 => 1.0.0, v2 => 1.0.1, v3 => 1.0.2... v106 => 1.0.105
    Mas isso dá números de patch muito grandes. Vou usar estratégia de agrupamento.
    
    Na verdade, vou usar: versão_inteira / 10 para major, 0 para minor, versão_inteira para patch
    Ficaria: v1 => 0.0.1, v2 => 0.0.2... v10 => 1.0.10, v106 => 10.0.106
    
    Melhor estratégia: versão_inteira como patch apenas:
    v1 => 1.0.0 (inicial)
    v2 => 1.0.1
    v3 => 1.0.2
    ...
    v106 => 1.0.105
    
    Mas isto é confuso. Vou usar: X = 1 (major será sempre 1 por enquanto)
    Y = 0 (minor será sempre 0, permitindo para futuro)
    Z = versão_inteira - 1 (patch começa em 0)
    
    Ficaria:
    v1 => 1.0.0
    v2 => 1.0.1
    v106 => 1.0.105
    """
    return f"1.0.{version_int - 1}"

def convert_changelog():
    """Lê changelog.json, converte versões e escreve de volta."""
    print("📖 A ler changelog.json...")
    
    with open(CHANGELOG_PATH, "r", encoding="utf-8-sig") as f:
        changelog = json.load(f)
    
    if not isinstance(changelog, dict):
        print("❌ changelog.json inválido")
        return False
    
    # Converter todas as chaves
    new_changelog = {}
    for version_str, notes in changelog.items():
        try:
            version_int = int(version_str)
            new_version = int_to_semver(version_int)
            new_changelog[new_version] = notes
            print(f"  v{version_str} → v{new_version}")
        except ValueError:
            print(f"  ⚠️ Versão inválida ignorada: {version_str}")
            continue
    
    # Ordenar por versão semântica descendente
    sorted_changelog = {
        k: new_changelog[k] 
        for k in sorted(
            new_changelog.keys(),
            key=lambda v: tuple(map(int, v.split("."))),
            reverse=True
        )
    }
    
    # Escrever de volta
    print("\n✍️ A escrever changelog.json convertido...")
    with open(CHANGELOG_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(sorted_changelog, f, indent=2, ensure_ascii=False)
    
    print(f"  ✓ {len(new_changelog)} versões convertidas.\n")
    return sorted_changelog

def update_releases_md(changelog_data: dict):
    """Regenera RELEASES.md com versões semânticas."""
    print("📝 A regenerar RELEASES.md...")
    
    lines = ["# My Organizer - historico de versoes", ""]
    for version in changelog_data.keys():  # já está ordenado
        lines.append(f"## v{version}")
        for item in changelog_data[version]:
            lines.append(f"- {item}")
        lines.append("")
    
    content = "\n".join(lines)
    with open(RELEASES_MD_PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    
    print(f"  ✓ RELEASES.md regenerado.\n")

def update_latest_json():
    """Atualiza latest.json com a versão mais recente em formato semântico."""
    print("⚙️ A atualizar latest.json...")
    
    try:
        with open(LATEST_PATH, "r", encoding="utf-8") as f:
            latest = json.load(f)
    except (OSError, ValueError):
        latest = {}
    
    # Converter versão
    if "version" in latest:
        try:
            old_version = int(latest["version"])
            new_version = int_to_semver(old_version)
            latest["version"] = new_version
            latest["id"] = f"v{new_version}"
            latest["file"] = f"releases/bsp-tracker-v{new_version}.zip"
            
            print(f"  ✓ latest.json atualizado: v{old_version} → v{new_version}\n")
            
            with open(LATEST_PATH, "w", encoding="utf-8", newline="\n") as f:
                json.dump(latest, f, indent=2, ensure_ascii=False)
        except ValueError:
            print(f"  ⚠️ Versão em latest.json não é inteira: {latest.get('version')}\n")
    else:
        print("  ⚠️ latest.json não tem campo 'version'\n")

def main():
    print("="*60)
    print("  Conversão de Versões — Inteiro → Semântico")
    print("="*60 + "\n")
    
    if not os.path.exists(CHANGELOG_PATH):
        print(f"❌ Arquivo não encontrado: {CHANGELOG_PATH}")
        return False
    
    # Converter changelog
    new_changelog = convert_changelog()
    if not new_changelog:
        return False
    
    # Atualizar RELEASES.md
    update_releases_md(new_changelog)
    
    # Atualizar latest.json
    update_latest_json()
    
    print("="*60)
    print("✅ Conversão completa!")
    print("="*60)
    print("\nPróximos passos:")
    print("  1. Revisar os ficheiros alterados na pasta de releases")
    print("  2. Criar tags em git para cada versão (opcional)")
    print("  3. Confirmar com: Invoke-RestMethod http://localhost:8766/api/tasks\n")

if __name__ == "__main__":
    main()
