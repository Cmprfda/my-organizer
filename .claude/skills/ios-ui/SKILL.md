---
name: ios-ui-ux-designer
description: Design directives, UI components and CSS/JS rules for turning a Web App's interface into a visual and tactile experience identical to iOS (Apple Human Interface Guidelines). Activate whenever the user asks to style, redesign or create components with iOS/Apple aesthetics.
version: 1.0.0
---

# Role & Goal

> ⚠️ **Superseded for My Organizer (CSW.AI.OS).** The app now uses the **Critical Software
> Design System** — see `THEME.md` at the project root. This skill's tokens only apply to
> projects that explicitly ask for an iOS/Apple aesthetic.

You act as Lead UI/UX Designer and Frontend Developer specialized in the Apple ecosystem. Your mission is to apply the **Apple Human Interface Guidelines (HIG)** principles to the Web App, ensuring a minimalist, fluid, native-feeling iOS aesthetic.

---

## 🎨 Color Palette & CSS Variables (iOS Palette)

Always apply and reuse these standard iOS CSS variables (with native Light and Dark Mode support):

```css
:root {
  /* Dynamic Backgrounds */
  --ios-bg-primary: #f2f2f7;
  --ios-bg-secondary: #ffffff;
  --ios-bg-grouped: #f2f2f7;
  
  /* Glassmorphism / Frosted Glass */
  --ios-glass-bg: rgba(255, 255, 255, 0.75);
  --ios-glass-border: rgba(255, 255, 255, 0.3);
  --ios-blur: blur(20px) saturate(180%);

  /* System Colors */
  --ios-blue: #007aff;
  --ios-green: #34c759;
  --ios-red: #ff3b30;
  --ios-orange: #ff9500;
  --ios-gray: #8e8e93;
  --ios-gray-light: #e5e5ea;

  /* Typography */
  --ios-text-primary: #000000;
  --ios-text-secondary: #3c3c4399;
  --ios-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", sans-serif;

  /* Corners & Shadows */
  --ios-radius-card: 16px;
  --ios-radius-btn: 12px;
  --ios-radius-pill: 999px;
  --ios-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

@media (prefers-color-scheme: dark) {
  :root {
    --ios-bg-primary: #000000;
    --ios-bg-secondary: #1c1c1e;
    --ios-bg-grouped: #000000;
    --ios-glass-bg: rgba(30, 30, 30, 0.75);
    --ios-glass-border: rgba(255, 255, 255, 0.1);
    --ios-text-primary: #ffffff;
    --ios-text-secondary: #ebebf599;
    --ios-gray-light: #2c2c2e;
    --ios-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  }
}
```

---

## 📐 Visual & Interaction Rules (iOS HIG)

1. **SF Pro Typography:** Always use the `-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif` stack. Titles with font-weight `600` or `700`, body text at `400`.
2. **Frosted Glass Effect (Glassmorphism):**
   - Headers, modals and fixed navigation bars should have a translucent, blurred background:
     `background: var(--ios-glass-bg); backdrop-filter: var(--ios-blur); -webkit-backdrop-filter: var(--ios-blur);`
3. **Rounded-Corner Cards ("Continuous Curves"):**
   - Group content in clean cards with `border-radius: 16px`, no heavy shadows or black borders. Use subtle borders (`1px solid var(--ios-gray-light)` or `var(--ios-glass-border)`).
4. **Animations & Micro-interactions:**
   - Native tap effect: when a button or card is clicked/tapped, it should shrink slightly:
     `transition: transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1);`
     `active { transform: scale(0.96); opacity: 0.8; }`
5. **Navigation & Segmented Controls:**
   - Replace conventional tabs with iOS-style **Segmented Controls** (soft gray background with a sliding white selector).
6. **Momentum Scrolling:**
   - `-webkit-overflow-scrolling: touch;` for native scrolling.

---

## 🧩 Base Components (iOS Pattern)

### 1. Native iOS Button
```css
.ios-button {
  background-color: var(--ios-blue);
  color: #ffffff;
  font-family: var(--ios-font);
  font-size: 16px;
  font-weight: 600;
  padding: 12px 20px;
  border-radius: var(--ios-radius-btn);
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, opacity 0.15s ease;
  user-select: none;
}

.ios-button:active {
  transform: scale(0.96);
  opacity: 0.85;
}
```

### 2. Grouped List Card
```css
.ios-card {
  background: var(--ios-bg-secondary);
  border-radius: var(--ios-radius-card);
  padding: 16px;
  box-shadow: var(--ios-shadow);
  border: 1px solid var(--ios-gray-light);
  margin-bottom: 16px;
}
```

### 3. iOS Switch / Toggle
```html
<label class="ios-switch">
  <input type="checkbox">
  <span class="ios-slider"></span>
</label>
```
```css
.ios-switch {
  position: relative;
  display: inline-block;
  width: 51px;
  height: 31px;
}

.ios-switch input { opacity: 0; width: 0; height: 0; }

.ios-slider {
  position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
  background-color: var(--ios-gray-light);
  transition: .3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 31px;
}

.ios-slider:before {
  position: absolute; content: ""; height: 27px; width: 27px; left: 2px; bottom: 2px;
  background-color: white;
  transition: .3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 50%;
  box-shadow: 0 3px 8px rgba(0,0,0,0.15);
}

input:checked + .ios-slider { background-color: var(--ios-green); }
input:checked + .ios-slider:before { transform: translateX(20px); }
```

---

## 📋 AI Response Structure

When asked for any UI change or component creation:

1. **Plan (1 sentence):** How the component/layout will be adapted to the iOS style.
2. **CSS/HTML/JS:** Clean, ready-to-use code with iOS variables and tactile animations.
3. **Integration Instructions:** Where to place the code in `index.html` or the app's CSS files.
