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
// prioridade do item, da mais baixa para a mais alta (a mesma escala do
// servidor). "normal" é o valor neutro dos itens que nunca foram marcados.
const TODO_PRIORITIES = ["low", "normal", "high", "urgent"];
const TODO_PRIORITY_LABEL = {
  low: "todo_prio_low",
  normal: "todo_prio_normal",
  high: "todo_prio_high",
  urgent: "todo_prio_urgent",
};
const TODO_PRIORITY_GLYPH = { low: "↓", normal: "•", high: "↑", urgent: "↑↑" };
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

// ---------- prioridade ----------
// Itens gravados antes desta versão não trazem `priority`; aqui (como no
// servidor) vale o valor neutro em vez de rebentar.
function todoPriorityOf(it) {
  const prio = String((it && it.priority) || "").toLowerCase();
  return TODO_PRIORITIES.includes(prio) ? prio : "normal";
}

// dir = 1 sobe na escala, dir = -1 desce (dá a volta nas pontas)
function todoStepPriority(it, dir) {
  const idx = TODO_PRIORITIES.indexOf(todoPriorityOf(it));
  const n = TODO_PRIORITIES.length;
  return TODO_PRIORITIES[(idx + dir + n) % n];
}

// badge clicável: clique sobe a prioridade, botão direito desce (mesma
// linguagem do botão de estado ao lado)
function todoPriorityHtml(it) {
  const prio = todoPriorityOf(it);
  const next = todoStepPriority(it, 1);
  const prev = todoStepPriority(it, -1);
  const tip = `${t("todo_prio_click")}: ${t(TODO_PRIORITY_LABEL[next])}\n${t("todo_prio_back")}: ${t(TODO_PRIORITY_LABEL[prev])}`;
  return `<button type="button" class="todoPrioBtn prio-${prio}" data-tprio="${esc(it.id)}" title="${esc(tip)}">` +
    `<span class="todoPrioGlyph">${TODO_PRIORITY_GLYPH[prio]}</span>${esc(t(TODO_PRIORITY_LABEL[prio]))}</button>`;
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

// O servidor corta os textos guardados (título e origem) a 200 caracteres; sem
// aplicar o mesmo corte aqui, um "o que fazer" longo nunca batia certo com o
// item já guardado e o botão "+ TODO" continuava à vista.
function todoText(value) {
  return String(value == null ? "" : value).trim().slice(0, 200);
}

// Já está na lista (item por fechar) algo vindo desta origem?
// Compara-se pela origem e não só pelo título, porque várias linhas do Excel
// partilham o mesmo nome. Itens antigos foram guardados sem parte da origem —
// aí só se comparam as chaves que existem.
function todoHas(kind, title, ref) {
  const wanted = todoText(title);
  if (!wanted) return false;
  const want = ref || {};
  const keys = kind === "ccr" ? ["ccr"] : kind === "task" ? ["sheet", "fn", "todo"] : [];
  return todos.some(it => {
    if (!it || it.done) return false;
    if ((it.kind || "manual") !== kind || todoText(it.title) !== wanted) return false;
    const got = it.ref || {};
    return keys.every(k => !got[k] || todoText(got[k]) === todoText(want[k]));
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

// avisa quando marcaste este item como Concluído mas a tarefa do Excel por
// trás afinal ainda está do teu lado (ex.: voltou para "Ready for rework")
// — só faz sentido como aviso quando já achavas que estava feito.
function todoIsFlagged(it) {
  if (todoColOf(it) !== "done") return false;
  const row = taskRowFor(it);
  return !!row && row[5] === "On my side";
}

function todoMySideFlag(it, corner) {
  if (!todoIsFlagged(it)) return "";
  const cls = corner ? "todoCardFlag" : "todoRowFlag";
  return `<span class="${cls}" title="${esc(t("side_my"))}">🚩 ${esc(t("side_my"))}</span>`;
}

function todoTaskInfoHtml(it) {
  const row = taskRowFor(it);
  if (!row) return "";
  const meta = row[6] || {};
  const cols = row[7] || [];
  const parts = [];
  if (row[1]) parts.push(`<span class="role">${esc(row[1])}</span>`);
  String(row[2]).split("\n").filter(l => l.trim()).forEach((l, k) => {
    parts.push(badgeHtml(l, cols[k], meta));
  });
  const obsText = String(row[3] === undefined ? "" : row[3]).split("")[1] || "";
  parts.push(obsHtml(obsText, meta));
  const { inner, title } = execCellHtml(meta);
  parts.push(`<div class="execCell" data-xlrow="${esc(meta.xlrow || "")}" title="${esc(title)}">${inner}</div>`);
  return `<div class="todoTaskInfo">${parts.join("")}</div>`;
}

// progresso das subtarefas (ex.: "2/5"), só aparece quando existem subtarefas
function todoSubProgress(it) {
  const subs = Array.isArray(it.subtasks) ? it.subtasks : [];
  return subs.length ? `<span class="todoSubProgress">${subs.filter(s => s.done).length}/${subs.length}</span>` : "";
}

// checklist de subtarefas + campo para adicionar mais uma (Enter submete)
function todoSubtasksHtml(it) {
  const subs = Array.isArray(it.subtasks) ? it.subtasks : [];
  const rows = subs.map(s => `<li class="todoSubItem${s.done ? " done" : ""}">
    <input type="checkbox" data-tsubtgl="${esc(it.id)}|${esc(s.id)}"${s.done ? " checked" : ""}>
    <span class="todoSubTitle" data-tsubedit="${esc(it.id)}|${esc(s.id)}" title="${t("t_edit_title")}">${esc(s.title)}</span>
    <button type="button" class="ccr-x" data-tsubdel="${esc(it.id)}|${esc(s.id)}" title="${t("t_remove")}">✕</button>
  </li>`).join("");
  return `<ul class="todoSubList">${rows}<li class="todoSubAddRow">` +
    `<input type="text" class="todoSubInput" data-tsubnew="${esc(it.id)}" placeholder="${t("ph_subtask")}"></li></ul>`;
}

// issue do Jira ligada ao item (no máximo uma): só o código, clicável para
// abrir no Jira, + ação de registar mais tempo (sem mostrar o esforço já
// registado aqui — isso vê-se na página Jira). Sem issue ligada mostra o campo
// para ligar uma, com sugestões das chaves já conhecidas da app.
function todoJiraHtml(it) {
  const issue = (Array.isArray(it.jiraIssues) ? it.jiraIssues : [])[0];
  if (!issue) {
    return `<ul class="todoJiraList"><li class="todoJiraAddRow">` +
      `<input type="text" class="todoJiraLinkInput" list="jiraSuggestions" data-tjiranew="${esc(it.id)}" placeholder="${t("jira_link_ph")}"></li></ul>`;
  }
  const label = issue.parentSummary && issue.summary ? `${issue.parentSummary} — ${issue.summary}` : (issue.summary || issue.key);
  return `<ul class="todoJiraList"><li class="todoJiraItem">
    ${jiraKeyBadgeHtml(issue.key, label)}
    ${jiraEpicHtml(jiraEpicOf(issue.key, issue))}
    <button type="button" class="mini" data-tjiralog="${esc(it.id)}|${esc(issue.key)}" title="${esc(t("jira_log_action"))}">⏱+</button>
    <button type="button" class="srcBtn" data-tjiragoto="${esc(issue.key)}" title="${esc(t("jira_goto_action"))}">↗</button>
    <button type="button" class="ccr-x" data-tjiraunlink="${esc(it.id)}|${esc(issue.key)}" title="${esc(t("t_jira_unlink"))}">✕</button>
  </li></ul>`;
}

// título editável só para tarefas criadas na app (as de Excel/CCR mantêm o
// título igual à origem, por isso não são clicáveis aqui)
function todoTitleHtml(it) {
  const manual = (it.kind || "manual") === "manual";
  if (!manual) return esc(it.title);
  return `<span class="todoTitleText" data-ttitle="${esc(it.id)}" title="${t("t_edit_title")}">${esc(it.title)}</span>`;
}

function openTodoTitle(el) {
  const id = el.dataset.ttitle;
  const item = todos.find(it => it.id === id);
  if (!item) return;
  el.dataset.editing = "1";
  editorOpen = true;
  const host = el.closest("[data-tid]");
  if (host) host.draggable = false;
  el.innerHTML = `<input type="text" class="todoTitleInput" value="${esc(item.title)}" maxlength="200">`;
  const box = el.querySelector(".todoTitleInput");
  box.focus();
  box.select();
  // o finish() pode ser chamado duas vezes (Enter guarda e o re-render tira o
  // input focado do DOM, o que ainda dispara blur) — a flag evita o duplicado
  let finished = false;
  const finish = save => {
    if (finished) return;
    finished = true;
    editorOpen = false;
    if (host) host.draggable = true;
    const title = box.value.trim();
    if (save && title && title !== item.title) postTodo({ action: "rename", id, title });
    else renderTodo();
  };
  box.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    else if (e.key === "Escape") { e.preventDefault(); finish(false); }
  });
  box.addEventListener("blur", () => finish(true));
}

function openSubtaskEdit(el) {
  const [id, subId] = el.dataset.tsubedit.split("|");
  const item = todos.find(it => it.id === id);
  const sub = item && (item.subtasks || []).find(s => s.id === subId);
  if (!sub) return;
  el.dataset.editing = "1";
  editorOpen = true;
  const host = el.closest("[data-tid]");
  if (host) host.draggable = false;
  el.innerHTML = `<input type="text" class="todoSubEditInput" value="${esc(sub.title)}" maxlength="200">`;
  const box = el.querySelector(".todoSubEditInput");
  box.focus();
  box.select();
  let finished = false;
  const finish = save => {
    if (finished) return;
    finished = true;
    editorOpen = false;
    if (host) host.draggable = true;
    const title = box.value.trim();
    if (save && title && title !== sub.title) postTodo({ action: "rename_subtask", id, sub_id: subId, title });
    else renderTodo();
  };
  box.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    else if (e.key === "Escape") { e.preventDefault(); finish(false); }
  });
  box.addEventListener("blur", () => finish(true));
}

// itens de tarefa criados antes da correção da duplicação da OBS (v79)
// guardaram a OBS colada ao fim do detail; se ainda bater certo com a OBS ao
// vivo da linha (todoTaskInfoHtml já a mostra), tira-se daqui para não
// aparecer duas vezes
function dedupeStaleObs(it, detail) {
  if (!detail) return detail;
  const row = taskRowFor(it);
  if (!row) return detail;
  const obsText = String(row[3] === undefined ? "" : row[3]).split("")[1] || "";
  if (!obsText) return detail;
  const marker = `${t("obs_prefix")} ${obsText}`;
  const i = detail.indexOf(marker);
  return i > 0 ? detail.slice(0, i).trim() : detail;
}

// Nota do item. As tarefas do Excel e as CCRs trazem o detalhe da origem (e as
// notas editam-se lá); os itens escritos à mão passam a poder ter a sua.
function todoNoteHtml(it, kanban) {
  const manual = (it.kind || "manual") === "manual";
  const cls = kanban ? "todoCardDetail" : "obs";
  if (!manual) {
    const detail = dedupeStaleObs(it, it.detail);
    return detail ? `<span class="${cls}">${esc(detail)}</span>` : "";
  }
  const body = it.detail ? esc(it.detail) : `<span class="addnote">${t("addnote")}</span>`;
  return `<span class="${cls} todoNote" data-tnote="${esc(it.id)}" title="${t("t_edit_note")}">${body}</span>`;
}

// pin para o quadro de Notas (o grande, com desenhos/caixas) ligado a este
// item — não confundir com todoNoteHtml, que é o textinho de detalhe acima
function todoNoteFlag(it) {
  return notesForTodo(it.id).length
    ? `<button type="button" class="taskNoteFlag" data-todolink="${esc(it.id)}" title="${esc(t("t_open_linked_note"))}">📌</button>`
    : "";
}

function openTodoNote(el) {
  const id = el.dataset.tnote;
  const item = todos.find(it => it.id === id);
  if (!item) return;
  el.dataset.editing = "1";
  editorOpen = true;
  // sem isto o arrasto da linha/cartão rouba a seleção de texto ao editor
  const host = el.closest("[data-tid]");
  if (host) host.draggable = false;
  el.innerHTML =
    `<textarea class="noteText" rows="3" placeholder="${t("ph_note")}">${esc(item.detail || "")}</textarea>\n ` +
    editActions();
  const box = el.querySelector(".noteText");
  box.focus();
  const save = detail => { editorOpen = false; postTodo({ action: "set_detail", id, detail }); };
  el.querySelector(".actSave").addEventListener("click", e => { e.stopPropagation(); save(box.value); });
  el.querySelector(".actClear").addEventListener("click", e => { e.stopPropagation(); save(""); });
  el.querySelector(".actCancel").addEventListener("click", e => {
    e.stopPropagation();
    editorOpen = false;
    renderTodo();
  });
}

function renderTodo() {
  renderJiraSuggestions();
  $("todoModeList").classList.toggle("active", todoLayout === "list");
  $("todoModeKanban").classList.toggle("active", todoLayout === "kanban");
  $("todoBox").classList.toggle("hidden", todoLayout !== "list" || !todos.length);
  $("todoBoardBox").classList.toggle("hidden", todoLayout !== "kanban" || !todos.length);
  $("todoEmpty").classList.toggle("hidden", !!todos.length);
  if (!todos.length) {
    $("todoBody").innerHTML = "";
    $("todoBoard").innerHTML = "";
    refreshItemBox();
    return;
  }

  if (todoLayout === "list") {
    $("todoBody").innerHTML = todos.map(it => {
      const srcCell = srcOf(it)
        ? `<button type="button" class="srcBtn" data-src="${esc(it.id)}" title="${t("t_src")}">↗</button>`
        : "";
      return `<tr draggable="true" class="todoRow${it.done ? " ccr-done" : ""}${todoIsFlagged(it) ? " flagged" : ""}" data-tid="${esc(it.id)}">
    <td class="todoCtl" style="width:1%"><input type="checkbox" data-tgl="${esc(it.id)}"${it.done ? " checked" : ""}></td>
    <td>${todoMySideFlag(it, false)}${kindChip(it.kind)}${todoTitleHtml(it)}${todoSubProgress(it)}${todoNoteFlag(it)}${todoNoteHtml(it, false)}${todoTaskInfoHtml(it)}${todoSubtasksHtml(it)}${todoJiraHtml(it)}</td>
    <td class="todoCtl" style="width:1%">${todoPriorityHtml(it)}</td>
    <td class="todoCtl" style="width:1%">${todoStatusHtml(it)}</td>
    <td class="todoCtl" style="width:1%"><span class="todoTimerCell">${todoTimerHtml(it)}${todoTimerRestartHtml(it)}</span></td>
    <td class="todoCtl" style="width:1%">${srcCell}</td>
    <td class="todoCtl" style="width:1%"><button type="button" class="ccr-x" data-tdel="${esc(it.id)}" title="${t("t_remove")}">✕</button></td>
  </tr>`;
    }).join("");
    refreshItemBox();
    return;
  }

  const byCol = Object.fromEntries(TODO_COLS.map(col => [col, []]));
  todos.forEach(it => byCol[todoColOf(it)].push(it));
  $("todoBoard").innerHTML = TODO_COLS.map(col => {
    const cards = byCol[col].map(it => {
      const srcCell = srcOf(it)
        ? `<button type="button" class="srcBtn" data-src="${esc(it.id)}" title="${t("t_src")}">↗</button>`
        : "";
      return `<article draggable="true" class="todoCard${it.done ? " done" : ""}${todoIsFlagged(it) ? " flagged" : ""}" data-tid="${esc(it.id)}">
    ${todoMySideFlag(it, true)}
    <div class="todoCardTitle">${kindChip(it.kind)}${todoTitleHtml(it)}${todoSubProgress(it)}${todoNoteFlag(it)}</div>
    ${todoNoteHtml(it, true)}
    ${todoTaskInfoHtml(it)}
    ${todoSubtasksHtml(it)}
    ${todoJiraHtml(it)}
    <div class="todoCardMeta">
      ${todoPriorityHtml(it)}
      ${todoStatusHtml(it)}
      <span class="todoTimerCell">${todoTimerHtml(it)}${todoTimerRestartHtml(it)}</span>
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
  refreshItemBox();
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
    // a página do Jira é montada a partir dos `todos`: ligar/desligar uma issue
    // tem de se ver logo (o jira.js é carregado depois deste ficheiro)
    if (typeof renderJiraPage === "function" && (currentView === "jira" || sideView === "jira")) renderJiraPage();
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

// a célula "To Do" tem a OBS colada a seguir (obsHtml) só para a vista da
// tabela — a OBS já aparece à parte e ao vivo via todoTaskInfoHtml, por isso
// não deve entrar aqui: copiá-la tal e qual duplicaria a OBS no item criado
function taskRowDetail(tr) {
  const cell = tr && tr.cells[3] ? tr.cells[3].cloneNode(true) : null;
  if (cell) cell.querySelectorAll(".obs, .addnote").forEach(n => n.remove());
  return (cell ? cell.innerText : "").trim().slice(0, 300);
}

function addTodoFromTaskRow(btn) {
  const tr = btn.closest("tr");
  const ri = +btn.dataset.todoadd;
  if (!tr || Number.isNaN(ri)) return;
  const fn = tr.cells[0] ? tr.cells[0].innerText.split("\n")[0].trim() : "";
  if (!fn) return;
  const detail = taskRowDetail(tr);
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

// dir = 1 sobe a prioridade, dir = -1 desce
function setTodoPriorityById(id, dir = 1) {
  const item = todos.find(it => it.id === id);
  if (!item) return;
  postTodo({ action: "set_priority", id, priority: todoStepPriority(item, dir < 0 ? -1 : 1) });
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

// tratadores partilhados pela lista, pelo Kanban e pela caixa de detalhe
function todoItemChange(e) {
  const cb = e.target.closest("input[data-tgl]");
  if (cb) postTodo({ action: "toggle", id: cb.dataset.tgl });
  const sub = e.target.closest("input[data-tsubtgl]");
  if (sub) {
    const [id, subId] = sub.dataset.tsubtgl.split("|");
    postTodo({ action: "toggle_subtask", id, sub_id: subId });
  }
}

function todoItemTap(e) {
  const timer = e.target.closest("[data-ttimer]");
  if (timer) { postTodo({ action: "toggle_timer", id: timer.dataset.ttimer }); return; }
  const reset = e.target.closest("[data-treset]");
  if (reset) { postTodo({ action: "restart_timer", id: reset.dataset.treset }); return; }
  const status = e.target.closest("[data-tocol]");
  if (status) { setTodoStatusById(status.dataset.tocol); return; }
  const prio = e.target.closest("[data-tprio]");
  if (prio) { setTodoPriorityById(prio.dataset.tprio); return; }
  const subDel = e.target.closest("[data-tsubdel]");
  if (subDel) {
    const [id, subId] = subDel.dataset.tsubdel.split("|");
    postTodo({ action: "delete_subtask", id, sub_id: subId });
    return;
  }
  const jiraUnlink = e.target.closest("[data-tjiraunlink]");
  if (jiraUnlink) {
    const [id, key] = jiraUnlink.dataset.tjiraunlink.split("|");
    const item = todos.find(it => it.id === id);
    const issue = item && (item.jiraIssues || []).find(j => j.key === key);
    postTodo({ action: "jira_unlink", id, key }).then(ok => {
      if (ok) jiraKeepAsManualIfOrphaned(key, issue);
    });
    return;
  }
  const jiraLog = e.target.closest("[data-tjiralog]");
  if (jiraLog) {
    const [id, key] = jiraLog.dataset.tjiralog.split("|");
    const item = todos.find(it => it.id === id);
    const issue = item && (item.jiraIssues || []).find(j => j.key === key);
    openJiraLogModal(id, key, issue && issue.summary);
    return;
  }
  const jiraGoto = e.target.closest("[data-tjiragoto]");
  if (jiraGoto) { jiraGotoIssue(jiraGoto.dataset.tjiragoto); return; }
  const del = e.target.closest("[data-tdel]");
  if (del) { postTodo({ action: "delete", id: del.dataset.tdel }); return; }
  const src = e.target.closest("[data-src]");
  if (src) { revealSource(srcOf(todos.find(it => it.id === src.dataset.src))); return; }
  const titleEl = e.target.closest("[data-ttitle]");
  if (titleEl && !titleEl.dataset.editing) { openTodoTitle(titleEl); return; }
  const subEdit = e.target.closest("[data-tsubedit]");
  if (subEdit && !subEdit.dataset.editing) { openSubtaskEdit(subEdit); return; }
  const note = e.target.closest("[data-tnote]");
  if (note && !note.dataset.editing) { openTodoNote(note); return; }
  const link = e.target.closest("[data-todolink]");
  if (link) openTodoLinkedNote(link.dataset.todolink);
}

function todoItemContext(e) {
  const prio = e.target.closest("[data-tprio]");
  if (prio) {
    e.preventDefault();
    setTodoPriorityById(prio.dataset.tprio, -1);
    return;
  }
  const status = e.target.closest("[data-tocol]");
  if (!status) return;
  e.preventDefault();
  setTodoStatusById(status.dataset.tocol, -1);
}

$("todoBody").addEventListener("change", todoItemChange);
$("todoBody").addEventListener("click", todoItemTap);
$("todoBody").addEventListener("contextmenu", todoItemContext);

// no Kanban não há caixa de "feito" (a coluna Concluído já diz isso); só as
// subtarefas continuam a ter checkbox
$("todoBoard").addEventListener("change", todoItemChange);
$("todoBoard").addEventListener("click", todoItemTap);
$("todoBoard").addEventListener("contextmenu", todoItemContext);

// nova subtarefa: Enter no campo do fim da checklist
function handleSubtaskKeydown(e) {
  const input = e.target.closest(".todoSubInput");
  if (!input || e.key !== "Enter") return;
  e.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  postTodo({ action: "add_subtask", id: input.dataset.tsubnew, title });
  input.value = "";
}
$("todoBody").addEventListener("keydown", handleSubtaskKeydown);
$("todoBoard").addEventListener("keydown", handleSubtaskKeydown);

// enquanto se escreve: o arrasto da linha/cartão rouba a seleção de texto e o
// re-render dos 15 s apagaria o que já estava escrito
function todoSubFocusIn(e) {
  const input = e.target.closest(".todoSubInput, .todoJiraLinkInput");
  if (!input) return;
  editorOpen = true;
  const host = input.closest("[data-tid]");
  if (host) host.draggable = false;
}
function todoSubFocusOut(e) {
  const input = e.target.closest(".todoSubInput, .todoJiraLinkInput");
  if (!input) return;
  editorOpen = false;
  const host = input.closest("[data-tid]");
  if (host) host.draggable = true;
}
$("todoBody").addEventListener("focusin", todoSubFocusIn);
$("todoBody").addEventListener("focusout", todoSubFocusOut);
$("todoBoard").addEventListener("focusin", todoSubFocusIn);
$("todoBoard").addEventListener("focusout", todoSubFocusOut);

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
  const detail = taskRowDetail(tr);
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
  if ((currentView === "todo" || sideView === "todo") && !editorOpen && hasTodoRunningTimer()) renderTodo();
}, 15000);
