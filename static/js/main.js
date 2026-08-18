// My Organizer — arranque: ligação dos eventos e primeiro carregamento

function clearFilters() {
  statusFilters.clear();
  sideFilters.clear();
  roleFilters.clear();
  customFilterActive.clear();
  staleOnly = false;
  chaseOnly = false;
}

$("clearNotes").addEventListener("click", async () => {
  if (!confirm(t("cfm_notes"))) return;
  try {
    await fetch("/api/notes/clear", { method: "POST" });
  } catch (err) {
    alert("Não foi possível limpar as notas: " + err);
  }
  load();
});

$("fetchBtn").addEventListener("click", async () => {
  const btn = $("fetchBtn");
  const before = lastData ? (lastData.file || "") + (lastData.modified || "") : "";
  btn.disabled = true;
  btn.textContent = "A descarregar…";
  try {
    await fetch("/api/fetch", { method: "POST" });
  } catch (e) { /* o load() seguinte mostra o erro do servidor */ }

  let tries = 0;
  const done = () => { btn.disabled = false; btn.textContent = "Obter do SharePoint"; };
  const poll = async () => {
    await load();
    const now = lastData ? (lastData.file || "") + (lastData.modified || "") : "";
    if (now && now !== before) return done();
    if (++tries < 8) setTimeout(poll, 4000);   // espera até ~30s pelo download
    else done();
  };
  setTimeout(poll, 4000);
});

// Envio das alterações locais (✎) para o Excel. O mesmo botão existe na vista
// das Tarefas e na de Por fazer — `btn` é o que foi carregado, para ser esse a
// mostrar "A enviar…" enquanto o pedido decorre.
async function doPush(btn) {
  if (lastData && lastData.pending) {
    // o destino é sempre o livro do separador ativo: sem nenhum aberto não há
    // para onde escrever (as alterações locais ficam à espera, não se perdem)
    const alvo = (lastData && lastData.file) || tabFile(activeTab());
    if (!alvo) { toast(t("push_need_book"), "err"); return; }
    btn.disabled = true;
    btn.textContent = t("btn_pushing");
    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: alvo }),
      });
      const out = await res.json();
      if (out.ok && out.failed && out.failed.length)
        alert(`Enviadas ${out.pushed}; falharam ${out.failed.length}:\n` +
          out.failed.map(f => `${f.fn}: ${f.error}`).join("\n"));
      else if (!out.ok)
        alert("Push falhou: " + (out.error || "?"));
      // fonte OneDrive: a Microsoft por vezes demora a refletir uma escrita
      // recente na leitura seguinte (sessão de coautoria) — avisa para não
      // parecer que o Push não fez nada
      else if (out.ok && out.pushed && alvo.startsWith("onedrive:"))
        toast(t("push_onedrive_lag"), "ok");
    } catch (err) {
      alert("Push falhou: " + err);
    }
    btn.disabled = false;
  }
  // o render() do load() volta a pôr a etiqueta certa nos dois botões
  load(true, true);
}

$("refresh").addEventListener("click", () => doPush($("refresh")));
$("refreshTodo").addEventListener("click", () => doPush($("refreshTodo")));
$("reloadOnly").addEventListener("click", () => load(true, true));
$("clearLocals").addEventListener("click", async () => {
  if (!confirm(t("cfm_locals"))) return;
  try {
    await fetch("/api/overrides/clear", { method: "POST" });
  } catch (err) {
    alert("Não foi possível descartar: " + err);
  }
  load();
});
document.addEventListener("click", e => {
  if (e.target.id === "cycleNow") load(true, true);
});
$("search").addEventListener("input", render);
// Enter fixa o texto escrito como termo; Backspace na caixa vazia tira o último
$("search").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); pinSearchTerm(); }
  else if (e.key === "Backspace" && !$("search").value && searchTerms.length) {
    searchTerms.pop();
    render();
  }
});
$("searchChips").addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  searchTerms.splice(+chip.dataset.i, 1);
  render();
});
$("searchMode").addEventListener("click", () => {
  searchMode = searchMode === "and" ? "or" : "and";
  localStorage.setItem("bsp-tracker-search-mode", searchMode);
  render();
});
// trocar o ficheiro local deste separador (só aparece nos livros locais)
$("fileSelect").addEventListener("change", () => {
  const tab = activeTab();
  const caminho = $("fileSelect").value;
  if (!tab || !caminho || caminho === tab.path) return;
  // não se muda tab.path no próprio objeto: o id do separador deriva do
  // caminho (workbookId em state.js), por isso mudar só o caminho deixava o
  // separador com um id que já não corresponde a si mesmo (localStorage,
  // activeTabId, notify.js, tudo isso fica órfão). Fecha-se e abre-se de novo
  // com o caminho novo, que já sabe tratar de tudo isso correctamente.
  closeWorkbookTab(tab.id);
  openWorkbookTab({ kind: "local", path: caminho });
});
$("sheetSelect").addEventListener("change", () => {
  const tab = activeTab();
  if (!tab) return;
  tab.sheet = $("sheetSelect").value;
  saveWorkbookTabs();
  clearFilters();
  load();
});
$("personInput").value = PERSON;
$("personInput").addEventListener("change", () => {
  PERSON = $("personInput").value.trim() || "Carlos Andrade";
  $("personInput").value = PERSON;
  localStorage.setItem("bsp-tracker-person", PERSON);
  clearFilters();
  if (showAll) $("toggleAll").textContent = `${t("btn_only")} ${PERSON.split(" ")[0]}`;
  load();
});
$("summary").addEventListener("click", e => {
  const pill = e.target.closest(".pill");
  if (!pill || pill.classList.contains("zero")) return;
  if (pill.dataset.status) {
    const s = pill.dataset.status;
    statusFilters.has(s) ? statusFilters.delete(s) : statusFilters.add(s);
  } else if (pill.dataset.side) {
    // exclusivo: só um lado ativo de cada vez
    const s = pill.dataset.side;
    const wasActive = sideFilters.has(s);
    sideFilters.clear();
    if (!wasActive) sideFilters.add(s);
  } else if (pill.dataset.role) {
    // exclusivo: só um papel ativo de cada vez
    const r = pill.dataset.role;
    const wasActive = roleFilters.has(r);
    roleFilters.clear();
    if (!wasActive) roleFilters.add(r);
  } else if (pill.dataset.stale) {
    // combina-se com tudo o resto (AND), como os filtros personalizados
    staleOnly = !staleOnly;
  } else if (pill.dataset.chase) {
    chaseOnly = !chaseOnly;
  } else if (pill.dataset.customfilter) {
    // não exclusivo: vários filtros personalizados podem estar ligados ao
    // mesmo tempo, combinados em AND (ver render(), tasks.js)
    const id = pill.dataset.customfilter;
    customFilterActive.has(id) ? customFilterActive.delete(id) : customFilterActive.add(id);
  } else {
    return;
  }
  render();
});
$("viewToggle").addEventListener("click", () => {
  compactView = !compactView;
  clearFilters();
  $("viewToggle").textContent = compactView ? t("btn_full") : t("btn_compact");
  render();
});
function setTaskLayout(layout) {
  taskLayout = layout === "cards" ? "cards" : "list";
  localStorage.setItem("bsp-tracker-task-layout", taskLayout);
  $("taskModeList").classList.toggle("active", taskLayout === "list");
  $("taskModeCards").classList.toggle("active", taskLayout === "cards");
  render();
}
$("taskModeList").addEventListener("click", () => setTaskLayout("list"));
$("taskModeCards").addEventListener("click", () => setTaskLayout("cards"));
$("toggleAll").addEventListener("click", () => {
  showAll = !showAll;
  clearFilters();
  $("toggleAll").textContent = showAll ? `${t("btn_only")} ${PERSON.split(" ")[0]}` : t("btn_all");
  load();
});

// separadores dos livros que ficaram abertos da última vez (a app não abre
// nenhum por si: se a lista estiver vazia, fica o painel de boas-vindas)
renderWorkbookTabs();
applyLang();
showView(currentView);
// janela dedicada a um livro (?wb=): o nome do livro no título, para se
// distinguir da janela principal na barra de tarefas do Windows
if (SOLO_WB && activeTab()) {
  document.title = `${activeTab().name} — My Organizer`;
  toast(t("wb_window_solo"), "ok");
}
// o notifyTaskChanges() da primeira carga só semeia o retrato das minhas linhas
// (não avisa nada): sem isto, a primeira comparação teria de esperar 20s
// o painel "Hoje" abre logo (uma vez por dia): as secções que dependem dos
// livros preenchem-se quando a leitura chegar, ver refreshTodayIfOpen
maybeOpenToday();
loadAllTabs().then(() => {
  notifyTaskChanges();
  refreshTodayIfOpen();
});
// a conta OneDrive memorizada só vem do /api/graph (localhost-only); o
// /api/tasks nunca a traz, por estar exposto na LAN — um pedido único no
// arranque chega, os polls seguintes ao /api/tasks preservam-na (graphInfo é
// sempre um merge a partir daqui, nunca uma substituição)
if (typeof graphAction === "function") graphAction("state");
// aviso do dono da instalação: lido uma vez no arranque e mostrado só se for
// novo para este browser (ver announce.js)
loadAnnouncement(true);

// barra do topo: encolhe (mais estreita e sem subtítulos) assim que se desce
// zona morta entre os 32 e os 64px para não oscilar (encolhe/expande em
// loop) quando o scroll pousa mesmo em cima do limiar
let topShrunk = false;
function syncTopBar() {
  if (!topShrunk && window.scrollY > 64) topShrunk = true;
  else if (topShrunk && window.scrollY < 32) topShrunk = false;
  else return;
  document.body.classList.toggle("topShrunk", topShrunk);
}
window.addEventListener("scroll", syncTopBar, { passive: true });
syncTopBar();
// atualização automática: de 20 em 20 segundos pergunta-se só se o livro foi
// gravado (pedido barato) e, se foi, recarrega-se; o ciclo de 2 minutos fica
// como rede de segurança. Os dados continuam a ser lidos com um editor aberto
// (é o render que espera) — de outra forma uma nota deixada aberta congelava a
// app inteira.
async function checkTabForChanges(tab) {
  const antes_data = tab.lastData;
  if (!antes_data || antes_data.error || !antes_data.stamp) return false;
  const ativo = tab.id === activeTabId;
  const res = await fetch(`/api/modified?file=${encodeURIComponent(tabFile(tab))}`);
  const out = await res.json();
  // este pedido chama mesmo a API do OneDrive quando a fonte é a nuvem: um
  // erro aqui prova falta de rede, ao contrário do token em cache (que só
  // expira de hora a hora e por isso pode mostrar "ligado" muito depois de
  // a rede ter caído). Só o separador à vista manda no distintivo.
  if (ativo) {
    if (antes_data.source === "onedrive") {
      const estavaOffline = liveOffline;
      liveOffline = !!out.error;
      liveError = out.error || "";
      if (liveOffline !== estavaOffline) renderGraphState();
    } else if (liveOffline) {
      // a fonte deixou de ser a nuvem: o sinal antigo já não diz nada
      liveOffline = false;
      liveError = "";
      renderGraphState();
    }
  }
  if (!out.stamp || out.stamp === antes_data.stamp) return false;
  const antes = { rows: JSON.stringify(antes_data.rows || []), digest: antes_data.digest };
  if (ativo) await load();
  else await loadTab(tab);
  const agora = tab.lastData;
  clientLog(`livro ${tab.name} gravado ${out.modified} - recarregado #${antes.digest} -> ` +
    `#${agora && agora.digest} (${antes.rows === JSON.stringify((agora && agora.rows) || []) ? "sem mudancas nas linhas" : "linhas mudaram"})`);
  // o livro é gravado muitas vezes sem nada mudar nas nossas linhas:
  // só avisamos quando os dados à vista mudam mesmo
  if (ativo && !editorOpen && JSON.stringify((agora && agora.rows) || []) !== antes.rows)
    toast(t("auto_refresh"), "ok");
  return true;
}

// todos os livros abertos são vigiados, não só o que está à vista: os avisos
// por tarefa (cartões) devem aparecer venha a alteração do livro que vier
async function checkForChanges() {
  let mudou = false;
  for (const tab of [...workbookTabs]) {
    try {
      if (await checkTabForChanges(tab)) mudou = true;
    } catch (e) { /* sem rede: o ciclo de 2 minutos volta a tentar */ }
  }
  // um cartão por cada tarefa minha que mudou mesmo (quem mexeu no estado/OBS/
  // texto de uma linha ligada a mim) — corre sempre, mesmo com um editor
  // aberto: os cartões são passivos e ficam num canto, ao contrário do render,
  // que não pode mexer na célula em edição
  if (mudou) await notifyTaskChanges();
}
setInterval(checkForChanges, 20000);
setInterval(() => loadAllTabs(), 120000);
