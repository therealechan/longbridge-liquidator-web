# Design Guideline

Design system for LB Liquidator, a native-feeling macOS desktop app built from a vanilla web UI (Tauri 2 + WKWebView). The source of truth for values is `public/assets/css/tokens.css`; this document explains how they are used. Use it as a reference when building new views or other projects with the same visual language.

---

## 1. Principles

- **Native desktop feel** — It is a Mac app, not a web page. Fixed window layout, no page scroll, system menus and shortcuts, drag-able title area, overlay scrollbars.
- **Dark-first, monochrome** — Designed and reviewed in dark first; light is the equal alternate. The default follows the system appearance. Neutrals do the structure (surface steps, hairline borders).
- **Colour only for semantics** — Red = sell / destructive / error. Green = buy / success / gain. Amber = Live mode, warnings, conditional orders. Everything else is grey, black or white. No decorative colour, gradients or glows.
- **Dense but calm** — 13px base text, 28-30px controls, 1px borders, 6px radii. Information density like Linear or Xcode; whitespace comes from alignment, not padding.
- **Motion with purpose** — 120-180ms opacity/transform for state changes (popovers, modals, toasts, tooltips). Nothing bounces, lifts or loops except spinners and the pending dot.
- **Keyboard-complete** — Every primary action has a shortcut; focus rings show for keyboard users only.
- **Local assets only** — Fonts and icons are vendored; the CSP allows no external script or style hosts.

---

## 2. Layout

`<body class="app">` is a CSS grid filling the window (`100vh`). Nothing at document level scrolls; only inner `.scroller` regions do.

```
┌──────┬───────────┬───────────────────────┬───────────┐
│ rail │  sidebar  │ tab bar (44)          │  details  │
│ 52   │   280     ├───────────────────────┤    300    │
│      │           │ main view             │           │
├──────┴───────────┴───────────────────────┴───────────┤
│ status bar (26)                                      │
└──────────────────────────────────────────────────────┘
```

| Region | Size | Contents |
|---|---|---|
| Rail | `--rail-w` 52px | Positions / Orders / Settings (36px buttons, 20px icons). Bottom: theme cycle button, account button (30px circle with Demo/Live dot) |
| Sidebar | `--sidebar-w` 280px | 44px brand band; per-view pane. Positions: Demo/Live segmented control, per-currency totals, filter input, select-all caption, position list with checkboxes. Orders: type chips + history list. Settings: section nav |
| Tab bar | `--band-h` 44px | Liquidate / Conditional / Buy back tabs (or the view title), refresh, details toggle |
| Main | flexible | Active view. Summary strip, content, sticky action footer |
| Details | `--details-w` 300px | Selected position (price, 2x3 stat grid, include/exclude, recent orders). Toggle with ⌘D |
| Status bar | `--bar-h` 26px | Left: mode + server address. Centre: last updated. Right: version, disclaimer |

- Sidebar and details are collapsible (`body.no-sidebar`, `body.no-details`, remembered in localStorage). The grid column collapses to 0.
- Under 1100px the details panel steps aside and ⌘D shows it as an overlay (`details-peek`). Minimum window 900x600.
- The top 44px of rail, sidebar, tab bar and details sit under the transparent title bar (`titleBarStyle: Overlay`, traffic lights at x13 y13). Keep content in those bands clear of x<70 where the lights are (sidebar band pads 34px left; the tab bar pads 36px when the sidebar is folded).
- Drag regions: `data-tauri-drag-region` on the rail-top, sidebar band, tab bar and details band. Decorative children either carry the attribute or set `pointer-events: none`. Interactive children are real buttons and are not draggable.
- Settings, About content (hero, FAQ, footer) lives in Settings → About; there is no marketing chrome in the shell.

---

## 3. Colour Tokens

Defined in `tokens.css`. `:root` is light; dark applies with `html[data-theme="dark"]`, or when no explicit choice is stored and the OS prefers dark (`:root:not([data-theme="light"])` inside `prefers-color-scheme: dark`). Theme choice is `system` | `light` | `dark`; `system` removes the `data-theme` attribute.

### Core palette

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--background` | `#ffffff` | `#0a0a0a` | Main view, inputs, table bodies |
| `--surface` | `#f4f4f5` | `#171717` | Sidebar, tab bar, details, modals, toasts, menus |
| `--surface-hover` | `#e4e4e7` | `#262626` | Active list row |
| `--surface-2` | `#fafafa` | `#0f0f0f` | Rail and status bar (the recessed chrome) |
| `--surface-3` | `#e4e4e7` | `#262626` | Active segmented/chip fill |
| `--border` | `#e4e4e7` | `#262626` | Region dividers, control borders |
| `--border-soft` | `#f0f0f1` | `#1f1f1f` | Row separators inside lists and tables |
| `--border-strong` | `#d4d4d8` | `#3f3f46` | Outline buttons, hovered inputs, scrollbar thumbs, checkbox border |
| `--foreground` | `#18181b` | `#ededed` | Primary text |
| `--foreground-secondary` | `#3f3f46` | `#d4d4d4` | Secondary text, unselected rows |
| `--muted` | `#71717a` | `#737373` | Labels, captions, icons |
| `--muted-foreground` | `#a1a1aa` | `#a3a3a3` | Hints, placeholders-on-tint |
| `--accent` | `#18181b` | `#fafafa` | Primary button, active indicators, checked boxes |
| `--accent-foreground` | `#fafafa` | `#171717` | Text on `--accent` |

### Overlays (alpha tints for hover and press)

| Token | Light | Dark |
|---|---|---|
| `--overlay-weak` | `rgba(0,0,0,0.025)` | `rgba(255,255,255,0.03)` |
| `--overlay` | `rgba(0,0,0,0.05)` | `rgba(255,255,255,0.05)` |
| `--overlay-strong` | `rgba(0,0,0,0.07)` | `rgba(255,255,255,0.08)` |
| `--skeleton` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.07)` |

### Status (same in both themes)

| Token | Value | Usage |
|---|---|---|
| `--danger` / `--danger-hover` | `#dc2626` / `#b91c1c` | Sell, destructive, errors, negative P/L |
| `--success` / `--success-hover` | `#16a34a` / `#15803d` | Buy, success, positive P/L, server OK |
| `--warning` / `--warning-hover` | `#f59e0b` / `#d97706` | Live mode, conditional orders, caution |
| `--danger-soft`, `--success-soft`, `--warning-soft` | `rgba(...,0.12)` of the above | Badge, note and icon backgrounds |
| `--on-color` | `#ffffff` | Text on danger / success / warning fills |

### Elevation

| Token | Light | Dark |
|---|---|---|
| `--shadow-menu` | `0 0 0 1px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.12)` | `0 0 0 1px rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.5)` |
| `--shadow-modal` | `0 0 0 1px rgba(0,0,0,0.06), 0 24px 64px rgba(0,0,0,0.22)` | `0 0 0 1px rgba(255,255,255,0.07), 0 24px 64px rgba(0,0,0,0.6)` |
| `--scrim` | `rgba(0,0,0,0.28)` | `rgba(0,0,0,0.55)` |

Shadows carry a 1px ring so floating surfaces keep an edge in dark mode. Panels in the shell itself are separated by borders, never shadows.

### Shape, size and motion

| Token | Value |
|---|---|
| `--radius` / `--radius-sm` | 6px / 4px |
| `--control-h` | 28px (inputs, segmented controls, icon buttons) |
| `--button-h` / `--button-lg-h` | 30px / 36px (small buttons are 26px) |
| `--rail-w`, `--sidebar-w`, `--details-w` | 52px, 280px, 300px |
| `--band-h`, `--bar-h` | 44px, 26px |
| `--ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` |

Larger radii in use: popovers, toasts 8px; modals 10px; empty-state icon tile 10px; chips 12px; avatar circles 50%.

### Colour rules

- Sell and Liquidate = `--danger` fill. Buy back = `--success`. Conditional = `--warning`. Neutral actions (submit, test connection) = `--accent`.
- Gains/losses use `.pos` / `.neg` / `.flat` text colours, never backgrounds.
- Selection and active state are neutral: `--surface-hover` fill plus a 2px `--accent` edge. Never a coloured highlight.
- Do not add a literal colour to a stylesheet. If a new one is needed, add a token (both themes) first.

---

## 4. Typography

```css
--font-sans: "Geist", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
             "PingFang SC", "PingFang TC", "Helvetica Neue", sans-serif;
--font-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, Monaco, monospace;
```

Geist and Geist Mono are vendored in `public/assets/vendor/fonts/` (no CDN). The CJK fallbacks (PingFang) cover zh-CN and zh-TW.

Body is 13px / 1.35, antialiased. Use mono for anything numeric or identifying (symbols, prices, quantities, order IDs, timestamps, credentials); `font-variant-numeric: tabular-nums` on every number so columns align.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Hero price (details) | 24px mono | 600 | tracking -0.02em |
| Settings title | 18px | 600 | |
| Symbol in details, About app name | 16px | 600-700 | mono for symbols |
| Modal title, empty-state title, summary totals | 14px | 600 | |
| Body, buttons, tabs, inputs, table cells | 13px | 400-500 | tabs: active 500 |
| Secondary, segmented, chips, help text | 12px | 400-500 | `.help` line-height 1.45 |
| Labels, captions, status bar, table headers | 11px | 500 | Labels/headers uppercase, tracking 0.06em, `--muted` |
| Badges, brand tag, tiny counters | 10px | 600 | uppercase, tracking 0.04-0.06em |

Rules: sentence case for text, uppercase only for 10-11px labels and badges. Max two weights per component. Never go below 10px.

---

## 5. Density and spacing

- Spacing is on a 2/4/6/8/10/12/16/24 px ladder; prefer 8 and 12.
- Region padding: 12px horizontal in the sidebar, 16-24px in main views; modal padding 14-18px.
- Control heights: icon button 28, input/segmented 28 (large input 32), button 30 (small 26, large 36), tab bar 44, table header 30, list caption 30, popover item 28.
- Rows: position and order list rows are min-height 46px; table body rows use 8px vertical padding; modal list rows 7px.
- Borders are 1px; use `--border-soft` between rows and `--border` between regions.
- Prefer a quiet divider over a card. Cards (`.summary`, `.settings-group`, `.table-wrap`) are `--background` on a `--surface` region with a 1px `--border` and `--radius`.

---

## 6. Components

### Rail button
36x36, radius 6, 20px Lucide icon (stroke 1.5), `--muted`. Hover: `--overlay-strong` fill, `--foreground`. Current view: same fill plus a 2px `--accent` bar at the rail's left edge (`left: -8px`). Tooltip appears to the right after 350ms hover (see Tooltip).

### Account button
30px circle, `--overlay` fill, 1px border, with a 9px mode dot at the bottom-right (grey = Demo, `--warning` = Live). Opens a 240px popover above the status bar.

### Segmented control
Height 28, 2px inner padding, `--background` track with 1px border, radius 6; segments radius 4, 12px text, `--muted`. Active: `--surface-3` fill, `--foreground`, weight 500. The Demo|Live control is full width with a status dot per segment; Live active uses `--warning-soft` / `--warning`. Used for quantity ratio (All / 1/2 / 1/3 / 1/4), conditional type, time in force, language and theme.

### Chips
24px, radius 12, 12px text, 1px border, optional 10px count. Active: `--surface-3` fill, `--border-strong`. Used for order filters.

### List rows (positions, orders)
Min-height 46, padding 7x12, transition 80ms. Left: 14px checkbox (positions) or action badge (orders). Main: 13px mono symbol (600) over 11px `--muted` name or meta. Right: 12px mono price with 11px coloured change over 11px mono quantity. Hover `--overlay`; active `--surface-hover` with `inset 2px 0 var(--accent)`. Unchecked rows dim to `--foreground-secondary`. Arrow keys move the active row, Space toggles its checkbox.

### Tables
Wrapped in `.table-wrap` (1px border, radius 6, hidden overflow). Header row 30px, sticky, `--surface`, 11px uppercase `--muted`, no selection. Cells 13px, padding 8x12, `--border-soft` row lines, numbers right-aligned in mono 12px, symbol cells mono 600 with an 11px `--muted` name beneath. Row hover `--overlay-weak` (clickable rows `--overlay`). Footer rows are `--surface` with weight 600 and a top border. Table text is selectable.

### Buttons
Height 30 (sm 26, lg 36), padding 0 12, radius 6, 13px weight 500, gap 6, 15px icons. A keyboard hint renders inline at 11px, 70% opacity.

| Variant | Fill | Text | Use |
|---|---|---|---|
| `btn-primary` | `--accent` | `--accent-foreground` | Neutral primary |
| `btn-danger` | `--danger` | `--on-color` | Sell / liquidate |
| `btn-success` | `--success` | `--on-color` | Buy back |
| `btn-warning` | `--warning` | `--on-color` | Conditional |
| `btn-outline` | transparent, 1px `--border-strong` | `--foreground` | Secondary |
| `btn-ghost` | transparent | `--foreground-secondary` | Tertiary, toolbars |

Hover darkens fills (`*-hover` tokens) or applies `--overlay-strong`. Disabled is opacity 0.45. No lift, scale or shadow on hover. Icon buttons are 28x28, `--muted`, hover `--overlay-strong`.

### Inputs
Height 28 (large 32), padding 0 9, radius 6, 1px `--border`, `--background`, 13px; credentials and numbers use mono 12px. Hover: `--border-strong`. Focus: `--muted` border plus a 3px `--overlay-strong` ring. Invalid (`aria-invalid`): `--danger` border plus 3px `--danger-soft` ring. Icon inputs pad 28px left. Secret fields have an eye reveal button as a trailing 22-28px addon. Field label above: 11px uppercase `--muted`, gap 6; help text 12px `--muted`.

### Checkbox
Custom 14px box in a 16px hit area, radius 3, `--border-strong`. Checked and indeterminate: `--accent` fill with an `--accent-foreground` mark.

### Notes (banners)
12px, padding 9x10, radius 6, 14px icon. Neutral uses `--overlay` and a border; warning / danger / success use the `*-soft` fill and coloured text, no border.

### Badges
18px, radius 4, 10px/600 uppercase. Sell and failed use danger-soft, buy and submitted use success-soft, conditional and live use warning-soft, demo uses neutral overlay.

### Modals
Fixed scrim (`--scrim` with 8px backdrop blur), centred panel max-width 440 (wide 520), radius 10, `--surface`, `--shadow-modal`. Head: 14px/600 title with an 18px icon, tone-coloured for danger / success / warning. Body: 13px, padding 14x18, `--foreground-secondary` text, scrolls internally. Actions: right-aligned, buttons min-width 84, padding 12x18x16. Enter animation 160ms (opacity, scale 0.97 to 1). Esc closes, ⌘↩ confirms. Destructive confirmations list affected symbols with quantity and estimated value and a total.

### Toasts
Bottom-right, above the status bar (12px inset), stacked, max 4. 260-400px wide, `--surface`, radius 8, `--shadow-menu`, a 3px inset bar on the left in the tone colour (success / error / warning, neutral for info). Title 13/600, message 12px `--muted-foreground`, 22px close button. Auto-dismiss after 4s (paused on hover); errors use `role="alert"`. Slide in 180ms from the right.

### Tooltips
Rail buttons use `data-tip` (from `data-i18n-tip`): `--surface` bubble, 1px border, `--shadow-menu`, radius 6, 12px, to the right of the button, 120ms fade with a 350ms hover delay and instant on keyboard focus. Elsewhere use the native `title` attribute (`data-i18n-title`). Tooltips include the shortcut where there is one, e.g. "Positions ⌘1".

### Popover / menu
`--surface`, radius 8, `--shadow-menu`, padding 6. Items 28px, 12-13px, icon 14px in `--muted`, hint right-aligned 11px. Hover `--overlay-strong`. Opens with a 140ms fade and 4px rise. Esc and outside click close it.

### Empty states
Centred column: 40px rounded tile (radius 10, `--overlay`, 1px border, 20px muted icon; error variant uses `--danger-soft`), 14px/600 title, 12px `--muted` description (max 340px), optional single `btn-outline` action. Use the `compact` variant inside lists. Every list and table has one, plus error and loading (skeleton, `--skeleton`) states.

### Status bar
26px, 11px `--muted`, `--surface-2`, three zones (left, centre, right), 7px status dots: grey pending (pulse), green OK, red error, amber Live.

### Kbd
20px min, radius 4, 1px border with a 2px bottom border, 11px sans. Inside buttons it is unstyled text.

---

## 7. Native-feel rules

- **No page scroll.** `html, body { overflow: hidden; overscroll-behavior: none }`. Scroll only inside `.scroller` or `overflow-y: auto` panels, with `overscroll-behavior: contain`.
- **Text selection.** `user-select: none` and `cursor: default` on the whole app (links and buttons are `cursor: default`, as in native apps). Only data is selectable: inputs, table cells, stat values, order details, and `.selectable`. Inputs use the text cursor.
- **Focus.** `:focus { outline: none }` and `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`. Inputs show their own border and ring on focus instead. Mouse clicks never leave a ring.
- **Scrollbars.** 6px thin, transparent until the scroller is hovered, thumb `--border-strong` (then `--muted` on thumb hover), transparent track. The document itself has no scrollbar.
- **Window.** Overlay title bar, hidden title, traffic lights at (13,13). Drag regions as listed in Layout. Window size and position are restored (window-state plugin).
- **Menus.** The native menu mirrors the shortcuts and sends actions to the page; do not build a second in-page menu bar.
- **Drop and navigation.** Dragging a file onto the window must not navigate (the page cancels `dragover` / `drop`).
- **Links** open in the default browser through the Tauri opener (`data-href`), never inside the app window.
- **Reduced motion.** Under `prefers-reduced-motion: reduce` all animations and transitions collapse to ~0ms (a global rule in `base.css`). Do not rely on motion to convey state.
- **Appearance.** Follow the system theme unless the user picked one; `color-scheme` is set so native form controls match.
- **Icons.** Lucide, vendored, 16px default (rail 20, buttons 15, inline 12-14), stroke width 1.5, `currentColor`. Icon-only controls need an `aria-label` (set by `data-i18n-tip` / `data-i18n-title`).

---

## 8. Keyboard shortcuts

| Shortcut | Action |
|---|---|
| ⌘R | Refresh positions |
| ⌘A | Select all positions (outside text fields) |
| ⌘↩ | Confirm the primary action / the open dialog |
| ⌘, | Settings |
| ⌘B | Toggle sidebar |
| ⌘D | Toggle details panel |
| ⌘/ | Keyboard shortcuts sheet |
| ⌘1 / ⌘2 / ⌘3 | Positions / Orders / Settings |
| ⌘F | Focus the position filter |
| ↑ / ↓ | Move the active row (Positions, Orders) |
| Space | Toggle the active position's checkbox |
| Esc | Close popover, then dialog, then details peek; blur a field |

Rules: show the shortcut next to the action it triggers (tooltips, menu hints, button hints). Native menu accelerators and `shortcuts.js` call the same action ids, so a shortcut works in a plain browser too. While a dialog is open only Esc and ⌘↩ apply. Never bind a bare letter key when a field could have focus.

---

## 9. Internationalisation

- Three languages: `zh-CN`, `zh-TW`, `en`. Every user-facing string lives in `public/assets/js/i18n.js`; keep the three blocks in the same key order.
- Static markup uses `data-i18n` (text), `data-i18n-placeholder`, `data-i18n-title` (title + aria-label) and `data-i18n-tip` (rail tooltip). Dynamic strings use `LB.t(key, { name })` with `{name}` placeholders; there is no pluralisation, so write counts as "{n} selected".
- Never concatenate translated fragments into sentences; give the whole sentence a key.
- Layouts must survive both a short (`Demo`) and long (`Good Til Canceled`) label: segmented buttons truncate with an ellipsis, tab labels do not wrap.
- Keep financial terms consistent with the dictionary: 止损 / 止損 (stop loss), 止盈 (take profit), 追踪止损 / 追蹤止損 (trailing stop), 一键清仓 / 一鍵清倉 (liquidate), 一键买入 / 一鍵買入 (buy back).
- Currency amounts use the position's currency prefix (`$`, `HK$`); keep per-currency totals separate, never convert.
- The language preference is stored in localStorage `lang` and applied without reloading (the `lang` bus event re-renders views).

---

## 10. Quick start for a new view

1. Add a pane to the sidebar and a section to the main region in `public/index.html` using existing classes (`.pane`, `.view`, `.table-wrap`, `.empty`).
2. Add rules only to `views.css`, using tokens, never literal colours or sizes.
3. Create `public/assets/js/views/<name>.js` as a plain script on `window.LB`, expose `init()` and a render function, and register it in the load order in `index.html`.
4. Use `data-action` for clicks (no inline handlers); route through `LB.dispatchAction`.
5. Add strings to all three languages, a rail entry, a shortcut and a menu item if it is a top-level view.
6. Check dark, light, 900x600 and the details-peek width (<1100px).
