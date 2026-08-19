// My Organizer — cópias do estado local
//
// A lista Por fazer, as notas de execução, as CCRs, o quadro das notas e o
// histórico vivem em ficheiros JSON ao lado da app e não existem em mais nenhum
// sítio: o quadro e o histórico não estão na folha de Excel, e apagá-los por
// engano (ou uma gravação a meio) não se desfazia. O servidor guarda uma cópia
// por dia antes da primeira gravação (ver cswaios/statefile.py); este cartão é
// onde se vê o que há e se repõe uma.
//
// Repor é só a partir do PC onde a app corre, como o aviso e o Jira: quem chega
// pela rede local vê a lista, não mexe nela.

let backupsInfo = { backups: [], canRestore: false };
let backupsOpen = false;

async function loadBackups() {
  try {
    const res = await fetch("/api/backups");
    const out = await res.json();
    backupsInfo = {
      backups: Array.isArray(out.backups) ? out.backups : [],
      canRestore: !!out.canRestore,
    };
  } catch (err) {
    return;   // sem servidor não há cópias a mostrar
  }
  renderBackups();
}

function backupSize(bytes) {
  const n = Number(bytes) || 0;
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : n >= 1024 ? `${Math.round(n / 1024)} kB` : `${n} B`;
}

function renderBackups() {
  const lista = backupsInfo.backups;
  $("backupState").textContent = lista.length
    ? tf("backup_count", lista.length)
    : t("backup_none");
  $("backupListBtn").textContent = backupsOpen ? t("backup_list_hide") : t("backup_list_show");
  $("backupListBtn").classList.toggle("hidden", !lista.length);
  const caixa = $("backupList");
  caixa.classList.toggle("hidden", !backupsOpen || !lista.length);
  if (!backupsOpen || !lista.length) return;
  caixa.innerHTML = lista.map(b => `
    <div class="backupRow">
      <span class="backupWhat">${esc(b.target)}</span>
      <span class="backupWhen">${esc(b.saved)} · ${esc(backupSize(b.size))}</span>
      ${backupsInfo.canRestore
        ? `<button type="button" class="mini" data-backup="${esc(b.file)}">${t("backup_restore")}</button>`
        : ""}
    </div>`).join("") +
    (backupsInfo.canRestore ? "" : `<div class="setHint">${t("backup_local_only")}</div>`);
}

async function backupPost(body) {
  const res = await fetch("/api/backups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function saveBackupNow() {
  try {
    const out = await backupPost({ action: "save" });
    if (!out.ok) { toast(out.error || t("backup_failed"), "err"); return; }
    backupsInfo = { backups: out.backups || [], canRestore: true };
    renderBackups();
    toast(tf("backup_saved", (out.saved || []).length), "ok");
  } catch (err) {
    toast(t("backup_failed"), "err");
  }
}

async function restoreBackup(file) {
  const alvo = backupsInfo.backups.find(b => b.file === file);
  if (!alvo) return;
  if (!confirm(tf("backup_confirm", alvo.target, alvo.saved))) return;
  try {
    const out = await backupPost({ action: "restore", file });
    if (!out.ok) { toast(out.error || t("backup_failed"), "err"); return; }
    backupsInfo = { backups: out.backups || [], canRestore: true };
    renderBackups();
    toast(tf("backup_restored", (out.restored || {}).target || alvo.target), "ok");
  } catch (err) {
    toast(t("backup_failed"), "err");
  }
}

// ---------- eventos ----------
$("backupNowBtn").addEventListener("click", saveBackupNow);
$("backupListBtn").addEventListener("click", () => {
  backupsOpen = !backupsOpen;
  renderBackups();
});
$("backupList").addEventListener("click", e => {
  const btn = e.target.closest("[data-backup]");
  if (btn) restoreBackup(btn.dataset.backup);
});

function applyBackupLang() {
  $("setSecBackup").textContent = t("backup_sec");
  $("backupLbl").textContent = t("backup_lbl");
  $("backupHint").textContent = t("backup_hint");
  $("backupNowBtn").textContent = t("backup_now");
  renderBackups();
}
