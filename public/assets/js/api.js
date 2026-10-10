/* HTTP client for the local Express server (127.0.0.1:3456). */
(function (global) {
  'use strict';
  var LB = global.LB = global.LB || {};

  // Served by Express → same origin. Loaded from tauri:// → talk to the sidecar directly.
  var API_BASE = global.location.protocol.indexOf('http') === 0 ? '' : 'http://127.0.0.1:3456';

  /** POST JSON; read the body as text first so an empty or HTML body gives a clear error. */
  async function post(path, body, fallbackError) {
    var resp = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var text = await resp.text();
    if (!text) throw new Error('Empty response from server');
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('Invalid JSON response: ' + text.substring(0, 100));
    }
    if (!resp.ok) throw new Error(data.error || fallbackError || 'API request failed');
    return data;
  }

  async function health() {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 2500) : null;
    try {
      var resp = await fetch(API_BASE + '/api/health', { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  LB.api = {
    base: API_BASE,
    health: health,
    positions: function (creds) {
      return post('/api/positions', creds, 'API request failed');
    },
    liquidate: function (creds, positions) {
      return post('/api/liquidate', Object.assign({}, creds, { positions: positions }), 'Liquidation request failed');
    },
    buyback: function (creds, positions) {
      return post('/api/buyback', Object.assign({}, creds, { positions: positions }), 'Buy back request failed');
    },
    conditional: function (creds, positions, orderConfig) {
      return post('/api/conditional-order', Object.assign({}, creds, { positions: positions, orderConfig: orderConfig }), 'Conditional order request failed');
    }
  };
})(window);
