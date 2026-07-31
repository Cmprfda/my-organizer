// My Organizer — navegação entre vistas e painel de definições

const VIEWS = { excel: "excelView", ccrs: "ccrView", todo: "todoView", notes: "notesView", feedback: "fbView", jira: "jiraView" };
// vista que está no painel lateral do ecrã dividido (null = sem divisão)
let sideView = null;

function showView(name) {
  currentView = name;
  document.querySelectorAll(".tabs button[data-view]").forEach(x =>
    x.classList.toggle("active", x.dataset.view === name));
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
