// My Organizer — vista do Excel: leitura, tabela e editores

// índices das colunas do tracker nesta folha (-1 = a coluna não existe)
function compactIdx(data) {
  const h = (data.headers || []).map(norm);
  const col = name => h.findIndex(x => x === norm(name));
  return {
    fn: col("Function/TC"),
    todo: col("To Do"),
    authorTC: col("Author TC"), reviewerTC: col("Reviewer TC"), statusTC: col("Status TC"),
    authorTP: col("Author TP"), reviewerTP: col("Reviewer TP"), statusTP: col("Status TP"),
    obs: col("OBS"),
  };
}

// Esta folha tem mesmo as colunas do tracker? Só nesse caso a vista resumida
// normal (editável) existe — as outras folhas dependem do mapa de colunas
// escolhido nas Definições (ver buildCustomCompact).
function hasCanonicalCompact(data) {
  if (!data || data.error || !(data.headers || []).length) return false;
  const idx = compactIdx(data);
  return idx.fn >= 0 && idx.authorTC >= 0 && idx.statusTC >= 0;
}

// Esta folha tem alguma vista resumida ativa — a do tracker ou uma personalizada
// gravada nas Definições (ver viewmap.js) — só usado para o texto do botão
// ("Criar" vs "Editar"). "Lados" continua exclusivo da vista do tracker,
// ver hasCanonicalCompact em setViewMapOpen (viewmap.js).
function hasResumedView(data) {
  return hasCanonicalCompact(data) || !!loadViewMap(data);
}

/* Constrói a vista resumida a partir das colunas do tracker:
   TCs/Funções · Papel (Autor/Reviewer de TC/TP) · Estado · O que fazer */
function buildCompact(data) {
  if (!hasCanonicalCompact(data)) return null;
  const idx = compactIdx(data);

  const me = norm(PERSON);
  const meTokens = me.split(" ").filter(t => t.length >= 4);
  const val = (row, i) => (i >= 0 && row[i]) ? String(row[i]).trim() : "";
  // aceita "Carlos Andrade" mas também só "Carlos"/"Andrade" (nomes inconsistentes na folha)
  const isMe = (row, i) => {
    const c = norm(val(row, i));
    return c.includes(me) || meTokens.includes(c);
  };

  // uma vertente (TC/TP) só conta se o estado dela for real:
  // "N/A" ou vazio significa que não é suposto ser feita
  const applicable = s => { const t = norm(s); return t !== "" && t !== "n/a"; };

  // quem está na linha (autor/reviewer de cada vertente), para as linhas que
  // não são minhas: sem isto ficava só "Mencionado", sem dizer de quem é
  // (os nomes vêm do row_meta; a célula da linha serve de reserva, porque uma
  // coluna toda vazia é retirada da resposta e deixa de ter índice aqui)
  const peopleOf = (meta, row) => {
    const p = (meta && meta.people) || {};
    const quem = (k, i) => String(p[k] || val(row, i) || "").trim();
    return [
      [t("role_author_tc"), quem("author_tc", idx.authorTC)],
      [t("role_reviewer_tc"), quem("reviewer_tc", idx.reviewerTC)],
      [t("role_author_tp"), quem("author_tp", idx.authorTP)],
      [t("role_reviewer_tp"), quem("reviewer_tp", idx.reviewerTP)],
      // "N/A" na coluna do autor/reviewer quer dizer "ninguém", não um nome
    ].filter(([, nome]) => nome && norm(nome) !== "n/a");
  };

  const rows = data.rows.map((row, ri) => {
    // elementos 4+ não são colunas visíveis: side (filtros), meta e
    // colunas de cada linha de estado (edição de estados)
    const meta = (data.row_meta || [])[ri] || null;
    const okTC = applicable(val(row, idx.statusTC));
    const okTP = applicable(val(row, idx.statusTP));
    const rolesTC = [];
    if (okTC && isMe(row, idx.authorTC)) rolesTC.push(t("role_author"));
    if (okTC && isMe(row, idx.reviewerTC)) rolesTC.push(t("role_reviewer"));
    const rolesTP = [];
    if (okTP && isMe(row, idx.authorTP)) rolesTP.push(t("role_author"));
    if (okTP && isMe(row, idx.reviewerTP)) rolesTP.push(t("role_reviewer"));

    const parts = [];
    for (const role of [t("role_author"), t("role_reviewer")]) {
      const scopes = [];
      if (rolesTC.includes(role)) scopes.push("TC");
      if (rolesTP.includes(role)) scopes.push("TP");
      if (scopes.length) parts.push(`${role} ${scopes.join("+")}`);
    }
    let papel = parts.join(", ");
    // chave de papel usada pelos filtros/contadores (elemento 9): continua a
    // ser "Autor"/"Reviewer"/"Mencionado" mesmo quando a coluna passa a mostrar
    // nomes de outras pessoas, para os botões do resumo não mudarem de sentido
    let roleKey = papel;
    const sTC = val(row, idx.statusTC), sTP = val(row, idx.statusTP);
    if (!parts.length) {
      const soVertentesNA = [idx.authorTC, idx.reviewerTC, idx.authorTP, idx.reviewerTP]
        .some(i => isMe(row, i));
      // nada é suposto ser feito nesta tarefa (só me toca em vertentes N/A) —
      // em "Ver tudo" a linha fica na mesma, senão a vista escondia linhas
      if (soVertentesNA && !showAll) return null;
      // nomes/"sem responsável" só em "Ver tudo" — na vista pessoal mantém-se
      // "Mencionado" como sempre foi, para não mudar o que já lá estava
      if (showAll) {
        const quem = peopleOf(meta, row);
        if (quem.length) papel = quem.map(([r, nome]) => `${r}: ${nome}`).join("\n");
        // ninguém atribuído numa linha que é mesmo para fazer: é preciso saber-se
        else if (applicable(sTC) || applicable(sTP)) papel = t("role_unassigned");
        else papel = t("role_mentioned");
        roleKey = papel === t("role_unassigned") ? t("role_unassigned") : t("role_mentioned");
      } else {
        papel = t("role_mentioned");
        roleKey = t("role_mentioned");
      }
    }

    const lines = [], linesCols = [];
    if (rolesTC.length && sTC && norm(sTC) !== "n/a") { lines.push("TC: " + sTC); linesCols.push("Status TC"); }
    if (rolesTP.length && sTP && norm(sTP) !== "n/a") { lines.push("TP: " + sTP); linesCols.push("Status TP"); }
    // linha que não é minha: mostra as vertentes que existem mesmo
    if (!lines.length && !parts.length) {
      if (applicable(sTC)) { lines.push("TC: " + sTC); linesCols.push("Status TC"); }
      if (applicable(sTP)) { lines.push("TP: " + sTP); linesCols.push("Status TP"); }
    }
    if (!lines.length && sTC) { lines.push(sTC); linesCols.push("Status TC"); }
    const estado = lines.length === 1 ? lines[0].replace(/^TC: |^TP: /, "") : lines.join("\n");

    const sides = [];
    if (rolesTC.length) sides.push(sideOf(rolesTC[0], sTC));
    if (rolesTP.length) sides.push(sideOf(rolesTP[0], sTP));
    const side = sides.includes("On my side") ? "On my side"
      : sides.includes("On the other side") ? "On the other side"
        : sides.includes("Done") ? "Done"
          // só vertentes removidas: a linha não conta para nenhum dos lados
          : sides.includes("Removed") ? null
            : "On the other side";

    let resumo = val(row, idx.todo);
    // valor cru da coluna "To Do" (antes do resumo gerado e antes de lhe ser
    // colada a OBS): é este que o editor grava, para nunca escrever na folha
    // o texto que a app gerou sozinha
    const rawTodo = resumo;
    if (!resumo) {
      // linhas de review costumam ter o "To Do" vazio — gera um resumo a partir do papel
      const gen = [];
      if (rolesTC.includes(t("role_reviewer"))) gen.push(`${t("review_tc")} ${val(row, idx.authorTC) || "?"}`);
      if (rolesTP.includes(t("role_reviewer"))) gen.push(`${t("review_tp")} ${val(row, idx.authorTP) || "?"}`);
      resumo = gen.join("\n") || "—";
    }
    const obs = val(row, idx.obs);
    if (obs) resumo += "\u001F" + obs;   // separador interno para formatar a OBS à parte

    const execDisplay = execSummary(meta);
    // elementos 10/11: informação completa da linha (todas as pessoas e ambos os
    // estados aplicáveis), usada só pelo bloco de info do TODO — a coluna "Papel"
    // e o "Estado" da vista resumida continuam a ser os elementos 1/2
    const peopleInfo = peopleOf(meta, row);
    const statusAll = [];
    if (applicable(sTC)) statusAll.push(["Status TC", "TC: " + sTC]);
    if (applicable(sTP)) statusAll.push(["Status TP", "TP: " + sTP]);
    return [val(row, idx.fn), papel, estado, resumo, execDisplay, side, meta, linesCols, rawTodo, roleKey, peopleInfo, statusAll];
  }).filter(Boolean);

  return { headers: compactHeaders(), rows };
}

// resumo de texto da nota de execução (etiqueta + checklist + nota)
function execSummary(meta) {
  const n = meta && meta.note;
  if (!n) return "";
  const feitos = n.checks
    ? CHECKS.filter(([k]) => n.checks[k]).map(([, , s]) => s).join(" ")
    : "";
  return [n.tag, feitos, n.note].filter(Boolean).join("\n");
}

const compactHeaders = () =>
  [t("hdr_fn"), t("hdr_role"), t("hdr_status"), t("hdr_todo"), t("hdr_exec")];

// negrito nas palavras que "explicam" porque a linha está à vista: os termos
// de pesquisa ativos e o meu nome (mesmo sem pesquisa, é sempre a mim que a
// vista pessoal filtra) — meTokens repete o limiar de buildCompact (isMe)
function highlightTerms(text) {
  const full = norm(PERSON);
  const tokens = full.split(" ").filter(w => w.length >= 4);
  const terms = activeSearchTerms().concat([full], tokens).filter(Boolean);
  return boldTerms(text, terms);
}

/* ---------- vista resumida à medida (qualquer folha, só leitura) ----------
   Para folhas sem as colunas do tracker, o utilizador define nas Definições,
   por categoria, a célula inicial do Excel, a orientação e o tamanho (ver
   viewmap.js) — o servidor (build_cell_categories, cswaios/tasks.py) lê e
   concatena as células e devolve o resultado em data.cell_view. Categorias são
   livres (sem campo fixo Autor/Reviewer/Estado), por isso esta vista não tem
   papel/lado (sideOf) nem estados editáveis: é sempre texto simples. */
const VIEWMAP_PREFIX = "bsp-tracker-viewmap";
const PREDEFLIST_PREFIX = "bsp-tracker-predeflists";

function viewMapKey(data) {
  return `${VIEWMAP_PREFIX}:${(data && data.file) || ""}:${(data && data.sheet) || ""}`;
}

function predefListKey(data) {
  return `${PREDEFLIST_PREFIX}:${(data && data.file) || ""}:${(data && data.sheet) || ""}`;
}

// biblioteca de listas predefinidas desta aba (botão na barra, ver viewmap.js):
// [{id, name, mode, values, sheet, cell, orientation, size}, ...], por
// livro+aba, independente do mapa de categorias — uma categoria com
// useList=true e listMode="fixed" escolhe uma destas pelo id (ver
// renderViewMapRows). mode="manual" usa `values` (valores literais); mode=
// "range" lê ao vivo um intervalo do próprio livro (sheet+cell+orientation+
// size), tal como o listMode="range" de uma categoria — ver buildTasksQuery,
// mais abaixo, para como isso é traduzido no pedido ao servidor.
function loadPredefLists(data) {
  if (!data || !data.sheet) return [];
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(predefListKey(data)) || "null");
  } catch (e) {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(l => l && typeof l === "object" && String(l.id || "").trim())
    .map(l => {
      const size = parseInt(l.size, 10);
      return {
        id: String(l.id),
        name: String(l.name || "").trim(),
        mode: l.mode === "range" ? "range" : "manual",
        values: Array.isArray(l.values) ? l.values.map(v => String(v || "").trim()).filter(Boolean) : [],
        sheet: String(l.sheet || "").trim(),
        cell: String(l.cell || "").trim(),
        orientation: l.orientation === "horizontal" ? "horizontal" : "vertical",
        size: Number.isFinite(size) && size > 0 ? size : "",
      };
    });
}

function savePredefLists(data, lists) {
  if (!data || !data.sheet) return;
  const cleaned = (lists || []).filter(l => l && String(l.id || "").trim() && String(l.name || "").trim() &&
    (l.mode === "range" ? String(l.cell || "").trim() : l.values.length));
  if (cleaned.length) {
    localStorage.setItem(predefListKey(data), JSON.stringify(cleaned));
  } else {
    localStorage.removeItem(predefListKey(data));
  }
}

// { categories: [{name, startCell, orientation, size, useList, listMode,
// listSheet, listCell, listOrientation, listSize, listId}, ...], exec: bool }.
// size vazio/nulo = 1 célula (a própria startCell); só > 1 concatena as
// células seguintes na mesma linha/coluna (ver build_cell_categories,
// cswaios/tasks.py). Com useList=true, a categoria fica editável através de
// uma lista de valores predefinida em vez de simples texto — ver
// openCellCatEditor. A lista vem de uma de duas fontes (listMode): "range"
// lê um intervalo do próprio livro (listSheet+listCell+listOrientation+
// listSize); "fixed" escolhe (por listId) uma lista guardada na biblioteca
// desta aba (ver loadPredefLists/savePredefLists, renderViewMapRows).
// Formatos antigos (antes desta versão, um objeto {slot: [nomes de coluna]})
// são descartados: não há como migrar um nome de coluna para uma coordenada.
function loadViewMap(data) {
  if (!data || !data.sheet) return null;
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(viewMapKey(data)) || "null");
  } catch (e) {
    return null;
  }
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.categories)) return null;
  const categories = raw.categories.filter(c => c && typeof c === "object" && c.startCell).map(c => {
    const size = parseInt(c.size, 10);
    const listSize = parseInt(c.listSize, 10);
    const listMode = c.listMode === "fixed" ? "fixed" : "range";
    const useList = !!c.useList && (
      listMode === "fixed" ? !!String(c.listId || "").trim()
        : (String(c.listSheet || "").trim() && String(c.listCell || "").trim()));
    return {
      name: String(c.name || "").trim(),
      startCell: String(c.startCell || "").trim(),
      orientation: c.orientation === "vertical" ? "vertical" : "horizontal",
      size: Number.isFinite(size) && size > 0 ? size : "",
      useList: !!useList,
      listMode,
      listSheet: String(c.listSheet || "").trim(),
      listCell: String(c.listCell || "").trim(),
      listOrientation: c.listOrientation === "horizontal" ? "horizontal" : "vertical",
      listSize: Number.isFinite(listSize) && listSize > 0 ? listSize : "",
      listId: String(c.listId || "").trim(),
    };
  });
  const exec = !!raw.exec;
  return (categories.length || exec) ? { categories, exec } : null;
}

function saveViewMap(data, cfg) {
  if (!data || !data.sheet) return;
  const categories = (cfg && cfg.categories || []).filter(c => c && c.startCell);
  const exec = !!(cfg && cfg.exec);
  if (categories.length || exec) {
    localStorage.setItem(viewMapKey(data), JSON.stringify({ categories, exec }));
  } else {
    localStorage.removeItem(viewMapKey(data));
  }
}

/* ---------- filtros personalizados (qualquer folha, por livro+aba) ----------
   Regras 100% à medida do utilizador: nome (etiqueta do botão no resumo) e um
   ou mais grupos de condições (coluna real da folha — o nome verbatim, tal
   como em row_meta[].orig, por isso funciona em qualquer folha, mesmo sem as
   colunas do tracker — operador e valor). Dentro de um grupo todas as
   condições têm de bater certo (E); um filtro bate certo se PELO MENOS UM dos
   seus grupos bater (OU entre grupos) — ver `groups` e evalCustomFilter, mais
   abaixo. Um filtro com um único grupo comporta-se como "todas em E", tal
   como antes de existirem grupos. `usePerson` substitui o valor pelo PERSON
   atual (com a mesma tolerância a nomes parciais que author/reviewer já
   tinham), para "o que é meu" deixar de estar preso às 4 colunas fixas do
   tracker. "está numa lista"/"não está numa lista" refere-se antes a uma das
   Listas predefinidas desta aba (biblioteca partilhada com as categorias da
   vista à medida, ver loadPredefLists) em vez de um valor literal — ver
   customFilterListValues, mais abaixo, para como as listas mode="range"
   (lidas ao vivo do livro) chegam resolvidas do servidor. Vários filtros
   ativos em simultâneo combinam-se sempre em E entre si (ver
   activeCustomFilters, mais abaixo). */
const CUSTOMFILTER_PREFIX = "bsp-tracker-customfilters";
const CUSTOMFILTER_OPS = ["contains", "not_contains", "equals", "not_equals", "empty", "not_empty",
  "in_list", "not_in_list"];

function customFilterKey(data) {
  return `${CUSTOMFILTER_PREFIX}:${(data && data.file) || ""}:${(data && data.sheet) || ""}`;
}

function cleanCustomCondition(c) {
  return {
    column: String((c && c.column) || "").trim(),
    op: CUSTOMFILTER_OPS.includes(c && c.op) ? c.op : "contains",
    value: String((c && c.value) || ""),
    usePerson: !!(c && c.usePerson),
    listId: String((c && c.listId) || "").trim(),
  };
}

function cleanCustomGroup(g) {
  return { conditions: ((g && g.conditions) || []).map(cleanCustomCondition).filter(c => c.column) };
}

// filtros gravados antes de haver grupos tinham coluna/operador/valor
// diretamente no filtro (condição única) ou um array `conditions` plano com
// `logic` a decidir E/OU entre todas — migra-os para grupos em memória (a
// gravação seguinte já usa o formato novo): logic="and" vira um único grupo
// com todas as condições (mesmo resultado: todas em E); logic="or" vira um
// grupo por condição (mesmo resultado: basta uma bater certo)
function customFilterGroupsFrom(f) {
  if (Array.isArray(f.groups)) {
    return f.groups.map(cleanCustomGroup).filter(g => g.conditions.length);
  }
  const conditions = (Array.isArray(f.conditions) ? f.conditions : [f]).map(cleanCustomCondition).filter(c => c.column);
  if (!conditions.length) return [];
  return f.logic === "or" ? conditions.map(c => ({ conditions: [c] })) : [{ conditions }];
}

function loadCustomFilters(data) {
  if (!data || !data.sheet) return [];
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(customFilterKey(data)) || "null");
  } catch (e) {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(f => f && typeof f === "object" && String(f.id || "").trim())
    .map(f => ({
      id: String(f.id),
      name: String(f.name || "").trim(),
      groups: customFilterGroupsFrom(f),
    }))
    .filter(f => f.groups.length);
}

function saveCustomFilters(data, filters) {
  if (!data || !data.sheet) return;
  const cleaned = (filters || [])
    .map(f => ({
      id: String((f && f.id) || "").trim(),
      name: String((f && f.name) || "").trim(),
      groups: ((f && f.groups) || []).map(cleanCustomGroup).filter(g => g.conditions.length),
    }))
    .filter(f => f.id && f.name && f.groups.length);
  if (cleaned.length) {
    localStorage.setItem(customFilterKey(data), JSON.stringify(cleaned));
  } else {
    localStorage.removeItem(customFilterKey(data));
  }
}

// colunas reais desta folha (nomes verbatim), pela ordem da folha — vêm de
// row_meta[].orig (ver read_sheet, cswaios/tasks.py), que tem sempre todas as
// colunas, mesmo as que a vista escondeu por estarem vazias
function customFilterColumns(data) {
  const seen = new Set(), out = [];
  (data && data.row_meta || []).forEach(m => {
    if (!m || !m.orig) return;
    Object.keys(m.orig).forEach(k => { if (!seen.has(k)) { seen.add(k); out.push(k); } });
  });
  return out;
}

// valores de cada lista predefinida referenciada por alguma condição (op
// in_list/not_in_list): mode="manual" já tem os valores no localStorage;
// mode="range" vem resolvido do servidor em data.filter_lists (ver
// tabQuery/build_payload, cswaios/tasks.py) porque só ele pode ler ao vivo o
// intervalo do livro.
function customFilterListValues(data, filters) {
  const predefLists = loadPredefLists(data);
  const out = {};
  (filters || []).forEach(f => (f.groups || []).forEach(g => (g.conditions || []).forEach(c => {
    if ((c.op !== "in_list" && c.op !== "not_in_list") || !c.listId || out[c.listId]) return;
    const list = predefLists.find(l => l.id === c.listId);
    out[c.listId] = !list ? []
      : list.mode === "range" ? ((data && data.filter_lists && data.filter_lists[c.listId]) || [])
        : list.values;
  })));
  return out;
}

function evalCustomCondition(meta, c, listValuesById) {
  const raw = String((meta && meta.orig && meta.orig[c.column]) || "");
  if (c.op === "empty") return !raw.trim();
  if (c.op === "not_empty") return !!raw.trim();
  const cell = norm(raw);
  if (c.op === "in_list" || c.op === "not_in_list") {
    const values = (listValuesById && listValuesById[c.listId]) || [];
    const hit = values.some(v => norm(v) === cell);
    return c.op === "in_list" ? hit : !hit;
  }
  let hit;
  if (c.usePerson) {
    const me = norm(PERSON);
    const tokens = me.split(" ").filter(tk => tk.length >= 4);
    hit = (!!me && cell.includes(me)) || tokens.some(tk => cell === tk);
  } else {
    const val = norm(c.value || "");
    hit = (c.op === "equals" || c.op === "not_equals") ? cell === val : cell.includes(val);
  }
  return (c.op === "not_contains" || c.op === "not_equals") ? !hit : hit;
}

// um filtro bate certo se pelo menos um dos seus grupos bater (OU entre
// grupos); dentro de cada grupo, todas as condições têm de bater certo (E) —
// um filtro de um único grupo dá o mesmo resultado que "todas em E" de antes
// dos grupos existirem. Filtros diferentes continuam sempre em E entre si
// (ver activeCustomFilters, mais abaixo)
function evalCustomFilter(meta, f, listValuesById) {
  const groups = f.groups || [];
  return groups.some(g => (g.conditions || []).every(c => evalCustomCondition(meta, c, listValuesById)));
}

function buildCustomCompact(data) {
  const cv = data && data.cell_view;
  const cfg = loadViewMap(data);
  const catHeaders = (cv && cv.headers) || [];
  const execOn = !!(cfg && cfg.exec);
  if (!catHeaders.length && !execOn) return null;

  const headers = execOn ? [...catHeaders, t("hdr_exec")] : catHeaders;
  const execIdx = execOn ? headers.length - 1 : -1;
  const catRows = (cv && cv.rows) || [];
  // categorias com useList=true (ver openCellCatEditor): coluna real (0-based),
  // opções da lista e, por linha, se há alteração local por enviar + o valor
  // cru da folha (para o Push saber comparar, tal como meta.orig nas colunas fixas)
  const useList = (cv && cv.useList) || [];
  const catCols = (cv && cv.cols) || [];
  const catLists = (cv && cv.lists) || [];
  const catOptions = (cv && cv.options) || [];
  const pendingRows = (cv && cv.pending) || [];
  const baseRows = (cv && cv.base) || [];
  const rows = (data.row_meta || []).map((meta, ri) => {
    const vals = (catRows[ri] || catHeaders.map(() => "")).slice();
    if (execOn) vals.push(execSummary(meta));
    if (meta) {
      meta.cellcatPending = pendingRows[ri] || [];
      meta.cellcatBase = baseRows[ri] || [];
    }
    vals.push(meta || null);
    return vals;
  });

  return { headers, rows, custom: true, execIdx, useList, catCols, catLists, catOptions };
}

let lastSelectorsSig = "";

// localiza a meta de uma linha do Excel pelo nº da linha real na folha —
// ao contrário de currentMeta (só as linhas atualmente filtradas na vista do
// Excel), isto funciona a partir de qualquer vista (ex.: o painel da tarefa
// dentro de um TODO). Usa-se o xlrow (não função+"to do") porque há linhas
// com a mesma função e "to do" em branco — só o nº de linha é mesmo único.
function metaByRow(xlrow) {
  const list = (lastData && lastData.row_meta) || [];
  return list.find(m => m && String(m.xlrow) === String(xlrow)) || null;
}

// depois de cancelar/fechar um editor aberto a partir de QUALQUER vista (a
// mesma célula pode ter sido clonada para o TODO ou para a caixa de detalhe),
// as duas têm de ser refeitas — cada uma já trata sozinha de repor a caixa
function refreshTaskViews() {
  render();
  if (currentView === "todo") renderTodo();
}

// display existe só para o texto visível: a classificação por cor
// (statusClass) continua a usar o estado cru, para a anotação da coluna
// ("in review (Status TP)") não estragar o reconhecimento do estado
function badgeHtml(text, col, meta, editable = meta && (col === "Status TC" || col === "Status TP"), display = text, colTag = "") {
  const local = !!(meta && meta.over && meta.over[col]);
  const title = local ? t("t_local") : t("t_edit_status");
  return `<span class="badge ${statusClass(text)}${local ? " local" : ""}"` +
    // data-rawstatus guarda o texto sem a anotação da coluna (ex.: sem "(Status TP)")
    // — openStatusEditor lê daqui, nunca do innerText do badge, senão o valor
    // gravado no Excel viria com a anotação colada por engano
    (editable ? ` data-xlrow="${esc(meta.xlrow)}" data-col="${esc(col)}" data-rawstatus="${esc(text)}" title="${title}"` : "") +
    `>${colTag}${highlightTerms(display)}${local ? " ✎" : ""}</span>`;
}

// categoria livre com lista predefinida (useList=true na vista mapeada à
// medida, ver openCellCatEditor): texto clicável, tal como o Function/TC e o
// "To Do" — sem cor por estado (statusClass), porque o valor não é
// necessariamente um "estado". col0/options/list vêm de compact.catCols/
// catOptions/catLists (build_cell_categories, cswaios/tasks.py), na mesma
// posição que este cabeçalho.
function cellCatHtml(text, colIdx, meta, compact) {
  const pending = !!(meta && meta.cellcatPending && meta.cellcatPending[colIdx]);
  const base = (meta && meta.cellcatBase && meta.cellcatBase[colIdx]) || "";
  const options = (compact.catOptions || [])[colIdx] || [];
  const col0 = (compact.catCols || [])[colIdx];
  const list = (compact.catLists || [])[colIdx] || null;
  const title = pending ? t("t_local") : t("t_edit_cellcat");
  return `<span class="cellcatText${pending ? " local" : ""}"` +
    ` data-catxlrow="${esc(meta.xlrow)}" data-catcol="${esc(col0)}" data-catbase="${esc(base)}"` +
    ` data-catoptions="${esc(JSON.stringify(options))}" data-catlist="${esc(JSON.stringify(list))}"` +
    ` title="${esc(title)}">${highlightTerms(text)}${pending ? " ✎" : ""}</span>`;
}

// a OBS do Excel é editável: escrever aqui fica como alteração local (✎) e
// só chega à folha no Push, tal como os estados. O valor atual (já com
// qualquer alteração local aplicada) vem em data-obscur — meta.over só guarda
// um booleano (há alteração ou não), não o texto, por isso não chega aqui.
function obsHtml(obs, meta) {
  const editable = !!(meta && lastData && (lastData.xlcols || {})["OBS"]);
  const local = !!(meta && meta.over && meta.over["OBS"]);
  const attrs = editable
    ? ` data-obsxlrow="${esc(meta.xlrow)}" data-obscur="${esc(obs || "")}" title="${t("t_edit_obs")}"`
    : "";
  if (!obs) return editable ? `<span class="obs addnote"${attrs}>${t("addobs")}</span>` : "";
  return `<span class="obs${local ? " local" : ""}"${attrs}>${t("obs_prefix")} ${highlightTerms(obs)}${local ? " ✎" : ""}</span>`;
}

// O Function/TC também é editável: fica alteração local (✎) até ao Push.
// data-fncur leva o valor atual (já com qualquer alteração local aplicada),
// porque meta.orig guarda sempre o valor da folha — sem isto, reabrir o editor
// antes do Push mostrava o valor antigo em vez do que se acabou de escrever.
function fnHtml(fn, meta) {
  const editable = !!(meta && lastData && (lastData.xlcols || {})["Function/TC"]);
  const local = !!(meta && meta.over && meta.over["Function/TC"]);
  const attrs = editable
    ? ` data-fnxlrow="${esc(meta.xlrow)}" data-fncur="${esc(fn || "")}" title="${local ? t("t_local") : t("t_edit_fn")}"`
    : "";
  return `<span class="fnText${local ? " local" : ""}"${attrs}>${highlightTerms(fn)}${local ? " ✎" : ""}</span>`;
}

// O "To Do" também é editável, tal como a OBS — grava como alteração local e
// só chega à folha no Push. rawTodo é o valor real da coluna (sem o resumo
// gerado quando a célula está vazia), para o editor nunca gravar texto gerado.
// "col" é a coluna real onde a alteração vai ser escrita: "To Do" na vista do
// tracker, o próprio texto do cabeçalho na vista mapeada à medida.
function todoTextHtml(display, rawTodo, meta, col = "To Do",
  editable = !!(meta && lastData && (lastData.xlcols || {})["To Do"]), colTag = "") {
  const local = !!(meta && meta.over && meta.over[col]);
  const attrs = editable
    ? ` data-todoxlrow="${esc(meta.xlrow)}" data-todocur="${esc(rawTodo || "")}" data-todocol="${esc(col)}" title="${local ? t("t_local") : t("t_edit_todo")}"`
    : "";
  return `<span class="todoText${local ? " local" : ""}"${attrs}>${colTag}${highlightTerms(display)}${local ? " ✎" : ""}</span>`;
}

// conteúdo da célula de execução (etiqueta, checklist e nota)
function execCellHtml(meta) {
  const n = meta && meta.note;
  let inner = "";
  if (n && n.tag) inner += `<span class="badge ${tagClass(n.tag)}">${esc(tagDisplay(n.tag))}</span>`;
  if (n && n.checks && Object.values(n.checks).some(Boolean)) {
    inner += `<span class="chips">` + CHECKS.map(([k, label, short]) =>
      `<span class="chip${n.checks[k] ? " done" : ""}" title="${esc(t(label))}">${esc(short)}${n.checks[k] ? " ✓" : ""}</span>`
    ).join("") + `</span>`;
  }
  if (n && n.note) inner += `<span class="obs">${esc(n.note)}</span>`;
  if (!inner) inner = `<span class="addnote">${t("addnote")}</span>`;
  // não escapar aqui: quem chama já faz esc(title) ao inserir no atributo —
  // escapar também aqui duplicaria entidades (& -> &amp;amp;)
  const title = (n && n.updated ? `${t("t_updated")} ${n.updated} — ` : "") + t("t_edit_note");
  return { inner, title };
}

function populateSelectors(data) {
  const files = data.files || [];
  const sheets = data.sheets || [];
  // com a fonte web (ou a cópia sincronizada dela) não há ficheiro local a escolher
  const web = data.source === "onedrive" || data.synced_copy;
  // servidor antigo (sem listas): esconde os seletores em vez de os mostrar vazios
  $("fileSelect").parentElement.classList.toggle("hidden", web || !files.length);
  $("sheetSelect").parentElement.classList.toggle("hidden", !sheets.length);
  // fonte web: o nome do livro deste separador fica ao lado da aba
  // (clicar abre a janela de abrir outro livro)
  const livro = web ? (activeBookName() || graphInfo.book || (files[0] || {}).label || "") : "";
  $("bookField").classList.toggle("hidden", !livro);
  if (livro) {
    $("bookQuick").textContent = livro;
    $("bookQuick").title = t("t_book_quick");
  }

  // só reconstrói quando algo mudou — senão a atualização automática
  // fechava um dropdown aberto
  const tab = activeTab();
  const sig = JSON.stringify([files, sheets, data.file || tabFile(tab), data.sheet || (tab && tab.sheet)]);
  if (sig === lastSelectorsSig) return;
  lastSelectorsSig = sig;

  const chosen = data.file || tabFile(tab);
  $("fileSelect").innerHTML =
    `<option value="">${t("newest")}</option>` +
    files.map(f =>
      `<option value="${esc(f.path)}"${f.path === chosen ? " selected" : ""} title="${esc(f.path)}">${esc(f.label)}${f.modified ? " \u2014 " + esc(f.modified) : ""}</option>`
    ).join("");

  const current = data.sheet || (tab && tab.sheet) || "";
  $("sheetSelect").innerHTML =
    sheets.map(s => `<option${s === current ? " selected" : ""}>${esc(s)}</option>`).join("");
}

// --- pesquisa com vários termos ---
// Termos ativos = os fixados (Enter) mais o que está a ser escrito na caixa.
function activeSearchTerms() {
  const terms = searchTerms.map(norm).filter(Boolean);
  const live = norm($("search").value);
  if (live && !terms.includes(live)) terms.push(live);
  return terms;
}

// texto legível dos termos ativos, para as mensagens de "sem resultados"
function searchLabel() {
  const sep = ` ${t(searchMode === "and" ? "search_and" : "search_or")} `;
  return searchTerms.concat([$("search").value.trim()]).filter(Boolean).join(sep);
}

function pinSearchTerm() {
  const termo = $("search").value.trim();
  if (!termo) return;
  const dup = searchTerms.some(s => norm(s) === norm(termo));
  if (dup) toast(t("search_dup"), "err");
  else searchTerms.push(termo);
  $("search").value = "";
  render();
}

function renderSearchChips() {
  const box = $("searchChips"), btn = $("searchMode");
  box.innerHTML = searchTerms.map((s, i) =>
    `<span class="chip" data-i="${i}" title="${t("t_chip_del")}">${esc(s)}<b>×</b></span>`).join("");
  box.classList.toggle("hidden", !searchTerms.length);
  btn.classList.toggle("hidden", !searchTerms.length);
  btn.textContent = t(searchMode === "and" ? "search_and" : "search_or");
  btn.title = t(searchMode === "and" ? "t_search_and" : "t_search_or");
}

// A versão vive num canto fixo da página (canto inferior direito), fora da
// barra de informação — assim está sempre à vista, seja qual for a vista.
function renderVersionBadge(data) {
  const el = $("verBadge");
  const v = data && data.app_version;
  el.classList.toggle("hidden", !v);
  if (!v) return;
  el.innerHTML = (data.mode === "dev" ? `<span class="devbadge">DEV</span> ` : "") +
    `csw.ai.os ${esc(v)}`;
}

function render() {
  if (editorOpen) return;  // não destruir um editor de nota/estado a meio
  const data = lastData;
  const box = $("stateBox"), tbl = $("tablebox");
  $("summary").innerHTML = "";
  renderSearchChips();

  if (!data) return;
  renderVersionBadge(data);
  // instância de desenvolvimento: marcar bem, para não se confundir com a estável
  if (data.mode === "dev" && !document.body.classList.contains("devmode")) {
    document.body.classList.add("devmode");
    document.title = "DEV — My Organizer";
    document.querySelector("header h1").textContent = "My Organizer (DEV)";
  }

  // com alterações locais pendentes, o "Atualizar" passa a "Push"
  // (fica antes do ramo de erro: o Push funciona mesmo com o ficheiro bloqueado)
  const web = data.source === "onedrive";
  // fonte web: não há ficheiro local para descarregar nem Excel para fechar
  $("fetchBtn").classList.toggle("hidden", web);
  const pending = data.pending || 0;
  const pushLabel = pending ? `${t("btn_push")} (${pending})` : t("btn_refresh");
  $("refresh").textContent = pushLabel;
  $("reloadOnly").classList.toggle("hidden", !pending);
  $("clearLocals").classList.toggle("hidden", !pending);
  // o mesmo botão na página Por fazer, para não ser preciso voltar às Tarefas
  // só para enviar (só aparece quando há mesmo algo por enviar)
  $("refreshTodo").textContent = pushLabel;
  $("refreshTodo").title = t("t_push_todo");
  $("refreshTodo").classList.toggle("hidden", !pending);

  // sem nenhum livro aberto o painel das tarefas não tem nada que mostrar
  // (quem está no ecrã é o painel de boas-vindas, ver renderWorkbookEmptyState).
  // `data.no_workbook` cobre também a corrida em que este `data` é a resposta
  // tardia de um loadAppState() de quando ainda não havia separador nenhum,
  // mas entretanto já se abriu um — nunca tem headers/rows, seja qual for o
  // separador ativo agora; o load() desse separador vai já a caminho e vai
  // desenhar por cima assim que chegar.
  if (!activeTab() || data.no_workbook) {
    tbl.classList.add("hidden");
    box.classList.add("hidden");
    $("taskMode").classList.add("hidden");
    $("fileInfo").textContent = "";
    refreshItemBox();
    return;
  }
  populateSelectors(data);
  updateViewMapButton(data);
  updatePredefListButton(data);
  updateCustomFilterButton(data);

  if (data.error) {
    tbl.classList.add("hidden");
    $("taskMode").classList.add("hidden");
    box.classList.remove("hidden");
    let html = `<h2>${esc(data.error)}</h2>`;
    if (data.hint) html += `<p>${esc(data.hint)}</p>`;
    if (!web && /Erro ao ler o ficheiro|Error reading the file/.test(data.error))
      html += `<p><button class="mini" id="cycleNow" style="margin-left:0">${t("btn_cycle")}</button></p>`;
    if (data.searched) html += `<p>${t("searched")}</p><ul>` +
      data.searched.map(p => `<li><code>${esc(p)}</code></li>`).join("") + `</ul>`;
    if (data.sheets && data.sheets.length) html += `<p>${t("sheets_avail")}</p><ul>` +
      data.sheets.map(s => `<li>${esc(s)}</li>`).join("") + `</ul>`;
    box.innerHTML = html;
    $("fileInfo").textContent = data.file ? `${t("info_file")}: ${data.file}` : "";
    refreshItemBox();
    return;
  }

  $("sheetName").textContent = data.sheet;
  $("personName").textContent = PERSON;
  $("fileInfo").innerHTML =
    (data.mode === "dev" ? `<span class="devbadge">DEV</span> ` : "") +
    `${t("info_file")}: <code${data.synced_copy ? ` title="${esc(data.file)} \u2014 ${esc(t("t_synced_copy"))}"` : ""}>${esc(data.source === "onedrive" || data.synced_copy ? (activeBookName() || graphInfo.book || t("source_web")) : data.file)}</code> · ${t("info_mod")}: <strong>${esc(data.modified)}</strong>` +
    (data.lan_url ? ` · ${t("info_phone")} <a href="${esc(data.lan_url)}"><code>${esc(data.lan_url)}</code></a>` : "") +
    (data.warning ? `<br><span class="warn">⚠ ${esc(data.warning)}</span>` +
      (web ? "" : ` <button class="mini" id="cycleNow">${t("btn_cycle")}</button>`) : "") +
    (data.notice ? `<br><span class="notice">ℹ ${esc(data.notice)}</span>` : "");

  // vista resumida do tracker ou, para outras folhas, a que o utilizador
  // definiu nas Definições por coordenadas de célula (ver viewmap.js)
  const compact = buildCustomCompact(data) || buildCompact(data);
  $("viewToggle").classList.toggle("hidden", !compact);
  const useCompact = compact && compactView;
  // vista mapeada à medida: categorias livres, sempre só leitura (sem papel/lado)
  const isCellCompact = !!(useCompact && compact.custom);
  const isCanonicalCompact = useCompact && !isCellCompact;
  if (isCellCompact && !(compact.useList || []).some(Boolean))
    $("fileInfo").innerHTML += `<br><span class="notice">ℹ ${esc(t("viewmap_readonly"))}</span>`;
  // lista/caixas vale para as duas vistas (resumida e completa)
  $("taskMode").classList.remove("hidden");
  const headers = useCompact ? compact.headers : data.headers;
  const allRows = useCompact ? compact.rows : data.rows;
  // meta (row_meta, com o orig por coluna real) de uma linha à vista, seja
  // qual for a vista ativa — usado tanto para os filtros personalizados como
  // para currentMeta, mais abaixo
  const metaFor = r => isCellCompact ? (r[headers.length] || null)
    : useCompact ? (r[6] || null)
    : ((data.row_meta || [])[data.rows.indexOf(r)] || null);

  const query = activeSearchTerms();
  const searched = query.length
    ? allRows.filter(r => {
      const cells = r.slice(0, headers.length);
      const hit = term => cells.some(c => norm(c).includes(term));
      return searchMode === "and" ? query.every(hit) : query.some(hit);
    })
    : allRows;

  // resumo: contagens calculadas antes do filtro de estado, para os botões não desaparecerem
  // (na vista mapeada à medida não há coluna de estado fixa: nunca conta como tal)
  const statusIdx = isCellCompact ? -1 : headers.findIndex(isStatusHeader);
  // a coluna do papel pode mostrar nomes de outras pessoas; quem manda nos
  // filtros/contadores é a chave de papel (elemento 9), que continua a ser
  // "Autor"/"Reviewer"/"Mencionado"/"Sem responsável" — só existe na vista do tracker
  const roleIdx = isCanonicalCompact ? 9 : -1;
  const exactRoles = [t("role_mentioned"), t("role_unassigned")];
  const roleMatches = papel =>
    [...roleFilters].some(f => exactRoles.includes(f) ? papel === f : String(papel).includes(f));
  const sideIdx = isCanonicalCompact ? 5 : -1;
  const roleActive = roleFilters.size && roleIdx >= 0;
  const sideActive = sideFilters.size && sideIdx >= 0;
  let rows = roleActive ? searched.filter(r => roleMatches(r[roleIdx])) : searched;
  if (sideActive)
    rows = rows.filter(r => sideFilters.has(r[sideIdx]));
  if (statusFilters.size && statusIdx >= 0 && !useCompact)
    rows = rows.filter(r => statusLines(r[statusIdx]).some(s => statusFilters.has(s)));

  // filtros personalizados (ver customfilters.js): sempre pela coluna real da
  // folha (row_meta[].orig), por isso funcionam em qualquer vista — resumida
  // do tracker, à medida por coordenadas ou tabela completa. Cada um ativo
  // aplica-se em AND com os restantes (tal como papel+lado+estado já fazem
  // entre si); a contagem de cada botão é facetada pelos OUTROS filtros
  // personalizados ativos, mas já com papel/lado/estado aplicados.
  const allCustomFilters = loadCustomFilters(data);
  const activeCustomFilters = allCustomFilters.filter(f => customFilterActive.has(f.id));
  const customListValues = customFilterListValues(data, allCustomFilters);
  const customFacetCounts = {};
  allCustomFilters.forEach(f => {
    const others = allCustomFilters.filter(o => o.id !== f.id && customFilterActive.has(o.id));
    const base = others.length
      ? rows.filter(r => others.every(o => evalCustomFilter(metaFor(r), o, customListValues)))
      : rows;
    customFacetCounts[f.id] = base.filter(r => evalCustomFilter(metaFor(r), f, customListValues)).length;
  });
  if (activeCustomFilters.length)
    rows = rows.filter(r => activeCustomFilters.every(f => evalCustomFilter(metaFor(r), f, customListValues)));

  // bases facetadas: cada grupo de botões é contado com os filtros dos OUTROS
  // grupos aplicados (mas não os do próprio), para os números refletirem a seleção
  const baseForRole = sideActive ? searched.filter(r => sideFilters.has(r[sideIdx])) : searched;
  const baseForSide = roleActive ? searched.filter(r => roleMatches(r[roleIdx])) : searched;

  let summaryHtml = `<span class="pill">${rows.length} ${rows.length === 1 ? t("tasks_one") : t("tasks_many")}` +
    (showAll ? ` ${t("of_all")}` : ` ${t("of_person")} ${esc(PERSON)}`) + `</span>`;
  const pillClasses = (extra, active, n) =>
    `pill${extra ? " " + extra : ""}${active ? " active" : ""}${!active && n === 0 ? " zero" : ""}`;

  if (roleIdx >= 0 && searched.length) {
    const countRoles = arr => {
      const c = {
        [t("role_author")]: 0, [t("role_reviewer")]: 0,
        [t("role_mentioned")]: 0, [t("role_unassigned")]: 0,
      };
      arr.forEach(r => {
        const p = String(r[roleIdx] === undefined ? "" : r[roleIdx]);
        if (p === t("role_unassigned")) { c[t("role_unassigned")]++; return; }
        if (p.includes(t("role_author"))) c[t("role_author")]++;
        if (p.includes(t("role_reviewer"))) c[t("role_reviewer")]++;
        if (p === t("role_mentioned")) c[t("role_mentioned")]++;
      });
      return c;
    };
    const avail = countRoles(searched), fac = countRoles(baseForRole);
    summaryHtml += Object.keys(avail).filter(k => avail[k] > 0).map(k =>
      `<span class="${pillClasses("", roleFilters.has(k), fac[k])}" data-role="${k}">${k}: ${fac[k]}</span>`
    ).join("");
  }
  if (isCanonicalCompact && searched.length) {
    const countSides = arr => {
      const c = {};
      arr.forEach(r => { c[r[sideIdx]] = (c[r[sideIdx]] || 0) + 1; });
      return c;
    };
    const avail = countSides(searched), fac = countSides(baseForSide);
    const sideLabel = { "On my side": t("side_my"), "On the other side": t("side_other"), "Done": t("side_done") };
    summaryHtml += SIDES.filter(s => avail[s]).map(s =>
      `<span class="${pillClasses(SIDE_CLASS[s], sideFilters.has(s), fac[s] || 0)}" data-side="${esc(s)}">${esc(sideLabel[s] || s)}: ${fac[s] || 0}</span>`
    ).join("");
  } else if (statusIdx >= 0 && searched.length) {
    const counts = {};
    searched.forEach(r => {
      // linhas sem estado não geram botão (não haveria nada para mostrar)
      statusLines(r[statusIdx]).forEach(s => { counts[s] = (counts[s] || 0) + 1; });
    });
    summaryHtml += Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) =>
        `<span class="pill${statusFilters.has(s) ? " active" : ""}" data-status="${esc(s)}">${esc(s)}: ${n}</span>`
      ).join("");
  }
  if (allCustomFilters.length && searched.length) {
    summaryHtml += allCustomFilters.map(f =>
      `<span class="${pillClasses("customfilter", customFilterActive.has(f.id), customFacetCounts[f.id] || 0)}" ` +
      `data-customfilter="${esc(f.id)}">${esc(f.name)}: ${customFacetCounts[f.id] || 0}</span>`
    ).join("");
  }
  $("summary").innerHTML = summaryHtml;

  if (!rows.length) {
    tbl.classList.add("hidden");
    box.classList.remove("hidden");
    box.innerHTML = (statusFilters.size || sideFilters.size || roleFilters.size || customFilterActive.size)
      ? `<h2>${t("none_filter")}.</h2><p>${t("none_hint")}</p>`
      : query.length
        ? `<h2>${t("none_search")} "${esc(searchLabel())}".</h2>`
        : `<h2>${t("none_person")} ${esc(PERSON)}.</h2>
     <p>${t("rows_hint_1")} ${data.total_rows} ${t("rows_hint_2")}</p>`;
    refreshItemBox();
    return;
  }

  box.classList.add("hidden");
  tbl.classList.remove("hidden");
  const _narrow = window.innerWidth <= 720;
  tbl.classList.toggle("cards", taskLayout === "cards" || _narrow);
  $("thead").innerHTML = "<tr>" + headers.map(h => `<th>${esc(h)}</th>`).join("") + `<th class="todoActionCell">${esc(t("hdr_action"))}</th></tr>`;
  currentMeta = rows.map(metaFor);
  currentObs = rows.map(r =>
    isCanonicalCompact ? (String(r[3] === undefined ? "" : r[3]).split("\u001F")[1] || "") : "");
  currentStatuses = data.statuses || [];

  function statusCell(r, ri, i) {
    const meta = currentMeta[ri];
    if (isCanonicalCompact) {
      const lines = String(r[2]).split("\n").filter(l => l.trim());
      const cols = r[7] || [];
      return lines.map((l, k) => badgeHtml(l, cols[k], meta)).join("<br>");
    }
    const c = r[i] ? String(r[i]) : "";
    return c ? badgeHtml(c, headers[i], meta) : "";
  }

  // "O que fazer" + OBS da linha (a OBS vem colada ao resumo pelo separador \u001F)
  function todoObsHtml(r, ri) {
    const [todo, obs] = String(r[3] === undefined ? "" : r[3]).split("\u001F");
    const rawTodo = r[8] || "";
    return `${todoTextHtml(todo, rawTodo, currentMeta[ri])}${obsHtml(obs || "", currentMeta[ri])}`;
  }

  // o botão "+ TODO" só existe enquanto a linha não estiver na TODO list
  function todoAddBtn(r, ri) {
    const title = String(r[0] === undefined ? "" : r[0]).split("\n")[0].trim();
    const meta = currentMeta[ri] || {};
    const ref = {
      workbook: activeBookName(), sheet: data.sheet || "",
      fn: meta.fn || title, todo: meta.todo || "",
    };
    return todoHas("task", title, ref) ? ""
      : `<button type="button" class="todoActionBtn" data-todoadd="${ri}" title="${t("todo_add_click")}">${t("btn_add_todo")}</button>`;
  }

  const colOf = headers.map((_, i) => i);
  $("tbody").innerHTML = rows.map((r, ri) =>
    `<tr draggable="true" title="${t("t_drag")}">` + headers.map((_, i) => {
      const i2 = colOf[i];
      const cell = (() => {
        const c = r[i2] !== undefined ? r[i2] : "";
        // vista mapeada à medida: categorias livres, sempre texto simples —
        // a única exceção é a Execução, se o utilizador a ligou nas Definições
        // (mesma célula editável da vista do tracker, ver execCellHtml)
        if (isCellCompact) {
          if (i2 === compact.execIdx) {
            const m = currentMeta[ri] || {};
            const { inner, title } = execCellHtml(m);
            return `<td class="execCell" data-xlrow="${esc(m.xlrow || "")}" title="${esc(title)}">${inner}</td>`;
          }
          if ((compact.useList || [])[i2]) {
            const m = currentMeta[ri] || {};
            return `<td>${cellCatHtml(c, i2, m, compact)}</td>`;
          }
          return `<td${i2 === 0 ? ' class="fn"' : ""}>${i2 === 0 ? highlightTerms(c) : esc(c)}</td>`;
        }
        if (useCompact ? i2 === 2 : isStatusHeader(headers[i]))
          return `<td>${statusCell(r, ri, i2)}</td>`;
        if (useCompact && i2 === 0) {
          const m = currentMeta[ri] || {};
          const linked = notesForTask(m.fn || c, m.todo || "");
          const flag = linked.length
            ? `<button type="button" class="taskNoteFlag" data-tasklink-fn="${esc(m.fn || c)}" data-tasklink-todo="${esc(m.todo || "")}" title="${esc(t("t_open_linked_note"))}">📌</button>`
            : "";
          return `<td class="fn">${fnHtml(c, m)}${flag}</td>`;
        }
        if (useCompact && i2 === 1) {
          // ninguém atribuído: a célula fica marcada, para saltar à vista
          const semDono = r[9] === t("role_unassigned");
          return `<td class="role${semDono ? " unassigned" : ""}"` +
            `${semDono ? ` title="${esc(t("t_unassigned"))}"` : ""}>${highlightTerms(c)}</td>`;
        }
        if (useCompact && i2 === 4) {
          const m = currentMeta[ri] || {};
          const { inner, title } = execCellHtml(m);
          return `<td class="execCell" data-xlrow="${esc(m.xlrow || "")}" title="${esc(title)}">${inner}</td>`;
        }
        if (useCompact && i2 === 3) {
          return `<td>${todoObsHtml(r, ri)}</td>`;
        }
        return `<td>${esc(c)}</td>`;
      })();
      // em ecrãs estreitos a tabela vira cartões: cada célula mostra o seu cabeçalho
      return cell.replace("<td", `<td data-label="${esc(headers[i])}"`);
    }).join("") + `<td class="todoActionCell">${todoAddBtn(r, ri)}</td></tr>`
  ).join("");
  refreshItemBox();
}

// pedido ao /api/tasks para um livro concreto. A fonte vai sempre explícita
// (local ou onedrive) — a app nunca deixa o servidor escolher por si.
function tabQuery(tab, { cycle = false, fresh = false, all = showAll } = {}) {
  const q = new URLSearchParams();
  q.set("person", PERSON);
  q.set("all", all ? "1" : "0");
  q.set("sheet", (tab && tab.sheet) || "");
  q.set("file", tabFile(tab));
  q.set("cycle", cycle ? "1" : "0");
  q.set("fresh", fresh ? "1" : "0");
  q.set("lang", LANG);
  q.set("source", tabSource(tab));
  // o nome só serve ao servidor para achar a cópia sincronizada no disco
  if (tab && tab.kind === "onedrive" && tab.name) q.set("book_name", tab.name);
  // vista mapeada à medida (ver viewmap.js): manda as categorias guardadas
  // para este ficheiro+aba, para o servidor calcular data.cell_view. A chave
  // usa data.file/data.sheet da última leitura (o mesmo que viewMapKey usa
  // para gravar); antes da primeira leitura usa-se o melhor palpite disponível
  // (tabFile/tab.sheet), que já é exato para ficheiros locais.
  const known = (tab && tab.lastData) || { file: tabFile(tab), sheet: (tab && tab.sheet) || "" };
  const cfg = loadViewMap(known);
  if (cfg && cfg.categories.length) {
    // categorias listMode="fixed": o servidor não vê o localStorage, por isso
    // a biblioteca (loadPredefLists) é resolvida aqui. Uma lista mode="manual"
    // manda os valores literais dentro do cellcat (listValues); uma lista
    // mode="range" manda antes sheet/cell/orientation/size e passa a viajar
    // como listMode="range", para o servidor a ler ao vivo do livro tal como
    // já faz para o intervalo próprio de uma categoria — ver build_cell_categories.
    const predefLists = loadPredefLists(known);
    const cellcats = cfg.categories.map(cat => {
      if (cat.listMode !== "fixed") return cat;
      const list = predefLists.find(l => l.id === cat.listId);
      if (list && list.mode === "range") {
        return {
          ...cat, listMode: "range",
          listSheet: list.sheet, listCell: list.cell,
          listOrientation: list.orientation, listSize: list.size,
        };
      }
      return { ...cat, listValues: list ? list.values : [] };
    });
    q.set("cellcats", JSON.stringify(cellcats));
  }
  // filtros personalizados com op in_list/not_in_list sobre uma lista
  // mode="range" (ver customFilterListValues, tasks.js): o servidor é que
  // consegue ler o intervalo ao vivo, por isso pede-se aqui, tal como as
  // categorias listMode="fixed" com uma lista "range" acima
  const filters = loadCustomFilters(known);
  const predefListsForFilters = loadPredefLists(known);
  const neededListIds = new Set(filters
    .flatMap(f => f.groups)
    .flatMap(g => g.conditions)
    .filter(c => (c.op === "in_list" || c.op === "not_in_list") && c.listId)
    .map(c => c.listId));
  const filterLists = [...neededListIds]
    .map(id => predefListsForFilters.find(l => l.id === id))
    .filter(l => l && l.mode === "range")
    .map(l => ({ id: l.id, sheet: l.sheet, cell: l.cell, orientation: l.orientation, size: l.size }));
  if (filterLists.length) q.set("filterlists", JSON.stringify(filterLists));
  return q.toString();
}

// Lê UM livro e guarda o resultado na entrada dele. Nunca mexe no lastData de
// outro separador — é isso que garante que dois livros abertos ao mesmo tempo
// não se misturam.
async function loadTab(tab, cycle = false, fresh = false) {
  if (!tab) return null;
  // com a fonte web não há Excel local para fechar
  if (tab.kind === "onedrive") cycle = false;
  let data;
  try {
    const res = await fetch(`/api/tasks?${tabQuery(tab, { cycle, fresh })}`);
    data = await res.json();
  } catch (e) {
    data = { error: t("err_server") };
  }
  tab.lastData = data;
  // a aba que o servidor abriu mesmo (a pedida pode não existir neste livro):
  // fica guardada, para o próximo arranque abrir logo a certa
  if (data && data.sheet && data.sheet !== tab.sheet) {
    tab.sheet = data.sheet;
    saveWorkbookTabs();
  }
  if (tab.id === activeTabId) lastData = data;
  return data;
}

// Estado global (TODO, CCRs, versão, pendentes) sem nenhum livro aberto: o
// /api/tasks devolve-o na mesma, com "no_workbook". Isso não é um erro — é o
// estado normal de quem ainda não abriu nada — por isso a mensagem é retirada.
async function loadAppState() {
  try {
    const res = await fetch(`/api/tasks?person=${encodeURIComponent(PERSON)}` +
      `&all=0&sheet=&file=&cycle=0&fresh=0&lang=${LANG}&source=local`);
    const data = await res.json();
    if (data && data.no_workbook) { delete data.error; delete data.hint; delete data.searched; }
    return data;
  } catch (e) {
    return { error: t("err_server") };
  }
}

// tratamento comum a qualquer leitura: estado da ligação, TODO, CCRs e desenho
function afterLoad() {
  // esta recarga já é uma prova fresca do estado da ligação — o sinal do
  // pedido de 20/20s (ver checkForChanges) fica desatualizado. Tem de ser
  // limpo ANTES de desenhar, senão o estado velho ainda aparece
  liveOffline = false;
  liveError = "";
  if (lastData && lastData.graph) {
    // lastData.graph vem do /api/tasks (exposto na LAN, sem o filtro
    // localhost-only do /api/graph) e por isso nunca traz account_email/name;
    // um merge preserva o que graphAction("state") já tiver lido dali
    graphInfo = { ...graphInfo, ...lastData.graph };
    renderGraphState();
  } else {
    renderConnBadge();
  }
  // os todos são atualizados primeiro: as CCRs precisam deles para saber
  // se ainda mostram o "+ TODO"
  if (lastData && lastData.todo) {
    todos = lastData.todo;
    if (currentView === "todo" && !editorOpen) renderTodo();
  }
  if (lastData && lastData.ccrs) {
    ccrs = lastData.ccrs;
    if (currentView === "ccrs" && !editorOpen) renderCCRs();
  }
  render();
}

// Recarrega o livro do separador ativo (ou só o estado global, se não houver
// nenhum livro aberto).
async function load(cycle = false, fresh = false) {
  const tab = activeTab();
  if (!tab) {
    lastData = await loadAppState();
    afterLoad();
    return;
  }
  // com um editor aberto a leitura é silenciosa: o render fica à espera e a
  // barra de informação não pode ficar presa no "A carregar…"
  if (!editorOpen) $("fileInfo").textContent = cycle ? t("loading_cycle") : t("loading");
  await loadTab(tab, cycle, fresh);
  afterLoad();
}

// Recarrega todos os livros abertos (arranque e ciclo de segurança). O ativo é
// o último a ser lido, para o ecrã acabar com os dados dele.
async function loadAllTabs(fresh = false) {
  if (!workbookTabs.length) { await load(); return; }
  for (const tab of workbookTabs) {
    if (tab.id === activeTabId) continue;
    await loadTab(tab, false, fresh);
  }
  await load(false, fresh);
}

function tbodyTap(e) {
  const pin = e.target.closest("[data-tasklink-fn]");
  if (pin) { openTaskLinkedNote(pin.dataset.tasklinkFn, pin.dataset.tasklinkTodo); return; }
  const add = e.target.closest("[data-todoadd]");
  if (add) { e.preventDefault(); e.stopPropagation(); addTodoFromTaskRow(add); return; }
  const badge = e.target.closest(".badge[data-col]");
  if (badge) return openStatusEditor(badge);
  const catText = e.target.closest(".cellcatText[data-catxlrow]");
  if (catText) return openCellCatEditor(catText);
  const obs = e.target.closest("[data-obsxlrow]");
  if (obs && !obs.dataset.editing) return openObsEditor(obs);
  const todoTxt = e.target.closest("[data-todoxlrow]");
  if (todoTxt && !todoTxt.dataset.editing) return openTodoTextEditor(todoTxt);
  const fnTxt = e.target.closest("[data-fnxlrow]");
  if (fnTxt && !fnTxt.dataset.editing) return openFnEditor(fnTxt);
  const cell = e.target.closest(".execCell");
  if (cell && !cell.dataset.editing) openNoteEditor(cell);
}
// click + pointerup: alguns browsers móveis não entregam o click delegado, daí
// a reserva — mas em rato/trackpad E em ecrãs táteis os dois costumam disparar
// para o mesmo toque, duplicando a ação (ex.: "+ TODO" a criar o item duas
// vezes). Filtrar só por pointerType não chega (o click sintético do touch
// também dispara), por isso ignora-se um 2.º disparo no MESMO alvo a menos de
// 500ms do 1.º — cliques a seguir uns aos outros em alvos diferentes continuam
// todos a contar, só o par duplicado do mesmo toque é que se ignora
let lastTbodyTap = null;
function tbodyTapOnce(e) {
  const now = e.timeStamp || Date.now();
  if (lastTbodyTap && lastTbodyTap.target === e.target && now - lastTbodyTap.at < 500) return;
  lastTbodyTap = { target: e.target, at: now };
  tbodyTap(e);
}
$("tbody").addEventListener("click", tbodyTapOnce);
$("tbody").addEventListener("pointerup", tbodyTapOnce);
// os mesmos editores também servem o painel da tarefa dentro de um item do TODO
$("todoBody").addEventListener("click", tbodyTap);
$("todoBoard").addEventListener("click", tbodyTap);

$("ccrBody").addEventListener("click", e => {
  const add = e.target.closest("[data-todoaddccr]");
  if (!add) return;
  e.preventDefault();
  e.stopPropagation();
  addTodoFromCcr(add.dataset.todoaddccr);
});

function openNoteEditor(cell) {
  const meta = metaByRow(cell.dataset.xlrow);
  if (!meta) { clientLog(`nota: célula sem metadados (linha ${cell.dataset.xlrow})`); return; }
  clientLog(`nota: editor aberto (${meta.fn})`);
  cell.dataset.editing = "1";
  editorOpen = true;
  const n = meta.note || { tag: "", note: "" };
  const opts = ["", ...EXEC_TAGS];
  if (n.tag && !opts.includes(n.tag)) opts.push(n.tag);
  const checks = n.checks || {};
  cell.innerHTML =
    `<select class="statusEdit noteTag">` +
    opts.map(o => `<option value="${esc(o)}"${o === n.tag ? " selected" : ""}>${o ? esc(tagDisplay(o)) : t("opt_notag")}</option>`).join("") +
    `</select>
 <div class="chkList">` +
    CHECKS.map(([k, label]) =>
      `<label class="chk"><input type="checkbox" data-k="${k}"${checks[k] ? " checked" : ""}> ${esc(t(label))}</label>`
    ).join("") +
    `</div>
 <textarea class="noteText" rows="3" placeholder="${t("ph_note")}">${esc(n.note || "")}</textarea>
 ` + editActions();
  cell.querySelector(".actSave").addEventListener("click", async e => {
    e.stopPropagation();
    editorOpen = false;
    clientLog(`nota: a guardar (${meta.fn})`);
    try {
      await fetch("/api/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet: lastData.sheet, fn: meta.fn, todo: meta.todo, file: lastData.file,
          tag: cell.querySelector(".noteTag").value,
          note: cell.querySelector(".noteText").value,
          checks: Object.fromEntries(
            [...cell.querySelectorAll("input[type=checkbox]")].map(cb => [cb.dataset.k, cb.checked])),
        }),
      });
    } catch (err) {
      alert("Não foi possível gravar a nota: " + err);
    }
    load();
  });
  cell.querySelector(".actCancel").addEventListener("click", e => {
    e.stopPropagation();
    editorOpen = false;
    refreshTaskViews();
  });
  cell.querySelector(".actClear").addEventListener("click", async e => {
    e.stopPropagation();
    editorOpen = false;
    try {
      await fetch("/api/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet: lastData.sheet, fn: meta.fn, todo: meta.todo, file: lastData.file,
          tag: "", note: "", checks: {}
        }),
      });
    } catch (err) {
      alert("Não foi possível limpar a nota: " + err);
    }
    load();
  });
}

// Editor da OBS: grava como alteração local (✎), tal como os estados — só o
// Push é que a escreve mesmo na coluna OBS do Excel.
function openObsEditor(span) {
  const meta = metaByRow(span.dataset.obsxlrow);
  if (!meta) { clientLog(`obs: célula sem metadados (linha ${span.dataset.obsxlrow})`); return; }
  const atual = span.dataset.obscur || "";
  span.dataset.editing = "1";
  editorOpen = true;
  span.innerHTML =
    `<textarea class="noteText" rows="3" placeholder="${t("ph_obs")}">${esc(atual)}</textarea>` +
    editActions();
  const txt = span.querySelector("textarea");
  txt.focus();

  async function grava(valor) {
    editorOpen = false;
    try {
      const cols = lastData.xlcols || {};
      const res = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet: lastData.sheet, fn: meta.fn, todo: meta.todo,
          column: "OBS", value: valor,
          base: (meta.orig || {})["OBS"] || "",
          file: lastData.file, xlrow: meta.xlrow,
          xlcol: cols["OBS"], fncol: cols.fn,
        }),
      });
      const out = await res.json();
      if (!out.ok) alert(`${t("err_save")} ` + (out.error || "?"));
    } catch (err) {
      alert(`${t("err_save")} ` + err);
    }
    load();
  }

  span.querySelector(".actSave").addEventListener("click", e => {
    e.stopPropagation();
    grava(txt.value);
  });
  span.querySelector(".actCancel").addEventListener("click", e => {
    e.stopPropagation();
    editorOpen = false;
    refreshTaskViews();
  });
  // limpar = repor o que está na folha (deixa de haver alteração local)
  span.querySelector(".actClear").addEventListener("click", e => {
    e.stopPropagation();
    grava(meta.over && meta.over["OBS"] ? null : "");
  });
}

// Editor do "To Do": grava como alteração local (✎), tal como a OBS — só o
// Push escreve mesmo na coluna "To Do" do Excel.
function openTodoTextEditor(span) {
  const meta = metaByRow(span.dataset.todoxlrow);
  if (!meta) { clientLog(`todo: célula sem metadados (linha ${span.dataset.todoxlrow})`); return; }
  // coluna real onde isto vai ser escrito: "To Do" na vista do tracker, o texto
  // do cabeçalho mapeado na vista personalizada (data-todocol)
  const col = span.dataset.todocol || "To Do";
  const atual = span.dataset.todocur || "";
  span.dataset.editing = "1";
  editorOpen = true;
  span.innerHTML =
    `<textarea class="noteText" rows="3" placeholder="${t("ph_todo")}">${esc(atual)}</textarea>` +
    editActions();
  const txt = span.querySelector("textarea");
  txt.focus();

  async function grava(valor) {
    editorOpen = false;
    try {
      const cols = lastData.xlcols || {};
      const res = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet: lastData.sheet, fn: meta.fn, todo: meta.todo,
          column: col, value: valor,
          base: (meta.orig || {})[col] || "",
          file: lastData.file, xlrow: meta.xlrow,
          xlcol: cols[col], fncol: cols.fn,
        }),
      });
      const out = await res.json();
      if (!out.ok) alert(`${t("err_save")} ` + (out.error || "?"));
    } catch (err) {
      alert(`${t("err_save")} ` + err);
    }
    load();
  }

  span.querySelector(".actSave").addEventListener("click", e => {
    e.stopPropagation();
    grava(txt.value);
  });
  span.querySelector(".actCancel").addEventListener("click", e => {
    e.stopPropagation();
    editorOpen = false;
    refreshTaskViews();
  });
  // limpar = repor o que está na folha (deixa de haver alteração local)
  span.querySelector(".actClear").addEventListener("click", e => {
    e.stopPropagation();
    grava(meta.over && meta.over[col] ? null : "");
  });
}

// Editor do "Function/TC": mesma lógica, mas campo de uma linha (é um
// identificador curto, não texto livre em várias linhas como o "To Do"/OBS).
function openFnEditor(span) {
  const meta = metaByRow(span.dataset.fnxlrow);
  if (!meta) { clientLog(`fn: célula sem metadados (linha ${span.dataset.fnxlrow})`); return; }
  const atual = span.dataset.fncur || (meta.orig || {})["Function/TC"] || "";
  span.dataset.editing = "1";
  editorOpen = true;
  span.innerHTML =
    `<input type="text" class="noteText fnEdit" value="${esc(atual)}">` +
    editActions();
  const inp = span.querySelector("input");
  inp.focus();
  inp.select();

  async function grava(valor) {
    editorOpen = false;
    try {
      const cols = lastData.xlcols || {};
      const res = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet: lastData.sheet, fn: meta.fn, todo: meta.todo,
          column: "Function/TC", value: valor,
          base: (meta.orig || {})["Function/TC"] || "",
          file: lastData.file, xlrow: meta.xlrow,
          xlcol: cols["Function/TC"], fncol: cols.fn,
        }),
      });
      const out = await res.json();
      if (!out.ok) alert(`${t("err_save")} ` + (out.error || "?"));
    } catch (err) {
      alert(`${t("err_save")} ` + err);
    }
    load();
  }

  span.querySelector(".actSave").addEventListener("click", e => {
    e.stopPropagation();
    grava(inp.value);
  });
  span.querySelector(".actCancel").addEventListener("click", e => {
    e.stopPropagation();
    editorOpen = false;
    refreshTaskViews();
  });
  span.querySelector(".actClear").addEventListener("click", e => {
    e.stopPropagation();
    // ao contrário da OBS/"To Do", uma célula vazia não faz sentido aqui — é a
    // identidade da linha. Sem alteração pendente, "Limpar" só fecha o editor.
    if (meta.over && meta.over["Function/TC"]) grava(null);
    else { editorOpen = false; refreshTaskViews(); }
  });
}

function openStatusEditor(badge) {
  const col = badge.dataset.col;
  const meta = metaByRow(badge.dataset.xlrow);
  if (!meta) return;
  const current = (badge.dataset.rawstatus || badge.innerText).replace(/^TC: |^TP: /, "").trim();
  // deixa no log o que está mesmo no ecrã para esta linha: serve para comparar
  // com o Excel quando um estado parece desatualizado
  clientLog(`estado no ecra: ${meta.fn} linha ${meta.xlrow} ${col}="${current}"` +
    `${meta.over && meta.over[col] ? " (alteracao local por enviar)" : ""}` +
    ` | livro gravado ${lastData.modified} #${lastData.digest}`);

  const opts = [...currentStatuses];
  if (current && !opts.includes(current)) opts.unshift(current);
  const sel = document.createElement("select");
  sel.className = "statusEdit";
  sel.innerHTML =
    opts.map(s => `<option value="${esc(s)}"${s === current ? " selected" : ""}>${esc(s)}</option>`).join("") +
    (meta.over && meta.over[col] ? `<option value="__clear__">${t("opt_revert")}</option>` : "");
  badge.replaceWith(sel);
  editorOpen = true;
  sel.focus();

  let done = false;
  sel.addEventListener("change", async () => {
    if (done) return;
    done = true;
    editorOpen = false;
    sel.disabled = true;
    try {
      const cols = lastData.xlcols || {};
      const res = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet: lastData.sheet,
          fn: meta.fn,
          todo: meta.todo,
          column: col,
          value: sel.value === "__clear__" ? null : sel.value,
          base: (meta.orig || {})[col] || "",
          file: lastData.file,
          xlrow: meta.xlrow,
          xlcol: cols[col],
          fncol: cols.fn,
        }),
      });
      const out = await res.json();
      if (!out.ok) alert(`${t("err_save")} ` + (out.error || "?"));
    } catch (err) {
      alert("Não foi possível contactar o servidor: " + err);
    }
    load();
  });
  sel.addEventListener("blur", () => { if (!done) { done = true; editorOpen = false; refreshTaskViews(); } });
}

// categoria livre com lista predefinida (useList=true, ver cellCatHtml): o
// mesmo padrão do editor de estados (badge -> <select>), mas identificada por
// posição na folha (xlrow+col0), não por Function/TC+To Do — ver
// queue_cellcat_override/push_overrides, cswaios/tasks.py, para o porquê.
function openCellCatEditor(span) {
  const xlrow = span.dataset.catxlrow;
  const col0 = span.dataset.catcol;
  const meta = metaByRow(xlrow);
  if (!meta) return;
  const base = span.dataset.catbase;
  const list = JSON.parse(span.dataset.catlist || "null");
  let opts = [];
  try { opts = JSON.parse(span.dataset.catoptions || "[]"); } catch (e) { opts = []; }
  const displayed = span.innerText.replace(" ✎", "").trim();
  if (displayed && !opts.includes(displayed)) opts = [displayed, ...opts];

  const sel = document.createElement("select");
  sel.className = "statusEdit";
  sel.innerHTML = opts.map(v => `<option value="${esc(v)}"${v === displayed ? " selected" : ""}>${esc(v)}</option>`).join("") +
    (span.classList.contains("local") ? `<option value="__clear__">${t("opt_revert")}</option>` : "");
  span.replaceWith(sel);
  editorOpen = true;
  sel.focus();

  let done = false;
  sel.addEventListener("change", async () => {
    if (done) return;
    done = true;
    editorOpen = false;
    sel.disabled = true;
    try {
      const res = await fetch("/api/cellcat/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: lastData.file,
          sheet: lastData.sheet,
          xlrow: meta.xlrow,
          col0: Number(col0),
          value: sel.value === "__clear__" ? null : sel.value,
          base,
          list,
        }),
      });
      const out = await res.json();
      if (!out.ok) alert(`${t("err_save")} ` + (out.error || "?"));
    } catch (err) {
      alert("Não foi possível contactar o servidor: " + err);
    }
    load();
  });
  sel.addEventListener("blur", () => { if (!done) { done = true; editorOpen = false; refreshTaskViews(); } });
}
