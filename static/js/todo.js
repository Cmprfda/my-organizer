// My Organizer — TODO list pessoal

// ---------- TODO list ----------
let todos = [];
const TODO_LAYOUT_KEY = "bsp-tracker-todo-layout";
const TODO_COLS = ["todo", "inprogress", "review", "done"];
const TODO_COL_LABEL = {
  todo: "todo_col_todo",
  inprogress: "todo_col_inprogress",
  review: "todo_col_review",
  done: "todo_col_done",
};
let todoLayout = localStorage.getItem(TODO_LAYOUT_KEY) === "kanban" ? "kanban" : "list";

function todoColOf(it) {
  const col = String((it && it.col) || "").toLowerCase();
  if (TODO_COLS.includes(col)) return col;
  return it && it.done ? "done" : "todo";
}

function setTodoLayout(layout) {
  todoLayout = layout === "kanban" ? "kanban" : "list";
  localStorage.setItem(TODO_LAYOUT_KEY, todoLayout);
  renderTodo();
}

function kindChip(kind) {
  if (kind === "task") return `<span class="chip done" style="opacity:1">Excel</span> `;
  if (kind === "ccr") return `<span class="chip" style="opacity:1;background:var(--accent-soft);color:var(--accent)">CCR</span> `;
  return "";
}

function formatTodoElapsed(ms) {
  const totalMinutes = Math.max(0, Math.floor((+ms || 0) / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function todoLiveElapsed(it) {
  const base = Math.max(0, +it.elapsed_ms || 0);
  const started = it.timer_started != null ? +it.timer_started : null;
  if (started == null) return base;
  return base + Math.max(0, Date.now() - started);
}

function hasTodoRunningTimer() {
  return todos.some(it => it && it.timer_started != null && todoColOf(it) === "inprogress");
}

function todoTimerHtml(it) {
  const col = todoColOf(it);
  const running = it.timer_started != null;
  const elapsed = formatTodoElapsed(todoLiveElapsed(it));
  if (col === "inprogress") {
    return `<button type="button" class="todoTimer todoTimerBtn${running ? " running" : ""}" data-ttimer="${esc(it.id)}" title="${running ? t("todo_timer_pause") : t("todo_timer_start")}">${running ? '<span class="dot"></span>' : '<span>▶</span>'}${elapsed}</button>`;
  }
  if ((+it.elapsed_ms || 0) > 0) {
    return `<span class="todoTimer" title="${t("todo_timer_view")}">⏱ ${elapsed}</span>`;
  }
  return "";
}

function todoTimerRestartHtml(it) {
  const col = todoColOf(it);
  const hasTime = (it.timer_started != null) || ((+it.elapsed_ms || 0) > 0);
  if (!hasTime) return "";
  if (!["inprogress", "review", "done", "todo"].includes(col)) return "";
  return `<button type="button" class="todoTimerReset" data-treset="${esc(it.id)}" title="${t("todo_timer_restart")}">↺</button>`;
}

function todoNextCol(it) {
  const col = todoColOf(it);
  const idx = TODO_COLS.indexOf(col);
  return TODO_COLS[(idx + 1) % TODO_COLS.length];
}

function todoPrevCol(it) {
  const col = todoColOf(it);
  const idx = TODO_COLS.indexOf(col);
  return TODO_COLS[(idx - 1 + TODO_COLS.length) % TODO_COLS.length];
}

function todoStatusHtml(it) {
  const col = todoColOf(it);
  const next = todoNextCol(it);
  const prev = todoPrevCol(it);
  const tip = `${t("todo_status_click")}: ${t(TODO_COL_LABEL[next])}\n${t("todo_status_back")}: ${t(TODO_COL_LABEL[prev])}`;
  return `<button type="button" class="todoStatusBtn" data-tocol="${esc(it.id)}" title="${esc(tip)}">${esc(t(TODO_COL_LABEL[col]))}</button>`;
}

// De onde veio um item do TODO: {view, ...chaves}. Itens escritos à mão não têm origem.
// Os itens antigos não têm `ref` guardada — aí adivinha-se pelo título.
function srcOf(it) {
  if (!it) return null;
  const ref = it.ref || {};
  if (it.kind === "ccr") {
    const id = ref.ccr || (String(it.title).match(/\d+/) || [])[0];
    return id ? { view: "ccrs", ccr: String(id) } : null;
  }
  if (it.kind === "task") {
    const fn = ref.fn || String(it.title).trim();
    return fn ? { view: "excel", fn, todo: ref.todo || "", sheet: ref.sheet || "" } : null;
  }
  return null;
}

// Já está na lista (item por fechar) algo vindo desta origem?
// Compara-se pela origem e não só pelo título, porque várias linhas do Excel
// partilham o mesmo nome. Itens antigos foram guardados sem parte da origem —
// aí só se comparam as chaves que existem.
function todoHas(kind, title, ref) {
  if (!title) return false;
  const want = ref || {};
  const keys = kind === "ccr" ? ["ccr"] : kind === "task" ? ["sheet", "fn", "todo"] : [];
  return todos.some(it => {
    if (!it || it.done) return false;
    if ((it.kind || "manual") !== kind || it.title !== title) return false;
    const got = it.ref || {};
    return keys.every(k => !got[k] || got[k] === (want[k] || ""));
  });
}

// ---------- info da linha do Excel dentro do item do TODO ----------
// O item só guarda o título e o "O que fazer" do momento em que foi criado;
// papel, estados e execução são lidos do Excel a cada render, para
// acompanharem a tarefa. O índice é recalculado quando chegam dados novos.
let taskIndexData = null, taskIndexMap = null;

function taskIndex() {
  if (lastData === taskIndexData) return taskIndexMap;
  taskIndexData = lastData;
  taskIndexMap = new Map();
  const compact = lastData && !lastData.error ? buildCompact(lastData) : null;
  (compact ? compact.rows : []).forEach(r => {
    const meta = r[6] || {};
    const key = `${meta.fn || r[0]}\u001F${meta.todo || ""}`;
    if (!taskIndexMap.has(key)) taskIndexMap.set(key, r);
  });
  return taskIndexMap;
}

function taskRowFor(it) {
  if (!it || it.kind !== "task") return null;
  const map = taskIndex();
  if (!map || !map.size) return null;
  const ref = it.ref || {};
  const fn = ref.fn || String(it.title).trim();
  const exact = map.get(`${fn}\u001F${ref.todo || ""}`);
  if (exact) return exact;
  // itens antigos foram guardados sem o `todo`: aceita-se a 1.ª linha com o mesmo nome
  for (const [key, row] of map) if (key.split("\u001F")[0] === fn) return row;
  return null;
}

function todoTaskInfoHtml(it) {
  const row = taskRowFor(it);
  if (!row) return "";
  const meta = row[6] || {};
  const over = meta.over || {};
  const cols = row[7] || [];
  const n = meta.note;
  const parts = [];
  if (row[1]) parts.push(`<span class="role">${esc(row[1])}</span>`);
  String(row[2]).split("\n").filter(l => l.trim()).forEach((l, k) => {
    const local = !!over[cols[k]];
    parts.push(`<span class="badge ${statusClass(l)}${local ? " local" : ""}">${esc(l)}${local ? " ✎" : ""}</span>`);
  });
  if (n && n.tag) parts.push(`<span class="badge ${tagClass(n.tag)}">${esc(tagDisplay(n.tag))}</span>`);
  if (n && n.checks && Object.values(n.checks).some(Boolean)) {
    parts.push(`<span class="chips">` + CHECKS.map(([k, label, short]) =>
      `<span class="chip${n.checks[k] ? " done" : ""}" title="${esc(t(label))}">${esc(short)}${n.checks[k] ? " ✓" : ""}</span>`
    ).join("") + `</span>`);
  }
  if (n && n.note) parts.push(`<span class="obs">${esc(n.note)}</span>`);
  if (!parts.length) return "";
  return `<div class="todoTaskInfo">${parts.join("")}</div>`;
}

function renderTodo() {
  $("todoModeList").classList.toggle("active", todoLayout === "list");
  $("todoModeKanban").classList.toggle("active", todoLayout === "kanban");
  $("todoBox").classList.toggle("hidden", todoLayout !== "list" || !todos.length);
  $("todoBoardBox").classList.toggle("hidden", todoLayout !== "kanban" || !todos.length);
  $("todoEmpty").classList.toggle("hidden", !!todos.length);
  if (!todos.length) {
    $("todoBody").innerHTML = "";
    $("todoBoard").innerHTML = "";
    return;
  }

  if (todoLayout === "list") {
    $("todoBody").innerHTML = todos.map(it => {
      const srcCell = srcOf(it)
        ? `<button type="button" class="srcBtn" data-src="${esc(it.id)}" title="${t("t_src")}">↗</button>`
        : "";
      return `<tr draggable="true" class="todoRow${it.done ? " ccr-done" : ""}" data-tid="${esc(it.id)}">
    <td style="width:1%"><input type="checkbox" data-tgl="${esc(it.id)}"${it.done ? " checked" : ""}></td>
    <td>${kindChip(it.kind)}${esc(it.title)}${it.detail ? `<span class="obs">${esc(it.detail)}</span>` : ""}${todoTaskInfoHtml(it)}</td>
    <td style="width:1%">${todoStatusHtml(it)}</td>
    <td style="width:1%">${todoTimerHtml(it)} ${todoTimerRestartHtml(it)}</td>
    <td style="width:1%">${srcCell}</td>
    <td style="width:1%"><button type="button" class="ccr-x" data-tdel="${esc(it.id)}" title="${t("t_remove")}">✕</button></td>
  </tr>`;
    }).join("");
    return;
  }

  const byCol = Object.fromEntries(TODO_COLS.map(col => [col, []]));
  todos.forEach(it => byCol[todoColOf(it)].push(it));
  $("todoBoard").innerHTML = TODO_COLS.map(col => {
    const cards = byCol[col].map(it => {
      const srcCell = srcOf(it)
        ? `<button type="button" class="srcBtn" data-src="${esc(it.id)}" title="${t("t_src")}">↗</button>`
        : "";
      return `<article draggable="true" class="todoCard${it.done ? " done" : ""}" data-tid="${esc(it.id)}">
    <div class="todoCardTitle">${kindChip(it.kind)}${esc(it.title)}</div>
    ${it.detail ? `<div class="todoCardDetail">${esc(it.detail)}</div>` : ""}
    ${todoTaskInfoHtml(it)}
    <div class="todoCardMeta">
      <input type="checkbox" data-tgl="${esc(it.id)}"${it.done ? " checked" : ""}>
      ${todoStatusHtml(it)}
      ${todoTimerHtml(it)}
      ${todoTimerRestartHtml(it)}
      ${srcCell}
      <span class="spacer"></span>
      <button type="button" class="ccr-x" data-tdel="${esc(it.id)}" title="${t("t_remove")}">✕</button>
    </div>
  </article>`;
    }).join("");
    return `<section class="todoCol" data-todocol="${col}">
  <div class="todoColHead">${esc(t(TODO_COL_LABEL[col]))}<span class="todoColCount">${byCol[col].length}</span></div>
  <div class="todoColBody" data-todocol="${col}">${cards}</div>
</section>`;
  }).join("");
}

async function postTodo(body) {
  try {
    const res = await fetch("/api/todo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = await res.json();
    if (!out.ok) { alert("Operação TODO falhou: " + (out.error || "?")); return false; }
    todos = out.todo;
    renderTodo();
    // as origens mostram "+ TODO" só enquanto não estiverem na lista
    render();
    renderCCRs();
    return true;
  } catch (err) {
    alert("Não foi possível contactar o servidor: " + err);
    return false;
  }
}

// o servidor ignora tarefas repetidas (mesmo título por fechar); sem aviso
// parecia que arrastar/clicar não fazia nada
async function addTodoWithFeedback(body) {
  const before = todos.length;
  const ok = await postTodo(body);
  if (!ok) return;
  const novo = todos.length > before;
  toast(novo ? tf("todo_added", body.title) : tf("todo_exists", body.title), novo ? "ok" : "");
}

function addTodoFromTaskRow(btn) {
  const tr = btn.closest("tr");
  const ri = +btn.dataset.todoadd;
  if (!tr || Number.isNaN(ri)) return;
  const fn = tr.cells[0] ? tr.cells[0].innerText.split("\n")[0].trim() : "";
  if (!fn) return;
  const detail = (tr.cells[3] ? tr.cells[3].innerText : "").trim().slice(0, 300);
  const meta = currentMeta[ri] || {};
  const ref = { sheet: (lastData && lastData.sheet) || "", fn: meta.fn || fn, todo: meta.todo || "" };
  addTodoWithFeedback({ action: "add", title: fn, kind: "task", detail, ref, col: "todo" });
}

function addTodoFromCcr(id) {
  const item = ccrs[id] || {};
  addTodoWithFeedback({ action: "add", title: `CCR ${id}`, kind: "ccr", detail: String(item.note || "").trim().slice(0, 300), ref: { ccr: id }, col: "todo" });
}

// dir = 1 avança, dir = -1 recua (permite voltar a "TODO" sem dar a volta toda)
function setTodoStatusById(id, dir = 1) {
  const item = todos.find(it => it.id === id);
  if (!item) return;
  postTodo({ action: "set_col", id, col: dir < 0 ? todoPrevCol(item) : todoNextCol(item) });
}

function addManualTodo() {
  const title = $("todoNew").value.trim();
  if (!title) return;
  postTodo({ action: "add", title, kind: "manual", col: todoLayout === "kanban" ? "todo" : null });
  $("todoNew").value = "";
}
$("todoAdd").addEventListener("click", addManualTodo);
$("todoNew").addEventListener("keydown", e => { if (e.key === "Enter") addManualTodo(); });
$("todoModeList").addEventListener("click", () => setTodoLayout("list"));
$("todoModeKanban").addEventListener("click", () => setTodoLayout("kanban"));

$("todoBody").addEventListener("change", e => {
  const cb = e.target.closest("input[data-tgl]");
  if (cb) postTodo({ action: "toggle", id: cb.dataset.tgl });
});
$("todoBody").addEventListener("click", e => {
  const timer = e.target.closest("[data-ttimer]");
  if (timer) { postTodo({ action: "toggle_timer", id: timer.dataset.ttimer }); return; }
  const reset = e.target.closest("[data-treset]");
  if (reset) { postTodo({ action: "restart_timer", id: reset.dataset.treset }); return; }
  const status = e.target.closest("[data-tocol]");
  if (status) { setTodoStatusById(status.dataset.tocol); return; }
  const del = e.target.closest("[data-tdel]");
  if (del) { postTodo({ action: "delete", id: del.dataset.tdel }); return; }
  const src = e.target.closest("[data-src]");
  if (src) revealSource(srcOf(todos.find(it => it.id === src.dataset.src)));
});

$("todoBody").addEventListener("contextmenu", e => {
  const status = e.target.closest("[data-tocol]");
  if (!status) return;
  e.preventDefault();
  setTodoStatusById(status.dataset.tocol, -1);
});

$("todoBoard").addEventListener("change", e => {
  const cb = e.target.closest("input[data-tgl]");
  if (cb) postTodo({ action: "toggle", id: cb.dataset.tgl });
});
$("todoBoard").addEventListener("click", e => {
  const timer = e.target.closest("[data-ttimer]");
  if (timer) { postTodo({ action: "toggle_timer", id: timer.dataset.ttimer }); return; }
  const reset = e.target.closest("[data-treset]");
  if (reset) { postTodo({ action: "restart_timer", id: reset.dataset.treset }); return; }
  const status = e.target.closest("[data-tocol]");
  if (status) { setTodoStatusById(status.dataset.tocol); return; }
  const del = e.target.closest("[data-tdel]");
  if (del) { postTodo({ action: "delete", id: del.dataset.tdel }); return; }
  const src = e.target.closest("[data-src]");
  if (src) revealSource(srcOf(todos.find(it => it.id === src.dataset.src)));
});

$("todoBoard").addEventListener("contextmenu", e => {
  const status = e.target.closest("[data-tocol]");
  if (!status) return;
  e.preventDefault();
  setTodoStatusById(status.dataset.tocol, -1);
});

// arrastar: das Tarefas/CCRs para o TODO, e dentro do TODO para reordenar
function dragPayload(e) {
  try {
    return JSON.parse(e.dataTransfer.getData("application/json") ||
      e.dataTransfer.getData("text/plain") || "null");
  } catch { return null; }
}

$("tbody").addEventListener("dragstart", e => {
  const tr = e.target.closest("tr");
  if (!tr || !tr.cells.length) return;
  const fn = tr.cells[0].innerText.split("\n")[0].trim();
  if (!fn) return;
  // leva também o "O que fazer" como detalhe do item
  const detail = (tr.cells[3] ? tr.cells[3].innerText : "").trim().slice(0, 300);
  // ...e as chaves exatas da linha, para se poder voltar a ela mais tarde
  const meta = currentMeta[[...$("tbody").rows].indexOf(tr)] || {};
  const ref = { sheet: (lastData && lastData.sheet) || "", fn: meta.fn || fn, todo: meta.todo || "" };
  e.dataTransfer.setData("application/json", JSON.stringify({ kind: "task", title: fn, detail, ref }));
  e.dataTransfer.effectAllowed = "copy";
});
$("ccrBody").addEventListener("dragstart", e => {
  const tr = e.target.closest("tr");
  const del = tr && tr.querySelector("[data-del]");
  if (!del) return;
  const detail = ((ccrs[del.dataset.del] || {}).note || "").slice(0, 300);
  e.dataTransfer.setData("application/json",
    JSON.stringify({
      kind: "ccr", title: `CCR ${del.dataset.del}`, detail,
      ref: { ccr: del.dataset.del }
    }));
  e.dataTransfer.effectAllowed = "copy";
});
$("todoBody").addEventListener("dragstart", e => {
  const tr = e.target.closest("tr.todoRow");
  if (!tr) return;
  // arrastar o botão ↗ (e não a linha) serve para dividir o ecrã
  if (e.target.closest("[data-src]")) {
    e.dataTransfer.setData("application/json",
      JSON.stringify({ kind: "opensrc", id: tr.dataset.tid }));
    e.dataTransfer.effectAllowed = "copy";
    $("dropZones").classList.remove("hidden");
    return;
  }
  e.dataTransfer.setData("application/json", JSON.stringify({ kind: "todo", id: tr.dataset.tid }));
  e.dataTransfer.effectAllowed = "move";
});
$("todoBoard").addEventListener("dragstart", e => {
  const card = e.target.closest(".todoCard");
  if (!card) return;
  if (e.target.closest("[data-src]")) {
    e.dataTransfer.setData("application/json",
      JSON.stringify({ kind: "opensrc", id: card.dataset.tid }));
    e.dataTransfer.effectAllowed = "copy";
    $("dropZones").classList.remove("hidden");
    return;
  }
  e.dataTransfer.setData("application/json", JSON.stringify({ kind: "todo", id: card.dataset.tid }));
  e.dataTransfer.effectAllowed = "move";
});
$("todoBody").addEventListener("dragend", () => {
  $("dropZones").classList.add("hidden");
  document.querySelectorAll("#dropZones .dropZone").forEach(z => z.classList.remove("over"));
});
$("todoBoard").addEventListener("dragend", () => {
  $("dropZones").classList.add("hidden");
  document.querySelectorAll("#dropZones .dropZone").forEach(z => z.classList.remove("over"));
  document.querySelectorAll(".todoCol.over").forEach(x => x.classList.remove("over"));
});

const todoTab = document.querySelector('.tabs button[data-view="todo"]');
function handleTodoPayload(p, targetRow, targetCol, beforeCardId) {
  if (!p) return;
  if (p.kind === "todo" && p.id) {
    if (targetCol) {
      postTodo({ action: "move_kanban", id: p.id, col: targetCol, before: beforeCardId || null });
    } else {
      const to = targetRow ? [...$("todoBody").rows].indexOf(targetRow) : todos.length;
      postTodo({ action: "move", id: p.id, to });
    }
  } else if (p.title) {
    addTodoWithFeedback({
      action: "add", title: p.title, kind: p.kind || "manual",
      detail: p.detail || "", ref: p.ref || null, col: targetCol || "todo"
    });
  }
}

function handleTodoDrop(e, targetRow, targetCol, beforeCardId) {
  e.preventDefault();
  todoTab.classList.remove("dropready");
  handleTodoPayload(dragPayload(e), targetRow, targetCol, beforeCardId);
}

// coluna do kanban por baixo do cursor: vale a coluna inteira (cabeçalho e
// espaço vazio incluídos), não só a zona onde estão os cartões
function todoColUnder(target) {
  const col = target && target.closest ? target.closest("[data-todocol]") : null;
  return col ? col.dataset.todocol : null;
}

[todoTab, $("todoView")].forEach(el => {
  el.addEventListener("dragover", e => { e.preventDefault(); todoTab.classList.add("dropready"); });
  el.addEventListener("dragleave", () => todoTab.classList.remove("dropready"));
});
todoTab.addEventListener("drop", e => handleTodoDrop(e, null, null, null));
$("todoView").addEventListener("drop", e => {
  const row = e.target.closest("tr.todoRow");
  const card = e.target.closest(".todoCard");
  handleTodoDrop(e, row, todoColUnder(e.target), card ? card.dataset.tid : null);
});

$("todoBoard").addEventListener("dragover", e => {
  e.preventDefault();
  const col = e.target.closest ? e.target.closest(".todoCol") : null;
  document.querySelectorAll(".todoCol.over").forEach(x => x.classList.remove("over"));
  if (col) col.classList.add("over");
});
$("todoBoard").addEventListener("dragleave", e => {
  if (!e.relatedTarget || !$("todoBoard").contains(e.relatedTarget)) {
    document.querySelectorAll(".todoCol.over").forEach(x => x.classList.remove("over"));
  }
});

setInterval(() => {
  if ((currentView === "todo" || sideView === "todo") && hasTodoRunningTimer()) renderTodo();
}, 15000);
