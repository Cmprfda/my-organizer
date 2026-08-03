// Janela "Lados: Autor / Reviewer": por estado, de que lado conta cada papel.

let sideMapDraft = null;   // edições em curso; só vão para o localStorage no Gravar
// true quando esta janela foi aberta a partir do "Seguinte" da vista resumida
// (viewmap.js) — só nesse caso faz sentido mostrar a seta de Voltar
let sideMapFromViewMap = false;

const SIDEMAP_OPTIONS = ["auto", "my", "other", "done", "na"];
const SIDEMAP_OPT_KEY = { my: "side_my", other: "side_other", done: "side_done", na: "side_na" };
// autoSideOf() devolve as etiquetas internas ("On my side", ...); traduz para i18n
const SIDEMAP_AUTO_KEY = {
  "On my side": "side_my", "On the other side": "side_other", "Done": "side_done",
};

// autoSideOf()/sideOf() comparam role === "Reviewer" literalmente (igual em PT e EN),
// por isso a pré-visualização do "Automático" tem de passar essa string exata
const SIDEMAP_ROLES = [["author", "sidemap_col_author", "Author"],
["reviewer", "sidemap_col_reviewer", "Reviewer"]];

function sideMapOptionLabel(opt, role, status) {
  if (opt !== "auto") return t(SIDEMAP_OPT_KEY[opt]);
  const key = SIDEMAP_AUTO_KEY[autoSideOf(role, status)];
  return key ? `${t("sidemap_opt_auto")} (${t(key)})` : t("sidemap_opt_auto");
}

function renderSideMapRows() {
  const draft = sideMapDraft || {};
  const vistos = {};
  const estados = (typeof currentStatuses !== "undefined" ? currentStatuses : [])
    .filter(s => {
      const k = norm(s);
      if (!k || k === "n/a" || vistos[k]) return false;
      vistos[k] = 1;
      return true;
    });

  $("sideMapRows").innerHTML = estados.map(status => {
    const key = norm(status);
    const selects = SIDEMAP_ROLES.map(([role, label, roleArg]) => {
      const atual = (draft[key] || {})[role] || "auto";
      const opts = SIDEMAP_OPTIONS.map(opt =>
        `<option value="${esc(opt)}"${opt === atual ? " selected" : ""}>` +
        `${esc(sideMapOptionLabel(opt, roleArg, status))}</option>`
      ).join("");
      return `<label>${esc(t(label))}<select data-status="${esc(key)}" ` +
        `data-role="${esc(role)}">${opts}</select></label>`;
    }).join("");
    return `<div class="viewMapRow"><span>${esc(status)}</span>` +
      `<div class="sideMapSelects">${selects}</div></div>`;
  }).join("");
}

function setSideMapOpen(open, fromViewMap) {
  if (open) {
    sideMapFromViewMap = !!fromViewMap;
    // clone profundo: editar o rascunho nunca mexe no mapa gravado antes do Gravar
    sideMapDraft = JSON.parse(JSON.stringify(loadSideOverrides()));
    $("sideMapTitle").textContent = t("sidemap_title");
    $("sideMapHint").textContent = t("sidemap_hint");
    $("sideMapSave").textContent = t("viewmap_save");
    // só a seta: a legenda completa fica no tooltip/aria-label
    $("sideMapBack").textContent = "←";
    $("sideMapBack").title = t("sidemap_back");
    $("sideMapBack").setAttribute("aria-label", t("sidemap_back"));
    $("sideMapBack").classList.toggle("hidden", !sideMapFromViewMap);
    renderSideMapRows();
  }
  $("sideMapOverlay").classList.toggle("hidden", !open);
}

$("sideMapRows").addEventListener("change", e => {
  const sel = e.target.closest("select[data-status]");
  if (!sel || !sideMapDraft) return;
  const key = sel.dataset.status, role = sel.dataset.role;
  const entry = sideMapDraft[key] || (sideMapDraft[key] = {});
  if (sel.value === "auto") delete entry[role]; else entry[role] = sel.value;
  if (!Object.keys(entry).length) delete sideMapDraft[key];
  renderSideMapRows();
});

$("sideMapSave").addEventListener("click", () => {
  saveSideOverrides(sideMapDraft);
  setSideMapOpen(false);
  clearFilters();
  render();
  toast(t("sidemap_saved"), "ok");
});

$("sideMapBack").addEventListener("click", () => {
  setSideMapOpen(false);
  if (sideMapFromViewMap) setViewMapOpen(true);
});
$("sideMapClose").addEventListener("click", () => setSideMapOpen(false));
$("sideMapOverlay").addEventListener("click", e => {
  if (e.target === $("sideMapOverlay")) setSideMapOpen(false);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("sideMapOverlay").classList.contains("hidden")) {
    e.stopImmediatePropagation();
    setSideMapOpen(false);
  }
}, { capture: true });
