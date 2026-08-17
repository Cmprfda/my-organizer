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
  - ~~The conversation lives in memory: closing the app forgets it.~~ Fixed in
    v127: it is kept in this browser's `localStorage` (`bsp-tracker-chat`, the
    last 60 messages), like the theme or the split size. A proposal that was
    never confirmed comes back marked as expired instead of confirmable — the
    workbook it was about may have been reread (or closed) in the meantime.

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

### [DONE] Admin welcome/announcement message
- **What landed:** `announcement.json` + `load_announcement()`/`save_announcement()`
  in `cswaios/store.py`, `GET`/`POST /api/announcement` (the POST localhost-only,
  like `/api/graph`), `static/js/announce.js` with the modal and the editor card
  in the Settings page, plus i18n.
- **Design:** the `id` is a hash of the content, computed on the server — editing
  the text gives a new id and the notice shows again to everyone, and each browser
  stores the last id it read in `localStorage` (`bsp-tracker-announce-seen`), so
  reopening the app with the same text does not nag whoever already read it.
- **Reach:** the notice is written to the shared releases folder when it is
  mounted on the machine (`find_releases_dir()`), the same folder that already
  delivers updates and the changelog — so it reaches every install, not only the
  clients of one instance. The shared copy wins over the local one on read; the
  local copy is the fallback (no shared folder, or a notice meant only for the
  LAN clients of that instance).
- **Released in:** v127.
- **Known limits (worth revisiting):**
  - It reaches other installs only when they are opened (there is no push): the
    file is read once per app start and whenever the Settings page opens.
  - Recipients whose share is read-only cannot publish to everyone — their
    notice stays local, for whoever opens their instance.
  - No scheduling and no "who has read it": one live message at a time.

### [DONE] Multiple Excel workbook windows
- **Source:** Carlos Andrade — feedback `20260803_192147_Carlos_Andrade` (v1.3.0, page: Tarefas)
- **Request:** Give the ability to have multiple excel windows open simultaneously.
- **What landed:** `⧉` on each workbook tab (and middle-click) opens the app in a
  second window already on that workbook — `/?wb=<id>`, read into `SOLO_WB`
  (`static/js/state.js`); `openWorkbookWindow()` in `static/js/workbooks.js`, with
  `POST /api/window` (localhost-only) opening a native window when the UI is the
  pywebview window, where `window.open` does nothing.
- **Design:** each window is its own JavaScript context — its own data, filters
  and polling — so nothing had to be duplicated inside the page. The server side
  already keyed its caches per workbook (`_RAW_CACHE`, `_LAST_GOOD` in
  `cswaios/tasks.py`), so two windows on two workbooks never collide.
- **Released in:** v127.
- **Known limits (worth revisiting):**
  - A dedicated window never saves the open-workbook list (`saveWorkbookTabs()`
    returns early when `SOLO_WB` is set): the `localStorage` is shared with the
    main window and saving there would close its tabs. So opening another
    workbook inside a dedicated window works, but only until it is closed —
    including the sheet chosen in its selector.
  - Split screen inside one window still shows a single workbook: the `#excelView`
    panel is one, and it follows the active tab. Two workbooks side by side means
    two windows.
  - Two windows reading the same workbook each poll it on their own (the 20s
    cycle runs per window).