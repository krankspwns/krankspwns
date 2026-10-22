/* Private letters use sender/recipient-only API views. Letters stay in the letterbox; opening a conversation marks it read.
   Message bodies never enter local storage. */
(() => {
  'use strict';
  window.createTrainLetters = (host, api) => {
    let state, owner, key = '', launcher, badge, book, body, thread = null, drafts = new Map(), sending = false, feedback = '', stamp = '', lastUnread = 0, marking = false;
    const node = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls || ''; if (text !== undefined) n.textContent = text; return n; };
    const button = (cls, text, click) => { const b = node('button', cls, text); b.type = 'button'; b.onclick = click; return b; };
    const icon = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false"><defs><linearGradient id="lt-letter-foil" x1="3" y1="13" x2="29" y2="28" gradientUnits="userSpaceOnUse"><stop stop-color="#ffe8a1"/><stop offset=".5" stop-color="#efba4c"/><stop offset="1" stop-color="#bd7b2c"/></linearGradient></defs><ellipse cx="16" cy="29" rx="13" ry="2" fill="#100e22" fill-opacity=".45"/><path d="M3 12 14 4a3 3 0 0 1 4 0l11 8v13H3z" fill="#b7803d" stroke="#f2c872" stroke-width=".8"/><rect x="7" y="3" width="18" height="21" rx="2" fill="#fff2d1"/><path d="M21 3h2a2 2 0 0 1 2 2v3h-4z" fill="#57bdb9"/><path d="M10 9h8M10 13h12M10 17h9" stroke="#b69667" stroke-width="1.2" stroke-linecap="round"/><path d="m3 12 13 9 13-9v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="url(#lt-letter-foil)" stroke="#ffdf91" stroke-width=".8"/><path d="m4 26 8-8m16 8-8-8" stroke="#a87132" stroke-opacity=".6" stroke-width=".9"/><circle cx="23.5" cy="23.5" r="5.2" fill="#68233e"/><circle cx="23.5" cy="23" r="4.5" fill="#c94b68" stroke="#f1a58f" stroke-width=".8"/><path d="m23.5 20.3.8 1.8 1.9.2-1.4 1.2.4 1.9-1.7-1-1.7 1 .4-1.9-1.4-1.2 1.9-.2z" fill="#ffe0a0"/></svg>';
    const all = () => state?.me.letters || [];
    const unread = () => all().filter(m => m.to === state.meId && !m.read);
    const person = id => state.players.find(p => p.id === id);
    const canWrite = p => p && p.id !== state.meId && !p.departed && (['lobby', 'finished'].includes(state.phase) || p.alive === state.me.alive);
    function face(p, cls = '') {
      const f = node('span', 'portrait portrait-passengers letter-face ' + (p?.frame ? 'has-frame bd-' + p.frame + ' ' : '') + cls), i = p?.avatarIndex || 0;
      f.style.setProperty('--px', (i % 4 * 100 / 3) + '%'); f.style.setProperty('--py', (Math.floor(i / 4) * 50) + '%'); f.setAttribute('aria-hidden', 'true'); return f;
    }
    const when = m => m.match && m.match !== state.match ? 'Earlier journey' : m.round ? 'Night ' + m.round : 'Before departure';
    function conversations() {
      const map = new Map();
      for (const m of all()) { const other = m.from === state.meId ? m.to : m.from; (map.get(other) || map.set(other, []).get(other)).push(m); }
      return [...map.entries()].map(([id, list]) => ({ id, list, last: list.at(-1), unread: list.filter(m => m.to === state.meId && !m.read).length })).sort((a, b) => b.last.sentAt - a.last.sentAt);
    }
    function updateLauncher() {
      if (!launcher) return;
      const count = unread().length;
      badge.hidden = !count; badge.textContent = count > 9 ? '9+' : String(count);
      launcher.setAttribute('aria-label', 'Open private letters' + (count ? ' (' + count + ' unread)' : ''));
      launcher.classList.toggle('has-letters', !!count);
      if (count > lastUnread) { api.sfx?.play('letter'); launcher.classList.remove('bump'); void launcher.offsetWidth; launcher.classList.add('bump'); }
      lastUnread = count;
    }
    async function markRead(id) {
      const ids = all().filter(m => m.from === id && m.to === state.meId && !m.read).map(m => m.id).slice(0, 30);
      if (!ids.length || marking) return; marking = true;
      const snapshot = { owner, state, key };
      try { const result = await api.request('dismissLetters', { letterIds: ids }, snapshot.owner, snapshot.state); if (snapshot.key === key) api.onState(result, snapshot.owner); }
      catch { /* The letter simply stays unread until the next time it is opened. */ }
      finally { marking = false; }
    }
    function renderList() {
      const wrap = node('div', 'letters-home');
      const writable = state.players.filter(canWrite);
      const pick = node('section', 'letters-pick'); pick.append(node('h3', '', 'Write to'));
      const row = node('div', 'letters-people');
      if (!writable.length) row.append(node('p', 'letter-empty', state.me.alive === false ? 'Only travellers who are also out can receive your letters.' : 'Nobody else is aboard yet.'));
      for (const p of writable) { const b = button('letters-person', '', () => openThread(p.id)); b.append(face(p), node('span', '', p.name)); b.setAttribute('aria-label', 'Write to ' + p.name); row.append(b); }
      pick.append(row);
      const list = node('section', 'letters-threads'); list.append(node('h3', '', 'Your letterbox'));
      const convos = conversations();
      if (!convos.length) list.append(node('p', 'letter-empty', 'No letters yet. A little mystery takes time.'));
      for (const c of convos) {
        const p = person(c.id), b = button('letters-thread' + (c.unread ? ' unread' : ''), '', () => openThread(c.id));
        const copy = node('div', 'thread-copy'), top = node('div', 'thread-top');
        top.append(node('b', '', p?.name || 'A traveller'), node('small', '', when(c.last)));
        copy.append(top, node('p', '', (c.last.from === state.meId ? 'You: ' : '') + c.last.text));
        b.append(face(p), copy); if (c.unread) b.append(node('span', 'thread-unread', String(c.unread)));
        b.setAttribute('aria-label', 'Letters with ' + (p?.name || 'a traveller') + (c.unread ? ', ' + c.unread + ' unread' : ''));
        list.append(b);
      }
      wrap.append(pick, list); return wrap;
    }
    function renderThread() {
      const p = person(thread), wrap = node('div', 'letters-thread-view');
      const head = node('div', 'thread-head'), back = button('thread-back', '‹', () => { thread = null; feedback = ''; render(true); }); back.setAttribute('aria-label', 'Back to your letterbox');
      const who = node('div'); who.append(node('b', '', p?.name || 'A traveller'), node('small', '', p && canWrite(p) ? 'Only the two of you can read these.' : p?.departed ? 'Has left the room' : 'Cannot receive letters right now'));
      head.append(back, face(p), who);
      const log = node('div', 'thread-log'); log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite');
      const letters = all().filter(m => (m.from === thread && m.to === state.meId) || (m.to === thread && m.from === state.meId));
      if (!letters.length) log.append(node('p', 'letter-empty', 'Write the first letter. They will see it next time they open Letters.'));
      let label = '';
      for (const m of letters) {
        const w = when(m); if (w !== label) { label = w; log.append(node('p', 'thread-when', w)); }
        const mine = m.from === state.meId, bubble = node('div', 'letter-bubble' + (mine ? ' mine' : '') + (!mine && !m.read ? ' fresh' : ''));
        bubble.append(node('p', '', m.text)); log.append(bubble);
      }
      wrap.append(head, log);
      if (p && canWrite(p)) {
        const form = node('form', 'thread-compose'), input = node('textarea'); input.id = 'letter-message'; input.maxLength = 500; input.rows = 2; input.placeholder = 'Write to ' + p.name + '…'; input.value = drafts.get(thread) || ''; input.setAttribute('aria-label', 'Your letter to ' + p.name);
        const send = node('button', 'gold', sending ? 'Sending…' : 'Send'); send.type = 'submit';
        const sync = () => { send.disabled = sending || state.paused || !input.value.trim(); };
        input.oninput = () => { drafts.set(thread, input.value); feedback = ''; fb.textContent = ''; sync(); };
        input.onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) form.requestSubmit(); };
        const fb = node('p', 'letter-feedback', state.paused ? 'The journey is paused. You can still read your letters.' : feedback); fb.setAttribute('role', 'status');
        form.onsubmit = async e => {
          e.preventDefault(); if (send.disabled) return;
          sending = true; sync(); send.textContent = 'Sending…';
          const target = thread, snapshot = { owner, state, key };
          try {
            const result = await api.request('letter', { targetId: target, text: input.value }, snapshot.owner, snapshot.state);
            if (snapshot.key === key) { drafts.delete(target); feedback = ''; api.sfx?.play('letter'); api.onState(result, snapshot.owner); }
          } catch (error) { feedback = error.name === 'AbortError' ? 'No reply yet. Check your connection before trying again.' : error.message; }
          finally { sending = false; if (book) render(true); }
        };
        form.append(input, send); wrap.append(form, fb); sync();
      }
      return wrap;
    }
    function render(force) {
      if (!book) return;
      const next = JSON.stringify([thread, all().map(m => m.id + m.read), state.players.map(p => [p.id, p.alive, p.departed, p.frame]), state.paused, sending, feedback]);
      if (!force && next === stamp) return;
      const focused = document.activeElement?.id === 'letter-message';
      stamp = next; body.replaceChildren(thread ? renderThread() : renderList());
      const log = body.querySelector('.thread-log'); if (log) log.scrollTop = log.scrollHeight;
      if (focused) body.querySelector('#letter-message')?.focus({ preventScroll: true });
      if (thread) markRead(thread);
    }
    function openThread(id) { thread = id; feedback = ''; render(true); body.querySelector('#letter-message')?.focus({ preventScroll: true }); }
    function close() { book?.close(); }
    function open() {
      if (!state || book) return;
      thread = null;
      book = node('dialog', 'letters-dialog'); book.setAttribute('aria-labelledby', 'letters-title');
      const top = node('header', 'letters-header'), heading = node('div'), title = node('h2', '', 'Private letters'); title.id = 'letters-title';
      heading.append(node('span', 'eyebrow', 'BETWEEN YOU & THEM'), title);
      const exit = button('letters-close', '×', close); exit.setAttribute('aria-label', 'Close private letters');
      top.append(heading, exit); body = node('div', 'letters-body');
      book.append(top, body);
      book.addEventListener('cancel', e => { e.preventDefault(); if (thread) { thread = null; render(true); } else close(); });
      book.addEventListener('click', e => { if (e.target === book) close(); });
      book.addEventListener('close', () => { const closed = book; book = body = null; thread = null; closed?.remove(); launcher?.focus({ preventScroll: true }); });
      document.body.append(book); render(true); book.showModal(); exit.focus({ preventScroll: true });
    }
    function sync(next, seat) {
      const nextKey = next && seat ? [seat.code, seat.pid].join(':') : '';
      if (nextKey !== key) { if (book) { const old = book; book = null; old.remove(); } key = nextKey; drafts = new Map(); sending = false; lastUnread = next ? (next.me.letters || []).filter(m => m.to === next.meId && !m.read).length : 0; }
      state = next; owner = seat;
      if (!key) { launcher?.remove(); launcher = null; return; }
      if (!launcher) {
        launcher = node('button', 'letters-launcher'); launcher.type = 'button'; launcher.title = 'Private letters'; launcher.innerHTML = icon; launcher.append(node('span', '', 'Letters'));
        badge = node('b', 'letters-badge'); launcher.append(badge); launcher.onclick = open; launcher.setAttribute('aria-haspopup', 'dialog'); host.append(launcher);
      }
      updateLauncher(); render(false);
    }
    addEventListener('pagehide', () => { if (book) { body?.replaceChildren(); book.close(); } });
    return { sync };
  };
})();
