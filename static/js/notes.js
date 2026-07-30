// My Organizer — quadro de notas: caixas soltas com texto e printscreens,
// arrumadas em pastas e ligadas (se quiseres) a uma tarefa do Excel.

let notepad = { folders: [], notes: [] };
let noteId = localStorage.getItem("bsp-tracker-note") || "";
// pastas fechadas na coluna da esquerda (por omissão está tudo aberto)
const noteShut = new Set((() => {
  try { return JSON.parse(localStorage.getItem("bsp-tracker-note-shut") || "[]"); }
  catch (e) { return []; }
})());
let noteBoxSel = null;      // caixa selecionada — é nela que o Ctrl+V cola
let noteTyping = false;     // texto a ser escrito: não refazer o quadro por baixo
let noteTextTimer = null;   // gravação do texto com atraso
let notePoint = { x: 24, y: 24 };   // último ponto tocado no quadro
const NOTE_MIN_W = 120, NOTE_MIN_H = 80;
const NOTE_BOARD = 4000;

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
  noteBoxSel = null;
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
    norm((n.ref && n.ref.label) || "").includes(q) ||
    n.boxes.some(b => norm(b.text).includes(q));
}

function noteRowHtml(n, depth) {
  const bits = [];
  if (n.ref) bits.push(`📌 ${n.ref.label || n.ref.fn || n.ref.ccr || ""}`);
  bits.push(`${n.boxes.length} ${t(n.boxes.length === 1 ? "note_box_1" : "note_boxes")}`);
  if (n.updated) bits.push(n.updated);
  return `<button type="button" class="noteRow${n.id === noteId ? " active" : ""}" data-nopen="${esc(n.id)}"
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
    html += `<div class="noteFolder" style="padding-left:${depth * 12}px">
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
  // sem pesquisa e sem notas o estado vazio do quadro já explica tudo
  $("noteTree").innerHTML = html || (q ? `<div class="noteTreeEmpty">${esc(t("note_none"))}</div>` : "");
  const sel = $("noteFolderSel");
  const note = currentNote();
  sel.innerHTML = `<option value="">${esc(t("note_root"))}</option>` +
    notepad.folders.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("");
  sel.value = note ? note.folder : "";
}

// ---------- quadro ----------
function noteBoxHtml(b) {
  const img = b.image
    ? `<img class="noteBoxImg" src="/api/notepad/img/${encodeURIComponent(b.image)}" alt="">`
    : "";
  return `<div class="noteBox c-${esc(b.color)}${b.id === noteBoxSel ? " sel" : ""}" data-bid="${esc(b.id)}"
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

function renderNoteBoard(focusBoxId) {
  const note = currentNote();
  const has = !!note;
  $("notesHead").classList.toggle("hidden", !has);
  $("noteCanvas").classList.toggle("hidden", !has);
  $("noteEmpty").classList.toggle("hidden", has);
  if (!has) return;
  if (document.activeElement !== $("noteTitle")) $("noteTitle").value = note.title;
  renderNoteLink(note);
  if (noteTyping && !focusBoxId) return;   // a escrever: não mexer nas caixas
  const canvas = $("noteCanvas");
  const scroll = { left: canvas.scrollLeft, top: canvas.scrollTop };
  canvas.innerHTML = `<div class="noteCanvasHint" id="noteCanvasHint">${
    note.boxes.length ? "" : esc(t("note_canvas_hint"))}</div>` +
    note.boxes.map(noteBoxHtml).join("");
  canvas.scrollLeft = scroll.left;
  canvas.scrollTop = scroll.top;
  if (focusBoxId) {
    const area = canvas.querySelector(`[data-btext="${CSS.escape(focusBoxId)}"]`);
    if (area) area.focus();
  }
}

function renderNoteLink(note) {
  const old = $("noteLinkChip");
  if (old) old.remove();
  $("noteLinkBtn").classList.toggle("hidden", !!note.ref);
  if (!note.ref) return;
  const chip = document.createElement("span");
  chip.className = "noteLinkChip";
  chip.id = "noteLinkChip";
  chip.innerHTML = `<button type="button" class="noteLinkName" data-nogo="1"
      title="${esc(t("t_note_open_task"))}">📌 ${esc(note.ref.label || note.ref.fn || note.ref.ccr || "")}</button>
    <button type="button" data-nounlink="1" title="${esc(t("note_unlink"))}">✕</button>`;
  $("noteLinkBtn").insertAdjacentElement("beforebegin", chip);
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

$("noteTitle").addEventListener("change", async () => {
  const note = currentNote();
  const title = $("noteTitle").value.trim();
  if (!note || !title || title === note.title) { renderNoteBoard(); return; }
  await postNotepad({ action: "rename_note", id: note.id, title });
});

$("noteFolderSel").addEventListener("change", async () => {
  const note = currentNote();
  if (!note) return;
  await postNotepad({ action: "move_note", id: note.id, folder: $("noteFolderSel").value });
});

$("noteDel").addEventListener("click", async () => {
  const note = currentNote();
  if (!note || !confirm(tf("cfm_del_note", note.title))) return;
  const out = await postNotepad({ action: "delete_note", id: note.id });
  if (out) setCurrentNote((out.notepad.notes[0] || {}).id);
});

// ---------- ligação a uma tarefa ----------
$("notesHead").addEventListener("click", e => {
  const note = currentNote();
  if (!note || !note.ref) return;
  if (e.target.closest("[data-nogo]")) {
    revealSource(note.ref.kind === "ccr"
      ? { view: "ccrs", ccr: note.ref.ccr }
      : { view: "excel", fn: note.ref.fn, todo: note.ref.todo || "", sheet: note.ref.sheet || "" });
  } else if (e.target.closest("[data-nounlink]")) {
    postNotepad({ action: "set_link", id: note.id, ref: null });
  }
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
    action: "set_link", id: note.id,
    ref: { kind: "task", sheet: (lastData && lastData.sheet) || "", fn: opt.fn, todo: opt.todo, label: opt.label },
  });
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

function selectBox(id) {
  noteBoxSel = id;
  $("noteCanvas").querySelectorAll(".noteBox").forEach(el =>
    el.classList.toggle("sel", el.dataset.bid === id));
}

// arrastar em cima do quadro vazio desenha a caixa nova
function startBoxCreate(e) {
  const note = currentNote();
  if (!note) return;
  const start = canvasPoint(e);
  notePoint = start;
  selectBox(null);
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
    if (w < 40 || h < 30) return;   // clique simples: não cria nada
    postNotepad({
      action: "add_box", id: note.id,
      x: Math.min(start.x, last.x), y: Math.min(start.y, last.y),
      w: Math.max(NOTE_MIN_W, w), h: Math.max(NOTE_MIN_H, h),
    });
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
  selectBox(model.id);
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
    Object.assign(model, next);
    postNotepad({ action: "update_box", id: note.id, box_id: model.id, ...next }, true);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

$("noteCanvas").addEventListener("pointerdown", e => {
  if (e.button !== 0) return;
  const box = e.target.closest(".noteBox");
  if (!box) { startBoxCreate(e); return; }
  if (e.target.closest("[data-bsize]")) { startBoxDrag(e, box, "size"); return; }
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
    postNotepad({ action: "delete_box", id: note.id, box_id: del.dataset.bdel });
    return;
  }
  const color = e.target.closest("[data-bcolor]");
  if (color) {
    const box = note.boxes.find(b => b.id === color.dataset.bcolor);
    if (!box) return;
    const next = NOTE_COLORS[(NOTE_COLORS.indexOf(box.color) + 1) % NOTE_COLORS.length];
    postNotepad({ action: "update_box", id: note.id, box_id: box.id, color: next });
  }
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
  selectBox(area.dataset.btext);
});

$("noteCanvas").addEventListener("focusout", e => {
  const area = e.target.closest("[data-btext]");
  const note = currentNote();
  noteTyping = false;
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
  if (!imgs.length) return;
  e.preventDefault();
  for (const it of imgs) {
    const file = it.getAsFile();
    if (file) await pasteImageBox(file);
  }
});

loadNotepad();
