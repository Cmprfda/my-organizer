// My Organizer — arranque: ligação dos eventos e primeiro carregamento

function clearFilters() {
  statusFilters.clear();
  sideFilters.clear();
  roleFilters.clear();
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
  // volta a "mais recente" para apanhar o ficheiro acabado de descarregar
  FILE = "";
  localStorage.setItem("bsp-tracker-file", "");

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
    btn.disabled = true;
    btn.textContent = t("btn_pushing");
    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: lastData.file }),
      });
      const out = await res.json();
      if (out.ok && out.failed && out.failed.length)
        alert(`Enviadas ${out.pushed}; falharam ${out.failed.length}:\n` +
          out.failed.map(f => `${f.fn}: ${f.error}`).join("\n"));
      else if (!out.ok)
        alert("Push falhou: " + (out.error || "?"));
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
$("fileSelect").addEventListener("change", () => {
  FILE = $("fileSelect").value;
  localStorage.setItem("bsp-tracker-file", FILE);
  clearFilters();
  load();
});
$("sheetSelect").addEventListener("change", () => {
  SHEET = $("sheetSelect").value;
  localStorage.setItem("bsp-tracker-sheet", SHEET);
  clearFilters();
  load();
});
$("personInput").value = PERSON;
$("personInput").addEventListener("change", () => {
  PERSON = $("personInput").value.trim() || "Carlos Andrade";
  $("personInput").value = PERSON;
  localStorage.setItem("bsp-tracker-person", PERSON);
  statusFilters.clear();
  sideFilters.clear();
  roleFilters.clear();
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
  } else {
    return;
  }
  render();
});
$("viewToggle").addEventListener("click", () => {
  compactView = !compactView;
  statusFilters.clear();
  sideFilters.clear();
  roleFilters.clear();
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
  statusFilters.clear();
  sideFilters.clear();
  roleFilters.clear();
  $("toggleAll").textContent = showAll ? `${t("btn_only")} ${PERSON.split(" ")[0]}` : t("btn_all");
  load();
});

applyLang();
// o notifyTaskChanges() da primeira carga só semeia o retrato das minhas linhas
// (não avisa nada): sem isto, a primeira comparação teria de esperar 20s
load().then(notifyTaskChanges);

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
async function checkForChanges() {
  if (!lastData || lastData.error || !lastData.stamp) return;
  try {
    const res = await fetch(`/api/modified?file=${encodeURIComponent(lastData.file || "")}`);
    const out = await res.json();
    // este pedido chama mesmo a API do OneDrive quando a fonte é a nuvem: um
    // erro aqui prova falta de rede, ao contrário do token em cache (que só
    // expira de hora a hora e por isso pode mostrar "ligado" muito depois de
    // a rede ter caído)
    if (lastData.source === "onedrive") {
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
    if (out.stamp && out.stamp !== lastData.stamp) {
      const antes = { rows: JSON.stringify(lastData.rows || []), digest: lastData.digest };
      await load();
      clientLog(`livro gravado ${out.modified} - recarregado #${antes.digest} -> ` +
        `#${lastData && lastData.digest} (${antes.rows === JSON.stringify((lastData && lastData.rows) || []) ? "sem mudancas nas linhas" : "linhas mudaram"})`);
      // o livro é gravado muitas vezes sem nada mudar nas nossas linhas:
      // só avisamos quando os dados à vista mudam mesmo
      if (!editorOpen && JSON.stringify((lastData && lastData.rows) || []) !== antes.rows)
        toast(t("auto_refresh"), "ok");
      // e, por cima disso, um cartão por cada tarefa minha que mudou mesmo
      // (quem mexeu no estado/OBS/texto de uma linha ligada a mim) — corre
      // sempre, mesmo com um editor aberto: os cartões são passivos e ficam num
      // canto, ao contrário do render, que não pode mexer na célula em edição
      await notifyTaskChanges();
    }
  } catch (e) { /* sem rede: o ciclo de 2 minutos volta a tentar */ }
}
setInterval(checkForChanges, 20000);
setInterval(load, 120000);
