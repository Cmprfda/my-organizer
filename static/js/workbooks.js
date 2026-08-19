// My Organizer — abrir páginas pelo "+" (um separador por livro/pasta)
//
// A app não abre nada por si: arranca sem nenhum livro e é o "+" (na barra dos
// separadores ou no painel de boas-vindas) que abre esta janela. Daqui sai-se
// para o explorador do OneDrive (picker.js), para o diálogo de ficheiros do
// Windows (/api/workbook/browse_local) ou para o de pastas, quando o que se
// quer é uma pasta de código (pickCodeFolder em code.js).

// "procurar no disco" só existe na janela da app (no browser não há diálogo
// nativo). Depois de o servidor o dizer uma vez, não se volta a oferecer.
let localBrowseUnavailable = false;

function setAddWorkbookOpen(open) {
  $("wbAddOverlay").classList.toggle("hidden", !open);
  $("addWorkbookBtn").setAttribute("aria-expanded", open ? "true" : "false");
  if (!open) return;
  $("wbAddNote").classList.add("hidden");
  // no telemóvel (ou em qualquer aparelho da rede local) o diálogo de ficheiros
  // não existe — abriria no PC, não aqui. Fica só o OneDrive, que é lido pelo
  // servidor com a sessão já aberta e por isso funciona em qualquer aparelho
  $("wbAddLocal").classList.toggle("hidden", localBrowseUnavailable || !isLocalClient());
  // uma pasta de código é lida no disco deste PC: pela rede não há nada para
  // mostrar (ver /api/repo em cswaios/server.py)
  $("wbAddCode").classList.toggle("hidden", !isLocalClient());
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

/* ---------- ver dois livros ao mesmo tempo: janela nova ----------
   O ⧉ do separador (ou o botão do meio do rato) abre a app noutra janela já
   naquele livro — `?wb=<id>`, ver SOLO_WB em state.js. É a maneira de ter dois
   livros à frente ao mesmo tempo: o ecrã dividido não serve para isso, porque o
   painel das tarefas é um só e mostra sempre o livro do separador ativo.

   No browser tenta-se aqui (é um clique do utilizador, não é bloqueado); na
   janela nativa da app NÃO se tenta: lá o window.open não abre janela nenhuma —
   manda o endereço para o browser do sistema, que não é o que se pede ao ⧉.
   Quem está na app quer outra janela da app, por isso pede-se ao servidor
   (/api/window), como já acontece com o login da Microsoft. */
// Abre outra janela da app num endereço desta app. `name` é o nome da janela:
// repetir o pedido com o mesmo nome traz à frente a que já está aberta em vez
// de abrir outra igual. Usado pelo ⧉ dos livros e pelo ↗ das notas.
async function openAppWindow(caminho, name) {
  let janela = null;
  // window.pywebview só existe dentro da janela nativa da app
  if (!window.pywebview) {
    try {
      janela = window.open(caminho, name, "width=1280,height=860");
    } catch (err) {
      janela = null;
    }
  }
  if (janela) {
    try { janela.focus(); } catch (err) { /* algumas janelas não deixam */ }
    return;
  }
  try {
    const res = await fetch("/api/window", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: caminho }),
    });
    const out = await res.json();
    if (!out.ok) toast(out.error || t("wb_window_failed"), "err");
  } catch (err) {
    toast(t("wb_window_failed"), "err");
  }
}

function openWorkbookWindow(id) {
  const tab = tabById(id);
  if (!tab) return;
  return openAppWindow(`/?wb=${encodeURIComponent(id)}`, `myorg_wb_${id}`);
}

// ---------- opção 1: livro no OneDrive/SharePoint ----------
$("wbAddOneDrive").addEventListener("click", e => {
  e.stopPropagation();
  // a sessão é a do PC onde a app corre: quem está noutro aparelho não a pode
  // abrir daqui, tem de ser lá (ver /api/graph em cswaios/server.py)
  if (!graphInfo.connected) {
    wbAddNote(t(isLocalClient() ? "pick_need_login" : "pick_need_login_pc"));
    return;
  }
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

// ---------- opção 3: pasta de código no disco ----------
$("wbAddCode").addEventListener("click", async e => {
  e.stopPropagation();
  setAddWorkbookOpen(false);
  await pickCodeFolder();   // o separador da pasta nasce lá (ver code.js)
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
