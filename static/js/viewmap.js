// Janela "vista resumida desta aba": botão na barra + mapa de colunas por livro+aba.

let viewMapDraft = null;   // edições em curso; só vão para o localStorage no Gravar

function updateViewMapButton(data) {
  const btn = $("viewMapBtn");
  const mostra = !!(data && !data.error && (data.headers || []).length && !hasCanonicalCompact(data));
  btn.classList.toggle("hidden", !mostra);
  if (!mostra) return;
  const map = loadViewMap(data) || {};
  btn.textContent = Object.keys(map).length ? t("viewmap_btn_edit") : t("viewmap_btn_create");
  btn.title = t("viewmap_hint");
}

function renderViewMapRows() {
  const headers = (lastData && lastData.headers) || [];
  const map = viewMapDraft || {};
  $("viewMapRows").innerHTML = VIEWMAP_SLOTS.map(([slot, label]) =>
    `<label class="viewMapRow"><span>${esc(t(label))}</span>` +
    `<select data-slot="${slot}">` +
    `<option value="">${esc(t("viewmap_none"))}</option>` +
    headers.map(h =>
      `<option value="${esc(h)}"${map[slot] === h ? " selected" : ""}>${esc(h)}</option>`).join("") +
    `</select></label>`
  ).join("");
}

function setViewMapOpen(open) {
  if (open && !lastData) return;
  if (open) {
    viewMapDraft = { ...(loadViewMap(lastData) || {}) };
    $("viewMapTitle").textContent = t("viewmap_title");
    $("viewMapHint").textContent = t("viewmap_hint");
    $("viewMapSave").textContent = t("viewmap_save");
    renderViewMapRows();
  }
  $("viewMapOverlay").classList.toggle("hidden", !open);
}

$("viewMapRows").addEventListener("change", e => {
  const sel = e.target.closest("select[data-slot]");
  if (!sel || !viewMapDraft) return;
  viewMapDraft[sel.dataset.slot] = sel.value;
});

$("viewMapSave").addEventListener("click", () => {
  if (!lastData) return;
  saveViewMap(lastData, viewMapDraft);
  setViewMapOpen(false);
  clearFilters();
  render();
  toast(t("viewmap_saved"), "ok");
});

$("viewMapBtn").addEventListener("click", () => setViewMapOpen(true));
$("viewMapClose").addEventListener("click", () => setViewMapOpen(false));
$("viewMapOverlay").addEventListener("click", e => {
  if (e.target === $("viewMapOverlay")) setViewMapOpen(false);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("viewMapOverlay").classList.contains("hidden")) {
    e.stopPropagation();
    setViewMapOpen(false);
  }
}, { capture: true });
