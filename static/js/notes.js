// My Organizer — quadro de notas: caixas soltas com texto e printscreens,
// arrumadas em pastas e ligadas (se quiseres) a uma tarefa do Excel.

let notepad = { folders: [], notes: [] };
let noteId = localStorage.getItem("bsp-tracker-note") || "";
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
let noteTool = "select";      // "select" | "pen" | "line" | "rect" | "ellipse" | "connector" | "frame"
let noteStrokeColor = "yellow";
let noteDrawSel = [];         // [{ type: "stroke"|"shape"|"connector", id }] selecionados
let noteConnectFrom = null;   // { id } da caixa já escolhida ao ligar duas caixas
let noteClip = [];            // caixas copiadas com Ctrl+C (só nesta janela)
const NOTE_MIN_W = 120, NOTE_MIN_H = 80;
const NOTE_BOARD = 4000;
const NOTE_PASTE_OFFSET = 24;   // desvio da cópia colada em relação à original

// histórico por nota: pilha de instantâneos do quadro para o Ctrl+Z
const noteUndo = new Map();
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
  localStorage.setItem("bsp-tracker-note", noteId);
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
  if (!noteById(noteId)) noteId = (notepad.notes[0] || {}).id || "";
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
  return `<button type="button" class="noteRow${n.id === noteId ? " active" : ""}" data-nopen="${esc(n.id)}"
    draggable="true" data-nid="${esc(n.id)}"
    style="padding-left:${8 + depth * 12}px">
    <span class="noteRowTitle">${esc(n.title)}</span>
    <span class="noteRowMeta">${esc(bits.join(" · "))}</span></button>`;
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
  const root = `<div class="noteRootDrop" data-frootdrop="1" title="${esc(t("t_note_drop_root"))}">🏠</div>`;
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

// ---------- escolher a pasta (grupo) da nota no cabeçalho ----------
const NOTE_FOLDER_NEW = "nova";   // valor da opção "+ Nova pasta…"

// a hierarquia das pastas é dada pela indentação (com espaços inquebráveis,
// que as <option> não descartam)
function noteFolderOptionsHtml(parent, depth) {
  let html = "";
  for (const f of notepad.folders.filter(x => x.parent === parent)) {
    const pad = "  ".repeat(depth);
    html += `<option value="${esc(f.id)}">${esc(`${pad}${depth ? "└ " : ""}${f.name}`)}</option>` +
      noteFolderOptionsHtml(f.id, depth + 1);
  }
  return html;
}

function renderNoteFolderSel(note) {
  const sel = $("noteFolderSelect");
  sel.innerHTML = `<option value="">${esc(t("note_folder_root"))}</option>` +
    noteFolderOptionsHtml("", 0) +
    `<option value="${NOTE_FOLDER_NEW}">${esc(t("note_folder_add"))}</option>`;
  sel.value = note.folder || "";
}

$("noteFolderSelect").addEventListener("change", async () => {
  const sel = $("noteFolderSelect");
  const note = currentNote();
  if (!note) return;
  const target = sel.value;
  if (target === NOTE_FOLDER_NEW) {
    sel.value = note.folder || "";   // a opção não é uma pasta: não fica escolhida
    const name = prompt(t("note_ask_folder"), t("note_folder_new"));
    if (name === null || !name.trim()) return;
    // a pasta nova nasce dentro da pasta atual da nota (ou na raiz, se não tiver)
    const out = await postNotepad({ action: "add_folder", name: name.trim(), parent: note.folder }, true);
    if (!out) return;
    const created = (out.notepad.folders[out.notepad.folders.length - 1] || {}).id || "";
    if (!await postNotepad({ action: "move_note", id: note.id, folder: created })) return;
    revealFolder(created);
    return;
  }
  if (target === (note.folder || "")) return;
  if (!await postNotepad({ action: "move_note", id: note.id, folder: target })) return;
  revealFolder(target);
});

// ---------- quadro ----------
function noteBoxHtml(b) {
  const img = b.image
    ? `<img class="noteBoxImg" src="/api/notepad/img/${encodeURIComponent(b.image)}" alt="">`
    : "";
  return `<div class="noteBox c-${esc(b.color)}${noteSelBoxes.includes(b.id) ? " sel" : ""}" data-bid="${esc(b.id)}"
    style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px">
    <div class="noteBoxBar" title="${esc(t("t_box_drag"))}">
      <span class="noteBoxGrip">⠿</span>
      <button type="button" class="noteBoxColor" data-bcolor="${esc(b.id)}" title="${esc(t("t_box_color"))}"></button>
      <button type="button" data-bdel="${esc(b.id)}" title="${esc(t("t_box_del"))}">✕</button>
    </div>
    <div class="noteBoxBody">${img}<textarea class="noteBoxText" data-btext="${esc(b.id)}"
      placeholder="${esc(t("ph_box"))}">${esc(b.text)}</textarea></div>
    <div class="noteBoxSize" data-bsize="${esc(b.id)}" title="${esc(t("t_box_size"))}"></div>
  </div>`;
}

// moldura de grupo: só a barra e o canto recebem cliques (ver notes.css), para
// as caixas lá dentro continuarem a funcionar normalmente
function noteFrameHtml(f) {
  return `<div class="noteFrame" data-fmid="${esc(f.id)}"
    style="left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px">
    <div class="noteFrameBar" title="${esc(t("t_frame_drag"))}">
      <span class="noteFrameName" data-frmrename="${esc(f.id)}" title="${esc(t("t_note_rename"))}">${esc(f.name)}</span>
      <button type="button" data-frmdel="${esc(f.id)}" title="${esc(t("t_frame_del"))}">✕</button>
    </div>
    <div class="noteFrameSize" data-frmsize="${esc(f.id)}"></div>
  </div>`;
}

// ---------- camada de desenho: traços à mão e formas ----------
function svgPoints(points) {
  return points.map(p => `${p.x},${p.y}`).join(" ");
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

// ligação entre duas caixas: linha de centro a centro, refeita sempre que as
// caixas mudam de sítio
function noteConnectorSvg(note, c) {
  const a = note.boxes.find(b => b.id === c.from);
  const b = note.boxes.find(b => b.id === c.to);
  if (!a || !b) return "";
  const sel = drawSelHas("connector", c.id) ? " sel" : "";
  return `<line class="noteConnector c-${esc(c.color)}${sel}" data-cid="${esc(c.id)}"
    x1="${a.x + a.w / 2}" y1="${a.y + a.h / 2}" x2="${b.x + b.w / 2}" y2="${b.y + b.h / 2}" stroke-width="2"/>`;
}

function noteDrawSvgInner(note) {
  return (note.connectors || []).map(c => noteConnectorSvg(note, c)).join("") +
    (note.strokes || []).map(noteStrokeSvg).join("") +
    (note.shapes || []).map(noteShapeSvg).join("");
}

function renderNoteBoard(focusBoxId) {
  const note = currentNote();
  const has = !!note;
  $("notesHead").classList.toggle("hidden", !has);
  $("noteCanvas").classList.toggle("hidden", !has);
  $("noteEmpty").classList.toggle("hidden", has);
  renderNoteUndoBtn();
  if (!has) return;
  if (document.activeElement !== $("notePathInput")) $("notePathInput").value = notePathString(note);
  renderNoteFolderSel(note);
  renderNoteLink(note);
  if (noteTyping && !focusBoxId) return;   // a escrever: não mexer nas caixas
  const canvas = $("noteCanvas");
  const scroll = { left: canvas.scrollLeft, top: canvas.scrollTop };
  canvas.innerHTML = `<svg class="noteDrawLayer" id="noteDrawLayer" width="${NOTE_BOARD}" height="${NOTE_BOARD}">${noteDrawSvgInner(note)}</svg>` +
    (note.frames || []).map(noteFrameHtml).join("") +
    `<div class="noteCanvasHint" id="noteCanvasHint">${
      note.boxes.length ? "" : esc(t("note_canvas_hint"))}</div>` +
    note.boxes.map(noteBoxHtml).join("");
  canvas.scrollLeft = scroll.left;
  canvas.scrollTop = scroll.top;
  if (focusBoxId) {
    const area = canvas.querySelector(`[data-btext="${CSS.escape(focusBoxId)}"]`);
    if (area) area.focus();
  }
}

function noteRefLabel(ref) {
  return ref.label || ref.fn || ref.ccr || "";
}

function notesForTask(fn, todo) {
  return notepad.notes.filter(n => (n.refs || []).some(r => r.kind === "task" && r.fn === fn && (r.todo || "") === (todo || "")));
}

function notesForCcr(ccrId) {
  return notepad.notes.filter(n => (n.refs || []).some(r => r.kind === "ccr" && r.ccr === ccrId));
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
  const del = e.target.closest("[data-fdel]");
  if (del) {
    const folder = notepad.folders.find(f => f.id === del.dataset.fdel);
    if (!folder || !confirm(tf("cfm_del_folder", folder.name))) return;
    await postNotepad({ action: "delete_folder", id: folder.id });
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

$("noteDel").addEventListener("click", async () => {
  const note = currentNote();
  if (!note || !confirm(tf("cfm_del_note", note.title))) return;
  const out = await postNotepad({ action: "delete_note", id: note.id });
  if (!out) return;
  noteUndo.delete(note.id);   // a nota já não existe: histórico fora
  setCurrentNote((out.notepad.notes[0] || {}).id);
});

// ---------- ligação a uma tarefa ----------
$("notesHead").addEventListener("click", e => {
  const note = currentNote();
  if (!note) return;
  const go = e.target.closest("[data-nogo]");
  if (go) {
    const ref = (note.refs || [])[+go.dataset.nogo];
    if (!ref) return;
    revealSource(ref.kind === "ccr"
      ? { view: "ccrs", ccr: ref.ccr }
      : { view: "excel", fn: ref.fn, todo: ref.todo || "", sheet: ref.sheet || "" });
    return;
  }
  const un = e.target.closest("[data-nounlink]");
  if (!un) return;
  const ref = (note.refs || [])[+un.dataset.nounlink];
  if (!ref) return;
  postNotepad({ action: "remove_link", id: note.id, ref }).then(() => { render(); renderCCRs(); });
});

function noteLinkOptions() {
  const compact = lastData && !lastData.error && lastData.headers ? buildCompact(lastData) : null;
  return (compact ? compact.rows : []).map(r => {
    const meta = r[6] || {};
    return {
      fn: meta.fn || r[0], todo: meta.todo || "",
      label: r[0], sub: String(r[3] || "").split("\u001F")[0].split("\n")[0],
    };
  });
}

let noteLinkRows = [];

function renderNoteLinkList() {
  const all = noteLinkOptions();
  const q = norm($("noteLinkSearch").value || "");
  noteLinkRows = all.filter(o => !q || norm(o.label + " " + o.sub).includes(q)).slice(0, 200);
  $("noteLinkBody").innerHTML = noteLinkRows.length
    ? noteLinkRows.map((o, i) => `<button type="button" class="pickRow" data-nlink="${i}">
        <span class="pickIcon">▤</span>
        <span class="pickName">${esc(o.label)}<span class="pickSub">${esc(o.sub)}</span></span></button>`).join("")
    : `<div class="noteTreeEmpty">${esc(t(all.length ? "none_search" : "note_no_tasks"))}</div>`;
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
  postNotepad({
    action: "add_link", id: note.id,
    ref: { kind: "task", sheet: (lastData && lastData.sheet) || "", fn: opt.fn, todo: opt.todo, label: opt.label },
  }).then(() => { render(); renderCCRs(); });
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
    x: Math.max(0, Math.min(NOTE_BOARD, e.clientX - rect.left + canvas.scrollLeft)),
    y: Math.max(0, Math.min(NOTE_BOARD, e.clientY - rect.top + canvas.scrollTop)),
  };
}

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
  const layer = $("noteDrawLayer");
  if (!layer) return;
  layer.querySelectorAll(".sel").forEach(el => el.classList.remove("sel"));
  for (const s of noteDrawSel) {
    const el = layer.querySelector(`[${drawSelAttr(s.type)}="${CSS.escape(s.id)}"]`);
    if (el) el.classList.add("sel");
  }
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

// ---------- reverter (Ctrl+Z): histórico do quadro só nesta janela ----------
// guarda como está o quadro ANTES de o alterar; o botão ↺ volta a esse estado
function pushNoteUndo(note) {
  const target = note || currentNote();
  if (!target) return;
  const stack = noteUndo.get(target.id) || [];
  stack.push({
    boxes: JSON.parse(JSON.stringify(target.boxes || [])),
    strokes: JSON.parse(JSON.stringify(target.strokes || [])),
    shapes: JSON.parse(JSON.stringify(target.shapes || [])),
    connectors: JSON.parse(JSON.stringify(target.connectors || [])),
    frames: JSON.parse(JSON.stringify(target.frames || [])),
  });
  while (stack.length > NOTE_UNDO_MAX) stack.shift();
  noteUndo.set(target.id, stack);
  renderNoteUndoBtn();
}

function noteUndoStack() {
  const note = currentNote();
  return note ? (noteUndo.get(note.id) || []) : [];
}

function renderNoteUndoBtn() {
  const btn = $("noteUndoBtn");
  if (btn) btn.disabled = !noteUndoStack().length;
}

async function revertNote() {
  const note = currentNote();
  if (!note) return;
  const stack = noteUndo.get(note.id) || [];
  const snap = stack[stack.length - 1];
  if (!snap) { toast(t("note_undo_none")); return; }
  flushNoteText();   // o texto pendente não pode gravar depois de reverter
  noteTyping = false;
  noteTextSnap = false;
  noteSelBoxes = [];
  noteDrawSel = [];
  const out = await postNotepad({ action: "restore_note", id: note.id, ...snap });
  if (out) stack.pop();   // só consome o passo de undo se a reposição foi bem sucedida
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

// arrastar no espaço vazio do quadro: se a área apanhar caixas ou desenhos,
// seleciona-os; se não apanhar nada, é ali que nasce a caixa nova
// (com Ctrl/Shift a área só seleciona, juntando ao que já estava escolhido)
function startCanvasBand(e) {
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
  $("noteCanvas").appendChild(band);
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
  const pts = [canvasPoint(e)];
  const el = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  el.setAttribute("class", `noteStroke c-${noteStrokeColor}`);
  el.setAttribute("fill", "none");
  el.setAttribute("stroke-width", "3");
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
  $("noteDrawLayer").appendChild(el);
  const paint = () => el.setAttribute("points", svgPoints(pts));
  paint();
  const move = ev => { pts.push(canvasPoint(ev)); paint(); };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    el.remove();
    if (pts.length < 2) return;   // clique simples: não cria nada
    pushNoteUndo(note);
    postNotepad({ action: "add_stroke", id: note.id, points: pts, color: noteStrokeColor });
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function startShapeDraw(e, kind) {
  const note = currentNote();
  if (!note) return;
  const start = canvasPoint(e);
  let last = start;
  const ns = "http://www.w3.org/2000/svg";
  const el = document.createElementNS(ns, kind === "line" ? "line" : kind === "rect" ? "rect" : "ellipse");
  el.setAttribute("class", `noteShape c-${noteStrokeColor}`);
  el.setAttribute("fill", "none");
  el.setAttribute("stroke-width", "3");
  $("noteDrawLayer").appendChild(el);

  const paint = () => {
    if (kind === "line") {
      el.setAttribute("x1", start.x); el.setAttribute("y1", start.y);
      el.setAttribute("x2", last.x); el.setAttribute("y2", last.y);
      return;
    }
    const x = Math.min(start.x, last.x), y = Math.min(start.y, last.y);
    const w = Math.abs(last.x - start.x), h = Math.abs(last.y - start.y);
    if (kind === "rect") {
      el.setAttribute("x", x); el.setAttribute("y", y);
      el.setAttribute("width", w); el.setAttribute("height", h);
    } else {
      el.setAttribute("cx", x + w / 2); el.setAttribute("cy", y + h / 2);
      el.setAttribute("rx", w / 2); el.setAttribute("ry", h / 2);
    }
  };
  paint();
  const move = ev => { last = canvasPoint(ev); paint(); };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    el.remove();
    if (Math.abs(last.x - start.x) < 4 && Math.abs(last.y - start.y) < 4) return;   // clique simples: não cria nada
    pushNoteUndo(note);
    postNotepad({ action: "add_shape", id: note.id, kind, x1: start.x, y1: start.y, x2: last.x, y2: last.y, color: noteStrokeColor });
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
  $("noteCanvas").appendChild(band);
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
// dentro dela (calculado uma vez no início do arrasto); o canto redimensiona
function startFrameDrag(e, frameEl, mode) {
  const note = currentNote();
  if (!note) return;
  const model = note.frames.find(f => f.id === frameEl.dataset.fmid);
  if (!model) return;
  e.preventDefault();
  const start = canvasPoint(e);
  const base = { x: model.x, y: model.y, w: model.w, h: model.h };
  const next = { ...base };
  const members = mode === "move"
    ? note.boxes.filter(b => b.x >= base.x && b.y >= base.y && b.x + b.w <= base.x + base.w && b.y + b.h <= base.y + base.h)
    : [];
  const memberEls = members.map(b => $("noteCanvas").querySelector(`[data-bid="${CSS.escape(b.id)}"]`));

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
    } else {
      next.w = Math.max(NOTE_MIN_W, Math.min(NOTE_BOARD, base.w + p.x - start.x));
      next.h = Math.max(NOTE_MIN_H, Math.min(NOTE_BOARD, base.h + p.y - start.y));
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
      postNotepad({ action: "update_frame", id: note.id, frame_id: model.id, w: next.w, h: next.h });
    }
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

// arrastar a barra move a caixa; o canto de baixo redimensiona-a
function startBoxDrag(e, box, mode) {
  const note = currentNote();
  if (!note) return;
  const model = note.boxes.find(b => b.id === box.dataset.bid);
  if (!model) return;
  e.preventDefault();
  // arrastar uma caixa que já faz parte de uma seleção não a desfaz
  if (!noteSelBoxes.includes(model.id)) selectBox(model.id);
  const start = canvasPoint(e);
  const base = { x: model.x, y: model.y, w: model.w, h: model.h };
  const next = { ...base };

  const move = ev => {
    const p = canvasPoint(ev);
    if (mode === "move") {
      next.x = Math.max(0, Math.min(NOTE_BOARD - base.w, base.x + p.x - start.x));
      next.y = Math.max(0, Math.min(NOTE_BOARD - base.h, base.y + p.y - start.y));
      box.style.left = next.x + "px";
      box.style.top = next.y + "px";
    } else {
      next.w = Math.max(NOTE_MIN_W, Math.min(NOTE_BOARD, base.w + p.x - start.x));
      next.h = Math.max(NOTE_MIN_H, Math.min(NOTE_BOARD, base.h + p.y - start.y));
      box.style.width = next.w + "px";
      box.style.height = next.h + "px";
    }
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    if (next.x === base.x && next.y === base.y && next.w === base.w && next.h === base.h) return;
    pushNoteUndo(note);   // antes de mexer no modelo local: guarda a posição antiga
    Object.assign(model, next);
    postNotepad({ action: "update_box", id: note.id, box_id: model.id, ...next }, true);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

$("noteCanvas").addEventListener("pointerdown", e => {
  if (e.button !== 0) return;
  if (noteTool === "pen" || noteTool === "line" || noteTool === "rect" || noteTool === "ellipse") {
    // com uma ferramenta de desenho ativa o clique é para desenhar: não dar o foco
    // (nem selecionar texto) à caixa que esteja por baixo — com `noteTyping` a true
    // o quadro não se refaz e o traço acabado de gravar não aparecia
    e.preventDefault();
    const focused = document.activeElement;
    if (focused && focused.closest && focused.closest(".noteBox")) focused.blur();
    if (noteTool === "pen") startPenDraw(e);
    else startShapeDraw(e, noteTool);
    return;
  }
  if (noteTool === "connector") { e.preventDefault(); handleConnectorClick(e); return; }

  // a moldura em si não recebe cliques: só chega aqui quando o clique caiu na
  // barra ou no canto — e aí arrasta/redimensiona seja qual for a ferramenta
  const frameEl = e.target.closest(".noteFrame");
  if (frameEl) {
    if (e.target.closest("[data-frmsize]")) { startFrameDrag(e, frameEl, "size"); return; }
    if (e.target.closest(".noteFrameBar") && !e.target.closest("button")) { startFrameDrag(e, frameEl, "move"); return; }
  }
  if (noteTool === "frame" && !frameEl) { startFrameCreate(e); return; }

  const box = e.target.closest(".noteBox");
  if (!box) { startCanvasBand(e); return; }
  if (e.target.closest("[data-bsize]")) { startBoxDrag(e, box, "size"); return; }
  // Ctrl/Cmd/Shift+clique junta (ou tira) a caixa à seleção, sem a arrastar
  // (dentro do texto não: aí o Shift+clique serve para marcar o texto)
  if ((e.ctrlKey || e.metaKey || e.shiftKey) && !e.target.closest(".noteBoxText")) {
    e.preventDefault();
    toggleBoxSel(box.dataset.bid);
    return;
  }
  if (e.target.closest(".noteBoxBar") && !e.target.closest("button")) {
    startBoxDrag(e, box, "move");
    return;
  }
  selectBox(box.dataset.bid);
  notePoint = { x: +box.style.left.replace("px", "") || 0, y: +box.style.top.replace("px", "") || 0 };
});

const NOTE_COLORS = ["yellow", "blue", "green", "pink", "plain"];

$("noteCanvas").addEventListener("click", e => {
  const note = currentNote();
  if (!note) return;
  const del = e.target.closest("[data-bdel]");
  if (del) {
    pushNoteUndo(note);
    postNotepad({ action: "delete_box", id: note.id, box_id: del.dataset.bdel });
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
  el.innerHTML = NOTE_COLORS.map(c => `<button type="button" class="noteColorDot c-${c}${
    c === current ? " active" : ""}" data-ncolor="${c}" title="${esc(t(`color_${c}`))}"></button>`).join("");
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

$("noteToolbar").addEventListener("click", e => {
  const toolBtn = e.target.closest("[data-tool]");
  if (toolBtn) { setNoteTool(toolBtn.dataset.tool); return; }
  if (e.target.closest("#noteToolColor")) {
    // a cor do traço é só do lado do browser: não há nada para gravar
    openNoteColorPop($("noteToolColor"), noteStrokeColor, next => {
      noteStrokeColor = next;
      $("noteToolColor").className = `noteToolColor c-${noteStrokeColor}`;
    });
  }
});

$("noteUndoBtn").addEventListener("click", () => revertNote());

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
  const note = currentNote();
  if (!note || !noteSelCount()) return;
  e.preventDefault();
  deleteNoteSel(note, [...noteSelBoxes], [...noteDrawSel]);
});

// Ctrl+Z reverte a última alteração do quadro (dentro de um texto o Ctrl+Z é
// o do próprio campo, para não desfazer o que se está a escrever)
document.addEventListener("keydown", e => {
  if (e.key !== "z" && e.key !== "Z") return;
  if (!e.ctrlKey && !e.metaKey) return;
  if (e.shiftKey || e.altKey) return;
  if (!notesVisible() || noteTextFocused() || !currentNote()) return;
  e.preventDefault();
  revertNote();
});

// ---------- texto das caixas ----------
function flushNoteText() {
  clearTimeout(noteTextTimer);
  noteTextTimer = null;
}

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
  const area = e.target.closest("[data-btext]");
  if (!area) return;
  noteTyping = true;
  noteTextSnap = false;
  if (!noteSelBoxes.includes(area.dataset.btext)) selectBox(area.dataset.btext);
});

$("noteCanvas").addEventListener("focusout", e => {
  const area = e.target.closest("[data-btext]");
  const note = currentNote();
  noteTyping = false;
  noteTextSnap = false;
  if (!area || !note) return;
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
