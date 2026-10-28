// Shared client for the card games (Bridge, Hot Joker): seat storage, polling,
// idempotent requests, landing/lobby screens, rules dialog and focus-safe
// rendering. A game supplies its own screens through TableKit(config).
(() => {
  'use strict';
  const ICON_PATHS = {
    check: '<path d="m5 12 4 4L20 5"/>', cross: '<path d="m6 6 12 12M18 6 6 18"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v3a5 5 0 0 0 5 5m9-8h4v3a5 5 0 0 1-5 5M12 14v6m-5 1h10"/>',
    spark: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
    cards: '<rect x="4" y="5" width="11" height="15" rx="2"/><path d="m9 4 8-1 3 14-5 1M8 10h3m-3 4h2"/>',
    hand: '<path d="M8 12V5a1.5 1.5 0 0 1 3 0v6m0-1V3.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v6l2-2a1.5 1.5 0 0 1 2 2l-4 7a5 5 0 0 1-4 2h-2a5 5 0 0 1-4-2l-3-5a1.5 1.5 0 0 1 2.5-1.5L8 14"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    crown: '<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5Z"/>',
  };
  const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const rankLabel = (r) => (r === 'T' ? '10' : r);
  const pipRows = (ys) => ys.flatMap(y => [[22, y], [78, y]]);
  const PIPS = {
    2: [[50, 14], [50, 86]], 3: [[50, 14], [50, 50], [50, 86]],
    4: pipRows([14, 86]), 5: [...pipRows([14, 86]), [50, 50]],
    6: pipRows([14, 50, 86]), 7: [...pipRows([14, 50, 86]), [50, 32]],
    8: [...pipRows([14, 50, 86]), [50, 32], [50, 68]],
    9: [...pipRows([12, 37, 63, 88]), [50, 50]],
    10: [...pipRows([12, 37, 63, 88]), [50, 25], [50, 75]],
  };
  function el(tag, props = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k in n && !k.startsWith('aria') && k !== 'list') n[k] = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) n.append(child);
    return n;
  }
  const text = (tag, cls, value) => el(tag, { class: cls }, value);
  function icon(name, cls = '') {
    const n = el('span', { class: 'tk-icon ' + cls, 'aria-hidden': 'true' });
    n.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[name] || ICON_PATHS.spark) + '</svg>';
    return n;
  }
  // A playing card face. code is suit letter + rank ('S10', 'HA', 'ST'); 'JK' is the Joker.
  function card(code, opts = {}) {
    const { onclick, disabled, selected, small, label } = opts;
    const joker = code === 'JK', suit = joker ? '' : code[0], rank = joker ? '' : rankLabel(code.slice(1));
    const court = ['K', 'Q', 'J'].includes(rank);
    const cls = 'pcard' + (joker ? ' joker' : ' ornate suit-' + suit + (suit === 'H' || suit === 'D' ? ' red' : '') + (court ? ' court' : rank === 'A' ? ' ace' : ' number')) + (small ? ' small' : '') + (selected ? ' selected' : '') + (onclick ? ' playable' : '');
    const corner = (bottom = false) => el('span', { class: 'card-index' + (bottom ? ' bottom' : ''), 'aria-hidden': 'true' }, text('b', 'pcard-rank', rank), text('i', 'pcard-suit', SUIT[suit]));
    const artwork = court ? el('span', { class: 'card-court', 'aria-hidden': 'true', style: '--court-x:' + (['S', 'H', 'D', 'C'].indexOf(suit) * 100 / 3) + '%;--court-y:' + (['K', 'Q', 'J'].indexOf(rank) * 50) + '%' })
      : rank === 'A' ? el('span', { class: 'card-ace', 'aria-hidden': 'true' }, text('span', '', SUIT[suit]))
      : el('span', { class: 'card-pips', 'aria-hidden': 'true' }, (PIPS[Number(rank)] || []).map(([x, y]) => el('i', { class: 'card-pip' + (y > 50 ? ' inverted' : ''), style: 'left:' + x + '%;top:' + y + '%' }, SUIT[suit])));
    const face = joker ? [text('b', 'pcard-joker', '★'), text('small', '', 'JOKER')] : [artwork, corner(), corner(true)];
    const name = joker ? 'Joker' : rank + ' of ' + { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }[suit];
    if (!onclick) return el('span', { class: cls, role: 'img', 'aria-label': label || name }, face);
    return el('button', { type: 'button', class: cls, 'data-focus': 'card-' + code, 'aria-label': label || name, 'aria-pressed': selected ? 'true' : undefined, disabled: !!disabled, onclick }, face);
  }
  const cardBack = (cls = '') => el('span', { class: 'pcard back ' + cls, 'aria-hidden': 'true' });

  window.TableKit = function TableKit(cfg) {
    const root = document.getElementById('tk-app');
    document.body.dataset.game = cfg.game;
    const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
    const store = (key, value) => { try { value ? localStorage.setItem(key, JSON.stringify(value)) : localStorage.removeItem(key); } catch {} };
    const invitation = new URLSearchParams(location.search).get('room')?.toUpperCase() || '';
    let seat = read(cfg.seatKey), state = null, busy = false, error = '', connected = true, pollTimer, rulesDialog;
    let name = read(cfg.nameKey) || '', code = invitation, recover = '', renderedScene = '';
    const seen = new Set();
    if (seat && !seat.tok) seat = null;
    if (invitation && seat?.code !== invitation) { seat = null; store(cfg.seatKey, null); }
    if (seat) try { localStorage.setItem('arcade-last-game', cfg.game); } catch {}
    const who = (id) => state?.players.find((p) => p.id === id)?.name || 'Player';
    const announce = (message) => { document.getElementById('tk-announcer').textContent = message; };
    const button = (label, click, kind = '', disabled = false, focus) => el('button', { type: 'button', class: kind, 'data-focus': focus || (typeof label === 'string' ? label : ''), onclick: click, disabled: busy || disabled }, label);
    const panel = (cls, ...children) => el('section', { class: 'tk-panel ' + cls }, ...children);
    function avatar(id, cls = '') {
      const i = Math.max(0, state?.players.findIndex((p) => p.id === id) ?? 0);
      return el('span', { class: 'tk-avatar portrait ' + cls, style: '--portrait-x:' + ((i % 4) * 100 / 3) + '%;--portrait-y:' + (Math.floor(i / 4) * 50) + '%', 'aria-hidden': 'true' });
    }
    // True only the first time a key is shown, so entrance animations do not replay on every poll.
    const fresh = (key) => { if (seen.has(key)) return false; seen.add(key); return true; };

    async function request(action, extra = {}, owner = seat) {
      const payload = { action, ...owner, ...extra, requestId: crypto.randomUUID(), match: state?.match };
      for (let attempt = 0; ; attempt++) {
        const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(cfg.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
          const data = await response.json(); if (!response.ok) throw Object.assign(Error(data.error || 'Please retry.'), { status: response.status });
          return data;
        } catch (e) { if (attempt >= 1 || ['create', 'join'].includes(action) || (e.status && e.status !== 503)) throw e; }
        finally { clearTimeout(timeout); }
      }
    }
    function adopt(data) {
      data.receivedAt = Date.now();
      if (!state || data.code !== state.code || data.version >= state.version) {
        const changed = state?.phase !== data.phase; state = data;
        if (changed) announce((cfg.announce || {})[data.phase] || 'Room ready.');
      }
    }
    const schedulePoll = () => { clearTimeout(pollTimer); if (seat) pollTimer = setTimeout(poll, 1100); };
    async function poll() {
      const owner = seat; if (!owner) return;
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(cfg.api + '?code=' + owner.code + '&pid=' + owner.pid, { headers: { 'x-tok': owner.tok }, signal: controller.signal });
        const data = await response.json(); if (seat !== owner) return;
        if (!response.ok) { if ([401, 404].includes(response.status)) { seat = null; state = null; store(cfg.seatKey, null); } throw Error(data.error); }
        const changed = !state || state.version !== data.version || !connected || (cfg.viewKey && cfg.viewKey(state) !== cfg.viewKey(data)); adopt(data); connected = true; if (changed) render(); else tick();
      } catch (e) { if (seat !== owner && seat) return; connected = false; error = e.name === 'AbortError' ? 'No connection. Trying again…' : e.message; render(); }
      finally { clearTimeout(timeout); if (seat === owner) schedulePoll(); }
    }
    async function enter(action) {
      if (busy) return; busy = true; error = ''; render();
      try {
        const data = await request(action, { name: name.trim(), code: code.trim().toUpperCase(), recoveryCode: recover.trim() }, null);
        seat = { code: data.code, pid: data.meId, tok: data.tok }; store(cfg.seatKey, seat); store(cfg.nameKey, name.trim());
        try { localStorage.setItem('arcade-last-game', cfg.game); } catch {}
        adopt(data); connected = true; schedulePoll();
      } catch (e) { error = e.name === 'AbortError' ? 'No reply from the game. Check your internet and try again.' : e.message; }
      finally { busy = false; render(); }
    }
    async function send(action, extra = {}) {
      if (busy || !seat) return false; const owner = seat; busy = true; error = ''; render();
      let ok = false;
      try {
        const data = await request(action, extra); if (seat !== owner) return false;
        if (action === 'leave') { seat = null; state = null; store(cfg.seatKey, null); clearTimeout(pollTimer); } else adopt(data);
        connected = true; ok = true;
      } catch (e) { error = e.name === 'AbortError' ? 'The connection stopped. We are checking whether your choice was saved.' : e.message; poll(); }
      finally { busy = false; render(); }
      return ok;
    }
    const link = () => location.origin + cfg.page + '?room=' + state.code;
    async function copyInvite() {
      try { await navigator.clipboard.writeText(link()); announce('Link copied'); document.querySelector('[data-copy]').textContent = 'Copied!'; }
      catch { error = 'Copy this link: ' + link(); render(); }
    }
    function dialog(...children) {
      const d = el('dialog', { class: 'tk-dialog' }, ...children);
      d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal(); return d;
    }
    function openRules() {
      if (rulesDialog?.isConnected) return;
      rulesDialog = dialog(text('span', 'eyebrow', cfg.rulesEyebrow || 'HOW TO PLAY'), el('h2', { tabIndex: -1 }, cfg.rulesTitle), ...cfg.rules(), button('Let’s play', () => rulesDialog.close(), 'primary'));
      rulesDialog.querySelector('h2').focus({ preventScroll: true });
    }
    function showRecovery() {
      const d = dialog(el('h2', {}, 'Save Your Rejoin Code'), el('p', {}, 'Save this code and keep it private. To play on another phone, enter the room code, your same name, and this code. The old phone will be signed out.'), el('input', { readOnly: true, value: state.recoveryCode, 'aria-label': 'Rejoin Code', onclick: (e) => e.target.select() }), button('Close', () => d.close(), 'primary'));
    }
    const header = () => el('header', { class: 'tk-header' }, el('a', { href: '/?games=1', class: 'back-link' }, '← All games'), el('a', { href: cfg.page, class: 'tk-wordmark' }, icon(cfg.icon || 'cards'), el('span', {}, text('small', '', 'THE GAME ROOM'), text('b', '', cfg.title.toUpperCase()))), el('div', { class: 'header-tools' }, button('How to Play', openRules, 'text-button'), window.GameAudio?.soundMenu?.() || null));
    function landing() {
      const L = cfg.landing;
      return el('div', { class: 'tk-landing' },
        el('section', { class: 'tk-intro' }, text('span', 'eyebrow', L.eyebrow), L.art ? L.art() : null, el('h1', {}, L.title[0], el('br'), el('em', {}, L.title[1])), el('p', {}, L.lead), el('div', { class: 'chips' }, L.chips.map((c) => text('span', '', c))),
          el('div', { class: 'quick-steps' }, L.steps.map(([i, t], n) => el('div', {}, icon(i), text('small', '', String(n + 1).padStart(2, '0')), text('b', '', t))))),
        panel('entrance', el('div', { class: 'entrance-seal', 'aria-hidden': 'true' }, icon('lock')), text('span', 'eyebrow', 'PLAY WITH FRIENDS'), el('h2', {}, 'Ready to Play?'),
          el('label', { htmlFor: 'tk-name' }, 'Your Name'), el('input', { id: 'tk-name', maxLength: 12, value: name, autocomplete: 'nickname', placeholder: 'Your Name', oninput: (e) => { name = e.target.value; } }),
          button('Create a Room', () => enter('create'), 'primary'), text('div', 'or', 'or join your friends'),
          el('label', { htmlFor: 'tk-code' }, 'Room Code'), el('input', { id: 'tk-code', maxLength: 4, value: code, placeholder: 'ABCD', autocomplete: 'off', class: 'code-input', oninput: (e) => { code = e.target.value; } }),
          button('Join Room', () => enter('join'), 'secondary'),
          el('details', {}, el('summary', {}, 'Rejoin on Another Phone'), el('p', {}, 'Use your same name and saved rejoin code.'), el('label', { htmlFor: 'tk-recovery' }, 'Rejoin Code'), el('input', { id: 'tk-recovery', value: recover, autocomplete: 'off', oninput: (e) => { recover = e.target.value; } })),
          text('p', 'muted small', L.note)));
    }
    function roomBar() {
      return el('div', { class: 'room-bar' }, el('div', {}, text('span', 'eyebrow', 'PRIVATE ROOM'), el('b', { class: 'room-code' }, state.code)),
        el('div', { class: 'room-actions' }, el('button', { type: 'button', 'data-copy': '', onclick: copyInvite }, 'Copy Link'), button('Rejoin Code', showRecovery, 'text-button'), button('Leave', () => { if (confirm('Leave this room? Save your rejoin code so you can come back.')) send('leave'); }, 'text-button')));
    }
    function roster(tagFor) {
      const present = state.players.filter((p) => !p.departed).length;
      return panel('table-roster', el('div', { class: 'panel-heading' }, el('h3', {}, 'Players'), text('span', 'roster-count', present + '/' + cfg.max + ' PLAYERS')),
        el('div', { class: 'roster' }, state.players.map((p) => {
          const own = tagFor && tagFor(p, state), tag = p.departed ? 'AWAY' : p.bot ? ['BOT', own].filter(Boolean).join(' · ') : own || (p.id === state.hostId ? 'HOST' : 'READY');
          return el('div', { class: 'seat' + (p.id === state.meId ? ' mine' : '') + (p.departed ? ' seat-away' : '') + (p.bot ? ' seat-bot' : '') }, avatar(p.id), el('div', { class: 'seat-name' }, el('b', {}, p.name + (p.id === state.meId ? ' · You' : '')), text('small', 'muted', tag)));
        })));
    }
    // Host-only buttons: each press adds one computer player, or removes the most recent one.
    function botControls() {
      if (state.meId !== state.hostId || !['lobby', 'finished'].includes(state.phase)) return null;
      const seated = state.players.filter((p) => !p.departed).length, bots = state.players.filter((p) => p.bot).length;
      return el('div', { class: 'bot-controls' },
        button('+ Add a bot', () => send('addBot'), 'secondary', seated >= cfg.max, 'add-bot'),
        bots ? button('− Remove a bot', () => send('removeBot'), 'text-button', false, 'remove-bot') : null,
        text('small', 'muted', bots ? bots + (bots === 1 ? ' bot' : ' bots') + ' at the table. Bots play like casual players.' : 'No friends nearby? A bot can take a seat.'));
    }
    function waitingRoom() {
      const host = state.meId === state.hostId, n = state.players.filter((p) => !p.departed).length, reason = cfg.startBlock(state, n);
      return el('div', { class: 'lobby-grid' }, panel('waiting-card', cfg.landing.art ? el('div', { class: 'lobby-art' }, cfg.landing.art()) : null, text('span', 'eyebrow', 'WAITING FOR FRIENDS'), el('h1', {}, 'Who’s ready?'), el('p', { class: 'muted' }, 'Share this room code with your friends.'), text('div', 'large-code', state.code),
        el('div', { class: 'chips' }, cfg.waitingChips.map((c) => text('span', '', c))), cfg.waiting ? cfg.waiting(ctx()) : null, botControls(),
        host ? button('START GAME', () => send('start'), 'host-button start-ticket', !!reason) : text('p', 'waiting', 'Waiting for the host to start…'), reason ? text('p', 'muted small', reason) : null, button('How to Play', openRules, 'text-button')), roster(cfg.rosterTag));
    }
    const ctx = () => ({ state, send, busy, error, el, text, button, icon, card, cardBack, who, avatar, render, panel, roster, botControls, fresh, announce, dialog, SUIT, rankLabel, countdown: () => text('span', 'countdown', ''), read, store });
    // A screen that fails to draw must never leave the player staring at "Loading": offer a way out.
    function safeScreen() {
      try { return cfg.screen(ctx()); } catch (e) {
        console.error(e);
        return panel('', el('h2', {}, 'This screen did not load'), el('p', { class: 'muted' }, 'Your seat is saved. Reload to try again, or leave the room and rejoin with your code.'),
          button('Reload', () => location.reload(), 'primary'), button('Leave Room', () => { seat = null; state = null; store(cfg.seatKey, null); clearTimeout(pollTimer); render(); }, 'secondary'));
      }
    }
    function render() {
      const focus = document.activeElement?.id, focusKey = document.activeElement?.dataset?.focus, selection = document.activeElement?.selectionStart, selectionEnd = document.activeElement?.selectionEnd;
      const openDetails = [...root.querySelectorAll('details[open][data-details]')].map((n) => n.dataset.details);
      const scrolls = [...root.querySelectorAll('[data-scroll]')].map((n) => [n.dataset.scroll, n.scrollLeft, n.scrollTop]);
      const content = !seat ? landing() : !state ? panel('', el('h2', {}, 'Loading your game…'), el('p', { class: 'muted' }, 'Getting your room ready.'), button('Try again', poll, 'secondary')) : state.phase === 'lobby' ? waitingRoom() : safeScreen();
      root.replaceChildren(...[header(), error ? el('div', { class: 'error-banner', role: 'alert' }, error, button('Close', () => { error = ''; render(); }, 'text-button')) : null, seat && !connected ? text('div', 'connection-banner', 'Reconnecting… Your place is saved.') : null, state && seat ? roomBar() : null, state?.notice ? text('p', 'connection-banner', state.notice) : null, content, el('footer', { class: 'tk-footer' }, cfg.footer)].filter(Boolean));
      for (const n of root.querySelectorAll('details[data-details]')) if (openDetails.includes(n.dataset.details)) n.open = true;
      for (const [key, left, top] of scrolls) { const n = root.querySelector('[data-scroll="' + key + '"]'); if (n) { n.scrollLeft = left; n.scrollTop = top; } }
      const restored = focus ? document.getElementById(focus) : focusKey ? [...root.querySelectorAll('[data-focus]')].find((n) => n.dataset.focus === focusKey) : null;
      if (restored && !restored.disabled) { restored.focus({ preventScroll: true }); if (typeof selection === 'number' && restored.type !== 'number') try { restored.setSelectionRange(selection, selectionEnd ?? selection); } catch {} }
      const scene = [state?.code, state?.match, state?.phase, cfg.scene && state ? cfg.scene(state) : ''].join(':');
      root.dataset.phase = state?.phase || 'home';
      if (scene !== renderedScene) { root.querySelector('.tk-scene, .lobby-grid, .tk-landing')?.classList.add('scene-enter'); renderedScene = scene; }
      tick();
      cfg.afterRender?.(ctx());
    }
    function tick() {
      if (!state?.deadline) return;
      const seconds = Math.max(0, Math.ceil((state.deadline - state.now - (Date.now() - (state.receivedAt || Date.now()))) / 1000));
      for (const n of document.querySelectorAll('.countdown')) { n.textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); n.classList.toggle('urgent', seconds <= 10); n.setAttribute('aria-label', seconds + ' seconds remaining'); }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden && seat) { clearTimeout(pollTimer); poll(); } });
    setInterval(tick, 1000); render(); if (seat) poll();
  };
  window.TableKit.el = el; window.TableKit.text = text; window.TableKit.icon = icon; window.TableKit.card = card;
})();







