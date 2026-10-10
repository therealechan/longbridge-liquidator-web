/* Number, currency and time formatting, plus small pure helpers. */
(function (global) {
  'use strict';
  var LB = global.LB = global.LB || {};

  var cache = {};
  function nf(key, opts) {
    if (!cache[key]) cache[key] = new Intl.NumberFormat('en-US', opts);
    return cache[key];
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  var fmt = {
    /** Settlement currency from the symbol suffix (as the original app did). */
    currencyFromSymbol: function (symbol) {
      if (typeof symbol !== 'string') return 'USD';
      if (/\.HK$/.test(symbol)) return 'HKD';
      if (/\.SG$/.test(symbol)) return 'SGD';
      return 'USD';
    },

    currencyOf: function (pos) {
      if (pos && typeof pos.currency === 'string' && /^[A-Z]{3}$/.test(pos.currency)) return pos.currency;
      return fmt.currencyFromSymbol(pos && pos.symbol);
    },

    money: function (value, currency) {
      var cur = currency || 'USD';
      if (value == null || !isFinite(value)) return '—';
      try {
        return nf('c:' + cur, { style: 'currency', currency: cur }).format(value);
      } catch (e) {
        return cur + ' ' + fmt.number(value, 2);
      }
    },

    signedMoney: function (value, currency) {
      if (value == null || !isFinite(value)) return '—';
      return (value > 0 ? '+' : '') + fmt.money(value, currency);
    },

    number: function (value, digits) {
      if (value == null || !isFinite(value)) return '—';
      var d = digits == null ? 2 : digits;
      return nf('n:' + d, { minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
    },

    qty: function (value) {
      if (value == null || !isFinite(value)) return '—';
      return nf('q', { maximumFractionDigits: 4 }).format(value);
    },

    signed: function (value, digits) {
      if (value == null || !isFinite(value)) return '—';
      return (value > 0 ? '+' : '') + Number(value).toFixed(digits == null ? 2 : digits);
    },

    pct: function (value) {
      if (value == null || !isFinite(value)) return '—';
      return (value > 0 ? '+' : '') + value.toFixed(2) + '%';
    },

    tone: function (value) {
      if (value == null || !isFinite(value) || value === 0) return 'flat';
      return value > 0 ? 'pos' : 'neg';
    },

    /** Day change for a position, or null when prev_close is unknown. */
    change: function (pos) {
      if (pos.prev_close == null || !(pos.prev_close > 0)) return null;
      var abs = pos.market_price - pos.prev_close;
      return { abs: abs, pct: (abs / pos.prev_close) * 100 };
    },

    /** Quantity for a ratio (All / 1/2 / 1/3 / 1/4): at least 1 share. */
    adjustedQty: function (qty, ratio) {
      if (ratio >= 1) return qty;
      return Math.max(1, Math.floor(qty * ratio));
    },

    /** Sum fn(item) per currency, preserving first-seen order. */
    sumByCurrency: function (items, fn, currencyFn) {
      var order = [];
      var map = {};
      items.forEach(function (item) {
        var cur = currencyFn ? currencyFn(item) : fmt.currencyOf(item);
        var v = fn(item);
        if (v == null || !isFinite(v)) return;
        if (!(cur in map)) { map[cur] = 0; order.push(cur); }
        map[cur] += v;
      });
      return order.map(function (cur) { return { currency: cur, value: map[cur] }; });
    },

    /** "$1,234.00 · HK$5,678.00" */
    joinMoney: function (sums, signed) {
      if (!sums.length) return fmt.money(0, 'USD');
      return sums.map(function (s) {
        return signed ? fmt.signedMoney(s.value, s.currency) : fmt.money(s.value, s.currency);
      }).join(' · ');
    },

    time: function (ts) {
      var d = new Date(ts);
      return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    },

    dateTime: function (ts) {
      var d = new Date(ts);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + fmt.time(ts);
    },

    /** Time today, or "MM-DD HH:MM" for older entries. */
    stamp: function (ts) {
      var d = new Date(ts);
      var now = new Date();
      if (d.toDateString() === now.toDateString()) return fmt.time(ts);
      return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    },

    escape: function (str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    ratioLabel: function (ratio) {
      if (ratio >= 1) return LB.t('ratioAll');
      if (Math.abs(ratio - 0.5) < 0.01) return LB.t('ratioHalf');
      if (Math.abs(ratio - 1 / 3) < 0.01) return LB.t('ratioThird');
      return LB.t('ratioQuarter');
    }
  };

  LB.fmt = fmt;
})(window);
