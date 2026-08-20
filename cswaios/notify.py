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
import subprocess
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
    return {"url": url, "enabled": bool(cfg.get("enabled")) and bool(url),
            # avisos do Windows levantados pelo servidor (ver send_toast): não
            # precisam de webhook nenhum, e por isso são um interruptor à parte
            "toasts": bool(cfg.get("toasts"))}


def save_notify_config(url, enabled=True, toasts=None):
    url = str(url or "").strip()
    if url and not _host_ok(url):
        raise ValueError("endereço não aceite: só webhooks https do Teams ou do Slack")
    if toasts is None:
        toasts = load_notify_config().get("toasts")
    cfg = {"url": url, "enabled": bool(enabled) and bool(url),
           "toasts": bool(toasts)}
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


# ---------------------------------------------------------------------------
# Avisos do Windows levantados pelo SERVIDOR
#
# Os avisos do sistema que a app já tinha são do BROWSER (static/js/notify.js):
# só aparecem enquanto uma janela estiver aberta, ainda que em segundo plano.
# Fechada a janela, não há aviso nenhum — e é justamente aí que ele faria falta
# ("o cronómetro ficou a correr", "alguém mexeu na tua linha").
#
# Isto levanta um aviso do Windows 11 a partir do processo do servidor, com
# BOTÕES. Sem dependência nova: a app já corre `powershell -NoProfile` para cada
# escrita no Excel (ver excel.py) e o mesmo caminho serve o
# ToastNotificationManager. Os botões abrem um endereço da app no browser
# (activationType="protocol"), que é o que dispensa um programa a receber o
# clique.
#
# Desligado por omissão, como o webhook: um aviso do sistema é uma coisa que
# aparece por cima do que a pessoa está a fazer.

TOAST_APP_ID = "CSW.MyOrganizer"
TOAST_TIMEOUT = 20


def _toast_xml(title, text, buttons):
    """O XML do aviso. `buttons` é [(texto, url)] — no máximo dois."""
    def esc(valor):
        return (str(valor or "")
                .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace('"', "&quot;"))

    acoes = "".join(
        f'<action content="{esc(rotulo)}" activationType="protocol" '
        f'arguments="{esc(url)}"/>'
        for rotulo, url in (buttons or [])[:2])
    return ('<toast activationType="protocol" launch="' + esc(
        (buttons or [("", "")])[0][1]) + '">'
        '<visual><binding template="ToastGeneric">'
        f'<text>{esc(title)}</text><text>{esc(text)}</text>'
        '</binding></visual>'
        + (f"<actions>{acoes}</actions>" if acoes else "")
        + '</toast>')


def send_toast(text, title="", buttons=()):
    """Levanta um aviso do Windows. Devolve True se ele foi entregue.

    Nunca rebenta a app: um aviso que não sai é um aviso que não sai (o Windows
    pode ter as notificações desligadas, ou estar em Assistente de Foco).
    """
    if os.name != "nt" or not load_notify_config().get("toasts"):
        return False
    texto = str(text or "").strip()[:400]
    if not texto:
        return False
    xml = _toast_xml(title or "My Organizer", texto, buttons)
    # o XML vai por STDIN e não pela linha de comandos: uma linha de comandos
    # com aspas e acentos é a maneira mais fácil de isto falhar em silêncio
    script = (
        "$ErrorActionPreference='Stop';"
        "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications,"
        " ContentType = WindowsRuntime] | Out-Null;"
        "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument,"
        " ContentType = WindowsRuntime] | Out-Null;"
        "$xml = [Console]::In.ReadToEnd();"
        "$doc = New-Object Windows.Data.Xml.Dom.XmlDocument;"
        "$doc.LoadXml($xml);"
        "$toast = New-Object Windows.UI.Notifications.ToastNotification $doc;"
        f"[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("
        f"'{TOAST_APP_ID}').Show($toast)")
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            input=xml, capture_output=True, text=True, timeout=TOAST_TIMEOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return proc.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False
