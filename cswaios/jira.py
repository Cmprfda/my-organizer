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

# ids dos campos "Epic Link"/"Epic Name" (customfield_NNNNN, diferentes em cada
# instância do Jira) e nomes de epics já resolvidos - descobertos uma só vez
_EPIC_FIELDS = None
_EPIC_NAMES = {}


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


def _epic_fields():
    """(id do Epic Link, id do Epic Name) nesta instância; (None, None) se não houver.

    Uma falha (Jira sem Jira Software, sem permissão, offline) não fica em
    cache: o pedido seguinte volta a tentar.
    """
    global _EPIC_FIELDS
    if _EPIC_FIELDS is not None:
        return _EPIC_FIELDS
    try:
        fields = _request("/rest/api/2/field") or []
    except ValueError:
        return None, None
    link = name = None
    for field in fields:
        if not isinstance(field, dict):
            continue
        custom = str((field.get("schema") or {}).get("custom") or "")
        if custom.endswith("gh-epic-link"):
            link = field.get("id")
        elif custom.endswith("gh-epic-label"):
            name = field.get("id")
    _EPIC_FIELDS = (link, name)
    return _EPIC_FIELDS


def _epic_names(keys):
    """{chave do epic: nome}. Uma consulta só para todas as chaves ainda por saber."""
    wanted = [k for k in dict.fromkeys(keys) if k and KEY_RE.match(k)]
    missing = [k for k in wanted if k not in _EPIC_NAMES]
    if missing:
        _, name_id = _epic_fields()
        want_fields = ["summary"] + ([name_id] if name_id else [])
        body = _request("/rest/api/2/search", method="POST", body={
            "jql": "key in (" + ",".join(missing) + ")",
            "maxResults": len(missing), "fields": want_fields,
        }) or {}
        for issue in (body.get("issues") or []):
            got = issue.get("fields") or {}
            key = issue.get("key")
            if key:
                _EPIC_NAMES[key] = str((name_id and got.get(name_id))
                                       or got.get("summary") or "").strip()
        for key in missing:                 # epic apagado/sem permissão: não repetir
            _EPIC_NAMES.setdefault(key, "")
    return {k: _EPIC_NAMES.get(k, "") for k in wanted}


def _add_epics(items, raw_fields):
    """Acrescenta epicKey/epicName aos issues (nada acontece se o Jira não os der)."""
    link_id, _ = _epic_fields()
    if not link_id:
        return
    for item, fields in zip(items, raw_fields):
        epic = fields.get(link_id)
        if isinstance(epic, str) and epic.strip():
            item["epicKey"] = epic.strip()
    keys = [i["epicKey"] for i in items if i.get("epicKey")]
    if not keys:
        return
    try:
        names = _epic_names(keys)
    except ValueError:
        return                              # sem o nome, fica só a chave do epic
    for item in items:
        name = names.get(item.get("epicKey") or "")
        if name:
            item["epicName"] = name


def _issue_fields(link_id):
    return ["summary", "parent"] + ([link_id] if link_id else [])


def fetch_issue(key):
    """Confirma que a issue existe e devolve {key, summary, parentSummary, epic*}."""
    key = issue_key(key)
    link_id, _ = _epic_fields()
    want = ",".join(_issue_fields(link_id))
    body = _request(f"/rest/api/2/issue/{key}?fields={want}") or {}
    fields = body.get("fields") or {}
    parent = fields.get("parent") or {}
    out = {"key": body.get("key") or key, "summary": fields.get("summary") or ""}
    parent_summary = (parent.get("fields") or {}).get("summary")
    if parent_summary:
        out["parentSummary"] = parent_summary
    _add_epics([out], [fields])
    return out


def search_issues(text, limit=10):
    """Procura issues por palavras do resumo (ou pela chave).

    Devolve (resultados, ha_mais): `ha_mais` diz se o Jira tem mais do que
    `limit` correspondências — a app pede uma a mais só para o saber.
    """
    # só letras/números/espaços/-/_/. : o resto é sintaxe do JQL (aspas, ~, (),
    # etc.) e uma pesquisa escrita à mão não pode alterar a consulta
    text = re.sub(r"[^\w\s\-_.]", " ", str(text or ""), flags=re.UNICODE).strip()
    text = re.sub(r"\s+", " ", text)
    if len(text) < 2:
        return [], False
    limit = max(1, min(int(limit or 10), 50))
    clauses = [f'summary ~ "{text}"', f'text ~ "{text}"']
    if KEY_RE.match(text):
        clauses.insert(0, f'key = "{text.upper()}"')
    jql = "(" + " OR ".join(clauses) + ") ORDER BY updated DESC"
    link_id, _ = _epic_fields()
    body = _request("/rest/api/2/search", method="POST", body={
        "jql": jql, "maxResults": limit + 1, "fields": _issue_fields(link_id),
    }) or {}
    out, raw = [], []
    for issue in (body.get("issues") or []):
        fields = issue.get("fields") or {}
        item = {"key": issue.get("key") or "", "summary": fields.get("summary") or ""}
        if not item["key"]:
            continue
        parent_summary = ((fields.get("parent") or {}).get("fields") or {}).get("summary")
        if parent_summary:
            item["parentSummary"] = parent_summary
        out.append(item)
        raw.append(fields)
    more = len(out) > limit
    out, raw = out[:limit], raw[:limit]
    _add_epics(out, raw)
    return out, more


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
    result = result or {}
    return {"id": result.get("id"), "timeSpentSeconds": int(result.get("timeSpentSeconds") or 0)}


def issue_status(key):
    """Estado atual da issue: {key, status, statusCategory, assignee}.

    Serve o cartão do item, que mostra em que pé está a issue sem obrigar a ir
    ao Jira. `statusCategory` é a gaveta a que o Jira o atribui ("new",
    "indeterminate", "done") — é o que dá a cor, porque os NOMES dos estados
    mudam de projeto para projeto.
    """
    key = issue_key(key)
    body = _request(f"/rest/api/2/issue/{key}?fields=status,assignee,summary") or {}
    fields = body.get("fields") or {}
    status = fields.get("status") or {}
    categoria = (status.get("statusCategory") or {}).get("key") or ""
    atribuido = fields.get("assignee") or {}
    return {"key": body.get("key") or key,
            "summary": fields.get("summary") or "",
            "status": status.get("name") or "",
            "statusCategory": categoria,
            "assignee": atribuido.get("displayName") or ""}


def issue_transitions(key):
    """Passos disponíveis a partir do estado atual: [{id, name, to}].

    O Jira só deixa passar pelos caminhos definidos no fluxo do projeto, e são
    diferentes em cada um — por isso a lista é pedida em vez de adivinhada.
    """
    key = issue_key(key)
    body = _request(f"/rest/api/2/issue/{key}/transitions") or {}
    out = []
    for tr in (body.get("transitions") or []):
        tid = str(tr.get("id") or "")
        if not tid:
            continue
        out.append({"id": tid, "name": tr.get("name") or "",
                    "to": ((tr.get("to") or {}).get("name") or "")})
    return out


def transition_issue(key, transition_id):
    """Faz a issue avançar por um dos passos de issue_transitions.

    Devolve o estado em que ela ficou (relido do Jira, não adivinhado a partir
    do passo: uma transição pode ter pós-funções que a levem mais longe).
    """
    key = issue_key(key)
    transition_id = str(transition_id or "").strip()
    if not transition_id.isdigit():
        raise ValueError("passo inválido")
    _request(f"/rest/api/2/issue/{key}/transitions", method="POST",
             body={"transition": {"id": transition_id}})
    return issue_status(key)


def list_projects(limit=50):
    """Projetos onde se pode criar issues: [{key, name}]."""
    body = _request("/rest/api/2/issue/createmeta?expand=projects.issuetypes") or {}
    out = []
    for proj in (body.get("projects") or [])[:max(1, int(limit or 50))]:
        chave = str(proj.get("key") or "")
        if not chave:
            continue
        tipos = [{"id": str(t.get("id") or ""), "name": t.get("name") or "",
                  "subtask": bool(t.get("subtask"))}
                 for t in (proj.get("issuetypes") or []) if t.get("id")]
        out.append({"key": chave, "name": proj.get("name") or chave,
                    "types": [t for t in tipos if not t["subtask"]]})
    return out


def create_issue(project, summary, issue_type="Task", description=""):
    """Cria uma issue e devolve {key, summary} — o mesmo formato do fetch_issue,
    para o item do quadro a poder ligar sem mais nada.

    O tipo vai por nome ("Task", "Bug"): é o que o utilizador escolhe da lista
    que o list_projects trouxe, e o Jira aceita nome ou id.
    """
    project = str(project or "").strip().upper()
    summary = str(summary or "").strip()[:250]
    issue_type = str(issue_type or "Task").strip() or "Task"
    if not project:
        raise ValueError("projeto por indicar")
    if not summary:
        raise ValueError("resumo por escrever")
    campos = {"project": {"key": project},
              "summary": summary,
              "issuetype": {"name": issue_type}}
    descricao = str(description or "").strip()
    if descricao:
        campos["description"] = descricao[:4000]
    body = _request("/rest/api/2/issue", method="POST", body={"fields": campos}) or {}
    chave = body.get("key")
    if not chave:
        raise ValueError("o Jira não devolveu a chave da issue criada")
    return {"key": chave, "summary": summary}
