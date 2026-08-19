// My Organizer — vista "Código": abrir uma pasta do disco (um repositório, a
// pasta dos scripts) e ler o que lá está sem sair da app.
//
// Cada pasta aberta tem o seu separador ("code:<id>"), como cada livro de Excel
// tem o dele: abre-se pelo "+" da barra dos separadores e fecha-se pelo ✕ do
// separador. O painel #codeView é um só e mostra sempre a pasta do separador
// ativo — é o codeRepoId que manda (ver setActiveCodeTab). A lista das pastas
// abertas não é deste browser: vem do servidor (repos.json, ver repo.py).
//
// É só leitura: a app mostra a árvore e o texto dos ficheiros, não grava nada
// por cima deles. Os ficheiros vivem no PC onde a app corre, por isso o
// servidor só responde a estes pedidos a partir daí — de outro aparelho a lista
// vem vazia e não há nenhum separador de código para abrir.

let codeRepos = [];
let codeRepoId = localStorage.getItem("bsp-tracker-code-repo") || "";
let codeSearchTimer = null;

/* Estado de cada pasta aberta: a árvore por onde se andou, o ficheiro à frente
   e a procura são de cada separador (como o lastData de cada livro), por isso
   voltar a um separador devolve-o exatamente onde estava. */
const codeStates = new Map();

function codeState(id) {
  id = id || codeRepoId;
  let st = codeStates.get(id);
  if (!st) {
    st = {
      open: new Set(),    // pastas abertas na árvore
      cache: new Map(),   // "pasta" -> entradas já lidas
      skip: new Set(),    // pastas que não se abrem (.git, node_modules…)
      file: "",           // ficheiro aberto (caminho relativo à raiz)
      data: null,         // resposta do servidor para esse ficheiro
      hits: null,         // resultado da procura por nome (null = árvore)
      filter: "",         // o que está na caixa de procura
      seeded: false,      // a raiz desta pasta já foi lida uma vez
    };
    codeStates.set(id, st);
  }
  return st;
}

// estados de pastas que já não estão abertas não têm para onde voltar
function pruneCodeStates() {
  [...codeStates.keys()].forEach(id => {
    if (!codeRepos.some(r => r.id === id)) codeStates.delete(id);
  });
}

const codeVisible = () => isCodeView(currentView) || isCodeView(sideView);
const codeRepo = () => codeRepos.find(r => r.id === codeRepoId) || null;
// ficheiro onde se estava em cada pasta (uma chave por pasta: os separadores
// não se pisam uns aos outros)
const codeFileKey = id => `bsp-tracker-code-file:${id}`;

// ---------- servidor ----------

async function codePost(body) {
  try {
    const res = await fetch("/api/repo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = await res.json();
    if (!out.ok) {
      if (out.error) toast(out.error, "err");
      return null;
    }
    return out;
  } catch (err) {
    toast(`${t("code_err")} ${err}`, "err");
    return null;
  }
}

// as pastas abertas (e por isso os separadores) vêm do servidor: de outro
// aparelho da rede a lista vem vazia e não há nenhum separador de código
async function loadRepos() {
  try {
    const res = await fetch("/api/repos");
    const out = await res.json();
    codeRepos = out.repos || [];
  } catch (err) {
    return;
  }
  // numa janela dedicada a uma pasta só entra essa (as outras continuam na
  // janela principal), como o SOLO_WB faz aos livros
  if (SOLO_CODE) {
    codeRepos = codeRepos.filter(r => r.id === SOLO_CODE);
    codeRepoId = SOLO_CODE;
  }
  if (!codeRepo()) codeRepoId = (codeRepos[0] || {}).id || "";
  setCodeRepos(codeRepos);
}

// a lista mudou (abriu-se ou fechou-se uma pasta): separadores novos
function setCodeRepos(repos) {
  codeRepos = repos || [];
  pruneCodeStates();
  renderCodeTabs();
  if (codeVisible()) renderCode();
}

// ---------- árvore ----------

async function codeDir(id, path) {
  const st = codeState(id);
  if (st.cache.has(path)) return st.cache.get(path);
  const out = await codePost({ action: "list", id, path });
  const entries = out ? out.entries : [];
  entries.forEach(e => { if (e.dir && e.skip) st.skip.add(e.path); });
  st.cache.set(path, entries);
  return entries;
}

async function toggleCodeDir(path) {
  const st = codeState();
  if (st.open.has(path)) st.open.delete(path);
  else {
    st.open.add(path);
    await codeDir(codeRepoId, path);
  }
  renderCodeTree();
}

const codeIcon = (st, e) => (e.dir ? (st.open.has(e.path) ? "▾" : "▸") : "");

function codeTreeHtml(st, path, depth) {
  const entries = st.cache.get(path) || [];
  let html = "";
  for (const e of entries) {
    const pad = 6 + depth * 12;
    if (e.dir) {
      // node_modules, .git e companhia continuam à vista (para se saber que
      // existem) mas não se abrem: encher a árvore com elas não serve a ninguém
      html += `<div class="codeRow codeDirRow${e.skip ? " skip" : ""}" data-cdir="${esc(e.path)}"
        style="padding-left:${pad}px" title="${esc(e.skip ? t("t_code_skip") : e.path)}">
        <span class="codeCaret">${e.skip ? "·" : codeIcon(st, e)}</span>
        <span class="codeName">${esc(e.name)}</span>
      </div>`;
      if (!e.skip && st.open.has(e.path)) html += codeTreeHtml(st, e.path, depth + 1);
      continue;
    }
    html += `<div class="codeRow codeFileRow${e.path === st.file ? " active" : ""}"
      data-cfile="${esc(e.path)}" style="padding-left:${pad + 14}px" title="${esc(e.path)}">
      <span class="codeName">${esc(e.name)}</span>
      <span class="codeSize">${esc(codeSizeLabel(e.size))}</span>
    </div>`;
  }
  return html;
}

function codeHitsHtml(st) {
  if (!st.hits.hits.length) return `<div class="codeTreeEmpty">${esc(t("code_no_hits"))}</div>`;
  const rows = st.hits.hits.map(h => {
    const dir = h.path.slice(0, h.path.length - h.name.length).replace(/\/$/, "");
    return `<div class="codeRow codeFileRow${h.path === st.file ? " active" : ""}"
      data-cfile="${esc(h.path)}" title="${esc(h.path)}">
      <span class="codeName">${esc(h.name)}</span>
      <span class="codeHitDir">${esc(dir)}</span>
    </div>`;
  }).join("");
  const more = st.hits.partial ? `<div class="codeTreeEmpty">${esc(t("code_hits_partial"))}</div>` : "";
  return rows + more;
}

function renderCodeTree() {
  const box = $("codeTree");
  if (!box) return;
  const repo = codeRepo();
  if (!repo) { box.innerHTML = ""; return; }
  if (repo.missing) {
    box.innerHTML = `<div class="codeTreeEmpty">${esc(t("code_missing"))}</div>`;
    return;
  }
  const st = codeState();
  box.innerHTML = st.hits ? codeHitsHtml(st) : codeTreeHtml(st, "", 0);
}

// ---------- ficheiro aberto ----------

function codeSizeLabel(bytes) {
  const n = Number(bytes || 0);
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function openCodeFile(path) {
  const id = codeRepoId;
  if (!id || !path) return;
  const st = codeState(id);
  st.file = path;
  st.data = null;
  renderCodeTree();
  renderCodeFile();
  const out = await codePost({ action: "read", id, path });
  if (!out || st.file !== path) return;   // já se abriu outro entretanto
  st.data = out;
  localStorage.setItem(codeFileKey(id), path);
  // a pasta pode ter mudado de separador entretanto: só se pinta se ainda é esta
  if (codeRepoId === id) renderCodeFile();
}

function renderCodeFile() {
  const head = $("codeFileHead");
  const body = $("codeFileBody");
  if (!head || !body) return;
  const st = codeState();
  const codeFile = st.file;
  if (!codeFile) {
    head.innerHTML = "";
    body.innerHTML = `<div class="codeHint">${esc(t("code_pick_file"))}</div>`;
    return;
  }
  const d = st.data;
  const bits = [];
  if (d && !d.binary) bits.push(`${d.text.split("\n").length} ${t("code_lines")}`);
  if (d) bits.push(codeSizeLabel(d.size));
  head.innerHTML = `<span class="codePath">${esc(codeFile)}</span>` +
    `<span class="codeMeta">${esc(bits.filter(Boolean).join(" · "))}</span>` +
    `<span class="codeFileActions">` +
    `<button type="button" class="linkBtn" id="codeCopyBtn">${esc(t("code_copy"))}</button>` +
    `<button type="button" class="linkBtn" id="codeReloadBtn">${esc(t("code_reload"))}</button>` +
    `</span>`;
  if (!d) { body.innerHTML = `<div class="codeHint">${esc(t("loading"))}</div>`; return; }
  if (d.binary) { body.innerHTML = `<div class="codeHint">${esc(t("code_binary"))}</div>`; return; }
  const lines = d.text.split("\n");
  const gutter = lines.map((_, i) => i + 1).join("\n");
  const warn = d.truncated ? `<div class="codeWarn">${esc(t("code_truncated"))}</div>` : "";
  body.innerHTML = `${warn}<div class="codeFile"><pre class="codeGutter">${gutter}</pre>` +
    `<pre class="codeText"><code>${codeHighlight(d.text, d.lang)}</code></pre></div>`;
}

// ---------- pintar o código ----------
// Um destacador pequeno e próprio: chega para ler um script e não traz nenhuma
// biblioteca de fora (a app é local e não vai buscar nada à internet). O que
// não conhecer fica texto simples — nunca deixa de mostrar o ficheiro.

const CODE_KW = {
  python: "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield None True False self",
  js: "async await break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while with yield true false null undefined interface type enum implements readonly",
  json: "true false null",
  css: "important",
  c: "auto bool break case catch char class const constexpr continue default delete do double else enum explicit export extern false float for friend goto if inline int long namespace new nullptr operator private protected public register return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while var func package import type interface map chan go defer range string error nil let mut fn impl pub crate match",
  sh: "if then else elif fi for while do done case esac function return export local source echo cd exit set unset read",
  bat: "if else for in do goto call set echo exit rem off on not exist errorlevel setlocal endlocal pause start",
  ps1: "if else elseif foreach for while do switch function return param begin process end try catch finally throw break continue filter in",
  sql: "select from where group by order having insert update delete into values set join inner left right outer on as and or not null is distinct create table drop alter add primary key foreign references index view union all limit top case when then else end",
  yaml: "true false null yes no",
  ini: "true false yes no on off",
  vb: "dim set if then else elseif end sub function for each next while wend do loop select case const private public with on error resume goto true false nothing",
  text: "",
};

const CODE_RULES = {
  python: { line: ["#"], block: [], strings: ['"""', "'''", '"', "'"] },
  js: { line: ["//"], block: [["/*", "*/"]], strings: ['"', "'", "`"] },
  json: { line: [], block: [], strings: ['"'] },
  css: { line: [], block: [["/*", "*/"]], strings: ['"', "'"] },
  c: { line: ["//"], block: [["/*", "*/"]], strings: ['"', "'"] },
  sh: { line: ["#"], block: [], strings: ['"', "'"] },
  bat: { line: ["::", "rem "], block: [], strings: ['"'] },
  ps1: { line: ["#"], block: [["<#", "#>"]], strings: ['"', "'"] },
  sql: { line: ["--"], block: [["/*", "*/"]], strings: ["'", '"'] },
  yaml: { line: ["#"], block: [], strings: ['"', "'"] },
  ini: { line: ["#", ";"], block: [], strings: ['"', "'"] },
  vb: { line: ["'"], block: [], strings: ['"'] },
  text: { line: [], block: [], strings: [] },
};

const codeWordChar = c => /[A-Za-z0-9_$]/.test(c);

// texto -> HTML com <span> por tipo. O texto é sempre escapado à passagem, por
// isso o conteúdo de um ficheiro nunca chega ao DOM como HTML.
function codeScan(text, lang) {
  const rules = CODE_RULES[lang] || CODE_RULES.text;
  const kw = new Set((CODE_KW[lang] || "").split(" ").filter(Boolean));
  const out = [];
  const n = text.length;
  let i = 0, plain = "";
  const flush = () => { if (plain) { out.push(esc(plain)); plain = ""; } };
  const span = (cls, s) => { flush(); out.push(`<span class="${cls}">${esc(s)}</span>`); };
  while (i < n) {
    // comentário de linha
    const lineMark = rules.line.find(m => text.startsWith(m, i));
    if (lineMark) {
      const end = text.indexOf("\n", i);
      span("cm", text.slice(i, end < 0 ? n : end));
      i = end < 0 ? n : end;
      continue;
    }
    // comentário em bloco
    const blk = rules.block.find(([open]) => text.startsWith(open, i));
    if (blk) {
      const end = text.indexOf(blk[1], i + blk[0].length);
      const stop = end < 0 ? n : end + blk[1].length;
      span("cm", text.slice(i, stop));
      i = stop;
      continue;
    }
    // texto entre aspas (com \\ a escapar o que vem a seguir)
    const q = rules.strings.find(d => text.startsWith(d, i));
    if (q) {
      let j = i + q.length;
      while (j < n) {
        if (text[j] === "\\") { j += 2; continue; }
        if (text.startsWith(q, j)) { j += q.length; break; }
        // aspas simples/duplas não atravessam a linha (um apóstrofo solto não
        // pinta de texto o resto do ficheiro); o """ do Python e a plica
        // invertida do JavaScript atravessam, que é para isso que servem
        if ((q === '"' || q === "'") && text[j] === "\n") break;
        j += 1;
      }
      span("st", text.slice(i, Math.min(j, n)));
      i = Math.min(j, n);
      continue;
    }
    const ch = text[i];
    // número
    if (/[0-9]/.test(ch) && (i === 0 || !codeWordChar(text[i - 1]))) {
      let j = i;
      while (j < n && /[0-9a-fA-FxXoObB._]/.test(text[j])) j += 1;
      span("nu", text.slice(i, j));
      i = j;
      continue;
    }
    // palavra: pode ser uma palavra-chave, ou o nome de uma função a ser chamada
    if (codeWordChar(ch) && !/[0-9]/.test(ch)) {
      let j = i;
      while (j < n && codeWordChar(text[j])) j += 1;
      const word = text.slice(i, j);
      if (kw.has(word)) span("kw", word);
      else if (text[j] === "(") span("fn", word);
      else plain += word;
      i = j;
      continue;
    }
    plain += ch;
    i += 1;
  }
  flush();
  return out.join("");
}

// HTML/XML: as etiquetas e os atributos, o resto é texto
function codeScanMarkup(text) {
  const out = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf("<", i);
    if (lt < 0) { out.push(esc(text.slice(i))); break; }
    if (lt > i) out.push(esc(text.slice(i, lt)));
    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt);
      const stop = end < 0 ? n : end + 3;
      out.push(`<span class="cm">${esc(text.slice(lt, stop))}</span>`);
      i = stop;
      continue;
    }
    const gt = text.indexOf(">", lt);
    const stop = gt < 0 ? n : gt + 1;
    out.push(codeTagHtml(text.slice(lt, stop)));
    i = stop;
  }
  return out.join("");
}

// "<div class=…>": a etiqueta de uma cor, os nomes dos atributos de outra e os
// valores como texto. Tudo passa pelo esc() ANTES de ganhar cor — o conteúdo do
// ficheiro nunca chega ao DOM como HTML.
function codeTagHtml(tag) {
  const m = /^(<\/?[\w:.-]*)([\s\S]*)$/.exec(tag);
  if (!m) return `<span class="tg">${esc(tag)}</span>`;
  const attrs = esc(m[2]).replace(
    /([\w:.-]+)(\s*=\s*)(&quot;[\s\S]*?&quot;|'[^']*'|[^\s&]+)/g,
    (all, key, eq, val) => `<span class="at">${key}</span>${eq}<span class="st">${val}</span>`);
  return `<span class="tg">${esc(m[1])}${attrs}</span>`;
}

// Markdown: títulos, blocos de código, negrito e listas — linha a linha
function codeScanMd(text) {
  let fence = false;
  return text.split("\n").map(line => {
    if (/^\s*```/.test(line)) { fence = !fence; return `<span class="cm">${esc(line)}</span>`; }
    if (fence) return `<span class="st">${esc(line)}</span>`;
    if (/^\s*#{1,6}\s/.test(line)) return `<span class="kw">${esc(line)}</span>`;
    if (/^\s*([-*+]|\d+\.)\s/.test(line)) {
      const m = /^(\s*([-*+]|\d+\.)\s)(.*)$/.exec(line);
      return `<span class="tg">${esc(m[1])}</span>${codeMdInline(m[3])}`;
    }
    return codeMdInline(line);
  }).join("\n");
}

function codeMdInline(line) {
  return esc(line)
    .replace(/`([^`]+)`/g, '<span class="st">`$1`</span>')
    .replace(/\*\*([^*]+)\*\*/g, '<span class="kw">**$1**</span>');
}

function codeHighlight(text, lang) {
  try {
    if (lang === "html" || lang === "xml") return codeScanMarkup(text);
    if (lang === "md") return codeScanMd(text);
    if (lang && CODE_RULES[lang]) return codeScan(text, lang);
    return esc(text);
  } catch (err) {
    return esc(text);   // seja qual for o ficheiro, mostra-se sempre
  }
}

// ---------- a vista ----------

// A vista ocupa o que sobra da janela e é lá dentro que a árvore e o ficheiro
// rolam — a página em si não cresce. A mesma conta do fitNoteCanvas (notes.js).
function fitCodeLayout() {
  const box = $("codeLayout");
  if (!box || box.classList.contains("hidden") || !box.offsetParent) return;
  if (document.body.classList.contains("split")) { box.style.height = ""; return; }
  const wrap = box.closest(".wrap");
  const gap = (wrap && parseFloat(getComputedStyle(wrap).paddingBottom)) || 92;
  const top = box.getBoundingClientRect().top + window.scrollY;
  box.style.height = `${Math.max(320, Math.floor(window.innerHeight - top - gap))}px`;
}

window.addEventListener("resize", fitCodeLayout);

function renderCode() {
  if (!$("codeView")) return;
  const repo = codeRepo();
  $("codeLayout").classList.toggle("hidden", !repo);
  if (!repo) {
    // sem pasta à frente (fechou-se o separador) o painel fica escondido:
    // limpar o que lá estava evita que a árvore antiga reapareça no seguinte
    $("codeTree").innerHTML = "";
    $("codeFileHead").innerHTML = "";
    $("codeFileBody").innerHTML = "";
    return;
  }
  fitCodeLayout();
  // a procura é de cada separador, como a árvore e o ficheiro
  $("codeFilter").value = codeState().filter;
  renderCodeTree();
  renderCodeFile();
}

// ---------- procurar um ficheiro pelo nome ----------

async function runCodeSearch(id, q) {
  if (!id) return;
  const st = codeState(id);
  if (q.trim().length < 2) { st.hits = null; renderCodeTree(); return; }
  const out = await codePost({ action: "search", id, query: q });
  if (!out) return;
  st.hits = { hits: out.hits || [], partial: !!out.partial };
  if (codeRepoId === id) renderCodeTree();
}

/* ---------- abrir uma pasta ----------
   O "+" da barra dos separadores (a mesma janela que abre os livros de Excel,
   ver workbooks.js) chama o pickCodeFolder; daqui sai-se com um separador novo
   para a pasta escolhida. */

// escrever o caminho à mão: é assim que se abre uma pasta numa aba do browser,
// onde não há diálogo do Windows nenhum
async function askCodeFolder() {
  const path = prompt(t("code_ask_path"), "");
  if (path === null || !path.trim()) return;
  const out = await codePost({ action: "add", path: path.trim() });
  if (out) openCodeTab(out.repos, out.id);
}

// a janela do Windows para escolher a pasta só existe na janela nativa da app;
// numa aba do browser cai-se logo no caminho escrito à mão
async function pickCodeFolder() {
  const out = await codePost({ action: "browse" });
  if (!out || out.cancelled) return;   // o utilizador fechou o diálogo
  if (out.unavailable) { askCodeFolder(); return; }
  openCodeTab(out.repos, out.id);
}

/* Mostra o separador da pasta escolhida. Abrir duas vezes a mesma pasta não
   cria dois separadores — o id vem do caminho (ver repo_id em repo.py), por
   isso salta-se para o que já lá está, como no openWorkbookTab. */
function openCodeTab(repos, id) {
  const jaEstava = codeRepos.some(r => r.id === id);
  setCodeRepos(repos);
  if (!id) return;
  const repo = codeRepos.find(r => r.id === id);
  showView(`code:${id}`);
  toast(tf(jaEstava ? "code_already_open" : "code_opened", (repo || {}).name || ""), "ok");
}

/* ---------- separadores das pastas abertas ----------
   Um separador por pasta, ao lado dos dos livros e com o mesmo desenho (nome,
   ⧉ e ✕) e as mesmas peças (wireTabButton em views.js, wireTabDrag em
   split.js). A ordem guardada neste browser manda depois disto, como nos
   livros — ver applyStoredTabOrder. */
function renderCodeTabs() {
  const nav = document.querySelector(".tabs");
  if (!nav) return;
  const existentes = new Map([...nav.querySelectorAll('button[data-view^="code:"]')]
    .map(b => [codeViewId(b.dataset.view), b]));
  codeRepos.forEach(repo => {
    let b = existentes.get(repo.id);
    if (b) existentes.delete(repo.id);
    else {
      b = document.createElement("button");
      b.dataset.view = `code:${repo.id}`;
      b.dataset.icon = "⌨";
      b.draggable = true;
      b.type = "button";
      // mesmo grupo dos livros (o dos documentos), depois deles — ver os
      // grupos da barra no index.html
      $("tabsDocs").appendChild(b);
      wireTabButton(b);
      wireTabDrag(b);
    }
    b.dataset.label = repo.name;
    b.title = repo.missing ? `${repo.path} — ${t("code_missing")}` : repo.path;
    b.innerHTML = `<span class="wbTabName">${esc(repo.name)}${repo.missing ? " (?)" : ""}</span>` +
      // numa janela já dedicada a esta pasta o ⧉ não tem para onde abrir (é
      // esta mesma janela outra vez), como no SOLO_WB dos livros
      (SOLO_CODE ? "" :
        `<span class="wbTabPop" data-codepop="${esc(repo.id)}" title="${esc(t("code_window"))}" ` +
        `role="button" aria-label="${esc(t("code_window"))}">⧉</span>`) +
      `<span class="wbTabClose" data-codeclose="${esc(repo.id)}" title="${esc(t("t_code_close"))}" ` +
      `role="button" aria-label="${esc(t("t_code_close"))}">✕</span>`;
  });
  // separadores de pastas que já não estão abertas
  existentes.forEach(b => b.remove());
  applyStoredTabOrder();
  markActiveCodeTab();
}

function markActiveCodeTab() {
  document.querySelectorAll('.tabs button[data-view^="code:"]').forEach(b => {
    b.classList.toggle("wbActive", codeViewId(b.dataset.view) === codeRepoId);
  });
}

// troca a pasta em foco: o painel é um só e passa a mostrar esta (o estado da
// anterior fica guardado na sua entrada de codeStates, intacto)
function setActiveCodeTab(id) {
  if (id === codeRepoId) return;
  codeRepoId = id || "";
  // numa janela dedicada a uma pasta a escolha não se grava: o localStorage é
  // o mesmo da janela principal e tirava-a de onde está (ver SOLO_WB)
  if (!SOLO_CODE) localStorage.setItem("bsp-tracker-code-repo", codeRepoId);
  markActiveCodeTab();
}

// fechar um separador = fechar a pasta na app. Nada é apagado no disco: é só
// deixar de a mostrar (ver remove_repo em cswaios/repo.py).
async function closeCodeTab(id) {
  const i = codeRepos.findIndex(r => r.id === id);
  if (i < 0 || !confirm(tf("code_confirm_close", codeRepos[i].name))) return;
  const out = await codePost({ action: "remove", id });
  if (!out) return;
  const vista = `code:${id}`;
  const estavaNoEcra = currentView === vista;
  // sair do ecrã dividido antes de o separador desaparecer (o painel ainda tem
  // de ser encontrado para voltar ao sítio)
  if (sideView === vista) exitSplit();
  setCodeRepos(out.repos);
  const seguinte = codeRepos[Math.min(i, codeRepos.length - 1)] || null;
  if (codeRepoId === id) setActiveCodeTab(seguinte ? seguinte.id : "");
  // só se muda de vista se era esta pasta que estava no ecrã: fechar um
  // separador que está atrás não tira ninguém de onde está
  if (estavaNoEcra) showView(seguinte ? `code:${seguinte.id}` : fallbackView());
  else if (codeVisible()) renderCode();
}

// ⧉ do separador (ou o botão do meio do rato): a app noutra janela já nesta
// pasta, para se ler duas pastas ao mesmo tempo (ver SOLO_CODE em state.js)
function openCodeWindow(id) {
  if (!codeRepos.some(r => r.id === id)) return;
  return openAppWindow(`/?code=${encodeURIComponent(id)}`, `myorg_code_${id}`);
}

// atalho da pesquisa (cmd_code): salta para a pasta onde se estava ou, sem
// nenhuma aberta, abre a janela do "+" para se escolher uma
function goToCode() {
  if (codeRepos.length) showView(`code:${codeRepoId || codeRepos[0].id}`);
  else setAddWorkbookOpen(true);
}

// ---------- ligações da interface ----------

if ($("codeView")) {
  $("codeFilter").addEventListener("input", e => {
    const q = e.target.value;
    const id = codeRepoId;
    codeState(id).filter = q;
    clearTimeout(codeSearchTimer);
    codeSearchTimer = setTimeout(() => runCodeSearch(id, q), 250);
  });

  $("codeTree").addEventListener("click", e => {
    const dir = e.target.closest("[data-cdir]");
    if (dir) {
      if (codeState().skip.has(dir.dataset.cdir)) { toast(t("t_code_skip")); return; }
      toggleCodeDir(dir.dataset.cdir);
      return;
    }
    const file = e.target.closest("[data-cfile]");
    if (file) openCodeFile(file.dataset.cfile);
  });

  $("codeFileHead").addEventListener("click", e => {
    const st = codeState();
    if (e.target.closest("#codeCopyBtn")) {
      if (st.data && !st.data.binary) copyToClipboard(st.data.text);
      return;
    }
    if (e.target.closest("#codeReloadBtn") && st.file) openCodeFile(st.file);
  });
}

// A árvore da raiz de cada pasta só se lê quando o separador dela abre pela
// primeira vez (não vale a pena andar no disco de quem nunca cá vem).
async function renderCodePage() {
  if (!codeRepos.length) await loadRepos();
  const id = codeRepoId;
  const st = id ? codeState(id) : null;
  if (st && !st.seeded) {
    st.seeded = true;
    await codeDir(id, "");
    // volta ao ficheiro onde se estava da última vez nesta pasta (guardado no
    // openCodeFile), se o separador ainda for este
    const path = localStorage.getItem(codeFileKey(id)) || "";
    if (path && !st.file && codeRepoId === id) openCodeFile(path);
  }
  if (codeVisible()) renderCode();
}
