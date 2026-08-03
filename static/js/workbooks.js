// My Organizer — abrir livros de Excel (um separador por livro)
//
// A app não abre nenhum livro por si: arranca sem nenhum e é o "+" (na barra
// dos separadores ou no painel de boas-vindas) que abre esta janela. Daqui
// sai-se ou para o explorador do OneDrive (picker.js) ou para o diálogo de
// ficheiros do Windows (/api/workbook/browse_local).

// "procurar no disco" só existe na janela da app (no browser não há diálogo
// nativo). Depois de o servidor o dizer uma vez, não se volta a oferecer.
let localBrowseUnavailable = false;

function setAddWorkbookOpen(open) {
  $("wbAddOverlay").classList.toggle("hidden", !open);
  $("addWorkbookBtn").setAttribute("aria-expanded", open ? "true" : "false");
  if (!open) return;
  $("wbAddNote").classList.add("hidden");
  $("wbAddLocal").classList.toggle("hidden", localBrowseUnavailable);
}

function wbAddNote(msg) {
  $("wbAddNote").textContent = msg;
  $("wbAddNote").classList.remove("hidden");
}

/* Abre (ou volta a mostrar) o separador de um livro.
   `spec` = { kind, path } para um ficheiro local, ou
            { kind: "onedrive", driveId, itemId, name }.
   Abrir duas vezes o mesmo livro não cria dois separadores: salta-se para o
   que já lá está. */
function openWorkbookTab(spec) {
  const tab = normalizeWorkbookTab(spec);
  if (!tab) { toast(t("wb_add_failed"), "err"); return null; }
  const existente = tabById(tab.id);
  if (existente) {
    setAddWorkbookOpen(false);
    showView(`wb:${existente.id}`);
    toast(tf("wb_already_open", existente.name), "ok");
    return existente;
  }
  workbookTabs.push(tab);
  activeTabId = tab.id;
  lastData = null;
  lastSelectorsSig = "";
  clearFilters();
  searchTerms = [];
  saveWorkbookTabs();
  renderWorkbookTabs();
  setAddWorkbookOpen(false);
  showView(`wb:${tab.id}`);
  toast(tf("wb_opened", tab.name), "ok");
  // primeira leitura deste livro
  load();
  return tab;
}

// ---------- opção 1: livro no OneDrive/SharePoint ----------
$("wbAddOneDrive").addEventListener("click", e => {
  e.stopPropagation();
  if (!graphInfo.connected) { wbAddNote(t("pick_need_login")); return; }
  setAddWorkbookOpen(false);
  setPickerOpen(true);   // o pick cria o separador (ver picker.js)
});

// ---------- opção 2: ficheiro .xlsx no disco ----------
$("wbAddLocal").addEventListener("click", async e => {
  e.stopPropagation();
  const btn = $("wbAddLocal");
  btn.disabled = true;
  try {
    const res = await fetch("/api/workbook/browse_local", { method: "POST" });
    const out = await res.json();
    if (out.error) {
      // sem janela nativa não há diálogo: deixa de fazer sentido oferecê-lo
      localBrowseUnavailable = true;
      $("wbAddLocal").classList.add("hidden");
      wbAddNote(out.error);
      return;
    }
    if (!out.path) return;   // o utilizador cancelou — não é um erro
    openWorkbookTab({ kind: "local", path: out.path, name: out.name || "" });
  } catch (err) {
    wbAddNote(t("err_server"));
  } finally {
    btn.disabled = false;
  }
});

// ---------- abrir/fechar a janela ----------
$("addWorkbookBtn").addEventListener("click", e => {
  e.stopPropagation();
  setAddWorkbookOpen($("wbAddOverlay").classList.contains("hidden"));
});
$("wbEmptyAdd").addEventListener("click", e => {
  e.stopPropagation();
  setAddWorkbookOpen(true);
});
$("wbAddClose").addEventListener("click", () => setAddWorkbookOpen(false));
$("wbAddOverlay").addEventListener("click", e => {
  if (e.target === $("wbAddOverlay")) setAddWorkbookOpen(false);
});
// o split.js já tem um Escape global (exitSplit): sem a fase de captura e o
// stopImmediatePropagation, fechar esta janela desfazia também o ecrã dividido
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("wbAddOverlay").classList.contains("hidden")) {
    e.stopImmediatePropagation();
    setAddWorkbookOpen(false);
  }
}, { capture: true });
