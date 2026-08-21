// My Organizer — vista de CCRs

// idade de uma CCR, em dias. O `created` antigo e um "dd/mm HH:MM" sem ano (era
// so para mostrar), por isso le-se como a ocorrencia mais recente ja passada; as
// novas trazem `created_iso` e nao precisam de adivinhacao.
function ccrAgeDays(c) {
  if (!c) return null;
  const iso = String(c.created_iso || "");
  let quando = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    quando = new Date(`${iso}T00:00:00`);
  } else {
    const m = /^(\d{1,2})\/(\d{1,2})/.exec(String(c.created || ""));
    if (!m) return null;
    const hoje = new Date();
    quando = new Date(hoje.getFullYear(), +m[2] - 1, +m[1]);
    // uma data "no futuro" e do ano passado (o campo antigo nao guarda o ano)
    if (quando > hoje) quando = new Date(hoje.getFullYear() - 1, +m[2] - 1, +m[1]);
  }
  if (isNaN(quando)) return null;
  const dias = Math.floor((Date.now() - quando.getTime()) / 86400000);
  return dias >= 0 ? dias : null;
}

function ccrAgeChipHtml(id) {
  const dias = ccrAgeDays(ccrs[id]);
  if (dias == null || dias < 1) return "";
  const texto = dias === 1 ? t("age_day") : tf("age_days", dias);
  return `<span class="staleChip" title="${esc(t("ccr_age_tip"))}">⏳ ${esc(texto)}</span>`;
}

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
    const ccrFlag = notesForCcr(id).length
      ? `<button type="button" class="taskNoteFlag" data-ccrlink="${esc(id)}" title="${esc(t("t_open_linked_note"))}">📌</button>`
      : "";
    return `<tr draggable="true" class="${done ? "ccr-done" : ready ? "ccr-ready" : ""}">
  <td class="fn">CCR ${esc(id)}${ccrFlag}${ccrAgeChipHtml(id)}${ready && !done ? `<br><span class="badge done">${t("ccr_ready")}</span>` : ""}</td>
  <td class="ccr-chk">${chk(CCR_PRE)}</td>
  <td class="ccr-chk">${ready ? chk(CCR_POST) : `<span class="obs">${t("ccr_wait")}</span>`}</td>
  <td class="ccrNote" data-nid="${esc(id)}" title="${t("t_edit_note")}">${ccrs[id].note ? `<span class="obs">${esc(ccrs[id].note)}</span>` : `<span class="addnote">${t("addnote")}</span>`
      }</td>
  <td class="todoActionCell">${todoHas("ccr", `CCR ${id}`, { ccr: String(id) }) ? ""
        : `<button type="button" class="todoActionBtn" data-todoaddccr="${esc(id)}" title="${t("todo_add_click")}">${t("btn_add_todo")}</button>`}</td>
  <td><button type="button" class="ccr-x" data-del="${esc(id)}" title="${t("t_remove")}">✕</button></td>
</tr>`;
  }).join("");
  refreshItemBox();
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

// tratadores partilhados com a caixa de detalhe (ver itembox.js)
function ccrBodyChange(e) {
  const cb = e.target.closest("input[type=checkbox][data-id]");
  if (!cb) return;
  const stored = (ccrs[cb.dataset.id] && ccrs[cb.dataset.id].checks) || {};
  postCcr({
    action: "update", id: cb.dataset.id,
    checks: { ...stored, [cb.dataset.k]: cb.checked }
  });
}

function ccrBodyTap(e) {
  const pin = e.target.closest("[data-ccrlink]");
  if (pin) { openCcrLinkedNote(pin.dataset.ccrlink); return; }
  const btn = e.target.closest(".ccr-x");
  if (btn) {
    if (confirm(tf("cfm_del_ccr", btn.dataset.del)))
      postCcr({ action: "delete", id: btn.dataset.del });
    return;
  }
  const cell = e.target.closest("td.ccrNote");
  if (cell && !cell.dataset.editing) openCcrNote(cell);
}

$("ccrBody").addEventListener("change", ccrBodyChange);
$("ccrBody").addEventListener("click", ccrBodyTap);


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
