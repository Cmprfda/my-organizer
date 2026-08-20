// Correr as funções da interface no node, sem browser.
//
// A interface são 30 ficheiros de scripts de página: sem módulos, sem exports e
// com o arranque a pendurar-se em elementos do HTML (`$("noteCanvas")
// .addEventListener(...)`). Por isso não se podem `require` — e era essa a
// desculpa para os 156 testes do servidor não terem UM do lado do browser,
// justamente onde vive a maior parte do código desta app.
//
// O que se faz aqui: avalia-se o ficheiro tal como está num contexto do `vm`
// com um DOM de mentira, e depois chamam-se as funções que são PURAS (texto a
// entrar, texto a sair) — os detetores dos blocos, a vista formatada, a cópia,
// os estados, as datas. O que precisa de um DOM a sério não se testa aqui; é
// para isso que existe o Playwright (ver docs/ui-testing-playwright-mcp.md).

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const STATIC = path.join(__dirname, "..", "..", "static", "js");

// Um objeto que aceita tudo: qualquer propriedade dá outro igual, e chamá-lo
// também. É o que deixa o arranque dos ficheiros correr sem browser
// (`$("x").addEventListener(...)`, `document.body.classList.toggle(...)`).
// Propositadamente FALSO num `if`: assim os arranques que perguntam "existe
// isto?" seguem o caminho de quem não tem nada, em vez de entrarem num ciclo
// à espera de um DOM que não existe.
function stub(nome = "stub") {
  const alvo = function () { };
  alvo.__stub = nome;
  return new Proxy(alvo, {
    get(_t, prop) {
      if (prop === "__stub") return nome;
      if (prop === Symbol.toPrimitive) return () => "";
      if (prop === "toString") return () => "";
      if (prop === Symbol.iterator) return function* () { };
      if (prop === "length") return 0;
      if (prop === "value" || prop === "textContent" || prop === "innerHTML") return "";
      if (prop === "dataset" || prop === "style" || prop === "classList") return stub(prop);
      if (prop === "then") return undefined;        // não é uma promessa
      return stub(`${nome}.${String(prop)}`);
    },
    apply() { return stub(`${nome}()`); },
    construct() { return stub(`new ${nome}`); },
    has() { return true; },
  });
}

function novoContexto() {
  const guardado = {};
  const ctx = {
    console,
    setTimeout, clearTimeout,
    // os ciclos do arranque (o de 20s a perguntar pelo livro, o do cronómetro
    // da lista) não correm nos testes: aqui prova-se o que as funções fazem,
    // não o que o tempo faz — e um ciclo a disparar a meio do teste ia buscar
    // funções de ficheiros que este teste não carregou
    setInterval: () => 0,
    clearInterval: () => { },
    JSON, Math, Date, RegExp, Object, Array, String, Number, Boolean, Error,
    Promise, Map, Set, WeakMap, isNaN, parseInt, parseFloat, encodeURIComponent,
    decodeURIComponent, Intl, URLSearchParams, TextEncoder, TextDecoder,
    structuredClone, AbortController, Blob,
    localStorage: {
      getItem: k => (k in guardado ? guardado[k] : null),
      setItem: (k, v) => { guardado[k] = String(v); },
      removeItem: k => { delete guardado[k]; },
    },
    sessionStorage: {
      getItem: () => null, setItem: () => { }, removeItem: () => { },
    },
    document: stub("document"),
    navigator: { clipboard: stub("clipboard"), userAgent: "node" },
    location: { search: "", href: "http://localhost/", pathname: "/" },
    fetch: () => Promise.reject(new Error("sem rede nos testes")),
    EventSource: undefined,
    Headers: class { set() { } get() { return null; } },
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, COMMENT_NODE: 8 },
    NodeFilter: { SHOW_TEXT: 4 },
    CSS: { escape: s => String(s) },
    getComputedStyle: () => stub("computedStyle"),
    requestAnimationFrame: fn => setTimeout(fn, 0),
    matchMedia: () => ({ matches: false, addEventListener() { } }),
    alert: () => { }, confirm: () => false, prompt: () => null,
    $: () => stub("$"),
    // o arranque dos ficheiros pendura-se na janela e no documento: aqui não
    // acontece nada, o que interessa é que corra até ao fim
    addEventListener: () => { },
    removeEventListener: () => { },
    dispatchEvent: () => true,
    scrollTo: () => { },
    open: () => null,
    innerWidth: 1280,
    innerHeight: 900,
    devicePixelRatio: 1,
    isSecureContext: false,
    scrollY: 0,
    scrollX: 0,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  return vm.createContext(ctx);
}

// carrega ficheiros de static/js pela ordem dada e devolve o contexto
function loadUi(...nomes) {
  const ctx = novoContexto();
  for (const nome of nomes) {
    const ficheiro = path.join(STATIC, `${nome}.js`);
    vm.runInContext(fs.readFileSync(ficheiro, "utf8"), ctx, { filename: ficheiro });
  }
  return ctx;
}

module.exports = { loadUi, stub };
