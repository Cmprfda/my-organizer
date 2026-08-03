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