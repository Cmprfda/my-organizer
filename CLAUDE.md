# My Organizer (CSW.AI.OS) — Instructions for AI Assistant

Local web app (V&V Team, Critical Software) that opens **any Excel workbook from OneDrive/SharePoint** (browse + pick in Settings) and shows it in a useful way. The `BSP-G2_Daily_Tracker.xlsx` compact/resumed view is a first-class special case and must keep working. Gives Carlos Andrade and teammates a unified view of tasks, CCRs, personal TODOs, and feedback.

> **Language:** respond in **English** (user request overrides the previous Portuguese rule). Code comments and UI strings stay Portuguese/English as today.

---

## 🤖 Model Workflow for New Implementations

For every new implementation (feature or non-trivial change), use this pipeline:

1. **Plan — Fable 5:** the main assistant (Fable 5) designs the implementation plan itself.
2. **Implement — Opus 5:** spawn a subagent with `model: opus` to write the code from that plan.
3. **Bug review — Sonnet 5:** spawn a subagent with `model: sonnet` to review the resulting changes for bugs before finishing.

Trivial edits (one-liners, typos) may be done directly without the pipeline.

---

## 🛠️ Quick Commands & CLI

- **Start DEV Server (Port 8766):** `.\run-dev.bat` (Runs `app.py --dev`)
- **Validate Syntax:** `python -m py_compile app.py` + `Get-ChildItem cswaios\*.py | ForEach-Object { python -m py_compile $_.FullName }`
- **Publish Release:** `.\make-release.bat` or `python make_release.py`
- **Verify DEV Endpoint:** `Invoke-RestMethod http://localhost:8766/api/tasks`
- **Start Isolated Test Instance (Port 8767+):** 
  `python app.py --dev --port 8767 --no-browser --no-update`
- **App CLI (no server):** `python app.py <help|update|version|status|push|logs|open|stop|login|logout>` (wrapper `bsp.bat`; `help` lists them, `help <cmd>` details one). Commands target the instance of their own folder via `/api/ping`; add `--dev` to prefer port 8766. They must run in a **separate** window — the server window does not accept input.

---

## 🏗️ Architecture Overview

- **`app.py`:** Thin entry point only (console encoding, `app_payload.zip` bootstrap — legacy `bsp_payload.zip` still accepted, CLI/server dispatch). **No business logic here.**
- **`cswaios/` package (backend layers, formerly `bsp/`):** `config` (constants; mutable globals `FORCED_FILE`/`SERVER_PORT`/`DEV_MODE` must always be read as `config.X`), `i18n`, `logs`, `text`, `store` (overrides/notes/CCRs), `todos` (personal TODO list; items may carry linked Jira issues in `jiraIssues`), `notepad` (Notes board: folders, notes, boxes and pasted images), `feedback`, `updates`, `excel` (openpyxl read + COM write), `graph` (Microsoft Graph: auth, folder browsing `graph_browse`, workbook pick `graph_pick`, recents in `workbooks.json`), `jira` (Jira REST calls via a Personal Access Token in `jira_config.json`: fetch an issue, log work, sum worklogs — used only by the TODO list, not Excel Tasks/CCRs), `tasks` (service layer, `build_payload`/`read_sheet`/`push_overrides`/`forget_web_cache`), `server` (HTTP routes, `Handler`, `main()`), `cli` (`python app.py <cmd>`). Python stdlib `ThreadingHTTPServer` + `openpyxl`, zero extra dependencies. Default port 8765, bound to `0.0.0.0` (LAN access).
- **`index.html`:** Markup only (plus the inline theme script, which must stay inline to avoid a flash).
- **`static/css/*.css` and `static/js/*.js`:** UI styles and logic, served by `/static/...`. Classic `<script src>` files loaded **in the original order** (not ES modules) — they share one global scope, so order matters: `i18n, state, bugs, utils, tasks, ccrs, views, todo, itembox, split, notes, feedback, settings, picker, jira, help, main`. Note that `split.js` registers a global Escape handler (`exitSplit`), so any overlay loaded after it must register its own Escape handler in the **capture** phase with `stopImmediatePropagation()`.
- **Theme:** the UI follows the **Critical Software Design System** (Critical Red `#C00000`, deep maroon `#63090D`, warm sand `#ECA682`, ink neutral ramp, **Aptos** typeface, crisp corners, flat surfaces, no glass/blur). All tokens live in `static/css/theme.css`, brand fonts in `static/fonts/`. **Never hardcode colours in CSS** — use the tokens / `--status-*` pairs. Full rules in `THEME.md` (the older iOS/HIG skill is superseded).
- **How-to knowledge lives in `static/js/help.js`** (the `?` button in the top bar, right of the connection badge). Do not add usage hints back into the views.
- **`run.bat`:** Double-click starter: detects Python, installs `openpyxl`, kills prior process on port 8765, and launches.
- **`setup.bat`:** Initial setup script (winget Python if missing, creates desktop shortcut).
- **Data sources:** local `.xlsx` (openpyxl read / COM write) **or** a workbook in OneDrive/SharePoint through the Excel REST API (Microsoft Graph), selected in **Definições → Dados** (`auto` / `onedrive` / `local`). In `auto`, if the chosen OneDrive workbook also exists as a **locally synced copy** (same file name under `CANDIDATE_DIRS`), that copy wins (`tasks.local_twin`, payload flag `synced_copy`): Excel writes land on disk immediately, while the cloud copy only gets them when OneDrive finishes uploading (minutes). While reading that copy, `tasks.sync_gap` compares the two copies' **content** (never their timestamps — the cloud item's `lastModifiedDateTime` moves before the new content is there) and appends the `notice_syncing` warning to the payload `notice` when they still differ; the cloud is only re-read when one of the copies changes (`_SYNC_CHECK`, cleared by `forget_cache`). The web source uses the virtual path `GRAPH_PATH = "onedrive:web"`; the workbook itself is chosen in **Definições → Livro do OneDrive** (picker overlay, `/api/graph` actions `browse`/`pick`, stored in `workbooks.json`). Sign-in is authorization code + PKCE on a loopback port (`/api/graph`, localhost only).
- **Status changes are never written immediately:** `/api/update` only stores a local override (✎); the write to Excel/OneDrive happens exclusively in `/api/push`. The same applies to the **`OBS`** column, which is editable in the compact view (`/api/update` accepts `Status TC`, `Status TP` and `OBS`).
- **Feedback delivery:** feedback and bug reports are always staged first in `feedback_pending\<nome>` (`cswaios.feedback.stage_feedback_folder`) and then delivered by `deliver()`, which tries in order: (1) **Microsoft Graph upload** into the shared SharePoint folder `config.FEEDBACK_SHARE_URL` (a link with write access for any Critical Software user; override with the `BSP_FEEDBACK_SHARE` env var, empty string disables it), (2) the locally synced `feedback\` folder next to the releases, (3) leave it pending — `flush_pending()` retries on the next report. Repeated bugs reuse the same remote folder and add a `repeticao_NN.txt`.
- **Data freshness:** the UI polls `/api/modified` every 20 s (cheap `lastModifiedDateTime`/mtime call) and reloads as soon as the `stamp` changes; the 2-minute `load()` cycle stays as a fallback. The **Atualizar** button sends `fresh=1`, which drops `_RAW_CACHE`/`_LAST_GOOD`/`_ADMIN_CACHE` and re-resolves the OneDrive item — a cold read, like opening the file for the first time.
- **Release payload:** the release zip carries `cswaios/`, `static/` **and** `app_payload.zip` (a copy of both folders). Older clients only copy top-level files when auto-updating, so the new `app.py` unpacks the payload on first start. Never drop `app_payload.zip` from `make_release.py`.
- **Local JSON State (NEVER include in releases):** `status_overrides.json`, `notes.json`, `ccrs.json`, `todo.json`, `notepad.json`, `notepad_images\`, `bug_reports.json`, `tracker.log`, `graph_config.json`, `graph_token.json`, `workbooks.json`, `jira_config.json` (Jira base URL + Personal Access Token; `POST /api/jira/config` is localhost-only, like `/api/graph`), `feedback_pending\` (feedback estagiado localmente até ser entregue na pasta partilhada via Graph ou na cópia sincronizada; `cswaios.feedback.flush_pending()` entrega-o depois).

---

## 📍 Environment & Folder Locations

| Environment | Directory Path | Purpose & Rules |
| :--- | :--- | :--- |
| **DEV / Project** | `C:\Users\cm-andrade\Desktop\my_projects\bsp-tracker` | **Work area.** Runs on port **8766** via `run-dev.bat`. Has red DEV bar. JSONs here are disposable test data. `run-dev.bat` & `CLAUDE.md` stay local. |
| **User Stable** | `C:\Users\cm-andrade\Desktop\my_projects\bsp-tracker-app` | **Real user instance.** Runs on port **8765**. Contains real user data (`notes.json`, `ccrs.json`, etc.). **NEVER edit code or test here.** |
| **Releases Share** | `C:\Users\cm-andrade\OneDrive - CRITICAL SOFTWARE, S.A\BSP-G2-Tracker-App` | Contains `releases\bsp-tracker-vN.zip`, `latest.json`, `changelog.json` (Source of Truth), `RELEASES.md`, and `feedback\`. |
| **Production Excel** | `C:\Users\cm-andrade\OneDrive - CRITICAL SOFTWARE, S.A\WRSHALLOWFORD - BSP_G2 (Moreira)\BSP-G2_Daily_Tracker.xlsx` | Default workbook. Main sheet: `PRJ_CFG1_reworks_julho`. Status list sheet: `Admin`. Other workbooks can be opened from the OneDrive picker. |
| **Zip Mirror** | `..\bsp-tracker.zip` | Mirror copy of the latest release zip. |

---

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

## 📦 Release Procedure (Execution Checklist)

1. Validate code: `python -m py_compile app.py` and every file in `cswaios\`.
2. Increment `APP_VERSION = N` in **`cswaios/config.py`**.
3. Run `.\make-release.bat` (or `python make_release.py`).
4. Enter changelog notes when prompted — **only functional, user-visible changes**. Internal refactors, file reorganisations and tooling changes are never mentioned to users.
5. **Commit and push the release** — no confirmation needed, this is standing approval:
   `git add -A` (skip local state/JSON data), `git commit -m "vN: <resumo>"`, `git push origin main`.
   Commit **before** running the release when possible, so the `vN` tag created by `make_release.py` points at the released code; if the code was committed afterwards, move the tag (`git tag -f vN` + `git push -f origin vN`).
6. Restart DEV server via `run-dev.bat` (Port 8766).
7. Verify release: `Invoke-RestMethod http://localhost:8766/api/tasks` -> verify `app_version` and `mode=dev`.
8. Inform user to refresh browser (F5).

> **Git:** the repository is `https://github.com/Cmprfda/my-organizer` (private, remote `origin`, branch `main`). Committing and pushing as part of a release is pre-authorised; `gh` lives at `"$env:ProgramFiles\GitHub CLI\gh.exe"` (not on PATH).

---

## � User-Facing Communication

- **Changelog / release notes: functional updates only.** Describe what the user can now do or what visibly changed; never internal architecture, refactors or build tooling.
- Positive feedback in the UI is **green** (`--ios-green`), negative/failure is **red** (`--ios-red`) — e.g. `toast(msg, "ok" | "err")` and the connection badge dot.

---

## �🔄 Feedback Workflow

1. Inspect unhandled feedback inside the shared feedback folder (`FEEDBACK_SHARE_URL`, or `BSP-G2-Tracker-App\feedback\*` when synced locally) — skip `Fixed\`.
2. Implement requested feature or fix.
3. Execute Release Procedure. Ensure changelog gives explicit credit/thanks to the author.
4. Move processed folder to `feedback\Fixed\`.

---

## 🧪 UI Testing (Playwright MCP)

The workspace ships a Playwright MCP server in `.vscode/mcp.json` (`npx @playwright/mcp@latest`, headless Edge, isolated profile, viewport 1280x800). It is dev tooling only — `.vscode/` is outside `CORE_FILES`/`CORE_DIRS`, so it never reaches a release.

**Requirements:** Node.js 18+ on the PATH. This machine uses a portable install at `%LOCALAPPDATA%\Programs\nodejs` (no admin rights); the PowerShell execution policy blocks the `npx.ps1` shim, so from a terminal always call `npx.cmd` / `npm.cmd`.

**Flow:**
1. Start the DEV instance: `python app.py --dev --no-browser --no-update` (port 8766). Confirm with `Invoke-RestMethod http://localhost:8766/api/ping`.
2. Drive `http://localhost:8766/` with the browser tools: navigate, read the accessibility snapshot, click, resize, evaluate.
3. Never point the browser at the stable instance on 8765.

**Rules that still apply:**
- **Measure, don't look.** Screenshots do not prove layout. Assert with `getBoundingClientRect()` / `clientWidth` / `getComputedStyle` inside a `page.evaluate`, and take the measurement in the **same** call as the resize.
- **Views:** always select tabs with `.tabs button[data-view]` — plain `.tabs button` also matches the settings gear.
- **Toast:** it is created on first use; read it as `(document.getElementById('toast')||{}).textContent`.
- **State:** top-level `let`/`const` globals (e.g. `todos`) are **not** on `window`. Inspect real state via `fetch('/api/tasks')` (rows live in `rows`, not `tasks`).
- **Drag & drop works.** Do not "fix" it without reproducing first; scroll the target into view before dragging.
- **Never trigger `/api/push`.** `/api/update` with a nonexistent `fn` is safe; clean up with `/api/overrides/clear`.

**Fallback without Node:** copy `index.html` + `app.py` to a temp dir, append a `<script>` that writes results into `<div id="TESTRESULT">`, serve on port 8768+ and dump the DOM with `msedge --headless=new --disable-gpu --virtual-time-budget=8000 --dump-dom http://localhost:8768/`.