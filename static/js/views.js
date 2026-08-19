// My Organizer — navegação entre vistas e painel de definições

// vistas fixas. "workbooks" é o painel que aparece quando não há nenhum livro
// aberto — não tem separador próprio, é o que se mostra no lugar deles.
const VIEWS = {
  workbooks: "wbEmptyView", ccrs: "ccrView", todo: "todoView",
  notes: "notesView", metrics: "metricsView",
  feedback: "fbView", jira: "jiraView",
  // as definições são uma página como as outras; o separador delas é a roda
  // dentada (#settingsBtn), que não tem data-view e por isso não se arrasta
  // nem se abre ao lado no ecrã dividido
  settings: "settingsView",
};
// vista que está no painel lateral do ecrã dividido (null = sem divisão)
let sideView = null;

/* ---------- separadores dos livros abertos ----------
   Cada livro aberto tem o seu separador ("wb:<id>") e os seus próprios dados.
   O painel #excelView é um só e mostra sempre o livro do separador ativo: é o
   activeTabId que manda, e trocar de separador troca o lastData pelo do livro
   novo (ver setActiveTab). "excel" continua a ser aceite como nome de vista —
   é o que as origens dos itens do TODO/notas guardam — e quer dizer "o livro
   que estiver ativo". */
const isWorkbookView = name => name === "excel" || String(name || "").startsWith("wb:");
const workbookViewId = name => String(name || "").startsWith("wb:") ? String(name).slice(3) : "";
// vista do livro ativo (ou o painel de boas-vindas, sem livros abertos)
const workbookView = () => activeTabId ? `wb:${activeTabId}` : "workbooks";

/* ---------- separadores das pastas de código ----------
   Exatamente o mesmo desenho dos livros: cada pasta aberta tem o seu separador
   ("code:<id>"), o painel #codeView é um só e mostra a pasta do separador ativo
   (o codeRepoId, ver setActiveCodeTab em code.js). "code" continua a ser aceite
   como nome de vista e quer dizer "a pasta que estiver ativa". */
const isCodeView = name => name === "code" || String(name || "").startsWith("code:");
const codeViewId = name => String(name || "").startsWith("code:") ? String(name).slice(5) : "";
const codeView = () => codeRepoId ? `code:${codeRepoId}` : "";

// "excel"/"code" (origens guardadas) -> o separador do livro/pasta ativo
function normalizeView(name) {
  if (isCodeView(name)) {
    const cid = codeViewId(name);
    if (cid && codeRepos.some(r => r.id === cid)) return name;
    // sem nenhuma pasta aberta não há painel de código para mostrar
    return codeView() || fallbackView();
  }
  if (!isWorkbookView(name)) return name;
  const id = workbookViewId(name);
  if (id && tabById(id)) return name;
  return workbookView();
}

// elemento da vista: os livros partilham todos o mesmo painel, as pastas de
// código também
function viewEl(name) {
  if (isWorkbookView(name)) return $("excelView");
  if (isCodeView(name)) return $("codeView");
  return VIEWS[name] ? $(VIEWS[name]) : null;
}

// troca o livro em foco: o lastData passa a ser o desse separador (o do
// anterior fica guardado na sua própria entrada, intacto)
function setActiveTab(id) {
  if (activeTabId === id) return;
  // um editor de nota/estado aberto pertence ao livro anterior: a caixa de
  // texto grava com sheet/file do livro novo (lidos ao vivo) mas fn/todo do
  // antigo (fechados no clique) — teria de escrever no livro errado. Fechar
  // antes de trocar descarta a edição a meio, tal como o editor de estado já
  // faz sozinho ao perder o foco.
  editorOpen = false;
  activeTabId = id || "";
  saveWorkbookTabs();
  const tab = activeTab();
  lastData = tab ? (tab.lastData || null) : null;
  // filtros e seletores são do livro anterior: os estados/abas não são os mesmos
  lastSelectorsSig = "";
  clearFilters();
  searchTerms = [];
  const searchInput = $("search");
  if (searchInput) searchInput.value = "";
  markActiveWorkbookTab();
}

function markActiveWorkbookTab() {
  document.querySelectorAll('.tabs button[data-view^="wb:"]').forEach(b => {
    b.classList.toggle("wbActive", workbookViewId(b.dataset.view) === activeTabId);
  });
}

function showView(name) {
  name = normalizeView(name);
  // o painel do livro é um só: não pode estar ao lado e no principal ao mesmo
  // tempo com livros diferentes (o do código é igual)
  if (isWorkbookView(name) && isWorkbookView(sideView)) exitSplit();
  if (isCodeView(name) && isCodeView(sideView)) exitSplit();
  if (isWorkbookView(name)) setActiveTab(workbookViewId(name));
  if (isCodeView(name)) setActiveCodeTab(codeViewId(name));
  currentView = name;
  document.querySelectorAll(".tabs button[data-view]").forEach(x => {
    x.classList.toggle("active", x.dataset.view === name);
    // a vista do painel lateral também está no ecrã: marca-se como aberta
    x.classList.toggle("side", x.dataset.view === sideView && x.dataset.view !== name);
  });
  // com muitos livros abertos (ou num telefone) o separador da vista pode estar
  // fora da parte visível da barra, que rola (ver .tabsScroll no layout.css):
  // só se mexe o que rola na horizontal, nunca a página
  const ativo = document.querySelector('.tabs .tabsGroup button[data-view].active');
  if (ativo) ativo.scrollIntoView({ inline: "nearest", block: "nearest" });
  const wbOnScreen = isWorkbookView(name) || isWorkbookView(sideView);
  for (const [view, elId] of Object.entries(VIEWS)) {
    // a vista do painel lateral fica sempre visível, seja qual for o separador ativo
    if (view === sideView) $(elId).classList.remove("hidden");
    else $(elId).classList.toggle("hidden", name !== view);
  }
  $("excelView").classList.toggle("hidden", !wbOnScreen);
  $("excelSub").classList.toggle("hidden", !wbOnScreen);
  const codeOnScreen = isCodeView(name) || isCodeView(sideView);
  $("codeView").classList.toggle("hidden", !codeOnScreen);
  // o ecrã inteiro do código sobrepõe-se ao .hidden (ver body.code-full no
  // code.css): sair da vista por outro caminho que não o botão — a pesquisa
  // global, por exemplo — deixaria o ficheiro colado por cima de tudo
  if (!codeOnScreen && typeof setCodeFull === "function" &&
    document.body.classList.contains("code-full")) setCodeFull(false);
  $("settingsBtn").classList.toggle("active", name === "settings");
  if (name === "settings") $("settingsBtn").setAttribute("aria-current", "page");
  else $("settingsBtn").removeAttribute("aria-current");
  if (wbOnScreen) render();
  if (name === "settings" && typeof renderSettingsPage === "function") renderSettingsPage();
  if (name === "ccrs" || sideView === "ccrs") renderCCRs();
  if (name === "todo" || sideView === "todo") renderTodo();
  if (name === "notes" || sideView === "notes") renderNotes();
  if (name === "jira" || sideView === "jira") renderJiraPage();
  // a pasta de código só se lê quando o separador dela abre (não se anda no
  // disco de quem nunca cá vem) — ver renderCodePage em code.js
  if (codeOnScreen) renderCodePage();
  if (name === "metrics" || sideView === "metrics") {
    // a atividade de todos os livros só se vai buscar quando esta vista abre
    // (não vale a pena pedi-la a quem nunca cá vem)
    loadMetricsActivity();
    renderMetrics();
  }
}

// vista para onde ir quando a atual deixa de existir (fechar o último livro)
const fallbackView = () => workbookTabs.length ? workbookView() : "workbooks";

// (Re)constrói os separadores dos livros abertos: um botão por entrada de
// workbookTabs, à esquerda dos separadores fixos (o lugar onde as "Tarefas
// (Excel)" sempre estiveram). A ordem guardada, se houver, manda depois disto.
function renderWorkbookTabs() {
  const nav = document.querySelector(".tabs");
  if (!nav) return;
  const existentes = new Map([...nav.querySelectorAll('button[data-view^="wb:"]')]
    .map(b => [workbookViewId(b.dataset.view), b]));
  workbookTabs.forEach(tab => {
    let b = existentes.get(tab.id);
    if (b) existentes.delete(tab.id);
    else {
      b = document.createElement("button");
      b.dataset.view = `wb:${tab.id}`;
      b.dataset.icon = "▤";
      b.draggable = true;
      b.type = "button";
      // grupo dos documentos (livros e pastas), o segundo da barra: os livros
      // ficam antes das pastas de código (ver os grupos no index.html)
      const docs = $("tabsDocs");
      const primeiroCode = docs.querySelector('button[data-view^="code:"]');
      docs.insertBefore(b, primeiroCode || null);
      wireTabButton(b);
      wireTabDrag(b);
    }
    b.dataset.label = tab.name || tabFile(tab);
    b.title = tab.kind === "onedrive" ? `${tab.name} — OneDrive` : (tab.path || tab.name);
    b.innerHTML = `<span class="wbTabName">${esc(tab.name || tabFile(tab))}</span>` +
      // numa janela já dedicada a um livro o ⧉ não tem para onde abrir: era
      // esta mesma janela outra vez (ver SOLO_WB em state.js)
      (SOLO_WB ? "" :
        `<span class="wbTabPop" data-wbpop="${esc(tab.id)}" title="${esc(t("wb_window"))}" ` +
        `role="button" aria-label="${esc(t("wb_window"))}">⧉</span>`) +
      `<span class="wbTabClose" data-wbclose="${esc(tab.id)}" title="${esc(t("wb_close"))}" ` +
      `role="button" aria-label="${esc(t("wb_close"))}">✕</span>`;
  });
  // separadores de livros que já não estão abertos
  existentes.forEach(b => b.remove());
  applyStoredTabOrder();
  markActiveWorkbookTab();
  renderWorkbookEmptyState();
}

// painel de boas-vindas (sem livros abertos)
function renderWorkbookEmptyState() {
  const box = $("wbEmptyView");
  if (!box) return;
  $("wbEmptyTitle").textContent = t("wb_empty_t");
  $("wbEmptyText").textContent = t("wb_empty_p");
  $("wbEmptyAdd").textContent = t("wb_add_btn");
  // sem livros abertos não há nada que a vista do livro possa mostrar
  if (!workbookTabs.length && isWorkbookView(currentView)) showView("workbooks");
}

// fechar um separador: é só deixar de o mostrar. Nada é apagado no servidor —
// as alterações locais (✎), notas e itens do TODO desse livro continuam lá e
// voltam a aparecer se o livro for aberto outra vez.
function closeWorkbookTab(id) {
  const i = workbookTabs.findIndex(x => x.id === id);
  if (i < 0) return;
  const vista = `wb:${id}`;
  const eraAtivo = activeTabId === id;
  const estavaNoEcra = currentView === vista;
  // sair do ecrã dividido antes de o separador desaparecer (o painel ainda
  // tem de ser encontrado para voltar ao sítio)
  if (sideView === vista) exitSplit();
  workbookTabs.splice(i, 1);
  const seguinte = workbookTabs[Math.min(i, workbookTabs.length - 1)] || null;
  if (eraAtivo) {
    activeTabId = "";
    lastData = null;
    lastSelectorsSig = "";
    clearFilters();
    searchTerms = [];
    if (seguinte) setActiveTab(seguinte.id);
  }
  saveWorkbookTabs();
  renderWorkbookTabs();
  // só se muda de vista se era este livro que estava no ecrã: fechar um
  // separador que está atrás não tira ninguém de onde está
  if (estavaNoEcra) showView(seguinte ? `wb:${seguinte.id}` : "workbooks");
  else render();
}

function wireTabButton(b) {
  // botão do meio num separador de livro (ou de pasta de código): janela nova,
  // como nos browsers
  b.addEventListener("auxclick", e => {
    if (e.button !== 1) return;
    if (isWorkbookView(b.dataset.view)) {
      e.preventDefault();
      openWorkbookWindow(workbookViewId(b.dataset.view));
    } else if (isCodeView(b.dataset.view)) {
      e.preventDefault();
      openCodeWindow(codeViewId(b.dataset.view));
    }
  });
  b.addEventListener("click", e => {
    const p = e.target.closest("[data-wbpop]");
    if (p) { e.preventDefault(); e.stopPropagation(); openWorkbookWindow(p.dataset.wbpop); return; }
    const x = e.target.closest("[data-wbclose]");
    if (x) { e.preventDefault(); e.stopPropagation(); closeWorkbookTab(x.dataset.wbclose); return; }
    const cp = e.target.closest("[data-codepop]");
    if (cp) { e.preventDefault(); e.stopPropagation(); openCodeWindow(cp.dataset.codepop); return; }
    const cx = e.target.closest("[data-codeclose]");
    if (cx) { e.preventDefault(); e.stopPropagation(); closeCodeTab(cx.dataset.codeclose); return; }
    // clicar no separador da vista que está ao lado devolve-a ao ecrã inteiro
    if (sideView === b.dataset.view) exitSplit();
    showView(b.dataset.view);
  });
}

document.querySelectorAll(".tabs button[data-view]").forEach(wireTabButton);

// ---------- ordem dos separadores (arrastar um para cima de outro) ----------
// A ordem é a ordem real dos <button> dentro do .tabs (mexer no DOM, não em
// CSS), por isso convive com o "hidden" que esconde o separador do Jira ou das
// Tarefas (Excel): um separador escondido continua a mudar de lugar e volta a
// aparecer no lugar novo. Fica guardada neste browser, como o tamanho do ecrã
// dividido. O botão das Definições (sem data-view) nunca se mexe.
const TAB_ORDER_KEY = "bsp-tracker-tab-order";

// só os separadores dos grupos do meio se reordenam: o Início está encostado à
// esquerda e o "+"/Definições à direita, que é o que lhes dá o lugar fixo
const tabOrderButtons = () => [...document.querySelectorAll(".tabs .tabsGroup button[data-view]")];

function saveTabOrder() {
  localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(tabOrderButtons().map(b => b.dataset.view)));
}

// separadores que a ordem guardada não conheça (ex.: acrescentados numa versão
// nova da app) ficam no fim, pela ordem em que vêm no index.html
function applyStoredTabOrder() {
  const nav = document.querySelector(".tabs");
  if (!nav) return;
  // o traço entre os documentos e as vistas só faz sentido com documentos
  const sep = $("tabsDocsSep");
  if (sep) sep.classList.toggle("hidden", !$("tabsDocs").children.length);
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) || "null");
  } catch (e) {
    stored = null;
  }
  if (!Array.isArray(stored) || !stored.length) return;
  // cada grupo é arrumado à parte: um separador nunca muda de grupo, por isso a
  // ordem guardada (uma lista só, na ordem em que estão na barra) vale como
  // ordem relativa dentro de cada um
  const porGrupo = new Map();
  tabOrderButtons().forEach(b => {
    const grupo = b.parentElement;
    if (!porGrupo.has(grupo)) porGrupo.set(grupo, []);
    porGrupo.get(grupo).push(b);
  });
  porGrupo.forEach((botoes, grupo) => {
    const ordered = [];
    stored.forEach(view => {
      const i = botoes.findIndex(b => b.dataset.view === view);
      if (i >= 0) ordered.push(botoes.splice(i, 1)[0]);
    });
    // separadores que a ordem guardada não conheça (ex.: acrescentados numa
    // versão nova da app) ficam no fim do grupo deles
    botoes.forEach(b => ordered.push(b));
    ordered.forEach(b => grupo.appendChild(b));
  });
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
    // O conteúdo do arrasto não se pode ler aqui (no dragover só os "types"
    // estão acessíveis), por isso o efeito decide-se pelo effectAllowed posto
    // no dragstart: só os arrastos que permitem "move" — os dos separadores,
    // "copyMove" em split.js — levam o efeito da reordenação. As linhas das
    // Tarefas/CCRs vêm com "copy" e ficam com o efeito que o browser deriva;
    // forçar-lhes "move" fazia o browser recusar a largada e arrastar uma
    // tarefa para cima do separador Por fazer não a acrescentava.
    if (/move|all|uninitialized/i.test(e.dataTransfer.effectAllowed))
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
    // um livro não vai para o meio das vistas nem o Início sai da esquerda: a
    // reordenação é só dentro do grupo (ver os grupos no index.html)
    if (dragged.parentElement !== target.parentElement) return;
    // metade esquerda do separador de destino = antes dele, direita = depois
    const r = target.getBoundingClientRect();
    const after = r.width ? (e.clientX - r.left) > r.width / 2 : false;
    target.parentNode.insertBefore(dragged, after ? target.nextSibling : target);
    saveTabOrder();
  });
}

// ---------- definições (página própria) ----------
// vista de onde se veio, para o segundo clique na roda dentada (ou o Escape)
// devolver a app ao sítio onde se estava
let viewBeforeSettings = "";

function setSettingsOpen(open) {
  if (open) {
    if (currentView !== "settings") viewBeforeSettings = currentView;
    showView("settings");
  } else if (currentView === "settings") {
    showView(viewBeforeSettings || fallbackView());
  }
}

$("settingsBtn").addEventListener("click", () => {
  setSettingsOpen(currentView !== "settings");
});

document.addEventListener("keydown", e => {
  // só quando as definições estão à frente e o foco não está num campo: o
  // Escape das janelas (ajuda, seletor de livros…) continua a ser delas
  if (e.key !== "Escape" || currentView !== "settings") return;
  const alvo = e.target;
  if (alvo && alvo.closest && alvo.closest("input, select, textarea, [contenteditable]")) return;
  setSettingsOpen(false);
});
