// My Organizer — utilitários de texto e estados

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function norm(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function statusClass(text) {
  const t = norm(text);
  if (/(conclu|done|closed|fechad|complet|finaliz|\bok\b)/.test(t)) return "done";
  if (/(progress|em curso|ongoing|doing|andamento|review|analise)/.test(t)) return "doing";
  if (/(bloq|blocked|impedid|on hold|hold|stuck)/.test(t)) return "blocked";
  return "other";
}

function statusBadges(text) {
  return String(text).split("\n").filter(l => l.trim()).map(l =>
    `<span class="badge ${statusClass(l)}">${esc(l)}</span>`
  ).join("<br>");
}

function isStatusHeader(header) {
  return /(estado|status|situa|state)/i.test(header);
}

// botões de um editor: só o símbolo (o nome fica no tooltip), para a célula
// não ficar cheia de texto
const ICON_TRASH = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">' +
  '<path fill="currentColor" d="M6.2 1.6h3.6l.6 1.1H14v1.5H2V2.7h3.6l.6-1.1zM3.6 5.4h8.8l-.7 8.2c-.06.7-.64 1.2-1.3 1.2H5.6c-.67 0-1.25-.5-1.3-1.2L3.6 5.4z"/></svg>';

function editActions() {
  const btn = (cls, kind, symbol, key) =>
    `<button type="button" class="iconbtn ${kind} ${cls}" title="${t(key)}" aria-label="${t(key)}">${symbol}</button>`;
  return `<div class="editActions">` +
    btn("actSave", "ok", "✓", "btn_save") +
    btn("actCancel", "neutral", "✕", "btn_cancel") +
    btn("actClear", "danger", ICON_TRASH, "btn_clear") +
    `</div>`;
}

function statusLines(value) {
  return String(value || "").split("\n")
    .map(l => l.replace(/^TC: |^TP: /, "").trim())
    .filter(Boolean);
}

/* De que lado está a bola, dado o meu papel e o estado dessa vertente.
   Autor:    a trabalhar → meu lado; em review → do outro lado.
   Reviewer: em review → meu lado; a trabalhar → do outro lado.
   Removidas/canceladas não estão do lado de ninguém. */
function sideOf(role, status) {
  const t = norm(status);
  if (!t || t === "n/a") return null;
  if (/(remov|cancel)/.test(t)) return "Removed";
  if (/(done|conclu|closed|complet|finaliz)/.test(t)) return "Done";
  const reviewing = /review/.test(t);
  if (role === "Reviewer") return reviewing ? "On my side" : "On the other side";
  return reviewing ? "On the other side" : "On my side";
}
