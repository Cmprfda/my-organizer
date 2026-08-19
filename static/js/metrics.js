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
// folha de horas do período, tal como o servidor a conta (ver build_report,
// cswaios/report.py). Vem de lá em vez de ser somada aqui a partir dos `todos`
// porque o relatório que se exporta desta mesma vista conta também os
// concluídos já apagados do quadro (o arquivo, que o cliente não tem): as duas
// contas ficavam a dizer números diferentes do mesmo período, lado a lado.
let metricsTimesheet = null;     // { from, to, days, byDay, ms, untracked } ou null

// Livros abertos agora, pela chave com que o histórico os identifica: o
// histórico guarda tudo o que já viu (livros fechados, cópias de teste), e os
// cartões desta vista falam dos livros abertos — ver metricsActivityItems.
function metricsOpenBooks() {
  const out = new Set();
  (workbookTabs || []).forEach(tab => {
    const f = tab && tab.lastData && tab.lastData.file;
    if (f) out.add(f);
  });
  return out;
}

// os eventos do período que são dos livros abertos (é isso que os cartões dizem
// mostrar). Sem nenhum livro aberto não há nada a mostrar.
function metricsEvents() {
  if (!metricsActivity) return [];
  const abertos = metricsOpenBooks();
  return metricsActivity.events.filter(e => abertos.has(e.book));
}

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
  // a folha de horas do MESMO período, contada pelo servidor (é a mesma que o
  // relatório exportado leva, ver metricsTimesheet)
  try {
    const res = await fetch(`/api/report/week?since=${r.from}&until=${r.to}` +
      `&days=${r.days}&lang=${LANG}`);
    const out = await res.json();
    metricsTimesheet = {
      ...periodo,
      byDay: Array.isArray(out.timesheet) ? out.timesheet : [],
      ms: +out.timesheet_ms || 0,
      untracked: +out.timesheet_untracked_ms || 0,
    };
  } catch (e) {
    metricsTimesheet = null;
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
// As linhas de TODOS os livros abertos, cada uma com o separador de onde veio.
// Estes cartões contavam só a folha do separador ativo: com dois livros abertos
// diziam "sem dados" enquanto o outro estava cheio de trabalho — e o painel Hoje
// e o cartão das alterações já falavam dos livros todos (pedido no feedback).
function metricsRows() {
  const out = [];
  (workbookTabs || []).forEach(tab => {
    const data = tab && tab.lastData;
    if (!data || data.error) return;
    (data.row_meta || []).forEach(meta => { if (meta) out.push({ tab, meta }); });
  });
  return out;
}

// nomes dos livros abertos que trouxeram linhas, para a nota dos cartões dizer
// de onde vêm as contas
function metricsBookNames() {
  const nomes = [];
  (workbookTabs || []).forEach(tab => {
    const data = tab && tab.lastData;
    if (!data || data.error || !((data.row_meta || []).length)) return;
    const nome = tab.name || data.sheet || "";
    if (nome && !nomes.includes(nome)) nomes.push(nome);
  });
  return nomes;
}

// Estados de todos os livros abertos. Conta-se por VERTENTE (Status TC e
// Status TP são trabalhos diferentes na mesma linha, como no resto da app), e
// sempre o valor em vigor (meta.cur, já com as alterações locais ✎).
function metricsStatusItems() {
  const contas = new Map();
  metricsRows().forEach(({ meta: m }) => {
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
  const contas = new Map();
  metricsRows().forEach(({ meta: m }) => {
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
  metricsEvents().forEach(e => {
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

// O que se escreveu na caixa de pesquisa do cartão. Vive fora do desenho porque
// a vista se redesenha a cada leitura da folha (ver load, tasks.js) — se o
// filtro morasse no <input>, cada leitura apagava-o.
let metricsDaySearch = "";
// os eventos DESENHADOS, pela ordem em que estão no ecrã: o clique numa linha
// lê daqui pelo índice, em vez de levar a tarefa escrita no HTML (um "o que
// fazer" com um | partia a chave)
let metricsDayShown = [];

// o separador do livro a que uma alteração pertence (as que se mostram são
// sempre de livros abertos, ver metricsEvents)
const metricsEventTab = e =>
  (workbookTabs || []).find(x => x.lastData && x.lastData.file === e.book) || null;

// quem gravou a versão do livro que apanhou esta alteração: o dia à lupa junta
// todos os livros abertos, por isso o nome sai das versões do livro dela (ver
// histWhoInTab)
const metricsEventWho = (e, tab) =>
  e.via === "app" || !tab ? "" : histWhoInTab(tab.id, e.ts);

// A célula da folha onde a alteração aconteceu (ex.: "F12"). A letra vem do
// xlcols do livro — o mapa nome da coluna -> número no Excel que a leitura já
// traz. Sem esse mapa (livro ainda por ler, ou coluna que já lá não está)
// sobra a linha, que é o que a app sabe de certeza.
function metricsEventCell(e, tab) {
  const xlcol = ((tab && tab.lastData && tab.lastData.xlcols) || {})[e.col];
  if (!e.xlrow) return "";
  return xlcol ? `${colLetters(xlcol)}${e.xlrow}` : tf("metric_row", e.xlrow);
}

// Onde é que isto foi mexido: livro, aba e célula. O nome do livro só entra
// quando há mais do que um aberto — com um só, repeti-lo em todas as linhas era
// ruído (a nota dos outros cartões já diz de que livros são as contas).
function metricsEventWhere(e, tab) {
  const livro = metricsOpenBooks().size > 1 ? (tab && tab.name) || "" : "";
  return [livro, e.sheet, metricsEventCell(e, tab)].filter(Boolean).join(" · ");
}

// Os termos batem TODOS (E), como a pesquisa da tabela no modo "e": aqui não há
// botão para trocar de modo, e um "obs carlos" em OU trazia tudo o que tem um
// dos dois. Procura-se em tudo o que a linha mostra — tarefa, livro, aba,
// célula, coluna, antes, depois, hora e quem gravou — para não haver texto à
// vista que a pesquisa não encontre.
function metricsDayMatch(e, termos, tab) {
  if (!termos.length) return true;
  const alvo = norm([e.fn, e.todo, e.sheet, e.col, e.from, e.to,
    histWhen(e.ts), metricsEventWho(e, tab),
    (tab && tab.name) || "", metricsEventCell(e, tab)].filter(Boolean).join(" "));
  return termos.every(term => alvo.includes(term));
}

function metricsDayEvents() {
  const termos = norm(metricsDaySearch).split(/\s+/).filter(Boolean);
  return metricsEvents().filter(e => metricsDayMatch(e, termos, metricsEventTab(e)));
}

// Só as linhas (e a nota do que ficou de fora): é isto que se volta a desenhar
// a cada letra escrita na pesquisa, sem mexer no resto do cartão — assim o
// cursor não salta da caixa a meio de uma palavra.
function metricsDayRowsHtml() {
  const eventos = metricsDayEvents();
  metricsDayShown = eventos.slice(0, METRICS_DAY_ROWS);
  if (!eventos.length) {
    return metricEmpty(t(metricsDaySearch.trim() ? "metric_day_nomatch" : "metric_day_none"));
  }
  // células que cada Envio (Push) mexeu neste dia: é o que permite oferecer o
  // "desfazer o envio" aqui, onde ele se vê como um grupo (ver undoHistoryBatch)
  const lotes = {};
  eventos.forEach(e => {
    const lote = String(e.batch || "");
    if (lote) lotes[lote] = (lotes[lote] || 0) + 1;
  });
  const linhas = metricsDayShown.map((e, i) => {
    const tab = metricsEventTab(e);
    const tarefa = String(e.fn || "").trim() || String(e.todo || "").trim()
      || tf("metric_row", e.xlrow);
    const onde = metricsEventWhere(e, tab);
    const quem = metricsEventWho(e, tab);
    const marca = e.via === "app" ? t("hist_via_app")
      : (quem ? tf("hist_saved_by", quem) : t("hist_via_sheet"));
    // a linha inteira é um botão: clicar leva à linha dela na folha (ver
    // metricsGoToEvent), como no painel Hoje
    return `<li class="metricDayItem"><button type="button" data-metricgo="${i}"
      class="histRow metricDayRow metricDayGo${e.via === "app" ? " histApp" : ""}"
      title="${esc([tarefa, onde].filter(Boolean).join(" — ")
        + ` — ${marca} — ${t("t_metric_day_go")}`)}">
      <span class="histWhen">${esc(histWhen(e.ts))}</span>
      <span class="metricDayTask"><span class="metricDayName">${esc(tarefa)}</span>${onde
        ? `<span class="metricDayWhere">${esc(onde)}</span>` : ""}</span>
      <span class="histCol">${esc(e.col)}</span>
      <span class="histVals"><span class="histFrom">${esc(histValue(e.from))}</span>
        <span class="histArrow">→</span>
        <span class="histTo">${esc(histValue(e.to))}</span></span>
      <span class="histVia">${e.via === "app" ? "✎" : "☁"}${quem ? ` <span class="histWho">${esc(quem)}</span>` : ""}</span>
    </button>${(lotes[String(e.batch || "")] || 0) > 1
      ? `<button type="button" class="histUndo histUndoBatch" data-metricbatch="${esc(e.batch)}"
          data-metricbatchn="${lotes[String(e.batch)]}"
          title="${esc(tf("t_hist_undo_batch", lotes[String(e.batch)]))}">↺${lotes[String(e.batch)]}</button>`
      : ""}</li>`;
  }).join("");
  const demais = eventos.length > METRICS_DAY_ROWS
    ? `<p class="metricNote">${esc(tf("metric_day_more", METRICS_DAY_ROWS, eventos.length))}</p>`
    : "";
  return `<ul class="histList metricDayList">${linhas}</ul>` + demais;
}

function metricsDayHtml() {
  const voltar = metricsPrevMode
    ? `<p class="metricDayBackWrap"><button type="button" class="metricDayBack">${esc(t("metric_day_back"))}</button></p>`
    : "";
  if (!metricsActivity) return voltar + metricEmpty(t("loading"));
  // sem nada no dia não há o que procurar: a caixa de pesquisa só aparece
  // quando há uma lista para filtrar
  if (!metricsEvents().length) return voltar + metricEmpty(t("metric_day_none"));
  const busca = `<p class="metricDaySearchWrap"><input type="search" id="metricsDaySearch"
    class="viewMapSearch" value="${esc(metricsDaySearch)}"
    placeholder="${esc(t("metric_day_search_ph"))}"
    aria-label="${esc(t("metric_day_search_ph"))}"></p>`;
  return voltar + busca + `<div class="metricDayRows">${metricsDayRowsHtml()}</div>`;
}

// Clicar numa alteração leva à linha dela na folha (revealSource, split.js): a
// vista diz o que mudou, e o trabalho a seguir é na folha. Se a linha não
// estiver à vista — outra aba, ou fora do filtro da pessoa — é o revealSource
// que o diz.
function metricsGoToEvent(i) {
  const e = metricsDayShown[+i];
  if (!e) return;
  const tab = metricsEventTab(e);
  if (!tab) return;
  revealSource({
    view: "excel", fn: e.fn || "", todo: e.todo || "",
    sheet: e.sheet || "", workbook: tab.name || "",
  });
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

// As tarefas paradas há mais tempo (as mais antigas primeiro). Devolve a lista
// TODA: quem desenha corta-a e diz quantas ficaram de fora.
function metricsStaleRows() {
  // a idade de uma linha sai do histórico do LIVRO dela (taskAgeInTab), como no
  // painel Hoje: com vários livros abertos, medi-la pelo que está à frente dava
  // números de outra folha
  return metricsRows()
    .filter(({ tab, meta }) => taskIsStaleInTab(tab.id, meta))
    .map(({ tab, meta }) => ({ tab, meta, age: taskAgeInTab(tab.id, meta) }))
    .sort((a, b) => (b.age ? b.age.days : 0) - (a.age ? a.age.days : 0));
}

const METRICS_STALE_ROWS = 8;

function metricsStaleHtml() {
  // o histórico é por livro: basta um dos abertos já o ter para haver contas
  const semHistorico = !(workbookTabs || []).some(tab => taskHistoryByTab.get(tab.id));
  if (semHistorico) return metricEmpty(t("metric_no_history"));
  const todas = metricsStaleRows();
  const linhas = todas.slice(0, METRICS_STALE_ROWS);
  if (!linhas.length) return metricEmpty(t("metric_no_stale"));
  return `<ul class="metricList">` + linhas.map(({ tab, meta, age }) => {
    const nomeLivro = (tab && tab.name) || "";
    const titulo = String(meta.fn || "").trim() || tf("metric_row", meta.xlrow);
    // o estado que se mostra é o que está a prender a tarefa, não o primeiro
    // que aparece: numa linha com o TC feito e o TP à espera de revisão, ler
    // "Done" ao lado de "19 dias parada" só confunde
    const aplicaveis = [((meta.cur || {})["Status TC"]), ((meta.cur || {})["Status TP"])]
      .map(s => String(s || "").trim()).filter(s => s && norm(s) !== "n/a");
    const estado = aplicaveis.find(s => !statusIsFinal(s)) || aplicaveis[0] || "";
    // com vários livros abertos, saber a tarefa não basta: o nome do livro vai
    // no título, onde não rouba espaço à linha
    return `<li class="metricListRow">
      <span class="metricListName" title="${esc([titulo, nomeLivro].filter(Boolean).join(" · "))}">${esc(titulo)}</span>
      ${estado ? `<span class="badge ${statusClass(estado)}">${esc(estado)}</span>` : ""}
      <span class="metricListAge">${esc(ageLabel(age))}</span>
    </li>`;
  }).join("") + `</ul>` +
    // uma lista cortada em silêncio lia-se como "são estas": as que ficaram de
    // fora vão contadas, como no resto da app
    (todas.length > linhas.length
      ? `<p class="metricNote">${esc(tf("metric_stale_more", linhas.length, todas.length))}</p>`
      : "");
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
  ((metricsTimesheet && metricsTimesheet.byDay) || []).forEach(seg => {
    const dia = String((seg && seg.day) || "");
    if (!dia || dia < r.from || dia > r.to) return;
    porDia.set(dia, (porDia.get(dia) || 0) + (+seg.ms || 0));
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
// versão passar a guardar o registo diário (conta do servidor, a mesma do
// relatório — ver metricsTimesheet)
function metricsTimesheetUntracked() {
  return (metricsTimesheet && metricsTimesheet.untracked) || 0;
}

function metricsTimesheetHtml() {
  if (!metricsTimesheet) return metricEmpty(t("loading"));
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
  const n = metricsEvents().length;
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
  const livros = metricsBookNames();
  const semLivro = !metricsRows().length;
  // as linhas que as folhas trouxeram são as da pessoa ou as todas, conforme o
  // "Ver tudo" da vista Tarefas: os cartões que as contam dizem-no, senão o
  // número mudava com um botão que está noutra vista. E dizem também de que
  // livros são as contas, que já não é só o que está à frente.
  const ambito = (livros.length ? `${tf("metric_books", livros.join(", "))} ` : "")
    + t(showAll ? "metric_scope_all" : "metric_scope_mine");

  // A vista redesenha-se a cada leitura da folha (ver load, tasks.js): sem
  // guardar o cursor, quem estivesse a escrever na pesquisa do dia perdia-o a
  // meio da palavra.
  const busca = document.activeElement;
  const escrevia = !!busca && busca.id === "metricsDaySearch";
  const cursor = escrevia ? busca.selectionStart : 0;

  box.innerHTML =
    metricsActivityCard() +
    metricCard(t("metric_stale"), metricsStaleHtml(),
      activeHistory() ? tf("t_stale", staleDays()) : "") +
    metricCard(t("metric_status"),
      semLivro ? metricEmpty(t("metric_no_book")) : metricBars(metricsStatusItems()),
      semLivro ? "" : `${t("metric_status_note")} ${ambito}`) +
    metricCard(t("metric_people"),
      semLivro ? metricEmpty(t("metric_no_book")) : metricBars(metricsPeopleItems()),
      semLivro ? "" : `${t("metric_people_note")} ${ambito}`) +
    metricCard(t("metric_time"), metricsTimeTiles(), t("metric_time_note")) +
    metricCard(t("metric_hours"), metricsTimesheetHtml(), t("metric_hours_note"),
      metricsRange().days > 7 ? "metricCardWide" : "") +
    metricCard(t("metric_todo"), metricBars(metricsTodoItems()));

  if (escrevia) {
    const agora = $("metricsDaySearch");
    if (agora) { agora.focus(); agora.setSelectionRange(cursor, cursor); }
  }
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
      // os livros abertos vão com o pedido: o ficheiro das alterações fica com
      // as mesmas linhas que o gráfico ao lado deste botão (ver activity_csv)
      body: JSON.stringify({
        kind, since: r.from, until: r.to, days: r.days, lang: LANG, reveal: true,
        books: [...metricsOpenBooks()],
      }),
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
  // só o nome: o separador leva o logótipo da app à frente (ver index.html) e
  // escrever no textContent do botão deitava-o fora
  $("homeTabName").textContent = t("tab_home");
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
  $("metricsView").setAttribute("aria-label", t("tab_home"));
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
  metricsDaySearch = "";       // outro dia, outra lista: o filtro de antes não se aplica
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
  if (e.target.closest(".metricDayBack")) { metricsBackToPeriod(); return; }
  const lote = e.target.closest("[data-metricbatch]");
  if (lote) {
    undoHistoryBatch(lote.dataset.metricbatch, +lote.dataset.metricbatchn);
    return;
  }
  const ir = e.target.closest("[data-metricgo]");
  if (ir) metricsGoToEvent(ir.dataset.metricgo);
});

// pesquisa nas alterações do dia: só se redesenha a lista, nunca o cartão todo
$("metricsBody").addEventListener("input", e => {
  const caixa = e.target.closest("#metricsDaySearch");
  if (!caixa) return;
  metricsDaySearch = caixa.value;
  const lista = document.querySelector(".metricDayRows");
  if (lista) lista.innerHTML = metricsDayRowsHtml();
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
