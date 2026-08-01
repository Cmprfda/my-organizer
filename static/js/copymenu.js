// My Organizer — menu do botão direito: copiar o que está no ecrã

// Partes decorativas e controlos que nunca entram no texto copiado
const COPY_STRIP = ".editActions, .srcBtn, .ccr-x, .noteBoxBar, .noteBoxSize, " +
  ".todoSubProgress, .addnote, .todoActionCell, .todoPrioGlyph, .todoRowFlag, " +
  ".todoCardFlag, .copyMenu";

// Blocos que se copiam por inteiro (linha da tabela, cartão, caixa de nota)
const COPY_ITEMS = "#tbody tr, #ccrBody tr, #todoBody tr, .todoCard, .noteBox, " +
  ".jiraCard, .jiraCardTask, .notifyCard, #itemBody";

let copyMenuEl = null;

// ---------- texto do que está debaixo do rato ----------

// Percorre o DOM vivo (innerText num clone destacado devolveria tudo numa linha)
// e devolve o texto útil: campos pelo valor, botões-símbolo fora.
function copyNodeText(node) {
  if (node.nodeType === 3) return node.nodeValue;
  if (node.nodeType !== 1) return "";
  if (node.matches(COPY_STRIP)) return "";
  const tag = node.tagName;
  if (tag === "INPUT") return /^(checkbox|radio|button|submit)$/.test(node.type) ? "" : node.value || "";
  if (tag === "TEXTAREA") return node.value || "";
  if (tag === "SELECT" || /^(img|svg|canvas)$/i.test(tag)) return "";
  if (tag === "BR") return "\n";
  if (tag === "BUTTON" && node.textContent.trim().length <= 2) return "";
  let out = "";
  node.childNodes.forEach(n => { out += copyNodeText(n); });
  const disp = getComputedStyle(node).display;
  if (disp && disp !== "contents" && !disp.startsWith("inline")) out = `\n${out}\n`;
  return out;
}

function copyTextOf(node) {
  if (node.tagName === "TEXTAREA") return (node.value || "").trim();
  const lines = copyNodeText(node)
    .split("\n")
    .map(l => l.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter((l, i, all) => l || (i > 0 && all[i - 1]));   // no máximo uma linha vazia seguida
  return lines.join("\n").trim();
}

// Linha de tabela: uma linha de texto por célula, com o nome da coluna à frente
function copyRowText(el) {
  if (el.tagName !== "TR") return copyTextOf(el);
  const ths = [...(el.closest("table") || el).querySelectorAll("thead th")];
  const out = [];
  [...el.cells].forEach(td => {
    const txt = copyTextOf(td);
    if (!txt) return;
    const th = ths[td.cellIndex];
    const label = td.dataset.label || (th ? th.textContent.trim() : "");
    out.push(label ? `${label}: ${txt}` : txt);
  });
  return out.join("\n");
}

// ---------- área de transferência ----------

async function copyToClipboard(txt) {
  if (!txt) return;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(txt);
      toast(t("copy_ok"), "ok");
      return;
    }
  } catch (err) { /* sem permissão: segue para o método antigo */ }
  const ta = document.createElement("textarea");
  ta.value = txt;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
  ta.remove();
  toast(ok ? t("copy_ok") : t("copy_err"), ok ? "ok" : "err");
}

function pngBlob(img) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("png"))), "image/png");
  });
}

async function copyImage(img) {
  try {
    if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write)
      throw new Error("clipboard");
    const res = await fetch(img.src);
    let blob = await res.blob();
    // o Windows só aceita PNG na área de transferência
    if (blob.type !== "image/png") blob = await pngBlob(img);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast(t("copy_ok"), "ok");
  } catch (err) {
    copyToClipboard(img.src);   // pelo menos fica o endereço da imagem
  }
}

// ---------- menu ----------

function copyMenuOptions(e) {
  const opts = [];
  const sel = String(window.getSelection() || "").trim();
  if (sel) opts.push({ label: t("copy_sel"), run: () => copyToClipboard(sel) });
  const img = e.target.closest("img");
  if (img && img.getAttribute("src")) opts.push({ label: t("copy_img"), run: () => copyImage(img) });
  const cell = e.target.closest("td, th");
  if (cell) {
    const txt = copyTextOf(cell);
    if (txt) opts.push({ label: t("copy_cell"), run: () => copyToClipboard(txt) });
  }
  const item = e.target.closest(COPY_ITEMS);
  if (item) {
    const txt = copyRowText(item);
    if (txt) opts.push({ label: t(item.tagName === "TR" ? "copy_row" : "copy_item"), run: () => copyToClipboard(txt) });
  }
  return opts;
}

function closeCopyMenu() {
  if (!copyMenuEl) return;
  copyMenuEl.remove();
  copyMenuEl = null;
}

function openCopyMenu(x, y, opts) {
  closeCopyMenu();
  const menu = document.createElement("div");
  menu.className = "copyMenu";
  opts.forEach(o => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = o.label;
    btn.addEventListener("click", () => { closeCopyMenu(); o.run(); });
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  const box = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - box.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - box.height - 4))}px`;
  copyMenuEl = menu;
}

document.addEventListener("contextmenu", e => {
  closeCopyMenu();
  if (e.defaultPrevented) return;                                    // estado/prioridade do TODO
  if (e.target.closest("input, textarea, [contenteditable]")) return;  // menu do sistema (colar)
  const opts = copyMenuOptions(e);
  if (!opts.length) return;
  e.preventDefault();
  openCopyMenu(e.clientX, e.clientY, opts);
});

document.addEventListener("mousedown", e => {
  if (copyMenuEl && !e.target.closest(".copyMenu")) closeCopyMenu();
}, true);
document.addEventListener("scroll", closeCopyMenu, true);
window.addEventListener("resize", closeCopyMenu);

// Em captura: com o menu aberto o Esc só o fecha (não sai do ecrã dividido)
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || !copyMenuEl) return;
  e.stopImmediatePropagation();
  closeCopyMenu();
}, true);
