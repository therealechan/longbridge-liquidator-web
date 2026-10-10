/* Positions: the sidebar list and account summary, the Liquidate /
   Conditional / Buy back tabs, the details panel, and every trading flow
   (confirm modal → request → success / partial-failure handling). */
(function (global) {
  'use strict';
  var LB = global.LB;
  var S = LB.state;
  var fmt = LB.fmt;
  var esc = fmt.escape;
  var t = function (k, v) { return LB.t(k, v); };
  var $ = function (id) { return document.getElementById(id); };

  // ------------------------------------------------------------------ demo data
  var MOCK = [
    { symbol: 'AAPL.US', symbol_name: 'Apple Inc.', quantity: 100, available_quantity: 100, cost_price: 172.40, market_price: 185.50, prev_close: 183.20, currency: 'USD' },
    { symbol: 'TSLA.US', symbol_name: 'Tesla, Inc.', quantity: 50, available_quantity: 50, cost_price: 258.10, market_price: 242.30, prev_close: 248.50, currency: 'USD' },
    { symbol: 'NVDA.US', symbol_name: 'NVIDIA Corporation', quantity: 25, available_quantity: 25, cost_price: 612.35, market_price: 875.20, prev_close: 875.20, currency: 'USD' },
    { symbol: '00700.HK', symbol_name: 'Tencent Holdings Ltd.', quantity: 200, available_quantity: 200, cost_price: 342.80, market_price: 385.60, prev_close: 380.00, currency: 'HKD' }
  ];

  function num(v, fallback) {
    if (v === null || v === undefined || v === '') return fallback;
    var n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  /** Accept the new response shape and fall back gracefully for the old one. */
  function normalize(p) {
    var qty = num(p.quantity, 0);
    var out = {
      symbol: String(p.symbol || ''),
      symbol_name: p.symbol_name || p.symbolName || p.name || '',
      quantity: qty,
      available_quantity: num(p.available_quantity != null ? p.available_quantity : p.availableQuantity, qty),
      cost_price: num(p.cost_price != null ? p.cost_price : p.costPrice, 0),
      market_price: num(p.market_price != null ? p.market_price : p.marketPrice, 0),
      prev_close: num(p.prev_close != null ? p.prev_close : p.prevClose, null),
      currency: null
    };
    out.currency = fmt.currencyOf({ symbol: out.symbol, currency: p.currency });
    if (!out.symbol_name) out.symbol_name = out.symbol;
    return out;
  }

  // ------------------------------------------------------------------ selectors
  function visiblePositions() {
    var q = S.filter.trim().toLowerCase();
    if (!q) return S.positions;
    return S.positions.filter(function (p) {
      return p.symbol.toLowerCase().indexOf(q) >= 0 || p.symbol_name.toLowerCase().indexOf(q) >= 0;
    });
  }
  function selectedPositions() {
    return S.positions.filter(function (p) { return S.selected.has(p.symbol); });
  }
  function activePosition() {
    for (var i = 0; i < S.positions.length; i++) if (S.positions[i].symbol === S.active) return S.positions[i];
    return null;
  }
  function priceFor(symbol) {
    for (var i = 0; i < S.positions.length; i++) if (S.positions[i].symbol === symbol) return S.positions[i];
    if (S.demoMode) for (var j = 0; j < MOCK.length; j++) if (MOCK[j].symbol === symbol) return MOCK[j];
    return null;
  }
  function condPct() { return parseFloat(S.cond.pct) || 0; }
  function condPctValid() { var pct = condPct(); return pct > 0 && pct < 100; }
  function condTypeLabel(type) {
    return type === 'stop-loss' ? t('stopLoss') : type === 'take-profit' ? t('takeProfit') : t('trailingStop');
  }
  function modeBadge() {
    return S.demoMode
      ? '<span class="badge badge-demo">' + esc(t('demoShort')) + '</span>'
      : '<span class="badge badge-live">' + esc(t('liveShort')) + '</span>';
  }

  /** Live mode can't do anything until the server is up and credentials exist. */
  function blockingState() {
    if (S.demoMode) return null;
    if (S.server === 'error') {
      return { icon: 'alert-triangle', error: true, title: t('serverErrorTitle'), desc: S.serverError || t('serverDown'), action: { label: t('retry'), action: 'retry_health', icon: 'refresh-cw' } };
    }
    if (S.server === 'down') {
      return { icon: 'alert-triangle', error: true, title: t('serverDown'), desc: t('serverStartingDesc'), action: { label: t('retry'), action: 'retry_health', icon: 'refresh-cw' } };
    }
    if (S.server !== 'ok') return { spinner: true, title: t('serverStarting'), desc: t('serverStartingDesc') };
    if (!LB.hasCreds()) {
      return { icon: 'plug', title: t('connectTitle'), desc: t('connectDesc'), action: { label: t('openSettings'), action: 'open_account_settings', primary: true, icon: 'settings' } };
    }
    return null;
  }

  /** State of the position data for the Liquidate / Conditional tabs. */
  function dataState() {
    if (!S.positionsLoaded) {
      if (S.loading) return { spinner: true, title: t('loadingPositions') };
      if (S.loadError) return { icon: 'alert-circle', error: true, title: t('loadErrorTitle'), desc: S.loadError, action: { label: t('retry'), action: 'load_positions', icon: 'refresh-cw' } };
      return { icon: 'bar-chart-3', title: t('loadPositionsTitle'), desc: t('loadPositionsDesc'), action: { label: t('viewPositions'), action: 'load_positions', primary: true, icon: 'bar-chart-3' } };
    }
    if (!S.positions.length) {
      return { icon: 'inbox', title: t('noPositions'), desc: t('noPositionsDesc'), action: LB.snapshot.get().length ? { label: t('goBuyback'), action: 'go_buyback', icon: 'shopping-cart' } : null };
    }
    if (!selectedPositions().length) return { icon: 'list-checks', title: t('nothingSelectedTitle'), desc: t('nothingSelectedDesc') };
    return null;
  }

  // ------------------------------------------------------------------ data
  function resetData() {
    S.positions = [];
    S.positionsLoaded = false;
    S.loadError = null;
    S.selected = new Set();
    S.active = null;
    S.lastUpdated = null;
  }

  function applyPositions(list, keepSelection) {
    var prev = S.selected;
    var first = !S.positionsLoaded || !keepSelection;
    S.positions = list;
    S.selected = new Set(list.filter(function (p) { return first || prev.has(p.symbol); }).map(function (p) { return p.symbol; }));
    if (!list.some(function (p) { return p.symbol === S.active; })) S.active = list.length ? list[0].symbol : null;
    S.positionsLoaded = true;
    S.loadError = null;
    S.lastUpdated = Date.now();
    LB.bus.emit('positions');
  }

  /**
   * Load positions. opts.user: user-initiated (errors open the error modal,
   * as the original "View Positions" button did); otherwise errors toast.
   */
  async function fetchPositions(opts) {
    opts = opts || {};
    if (S.loading) return;
    var keep = S.positionsLoaded;

    if (S.demoMode) {
      S.loading = true;
      LB.render();
      await LB.delay(600);
      if (!S.demoMode) { S.loading = false; LB.render(); return; }
      applyPositions(MOCK.map(function (p) { return Object.assign({}, p); }), keep);
      S.loading = false;
      LB.render();
      return;
    }

    if (!LB.hasCreds()) {
      if (opts.user) LB.modals.error(t('apiRequired'));
      LB.render();
      return;
    }

    S.loading = true;
    LB.render();
    try {
      var data = await LB.api.positions(LB.creds());
      if (S.demoMode) return;                       // mode switched mid-flight
      applyPositions((data.positions || []).map(normalize), keep);
    } catch (err) {
      if (S.demoMode) return;
      S.loadError = err.message;
      if (opts.user) LB.modals.error(err.message);
      else LB.toast(err.message, 'error', t('toastLoadFailed'));
    } finally {
      S.loading = false;
      LB.render();
    }
  }

  function autoLoad() {
    if (S.demoMode) { fetchPositions(); return; }
    if (S.server === 'ok' && LB.hasCreds() && !S.positionsLoaded && !S.loading) fetchPositions();
  }

  // ------------------------------------------------------------------ mode
  function setMode(demo) {
    S.demoMode = demo;
    LB.storage.set('demoMode', demo ? 'true' : 'false');
    resetData();
    S.ratios.liquidate = S.ratios.buyback = S.ratios.conditional = 1;
    LB.render();
    autoLoad();
  }

  function requestMode(mode) {
    if (mode === 'live' && S.demoMode) {
      LB.modals.liveWarning(function () { setMode(false); });
    } else if (mode === 'demo' && !S.demoMode) {
      setMode(true);
    }
  }

  // ------------------------------------------------------------------ selection
  function toggleSymbol(symbol, on) {
    if (on == null) on = !S.selected.has(symbol);
    if (on) S.selected.add(symbol); else S.selected.delete(symbol);
    LB.render();
  }

  function selectAllVisible(on) {
    visiblePositions().forEach(function (p) {
      if (on) S.selected.add(p.symbol); else S.selected.delete(p.symbol);
    });
    LB.render();
  }

  function moveActive(delta) {
    var list = visiblePositions();
    if (!list.length) return;
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].symbol === S.active) idx = i;
    idx = idx < 0 ? 0 : Math.min(list.length - 1, Math.max(0, idx + delta));
    S.active = list[idx].symbol;
    LB.render();
    var row = document.querySelector('.pos-row.is-active');
    if (row) row.scrollIntoView({ block: 'nearest' });
  }

  // ------------------------------------------------------------------ sidebar rendering
  function renderSummary() {
    var el = $('accountSummary');
    var head = '<div class="summary-head"><span>' + esc(t('totalMarketValue')) + '</span><span>' + esc(t('dailyPnl')) + '</span></div>';
    if (!S.positionsLoaded || !S.positions.length) {
      el.innerHTML = head + '<div class="summary-empty">' + (S.loading && !S.positionsLoaded ? '<span class="skel" style="width:120px;height:14px"></span>' : '—') + '</div>';
      return;
    }
    var totals = fmt.sumByCurrency(S.positions, function (p) { return p.quantity * p.market_price; });
    var pnl = {};
    fmt.sumByCurrency(S.positions, function (p) {
      if (p.prev_close == null || !(p.prev_close > 0)) return null;
      return (p.market_price - p.prev_close) * p.quantity;
    }).forEach(function (s) { pnl[s.currency] = s.value; });
    el.innerHTML = head + totals.map(function (s) {
      var d = pnl[s.currency];
      return '<div class="summary-line">' +
        '<span class="cur">' + esc(s.currency) + '</span>' +
        '<span class="val selectable">' + esc(fmt.money(s.value, s.currency)) + '</span>' +
        '<span class="pnl ' + fmt.tone(d) + '">' + (d == null ? '—' : esc(fmt.signedMoney(d, s.currency))) + '</span>' +
        '</div>';
    }).join('');
  }

  function renderList() {
    var list = $('posList');
    var caption = $('posCaption');
    var selectAll = $('selectAll');
    var vis = visiblePositions();

    if (!S.positionsLoaded) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      selectAll.disabled = true;
      if (S.loading) {
        caption.textContent = t('loading');
        var sk = '';
        for (var i = 0; i < 6; i++) {
          sk += '<div class="skel-row"><span class="skel skel-box"></span><div class="skel-lines"><span class="skel" style="width:' + (50 + (i * 13) % 30) + '%"></span><span class="skel" style="width:' + (30 + (i * 17) % 35) + '%;height:8px"></span></div><div class="skel-side"><span class="skel" style="width:56px"></span><span class="skel" style="width:36px;height:8px"></span></div></div>';
        }
        list.innerHTML = sk;
      } else {
        caption.textContent = t('notLoaded');
        list.innerHTML = '<div class="list-empty">' + esc(S.loadError ? t('loadErrorTitle') : '—') + '</div>';
      }
      return;
    }

    var selCount = selectedPositions().length;
    caption.textContent = t('nPositions', { n: S.positions.length }) + ' · ' + t('nSelected', { n: selCount });
    var visSel = vis.filter(function (p) { return S.selected.has(p.symbol); }).length;
    selectAll.disabled = vis.length === 0;
    selectAll.checked = vis.length > 0 && visSel === vis.length;
    selectAll.indeterminate = visSel > 0 && visSel < vis.length;

    if (!vis.length) {
      list.innerHTML = '<div class="list-empty">' + esc(S.positions.length ? t('noMatches') : t('noPositions')) + '</div>';
      return;
    }

    list.innerHTML = vis.map(function (p) {
      var ch = fmt.change(p);
      var checked = S.selected.has(p.symbol);
      var active = p.symbol === S.active;
      return '<div class="pos-row' + (checked ? ' is-checked' : '') + (active ? ' is-active' : '') + '" role="option" aria-selected="' + (active ? 'true' : 'false') + '" data-symbol="' + esc(p.symbol) + '">' +
        '<label class="cb"><input type="checkbox" tabindex="-1"' + (checked ? ' checked' : '') + ' aria-label="' + esc(p.symbol) + '"></label>' +
        '<div class="pos-main"><div class="pos-sym">' + esc(p.symbol) + '</div><div class="pos-name" title="' + esc(p.symbol_name) + '">' + esc(p.symbol_name) + '</div></div>' +
        '<canvas class="pos-spark" width="48" height="16" aria-hidden="true" data-spark="' + esc(p.symbol) + '"></canvas>' +
        '<div class="pos-side"><div class="pos-price"><span class="pos-px">' + esc(fmt.money(p.market_price, p.currency)) + '</span>' +
          '<span class="chg ' + fmt.tone(ch && ch.abs) + '">' + (ch ? esc(fmt.pct(ch.pct)) : '—') + '</span></div>' +
          '<div class="pos-qty">' + esc(fmt.qty(p.quantity) + t('shareUnit')) + '</div></div>' +
        '</div>';
    }).join('');
    if (LB.quotes) LB.quotes.paintSparks();
  }

  function renderSidebar() {
    LB.ui.setSeg('modeSeg', S.demoMode ? 'demo' : 'live');
    $('demoNote').hidden = !S.demoMode;
    renderSummary();
    renderList();
  }

  // ------------------------------------------------------------------ main rendering
  function tableHtml(head, rows, foot) {
    return '<div class="table-wrap"><table class="table"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody>' +
      (foot ? '<tfoot><tr>' + foot + '</tr></tfoot>' : '') + '</table></div>';
  }
  function symCell(p) {
    return '<td><span class="cell-sym">' + esc(p.symbol) + '</span>' +
      (p.symbol_name && p.symbol_name !== p.symbol ? '<span class="cell-sub">' + esc(p.symbol_name) + '</span>' : '') + '</td>';
  }
  function totalsCell(sums) {
    return sums.map(function (s) { return esc(fmt.money(s.value, s.currency)); }).join('<br>');
  }

  function renderSelStrip(blocked) {
    var el = $('selStrip');
    if (blocked) { el.hidden = true; return; }
    if (S.tab === 'buyback') {
      var snap = LB.snapshot.get();
      el.hidden = false;
      el.innerHTML = '<strong>' + esc(t('nInRecord', { n: snap.length })) + '</strong>' + modeBadge();
      return;
    }
    if (!S.positionsLoaded || !S.positions.length) { el.hidden = true; return; }
    var ratio = S.tab === 'conditional' ? S.ratios.conditional : S.ratios.liquidate;
    var sel = selectedPositions();
    var sums = fmt.sumByCurrency(sel, function (p) { return fmt.adjustedQty(p.quantity, ratio) * p.market_price; });
    el.hidden = false;
    el.innerHTML = '<strong>' + esc(t('nSelected', { n: sel.length })) + '</strong>' +
      (sel.length ? '<span class="sep">·</span><span>' + esc(t('estValue')) + '</span>' +
        sums.map(function (s) { return '<span class="mono">' + esc(fmt.money(s.value, s.currency)) + '</span>'; }).join('<span class="sep">·</span>') : '') +
      (ratio < 1 ? '<span class="sep">·</span><span>' + esc(t('ratioLabel', { ratio: fmt.ratioLabel(ratio) })) + '</span>' : '') +
      modeBadge();
  }

  function renderLiquidate() {
    LB.ui.setSeg('liqRatio', S.ratios.liquidate);
    var ds = dataState();
    $('liqToolbar').hidden = !!ds;
    if (ds) { $('liqContent').innerHTML = LB.ui.empty(ds); return; }
    var ratio = S.ratios.liquidate;
    var sel = selectedPositions();
    var rows = sel.map(function (p) {
      var q = fmt.adjustedQty(p.quantity, ratio);
      return '<tr data-sym="' + esc(p.symbol) + '">' + symCell(p) +
        '<td class="r mono">' + esc(fmt.qty(q)) + (q !== p.quantity ? ' <span class="cell-muted">/ ' + esc(fmt.qty(p.quantity)) + '</span>' : '') + '</td>' +
        '<td class="r mono" data-c="price">' + esc(fmt.money(p.market_price, p.currency)) + '</td>' +
        '<td class="r mono" data-c="value">' + esc(fmt.money(q * p.market_price, p.currency)) + '</td></tr>';
    }).join('');
    var sums = fmt.sumByCurrency(sel, function (p) { return fmt.adjustedQty(p.quantity, ratio) * p.market_price; });
    $('liqContent').innerHTML = tableHtml(
      '<th>' + esc(t('symbol')) + '</th><th class="r">' + esc(t('colQtyToSell')) + '</th><th class="r">' + esc(t('price')) + '</th><th class="r">' + esc(t('estValue')) + '</th>',
      rows,
      '<td colspan="3">' + esc(t('total')) + '</td><td class="r mono" data-c="total">' + totalsCell(sums) + '</td>'
    );
  }

  function condRows() {
    var pct = condPct();
    var ratio = S.ratios.conditional;
    var type = S.cond.type;
    return selectedPositions().map(function (p) {
      var row = { pos: p, qty: fmt.adjustedQty(p.quantity, ratio), trigger: null };
      if (type !== 'trailing-stop') {
        var factor = type === 'stop-loss' ? (1 - pct / 100) : (1 + pct / 100);
        row.trigger = parseFloat((p.market_price * factor).toFixed(2));
      }
      return row;
    });
  }

  function triggerHtml(row) {
    if (S.cond.type === 'trailing-stop') return esc(t('condTrailingPct') + ': ' + condPct() + '%');
    return '<span class="' + (S.cond.type === 'stop-loss' ? 'neg' : 'pos') + '">' + esc(fmt.money(row.trigger, row.pos.currency)) + '</span>';
  }

  function renderConditional() {
    LB.ui.setSeg('condType', S.cond.type);
    LB.ui.setSeg('condTif', S.cond.tif);
    LB.ui.setSeg('condRatio', S.ratios.conditional);
    var ds = dataState();
    $('condForm').hidden = !!ds;
    $('condBlocked').innerHTML = ds ? LB.ui.empty(ds) : '';
    $('panelConditional').querySelector('.section-label').hidden = !!ds;
    if (ds) { $('condPreview').innerHTML = ''; return; }

    var valid = condPctValid();
    var input = $('condPct');
    input.setAttribute('aria-invalid', valid ? 'false' : 'true');
    var pctHelp = $('condPctHelp');
    pctHelp.textContent = valid ? t('condPctHelp') : t('condPctInvalid');
    pctHelp.classList.toggle('is-error', !valid);
    var helpKey = S.cond.type === 'stop-loss' ? 'condHelpStopLoss' : S.cond.type === 'take-profit' ? 'condHelpTakeProfit' : 'condHelpTrailing';
    $('condTypeHelp').textContent = t(helpKey, { pct: valid ? condPct() : '—' });

    var head = '<th>' + esc(t('symbol')) + '</th><th class="r">' + esc(t('condCurrentPrice')) + '</th><th class="r">' +
      esc(S.cond.type === 'trailing-stop' ? t('condTrailingPct') : t('condTriggerPrice')) + '</th><th class="r">' + esc(t('quantity')) + '</th>';
    var rows;
    if (!valid) {
      rows = '<tr><td colspan="4" class="c cell-muted">—</td></tr>';
    } else {
      rows = condRows().map(function (r) {
        return '<tr data-sym="' + esc(r.pos.symbol) + '">' + symCell(r.pos) +
          '<td class="r mono" data-c="price">' + esc(fmt.money(r.pos.market_price, r.pos.currency)) + '</td>' +
          '<td class="r mono" data-c="trigger">' + triggerHtml(r) + '</td>' +
          '<td class="r mono">' + esc(fmt.qty(r.qty)) + '</td></tr>';
      }).join('');
    }
    $('condPreview').innerHTML = tableHtml(head, rows);
  }

  function renderBuyback() {
    LB.ui.setSeg('bbRatio', S.ratios.buyback);
    var snap = LB.snapshot.get();
    $('bbToolbar').hidden = !snap.length;
    if (!snap.length) {
      $('bbContent').innerHTML = LB.ui.empty({ icon: 'shopping-cart', title: t('bbEmptyTitle'), desc: t('bbEmptyDesc') });
      return;
    }
    var ratio = S.ratios.buyback;
    var rows = snap.map(function (s) {
      var q = fmt.adjustedQty(s.quantity, ratio);
      var ref = priceFor(s.symbol);
      var cur = fmt.currencyOf(ref || s);
      var price = ref ? ref.market_price : null;
      return '<tr data-sym="' + esc(s.symbol) + '">' + symCell({ symbol: s.symbol, symbol_name: ref ? ref.symbol_name : '' }) +
        '<td class="r mono">' + esc(fmt.qty(q)) + '</td>' +
        '<td class="r mono cell-muted">' + esc(fmt.qty(s.quantity)) + '</td>' +
        '<td class="r mono" data-c="price">' + (price != null ? esc(fmt.money(price, cur)) : '—') + '</td>' +
        '<td class="r mono" data-c="value">' + (price != null ? esc(fmt.money(price * q, cur)) : '—') + '</td></tr>';
    }).join('');
    $('bbContent').innerHTML = tableHtml(
      '<th>' + esc(t('symbol')) + '</th><th class="r">' + esc(t('colQtyToBuy')) + '</th><th class="r">' + esc(t('colRecorded')) + '</th><th class="r">' + esc(t('colLastPrice')) + '</th><th class="r">' + esc(t('estValue')) + '</th>',
      rows
    ) + '<p class="help">' + esc(t('buybackPriceNote')) + '</p>';
  }

  function busyButton(cls) {
    return '<button type="button" class="btn btn-lg ' + cls + '" disabled><span class="spinner"></span><span>' + esc(t('loading')) + '</span></button>';
  }

  function renderActionBar(blocked) {
    var bar = $('actionBar');
    if (blocked) { bar.hidden = true; return; }
    bar.hidden = false;
    var hint = '';
    var buttons = '';
    var busyOther = S.busy && S.busy !== S.tab;
    if (S.tab === 'liquidate') {
      var canSell = S.positionsLoaded && selectedPositions().length > 0 && !S.busy;
      hint = (S.positionsLoaded && S.positions.length && !selectedPositions().length)
        ? '<i data-lucide="info"></i><span>' + esc(t('hintSelect')) + '</span>'
        : '<i data-lucide="alert-circle"></i><span>' + esc(t('marketOrderWarning')) + '</span>';
      buttons = S.busy === 'liquidate' ? busyButton('btn-danger') :
        '<button type="button" class="btn btn-lg btn-danger" data-action="primary"' + (canSell ? '' : ' disabled') + '><i data-lucide="zap"></i><span>' + esc(t('sellSelected')) + '</span><kbd>⌘↩</kbd></button>';
    } else if (S.tab === 'conditional') {
      var valid = condPctValid();
      var canCond = S.positionsLoaded && selectedPositions().length > 0 && valid && !S.busy;
      hint = !valid && S.positionsLoaded
        ? '<i data-lucide="alert-circle"></i><span>' + esc(t('condPctInvalid')) + '</span>'
        : (S.positionsLoaded && S.positions.length && !selectedPositions().length)
          ? '<i data-lucide="info"></i><span>' + esc(t('hintSelect')) + '</span>'
          : '<i data-lucide="shield"></i><span>' + esc(t('condWarning')) + '</span>';
      buttons = S.busy === 'conditional' ? busyButton('btn-primary') :
        '<button type="button" class="btn btn-lg btn-primary" data-action="primary"' + (canCond ? '' : ' disabled') + '><i data-lucide="shield"></i><span>' + esc(t('condSubmit')) + '</span><kbd>⌘↩</kbd></button>';
    } else {
      var snap = LB.snapshot.get();
      var canBuy = snap.length > 0 && !S.busy;
      hint = '<i data-lucide="info"></i><span>' + esc(t('buybackPriceNote')) + '</span>';
      buttons = (snap.length ? '<button type="button" class="btn btn-outline" data-action="clear_snapshot"' + (S.busy ? ' disabled' : '') + '><i data-lucide="trash-2"></i><span>' + esc(t('clearSnapshot')) + '</span></button>' : '') +
        (S.busy === 'buyback' ? busyButton('btn-success') :
          '<button type="button" class="btn btn-lg btn-success" data-action="primary"' + (canBuy ? '' : ' disabled') + '><i data-lucide="shopping-cart"></i><span>' + esc(t('buybackAtMarket')) + '</span><kbd>⌘↩</kbd></button>');
    }
    if (busyOther) hint = '<span class="spinner"></span><span>' + esc(t('loading')) + '</span>';
    $('actionHint').innerHTML = hint;
    $('actionButtons').innerHTML = buttons;
  }

  function renderMain() {
    document.querySelectorAll('#posTabs .tab').forEach(function (b) {
      var on = b.getAttribute('data-tab') === S.tab;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('[data-tabpanel]').forEach(function (p) {
      p.hidden = p.getAttribute('data-tabpanel') !== S.tab;
    });
    var snapCount = LB.snapshot.get().length;
    var badge = $('buybackBadge');
    badge.hidden = !snapCount;
    badge.textContent = snapCount;

    var refresh = $('refreshBtn');
    refresh.classList.toggle('is-loading', S.loading);
    refresh.disabled = S.loading;

    var block = blockingState();
    var stateEl = $('posState');
    stateEl.hidden = !block;
    stateEl.innerHTML = block ? LB.ui.empty(block) : '';
    $('posBody').hidden = !!block;
    renderSelStrip(!!block);
    renderActionBar(!!block);
    if (block) return;

    if (S.tab === 'liquidate') renderLiquidate();
    else if (S.tab === 'conditional') renderConditional();
    else renderBuyback();
  }

  // ------------------------------------------------------------------ details panel
  function stat(label, value, cls, sub) {
    return '<div class="stat"><div class="stat-label">' + esc(label) + '</div><div class="stat-value ' + (cls || '') + '">' + value + '</div>' +
      (sub ? '<div class="stat-sub ' + (cls || '') + '">' + sub + '</div>' : '') + '</div>';
  }

  /** The big price + day change; re-rendered on its own by quote ticks. */
  function priceBlockHtml(p) {
    var ch = fmt.change(p);
    return '<span class="big selectable">' + esc(fmt.money(p.market_price, p.currency)) + '</span>' +
      '<span class="chg ' + fmt.tone(ch && ch.abs) + '">' + (ch ? esc(fmt.signed(ch.abs) + ' (' + fmt.pct(ch.pct) + ')') : '—') + '</span>';
  }

  /** The 2x3 stat grid; re-rendered on its own by quote ticks. */
  function statGridHtml(p) {
    var cur = p.currency;
    var ch = fmt.change(p);
    var value = p.quantity * p.market_price;
    var hasCost = p.cost_price > 0;
    var unreal = hasCost ? p.quantity * (p.market_price - p.cost_price) : null;
    var unrealPct = hasCost ? ((p.market_price - p.cost_price) / p.cost_price) * 100 : null;
    var dayChg = ch ? ch.abs * p.quantity : null;
    return stat(t('quantity'), esc(fmt.qty(p.quantity))) +
      stat(t('statAvailable'), esc(fmt.qty(p.available_quantity))) +
      stat(t('statCost'), hasCost ? esc(fmt.money(p.cost_price, cur)) : '—') +
      stat(t('value'), esc(fmt.money(value, cur))) +
      stat(t('statUnrealized'), unreal == null ? '—' : esc(fmt.signedMoney(unreal, cur)), fmt.tone(unreal), unrealPct == null ? '' : esc(fmt.pct(unrealPct))) +
      stat(t('statDayChange'), dayChg == null ? '—' : esc(fmt.signedMoney(dayChg, cur)), fmt.tone(dayChg), ch ? esc(fmt.pct(ch.pct)) : '');
  }

  function renderDetails() {
    var body = $('detailsBody');
    var p = activePosition();
    if (!p) {
      if (LB.chartCard) LB.chartCard.unmount();
      body.innerHTML = LB.ui.empty({ icon: 'panel-right', title: t('detailsEmptyTitle'), desc: t('detailsEmptyDesc'), compact: true });
      return;
    }
    var cur = p.currency;
    var included = S.selected.has(p.symbol);

    var orders = LB.history.forSymbol(p.symbol, 5);
    var ordersHtml = orders.length
      ? '<ul class="mini-orders">' + orders.map(function (o) {
          return '<li class="mini-order"><span class="badge badge-' + esc(o.action) + '">' + esc(LB.orders.actionLabel(o.action)) + '</span>' +
            '<span class="when">' + esc(fmt.stamp(o.ts)) + '</span>' +
            '<span class="ord-status"><span class="dot ' + LB.orders.statusDot(o.status) + '"></span>' + esc(LB.orders.statusLabel(o.status)) + '</span>' +
            '<span class="qty">' + esc(fmt.qty(o.quantity)) + '</span></li>';
        }).join('') + '</ul>'
      : '<p class="dt-empty-line">' + esc(t('noOrdersForSymbol')) + '</p>';

    body.innerHTML = '<div class="dt">' +
      '<div class="dt-head"><div class="dt-sym-row"><span class="dt-sym selectable">' + esc(p.symbol) + '</span><span class="badge">' + esc(cur) + '</span></div>' +
        '<div class="dt-name selectable">' + esc(p.symbol_name) + '</div></div>' +
      '<div class="dt-price">' + priceBlockHtml(p) + '</div>' +
      '<div class="dt-chart-slot"></div>' +
      '<div class="stat-grid">' + statGridHtml(p) + '</div>' +
      '<button type="button" class="btn btn-outline btn-sm" data-action="toggle_active_selection"><i data-lucide="' + (included ? 'minus-circle' : 'plus-circle') + '"></i><span>' + esc(t(included ? 'excludeFromSelection' : 'includeInSelection')) + '</span></button>' +
      '<div class="dt-section-title">' + esc(t('recentOrders')) + '</div>' + ordersHtml +
      '</div>';
    if (LB.chartCard) LB.chartCard.mount(body.querySelector('.dt-chart-slot'), p);
  }

  // ------------------------------------------------------------------ live price updates
  // Quote ticks change only prices. Rather than re-rendering (which would
  // drop text selection and rebuild tables), patch just the numbers.
  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }
  function setHtml(el, html) {
    if (el && el._html !== html) { el.innerHTML = html; el._html = html; }
  }
  function setTone(el, value) {
    if (!el) return;
    var tone = fmt.tone(value);
    ['pos', 'neg', 'flat'].forEach(function (c) { el.classList.toggle(c, c === tone); });
  }
  function bySymbol(symbol) {
    for (var i = 0; i < S.positions.length; i++) if (S.positions[i].symbol === symbol) return S.positions[i];
    return null;
  }

  function updatePrices() {
    renderSummary();

    document.querySelectorAll('#posList .pos-row[data-symbol]').forEach(function (row) {
      var p = bySymbol(row.getAttribute('data-symbol'));
      if (!p) return;
      var ch = fmt.change(p);
      setText(row.querySelector('.pos-px'), fmt.money(p.market_price, p.currency));
      var chg = row.querySelector('.pos-price .chg');
      setText(chg, ch ? fmt.pct(ch.pct) : '—');
      setTone(chg, ch && ch.abs);
    });

    if (S.view === 'positions' && !blockingState()) {
      renderSelStrip(false);
      if (S.tab === 'liquidate' && !dataState()) {
        var ratio = S.ratios.liquidate;
        $('liqContent').querySelectorAll('tr[data-sym]').forEach(function (tr) {
          var p = bySymbol(tr.getAttribute('data-sym'));
          if (!p) return;
          setText(tr.querySelector('[data-c="price"]'), fmt.money(p.market_price, p.currency));
          setText(tr.querySelector('[data-c="value"]'), fmt.money(fmt.adjustedQty(p.quantity, ratio) * p.market_price, p.currency));
        });
        setHtml($('liqContent').querySelector('[data-c="total"]'),
          totalsCell(fmt.sumByCurrency(selectedPositions(), function (p) { return fmt.adjustedQty(p.quantity, ratio) * p.market_price; })));
      } else if (S.tab === 'conditional' && !dataState() && condPctValid()) {
        var rows = {};
        condRows().forEach(function (r) { rows[r.pos.symbol] = r; });
        $('condPreview').querySelectorAll('tr[data-sym]').forEach(function (tr) {
          var r = rows[tr.getAttribute('data-sym')];
          if (!r) return;
          setText(tr.querySelector('[data-c="price"]'), fmt.money(r.pos.market_price, r.pos.currency));
          setHtml(tr.querySelector('[data-c="trigger"]'), triggerHtml(r));
        });
      } else if (S.tab === 'buyback') {
        var bbRatio = S.ratios.buyback;
        var snap = {};
        LB.snapshot.get().forEach(function (s) { snap[s.symbol] = s; });
        $('bbContent').querySelectorAll('tr[data-sym]').forEach(function (tr) {
          var s = snap[tr.getAttribute('data-sym')];
          var ref = s && priceFor(s.symbol);
          if (!ref) return;
          var cur = fmt.currencyOf(ref);
          setText(tr.querySelector('[data-c="price"]'), fmt.money(ref.market_price, cur));
          setText(tr.querySelector('[data-c="value"]'), fmt.money(ref.market_price * fmt.adjustedQty(s.quantity, bbRatio), cur));
        });
      }
    }

    var p = activePosition();
    var body = $('detailsBody');
    if (p && body.querySelector('.dt')) {
      setHtml(body.querySelector('.dt-price'), priceBlockHtml(p));
      setHtml(body.querySelector('.stat-grid'), statGridHtml(p));
    }
  }

  function render() {
    renderSidebar();
    renderMain();
    renderDetails();
  }

  // ------------------------------------------------------------------ confirm modals
  function openLiquidate() {
    var sel = selectedPositions();
    if (!sel.length || S.busy) return;
    var ratio = S.ratios.liquidate;
    $('liqModalMeta').innerHTML = modeBadge() + '<span class="badge">' + esc(t('ratioLabel', { ratio: fmt.ratioLabel(ratio) })) + '</span>';
    $('liqModalList').innerHTML = sel.map(function (p) {
      var q = fmt.adjustedQty(p.quantity, ratio);
      return '<div class="modal-list-row"><span><span class="sym">' + esc(p.symbol) + '</span> <span class="qty">× ' + esc(fmt.qty(q)) + '</span></span>' +
        '<span class="val">' + esc(fmt.money(q * p.market_price, p.currency)) + '</span></div>';
    }).join('');
    var sums = fmt.sumByCurrency(sel, function (p) { return fmt.adjustedQty(p.quantity, ratio) * p.market_price; });
    $('liqModalTotal').innerHTML = totalsCell(sums);
    LB.modals.open('liquidateModal', { onConfirm: runLiquidate });
  }

  function openBuyback() {
    var snap = LB.snapshot.get();
    if (!snap.length || S.busy) return;
    var ratio = S.ratios.buyback;
    $('bbModalMeta').innerHTML = modeBadge() + '<span class="badge">' + esc(t('ratioLabel', { ratio: fmt.ratioLabel(ratio) })) + '</span>';
    $('bbModalList').innerHTML = snap.map(function (p) {
      return '<div class="modal-list-row"><span class="sym">' + esc(p.symbol) + '</span><span class="qty">' + esc(fmt.qty(fmt.adjustedQty(p.quantity, ratio)) + t('shareUnit')) + '</span></div>';
    }).join('');
    var unit = t('stockUnit');
    $('bbModalTotal').textContent = snap.length + (unit ? ' ' + unit : '');
    LB.modals.open('buybackModal', { onConfirm: runBuyback });
  }

  function openConditional() {
    if (!selectedPositions().length || !condPctValid() || S.busy) return;
    var tifLabel = S.cond.tif === 'GoodTilCanceled' ? t('condTifGtc') : t('condTifDay');
    $('condModalMeta').innerHTML = modeBadge() +
      '<span class="badge">' + esc(condTypeLabel(S.cond.type)) + '</span>' +
      '<span class="badge">' + esc(condPct() + '%') + '</span>' +
      '<span class="badge">' + esc(tifLabel) + '</span>' +
      '<span class="badge">' + esc(t('ratioLabel', { ratio: fmt.ratioLabel(S.ratios.conditional) })) + '</span>';
    $('condModalList').innerHTML = condRows().map(function (r) {
      var info = S.cond.type === 'trailing-stop'
        ? esc(t('condTrailingPct') + ': ' + condPct() + '%')
        : esc(fmt.money(r.pos.market_price, r.pos.currency)) + ' → ' + triggerHtml(r);
      return '<div class="modal-list-row"><span><span class="sym">' + esc(r.pos.symbol) + '</span> <span class="qty">× ' + esc(fmt.qty(r.qty)) + '</span></span><span class="val">' + info + '</span></div>';
    }).join('');
    LB.modals.open('conditionalModal', { onConfirm: runConditional });
  }

  function primary() {
    if (S.view !== 'positions' || blockingState()) return;
    if (S.tab === 'liquidate') openLiquidate();
    else if (S.tab === 'conditional') openConditional();
    else openBuyback();
  }

  // ------------------------------------------------------------------ result helpers
  function recordResults(action, items, data, extra) {
    // items: [{ symbol, quantity }]; data: server response or null (demo); extra(item) adds fields
    var mode = S.demoMode ? 'demo' : 'live';
    var byResult = {};
    ((data && data.results) || []).forEach(function (r) { byResult[r.symbol] = r; });
    LB.history.add(items.map(function (it) {
      var entry = { action: action, symbol: it.symbol, quantity: it.quantity, mode: mode };
      Object.assign(entry, extra(it));
      if (!data) entry.status = 'demo';
      else {
        var r = byResult[it.symbol];
        if (r && r.success) { entry.status = 'submitted'; entry.orderId = r.orderId; }
        else { entry.status = 'failed'; entry.error = r ? r.error : 'No result returned'; }
      }
      return entry;
    }));
  }

  function recordFailure(action, items, message, extra) {
    var mode = S.demoMode ? 'demo' : 'live';
    LB.history.add(items.map(function (it) {
      return Object.assign({ action: action, symbol: it.symbol, quantity: it.quantity, mode: mode, status: 'failed', error: message }, extra(it));
    }));
  }

  function toastOutcome(key, okCount, failCount) {
    if (okCount) LB.toast(S.demoMode ? t('toastDemoNote') : '', 'success', t(key, { n: okCount }));
    if (failCount) LB.toast('', 'error', t('toastFailed', { n: failCount }));
  }

  function failedMessage(prefixKey, results) {
    return t(prefixKey) + '\n' + results.map(function (r) { return r.symbol + ': ' + r.error; }).join('\n');
  }

  // ------------------------------------------------------------------ liquidate
  async function runLiquidate() {
    var ratio = S.ratios.liquidate;
    var sold = selectedPositions().map(function (p) { return Object.assign({}, p, { sellQty: fmt.adjustedQty(p.quantity, ratio) }); });
    if (!sold.length) return;
    var items = sold.map(function (p) { return { symbol: p.symbol, quantity: p.sellQty }; });
    var extra = function () { return { orderType: 'MO' }; };
    S.busy = 'liquidate';
    LB.render();
    try {
      if (S.demoMode) {
        await LB.delay(800);
        recordResults('sell', items, null, extra);
        handleLiquidateSuccess(sold);
        toastOutcome('toastSold', sold.length, 0);
        return;
      }
      var data = await LB.api.liquidate(LB.creds(), items);
      recordResults('sell', items, data, extra);
      var results = data.results || [];
      var ok = new Set(results.filter(function (r) { return r.success; }).map(function (r) { return r.symbol; }));
      var failed = results.filter(function (r) { return !r.success; });
      var succeeded = sold.filter(function (p) { return ok.has(p.symbol); });
      if (succeeded.length) handleLiquidateSuccess(succeeded);
      if (failed.length) LB.modals.error(failedMessage('partialFailure', failed));
      toastOutcome('toastSold', succeeded.length, failed.length);
    } catch (err) {
      recordFailure('sell', items, err.message, extra);
      LB.modals.error(err.message);
    } finally {
      S.busy = null;
      LB.render();
    }
  }

  function handleLiquidateSuccess(sold) {
    var soldQty = {};
    sold.forEach(function (p) { soldQty[p.symbol] = p.sellQty || p.quantity; });

    // Save the sold quantities for buy back (merged with any earlier record).
    var merged = LB.snapshot.get();
    sold.forEach(function (p) {
      var q = p.sellQty || p.quantity;
      var hit = null;
      for (var i = 0; i < merged.length; i++) if (merged[i].symbol === p.symbol) hit = merged[i];
      if (hit) hit.quantity += q;
      else merged.push({ symbol: p.symbol, quantity: q });
    });
    LB.snapshot.set(merged);

    // Reduce or remove the sold positions.
    S.positions.forEach(function (p) {
      var q = soldQty[p.symbol];
      if (q != null) {
        p.quantity -= q;
        p.available_quantity = Math.max(0, Math.min(p.available_quantity - q, p.quantity));
      }
    });
    S.positions = S.positions.filter(function (p) { return p.quantity > 0; });
    S.selected = new Set();
    if (!S.positions.some(function (p) { return p.symbol === S.active; })) S.active = S.positions.length ? S.positions[0].symbol : null;
    S.ratios.liquidate = 1;

    var display = sold.map(function (p) { return Object.assign({}, p, { quantity: p.sellQty || p.quantity }); });
    var unit = t('stockUnit');
    var sums = fmt.sumByCurrency(display, function (p) { return p.quantity * p.market_price; });
    var html =
      '<div class="modal-list">' + display.map(function (p) {
        return '<div class="modal-list-row"><span><span class="sym">' + esc(p.symbol) + '</span> <span class="qty">× ' + esc(fmt.qty(p.quantity)) + '</span></span>' +
          '<span class="val">' + esc(fmt.money(p.quantity * p.market_price, p.currency)) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="modal-total"><span>' + esc(t('soldCount') + ': ' + display.length + (unit ? ' ' + unit : '')) + '</span><span class="val pos">' + totalsCell(sums) + '</span></div>';
    LB.render();
    LB.modals.success(t('success'), html);
  }

  // ------------------------------------------------------------------ buy back
  async function runBuyback() {
    var ratio = S.ratios.buyback;
    var snap = LB.snapshot.get();
    if (!snap.length) return;
    var buy = snap.map(function (p) { return Object.assign({}, p, { buyQty: fmt.adjustedQty(p.quantity, ratio) }); });
    var items = buy.map(function (p) { return { symbol: p.symbol, quantity: p.buyQty }; });
    var extra = function () { return { orderType: 'MO' }; };
    S.busy = 'buyback';
    LB.render();
    try {
      if (S.demoMode) {
        await LB.delay(800);
        recordResults('buy', items, null, extra);
        handleBuybackSuccess(buy);
        toastOutcome('toastBought', buy.length, 0);
        return;
      }
      var data = await LB.api.buyback(LB.creds(), items);
      recordResults('buy', items, data, extra);
      var results = data.results || [];
      var ok = new Set(results.filter(function (r) { return r.success; }).map(function (r) { return r.symbol; }));
      var failed = results.filter(function (r) { return !r.success; });
      var succeeded = buy.filter(function (p) { return ok.has(p.symbol); });
      if (succeeded.length) handleBuybackSuccess(succeeded);
      if (failed.length) LB.modals.error(failedMessage('buybackPartialFailure', failed));
      toastOutcome('toastBought', succeeded.length, failed.length);
    } catch (err) {
      recordFailure('buy', items, err.message, extra);
      LB.modals.error(err.message);
    } finally {
      S.busy = null;
      LB.render();
    }
  }

  function handleBuybackSuccess(bought) {
    var boughtQty = {};
    bought.forEach(function (p) { boughtQty[p.symbol] = p.buyQty || p.quantity; });

    // Reduce or remove bought-back entries from the record.
    var remaining = [];
    LB.snapshot.get().forEach(function (p) {
      var q = boughtQty[p.symbol];
      if (q != null) {
        var left = p.quantity - q;
        if (left > 0) remaining.push({ symbol: p.symbol, quantity: left });
      } else {
        remaining.push(p);
      }
    });
    LB.snapshot.set(remaining);
    S.ratios.buyback = 1;

    var unit = t('stockUnit');
    var html =
      '<div class="success-big"><div class="label">' + esc(t('boughtCount')) + '</div><div class="value pos">' + esc(bought.length + (unit ? ' ' + unit : '')) + '</div></div>' +
      '<div class="modal-list">' + bought.map(function (p) {
        return '<div class="modal-list-row"><span class="sym">' + esc(p.symbol) + '</span><span class="qty">× ' + esc(fmt.qty(p.buyQty || p.quantity)) + '</span></div>';
      }).join('') + '</div>';

    if (!S.demoMode) {
      setTimeout(function () { fetchPositions(); }, 1000);
    } else {
      bought.forEach(function (p) {
        var q = p.buyQty || p.quantity;
        var existing = null;
        for (var i = 0; i < S.positions.length; i++) if (S.positions[i].symbol === p.symbol) existing = S.positions[i];
        if (existing) {
          existing.quantity += q;
          existing.available_quantity += q;
        } else {
          for (var j = 0; j < MOCK.length; j++) {
            if (MOCK[j].symbol === p.symbol) S.positions.push(Object.assign({}, MOCK[j], { quantity: q, available_quantity: q }));
          }
        }
      });
      if (!S.active && S.positions.length) S.active = S.positions[0].symbol;
    }
    LB.render();
    LB.modals.success(t('buybackSuccess'), html);
  }

  // ------------------------------------------------------------------ conditional
  async function runConditional() {
    if (!condPctValid()) return;
    var pct = condPct();
    var ratio = S.ratios.conditional;
    var type = S.cond.type;
    var tif = S.cond.tif;
    var sel = selectedPositions();
    if (!sel.length) return;
    var orderPositions = sel.map(function (p) {
      return { symbol: p.symbol, quantity: fmt.adjustedQty(p.quantity, ratio), currentPrice: p.market_price };
    });
    var extra = function (it) {
      var e = { orderType: type === 'trailing-stop' ? 'TSMPCT' : 'MIT', conditionalType: type, tif: tif };
      if (type === 'trailing-stop') e.trailingPercent = pct;
      else {
        var factor = type === 'stop-loss' ? (1 - pct / 100) : (1 + pct / 100);
        e.triggerPrice = +(it.currentPrice * factor).toFixed(4);
      }
      return e;
    };
    S.busy = 'conditional';
    LB.render();
    try {
      if (S.demoMode) {
        await LB.delay(800);
        recordResults('conditional', orderPositions, null, extra);
        handleConditionalSuccess(orderPositions, type, pct);
        toastOutcome('toastCond', orderPositions.length, 0);
        return;
      }
      var data = await LB.api.conditional(LB.creds(), orderPositions, { type: type, percentage: pct, timeInForce: tif });
      recordResults('conditional', orderPositions, data, extra);
      var results = data.results || [];
      var succeeded = orderPositions.filter(function (p) {
        return results.some(function (r) { return r.success && r.symbol === p.symbol; });
      });
      var failed = results.filter(function (r) { return !r.success; });
      if (succeeded.length) handleConditionalSuccess(succeeded, type, pct);
      if (failed.length) LB.modals.error(failedMessage('condPartialFailure', failed));
      toastOutcome('toastCond', succeeded.length, failed.length);
    } catch (err) {
      recordFailure('conditional', orderPositions, err.message, extra);
      LB.modals.error(err.message);
    } finally {
      S.busy = null;
      LB.render();
    }
  }

  function handleConditionalSuccess(positions, type, pct) {
    var cur = function (p) { return fmt.currencyOf(priceFor(p.symbol) || p); };
    var html =
      '<div class="success-big"><div class="label">' + esc(t('condOrderCount')) + '</div><div class="value">' + esc(positions.length + ' × ' + condTypeLabel(type)) + '</div></div>' +
      '<div class="modal-list">' + positions.map(function (p) {
        var info;
        if (type === 'trailing-stop') info = t('condTrailingPct') + ': ' + pct + '%';
        else {
          var factor = type === 'stop-loss' ? (1 - pct / 100) : (1 + pct / 100);
          info = fmt.money(p.currentPrice, cur(p)) + ' → ' + fmt.money(parseFloat((p.currentPrice * factor).toFixed(2)), cur(p));
        }
        return '<div class="modal-list-row"><span><span class="sym">' + esc(p.symbol) + '</span> <span class="qty">× ' + esc(fmt.qty(p.quantity)) + '</span></span><span class="val">' + esc(info) + '</span></div>';
      }).join('') + '</div>';
    S.ratios.conditional = 1;
    LB.render();
    LB.modals.success(t('condSuccess'), html);
  }

  // ------------------------------------------------------------------ wiring
  function init() {
    $('posList').addEventListener('click', function (e) {
      if (e.target.closest('.cb')) return;
      var row = e.target.closest('.pos-row');
      if (!row) return;
      S.active = row.getAttribute('data-symbol');
      LB.render();
    });
    $('posList').addEventListener('dblclick', function (e) {
      if (e.target.closest('.cb')) return;
      var row = e.target.closest('.pos-row');
      if (row) toggleSymbol(row.getAttribute('data-symbol'));
    });
    $('posList').addEventListener('change', function (e) {
      if (!e.target.matches('input[type="checkbox"]')) return;
      var row = e.target.closest('.pos-row');
      if (row) toggleSymbol(row.getAttribute('data-symbol'), e.target.checked);
    });
    $('selectAll').addEventListener('change', function (e) { selectAllVisible(e.target.checked); });

    var filter = $('posFilter');
    filter.addEventListener('input', function () { S.filter = filter.value; renderSidebar(); LB.icons(); });
    filter.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && filter.value) { e.stopPropagation(); filter.value = ''; S.filter = ''; renderSidebar(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); filter.blur(); moveActive(1); }
    });

    $('posTabs').addEventListener('click', function (e) {
      var tab = e.target.closest('.tab');
      if (!tab) return;
      S.tab = tab.getAttribute('data-tab');
      LB.render();
    });

    var pctInput = $('condPct');
    pctInput.value = S.cond.pct;
    pctInput.addEventListener('input', function () {
      S.cond.pct = pctInput.value;
      renderMain();
      LB.icons();
    });

    LB.bus.on('seg:mode', requestMode);
    LB.bus.on('seg:liqRatio', function (v) { S.ratios.liquidate = parseFloat(v); LB.render(); });
    LB.bus.on('seg:bbRatio', function (v) { S.ratios.buyback = parseFloat(v); LB.render(); });
    LB.bus.on('seg:condRatio', function (v) { S.ratios.conditional = parseFloat(v); LB.render(); });
    LB.bus.on('seg:condType', function (v) { S.cond.type = v; LB.render(); });
    LB.bus.on('seg:condTif', function (v) { S.cond.tif = v; LB.render(); });

    LB.bus.on('action', function (a) {
      switch (a.action) {
        case 'refresh': refresh(true); break;
        case 'primary': primary(); break;
        case 'load_positions':
          if (S.view !== 'positions') LB.shell.setView('positions');
          fetchPositions({ user: true });
          break;
        case 'go_buyback': S.tab = 'buyback'; LB.render(); break;
        case 'clear_snapshot':
          LB.modals.confirm({
            title: t('clearSnapshotTitle'),
            text: t('clearSnapshotText'),
            confirmLabel: t('clearSnapshot'),
            onConfirm: function () { LB.snapshot.clear(); LB.render(); LB.toast('', 'success', t('snapshotCleared')); }
          });
          break;
        case 'toggle_active_selection':
          if (S.active) toggleSymbol(S.active);
          break;
      }
    });

    LB.bus.on('render', render);
    LB.bus.on('history', function () { renderDetails(); LB.icons(); });
  }

  function refresh(user) {
    if (S.loading) return;
    fetchPositions({ user: !!user });
  }

  LB.positions = {
    init: init,
    fetch: fetchPositions,
    refresh: refresh,
    autoLoad: autoLoad,
    requestMode: requestMode,
    moveActive: moveActive,
    toggleActive: function () { if (S.active) toggleSymbol(S.active); },
    selectAll: function () { selectAllVisible(true); },
    primary: primary,
    normalize: normalize,
    updatePrices: updatePrices,
    /** Use a /api/positions response obtained elsewhere (Settings → Test connection). */
    ingest: function (data) {
      if (S.demoMode) return;
      applyPositions((data.positions || []).map(normalize), S.positionsLoaded);
      LB.render();
    },
    _mock: MOCK
  };
})(window);
