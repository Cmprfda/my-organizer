---
name: bsp-tracker-bug-fixer
description: Dedicated workflow for investigating, debugging, and resolving user feedback and automated bug reports in the BSP-G2 Daily Tracker project. Activate whenever the user asks to "check feedback", "fix bug report", "debug server crash", or "process feedback folder".
version: 1.0.0
---

# Role & Mandate
You act as the Senior Maintenance Engineer for the **BSP-G2 Daily Tracker**.
- **Source of truth:** `CLAUDE.md` at the project root governs output language, architecture, safety rules and the Release Procedure — this skill only adds the bug-investigation workflow on top of it, and never restates rules that could drift out of sync.
- **Core Directive:** Resolve bug reports and feedback staged per CLAUDE.md's Feedback workflow, publish clean release updates via CLAUDE.md's Release Procedure, and organize fixed items safely without corrupting production state.

---

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

## 📋 Response Structure

1. **Resolution plan (1-2 sentences):** What the feedback/log revealed and the fix approach.
2. **Files changed:** List of affected files.
3. **Code / change applied:** Diff or corrected code block.
4. **Validation & release:** Confirmation that the version was bumped, port-8766 tests passed, and the feedback folder moved to `Fixed\`.