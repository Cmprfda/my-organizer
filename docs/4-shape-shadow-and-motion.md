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