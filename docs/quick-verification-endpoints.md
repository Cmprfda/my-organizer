## Quick verification endpoints

- GET /api/tasks
  - returns app_version, mode, processed data, sidecars, `modified`, `stamp` (workbook version marker) and `digest` (short md5 of the served rows).
  - `fresh=1` ("Refresh" button): forgets in-memory caches and re-reads the workbook from scratch, as on first open.
- GET /api/modified?file=...
  - lightweight request (only `lastModifiedDateTime`/mtime) that the UI repeats every 20 seconds; when the `stamp` changes, it reloads on its own. Only accepts `onedrive:web` or files already known to the app.
- GET /api/events?cid=<window id>
  - hung connection (SSE) that carries `state` / `sheet` / `excel` events to the open windows. `curl -N http://127.0.0.1:8765/api/events` shows `retry:`, a `hello` and then whatever happens; each event names the window that caused it (`from`), so a window can ignore its own. 503 means the listener cap is full (`events.MAX_OUVINTES`) and the client should stay on polling.
- GET /api/history/who?file=&sheet=&xlrow=&col=&ts=&from=&to=
  - who changed **that cell**: reads the workbook versions from OneDrive (see `cswaios/authors.py`). Answers `{ok:false,error}` — not an HTTP error — when the question has no possible answer (local file, versions already gone, cell changed again since).
- GET /api/team/filters?person=<me>
  - filter sets published by the team into the shared folder; the POST (localhost only) publishes mine.
- POST /api/jira/worklog/bulk
  - logs several timesheet lines to Jira in one request (`entries: [{key, timeSpent, started, item_id, timer_ms}]`); each line is logged on its own and the reply says which ones made it.
- GET /logs
  - recent log lookup in the browser. To diagnose "stale state": the log has the workbook in use (item id), `written <date> #<digest>` on each read, and the state that was on screen when the user clicked a badge.

---