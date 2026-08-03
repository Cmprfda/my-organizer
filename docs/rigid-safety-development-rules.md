## 🚨 Rigid Safety & Development Rules

1. **Excel Operations:**
   - **NEVER write via `openpyxl` directly:** It corrupts Excel validations and charts.
   - **Writes must use COM:** Perform writes via Excel/COM (`PowerShell GetActiveObject` or invisible instance).
   - **NEVER modify real Excel during tests:** Create `bsp-tracker\BSP-G2_Daily_Tracker_TESTCOPY.xlsx` with an old mtime, test against it, and delete it afterward.
   - **OneDrive source is read-only in tests:** never trigger `/api/push` against the production workbook. `/api/update` is safe (local only); clean up afterwards with `/api/overrides/clear`.
2. **Data & User Protection:**
   - **Read before wipe:** Before running tests that clear JSON state files, ALWAYS read the file first to ensure it doesn't contain real user data.
   - **Never touch Windows Firewall:** Do not alter security/firewall configurations on the machine.
3. **Encoding & System Stability:**
   - **No BOM in JSON:** Write `changelog.json` and `RELEASES.md` via **Python UTF-8 without BOM**. (PowerShell `Set-Content` adds BOM and breaks `json.load`).
   - **Console Safe Text (cp1252):** Map special unicode characters (`✎`, `⇄`, `✕`, `→`, `↑`) to ASCII equivalents in the changelog to avoid Windows Console crashes during auto-update.
   - **Control Characters:** Do not modify the unit separator `\u001F` in `index.html`.

---