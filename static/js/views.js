// My Organizer — navegação entre vistas e painel de definições

const VIEWS = { excel: "excelView", ccrs: "ccrView", todo: "todoView", notes: "notesView", feedback: "fbView", jira: "jiraView" };
// vista que está no painel lateral do ecrã dividido (null = sem divisão)
let sideView = null;

function showView(name) {
  currentView = name;
  document.querySelectorAll(".tabs button[data-view]").forEach(x => {
    x.classList.toggle("active", x.dataset.view === name);
    // a vista do painel lateral também está no ecrã: marca-se como aberta
    x.classList.toggle("side", x.dataset.view === sideView && x.dataset.view !== name);
  });
  for (const [view, elId] of Object.entries(VIEWS)) {
    // a vista do painel lateral fica sempre visível, seja qual for o separador ativo
    if (view === sideView) $(elId).classList.remove("hidden");
    else $(elId).classList.toggle("hidden", name !== view);
  }
  $("excelSub").classList.toggle("hidden", !(name === "excel" || sideView === "excel"));
  if (name === "ccrs" || sideView === "ccrs") renderCCRs();
  if (name === "todo" || sideView === "todo") renderTodo();
  if (name === "notes" || sideView === "notes") renderNotes();
  if (name === "jira" || sideView === "jira") renderJiraPage();
}

// O separador das Tarefas (Excel) só faz sentido quando há livro para abrir:
// nada escolhido no OneDrive e nenhum ficheiro local encontrado = esconder.
// Só se decide depois da primeira resposta do /api/tasks (ver hasWorkbookConfigured).
function updateExcelTabVisibility() {
  const has = hasWorkbookConfigured();
  const tab = document.querySelector('.tabs button[data-view="excel"]');
  if (tab) tab.classList.toggle("hidden", !has);
  if (has) return;
  if (sideView === "excel") exitSplit();
  if (currentView === "excel") showView("todo");
}

document.querySelectorAll(".tabs button[data-view]").forEach(b => b.addEventListener("click", () => {
  // clicar no separador da vista que está ao lado devolve-a ao ecrã inteiro
  if (sideView === b.dataset.view) exitSplit();
  showView(b.dataset.view);
}));

// ---------- ordem dos separadores (arrastar um para cima de outro) ----------
// A ordem é a ordem real dos <button> dentro do .tabs (mexer no DOM, não em
// CSS), por isso convive com o "hidden" que esconde o separador do Jira ou das
// Tarefas (Excel): um separador escondido continua a mudar de lugar e volta a
// aparecer no lugar novo. Fica guardada neste browser, como o tamanho do ecrã
// dividido. O botão das Definições (sem data-view) nunca se mexe.
const TAB_ORDER_KEY = "bsp-tracker-tab-order";

const tabOrderButtons = () => [...document.querySelectorAll(".tabs button[data-view]")];

function saveTabOrder() {
  localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(tabOrderButtons().map(b => b.dataset.view)));
}

// separadores que a ordem guardada não conheça (ex.: acrescentados numa versão
// nova da app) ficam no fim, pela ordem em que vêm no index.html
function applyStoredTabOrder() {
  const nav = document.querySelector(".tabs");
  if (!nav) return;
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) || "null");
  } catch (e) {
    stored = null;
  }
  if (!Array.isArray(stored) || !stored.length) return;
  const left = new Map(tabOrderButtons().map(b => [b.dataset.view, b]));
  const ordered = [];
  stored.forEach(view => {
    const b = left.get(view);
    if (b) { ordered.push(b); left.delete(view); }
  });
  left.forEach(b => ordered.push(b));
  // inserir antes do botão das Definições mantém-no sempre no fim
  const anchor = $("settingsBtn");
  ordered.forEach(b => nav.insertBefore(b, anchor));
}
applyStoredTabOrder();

// só os separadores respondem ao arrasto; as faixas de largada do ecrã dividido
// (#dropZones) são outros elementos, com os seus próprios tratadores em split.js
const tabsNav = document.querySelector(".tabs");
if (tabsNav) {
  const tabDropTarget = e => (e.target && e.target.closest)
    ? e.target.closest(".tabs button[data-view]") : null;

  tabsNav.addEventListener("dragover", e => {
    // "application/json" = arrasto interno da app (só esses podem reordenar);
    // ficheiros/links vindos de fora continuam a não ser largáveis aqui
    if (!tabDropTarget(e) || ![...e.dataTransfer.types].includes("application/json")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });

  tabsNav.addEventListener("drop", e => {
    const target = tabDropTarget(e);
    if (!target) return;
    e.preventDefault();
    // o mesmo payload que o dragstart do split.js já põe no arrasto
    const p = dragPayload(e);
    if (!p || p.kind !== "tab" || !p.view) return;
    const dragged = tabOrderButtons().find(b => b.dataset.view === p.view);
    if (!dragged || dragged === target) return;
    // metade esquerda do separador de destino = antes dele, direita = depois
    const r = target.getBoundingClientRect();
    const after = r.width ? (e.clientX - r.left) > r.width / 2 : false;
    target.parentNode.insertBefore(dragged, after ? target.nextSibling : target);
    saveTabOrder();
  });
}

// ---------- definições (tema + língua) ----------
function setSettingsOpen(open) {
  $("settingsPanel").classList.toggle("hidden", !open);
  $("settingsBtn").classList.toggle("active", open);
  $("settingsBtn").setAttribute("aria-expanded", open ? "true" : "false");
}

$("settingsBtn").addEventListener("click", e => {
  e.stopPropagation();
  setSettingsOpen($("settingsPanel").classList.contains("hidden"));
});

document.addEventListener("click", e => {
  if (!$("settingsPanel").contains(e.target)) setSettingsOpen(false);
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") setSettingsOpen(false);
});
