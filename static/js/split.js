// My Organizer — avisos (toast), ir ao item original e ecrã dividido

// ---------- ir ao item original + ecrã dividido ----------
let toastTimer = null;
function toast(msg, kind = "") {
  let el = $("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = kind;          // "ok" (verde) | "err" (vermelho) | "" (neutro)
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 4000);
}

// Encontra a <tr> da origem na vista respetiva (null se não estiver lá).
function findSrcRow(src) {
  if (src.view === "ccrs") {
    return [...$("ccrBody").rows].find(tr => {
      const del = tr.querySelector("[data-del]");
      return del && del.dataset.del === src.ccr;
    }) || null;
  }
  if (src.view === "todo") {
    const container = todoLayout === "kanban" ? $("todoBoard") : $("todoBody");
    return container.querySelector(`[data-tid="${CSS.escape(src.todoId)}"]`) || null;
  }
  const rows = [...$("tbody").rows];
  if ($("tablebox").classList.contains("hidden")) return null;  // tabela sem resultados
  // chave exata (função + "o que fazer"), depois só a função, depois o texto da 1.ª célula
  let i = currentMeta.findIndex(m => m && m.fn === src.fn && m.todo === src.todo);
  if (i < 0) i = currentMeta.findIndex(m => m && m.fn === src.fn);
  if (i < 0) i = rows.findIndex(tr =>
    tr.cells[0] && tr.cells[0].innerText.split("\n")[0].trim() === src.fn);
  return i >= 0 ? rows[i] : null;
}

function flashRow(tr) {
  document.querySelectorAll("tr.flashSrc").forEach(x => x.classList.remove("flashSrc"));
  tr.scrollIntoView({ block: "center", behavior: "smooth" });
  void tr.offsetWidth;  // reinicia a animação se for a mesma linha
  tr.classList.add("flashSrc");
  setTimeout(() => tr.classList.remove("flashSrc"), 2600);
}

// Salta para a linha de origem e destaca-a. Se estiver escondida por
// pesquisa/filtros, limpa-os e tenta outra vez.
function revealSource(src) {
  if (!src) return false;
  // a origem sabe de que livro veio: com vários abertos, salta-se primeiro
  // para o separador certo (senão procurava-se a linha no livro errado)
  if (src.view === "excel" && src.workbook) {
    const tab = workbookTabs.find(x => x.name === src.workbook);
    if (tab) src = { ...src, view: `wb:${tab.id}` };
  }
  if (sideView === normalizeView(src.view)) { if (src.view === "ccrs") renderCCRs(); }
  else showView(src.view);

  let tr = findSrcRow(src);
  if (!tr && isWorkbookView(src.view) &&
    ($("search").value || searchTerms.length || roleFilters.size || sideFilters.size || statusFilters.size)) {
    $("search").value = "";
    searchTerms = [];
    clearFilters();
    render();
    tr = findSrcRow(src);
  }
  if (!tr) {
    const otherSheet = src.sheet && lastData && lastData.sheet && src.sheet !== lastData.sheet;
    toast(t("src_notfound") + (otherSheet ? ` (${src.sheet})` : ""), "err");
    return false;
  }
  flashRow(tr);
  return true;
}

// --- painéis ---
// os separadores dos livros levam o ✕ de fechar dentro do botão: o nome está
// no data-label, não no textContent (que traria o ✕ atrás)
const tabLabel = view => {
  const b = document.querySelector(`.tabs button[data-view="${view}"]`);
  if (!b) return "";
  return b.dataset.label || b.textContent || "";
};

let splitPct = Math.min(78, Math.max(22, +localStorage.getItem("bsp-tracker-split") || 50));
document.documentElement.style.setProperty("--split", splitPct + "%");

if (localStorage.getItem("bsp-tracker-split-orient") === "v") document.body.classList.add("split-vertical");

function updateOrientBtn() {
  const vertical = document.body.classList.contains("split-vertical");
  const btn = $("sideOrient");
  if (!btn) return;
  btn.textContent = vertical ? "⇔" : "⇕";
  btn.title = vertical ? "Lado a lado" : "Empilhado";
}
updateOrientBtn();

function enterSplit(side, src) {
  if (!src) return;
  // a origem pode apontar para um livro concreto (ver revealSource)
  let view = src.view;
  if (view === "excel" && src.workbook) {
    const tab = workbookTabs.find(x => x.name === src.workbook);
    if (tab) view = `wb:${tab.id}`;
  }
  view = normalizeView(view);
  if (sideView && sideView !== view) exitSplit();
  if (isWorkbookView(view)) setActiveTab(workbookViewId(view));
  sideView = view;
  const el = viewEl(sideView);
  if (!el) { sideView = null; return; }
  $("sideBody").appendChild(el);
  el.classList.remove("hidden");
  $("sideTitle").textContent = tabLabel(sideView);
  $("paneSide").classList.remove("hidden");
  $("splitBar").classList.remove("hidden");
  document.body.classList.add("split");
  document.body.classList.toggle("side-left", side === "left");
  showView("todo");     // o TODO fica no painel principal
  revealSource(src);
}

// dividir o ecrã arrastando um separador do menu para uma das faixas laterais
function enterSplitView(side, view) {
  view = normalizeView(view);
  if (!viewEl(view)) return;
  if (sideView && sideView !== view) exitSplit();
  // o painel do livro é um só: pô-lo ao lado obriga a que seja esse o livro ativo
  if (isWorkbookView(view)) setActiveTab(workbookViewId(view));
  sideView = view;
  const el = viewEl(view);
  $("sideBody").appendChild(el);
  el.classList.remove("hidden");
  $("sideTitle").textContent = tabLabel(view);
  $("paneSide").classList.remove("hidden");
  $("splitBar").classList.remove("hidden");
  document.body.classList.add("split");
  document.body.classList.toggle("side-left", side === "left");
  // o painel principal fica com a vista atual; se for a mesma, escolhe outra
  // (nunca outro livro: o painel dos livros já está do lado)
  showView(currentView === view || isWorkbookView(currentView)
    ? (isWorkbookView(view) ? "todo" : fallbackView())
    : currentView);
}

function exitSplit() {
  if (!sideView) return;
  const el = viewEl(sideView);
  $("paneMain").appendChild(el);
  el.classList.add("hidden");
  sideView = null;
  $("paneSide").classList.add("hidden");
  $("splitBar").classList.add("hidden");
  document.body.classList.remove("split", "side-left");
  showView(currentView);
}

$("sideClose").addEventListener("click", exitSplit);
$("sideSwap").addEventListener("click", () => document.body.classList.toggle("side-left"));
$("sideOrient").addEventListener("click", () => {
  const vertical = document.body.classList.toggle("split-vertical");
  localStorage.setItem("bsp-tracker-split-orient", vertical ? "v" : "h");
  updateOrientBtn();
});

// largar o botão ↗ numa das faixas laterais divide o ecrã
document.querySelectorAll("#dropZones .dropZone").forEach(zone => {
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("over");
    $("dropZones").classList.add("hidden");
    const p = dragPayload(e);
    if (!p) return;
    if (p.kind === "tab") enterSplitView(zone.dataset.side, p.view);
    else if (p.kind === "opensrc")
      enterSplit(zone.dataset.side, srcOf(todos.find(it => it.id === p.id)));
  });
});

// arrastar um separador do menu mostra as faixas de largada. Está numa função
// porque os separadores dos livros nascem depois disto (ver renderWorkbookTabs).
function wireTabDrag(b) {
  b.addEventListener("dragstart", e => {
    e.dataTransfer.setData("application/json",
      JSON.stringify({ kind: "tab", view: b.dataset.view }));
    // "copyMove": copy para as faixas do ecrã dividido, move para reordenar os
    // separadores (views.js). Só com "copy" o browser recusava o dropEffect
    // "move" e o drop da reordenação nunca chegava a acontecer.
    e.dataTransfer.effectAllowed = "copyMove";
    $("dropZones").classList.remove("hidden");
  });
  b.addEventListener("dragend", () => {
    $("dropZones").classList.add("hidden");
    document.querySelectorAll("#dropZones .dropZone").forEach(z => z.classList.remove("over"));
  });
}
document.querySelectorAll(".tabs button[data-view]").forEach(wireTabDrag);

// fallback para tablets/smartphones onde o HTML5 DnD falha (ex.: iPad/Safari)
let touchDrag = null;

function isInteractiveForTouchDrag(el) {
  return !!el.closest('input, textarea, select, button:not([data-src]), a, label');
}

function payloadFromTouchDragTarget(target) {
  const tab = target.closest('.tabs button[data-view]');
  if (tab) return { kind: "tab", view: tab.dataset.view };

  const todoRow = target.closest("tr.todoRow");
  if (todoRow) {
    if (target.closest("[data-src]")) return { kind: "opensrc", id: todoRow.dataset.tid };
    return { kind: "todo", id: todoRow.dataset.tid };
  }

  const todoCard = target.closest(".todoCard");
  if (todoCard) {
    if (target.closest("[data-src]")) return { kind: "opensrc", id: todoCard.dataset.tid };
    return { kind: "todo", id: todoCard.dataset.tid };
  }

  const taskRow = target.closest("#tbody tr");
  if (taskRow && taskRow.cells && taskRow.cells.length) {
    const fn = taskRow.cells[0].innerText.split("\n")[0].trim();
    if (!fn) return null;
    const detail = taskRowDetail(taskRow);
    const meta = currentMeta[[...$("tbody").rows].indexOf(taskRow)] || {};
    const ref = {
      workbook: activeBookName(), sheet: (lastData && lastData.sheet) || "",
      fn: meta.fn || fn, todo: meta.todo || "",
    };
    return { kind: "task", title: fn, detail, ref };
  }

  const ccrRow = target.closest("#ccrBody tr");
  if (ccrRow) {
    const del = ccrRow.querySelector("[data-del]");
    if (!del) return null;
    const detail = ((ccrs[del.dataset.del] || {}).note || "").slice(0, 300);
    return { kind: "ccr", title: `CCR ${del.dataset.del}`, detail, ref: { ccr: del.dataset.del } };
  }

  return null;
}

function clearTouchDragVisuals() {
  todoTab.classList.remove("dropready");
  $("dropZones").classList.add("hidden");
  document.querySelectorAll("#dropZones .dropZone.over").forEach(z => z.classList.remove("over"));
  document.querySelectorAll(".todoColBody.over").forEach(x => x.classList.remove("over"));
}

document.addEventListener("pointerdown", e => {
  if (e.pointerType !== "touch") return;
  if (isInteractiveForTouchDrag(e.target)) return;
  const payload = payloadFromTouchDragTarget(e.target);
  if (!payload) return;
  touchDrag = {
    startX: e.clientX,
    startY: e.clientY,
    pointerId: e.pointerId,
    payload,
    dragging: false,
  };
}, { passive: true });

document.addEventListener("pointermove", e => {
  if (!touchDrag || e.pointerId !== touchDrag.pointerId) return;
  const dx = Math.abs(e.clientX - touchDrag.startX);
  const dy = Math.abs(e.clientY - touchDrag.startY);
  if (!touchDrag.dragging && Math.max(dx, dy) < 12) return;

  if (!touchDrag.dragging) {
    touchDrag.dragging = true;
    if (touchDrag.payload.kind === "tab" || touchDrag.payload.kind === "opensrc") {
      $("dropZones").classList.remove("hidden");
    }
  }

  e.preventDefault();
  const over = document.elementFromPoint(e.clientX, e.clientY);
  const inTodoTarget = !!(over && (over.closest('.tabs button[data-view="todo"]') || over.closest("#todoView")));
  todoTab.classList.toggle("dropready", inTodoTarget);

  document.querySelectorAll("#dropZones .dropZone.over").forEach(z => z.classList.remove("over"));
  const dz = over && over.closest("#dropZones .dropZone");
  if (dz) dz.classList.add("over");

  document.querySelectorAll(".todoColBody.over").forEach(x => x.classList.remove("over"));
  const col = over && over.closest(".todoColBody");
  if (col) col.classList.add("over");
}, { passive: false });

document.addEventListener("pointerup", e => {
  if (!touchDrag || e.pointerId !== touchDrag.pointerId) return;
  const ended = touchDrag;
  touchDrag = null;
  if (!ended.dragging) return;

  const over = document.elementFromPoint(e.clientX, e.clientY);
  const zone = over && over.closest("#dropZones .dropZone");
  if (zone) {
    if (ended.payload.kind === "tab") enterSplitView(zone.dataset.side, ended.payload.view);
    else if (ended.payload.kind === "opensrc")
      enterSplit(zone.dataset.side, srcOf(todos.find(it => it.id === ended.payload.id)));
    clearTouchDragVisuals();
    return;
  }

  const todoTarget = over && (over.closest('.tabs button[data-view="todo"]') || over.closest("#todoView"));
  if (todoTarget) {
    const row = over && over.closest("tr.todoRow");
    const colBody = over && over.closest(".todoColBody");
    const card = over && over.closest(".todoCard");
    handleTodoPayload(ended.payload, row, colBody ? colBody.dataset.todocol : null, card ? card.dataset.tid : null);
  }
  clearTouchDragVisuals();
}, { passive: true });

document.addEventListener("pointercancel", e => {
  if (!touchDrag || e.pointerId !== touchDrag.pointerId) return;
  touchDrag = null;
  clearTouchDragVisuals();
}, { passive: true });

// barra do meio: arrastar para redimensionar
$("splitBar").addEventListener("pointerdown", e => {
  e.preventDefault();
  const bar = $("splitBar");
  bar.setPointerCapture(e.pointerId);
  bar.classList.add("dragging");
  const move = ev => {
    const r = $("panes").getBoundingClientRect();
    const vertical = document.body.classList.contains("split-vertical");
    const size = vertical ? r.height : r.width;
    if (!size) return;
    let p = vertical
      ? ((ev.clientY - r.top) / size) * 100
      : ((ev.clientX - r.left) / size) * 100;
    if (document.body.classList.contains("side-left")) p = 100 - p;
    splitPct = Math.min(78, Math.max(22, p));
    document.documentElement.style.setProperty("--split", splitPct + "%");
  };
  const up = () => {
    bar.removeEventListener("pointermove", move);
    bar.removeEventListener("pointerup", up);
    bar.removeEventListener("pointercancel", up);
    bar.classList.remove("dragging");
    localStorage.setItem("bsp-tracker-split", String(Math.round(splitPct)));
  };
  bar.addEventListener("pointermove", move);
  bar.addEventListener("pointerup", up);
  bar.addEventListener("pointercancel", up);
});

document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (sideView) exitSplit();
});
