// My Organizer — caixa de detalhe: clicar num item abre-o numa caixa grande

// Elementos que já têm ação própria (editores, botões, arrastar texto): um
// clique neles nunca deve abrir a caixa.
const BOX_SKIP = [
  "button", "input", "select", "textarea", "a", "label", "[contenteditable]",
  ".badge[data-col]", "[data-obsri]", "td.execCell", "td.ccrNote",
  "[data-tnote]", "[data-ttitle]", "[data-tsubedit]", ".editActions",
].join(", ");

// Itens que podem ser abertos em caixa (tarefas, CCRs, TODO em lista e Kanban)
const BOX_ITEMS = "#tbody tr, #ccrBody tr, #todoBody tr, .todoCard";

// Controlos que não fazem sentido dentro da caixa (só se veem na lista)
const BOX_STRIP = ".ccr-x, .todoActionBtn, .srcBtn, .todoSubAddRow, .editActions, .addnote, .todoTimerReset";

// Partes decorativas que não fazem parte do nome do item
const BOX_TITLE_STRIP = ".todoRowFlag, .todoCardFlag, .chip, .badge, .todoSubProgress";

function boxCellHtml(node) {
  const c = node.cloneNode(true);
  c.querySelectorAll(BOX_STRIP).forEach(n => n.remove());
  // dentro da caixa nada é editável: fora as dicas de "clica para…"
  c.querySelectorAll("[title]").forEach(n => n.removeAttribute("title"));
  return c.innerHTML.trim();
}

function itemBoxTitle(el) {
  const src = el.querySelector(".todoCardTitle") || el.querySelector("td.fn") ||
    [...el.children].find(n => n.innerText.trim()) || el;
  // 1.ª linha do item, sem a bandeira nem as etiquetas de origem/progresso
  let line = src.innerText.trim().split("\n")[0].trim();
  src.querySelectorAll(BOX_TITLE_STRIP).forEach(n => {
    const txt = n.innerText.trim();
    if (!txt) return;
    if (line.startsWith(txt)) line = line.slice(txt.length).trim();
    else if (line.endsWith(txt)) line = line.slice(0, -txt.length).trim();
  });
  return line.slice(0, 160) || t("item_box");
}

// Campos da caixa: uma entrada por célula com conteúdo, com o cabeçalho da
// coluna como etiqueta (nos cartões do Kanban não há cabeçalhos).
function itemBoxFields(el) {
  const out = [];
  if (el.matches(".todoCard")) {
    [...el.children].forEach(n => {
      const html = boxCellHtml(n);
      if (html) out.push({ label: "", html });
    });
    return out;
  }
  const ths = [...(el.closest("table") || el).querySelectorAll("thead th")];
  [...el.children].forEach(td => {
    if (td.classList.contains("todoActionCell")) return;
    const html = boxCellHtml(td);
    if (!html || !td.innerText.replace(/✕/g, "").trim()) return;
    const th = ths[td.cellIndex];
    out.push({ label: td.dataset.label || (th ? th.textContent.trim() : ""), html });
  });
  return out;
}

function openItemBox(el) {
  const fields = itemBoxFields(el);
  if (!fields.length) return;
  $("itemTitle").textContent = itemBoxTitle(el);
  $("itemBody").innerHTML = fields.map(f =>
    `<div class="itemField">` +
    (f.label ? `<span class="itemLabel">${esc(f.label)}</span>` : "") +
    `<div class="itemValue">${f.html}</div></div>`).join("");
  $("itemBody").scrollTop = 0;
  $("itemOverlay").classList.remove("hidden");
}

function setItemBoxOpen(open) {
  $("itemOverlay").classList.toggle("hidden", !open);
}

document.addEventListener("click", e => {
  if (editorOpen) return;
  if (!$("itemOverlay").classList.contains("hidden")) return;
  // seleção de texto com o rato não deve abrir a caixa
  if (String(window.getSelection())) return;
  if (e.target.closest(BOX_SKIP)) return;
  const el = e.target.closest(BOX_ITEMS);
  if (el) openItemBox(el);
});

$("itemClose").addEventListener("click", () => setItemBoxOpen(false));

$("itemOverlay").addEventListener("click", e => {
  if (e.target === $("itemOverlay")) setItemBoxOpen(false);
});

document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || $("itemOverlay").classList.contains("hidden")) return;
  // com a caixa aberta o Esc fecha-a e mais nada (não sai do ecrã dividido)
  e.stopImmediatePropagation();
  setItemBoxOpen(false);
});
