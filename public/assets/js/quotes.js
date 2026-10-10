/* Market data and live quotes.

   LB.market — intraday lines and candles for one symbol, from the local
   server in Live mode (cached, in-flight requests shared) or synthesised in
   Demo mode (LB.chart.demo). Responses are normalised defensively: missing
   or malformed fields become null and bad rows are dropped.

   LB.quotes — while the Positions view is open with positions, the page is
   visible, no dialog is up and Settings → Real-time quotes is on, polls
   /api/quotes every POLL_MS (Demo: nudges the mock prices instead), refreshes
   the active symbol's intraday line every INTRADAY_MS and the sidebar
   sparklines every SPARK_MS. Consecutive failures back off (x2, up to
   MAX_BACKOFF_MS) and toast once per streak. No timer outlives the view. */
(function (global) {
  'use strict';
  var LB = global.LB;
  var S = LB.state;
  var t = function (k, v) { return LB.t(k, v); };

  var POLL_MS = 5000;
  var MAX_BACKOFF_MS = 60000;
  var INTRADAY_MS = 30000;
  var SPARK_MS = 60000;
  var INTRADAY_TTL = 60000;
  var CANDLE_TTL = 5 * 60000;
  var SPARK_CONCURRENCY = 3;
  var DEMO_NUDGE = 0.003;          // ±0.3% per demo tick

  // ================================================================== market data
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  /** epoch ms from ms, seconds, an ISO string or a Date. */
  function epoch(v) {
    if (v == null) return null;
    if (v instanceof Date) return v.getTime();
    var n = typeof v === 'string' && !/^\d+(\.\d+)?$/.test(v) ? Date.parse(v) : Number(v);
    if (!isFinite(n) || n <= 0) return null;
    return n < 1e12 ? n * 1000 : n;
  }
  function byTime(a, b) { return a.t - b.t; }

  function normIntraday(raw, symbol) {
    raw = raw || {};
    var lines = (Array.isArray(raw.lines) ? raw.lines : []).map(function (l) {
      l = l || {};
      return { t: epoch(l.t != null ? l.t : l.timestamp), price: num(l.price), volume: num(l.volume) || 0, avgPrice: num(l.avgPrice != null ? l.avgPrice : l.avg_price) };
    }).filter(function (l) { return l.t != null && l.price != null && l.price > 0; }).sort(byTime);
    var pc = num(raw.prevClose != null ? raw.prevClose : raw.prev_close);
    return { symbol: raw.symbol || symbol, prevClose: pc > 0 ? pc : null, lines: lines };
  }

  function normCandles(raw, symbol, period) {
    raw = raw || {};
    var candles = (Array.isArray(raw.candles) ? raw.candles : []).map(function (k) {
      k = k || {};
      return { t: epoch(k.t != null ? k.t : k.timestamp), open: num(k.open), high: num(k.high), low: num(k.low), close: num(k.close), volume: num(k.volume) || 0, turnover: num(k.turnover) };
    }).filter(function (k) {
      if (k.t == null || k.close == null || !(k.close > 0)) return false;
      if (k.open == null) k.open = k.close;
      if (k.high == null) k.high = Math.max(k.open, k.close);
      if (k.low == null) k.low = Math.min(k.open, k.close);
      return true;
    }).sort(byTime);
    return { symbol: raw.symbol || symbol, period: raw.period || period, candles: candles };
  }

  var cache = {};   // key → { at, data, promise }
  function modeKey() { return S.demoMode ? 'demo' : 'live'; }
  function ckey(kind, symbol, extra) { return modeKey() + '|' + kind + '|' + symbol + (extra ? '|' + extra : ''); }

  function positionFor(symbol) {
    for (var i = 0; i < S.positions.length; i++) if (S.positions[i].symbol === symbol) return S.positions[i];
    var mock = (LB.positions && LB.positions._mock) || [];
    for (var j = 0; j < mock.length; j++) if (mock[j].symbol === symbol) return mock[j];
    return null;
  }

  /** Synthetic series for Demo mode, generated once per symbol and kept in step with the ticks. */
  function demoIntraday(symbol) {
    var k = ckey('i', symbol);
    if (!cache[k]) {
      var p = positionFor(symbol);
      if (!p || !(p.market_price > 0)) return null;
      cache[k] = { at: Date.now(), data: LB.chart.demo.intraday(symbol, p.market_price, p.prev_close) };
    }
    return cache[k].data;
  }
  function demoCandles(symbol, period, count) {
    var k = ckey('c', symbol, period + ':' + count);
    if (!cache[k]) {
      var p = positionFor(symbol);
      if (!p || !(p.market_price > 0)) return null;
      cache[k] = { at: Date.now(), data: LB.chart.demo.candles(symbol, period, count, p.market_price) };
    }
    return cache[k].data;
  }

  /** Shared fetch-with-cache: one in-flight request per key; stale data kept on failure. */
  function cached(k, ttl, opts, fetcher) {
    var c = cache[k];
    if (c && c.promise) return c.promise;
    var maxAge = opts && opts.maxAge != null ? opts.maxAge : ttl;
    if (c && c.data && !(opts && opts.force) && Date.now() - c.at < maxAge) return Promise.resolve(c.data);
    var mode = modeKey();
    var pr = fetcher().then(function (data) {
      if (modeKey() === mode) cache[k] = { at: Date.now(), data: data };
      return data;
    }, function (err) {
      var cur = cache[k];
      if (cur && cur.promise === pr) {
        if (cur.data) delete cur.promise; else delete cache[k];
      }
      throw err;
    });
    cache[k] = { at: c ? c.at : 0, data: c ? c.data : null, promise: pr };
    return pr;
  }

  function intraday(symbol, opts) {
    if (S.demoMode) {
      var d = demoIntraday(symbol);
      return d ? Promise.resolve(d) : Promise.resolve({ symbol: symbol, prevClose: null, lines: [] });
    }
    return cached(ckey('i', symbol), INTRADAY_TTL, opts, function () {
      return LB.api.intraday(LB.creds(), symbol).then(function (raw) { return normIntraday(raw, symbol); });
    });
  }

  function candles(symbol, period, count, opts) {
    if (S.demoMode) {
      var d = demoCandles(symbol, period, count);
      return Promise.resolve(d || { symbol: symbol, period: period, candles: [] });
    }
    return cached(ckey('c', symbol, period + ':' + count), CANDLE_TTL, opts, function () {
      return LB.api.candles(LB.creds(), symbol, period, count).then(function (raw) { return normCandles(raw, symbol, period); });
    });
  }

  /** Cached intraday data without fetching (Demo: generated on demand). */
  function peekIntraday(symbol) {
    if (S.demoMode) return demoIntraday(symbol);
    var c = cache[ckey('i', symbol)];
    return c && c.data ? c.data : null;
  }
  function peekCandles(symbol, period, count) {
    if (S.demoMode) return demoCandles(symbol, period, count);
    var c = cache[ckey('c', symbol, period + ':' + count)];
    return c && c.data ? c.data : null;
  }

  /** Keep the synthetic series' last point on the (ticked) mock price. */
  function demoFollow(symbol, price) {
    Object.keys(cache).forEach(function (k) {
      if (k.indexOf('demo|') !== 0 || k.split('|')[2] !== symbol) return;
      var d = cache[k].data;
      if (d && d.lines && d.lines.length) d.lines[d.lines.length - 1].price = price;
      if (d && d.candles && d.candles.length) {
        var last = d.candles[d.candles.length - 1];
        last.close = price;
        if (price > last.high) last.high = price;
        if (price < last.low) last.low = price;
      }
    });
  }

  LB.market = {
    intraday: intraday,
    candles: candles,
    peekIntraday: peekIntraday,
    peekCandles: peekCandles,
    clear: function () { cache = {}; },
    _normIntraday: normIntraday,
    _normCandles: normCandles
  };

  // ================================================================== polling
  var enabled = LB.storage.get('lb_liveQuotes', 'true') !== 'false';
  var timers = { quote: 0, intraday: 0, spark: 0 };
  var active = false;       // conditions met (view, positions, mode, toggle)
  var paused = false;       // hidden window or open dialog
  var failures = 0;
  var interval = POLL_MS;
  var toasted = false;
  var gen = 0;              // bumps on stop / pause; stale responses are dropped
  var lastTick = 0;
  var lastMode = null;
  var sparkRun = 0;

  function shouldRun() {
    if (!enabled || S.view !== 'positions') return false;
    if (!S.positionsLoaded || !S.positions.length) return false;
    if (!S.demoMode && (S.server !== 'ok' || !LB.hasCreds())) return false;
    return true;
  }
  function isPaused() {
    return document.visibilityState === 'hidden' || !!(LB.modals && LB.modals.isOpen());
  }

  function clearTimers() {
    Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); timers[k] = 0; });
  }
  function halt() { gen += 1; clearTimers(); }

  function scheduleQuote(ms) {
    clearTimeout(timers.quote);
    timers.quote = setTimeout(tick, Math.max(0, ms));
  }
  function scheduleIntraday() {
    clearTimeout(timers.intraday);
    if (!S.demoMode) timers.intraday = setTimeout(intradayTick, INTRADAY_MS);
  }
  function scheduleSpark() {
    clearTimeout(timers.spark);
    if (!S.demoMode) timers.spark = setTimeout(sparkTick, SPARK_MS);
  }

  function start() {
    var since = Date.now() - lastTick;
    scheduleQuote(lastTick ? Math.max(0, interval - since) : interval);
    scheduleIntraday();
    scheduleSpark();
  }

  /** Reconcile timers with the current state. Idempotent; runs on every render. */
  function sync() {
    if (lastMode !== null && lastMode !== S.demoMode) {
      halt();
      failures = 0; interval = POLL_MS; toasted = false; lastTick = 0;
      LB.market.clear();
    }
    lastMode = S.demoMode;
    var want = shouldRun();
    if (!want) {
      if (active) halt();
      active = false;
      paused = false;
      renderStatus();
      return;
    }
    var nowPaused = isPaused();
    var wasActive = active;
    var wasPaused = paused;
    active = true;
    paused = nowPaused;
    if (paused) {
      if (!wasPaused || timers.quote) halt();
    } else if (!wasActive || wasPaused || !timers.quote) {
      if (!timers.quote && !inflight) start();
    }
    renderStatus();
  }

  var inflight = false;

  function tick() {
    timers.quote = 0;
    if (!active || paused) return;
    if (S.loading) { scheduleQuote(interval); return; }
    var myGen = gen;
    lastTick = Date.now();
    if (S.demoMode) {
      demoTick();
      afterUpdate();
      scheduleQuote(POLL_MS);
      return;
    }
    var symbols = S.positions.map(function (p) { return p.symbol; });
    inflight = true;
    LB.api.quotes(LB.creds(), symbols).then(function (data) {
      if (myGen !== gen || S.demoMode) return;
      applyQuotes(data && data.quotes);
      failures = 0;
      interval = POLL_MS;
      toasted = false;
      afterUpdate();
    }, function (err) {
      if (myGen !== gen || S.demoMode) return;
      failures += 1;
      interval = Math.min(MAX_BACKOFF_MS, POLL_MS * Math.pow(2, failures));
      if (!toasted) {
        toasted = true;
        LB.toast(err && err.message ? err.message : String(err), 'error', t('quotesFailedTitle'));
      }
      renderStatus();
    }).then(function () {
      inflight = false;
      if (myGen !== gen) { sync(); return; }
      if (active && !paused) scheduleQuote(interval);
    });
  }

  /** Merge a /api/quotes response into the positions. Returns the symbols that changed. */
  function applyQuotes(list) {
    var changed = [];
    (Array.isArray(list) ? list : []).forEach(function (q) {
      if (!q || !q.symbol) return;
      var last = num(q.last != null ? q.last : q.last_done);
      var pc = num(q.prevClose != null ? q.prevClose : q.prev_close);
      S.positions.forEach(function (p) {
        if (p.symbol !== q.symbol) return;
        var before = p.market_price + '|' + p.prev_close;
        if (last != null && last > 0) p.market_price = last;
        if (pc != null && pc > 0) p.prev_close = pc;
        if (before !== p.market_price + '|' + p.prev_close) changed.push(p.symbol);
      });
    });
    return changed;
  }

  function demoTick() {
    S.positions.forEach(function (p) {
      if (!(p.market_price > 0)) return;
      var next = LB.chart.demo.roundPx(p.market_price * (1 + (Math.random() * 2 - 1) * DEMO_NUDGE));
      p.market_price = next;
      demoFollow(p.symbol, next);
    });
  }

  function afterUpdate() {
    S.lastUpdated = Date.now();
    if (LB.positions.updatePrices) LB.positions.updatePrices();
    LB.shell.renderChrome();
    renderStatus();
    paintSparks();
    if (LB.chartCard) LB.chartCard.refresh();
  }

  function intradayTick() {
    timers.intraday = 0;
    if (!active || paused || S.demoMode) return;
    var sym = S.active;
    var myGen = gen;
    if (sym && LB.chartCard && LB.chartCard.wantsIntraday(sym)) {
      LB.market.intraday(sym, { force: true }).then(function () {
        if (myGen !== gen) return;
        LB.chartCard.refresh();
        paintSparks();
      }, function () { /* the chart keeps its last good data */ });
    }
    scheduleIntraday();
  }

  function sparkTick() {
    timers.spark = 0;
    if (!active || paused || S.demoMode) return;
    loadSparks(SPARK_MS - 5000);
    scheduleSpark();
  }

  // ================================================================== sparklines
  /** Fetch every held symbol's intraday line, SPARK_CONCURRENCY at a time. Failures are silent. */
  function loadSparks(maxAge) {
    if (!S.positions.length) return;
    if (S.demoMode) { paintSparks(); return; }
    if (S.server !== 'ok' || !LB.hasCreds()) return;
    var run = ++sparkRun;
    var queue = S.positions.map(function (p) { return p.symbol; });
    var running = 0;
    var next = function () {
      while (running < SPARK_CONCURRENCY && queue.length) {
        if (run !== sparkRun || S.demoMode) return;
        var sym = queue.shift();
        running += 1;
        (function (s) {
          LB.market.intraday(s, { maxAge: maxAge == null ? INTRADAY_TTL : maxAge }).then(function () {
            if (run === sparkRun) paintSpark(s);
          }, function () { /* silent: empty sparkline */ }).then(function () {
            running -= 1;
            next();
          });
        })(sym);
      }
    };
    next();
  }

  function paintSpark(symbol) {
    var list = document.getElementById('posList');
    if (!list) return;
    list.querySelectorAll('canvas[data-spark]').forEach(function (cv) {
      if (cv.getAttribute('data-spark') === symbol) LB.chart.spark(cv, LB.market.peekIntraday(symbol), symbol);
    });
  }

  function paintSparks() {
    var list = document.getElementById('posList');
    if (!list) return;
    list.querySelectorAll('canvas[data-spark]').forEach(function (cv) {
      var sym = cv.getAttribute('data-spark');
      var data = LB.market.peekIntraday(sym);
      if (data) LB.chart.spark(cv, data, sym);
      else LB.chart.clear(cv);
    });
  }

  // ================================================================== status bar
  function renderStatus() {
    var el = document.getElementById('sbLive');
    if (!el) return;
    el.hidden = !active;
    if (!active) return;
    el.classList.toggle('is-paused', paused);
    el.classList.toggle('is-demo', S.demoMode);
    el.classList.toggle('is-error', failures > 0);
    document.getElementById('sbLiveText').textContent = S.demoMode ? t('demoTicks') : t('liveIndicator');
    el.title = paused ? t('liveQuotesPaused') : t('liveQuotesTip', { s: Math.round((S.demoMode ? POLL_MS : interval) / 1000) });
  }

  // ================================================================== wiring
  function init() {
    LB.bus.on('render', sync);
    LB.bus.on('modal', sync);
    LB.bus.on('positions', function () { loadSparks(); });
    LB.bus.on('theme', paintSparks);
    if (global.matchMedia) {
      var mq = global.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', paintSparks);
    }
    document.addEventListener('visibilitychange', sync);
    // Sparklines can't be drawn while the list is hidden (width 0); repaint
    // when it gets a size again (sidebar unfolded, view switched back).
    var list = document.getElementById('posList');
    if (list && global.ResizeObserver) {
      var lastW = list.clientWidth;
      new global.ResizeObserver(function () {
        var w = list.clientWidth;
        if (w && w !== lastW) paintSparks();
        lastW = w;
      }).observe(list);
    }
  }

  LB.quotes = {
    init: init,
    sync: sync,
    paintSparks: paintSparks,
    loadSparks: loadSparks,
    isEnabled: function () { return enabled; },
    setEnabled: function (on) {
      enabled = !!on;
      LB.storage.set('lb_liveQuotes', enabled ? 'true' : 'false');
      sync();
    },
    /** For tests / diagnostics. */
    _state: function () {
      return { active: active, paused: paused, failures: failures, interval: interval, timers: { quote: !!timers.quote, intraday: !!timers.intraday, spark: !!timers.spark }, inflight: inflight };
    },
    POLL_MS: POLL_MS
  };
})(window);
