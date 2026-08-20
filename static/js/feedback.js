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
$("langSel").addEventListener("change", () => setTimeout(() => {
  applyFbPageLang();
  renderFbPending();   // a lista do pendente também é escrita aqui
}, 0));

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
      showFbIssue(out.pending ? out.issue_url : "", out.folder);
      toast(t("fb_sent"), "ok");
      loadFbPending();      // o que ficou por entregar passa a estar à vista
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
let fbIssueFolder = "";   // pasta pendente deste reporte (as imagens estão lá)

function showFbIssue(url, folder) {
  fbIssueUrl = url || "";
  fbIssueFolder = folder || "";
  const row = $("fbIssueRow");
  if (!fbIssueUrl) { row.classList.add("hidden"); return; }
  $("fbIssue").textContent = t("fb_issue");
  $("fbIssue").title = t("t_fb_issue");
  row.classList.remove("hidden");
}

// abrir a issue e abrir a pasta das imagens é o mesmo gesto: o formulário de
// issues do GitHub não aceita ficheiros pelo link, e mandar a pessoa procurar
// "feedback_pending\<nome>" no disco era mandá-la desistir das imagens
// (reporte do Nuno). Com a pasta aberta ao lado, arrastá-las é um gesto.
async function openFbIssue(url, folder) {
  if (!url) return;
  window.open(url, "_blank", "noopener");
  if (!folder) return;
  try {
    await fetch("/api/feedback/pending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reveal", name: folder }),
    });
  } catch (err) { /* sem a pasta aberta a issue serve-se sozinha */ }
}

$("fbIssue").addEventListener("click", () => openFbIssue(fbIssueUrl, fbIssueFolder));

// ---------- o feedback que ficou neste PC ----------
// Ficava montado em feedback_pending\ à espera da partilha e não se via em
// parte nenhuma: quem não a alcança só tinha à mão a issue do reporte que
// acabou de escrever, e os anteriores ficavam esquecidos numa pasta (reporte do
// Nuno). Aqui estão todos, com a issue já preenchida, a pasta das imagens e o
// apagar para quando a issue já existe.
let fbPendingItems = [];
let fbPendingCanReveal = false;

function fbPendingSummary(item) {
  // a primeira linha que não é cabeçalho: é o que a pessoa escreveu
  const linhas = String(item.text || "").split("\n").map(l => l.trim());
  const corpo = linhas.find(l => l && !/^(De|Data|App|Página|Page|Origem|Assinatura):/.test(l));
  return corpo || item.name;
}

function renderFbPending() {
  const box = $("fbPendingBox");
  if (!box) return;
  if (!fbPendingItems.length) { box.classList.add("hidden"); return; }
  $("fbPendingTitle").textContent = t("fb_pend_title");
  $("fbPendingHint").textContent = t("fb_pend_hint");
  $("fbPendingRetry").textContent = t("fb_pend_retry");
  $("fbPendingList").innerHTML = fbPendingItems.map(it => {
    const imgs = (it.images || []).length;
    return `<li class="fbPendingItem">
      <div class="fbPendingWho">
        <span class="fbPendingName">${esc(it.name)}</span>
        ${imgs ? `<span class="chip">${esc(tf("fb_pend_imgs", imgs))}</span>` : ""}
      </div>
      <div class="fbPendingText">${esc(fbPendingSummary(it))}</div>
      <div class="fbPendingActs">
        ${it.issue_url ? `<button type="button" class="mini" data-fbissue="${esc(it.name)}"
          title="${esc(t("t_fb_issue"))}">${esc(t("fb_pend_issue"))}</button>` : ""}
        ${imgs && fbPendingCanReveal ? `<button type="button" class="mini" data-fbreveal="${esc(it.name)}"
          >${esc(t("fb_pend_reveal"))}</button>` : ""}
        <button type="button" class="mini" data-fbdrop="${esc(it.name)}"
          title="${esc(t("t_fb_pend_drop"))}">${esc(t("fb_pend_drop"))}</button>
      </div>
    </li>`;
  }).join("");
  box.classList.remove("hidden");
}

async function loadFbPending() {
  try {
    const res = await fetch("/api/feedback/pending");
    const out = await res.json();
    if (!out.ok) return;
    fbPendingItems = out.items || [];
    fbPendingCanReveal = !!out.canReveal;
    renderFbPending();
  } catch (err) { /* a página do feedback serve-se sem esta lista */ }
}

$("fbPendingList").addEventListener("click", async e => {
  const abrir = e.target.closest("[data-fbissue]");
  if (abrir) {
    const it = fbPendingItems.find(x => x.name === abrir.dataset.fbissue);
    if (it) openFbIssue(it.issue_url, it.name);
    return;
  }
  const pasta = e.target.closest("[data-fbreveal]");
  if (pasta) {
    await fetch("/api/feedback/pending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reveal", name: pasta.dataset.fbreveal }),
    });
    return;
  }
  const apagar = e.target.closest("[data-fbdrop]");
  if (!apagar) return;
  const nome = apagar.dataset.fbdrop;
  // apagar é para depois de a issue estar criada: sem a pergunta, um clique
  // aqui perdia um reporte que ainda não chegou a ninguém
  if (!confirm(tf("cfm_fb_drop", nome))) return;
  try {
    const res = await fetch("/api/feedback/pending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "drop", name: nome }),
    });
    const out = await res.json();
    if (!out.ok) { toast(out.error || t("err_server"), "err"); return; }
    fbPendingItems = out.items || [];
    renderFbPending();
    toast(t("fb_pend_dropped"), "ok");
  } catch (err) {
    toast(t("err_server"), "err");
  }
});

$("fbPendingRetry").addEventListener("click", async ev => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  try {
    const res = await fetch("/api/feedback/pending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "flush" }),
    });
    const out = await res.json();
    if (!out.ok) { toast(out.error || t("err_server"), "err"); return; }
    fbPendingItems = out.items || [];
    renderFbPending();
    toast(out.delivered ? tf("fb_pend_retry_ok", out.delivered) : t("fb_pend_retry_none"),
      out.delivered ? "ok" : "");
  } catch (err) {
    toast(t("err_server"), "err");
  } finally {
    btn.disabled = false;
  }
});

// a lista chega quando a página do feedback abre (e depois de cada envio)
(function hookFbPendingLoad() {
  const base = window.showView;
  if (typeof base !== "function") return;
  window.showView = function (name) {
    base(name);
    if (name === "feedback" || sideView === "feedback") loadFbPending();
  };
})();
if (currentView === "feedback") loadFbPending();
