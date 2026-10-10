/* The window shell: view switching, sidebar/details toggles, theme, account
   popover, status bar, segmented controls, and the action dispatcher shared
   by clicks, keyboard shortcuts and the native menu. */
(function (global) {
  'use strict';
  var LB = global.LB = global.LB || {};
  var S = LB.state;
  var t = function (k, v) { return LB.t(k, v); };
  var NARROW = 1100;

  // ---- icons ----
  LB.icons = function () {
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      // createIcons() rescans every [data-lucide] node, and the SVGs it emits
      // keep that attribute; strip it so already-drawn icons are left alone.
      if (!document.querySelector('i[data-lucide]')) return;
      try {
        global.lucide.createIcons({ attrs: { 'stroke-width': 1.5, width: 16, height: 16 } });
      } catch (e) { console.warn('lucide', e); }
      document.querySelectorAll('svg[data-lucide]').forEach(function (svg) { svg.removeAttribute('data-lucide'); });
    }
  };

  // ---- segmented controls ----
  function setSeg(el, value) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    el.querySelectorAll('button[data-value]').forEach(function (b) {
      var v = b.getAttribute('data-value');
      var num = parseFloat(v);
      var on = (typeof value === 'number' && !isNaN(num)) ? Math.abs(num - value) < 0.01 : v === String(value);
      b.classList.toggle('is-active', on);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.segmented > button[data-value]');
    if (!btn || btn.disabled) return;
    var seg = btn.parentNode.getAttribute('data-seg');
    if (seg) LB.bus.emit('seg:' + seg, btn.getAttribute('data-value'));
  });

  // ---- view / tab ----
  function setView(view) {
    if (LB.VIEWS.indexOf(view) < 0) return;
    S.view = view;
    // Settings has no details panel; drop a transient peek so Esc isn't
    // swallowed by an invisible overlay. The persisted lb_detailsOpen flag is
    // left alone and applies again on Positions / Orders.
    if (!detailsAllowed()) S.detailsPeek = false;
    LB.storage.set('lb_view', view);
    LB.render();
  }

  function applyPanes() {
    document.querySelectorAll('[data-pane]').forEach(function (el) {
      el.hidden = el.getAttribute('data-pane') !== S.view;
    });
    document.querySelectorAll('[data-view-btn]').forEach(function (b) {
      var on = b.getAttribute('data-view-btn') === S.view;
      b.classList.toggle('is-current', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  // ---- sidebar / details ----
  /** The details panel exists for Positions and Orders only, never Settings. */
  function detailsAllowed() {
    return S.view !== 'settings';
  }

  function toggleSidebar() {
    S.sidebarOpen = !S.sidebarOpen;
    LB.storage.set('lb_sidebarOpen', S.sidebarOpen);
    renderChrome();
  }

  function toggleDetails() {
    if (!detailsAllowed()) return;  // ⌘D / menu / buttons are no-ops in Settings
    if (global.innerWidth < NARROW) {
      S.detailsPeek = !S.detailsPeek;
    } else {
      S.detailsOpen = !S.detailsOpen;
      S.detailsPeek = false;
      LB.storage.set('lb_detailsOpen', S.detailsOpen);
    }
    renderChrome();
  }

  global.addEventListener('resize', function () {
    if (S.detailsPeek && global.innerWidth >= NARROW) { S.detailsPeek = false; renderChrome(); }
  });

  // ---- theme ----
  var THEMES = ['system', 'light', 'dark'];
  function setTheme(choice) {
    if (THEMES.indexOf(choice) < 0) choice = 'system';
    S.theme = choice;
    LB.storage.set('theme', choice);
    var root = document.documentElement;
    if (choice === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', choice);
    renderChrome();
    LB.bus.emit('theme', choice);
  }
  function cycleTheme() {
    setTheme(THEMES[(THEMES.indexOf(S.theme) + 1) % THEMES.length]);
  }
  function themeName(choice) {
    return t(choice === 'light' ? 'themeLight' : choice === 'dark' ? 'themeDark' : 'themeSystem');
  }

  // ---- account popover ----
  var popover = function () { return document.getElementById('accountPopover'); };
  function openPopover() {
    var el = popover();
    el.hidden = false;
    void el.offsetWidth;
    el.classList.add('is-open');
    document.getElementById('accountBtn').setAttribute('aria-expanded', 'true');
    var first = el.querySelector('.pop-item');
    if (first) first.focus({ preventScroll: true });
  }
  function closePopover() {
    var el = popover();
    if (!el || el.hidden) return false;
    el.classList.remove('is-open');
    el.hidden = true;
    document.getElementById('accountBtn').setAttribute('aria-expanded', 'false');
    return true;
  }
  function togglePopover() {
    if (popover().hidden) openPopover(); else closePopover();
  }
  document.addEventListener('mousedown', function (e) {
    var el = popover();
    if (!el || el.hidden) return;
    if (e.target.closest('#accountPopover') || e.target.closest('#accountBtn')) return;
    closePopover();
  });

  // ---- chrome rendering (body classes, rail, status bar, popover) ----
  function renderChrome() {
    var body = document.body;
    body.classList.toggle('no-sidebar', !S.sidebarOpen);
    var detailsOk = detailsAllowed();
    body.classList.toggle('no-details', !detailsOk || !S.detailsOpen);
    body.classList.toggle('details-peek', detailsOk && S.detailsPeek);
    body.classList.toggle('is-live', !S.demoMode);
    body.setAttribute('data-theme-choice', S.theme);

    document.querySelectorAll('[data-action="toggle_sidebar"]').forEach(function (b) {
      b.classList.toggle('is-on', S.sidebarOpen);
      b.setAttribute('aria-pressed', S.sidebarOpen ? 'true' : 'false');
    });
    var detailsShown = detailsOk && (global.innerWidth < NARROW ? S.detailsPeek : S.detailsOpen);
    var dt = document.getElementById('detailsToggle');
    if (dt) {
      dt.hidden = !detailsOk;
      dt.disabled = !detailsOk;
      dt.classList.toggle('is-on', detailsShown);
      dt.setAttribute('aria-pressed', detailsShown ? 'true' : 'false');
    }

    var themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
      var tip = t('themeTip', { name: themeName(S.theme) });
      themeBtn.setAttribute('data-tip', tip);
      themeBtn.setAttribute('aria-label', tip);
    }

    // status bar
    var modeDot = document.getElementById('sbModeDot');
    var serverBad = S.server === 'error' || S.server === 'down';
    modeDot.className = 'dot' + (serverBad && !S.demoMode ? ' is-error' : (!S.demoMode ? ' is-live' : ''));
    document.getElementById('sbModeText').textContent = S.demoMode ? t('demoMode') : t('liveShort');
    var serverDot = document.getElementById('sbServerDot');
    serverDot.className = 'dot ' + (S.server === 'ok' ? 'is-ok' : S.server === 'checking' ? 'is-pending' : 'is-error');
    var serverItem = document.getElementById('sbServer');
    serverItem.title = S.server === 'ok' ? t('serverOk') : (S.serverError || t('serverDown'));
    document.getElementById('sbUpdated').textContent = S.lastUpdated ? t('updatedAt', { time: LB.fmt.time(S.lastUpdated) }) : '';
    var ver = S.version ? 'v' + S.version : '';
    document.getElementById('sbVersion').textContent = ver;

    // popover
    document.getElementById('popModeDot').className = 'dot' + (S.demoMode ? '' : ' is-live');
    document.getElementById('popModeText').textContent = S.demoMode ? t('demoMode') : t('liveMode');
    document.getElementById('popVersion').textContent = ver || '—';
    var about = document.getElementById('aboutVersion');
    if (about) about.textContent = ver || '—';
  }

  // ---- action dispatcher ----
  function dispatchAction(action, el) {
    switch (action) {
      case 'settings':
      case 'view_settings':
        setView('settings'); break;
      case 'about':
        S.settingsSection = 'about';
        setView('settings'); break;
      case 'open_account_settings':
        S.settingsSection = 'account';
        setView('settings'); break;
      case 'view_positions': setView('positions'); break;
      case 'view_orders': setView('orders'); break;
      case 'toggle_sidebar': toggleSidebar(); break;
      case 'toggle_details': toggleDetails(); break;
      case 'shortcuts': closePopover(); LB.modals.open('shortcutsModal'); break;
      case 'cycle_theme': cycleTheme(); break;
      case 'toggle_account': togglePopover(); break;
      default:
        LB.bus.emit('action', { action: action, el: el });
    }
    if (action !== 'toggle_account' && el && el.closest && el.closest('#accountPopover')) closePopover();
  }

  document.addEventListener('click', function (e) {
    var linkEl = e.target.closest('[data-href]');
    if (linkEl) {
      e.preventDefault();
      LB.tauri.openUrl(linkEl.getAttribute('data-href'));
      closePopover();
      return;
    }
    var el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    dispatchAction(el.getAttribute('data-action'), el);
  });

  // No browser context menu outside text fields.
  document.addEventListener('contextmenu', function (e) {
    if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
    e.preventDefault();
  });

  // Links never navigate the app window.
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (/^https?:/.test(href)) { e.preventDefault(); LB.tauri.openUrl(href); }
  });

  /** Re-render everything that depends on state. Cheap: the data is tiny. */
  LB.render = function () {
    applyPanes();
    renderChrome();
    LB.bus.emit('render');
    LB.icons();
  };

  /** Centred empty state. o: { icon | spinner, error?, title, desc?, action?: { label, action, primary?, icon? }, compact? } */
  function empty(o) {
    var esc = LB.fmt.escape;
    var icon = o.spinner
      ? '<div class="empty-icon"><span class="spinner lg"></span></div>'
      : '<div class="empty-icon' + (o.error ? ' is-error' : '') + '"><i data-lucide="' + esc(o.icon || 'info') + '"></i></div>';
    var btn = '';
    if (o.action) {
      btn = '<button type="button" class="btn ' + (o.action.primary ? 'btn-primary' : 'btn-outline') + '" data-action="' + esc(o.action.action) + '">' +
        (o.action.icon ? '<i data-lucide="' + esc(o.action.icon) + '"></i>' : '') +
        '<span>' + esc(o.action.label) + '</span></button>';
    }
    return '<div class="empty' + (o.compact ? ' compact' : '') + '">' + icon +
      '<div class="empty-title">' + esc(o.title) + '</div>' +
      (o.desc ? '<div class="empty-desc selectable">' + esc(o.desc) + '</div>' : '') +
      btn + '</div>';
  }

  LB.ui = { setSeg: setSeg, empty: empty };
  LB.dispatchAction = dispatchAction;
  LB.shell = {
    setView: setView,
    setTheme: setTheme,
    cycleTheme: cycleTheme,
    toggleSidebar: toggleSidebar,
    toggleDetails: toggleDetails,
    closePopover: closePopover,
    renderChrome: renderChrome
  };
})(window);
