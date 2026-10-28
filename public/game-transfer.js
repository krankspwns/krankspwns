// Shared transition across full-page game switches. Stores destination metadata only.
(() => {
  'use strict';
  const KEY = 'kp-game-transfer';
  let panel, timer, started = 0, finishing = false;
  function cancel() {
    clearTimeout(timer); panel?.remove(); panel = null; finishing = false;
    document.documentElement.classList.remove('pf-transferring');
    try { sessionStorage.removeItem(KEY); } catch {}
  }
  function show(title, destination = false) {
    if (panel) return;
    started = performance.now();
    document.documentElement.classList.add('pf-transferring');
    panel = document.createElement('section'); panel.className = 'pf-transfer';
    panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite');
    const mark = document.createElement('img'); mark.src = '/brand/game-room-mark.png'; mark.alt = ''; mark.width = mark.height = 80;
    const label = document.createElement('p'); label.className = 'pf-transfer-label'; label.textContent = 'THE GAME ROOM';
    const heading = document.createElement('h1'); heading.textContent = 'Teleporting to another game…';
    const name = document.createElement('p'); name.className = 'pf-transfer-name'; name.textContent = title;
    const track = document.createElement('div'); track.className = 'pf-transfer-track'; track.setAttribute('aria-hidden', 'true'); track.append(document.createElement('i'));
    const note = document.createElement('p'); note.className = 'pf-transfer-note'; note.textContent = 'Your party is coming with you.';
    panel.append(mark, label, heading, name, track, note);
    (document.body || document.documentElement).append(panel);
    if (destination) timer = setTimeout(() => {
      note.textContent = 'This is taking longer than usual. Your seat is saved.';
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry loading'; retry.onclick = () => location.reload();
      const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.textContent = 'Show game'; dismiss.onclick = cancel;
      panel?.append(retry, dismiss);
    }, 15000);
  }
  function begin(game, title) {
    // A blocked sessionStorage must not prevent the verified room switch.
    try { sessionStorage.setItem(KEY, JSON.stringify({ game, title, at: Date.now() })); } catch {}
    show(title);
    return new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 200 : 700));
  }
  function ready() {
    if (!panel || finishing) return;
    finishing = true; clearTimeout(timer);
    // Let the game's fetch consumer render its room behind the transition first.
    setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!panel) return;
      panel.classList.add('pf-transfer-done');
      setTimeout(cancel, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300);
    })), Math.max(0, 700 - (performance.now() - started)));
  }
  window.GameTransfer = { begin, ready, cancel };
  try {
    const pending = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (pending && Date.now() - pending.at < 60000 && location.pathname === '/' + pending.game + '.html') show(pending.title, true);
    else sessionStorage.removeItem(KEY);
  } catch {}
})();
