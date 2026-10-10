/* Application state, localStorage persistence and a tiny event bus. */
(function (global) {
  'use strict';
  var LB = global.LB = global.LB || {};

  // ---- storage (every access guarded: private windows, blocked storage) ----
  var storage = {
    get: function (key, fallback) {
      try {
        var v = global.localStorage.getItem(key);
        return v == null ? fallback : v;
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { global.localStorage.setItem(key, String(value)); } catch (e) { /* ignore */ }
    },
    remove: function (key) {
      try { global.localStorage.removeItem(key); } catch (e) { /* ignore */ }
    },
    getJSON: function (key, fallback) {
      try {
        var raw = global.localStorage.getItem(key);
        if (!raw) return fallback;
        var v = JSON.parse(raw);
        return v == null ? fallback : v;
      } catch (e) { return fallback; }
    },
    setJSON: function (key, value) {
      try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    }
  };

  // ---- event bus ----
  var handlers = {};
  var bus = {
    on: function (evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); },
    emit: function (evt, data) { (handlers[evt] || []).slice().forEach(function (fn) { fn(data); }); }
  };

  var VIEWS = ['positions', 'orders', 'settings'];
  var savedView = storage.get('lb_view', 'positions');
  var savedTheme = storage.get('theme', 'system');

  var state = {
    view: VIEWS.indexOf(savedView) >= 0 ? savedView : 'positions',
    tab: 'liquidate',                                  // liquidate | conditional | buyback
    demoMode: storage.get('demoMode', 'true') !== 'false', // default ON for safety
    theme: (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'system',
    sidebarOpen: storage.get('lb_sidebarOpen', 'true') !== 'false',
    detailsOpen: storage.get('lb_detailsOpen', 'true') !== 'false',
    detailsPeek: false,
    ordersDetails: false,  // transient: details panel open in Orders (never persisted)

    positions: [],          // normalised positions
    positionsLoaded: false,
    loading: false,
    loadError: null,
    selected: new Set(),    // symbols included in actions
    active: null,           // symbol shown in the details panel
    filter: '',

    ratios: { liquidate: 1, buyback: 1, conditional: 1 },
    cond: { type: 'stop-loss', pct: '5', tif: 'Day' },
    busy: null,             // 'liquidate' | 'buyback' | 'conditional' while a request runs

    server: 'checking',     // checking | ok | down | error
    serverError: null,
    version: '',
    lastUpdated: null,

    orderFilter: 'all',
    selectedOrderId: null,
    settingsSection: 'account'
  };

  var CRED_KEYS = ['appKey', 'appSecret', 'accessToken'];

  function creds() {
    return {
      app_key: storage.get('lb_appKey', '').trim(),
      app_secret: storage.get('lb_appSecret', '').trim(),
      access_token: storage.get('lb_accessToken', '').trim()
    };
  }

  function hasCreds() {
    var c = creds();
    return !!(c.app_key && c.app_secret && c.access_token);
  }

  // ---- liquidation snapshot (for buy back) ----
  var snapshot = {
    get: function () {
      var v = storage.getJSON('lastLiquidatedPositions', []);
      return Array.isArray(v) ? v.filter(function (p) { return p && p.symbol && p.quantity > 0; }) : [];
    },
    set: function (list) {
      if (!list.length) storage.remove('lastLiquidatedPositions');
      else storage.setJSON('lastLiquidatedPositions', list);
    },
    clear: function () { storage.remove('lastLiquidatedPositions'); }
  };

  // ---- order history ----
  var HISTORY_KEY = 'lb_orderHistory';
  var HISTORY_CAP = 500;
  var seq = 0;
  var history = {
    list: function () {
      var v = storage.getJSON(HISTORY_KEY, []);
      return Array.isArray(v) ? v : [];
    },
    add: function (entries) {
      if (!entries || !entries.length) return;
      var now = Date.now();
      var stamped = entries.map(function (e) {
        seq += 1;
        var entry = { id: now.toString(36) + '-' + seq.toString(36) + '-' + Math.random().toString(36).slice(2, 6), ts: now };
        Object.keys(e).forEach(function (k) { if (e[k] !== undefined) entry[k] = e[k]; });
        return entry;
      });
      var next = stamped.concat(history.list()).slice(0, HISTORY_CAP);
      storage.setJSON(HISTORY_KEY, next);
      bus.emit('history');
    },
    clear: function () {
      storage.remove(HISTORY_KEY);
      bus.emit('history');
    },
    forSymbol: function (symbol, limit) {
      return history.list().filter(function (e) { return e.symbol === symbol; }).slice(0, limit || 5);
    }
  };

  LB.storage = storage;
  LB.bus = bus;
  LB.state = state;
  LB.VIEWS = VIEWS;
  LB.CRED_KEYS = CRED_KEYS;
  LB.creds = creds;
  LB.hasCreds = hasCreds;
  LB.snapshot = snapshot;
  LB.history = history;
  LB.delay = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
})(window);
