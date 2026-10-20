function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'role' || k === 'tabindex') e.setAttribute(k, v);
    else e[k] = v;
  }
  for (const k of kids) e.append(k);
  return e;
}

// A card on screen. src ('hand' | slot index) makes it draggable (own cards only);
// onclick without src is a plain click. shared = visible to the other players.
function cardEl(id, { up = true, src = null, onclick = null, extra = '', shared = false, as = null, morph = false, prime = false } = {}) {
  if (id === '?') return el('div', { class: 'card back' });
  if (id !== 'JK') as = null;
  const face = as || id;   // `as`: the card a joker has turned into once its row is scored
  const suit = face.slice(-1), rank = face.slice(0, -1);
  const red = suit === 'H' || suit === 'D';
  const isJk = id === 'JK';
  const cls = ['card', red && !(isJk && !as) ? 'red' : '', isJk && !as ? '' : 's-' + suit, extra];
  if (isJk) cls.push(as ? 'joker-as' : 'joker');
  if (as && morph) cls.push('morph');
  if (!up) cls.push('down');
  if (prime && up) cls.push('prime', 'pt-' + (prime === true ? 'top' : prime));
  if (shared) cls.push('shared');
  if (src !== null) cls.push('mine');
  const jokerFace = () => [el('div', { class: 'jk-star' }, '★'), el('div', { class: 'jk-w' }, 'JOKER')];
  const e = isJk && !as
    ? el('div', { class: cls.join(' ') }, ...jokerFace())
    : el('div', { class: cls.join(' ') }, el('div', { class: 'ix' }, rank, el('i', {}, SUIT[suit])), el('div', { class: 'pip' }, SUIT[suit]), el('div', { class: 'ixr' }, el('div', { class: 'ix' }, rank, el('i', {}, SUIT[suit]))),
        ...(isJk ? [el('div', { class: 'jk-badge' }, '★'), ...(morph ? [el('div', { class: 'jk-cover' }, ...jokerFace())] : [])] : []));
  if (shared) e.title = t('shared');
  if (prime && up) { e.append(el('i', { class: 'cglint' })); if (prime === 'sflush' || prime === 'royal') e.append(el('i', { class: 'cstar a' }), el('i', { class: 'cstar b' })); }
  if (src === 'hand' || src === null && onclick) {
    e.tabIndex = 0; e.setAttribute('role', 'button');
    e.setAttribute('aria-label', cardLabel(id, up) + (src === 'hand' ? ', ' + t('cardInHand') : ''));
    e.dataset.focus = src === 'hand' ? 'hand-' + id : 'card-' + id;
    e.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault(); event.stopPropagation();
      if (src === 'hand') {
        keyboardPick = { src, card: id }; render(); focusKey('slot-0'); announce(t('selectedCard'));
      } else onclick(event);
    });
    if (src === 'hand') {
      e.setAttribute('aria-describedby', 'keyboard-hint');
      e.setAttribute('aria-pressed', String(keyboardPick?.src === 'hand' && keyboardPick.card === id));
    }
  }
  if (src !== null) enableDrag(e, src, id, onclick);
  else if (onclick) { e.onclick = onclick; e.style.cursor = 'pointer'; }
  return e;
}

// ---- pointer-based drag & drop (works with mouse and touch) ----
let dragging = false;
let touchDrag = false;   // true once a finger has picked a card up: only then do we stop the page from scrolling
document.addEventListener('touchmove', (e) => { if (touchDrag && e.cancelable) e.preventDefault(); }, { passive: false });

function enableDrag(node, src, cardId, onTap) {
  node.addEventListener('pointerdown', (ev) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    const touch = ev.pointerType === 'touch';
    const sx = ev.clientX, sy = ev.clientY;
    let ghost = null, over = null, armed = !touch, holdT = null, scrolled = false;
    const target = (x, y) => {
      const t = document.elementFromPoint(x, y);
      const hit = t && (t.closest('[data-slot]') || t.closest('[data-hand]'));
      if (hit) return hit;
      // dropped in a gap: snap to the nearest slot within 50px
      let best = null, bd = 50;
      document.querySelectorAll('[data-slot]').forEach((n) => {
        const r = n.getBoundingClientRect();
        const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
        if (d < bd) { bd = d; best = n; }
      });
      return best;
    };
    const stop = () => {
      clearTimeout(holdT); touchDrag = false; node.classList.remove('lifted');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    if (touch) holdT = setTimeout(() => {   // held still for a moment: the card is picked up
      armed = true; touchDrag = true; node.classList.add('lifted');
      buzz(10);
    }, 50);
    const move = (e) => {
      if (!armed) {   // finger moved before the hold finished: it's a scroll, leave it to the browser
        if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) { scrolled = true; stop(); }
        return;
      }
      if (!ghost) {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return;
        dragging = true; SND.play('lift');
        node.classList.remove('lifted');
        ghost = node.cloneNode(true);
        ghost.className = ghost.className.replace(/fx-\S+/g, '').trim() + ' ghost-card';
        ghost.style.animation = 'none';
        document.body.append(ghost);
        node.classList.add('dragging-src');
      }
      ghost.style.left = e.clientX + 'px';
      ghost.style.top = e.clientY + 'px';
      const t = target(e.clientX, e.clientY);
      if (t !== over) { over?.classList.remove('over'); over = t; over?.classList.add('over'); }
    };
    const up = (e) => {
      stop();
      if (!ghost) {   // a plain tap (never a cancelled or scrolled touch)
        if (e.type === 'pointerup' && !scrolled) onTap && onTap();
        return;
      }
      const t = target(e.clientX, e.clientY);
      ghost.remove(); over?.classList.remove('over'); node.classList.remove('dragging-src');
      dragging = false;
      if (e.type === 'pointercancel' || !t) return render();
      drop(src, cardId, t);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}

function drop(src, cardId, t) {
  if (t.dataset.hand !== undefined) {
    if (src === 'hand') return render();
    return act('unplace', { slot: src });
  }
  const to = Number(t.dataset.slot);
  if (src === 'hand') return act('place', { card: cardId, slot: to });
  if (src === to) return render();
  return act('move', { from: src, to });
}

// a picture of each row's rule: little example cards with what happens to each
function tipArt(r) {
  const col = (ids, mark, cls) => el('div', { class: 'tcol' }, gcards(ids), el('span', { class: 'tmark ' + cls }, mark));
  const wrap = (...k) => el('div', { class: 'tipart' }, ...k);
  if (r === 0 || r === 1) {
    const ids = r === 0 ? ['2C', '8D', 'AS'] : ['2C', '8D', 'AS'], bad = r === 0 ? 0 : 2;
    return wrap(...ids.map((c, i) => col([c], i === bad ? t('tipLoses') : t('tipSafe'), i === bad ? 'bad' : 'ok')), el('div', { class: 'tscale' }, r === 0 ? t('tipLowHigh') : t('tipLowHigh')));
  }
  if (r === 2) return wrap(
    el('div', { class: 'tcol wide' }, gcards(['KS', '10D']), el('span', { class: 'tmark ok' }, '0.5 + 10 = 10.5 ✓')),
    el('div', { class: 'tcol wide' }, gcards(['9C', '5H']), el('span', { class: 'tmark bad' }, '9 + 5 = 14 ✗ ' + t('tipOver'))));
  const names = ['none', 'pair', 'straight', 'flush', 'triple', 'sflush', 'royal'];
  return wrap(el('div', { class: 'tladder' }, ...names.map((k, i) => el('span', { class: 'tstep' + (i === 0 ? ' bad' : ' tt-' + k) }, t('gh_' + k)))), el('div', { class: 'tscale' }, t('tipWeakStrong')));
}
// the strongest card (or hand) a row can show: an Ace, a 2, an exact 10.5, a flush or better. These are the ones that raise the penalty, so they sparkle.
const CRANK = { A: 14, K: 13, Q: 12, J: 11 }, crank = (c) => CRANK[c.slice(0, -1)] || Number(c.slice(0, -1));
const cpts2 = (c) => { const r = c.slice(0, -1); return r === 'A' ? 2 : 'JQK'.includes(r) ? 1 : Number(r) * 2; };
const CALL = ['S', 'H', 'D', 'C'].flatMap((x) => ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map((r) => r + x));
const CHANDS = ['none', 'pair', 'straight', 'flush', 'triple', 'sflush', 'royal'];
function chandOf(cs) {   // the same ranking the server uses, as an index into CHANDS
  const rs = cs.map(crank).sort((a, b) => a - b), flush = cs.every((c) => c.slice(-1) === cs[0].slice(-1));
  const straight = (rs[1] === rs[0] + 1 && rs[2] === rs[1] + 1) || (rs[0] === 2 && rs[1] === 3 && rs[2] === 14);
  return straight && flush ? (rs[0] >= 10 ? 6 : 5) : rs[0] === rs[2] ? 4 : flush ? 3 : straight ? 2 : rs[0] === rs[1] || rs[1] === rs[2] ? 1 : 0;
}
// what a row's cards earn, or '' for nothing: 'top' for an Ace / 2 / exact 10.5, and the hand's own name for row 4 (any pattern sparkles, fancier the stronger it is)
function rowPrime(row, cs) {   // cs: the card ids of the row, all of them known
  const jk = cs.map((c, i) => c === 'JK' ? i : -1).filter((i) => i >= 0);
  if (row === 0) return cs[0] === 'JK' || cs[0].slice(0, -1) === 'A' ? 'top' : '';
  if (row === 1) return cs[0] === 'JK' || cs[0].slice(0, -1) === '2' ? 'top' : '';
  if (row === 2) { if (cs.length < 2) return ''; if (jk.length) { const o = cs.filter((c) => c !== 'JK'); return jk.length === 1 && o.length === 1 && (cpts2(o[0]) === 20 || cpts2(o[0]) === 1) ? 'top' : ''; } return cs.reduce((a, c) => a + cpts2(c), 0) === 21 ? 'top' : ''; }
  if (cs.length < 3) return '';
  const best = jk.length ? Math.max(...CALL.map((x) => chandOf(cs.map((c) => c === 'JK' ? x : c)))) : chandOf(cs);
  return best ? CHANDS[best] : '';
}
// a pair only lights up the two cards that make it (with a joker: the joker and the higher of the other two)
function pairMask(cs) {
  const ranks = cs.map((c) => c === 'JK' ? 'JK' : c.slice(0, -1));
  const j = cs.indexOf('JK');
  if (j >= 0) { const o = [0, 1, 2].filter((x) => x !== j).sort((a, b) => crank(cs[b]) - crank(cs[a]))[0]; return cs.map((_, x) => x === j || x === o); }
  return ranks.map((r) => ranks.filter((q) => q === r).length === 2);
}
// the sparkle tier of each card in a row once its cards are on show ('' for none); a pair lights only its two cards
function tiersOf(row, ids) {
  if (!ids.length || ids.some((c) => !c || c === '?')) return ids.map(() => '');
  const tier = rowPrime(row, ids);
  if (!tier) return ids.map(() => '');
  const mask = tier === 'pair' ? pairMask(ids) : null;
  return ids.map((_, i) => (mask && !mask[i] ? '' : tier));
}
let primeMemo = {};   // the tier each of your rows had last time it was drawn, so its flourish plays once
const PRIME_RANK = { top: 1, pair: 1, straight: 2, flush: 3, triple: 4, sflush: 5, royal: 6 };
let tipRow = null;   // which row's criteria tip is open
document.addEventListener('click', (e) => { if (tipRow !== null && !(e.target.closest && e.target.closest('.rowtip, .rowinfo'))) { tipRow = null; render(); } });
function boardEl(board, mine, pid) {
  const wrap = el('div', { class: 'board' });
  const me = st.players.find(p => p.id === st.meId);
  const dealt = st.phase === 'dealt';
  const canMove = mine && dealt && !me.ready;
  let i = 0;
  for (const [rowIdx, n] of ROWS.entries()) {
    const row = el('div', { class: 'r' });
    const rw = el('div', { class: 'rw' }, row);
    const rowSlots = board.slice(i, i + n), shown = (q) => q && q.c !== '?' && (mine ? (!me.ready || q.up) : q.up);
    const prime = rowSlots.every(shown) ? rowPrime(rowIdx, rowSlots.map((q) => q.c)) : '', pmask = prime === 'pair' ? pairMask(rowSlots.map((q) => q.c)) : null;
    if (mine && canMove) {   // placing: a flourish the moment a row first earns its sparkle (or earns a better one)
      const memo = primeMemo.round === st.round ? primeMemo : (primeMemo = { round: st.round });
      const was = memo[rowIdx];
      if (was !== undefined && prime && prime !== was && (was === '' || PRIME_RANK[prime] > PRIME_RANK[was])) SND.play('prime_' + prime);
      memo[rowIdx] = prime;
    }   // only when every card of the row is on show, so nothing hidden is given away
    rw.dataset.n = String(rowIdx + 1);
    for (let k = 0; k < n; k++, i++) {
      const slot = i, s = board[slot];
      let cls = 'slot', inner = '';
      const f = fx[pid + ':' + slot];
      const fxCls = f ? 'fx-' + f : '';
      if (s) {
        if (!mine) inner = cardEl(s.c, { up: s.up, extra: fxCls, prime: pmask && !pmask[k] ? '' : prime });
        else {
          // You see your own cards until you press Ready; then only the ones you flipped face up.
          const flip = () => act('flip', { slot });
          const look = { up: !me.ready || s.up, shared: !me.ready && s.up, extra: fxCls, prime: pmask && !pmask[k] ? '' : prime };
          inner = cardEl(s.c, canMove ? { ...look, src: slot, onclick: () => act('unplace', { slot }) } : { ...look, onclick: dealt ? flip : null });
        }
      }
      const node = el('div', { class: cls }, inner);
      if (canMove) {
        node.dataset.slot = slot; node.dataset.focus = 'slot-' + slot; node.tabIndex = 0;
        node.setAttribute('role', 'button');
        node.setAttribute('aria-label', t('cardAtSlot', { row: rowIdx + 1, slot: k + 1 }) + ': ' + (s ? cardLabel(s.c) : t('emptySlot')));
        node.setAttribute('aria-describedby', 'keyboard-hint');
        node.setAttribute('aria-pressed', String(keyboardPick?.src === slot));
        node.addEventListener('keydown', (event) => slotKeydown(event, slot));
      }
      row.append(node);
    }
    if (mine && dealt && !me.ready) {   // beginner help: an (i) per row explains how that row is won or lost
      rw.append(el('button', { type: 'button', class: 'rowinfo' + (tipRow === rowIdx ? ' on' : ''), 'aria-label': t('rowN', { n: rowIdx + 1 }), onclick: (e) => { e.stopPropagation(); tipRow = tipRow === rowIdx ? null : rowIdx; render(); } }, colorIcon(BULB_ICON, 24)));
      if (tipRow === rowIdx) rw.append(el('div', { class: 'rowtip', onclick: (e) => e.stopPropagation() },
        el('b', {}, t('rowN', { n: rowIdx + 1 }) + ' · ' + t('rule' + (rowIdx + 1))), tipArt(rowIdx), el('p', { class: 'tnote' }, t('tip' + (rowIdx + 1))), el('p', { class: 'tj' }, t('tipJoker')), el('p', { class: 'tp' }, '✦ ' + t('tipPrime' + (rowIdx + 1))),
        el('button', { type: 'button', class: 'ghost', onclick: () => { tipRow = null; render(); } }, t('tipClose'))));
    }
    if (mine && dealt && activePlayers().every((p) => p.ready)) {
      const cards = board.slice(i - n, i).filter(Boolean);
      const up = cards.length > 0 && cards.every((c) => c.up);   // already face up -> offer to flip back down
      if (st.isHost) {   // host only: open / close this row for everyone, on the left
        const start = i - n;
        const everyoneUp = activePlayers().every((pl) => pl.board.slice(start, start + n).every((c) => c && c.up));
        rw.append(el('button', { class: 'ghost rowbtn hostbtn', title: everyoneUp ? t('closeAllTip') : t('openAllTip'),
          onclick: () => act('flipRowAll', { row: rowIdx, up: !everyoneUp }) }, everyoneUp ? t('closeAll') : t('openAll')));
      }
      rw.append(el('button', { class: 'ghost rowbtn', title: up ? t('flipDownTip') : t('flipUpTip'), onclick: () => act('flipRow', { row: rowIdx, up: !up }) }, up ? t('flipDown') : t('flipUp')));
    }
    wrap.append(rw);
  }
  return wrap;
}

