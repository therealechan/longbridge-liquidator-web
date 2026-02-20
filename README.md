# Liquidator

> 长桥一键清仓工具 — 本地安全运行的 Web 界面
>
> One-click position liquidation tool for Longbridge — local-only, secure web UI

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Security](https://img.shields.io/badge/security-local%20only-success.svg)

---

## ⚠️ 免责声明 / Disclaimer

**本工具仅供学习交流，投资有风险，操作需谨慎。**

**This tool is for educational and research purposes only. Trading involves risk; proceed with caution.**

---

## 功能特性 / Features

- 🔒 **本地运行 / Local-only** — API 密钥仅存储在内存中，不上传任何服务器
- 🎨 **精美界面 / Modern UI** — 深色/浅色主题，响应式设计
- 🌐 **多语言 / i18n** — 简体中文 · 繁體中文 · English
- ⚡ **一键清仓 / One-click Liquidate** — 市价单快速卖出所有持仓
- 📊 **实时持仓 / Live Positions** — 查看当前持仓和总市值
- ✅ **安全确认 / Safe Confirm** — 多重确认弹窗防止误操作
- 🧪 **演示模式 / Demo Mode** — 无需真实账户即可体验界面

## 技术栈 / Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Frontend | Vanilla HTML / CSS / JS |
| Trading | Python + [Longbridge OpenAPI SDK](https://open.longportapp.com/) |
| Icons | [Lucide](https://lucide.dev/) |
| Security | localhost-only, no external data transfer |

## 快速开始 / Quick Start

```bash
# 克隆仓库 / Clone
git clone https://github.com/therealechan/longbridge-liquidator-web.git
cd longbridge-liquidator-web

# 安装依赖 / Install
npm install
pip install longport

# 启动 / Start
npm start
```

服务运行在 `http://127.0.0.1:3456`（仅本地可访问）

The server runs at `http://127.0.0.1:3456` (localhost only).

### 演示模式 / Demo Mode

```bash
MOCK_MODE=true npm start
```

## 使用说明 / Usage

1. 在网页中输入长桥 API 密钥（App Key / App Secret）
2. 点击「查看持仓」查看当前所有持仓
3. 确认后点击「一键清仓」以市价单卖出全部持仓

---

1. Enter your Longbridge API credentials (App Key / App Secret)
2. Click "View Positions" to see current holdings
3. Confirm and click "Liquidate All" to sell everything at market price

## 安全说明 / Security

- ✅ API 密钥仅保存在浏览器内存和本地进程中
- ✅ 服务仅监听 `127.0.0.1`，外部无法访问
- ✅ 开源代码，可自行审计
- ✅ 支持模拟模式测试

## License

[MIT](LICENSE) © [0xechan](https://0xechan.xyz)
