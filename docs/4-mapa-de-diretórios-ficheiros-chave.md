## 4) Directory Map & Key Files

- [app.py](app.py)
  - Core of the system.
  - HTTP endpoints (/api/tasks, /api/update, /api/todo, /api/note, /api/ccrs, /api/feedback, /api/bug, etc.).
  - Read caching, COM integration, override policy, boot/restart/update flow.

- [index.html](index.html)
  - Complete UI (Tasks/CCRs/TODO/Feedback tabs).
  - Client logic: filters, compact/full render, DnD, pointer fallback, i18n, edit interactions.

- [run-dev.bat](run-dev.bat)
  - DEV startup (port 8766), no auto-update.

- [run-with-server.bat](run-with-server.bat)
  - Stable startup (port 8765), dependencies, stop prior instance, auto-update flow.

- [setup.bat](setup.bat)
  - Initial setup (Python/dependencies/shortcut).

- [make_release.py](make_release.py)
  - Release publishing (changelog/latest/mirror zip).

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