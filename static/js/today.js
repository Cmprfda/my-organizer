// My Organizer — "Hoje": o ponto de situação de quem acaba de abrir a app.
//
// Não traz dados novos: junta num sítio só o que a app já sabe e que de outro
// modo obriga a passar por quatro vistas — o que está para hoje (data-limite),
// as tarefas cuja bola voltou para o meu lado, as que passaram a paradas, o
// tempo do cronómetro que ainda não foi para o Jira, e o que mexeu na folha
// desde a última vez que aqui estive.
//
// Abre-se sozinha uma vez por dia (a primeira vez que a app é aberta nesse
// dia); depois é o botão ☀ da barra de cima. O que a app "viu" fica no
// localStorage, como o tema ou o tamanho do ecrã dividido — é por browser.

const TODAY_SEEN_KEY = "bsp-tracker-today-seen";      // dia em que já se mostrou
const TODAY_MARK_KEY = "bsp-tracker-today-mark";      // instante da última visita
const TODAY_MAX_ROWS = 6;      // linhas por secção (o resto vai contado num "+N")

// eventos da folha desde a última visita (chegam do /api/history/recent)
let todayEvents = null;

function todayMark() {
  return localStorage.getItem(TODAY_MARK_KEY) || "";
}

// A marca só avança quando o painel é FECHADO: se avançasse ao abrir, quem o
// fechasse sem ler perdia a lista para sempre.
function setTodayMark() {
  localStorage.setItem(TODAY_MARK_KEY, new Date().toISOString());
}

// ---------- o que entra no painel ----------

// itens por fazer com data-limite até hoje (atrasados primeiro)
function todayDueItems() {
  const hoje = todayISO();
  return (todos || [])
    .filter(it => it && !it.done && it.due && it.due <= hoje)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

// itens por fazer com data-limite nos próximos dias (o que vem a caminho). O
// "próximos dias" é o mesmo que pinta a data de "a chegar" nos cartões
// (TODO_SOON_DAYS/dueState, static/js/todo.js): duas contas diferentes punham
// nesta lista itens que a data ao lado ainda não dava por próximos.
function todaySoonItems() {
  const hoje = todayISO();
  return (todos || [])
    .filter(it => it && !it.done && it.due && it.due > hoje && daysUntil(it.due) <= TODO_SOON_DAYS)
    .sort((a, b) => (a.due < b.due ? -1 : 1));
}

// Linhas de todos os livros abertos em que a bola está do MEU lado, pela mesma
// regra do sinal 🚩 dos cartões (taskSideOf, todo.js): um estado de review está
// do lado do reviewer, os outros do lado do autor.
function todayMySideRows() {
  const out = [];
  (workbookTabs || []).forEach(tab => {
    const data = tab && tab.lastData;
    if (!data || data.error) return;
    (data.row_meta || []).forEach(meta => {
      const roles = (meta && meta.todo_sync_role) || {};
      const minha = ["author", "reviewer"].some(role =>
        (roles[role] || []).some(s => taskSideOf(role, s) === "my"));
      if (!minha) return;
      out.push({ tab, meta, book: tab.name || "", sheet: data.sheet || "" });
    });
  });
  return out;
}

// linhas paradas (⏳) de todos os livros abertos, das mais paradas primeiro.
// A regra é a MESMA do botão ⏳ da tabela e do cartão das métricas
// (taskIsStaleInTab, static/js/history.js) — incluindo a espera marcada que
// ainda está dentro do prazo, que não conta como parada em sítio nenhum.
function todayStaleRows() {
  const out = [];
  (workbookTabs || []).forEach(tab => {
    const data = tab && tab.lastData;
    if (!data || data.error) return;
    (data.row_meta || []).forEach(meta => {
      if (!taskIsStaleInTab(tab.id, meta)) return;
      out.push({
        tab, meta, age: taskAgeInTab(tab.id, meta),
        book: tab.name || "", sheet: data.sheet || "",
      });
    });
  });
  return out.sort((a, b) => b.age.days - a.age.days);
}

// Em que pé estão os livros abertos. O painel abre-se ANTES de as folhas serem
// lidas (a leitura demora segundos) e enche-se à medida que elas chegam: sem
// isto, as secções das tarefas apareciam vazias — e vazio, nesta app, quer dizer
// "não há nada para ti", não "ainda não sei". Um livro que não se conseguiu ler
// é o mesmo problema ao contrário: as tarefas dele ficavam de fora sem uma
// palavra. Aqui distingue-se um caso do outro (ver todayBooksNote).
function todayBooksState() {
  const tabs = workbookTabs || [];
  const lidos = tabs.filter(x => x && x.lastData && !x.lastData.error);
  const falhados = tabs.filter(x => x && x.lastData && x.lastData.error);
  return {
    total: tabs.length,
    ready: lidos.length,
    loading: tabs.length - lidos.length - falhados.length,
    failed: falhados.map(x => x.name || "?"),
  };
}

// a linha que explica as secções das tarefas quando elas não podem estar certas
function todayBooksNote() {
  const st = todayBooksState();
  const linhas = [];
  if (st.loading > 0) {
    linhas.push(st.total > st.loading
      ? tf("today_books_loading_some", st.ready, st.total)
      : t("today_books_loading"));
  }
  if (st.failed.length) linhas.push(tf("today_books_failed", st.failed.join(", ")));
  if (!linhas.length) return "";
  return `<section class="todaySection todayHint todayBooks">
    ${linhas.map(l => `<p>${esc(l)}</p>`).join("")}
  </section>`;
}

// tempo dos cronómetros que ainda não foi registado no Jira
function todayUnlogged() {
  return (todos || []).reduce((s, it) => s + (todoCanLogTime(it) ? todoUnloggedMs(it) : 0), 0);
}

// Esta alteração é numa linha MINHA? O histórico do servidor guarda a folha
// inteira (todas as linhas, seja de quem for — ver record_read, history.py), mas
// este painel é o meu ponto de situação: o que mexeu na linha de outra pessoa
// não é novidade minha.
//
// A resposta sai das linhas que os livros abertos trouxeram: com o "Ver tudo"
// desligado o servidor já as filtrou pela pessoa, com ele ligado a pertença
// decide-se pelo nome (chatRowIsMine, static/js/chat.js). Uma alteração numa
// folha que não está aberta fica de fora — sem as linhas dela não há como saber
// de quem é, e adivinhar enchia a lista com o trabalho dos outros.
function todayEventIsMine(e) {
  if (!e) return false;
  const tab = (workbookTabs || []).find(x => x.lastData && !x.lastData.error
    && x.lastData.file === e.book && x.lastData.sheet === e.sheet);
  if (!tab) return false;
  const metas = tab.lastData.row_meta || [];
  const i = metas.findIndex(m => m && String(m.xlrow) === String(e.xlrow));
  if (i < 0) return false;
  return chatRowIsMine((tab.lastData.rows || [])[i], metas[i]);
}

// o que mexeu na folha desde a última visita (só o que não saiu desta app: o
// que fui eu a mandar já sei)
async function loadTodayEvents() {
  try {
    const res = await fetch("/api/history/recent?days=7&limit=400");
    const out = await res.json();
    const marca = todayMark();
    todayEvents = (out.events || [])
      .filter(e => e && e.via !== "app" && (!marca || String(e.ts || "") > marca));
  } catch (e) {
    todayEvents = [];      // sem histórico o painel mostra o resto
  }
}

// ---------- envios pisados ----------
// Uma célula que a app enviou e a folha depois mudou por cima: o envio deu
// certo, ninguém avisou de nada, e o valor já não é o que foi enviado. Isto só
// se descobria por acaso, a reler o histórico daquela linha (ver
// history.overwritten_pushes).
let todayOverwritten = null;

async function loadTodayOverwritten() {
  try {
    const res = await fetch("/api/history/overwritten?days=14");
    const out = await res.json();
    todayOverwritten = (out.items || []).filter(i => i && !todayIsMineSkip(i));
  } catch (e) {
    todayOverwritten = [];
  }
}

// as linhas dos livros que não estão abertos não se mostram: não haveria para
// onde saltar, e o painel fala do que está à mão
function todayIsMineSkip(item) {
  return !(workbookTabs || []).some(x => x.lastData && !x.lastData.error
    && x.lastData.file === item.book && x.lastData.sheet === item.sheet);
}

function todayOverwrittenRow(item) {
  const nome = String(item.fn || "").trim() || String(item.todo || "").trim()
    || tf("metric_row", item.xlrow);
  const tab = (workbookTabs || []).find(x => x.lastData && !x.lastData.error
    && x.lastData.file === item.book && x.lastData.sheet === item.sheet);
  const etiqueta = item.reverted ? t("today_reverted") : t("today_overwritten_tag");
  return `<li class="todayRow"><button type="button" class="todayGo"
      data-todaytask="${esc((tab && tab.id) || "")}|${esc(item.fn || "")}|${esc(item.todo || "")}"
      title="${esc(tf("t_today_overwritten", item.col, histValue(item.mine),
        histValue(item.now), histWhen(item.changed_at)))}">
    <span class="todayDue late">${esc(etiqueta)}</span>
    <span class="todayName">${esc(nome)}</span>
    <span class="todayWhere">${esc(item.col)}: ${esc(histValue(item.mine))} → ${esc(histValue(item.now))}</span>
  </button></li>`;
}

// ---------- o que perdi ----------
// Voltar de três dias fora e receber uma parede de alterações não é o mesmo que
// receber "segunda: 4 · terça: 12 · quarta: 3". A conta é a mesma lista de
// eventos, agrupada pelo dia — e cada dia salta para as Métricas desse dia, que
// já sabem mostrar todas as alterações de um dia à lupa (ver metricsShowDay).
const TODAY_AWAY_DAYS = 3;

// dias inteiros desde a última visita (0 quando é a primeira vez)
function todayAwayDays() {
  const marca = todayMark();
  if (!marca) return 0;
  const quando = new Date(marca);
  if (isNaN(quando)) return 0;
  return Math.floor((Date.now() - quando.getTime()) / 86400000);
}

function todayByDay(eventos) {
  const porDia = new Map();
  eventos.forEach(e => {
    const dia = String(e.ts || "").slice(0, 10);
    if (!dia) return;
    const alvo = porDia.get(dia) || { day: dia, n: 0, rows: new Set() };
    alvo.n++;
    alvo.rows.add(`${e.book}|${e.sheet}|${e.xlrow}`);
    porDia.set(dia, alvo);
  });
  return [...porDia.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

function todayDayRow(dia) {
  return `<li class="todayRow"><button type="button" class="todayGo" data-todayday="${esc(dia.day)}"
      title="${esc(t("t_today_day"))}">
    <span class="todayWhen">${esc(todayDayLabel(dia.day))}</span>
    <span class="todayName">${esc(tf("today_day_changes", dia.n, dia.rows.size))}</span>
    <span class="todayWhere">→</span>
  </button></li>`;
}

// o dia da semana escrito, que é como se fala de uma ausência ("na terça")
function todayDayLabel(iso) {
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d)) return iso;
  const dias = t("today_weekdays").split(",");
  return `${dias[d.getDay()] || ""} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`.trim();
}

// ---------- desenho ----------

function todaySection(title, rows, count) {
  if (!rows.length) return "";
  const extra = count > rows.length
    ? `<li class="todayMore">${esc(tf("today_more", count - rows.length))}</li>`
    : "";
  return `<section class="todaySection">
    <h3>${esc(title)}<span class="todayCount">${count}</span></h3>
    <ul class="todayList">${rows.join("")}${extra}</ul>
  </section>`;
}

function todayTodoRow(it) {
  const atraso = daysUntil(it.due);
  const cls = atraso < 0 ? "late" : "now";
  return `<li class="todayRow"><button type="button" class="todayGo" data-todaytodo="${esc(it.id)}">
    <span class="todayDue ${cls}">${esc(todoDueLabel(it))}</span>
    <span class="todayName">${esc(it.title)}</span>
    <span class="todayWhere">${esc(todoColLabel(todoColOf(it)))}</span>
  </button></li>`;
}

function todayTaskRow(entry, etiqueta) {
  const meta = entry.meta || {};
  const nome = String(meta.fn || "").trim() || String(meta.todo || "").trim()
    || tf("metric_row", meta.xlrow);
  const onde = [entry.book, entry.sheet].filter(Boolean).join(" · ");
  return `<li class="todayRow"><button type="button" class="todayGo"
      data-todaytask="${esc(entry.tab.id)}|${esc(meta.fn || "")}|${esc(meta.todo || "")}">
    ${etiqueta ? `<span class="todayDue late">${esc(etiqueta)}</span>` : ""}
    <span class="todayName">${esc(nome)}</span>
    <span class="todayWhere" title="${esc(onde)}">${esc(onde)}</span>
  </button></li>`;
}

function todayEventRow(e) {
  const nome = String(e.fn || "").trim() || String(e.todo || "").trim()
    || tf("metric_row", e.xlrow);
  return `<li class="todayRow todayEventRow">
    <span class="todayWhen">${esc(histWhen(e.ts))}</span>
    <span class="todayName">${esc(nome)}</span>
    <span class="todayWhere">${esc(e.col)}: ${esc(histValue(e.to))}</span>
  </li>`;
}

// recados que os outros me deixaram e ainda não li (o recibo é escrito quando a
// caixa da linha é aberta, ver team.js)
function todayMessageRows() {
  return (typeof teamMessages === "undefined" ? [] : teamMessages)
    .filter(m => !m.mine && !(m.seen || []).some(x => norm(x.who) === norm(PERSON)))
    .slice(0, TODAY_MAX_ROWS)
    .map(m => `<li class="todayRow"><button type="button" class="todayGo"
        data-todaykey="${esc(m.key)}" title="${esc(m.text)}">
      <span class="todayDue now">${esc(m.from)}</span>
      <span class="todayName">${esc(m.label || m.key.split("||")[1] || "")}</span>
      <span class="todayWhere">${esc(m.text)}</span>
    </button></li>`);
}

// bolas que me passaram e em que ainda não mexi
function todayHandoffRows() {
  return (typeof teamHandoffs === "undefined" ? [] : teamHandoffs)
    .filter(h => !h.mine && !(h.taken || []).length)
    .slice(0, TODAY_MAX_ROWS)
    .map(h => `<li class="todayRow"><button type="button" class="todayGo"
        data-todaykey="${esc(h.key)}" title="${esc(tf("handoff_tip", h.from, h.col || "", h.value || ""))}">
      <span class="todayDue now">${esc(h.from)}</span>
      <span class="todayName">${esc(h.label || h.key.split("||")[1] || "")}</span>
      <span class="todayWhere">${esc(h.col)}: ${esc(h.value)}</span>
    </button></li>`);
}

// esperas dos colegas em que o cobrado sou eu: quem e o gargalo costuma ser o
// unico que nao sabe que o e, porque a marca ficava so do lado de quem a fez
function todayWaitMeRows() {
  return (typeof teamWaitingMe === "undefined" ? [] : (teamWaitingMe || []))
    .slice(0, TODAY_MAX_ROWS)
    .map(w => `<li class="todayRow"><button type="button" class="todayGo"
        data-todaykey="${esc(w.key)}" title="${esc(tf("waitme_line", w.by, w.since || "?"))}">
      <span class="todayDue now">${esc(w.by)}</span>
      <span class="todayName">${esc(w.key.split("||")[1] || "")}</span>
      <span class="todayWhere">${esc(tf("waitme_since", w.since || "?"))}</span>
    </button></li>`);
}

// CCRs com os passos de antes do fecho todos feitos, mas ainda nao fechadas:
// estao a espera de alguem se lembrar delas (a vista de CCRs ja o mostra, o
// Hoje e que nao sabia que as CCRs existiam)
function todayCcrRows() {
  return Object.keys(typeof ccrs === "undefined" ? {} : (ccrs || {}))
    .filter(id => {
      const c = ((ccrs[id] || {}).checks) || {};
      return CCR_PRE.every(([k]) => c[k]) && !CCR_POST.every(([k]) => c[k]);
    })
    .slice(0, TODAY_MAX_ROWS)
    .map(id => `<li class="todayRow"><button type="button" class="todayGo"
        data-todayccr="${esc(id)}" title="${esc(t("ccr_ready"))}">
      <span class="todayDue now">CCR</span>
      <span class="todayName">CCR ${esc(id)}</span>
      <span class="todayWhere">${esc(t("ccr_ready"))}</span>
    </button></li>`);
}

function todayCcrCount() {
  return Object.keys(typeof ccrs === "undefined" ? {} : (ccrs || {}))
    .filter(id => {
      const c = ((ccrs[id] || {}).checks) || {};
      return CCR_PRE.every(([k]) => c[k]) && !CCR_POST.every(([k]) => c[k]);
    }).length;
}

function renderToday() {
  const box = $("todayBody");
  if (!box) return;
  const vencidos = todayDueItems();
  const aChegar = todaySoonItems();
  const minhas = todayMySideRows();
  const paradas = todayStaleRows();
  const porRegistar = todayUnlogged();
  // filtra-se aqui e não em loadTodayEvents porque os livros chegam depois do
  // painel abrir: no momento da resposta do histórico ainda não há linhas com
  // que comparar (ver refreshTodayIfOpen)
  const eventos = (todayEvents || []).filter(todayEventIsMine);
  const fora = todayAwayDays();

  const partes = [
    todaySection(t("today_due"), vencidos.slice(0, TODAY_MAX_ROWS).map(todayTodoRow), vencidos.length),
    todaySection(t("today_soon"), aChegar.slice(0, TODAY_MAX_ROWS).map(todayTodoRow), aChegar.length),
    todaySection(t("today_myside"), minhas.slice(0, TODAY_MAX_ROWS).map(e => todayTaskRow(e, "")), minhas.length),
    todaySection(t("today_stale"), paradas.slice(0, TODAY_MAX_ROWS)
      .map(e => todayTaskRow(e, ageLabel(e.age))), paradas.length),
    // recados e bola passada: o que outra pessoa deixou à minha espera (team.js)
    todaySection(t("today_messages"), todayMessageRows(), todayMessageRows().length),
    todaySection(t("today_handoffs"), todayHandoffRows(), todayHandoffRows().length),
    // e o que me cobram a MIM (team.py team_waiting_on)
    todaySection(t("today_waitme"), todayWaitMeRows(),
      (typeof teamWaitingMe === "undefined" ? [] : (teamWaitingMe || [])).length),
    // CCRs prontas a fechar: primeira vez que elas aparecem no Hoje
    todaySection(t("today_ccrs"), todayCcrRows(), todayCcrCount()),
    todaySection(t("today_overwritten"),
      (todayOverwritten || []).slice(0, TODAY_MAX_ROWS).map(todayOverwrittenRow),
      (todayOverwritten || []).length),
    // de volta de uns dias fora, a parede de alterações passa a ser um dia a
    // dia; até aos TODAY_AWAY_DAYS é a lista de sempre
    fora >= TODAY_AWAY_DAYS
      ? todaySection(tf("today_away", fora), todayByDay(eventos).slice(0, TODAY_MAX_ROWS)
        .map(todayDayRow), todayByDay(eventos).length)
      : todaySection(t("today_sheet"), eventos.slice(0, TODAY_MAX_ROWS).map(todayEventRow),
        eventos.length),
  ].filter(Boolean);

  if (porRegistar) {
    partes.push(`<section class="todaySection todayHint">
      <p>${esc(tf("today_unlogged", msToJiraTime(porRegistar)))}</p>
    </section>`);
  }

  // o aviso dos livros vem em cima: é o que explica uma secção em falta
  const aviso = todayBooksNote();
  const st = todayBooksState();
  box.innerHTML = partes.length || aviso
    ? aviso + partes.join("")
    // "nada para hoje" só se pode dizer quando já se sabe tudo: a ler ainda os
    // livros, o que se sabe é que não se sabe
    : `<p class="todayEmpty">${esc(st.loading > 0 ? t("loading") : t("today_empty"))}</p>`;
}

// ---------- abrir e fechar ----------

async function openToday() {
  $("todayOverlay").classList.remove("hidden");
  $("todayTitle").textContent = t("today_title");
  $("todayBody").innerHTML = `<p class="todayEmpty">${esc(t("loading"))}</p>`;
  await Promise.all([loadTodayEvents(), loadTodayOverwritten(),
    typeof loadTeamMessages === "function" ? loadTeamMessages(true) : null]);
  renderToday();
}

function closeToday() {
  if ($("todayOverlay").classList.contains("hidden")) return;
  $("todayOverlay").classList.add("hidden");
  // fechar é ter lido: a partir daqui, "desde a última visita" é agora
  setTodayMark();
  localStorage.setItem(TODAY_SEEN_KEY, todayISO());
}

// primeira abertura do dia: mostra-se sozinho. Numa janela dedicada a um livro
// (⧉), a uma nota (↗) ou a uma pasta de código não — essa janela é para olhar
// para aquilo, não para o dia (e agora nem menus tem, ver SOLO em state.js).
function maybeOpenToday() {
  if (SOLO) return;
  if (localStorage.getItem(TODAY_SEEN_KEY) === todayISO()) return;
  // o aviso do dono da instalação (announce.js) também aparece no arranque:
  // duas janelas ao mesmo tempo tapavam-se uma à outra — aqui o aviso ganha e
  // o painel fica para o botão ☀
  const aviso = $("announceOverlay");
  if (aviso && !aviso.classList.contains("hidden")) return;
  openToday();
}

// Os livros chegam depois (a leitura da folha demora): com o painel aberto,
// desenha-se outra vez para as secções das tarefas aparecerem. Sem isto o
// painel tinha de esperar pelos livros para abrir — e uma janela que salta ao
// ecrã três segundos depois de a app abrir cai a meio do primeiro clique.
function refreshTodayIfOpen() {
  if ($("todayOverlay").classList.contains("hidden")) return;
  renderToday();
}

// etiquetas do painel, chamadas pelo applyLang (settings.js)
function applyTodayLang() {
  $("todayBtn").title = t("t_today");
  $("todayBtn").setAttribute("aria-label", t("today_title"));
  $("todayOverlay").setAttribute("aria-label", t("today_title"));
  $("todayClose").title = t("t_close");
  if ($("todayOverlay").classList.contains("hidden")) {
    $("todayTitle").textContent = t("today_title");
  } else {
    renderToday();
  }
}

// ---------- saltar para o que se clicou ----------
$("todayBody").addEventListener("click", e => {
  const todo = e.target.closest("[data-todaytodo]");
  if (todo) {
    closeToday();
    showView("todo");
    return;
  }
  const ccr = e.target.closest("[data-todayccr]");
  if (ccr) {
    closeToday();
    revealSource({ view: "ccrs", ccr: ccr.dataset.todayccr });
    return;
  }
  const chave = e.target.closest("[data-todaykey]");
  if (chave) {
    const [aba, fn, todoText] = chave.dataset.todaykey.split("||");
    closeToday();
    revealSource({ view: "excel", fn, todo: todoText, sheet: aba, workbook: "" });
    return;
  }
  const dia = e.target.closest("[data-todayday]");
  if (dia) {
    closeToday();
    showView("metrics");
    // a página das Métricas chega a pedido: se ainda não estiver carregada, a
    // vista abre no período de sempre em vez de abrir o dia
    if (typeof metricsShowDay === "function") metricsShowDay(dia.dataset.todayday);
    return;
  }
  const task = e.target.closest("[data-todaytask]");
  if (task) {
    const [tabId, fn, todoText] = task.dataset.todaytask.split("|");
    closeToday();
    const tab = (workbookTabs || []).find(x => x.id === tabId);
    revealSource({
      view: "excel", fn, todo: todoText, sheet: (tab && tab.sheet) || "",
      workbook: (tab && tab.name) || "",
    });
  }
});

$("todayBtn").addEventListener("click", () => {
  if ($("todayOverlay").classList.contains("hidden")) openToday();
  else closeToday();
});
$("todayClose").addEventListener("click", closeToday);
$("todayOverlay").addEventListener("click", e => {
  if (e.target === $("todayOverlay")) closeToday();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("todayOverlay").classList.contains("hidden")) {
    e.stopPropagation();
    closeToday();
  }
}, true);
