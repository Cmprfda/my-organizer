## Backlog

### [DONE] Assistant (💬 / Ctrl+I)
- **What landed:** `cswaios/chat.py` (`answer()`, local intent engine, `POST /api/chat`),
  `static/js/chat.js` + `static/css/chat.css` (docked panel, context builder,
  confirmation of proposed changes), `taskAgeInTab()` in `static/js/history.js`
  (row age for any open workbook, not just the one on screen), plus i18n and a
  help section.
- **Design:** the context travels with the question (the client's own in-memory
  snapshot), so answering never reads Excel/OneDrive; writes come back as
  proposals the client executes through `/api/todo`, `/api/update` and
  `/api/note` after a Confirm.
- **Engine:** `local` (deterministic, the only one implemented) chosen in
  `chat_config.json`; `llm` is a documented seam (`_llm_reply`) that falls back
  to the local engine with a notice while it is not configured.
- **Known limits (worth revisiting):**
  - The local engine understands a defined set of shapes (the `help` intent
    lists them); anything else falls back to searching what is open. Free-form
    phrasing is what the `llm` engine is for.
  - `status_set` on a sheet displayed through a **mapped view** writes the
    tracker column and counts in the Push, but the mapped cell keeps showing the
    sheet value until the Push (that view reads cells by coordinate and writes
    through `/api/cellcat/update`).
  - "Mine" is exact while *Show all* is off (the server already filtered by
    person); with it on, ownership is guessed from the name in the row, with the
    same tolerance for partial names as the rest of the app.
  - The context is capped (4 workbooks, 400 rows each from the client, 800 at
    the server) — a very large sheet answers about its first rows only.
  - The conversation lives in memory: closing the app forgets it.

### [DONE] Task history, stale tasks, weekly report, metrics, global search, timer → Jira
- **What landed:** `cswaios/history.py` (per-sheet change history, seeded from
  `read_sheet`, app writes tagged by `push_overrides`), `cswaios/report.py`
  (`GET /api/report/week`), `GET /api/history` and `GET /api/history/recent`,
  plus `static/js/history.js`, `metrics.js` and `search.js`.
- **Released in:** v123.
- **Known limits (worth revisiting):**
  - History is keyed by sheet row number, like the notification cards. A row
    inserted or deleted shifts every row below it, so the snapshot is re-seeded
    instead of inventing a burst of changes — ages then restart as `≥` estimates
    (see `_looks_like_row_shift`).
  - App writes are tagged from an in-memory registry with a 1-hour lifetime, so
    a Push whose change only reaches the sheet much later (OneDrive co-authoring
    lag) is recorded as coming from the sheet, not from the app.
  - There is no per-person attribution for changes made outside the app: the
    sheet does not say who edited a cell.
  - "Time counted" in the report is the timers' running total, not just the
    period's — the app has no per-day breakdown of timer time.

### [TODO] Admin welcome/announcement message
- **Request:** Allow admins to set a message that is shown to users the first time they open the app (or after it is updated).
- **Notes:**
  - Backend: add a `GET /api/announcement` endpoint that reads a message from a config file (e.g. `announcement.json` — excluded from releases like other local JSON state). The payload should include the message text and a version/ID key so the client can tell if it has already been dismissed.
  - Frontend: on first load (`main.js`), call `/api/announcement`; if the message is new (compare stored ID in `localStorage`), show a modal or banner before the normal UI renders. Store the seen ID in `localStorage` to suppress it on subsequent opens.
  - Admin write path: `POST /api/announcement` (localhost-only, like `/api/graph`) to set/clear the message.

### [FEEDBACK] Multiple Excel workbook windows
- **Source:** Carlos Andrade — feedback `20260803_192147_Carlos_Andrade` (v1.3.0, page: Tarefas)
- **Request:** Give the ability to have multiple excel windows open simultaneously.
- **Notes:** Currently the app is scoped to a single active workbook at a time. This would require rethinking the data model in `cswaios/tasks.py` (`_RAW_CACHE`, `_LAST_GOOD`) and the UI tab/view routing to support multiple concurrent workbook sessions.