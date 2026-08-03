// My Organizer — estado global da aplicação

let PERSON = localStorage.getItem("bsp-tracker-person") || "Carlos Andrade";
let FILE = localStorage.getItem("bsp-tracker-file") || "";   // "" = mais recente
let SHEET = localStorage.getItem("bsp-tracker-sheet") || "PRJ_CFG1_reworks_julho";
// fonte dos dados: auto | onedrive (API do Excel, sem download) | local
let SOURCE = localStorage.getItem("bsp-tracker-source") || "auto";
if (!["auto", "onedrive", "local"].includes(SOURCE)) SOURCE = "auto";
// funcionalidades em teste, desligadas por omissão até o utilizador as ativar em Definições → Beta
let BETA_ENABLED = localStorage.getItem("bsp-tracker-beta") === "1";
let showAll = false;
let compactView = true;            // vista resumida por omissão
// disposição da vista de tarefas: "list" (tabela) ou "cards" (caixas)
let taskLayout = localStorage.getItem("bsp-tracker-task-layout") === "cards" ? "cards" : "list";
const statusFilters = new Set();   // estados selecionados (vista completa)
const sideFilters = new Set();     // On my side / On the other side / Done (vista resumida)
const roleFilters = new Set();     // papéis selecionados (Autor / Reviewer / Mencionado)
let searchTerms = [];              // termos de pesquisa fixados (Enter na caixa)
// como combinar os termos: "or" = qualquer um deles, "and" = todos
// por omissão "and" — cada termo novo estreita a pesquisa em vez de a alargar
let searchMode = localStorage.getItem("bsp-tracker-search-mode") === "or" ? "or" : "and";
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
let currentView = "excel";

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
let editorOpen = false;    // suspende os refrescamentos enquanto se edita

const $ = id => document.getElementById(id);

// diagnóstico: envia erros e passos-chave do browser para o log do servidor
