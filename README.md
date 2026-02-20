# Liquidator

> 长桥一键清仓工具 — 本地安全运行的 Web 界面
>
> One-click position liquidation tool for Longbridge — local-only, secure web UI

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Security](https://img.shields.io/badge/security-local%20only-success.svg)

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

## 技术栈 / Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js + Express |
| Frontend | Vanilla HTML / CSS / JS |
| Trading | [Longbridge OpenAPI Node.js SDK](https://www.npmjs.com/package/longport) |
| Icons | [Lucide](https://lucide.dev/) |
| Security | localhost-only, no external data transfer |

## 快速开始 / Quick Start

```bash
# 克隆仓库 / Clone
git clone https://github.com/therealechan/longbridge-liquidator-web.git
cd longbridge-liquidator-web

# 安装依赖 / Install
npm install

# 启动 / Start
npm start
```

服务运行在 `http://127.0.0.1:3456`（仅本地可访问）

The server runs at `http://127.0.0.1:3456` (localhost only).

### 本地开发 / Local Development

```bash
# 安装依赖（含 longport SDK）
npm install

# 开发模式（自动重启）
npm run dev

# 访问 http://127.0.0.1:3456
```

服务器使用 Node.js 原生 [Longbridge OpenAPI SDK](https://www.npmjs.com/package/longport)，无需额外安装 Python。

The server uses the native Node.js Longbridge SDK — no Python required.

### 演示模式与实盘模式 / Demo Mode & Live Mode

- **Demo Mode（演示模式）**：使用模拟数据，无需 API 凭证，适合体验界面。
- **Live Mode（实盘模式）**：连接真实 Longbridge API，需要本地运行服务器（`npm start` 或 `npm run dev`）。

> ⚠️ Live Mode 需要本地服务器。线上演示（静态部署）没有后端服务器，只能使用 Demo Mode。

- **Demo Mode**: Uses mock data, no API credentials needed. Great for exploring the UI.
- **Live Mode**: Connects to the real Longbridge API. Requires a local server (`npm start` or `npm run dev`).

> ⚠️ Live Mode requires a local server. The online demo (static deployment) has no backend and only supports Demo Mode.

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
3. 获取 App Key、App Secret 和 Access Token / Get all three credentials from the same page

> 📖 详细文档 / Docs: https://open.longportapp.com/docs

## 使用说明 / Usage

1. 在网页中输入长桥 API 凭证（App Key / App Secret / Access Token）
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

## 安全说明 / Security

- ✅ API 密钥保存在浏览器 localStorage，仅限本机访问
- ✅ 服务仅监听 `127.0.0.1`，外部无法访问
- ✅ 开源代码，可自行审计
- ✅ 支持模拟模式测试

## License

[MIT](LICENSE) © [0xechan](https://0xechan.xyz)
