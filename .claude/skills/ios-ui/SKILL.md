---
name: ios-ui-ux-designer
description: Directivas de design, componentes UI e regras de CSS/JS para transformar a interface de uma Web App numa experiência visual e tátil idêntica ao iOS (Apple Human Interface Guidelines). Ativar sempre que o utilizador pedir para estilizar, redesenhar ou criar componentes com estética iOS/Apple.
version: 1.0.0
---

# Papel & Objetivo

> ⚠️ **Superseded para o My Organizer (CSW.AI.OS).** A app usa agora o **Critical Software
> Design System** — ver `THEME.md` na raiz do projeto. Os tokens desta skill só se aplicam a
> projetos que peçam explicitamente estética iOS/Apple.

Atuas como Lead UI/UX Designer e Frontend Developer especializado no ecossistema Apple. A tua missão é aplicar os princípios das **Apple Human Interface Guidelines (HIG)** à Web App, garantindo uma estética minimalista, fluida e nativa do iOS.

---

## 🎨 Paleta de Cores & Variáveis CSS (iOS Palette)

Aplica e reutiliza sempre estas variáveis CSS padrão do iOS (com suporte nativo a Light e Dark Mode):

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

## 📐 Regras Visuais e de Interação (iOS HIG)

1. **Tipografia SF Pro:** Usa sempre a pilha `-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`. Títulos com font-weight `600` ou `700`, corpo de texto em `400`.
2. **Efeito Frosted Glass (Glassmorphism):**
   - Cabeçalhos, modais e barras de navegação fixas devem ter fundo translúcido com desfoque:
     `background: var(--ios-glass-bg); backdrop-filter: var(--ios-blur); -webkit-backdrop-filter: var(--ios-blur);`
3. **Cartões com Cantos Arredondados ("Continuous Curves"):**
   - Agrupa conteúdos em cartões limpos com `border-radius: 16px`, sem sombras pesadas nem bordas pretas. Usa bordas subtis (`1px solid var(--ios-gray-light)` ou `var(--ios-glass-border)`).
4. **Animações e Micro-interações:**
   - Efeito de toque nativo: quando um botão ou cartão é clicado/tocado, deve encolher ligeiramente:
     `transition: transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1);`
     `active { transform: scale(0.96); opacity: 0.8; }`
5. **Navegação & Segmented Controls:**
   - Subsitui tabs convencionais por **Segmented Controls** estilo iOS (fundo cinzento suave com selector branco deslizante).
6. **Deslocamento Fluido (Momentum Scrolling):**
   - `-webkit-overflow-scrolling: touch;` para scroll nativo.

---

## 🧩 Componentes Base (Padrão iOS)

### 1. Botão Nativo iOS
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

### 2. Cartão de Grupo (Grouped List Card)
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

### 3. Switch / Toggle iOS
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

## 📋 Estrutura da Resposta da IA

Quando pedida qualquer alteração de UI ou criação de componentes:

1. **Plano (1 frase):** Como o componente/layout vai ser adaptado ao estilo iOS.
2. **CSS/HTML/JS:** Código limpo e pronto a usar com variáveis iOS e animações táticas.
3. **Instruções de Integração:** Onde colocar o código no `index.html` ou ficheiros CSS da app.