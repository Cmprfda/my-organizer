// My Organizer — definições: idioma, tema, fonte de dados, OneDrive

const SHARE_APP_URL = "https://criticalsoftwaresa-my.sharepoint.com/:f:/g/personal/cm-andrade_criticalsoftware_com/IgBCZw_05_5CQ5dGXDDDpjwnASxLWy-Rt6YlM2ylqZxr1xc?e=3Gk6qi";

function applyLang() {
  $("langSel").value = LANG;
  $("settingsBtn").title = t("settings_title");
  $("settingsBtn").setAttribute("aria-label", t("settings_title"));
  $("settingsPanel").setAttribute("aria-label", t("settings_title"));
  document.querySelector('label[for="themeSel"]').textContent = t("theme_title");
  document.querySelector('label[for="langSel"]').textContent = t("lang_title");
  document.querySelector('label[for="sourceSel"]').textContent = t("source_title");
  $("sourceSel").title = t("source_title");
  $("sourceSel").options[0].textContent = t("source_auto");
  $("sourceSel").options[1].textContent = t("source_web");
  $("sourceSel").options[2].textContent = t("source_local");
  renderGraphState();
  $("themeSel").title = t("theme_title");
  $("themeSel").options[0].textContent = t("theme_auto");
  $("themeSel").options[1].textContent = t("theme_light");
  $("themeSel").options[2].textContent = t("theme_dark");
  document.querySelector('.tabs button[data-view="excel"]').textContent = t("tab_tasks");
  document.querySelector('.tabs button[data-view="todo"]').textContent = t("tab_todo");
  document.querySelector('.tabs button[data-view="feedback"]').textContent = t("tab_feedback");
  const sheetTxt = $("sheetName").textContent, personTxt = $("personName").textContent;
  $("excelSub").innerHTML = `${t("sub_sheet")} <strong id="sheetName">${esc(sheetTxt)}</strong> · ` +
    `${t("sub_tasks_of")} <strong id="personName">${esc(personTxt)}</strong>`;
  document.querySelector('label[for="fileSelect"]').textContent = t("lbl_file");
  document.querySelector('label[for="sheetSelect"]').textContent = t("lbl_sheet");
  document.querySelector('label[for="bookQuick"]').textContent = t("lbl_book");
  $("bookQuick").title = t("t_book_quick");
  document.querySelector('label[for="personInput"]').textContent = t("lbl_name");
  document.querySelector('label[for="search"]').textContent = t("lbl_search");
  $("personInput").placeholder = t("ph_name");
  $("search").placeholder = t("ph_search");
  renderSearchChips();
  $("viewToggle").textContent = compactView ? t("btn_full") : t("btn_compact");
  $("taskModeList").textContent = t("task_mode_list");
  $("taskModeCards").textContent = t("task_mode_cards");
  $("taskModeList").title = t("t_task_mode_list");
  $("taskModeCards").title = t("t_task_mode_cards");
  $("taskModeList").classList.toggle("active", taskLayout === "list");
  $("taskModeCards").classList.toggle("active", taskLayout === "cards");
  $("toggleAll").textContent = showAll ? `${t("btn_only")} ${PERSON.split(" ")[0]}` : t("btn_all");
  $("clearLocals").textContent = t("btn_locals");
  $("clearNotes").textContent = t("btn_notes");
  $("fetchBtn").textContent = t("btn_fetch");
  $("reloadOnly").textContent = t("btn_reload_only");
  document.querySelector('label[for="ccrId"]').textContent = t("lbl_newccr");
  $("ccrAdd").textContent = t("btn_add");
  document.querySelector("#ccrTablebox thead tr").innerHTML =
    `<th>CCR</th><th>${t("th_before")}</th><th>${t("th_after")}</th><th>${t("th_notes")}</th><th>${t("hdr_action")}</th><th></th>`;
  $("ccrEmpty").innerHTML = `<h2>${t("ccr_empty_t")}</h2><p>${t("ccr_empty_p")}</p>`;
  document.querySelector('label[for="todoNew"]').textContent = t("lbl_newtodo");
  $("todoNew").placeholder = t("ph_todo");
  $("todoAdd").textContent = t("btn_add");
  $("todoModeList").textContent = t("todo_mode_list");
  $("todoModeKanban").textContent = t("todo_mode_kanban");
  $("todoEmpty").innerHTML = `<h2>${t("todo_empty_t")}</h2><p>${t("todo_empty_p")}</p>`;
  document.querySelector('#dropZones [data-side="left"] span').innerHTML = t("drop_left");
  document.querySelector('#dropZones [data-side="right"] span').innerHTML = t("drop_right");
  $("splitBar").title = t("t_resize");
  $("sideSwap").title = t("t_swap");
  $("sideClose").title = t("t_closepane");
  if (sideView) $("sideTitle").textContent = tabLabel(sideView);
  document.querySelector('label[for="fbText"]').textContent = t("lbl_fb");
  $("fbText").placeholder = t("ph_fb");
  document.querySelector('label[for="fbFiles"]').textContent = t("lbl_imgs");
  $("fbSend").textContent = t("btn_send");
  $("helpBtn").title = t("help_title");
  $("helpBtn").setAttribute("aria-label", t("help_title"));
  $("helpTitle").textContent = t("help_title");
  $("helpClose").title = t("t_close");
  $("helpOverlay").setAttribute("aria-label", t("help_title"));
  $("pickerTitle").textContent = t("pick_title");
  $("pickerClose").title = t("t_close");
  $("pickerSearch").placeholder = t("pick_search");
  $("pickerOverlay").setAttribute("aria-label", t("pick_title"));
  $("appUpdateBtn").textContent = t("btn_app_update");
  $("appUpdateBtn").title = t("t_app_update");
  $("shareAppBtn").textContent = t("btn_share_app");
  $("shareAppBtn").title = t("t_share_app");
  renderHelp();
  if (currentView === "todo" || sideView === "todo") renderTodo();
}

$("shareAppBtn").addEventListener("click", () => {
  window.open(SHARE_APP_URL, "_blank", "noopener,noreferrer");
});

$("appUpdateBtn").addEventListener("click", async () => {
  const btn = $("appUpdateBtn"), status = $("appUpdateStatus");
  btn.disabled = true;
  status.textContent = t("upd_checking");
  try {
    const res = await fetch("/api/app-update", { method: "POST" });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "?");
    if (j.updated) {
      status.textContent = t("upd_found");
      setTimeout(() => location.reload(), 4000);
    } else {
      status.textContent = t("upd_ok");
      setTimeout(() => { status.textContent = ""; btn.disabled = false; }, 4000);
    }
  } catch (e) {
    status.textContent = t("upd_err") + " " + e.message;
    btn.disabled = false;
  }
});

$("langSel").addEventListener("change", () => {
  LANG = $("langSel").value === "en" ? "en" : "pt";
  localStorage.setItem("bsp-tracker-lang", LANG);
  clearFilters();  // os nomes dos filtros de papel mudam com a língua
  applyLang();
  load();
});

// tema: "auto" segue o sistema, "light"/"dark" forçam a escolha do utilizador
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme() {
  const pref = localStorage.getItem("bsp-tracker-theme") || "auto";
  $("themeSel").value = pref;
  const dark = pref === "dark" || (pref === "auto" && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

$("themeSel").addEventListener("change", () => {
  localStorage.setItem("bsp-tracker-theme", $("themeSel").value);
  applyTheme();
});

darkQuery.addEventListener("change", applyTheme);
applyTheme();

// fonte dos dados: ficheiro local ou o livro no OneDrive lido pela API do
// Excel (Microsoft Graph). O bloco só aparece se o servidor estiver configurado.
let graphInfo = { configured: false, connected: false, code: "", url: "", pending: false, error: "" };
let graphPoll = null;
// prova ao vivo (não só o prazo do token em cache) de que o pedido de 20 em 20
// segundos ao OneDrive falhou por falta de rede — ver checkForChanges() em main.js
let liveOffline = false;

function renderGraphState() {
  $("sourceSel").value = SOURCE;
  $("sourceRow").classList.toggle("hidden", !graphInfo.configured);
  $("graphBox").classList.toggle("hidden", !graphInfo.configured);
  renderConnBadge();
  if (!graphInfo.configured) return;
  let txt;
  if (graphInfo.code) txt = tf("graph_code", graphInfo.url, graphInfo.code);
  else if (graphInfo.pending) txt = t("graph_wait");
  else if (graphInfo.connected) txt = t(graphInfo.method === "cli" ? "graph_on_cli" : "graph_on");
  else txt = graphInfo.can_login ? t("graph_off") : `${t("graph_off")} — ${t("graph_need_cli")}`;
  // ponto verde/vermelho a acompanhar o texto do estado
  const cor = graphInfo.connected ? "ok" : (graphInfo.pending ? "" : "err");
  $("graphState").innerHTML = `<span class="stateDot ${cor}"></span>` +
    esc(graphInfo.error && !graphInfo.pending ? `${txt} — ${graphInfo.error}` : txt);
  $("graphBtn").textContent = graphInfo.connected ? t("graph_disconnect") : t("graph_connect");
  // sem client_id só há a via da Azure CLI, que se gere fora da app
  const usable = graphInfo.connected ? graphInfo.method !== "cli" : graphInfo.can_login;
  $("graphBtn").classList.toggle("hidden", graphInfo.pending || !usable);
  renderBookState();
}

// livro do OneDrive em uso (escolhido no seletor de ficheiros)
function renderBookState() {
  const ligado = !!graphInfo.connected;
  $("bookBox").classList.toggle("hidden", !ligado);
  $("bookBtn").textContent = t("book_change");
  const nome = graphInfo.book || "";
  $("bookState").innerHTML = `<span class="stateDot ${nome ? "ok" : ""}"></span>` +
    `${t("book_title")}: ${esc(nome || t("book_none"))}`;
  $("bookState").title = graphInfo.book_path || "";
}

// distintivo no canto superior direito: verde quando os dados vêm do OneDrive,
// vermelho quando algo está por ligar/falhou, neutro com o ficheiro local
function renderConnBadge() {
  const badge = $("connBadge"), dot = $("connDot"), txt = $("connText");
  let estado, texto, extra = "";
  if (liveOffline) {
    // o token em cache ainda parece válido, mas o pedido de 20/20s ao OneDrive
    // acabou de falhar de verdade (sem rede) — isso pesa mais do que o prazo do token
    estado = "err";
    texto = t("conn_web_off");
  } else if (lastData && lastData.error) {
    // um erro é sempre vermelho, mesmo quando a resposta de erro traz
    // "source": "onedrive" (ex: pedido de login) — isso não prova ligação
    estado = "err";
    texto = lastData.source === "onedrive" ? t("conn_web_off") : t("conn_offline");
  } else if (lastData && (lastData.source === "onedrive" || lastData.synced_copy)) {
    estado = "ok";
    texto = graphInfo.book || t("conn_web");
    if (lastData.synced_copy) extra = ` — ${t("t_synced_copy")}`;
  } else if (graphInfo.configured && !graphInfo.connected) {
    estado = "err";
    texto = t("conn_web_off");
  } else {
    estado = "";
    texto = t("conn_local");
  }
  badge.className = "connBadge " + estado;
  dot.className = "connDot " + estado;
  txt.textContent = texto;
  badge.title = `${texto}${extra} — ${t("conn_title")}`;
}

$("connBadge").addEventListener("click", e => {
  e.stopPropagation();
  setSettingsOpen($("settingsPanel").classList.contains("hidden"));
});

async function graphAction(action) {
  try {
    const res = await fetch("/api/graph", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    const out = await res.json();
    graphInfo = { ...graphInfo, ...out };
  } catch (e) {
    graphInfo = { ...graphInfo, error: t("err_server") };
  }
  renderGraphState();
}

$("graphBtn").addEventListener("click", async () => {
  const connecting = !graphInfo.connected;
  await graphAction(connecting ? "login" : "logout");
  if (!connecting) { load(); return; }
  if (!graphInfo.pending) return;
  // o utilizador autentica-se no browser; aqui só se espera pelo resultado
  window.open(graphInfo.url, "_blank", "noopener");
  clearInterval(graphPoll);
  graphPoll = setInterval(async () => {
    await graphAction("state");
    if (graphInfo.connected || !graphInfo.pending) {
      clearInterval(graphPoll);
      graphPoll = null;
      if (graphInfo.connected) { toast(t("graph_on"), "ok"); load(); }
      else toast(graphInfo.error || t("graph_off"), "err");
    }
  }, 4000);
});

$("sourceSel").addEventListener("change", () => {
  SOURCE = $("sourceSel").value;
  localStorage.setItem("bsp-tracker-source", SOURCE);
  load();
});
