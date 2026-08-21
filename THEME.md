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
- `--font-mono` → **Aptos Mono** (code, reports, file names — content that is
  genuinely monospaced).
- `--font-label` → the face of the UPPERCASE labels (eyebrows `// LABEL`, table
  headers, field labels, Kanban column titles). Defaults to `--font-mono`; the
  Modern skin repoints it to `--font-sans` (see §6). Kept apart from `--font-mono`
  precisely so a skin can change the labels without touching code blocks.
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
  (The Modern skin turns it on and leans into it — see §6, *The glass*.)
- **Flat backgrounds:** no decorative gradients.
- **Motion:** `--dur-fast` 120ms / `--dur-base` 200ms with `--ease-standard`
  `cubic-bezier(.2,0,0,1)`. Hover = darken + slight elevation; no bounce.
  `prefers-reduced-motion` is respected in `theme.css`.
- **Focus:** `box-shadow: var(--focus-ring)` (3px red ring) on `:focus-visible`.

## 5. Rules for writing new CSS

1. Never introduce fixed hex/rgba values — use tokens or the `--status-*` pairs.
2. Don't recreate `html[data-theme="dark"]` overrides for colors: the tokens already change.
   The same holds for `html[data-skin="modern"]` — write to the tokens, not to the skin.
3. Buttons: primary uses `--accent` and darkens on hover; `.secondary` inverts to a solid fill.
4. Labels/eyebrows/table headers in `--font-label` with `--tracking-eyebrow`
   and `text-transform: uppercase` (that trio is what marks a label as a label).
5. Emoji are not UI elements; `→`, `·` and `//` are the only decorative glyphs.

---

## 6. Modern skin (Apple / HIG appearance)

Besides the brand theme, Settings offers **Modern light** and **Modern dark** — an
Apple-flavoured appearance for whoever prefers it. It is a *skin*, not a second theme:

- `<html>` carries **two** attributes: `data-theme` (`light`/`dark`, unchanged) and
  `data-skin` (`csw` by default, or `modern`). Splitting them means every existing
  light/dark rule — here, in `code.css` and in `forms.css` — keeps working untouched.
- The stored preference (`bsp-tracker-theme` in `localStorage`) holds both: `auto`,
  `light`, `dark`, `modern-light`, `modern-dark`. The `modern-` prefix sets the skin,
  the rest sets light/dark. Resolved in [index.html](index.html) before the first paint
  and again in `applyTheme()` ([static/js/settings.js](static/js/settings.js)).
- The skin **only swaps tokens** — there is no component CSS of its own beyond the
  `.eyebrow` and `::selection` touch-ups. What it changes:

| Token group | Brand (`csw`) | Modern |
| :-- | :-- | :-- |
| Accent | Critical Red `#C00000` | system blue `#007AFF` / `#0A84FF` |
| `--font-sans` / `--font-display` | Aptos / Aptos Narrow | `-apple-system`, SF Pro, Segoe UI |
| `--font-label` | `--font-mono` (Aptos Mono) | `--font-sans` |
| Corners | card 12px, button 4px | card 16px, button 12px |
| `--ios-blur` | `none` | `blur(28px) saturate(200%)` — frosted glass is back on |
| Neutral ramp `--ink-*` | brand ink | Apple system grays |
| Motion | 120/200ms, `cubic-bezier(.2,0,0,1)` | 150/280ms, `cubic-bezier(.32,.72,0,1)` |
| Status / `--coltag-*` | brand semantics | system green/orange/red/blue, purple/teal/indigo |

Red keeps its iOS meaning in this skin: it marks what destroys, not the brand.

### The glass

Blur alone doesn't read as glass — a translucent panel over a flat gray page still
looks like a flat panel. The skin therefore adds three things, all in `theme.css`:

1. **A wash behind everything** — three soft radial blobs (`--wash-1/2/3`) painted on
   `body` under `var(--bg)` with `background-attachment: fixed`. This is the only
   place the skin breaks §4's "no decorative gradients": it is what the glass refracts.
2. **Translucent panels** — `--glass-fill` (a top-to-bottom translucent gradient) plus
   `backdrop-filter: var(--ios-blur)` on the cards and popovers that used to be opaque
   `--surface`. The selector list sits inside `:where()` **on purpose**: `:where()`
   contributes zero specificity, so every existing `:hover` / `.selected` / `.active`
   rule still outranks it. Only the resting look changes.
3. **A light edge** — `--glass-sheen` (`inset 0 1px 0`) is folded into `--ios-shadow`
   and `--ios-shadow-lg`, so everything already using those tokens gets the highlight
   on its top edge for free.

Overlays (`.helpOverlay`, `.noteSideBack`) blur the app behind them with the shorter
`--ios-blur-scrim` instead of only dimming it.

**What is deliberately left opaque:** `#notesView` / `#codeView` in full screen, the
`.notesHead` and the `.noteFrameBar`. They are ancestors of the notes toolbar menus,
which are `position: fixed` — a `backdrop-filter` on them would anchor those menus to
the panel instead of the viewport (the same trap the caveat below describes). `--surface`
itself also stays opaque: fields, selects and table rows sit *on* the glass, and stacking
translucency on translucency turns the text muddy.

**Caveat to keep in mind:** with `--ios-blur` active, `backdrop-filter` makes
`.ios-top` and `.tabs` into *containing blocks* — a `position: fixed` element placed
**inside** either bar would anchor to the bar instead of the viewport. Nothing does
today (every menu and panel is a child of `body`), so the skin is safe as it stands;
it is the reason the brand theme keeps blur off (§4), and the thing to re-check
before nesting a fixed element in one of those bars.
