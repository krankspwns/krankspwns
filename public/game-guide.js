// Shared "How to play" for Bridge, Hot Joker and The Grand Con. Same look as Row of Reckoning's guide: a gold book button in the
// header, a paged popup with a title bar, one idea per page, dots to jump around and Back / Next. Each game supplies its own pages.
(() => {
  'use strict';
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (v === undefined || v === null || v === false) continue; if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    return n;
  };
  const BOOK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6.6C10.2 5.1 7.5 4.6 3.8 4.9v13.3c3.7-.3 6.4.2 8.2 1.7 1.8-1.5 4.5-2 8.2-1.7V4.9c-3.7-.3-6.4.2-8.2 1.7z" fill="currentColor" fill-opacity=".25"/><path d="M12 6.6v13.3"/></svg>';
  const svg = (html) => { const s = document.createElement('span'); s.innerHTML = html; return s.firstChild; };

  // ---- small building blocks the games use to make their pages ----
  const B = {
    h: (t) => el('h3', {}, t),
    p: (t, cls = '') => el('p', { class: cls }, t),
    note: (t) => el('p', { class: 'pfg-note' }, t),
    dim: (t) => el('p', { class: 'pfg-note dim' }, t),
    list: (items) => el('ul', { class: 'pfg-list' }, items.map((i) => el('li', {}, i))),
    chip: (t, cls = '') => el('span', { class: 'pfg-chip ' + cls }, t),
    chips: (items) => el('div', { class: 'pfg-chips' }, items.map((t) => el('span', { class: 'pfg-chip' }, t))),
    // a playing card face, e.g. B.card('7', '♥'); B.card('★') for the Joker; B.back() for a face-down card
    card: (rank, suit = '') => el('span', { class: 'pfg-card' + (suit === '♥' || suit === '♦' ? ' red' : '') + (suit ? '' : ' joker') }, el('b', {}, rank), suit ? el('i', {}, suit) : null),
    back: () => el('span', { class: 'pfg-card back', 'aria-hidden': 'true' }),
    cards: (items, cls = '') => el('div', { class: 'pfg-cards ' + cls }, items),
    // numbered steps with a short explanation
    steps: (items) => el('div', { class: 'pfg-steps' }, items.map(([icon, title, text], n) => el('div', { class: 'pfg-step' },
      el('span', { class: 'pfg-ico' }, icon, el('em', {}, String(n + 1))), el('div', {}, el('b', {}, title), el('small', {}, text))))),
    // a labelled example box; tone: '' | 'good' | 'bad'
    example: (name, visual, caption, tone = '') => el('div', { class: 'pfg-ex ' + tone }, el('div', { class: 'pfg-ex-n' }, name), visual, caption ? el('div', { class: 'pfg-ex-c' }, caption) : null),
    row: (items) => el('div', { class: 'pfg-exs' }, items),
    // two-column table, e.g. score ladders
    table: (rows, head) => el('div', { class: 'pfg-table' }, head ? el('div', { class: 'pfg-tr head' }, head.map((h) => el('span', {}, h))) : null, rows.map((r) => el('div', { class: 'pfg-tr' }, r.map((c) => el('span', {}, c))))),
    teams: (a, b) => el('div', { class: 'pfg-teams' }, [a, b].map(([icon, name, text, cls]) => el('div', { class: 'pfg-team ' + cls }, el('span', {}, icon), el('b', {}, name), el('small', {}, text)))),
    el,
  };

  let current = null;
  function close() {
    if (!current) return;
    const { ov, opener } = current; current = null; ov.remove(); document.body.classList.remove('pfg-lock');
    document.removeEventListener('keydown', onKey, true); opener?.focus?.({ preventScroll: true });
  }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); }
  function go(d) { if (!current) return; const n = current.i + d; if (n >= 0 && n < current.pages.length) { current.i = n; draw(); } }

  function draw() {
    const { ov, pages, i, title } = current;
    const box = ov.querySelector('.pfg');
    const body = el('div', { class: 'pfg-body' }, pages[i]());
    const last = i === pages.length - 1;
    box.replaceChildren(
      el('div', { class: 'pfg-head' }, el('div', { class: 'pfg-title' }, el('b', { 'aria-hidden': 'true' }, svg(BOOK)), title), el('button', { type: 'button', class: 'pfg-x', 'aria-label': 'Close', onclick: close }, '✕')),
      el('div', { class: 'pfg-scroll', tabindex: '-1' }, body),
      el('div', { class: 'pfg-foot' },
        el('button', { type: 'button', class: 'pfg-ghost', disabled: i === 0, onclick: () => go(-1) }, '‹ Back'),
        el('div', { class: 'pfg-dots' }, pages.map((_, n) => el('button', { type: 'button', class: 'pfg-dot' + (n === i ? ' on' : ''), 'aria-label': 'Page ' + (n + 1) + ' of ' + pages.length, 'aria-current': n === i ? 'step' : null, onclick: () => { current.i = n; draw(); } }))),
        last ? el('button', { type: 'button', class: 'pfg-go', onclick: close }, 'Got it!') : el('button', { type: 'button', class: 'pfg-go', onclick: () => go(1) }, 'Next ›')));
    box.setAttribute('aria-label', title); box.querySelector('.pfg-scroll').scrollTop = 0;
  }

  function open({ title = 'How to play', pages }) {
    if (current || !pages?.length) return;
    const opener = document.activeElement;
    const ov = el('div', { class: 'pfg-ov', onclick: (e) => { if (e.target === ov) close(); } }, el('div', { class: 'pfg', role: 'dialog', 'aria-modal': 'true' }));
    document.body.append(ov); document.body.classList.add('pfg-lock');
    current = { ov, pages, i: 0, title, opener };
    document.addEventListener('keydown', onKey, true);
    draw(); ov.querySelector('.pfg-scroll').focus({ preventScroll: true });
  }

  // the header button: gold book icon + label, exactly like Row of Reckoning's
  const button = (onclick) => el('button', { type: 'button', class: 'pfg-btn', onclick }, el('b', { 'aria-hidden': 'true' }, svg(BOOK)), el('span', { class: 'pfg-label' }, 'How to play'));

  // a proper confirm box (replaces the browser's confirm()). Resolves true / false.
  function ask({ title, body, ok = 'OK', cancel = 'Cancel', danger = false, code = '' }) {
    return new Promise((resolve) => {
      const prev = document.activeElement;
      const done = (v) => { ov.remove(); document.removeEventListener('keydown', key, true); prev?.focus?.({ preventScroll: true }); resolve(v); };
      const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
      const copy = el('button', { type: 'button', class: 'pfc-copy', onclick: async () => { try { await navigator.clipboard.writeText(code); copy.textContent = 'Copied!'; } catch { box.select(); } } }, 'Copy');
      const box = el('input', { class: 'pfc-code', readOnly: true, value: code, 'aria-label': 'Rejoin code', onclick: (e) => e.target.select() });
      const go = el('button', { type: 'button', class: 'pfc-ok' + (danger ? ' danger' : ''), onclick: () => done(true) }, ok);
      const ov = el('div', { class: 'pfc-ov', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title, onclick: (e) => { if (e.target === ov) done(false); } },
        el('div', { class: 'pfc' }, el('h2', {}, title), el('p', {}, body),
          code ? el('div', { class: 'pfc-codebox' }, el('small', {}, 'Your rejoin code'), el('div', {}, box, copy)) : null,
          el('div', { class: 'pfc-row' }, el('button', { type: 'button', class: 'pfc-cancel', onclick: () => done(false) }, cancel), go)));
      document.body.append(ov); document.addEventListener('keydown', key, true); (code ? copy : el('i')).focus?.({ preventScroll: true }); if (!code) go.focus({ preventScroll: true });
    });
  }
  const leaveRoom = (code) => ask({ title: 'Leave this room?', body: 'You can come back later with the room code, your name and your rejoin code.', ok: 'Leave room', cancel: 'Stay', danger: true, code });

  window.GameGuide = { open, close, button, B, ask, leaveRoom };
})();

