/* The details-panel chart card: Today | 1M | 3M | 1Y range control, the
   canvas (LB.chart), loading / error / empty states, the hover tooltip and
   the caption line.

   The card is ONE persistent element. renderDetails() rebuilds the details
   panel's HTML on every render and calls mount(), which re-attaches this
   element into the fresh slot, so the canvas, its pixels and its listeners
   survive re-renders without flicker. Data is (re)loaded only when the
   symbol, the mode or the range changes, and only once the card is visible. */
(function (global) {
  'use strict';
  var LB = global.LB;
  var S = LB.state;
  var fmt = LB.fmt;
  var esc = fmt.escape;
  var t = function (k, v) { return LB.t(k, v); };

  var RANGES = {
    today: { label: 'chartToday' },
    '1m': { label: 'chart1M', period: 'day', count: 22 },
    '3m': { label: 'chart3M', period: 'day', count: 66 },
    '1y': { label: 'chart1Y', period: 'week', count: 52 }
  };
  var ORDER = ['today', '1m', '3m', '1y'];

  var range = LB.storage.get('lb_chartRange', 'today');
  if (!RANGES[range]) range = 'today';

  var root = null;
  var els = {};
  var symbol = null;
  var currency = 'USD';
  var mode = null;
  var status = 'idle';      // idle | loading | ready | empty | error
  var errorMsg = '';
  var data = null;
  var model = null;
  var layout = null;
  var hover = null;
  var token = 0;
  var needsLoad = false;
  var frame = 0;

  // ------------------------------------------------------------------ build
  function build() {
    root = document.createElement('div');
    root.className = 'chart-card';
    root.innerHTML =
      '<div class="segmented block chart-range" role="radiogroup" data-seg="chartRange">' +
        ORDER.map(function (k) { return '<button type="button" data-value="' + k + '"></button>'; }).join('') +
      '</div>' +
      '<div class="chart-wrap">' +
        '<canvas class="chart-canvas" role="img"></canvas>' +
        '<div class="chart-tip" hidden></div>' +
        '<div class="chart-state" hidden></div>' +
      '</div>' +
      '<div class="chart-caption selectable"></div>';
    els.seg = root.querySelector('.chart-range');
    els.wrap = root.querySelector('.chart-wrap');
    els.canvas = root.querySelector('.chart-canvas');
    els.tip = root.querySelector('.chart-tip');
    els.state = root.querySelector('.chart-state');
    els.caption = root.querySelector('.chart-caption');

    els.canvas.addEventListener('mousemove', onMove);
    els.canvas.addEventListener('mouseleave', onLeave);
    if (global.ResizeObserver) new global.ResizeObserver(onResize).observe(els.wrap);
    else global.addEventListener('resize', onResize);
  }

  function visible() {
    return !!(root && root.isConnected && els.wrap.clientWidth > 0);
  }

  // ------------------------------------------------------------------ data
  function rangeData(peekOnly) {
    var r = RANGES[range];
    if (range === 'today') return peekOnly ? LB.market.peekIntraday(symbol) : LB.market.intraday(symbol);
    return peekOnly ? LB.market.peekCandles(symbol, r.period, r.count) : LB.market.candles(symbol, r.period, r.count);
  }

  function requestLoad() {
    needsLoad = true;
    if (visible()) load();
  }

  function load() {
    needsLoad = false;
    var my = ++token;
    var peek = rangeData(true);
    if (peek) setData(peek);
    else { status = 'loading'; data = null; model = null; paint(); }
    rangeData(false).then(function (d) {
      if (my !== token) return;
      setData(d);
    }, function (err) {
      if (my !== token || data) return;          // keep showing stale data if we have it
      status = 'error';
      errorMsg = err && err.message ? err.message : String(err);
      paint();
    });
  }

  function setData(d) {
    data = d;
    if (range === 'today') {
      var sess = LB.chart.session(symbol);
      model = { kind: 'line', points: (d && d.lines) || [], prevClose: d ? d.prevClose : null, slots: sess.slots, wall: sess.wall, prevLabel: t('chartPrevClose') };
    } else {
      model = { kind: 'candle', points: (d && d.candles) || [], period: RANGES[range].period };
    }
    status = model.points.length ? 'ready' : 'empty';
    if (hover != null && hover >= model.points.length) hover = null;
    paint();
  }

  // ------------------------------------------------------------------ painting
  function paint() {
    if (!root) return;
    if (frame) { global.cancelAnimationFrame(frame); frame = 0; }
    if (status === 'ready') {
      els.state.hidden = true;
      layout = LB.chart.draw(els.canvas, model, hover);
      updateTip();
    } else {
      layout = null;
      LB.chart.clear(els.canvas);
      els.tip.hidden = true;
      els.state.hidden = status === 'idle';
      els.state.className = 'chart-state' + (status === 'error' ? ' is-error' : '');
      els.state.innerHTML = status === 'loading'
        ? '<span class="skel chart-skel"></span>'
        : status === 'error'
          ? '<span>' + esc(t('chartUnavailable', { error: errorMsg })) + '</span>'
          : '<span>' + esc(t('chartNoData')) + '</span>';
    }
    caption();
  }

  function caption() {
    var text = '';
    if (status === 'ready' && model.points.length) {
      var pts = model.points;
      if (model.kind === 'line') {
        var date = LB.chart.fmtDate(pts[0].t);
        text = model.prevClose > 0
          ? t('chartCaptionToday', { date: date, price: fmt.money(model.prevClose, currency) })
          : t('chartCaptionSession', { date: date });
      } else {
        text = t('chartCaptionRange', { from: LB.chart.fmtDate(pts[0].t), to: LB.chart.fmtDate(pts[pts.length - 1].t) });
      }
    }
    els.caption.textContent = text || ' ';
    els.canvas.setAttribute('aria-label', text || t('chartNoData'));
  }

  function labels() {
    els.seg.setAttribute('aria-label', t('chartRangeLabel'));
    els.seg.querySelectorAll('button[data-value]').forEach(function (b) {
      b.textContent = t(RANGES[b.getAttribute('data-value')].label);
    });
    LB.ui.setSeg(els.seg, range);
    if (model && model.kind === 'line') model.prevLabel = t('chartPrevClose');
  }

  function compact(v) {
    if (v == null || !isFinite(v)) return '—';
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return String(Math.round(v));
  }

  function updateTip() {
    var tip = els.tip;
    if (hover == null || !layout || !model || !model.points[hover]) { tip.hidden = true; return; }
    var p = model.points[hover];
    var row = function (k, v, cls) { return '<span class="tip-k">' + esc(k) + '</span><span class="tip-v' + (cls ? ' ' + cls : '') + '">' + esc(v) + '</span>'; };
    var html;
    if (model.kind === 'line') {
      var chg = model.prevClose > 0 ? ((p.price - model.prevClose) / model.prevClose) * 100 : null;
      html = '<span class="tip-head">' + esc(LB.chart.fmtTime(p.t)) + '</span>' +
        row(t('price'), fmt.money(p.price, currency)) +
        (chg != null ? row(t('change'), fmt.pct(chg), fmt.tone(chg)) : '') +
        row(t('chartVolume'), compact(p.volume));
    } else {
      var tone = fmt.tone(p.close - p.open);
      html = '<span class="tip-head">' + esc(LB.chart.fmtDate(p.t)) + '</span>' +
        row(t('chartOpen'), fmt.number(p.open, 2)) +
        row(t('chartHigh'), fmt.number(p.high, 2)) +
        row(t('chartLow'), fmt.number(p.low, 2)) +
        row(t('chartClose'), fmt.number(p.close, 2), tone) +
        row(t('chartVolume'), compact(p.volume));
    }
    tip.innerHTML = html;
    tip.hidden = false;
    var x = layout.x(hover);
    var tw = tip.offsetWidth;
    var left = x + 10;
    if (left + tw > els.wrap.clientWidth) left = x - 10 - tw;
    tip.style.left = Math.max(0, Math.round(left)) + 'px';
  }

  // ------------------------------------------------------------------ events
  function schedule() {
    if (frame) return;
    frame = global.requestAnimationFrame(function () {
      frame = 0;
      if (status !== 'ready') return;
      layout = LB.chart.draw(els.canvas, model, hover);
      updateTip();
    });
  }

  function onMove(e) {
    if (!layout) return;
    var rect = els.canvas.getBoundingClientRect();
    var idx = layout.idxAt(e.clientX - rect.left);
    if (idx === hover) return;
    hover = idx;
    schedule();
  }

  function onLeave() {
    if (hover == null) return;
    hover = null;
    schedule();
  }

  function onResize() {
    if (!visible()) return;
    if (needsLoad) load();
    else if (status === 'ready') paint();
  }

  function redraw() {
    if (root && status === 'ready' && visible()) paint();
  }

  function setRange(v) {
    if (!RANGES[v] || v === range) return;
    range = v;
    LB.storage.set('lb_chartRange', v);
    hover = null;
    data = null;
    model = null;
    if (!root) return;
    LB.ui.setSeg(els.seg, range);
    if (symbol) requestLoad();
  }

  // ------------------------------------------------------------------ public
  /** Attach the card into `slot` for position `pos`; loads only when something changed. */
  function mount(slot, pos) {
    if (!root) build();
    if (root.parentNode !== slot) slot.appendChild(root);
    currency = pos.currency || fmt.currencyOf(pos);
    labels();
    var m = S.demoMode ? 'demo' : 'live';
    if (pos.symbol !== symbol || m !== mode) {
      symbol = pos.symbol;
      mode = m;
      hover = null;
      data = null;
      model = null;
      status = 'idle';
      paint();
      requestLoad();
    } else if (needsLoad) {
      requestLoad();
    } else {
      caption();
    }
  }

  function unmount() {
    if (root && root.parentNode) root.parentNode.removeChild(root);
    token += 1;
    symbol = null;
    needsLoad = false;
  }

  /** Re-read the cached series (after a quote tick or an intraday refresh) and redraw. */
  function refresh() {
    if (!root || !symbol || needsLoad) return;
    var d = rangeData(true);
    if (d && visible()) setData(d);
  }

  LB.bus.on('seg:chartRange', setRange);
  LB.bus.on('theme', redraw);
  if (global.matchMedia) {
    var mq = global.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', redraw);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);

  LB.chartCard = {
    mount: mount,
    unmount: unmount,
    refresh: refresh,
    redraw: redraw,
    wantsIntraday: function (sym) { return range === 'today' && sym === symbol && visible(); },
    range: function () { return range; }
  };
})(window);
