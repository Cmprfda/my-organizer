## Features

- **Compact view** (by default): Tasks/Functions · Role (Author/Reviewer of Task/TP) · Status · What to do
- Filter buttons (you can combine multiple):
  - **Author / Reviewer** — filters by your role
  - **On my side** — the ball is on your side (work to do or reviews waiting for you)
  - **On the other side** — waiting for others (in review, or author reworking)
  - **Done** — completed
- **Status editing** — click a status badge to change it. The app
  **writes the change to Excel itself** via Excel/COM (preserves
  charts and validations; the change goes to SharePoint via OneDrive as a
  normal edit). Before writing, it confirms the sheet row hasn't changed.
  If the Excel write fails, the change is saved locally (**✎** and
  blue ring on the badge) and takes effect when that cell is updated.
- **Execution / notes** — per task: quick label (Running on Jenkins,
  Saving logs, …), **execution checklist** (ran on dev branch, ran
  on component branch, component branch updated, review branch
  updated — green chips when done) and free text (number of runs, links).
  Saved on the server: same state across all your devices.
- **Personal TODO** with two modes: **List** and **Kanban** (To do, In progress,
  Review, Done), with drag&drop between columns and support for dragging items from
  Tasks/CCRs to the TODO.
- In TODO cards with detail view, the note also appears in **chip** (📝), in
  the visual style of the integrated board.
- The numbers on filter buttons recalculate based on active filters;
  buttons with no results are dimmed
- Free text search box
- **Full view** — the original table with all columns and detailed statuses
- **Show all** — tasks from the entire team
- Automatic refresh every 2 minutes