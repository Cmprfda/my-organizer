# -*- coding: utf-8 -*-
"""Camada de dados/serviço: constrói o que a interface consome."""

import hashlib
import json
import os
import time
from datetime import datetime

import openpyxl

from . import config
from .config import (APP_VERSION, BASE_STATUSES, CANDIDATE_DIRS, DEFAULT_PERSON,
                     DEFAULT_SHEET, lan_ip)
from .excel import (_ADMIN_CACHE, _RAW_CACHE, admin_statuses, close_excel_workbook,
                    detect_header_row, find_named_file, find_tracker_files, locate_row,
                    pick_sheet, write_status_to_excel)
from .graph import (GRAPH_PATH, GraphError, current_book, graph_config, graph_forget_item,
                    graph_load_rows, graph_modified, graph_state, has_book)
from .i18n import msg
from .logs import log_event
from .store import (load_ccrs, load_notes, load_overrides, save_notes,
                    save_overrides)
from .text import cell_to_text, normalize
from .todos import load_todo, save_todo

# última leitura bem-sucedida por (ficheiro, aba, pessoa, todas) — serve de
# fallback quando o Excel tem o ficheiro bloqueado em exclusivo
_LAST_GOOD = {}


def forget_cache(path=None):
    """Esquece o que foi lido (de um ficheiro, ou de todos): a leitura seguinte
    vai buscar tudo de novo, como se a app tivesse acabado de abrir."""
    for cache in (_RAW_CACHE, _LAST_GOOD):
        for key in [k for k in cache if k and (path is None or k[0] == path)]:
            cache.pop(key, None)
    for key in [k for k in _SYNC_CHECK if path is None or k[0] == path]:
        _SYNC_CHECK.pop(key, None)
    if path is None:
        _ADMIN_CACHE.clear()
    else:
        _ADMIN_CACHE.pop(path, None)


def forget_web_cache():
    """Esquece tudo o que foi lido da fonte web (usado ao trocar de livro no
    OneDrive: os dados em cache eram do livro anterior)."""
    forget_cache(GRAPH_PATH)


def local_twin(files):
    """Cópia sincronizada do livro do OneDrive (o mesmo ficheiro numa pasta
    local do OneDrive), ou None. Vale a pena preferi-la: as alterações feitas
    no Excel aparecem no disco assim que são gravadas, enquanto a cópia na
    nuvem só as recebe quando o OneDrive acaba de sincronizar (pode demorar
    minutos)."""
    name = (current_book() or {}).get("name") or ""
    for p in files:
        if os.path.basename(p).lower() == name.lower():
            return p
    return None


def known_files():
    """Ficheiros que a app aceita abrir: os candidatos habituais mais a cópia
    sincronizada do livro escolhido no OneDrive (que pode ter outro nome)."""
    files = find_tracker_files()
    name = (current_book() or {}).get("name") or ""
    if name and not any(os.path.basename(p).lower() == name.lower() for p in files):
        files += find_named_file(name)
        files.sort(key=os.path.getmtime, reverse=True)
    return files


def rows_digest(rows):
    """Impressão digital do conteúdo de uma folha crua (texto das células).
    Ignora células e linhas vazias no fim, porque o Excel local e a nuvem não
    contam da mesma maneira onde a folha acaba."""
    limpas = []
    for r in (rows or []):
        linha = [cell_to_text(c) for c in (r or [])]
        while linha and not linha[-1].strip():
            linha.pop()
        limpas.append(linha)
    while limpas and not limpas[-1]:
        limpas.pop()
    return hashlib.md5(json.dumps(limpas, ensure_ascii=False).encode("utf-8")).hexdigest()


# (ficheiro, aba) -> (marca da nuvem, mtime local, cópias diferentes)
_SYNC_CHECK = {}


def sync_gap(path, sheet, local_rows, mtime):
    """True quando a cópia na nuvem tem conteúdo diferente do ficheiro local,
    ou seja, o OneDrive ainda não acabou de sincronizar (numa direção ou na
    outra). As datas não servem para isto: o OneDrive atualiza a data do item
    na nuvem antes de o conteúdo novo lá estar. Só se compara de facto quando
    uma das cópias mudou, para não ler o livro da nuvem a cada pedido."""
    key = (path, normalize(sheet))
    _, tag = graph_modified()
    antes = _SYNC_CHECK.get(key)
    if antes and antes[0] == tag and antes[1] == mtime:
        return antes[2]
    _, _, cloud_rows = graph_load_rows(sheet)
    diferentes = rows_digest(cloud_rows) != rows_digest(local_rows)
    _SYNC_CHECK[key] = (tag, mtime, diferentes)
    if diferentes:
        log_event(f"a cópia no OneDrive de {os.path.basename(path)} ainda difere "
                  f"da local (sincronização a decorrer)")
    return diferentes


def read_sheet(path, sheet_name, person, show_all, lang="pt"):
    raw_key = (path, normalize(sheet_name))
    warning_ts = None
    try:
        if path == GRAPH_PATH:
            real_sheet, all_sheets, rows = graph_load_rows(sheet_name)
            if real_sheet is None:
                return {"error": msg("err_nosheet", lang, s=sheet_name),
                        "sheets": all_sheets}
        else:
            wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
            try:
                all_sheets = wb.sheetnames
                real_sheet = pick_sheet(wb, sheet_name)
                if real_sheet is None:
                    return {"error": msg("err_nosheet", lang, s=sheet_name),
                            "sheets": all_sheets}
                ws = wb[real_sheet]
                rows = [list(r) for r in ws.iter_rows(values_only=True)]
            finally:
                wb.close()
        _RAW_CACHE[raw_key] = (datetime.now(), real_sheet, all_sheets, rows)
    except Exception as exc:
        # ficheiro bloqueado pelo Excel (ou a meio da sincronização):
        # continua com a última leitura crua — os filtros e as edições de
        # estado aplicam-se na mesma
        if raw_key not in _RAW_CACHE:
            raise
        warning_ts, real_sheet, all_sheets, rows = _RAW_CACHE[raw_key]
        log_event(f"leitura de {path} falhou ({exc!r}) - "
                  f"a servir a leitura das {warning_ts:%H:%M}")

    header_index = detect_header_row(rows)
    if header_index is None:
        return {"error": msg("err_noheader", lang, s=real_sheet),
                "sheets": all_sheets}

    raw_headers = rows[header_index]
    headers = [cell_to_text(h) or f"Coluna {i + 1}" for i, h in enumerate(raw_headers)]

    # índices das colunas usadas para chaves e para os overrides (estados e OBS)
    hidx = {}
    for j, h in enumerate(headers):
        hn = normalize(h)
        if hn in ("function/tc", "to do", "status tc", "status tp", "obs"):
            hidx[hn] = j
    for j, h in enumerate(headers):
        hn = normalize(h)
        if hn in ("author tc", "reviewer tc", "author tp", "reviewer tp"):
            hidx[hn] = j
    overrides = load_overrides()
    notes = load_notes()

    # folha sem as colunas do tracker (qualquer outro livro de Excel): mostra-se
    # tal como está, sem filtrar por pessoa nem sincronizar papéis
    generic = "function/tc" not in hidx
    if generic:
        show_all = True

    person_norm = normalize(person) if person else ""
    # aceita também células só com um dos nomes (ex.: "Carlos"), porque a folha
    # usa nomes inconsistentes ("Mariana" vs "Mariana Ribeiro")
    person_tokens = {t for t in person_norm.split() if len(t) >= 4}

    def mentions_person(cell):
        c = normalize(cell)
        return person_norm in c or c in person_tokens

    def is_me(cells, idx_name):
        if idx_name not in hidx:
            return False
        return mentions_person(cells[hidx[idx_name]])

    def applicable(status_text):
        t = normalize(status_text)
        return t not in ("", "n/a")

    data_rows, row_meta, statuses = [], [], set()
    total_rows = 0
    overrides_stale = False
    for i, row in enumerate(rows[header_index + 1:]):
        xlrow = header_index + 2 + i  # nº da linha real na folha (1-based)
        cells = [cell_to_text(v) for v in row]
        # ignora linhas completamente vazias
        if not any(c for c in cells):
            continue
        total_rows += 1
        cells += [""] * (len(headers) - len(cells))

        fn_key = cells[hidx["function/tc"]] if "function/tc" in hidx else ""
        todo_key = cells[hidx["to do"]] if "to do" in hidx else ""
        orig, over = {}, {}
        for want, col_name in (("status tc", "Status TC"), ("status tp", "Status TP")):
            if want in hidx:
                orig[col_name] = cells[hidx[want]]
                if cells[hidx[want]]:
                    statuses.add(cells[hidx[want]])
        # a OBS também se edita e se envia para o Excel, mas não alimenta a
        # lista de estados
        if "obs" in hidx:
            orig["OBS"] = cells[hidx["obs"]]
        # o Function/TC e o "To Do" também se editam e se enviam para o Excel
        # (guarda-se o valor cru da folha, que serve de base ao override)
        if "function/tc" in hidx:
            orig["Function/TC"] = fn_key
        if "to do" in hidx:
            orig["To Do"] = todo_key

        # papel por vertente (usado para sincronizar TODO por regras de autoria/review)
        role_sync = {"author": [], "reviewer": []}
        st_tc = cells[hidx["status tc"]] if "status tc" in hidx else ""
        st_tp = cells[hidx["status tp"]] if "status tp" in hidx else ""
        if applicable(st_tc):
            if is_me(cells, "author tc"):
                role_sync["author"].append(st_tc)
            if is_me(cells, "reviewer tc"):
                role_sync["reviewer"].append(st_tc)
        if applicable(st_tp):
            if is_me(cells, "author tp"):
                role_sync["author"].append(st_tp)
            if is_me(cells, "reviewer tp"):
                role_sync["reviewer"].append(st_tp)
        okey = f"{real_sheet}||{fn_key}||{todo_key}"
        entry = overrides.get(okey)
        if entry:
            for col_name, o in list(entry.items()):
                want = normalize(col_name)
                if want not in hidx or not isinstance(o, dict):
                    continue
                if cells[hidx[want]] == o.get("base", ""):
                    cells[hidx[want]] = str(o.get("value", ""))
                    over[col_name] = True
                else:
                    # a folha mudou desde o override: a folha ganha, e o override
                    # é removido de vez (senão ressuscitava se a célula voltasse
                    # ao valor antigo)
                    entry.pop(col_name)
                    overrides_stale = True
            if not entry:
                overrides.pop(okey)

        # quem está ligado à linha (autor/reviewer de cada vertente): texto cru
        # da folha, só para mostrar — não entra nos overrides nem na escrita
        people = {}
        for want, key in (("author tc", "author_tc"), ("reviewer tc", "reviewer_tc"),
                          ("author tp", "author_tp"), ("reviewer tp", "reviewer_tp")):
            people[key] = cells[hidx[want]].strip() if want in hidx else ""

        if show_all or not person_norm or any(mentions_person(c) for c in cells if c):
            data_rows.append(cells[:len(headers)])
            row_meta.append({"fn": fn_key, "todo": todo_key, "orig": orig, "over": over,
                             "note": notes.get(okey), "xlrow": xlrow,
                             "people": people,
                             "todo_sync_role": role_sync})

    if overrides_stale:
        save_overrides(overrides)

    # remove colunas sem qualquer valor nas linhas apresentadas
    if data_rows:
        keep = [i for i in range(len(headers))
                if headers[i].strip() and any(i < len(r) and r[i] for r in data_rows)]
        headers = [headers[i] for i in keep]
        data_rows = [[r[i] if i < len(r) else "" for i in keep] for r in data_rows]

    # dropdown de estados: a lista oficial da aba Admin, mais quaisquer valores
    # extra que existam nas células (ex.: N/A), no fim
    oficial = admin_statuses(path) or BASE_STATUSES
    status_list = oficial + sorted(statuses - set(oficial), key=str.lower)

    # colunas reais na folha (1-based), para a escrita via Excel/COM
    xlcols = {}
    for want, name in (("status tc", "Status TC"), ("status tp", "Status TP"),
                       ("obs", "OBS"), ("function/tc", "fn"),
                       ("function/tc", "Function/TC"), ("to do", "To Do")):
        if want in hidx:
            xlcols[name] = hidx[want] + 1

    warn_key = "warning_web" if path == GRAPH_PATH else "warning_locked"
    return {
        "warning": msg(warn_key, lang, t=f"{warning_ts:%H:%M}") if warning_ts else None,
        "sheet": real_sheet,
        "sheets": all_sheets,
        "xlcols": xlcols,
        "headers": headers,
        "rows": data_rows,
        "row_meta": row_meta,
        "statuses": status_list,
        "total_rows": total_rows,
        "person": person,
    }


def _relink_row(sheet, fn, todo, new_fn, new_todo):
    """Depois de o Function/TC ou o "To Do" mudarem mesmo na folha, refaz as
    ligações que usam a identidade da linha (aba||função||to do): a nota fixada
    na tarefa e os itens do TODO que apontam para ela. Sem isto, as ligações
    partiam-se em silêncio no Push."""
    old_key = f"{sheet}||{fn}||{todo}"
    new_key = f"{sheet}||{new_fn}||{new_todo}"

    notes = load_notes()
    if old_key in notes:
        notes[new_key] = notes.pop(old_key)
        save_notes(notes)

    todos = load_todo()
    changed = False
    sheet_norm = normalize(sheet)
    for item in todos:
        if not isinstance(item, dict):
            continue
        ref = item.get("ref")
        if not isinstance(ref, dict):
            continue
        # aba em branco = ligação antiga sem aba guardada; conta como
        # coincidência (mesma convenção do sync com o TODO em todos.py)
        ref_sheet = str(ref.get("sheet") or "")
        if ref_sheet and normalize(ref_sheet) != sheet_norm:
            continue
        if str(ref.get("fn") or "") != fn or str(ref.get("todo") or "") != todo:
            continue
        ref["fn"] = new_fn
        ref["todo"] = new_todo
        changed = True
    if changed:
        save_todo(todos)


def push_overrides(target=None):
    """Escreve no Excel/OneDrive as alterações de estado guardadas localmente.
    Devolve (ficheiro, enviadas, falhadas). Usado pelo /api/push e pela linha
    de comandos."""
    files = known_files()
    target = target or (files[0] if files else None)
    known = {os.path.normcase(p) for p in files}
    if graph_config():
        known.add(GRAPH_PATH)
    if not target or os.path.normcase(target) not in known:
        raise ValueError("ficheiro desconhecido")
    overrides = load_overrides()
    pushed, failed = 0, []
    # chaves novas já usadas nesta chamada (linhas renomeadas): impede que duas
    # linhas diferentes, ambas renomeadas para a mesma identidade neste mesmo
    # Push, fundam por engano as suas colunas pendentes numa só
    renamed_this_call = set()
    for key in list(overrides.keys()):
        sheet, _, rest = key.partition("||")
        fn, _, todo = rest.partition("||")
        entry = overrides.get(key)
        if not isinstance(entry, dict):
            continue
        coords = locate_row(target, sheet, fn, todo)
        if coords is None:
            failed.append({"fn": fn, "error": "linha não encontrada na folha"})
            continue
        xlrow, hidx = coords
        # o Function/TC e o "To Do" fazem parte da identidade da linha: se
        # forem escritos, a identidade muda e há ligações a refazer
        new_fn, new_todo = fn, todo
        # a escrita confirma sempre a célula do Function/TC antes de gravar;
        # depois de a mudarmos, as restantes colunas desta linha têm de ser
        # confirmadas com o valor novo
        guard_fn = fn
        for col_name, o in list(entry.items()):
            want = normalize(col_name)
            if want not in hidx or not isinstance(o, dict):
                failed.append({"fn": guard_fn, "error": f"coluna {col_name} não encontrada"})
                continue
            valor = o.get("value", "")
            ok, msg_text = write_status_to_excel(
                target, sheet, xlrow, hidx[want] + 1,
                hidx["function/tc"] + 1, guard_fn, valor)
            if ok:
                entry.pop(col_name)
                pushed += 1
                if col_name == "Function/TC":
                    new_fn = guard_fn = str(valor)
                elif col_name == "To Do":
                    new_todo = str(valor)
            else:
                failed.append({"fn": guard_fn, "error": msg_text})
        if (new_fn, new_todo) != (fn, todo):
            if entry:
                # ainda sobram colunas por enviar nesta linha: passam para a
                # chave nova, senão ficavam órfãs (a leitura seguinte calcula a
                # identidade a partir do conteúdo novo da folha) — a não ser que
                # outra linha deste mesmo Push já tenha sido renomeada para a
                # mesma identidade nova, caso em que fundir destruiria as
                # colunas de uma das duas linhas: fica por enviar e falha, em
                # vez de contaminar a linha errada
                new_key = f"{sheet}||{new_fn}||{new_todo}"
                if new_key in renamed_this_call:
                    for col_name in list(entry.keys()):
                        failed.append({"fn": guard_fn, "error":
                                       f"coluna {col_name} não enviada: outra linha "
                                       "deste Push ficou com a mesma identidade nova"})
                    entry = {}
                    overrides.pop(key, None)
                else:
                    overrides.pop(key, None)
                    destino = overrides.get(new_key)
                    if not isinstance(destino, dict):
                        destino = {}
                        overrides[new_key] = destino
                    destino.update(entry)
                    entry = destino
                    renamed_this_call.add(new_key)
            else:
                renamed_this_call.add(f"{sheet}||{new_fn}||{new_todo}")
            _relink_row(sheet, fn, todo, new_fn, new_todo)
        if not entry:
            overrides.pop(key, None)
    save_overrides(overrides)
    return target, pushed, failed


def _with_app_state(result):
    """Junta a qualquer resposta o estado que não depende do Excel (CCRs, TODO,
    pendentes, versão da app) — para essas vistas funcionarem à mesma quando
    não há nenhum ficheiro Excel disponível (ou a nuvem pede login)."""
    result["ccrs"] = load_ccrs()
    # TODO é totalmente manual: colunas/estado só mudam por ação explícita
    # do utilizador (drag/drop, checkbox, botões de cronómetro).
    result["todo"] = load_todo()
    result["pending"] = sum(len(v) for v in load_overrides().values() if isinstance(v, dict))
    ip = lan_ip()
    if ip:
        result["lan_url"] = f"http://{ip}:{config.SERVER_PORT}"
    result["app_version"] = f"v{APP_VERSION}"
    result["mode"] = "dev" if config.DEV_MODE else "stable"
    return result


def build_payload(query):
    person = query.get("person", [DEFAULT_PERSON])[0]
    sheet = query.get("sheet", [DEFAULT_SHEET])[0]
    show_all = query.get("all", ["0"])[0] == "1"
    wanted_file = query.get("file", [""])[0]
    # cycle=1 (só no botão "Atualizar"): se o Excel local bloquear o
    # ficheiro, fecha-o (gravando), lê os dados frescos e reabre-o
    cycle = query.get("cycle", ["0"])[0] == "1"
    # fresh=1 (botão "Atualizar"): deita fora tudo o que está em memória e lê o
    # livro de raiz, exatamente como na primeira abertura
    fresh = query.get("fresh", ["0"])[0] == "1"
    lang = query.get("lang", ["pt"])[0]
    # fonte dos dados: auto (web primeiro, ficheiro local em recurso),
    # onedrive (só a API do Excel) ou local (só o ficheiro)
    source = query.get("source", ["auto"])[0]
    if source not in ("auto", "onedrive", "local"):
        source = "auto"

    files = known_files()
    files_info = [{
        "path": p,
        "label": f"{os.path.basename(p)} ({os.path.basename(os.path.dirname(p))})",
        "modified": datetime.fromtimestamp(os.path.getmtime(p)).strftime("%d/%m/%Y %H:%M"),
    } for p in files]

    graph = graph_state()
    if graph["configured"]:
        files_info.insert(0, {"path": GRAPH_PATH,
                              "label": graph.get("book") or "OneDrive (web)",
                              "modified": ""})

    path = None
    web_ready = graph["configured"] and graph["connected"] and has_book()
    # em automático prefere-se a nuvem (Graph): a cópia sincronizada no disco
    # (twin) só entra como recurso, se a leitura da nuvem falhar mais abaixo —
    # ver o "a fonte web falhou" perto do fim desta função.
    twin = local_twin(files) if web_ready else None
    if source != "local" and web_ready:
        path = GRAPH_PATH
    elif source == "onedrive" and graph["configured"]:
        return _with_app_state({"error": msg("err_graph_login", lang),
                "hint": msg("hint_graph_login", lang),
                "files": files_info, "graph": graph, "source": "onedrive"})
    if path is None and wanted_file and wanted_file != GRAPH_PATH:
        for p in files:
            if os.path.normcase(p) == os.path.normcase(wanted_file):
                path = p
                break
    if path is None and files:
        path = files[0]  # o mais recente
    if path is None:
        return _with_app_state({
            "error": msg("err_nofile", lang),
            "hint": msg("hint_nofile", lang),
            "searched": CANDIDATE_DIRS,
            "files": files_info,
            "graph": graph,
        })
    cycle = cycle and path != GRAPH_PATH   # não há Excel local para fechar
    if fresh:
        # "Atualizar" limpa tudo o que está em memória, não só do ficheiro
        # atual: qualquer outro livro aberto nesta sessão também relê de raiz
        forget_cache(None)
        graph_forget_item()
        log_event(f"leitura de raiz pedida pelo utilizador ({os.path.basename(path)})")
    cache_key = (path, sheet, person, show_all, lang)
    sheet_read = sheet    # aba pedida à read_sheet (é a chave do _RAW_CACHE)
    try:
        result = read_sheet(path, sheet, person, show_all, lang)
        if result.get("error") and result.get("sheets"):
            # livro diferente do habitual: abre a primeira aba em vez de
            # falhar por a aba pedida não existir
            primeira = result["sheets"][0]
            sheet_read = primeira
            result = read_sheet(path, primeira, person, show_all, lang)
            if "error" not in result:
                result["notice"] = msg("notice_sheet", lang, s=primeira)
        if cycle and result.get("warning"):
            # o utilizador pediu "Atualizar" com o ficheiro bloqueado:
            # fechar o Excel (gravando), reler e reabrir
            log_event("ficheiro bloqueado no Atualizar - a fechar o Excel para atualizar")
            if close_excel_workbook(os.path.basename(path)):
                time.sleep(1.0)
                try:
                    result = read_sheet(path, sheet, person, show_all, lang)
                    result["notice"] = msg("notice_cycled", lang)
                finally:
                    os.startfile(path)
                log_event("Excel fechado, dados atualizados, Excel reaberto")
            else:
                log_event("não consegui fechar o Excel via COM")
        if "error" not in result and not result.get("warning"):
            _LAST_GOOD[cache_key] = (datetime.now(), result)
    except Exception as exc:  # ficheiro bloqueado pelo Excel, corrompido, etc.
        result = None
        if cycle:
            log_event("ficheiro bloqueado no Atualizar - a fechar o Excel para atualizar")
            if close_excel_workbook(os.path.basename(path)):
                time.sleep(1.0)
                try:
                    result = read_sheet(path, sheet, person, show_all, lang)
                    if "error" not in result:
                        _LAST_GOOD[cache_key] = (datetime.now(), result)
                        result["notice"] = msg("notice_cycled", lang)
                    os.startfile(path)
                    log_event("Excel fechado, dados atualizados, Excel reaberto")
                except Exception as exc2:
                    exc = exc2
                    result = None
                    log_event(f"leitura falhou mesmo depois de fechar o Excel ({exc2!r})")
            else:
                log_event("não consegui fechar o Excel via COM")
        if result is not None:
            pass  # leitura fresca conseguida com o ciclo fechar/reabrir
        elif (cached := _LAST_GOOD.get(cache_key)):
            ts, good = cached
            result = dict(good)
            result["warning"] = msg(
                "warning_web" if path == GRAPH_PATH else "warning_locked",
                lang, t=f"{ts:%H:%M}")
            log_event(f"leitura falhou ({exc!r}) - a servir cache das {ts:%H:%M}")
        else:
            result = {"error": msg("err_read", lang, e=exc),
                      "hint": msg("hint_web_read" if path == GRAPH_PATH else "hint_excel", lang)}

    result["file"] = path
    if path == GRAPH_PATH:
        if "error" in result and source == "auto" and files:
            # a fonte web falhou: continua com o ficheiro local (de preferência
            # a cópia sincronizada do livro escolhido, se existir uma)
            log_event(f"leitura web falhou ({result['error']}) - a usar o ficheiro local")
            fallback = dict(query)
            fallback["source"] = ["local"]
            if twin:
                fallback["file"] = [twin]
            result = build_payload(fallback)
            result["notice"] = msg("notice_graph_fallback", lang)
            result["graph"] = graph
            return result
        try:
            result["modified"], result["stamp"] = graph_modified()
        except GraphError:
            result["modified"] = result["stamp"] = ""
    else:
        mtime = os.path.getmtime(path)
        result["modified"] = datetime.fromtimestamp(mtime).strftime("%d/%m/%Y %H:%M")
        result["stamp"] = f"{mtime:.0f}"
        # a ler a cópia sincronizada: avisa quando a do OneDrive ainda está
        # diferente, para ninguém ficar a pensar que os dados estão parados
        cached = _RAW_CACHE.get((path, normalize(sheet_read)))
        if twin and path == twin and cached and not result.get("error"):
            try:
                if sync_gap(path, result["sheet"], cached[3], mtime):
                    aviso = msg("notice_syncing", lang)
                    result["notice"] = f"{result['notice']} · {aviso}" \
                        if result.get("notice") else aviso
            except GraphError as exc:
                log_event(f"não consegui comparar com a cópia do OneDrive ({exc})")
    result["files"] = files_info
    result["graph"] = graph
    result["source"] = "onedrive" if path == GRAPH_PATH else "local"
    result["synced_copy"] = bool(twin) and path == twin
    result = _with_app_state(result)
    # impressão digital do conteúdo servido: se o Excel mudou e isto não muda,
    # o problema está na origem (livro por gravar), não na app
    result["digest"] = hashlib.md5(
        json.dumps(result.get("rows") or [], ensure_ascii=False).encode("utf-8")
    ).hexdigest()[:8]
    return result


def current_stamp(query):
    """Marca de versão da fonte em uso, sem ler a folha. É o pedido barato que
    a interface repete para saber quando alguém gravou o livro."""
    path = query.get("file", [""])[0]
    try:
        if path == GRAPH_PATH:
            modified, stamp = graph_modified()
            return {"modified": modified, "stamp": stamp}
        # só ficheiros que a app conhece: evita transformar isto num "stat" livre
        if any(os.path.normcase(p) == os.path.normcase(path) for p in known_files()):
            mtime = os.path.getmtime(path)
            return {"modified": datetime.fromtimestamp(mtime).strftime("%d/%m/%Y %H:%M"),
                    "stamp": f"{mtime:.0f}"}
    except Exception as exc:
        return {"modified": "", "stamp": "", "error": str(exc)}
    return {"modified": "", "stamp": ""}


def warm_cache():
    """No arranque, tenta a primeira leitura até conseguir (ex.: à espera de o
    Excel fechar), para que nenhum dispositivo apanhe o servidor sem dados."""
    for _ in range(120):
        files = find_tracker_files()
        if files:
            key = (files[0], DEFAULT_SHEET, DEFAULT_PERSON, False, "pt")
            if key in _LAST_GOOD:      # um pedido normal já preencheu a cache
                return
            try:
                result = read_sheet(files[0], DEFAULT_SHEET, DEFAULT_PERSON, False)
                if "error" not in result:
                    _LAST_GOOD[key] = (datetime.now(), result)
                    log_event("cache inicial pronta")
                    return
            except Exception:
                pass  # ficheiro bloqueado — tentar outra vez daqui a pouco
        time.sleep(15)
