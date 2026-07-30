# Tema — Critical Software Design System

A interface do **My Organizer (CSW.AI.OS)** segue o *Critical Software Design System*
(pasta de origem: `critical-software-design-system-652547b1-93ba-462e-82fc-9f8e8b78ea78`).
Este documento é a referência única do tema; qualquer CSS novo deve usar os tokens abaixo
em vez de valores fixos.

> A estética iOS anterior foi substituída. Os nomes de variáveis `--ios-*` **mantêm-se**
> como aliases (para não partir o CSS existente), mas apontam agora para tokens da marca.

---

## 1. Onde vive o tema

- [static/css/theme.css](static/css/theme.css) — `@font-face` da Aptos, tokens de marca,
  aliases legacy, tema claro/escuro e a classe utilitária `.eyebrow`.
- `static/fonts/*.ttf` — Aptos, Aptos SemiBold, Aptos Narrow Bold, Aptos Mono
  (servidos por `/static/fonts/...`; `cswaios/server.py` mapeia `.ttf`).
- Os restantes `static/css/*.css` consomem apenas variáveis.

## 2. Cor

| Token | Valor | Uso |
| :-- | :-- | :-- |
| `--csw-red-600` | `#C00000` | **Critical Red** — acento primário (botões, links, `//`, destaques) |
| `--csw-red-700` | `#8E0407` | hover/pressed |
| `--csw-red-900` | `#63090D` | maroon profundo (superfícies escuras de marca) |
| `--csw-sand-400` | `#ECA682` | warm sand — acento secundário, usado com parcimónia |
| `--ink-950 … --ink-50`, `--white` | rampa neutra | texto, superfícies, bordas |
| `--green-600` / `--amber-600` / `--blue-600` | semânticos | estado positivo / atenção / informação |

Aliases aplicacionais: `--bg`, `--surface`, `--text`, `--muted`, `--border`, `--accent`,
`--accent-hover`, `--accent-soft`, `--focus-ring`.

**Vermelho/verde como texto:** usar `--accent-text` e `--ok-text` (nunca `--accent`
ou `--ios-red`/`--ios-green`) sempre que a cor for aplicada em `color:`. No tema
escuro estes tokens são tons mais claros (`#e08b8b` / `#6fd39a`), porque o
vermelho de marca sobre preto perde legibilidade. `--accent` continua a ser a cor
certa para fundos, bordas e realces.

**Estados** (usar sempre estes pares, já resolvidos para claro/escuro):
`--status-done-bg/-fg`, `--status-doing-bg/-fg`, `--status-blocked-bg/-fg`,
`--status-info-bg/-fg`.

Regra do utilizador mantém-se: feedback positivo em verde (`--ios-green` → `--green-600`),
falha em vermelho (`--ios-red` → `--csw-red-600`).

## 3. Tipografia

- `--font-sans` → **Aptos** (corpo e UI).
- `--font-display` → **Aptos Narrow** (h1/h2/h3, números grandes).
- `--font-mono` → **Aptos Mono** (eyebrows `// LABEL`, cabeçalhos de tabela,
  labels de campos, títulos de coluna do Kanban).
- Títulos em *sentence case*, tracking `-0.01em`.
- Motivo da marca: classe `.eyebrow` (mono, maiúsculas, `letter-spacing: .14em`,
  prefixo `// ` automático). Usada no cabeçalho da app.

## 4. Forma, sombra e movimento

- **Cantos nítidos:** cartões `--ios-radius-card` = 12px; botões/campos
  `--ios-radius-btn` = 4px; pílulas 999px só em chips/badges.
- **Bordas:** hairline 1px (`--border`).
- **Sombras neutras** (sem brilhos coloridos): `--ios-shadow` (repouso) e
  `--ios-shadow-lg` (overlays, elementos flutuantes, hover de cartões).
- **Sem vidro/blur:** `--ios-blur: none` — o design system usa superfícies planas.
  Bónus: evita que `backdrop-filter` crie *containing blocks* para `position: fixed`.
- **Fundos planos:** sem gradientes decorativos.
- **Movimento:** `--dur-fast` 120ms / `--dur-base` 200ms com `--ease-standard`
  `cubic-bezier(.2,0,0,1)`. Hover = escurecer + pequena elevação; sem bounce.
  `prefers-reduced-motion` é respeitado em `theme.css`.
- **Foco:** `box-shadow: var(--focus-ring)` (anel vermelho de 3px) em `:focus-visible`.

## 5. Regras ao escrever CSS novo

1. Nunca introduzir hex/rgba fixos — usar tokens ou os pares `--status-*`.
2. Não recriar overrides `html[data-theme="dark"]` para cores: os tokens já mudam.
3. Botões: primário usa `--accent` e escurece no hover; `.secondary` inverte para tinta sólida.
4. Labels/eyebrows/cabeçalhos de tabela em `--font-mono` com `--tracking-eyebrow`.
5. Emoji não são elementos de UI; `→`, `·` e `//` são os únicos glifos decorativos.
