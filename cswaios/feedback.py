# -*- coding: utf-8 -*-
"""Feedback e reporte automático de erros na pasta partilhada."""

import hashlib
import json
import os
import re
import shutil
import subprocess
from datetime import datetime

from . import config
from .config import APP_VERSION, FEEDBACK_SHARE_URL, HERE
from .logs import LOG_FILE, _log_lock, log_event
from .updates import find_releases_dir

# ---- reporte automático de bugs ----------------------------------------
# Erros do browser e exceções do servidor viram uma entrada em feedback\,
# para entrarem no mesmo circuito do feedback escrito à mão.
BUGS_STATE_FILE = os.path.join(HERE, "bug_reports.json")

# O feedback é montado sempre aqui e só depois entregue: pelo link partilhado
# (Microsoft Graph, escrita aberta a toda a Critical Software) ou, em último
# caso, pela pasta partilhada sincronizada. Se nenhuma via estiver disponível
# (sem sessão, sem rede), fica cá e segue mais tarde.
PENDING_DIR = os.path.join(HERE, "feedback_pending")

# Repositório GitHub onde as issues de feedback são criadas (vazio desliga esta via)
GITHUB_REPO = os.environ.get("BSP_GITHUB_REPO", "Cmprfda/my-organizer")


def _find_gh():
    """Caminho para o GitHub CLI (gh), ou None se não estiver instalado."""
    import shutil as _sh
    exe = _sh.which("gh")
    if exe:
        return exe
    fallback = os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"),
                            "GitHub CLI", "gh.exe")
    return fallback if os.path.isfile(fallback) else None


def _post_github_issue(nome, folder):
    """Cria uma GitHub Issue com o conteúdo da pasta de feedback."""
    gh = _find_gh()
    if not gh or not GITHUB_REPO:
        raise OSError("gh CLI não encontrado ou GITHUB_REPO não configurado")
    feedback_file = os.path.join(folder, "feedback.txt")
    if not os.path.isfile(feedback_file):
        raise OSError("sem feedback.txt")
    with open(feedback_file, encoding="utf-8", errors="replace") as f:
        body = f.read()
    images = [n for n in os.listdir(folder)
              if n.lower().endswith((".png", ".jpg", ".jpeg"))]
    if images:
        body += f"\n\n_Imagens em anexo (feedback_pending): {', '.join(images)}_"
    proc = subprocess.run(
        [gh, "issue", "create", "--repo", GITHUB_REPO,
         "--title", f"[Feedback] {nome}", "--body", body],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=30,
    )
    if proc.returncode != 0:
        out = (proc.stdout + proc.stderr).strip()
        raise OSError(f"gh issue create falhou: {out[:300]}")


def github_issue_url(folder):
    """Link para abrir uma issue no GitHub já preenchida com este feedback.

    Serve quem não alcança a partilha: num repositório público qualquer conta
    GitHub pode abrir issues, mesmo sem ser colaborador. Ao contrário das
    outras vias, esta não entrega nada sozinha — é o utilizador que confirma a
    issue no browser (e é lá que arrasta as imagens, que a API não aceita).
    Vazio se GITHUB_REPO não estiver definido ou não houver feedback.txt.
    """
    import urllib.parse
    if not GITHUB_REPO or not os.path.isdir(folder):
        return ""
    caminho = os.path.join(folder, "feedback.txt")
    if not os.path.isfile(caminho):
        return ""
    nome = os.path.basename(folder)
    with open(caminho, encoding="utf-8", errors="replace") as f:
        body = f.read()
    # o IP sai daqui: a issue fica pública
    body = re.sub(r"^(De: .*?) \(.*\)\s*$", r"\1", body, count=1, flags=re.M)
    body = body[:5000]
    images = [n for n in sorted(os.listdir(folder))
              if n.lower().endswith((".png", ".jpg", ".jpeg"))]
    if images:
        body += ("\n\n_Imagens por anexar (arrasta-as para a issue), em "
                 "feedback_pending\\" + nome + ": " + ", ".join(images) + "_")
    query = urllib.parse.urlencode({"title": f"[Feedback] {nome}", "body": body})
    return f"https://github.com/{GITHUB_REPO}/issues/new?{query}"


def _relay_server():
    """URL do servidor de relay lido de latest.json; vazio se nao configurado
    ou se aponta para a propria maquina."""
    import urllib.parse
    from . import updates
    releases = updates.find_releases_dir()
    if not releases:
        return ""
    try:
        with open(os.path.join(releases, "latest.json"), encoding="utf-8") as f:
            data = json.load(f)
        url = str(data.get("relay_server") or "").rstrip("/")
    except (OSError, ValueError):
        return ""
    if not url:
        return ""
    host = urllib.parse.urlparse(url).hostname or ""
    from .config import lan_ip
    own = lan_ip() or ""
    if host in ("127.0.0.1", "localhost", own):
        return ""   # nao fazer relay para si proprio
    return url


def _relay_to_server(nome, folder):
    """Reenvia o feedback para o servidor de relay via POST /api/feedback."""
    import base64
    import urllib.request
    relay = _relay_server()
    if not relay:
        raise OSError("sem servidor de relay configurado")
    with open(os.path.join(folder, "feedback.txt"), encoding="utf-8", errors="replace") as f:
        body = f.read()
    images = []
    for name in sorted(os.listdir(folder)):
        if not name.lower().endswith((".png", ".jpg", ".jpeg")):
            continue
        with open(os.path.join(folder, name), "rb") as f:
            images.append({"name": name, "data": base64.b64encode(f.read()).decode()})
    payload = json.dumps({"name": nome, "text": body, "images": images,
                          "relay": 1}).encode("utf-8")
    req = urllib.request.Request(
        f"{relay}/api/feedback",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        result = json.load(resp)
    if not result.get("ok"):
        raise OSError(f"relay recusou: {result}")


def share_url():
    """Link da pasta partilhada onde o feedback aterra (BSP_FEEDBACK_SHARE
    permite apontar para outra pasta em testes; vazio desliga esta via)."""
    value = os.environ.get("BSP_FEEDBACK_SHARE")
    return FEEDBACK_SHARE_URL if value is None else value


def feedback_root():
    """Onde vivem as pastas de feedback sincronizadas localmente, ou "" quando a
    partilha não está ao alcance desta máquina (BSP_FEEDBACK_DIR permite testar
    sem tocar na pasta partilhada).

    Caía para `HERE` — a pasta da própria app — e isso era pior do que não
    entregar nada: o feedback de quem não alcança a partilha ficava dado como
    ENTREGUE numa pasta do computador dele, que ninguém lê. E, por estar
    "entregue", a app nem chegava a oferecer a via pública (a issue no GitHub
    já preenchida). Foi o que aconteceu ao colega do reporte 20260820_105055.
    """
    return os.environ.get("BSP_FEEDBACK_DIR") or find_releases_dir() or ""


def stage_feedback_folder(nome):
    """Pasta local onde o feedback é montado antes de ser entregue."""
    destino = os.path.join(PENDING_DIR, nome)
    os.makedirs(destino, exist_ok=True)
    return destino


def _upload_folder(nome, folder):
    """Envia o conteúdo da pasta para o link partilhado, via Graph."""
    from . import graph                      # importado aqui: evita ciclos
    url = share_url()
    if not url:
        raise graph.GraphError("sem link de partilha para o feedback")
    drive, item = graph.share_subfolder(url, nome)
    for name in sorted(os.listdir(folder)):
        full = os.path.join(folder, name)
        if not os.path.isfile(full):
            continue
        with open(full, "rb") as f:
            graph.share_upload(drive, item, name, f.read())


def _move_into(origem, destino):
    """Move os ficheiros de uma pasta para outra, sem apagar o que lá esteja
    (a pasta de destino pode já existir, no caso de um erro repetido)."""
    os.makedirs(destino, exist_ok=True)
    for name in sorted(os.listdir(origem)):
        src = os.path.join(origem, name)
        if not os.path.isfile(src):
            continue
        dest = os.path.join(destino, name)
        if os.path.exists(dest):
            base, ext = os.path.splitext(name)
            dest = os.path.join(destino, f"{base}_{datetime.now():%H%M%S}{ext}")
        shutil.move(src, dest)
    shutil.rmtree(origem, ignore_errors=True)


def deliver(folder, allow_relay=True):
    """Entrega uma pasta montada. Devolve a via usada ou "" se ficou pendente.
    allow_relay=False evita que um pedido ja reencaminhado gere outro relay."""
    nome = os.path.basename(folder)
    if not os.path.isdir(folder):
        return ""
    try:
        _upload_folder(nome, folder)
        shutil.rmtree(folder, ignore_errors=True)
        log_event(f"feedback: {nome} entregue no link partilhado")
        return "share"
    except Exception as exc:
        log_event(f"feedback: link partilhado indisponivel ({exc}) - "
                  f"a tentar a pasta sincronizada")
    raiz = feedback_root()
    if raiz:
        try:
            _move_into(folder, os.path.join(raiz, "feedback", nome))
            log_event(f"feedback: {nome} entregue na pasta sincronizada")
            return "local"
        except OSError as exc:
            log_event(f"feedback: pasta sincronizada indisponivel ({exc}) - "
                      f"a tentar relay LAN")
    else:
        log_event("feedback: sem pasta partilhada ao alcance desta maquina - "
                  "a tentar relay LAN")
    if allow_relay:
        try:
            _relay_to_server(nome, folder)
            shutil.rmtree(folder, ignore_errors=True)
            log_event(f"feedback: {nome} reencaminhado para servidor de relay")
            return "relay"
        except Exception as exc:
            log_event(f"feedback: relay LAN falhou ({exc}) - a tentar GitHub Issues")
    try:
        _post_github_issue(nome, folder)
        shutil.rmtree(folder, ignore_errors=True)
        log_event(f"feedback: {nome} submetido como GitHub Issue")
        return "github"
    except Exception as exc:
        log_event(f"feedback: GitHub Issues falhou ({exc}) - "
                  f"fica em feedback_pending\\{nome}")
    return ""


def delivered_folder_exists(nome):
    """True se a pasta de feedback ainda estiver por tratar (por entregar, na
    partilha sincronizada ou no destino do link). Serve para distinguir um
    erro repetido de uma regressão (pasta já arrumada em Fixed\\)."""
    if not nome:
        return False
    if os.path.isdir(os.path.join(PENDING_DIR, nome)):
        return True
    raiz = feedback_root()
    if raiz and os.path.isdir(os.path.join(raiz, "feedback", nome)):
        return True
    try:
        from . import graph
        url = share_url()
        return bool(url and graph.share_child(url, nome))
    except Exception:
        return False


def flush_pending():
    """Tenta entregar o feedback que ficou guardado localmente. Devolve
    quantas pastas foram entregues."""
    if not os.path.isdir(PENDING_DIR):
        return 0
    entregues = 0
    for nome in sorted(os.listdir(PENDING_DIR)):
        origem = os.path.join(PENDING_DIR, nome)
        if not os.path.isdir(origem):
            continue
        if deliver(origem):
            entregues += 1
        else:
            break            # continua sem acesso: tenta outra vez mais tarde
    if entregues:
        log_event(f"feedback: {entregues} pasta(s) pendente(s) entregues")
    return entregues


IMAGE_EXT = (".png", ".jpg", ".jpeg")


def _pending_folder(nome):
    """A pasta de UM feedback pendente, ou "" se o nome não for de uma.

    O nome vem do cliente: só serve o de uma pasta que esteja mesmo em
    feedback_pending — nada com barras nem com ".." chega ao disco.
    """
    nome = str(nome or "").strip()
    if not nome or nome != os.path.basename(nome) or nome in (".", ".."):
        return ""
    destino = os.path.join(PENDING_DIR, nome)
    return destino if os.path.isdir(destino) else ""


def pending_list():
    r"""O feedback que ficou no PC deste utilizador, por entregar.

    Ficava invisível: montado em feedback_pending\ e entregue mais tarde, sem
    nada na app que o mostrasse. Quem não alcança a partilha só via a issue
    pública do reporte que acabou de escrever — os anteriores ficavam esquecidos
    numa pasta (reporte do Nuno). Aqui saem todos, com o link da issue já
    preenchida e os nomes das imagens que ficaram por anexar.
    """
    if not os.path.isdir(PENDING_DIR):
        return []
    out = []
    for nome in sorted(os.listdir(PENDING_DIR), reverse=True):
        pasta = os.path.join(PENDING_DIR, nome)
        if not os.path.isdir(pasta):
            continue
        try:
            ficheiros = sorted(os.listdir(pasta))
        except OSError:
            continue
        texto = ""
        caminho = os.path.join(pasta, "feedback.txt")
        if os.path.isfile(caminho):
            try:
                with open(caminho, encoding="utf-8", errors="replace") as f:
                    texto = f.read(4000)
            except OSError:
                texto = ""
        out.append({
            "name": nome,
            "text": texto,
            "images": [n for n in ficheiros if n.lower().endswith(IMAGE_EXT)],
            "files": len(ficheiros),
            "issue_url": github_issue_url(pasta),
        })
    return out


def drop_pending(nome):
    """Apaga um feedback pendente: a issue já foi aberta à mão, e deixá-lo aqui
    fazia-o seguir outra vez pela partilha quando a ligação voltasse."""
    pasta = _pending_folder(nome)
    if not pasta:
        raise ValueError("feedback pendente não encontrado")
    shutil.rmtree(pasta, ignore_errors=True)
    log_event(f"feedback: {nome} descartado do pendente (issue aberta à mão)")
    return True


def reveal_pending(nome):
    r"""Abre no Explorador a pasta de um feedback pendente.

    O formulário de issues do GitHub não recebe ficheiros por URL: as imagens
    têm de ser arrastadas para lá à mão. Abrir a pasta é o que transforma "vai
    procurar feedback_pending\<nome>" num arrastar (reporte do Nuno)."""
    pasta = _pending_folder(nome)
    if not pasta:
        raise ValueError("feedback pendente não encontrado")
    os.startfile(pasta)
    return True


def attach_server_log(folder):
    """Junta as últimas linhas do log — costumam ter o contexto do erro."""
    try:
        with _log_lock:
            with open(LOG_FILE, encoding="utf-8") as lf:
                lines = lf.readlines()[-500:]
        with open(os.path.join(folder, "server.log"), "w", encoding="utf-8") as f:
            f.writelines(lines)
    except OSError:
        pass


def load_bug_state():
    try:
        with open(BUGS_STATE_FILE, encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def report_bug(origem, mensagem, detalhe="", ip="?", quem="", extra=None):
    """Cria (ou atualiza) uma entrada de feedback para um erro.

    Só reporta uma vez por erro distinto: repetições incrementam um contador.
    Se a pasta já tiver sido arrumada para Fixed e o erro voltar, é tratado
    como regressão e reportado de novo. Nunca levanta exceções — reportar um
    bug não pode partir a app."""
    try:
        if config.DEV_MODE:                       # a instância de dev não polui o feedback
            log_event(f"[dev] bug nao reportado ({origem}): {str(mensagem)[:120]}")
            return None
        assinatura = hashlib.sha1(
            f"{origem}|{mensagem}|{str(detalhe).splitlines()[0] if detalhe else ''}"
            .encode("utf-8", "replace")).hexdigest()[:12]

        estado = load_bug_state()
        anterior = estado.get(assinatura)
        agora = datetime.now()
        # se a pasta anterior já não está em feedback\ (foi para Fixed), o erro
        # voltou depois de dado como resolvido: vale um reporte novo.
        repetido = bool(anterior) and delivered_folder_exists(anterior.get("pasta", ""))

        if repetido:
            anterior["ocorrencias"] = anterior.get("ocorrencias", 1) + 1
            anterior["ultima"] = agora.strftime("%d/%m/%Y %H:%M")
            estado[assinatura] = anterior
            # a pasta original pode já estar entregue: junta-se-lhe um ficheiro
            # novo com a repetição, em vez de reescrever o que lá está
            pasta = stage_feedback_folder(anterior["pasta"])
            with open(os.path.join(pasta, f"repeticao_{anterior['ocorrencias']:02d}.txt"),
                      "w", encoding="utf-8") as f:
                f.write(f"[repetiu {anterior['ocorrencias']}x] "
                        f"{anterior['ultima']} ({ip})\n\n{mensagem}\n")
            attach_server_log(pasta)
            deliver(pasta)
        else:
            safe = re.sub(r"[^A-Za-z0-9_-]+", "_", quem or "auto")[:30]
            nome = f"BUG_{agora:%Y%m%d_%H%M%S}_{safe}"
            pasta = stage_feedback_folder(nome)
            linhas = [
                "*** Reporte automático de erro ***",
                f"Origem: {origem}",
                f"De: {quem or '(desconhecido)'} ({ip})",
                f"Data: {agora:%d/%m/%Y %H:%M}",
                f"App: v{APP_VERSION}",
                f"Assinatura: {assinatura}"
                + (f"  (regressão — já tinha sido reportado e arrumado)" if anterior else ""),
                "",
                str(mensagem),
            ]
            if detalhe:
                linhas += ["", "Detalhe:", str(detalhe)[:4000]]
            if extra:
                linhas += ["", "Contexto:"] + [f"  {k}: {v}" for k, v in extra.items()]
            with open(os.path.join(pasta, "feedback.txt"), "w", encoding="utf-8") as f:
                f.write("\n".join(linhas) + "\n")
            attach_server_log(pasta)
            deliver(pasta)
            estado[assinatura] = {"pasta": nome, "ocorrencias": 1,
                                  "primeira": agora.strftime("%d/%m/%Y %H:%M"),
                                  "ultima": agora.strftime("%d/%m/%Y %H:%M"),
                                  "versao": APP_VERSION, "mensagem": str(mensagem)[:200]}
            log_event(f"BUG reportado automaticamente ({origem}) -> {nome}: "
                      f"{str(mensagem)[:120]}")

        with open(BUGS_STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(estado, f, ensure_ascii=False, indent=1)
        return estado[assinatura]["pasta"]
    except Exception as exc:               # nunca deixar o reporte partir a app
        try:
            log_event(f"reporte automatico de bug FALHOU: {exc}")
        except Exception:
            pass
        return None
