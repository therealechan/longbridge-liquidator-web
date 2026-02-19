# Liquidator Web

长桥一键清仓工具 - 本地安全运行的 Web 界面

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Security](https://img.shields.io/badge/security-local%20only-success.svg)

## 特性

- 🔒 **本地运行** - API 密钥仅存储在内存中，不上传任何服务器
- 🎨 **精美界面** - 深色主题，现代化设计
- ⚡ **一键清仓** - 市价单快速卖出所有持仓
- 📊 **实时持仓** - 查看当前持仓和总市值
- ✅ **安全确认** - 多重确认防止误操作

## 安装

```bash
# 克隆仓库
git clone <repository-url>
cd liquidator-web

# 安装依赖
npm install

# 安装 Python 依赖（长桥 SDK）
pip install longport
```

## 使用

### 1. 启动服务

```bash
npm start
```

服务将运行在 `http://127.0.0.1:3456`（仅本地可访问）

### 2. 配置 API 密钥

在网页中输入你的长桥 API 密钥：
- **App Key**: 你的 App Key
- **App Secret**: 你的 App Secret
- **Access Token**: 可选，如需行情权限

### 3. 查看持仓

点击「查看持仓」按钮，显示当前所有持仓股票

### 4. 一键清仓

勾选确认框，点击「一键清仓」按钮，使用市价单卖出所有股票

## 安全说明

- ✅ API 密钥仅保存在浏览器内存和本地 Python 进程中
- ✅ 服务仅监听 localhost，外部无法访问
- ✅ 开源代码，可审计
- ✅ 支持模拟模式测试

## 模拟模式

如需测试界面而不实际交易：

```bash
MOCK_MODE=true npm start
```

## 技术栈

- **Backend**: Node.js + Express
- **Frontend**: Vanilla HTML/CSS/JS
- **Trading**: Python + Longport SDK
- **Security**: 本地-only，无外部传输

## License

MIT License
