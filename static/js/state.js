// My Organizer — estado global da aplicação

let PERSON = localStorage.getItem("bsp-tracker-person") || "Carlos Andrade";

/* ---------- livros abertos (um separador por livro) ----------
   A app não escolhe nenhum livro por si: arranca sem nenhum aberto e é o
   utilizador que os abre pelo botão "+". Cada separador tem a sua identidade
   (ficheiro local ou item do OneDrive), a sua aba e os seus próprios dados —
   dois separadores nunca partilham nada.

   Cada entrada: { id, kind: "local"|"onedrive", path, driveId, itemId, name,
                   sheet, lastData }
   O `lastData` é só a leitura em memória — nunca vai para o localStorage. */
const WORKBOOKS_KEY = "bsp-tracker-workbooks";
const ACTIVE_WORKBOOK_KEY = "bsp-tracker-workbook-active";

/* ---------- janela dedicada a um livro ----------
   "Abrir em janela nova" (⧉ no separador) abre esta mesma app com `?wb=<id>`:
   uma segunda janela que arranca já naquele livro, para se ver dois livros ao
   mesmo tempo lado a lado. É a app inteira, não uma vista reduzida — a janela
   tem os seus próprios dados, filtros e leituras, porque cada janela é um
   contexto de JavaScript à parte (o servidor já guarda a cache de cada livro
   pela sua chave, ver _RAW_CACHE em cswaios/tasks.py).

   O que esta janela NÃO faz é gravar a lista de livros abertos: a lista é a
   mesma no localStorage das duas, e gravá-la aqui (onde só está este livro)
   apagaria os separadores da janela principal. Abrir outro livro por aqui
   funciona; é só nesta janela, até ela fechar. */
const SOLO_WB = new URLSearchParams(location.search).get("wb") || "";

/* Janela dedicada a UMA nota: `?note=<id>`, aberta pelo ↗ da nota (ver
   openNoteWindow em notes.js). A app é a mesma, mas só com aquela nota à
   frente: a coluna das notas e o apagar ficam de fora (classe notes-solo), o
   título da janela é o da nota e a escolha de nota não se grava — o
   localStorage é o mesmo da janela principal e mudá-lo tirava-a de onde está,
   exatamente como acontece com a lista de livros do SOLO_WB. */
const SOLO_NOTE = new URLSearchParams(location.search).get("note") || "";

// identidade estável: o mesmo livro dá sempre o mesmo id, entre arranques e
// entre separadores (é o que permite não abrir o mesmo livro duas vezes)
function workbookId(kind, key) {
  let h = 0;
  const s = `${kind}:${String(key).toLowerCase()}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `${kind === "onedrive" ? "od" : "lo"}${h.toString(36)}`;
}

// "caminho" que o servidor entende: o caminho absoluto do ficheiro local ou o
// caminho virtual do livro na nuvem (ver graph_path_for no cswaios/graph.py)
function tabFile(tab) {
  if (!tab) return "";
  return tab.kind === "onedrive" ? `onedrive:${tab.driveId}:${tab.itemId}` : (tab.path || "");
}

// a fonte é sempre explícita por separador — nunca "auto"
const tabSource = tab => (tab && tab.kind === "onedrive") ? "onedrive" : "local";

function normalizeWorkbookTab(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kind = raw.kind === "onedrive" ? "onedrive" : "local";
  const driveId = String(raw.driveId || "");
  const itemId = String(raw.itemId || "");
  const path = String(raw.path || "");
  if (kind === "onedrive" ? !(driveId && itemId) : !path) return null;
  return {
    id: String(raw.id || "") || workbookId(kind, kind === "onedrive" ? `${driveId}:${itemId}` : path),
    kind, path, driveId, itemId,
    name: String(raw.name || "") || (path ? path.split(/[\\/]/).pop() : ""),
    sheet: String(raw.sheet || ""),
    lastData: null,
  };
}

function loadWorkbookTabs() {
  try {
    const raw = JSON.parse(localStorage.getItem(WORKBOOKS_KEY) || "null");
    if (!Array.isArray(raw)) return [];
    const out = [];
    raw.map(normalizeWorkbookTab).forEach(tab => {
      if (tab && !out.some(x => x.id === tab.id)) out.push(tab);
    });
    return out;
  } catch (e) {
    return [];
  }
}

let workbookTabs = loadWorkbookTabs();
// numa janela dedicada só entra o livro pedido (os outros continuam abertos na
// janela principal). Um id desconhecido — outro browser, outro dispositivo —
// deixa a janela no painel de boas-vindas, de onde se abre o livro à mão.
if (SOLO_WB) workbookTabs = workbookTabs.filter(x => x.id === SOLO_WB);
let activeTabId = SOLO_WB || localStorage.getItem(ACTIVE_WORKBOOK_KEY) || "";
if (!workbookTabs.some(x => x.id === activeTabId))
  activeTabId = workbookTabs.length ? workbookTabs[0].id : "";

// só a identidade dos livros é guardada; os dados lidos ficam em memória
function saveWorkbookTabs() {
  // numa janela dedicada a lista em memória é só este livro: gravá-la fechava
  // os separadores da janela principal (o localStorage é o mesmo)
  if (SOLO_WB) return;
  localStorage.setItem(WORKBOOKS_KEY, JSON.stringify(workbookTabs.map(x => ({
    id: x.id, kind: x.kind, path: x.path, driveId: x.driveId, itemId: x.itemId,
    name: x.name, sheet: x.sheet,
  }))));
  localStorage.setItem(ACTIVE_WORKBOOK_KEY, activeTabId || "");
}

const tabById = id => workbookTabs.find(x => x.id === id) || null;
const activeTab = () => tabById(activeTabId);
// nome do livro do separador ativo (etiqueta das ligações do TODO)
const activeBookName = () => (activeTab() || {}).name || "";

let showAll = false;
let compactView = true;            // vista resumida por omissão
// disposição da vista de tarefas: "list" (tabela) ou "cards" (caixas)
let taskLayout = localStorage.getItem("bsp-tracker-task-layout") === "cards" ? "cards" : "list";
const statusFilters = new Set();   // estados selecionados (vista completa)
const sideFilters = new Set();     // On my side / On the other side / Done (vista resumida)
const roleFilters = new Set();     // papéis selecionados (Autor / Reviewer / Mencionado)
const customFilterActive = new Set();  // ids dos filtros personalizados ligados (ver customfilters.js)
// só as tarefas paradas (sem mexer há mais de N dias, ver history.js)
let staleOnly = false;
// só as tarefas à espera de alguém cujo prazo já passou (ver waiting.js)
let chaseOnly = false;
let searchTerms = [];              // termos de pesquisa fixados (Enter na caixa)
// como combinar os termos: "or" = qualquer um deles, "and" = todos
// por omissão "and" — cada termo novo estreita a pesquisa em vez de a alargar
let searchMode = localStorage.getItem("bsp-tracker-search-mode") === "or" ? "or" : "and";
// leitura do separador de livro ATIVO (atalho de conveniência: o dono dos dados
// é sempre o `lastData` da entrada em workbookTabs, este é só um espelho que
// muda sempre que se troca de separador ou se relê)
let lastData = null;

// etiquetas rápidas para as notas de execução
const EXEC_TAGS = ["A correr (target)", "A correr (Jenkins)", "A guardar logs", "Executado", "Falhou"];

// checklist de execução por tarefa: [chave, chave i18n do rótulo, rótulo curto]
const CHECKS = [
  ["run_dev", "chk_dev", "dev"],
  ["run_comp", "chk_comp", "comp"],
  ["upd_comp", "chk_upd_comp", "↑comp"],
  ["upd_review", "chk_upd_review", "↑review"],
];

// passos das CCRs: antes de fechar (5) e depois de fechar (2)
const CCR_PRE = [
  ["versoes", "ccr_v"],
  ["chk_exec", "ccr_ce"],
  ["chk_review", "ccr_cr"],
  ["header", "ccr_h"],
  ["review", "ccr_r"],
];
const CCR_POST = [
  ["evidencia", "ccr_ev"],
  ["chk_exec_guardada", "ccr_ceg"],
];
let ccrs = {};
/* ---------- página inicial ----------
   Vista onde a app abre (Definições -> Aparência). Guardada neste browser, como
   o tema: "metrics" por omissão (pedido no feedback), "workbook" é o
   comportamento antigo — o livro que ficou ativo. Uma janela dedicada a um
   livro (?wb=) ignora esta escolha: essa janela é para esse livro. */
const HOME_VIEW_KEY = "bsp-tracker-home-view";
const HOME_VIEWS = ["metrics", "workbook", "ccrs", "todo", "notes"];

function homeView() {
  const v = localStorage.getItem(HOME_VIEW_KEY) || "metrics";
  return HOME_VIEWS.includes(v) ? v : "metrics";
}

// vista inicial: a página inicial escolhida; a do livro é o separador ativo (ou
// o painel de boas-vindas, sem nenhum livro aberto)
const bookStartView = () => activeTabId ? `wb:${activeTabId}` : "workbooks";
let currentView = SOLO_NOTE ? "notes"
  : (SOLO_WB || homeView() === "workbook") ? bookStartView() : homeView();

function tagClass(tag) {
  const t = norm(tag);
  if (/executado|conclu|\bok\b|done/.test(t)) return "done";
  if (/correr|running|exec/.test(t)) return "doing";
  if (/falhou|fail|erro/.test(t)) return "blocked";
  return "other";
}

let currentMeta = [];      // metadados (chaves/originais) das linhas apresentadas
let currentObs = [];       // OBS em vigor (com override local) de cada linha
let currentStatuses = [];  // estados possíveis, para o editor
let currentColOrderKind = "";   // vista à vista agora ("full"/"custom"), ver render()/resolveColOrder em tasks.js
let currentColWidths = {};      // larguras à medida da vista atual, por nome de coluna, ver render()/colResizeHandle em tasks.js
let currentColNamesAll = [];    // nomes das colunas da vista atual pela ordem de exibição, ANTES de esconder as dos filtros ligados (ver render()/customFilterHiddenCols em tasks.js)
let currentBoxCells = null;     // linha COMPLETA de cada tarefa à vista ([{label, html}, ...]) quando um filtro esconde colunas — a caixa de detalhe mostra o item inteiro (ver render() em tasks.js e itemBoxFields em itembox.js)
let editorOpen = false;    // suspende os refrescamentos enquanto se edita

const $ = id => document.getElementById(id);

// diagnóstico: envia erros e passos-chave do browser para o log do servidor
