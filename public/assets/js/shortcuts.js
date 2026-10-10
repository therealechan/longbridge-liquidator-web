/* Keyboard shortcuts. The native menu (Tauri) sends the same actions through
   the 'menu' event; its accelerators swallow the keydown, so a shortcut never
   fires twice. In a plain browser these bindings are the only path. */
(function (global) {
  'use strict';
  var LB = global.LB;
  var S = LB.state;

  function inField(el) {
    return !!(el && el.closest && el.closest('input, textarea, select, [contenteditable="true"]'));
  }

  document.addEventListener('keydown', function (e) {
    var key = e.key;
    var mod = e.metaKey || e.ctrlKey;
    var target = e.target;

    if (key === 'Escape') {
      if (LB.shell.closePopover()) { e.preventDefault(); return; }
      if (LB.modals.closeTop()) { e.preventDefault(); return; }
      if (S.detailsPeek) { e.preventDefault(); LB.shell.toggleDetails(); return; }
      if (inField(target)) target.blur();
      return;
    }

    // While a dialog is up only Esc and ⌘↩ (confirm) apply.
    if (LB.modals.isOpen()) {
      if (mod && key === 'Enter') { e.preventDefault(); LB.modals.confirmTop(); }
      return;
    }

    if (mod && !e.altKey) {
      var k = key.length === 1 ? key.toLowerCase() : key;
      switch (k) {
        case ',': e.preventDefault(); LB.dispatchAction('settings'); return;
        case 'r': e.preventDefault(); LB.dispatchAction('refresh'); return;
        case 'b': e.preventDefault(); LB.dispatchAction('toggle_sidebar'); return;
        case 'd': e.preventDefault(); LB.dispatchAction('toggle_details'); return;
        case '/': case '?': e.preventDefault(); LB.dispatchAction('shortcuts'); return;
        case '1': e.preventDefault(); LB.dispatchAction('view_positions'); return;
        case '2': e.preventDefault(); LB.dispatchAction('view_orders'); return;
        case '3': e.preventDefault(); LB.dispatchAction('view_settings'); return;
        case 'Enter': e.preventDefault(); LB.dispatchAction('primary'); return;
        case 'f':
          if (S.view === 'positions') {
            e.preventDefault();
            if (!S.sidebarOpen) LB.shell.toggleSidebar();
            var f = document.getElementById('posFilter');
            f.focus();
            f.select();
          }
          return;
        case 'a':
          if (!inField(target) && S.view === 'positions') { e.preventDefault(); LB.positions.selectAll(); }
          return;
      }
      return;
    }

    if (e.altKey || inField(target)) return;

    if (key === 'ArrowDown' || key === 'ArrowUp') {
      var delta = key === 'ArrowDown' ? 1 : -1;
      if (S.view === 'positions') { e.preventDefault(); LB.positions.moveActive(delta); }
      else if (S.view === 'orders') { e.preventDefault(); LB.orders.moveSelection(delta); }
      return;
    }

    if (key === ' ' && S.view === 'positions') {
      // Space on a focused button presses the button.
      if (target && target.closest && target.closest('button, a, summary, [role="radio"]')) return;
      e.preventDefault();
      LB.positions.toggleActive();
    }
  });
})(window);
