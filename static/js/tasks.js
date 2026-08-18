// My Organizer — vista do Excel: leitura, tabela e editores

// Esta folha tem alguma vista resumida ativa — personalizada, gravada nas
// Definicoes (ver viewmap.js) — so usado para o texto do botao ("Criar" vs
// "Editar").
function hasResumedView(data) {
  return !!loadViewMap(data);
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

// negrito nas palavras que "explicam" porque a linha está à vista: os termos
// de pesquisa ativos e o meu nome (mesmo sem pesquisa, é sempre a mim que a
// vista pessoal filtra)
function highlightTerms(text) {
  const full = norm(PERSON);
  const tokens = full.split(" ").filter(w => w.length >= 4);
  const terms = activeSearchTerms().concat([full], tokens).filter(Boolean);
  return boldTerms(text, terms);
}

/* ---------- vista resumida à medida (qualquer folha) ----------
   O utilizador define nas Definições, por categoria, a célula inicial do
   Excel, a orientação e o tamanho (ver viewmap.js) — o servidor
   (build_cell_categories, cswaios/tasks.py) lê e concatena as células e
   devolve o resultado em data.cell_view. Categorias são livres (sem campo
   fixo Autor/Reviewer/Estado), por isso esta vista não tem papel/lado nem
   estados editáveis por omissão: cada categoria é sempre texto simples,
   editável (com lista opcional) — ver cellCatHtml. */
const VIEWMAP_PREFIX = "bsp-tracker-viewmap";
const PREDEFLIST_PREFIX = "bsp-tracker-predeflists";
const COMPOUNDCAT_PREFIX = "bsp-tracker-compoundcats";
const COLORDER_PREFIX = "bsp-tracker-colorder";
const COLWIDTH_PREFIX = "bsp-tracker-colwidth";

function viewMapKey(data) {
  return `${VIEWMAP_PREFIX}:${(data && data.file) || ""}:${(data && data.sheet) || ""}`;
}

function predefListKey(data) {
  return `${PREDEFLIST_PREFIX}:${(data && data.file) || ""}:${(data && data.sheet) || ""}`;
}

function compoundCatKey(data) {
  return `${COMPOUNDCAT_PREFIX}:${(data && data.file) || ""}:${(data && data.sheet) || ""}`;
}

// Exemplo pré-carregado, só na folha por omissão (ver DEFAULT_SHEET,
// cswaios/config.py): estas bibliotecas vivem no localStorage de cada browser
// e nunca são partilhadas entre colegas (ver loadPredefLists/loadCompoundCats/
// loadCustomFilters) — isto dá um ponto de partida visível a quem abre a
// aba por acaso pela primeira vez. Deixa de aparecer assim que o utilizador
// gravar a sua própria versão (mesmo vazia) através do editor respetivo.
const SEED_EXAMPLES = {
  "PRJ_CFG1_reworks_julho": {
    viewmap: {
      exec: true,
      categories: [
        { name: "", startCell: "A1", orientation: "horizontal", size: "", useList: false, listMode: "range", listSheet: "", listCell: "", listOrientation: "vertical", listSize: "", listId: "" },
        { name: "", startCell: "B1", orientation: "horizontal", size: "", useList: false, listMode: "range", listSheet: "", listCell: "", listOrientation: "vertical", listSize: "", listId: "" },
        { name: "", startCell: "C1", orientation: "horizontal", size: "", useList: false, listMode: "range", listSheet: "", listCell: "", listOrientation: "vertical", listSize: "", listId: "" },
        { name: "", startCell: "D1", orientation: "horizontal", size: "", useList: false, listMode: "range", listSheet: "", listCell: "", listOrientation: "vertical", listSize: "", listId: "" },
        { name: "", startCell: "E1", orientation: "horizontal", size: "", useList: true, listMode: "fixed", listSheet: "", listCell: "", listOrientation: "vertical", listSize: "", listId: "seed-estado" },
        { name: "", startCell: "G1", orientation: "horizontal", size: "", useList: false, listMode: "range", listSheet: "", listCell: "", listOrientation: "vertical", listSize: "", listId: "" },
        { name: "", startCell: "H1", orientation: "horizontal", size: "", useList: false, listMode: "range", listSheet: "", listCell: "", listOrientation: "vertical", listSize: "", listId: "" },
        { name: "", startCell: "I1", orientation: "horizontal", size: "", useList: true, listMode: "fixed", listSheet: "", listCell: "", listOrientation: "vertical", listSize: "", listId: "seed-estado" },
        { name: "", startCell: "K1", orientation: "horizontal", size: "", useList: false, listMode: "range", listSheet: "", listCell: "", listOrientation: "vertical", listSize: "", listId: "" },
      ],
    },
    predefLists: [
      { id: "seed-estado", name: "Estado", mode: "range",
        values: ["Ready to start", "In progress", "Blocked", "Ready for review", "In review",
          "Ready for rework", "In rework", "Done by us (Informal Review)", "Reviewed", "Removed", "Not ready to start"],
        colors: {}, sheet: "Admin", cell: "B9", orientation: "vertical", size: 11 },
      { id: "seed-lado-autor", name: "Lado do autor", mode: "manual",
        values: ["Ready to start", "In progress", "Ready for rework", "In rework", "Not ready to start"],
        colors: {}, sheet: "", cell: "", orientation: "vertical", size: "" },
      { id: "seed-lado-reviewer", name: "Lado do reviewer", mode: "manual",
        values: ["Ready for review", "In review"], colors: {}, sheet: "", cell: "", orientation: "vertical", size: "" },
      { id: "seed-feito", name: "Feito", mode: "manual",
        values: ["Done by us"], colors: {}, sheet: "", cell: "", orientation: "vertical", size: "" },
      { id: "seed-bloqueado", name: "Bloqueado", mode: "manual",
        values: ["Blocked"], colors: {}, sheet: "", cell: "", orientation: "vertical", size: "" },
    ],
    compoundCats: [
      { id: "seed-estado-tctp", name: "Estado (TC+TP)", columns: ["Status TC", "Status TP"] },
      { id: "seed-autor-tctp", name: "Autor (TC+TP)", columns: ["Author TC", "Author TP"] },
      { id: "seed-reviewer-tctp", name: "Reviewer (TC+TP)", columns: ["Reviewer TC", "Reviewer TP"] },
      { id: "seed-o-que-fazer", name: "O que fazer", columns: ["To Do", "OBS"] },
    ],
    customFilters: [
      { id: "seed-do-meu-lado", name: "Do meu lado", color: "purple",
        groups: [
          { conditions: [
            { column: "Author TC", op: "contains", value: "", usePerson: true, listId: "" },
            { column: "Status TC", op: "in_list", value: "", usePerson: false, listId: "seed-lado-autor" },
          ] },
          { conditions: [
            { column: "Author TP", op: "contains", value: "", usePerson: true, listId: "" },
            { column: "Status TP", op: "in_list", value: "", usePerson: false, listId: "seed-lado-autor" },
          ] },
          { conditions: [
            { column: "Reviewer TP", op: "contains", value: "", usePerson: true, listId: "" },
            { column: "Status TP", op: "in_list", value: "", usePerson: false, listId: "seed-lado-reviewer" },
          ] },
          { conditions: [
            { column: "Reviewer TC", op: "contains", value: "", usePerson: true, listId: "" },
            { column: "Status TC", op: "in_list", value: "", usePerson: false, listId: "seed-lado-reviewer" },
          ] },
        ] },
      { id: "seed-do-outro-lado", name: "Do outro lado", color: "",
        groups: [
          { conditions: [
            { column: "Author TC", op: "contains", value: "", usePerson: true, listId: "" },
            { column: "Status TC", op: "in_list", value: "", usePerson: false, listId: "seed-lado-reviewer" },
          ] },
          { conditions: [
            { column: "Author TP", op: "contains", value: "", usePerson: true, listId: "" },
            { column: "Status TP", op: "in_list", value: "", usePerson: false, listId: "seed-lado-reviewer" },
          ] },
          { conditions: [
            { column: "Reviewer TP", op: "contains", value: "", usePerson: true, listId: "" },
            { column: "Status TP", op: "in_list", value: "", usePerson: false, listId: "seed-lado-autor" },
          ] },
          { conditions: [
            { column: "Reviewer TC", op: "contains", value: "", usePerson: true, listId: "" },
            { column: "Status TC", op: "in_list", value: "", usePerson: false, listId: "seed-lado-autor" },
          ] },
        ] },
      { id: "seed-feito-filter", name: "Feito", color: "teal",
        groups: [
          { conditions: [
            { column: "Status TC", op: "contains", value: "Done by us", usePerson: false, listId: "" },
            { column: "Status TP", op: "contains", value: "Done by us", usePerson: false, listId: "" },
          ] },
        ] },
    ],
  },
};

function seedExampleFor(kind, data) {
  const sheetSeed = SEED_EXAMPLES[(data && data.sheet) || ""];
  const value = sheetSeed && sheetSeed[kind];
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

// ordem de exibição das colunas da tabela de Tarefas (ver render()/colOf, mais
// abaixo, e o dragstart/drop no thead): guarda só os NOMES dos cabeçalhos, por
// livro+aba+vista ("full"/"custom", ver currentColOrderKind) —
// cada vista tem o seu próprio conjunto de colunas, por isso cada uma tem a
// sua própria ordem. Arrastar um cabeçalho nunca muda o que uma coluna
// significa (o índice original continua o mesmo em headers/r[]), só a ORDEM
// em que aparecem no ecrã.
function colOrderKey(data, kind) {
  return `${COLORDER_PREFIX}:${(data && data.file) || ""}:${(data && data.sheet) || ""}:${kind}`;
}

function loadColOrder(data, kind) {
  if (!data || !data.sheet) return null;
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(colOrderKey(data, kind)) || "null");
  } catch (e) {
    return null;
  }
  return Array.isArray(raw) ? raw.filter(v => typeof v === "string") : null;
}

function saveColOrder(data, kind, headerNames) {
  if (!data || !data.sheet) return;
  localStorage.setItem(colOrderKey(data, kind), JSON.stringify(headerNames));
}

// índices originais de `headers`, na ordem de exibição gravada — nomes já
// gravados que deixaram de existir são ignorados; colunas novas (nunca
// gravadas) ou repetidas entram no fim, pela ordem original
function resolveColOrder(data, kind, headers) {
  const saved = loadColOrder(data, kind);
  if (!saved || !saved.length) return headers.map((_, i) => i);
  const byName = new Map();
  headers.forEach((h, i) => {
    if (!byName.has(h)) byName.set(h, []);
    byName.get(h).push(i);
  });
  const used = new Set(), order = [];
  saved.forEach(name => {
    const list = byName.get(name);
    const idx = list && list.find(i => !used.has(i));
    if (idx !== undefined) { order.push(idx); used.add(idx); }
  });
  headers.forEach((_, i) => { if (!used.has(i)) order.push(i); });
  return order;
}

// larguras de coluna escolhidas a arrastar o puxador no cabeçalho (ver
// colResizeHandle/pointerdown no thead, mais abaixo): guardadas por nome de
// coluna, tal como colOrder, e só por livro+aba+vista (kind) — antes de
// qualquer arrasto não há larguras gravadas, e a tabela usa o layout
// automático de sempre
function colWidthKey(data, kind) {
  return `${COLWIDTH_PREFIX}:${(data && data.file) || ""}:${(data && data.sheet) || ""}:${kind}`;
}

function loadColWidths(data, kind) {
  if (!data || !data.sheet) return {};
  try {
    const raw = JSON.parse(localStorage.getItem(colWidthKey(data, kind)) || "null");
    return raw && typeof raw === "object" ? raw : {};
  } catch (e) {
    return {};
  }
}

function saveColWidths(data, kind, widths) {
  if (!data || !data.sheet) return;
  localStorage.setItem(colWidthKey(data, kind), JSON.stringify(widths));
}

// limites usados a arrastar o puxador de coluna (ver colResizeHandle, mais
// abaixo) e a ajustar as larguras à caixa da tabela (ver fittedColWidths):
// COL_MIN_WIDTH é o mínimo de qualquer coluna à medida; ACTION_COL_MIN_WIDTH
// é o espaço reservado para a coluna de ação (nunca tem largura à medida,
// ver colgroup em render())
const COL_MIN_WIDTH = 40;
const ACTION_COL_MIN_WIDTH = 70;

// a tabela nunca deve ultrapassar a largura da sua caixa (tablebox), mesmo
// com larguras à medida gravadas de uma janela mais larga ou de colunas
// visíveis diferentes — encolhe-as proporcionalmente (sem nenhuma abaixo de
// COL_MIN_WIDTH) até caberem, sem tocar nas larguras gravadas em si
function fittedColWidths(names, availWidth) {
  const vals = names.map(n => currentColWidths[n] || null);
  const known = vals.filter(w => w != null);
  if (!known.length || !availWidth) return vals;
  let total = known.reduce((a, b) => a + b, 0);
  let overflow = total + ACTION_COL_MIN_WIDTH - availWidth;
  let guard = 0;
  while (overflow > 0.5 && guard++ < 8) {
    const idxs = vals.map((w, i) => (w != null && w > COL_MIN_WIDTH) ? i : -1).filter(i => i >= 0);
    const shrinkableTotal = idxs.reduce((a, i) => a + (vals[i] - COL_MIN_WIDTH), 0);
    if (!idxs.length || shrinkableTotal <= 0) break;
    for (const i of idxs) {
      const share = (vals[i] - COL_MIN_WIDTH) / shrinkableTotal;
      vals[i] = Math.max(COL_MIN_WIDTH, vals[i] - overflow * share);
    }
    total = vals.filter(w => w != null).reduce((a, b) => a + b, 0);
    overflow = total + ACTION_COL_MIN_WIDTH - availWidth;
  }
  return vals;
}

// categorias compostas desta aba (ver customfilters.js): [{id, name, columns:
// [nome, nome, ...]}, ...] — cada `columns` é uma lista de nomes verbatim (de
// customFilterColumns ou das categorias da vista mapeada à medida, ver
// buildCustomCompact) que passam a poder ser tratados como um só, só para
// leitura/filtro: nunca substitui as colunas de origem, que continuam
// disponíveis sozinhas (ex.: "Status TC" continua a poder ser escolhida à
// parte num filtro, mesmo depois de existir uma composta "Status TC + TP").
// Partilhada entre os filtros personalizados e a vista mapeada à medida: numa
// aba com colunas do tracker é avaliada linha a linha (evalCustomCondition);
// numa aba com categorias mapeadas só aparece na tabela se TODOS os nomes
// referidos baterem certo com categorias mesmo definidas nessa vista.
function loadCompoundCats(data) {
  if (!data || !data.sheet) return [];
  const stored = localStorage.getItem(compoundCatKey(data));
  let raw;
  if (stored === null) {
    raw = seedExampleFor("compoundCats", data);
  } else {
    try {
      raw = JSON.parse(stored);
    } catch (e) {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(cc => cc && typeof cc === "object" && String(cc.id || "").trim())
    .map(cc => {
      const seen = new Set();
      const columns = (Array.isArray(cc.columns) ? cc.columns : [])
        .map(c => String(c || "").trim()).filter(c => c && !seen.has(c) && seen.add(c));
      return { id: String(cc.id), name: String(cc.name || "").trim(), columns };
    })
    .filter(cc => cc.name && cc.columns.length >= 2);
}

function saveCompoundCats(data, list) {
  if (!data || !data.sheet) return;
  const cleaned = (list || [])
    .map(cc => {
      const seen = new Set();
      const columns = (Array.isArray(cc && cc.columns) ? cc.columns : [])
        .map(c => String(c || "").trim()).filter(c => c && !seen.has(c) && seen.add(c));
      return { id: String((cc && cc.id) || "").trim(), name: String((cc && cc.name) || "").trim(), columns };
    })
    .filter(cc => cc.id && cc.name && cc.columns.length >= 2);
  if (cleaned.length) {
    localStorage.setItem(compoundCatKey(data), JSON.stringify(cleaned));
  } else {
    localStorage.removeItem(compoundCatKey(data));
  }
}

// valor de uma coluna composta para uma condição de filtro (ver
// evalCustomCondition, mais abaixo): prefixo reservado a que nenhum cabeçalho
// real da folha deve corresponder (tal como "__cellcat__" em
// cswaios/tasks.py), para o <select> de coluna distinguir as duas sem precisar
// de outro campo no objeto da condição.
const COMPOUNDCOL_PREFIX = "__compound:";
const compoundColumnValue = id => `${COMPOUNDCOL_PREFIX}${id}`;
const compoundColumnId = v => (String(v || "").startsWith(COMPOUNDCOL_PREFIX) ? v.slice(COMPOUNDCOL_PREFIX.length) : "");

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
  const stored = localStorage.getItem(predefListKey(data));
  let raw;
  if (stored === null) {
    raw = seedExampleFor("predefLists", data);
  } else {
    try {
      raw = JSON.parse(stored);
    } catch (e) {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(l => l && typeof l === "object" && String(l.id || "").trim())
    .map(l => {
      const size = parseInt(l.size, 10);
      const values = Array.isArray(l.values) ? l.values.map(v => String(v || "").trim()).filter(Boolean) : [];
      // cor por valor (ver renderPredefListRows, viewmap.js): só faz sentido
      // para valores que ainda existem na lista — descarta as restantes, tal
      // como um valor removido perde o resto da sua configuração
      const colors = {};
      if (l.colors && typeof l.colors === "object") {
        values.forEach(v => {
          const c = l.colors[v];
          if (CUSTOMFILTER_COLORS.includes(c) && c) colors[v] = c;
        });
      }
      return {
        id: String(l.id),
        name: String(l.name || "").trim(),
        mode: l.mode === "range" ? "range" : "manual",
        values,
        colors,
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
    (l.mode === "range" ? String(l.cell || "").trim() : l.values.length))
    .map(l => {
      const colors = {};
      (l.values || []).forEach(v => { if (l.colors && l.colors[v]) colors[v] = l.colors[v]; });
      return { ...l, colors };
    });
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
  const stored = localStorage.getItem(viewMapKey(data));
  let raw;
  if (stored === null) {
    raw = seedExampleFor("viewmap", data);
  } else {
    try {
      raw = JSON.parse(stored);
    } catch (e) {
      return null;
    }
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
// "" = cor por omissão do botão-resumo (azul/info, igual a antes de existir
// escolha); as restantes vêm da paleta --coltag-* (theme.css), à parte da
// paleta de estado done/doing/blocked para nunca se confundirem (ver
// colorRow/customFilterColorDot, customfilters.js, e .pill.customfilter-*, tables.css)
const CUSTOMFILTER_COLORS = ["", "purple", "teal", "indigo", "sand", "slate"];

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
  const stored = localStorage.getItem(customFilterKey(data));
  let raw;
  if (stored === null) {
    raw = seedExampleFor("customFilters", data);
  } else {
    try {
      raw = JSON.parse(stored);
    } catch (e) {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(f => f && typeof f === "object" && String(f.id || "").trim())
    .map(f => ({
      id: String(f.id),
      name: String(f.name || "").trim(),
      color: CUSTOMFILTER_COLORS.includes(f.color) ? f.color : "",
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
      color: CUSTOMFILTER_COLORS.includes(f && f.color) ? f.color : "",
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

function evalCustomCondition(meta, c, listValuesById, compoundById) {
  // coluna composta (ver loadCompoundCats): bate certo se QUALQUER uma das
  // colunas de origem bater (OU) — assim "Status TC + TP" apanha uma linha
  // mesmo que só uma das duas vertentes se aplique. Reavalia-se a mesma
  // condição, coluna a coluna, em vez de duplicar a lógica de comparação
  // abaixo.
  const compoundId = compoundColumnId(c.column);
  if (compoundId) {
    const cc = compoundById && compoundById[compoundId];
    return !!cc && cc.columns.some(name =>
      evalCustomCondition(meta, { ...c, column: name }, listValuesById, compoundById));
  }
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
function evalCustomFilter(meta, f, listValuesById, compoundById) {
  const groups = f.groups || [];
  return groups.some(g => (g.conditions || []).every(c => evalCustomCondition(meta, c, listValuesById, compoundById)));
}

/* "Esconder as colunas dos filtros ligados": um interruptor por livro+aba (a
   checkbox no topo da janela dos filtros personalizados, ver customfilters.js).
   Ligado, as colunas que um filtro LIGADO testa saem da tabela — o valor delas
   já é conhecido (ex.: com "Do outro lado" ligado, o estado de todas as linhas
   à vista está do outro lado), por isso só ocupam espaço — e ficam à vista
   apenas as OUTRAS. Vale para qualquer botão-resumo: os do utilizador e os que
   vêm sempre com a folha ("Do meu lado", "Do outro lado", "Feito"), que são
   filtros personalizados pré-carregados (ver SEED_EXAMPLES), mais os botões de
   estado (ver statusFilters em render()). A caixa de detalhe de um item mostra
   sempre o item inteiro, mesmo com colunas escondidas (ver currentBoxCells). */
const CUSTOMFILTER_HIDECOLS_PREFIX = "bsp-tracker-customfilters-hidecols";

function customFilterHideColsKey(data) {
  return `${CUSTOMFILTER_HIDECOLS_PREFIX}:${(data && data.file) || ""}:${(data && data.sheet) || ""}`;
}

function loadCustomFilterHideCols(data) {
  if (!data || !data.sheet) return false;
  return localStorage.getItem(customFilterHideColsKey(data)) === "1";
}

function saveCustomFilterHideCols(data, on) {
  if (!data || !data.sheet) return;
  if (on) localStorage.setItem(customFilterHideColsKey(data), "1");
  else localStorage.removeItem(customFilterHideColsKey(data));
}

// colunas a esconder da tabela: as que os filtros LIGADOS testam, se o
// interruptor acima estiver ligado. Nomes verbatim, os mesmos que aparecem em
// headers/compact.headers, por isso serve as duas vistas (completa e mapeada à
// medida). Uma condição sobre uma coluna composta (ver loadCompoundCats)
// esconde a composta e as suas colunas de origem; e uma composta cujas origens
// fiquem TODAS escondidas desaparece por inteiro (não sobrava nada para mostrar
// na célula dela) — quando só parte fica escondida, a categoria mantém-se com
// as outras partes (ver buildCustomCompact).
function customFilterHiddenCols(data) {
  const out = new Set();
  if (!loadCustomFilterHideCols(data)) return out;
  const filters = loadCustomFilters(data).filter(f => customFilterActive.has(f.id));
  if (!filters.length) return out;
  const compoundCats = loadCompoundCats(data);
  filters.forEach(f => (f.groups || []).forEach(g => (g.conditions || []).forEach(c => {
    const cid = compoundColumnId(c.column);
    if (!cid) { out.add(c.column); return; }
    const cc = compoundCats.find(x => x.id === cid);
    if (cc) { out.add(cc.name); cc.columns.forEach(n => out.add(n)); }
  })));
  compoundCats.forEach(cc => { if (cc.columns.every(n => out.has(n))) out.add(cc.name); });
  return out;
}

// hiddenCols: nomes a deixar de fora das células das categorias compostas (ver
// customFilterHiddenCols) — as colunas em si (mapeadas à parte ou a própria
// composta) saem depois, em render(), que trata as duas vistas do mesmo modo.
// Sem argumento nada é escondido, que é o que o painel do Por fazer quer (ver
// todo.js).
function buildCustomCompact(data, hiddenCols) {
  const cv = data && data.cell_view;
  const cfg = loadViewMap(data);
  const catHeaders = (cv && cv.headers) || [];
  const execOn = !!(cfg && cfg.exec);
  if (!catHeaders.length && !execOn) return null;

  // categorias compostas (ver loadCompoundCats, customfilters.js): só entram
  // na tabela quando TODOS os nomes que referem existem mesmo entre as
  // categorias já mapeadas nesta aba — sem isso não haveria de onde tirar o
  // valor. O agrupamento em si é só leitura (não corresponde a uma célula do
  // Excel), mas cada parte continua a ser a MESMA categoria de origem — por
  // isso cada uma mantém o seu próprio cellCatSpan (editável, com a cor da
  // lista predefinida se houver uma), só que agora todas dentro da mesma
  // célula, separadas por quebra de linha. As colunas absorvidas por uma
  // composta deixam de aparecer à parte NESTA tabela — continuam disponíveis
  // nos filtros personalizados (ver compoundCatColumnsPool/evalCustomCondition),
  // que não passam por aqui.
  const compoundCats = loadCompoundCats(data).filter(cc => cc.columns.every(name => catHeaders.includes(name)));
  const absorbed = new Set(compoundCats.flatMap(cc => cc.columns));
  const hidden = hiddenCols || new Set();
  const visibleIdx = catHeaders.map((_, i) => i).filter(i => !absorbed.has(catHeaders[i]));
  const headers = [...visibleIdx.map(i => catHeaders[i]), ...compoundCats.map(cc => cc.name), ...(execOn ? [t("hdr_exec")] : [])];
  const compoundIdx = new Set(compoundCats.map((_, i) => visibleIdx.length + i));
  const execIdx = execOn ? headers.length - 1 : -1;
  const catRows = (cv && cv.rows) || [];
  // categorias com useList=true (ver openCellCatEditor): coluna real (0-based),
  // opções da lista e, por linha, se há alteração local por enviar + o valor
  // cru da folha (para o Push saber comparar, tal como meta.orig nas colunas fixas)
  // — tudo reindexado por visibleIdx, para acompanhar as colunas escondidas acima
  const useListFull = (cv && cv.useList) || [];
  const catColsFull = (cv && cv.cols) || [];
  const catListsFull = (cv && cv.lists) || [];
  const catOptionsFull = (cv && cv.options) || [];
  const pendingRowsFull = (cv && cv.pending) || [];
  const baseRowsFull = (cv && cv.base) || [];
  // id da lista predefinida (ver loadPredefLists) usada por cada categoria
  // mapeada, por posição — só o cliente conhece essa biblioteca (o servidor só
  // devolve os valores já resolvidos em catOptionsFull), por isso resolve-se
  // aqui a partir de cfg.categories, que está na mesma ordem/posição que
  // catHeaders (ambos vêm do mesmo array enviado ao servidor em tabQuery).
  // Serve para colorir o valor por cor definida por valor (ver
  // predefListDraft/renderPredefListRows, viewmap.js) — sem lista fixa
  // associada, ou sem cores definidas nela, o valor fica sem cor, como sempre.
  const catCfgFull = (cfg && cfg.categories) || [];
  const listIdFull = catHeaders.map((_, i) => {
    const c = catCfgFull[i];
    return (c && c.useList && c.listMode === "fixed" && c.listId) || "";
  });
  const colorsByListId = {};
  loadPredefLists(data).forEach(l => { colorsByListId[l.id] = l.colors || {}; });
  const colorFor = (origIdx, value) => {
    const listId = listIdFull[origIdx];
    const colors = listId && colorsByListId[listId];
    return (colors && colors[String(value || "").trim()]) || "";
  };

  const useList = visibleIdx.map(i => useListFull[i]);
  const catCols = visibleIdx.map(i => catColsFull[i]);
  const catLists = visibleIdx.map(i => catListsFull[i]);
  const catOptions = visibleIdx.map(i => catOptionsFull[i]);
  const catListId = visibleIdx.map(i => listIdFull[i]);
  // com um filtro a esconder colunas, cada linha sai em dois sabores: o da
  // TABELA (sem as partes escondidas) e o COMPLETO, que é o que a caixa de
  // detalhe mostra (ver currentBoxCells em render() e itembox.js) — fullOf liga
  // um ao outro pela própria linha, que sobrevive à pesquisa e aos filtros
  const pairs = (data.row_meta || []).map((meta, ri) => {
    const fullVals = (catRows[ri] || catHeaders.map(() => "")).slice();
    const vals = visibleIdx.map(i => fullVals[i]);
    const valsFull = hidden.size ? vals.slice() : null;
    const pendingFull = pendingRowsFull[ri] || [];
    const baseFull = baseRowsFull[ri] || [];
    compoundCats.forEach(cc => {
      const parts = cc.columns.map(name => {
        const origIdx = catHeaders.indexOf(name);
        const val = String(fullVals[origIdx] || "").trim();
        const span = cellCatSpan(
          val || "—", catColsFull[origIdx], catOptionsFull[origIdx] || [], catListsFull[origIdx] || null,
          !!pendingFull[origIdx], baseFull[origIdx] || "", meta, colorFor(origIdx, val));
        return { name, html: `<strong>${esc(name)}:</strong> ${span}` };
      });
      // uma parte escondida por um filtro ativo (ver customFilterHiddenCols)
      // sai só de dentro desta célula: as restantes partes da mesma composta
      // continuam à vista, cada uma com o seu cellCatSpan editável
      vals.push(parts.filter(p => !hidden.has(p.name)).map(p => p.html).join("<br>"));
      if (valsFull) valsFull.push(parts.map(p => p.html).join("<br>"));
    });
    if (execOn) {
      const exec = execSummary(meta);
      vals.push(exec);
      if (valsFull) valsFull.push(exec);
    }
    if (meta) {
      meta.cellcatPending = visibleIdx.map(i => pendingFull[i]);
      meta.cellcatBase = visibleIdx.map(i => baseFull[i]);
    }
    vals.push(meta || null);
    if (valsFull) valsFull.push(meta || null);
    return { vals, valsFull };
  });
  const rows = pairs.map(p => p.vals);
  const fullOf = hidden.size ? new Map(pairs.map(p => [p.vals, p.valsFull])) : null;

  return { headers, rows, fullOf, custom: true, execIdx, compoundIdx, useList, catCols, catLists, catOptions, catListId, listColors: colorsByListId };
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

// cor por valor de uma lista predefinida (ver colorFor em buildCustomCompact)
// associada a uma categoria mapeada com o mesmo NOME desta coluna — deixa um
// badge de Status TC/TP fora da vista mapeada (ex.: o painel do Por fazer,
// ver badgeHtml) usar a mesma cor que a vista mapeada desta folha já usa
// para esse valor, para as duas nunca discordarem. Sem categoria homónima,
// ou sem lista fixa com cores associada, devolve "" (sem cor definida).
function categoryListColor(data, colName, value) {
  const cv = data && data.cell_view;
  const catHeaders = (cv && cv.headers) || [];
  const idx = catHeaders.indexOf(colName);
  if (idx < 0) return "";
  const cat = ((loadViewMap(data) || {}).categories || [])[idx];
  if (!cat || !cat.useList || cat.listMode !== "fixed" || !cat.listId) return "";
  const list = loadPredefLists(data).find(l => l.id === cat.listId);
  const colors = (list && list.colors) || {};
  return colors[String(value || "").trim()] || "";
}

// display existe só para o texto visível: a classificação por cor
// (statusClass) continua a usar o estado cru, para a anotação da coluna
// ("in review (Status TP)") não estragar o reconhecimento do estado
function badgeHtml(text, col, meta, editable = meta && (col === "Status TC" || col === "Status TP"), display = text, colTag = "") {
  const local = !!(meta && meta.over && meta.over[col]);
  const title = local ? t("t_local") : t("t_edit_status");
  // o texto pode vir com o prefixo "TC: "/"TP: " (ver todoTaskInfoHtml, todo.js)
  // — a cor por valor tem de bater com o valor cru da folha, sem esse prefixo
  const rawValue = String(text || "").replace(/^(?:TC|TP):\s*/, "");
  const listColor = lastData ? categoryListColor(lastData, col, rawValue) : "";
  const cls = listColor ? `customfilter-${listColor}` : statusClass(text);
  return `<span class="badge ${cls}${local ? " local" : ""}"` +
    // data-rawstatus guarda o texto sem a anotação da coluna (ex.: sem "(Status TP)")
    // — openStatusEditor lê daqui, nunca do innerText do badge, senão o valor
    // gravado no Excel viria com a anotação colada por engano
    (editable ? ` data-xlrow="${esc(meta.xlrow)}" data-col="${esc(col)}" data-rawstatus="${esc(text)}" title="${title}"` : "") +
    `>${colTag}${highlightTerms(display)}${local ? " ✎" : ""}</span>`;
}

// categoria livre da vista mapeada à medida (ver openCellCatEditor): texto
// clicável, tal como o Function/TC e o "To Do". Com useList=true fica
// limitada a uma lista de valores predefinida (list/options não vazios); sem
// lista, texto livre. col0/options/list vêm de compact.catCols/catOptions/
// catLists (build_cell_categories, cswaios/tasks.py), na mesma posição que
// este cabeçalho; a cor (se a lista tiver cores por valor, ver
// predefListDraft/renderPredefListRows em viewmap.js) vem de
// compact.catListId/listColors, resolvidos no cliente em buildCustomCompact.
function cellCatHtml(text, colIdx, meta, compact) {
  const pending = !!(meta && meta.cellcatPending && meta.cellcatPending[colIdx]);
  const base = (meta && meta.cellcatBase && meta.cellcatBase[colIdx]) || "";
  const options = (compact.catOptions || [])[colIdx] || [];
  const col0 = (compact.catCols || [])[colIdx];
  const list = (compact.catLists || [])[colIdx] || null;
  const listId = (compact.catListId || [])[colIdx] || "";
  const colors = (compact.listColors || {})[listId] || {};
  const color = colors[String(text || "").trim()] || "";
  return cellCatSpan(text, col0, options, list, pending, base, meta, color);
}

// núcleo de cellCatHtml, com os valores já resolvidos (em vez de indexados em
// `compact`) — usado também pelas partes de uma categoria composta
// (buildCustomCompact), que se referem a uma coluna de origem que já não está
// em visibleIdx (por isso não dá para indexar compact.catCols/etc. por
// colIdx, tem de vir tudo resolvido pelo índice original em catHeaders).
function cellCatSpan(text, col0, options, list, pending, base, meta, color = "") {
  const title = pending ? t("t_local") : t("t_edit_cellcat");
  const label = color
    ? `<span class="badge customfilter-${esc(color)}">${highlightTerms(text)}</span>`
    : highlightTerms(text);
  return `<span class="cellcatText${pending ? " local" : ""}"` +
    ` data-catxlrow="${esc(meta.xlrow)}" data-catcol="${esc(col0)}" data-catbase="${esc(base)}"` +
    ` data-catoptions="${esc(JSON.stringify(options))}" data-catlist="${esc(JSON.stringify(list))}"` +
    ` title="${esc(title)}">${label}${pending ? " ✎" : ""}</span>`;
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

// lista legível das alterações locais (✎) por enviar, para o title do botão
// "Enviar (N)" — o número por si só não diz o que vai mesmo ser enviado.
function pendingSummary(details) {
  if (!details || !details.length) return "";
  return details.map(d => `${d.sheet} · ${d.task} · ${d.field}: ${d.value}`).join("\n");
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
    // numa janela dedicada a um livro o nome dele fica no título (ver SOLO_WB
    // em state.js): é o que distingue as janelas na barra de tarefas
    document.title = SOLO_WB && activeTab()
      ? `DEV — ${activeTab().name}` : "DEV — My Organizer";
    document.querySelector("header h1").textContent = "My Organizer (DEV)";
  }

  // com alterações locais pendentes, o "Atualizar" passa a "Push"
  // (fica antes do ramo de erro: o Push funciona mesmo com o ficheiro bloqueado)
  const web = data.source === "onedrive";
  // fonte web: não há ficheiro local para descarregar nem Excel para fechar
  $("fetchBtn").classList.toggle("hidden", web);
  const pending = data.pending || 0;
  const pushLabel = pending ? `${t("btn_push")} (${pending})` : t("btn_refresh");
  const pushTitle = pending ? pendingSummary(data.pending_details) : "";
  $("refresh").textContent = pushLabel;
  $("refresh").title = pushTitle;
  $("reloadOnly").classList.toggle("hidden", !pending);
  $("clearLocals").classList.toggle("hidden", !pending);
  // o mesmo botão na página Por fazer, para não ser preciso voltar às Tarefas
  // só para enviar (só aparece quando há mesmo algo por enviar)
  $("refreshTodo").textContent = pushLabel;
  $("refreshTodo").title = pending ? pushTitle : t("t_push_todo");
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
  updateCompoundCatButton(data);

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

  // colunas escondidas por causa dos filtros ligados (ver
  // customFilterHiddenCols): resolvidas aqui porque a vista mapeada precisa
  // delas ao montar as células das categorias compostas
  const hiddenCols = customFilterHiddenCols(data);
  // vista mapeada à medida, para folhas onde o utilizador definiu categorias
  // por coordenadas de célula nas Definições (ver viewmap.js)
  const compact = buildCustomCompact(data, hiddenCols);
  $("viewToggle").classList.toggle("hidden", !compact);
  const useCompact = compact && compactView;
  // qual vista está à vista agora, para a ordem de colunas arrastada pelo
  // utilizador (ver colOf/resolveColOrder, mais abaixo, e o drop no thead) —
  // cada vista tem o seu próprio conjunto de colunas, por isso cada uma
  // guarda a sua própria ordem
  currentColOrderKind = useCompact ? "custom" : "full";
  // lista/caixas vale para as duas vistas (resumida e completa)
  $("taskMode").classList.remove("hidden");
  const headers = useCompact ? compact.headers : data.headers;
  const allRows = useCompact ? compact.rows : data.rows;
  // meta (row_meta, com o orig por coluna real) de uma linha à vista, seja
  // qual for a vista ativa — usado tanto para os filtros personalizados como
  // para currentMeta, mais abaixo
  const metaFor = r => useCompact ? (r[headers.length] || null)
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
  const statusIdx = useCompact ? -1 : headers.findIndex(isStatusHeader);
  let rows = searched;
  if (statusFilters.size && statusIdx >= 0 && !useCompact) {
    rows = rows.filter(r => statusLines(r[statusIdx]).some(s => statusFilters.has(s)));
    // um botão de estado ligado também torna a coluna de estado redundante (ver
    // customFilterHiddenCols). Junta-se aqui, e não lá, porque só agora se sabe
    // qual é a coluna de estado desta vista — e isso não muda nada para as
    // categorias compostas, que só existem na vista mapeada, onde não há
    // botões de estado (statusIdx = -1).
    if (loadCustomFilterHideCols(data)) hiddenCols.add(headers[statusIdx]);
  }

  // filtros personalizados (ver customfilters.js): sempre pela coluna real da
  // folha (row_meta[].orig), por isso funcionam em qualquer vista — à medida
  // por coordenadas ou tabela completa. Cada um ativo aplica-se em AND com os
  // restantes (tal como o estado já faz); a contagem de cada botão é
  // facetada pelos OUTROS filtros personalizados ativos, mas já com o estado
  // aplicado.
  const allCustomFilters = loadCustomFilters(data);
  const activeCustomFilters = allCustomFilters.filter(f => customFilterActive.has(f.id));
  const customListValues = customFilterListValues(data, allCustomFilters);
  // categorias compostas (ver loadCompoundCats): resolvidas uma vez aqui, por
  // id, para evalCustomCondition poder expandi-las nas colunas de origem
  const compoundById = {};
  loadCompoundCats(data).forEach(cc => { compoundById[cc.id] = cc; });
  const customFacetCounts = {};
  allCustomFilters.forEach(f => {
    const others = allCustomFilters.filter(o => o.id !== f.id && customFilterActive.has(o.id));
    const base = others.length
      ? rows.filter(r => others.every(o => evalCustomFilter(metaFor(r), o, customListValues, compoundById)))
      : rows;
    customFacetCounts[f.id] = base.filter(r => evalCustomFilter(metaFor(r), f, customListValues, compoundById)).length;
  });
  if (activeCustomFilters.length)
    rows = rows.filter(r => activeCustomFilters.every(f => evalCustomFilter(metaFor(r), f, customListValues, compoundById)));

  // tarefas paradas (ver taskIsStale, static/js/history.js): um botão à parte,
  // porque isto não sai de nenhuma coluna da folha — sai do histórico, que só
  // o servidor tem. Sem histórico ainda lido não se mostra botão nenhum, em
  // vez de mostrar um a dizer 0 (que pareceria "não há nenhuma parada").
  const temHistorico = !!activeHistory();
  const staleN = temHistorico ? rows.filter(r => taskIsStale(metaFor(r))).length : 0;
  if (staleOnly && temHistorico) rows = rows.filter(r => taskIsStale(metaFor(r)));
  // "À espera": linhas com uma espera marcada cujo prazo já passou (ou sem
  // prazo) — é a lista do que há a cobrar a alguém (ver waiting.js). Ao
  // contrário das paradas, não depende do histórico: a marca é nossa.
  const chaseN = rows.filter(r => waitingOverdue(metaFor(r))).length;
  if (chaseOnly) rows = rows.filter(r => waitingOverdue(metaFor(r)));

  let summaryHtml = `<span class="pill">${rows.length} ${rows.length === 1 ? t("tasks_one") : t("tasks_many")}` +
    (showAll ? ` ${t("of_all")}` : ` ${t("of_person")} ${esc(PERSON)}`) + `</span>`;
  const pillClasses = (extra, active, n) =>
    `pill${extra ? " " + extra : ""}${active ? " active" : ""}${!active && n === 0 ? " zero" : ""}`;

  if (statusIdx >= 0 && searched.length) {
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
      `<span class="${pillClasses(`customfilter${f.color ? " customfilter-" + f.color : ""}`, customFilterActive.has(f.id), customFacetCounts[f.id] || 0)}" ` +
      `data-customfilter="${esc(f.id)}">${esc(f.name)}: ${customFacetCounts[f.id] || 0}</span>`
    ).join("");
  }
  if (temHistorico && (staleN || staleOnly)) {
    summaryHtml += `<span class="${pillClasses("stalepill", staleOnly, staleN)}" ` +
      `data-stale="1" title="${esc(tf("t_stale", staleDays()))}">⏳ ${esc(t("pill_stale"))}: ${staleN}</span>`;
  }
  if (chaseN || chaseOnly) {
    summaryHtml += `<span class="${pillClasses("chasepill", chaseOnly, chaseN)}" ` +
      `data-chase="1" title="${esc(t("t_chase"))}">⏸ ${esc(t("pill_chase"))}: ${chaseN}</span>`;
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
  // vista resumida à medida: a caixa encolhe à largura das colunas
  // mostradas, em vez de esticar a 100% do painel e criar scroll horizontal
  // (ver .tablebox.compactFit, tables.css)
  tbl.classList.toggle("compactFit", useCompact);
  // ordem de exibição das colunas (ver resolveColOrder/saveColOrder, e o
  // dragstart/drop no thead, mais abaixo): colOf[i] é o índice ORIGINAL em
  // headers/r[] que aparece na posição i do ecrã — arrastar um cabeçalho só
  // muda esta ordem, nunca o que cada índice significa (ver i2 no bloco da
  // tbody, à frente)
  const colAll = resolveColOrder(data, currentColOrderKind, headers);
  // com o interruptor ligado, as colunas que um filtro ligado testa saem da
  // tabela (ver customFilterHiddenCols). A 1.ª coluna nunca sai — é o nome do
  // item (título do cartão, e é dela que sai o título de um "+ Por fazer", ver
  // addTodoFromTaskRow em todo.js), sem ela as linhas ficavam anónimas.
  const colVisible = hiddenCols.size
    ? colAll.filter((i2, i) => i === 0 || !hiddenCols.has(headers[i2]))
    : colAll;
  const hiding = colVisible.length < colAll.length;
  const colOf = hiding ? colVisible : colAll;
  // a ordem completa fica à mão para arrastar um cabeçalho com colunas
  // escondidas não as empurrar para o fim (ver o drop no thead)
  currentColNamesAll = colAll.map(i2 => headers[i2]);
  // larguras à medida (ver colResizeHandle/pointerdown, mais abaixo): sem
  // nenhuma gravada ainda, a tabela fica no layout automático de sempre
  currentColWidths = loadColWidths(data, currentColOrderKind);
  const hasCustomWidths = Object.keys(currentColWidths).length > 0;
  $("tasksTable").classList.toggle("colsFixed", hasCustomWidths);
  const fitted = hasCustomWidths
    ? fittedColWidths(colOf.map(i2 => headers[i2]), $("tablebox").clientWidth)
    : [];
  $("colgroup").innerHTML = colOf.map((i2, i) => {
    const w = fitted[i];
    return `<col${w ? ` style="width:${Math.round(w)}px"` : ""}>`;
  }).join("") + "<col>";
  $("thead").innerHTML = "<tr>" + colOf.map(i2 =>
    `<th draggable="true" data-colname="${esc(headers[i2])}" title="${esc(t("t_col_drag"))}">` +
    `${esc(headers[i2])}<span class="colResizeHandle" data-resize="${esc(headers[i2])}" draggable="false"></span></th>`
  ).join("") + `<th class="todoActionCell">${esc(t("hdr_action"))}</th></tr>`;
  currentMeta = rows.map(metaFor);
  currentObs = rows.map(() => "");
  currentStatuses = data.statuses || [];
  // "estado em massa" só faz sentido com linhas à vista e uma lista de estados
  // de onde escolher (ver openBulkStatus)
  $("bulkStatusBtn").classList.toggle("hidden",
    !currentStatuses.length || !bulkColsAvailable().length);

  function statusCell(r, ri, i) {
    const meta = currentMeta[ri];
    const c = r[i] ? String(r[i]) : "";
    return c ? badgeHtml(c, headers[i], meta) : "";
  }

  // o botão "+ TODO" só existe enquanto a linha não estiver na TODO list
  function todoAddBtn(r, ri) {
    const meta = currentMeta[ri] || {};
    // na vista mapeada a 1.ª coluna é a que o utilizador lá pôs e pode vir
    // vazia: o título do item cai então no Function/TC da linha (a mesma conta
    // está em addTodoFromTaskRow, todo.js — as duas têm de dar o mesmo, senão
    // o "+ TODO" não desaparecia da linha que já tem item)
    const title = String(r[0] === undefined ? "" : r[0]).split("\n")[0].trim()
      || String(meta.fn || "").trim();
    const ref = {
      workbook: activeBookName(), sheet: data.sheet || "",
      fn: meta.fn || title, todo: meta.todo || "",
    };
    return todoHas("task", title, ref) ? ""
      : `<button type="button" class="todoActionBtn" data-todoadd="${ri}" title="${t("todo_add_click")}">${t("btn_add_todo")}</button>`;
  }

  // HTML de uma célula. A mesma conta serve a tabela e a caixa de detalhe: com
  // um filtro a esconder colunas, a caixa é montada a partir da linha COMPLETA
  // (ver currentBoxCells, mais abaixo), que a tabela não tem.
  // Decorações da 1.ª coluna (a do nome do item): pino do quadro de Notas
  // ligado a esta linha (ver taskNoteFlagHtml, notes.js) e etiqueta de tarefa
  // parada (ver staleChipHtml, history.js). Ficam aqui, num sítio só, para
  // valerem na tabela, nos cartões e na caixa de detalhe ao mesmo tempo.
  function firstColExtras(ri) {
    const m = currentMeta[ri];
    if (!m) return "";
    return taskNoteFlagHtml(m) + staleChipHtml(m) + waitingChipHtml(m);
  }

  function cellHtmlOf(r, ri, i2) {
    const cell = (() => {
      const c = r[i2] !== undefined ? r[i2] : "";
      // vista mapeada à medida: todas as categorias livres são editáveis
      // (dropdown com useList, texto livre sem — ver cellCatHtml/
      // openCellCatEditor) — a única exceção é a Execução, se o utilizador
      // a ligou nas Definições
      if (useCompact) {
        if (i2 === compact.execIdx) {
          const m = currentMeta[ri] || {};
          const { inner, title } = execCellHtml(m);
          return `<td class="execCell" data-xlrow="${esc(m.xlrow || "")}" title="${esc(title)}">${inner}</td>`;
        }
        // categoria composta (ver buildCustomCompact): só mostra o valor já
        // junto das colunas de origem, nunca editável (não corresponde a
        // uma única célula do Excel para o cellCatHtml/openCellCatEditor
        // poderem gravar). `c` já vem com o HTML pronto (nomes a negrito,
        // valores escapados) de buildCustomCompact — não passa por
        // highlightTerms, que voltaria a escapar as tags <strong>
        if (compact.compoundIdx && compact.compoundIdx.has(i2))
          return `<td class="compoundCatText" title="${esc(t("compoundcat_hint"))}">${c}</td>`;
        const m = currentMeta[ri] || {};
        return `<td${i2 === 0 ? ' class="fn"' : ""}>${cellCatHtml(c, i2, m, compact)}` +
          `${i2 === 0 ? firstColExtras(ri) : ""}</td>`;
      }
      if (isStatusHeader(headers[i2]))
        return `<td>${statusCell(r, ri, i2)}</td>`;
      // sem classe "fn" aqui de propósito: na vista completa a 1.ª coluna
      // nunca teve o estilo de título dos cartões e não é isto que o muda
      if (i2 === 0)
        return `<td>${esc(c)}${firstColExtras(ri)}</td>`;
      return `<td>${esc(c)}</td>`;
    })();
    // em ecrãs estreitos a tabela vira cartões: cada célula mostra o seu cabeçalho
    return cell.replace("<td", `<td data-label="${esc(headers[i2])}"`);
  }

  $("tbody").innerHTML = rows.map((r, ri) =>
    `<tr draggable="true" title="${t("t_drag")}">` +
    colOf.map(i2 => cellHtmlOf(r, ri, i2)).join("") +
    `<td class="todoActionCell">${todoAddBtn(r, ri)}</td></tr>`
  ).join("");
  // caixa de detalhe de um item (ver itemBoxFields, itembox.js): mostra sempre
  // o item INTEIRO, mesmo com um filtro a esconder colunas da tabela. Como
  // essas células não existem no DOM, guarda-se aqui a linha completa (todas as
  // colunas, e cada categoria composta com todas as partes — ver fullOf em
  // buildCustomCompact), pela ordem de exibição. Sem nada escondido fica null e
  // a caixa continua a ler a linha da tabela, como sempre.
  currentBoxCells = !hiding ? null : rows.map((r, ri) => {
    const full = (compact && compact.fullOf && compact.fullOf.get(r)) || r;
    return colAll.map(i2 => ({ label: headers[i2], html: cellHtmlOf(full, ri, i2) }));
  });
  // colunas de mais para a caixa: mede a largura que a tabela pediria sem a
  // compressão do compactFit (ver .tablebox.compactFit, tables.css) contra a
  // largura do painel que envolve a tablebox — que, ao contrário dela, não
  // encolhe/estica com o conteúdo. Corre também com larguras à medida
  // gravadas (hasCustomWidths): fittedColWidths só conhece as colunas que já
  // existiam quando foram gravadas, por isso uma coluna nova na vista (ex.:
  // categoria acrescentada depois) pode continuar sem largura própria e
  // empurrar a tabela para além da caixa. Em janela larga (aqui nunca é
  // _narrow — essa já forçou "cards" acima, e o guard de baixo salta o
  // bloco) a resposta é scroll horizontal (.overflowScroll, tables.css), não
  // cartões: só em janela muito estreita é que os cartões substituem o
  // scroll.
  tbl.classList.remove("overflowScroll");
  if (!tbl.classList.contains("cards")) {
    const table = $("tasksTable");
    // largura=auto (a normal) não chega para medir uma tabela colsFixed: com
    // table-layout:fixed, width:auto resolve sempre à largura do contentor
    // disponível (por definição da norma), nunca "excede" por si só, só
    // espreme a(s) coluna(s) sem largura gravada até ficarem ilegíveis.
    // width:max-content força o browser a devolver a largura que o
    // conteúdo pediria mesmo assim — só essa revela a necessidade real.
    const prevWidth = table.style.width;
    const prevMaxWidth = table.style.maxWidth;
    table.style.width = "max-content";
    table.style.maxWidth = "none";
    const needed = table.scrollWidth;
    table.style.width = prevWidth;
    table.style.maxWidth = prevMaxWidth;
    if (needed > tbl.parentElement.clientWidth) tbl.classList.add("overflowScroll");
  }
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
  // histórico da folha (idades e "o que aconteceu a esta tarefa"): pedido à
  // parte, depois de desenhar, para nunca atrasar o que já se pode mostrar
  loadTaskHistory(activeTab());
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
  if (catText && !catText.dataset.editing) return openCellCatEditor(catText);
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

// arrastar um cabeçalho de coluna para reordenar (ver colOf/resolveColOrder/
// saveColOrder, mais acima): guarda-se por nome de coluna, nunca por posição,
// para sobreviver a colunas que apareçam/desapareçam entre atualizações
let _colDragName = "";
$("thead").addEventListener("dragstart", e => {
  const th = e.target.closest("th[data-colname]");
  if (!th) return;
  _colDragName = th.dataset.colname;
  e.dataTransfer.effectAllowed = "move";
  try { e.dataTransfer.setData("text/plain", _colDragName); } catch (err) { /* alguns browsers exigem setData mesmo sem a usar */ }
  th.classList.add("colDragging");
});
$("thead").addEventListener("dragend", e => {
  const th = e.target.closest("th[data-colname]");
  if (th) th.classList.remove("colDragging");
  _colDragName = "";
});
$("thead").addEventListener("dragover", e => {
  if (!_colDragName || !e.target.closest("th[data-colname]")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
});
$("thead").addEventListener("drop", e => {
  const th = e.target.closest("th[data-colname]");
  if (!th || !_colDragName || !lastData) return;
  e.preventDefault();
  const toName = th.dataset.colname;
  if (toName === _colDragName) return;
  const names = [...$("thead").querySelectorAll("th[data-colname]")].map(el => el.dataset.colname);
  const from = names.indexOf(_colDragName), to = names.indexOf(toName);
  if (from < 0 || to < 0) return;
  names.splice(to, 0, names.splice(from, 1)[0]);
  // um filtro ligado pode ter tirado colunas do thead (ver
  // customFilterHiddenCols): elas não estão em `names`, e gravar só o que está
  // à vista mandá-las-ia para o fim da ordem quando o filtro se desligasse —
  // por isso voltam para o lugar que tinham na ordem completa deste render
  currentColNamesAll.forEach((n, i) => {
    if (!names.includes(n)) names.splice(Math.min(i, names.length), 0, n);
  });
  saveColOrder(lastData, currentColOrderKind, names);
  render();
});

// arrastar o puxador no canto de um cabeçalho para definir a largura dessa
// coluna (ver colWidthKey/loadColWidths/saveColWidths, mais acima): à
// primeira vez que se arrasta nesta vista, "congela" a largura atual (auto)
// de todas as colunas, para o layout deixar de saltar quando table-layout
// passa a fixed — só depois disso a coluna arrastada muda de facto
let _colResize = null;   // { name, th, startX, startWidth } enquanto se arrasta
$("thead").addEventListener("pointerdown", e => {
  const handle = e.target.closest(".colResizeHandle");
  if (!handle) return;
  const th = handle.closest("th[data-colname]");
  if (!th) return;
  e.preventDefault();
  e.stopPropagation();
  if (!Object.keys(currentColWidths).length) {
    // colgroup e os <th data-colname> foram construídos pela mesma ordem
    // (colOf, ver render()), por isso o índice i alinha um a um
    [...$("thead").querySelectorAll("th[data-colname]")].forEach((el, i) => {
      const w = Math.round(el.getBoundingClientRect().width);
      currentColWidths[el.dataset.colname] = w;
      const col = $("colgroup").children[i];
      if (col) col.style.width = `${w}px`;
    });
    $("tasksTable").classList.add("colsFixed");
  }
  _colResize = { name: handle.dataset.resize, th, startX: e.clientX, startWidth: th.getBoundingClientRect().width };
  handle.classList.add("resizing");
  handle.setPointerCapture(e.pointerId);
});
$("thead").addEventListener("pointermove", e => {
  if (!_colResize) return;
  const cols = [...$("colgroup").children];
  const i = [...$("thead").querySelectorAll("th[data-colname]")].indexOf(_colResize.th);
  const col = cols[i];
  if (!col) return;
  // a coluna arrastada nunca pode crescer a ponto de a tabela ultrapassar a
  // caixa (tablebox) — o espaço disponível é o que resta depois das outras
  // colunas já fixadas (congeladas no pointerdown) e da coluna de ação
  const othersWidth = cols.reduce((sum, c, ci) =>
    sum + (ci !== i && c.style.width ? parseFloat(c.style.width) : 0), 0);
  const avail = $("tablebox").clientWidth;
  const maxWidth = avail ? Math.max(COL_MIN_WIDTH, avail - othersWidth - ACTION_COL_MIN_WIDTH) : Infinity;
  const width = Math.min(maxWidth,
    Math.max(COL_MIN_WIDTH, Math.round(_colResize.startWidth + (e.clientX - _colResize.startX))));
  col.style.width = `${width}px`;
});
$("thead").addEventListener("pointerup", e => {
  if (!_colResize || !lastData) { _colResize = null; return; }
  const i = [...$("thead").querySelectorAll("th[data-colname]")].indexOf(_colResize.th);
  const width = $("colgroup").children[i] && parseInt($("colgroup").children[i].style.width, 10);
  if (width) currentColWidths[_colResize.name] = width;
  saveColWidths(lastData, currentColOrderKind, currentColWidths);
  const resizing = $("thead").querySelector(".colResizeHandle.resizing");
  if (resizing) resizing.classList.remove("resizing");
  _colResize = null;
});
$("thead").addEventListener("pointercancel", () => {
  const resizing = $("thead").querySelector(".colResizeHandle.resizing");
  if (resizing) resizing.classList.remove("resizing");
  _colResize = null;
});

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
  autoGrowEditor(txt, () => grava(txt.value));
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
  autoGrowEditor(txt, () => grava(txt.value));
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

/* ---------- estado em massa ----------
   Uma ronda de rework mexe no mesmo estado de meia dúzia de linhas seguidas, e
   uma a uma são meia dúzia de idas ao Excel. Aqui a SELEÇÃO é a vista: as
   linhas que estão à frente dos olhos depois dos filtros (currentMeta) — nada
   de caixas de marcar novas na tabela. Como qualquer alteração de estado, o
   resultado fica local (✎) à espera do Push, por isso um clique a mais
   desfaz-se com o "Descartar locais". */
const BULK_COLS = ["Status TC", "Status TP"];
const BULK_PREVIEW = 8;         // linhas mostradas na janela antes de aplicar

// Linhas à vista em que esta coluna existe e quer dizer algo: "N/A" é "não se
// aplica a esta linha" e escrever lá um estado seria inventar trabalho.
function bulkRowsFor(col) {
  return (currentMeta || []).filter(meta => {
    const valor = String(((meta && meta.cur) || {})[col] || "").trim();
    return !!valor && norm(valor) !== "n/a";
  });
}

function bulkColsAvailable() {
  return BULK_COLS.filter(col => bulkRowsFor(col).length);
}

function renderBulkStatus() {
  const col = $("bulkColSel").value;
  const alvo = bulkRowsFor(col);
  $("bulkCount").textContent = tf("bulk_count", alvo.length, col);
  $("bulkList").innerHTML = alvo.slice(0, BULK_PREVIEW).map(meta => {
    const de = String(((meta.cur) || {})[col] || "").trim();
    return `<li><span class="bulkName">${esc(meta.fn || `linha ${meta.xlrow}`)}</span>` +
      `<span class="bulkFrom">${esc(de)}</span></li>`;
  }).join("") + (alvo.length > BULK_PREVIEW
    ? `<li class="bulkMore">${esc(tf("bulk_more", alvo.length - BULK_PREVIEW))}</li>` : "");
  $("bulkApply").disabled = !alvo.length || !$("bulkStatusSel").value;
}

function openBulkStatus() {
  const cols = bulkColsAvailable();
  if (!cols.length) { toast(t("bulk_none"), ""); return; }
  $("bulkColSel").innerHTML = cols.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  $("bulkStatusSel").innerHTML = (currentStatuses || [])
    .map(sv => `<option value="${esc(sv)}">${esc(sv)}</option>`).join("");
  $("bulkHint").textContent = t("bulk_hint");
  $("bulkOverlay").classList.remove("hidden");
  renderBulkStatus();
}

function closeBulkStatus() {
  $("bulkOverlay").classList.add("hidden");
}

async function applyBulkStatus() {
  const col = $("bulkColSel").value;
  const valor = $("bulkStatusSel").value;
  const alvo = bulkRowsFor(col);
  if (!alvo.length || !valor) return;
  $("bulkApply").disabled = true;
  try {
    const res = await fetch("/api/update/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: lastData.file, sheet: lastData.sheet, column: col, value: valor,
        // a base é o valor CRU da folha de cada linha (meta.orig), como no
        // editor de uma célula: é o que permite ao Push perceber que a folha
        // mudou entretanto e desistir dessa linha
        items: alvo.map(meta => ({
          fn: meta.fn, todo: meta.todo, xlrow: meta.xlrow,
          base: (meta.orig || {})[col] || "",
        })),
      }),
    });
    const out = await res.json();
    if (!out.ok) { alert(`${t("err_save")} ` + (out.error || "?")); return; }
    closeBulkStatus();
    toast(tf("bulk_done", out.queued, col), "ok");
    if ((out.failed || []).length) clientLog(`estado em massa: falhas ${out.failed.join(" | ")}`);
  } catch (err) {
    alert("Não foi possível contactar o servidor: " + err);
  } finally {
    $("bulkApply").disabled = false;
  }
  load();
}

$("bulkStatusBtn").addEventListener("click", openBulkStatus);
$("bulkClose").addEventListener("click", closeBulkStatus);
$("bulkCancel").addEventListener("click", closeBulkStatus);
$("bulkApply").addEventListener("click", applyBulkStatus);
$("bulkColSel").addEventListener("change", renderBulkStatus);
$("bulkStatusSel").addEventListener("change", renderBulkStatus);
$("bulkOverlay").addEventListener("click", e => {
  if (e.target === $("bulkOverlay")) closeBulkStatus();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("bulkOverlay").classList.contains("hidden")) {
    e.stopPropagation();
    closeBulkStatus();
  }
}, true);

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

// categoria livre da vista mapeada à medida (ver cellCatHtml): com lista
// predefinida (useList=true), o mesmo padrão do editor de estados (badge ->
// <select>); sem lista, texto livre tal como a OBS/Function/TC (input ->
// editActions). Identificada por posição na folha (xlrow+col0), não por
// Function/TC+To Do — ver queue_cellcat_override/push_overrides,
// cswaios/tasks.py, para o porquê.
async function _saveCellCat(meta, col0, base, list, value) {
  editorOpen = false;
  try {
    const res = await fetch("/api/cellcat/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: lastData.file,
        sheet: lastData.sheet,
        xlrow: meta.xlrow,
        col0: Number(col0),
        value,
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
}

function openCellCatEditor(span) {
  const xlrow = span.dataset.catxlrow;
  const col0 = span.dataset.catcol;
  const meta = metaByRow(xlrow);
  if (!meta) return;
  const base = span.dataset.catbase;
  const list = JSON.parse(span.dataset.catlist || "null");

  if (!list) {
    // sem lista predefinida: texto livre em várias linhas, igual ao editor da
    // OBS/"To Do" (era um <input> de uma linha, e numa coluna de texto corrido
    // — a OBS e o "o que fazer" da vista resumida — não havia forma de escrever
    // um parágrafo: o Enter não fazia nada)
    const atual = span.innerText.replace(" ✎", "").trim();
    span.dataset.editing = "1";
    editorOpen = true;
    span.innerHTML = `<textarea class="noteText" rows="3">${esc(atual)}</textarea>` + editActions();
    const inp = span.querySelector("textarea");
    autoGrowEditor(inp, () => _saveCellCat(meta, col0, base, list, inp.value));
    inp.focus();
    inp.select();

    span.querySelector(".actSave").addEventListener("click", e => {
      e.stopPropagation();
      _saveCellCat(meta, col0, base, list, inp.value);
    });
    span.querySelector(".actCancel").addEventListener("click", e => {
      e.stopPropagation();
      editorOpen = false;
      refreshTaskViews();
    });
    span.querySelector(".actClear").addEventListener("click", e => {
      e.stopPropagation();
      if (span.classList.contains("local")) _saveCellCat(meta, col0, base, list, null);
      else { editorOpen = false; refreshTaskViews(); }
    });
    return;
  }

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
    sel.disabled = true;
    _saveCellCat(meta, col0, base, list, sel.value === "__clear__" ? null : sel.value);
  });
  sel.addEventListener("blur", () => { if (!done) { done = true; editorOpen = false; refreshTaskViews(); } });
}
