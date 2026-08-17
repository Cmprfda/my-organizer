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
const BOX_TITLE_STRIP = ".todoRowFlag, .todoCardFlag, .chip, .badge, .todoSubProgress, .taskNoteFlag";

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
  const strips = [...src.querySelectorAll(BOX_TITLE_STRIP)]
    .map(n => n.innerText.trim()).filter(Boolean);
  // as decorações saem de fora para dentro e mais do que uma pode estar do
  // mesmo lado (ex.: "…configurações 1/3 📌"): sem repetir a passagem, tirar o
  // pino deixava o progresso colado ao nome
  let cut = true;
  while (cut) {
    cut = false;
    strips.forEach(txt => {
      if (line.startsWith(txt)) { line = line.slice(txt.length).trim(); cut = true; }
      else if (line.endsWith(txt)) { line = line.slice(0, -txt.length).trim(); cut = true; }
    });
  }
  return line.slice(0, 160) || t("item_box");
}

// ---------- campos de um item da lista Por fazer ----------
// Um item Por fazer não tem de onde tirar nomes de campos: a tabela da lista
// não tem cabeçalhos (as suas partes estão todas dentro da mesma célula) e o
// Kanban não tem células nenhumas. Aqui as partes são procuradas uma a uma e
// ganham o mesmo nome nos dois modos.

// partes com nome próprio, todas filhas diretas do conteúdo do item (a célula
// grande em lista, o cartão no Kanban) — procurar sem o ":scope >" apanharia
// também a OBS da folha, que vive lá dentro da parte "Da folha"
const TODO_BOX_PARTS = [
  { key: "ibox_todo_note", sel: ".todoNote, .obs, .todoCardDetail" },
  { key: "ibox_todo_task", sel: ".todoTaskInfo" },
  { key: "ibox_todo_links", sel: ".todoLinkList" },
  { key: "ibox_todo_subs", sel: ".todoSubList" },
  { key: "ibox_todo_jira", sel: ".todoJiraList" },
];

// controlos do item: em lista estão em células próprias, no Kanban na barra do
// fundo do cartão — nos dois casos fora da parte do nome
const TODO_BOX_CTL = [
  { key: "ibox_todo_state", sel: "input[data-tgl], .todoStatusBtn" },
  { key: "ibox_todo_prio", sel: ".todoPrioBtn" },
  { key: "ibox_todo_time", sel: ".todoTimerCell" },
];

// os ficheiros partilham o mesmo espaço global: nome próprio para não chocar
const todoScopedSel = sel => sel.split(", ").map(s => ":scope > " + s).join(", ");

function todoBoxNode(nodes) {
  const wrap = document.createElement("div");
  nodes.forEach(n => {
    // peça sem nada dentro (ex.: o cronómetro de um item que nunca correu) não
    // vale um campo; os botões e as caixas de marcar valem sempre, mesmo vazios
    if (!n.innerHTML.trim() && !n.matches("input, button")) return;
    const c = n.cloneNode(true);
    c.querySelectorAll(BOX_STRIP).forEach(x => x.remove());
    wrap.appendChild(c);
  });
  return wrap.innerHTML.trim() ? wrap : null;
}

function todoBoxFields(el) {
  // o conteúdo do item: no Kanban é o próprio cartão, em lista é a única
  // célula que não é de controlo
  const content = el.matches(".todoCard") ? el
    : [...el.children].find(n => !n.classList.contains("todoCtl")) || el;
  const partSel = TODO_BOX_PARTS.map(p => todoScopedSel(p.sel)).join(", ");
  const out = [];
  // a linha do nome é o que sobra do conteúdo depois de tirar as partes com
  // nome próprio e a barra dos controlos: bandeira, etiquetas de origem, nome
  // (editável nas tarefas escritas à mão), progresso dos passos e pino da nota
  const rest = content.cloneNode(true);
  rest.querySelectorAll(partSel + ", :scope > .todoCardMeta").forEach(n => n.remove());
  rest.querySelectorAll(BOX_STRIP).forEach(n => n.remove());
  // no cartão a bandeira é uma faixa colada ao topo (margens negativas, largura
  // toda): dentro da caixa passa a ser a mesma etiqueta pequena da lista
  rest.querySelectorAll(".todoCardFlag").forEach(n => { n.className = "todoRowFlag"; });
  if (rest.innerHTML.trim()) {
    const wrap = document.createElement("div");
    // as peças passam para um <div> em vez de irem dentro do <td> clonado, que
    // fora da tabela continuaria a ser uma célula. Os espaços entre elas ficam
    // para trás: o .itemValue respeita as quebras de linha (white-space:
    // pre-line) e a indentação do HTML abria buracos no campo.
    [...rest.childNodes].forEach(n => {
      if (n.nodeType === Node.TEXT_NODE && !n.textContent.trim()) return;
      wrap.appendChild(n);
    });
    out.push({ label: t("ibox_todo_title"), node: wrap, wide: true });
  }
  TODO_BOX_CTL.forEach(f => {
    const node = todoBoxNode([...el.querySelectorAll(f.sel)]);
    if (node) out.push({ label: t(f.key), node });
  });
  TODO_BOX_PARTS.forEach(f => {
    const node = todoBoxNode([...content.querySelectorAll(todoScopedSel(f.sel))]);
    if (node) out.push({ label: t(f.key), node });
  });
  return out;
}

// Linha das tarefas com um filtro personalizado a esconder colunas (ver
// customFilterHiddenCols/currentBoxCells, tasks.js): a tabela só tem as colunas
// à vista, mas a caixa mostra sempre o item INTEIRO — os campos vêm então da
// linha completa que o render() guardou, com o mesmo HTML de célula (classes e
// data-*, por isso os editores funcionam aqui como nos que vêm da tabela). A
// coluna de ações não é dado nenhum da folha: essa vem da própria linha.
// Devolve null quando não há nada escondido, e a caixa segue o caminho normal.
function taskBoxFieldsWhole(tr) {
  const cells = currentBoxCells && currentBoxCells[[...tr.parentNode.children].indexOf(tr)];
  if (!cells) return null;
  const out = [];
  const holder = document.createElement("tr");
  cells.forEach(c => {
    holder.innerHTML = c.html;
    const node = holder.firstElementChild && boxCellNode(holder.firstElementChild);
    if (node) out.push({ label: c.label, node });
  });
  const act = tr.querySelector("td.todoActionCell");
  const node = act && boxCellNode(act);
  if (node) {
    const ths = [...(tr.closest("table") || tr).querySelectorAll("thead th")];
    const th = ths[ths.length - 1];
    out.push({ label: th ? th.textContent.trim() : "", node });
  }
  return out.length ? out : null;
}

// Campos da caixa: uma entrada por célula com conteúdo. A célula é clonada tal
// como está (classes e data-*), para os editores das listas funcionarem aqui.
function itemBoxFields(el) {
  const out = [];
  // itens Por fazer (lista e Kanban) são montados à parte, por partes
  if (el.dataset.tid) return todoBoxFields(el);
  // um filtro personalizado pode ter escondido colunas da tabela (ver
  // customFilterHiddenCols, tasks.js): a caixa mostra o item inteiro
  if (el.closest("#tbody")) {
    const whole = taskBoxFieldsWhole(el);
    if (whole) return withTaskHistory(el, whole);
  }
  const ths = [...(el.closest("table") || el).querySelectorAll("thead th")];
  [...el.children].forEach(td => {
    const node = boxCellNode(td);
    if (!node) return;
    const th = ths[td.cellIndex];
    out.push({ label: td.dataset.label || (th ? th.textContent.trim() : ""), node });
  });
  return el.closest("#tbody") ? withTaskHistory(el, out) : out;
}

// Último campo de uma linha da folha: o que já aconteceu a esta tarefa (ver
// taskHistoryNode, history.js). Não vem de nenhuma célula — vem do histórico do
// servidor — por isso é acrescentado aqui e não sai do clone da linha.
function withTaskHistory(tr, fields) {
  const meta = currentMeta[[...tr.parentNode.children].indexOf(tr)];
  const node = meta ? taskHistoryNode(meta) : null;
  if (node) fields.push({ label: t("ibox_history"), node, wide: true });
  return fields;
}

// Valores que a folha usa para dizer "não há nada aqui" — um campo só com
// estes fica esbatido, para os campos com conteúdo saltarem à vista.
const BOX_EMPTY_VAL = /^(—|-|n\/?a|)$/i;

// Um campo ocupa a largura toda quando o conteúdo não cabe bem numa coluna:
// texto longo, listas/checklists, campos de escrita ou imagens. Uma caixa de
// marcar não conta — senão o estado de um item Por fazer, que é só a marca e o
// botão da coluna, ficava sozinho a ocupar uma linha inteira.
const BOX_RICH = 'input:not([type="checkbox"]):not([type="radio"]), textarea, ul, ol, table, img';

function fieldIsEmpty(node) {
  // o nome de cada parte (ex.: "Status TC:") e o convite a escrever ("+ nota")
  // não contam como conteúdo — só o valor que vem da folha é que diz se o
  // campo está preenchido
  const c = node.cloneNode(true);
  c.querySelectorAll("strong, .addnote").forEach(n => n.remove());
  // o clone está fora da página, por isso o innerText não vê os <br> das
  // categorias compostas (cai no textContent): as partes têm de ser separadas
  // à mão, senão "N/A" + "—" viravam uma linha só e nunca dava vazio
  c.querySelectorAll("br").forEach(n => n.replaceWith("\n"));
  return c.textContent.split("\n").every(l => BOX_EMPTY_VAL.test(l.trim()));
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
    const text = f.node.innerText.trim();
    if (f.wide || text.length > 90 || f.node.querySelector(BOX_RICH))
      wrap.classList.add("itemFieldWide");
    if (fieldIsEmpty(f.node)) wrap.classList.add("itemFieldEmpty");
    // sem nome (partes de um cartão TODO) não há campo para desenhar: ficam
    // empilhadas como no cartão, sem caixa à volta
    if (!f.label) wrap.classList.add("itemFieldPlain");
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
