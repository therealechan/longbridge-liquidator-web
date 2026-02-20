const express = require('express');

const app = express();
const PORT = process.env.PORT || 3456;

app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

// ── Longbridge SDK (lazy-loaded) ──
let Config, TradeContext, QuoteContext, OrderType, OrderSide, TimeInForceType, TriggerPriceType, Decimal;
let sdkAvailable = false;

try {
  const lb = require('longport');
  Config = lb.Config;
  TradeContext = lb.TradeContext;
  QuoteContext = lb.QuoteContext;
  OrderType = lb.OrderType;
  OrderSide = lb.OrderSide;
  TimeInForceType = lb.TimeInForceType;
  TriggerPriceType = lb.TriggerPriceType;
  Decimal = lb.Decimal;
  sdkAvailable = true;
} catch (e) {
  console.warn('⚠️  longport SDK not installed. Run: npm install');
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
    enablePrintQuotePackages: false,
    enableOvernight: false,
  });
}

// ── Helper: strip potential credential fragments from error messages ──
function sanitizeError(msg) {
  return String(msg).replace(/[A-Za-z0-9_\-]{20,}/g, '[REDACTED]');
}

// ── Context cache: reuse SDK connections for the same credentials ──
let cachedKey = null;
let cachedTradeCtx = null;
let cachedQuoteCtx = null;

function credentialKey(body) {
  const appKey = body.app_key || body.appKey || '';
  const appSecret = body.app_secret || body.appSecret || '';
  const accessToken = body.access_token || body.accessToken || '';
  return `${appKey}:${appSecret}:${accessToken}`;
}

async function getTradeContext(config, body) {
  const key = credentialKey(body);
  if (cachedTradeCtx && cachedKey === key) return cachedTradeCtx;
  // Credentials changed — drop old cache
  cachedTradeCtx = null;
  cachedQuoteCtx = null;
  cachedKey = key;
  cachedTradeCtx = await TradeContext.new(config);
  return cachedTradeCtx;
}

async function getQuoteContext(config, body) {
  const key = credentialKey(body);
  if (cachedQuoteCtx && cachedKey === key) return cachedQuoteCtx;
  cachedQuoteCtx = await QuoteContext.new(config);
  return cachedQuoteCtx;
}

function invalidateCache() {
  cachedKey = null;
  cachedTradeCtx = null;
  cachedQuoteCtx = null;
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
    const ctx = await getTradeContext(config, req.body);
    const resp = await ctx.stockPositions();

    // Flatten channel positions into a single array
    const positions = [];
    for (const channel of resp.channels || []) {
      for (const pos of channel.positions || []) {
        positions.push({
          symbol: pos.symbol,
          quantity: Number(pos.quantity),
          costPrice: Number(pos.costPrice || 0),
        });
      }
    }

    // Fetch real-time quotes for market prices
    const priceMap = {};
    if (positions.length > 0) {
      try {
        const symbols = [...new Set(positions.map((p) => p.symbol))];
        const quoteCtx = await getQuoteContext(config, req.body);
        const quotes = await quoteCtx.quote(symbols);
        for (const q of quotes) {
          priceMap[q.symbol] = {
            lastDone: Number(q.lastDone),
            prevClose: Number(q.prevClose),
          };
        }
      } catch (quoteErr) {
        console.warn('quote fetch failed, falling back to costPrice:', quoteErr.message);
      }
    }

    // Merge market prices, fall back to costPrice
    const result = positions.map((p) => {
      const quote = priceMap[p.symbol];
      const marketPrice = quote ? quote.lastDone : p.costPrice;
      const prevClose = quote ? quote.prevClose : null;
      return {
        symbol: p.symbol,
        quantity: p.quantity,
        market_price: marketPrice,
        prev_close: prevClose,
      };
    });

    const totalValue = result.reduce(
      (sum, p) => sum + p.quantity * p.market_price,
      0
    );

    res.json({ positions: result, totalValue });
  } catch (err) {
    console.error('positions error:', err.message);
    invalidateCache();
    res.status(500).json({ error: sanitizeError(err.message) });
  }
});

// ── POST /api/liquidate ──
const SYMBOL_RE = /^[A-Za-z0-9]{1,10}\.[A-Z]{2}$/;

app.post('/api/liquidate', async (req, res) => {
  if (!sdkAvailable) {
    return res.status(503).json({
      error: 'longport SDK not installed. Run: npm install',
    });
  }

  // Validate positions array
  const positions = req.body.positions;
  if (!Array.isArray(positions) || positions.length === 0) {
    return res.status(400).json({ error: 'positions must be a non-empty array' });
  }
  for (const pos of positions) {
    if (!pos || typeof pos.symbol !== 'string' || !SYMBOL_RE.test(pos.symbol)) {
      return res.status(400).json({ error: `Invalid symbol: ${String(pos?.symbol).substring(0, 20)}` });
    }
    if (!Number.isInteger(pos.quantity) || pos.quantity <= 0) {
      return res.status(400).json({ error: `Invalid quantity for ${pos.symbol}: must be a positive integer` });
    }
  }

  try {
    const config = createConfig(req.body);
    const ctx = await getTradeContext(config, req.body);

    const results = [];

    for (const pos of positions) {
      try {
        const order = await ctx.submitOrder({
          symbol: pos.symbol,
          orderType: OrderType.MO,
          side: OrderSide.Sell,
          submittedQuantity: new Decimal(String(pos.quantity)),
          timeInForce: TimeInForceType.Day,
        });
        results.push({
          symbol: pos.symbol,
          success: true,
          orderId: String(order.orderId),
        });
      } catch (e) {
        results.push({ symbol: pos.symbol, success: false, error: sanitizeError(e.message) });
      }
    }

    const allSucceeded = results.every(r => r.success);
    res.json({ success: allSucceeded, results });
  } catch (err) {
    console.error('liquidate error:', err.message);
    invalidateCache();
    res.status(500).json({ error: sanitizeError(err.message) });
  }
});

// ── POST /api/buyback ──
app.post('/api/buyback', async (req, res) => {
  if (!sdkAvailable) {
    return res.status(503).json({
      error: 'longport SDK not installed. Run: npm install',
    });
  }

  const positions = req.body.positions;
  if (!Array.isArray(positions) || positions.length === 0) {
    return res.status(400).json({ error: 'positions must be a non-empty array' });
  }
  for (const pos of positions) {
    if (!pos || typeof pos.symbol !== 'string' || !SYMBOL_RE.test(pos.symbol)) {
      return res.status(400).json({ error: `Invalid symbol: ${String(pos?.symbol).substring(0, 20)}` });
    }
    if (!Number.isInteger(pos.quantity) || pos.quantity <= 0) {
      return res.status(400).json({ error: `Invalid quantity for ${pos.symbol}: must be a positive integer` });
    }
  }

  try {
    const config = createConfig(req.body);
    const ctx = await getTradeContext(config, req.body);

    const results = [];

    for (const pos of positions) {
      try {
        const order = await ctx.submitOrder({
          symbol: pos.symbol,
          orderType: OrderType.MO,
          side: OrderSide.Buy,
          submittedQuantity: new Decimal(String(pos.quantity)),
          timeInForce: TimeInForceType.Day,
        });
        results.push({
          symbol: pos.symbol,
          success: true,
          orderId: String(order.orderId),
        });
      } catch (e) {
        results.push({ symbol: pos.symbol, success: false, error: sanitizeError(e.message) });
      }
    }

    const allSucceeded = results.every(r => r.success);
    res.json({ success: allSucceeded, results });
  } catch (err) {
    console.error('buyback error:', err.message);
    invalidateCache();
    res.status(500).json({ error: sanitizeError(err.message) });
  }
});

// ── POST /api/conditional-order ──
const COND_TYPES = new Set(['stop-loss', 'take-profit', 'trailing-stop']);

app.post('/api/conditional-order', async (req, res) => {
  if (!sdkAvailable) {
    return res.status(503).json({
      error: 'longport SDK not installed. Run: npm install',
    });
  }

  const positions = req.body.positions;
  if (!Array.isArray(positions) || positions.length === 0) {
    return res.status(400).json({ error: 'positions must be a non-empty array' });
  }

  const orderConfig = req.body.orderConfig;
  if (!orderConfig || typeof orderConfig !== 'object') {
    return res.status(400).json({ error: 'orderConfig is required' });
  }

  if (!COND_TYPES.has(orderConfig.type)) {
    return res.status(400).json({ error: `Invalid type: must be one of ${[...COND_TYPES].join(', ')}` });
  }

  const pct = Number(orderConfig.percentage);
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
    return res.status(400).json({ error: 'percentage must be between 0 and 100 (exclusive)' });
  }

  for (const pos of positions) {
    if (!pos || typeof pos.symbol !== 'string' || !SYMBOL_RE.test(pos.symbol)) {
      return res.status(400).json({ error: `Invalid symbol: ${String(pos?.symbol).substring(0, 20)}` });
    }
    if (!Number.isInteger(pos.quantity) || pos.quantity <= 0) {
      return res.status(400).json({ error: `Invalid quantity for ${pos.symbol}: must be a positive integer` });
    }
    if (typeof pos.currentPrice !== 'number' || pos.currentPrice <= 0) {
      return res.status(400).json({ error: `Invalid currentPrice for ${pos.symbol}: must be a positive number` });
    }
  }

  const tif = orderConfig.timeInForce === 'GoodTilCanceled'
    ? TimeInForceType.GoodTilCanceled
    : TimeInForceType.Day;

  try {
    const config = createConfig(req.body);
    const ctx = await getTradeContext(config, req.body);

    const results = [];

    for (const pos of positions) {
      try {
        let orderParams;

        if (orderConfig.type === 'trailing-stop') {
          orderParams = {
            symbol: pos.symbol,
            orderType: OrderType.TSMPCT,
            side: OrderSide.Sell,
            submittedQuantity: new Decimal(String(pos.quantity)),
            timeInForce: tif,
            trailingPercent: new Decimal(String(pct)),
          };
        } else {
          const factor = orderConfig.type === 'stop-loss'
            ? (1 - pct / 100)
            : (1 + pct / 100);
          const triggerPrice = +(pos.currentPrice * factor).toFixed(4);

          orderParams = {
            symbol: pos.symbol,
            orderType: OrderType.MIT,
            side: OrderSide.Sell,
            submittedQuantity: new Decimal(String(pos.quantity)),
            timeInForce: tif,
            triggerPrice: new Decimal(String(triggerPrice)),
          };
        }

        const order = await ctx.submitOrder(orderParams);
        results.push({
          symbol: pos.symbol,
          success: true,
          orderId: String(order.orderId),
        });
      } catch (e) {
        results.push({ symbol: pos.symbol, success: false, error: sanitizeError(e.message) });
      }
    }

    const allSucceeded = results.every(r => r.success);
    res.json({ success: allSucceeded, results });
  } catch (err) {
    console.error('conditional-order error:', err.message);
    invalidateCache();
    res.status(500).json({ error: sanitizeError(err.message) });
  }
});

// ── Start ──
if (require.main === module) {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`🚀 Liquidator running at http://127.0.0.1:${PORT}`);
    console.log(`   SDK: ${sdkAvailable ? '✅ longport' : '❌ not found'}`);
    console.log('   Local only — safe & secure');
  });
}

module.exports = app;
