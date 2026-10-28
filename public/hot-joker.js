(() => {
  'use strict';
  const el = TableKit.el, text = TableKit.text;
  const RANK_NAME = { A: 'Aces', K: 'Kings', Q: 'Queens', J: 'Jacks' };
  const rankName = (r) => RANK_NAME[r] || r + 's';
  const sizeOf = (s) => s.settings?.setSize || 2;
  const setName = (r, size) => (size === 4 ? 'four ' + rankName(r) : 'a pair of ' + rankName(r));
  let pickRect = null, pick = -1, sel = -1, pickKey = '', cur = null, seen = null, prev = { hand: [], rects: new Map() };
  const calm = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- animation: cards flying between players, hand reordering ----
  const tileOf = (id) => document.querySelector('.circle-seat[data-id="' + id + '"] .tile');
  function fly(c, code, from, to, scaleTo, done) {
    if (!from || !to || calm()) { done?.(); return; }
    const w = 54, h = 76, n = code ? c.card(code) : c.cardBack();
    n.classList.add('hj-fly'); n.style.width = w + 'px'; n.style.height = h + 'px'; document.body.append(n);
    const at = (r, k) => 'translate(' + (r.left + r.width / 2 - w / 2) + 'px,' + (r.top + r.height / 2 - h / 2) + 'px) scale(' + k + ')';
    const a = n.animate([{ transform: at(from, 0.6), opacity: 0.9 }, { transform: at(from, 1.1), opacity: 1, offset: 0.2 }, { transform: at(to, scaleTo), opacity: 1 }], { duration: 750, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
    const end = () => { n.remove(); done?.(); }; a.onfinish = end; a.oncancel = end;
  }
  // the card I picked turns over where it lay, then travels into my hand
  function flipFly(c, code, from, to, done) {
    if (!from || !to || calm()) { done?.(); return; }
    const w = from.width, h = from.height, wrap = document.createElement('div'), inner = document.createElement('div');
    wrap.className = 'hj-fly hj-flip'; wrap.style.width = w + 'px'; wrap.style.height = h + 'px';
    inner.className = 'hj-flip-in'; const back = c.cardBack(), face = c.card(code); face.classList.add('hj-flip-face');
    for (const n of [back, face]) { n.style.width = '100%'; n.style.height = '100%'; }
    inner.append(back, face); wrap.append(inner); document.body.append(wrap);
    const at = (r, k) => 'translate(' + (r.left + r.width / 2 - w / 2) + 'px,' + (r.top + r.height / 2 - h / 2) + 'px) scale(' + k + ')';
    const k2 = Math.min(1.4, to.width / w || 1);
    const a = wrap.animate([{ transform: at(from, 1), offset: 0 }, { transform: at(from, 1.18), offset: 0.3 }, { transform: at(from, 1.18), offset: 0.45 }, { transform: at(to, k2), offset: 1 }], { duration: 1150, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
    inner.animate([{ transform: 'rotateY(0deg)', offset: 0 }, { transform: 'rotateY(180deg)', offset: 0.35 }, { transform: 'rotateY(180deg)', offset: 1 }], { duration: 1150, easing: 'ease-in-out', fill: 'forwards' });
    const end = () => { wrap.remove(); done?.(); }; a.onfinish = end; a.oncancel = end;
  }
  function burst(node, label) {
    if (!node || calm()) return;
    const r = node.getBoundingClientRect(), b = document.createElement('div');
    b.className = 'hj-burst'; b.textContent = label; b.style.left = r.left + r.width / 2 + 'px'; b.style.top = r.top + 'px';
    document.body.append(b); setTimeout(() => b.remove(), 1400);
  }
  function after(c) {
    const st = c.state; if (!st || st.phase === 'lobby' || cur !== c) return;
    const row = document.querySelector('.hand-row'), cards = row ? [...row.children] : [], hand = st.me?.hand || [];
    const rects = new Map(); cards.forEach((n, i) => { if (hand[i]) rects.set(hand[i], n.getBoundingClientRect()); });
    const takes = (st.log || []).filter((e) => e.kind === 'take'), top = takes.reduce((m, e) => Math.max(m, e.turn || 0), 0);
    let handled = new Set();
    if (!seen || seen.match !== st.match) seen = { match: st.match, turn: top };
    else if (top > seen.turn && !document.hidden) {
      const fresh = takes.filter((e) => e.turn > seen.turn).slice(-2); seen.turn = top;
      fresh.forEach((e, k) => setTimeout(() => {
        const me = st.meId, last = st.me?.last, src = tileOf(e.source), dst = tileOf(e.taker);
        src?.classList.add('lost'); dst?.classList.add('got'); setTimeout(() => { src?.classList.remove('lost'); dst?.classList.remove('got'); }, 900);
        // the cards of a laid-down set travel from the taker into the "Sets laid down" panel
        const chips = (e.sets || []).map((rank) => { const mineSets = st.sets.filter((x) => x.id === e.taker), at = mineSets.map((x) => x.rank).lastIndexOf(rank);
          const chip = document.querySelector('.set-row[data-id="' + e.taker + '"] .sets')?.children[at]; if (chip) chip.style.opacity = 0; return { chip, set: mineSets[at] }; });
        const showChips = () => chips.forEach(({ chip }) => { if (chip) chip.style.opacity = ''; });
        setTimeout(showChips, 3500 + k * 700);
        const pair = () => {
          if (!e.sets?.length) return;
          burst(tileOf(e.taker), '✨ ' + (e.sets.length > 1 ? 'DOUBLE PAIR!' : 'PAIR!'));
          const origin = e.taker === me ? document.querySelector('.hand-row')?.getBoundingClientRect() || tileOf(e.taker)?.getBoundingClientRect() : tileOf(e.taker)?.getBoundingClientRect();
          chips.forEach(({ chip, set }, j) => {
            const cardsOf = set?.cards || [], to = chip?.getBoundingClientRect();
            if (!to || !cardsOf.length) { if (chip) chip.style.opacity = ''; return; }
            cardsOf.forEach((code, i) => setTimeout(() => fly(c, code, origin, to, 0.7, i === cardsOf.length - 1 ? () => { chip.style.opacity = ''; chip.classList.add('pop'); } : null), j * 300 + i * 140));
          });
        };
        if (e.taker === me && last?.card) {
          const idx = hand.indexOf(last.card), tgt = idx >= 0 ? cards[idx] : null;
          if (tgt) { tgt.style.opacity = 0; handled.add(last.card); }
          const landed = () => { if (tgt) tgt.style.opacity = ''; pair(); }, dest = tgt ? tgt.getBoundingClientRect() : dst?.getBoundingClientRect();
          if (pickRect && Date.now() - pickRect.at < 8000) { const from = pickRect; pickRect = null; flipFly(c, last.card, from, dest, landed); }
          else fly(c, last.card, src?.getBoundingClientRect(), dest, tgt ? 1 : 0.5, landed);
        } else if (e.source === me && last?.card) {
          fly(c, last.card, prev.rects.get(last.card) || row?.getBoundingClientRect(), dst?.getBoundingClientRect(), 0.5, pair);
        } else fly(c, null, src?.getBoundingClientRect(), dst?.getBoundingClientRect(), 0.5, pair);
      }, k * 700));
    }
    // reordering my own hand slides the cards to their new places
    if (!calm() && hand.length === prev.hand.length) cards.forEach((n, i) => { const was = prev.rects.get(hand[i]), now = rects.get(hand[i]); if (!was || !now || handled.has(hand[i])) return;
      const dx = was.left - now.left, dy = was.top - now.top; if (Math.abs(dx) + Math.abs(dy) > 2) n.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' }); });
    prev = { hand: hand.slice(), rects };
  }

  // ---- drag and drop to reorder my own cards ----
  let drag = null, justDragged = false;
  const nearest = (x, y) => { const row = document.querySelector('.hand-row'); if (!row) return -1; let best = -1, d = 1e9;
    [...row.children].forEach((n, i) => { const r = n.getBoundingClientRect(), dd = Math.hypot(x - (r.left + r.width / 2), (y - (r.top + r.height / 2)) * 1.6); if (dd < d) { d = dd; best = i; } }); return best; };
  const mark = (from, to) => { const row = document.querySelector('.hand-row'); if (!row) return; [...row.children].forEach((n, i) => { n.classList.toggle('hj-drag-src', i === from); n.classList.toggle('hj-drop', i === to && to !== from); }); };
  document.addEventListener('pointerdown', (ev) => {
    const node = ev.target.closest?.('.hand-row .pcard'); if (!node || (ev.button && ev.button !== 0) || !cur || cur.busy || cur.state?.phase !== 'playing') return;
    const row = node.parentElement, from = [...row.children].indexOf(node); if (from < 0 || row.children.length < 2) return;
    drag = { from, to: from, x: ev.clientX, y: ev.clientY, on: false, ghost: null, w: node.offsetWidth, h: node.offsetHeight };
  });
  document.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    if (!drag.on) { if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 8) return;
      const src = document.querySelector('.hand-row')?.children[drag.from]; if (!src) { drag = null; return; }
      drag.on = true; drag.ghost = src.cloneNode(true); drag.ghost.classList.add('hj-ghost'); drag.ghost.style.width = drag.w + 'px'; drag.ghost.style.height = drag.h + 'px'; document.body.append(drag.ghost); }
    ev.preventDefault(); drag.ghost.style.transform = 'translate(' + (ev.clientX - drag.w / 2) + 'px,' + (ev.clientY - drag.h / 2) + 'px) rotate(-5deg) scale(1.08)';
    drag.to = nearest(ev.clientX, ev.clientY); mark(drag.from, drag.to);
  }, { passive: false });
  const finish = async (ev) => {
    const d = drag; drag = null; if (!d || !d.on) return;
    d.ghost.remove(); mark(-1, -1); justDragged = true; setTimeout(() => { justDragged = false; }, 50);
    if (ev.type === 'pointerup' && d.to >= 0 && d.to !== d.from && cur && !cur.busy) { sel = -1; const h = cur.state.me.hand.slice(); h.splice(d.to, 0, h.splice(d.from, 1)[0]); cur.state.me.hand = h; cur.render(); await cur.send('move', { from: d.from, to: d.to }); }
  };
  document.addEventListener('pointerup', finish); document.addEventListener('pointercancel', finish);
  document.addEventListener('click', (ev) => { if (justDragged) { ev.stopPropagation(); ev.preventDefault(); } }, true);

  TableKit({
    game: 'hot-joker', api: '/api/hot-joker', page: '/hot-joker.html', seatKey: 'hj-seat', nameKey: 'hj-name', title: 'Hot Joker', icon: 'cards', min: 3, max: 10,
    footer: 'Hot Joker · Take a card. Lay down pairs. Don’t get stuck with the Joker.',
    announce: { playing: 'The cards are dealt. Match pairs and get rid of the Joker.', finished: 'The game is over.' },
    scene: (s) => s.phase,
    landing: {
      art: () => el('div', { class: 'club-art', 'aria-hidden': 'true' }, el('img', { src: '/game-art/hot-joker.webp', alt: '', width: 1200, height: 800, fetchPriority: 'high' })),
      eyebrow: 'TAKE. MATCH. PASS THE JOKER.', title: ['Hot', 'Joker.'], lead: 'Everyone holds hidden cards. Take one from the player before you, lay down matching pairs, and make sure you are not the last one holding the Joker.',
      chips: ['3–10 players', 'Hidden cards', 'One Joker loses'], steps: [['hand', 'Take a hidden card'], ['cards', 'Lay down pairs'], ['eye', 'Dodge the Joker']],
      note: 'Everyone uses their own phone. Sit around the table in the order shown in the room.',
    },
    waitingChips: ['3–10 players', 'Pairs go down', 'Last Joker loses'],
    startBlock: (s, n) => (n < 3 ? `Waiting for ${3 - n} more player${3 - n === 1 ? '' : 's'}. You need at least 3.` : ''),
    rosterTag: (p, s) => { const n = s.losses?.[p.id]; return p.id === s.hostId ? 'HOST' + (n ? ' · JOKER ×' + n : '') : n ? 'JOKER ×' + n : null; },
    waiting: (c) => seating(c),
    guide: (B) => [
      () => [B.h('Don’t get stuck with the Joker'), B.p('A deck of 52 cards plus one Joker is dealt to everyone. Your cards are hidden from the other players. Get rid of every card. The last player still holding cards has the Joker, and loses.'),
        B.chips(['3–10 players', 'Hidden cards', 'One Joker loses']),
        B.cards([B.back(), B.back(), B.card('★'), B.back(), B.back()], 'fan'),
        B.note('Somewhere in that fan is the Joker. Nobody knows where.')],
      () => [B.h('Pairs go down'), B.p('Whenever you hold two cards with the same number or face, they are put down automatically as a pair for everyone to see.'),
        B.row([B.example('Pair!', B.cards([B.card('7', '♥'), B.card('7', '♣')]), 'Laid down', 'good'), B.example('No pair', B.cards([B.card('9', '♠'), B.card('K', '♦')]), 'Keep both', 'bad')]),
        B.dim('The host can switch to four of a kind instead of pairs. That game takes much longer.')],
      () => [B.h('Your turn'), B.steps([['👈', 'Take a hidden card', 'Take one face-down card from the previous player who still has cards.'], ['✨', 'Match it', 'If it makes a pair with a card you hold, the pair goes down.'], ['🔀', 'Shuffle your hand', 'Move your cards around so nobody can guess where the Joker is.']]),
        B.dim('Players take turns clockwise around the circle.')],
      () => [B.h('Get out, or get stuck'), B.p('When you have no cards left you are safe. The game goes on until only one player still holds cards. That player is stuck with the Joker.'),
        B.row([B.example('Safe', B.el('div', { style: 'font-size:34px;line-height:60px' }, '🎉'), 'No cards left', 'good'), B.example('Stuck!', B.cards([B.card('★')]), 'Holding the Joker', 'bad')])],
      () => [B.h('Good to know'), B.list(['Nobody can see anyone’s hand, only how many cards they hold.', 'Pairs that have been laid down are shown under each player.', 'If a player takes too long, the game takes a random card for them.', 'If someone leaves, the game plays on for them.', 'Sit around the table in the order shown in the room.'])],
    ],

    rulesTitle: 'Don’t get stuck with the Joker.',
    rules: () => [
      el('p', {}, 'A deck of 52 cards plus one Joker is dealt out to everyone. Your cards are hidden from the other players.'),
      el('ol', {},
        el('li', {}, el('b', {}, 'Pairs go down. '), 'Whenever you hold two cards with the same number or face, like two 7s, they are put down automatically as a pair for everyone to see. The host can switch to four of a kind instead, but that game takes far longer.'),
        el('li', {}, el('b', {}, 'Take a hidden card. '), 'Players take turns clockwise around the circle. On your turn, take one face-down card from the previous player who still has cards. If it makes a pair, the pair goes down.'),
        el('li', {}, el('b', {}, 'Keep your cards safe. '), 'You can shuffle your cards or move them around so nobody can guess where the Joker is.'),
        el('li', {}, el('b', {}, 'Get out. '), 'When you have no cards left you are safe. The game goes on until only one player still holds cards. That player is stuck with the Joker and loses!')),
      el('p', { class: 'muted small' }, 'Nobody can see anyone’s hand, only how many cards they hold. Pairs that have been laid down are shown under each player. If a player takes too long, the game takes a random card for them. If someone leaves, the game plays on for them.'),
    ],
    screen: (c) => screen(c),
  });

  function seating(c) {
    const { state } = c, host = state.hostId === state.meId, size = sizeOf(state);
    return el('div', { class: 'seat-order' }, text('span', 'eyebrow', 'CLOCKWISE ORDER'),
      el('ol', { class: 'order-list' }, state.order.map((id) => el('li', {}, c.avatar(id), el('b', {}, c.who(id) + (id === state.meId ? ' · You' : ''))))),
      text('p', 'muted small', 'Each player takes cards from the one before them in this list. Sit in this order around the table.'),
      el('fieldset', { class: 'pace-settings' }, el('legend', {}, 'Sets to lay down'), el('div', { class: 'pace-options' }, [[2, 'Pairs (quick)'], [4, 'Four of a kind (long)']].map(([n, label]) => el('button', { type: 'button', class: size === n ? 'selected' : '', 'aria-pressed': size === n, disabled: !host, onclick: () => { if (c.busy || size === n) return; c.state.settings = { ...c.state.settings, setSize: n }; c.send('settings', { setSize: n }); } }, label)))),
      host ? c.button('Shuffle seats', () => c.send('shuffleSeats'), 'secondary', state.order.length < 2, undefined, 'shuffle:blue') : null);
  }
  function logLine(c, e) {
    if (e.kind === 'deal') return c.who(e.taker) + ' goes first.';
    const size = sizeOf(c.state), sets = e.sets.map((r) => ' laid down ' + setName(r, size));
    return c.who(e.taker) + ' took a card from ' + c.who(e.source) + (sets.length ? ' and' + sets.join(' and') + '!' : '.');
  }
  function privateNote(c) {
    const last = c.state.me.last; if (!last || c.state.phase !== 'playing') return null;
    const fresh = c.fresh('hj-note-' + c.state.match + ':' + last.turn);
    return el('div', { class: 'private-note ' + last.kind + (fresh ? ' pop' : ''), role: 'status' }, c.card(last.card, { small: true }), el('div', {}, text('small', 'eyebrow', 'ONLY YOU CAN SEE THIS'),
      el('b', {}, last.kind === 'got' ? 'You took this card from ' + c.who(last.other) : c.who(last.other) + ' took this card from you')));
  }
  const mini = (code, c) => c.card(code, { small: true });
  // Players sit in a circle in clockwise order with you at the bottom. The arrow shows who is taking from whom.
  function circle(c) {
    const { state } = c, order = state.order, n = order.length, me = Math.max(0, order.indexOf(state.meId)), size = sizeOf(state), total = 52 / size;
    const rad = n > 6 ? 40 : 36;
    const spot = (id) => { const k = (order.indexOf(id) - me + n) % n, a = ((180 + (k * 360) / n) * Math.PI) / 180; return { x: 50 + rad * Math.sin(a), y: 50 - rad * Math.cos(a) }; };
    let arrow = null;
    if (state.phase === 'playing' && state.taker && state.source) {
      const from = spot(state.source), to = spot(state.taker), dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1, cut = 17;
      const r = (v) => Math.round(v * 10) / 10;
      arrow = el('div', { class: 'circle-arrow', 'aria-hidden': 'true' });
      arrow.innerHTML = '<svg viewBox="0 0 100 100"><defs><marker id="hj-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 10 5 0 10Z" fill="currentColor"/></marker></defs>'
        + '<line x1="' + r(from.x + (dx / len) * cut) + '" y1="' + r(from.y + (dy / len) * cut) + '" x2="' + r(to.x - (dx / len) * cut) + '" y2="' + r(to.y - (dy / len) * cut) + '" marker-end="url(#hj-head)"/></svg>';
    }
    return el('div', { class: 'circle' + (n > 6 ? ' dense' : ''), role: 'list', 'aria-label': 'Players in clockwise order' }, arrow,
      el('div', { class: 'circle-centre' }, text('span', 'eyebrow', 'SETS DOWN'), el('b', {}, state.sets.length + ' / ' + total), text('small', 'muted', state.phase === 'playing' && state.taker ? c.who(state.taker) + ' → ' + c.who(state.source) : '')),
      order.map((id) => {
        const out = state.counts[id] === 0, taker = state.taker === id, source = state.source === id, place = state.placed.indexOf(id) + 1, p = spot(id);
        const sets = state.sets.filter((s) => s.id === id).length;
        return el('div', { class: 'circle-seat', role: 'listitem', 'data-id': id, style: 'left:' + p.x + '%;top:' + p.y + '%' },
          el('div', { class: 'tile' + (out ? ' out' : '') + (taker ? ' taker' : '') + (source ? ' source' : '') + (id === state.meId ? ' mine' : '') + (state.loser === id ? ' loser' : '') },
            c.avatar(id), el('b', {}, c.who(id) + (id === state.meId ? ' · You' : '')),
            el('div', { class: 'mini-fan', 'aria-hidden': 'true' }, ...Array.from({ length: Math.min(state.counts[id], 7) }, (_, k) => el('i', { style: '--k:' + k }))),
            text('small', 'count', out ? 'SAFE · #' + place : state.counts[id] + (state.counts[id] === 1 ? ' card' : ' cards')),
            taker ? text('span', 'badge taking', 'TAKING') : source ? text('span', 'badge holding', 'TAKEN FROM') : null,
            sets ? text('small', 'sets-count', sets + (sets === 1 ? ' set' : ' sets')) : null));
      }));
  }
  function turnBanner(c) {
    const { state } = c; if (state.phase !== 'playing') return null;
    const mine = state.taker === state.meId, out = state.me.out;
    const msg = mine ? 'Your turn. Take a card from ' + c.who(state.source) + '.' : state.source === state.meId ? c.who(state.taker) + ' is taking a card from you.' : c.who(state.taker) + ' is taking a card from ' + c.who(state.source) + '…';
    return el('div', { class: 'turn-banner' + (mine ? ' mine' : ''), role: 'status' }, out ? c.icon('check') : mine ? c.icon('hand') : null, el('span', {}, msg), state.deadline ? el('span', { class: 'banner-timer' }, c.countdown()) : null);
  }
  function takePanel(c) {
    const { state, send } = c, mine = state.taker === state.meId; if (state.phase !== 'playing' || !mine) return null;
    const key = state.match + ':' + state.turn;
    if (key !== pickKey) { pickKey = key; pick = -1; }
    return c.panel('take-panel active', text('span', 'eyebrow', 'YOUR TURN'), el('h2', {}, 'Pick a card from ' + c.who(state.source)),
      el('p', { class: 'muted small' }, 'They are holding ' + state.sourceCount + ' hidden card' + (state.sourceCount === 1 ? '' : 's') + '. One of them might be the Joker. Tap a card to choose it, then confirm.'),
      el('div', { class: 'pick-row', 'data-scroll': 'pick' }, ...Array.from({ length: state.sourceCount }, (_, i) => el('button', { type: 'button', class: 'pcard back playable' + (pick === i ? ' selected' : ''), 'data-focus': 'pick-' + i, 'aria-label': 'Card ' + (i + 1) + ' of ' + state.sourceCount, 'aria-pressed': pick === i, disabled: c.busy, onclick: () => { pick = i; c.render(); } }))),
      c.button(pick >= 0 ? 'Take card ' + (pick + 1) : 'Choose a card', async () => { const i = pick; const pr = document.querySelectorAll('.pick-row .pcard')[i]?.getBoundingClientRect(); if (pr) pickRect = { left: pr.left, top: pr.top, width: pr.width, height: pr.height, at: Date.now() }; if (await send('take', { index: i, turn: state.turn })) pick = -1; }, 'primary', pick < 0, 'take-confirm', 'hand:ink'));
  }
  function handPanel(c) {
    const { state, send } = c, hand = state.me.hand, playing = state.phase === 'playing';
    if (sel >= hand.length) sel = -1;
    const arrange = playing && hand.length > 1;
    return c.panel('hand-panel' + (state.source === state.meId ? ' being-taken' : ''), el('div', { class: 'panel-heading' }, el('div', {}, text('span', 'eyebrow', 'KEEP THIS PRIVATE'), el('h3', {}, hand.length ? 'Your cards' : state.phase === 'finished' ? 'Your last cards' : 'You are safe!')), text('span', 'hcp', hand.length + (hand.length === 1 ? ' card' : ' cards'))),
      state.source === state.meId && playing ? el('p', { class: 'warn small' }, c.who(state.taker) + ' is about to pick one of these. Move or shuffle your cards now.') : null,
      hand.length ? el('div', { class: 'hand-row', 'data-scroll': 'hand' }, hand.map((code, i) => c.card(code, { selected: sel === i, onclick: arrange ? () => { sel = sel === i ? -1 : i; c.render(); } : undefined, label: undefined }))) : text('p', 'muted', state.me.place ? 'You finished #' + state.me.place + '. Watch the others sweat.' : 'No cards left.'),
      arrange ? el('div', { class: 'arrange' },
        c.button('Left', async () => { const from = sel; if (from > 0 && await send('move', { from, to: from - 1 })) sel = from - 1; }, 'secondary', sel <= 0, 'move-left', 'arrowL:blue'),
        c.button('Shuffle', async () => { await send('shuffle'); sel = -1; }, 'secondary', false, 'shuffle', 'shuffle:purple'),
        c.button('Right', async () => { const from = sel; if (from >= 0 && from < hand.length - 1 && await send('move', { from, to: from + 1 })) sel = from + 1; }, 'secondary', sel < 0 || sel >= hand.length - 1, 'move-right', 'arrowR:blue')) : null,
      arrange ? text('p', 'muted small', 'Drag a card to a new spot, or tap it and use the arrows. Shuffle mixes them all.') : null);
  }
  // Every set that has been laid down, grouped by who laid it.
  function setsPanel(c) {
    const { state } = c, size = sizeOf(state), total = 52 / size;
    const rows = state.order.map((id) => ({ id, sets: state.sets.filter((s) => s.id === id) })).filter((r) => r.sets.length);
    return c.panel('sets-panel', el('div', { class: 'panel-heading' }, el('h3', {}, 'Sets laid down'), text('span', 'roster-count', state.sets.length + ' / ' + total)),
      rows.length ? el('div', { class: 'set-rows' }, rows.map((r) => el('div', { class: 'set-row' + (r.id === state.meId ? ' mine' : ''), 'data-id': r.id },
        el('div', { class: 'set-owner' }, c.avatar(r.id), el('b', {}, c.who(r.id) + (r.id === state.meId ? ' · You' : '')), text('small', 'muted', r.sets.length + (r.sets.length === 1 ? ' set' : ' sets'))),
        el('div', { class: 'sets' }, r.sets.map((s, i) => el('span', { class: 'set-chip' + (c.fresh('hj-set-' + state.match + ':' + r.id + ':' + i) ? ' pop' : ''), 'aria-label': setName(s.rank, size) }, (s.cards || []).map((code) => mini(code, c)))))))
      ) : text('p', 'muted small', size === 4 ? 'No sets yet. Collect all four cards of one number to lay them down.' : 'No pairs yet. Match two cards with the same number to lay them down.'));
  }
  function logPanel(c) {
    const { state } = c;
    return c.panel('log-panel', el('h3', {}, 'What happened'), el('ol', { class: 'log', reversed: true }, state.log.slice().reverse().map((e) => el('li', { class: e.sets?.length ? 'big' : '' }, logLine(c, e)))));
  }
  function finale(c) {
    const { state, send } = c, host = state.hostId === state.meId, loser = state.loser, me = loser === state.meId;
    return c.panel('finale-panel', el('div', { class: 'joker-reveal' }, c.card('JK')), text('span', 'eyebrow', 'GAME OVER'), el('h1', {}, me ? 'You’re stuck with the Joker!' : c.who(loser) + ' is stuck with the Joker!'),
      el('p', { class: 'muted' }, me ? 'The last Joker is yours. Better luck next round.' : 'Everyone else got out safely. Phew.'),
      el('div', { class: 'tally' }, text('span', 'eyebrow', 'JOKERS HELD'), ...state.players.map((p) => el('div', { class: 'tally-row' }, c.avatar(p.id), el('b', {}, p.name), text('span', 'tally-n', '×' + (state.losses[p.id] || 0))))),
      state.placed.length ? el('p', { class: 'muted small' }, 'Finish order: ' + state.placed.map((id, i) => (i + 1) + '. ' + c.who(id)).join('  ·  ')) : null,
      host ? [c.botControls(), c.button('PLAY AGAIN', () => send('start'), 'host-button start-ticket', state.players.filter((p) => !p.departed).length < 3, undefined, 'refresh:ink'), c.button('Shuffle seats', () => send('shuffleSeats'), 'secondary', false, undefined, 'shuffle:blue')] : text('p', 'waiting', 'Waiting for the host to start another game.'));
  }
  function screen(c) {
    const { state } = c; cur = c; requestAnimationFrame(() => after(c));
    return el('div', { class: 'tk-scene' }, state.phase === 'finished' ? finale(c) : null,
      c.panel('table-panel', circle(c), turnBanner(c)),
      el('div', { class: 'joker-grid' }, el('div', { class: 'main-col' }, privateNote(c), takePanel(c), handPanel(c)), el('div', { class: 'side-col' }, setsPanel(c), logPanel(c), c.roster((p, s) => s.losses[p.id] ? 'JOKER ×' + s.losses[p.id] : null))));
  }
})();





