// My Organizer — captura de erros do browser e envio para o servidor

function clientLog(msg) {
  try {
    fetch("/api/clientlog", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg })
    });
  } catch (e) { /* sem rede — ignorar */ }
}

// erros do browser são reportados automaticamente para a pasta de feedback
let bugsReportados = 0;
function reportBug(message, stack) {
  if (bugsReportados >= 5) return;   // um ecrã com erros em cadeia não inunda o feedback
  bugsReportados++;
  try {
    fetch("/api/bug", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: String(message || "").slice(0, 500),
        stack: String(stack || "").slice(0, 4000),
        name: typeof PERSON === "string" ? PERSON : "",
        url: location.href,
        ua: navigator.userAgent,
        view: typeof currentView === "string" ? currentView : "",
      }),
    }).then(() => { if (typeof toast === "function") toast(t("bug_reported"), "err"); })
      .catch(() => { });
  } catch (e) { /* sem rede — ignorar */ }
}
window.addEventListener("error", e => {
  const onde = `${(e.filename || "").split("/").pop()}:${e.lineno}`;
  clientLog(`JS error: ${e.message} @${onde}`);
  reportBug(`${e.message} (${onde})`, e.error && e.error.stack);
});
window.addEventListener("unhandledrejection", e => {
  const motivo = (e.reason && e.reason.message) || e.reason;
  clientLog("Promise rejeitada: " + motivo);
  reportBug("Promise rejeitada: " + motivo, e.reason && e.reason.stack);
});
