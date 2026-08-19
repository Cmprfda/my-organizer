// My Organizer — quadro de notas: caixas soltas com texto e printscreens,
// arrumadas em pastas e ligadas (se quiseres) a uma tarefa do Excel.

let notepad = { folders: [], notes: [] };
let noteId = SOLO_NOTE || localStorage.getItem("bsp-tracker-note") || "";
// pastas fechadas na coluna da esquerda (por omissão está tudo aberto)
const noteShut = new Set((() => {
  try { return JSON.parse(localStorage.getItem("bsp-tracker-note-shut") || "[]"); }
  catch (e) { return []; }
})());
let noteSelBoxes = [];      // ids das caixas selecionadas (seleção múltipla)
let noteTyping = false;     // texto a ser escrito: não refazer o quadro por baixo
let noteTextTimer = null;   // gravação do texto com atraso
let noteTextSnap = false;   // instantâneo desta sessão de escrita já guardado
let notePoint = { x: 24, y: 24 };   // último ponto tocado no quadro
let noteTool = "select";      // "select" | "pen" | "line" | "rect" | "ellipse" | "eraser" | "connector" | "frame"
let noteStrokeColor = "yellow";
let noteDrawSel = [];         // [{ type: "stroke"|"shape"|"connector", id }] selecionados
let noteConnectFrom = null;   // { id } da caixa já escolhida ao ligar duas caixas
let noteClip = [];            // caixas copiadas com Ctrl+C (só nesta janela)
let noteEditBox = "";         // caixa cujo texto está a ser escrito (mostra o textarea)
const NOTE_MIN_W = 120, NOTE_MIN_H = 80;
const NOTE_BOARD = 4000;
const NOTE_CONN_LABEL_MAX = 60;   // igual ao limite do servidor (MAX_CONN_LABEL)
const NOTE_CONN_LABEL_DY = 9;     // nome da ligação: por cima do meio da linha
const NOTE_CONN_DEL_DY = 18;      // ✕ de apagar: por baixo, longe do nome e da linha
const NOTE_PASTE_OFFSET = 24;   // desvio da cópia colada em relação à original
// texto das caixas: marcadores leves (à maneira do Markdown) para negrito e
// riscado, três espaços por nível na árvore e o tamanho da tabela que o botão
// da barra de ferramentas escreve
const NOTE_BOLD = "**", NOTE_STRIKE = "~~";
const NOTE_OUTLINE_STEP = "   ";
const NOTE_TABLE_COLS = 3, NOTE_TABLE_ROWS = 3;
const NOTE_ZOOM_MIN = 0.25, NOTE_ZOOM_MAX = 2, NOTE_ZOOM_STEP = 0.1;
let noteZoom = Math.min(NOTE_ZOOM_MAX, Math.max(NOTE_ZOOM_MIN,
  parseFloat(localStorage.getItem("bsp-tracker-note-zoom")) || 1));
let noteFull = false;  // quadro em ecrã inteiro
// em ecrã inteiro: coluna das notas recolhida numa faixa estreita (por omissão
// sim — é o que dá mais espaço ao quadro)
let noteRail = localStorage.getItem("bsp-tracker-note-rail") !== "0";
const NOTE_SIDE_MIN = 200, NOTE_SIDE_MAX = 480;
let noteSideW = Math.min(NOTE_SIDE_MAX, Math.max(NOTE_SIDE_MIN,
  parseInt(localStorage.getItem("bsp-tracker-note-side-w"), 10) || 250));
document.documentElement.style.setProperty("--notes-side-w", noteSideW + "px");

// histórico por nota: pilha de instantâneos do quadro para o Ctrl+Z, e a
// pilha do caminho de volta (Ctrl+Shift+Z / Ctrl+Y) com o que foi revertido
const noteUndo = new Map();
const noteRedo = new Map();
const NOTE_UNDO_MAX = 20;

function notesVisible() {
  return currentView === "notes" || sideView === "notes";
}

function noteById(id) {
  return notepad.notes.find(n => n.id === id) || null;
}

function currentNote() {
  return noteById(noteId);
}

function setCurrentNote(id) {
  noteId = id || "";
  setNoteDrawer(false);   // escolheu a nota: a gaveta já não serve de nada
  // numa janela dedicada a escolha não se grava (ver SOLO_NOTE em state.js)
  if (!SOLO_NOTE) localStorage.setItem("bsp-tracker-note", noteId);
  noteSelBoxes = [];
  noteDrawSel = [];
  noteConnectFrom = null;
  renderNotes();
}

// ---------- servidor ----------
async function loadNotepad() {
  try {
    const res = await fetch("/api/notepad");
    notepad = await res.json();
  } catch (e) {
    return;   // sem servidor: o resto da app já avisa
  }
  // numa janela dedicada não se cai noutra nota: um id desconhecido (outro
  // browser, outra instalação) deixa a janela no estado vazio
  if (!noteById(noteId) && !SOLO_NOTE) noteId = (notepad.notes[0] || {}).id || "";
  renderNotes();
}

// `quiet` = a alteração já está no ecrã (texto/arrasto): refazer o quadro só
// tiraria o foco de onde o utilizador está a escrever
async function postNotepad(body, quiet) {
  try {
    const res = await fetch("/api/notepad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = await res.json();
    if (!out.ok) {
      toast(`${t("err_save")} ${out.error || "?"}`, "err");
      return null;
    }
    notepad = out.notepad;
    if (quiet) renderNoteTree();
    else renderNotes(out.notepad.new_box || "");
    return out;
  } catch (err) {
    toast(`${t("err_save")} ${err}`, "err");
    return null;
  }
}

// ---------- coluna da esquerda ----------
function noteMatches(n, q) {
  if (!q) return true;
  return norm(n.title).includes(q) ||
    (n.refs || []).some(r => norm(noteRefLabel(r)).includes(q)) ||
    n.boxes.some(b => norm(b.text).includes(q));
}

function noteRowHtml(n, depth) {
  const bits = [];
  if (n.refs && n.refs.length) {
    const extra = n.refs.length > 1 ? ` +${n.refs.length - 1}` : "";
    bits.push(`📌 ${noteRefLabel(n.refs[0])}${extra}`);
  }
  bits.push(`${n.boxes.length} ${t(n.boxes.length === 1 ? "note_box_1" : "note_boxes")}`);
  if (n.updated) bits.push(n.updated);
  return `<div class="noteRow${n.id === noteId ? " active" : ""}" draggable="true" data-nid="${esc(n.id)}"
    style="padding-left:${8 + depth * 12}px">
    <button type="button" class="noteRowOpen" data-nopen="${esc(n.id)}">
      <span class="noteRowTitle">${esc(n.title)}</span>
      <span class="noteRowMeta">${esc(bits.join(" · "))}</span>
    </button>
    <button type="button" class="noteMini" data-npop="${esc(n.id)}" title="${esc(t("t_note_window"))}">↗</button>
    <button type="button" class="noteMini" data-ndup="${esc(n.id)}" title="${esc(t("t_note_dup"))}">⧉</button>
    <button type="button" class="noteMini" data-ndel="${esc(n.id)}" title="${esc(t("t_note_del"))}">✕</button>
  </div>`;
}

function noteBranchHtml(parent, depth, q) {
  const folders = notepad.folders.filter(f => f.parent === parent);
  const notes = notepad.notes.filter(n => n.folder === parent && noteMatches(n, q));
  let html = "";
  for (const f of folders) {
    const open = q ? true : !noteShut.has(f.id);
    const inner = open ? noteBranchHtml(f.id, depth + 1, q) : "";
    const count = notepad.notes.filter(n => n.folder === f.id).length;
    html += `<div class="noteFolder" draggable="true" data-fid="${esc(f.id)}" style="padding-left:${depth * 12}px">
      <button type="button" class="noteFolderTog" data-ftog="${esc(f.id)}">${open ? "▾" : "▸"}</button>
      <span class="noteFolderName" data-frename="${esc(f.id)}" title="${esc(t("t_note_rename"))}">${esc(f.name)}</span>
      <span class="noteCount">${count}</span>
      <button type="button" class="noteMini" data-fadd="${esc(f.id)}" title="${esc(t("t_note_add_here"))}">+</button>
      <button type="button" class="noteMini" data-fdel="${esc(f.id)}" title="${esc(t("t_folder_del"))}">✕</button>
    </div>${inner}`;
  }
  html += notes.map(n => noteRowHtml(n, depth)).join("");
  return html;
}

function renderNoteTree() {
  const q = norm($("noteFilter").value || "");
  const html = noteBranchHtml("", 0, q);
  // a zona da raiz está sempre no topo: é onde se larga para tirar da pasta
  const root = `<div class="noteRootDrop" data-frootdrop="1" title="${esc(t("t_note_drop_root"))}">${esc(t("note_root_label"))}</div>`;
  // sem pesquisa e sem notas o estado vazio do quadro já explica tudo
  $("noteTree").innerHTML = root + (html || (q ? `<div class="noteTreeEmpty">${esc(t("note_none"))}</div>` : ""));
}

// ---------- caminho da nota: "pasta/subpasta/título" ----------
function folderChainNames(folderId) {
  const names = [];
  let id = folderId;
  while (id) {
    const f = notepad.folders.find(x => x.id === id);
    if (!f) break;
    names.unshift(f.name);
    id = f.parent;
  }
  return names;
}

function notePathString(note) {
  const names = folderChainNames(note.folder);
  return names.length ? `${names.join("/")}/${note.title}` : note.title;
}

// anda pelas pastas a partir da raiz casando nomes (sem distinguir maiúsculas);
// devolve a pasta mais profunda alcançada e quantos segmentos coincidiram
function resolveFolderChain(names) {
  let parent = "";
  let matched = 0;
  for (const name of names) {
    const hit = notepad.folders.find(f => f.parent === parent && norm(f.name) === norm(name));
    if (!hit) break;
    parent = hit.id;
    matched++;
  }
  return { folderId: parent, matched };
}

// abre a pasta (e os antepassados) na árvore e leva-a para a vista — "mostrar
// a lista de notas dessa pasta"
function revealFolder(folderId) {
  let id = folderId;
  while (id) {
    noteShut.delete(id);
    id = (notepad.folders.find(f => f.id === id) || {}).parent || "";
  }
  localStorage.setItem("bsp-tracker-note-shut", JSON.stringify([...noteShut]));
  renderNoteTree();
  if (!folderId) { $("noteTree").scrollTo({ top: 0 }); return; }
  const el = $("noteTree").querySelector(`[data-fid="${CSS.escape(folderId)}"]`);
  if (el) el.scrollIntoView({ block: "nearest" });
}

// caminho livre no cabeçalho: "pasta/sub/título" muda a pasta+título da nota
// atual (criando pastas em falta); se casar com OUTRA nota, abre-a; a
// terminar em "/" é modo pasta — só mostra essa pasta na árvore, sem tocar na nota
async function commitNotePath(raw) {
  const note = currentNote();
  if (!note) return;
  const trailingSlash = /\/\s*$/.test(raw) && raw.trim() !== "";
  const parts = raw.split("/").map(s => s.trim()).filter(Boolean);
  if (!parts.length) { renderNoteBoard(); return; }

  if (trailingSlash) {
    const { folderId, matched } = resolveFolderChain(parts);
    if (matched !== parts.length) { toast(t("note_path_not_found"), "err"); renderNoteBoard(); return; }
    revealFolder(folderId);
    renderNoteBoard();
    return;
  }

  const title = parts[parts.length - 1];
  const chain = parts.slice(0, -1);
  const { folderId, matched } = resolveFolderChain(chain);

  if (matched === chain.length) {
    const existing = notepad.notes.find(n => n.folder === folderId && norm(n.title) === norm(title) && n.id !== note.id);
    if (existing) { setCurrentNote(existing.id); return; }
    if (folderId === note.folder && title === note.title) return;
    if (folderId !== note.folder) { if (!await postNotepad({ action: "move_note", id: note.id, folder: folderId }, true)) return; }
    if (title !== note.title) await postNotepad({ action: "rename_note", id: note.id, title });
    else renderNoteBoard();
    return;
  }

  // pastas em falta na cadeia: cria-as (como "mkdir -p") e move a nota lá para dentro
  let parent = folderId;
  for (const name of chain.slice(matched)) {
    const out = await postNotepad({ action: "add_folder", name, parent }, true);
    if (!out) return;
    parent = (out.notepad.folders[out.notepad.folders.length - 1] || {}).id || "";
  }
  if (!await postNotepad({ action: "move_note", id: note.id, folder: parent }, true)) return;
  await postNotepad({ action: "rename_note", id: note.id, title });
}

// ---------- texto das caixas: negrito, riscado e tabelas ----------
// O que se guarda continua a ser texto simples (o servidor só lhe corta o
// tamanho): **negrito**, ~~riscado~~ e tabelas escritas em "| coluna |".
// Enquanto não se está a escrever nessa caixa mostra-se a vista formatada
// (.noteBoxTextView); ao clicar aparece o texto com os marcadores à vista, no
// mesmo <textarea> de sempre.

// as linhas do texto, cada uma com o índice onde começa no texto original
function noteTextLines(text) {
  const out = [];
  let at = 0;
  for (const line of String(text).split("\n")) {
    out.push({ text: line, at });
    at += line.length + 1;
  }
  return out;
}

const NOTE_ROW_RE = /^\s*\|.*\|\s*$/;                    // "| a | b |"
const NOTE_SEP_RE = /^\s*\|[\s|:-]*-[\s|:-]*\|\s*$/;     // "| --- | --- |"

// bloco de tabela a começar na linha `i`: cabeçalho, linha de separação e as
// linhas de dados que vierem a seguir
function noteTableBlock(lines, i) {
  if (!NOTE_ROW_RE.test(lines[i].text) || NOTE_SEP_RE.test(lines[i].text)) return null;
  if (!lines[i + 1] || !NOTE_SEP_RE.test(lines[i + 1].text)) return null;
  let end = i + 2;
  while (end < lines.length && NOTE_ROW_RE.test(lines[end].text) && !NOTE_SEP_RE.test(lines[end].text)) end++;
  return {
    head: lines[i],
    sep: lines[i + 1],
    body: lines.slice(i + 2, end),
    aligns: noteTableAligns(lines[i + 1]),
    count: end - i,
  };
}

// células de uma linha "| a | b |", cada uma com o índice do seu texto no
// texto original (é o que põe o cursor na célula onde se clicou) e com os
// espaços de enchimento que tinha à volta (`lead`/`trail`) — a vista não os
// mostra, mas é por eles que a linha se volta a escrever igual (ver noteTrText)
function noteTableCells(line) {
  const first = line.text.indexOf("|"), last = line.text.lastIndexOf("|");
  const cells = [];
  let at = line.at + first + 1;
  for (const part of line.text.slice(first + 1, last).split("|")) {
    const body = part.trim();
    // numa célula vazia o enchimento conta todo para a direita: o que se
    // escrever nela entra no princípio, e a coluna fica da largura que tinha
    const lead = body ? part.length - part.trimStart().length : Math.min(1, part.length);
    cells.push({ text: body, at: at + lead, lead, trail: part.length - lead - body.length });
    at += part.length + 1;
  }
  return cells;
}

// o que uma linha de tabela tem fora das células: o que vem antes do primeiro
// "|" e depois do último
function noteTableEdges(line) {
  const first = line.text.indexOf("|"), last = line.text.lastIndexOf("|");
  return { pre: line.text.slice(0, first + 1), post: line.text.slice(last) };
}

// alinhamento de cada coluna, lido da linha de separação: "|:---|" à esquerda,
// "|---:|" à direita, "|:--:|" ao centro; sem ":" fica o alinhamento normal
function noteTableAligns(sep) {
  return noteTableCells(sep).map(cell => {
    const left = cell.text.startsWith(":"), right = cell.text.endsWith(":");
    if (left && right) return "center";
    return right ? "right" : left ? "left" : "";
  });
}

// **negrito** e ~~riscado~~ dentro de uma linha; um marcador sem par fica
// texto normal. `out.map` recebe, por cada caractere visível, o índice dele no
// texto original (os marcadores não são visíveis, por isso não entram)
function noteRichInline(text, at, out) {
  const open = [];
  let i = 0;
  while (i < text.length) {
    const mark = text.startsWith(NOTE_BOLD, i) ? NOTE_BOLD
      : text.startsWith(NOTE_STRIKE, i) ? NOTE_STRIKE : "";
    if (mark) {
      const tag = mark === NOTE_BOLD ? "strong" : "s";
      if (open[open.length - 1] === tag) {
        open.pop();
        out.html += `</${tag}>`;
        i += mark.length;
        continue;
      }
      if (text.indexOf(mark, i + mark.length) >= 0) {
        open.push(tag);
        out.html += `<${tag}>`;
        i += mark.length;
        continue;
      }
    }
    out.map.push(at + i);
    out.html += esc(text[i]);
    i += 1;
  }
  while (open.length) out.html += `</${open.pop()}>`;
}

const NOTE_ALIGN_CLASS = { left: "alL", center: "alC", right: "alR" };

// IMPORTANTE: nada de espaços nem mudanças de linha entre as etiquetas da
// tabela — só o texto das células é que pode ser texto, senão o mapa deixava
// de casar com o que o browser vê (ver noteViewRawIndex)
//
// uma linha da tabela; `cols` é o número de colunas do cabeçalho, para as
// linhas mais curtas ganharem as células que faltam e a grelha não ficar
// rasgada (essas células vazias levam o cursor ao fim da própria linha).
// Os `data-*` são o que a vista precisa para se voltar a ler como texto: os
// espaços que a célula tinha à volta e o que a linha tem fora das células.
function noteTableRowHtml(row, tag, cols, aligns, out) {
  const cells = noteTableCells(row);
  const edges = noteTableEdges(row);
  out.html += `<tr data-pre="${esc(edges.pre)}" data-post="${esc(edges.post)}">`;
  cells.forEach((cell, c) => {
    const cls = NOTE_ALIGN_CLASS[aligns[c]];
    out.html += `<${tag}${cls ? ` class="${cls}"` : ""} data-at="${cell.at}" data-pad="${cell.lead},${cell.trail}">`;
    noteRichInline(cell.text, cell.at, out);
    out.html += `</${tag}>`;
  });
  const end = row.at + row.text.length;
  for (let c = cells.length; c < cols; c++) {
    const cls = NOTE_ALIGN_CLASS[aligns[c]];
    out.html += `<${tag} class="noteBoxTableFill${cls ? ` ${cls}` : ""}" data-at="${end}"></${tag}>`;
  }
  out.html += `</tr>`;
}

function noteTableHtml(table, out) {
  const cols = noteTableCells(table.head).length;
  // a linha de separação não se mostra (é a grelha), mas guarda-se como estava
  // para a tabela continuar a ser a mesma quando a vista voltar a texto
  out.html += `<table class="noteBoxTable" data-sep="${esc(table.sep.text)}"><thead>`;
  noteTableRowHtml(table.head, "th", cols, table.aligns, out);
  out.html += `</thead>`;
  if (table.body.length) {
    out.html += `<tbody>`;
    for (const row of table.body) noteTableRowHtml(row, "td", cols, table.aligns, out);
    out.html += `</tbody>`;
  }
  out.html += `</table>`;
}

// HTML da vista de uma caixa + o mapa "caractere visível -> índice no texto"
function noteRichRender(text) {
  const out = { html: "", map: [] };
  const lines = noteTextLines(text);
  let i = 0;
  let prevText = false;    // a linha anterior é texto normal: precisa do \n
  let prevTable = false;   // a linha anterior fechou uma tabela
  while (i < lines.length) {
    const table = noteTableBlock(lines, i);
    if (table) {
      noteTableHtml(table, out);
      i += table.count;
      prevText = false;    // a tabela é um bloco: já muda de linha sozinha
      prevTable = true;
      continue;
    }
    if (prevText) {
      out.map.push(lines[i].at - 1);
      out.html += "\n";    // a vista usa white-space: pre-wrap
    } else if (prevTable && !lines[i].text && i < lines.length - 1) {
      // linha em branco depois de uma tabela: não se vê, mas é ela que separa
      // duas tabelas — sem isto, ler a vista de volta juntava-as numa só
      out.map.push(lines[i].at);
      out.html += "\n";
    }
    noteRichInline(lines[i].text, lines[i].at, out);
    prevText = true;
    prevTable = false;
    i += 1;
  }
  return out;
}

// `editing`: a caixa está a ser escrita, e aí não entra o "escreve aqui..." —
// é onde o cursor vive, e o texto de exemplo acabaria por ser escrito também
function noteBoxViewHtml(text, editing) {
  if (String(text || "").trim() || editing) return noteRichRender(text).html;
  return `<span class="noteBoxPh">${esc(t("ph_box"))}</span>`;
}

// ---------- copiar o texto de uma caixa ----------
// O que vai para a área de transferência é o texto como se lê na caixa, não os
// marcadores: **negrito** e ~~riscado~~ perdem os marcadores (o par sem
// fecho fica texto, como na vista) e cada linha de tabela passa a células
// separadas por tabulação — assim cola-se direto no Excel, no Outlook ou no chat.
function noteMarkPlain(text) {
  const open = [];
  let out = "";
  let i = 0;
  while (i < text.length) {
    const mark = text.startsWith(NOTE_BOLD, i) ? NOTE_BOLD
      : text.startsWith(NOTE_STRIKE, i) ? NOTE_STRIKE : "";
    if (mark) {
      if (open[open.length - 1] === mark) { open.pop(); i += mark.length; continue; }
      if (text.indexOf(mark, i + mark.length) >= 0) { open.push(mark); i += mark.length; continue; }
    }
    out += text[i];
    i += 1;
  }
  return out;
}

function noteTableRowPlain(line) {
  return noteTableCells(line).map(cell => noteMarkPlain(cell.text)).join("\t");
}

function noteBoxPlainText(text) {
  const lines = noteTextLines(String(text || ""));
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const table = noteTableBlock(lines, i);
    if (table) {
      // a linha de separação ("| --- |") é só grelha: não se copia
      out.push(noteTableRowPlain(table.head));
      for (const row of table.body) out.push(noteTableRowPlain(row));
      i += table.count;
      continue;
    }
    out.push(noteMarkPlain(lines[i].text));
    i += 1;
  }
  return out.join("\n").trim();
}

// ✓ por um instante no botão: confirma a cópia mesmo com o toast já cheio
function flashNoteCopied(btn) {
  if (!btn) return;
  btn.classList.add("copied");
  setTimeout(() => btn.classList.remove("copied"), 1200);
}

// o texto que a caixa tem NESTE momento: se está a ser escrita, o do campo
// (ainda pode não ter sido gravado); se não, o do modelo
function noteBoxText(note, boxId) {
  const area = $("noteCanvas").querySelector(`[data-btext="${CSS.escape(boxId)}"]`);
  if (area) return area.value;
  const model = (note.boxes || []).find(b => b.id === boxId);
  return model ? model.text || "" : "";
}

// O ⧉ de uma caixa põe na área de transferência os três formatos ao mesmo
// tempo: texto simples (para tudo o que só lê texto), HTML com estilos (o
// Teams, o OneNote e o Outlook ficam com o negrito, o riscado e a tabela
// desenhada) e o PNG da caixa (o Paint só aceita imagem). Quem cola escolhe o
// formato que sabe ler. Ver noteCopyRich em noteclip.js.
async function copyNoteBox(note, boxId, btn) {
  const text = noteBoxText(note, boxId);
  const model = (note.boxes || []).find(b => b.id === boxId);
  const plain = noteBoxPlainText(text);
  if (!plain && !(model && model.image)) { toast(t("note_box_copy_empty")); return; }
  if (typeof copyToClipboard !== "function") { toast(t("copy_err"), "err"); return; }
  if (typeof noteCopyRich !== "function") {
    // copyToClipboard (copymenu.js) já trata da falta de permissões (volta ao
    // método antigo) e avisa com um toast em qualquer dos casos
    copyToClipboard(plain);
    flashNoteCopied(btn);
    return;
  }
  flashNoteCopied(btn);
  let png = null;
  try {
    png = model ? await noteBoxPng({ ...model, text }) : null;
  } catch (err) {
    png = null;   // sem imagem vai o resto: o texto e o HTML valem por si
  }
  await noteCopyRich(plain, noteMarksToHtml(text), png);
}

// ---------- copiar a nota inteira ----------
// As caixas pela ordem de leitura do quadro: de cima para baixo, e as que
// estão à mesma altura da esquerda para a direita. Caixas em linhas diferentes
// só contam como "a mesma altura" se estiverem a menos de meia caixa de
// distância (senão duas colunas desalinhadas leriam-se em ziguezague).
function noteBoxesInOrder(note, ids) {
  const list = (note.boxes || []).filter(b => !ids || !ids.length || ids.includes(b.id));
  return list.slice().sort((a, b) => (Math.abs(a.y - b.y) > 40 ? a.y - b.y : a.x - b.x));
}

// Copia a nota (ou só as caixas selecionadas) nos três formatos, como o ⧉ de
// uma caixa: texto, HTML com estilos e o PNG do quadro — com os traços, as
// formas, as ligações e os grupos, que só na imagem é que se veem.
async function copyNoteAll(btn) {
  const note = currentNote();
  if (!note) return;
  const ids = noteSelBoxes.slice();
  const boxes = noteBoxesInOrder(note, ids).map(b => ({ ...b, text: noteBoxText(note, b.id) }));
  if (!boxes.length) { toast(t("note_copy_empty")); return; }
  const plain = boxes.map(b => noteBoxPlainText(b.text)).filter(Boolean).join("\n\n");
  if (typeof noteCopyRich !== "function") {
    if (typeof copyToClipboard === "function") copyToClipboard(plain);
    return;
  }
  flashNoteCopied(btn);
  const html = boxes.map(b => `<div style="margin:0 0 10px">${noteMarksToHtml(b.text)}</div>`).join("");
  let png = null;
  try {
    png = await noteBoardPng(note, ids);
  } catch (err) {
    png = null;   // sem imagem vai o resto
  }
  await noteCopyRich(plain, html, png);
}

// ---------- a vista é onde se escreve ----------
// A caixa mostra SEMPRE o texto formatado — a tabela desenhada, o negrito
// negrito e o riscado riscado — e é nela que se escreve: os marcadores (**, ~~
// e os "|" da tabela) nunca aparecem. O <textarea> continua a existir, mas
// escondido: é ele que guarda o texto com marcadores e a marcação (from/to),
// que é o que todas as funções de edição desta página conhecem (B/S, Tab,
// Enter, inserir tabela). O caminho é sempre o mesmo:
//   escreve-se na vista -> lê-se a vista como texto (noteViewText) -> o campo
//   fica com esse texto -> se a FORMA mudou, a vista é refeita e o cursor volta
//   ao mesmo sítio; se só mudaram letras, deixa-se o DOM como o browser o pôs
//   (é o que deixa escrever um espaço no fim de uma célula).

// os nós de texto da vista, por ordem, com o índice visível onde cada um começa
function noteViewTextNodes(root) {
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  while (walker.nextNode()) {
    out.push({ node: walker.currentNode, at: seen, len: walker.currentNode.nodeValue.length });
    seen += walker.currentNode.nodeValue.length;
  }
  return out;
}

// a célula de tabela onde este nó está (se estiver numa)
function noteCellOf(node) {
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return el ? el.closest("[data-at]") : null;
}

// índice no texto original de uma posição dentro de uma célula, contando o
// texto que ela tem até ali
function noteCellIndexAt(cell, node, offset) {
  const range = document.createRange();
  range.selectNodeContents(cell);
  try { range.setEnd(node, offset); } catch (err) { return +cell.dataset.at; }
  return +cell.dataset.at + noteNodesText(range.cloneContents().childNodes, true).length;
}

// índice no texto original de uma posição (nó, deslocamento) da vista
function noteViewIndexAt(view, text, node, offset) {
  if (!node || !view.contains(node)) return -1;
  const map = noteRichRender(text).map;
  const end = () => (map.length ? map[map.length - 1] + 1 : 0);
  // o cursor está ENTRE caracteres: `after` diz se está depois do caractere
  // anterior (e não antes do seguinte, que pode já ser de outra célula)
  const index = (plain, after) => {
    if (after) return map[plain - 1] != null ? map[plain - 1] + 1 : end();
    return map[plain] != null ? map[plain] : end();
  };
  const nodes = noteViewTextNodes(view);
  if (node.nodeType === Node.TEXT_NODE) {
    const hit = nodes.find(n => n.node === node);
    if (!hit) return -1;
    const off = Math.min(offset, hit.len);
    // uma célula mostra-se sem os espaços das pontas, por isso pode ter escrito
    // mais do que o texto conhece (um espaço ainda por acabar): aí conta-se pela
    // própria célula
    const cell = noteCellOf(node);
    if (off > 0 && map[hit.at + off - 1] == null && cell) return noteCellIndexAt(cell, node, off);
    return index(hit.at + off, off > 0);
  }
  // não é texto: uma ponta de célula, uma célula vazia (não tem onde pousar o
  // cursor) ou uma caixa ainda sem nada escrito
  const cell = node.closest ? node.closest("[data-at]") : null;
  if (cell && !cell.textContent.length) return +cell.dataset.at;
  const inside = nodes.filter(n => node.contains(n.node));
  if (!inside.length) return cell ? +cell.dataset.at : 0;
  if (offset === 0) return index(inside[0].at, false);
  const last = inside[inside.length - 1];
  return index(last.at + last.len, true);
}

// onde é que um clique na vista caiu, em índice do texto original (-1 = fora
// do texto, e aí o cursor vai para o fim)
function noteViewRawIndex(view, text, clientX, clientY) {
  let node = null, offset = 0;
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(clientX, clientY);
    if (range) { node = range.startContainer; offset = range.startOffset; }
  } else if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(clientX, clientY);
    if (pos) { node = pos.offsetNode; offset = pos.offset; }
  }
  return noteViewIndexAt(view, text, node, offset);
}

// o que está marcado na vista, em índices do texto original
function noteViewSel(view, text) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const a = noteViewIndexAt(view, text, sel.anchorNode, sel.anchorOffset);
  const b = noteViewIndexAt(view, text, sel.focusNode, sel.focusOffset);
  if (a < 0 || b < 0) return null;
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

// posição (nó, deslocamento) da vista para um índice visível. Nas pontas de uma
// célula devolve-se a própria célula (e não o texto lá dentro): assim o browser
// não pode ler a posição como sendo a da célula ao lado — o que punha uma
// marcação a atravessar duas células
function noteViewNodeAt(view, nodes, plain) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (plain > n.at + n.len) continue;
    // na fronteira entre dois textos o cursor fica no princípio do seguinte e
    // não no fim deste: é a diferença entre escrever dentro ou fora de um
    // negrito (ou de uma célula) e é o princípio que casa com o índice pedido
    if (plain === n.at + n.len && nodes[i + 1] && nodes[i + 1].at === plain) continue;
    const cell = n.node.parentElement && n.node.parentElement.closest("[data-at]");
    if (cell && cell.firstChild === n.node && plain === n.at) return { node: cell, offset: 0 };
    if (cell && cell.lastChild === n.node && plain === n.at + n.len) {
      return { node: cell, offset: cell.childNodes.length };
    }
    return { node: n.node, offset: plain - n.at };
  }
  const last = nodes[nodes.length - 1];
  if (last) return { node: last.node, offset: last.len };
  return { node: view, offset: 0 };
}

// posição (nó, deslocamento) da vista para um índice do texto original
function noteViewPoint(view, nodes, map, raw) {
  // o índice pode cair no enchimento de uma célula (que não se vê) ou numa
  // célula vazia (que não tem texto onde pousar o cursor): em qualquer dos
  // casos o cursor é dela, e não do que vem a seguir
  let own = null;
  for (const cell of view.querySelectorAll("[data-at]")) {
    if (+cell.dataset.at > raw) break;
    own = cell;
  }
  if (own) {
    const at = +own.dataset.at;
    const trail = +(own.dataset.pad || "0,0").split(",")[1] || 0;
    // o texto da célula tal como se escreve (com marcadores): é por ele que se
    // sabe onde a célula acaba, e não pelo que se lê na vista
    const len = noteNodesText(own.childNodes, true).length;
    if (raw <= at) return { node: own, offset: 0 };
    if (raw >= at + len && raw <= at + len + trail) {
      return { node: own, offset: own.childNodes.length };
    }
  }
  let plain = 0;
  for (let i = 0; i < map.length; i++) {
    if (map[i] === raw) { plain = i; break; }
    if (map[i] > raw) break;
    plain = i + 1;
  }
  return noteViewNodeAt(view, nodes, plain);
}

// põe o cursor (ou a marcação) da vista nos índices do texto original
function noteViewPlace(view, text, from, to) {
  const map = noteRichRender(text).map;
  const nodes = noteViewTextNodes(view);
  const a = noteViewPoint(view, nodes, map, Math.max(0, from));
  const b = to === from ? a : noteViewPoint(view, nodes, map, Math.max(0, to));
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  try {
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
  } catch (err) { return; }
  sel.removeAllRanges();
  sel.addRange(range);
}

// ---------- ler a vista como texto ----------
// O contrário do render: o que está escrito na vista volta a ser o texto com
// marcadores. Só se conhecem as etiquetas que o render escreve; o que o browser
// tenha metido pelo meio (um <div>, um <span>, um <br> de enchimento) vale
// apenas o texto que tem dentro.
const NOTE_BLOCK_TAGS = new Set(["DIV", "P", "LI", "UL", "OL", "H1", "H2", "H3", "PRE"]);

function noteViewText(view) {
  return noteNodesText(view.childNodes, false);
}

function noteNodesText(nodes, inCell) {
  let out = "";
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      // o browser mete espaços "duros" para os espaços do fim não se perderem
      out += node.nodeValue.replace(/ /g, " ");
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = node.tagName;
    if (tag === "BR") continue;   // enchimento do browser: o Enter é tratado à mão
    if (tag === "STRONG" || tag === "B") {
      out += NOTE_BOLD + noteNodesText(node.childNodes, inCell) + NOTE_BOLD;
      continue;
    }
    if (tag === "S" || tag === "STRIKE" || tag === "DEL") {
      out += NOTE_STRIKE + noteNodesText(node.childNodes, inCell) + NOTE_STRIKE;
      continue;
    }
    if (tag === "TABLE") {
      if (out && !out.endsWith("\n")) out += "\n";
      out += noteTableText(node);
      if (noteHasNextContent(node)) out += "\n";
      continue;
    }
    if (NOTE_BLOCK_TAGS.has(tag) && out && !out.endsWith("\n")) out += "\n";
    out += noteNodesText(node.childNodes, inCell);
  }
  return out;
}

function noteHasNextContent(node) {
  for (let next = node.nextSibling; next; next = next.nextSibling) {
    if (next.nodeType === Node.TEXT_NODE && next.nodeValue) return true;
    if (next.nodeType === Node.ELEMENT_NODE) return true;
  }
  return false;
}

// uma linha de tabela: as células voltam a levar os espaços que tinham à volta
// (data-pad) e a linha o que tinha fora delas (data-pre/data-post), para o
// texto ficar igual ao que estava escrito
function noteTrText(tr) {
  const cells = [];
  let loose = "";   // texto que o browser deixou fora de uma célula: vai para a
  for (const node of tr.childNodes) {                          // célula ao lado
    if (node.nodeType === Node.TEXT_NODE) { loose += node.nodeValue.replace(/ /g, " "); continue; }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const pad = (node.dataset.pad || "0,0").split(",");
    const body = loose + noteNodesText(node.childNodes, true).replace(/\n/g, " ");
    loose = "";
    if (node.classList.contains("noteBoxTableFill") && !body) continue;
    cells.push(" ".repeat(+pad[0] || 0) + body + " ".repeat(+pad[1] || 0));
  }
  if (loose && cells.length) cells[cells.length - 1] += loose;
  else if (loose) cells.push(loose);
  return (tr.dataset.pre || "|") + cells.join("|") + (tr.dataset.post || "|");
}

function noteTableText(table) {
  const rows = [];
  for (const tr of table.querySelectorAll("tr")) {
    rows.push(noteTrText(tr));
    // a linha de separação volta ao seu lugar: logo depois do cabeçalho
    const head = tr.parentElement && tr.parentElement.tagName === "THEAD";
    if (head && table.dataset.sep) rows.push(table.dataset.sep);
  }
  return rows.join("\n");
}

// ---------- quadro ----------
function noteBoxHtml(b) {
  const img = b.image
    ? `<img class="noteBoxImg" src="/api/notepad/img/${encodeURIComponent(b.image)}" alt=""
        draggable="false" title="${esc(t("t_box_img"))}">`
    : "";
  const cls = `noteBox c-${esc(b.color)}${noteSelBoxes.includes(b.id) ? " sel" : ""}` +
    (noteEditBox === b.id ? " editing" : "");
  return `<div class="${cls}" data-bid="${esc(b.id)}"
    style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px">
    <div class="noteBoxBar" title="${esc(t("t_box_drag"))}">
      <span class="noteBoxGrip">⠿</span>
      <button type="button" class="noteBoxFmt" data-bfmt="bold" title="${esc(t("t_box_bold"))}"><b>B</b></button>
      <button type="button" class="noteBoxFmt" data-bfmt="strike" title="${esc(t("t_box_strike"))}"><s>S</s></button>
      <button type="button" class="noteBoxCopy" data-bcopy="${esc(b.id)}" title="${esc(t("t_box_copy"))}">⧉</button>
      <button type="button" class="noteBoxColor" data-bcolor="${esc(b.id)}" title="${esc(t("t_box_color"))}"></button>
      <button type="button" data-bdel="${esc(b.id)}" title="${esc(t("t_box_del"))}">✕</button>
    </div>
    <div class="noteBoxBody">${img}<div class="noteBoxTextView" data-bview="${esc(b.id)}" spellcheck="false"
      title="${esc(t("t_box_text"))}">${noteBoxViewHtml(b.text, noteEditBox === b.id)}</div><textarea class="noteBoxText" data-btext="${esc(b.id)}"
      tabindex="-1" aria-hidden="true">${esc(b.text)}</textarea></div>
    <div class="noteBoxSize" data-bsize="${esc(b.id)}" title="${esc(t("t_box_size"))}"></div>
  </div>`;
}

// moldura de grupo: só a barra, as bordas e os cantos recebem cliques (ver
// notes.css), para as caixas lá dentro continuarem a funcionar normalmente
function noteFrameHtml(f) {
  const edges = ["top", "right", "bottom", "left"].map(edge =>
    `<div class="noteFrameEdge" data-frmedge="${esc(f.id)}" data-edge="${edge}" title="${esc(t("t_frame_drag"))}"></div>`).join("");
  const corners = ["nw", "ne", "sw", "se"].map(c =>
    `<div class="noteFrameSize" data-frmsize="${esc(f.id)}" data-corner="${c}"></div>`).join("");
  return `<div class="noteFrame" data-fmid="${esc(f.id)}"
    style="left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px">
    <div class="noteFrameBar" title="${esc(t("t_frame_drag"))}">
      <span class="noteFrameGrip" aria-hidden="true"></span>
      <span class="noteFrameName" data-frmrename="${esc(f.id)}" title="${esc(t("t_note_rename"))}">${esc(f.name)}</span>
      <button type="button" data-frmdel="${esc(f.id)}" title="${esc(t("t_frame_del"))}">✕</button>
    </div>
    ${edges}
    ${corners}
  </div>`;
}

// ---------- camada de desenho: traços à mão e formas ----------
// Há DUAS camadas: a de baixo (#noteDrawLayer) fica por baixo das caixas, como
// sempre, e a de cima (#noteDrawTop) fica por cima delas — é lá que vivem as
// anotações presas a uma caixa (`box`), para se poder desenhar por cima de uma
// imagem e ver o traço. Um traço solto (sem `box`) continua na camada de baixo.
function noteDrawLayers() {
  return [$("noteDrawLayer"), $("noteDrawTop")].filter(Boolean);
}

// procura um traço/forma/ligação nas duas camadas
function noteDrawFind(attr, id) {
  const sel = `[${attr}="${CSS.escape(id)}"]`;
  for (const layer of noteDrawLayers()) {
    const el = layer.querySelector(sel);
    if (el) return el;
  }
  return null;
}

// camada onde se desenha o que está a ser feito com o rato: sempre a de cima,
// senão a pré-visualização desaparecia por baixo da caixa
function noteDrawFrontLayer() {
  return $("noteDrawTop") || $("noteDrawLayer");
}

function svgPoints(points) {
  return points.map(p => `${p.x},${p.y}`).join(" ");
}

// caixa com imagem debaixo deste ponto do quadro (a de cima, se estiverem
// empilhadas): é a ela que fica preso um traço/forma desenhado ali
function noteImageBoxAt(note, pt) {
  const hits = (note.boxes || []).filter(b => b.image &&
    pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h);
  return hits.length ? hits[hits.length - 1].id : "";
}

// anotações presas a estas caixas, com a geometria de partida guardada (o
// modelo pode mudar debaixo dos pés durante um arrasto)
function noteBoundDraw(note, boxIds) {
  const set = new Set((boxIds || []).filter(Boolean));
  const strokes = set.size ? (note.strokes || []).filter(s => s.box && set.has(s.box)) : [];
  const shapes = set.size ? (note.shapes || []).filter(s => s.box && set.has(s.box)) : [];
  return {
    strokes, shapes,
    strokeBase: strokes.map(s => (s.points || []).map(p => ({ x: p.x, y: p.y }))),
    shapeBase: shapes.map(s => ({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 })),
  };
}

// escreve a geometria de uma forma num elemento SVG que já existe
function noteShapeAttrs(el, kind, x1, y1, x2, y2) {
  if (kind === "line") {
    el.setAttribute("x1", x1); el.setAttribute("y1", y1);
    el.setAttribute("x2", x2); el.setAttribute("y2", y2);
    return;
  }
  const x = Math.min(x1, x2), y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  if (kind === "rect") {
    el.setAttribute("x", x); el.setAttribute("y", y);
    el.setAttribute("width", w); el.setAttribute("height", h);
    return;
  }
  el.setAttribute("cx", x + w / 2); el.setAttribute("cy", y + h / 2);
  el.setAttribute("rx", w / 2); el.setAttribute("ry", h / 2);
}

// durante um arrasto: põe no ecrã (sem gravar) as anotações das caixas que
// estão a andar — o mesmo papel que updateLiveConnectors faz às ligações
function paintBoundDraw(bound, dx, dy) {
  bound.strokes.forEach((s, i) => {
    const el = noteDrawFind("data-sid", s.id);
    if (el) el.setAttribute("points", svgPoints(bound.strokeBase[i].map(p => ({ x: p.x + dx, y: p.y + dy }))));
  });
  bound.shapes.forEach((s, i) => {
    const el = noteDrawFind("data-shid", s.id);
    if (!el) return;
    const b = bound.shapeBase[i];
    noteShapeAttrs(el, s.kind, b.x1 + dx, b.y1 + dy, b.x2 + dx, b.y2 + dy);
  });
}

// fim do arrasto: o modelo local acompanha o desvio (o servidor faz o mesmo do
// seu lado, ao gravar o movimento das caixas)
function shiftBoundDraw(bound, dx, dy) {
  if (!dx && !dy) return;
  bound.strokes.forEach((s, i) => {
    s.points = bound.strokeBase[i].map(p => ({ x: p.x + dx, y: p.y + dy }));
  });
  bound.shapes.forEach((s, i) => {
    const b = bound.shapeBase[i];
    s.x1 = b.x1 + dx; s.y1 = b.y1 + dy;
    s.x2 = b.x2 + dx; s.y2 = b.y2 + dy;
  });
}

function noteStrokeSvg(s) {
  const sel = drawSelHas("stroke", s.id) ? " sel" : "";
  return `<polyline class="noteStroke c-${esc(s.color)}${sel}" data-sid="${esc(s.id)}"
    points="${esc(svgPoints(s.points))}" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function noteShapeSvg(s) {
  const sel = drawSelHas("shape", s.id) ? " sel" : "";
  const cls = `noteShape c-${esc(s.color)}${sel}`;
  if (s.kind === "line")
    return `<line class="${cls}" data-shid="${esc(s.id)}" x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke-width="3"/>`;
  const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2);
  const w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1);
  if (s.kind === "rect")
    return `<rect class="${cls}" data-shid="${esc(s.id)}" x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke-width="3"/>`;
  return `<ellipse class="${cls}" data-shid="${esc(s.id)}" cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="none" stroke-width="3"/>`;
}

// ponto na borda do retângulo mais próximo do centro do OUTRO extremo da
// ligação — assim a linha nasce/acaba na moldura da caixa, não no meio dela
function noteBorderPoint(rect, towardX, towardY) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const dx = towardX - cx, dy = towardY - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const hw = rect.w / 2, hh = rect.h / 2;
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function noteConnectorEndpoints(fromRect, toRect) {
  const fromCenter = { x: fromRect.x + fromRect.w / 2, y: fromRect.y + fromRect.h / 2 };
  const toCenter = { x: toRect.x + toRect.w / 2, y: toRect.y + toRect.h / 2 };
  return {
    a: noteBorderPoint(fromRect, toCenter.x, toCenter.y),
    b: noteBorderPoint(toRect, fromCenter.x, fromCenter.y),
  };
}

function noteConnectorMid(pts) {
  return { x: (pts.a.x + pts.b.x) / 2, y: (pts.a.y + pts.b.y) / 2 };
}

// ligação entre duas caixas: linha de borda a borda, refeita sempre que as
// caixas mudam de sítio. No meio da linha pode estar o nome da ligação (duplo
// clique para o escrever) e, quando a ligação está selecionada, o ✕ que a
// desfaz — o nome fica por cima da linha e o ✕ por baixo, nunca em cima um do
// outro
function noteConnectorSvg(note, c) {
  const a = note.boxes.find(b => b.id === c.from);
  const b = note.boxes.find(b => b.id === c.to);
  if (!a || !b) return "";
  const sel = drawSelHas("connector", c.id);
  const pts = noteConnectorEndpoints(a, b);
  const mid = noteConnectorMid(pts);
  const label = c.label
    ? `<text class="noteConnLabel" data-clabel="${esc(c.id)}"
        x="${mid.x}" y="${mid.y - NOTE_CONN_LABEL_DY}">${esc(c.label)}<title>${esc(t("t_conn_label"))}</title></text>`
    : "";
  return `<line class="noteConnector c-${esc(c.color)}${sel ? " sel" : ""}" data-cid="${esc(c.id)}"
    x1="${pts.a.x}" y1="${pts.a.y}" x2="${pts.b.x}" y2="${pts.b.y}" stroke-width="2"><title>${esc(t("t_connector"))}</title></line>` +
    label +
    `<g class="noteConnDel${sel ? " on" : ""}" data-cdel="${esc(c.id)}"
      transform="translate(${mid.x},${mid.y + NOTE_CONN_DEL_DY})">
      <circle class="noteConnDelBg" cx="0" cy="0" r="9"/>
      <text class="noteConnDelX" x="0" y="0">✕</text>
      <title>${esc(t("t_conn_del"))}</title>
    </g>`;
}

// durante um arrasto: reposiciona no ecrã (sem gravar) as ligações que tocam
// nalguma caixa que esteja a mover-se — `overrides` dá a posição já em curso
// dessas caixas (as outras usam a posição estática do modelo)
function updateLiveConnectors(note, overrides) {
  const layer = $("noteDrawLayer");
  if (!layer) return;
  for (const c of note.connectors || []) {
    if (!overrides[c.from] && !overrides[c.to]) continue;
    const fromRect = overrides[c.from] || note.boxes.find(b => b.id === c.from);
    const toRect = overrides[c.to] || note.boxes.find(b => b.id === c.to);
    if (!fromRect || !toRect) continue;
    const el = layer.querySelector(`[data-cid="${CSS.escape(c.id)}"]`);
    if (!el) continue;
    const pts = noteConnectorEndpoints(fromRect, toRect);
    el.setAttribute("x1", pts.a.x); el.setAttribute("y1", pts.a.y);
    el.setAttribute("x2", pts.b.x); el.setAttribute("y2", pts.b.y);
    // o nome e o ✕ vivem no meio da linha: acompanham-na no mesmo instante
    const mid = noteConnectorMid(pts);
    const labelEl = layer.querySelector(`[data-clabel="${CSS.escape(c.id)}"]`);
    if (labelEl) {
      labelEl.setAttribute("x", mid.x);
      labelEl.setAttribute("y", mid.y - NOTE_CONN_LABEL_DY);
    }
    const delEl = layer.querySelector(`[data-cdel="${CSS.escape(c.id)}"]`);
    if (delEl) delEl.setAttribute("transform", `translate(${mid.x},${mid.y + NOTE_CONN_DEL_DY})`);
  }
}

// camada de baixo: ligações e desenhos soltos (sem caixa) — como sempre
function noteDrawSvgBack(note) {
  return (note.connectors || []).map(c => noteConnectorSvg(note, c)).join("") +
    (note.strokes || []).filter(s => !s.box).map(noteStrokeSvg).join("") +
    (note.shapes || []).filter(s => !s.box).map(noteShapeSvg).join("");
}

// camada de cima: só as anotações presas a uma caixa (ficam à vista por cima da
// imagem que anotam)
function noteDrawSvgFront(note) {
  return (note.strokes || []).filter(s => s.box).map(noteStrokeSvg).join("") +
    (note.shapes || []).filter(s => s.box).map(noteShapeSvg).join("");
}

// O quadro fica com a altura que sobra até ao fundo da página: a barra de
// separadores flutua no rodapé e o fundo do quadro não pode ficar por baixo
// dela (a folga é o mesmo padding que a .wrap já reserva).
function fitNoteCanvas() {
  const canvas = $("noteCanvas");
  if (canvas.classList.contains("hidden") || !canvas.offsetParent) return;
  // no ecrã dividido a altura vem do CSS das faixas
  if (document.body.classList.contains("split")) { canvas.style.height = ""; return; }
  if (noteFull) {
    const top = canvas.getBoundingClientRect().top;
    canvas.style.height = `${Math.max(320, Math.floor(window.innerHeight - top - 8))}px`;
    return;
  }
  const wrap = canvas.closest(".wrap");
  const gap = (wrap && parseFloat(getComputedStyle(wrap).paddingBottom)) || 92;
  const top = canvas.getBoundingClientRect().top + window.scrollY;
  canvas.style.height = `${Math.max(320, Math.floor(window.innerHeight - top - gap))}px`;
}

window.addEventListener("resize", fitNoteCanvas);

function renderNoteBoard(focusBoxId) {
  const note = currentNote();
  const has = !!note;
  $("notesHead").classList.toggle("hidden", !has);
  $("noteCanvas").classList.toggle("hidden", !has);
  $("noteEmpty").classList.toggle("hidden", has);
  renderNoteUndoBtn();
  if (!has) return;
  if (document.activeElement !== $("notePathInput")) $("notePathInput").value = notePathString(note);
  renderNoteLink(note);
  fitNoteCanvas();
  if (noteTyping && !focusBoxId) return;   // a escrever: não mexer nas caixas
  // o quadro vai ser refeito: a caixa que estava a ser escrita (se não for a
  // que vai ficar com o cursor) volta ao texto formatado — a gravação que
  // estiver pendente lê o campo antigo, que continua a ter o texto
  if (noteEditBox && noteEditBox !== focusBoxId) noteEditBox = "";
  const canvas = $("noteCanvas");
  const scroll = { left: canvas.scrollLeft, top: canvas.scrollTop };
  canvas.innerHTML = `<div class="noteZoomSizer" id="noteZoomSizer"><div class="noteSurface" id="noteSurface"
      style="width:${NOTE_BOARD}px;height:${NOTE_BOARD}px">` +
    `<svg class="noteDrawLayer" id="noteDrawLayer" width="${NOTE_BOARD}" height="${NOTE_BOARD}">${noteDrawSvgBack(note)}</svg>` +
    (note.frames || []).map(noteFrameHtml).join("") +
    `<div class="noteCanvasHint" id="noteCanvasHint">${note.boxes.length ? "" : esc(t("note_canvas_hint"))}</div>` +
    note.boxes.map(noteBoxHtml).join("") +
    // depois das caixas: as anotações presas a uma caixa (e o que se está a
    // desenhar agora) ficam por cima delas
    `<svg class="noteDrawLayer noteDrawTop" id="noteDrawTop" width="${NOTE_BOARD}" height="${NOTE_BOARD}">${noteDrawSvgFront(note)}</svg>` +
    `</div></div>`;
  applyNoteZoom();
  canvas.scrollLeft = scroll.left;
  canvas.scrollTop = scroll.top;
  if (focusBoxId) startNoteEdit(focusBoxId);
}

// ---------- escrever numa caixa ----------
// a caixa em escrita a que um alvo (o que recebeu a tecla, o clique…) pertence:
// a vista, que é quem tem o cursor, e o campo escondido, que tem o texto
function noteEditPair(target) {
  const view = target && target.closest ? target.closest("[data-bview]") : null;
  if (!view || !view.isContentEditable) return null;
  const box = view.closest(".noteBox");
  const area = box && box.querySelector("[data-btext]");
  return area ? { view, area } : null;
}

function noteViewOf(area) {
  const box = area && area.closest ? area.closest(".noteBox") : null;
  const view = box && box.querySelector("[data-bview]");
  return view && view.isContentEditable ? view : null;
}

// a FORMA da vista: as etiquetas sem o texto e sem os índices. Quando alguém
// escreve, o texto já está no DOM: só se a forma mudar (nasceu uma tabela,
// fechou-se um negrito, entrou uma linha) é que a vista tem de ser refeita —
// e assim o cursor (e um espaço ainda por acabar) ficam quietos.
function noteViewShape(html) {
  return String(html)
    .replace(/ data-(at|pad|pre|post|sep)="[^"]*"/g, "")
    .replace(/>[^<]*</g, "><")
    .replace(/^[^<]*/, "")
    .replace(/[^<]*$/, "");
}

// os índices do texto original nas etiquetas da vista mudam a cada letra
// escrita: quando a vista não é refeita, são só eles que se acertam
function noteViewSyncAt(view, html) {
  const next = document.createElement("div");
  next.innerHTML = html;
  const from = next.querySelectorAll("[data-at]"), to = view.querySelectorAll("[data-at]");
  if (from.length !== to.length) return;
  from.forEach((cell, i) => {
    to[i].dataset.at = cell.dataset.at;
    to[i].dataset.pad = cell.dataset.pad || "0,0";
  });
  const rowsFrom = next.querySelectorAll("tr"), rowsTo = view.querySelectorAll("tr");
  if (rowsFrom.length === rowsTo.length) {
    rowsFrom.forEach((tr, i) => {
      rowsTo[i].dataset.pre = tr.dataset.pre || "|";
      rowsTo[i].dataset.post = tr.dataset.post || "|";
    });
  }
}

// a vista passa a mostrar o texto do campo, com o cursor onde o campo o tem
// (é o caminho de tudo o que mexe no texto por fora: B/S, Tab, Enter, tabela,
// Ctrl+Z)
function noteSyncView(area, from, to) {
  const view = noteViewOf(area);
  if (!view) return;
  // a vista é sempre refeita: esta alteração não veio de lá (foi o B, o Tab, o
  // Enter…), por isso o que está no DOM ainda não a conhece
  view.innerHTML = noteBoxViewHtml(area.value, true);
  noteViewPlace(view, area.value,
    from == null ? area.selectionStart : from, to == null ? area.selectionEnd : to);
}

// escreveu-se na vista: o texto da caixa é o que a vista mostra
function noteViewEdited(view) {
  const box = view.closest(".noteBox");
  const area = box && box.querySelector("[data-btext]");
  if (!area) return;
  const text = noteViewText(view);
  if (text === area.value) return;
  const sel = noteViewSel(view, text);
  noteHistEdit(area.value, area.selectionStart);
  noteSetAreaText(area, text, sel ? sel.start : text.length, sel ? sel.end : text.length);
  if (view.dataset.composing) return;   // a compor um acento: não mexer no DOM
  const html = noteBoxViewHtml(text, true);
  if (noteViewShape(html) === noteViewShape(view.innerHTML)) { noteViewSyncAt(view, html); return; }
  view.innerHTML = html;
  noteViewPlace(view, text, area.selectionStart, area.selectionEnd);
}

// o campo escondido fica com este texto (e é ele que dispara a gravação)
function noteSetAreaText(area, text, from, to) {
  area.value = text;
  try { area.setSelectionRange(from, to); } catch (err) { /* campo escondido */ }
  area.dispatchEvent(new Event("input", { bubbles: true }));
}

// ---------- Ctrl+Z dentro de uma caixa ----------
// O Ctrl+Z do browser não serve aqui: a vista é refeita de cada vez que a forma
// do texto muda, e o histórico dele fica a apontar para coisas que já não
// existem. Guarda-se o texto por escrita seguida — parar de escrever fecha um
// passo, como em qualquer editor.
const NOTE_HIST_GAP = 600;
let noteHist = null;   // { box, undo: [{text, at}], redo: [], stamp }

function noteHistOpen(boxId) {
  noteHist = { box: boxId, undo: [], redo: [], stamp: 0 };
}

// `alone`: esta alteração é um passo só dela (uma tabela inserida, um Tab, um
// B/S) — não se junta ao que se estava a escrever, nem o seguinte se lhe junta
function noteHistEdit(prevText, prevAt, alone) {
  if (!noteHist) return;
  const now = Date.now();
  if (alone || now - noteHist.stamp >= NOTE_HIST_GAP) noteHist.undo.push({ text: prevText, at: prevAt });
  noteHist.stamp = alone ? 0 : now;
  noteHist.redo.length = 0;
}

function noteHistStep(area, back) {
  if (!noteHist) return false;
  const from = back ? noteHist.undo : noteHist.redo;
  if (!from.length) return false;
  const to = back ? noteHist.redo : noteHist.undo;
  to.push({ text: area.value, at: area.selectionStart });
  const step = from.pop();
  noteHist.stamp = 0;   // o passo seguinte não se junta a este
  noteSetAreaText(area, step.text, step.at, step.at);
  noteSyncView(area, step.at, step.at);
  return true;
}

// `caretAt` é um índice no texto original (o que noteViewRawIndex devolve);
// sem ele o cursor vai para o fim
function startNoteEdit(boxId, caretAt) {
  const boxEl = $("noteCanvas").querySelector(`[data-bid="${CSS.escape(boxId)}"]`);
  if (!boxEl) return null;
  const area = boxEl.querySelector("[data-btext]");
  const view = boxEl.querySelector("[data-bview]");
  if (!area || !view) return null;
  noteEditBox = boxId;
  boxEl.classList.add("editing");
  view.contentEditable = "true";
  noteHistOpen(boxId);
  const at = caretAt == null || caretAt < 0 ? area.value.length : Math.min(caretAt, area.value.length);
  area.setSelectionRange(at, at);
  view.innerHTML = noteBoxViewHtml(area.value, true);
  view.focus();
  noteViewPlace(view, area.value, at, at);
  return area;
}

// sair da escrita: a vista deixa de receber texto e volta ao normal (sem
// refazer o quadro todo — o resto pode estar a ser arrastado ou escrito)
function endNoteEdit(view) {
  const boxEl = view.closest(".noteBox");
  const area = boxEl && boxEl.querySelector("[data-btext]");
  view.contentEditable = "false";
  view.innerHTML = noteBoxViewHtml(area ? area.value : noteViewText(view));
  if (boxEl) boxEl.classList.remove("editing");
  if (area && noteEditBox === area.dataset.btext) noteEditBox = "";
  if (noteHist && (!area || noteHist.box === area.dataset.btext)) noteHist = null;
}

function noteRefLabel(ref) {
  return ref.label || ref.fn || ref.ccr || ref.todo_id || "";
}

/* Índice das notas ligadas a linhas do Excel: "função␟o que fazer" -> notas.
   O pino de cada linha (taskNoteFlagHtml) é montado no desenho da tabela, uma
   vez por linha: percorrer as notas todas de cada vez seriam até 500 notas ×
   20 ligações por linha desenhada. O índice é refeito quando o `notepad` muda
   de objeto — e ele só é substituído inteiro (loadNotepad/postNotepad), nunca
   remendado por dentro, por isso comparar a referência basta para o índice
   nunca ficar desatualizado. */
let _taskNoteIndex = null;
let _taskNoteIndexOf = null;   // a lista de notas de que este índice foi feito

// o separador tem de ser um caractere que nunca apareca no texto da folha:
// sem ele, ("ab", "c") e ("a", "bc") davam a mesma chave e o pino aparecia
// na linha errada. Escrito com a sequencia de escape, e nao com o
// proprio caractere invisivel, para se conseguir ler o codigo.
const taskNoteKey = (fn, todo) => `${fn}\u001F${todo || ""}`;

function taskNoteIndex() {
  const notas = notepad.notes || [];
  if (_taskNoteIndex && _taskNoteIndexOf === notas) return _taskNoteIndex;
  const index = new Map();
  notas.forEach(n => {
    (n.refs || []).forEach(r => {
      if (r.kind !== "task" || !r.fn) return;
      const chave = taskNoteKey(r.fn, r.todo);
      const lista = index.get(chave);
      // a mesma nota pode estar ligada duas vezes à mesma linha: conta uma
      if (lista) {
        if (!lista.includes(n)) lista.push(n);
      } else {
        index.set(chave, [n]);
      }
    });
  });
  _taskNoteIndex = index;
  _taskNoteIndexOf = notas;
  return index;
}

function notesForTask(fn, todo) {
  return taskNoteIndex().get(taskNoteKey(fn, todo)) || [];
}

function notesForCcr(ccrId) {
  return notepad.notes.filter(n => (n.refs || []).some(r => r.kind === "ccr" && r.ccr === ccrId));
}

// pino para o quadro de Notas ligado a uma linha do Excel, ao lado do nome da
// tarefa — o mesmo que as CCRs (ccrs.js) e os itens Por fazer (todo.js) já
// tinham. A ligação nota → tarefa existia só num sentido: quem estava na nota
// via a tarefa, mas quem estava na tarefa não sabia que havia uma nota.
// Com mais de uma nota ligada, o pino leva a contagem e abre a primeira.
function taskNoteFlagHtml(meta) {
  const fn = (meta && meta.fn) || "";
  if (!fn) return "";
  const todo = (meta && meta.todo) || "";
  const ligadas = notesForTask(fn, todo);
  if (!ligadas.length) return "";
  const titulo = ligadas.length > 1
    ? `${t("t_open_linked_note")} (${ligadas.length})`
    : t("t_open_linked_note");
  return `<button type="button" class="taskNoteFlag" data-tasklink-fn="${esc(fn)}" ` +
    `data-tasklink-todo="${esc(todo)}" title="${esc(titulo)}">📌${ligadas.length > 1
      ? `<span class="taskNoteCount">${ligadas.length}</span>` : ""}</button>`;
}

function notesForTodo(todoId) {
  return notepad.notes.filter(n => (n.refs || []).some(r => r.kind === "todo" && r.todo_id === todoId));
}

// IMPORTANTE: não chamar a estas funções openTaskNote/openCcrNote — o ccrs.js já
// tem uma função openCcrNote sem relação com isto (editar a nota livre da CCR).
function openTaskLinkedNote(fn, todo) {
  const note = notesForTask(fn, todo)[0];
  if (!note) return;
  setItemBoxOpen(false);
  setCurrentNote(note.id);
  showView("notes");
}

function openCcrLinkedNote(ccrId) {
  const note = notesForCcr(ccrId)[0];
  if (!note) return;
  setItemBoxOpen(false);
  setCurrentNote(note.id);
  showView("notes");
}

function openTodoLinkedNote(todoId) {
  const note = notesForTodo(todoId)[0];
  if (!note) return;
  setItemBoxOpen(false);
  setCurrentNote(note.id);
  showView("notes");
}

function renderNoteLink(note) {
  const refs = note.refs || [];
  $("noteLinkChips").innerHTML = refs.map((ref, i) => `<span class="noteLinkChip">
      <button type="button" class="noteLinkName" data-nogo="${i}"
        title="${esc(t("t_note_open_task"))}">📌 ${esc(noteRefLabel(ref))}</button>
      <button type="button" data-nounlink="${i}" title="${esc(t("note_unlink"))}">✕</button>
    </span>`).join("");
}

function renderNotes(focusBoxId) {
  renderNoteTree();
  renderNoteBoard(focusBoxId);
  applyNoteSolo();   // numa janela dedicada: o nome da nota no título
}

// ids de todas as subpastas (direta ou indiretamente) dentro de `id`
function folderDescendantIds(id) {
  const out = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const f of notepad.folders) {
      if (f.parent === cur) { out.push(f.id); stack.push(f.id); }
    }
  }
  return out;
}

// quantas subpastas e notas (em toda a subárvore) ficam dentro de uma pasta
function folderSubtreeCounts(id) {
  const ids = folderDescendantIds(id);
  const all = new Set([id, ...ids]);
  const notes = notepad.notes.filter(n => all.has(n.folder)).length;
  return { subfolders: ids.length, notes };
}

// ---------- criar/apagar notas e pastas ----------
$("noteAdd").addEventListener("click", async () => {
  const note = currentNote();
  const out = await postNotepad({
    action: "add_note", title: t("note_new"), folder: note ? note.folder : "",
  });
  if (out) setCurrentNote((out.notepad.notes[out.notepad.notes.length - 1] || {}).id);
});

$("folderAdd").addEventListener("click", async () => {
  const name = prompt(t("note_ask_folder"), t("note_folder_new"));
  if (name === null || !name.trim()) return;
  await postNotepad({ action: "add_folder", name: name.trim() });
});

$("noteFilter").addEventListener("input", renderNoteTree);

$("noteTree").addEventListener("click", async e => {
  const open = e.target.closest("[data-nopen]");
  if (open) { setCurrentNote(open.dataset.nopen); return; }
  const tog = e.target.closest("[data-ftog]");
  if (tog) {
    const id = tog.dataset.ftog;
    noteShut.has(id) ? noteShut.delete(id) : noteShut.add(id);
    localStorage.setItem("bsp-tracker-note-shut", JSON.stringify([...noteShut]));
    renderNoteTree();
    return;
  }
  const add = e.target.closest("[data-fadd]");
  if (add) {
    const out = await postNotepad({ action: "add_note", title: t("note_new"), folder: add.dataset.fadd });
    if (out) setCurrentNote((out.notepad.notes[out.notepad.notes.length - 1] || {}).id);
    return;
  }
  const ren = e.target.closest("[data-frename]");
  if (ren) {
    const folder = notepad.folders.find(f => f.id === ren.dataset.frename);
    if (!folder) return;
    const name = prompt(t("note_ask_folder"), folder.name);
    if (name === null || !name.trim()) return;
    await postNotepad({ action: "rename_folder", id: folder.id, name: name.trim() });
    return;
  }
  const npop = e.target.closest("[data-npop]");
  if (npop) {
    openNoteWindow(npop.dataset.npop);
    return;
  }
  const ndup = e.target.closest("[data-ndup]");
  if (ndup) {
    await duplicateNoteById(notepad.notes.find(n => n.id === ndup.dataset.ndup));
    return;
  }
  const ndel = e.target.closest("[data-ndel]");
  if (ndel) {
    deleteNoteById(notepad.notes.find(n => n.id === ndel.dataset.ndel));
    return;
  }
  const del = e.target.closest("[data-fdel]");
  if (del) {
    const folder = notepad.folders.find(f => f.id === del.dataset.fdel);
    if (!folder) return;
    const { subfolders, notes: noteCount } = folderSubtreeCounts(folder.id);
    if (!subfolders && !noteCount) {
      if (confirm(tf("cfm_del_folder", folder.name))) await postNotepad({ action: "delete_folder", id: folder.id });
      return;
    }
    if (confirm(tf("cfm_del_folder_recursive", folder.name, noteCount, subfolders))) {
      await postNotepad({ action: "delete_folder", id: folder.id, recursive: true });
      return;
    }
    if (confirm(tf("cfm_del_folder", folder.name))) await postNotepad({ action: "delete_folder", id: folder.id });
  }
});

// ---------- arrastar na árvore: mover notas/pastas ----------
let noteDrag = null;   // { type: "note"|"folder", id }

function noteDropTarget(el) {
  if (el.closest("[data-frootdrop]")) return "";
  const folder = el.closest("[data-fid]");
  return folder ? folder.dataset.fid : null;   // null = não é uma zona de largar válida
}

$("noteTree").addEventListener("dragstart", e => {
  const noteEl = e.target.closest("[data-nid]");
  if (noteEl) {
    if (e.target.closest(".noteMini")) { e.preventDefault(); return; }   // ⧉ e ✕ : não arrastar
    noteDrag = { type: "note", id: noteEl.dataset.nid };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", noteEl.dataset.nid);
    return;
  }
  const folderEl = e.target.closest("[data-fid]");
  if (folderEl) {
    if (e.target.closest("button")) { e.preventDefault(); return; }   // ▾ + ✕ : não arrastar
    noteDrag = { type: "folder", id: folderEl.dataset.fid };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", folderEl.dataset.fid);
    return;
  }
  e.preventDefault();
});

$("noteTree").addEventListener("dragover", e => {
  if (!noteDrag) return;
  const target = noteDropTarget(e.target);
  if (target === null) return;
  if (noteDrag.type === "folder" && target === noteDrag.id) return;
  e.preventDefault();
  $("noteTree").querySelectorAll(".dragOver").forEach(el => el.classList.remove("dragOver"));
  const zone = e.target.closest("[data-frootdrop]") || e.target.closest("[data-fid]");
  if (zone) zone.classList.add("dragOver");
});

$("noteTree").addEventListener("dragleave", e => {
  const el = e.target.closest(".dragOver");
  if (el && !el.contains(e.relatedTarget)) el.classList.remove("dragOver");
});

$("noteTree").addEventListener("drop", async e => {
  const target = noteDropTarget(e.target);
  $("noteTree").querySelectorAll(".dragOver").forEach(el => el.classList.remove("dragOver"));
  if (!noteDrag || target === null) { noteDrag = null; return; }
  e.preventDefault();
  const drag = noteDrag;
  noteDrag = null;
  if (drag.type === "note") {
    await postNotepad({ action: "move_note", id: drag.id, folder: target });
  } else if (target !== drag.id) {
    await postNotepad({ action: "move_folder", id: drag.id, parent: target });
  }
});

$("noteTree").addEventListener("dragend", () => {
  noteDrag = null;
  $("noteTree").querySelectorAll(".dragOver").forEach(el => el.classList.remove("dragOver"));
});

$("notePathInput").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); $("notePathInput").blur(); }
});

$("notePathInput").addEventListener("change", () => commitNotePath($("notePathInput").value));

// copiar a nota inteira: caixas, desenhos, ligações, grupos e printscreens (o
// servidor duplica os ficheiros das imagens, para as duas notas ficarem
// independentes). A cópia fica logo a seguir à original e passa a ser a nota
// aberta.
async function duplicateNoteById(note) {
  if (!note) return;
  const out = await postNotepad({
    action: "duplicate_note", id: note.id, title: tf("note_copy_title", note.title),
  });
  if (!out) return;
  const twin = out.notepad.new_note;
  toast(tf("note_duplicated", (noteById(twin) || {}).title || note.title), "ok");
  if (twin) setCurrentNote(twin);
}

async function deleteNoteById(note) {
  if (!note || !confirm(tf("cfm_del_note", note.title))) return;
  const out = await postNotepad({ action: "delete_note", id: note.id });
  if (!out) return;
  noteUndo.delete(note.id);   // a nota já não existe: histórico fora
  noteRedo.delete(note.id);
  if (note.id === noteId) setCurrentNote((out.notepad.notes[0] || {}).id);
}

$("noteDel").addEventListener("click", () => deleteNoteById(currentNote()));

// ---------- ligação a uma tarefa ----------
$("notesHead").addEventListener("click", e => {
  const note = currentNote();
  if (!note) return;
  const go = e.target.closest("[data-nogo]");
  if (go) {
    const ref = (note.refs || [])[+go.dataset.nogo];
    if (!ref) return;
    revealSource(ref.kind === "ccr" ? { view: "ccrs", ccr: ref.ccr }
      : ref.kind === "todo" ? { view: "todo", todoId: ref.todo_id }
        : { view: "excel", fn: ref.fn, todo: ref.todo || "", sheet: ref.sheet || "" });
    return;
  }
  const un = e.target.closest("[data-nounlink]");
  if (!un) return;
  const ref = (note.refs || [])[+un.dataset.nounlink];
  if (!ref) return;
  postNotepad({ action: "remove_link", id: note.id, ref }).then(() => { render(); renderCCRs(); renderTodo(); });
});

function noteLinkOptions() {
  // itens da lista TODO -- ligar uma nota a uma tarefa do Excel deixou de
  // ser possivel diretamente (a vista resumida do tracker foi removida);
  // liga-se antes ao item do TODO correspondente, se existir
  return todos.map(it => ({
    kind: "todo", todoId: it.id, label: it.title, sub: t("note_link_todo_sub"),
  }));
}

let noteLinkRows = [];

function renderNoteLinkList() {
  const all = noteLinkOptions();
  const q = norm($("noteLinkSearch").value || "");
  noteLinkRows = all.filter(o => !q || norm(o.label + " " + o.sub).includes(q)).slice(0, 200);
  const excelReady = !!(lastData && !lastData.error && lastData.headers);
  $("noteLinkBody").innerHTML = noteLinkRows.length
    ? noteLinkRows.map((o, i) => `<button type="button" class="pickRow" data-nlink="${i}">
        <span class="pickIcon">${o.kind === "todo" ? "✓" : "▤"}</span>
        <span class="pickName">${esc(o.label)}<span class="pickSub">${esc(o.sub)}</span></span></button>`).join("")
    : `<div class="noteTreeEmpty">${esc(t(all.length ? "none_search" : excelReady ? "note_no_tasks" : "note_no_excel"))}</div>`;
}

function setNoteLinkOpen(open) {
  $("noteLinkOverlay").classList.toggle("hidden", !open);
  if (!open) return;
  $("noteLinkSearch").value = "";
  renderNoteLinkList();
  $("noteLinkSearch").focus();
}

$("noteLinkBtn").addEventListener("click", () => { if (currentNote()) setNoteLinkOpen(true); });
$("noteLinkClose").addEventListener("click", () => setNoteLinkOpen(false));
$("noteLinkSearch").addEventListener("input", renderNoteLinkList);

$("noteLinkOverlay").addEventListener("click", e => {
  if (e.target === $("noteLinkOverlay")) { setNoteLinkOpen(false); return; }
  const row = e.target.closest("[data-nlink]");
  const note = currentNote();
  if (!row || !note) return;
  const opt = noteLinkRows[+row.dataset.nlink];
  if (!opt) return;
  setNoteLinkOpen(false);
  const ref = opt.kind === "todo"
    ? { kind: "todo", todo_id: opt.todoId, label: opt.label }
    : { kind: "task", sheet: (lastData && lastData.sheet) || "", fn: opt.fn, todo: opt.todo, label: opt.label };
  postNotepad({ action: "add_link", id: note.id, ref })
    .then(() => { render(); renderCCRs(); renderTodo(); });
});

// em captura: com esta janela aberta o Esc fecha-a e mais nada (o ecrã
// dividido tem o seu próprio tratador de Esc, registado antes deste)
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || $("noteLinkOverlay").classList.contains("hidden")) return;
  e.stopImmediatePropagation();
  setNoteLinkOpen(false);
}, true);

// ---------- caixas: criar com o rato ----------
function canvasPoint(e) {
  const canvas = $("noteCanvas");
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(NOTE_BOARD, (e.clientX - rect.left + canvas.scrollLeft) / noteZoom)),
    y: Math.max(0, Math.min(NOTE_BOARD, (e.clientY - rect.top + canvas.scrollTop) / noteZoom)),
  };
}

// ---------- zoom do quadro ----------
// o quadro lógico continua a ser sempre 4000x4000 (coordenadas das caixas
// não mudam); só a "lupa" (noteSurface) e o espaço com que se pode dar
// scroll (noteZoomSizer) é que crescem/encolhem visualmente
function applyNoteZoom() {
  const sizer = $("noteZoomSizer");
  const surface = $("noteSurface");
  if (!sizer || !surface) return;
  sizer.style.width = (NOTE_BOARD * noteZoom) + "px";
  sizer.style.height = (NOTE_BOARD * noteZoom) + "px";
  surface.style.transform = `scale(${noteZoom})`;
  const label = $("noteZoomLabel");
  if (label) label.textContent = Math.round(noteZoom * 100) + "%";
}

// muda o zoom mantendo fixo, debaixo do cursor (ou do centro do que está
// visível, sem cursor), o mesmo ponto do quadro que lá estava antes
function setNoteZoom(next, anchorClientX, anchorClientY) {
  const canvas = $("noteCanvas");
  if (!canvas || canvas.classList.contains("hidden")) return;
  const clamped = Math.min(NOTE_ZOOM_MAX, Math.max(NOTE_ZOOM_MIN, Math.round(next * 100) / 100));
  if (clamped === noteZoom) return;
  const rect = canvas.getBoundingClientRect();
  const cx = anchorClientX != null ? anchorClientX : rect.left + rect.width / 2;
  const cy = anchorClientY != null ? anchorClientY : rect.top + rect.height / 2;
  const logicalX = (cx - rect.left + canvas.scrollLeft) / noteZoom;
  const logicalY = (cy - rect.top + canvas.scrollTop) / noteZoom;
  noteZoom = clamped;
  localStorage.setItem("bsp-tracker-note-zoom", noteZoom);
  applyNoteZoom();
  canvas.scrollLeft = logicalX * noteZoom - (cx - rect.left);
  canvas.scrollTop = logicalY * noteZoom - (cy - rect.top);
}

$("noteZoomInBtn").addEventListener("click", () => setNoteZoom(noteZoom + NOTE_ZOOM_STEP));
$("noteZoomOutBtn").addEventListener("click", () => setNoteZoom(noteZoom - NOTE_ZOOM_STEP));
$("noteZoomLabel").addEventListener("click", () => setNoteZoom(1));

// Em ecr\u00e3 inteiro a coluna das notas fica recolhida numa faixa estreita (e a
// barra de ferramentas s\u00f3 com \u00edcones) para o quadro ficar com quase toda a
// janela; pousar o rato na faixa abre a coluna por cima do quadro e o bot\u00e3o
// \u00ab/\u00bb prende-a aberta. A escolha fica guardada para a pr\u00f3xima vez.
function applyNoteRail() {
  document.body.classList.toggle("notes-rail", noteFull && noteRail);
  const btn = $("noteSideToggle");
  if (!btn) return;
  btn.textContent = noteRail ? "\u00bb" : "\u00ab";
  btn.title = t(noteRail ? "t_note_side_open" : "t_note_side_close");
}

function setNoteRail(on) {
  noteRail = !!on;
  localStorage.setItem("bsp-tracker-note-rail", noteRail ? "1" : "0");
  applyNoteRail();
  fitNoteCanvas();
}

function toggleNoteFullscreen() {
  noteFull = !noteFull;
  document.body.classList.toggle("notes-full", noteFull);
  const btn = $("noteFullscreenBtn");
  btn.querySelector(".noteToolIcon").textContent = noteFull ? "\u229F" : "\u26F6";
  btn.querySelector(".noteToolLabel").textContent = noteFull ? "Sair" : "Ecr\u00e3 inteiro";
  btn.title = noteFull ? "Sair do ecr\u00e3 inteiro (Esc)" : "Ecr\u00e3 inteiro";
  applyNoteRail();
  fitNoteCanvas();
}
$("noteFullscreenBtn").addEventListener("click", toggleNoteFullscreen);

// ---------- uma nota na sua própria janela ----------
// O ↗ abre a app noutra janela já naquela nota (`?note=<id>`, ver SOLO_NOTE em
// state.js). É a app inteira — com o quadro, as ferramentas e a gravação de
// sempre — mas sem a coluna das notas e sem o ✕ de apagar: aquela janela é
// daquela nota. Serve para ter duas notas à frente ao mesmo tempo, ou uma nota
// de lado enquanto se trabalha noutro ecrã.
function openNoteWindow(id) {
  const note = noteById(id);
  if (!note) return;
  openAppWindow(`/?note=${encodeURIComponent(id)}`, `myorg_note_${id}`);
}

// numa janela dedicada: sem coluna, sem apagar, e o nome da nota no título da
// janela (é o que a distingue na barra de tarefas do Windows)
function applyNoteSolo() {
  if (!SOLO_NOTE) return;
  document.body.classList.add("notes-solo");
  const note = currentNote();
  // a instância de desenvolvimento marca-se no título (ver renderVersionBadge
  // em tasks.js): aqui mantém-se essa marca, com o nome da nota atrás
  const dev = document.body.classList.contains("devmode") ? "DEV — " : "";
  document.title = `${dev}${note ? note.title : "My Organizer"}`;
}

// ---------- coluna das notas como gaveta (ecrã estreito) ----------
// no telemóvel a coluna empilhada por cima do quadro comia metade do ecrã: aqui
// fica fora do fluxo e abre-se pelo botão "☰" do cabeçalho
function setNoteDrawer(open) {
  document.body.classList.toggle("notes-drawer", !!open);
  const btn = $("noteSideMobile");
  if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
}

$("noteSideMobile").addEventListener("click", () => {
  setNoteDrawer(!document.body.classList.contains("notes-drawer"));
});

$("noteSideBack").addEventListener("click", () => setNoteDrawer(false));

// em captura, antes do Esc do ecrã inteiro e do das caixas
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || !document.body.classList.contains("notes-drawer")) return;
  e.stopImmediatePropagation();
  setNoteDrawer(false);
}, true);

// ---------- nova caixa sem a arrastar ----------
// a arrastar o quadro vazio o dedo move a vista (ver startCanvasPan), por isso
// no telemóvel não havia forma de criar uma caixa. Este botão põe-na no meio do
// que se está a ver, afastando-a de quem já lá esteja no mesmo sítio.
function addNoteBoxHere() {
  const note = currentNote();
  if (!note) return;
  const canvas = $("noteCanvas");
  const w = 200, h = 130;
  let x = (canvas.scrollLeft + canvas.clientWidth / 2) / noteZoom - w / 2;
  let y = (canvas.scrollTop + canvas.clientHeight / 2) / noteZoom - h / 2;
  const taken = p => note.boxes.some(b => Math.abs(b.x - p.x) < 12 && Math.abs(b.y - p.y) < 12);
  for (let i = 0; i < 12 && taken({ x, y }); i++) { x += 24; y += 24; }
  x = Math.max(0, Math.min(NOTE_BOARD - w, Math.round(x)));
  y = Math.max(0, Math.min(NOTE_BOARD - h, Math.round(y)));
  pushNoteUndo(note);
  postNotepad({ action: "add_box", id: note.id, x, y, w, h });
}

$("noteBoxAddBtn").addEventListener("click", addNoteBoxHere);

$("notePopBtn").addEventListener("click", () => openNoteWindow(noteId));

$("noteSideToggle").addEventListener("click", () => setNoteRail(!noteRail));
applyNoteRail();

// Escape em ecr\u00e3 inteiro: sai (captura antes do split.js fechar o ecr\u00e3 dividido)
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || !noteFull) return;
  e.stopImmediatePropagation();
  toggleNoteFullscreen();
}, true);

// Ctrl/Cmd+scroll no quadro dá zoom em vez de scroll (como em qualquer editor
// gráfico); scroll normal, sem modificador, continua só a mover a vista
$("noteCanvas").addEventListener("wheel", e => {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  setNoteZoom(noteZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY);
}, { passive: false });

// dois dedos no quadro: beliscar dá zoom, com o ponto entre os dedos parado
// (o `touch-action: none` tambem tira o zoom nativo, por isso é feito aqui)
const notePinch = new Map();
let notePinchFrom = null;

function notePinchSpan() {
  const [a, b] = [...notePinch.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
}

// em captura: chega antes dos tratadores que arrastam/desenham
$("noteCanvas").addEventListener("pointerdown", e => {
  if (e.pointerType !== "touch") return;
  notePinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (notePinch.size !== 2) return;
  // o segundo dedo transforma o arrasto do primeiro num zoom
  if (noteCancelPan) noteCancelPan();
  notePinchFrom = { d: notePinchSpan().d, zoom: noteZoom };
}, true);

window.addEventListener("pointermove", e => {
  if (e.pointerType !== "touch" || !notePinch.has(e.pointerId)) return;
  notePinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (notePinch.size !== 2 || !notePinchFrom || !notePinchFrom.d) return;
  const span = notePinchSpan();
  setNoteZoom(notePinchFrom.zoom * (span.d / notePinchFrom.d), span.x, span.y);
});

const noteFingerUp = e => {
  if (e.pointerType !== "touch") return;
  notePinch.delete(e.pointerId);
  if (notePinch.size < 2) notePinchFrom = null;
};
window.addEventListener("pointerup", noteFingerUp);
window.addEventListener("pointercancel", noteFingerUp);

// coluna da esquerda: arrastar a barra lateral para redimensionar
$("noteSideResize").addEventListener("pointerdown", e => {
  e.preventDefault();
  const handle = $("noteSideResize");
  handle.setPointerCapture(e.pointerId);
  handle.classList.add("dragging");
  const rect = $("notesSide").getBoundingClientRect();
  const move = ev => {
    noteSideW = Math.min(NOTE_SIDE_MAX, Math.max(NOTE_SIDE_MIN, ev.clientX - rect.left));
    document.documentElement.style.setProperty("--notes-side-w", noteSideW + "px");
  };
  const up = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", up);
    handle.removeEventListener("pointercancel", up);
    handle.classList.remove("dragging");
    localStorage.setItem("bsp-tracker-note-side-w", String(Math.round(noteSideW)));
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", up);
  handle.addEventListener("pointercancel", up);
});

// ---------- seleção (caixas + desenhos), com vários itens de cada vez ----------
function drawSelHas(type, id) {
  return noteDrawSel.some(s => s.type === type && s.id === id);
}

function drawSelAttr(type) {
  return type === "stroke" ? "data-sid" : type === "shape" ? "data-shid" : "data-cid";
}

// marca a seleção no que já está no ecrã, sem refazer o quadro
function paintNoteSel() {
  const canvas = $("noteCanvas");
  canvas.querySelectorAll(".noteBox").forEach(el =>
    el.classList.toggle("sel", noteSelBoxes.includes(el.dataset.bid)));
  const layers = noteDrawLayers();
  if (!layers.length) return;
  layers.forEach(layer => layer.querySelectorAll(".sel").forEach(el => el.classList.remove("sel")));
  for (const s of noteDrawSel) {
    const el = noteDrawFind(drawSelAttr(s.type), s.id);
    if (el) el.classList.add("sel");
  }
  // o ✕ que desfaz uma ligação só aparece na ligação escolhida
  layers.forEach(layer => layer.querySelectorAll("[data-cdel]").forEach(el =>
    el.classList.toggle("on", drawSelHas("connector", el.dataset.cdel))));
}

// clique simples numa caixa: passa a ser a única coisa selecionada
function selectBox(id) {
  noteSelBoxes = id ? [id] : [];
  noteDrawSel = [];
  paintNoteSel();
}

// Ctrl/Shift+clique: junta (ou tira) a caixa à seleção
function toggleBoxSel(id) {
  noteSelBoxes = noteSelBoxes.includes(id)
    ? noteSelBoxes.filter(x => x !== id)
    : [...noteSelBoxes, id];
  paintNoteSel();
}

function clearNoteSel() {
  noteSelBoxes = [];
  noteDrawSel = [];
  paintNoteSel();
}

function noteSelCount() {
  return noteSelBoxes.length + noteDrawSel.length;
}

// ---------- reverter / repetir (Ctrl+Z): histórico do quadro só nesta janela --
// como está o quadro agora — o que se guarda antes de lhe mexer
function noteSnapshot(note) {
  return {
    boxes: JSON.parse(JSON.stringify(note.boxes || [])),
    strokes: JSON.parse(JSON.stringify(note.strokes || [])),
    shapes: JSON.parse(JSON.stringify(note.shapes || [])),
    connectors: JSON.parse(JSON.stringify(note.connectors || [])),
    frames: JSON.parse(JSON.stringify(note.frames || [])),
  };
}

function pushNoteHist(map, id, snap) {
  const stack = map.get(id) || [];
  stack.push(snap);
  while (stack.length > NOTE_UNDO_MAX) stack.shift();
  map.set(id, stack);
}

// guarda como está o quadro ANTES de o alterar; o botão ↺ volta a esse estado
function pushNoteUndo(note) {
  const target = note || currentNote();
  if (!target) return;
  pushNoteHist(noteUndo, target.id, noteSnapshot(target));
  noteRedo.delete(target.id);   // alteração nova: já não há caminho de volta
  renderNoteUndoBtn();
}

function noteHistStack(map) {
  const note = currentNote();
  return note ? (map.get(note.id) || []) : [];
}

function renderNoteUndoBtn() {
  const undoBtn = $("noteUndoBtn");
  if (undoBtn) undoBtn.disabled = !noteHistStack(noteUndo).length;
  const redoBtn = $("noteRedoBtn");
  if (redoBtn) redoBtn.disabled = !noteHistStack(noteRedo).length;
}

// `back` (o normal): volta ao estado anterior e guarda o atual para o ↻;
// senão repete o que o ↺ tinha revertido e devolve o passo ao ↺
async function revertNote(back = true) {
  const note = currentNote();
  if (!note) return;
  const stack = (back ? noteUndo : noteRedo).get(note.id) || [];
  const snap = stack[stack.length - 1];
  if (!snap) { toast(t(back ? "note_undo_none" : "note_redo_none")); return; }
  flushNoteText();   // o texto pendente não pode gravar depois de reverter
  noteTyping = false;
  noteTextSnap = false;
  noteSelBoxes = [];
  noteDrawSel = [];
  const current = noteSnapshot(note);   // o caminho de volta deste passo
  const out = await postNotepad({ action: "restore_note", id: note.id, ...snap });
  if (out) {
    stack.pop();   // só consome o passo se a reposição foi bem sucedida
    pushNoteHist(back ? noteRedo : noteUndo, note.id, current);
  }
  renderNoteUndoBtn();
}

// o que uma área do quadro apanhou: caixas e desenhos totalmente dentro dela
// (contenção total, não só toque, para um arrasto que apenas roça outro item
// ao criar uma caixa nova não ser lido como uma seleção)
function noteItemsInRect(note, r) {
  const contains = (x, y, w, h) => x >= r.x && y >= r.y && x + w <= r.x + r.w && y + h <= r.y + r.h;
  const boxes = (note.boxes || []).filter(b => contains(b.x, b.y, b.w, b.h)).map(b => b.id);
  const draw = [];
  for (const s of note.strokes || []) {
    const pts = s.points || [];
    if (pts.length && pts.every(p => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h))
      draw.push({ type: "stroke", id: s.id });
  }
  for (const s of note.shapes || []) {
    if (contains(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2),
      Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1))) draw.push({ type: "shape", id: s.id });
  }
  for (const c of note.connectors || []) {
    const from = (note.boxes || []).find(b => b.id === c.from);
    const to = (note.boxes || []).find(b => b.id === c.to);
    if (!from || !to) continue;
    const ax = from.x + from.w / 2, ay = from.y + from.h / 2;
    const bx = to.x + to.w / 2, by = to.y + to.h / 2;
    if (contains(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)))
      draw.push({ type: "connector", id: c.id });
  }
  return { boxes, draw };
}

// dedo em cima do quadro vazio: arrastar move a vista. O quadro tem
// `touch-action: none` (senão o browser levava o gesto para o scroll e não
// sobrava nada para desenhar), por isso sem isto os 4000x4000 do quadro eram
// inalcançáveis no telemóvel. Com o rato continua a ser o retângulo de seleção.
let noteCancelPan = null;

function startCanvasPan(e) {
  const canvas = $("noteCanvas");
  const sx = e.clientX, sy = e.clientY;
  const fromL = canvas.scrollLeft, fromT = canvas.scrollTop;
  clearNoteSel();
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    noteCancelPan = null;
  };
  const move = ev => {
    canvas.scrollLeft = fromL - (ev.clientX - sx);
    canvas.scrollTop = fromT - (ev.clientY - sy);
  };
  noteCancelPan = stop;
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
}

// arrastar no espaço vazio do quadro: se a área apanhar caixas ou desenhos,
// seleciona-os; se não apanhar nada, é ali que nasce a caixa nova
// (com Ctrl/Shift a área só seleciona, juntando ao que já estava escolhido)
function startCanvasBand(e) {
  if (e.pointerType === "touch") { startCanvasPan(e); return; }
  const note = currentNote();
  if (!note) return;
  const start = canvasPoint(e);
  notePoint = start;
  const add = e.ctrlKey || e.metaKey || e.shiftKey;
  const keepBoxes = add ? [...noteSelBoxes] : [];
  const keepDraw = add ? [...noteDrawSel] : [];
  if (!add) clearNoteSel();
  const band = document.createElement("div");
  band.className = "noteRubber";
  $("noteSurface").appendChild(band);
  let last = start;

  const move = ev => {
    last = canvasPoint(ev);
    band.style.left = Math.min(start.x, last.x) + "px";
    band.style.top = Math.min(start.y, last.y) + "px";
    band.style.width = Math.abs(last.x - start.x) + "px";
    band.style.height = Math.abs(last.y - start.y) + "px";
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    band.remove();
    const w = Math.abs(last.x - start.x), h = Math.abs(last.y - start.y);
    const rect = { x: Math.min(start.x, last.x), y: Math.min(start.y, last.y), w, h };
    const found = noteTool === "select" ? noteItemsInRect(note, rect) : { boxes: [], draw: [] };
    if (add || found.boxes.length || found.draw.length) {
      noteSelBoxes = [...new Set([...keepBoxes, ...found.boxes])];
      noteDrawSel = keepDraw.concat(found.draw.filter(
        s => !keepDraw.some(k => k.type === s.type && k.id === s.id)));
      paintNoteSel();
      return;
    }
    if (w < 40 || h < 30) return;   // clique simples: não cria nada
    pushNoteUndo(note);
    postNotepad({
      action: "add_box", id: note.id, x: rect.x, y: rect.y,
      w: Math.max(NOTE_MIN_W, w), h: Math.max(NOTE_MIN_H, h),
    });
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

// ---------- desenhar: traço à mão e formas ----------
function startPenDraw(e) {
  const note = currentNote();
  if (!note) return;
  const start = canvasPoint(e);
  const pts = [start];
  // começou por cima de uma imagem: o traço fica preso a essa caixa e passa a
  // andar com ela
  const bind = noteImageBoxAt(note, start);
  const el = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  el.setAttribute("class", `noteStroke c-${noteStrokeColor}`);
  el.setAttribute("fill", "none");
  el.setAttribute("stroke-width", "3");
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
  noteDrawFrontLayer().appendChild(el);
  const paint = () => el.setAttribute("points", svgPoints(pts));
  paint();
  const move = ev => { pts.push(canvasPoint(ev)); paint(); };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    el.remove();
    if (pts.length < 2) return;   // clique simples: não cria nada
    pushNoteUndo(note);
    postNotepad({ action: "add_stroke", id: note.id, points: pts, color: noteStrokeColor, box: bind });
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function startShapeDraw(e, kind) {
  const note = currentNote();
  if (!note) return;
  const start = canvasPoint(e);
  let last = start;
  // ver startPenDraw: a começar por cima de uma imagem, a forma fica presa a
  // essa caixa
  const bind = noteImageBoxAt(note, start);
  const ns = "http://www.w3.org/2000/svg";
  const el = document.createElementNS(ns, kind === "line" ? "line" : kind === "rect" ? "rect" : "ellipse");
  el.setAttribute("class", `noteShape c-${noteStrokeColor}`);
  el.setAttribute("fill", "none");
  el.setAttribute("stroke-width", "3");
  noteDrawFrontLayer().appendChild(el);

  const paint = () => noteShapeAttrs(el, kind, start.x, start.y, last.x, last.y);
  paint();
  const move = ev => { last = canvasPoint(ev); paint(); };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    el.remove();
    if (Math.abs(last.x - start.x) < 4 && Math.abs(last.y - start.y) < 4) return;   // clique simples: não cria nada
    pushNoteUndo(note);
    postNotepad({
      action: "add_shape", id: note.id, kind,
      x1: start.x, y1: start.y, x2: last.x, y2: last.y,
      color: noteStrokeColor, box: bind,
    });
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

// borracha: arrastar por cima de um traço, forma ou ligação apaga-o; usa o
// hit-test que o próprio SVG já faz (pointer-events: visibleStroke), em vez
// de recalcular distâncias — por isso a borracha só "pega" no traço em si,
// tal como um clique normal de seleção
function startEraseDraw(e) {
  const note = currentNote();
  if (!note) return;
  const erased = new Set();
  let touched = false;
  let chain = Promise.resolve();
  const eraseAt = ev => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    if (!el) return;
    const strokeEl = el.closest("[data-sid]");
    const shapeEl = el.closest("[data-shid]");
    // o nome de uma ligação conta como parte dela: a borracha por cima do nome
    // apaga a ligação, como se tivesse passado pela linha
    const connEl = el.closest("[data-cid]") || el.closest("[data-clabel]");
    const hit = strokeEl ? { type: "stroke", id: strokeEl.dataset.sid, action: "delete_stroke", key: "stroke_id" }
      : shapeEl ? { type: "shape", id: shapeEl.dataset.shid, action: "delete_shape", key: "shape_id" }
        : connEl ? {
          type: "connector", id: connEl.dataset.cid || connEl.dataset.clabel,
          action: "delete_connector", key: "connector_id",
        } : null;
    if (!hit) return;
    const key = `${hit.type}:${hit.id}`;
    if (erased.has(key)) return;
    erased.add(key);
    if (!touched) { touched = true; pushNoteUndo(note); }
    // em fila: várias passagens rápidas da borracha não podem sobrepor-se
    // (uma resposta antiga a chegar depois reporia um traço já apagado)
    chain = chain.then(() => postNotepad({ action: hit.action, id: note.id, [hit.key]: hit.id }));
  };
  eraseAt(e);
  const move = ev => eraseAt(ev);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

// ---------- ligar caixas ----------
function highlightConnectFrom(id) {
  $("noteCanvas").querySelectorAll(".noteBox.connectFrom").forEach(el => el.classList.remove("connectFrom"));
  if (!id) return;
  const el = $("noteCanvas").querySelector(`[data-bid="${CSS.escape(id)}"]`);
  if (el) el.classList.add("connectFrom");
}

// ferramenta "ligar": 1.º clique numa caixa escolhe-a, 2.º clique noutra caixa
// cria a ligação; clicar fora ou na mesma caixa cancela
function handleConnectorClick(e) {
  const box = e.target.closest(".noteBox");
  if (!box) { noteConnectFrom = null; highlightConnectFrom(null); return; }
  const id = box.dataset.bid;
  if (!noteConnectFrom) { noteConnectFrom = id; highlightConnectFrom(id); return; }
  if (noteConnectFrom === id) { noteConnectFrom = null; highlightConnectFrom(null); return; }
  const note = currentNote();
  const from = noteConnectFrom;
  noteConnectFrom = null;
  highlightConnectFrom(null);
  if (!note) return;
  pushNoteUndo(note);
  postNotepad({ action: "add_connector", id: note.id, from, to: id, color: noteStrokeColor });
}

// ---------- grupos ----------
function startFrameCreate(e) {
  const note = currentNote();
  if (!note) return;
  const start = canvasPoint(e);
  const band = document.createElement("div");
  band.className = "noteRubber";
  $("noteSurface").appendChild(band);
  let last = start;
  const move = ev => {
    last = canvasPoint(ev);
    band.style.left = Math.min(start.x, last.x) + "px";
    band.style.top = Math.min(start.y, last.y) + "px";
    band.style.width = Math.abs(last.x - start.x) + "px";
    band.style.height = Math.abs(last.y - start.y) + "px";
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    band.remove();
    const w = Math.abs(last.x - start.x), h = Math.abs(last.y - start.y);
    if (w < 60 || h < 60) return;   // clique simples: não cria nada
    pushNoteUndo(note);
    postNotepad({
      action: "add_frame", id: note.id,
      x: Math.min(start.x, last.x), y: Math.min(start.y, last.y),
      w: Math.max(NOTE_MIN_W, w), h: Math.max(NOTE_MIN_H, h), name: t("note_frame_new"),
    });
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

// arrastar a barra move a moldura e todas as caixas que estejam completamente
// dentro dela (calculado uma vez no início do arrasto); qualquer um dos 4
// cantos redimensiona, mantendo fixo o canto oposto ao que foi agarrado
function startFrameDrag(e, frameEl, mode, corner = "se") {
  const note = currentNote();
  if (!note) return;
  const model = note.frames.find(f => f.id === frameEl.dataset.fmid);
  if (!model) return;
  e.preventDefault();
  blurStrayFocus();
  const start = canvasPoint(e);
  const base = { x: model.x, y: model.y, w: model.w, h: model.h };
  const next = { ...base };
  const growsRight = corner === "se" || corner === "ne";
  const growsDown = corner === "se" || corner === "sw";
  const contains = (x, y, w, h) =>
    x >= base.x && y >= base.y && x + w <= base.x + base.w && y + h <= base.y + base.h;
  const members = mode === "move" ? note.boxes.filter(b => contains(b.x, b.y, b.w, b.h)) : [];
  const memberEls = members.map(b => $("noteCanvas").querySelector(`[data-bid="${CSS.escape(b.id)}"]`));
  // desenhos que andam com o grupo: os que estão inteiros dentro da moldura e,
  // além desses, as anotações presas a uma caixa do grupo (mesmo que o traço
  // saia um pouco da moldura)
  const memberIds = new Set(members.map(b => b.id));
  const strokeMembers = mode === "move"
    ? (note.strokes || []).filter(s => (s.points || []).length &&
      (s.points.every(p => contains(p.x, p.y, 0, 0)) || memberIds.has(s.box)))
    : [];
  const strokeEls = strokeMembers.map(s => noteDrawFind("data-sid", s.id));
  const shapeMembers = mode === "move"
    ? (note.shapes || []).filter(s => memberIds.has(s.box) ||
      contains(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1)))
    : [];
  const shapeEls = shapeMembers.map(s => noteDrawFind("data-shid", s.id));

  const move = ev => {
    const p = canvasPoint(ev);
    if (mode === "move") {
      next.x = Math.max(0, Math.min(NOTE_BOARD - base.w, base.x + p.x - start.x));
      next.y = Math.max(0, Math.min(NOTE_BOARD - base.h, base.y + p.y - start.y));
      frameEl.style.left = next.x + "px";
      frameEl.style.top = next.y + "px";
      const dx = next.x - base.x, dy = next.y - base.y;
      members.forEach((b, i) => {
        const el = memberEls[i];
        if (el) { el.style.left = (b.x + dx) + "px"; el.style.top = (b.y + dy) + "px"; }
      });
      const overrides = {};
      members.forEach(b => { overrides[b.id] = { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }; });
      updateLiveConnectors(note, overrides);
      strokeMembers.forEach((s, i) => {
        const el = strokeEls[i];
        if (el) el.setAttribute("points", svgPoints(s.points.map(p => ({ x: p.x + dx, y: p.y + dy }))));
      });
      shapeMembers.forEach((s, i) => {
        const el = shapeEls[i];
        if (!el) return;
        if (s.kind === "line") {
          el.setAttribute("x1", s.x1 + dx); el.setAttribute("y1", s.y1 + dy);
          el.setAttribute("x2", s.x2 + dx); el.setAttribute("y2", s.y2 + dy);
          return;
        }
        const x = Math.min(s.x1, s.x2) + dx, y = Math.min(s.y1, s.y2) + dy;
        const w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1);
        if (s.kind === "rect") { el.setAttribute("x", x); el.setAttribute("y", y); }
        else { el.setAttribute("cx", x + w / 2); el.setAttribute("cy", y + h / 2); }
      });
    } else {
      const dx = p.x - start.x, dy = p.y - start.y;
      if (growsRight) {
        next.w = Math.max(NOTE_MIN_W, Math.min(NOTE_BOARD, base.w + dx));
      } else {
        next.w = Math.max(NOTE_MIN_W, Math.min(NOTE_BOARD, base.w - dx));
        next.x = Math.max(0, base.x + base.w - next.w);
        next.w = base.x + base.w - next.x;   // canto direito fica fixo mesmo ao bater no limite do quadro
      }
      if (growsDown) {
        next.h = Math.max(NOTE_MIN_H, Math.min(NOTE_BOARD, base.h + dy));
      } else {
        next.h = Math.max(NOTE_MIN_H, Math.min(NOTE_BOARD, base.h - dy));
        next.y = Math.max(0, base.y + base.h - next.h);
        next.h = base.y + base.h - next.y;   // canto de baixo fica fixo mesmo ao bater no limite do quadro
      }
      frameEl.style.left = next.x + "px";
      frameEl.style.top = next.y + "px";
      frameEl.style.width = next.w + "px";
      frameEl.style.height = next.h + "px";
    }
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    if (next.x === base.x && next.y === base.y && next.w === base.w && next.h === base.h) return;
    pushNoteUndo(note);
    if (mode === "move") {
      postNotepad({ action: "move_frame", id: note.id, frame_id: model.id, dx: next.x - base.x, dy: next.y - base.y });
    } else {
      postNotepad({ action: "update_frame", id: note.id, frame_id: model.id, x: next.x, y: next.y, w: next.w, h: next.h });
    }
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

// arrastar a barra move a caixa; o canto de baixo redimensiona-a. Se a caixa
// agarrada fizer parte de uma seleção de várias caixas, mover uma move todas
// (como acontece na moldura de grupo) — redimensionar continua a ser sempre só
// da caixa agarrada
function startBoxDrag(e, box, mode) {
  const note = currentNote();
  if (!note) return;
  const model = note.boxes.find(b => b.id === box.dataset.bid);
  if (!model) return;
  e.preventDefault();
  blurStrayFocus();
  // arrastar uma caixa que já faz parte de uma seleção não a desfaz
  if (!noteSelBoxes.includes(model.id)) selectBox(model.id);
  const start = canvasPoint(e);
  const base = { x: model.x, y: model.y, w: model.w, h: model.h };
  const next = { ...base };
  // as outras caixas da seleção (fora a agarrada), com a posição de partida
  // guardada — o modelo pode mudar debaixo dos pés durante o arrasto
  const mates = mode === "move" && noteSelBoxes.length > 1 && noteSelBoxes.includes(model.id)
    ? noteSelBoxes.filter(id => id !== model.id)
      .map(id => note.boxes.find(b => b.id === id))
      .filter(Boolean)
    : [];
  const mateBase = mates.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  const mateEls = mates.map(b => $("noteCanvas").querySelector(`[data-bid="${CSS.escape(b.id)}"]`));
  // anotações desenhadas por cima das imagens destas caixas: andam com elas,
  // como as ligações (redimensionar não mexe nos desenhos)
  const bound = mode === "move"
    ? noteBoundDraw(note, [model.id, ...mates.map(b => b.id)])
    : noteBoundDraw(note, []);
  // o grupo move-se todo ou não se move: os limites do quadro aplicam-se à
  // caixa envolvente de tudo o que vai andar (assim a forma da seleção nunca
  // se desfaz ao bater na borda)
  const all = [base, ...mateBase];
  const bounds = {
    minX: Math.min(...all.map(b => b.x)),
    minY: Math.min(...all.map(b => b.y)),
    maxX: Math.max(...all.map(b => b.x + b.w)),
    maxY: Math.max(...all.map(b => b.y + b.h)),
  };

  const move = ev => {
    const p = canvasPoint(ev);
    const overrides = {};
    if (mode === "move") {
      const dx = Math.max(-bounds.minX, Math.min(NOTE_BOARD - bounds.maxX, p.x - start.x));
      const dy = Math.max(-bounds.minY, Math.min(NOTE_BOARD - bounds.maxY, p.y - start.y));
      next.x = base.x + dx;
      next.y = base.y + dy;
      box.style.left = next.x + "px";
      box.style.top = next.y + "px";
      mates.forEach((b, i) => {
        const at = { x: mateBase[i].x + dx, y: mateBase[i].y + dy, w: mateBase[i].w, h: mateBase[i].h };
        const el = mateEls[i];
        if (el) { el.style.left = at.x + "px"; el.style.top = at.y + "px"; }
        overrides[b.id] = at;
      });
      paintBoundDraw(bound, dx, dy);
    } else {
      next.w = Math.max(NOTE_MIN_W, Math.min(NOTE_BOARD, base.w + p.x - start.x));
      next.h = Math.max(NOTE_MIN_H, Math.min(NOTE_BOARD, base.h + p.y - start.y));
      box.style.width = next.w + "px";
      box.style.height = next.h + "px";
    }
    overrides[model.id] = next;
    updateLiveConnectors(note, overrides);
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    if (next.x === base.x && next.y === base.y && next.w === base.w && next.h === base.h) return;
    pushNoteUndo(note);   // antes de mexer no modelo local: guarda a posição antiga
    Object.assign(model, next);
    // o servidor faz o mesmo desvio às anotações presas (ver update_box /
    // move_boxes no notepad.py): aqui é só para o modelo local não ficar atrás
    shiftBoundDraw(bound, next.x - base.x, next.y - base.y);
    if (mates.length) {
      const dx = next.x - base.x, dy = next.y - base.y;
      mates.forEach((b, i) => { b.x = mateBase[i].x + dx; b.y = mateBase[i].y + dy; });
      postNotepad({
        action: "move_boxes", id: note.id,
        box_ids: [model.id, ...mates.map(b => b.id)], dx, dy,
      }, true);
      return;
    }
    postNotepad({ action: "update_box", id: note.id, box_id: model.id, ...next }, true);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

$("noteCanvas").addEventListener("pointerdown", e => {
  if (e.button !== 0) return;
  // ✕ da ligação escolhida: quem o apaga é o tratador do `click`, mas aqui não
  // pode nascer o retângulo de seleção — ele limpava a seleção e escondia o
  // próprio ✕ antes de o clique lhe chegar
  if (e.target.closest("[data-cdel]")) return;
  if (noteTool === "pen" || noteTool === "line" || noteTool === "rect" || noteTool === "ellipse" || noteTool === "eraser") {
    // com uma ferramenta de desenho (ou a borracha) ativa o clique é para
    // desenhar/apagar: não dar o foco (nem selecionar texto) à caixa que
    // esteja por baixo — com `noteTyping` a true o quadro não se refaz e o
    // traço acabado de gravar não aparecia
    e.preventDefault();
    const focused = document.activeElement;
    if (focused && focused.closest && focused.closest(".noteBox")) focused.blur();
    if (noteTool === "pen") startPenDraw(e);
    else if (noteTool === "eraser") startEraseDraw(e);
    else startShapeDraw(e, noteTool);
    return;
  }
  if (noteTool === "connector") { e.preventDefault(); handleConnectorClick(e); return; }

  // a moldura em si não recebe cliques: só chega aqui quando o clique caiu na
  // barra ou no canto — e aí arrasta/redimensiona seja qual for a ferramenta
  const frameEl = e.target.closest(".noteFrame");
  if (frameEl) {
    const sizeHandle = e.target.closest("[data-frmsize]");
    if (sizeHandle) { startFrameDrag(e, frameEl, "size", sizeHandle.dataset.corner || "se"); return; }
    if (e.target.closest("[data-frmedge]")) { startFrameDrag(e, frameEl, "move"); return; }
    if (e.target.closest(".noteFrameBar") && !e.target.closest("button")) { startFrameDrag(e, frameEl, "move"); return; }
  }
  if (noteTool === "frame" && !frameEl) { startFrameCreate(e); return; }

  const box = e.target.closest(".noteBox");
  if (!box) { startCanvasBand(e); return; }
  if (e.target.closest("[data-bsize]")) { startBoxDrag(e, box, "size"); return; }
  // Ctrl/Cmd/Shift+clique junta (ou tira) a caixa à seleção, sem a arrastar
  // (dentro do texto que está a ser escrito não: aí o Shift+clique serve para
  // marcar o texto)
  if ((e.ctrlKey || e.metaKey || e.shiftKey) && !noteEditPair(e.target)) {
    e.preventDefault();
    blurStrayFocus();
    toggleBoxSel(box.dataset.bid);
    return;
  }
  // B / S / ⧉ : quem age é o tratador do clique — aqui não se pode tocar no
  // foco, senão perdia-se a marcação do texto (ver o mousedown mais abaixo)
  if (e.target.closest("[data-bfmt]") || e.target.closest("[data-bcopy]")) return;
  // clicar no texto passa a caixa para modo de escrita, com o cursor no sítio
  // onde se clicou. A partir daí não se toca no clique: o cursor, o arrastar
  // para marcar e o duplo clique são os do browser, dentro da própria vista.
  const view = e.target.closest("[data-bview]");
  if (view) {
    if (view.isContentEditable) return;
    const note = currentNote();
    const model = note ? note.boxes.find(b => b.id === view.dataset.bview) : null;
    const at = model && model.text
      ? noteViewRawIndex(view, model.text, e.clientX, e.clientY) : 0;
    startNoteEdit(view.dataset.bview, at);
    return;
  }
  if (e.target.closest(".noteBoxBar") && !e.target.closest("button")) {
    startBoxDrag(e, box, "move");
    return;
  }
  selectBox(box.dataset.bid);
  notePoint = { x: +box.style.left.replace("px", "") || 0, y: +box.style.top.replace("px", "") || 0 };
});

// os botões B / S / ⧉ da caixa não podem tirar o foco (nem a marcação) ao texto
// que está a ser escrito: o clique em si é tratado no `click`
$("noteCanvas").addEventListener("mousedown", e => {
  if (e.target.closest("[data-bfmt]") || e.target.closest("[data-bcopy]")) e.preventDefault();
});

const NOTE_COLORS = ["yellow", "blue", "green", "pink", "plain"];

$("noteCanvas").addEventListener("click", e => {
  const note = currentNote();
  if (!note) return;
  // B / S: marca a negrito ou riscado o que estiver escolhido no texto (sem
  // nada escolhido, a palavra debaixo do cursor)
  const fmt = e.target.closest("[data-bfmt]");
  if (fmt) {
    const boxEl = fmt.closest(".noteBox");
    if (!boxEl) return;
    const area = noteEditBox === boxEl.dataset.bid
      ? boxEl.querySelector("[data-btext]")
      : startNoteEdit(boxEl.dataset.bid);
    if (area) toggleNoteMark(area, fmt.dataset.bfmt === "strike" ? NOTE_STRIKE : NOTE_BOLD);
    return;
  }
  // ⧉ : todo o texto da caixa para a área de transferência
  const cp = e.target.closest("[data-bcopy]");
  if (cp) { copyNoteBox(note, cp.dataset.bcopy, cp); return; }
  const del = e.target.closest("[data-bdel]");
  if (del) {
    pushNoteUndo(note);
    postNotepad({ action: "delete_box", id: note.id, box_id: del.dataset.bdel });
    return;
  }
  // ✕ da ligação selecionada: desfaz só essa ligação (mesmo caminho do Delete)
  const cdel = e.target.closest("[data-cdel]");
  if (cdel) {
    deleteNoteSel(note, [], [{ type: "connector", id: cdel.dataset.cdel }]);
    return;
  }
  const frmren = e.target.closest("[data-frmrename]");
  if (frmren) {
    const frame = note.frames.find(f => f.id === frmren.dataset.frmrename);
    if (!frame) return;
    const name = prompt(t("note_ask_folder"), frame.name);
    if (name === null || !name.trim()) return;
    pushNoteUndo(note);
    postNotepad({ action: "rename_frame", id: note.id, frame_id: frame.id, name: name.trim() });
    return;
  }
  const frmdel = e.target.closest("[data-frmdel]");
  if (frmdel) {
    pushNoteUndo(note);
    postNotepad({ action: "delete_frame", id: note.id, frame_id: frmdel.dataset.frmdel });
    return;
  }
  // com a ferramenta de desenho ativa o clique é para desenhar, não para selecionar
  if (noteTool === "select") {
    const add = e.ctrlKey || e.metaKey || e.shiftKey;
    const strokeEl = e.target.closest("[data-sid]");
    if (strokeEl) { selectDrawn({ type: "stroke", id: strokeEl.dataset.sid }, add); return; }
    const shapeEl = e.target.closest("[data-shid]");
    if (shapeEl) { selectDrawn({ type: "shape", id: shapeEl.dataset.shid }, add); return; }
    const connEl = e.target.closest("[data-cid]");
    if (connEl) { selectDrawn({ type: "connector", id: connEl.dataset.cid }, add); return; }
    // clicar no nome da ligação é o mesmo que clicar na linha
    const labelEl = e.target.closest("[data-clabel]");
    if (labelEl) { selectDrawn({ type: "connector", id: labelEl.dataset.clabel }, add); return; }
  }
  const color = e.target.closest("[data-bcolor]");
  if (color) {
    const box = note.boxes.find(b => b.id === color.dataset.bcolor);
    if (!box) return;
    openNoteColorPop(color, box.color, next => {
      const live = currentNote();   // a escolha chega depois: reler o estado
      if (!live || next === box.color) return;
      pushNoteUndo(live);
      postNotepad({ action: "update_box", id: live.id, box_id: box.id, color: next });
    });
  }
});

// ---------- printscreen ampliado ----------
// clicar na imagem de uma caixa abre-a em grande, à altura da janela; clicar
// ao lado (ou no ✕, ou Esc) fecha. Nada disto mexe no zoom do quadro.
function noteImgOpen() {
  return !$("noteImgOverlay").classList.contains("hidden");
}

function openNoteImg(src) {
  if (!src) return;
  const full = $("noteImgFull");
  if (full.src !== src) full.src = src;   // mesmo ficheiro: reusa o que já está em cache
  $("noteImgOverlay").classList.remove("hidden");
  $("noteImgClose").focus();
}

function closeNoteImg() {
  if (!noteImgOpen()) return;
  $("noteImgClose").blur();
  $("noteImgOverlay").classList.add("hidden");
}

// tratador próprio (e depois do de cima): o clique na imagem não tem nada a ver
// com as caixas/desenhos e não deve interferir com a seleção nem com o arrasto
$("noteCanvas").addEventListener("click", e => {
  if (noteTool !== "select") return;                   // com uma ferramenta ativa o clique é para desenhar
  if (e.ctrlKey || e.metaKey || e.shiftKey) return;    // esses cliques são da seleção múltipla
  const img = e.target.closest(".noteBoxImg");
  if (img) openNoteImg(img.src);
});

// clicar na própria imagem não fecha (o resto — fundo e ✕ — fecha)
$("noteImgOverlay").addEventListener("click", e => {
  if (e.target === $("noteImgFull")) return;
  closeNoteImg();
});

// em captura: com a imagem aberta o Esc só a fecha (o ecrã dividido e as
// ferramentas de desenho têm os seus tratadores de Esc, registados antes)
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || !noteImgOpen()) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  closeNoteImg();
}, true);

// ---------- escolher a cor: pequeno painel junto ao botão ----------
let noteColorPop = null;        // { el, anchor } do painel de cores aberto
let noteColorPopHold = false;   // clicar outra vez no mesmo botão fecha (não reabre)

function closeNoteColorPop() {
  if (!noteColorPop) return;
  noteColorPop.el.remove();
  noteColorPop = null;
}

// `onPick(cor)` é chamado com a cor escolhida; o painel fecha-se sozinho
function openNoteColorPop(anchor, current, onPick) {
  if (noteColorPopHold) { noteColorPopHold = false; return; }
  closeNoteColorPop();
  const el = document.createElement("div");
  el.className = "noteColorPop";
  el.innerHTML = NOTE_COLORS.map(c => `<button type="button" class="noteColorDot c-${c}${c === current ? " active" : ""}" data-ncolor="${c}" title="${esc(t(`color_${c}`))}"></button>`).join("");
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const left = Math.max(6, Math.min(window.innerWidth - el.offsetWidth - 6, r.left - 6));
  const below = r.bottom + 6;
  el.style.left = `${left}px`;
  el.style.top = `${below + el.offsetHeight > window.innerHeight
    ? Math.max(6, r.top - el.offsetHeight - 6) : below}px`;
  el.addEventListener("click", ev => {
    const dot = ev.target.closest("[data-ncolor]");
    if (!dot) return;
    ev.stopPropagation();
    closeNoteColorPop();
    onPick(dot.dataset.ncolor);
  });
  noteColorPop = { el, anchor };
}

// clicar fora fecha; no próprio botão fecha e não deixa reabrir no mesmo clique
document.addEventListener("pointerdown", e => {
  if (!noteColorPop || e.target.closest(".noteColorPop")) return;
  noteColorPopHold = noteColorPop.anchor.contains(e.target);
  closeNoteColorPop();
}, true);

// o painel fica preso ao ecrã: se o quadro rolar, deixa de estar junto ao botão
$("noteCanvas").addEventListener("scroll", closeNoteColorPop);

// em captura: com o painel de cores aberto o Esc só o fecha (o ecrã dividido
// e as ferramentas de desenho têm os seus tratadores de Esc, registados antes)
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || !noteColorPop) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  closeNoteColorPop();
}, true);

// ---------- dar um nome a uma ligação: campo de texto junto à linha ----------
// (nada de prompt() do browser: aqui o painel segue o mesmo padrão do painel
// de cores, com Enter/✓ a confirmar e Esc a desistir)
let noteLabelPop = null;   // { el, input, onDone } do painel aberto

function closeNoteLabelPop(commit) {
  if (!noteLabelPop) return;
  const { el, input, onDone } = noteLabelPop;
  const value = input.value.trim().slice(0, NOTE_CONN_LABEL_MAX);
  noteLabelPop = null;
  el.remove();
  if (commit) onDone(value);
}

function openNoteLabelPop(clientX, clientY, current, onDone) {
  closeNoteLabelPop(false);
  const el = document.createElement("div");
  el.className = "noteLabelPop";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "noteLabelInput";
  input.maxLength = NOTE_CONN_LABEL_MAX;
  input.placeholder = t("ph_conn_label");
  input.value = current || "";
  const ok = document.createElement("button");
  ok.type = "button";
  ok.className = "noteLabelOk";
  ok.title = t("t_conn_label_ok");
  ok.textContent = "✓";
  el.appendChild(input);
  el.appendChild(ok);
  document.body.appendChild(el);
  const w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = `${Math.max(6, Math.min(window.innerWidth - w - 6, clientX - w / 2))}px`;
  el.style.top = `${Math.max(6, Math.min(window.innerHeight - h - 6, clientY + 12))}px`;
  noteLabelPop = { el, input, onDone };
  input.focus();
  input.select();
  input.addEventListener("keydown", ev => {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    closeNoteLabelPop(true);
  });
  ok.addEventListener("click", () => closeNoteLabelPop(true));
}

// clicar fora guarda o que estiver escrito (é um campo de edição, não um menu)
document.addEventListener("pointerdown", e => {
  if (!noteLabelPop || e.target.closest(".noteLabelPop")) return;
  closeNoteLabelPop(true);
}, true);

// em captura na janela (antes de qualquer tratador do document, incluindo o do
// ecrã inteiro e o do ecrã dividido): com o painel aberto o Esc só desiste dele
window.addEventListener("keydown", e => {
  if (e.key !== "Escape" || !noteLabelPop) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  closeNoteLabelPop(false);
}, true);

// duplo clique numa ligação (na linha ou no nome dela) abre o campo do nome
$("noteCanvas").addEventListener("dblclick", e => {
  if (noteTool !== "select") return;
  const note = currentNote();
  if (!note) return;
  const hit = e.target.closest("[data-cid]") || e.target.closest("[data-clabel]");
  if (!hit) return;
  const cid = hit.dataset.cid || hit.dataset.clabel;
  const conn = (note.connectors || []).find(c => c.id === cid);
  if (!conn) return;
  e.preventDefault();
  selectDrawn({ type: "connector", id: cid });
  openNoteLabelPop(e.clientX, e.clientY, conn.label || "", value => {
    const live = currentNote();   // a escolha chega depois: reler o estado
    if (!live) return;
    const cur = (live.connectors || []).find(c => c.id === cid);
    if (!cur || (cur.label || "") === value) return;
    pushNoteUndo(live);
    postNotepad({ action: "update_connector", id: live.id, connector_id: cid, label: value });
  });
});

// ---------- barra de ferramentas de desenho ----------
// `add` = Ctrl/Shift+clique: junta (ou tira) o traço/forma/ligação à seleção
function selectDrawn(sel, add) {
  if (!sel) {
    noteDrawSel = [];
  } else if (add) {
    noteDrawSel = drawSelHas(sel.type, sel.id)
      ? noteDrawSel.filter(s => !(s.type === sel.type && s.id === sel.id))
      : [...noteDrawSel, sel];
  } else {
    noteSelBoxes = [];
    noteDrawSel = [sel];
  }
  paintNoteSel();
}

function setNoteTool(tool) {
  noteTool = tool;
  $("noteToolbar").querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("active", b.dataset.tool === tool));
  selectBox(null);
  selectDrawn(null);
  noteConnectFrom = null;
  highlightConnectFrom(null);
}

// o botão da tabela escreve dentro da caixa que está a ser escrita: não lhe
// pode tirar o foco (o mesmo que se faz com o B / S da caixa)
$("noteToolbar").addEventListener("mousedown", e => {
  // o Copiar lê o texto da caixa que está a ser escrita: tirar-lhe o foco
  // levava o cursor daquela caixa sem necessidade nenhuma
  if (e.target.closest("#noteTableBtn, #noteCopyBtn")) e.preventDefault();
});

$("noteToolbar").addEventListener("click", e => {
  const toolBtn = e.target.closest("[data-tool]");
  if (toolBtn) { setNoteTool(toolBtn.dataset.tool); return; }
  if (e.target.closest("#noteTableBtn")) { insertNoteTable(); return; }
  const copyBtn = e.target.closest("#noteCopyBtn");
  if (copyBtn) { copyNoteAll(copyBtn); return; }
  if (e.target.closest("#noteToolColor")) {
    // a cor do traço é só do lado do browser: não há nada para gravar
    openNoteColorPop($("noteToolColor"), noteStrokeColor, next => {
      noteStrokeColor = next;
      $("noteToolColor").className = `noteToolColor c-${noteStrokeColor}`;
    });
  }
});

$("noteUndoBtn").addEventListener("click", () => revertNote());
$("noteRedoBtn").addEventListener("click", () => revertNote(false));

// limpar o quadro: pergunta primeiro e fica revertível com o ↺ / Ctrl+Z
$("noteClearBtn").addEventListener("click", async () => {
  const note = currentNote();
  if (!note) return;
  const total = note.boxes.length + (note.strokes || []).length + (note.shapes || []).length +
    (note.connectors || []).length + (note.frames || []).length;
  if (!total) { toast(t("note_clear_empty")); return; }
  if (!confirm(tf("cfm_clear_note", note.title))) return;
  pushNoteUndo(note);
  flushNoteText();
  noteTyping = false;
  noteSelBoxes = [];
  noteDrawSel = [];
  await postNotepad({ action: "clear_note", id: note.id });
});

// Esc sai de qualquer ferramenta de desenho e volta a "selecionar" — só
// quando as notas estão visíveis, para não roubar o Esc a outros ecrãs
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && notesVisible() && noteTool !== "select") setNoteTool("select");
});

// a escrever num campo de texto o teclado é dele (Delete, Ctrl+Z, Ctrl+C/V…)
function noteTextFocused() {
  const el = document.activeElement;
  if (!el) return false;
  return el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable;
}

// interações que chamam preventDefault() no pointerdown (arrastar, redimensionar,
// Ctrl/Shift+clique) impedem o browser de tirar o foco sozinho a um campo de
// texto — de outra forma qualquer input deixado focado (a pesquisa, o nome de
// outra caixa, etc.) continua "ativo" e o Delete a seguir não apaga nada,
// porque noteTextFocused() acha que ainda se está a escrever
function blurStrayFocus() {
  const el = document.activeElement;
  if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) el.blur();
}

// apaga tudo o que estiver selecionado (caixas, traços, formas e ligações)
async function deleteNoteSel(note, boxIds, drawn) {
  pushNoteUndo(note);
  noteSelBoxes = [];
  noteDrawSel = [];
  if (boxIds.length &&
    !await postNotepad({ action: "delete_boxes", id: note.id, box_ids: boxIds })) return;
  for (const sel of drawn) {
    const body = sel.type === "stroke" ? { action: "delete_stroke", id: note.id, stroke_id: sel.id }
      : sel.type === "shape" ? { action: "delete_shape", id: note.id, shape_id: sel.id }
        : { action: "delete_connector", id: note.id, connector_id: sel.id };
    if (!await postNotepad(body)) return;
  }
}

// Delete/Backspace apaga as caixas e os desenhos selecionados
document.addEventListener("keydown", e => {
  if (e.key !== "Delete" && e.key !== "Backspace") return;
  if (!notesVisible() || noteTextFocused()) return;   // não interferir com edição de texto
  if (noteImgOpen()) return;                          // a ver uma imagem em grande: não apagar nada
  const note = currentNote();
  if (!note || !noteSelCount()) return;
  e.preventDefault();
  deleteNoteSel(note, [...noteSelBoxes], [...noteDrawSel]);
});

// Ctrl+Z reverte a última alteração do quadro e Ctrl+Shift+Z (ou Ctrl+Y)
// repete-a (dentro de um texto estas teclas são as do próprio campo, para não
// desfazer o que se está a escrever)
document.addEventListener("keydown", e => {
  if (!e.ctrlKey && !e.metaKey) return;
  if (e.altKey) return;
  const key = String(e.key || "").toLowerCase();
  if (key !== "z" && key !== "y") return;
  if (key === "y" && e.shiftKey) return;
  if (!notesVisible() || noteTextFocused() || !currentNote()) return;
  if (noteImgOpen()) return;   // a ver uma imagem em grande: não mexer no quadro
  e.preventDefault();
  revertNote(key === "z" && !e.shiftKey);
});

// ---------- texto das caixas ----------
function flushNoteText() {
  clearTimeout(noteTextTimer);
  noteTextTimer = null;
}

// trocar um pedaço do texto da caixa: o campo escondido fica com o texto novo
// (o `input` dele é quem grava) e a vista volta a mostrá-lo, com o cursor onde
// esta troca o deixou. É por aqui que passa tudo o que mexe no texto sem ser a
// escrever: B/S, Tab, Enter, inserir tabela.
function replaceNoteRange(area, from, to, text, selFrom, selTo) {
  noteHistEdit(area.value, area.selectionStart, true);
  noteSetAreaText(area, area.value.slice(0, from) + text + area.value.slice(to), selFrom, selTo);
  noteSyncView(area, selFrom, selTo);
}

// põe (ou tira) **negrito** / ~~riscado~~ ao que estiver escolhido; sem nada
// escolhido pega a palavra debaixo do cursor e, sem palavra, deixa os
// marcadores prontos para se escrever lá dentro
function toggleNoteMark(area, mark) {
  const value = area.value;
  const len = mark.length;
  let from = area.selectionStart, to = area.selectionEnd;
  if (from === to) {
    let a = from, b = to;
    while (a > 0 && !/[\s|]/.test(value[a - 1])) a--;
    while (b < value.length && !/[\s|]/.test(value[b])) b++;
    if (b > a) { from = a; to = b; }
  }
  const inner = value.slice(from, to);
  // já marcado, com os marcadores de fora: tira-os
  if (from >= len && value.slice(from - len, from) === mark && value.slice(to, to + len) === mark) {
    replaceNoteRange(area, from - len, to + len, inner, from - len, to - len);
    return;
  }
  // marcadores dentro do que está escolhido: tira-os também
  if (inner.length >= 2 * len && inner.startsWith(mark) && inner.endsWith(mark)) {
    replaceNoteRange(area, from, to, inner.slice(len, -len), from, to - 2 * len);
    return;
  }
  replaceNoteRange(area, from, to, mark + inner + mark, from + len, to + len);
}

// ---------- árvores de texto (Tab / Shift+Tab / Enter) ----------
// A convenção é a do papel: "-> raiz", "   |-> filho", "      |-> neto",
// três espaços por nível. É só texto — não há modelo de árvore nenhum por baixo.
function noteOutlineParse(line) {
  const lead = (/^[ \t]*/.exec(line) || [""])[0];
  const rest = line.slice(lead.length);
  const mark = rest.startsWith("|->") ? "|->" : rest.startsWith("->") ? "->" : "";
  if (!mark) return { level: -1, lead, body: rest };
  const width = lead.replace(/\t/g, NOTE_OUTLINE_STEP).length;
  return {
    level: Math.floor(width / NOTE_OUTLINE_STEP.length),
    lead,
    body: rest.slice(mark.length).replace(/^ /, ""),
  };
}

function noteOutlineBuild(level, body) {
  if (level < 0) return body;
  if (level === 0) return `-> ${body}`;
  return `${NOTE_OUTLINE_STEP.repeat(level)}|-> ${body}`;
}

function noteOutlineShift(line, dir) {
  const p = noteOutlineParse(line);
  if (dir > 0) return noteOutlineBuild(p.level + 1, p.body);
  if (p.level > 0) return noteOutlineBuild(p.level - 1, p.body);
  if (p.level === 0) return p.body;
  // linha sem árvore: Shift+Tab tira-lhe um nível de espaços à esquerda
  return p.lead.replace(/(?: {1,3}|\t)$/, "") + p.body;
}

// Tab / Shift+Tab: desce ou sobe um nível todas as linhas que o cursor (ou o
// que está escolhido) toca
function noteOutlineTab(area, dir) {
  const value = area.value;
  const s = area.selectionStart, e = area.selectionEnd;
  const from = s > 0 ? value.lastIndexOf("\n", s - 1) + 1 : 0;
  // escolha a acabar exatamente numa mudança de linha: a linha seguinte não conta
  const endRef = e > s && value[e - 1] === "\n" ? e - 1 : e;
  let to = value.indexOf("\n", endRef);
  if (to < 0) to = value.length;
  const block = value.slice(from, to);
  const next = block.split("\n").map(l => noteOutlineShift(l, dir)).join("\n");
  if (next === block) return;
  if (s === e) {
    const at = Math.max(from, Math.min(from + next.length, s + next.length - block.length));
    replaceNoteRange(area, from, to, next, at, at);
    return;
  }
  replaceNoteRange(area, from, to, next, from, from + next.length);
}

// só mudar o cursor (ou o que está marcado): não é uma alteração do texto, não
// há nada para gravar nem para o histórico
function noteMoveCaret(area, from, to) {
  try { area.setSelectionRange(from, to); } catch (err) { /* campo escondido */ }
  noteSyncView(area, from, to);
}

// a tabela a que a linha `i` pertence, e as suas células por ordem (a linha de
// separação não conta: não se escreve nela)
function noteTableAt(lines, i) {
  if (i < 0 || !lines[i] || !NOTE_ROW_RE.test(lines[i].text)) return null;
  let j = i;
  while (j > 0 && NOTE_ROW_RE.test(lines[j - 1].text)) j--;
  const block = noteTableBlock(lines, j);
  if (!block || i >= j + block.count) return null;
  const cells = [];
  for (let k = j; k < j + block.count; k++) {
    if (k === j + 1) continue;
    for (const cell of noteTableCells(lines[k])) cells.push(cell);
  }
  return { block, head: j, cells };
}

// Tab dentro de uma tabela: célula seguinte (ou anterior), com o que ela tem
// escolhido — escrever substitui-o, como numa folha de cálculo. Na última
// célula, o Tab acrescenta uma linha.
function noteTableTab(area, dir) {
  const at = area.selectionStart;
  const lines = noteTextLines(area.value);
  const i = lines.findIndex(l => at <= l.at + l.text.length);
  const table = noteTableAt(lines, i);
  if (!table) return false;
  const here = table.cells.findIndex(c => at >= c.at && at <= c.at + c.text.length);
  const next = table.cells[(here < 0 ? 0 : here) + dir];
  if (next) {
    noteMoveCaret(area, next.at, next.at + next.text.length);
    return true;
  }
  if (dir < 0) return true;              // primeira célula: não há para onde ir
  return noteOutlineEnter(area);         // última: linha nova
}

// linha de tabela vazia com as mesmas colunas (e a mesma largura) de outra
function noteTableEmptyRow(line) {
  const first = line.indexOf("|"), last = line.lastIndexOf("|");
  const cells = line.slice(first + 1, last).split("|")
    .map(part => " ".repeat(Math.max(1, part.length)));
  return line.slice(0, first + 1) + cells.join("|") + line.slice(last);
}

// Enter continua o que estava: outra linha no mesmo nível da árvore, ou outra
// linha da tabela. Numa linha (ou linha de tabela) que ficou vazia, o Enter
// limpa-a — é a maneira de sair da árvore/tabela. Shift+Enter é sempre o Enter
// normal do campo.
function noteOutlineEnter(area) {
  const value = area.value;
  const s = area.selectionStart, e = area.selectionEnd;
  const from = s > 0 ? value.lastIndexOf("\n", s - 1) + 1 : 0;
  let lineEnd = value.indexOf("\n", s);
  if (lineEnd < 0) lineEnd = value.length;
  const line = value.slice(from, lineEnd);
  const atEnd = s === e && s === lineEnd;

  if (NOTE_ROW_RE.test(line)) {
    const lines = noteTextLines(value);
    const k = lines.findIndex(l => l.at === from);
    let j = k;
    while (j > 0 && NOTE_ROW_RE.test(lines[j - 1].text)) j--;
    const block = k >= 0 ? noteTableBlock(lines, j) : null;
    if (!block || k >= j + block.count) return false;
    // linha de dados que ficou vazia: o Enter limpa-a — é a maneira de sair da
    // tabela
    if (atEnd && k > j + 1 && !line.replace(/\|/g, "").trim()) {
      replaceNoteRange(area, from, lineEnd, "", from, from);
      return true;
    }
    // a linha nova entra depois desta, nunca entre o cabeçalho e o separador
    // (isso partia a tabela: deixava de ter o separador logo a seguir)
    const ref = lines[Math.max(k, j + 1)];
    const end = ref.at + ref.text.length;
    const row = noteTableEmptyRow(lines[j].text);
    // cursor logo dentro da primeira célula (depois do "| ")
    const first = row.indexOf("|");
    const at = end + 1 + first + (row[first + 1] === " " ? 2 : 1);
    replaceNoteRange(area, end, end, `\n${row}`, at, at);
    return true;
  }

  const p = noteOutlineParse(line);
  if (p.level < 0) return false;   // linha normal: o Enter é o do campo
  if (atEnd && !p.body.trim()) {
    replaceNoteRange(area, from, lineEnd, "", from, from);   // só o prefixo: sai da árvore
    return true;
  }
  const prefix = noteOutlineBuild(p.level, "");
  const at = s + 1 + prefix.length;
  replaceNoteRange(area, s, e, `\n${prefix}`, at, at);
  return true;
}

// ---------- tabelas ----------
// Uma tabela é texto simples em "| coluna |" dentro de uma caixa normal (não é
// um tipo novo de caixa): quem lhe desenha a grelha é a vista (noteTableHtml).
function noteTableSkeleton(cols, rows) {
  const heads = [];
  for (let c = 1; c <= cols; c++) heads.push(`${t("note_table_col")} ${c}`);
  const width = heads.map(h => Math.max(3, h.length));
  const line = cells => `| ${cells.map((v, i) => String(v).padEnd(width[i])).join(" | ")} |`;
  const out = [line(heads), line(width.map(w => "-".repeat(w)))];
  for (let r = 0; r < rows; r++) out.push(line(heads.map(() => "")));
  return out.join("\n");
}

// a tabela entra onde está o cursor, se alguma caixa estiver a ser escrita; se
// não, no fim da caixa escolhida; e sem nada escolhido nasce uma caixa nova
async function insertNoteTable() {
  const note = currentNote();
  if (!note) return;
  const table = noteTableSkeleton(NOTE_TABLE_COLS, NOTE_TABLE_ROWS);
  const area = noteEditBox
    ? $("noteCanvas").querySelector(`[data-btext="${CSS.escape(noteEditBox)}"]`) : null;
  if (area) {
    // a tabela tem de ficar em linhas só dela
    const at = area.selectionStart;
    const before = area.value.slice(0, at);
    const after = area.value.slice(area.selectionEnd);
    const lead = before && !before.endsWith("\n") ? "\n" : "";
    const tail = after && !after.startsWith("\n") ? "\n" : "";
    // deixa escolhido o nome da primeira coluna: escrever já o substitui
    const head = at + lead.length + 2;
    replaceNoteRange(area, at, area.selectionEnd, lead + table + tail,
      head, head + `${t("note_table_col")} 1`.length);
    return;
  }
  const model = noteSelBoxes.length === 1
    ? note.boxes.find(b => b.id === noteSelBoxes[0]) : null;
  if (model) {
    const base = model.text || "";
    const text = (base && !base.endsWith("\n") ? `${base}\n` : base) + table;
    pushNoteUndo(note);
    model.text = text;
    await postNotepad({ action: "update_box", id: note.id, box_id: model.id, text });
    return;
  }
  const w = 30 + NOTE_TABLE_COLS * 90, h = 40 + (NOTE_TABLE_ROWS + 1) * 24;
  pushNoteUndo(note);
  await postNotepad({
    action: "add_box", id: note.id,
    x: Math.max(0, Math.min(NOTE_BOARD - w, notePoint.x)),
    y: Math.max(0, Math.min(NOTE_BOARD - h, notePoint.y)),
    w, h, text: table,
  });
}

// ---------- juntar e tirar linhas/colunas ----------
// A tabela é texto: mexer na grelha é reescrever as linhas "| a | b |" que ela
// ocupa no texto da caixa. Quem chama isto é o menu do botão direito.

// as células de uma linha tal como estão escritas (com o enchimento à volta) e
// o que a linha tem fora delas, para se voltar a escrever igual
function noteRowParts(line) {
  const first = line.indexOf("|"), last = line.lastIndexOf("|");
  return {
    pre: line.slice(0, first + 1),
    parts: line.slice(first + 1, last).split("|"),
    post: line.slice(last),
  };
}

function noteRowJoin(row) {
  return row.pre + row.parts.join("|") + row.post;
}

// junta uma coluna na posição `c` a todas as linhas da tabela: o cabeçalho
// ganha um nome, a linha de separação a sua grelha e as linhas de dados uma
// célula vazia da mesma largura. As linhas mais curtas (as que a vista enche
// sozinha) ganham primeiro as células que lhes faltavam, para a coluna nova
// entrar no mesmo lugar em todas elas.
function noteTableAddCol(rows, c, label) {
  const head = noteRowParts(rows[0]);
  const width = Math.max(3, label.length);
  return rows.map((line, i) => {
    const row = noteRowParts(line);
    while (row.parts.length < c) {
      const pad = head.parts[row.parts.length];
      row.parts.push(" ".repeat(Math.max(1, pad ? pad.length : 1)));
    }
    row.parts.splice(c, 0, i === 0 ? ` ${label.padEnd(width)} `
      : i === 1 ? ` ${"-".repeat(width)} ` : ` ${" ".repeat(width)} `);
    return noteRowJoin(row);
  });
}

function noteTableDelCol(rows, c) {
  return rows.map(line => {
    const row = noteRowParts(line);
    if (row.parts.length <= c) return line;   // linha curta: já não tem esta coluna
    row.parts.splice(c, 1);
    return noteRowJoin(row);
  });
}

// escreve a tabela nova no texto da caixa e deixa o cursor na célula (`r`, `c`)
// dela; `select` marca o que essa célula tem escrito (escrever substitui-o)
function noteTablePut(area, from, to, rows, r, c, select) {
  const text = rows.join("\n");
  const at = from + rows.slice(0, Math.min(r, rows.length)).reduce((n, l) => n + l.length + 1, 0);
  const cells = noteTableCells({ text: rows[Math.min(r, rows.length - 1)] || "", at });
  const cell = cells[Math.min(c, cells.length - 1)] || { at, text: "" };
  replaceNoteRange(area, from, to, text, cell.at, select ? cell.at + cell.text.length : cell.at);
}

// `spot` (ver o menu, abaixo): `anchor` é o índice, no texto, da primeira célula
// do cabeçalho — é por ele que a tabela se volta a encontrar, mesmo que o texto
// já tenha mudado —, `row` é a linha da vista (0 = cabeçalho) e `col` a coluna.
function noteTableAct(area, spot, act) {
  const lines = noteTextLines(area.value);
  const head = lines.findIndex(l => spot.anchor >= l.at && spot.anchor <= l.at + l.text.length);
  const block = head >= 0 ? noteTableBlock(lines, head) : null;
  if (!block) return;   // o texto mudou entretanto: já não é esta a tabela
  const rows = [];
  for (let k = head; k < head + block.count; k++) rows.push(lines[k].text);
  const from = lines[head].at;
  const to = from + rows.join("\n").length;
  // a linha da vista nas linhas do texto: a linha de separação (a 1) não se vê
  const r = spot.row <= 0 ? 0 : spot.row + 1;
  const cols = noteTableCells({ text: rows[0], at: 0 }).length;
  const c = Math.max(0, Math.min(spot.col, cols - 1));
  if (act === "row_above" || act === "row_below") {
    // a linha nova nunca entra entre o cabeçalho e a separação (isso partia a
    // tabela): no cabeçalho, entra como primeira linha de dados
    const at = Math.max(2, act === "row_above" ? r : r + 1);
    const next = rows.slice();
    next.splice(at, 0, noteTableEmptyRow(rows[0]));
    noteTablePut(area, from, to, next, at, 0, false);
    return;
  }
  if (act === "row_del") {
    if (r < 2 || r >= rows.length) return;   // o cabeçalho não se apaga
    const next = rows.slice();
    next.splice(r, 1);
    // era a última linha de dados: o cursor vai para o cabeçalho, nunca para a
    // linha de separação (essa não se vê)
    noteTablePut(area, from, to, next, next.length > 2 ? Math.min(r, next.length - 1) : 0, c, false);
    return;
  }
  if (act === "col_left" || act === "col_right") {
    const at = act === "col_left" ? c : c + 1;
    const label = `${t("note_table_col")} ${at + 1}`;
    // deixa escolhido o nome da coluna nova: escrever já o substitui
    noteTablePut(area, from, to, noteTableAddCol(rows, at, label), 0, at, true);
    return;
  }
  if (act === "col_del") {
    if (cols <= 1) return;                   // a última coluna não se apaga
    noteTablePut(area, from, to, noteTableDelCol(rows, c), r, Math.min(c, cols - 2), false);
  }
}

// ---------- menu do botão direito de uma tabela ----------
const NOTE_TABLE_ACTS = ["row_above", "row_below", "row_del", "col_left", "col_right", "col_del"];

let noteTablePop = null;   // { el } do menu aberto

function closeNoteTablePop() {
  if (!noteTablePop) return;
  noteTablePop.el.remove();
  noteTablePop = null;
}

// segue o padrão dos outros painéis do quadro (clique fora ou Esc fecham); o
// mousedown não deixa o menu tirar o cursor à caixa, como o botão da tabela
function openNoteTablePop(clientX, clientY, spot) {
  closeNoteTablePop();
  const el = document.createElement("div");
  el.className = "noteTablePop";
  el.innerHTML = NOTE_TABLE_ACTS.map(act => {
    // no cabeçalho não há linha para apagar nem linha acima onde entrar
    const off = (spot.row <= 0 && (act === "row_above" || act === "row_del"))
      || (act === "col_del" && spot.cols <= 1);
    return `<button type="button" data-tblact="${act}"${off ? " disabled" : ""}>${esc(t(`note_tbl_${act}`))}</button>`;
  }).join("");
  el.addEventListener("mousedown", ev => ev.preventDefault());
  el.addEventListener("click", ev => {
    const btn = ev.target.closest("[data-tblact]");
    if (!btn || btn.disabled) return;
    ev.stopPropagation();
    const area = $("noteCanvas").querySelector(`[data-btext="${CSS.escape(spot.box)}"]`);
    closeNoteTablePop();
    if (area) noteTableAct(area, spot, btn.dataset.tblact);
  });
  document.body.appendChild(el);
  const w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = `${Math.max(6, Math.min(window.innerWidth - w - 6, clientX))}px`;
  el.style.top = `${Math.max(6, Math.min(window.innerHeight - h - 6, clientY))}px`;
  noteTablePop = { el };
}

// botão direito numa tabela de uma caixa: o menu das linhas e colunas. A caixa
// passa a estar em escrita (é o texto dela que muda), com o cursor na célula
// onde se clicou — e o preventDefault tira da frente o menu de copiar.
$("noteCanvas").addEventListener("contextmenu", e => {
  const cell = e.target.closest(".noteBoxTable th, .noteBoxTable td");
  const boxEl = cell && cell.closest(".noteBox");
  const table = cell && cell.closest("table");
  const first = table && table.querySelector("tr");
  const anchor = first && first.children[0] ? +first.children[0].dataset.at : NaN;
  if (!boxEl || !Number.isFinite(anchor)) return;
  e.preventDefault();
  const spot = {
    box: boxEl.dataset.bid,
    anchor,
    row: [...table.querySelectorAll("tr")].indexOf(cell.parentElement),
    col: cell.cellIndex,
    cols: first.children.length,
  };
  // a vista só recebe o cursor quando a caixa está em escrita: se não estava, é
  // este clique que a põe (o índice da célula clicada leva lá o cursor)
  if (noteEditBox !== spot.box && !startNoteEdit(spot.box, +cell.dataset.at)) return;
  openNoteTablePop(e.clientX, e.clientY, spot);
});

// clicar fora fecha (dentro do menu não: é lá que se escolhe)
document.addEventListener("pointerdown", e => {
  if (noteTablePop && !e.target.closest(".noteTablePop")) closeNoteTablePop();
}, true);

// o menu fica preso ao ecrã: se o quadro rolar, deixa de estar junto à célula
$("noteCanvas").addEventListener("scroll", closeNoteTablePop);
window.addEventListener("resize", closeNoteTablePop);

// em captura: com o menu aberto o Esc só o fecha (não sai também da caixa)
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || !noteTablePop) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  closeNoteTablePop();
}, true);

// teclado dentro do texto de uma caixa (e só aí: o Tab continua a mudar de
// campo em todo o resto da aplicação)
$("noteCanvas").addEventListener("keydown", e => {
  const pair = noteEditPair(e.target);
  if (!pair) return;
  const area = pair.area;
  // Esc sai da caixa (dentro de uma tabela o Tab já é para mudar de célula)
  if (e.key === "Escape") { e.preventDefault(); pair.view.blur(); return; }
  if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    const dir = e.shiftKey ? -1 : 1;
    // dentro de uma tabela o Tab muda de célula; fora dela desce/sobe um nível
    if (!noteTableTab(area, dir)) noteOutlineTab(area, dir);
    return;
  }
  // o Enter é sempre nosso: o que o browser faria era partir a vista em
  // <div>/<br>, e o que uma mudança de linha é aqui só o texto sabe (outra
  // linha da tabela, outro ramo da árvore, ou simplesmente outra linha)
  if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    if (e.shiftKey || !noteOutlineEnter(area)) {
      const from = area.selectionStart, to = area.selectionEnd;
      replaceNoteRange(area, from, to, "\n", from + 1, from + 1);
    }
    return;
  }
  if (!e.ctrlKey && !e.metaKey) return;
  if (e.altKey) return;
  const key = String(e.key || "").toLowerCase();
  if (key === "b" && !e.shiftKey) { e.preventDefault(); toggleNoteMark(area, NOTE_BOLD); return; }
  if (key === "x" && e.shiftKey) { e.preventDefault(); toggleNoteMark(area, NOTE_STRIKE); return; }
  // Ctrl+Z / Ctrl+Shift+Z (ou Ctrl+Y): o histórico do texto desta caixa
  if (key === "z" && !e.shiftKey) { e.preventDefault(); noteHistStep(area, true); return; }
  if ((key === "z" && e.shiftKey) || (key === "y" && !e.shiftKey)) {
    e.preventDefault();
    noteHistStep(area, false);
  }
});

// escrever na vista: é a vista que passa a ser o texto da caixa
$("noteCanvas").addEventListener("input", e => {
  const pair = noteEditPair(e.target);
  if (pair) noteViewEdited(pair.view);
});

// A marcação do texto é a do browser, feita na vista; mas quem a usa (o B, o S,
// o Tab, o Enter, a tabela) lê-a do campo escondido, em índices do texto com
// marcadores. De cada vez que ela muda, o campo fica a saber.
document.addEventListener("selectionchange", () => {
  const sel = window.getSelection();
  const node = sel && sel.anchorNode;
  if (!node) return;
  const pair = noteEditPair(node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
  if (!pair || pair.view.dataset.composing) return;
  const range = noteViewSel(pair.view, pair.area.value);
  if (!range) return;
  try { pair.area.setSelectionRange(range.start, range.end); } catch (err) { /* campo escondido */ }
});

// acentos e outros caracteres compostos: enquanto o browser está a compor não
// se pode refazer a vista (perdia-se o que estava a ser composto)
$("noteCanvas").addEventListener("compositionstart", e => {
  const pair = noteEditPair(e.target);
  if (pair) pair.view.dataset.composing = "1";
});

$("noteCanvas").addEventListener("compositionend", e => {
  const pair = noteEditPair(e.target);
  if (!pair) return;
  delete pair.view.dataset.composing;
  noteViewEdited(pair.view);
});

// colar dentro de uma caixa: o que entra é sempre texto com marcadores, nunca
// HTML — a vista é feita a partir do texto, não o contrário. Quando a origem
// manda HTML (OneNote, Word, Teams, uma página) traduz-se primeiro: o negrito
// passa a **, o riscado a ~~, as tabelas a "| a | b |" e as listas à convenção
// de árvore desta app (ver noteHtmlToMarks em noteclip.js).
$("noteCanvas").addEventListener("paste", e => {
  const pair = noteEditPair(e.target);
  if (!pair || !e.clipboardData) return;
  const html = e.clipboardData.getData("text/html");
  const plain = e.clipboardData.getData("text/plain");
  const text = (html && typeof noteHtmlToMarks === "function" ? noteHtmlToMarks(html) : "") || plain;
  if (!text) return;
  e.preventDefault();
  // consumido aqui: o tratador do documento não pode ainda fazer uma caixa de
  // imagem com o printscreen que a mesma cópia possa trazer ao lado do HTML
  e.stopPropagation();
  const area = pair.area, at = area.selectionStart + text.length;
  replaceNoteRange(area, area.selectionStart, area.selectionEnd, text, at, at);
});

$("noteCanvas").addEventListener("input", e => {
  const area = e.target.closest("[data-btext]");
  const note = currentNote();
  if (!area || !note) return;
  const model = note.boxes.find(b => b.id === area.dataset.btext);
  if (!model) return;
  // um instantâneo por sessão de escrita: o Ctrl+Z do quadro devolve o texto
  // como ele estava antes de a caixa ganhar o foco
  if (!noteTextSnap) { pushNoteUndo(note); noteTextSnap = true; }
  model.text = area.value;
  clearTimeout(noteTextTimer);
  // o texto é lido da caixa no momento de gravar: entretanto o estado pode
  // ter sido substituído por outra resposta do servidor
  noteTextTimer = setTimeout(() => {
    noteTextTimer = null;
    postNotepad({ action: "update_box", id: note.id, box_id: model.id, text: area.value }, true);
  }, 700);
});

$("noteCanvas").addEventListener("focusin", e => {
  const pair = noteEditPair(e.target);
  if (!pair) return;
  noteTyping = true;
  noteTextSnap = false;
  const id = pair.area.dataset.btext;
  if (!noteSelBoxes.includes(id)) selectBox(id);
});

$("noteCanvas").addEventListener("focusout", e => {
  const pair = noteEditPair(e.target);
  const note = currentNote();
  noteTyping = false;
  noteTextSnap = false;
  if (!pair) return;
  const area = pair.area;
  endNoteEdit(pair.view);   // a vista deixa de receber texto
  if (!note) return;
  const model = note.boxes.find(b => b.id === area.dataset.btext);
  if (!model || model.text === area.value && !noteTextTimer) return;
  flushNoteText();
  model.text = area.value;
  postNotepad({ action: "update_box", id: note.id, box_id: model.id, text: model.text }, true);
});

// ---------- colar printscreens ----------
function readAsBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function imageBoxSize(file) {
  return new Promise(res => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 420 / img.naturalWidth, 320 / img.naturalHeight);
      URL.revokeObjectURL(url);
      res({
        w: Math.max(NOTE_MIN_W, Math.round(img.naturalWidth * scale) + 14),
        h: Math.max(NOTE_MIN_H, Math.round(img.naturalHeight * scale) + 62),
      });
    };
    img.onerror = () => { URL.revokeObjectURL(url); res({ w: 300, h: 220 }); };
    img.src = url;
  });
}

async function pasteImageBox(file) {
  const note = currentNote();
  if (!note) return;
  if (file.size > 8 * 1024 * 1024) { toast(t("note_img_big"), "err"); return; }
  const size = await imageBoxSize(file);
  const data = await readAsBase64(file);
  // cai ao lado do último ponto tocado, com um desvio por cada caixa já lá
  const step = (note.boxes.length % 6) * 18;
  pushNoteUndo(note);
  await postNotepad({
    action: "add_box", id: note.id,
    x: Math.min(NOTE_BOARD - size.w, notePoint.x + step),
    y: Math.min(NOTE_BOARD - size.h, notePoint.y + step),
    w: size.w, h: size.h, color: "plain",
    image_name: file.name || "printscreen.png", image_data: data,
  });
}

document.addEventListener("paste", async e => {
  if (!notesVisible() || !currentNote()) return;
  const imgs = [...((e.clipboardData && e.clipboardData.items) || [])]
    .filter(it => it.type && it.type.startsWith("image/"));
  if (imgs.length) {
    e.preventDefault();
    for (const it of imgs) {
      const file = it.getAsFile();
      if (file) await pasteImageBox(file);
    }
    return;
  }
  // sem imagem na área de transferência: colar as caixas copiadas com Ctrl+C
  // (dentro de um texto não, para lá continuar a colar-se texto normalmente)
  if (!noteClip.length || noteTextFocused()) return;
  e.preventDefault();
  await pasteNoteClip();
});

// ---------- copiar/colar caixas (só dentro desta janela) ----------
function copyNoteSel() {
  const note = currentNote();
  if (!note) return;
  noteClip = noteSelBoxes
    .map(id => note.boxes.find(b => b.id === id))
    .filter(Boolean)
    .map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, text: b.text, color: b.color, image: b.image }));
  if (noteClip.length) toast(tf("note_copied", noteClip.length), "ok");
}

// cada cópia cai um pouco ao lado da original; colar outra vez volta a descer
async function pasteNoteClip() {
  const note = currentNote();
  if (!note || !noteClip.length) return;
  const boxes = noteClip.map(b => ({
    ...b,
    x: Math.min(NOTE_BOARD - b.w, b.x + NOTE_PASTE_OFFSET),
    y: Math.min(NOTE_BOARD - b.h, b.y + NOTE_PASTE_OFFSET),
  }));
  pushNoteUndo(note);
  const out = await postNotepad({ action: "paste_boxes", id: note.id, boxes });
  if (!out) return;
  noteClip = boxes;
  noteSelBoxes = out.notepad.new_boxes || [];
  noteDrawSel = [];
  paintNoteSel();
}

document.addEventListener("copy", e => {
  if (!notesVisible() || noteTextFocused()) return;
  if (!currentNote() || !noteSelBoxes.length) return;
  e.preventDefault();
  copyNoteSel();
});

loadNotepad();
