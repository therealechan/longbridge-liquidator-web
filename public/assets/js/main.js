/* Boot: translate, restore UI state, wire views, bridge Tauri, poll the
   local server, and load positions when it makes sense. */
(function (global) {
  'use strict';
  var LB = global.LB;
  var S = LB.state;
  var t = function (k, v) { return LB.t(k, v); };

  var healthTimer = null;
  var failures = 0;

  async function checkHealth() {
    clearTimeout(healthTimer);
    var wasOk = S.server === 'ok';
    try {
      var data = await LB.api.health();
      if (!data || data.status !== 'ok') throw new Error('unhealthy');
      failures = 0;
      if (data.version && !S.version) S.version = String(data.version);
      if (!wasOk) {
        S.server = 'ok';
        S.serverError = null;
        LB.render();
        LB.positions.autoLoad();
      }
      healthTimer = setTimeout(checkHealth, 15000);
    } catch (e) {
      failures += 1;
      if (S.server !== 'error') {
        var next = (wasOk || failures >= 20) ? 'down' : 'checking';
        if (next !== S.server) { S.server = next; LB.render(); }
      }
      healthTimer = setTimeout(checkHealth, 1000);
    }
  }

  function boot() {
    document.documentElement.setAttribute('lang', LB.i18n.getLang());
    LB.i18n.apply();
    LB.shell.setTheme(S.theme);

    LB.positions.init();
    LB.orders.init();
    LB.settings.init();

    LB.bus.on('lang', function () { LB.render(); });
    LB.bus.on('action', function (a) {
      if (a.action === 'retry_health') {
        failures = 0;
        S.server = 'checking';
        S.serverError = null;
        LB.render();
        checkHealth();
      }
    });

    // Re-render when the OS appearance flips while following the system.
    if (global.matchMedia) {
      var mq = global.matchMedia('(prefers-color-scheme: dark)');
      var onScheme = function () { if (S.theme === 'system') LB.shell.renderChrome(); };
      if (mq.addEventListener) mq.addEventListener('change', onScheme);
    }

    // Tauri: native menu actions and sidecar errors.
    LB.tauri.listen('menu', function (e) { if (e && e.payload) LB.dispatchAction(String(e.payload)); });
    LB.tauri.listen('server-error', function (e) {
      var msg = e && e.payload != null ? (typeof e.payload === 'string' ? e.payload : (e.payload.message || JSON.stringify(e.payload))) : t('serverDown');
      S.server = 'error';
      S.serverError = msg;
      LB.render();
      LB.toast(msg, 'error', t('serverErrorTitle'));
    });
    LB.tauri.getVersion().then(function (v) { if (v) { S.version = String(v); LB.shell.renderChrome(); } });

    // Keep the window from navigating if something is dropped onto it.
    global.addEventListener('dragover', function (e) { e.preventDefault(); });
    global.addEventListener('drop', function (e) { e.preventDefault(); });

    LB.render();
    checkHealth();
    if (S.demoMode) LB.positions.autoLoad();
  }

  LB.main = { checkHealth: checkHealth };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
