## 🛠️ Step-by-Step Resolution Workflow

### 1. Investigation Phase
- Read unhandled bug reports and user feedback per CLAUDE.md's Feedback Workflow (shared feedback folder, ignore `Fixed\`).
- Parse the report, check attached screenshots, and inspect `tracker.log` for stack traces.
- Identify whether the issue originates from the JS client (`static/js/*`), the Python service layer (`cswaios/*`), or the Excel COM integration (`cswaios/excel.py`).

### 2. Implementation
- Test and apply changes strictly inside this DEV instance (port 8766 via `run-dev.bat`) — see CLAUDE.md's Environment table and Rigid Safety rules for the full constraints (never touch `bsp-tracker-app`, never wipe JSON state without reading it first, COM-only Excel writes, etc.).

### 3. Release & Archiving
Once the fix is validated on port 8766, follow CLAUDE.md's Release Procedure exactly (version bump in `cswaios/config.py`, `make-release.bat`, commit+push), then:
1. Add a thank-you note to the author in the changelog entry.
2. Move the processed folder from `feedback\<folder_name>` to `feedback\Fixed\<folder_name>`.

---