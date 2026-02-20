const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3456;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── Longbridge SDK (lazy-loaded) ──
let Config, TradeContext;
let sdkAvailable = false;

try {
  const lb = require('longport');
  Config = lb.Config;
  TradeContext = lb.TradeContext;
  sdkAvailable = true;
} catch (e) {
  console.warn('⚠️  longport SDK not installed. Run: npm install');
  console.warn('   Live mode will fall back to Python script if available.');
}

// ── Helper: create Longbridge config from request body ──
function createConfig(body) {
  // Accept both naming conventions from frontend
  const appKey = body.app_key || body.appKey;
  const appSecret = body.app_secret || body.appSecret;
  const accessToken = body.access_token || body.accessToken || '';

  if (!appKey || !appSecret) {
    throw new Error('Missing API credentials (app_key / app_secret)');
  }

  return new Config({
    appKey,
    appSecret,
    accessToken,
  });
}

// ── GET /api/health ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', local: true, sdk: sdkAvailable });
});

// ── POST /api/positions ──
app.post('/api/positions', async (req, res) => {
  if (!sdkAvailable) {
    return res.status(503).json({
      error: 'longport SDK not installed. Run: npm install',
    });
  }

  try {
    const config = createConfig(req.body);
    const ctx = await TradeContext.new(config);
    const resp = await ctx.stockPositions();

    // Flatten channel positions into a single array
    const positions = [];
    for (const channel of resp) {
      for (const pos of channel.positions || []) {
        positions.push({
          symbol: pos.symbol,
          quantity: Number(pos.quantity),
          market_price: Number(pos.costPrice || 0),
        });
      }
    }

    const totalValue = positions.reduce(
      (sum, p) => sum + p.quantity * p.market_price,
      0
    );

    res.json({ positions, totalValue });
  } catch (err) {
    console.error('positions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/liquidate ──
app.post('/api/liquidate', async (req, res) => {
  if (!sdkAvailable) {
    return res.status(503).json({
      error: 'longport SDK not installed. Run: npm install',
    });
  }

  try {
    const config = createConfig(req.body);
    const ctx = await TradeContext.new(config);

    const symbols = req.body.positions || [];
    const results = [];

    for (const symbol of symbols) {
      try {
        const order = await ctx.submitOrder({
          symbol,
          orderType: 'MO',
          side: 'Sell',
          submittedQuantity: 0, // server will resolve from position
          timeInForce: 'Day',
        });
        results.push({
          symbol,
          success: true,
          orderId: String(order.orderId),
        });
      } catch (e) {
        results.push({ symbol, success: false, error: e.message });
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error('liquidate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ──
app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Liquidator running at http://127.0.0.1:${PORT}`);
  console.log(`   SDK: ${sdkAvailable ? '✅ longport' : '❌ not found'}`);
  console.log('   Local only — safe & secure');
});
