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