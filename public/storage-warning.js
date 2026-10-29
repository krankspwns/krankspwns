/* Shows a notice when the server says rooms are not being saved (no database set up), so nobody loses a room without knowing why. */
(() => {
  'use strict';
  const original = window.fetch; if (typeof original !== 'function') return;
  let shown = false;
  function show() {
    if (shown || !document.body) return; shown = true;
    const bar = document.createElement('div'); bar.className = 'storage-warning-bar'; bar.setAttribute('role', 'alert');
    bar.innerHTML = '<b>⚠️ This room is not being saved.</b> <span>The server has no database set up, so the room disappears a few minutes after everyone closes the game.</span>';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '✕'; close.setAttribute('aria-label', 'Close'); close.onclick = () => bar.remove(); bar.append(close);
    document.body.prepend(bar);
  }
  window.fetch = function () {
    return original.apply(this, arguments).then(response => {
      try { if (!shown && response.headers.get('x-storage-warning')) show(); } catch {}
      return response;
    });
  };
  const style = document.createElement('style');
  style.textContent = '.storage-warning-bar{position:sticky;top:0;z-index:2000;display:block;padding:10px 40px 10px 14px;background:#5a3a0e;color:#fff3d6;font:600 13px/1.4 system-ui,sans-serif;border-bottom:2px solid #f2ce86}.storage-warning-bar button{position:absolute;right:8px;top:6px;background:none;border:0;color:inherit;font-size:16px;cursor:pointer}';
  document.head.append(style);
})();
