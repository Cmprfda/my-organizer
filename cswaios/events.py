# -*- coding: utf-8 -*-
"""Avisos do servidor para as janelas abertas (Server-Sent Events).

Até aqui a interface perguntava de 20 em 20 segundos se havia novidades
(`/api/modified`) e relia tudo de 2 em 2 minutos. Duas coisas ficavam mal com
isso: uma janela nunca sabia o que a outra tinha feito (duas janelas na mesma
folha, o telemóvel e o PC, ou a lista Por fazer aberta nos dois lados), e repor
uma cópia do estado pedia um F5 à mão.

Aqui vive o meio do caminho: quem grava estado publica um aviso, quem tem a app
aberta está pendurado num `GET /api/events` e ouve. O ciclo de perguntar fica
como rede de segurança (mais lento quando os avisos estão a chegar), porque uma
ligação pendurada morre calada — proxy, portátil a adormecer, Wi-Fi a mudar.

Propositadamente sem dependências do resto do pacote: o `statefile` publica
daqui, e um ciclo de imports entre os dois deixaria a app sem arrancar.
"""

import json
import queue
import threading
import time

# eventos por fila: uma janela que não lê (portátil fechado) não pode encher a
# memória do servidor — a partir daqui deita-se fora o mais antigo
MAX_FILA = 200

# ligações penduradas ao mesmo tempo. Cada uma prende um fio do
# ThreadingHTTPServer, por isso há um teto: passando daqui responde-se 503 e a
# janela fica só a perguntar, como antes.
MAX_OUVINTES = 24

# de quanto em quanto tempo se manda um comentário pela ligação parada. Sem
# isto uma ligação sem tráfego é cortada pelo caminho e a janela só descobre
# quando tenta ouvir outra vez.
PING_SEGUNDOS = 15

_filas = []
_guard = threading.Lock()
_seq = 0

# quem está a servir o pedido que vai publicar. A janela que mandou o pedido já
# sabe o que fez (a resposta traz-lhe o resultado) e não tem de se recarregar
# por causa do próprio clique — as outras têm.
_local = threading.local()


def set_origin(cid):
    """Marca o pedido que este fio está a servir como vindo desta janela."""
    _local.cid = str(cid or "") or None


def origin():
    """A janela que pediu o que está a ser servido neste fio (None se não sei)."""
    return getattr(_local, "cid", None)


def subscribe():
    """Uma fila nova para uma ligação pendurada (None se já há ouvintes demais)."""
    with _guard:
        if len(_filas) >= MAX_OUVINTES:
            return None
        fila = queue.Queue(maxsize=MAX_FILA)
        _filas.append(fila)
        return fila


def unsubscribe(fila):
    with _guard:
        if fila in _filas:
            _filas.remove(fila)


def listeners():
    """Quantas janelas estão penduradas (o /api/ping diz isto à interface)."""
    with _guard:
        return len(_filas)


def publish(kind, **dados):
    """Manda um aviso a todas as janelas penduradas. Devolve o evento."""
    global _seq
    with _guard:
        _seq += 1
        evento = {"seq": _seq, "kind": str(kind), "at": int(time.time() * 1000),
                  "from": origin(), **dados}
        alvos = list(_filas)
    for fila in alvos:
        try:
            fila.put_nowait(evento)
        except queue.Full:
            try:                      # a mais antiga sai para a nova entrar
                fila.get_nowait()
                fila.put_nowait(evento)
            except (queue.Empty, queue.Full):
                pass
    return evento


def frame(evento):
    """O texto de um evento no formato SSE."""
    corpo = json.dumps(evento, ensure_ascii=False)
    return f"id: {evento['seq']}\nevent: {evento['kind']}\ndata: {corpo}\n\n"


def ping_frame():
    """Comentário SSE: não chega à aplicação, só mantém a ligação viva."""
    return f": ping {int(time.time())}\n\n"


def stream(fila, escreve, vivo=None):
    """Serve uma ligação pendurada até ela morrer.

    `escreve` recebe texto já em bytes; `vivo` (opcional) diz se vale a pena
    continuar. Sai por exceção de escrita — que é como um cliente fechado se
    dá a conhecer — sem a deixar subir.
    """
    try:
        escreve(b"retry: 3000\n\n")
        escreve(frame({"seq": 0, "kind": "hello", "at": int(time.time() * 1000),
                       "from": None}).encode("utf-8"))
        while vivo is None or vivo():
            try:
                evento = fila.get(timeout=PING_SEGUNDOS)
                escreve(frame(evento).encode("utf-8"))
            except queue.Empty:
                escreve(ping_frame().encode("utf-8"))
    except (OSError, ValueError):
        pass          # cliente fechou a ligação: não é um erro da app
    finally:
        unsubscribe(fila)
