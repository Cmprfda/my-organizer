# -*- coding: utf-8 -*-
"""Registo de eventos (tracker.log)."""

import os
import threading
import traceback
from datetime import datetime

from .config import HERE

LOG_FILE = os.path.join(HERE, "tracker.log")
_log_lock = threading.Lock()


def log_event(message):
    line = f"[{datetime.now():%d/%m %H:%M:%S}] {message}"
    print(line, flush=True)
    with _log_lock:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")


def install_crash_logging():
    """Regista no tracker.log qualquer excecao nao tratada numa thread em
    segundo plano (servidor, warm_cache, etc.) -- sem isto, essas mortes
    sao invisiveis quando a app corre sem consola (atalho "My Organizer")."""
    def _hook(args):
        detalhe = "".join(traceback.format_exception(
            args.exc_type, args.exc_value, args.exc_traceback))
        nome = args.thread.name if args.thread else "?"
        log_event(f"thread '{nome}' morreu com excecao nao tratada:\n{detalhe.strip()}")
    threading.excepthook = _hook


def trim_log():
    """Mantém o ficheiro de log com um tamanho razoável (corre no arranque)."""
    try:
        if os.path.getsize(LOG_FILE) > 512 * 1024:
            with open(LOG_FILE, encoding="utf-8") as f:
                lines = f.readlines()
            with open(LOG_FILE, "w", encoding="utf-8") as f:
                f.writelines(lines[-500:])
    except OSError:
        pass
