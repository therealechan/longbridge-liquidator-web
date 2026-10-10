# Changelog

All notable changes to LB Liquidator are documented here.

## [1.1.0] — 2026-10-10

### Changes
- **Native app shell** — full UI refactor into a fixed-window desktop layout: icon rail, positions sidebar, Liquidate / Conditional / Buy back tabs, details panel and status bar. Nothing scrolls at page level; `index.html` is now a ~530-line shell with CSS and JS split into `public/assets/`
- **Orders view** — new order history (Sell / Buy / Conditional) with detail panel, stored locally
- **Settings view** — Account, Appearance, Language and About sections (hero, FAQ and footer moved into About); credentials entry moved here, with a connection test
- **Keyboard shortcuts** — ⌘R refresh, ⌘A select all, ⌘↩ confirm, ⌘, settings, ⌘B sidebar, ⌘D details, ⌘/ shortcuts, ⌘1/2/3 views, ⌘F filter, arrow keys and Space in lists
- **Bundled assets** — Geist, Geist Mono and Lucide are vendored; no CDN requests, Motion.js removed. UI now ships inside the Tauri bundle (`tauri://localhost`); Express serves the API with a CORS origin allowlist
- **System theme** — follows macOS appearance by default; System / Light / Dark choice in Settings and on the rail
- **Tauri overlay title bar + menus** — transparent title bar with drag regions, native menu (Settings, View, Help → Keyboard Shortcuts, GitHub) wired to the UI, window size and position remembered, links open in the default browser
- **API** — `/api/health` returns `version`; `/api/positions` items gain `symbol_name`, `available_quantity`, `cost_price` and `currency`

### Download
[LB Liquidator v1.1.0](https://github.com/therealechan/longbridge-liquidator-web/releases/tag/v1.1.0)

## [1.0.13] — 2026-03-08

### Changes
- <!-- describe what changed -->

### Download
[LB Liquidator v1.0.13](https://github.com/therealechan/longbridge-liquidator-web/releases/tag/v1.0.13)

## [1.0.12] — 2026-03-08

### Changes
- <!-- describe what changed -->

### Download
[LB Liquidator v1.0.12](https://github.com/therealechan/longbridge-liquidator-web/releases/tag/v1.0.12)

## [1.0.11] — 2026-03-08

### Changes
- <!-- describe what changed -->

### Download
[LB Liquidator v1.0.11](https://github.com/therealechan/longbridge-liquidator-web/releases/tag/v1.0.11)

## [1.0.10] — 2026-03-08

### Changes
- <!-- describe what changed -->

### Download
[LB Liquidator v1.0.10](https://github.com/therealechan/longbridge-liquidator-web/releases/tag/v1.0.10)

## [1.0.9] — 2026-03-08

### Changes
- <!-- describe what changed -->

### Download
[LB Liquidator v1.0.9](https://github.com/therealechan/longbridge-liquidator-web/releases/tag/v1.0.9)

## [1.0.8] — 2026-03-08

### Changes
- <!-- describe what changed -->

### Download
[LB Liquidator v1.0.8](https://github.com/therealechan/longbridge-liquidator-web/releases/tag/v1.0.8)

## [1.0.7] — 2026-03-08

### Changes
- <!-- describe what changed -->

### Download
[LB Liquidator v1.0.7](https://github.com/therealechan/longbridge-liquidator-web/releases/tag/v1.0.7)

## [1.0.6] — 2026-03-08

### Changes
- <!-- describe what changed -->

### Download
[LB Liquidator v1.0.6](https://github.com/therealechan/longbridge-liquidator-web/releases/tag/v1.0.6)

## [1.0.5] — 2026-03-08

### Changes
- <!-- describe what changed -->

### Download
[LB Liquidator v1.0.5](https://github.com/therealechan/longbridge-liquidator-web/releases/tag/v1.0.5)

## [1.0.4] — 2026-03-08

### Changes
- <!-- describe what changed -->

### Download
[LB Liquidator v1.0.4](https://github.com/therealechan/longbridge-liquidator-web/releases/tag/v1.0.4)

## [1.0.0] — Initial Release

- Mac native app via Tauri v2 (no terminal needed, double-click to launch)
- Auto-updater via Sparkle (checks on launch + manual via menu)
- B&W app icon and splash screen
- Selective liquidation with ratio selector (full / ½ / ⅓ / ¼)
- Conditional sell — batch stop-loss, take-profit, trailing stop
- Live positions with real-time quotes and daily P/L
- Multi-language support: 简体中文 · 繁體中文 · English
- Demo mode for UI preview without a real account
