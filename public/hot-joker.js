(() => {
  'use strict';
  const el = TableKit.el, text = TableKit.text;
  const RANK_NAME = { A: 'Aces', K: 'Kings', Q: 'Queens', J: 'Jacks' };
  const rankName = (r) => RANK_NAME[r] || r + 's';
  let pick = -1, sel = -1, pickKey = '';

  TableKit({
    game: 'hot-joker', api: '/api/hot-joker', page: '/hot-joker.html', seatKey: 'hj-seat', nameKey: 'hj-name', title: 'Hot Joker', icon: 'cards', min: 3, max: 10,
    footer: 'Hot Joker · Take a card. Make sets of four. Don’t get stuck with the Joker.',
    announce: { playing: 'The cards are dealt. Match four of a kind and get rid of the Joker.', finished: 'The game is over.' },
    scene: (s) => s.phase,
    landing: {
      eyebrow: 'TAKE. MATCH. PASS THE JOKER.', title: ['Hot', 'Joker.'], lead: 'Everyone holds hidden cards. Take one from the player before you, lay down four of a kind, and make sure you are not the last one holding the Joker.',
      chips: ['3–10 players', 'Hidden cards', 'One Joker loses'], steps: [['hand', 'Take a hidden card'], ['cards', 'Lay down four'], ['eye', 'Dodge the Joker']],
      note: 'Everyone uses their own phone. Sit around the table in the order shown in the room.',
    },
    waitingChips: ['3–10 players', 'Four of a kind goes down', 'Last Joker loses'],
    startBlock: (s, n) => (n < 3 ? `Waiting for ${3 - n} more player${3 - n === 1 ? '' : 's'}. You need at least 3.` : ''),
    rosterTag: (p, s) => { const n = s.losses?.[p.id]; return p.id === s.hostId ? 'HOST' + (n ? ' · JOKER ×' + n : '') : n ? 'JOKER ×' + n : null; },
    waiting: (c) => seating(c),
    rulesTitle: 'Don’t get stuck with the Joker.',
    rules: () => [
      el('p', {}, 'A deck of 52 cards plus one Joker is dealt out to everyone. Your cards are hidden from the other players.'),
      el('ol', {},
        el('li', {}, el('b', {}, 'Four of a kind goes down. '), 'Whenever you hold all four cards of the same number or face, like four 7s, they are put down automatically as a complete set.'),
        el('li', {}, el('b', {}, 'Take a hidden card. '), 'Players take turns clockwise. On your turn, take one face-down card from the previous player who still has cards. If a set is made, it goes down.'),
        el('li', {}, el('b', {}, 'Keep your cards safe. '), 'You can shuffle your cards or move them around so nobody can guess where the Joker is.'),
        el('li', {}, el('b', {}, 'Get out. '), 'When you have no cards left you are safe. The game goes on until only one player still holds cards. That player is stuck with the Joker and loses!')),
      el('p', { class: 'muted small' }, 'Nobody can see anyone’s cards, only how many they hold. If a player takes too long (40 seconds), the game takes a random card for them. If someone leaves, the game plays on for them. If nobody can make a set for three full rounds, the remaining sets are laid down and the player holding the Joker loses.'),
    ],
    screen: (c) => screen(c),
  });

  function seating(c) {
    const { state } = c, host = state.hostId === state.meId;
    return el('div', { class: 'seat-order' }, text('span', 'eyebrow', 'CLOCKWISE ORDER'),
      el('ol', { class: 'order-list' }, state.order.map((id) => el('li', {}, c.avatar(id), el('b', {}, c.who(id) + (id === state.meId ? ' · You' : ''))))),
      text('p', 'muted small', 'Each player takes cards from the one before them in this list. Sit in this order around the table.'),
      host ? c.button('Shuffle seats', () => c.send('shuffleSeats'), 'secondary', state.order.length < 2) : null);
  }
  function logLine(c, e) {
    if (e.kind === 'deal') return c.who(e.taker) + ' goes first.';
    const sets = e.sets.map((r) => ' laid down four ' + rankName(r));
    return c.who(e.taker) + ' took a card from ' + c.who(e.source) + (sets.length ? ' and' + sets.join(' and') + '!' : '.');
  }
  function privateNote(c) {
    const last = c.state.me.last; if (!last || c.state.phase !== 'playing') return null;
    const fresh = c.fresh('hj-note-' + c.state.match + ':' + last.turn);
    return el('div', { class: 'private-note ' + last.kind + (fresh ? ' pop' : ''), role: 'status' }, c.card(last.card, { small: true }), el('div', {}, text('small', 'eyebrow', 'ONLY YOU CAN SEE THIS'),
      el('b', {}, last.kind === 'got' ? 'You took this card from ' + c.who(last.other) : c.who(last.other) + ' took this card from you')));
  }
  function ring(c) {
    const { state } = c, counts = state.counts;
    return el('div', { class: 'ring', role: 'list', 'aria-label': 'Players in clockwise order' }, state.order.flatMap((id, i) => {
      const out = counts[id] === 0, taker = state.taker === id, source = state.source === id, place = state.placed.indexOf(id) + 1;
      const sets = state.sets.filter((s) => s.id === id);
      const tile = el('div', { role: 'listitem', class: 'tile' + (out ? ' out' : '') + (taker ? ' taker' : '') + (source ? ' source' : '') + (id === state.meId ? ' mine' : '') + (state.loser === id ? ' loser' : '') },
        c.avatar(id), el('b', {}, c.who(id) + (id === state.meId ? ' · You' : '')),
        el('div', { class: 'mini-fan', 'aria-hidden': 'true' }, ...Array.from({ length: Math.min(counts[id], 7) }, (_, k) => el('i', { style: '--k:' + k }))),
        text('small', 'count', out ? 'SAFE · #' + place : counts[id] + (counts[id] === 1 ? ' card' : ' cards')),
        taker ? text('span', 'badge taking', 'TAKING') : source ? text('span', 'badge holding', 'CARDS TAKEN FROM') : null,
        sets.length ? text('small', 'sets-count', sets.length + (sets.length === 1 ? ' set' : ' sets')) : null);
      return [tile, i < state.order.length - 1 ? text('span', 'ring-arrow', '→') : text('span', 'ring-arrow', '↻')];
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
      c.button(pick >= 0 ? 'Take card ' + (pick + 1) : 'Choose a card', async () => { const i = pick; if (await send('take', { index: i, turn: state.turn })) pick = -1; }, 'primary', pick < 0, 'take-confirm'));
  }
  function handPanel(c) {
    const { state, send } = c, hand = state.me.hand, playing = state.phase === 'playing';
    if (sel >= hand.length) sel = -1;
    const arrange = playing && hand.length > 1;
    return c.panel('hand-panel' + (state.source === state.meId ? ' being-taken' : ''), el('div', { class: 'panel-heading' }, el('div', {}, text('span', 'eyebrow', 'KEEP THIS PRIVATE'), el('h3', {}, hand.length ? 'Your cards' : state.phase === 'finished' ? 'Your last cards' : 'You are safe!')), text('span', 'hcp', hand.length + (hand.length === 1 ? ' card' : ' cards'))),
      state.source === state.meId && playing ? el('p', { class: 'warn small' }, c.who(state.taker) + ' is about to pick one of these. Move or shuffle your cards now.') : null,
      hand.length ? el('div', { class: 'hand-row', 'data-scroll': 'hand' }, hand.map((code, i) => c.card(code, { selected: sel === i, onclick: arrange ? () => { sel = sel === i ? -1 : i; c.render(); } : undefined, label: undefined }))) : text('p', 'muted', state.me.place ? 'You finished #' + state.me.place + '. Watch the others sweat.' : 'No cards left.'),
      arrange ? el('div', { class: 'arrange' },
        c.button('← Left', async () => { const from = sel; if (from > 0 && await send('move', { from, to: from - 1 })) sel = from - 1; }, 'secondary', sel <= 0, 'move-left'),
        c.button('Shuffle', async () => { await send('shuffle'); sel = -1; }, 'secondary', false, 'shuffle'),
        c.button('Right →', async () => { const from = sel; if (from >= 0 && from < hand.length - 1 && await send('move', { from, to: from + 1 })) sel = from + 1; }, 'secondary', sel < 0 || sel >= hand.length - 1, 'move-right')) : null,
      arrange ? text('p', 'muted small', 'Tap a card, then move it. Shuffle mixes them all.') : null);
  }
  function setsPanel(c) {
    const { state } = c; if (!state.sets.length) return null;
    return c.panel('sets-panel', el('div', { class: 'panel-heading' }, el('h3', {}, 'Sets laid down'), text('span', 'roster-count', state.sets.length + ' / 13')),
      el('div', { class: 'sets' }, state.sets.map((s) => el('div', { class: 'set-chip' + (c.fresh('hj-set-' + state.match + s.rank) ? ' pop' : '') }, text('b', '', c.rankLabel(s.rank) + '×4'), text('small', 'muted', c.who(s.id))))));
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
      host ? [c.botControls(), c.button('PLAY AGAIN', () => send('start'), 'host-button start-ticket', state.players.filter((p) => !p.departed).length < 3), c.button('Shuffle seats', () => send('shuffleSeats'), 'secondary')] : text('p', 'waiting', 'Waiting for the host to start another game.'));
  }
  function screen(c) {
    const { state } = c;
    return el('div', { class: 'tk-scene' }, state.phase === 'finished' ? finale(c) : null,
      state.phase === 'playing' ? c.panel('table-panel', ring(c), turnBanner(c)) : null,
      el('div', { class: 'joker-grid' }, el('div', { class: 'main-col' }, privateNote(c), takePanel(c), handPanel(c)), el('div', { class: 'side-col' }, setsPanel(c), logPanel(c), c.roster((p, s) => s.losses[p.id] ? 'JOKER ×' + s.losses[p.id] : null))));
  }
})();



