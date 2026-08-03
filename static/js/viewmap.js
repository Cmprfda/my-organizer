// Janela "vista resumida desta aba": botão na barra + mapa de colunas por livro+aba.

let viewMapDraft = null;   // edições em curso; só vão para o localStorage no Gravar

function updateViewMapButton(data) {
  const btn = $("viewMapBtn");
  const mostra = BETA_ENABLED && !!(data && !data.error && (data.headers || []).length);
  btn.classList.toggle("hidden", !mostra);
  if (!mostra) return;
  const hasView = hasResumedView(data);
  btn.textContent = hasView ? t("viewmap_btn_edit") : t("viewmap_btn_create");
  btn.title = hasCanonicalCompact(data) ? t("viewmap_hint_canonical") : t("viewmap_hint");
}

// cada coluna só pode alimentar um campo: se já está escolhida noutro, aparece
// desativada aqui em vez de deixar o utilizador duplicá-la
function renderViewMapRows() {
  const headers = (lastData && lastData.headers) || [];
  const map = viewMapDraft || {};
  const usedIn = {};
  VIEWMAP_SLOTS.forEach(([slot]) => (map[slot] || []).forEach(h => { if (!(h in usedIn)) usedIn[h] = slot; }));
  const labelOf = slot => t((VIEWMAP_SLOTS.find(s => s[0] === slot) || [])[1] || "");

  $("viewMapRows").innerHTML = VIEWMAP_SLOTS.map(([slot, label]) => {
    const selected = map[slot] || [];
    const chips = headers.map(h => {
      const on = selected.includes(h);
      const other = usedIn[h] && usedIn[h] !== slot;
      const cls = ["viewMapChip"];
      if (on) cls.push("on");
      if (other) cls.push("disabled");
      const title = other ? ` title="${esc(t("viewmap_used_in"))}${esc(labelOf(usedIn[h]))}"` : "";
      return `<button type="button" class="${cls.join(" ")}" data-slot="${esc(slot)}" data-h="${esc(h)}"` +
        `${other ? " disabled" : ""} aria-pressed="${on}"${title}>${esc(h)}</button>`;
    }).join("");
    return `<div class="viewMapRow"><span>${esc(t(label))}</span><div class="viewMapChips">${chips || esc(t("viewmap_none"))}</div></div>`;
  }).join("");
}

function setViewMapOpen(open) {
  if (open && !lastData) return;
  if (open) {
    viewMapDraft = { ...(loadViewMap(lastData) || {}) };
    $("viewMapTitle").textContent = t("viewmap_title");
    $("viewMapHint").textContent = hasCanonicalCompact(lastData) ? t("viewmap_hint_canonical") : t("viewmap_hint");
    $("viewMapSave").textContent = t("viewmap_save");
    // só a seta: a legenda completa fica no tooltip/aria-label
    $("viewMapNext").textContent = "→";
    $("viewMapNext").title = t("viewmap_next");
    $("viewMapNext").setAttribute("aria-label", t("viewmap_next"));
    // aparece em qualquer folha com vista resumida (a do tracker ou uma
    // personalizada gravada) — ver hasResumedView
    $("viewMapNext").classList.toggle("hidden", !hasResumedView(lastData));
    renderViewMapRows();
  }
  $("viewMapOverlay").classList.toggle("hidden", !open);
}

$("viewMapRows").addEventListener("click", e => {
  const chip = e.target.closest("button.viewMapChip");
  if (!chip || chip.disabled || !viewMapDraft) return;
  const slot = chip.dataset.slot, h = chip.dataset.h;
  const arr = viewMapDraft[slot] || (viewMapDraft[slot] = []);
  const i = arr.indexOf(h);
  if (i >= 0) arr.splice(i, 1); else arr.push(h);
  renderViewMapRows();
});

$("viewMapSave").addEventListener("click", () => {
  if (!lastData) return;
  saveViewMap(lastData, viewMapDraft);
  setViewMapOpen(false);
  clearFilters();
  render();
  toast(t("viewmap_saved"), "ok");
});

$("viewMapNext").addEventListener("click", () => {
  if (!lastData) return;
  saveViewMap(lastData, viewMapDraft);
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
  if (e.key === "Escape" && !$("viewMapOverlay").classList.contains("hidden")) {
    e.stopImmediatePropagation();
    setViewMapOpen(false);
  }
}, { capture: true });
