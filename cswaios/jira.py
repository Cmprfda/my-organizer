# -*- coding: utf-8 -*-
"""Integração com Jira: configuração (URL + token), consulta de issues e leitura/registo de esforço (worklogs)."""

import json
import os
import re
import urllib.error
import urllib.request

from .config import HERE

JIRA_CONFIG_FILE = os.path.join(HERE, "jira_config.json")

# chaves de issue são do tipo PROJ-123; recusar o resto evita que um texto
# escrito pelo utilizador acabe a mudar o caminho/query do pedido ao Jira
KEY_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*-\d+$")


def load_jira_config():
    try:
        with open(JIRA_CONFIG_FILE, encoding="utf-8") as f:
            cfg = json.load(f)
            if isinstance(cfg, dict) and cfg.get("baseUrl") and cfg.get("token"):
                return cfg
    except (OSError, ValueError):
        pass
    return None


def save_jira_config(base_url, token):
    base_url = str(base_url or "").strip().rstrip("/")
    token = str(token or "").strip()
    if not base_url or not token:
        raise ValueError("URL e token são obrigatórios")
    if not base_url.lower().startswith(("http://", "https://")):
        raise ValueError("o URL do Jira tem de começar por http:// ou https://")
    cfg = {"baseUrl": base_url, "token": token}
    with open(JIRA_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=1)
    return cfg


def issue_key(key):
    """Normaliza e valida a chave da issue (ex.: proj-12 -> PROJ-12)."""
    key = str(key or "").strip().upper()
    if not key:
        raise ValueError("chave da issue vazia")
    if not KEY_RE.match(key):
        raise ValueError(f"chave de issue inválida: {key[:30]}")
    return key


def _request(path, method="GET", body=None):
    cfg = load_jira_config()
    if not cfg:
        raise ValueError("Jira não está configurado (define o URL e o token em Definições)")
    url = cfg["baseUrl"] + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {cfg['token']}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        # sem isto alguns proxies/WAF corporativos bloqueiam o "Python-urllib/x.y"
        # por omissão (devolvem 403 antes mesmo de chegar ao Jira)
        "User-Agent": "Mozilla/5.0 (compatible; MyOrganizer-CSWAIOS/1.0)",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            payload = json.loads(raw) if raw else {}
        except ValueError:
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        msg = (payload.get("errorMessages") or [None])[0]
        if not msg:
            # sem JSON de erro do Jira - normalmente um proxy/WAF ou uma página
            # de login a bloquear o pedido antes de chegar ao Jira; o início do
            # corpo ajuda a perceber o que respondeu de facto
            snippet = re.sub(r"\s+", " ", raw).strip()[:160]
            msg = f"o Jira devolveu {exc.code}" + (f" ({snippet})" if snippet else "")
        raise ValueError(msg) from exc
    except urllib.error.URLError as exc:
        raise ValueError(f"não foi possível contactar o Jira: {exc.reason}") from exc


def fetch_issue(key):
    """Confirma que a issue existe e devolve {key, summary, parentSummary}."""
    key = issue_key(key)
    body = _request(f"/rest/api/2/issue/{key}?fields=summary,parent") or {}
    fields = body.get("fields") or {}
    parent = fields.get("parent") or {}
    out = {"key": body.get("key") or key, "summary": fields.get("summary") or ""}
    parent_summary = (parent.get("fields") or {}).get("summary")
    if parent_summary:
        out["parentSummary"] = parent_summary
    return out


def log_work(key, time_spent, started, comment=None):
    """Cria um worklog na issue (esforço registado mesmo no Jira)."""
    key = issue_key(key)
    time_spent = str(time_spent or "").strip()
    started = str(started or "").strip()
    if not time_spent or not started:
        raise ValueError("tempo gasto e data de início são obrigatórios")
    body = {"timeSpent": time_spent, "started": started}
    if comment:
        body["comment"] = str(comment).strip()
    result = _request(f"/rest/api/2/issue/{key}/worklog", method="POST", body=body)
    return {"id": (result or {}).get("id")}


GET_LOGGED_SECONDS_MAX_PAGES = 20  # 20x maxResults=1000 já é bem mais do que qualquer issue real tem


def get_logged_seconds(key):
    """Soma timeSpentSeconds de todos os worklogs da issue (com paginação)."""
    key = issue_key(key)
    total_seconds = 0
    start_at = 0
    for _ in range(GET_LOGGED_SECONDS_MAX_PAGES):
        body = _request(f"/rest/api/2/issue/{key}/worklog?startAt={start_at}&maxResults=1000") or {}
        worklogs = body.get("worklogs") or []
        for w in worklogs:
            try:
                total_seconds += int((w or {}).get("timeSpentSeconds") or 0)
            except (TypeError, ValueError):
                pass
        if not worklogs:
            break
        start_at += len(worklogs)
        try:
            total = int(body.get("total", start_at))
        except (TypeError, ValueError):
            total = start_at
        # se o Jira ignorar startAt e devolver sempre a mesma página, `total`
        # nunca desce para o que já foi somado — sem isto ficaria a andar às
        # voltas para sempre em vez de aceitar o que já tem
        if start_at >= total:
            break
    return total_seconds
