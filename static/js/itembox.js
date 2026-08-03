// My Organizer — caixa de detalhe: clicar num item abre-o numa caixa grande
// A caixa não é uma fotografia: os estados, a OBS, as notas e as subtarefas são
// os mesmos controlos das listas, por isso edita-se tudo aqui dentro.

// Elementos que já têm ação própria (editores, botões, arrastar texto): um
// clique neles nunca deve abrir a caixa.
const BOX_SKIP = [
  "button", "input", "select", "textarea", "a", "label", "[contenteditable]",
  ".badge[data-col]", "[data-obsxlrow]", "[data-todoxlrow]", "[data-fnxlrow]",
  ".execCell", "td.ccrNote",
  "[data-tnote]", "[data-ttitle]", "[data-tsubedit]", ".editActions",
].join(", ");

// Itens que podem ser abertos em caixa (tarefas, CCRs, TODO em lista e Kanban)
const BOX_ITEMS = "#tbody tr, #ccrBody tr, #todoBody tr, .todoCard";

// Controlos que não fazem sentido dentro da caixa: apagar o item que se está a
// ver e arrastá-lo para o ecrã dividido
const BOX_STRIP = ".ccr-x, .srcBtn";

// Partes decorativas que não fazem parte do nome do item
const BOX_TITLE_STRIP = ".todoRowFlag, .todoCardFlag, .chip, .badge, .todoSubProgress";

// item que está na caixa, para a reconstruir depois de cada gravação
let itemBoxRef = null;

function boxCellNode(node) {
  const c = node.cloneNode(true);
  c.querySelectorAll(BOX_STRIP).forEach(n => n.remove());
  // as células de controlo trazem larguras de tabela que não servem na caixa
  c.style.width = "";
  return c.innerHTML.trim() ? c : null;
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

// Campos da caixa: uma entrada por célula com conteúdo. A célula é clonada tal
// como está (classes e data-*), para os editores das listas funcionarem aqui.
function itemBoxFields(el) {
  const out = [];
  if (el.matches(".todoCard")) {
    [...el.children].forEach(n => {
      const node = boxCellNode(n);
      if (node) out.push({ label: "", node });
    });
    return out;
  }
  const ths = [...(el.closest("table") || el).querySelectorAll("thead th")];
  [...el.children].forEach(td => {
    const node = boxCellNode(td);
    if (!node) return;
    const th = ths[td.cellIndex];
    out.push({ label: td.dataset.label || (th ? th.textContent.trim() : ""), node });
  });
  return out;
}

function fillItemBox(el) {
  const fields = itemBoxFields(el);
  if (!fields.length) return false;
  $("itemTitle").textContent = itemBoxTitle(el);
  const body = $("itemBody");
  body.innerHTML = "";
  fields.forEach(f => {
    const wrap = document.createElement("div");
    wrap.className = "itemField";
    if (f.label) {
      const lbl = document.createElement("span");
      lbl.className = "itemLabel";
      lbl.textContent = f.label;
      wrap.appendChild(lbl);
    }
    f.node.classList.add("itemValue");
    wrap.appendChild(f.node);
    body.appendChild(wrap);
  });
  return true;
}

// ---------- saber que item está na caixa, para o voltar a ler ----------

function taskRowKey(tr) {
  const ri = [...tr.parentNode.children].indexOf(tr);
  const m = currentMeta[ri];
  return m ? `m:${m.fn}\u001F${m.todo}` : `t:${(tr.cells[0] || {}).innerText || ""}`;
}

function itemBoxRefOf(el) {
  if (el.dataset.tid) return { kind: "todo", key: el.dataset.tid };
  if (el.closest("#ccrBody")) {
    const nid = el.querySelector("[data-nid]");
    return nid ? { kind: "ccr", key: nid.dataset.nid } : null;
  }
  if (el.closest("#tbody")) return { kind: "task", key: taskRowKey(el) };
  return null;
}

function itemBoxEl(ref) {
  if (!ref) return null;
  if (ref.kind === "todo")
    return [...document.querySelectorAll("#todoBody tr[data-tid], #todoBoard .todoCard[data-tid]")]
      .find(n => n.dataset.tid === ref.key) || null;
  if (ref.kind === "ccr")
    return [...$("ccrBody").rows].find(tr => {
      const nid = tr.querySelector("[data-nid]");
      return nid && nid.dataset.nid === ref.key;
    }) || null;
  return [...$("tbody").rows].find(tr => taskRowKey(tr) === ref.key) || null;
}

// Depois de cada render das listas a caixa volta a ler o item, para mostrar o
// que ficou gravado. Com um editor aberto lá dentro não se mexe em nada.
// Exceção: os campos de texto livre que não guardam nada por gravar (o "Novo
// passo..." da checklist e o campo para ligar uma issue do Jira) também põem o
// editorOpen a true enquanto estão focados, e o Enter deles não tira o foco —
// sem esta exceção a caixa nunca se refazia e o passo acabado de acrescentar só
// aparecia depois de a fechar e abrir. O foco volta para o campo equivalente já
// refeito, para se poder escrever logo o passo seguinte.
function refreshItemBox() {
  if (!itemBoxRef || $("itemOverlay").classList.contains("hidden")) return;
  const body = $("itemBody");
  const active = document.activeElement;
  const keepFocusSel = active && body.contains(active) && active.matches(".todoSubInput, .todoJiraLinkInput")
    ? (active.classList.contains("todoJiraLinkInput") ? ".todoJiraLinkInput" : ".todoSubInput")
    : null;
  // um editor de célula (OBS/nota/estado/...) ainda aberto na mesma caixa não
  // pode ser destruído só porque o foco está agora no campo da subtarefa —
  // esses editores só marcam editorOpen=false quando se guarda/cancela, nunca
  // ao perder o foco, por isso a exceção acima não chega sozinha
  const hasPendingEditor = !!body.querySelector('[data-editing="1"]');
  if (editorOpen && (!keepFocusSel || hasPendingEditor)) return;
  const el = itemBoxEl(itemBoxRef);
  // o item deixou de existir (apagado, ou fora do filtro): fechar a caixa
  if (!el) { setItemBoxOpen(false); return; }
  const top = body.scrollTop;
  fillItemBox(el);
  body.scrollTop = top;
  if (keepFocusSel) {
    const again = body.querySelector(keepFocusSel);
    if (again) again.focus();
  }
}

function openItemBox(el) {
  if (!fillItemBox(el)) return;
  itemBoxRef = itemBoxRefOf(el);
  $("itemBody").scrollTop = 0;
  $("itemOverlay").classList.remove("hidden");
}

function setItemBoxOpen(open) {
  $("itemOverlay").classList.toggle("hidden", !open);
  if (!open) itemBoxRef = null;
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

// Os mesmos tratadores das listas — é isto que torna a caixa editável.
$("itemBody").addEventListener("click", tbodyTap);
$("itemBody").addEventListener("click", ccrBodyTap);
$("itemBody").addEventListener("click", todoItemTap);
$("itemBody").addEventListener("change", ccrBodyChange);
$("itemBody").addEventListener("change", todoItemChange);
$("itemBody").addEventListener("contextmenu", todoItemContext);
$("itemBody").addEventListener("keydown", handleSubtaskKeydown);
$("itemBody").addEventListener("keydown", e => handleJiraLinkKeydown(e));
$("itemBody").addEventListener("focusin", todoSubFocusIn);
$("itemBody").addEventListener("focusout", todoSubFocusOut);

$("itemOverlay").addEventListener("click", e => {
  if (e.target === $("itemOverlay")) setItemBoxOpen(false);
});

document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || $("itemOverlay").classList.contains("hidden")) return;
  // com a caixa aberta o Esc fecha-a e mais nada (não sai do ecrã dividido)
  e.stopImmediatePropagation();
  setItemBoxOpen(false);
});
