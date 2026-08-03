## 2. Color

| Token | Value | Use |
| :-- | :-- | :-- |
| `--csw-red-600` | `#C00000` | **Critical Red** — primary accent (buttons, links, `//`, highlights) |
| `--csw-red-700` | `#8E0407` | hover/pressed |
| `--csw-red-900` | `#63090D` | deep maroon (dark brand surfaces) |
| `--csw-sand-400` | `#ECA682` | warm sand — secondary accent, used sparingly |
| `--ink-950 … --ink-50`, `--white` | neutral ramp | text, surfaces, borders |
| `--green-600` / `--amber-600` / `--blue-600` | semantic | positive / warning / info state |

Application-level aliases: `--bg`, `--surface`, `--text`, `--muted`, `--border`, `--accent`,
`--accent-hover`, `--accent-soft`, `--focus-ring`.

**Red/green as text:** use `--accent-text` and `--ok-text` (never `--accent`
or `--ios-red`/`--ios-green`) whenever the color is applied to `color:`. In the
dark theme these tokens are lighter shades (`#e08b8b` / `#6fd39a`), because the
brand red on black loses legibility. `--accent` remains the right color for
backgrounds, borders and highlights.

**States** (always use these pairs, already resolved for light/dark):
`--status-done-bg/-fg`, `--status-doing-bg/-fg`, `--status-blocked-bg/-fg`,
`--status-info-bg/-fg`.

The user's rule still applies: positive feedback in green (`--ios-green` → `--green-600`),
failure in red (`--ios-red` → `--csw-red-600`).