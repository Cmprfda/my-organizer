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
let activeTabId = localStorage.getItem(ACTIVE_WORKBOOK_KEY) || "";
if (!workbookTabs.some(x => x.id === activeTabId))
  activeTabId = workbookTabs.length ? workbookTabs[0].id : "";

// só a identidade dos livros é guardada; os dados lidos ficam em memória
function saveWorkbookTabs() {
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
let searchTerms = [];              // termos de pesquisa fixados (Enter na caixa)
// como combinar os termos: "or" = qualquer um deles, "and" = todos
// por omissão "and" — cada termo novo estreita a pesquisa em vez de a alargar
let searchMode = localStorage.getItem("bsp-tracker-search-mode") === "or" ? "or" : "and";
// leitura do separador de livro ATIVO (atalho de conveniência: o dono dos dados
// é sempre o `lastData` da entrada em workbookTabs, este é só um espelho que
// muda sempre que se troca de separador ou se relê)
let lastData = null;

const SIDES = ["On my side", "On the other side", "Done"];
const SIDE_CLASS = { "On my side": "side-my", "On the other side": "", "Done": "side-done" };

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
// vista inicial: o primeiro livro aberto ou, sem nenhum, o painel de boas-vindas
let currentView = activeTabId ? `wb:${activeTabId}` : "workbooks";

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
let currentColOrderKind = "";   // vista à vista agora ("full"/"canonical"/"custom"), ver render()/resolveColOrder em tasks.js
let editorOpen = false;    // suspende os refrescamentos enquanto se edita

const $ = id => document.getElementById(id);

// diagnóstico: envia erros e passos-chave do browser para o log do servidor
