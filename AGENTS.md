# Agent Instructions

## Tech Stack & Core Standards
- Stack: Python 3.x, stdlib `ThreadingHTTPServer`, `openpyxl` (read), Excel/COM (write), vanilla JS (ES5-compatible globals), CSS custom properties
- Style: Functional over OOP. Short, single-responsibility functions.
- Formatting: No fluff, no conversational filler in responses.

## Code Conventions
- Python: No bare `except`; always log before falling back to cache.
- JS: No ES modules — files share one global scope; load order in `index.html` is authoritative.
- CSS: Use `theme.css` tokens only. Never hardcode colours.
- Config globals (`FORCED_FILE`, `SERVER_PORT`, `DEV_MODE`): always read as `config.X`, never import directly.

## Rules of Engagement
1. Read existing code before modifying. Never re-invent utilities.
2. Maintain minimal diffs. Do not refactor unrelated code.
3. Writes to Excel must use COM — never `openpyxl` write paths.
4. Reference external specs when relevant:
   - Project instructions: `CLAUDE.md`
   - Theme rules: `THEME.md`
   - Task list: `tasks/active.md`
