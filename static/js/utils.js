// My Organizer — utilitários de texto e estados

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function norm(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// escapa "text" e envolve em <strong> qualquer troço que corresponda a um dos
// "terms" (já normalizados — sem acentos, minúsculas). A comparação corre em
// norm(text): como norm() só troca/remove caracteres um-a-um (nunca junta ou
// separa), os índices encontrados aí continuam válidos na string original.
function boldTerms(text, terms) {
  const str = String(text == null ? "" : text);
  const list = (terms || []).filter(Boolean);
  if (!list.length || !str) return esc(str);
  const normStr = norm(str);
  const bold = new Array(str.length).fill(false);
  list.forEach(term => {
    let from = 0, i;
    while ((i = normStr.indexOf(term, from)) !== -1) {
      for (let k = i; k < i + term.length; k++) bold[k] = true;
      from = i + term.length;
    }
  });
  let out = "", i = 0;
  while (i < str.length) {
    let j = i;
    while (j < str.length && bold[j] === bold[i]) j++;
    out += bold[i] ? `<strong>${esc(str.slice(i, j))}</strong>` : esc(str.slice(i, j));
    i = j;
  }
  return out;
}

function statusClass(text) {
  const t = norm(text);
  // "Reviewed" (revisto) é o FIM da revisão, não uma revisão a decorrer: tem de
  // ser visto antes do ramo do "review", senão um TC já revisto ficava para
  // sempre a contar como trabalho por fechar (paradas, carga por pessoa, ⏳)
  if (/(conclu|done|closed|fechad|complet|finaliz|\breviewed\b|\brevisto\b|\bok\b)/.test(t)) return "done";
  if (/(progress|em curso|ongoing|doing|andamento|review|analise)/.test(t)) return "doing";
  if (/(bloq|blocked|impedid|on hold|hold|stuck)/.test(t)) return "blocked";
  return "other";
}

// Um estado que já não espera trabalho de ninguém. É o que se lê como feito,
// mais o que foi RETIRADO da folha ("Removed"): não é um fim feliz, mas também
// não é uma tarefa esquecida à espera de alguém — e é essa a pergunta que as
// paradas (⏳), a carga por pessoa e o painel Hoje fazem. A cor mantém-se a
// neutra: "Removed" não é um "Done" (ver statusClass).
function statusIsFinal(text) {
  return statusClass(text) === "done" || /(\bremoved\b|\bremovid)/.test(norm(text));
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

// Editor de texto livre de uma célula do Excel (OBS, "o que fazer", categorias
// da vista resumida): cresce à medida do que se escreve, para uma nota de várias
// linhas se ver toda em vez de rolar dentro de três linhas fixas. O Enter faz
// linha nova e nunca sai daqui (há tratadores de teclado por cima, na caixa de
// detalhe e nas listas, que não têm nada que ver este Enter); Ctrl/⌘+Enter é o
// atalho para gravar, equivalente ao ✓.
function autoGrowEditor(el, onSave) {
  const grow = () => {
    el.style.height = "auto";
    // +2px: sem isto o texto encosta ao fundo e aparece uma barra de rolagem
    el.style.height = `${Math.min(el.scrollHeight + 2, 320)}px`;
  };
  el.addEventListener("input", grow);
  el.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    if ((e.ctrlKey || e.metaKey) && onSave) { e.preventDefault(); onSave(); return; }
    e.stopPropagation();
  });
  grow();
}

function statusLines(value) {
  return String(value || "").split("\n")
    .map(l => l.replace(/^TC: |^TP: /, "").trim())
    .filter(Boolean);
}

// Nome da coluna do Excel a partir do número (1 -> A, 27 -> AA). É o mesmo que
// o get_column_letter do openpyxl faz do lado do servidor (cswaios/tasks.py).
function colLetters(n) {
  let num = Math.floor(+n || 0);
  let out = "";
  while (num > 0) {
    const r = (num - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    num = Math.floor((num - 1) / 26);
  }
  return out;
}
