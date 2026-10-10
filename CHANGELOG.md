# Changelog

All notable changes to LB Liquidator are documented here.

## [1.2.1] — 2026-10-10

### Changes
- **Orders view** — the details panel starts collapsed and only opens when the selected order's symbol is still held; no more empty "No position selected" panel
- **Updater** — a release that is still publishing now shows "Update Server Busy — try again in a few minutes" instead of a misleading network error
- **Release pipeline** — releases are created as drafts and published only after every asset (including `latest.json`) is uploaded, closing the window where an update check could 404
- **Screenshots** — all product screenshots retaken with the 1.2 UI; landing page refreshed

### Download
[LB Liquidator v1.2.1](https://github.com/therealechan/longbridge-liquidator-web/releases/tag/v1.2.1)

## [1.2.0] — 2026-10-10

### Changes
- **Updater no longer stalls** — "Install Update" starts the download immediately (no second OK dialog); progress shows in the status bar, then the app stops its local server and restarts itself. Previous versions never restarted, so the new version only appeared after a manual quit
- **Credentials guide** — Settings → Account now explains where to get the App Key, App Secret and Access Token, links to the Longbridge Developer Center, and auth failures (expired token) show a plain-language message
- Updater alerts show the app icon; the app comes to the front after an update restart; site link updated to echan.xyz
- **Real-time chart** — the details panel gains a price chart for the selected position: an intraday line with volume strip and previous-close reference (Today), plus daily / weekly candles (1M, 3M, 1Y). Hover shows a tooltip; the chosen range is remembered
- **Live quote polling** — while the Positions view is open, prices and day change refresh every 5 s (the active symbol's intraday line every 30 s). Polling pauses when the window is hidden or a dialog is open, backs off after failures and toasts once per failure streak. A status-bar indicator shows the state; Demo mode ticks synthetic prices
- **Sidebar sparklines** — each position row shows a 48x16 intraday sparkline (refreshed every 60 s) that gives up space first on narrow sidebars
- **Real-time quotes toggle** — Settings → Account → "Real-time quotes" turns live polling on or off (on by default)
- **New API endpoints** — `POST /api/intraday`, `POST /api/candles` (`period` day / week / month, `count` 1–500) and `POST /api/quotes` (up to 50 symbols)
- **SDK connection cache fix** — Longbridge trade and quote contexts are cached per credentials as promises, so concurrent requests share one connection instead of each opening their own; a failed connect no longer sticks in the cache

### Download
[LB Liquidator v1.2.0](https://github.com/therealechan/longbridge-liquidator-web/releases/tag/v1.2.0)

## [1.1.1] — 2026-10-10

### Changes
- **Unified toolbar** — the top 44px is one strip across the whole window: traffic lights, then the sidebar toggle; column borders start below it. The wordmark and local-mode caption left the corner; "Local Secure Mode" now lives in the status bar
- **Updater alerts show the app icon** — "Update Available", "Updating…" and "No Updates" use a native NSAlert with the app icon instead of the generic caution glyph
- **Node server stops on every quit path** — ⌘Q, the Quit menu item and the close button all shut down the local API server; it previously stayed behind on port 3456 after ⌘Q

### Download
[LB Liquidator v1.1.1](https://github.com/therealechan/longbridge-liquidator-web/releases/tag/v1.1.1)

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
