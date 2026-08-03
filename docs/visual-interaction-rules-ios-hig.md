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