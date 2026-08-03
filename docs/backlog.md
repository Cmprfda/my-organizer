## Backlog

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