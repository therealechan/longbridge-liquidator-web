# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LB Liquidator: a localhost-only one-click position liquidation tool for Longbridge Securities, shipped as a Tauri 2 macOS app (and runnable in a plain browser). Users configure API credentials in Settings, view stock positions, and execute market sell/buy and conditional orders. The Express API binds to `127.0.0.1:3456` only — no external data transfer.

## Commands

- `npm start` — Run production server (Express on port 3456); open http://127.0.0.1:3456 for browser mode
- `npm run dev` — Run with nodemon auto-reload
- `npm run tauri:dev` — Run the native app (starts `npm start` via `beforeDevCommand`, loads `devUrl` http://localhost:3456)
- `npm run tauri:build` — Build the `.app` / `.dmg` (runs `scripts/prepare-server.js` first)
- `npm test` — Run API smoke tests (Node.js built-in test runner)

## Architecture

**Vanilla full-stack app** — no TypeScript, no bundler, no frontend framework. Docs: `README.md`, `DESIGN_GUIDELINE.md` (design system).

- **Backend:** `src/server.js` — Express server with 8 endpoints:
  - `GET /api/health` — Health check (`{status, local, sdk, version}`)
  - `POST /api/positions` — Fetch positions via Longbridge Node.js SDK (`longport` package). Items include `symbol_name`, `available_quantity`, `cost_price`, `currency`
  - `POST /api/liquidate` — Execute market sell orders
  - `POST /api/buyback` — Execute market buy orders
  - `POST /api/conditional-order` — Submit conditional sell orders (stop-loss, take-profit, trailing stop)
  - `POST /api/intraday` — Intraday minute line + `prevClose` for one symbol (`{symbol, prevClose, lines:[{t, price, volume, avgPrice}]}`)
  - `POST /api/candles` — Candlesticks for one symbol; `period` `day|week|month` (default `day`), `count` 1..500 (default 60)
  - `POST /api/quotes` — Batch quotes (`symbols` array, ≤50): `last`, `prevClose`, `open`, `high`, `low`, `volume`, `turnover`, `t`, `tradeStatus`
  - Longbridge `TradeContext` / `QuoteContext` are cached per credentials as promises (concurrent requests share one connection; a rejected connect clears its own slot; any route error calls `invalidateCache()`)
  - Server binds to `127.0.0.1` only (not `0.0.0.0`). CORS uses an origin allowlist (`tauri://localhost`, `http(s)://tauri.localhost`, `http://localhost:3456`, `http://127.0.0.1:3456`) — never a wildcard. Express also serves `public/` statically for browser mode.

- **Frontend:** `public/index.html` is a ~530-line shell (markup only, no inline CSS/JS apart from the pre-paint theme script). Everything else lives in `public/assets/`:
  - `css/` — `tokens.css` (all colours/sizes), `base.css`, `shell.css` (grid regions), `components.css`, `views.css`
  - `js/` — plain scripts (no modules) that share one `window.LB` namespace: `i18n`, `format`, `state`, `api`, `tauri`, `toast`, `modals`, `shell`, `chart` (canvas renderer + Demo data), `quotes` (`LB.market` data cache + `LB.quotes` polling), `shortcuts`, `main`; `js/views/` holds `chart-card.js` (details-panel chart), `positions.js`, `orders.js`, `settings.js`
  - `vendor/` — Geist / Geist Mono fonts and Lucide (`lucide.min.js`). No CDNs, no Motion.js.
  - **Load order is fixed** (see the `<script>` tags at the bottom of `index.html`): lucide, `i18n`, `format`, `state`, `api`, `tauri`, `toast`, `modals`, `shell`, `chart`, `quotes`, `views/chart-card`, `views/positions`, `views/orders`, `views/settings`, `shortcuts`, `main`. A new script must be added there, after its dependencies.

- **Tauri shell:** `src-tauri/` — the UI ships inside the app bundle (`frontendDist: ../public`, origin `tauri://localhost`); the Node server runs as a sidecar and only serves `/api/*` to it. `titleBarStyle: Overlay` with hidden title, traffic lights at (13,13), so the top 44px of each region is a `data-tauri-drag-region`. Plugins: updater, dialog, opener, window-state. Permissions are in `src-tauri/capabilities/default.json`.

## Key Patterns

- **Layout** — fixed 100vh grid, nothing scrolls at page level: 52px rail (Positions / Orders / Settings; theme + account at bottom), 280px sidebar (Demo|Live control, totals, filter, position list), 44px tab bar (Liquidate / Conditional / Buy back), main view, 300px details panel, 26px status bar. Settings (Account / Appearance / Language / About) and Orders (history) are views too. See `DESIGN_GUIDELINE.md` for sizes and tokens.
- **Namespace** — `window.LB`: `state`, `bus` (tiny event emitter), `storage`, `creds()`, `snapshot`, `history`, `api`, `tauri`, `t`/`i18n`, `fmt`, `toast`, `modals`, `shell`, `render`, `dispatchAction`, `positions`, `orders`, `settings`, plus market data: `chart` (canvas renderer, Demo data), `market` (cached intraday / candles), `quotes` (polling) and `chartCard` (details-panel card). Views expose `init()` and are called from `main.js`.
- **Actions** — buttons use `data-action="..."`; one delegated click listener in `shell.js` calls `LB.dispatchAction(action)`. Shell actions (views, sidebar/details toggles, theme, shortcuts) are handled there, the rest are emitted on `LB.bus` as `action`.
- **API credentials** are entered in Settings → Account and persisted in localStorage (`lb_appKey`, `lb_appSecret`, `lb_accessToken`); localhost/app only
- **Demo/Live mode** — Demo uses mock data (default ON), Live hits the real Longbridge API. Persisted as `demoMode`
- **i18n** — `public/assets/js/i18n.js`: one dictionary per language (`zh-CN`, `zh-TW`, `en`), `LB.t(key, vars)` with `{name}` placeholders, and attributes `data-i18n`, `data-i18n-placeholder`, `data-i18n-title`, `data-i18n-tip`. Add every new string to all three languages. Preference in localStorage `lang`
- **Theme** — `theme` = `system` (default) | `light` | `dark`. `system` removes `data-theme` from `<html>` and follows `prefers-color-scheme`. A tiny inline script in `<head>` applies a saved light/dark choice before first paint
- **State** — `LB.state` (view, tab, demoMode, theme, positions, selected, active, filter, ratios, server, ...). localStorage keys: `lb_view`, `lb_sidebarOpen`, `lb_detailsOpen`, `lb_orderHistory` (capped at 500), `lb_chartRange` (`today|1m|3m|1y`), `lb_liveQuotes` (`true` default / `false`), `lastLiquidatedPositions` (buy-back snapshot), plus those above
- **Tauri bridge** — `LB.tauri` (`js/tauri.js`) wraps `window.__TAURI__` and no-ops outside Tauri. The native menu emits a `menu` event whose payload is an action id (`settings`, `refresh`, `toggle_sidebar`, `toggle_details`, `shortcuts`, `view_positions`, `view_orders`, `about`); `main.js` forwards it to `LB.dispatchAction`. Rust also emits `server-error`. To add a menu item: add it in `lib.rs`, add its id to `FRONTEND_MENU_ACTIONS`, handle the id in `dispatchAction`
- **API base** — `api.js` uses same-origin when served over http(s) (browser mode) and `http://127.0.0.1:3456` when loaded from `tauri://`
- **Keyboard** — `shortcuts.js` (⌘R refresh, ⌘A select all, ⌘↩ confirm, ⌘, settings, ⌘B sidebar, ⌘D details, ⌘/ shortcuts, ⌘1/2/3 views, ⌘F filter, Esc). The native menu accelerators and these handlers go through the same actions
- **CSP constraints** (`tauri.conf.json`): `script-src 'self'` — no inline event handlers (`onclick=`), no `eval`, no CDN scripts; the single inline theme script in `index.html` is the only exception and must stay tiny. Fonts/images must be local (`font-src 'self' data:`). New API origins need `connect-src` and a CORS allowlist entry
- **Native feel** — no page scroll, `user-select: none` on chrome (selectable only for data), `cursor: default`, focus rings via `:focus-visible` only, honour `prefers-reduced-motion`. Don't add colours outside `tokens.css`
- **Market data** — `LB.quotes` (`js/quotes.js`) runs only while the Positions view is open with positions loaded, Settings → Real-time quotes is on, and (Live) the server is up with credentials. Cadence constants sit at the top of `quotes.js`: `POLL_MS` = 5 s (`/api/quotes`, exposed as `LB.quotes.POLL_MS`), `INTRADAY_MS` = 30 s (active symbol's line), `SPARK_MS` = 60 s (sidebar sparklines), `MAX_BACKOFF_MS` = 60 s. Demo mode never calls the API: `LB.chart` synthesises deterministic intraday / candle data and each tick nudges the mock prices ±0.3%. Polling pauses while the window is hidden or a modal is open (`LB.modals.isOpen()`) and stops with the view; failures double the interval up to the cap and toast once per streak; stale responses are dropped via a generation counter. `LB.market` caches intraday (60 s TTL) and candles (5 min TTL) and shares in-flight requests. Data availability follows the account's Longbridge market-data permissions (HK real-time needs LV2, otherwise delayed)
- **Tests** — `test/server.test.js` asserts `index.html` contains the string `Liquidator` (the `<title>` / brand); keep it there
- **Icons** — Lucide, vendored; use `<i data-lucide="name">` and call `LB.icons()` after injecting HTML

## Dependencies (production only)

`express`, `longport` (Longbridge SDK). Frontend assets (Geist fonts, Lucide) are vendored in `public/assets/vendor/`; no runtime CDN requests.
