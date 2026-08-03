## 🧪 UI Testing (Playwright MCP)

The workspace ships a Playwright MCP server in `.vscode/mcp.json` (`npx @playwright/mcp@latest`, headless Edge, isolated profile, viewport 1280x800). It is dev tooling only — `.vscode/` is outside `CORE_FILES`/`CORE_DIRS`, so it never reaches a release.

**Requirements:** Node.js 18+ on the PATH. This machine uses a portable install at `%LOCALAPPDATA%\Programs\nodejs` (no admin rights); the PowerShell execution policy blocks the `npx.ps1` shim, so from a terminal always call `npx.cmd` / `npm.cmd`.

**Flow:**
1. Start the DEV instance: `python app.py --dev --no-browser --no-update` (port 8766). Confirm with `Invoke-RestMethod http://localhost:8766/api/ping`.
2. Drive `http://localhost:8766/` with the browser tools: navigate, read the accessibility snapshot, click, resize, evaluate.
3. Never point the browser at the stable instance on 8765.

**Rules that still apply:**
- **Measure, don't look.** Screenshots do not prove layout. Assert with `getBoundingClientRect()` / `clientWidth` / `getComputedStyle` inside a `page.evaluate`, and take the measurement in the **same** call as the resize.
- **Views:** always select tabs with `.tabs button[data-view]` — plain `.tabs button` also matches the settings gear.
- **Toast:** it is created on first use; read it as `(document.getElementById('toast')||{}).textContent`.
- **State:** top-level `let`/`const` globals (e.g. `todos`) are **not** on `window`. Inspect real state via `fetch('/api/tasks')` (rows live in `rows`, not `tasks`).
- **Drag & drop works.** Do not "fix" it without reproducing first; scroll the target into view before dragging.
- **Never trigger `/api/push`.** `/api/update` with a nonexistent `fn` is safe; clean up with `/api/overrides/clear`.

**Fallback without Node:** copy `index.html` + `app.py` to a temp dir, append a `<script>` that writes results into `<div id="TESTRESULT">`, serve on port 8768+ and dump the DOM with `msedge --headless=new --disable-gpu --virtual-time-budget=8000 --dump-dom http://localhost:8768/`.