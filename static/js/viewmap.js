// Janela "vista resumida desta aba": botão na barra + categorias por
// coordenada de célula (célula inicial + orientação + tamanho), por livro+aba.

let viewMapDraft = null;   // { categories: [...], exec }; só vai para o localStorage no Gravar

function updateViewMapButton(data) {
  const btn = $("viewMapBtn");
  const mostra = !!(data && !data.error && (data.headers || []).length);
  btn.classList.toggle("hidden", !mostra);
  if (!mostra) return;
  const hasView = hasResumedView(data);
  btn.textContent = hasView ? t("viewmap_btn_edit") : t("viewmap_btn_create");
  btn.title = hasCanonicalCompact(data) ? t("viewmap_hint_canonical") : t("viewmap_hint");
}

// botão "Listas predefinidas" na mesma barra: mostra-se nas mesmas condições
// do viewMapBtn (precisa de uma folha lida), mas independente dele — a
// biblioteca (loadPredefLists/savePredefLists, tasks.js) existe mesmo sem
// nenhuma categoria a usá-la ainda.
function updatePredefListButton(data) {
  const btn = $("predefListBtn");
  btn.classList.toggle("hidden", !(data && !data.error && (data.headers || []).length));
  btn.textContent = t("predeflist_btn");
  btn.title = t("predeflist_btn_hint");
}

// botão "Categorias compostas" na mesma barra: mesmas condições dos outros
// dois — a biblioteca (loadCompoundCats/saveCompoundCats, tasks.js) também
// existe independente de já haver algo a usá-la.
function updateCompoundCatButton(data) {
  const btn = $("compoundCatBtn");
  btn.classList.toggle("hidden", !(data && !data.error && (data.headers || []).length));
  btn.textContent = t("compoundcat_manage_btn");
  btn.title = t("compoundcat_hint_modal");
}

function newCategoryDraft() {
  return {
    name: "", startCell: "", orientation: "horizontal", size: "",
    // lista de valores predefinidos (dropdown editável, ver openCellCatEditor
    // em tasks.js): opcional, só se useList estiver ligado. listMode escolhe
    // a fonte: "range" (intervalo do livro) ou "fixed" (biblioteca desta aba,
    // ver predefListDraft/loadPredefLists).
    useList: false, listMode: "range",
    listSheet: "", listCell: "", listOrientation: "vertical", listSize: "",
    listId: "",
  };
}

// Pré-visualização do valor da célula do Excel para categorias sem nome: o
// campo "Nome" fica vazio no rascunho (é assim que build_cell_categories,
// cswaios/tasks.py, sabe que deve ler sempre o texto atual da célula), mas o
// placeholder mostra esse mesmo texto em vez do genérico "Nome (opcional)",
// para o utilizador ver o que vai aparecer sem ter de gravar primeiro.
const _viewMapCellRefRe = /^[A-Za-z]{1,3}\d+$/;
let _viewMapPreviewTimers = {};

async function _viewMapFetchPreview(startCell, orientation, size) {
  const tab = activeTab();
  if (!tab) return "";
  const q = new URLSearchParams(tabQuery(tab, {}));
  q.set("cellcats", JSON.stringify([{ name: "", startCell, orientation, size }]));
  try {
    const res = await fetch(`/api/tasks?${q.toString()}`);
    const data = await res.json();
    return (data && data.cell_view && data.cell_view.headers && data.cell_view.headers[0]) || "";
  } catch (e) {
    return "";
  }
}

function scheduleViewMapPreview(i) {
  clearTimeout(_viewMapPreviewTimers[i]);
  _viewMapPreviewTimers[i] = setTimeout(async () => {
    const cat = viewMapDraft && viewMapDraft.categories[i];
    if (!cat || cat.name || !_viewMapCellRefRe.test(String(cat.startCell || "").trim())) return;
    const startCell = cat.startCell, orientation = cat.orientation, size = cat.size;
    const text = await _viewMapFetchPreview(startCell, orientation, size);
    // a célula/nome podem ter mudado entretanto - só aplica se continuar igual
    const cur = viewMapDraft && viewMapDraft.categories[i];
    if (!cur || cur.name || cur.startCell !== startCell) return;
    const field = document.querySelector(`#viewMapRows .viewMapCatField[data-i="${i}"][data-field="name"]`);
    if (field) field.placeholder = text || t("viewmap_name_ph");
  }, 400);
}

function renderViewMapRows() {
  const cats = (viewMapDraft && viewMapDraft.categories) || [];
  const execOn = !!(viewMapDraft && viewMapDraft.exec);
  const predefLists = loadPredefLists(lastData);

  const catRow = (cat, i) => `
    <div class="viewMapCatRow" data-i="${i}">
      <input type="text" class="viewMapCatField" data-i="${i}" data-field="name"
        placeholder="${esc(t("viewmap_name_ph"))}" value="${esc(cat.name || "")}">
      <input type="text" class="viewMapCatField viewMapCatCell" data-i="${i}" data-field="startCell"
        placeholder="${esc(t("viewmap_cell_ph"))}" value="${esc(cat.startCell || "")}">
      <select class="viewMapCatField" data-i="${i}" data-field="orientation">
        <option value="horizontal"${cat.orientation !== "vertical" ? " selected" : ""}>${esc(t("viewmap_horizontal"))}</option>
        <option value="vertical"${cat.orientation === "vertical" ? " selected" : ""}>${esc(t("viewmap_vertical"))}</option>
      </select>
      <input type="number" min="1" class="viewMapCatField viewMapCatSize" data-i="${i}" data-field="size"
        placeholder="${esc(t("viewmap_size_ph"))}" value="${esc(cat.size || "")}">
      <button type="button" class="mini viewMapCatRemove" data-i="${i}" title="${esc(t("viewmap_remove"))}">✕</button>
      <label class="viewMapUseList">
        <input type="checkbox" class="viewMapUseListToggle" data-i="${i}"${cat.useList ? " checked" : ""}>
        ${esc(t("viewmap_use_list"))}
      </label>
      ${cat.useList ? `
      <div class="viewMapListCfg">
        <select class="viewMapCatField" data-i="${i}" data-field="listMode">
          <option value="range"${cat.listMode !== "fixed" ? " selected" : ""}>${esc(t("viewmap_list_mode_range"))}</option>
          <option value="fixed"${cat.listMode === "fixed" ? " selected" : ""}>${esc(t("viewmap_list_mode_fixed"))}</option>
        </select>
        ${cat.listMode === "fixed" ? `
        <select class="viewMapCatField" data-i="${i}" data-field="listId">
          <option value="">${esc(t("viewmap_list_pick_ph"))}</option>
          ${predefLists.map(l => `<option value="${esc(l.id)}"${cat.listId === l.id ? " selected" : ""}>${esc(l.name)}</option>`).join("")}
        </select>
        <button type="button" class="mini" id="viewMapManageLists">${esc(t("predeflist_manage_btn"))}</button>
        ` : `
        <input type="text" class="viewMapCatField" data-i="${i}" data-field="listSheet"
          placeholder="${esc(t("viewmap_list_sheet_ph"))}" value="${esc(cat.listSheet || "")}">
        <input type="text" class="viewMapCatField" data-i="${i}" data-field="listCell"
          placeholder="${esc(t("viewmap_list_cell_ph"))}" value="${esc(cat.listCell || "")}">
        <select class="viewMapCatField" data-i="${i}" data-field="listOrientation">
          <option value="vertical"${cat.listOrientation !== "horizontal" ? " selected" : ""}>${esc(t("viewmap_list_orientation_v"))}</option>
          <option value="horizontal"${cat.listOrientation === "horizontal" ? " selected" : ""}>${esc(t("viewmap_list_orientation_h"))}</option>
        </select>
        <input type="number" min="1" class="viewMapCatField" data-i="${i}" data-field="listSize"
          placeholder="${esc(t("viewmap_list_size_ph"))}" value="${esc(cat.listSize || "")}">
        `}
      </div>` : ""}
    </div>`;

  $("viewMapRows").innerHTML =
    (cats.length ? cats.map(catRow).join("") : `<p class="viewMapEmptyHint">${esc(t("viewmap_none"))}</p>`) +
    `<div class="viewMapCatActions">` +
    `<button type="button" class="mini" id="viewMapAddCat">${esc(t("viewmap_add_cat"))}</button>` +
    `<label class="viewMapExecToggle"><input type="checkbox" id="viewMapExecOn"${execOn ? " checked" : ""}> ${esc(t("hdr_exec"))}</label>` +
    `</div>`;
}

function setViewMapOpen(open) {
  if (open && !lastData) return;
  if (open) {
    const saved = loadViewMap(lastData) || { categories: [], exec: false };
    // clone profundo: editar o rascunho nunca mexe no mapa gravado antes do Gravar
    viewMapDraft = { categories: saved.categories.map(c => ({ ...c })), exec: !!saved.exec };
    $("viewMapTitle").textContent = t("viewmap_title");
    $("viewMapHint").textContent = hasCanonicalCompact(lastData) ? t("viewmap_hint_canonical") : t("viewmap_hint");
    $("viewMapSave").textContent = t("viewmap_save");
    // só a seta: a legenda completa fica no tooltip/aria-label
    $("viewMapNext").textContent = "→";
    $("viewMapNext").title = t("viewmap_next");
    $("viewMapNext").setAttribute("aria-label", t("viewmap_next"));
    // Lados só faz sentido para a vista do tracker (Autor/Reviewer/Estado
    // fixos) — a vista por coordenadas tem categorias livres, sem esses campos
    $("viewMapNext").classList.toggle("hidden", !hasCanonicalCompact(lastData));
    renderViewMapRows();
    viewMapDraft.categories.forEach((cat, i) => {
      if (!cat.name && cat.startCell) scheduleViewMapPreview(i);
    });
  }
  $("viewMapOverlay").classList.toggle("hidden", !open);
}

$("viewMapRows").addEventListener("input", e => {
  const field = e.target.closest(".viewMapCatField");
  if (!field || !viewMapDraft) return;
  const i = Number(field.dataset.i), key = field.dataset.field;
  const cat = viewMapDraft.categories[i];
  if (!cat) return;
  cat[key] = field.value;
  if (key === "startCell" || key === "orientation" || key === "size") scheduleViewMapPreview(i);
  if (key === "listMode") renderViewMapRows();
});

$("viewMapRows").addEventListener("click", e => {
  if (!viewMapDraft) return;
  if (e.target.id === "viewMapAddCat") {
    viewMapDraft.categories.push(newCategoryDraft());
    renderViewMapRows();
    return;
  }
  if (e.target.id === "viewMapManageLists") {
    setPredefListOpen(true);
    return;
  }
  const remove = e.target.closest(".viewMapCatRemove");
  if (remove) {
    viewMapDraft.categories.splice(Number(remove.dataset.i), 1);
    renderViewMapRows();
  }
});

$("viewMapRows").addEventListener("change", e => {
  if (e.target.id === "viewMapExecOn" && viewMapDraft) { viewMapDraft.exec = e.target.checked; return; }
  if (e.target.classList.contains("viewMapUseListToggle") && viewMapDraft) {
    const cat = viewMapDraft.categories[Number(e.target.dataset.i)];
    if (cat) { cat.useList = e.target.checked; renderViewMapRows(); }
  }
});

$("viewMapSave").addEventListener("click", () => {
  if (!lastData || !viewMapDraft) return;
  saveViewMap(lastData, viewMapDraft);
  setViewMapOpen(false);
  clearFilters();
  // um render() só usaria o data.cell_view já em cache, de antes de guardar —
  // se a categoria acabou de ligar "Lista editável" (ou mudou de lista), esse
  // cell_view ainda não tem as opções/lista da célula: só um load() a sério
  // manda o cellcats atualizado (ver tabQuery) e traz o cell_view certo
  load();
  toast(t("viewmap_saved"), "ok");
});

$("viewMapNext").addEventListener("click", () => {
  if (!lastData) return;
  if (viewMapDraft) saveViewMap(lastData, viewMapDraft);
  setViewMapOpen(false);
  clearFilters();
  load();
  setSideMapOpen(true, true);
});

$("viewMapBtn").addEventListener("click", () => setViewMapOpen(true));
$("viewMapClose").addEventListener("click", () => setViewMapOpen(false));
$("viewMapOverlay").addEventListener("click", e => {
  if (e.target === $("viewMapOverlay")) setViewMapOpen(false);
});
document.addEventListener("keydown", e => {
  // se "Gerir listas..." estiver aberto por cima (ver viewMapManageLists),
  // o Esc é dele primeiro — o tratador dele, registado a seguir, é que fecha
  // esse; sem este bypass, stopImmediatePropagation nunca o deixaria correr
  if (e.key === "Escape" && !$("viewMapOverlay").classList.contains("hidden") &&
      $("predefListOverlay").classList.contains("hidden")) {
    e.stopImmediatePropagation();
    setViewMapOpen(false);
  }
}, { capture: true });

// Janela "Listas predefinidas desta aba": biblioteca de listas de opções por
// livro+aba (ver loadPredefLists/savePredefLists em tasks.js). Cada lista é
// mode="manual" (valores digitados) ou mode="range" (lida ao vivo de um
// intervalo do próprio livro: aba+célula+orientação+tamanho, tal como o
// listMode="range" de uma categoria). Independente do mapa de categorias —
// uma categoria só referencia uma destas listas pelo id (listMode="fixed",
// ver renderViewMapRows).
let predefListDraft = null;   // [{id, name, mode, values, colors, sheet, cell, orientation, size}, ...]; só vai para o localStorage no Gravar
let predefListSearchTerm = "";   // filtra as linhas mostradas (ver renderPredefListRows) — nunca mexe no draft nem nos índices

// cor por valor (ver loadPredefLists/savePredefLists, tasks.js): só para
// listas mode="manual" — os valores de uma lista mode="range" só se conhecem
// ao vivo do livro, no servidor, por isso não têm aqui uma cor para escolher.
// Reaproveita a paleta CUSTOMFILTER_COLORS (tasks.js), com um botão extra
// "sem cor" (a única forma de tirar uma cor já escolhida a um valor).
function predefListColorRow(l, i, v) {
  const current = (l.colors || {})[v] || "";
  const noneBtn = `<button type="button" class="customFilterColorDot listValNone${!current ? " selected" : ""}"
    data-i="${i}" data-value="${esc(v)}" data-color="" title="${esc(t("predeflist_color_none"))}"></button>`;
  const colorBtns = CUSTOMFILTER_COLORS.filter(Boolean).map(col => `
    <button type="button" class="customFilterColorDot customfilter-${col}${current === col ? " selected" : ""}"
      data-i="${i}" data-value="${esc(v)}" data-color="${col}" title="${esc(t(`customfilter_color_${col}`))}"></button>
  `).join("");
  return `<div class="predefListColorRow"><span class="predefListColorLabel">${esc(v)}</span>${noneBtn}${colorBtns}</div>`;
}

function renderPredefListRows() {
  const lists = predefListDraft || [];
  const term = norm(predefListSearchTerm);
  const entries = lists
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => !term || norm(l.name || "").includes(term));
  const row = (l, i) => `
    <div class="viewMapCatRow" data-i="${i}">
      <input type="text" class="viewMapCatField" data-i="${i}" data-field="name"
        placeholder="${esc(t("predeflist_name_ph"))}" value="${esc(l.name || "")}">
      <select class="viewMapCatField" data-i="${i}" data-field="mode">
        <option value="manual"${l.mode !== "range" ? " selected" : ""}>${esc(t("predeflist_mode_manual"))}</option>
        <option value="range"${l.mode === "range" ? " selected" : ""}>${esc(t("predeflist_mode_range"))}</option>
      </select>
      ${l.mode === "range" ? `
      <div class="viewMapListCfg">
        <input type="text" class="viewMapCatField" data-i="${i}" data-field="sheet"
          placeholder="${esc(t("viewmap_list_sheet_ph"))}" value="${esc(l.sheet || "")}">
        <input type="text" class="viewMapCatField" data-i="${i}" data-field="cell"
          placeholder="${esc(t("predeflist_cell_ph"))}" value="${esc(l.cell || "")}">
        <select class="viewMapCatField" data-i="${i}" data-field="orientation">
          <option value="vertical"${l.orientation !== "horizontal" ? " selected" : ""}>${esc(t("viewmap_list_orientation_v"))}</option>
          <option value="horizontal"${l.orientation === "horizontal" ? " selected" : ""}>${esc(t("viewmap_list_orientation_h"))}</option>
        </select>
        <input type="number" min="1" class="viewMapCatField" data-i="${i}" data-field="size"
          placeholder="${esc(t("viewmap_list_size_ph"))}" value="${esc(l.size || "")}">
      </div>` : `
      <input type="text" class="viewMapCatField predefListValues" data-i="${i}" data-field="values"
        placeholder="${esc(t("predeflist_values_ph"))}" value="${esc((l.values || []).join(", "))}">`}
      <button type="button" class="mini viewMapCatRemove" data-i="${i}" title="${esc(t("predeflist_remove"))}">✕</button>
      ${l.mode !== "range" && (l.values || []).length ? `
      <div class="viewMapListCfg predefListColors" data-i="${i}">
        ${l.values.map(v => predefListColorRow(l, i, v)).join("")}
      </div>` : ""}
    </div>`;
  $("predefListRows").innerHTML =
    (entries.length ? entries.map(({ l, i }) => row(l, i)).join("")
      : `<p class="viewMapEmptyHint">${esc(t(lists.length ? "customfilter_search_none" : "viewmap_none"))}</p>`) +
    `<div class="viewMapCatActions">` +
    `<button type="button" class="mini" id="predefListAdd">${esc(t("predeflist_add"))}</button>` +
    `</div>`;
}

function setPredefListOpen(open) {
  if (open && !lastData) return;
  if (open) {
    predefListDraft = loadPredefLists(lastData).map(l => ({ ...l, values: [...l.values], colors: { ...(l.colors || {}) } }));
    predefListSearchTerm = "";
    $("predefListTitle").textContent = t("predeflist_title");
    $("predefListHint").textContent = t("predeflist_hint");
    $("predefListSave").textContent = t("viewmap_save");
    $("predefListSearch").value = "";
    $("predefListSearch").placeholder = t("predeflist_search_ph");
    renderPredefListRows();
  }
  $("predefListOverlay").classList.toggle("hidden", !open);
}

$("predefListSearch").addEventListener("input", e => {
  predefListSearchTerm = e.target.value;
  renderPredefListRows();
});

$("predefListRows").addEventListener("input", e => {
  const field = e.target.closest(".viewMapCatField");
  if (!field || !predefListDraft) return;
  const i = Number(field.dataset.i), key = field.dataset.field;
  const l = predefListDraft[i];
  if (!l) return;
  if (key === "values") {
    l.values = field.value.split(",").map(v => v.trim()).filter(Boolean);
  } else {
    l[key] = field.value;
  }
  if (key === "mode") renderPredefListRows();
});

// só ao sair do campo (não a cada tecla, para não perder o foco a meio da
// escrita): refaz as linhas de cor por valor, para acompanhar valores
// novos/removidos na lista manual que se acabou de editar
$("predefListRows").addEventListener("change", e => {
  if (e.target.closest(".predefListValues")) renderPredefListRows();
});

$("predefListRows").addEventListener("click", e => {
  if (!predefListDraft) return;
  if (e.target.id === "predefListAdd") {
    predefListDraft.push({
      id: `pl${Date.now()}${Math.floor(Math.random() * 1000)}`, name: "", mode: "manual",
      values: [], colors: {}, sheet: "", cell: "", orientation: "vertical", size: "",
    });
    renderPredefListRows();
    return;
  }
  const colorDot = e.target.closest(".predefListColorRow .customFilterColorDot");
  if (colorDot) {
    const l = predefListDraft[Number(colorDot.dataset.i)];
    if (l) {
      l.colors = l.colors || {};
      const value = colorDot.dataset.value, color = colorDot.dataset.color;
      if (color) l.colors[value] = color; else delete l.colors[value];
      renderPredefListRows();
    }
    return;
  }
  const remove = e.target.closest(".viewMapCatRemove");
  if (remove) {
    predefListDraft.splice(Number(remove.dataset.i), 1);
    renderPredefListRows();
  }
});

$("predefListSave").addEventListener("click", () => {
  if (!lastData || !predefListDraft) return;
  savePredefLists(lastData, predefListDraft);
  setPredefListOpen(false);
  // o mapa de categorias ou os filtros personalizados podem estar abertos por
  // baixo (botão "Gerir listas…" dentro deles): refaz as linhas para o select
  // de listId refletir o que acabou de mudar (listas renomeadas/removidas)
  if (viewMapDraft) renderViewMapRows();
  if (customFilterDraft) renderCustomFilterRows();
  // qualquer categoria/filtro que já use uma destas listas (valores ou
  // intervalo mudados) só fica com o dropdown/lista certos depois de um
  // load() a sério — ver o mesmo motivo em viewMapSave/viewMapNext acima
  load();
  toast(t("predeflist_saved"), "ok");
});

$("predefListBtn").addEventListener("click", () => setPredefListOpen(true));
$("predefListClose").addEventListener("click", () => setPredefListOpen(false));
$("predefListOverlay").addEventListener("click", e => {
  if (e.target === $("predefListOverlay")) setPredefListOpen(false);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("predefListOverlay").classList.contains("hidden")) {
    e.stopImmediatePropagation();
    setPredefListOpen(false);
  }
}, { capture: true });

// ---------- "Categorias compostas desta aba" ----------
// Junta duas ou mais colunas/categorias já existentes (ver
// compoundCatColumnsPool) numa só, só para leitura (ver loadCompoundCats/
// saveCompoundCats, tasks.js): aparece como coluna extra na vista mapeada à
// medida (buildCustomCompact) e como opção de coluna nos filtros
// personalizados (evalCustomCondition), sem nunca substituir as colunas de
// origem.
let compoundCatDraft = null;   // [{id, name, columns}, ...]; só vai para o localStorage no Gravar

// nomes disponíveis para juntar: colunas reais da folha (customFilterColumns)
// + nomes das categorias já mapeadas nesta aba (loadViewMap) — os dois sítios
// onde uma categoria composta pode vir a aparecer
function compoundCatColumnsPool(data) {
  const out = [...customFilterColumns(data)];
  const seen = new Set(out);
  const cfg = loadViewMap(data);
  (cfg && cfg.categories || []).forEach(c => {
    const name = String(c.name || "").trim();
    if (name && !seen.has(name)) { seen.add(name); out.push(name); }
  });
  return out;
}

function renderCompoundCatRows() {
  const cats = compoundCatDraft || [];
  const poolAll = compoundCatColumnsPool(lastData);
  // uma coluna já usada por OUTRA categoria composta deixa de ser oferecida
  // aqui (ver feedback do utilizador): evita juntar a mesma coluna de origem a
  // duas compostas diferentes, o que duplicaria o valor sem nenhum ganho —
  // a categoria dona da coluna continua a vê-la (e a poder tirá-la) na sua
  // própria lista, só as OUTRAS é que deixam de a listar
  const row = (cc, i) => {
    const usedElsewhere = new Set(cats.flatMap((other, j) => (j === i ? [] : (other.columns || []))));
    const pool = poolAll.filter(name => !usedElsewhere.has(name));
    return `
    <div class="viewMapCatRow" data-i="${i}">
      <input type="text" class="viewMapCatField" data-i="${i}" data-field="name"
        placeholder="${esc(t("compoundcat_name_ph"))}" value="${esc(cc.name || "")}">
      <button type="button" class="mini viewMapCatRemove" data-i="${i}" title="${esc(t("compoundcat_remove"))}">✕</button>
      <div class="viewMapListCfg">
        <p class="viewMapEmptyHint">${esc(t("compoundcat_columns_hint"))}</p>
        ${pool.map(name => `
        <label class="viewMapUseList">
          <input type="checkbox" class="compoundCatColOpt" data-i="${i}" data-col="${esc(name)}"${(cc.columns || []).includes(name) ? " checked" : ""}>
          ${esc(name)}
        </label>`).join("")}
      </div>
    </div>`;
  };
  $("compoundCatRows").innerHTML =
    (cats.length ? cats.map(row).join("") : `<p class="viewMapEmptyHint">${esc(t("viewmap_none"))}</p>`) +
    `<div class="viewMapCatActions">` +
    `<button type="button" class="mini" id="compoundCatAdd">${esc(t("compoundcat_add"))}</button>` +
    `</div>`;
}

function setCompoundCatOpen(open) {
  if (open && !lastData) return;
  if (open) {
    compoundCatDraft = loadCompoundCats(lastData).map(cc => ({ ...cc, columns: [...cc.columns] }));
    $("compoundCatTitle").textContent = t("compoundcat_title");
    $("compoundCatHint").textContent = t("compoundcat_hint_modal");
    $("compoundCatSave").textContent = t("viewmap_save");
    renderCompoundCatRows();
  }
  $("compoundCatOverlay").classList.toggle("hidden", !open);
}

$("compoundCatRows").addEventListener("input", e => {
  const field = e.target.closest(".viewMapCatField");
  if (!field || !compoundCatDraft) return;
  const cc = compoundCatDraft[Number(field.dataset.i)];
  if (cc && field.dataset.field === "name") cc.name = field.value;
});

$("compoundCatRows").addEventListener("change", e => {
  if (!compoundCatDraft || !e.target.classList.contains("compoundCatColOpt")) return;
  const cc = compoundCatDraft[Number(e.target.dataset.i)];
  if (!cc) return;
  const set = new Set(cc.columns || []);
  if (e.target.checked) set.add(e.target.dataset.col); else set.delete(e.target.dataset.col);
  cc.columns = [...set];
});

$("compoundCatRows").addEventListener("click", e => {
  if (!compoundCatDraft) return;
  if (e.target.id === "compoundCatAdd") {
    compoundCatDraft.push({ id: `cc${Date.now()}${Math.floor(Math.random() * 1000)}`, name: "", columns: [] });
    renderCompoundCatRows();
    return;
  }
  const remove = e.target.closest(".viewMapCatRemove");
  if (remove) {
    compoundCatDraft.splice(Number(remove.dataset.i), 1);
    renderCompoundCatRows();
  }
});

$("compoundCatSave").addEventListener("click", () => {
  if (!lastData || !compoundCatDraft) return;
  saveCompoundCats(lastData, compoundCatDraft);
  setCompoundCatOpen(false);
  // filtros personalizados abertos por baixo (botão na mesma barra): refaz as
  // linhas para o <select> de coluna refletir compostas novas/renomeadas/
  // removidas. Nunca precisa de load() a sério (ao contrário das listas
  // predefinidas mode="range"): tudo o que uma composta usa já está em
  // data.cell_view/row_meta, lidos antes — um render() chega.
  if (customFilterDraft) renderCustomFilterRows();
  render();
  toast(t("compoundcat_saved"), "ok");
});

$("compoundCatBtn").addEventListener("click", () => setCompoundCatOpen(true));
$("compoundCatClose").addEventListener("click", () => setCompoundCatOpen(false));
$("compoundCatOverlay").addEventListener("click", e => {
  if (e.target === $("compoundCatOverlay")) setCompoundCatOpen(false);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("compoundCatOverlay").classList.contains("hidden")) {
    e.stopImmediatePropagation();
    setCompoundCatOpen(false);
  }
}, { capture: true });
