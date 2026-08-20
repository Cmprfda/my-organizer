// My Organizer — notas: trazer conteúdo formatado de fora (OneNote, Word,
// Teams, browser) e levá-lo para fora com a formatação intacta.
//
// O texto de uma caixa continua a ser texto simples com marcadores
// (**negrito**, ~~riscado~~, "| a | b |", "-> árvore") — ver notes.js. Este
// ficheiro faz as duas traduções nas fronteiras da app:
//
//   HTML da área de transferência  ->  texto com marcadores   (noteHtmlToMarks)
//   texto com marcadores           ->  HTML com estilos       (noteMarksToHtml)
//
// e ainda a imagem da caixa/quadro (noteBoxPng / noteBoardPng), porque há
// destinos — o Paint é o caso — que só aceitam uma imagem.

// ---------- HTML colado -> texto com marcadores ----------

// tudo o que não é texto nem formatação: nunca entra
const NC_SKIP = new Set(["SCRIPT", "STYLE", "HEAD", "META", "LINK", "TITLE",
  "NOSCRIPT", "SVG", "CANVAS", "IMG", "OBJECT", "IFRAME", "BUTTON", "INPUT",
  "SELECT", "TEXTAREA"]);
// elementos que ocupam a sua própria linha
const NC_BLOCK = new Set(["P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6",
  "BLOCKQUOTE", "SECTION", "ARTICLE", "HEADER", "FOOTER", "MAIN", "ASIDE",
  "FIGURE", "FIGCAPTION", "DT", "DD", "ADDRESS", "FORM", "HR", "TR"]);
const NC_BOLD_TAGS = new Set(["B", "STRONG", "TH"]);
const NC_STRIKE_TAGS = new Set(["S", "DEL", "STRIKE"]);

// o OneNote e o Word não usam <b>/<s>: mandam o estilo no próprio elemento
function ncStyleBold(el) {
  const w = (el.style && el.style.fontWeight) || "";
  return w === "bold" || w === "bolder" || (/^\d+$/.test(w) && Number(w) >= 600);
}

function ncStyleStrike(el) {
  const d = ((el.style && (el.style.textDecorationLine || el.style.textDecoration)) || "");
  return d.includes("line-through");
}

// o texto de um nó de texto vindo de HTML: as mudanças de linha e as
// tabulações da fonte são espaço, e os espaços seguidos contam por um só
function ncCleanText(s) {
  return String(s).replace(/\u00a0/g, " ").replace(/\s+/g, " ");
}

function ncOut() {
  return { lines: [], cur: "" };
}

function ncFlush(o) {
  o.lines.push(o.cur);
  o.cur = "";
}

// só se muda de linha quando há algo escrito: dois <p> seguidos dão duas
// linhas, não três (um <p> vazio não deixa linha em branco)
function ncBreak(o) {
  if (o.cur.trim()) ncFlush(o);
  else o.cur = "";
}

function ncWrite(o, s) {
  if (!s) return;
  // espaço no princípio da linha (ou a seguir a outro) não conta
  if (/^\s/.test(s) && (!o.cur || /\s$/.test(o.cur))) s = s.replace(/^\s+/, "");
  o.cur += s;
}

// o conteúdo de um elemento em linha, com os marcadores do lado de fora dos
// espaços: "** negrito **" ficaria com os espaços dentro do negrito
function ncMark(o, mark, node, st) {
  const lineAt = o.lines.length;
  const from = o.cur.length;
  ncWalkKids(node, o, st);
  // mudou de linha lá dentro (uma tabela, uma lista): o par de marcadores
  // ficaria aberto numa linha e fechado noutra — melhor não os pôr
  if (o.lines.length !== lineAt) return;
  const body = o.cur.slice(from);
  const inner = body.trim();
  if (!inner) return;
  const lead = body.slice(0, body.length - body.trimStart().length);
  const trail = body.slice(body.trimEnd().length);
  o.cur = o.cur.slice(0, from) + lead + mark + inner + mark + trail;
}

function ncWalkKids(node, o, st) {
  node.childNodes.forEach(child => ncWalk(child, o, st));
}

function ncWalk(node, o, st) {
  if (node.nodeType === 3) {
    ncWrite(o, st.pre ? String(node.nodeValue).replace(/\u00a0/g, " ") : ncCleanText(node.nodeValue));
    return;
  }
  if (node.nodeType !== 1) return;
  const tag = node.tagName;
  if (NC_SKIP.has(tag)) return;
  if (tag === "BR") { ncFlush(o); return; }
  if (tag === "TABLE") { ncTableLines(node, o, st); return; }
  if (tag === "PRE") {
    ncBreak(o);
    const kids = ncOut();
    ncWalkKids(node, kids, { ...st, pre: true });
    if (kids.cur) ncFlush(kids);
    // o texto de um <pre> traz as suas próprias mudanças de linha
    kids.lines.join("\n").split("\n").forEach((l, i) => {
      if (i) ncFlush(o);
      ncWrite(o, l);
    });
    ncBreak(o);
    return;
  }
  if (tag === "UL" || tag === "OL") {
    ncBreak(o);
    ncWalkKids(node, o, { ...st, level: st.level + 1 });
    return;
  }
  if (tag === "LI") {
    ncBreak(o);
    // a convenção de árvore desta app: "-> raiz", "   |-> filho" (ver notes.js).
    // Vai direto para a linha, sem passar pelo ncWrite: os espaços de
    // indentação são precisamente o que ele corta no princípio de uma linha.
    o.cur += noteOutlineBuild(Math.max(0, st.level), "");
    ncWalkKids(node, o, { ...st, level: st.level });
    ncBreak(o);
    return;
  }
  if (NC_BOLD_TAGS.has(tag) || ncStyleBold(node)) { ncMark(o, NOTE_BOLD, node, st); return; }
  if (NC_STRIKE_TAGS.has(tag) || ncStyleStrike(node)) { ncMark(o, NOTE_STRIKE, node, st); return; }
  if (NC_BLOCK.has(tag)) {
    ncBreak(o);
    ncWalkKids(node, o, st);
    ncBreak(o);
    return;
  }
  ncWalkKids(node, o, st);
}

// o texto de uma célula numa linha só: dentro de uma tabela desta app não pode
// haver "|" (partia a célula em duas) nem mudanças de linha
function ncCellText(cell, st) {
  const o = ncOut();
  ncWalkKids(cell, o, { ...st, level: -1 });
  if (o.cur) ncFlush(o);
  return o.lines.map(l => l.trim()).filter(Boolean).join(" ").replace(/\|/g, "/").trim();
}

// a tabela colada passa a "| a | b |" com a linha de separação que a app precisa
function ncTableLines(table, o, st) {
  const rows = [...table.querySelectorAll("tr")];
  const grid = rows.map(tr => [...tr.children]
    .filter(c => /^(TD|TH)$/.test(c.tagName))
    .map(c => ncCellText(c, st)));
  const body = grid.filter(r => r.length);
  if (!body.length) return;
  const cols = Math.max(...body.map(r => r.length));
  const line = cells => `| ${Array.from({ length: cols }, (_, i) => cells[i] || "").join(" | ")} |`;
  ncBreak(o);
  ncWrite(o, line(body[0]));
  ncFlush(o);
  ncWrite(o, `| ${Array.from({ length: cols }, () => "---").join(" | ")} |`);
  ncFlush(o);
  body.slice(1).forEach(r => { ncWrite(o, line(r)); ncFlush(o); });
  // uma linha em branco no fim: sem ela, duas tabelas seguidas juntavam-se
  ncWrite(o, "");
  ncFlush(o);
}

// HTML da área de transferência -> texto com marcadores. Devolve "" quando não
// há nada aproveitável (aí quem chama fica-se pelo text/plain).
function noteHtmlToMarks(html) {
  let doc = null;
  try {
    doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  } catch (err) {
    return "";
  }
  if (!doc || !doc.body) return "";
  const o = ncOut();
  ncWalkKids(doc.body, o, { level: -1, pre: false });
  if (o.cur) ncFlush(o);
  return o.lines.join("\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------- texto com marcadores -> HTML com estilos ----------
// Os destinos de fora (Teams, OneNote, Outlook, Word) ignoram folhas de estilo:
// o que sobrevive é o estilo escrito em cada elemento.

const NC_FONT = "Segoe UI, Calibri, Arial, sans-serif";
const NC_CELL = "border:1px solid #9aa0a6;padding:3px 7px;vertical-align:top";

function ncInlineHtml(text) {
  // o mesmo negrito/riscado da vista da caixa (noteRichInline, notes.js): o
  // marcador sem par fica texto, tal e qual como no ecrã
  const out = { html: "", map: [] };
  noteRichInline(String(text || ""), 0, out);
  return out.html;
}

function ncAlignStyle(align) {
  return align ? `;text-align:${align}` : "";
}

function ncTableHtml(table) {
  const cols = noteTableCells(table.head).length;
  const row = (line, tag, extra) => {
    const cells = noteTableCells(line);
    let html = "<tr>";
    for (let c = 0; c < cols; c++) {
      const cell = cells[c];
      html += `<${tag} style="${NC_CELL}${ncAlignStyle(table.aligns[c])}${extra}">` +
        `${cell ? ncInlineHtml(cell.text) : ""}</${tag}>`;
    }
    return `${html}</tr>`;
  };
  return `<table style="border-collapse:collapse;font-family:${NC_FONT};font-size:13px">` +
    `<thead>${row(table.head, "th", ";background:#f1f3f4;font-weight:600")}</thead>` +
    (table.body.length ? `<tbody>${table.body.map(l => row(l, "td", "")).join("")}</tbody>` : "") +
    `</table>`;
}

// HTML de um texto de caixa, pronto para a área de transferência — e também
// para o <foreignObject> da imagem, que é lido como XML: daí o <br/> fechado e
// o &#160; em vez do &nbsp; (entidade que o XML não conhece e que fazia a
// imagem não carregar de todo)
const NC_MONO_FONT = 'Consolas, "Cascadia Mono", "Courier New", monospace';

// o bloco de código para quem cola texto formatado: <pre> com uma fonte de
// largura fixa e um fundo, que é como o Teams, o Outlook e o OneNote o mostram.
// Sem os marcadores por dentro — ali é código, não texto com negrito.
function ncCodeHtml(block) {
  const corpo = block.body.map(l => esc(l.text) || "&#160;").join("<br/>");
  return `<pre style="font-family:${NC_MONO_FONT};font-size:12.5px;line-height:1.45;` +
    `background:#f4f4f6;border:1px solid #dcdce0;border-radius:6px;` +
    `padding:8px 10px;margin:6px 0;white-space:pre-wrap">${corpo}</pre>`;
}

function noteMarksToHtml(text) {
  const lines = noteTextLines(String(text || ""));
  let html = "";
  let para = [];
  const flushPara = () => {
    if (!para.length) return;
    html += `<div style="font-family:${NC_FONT};font-size:13px;line-height:1.45">${para.join("<br/>")}</div>`;
    para = [];
  };
  let i = 0;
  while (i < lines.length) {
    const code = noteCodeBlock(lines, i);
    if (code) {
      flushPara();
      html += ncCodeHtml(code);
      i += code.count;
      continue;
    }
    const table = noteTableBlock(lines, i);
    if (table) {
      flushPara();
      html += ncTableHtml(table);
      i += table.count;
      continue;
    }
    para.push(ncInlineHtml(lines[i].text) || "&#160;");
    i += 1;
  }
  flushPara();
  return html;
}

// ---------- imagem (para o Paint e companhia) ----------
// A imagem é desenhada à mão numa tela (Canvas 2D), não a partir de um SVG:
// no Chromium/Edge, um SVG com <foreignObject> SUJA a tela e o toBlob deixa de
// funcionar ("Tainted canvases may not be exported"), que é precisamente o
// passo de que precisamos para pôr o PNG na área de transferência.

const NC_CANVAS_FONT = '"Segoe UI", Calibri, Arial, sans-serif';
const NC_TEXT_SIZE = 13;
const NC_LINE_H = 19;
// o bloco de código é desenhado com uma fonte de largura fixa e linhas mais
// juntas, como se lê um ficheiro
const NC_CODE_FONT = 'Consolas, "Cascadia Mono", "Courier New", monospace';
const NC_CODE_SIZE = 12;
const NC_CODE_LINE_H = 16;
const NC_CODE_PAD = 7;
const NC_BOX_PAD = 10;
const NC_CELL_PAD = 6;

function ncFont(bold) {
  return `${bold ? "600 " : ""}${NC_TEXT_SIZE}px ${NC_CANVAS_FONT}`;
}

// a cor que o ecrã está mesmo a usar para uma caixa (tema claro/escuro, cor
// escolhida na caixa): lê-se do próprio elemento, que é quem já a tem resolvida
function ncBoxSkin(id) {
  const canvas = $("noteCanvas");
  const el = canvas ? canvas.querySelector(`[data-bid="${CSS.escape(id)}"]`) : null;
  const fallback = { bg: "#fffbe6", border: "#e0c86a", color: "#202124" };
  if (!el) return fallback;
  const cs = getComputedStyle(el);
  const view = el.querySelector(".noteBoxTextView");
  // uma caixa selecionada tem a moldura da cor de destaque: isso é o ecrã a
  // dizer o que está escolhido, não faz parte da nota que se copia
  const border = el.classList.contains("sel")
    ? getComputedStyle(document.documentElement).getPropertyValue("--border").trim()
    : cs.borderTopColor;
  return {
    bg: cs.backgroundColor || fallback.bg,
    border: border || fallback.border,
    color: (view ? getComputedStyle(view).color : cs.color) || fallback.color,
  };
}

// a cor de um traço/forma/ligação, pela mesma via: do elemento que está no ecrã
function ncDrawColor(attr, id) {
  for (const layerId of ["noteDrawLayer", "noteDrawTop"]) {
    const layer = $(layerId);
    const el = layer && layer.querySelector(`[${attr}="${CSS.escape(id)}"]`);
    if (el) {
      const stroke = getComputedStyle(el).stroke;
      if (stroke && stroke !== "none") return stroke;
    }
  }
  return getComputedStyle(document.body).color || "#202124";
}

function ncPageBg() {
  const cs = getComputedStyle(document.body);
  return cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)"
    ? cs.backgroundColor : "#ffffff";
}

// ---------- o texto de uma caixa na tela ----------

// a linha partida nos pedaços que os marcadores definem
function ncRuns(text) {
  const out = [];
  const open = { [NOTE_BOLD]: false, [NOTE_STRIKE]: false };
  let cur = "";
  const push = () => {
    if (!cur) return;
    out.push({ text: cur, bold: open[NOTE_BOLD], strike: open[NOTE_STRIKE] });
    cur = "";
  };
  let i = 0;
  while (i < text.length) {
    const mark = text.startsWith(NOTE_BOLD, i) ? NOTE_BOLD
      : text.startsWith(NOTE_STRIKE, i) ? NOTE_STRIKE : "";
    // um marcador sem par é texto, como na vista da caixa
    if (mark && (open[mark] || text.indexOf(mark, i + mark.length) >= 0)) {
      push();
      open[mark] = !open[mark];
      i += mark.length;
      continue;
    }
    cur += text[i];
    i += 1;
  }
  push();
  return out;
}

// os pedaços de uma linha arrumados em linhas que cabem em `maxW`
function ncWrap(ctx, runs, maxW) {
  const lines = [[]];
  let w = 0;
  for (const run of runs) {
    ctx.font = ncFont(run.bold);
    for (const word of run.text.split(/(\s+)/)) {
      if (!word) continue;
      const ww = ctx.measureText(word).width;
      if (w + ww > maxW && w > 0) {
        if (/^\s+$/.test(word)) continue;   // o espaço não passa para a linha nova
        lines.push([]);
        w = 0;
      }
      lines[lines.length - 1].push({ ...run, text: word, w: ww });
      w += ww;
    }
  }
  return lines;
}

function ncPaintLine(ctx, pieces, x, y, color) {
  let cx = x;
  for (const piece of pieces) {
    ctx.font = ncFont(piece.bold);
    ctx.fillStyle = color;
    ctx.fillText(piece.text, cx, y);
    if (piece.strike) {
      ctx.fillRect(cx, Math.round(y - NC_TEXT_SIZE * 0.28), piece.w, 1);
    }
    cx += piece.w;
  }
}

// a tabela desenhada: as colunas ficam com a largura do seu conteúdo, sem
// passarem da caixa
function ncPaintTable(ctx, table, x, y, maxW, color) {
  const rows = [table.head, ...table.body].map(line =>
    noteTableCells(line).map(cell => ncRuns(cell.text)));
  const cols = noteTableCells(table.head).length;
  const widths = [];
  for (let c = 0; c < cols; c++) {
    let w = 0;
    rows.forEach(row => {
      const runs = row[c] || [];
      let rw = 0;
      runs.forEach(r => { ctx.font = ncFont(r.bold); rw += ctx.measureText(r.text).width; });
      w = Math.max(w, rw);
    });
    widths.push(w + NC_CELL_PAD * 2);
  }
  const total = widths.reduce((a, b) => a + b, 0);
  if (total > maxW) {
    const k = maxW / total;
    for (let c = 0; c < cols; c++) widths[c] = Math.floor(widths[c] * k);
  }
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  let ty = y;
  rows.forEach((row, r) => {
    let tx = x;
    for (let c = 0; c < cols; c++) {
      ctx.strokeRect(tx + 0.5, ty + 0.5, widths[c], NC_LINE_H);
      ctx.save();
      ctx.beginPath();
      ctx.rect(tx, ty, widths[c], NC_LINE_H);
      ctx.clip();
      ctx.globalAlpha = 1;
      // o cabeçalho é sempre a negrito, como na vista
      const runs = (row[c] || []).map(p => ({ ...p, bold: p.bold || r === 0 }));
      const pieces = runs.map(p => {
        ctx.font = ncFont(p.bold);
        return { ...p, w: ctx.measureText(p.text).width };
      });
      ncPaintLine(ctx, pieces, tx + NC_CELL_PAD, ty + NC_LINE_H - 6, color);
      ctx.restore();
      ctx.globalAlpha = 0.35;
      tx += widths[c];
    }
    ty += NC_LINE_H;
  });
  ctx.globalAlpha = 1;
  return ty - y;
}

// o texto com marcadores desenhado dentro de um retângulo (o que não couber
// fica de fora, tal como na caixa no ecrã)
// o bloco de código na tela: fundo, moldura e uma fonte de largura fixa. Sem
// dobrar as linhas — código dobrado deixa de se ler; o que não cabe fica de
// fora, que é o mesmo que a caixa faz no ecrã.
function ncPaintCode(ctx, block, x, y, maxW, color) {
  const linhas = block.body.map(l => l.text);
  const alturaTexto = Math.max(1, linhas.length) * NC_CODE_LINE_H;
  const alto = alturaTexto + 2 * NC_CODE_PAD;
  ctx.save();
  ctx.fillStyle = ncMix(color, 0.08);
  ctx.strokeStyle = ncMix(color, 0.22);
  ctx.beginPath();
  ctx.rect(x + 0.5, y + 0.5, maxW - 1, alto - 1);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(x, y, maxW, alto);
  ctx.clip();
  ctx.font = `${NC_CODE_SIZE}px ${NC_CODE_FONT}`;
  ctx.fillStyle = color;
  linhas.forEach((linha, n) => {
    ctx.fillText(linha, x + NC_CODE_PAD,
                 y + NC_CODE_PAD + (n + 1) * NC_CODE_LINE_H - 4);
  });
  ctx.restore();
  return alto + 4;
}

// a cor do fundo do bloco: a cor do texto com pouca opacidade, para funcionar
// no tema claro e no escuro sem ter de saber em qual deles estamos
function ncMix(color, alpha) {
  const m = /^rgba?\(([^)]+)\)/.exec(String(color || ""));
  if (!m) return `rgba(128,128,128,${alpha})`;
  const [r, g, b] = m[1].split(",").map(v => parseFloat(v) || 0);
  return `rgba(${r},${g},${b},${alpha})`;
}

function ncPaintText(ctx, text, x, y, w, h, color) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.textBaseline = "alphabetic";
  const lines = noteTextLines(String(text || ""));
  let cy = y + NC_LINE_H - 5;
  let i = 0;
  while (i < lines.length && cy < y + h + NC_LINE_H) {
    const code = noteCodeBlock(lines, i);
    if (code) {
      cy += ncPaintCode(ctx, code, x, cy - NC_LINE_H + 5, w, color);
      i += code.count;
      continue;
    }
    const table = noteTableBlock(lines, i);
    if (table) {
      cy += ncPaintTable(ctx, table, x, cy - NC_LINE_H + 5, w, color);
      i += table.count;
      continue;
    }
    for (const pieces of ncWrap(ctx, ncRuns(lines[i].text), w)) {
      ncPaintLine(ctx, pieces, x, cy, color);
      cy += NC_LINE_H;
    }
    if (!lines[i].text) cy += NC_LINE_H;   // linha em branco também ocupa espaço
    i += 1;
  }
  ctx.restore();
}

function ncRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// as imagens coladas nas caixas são servidas por este mesmo servidor: desenhá-las
// na tela não a suja (é a mesma origem)
function ncLoadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function ncPaintBox(ctx, box) {
  const skin = ncBoxSkin(box.id);
  ncRoundRect(ctx, box.x, box.y, box.w, box.h, 10);
  ctx.fillStyle = skin.bg;
  ctx.fill();
  ctx.strokeStyle = skin.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  let top = box.y + NC_BOX_PAD;
  if (box.image) {
    const img = await ncLoadImage(`/api/notepad/img/${encodeURIComponent(box.image)}`);
    if (img && img.naturalWidth) {
      const maxW = box.w - NC_BOX_PAD * 2;
      const maxH = box.h - NC_BOX_PAD * 2;
      const k = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
      const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
      ctx.drawImage(img, box.x + (box.w - iw) / 2, top, iw, ih);
      top += ih + 6;
    }
  }
  ncPaintText(ctx, box.text, box.x + NC_BOX_PAD, top,
    box.w - NC_BOX_PAD * 2, box.y + box.h - NC_BOX_PAD - top, skin.color);
}

// ---------- traços, formas, ligações e grupos ----------

function ncPaintStroke(ctx, s) {
  const pts = s.points || [];
  if (pts.length < 2) return;
  ctx.strokeStyle = ncDrawColor("data-sid", s.id);
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
  ctx.stroke();
}

function ncPaintShape(ctx, s) {
  ctx.strokeStyle = ncDrawColor("data-shid", s.id);
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (s.kind === "line") {
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
  } else {
    const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2);
    const w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1);
    if (s.kind === "rect") ctx.rect(x, y, w, h);
    else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  }
  ctx.stroke();
}

function ncPaintConnector(ctx, note, c) {
  const a = (note.boxes || []).find(b => b.id === c.from);
  const b = (note.boxes || []).find(x => x.id === c.to);
  if (!a || !b) return;
  // a mesma geometria da linha que está no ecrã (notes.js)
  const pts = noteConnectorEndpoints(a, b);
  ctx.strokeStyle = ncDrawColor("data-cid", c.id);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pts.a.x, pts.a.y);
  ctx.lineTo(pts.b.x, pts.b.y);
  ctx.stroke();
  if (!c.label) return;
  const mid = noteConnectorMid(pts);
  ctx.font = ncFont(false);
  ctx.textAlign = "center";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillText(c.label, mid.x, mid.y - NOTE_CONN_LABEL_DY);
  ctx.textAlign = "left";
}

function ncPaintFrame(ctx, f, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ncRoundRect(ctx, f.x, f.y, f.w, f.h, 10);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.8;
  ctx.font = ncFont(true);
  ctx.fillStyle = color;
  ctx.fillText(String(f.name || ""), f.x + 10, f.y - 6);
  ctx.restore();
}

// ---------- as duas imagens que a app oferece ----------

function ncCanvasPng(w, h, paint) {
  // ×2 para a imagem não sair esborratada num ecrã normal (e ficar legível
  // quando alguém a amplia no Paint)
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = ncPageBg();
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = "alphabetic";
  return Promise.resolve(paint(ctx))
    .then(() => new Promise((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error("png"))), "image/png")));
}

// imagem de uma caixa só
function noteBoxPng(box) {
  const w = Math.max(40, box.w) + 2, h = Math.max(30, box.h) + 2;
  return ncCanvasPng(w, h, ctx => {
    ctx.translate(1 - box.x, 1 - box.y);
    return ncPaintBox(ctx, box);
  });
}

// o retângulo que apanha tudo o que está no quadro
function noteBoardBounds(note) {
  const xs = [], ys = [], xe = [], ye = [];
  const add = (x, y, w, h) => { xs.push(x); ys.push(y); xe.push(x + w); ye.push(y + h); };
  (note.boxes || []).forEach(b => add(b.x, b.y, b.w, b.h));
  (note.frames || []).forEach(f => add(f.x, f.y - 18, f.w, f.h + 18));
  (note.shapes || []).forEach(s => add(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2),
    Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1)));
  (note.strokes || []).forEach(s => (s.points || []).forEach(p => add(p.x, p.y, 0, 0)));
  if (!xs.length) return null;
  const pad = 24;
  return {
    x: Math.min(...xs) - pad, y: Math.min(...ys) - pad,
    w: Math.max(...xe) - Math.min(...xs) + pad * 2,
    h: Math.max(...ye) - Math.min(...ys) + pad * 2,
  };
}

// imagem do quadro inteiro (ou só das caixas escolhidas). A ordem é a do ecrã:
// primeiro as ligações e os traços soltos, depois os grupos, depois as caixas
// e por fim as anotações presas a uma caixa (ver noteDrawSvgBack/Front).
async function noteBoardPng(note, onlyBoxIds) {
  const only = onlyBoxIds && onlyBoxIds.length ? onlyBoxIds : null;
  const boxes = only
    ? (note.boxes || []).filter(b => only.includes(b.id))
    : (note.boxes || []);
  const view = only ? noteBoardBounds({ boxes }) : noteBoardBounds(note);
  if (!view) return null;
  const ink = getComputedStyle(document.body).color || "#202124";
  return ncCanvasPng(view.w, view.h, async ctx => {
    ctx.translate(-view.x, -view.y);
    if (!only) {
      (note.connectors || []).forEach(c => ncPaintConnector(ctx, note, c));
      (note.strokes || []).filter(s => !s.box).forEach(s => ncPaintStroke(ctx, s));
      (note.shapes || []).filter(s => !s.box).forEach(s => ncPaintShape(ctx, s));
      (note.frames || []).forEach(f => ncPaintFrame(ctx, f, ink));
    }
    for (const b of boxes) await ncPaintBox(ctx, b);
    if (!only) {
      (note.strokes || []).filter(s => s.box).forEach(s => ncPaintStroke(ctx, s));
      (note.shapes || []).filter(s => s.box).forEach(s => ncPaintShape(ctx, s));
    }
  });
}

// ---------- escrever na área de transferência ----------
// Um único item com os três formatos: o Paint fica com o PNG, o Teams/OneNote/
// Outlook com o HTML e tudo o que só lê texto com o texto. Se o browser (ou a
// permissão) não deixar, desce-se degrau a degrau até ao texto simples, que é o
// que o copyToClipboard de copymenu.js já sabe fazer sozinho.
async function noteCopyRich(plain, html, png) {
  const tries = [];
  if (png && html) tries.push({ "text/plain": plain, "text/html": html, "image/png": png });
  if (png) tries.push({ "text/plain": plain, "image/png": png });
  if (html) tries.push({ "text/plain": plain, "text/html": html });
  const ok = window.ClipboardItem && navigator.clipboard && navigator.clipboard.write;
  for (const parts of ok ? tries : []) {
    try {
      const item = {};
      for (const [type, value] of Object.entries(parts)) {
        item[type] = value instanceof Blob ? value : new Blob([value], { type });
      }
      await navigator.clipboard.write([new ClipboardItem(item)]);
      toast(t("copy_ok"), "ok");
      return true;
    } catch (err) { /* formato recusado: tenta o degrau seguinte */ }
  }
  copyToClipboard(plain);   // avisa com o seu próprio toast
  return false;
}
