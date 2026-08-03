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