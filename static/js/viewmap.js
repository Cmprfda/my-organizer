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
  render();
  toast(t("viewmap_saved"), "ok");
});

$("viewMapNext").addEventListener("click", () => {
  if (!lastData) return;
  if (viewMapDraft) saveViewMap(lastData, viewMapDraft);
  setViewMapOpen(false);
  clearFilters();
  render();
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
let predefListDraft = null;   // [{id, name, mode, values, sheet, cell, orientation, size}, ...]; só vai para o localStorage no Gravar

function renderPredefListRows() {
  const lists = predefListDraft || [];
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
    </div>`;
  $("predefListRows").innerHTML =
    (lists.length ? lists.map(row).join("") : `<p class="viewMapEmptyHint">${esc(t("viewmap_none"))}</p>`) +
    `<div class="viewMapCatActions">` +
    `<button type="button" class="mini" id="predefListAdd">${esc(t("predeflist_add"))}</button>` +
    `</div>`;
}

function setPredefListOpen(open) {
  if (open && !lastData) return;
  if (open) {
    predefListDraft = loadPredefLists(lastData).map(l => ({ ...l, values: [...l.values] }));
    $("predefListTitle").textContent = t("predeflist_title");
    $("predefListHint").textContent = t("predeflist_hint");
    $("predefListSave").textContent = t("viewmap_save");
    renderPredefListRows();
  }
  $("predefListOverlay").classList.toggle("hidden", !open);
}

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

$("predefListRows").addEventListener("click", e => {
  if (!predefListDraft) return;
  if (e.target.id === "predefListAdd") {
    predefListDraft.push({
      id: `pl${Date.now()}${Math.floor(Math.random() * 1000)}`, name: "", mode: "manual",
      values: [], sheet: "", cell: "", orientation: "vertical", size: "",
    });
    renderPredefListRows();
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
