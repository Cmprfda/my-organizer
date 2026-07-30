# -*- coding: utf-8 -*-
"""Mensagens do servidor mostradas na interface (PT/EN)."""

# mensagens do servidor que aparecem na interface, em PT e EN
MSGS = {
    "warning_locked": {
        "pt": "Não consigo ler o ficheiro neste momento — está aberto no Excel? "
              "A mostrar a leitura das {t} (edições incluídas).",
        "en": "Can't read the file right now — is it open in Excel? "
              "Showing data read at {t} (local edits included).",
    },
    "warning_web": {
        "pt": "Não consegui ler o livro no OneDrive neste momento. "
              "A mostrar a leitura das {t} (edições incluídas).",
        "en": "Couldn't read the workbook from OneDrive right now. "
              "Showing data read at {t} (local edits included).",
    },
    "notice_cycled": {
        "pt": "O Excel foi fechado (com gravação) para atualizar e já foi reaberto.",
        "en": "Excel was closed (saving changes) to refresh, and has been reopened.",
    },
    "err_read": {
        "pt": "Erro ao ler o ficheiro: {e}",
        "en": "Error reading the file: {e}",
    },
    "hint_excel": {
        "pt": "Se o tens aberto no Excel deste PC, fecha-o (ou usa 'Obter do SharePoint' "
              "para trabalhar sobre uma cópia).",
        "en": "If it is open in Excel on this PC, close it (or use 'Fetch from SharePoint' "
              "to work on a copy).",
    },
    "hint_web_read": {
        "pt": "O livro pode estar a ser gravado neste momento. Espera uns segundos "
              "e clica em Atualizar.",
        "en": "The workbook may be being saved right now. Wait a few seconds "
              "and click Refresh.",
    },
    "err_nofile": {
        "pt": "Não encontrei nenhum ficheiro Excel do tracker.",
        "en": "Couldn't find any tracker Excel file.",
    },
    "hint_nofile": {
        "pt": "Descarrega o ficheiro do SharePoint para a pasta Downloads "
              "(ou sincroniza a pasta do Teams via OneDrive) e clica em Atualizar.",
        "en": "Download the file from SharePoint into your Downloads folder "
              "(or sync the Teams folder via OneDrive) and click Refresh.",
    },
    "err_nosheet": {
        "pt": 'A aba "{s}" não existe no ficheiro.',
        "en": 'Sheet "{s}" does not exist in the file.',
    },
    "err_noheader": {
        "pt": 'Não encontrei uma linha de cabeçalho na aba "{s}".',
        "en": 'Could not find a header row in sheet "{s}".',
    },
    "err_graph_login": {
        "pt": "A fonte OneDrive (web) ainda não está ligada à tua conta Microsoft.",
        "en": "The OneDrive (web) source is not connected to your Microsoft account yet.",
    },
    "hint_graph_login": {
        "pt": "Abre as Definições e clica em Ligar ao OneDrive.",
        "en": "Open Settings and click Connect to OneDrive.",
    },
    "notice_graph_fallback": {
        "pt": "Não consegui ler pelo OneDrive; a mostrar o ficheiro local.",
        "en": "Couldn't read via OneDrive; showing the local file instead.",
    },
    "notice_sheet": {
        "pt": 'A aba pedida não existe neste livro; a mostrar "{s}".',
        "en": 'The requested sheet does not exist in this workbook; showing "{s}".',
    },
    "notice_syncing": {
        "pt": "A cópia no OneDrive ainda está diferente da que tens no computador "
              "(sincronização a decorrer); estás a ver a do computador.",
        "en": "The OneDrive copy still differs from the one on this computer "
              "(sync in progress); you are seeing the one on this computer.",
    },
}


def msg(key, lang, **kw):
    lang = lang if lang in ("pt", "en") else "pt"
    return MSGS[key][lang].format(**kw)
