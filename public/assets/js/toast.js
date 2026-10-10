/* Toasts: bottom-right, above the status bar; auto-dismiss after 4s. */
(function (global) {
  'use strict';
  var LB = global.LB = global.LB || {};
  var esc = function (s) { return LB.fmt.escape(s); };

  function dismiss(el) {
    if (!el || el.classList.contains('is-leaving')) return;
    el.classList.add('is-leaving');
    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, reduce ? 0 : 170);
  }

  /**
   * toast(message, kind?, title?)  kind: 'success' | 'error' | 'warning' | 'info'
   */
  function toast(message, kind, title) {
    var host = document.getElementById('toasts');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'toast toast-' + (kind || 'info');
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.innerHTML =
      '<div class="toast-body">' +
        (title ? '<div class="toast-title">' + esc(title) + '</div>' : '') +
        (message ? '<div class="toast-msg">' + esc(message) + '</div>' : '') +
      '</div>' +
      '<button type="button" class="icon-btn" aria-label="Close"><i data-lucide="x"></i></button>';
    el.querySelector('button').addEventListener('click', function () { dismiss(el); });
    host.appendChild(el);
    while (host.children.length > 4) host.removeChild(host.firstChild);
    LB.icons();
    var timer = setTimeout(function () { dismiss(el); }, 4000);
    el.addEventListener('mouseenter', function () { clearTimeout(timer); });
    el.addEventListener('mouseleave', function () { timer = setTimeout(function () { dismiss(el); }, 2000); });
  }

  LB.toast = toast;
})(window);
