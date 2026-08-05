// Janela "Filtros personalizados desta aba": regras à medida (nome + um ou
// mais grupos de condições — coluna real da folha + operador + valor, ou "é
// o meu nome"; dentro de um grupo é E, entre grupos é OU) que aparecem como
// botões no resumo, ao lado dos de papel/lado/estado (ver render(), tasks.js,
// e evalCustomFilter/loadCustomFilters/customFilterColumns, também em tasks.js).

let customFilterDraft = null;   // edições em curso; só vão para o localStorage no Gravar

function newCustomCondition() {
  return { column: "", op: "contains", value: "", usePerson: false, listId: "" };
}

function updateCustomFilterButton(data) {
  const btn = $("customFilterBtn");
  btn.classList.toggle("hidden", !(data && !data.error && (data.headers || []).length));
  btn.textContent = t("customfilter_btn");
  btn.title = t("customfilter_btn_hint");
}

function renderCustomFilterRows() {
  const filters = customFilterDraft || [];
  const columns = customFilterColumns(lastData);
  const predefLists = loadPredefLists(lastData);
  const isList = c => c.op === "in_list" || c.op === "not_in_list";

  const condRow = (fi, gi, c, ci, removable) => `
    <div class="viewMapCatRow" data-fi="${fi}" data-gi="${gi}" data-ci="${ci}">
      <select class="viewMapCatField customFilterField" data-fi="${fi}" data-gi="${gi}" data-ci="${ci}" data-field="column">
        <option value="">${esc(t("customfilter_column_pick_ph"))}</option>
        ${columns.map(col => `<option value="${esc(col)}"${c.column === col ? " selected" : ""}>${esc(col)}</option>`).join("")}
      </select>
      <select class="viewMapCatField customFilterField" data-fi="${fi}" data-gi="${gi}" data-ci="${ci}" data-field="op">
        <option value="contains"${c.op === "contains" ? " selected" : ""}>${esc(t("customfilter_op_contains"))}</option>
        <option value="not_contains"${c.op === "not_contains" ? " selected" : ""}>${esc(t("customfilter_op_not_contains"))}</option>
        <option value="equals"${c.op === "equals" ? " selected" : ""}>${esc(t("customfilter_op_equals"))}</option>
        <option value="not_equals"${c.op === "not_equals" ? " selected" : ""}>${esc(t("customfilter_op_not_equals"))}</option>
        <option value="empty"${c.op === "empty" ? " selected" : ""}>${esc(t("customfilter_op_empty"))}</option>
        <option value="not_empty"${c.op === "not_empty" ? " selected" : ""}>${esc(t("customfilter_op_not_empty"))}</option>
        <option value="in_list"${c.op === "in_list" ? " selected" : ""}>${esc(t("customfilter_op_in_list"))}</option>
        <option value="not_in_list"${c.op === "not_in_list" ? " selected" : ""}>${esc(t("customfilter_op_not_in_list"))}</option>
      </select>
      ${isList(c) ? `
      <select class="viewMapCatField customFilterField" data-fi="${fi}" data-gi="${gi}" data-ci="${ci}" data-field="listId">
        <option value="">${esc(t("viewmap_list_pick_ph"))}</option>
        ${predefLists.map(l => `<option value="${esc(l.id)}"${c.listId === l.id ? " selected" : ""}>${esc(l.name)}</option>`).join("")}
      </select>
      <button type="button" class="mini customFilterManageLists">${esc(t("predeflist_manage_btn"))}</button>
      ` : !c.usePerson && c.op !== "empty" && c.op !== "not_empty" ? `
      <input type="text" class="viewMapCatField customFilterField" data-fi="${fi}" data-gi="${gi}" data-ci="${ci}" data-field="value"
        placeholder="${esc(t("customfilter_value_ph"))}" value="${esc(c.value || "")}">
      ` : ""}
      ${!isList(c) ? `
      <label class="viewMapUseList">
        <input type="checkbox" class="customFilterUsePerson" data-fi="${fi}" data-gi="${gi}" data-ci="${ci}"${c.usePerson ? " checked" : ""}>
        ${esc(t("customfilter_use_person"))}
      </label>
      ` : ""}
      ${removable ? `<button type="button" class="mini viewMapCatRemove customFilterRemoveCond" data-fi="${fi}" data-gi="${gi}" data-ci="${ci}" title="${esc(t("customfilter_remove_cond"))}">✕</button>` : ""}
    </div>`;

  // um grupo é E entre as suas condições; grupos diferentes juntam-se em OU
  // (ver evalCustomFilter, tasks.js) — por isso o rótulo "OU" aparece só
  // ENTRE grupos, nunca dentro de um, e só há botão de remover grupo quando
  // existe mais do que um (o filtro precisa de pelo menos um grupo)
  const group = (f, fi, g, gi, removableGroup) => `
    <div class="customFilterGroup" data-fi="${fi}" data-gi="${gi}">
      ${g.conditions.map((c, ci) => condRow(fi, gi, c, ci, g.conditions.length > 1)).join("")}
      <div class="viewMapCatActions">
        <button type="button" class="mini customFilterAddCond" data-fi="${fi}" data-gi="${gi}">${esc(t("customfilter_add_cond"))}</button>
        ${removableGroup ? `<button type="button" class="mini viewMapCatRemove customFilterRemoveGroup" data-fi="${fi}" data-gi="${gi}" title="${esc(t("customfilter_remove_group"))}">✕</button>` : ""}
      </div>
    </div>`;

  const card = (f, fi) => `
    <div class="viewMapCatRow" data-fi="${fi}">
      <input type="text" class="viewMapCatField" data-fi="${fi}" data-field="name"
        placeholder="${esc(t("customfilter_name_ph"))}" value="${esc(f.name || "")}">
      <button type="button" class="mini viewMapCatRemove customFilterRemove" data-fi="${fi}" title="${esc(t("customfilter_remove"))}">✕</button>
      <div class="viewMapListCfg">
        ${f.groups.map((g, gi) => (gi ? `<div class="customFilterGroupOr">${esc(t("customfilter_group_or"))}</div>` : "") +
          group(f, fi, g, gi, f.groups.length > 1)).join("")}
        <div class="viewMapCatActions">
          <button type="button" class="mini customFilterAddGroup" data-fi="${fi}">${esc(t("customfilter_add_group"))}</button>
        </div>
      </div>
    </div>`;

  $("customFilterRows").innerHTML =
    (filters.length ? filters.map(card).join("") : `<p class="viewMapEmptyHint">${esc(t("viewmap_none"))}</p>`) +
    `<div class="viewMapCatActions">` +
    `<button type="button" class="mini" id="customFilterAdd">${esc(t("customfilter_add"))}</button>` +
    `</div>`;
}

function setCustomFilterOpen(open) {
  if (open && !lastData) return;
  if (open) {
    // clone profundo: editar o rascunho nunca mexe no filtro gravado antes do Gravar
    customFilterDraft = loadCustomFilters(lastData).map(f => ({
      ...f, groups: f.groups.map(g => ({ conditions: g.conditions.map(c => ({ ...c })) })),
    }));
    $("customFilterTitle").textContent = t("customfilter_title");
    $("customFilterHint").textContent = t("customfilter_hint");
    $("customFilterSave").textContent = t("viewmap_save");
    renderCustomFilterRows();
  }
  $("customFilterOverlay").classList.toggle("hidden", !open);
}

$("customFilterRows").addEventListener("input", e => {
  if (!customFilterDraft) return;
  if (e.target.matches(".viewMapCatField[data-field='name']")) {
    const f = customFilterDraft[Number(e.target.dataset.fi)];
    if (f) f.name = e.target.value;
    return;
  }
  const field = e.target.closest(".customFilterField");
  if (!field) return;
  const f = customFilterDraft[Number(field.dataset.fi)];
  const g = f && f.groups[Number(field.dataset.gi)];
  const c = g && g.conditions[Number(field.dataset.ci)];
  if (!c) return;
  c[field.dataset.field] = field.value;
  if (field.dataset.field === "op") renderCustomFilterRows();
});

$("customFilterRows").addEventListener("change", e => {
  if (!customFilterDraft) return;
  if (e.target.classList.contains("customFilterUsePerson")) {
    const f = customFilterDraft[Number(e.target.dataset.fi)];
    const g = f && f.groups[Number(e.target.dataset.gi)];
    const c = g && g.conditions[Number(e.target.dataset.ci)];
    if (c) { c.usePerson = e.target.checked; renderCustomFilterRows(); }
  }
});

$("customFilterRows").addEventListener("click", e => {
  if (!customFilterDraft) return;
  if (e.target.id === "customFilterAdd") {
    customFilterDraft.push({
      id: `cf${Date.now()}${Math.floor(Math.random() * 1000)}`,
      name: "", groups: [{ conditions: [newCustomCondition()] }],
    });
    renderCustomFilterRows();
    return;
  }
  if (e.target.classList.contains("customFilterManageLists")) {
    setPredefListOpen(true);
    return;
  }
  const addGroup = e.target.closest(".customFilterAddGroup");
  if (addGroup) {
    const f = customFilterDraft[Number(addGroup.dataset.fi)];
    if (f) { f.groups.push({ conditions: [newCustomCondition()] }); renderCustomFilterRows(); }
    return;
  }
  const removeGroup = e.target.closest(".customFilterRemoveGroup");
  if (removeGroup) {
    const f = customFilterDraft[Number(removeGroup.dataset.fi)];
    if (f && f.groups.length > 1) {
      f.groups.splice(Number(removeGroup.dataset.gi), 1);
      renderCustomFilterRows();
    }
    return;
  }
  const addCond = e.target.closest(".customFilterAddCond");
  if (addCond) {
    const f = customFilterDraft[Number(addCond.dataset.fi)];
    const g = f && f.groups[Number(addCond.dataset.gi)];
    if (g) { g.conditions.push(newCustomCondition()); renderCustomFilterRows(); }
    return;
  }
  const removeCond = e.target.closest(".customFilterRemoveCond");
  if (removeCond) {
    const f = customFilterDraft[Number(removeCond.dataset.fi)];
    const g = f && f.groups[Number(removeCond.dataset.gi)];
    if (g && g.conditions.length > 1) {
      g.conditions.splice(Number(removeCond.dataset.ci), 1);
      renderCustomFilterRows();
    }
    return;
  }
  const remove = e.target.closest(".customFilterRemove");
  if (remove) {
    customFilterDraft.splice(Number(remove.dataset.fi), 1);
    renderCustomFilterRows();
  }
});

$("customFilterSave").addEventListener("click", () => {
  if (!lastData || !customFilterDraft) return;
  saveCustomFilters(lastData, customFilterDraft);
  // só larga os ids de filtros removidos nesta edição — os que continuam a
  // existir mantêm-se ligados/desligados como estavam antes do Gravar
  const validIds = new Set(customFilterDraft.map(f => f.id));
  [...customFilterActive].forEach(id => { if (!validIds.has(id)) customFilterActive.delete(id); });
  setCustomFilterOpen(false);
  // um filtro novo pode referenciar uma lista predefinida mode="range": só o
  // servidor a lê ao vivo (ver tabQuery/filter_lists), por isso é preciso um
  // load() a sério — um simples render() ficaria com o filtro sem valores
  // (contagem a 0, botão inerte) até ao próximo ciclo automático
  load();
  toast(t("customfilter_saved"), "ok");
});

$("customFilterBtn").addEventListener("click", () => setCustomFilterOpen(true));
$("customFilterClose").addEventListener("click", () => setCustomFilterOpen(false));
$("customFilterOverlay").addEventListener("click", e => {
  if (e.target === $("customFilterOverlay")) setCustomFilterOpen(false);
});
document.addEventListener("keydown", e => {
  // se "Gerir listas..." estiver aberto por cima (botão do filtro por lista),
  // o Esc é dele primeiro — o tratador dele fecha esse antes deste correr
  if (e.key === "Escape" && !$("customFilterOverlay").classList.contains("hidden") &&
      $("predefListOverlay").classList.contains("hidden")) {
    e.stopImmediatePropagation();
    setCustomFilterOpen(false);
  }
}, { capture: true });
