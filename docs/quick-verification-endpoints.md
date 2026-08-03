## Quick verification endpoints

- GET /api/tasks
  - returns app_version, mode, processed data, sidecars, `modified`, `stamp` (workbook version marker) and `digest` (short md5 of the served rows).
  - `fresh=1` ("Refresh" button): forgets in-memory caches and re-reads the workbook from scratch, as on first open.
- GET /api/modified?file=...
  - lightweight request (only `lastModifiedDateTime`/mtime) that the UI repeats every 20 seconds; when the `stamp` changes, it reloads on its own. Only accepts `onedrive:web` or files already known to the app.
- GET /logs
  - recent log lookup in the browser. To diagnose "stale state": the log has the workbook in use (item id), `written <date> #<digest>` on each read, and the state that was on screen when the user clicked a badge.

---