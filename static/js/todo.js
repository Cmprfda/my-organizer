// My Organizer — TODO list pessoal

// ---------- TODO list ----------
let todos = [];
const TODO_LAYOUT_KEY = "bsp-tracker-todo-layout";
// Colunas de sempre do quadro: têm significado para a app (o cronómetro só
// corre em "inprogress" e "done" fecha o item), por isso nunca se apagam — só
// se escondem.
const TODO_BUILTIN_COLS = ["todo", "inprogress", "review", "done"];
const TODO_COL_LABEL = {
  todo: "todo_col_todo",
  inprogress: "todo_col_inprogress",
  review: "todo_col_review",
  done: "todo_col_done",
};
// Que colunas o quadro mostra, em que ordem, com que nome e quais estão
// escondidas. É uma preferência de apresentação de quem está a ver (como o
// TODO_LAYOUT_KEY acima), por isso vive no browser e não no servidor; o que o
// servidor guarda é só a coluna de cada item (campo `col`), que aceita qualquer
// coluna criada aqui (ver cswaios/todos.py).
const TODO_COLS_KEY = "bsp-tracker-todo-cols";
const TODO_COL_ID_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/;
const TODO_COL_MAX = 10;        // colunas que cabem no quadro
const TODO_COL_NAME_MAX = 24;   // caracteres do nome de uma coluna criada aqui
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
// o que o servidor fez com o último pedido ("added"/"exists"/"linked"), para o
// aviso mostrado ao utilizador
let lastTodoResult = null;
// item cuja checklist está em modo de reordenação (só um de cada vez); e a
// subtarefa que está a ser arrastada nesse modo
let subtasksEditingId = null;
let subtaskDrag = null;

// ---------- colunas do quadro (esconder / criar / ordenar) ----------
// nome legível a partir do id: uma coluna pode chegar aqui só pelo campo `col`
// de um cartão (foi criada noutro browser/janela) e aí o id é tudo o que se sabe
function todoColNiceId(id) {
  const s = String(id || "").replace(/[-_]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : String(id || "");
}

// os acentos são tirados antes de cortar o resto ("À espera" -> "a-espera" e
// não "-espera"), para o id continuar a lembrar o nome escolhido
const TODO_COL_MARKS = new RegExp(
  "[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");

function todoColSlug(label) {
  const base = String(label || "")
    .normalize("NFD").replace(TODO_COL_MARKS, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "").slice(0, TODO_COL_NAME_MAX).replace(/-+$/, "");
  return base || "col";
}

// { order: [id…], hidden: [id…], names: { id: "nome" } }
function sanitizeTodoColConf(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const conf = { order: [], hidden: [], names: {} };
  (Array.isArray(src.order) ? src.order : []).forEach(id => {
    const key = String(id || "").trim().toLowerCase();
    if (!TODO_COL_ID_RE.test(key) || conf.order.includes(key)) return;
    conf.order.push(key);
  });
  // as colunas de sempre existem sempre; as que faltarem entram antes de
  // "Concluído" (que é o fim do fluxo)
  TODO_BUILTIN_COLS.forEach(id => {
    if (conf.order.includes(id)) return;
    const doneAt = conf.order.indexOf("done");
    if (id !== "done" && doneAt >= 0) conf.order.splice(doneAt, 0, id);
    else conf.order.push(id);
  });
  const names = src.names && typeof src.names === "object" ? src.names : {};
  conf.order.forEach(id => {
    if (TODO_BUILTIN_COLS.includes(id)) return;
    conf.names[id] = String(names[id] || "").trim().slice(0, TODO_COL_NAME_MAX) || todoColNiceId(id);
  });
  conf.hidden = (Array.isArray(src.hidden) ? src.hidden : [])
    .map(id => String(id || "").trim().toLowerCase())
    .filter((id, i, all) => conf.order.includes(id) && all.indexOf(id) === i);
  // nunca esconder tudo: sem colunas à vista o quadro ficava em branco
  if (conf.hidden.length >= conf.order.length) {
    conf.hidden = conf.hidden.filter(id => id !== conf.order[0]);
  }
  return conf;
}

function loadTodoColConf() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(TODO_COLS_KEY) || "null"); } catch { raw = null; }
  return sanitizeTodoColConf(raw);
}

let todoColConf = loadTodoColConf();

function saveTodoColConf() {
  todoColConf = sanitizeTodoColConf(todoColConf);
  try { localStorage.setItem(TODO_COLS_KEY, JSON.stringify(todoColConf)); } catch { /* sem espaço/modo privado */ }
}

function todoColHidden(id) { return todoColConf.hidden.includes(id); }
function todoVisibleColIds() { return todoColConf.order.filter(id => !todoColHidden(id)); }
function todoColIsCustom(id) { return !TODO_BUILTIN_COLS.includes(id); }

function todoColLabel(id) {
  if (TODO_BUILTIN_COLS.includes(id)) return t(TODO_COL_LABEL[id]);
  return todoColConf.names[id] || todoColNiceId(id);
}

// quantos cartões estão MESMO nesta coluna (não onde são desenhados)
function todoColCount(id) {
  return todos.filter(it => todoColOf(it) === id).length;
}

// Um cartão pode trazer uma coluna que este browser ainda não conhece (criada
// noutra janela, ou as preferências daqui foram limpas): adota-se a coluna em
// vez de deixar o cartão sem sítio.
function adoptTodoCols() {
  let added = false;
  todos.forEach(it => {
    const col = String((it && it.col) || "").trim().toLowerCase();
    if (!TODO_COL_ID_RE.test(col) || todoColConf.order.includes(col)) return;
    if (todoColConf.order.length >= TODO_COL_MAX) return;
    const doneAt = todoColConf.order.indexOf("done");
    if (doneAt >= 0) todoColConf.order.splice(doneAt, 0, col);
    else todoColConf.order.push(col);
    todoColConf.names[col] = todoColNiceId(col);
    added = true;
  });
  if (added) saveTodoColConf();
}

function todoColOf(it) {
  const col = String((it && it.col) || "").toLowerCase();
  if (todoColConf.order.includes(col)) return col;
  return it && it.done ? "done" : "todo";
}

// Coluna visível mais próxima de `col`: a própria se estiver à vista, senão a
// primeira à esquerda e, em último recurso, à direita. Serve para os cartões de
// uma coluna escondida continuarem no quadro em vez de desaparecerem.
function todoVisibleColFor(col) {
  const order = todoColConf.order;
  if (order.includes(col) && !todoColHidden(col)) return col;
  const at = order.indexOf(col);
  for (let i = at - 1; i >= 0; i--) if (!todoColHidden(order[i])) return order[i];
  for (let i = at + 1; i < order.length; i++) if (!todoColHidden(order[i])) return order[i];
  return todoVisibleColIds()[0] || "todo";
}

// coluna em que o cartão é desenhado (a sua, ou a de recurso se estiver escondida)
function todoLaneOf(it) {
  return todoVisibleColFor(todoColOf(it));
}

// coluna de entrada de um cartão novo: "Por fazer" quando está à vista
function todoDefaultCol() {
  const vis = todoVisibleColIds();
  if (vis.includes("todo")) return "todo";
  return vis.find(id => id !== "done") || vis[0] || "todo";
}

function setTodoColHidden(id, hidden) {
  if (!todoColConf.order.includes(id)) return false;
  if (hidden) {
    if (todoVisibleColIds().length <= 1) { toast(t("todo_col_last"), "err"); return false; }
    if (!todoColConf.hidden.includes(id)) todoColConf.hidden.push(id);
  } else {
    todoColConf.hidden = todoColConf.hidden.filter(x => x !== id);
  }
  saveTodoColConf();
  return true;
}

function moveTodoCol(id, dir) {
  const order = todoColConf.order;
  const at = order.indexOf(id);
  const to = at + (dir < 0 ? -1 : 1);
  if (at < 0 || to < 0 || to >= order.length) return false;
  order.splice(to, 0, order.splice(at, 1)[0]);
  saveTodoColConf();
  return true;
}

function todoColNameTaken(name, exceptId) {
  const wanted = String(name).trim().toLowerCase();
  return todoColConf.order.some(id => id !== exceptId && todoColLabel(id).toLowerCase() === wanted);
}

function addTodoCol(label) {
  const name = String(label || "").trim().slice(0, TODO_COL_NAME_MAX);
  if (!name) return false;
  if (todoColConf.order.length >= TODO_COL_MAX) { toast(tf("todo_col_max", TODO_COL_MAX), "err"); return false; }
  if (todoColNameTaken(name, null)) { toast(t("todo_col_dup"), "err"); return false; }
  let id = todoColSlug(name);
  for (let i = 2; todoColConf.order.includes(id) && i < 100; i++) {
    id = `${todoColSlug(name).slice(0, 21)}-${i}`;
  }
  if (todoColConf.order.includes(id)) return false;
  // entra antes de "Concluído": as colunas novas ("à espera", "pendente") são
  // passos do meio do fluxo, não o fim dele
  const doneAt = todoColConf.order.indexOf("done");
  if (doneAt >= 0) todoColConf.order.splice(doneAt, 0, id);
  else todoColConf.order.push(id);
  todoColConf.names[id] = name;
  saveTodoColConf();
  toast(tf("todo_col_added", name), "ok");
  return true;
}

function renameTodoCol(id, label) {
  if (!todoColIsCustom(id) || !todoColConf.order.includes(id)) return false;
  const name = String(label || "").trim().slice(0, TODO_COL_NAME_MAX);
  if (!name || name === todoColLabel(id)) return false;
  if (todoColNameTaken(name, id)) { toast(t("todo_col_dup"), "err"); return false; }
  todoColConf.names[id] = name;
  saveTodoColConf();
  return true;
}

// para onde vão os cartões de uma coluna que está a ser apagada: a coluna
// visível mais próxima das que ficam
function todoColDelTarget(id) {
  const order = todoColConf.order;
  const left = order.slice(0, Math.max(0, order.indexOf(id)))
    .filter(x => x !== id && !todoColHidden(x)).pop();
  return left || todoVisibleColIds().find(x => x !== id) || "todo";
}

// Apagar uma coluna criada aqui: os cartões mudam de coluna PRIMEIRO (no
// servidor), só depois a coluna desaparece — se o servidor recusar, a coluna
// fica e nenhum cartão se perde.
async function deleteTodoCol(id) {
  if (!todoColIsCustom(id) || !todoColConf.order.includes(id)) return;
  const label = todoColLabel(id);
  const dest = todoColDelTarget(id);
  const moving = todos.filter(it => todoColOf(it) === id);
  closeTodoColsPop();
  for (const it of moving) {
    if (!await postTodo({ action: "set_col", id: it.id, col: dest })) return;
  }
  todoColConf.order = todoColConf.order.filter(x => x !== id);
  todoColConf.hidden = todoColConf.hidden.filter(x => x !== id);
  delete todoColConf.names[id];
  saveTodoColConf();
  renderTodo();
  toast(tf("todo_col_deleted", label), "ok");
}

function setTodoLayout(layout) {
  todoLayout = layout === "kanban" ? "kanban" : "list";
  localStorage.setItem(TODO_LAYOUT_KEY, todoLayout);
  closeTodoColsPop();
  renderTodo();
}

// A etiqueta de uma origem do Excel leva o nome do livro de onde a linha veio
// (ref.workbook). Os itens criados antes de haver vários livros abertos não o
// têm — nesses fica o "Excel" de sempre.
function kindChip(kind, ref) {
  if (kind === "task") {
    const livro = String((ref && ref.workbook) || "").trim();
    return `<span class="chip done" style="opacity:1"${livro ? ` title="${esc(livro)}"` : ""}>` +
      `${esc(livro || "Excel")}</span> `;
  }
  if (kind === "ccr") return `<span class="chip" style="opacity:1;background:var(--accent-soft);color:var(--accent)">CCR</span> `;
  return "";
}

// Todas as origens do item: a principal (kind/ref) e as que lhe foram ligadas
// por serem o mesmo trabalho vindo de outro lado (Excel + CCR + escrito à mão).
function todoSources(it) {
  const out = [{ kind: (it && it.kind) || "manual", title: (it && it.title) || "", ref: (it && it.ref) || {} }];
  ((it && it.links) || []).forEach(l => {
    if (l && l.kind) out.push({ kind: l.kind, title: l.title || "", ref: l.ref || {} });
  });
  return out;
}

// uma etiqueta por origem, sem repetir. Duas linhas do Excel em livros
// diferentes são duas etiquetas diferentes (o nome do livro faz parte dela).
function todoKindChips(it) {
  const seen = new Map();
  todoSources(it).forEach(src => {
    const chave = `${src.kind}||${((src.ref || {}).workbook) || ""}`;
    if (!seen.has(chave)) seen.set(chave, src);
  });
  return [...seen.values()].map(src => kindChip(src.kind, src.ref)).join("");
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

// ---------- cronómetro -> esforço no Jira ----------
// O cronómetro conta o tempo e o Jira quer o mesmo tempo registado: o que falta
// é a ponte. `jiraLoggedFromTimerMs` (ver todos.py) diz quanto deste cronómetro
// já foi para lá; o resto é o que o registo de esforço propõe.
const todoJiraIssue = it =>
  (Array.isArray(it && it.jiraIssues) ? it.jiraIssues : [])[0] || null;

function todoUnloggedMs(it) {
  if (!it) return 0;
  return Math.max(0, todoLiveElapsed(it) - Math.max(0, +it.jiraLoggedFromTimerMs || 0));
}

// abaixo de um minuto não há nada que valha a pena registar (o Jira também não
// aceita menos do que isso)
const TODO_LOG_MIN_MS = 60000;

function todoCanLogTime(it) {
  return !!todoJiraIssue(it) && todoUnloggedMs(it) >= TODO_LOG_MIN_MS;
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

// o cronómetro pode ser reiniciado em qualquer coluna (incluindo as criadas
// aqui): o que conta é o item já ter tempo contado
function todoTimerRestartHtml(it) {
  const hasTime = (it.timer_started != null) || ((+it.elapsed_ms || 0) > 0);
  if (!hasTime) return "";
  return `<button type="button" class="todoTimerReset" data-treset="${esc(it.id)}" title="${t("todo_timer_restart")}">↺</button>`;
}

// o botão de estado só passeia pelas colunas à vista; a coluna atual entra
// sempre na volta, mesmo escondida, para se poder tirar o cartão de lá
function todoCycleCols(current) {
  const list = todoColConf.order.filter(id => !todoColHidden(id) || id === current);
  return list.length ? list : [current || "todo"];
}

function todoStepCol(it, dir) {
  const col = todoColOf(it);
  const list = todoCycleCols(col);
  const idx = Math.max(0, list.indexOf(col));
  return list[(idx + dir + list.length) % list.length];
}

function todoNextCol(it) { return todoStepCol(it, 1); }

function todoPrevCol(it) { return todoStepCol(it, -1); }

function todoStatusHtml(it) {
  const col = todoColOf(it);
  const hidden = todoColHidden(col);
  const tip = `${t("todo_status_click")}: ${todoColLabel(todoNextCol(it))}\n` +
    `${t("todo_status_back")}: ${todoColLabel(todoPrevCol(it))}` +
    (hidden ? `\n${t("todo_col_hidden_here")}` : "");
  return `<button type="button" class="todoStatusBtn${hidden ? " hiddenCol" : ""}" data-tocol="${esc(it.id)}" title="${esc(tip)}">${esc(todoColLabel(col))}</button>`;
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
function srcOfSource(src) {
  if (!src) return null;
  const ref = src.ref || {};
  if (src.kind === "ccr") {
    const id = ref.ccr || (String(src.title).match(/\d+/) || [])[0];
    return id ? { view: "ccrs", ccr: String(id) } : null;
  }
  if (src.kind === "task") {
    const fn = ref.fn || String(src.title).trim();
    // `workbook` diz de que livro veio a linha: com vários abertos, é o que
    // permite saltar para o separador certo (ver revealSource em split.js)
    return fn ? {
      view: "excel", fn, todo: ref.todo || "", sheet: ref.sheet || "",
      workbook: ref.workbook || "",
    } : null;
  }
  return null;
}

// origem principal do botão ↗ do item (a 1.ª que sabe para onde ir)
function srcOf(it) {
  if (!it) return null;
  return todoSources(it).map(srcOfSource).find(Boolean) || null;
}

// O servidor corta os textos guardados (título e origem) a 200 caracteres; sem
// aplicar o mesmo corte aqui, um "o que fazer" longo nunca batia certo com o
// item já guardado e o botão "+ TODO" continuava à vista.
// O corte do servidor é feito DEPOIS de limpar os espaços das pontas, por isso
// o valor guardado pode acabar em espaço (quando o caractere 200 do original é
// um espaço). Aí o valor lido de volta perdia esse espaço nesta função e deixava
// de bater certo com o valor recém-calculado da linha do Excel — o "+ TODO"
// ficava à vista para sempre nessa linha. Limpar as pontas outra vez depois do
// corte torna as duas contas iguais.
function todoText(value) {
  return String(value == null ? "" : value).trim().slice(0, 200).trim();
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
    return todoSources(it).some(src => {
      if ((src.kind || "manual") !== kind || todoText(src.title) !== wanted) return false;
      const got = src.ref || {};
      return keys.every(k => !got[k] || todoText(got[k]) === todoText(want[k]));
    });
  });
}

// ---------- info da linha do Excel dentro do item do TODO ----------
// O item guarda título e "O que fazer" só como reserva (offline/livro
// fechado); com a linha por perto, título/detalhe/papel/estados/execução são
// todos lidos do Excel a cada render, para acompanharem a tarefa mesmo que a
// célula mude depois de o TODO ter sido criado (ver liveTaskContent).
// O índice é recalculado quando chegam dados novos.
// O índice cobre TODOS os livros abertos, não só o que está à vista: um item
// ligado a uma linha de outro livro tem de continuar a mostrar o estado dela.
// `taskIndexByBook` guarda um índice por livro (o nome vem em ref.workbook) e
// `taskIndexMap` junta-os todos, para os itens antigos, que não sabem o livro.
let taskIndexStamp = null, taskIndexData = null, taskIndexMap = null, taskIndexByBook = null;
let customIndexByBook = null;

// chave de uma linha do Excel nos índices daqui: função + "o que fazer". Os
// dois valores passam pelo mesmo corte que o servidor faz à origem guardada no
// item (normalize_ref, cswaios/todos.py), senão uma linha com um "To Do" longo
// nunca voltava a bater certo com o item que dela nasceu — a folha traz a célula
// inteira, o item só os primeiros 200 caracteres.
function rowKeyOfTask(fn, todo) {
  return `${todoText(fn)}\u001f${todoText(todo)}`;
}

// procura a linha de um item num índice por livro (o das linhas ao vivo ou o da
// vista mapeada): primeiro no livro de onde o item veio, porque com vários
// livros abertos a mesma função noutro livro dava a linha errada; sem livro
// guardado (itens antigos) procura-se em todos. Sem chave exata aceita-se a 1.ª
// linha com a mesma função, para os itens guardados antes de a chave incluir o
// "o que fazer".
function lookupTaskRow(byBook, it) {
  const src = it && todoSources(it).find(s => s.kind === "task");
  if (!src || !byBook || !byBook.size) return null;
  const ref = src.ref || {};
  const fn = ref.fn || String(src.title).trim();
  const own = ref.workbook ? byBook.get(ref.workbook) : null;
  const maps = own ? [own] : [...byBook.values()];
  const key = rowKeyOfTask(fn, ref.todo);
  for (const map of maps) {
    const exact = map.get(key);
    if (exact) return exact;
  }
  const prefix = rowKeyOfTask(fn, "");
  for (const map of maps) {
    for (const [k, row] of map) if (k.startsWith(prefix)) return row;
  }
  return null;
}

function taskIndex() {
  // só se refaz quando o que está lido em memória muda. O que se compara é a
  // IDENTIDADE do objeto de cada leitura (o loadTab guarda sempre um objeto
  // novo, vindo do /api/tasks — ver tasks.js), e já não o `digest` do conteúdo:
  // o digest só cobre as linhas da folha (result["rows"], cswaios/tasks.py) e
  // por isso NÃO mudava com uma alteração local numa categoria da vista mapeada
  // — essa vive só no cell_view (ver build_cell_categories) — nem com uma nota
  // de execução. Com o índice preso ao digest, o cartão do TODO continuava a
  // mostrar o estado de antes da alteração (ex.: "In progress" no cartão e
  // "Ready for review ✎" na tabela) até a folha mudar mesmo.
  const lidos = workbookTabs.map(x => x.lastData);
  const stamp = `#${showAll ? 1 : 0}#${PERSON}`;
  const igual = taskIndexData && taskIndexData.length === lidos.length
    && lidos.every((d, i) => d === taskIndexData[i]);
  if (igual && stamp === taskIndexStamp && taskIndexMap) return taskIndexMap;
  taskIndexData = lidos;
  taskIndexStamp = stamp;
  taskIndexMap = new Map();
  taskIndexByBook = new Map();
  customIndexByBook = new Map();
  workbookTabs.forEach(tab => {
    const data = tab.lastData;
    if (!data || data.error) return;
    // linha ao vivo: o row_meta traz o valor ATUAL das colunas fixas do tracker
    // (meta.cur, ver read_sheet em cswaios/tasks.py), por isso serve qualquer
    // folha do tracker, tenha ou não vista mapeada por cima
    const doLivro = new Map();
    (data.row_meta || []).forEach(meta => {
      if (!meta) return;
      const key = rowKeyOfTask(meta.fn, meta.todo);
      if (!doLivro.has(key)) doLivro.set(key, { meta, data });
      if (!taskIndexMap.has(key)) taskIndexMap.set(key, { meta, data });
    });
    taskIndexByBook.set(tab.name || "", doLivro);
    const custom = buildCustomCompact(data);
    if (custom) {
      // o "To Do" desta folha pode estar absorvido por uma categoria composta
      // (ver buildCustomCompact): aí o bloco da tarefa já o mostra e a nota do
      // item não o repete (ver todoNoteHtml). Mapeado à parte, não: esse fica
      // de fora do bloco (CUSTOM_INFO_SKIP) e aparece só na nota.
      const catHeaders = (data.cell_view && data.cell_view.headers) || [];
      const showsTodo = loadCompoundCats(data)
        .filter(cc => cc.columns.every(name => catHeaders.includes(name)))
        .some(cc => cc.columns.some(name => norm(name) === norm("To Do")));
      const doLivroCustom = new Map();
      (data.row_meta || []).forEach((meta, ri) => {
        const key = rowKeyOfTask(meta && meta.fn, meta && meta.todo);
        if (!doLivroCustom.has(key)) {
          doLivroCustom.set(key, {
            row: custom.rows[ri], headers: custom.headers,
            compoundIdx: custom.compoundIdx, execIdx: custom.execIdx, showsTodo,
          });
        }
      });
      customIndexByBook.set(tab.name || "", doLivroCustom);
    }
  });
  return taskIndexMap;
}

function customRowFor(it) {
  taskIndex();
  return lookupTaskRow(customIndexByBook, it);
}

function taskRowFor(it) {
  taskIndex();
  return lookupTaskRow(taskIndexByBook, it);
}

// título e "o que fazer" ao vivo, lidos da linha atual da folha (meta.cur, já
// com qualquer alteração local aplicada): é isto que faz o item acompanhar a
// tarefa mesmo que a célula mude depois de o TODO ter sido criado. null quando
// não há linha (livro fechado, item de CCR) ou quando a folha não tem estas
// colunas — aí quem chama usa o instantâneo antigo (it.title/it.detail).
function liveTaskContent(it) {
  const row = taskRowFor(it);
  const cur = (row && row.meta && row.meta.cur) || null;
  if (!cur || (cur["Function/TC"] === undefined && cur["To Do"] === undefined)) return null;
  return {
    title: String(cur["Function/TC"] || "").trim() || it.title,
    detail: String(cur["To Do"] || "").trim().slice(0, 300),
  };
}

// de que lado está a bola numa vertente (TC/TP) da linha, pela regra de sempre:
// um estado de review está do lado do reviewer, os outros do lado do autor.
// Serve só para o aviso do todoMySideFlag, aqui em baixo.
function taskSideOf(role, status) {
  const s = norm(status);
  if (!s || s === "n/a" || /(remov|cancel)/.test(s)) return null;
  if (/(done|conclu|closed|complet|finaliz)/.test(s)) return "done";
  const reviewing = /review/.test(s);
  return role === "reviewer" ? (reviewing ? "my" : "other") : (reviewing ? "other" : "my");
}

// avisa quando marcaste este item como Concluído mas a tarefa do Excel por
// trás afinal ainda está do teu lado (ex.: voltou para "Ready for rework")
// — só faz sentido como aviso quando já achavas que estava feito. Os estados
// que são mesmo teus (por vertente e por papel) vêm do servidor em
// meta.todo_sync_role, já sem as vertentes N/A.
function todoIsFlagged(it) {
  if (todoColOf(it) !== "done") return false;
  const row = taskRowFor(it);
  const roles = (row && row.meta && row.meta.todo_sync_role) || {};
  return ["author", "reviewer"].some(role =>
    (roles[role] || []).some(s => taskSideOf(role, s) === "my"));
}

function todoMySideFlag(it, corner) {
  if (!todoIsFlagged(it)) return "";
  const cls = corner ? "todoCardFlag" : "todoRowFlag";
  return `<span class="${cls}" title="${esc(t("side_my"))}">🚩 ${esc(t("side_my"))}</span>`;
}

// categorias da vista mapeada a medida ja mostradas como titulo/nota do item
// (ver todoTitleHtml/todoNoteHtml) - repeti-las aqui seria mostrar a mesma
// informacao duas vezes
const CUSTOM_INFO_SKIP = new Set([norm("Function/TC"), norm("To Do")]);

function todoCustomTaskInfoHtml(entry) {
  const { row, headers, compoundIdx, execIdx } = entry;
  const parts = headers.map((h, i) => {
    if (i === execIdx || CUSTOM_INFO_SKIP.has(norm(h))) return "";
    const v = row[i];
    if (v === undefined || v === null || v === "") return "";
    if (compoundIdx && compoundIdx.has(i)) return `<div class="todoTaskInfoCat">${v}</div>`;
    return `<span class="role">${esc(h)}: ${esc(String(v))}</span>`;
  });
  if (execIdx >= 0) {
    const meta = row[headers.length] || {};
    const { inner, title } = execCellHtml(meta);
    parts.push(`<div class="execCell" data-xlrow="${esc(meta.xlrow || "")}" title="${esc(title)}">${inner}</div>`);
  }
  return `<div class="todoTaskInfo">${parts.filter(Boolean).join("")}</div>`;
}

// papéis da linha, pelos nomes reais das colunas do tracker — é assim que a
// folha lhes chama e é assim que a vista mapeada os mostra
const TASK_ROLE_COLS = [["author_tc", "Author TC"], ["reviewer_tc", "Reviewer TC"],
  ["author_tp", "Author TP"], ["reviewer_tp", "Reviewer TP"]];

function todoTaskInfoHtml(it) {
  const custom = customRowFor(it);
  if (custom) return todoCustomTaskInfoHtml(custom);
  const row = taskRowFor(it);
  const meta = (row && row.meta) || null;
  const cur = (meta && meta.cur) || {};
  const people = (meta && meta.people) || {};
  // sem linha, ou folha sem nada do tracker e sem vista mapeada: não há o que
  // mostrar (o item fica só com o título/nota que guardou)
  if (!meta || (!Object.keys(cur).length && !TASK_ROLE_COLS.some(([k]) => people[k]))) return "";
  const parts = [];
  // "N/A" na coluna do autor/reviewer quer dizer "ninguém", não um nome
  TASK_ROLE_COLS.forEach(([key, label]) => {
    const nome = String(people[key] || "").trim();
    if (nome && norm(nome) !== "n/a") parts.push(`<span class="role">${esc(label)}: ${esc(nome)}</span>`);
  });
  // ambos os estados aplicáveis, cada um com a vertente à frente
  [["Status TC", "TC"], ["Status TP", "TP"]].forEach(([col, tag]) => {
    const v = String(cur[col] || "").trim();
    if (v && norm(v) !== "n/a") parts.push(badgeHtml(`${tag}: ${v}`, col, meta));
  });
  parts.push(obsHtml(String(cur["OBS"] || "").trim(), meta));
  const { inner, title } = execCellHtml(meta);
  parts.push(`<div class="execCell" data-xlrow="${esc(meta.xlrow || "")}" title="${esc(title)}">${inner}</div>`);
  return `<div class="todoTaskInfo">${parts.filter(Boolean).join("")}</div>`;
}

// progresso das subtarefas (ex.: "2/5"), só aparece quando existem subtarefas
function todoSubProgress(it) {
  const subs = Array.isArray(it.subtasks) ? it.subtasks : [];
  return subs.length ? `<span class="todoSubProgress">${subs.filter(s => s.done).length}/${subs.length}</span>` : "";
}

// checklist de subtarefas + campo para adicionar mais uma (Enter submete).
// Com o modo de reordenação ligado (só faz sentido com mais do que um passo)
// cada linha ganha uma pega e passa a poder arrastar-se dentro da lista.
function todoSubtasksHtml(it) {
  const subs = Array.isArray(it.subtasks) ? it.subtasks : [];
  const editing = subtasksEditingId === it.id && subs.length > 1;
  const rows = subs.map(s => `<li class="todoSubItem${s.done ? " done" : ""}" data-tsubid="${esc(s.id)}"${editing ? ' draggable="true"' : ""}>
    ${editing ? '<span class="todoSubHandle">⠿</span>' : ""}
    <input type="checkbox" data-tsubtgl="${esc(it.id)}|${esc(s.id)}"${s.done ? " checked" : ""}>
    <span class="todoSubTitle" data-tsubedit="${esc(it.id)}|${esc(s.id)}" title="${t("t_edit_title")}">${esc(s.title)}</span>
    <button type="button" class="ccr-x" data-tsubdel="${esc(it.id)}|${esc(s.id)}" title="${t("t_remove")}">✕</button>
  </li>`).join("");
  const mode = subs.length > 1
    ? `<button type="button" class="ccr-x todoSubMode${editing ? " on" : ""}" data-tsubmode="${esc(it.id)}" title="${t(editing ? "t_reorder_done" : "t_reorder_subs")}">${editing ? "✓" : "⇅"}</button>`
    : "";
  return `<ul class="todoSubList${editing ? " editingSubs" : ""}" data-tsublist="${esc(it.id)}">${rows}<li class="todoSubAddRow">` +
    `<input type="text" class="todoSubInput" data-tsubnew="${esc(it.id)}" placeholder="${t("ph_subtask")}">${mode}</li></ul>`;
}

function toggleSubtasksEdit(id) {
  subtasksEditingId = subtasksEditingId === id ? null : id;
  subtaskDrag = null;
  renderTodo();
}

// issue do Jira ligada ao item (no máximo uma): só o código, clicável para
// abrir no Jira, + ação de registar mais tempo. Nada da issue em si (resumo,
// epic, esforço registado) — isso vê-se na página Jira, aqui só atrapalhava o
// item. O resumo fica no tooltip do código, à mão de quem o quiser confirmar.
// Sem issue ligada mostra o campo para ligar uma, com sugestões das chaves já
// conhecidas da app.
function todoJiraHtml(it) {
  const issue = (Array.isArray(it.jiraIssues) ? it.jiraIssues : [])[0];
  if (!issue) {
    return `<ul class="todoJiraList"><li class="todoJiraAddRow">` +
      `<input type="text" class="todoJiraLinkInput" list="jiraSuggestions" data-tjiranew="${esc(it.id)}" placeholder="${t("jira_link_ph")}"></li></ul>`;
  }
  const label = issue.parentSummary && issue.summary ? `${issue.parentSummary} — ${issue.summary}` : (issue.summary || issue.key);
  // com tempo por registar, o botão do registo de esforço mostra-o: é assim que
  // se percebe que o cronómetro tem algo para levar ao Jira sem abrir nada
  const porRegistar = todoUnloggedMs(it);
  const temPendente = todoCanLogTime(it);
  // aqui o tempo aparece no formato do Jira ("1h 20m"), não no do cronómetro
  // ("01:20"): é este o valor que vai ser registado, e "01:20" lê-se como hora
  const logLabel = temPendente ? `⏱ ${msToJiraTime(porRegistar)}` : "⏱+";
  const logTitle = temPendente
    ? tf("jira_log_pending", msToJiraTime(porRegistar))
    : t("jira_log_action");
  return `<ul class="todoJiraList"><li class="todoJiraItem">
    ${jiraKeyBadgeHtml(issue.key, label)}
    <button type="button" class="mini${temPendente ? " todoJiraLogPending" : ""}" data-tjiralog="${esc(it.id)}|${esc(issue.key)}" title="${esc(logTitle)}">${esc(logLabel)}</button>
    <button type="button" class="srcBtn" data-tjiragoto="${esc(issue.key)}" title="${esc(t("jira_goto_action"))}">↗</button>
    <button type="button" class="ccr-x" data-tjiraunlink="${esc(it.id)}|${esc(issue.key)}" title="${esc(t("t_jira_unlink"))}">✕</button>
  </li></ul>`;
}

// origens ligadas ao item além da principal (o mesmo trabalho aparece no Excel
// e num CCR, por exemplo): uma linha por origem, com o atalho para a ver e o ✕
// para desfazer a ligação
function todoLinksHtml(it) {
  const links = Array.isArray(it.links) ? it.links : [];
  if (!links.length) return "";
  const rows = links.map((l, i) => {
    // as origens só se ligam quando têm o mesmo nome do item: repetir o nome
    // aqui parecia um item duplicado, por isso só se mostra quando difere
    const ref = l.ref || {};
    const label = l.title === it.title ? "" : l.title;
    const tip = `${l.title}${ref.todo ? ` — ${ref.todo}` : ""}`;
    return `<li class="todoLinkItem" title="${esc(tip)}">${kindChip(l.kind, ref)}` +
      (label ? `<span class="todoLinkTitle">${esc(label)}</span>` : "") +
      `<button type="button" class="srcBtn" data-tlinkgo="${esc(it.id)}|${i}" title="${t("t_src")}">↗</button>` +
      `<button type="button" class="ccr-x" data-tlinkdel="${esc(it.id)}|${i}" title="${t("t_link_remove")}">✕</button></li>`;
  }).join("");
  return `<ul class="todoLinkList">${rows}</ul>`;
}

function todoLinkAt(key) {
  const [id, idx] = String(key).split("|");
  const it = todos.find(x => x.id === id);
  return (it && (it.links || [])[+idx]) || null;
}

// título editável só para tarefas criadas na app (as de Excel/CCR mantêm o
// título igual à origem, por isso não são clicáveis aqui)
function todoTitleHtml(it) {
  const manual = (it.kind || "manual") === "manual";
  if (!manual) {
    const live = liveTaskContent(it);
    return esc(live ? live.title : it.title);
  }
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
  // em modo de reordenação o próprio passo é arrastável e roubava a seleção
  const li = el.closest(".todoSubItem");
  if (li) li.draggable = false;
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
    if (li) li.draggable = subtasksEditingId === id;
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
  const obsText = String((row && row.meta && row.meta.cur && row.meta.cur["OBS"]) || "").trim();
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
    // a vista mapeada desta folha já mostra o "o que fazer" no bloco da tarefa
    // (categoria composta, ver taskIndex): repeti-lo aqui era mostrar a mesma
    // coisa duas vezes seguidas
    const custom = customRowFor(it);
    if (custom && custom.showsTodo) return "";
    const live = liveTaskContent(it);
    const detail = live ? live.detail : dedupeStaleObs(it, it.detail);
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
  // uma coluna vinda de outra janela tem de existir antes de se agruparem os
  // cartões, senão o cartão dela caía na coluna de recurso sem razão
  adoptTodoCols();
  $("todoModeList").classList.toggle("active", todoLayout === "list");
  $("todoModeKanban").classList.toggle("active", todoLayout === "kanban");
  todoColsBtn.textContent = `⚙ ${t("todo_cols_btn")}`;
  todoColsBtn.title = t("t_todo_cols");
  todoColsBtn.classList.toggle("hidden", todoLayout !== "kanban");
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
    <td>${todoMySideFlag(it, false)}${todoKindChips(it)}${todoTitleHtml(it)}${todoSubProgress(it)}${todoNoteFlag(it)}${todoNoteHtml(it, false)}${todoTaskInfoHtml(it)}${todoLinksHtml(it)}${todoSubtasksHtml(it)}${todoJiraHtml(it)}</td>
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

  const cols = todoVisibleColIds();
  const byCol = Object.fromEntries(cols.map(col => [col, []]));
  todos.forEach(it => byCol[todoLaneOf(it)].push(it));
  $("todoBoard").innerHTML = cols.map(col => {
    const cards = byCol[col].map(it => {
      const srcCell = srcOf(it)
        ? `<button type="button" class="srcBtn" data-src="${esc(it.id)}" title="${t("t_src")}">↗</button>`
        : "";
      // cartão de uma coluna escondida: está aqui de empréstimo, não é desta coluna
      const offLane = todoColOf(it) !== col ? " offLane" : "";
      return `<article draggable="true" class="todoCard${it.done ? " done" : ""}${todoIsFlagged(it) ? " flagged" : ""}${offLane}" data-tid="${esc(it.id)}">
    ${todoMySideFlag(it, true)}
    <div class="todoCardTitle">${todoKindChips(it)}${todoTitleHtml(it)}${todoSubProgress(it)}${todoNoteFlag(it)}</div>
    ${todoNoteHtml(it, true)}
    ${todoTaskInfoHtml(it)}
    ${todoLinksHtml(it)}
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
    const hide = cols.length > 1
      ? `<button type="button" class="todoColHide" data-tcolhide="${esc(col)}" title="${esc(t("todo_col_hide"))}">✕</button>`
      : "";
    return `<section class="todoCol" data-todocol="${esc(col)}">
  <div class="todoColHead"><span class="todoColName">${esc(todoColLabel(col))}</span><span class="todoColCount">${byCol[col].length}</span>${hide}</div>
  <div class="todoColBody" data-todocol="${esc(col)}">${cards}</div>
</section>`;
  }).join("") +
    `<button type="button" class="todoColNew" data-tcolnew="1" title="${esc(t("todo_col_new"))}">+</button>`;
  refreshItemBox();
}

// Retrato do que interessa antes de mexer na lista, para se saber depois quais
// os cartões que saíram de "Em curso" (ver offerJiraLogForPaused). É tirado no
// postTodo, e não em cada sítio que move um cartão, para valer em todos: arrasto
// no quadro, botão da coluna, caixa de marcar e o que vier a seguir.
function todoTimerSnapshot() {
  return todos.map(it => ({
    id: it.id, col: todoColOf(it),
    unlogged: todoUnloggedMs(it),
    issue: todoJiraIssue(it),
  }));
}

// Um cartão que sai de "Em curso" tem o cronómetro parado nesse instante: é o
// momento certo para o levar ao Jira. O aviso é um convite clicável — não abre
// nada por si, para não atrapalhar quem está só a arrumar o quadro.
function offerJiraLogForPaused(antes) {
  if (typeof jiraConfigured !== "undefined" && !jiraConfigured) return;
  const porId = new Map(antes.map(a => [a.id, a]));
  for (const it of todos) {
    const a = porId.get(it.id);
    if (!a || a.col !== "inprogress" || todoColOf(it) === "inprogress") continue;
    if (!a.issue || !todoCanLogTime(it)) continue;
    const ms = todoUnloggedMs(it);
    const issue = todoJiraIssue(it);
    toast(tf("jira_log_offer", msToJiraTime(ms), issue.key), "",
      () => openJiraLogModal(it.id, issue.key, issue.summary, ms));
    return;   // um convite de cada vez: dois avisos seguidos não se leem
  }
}

async function postTodo(body) {
  const antesTimers = todoTimerSnapshot();
  try {
    const res = await fetch("/api/todo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = await res.json();
    if (!out.ok) { alert("Operação TODO falhou: " + (out.error || "?")); return false; }
    lastTodoResult = out.result || null;
    todos = out.todo;
    renderTodo();
    // as origens mostram "+ TODO" só enquanto não estiverem na lista
    render();
    renderCCRs();
    // a página do Jira é montada a partir dos `todos`: ligar/desligar uma issue
    // tem de se ver logo (o jira.js é carregado depois deste ficheiro)
    if (typeof renderJiraPage === "function" && (currentView === "jira" || sideView === "jira")) renderJiraPage();
    offerJiraLogForPaused(antesTimers);
    return true;
  } catch (err) {
    alert("Não foi possível contactar o servidor: " + err);
    return false;
  }
}

// o servidor ignora tarefas repetidas (mesmo título por fechar); sem aviso
// parecia que arrastar/clicar não fazia nada
async function addTodoWithFeedback(body) {
  const ok = await postTodo(body);
  if (!ok) return;
  if (lastTodoResult === "linked") toast(tf("todo_linked", body.title), "ok");
  else if (lastTodoResult === "exists") toast(tf("todo_exists", body.title), "");
  else toast(tf("todo_added", body.title), "ok");
}

// Instantâneo do "o que fazer" guardado com o item (reserva para quando o livro
// está fechado): sai sempre da coluna "To Do" da linha (meta.cur), nunca da 4.ª
// célula da tabela — com a vista mapeada essa coluna é a que o utilizador lá
// pôs (podia ser o Reviewer, por exemplo). Folha sem coluna "To Do": fica o
// texto da 4.ª coluna, como antes, que é o melhor que há. A OBS nunca entra
// aqui: aparece à parte e ao vivo (todoTaskInfoHtml), e copiá-la duplicava-a.
function taskRowDetail(tr, meta) {
  const cur = (meta && meta.cur) || {};
  if (cur["To Do"] !== undefined) return String(cur["To Do"] || "").trim().slice(0, 300);
  const cell = tr && tr.cells[3] ? tr.cells[3].cloneNode(true) : null;
  if (cell) cell.querySelectorAll(".obs, .addnote").forEach(n => n.remove());
  return (cell ? cell.innerText : "").trim().slice(0, 300);
}

function addTodoFromTaskRow(btn) {
  const tr = btn.closest("tr");
  const ri = +btn.dataset.todoadd;
  if (!tr || Number.isNaN(ri)) return;
  const meta = currentMeta[ri] || {};
  // o título sai da 1.ª coluna da tabela, mas com a vista mapeada essa coluna
  // pode ser outra qualquer (ou vir vazia): aí vale o Function/TC da linha,
  // senão o botão não fazia nada. A mesma conta está no todoAddBtn (tasks.js),
  // para o "+ TODO" desaparecer da linha que já tem item.
  const fn = tr.cells[0] ? tr.cells[0].innerText.split("\n")[0].trim() : "";
  const title = fn || String(meta.fn || "").trim();
  if (!title) return;
  const detail = taskRowDetail(tr, meta);
  const ref = {
    workbook: activeBookName(), sheet: (lastData && lastData.sheet) || "",
    fn: meta.fn || title, todo: meta.todo || "",
  };
  addTodoWithFeedback({ action: "add", title, kind: "task", detail, ref, col: todoDefaultCol() });
}

function addTodoFromCcr(id) {
  const item = ccrs[id] || {};
  addTodoWithFeedback({ action: "add", title: `CCR ${id}`, kind: "ccr", detail: String(item.note || "").trim().slice(0, 300), ref: { ccr: id }, col: todoDefaultCol() });
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
  addTodoWithFeedback({ action: "add", title, kind: "manual", col: todoLayout === "kanban" ? todoDefaultCol() : null });
  $("todoNew").value = "";
}
$("todoAdd").addEventListener("click", addManualTodo);
$("todoNew").addEventListener("keydown", e => { if (e.key === "Enter") addManualTodo(); });
$("todoModeList").addEventListener("click", () => setTodoLayout("list"));
$("todoModeKanban").addEventListener("click", () => setTodoLayout("kanban"));
// botão que abre o painel das colunas: o index.html só traz os dois botões de
// vista (Lista/Kanban), este é montado aqui ao lado deles
const todoColsBtn = document.createElement("button");
todoColsBtn.type = "button";
todoColsBtn.id = "todoColsBtn";
todoColsBtn.className = "secondary todoColsBtn hidden";
$("todoModeKanban").parentElement.insertAdjacentElement("afterend", todoColsBtn);
todoColsBtn.addEventListener("click", () => openTodoColsPop(todoColsBtn));

// ---------- painel das colunas do quadro ----------
// (segue o padrão dos painéis pequenos das Notas: nada de prompt()/confirm()
// do browser, Enter confirma e Esc desiste)
let todoColsPop = null;        // { el, anchor } do painel aberto
let todoColsPopHold = false;   // clicar outra vez no botão fecha (não reabre)
let todoColDelArm = null;      // coluna à espera de confirmação para ser apagada
let todoColRenaming = null;    // coluna com o nome em edição

function closeTodoColsPop() {
  if (!todoColsPop) return;
  todoColsPop.el.remove();
  todoColsPop = null;
  todoColDelArm = null;
  todoColRenaming = null;
}

function todoColsPopRowHtml(id, i, total) {
  const custom = todoColIsCustom(id);
  const shown = !todoColHidden(id);
  const n = todoColCount(id);
  if (todoColDelArm === id) {
    return `<li class="todoColRow arm">
    <span class="todoColAsk">${esc(tf("todo_col_del_ask", todoColLabel(id), n, todoColLabel(todoColDelTarget(id))))}</span>
    <button type="button" class="mini" data-tcoldelok="${esc(id)}">${esc(t("todo_col_del_ok"))}</button>
    <button type="button" class="ccr-x" data-tcoldelno="1" title="${esc(t("todo_col_del_no"))}">✕</button>
  </li>`;
  }
  const name = todoColRenaming === id
    ? `<input type="text" class="todoColRenameInput" data-tcolrenin="${esc(id)}" maxlength="${TODO_COL_NAME_MAX}" value="${esc(todoColLabel(id))}">`
    : `<span class="todoColRowName">${esc(todoColLabel(id))}</span>`;
  return `<li class="todoColRow${shown ? "" : " off"}">
    <input type="checkbox" data-tcolshow="${esc(id)}"${shown ? " checked" : ""} title="${esc(t(shown ? "todo_col_hide" : "todo_col_show"))}">
    ${name}
    <span class="todoColRowCount">${n}</span>
    <button type="button" class="todoColMove" data-tcolmove="${esc(id)}|-1" title="${esc(t("todo_col_left"))}"${i === 0 ? " disabled" : ""}>↑</button>
    <button type="button" class="todoColMove" data-tcolmove="${esc(id)}|1" title="${esc(t("todo_col_right"))}"${i === total - 1 ? " disabled" : ""}>↓</button>
    ${custom ? `<button type="button" class="todoColMove" data-tcolren="${esc(id)}" title="${esc(t("todo_col_rename"))}">✎</button>` : ""}
    ${custom ? `<button type="button" class="ccr-x" data-tcoldel="${esc(id)}" title="${esc(t("todo_col_del"))}">✕</button>` : ""}
  </li>`;
}

function renderTodoColsPop() {
  if (!todoColsPop) return;
  const order = todoColConf.order;
  todoColsPop.el.innerHTML = `<div class="todoColsPopHead">${esc(t("todo_cols_title"))}</div>
<p class="todoColsPopHint">${esc(t("todo_cols_hint"))}</p>
<ul class="todoColsPopList">${order.map((id, i) => todoColsPopRowHtml(id, i, order.length)).join("")}</ul>
<div class="todoColsPopAdd">
  <input type="text" class="todoColNewInput" maxlength="${TODO_COL_NAME_MAX}" placeholder="${esc(t("ph_todo_col_new"))}">
  <button type="button" class="mini" data-tcoladd="1" title="${esc(t("todo_col_new"))}">+</button>
</div>`;
  const ren = todoColsPop.el.querySelector(".todoColRenameInput");
  if (ren) { ren.focus(); ren.select(); }
}

function commitTodoColNew(keepFocus) {
  const box = todoColsPop && todoColsPop.el.querySelector(".todoColNewInput");
  if (!box) return;
  if (!addTodoCol(box.value)) { box.focus(); box.select(); return; }
  renderTodoColsPop();
  renderTodo();
  const again = keepFocus && todoColsPop && todoColsPop.el.querySelector(".todoColNewInput");
  if (again) again.focus();
}

function commitTodoColRename() {
  const box = todoColsPop && todoColsPop.el.querySelector(".todoColRenameInput");
  if (!box) return;
  renameTodoCol(box.dataset.tcolrenin, box.value);
  todoColRenaming = null;
  renderTodoColsPop();
  renderTodo();
}

function todoColsPopTap(e) {
  const mv = e.target.closest("[data-tcolmove]");
  if (mv) {
    const [id, dir] = mv.dataset.tcolmove.split("|");
    if (moveTodoCol(id, +dir)) { renderTodoColsPop(); renderTodo(); }
    return;
  }
  const ren = e.target.closest("[data-tcolren]");
  if (ren) { todoColRenaming = ren.dataset.tcolren; renderTodoColsPop(); return; }
  const del = e.target.closest("[data-tcoldel]");
  if (del) { todoColDelArm = del.dataset.tcoldel; renderTodoColsPop(); return; }
  if (e.target.closest("[data-tcoldelno]")) { todoColDelArm = null; renderTodoColsPop(); return; }
  const ok = e.target.closest("[data-tcoldelok]");
  if (ok) { deleteTodoCol(ok.dataset.tcoldelok); return; }
  if (e.target.closest("[data-tcoladd]")) commitTodoColNew(true);
}

function openTodoColsPop(anchor, focusNew) {
  if (todoColsPopHold) { todoColsPopHold = false; return; }
  const already = !!todoColsPop;
  closeTodoColsPop();
  if (already && !focusNew) return;
  const el = document.createElement("div");
  el.className = "todoColsPop";
  document.body.appendChild(el);
  todoColsPop = { el, anchor };
  renderTodoColsPop();
  const r = anchor.getBoundingClientRect();
  el.style.left = `${Math.max(6, Math.min(window.innerWidth - el.offsetWidth - 6, r.right - el.offsetWidth))}px`;
  const below = r.bottom + 6;
  el.style.top = `${below + el.offsetHeight > window.innerHeight
    ? Math.max(6, r.top - el.offsetHeight - 6) : below}px`;
  el.addEventListener("click", todoColsPopTap);
  el.addEventListener("change", ev => {
    const cb = ev.target.closest("[data-tcolshow]");
    if (!cb) return;
    if (!setTodoColHidden(cb.dataset.tcolshow, !cb.checked)) { cb.checked = !cb.checked; return; }
    renderTodoColsPop();
    renderTodo();
  });
  el.addEventListener("keydown", ev => {
    if (ev.key !== "Enter") return;
    if (ev.target.closest(".todoColNewInput")) { ev.preventDefault(); commitTodoColNew(true); }
    else if (ev.target.closest(".todoColRenameInput")) { ev.preventDefault(); commitTodoColRename(); }
  });
  el.addEventListener("focusout", ev => {
    // sair do campo do nome guarda o que lá estiver (é um editor, não um menu)
    if (ev.target.closest(".todoColRenameInput") && todoColRenaming) commitTodoColRename();
  });
  if (focusNew) {
    const box = el.querySelector(".todoColNewInput");
    if (box) box.focus();
  }
}

// clicar fora fecha; no próprio botão fecha e não deixa reabrir no mesmo clique
document.addEventListener("pointerdown", e => {
  if (!todoColsPop || e.target.closest(".todoColsPop")) return;
  todoColsPopHold = todoColsPop.anchor.contains(e.target);
  closeTodoColsPop();
}, true);

// em captura na janela (antes de qualquer tratador do document, incluindo o do
// ecrã dividido): com o painel aberto o Esc só desiste dele
window.addEventListener("keydown", e => {
  if (e.key !== "Escape" || !todoColsPop) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  if (todoColRenaming) { todoColRenaming = null; renderTodoColsPop(); return; }
  if (todoColDelArm) { todoColDelArm = null; renderTodoColsPop(); return; }
  closeTodoColsPop();
}, true);

// ✕ no cabeçalho de uma coluna esconde-a; o + no fim do quadro cria uma nova
$("todoBoard").addEventListener("click", e => {
  const hide = e.target.closest("[data-tcolhide]");
  if (hide) {
    e.stopPropagation();
    if (setTodoColHidden(hide.dataset.tcolhide, true)) renderTodo();
    return;
  }
  const add = e.target.closest("[data-tcolnew]");
  if (add) {
    e.stopPropagation();
    openTodoColsPop(add, true);
  }
});

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
  const subMode = e.target.closest("[data-tsubmode]");
  if (subMode) { toggleSubtasksEdit(subMode.dataset.tsubmode); return; }
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
    // o tempo do cronómetro que ainda não foi para o Jira vai já proposto
    openJiraLogModal(id, key, issue && issue.summary, todoUnloggedMs(item));
    return;
  }
  const jiraGoto = e.target.closest("[data-tjiragoto]");
  if (jiraGoto) { jiraGotoIssue(jiraGoto.dataset.tjiragoto); return; }
  const del = e.target.closest("[data-tdel]");
  if (del) { postTodo({ action: "delete", id: del.dataset.tdel }); return; }
  const src = e.target.closest("[data-src]");
  if (src) { revealSource(srcOf(todos.find(it => it.id === src.dataset.src))); return; }
  const linkGo = e.target.closest("[data-tlinkgo]");
  if (linkGo) { revealSource(srcOfSource(todoLinkAt(linkGo.dataset.tlinkgo))); return; }
  const linkDel = e.target.closest("[data-tlinkdel]");
  if (linkDel) {
    const link = todoLinkAt(linkDel.dataset.tlinkdel);
    if (link) {
      postTodo({
        action: "unlink_source", id: linkDel.dataset.tlinkdel.split("|")[0],
        kind: link.kind, title: link.title, ref: link.ref,
      });
    }
    return;
  }
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

// reordenar os passos de um item: só com a checklist em modo de reordenação e
// sempre dentro da mesma lista (arrastar um passo para outro item não faz
// sentido — o passo pertence ao item)
function clearSubtaskOver() {
  document.querySelectorAll(".todoSubItem.over").forEach(x => x.classList.remove("over"));
}

function endSubtaskDrag() {
  subtaskDrag = null;
  clearSubtaskOver();
}

function subtaskDragStart(e) {
  const li = e.target.closest(".todoSubList.editingSubs .todoSubItem");
  if (!li) return false;
  subtaskDrag = { id: li.closest(".todoSubList").dataset.tsublist, subId: li.dataset.tsubid };
  e.dataTransfer.setData("application/json",
    JSON.stringify({ kind: "subtask", id: subtaskDrag.id, sub_id: subtaskDrag.subId }));
  e.dataTransfer.effectAllowed = "move";
  return true;
}

function subtaskDragOver(e) {
  if (!subtaskDrag) return;
  const li = e.target.closest ? e.target.closest(".todoSubItem") : null;
  const list = li ? li.closest(".todoSubList") : null;
  clearSubtaskOver();
  if (!list || list.dataset.tsublist !== subtaskDrag.id || li.dataset.tsubid === subtaskDrag.subId) return;
  e.preventDefault();
  li.classList.add("over");
}

function subtaskDrop(e) {
  if (!subtaskDrag) return;
  // impede que o drop suba até aos handlers da tab/lista de TODOs (dropready,
  // handleTodoPayload) — o passo nunca é um item TODO nem um drop noutra aba
  e.stopPropagation();
  const li = e.target.closest ? e.target.closest(".todoSubItem") : null;
  const list = li ? li.closest(".todoSubList") : null;
  const drag = subtaskDrag;
  endSubtaskDrag();
  if (!list || list.dataset.tsublist !== drag.id || li.dataset.tsubid === drag.subId) return;
  e.preventDefault();
  // o campo de novo passo é sempre o último filho, por isso não entra na conta
  const to = [...list.children].indexOf(li);
  postTodo({ action: "reorder_subtask", id: drag.id, sub_id: drag.subId, to });
}

$("tbody").addEventListener("dragstart", e => {
  const tr = e.target.closest("tr");
  if (!tr || !tr.cells.length) return;
  // as chaves exatas da linha, para se poder voltar a ela mais tarde
  const meta = currentMeta[[...$("tbody").rows].indexOf(tr)] || {};
  // com a vista mapeada a 1.ª coluna pode não ser o Function/TC (ver
  // addTodoFromTaskRow): sem texto nela, o título vem da própria linha
  const fn = tr.cells[0].innerText.split("\n")[0].trim() || String(meta.fn || "").trim();
  if (!fn) return;
  // leva também o "O que fazer" como detalhe do item
  const detail = taskRowDetail(tr, meta);
  const ref = {
    workbook: activeBookName(), sheet: (lastData && lastData.sheet) || "",
    fn: meta.fn || fn, todo: meta.todo || "",
  };
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
  if (subtaskDragStart(e)) return;
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
  if (subtaskDragStart(e)) return;
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
  endSubtaskDrag();
});
$("todoBoard").addEventListener("dragend", () => {
  $("dropZones").classList.add("hidden");
  document.querySelectorAll("#dropZones .dropZone").forEach(z => z.classList.remove("over"));
  document.querySelectorAll(".todoCol.over").forEach(x => x.classList.remove("over"));
  endSubtaskDrag();
});
$("todoBody").addEventListener("dragover", subtaskDragOver);
$("todoBoard").addEventListener("dragover", subtaskDragOver);
$("todoBody").addEventListener("drop", subtaskDrop);
$("todoBoard").addEventListener("drop", subtaskDrop);

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
      detail: p.detail || "", ref: p.ref || null, col: targetCol || todoDefaultCol()
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
  el.addEventListener("dragover", e => {
    // a arrastar um passo dentro da checklist: a tab não é alvo nenhum
    if (subtaskDrag) return;
    e.preventDefault(); todoTab.classList.add("dropready");
  });
  el.addEventListener("dragleave", () => todoTab.classList.remove("dropready"));
});
todoTab.addEventListener("drop", e => handleTodoDrop(e, null, null, null));
$("todoView").addEventListener("drop", e => {
  if (subtaskDrag) return;
  const row = e.target.closest("tr.todoRow");
  const card = e.target.closest(".todoCard");
  handleTodoDrop(e, row, todoColUnder(e.target), card ? card.dataset.tid : null);
});

$("todoBoard").addEventListener("dragover", e => {
  // a arrastar um passo dentro da checklist: a coluna não é alvo nenhum
  if (subtaskDrag) return;
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
