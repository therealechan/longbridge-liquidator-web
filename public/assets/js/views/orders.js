/* Orders: the local order history (lb_orderHistory) — filter chips and list
   in the sidebar, a detail card or the full table in main. */
(function (global) {
  'use strict';
  var LB = global.LB;
  var S = LB.state;
  var fmt = LB.fmt;
  var esc = fmt.escape;
  var t = function (k, v) { return LB.t(k, v); };
  var $ = function (id) { return document.getElementById(id); };

  function actionLabel(a) {
    return t(a === 'sell' ? 'actionSell' : a === 'buy' ? 'actionBuy' : 'actionConditional');
  }
  function statusLabel(s) {
    return t(s === 'submitted' ? 'statusSubmitted' : s === 'failed' ? 'statusFailed' : 'statusDemo');
  }
  function statusDot(s) {
    return s === 'submitted' ? 'is-ok' : s === 'failed' ? 'is-error' : '';
  }
  function orderTypeLabel(o) {
    var key = 'orderType' + (o.orderType || 'MO');
    var label = t(key);
    return label === key ? String(o.orderType || '') : label;
  }
  function condLabel(type) {
    return type === 'stop-loss' ? t('stopLoss') : type === 'take-profit' ? t('takeProfit') : type === 'trailing-stop' ? t('trailingStop') : '';
  }
  function tifLabel(tif) {
    return tif === 'GoodTilCanceled' ? t('condTifGtc') : tif ? t('condTifDay') : '';
  }
  function currencyFor(o) { return fmt.currencyFromSymbol(o.symbol); }

  function filtered(list) {
    if (S.orderFilter === 'all') return list;
    return list.filter(function (o) { return o.action === S.orderFilter; });
  }

  function find(id) {
    var list = LB.history.list();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // ---------------------------------------------------------------- sidebar
  function renderSidebar(all) {
    var counts = { all: all.length, sell: 0, buy: 0, conditional: 0 };
    all.forEach(function (o) { if (counts[o.action] != null) counts[o.action] += 1; });
    document.querySelectorAll('#orderChips .chip').forEach(function (chip) {
      var f = chip.getAttribute('data-filter');
      var on = f === S.orderFilter;
      chip.classList.toggle('is-active', on);
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', on ? 'true' : 'false');
      chip.querySelector('.chip-count').textContent = counts[f] || '';
    });

    var list = filtered(all);
    $('ordersCaption').textContent = t('nOrders', { n: list.length });
    var el = $('ordersList');
    if (!list.length) {
      el.innerHTML = '<div class="list-empty">' + esc(all.length ? t('noOrdersFilter') : t('ordersEmptyTitle')) + '</div>';
      return;
    }
    el.innerHTML = list.map(function (o) {
      var meta = fmt.stamp(o.ts) + ' · ' + orderTypeLabel(o) + (o.mode === 'demo' ? ' · ' + t('demoShort') : '');
      return '<div class="ord-row' + (o.id === S.selectedOrderId ? ' is-active' : '') + '" role="option" data-id="' + esc(o.id) + '">' +
        '<span class="badge badge-' + esc(o.action) + '">' + esc(actionLabel(o.action)) + '</span>' +
        '<div class="ord-main"><div class="ord-sym">' + esc(o.symbol) + '</div><div class="ord-meta">' + esc(meta) + '</div></div>' +
        '<div class="ord-side"><div class="ord-qty">' + esc(fmt.qty(o.quantity)) + '</div>' +
        '<div class="ord-status"><span class="dot ' + statusDot(o.status) + '"></span>' + esc(statusLabel(o.status)) + '</div></div>' +
        '</div>';
    }).join('');
  }

  // ---------------------------------------------------------------- main
  function detailHtml(o) {
    var rows = [
      [t('colTime'), fmt.dateTime(o.ts)],
      [t('colAction'), actionLabel(o.action)],
      [t('symbol'), o.symbol],
      [t('quantity'), fmt.qty(o.quantity)],
      [t('fieldOrderType'), orderTypeLabel(o)]
    ];
    if (o.conditionalType) rows.push([t('fieldCondition'), condLabel(o.conditionalType)]);
    if (o.triggerPrice != null) rows.push([t('condTriggerPrice'), fmt.money(o.triggerPrice, currencyFor(o))]);
    if (o.trailingPercent != null) rows.push([t('condTrailingPct'), o.trailingPercent + '%']);
    if (o.tif) rows.push([t('condTimeInForce'), tifLabel(o.tif)]);
    rows.push([t('fieldMode'), o.mode === 'live' ? t('liveMode') : t('demoMode')]);
    rows.push([t('colStatus'), statusLabel(o.status)]);
    if (o.orderId) rows.push([t('colOrderId'), o.orderId]);
    var dl = rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
    if (o.error) dl += '<dt>' + esc(t('error')) + '</dt><dd class="is-error">' + esc(o.error) + '</dd>';

    return '<div class="orders-page">' +
      '<div><button type="button" class="btn btn-ghost btn-sm" data-action="orders_all"><i data-lucide="arrow-left"></i><span>' + esc(t('allOrders')) + '</span></button></div>' +
      '<div class="order-card">' +
        '<div class="order-card-head"><span class="badge badge-' + esc(o.action) + '">' + esc(actionLabel(o.action)) + '</span>' +
          '<span class="sym selectable">' + esc(o.symbol) + '</span>' +
          '<span class="badge badge-' + esc(o.status) + '">' + esc(statusLabel(o.status)) + '</span></div>' +
        '<dl class="order-detail">' + dl + '</dl>' +
      '</div></div>';
  }

  function tableHtml(list) {
    var rows = list.map(function (o) {
      return '<tr class="is-clickable" data-id="' + esc(o.id) + '">' +
        '<td class="mono cell-muted">' + esc(fmt.dateTime(o.ts)) + '</td>' +
        '<td><span class="badge badge-' + esc(o.action) + '">' + esc(actionLabel(o.action)) + '</span></td>' +
        '<td><span class="cell-sym">' + esc(o.symbol) + '</span></td>' +
        '<td class="r mono">' + esc(fmt.qty(o.quantity)) + '</td>' +
        '<td>' + esc(orderTypeLabel(o)) + '</td>' +
        '<td><span class="ord-status"><span class="dot ' + statusDot(o.status) + '"></span>' + esc(statusLabel(o.status)) + '</span></td>' +
        '<td class="mono cell-muted">' + esc(o.orderId || (o.error ? '—' : '')) + '</td></tr>';
    }).join('');
    return '<div class="orders-page"><div class="table-wrap"><table class="table"><thead><tr>' +
      '<th>' + esc(t('colTime')) + '</th><th>' + esc(t('colAction')) + '</th><th>' + esc(t('symbol')) + '</th><th class="r">' + esc(t('quantity')) + '</th>' +
      '<th>' + esc(t('colType')) + '</th><th>' + esc(t('colStatus')) + '</th><th>' + esc(t('colOrderId')) + '</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  function renderMain(all) {
    $('ordersCount').textContent = all.length ? String(all.length) : '';
    $('clearHistoryBtn').disabled = !all.length;
    var body = $('ordersBody');
    var sel = S.selectedOrderId ? find(S.selectedOrderId) : null;
    if (S.selectedOrderId && !sel) S.selectedOrderId = null;
    if (sel) { body.innerHTML = detailHtml(sel); return; }
    var list = filtered(all);
    if (!list.length) {
      body.innerHTML = LB.ui.empty(all.length
        ? { icon: 'list-filter', title: t('noOrdersFilter') }
        : { icon: 'receipt', title: t('ordersEmptyTitle'), desc: t('ordersEmptyDesc') });
      return;
    }
    body.innerHTML = tableHtml(list);
  }

  function render() {
    if (S.view !== 'orders') return;
    var all = LB.history.list();
    renderSidebar(all);
    renderMain(all);
  }

  function select(id) {
    S.selectedOrderId = S.selectedOrderId === id ? null : id;
    // Show the order's symbol in the details panel when it is still held.
    var o = S.selectedOrderId ? find(S.selectedOrderId) : null;
    if (o && S.positions.some(function (p) { return p.symbol === o.symbol; })) S.active = o.symbol;
    LB.render();
  }

  function init() {
    $('orderChips').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      S.orderFilter = chip.getAttribute('data-filter');
      S.selectedOrderId = null;
      LB.render();
    });
    $('ordersList').addEventListener('click', function (e) {
      var row = e.target.closest('.ord-row');
      if (row) select(row.getAttribute('data-id'));
    });
    $('ordersBody').addEventListener('click', function (e) {
      var row = e.target.closest('tr[data-id]');
      if (row) select(row.getAttribute('data-id'));
    });
    LB.bus.on('action', function (a) {
      if (a.action === 'orders_all') { S.selectedOrderId = null; LB.render(); }
      if (a.action === 'clear_history') {
        var n = LB.history.list().length;
        if (!n) return;
        LB.modals.confirm({
          title: t('clearHistoryTitle'),
          text: t('clearHistoryText', { n: n }),
          confirmLabel: t('clearConfirm'),
          onConfirm: function () {
            LB.history.clear();
            S.selectedOrderId = null;
            LB.render();
            LB.toast('', 'success', t('historyCleared'));
          }
        });
      }
    });
    LB.bus.on('render', render);
    LB.bus.on('history', function () { render(); LB.icons(); });
  }

  LB.orders = {
    init: init,
    actionLabel: actionLabel,
    statusLabel: statusLabel,
    statusDot: statusDot,
    moveSelection: function (delta) {
      var list = filtered(LB.history.list());
      if (!list.length) return;
      var idx = -1;
      for (var i = 0; i < list.length; i++) if (list[i].id === S.selectedOrderId) idx = i;
      idx = idx < 0 ? 0 : Math.min(list.length - 1, Math.max(0, idx + delta));
      S.selectedOrderId = list[idx].id;
      LB.render();
      var row = document.querySelector('.ord-row.is-active');
      if (row) row.scrollIntoView({ block: 'nearest' });
    }
  };
})(window);
