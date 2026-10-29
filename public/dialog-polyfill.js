/* <dialog> for iPhones before iOS 15.4, which cannot open one with showModal(). Newer browsers use their own and skip this. */
(() => {
  'use strict';
  if (typeof HTMLDialogElement === 'function' && HTMLDialogElement.prototype.showModal) return;
  const style = document.createElement('style');
  style.textContent = 'dialog:not([open]){display:none}dialog[open]{display:block;position:fixed;inset:0;margin:auto;height:fit-content;max-height:92vh;max-width:94vw;overflow:auto;z-index:2147483000}.dialog-polyfill-backdrop{position:fixed;inset:0;z-index:2146483000;background:rgba(0,0,0,.62)}';
  document.head.append(style);
  const backdrops = new WeakMap();
  const define = (name, value) => { if (!(name in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, name, { value, configurable: true, writable: true }); };
  const isDialog = el => el.localName === 'dialog';
  const open = (el, modal) => {
    if (!isDialog(el) || el.hasAttribute('open')) return;
    if (modal) { const shade = document.createElement('div'); shade.className = 'dialog-polyfill-backdrop'; el.before(shade); backdrops.set(el, shade); }
    el.setAttribute('open', '');
  };
  define('showModal', function () { open(this, true); });
  define('show', function () { open(this, false); });
  define('close', function (value) {
    if (!isDialog(this) || !this.hasAttribute('open')) return;
    this.removeAttribute('open'); backdrops.get(this)?.remove(); backdrops.delete(this);
    if (value !== undefined) this.returnValue = String(value);
    this.dispatchEvent(new Event('close'));
  });
  // Escape closes the top dialog, as it does natively.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const top = [...document.querySelectorAll('dialog[open]')].pop();
    if (top && top.dispatchEvent(new Event('cancel', { cancelable: true }))) top.close();
  });
  // Tapping the shaded area outside a dialog closes nothing (natively it does not either); the page stays in place behind it.
})();
