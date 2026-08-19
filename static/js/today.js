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

  const partes = [
    todaySection(t("today_due"), vencidos.slice(0, TODAY_MAX_ROWS).map(todayTodoRow), vencidos.length),
    todaySection(t("today_soon"), aChegar.slice(0, TODAY_MAX_ROWS).map(todayTodoRow), aChegar.length),
    todaySection(t("today_myside"), minhas.slice(0, TODAY_MAX_ROWS).map(e => todayTaskRow(e, "")), minhas.length),
    todaySection(t("today_stale"), paradas.slice(0, TODAY_MAX_ROWS)
      .map(e => todayTaskRow(e, ageLabel(e.age))), paradas.length),
    todaySection(t("today_sheet"), eventos.slice(0, TODAY_MAX_ROWS).map(todayEventRow), eventos.length),
  ].filter(Boolean);

  if (porRegistar) {
    partes.push(`<section class="todaySection todayHint">
      <p>${esc(tf("today_unlogged", msToJiraTime(porRegistar)))}</p>
    </section>`);
  }

  box.innerHTML = partes.length
    ? partes.join("")
    : `<p class="todayEmpty">${esc(t("today_empty"))}</p>`;
}

// ---------- abrir e fechar ----------

async function openToday() {
  $("todayOverlay").classList.remove("hidden");
  $("todayTitle").textContent = t("today_title");
  $("todayBody").innerHTML = `<p class="todayEmpty">${esc(t("loading"))}</p>`;
  await loadTodayEvents();
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
// (⧉) ou a uma nota (↗) não — essa janela é para olhar para aquilo, não para o dia.
function maybeOpenToday() {
  if (SOLO_WB || SOLO_NOTE) return;
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
