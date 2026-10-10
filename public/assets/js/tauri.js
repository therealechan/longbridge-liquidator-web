/* Bridge to the Tauri shell. Every call is a no-op outside Tauri. */
(function (global) {
  'use strict';
  var LB = global.LB = global.LB || {};

  function api() { return global.__TAURI__ || null; }

  LB.tauri = {
    available: function () { return !!api(); },

    listen: function (event, handler) {
      var T = api();
      if (!T || !T.event || typeof T.event.listen !== 'function') return;
      try {
        T.event.listen(event, handler);
      } catch (e) {
        console.warn('tauri listen failed', event, e);
      }
    },

    openUrl: function (url) {
      if (!/^https?:\/\//.test(url)) return;
      var T = api();
      if (T && T.opener && typeof T.opener.openUrl === 'function') {
        Promise.resolve(T.opener.openUrl(url)).catch(function () {
          global.open(url, '_blank', 'noopener');
        });
        return;
      }
      global.open(url, '_blank', 'noopener');
    },

    getVersion: function () {
      var T = api();
      if (T && T.app && typeof T.app.getVersion === 'function') {
        return Promise.resolve(T.app.getVersion()).catch(function () { return null; });
      }
      return Promise.resolve(null);
    }
  };
})(window);
