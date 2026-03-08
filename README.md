# Liquidator

> 长桥一键清仓工具 — 本地安全运行，支持 Web 与 Mac 原生应用
>
> One-click position liquidation tool for Longbridge — local-only, secure. Runs as a web app or native Mac app.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Security](https://img.shields.io/badge/security-local%20only-success.svg)
![Tauri](https://img.shields.io/badge/mac%20app-Tauri%20v2-blue.svg)

---

## 🚀 Live Demo

**Online Demo:** https://lp-liquidator.echan.work

> ⚠️ This is a demo version — Demo Mode only (mock data). No real trading. The online version is a static deployment with no backend server.

## 🚀 在线演示

**在线演示地址：** https://lp-liquidator.echan.work

> ⚠️ 此为演示版本，仅支持 Demo Mode（模拟数据），无真实交易功能。线上为纯静态部署，无后端服务器。

---

## ⚠️ 免责声明 / Disclaimer

**本工具仅供学习交流，投资有风险，操作需谨慎。**

**This tool is for educational and research purposes only. Trading involves risk; proceed with caution.**

---

## 功能特性 / Features

- 🔒 **本地运行 / Local-only** — API 凭证仅存储在浏览器 localStorage，服务仅监听 127.0.0.1
- 🎨 **精美界面 / Modern UI** — Geist 字体，深色/浅色主题，响应式设计
- 🌐 **多语言 / i18n** — 简体中文 · 繁體中文 · English
- ⚡ **选择性清仓 / Selective Liquidate** — 勾选持仓，支持全部/1/2/1/3/1/4 比例卖出
- 🛡️ **条件卖出 / Conditional Sell** — 批量设置止盈、止损、追踪止损条件单
- 📊 **实时持仓 / Live Positions** — 实时行情报价，多币种显示（USD / HKD / SGD）
- 🔄 **一键刷新 / Refresh** — 持仓页面支持刷新按钮，快速更新数据
- 💾 **凭证记忆 / Credential Persistence** — API 凭证自动保存，刷新页面无需重新输入
- ✅ **安全确认 / Safe Confirm** — 多重确认弹窗防止误操作
- 🧪 **演示模式 / Demo Mode** — 无需真实账户即可体验界面
- 🖥️ **Mac 原生应用 / Mac App** — 基于 Tauri v2 封装，双击即用，无需开终端

## 技术栈 / Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js + Express |
| Frontend | Vanilla HTML / CSS / JS |
| Mac App | [Tauri v2](https://tauri.app/) (Rust + WKWebView) |
| Trading | [Longbridge OpenAPI Node.js SDK](https://www.npmjs.com/package/longport) |
| Icons | [Lucide](https://lucide.dev/) |
| Security | localhost-only, no external data transfer |

---

## 运行方式 / How to Run

### 方式一：Mac 原生应用（推荐）/ Option 1: Mac App (Recommended)

双击打开，无需终端，服务器自动启动。/ Double-click to open — no terminal needed, server starts automatically.

**前置要求 / Prerequisites:**

- [Node.js](https://nodejs.org/) v18+
- [Rust](https://rustup.rs/) (首次需要安装 / required for first build)

```bash
# Install Rust (one-time)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

**构建 / Build:**

```bash
git clone https://github.com/therealechan/longbridge-liquidator-web.git
cd longbridge-liquidator-web

npm install
npx tauri build
```

构建完成后，`.app` 文件位于：/ The `.app` and `.dmg` will be at:

```
src-tauri/target/release/bundle/macos/Liquidator.app
src-tauri/target/release/bundle/dmg/Liquidator_1.0.0_aarch64.dmg
```

> 首次构建 Rust 依赖需要 2–3 分钟，后续增量构建很快。
> First build takes 2–3 min (Rust compiling deps). Incremental builds are fast after that.

**开发模式 / Dev mode:**

```bash
# Terminal 1
npm run dev

# Terminal 2
npx tauri dev
```

---

### 方式二：Web 模式 / Option 2: Web Mode

```bash
git clone https://github.com/therealechan/longbridge-liquidator-web.git
cd longbridge-liquidator-web

npm install
npm start
```

服务运行在 `http://127.0.0.1:3456`（仅本地可访问）

The server runs at `http://127.0.0.1:3456` (localhost only).

**本地开发 / Local Development:**

```bash
npm run dev   # auto-restart on file changes
```

---

## API 配置 / API Configuration

使用 Live Mode 需要三个凭证：

| 凭证 / Credential | 说明 / Description |
|---|---|
| App Key | 应用标识 / Application identifier |
| App Secret | 应用密钥 / Application secret |
| Access Token | 访问令牌 / Access token for API authentication |

**获取方式 / How to obtain:**

1. 登录 [长桥开发者中心](https://open.longportapp.com/) / Login to Longbridge Developer Center
2. 进入「用户中心」→「应用凭证」/ Go to "User Center" → "App Credentials"
3. 获取 App Key、App Secret 和 Access Token / Get all three credentials

> 📖 详细文档 / Docs: https://open.longportapp.com/docs

---

## 使用说明 / Usage

1. 在界面中输入长桥 API 凭证（App Key / App Secret / Access Token）
2. 点击「查看持仓」查看当前所有持仓
3. 勾选需要操作的标的（默认全选）
4. 点击「一键清仓」以市价单卖出选中持仓
5. 点击「条件卖出」批量设置止盈/止损/追踪止损条件单

---

1. Enter your Longbridge API credentials (App Key / App Secret / Access Token)
2. Click "View Positions" to see current holdings
3. Select positions to operate on (all selected by default)
4. Click "Liquidate" to sell selected positions at market price
5. Click "Conditional Sell" to batch set take-profit / stop-loss / trailing stop orders

---

## 安全说明 / Security

- ✅ API 密钥保存在浏览器 localStorage，仅限本机访问
- ✅ 服务仅监听 `127.0.0.1`，外部无法访问
- ✅ Mac App 内嵌服务器，无网络暴露
- ✅ 开源代码，可自行审计
- ✅ 支持模拟模式测试

---

## License

[MIT](LICENSE) © [Ed](https://github.com/therealechan)
