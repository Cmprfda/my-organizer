// My Organizer — envio de feedback

let fbImages = [];  // imagens do input de ficheiros + printscreens colados

// nome do remetente: persiste no localStorage
$('fbName').value = localStorage.getItem('bsp-tracker-fb-name') || PERSON;
$('fbName').addEventListener('change', () => {
  const v = $('fbName').value.trim();
  if (v) localStorage.setItem('bsp-tracker-fb-name', v);
});

// ---------- página onde o utilizador estava (opcional) ----------
// Vem preenchida sozinha com o separador de onde se veio para o feedback; quem
// não quiser indicá-la limpa o campo (✕) e ela deixa de seguir no reporte.
let fbLastView = null;      // vista anterior à do feedback
let fbPageTouched = false;  // o utilizador escreveu/limpou: não voltar a preencher

// textos deste campo (o resto da página é traduzido em settings.js/applyLang)
const FB_PAGE_TR = {
  lbl: ["Página (opcional)", "Page (optional)"],
  ph: ["Onde estavas na app…", "Where you were in the app…"],
  clear: ["Não indicar a página", "Don't include the page"],
};
const fbPageT = key => FB_PAGE_TR[key][LANG === "en" ? 1 : 0];

function applyFbPageLang() {
  const lbl = document.querySelector('label[for="fbPage"]');
  if (lbl) lbl.textContent = fbPageT("lbl");
  $("fbPage").placeholder = fbPageT("ph");
  $("fbPageClear").title = fbPageT("clear");
}

// vista a propor: a que está no ecrã (no ecrã dividido o feedback pode estar
// ao lado da vista real) ou, se só o feedback estiver visível, a anterior
function fbDetectedView() {
  if (currentView && currentView !== "feedback") return currentView;
  return fbLastView;
}

function fbSyncPage() {
  if (fbPageTouched) return;
  const view = fbDetectedView();
  const label = view ? (tabLabel(view) || "").trim() : "";
  $("fbPage").value = view ? (label || view) : "";
}

// showView() é a única porta de entrada das vistas: guarda-se aqui a vista
// anterior, porque quando o formulário é preenchido a vista já é "feedback"
(function hookFbPageDetection() {
  const base = window.showView;
  if (typeof base !== "function") return;
  window.showView = function (name) {
    const prev = currentView;
    base(name);
    if (name === "feedback" && prev && prev !== "feedback") fbLastView = prev;
    if (name === "feedback" || sideView === "feedback") fbSyncPage();
  };
})();

$("fbPage").addEventListener("input", () => { fbPageTouched = true; });

$("fbPageClear").addEventListener("click", () => {
  $("fbPage").value = "";
  fbPageTouched = true;
  $("fbPage").focus();
});

applyFbPageLang();
fbSyncPage();
// a mudança de idioma corre em settings.js; o setTimeout deixa o LANG já novo
$("langSel").addEventListener("change", () => setTimeout(applyFbPageLang, 0));

function renderFbList() {
  $("fbList").innerHTML = fbImages.length
    ? `${t("imgs")} ` + fbImages.map((it, i) =>
      `<span class="chip done" style="opacity:1">${esc(it.name)} (${Math.max(1, Math.round(it.file.size / 1024))} KB)
     <a href="#" data-rm="${i}" style="text-decoration:none" title="Remover">✕</a></span>`).join(" ")
    : "";
}

$("fbList").addEventListener("click", e => {
  const rm = e.target.closest("[data-rm]");
  if (!rm) return;
  e.preventDefault();
  fbImages.splice(+rm.dataset.rm, 1);
  renderFbList();
});

$("fbFiles").addEventListener("change", () => {
  [...$("fbFiles").files].forEach(f => fbImages.push({ name: f.name, file: f }));
  $("fbFiles").value = "";
  renderFbList();
});

// colar printscreens (Ctrl+V) na página de feedback
document.addEventListener("paste", e => {
  if (currentView !== "feedback") return;
  const imgs = [...((e.clipboardData && e.clipboardData.items) || [])]
    .filter(it => it.type && it.type.startsWith("image/"));
  if (!imgs.length) return;
  imgs.forEach(it => {
    const f = it.getAsFile();
    if (!f) return;
    const generic = !f.name || f.name === "image.png";
    fbImages.push({ name: generic ? `printscreen_${fbImages.length + 1}.png` : f.name, file: f });
  });
  renderFbList();
});

$("fbSend").addEventListener("click", async () => {
  const text = $("fbText").value.trim();
  if (!text && !fbImages.length) { alert(t("fb_need")); return; }
  if (fbImages.reduce((s, it) => s + it.file.size, 0) > 15 * 1024 * 1024) {
    alert(t("fb_big"));
    return;
  }
  $("fbSend").disabled = true;
  $("fbSend").textContent = t("btn_sending");
  try {
    const images = [];
    for (const it of fbImages) {
      const data = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(it.file);
      });
      images.push({ name: it.name, data });
    }
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: $('fbName').value.trim() || PERSON, text, images,
        page: $("fbPage").value.trim(),
      }),
    });
    const out = await res.json();
    if (out.ok) {
      $("fbText").value = "";
      fbImages = [];
      renderFbList();
      fbPageTouched = false;    // o próximo reporte volta a propor a página
      fbSyncPage();
      $("fbStatus").textContent = out.pending
        ? t("fb_pending")
        : `${t("fb_sent")} feedback\\${out.folder}.`;
      $("fbStatus").classList.remove("hidden");
      // sem via de entrega: sobra a issue pública, aberta pelo próprio
      showFbIssue(out.pending ? out.issue_url : "");
      toast(t("fb_sent"), "ok");
    } else {
      toast(`${t("err_save")} ` + (out.error || "?"), "err");
    }
  } catch (err) {
    toast(`${t("err_save")} ` + err, "err");
  }
  $("fbSend").disabled = false;
  $("fbSend").textContent = t("btn_send");
});

// Botão que leva o feedback para uma issue no GitHub. Só aparece quando nenhuma
// via de entrega funcionou: o repositório é público, logo qualquer conta GitHub
// abre a issue sem ser colaborador. É o utilizador que a confirma no browser —
// e é lá que arrasta as imagens, que o formulário de issues não recebe por URL.
let fbIssueUrl = "";

function showFbIssue(url) {
  fbIssueUrl = url || "";
  const row = $("fbIssueRow");
  if (!fbIssueUrl) { row.classList.add("hidden"); return; }
  $("fbIssue").textContent = t("fb_issue");
  $("fbIssue").title = t("t_fb_issue");
  row.classList.remove("hidden");
}

$("fbIssue").addEventListener("click", () => {
  if (fbIssueUrl) window.open(fbIssueUrl, "_blank", "noopener");
});
