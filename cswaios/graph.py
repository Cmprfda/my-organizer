# -*- coding: utf-8 -*-
"""Fonte "web": livro do OneDrive/SharePoint pela Microsoft Graph."""

import base64
import hashlib
import http.client
import json
import os
import re
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from .config import HERE
from .logs import log_event
from .text import normalize

GRAPH_PATH = "onedrive:web"          # "caminho" virtual da fonte web sem livro indicado
GRAPH_PATH_PREFIX = "onedrive:"      # prefixo de qualquer "caminho" da fonte web
GRAPH_CONFIG_FILE = os.path.join(HERE, "graph_config.json")
GRAPH_CONFIG_EXAMPLE = os.path.join(HERE, "graph_config.example.json")
GRAPH_TOKEN_FILE = os.path.join(HERE, "graph_token.json")
GRAPH_BOOKS_FILE = os.path.join(HERE, "workbooks.json")   # livro atual + recentes
BOOK_EXTS = (".xlsx", ".xlsm")
# offline_access = refresh token (não obriga a autenticar em cada arranque)
GRAPH_SCOPE = "offline_access Files.ReadWrite.All Sites.ReadWrite.All"
# Cliente público da Azure CLI, pré-autorizado nos tenants empresariais: é o
# único que autentica sem aprovação de administrador (o "Microsoft Graph
# Command Line Tools", 14d82eec-…, exige consentimento de admin nesta
# organização). Com este cliente os âmbitos têm de ser pedidos como ".default".
GRAPH_DEFAULT_CLIENT_ID = "04b07795-8ddb-461a-bbee-02f9e1bf7b46"
GRAPH_DEFAULT_SCOPES = "https://graph.microsoft.com/.default"

_graph_lock = threading.Lock()
_graph_login = {}      # estado do device code flow em curso
_account_probed = threading.Event()   # já se tentou descobrir a conta ligada
_graph_item = None     # (drive_id, item_id) resolvido a partir do URL do ficheiro
_graph_source = ""     # de onde veio o último token: "device" ou "cli"
_cli_token = {"token": "", "expires_at": 0.0}
_share_cache = {}      # link de partilha -> (drive_id, item_id) da pasta


class GraphError(Exception):
    """Falha a falar com a Microsoft Graph (rede, sessão ou configuração)."""


def ensure_graph_config():
    """Primeiro arranque numa instalação nova: cria o `graph_config.json` a
    partir do exemplo que vem na release, para o utilizador só ter de carregar
    em "Ligar". As chaves de documentação (`_comment`, `_alternativas`) ficam
    de fora."""
    if os.path.exists(GRAPH_CONFIG_FILE):
        return False
    try:
        with open(GRAPH_CONFIG_EXAMPLE, encoding="utf-8-sig") as f:
            cfg = json.load(f)
    except (OSError, ValueError):
        return False
    if not isinstance(cfg, dict):
        return False
    cfg = {k: v for k, v in cfg.items() if not k.startswith("_")}
    try:
        with open(GRAPH_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=4)
    except OSError as exc:
        log_event(f"nao foi possivel criar o graph_config.json: {exc}")
        return False
    log_event("graph_config.json criado a partir do exemplo (primeira instalacao)")
    return True


def graph_config():
    """Configuração local da fonte web. O acesso ao OneDrive está sempre
    disponível (o livro é escolhido na app); o ficheiro `graph_config.json`
    serve para indicar um livro por omissão e afinar a autenticação."""
    try:
        with open(GRAPH_CONFIG_FILE, encoding="utf-8-sig") as f:
            cfg = json.load(f)
    except (OSError, ValueError):
        cfg = {}
    if not isinstance(cfg, dict):
        cfg = {}
    for key in ("file_url", "site_url", "onedrive_url"):
        if cfg.get(key) and not str(cfg[key]).lower().startswith("https://"):
            cfg.pop(key)   # só aceita ligações cifradas
    cfg.setdefault("file_name", "")
    if not cfg.get("client_id"):
        cfg["client_id"] = GRAPH_DEFAULT_CLIENT_ID
    # âmbitos explícitos só funcionam com um cliente registado pela organização;
    # com o cliente por omissão (Azure CLI) tem de ser ".default"
    cfg.setdefault("scopes", GRAPH_DEFAULT_SCOPES
                   if cfg["client_id"] == GRAPH_DEFAULT_CLIENT_ID else GRAPH_SCOPE)
    cfg.setdefault("use_azure_cli", True)
    cfg.setdefault("tenant_id", "organizations")
    cfg.setdefault("authority", "https://login.microsoftonline.com")
    cfg.setdefault("graph_base", "https://graph.microsoft.com/v1.0")
    return cfg


def save_onedrive_root(url):
    """Grava (ou remove, com url vazio) o OneDrive/site extra a seguir na
    navegação — ao contrário do `site_url`, que só vem do graph_config.json da
    instalação, este é escolhido pelo próprio utilizador nas Definições
    (ex.: o OneDrive de um colega, quando o livro vive lá)."""
    url = str(url or "").strip().rstrip("/")
    if url and not url.lower().startswith("https://"):
        raise ValueError("o URL tem de começar por https://")
    try:
        with open(GRAPH_CONFIG_FILE, encoding="utf-8-sig") as f:
            cfg = json.load(f)
    except (OSError, ValueError):
        cfg = {}
    if not isinstance(cfg, dict):
        cfg = {}
    if url:
        cfg["onedrive_url"] = url
    else:
        cfg.pop("onedrive_url", None)
    with open(GRAPH_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=4)
    log_event(f"OneDrive extra definido nas Definições: {url or '(removido)'}")
    return url


def load_books():
    """Livro em uso e lista de recentes (ficheiro local, sem segredos)."""
    try:
        with open(GRAPH_BOOKS_FILE, encoding="utf-8-sig") as f:
            data = json.load(f)
    except (OSError, ValueError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    current = data.get("current") if isinstance(data.get("current"), dict) else None
    recent = [b for b in data.get("recent", [])
              if isinstance(b, dict) and b.get("drive_id") and b.get("item_id")]
    if current and not (current.get("drive_id") and current.get("item_id")):
        current = None
    return {"current": current, "recent": recent[:12]}


def save_books(books):
    with open(GRAPH_BOOKS_FILE, "w", encoding="utf-8") as f:
        json.dump(books, f, ensure_ascii=False, indent=2)


def graph_path_for(drive_id, item_id):
    """"Caminho" virtual de um livro concreto do OneDrive. É a identidade que
    distingue livros diferentes nas caches e nas chaves dos overrides/notas —
    sem isto, dois livros abertos ao mesmo tempo partilhavam tudo."""
    return f"{GRAPH_PATH_PREFIX}{drive_id}:{item_id}"


def is_graph_path(path):
    """True se o "caminho" identificar a fonte web (com ou sem livro)."""
    return bool(path) and str(path).startswith(GRAPH_PATH_PREFIX)


def graph_ids_from_path(path):
    """(drive_id, item_id) contidos num "caminho" da fonte web. Vazios no
    GRAPH_PATH legado, em que o livro é o que estiver escolhido na app."""
    if not is_graph_path(path) or path == GRAPH_PATH:
        return "", ""
    rest = str(path)[len(GRAPH_PATH_PREFIX):]
    drive_id, _, item_id = rest.partition(":")
    return drive_id, item_id


def current_book():
    return load_books()["current"]


def has_book(book=None):
    """True se houver um livro para ler: o indicado, o escolhido na app ou o da
    configuração."""
    if book is not None:
        return bool(book.get("drive_id") and book.get("item_id"))
    if current_book():
        return True
    cfg = graph_config()
    return bool(cfg and (cfg.get("file_url") or (cfg.get("drive_id") and cfg.get("item_id"))
                         or (cfg.get("site_url") and cfg.get("file_name"))))


def _http_json(url, data=None, headers=None, method=None, as_json=False):
    """Pedido HTTP que devolve JSON. Em erro HTTP devolve o corpo com `_status`.
    Sem `as_json`, um dicionário num POST vai em formulário (endpoints OAuth)."""
    headers = dict(headers or {})
    if isinstance(data, dict) and not as_json and method in (None, "POST"):
        body = urllib.parse.urlencode(data).encode()
        headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
    elif data is not None:
        body = json.dumps(data).encode()
        headers.setdefault("Content-Type", "application/json")
    else:
        body = None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            out = json.loads(raw)
        except ValueError:
            out = {"error_description": raw[:300]}
        if not isinstance(out, dict):
            out = {"error_description": str(out)[:300]}
        out["_status"] = exc.code
        return out
    except urllib.error.URLError as exc:
        raise GraphError(f"sem ligação: {exc.reason}")
    except (OSError, http.client.HTTPException) as exc:
        # a ligação morreu com o pedido já a caminho (SSL cortado a meio,
        # ligação reposta pelo outro lado, timeout a ler a resposta). Não é um
        # URLError: sem isto subia crua até quem pediu os dados, que respondia
        # "erro interno" em vez de "sem rede" — era assim que uma falha de rede
        # de um segundo dava erro 500 em /api/tasks
        raise GraphError(f"sem ligação: {exc}")
    return json.loads(raw) if raw.strip() else {}


def _graph_load_tokens():
    try:
        with open(GRAPH_TOKEN_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_tokens(tokens):
    """Escreve o ficheiro da sessão, legível só pelo dono. Devolve False se não
    tiver conseguido escrever."""
    try:
        with open(GRAPH_TOKEN_FILE, "w", encoding="utf-8") as f:
            json.dump(tokens, f)
    except OSError as exc:
        log_event(f"nao foi possivel guardar a sessao do OneDrive: {exc}")
        return False
    try:
        os.chmod(GRAPH_TOKEN_FILE, 0o600)
    except OSError:
        pass
    return True


def _graph_save_tokens(out, account=None):
    """Guarda os tokens localmente (nunca são registados no log nem enviados
    para o browser). Junta-lhes o email/nome da conta — descrevem exatamente
    estes tokens, por isso ficam no mesmo ficheiro."""
    old = _graph_load_tokens()
    # a Microsoft nem sempre devolve um refresh token novo na renovação; se o
    # apagássemos, a sessão morria no fim da hora seguinte e obrigava a
    # autenticar outra vez à mão (era o que acontecia até aqui)
    tokens = {"access_token": out.get("access_token", ""),
              "refresh_token": out.get("refresh_token") or old.get("refresh_token", ""),
              "expires_at": time.time() + int(out.get("expires_in", 3600))}
    email = str((account or {}).get("email") or "") or str(old.get("account_email") or "")
    name = str((account or {}).get("name") or "") or str(old.get("account_name") or "")
    if email:
        tokens["account_email"] = email
    if name:
        tokens["account_name"] = name
    _write_tokens(tokens)
    return tokens


def _graph_forget_tokens():
    """Esquece os tokens, mas guarda o email da conta (não é um segredo): é
    justamente quando a sessão morre que ele faz falta, para o login seguinte
    já vir preenchido com a conta certa em vez de uma lista vazia."""
    account = _graph_load_tokens()
    email = str(account.get("account_email") or "")
    name = str(account.get("account_name") or "")
    if (email or name) and _write_tokens({"account_email": email, "account_name": name}):
        return
    try:
        os.remove(GRAPH_TOKEN_FILE)
    except OSError:
        pass


def remembered_account():
    """Conta Microsoft usada da última vez (email/nome), se for conhecida.
    Não prova que a sessão esteja viva — só serve para a mostrar na interface
    e para pré-preencher o login seguinte. Sem nenhuma sessão anterior vale o
    email escrito à mão nas Definições (`login_email`): é justamente quem nunca
    se ligou aqui que ganha em ver a lista de contas já escolhida."""
    tokens = _graph_load_tokens()
    email = str(tokens.get("account_email") or "")
    if not email:
        email = str(graph_config().get("login_email") or "")
    return {"email": email, "name": str(tokens.get("account_name") or "")}


def login_hint():
    """Conta a pré-escolher no login. O email escrito à mão nas Definições
    ganha ao da última sessão: é uma escolha explícita de quem quer autenticar
    com outra conta (a lista da Microsoft continua a permitir mudar)."""
    return (str(graph_config().get("login_email") or "")
            or remembered_account()["email"])


def had_login():
    """True se alguma vez houve um login desta app neste computador (ficou
    sessão ou, ao menos, a conta que a fez). É o que distingue "a sessão caiu,
    posso religar sozinho" de "nunca ninguém se ligou" — a app nunca abre o
    browser por si na primeira vez."""
    tokens = _graph_load_tokens()
    return bool(tokens.get("refresh_token") or tokens.get("account_email"))


def has_session():
    """True enquanto houver refresh token guardado: a sessão renova-se sozinha
    no servidor e não é preciso pedir nada ao utilizador. Um pedido falhado por
    falta de rede deixa isto a True — só uma sessão revogada/expirada pela
    Microsoft (`_graph_own_token`) é que o apaga."""
    return bool(_graph_load_tokens().get("refresh_token"))


def save_login_email(email):
    """Grava (ou remove, com vazio) o email da conta Microsoft a usar no login,
    escolhido nas Definições. Serve para o `login_hint`: a lista de contas da
    Microsoft aparece já com esta escolhida, sem obrigar a procurá-la. Não é um
    segredo nem dá acesso a nada por si — os tokens continuam à parte."""
    email = str(email or "").strip()
    if email and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise ValueError("email inválido")
    try:
        with open(GRAPH_CONFIG_FILE, encoding="utf-8-sig") as f:
            cfg = json.load(f)
    except (OSError, ValueError):
        cfg = {}
    if not isinstance(cfg, dict):
        cfg = {}
    if email:
        cfg["login_email"] = email
    else:
        cfg.pop("login_email", None)
    with open(GRAPH_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=4)
    log_event(f"conta do OneDrive definida nas Definições: {email or '(removida)'}")
    return email


def _graph_account_info(cfg, token):
    """Email/nome de quem acabou de autenticar (`/me`). Uma falha aqui (rede,
    permissão) nunca pode estragar o login: devolve simplesmente {}."""
    if not token:
        return {}
    try:
        out = _http_json(f"{cfg['graph_base']}/me"
                         "?$select=mail,userPrincipalName,displayName",
                         headers={"Authorization": f"Bearer {token}"})
    except (GraphError, ValueError, OSError):
        return {}
    if not isinstance(out, dict) or out.get("_status", 200) >= 400:
        return {}
    return {"email": str(out.get("mail") or out.get("userPrincipalName") or "").strip(),
            "name": str(out.get("displayName") or "").strip()}


def _graph_remember_account(account):
    """Guarda o email/nome da conta sem mexer nos tokens que lá estão."""
    email = str((account or {}).get("email") or "")
    name = str((account or {}).get("name") or "")
    if not email and not name:
        return
    with _graph_lock:
        tokens = _graph_load_tokens()
        if not tokens:
            return          # sessão apagada entretanto: nada a anotar
        tokens["account_email"] = email
        tokens["account_name"] = name
        _write_tokens(tokens)


def _probe_account_async(cfg):
    """Descobre a conta de uma sessão que já existia antes desta versão (quem
    nunca voltou ao login interativo não tem o email guardado). Corre em
    segundo plano para não atrasar a resposta à interface, e uma vez só por
    arranque para não repetir o pedido se falhar."""
    if _account_probed.is_set():
        return
    _account_probed.set()

    def work():
        try:
            token = graph_token(cfg)
            if token:
                _graph_remember_account(_graph_account_info(cfg, token))
        except Exception:
            pass          # é um extra: nunca pode fazer barulho

    threading.Thread(target=work, daemon=True).start()


def azure_cli_token():
    """Token da Graph emprestado por uma sessão Microsoft que já exista neste
    PC, através da Azure CLI (`az login`). Evita ter de registar uma aplicação
    no Azure. Devolve None se a CLI não estiver instalada ou sem sessão.

    (Não é possível reaproveitar a sessão do Edge: o browser guarda cookies
    cifrados com a conta do Windows, não um token para a Graph.)"""
    if _cli_token["expires_at"] > time.time() + 60:
        return _cli_token["token"]
    exe = shutil.which("az")
    if not exe:
        return None
    try:
        proc = subprocess.run(
            [exe, "account", "get-access-token", "--resource",
             "https://graph.microsoft.com", "--output", "json"],
            capture_output=True, timeout=90)
        if proc.returncode != 0:
            return None
        out = json.loads(proc.stdout.decode("utf-8", errors="replace"))
    except Exception:
        return None      # sem sessão, CLI antiga, timeout — segue-se sem token
    token = out.get("accessToken")
    if not token:
        return None
    try:
        expires = float(out.get("expires_on") or 0)
    except (TypeError, ValueError):
        expires = 0.0
    _cli_token["token"] = token
    _cli_token["expires_at"] = expires or (time.time() + 300)
    return token


def _graph_own_token(cfg):
    """Token obtido pelo login por código desta app (graph_token.json)."""
    with _graph_lock:
        tokens = _graph_load_tokens()
        if tokens.get("access_token") and tokens.get("expires_at", 0) > time.time() + 60:
            return tokens["access_token"]
        if not tokens.get("refresh_token") or not cfg.get("client_id"):
            return None
        try:
            out = _http_json(f"{cfg['authority']}/{cfg['tenant_id']}/oauth2/v2.0/token",
                             {"client_id": cfg["client_id"], "grant_type": "refresh_token",
                              "refresh_token": tokens["refresh_token"], "scope": cfg["scopes"]})
        except GraphError:
            return None   # sem rede agora — tenta de novo no próximo pedido, mantém o refresh token
        if not out.get("access_token"):
            # só esquece o refresh token quando a Microsoft diz mesmo que a sessão
            # morreu (revogada/expirada); uma falha temporária do lado deles
            # (5xx, throttling) não pode obrigar a nova autenticação
            if out.get("error") in ("invalid_grant", "interaction_required"):
                _graph_forget_tokens()      # guarda o email para o próximo login
                log_event("sessão do OneDrive expirou - é preciso ligar outra vez")
            return None
        return _graph_save_tokens(out)["access_token"]


def graph_token(cfg=None):
    """Access token válido para a Graph: primeiro o desta app, senão o
    emprestado pela Azure CLI. None = é preciso o utilizador ligar-se."""
    global _graph_source
    cfg = cfg or graph_config()
    if not cfg:
        return None
    token = _graph_own_token(cfg)
    if token:
        _graph_source = "device"
        return token
    if cfg.get("use_azure_cli"):
        token = azure_cli_token()
        if token:
            _graph_source = "cli"
            return token
    _graph_source = ""
    return None


def _b64url(raw):
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


class _RedirectHandler(BaseHTTPRequestHandler):
    """Recebe o retorno do login da Microsoft no endereço local."""

    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        if "code" in query or "error" in query:
            self.server.auth_result = {k: v[0] for k, v in query.items()}
            body = "Autenticação concluída. Já podes fechar este separador."
        else:
            body = "À espera do retorno da Microsoft..."
        data = f"<!doctype html><meta charset='utf-8'><body style='font-family:sans-serif'>{body}</body>".encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


def graph_login_start():
    """Inicia a autenticação. Por omissão abre o browser (authorization code +
    PKCE); com "login_mode": "device" usa o código de dispositivo."""
    cfg = graph_config()
    if not cfg:
        raise GraphError("acesso web não configurado (falta graph_config.json)")
    if not cfg.get("client_id"):
        raise GraphError("falta o client_id em graph_config.json (ou usa 'az login')")
    if cfg.get("login_mode") == "device":
        return _graph_login_device(cfg)
    return _graph_login_browser(cfg)


def _graph_login_browser(cfg):
    """Login interativo no browser: o token chega a um endereço local.

    O dia-a-dia não passa por aqui: o refresh token guardado renova a sessão
    sozinho e sem browser (ver `_graph_own_token`). Isto só volta a ser
    preciso quando esse refresh token morre mesmo (revogado, 90 dias sem uso,
    novas regras de acesso do tenant) — e aí a Microsoft exige interação do
    utilizador, que não se pode contornar sem um segredo de aplicação ou sem
    enfraquecer o fluxo. O que se pode fazer é poupar-lhe trabalho: com o
    email da última conta a lista de contas já vem escolhida (`login_hint`).
    (Um pedido silencioso `prompt=none` não ajudaria: a sessão da Microsoft
    vive nos cookies do browser, a que a app não tem acesso.)"""
    verifier = _b64url(os.urandom(40))
    challenge = _b64url(hashlib.sha256(verifier.encode("ascii")).digest())
    state = _b64url(os.urandom(16))
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _RedirectHandler)
    srv.auth_result = None
    redirect = f"http://localhost:{srv.server_port}/"
    params = {"client_id": cfg["client_id"], "response_type": "code",
              "response_mode": "query", "redirect_uri": redirect,
              "scope": cfg["scopes"], "state": state,
              "code_challenge": challenge, "code_challenge_method": "S256",
              "prompt": "select_account"}
    hint = login_hint()
    if hint:
        # continua a mostrar a lista de contas (permite trocar de conta), mas
        # já com esta escolhida
        params["login_hint"] = hint
    url = (f"{cfg['authority']}/{cfg['tenant_id']}/oauth2/v2.0/authorize?"
           + urllib.parse.urlencode(params))
    _graph_login.clear()
    _graph_login.update({"user_code": "", "url": url, "expires": time.time() + 300,
                         "done": False, "error": ""})
    threading.Thread(target=_graph_wait_redirect,
                     args=(cfg, srv, verifier, state, redirect), daemon=True).start()
    # abrir pelo próprio servidor (não pelo browser do cliente, com window.open):
    # assim funciona também quando o pedido de login vem sozinho, sem nenhum
    # clique — um separador novo aberto por JS sem gesto do utilizador é
    # bloqueado como popup, isto não
    webbrowser.open(url)
    log_event("ligação ao OneDrive: à espera da autenticação no browser")
    return graph_state()


def _graph_wait_redirect(cfg, srv, verifier, state, redirect):
    deadline = time.time() + 300
    srv.timeout = 5
    try:
        while time.time() < deadline and not srv.auth_result:
            srv.handle_request()          # devolve por timeout se nada chegar
        got = srv.auth_result
    finally:
        srv.server_close()
    if not got:
        _graph_login.update({"done": True, "error": "a autenticação expirou"})
        return
    if got.get("state") != state:
        _graph_login.update({"done": True, "error": "resposta inesperada (state)"})
        return
    if got.get("error"):
        detail = got.get("error_description") or got["error"]
        _graph_login.update({"done": True, "error": detail.replace("\r\n", " ")[:200]})
        log_event(f"ligação ao OneDrive falhou ({got['error']})")
        return
    out = _http_json(f"{cfg['authority']}/{cfg['tenant_id']}/oauth2/v2.0/token",
                     {"client_id": cfg["client_id"], "grant_type": "authorization_code",
                      "code": got["code"], "redirect_uri": redirect,
                      "code_verifier": verifier, "scope": cfg["scopes"]})
    if not out.get("access_token"):
        detail = out.get("error_description") or out.get("error") or "falhou"
        _graph_login.update({"done": True, "error": str(detail).replace("\r\n", " ")[:200]})
        log_event("ligação ao OneDrive falhou (troca do código)")
        return
    # fica a saber-se qual é a conta: aparece nas Definições e pré-preenche o
    # próximo login. Fora do lock (é um pedido de rede) e sem poder falhar o
    # login por causa disto
    account = _graph_account_info(cfg, out.get("access_token", ""))
    with _graph_lock:
        _graph_save_tokens(out, account)
    _account_probed.set()      # a conta acabou de ser lida, não é preciso sondar
    _graph_login.update({"done": True, "error": ""})
    log_event("ligação ao OneDrive estabelecida"
              + (f" (conta {account['email']})" if account.get("email") else ""))


def _graph_login_device(cfg):
    """Alternativa: código de dispositivo (pode ser bloqueado por políticas)."""
    out = _http_json(f"{cfg['authority']}/{cfg['tenant_id']}/oauth2/v2.0/devicecode",
                     {"client_id": cfg["client_id"], "scope": cfg["scopes"]})
    if not out.get("device_code"):
        raise GraphError(str(out.get("error_description") or "não consegui iniciar a ligação")[:200])
    _graph_login.clear()
    _graph_login.update({
        "user_code": out.get("user_code", ""),
        "url": out.get("verification_uri") or "https://microsoft.com/devicelogin",
        "expires": time.time() + int(out.get("expires_in", 900)),
        "done": False, "error": ""})
    threading.Thread(target=_graph_poll_login, args=(cfg, out), daemon=True).start()
    log_event("ligação ao OneDrive: à espera da autenticação do utilizador")
    return graph_state()


def _graph_poll_login(cfg, device):
    interval = max(int(device.get("interval", 5)), 1)
    deadline = time.time() + int(device.get("expires_in", 900))
    url = f"{cfg['authority']}/{cfg['tenant_id']}/oauth2/v2.0/token"
    while time.time() < deadline:
        time.sleep(interval)
        out = _http_json(url, {"client_id": cfg["client_id"],
                               "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                               "device_code": device["device_code"]})
        if out.get("access_token"):
            account = _graph_account_info(cfg, out.get("access_token", ""))
            with _graph_lock:
                _graph_save_tokens(out, account)
            _account_probed.set()
            _graph_login.update({"done": True, "error": ""})
            log_event("ligação ao OneDrive estabelecida")
            return
        err = out.get("error", "")
        if err == "authorization_pending":
            continue
        if err == "slow_down":
            interval += 5
            continue
        _graph_login.update({"done": True, "error": str(err or "falhou")[:120]})
        log_event(f"ligação ao OneDrive falhou ({err})")
        return
    _graph_login.update({"done": True, "error": "o código expirou"})


def graph_logout():
    """Termina a sessão. O email da conta fica guardado (não é um segredo) para
    a religação seguinte já vir com a conta escolhida; a lista de contas da
    Microsoft continua a permitir mudar de conta."""
    global _graph_item
    # com o lock: uma renovação em curso (_graph_own_token) não pode voltar a
    # escrever tokens novos por cima do logout (ficaria "religado" sozinho)
    with _graph_lock:
        _graph_forget_tokens()
    _graph_login.clear()
    _cli_token.update({"token": "", "expires_at": 0.0})
    _graph_item = None
    log_event("sessão do OneDrive terminada")


def graph_state():
    """Estado para a UI: configurado / ligado / código pendente / livro
    escolhido. Nunca inclui tokens."""
    cfg = graph_config()
    book = current_book()
    state = {"configured": bool(cfg), "connected": False, "method": "",
             "can_login": bool(cfg and cfg.get("client_id")),
             "code": "", "url": "", "pending": False, "error": "",
             "book": book.get("name", "") if book else "",
             "book_path": book.get("path", "") if book else "",
             "has_book": has_book(), "onedrive_url": cfg.get("onedrive_url", ""),
             # sessão guardada (renova-se sozinha) e login já feito alguma vez:
             # é com isto que a interface decide se vale a pena religar sozinha
             # — sem estas duas, uma falha de rede passava por "sessão caída" e
             # abria o browser outra vez (ver maybeAutoReconnectGraph)
             "has_session": has_session(), "had_login": had_login(),
             "login_email": cfg.get("login_email", "")}
    if not cfg:
        return state
    try:
        state["connected"] = bool(graph_token(cfg))
        state["method"] = _graph_source if state["connected"] else ""
    except GraphError as exc:
        state["error"] = str(exc)
    account = remembered_account()
    if state["connected"] and not account["email"] and state["method"] != "cli":
        _probe_account_async(cfg)   # sessão anterior a esta versão: fica para a próxima leitura
    state["account_email"] = account["email"]
    state["account_name"] = account["name"]
    login = _graph_login
    if login:
        if not login.get("done") and login.get("expires", 0) > time.time():
            state["code"] = login.get("user_code", "")
            state["url"] = login.get("url", "")
            state["pending"] = True
        elif login.get("error"):
            state["error"] = login["error"]
    return state


def _graph_expire_access(cfg):
    """Força a renovação do access token na próxima chamada (resposta 401)."""
    with _graph_lock:
        tokens = _graph_load_tokens()
        if tokens.get("access_token"):
            tokens["expires_at"] = 0
            _write_tokens(tokens)
    _cli_token.update({"token": "", "expires_at": 0.0})


def graph_api(path, method="GET", body=None, cfg=None, extra_headers=None):
    cfg = cfg or graph_config()
    if not cfg:
        raise GraphError("acesso web não configurado")
    # uma retentativa cobre o token acabado de expirar e as falhas passageiras
    # do serviço (throttling / 5xx), que de outra forma dariam dados em cache
    for attempt in (1, 2):
        token = graph_token(cfg)
        if not token:
            raise GraphError("sessão do OneDrive não iniciada")
        headers = {"Authorization": f"Bearer {token}"}
        headers.update(extra_headers or {})
        out = _http_json(cfg["graph_base"] + path, data=body, method=method,
                         headers=headers, as_json=True)
        status = out.pop("_status", 200)
        if status < 400:
            return out
        if attempt == 1 and status in (401, 429, 500, 502, 503, 504):
            if status == 401:
                _graph_expire_access(cfg)
            else:
                time.sleep(2)
            continue
        err = out.get("error")
        detail = err.get("message") if isinstance(err, dict) else (out.get("error_description") or err)
        raise GraphError(f"Graph {status}: {str(detail or 'erro desconhecido')[:200]}")


# ---- escrita numa pasta partilhada por link ----------------------------
# Um link de partilha com permissão de escrita chega para lá deixar ficheiros:
# não é preciso que a pasta esteja sincronizada no OneDrive de quem envia.

def share_target(url, cfg=None):
    """(driveId, itemId) da pasta por trás de um link de partilha."""
    if url in _share_cache:
        return _share_cache[url]
    share_id = "u!" + _b64url(url.encode("utf-8"))
    item = graph_api(f"/shares/{share_id}/driveItem?$select=id,name,parentReference", cfg=cfg)
    drive = (item.get("parentReference") or {}).get("driveId")
    if not (drive and item.get("id")):
        raise GraphError("link de partilha inválido")
    _share_cache[url] = (drive, item["id"])
    return _share_cache[url]


def share_child(url, name, cfg=None):
    """(driveId, itemId) de um filho da pasta partilhada; None se não existir."""
    drive, item = share_target(url, cfg)
    try:
        out = graph_api(f"/drives/{drive}/items/{item}:/{urllib.parse.quote(name)}"
                        "?$select=id", cfg=cfg)
    except GraphError:
        return None
    return (drive, out["id"]) if out.get("id") else None


def share_subfolder(url, name, cfg=None):
    """Subpasta da pasta partilhada, criada se ainda não existir."""
    found = share_child(url, name, cfg)
    if found:
        return found
    drive, item = share_target(url, cfg)
    # "fail" e não "replace": se entretanto alguém criou a pasta, o conteúdo
    # que lá está não pode ser deitado fora
    try:
        out = graph_api(f"/drives/{drive}/items/{item}/children", method="POST",
                        body={"name": name, "folder": {},
                              "@microsoft.graph.conflictBehavior": "fail"}, cfg=cfg)
    except GraphError:
        found = share_child(url, name, cfg)
        if found:
            return found
        raise
    if not out.get("id"):
        raise GraphError(f"não foi possível criar a pasta {name}")
    return drive, out["id"]


def share_upload(drive, item, name, data, cfg=None):
    """Escreve um ficheiro dentro de uma pasta do OneDrive/SharePoint."""
    cfg = cfg or graph_config()
    token = graph_token(cfg)
    if not token:
        raise GraphError("sessão do OneDrive não iniciada")
    url = (f"{cfg['graph_base']}/drives/{drive}/items/{item}:/"
           f"{urllib.parse.quote(name)}:/content")
    req = urllib.request.Request(url, data=data, method="PUT",
                                 headers={"Authorization": f"Bearer {token}",
                                          "Content-Type": "application/octet-stream"})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:200]
        raise GraphError(f"Graph {exc.code}: {detail}")
    except urllib.error.URLError as exc:
        raise GraphError(f"sem ligação: {exc.reason}")
    except (OSError, http.client.HTTPException) as exc:
        raise GraphError(f"sem ligação: {exc}")
    return json.loads(raw) if raw.strip() else {}


def graph_item(cfg=None):
    """(driveId, itemId) do livro em uso: o escolhido na app, ou o indicado na
    configuração (ids explícitos, URL, ou nome procurado num site)."""
    global _graph_item
    if _graph_item:
        return _graph_item
    cfg = cfg or graph_config()
    if not cfg:
        raise GraphError("acesso web não configurado")
    book = current_book()
    if book:
        _graph_item = (book["drive_id"], book["item_id"])
        log_event(f"livro em uso: {book.get('path') or book.get('name')} "
                  f"(item ...{book['item_id'][-8:]})")
        return _graph_item
    if cfg.get("drive_id") and cfg.get("item_id"):
        _graph_item = (cfg["drive_id"], cfg["item_id"])
        return _graph_item
    if cfg.get("file_url"):
        share_id = "u!" + base64.urlsafe_b64encode(
            cfg["file_url"].encode("utf-8")).decode("ascii").rstrip("=")
        item = graph_api(f"/shares/{share_id}/driveItem?$select=id,name,parentReference", cfg=cfg)
        drive = (item.get("parentReference") or {}).get("driveId")
        if drive and item.get("id"):
            _graph_item = (drive, item["id"])
            return _graph_item
    if cfg.get("site_url") and cfg.get("file_name"):
        _graph_item = graph_find_in_site(cfg)
        if _graph_item:
            return _graph_item
    raise GraphError("nenhum livro escolhido no OneDrive "
                     "(usa Definições → Dados → Escolher livro)")


def graph_forget_item():
    """Esquece o (drive, item) já resolvido: a leitura seguinte volta a
    procurar o livro (usado no "Atualizar", que relê tudo de raiz)."""
    global _graph_item
    _graph_item = None


def graph_find_in_site(cfg):
    """Procura o livro pelo nome nas bibliotecas de um site do SharePoint."""
    parts = urllib.parse.urlparse(cfg["site_url"])
    site_path = parts.path.rstrip("/")
    site = graph_api(f"/sites/{parts.netloc}:{site_path}?$select=id", cfg=cfg)
    if not site.get("id"):
        return None
    wanted = normalize(cfg["file_name"])
    query = urllib.parse.quote(os.path.splitext(cfg["file_name"])[0], safe="")
    for drive in graph_api(f"/sites/{site['id']}/drives?$select=id,name", cfg=cfg).get("value", []):
        try:
            found = graph_api(f"/drives/{drive['id']}/root/search(q='{query}')"
                              "?$select=id,name,file", cfg=cfg)
        except GraphError:
            continue
        for hit in found.get("value", []):
            if normalize(hit.get("name", "")) == wanted:
                log_event(f"livro encontrado no SharePoint: {hit['name']} "
                          f"(biblioteca {drive.get('name', '?')})")
                return drive["id"], hit["id"]
    return None


def _item_ref(item):
    """(driveId, itemId) de um item da listagem, seguindo os atalhos do
    OneDrive (pastas do Teams/SharePoint adicionadas com "Adicionar atalho")."""
    remote = item.get("remoteItem")
    if remote:
        drive = (remote.get("parentReference") or {}).get("driveId")
        if drive and remote.get("id"):
            return drive, remote["id"]
    parent = item.get("parentReference") or {}
    return parent.get("driveId", ""), item.get("id", "")


def _is_folder(item):
    return bool(item.get("folder") or (item.get("remoteItem") or {}).get("folder"))


def _entry(item, drive_fallback=""):
    drive, ident = _item_ref(item)
    return {"drive_id": drive or drive_fallback, "item_id": ident,
            "name": item.get("name", ""),
            "folder": _is_folder(item),
            "modified": item.get("lastModifiedDateTime", "")}


def _add_site_drives(places, site_id, label, cfg):
    """Acrescenta as bibliotecas de um site do SharePoint aos pontos de partida.

    Devolve quantas bibliotecas foram acrescentadas: um site pode resolver-se
    (tem "id") mas n\u00e3o ter nenhuma biblioteca acess\u00edvel ao token atual (falta
    de permiss\u00e3o Sites.Selected para esse site, por exemplo) \u2014 o chamador usa
    este valor para distinguir "site sem acesso" de "site sem bibliotecas"."""
    try:
        drives = graph_api(f"/sites/{site_id}/drives?$select=id,name", cfg=cfg).get("value", [])
    except GraphError:
        return 0
    adicionadas = 0
    for drv in drives:
        try:
            root = graph_api(f"/drives/{drv['id']}/root?$select=id", cfg=cfg)
        except GraphError:
            continue
        if not root.get("id"):
            continue
        nome = label
        if drv.get("name") and normalize(drv["name"]) not in ("documents", "documentos"):
            nome += f" \u00b7 {drv['name']}"
        places.append({"drive_id": drv["id"], "item_id": root["id"],
                       "name": nome, "folder": True})
        adicionadas += 1
    return adicionadas


def graph_places(cfg=None):
    """Pontos de partida da navegação: o OneDrive do utilizador, o site
    configurado, o OneDrive extra escolhido nas Definições, os sites do
    SharePoint que ele segue e o local do livro atual.

    Devolve (places, aviso, aviso_root): "aviso" só vem preenchido quando o
    OneDrive pessoal (/me/drive) falhou mas outros pontos de partida
    resultaram, e "aviso_root" quando é o OneDrive extra (onedrive_url) que
    falhou — para o utilizador perceber porquê em vez de a falha ficar só nos
    logs (ver graph_browse)."""
    cfg = cfg or graph_config()
    places = []
    falha = ""
    aviso_pessoal = ""
    aviso_root = ""
    try:
        drive = graph_api("/me/drive?$select=id,name", cfg=cfg)
        root = graph_api("/me/drive/root?$select=id", cfg=cfg)
        if drive.get("id") and root.get("id"):
            places.append({"drive_id": drive["id"], "item_id": root["id"],
                           "name": "OneDrive", "folder": True})
    except GraphError as exc:
        falha = aviso_pessoal = str(exc)
        log_event(f"OneDrive pessoal (/me/drive) indisponível: {aviso_pessoal}")
    if cfg.get("site_url"):
        try:
            parts = urllib.parse.urlparse(cfg["site_url"])
            site = graph_api(f"/sites/{parts.netloc}:{parts.path.rstrip('/')}"
                             "?$select=id,displayName", cfg=cfg)
            if site.get("id"):
                _add_site_drives(places, site["id"],
                                 site.get("displayName") or "SharePoint", cfg)
        except GraphError as exc:
            falha = falha or str(exc)
    if cfg.get("onedrive_url"):
        try:
            parts = urllib.parse.urlparse(cfg["onedrive_url"])
            site = graph_api(f"/sites/{parts.netloc}:{parts.path.rstrip('/')}"
                             "?$select=id,displayName", cfg=cfg)
            if not site.get("id"):
                raise GraphError("site não encontrado")
            if not _add_site_drives(places, site["id"],
                                    site.get("displayName") or "OneDrive", cfg):
                raise GraphError("sem biblioteca acessível nesse OneDrive/SharePoint "
                                 "(o token pode não ter permissão para este site)")
        except GraphError as exc:
            aviso_root = str(exc)
            log_event(f"OneDrive extra (onedrive_url) indisponível: {aviso_root}")
    try:
        sites = graph_api("/me/followedSites?$select=id,displayName", cfg=cfg).get("value", [])
    except GraphError as exc:
        falha = falha or str(exc)
        sites = []
    for site in sites[:10]:
        _add_site_drives(places, site["id"], site.get("displayName", "SharePoint"), cfg)
    # a biblioteca onde está o livro em uso é sempre um bom ponto de partida
    book = current_book()
    if book:
        try:
            root = graph_api(f"/drives/{book['drive_id']}/root?$select=id,name", cfg=cfg)
            if root.get("id"):
                places.append({"drive_id": book["drive_id"], "item_id": root["id"],
                               "name": root.get("name") or book.get("name", ""),
                               "folder": True})
        except GraphError:
            pass
    vistos, unicos = set(), []
    for place in places:
        chave = (place["drive_id"], place["item_id"])
        if chave in vistos:
            continue
        vistos.add(chave)
        unicos.append(place)
    if not unicos and falha:
        raise GraphError(falha)
    return unicos, aviso_pessoal, aviso_root


def graph_browse(drive_id="", item_id="", search=""):
    """Conteúdo de uma pasta do OneDrive/SharePoint: subpastas e livros de
    Excel. Sem pasta indicada, devolve os pontos de partida."""
    cfg = graph_config()
    if not cfg:
        raise GraphError("acesso web não configurado")
    if search:
        query = urllib.parse.quote(search[:60], safe="")
        base = f"/drives/{drive_id}" if drive_id else "/me/drive"
        found = graph_api(f"{base}/root/search(q='{query}')"
                          "?$select=id,name,folder,file,parentReference,lastModifiedDateTime"
                          "&$top=100", cfg=cfg).get("value", [])
        entries = [_entry(i, drive_id) for i in found]
        files = [e for e in entries
                 if not e["folder"] and e["name"].lower().endswith(BOOK_EXTS)]
        return {"places": [], "folders": [], "files": files, "path": search,
                "drive_id": drive_id, "item_id": item_id, "parent": None,
                "recent": load_books()["recent"], "current": current_book()}
    if not drive_id or not item_id:
        places, aviso, aviso_root = graph_places(cfg)
        return {"places": places, "folders": [], "files": [], "path": "",
                "drive_id": "", "item_id": "", "parent": None, "warning": aviso,
                "root_warning": aviso_root,
                "recent": load_books()["recent"], "current": current_book()}

    info = graph_api(f"/drives/{drive_id}/items/{item_id}"
                     "?$select=id,name,parentReference,root", cfg=cfg)
    parent = info.get("parentReference") or {}
    up = None
    if parent.get("id") and not ("root" in info):
        up = {"drive_id": parent.get("driveId", drive_id), "item_id": parent["id"]}
    children = graph_api(f"/drives/{drive_id}/items/{item_id}/children"
                         "?$select=id,name,folder,file,remoteItem,parentReference,"
                         "lastModifiedDateTime&$top=400", cfg=cfg).get("value", [])
    folders, files = [], []
    for child in children:
        if child.get("name", "").startswith("~$"):
            continue     # ficheiro temporário do Office
        entry = _entry(child, drive_id)
        if entry["folder"]:
            folders.append(entry)
        elif entry["name"].lower().endswith(BOOK_EXTS):
            files.append(entry)
    key = lambda e: e["name"].lower()   # noqa: E731
    path = ((parent.get("path", "") or "").split("root:")[-1] + "/" + info.get("name", "")).strip("/")
    return {"places": [], "folders": sorted(folders, key=key), "files": sorted(files, key=key),
            "path": path, "drive_id": drive_id, "item_id": item_id, "parent": up,
            "recent": load_books()["recent"], "current": current_book()}


def graph_pick(drive_id, item_id):
    """Passa a usar o livro indicado. Devolve o livro escolhido."""
    global _graph_item
    cfg = graph_config()
    if not drive_id or not item_id:
        raise GraphError("livro inválido")
    info = graph_api(f"/drives/{drive_id}/items/{item_id}"
                     "?$select=id,name,file,parentReference", cfg=cfg)
    name = info.get("name", "")
    if not name.lower().endswith(BOOK_EXTS):
        raise GraphError("só é possível abrir ficheiros .xlsx")
    parent = info.get("parentReference") or {}
    book = {"drive_id": parent.get("driveId", drive_id), "item_id": info.get("id", item_id),
            "name": name,
            "path": ((parent.get("path", "") or "").split("root:")[-1] + "/" + name).strip("/")}
    books = load_books()
    recent = [b for b in books["recent"] if b.get("item_id") != book["item_id"]]
    books = {"current": book, "recent": ([book] + recent)[:12]}
    save_books(books)
    _graph_item = (book["drive_id"], book["item_id"])
    log_event(f"livro do OneDrive escolhido: {book['path'] or book['name']}")
    return book


def graph_workbook(path, method="GET", body=None, session="", drive_id="", item_id=""):
    """Chamada à API do Excel. Sem drive_id/item_id vai ao livro escolhido na
    app (graph_item); com eles, ao livro indicado — é assim que se lê mais do
    que um livro ao mesmo tempo."""
    if drive_id and item_id:
        drive, item = drive_id, item_id
    else:
        drive, item = graph_item()
    # sem sessão explícita a Graph reutiliza uma sessão implícita que pode
    # servir o livro como estava há vários minutos (ver graph_read_session)
    headers = {"workbook-session-id": session} if session else None
    return graph_api(f"/drives/{drive}/items/{item}/workbook{path}",
                     method=method, body=body, extra_headers=headers)


def graph_read_session(drive_id="", item_id=""):
    """Sessão nova e não persistente para uma leitura: garante uma fotografia
    do livro tirada AGORA. Sem isto, a sessão implícita da Graph mantinha-se
    viva com os pedidos automáticos da app e as edições feitas no Excel só
    apareciam ao fim de muito tempo (ou depois de voltar a autenticar)."""
    try:
        out = graph_workbook("/createSession", method="POST",
                             body={"persistChanges": False},
                             drive_id=drive_id, item_id=item_id)
        return out.get("id", "")
    except GraphError as exc:
        log_event(f"não consegui abrir sessão de leitura no OneDrive ({exc})")
        return ""


def graph_close_session(session, drive_id="", item_id=""):
    if not session:
        return
    try:
        graph_workbook("/closeSession", method="POST", body={}, session=session,
                       drive_id=drive_id, item_id=item_id)
    except GraphError:
        pass


def graph_modified(drive_id="", item_id=""):
    """(data para mostrar, marca de versão). A marca muda a cada gravação do
    livro — é o que permite à interface recarregar sozinha sem ler a folha."""
    if not (drive_id and item_id):
        drive_id, item_id = graph_item()
    drive, item = drive_id, item_id
    info = graph_api(f"/drives/{drive}/items/{item}"
                     "?$select=lastModifiedDateTime,eTag")
    stamp = info.get("lastModifiedDateTime", "")
    tag = f"{stamp}|{info.get('eTag', '')}"
    try:
        utc = datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        return utc.astimezone().strftime("%d/%m/%Y %H:%M"), tag
    except ValueError:
        return stamp, tag


def col_letter(index):
    """1 -> A, 27 -> AA."""
    letters = ""
    index = int(index)
    while index > 0:
        index, rest = divmod(index - 1, 26)
        letters = chr(65 + rest) + letters
    return letters


def _range_start(address):
    """(linha, coluna) 1-based onde começa um endereço tipo "Folha!C3:Z90"."""
    ref = str(address).split("!")[-1].split(":")[0]
    match = re.match(r"\$?([A-Z]+)\$?(\d+)", ref.upper())
    if not match:
        return 1, 1
    col = 0
    for ch in match.group(1):
        col = col * 26 + (ord(ch) - 64)
    return int(match.group(2)), col


def graph_load_rows(drive_id, item_id, sheet_wanted):
    """(aba real, todas as abas, linhas) do livro indicado no OneDrive. Sem
    drive_id/item_id lê o livro escolhido na app. A aba real é None quando a
    aba pedida não existe."""
    session = graph_read_session(drive_id, item_id)
    try:
        sheets = [s.get("name", "") for s in
                  graph_workbook("/worksheets?$select=name", session=session,
                                 drive_id=drive_id, item_id=item_id).get("value", [])]
        wanted = normalize(sheet_wanted)
        real = (sheet_wanted if sheet_wanted in sheets else None) \
            or next((n for n in sheets if normalize(n) == wanted), None) \
            or next((n for n in sheets if wanted in normalize(n)), None)
        if real is None:
            return None, sheets, None
        quoted = urllib.parse.quote(real, safe="")
        used = graph_workbook(f"/worksheets('{quoted}')/usedRange(valuesOnly=true)"
                              "?$select=text,address", session=session,
                              drive_id=drive_id, item_id=item_id)
    finally:
        graph_close_session(session, drive_id, item_id)
    values = used.get("text") or []
    # o usedRange pode não começar em A1: preenche à esquerda/topo para os
    # índices coincidirem com os do openpyxl
    top, left = _range_start(used.get("address", ""))
    rows = [[] for _ in range(top - 1)]
    rows += [[None] * (left - 1) + list(r) for r in values]
    return real, sheets, rows


def graph_write_status(sheet, xlrow, xlcol, fncol, fn, value, drive_id="", item_id=""):
    """Escreve o estado diretamente no livro do OneDrive (a Graph preserva
    validações, gráficos e formatação). Sem drive_id/item_id escreve no livro
    escolhido na app. Devolve (ok, mensagem)."""
    try:
        quoted = urllib.parse.quote(sheet, safe="")
        guard = f"{col_letter(fncol)}{int(xlrow)}"
        cur = graph_workbook(f"/worksheets('{quoted}')/range(address='{guard}')?$select=text",
                             drive_id=drive_id, item_id=item_id)
        cells = cur.get("text") or [[""]]
        seen = " ".join(str(cells[0][0] if cells and cells[0] else "").split())
        want = " ".join(str(fn).split())
        if seen != want:
            return False, (f"a linha {xlrow} da folha mudou entretanto "
                           f"(esperava {want!r}, encontrei {seen!r}) - atualiza a app e tenta de novo")
        target = f"{col_letter(xlcol)}{int(xlrow)}"
        graph_workbook(f"/worksheets('{quoted}')/range(address='{target}')",
                       method="PATCH", body={"values": [[str(value)]]},
                       drive_id=drive_id, item_id=item_id)
        if "\n" in str(value):
            # tal como na escrita pelo Excel/COM: sem "moldar texto" as linhas
            # ficam lá mas a folha mostra-as todas numa só. Falhar aqui não
            # estraga a escrita — o valor já está gravado
            try:
                graph_workbook(f"/worksheets('{quoted}')/range(address='{target}')/format",
                               method="PATCH", body={"wrapText": True},
                               drive_id=drive_id, item_id=item_id)
            except GraphError as exc:
                log_event(f"não consegui ligar o moldar texto em {target} ({exc})")
        return True, "OK (OneDrive)"
    except GraphError as exc:
        return False, str(exc)
