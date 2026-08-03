## Integration Notes

- TODO no longer has its own note editor.
- Notes should be managed in the source views:
  - **Tasks (Excel)** use the existing "Execução / notas" editor
  - **CCRs** use the existing CCR notes column/editor
- Tablet/mobile browsers now use a **pointer-based drag fallback** so dragging
  works even when native HTML5 drag-and-drop is unreliable.
- TODO Kanban now includes an **In progress timer**:
  - moving a card into **Em curso** starts the clock automatically
  - moving it out pauses and accumulates elapsed time
  - clicking the timer on an **Em curso** card toggles start/pause
  - a **restart (↺)** control resets elapsed time (and restarts immediately if still in Em curso)
  - elapsed time remains visible after pause/move
- TODO status/column changes are **manual only**: only explicit user actions
  (drag/drop, checkbox, timer controls) can move or update TODO items.