## Features

- **OneDrive workbook** (Settings → *Change workbook*): browse folders in
  OneDrive and the SharePoint sites you follow, search by name, and open any
  `.xlsx` file. Recently used workbooks stay within reach.
- **`?` button** (in the top bar, right of the connection indicator): opens
  the **"How to use"** guide with all app usage instructions.
- **Badge in the top-right corner**: shows where the data comes from —
  green (OneDrive connected), red (ready to connect / no server) or gray
  (local file). Click it to open Settings.
- **Compact view** (default): TCs/Functions · Role (Author/Reviewer of TC/TP) · Status · What to do
- Filter buttons (can be combined):
  - **Author / Reviewer** — filter by your role
  - **On my side** — the ball is on your side (work to do or reviews waiting on you)
  - **On the other side** — waiting on others (in review, or the author reworking it)
  - **Done** — completed
- **Status editing** — click a status badge to change it. The app **saves the
  change to the Excel file itself** via Excel/COM (preserves charts and
  validations; the change syncs up to SharePoint via OneDrive like a normal
  edit). Before writing it confirms the sheet row hasn't changed. If writing
  to Excel fails, the change is saved locally (**✎** and a blue ring on the
  badge) and the sheet catches up next time that cell is refreshed.
- **Execution / notes** — per task: quick tag (Running on Jenkins, Saving
  logs, …), **execution checklist** (ran on dev branch, ran on component
  branch, component branch updated, review branch updated — green chips when
  done) and free text (number of runs, links). Saved on the server: the same
  state across all your devices.
- **Personal TODO** with two modes: **List** and **Kanban** (To do, In
  progress, Pending, Done), with drag&drop between columns and support for
  dragging items from Tasks/CCRs into the TODO.
- On TODO cards with detail, the note also appears as a **chip** (📝), in the
  visual style of the integrated board.
- Filter button counts recalculate based on active filters; buttons with no
  results are dimmed
- Free-text search box
- **Full view** — the original table with all columns and detailed statuses
- **See all** — the whole team's tasks
- Auto-refresh every 2 minutes