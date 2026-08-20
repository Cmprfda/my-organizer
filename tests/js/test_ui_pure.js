// Funções puras da interface: estados, colunas, procura e a corrente de um
// item que se repete.  Correr com:  node --test tests/js/test_ui_pure.js

const test = require("node:test");
const assert = require("node:assert");
const { loadUi } = require("./harness.js");

const base = loadUi("i18n", "state", "utils");
const comTodo = loadUi("i18n", "state", "utils", "todo");

test("um estado final é lido como final, escrito como for", () => {
  for (const feito of ["Done", "done", "Concluído", "Reviewed", "revisto", "OK", "Closed"]) {
    assert.equal(base.statusClass(feito), "done", feito);
    assert.ok(base.statusIsFinal(feito), feito);
  }
  // "Removed" não é um Done, mas também já não espera trabalho de ninguém
  assert.notEqual(base.statusClass("Removed"), "done");
  assert.ok(base.statusIsFinal("Removed"));
  // "Ready for review" é trabalho a decorrer, não trabalho fechado
  assert.equal(base.statusClass("Ready for review"), "doing");
  assert.ok(!base.statusIsFinal("Ready for review"));
  assert.equal(base.statusClass("Blocked by CCR"), "blocked");
  assert.equal(base.statusClass("Not ready to start"), "other");
});

test("o número da coluna dá as letras do Excel", () => {
  assert.equal(base.colLetters(1), "A");
  assert.equal(base.colLetters(26), "Z");
  assert.equal(base.colLetters(27), "AA");
  assert.equal(base.colLetters(52), "AZ");
  assert.equal(base.colLetters(0), "");
});

test("procurar não olha a acentos nem a maiúsculas", () => {
  assert.equal(base.norm("Configuração ÀÉÎÕÜ"), "configuracao aeiou");
  assert.match(base.boldTerms("Rework do vipConfigure", ["rework"]),
    /<strong>Rework<\/strong>/);
  // o que se escreve fica escapado: uma linha da folha com "<" não é HTML
  assert.match(base.boldTerms("a < b & c", []), /a &lt; b &amp; c/);
});

test("a corrente de um item que se repete conta as ocorrências", () => {
  const it = {
    occurrences: [
      { day: "2026-08-10", state: "done" },
      { day: "2026-08-11", state: "missed" },
      { day: "2026-08-12", state: "done" },
    ],
  };
  const st = comTodo.todoStreak(it);
  assert.equal(st.total, 3);
  assert.equal(st.feitas, 2);
  // só as dez últimas: um item diário de um ano não enche a dica
  const muitas = { occurrences: [] };
  for (let d = 1; d <= 30; d++) {
    muitas.occurrences.push({ day: `2026-08-${String(d).padStart(2, "0")}`, state: "done" });
  }
  assert.equal(comTodo.todoStreak(muitas).total, 10);
  // um item que não se repete não tem corrente nenhuma
  assert.equal(comTodo.todoStreak({}), null);
  assert.equal(comTodo.todoStreakTip({}), "");
});

test("a dica da corrente diz os dias, do mais recente para o mais antigo", () => {
  const tip = comTodo.todoStreakTip({
    occurrences: [
      { day: "2026-08-10", state: "missed" },
      { day: "2026-08-11", state: "done" },
    ],
  });
  assert.match(tip, /1 das últimas 2|1 of the last 2/);
  assert.ok(tip.indexOf("11/08") < tip.indexOf("10/08"), "ordem invertida");
});
