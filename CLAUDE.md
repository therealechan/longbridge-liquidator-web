# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A localhost-only one-click position liquidation tool for Longbridge Securities. Users configure API credentials in the UI, view stock positions, and execute market sell orders. Runs entirely on `127.0.0.1:3456` for security — no external data transfer.

## Commands

- `npm start` — Run production server (Express on port 3456)
- `npm run dev` — Run with nodemon auto-reload

No test, lint, or build scripts are configured.

## Architecture

**Vanilla full-stack app** — no TypeScript, no bundler, no frontend framework.

- **Backend:** `src/server.js` — Express server with 3 endpoints:
  - `GET /api/health` — Health check
  - `POST /api/positions` — Fetch positions via Longbridge Node.js SDK (`longport` package)
  - `POST /api/liquidate` — Execute market sell orders
  - Server binds to `127.0.0.1` only (not `0.0.0.0`)

- **Frontend:** `public/index.html` — Monolithic single-page app (~1600 lines) containing inline CSS, JS, and i18n translations. No external JS/CSS files.

- **Legacy:** `src/liquidate.py` — Unused Python script from before the Node.js SDK migration.

## Key Patterns

- **API credentials** are entered via UI, never stored on disk or in env vars
- **Demo/Live mode toggle** — Demo mode uses mock data, Live mode hits real Longbridge API
- **i18n** — Custom implementation using `data-i18n` attributes and a `t()` function. Three languages: `zh-CN`, `zh-TW`, `en`. Preference stored in localStorage
- **Theme** — Dark/light toggle with Motion.js animations, stored in localStorage
- **State** — Global JS variables (`currentPositions`, `selectedSymbols`, `isDemoMode`, `currentLang`), persisted via localStorage
- **Animations** — Motion.js (Framer Motion) loaded from CDN, used for modals, theme toggle, logo SVG path drawing
- **Icons** — Lucide icons from unpkg CDN

## Dependencies (production only)

`express`, `cors`, `longport` (Longbridge SDK), `ws`
