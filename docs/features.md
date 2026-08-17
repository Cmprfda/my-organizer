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
- **Task history** — the app compares each read of the sheet with the previous
  one and keeps what changed, so a task's detail box shows *what happened to
  it*: date, column, old → new value, and whether the change was pushed from
  this app (**✎**) or came from someone editing the workbook (**☁**). Excel
  keeps none of this. Only changes made since this version started tracking the
  sheet are known.
- **Stale tasks** — unfinished tasks with no change on the sheet for N days get
  an age tag (⏳ 7 days) next to their name, and a **Stale** filter button in
  the summary row. The threshold is set in Settings (2/3/5/7/14 days). An age
  shown as *≥ 7 days* means the task has never been seen changing, so that is a
  lower bound, not the real age.
- **Pin (📌) on a task** — a task linked to a board note now shows the pin on
  the Excel side too (CCRs and TODO items already had it); clicking it opens the
  note. The link used to be visible only from inside the note.
- **Kanban timer → Jira** — the effort button on a TODO item shows the timer
  time that has not been logged yet (⏱ 1h 20m) and opens the effort dialog with
  it already filled in, with the start time moved back accordingly. Logging less
  than what is offered leaves the rest pending instead of writing it all off.
  When a card leaves *In progress* the timer stops and a one-click prompt offers
  to log it.
- **Metrics** (tab): changes per day, tasks stale the longest, work by status,
  load per person, time counted vs. logged in Jira, and TODO per column.
  The period can be the last 7/14/30 days, a date range of your choosing
  (*datas à escolha*, up to 92 days), or a single day. Clicking a column of the
  daily chart opens that day: every change of every workbook, with the time, the
  task, the column and the before → after — and a button back to the period.
- **My week** (button in Metrics): a report of what you did — statuses you
  pushed to the sheet, TODO items closed, time counted, effort logged in Jira,
  plus how much the team changed the sheet outside the app. Copies as markdown,
  ready to paste into a meeting or a chat.
- **Search everything** (**Ctrl+K**): one box across the rows of every open
  workbook, CCRs, TODO items, board notes (title and box text), linked Jira
  issues, and app actions. ↑/↓ to move, Enter to jump there, Esc to close.