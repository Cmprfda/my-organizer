## 🏗️ Architecture Overview

- **`app.py`:** HTTP Server (Python stdlib `ThreadingHTTPServer` + `openpyxl`, zero extra dependencies). Default port 8765, bound to `0.0.0.0` (LAN access).
- **`index.html`:** Complete client UI (vanilla HTML/CSS/JS served by `app.py`).
- **`run.bat`:** Double-click starter: detects Python, installs `openpyxl`, kills prior process on port 8765, and launches.
- **`setup.bat`:** Initial setup script (winget Python if missing, creates desktop shortcut).
- **Data sources:** local `.xlsx` (openpyxl read / COM write) **or** the workbook in SharePoint through the Excel REST API (Microsoft Graph), selected in **Settings → Data Source** (`auto` / `onedrive` / `local`). The web source uses the virtual path `GRAPH_PATH = "onedrive:web"`; sign-in is authorization code + PKCE on a loopback port (`/api/graph`, localhost only).
- **Status changes are never written immediately:** `/api/update` only stores a local override (✎); the write to Excel/OneDrive happens exclusively in `/api/push`.
- **Local JSON State (NEVER include in releases):** `status_overrides.json`, `notes.json`, `ccrs.json`, `todo.json`, `bug_reports.json`, `tracker.log`, `graph_config.json`, `graph_token.json`.

---