// O texto de uma caixa de nota: blocos de código, tabelas e marcadores.
//
// Correr com:  node --test tests/js
//
// O que se prova aqui é o contrato da caixa (ver notes.js, "texto das caixas"):
// o que se guarda é texto simples, a vista é feita a partir dele, e a vista tem
// de conseguir voltar ao MESMO texto. Um mapa com um furo é o cursor a saltar
// para o sítio errado a escrever, que é o género de coisa que só se dá por ela
// com a caixa à frente — daí o teste.

const test = require("node:test");
const assert = require("node:assert");
const { loadUi } = require("./harness.js");

const ui = loadUi("i18n", "state", "utils", "notes");
const F = "```";

test("um bloco de código é reconhecido, com e sem linguagem", () => {
  const lines = ui.noteTextLines(`antes\n${F}python\nx = 1\ny = 2\n${F}\ndepois`);
  const b = ui.noteCodeBlock(lines, 1);
  assert.ok(b, "bloco não reconhecido");
  assert.equal(b.lang, "python");
  assert.deepEqual(b.body.map(l => l.text), ["x = 1", "y = 2"]);
  assert.equal(b.count, 4);                       // cerca + 2 linhas + cerca
  assert.equal(ui.noteCodeBlock(lines, 0), null);  // "antes" não é bloco

  const semLang = ui.noteTextLines(`${F}\nls -la\n${F}`);
  assert.equal(ui.noteCodeBlock(semLang, 0).lang, "");
});

test("um bloco sem fecho vale até ao fim do texto", () => {
  const lines = ui.noteTextLines(`${F}sh\nvipConfigure.sh\nldraUpload ();`);
  const b = ui.noteCodeBlock(lines, 0);
  assert.equal(b.close, null);
  assert.deepEqual(b.body.map(l => l.text), ["vipConfigure.sh", "ldraUpload ();"]);
  assert.equal(b.count, 3);
});

test("dentro do bloco não se interpreta nada", () => {
  const texto = `${F}\n**isto** não é negrito | nem | tabela\n${F}`;
  const html = ui.noteRichRender(texto).html;
  assert.match(html, /<pre class="noteBoxCode"/);
  assert.ok(!html.includes("<strong>"), "negrito interpretado dentro do código");
  assert.ok(!html.includes("<table"), "tabela interpretada dentro do código");
  assert.match(html, /\*\*isto\*\*/);            // os asteriscos ficam à vista
});

test("o mapa da vista tem um índice por caractere visível", () => {
  // é isto que põe o cursor no sítio certo quando se clica no meio do código
  const texto = `linha\n${F}py\nx = 1\n${F}`;
  const out = ui.noteRichRender(texto);
  const visivel = out.html.replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  assert.equal(out.map.length, visivel.length,
    `mapa com ${out.map.length} para ${visivel.length} caracteres visíveis`);
  // cada índice aponta para dentro do texto original
  out.map.forEach(i => assert.ok(i >= 0 && i <= texto.length, `índice fora: ${i}`));
});

test("a linguagem fica no data-lang e não numa linha de texto", () => {
  const html = ui.noteRichRender(`${F}bash\necho oi\n${F}`).html;
  assert.match(html, /data-lang="bash"/);
  const visivel = html.replace(/<[^>]*>/g, "");
  assert.ok(!visivel.includes("bash"), "a linguagem apareceu como texto");
});

test("copiar em texto simples tira as cercas e deixa o código", () => {
  const plain = ui.noteBoxPlainText(`antes\n${F}sh\nls -la\n${F}\ndepois`);
  assert.equal(plain, "antes\nls -la\ndepois");
});

test("o bloco de código não estragou as tabelas nem os marcadores", () => {
  const html = ui.noteRichRender("| a | b |\n| --- | --- |\n| 1 | 2 |").html;
  assert.match(html, /<table class="noteBoxTable"/);
  assert.equal(ui.noteMarkPlain("**forte** e ~~riscado~~"), "forte e riscado");
  assert.equal(ui.noteBoxPlainText("| a | b |\n| --- | --- |\n| 1 | 2 |"),
    "a\tb\n1\t2");
});

test("uma caixa vazia mostra o texto de exemplo e não um bloco", () => {
  assert.match(ui.noteBoxViewHtml("", false), /noteBoxPh/);
  assert.ok(!ui.noteBoxViewHtml("", false).includes("noteBoxCode"));
});
