// My Organizer — escolher um livro de Excel no OneDrive/SharePoint

let pickerAt = { drive_id: "", item_id: "" };
let pickerBusy = false;

function setPickerOpen(open) {
    $("pickerOverlay").classList.toggle("hidden", !open);
    if (open) {
        $("pickerSearch").value = "";
        browsePicker("", "");
    }
}

async function pickerCall(body) {
    const res = await fetch("/api/graph", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function browsePicker(drive, item, search = "") {
    if (pickerBusy) return;
    pickerBusy = true;
    $("pickerBody").innerHTML = `<div class="pickNote">${t("pick_loading")}</div>`;
    try {
        const out = await pickerCall({ action: "browse", drive_id: drive, item_id: item, search });
        if (out.error) {
            $("pickerBody").innerHTML = `<div class="pickNote">${esc(out.error)}</div>`;
            return;
        }
        pickerAt = { drive_id: out.drive_id || "", item_id: out.item_id || "" };
        renderPicker(out, search);
    } catch (e) {
        $("pickerBody").innerHTML = `<div class="pickNote">${t("err_server")}</div>`;
    } finally {
        pickerBusy = false;
    }
}

function pickRow(icon, name, data, extra = "") {
    return `<button type="button" class="pickRow${extra}" ${data}>` +
        `<span class="pickIcon">${icon}</span><span class="pickName">${esc(name)}</span></button>`;
}

function renderPicker(out, search) {
    $("pickerPath").textContent = out.path ? "/" + out.path : "";
    const atRoot = !out.drive_id && !search;
    const current = out.current || null;
    let html = "";

    if (out.parent) {
        html += pickRow("↑", t("pick_up"),
            `data-up="1" data-drive="${esc(out.parent.drive_id)}" data-item="${esc(out.parent.item_id)}"`);
    }
    if (atRoot && (out.recent || []).length) {
        html += `<h4>${t("pick_recent")}</h4>`;
        html += out.recent.map(b => pickRow("📄", b.path || b.name,
            `data-file="1" data-drive="${esc(b.drive_id)}" data-item="${esc(b.item_id)}" data-name="${esc(b.name)}"`,
            current && current.item_id === b.item_id ? " current" : "")).join("");
    }
    if (out.warning) {
        html += `<div class="pickNote pickWarn">` +
            `<strong>${esc(t("pick_onedrive_warn"))}</strong> — ${esc(out.warning)}` +
            `<br>${esc(t("pick_onedrive_hint"))}</div>`;
    }
    if (out.root_warning) {
        html += `<div class="pickNote pickWarn">` +
            `<strong>${esc(t("pick_onedrive_root_warn"))}</strong> — ${esc(out.root_warning)}` +
            `<br>${esc(t("pick_onedrive_root_hint"))}</div>`;
    }
    if ((out.places || []).length) {
        html += `<h4>${t("pick_places")}</h4>`;
        html += out.places.map(p => pickRow("☁️", p.name,
            `data-drive="${esc(p.drive_id)}" data-item="${esc(p.item_id)}"`)).join("");
    }
    const folders = out.folders || [], files = out.files || [];
    html += folders.map(f => pickRow("📁", f.name,
        `data-drive="${esc(f.drive_id)}" data-item="${esc(f.item_id)}"`)).join("");
    html += files.map(f => pickRow("📄", f.name,
        `data-file="1" data-drive="${esc(f.drive_id)}" data-item="${esc(f.item_id)}" data-name="${esc(f.name)}"`,
        current && current.item_id === f.item_id ? " current" : "")).join("");

    if (!html) html = `<div class="pickNote">${t("pick_empty")}</div>`;
    $("pickerBody").innerHTML = html;
}

$("pickerBody").addEventListener("click", async e => {
    const row = e.target.closest(".pickRow");
    if (!row) return;
    const drive = row.dataset.drive, item = row.dataset.item;
    if (!row.dataset.file) { browsePicker(drive, item); return; }
    const out = await pickerCall({ action: "pick", drive_id: drive, item_id: item });
    if (out.error || !out.ok) { toast(out.error || t("err_server"), "err"); return; }
    graphInfo = { ...graphInfo, ...out };
    setPickerOpen(false);
    renderGraphState();
    // o livro escolhido passa a ser um separador próprio (ver workbooks.js) —
    // não substitui o que já estivesse aberto. Os identificadores vêm da
    // listagem (data-drive/data-item), que já segue os atalhos do OneDrive e dá
    // exatamente o mesmo par que o servidor guardou no pick (ver _item_ref).
    openWorkbookTab({
        kind: "onedrive", driveId: drive, itemId: item,
        name: row.dataset.name || out.book || "",
    });
});

let pickerSearchTimer = null;
$("pickerSearch").addEventListener("input", () => {
    clearTimeout(pickerSearchTimer);
    const termo = $("pickerSearch").value.trim();
    pickerSearchTimer = setTimeout(() => {
        if (termo.length >= 2) browsePicker(pickerAt.drive_id, pickerAt.item_id, termo);
        else browsePicker("", "");
    }, 400);
});

// atalho na barra das tarefas, ao lado da aba: abre a janela de escolher o que
// abrir (OneDrive ou ficheiro local), a mesma do "+" nos separadores
$("bookQuick").addEventListener("click", e => {
    e.stopPropagation();
    setAddWorkbookOpen(true);
});

$("pickerClose").addEventListener("click", () => setPickerOpen(false));
$("pickerOverlay").addEventListener("click", e => {
    if (e.target === $("pickerOverlay")) setPickerOpen(false);
});
document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("pickerOverlay").classList.contains("hidden")) {
        e.stopPropagation();
        setPickerOpen(false);
    }
}, { capture: true });
