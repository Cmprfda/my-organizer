// My Organizer — Jira na lista Por fazer: ligar issues a um item, ver o esforço
// já registado e registar mais tempo (cria um worklog real no Jira)

// esforço por issue: key -> {seconds} | "pending" | "error".
// O badge é montado durante o render (síncrono), por isso o valor real só entra
// no render seguinte — ver jiraEffortBadgeHtml.
const jiraEffortCache = new Map();

function formatJiraEffort(totalSeconds) {
  const minutes = Math.max(0, Math.round((+totalSeconds || 0) / 60));
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (!h && !m) return "0m";
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
}

function invalidateJiraEffort(key) {
  jiraEffortCache.delete(key);
}

// várias issues respondem quase ao mesmo tempo: um só render para todas, e
// nunca com um editor aberto (senão apagava o que se está a escrever)
let jiraRenderTimer = null;
function jiraScheduleRender() {
  if (jiraRenderTimer) return;
  jiraRenderTimer = setTimeout(() => {
    jiraRenderTimer = null;
    if (!editorOpen) renderTodo();
  }, 80);
}

function fetchJiraEffort(key) {
  fetch("/api/jira/issue/" + encodeURIComponent(key) + "/worklog")
    .then(res => res.json())
    .then(out => {
      if (!out || out.error) jiraEffortCache.set(key, "error");
      else jiraEffortCache.set(key, { seconds: +out.totalSeconds || 0 });
    })
    .catch(() => jiraEffortCache.set(key, "error"))
    .finally(jiraScheduleRender);
}

// devolve sempre HTML já pronto com o que estiver em cache neste momento; o
// pedido ao servidor (quando falta) só volta a pedir o render mais tarde, nunca
// aqui dentro — isto corre a partir dos templates de renderTodo()
function jiraEffortBadgeHtml(key) {
  const got = jiraEffortCache.get(key);
  if (got === undefined) {
    jiraEffortCache.set(key, "pending");
    fetchJiraEffort(key);
    return "…";
  }
  if (got === "pending") return "…";
  if (got === "error") return "";
  return `⏱ ${esc(formatJiraEffort(got.seconds))}`;
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
    // o total passa a estar errado: apagar a cache faz o badge voltar a pedi-lo
    invalidateJiraEffort(key);
    renderTodo();
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

// ---------- definições: URL + token ----------
let jiraConfigured = false;

function renderJiraState() {
  $("jiraSaveBtn").textContent = t("jira_save");
  $("jiraToken").placeholder = jiraConfigured ? t("jira_token_set") : t("jira_token_ph");
  $("jiraUrl").placeholder = t("jira_url_ph");
  $("jiraState").innerHTML = `<span class="stateDot ${jiraConfigured ? "ok" : ""}"></span>` +
    esc(t(jiraConfigured ? "jira_state_ok" : "jira_state_off"));
}

async function refreshJiraSettings() {
  try {
    const res = await fetch("/api/jira/config");
    const out = await res.json();
    jiraConfigured = !!out.configured;
    // não mexer no campo enquanto está a ser escrito
    if (document.activeElement !== $("jiraUrl")) $("jiraUrl").value = out.baseUrl || "";
  } catch (e) {
    jiraConfigured = false;
  }
  renderJiraState();
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
    jiraEffortCache.clear();
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
