# Design Guideline

A comprehensive UI/UX design system extracted from Liquidator. Use this as a reference when building new projects with the same visual language.

---

## 1. Design Philosophy

- **Vercel-inspired minimalism** — Clean, spacious, monochrome-first with intentional color accents
- **Dark-first** — Default to dark mode; light mode is the alternate
- **Single-column centered layout** — Max-width 640px, generous vertical padding
- **Progressive disclosure** — Show only what's needed; use modals and accordions for secondary content
- **Motion with purpose** — Subtle spring animations that reinforce interactions, never decorative
- **Accessibility-aware** — Respects `prefers-reduced-motion`, uses semantic HTML, ARIA labels on icon-only buttons

---

## 2. Color System

All colors are defined as CSS custom properties on `:root` (light) and `.dark` (dark).

### Light Mode (`:root`)

| Token | Value | Usage |
|---|---|---|
| `--background` | `#ffffff` | Page background |
| `--surface` | `#f4f4f5` | Card backgrounds, elevated surfaces |
| `--surface-hover` | `#e4e4e7` | Surface hover state |
| `--border` | `#e4e4e7` | Borders, dividers |
| `--foreground` | `#18181b` | Primary text |
| `--foreground-secondary` | `#3f3f46` | Secondary text, card titles |
| `--muted` | `#71717a` | Tertiary text, labels |
| `--muted-foreground` | `#a1a1aa` | Disabled text, footnotes |
| `--accent` | `#18181b` | Primary button background (black) |
| `--accent-foreground` | `#fafafa` | Primary button text (white) |
| `--danger` | `#dc2626` | Destructive actions, errors |
| `--danger-hover` | `#b91c1c` | Danger hover state |
| `--success` | `#16a34a` | Positive actions, confirmations |

### Dark Mode (`.dark`)

| Token | Value | Usage |
|---|---|---|
| `--background` | `#0a0a0a` | Page background |
| `--surface` | `#171717` | Card backgrounds |
| `--surface-hover` | `#262626` | Surface hover state |
| `--border` | `#262626` | Borders, dividers |
| `--foreground` | `#ededed` | Primary text |
| `--foreground-secondary` | `#d4d4d4` | Secondary text |
| `--muted` | `#737373` | Tertiary text |
| `--muted-foreground` | `#a3a3a3` | Disabled text |
| `--accent` | `#fafafa` | Primary button background (white) |
| `--accent-foreground` | `#171717` | Primary button text (black) |

### Semantic Color Usage

- **Danger (red)** — Destructive/irreversible actions: sell, liquidate, delete, errors
- **Success (green)** — Positive actions: buy, confirm, completion states
- **Amber `#f59e0b`** — Warning states: live mode toggle, caution dialogs
- **Accent (black/white flip)** — Neutral primary actions: submit, view, navigate

---

## 3. Typography

### Font Stack

```css
/* Sans — body, UI, headings */
font-family: 'Geist Sans', -apple-system, BlinkMacSystemFont, sans-serif;

/* Mono — data, prices, symbols, form inputs */
font-family: 'Geist Mono', monospace;
```

Load via CDN (weights 400, 500, 600, 700 for Sans; 400, 500, 600 for Mono).

### Scale

| Element | Size | Weight | Tracking |
|---|---|---|---|
| Page title (h1) | 36px | 600 | -0.03em |
| Card title | 13px | 600 | 0.05em (uppercase) |
| Modal title | 16px | 600 | — |
| Body text | 14–15px | 400 | — |
| Label | 13px | 500 | — |
| Badge / small | 12px | 400 | — |
| Footnote | 11px | 400 | — |
| Data (mono) | 14px | 600 | — |
| Total value (mono) | 18px | 600 | — |

### Rules

- `line-height: 1.6` globally; `1.7–1.8` for long-form text (FAQ answers)
- Headings use negative letter-spacing (`-0.02em` to `-0.03em`)
- Card titles are always UPPERCASE with wide tracking (`0.05em`)
- Financial data, symbols, and form inputs always use Geist Mono

---

## 4. Spacing & Layout

### Container

```css
.container {
  max-width: 640px;
  margin: 0 auto;
  padding: 60px 24px 40px;
}
```

### Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius` | `6px` | Cards, buttons, inputs, modals |
| `--radius-sm` | `4px` | Small elements |
| `100px` | — | Badges (pill shape) |
| `50%` | — | Circles (toggle knob, status dot) |

### Spacing Pattern

- Card internal padding: `28px`
- Card margin-bottom: `20px`
- Card header padding-bottom: `14px` (with border-bottom)
- Form group margin-bottom: `16px`
- Section gap (hero → content): `40–48px`
- Footer margin-top: `60px`
- Modal max-width: `400px`

---

## 5. Components

### 5.1 Card

```
┌─────────────────────────────────┐
│ [icon]  CARD TITLE              │  ← card-header (border-bottom)
│─────────────────────────────────│
│                                 │
│  Content area                   │  ← 28px padding
│                                 │
│  [Primary Action Button]        │
└─────────────────────────────────┘
```

- Background: `var(--surface)`
- Border: `1px solid var(--border)`
- Hover: border transitions to `var(--muted)`
- Header icon: 18px, `color: var(--muted)`

### 5.2 Buttons

**Primary** — Full-width, accent bg/fg flip
```css
padding: 10px 20px;
border-radius: var(--radius);
font-size: 14px; font-weight: 500;
```

**Danger** — Full-width, red bg, white text, `font-weight: 600`, `padding: 14px`
- Hover: `box-shadow: 0 4px 14px rgba(220, 38, 38, 0.25)`

**Secondary** — Outlined, used in modal action pairs
```css
background: var(--background);
border: 1px solid var(--border);
```

**Ghost/Outline** — Transparent bg, border only (conditional order button)

**All buttons share:**
- Hover: `opacity: 0.9; transform: translateY(-1px)`
- Active: `transform: translateY(0) scale(0.98)`
- Icon inside button scales to `1.15` on hover
- Loading state: `pointer-events: none; opacity: 0.8` + spinner

### 5.3 Form Inputs

```css
background: var(--background);  /* recessed into page */
border: 1px solid var(--border);
border-radius: var(--radius);
padding: 10px 14px;
font-size: 14px;
font-family: 'Geist Mono', monospace;
```
- Focus: `border-color: var(--foreground)`, no outline
- Sensitive fields use `type="password"`

### 5.4 Data Table

```
┌──┬────────┬─────┬───────┬────────┬──────────┐
│☑ │ Symbol │ Qty │ Price │ Change │    Value │  ← th: 11px uppercase
├──┼────────┼─────┼───────┼────────┼──────────┤
│☑ │AAPL.US │ 100 │185.50 │ +1.25% │$18550.00│  ← td: 14px
│☑ │TSLA.US │  50 │242.30 │ -2.49% │$12115.00│
└──┴────────┴─────┴───────┴────────┴──────────┘
```

- Wrapped in `.table-container` with `border` and `border-radius` (overflow hidden)
- Header: `11px`, uppercase, wide tracking, `color: var(--muted)`, `background: var(--background)`
- Row hover: `background: var(--surface-hover)`
- Last row: no bottom border
- Checkbox column: fixed 36px width
- Symbol column: Geist Mono, `font-weight: 600`
- Numeric columns: Geist Mono
- Change column: colored green (positive) or red (negative)

### 5.5 Modal

```
┌─ Overlay (rgba black + backdrop blur) ──────┐
│                                              │
│   ┌─ Modal Card ──────────────────────┐      │
│   │ [icon] Title                      │      │
│   │ ┌─ Warning Banner ─────────────┐  │      │
│   │ │ ⓘ Warning message            │  │      │
│   │ └──────────────────────────────┘  │      │
│   │ [Ratio Selector: All|1/2|1/3|1/4]│      │
│   │ Position list (scrollable)        │      │
│   │ ─────────────────────────────     │      │
│   │ Total              $XX,XXX.XX     │      │
│   │ [Cancel]  [Confirm Action]        │      │
│   └───────────────────────────────────┘      │
│                                              │
└──────────────────────────────────────────────┘
```

- Overlay: `rgba(0,0,0,0.6)` + `backdrop-filter: blur(4px)`
- Card: `var(--surface)` bg, `28px` padding, `max-width: 400px`
- Title color matches action type: red (sell), green (buy), amber (warning), foreground (neutral)
- Warning banner: semi-transparent colored background with matching border
- Action buttons: always a pair — secondary (cancel) + colored (confirm)
- Click overlay to dismiss; `event.stopPropagation()` on card

### 5.6 Badge (Pill)

```css
padding: 6px 12px;
border-radius: 100px;
font-size: 12px;
background: var(--surface);
border: 1px solid var(--border);
color: var(--muted);
```
- Status dot: 6px circle, `var(--success)`, pulsing animation

### 5.7 Toggle Switch

- Container: `34px × 18px`, `border-radius: 9px`
- Knob: `14px` circle, slides `16px` right when active
- Off state: `var(--border)` track, `var(--muted)` knob
- On state: `rgba(22, 163, 74, 0.2)` track, `var(--success)` knob
- Spring easing on knob: `cubic-bezier(0.34, 1.56, 0.64, 1)`

### 5.8 FAQ Accordion

- Items separated by `border-bottom: 1px solid var(--border)`
- Question: full-width button, `14px`, `font-weight: 500`, chevron icon right-aligned
- Answer: `max-height: 0` → `max-height: 300px` transition
- Chevron rotates 180° when open

### 5.9 Alert

- Success: green-tinted background + border
- Warning: amber-tinted background + border (text color flips in dark mode)
- Appears with `fadeSlideIn` animation

### 5.10 Ratio Selector

A row of equal-width buttons for selecting fractions (All, 1/2, 1/3, 1/4).

```css
display: flex; gap: 6px;
/* Each button */
flex: 1; padding: 6px 0;
border: 1px solid var(--border);
border-radius: 6px;
font-size: 13px; font-weight: 500;
```
- Active state color matches context: red (sell), green (buy), accent (neutral)

---

## 6. Animation & Motion

Powered by **Motion.js** (Framer Motion standalone, loaded from CDN).

### Easing

| Name | Value | Usage |
|---|---|---|
| Spring | `[0.34, 1.56, 0.64, 1]` | Modals, toggles, icon morphs — bouncy overshoot |
| Ease-out | `ease-out` | Fade-ins, overlays |
| Ease-in | `ease-in` | Fade-outs, exits |
| Linear | `linear` | Spinners |

### Patterns

| Animation | Properties | Duration |
|---|---|---|
| Modal enter | `scale: 0.92→1, opacity: 0→1, y: 16→0` | 0.45s spring |
| Modal exit | `scale: 1→0.95, opacity: 1→0, y: 0→8` | 0.18s ease-in |
| Overlay enter | `background: transparent → rgba(0,0,0,0.6)` | 0.3s ease-out |
| Theme icon out | `rotate: 0→90, scale: 1→0, opacity: 1→0` | 0.25s ease-in |
| Theme icon in | `rotate: -90→0, scale: 0→1, opacity: 0→1` | 0.4s spring |
| SVG path draw | `strokeDashoffset: length → 0` | 0.6s spring, staggered 0.12s |
| Logo breathing | `opacity: 0.85 → 1 → 0.85` | 4s infinite |
| Button hover | `translateY(-1px)` | CSS 0.2s |
| Button active | `translateY(0) scale(0.98)` | CSS 0.2s |
| Content appear | `opacity: 0→1, translateY(12px→0)` | CSS 0.4s (fadeSlideIn) |
| Spinner | Dual-ring counter-rotate | 0.8s / 1.2s linear infinite |
| Status dot pulse | `opacity: 1 → 0.5 → 1` | 2s infinite |

### Reduced Motion

All custom animations are gated behind:
```js
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```
CSS fallback:
```css
@media (prefers-reduced-motion: reduce) {
  /* Disable all path draws, breathing, icon morphs, modal springs */
}
```

---

## 7. Icons

**Lucide Icons** — loaded from unpkg CDN, rendered via `lucide.createIcons()`.

- Size: `14–18px` inline with text/buttons
- Color: inherits from parent (`currentColor`)
- Common icons used: `key`, `bar-chart-3`, `trending-up`, `zap`, `shopping-cart`, `shield`, `alert-triangle`, `alert-circle`, `info`, `check`, `refresh-cw`, `sun`, `moon`, `help-circle`, `chevron-down`

---

## 8. Scrollbar

Custom WebKit scrollbar:
```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--background); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--muted); }
```

---

## 9. Interaction Patterns

- **Hover lift** — Buttons lift 1px on hover, press down on active
- **Border highlight** — Cards and inputs highlight border on hover/focus
- **Icon scale** — Button icons scale to 1.15 on hover
- **Brand hover** — Logo rotates 12° and scales 1.08
- **Overlay dismiss** — Click outside modal to close
- **Confirmation flow** — Destructive actions always require a modal confirmation with explicit button pair
- **Loading state** — Button becomes non-interactive with spinner replacing icon
- **State persistence** — Theme, language, mode, and credentials persist in localStorage

---

## 10. Footer

```
[Logo SVG]  Brand Name

© 2026 Built by Author · Open source on GitHub
Disclaimer text
```

- Logo SVG has path-draw animation on load + subtle breathing loop
- Links use animated underline on hover (background-size trick)
- Disclaimer: `11px`, `var(--muted-foreground)`

---

## Quick Start for New Projects

1. Copy the CSS custom properties (Section 2) into your stylesheet
2. Load Geist Sans + Geist Mono fonts from CDN
3. Load Lucide icons from CDN
4. Load Motion.js from CDN (optional, for spring animations)
5. Use the `.container` → `.card` → `.card-header` + content pattern for page sections
6. Apply `.btn-primary` / `.btn-danger` / `.btn-secondary` for actions
7. Use `.modal-overlay` + `.modal-card` for confirmations
8. Gate all JS animations behind `prefers-reduced-motion` check
