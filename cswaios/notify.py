# -*- coding: utf-8 -*-
"""Avisos fora da app: um webhook (Teams/Slack) para quando ela está fechada.

Os cartões de aviso (static/js/notify.js) só aparecem com a app aberta à
frente. Quem passa o dia no Excel e no Teams perde-os. Aqui, se — e só se — o
utilizador configurar o endereço de um webhook, a app manda para lá uma linha
a dizer o que mudou nas linhas dele.

Nada disto acontece por omissão: sem endereço configurado não sai nada da
máquina. O endereço só pode ser escrito a partir do computador onde a app corre
(como o token do Jira e a conta do OneDrive) — ver /api/notify/config.
"""

import json
import os
import urllib.error
import urllib.request

from .config import HERE

NOTIFY_CONFIG_FILE = os.path.join(HERE, "notify_config.json")
# o que se aceita como destino: só HTTPS, e só os domínios dos serviços que
# isto serve. Um endereço qualquer escrito por engano (ou colado de outro
# sítio) deixaria de ser um aviso para passar a ser uma fuga de informação
ALLOWED_HOSTS = (".office.com", ".office365.com", ".microsoft.com",
                 ".webhook.office.com", "hooks.slack.com")
TIMEOUT = 10


def _host_ok(url):
    from urllib.parse import urlparse
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        return False
    host = parsed.hostname.lower()
    return any(host == h.lstrip(".") or host.endswith(h) for h in ALLOWED_HOSTS)


def load_notify_config():
    """{url, enabled} — {"url": "", "enabled": False} quando não há nada."""
    try:
        with open(NOTIFY_CONFIG_FILE, encoding="utf-8") as f:
            cfg = json.load(f)
    except (OSError, ValueError):
        cfg = {}
    if not isinstance(cfg, dict):
        cfg = {}
    url = str(cfg.get("url") or "").strip()
    return {"url": url, "enabled": bool(cfg.get("enabled")) and bool(url)}


def save_notify_config(url, enabled=True):
    url = str(url or "").strip()
    if url and not _host_ok(url):
        raise ValueError("endereço não aceite: só webhooks https do Teams ou do Slack")
    cfg = {"url": url, "enabled": bool(enabled) and bool(url)}
    with open(NOTIFY_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=1)
    return cfg


def send_webhook(text, title=""):
    """Manda uma linha para o webhook configurado. Devolve True se saiu.

    O corpo serve os dois serviços: o Teams lê `text`, o Slack lê `text`
    também — não se tenta nada mais elaborado (cartões, blocos), que muda de
    serviço para serviço e não acrescenta nada a um aviso de uma linha.
    """
    cfg = load_notify_config()
    if not cfg["enabled"]:
        return False
    texto = str(text or "").strip()[:1500]
    if not texto:
        return False
    if title:
        texto = f"**{str(title).strip()[:120]}**\n{texto}"
    body = json.dumps({"text": texto}).encode("utf-8")
    req = urllib.request.Request(cfg["url"], data=body, method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            resp.read()
        return True
    except urllib.error.HTTPError as exc:
        raise ValueError(f"o webhook respondeu {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise ValueError(f"não foi possível contactar o webhook: {exc.reason}") from exc
