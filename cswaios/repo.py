# -*- coding: utf-8 -*-
"""Pastas de código abertas na app ("Código"): a lista das pastas escolhidas, a
árvore de ficheiros e o texto de cada ficheiro.

A app SÓ LÊ. Não há aqui nenhuma escrita no disco do utilizador: nem gravar
ficheiros, nem criar pastas, nem apagar. O que se guarda é a lista das pastas
escolhidas (repos.json, ao lado dos outros estados locais).

Duas contenções, porque isto lê ficheiros do PC:
  * cada caminho pedido é resolvido e confirmado DENTRO da raiz escolhida
    (_inside): "..", ligações simbólicas e caminhos absolutos não saem de lá;
  * o servidor só responde a estes pedidos a partir deste computador (ver
    _is_local no server.py) — pela rede local, não.
"""

import json
import os

from .config import HERE

REPOS_FILE = os.path.join(HERE, "repos.json")

# pastas que nunca interessam a quem quer ler código (e que tornariam a árvore
# inutilizável — o node_modules sozinho tem mais ficheiros que o resto todo)
SKIP_DIRS = {".git", ".hg", ".svn", "node_modules", "__pycache__", ".venv",
             "venv", "env", ".mypy_cache", ".pytest_cache", ".ruff_cache",
             ".tox", ".idea", ".vs", ".vscode-test", "dist", "build",
             ".next", ".nuxt", ".gradle", "target", "bin", "obj"}

# ficheiro de texto até aqui abre-se inteiro; acima disto mostra-se só o começo
MAX_TEXT = 1_500_000
# limite de segurança da procura por nome (uma raiz enorme não pode pendurar a app)
SEARCH_MAX_HITS = 400
SEARCH_MAX_DIRS = 6000

# extensão -> nome da linguagem (é o cliente que pinta, ver static/js/code.js)
LANGS = {
    ".py": "python", ".pyw": "python",
    ".js": "js", ".mjs": "js", ".cjs": "js", ".jsx": "js",
    ".ts": "js", ".tsx": "js",
    ".json": "json", ".jsonc": "json",
    ".html": "html", ".htm": "html", ".xml": "xml", ".svg": "xml",
    ".xsd": "xml", ".xsl": "xml", ".vcxproj": "xml", ".csproj": "xml",
    ".css": "css", ".scss": "css", ".less": "css",
    ".md": "md", ".markdown": "md", ".rst": "md",
    ".bat": "bat", ".cmd": "bat", ".ps1": "ps1", ".psm1": "ps1",
    ".sh": "sh", ".bash": "sh", ".zsh": "sh",
    ".sql": "sql",
    ".c": "c", ".h": "c", ".cpp": "c", ".cc": "c", ".hpp": "c", ".cs": "c",
    ".java": "c", ".go": "c", ".rs": "c", ".m": "c",
    ".yml": "yaml", ".yaml": "yaml",
    ".ini": "ini", ".cfg": "ini", ".conf": "ini", ".toml": "ini",
    ".properties": "ini", ".env": "ini",
    ".vbs": "vb", ".vb": "vb",
    ".csv": "text", ".txt": "text", ".log": "text", ".gitignore": "text",
}


def lang_of(name):
    ext = os.path.splitext(name)[1].lower()
    if not ext:
        # ficheiros sem extensão que são texto por convenção (Makefile, LICENSE…)
        return "text" if name.lower() in ("makefile", "dockerfile", "license",
                                          "readme", "changelog", "notice") else ""
    return LANGS.get(ext, "")


# ---------- lista das pastas escolhidas ----------

def repo_id(path):
    """Identidade estável de uma pasta: a mesma pasta dá sempre o mesmo id
    (é o que evita abri-la duas vezes). O mesmo esquema do workbookId do
    lado do browser."""
    h = 0
    for ch in f"repo:{path.lower()}":
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return f"rp{h:x}"


def load_repos():
    try:
        with open(REPOS_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return []
    if not isinstance(data, list):
        return []
    out = []
    for raw in data:
        if not isinstance(raw, dict):
            continue
        path = str(raw.get("path") or "")
        if not path:
            continue
        out.append({
            "id": raw.get("id") or repo_id(path),
            "path": path,
            "name": str(raw.get("name") or os.path.basename(path.rstrip("\\/")) or path),
            # a pasta pode ter sido movida ou estar numa drive que não está ligada
            "missing": not os.path.isdir(path),
        })
    return out


def save_repos(repos):
    with open(REPOS_FILE, "w", encoding="utf-8") as f:
        json.dump([{"id": r["id"], "path": r["path"], "name": r["name"]} for r in repos],
                  f, ensure_ascii=False, indent=1)


def add_repo(path):
    """Acrescenta uma pasta à lista (ou devolve a que já lá estava)."""
    path = os.path.abspath(str(path or "").strip().strip('"'))
    if not path or not os.path.isdir(path):
        raise ValueError("pasta não encontrada")
    repos = load_repos()
    rid = repo_id(path)
    for r in repos:
        if r["id"] == rid:
            return repos, rid
    repos.append({"id": rid, "path": path,
                  "name": os.path.basename(path.rstrip("\\/")) or path,
                  "missing": False})
    save_repos(repos)
    return repos, rid


def remove_repo(rid):
    """Fecha a pasta na app. Nada é apagado no disco — é só deixar de a mostrar."""
    repos = [r for r in load_repos() if r["id"] != rid]
    save_repos(repos)
    return repos


def rename_repo(rid, name):
    repos = load_repos()
    for r in repos:
        if r["id"] == rid:
            r["name"] = str(name or "").strip() or r["name"]
    save_repos(repos)
    return repos


def repo_by_id(rid):
    for r in load_repos():
        if r["id"] == rid:
            return r
    return None


# ---------- navegar dentro de uma pasta ----------

def _inside(root, rel):
    """Caminho absoluto de `rel` dentro de `root`, confirmado com os caminhos
    já resolvidos (realpath): é isto que impede um ".." ou uma ligação
    simbólica de sair da pasta escolhida."""
    root_real = os.path.realpath(root)
    target = os.path.realpath(os.path.join(root_real, str(rel or "").replace("\\", "/").lstrip("/")))
    if target != root_real and not target.startswith(root_real + os.sep):
        raise ValueError("caminho fora da pasta")
    return target


def _entry(base, rel, name):
    full = os.path.join(base, name)
    is_dir = os.path.isdir(full)
    child = f"{rel}/{name}" if rel else name
    out = {"name": name, "path": child, "dir": is_dir}
    if is_dir:
        out["skip"] = name in SKIP_DIRS
    else:
        out["lang"] = lang_of(name)
        try:
            out["size"] = os.path.getsize(full)
        except OSError:
            out["size"] = 0
    return out


def list_dir(rid, rel=""):
    """O conteúdo de uma pasta (só um nível: a árvore abre-se ramo a ramo).
    Pastas primeiro, cada grupo por ordem alfabética."""
    repo = repo_by_id(rid)
    if not repo:
        raise ValueError("pasta não aberta")
    rel = str(rel or "").replace("\\", "/").strip("/")
    base = _inside(repo["path"], rel)
    if not os.path.isdir(base):
        raise ValueError("pasta não encontrada")
    try:
        names = os.listdir(base)
    except OSError as exc:
        raise ValueError(f"não consegui ler a pasta ({exc.strerror or exc})")
    items = [_entry(base, rel, n) for n in names]
    items.sort(key=lambda e: (not e["dir"], e["name"].lower()))
    return {"path": rel, "entries": items}


def read_text(rid, rel):
    """O texto de um ficheiro. Um ficheiro binário não se abre (diz-se que é
    binário); um ficheiro muito grande abre-se só até MAX_TEXT."""
    repo = repo_by_id(rid)
    if not repo:
        raise ValueError("pasta não aberta")
    rel = str(rel or "").replace("\\", "/").strip("/")
    if not rel:
        raise ValueError("ficheiro não indicado")
    full = _inside(repo["path"], rel)
    if not os.path.isfile(full):
        raise ValueError("ficheiro não encontrado")
    size = os.path.getsize(full)
    with open(full, "rb") as f:
        raw = f.read(MAX_TEXT + 1)
    if b"\x00" in raw[:4096]:
        return {"path": rel, "binary": True, "size": size, "lang": "", "text": ""}
    truncated = len(raw) > MAX_TEXT
    if truncated:
        raw = raw[:MAX_TEXT]
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("utf-8", "replace")
    return {
        "path": rel, "binary": False, "size": size, "truncated": truncated,
        "lang": lang_of(os.path.basename(full)),
        "text": text.replace("\r\n", "\n").replace("\r", "\n"),
    }


def search_files(rid, query):
    """Ficheiros da pasta cujo nome (ou caminho) contém o que se escreveu.
    Serve a caixa de procura da árvore: sem ela, encontrar um script numa
    hierarquia grande dava vinte cliques."""
    repo = repo_by_id(rid)
    if not repo:
        raise ValueError("pasta não aberta")
    q = str(query or "").strip().lower()
    if len(q) < 2:
        return {"query": q, "hits": [], "partial": False}
    root = os.path.realpath(repo["path"])
    hits, seen_dirs = [], 0
    for base, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not d.startswith("."))
        seen_dirs += 1
        if seen_dirs > SEARCH_MAX_DIRS:
            return {"query": q, "hits": hits, "partial": True}
        rel_base = os.path.relpath(base, root).replace("\\", "/")
        rel_base = "" if rel_base == "." else rel_base
        for name in sorted(files):
            rel = f"{rel_base}/{name}" if rel_base else name
            if q in rel.lower():
                hits.append({"path": rel, "name": name, "lang": lang_of(name)})
                if len(hits) >= SEARCH_MAX_HITS:
                    return {"query": q, "hits": hits, "partial": True}
    return {"query": q, "hits": hits, "partial": False}


def browse_local_folder():
    """Abre a janela do Windows para escolher uma pasta. Devolve o caminho,
    None se o utilizador cancelou, ou "unavailable" quando a app está a correr
    numa aba do browser (sem janela nativa não há diálogo possível) — o mesmo
    contrato do browse_local_file() do excel.py."""
    from . import config
    try:
        import webview
    except ImportError:
        return "unavailable"
    if not config.WEBVIEW_WINDOW:
        return "unavailable"
    escolhido = config.WEBVIEW_WINDOW.create_file_dialog(webview.FOLDER_DIALOG)
    if not escolhido:
        return None
    return str(escolhido[0]) if isinstance(escolhido, (list, tuple)) else str(escolhido)
