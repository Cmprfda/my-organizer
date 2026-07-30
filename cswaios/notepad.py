# -*- coding: utf-8 -*-
"""Notas em quadro: caixas soltas com texto e imagens, organizadas em pastas.

As imagens coladas não vivem no JSON (ficaria enorme e lento a cada gravação):
ficam em `notepad_images/` e a caixa guarda só o nome do ficheiro.
"""

import base64
import json
import os
import re
import threading
import time
from datetime import datetime

from .config import HERE

NOTEPAD_FILE = os.path.join(HERE, "notepad.json")
IMAGES_DIR = os.path.join(HERE, "notepad_images")

# o servidor é multi-thread: ler-alterar-gravar tem de ser atómico, senão duas
# ações ao mesmo tempo (escrever numa caixa enquanto se arrasta outra)
# perdem-se uma à outra
_lock = threading.RLock()

MAX_TITLE = 120
MAX_TEXT = 5000
MAX_BOXES = 300
MAX_NOTES = 500
MAX_FOLDERS = 200
MAX_IMAGE_BYTES = 8 * 1024 * 1024
IMAGE_TYPES = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
               "gif": "image/gif", "webp": "image/webp"}
SAFE_IMAGE_NAME = re.compile(r"^[A-Za-z0-9_-]+\.(png|jpg|jpeg|gif|webp)$")

# limites do quadro (o canvas do browser usa as mesmas medidas)
BOARD_W, BOARD_H = 4000, 4000
MIN_BOX_W, MIN_BOX_H = 120, 80

_last_id = 0


def new_id(prefix):
    """Identificador único mesmo com vários pedidos no mesmo milissegundo."""
    global _last_id
    now = int(time.time() * 1000)
    _last_id = now if now > _last_id else _last_id + 1
    return f"{prefix}{_last_id}"


def _clamp(value, low, high, default=0):
    try:
        num = int(float(value))
    except (TypeError, ValueError):
        num = default
    return max(low, min(high, num))


def _text(value, limit):
    return str(value if value is not None else "").strip()[:limit]


# ---------------------------------------------------------------- normalização

def normalize_box(raw):
    if not isinstance(raw, dict):
        return None
    box_id = _text(raw.get("id"), 40)
    if not box_id:
        return None
    image = _text(raw.get("image"), 120)
    if image and not SAFE_IMAGE_NAME.match(image):
        image = ""
    color = str(raw.get("color") or "yellow").strip().lower()
    if color not in ("yellow", "blue", "green", "pink", "plain"):
        color = "yellow"
    return {
        "id": box_id,
        "x": _clamp(raw.get("x"), 0, BOARD_W),
        "y": _clamp(raw.get("y"), 0, BOARD_H),
        "w": _clamp(raw.get("w"), MIN_BOX_W, BOARD_W, 240),
        "h": _clamp(raw.get("h"), MIN_BOX_H, BOARD_H, 160),
        "text": str(raw.get("text") or "")[:MAX_TEXT],
        "image": image,
        "color": color,
    }


def normalize_ref(raw):
    """Ligação da nota a uma tarefa do Excel (ou a uma CCR)."""
    if not isinstance(raw, dict):
        return None
    kind = str(raw.get("kind") or "").strip().lower()
    if kind not in ("task", "ccr"):
        return None
    ref = {"kind": kind, "label": _text(raw.get("label"), 200)}
    for key in ("sheet", "fn", "todo", "ccr"):
        value = _text(raw.get(key), 200)
        if value:
            ref[key] = value
    if kind == "task" and not ref.get("fn"):
        return None
    if kind == "ccr" and not ref.get("ccr"):
        return None
    return ref


def normalize_note(raw):
    if not isinstance(raw, dict):
        return None
    note_id = _text(raw.get("id"), 40)
    if not note_id:
        return None
    boxes = raw.get("boxes")
    boxes = [b for b in (normalize_box(b) for b in boxes) if b][:MAX_BOXES] \
        if isinstance(boxes, list) else []
    return {
        "id": note_id,
        "title": _text(raw.get("title"), MAX_TITLE) or "Nota",
        "folder": _text(raw.get("folder"), 40),
        "ref": normalize_ref(raw.get("ref")),
        "created": _text(raw.get("created"), 20),
        "updated": _text(raw.get("updated"), 20),
        "boxes": boxes,
    }


def normalize_folder(raw):
    if not isinstance(raw, dict):
        return None
    folder_id = _text(raw.get("id"), 40)
    if not folder_id:
        return None
    return {"id": folder_id,
            "name": _text(raw.get("name"), MAX_TITLE) or "Pasta",
            "parent": _text(raw.get("parent"), 40)}


def normalize_notepad(raw):
    if not isinstance(raw, dict):
        return {"folders": [], "notes": []}
    folders_raw = raw.get("folders") if isinstance(raw.get("folders"), list) else []
    notes_raw = raw.get("notes") if isinstance(raw.get("notes"), list) else []
    folders = [f for f in (normalize_folder(f) for f in folders_raw) if f][:MAX_FOLDERS]
    notes = [n for n in (normalize_note(n) for n in notes_raw) if n][:MAX_NOTES]
    known = {f["id"] for f in folders}
    for folder in folders:
        if folder["parent"] not in known or folder["parent"] == folder["id"]:
            folder["parent"] = ""
    for note in notes:
        if note["folder"] not in known:
            note["folder"] = ""
    return {"folders": folders, "notes": notes}


# ------------------------------------------------------------- persistência

def load_notepad():
    with _lock:
        try:
            with open(NOTEPAD_FILE, encoding="utf-8") as f:
                return normalize_notepad(json.load(f))
        except (OSError, ValueError):
            return {"folders": [], "notes": []}


def save_notepad(data):
    with _lock:
        with open(NOTEPAD_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)


# ------------------------------------------------------------------ imagens

def image_file(name):
    """Caminho de uma imagem colada, ou None se o nome não for de confiança."""
    if not SAFE_IMAGE_NAME.match(str(name or "")):
        return None
    path = os.path.normpath(os.path.join(IMAGES_DIR, name))
    if os.path.dirname(path) != os.path.normpath(IMAGES_DIR) or not os.path.isfile(path):
        return None
    return path


def image_type(name):
    return IMAGE_TYPES.get(str(name).rsplit(".", 1)[-1].lower(), "application/octet-stream")


def store_image(raw_name, raw_data):
    """Grava a imagem colada e devolve o nome do ficheiro."""
    ext = str(raw_name or "").rsplit(".", 1)[-1].lower()
    if ext not in IMAGE_TYPES:
        ext = "png"
    try:
        blob = base64.b64decode(str(raw_data or ""), validate=True)
    except (ValueError, TypeError):
        raise ValueError("imagem inválida")
    if not blob:
        raise ValueError("imagem vazia")
    if len(blob) > MAX_IMAGE_BYTES:
        raise ValueError("imagem demasiado grande (máx. 8 MB)")
    name = f"{new_id('img')}.{ext}"
    os.makedirs(IMAGES_DIR, exist_ok=True)
    with open(os.path.join(IMAGES_DIR, name), "wb") as f:
        f.write(blob)
    return name


def drop_images(boxes):
    """Apaga do disco as imagens de caixas que deixaram de existir."""
    for box in boxes or []:
        path = image_file(box.get("image")) if isinstance(box, dict) else None
        if path:
            try:
                os.remove(path)
            except OSError:
                pass


# -------------------------------------------------------------------- ações

def _find(items, item_id):
    return next((x for x in items if x.get("id") == item_id), None)


def _stamp(note):
    note["updated"] = datetime.now().strftime("%d/%m %H:%M")


def apply_action(payload):
    """Executa uma ação do quadro de notas e devolve o estado já gravado."""
    with _lock:
        return _apply_action(payload)


def _apply_action(payload):
    data = load_notepad()
    folders, notes = data["folders"], data["notes"]
    action = str(payload.get("action") or "")

    if action == "add_folder":
        if len(folders) >= MAX_FOLDERS:
            raise ValueError("demasiadas pastas")
        parent = _text(payload.get("parent"), 40)
        if parent and not _find(folders, parent):
            parent = ""
        folders.append({"id": new_id("f"),
                        "name": _text(payload.get("name"), MAX_TITLE) or "Pasta",
                        "parent": parent})

    elif action == "rename_folder":
        folder = _find(folders, _text(payload.get("id"), 40))
        if folder is None:
            raise ValueError("pasta não encontrada")
        name = _text(payload.get("name"), MAX_TITLE)
        if not name:
            raise ValueError("nome vazio")
        folder["name"] = name

    elif action == "delete_folder":
        folder = _find(folders, _text(payload.get("id"), 40))
        if folder is None:
            raise ValueError("pasta não encontrada")
        # o que estava lá dentro sobe um nível — apagar uma pasta nunca
        # deita fora notas
        parent = folder["parent"]
        for other in folders:
            if other["parent"] == folder["id"]:
                other["parent"] = parent
        for note in notes:
            if note["folder"] == folder["id"]:
                note["folder"] = parent
        data["folders"] = [f for f in folders if f["id"] != folder["id"]]

    elif action == "add_note":
        if len(notes) >= MAX_NOTES:
            raise ValueError("demasiadas notas")
        folder = _text(payload.get("folder"), 40)
        if folder and not _find(folders, folder):
            folder = ""
        now = datetime.now().strftime("%d/%m %H:%M")
        notes.append({"id": new_id("n"),
                      "title": _text(payload.get("title"), MAX_TITLE) or "Nota nova",
                      "folder": folder, "ref": normalize_ref(payload.get("ref")),
                      "created": now, "updated": now, "boxes": []})

    elif action == "rename_note":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        title = _text(payload.get("title"), MAX_TITLE)
        if not title:
            raise ValueError("título vazio")
        note["title"] = title
        _stamp(note)

    elif action == "move_note":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        folder = _text(payload.get("folder"), 40)
        note["folder"] = folder if (folder and _find(folders, folder)) else ""
        _stamp(note)

    elif action == "delete_note":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        drop_images(note.get("boxes"))
        data["notes"] = [n for n in notes if n["id"] != note["id"]]

    elif action == "set_link":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        note["ref"] = normalize_ref(payload.get("ref"))
        _stamp(note)

    elif action == "add_box":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        if len(note["boxes"]) >= MAX_BOXES:
            raise ValueError("demasiadas caixas nesta nota")
        image = ""
        if payload.get("image_data"):
            image = store_image(payload.get("image_name"), payload.get("image_data"))
        box = normalize_box({"id": new_id("b"), "x": payload.get("x"), "y": payload.get("y"),
                             "w": payload.get("w"), "h": payload.get("h"),
                             "text": payload.get("text"), "color": payload.get("color"),
                             "image": image})
        note["boxes"].append(box)
        _stamp(note)
        data["new_box"] = box["id"]

    elif action == "update_box":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        box = _find(note["boxes"], _text(payload.get("box_id"), 40))
        if box is None:
            raise ValueError("caixa não encontrada")
        for key in ("x", "y", "w", "h"):
            if payload.get(key) is not None:
                box[key] = payload[key]
        if payload.get("text") is not None:
            box["text"] = payload["text"]
        if payload.get("color") is not None:
            box["color"] = payload["color"]
        note["boxes"] = [b for b in (normalize_box(b) for b in note["boxes"]) if b]
        _stamp(note)

    elif action == "delete_box":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        box_id = _text(payload.get("box_id"), 40)
        gone = [b for b in note["boxes"] if b["id"] == box_id]
        if not gone:
            raise ValueError("caixa não encontrada")
        drop_images(gone)
        note["boxes"] = [b for b in note["boxes"] if b["id"] != box_id]
        _stamp(note)

    else:
        raise ValueError(f"ação inválida: {action}")

    new_box = data.pop("new_box", "")
    clean = normalize_notepad(data)
    save_notepad(clean)
    if new_box:
        clean["new_box"] = new_box
    return clean
