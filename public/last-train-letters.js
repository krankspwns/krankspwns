/* Private letters use recipient-only API views. Message bodies never enter local storage. */
(() => {
  'use strict';
  window.createTrainLetters = (host, api) => {
    let state, owner, key = '', pending = new Set(), shown = new Map(), launcher, badge, book, inbox, select, input, send, feedback;
    let sending = false, deleting = false, recipientStamp = '', inboxStamp = '', lastDelete = 0, retryTimer;
    const node = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls || ''; if (text) n.textContent = text; return n; };
    const icon = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false"><defs><linearGradient id="lt-letter-foil" x1="3" y1="13" x2="29" y2="28" gradientUnits="userSpaceOnUse"><stop stop-color="#ffe8a1"/><stop offset=".5" stop-color="#efba4c"/><stop offset="1" stop-color="#bd7b2c"/></linearGradient></defs><ellipse cx="16" cy="29" rx="13" ry="2" fill="#100e22" fill-opacity=".45"/><path d="M3 12 14 4a3 3 0 0 1 4 0l11 8v13H3z" fill="#b7803d" stroke="#f2c872" stroke-width=".8"/><rect x="7" y="3" width="18" height="21" rx="2" fill="#fff2d1"/><path d="M21 3h2a2 2 0 0 1 2 2v3h-4z" fill="#57bdb9"/><path d="M10 9h8M10 13h12M10 17h9" stroke="#b69667" stroke-width="1.2" stroke-linecap="round"/><path d="m3 12 13 9 13-9v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="url(#lt-letter-foil)" stroke="#ffdf91" stroke-width=".8"/><path d="m4 26 8-8m16 8-8-8" stroke="#a87132" stroke-opacity=".6" stroke-width=".9"/><circle cx="23.5" cy="23.5" r="5.2" fill="#68233e"/><circle cx="23.5" cy="23" r="4.5" fill="#c94b68" stroke="#f1a58f" stroke-width=".8"/><path d="m23.5 20.3.8 1.8 1.9.2-1.4 1.2.4 1.9-1.7-1-1.7 1 .4-1.9-1.4-1.2 1.9-.2z" fill="#ffe0a0"/></svg>';
    function persist() { if (key) try { pending.size ? localStorage.setItem(key, JSON.stringify([...pending])) : localStorage.removeItem(key); } catch {} }
    const eligible = p => p.id !== state.meId && !p.departed && (['lobby', 'finished'].includes(state.phase) || p.alive === state.me.alive);
    const waiting = () => (state?.me.letters || []).filter(m => !pending.has(m.id));
    function updateLauncher() {
      if (!launcher) return;
      const count = waiting().length;
      badge.hidden = !count; badge.textContent = String(count);
      launcher.setAttribute('aria-label', 'Open private letters' + (count ? ' (' + count + ' unread)' : ''));
      launcher.classList.toggle('has-letters', !!count);
    }
    async function discard() {
      if (!key || !pending.size || deleting || book) return;
      const delay = 2000 - (Date.now() - lastDelete);
      if (delay > 0) { clearTimeout(retryTimer); retryTimer = setTimeout(discard, delay + 10); return; }
      deleting = true; lastDelete = Date.now();
      const snapshot = { key, owner, state }, ids = [...pending].slice(0, 30);
      try {
        const result = await api.request('dismissLetters', { letterIds: ids }, snapshot.owner, snapshot.state);
        if (snapshot.key === key) { ids.forEach(id => pending.delete(id)); persist(); api.onState(result, snapshot.owner); }
      } catch { /* IDs stay queued locally and hidden until the next successful acknowledgement. */ }
      finally { if (snapshot.key === key) { deleting = false; if (pending.size) { clearTimeout(retryTimer); retryTimer = setTimeout(discard, 3000); } } }
    }
    function close() { book?.close(); }
    function renderInbox() {
      if (!book) return;
      // Keep displayed letters in memory while open; persist only their deletion IDs for reload recovery.
      for (const letter of waiting()) { shown.set(letter.id, letter); pending.add(letter.id); }
      persist(); updateLauncher();
      const stamp = [...shown.keys()].join(':');
      if (stamp === inboxStamp) return;
      inboxStamp = stamp; inbox.replaceChildren();
      if (!shown.size) inbox.append(node('p', 'letter-empty', 'No letters yet. A little mystery takes time.'));
      for (const letter of shown.values()) {
        const player = state.players.find(p => p.id === letter.from), card = node('article', 'private-letter'), byline = node('div', 'letter-byline');
        const face = node('span', 'portrait portrait-passengers letter-face'), index = player?.avatarIndex || 0;
        face.style.setProperty('--px', (index % 4 * 100 / 3) + '%'); face.style.setProperty('--py', (Math.floor(index / 4) * 50) + '%'); face.setAttribute('aria-hidden', 'true');
        const from = node('div'); from.append(node('b', '', player?.name || 'A traveller'), node('small', '', letter.round ? 'NIGHT ' + letter.round : 'BEFORE DEPARTURE'));
        byline.append(face, from); card.append(byline, node('p', 'letter-text', letter.text)); inbox.append(card);
      }
    }
    function updateForm() {
      if (!book) return;
      const recipients = state.players.filter(eligible), stamp = recipients.map(p => p.id).join(':');
      if (stamp !== recipientStamp) {
        recipientStamp = stamp; const selected = select.value; select.replaceChildren();
        const placeholder = node('option', '', 'Choose a traveller'); placeholder.value = ''; select.append(placeholder);
        for (const p of recipients) { const option = node('option', '', p.name); option.value = p.id; select.append(option); }
        select.value = recipients.some(p => p.id === selected) ? selected : '';
      }
      send.disabled = sending || state.paused || !select.value || !input.value.trim();
      select.disabled = sending || !recipients.length; input.disabled = sending || !recipients.length;
      send.textContent = sending ? 'Sending…' : 'Send letter';
      if (state.paused) feedback.textContent = 'The journey is paused. You can still read your letters.';
      else if (!recipients.length) feedback.textContent = 'No travellers are available to write to yet.';
    }
    function open() {
      if (!state || book) return;
      shown = new Map(); inboxStamp = 'new'; recipientStamp = '';
      book = node('dialog', 'letters-dialog'); book.setAttribute('aria-labelledby', 'letters-title');
      const top = node('header', 'letters-header'), heading = node('div'), title = node('h2', '', 'Private letters'); title.id = 'letters-title';
      heading.append(node('span', 'eyebrow', 'BETWEEN YOU & THEM'), title);
      const exit = node('button', 'letters-close', '×'); exit.type = 'button'; exit.setAttribute('aria-label', 'Close private letters'); exit.onclick = close;
      top.append(heading, exit);
      const note = node('p', 'letters-warning', 'Read, then let go. Received letters disappear when you close this screen.');
      const received = node('section', 'letters-received'); received.append(node('h3', '', 'Your letterbox'));
      inbox = node('div', 'letters-inbox'); inbox.setAttribute('aria-live', 'polite'); inbox.setAttribute('aria-relevant', 'additions'); received.append(inbox);
      const form = node('form', 'letter-compose'); form.append(node('h3', '', 'Write a letter'));
      const to = node('label', '', 'To'); to.htmlFor = 'letter-recipient'; select = node('select'); select.id = 'letter-recipient'; select.required = true;
      const label = node('label', '', 'Your message'); label.htmlFor = 'letter-message'; input = node('textarea'); input.id = 'letter-message'; input.maxLength = 500; input.required = true; input.rows = 4; input.placeholder = 'What do you want them to know?';
      const foot = node('div', 'letter-compose-footer'), hint = node('small', '', 'Only the recipient can read this.'); send = node('button', 'gold', 'Send letter'); send.type = 'submit'; foot.append(hint, send);
      feedback = node('p', 'letter-feedback'); feedback.setAttribute('role', 'status');
      form.append(to, select, label, input, foot, feedback);
      select.onchange = input.oninput = () => { feedback.textContent = ''; updateForm(); };
      form.onsubmit = async event => {
        event.preventDefault(); if (send.disabled) return;
        sending = true; feedback.textContent = ''; updateForm();
        const opened = book, snapshot = { owner, state, key };
        try {
          const result = await api.request('letter', { targetId: select.value, text: input.value }, snapshot.owner, snapshot.state);
          if (snapshot.key === key) {
            if (book === opened) { input.value = ''; feedback.textContent = 'Your letter is on its way.'; }
            api.onState(result, snapshot.owner);
          }
        } catch (error) { if (book === opened) feedback.textContent = error.name === 'AbortError' ? 'No reply yet. Check your connection before trying again.' : error.message; }
        finally { if (snapshot.key === key) { sending = false; updateForm(); } }
      };
      book.addEventListener('cancel', event => { event.preventDefault(); close(); });
      book.addEventListener('close', () => {
        const closed = book; book = inbox = select = input = send = feedback = null; shown.clear();
        closed?.remove(); updateLauncher(); discard(); launcher?.focus({ preventScroll: true });
      });
      book.append(top, note, received, form); document.body.append(book); renderInbox(); updateForm(); book.showModal(); exit.focus({ preventScroll: true });
    }
    function sync(next, seat) {
      const nextKey = next && seat ? 'lt-letters-dismissed:' + [seat.code, seat.pid, next.match].join(':') : '';
      if (nextKey !== key) {
        if (book) { const old = book; book = null; old.remove(); shown.clear(); }
        clearTimeout(retryTimer); key = nextKey; pending = new Set(); sending = deleting = false; lastDelete = 0;
        if (key) try { const ids = JSON.parse(localStorage.getItem(key)); if (Array.isArray(ids)) pending = new Set(ids.filter(id => typeof id === 'string')); } catch {}
      }
      state = next; owner = seat;
      if (!key) { launcher?.remove(); launcher = badge = null; return; }
      if (!launcher) {
        launcher = node('button', 'letters-launcher'); launcher.type = 'button'; launcher.innerHTML = icon; launcher.append(node('span', '', 'Letters'));
        badge = node('b', 'letters-badge'); launcher.append(badge); launcher.onclick = open; launcher.setAttribute('aria-haspopup', 'dialog'); host.append(launcher);
      }
      updateLauncher(); renderInbox(); updateForm(); if (!book) discard();
    }
    addEventListener('pagehide', () => {
      // Do not leave readable letter cards in a back/forward-cache snapshot.
      if (book) { inbox?.replaceChildren(); shown.clear(); book.close(); }
      persist();
      if (!pending.size || !owner || !state) return;
      // Closing/reloading consumes displayed letters even if the page cannot await a response.
      fetch('/api/last-train', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dismissLetters', ...owner, match: state.match, letterIds: [...pending].slice(0, 30), requestId: crypto.randomUUID() }) }).catch(() => {});
    });
    return { sync };
  };
})();
