// My Organizer — aviso do dono da instalação
//
// Uma mensagem escrita nas Definições (só no PC onde a app corre) que aparece a
// quem abrir a app: a quem a abre aqui e a quem lhe chega pela rede local.
//
// O que decide se aparece é o `id` — o resumo do conteúdo, feito no servidor
// (ver cswaios/store.py). Cada browser guarda o último id que leu: mudar o
// texto dá um id novo e a mensagem volta a aparecer a toda a gente; reabrir a
// app com a mesma mensagem não incomoda quem já a leu. Não há nada a limpar em
// ninguém quando se escreve um aviso novo.

const ANNOUNCE_SEEN_KEY = "bsp-tracker-announce-seen";

let announcement = { id: "", title: "", text: "", updated: "", canEdit: false };

const announceSeen = () => localStorage.getItem(ANNOUNCE_SEEN_KEY) || "";

// o mesmo markdown de bolso do assistente (negrito, listas, títulos); sem ele
// (ficheiro em falta) o texto aparece à mesma, escapado e por linhas
function announceHtml(text) {
  if (typeof chatMarkdown === "function") return chatMarkdown(text);
  return String(text || "").split("\n").map(l => `<p>${esc(l)}</p>`).join("");
}

function setAnnounceOpen(open) {
  $("announceOverlay").classList.toggle("hidden", !open);
}

function showAnnouncement() {
  if (!announcement.text && !announcement.title) return;
  $("announceTitle").textContent = announcement.title || t("announce_title");
  $("announceBody").innerHTML = announceHtml(announcement.text) +
    (announcement.updated ? `<div class="announceWhen">${esc(announcement.updated)}</div>` : "");
  $("announceOk").textContent = t("announce_ok");
  setAnnounceOpen(true);
}

// fechar = "já li isto": o id fica guardado e a mensagem não volta a aparecer
// sozinha enquanto for a mesma
function dismissAnnouncement() {
  if (announcement.id) localStorage.setItem(ANNOUNCE_SEEN_KEY, announcement.id);
  setAnnounceOpen(false);
  renderAnnouncePage();
}

async function loadAnnouncement(showIfNew) {
  try {
    const res = await fetch("/api/announcement");
    const out = await res.json();
    announcement = {
      id: String(out.id || ""), title: String(out.title || ""),
      text: String(out.text || ""), updated: String(out.updated || ""),
      canEdit: !!out.canEdit,
    };
  } catch (err) {
    return;   // sem servidor não há aviso nenhum a mostrar
  }
  renderAnnouncePage();
  if (showIfNew && announcement.id && announcement.id !== announceSeen()) showAnnouncement();
}

// ---------- cartão nas Definições ----------
// O cartão só existe para quem tem alguma coisa a fazer com ele: o dono da
// instalação (que o escreve) e quem tiver um aviso para reler.
function renderAnnouncePage() {
  const temAviso = !!(announcement.text || announcement.title);
  $("setCardAnnounce").classList.toggle("hidden", !(announcement.canEdit || temAviso));
  $("announceEditBox").classList.toggle("hidden", !announcement.canEdit);
  $("announceShowBtn").classList.toggle("hidden", !temAviso);
  if (announcement.canEdit && document.activeElement !== $("announceTitleInput") &&
      document.activeElement !== $("announceTextInput")) {
    $("announceTitleInput").value = announcement.title;
    $("announceTextInput").value = announcement.text;
  }
  $("announceState").textContent = temAviso
    ? tf("announce_state_on", announcement.updated || "?")
    : t("announce_state_off");
}

async function saveAnnouncement(clear) {
  const body = clear
    ? { action: "clear" }
    : { title: $("announceTitleInput").value, text: $("announceTextInput").value };
  try {
    const res = await fetch("/api/announcement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = await res.json();
    if (!out.ok) { toast(out.error || t("announce_failed"), "err"); return; }
    announcement = {
      id: String(out.id || ""), title: String(out.title || ""),
      text: String(out.text || ""), updated: String(out.updated || ""), canEdit: true,
    };
    // quem escreve o aviso não precisa de o ver a seguir como se fosse novo
    if (announcement.id) localStorage.setItem(ANNOUNCE_SEEN_KEY, announcement.id);
    if (clear) { $("announceTitleInput").value = ""; $("announceTextInput").value = ""; }
    renderAnnouncePage();
    toast(clear ? t("announce_cleared") : t("announce_saved"), "ok");
  } catch (err) {
    toast(t("announce_failed"), "err");
  }
}

// ---------- eventos ----------
$("announceOk").addEventListener("click", dismissAnnouncement);
$("announceClose").addEventListener("click", dismissAnnouncement);
$("announceOverlay").addEventListener("click", e => {
  if (e.target === $("announceOverlay")) dismissAnnouncement();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("announceOverlay").classList.contains("hidden")) {
    e.stopImmediatePropagation();
    dismissAnnouncement();
  }
}, true);

$("announceSaveBtn").addEventListener("click", () => saveAnnouncement(false));
$("announceClearBtn").addEventListener("click", () => {
  if (!confirm(t("announce_confirm_clear"))) return;
  saveAnnouncement(true);
});
$("announceShowBtn").addEventListener("click", showAnnouncement);

function applyAnnounceLang() {
  $("setSecAnnounce").textContent = t("announce_sec");
  $("announceLbl").textContent = t("announce_lbl");
  $("announceTitleInput").placeholder = t("announce_ph_title");
  $("announceTextInput").placeholder = t("announce_ph_text");
  $("announceSaveBtn").textContent = t("btn_save");
  $("announceClearBtn").textContent = t("announce_clear");
  $("announceShowBtn").textContent = t("announce_show");
  $("announceClose").title = t("t_close");
  renderAnnouncePage();
}
