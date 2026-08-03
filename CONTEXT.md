# CONTEXT.md

## 1) Project Title & Overview

## My Organizer (CSW.AI.OS)

**Summary:** Local web app (Python + vanilla HTML/CSS/JS) that opens any
Excel workbook from OneDrive/SharePoint (folder browsing and pick in the app)
and shows it in a useful way. The `BSP-G2_Daily_Tracker.xlsx` tracker keeps
its dedicated compact view, with filters by person/role, status editing with
safe writes to Excel via COM, CCR management, personal TODO, execution notes
and feedback/bug reporting.

**Who uses it:**
- V&V engineers (e.g. Carlos Andrade and team).
- Used on desktop and mobile on the same local network.

**Problem it solves:**
- Avoids manual work scattered across Excel, local notes and messages.
- Creates a single operational view with controlled local persistence and
  sync with Excel/OneDrive.

---

## 2) Tech Stack & Dependencies

**Backend**
- Python 3 (entry point [app.py](app.py) + package [cswaios/](cswaios)).
- Standard libraries: http.server, threading, subprocess, json, zipfile, tempfile, glob, os, socket, datetime, etc.
- openpyxl (workbook reading and data parsing).
- Windows Excel COM integration via PowerShell (writes to the real Excel file, never via openpyxl).

**Frontend**
- Markup in [index.html](index.html); styles in `static/css/*.css` and logic in `static/js/*.js` (HTML + CSS + vanilla JavaScript).
- Drag and drop + pointer/touch fallback for mobile/tablet browsers.
- PT/EN i18n on the client (internal dictionary in `static/js/i18n.js`).

**External integrations**
- OneDrive/SharePoint (tracker file + releases folder).
- Local desktop Excel (COM automation for robust writes).
- Local LAN network (access by IP and localhost).

**Release automation**
- Scripts: [make_release.py](make_release.py), [make-release.bat](make-release.bat), [run-dev.bat](run-dev.bat), [run-with-server.bat](run-with-server.bat), [setup.bat](setup.bat).
- Every release ends with **commit + push** to `origin/main` (private repo `Cmprfda/my-organizer`); step 9 of `make_release.py` also publishes the zip to GitHub Releases with the tag `vN`.

---

## 3) Architecture & Data Flow

## Main flow (read and render)

Excel/OneDrive -> Backend `cswaios/excel.py` or `cswaios/graph.py` -> Raw sheet cache (_RAW_CACHE) + last-good-read cache (_LAST_GOOD) in `cswaios/tasks.py` -> API /api/tasks (`cswaios/server.py`) -> Frontend `static/js/tasks.js` -> Compact/full table, CCRs, TODO, feedback

In the `auto` source, when the workbook chosen on OneDrive also exists as a
synced copy on disk (`tasks.local_twin`), that copy is the one read
(`synced_copy=true` in the payload): whatever gets written to Excel shows up
immediately, while the cloud copy only receives the changes once OneDrive
finishes syncing (can take minutes).

While reading the local copy, `tasks.sync_gap` compares the content of the
two copies (`rows_digest`, which ignores empty cells and trailing empty rows
because local Excel and the cloud don't count the sheet the same way) and, if
they differ, appends the `notice_syncing` warning to the payload's `notice`
(shown with an ℹ under the file name). Dates aren't used to decide this:
OneDrive updates the item's `lastModifiedDateTime` **before** the new content
is actually available. The comparison only actually reads the cloud when one
of the copies changes (the verdict is cached in `_SYNC_CHECK`, cleared by
`forget_cache`); if the Graph call fails, the warning simply doesn't appear.

## Status update flow (safe write)

UI (status badge or `Obs:` cell) -> POST /api/update (allowed columns: `Status TC`, `Status TP`, `OBS`) -> row key validation (sheet+fn+todo) -> always saves a local override in [status_overrides.json](status_overrides.json) (✎) -> the write to Excel/OneDrive only happens on POST /api/push -> next read reconciles base vs override

## Notes/CCRs/TODO flow

- Per-task execution notes: [notes.json](notes.json)
- CCR status: [ccrs.json](ccrs.json)
- Personal TODO (manual): [todo.json](todo.json) — each item has one main source (`kind`/`ref`) and may have others linked in `links` (it's the same work coming from Excel, a CCR, or typed by hand)

All these sidecars are served by the backend and rendered on the frontend; in
the DEV workspace they're considered disposable data.

## Feedback/bugs flow

Frontend (manual feedback or JS error) + backend (exceptions) ->
`feedback.stage_feedback_folder()` creates the folder in `feedback_pending\`
-> `feedback.deliver()` tries (1) upload via Microsoft Graph to the shared
folder `config.FEEDBACK_SHARE_URL` (a SharePoint link with write access for
anyone at Critical Software; overridden via the `BSP_FEEDBACK_SHARE`
variable), (2) the locally synced `feedback\` folder, (3) stays pending and
is retried later by `feedback.flush_pending()`. Bug deduplication by
signature in [bug_reports.json](bug_reports.json) + appended
[tracker.log](tracker.log); repeats write `repeticao_NN.txt` in the same
folder.

---

## 4) Directory Map & Key Files

- [app.py](app.py)
  - Thin entry point: console encoding, `app_payload.zip` install (also accepts the old `bsp_payload.zip`) and CLI/server dispatch.

- [cswaios/](cswaios)
  - `config` (constants and version), `i18n`, `logs`, `text`.
  - `store`/`todos`/`feedback` (local JSON state), `updates` (auto-update).
  - `excel` (openpyxl read + COM write) and `graph` (Microsoft Graph: auth, browsing `graph_browse`, workbook pick `graph_pick`, recents in `workbooks.json`).
  - `tasks` (data service: `read_sheet`, `build_payload`, `current_stamp`, `local_twin`, `sync_gap`, `push_overrides`, `forget_cache`/`forget_web_cache`).
  - `server` (HTTP endpoints: /api/tasks, /api/modified, /api/update, /api/todo, /api/note, /api/ccrs, /api/feedback, /api/bug, /static/...), `cli` (`python app.py <cmd>` commands).

- [index.html](index.html)
  - View markup (Tasks/CCRs/TODO/Feedback tabs) and linkage to the `static/` files.

- `static/css/*.css`
  - Theme, layout, TODO, CCRs, forms, tables, views, help, workbook picker and responsive rules (in this order).
  - The theme follows the **Critical Software Design System** (brand tokens, Aptos, crisp corners): see [THEME.md](THEME.md).

- `static/fonts/*.ttf`
  - Brand typography (Aptos, Aptos SemiBold, Aptos Narrow Bold, Aptos Mono), served at `/static/fonts/...`.

- `static/js/*.js`
  - `i18n, state, bugs, utils, tasks, ccrs, views, todo, split, feedback, settings, picker, help, main` — loaded in this order (classic scripts, shared global scope).
  - `picker.js` is the OneDrive workbook picker (folder browsing, search, recents).
  - `help.js` holds all the usage knowledge shown in the `?` button.

- [run-dev.bat](run-dev.bat)
  - DEV startup (port 8766), no auto-update.

- [run-with-server.bat](run-with-server.bat)
  - Stable startup (port 8765), dependencies, stopping the prior instance, auto-update flow. The main entry point is the "My Organizer" shortcut (My Organizer.vbs); this file is the console-visible alternative.

- [setup.bat](setup.bat)
  - Initial setup (Python/dependencies/shortcut).

- [make_release.py](make_release.py)
  - Release publishing (changelog/latest/mirror zip + GitHub Release with tag `vN`).
  - After publishing: `git commit` + `git push origin main` of the version changes.

- [README.md](README.md)
  - Operational manual and integration notes.

- [CLAUDE.md](CLAUDE.md)
  - Critical operational rules for agents.

- [_rollback/]( _rollback/ )
  - Local snapshots and rollback mechanisms.

- [tests/](tests/)
  - Test scripts/cases.

- [status_overrides.json](status_overrides.json), [notes.json](notes.json), [ccrs.json](ccrs.json), [todo.json](todo.json), [bug_reports.json](bug_reports.json), [tracker.log](tracker.log)
  - Local sidecar state and logs.

---

## 5) Critical Constraints & Invariants

1. **Never write to Excel via openpyxl.**
   - Writes are only allowed via COM (desktop Excel).

2. **Never test/write to the real Excel file in destructive tests.**
   - Use a temporary test copy where applicable.

3. **TODO is manual-only.**
   - TODO status/column only changes via an explicit user action (drag/drop, checkbox, timer controls).

4. **Separate stable and DEV ports.**
   - 8765 stable, 8766 DEV, 8767+ disposable test instances.

5. **Never touch Windows Firewall/security config.**

6. **Never corrupt release metadata encoding.**
   - changelog/latest/RELEASES in UTF-8 without BOM (avoid breaking auto-update/json parsing).

7. **Preserve frontend/backend identifiers and contracts.**
   - IDs/classes used by JS and API payloads are part of the contract.

8. **Stable user data must never be touched in tests.**
   - Stable environment kept separate from the DEV workspace.

9. **Read resilience is mandatory.**
   - On Excel lock, serve a valid cache instead of breaking the experience.

10. **Thread safety/log safety.**
   - Log writes synchronized via lock.

---

## 6) Environment, Modes and Ports

## Environments

- **DEV (development workspace):**
  - Folder: [bsp-tracker](.)
  - Startup: [run-dev.bat](run-dev.bat)
  - Mode: --dev flag
  - Port: 8766
  - No auto-update active in the DEV flow.

- **Stable (user instance):**
  - Folder: bsp-tracker-app (outside the current workspace)
  - Startup: "My Organizer" shortcut (My Organizer.vbs → [run-with-server.bat](run-with-server.bat))
  - Port: 8765
  - Auto-update via latest.json + release zips.

- **Isolated test:**
  - Startup: python app.py --dev --port 8767 --no-browser --no-update
  - Used for smoke tests without interfering with 8766.

## Relevant flags/config

- --dev: enables DEV_MODE and disables auto-update.
- --port: sets the server port.
- --file: forces a specific workbook.
- --host (when used): restricts binding (e.g. localhost only).

## Quick verification endpoints

- GET /api/tasks
  - returns app_version, mode, processed data, sidecars, `modified`, `stamp` (workbook version marker) and `digest` (short md5 of the served rows).
  - `fresh=1` ("Refresh" button): forgets in-memory caches and re-reads the workbook from scratch, as on first open.
- GET /api/modified?file=...
  - lightweight request (only `lastModifiedDateTime`/mtime) that the UI repeats every 20 seconds; when the `stamp` changes, it reloads on its own. Only accepts `onedrive:web` or files already known to the app.
- GET /logs
  - recent log lookup in the browser. To diagnose "stale state": the log has the workbook in use (item id), `written <date> #<digest>` on each read, and the state that was on screen when the user clicked a badge.

---

## Operational Note for Agents

Any change to the project must respect:
1. API contracts and sidecar state behavior.
2. Excel/COM write safety rules.
3. Strict separation between DEV and stable.
4. Release process and DEV validation after changes.
