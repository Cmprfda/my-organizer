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
MAX_REFS = 20
MAX_STROKES = 200
MAX_STROKE_POINTS = 2000
MAX_SHAPES = 200
MAX_CONNECTORS = 200
MAX_FRAMES = 60
SHAPE_KINDS = ("line", "rect", "ellipse")
DRAW_COLORS = ("yellow", "blue", "green", "pink", "plain")
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


def normalize_point(raw):
    if not isinstance(raw, dict):
        return None
    return {"x": _clamp(raw.get("x"), 0, BOARD_W), "y": _clamp(raw.get("y"), 0, BOARD_H)}


def normalize_stroke(raw):
    if not isinstance(raw, dict):
        return None
    stroke_id = _text(raw.get("id"), 40)
    if not stroke_id:
        return None
    points_raw = raw.get("points")
    points = [p for p in (normalize_point(p) for p in points_raw) if p][:MAX_STROKE_POINTS] \
        if isinstance(points_raw, list) else []
    if len(points) < 2:
        return None
    color = str(raw.get("color") or "plain").strip().lower()
    if color not in DRAW_COLORS:
        color = "plain"
    return {"id": stroke_id, "points": points, "color": color}


def normalize_shape(raw):
    if not isinstance(raw, dict):
        return None
    shape_id = _text(raw.get("id"), 40)
    if not shape_id:
        return None
    kind = str(raw.get("kind") or "").strip().lower()
    if kind not in SHAPE_KINDS:
        return None
    color = str(raw.get("color") or "plain").strip().lower()
    if color not in DRAW_COLORS:
        color = "plain"
    return {
        "id": shape_id, "kind": kind,
        "x1": _clamp(raw.get("x1"), 0, BOARD_W), "y1": _clamp(raw.get("y1"), 0, BOARD_H),
        "x2": _clamp(raw.get("x2"), 0, BOARD_W), "y2": _clamp(raw.get("y2"), 0, BOARD_H),
        "color": color,
    }


def normalize_connector(raw):
    if not isinstance(raw, dict):
        return None
    conn_id = _text(raw.get("id"), 40)
    from_id = _text(raw.get("from"), 40)
    to_id = _text(raw.get("to"), 40)
    if not conn_id or not from_id or not to_id or from_id == to_id:
        return None
    color = str(raw.get("color") or "plain").strip().lower()
    if color not in DRAW_COLORS:
        color = "plain"
    return {"id": conn_id, "from": from_id, "to": to_id, "color": color}


def normalize_frame(raw):
    if not isinstance(raw, dict):
        return None
    frame_id = _text(raw.get("id"), 40)
    if not frame_id:
        return None
    return {
        "id": frame_id,
        "name": _text(raw.get("name"), MAX_TITLE) or "Grupo",
        "x": _clamp(raw.get("x"), 0, BOARD_W),
        "y": _clamp(raw.get("y"), 0, BOARD_H),
        "w": _clamp(raw.get("w"), MIN_BOX_W, BOARD_W, 240),
        "h": _clamp(raw.get("h"), MIN_BOX_H, BOARD_H, 160),
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
    strokes_raw = raw.get("strokes")
    strokes = [s for s in (normalize_stroke(s) for s in strokes_raw) if s][:MAX_STROKES] \
        if isinstance(strokes_raw, list) else []
    shapes_raw = raw.get("shapes")
    shapes = [s for s in (normalize_shape(s) for s in shapes_raw) if s][:MAX_SHAPES] \
        if isinstance(shapes_raw, list) else []
    connectors_raw = raw.get("connectors")
    box_ids = {b["id"] for b in boxes}
    connectors = [c for c in (normalize_connector(c) for c in connectors_raw)
                  if c and c["from"] in box_ids and c["to"] in box_ids][:MAX_CONNECTORS] \
        if isinstance(connectors_raw, list) else []
    frames_raw = raw.get("frames")
    frames = [f for f in (normalize_frame(f) for f in frames_raw) if f][:MAX_FRAMES] \
        if isinstance(frames_raw, list) else []
    refs_raw = raw.get("refs")
    if not isinstance(refs_raw, list):
        # compatibilidade com notas antigas, que só tinham um "ref"
        legacy = raw.get("ref")
        refs_raw = [legacy] if legacy else []
    refs = [r for r in (normalize_ref(r) for r in refs_raw) if r][:MAX_REFS]
    return {
        "id": note_id,
        "title": _text(raw.get("title"), MAX_TITLE) or "Nota",
        "folder": _text(raw.get("folder"), 40),
        "refs": refs,
        "created": _text(raw.get("created"), 20),
        "updated": _text(raw.get("updated"), 20),
        "boxes": boxes,
        "strokes": strokes,
        "shapes": shapes,
        "connectors": connectors,
        "frames": frames,
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


def _ref_same(a, b):
    if a["kind"] != b["kind"]:
        return False
    if a["kind"] == "task":
        return a.get("fn") == b.get("fn") and a.get("todo", "") == b.get("todo", "")
    return a.get("ccr") == b.get("ccr")


def _is_self_or_descendant(folders, ancestor_id, node_id):
    """True se node_id for o próprio ancestor_id ou estiver dentro dele (evita ciclos ao mover pastas)."""
    cur = _find(folders, node_id)
    while cur:
        if cur["id"] == ancestor_id:
            return True
        cur = _find(folders, cur["parent"]) if cur["parent"] else None
    return False


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

    elif action == "move_folder":
        folder = _find(folders, _text(payload.get("id"), 40))
        if folder is None:
            raise ValueError("pasta não encontrada")
        parent = _text(payload.get("parent"), 40)
        if parent:
            if not _find(folders, parent):
                parent = ""
            elif _is_self_or_descendant(folders, folder["id"], parent):
                raise ValueError("não é possível mover uma pasta para dentro de si própria")
        folder["parent"] = parent

    elif action == "add_note":
        if len(notes) >= MAX_NOTES:
            raise ValueError("demasiadas notas")
        folder = _text(payload.get("folder"), 40)
        if folder and not _find(folders, folder):
            folder = ""
        now = datetime.now().strftime("%d/%m %H:%M")
        notes.append({"id": new_id("n"),
                      "title": _text(payload.get("title"), MAX_TITLE) or "Nota nova",
                      "folder": folder, "refs": [],
                      "created": now, "updated": now, "boxes": [],
                      "strokes": [], "shapes": [], "connectors": [], "frames": []})

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

    elif action == "add_link":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        ref = normalize_ref(payload.get("ref"))
        if ref is None:
            raise ValueError("ligação inválida")
        if not any(_ref_same(ref, r) for r in note["refs"]):
            if len(note["refs"]) >= MAX_REFS:
                raise ValueError("demasiadas ligações")
            note["refs"].append(ref)
            _stamp(note)

    elif action == "remove_link":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        ref = normalize_ref(payload.get("ref"))
        if ref is None:
            raise ValueError("ligação inválida")
        before = len(note["refs"])
        note["refs"] = [r for r in note["refs"] if not _ref_same(ref, r)]
        if len(note["refs"]) != before:
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
        note["connectors"] = [c for c in note["connectors"] if c["from"] != box_id and c["to"] != box_id]
        _stamp(note)

    elif action == "add_stroke":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        if len(note["strokes"]) >= MAX_STROKES:
            raise ValueError("demasiados traços")
        points_raw = payload.get("points")
        if isinstance(points_raw, list) and len(points_raw) > MAX_STROKE_POINTS:
            raise ValueError("traço demasiado longo")
        stroke = normalize_stroke({"id": new_id("s"), "points": points_raw, "color": payload.get("color")})
        if stroke is None:
            raise ValueError("traço inválido")
        note["strokes"].append(stroke)
        _stamp(note)

    elif action == "delete_stroke":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        stroke_id = _text(payload.get("stroke_id"), 40)
        before = len(note["strokes"])
        note["strokes"] = [s for s in note["strokes"] if s["id"] != stroke_id]
        if len(note["strokes"]) != before:
            _stamp(note)

    elif action == "add_shape":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        if len(note["shapes"]) >= MAX_SHAPES:
            raise ValueError("demasiadas formas")
        shape = normalize_shape({"id": new_id("sh"), "kind": payload.get("kind"),
                                 "x1": payload.get("x1"), "y1": payload.get("y1"),
                                 "x2": payload.get("x2"), "y2": payload.get("y2"),
                                 "color": payload.get("color")})
        if shape is None:
            raise ValueError("forma inválida")
        note["shapes"].append(shape)
        _stamp(note)

    elif action == "delete_shape":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        shape_id = _text(payload.get("shape_id"), 40)
        before = len(note["shapes"])
        note["shapes"] = [s for s in note["shapes"] if s["id"] != shape_id]
        if len(note["shapes"]) != before:
            _stamp(note)

    elif action == "add_connector":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        from_id = _text(payload.get("from"), 40)
        to_id = _text(payload.get("to"), 40)
        if not from_id or not to_id or from_id == to_id:
            raise ValueError("ligação inválida")
        if not _find(note["boxes"], from_id) or not _find(note["boxes"], to_id):
            raise ValueError("caixa não encontrada")
        pair = {from_id, to_id}
        if not any({c["from"], c["to"]} == pair for c in note["connectors"]):
            if len(note["connectors"]) >= MAX_CONNECTORS:
                raise ValueError("demasiadas ligações")
            color = str(payload.get("color") or "plain").strip().lower()
            if color not in DRAW_COLORS:
                color = "plain"
            note["connectors"].append({"id": new_id("c"), "from": from_id, "to": to_id, "color": color})
            _stamp(note)

    elif action == "delete_connector":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        connector_id = _text(payload.get("connector_id"), 40)
        before = len(note["connectors"])
        note["connectors"] = [c for c in note["connectors"] if c["id"] != connector_id]
        if len(note["connectors"]) != before:
            _stamp(note)

    elif action == "add_frame":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        if len(note["frames"]) >= MAX_FRAMES:
            raise ValueError("demasiados grupos")
        frame = normalize_frame({"id": new_id("fr"), "name": payload.get("name") or "Grupo",
                                 "x": payload.get("x"), "y": payload.get("y"),
                                 "w": payload.get("w"), "h": payload.get("h")})
        if frame is None:
            raise ValueError("grupo inválido")
        note["frames"].append(frame)
        _stamp(note)

    elif action == "rename_frame":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        frame = _find(note["frames"], _text(payload.get("frame_id"), 40))
        if frame is None:
            raise ValueError("grupo não encontrado")
        name = _text(payload.get("name"), MAX_TITLE)
        if not name:
            raise ValueError("nome vazio")
        frame["name"] = name
        _stamp(note)

    elif action == "update_frame":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        frame = _find(note["frames"], _text(payload.get("frame_id"), 40))
        if frame is None:
            raise ValueError("grupo não encontrado")
        for key in ("x", "y", "w", "h"):
            if payload.get(key) is not None:
                frame[key] = payload[key]
        note["frames"] = [f for f in (normalize_frame(f) for f in note["frames"]) if f]
        _stamp(note)

    elif action == "move_frame":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        frame = _find(note["frames"], _text(payload.get("frame_id"), 40))
        if frame is None:
            raise ValueError("grupo não encontrado")
        dx = _clamp(payload.get("dx"), -BOARD_W, BOARD_W, 0)
        dy = _clamp(payload.get("dy"), -BOARD_H, BOARD_H, 0)
        members = [b for b in note["boxes"] if b["x"] >= frame["x"] and b["y"] >= frame["y"]
                   and b["x"] + b["w"] <= frame["x"] + frame["w"] and b["y"] + b["h"] <= frame["y"] + frame["h"]]
        frame["x"] = _clamp(frame["x"] + dx, 0, BOARD_W)
        frame["y"] = _clamp(frame["y"] + dy, 0, BOARD_H)
        for b in members:
            b["x"] = _clamp(b["x"] + dx, 0, BOARD_W)
            b["y"] = _clamp(b["y"] + dy, 0, BOARD_H)
        _stamp(note)

    elif action == "delete_frame":
        note = _find(notes, _text(payload.get("id"), 40))
        if note is None:
            raise ValueError("nota não encontrada")
        frame_id = _text(payload.get("frame_id"), 40)
        before = len(note["frames"])
        note["frames"] = [f for f in note["frames"] if f["id"] != frame_id]
        if len(note["frames"]) != before:
            _stamp(note)

    else:
        raise ValueError(f"ação inválida: {action}")

    new_box = data.pop("new_box", "")
    clean = normalize_notepad(data)
    save_notepad(clean)
    if new_box:
        clean["new_box"] = new_box
    return clean
