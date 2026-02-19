const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3456;

app.use(express.json());
app.use(express.static('public'));

// 存储临时的 API 配置（内存中，重启后消失）
let tempConfig = null;

// 获取持仓列表
app.post('/api/positions', (req, res) => {
  const { appKey, appSecret, accessToken } = req.body;
  
  if (!appKey || !appSecret) {
    return res.status(400).json({ error: '缺少 API 密钥' });
  }

  // 运行 Python 脚本获取持仓
  const env = {
    ...process.env,
    LONGBRIDGE_APP_KEY: appKey,
    LONGBRIDGE_APP_SECRET: appSecret,
    LONGBRIDGE_ACCESS_TOKEN: accessToken || ''
  };

  const scriptPath = path.join(__dirname, 'liquidate.py');
  const python = spawn('python3', [scriptPath, '--json'], { env });

  let output = '';
  let errorOutput = '';

  python.stdout.on('data', (data) => {
    output += data.toString();
  });

  python.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  python.on('close', (code) => {
    if (code !== 0) {
      console.error('Python error:', errorOutput);
      return res.status(500).json({ 
        error: '获取持仓失败', 
        details: errorOutput 
      });
    }
    
    try {
      // 解析 Python 脚本的 JSON 输出
      const lines = output.trim().split('\n');
      const jsonLine = lines.find(l => l.startsWith('JSON_OUTPUT:'));
      if (jsonLine) {
        const data = JSON.parse(jsonLine.replace('JSON_OUTPUT:', ''));
        return res.json(data);
      }
      res.json({ positions: [], totalValue: 0 });
    } catch (e) {
      res.status(500).json({ error: '解析数据失败', details: e.message });
    }
  });
});

// 执行清仓
app.post('/api/liquidate', (req, res) => {
  const { appKey, appSecret, accessToken, positions } = req.body;
  
  if (!appKey || !appSecret) {
    return res.status(400).json({ error: '缺少 API 密钥' });
  }

  const env = {
    ...process.env,
    LONGBRIDGE_APP_KEY: appKey,
    LONGBRIDGE_APP_SECRET: appSecret,
    LONGBRIDGE_ACCESS_TOKEN: accessToken || ''
  };

  const scriptPath = path.join(__dirname, 'liquidate.py');
  const args = ['--execute', '--json'];
  if (positions) args.push('--symbols', positions.join(','));
  
  const python = spawn('python3', [scriptPath, ...args], { env });

  let output = '';
  let errorOutput = '';

  python.stdout.on('data', (data) => {
    output += data.toString();
  });

  python.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  python.on('close', (code) => {
    try {
      const lines = output.trim().split('\n');
      const jsonLine = lines.find(l => l.startsWith('JSON_OUTPUT:'));
      if (jsonLine) {
        const data = JSON.parse(jsonLine.replace('JSON_OUTPUT:', ''));
        return res.json(data);
      }
      res.json({ success: true, message: '清仓完成' });
    } catch (e) {
      res.status(500).json({ 
        error: '清仓执行失败', 
        details: errorOutput || e.message 
      });
    }
  });
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', local: true });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Liquidator Web 运行在 http://127.0.0.1:${PORT}`);
  console.log('   仅在本地可访问，确保安全');
});
