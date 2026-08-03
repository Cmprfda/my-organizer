// My Organizer — definições: idioma, tema, fonte de dados, OneDrive

const SHARE_APP_URL = "https://github.com/Cmprfda/my-organizer/releases/latest";

function applyLang() {
  $("langSel").value = LANG;
  $("settingsBtn").title = t("settings_title");
  $("settingsBtn").setAttribute("aria-label", t("settings_title"));
  $("settingsPanel").setAttribute("aria-label", t("settings_title"));
  document.querySelector('label[for="themeSel"]').textContent = t("theme_title");
  document.querySelector('label[for="langSel"]').textContent = t("lang_title");
  renderGraphState();
  $("themeSel").title = t("theme_title");
  $("themeSel").options[0].textContent = t("theme_auto");
  $("themeSel").options[1].textContent = t("theme_light");
  $("themeSel").options[2].textContent = t("theme_dark");
  document.querySelector('.tabs button[data-view="todo"]').textContent = t("tab_todo");
  document.querySelector('.tabs button[data-view="notes"]').textContent = t("tab_notes");
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
  $("refreshTodo").title = t("t_push_todo");
  // o texto certo (Atualizar / Enviar (N)) vem do render(), com o nº pendente
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
  $("noteAdd").textContent = t("btn_note_add");
  $("folderAdd").textContent = t("btn_folder_add");
  $("noteFilter").placeholder = t("ph_note_filter");
  $("notePathInput").placeholder = t("ph_note_path");
  $("notePathInput").title = t("t_note_path");
  $("noteLinkBtn").textContent = t("note_link_btn");
  $("noteDel").title = t("t_note_del");
  $("noteToolbar").querySelector('[data-tool="select"]').title = t("t_tool_select");
  $("noteToolbar").querySelector('[data-tool="pen"]').title = t("t_tool_pen");
  $("noteToolbar").querySelector('[data-tool="line"]').title = t("t_tool_line");
  $("noteToolbar").querySelector('[data-tool="rect"]').title = t("t_tool_rect");
  $("noteToolbar").querySelector('[data-tool="ellipse"]').title = t("t_tool_ellipse");
  $("noteToolbar").querySelector('[data-tool="connector"]').title = t("t_tool_connector");
  $("noteToolbar").querySelector('[data-tool="frame"]').title = t("t_tool_frame");
  $("noteToolColor").title = t("t_tool_color");
  $("noteUndoBtn").title = t("t_note_undo");
  $("noteClearBtn").title = t("t_note_clear");
  $("noteEmpty").innerHTML = `<h2>${t("note_empty_t")}</h2><p>${t("note_empty_p")}</p>`;
  $("noteLinkTitle").textContent = t("note_link_title");
  $("noteLinkClose").title = t("t_close");
  $("noteLinkSearch").placeholder = t("ph_note_link");
  $("noteLinkOverlay").setAttribute("aria-label", t("note_link_title"));
  $("noteImgClose").title = t("t_close");
  $("noteImgOverlay").setAttribute("aria-label", t("note_img_title"));
  document.querySelector('#dropZones [data-side="left"] span').innerHTML = t("drop_left");
  document.querySelector('#dropZones [data-side="right"] span').innerHTML = t("drop_right");
  $("splitBar").title = t("t_resize");
  $("noteSideResize").title = t("t_resize");
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
  // abrir livros: botão "+", janela de escolha e painel de boas-vindas
  $("addWorkbookBtn").title = t("wb_add_title");
  $("addWorkbookBtn").setAttribute("aria-label", t("wb_add_title"));
  $("wbAddTitle").textContent = t("wb_add_title");
  $("wbAddClose").title = t("t_close");
  $("wbAddOverlay").setAttribute("aria-label", t("wb_add_title"));
  $("wbAddOneDriveTxt").textContent = t("wb_from_onedrive");
  $("wbAddOneDriveSub").textContent = t("wb_from_onedrive_sub");
  $("wbAddLocalTxt").textContent = t("wb_from_local");
  $("wbAddLocalSub").textContent = t("wb_from_local_sub");
  renderWorkbookTabs();   // já trata do painel de boas-vindas
  $("itemClose").title = t("t_close");
  $("itemOverlay").setAttribute("aria-label", t("item_box"));
  // botão/campos do Jira (o estado em si vive em jira.js)
  renderJiraState();
  document.querySelector('label[for="jiraPageSearch"]').textContent = t("jira_search_lbl");
  $("jiraPageSearch").placeholder = t("jira_search_ph");
  $("jiraLogClose").title = t("t_close");
  $("jiraLogOverlay").setAttribute("aria-label", t("jira_log_action"));
  $("jiraLogSubmit").textContent = t("jira_log_submit");
  document.querySelector('label[for="jiraLogTime"]').textContent = t("jira_lbl_time");
  document.querySelector('label[for="jiraLogStarted"]').textContent = t("jira_lbl_started");
  document.querySelector('label[for="jiraLogComment"]').textContent = t("jira_lbl_comment");
  $("jiraLogTime").placeholder = t("jira_ph_time");
  $("jiraLogComment").placeholder = t("jira_ph_comment");
  $("appUpdateBtn").textContent = t("btn_app_update");
  $("appUpdateBtn").title = t("t_app_update");
  $("shareAppBtn").title = t("t_share_app");
  $("changelogBtn").textContent = t("btn_changelog");
  $("changelogBtn").title = t("t_changelog");
  $("changelogTitle").textContent = t("changelog_title");
  renderHelp();
  // a página do Jira monta os seus textos no render (painel "Tarefas por ligar")
  jiraRenderPageIfVisible();
  if (currentView === "todo" || sideView === "todo") renderTodo();
  if (currentView === "notes" || sideView === "notes") renderNotes();
}

$("shareAppBtn").addEventListener("click", () => {
  window.open(SHARE_APP_URL, "_blank", "noopener,noreferrer");
});

$("appUpdateBtn").addEventListener("click", async () => {
  const btn = $("appUpdateBtn");
  btn.disabled = true;
  toast(t("upd_checking"));
  try {
    const res = await fetch("/api/app-update", { method: "POST" });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "?");
    if (j.updated) {
      toast(t("upd_found"), "ok");
      setTimeout(() => location.reload(), 4000);
    } else {
      toast(t("upd_ok"), "ok");
      btn.disabled = false;
    }
  } catch (e) {
    toast(t("upd_err") + " " + e.message, "err");
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
let graphInfo = { configured: false, connected: false, code: "", url: "", pending: false, error: "",
                  account_email: "", account_name: "" };
let graphPoll = null;
// prova ao vivo (não só o prazo do token em cache) de que o pedido de 20 em 20
// segundos ao OneDrive falhou por falta de rede — ver checkForChanges() em main.js
let liveOffline = false;
// motivo dessa falha, para o distintivo o poder explicar em vez de só ficar vermelho
let liveError = "";

// conta Microsoft memorizada no servidor (só email/nome — o token nunca sai de
// lá). Mostra-se para se saber qual é a identidade que vai ser reutilizada: o
// servidor renova a sessão sozinho e, se algum dia tiver de pedir autenticação
// outra vez, a lista de contas da Microsoft já vem com esta escolhida.
function graphAccountLine() {
  const mail = graphInfo.account_email || "";
  if (!mail) return "";
  const en = LANG === "en";
  const lbl = graphInfo.connected
    ? (en ? "Signed in as" : "Sessão de")
    : (en ? "Reconnects as" : "Religa como");
  const quem = graphInfo.account_name ? `${graphInfo.account_name} · ${mail}` : mail;
  return `<br><span class="graphAcct" style="opacity:.75">${esc(lbl)}: ${esc(quem)}</span>`;
}

function renderGraphState() {
  $("graphBox").classList.toggle("hidden", !graphInfo.configured);
  renderConnBadge();
  if (!graphInfo.configured) return;
  let txt;
  if (graphInfo.code) txt = tf("graph_code", graphInfo.url, graphInfo.code);
  else if (graphInfo.pending) txt = t("graph_wait");
  else if (graphInfo.connected) txt = t(graphInfo.method === "cli" ? "graph_on_cli" : "graph_on");
  else txt = graphInfo.can_login ? t("graph_off") : `${t("graph_off")} — ${t("graph_need_cli")}`;
  // ponto verde/vermelho a acompanhar o texto do estado. Com sessão iniciada
  // mas o último pedido ao OneDrive falhado, isto tem de dizer o mesmo que o
  // distintivo lá em cima — senão fica "ligado" aqui e vermelho lá
  const falhaViva = graphInfo.connected && liveOffline;
  if (falhaViva) txt = `${t("conn_web_err")}${liveError ? ` — ${liveError}` : ""}`;
  const cor = graphInfo.connected && !falhaViva ? "ok" : (graphInfo.pending ? "" : "err");
  $("graphState").innerHTML = `<span class="stateDot ${cor}"></span>` +
    esc(graphInfo.error && !graphInfo.pending ? `${txt} — ${graphInfo.error}` : txt) +
    graphAccountLine();
  $("graphState").title = graphInfo.account_email || "";
  $("graphBtn").textContent = graphInfo.connected ? t("graph_disconnect") : t("graph_connect");
  // sem client_id só há a via da Azure CLI, que se gere fora da app
  const usable = graphInfo.connected ? graphInfo.method !== "cli" : graphInfo.can_login;
  $("graphBtn").classList.toggle("hidden", graphInfo.pending || !usable);
}

// distintivo no canto superior direito: verde quando os dados vêm do OneDrive,
// vermelho quando algo está por ligar/falhou, neutro com o ficheiro local
function renderConnBadge() {
  const badge = $("connBadge"), dot = $("connDot"), txt = $("connText");
  // "pronto a ligar" só quando a sessão do OneDrive não está mesmo iniciada;
  // com sessão iniciada a culpa é do pedido/rede e dizer o contrário confunde
  // quem acabou de se ligar
  const semSessao = !!(graphInfo.configured && !graphInfo.connected);
  const webErr = () => (semSessao ? t("conn_web_off") : t("conn_web_err"));
  let estado, texto, extra = "";
  if (liveOffline) {
    // o token em cache ainda parece válido, mas o pedido de 20/20s ao OneDrive
    // acabou de falhar de verdade (sem rede) — isso pesa mais do que o prazo do token
    estado = "err";
    texto = webErr();
    if (liveError) extra = ` — ${liveError}`;
  } else if (lastData && lastData.error) {
    // um erro é sempre vermelho, mesmo quando a resposta de erro traz
    // "source": "onedrive" (ex: pedido de login) — isso não prova ligação
    estado = "err";
    texto = lastData.source === "onedrive" ? webErr() : t("conn_offline");
  } else if (lastData && (lastData.source === "onedrive" || lastData.synced_copy)) {
    estado = "ok";
    texto = activeBookName() || graphInfo.book || t("conn_web");
    if (lastData.synced_copy) extra = ` — ${t("t_synced_copy")}`;
  } else if (semSessao) {
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
  // sair da conta afeta todos os livros do OneDrive abertos, não só o da frente
  if (!connecting) { loadAllTabs(); return; }
  if (!graphInfo.pending) return;
  // o utilizador autentica-se no browser; aqui só se espera pelo resultado
  window.open(graphInfo.url, "_blank", "noopener");
  clearInterval(graphPoll);
  graphPoll = setInterval(async () => {
    await graphAction("state");
    if (graphInfo.connected || !graphInfo.pending) {
      clearInterval(graphPoll);
      graphPoll = null;
      if (graphInfo.connected) { toast(t("graph_on"), "ok"); loadAllTabs(); }
      else toast(graphInfo.error || t("graph_off"), "err");
    }
  }, 4000);
});


