(() => {
  'use strict';
  const el = TableKit.el, text = TableKit.text;
  const RANK_NAME = { A: 'Aces', K: 'Kings', Q: 'Queens', J: 'Jacks' };
  const rankName = (r) => RANK_NAME[r] || r + 's';
  const setName = r => 'a pair of '+rankName(r);
  let pickRect = null, sel = -1, cur = null, seen = null, prev = { hand: [], rel: new Map() }, lobbyCur = null, seatSel = null;
  // Cards and pair chips that are still on their way stay hidden until their flight lands. A render rebuilds the nodes
  // they are waiting on, so the holds are applied again after every render.
  const held = new Set(), heldChips = new Set();
  // After I take a card, the pick row's space is kept until the card has landed, so nothing jumps while it travels.
  let linger = null;
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
  const handCards = () => [...(document.querySelector('.hand-row')?.children || [])];
  const chipNode = (key) => { const [id, k] = key.split(':'); return document.querySelector('.set-row[data-id="' + id + '"] .sets')?.children[Number(k)]; };
  function applyHolds() {
    const hand = cur?.state.me?.hand || [];
    handCards().forEach((n, i) => { if (held.has(hand[i])) n.style.opacity = 0; });
    for (const key of heldChips) { const chip = chipNode(key); if (chip) chip.style.opacity = 0; }
  }
  function landCard(code) {
    held.delete(code); const i = (cur?.state.me?.hand || []).indexOf(code), n = handCards()[i];
    if (n) { n.style.opacity = ''; if (!calm()) n.animate([{ transform: 'scale(1.12)' }, { transform: 'none' }], { duration: 220, easing: 'ease-out' }); }
  }
  function landChip(key) { heldChips.delete(key); const chip = chipNode(key); if (chip) { chip.style.opacity = ''; chip.classList.add('pop'); } }
  function endLinger() {
    if (!linger || linger.phase === 'collapse') return;
    linger.phase = 'collapse'; clearTimeout(linger.timer);
    const sp = document.querySelector('.take-spacer'); if (sp) { sp.style.height = '0px'; sp.style.marginBottom = '0px'; sp.style.opacity = '0'; }
    setTimeout(() => { linger = null; cur?.render(); }, calm() ? 0 : 380);
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
    const a = wrap.animate([{ transform: at(from, 1), offset: 0 }, { transform: at(from, 1.18), offset: 0.3 }, { transform: at(from, 1.18), offset: 0.45 }, { transform: at(to, k2), offset: 1 }], { duration: 1100, easing: 'cubic-bezier(.4,.1,.2,1)', fill: 'forwards' });
    inner.animate([{ transform: 'rotateY(0deg)', offset: 0 }, { transform: 'rotateY(180deg)', offset: 0.35 }, { transform: 'rotateY(180deg)', offset: 1 }], { duration: 1100, easing: 'ease-in-out', fill: 'forwards' });
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
    // positions inside the row, so a page that scrolls or shifts is never mistaken for cards being rearranged
    const o = row?.getBoundingClientRect(), rel = new Map(); cards.forEach((n, i) => { const r = n.getBoundingClientRect(); if (hand[i]) rel.set(hand[i], { x: r.left - o.left, y: r.top - o.top, abs: r }); });
    const takes = (st.log || []).filter((e) => e.kind === 'take'), top = takes.reduce((m, e) => Math.max(m, e.turn || 0), 0);
    let handled = new Set();
    if (!seen || seen.match !== st.match) seen = { match: st.match, turn: top };
    else if (top > seen.turn && !document.hidden) {
      const fresh = takes.filter((e) => e.turn > seen.turn).slice(-2); seen.turn = top;
      fresh.forEach((e, k) => setTimeout(() => {
        const me = st.meId, last = st.me?.last, src = tileOf(e.source), dst = tileOf(e.taker);
        src?.classList.add('lost'); dst?.classList.add('got'); setTimeout(() => { src?.classList.remove('lost'); dst?.classList.remove('got'); }, 900);
        // the cards of a laid-down set travel from the taker into the "Pairs laid down" panel
        const chips = (e.sets || []).map((rank) => { const mineSets = st.sets.filter((x) => x.id === e.taker), at = mineSets.map((x) => x.rank).lastIndexOf(rank), key = e.taker + ':' + at;
          if (at >= 0) heldChips.add(key); return { key, set: mineSets[at] }; });
        applyHolds();
        const showChips = () => chips.forEach(({ key }) => landChip(key));
        setTimeout(showChips, 3600 + k * 700);
        const pair = () => {
          if (!e.sets?.length) return;
          burst(tileOf(e.taker), '✨ ' + (e.sets.length > 1 ? 'DOUBLE PAIR!' : 'PAIR!'));
          const origin = e.taker === me ? document.querySelector('.hand-row')?.getBoundingClientRect() || tileOf(e.taker)?.getBoundingClientRect() : tileOf(e.taker)?.getBoundingClientRect();
          chips.forEach(({ key, set }, j) => {
            const cardsOf = set?.cards || [], chip = chipNode(key), to = chip?.getBoundingClientRect();
            if (!to || !cardsOf.length) { landChip(key); return; }
            cardsOf.forEach((code, i) => setTimeout(() => fly(c, code, origin, to, 0.7, i === cardsOf.length - 1 ? () => landChip(key) : null), j * 300 + i * 140));
          });
        };
        if (e.taker === me && last?.card) {
          const idx = hand.indexOf(last.card), tgt = idx >= 0 ? handCards()[idx] : null;
          if (tgt) { held.add(last.card); applyHolds(); handled.add(last.card); }
          const landed = () => { landCard(last.card); endLinger(); pair(); }, dest = tgt ? tgt.getBoundingClientRect() : dst?.getBoundingClientRect();
          if (pickRect && Date.now() - pickRect.at < 8000) {
            const from = { ...pickRect, left: pickRect.left - (scrollX - pickRect.sx), top: pickRect.top - (scrollY - pickRect.sy) }; pickRect = null; flipFly(c, last.card, from, dest, landed);
          } else fly(c, last.card, src?.getBoundingClientRect(), dest, tgt ? 1 : 0.5, landed);
        } else if (e.source === me && last?.card) {
          fly(c, last.card, prev.rel.get(last.card)?.abs || row?.getBoundingClientRect(), dst?.getBoundingClientRect(), 0.5, pair);
        } else fly(c, null, src?.getBoundingClientRect(), dst?.getBoundingClientRect(), 0.5, pair);
      }, k * 700));
    }
    applyHolds();
    // reordering my own hand slides the cards to their new places
    if (!calm() && hand.length === prev.hand.length) cards.forEach((n, i) => { const was = prev.rel.get(hand[i]), now = rel.get(hand[i]); if (!was || !now || handled.has(hand[i]) || held.has(hand[i])) return;
      const dx = was.x - now.x, dy = was.y - now.y; if (Math.abs(dx) + Math.abs(dy) > 2) n.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' }); });
    prev = { hand: hand.slice(), rel };
  }

  // ---- drag and drop to reorder my own cards ----
  let drag = null, justDragged = false;
  const nearest = (x, y) => { const row = document.querySelector('.hand-row'); if (!row) return -1; let best = -1, d = 1e9;
    [...row.children].forEach((n, i) => { const r = n.getBoundingClientRect(), dd = Math.hypot(x - (r.left + r.width / 2), (y - (r.top + r.height / 2)) * 1.6); if (dd < d) { d = dd; best = i; } }); return best; };
  const mark = (from, to) => { const row = document.querySelector('.hand-row'); if (!row) return; [...row.children].forEach((n, i) => { n.classList.toggle('hj-drag-src', i === from); n.classList.toggle('hj-drop', i === to && to !== from); }); };
  document.addEventListener('pointerdown', (ev) => {
    const node = ev.target.closest?.('.hand-row .pcard'); if (!node || (ev.button && ev.button !== 0) || !cur || cur.busy || cur.state?.phase !== 'playing' || cur.state.source === cur.state.meId) return;
    const row = node.parentElement, from = [...row.children].indexOf(node); if (from < 0 || row.children.length < 2) return;
    drag = { from, to: from, x: ev.clientX, y: ev.clientY, on: false, ghost: null, w: node.offsetWidth, h: node.offsetHeight };
  });
  document.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    if (cur?.state.source === cur?.state.meId) { drag.ghost?.remove(); drag = null; mark(-1, -1); return; }
    if (!drag.on) { if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 8) return;
      const src = document.querySelector('.hand-row')?.children[drag.from]; if (!src) { drag = null; return; }
      drag.on = true; drag.ghost = src.cloneNode(true); drag.ghost.classList.add('hj-ghost'); drag.ghost.style.width = drag.w + 'px'; drag.ghost.style.height = drag.h + 'px'; document.body.append(drag.ghost); }
    ev.preventDefault(); drag.ghost.style.transform = 'translate(' + (ev.clientX - drag.w / 2) + 'px,' + (ev.clientY - drag.h / 2) + 'px) rotate(-5deg) scale(1.08)';
    drag.to = nearest(ev.clientX, ev.clientY); mark(drag.from, drag.to);
  }, { passive: false });
  const finish = async (ev) => {
    const d = drag; drag = null; if (!d || !d.on) return;
    d.ghost.remove(); mark(-1, -1); justDragged = true; setTimeout(() => { justDragged = false; }, 50);
    if (ev.type === 'pointerup' && d.to >= 0 && d.to !== d.from && cur && !cur.busy && cur.state.source !== cur.state.meId) { sel = -1; const h = cur.state.me.hand.slice(); h.splice(d.to, 0, h.splice(d.from, 1)[0]); cur.state.me.hand = h; cur.render(); await cur.send('move', { from: d.from, to: d.to }); }
  };
  document.addEventListener('pointerup', finish); document.addEventListener('pointercancel', finish);
  // drag a player's seat onto another seat
  let seatDrag = null, justSeatDragged = false;
  const seatUnder = (x, y) => document.elementFromPoint(x, y)?.closest?.('.seat-tile');
  const markSeat = (over) => document.querySelectorAll('.seat-tile').forEach((n) => n.classList.toggle('hj-drop', n === over));
  document.addEventListener('pointerdown', (ev) => {
    const tile = ev.target.closest?.('.seat-tile.movable'); if (!tile || (ev.button && ev.button !== 0) || !lobbyCur || lobbyCur.busy) return;
    seatDrag = { id: tile.dataset.id, x: ev.clientX, y: ev.clientY, on: false, ghost: null, w: tile.offsetWidth, h: tile.offsetHeight, over: null, tile };
  });
  document.addEventListener('pointermove', (ev) => {
    if (!seatDrag) return;
    if (!seatDrag.on) { if (Math.hypot(ev.clientX - seatDrag.x, ev.clientY - seatDrag.y) < 8) return;
      seatDrag.on = true; seatDrag.ghost = seatDrag.tile.cloneNode(true); seatDrag.ghost.classList.add('hj-ghost'); seatDrag.ghost.style.width = seatDrag.w + 'px'; document.body.append(seatDrag.ghost); seatDrag.tile.classList.add('hj-drag-src'); }
    ev.preventDefault(); seatDrag.ghost.style.transform = 'translate(' + (ev.clientX - seatDrag.w / 2) + 'px,' + (ev.clientY - seatDrag.h / 2) + 'px) scale(1.06)';
    const over = seatUnder(ev.clientX, ev.clientY); seatDrag.over = over && over.dataset.id !== seatDrag.id ? over : null; markSeat(seatDrag.over);
  }, { passive: false });
  const finishSeat = (ev) => {
    const d = seatDrag; seatDrag = null; if (!d || !d.on) return;
    d.ghost.remove(); d.tile.classList.remove('hj-drag-src'); markSeat(null); justSeatDragged = true; setTimeout(() => { justSeatDragged = false; }, 60);
    if (ev.type === 'pointerup' && d.over && lobbyCur && !lobbyCur.busy) { seatSel = null; lobbyCur.send('swapSeats', { a: d.id, b: d.over.dataset.id }); }
  };
  document.addEventListener('pointerup', finishSeat); document.addEventListener('pointercancel', finishSeat);
  document.addEventListener('click', (ev) => { if (justDragged) { ev.stopPropagation(); ev.preventDefault(); } }, true);

  TableKit({
    game: 'hot-joker', api: '/api/hot-joker', page: '/hot-joker.html', seatKey: 'hj-seat', nameKey: 'hj-name', title: 'Last Laugh', icon: 'cards', min: 3, max: 10,
    footer: 'Last Laugh · Take a card. Lay down pairs. Don’t get stuck with the Joker.',
    announce: { playing: 'The cards are dealt. Match pairs and get rid of the Joker.', finished: 'The game is over.' },
    scene: (s) => s.phase,
    landing: {
      art: () => el('div', { class: 'club-art', 'aria-hidden': 'true' }, el('img', { src: '/game-art/hot-joker.webp', alt: '', width: 1200, height: 800, fetchPriority: 'high' })),
      eyebrow: 'TAKE. MATCH. PASS THE JOKER.', title: ['Last', 'Laugh.'], lead: 'Everyone holds hidden cards. Take one from the player before you, lay down matching pairs, and make sure you are not the last one holding the Joker.',
      chips: ['3–10 players', 'Hidden cards', 'One Joker loses'], steps: [['hand', 'Take a hidden card'], ['cards', 'Lay down pairs'], ['eye', 'Dodge the Joker']],
      note: 'Everyone uses their own phone. Sit around the table in the order shown in the room.',
    },
    waitingChips: ['3–10 players', 'Pairs go down', 'Last Joker loses'],
    startBlock: (s, n) => (n < 3 ? `Waiting for ${3 - n} more player${3 - n === 1 ? '' : 's'}. You need at least 3.` : ''),
    hideSeatGrid: true,
    rosterTag: (p, s) => { const n = s.losses?.[p.id]; return p.id === s.hostId ? 'HOST' + (n ? ' · JOKER ×' + n : '') : n ? 'JOKER ×' + n : null; },
    waiting: (c) => seating(c),
    guide: (B) => [
      () => [B.h('Don’t get stuck with the Joker'), B.p('A deck of 52 cards plus one Joker is dealt to everyone. Your cards are hidden from the other players. Get rid of every card. The last player still holding cards has the Joker, and loses.'),
        B.chips(['3–10 players', 'Hidden cards', 'One Joker loses']),
        B.cards([B.back(), B.back(), B.card('★'), B.back(), B.back()], 'fan'),
        B.note('Somewhere in that fan is the Joker. Nobody knows where.')],
      () => [B.h('Pairs go down'), B.p('Whenever you hold two cards with the same number or face, they are put down automatically as a pair for everyone to see.'),
        B.row([B.example('Pair!', B.cards([B.card('7', '♥'), B.card('7', '♣')]), 'Laid down', 'good'), B.example('No pair', B.cards([B.card('9', '♠'), B.card('K', '♦')]), 'Keep both', 'bad')])],
      () => [B.h('Your turn'), B.steps([['👈', 'Take a hidden card', 'Take one face-down card from the previous player who still has cards.'], ['✨', 'Match it', 'If it makes a pair with a card you hold, the pair goes down.'], ['🔀', 'Shuffle your hand', 'You can rearrange your cards until another player starts drawing from you.']]),
        B.dim('Players take turns clockwise around the circle.')],
      () => [B.h('Get out, or get stuck'), B.p('When you have no cards left you are safe. The game goes on until only one player still holds cards. That player is stuck with the Joker.'),
        B.row([B.example('Safe', B.el('div', { style: 'font-size:34px;line-height:60px' }, '🎉'), 'No cards left', 'good'), B.example('Stuck!', B.cards([B.card('★')]), 'Holding the Joker', 'bad')])],
      () => [B.h('Good to know'), B.list(['Nobody can see anyone’s hand, only how many cards they hold.', 'Pairs that have been laid down are shown under each player.', 'If a player takes too long, the game takes a random card for them.', 'If someone leaves, the game plays on for them.', 'Sit around the table in the order shown in the room.'])],
    ],

    rulesTitle: 'Don’t get stuck with the Joker.',
    rules: () => [
      el('p', {}, 'A deck of 52 cards plus one Joker is dealt out to everyone. Your cards are hidden from the other players.'),
      el('ol', {},
        el('li', {}, el('b', {}, 'Pairs go down. '), 'Whenever you hold two cards with the same number or face, like two 7s, they are put down automatically as a pair for everyone to see.'),
        el('li', {}, el('b', {}, 'Take a hidden card. '), 'Players take turns clockwise around the circle. On your turn, take one face-down card from the previous player who still has cards. If it makes a pair, the pair goes down.'),
        el('li', {}, el('b', {}, 'Keep your cards safe. '), 'You can rearrange your cards until another player starts drawing from you.'),
        el('li', {}, el('b', {}, 'Get out. '), 'When you have no cards left you are safe. The game goes on until only one player still holds cards. That player is stuck with the Joker and loses!')),
      el('p', { class: 'muted small' }, 'Nobody can see anyone’s hand, only how many cards they hold. Pairs that have been laid down are shown under each player. If a player takes too long, the game takes a random card for them. If someone leaves, the game plays on for them.'),
    ],
    screen: (c) => screen(c),
  });

  // Seats: the host can seat anyone, and every player can move their own seat. The list is the clockwise order of the next game.
  // Seats are shown as the circle the game is played in. Drag a player onto another seat to swap them, or tap one and then
  // the other. The host can seat anyone; each player can move only their own seat.
  const canMove = (c, id) => c.state.hostId === c.state.meId || id === c.state.meId;
  function seatCircle(c) {
    const { state } = c, order = state.seatOrder || state.order, n = order.length, me = Math.max(0, order.indexOf(state.meId)), rad = n > 6 ? 40 : 36;
    const spot = (i) => { const k = (i - me + n) % n, a = ((180 + (k * 360) / n) * Math.PI) / 180; return { x: 50 + rad * Math.sin(a), y: 50 - rad * Math.cos(a) }; };
    return el('div', { class: 'circle seat-circle' + (n > 6 ? ' dense' : ''), role: 'list', 'aria-label': 'Seats around the table, clockwise' },
      el('div', { class: 'circle-centre' }, text('span', 'eyebrow', 'CLOCKWISE'), el('b', {}, n + (n === 1 ? ' seat' : ' seats')), text('small', 'muted', seatSel ? 'Now tap the seat to swap with.' : 'Drag a player onto another seat to swap.')),
      order.map((id, i) => {
        const p = spot(i), movable = canMove(c, id), bot = !!state.players.find((q) => q.id === id)?.bot;
        return el('div', { class: 'circle-seat', role: 'listitem', style: 'left:' + p.x + '%;top:' + p.y + '%' },
          el('button', { type: 'button', class: 'tile seat-tile' + (id === state.meId ? ' mine' : '') + (bot ? ' seat-bot' : '') + (movable ? ' movable' : '') + (seatSel === id ? ' picked' : ''), 'data-id': id, 'aria-pressed': String(seatSel === id), 'aria-label': 'Seat ' + (i + 1) + ': ' + c.who(id), onclick: () => {
            if (justSeatDragged) return;
            if (!seatSel) { if (movable) seatSel = id; }
            else if (seatSel === id) seatSel = null;
            else { const a = seatSel; seatSel = null; c.send('swapSeats', { a, b: id }); }
            c.render();
          } }, c.avatar(id), el('b', {}, c.who(id) + (id === state.meId ? ' · You' : '')), text('small', 'count', (bot ? 'BOT · ' : '') + 'SEAT ' + (i + 1))));
      }));
  }
  function seating(c) {
    const { state } = c, host = state.hostId === state.meId, order = state.seatOrder || state.order;
    lobbyCur = c;
    return el('div', { class: 'seat-order' }, text('span', 'eyebrow', 'TABLE SEATING'), seatCircle(c),
      text('p', 'muted small', (host ? 'Drag any player onto another seat to swap them. ' : 'Drag yourself onto another seat to swap. ') + 'Each player takes cards from the one before them, going clockwise. Sit in this order around the table.'),
      text('p','pairs-rule','Pairs Only · Match two cards with the same number or face.'),
      host ? c.button('Shuffle seats', () => c.send('shuffleSeats'), 'secondary', order.length < 2, undefined, 'shuffle:blue') : null);
  }
  function logLine(c, e) {
    return c.who(e.taker) + ' laid down ' + e.sets.map(r=>setName(r)).join(' and ') + '.';
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
    const { state } = c, order = state.order, n = order.length, me = Math.max(0, order.indexOf(state.meId)), total = 26;
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
      el('div', { class: 'circle-centre' }, text('span', 'eyebrow', 'PAIRS DOWN'), el('b', {}, state.sets.length + ' / ' + total), text('small', 'muted', state.phase === 'playing' && state.taker ? c.who(state.taker) + ' → ' + c.who(state.source) : '')),
      order.map((id) => {
        const out = state.counts[id] === 0, taker = state.taker === id, source = state.source === id, place = state.placed.indexOf(id) + 1, p = spot(id);
        const sets = state.sets.filter((s) => s.id === id).length;
        return el('div', { class: 'circle-seat', role: 'listitem', 'data-id': id, style: 'left:' + p.x + '%;top:' + p.y + '%' },
          el('div', { class: 'tile' + (out ? ' out' : '') + (taker ? ' taker' : '') + (source ? ' source' : '') + (id === state.meId ? ' mine' : '') + (state.loser === id ? ' loser' : '') },
            c.avatar(id), el('b', {}, c.who(id) + (id === state.meId ? ' · You' : '')),
            el('div', { class: 'mini-fan', 'aria-hidden': 'true' }, ...Array.from({ length: Math.min(state.counts[id], 7) }, (_, k) => el('i', { style: '--k:' + k }))),
            text('small', 'count', out ? 'SAFE · #' + place : state.counts[id] + (state.counts[id] === 1 ? ' card' : ' cards')),
            taker ? text('span', 'badge taking', 'TAKING') : source ? text('span', 'badge holding', 'TAKEN FROM') : null,
            sets ? text('small', 'sets-count', sets + (sets === 1 ? ' pair' : ' pairs')) : null));
      }));
  }
  function turnBanner(c) {
    const { state } = c; if (state.phase !== 'playing') return null;
    const mine = state.taker === state.meId, out = state.me.out;
    const msg = mine ? 'Your turn. Take a card from ' + c.who(state.source) + '.' : state.source === state.meId ? c.who(state.taker) + ' is taking a card from you.' : c.who(state.taker) + ' is taking a card from ' + c.who(state.source) + '…';
    return el('div', { class: 'turn-banner' + (mine ? ' mine' : ''), role: 'status' }, out ? c.icon('check') : mine ? c.icon('hand') : null, el('span', {}, msg), state.deadline ? el('span', { class: 'banner-timer' }, c.countdown()) : null);
  }
  // On my turn the pick-a-card row sits at the top of my cards container, so everything happens in one place.
  const cols = (n) => '--cols:' + Math.max(1, Math.min(n, 6));
  function takeSection(c) {
    const { state, send } = c;
    const taken = !!linger && linger.phase === 'hold';
    return el('section', { class: 'take-panel active' + (taken ? ' taken' : '') }, text('span', 'eyebrow', 'YOUR TURN'), el('h2', {}, 'Pick a card from ' + c.who(state.source)),
      el('p', { class: 'muted small' }, 'They are holding ' + state.sourceCount + (state.sourceCount === 1 ? ' card' : ' cards') + ', in this order. Tap one to take it.'),
      el('div', { class: 'pick-row', 'data-scroll': 'pick', style: cols(state.sourceCount) }, ...Array.from({ length: state.sourceCount }, (_, i) => el('button', { type: 'button', class: 'pcard back playable', 'data-focus': 'pick-' + i, 'aria-label': 'Card ' + (i + 1) + ' of ' + state.sourceCount, disabled: c.busy || taken, style: taken && linger.index === i ? 'visibility:hidden' : null, onclick: async () => {
        if (c.busy) return;
        const node = document.querySelectorAll('.pick-row .pcard')[i], pr = node?.getBoundingClientRect(), sec = document.querySelector('.take-panel');
        if (pr) pickRect = { left: pr.left, top: pr.top, width: pr.width, height: pr.height, at: Date.now(), sx: scrollX, sy: scrollY };
        if (sec && !calm()) { linger = { phase: 'hold', index: i, height: sec.offsetHeight + (parseFloat(getComputedStyle(sec).marginBottom) || 0), timer: setTimeout(endLinger, 3600) }; sec.classList.add('taken'); }
        if (node) node.style.visibility = 'hidden';
        // the dimmed pick row stays in view (a copy, in the same place) until the card has landed
        if (linger && sec) { linger.clone = sec.cloneNode(true); linger.clone.querySelectorAll('button').forEach((b) => { b.disabled = true; b.removeAttribute('data-focus'); }); }
        // a rejected take (someone else was faster) puts the pick row back
        if (!await send('take', { index: i, turn: state.turn }) && linger) { clearTimeout(linger.timer); linger = null; c.render(); }
      } }))));
  }
  function handPanel(c) {
    const { state, send } = c, hand = state.me.hand, playing = state.phase === 'playing';
    if (sel >= hand.length) sel = -1;
    const arrange = playing && hand.length > 1 && state.source !== state.meId;
    if (!arrange) sel = -1;
    const turn = playing && state.taker === state.meId;
    const spacer = !turn && linger ? el('div', { class: 'take-spacer', style: 'height:' + (linger.phase === 'collapse' ? 0 : linger.height) + 'px' }, linger.phase === 'collapse' ? null : linger.clone?.cloneNode(true) || null) : null;
    return c.panel('hand-panel' + (state.source === state.meId ? ' being-taken' : '') + (turn || linger ? ' my-turn' : ''), turn ? takeSection(c) : spacer, el('div', { class: 'panel-heading' }, el('div', {}, text('span', 'eyebrow', 'KEEP THIS PRIVATE'), el('h3', {}, hand.length ? 'Your cards' : state.phase === 'finished' ? 'Your last cards' : 'You are safe!')), text('span', 'hcp', hand.length + (hand.length === 1 ? ' card' : ' cards'))),
      state.source === state.meId && playing ? el('p', { class: 'warn small' }, 'Your cards are locked while someone is drawing from you.') : null,
      hand.length ? el('div', { class: 'hand-row', 'data-scroll': 'hand', style: cols(hand.length) }, hand.map((code, i) => c.card(code, { selected: sel === i, onclick: arrange ? () => { sel = sel === i ? -1 : i; c.render(); } : undefined, label: undefined }))) : text('p', 'muted', state.me.place ? 'You finished #' + state.me.place + '. Watch the others sweat.' : 'No cards left.'),
      arrange ? el('div', { class: 'arrange' },
        c.button('Left', async () => { const from = sel; if (from > 0 && await send('move', { from, to: from - 1 })) sel = from - 1; }, 'secondary', sel <= 0, 'move-left', 'arrowL:blue'),
        c.button('Shuffle', async () => { await send('shuffle'); sel = -1; }, 'secondary', false, 'shuffle', 'shuffle:purple'),
        c.button('Right', async () => { const from = sel; if (from >= 0 && from < hand.length - 1 && await send('move', { from, to: from + 1 })) sel = from + 1; }, 'secondary', sel < 0 || sel >= hand.length - 1, 'move-right', 'arrowR:blue')) : null,
      arrange ? text('p', 'muted small', 'Drag a card to a new spot, or tap it and use the arrows. Shuffle mixes them all.') : null);
  }
  // Once I am safe I can watch the others: every card still in play, face up, in the same order its owner sees.
  function observerPanel(c) {
    const { state } = c, ids = state.order.filter((id) => state.reveal[id]);
    return c.panel('hand-panel observer-panel', el('div', { class: 'panel-heading' }, el('div', {}, text('span', 'eyebrow', 'SAFE PLAYERS ONLY'), el('h3', {}, 'You are safe!' + (state.me.place ? ' #' + state.me.place : ''))), text('span', 'hcp', ids.length + (ids.length === 1 ? ' player left' : ' players left'))),
      text('p', 'muted small', 'You can watch everyone who is still playing. Please do not tell them what you see.'),
      el('div', { class: 'reveal-list' }, ids.map((id) => {
        const hand = state.reveal[id], taker = state.taker === id, source = state.source === id;
        return el('div', { class: 'reveal-seat' + (taker ? ' taker' : '') + (source ? ' source' : ''), 'data-id': id },
          el('div', { class: 'reveal-who' }, c.avatar(id), el('b', {}, c.who(id)), text('small', 'muted', hand.length + (hand.length === 1 ? ' card' : ' cards')), taker ? text('span', 'badge taking', 'TAKING') : source ? text('span', 'badge holding', 'TAKEN FROM') : null),
          el('div', { class: 'reveal-hand', style: cols(hand.length) }, hand.map((code) => c.card(code))));
      })));
  }
  // Every set that has been laid down, grouped by who laid it.
  function setsPanel(c) {
    const { state } = c, total = 26;
    const rows = state.order.map((id) => ({ id, sets: state.sets.filter((s) => s.id === id) })).filter((r) => r.sets.length);
    return c.panel('sets-panel', el('div', { class: 'panel-heading' }, el('h3', {}, 'Pairs Laid Down'), text('span', 'roster-count', state.sets.length + ' / ' + total)),
      rows.length ? el('div', { class: 'set-rows' }, rows.map((r) => el('div', { class: 'set-row' + (r.id === state.meId ? ' mine' : ''), 'data-id': r.id },
        el('div', { class: 'set-owner' }, c.avatar(r.id), el('b', {}, c.who(r.id) + (r.id === state.meId ? ' · You' : '')), text('small', 'muted', r.sets.length + (r.sets.length === 1 ? ' pair' : ' pairs'))),
        el('div', { class: 'sets' }, r.sets.map((s, i) => el('span', { class: 'set-chip' + (c.fresh('hj-set-' + state.match + ':' + r.id + ':' + i) ? ' pop' : ''), 'aria-label': setName(s.rank) }, (s.cards || []).map((code) => mini(code, c)))))))
      ) : text('p', 'muted small', 'No pairs yet. Match two cards with the same number to lay them down.'));
  }
  function logPanel(c) {
    const { state } = c;
    const events = state.log.filter(e=>e.sets?.length).slice().reverse();
    return c.panel('log-panel', el('h3', {}, 'What Happened'), events.length ? el('ol', { class:'log', reversed:true }, events.map(e=>el('li',{class:'big'},logLine(c,e)))) : text('p','muted small','Laid-down pairs will appear here.'));
  }
  function finale(c) {
    const { state, send } = c, host = state.hostId === state.meId, loser = state.loser, me = loser === state.meId;
    return c.panel('finale-panel', el('div', { class: 'joker-reveal' }, c.card('JK')), text('span', 'eyebrow', 'GAME OVER'), el('h1', {}, me ? 'You’re stuck with the Joker!' : c.who(loser) + ' is stuck with the Joker!'),
      el('p', { class: 'muted' }, me ? 'The last Joker is yours. Better luck next round.' : 'Everyone else got out safely. Phew.'),
      el('div', { class: 'tally' }, text('span', 'eyebrow', 'JOKERS HELD'), ...state.players.map((p) => el('div', { class: 'tally-row' }, c.avatar(p.id), el('b', {}, p.name), text('span', 'tally-n', '×' + (state.losses[p.id] || 0))))),
      state.placed.length ? el('p', { class: 'muted small' }, 'Finish order: ' + state.placed.map((id, i) => (i + 1) + '. ' + c.who(id)).join('  ·  ')) : null,
      seating(c), host ? [c.botControls(), c.button('PLAY AGAIN', () => send('start'), 'host-button start-ticket', state.players.filter((p) => !p.departed).length < 3, undefined, 'refresh:ink')] : text('p', 'waiting', 'Waiting for the host to start another game.'));
  }
  function screen(c) {
    const { state } = c; cur = c; requestAnimationFrame(() => after(c));
    return el('div', { class: 'tk-scene' }, state.phase === 'finished' ? finale(c) : null,
      c.panel('table-panel', circle(c), turnBanner(c)),
      el('div', { class: 'joker-grid' }, el('div', { class: 'main-col' }, state.reveal ? observerPanel(c) : handPanel(c), privateNote(c)), el('div', { class: 'side-col' }, setsPanel(c), logPanel(c))));
  }
})();





