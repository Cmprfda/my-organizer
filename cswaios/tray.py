# -*- coding: utf-8 -*-
"""O farol: um ícone ao lado do relógio, sempre lá.

A app só diz o que tem para dizer a quem abre uma janela dela. Quem passa o dia
no Excel e no Jenkins não abre nada — e é justamente essa pessoa que precisa de
saber que tem três linhas do lado dela e uma hora de cronómetro por registar.

O farol é um ícone na área de notificações (ao lado do relógio) com três estados:
verde (nada à espera de ti), âmbar (há trabalho do teu lado) e vermelho (há
alterações locais por enviar). O que ele diz ao certo está na dica que aparece ao
passar o rato; o botão direito abre um menu com o essencial.

Sem dependências novas, de propósito: parece que isto precisa do `pystray`, mas o
`Shell_NotifyIcon` chega-se por `ctypes` — que o `server.py` já usa para dizer ao
Windows quem é esta app (o AppUserModelID). Os ícones também não são ficheiros
que alguém tenha de manter: são desenhados aqui, três círculos de 16x16.

Nada disto pode partir a app: tudo o que se segue corre num fio à parte e apanha
qualquer exceção. Sem Windows (ou sem área de notificações) o farol não existe e
a app é exatamente o que era.
"""

import ctypes
import os
import struct
import tempfile
import threading
import time
import webbrowser
from ctypes import wintypes

from . import config
from .logs import log_event

# ---------------------------------------------------------------------------
# Os três ícones, desenhados aqui
#
# Um .ico é um cabeçalho, uma entrada, e um bitmap ao contrário (de baixo para
# cima). Com 32 bits por pixel a máscara AND é ignorada, mas tem de lá estar.

TAM = 16                     # 16x16 é o que a área de notificações usa
CORES = {
    # (B, G, R) — a ordem do Windows, e não a do CSS
    "verde": (0x5E, 0xA5, 0x3C),
    "ambar": (0x0B, 0xA5, 0xE0),
    "vermelho": (0x38, 0x38, 0xD4),
}


def _ico_ponto(bgr):
    """Um .ico de 16x16 com um círculo cheio da cor pedida."""
    b, g, r = bgr
    pixels = bytearray()
    centro = (TAM - 1) / 2.0
    raio = TAM / 2.0 - 1.0
    # de baixo para cima, que é como um DIB é guardado
    for y in range(TAM - 1, -1, -1):
        for x in range(TAM):
            dist = ((x - centro) ** 2 + (y - centro) ** 2) ** 0.5
            if dist <= raio:
                pixels += bytes((b, g, r, 255))
            elif dist <= raio + 0.9:
                # uma orla meio transparente: sem ela o círculo fica serrado
                pixels += bytes((b, g, r, 110))
            else:
                pixels += b"\x00\x00\x00\x00"
    mascara = bytes(TAM * 4)          # 16 linhas de 1 bit, alinhadas a 4 bytes
    dib = struct.pack("<IiiHHIIiiII", 40, TAM, TAM * 2, 1, 32, 0,
                      len(pixels) + len(mascara), 0, 0, 0, 0) + bytes(pixels) + mascara
    entrada = struct.pack("<BBBBHHII", TAM, TAM, 0, 0, 1, 32, len(dib), 22)
    return struct.pack("<HHH", 0, 1, 1) + entrada + dib


def _ficheiros_dos_icones():
    """Escreve os três ícones numa pasta temporária e devolve os caminhos."""
    pasta = os.path.join(tempfile.gettempdir(), "cswaios-farol")
    os.makedirs(pasta, exist_ok=True)
    saida = {}
    for nome, bgr in CORES.items():
        caminho = os.path.join(pasta, f"farol-{nome}.ico")
        if not os.path.isfile(caminho):
            with open(caminho, "wb") as f:
                f.write(_ico_ponto(bgr))
        saida[nome] = caminho
    return saida


# ---------------------------------------------------------------------------
# Win32 pelo ctypes

WM_DESTROY = 0x0002
WM_COMMAND = 0x0111
WM_APP_TRAY = 0x0400 + 1           # a mensagem que o ícone nos manda
WM_LBUTTONDBLCLK = 0x0203
WM_RBUTTONUP = 0x0205
WM_LBUTTONUP = 0x0202

NIM_ADD, NIM_MODIFY, NIM_DELETE = 0x0, 0x1, 0x2
NIF_MESSAGE, NIF_ICON, NIF_TIP = 0x1, 0x2, 0x4
IMAGE_ICON = 1
LR_LOADFROMFILE = 0x0010
MF_STRING, MF_SEPARATOR = 0x0, 0x800
TPM_RIGHTALIGN, TPM_BOTTOMALIGN, TPM_RETURNCMD = 0x8, 0x20, 0x100

ID_ABRIR, ID_MONTRA, ID_COMANDO, ID_SAIR = 1001, 1002, 1003, 1009

WNDPROC = ctypes.WINFUNCTYPE(ctypes.c_longlong, wintypes.HWND, wintypes.UINT,
                             wintypes.WPARAM, wintypes.LPARAM)

# Num Windows de 64 bits, um `ctypes` sem tipos declarados assume `int` de 32
# bits: o `lParam` de uma mensagem (que traz um ponteiro) estoura com
# "int too long to convert" e o ícone deixa de responder ao rato. Declarar os
# tipos uma vez resolve — e é a diferença entre um farol que funciona e um que
# aparece no ecrã e não faz nada.
_declarado = False


def _declara():
    global _declarado
    if _declarado:
        return
    u, s32 = ctypes.windll.user32, ctypes.windll.shell32
    u.DefWindowProcW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM,
                                 wintypes.LPARAM]
    u.DefWindowProcW.restype = ctypes.c_longlong
    u.CreateWindowExW.argtypes = [wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR,
                                  wintypes.DWORD, ctypes.c_int, ctypes.c_int,
                                  ctypes.c_int, ctypes.c_int, wintypes.HWND,
                                  wintypes.HMENU, wintypes.HINSTANCE, wintypes.LPVOID]
    u.CreateWindowExW.restype = wintypes.HWND
    u.LoadImageW.argtypes = [wintypes.HINSTANCE, wintypes.LPCWSTR, wintypes.UINT,
                             ctypes.c_int, ctypes.c_int, wintypes.UINT]
    u.LoadImageW.restype = wintypes.HANDLE
    u.CreatePopupMenu.restype = wintypes.HMENU
    u.AppendMenuW.argtypes = [wintypes.HMENU, wintypes.UINT, wintypes.UINT,
                              wintypes.LPCWSTR]
    u.TrackPopupMenu.argtypes = [wintypes.HMENU, wintypes.UINT, ctypes.c_int,
                                 ctypes.c_int, ctypes.c_int, wintypes.HWND,
                                 wintypes.LPVOID]
    u.TrackPopupMenu.restype = wintypes.BOOL
    u.DestroyMenu.argtypes = [wintypes.HMENU]
    u.SetForegroundWindow.argtypes = [wintypes.HWND]
    u.GetMessageW.argtypes = [wintypes.LPMSG, wintypes.HWND, wintypes.UINT,
                              wintypes.UINT]
    u.GetMessageW.restype = ctypes.c_int
    s32.Shell_NotifyIconW.argtypes = [wintypes.DWORD, ctypes.c_void_p]
    s32.Shell_NotifyIconW.restype = wintypes.BOOL
    _declarado = True


class NOTIFYICONDATA(ctypes.Structure):
    _fields_ = [("cbSize", wintypes.DWORD),
                ("hWnd", wintypes.HWND),
                ("uID", wintypes.UINT),
                ("uFlags", wintypes.UINT),
                ("uCallbackMessage", wintypes.UINT),
                ("hIcon", wintypes.HICON),
                ("szTip", wintypes.WCHAR * 128),
                ("dwState", wintypes.DWORD),
                ("dwStateMask", wintypes.DWORD),
                ("szInfo", wintypes.WCHAR * 256),
                ("uVersion", wintypes.UINT),
                ("szInfoTitle", wintypes.WCHAR * 64),
                ("dwInfoFlags", wintypes.DWORD)]


class WNDCLASS(ctypes.Structure):
    _fields_ = [("style", wintypes.UINT),
                ("lpfnWndProc", WNDPROC),
                ("cbClsExtra", ctypes.c_int),
                ("cbWndExtra", ctypes.c_int),
                ("hInstance", wintypes.HINSTANCE),
                ("hIcon", wintypes.HICON),
                ("hCursor", wintypes.HANDLE),
                ("hbrBackground", wintypes.HANDLE),
                ("lpszMenuName", wintypes.LPCWSTR),
                ("lpszClassName", wintypes.LPCWSTR)]


class Farol:
    """O ícone e o fio que o serve. Uma instância por processo."""

    def __init__(self, url):
        self.url = url
        self.icones = {}
        self.estado = ""
        self.hwnd = None
        self.dados = None
        self._proc = None            # a referência TEM de viver: é chamada pelo Windows

    # ---------- o que o ícone diz ----------
    def _contas(self):
        """(estado, dica) a partir do que a app sabe agora."""
        # importado aqui e não no topo: o tasks.py importa meia app, e o farol
        # arranca ao lado do servidor — um import circular deixava tudo sem pé
        from .store import load_waiting
        from .tasks import pending_overrides_summary
        from .todos import load_todo
        from datetime import datetime

        try:
            # uma entrada por campo por enviar (é uma lista, não um total)
            porEnviar = len(pending_overrides_summary())
        except Exception:
            porEnviar = 0
        hoje = datetime.now().strftime("%Y-%m-%d")
        cobrar = 0
        try:
            for marca in (load_waiting() or {}).values():
                if isinstance(marca, dict) and marca.get("who"):
                    ate = str(marca.get("until") or "")
                    if not ate or ate < hoje:
                        cobrar += 1
        except Exception:
            pass
        correndo = 0
        try:
            correndo = len([x for x in load_todo()
                            if isinstance(x, dict) and x.get("timer_started")])
        except Exception:
            pass
        partes = [f"My Organizer v{config.APP_VERSION}"]
        if porEnviar:
            partes.append(f"{porEnviar} por enviar")
        if cobrar:
            partes.append(f"{cobrar} a cobrar")
        if correndo:
            partes.append("cronómetro a contar")
        if len(partes) == 1:
            partes.append("nada à tua espera")
        estado = "vermelho" if porEnviar else "ambar" if (cobrar or correndo) else "verde"
        # a dica do Windows tem 127 caracteres e corta sem avisar
        return estado, " · ".join(partes)[:126]

    # ---------- Win32 ----------
    def _janela(self):
        _declara()
        classe = WNDCLASS()
        classe.lpfnWndProc = self._proc = WNDPROC(self._on_message)
        classe.lpszClassName = "CswAiOsFarol"
        classe.hInstance = ctypes.windll.kernel32.GetModuleHandleW(None)
        if not ctypes.windll.user32.RegisterClassW(ctypes.byref(classe)):
            # já registada (uma segunda instância nesta sessão): segue
            pass
        return ctypes.windll.user32.CreateWindowExW(
            0, "CswAiOsFarol", "My Organizer", 0, 0, 0, 0, 0,
            None, None, classe.hInstance, None)

    def _icone(self, estado):
        caminho = self.icones.get(estado) or self.icones.get("verde")
        return ctypes.windll.user32.LoadImageW(
            None, caminho, IMAGE_ICON, TAM, TAM, LR_LOADFROMFILE)

    def _notifica(self, acao, estado, dica):
        dados = NOTIFYICONDATA()
        dados.cbSize = ctypes.sizeof(NOTIFYICONDATA)
        dados.hWnd = self.hwnd
        dados.uID = 1
        dados.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP
        dados.uCallbackMessage = WM_APP_TRAY
        dados.hIcon = self._icone(estado)
        dados.szTip = dica
        return bool(ctypes.windll.shell32.Shell_NotifyIconW(acao, ctypes.byref(dados)))

    def _menu(self):
        menu = ctypes.windll.user32.CreatePopupMenu()
        ctypes.windll.user32.AppendMenuW(menu, MF_STRING, ID_ABRIR, "Abrir a app")
        ctypes.windll.user32.AppendMenuW(menu, MF_STRING, ID_MONTRA, "Abrir a montra")
        ctypes.windll.user32.AppendMenuW(menu, MF_STRING, ID_COMANDO, "Abrir o comando")
        ctypes.windll.user32.AppendMenuW(menu, MF_SEPARATOR, 0, None)
        # "Sair" fecha o ÍCONE e não o servidor: fechar a app daqui apanhava de
        # surpresa quem tem uma janela aberta com uma nota a meio
        ctypes.windll.user32.AppendMenuW(menu, MF_STRING, ID_SAIR, "Esconder este ícone")
        ponto = wintypes.POINT()
        ctypes.windll.user32.GetCursorPos(ctypes.byref(ponto))
        ctypes.windll.user32.SetForegroundWindow(self.hwnd)
        escolha = ctypes.windll.user32.TrackPopupMenu(
            menu, TPM_RIGHTALIGN | TPM_BOTTOMALIGN | TPM_RETURNCMD,
            ponto.x, ponto.y, 0, self.hwnd, None)
        ctypes.windll.user32.DestroyMenu(menu)
        return escolha

    def _abrir(self, caminho=""):
        try:
            webbrowser.open(self.url + caminho)
        except Exception as exc:
            log_event(f"farol: não consegui abrir o browser ({exc})")

    def _on_message(self, hwnd, msg, wparam, lparam):
        if msg == WM_APP_TRAY:
            evento = lparam & 0xFFFF
            if evento in (WM_LBUTTONDBLCLK, WM_LBUTTONUP):
                self._abrir()
            elif evento == WM_RBUTTONUP:
                escolha = self._menu()
                if escolha == ID_ABRIR:
                    self._abrir()
                elif escolha == ID_MONTRA:
                    self._abrir("montra")
                elif escolha == ID_COMANDO:
                    self._abrir("remote")
                elif escolha == ID_SAIR:
                    self.parar()
            return 0
        if msg == WM_DESTROY:
            ctypes.windll.user32.PostQuitMessage(0)
            return 0
        return ctypes.windll.user32.DefWindowProcW(hwnd, msg, wparam, lparam)

    def parar(self):
        try:
            dados = NOTIFYICONDATA()
            dados.cbSize = ctypes.sizeof(NOTIFYICONDATA)
            dados.hWnd = self.hwnd
            dados.uID = 1
            ctypes.windll.shell32.Shell_NotifyIconW(NIM_DELETE, ctypes.byref(dados))
            ctypes.windll.user32.PostQuitMessage(0)
        except Exception:
            pass

    def correr(self):
        """Cria o ícone e serve as mensagens até alguém o esconder."""
        self.icones = _ficheiros_dos_icones()
        self.hwnd = self._janela()
        if not self.hwnd:
            log_event("farol: não consegui criar a janela escondida")
            return
        self.estado, dica = self._contas()
        if not self._notifica(NIM_ADD, self.estado, dica):
            log_event("farol: a área de notificações não aceitou o ícone")
            return
        threading.Thread(target=self._refrescar, daemon=True).start()
        msg = wintypes.MSG()
        while ctypes.windll.user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
            ctypes.windll.user32.TranslateMessage(ctypes.byref(msg))
            ctypes.windll.user32.DispatchMessageW(ctypes.byref(msg))

    def _refrescar(self):
        """A cor e a dica seguem o que a app sabe, de meio em meio minuto."""
        while True:
            time.sleep(30)
            try:
                estado, dica = self._contas()
                self._notifica(NIM_MODIFY, estado, dica)
                self.estado = estado
            except Exception as exc:
                log_event(f"farol: não consegui atualizar o ícone ({exc})")
                return


_farol = None


def start(url):
    """Acende o farol num fio à parte. Nunca levanta exceção."""
    global _farol
    if os.name != "nt" or _farol is not None:
        return None
    try:
        _farol = Farol(url if url.endswith("/") else url + "/")
        threading.Thread(target=_farol.correr, daemon=True).start()
        return _farol
    except Exception as exc:      # sem farol a app é o que era
        log_event(f"farol: não arrancou ({exc!r})")
        _farol = None
        return None
