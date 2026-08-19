// My Organizer — pesquisa global (Ctrl+K): uma caixa para tudo
//
// Cada vista já tem a sua pesquisa, mas nenhuma atravessa as outras: quem se
// lembra do nome de uma coisa e não de onde a pôs tem de a procurar vista a
// vista. Aqui escreve-se o nome e salta-se para lá, seja uma linha de qualquer
// livro aberto, uma CCR, um item Por fazer, uma nota do quadro, uma issue do
// Jira ligada — ou uma ação da app ("relatório da semana", "métricas").
//
// A pesquisa é sempre sobre o que a app já tem em memória: não faz pedidos ao
// servidor e por isso responde a cada tecla.

const SEARCH_MAX_PER_GROUP = 6;
let searchResults = [];
let searchCursor = 0;

const searchOpen = () => !$("cmdOverlay").classList.contains("hidden");

// ---------- as fontes ----------
// Linhas de TODOS os livros abertos (não só o que está à vista): é isso que faz
// a diferença entre "pesquisa global" e a caixa de pesquisa da vista.
function searchTaskHits(termos) {
  const out = [];
  workbookTabs.forEach(tab => {
    const data = tab.lastData;
    if (!data || data.error || !Array.isArray(data.rows)) return;
    data.rows.forEach((r, i) => {
      const meta = (data.row_meta || [])[i];
      if (!meta) return;
      const texto = r.join(" ");
      if (!searchMatches(texto, termos)) return;
      const nome = String(meta.fn || r[0] || "").trim();
      const estado = [((meta.cur || {})["Status TC"]), ((meta.cur || {})["Status TP"])]
        .map(s => String(s || "").trim()).filter(s => s && norm(s) !== "n/a")[0] || "";
      out.push({
        group: "tasks", icon: "▤",
        title: nome || `linha ${meta.xlrow}`,
        sub: [tab.name, String(meta.todo || "").trim(), estado].filter(Boolean).join(" · "),
        score: searchScore(nome, termos),
        go: () => revealSource({
          view: `wb:${tab.id}`, workbook: tab.name, sheet: data.sheet,
          fn: meta.fn, todo: meta.todo,
        }),
      });
    });
  });
  return out;
}

function searchCcrHits(termos) {
  return Object.keys(ccrs || {})
    .filter(id => searchMatches(`CCR ${id} ${(ccrs[id] || {}).note || ""}`, termos))
    .map(id => ({
      group: "ccrs", icon: "⚑", title: `CCR ${id}`,
      sub: String((ccrs[id] || {}).note || "").trim(),
      score: searchScore(`CCR ${id}`, termos),
      go: () => revealSource({ view: "ccrs", ccr: String(id) }),
    }));
}

function searchTodoHits(termos) {
  return (todos || [])
    .filter(it => searchMatches(`${it.title} ${it.detail || ""}`, termos))
    .map(it => ({
      group: "todo", icon: "✔", title: String(it.title || ""),
      sub: [todoColLabel(todoColOf(it)), String(it.detail || "").trim()]
        .filter(Boolean).join(" · "),
      score: searchScore(it.title, termos),
      go: () => revealSource({ view: "todo", todoId: it.id }),
    }));
}

// Notas do quadro: procura no título e no texto das caixas, para se poder achar
// uma nota por uma frase que se escreveu lá dentro.
function searchNoteHits(termos) {
  const notas = (typeof notepad !== "undefined" && notepad && notepad.notes) || [];
  return notas
    .filter(n => searchMatches(
      `${n.title} ${(n.boxes || []).map(b => b.text || "").join(" ")}`, termos))
    .map(n => ({
      group: "notes", icon: "✎", title: String(n.title || ""),
      sub: (n.refs || []).map(r => noteRefLabel(r)).filter(Boolean).join(" · "),
      score: searchScore(n.title, termos),
      go: () => { setCurrentNote(n.id); showView("notes"); },
    }));
}

function searchJiraHits(termos) {
  const vistas = new Map();
  (todos || []).forEach(it => {
    (it.jiraIssues || []).forEach(issue => {
      if (!issue || !issue.key || vistas.has(issue.key)) return;
      if (!searchMatches(`${issue.key} ${issue.summary || ""} ${issue.epicName || ""}`, termos)) return;
      vistas.set(issue.key, {
        group: "jira", icon: "◆", title: issue.key,
        sub: [String(issue.summary || "").trim(), String(issue.epicName || "").trim()]
          .filter(Boolean).join(" · "),
        score: searchScore(issue.key, termos),
        go: () => { showView("jira"); },
      });
    });
  });
  return [...vistas.values()];
}

// Ações: o que se faria com o rato, ao alcance do teclado
function searchActionHits(termos) {
  const acoes = [
    { title: t("cmd_report"), go: () => openWeekReport() },
    { title: t("cmd_metrics"), go: () => showView("metrics") },
    { title: t("cmd_tasks"), go: () => showView(workbookView()) },
    { title: t("cmd_todo"), go: () => showView("todo") },
    { title: t("cmd_ccrs"), go: () => showView("ccrs") },
    { title: t("cmd_notes"), go: () => showView("notes") },
    { title: t("cmd_code"), go: () => showView("code") },
    { title: t("cmd_feedback"), go: () => showView("feedback") },
    { title: t("cmd_refresh"), go: () => load(true, true) },
    { title: t("cmd_settings"), go: () => setSettingsOpen(true) },
  ];
  return acoes
    .filter(a => searchMatches(a.title, termos))
    .map(a => ({ group: "actions", icon: "⌘", title: a.title, sub: "",
                 score: searchScore(a.title, termos), go: a.go }));
}

// ---------- comparação ----------
const searchTermsOf = q => norm(q).split(/\s+/).filter(Boolean);

// todos os termos têm de aparecer (como a caixa das tarefas em modo E)
function searchMatches(text, termos) {
  const t2 = norm(text);
  return termos.every(term => t2.includes(term));
}

// o que começa pelo que se escreveu vem primeiro; depois o que o contém
function searchScore(title, termos) {
  const t2 = norm(title || "");
  if (!termos.length) return 0;
  if (t2.startsWith(termos[0])) return 3;
  if (t2.split(/[\s_\-/]+/).some(p => p.startsWith(termos[0]))) return 2;
  if (t2.includes(termos[0])) return 1;
  return 0;
}

const SEARCH_GROUP_ORDER = ["actions", "tasks", "todo", "ccrs", "notes", "jira"];

function buildSearchResults(q) {
  const termos = searchTermsOf(q);
  if (!termos.length) {
    // caixa vazia: as ações, para se ver logo que isto também serve para isso
    return searchActionHits([]).slice(0, SEARCH_MAX_PER_GROUP);
  }
  const todosHits = [
    ...searchActionHits(termos), ...searchTaskHits(termos), ...searchTodoHits(termos),
    ...searchCcrHits(termos), ...searchNoteHits(termos), ...searchJiraHits(termos),
  ];
  const out = [];
  SEARCH_GROUP_ORDER.forEach(g => {
    out.push(...todosHits.filter(h => h.group === g)
      .sort((a, b) => b.score - a.score)
      .slice(0, SEARCH_MAX_PER_GROUP));
  });
  return out;
}

// ---------- desenho ----------
function renderSearchResults() {
  const box = $("cmdResults");
  if (!searchResults.length) {
    box.innerHTML = `<div class="cmdEmpty">${esc(t("cmd_none"))}</div>`;
    return;
  }
  let grupoAtual = "";
  box.innerHTML = searchResults.map((r, i) => {
    const cabecalho = r.group !== grupoAtual
      ? `<div class="cmdGroup">${esc(t("cmd_g_" + r.group))}</div>` : "";
    grupoAtual = r.group;
    return cabecalho +
      `<button type="button" class="cmdRow${i === searchCursor ? " active" : ""}" data-cmdi="${i}">
        <span class="cmdIcon">${r.icon}</span>
        <span class="cmdText"><strong>${boldTerms(r.title, searchTermsOf($("cmdInput").value))}</strong>` +
      (r.sub ? `<small>${esc(r.sub)}</small>` : "") + `</span>
      </button>`;
  }).join("");
  const ativa = box.querySelector(".cmdRow.active");
  if (ativa) ativa.scrollIntoView({ block: "nearest" });
}

function refreshSearch() {
  searchResults = buildSearchResults($("cmdInput").value);
  searchCursor = 0;
  renderSearchResults();
}

function setSearchOpen(open) {
  $("cmdOverlay").classList.toggle("hidden", !open);
  if (!open) return;
  $("cmdInput").value = "";
  refreshSearch();
  $("cmdInput").focus();
}

function runSearchResult(i) {
  const r = searchResults[i];
  if (!r) return;
  setSearchOpen(false);
  r.go();
}

// ---------- eventos ----------
$("cmdInput").addEventListener("input", refreshSearch);

$("cmdInput").addEventListener("keydown", e => {
  if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
    e.preventDefault();
    searchCursor = searchResults.length ? (searchCursor + 1) % searchResults.length : 0;
    renderSearchResults();
  } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
    e.preventDefault();
    searchCursor = searchResults.length
      ? (searchCursor - 1 + searchResults.length) % searchResults.length : 0;
    renderSearchResults();
  } else if (e.key === "Enter") {
    e.preventDefault();
    runSearchResult(searchCursor);
  }
});

$("cmdResults").addEventListener("click", e => {
  const row = e.target.closest("[data-cmdi]");
  if (row) runSearchResult(+row.dataset.cmdi);
});

$("cmdOverlay").addEventListener("click", e => {
  if (e.target === $("cmdOverlay")) setSearchOpen(false);
});

// Ctrl+K (⌘K no Mac) abre/fecha. Em captura para chegar antes dos tratadores das
// vistas, e o Esc fecha só esta janela sem sair do ecrã dividido.
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
    e.preventDefault();
    setSearchOpen(!searchOpen());
    return;
  }
  if (e.key === "Escape" && searchOpen()) {
    e.stopPropagation();
    setSearchOpen(false);
  }
}, true);
