// My Organizer — vista "Código": abrir uma pasta do disco (um repositório, a
// pasta dos scripts) e ler o que lá está sem sair da app.
//
// É só leitura: a app mostra a árvore e o texto dos ficheiros, não grava nada
// por cima deles (ver cswaios/repo.py). Os ficheiros vivem no PC onde a app
// corre, por isso o servidor só responde a estes pedidos a partir daí — quem
// abre a app pelo telemóvel ou por outro PC da rede vê a vista a dizer isso.

let codeRepos = [];
let codeLocal = true;               // este cliente é o PC onde a app corre
let codeRepoId = localStorage.getItem("bsp-tracker-code-repo") || "";
let codeFile = "";                  // ficheiro aberto (caminho relativo à raiz)
let codeFileData = null;            // resposta do servidor para esse ficheiro
const codeOpenDirs = new Set();     // pastas abertas na árvore
const codeDirCache = new Map();     // "pasta" -> entradas já lidas
const codeSkipDirs = new Set();     // pastas que não se abrem (.git, node_modules…)
let codeHits = null;                // resultado da procura por nome (null = árvore)
let codeSearchTimer = null;

const codeVisible = () => currentView === "code" || sideView === "code";
const codeRepo = () => codeRepos.find(r => r.id === codeRepoId) || null;

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

async function loadRepos() {
  try {
    const res = await fetch("/api/repos");
    const out = await res.json();
    codeRepos = out.repos || [];
    codeLocal = out.local !== false;
  } catch (err) {
    return;
  }
  if (!codeRepo()) codeRepoId = (codeRepos[0] || {}).id || "";
  renderCode();
}

function setCodeRepos(repos, pick) {
  codeRepos = repos || [];
  codeDirCache.clear();
  codeOpenDirs.clear();
  codeSkipDirs.clear();
  codeHits = null;
  if (pick) codeRepoId = pick;
  if (!codeRepo()) codeRepoId = (codeRepos[0] || {}).id || "";
  localStorage.setItem("bsp-tracker-code-repo", codeRepoId);
  codeFile = "";
  codeFileData = null;
  renderCode();
  // a raiz da pasta nova ainda não está lida: sem isto a árvore ficava vazia
  // até se sair da vista e voltar
  if (codeRepoId) codeDir("").then(renderCode);
}

// ---------- árvore ----------

async function codeDir(path) {
  if (codeDirCache.has(path)) return codeDirCache.get(path);
  const out = await codePost({ action: "list", id: codeRepoId, path });
  const entries = out ? out.entries : [];
  entries.forEach(e => { if (e.dir && e.skip) codeSkipDirs.add(e.path); });
  codeDirCache.set(path, entries);
  return entries;
}

async function toggleCodeDir(path) {
  if (codeOpenDirs.has(path)) codeOpenDirs.delete(path);
  else {
    codeOpenDirs.add(path);
    await codeDir(path);
  }
  renderCodeTree();
}

const codeIcon = e => (e.dir ? (codeOpenDirs.has(e.path) ? "▾" : "▸") : "");

function codeTreeHtml(path, depth) {
  const entries = codeDirCache.get(path) || [];
  let html = "";
  for (const e of entries) {
    const pad = 6 + depth * 12;
    if (e.dir) {
      // node_modules, .git e companhia continuam à vista (para se saber que
      // existem) mas não se abrem: encher a árvore com elas não serve a ninguém
      html += `<div class="codeRow codeDirRow${e.skip ? " skip" : ""}" data-cdir="${esc(e.path)}"
        style="padding-left:${pad}px" title="${esc(e.skip ? t("t_code_skip") : e.path)}">
        <span class="codeCaret">${e.skip ? "·" : codeIcon(e)}</span>
        <span class="codeName">${esc(e.name)}</span>
      </div>`;
      if (!e.skip && codeOpenDirs.has(e.path)) html += codeTreeHtml(e.path, depth + 1);
      continue;
    }
    html += `<div class="codeRow codeFileRow${e.path === codeFile ? " active" : ""}"
      data-cfile="${esc(e.path)}" style="padding-left:${pad + 14}px" title="${esc(e.path)}">
      <span class="codeName">${esc(e.name)}</span>
      <span class="codeSize">${esc(codeSizeLabel(e.size))}</span>
    </div>`;
  }
  return html;
}

function codeHitsHtml() {
  if (!codeHits.hits.length) return `<div class="codeTreeEmpty">${esc(t("code_no_hits"))}</div>`;
  const rows = codeHits.hits.map(h => {
    const dir = h.path.slice(0, h.path.length - h.name.length).replace(/\/$/, "");
    return `<div class="codeRow codeFileRow${h.path === codeFile ? " active" : ""}"
      data-cfile="${esc(h.path)}" title="${esc(h.path)}">
      <span class="codeName">${esc(h.name)}</span>
      <span class="codeHitDir">${esc(dir)}</span>
    </div>`;
  }).join("");
  const more = codeHits.partial ? `<div class="codeTreeEmpty">${esc(t("code_hits_partial"))}</div>` : "";
  return rows + more;
}

function renderCodeTree() {
  const box = $("codeTree");
  if (!box) return;
  if (!codeRepo()) { box.innerHTML = ""; return; }
  if (codeRepo().missing) {
    box.innerHTML = `<div class="codeTreeEmpty">${esc(t("code_missing"))}</div>`;
    return;
  }
  box.innerHTML = codeHits ? codeHitsHtml() : codeTreeHtml("", 0);
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
  if (!codeRepoId || !path) return;
  codeFile = path;
  codeFileData = null;
  renderCodeTree();
  renderCodeFile();
  const out = await codePost({ action: "read", id: codeRepoId, path });
  if (!out || codeFile !== path) return;   // já se abriu outro entretanto
  codeFileData = out;
  localStorage.setItem("bsp-tracker-code-file", `${codeRepoId}|${path}`);
  renderCodeFile();
}

function renderCodeFile() {
  const head = $("codeFileHead");
  const body = $("codeFileBody");
  if (!head || !body) return;
  if (!codeFile) {
    head.innerHTML = "";
    body.innerHTML = `<div class="codeHint">${esc(t("code_pick_file"))}</div>`;
    return;
  }
  const d = codeFileData;
  const bits = [];
  if (d && !d.binary) bits.push(`${d.text.split("\n").length} ${t("code_lines")}`);
  if (d) bits.push(codeSizeLabel(d.size));
  head.innerHTML = `<span class="codePath">${esc(codeFile)}</span>` +
    `<span class="codeMeta">${esc(bits.filter(Boolean).join(" · "))}</span>` +
    `<button type="button" class="linkBtn" id="codeCopyBtn">${esc(t("code_copy"))}</button>` +
    `<button type="button" class="linkBtn" id="codeReloadBtn">${esc(t("code_reload"))}</button>`;
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

function renderCodeRepos() {
  const sel = $("codeRepoSel");
  if (!sel) return;
  sel.innerHTML = codeRepos.map(r =>
    `<option value="${esc(r.id)}"${r.id === codeRepoId ? " selected" : ""}>` +
    `${esc(r.name)}${r.missing ? " (?)" : ""}</option>`).join("");
  sel.classList.toggle("hidden", !codeRepos.length);
  $("codeCloseBtn").classList.toggle("hidden", !codeRepos.length);
  const repo = codeRepo();
  sel.title = repo ? repo.path : "";
}

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
  renderCodeRepos();
  const has = !!codeRepo();
  $("codeEmpty").classList.toggle("hidden", has || !codeLocal);
  $("codeRemote").classList.toggle("hidden", codeLocal);
  $("codeLayout").classList.toggle("hidden", !has || !codeLocal);
  if (!has || !codeLocal) {
    // sem pasta aberta o painel fica escondido: limpar o que lá estava evita
    // que a árvore antiga reapareça ao abrir a pasta seguinte
    $("codeTree").innerHTML = "";
    $("codeFileHead").innerHTML = "";
    $("codeFileBody").innerHTML = "";
    return;
  }
  fitCodeLayout();
  renderCodeTree();
  renderCodeFile();
}

// ---------- procurar um ficheiro pelo nome ----------

async function runCodeSearch(q) {
  if (!codeRepoId) return;
  if (q.trim().length < 2) { codeHits = null; renderCodeTree(); return; }
  const out = await codePost({ action: "search", id: codeRepoId, query: q });
  if (!out) return;
  codeHits = { hits: out.hits || [], partial: !!out.partial };
  renderCodeTree();
}

// ---------- ligações da interface ----------

if ($("codeView")) {
  // escrever o caminho à mão: é assim que se abre uma pasta numa aba do
  // browser, onde não há diálogo do Windows nenhum
  async function askCodeFolder() {
    const path = prompt(t("code_ask_path"), "");
    if (path === null || !path.trim()) return;
    const out = await codePost({ action: "add", path: path.trim() });
    if (out) setCodeRepos(out.repos, out.id);
  }

  // a janela do Windows para escolher a pasta só existe na janela nativa da
  // app; numa aba do browser cai-se logo no caminho escrito à mão
  async function pickCodeFolder() {
    const out = await codePost({ action: "browse" });
    if (!out || out.cancelled) return;
    if (out.unavailable) { askCodeFolder(); return; }
    setCodeRepos(out.repos, out.id);
  }

  $("codeAddBtn").addEventListener("click", pickCodeFolder);
  $("codeEmptyAdd").addEventListener("click", pickCodeFolder);
  $("codePathBtn").addEventListener("click", askCodeFolder);

  $("codeCloseBtn").addEventListener("click", async () => {
    const repo = codeRepo();
    if (!repo || !confirm(tf("code_confirm_close", repo.name))) return;
    const out = await codePost({ action: "remove", id: repo.id });
    if (out) setCodeRepos(out.repos, "");
  });

  $("codeRepoSel").addEventListener("change", e => {
    codeRepoId = e.target.value;
    localStorage.setItem("bsp-tracker-code-repo", codeRepoId);
    codeDirCache.clear();
    codeOpenDirs.clear();
    codeSkipDirs.clear();
    codeHits = null;
    codeFile = "";
    codeFileData = null;
    $("codeFilter").value = "";
    codeDir("").then(renderCode);
  });

  $("codeFilter").addEventListener("input", e => {
    const q = e.target.value;
    clearTimeout(codeSearchTimer);
    codeSearchTimer = setTimeout(() => runCodeSearch(q), 250);
  });

  $("codeTree").addEventListener("click", e => {
    const dir = e.target.closest("[data-cdir]");
    if (dir) {
      if (codeSkipDirs.has(dir.dataset.cdir)) { toast(t("t_code_skip")); return; }
      toggleCodeDir(dir.dataset.cdir);
      return;
    }
    const file = e.target.closest("[data-cfile]");
    if (file) openCodeFile(file.dataset.cfile);
  });

  $("codeFileHead").addEventListener("click", e => {
    if (e.target.closest("#codeCopyBtn")) {
      if (codeFileData && !codeFileData.binary) copyToClipboard(codeFileData.text);
      return;
    }
    if (e.target.closest("#codeReloadBtn") && codeFile) openCodeFile(codeFile);
  });
}

// a árvore da raiz só se lê quando a vista abre pela primeira vez (não vale a
// pena andar no disco de quem nunca cá vem)
let codeTreeSeeded = false;

async function renderCodePage() {
  const primeiraVez = !codeTreeSeeded;
  if (!codeRepos.length && primeiraVez) await loadRepos();
  if (codeRepoId && !codeDirCache.has("")) await codeDir("");
  codeTreeSeeded = true;
  renderCode();
  // volta ao ficheiro onde se estava da última vez (guardado no openCodeFile)
  if (!primeiraVez || codeFile || !codeRepoId) return;
  const [repo, path] = String(localStorage.getItem("bsp-tracker-code-file") || "").split("|");
  if (repo === codeRepoId && path) openCodeFile(path);
}
