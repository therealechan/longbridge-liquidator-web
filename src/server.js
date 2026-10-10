const path = require('path');
const express = require('express');

let APP_VERSION = '0.0.0';
try {
  APP_VERSION = require('../package.json').version || APP_VERSION;
} catch (_) {
  // package.json not present (e.g. stripped bundle) — keep fallback
}

const app = express();
const PORT = process.env.PORT || 3456;

// ── CORS: the Tauri shell loads the UI from tauri://localhost and calls this
//    API cross-origin. Only allow the app's own origins (no wildcard).
const ALLOWED_ORIGINS = new Set([
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'http://localhost:3456',
  'http://127.0.0.1:3456',
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  res.append('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Longbridge SDK (lazy-loaded) ──
let Config, TradeContext, QuoteContext, OrderType, OrderSide, TimeInForceType, TriggerPriceType, Decimal;
let Period, AdjustType, TradeSessions, TradeStatus;
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
  Period = lb.Period;
  AdjustType = lb.AdjustType;
  TradeSessions = lb.TradeSessions;
  TradeStatus = lb.TradeStatus;
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

// ── Helper: Decimal/string/number → finite number, with fallback ──
function toNumber(value, fallback) {
  if (value === null || value === undefined) return fallback;
  const n = Number(typeof value === 'object' ? value.toString() : value);
  return Number.isFinite(n) ? n : fallback;
}

// ── Helper: Date / NaiveDate / epoch-ish → epoch milliseconds (or null) ──
function toEpochMs(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'object' && 'year' in value && 'month' in value && 'day' in value) {
    return Date.UTC(value.year, value.month - 1, value.day);
  }
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// ── Helper: numeric SDK enum value → member name (napi enums have no reverse map) ──
function enumName(enumObj, value) {
  if (typeof value === 'string') return value;
  if (enumObj) {
    for (const name of Object.getOwnPropertyNames(enumObj)) {
      if (enumObj[name] === value) return name;
    }
  }
  return value === null || value === undefined ? 'Unknown' : String(value);
}

// ── Helper: infer settlement currency from the symbol suffix ──
function inferCurrency(symbol) {
  const suffix = String(symbol || '').split('.').pop().toUpperCase();
  if (suffix === 'HK') return 'HKD';
  if (suffix === 'SG') return 'SGD';
  if (suffix === 'SH' || suffix === 'SZ') return 'CNY';
  return 'USD';
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

// Contexts are cached as promises so concurrent requests (e.g. a chart
// polling quotes + intraday at once) share one connection instead of each
// opening their own. A rejected promise clears its own slot.
function resetIfCredentialsChanged(key) {
  if (cachedKey !== key) {
    cachedKey = key;
    cachedTradeCtx = null;
    cachedQuoteCtx = null;
  }
}

function getTradeContext(config, body) {
  resetIfCredentialsChanged(credentialKey(body));
  if (!cachedTradeCtx) {
    const p = TradeContext.new(config);
    cachedTradeCtx = p;
    p.catch(() => { if (cachedTradeCtx === p) cachedTradeCtx = null; });
  }
  return cachedTradeCtx;
}

function getQuoteContext(config, body) {
  resetIfCredentialsChanged(credentialKey(body));
  if (!cachedQuoteCtx) {
    const p = QuoteContext.new(config);
    cachedQuoteCtx = p;
    p.catch(() => { if (cachedQuoteCtx === p) cachedQuoteCtx = null; });
  }
  return cachedQuoteCtx;
}

function invalidateCache() {
  cachedKey = null;
  cachedTradeCtx = null;
  cachedQuoteCtx = null;
}

// ── GET /api/health ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', local: true, sdk: sdkAvailable, version: APP_VERSION });
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
        const quantity = toNumber(pos.quantity, 0);
        positions.push({
          symbol: pos.symbol,
          symbolName: pos.symbolName || pos.symbol,
          quantity,
          availableQuantity: toNumber(pos.availableQuantity, quantity),
          costPrice: toNumber(pos.costPrice, 0),
          currency: pos.currency || inferCurrency(pos.symbol),
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
        symbol_name: p.symbolName,
        quantity: p.quantity,
        available_quantity: p.availableQuantity,
        cost_price: p.costPrice,
        market_price: marketPrice,
        prev_close: prevClose,
        currency: p.currency,
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

// ── Market data (real-time chart) ──
const CANDLE_PERIODS = new Set(['day', 'week', 'month']);
const MAX_QUOTE_SYMBOLS = 50;

function validateSymbol(symbol) {
  if (symbol === undefined || symbol === null || symbol === '') {
    return 'symbol is required';
  }
  if (typeof symbol !== 'string' || !SYMBOL_RE.test(symbol)) {
    return `Invalid symbol: ${String(symbol).substring(0, 20)}`;
  }
  return null;
}

// ── POST /api/intraday ──
app.post('/api/intraday', async (req, res) => {
  if (!sdkAvailable) {
    return res.status(503).json({
      error: 'longport SDK not installed. Run: npm install',
    });
  }

  const symbol = req.body.symbol;
  const symbolError = validateSymbol(symbol);
  if (symbolError) {
    return res.status(400).json({ error: symbolError });
  }

  try {
    const config = createConfig(req.body);
    const ctx = await getQuoteContext(config, req.body);

    const [rawLines, prevClose] = await Promise.all([
      ctx.intraday(symbol, TradeSessions.Intraday),
      ctx.quote([symbol])
        .then((quotes) => {
          const q = (quotes || []).find((x) => x.symbol === symbol) || (quotes || [])[0];
          return q ? toNumber(q.prevClose, null) : null;
        })
        .catch((quoteErr) => {
          console.warn('intraday prevClose quote failed:', quoteErr.message);
          return null;
        }),
    ]);

    const lines = (rawLines || [])
      .map((l) => ({
        t: toEpochMs(l.timestamp),
        price: toNumber(l.price, 0),
        volume: toNumber(l.volume, 0),
        avgPrice: toNumber(l.avgPrice, null),
      }))
      .filter((l) => l.t !== null)
      .sort((a, b) => a.t - b.t);

    res.json({ symbol, prevClose, lines });
  } catch (err) {
    console.error('intraday error:', err.message);
    invalidateCache();
    res.status(500).json({ error: sanitizeError(err.message) });
  }
});

// ── POST /api/candles ──
app.post('/api/candles', async (req, res) => {
  if (!sdkAvailable) {
    return res.status(503).json({
      error: 'longport SDK not installed. Run: npm install',
    });
  }

  const symbol = req.body.symbol;
  const symbolError = validateSymbol(symbol);
  if (symbolError) {
    return res.status(400).json({ error: symbolError });
  }

  const period = req.body.period === undefined ? 'day' : req.body.period;
  if (!CANDLE_PERIODS.has(period)) {
    return res.status(400).json({ error: `Invalid period: must be one of ${[...CANDLE_PERIODS].join(', ')}` });
  }

  const count = req.body.count === undefined || req.body.count === null ? 60 : req.body.count;
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    return res.status(400).json({ error: 'count must be an integer between 1 and 500' });
  }

  const sdkPeriod = { day: Period.Day, week: Period.Week, month: Period.Month }[period];

  try {
    const config = createConfig(req.body);
    const ctx = await getQuoteContext(config, req.body);
    const raw = await ctx.candlesticks(
      symbol,
      sdkPeriod,
      count,
      AdjustType.NoAdjust,
      TradeSessions.Intraday
    );

    const candles = (raw || [])
      .map((c) => ({
        t: toEpochMs(c.timestamp),
        open: toNumber(c.open, 0),
        high: toNumber(c.high, 0),
        low: toNumber(c.low, 0),
        close: toNumber(c.close, 0),
        volume: toNumber(c.volume, 0),
        turnover: toNumber(c.turnover, 0),
      }))
      .filter((c) => c.t !== null)
      .sort((a, b) => a.t - b.t);

    res.json({ symbol, period, candles });
  } catch (err) {
    console.error('candles error:', err.message);
    invalidateCache();
    res.status(500).json({ error: sanitizeError(err.message) });
  }
});

// ── POST /api/quotes ──
app.post('/api/quotes', async (req, res) => {
  if (!sdkAvailable) {
    return res.status(503).json({
      error: 'longport SDK not installed. Run: npm install',
    });
  }

  const symbols = req.body.symbols;
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return res.status(400).json({ error: 'symbols must be a non-empty array' });
  }
  if (symbols.length > MAX_QUOTE_SYMBOLS) {
    return res.status(400).json({ error: `symbols must contain at most ${MAX_QUOTE_SYMBOLS} entries` });
  }
  for (const sym of symbols) {
    if (typeof sym !== 'string' || !SYMBOL_RE.test(sym)) {
      return res.status(400).json({ error: `Invalid symbol: ${String(sym).substring(0, 20)}` });
    }
  }
  const unique = [...new Set(symbols)];

  try {
    const config = createConfig(req.body);
    const ctx = await getQuoteContext(config, req.body);
    const raw = await ctx.quote(unique);

    const quotes = (raw || []).map((q) => ({
      symbol: q.symbol,
      last: toNumber(q.lastDone, null),
      prevClose: toNumber(q.prevClose, null),
      open: toNumber(q.open, null),
      high: toNumber(q.high, null),
      low: toNumber(q.low, null),
      volume: toNumber(q.volume, 0),
      turnover: toNumber(q.turnover, 0),
      t: toEpochMs(q.timestamp),
      tradeStatus: enumName(TradeStatus, q.tradeStatus),
    }));

    res.json({ quotes });
  } catch (err) {
    console.error('quotes error:', err.message);
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
