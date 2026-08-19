// My Organizer — definições: idioma, tema, fonte de dados, OneDrive

const SHARE_APP_URL = "https://github.com/Cmprfda/my-organizer/releases/latest";

function applyLang() {
  $("langSel").value = LANG;
  $("settingsBtn").title = t("settings_title");
  $("settingsBtn").setAttribute("aria-label", t("settings_title"));
  $("settingsView").setAttribute("aria-label", t("settings_title"));
  $("setSecLook").textContent = t("set_sec_look");
  $("setSecOnedrive").textContent = t("set_sec_onedrive");
  $("setSecJira").textContent = t("set_sec_jira");
  $("setSecApp").textContent = t("set_sec_app");
  $("graphEmailLbl").textContent = t("set_lbl_account");
  $("onedriveRootLbl").textContent = t("set_lbl_extra_onedrive");
  $("jiraLbl").textContent = t("set_lbl_jira");
  document.querySelector('label[for="themeSel"]').textContent = t("theme_title");
  document.querySelector('label[for="langSel"]').textContent = t("lang_title");
  applyHomeLang();
  applyInsightsLang();
  applyTodayLang();
  applyChatLang();
  applyAnnounceLang();
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
  $("setSecNotify").textContent = t("set_sec_notify");
  $("notifyDesktopLbl").textContent = t("notify_desktop_lbl");
  $("notifyDesktopHint").textContent = t("notify_desktop_hint");
  $("notifyHookLbl").textContent = t("notify_hook_lbl");
  $("notifyHookHint").textContent = t("notify_hook_hint");
  $("notifyHookSaveBtn").textContent = t("btn_save");
  $("notifyHookTestBtn").textContent = t("notify_hook_test");
  $("jiraNewTitle").textContent = t("jira_new_title");
  $("jiraNewClose").title = t("t_close");
  $("jiraNewSubmit").textContent = t("jira_new_submit");
  $("jiraNewOverlay").setAttribute("aria-label", t("jira_new_title"));
  document.querySelector('label[for="jiraNewProject"]').textContent = t("lbl_project");
  document.querySelector('label[for="jiraNewType"]').textContent = t("lbl_type");
  document.querySelector('label[for="jiraNewSummary"]').textContent = t("lbl_summary");
  document.querySelector('label[for="jiraNewDesc"]').textContent = t("lbl_description");
  $("bulkStatusBtn").textContent = `↹ ${t("btn_bulk")}`;
  $("bulkStatusBtn").title = t("t_bulk");
  $("bulkTitle").textContent = t("bulk_title");
  $("bulkClose").title = t("t_close");
  $("bulkCancel").textContent = t("btn_cancel");
  $("bulkApply").textContent = t("btn_apply");
  $("bulkOverlay").setAttribute("aria-label", t("bulk_title"));
  document.querySelector('label[for="bulkColSel"]').textContent = t("lbl_column");
  document.querySelector('label[for="bulkStatusSel"]').textContent = t("lbl_new_status");
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
  $("noteSideMobile").title = t("t_note_side_drawer");
  $("noteSideMobile").setAttribute("aria-label", t("t_note_side_drawer"));
  $("noteBoxAddBtn").title = t("t_tool_box_add");
  $("noteToolbar").querySelector('[data-tool="select"]').title = t("t_tool_select");
  $("noteToolbar").querySelector('[data-tool="pen"]').title = t("t_tool_pen");
  $("noteToolbar").querySelector('[data-tool="line"]').title = t("t_tool_line");
  $("noteToolbar").querySelector('[data-tool="rect"]').title = t("t_tool_rect");
  $("noteToolbar").querySelector('[data-tool="ellipse"]').title = t("t_tool_ellipse");
  $("noteToolbar").querySelector('[data-tool="connector"]').title = t("t_tool_connector");
  $("noteToolbar").querySelector('[data-tool="frame"]').title = t("t_tool_frame");
  $("noteToolColor").title = t("t_tool_color");
  $("noteUndoBtn").title = t("t_note_undo");
  $("noteRedoBtn").title = t("t_note_redo");
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

// página inicial: a vista onde a app abre (ver homeView/HOME_VIEW_KEY em
// state.js). Só vale no arranque seguinte — mudá-la não tira ninguém de onde
// está agora. As opções que são separadores usam as etiquetas deles; "CCRs"
// é igual nas duas línguas e por isso não tem chave.
const HOME_OPT_KEYS = {
  metrics: "tab_metrics", workbook: "home_active_book",
  todo: "tab_todo", notes: "tab_notes",
};

function applyHomeLang() {
  const sel = $("homeSel");
  document.querySelector('label[for="homeSel"]').textContent = t("home_title");
  sel.title = t("home_hint");
  Object.entries(HOME_OPT_KEYS).forEach(([valor, chave]) => {
    const opt = sel.querySelector(`option[value="${valor}"]`);
    if (opt) opt.textContent = t(chave);
  });
  sel.value = homeView();
}

$("homeSel").addEventListener("change", () => {
  localStorage.setItem(HOME_VIEW_KEY, $("homeSel").value);
  $("homeSel").value = homeView();
  toast(t("home_saved"), "ok");
});

// fonte dos dados: ficheiro local ou o livro no OneDrive lido pela API do
// Excel (Microsoft Graph). O bloco só aparece se o servidor estiver configurado.
let graphInfo = { configured: false, connected: false, code: "", url: "", pending: false, error: "",
                  account_email: "", account_name: "", onedrive_url: "",
                  has_session: false, had_login: false, login_email: "", session_email: "" };
let graphPoll = null;
let graphPollUntil = 0;
// prova ao vivo (não só o prazo do token em cache) de que o pedido de 20 em 20
// segundos ao OneDrive falhou por falta de rede — ver checkForChanges() em main.js
let liveOffline = false;
// motivo dessa falha, para o distintivo o poder explicar em vez de só ficar vermelho
let liveError = "";
// religar sozinho quando a sessão do OneDrive cai, sem esperar por um clique em
// "Ligar" — só entra em jogo depois de já ter havido um login (há conta
// memorizada): nunca abre o browser sozinho da primeira vez
const GRAPH_AUTO_KEY = "bsp-tracker-onedrive-auto";
let graphAutoReconnect = localStorage.getItem(GRAPH_AUTO_KEY) !== "0";
let graphAutoReconnectAt = 0;
// tentativas automáticas seguidas sem sucesso: cada uma espera mais do que a
// anterior (5, 10, 20, 40 min) e ao fim de GRAPH_AUTO_MAX a app desiste até
// haver um clique em "Ligar" ou uma ligação boa. Sem este travão, um separador
// de login por resolver acumulava outro a cada 5 minutos — a app deixada aberta
// numa aba de fundo enchia o browser de pedidos à Microsoft
const GRAPH_AUTO_MAX = 4;
const GRAPH_AUTO_WAIT_MIN = 5 * 60 * 1000;
let graphAutoTries = 0;
let graphAutoGaveUp = false;

// conta Microsoft memorizada no servidor (só email/nome — o token nunca sai de
// lá). Mostra-se para se saber qual é a identidade que vai ser reutilizada: o
// servidor renova a sessão sozinho e, se algum dia tiver de pedir autenticação
// outra vez, a lista de contas da Microsoft já vem com esta escolhida.
/* Este cliente é o PC onde a app corre?
   O servidor di-lo no `local` do /api/graph (ver _graph_state_for em
   cswaios/server.py). Quem abre a app pelo telemóvel usa a sessão do OneDrive
   deste PC — lê livros à vontade — mas não liga, não desliga nem configura a
   conta: esses botões nem sequer lhe aparecem, em vez de aparecerem e darem
   erro. Enquanto o primeiro /api/graph não responde, `local` é indefinido: aí
   assume-se que sim, porque é o caso da esmagadora maioria (e o botão só
   desaparece se o servidor disser mesmo que não). */
const isLocalClient = () => graphInfo.local !== false;

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

// a página das definições é lida quando se entra nela: o estado do Jira e o do
// OneDrive podem ter mudado noutra janela desde a última vez
function renderSettingsPage() {
  if (typeof refreshJiraSettings === "function") refreshJiraSettings();
  // o aviso pode ter sido escrito noutra janela desta app (ou à mão no
  // announcement.json): relê-se sempre que a página abre
  if (typeof loadAnnouncement === "function") loadAnnouncement(false);
  graphAction("state");
}

function renderGraphState() {
  // sem fonte web configurada o cartão inteiro do OneDrive não tem nada dentro
  $("setCardOnedrive").classList.toggle("hidden", !graphInfo.configured);
  $("graphBox").classList.toggle("hidden", !graphInfo.configured);
  renderConnBadge();
  if (!graphInfo.configured) return;
  let txt;
  if (graphInfo.code) txt = tf("graph_code", graphInfo.url, graphInfo.code);
  else if (graphInfo.pending) txt = t("graph_wait");
  else if (graphInfo.connected) txt = t(graphInfo.method === "cli" ? "graph_on_cli" : "graph_on");
  // sessão guardada mas o servidor não conseguiu renová-la agora: isto é falta
  // de rede, não uma sessão terminada — dizer "desligado" fazia parecer que a
  // app se desliga a toda a hora e convidava a um login que não é preciso
  else if (graphInfo.has_session) txt = t("graph_on_offline");
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
  $("graphBtn").classList.toggle("hidden",
    graphInfo.pending || !usable || !isLocalClient());
  // só faz sentido escolher "ligar sozinho" depois de um login feito neste PC
  // (had_login) — o email escrito à mão nas Definições não conta: a app nunca
  // abre o browser sem ter havido primeiro um login manual
  const podeAuto = graphInfo.method !== "cli" && !!graphInfo.had_login && isLocalClient();
  $("graphAutoRow").classList.toggle("hidden", !podeAuto);
  if (podeAuto) {
    $("graphAutoReconnect").checked = graphAutoReconnect;
    $("graphAutoReconnectTxt").textContent = t("graph_auto");
    $("graphAutoRow").title = tf("t_graph_auto", graphInfo.account_name || graphInfo.account_email);
  }
  // quem chega pela rede local vê o estado (e abre livros), mas a ligação
  // vive no PC: dizê-lo aqui evita procurar um botão que não existe
  $("graphRemoteNote").classList.toggle("hidden", isLocalClient());
  $("graphRemoteNote").textContent = t("graph_remote_note");
  renderGraphEmailState();
  renderOnedriveRootState();
  maybeAutoReconnectGraph();
}

// pede ao servidor para religar à Microsoft (é ele que abre o browser, não o
// window.open daqui — um separador aberto por JS sem clique do utilizador
// fica bloqueado como popup) e espera pelo resultado. Serve tanto o clique em
// "Ligar" como a religação automática.
async function startGraphLogin() {
  await graphAction("login");
  if (!graphInfo.pending) return;
  clearInterval(graphPoll);
  // o pedido de login da Microsoft expira em 5 minutos: a partir daí perguntar
  // pelo estado de 4 em 4 segundos é só ruído (a app numa aba de fundo ficava
  // a bater no servidor para sempre)
  graphPollUntil = Date.now() + 6 * 60 * 1000;
  graphPoll = setInterval(async () => {
    await graphAction("state");
    if (graphInfo.connected || !graphInfo.pending || Date.now() > graphPollUntil) {
      clearInterval(graphPoll);
      graphPoll = null;
      if (graphInfo.connected) {
        // sessão boa: o contador de tentativas volta a zero
        graphAutoTries = 0;
        graphAutoReconnectAt = 0;
        toast(t("graph_on"), "ok");
        loadAllTabs();
      } else if (graphInfo.pending) return;   // desistiu por tempo, sem alarido
      else toast(graphInfo.error || t("graph_off"), "err");
    }
  }, 4000);
}

// com a opção ligada e um login já feito antes, religa sozinho quando a sessão
// cair — sem esperar por um clique. As condições são estreitas de propósito: só
// vale a pena abrir o browser quando a Microsoft já disse que a sessão morreu
// (has_session=false) e há alguém à frente do ecrã para a resolver. Sem isto, um
// pedido falhado por falta de rede aparecia como "desligado" e a app deixada
// aberta sem ninguém abria um separador de login a cada 5 minutos.
function maybeAutoReconnectGraph() {
  if (!graphAutoReconnect || graphInfo.pending || graphAutoGaveUp) return;
  // o login abre um browser no PC onde a app corre: pedi-lo do telemóvel só
  // dava 403 e um aviso de "a religar…" que nunca chegava a lado nenhum
  if (!isLocalClient()) return;
  if (graphInfo.connected || graphInfo.method === "cli") return;
  // nunca na primeira vez: só religa uma sessão que já existiu neste PC
  if (!graphInfo.had_login) return;
  // o servidor ainda tem sessão para renovar sozinho (o que falhou foi a rede,
  // não a autenticação): abrir o browser não resolvia nada
  if (graphInfo.has_session) return;
  // app numa aba de fundo/minimizada: quem não está a usar a app não tem nada
  // que apanhar separadores de login à espera dele. Fica para quando voltar
  // (ver o visibilitychange abaixo)
  if (document.visibilityState !== "visible") return;
  const agora = Date.now();
  // cada tentativa falhada espera o dobro da anterior
  const espera = GRAPH_AUTO_WAIT_MIN * Math.pow(2, Math.min(graphAutoTries, 3));
  if (graphAutoReconnectAt && agora - graphAutoReconnectAt < espera) return;
  if (graphAutoTries >= GRAPH_AUTO_MAX) {
    graphAutoGaveUp = true;
    toast(t("graph_auto_gave_up"), "err");
    return;
  }
  graphAutoReconnectAt = agora;
  graphAutoTries += 1;
  toast(t("graph_auto_reconnecting"), "ok");
  startGraphLogin();
}

// de volta à app: se a sessão caiu enquanto ela estava de lado, a religação
// automática acontece agora (com alguém a olhar), não às escondidas
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") maybeAutoReconnectGraph();
});

// conta Microsoft a usar no OneDrive, escrita à mão: num PC com várias contas a
// lista da Microsoft aparecia sempre na errada. Escolhida aqui, é esta a conta
// que a app mostra em todo o sítio e a que pré-escolhe no login — nem um login
// nem uma renovação de sessão a trocam por outra (o /me devolve muitas vezes o
// email de correio quando o utilizador escreveu o UPN, ou vice-versa). Quem
// manda no acesso continua a ser a Microsoft, e a lista dela permite sempre
// mudar. Vazio = a conta da última sessão.
function renderGraphEmailState() {
  $("graphEmailBox").classList.toggle("hidden", !graphInfo.configured || !isLocalClient());
  if (!graphInfo.configured || !isLocalClient()) return;
  $("graphEmailInput").placeholder = t("graph_email_ph");
  $("graphEmailSaveBtn").textContent = t("btn_save");
  if (document.activeElement !== $("graphEmailInput")) {
    $("graphEmailInput").value = graphInfo.login_email || "";
  }
  const set = !!graphInfo.login_email;
  // sessão aberta mesmo com outra conta: dizê-lo aqui em vez de deixar a app a
  // mostrar a conta escolhida como se fosse ela a trabalhar. A app não fecha a
  // sessão boa por causa disto — trocar de conta é um clique em Ligar.
  const outra = set ? (graphInfo.session_email || "") : "";
  $("graphEmailState").innerHTML =
    `<span class="stateDot ${outra ? "err" : (set ? "ok" : "")}"></span>` +
    esc(set ? tf("graph_email_state_set", graphInfo.login_email) : t("graph_email_state_off")) +
    (outra ? `<br><span style="opacity:.75">${esc(tf("graph_email_other_session", outra))}</span>` : "");
}

async function saveGraphEmail() {
  const btn = $("graphEmailSaveBtn");
  btn.disabled = true;
  try {
    const res = await fetch("/api/graph", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_login_email",
                             login_email: $("graphEmailInput").value.trim() }),
    });
    const out = await res.json();
    if (out.error) throw new Error(out.error);
    graphInfo = { ...graphInfo, ...out };
    renderGraphState();
    toast(t("graph_email_saved"), "ok");
  } catch (err) {
    toast(`${t("graph_email_save_err")} ${err.message || ""}`.trim(), "err");
  } finally {
    btn.disabled = false;
  }
}

$("graphEmailSaveBtn").addEventListener("click", saveGraphEmail);

// OneDrive/site extra a seguir na navegação (além do pessoal e do site fixo em
// graph_config.json) — para quando o livro vive no OneDrive de outra pessoa.
// Só aparece com a fonte web configurada, tal como o graphBox.
function renderOnedriveRootState() {
  $("onedriveRootBox").classList.toggle("hidden", !graphInfo.configured || !isLocalClient());
  if (!graphInfo.configured || !isLocalClient()) return;
  $("onedriveRootUrl").placeholder = t("onedrive_root_ph");
  $("onedriveRootSaveBtn").textContent = t("btn_save");
  if (document.activeElement !== $("onedriveRootUrl")) {
    $("onedriveRootUrl").value = graphInfo.onedrive_url || "";
  }
  const set = !!graphInfo.onedrive_url;
  $("onedriveRootState").innerHTML = `<span class="stateDot ${set ? "ok" : ""}"></span>` +
    esc(t(set ? "onedrive_root_state_set" : "onedrive_root_state_off"));
}

async function saveOnedriveRoot() {
  const btn = $("onedriveRootSaveBtn");
  btn.disabled = true;
  try {
    const res = await fetch("/api/graph", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_onedrive_root",
                             onedrive_url: $("onedriveRootUrl").value.trim() }),
    });
    const out = await res.json();
    if (out.error) throw new Error(out.error);
    graphInfo = { ...graphInfo, ...out };
    renderGraphState();
    toast(t("onedrive_root_saved"), "ok");
  } catch (err) {
    toast(`${t("onedrive_root_save_err")} ${err.message || ""}`.trim(), "err");
  } finally {
    btn.disabled = false;
  }
}

$("onedriveRootSaveBtn").addEventListener("click", saveOnedriveRoot);

// distintivo no canto superior direito: verde quando os dados vêm do OneDrive,
// vermelho quando algo está por ligar/falhou, neutro com o ficheiro local
function renderConnBadge() {
  const badge = $("connBadge"), dot = $("connDot"), txt = $("connText");
  // "pronto a ligar" só quando a sessão do OneDrive não está mesmo iniciada;
  // com sessão iniciada a culpa é do pedido/rede e dizer o contrário confunde
  // quem acabou de se ligar. Uma sessão guardada que o servidor não conseguiu
  // renovar agora (has_session) também conta como iniciada: é rede que falta
  const semSessao = !!(graphInfo.configured && !graphInfo.connected
                       && !graphInfo.has_session);
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

$("connBadge").addEventListener("click", () => {
  setSettingsOpen(currentView !== "settings");
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
  // um clique é sempre um recomeço: a app volta a poder religar sozinha depois
  // de ter desistido (ver maybeAutoReconnectGraph)
  graphAutoTries = 0;
  graphAutoReconnectAt = 0;
  graphAutoGaveUp = false;
  if (graphInfo.connected) {
    await graphAction("logout");
    // sair da conta afeta todos os livros do OneDrive abertos, não só o da frente
    loadAllTabs();
    return;
  }
  await startGraphLogin();
});

$("graphAutoReconnect").addEventListener("change", () => {
  graphAutoReconnect = $("graphAutoReconnect").checked;
  localStorage.setItem(GRAPH_AUTO_KEY, graphAutoReconnect ? "1" : "0");
  // voltar a ligar a opção é um recomeço, tal como um clique em "Ligar"
  if (graphAutoReconnect) {
    graphAutoReconnectAt = 0;
    graphAutoTries = 0;
    graphAutoGaveUp = false;
    maybeAutoReconnectGraph();
  }
});

/* ---------- avisos fora da app (ver static/js/notify.js) ---------- */
// O interruptor dos avisos do sistema é por browser (é o browser que os
// mostra); o webhook é do servidor e vale para a instalação toda, por isso só
// se escreve a partir do computador onde a app corre.
let notifyCfg = { enabled: false, url: "", canEdit: false };

function renderNotifySettings() {
  $("notifyDesktopChk").checked = desktopNotifyOn();
  $("notifyHookUrl").value = notifyCfg.url || "";
  $("notifyHookUrl").disabled = !notifyCfg.canEdit;
  $("notifyHookSaveBtn").disabled = !notifyCfg.canEdit;
  $("notifyHookTestBtn").disabled = !notifyCfg.canEdit;
  $("notifyHookState").textContent = notifyCfg.enabled ? "✓" : "";
  $("notifyHookBox").classList.toggle("readonly", !notifyCfg.canEdit);
}

async function loadNotifySettings() {
  try {
    const res = await fetch("/api/notify/config");
    notifyCfg = await res.json();
  } catch (e) { /* fica o que já lá estava */ }
  renderNotifySettings();
}

async function saveNotifyHook() {
  const url = $("notifyHookUrl").value.trim();
  try {
    const res = await fetch("/api/notify/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, enabled: !!url }),
    });
    const out = await res.json();
    if (!out.ok) { toast(out.error || t("err_server"), "bad"); return; }
    notifyCfg = out;
    renderNotifySettings();
    toast(t("notify_hook_saved"), "ok");
  } catch (e) {
    toast(t("err_server"), "bad");
  }
}

async function testNotifyHook() {
  try {
    const res = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t("notify_hook_test_text"), title: "My Organizer" }),
    });
    const out = await res.json();
    if (!out.ok) { toast(out.error || t("err_server"), "bad"); return; }
    toast(out.sent ? t("notify_hook_sent") : t("notify_hook_off"), out.sent ? "ok" : "");
  } catch (e) {
    toast(t("err_server"), "bad");
  }
}

$("notifyDesktopChk").addEventListener("change", async e => {
  const ligado = await setDesktopNotify(e.target.checked);
  e.target.checked = ligado;
});
$("notifyHookSaveBtn").addEventListener("click", saveNotifyHook);
$("notifyHookTestBtn").addEventListener("click", testNotifyHook);
// notify.js carrega depois deste ficheiro (ver index.html) e é lá que vive
// desktopNotifyOn(): a primeira leitura espera pelo fim do carregamento, senão
// o pedido ao servidor pode voltar antes disso e o render rebenta
if (document.readyState === "loading")
  window.addEventListener("DOMContentLoaded", loadNotifySettings);
else loadNotifySettings();
