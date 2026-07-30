# -*- coding: utf-8 -*-
"""Registo de eventos (tracker.log)."""

import os
import threading
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
