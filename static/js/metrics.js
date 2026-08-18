// My Organizer — vista de métricas: o estado do trabalho num ecrã só
//
// Tudo o que aqui aparece já existia espalhado pela app (a folha do separador
// ativo, o histórico do servidor, a lista Por fazer). O que esta vista faz é
// pôr as contas lado a lado: em que estados está o trabalho, quanto se mexeu
// nos últimos dias, o que está parado e quanto tempo foi contado.
//
// Os gráficos são barras feitas de <div> com as cores do tema (theme.css), sem
// biblioteca nenhuma: acompanham o tema claro/escuro sozinhos, funcionam com o
// texto ampliado e o valor está sempre escrito ao lado da barra — quem não
// distinguir os comprimentos lê o número.

// Período em análise (guardado neste browser, como as outras escolhas). Havia
// só janelas relativas — 7, 14 ou 30 dias até hoje; agora também se pode
// escolher um intervalo de datas ou um único dia. As contas são as mesmas: muda
// só o pedaço de tempo que se pede ao servidor.
const METRICS_DAYS_KEY = "bsp-tracker-metrics-days";   // 7 | 14 | 30 | day | range
const METRICS_FROM_KEY = "bsp-tracker-metrics-from";
const METRICS_TO_KEY = "bsp-tracker-metrics-to";
const METRICS_DAY_KEY = "bsp-tracker-metrics-day";
const METRICS_DAY_CHOICES = [7, 14, 30];
const METRICS_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
// um intervalo de anos daria um gráfico com centenas de colunas ilegíveis
const METRICS_RANGE_MAX = 92;

// AAAA-MM-DD em hora LOCAL: as marcas dos eventos são a hora local do servidor
// (datetime.now().isoformat()), por isso o calendário aqui também é o local —
// com toISOString os eventos da noite caíam no dia seguinte
const metricsIsoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` +
  `-${String(d.getDate()).padStart(2, "0")}`;

const metricsDayDate = iso => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// o dia `n` dias depois (n pode ser negativo)
const metricsShiftDay = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  return metricsIsoDay(new Date(y, m - 1, d + n));
};

// dias de um intervalo, extremos incluídos. O arredondamento é de propósito: nas
// mudanças de hora um "dia" tem 23 ou 25 horas e a divisão exata falharia.
const metricsDayCount = (from, to) =>
  Math.max(1, Math.round((metricsDayDate(to) - metricsDayDate(from)) / 86400000) + 1);

const metricsDayLabel = iso =>
  metricsDayDate(iso).toLocaleDateString(LANG === "en" ? "en-GB" : "pt-PT");

function metricsStoredDay(key) {
  const v = String(localStorage.getItem(key) || "");
  return METRICS_DAY_RE.test(v) ? v : "";
}

function metricsMode() {
  const raw = String(localStorage.getItem(METRICS_DAYS_KEY) || "");
  if (raw === "day" || raw === "range") return raw;
  return METRICS_DAY_CHOICES.includes(+raw) ? raw : "14";
}

// O período em vigor: { mode, from, to, days }, datas em AAAA-MM-DD e os dois
// extremos incluídos — é isto que manda em tudo o que esta vista mostra.
function metricsRange() {
  const mode = metricsMode();
  const hoje = metricsIsoDay(new Date());
  if (mode === "day") {
    const dia = metricsStoredDay(METRICS_DAY_KEY) || hoje;
    return { mode, from: dia, to: dia, days: 1 };
  }
  if (mode === "range") {
    let from = metricsStoredDay(METRICS_FROM_KEY) || metricsShiftDay(hoje, -13);
    let to = metricsStoredDay(METRICS_TO_KEY) || hoje;
    if (from > to) [from, to] = [to, from];
    return { mode, from, to, days: metricsDayCount(from, to) };
  }
  const dias = +mode;
  return { mode, from: metricsShiftDay(hoje, -(dias - 1)), to: hoje, days: dias };
}

const metricsDays = () => metricsRange().days;

// modo anterior a um salto para um dia (clique numa coluna), para o "voltar"
let metricsPrevMode = "";

// atividade de todos os livros (o /api/history é por aba; este é o total)
let metricsActivity = null;      // { from, to, days, events } ou null enquanto não chega
let metricsActivityAsked = "";

// as Métricas podem ser a página inicial (ver homeView em state.js): os dados
// dos livros e o histórico chegam DEPOIS do primeiro desenho, por isso quem os
// recebe volta a pedir este desenho — só se a vista estiver mesmo no ecrã
function refreshMetricsIfOpen() {
  if (currentView === "metrics" || sideView === "metrics") renderMetrics();
}

async function loadMetricsActivity(force = false) {
  const r = metricsRange();
  const token = `${r.from}..${r.to}`;
  if (!force && metricsActivityAsked === token) return;
  metricsActivityAsked = token;
  const periodo = { from: r.from, to: r.to, days: r.days };
  try {
    const res = await fetch(`/api/history/recent?since=${r.from}&until=${r.to}&limit=5000`);
    const out = await res.json();
    metricsActivity = { ...periodo, events: out.events || [] };
  } catch (e) {
    metricsActivity = { ...periodo, events: [] };
  }
  refreshMetricsIfOpen();
}

// ---------- peças de desenho ----------
// paleta categórica: as tags de coluna do tema (theme.css), que já foram
// escolhidas para não se confundirem com as cores de estado nem entre si
const METRIC_COLORS = ["purple", "teal", "indigo", "sand", "slate"];

function metricCard(title, body, note = "", cls = "") {
  return `<section class="metricCard${cls ? ` ${cls}` : ""}">
    <h3 class="metricTitle">${esc(title)}</h3>
    ${body}
    ${note ? `<p class="metricNote">${esc(note)}</p>` : ""}
  </section>`;
}

function metricEmpty(text) {
  return `<p class="metricEmpty">${esc(text)}</p>`;
}

// barras horizontais: [{label, value, cls}] — `cls` é uma classe de cor
// (statusClass() para estados, METRIC_COLORS para categorias)
function metricBars(items) {
  if (!items.length) return metricEmpty(t("metric_nodata"));
  const max = Math.max(...items.map(i => i.value), 1);
  return `<ul class="metricBars">` + items.map(i =>
    `<li class="metricBar">
      <span class="metricBarLabel" title="${esc(i.label)}">${esc(i.label)}</span>
      <span class="metricBarTrack">
        <span class="metricBarFill bar-${esc(i.cls || "slate")}" style="width:${Math.round(i.value / max * 100)}%"></span>
      </span>
      <span class="metricBarValue">${i.value}</span>
    </li>`).join("") + `</ul>`;
}

// colunas por dia: [{iso, label, value, title}]. Com 14 ou 30 dias as datas não
// cabem todas lado a lado: escreve-se uma a cada N (a primeira e a última
// sempre), e o dia exato de cada coluna fica no tooltip. Cada coluna é um botão
// — clicar nela abre esse dia à lupa (metricsShowDay).
function metricColumns(items) {
  if (!items.length) return metricEmpty(t("metric_nodata"));
  const max = Math.max(...items.map(i => i.value), 1);
  const passo = Math.ceil(items.length / 7);
  const ultimo = items.length - 1;
  return `<div class="metricColsWrap"><ul class="metricCols">` + items.map((i, idx) => {
    // o último dia leva sempre etiqueta; as intermédias só se ainda houver um
    // passo inteiro até ele, senão as duas do fim ficavam uma em cima da outra
    const comEtiqueta = idx === 0 || idx === ultimo
      || (idx % passo === 0 && ultimo - idx >= passo);
    return `<li class="metricCol">
      <button type="button" class="metricColBtn" data-day="${esc(i.iso)}"
        title="${esc(i.title)} — ${esc(t("t_metric_col"))}">
        <span class="metricColBarBox">
          <span class="metricColBar${i.value ? "" : " zero"}" style="height:${i.value ? Math.max(4, Math.round(i.value / max * 100)) : 2}%"></span>
        </span>
        <span class="metricColValue">${esc(i.text != null ? i.text : (i.value || ""))}</span>
        <span class="metricColLabel">${comEtiqueta ? esc(i.label) : ""}</span>
      </button>
    </li>`;
  }).join("") + `</ul></div>`;
}

function metricTiles(tiles) {
  return `<div class="metricTiles">` + tiles.map(x =>
    `<div class="metricTile"><span class="metricTileValue">${esc(x.value)}</span>` +
    `<span class="metricTileLabel">${esc(x.label)}</span></div>`).join("") + `</div>`;
}

// ---------- contas ----------
// Estados da folha do separador ativo. Conta-se por VERTENTE (Status TC e
// Status TP são trabalhos diferentes na mesma linha, como no resto da app), e
// sempre o valor em vigor (meta.cur, já com as alterações locais ✎).
function metricsStatusItems() {
  const metas = ((lastData && lastData.row_meta) || []);
  const contas = new Map();
  metas.forEach(m => {
    ["Status TC", "Status TP"].forEach(col => {
      const v = String(((m && m.cur) || {})[col] || "").trim();
      if (!v || norm(v) === "n/a") return;
      contas.set(v, (contas.get(v) || 0) + 1);
    });
  });
  return [...contas.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, cls: statusClass(label) }));
}

// Carga por pessoa: quem está do lado de uma tarefa que ainda não está feita.
// Uma pessoa conta uma vez por linha, mesmo que seja autora e revisora dela.
function metricsPeopleItems() {
  const metas = ((lastData && lastData.row_meta) || []);
  const contas = new Map();
  metas.forEach(m => {
    if (!m || taskIsDone(m)) return;
    const nomes = new Set();
    Object.values((m.people) || {}).forEach(p => {
      // separadores: vírgula, ponto e vírgula e " e ". A barra NÃO entra —
      // partir por ela transformava um "N/A" em duas pessoas, "N" e "A"
      String(p || "").split(/[,;]|\se\s/).forEach(nome => {
        const limpo = nome.trim();
        if (limpo.length >= 2 && norm(limpo) !== "n/a") nomes.add(limpo);
      });
    });
    nomes.forEach(n => contas.set(n, (contas.get(n) || 0) + 1));
  });
  return [...contas.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, value], i) => ({ label, value, cls: METRIC_COLORS[i % METRIC_COLORS.length] }));
}

// Alterações por dia no período (todos os livros). O eixo tem sempre todos os
// dias, mesmo os de zero: sem eles um fim de semana parado parecia não existir.
function metricsActivityItems() {
  if (!metricsActivity) return [];
  const porDia = new Map();
  metricsActivity.events.forEach(e => {
    const chave = String(e.ts || "").slice(0, 10);
    if (chave) porDia.set(chave, (porDia.get(chave) || 0) + 1);
  });
  const out = [];
  for (let i = 0; i < metricsActivity.days; i++) {
    const iso = metricsShiftDay(metricsActivity.from, i);
    const value = porDia.get(iso) || 0;
    out.push({
      iso, value,
      label: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`,
      title: `${metricsDayLabel(iso)}: ${value}`,
    });
  }
  return out;
}

// ---------- um dia à lupa ----------
// A mesma informação que a caixa de detalhe mostra de uma linha, mas de todos os
// livros de uma vez: o que mudou nesse dia, a que horas e por quem (nesta app ou
// na folha). É onde se cai ao clicar numa coluna do gráfico.
const METRICS_DAY_ROWS = 60;

function metricsDayHtml() {
  const voltar = metricsPrevMode
    ? `<p class="metricDayBackWrap"><button type="button" class="metricDayBack">${esc(t("metric_day_back"))}</button></p>`
    : "";
  if (!metricsActivity) return voltar + metricEmpty(t("loading"));
  const eventos = metricsActivity.events;
  if (!eventos.length) return voltar + metricEmpty(t("metric_day_none"));
  const linhas = eventos.slice(0, METRICS_DAY_ROWS).map(e => {
    const tarefa = String(e.fn || "").trim() || String(e.todo || "").trim()
      || tf("metric_row", e.xlrow);
    const onde = [tarefa, e.sheet].filter(Boolean).join(" · ");
    // o dia à lupa junta todos os livros abertos: o nome de quem gravou sai
    // das versões do livro a que a alteração pertence (ver histWhoInTab)
    const tabDoEvento = (workbookTabs || []).find(x => x.lastData && x.lastData.file === e.book);
    const quem = e.via === "app" || !tabDoEvento ? "" : histWhoInTab(tabDoEvento.id, e.ts);
    const marca = e.via === "app" ? t("hist_via_app")
      : (quem ? tf("hist_saved_by", quem) : t("hist_via_sheet"));
    return `<li class="histRow metricDayRow${e.via === "app" ? " histApp" : ""}">
      <span class="histWhen">${esc(histWhen(e.ts))}</span>
      <span class="metricDayTask" title="${esc(onde)}">${esc(tarefa)}</span>
      <span class="histCol">${esc(e.col)}</span>
      <span class="histVals"><span class="histFrom">${esc(histValue(e.from))}</span>
        <span class="histArrow">→</span>
        <span class="histTo">${esc(histValue(e.to))}</span></span>
      <span class="histVia" title="${esc(marca)}">${e.via === "app" ? "✎" : "☁"}${quem ? ` <span class="histWho">${esc(quem)}</span>` : ""}</span>
    </li>`;
  }).join("");
  const demais = eventos.length > METRICS_DAY_ROWS
    ? `<p class="metricNote">${esc(tf("metric_day_more", METRICS_DAY_ROWS, eventos.length))}</p>`
    : "";
  return voltar + `<ul class="histList metricDayList">${linhas}</ul>` + demais;
}

// Salta para um dia (clique numa coluna), guardando o período de onde se veio
// para o "voltar" o poder repor.
function metricsShowDay(iso) {
  if (!METRICS_DAY_RE.test(iso)) return;
  const modo = metricsMode();
  if (modo !== "day") metricsPrevMode = modo;
  localStorage.setItem(METRICS_DAY_KEY, iso);
  localStorage.setItem(METRICS_DAYS_KEY, "day");
  metricsApplyRange();
}

function metricsBackToPeriod() {
  localStorage.setItem(METRICS_DAYS_KEY, metricsPrevMode || "14");
  metricsPrevMode = "";
  metricsApplyRange();
}

// As tarefas paradas há mais tempo (as mais antigas primeiro)
function metricsStaleRows() {
  const metas = ((lastData && lastData.row_meta) || []);
  return metas
    .filter(m => taskIsStale(m))
    .map(m => ({ meta: m, age: taskAge(m) }))
    .sort((a, b) => (b.age ? b.age.days : 0) - (a.age ? a.age.days : 0))
    .slice(0, 8);
}

function metricsStaleHtml() {
  if (!activeHistory()) return metricEmpty(t("metric_no_history"));
  const linhas = metricsStaleRows();
  if (!linhas.length) return metricEmpty(t("metric_no_stale"));
  return `<ul class="metricList">` + linhas.map(({ meta, age }) => {
    const titulo = String(meta.fn || "").trim() || tf("metric_row", meta.xlrow);
    // o estado que se mostra é o que está a prender a tarefa, não o primeiro
    // que aparece: numa linha com o TC feito e o TP à espera de revisão, ler
    // "Done" ao lado de "19 dias parada" só confunde
    const aplicaveis = [((meta.cur || {})["Status TC"]), ((meta.cur || {})["Status TP"])]
      .map(s => String(s || "").trim()).filter(s => s && norm(s) !== "n/a");
    const estado = aplicaveis.find(s => statusClass(s) !== "done") || aplicaveis[0] || "";
    return `<li class="metricListRow">
      <span class="metricListName" title="${esc(titulo)}">${esc(titulo)}</span>
      ${estado ? `<span class="badge ${statusClass(estado)}">${esc(estado)}</span>` : ""}
      <span class="metricListAge">${esc(ageLabel(age))}</span>
    </li>`;
  }).join("") + `</ul>`;
}

// Tempo: o que os cronómetros contaram e o que já foi registado no Jira
function metricsTimeTiles() {
  const contado = todos.reduce((s, it) => s + todoLiveElapsed(it), 0);
  const noJira = todos.reduce((s, it) => s + (+it.jiraLoggedSeconds || 0), 0) * 1000;
  const porRegistar = todos.reduce((s, it) => s + (todoCanLogTime(it) ? todoUnloggedMs(it) : 0), 0);
  return metricTiles([
    { value: formatTodoElapsed(contado), label: t("metric_time_counted") },
    { value: formatTodoElapsed(noJira), label: t("metric_time_jira") },
    { value: formatTodoElapsed(porRegistar), label: t("metric_time_pending") },
  ]);
}

// Folha de horas: o que os cronómetros contaram em cada dia do período. Sai do
// registo diário dos itens (`segments`) e não do total de cada um — o total não
// sabe a que dia pertence, e é por isso que os itens anteriores a esta versão
// não aparecem aqui (o relatório di-lo à parte).
function metricsTimesheetItems() {
  const r = metricsRange();
  const porDia = new Map();
  todos.forEach(it => {
    (Array.isArray(it.segments) ? it.segments : []).forEach(seg => {
      const dia = String((seg && seg.d) || "");
      if (!dia || dia < r.from || dia > r.to) return;
      porDia.set(dia, (porDia.get(dia) || 0) + (+seg.ms || 0));
    });
  });
  // todos os dias do período, mesmo os de zero: um gráfico só com os dias em
  // que se contou tempo mentia sobre o ritmo da semana
  const dias = Math.max(1, metricsDayCount(r.from, r.to));
  const out = [];
  for (let i = 0; i < dias; i++) {
    const iso = metricsShiftDay(r.from, i);
    const ms = porDia.get(iso) || 0;
    out.push({
      // o valor é em minutos (é o que dá a altura da barra); o que se escreve
      // por cima dela é o tempo, que é como se lê uma folha de horas
      iso, value: Math.round(ms / 60000),
      text: ms ? formatTodoElapsed(ms) : "",
      label: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`,
      title: `${metricsDayLabel(iso)}: ${ms ? formatTodoElapsed(ms) : "0m"}`,
    });
  }
  return out;
}

// tempo do período que ficou por arrumar num dia: itens contados antes de esta
// versão passar a guardar o registo diário
function metricsTimesheetUntracked() {
  return todos.reduce((s, it) => {
    const segs = Array.isArray(it.segments) ? it.segments : [];
    return s + (segs.length ? 0 : todoLiveElapsed(it));
  }, 0);
}

function metricsTimesheetHtml() {
  const itens = metricsTimesheetItems();
  const orfao = metricsTimesheetUntracked();
  const nota = orfao
    ? `<p class="metricNote">${esc(tf("metric_hours_untracked", formatTodoElapsed(orfao)))}</p>`
    : "";
  if (!itens.length) return metricEmpty(t("metric_hours_none")) + nota;
  const total = itens.reduce((s, i) => s + i.value, 0);
  if (!total) return metricEmpty(t("metric_hours_none")) + nota;
  return metricColumns(itens) +
    `<p class="metricNote">${esc(tf("metric_hours_total", formatTodoElapsed(total * 60000)))}</p>` +
    nota;
}

function metricsTodoItems() {
  const contas = new Map();
  todos.forEach(it => {
    const col = todoColOf(it);
    contas.set(col, (contas.get(col) || 0) + 1);
  });
  return [...contas.entries()]
    .map(([col, value], i) => ({
      label: todoColLabel(col), value,
      cls: col === "done" ? "done" : col === "inprogress" ? "doing" : METRIC_COLORS[i % METRIC_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);
}

// ---------- a vista ----------
// Os campos de data só aparecem no modo a que servem: um select com cinco
// opções e três campos sempre visíveis dava uma barra cheia de coisas mortas.
function metricsSyncControls() {
  const r = metricsRange();
  const hoje = metricsIsoDay(new Date());
  $("metricsDaysSel").value = r.mode;
  $("metricsDayField").classList.toggle("hidden", r.mode !== "day");
  $("metricsRangeFields").classList.toggle("hidden", r.mode !== "range");
  $("metricsDayInput").value = r.from;
  $("metricsFromInput").value = r.from;
  $("metricsToInput").value = r.to;
  // o histórico não sabe nada do futuro
  ["metricsDayInput", "metricsFromInput", "metricsToInput"].forEach(id => { $(id).max = hoje; });
}

// título e nota do cartão da atividade, que dizem o período que está à vista
function metricsActivityCard() {
  const r = metricsRange();
  const n = metricsActivity ? metricsActivity.events.length : 0;
  if (r.mode === "day") {
    // o dia à lupa leva linhas largas, por isso ocupa dois lugares do mosaico
    return metricCard(tf("metric_day_title", metricsDayLabel(r.from)),
      metricsDayHtml(), "", "metricCardWide");
  }
  const nota = !metricsActivity ? t("loading")
    : r.mode === "range"
      ? tf("metric_activity_range", n, metricsDayLabel(r.from), metricsDayLabel(r.to))
      : tf("metric_activity_note", n, r.days);
  // um período longo tem colunas demais para um mosaico de 300px (ficavam riscos
  // sem data nenhuma à vista): também esse ocupa dois lugares
  return metricCard(t("metric_activity"), metricColumns(metricsActivityItems()), nota,
    r.days > 31 ? "metricCardWide" : "");
}

function renderMetrics() {
  const box = $("metricsBody");
  if (!box) return;
  metricsSyncControls();
  const livro = activeBookName() || (lastData && lastData.sheet) || "";
  const semLivro = !((lastData && lastData.row_meta) || []).length;

  box.innerHTML =
    metricsActivityCard() +
    metricCard(t("metric_stale"), metricsStaleHtml(),
      activeHistory() ? tf("t_stale", staleDays()) : "") +
    metricCard(t("metric_status") + (livro ? ` · ${livro}` : ""),
      semLivro ? metricEmpty(t("metric_no_book")) : metricBars(metricsStatusItems())) +
    metricCard(t("metric_people"),
      semLivro ? metricEmpty(t("metric_no_book")) : metricBars(metricsPeopleItems()),
      semLivro ? "" : t("metric_people_note")) +
    metricCard(t("metric_time"), metricsTimeTiles(), t("metric_time_note")) +
    metricCard(t("metric_hours"), metricsTimesheetHtml(), t("metric_hours_note"),
      metricsRange().days > 7 ? "metricCardWide" : "") +
    metricCard(t("metric_todo"), metricBars(metricsTodoItems()));
}

// ---------- exportar o período para um ficheiro ----------
// O ficheiro é escrito pelo servidor, na pasta `exports` ao lado da app: numa
// janela nativa (pywebview) um download do browser não guardava nada, e pela
// rede local o caminho devolvido diz onde ele ficou.
let exportPop = null;

const EXPORT_KINDS = [
  { kind: "activity", label: "export_activity" },
  { kind: "timesheet", label: "export_timesheet" },
  { kind: "report", label: "export_report" },
];

function closeExportPop() {
  if (!exportPop) return;
  exportPop.remove();
  exportPop = null;
}

function openExportPop(anchor) {
  if (exportPop) { closeExportPop(); return; }
  const el = document.createElement("div");
  el.className = "todoColsPop exportPop";
  el.innerHTML = `<div class="todoColsPopHead">${esc(t("export_title"))}</div>` +
    EXPORT_KINDS.map(k =>
      `<button type="button" class="exportOpt" data-export="${k.kind}">${esc(t(k.label))}</button>`).join("");
  document.body.appendChild(el);
  exportPop = el;
  const r = anchor.getBoundingClientRect();
  el.style.left = `${Math.max(6, Math.min(window.innerWidth - el.offsetWidth - 6, r.right - el.offsetWidth))}px`;
  el.style.top = `${r.bottom + 6}px`;
  el.addEventListener("click", e => {
    const opt = e.target.closest("[data-export]");
    if (opt) { closeExportPop(); exportMetrics(opt.dataset.export); }
  });
}

async function exportMetrics(kind) {
  const r = metricsRange();
  try {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, since: r.from, until: r.to, days: r.days, lang: LANG, reveal: true }),
    });
    const out = await res.json();
    if (!out.ok) { toast(out.error || t("err_server"), "bad"); return; }
    toast(tf("export_done", out.name), "ok");
  } catch (e) {
    toast(t("err_server"), "bad");
  }
}

document.addEventListener("pointerdown", e => {
  if (!exportPop || e.target.closest(".exportPop") || e.target.closest("#metricsExportBtn")) return;
  closeExportPop();
}, true);

// ---------- relatório do período e do dia ----------
let weekReportText = "";

// `dia` a true: o resumo de hoje, sem depender do período escolhido na vista —
// é o botão "O meu dia", para o ponto de situação do fim do dia
async function openWeekReport(dia) {
  $("reportOverlay").classList.remove("hidden");
  $("reportTitle").textContent = t(dia ? "report_title_day" : "report_title");
  $("reportBody").textContent = t("loading");
  weekReportText = "";
  try {
    // o relatório segue o período escolhido na vista, seja janela ou datas
    const hoje = metricsIsoDay(new Date());
    const r = dia ? { from: hoje, to: hoje, days: 1 } : metricsRange();
    const res = await fetch(`/api/report/week?since=${r.from}&until=${r.to}` +
      `&days=${r.days}&lang=${LANG}`);
    const out = await res.json();
    weekReportText = out.markdown || "";
    $("reportBody").textContent = weekReportText || t("report_empty");
  } catch (e) {
    $("reportBody").textContent = t("err_server");
  }
}

function closeWeekReport() {
  $("reportOverlay").classList.add("hidden");
}

async function copyWeekReport() {
  if (!weekReportText) return;
  try {
    await navigator.clipboard.writeText(weekReportText);
    toast(t("report_copied"), "ok");
  } catch (e) {
    // sem permissão para a área de transferência (ou sem HTTPS): fica a seleção
    // feita, um Ctrl+C resolve
    const range = document.createRange();
    range.selectNodeContents($("reportBody"));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    toast(t("report_copy_manual"), "");
  }
}

// Etiquetas destas peças novas, chamadas pelo applyLang (settings.js) — os
// selects e as janelas ficam com o nome certo ao trocar de língua, como o resto.
function applyInsightsLang() {
  document.querySelector('.tabs button[data-view="metrics"]').textContent = t("tab_metrics");
  document.querySelector('label[for="metricsDaysSel"]').textContent = t("lbl_period");
  $("metricsDaysSel").title = t("t_period");
  [...$("metricsDaysSel").options].forEach(o => {
    o.textContent = o.value === "day" ? t("opt_period_day")
      : o.value === "range" ? t("opt_period_range")
        : tf("opt_days", o.value);
  });
  document.querySelector('label[for="metricsDayInput"]').textContent = t("lbl_day");
  document.querySelector('label[for="metricsFromInput"]').textContent = t("lbl_from");
  document.querySelector('label[for="metricsToInput"]').textContent = t("lbl_to");
  $("metricsDayInput").title = t("t_metric_day");
  $("metricsFromInput").title = t("t_metric_from");
  $("metricsToInput").title = t("t_metric_to");
  $("metricsReportBtn").textContent = t("btn_week_report");
  $("metricsReportBtn").title = t("t_week_report");
  $("metricsDayReportBtn").textContent = t("btn_day_report");
  $("metricsDayReportBtn").title = t("t_day_report");
  $("metricsView").setAttribute("aria-label", t("tab_metrics"));
  document.querySelector('label[for="staleSel"]').textContent = t("stale_title");
  $("staleSel").title = t("t_stale_sel");
  [...$("staleSel").options].forEach(o => { o.textContent = tf("opt_days", o.value); });
  $("staleSel").value = String(staleDays());
  // o título é o do relatório aberto (dia ou período); só se repõe com a
  // janela fechada, para uma troca de língua não trocar o título à frente
  if ($("reportOverlay").classList.contains("hidden")) {
    $("reportTitle").textContent = t("report_title");
  }
  $("reportCopy").textContent = t("btn_copy");
  $("reportSave").textContent = `⤓ ${t("btn_save_file")}`;
  $("metricsExportBtn").textContent = `⤓ ${t("btn_export")}`;
  $("metricsExportBtn").title = t("t_export");
  $("reportClose").title = t("t_close");
  $("reportOverlay").setAttribute("aria-label", t("report_title"));
  $("cmdInput").placeholder = t("ph_cmd");
  $("cmdOverlay").setAttribute("aria-label", t("cmd_title"));
  refreshMetricsIfOpen();
}

$("staleSel").addEventListener("change", () => setStaleDays($("staleSel").value));

// o período mudou: os campos, os dados e o desenho vão todos atrás dele
function metricsApplyRange() {
  metricsSyncControls();
  loadMetricsActivity(true);
  renderMetrics();
}

$("metricsDaysSel").addEventListener("change", () => {
  const v = $("metricsDaysSel").value;
  const valido = v === "day" || v === "range" || METRICS_DAY_CHOICES.includes(+v);
  metricsPrevMode = "";        // escolha explícita: já não há de onde "voltar"
  localStorage.setItem(METRICS_DAYS_KEY, valido ? v : "14");
  metricsApplyRange();
});

$("metricsDayInput").addEventListener("change", () => {
  const v = $("metricsDayInput").value;
  if (!METRICS_DAY_RE.test(v)) return;      // campo esvaziado: fica o dia de antes
  localStorage.setItem(METRICS_DAY_KEY, v);
  metricsApplyRange();
});

// Guarda o intervalo escolhido. Se as datas vierem ao contrário, ou se o
// intervalo passar de METRICS_RANGE_MAX dias, corrige-se o extremo que NÃO se
// acabou de mexer — e diz-se, para a correção não parecer um campo teimoso.
function metricsSetRange(mexido) {
  let from = $("metricsFromInput").value;
  let to = $("metricsToInput").value;
  if (!METRICS_DAY_RE.test(from) || !METRICS_DAY_RE.test(to)) return;
  if (from > to) {
    if (mexido === "from") to = from; else from = to;
  }
  if (metricsDayCount(from, to) > METRICS_RANGE_MAX) {
    if (mexido === "from") to = metricsShiftDay(from, METRICS_RANGE_MAX - 1);
    else from = metricsShiftDay(to, -(METRICS_RANGE_MAX - 1));
    toast(tf("metric_range_max", METRICS_RANGE_MAX), "");
  }
  localStorage.setItem(METRICS_FROM_KEY, from);
  localStorage.setItem(METRICS_TO_KEY, to);
  metricsApplyRange();
}

$("metricsFromInput").addEventListener("change", () => metricsSetRange("from"));
$("metricsToInput").addEventListener("change", () => metricsSetRange("to"));

// clicar numa coluna do gráfico abre esse dia; o "voltar" repõe o período
$("metricsBody").addEventListener("click", e => {
  const col = e.target.closest(".metricColBtn");
  if (col) { metricsShowDay(col.dataset.day); return; }
  if (e.target.closest(".metricDayBack")) metricsBackToPeriod();
});
$("metricsExportBtn").addEventListener("click", () => openExportPop($("metricsExportBtn")));
$("reportSave").addEventListener("click", () => exportMetrics("report"));
$("metricsReportBtn").addEventListener("click", () => openWeekReport(false));
$("metricsDayReportBtn").addEventListener("click", () => openWeekReport(true));
$("reportClose").addEventListener("click", closeWeekReport);
$("reportCopy").addEventListener("click", copyWeekReport);
$("reportOverlay").addEventListener("click", e => {
  if (e.target === $("reportOverlay")) closeWeekReport();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("reportOverlay").classList.contains("hidden")) {
    e.stopPropagation();
    closeWeekReport();
  }
}, true);
