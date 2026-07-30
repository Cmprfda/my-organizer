// My Organizer — vista de CCRs

function renderCCRs() {
  const ids = Object.keys(ccrs).sort((a, b) => {
    const na = parseInt(a, 10), nb = parseInt(b, 10);
    return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.localeCompare(b);
  });
  $("ccrTablebox").classList.toggle("hidden", !ids.length);
  $("ccrEmpty").classList.toggle("hidden", !!ids.length);
  $("ccrBody").innerHTML = ids.map(id => {
    const c = (ccrs[id] && ccrs[id].checks) || {};
    const ready = CCR_PRE.every(([k]) => c[k]);
    const done = ready && CCR_POST.every(([k]) => c[k]);
    const chk = defs => defs.map(([k, label]) =>
      `<label><input type="checkbox" data-id="${esc(id)}" data-k="${k}"${c[k] ? " checked" : ""}> ${esc(t(label))}</label>`
    ).join("");
    return `<tr draggable="true" class="${done ? "ccr-done" : ready ? "ccr-ready" : ""}">
  <td class="fn">CCR ${esc(id)}${ready && !done ? `<br><span class="badge done">${t("ccr_ready")}</span>` : ""}</td>
  <td class="ccr-chk">${chk(CCR_PRE)}</td>
  <td class="ccr-chk">${ready ? chk(CCR_POST) : `<span class="obs">${t("ccr_wait")}</span>`}</td>
  <td class="ccrNote" data-nid="${esc(id)}" title="${t("t_edit_note")}">${ccrs[id].note ? `<span class="obs">${esc(ccrs[id].note)}</span>` : `<span class="addnote">${t("addnote")}</span>`
      }</td>
  <td class="todoActionCell">${todoHas("ccr", `CCR ${id}`, { ccr: String(id) }) ? ""
        : `<button type="button" class="todoActionBtn" data-todoaddccr="${esc(id)}" title="${t("todo_add_click")}">${t("btn_add_todo")}</button>`}</td>
  <td><button type="button" class="ccr-x" data-del="${esc(id)}" title="${t("t_remove")}">✕</button></td>
</tr>`;
  }).join("");
}

async function postCcr(body) {
  try {
    const res = await fetch("/api/ccrs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = await res.json();
    if (!out.ok) { alert("Operação de CCR falhou: " + (out.error || "?")); return; }
    ccrs = out.ccrs;
    renderCCRs();
  } catch (err) {
    alert("Não foi possível contactar o servidor: " + err);
  }
}

async function addCcr() {
  const id = $("ccrId").value.trim();
  if (!id) return;
  await postCcr({ action: "add", id });
  $("ccrId").value = "";
}

$("ccrAdd").addEventListener("click", addCcr);
$("ccrId").addEventListener("keydown", e => { if (e.key === "Enter") addCcr(); });
$("ccrBody").addEventListener("change", e => {
  const cb = e.target.closest("input[type=checkbox][data-id]");
  if (!cb) return;
  const stored = (ccrs[cb.dataset.id] && ccrs[cb.dataset.id].checks) || {};
  postCcr({
    action: "update", id: cb.dataset.id,
    checks: { ...stored, [cb.dataset.k]: cb.checked }
  });
});
$("ccrBody").addEventListener("click", e => {
  const btn = e.target.closest(".ccr-x");
  if (btn) {
    if (confirm(tf("cfm_del_ccr", btn.dataset.del)))
      postCcr({ action: "delete", id: btn.dataset.del });
    return;
  }
  const cell = e.target.closest("td.ccrNote");
  if (cell && !cell.dataset.editing) openCcrNote(cell);
});


function openCcrNote(cell) {
  const id = cell.dataset.nid;
  cell.dataset.editing = "1";
  editorOpen = true;
  const atual = (ccrs[id] && ccrs[id].note) || "";
  cell.innerHTML =
    `<textarea class="noteText" rows="3" placeholder="${t("ph_note")}">${esc(atual)}</textarea>
 ` + editActions();
  cell.querySelector(".noteText").focus();
  cell.querySelector(".actSave").addEventListener("click", e => {
    e.stopPropagation();
    editorOpen = false;
    postCcr({ action: "update", id, note: cell.querySelector(".noteText").value });
  });
  cell.querySelector(".actCancel").addEventListener("click", e => {
    e.stopPropagation();
    editorOpen = false;
    renderCCRs();
  });
  cell.querySelector(".actClear").addEventListener("click", e => {
    e.stopPropagation();
    editorOpen = false;
    postCcr({ action: "update", id, note: "" });
  });
}
