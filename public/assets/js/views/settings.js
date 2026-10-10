/* Settings: Account (mode + credentials + test connection), Appearance,
   Language, About (version, links, disclaimer, FAQ). */
(function (global) {
  'use strict';
  var LB = global.LB;
  var S = LB.state;
  var t = function (k, v) { return LB.t(k, v); };
  var $ = function (id) { return document.getElementById(id); };
  var SECTIONS = ['account', 'appearance', 'language', 'about'];
  var SECTION_KEYS = { account: 'secAccount', appearance: 'secAppearance', language: 'secLanguage', about: 'secAbout' };
  var testing = false;

  function render() {
    if (S.view !== 'settings') return;
    if (SECTIONS.indexOf(S.settingsSection) < 0) S.settingsSection = 'account';
    document.querySelectorAll('#settingsNav .settings-nav-item').forEach(function (b) {
      var on = b.getAttribute('data-section') === S.settingsSection;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('[data-section-page]').forEach(function (p) {
      p.hidden = p.getAttribute('data-section-page') !== S.settingsSection;
    });
    $('settingsTitle').textContent = t(SECTION_KEYS[S.settingsSection]);
    LB.ui.setSeg('settingsModeSeg', S.demoMode ? 'demo' : 'live');
    LB.ui.setSeg('themeSeg', S.theme);
    LB.ui.setSeg('langSeg', LB.i18n.getLang());
    var btn = $('testConnBtn');
    btn.disabled = testing;
    btn.classList.toggle('spin', testing);
  }

  function restoreCredentials() {
    LB.CRED_KEYS.forEach(function (key) {
      var input = $(key);
      if (input) input.value = LB.storage.get('lb_' + key, '');
    });
  }

  async function testConnection() {
    var result = $('testConnResult');
    result.className = 'help';
    if (!LB.hasCreds()) {
      result.textContent = t('apiRequired');
      result.classList.add('is-error');
      LB.toast(t('apiRequired'), 'error', t('connFail'));
      return;
    }
    testing = true;
    result.textContent = t('loading');
    render();
    LB.icons();
    try {
      var data = await LB.api.positions(LB.creds());
      var n = (data.positions || []).length;
      result.textContent = t('connOk', { n: n });
      result.classList.add('is-ok');
      LB.toast('', 'success', t('connOk', { n: n }));
      LB.positions.ingest(data);
    } catch (err) {
      result.textContent = err.message;
      result.classList.add('is-error');
      LB.toast(err.message, 'error', t('connFail'));
    } finally {
      testing = false;
      render();
    }
  }

  function init() {
    restoreCredentials();

    $('settingsNav').addEventListener('click', function (e) {
      var item = e.target.closest('.settings-nav-item');
      if (!item) return;
      S.settingsSection = item.getAttribute('data-section');
      LB.render();
    });
    $('settingsNav').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      var idx = SECTIONS.indexOf(S.settingsSection) + (e.key === 'ArrowDown' ? 1 : -1);
      S.settingsSection = SECTIONS[Math.max(0, Math.min(SECTIONS.length - 1, idx))];
      LB.render();
      var active = document.querySelector('#settingsNav .is-active');
      if (active) active.focus();
    });

    // Credentials persist as they are typed (localStorage, this Mac only).
    document.querySelectorAll('input[data-cred]').forEach(function (input) {
      input.addEventListener('input', function () {
        LB.storage.set('lb_' + input.getAttribute('data-cred'), input.value);
        $('testConnResult').textContent = '';
        LB.render();
      });
    });

    document.querySelectorAll('[data-reveal]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = $(btn.getAttribute('data-reveal'));
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      });
    });

    $('testConnBtn').addEventListener('click', testConnection);
    $('credForm').addEventListener('submit', function (e) { e.preventDefault(); testConnection(); });

    LB.bus.on('seg:theme', function (v) { LB.shell.setTheme(v); render(); });
    LB.bus.on('seg:lang', function (v) { LB.i18n.setLang(v); });
    LB.bus.on('render', render);
  }

  LB.settings = { init: init, restoreCredentials: restoreCredentials };
})(window);
