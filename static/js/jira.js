// My Organizer — Jira na lista Por fazer: ligar issues a um item, ver o esforço
// já registado (página Jira) e registar mais tempo (cria um worklog real no Jira)

// URL base do Jira, só para montar links "abrir no Jira" (o token nunca sai
// do servidor); fica vazio enquanto as Definições não tiverem sido lidas
let jiraBaseUrl = "";

// esforço já registado por uma tarefa concreta (jiraLoggedSeconds do item),
// mostrado em cada linha do cartão da página Jira — ver renderJiraPage()
function formatJiraEffort(totalSeconds) {
  const minutes = Math.max(0, Math.round((+totalSeconds || 0) / 60));
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (!h && !m) return "0m";
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
}

function jiraIssueUrl(key) {
  return jiraBaseUrl ? `${jiraBaseUrl}/browse/${encodeURIComponent(key)}` : "";
}

// badge da chave, partilhado entre a lista/caixa do item (uma issue) e os
// cartões da página Jira (várias); vira link quando já se sabe o URL base
function jiraKeyBadgeHtml(key, title) {
  const url = jiraIssueUrl(key);
  const titleAttr = esc(title || key);
  return url
    ? `<a class="todoJiraKey" href="${esc(url)}" target="_blank" rel="noopener" title="${titleAttr}">${esc(key)}</a>`
    : `<span class="todoJiraKey" title="${titleAttr}">${esc(key)}</span>`;
}

// epic da issue ("Epic Link" do Jira): num rework quase todas as issues têm o
// mesmo resumo ("Close CTAD") e só o epic diz a qual delas se está a olhar.
// É sempre um <span> (nunca um link): a linha de resultados da procura é um
// <button> e não pode levar âncoras lá dentro.
function jiraEpicHtml(issue) {
  const key = issue && issue.epicKey;
  if (!key) return "";
  const name = (issue.epicName || "").trim() || key;
  const label = name === key ? key : `${name} (${key})`;
  return `<span class="jiraEpic" title="${esc(t("jira_epic_title"))}: ${esc(label)}">${esc(name)}</span>`;
}

// as ligações gravadas antes desta versão não têm o epic: vai-se buscar uma vez
// por chave (nesta sessão) e volta a desenhar-se já com ele. Falhar é silencioso
// — a issue continua a valer sem o epic.
const jiraEpicAsked = new Set();

function jiraEpicOf(key, issue) {
  if (issue && issue.epicKey) return issue;
  const info = jiraManualInfo.get(key);
  if (info && typeof info === "object") return info.epicKey ? info : null;
  if (info === "pending" || jiraEpicAsked.has(key) || !jiraConfigured || !key) return null;
  jiraEpicAsked.add(key);
  fetch("/api/jira/issue/" + encodeURIComponent(key))
    .then(res => res.json())
    .then(out => {
      if (!out || out.error || !out.epicKey) return;
      jiraManualInfo.set(key, {
        summary: out.summary || "", parentSummary: out.parentSummary,
        epicKey: out.epicKey, epicName: out.epicName,
      });
      jiraRenderPageIfVisible();
      if (!editorOpen) renderTodo();
    })
    .catch(() => { });
  return null;
}

// ---------- ligar uma issue ao item (Enter no campo do fim da lista) ----------
// os pedidos em curso, para o Enter repetido não ligar a mesma issue duas vezes
const jiraLinking = new Set();

async function handleJiraLinkKeydown(e) {
  const input = e.target.closest(".todoJiraLinkInput");
  if (!input || e.key !== "Enter") return;
  e.preventDefault();
  const id = input.dataset.tjiranew;
  const key = input.value.trim().toUpperCase();
  if (!key) return;
  const token = `${id}|${key}`;
  if (jiraLinking.has(token)) return;
  jiraLinking.add(token);
  input.disabled = true;
  try {
    const ok = await postTodo({ action: "jira_link", id, key });
    // o postTodo refaz a lista: o campo antigo pode já não estar no documento
    if (input.isConnected) {
      input.disabled = false;
      if (ok) input.value = "";
      else input.focus();
    }
  } finally {
    jiraLinking.delete(token);
  }
}
$("todoBody").addEventListener("keydown", handleJiraLinkKeydown);
$("todoBoard").addEventListener("keydown", handleJiraLinkKeydown);

// ---------- registar trabalho ----------
let jiraLogTarget = null;

// "started" no formato que o Jira espera: 2026-07-31T10:30:00.000+0100
function toJiraStarted(localDatetime) {
  const d = new Date(localDatetime);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const tzMin = -d.getTimezoneOffset();
  const sign = tzMin >= 0 ? "+" : "-";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(Math.abs(tzMin) / 60))}${pad(Math.abs(tzMin) % 60)}`;
}

// agora, no formato do <input type="datetime-local">. Com `backMs` recua no
// tempo: o registo que vem do cronómetro começa quando o trabalho começou, não
// no instante em que se carrega no botão.
function jiraLocalNow(backMs = 0) {
  const d = new Date(Date.now() - Math.max(0, +backMs || 0));
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- tempo <-> texto do Jira ----------
// O Jira fala em "1w 2d 3h 30m" (semana = 5 dias, dia = 8 horas). As duas
// conversões existem porque o cronómetro dá milissegundos e o Jira quer o texto,
// e depois é preciso saber quanto tempo do cronómetro é que o texto submetido
// consumiu (ver submitJiraLog: só esse é que deixa de ser proposto).
const JIRA_UNIT_MS = { w: 5 * 8 * 3600000, d: 8 * 3600000, h: 3600000, m: 60000 };

function msToJiraTime(ms) {
  const minutos = Math.max(1, Math.round((+ms || 0) / 60000));
  const h = Math.floor(minutos / 60), m = minutos % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "1m";
}

function jiraTimeToMs(text) {
  let total = 0;
  String(text || "").toLowerCase().replace(/(\d+)\s*([wdhm])/g, (_, n, u) => {
    total += (+n) * (JIRA_UNIT_MS[u] || 0);
    return "";
  });
  return total;
}

function jiraLogNote(id, msg) {
  const el = $(id);
  el.textContent = msg || "";
  el.classList.toggle("hidden", !msg);
}

// `timerMs` (opcional) = tempo do cronómetro do item que ainda não foi
// registado: vem já escrito no campo, e a data de início recua o mesmo tanto.
// Continua tudo editável — a proposta é um atalho, não uma imposição.
function openJiraLogModal(itemId, key, summary, timerMs = 0) {
  const doCronometro = Math.max(0, +timerMs || 0);
  jiraLogTarget = { itemId, key, timerMs: doCronometro };
  $("jiraLogTitle").textContent = `${t("jira_log_title")} · ${key}` + (summary ? ` — ${summary}` : "");
  $("jiraLogTime").value = doCronometro >= 60000 ? msToJiraTime(doCronometro) : "";
  $("jiraLogComment").value = "";
  $("jiraLogStarted").value = jiraLocalNow(doCronometro);
  jiraLogNote("jiraLogError", "");
  jiraLogNote("jiraLogSuccess", "");
  jiraLogNote("jiraLogHint", doCronometro >= 60000 ? t("jira_log_from_timer") : "");
  $("jiraLogSubmit").disabled = false;
  $("jiraLogSubmit").textContent = t("jira_log_submit");
  $("jiraLogOverlay").classList.remove("hidden");
  $("jiraLogTime").focus();
  $("jiraLogTime").select();
}

function closeJiraLogModal() {
  $("jiraLogOverlay").classList.add("hidden");
  jiraLogTarget = null;
}

async function submitJiraLog() {
  if (!jiraLogTarget) return;
  const key = jiraLogTarget.key;
  const timeSpent = $("jiraLogTime").value.trim();
  const started = $("jiraLogStarted").value;
  jiraLogNote("jiraLogSuccess", "");
  if (!/^(\d+\s*[wdhm]\s*)+$/i.test(timeSpent)) {
    jiraLogNote("jiraLogError", t("err_jira_time_format"));
    return;
  }
  if (!started) {
    jiraLogNote("jiraLogError", t("err_jira_started_required"));
    return;
  }
  jiraLogNote("jiraLogError", "");
  const btn = $("jiraLogSubmit");
  btn.disabled = true;
  btn.textContent = t("jira_log_submitting");
  try {
    const res = await fetch(`/api/jira/issue/${encodeURIComponent(key)}/worklog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timeSpent, started: toJiraStarted(started),
        comment: $("jiraLogComment").value.trim(),
        item_id: jiraLogTarget.itemId || undefined,
        // quanto do cronómetro é que este registo consome: o que foi mesmo
        // submetido, nunca mais do que o que estava por registar. Registar 30m
        // de 1h20 deixa 50m à espera, em vez de dar tudo por registado.
        timer_ms: jiraLogTarget.timerMs
          ? Math.min(jiraLogTarget.timerMs, jiraTimeToMs(timeSpent))
          : undefined,
      }),
    });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || "?");
    // logado a partir de uma tarefa concreta: o servidor já devolve o todo.json
    // com o esforço somado a essa tarefa (jiraLoggedSeconds)
    if (out.todo) {
      todos = out.todo;
      renderTodo();
      render();
    }
    jiraRenderPageIfVisible();
    jiraLogNote("jiraLogSuccess", `${t("jira_log_success")} ${key}: ${timeSpent}`);
    toast(`${t("jira_log_success")} ${key}: ${timeSpent}`, "ok");
    setTimeout(closeJiraLogModal, 1200);
  } catch (err) {
    jiraLogNote("jiraLogError", err.message || t("err_server"));
    btn.disabled = false;
    btn.textContent = t("jira_log_submit");
  }
}

$("jiraLogSubmit").addEventListener("click", submitJiraLog);
$("jiraLogClose").addEventListener("click", closeJiraLogModal);
$("jiraLogOverlay").addEventListener("click", e => {
  if (e.target === $("jiraLogOverlay")) closeJiraLogModal();
});
// Esc: em captura e a travar a propagação, senão o tratador global do ecrã
// dividido (split.js) saía do ecrã dividido em vez de fechar esta janela
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("jiraLogOverlay").classList.contains("hidden")) {
    e.stopPropagation();
    closeJiraLogModal();
  }
}, { capture: true });

// ---------- página do Jira: uma caixa por issue usada na app ----------
// A lista sai toda dos `todos` já carregados (cada item traz as suas
// `jiraIssues`), por isso não há nada novo a pedir ao servidor.
let jiraPageFilter = "";

function jiraIssueLabel(j) {
  if (!j) return "";
  return j.parentSummary && j.summary ? `${j.parentSummary} — ${j.summary}` : (j.summary || "");
}

// key -> {key, label, epic, tasks:[item, ...]}, por ordem de chave
function jiraIssueMap() {
  const map = new Map();
  (todos || []).forEach(it => {
    if (!it) return;
    (it.jiraIssues || []).forEach(j => {
      if (!j || !j.key) return;
      let entry = map.get(j.key);
      if (!entry) {
        entry = { key: j.key, label: "", epic: null, tasks: [] };
        map.set(j.key, entry);
      }
      // o resumo vem repetido em cada item; fica o último que traga texto
      const label = jiraIssueLabel(j);
      if (label) entry.label = label;
      if (j.epicKey) entry.epic = j;
      entry.tasks.push(it);
    });
  });
  return map;
}

// chaves já conhecidas da app (ligadas a algum item, ou só acrescentadas na
// página Jira): sugestões do campo "Ligar issue do Jira" de cada item
function jiraKnownKeys() {
  const set = new Set();
  (todos || []).forEach(it => (it && it.jiraIssues || []).forEach(j => j && j.key && set.add(j.key)));
  jiraManualKeys.forEach(key => set.add(key));
  return [...set].sort();
}

function renderJiraSuggestions() {
  const dl = $("jiraSuggestions");
  if (!dl) return;
  dl.innerHTML = jiraKnownKeys().map(key => `<option value="${esc(key)}"></option>`).join("");
}

// ---------- issues acrescentadas à mão (cartões ainda sem tarefas) ----------
// O servidor só guarda `jiraIssues` DENTRO de um item do TODO, por isso uma
// issue sem tarefas nenhumas não tem onde viver lá: fica guardada aqui, neste
// browser, até alguém lhe arrastar uma tarefa (é aí que a ligação passa a ser
// real e a ser gravada no servidor).
const JIRA_MANUAL_KEY = "bsp-tracker-jira-manual";
// mesmo formato que o KEY_RE do servidor (cswaios/jira.py)
const JIRA_KEY_RE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
let jiraManualKeys = new Set((() => {
  try {
    const got = JSON.parse(localStorage.getItem(JIRA_MANUAL_KEY) || "[]");
    return Array.isArray(got) ? got : [];
  } catch (e) {
    return [];
  }
})());
// key -> {summary, parentSummary, epicKey, epicName} | "pending" | "error"
const jiraManualInfo = new Map();

function jiraSaveManualKeys() {
  localStorage.setItem(JIRA_MANUAL_KEY, JSON.stringify([...jiraManualKeys]));
}

function jiraRenderPageIfVisible() {
  if (currentView === "jira" || sideView === "jira") renderJiraPage();
}

// depois de desligar uma issue da sua última tarefa, o cartão não desaparece
// da página Jira — passa a ficar à mão, para não se perder o rasto de uma
// issue que já tenha esforço registado. Se ainda tiver outra tarefa ligada
// (ou já estiver à mão), não há nada a fazer.
function jiraKeepAsManualIfOrphaned(key, issue) {
  if (!key || jiraIssueMap().has(key) || jiraManualKeys.has(key)) return;
  jiraManualKeys.add(key);
  jiraSaveManualKeys();
  if (issue) jiraManualInfo.set(key, { summary: issue.summary || "", parentSummary: issue.parentSummary, epicKey: issue.epicKey, epicName: issue.epicName });
  else fetchJiraManualInfo(key);
  jiraRenderPageIfVisible();
}

// só corre uma vez por chave nova (não a cada render), por isso não precisa de
// espera nem de agrupamento
function fetchJiraManualInfo(key) {
  jiraManualInfo.set(key, "pending");
  fetch("/api/jira/issue/" + encodeURIComponent(key))
    .then(res => res.json())
    .then(out => {
      if (!out || out.error) throw new Error((out && out.error) || "?");
      jiraManualInfo.set(key, { summary: out.summary || "", parentSummary: out.parentSummary, epicKey: out.epicKey, epicName: out.epicName });
      jiraRenderPageIfVisible();
    })
    .catch(err => {
      // chave que não existe (ou sem permissão para a ver): em vez de deixar um
      // cartão vazio preso na página, desaparece e diz porquê
      jiraManualKeys.delete(key);
      jiraManualInfo.delete(key);
      jiraSaveManualKeys();
      toast(`${key}: ${err.message || "não foi possível ler a issue"}`, "err");
      jiraRenderPageIfVisible();
    });
}

// os placeholders vindos do localStorage (de uma sessão anterior) só trazem a
// chave — sem isto o resumo ficava "…" para sempre até a chave ser removida e
// acrescentada outra vez
jiraManualKeys.forEach(key => fetchJiraManualInfo(key));

function addJiraManualKey(rawKey) {
  const key = String(rawKey || "").trim().toUpperCase();
  if (!key) return;
  if (!JIRA_KEY_RE.test(key)) {
    toast("Chave de issue inválida (ex.: PROJ-123)", "err");
    return;
  }
  // já ligada a alguma tarefa (ou já acrescentada antes): nada a criar, só
  // garantir que o cartão que já existe fica à vista
  const already = jiraIssueMap().has(key) || jiraManualKeys.has(key);
  if (!already) {
    jiraManualKeys.add(key);
    jiraSaveManualKeys();
  }
  jiraPageFilter = "";
  $("jiraPageSearch").value = "";
  hideJiraSearchResults();
  renderJiraPage();                 // mostra logo o cartão (com "…" no resumo)
  if (!already) fetchJiraManualInfo(key);
}

// cartões só das chaves acrescentadas à mão que ainda não têm ligação real: uma
// ligação verdadeira ganha sempre à marcação local, nunca há dois cartões para
// a mesma chave
function jiraManualEntries(map) {
  const out = [];
  let pruned = false;
  jiraManualKeys.forEach(key => {
    if (map.has(key)) {
      // a ligação passou a ser real (ex.: arrastada para uma tarefa) - o
      // marcador local já não faz falta; sem isto reaparecia como fantasma
      // se a tarefa fosse mais tarde desligada
      jiraManualKeys.delete(key);
      jiraManualInfo.delete(key);
      pruned = true;
      return;
    }
    const info = jiraManualInfo.get(key);
    if (info === "error") return;   // não devia sobrar nenhum; por segurança
    let label = "";
    if (info === "pending") label = "…";
    else if (info && typeof info === "object") label = jiraIssueLabel(info);
    out.push({ key, label, epic: (info && typeof info === "object" && info.epicKey) ? info : null, tasks: [], manual: true });
  });
  if (pruned) jiraSaveManualKeys();
  return out;
}

// ---------- painel "Tarefas por ligar" (origem do arrasto, nesta página) ----------
// Sem isto era preciso ir ao separador Por fazer para ligar uma issue a uma
// tarefa: o painel põe as tarefas ainda sem issue ao lado dos cartões, e
// arrastar uma para um cartão faz a ligação (o cartão já sabe receber este
// arrasto — é o mesmo payload {kind:"todo", id} do arrasto no Por fazer).
const JIRA_TODO_OPEN_KEY = "bsp-tracker-jira-todo-open";
let jiraTodoOpen = localStorage.getItem(JIRA_TODO_OPEN_KEY) !== "0";

// tarefas ainda sem issue ligada (cada item só pode ter uma, por isso ligadas
// não fazem falta aqui). As concluídas vão para o fim: raramente é nelas que se
// liga trabalho novo, mas continuam à mão para registar esforço já feito.
function jiraUnlinkedTodos() {
  const livres = (todos || []).filter(it => it && !(it.jiraIssues || []).length);
  return [
    ...livres.filter(it => todoColOf(it) !== "done"),
    ...livres.filter(it => todoColOf(it) === "done"),
  ];
}

// prioridade sem botão: aqui não se muda nada (o badge clicável vive no Por
// fazer), só se mostra o que fuja ao normal, para se saber o que arrastar
function jiraTodoPrioHtml(it) {
  const prio = todoPriorityOf(it);
  if (prio === "normal") return "";
  return `<span class="jiraTodoPrio prio-${prio}" title="${esc(t(TODO_PRIORITY_LABEL[prio]))}">` +
    `${TODO_PRIORITY_GLYPH[prio]}</span>`;
}

function renderJiraTodoPanel() {
  const items = jiraUnlinkedTodos();
  $("jiraTodoTitle").textContent = t("jira_todo_title");
  $("jiraTodoCount").textContent = String(items.length);
  $("jiraTodoCaret").textContent = jiraTodoOpen ? "▾" : "▸";
  $("jiraTodoToggle").title = t(jiraTodoOpen ? "jira_todo_hide" : "jira_todo_show");
  $("jiraTodoToggle").setAttribute("aria-expanded", jiraTodoOpen ? "true" : "false");
  $("jiraTodoList").classList.toggle("hidden", !jiraTodoOpen);
  if (!jiraTodoOpen) return;              // fechado: nada para montar
  if (!items.length) {
    $("jiraTodoList").innerHTML =
      `<div class="jiraTodoEmpty">${esc(t((todos || []).length ? "jira_todo_empty" : "jira_todo_none"))}</div>`;
    return;
  }
  const dica = t("jira_todo_drag");
  $("jiraTodoList").innerHTML = items.map(it => {
    const titulo = it.title || "";
    return `<div class="jiraTodoItem${todoColOf(it) === "done" ? " isDone" : ""}" draggable="true"
    data-jtodoid="${esc(it.id)}" title="${esc(titulo ? `${titulo}\n${dica}` : dica)}">
    ${kindChip(it.kind, it.ref)}${jiraTodoPrioHtml(it)}<span class="jiraTodoItemTitle">${esc(titulo)}</span>
  </div>`;
  }).join("");
}

$("jiraTodoToggle").addEventListener("click", () => {
  jiraTodoOpen = !jiraTodoOpen;
  localStorage.setItem(JIRA_TODO_OPEN_KEY, jiraTodoOpen ? "1" : "0");
  renderJiraTodoPanel();
});

// exatamente o payload que o arrasto do Por fazer escreve (todo.js) e que o
// drop dos cartões desta página já espera: {kind:"todo", id}
$("jiraTodoList").addEventListener("dragstart", e => {
  const row = e.target.closest ? e.target.closest("[data-jtodoid]") : null;
  if (!row) return;
  e.dataTransfer.setData("application/json", JSON.stringify({ kind: "todo", id: row.dataset.jtodoid }));
  e.dataTransfer.effectAllowed = "move";
});

function renderJiraPage() {
  renderJiraTodoPanel();
  const map = jiraIssueMap();
  const all = [...map.values(), ...jiraManualEntries(map)]
    .sort((a, b) => a.key.localeCompare(b.key));
  const needle = jiraPageFilter.trim().toLowerCase();
  const shown = needle
    ? all.filter(e => e.key.toLowerCase().includes(needle) || e.label.toLowerCase().includes(needle))
    : all;
  $("jiraPageBody").innerHTML = shown.map(e => `<div class="jiraCard" data-jirakey="${esc(e.key)}">
  <div class="jiraCardHead">
    ${jiraKeyBadgeHtml(e.key, e.label)}
    <span class="jiraCardSummary" title="${esc(e.label)}">${esc(e.label)}</span>
    <button type="button" class="mini" data-jiralog="${esc(e.key)}" data-jiralabel="${esc(e.label)}" title="${esc(t("jira_log_action"))}">⏱+</button>
    ${e.manual ? `<button type="button" class="ccr-x" data-jiraremove="${esc(e.key)}" title="Remover (ainda não está ligada a nenhuma tarefa)">✕</button>` : ""}
  </div>
  ${jiraEpicHtml(jiraEpicOf(e.key, e.epic))}
  <ul class="jiraCardTasks">${e.tasks.map(it => `<li class="jiraCardTask" draggable="true" data-jtid="${esc(it.id)}" data-jtfromkey="${esc(e.key)}" title="${esc(it.title || "")}">
    ${kindChip(it.kind, it.ref)}<span class="jiraCardTaskTitle">${esc(it.title || "")}</span>
    ${it.jiraLoggedSeconds ? `<span class="jiraCardTaskEffort" title="${esc(t("jira_task_effort_title"))}">⏱ ${esc(formatJiraEffort(it.jiraLoggedSeconds))}</span>` : ""}
    <button type="button" class="ccr-x" data-jiraunlink="${esc(e.key)}|${esc(it.id)}" title="${esc(t("t_jira_unlink"))}">✕</button>
  </li>`).join("")}</ul>
</div>`).join("");
  $("jiraPageEmpty").classList.toggle("hidden", shown.length > 0);
}

$("jiraPageSearch").addEventListener("input", e => {
  jiraPageFilter = e.target.value || "";
  renderJiraPage();
  scheduleJiraSearch(jiraPageFilter);
});

// o mesmo campo serve para acrescentar: escrever/colar uma chave e Enter cria
// logo o cartão, mesmo que a issue ainda não esteja ligada a tarefa nenhuma
$("jiraPageSearch").addEventListener("keydown", e => {
  if (e.key === "Escape") { hideJiraSearchResults(); return; }
  if (e.key !== "Enter") return;
  e.preventDefault();
  addJiraManualKey(e.target.value);
});

// ---------- procurar issues no próprio Jira (não só nos cartões da app) ----------
// O campo acima filtra o que já está na página; quem procura por palavras quer
// encontrar uma issue que ainda não está cá. A lista de resultados vem do
// servidor (/api/jira/search) e escolher um resultado cria o cartão.
let jiraSearchTimer = null;
let jiraSearchSeq = 0;

function hideJiraSearchResults() {
  $("jiraSearchResults").classList.add("hidden");
  $("jiraSearchResults").innerHTML = "";
}

function showJiraSearchHint(msg) {
  $("jiraSearchResults").innerHTML = `<div class="jiraSearchNote">${esc(msg)}</div>`;
  $("jiraSearchResults").classList.remove("hidden");
}

function renderJiraSearchResults(issues, more) {
  if (!issues.length) { showJiraSearchHint(t("jira_search_none")); return; }
  const rows = issues.map(j => {
    const label = jiraIssueLabel(j);
    return `<button type="button" class="jiraSearchItem" data-jirapick="${esc(j.key)}" title="${esc(label)}">
    <span class="todoJiraKey">${esc(j.key)}</span><span class="jiraSearchSummary">${esc(label)}</span>${jiraEpicHtml(j)}
  </button>`;
  }).join("");
  const note = more ? `<div class="jiraSearchNote">${esc(t("jira_search_more"))}</div>` : "";
  $("jiraSearchResults").innerHTML = rows + note;
  $("jiraSearchResults").classList.remove("hidden");
}

function scheduleJiraSearch(text) {
  clearTimeout(jiraSearchTimer);
  const termo = String(text || "").trim();
  if (!jiraConfigured || termo.length < 2) { hideJiraSearchResults(); return; }
  jiraSearchTimer = setTimeout(() => runJiraSearch(termo), 400);
}

async function runJiraSearch(termo) {
  const seq = ++jiraSearchSeq;
  showJiraSearchHint(t("jira_search_wait"));
  try {
    const res = await fetch("/api/jira/search?q=" + encodeURIComponent(termo));
    const out = await res.json();
    if (seq !== jiraSearchSeq) return;          // já há uma pesquisa mais recente
    if (out.error) { showJiraSearchHint(out.error); return; }
    renderJiraSearchResults(out.issues || [], !!out.more);
  } catch (err) {
    if (seq === jiraSearchSeq) showJiraSearchHint(err.message || t("err_server"));
  }
}

$("jiraSearchResults").addEventListener("click", e => {
  const btn = e.target.closest("[data-jirapick]");
  if (!btn) return;
  hideJiraSearchResults();
  addJiraManualKey(btn.dataset.jirapick);
});

document.addEventListener("click", e => {
  if (!e.target.closest(".jiraSearchField")) hideJiraSearchResults();
});

// vai para a página Jira e destaca o cartão desta issue (a partir do badge de
// uma tarefa, para além do link que abre a issue real no Jira). Não filtra
// pela chave (um filtro por substring, ex. "BSP-1", também mostraria
// "BSP-10", "BSP-11", ...) - limpa o filtro que lá estivesse e salta direto
// ao cartão certo, tal como o "ver a origem" de uma tarefa Excel/CCR.
function jiraGotoIssue(key) {
  jiraPageFilter = "";
  $("jiraPageSearch").value = "";
  showView("jira");
  const card = [...$("jiraPageBody").querySelectorAll(".jiraCard")].find(c => c.dataset.jirakey === key);
  if (!card) return;
  card.scrollIntoView({ block: "center", behavior: "smooth" });
  void card.offsetWidth;   // reinicia a animação se for o mesmo cartão
  card.classList.add("flashSrc");
  setTimeout(() => card.classList.remove("flashSrc"), 2600);
}

// vai ver uma tarefa (a partir da sua linha num cartão da página Jira)
function jiraGotoTask(id) {
  showView("todo");
  const el = itemBoxEl({ kind: "todo", key: id });
  if (!el) { toast(t("src_notfound"), "err"); return; }
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  openItemBox(el);
}

// ---------- arrastar tarefas entre issues ----------
function jiraClearDropReady() {
  document.querySelectorAll(".jiraCard.dropready").forEach(c => c.classList.remove("dropready"));
}

$("jiraPageBody").addEventListener("dragover", e => {
  e.preventDefault();
  // limpar sempre antes de marcar evita o realce preso ao sair de um cartão
  jiraClearDropReady();
  const card = e.target.closest ? e.target.closest(".jiraCard") : null;
  if (card) card.classList.add("dropready");
});

$("jiraPageBody").addEventListener("dragend", jiraClearDropReady);
// sair da grelha inteira (ou desistir do arrasto lá fora) apaga o realce
$("jiraPageBody").addEventListener("dragleave", e => {
  if (!e.relatedTarget || !$("jiraPageBody").contains(e.relatedTarget)) jiraClearDropReady();
});

$("jiraPageBody").addEventListener("drop", async e => {
  e.preventDefault();
  jiraClearDropReady();
  const card = e.target.closest ? e.target.closest(".jiraCard") : null;
  if (!card) return;
  const key = card.dataset.jirakey;
  const p = dragPayload(e);
  if (!p || !key) return;
  if (p.kind === "todo" && p.id) {
    await postTodo({ action: "jira_link", id: p.id, key });
    return;
  }
  if (p.kind === "jiraTask" && p.id) {
    if (p.fromKey === key) return;      // largado no próprio cartão
    const fromItem = (todos || []).find(it => it.id === p.id);
    const fromIssue = fromItem && (fromItem.jiraIssues || []).find(j => j.key === p.fromKey);
    const unlinked = await postTodo({ action: "jira_unlink", id: p.id, key: p.fromKey });
    if (!unlinked) return;              // falhou a desligar - não tentar ligar à nova
    const linked = await postTodo({ action: "jira_link", id: p.id, key });
    // a ligação nova falhou (ex.: Jira em baixo) - repor a ligação antiga em vez
    // de deixar a tarefa órfã das duas issues
    if (!linked) await postTodo({ action: "jira_link", id: p.id, key: p.fromKey });
    // se a origem ficou mesmo sem tarefas (relance com sucesso, ou os dois
    // pedidos falharam e nem a antiga voltou a ligar-se), o cartão mantém-se à
    // vista; se a antiga voltou a ligar-se, isto não faz nada (já não é órfã)
    jiraKeepAsManualIfOrphaned(p.fromKey, fromIssue);
  }
});

$("jiraPageBody").addEventListener("dragstart", e => {
  const li = e.target.closest ? e.target.closest(".jiraCardTask") : null;
  if (!li) return;
  e.dataTransfer.setData("application/json", JSON.stringify({
    kind: "jiraTask", id: li.dataset.jtid, fromKey: li.dataset.jtfromkey,
  }));
  e.dataTransfer.effectAllowed = "move";
});

$("jiraPageBody").addEventListener("click", e => {
  // cartão acrescentado à mão: só existe neste browser, não há nada a desligar
  const removeBtn = e.target.closest("[data-jiraremove]");
  if (removeBtn) {
    const key = removeBtn.dataset.jiraremove;
    jiraManualKeys.delete(key);
    jiraManualInfo.delete(key);
    jiraSaveManualKeys();
    renderJiraPage();
    return;
  }
  const logBtn = e.target.closest("[data-jiralog]");
  if (logBtn) {
    openJiraLogModal(null, logBtn.dataset.jiralog, logBtn.dataset.jiralabel);
    return;
  }
  const unlinkBtn = e.target.closest("[data-jiraunlink]");
  if (unlinkBtn) {
    const [key, id] = unlinkBtn.dataset.jiraunlink.split("|");
    const item = (todos || []).find(it => it.id === id);
    const issue = item && (item.jiraIssues || []).find(j => j.key === key);
    postTodo({ action: "jira_unlink", id, key }).then(ok => {
      if (ok) jiraKeepAsManualIfOrphaned(key, issue);
    });
    return;
  }
  // clicar na própria tarefa (fora dos botões acima): ir ver essa tarefa no TODO
  const taskLi = e.target.closest("[data-jtid]");
  if (taskLi) jiraGotoTask(taskLi.dataset.jtid);
});

// ---------- definições: URL + token ----------
let jiraConfigured = false;

function renderJiraState() {
  $("jiraSaveBtn").textContent = t("jira_save");
  $("jiraToken").placeholder = jiraConfigured ? t("jira_token_set") : t("jira_token_ph");
  $("jiraUrl").placeholder = t("jira_url_ph");
  $("jiraState").innerHTML = `<span class="stateDot ${jiraConfigured ? "ok" : ""}"></span>` +
    esc(t(jiraConfigured ? "jira_state_ok" : "jira_state_off"));
  // o separador do Jira só existe com o Jira configurado; se deixar de estar
  // configurado enquanto se está lá, volta-se ao TODO
  const tab = document.querySelector('.tabs button[data-view="jira"]');
  if (tab) tab.classList.toggle("hidden", !jiraConfigured);
  if (!jiraConfigured) {
    if (sideView === "jira") exitSplit();
    if (currentView === "jira") showView("todo");
  }
}

async function refreshJiraSettings() {
  try {
    const res = await fetch("/api/jira/config");
    const out = await res.json();
    jiraConfigured = !!out.configured;
    jiraBaseUrl = out.baseUrl || "";
    // não mexer no campo enquanto está a ser escrito
    if (document.activeElement !== $("jiraUrl")) $("jiraUrl").value = out.baseUrl || "";
  } catch (e) {
    jiraConfigured = false;
    jiraBaseUrl = "";
  }
  renderJiraState();
  // os links das issues já ligadas passam a ter (ou deixam de ter) URL
  if (currentView === "todo" || sideView === "todo") renderTodo();
  jiraRenderPageIfVisible();
}

async function saveJiraSettings() {
  const btn = $("jiraSaveBtn");
  btn.disabled = true;
  try {
    const res = await fetch("/api/jira/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl: $("jiraUrl").value.trim(), token: $("jiraToken").value }),
    });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || "?");
    // o token fica só no servidor; o campo volta a vazio de propósito
    $("jiraToken").value = "";
    await refreshJiraSettings();
    toast(t("jira_saved"), "ok");
    if (currentView === "todo" || sideView === "todo") renderTodo();
  } catch (err) {
    toast(`${t("jira_save_err")} ${err.message || ""}`.trim(), "err");
  } finally {
    btn.disabled = false;
  }
}

$("jiraSaveBtn").addEventListener("click", saveJiraSettings);
// entrar na página das Definições volta a ler o estado (pode ter mudado noutra
// janela) — quem chama é o renderSettingsPage() em settings.js
refreshJiraSettings();

/* ---------- estado da issue e passos do fluxo ----------
   O item do quadro mostrava a chave da issue e mais nada: para saber em que pé
   ela estava (ou para a mover) era preciso ir ao Jira. Aqui o estado vem ao
   cartão, e com ele os passos que o fluxo do projeto permite — que são
   diferentes em cada projeto, por isso são pedidos ao Jira e não adivinhados.

   O estado é lido a pedido (clicando no chip) e fica em memória: pedi-lo para
   cada cartão em cada desenho seriam dezenas de pedidos ao Jira por minuto. */
const jiraStates = new Map();        // key -> {status, statusCategory, transitions}
const jiraStateLoading = new Set();

// gaveta do Jira -> classe de cor da app (os NOMES dos estados mudam de
// projeto para projeto; a gaveta, não)
const JIRA_CAT_CLASS = { new: "todo", indeterminate: "doing", done: "done" };

function jiraStateChipHtml(key) {
  const estado = jiraStates.get(key);
  if (!estado) {
    return `<button type="button" class="mini jiraStateBtn" data-jirastate="${esc(key)}"` +
      ` title="${esc(t("jira_state_load"))}">◔</button>`;
  }
  const cls = JIRA_CAT_CLASS[estado.statusCategory] || "todo";
  const passos = (estado.transitions || []).length;
  return `<button type="button" class="mini jiraStateBtn state-${cls}" data-jirastate="${esc(key)}"` +
    ` title="${esc(passos ? t("jira_state_move") : t("jira_state_none"))}">` +
    `${esc(estado.status || "?")}${passos ? " ▾" : ""}</button>`;
}

async function loadJiraState(key, force) {
  if (jiraStateLoading.has(key)) return null;
  if (!force && jiraStates.has(key)) return jiraStates.get(key);
  jiraStateLoading.add(key);
  try {
    const res = await fetch(`/api/jira/issue/${encodeURIComponent(key)}/state`);
    const out = await res.json();
    if (out.error) { toast(out.error, "bad"); return null; }
    jiraStates.set(key, out);
    return out;
  } catch (e) {
    toast(t("err_server"), "bad");
    return null;
  } finally {
    jiraStateLoading.delete(key);
  }
}

// menu dos passos possíveis, ancorado no chip (mesmo feitio do painel das
// colunas do quadro)
let jiraStatePop = null;

function closeJiraStatePop() {
  if (!jiraStatePop) return;
  jiraStatePop.remove();
  jiraStatePop = null;
}

// o passo é escolhido num clique e dado noutro: o menu abre debaixo do rato,
// na lista dos itens, e um clique a mais movia uma issue de verdade sem nada a
// perguntar — e mover para trás no Jira nem sempre é um passo que exista
// (reporte do Nuno). O passo escolhido fica aqui à espera do Confirmar; sair do
// menu deixa-o cair, porque nada foi enviado.
function jiraStatePopHtml(key, staged) {
  const estado = jiraStates.get(key) || {};
  const cabeca = `<div class="todoColsPopHead">${esc(key)} · ${esc(estado.status || "")}</div>`;
  if (staged) {
    const alvo = staged.to && staged.to !== staged.name
      ? `${staged.name} → ${staged.to}` : staged.name;
    return cabeca +
      `<div class="jiraMoveStaged">${esc(alvo)}</div>` +
      `<p class="todoColsPopHint">${esc(t("jira_move_staged"))}</p>` +
      `<button type="button" class="exportOpt jiraMoveGo" data-jiramovego="1">` +
      `${esc(t("jira_move_go"))}</button>` +
      `<button type="button" class="exportOpt" data-jiramoveback="1">` +
      `${esc(t("jira_move_back"))}</button>`;
  }
  return cabeca + (estado.transitions || []).map(tr =>
    `<button type="button" class="exportOpt" data-jiramove="${esc(tr.id)}">` +
    `${esc(tr.name)}${tr.to && tr.to !== tr.name ? ` → ${esc(tr.to)}` : ""}</button>`).join("");
}

function openJiraStatePop(anchor, key) {
  closeJiraStatePop();
  const estado = jiraStates.get(key);
  if (!estado || !(estado.transitions || []).length) {
    toast(t("jira_state_none"), "");
    return;
  }
  const el = document.createElement("div");
  el.className = "todoColsPop exportPop jiraStatePop";
  let staged = null;                 // passo escolhido, ainda não dado
  el.innerHTML = jiraStatePopHtml(key, staged);
  document.body.appendChild(el);
  jiraStatePop = el;
  // o menu muda de altura entre a lista e a confirmação: a posição é acertada
  // sempre a partir da âncora, para não sair do ecrã na segunda vista
  const coloca = () => {
    const r = anchor.getBoundingClientRect();
    el.style.left = `${Math.max(6, Math.min(window.innerWidth - el.offsetWidth - 6, r.left))}px`;
    const abaixo = r.bottom + 6;
    el.style.top = `${abaixo + el.offsetHeight > window.innerHeight
      ? Math.max(6, r.top - el.offsetHeight - 6) : abaixo}px`;
  };
  coloca();
  el.addEventListener("click", async ev => {
    const opt = ev.target.closest("[data-jiramove]");
    if (opt) {
      staged = (estado.transitions || []).find(tr => String(tr.id) === opt.dataset.jiramove);
      if (!staged) return;
      el.innerHTML = jiraStatePopHtml(key, staged);
      coloca();
      return;
    }
    if (ev.target.closest("[data-jiramoveback]")) {
      staged = null;
      el.innerHTML = jiraStatePopHtml(key, staged);
      coloca();
      return;
    }
    if (ev.target.closest("[data-jiramovego]") && staged) {
      const id = staged.id;
      closeJiraStatePop();
      await moveJiraIssue(key, id);
    }
  });
}

async function moveJiraIssue(key, transitionId) {
  try {
    const res = await fetch(`/api/jira/issue/${encodeURIComponent(key)}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transition: transitionId }),
    });
    const out = await res.json();
    if (!out.ok) { toast(out.error || t("err_server"), "bad"); return; }
    // o estado que vale é o que o Jira diz DEPOIS do passo (uma transição pode
    // ter pós-funções que a levem mais longe), e os passos seguintes mudam com
    // ele: relê-se tudo
    await loadJiraState(key, true);
    toast(tf("jira_state_done", key, out.status || ""), "ok");
    renderTodo();
    jiraRenderPageIfVisible();
  } catch (e) {
    toast(t("err_server"), "bad");
  }
}

// clique no chip: da primeira vez vai buscar o estado, depois abre os passos
async function jiraStateTap(btn) {
  const key = btn.dataset.jirastate;
  const tinha = jiraStates.has(key);
  btn.disabled = true;
  const estado = await loadJiraState(key, tinha);
  btn.disabled = false;
  if (!estado) return;
  renderTodo();
  jiraRenderPageIfVisible();
  if (tinha) {
    // o botão foi redesenhado: usa-se o que está agora no ecrã como âncora
    const novo = document.querySelector(`[data-jirastate="${CSS.escape(key)}"]`) || btn;
    openJiraStatePop(novo, key);
  }
}

document.addEventListener("pointerdown", e => {
  if (!jiraStatePop || e.target.closest(".jiraStatePop") || e.target.closest("[data-jirastate]")) return;
  closeJiraStatePop();
}, true);

/* ---------- criar uma issue a partir de um item ----------
   Nem todo o trabalho nasce no Jira: muito começa como um item escrito à mão
   aqui. Criar a issue a partir do item (em vez de ir ao Jira e voltar para
   ligar a chave à mão) deixa o item ligado logo, e com isso o registo de
   esforço do cronómetro passa a funcionar desde o primeiro minuto. */
let jiraCreateTarget = null;         // { itemId, projects }

async function openJiraCreate(itemId) {
  const item = (todos || []).find(x => x.id === itemId);
  if (!item) return;
  jiraCreateTarget = { itemId };
  $("jiraNewSummary").value = item.title || "";
  $("jiraNewDesc").value = item.detail || "";
  $("jiraNewProject").innerHTML = `<option value="">${esc(t("loading"))}</option>`;
  $("jiraNewType").innerHTML = "";
  jiraLogNote("jiraNewError", "");
  $("jiraNewSubmit").disabled = true;
  $("jiraNewOverlay").classList.remove("hidden");
  try {
    const res = await fetch("/api/jira/projects");
    const out = await res.json();
    if (out.error) { jiraLogNote("jiraNewError", out.error); return; }
    const projetos = out.projects || [];
    if (!projetos.length) { jiraLogNote("jiraNewError", t("jira_new_no_projects")); return; }
    jiraCreateTarget.projects = projetos;
    // o último projeto usado fica guardado: quem cria issues cria-as quase
    // sempre no mesmo sítio
    const ultimo = localStorage.getItem(JIRA_PROJECT_KEY) || "";
    $("jiraNewProject").innerHTML = projetos.map(p =>
      `<option value="${esc(p.key)}"${p.key === ultimo ? " selected" : ""}>${esc(p.key)} — ${esc(p.name)}</option>`).join("");
    renderJiraNewTypes();
    $("jiraNewSubmit").disabled = false;
    $("jiraNewSummary").focus();
    $("jiraNewSummary").select();
  } catch (e) {
    jiraLogNote("jiraNewError", t("err_server"));
  }
}

const JIRA_PROJECT_KEY = "bsp-tracker-jira-project";

function renderJiraNewTypes() {
  const projetos = (jiraCreateTarget && jiraCreateTarget.projects) || [];
  const escolhido = projetos.find(p => p.key === $("jiraNewProject").value);
  const tipos = (escolhido && escolhido.types) || [];
  $("jiraNewType").innerHTML = tipos.length
    ? tipos.map(x => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join("")
    : `<option value="Task">Task</option>`;
}

function closeJiraCreate() {
  $("jiraNewOverlay").classList.add("hidden");
  jiraCreateTarget = null;
}

async function submitJiraCreate() {
  if (!jiraCreateTarget) return;
  const projeto = $("jiraNewProject").value;
  const resumo = $("jiraNewSummary").value.trim();
  if (!projeto || !resumo) { jiraLogNote("jiraNewError", t("jira_new_missing")); return; }
  jiraLogNote("jiraNewError", "");
  const btn = $("jiraNewSubmit");
  btn.disabled = true;
  try {
    const res = await fetch("/api/jira/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: projeto, summary: resumo, type: $("jiraNewType").value,
        description: $("jiraNewDesc").value.trim(), item_id: jiraCreateTarget.itemId,
      }),
    });
    const out = await res.json();
    if (!out.ok) { jiraLogNote("jiraNewError", out.error || t("err_server")); return; }
    localStorage.setItem(JIRA_PROJECT_KEY, projeto);
    if (out.todo) todos = out.todo;
    closeJiraCreate();
    toast(tf("jira_new_done", out.issue.key), "ok");
    renderTodo();
    jiraRenderPageIfVisible();
  } catch (e) {
    jiraLogNote("jiraNewError", t("err_server"));
  } finally {
    btn.disabled = false;
  }
}

$("jiraNewClose").addEventListener("click", closeJiraCreate);
$("jiraNewSubmit").addEventListener("click", submitJiraCreate);
$("jiraNewProject").addEventListener("change", renderJiraNewTypes);
$("jiraNewOverlay").addEventListener("click", e => {
  if (e.target === $("jiraNewOverlay")) closeJiraCreate();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("jiraNewOverlay").classList.contains("hidden")) {
    e.stopPropagation();
    closeJiraCreate();
  }
}, true);
