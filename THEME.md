# Theme — Critical Software Design System

The **My Organizer (CSW.AI.OS)** interface follows the *Critical Software Design System*
(source folder: `critical-software-design-system-652547b1-93ba-462e-82fc-9f8e8b78ea78`).
This document is the single reference for the theme; any new CSS must use the tokens below
instead of fixed values.

> The previous iOS aesthetic has been superseded. The `--ios-*` variable names **remain**
> as aliases (so existing CSS doesn't break), but now point to brand tokens.

---

## 1. Where the theme lives

- [static/css/theme.css](static/css/theme.css) — Aptos `@font-face`, brand tokens,
  legacy aliases, light/dark theme and the `.eyebrow` utility class.
- `static/fonts/*.ttf` — Aptos, Aptos SemiBold, Aptos Narrow Bold, Aptos Mono
  (served via `/static/fonts/...`; `cswaios/server.py` maps `.ttf`).
- The remaining `static/css/*.css` files only consume variables.

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

## 3. Typography

- `--font-sans` → **Aptos** (body and UI).
- `--font-display` → **Aptos Narrow** (h1/h2/h3, large numbers).
- `--font-mono` → **Aptos Mono** (eyebrows `// LABEL`, table headers,
  field labels, Kanban column titles).
- Titles in *sentence case*, tracking `-0.01em`.
- Brand motif: `.eyebrow` class (mono, uppercase, `letter-spacing: .14em`,
  automatic `// ` prefix). Used in the app header.

## 4. Shape, shadow and motion

- **Crisp corners:** cards `--ios-radius-card` = 12px; buttons/fields
  `--ios-radius-btn` = 4px; pills 999px only on chips/badges.
- **Borders:** 1px hairline (`--border`).
- **Neutral shadows** (no colored glow): `--ios-shadow` (resting) and
  `--ios-shadow-lg` (overlays, floating elements, card hover).
- **No glass/blur:** `--ios-blur: none` — the design system uses flat surfaces.
  Bonus: avoids `backdrop-filter` creating *containing blocks* for `position: fixed`.
- **Flat backgrounds:** no decorative gradients.
- **Motion:** `--dur-fast` 120ms / `--dur-base` 200ms with `--ease-standard`
  `cubic-bezier(.2,0,0,1)`. Hover = darken + slight elevation; no bounce.
  `prefers-reduced-motion` is respected in `theme.css`.
- **Focus:** `box-shadow: var(--focus-ring)` (3px red ring) on `:focus-visible`.

## 5. Rules for writing new CSS

1. Never introduce fixed hex/rgba values — use tokens or the `--status-*` pairs.
2. Don't recreate `html[data-theme="dark"]` overrides for colors: the tokens already change.
3. Buttons: primary uses `--accent` and darkens on hover; `.secondary` inverts to a solid fill.
4. Labels/eyebrows/table headers in `--font-mono` with `--tracking-eyebrow`.
5. Emoji are not UI elements; `→`, `·` and `//` are the only decorative glyphs.
