// My Organizer — Jira na lista Por fazer: ligar issues a um item e registar
// mais tempo (cria um worklog real no Jira)

// URL base do Jira, só para montar links "abrir no Jira" (o token nunca sai
// do servidor); fica vazio enquanto as Definições não tiverem sido lidas
let jiraBaseUrl = "";

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

// agora, no formato do <input type="datetime-local">
function jiraLocalNow() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function jiraLogNote(id, msg) {
  const el = $(id);
  el.textContent = msg || "";
  el.classList.toggle("hidden", !msg);
}

function openJiraLogModal(itemId, key, summary) {
  jiraLogTarget = { itemId, key };
  $("jiraLogTitle").textContent = `${t("jira_log_title")} · ${key}` + (summary ? ` — ${summary}` : "");
  $("jiraLogTime").value = "";
  $("jiraLogComment").value = "";
  $("jiraLogStarted").value = jiraLocalNow();
  jiraLogNote("jiraLogError", "");
  jiraLogNote("jiraLogSuccess", "");
  $("jiraLogSubmit").disabled = false;
  $("jiraLogSubmit").textContent = t("jira_log_submit");
  $("jiraLogOverlay").classList.remove("hidden");
  $("jiraLogTime").focus();
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
      }),
    });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || "?");
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

// key -> {key, label, tasks:[item, ...]}, por ordem de chave
function jiraIssueMap() {
  const map = new Map();
  (todos || []).forEach(it => {
    if (!it) return;
    (it.jiraIssues || []).forEach(j => {
      if (!j || !j.key) return;
      let entry = map.get(j.key);
      if (!entry) {
        entry = { key: j.key, label: "", tasks: [] };
        map.set(j.key, entry);
      }
      // o resumo vem repetido em cada item; fica o último que traga texto
      const label = jiraIssueLabel(j);
      if (label) entry.label = label;
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
// key -> {summary, parentSummary} | "pending" | "error"
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
  if (issue) jiraManualInfo.set(key, { summary: issue.summary || "", parentSummary: issue.parentSummary });
  else fetchJiraManualInfo(key);
  jiraRenderPageIfVisible();
}

// só corre uma vez por chave nova (ao contrário do badge do esforço, que é
// pedido a cada render), por isso não precisa de espera nem de agrupamento
function fetchJiraManualInfo(key) {
  jiraManualInfo.set(key, "pending");
  fetch("/api/jira/issue/" + encodeURIComponent(key))
    .then(res => res.json())
    .then(out => {
      if (!out || out.error) throw new Error((out && out.error) || "?");
      jiraManualInfo.set(key, { summary: out.summary || "", parentSummary: out.parentSummary });
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
    out.push({ key, label, tasks: [], manual: true });
  });
  if (pruned) jiraSaveManualKeys();
  return out;
}

function renderJiraPage() {
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
  <ul class="jiraCardTasks">${e.tasks.map(it => `<li class="jiraCardTask" draggable="true" data-jtid="${esc(it.id)}" data-jtfromkey="${esc(e.key)}" title="${esc(it.title || "")}">
    ${kindChip(it.kind)}<span class="jiraCardTaskTitle">${esc(it.title || "")}</span>
    <button type="button" class="ccr-x" data-jiraunlink="${esc(e.key)}|${esc(it.id)}" title="${esc(t("t_jira_unlink"))}">✕</button>
  </li>`).join("")}</ul>
</div>`).join("");
  $("jiraPageEmpty").classList.toggle("hidden", shown.length > 0);
}

$("jiraPageSearch").addEventListener("input", e => {
  jiraPageFilter = e.target.value || "";
  renderJiraPage();
});

// o mesmo campo serve para acrescentar: escrever/colar uma chave e Enter cria
// logo o cartão, mesmo que a issue ainda não esteja ligada a tarefa nenhuma
$("jiraPageSearch").addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  addJiraManualKey(e.target.value);
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
// abrir as Definições volta a ler o estado (pode ter mudado noutra janela)
$("settingsBtn").addEventListener("click", () => {
  if (!$("settingsPanel").classList.contains("hidden")) refreshJiraSettings();
});
refreshJiraSettings();
