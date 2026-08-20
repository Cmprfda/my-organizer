// As peças novas da interface que são contas puras: o oráculo do cronómetro, o
// agrupamento por dia do "o que perdi", a mediana escrita em dias ou horas e o
// livro de dívidas.  Correr com:  node --test tests/js/test_dobras_ui.js

const test = require("node:test");
const assert = require("node:assert");
const { loadUi } = require("./harness.js");

const comTodo = loadUi("i18n", "state", "utils", "todo");
const comHoje = loadUi("i18n", "state", "utils", "history", "todo", "today");
const comMetricas = loadUi("i18n", "state", "utils", "history", "todo", "metrics");
const comEsperas = loadUi("i18n", "state", "utils", "waiting");
const comHist = loadUi("i18n", "state", "utils", "history");

const HORA = 3600000;

const STATS = { repeats: { a: { n: 6, median_ms: HORA, thin: false } } };

test("o oráculo do cronómetro compara com o costume DAQUELE item", () => {
  const item = { id: "a" };
  // dentro do costume: nenhuma marca
  assert.equal(comTodo.todoTimerOracle(item, HORA, STATS).cls, "");
  // 1h24 sobre uma mediana de 1h ainda não é "fora do costume"
  assert.equal(comTodo.todoTimerOracle(item, HORA * 1.4, STATS).cls, "");
  // o dobro é
  assert.equal(comTodo.todoTimerOracle(item, HORA * 2, STATS).cls, " overTypical");
  // e a dica diz sempre qual é o costume, e com quantas voltas
  assert.match(comTodo.todoTimerOracle(item, HORA, STATS).tip, /01:00/);
});

test("um item sem voltas contadas não tem oráculo nenhum", () => {
  const out = comTodo.todoTimerOracle({ id: "sem" }, HORA * 9, { repeats: {} });
  assert.equal(out.cls, "");
  assert.equal(out.tip, "");
});

test("poucas voltas dizem-se como poucas voltas", () => {
  const poucas = { repeats: { a: { n: 2, median_ms: HORA, thin: true } } };
  assert.match(comTodo.todoTimerOracle({ id: "a" }, HORA, poucas).tip, /2/);
});

test("o que perdi agrupa as alterações pelo dia, mais recente primeiro", () => {
  const eventos = [
    { ts: "2026-08-17T09:00:00", book: "l", sheet: "s", xlrow: 10 },
    { ts: "2026-08-17T15:00:00", book: "l", sheet: "s", xlrow: 10 },
    { ts: "2026-08-17T16:00:00", book: "l", sheet: "s", xlrow: 11 },
    { ts: "2026-08-19T09:00:00", book: "l", sheet: "s", xlrow: 12 },
  ];
  const dias = comHoje.todayByDay(eventos);
  assert.equal(dias.length, 2);
  assert.equal(dias[0].day, "2026-08-19");
  assert.equal(dias[1].day, "2026-08-17");
  // três alterações, mas em duas linhas só
  assert.equal(dias[1].n, 3);
  assert.equal(dias[1].rows.size, 2);
});

test("um evento sem data não inventa um dia", () => {
  assert.equal(comHoje.todayByDay([{ ts: "" }, { ts: null }]).length, 0);
});

test("o dia do regresso escreve-se com o dia da semana", () => {
  // 2026-08-17 é uma segunda-feira
  assert.match(comHoje.todayDayLabel("2026-08-17"), /seg|Mon/);
  assert.match(comHoje.todayDayLabel("2026-08-17"), /17\/08/);
  // uma data que não presta devolve-se como está, em vez de "Invalid Date"
  assert.equal(comHoje.todayDayLabel("nem-uma-data"), "nem-uma-data");
});

test("uma mediana abaixo de um dia diz-se em horas", () => {
  assert.equal(comMetricas.metricsDays1(0.25), "6h");
  assert.equal(comMetricas.metricsDays1(2.14), "2.1");
  assert.equal(comMetricas.metricsDays1(0), "0");
  // meia hora não é "0 dias"
  assert.equal(comMetricas.metricsDays1(0.02), "1h");
});

test("o livro de dívidas encontra a pessoa sem olhar a maiúsculas", () => {
  const gente = [{ who: "Rui", n: 6, median_days: 3.2, max_days: 9 }];
  assert.equal(comEsperas.waitingRecordOf("rui", gente).n, 6);
  assert.equal(comEsperas.waitingRecordOf("  RUI  ", gente).n, 6);
  assert.equal(comEsperas.waitingRecordOf("Ana", gente), null);
  assert.equal(comEsperas.waitingRecordOf("", gente), null);
});

test("o prefixo de uma função larga o número do caso", () => {
  // o "_TC" fica: a série dos TC e a dos TP são famílias diferentes, e juntá-las
  // dava por vizinhas linhas que não são
  assert.equal(comHist.taskFnPrefix("vipConfigure_TC01"), "vipconfigure_tc");
  assert.equal(comHist.taskFnPrefix("FCU-32"), "fcu");
  assert.equal(comHist.taskFnPrefix("FCU-32b"), "fcu");
  // um nome curto não se corta até deixar de dizer nada
  assert.equal(comHist.taskFnPrefix("TC1"), "tc1");
  assert.equal(comHist.taskFnPrefix(""), "");
  assert.equal(comHist.taskFnPrefix(null), "");
});

test("o maior silêncio de uma linha é o maior intervalo entre alterações", () => {
  const eventos = [
    { ts: "2026-08-01T09:00:00" },
    { ts: "2026-08-03T09:00:00" },   // 2 dias
    { ts: "2026-08-15T09:00:00" },   // 12 dias
    { ts: "2026-08-16T09:00:00" },
  ];
  const pausa = comHist.taskLongestGap(eventos);
  assert.equal(pausa.days, 12);
  assert.equal(pausa.from, "2026-08-03T09:00:00");
  // uma linha com uma alteração só não tem intervalo nenhum
  assert.equal(comHist.taskLongestGap([{ ts: "2026-08-01T09:00:00" }]), null);
  assert.equal(comHist.taskLongestGap([]), null);
});
