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
Feedback arrives through **two** channels — always check both before deciding
there is nothing to do.

- **Shared folder** (colleagues on the Critical Software share): read unhandled
  bug reports and user feedback per CLAUDE.md's Feedback Workflow, ignoring
  `Fixed\`.
- **GitHub issues** (whoever cannot reach that share — the app offers them a
  prefilled issue instead):
  `gh issue list --repo Cmprfda/my-organizer --state open`
  (in PowerShell `gh` is not on PATH — see CLAUDE.md's Release Procedure for
  its full path). Reports filed this way are titled
  `[Feedback] <timestamp>_<name>`.
  Screenshots are *not* attached unless the author dragged them in, and the
  body says which files were left behind on their PC — ask for them rather than
  guessing.
- Parse the report, check attached screenshots, and inspect `tracker.log` for
  stack traces.
- The two channels do not deduplicate against each other: `bug_reports.json`
  signatures and `delivered_folder_exists()` only ever look at the folders, so
  the same recurring crash can appear both as `repeticao_NN.txt` in a folder
  and as separate issues. Reconcile by hand when a report looks familiar.
- Identify whether the issue originates from the JS client (`static/js/*`), the Python service layer (`cswaios/*`), or the Excel COM integration (`cswaios/excel.py`).

### 2. Implementation
- Test and apply changes strictly inside this DEV instance (port 8766 via `run-dev.bat`) — see CLAUDE.md's Environment table and Rigid Safety rules for the full constraints (never touch `bsp-tracker-app`, never wipe JSON state without reading it first, COM-only Excel writes, etc.).

### 3. Release & Archiving
Once the fix is validated on port 8766, follow CLAUDE.md's Release Procedure exactly (version bump in `cswaios/config.py`, `make-release.bat`, commit+push), then:
1. Add a thank-you note to the author in the changelog entry — the GitHub
   handle (`@user`) when the report came in as an issue, the reporter's name
   when it came from the shared folder.
2. Close the item in the channel it arrived through:
   - **Folder:** move `feedback\<folder_name>` to `feedback\Fixed\<folder_name>`.
   - **Issue:** comment with the version that carries the fix, then close it:
     `gh issue close <n> --repo Cmprfda/my-organizer --comment "Corrigido na vN."`
     An open issue reads as unresolved no matter what shipped, so this is the
     exact counterpart of the move to `Fixed\`.

---

## 📋 Response Structure

1. **Resolution plan (1-2 sentences):** What the feedback/log revealed and the fix approach.
2. **Files changed:** List of affected files.
3. **Code / change applied:** Diff or corrected code block.
4. **Validation & release:** Confirmation that the version was bumped, port-8766 tests passed, and the item was closed in its own channel (folder moved to `Fixed\`, or issue commented and closed). State which channel the report came from.