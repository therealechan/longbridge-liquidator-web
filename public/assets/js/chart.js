/* Hand-written <canvas> charts: the details-panel price chart (intraday line
   or daily / weekly candles, with a volume strip) and the sidebar sparklines.
   Also deterministic synthetic market data for Demo mode.
   Colours are read from the CSS custom properties at draw time, so a theme
   flip only needs a redraw. Drawing is synchronous and cheap (a few hundred
   points at most), so hover simply redraws the whole canvas. */
(function (global) {
  'use strict';
  var LB = global.LB = global.LB || {};

  // ------------------------------------------------------------------ sessions
  // slots: one-minute lines in a regular session; wall: minutes from the open
  // to the close (lunch included); breaks: [after slot, minutes] pauses.
  var SESSIONS = {
    US: { slots: 390, wall: 390, open: [9, 30], breaks: [] },
    HK: { slots: 330, wall: 390, open: [9, 30], breaks: [[150, 60]] },
    SG: { slots: 420, wall: 480, open: [9, 0], breaks: [[180, 60]] },
    SH: { slots: 240, wall: 330, open: [9, 30], breaks: [[120, 90]] },
    SZ: { slots: 240, wall: 330, open: [9, 30], breaks: [[120, 90]] }
  };

  function marketOf(symbol) {
    var m = /\.([A-Z]+)$/.exec(String(symbol || ''));
    return m ? m[1] : 'US';
  }
  function session(symbol) { return SESSIONS[marketOf(symbol)] || SESSIONS.US; }

  // ------------------------------------------------------------------ time labels
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function hhmm(t) { var d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function ymd(t) { var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function md(t) { var d = new Date(t); return pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function ym(t) { var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }

  // ------------------------------------------------------------------ colours
  function colors() {
    var style = global.getComputedStyle(document.documentElement);
    var v = function (name, fallback) { var x = style.getPropertyValue(name).trim(); return x || fallback; };
    var mono = v('--font-mono', 'ui-monospace, monospace');
    return {
      fg: v('--foreground', '#888'),
      muted: v('--muted', '#888'),
      mutedFg: v('--muted-foreground', '#999'),
      grid: v('--border-soft', 'rgba(128,128,128,0.15)'),
      up: v('--success', '#16a34a'),
      down: v('--danger', '#dc2626'),
      accent: v('--accent', '#888'),
      bg: v('--background', '#fff'),
      font: '10px ' + mono
    };
  }

  /** '#rgb' | '#rrggbb' | 'rgb(...)' → 'rgba(r,g,b,a)'. */
  function withAlpha(color, a) {
    var c = String(color).trim();
    var r, g, b;
    if (c.charAt(0) === '#') {
      var h = c.slice(1);
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
    } else {
      var m = /rgba?\(([^)]+)\)/.exec(c);
      if (!m) return c;
      var parts = m[1].split(',').map(parseFloat);
      r = parts[0]; g = parts[1]; b = parts[2];
    }
    if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return c;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  // ------------------------------------------------------------------ canvas
  /** Size the backing store for the device pixel ratio and clear it. */
  function setup(canvas, fixedW, fixedH) {
    var w = fixedW != null ? fixedW : canvas.clientWidth;
    var h = fixedH != null ? fixedH : canvas.clientHeight;
    if (!w || !h) return null;
    var dpr = global.devicePixelRatio || 1;
    var bw = Math.round(w * dpr);
    var bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function clear(canvas) {
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }

  function hline(ctx, x0, x1, y) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
  function vline(ctx, x, y0, y1) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }

  /** 2–4 round price ticks inside [lo, hi]. */
  function ticks(lo, hi) {
    var range = hi - lo;
    var best = null;
    [3, 2.5, 4, 2].some(function (target) {
      var rough = range / target;
      var mag = Math.pow(10, Math.floor(Math.log(rough) / Math.LN10));
      var norm = rough / mag;
      var step = (norm < 1.5 ? 1 : norm < 2.25 ? 2 : norm < 3.5 ? 2.5 : norm < 7.5 ? 5 : 10) * mag;
      var values = [];
      for (var v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) values.push(v);
      best = { step: step, values: values };
      return values.length >= 3 && values.length <= 4;
    });
    var d = 0;
    while (d < 4 && Math.abs(best.step * Math.pow(10, d) - Math.round(best.step * Math.pow(10, d))) > 1e-6) d++;
    best.decimals = d;
    return best;
  }

  function fmtNum(v, d) {
    return LB.fmt ? LB.fmt.number(v, d) : Number(v).toFixed(d);
  }

  // ------------------------------------------------------------------ main chart
  var TIME_H = 14;   // bottom time label row
  var VOL_H = 36;    // volume strip
  var GAP = 6;       // between price area and volume strip
  var TOP = 6;       // above the price area

  /**
   * model: {
   *   kind: 'line' | 'candle',
   *   points: line → [{ t, price, volume }], candle → [{ t, open, high, low, close, volume }],
   *   prevClose?: number|null, slots?: number (line: session length), wall?: minutes,
   *   period?: 'day'|'week'|'month', prevLabel?: string
   * }
   * Returns a layout object for hit-testing, or null when nothing was drawn.
   */
  function draw(canvas, model, hoverIdx) {
    var s = setup(canvas);
    if (!s || !model || !model.points || !model.points.length) return null;
    var ctx = s.ctx, w = s.w, h = s.h;
    var c = colors();
    var pts = model.points;
    var n = pts.length;
    var isLine = model.kind === 'line';
    var prevClose = isLine && model.prevClose > 0 ? model.prevClose : null;

    // ---- domain
    var lo = Infinity, hi = -Infinity, vmax = 0;
    for (var i = 0; i < n; i++) {
      var p = pts[i];
      var a = isLine ? p.price : p.low;
      var b = isLine ? p.price : p.high;
      if (a < lo) lo = a;
      if (b > hi) hi = b;
      if (p.volume > vmax) vmax = p.volume;
    }
    if (prevClose != null) { lo = Math.min(lo, prevClose); hi = Math.max(hi, prevClose); }
    if (hi - lo < 1e-9) { var d0 = Math.abs(hi) * 0.01 || 1; lo -= d0; hi += d0; }
    var padv = (hi - lo) * 0.08;
    lo -= padv; hi += padv;

    var tk = ticks(lo, hi);
    ctx.font = c.font;
    var labW = 0;
    var labels = tk.values.map(function (v) {
      var txt = fmtNum(v, tk.decimals);
      labW = Math.max(labW, ctx.measureText(txt).width);
      return txt;
    });

    var plotL = 0;
    var plotR = Math.floor(w - labW - 8);
    var plotW = plotR - plotL;
    var volBottom = h - TIME_H;
    var volTop = volBottom - VOL_H;
    var priceTop = TOP;
    var priceBottom = volTop - GAP;
    var slots = Math.max(n, model.slots || n);
    var slotW = plotW / slots;
    var xOf = function (idx) { return plotL + (idx + 0.5) * slotW; };
    var yOf = function (v) { return priceTop + ((hi - v) / (hi - lo)) * (priceBottom - priceTop); };

    // ---- grid + right-side price labels
    ctx.lineWidth = 1;
    ctx.strokeStyle = c.grid;
    ctx.fillStyle = c.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    tk.values.forEach(function (v, k) {
      var yy = Math.round(yOf(v)) + 0.5;
      if (yy < priceTop - 1 || yy > priceBottom + 1) return;
      hline(ctx, plotL, plotR, yy);
      ctx.fillText(labels[k], plotR + 6, yy);
    });
    hline(ctx, plotL, plotR, volBottom + 0.5);

    // ---- volume strip
    if (vmax > 0) {
      var upVol = withAlpha(c.up, 0.45);
      var downVol = withAlpha(c.down, 0.45);
      var bwV = isLine ? Math.max(1, slotW) : Math.max(1, Math.floor(slotW * 0.62));
      for (i = 0; i < n; i++) {
        var q = pts[i];
        if (!(q.volume > 0)) continue;
        var up;
        if (isLine) up = i ? q.price >= pts[i - 1].price : (prevClose != null ? q.price >= prevClose : true);
        else up = q.close >= q.open;
        var vh = Math.max(1, (q.volume / vmax) * VOL_H);
        ctx.fillStyle = up ? upVol : downVol;
        ctx.fillRect(isLine ? plotL + i * slotW : Math.round(xOf(i) - bwV / 2), volBottom - vh, bwV, vh);
      }
    }

    var lineColor = c.accent;
    if (isLine) {
      // ---- intraday line with a soft gradient fill
      var last = pts[n - 1].price;
      var base = prevClose != null ? prevClose : pts[0].price;
      lineColor = last > base ? c.up : last < base ? c.down : c.accent;
      ctx.beginPath();
      ctx.moveTo(xOf(0), yOf(pts[0].price));
      for (i = 1; i < n; i++) ctx.lineTo(xOf(i), yOf(pts[i].price));
      if (n > 1) {
        ctx.save();
        ctx.lineTo(xOf(n - 1), priceBottom);
        ctx.lineTo(xOf(0), priceBottom);
        ctx.closePath();
        var grad = ctx.createLinearGradient(0, priceTop, 0, priceBottom);
        grad.addColorStop(0, withAlpha(lineColor, 0.18));
        grad.addColorStop(1, withAlpha(lineColor, 0));
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(xOf(0), yOf(pts[0].price));
        for (i = 1; i < n; i++) ctx.lineTo(xOf(i), yOf(pts[i].price));
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
      } else {
        ctx.fillStyle = lineColor;
        ctx.beginPath();
        ctx.arc(xOf(0), yOf(pts[0].price), 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- dashed previous-close reference line with a small label
      if (prevClose != null) {
        var py = Math.round(yOf(prevClose)) + 0.5;
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = c.mutedFg;
        ctx.lineWidth = 1;
        hline(ctx, plotL, plotR, py);
        ctx.restore();
        var txt = (model.prevLabel ? model.prevLabel + ' ' : '') + fmtNum(prevClose, Math.max(2, tk.decimals));
        ctx.font = c.font;
        var tw = ctx.measureText(txt).width;
        var ty = py - 8 > priceTop + 4 ? py - 7 : py + 8;
        ctx.fillStyle = withAlpha(c.bg, 0.85);
        ctx.fillRect(plotL + 2, ty - 6, tw + 6, 12);
        ctx.fillStyle = c.mutedFg;
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, plotL + 5, ty);
      }
    } else {
      // ---- candles: wick + body
      var bw = Math.max(1, Math.floor(slotW * 0.62));
      ctx.lineWidth = 1;
      for (i = 0; i < n; i++) {
        var k = pts[i];
        var rising = k.close >= k.open;
        var col = rising ? c.up : c.down;
        var cx = Math.round(xOf(i));
        ctx.strokeStyle = col;
        vline(ctx, cx + 0.5, Math.round(yOf(k.high)), Math.round(yOf(k.low)));
        var top = yOf(Math.max(k.open, k.close));
        var bot = yOf(Math.min(k.open, k.close));
        ctx.fillStyle = col;
        ctx.fillRect(cx + 0.5 - bw / 2, Math.round(top), bw, Math.max(1, Math.round(bot - top)));
      }
    }

    // ---- bottom time labels
    ctx.fillStyle = c.muted;
    ctx.textBaseline = 'alphabetic';
    ctx.font = c.font;
    var ty2 = h - 3;
    var mid = Math.floor(slots / 2);
    var timeLabels = [];
    if (isLine) {
      var endT = n >= slots ? pts[n - 1].t : pts[0].t + (model.wall || slots) * 60000;
      timeLabels.push({ x: plotL, text: hhmm(pts[0].t), align: 'left' });
      if (mid < n && mid > 0) timeLabels.push({ x: xOf(mid), text: hhmm(pts[mid].t), align: 'center' });
      timeLabels.push({ x: plotR, text: hhmm(endT), align: 'right' });
    } else {
      var f = model.period === 'week' || model.period === 'month' ? ym : md;
      timeLabels.push({ x: plotL, text: f(pts[0].t), align: 'left' });
      if (n > 2) timeLabels.push({ x: xOf(Math.floor((n - 1) / 2)), text: f(pts[Math.floor((n - 1) / 2)].t), align: 'center' });
      if (n > 1) timeLabels.push({ x: plotR, text: f(pts[n - 1].t), align: 'right' });
    }
    var lastEnd = -Infinity;
    timeLabels.forEach(function (lb, idx) {
      var tw2 = ctx.measureText(lb.text).width;
      var x0 = lb.align === 'left' ? lb.x : lb.align === 'right' ? lb.x - tw2 : lb.x - tw2 / 2;
      // skip a label that would collide with the previous one (or the end one)
      var next = timeLabels[idx + 1];
      if (x0 < lastEnd + 6) return;
      if (lb.align === 'center' && next) {
        var nw = ctx.measureText(next.text).width;
        if (x0 + tw2 + 6 > next.x - nw) return;
      }
      ctx.textAlign = 'left';
      ctx.fillText(lb.text, x0, ty2);
      lastEnd = x0 + tw2;
    });

    // ---- hover crosshair
    if (hoverIdx != null && hoverIdx >= 0 && hoverIdx < n) {
      var hx = Math.round(xOf(hoverIdx)) + 0.5;
      ctx.strokeStyle = c.mutedFg;
      ctx.lineWidth = 1;
      vline(ctx, hx, priceTop, volBottom);
      var hv = isLine ? pts[hoverIdx].price : pts[hoverIdx].close;
      var hy = Math.round(yOf(hv)) + 0.5;
      ctx.save();
      ctx.setLineDash([2, 3]);
      hline(ctx, plotL, plotR, hy);
      ctx.restore();
      if (isLine) {
        ctx.fillStyle = c.bg;
        ctx.beginPath(); ctx.arc(hx, yOf(hv), 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = lineColor;
        ctx.beginPath(); ctx.arc(hx, yOf(hv), 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    return {
      n: n,
      plotL: plotL,
      plotR: plotR,
      priceTop: priceTop,
      x: xOf,
      idxAt: function (px) {
        var idx = Math.floor((px - plotL) / slotW);
        return Math.max(0, Math.min(n - 1, idx));
      }
    };
  }

  // ------------------------------------------------------------------ sparkline
  var SPARK_H = 16;

  /** 48×16 intraday sparkline: 1px line, green / red vs prevClose, no axes.
      Drawn at the canvas's laid-out width, which shrinks (to nothing) when a
      row is short of room; a hidden canvas (width 0) is skipped. */
  function spark(canvas, data, symbol) {
    var s = setup(canvas, canvas.clientWidth, SPARK_H);
    if (!s) return;
    var pts = data && data.lines;
    if (!pts || pts.length < 2) return;
    var ctx = s.ctx;
    var c = colors();
    var n = pts.length;
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < n; i++) { if (pts[i].price < lo) lo = pts[i].price; if (pts[i].price > hi) hi = pts[i].price; }
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    var slots = Math.max(n, session(symbol).slots);
    var base = data.prevClose > 0 ? data.prevClose : pts[0].price;
    var last = pts[n - 1].price;
    ctx.strokeStyle = last > base ? c.up : last < base ? c.down : c.mutedFg;
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (i = 0; i < n; i++) {
      var x = 0.5 + (i / (slots - 1)) * (s.w - 1);
      var y = 1.5 + ((hi - pts[i].price) / (hi - lo)) * (s.h - 3);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  // ------------------------------------------------------------------ demo data
  function hashSeed(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /** mulberry32 */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) {
    var u = r() || 1e-9;
    var v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function roundPx(v) { return v >= 1 ? Math.round(v * 100) / 100 : Math.round(v * 1000) / 1000; }
  function minuteOffset(sess, i) {
    var m = i;
    sess.breaks.forEach(function (b) { if (i >= b[0]) m += b[1]; });
    return m;
  }

  /**
   * Today's session so far (~72% of it): a random walk from a gap-open off
   * prevClose, bridged so the last point is exactly the current price.
   * Seeded by the symbol, so the shape is stable across reloads.
   */
  function demoIntraday(symbol, price, prevClose) {
    var r = rng(hashSeed(String(symbol) + '|intraday'));
    var sess = session(symbol);
    var pc = prevClose > 0 ? prevClose : roundPx(price * (1 + (r() - 0.5) * 0.03));
    var n = Math.max(2, Math.round(sess.slots * 0.72));
    var walk = [0];
    for (var i = 1; i < n; i++) walk.push(walk[i - 1] + gauss(r) * 0.0006);
    var open = pc * (1 + (r() - 0.5) * 0.006);
    var start = Math.log(open);
    var end = Math.log(price);
    var wEnd = walk[n - 1];
    var day = new Date();
    day.setHours(sess.open[0], sess.open[1], 0, 0);
    var t0 = day.getTime();
    var lines = [];
    var pv = 0, vv = 0;
    for (i = 0; i < n; i++) {
      var f = i / (n - 1);
      var px = roundPx(Math.exp(start + walk[i] - f * wEnd + f * (end - start)));
      var u = Math.abs(i / sess.slots - 0.5) * 2;          // U-shaped volume
      var vol = Math.round((600 + 2400 * u * u) * (0.4 + r() * 1.2));
      pv += px * vol; vv += vol;
      lines.push({ t: t0 + minuteOffset(sess, i) * 60000, price: px, volume: vol, avgPrice: roundPx(pv / vv) });
    }
    lines[n - 1].price = price;
    return { symbol: symbol, prevClose: pc, lines: lines };
  }

  /**
   * Daily / weekly candles ending at the current price. A fixed-length series
   * is generated per symbol and period and the last `count` are returned, so
   * 1M is exactly the tail of 3M.
   */
  function demoCandles(symbol, period, count, price) {
    var r = rng(hashSeed(String(symbol) + '|' + period));
    var vol = period === 'week' ? 0.028 : period === 'month' ? 0.07 : 0.016;
    var total = Math.max(count, period === 'day' ? 132 : 60);
    var drift = (r() - 0.45) * vol * 0.35;
    var closes = new Array(total);
    closes[total - 1] = price;
    for (var i = total - 1; i > 0; i--) closes[i - 1] = closes[i] / Math.exp(drift + gauss(r) * vol);

    // timestamps: trading days (Mon–Fri) or Mondays, ending today
    var times = new Array(total);
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    if (period === 'week') {
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      for (i = total - 1; i >= 0; i--) { times[i] = d.getTime(); d.setDate(d.getDate() - 7); }
    } else if (period === 'month') {
      d.setDate(1);
      for (i = total - 1; i >= 0; i--) { times[i] = d.getTime(); d.setMonth(d.getMonth() - 1); }
    } else {
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
      for (i = total - 1; i >= 0; i--) {
        times[i] = d.getTime();
        do { d.setDate(d.getDate() - 1); } while (d.getDay() === 0 || d.getDay() === 6);
      }
    }

    var candles = [];
    for (i = 0; i < total; i++) {
      var c = closes[i];
      var o = i ? closes[i - 1] * (1 + gauss(r) * vol * 0.2) : c / Math.exp(gauss(r) * vol);
      var hi = Math.max(o, c) * (1 + r() * vol * 0.6);
      var lo = Math.min(o, c) * (1 - r() * vol * 0.6);
      var v = Math.round((period === 'day' ? 1 : 5) * 1e6 * (0.5 + r()));
      candles.push({ t: times[i], open: roundPx(o), high: roundPx(hi), low: roundPx(lo), close: roundPx(c), volume: v, turnover: Math.round(v * c) });
    }
    candles[total - 1].close = price;
    return { symbol: symbol, period: period, candles: candles.slice(-count) };
  }

  LB.chart = {
    draw: draw,
    spark: spark,
    clear: clear,
    session: session,
    marketOf: marketOf,
    fmtTime: hhmm,
    fmtDate: ymd,
    demo: { intraday: demoIntraday, candles: demoCandles, roundPx: roundPx }
  };
})(window);
