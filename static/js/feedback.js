// My Organizer — envio de feedback

let fbImages = [];  // imagens do input de ficheiros + printscreens colados

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
      body: JSON.stringify({ name: PERSON, text, images }),
    });
    const out = await res.json();
    if (out.ok) {
      $("fbText").value = "";
      fbImages = [];
      renderFbList();
      $("fbStatus").textContent = out.pending
        ? t("fb_pending")
        : `${t("fb_sent")} feedback\\${out.folder}.`;
      $("fbStatus").classList.remove("hidden");
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
