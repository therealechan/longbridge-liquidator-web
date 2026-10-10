/* Modal stack: fade + scale (160ms), Esc / scrim / [data-close] close the top
   one, [data-confirm] buttons run the modal's onConfirm. Focus is moved into
   the dialog and restored on close. */
(function (global) {
  'use strict';
  var LB = global.LB = global.LB || {};
  var t = function (k, v) { return LB.t(k, v); };
  var esc = function (s) { return LB.fmt.escape(s); };

  var stack = [];          // [{ el, onConfirm, onClose, returnFocus }]
  var z = 100;

  function reduceMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function find(el) {
    for (var i = stack.length - 1; i >= 0; i--) if (stack[i].el === el) return i;
    return -1;
  }

  function open(id, opts) {
    var el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) return;
    opts = opts || {};
    var idx = find(el);
    if (idx >= 0) stack.splice(idx, 1);
    if (el._closeTimer) { clearTimeout(el._closeTimer); el._closeTimer = null; }
    stack.push({ el: el, onConfirm: opts.onConfirm || null, onClose: opts.onClose || null, returnFocus: document.activeElement });
    z += 2;
    el.style.zIndex = String(z);
    el.hidden = false;
    LB.icons();
    // force a frame so the transition runs
    void el.offsetWidth;
    el.classList.add('is-open');
    var focusEl = el.querySelector('[data-autofocus]') || el.querySelector('[data-confirm]') || el.querySelector('button');
    if (focusEl) setTimeout(function () { try { focusEl.focus({ preventScroll: true }); } catch (e) { focusEl.focus(); } }, 0);
    if (LB.shell) LB.shell.closePopover();
  }

  function close(id) {
    var el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) return;
    var idx = find(el);
    var entry = idx >= 0 ? stack.splice(idx, 1)[0] : null;
    el.classList.remove('is-open');
    var finish = function () { el.hidden = true; el._closeTimer = null; };
    if (reduceMotion()) finish();
    else el._closeTimer = setTimeout(finish, 170);
    if (entry) {
      if (entry.returnFocus && document.contains(entry.returnFocus) && typeof entry.returnFocus.focus === 'function') {
        try { entry.returnFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      }
      if (entry.onClose) entry.onClose();
    }
  }

  function top() { return stack.length ? stack[stack.length - 1] : null; }

  function closeTop() {
    var entry = top();
    if (!entry) return false;
    close(entry.el);
    return true;
  }

  function confirmTop() {
    var entry = top();
    if (!entry) return false;
    var btn = entry.el.querySelector('[data-confirm]');
    if (btn && !btn.disabled) btn.click();
    return true;
  }

  // ---- delegated wiring ----
  document.addEventListener('click', function (e) {
    var modal = e.target.closest('.modal');
    if (!modal) return;
    if (e.target === modal) { close(modal); return; }        // scrim
    var confirmBtn = e.target.closest('[data-confirm]');
    if (confirmBtn) {
      var idx = find(modal);
      var entry = idx >= 0 ? stack[idx] : null;
      var cb = entry && entry.onConfirm;
      if (entry) entry.onClose = null;                         // confirming is not cancelling
      close(modal);
      if (cb) cb();
      return;
    }
    if (e.target.closest('[data-close]')) close(modal);
  });

  // ---- concrete dialogs ----
  function error(message) {
    document.getElementById('errorModalMessage').textContent = message;
    open('errorModal');
  }

  function success(title, html) {
    document.getElementById('successModalTitle').textContent = title;
    document.getElementById('successModalSummary').innerHTML = html;
    open('successModal');
  }

  function confirm(opts) {
    document.getElementById('confirmModalTitle').textContent = opts.title;
    document.getElementById('confirmModalText').textContent = opts.text || '';
    var ok = document.getElementById('confirmModalOk');
    ok.textContent = opts.confirmLabel || t('ok');
    open('confirmModal', { onConfirm: opts.onConfirm });
  }

  function liveWarning(onConfirm, onCancel) {
    open('liveWarningModal', { onConfirm: onConfirm, onClose: onCancel });
  }

  LB.modals = {
    open: open,
    close: close,
    closeTop: closeTop,
    confirmTop: confirmTop,
    isOpen: function () { return stack.length > 0; },
    error: error,
    success: success,
    confirm: confirm,
    liveWarning: liveWarning,
    _esc: esc
  };
})(window);
