(() => {
  'use strict';
  const NAMES = ['North', 'East', 'South', 'West'], SHORT = ['N', 'E', 'S', 'W'];
  const SUITS = { S: '♠', H: '♥', D: '♦', C: '♣', N: 'NT' };
  const el = TableKit.el, text = TableKit.text;
  let pick = '', pickKey = '', callPick = '';
  const suitSpan = (s) => el('span', { class: 'suit-sym ' + (s === 'H' || s === 'D' ? 'red' : '') }, SUITS[s]);
  const callLabel = (call) => call === 'P' ? 'Pass' : [call[0], suitSpan(call[1])];
  const contractLabel = (c) => [c.level, suitSpan(c.denom)];
  const cardLabel = (code, c) => [c.rankLabel(code.slice(1)), suitSpan(code[0])];
  const ranksAsc = '23456789TJQKA';

  TableKit({
    game: 'bridge', api: '/api/bridge', page: '/bridge.html', seatKey: 'br-seat', nameKey: 'br-name', title: 'Singaporean Bridge', icon: 'crown', min: 4, max: 4,
    footer: 'Singaporean Bridge · Bid. Call a card. Find your hidden partner.',
    announce: { bidding: 'The bidding has begun.', calling: 'The declarer is calling a partner card.', playing: 'Play the cards.', reveal: 'The deal is over.', finished: 'The match has ended.' },
    scene: (s) => (s.deal ? s.deal.board : ''),
    landing: {
      eyebrow: 'FLOATING BRIDGE', title: ['Singaporean Bridge', 'for four.'], lead: 'Bid for a contract, then call a card. Whoever holds it is your secret partner, and nobody knows who until the cards show it.',
      chips: ['4 players', 'Hidden partners', '2, 4 or 8 deals'], steps: [['hand', 'Bid your hand'], ['cards', 'Call a partner card'], ['trophy', 'Score as an individual']],
      note: 'You need exactly 4 players, each with their own phone. New to the game? Open How to play.',
    },
    waitingChips: ['4 players', 'Partners are secret', 'Individual scores'],
    startBlock: (s, n) => (n < 4 ? `Waiting for ${4 - n} more player${4 - n === 1 ? '' : 's'}.` : ''),
    rosterTag: (p, s) => { const seat = s.seats.indexOf(p.id); return seat < 0 ? null : NAMES[seat].toUpperCase(); },
    waiting: (c) => seatPreview(c),
    rulesTitle: 'Bid. Call a card. Find your partner.',
    rules: () => [
      el('p', {}, 'Four players sit around the table. Everyone gets 13 cards. There are no fixed teams: partners are decided by the cards.'),
      el('ol', {},
        el('li', {}, el('b', {}, 'Bid. '), 'Starting with the dealer, each player bids or passes. A bid of “1” promises 7 tricks (6 + the number), “2” promises 8, and so on up to “7” for all 13. Each bid must beat the last: more tricks, or the same number in a higher suit (♣ < ♦ < ♥ < ♠ < NT). There is no double. Bidding ends after three passes in a row. The highest bidder is the declarer, and the suit is trump.'),
        el('li', {}, el('b', {}, 'Call a card. '), 'The declarer names any card, for example the ace of hearts. Whoever holds that card is the declarer’s secret partner. Nobody is told who it is. The declarer may even call a card from their own hand and play alone.'),
        el('li', {}, el('b', {}, 'Play. '), 'The player left of the declarer leads. In no trump, the declarer leads. You must follow suit if you can. The highest trump wins the trick, or else the highest card of the suit led. The partner shows themselves when they play the called card, or when the defenders are one trick from winning.'),
        el('li', {}, el('b', {}, 'Score. '), 'If the declarer and partner together take enough tricks, both score 1, 2, 4, 8, 16, 32 or 64 points for a contract of 7 to 13 tricks. Otherwise each defender scores 1, 2, 4… points for each trick the declarer fell short. There are no bonus points for extra tricks.')),
      el('p', { class: 'muted small' }, 'Winner: the player with the most points after the chosen number of deals. A hand needs 4 points to be playable (A=4, K=3, Q=2, J=1, plus 1 for each card after the fourth in a suit). Hands with less are thrown in and dealt again.'),
    ],
    screen: (c) => screen(c),
  });

  function seatPreview(c) {
    const { state, send, busy } = c;
    const host = state.hostId === state.meId;
    return el('div', { class: 'seat-preview' },
      el('fieldset', { class: 'pace-settings' }, el('legend', {}, 'Number of deals'), el('div', { class: 'pace-options' }, [2, 4, 8].map((n) => el('button', { type: 'button', class: state.deals === n ? 'selected' : '', 'aria-pressed': state.deals === n, disabled: busy || !host, onclick: () => send('settings', { deals: n }) }, n + ' deals')))),
      el('div', { class: 'partners' }, [0, 1, 2, 3].map((i) => el('div', { class: 'partner-card' }, text('b', '', state.seats[i] ? NAMES[i] + ' · ' + c.who(state.seats[i]) : NAMES[i] + ' · waiting…')))),
      host ? c.button('Shuffle seats', () => send('shuffleSeats'), 'secondary', state.players.length < 2) : null,
      text('p', 'muted small', 'Sit around the table in the order shown: North, East, South, West, clockwise.'));
  }

  function resultText(e, c) {
    if (!e.contract) return 'Passed out. No score.';
    const r = e.result, outcome = r > 0 ? 'made +' + r : r === 0 ? 'made exactly' : 'down ' + -r;
    const solo = e.partner === e.contract.declarer, who = c.who(e.seats[e.contract.declarer]) + (solo ? ' (alone)' : ' with ' + c.who(e.seats[e.partner]));
    return who + ' · ' + e.contract.name.replace(/(\d)([CDHS])/, (m, n, s) => n + SUITS[s]) + ' · ' + outcome;
  }
  function handRow(c, cards, opts = {}) {
    return el('div', { class: 'hand-row ' + (opts.cls || ''), 'data-scroll': opts.scroll || undefined }, ...cards.map((code) => {
      const playable = opts.legal ? opts.legal.includes(code) : false;
      return c.card(code, { small: opts.small, disabled: opts.legal ? !playable : false, selected: pick === code && playable, onclick: opts.legal ? () => { if (pick === code) opts.play(code); else { pick = code; c.render(); } } : undefined });
    }), cards.length ? null : text('span', 'muted small', 'No cards'));
  }
  function auction(c, d) {
    const cells = [...Array(d.dealer).fill(null), ...d.calls];
    return el('div', { class: 'auction', role: 'table', 'aria-label': 'Bidding so far' }, ...SHORT.map((s, i) => el('b', { class: 'auction-head', role: 'columnheader' }, s + (i === d.dealer ? ' · dealer' : ''))),
      ...cells.map((x) => el('span', { class: 'auction-cell' + (x && x.call !== 'P' ? ' call' : ''), role: 'cell' }, x ? callLabel(x.call) : '')),
      d.turn !== null && c.state.phase === 'bidding' ? el('span', { class: 'auction-cell now' }, '…') : null);
  }
  function scoreStrip(c) {
    const { state } = c, d = state.deal;
    return el('div', { class: 'score-strip four' }, [0, 1, 2, 3].map((s) => el('div', { class: 'score-team' + (state.mySeat === s ? ' mine' : '') }, text('span', 'eyebrow', NAMES[s] + (state.mySeat === s ? ' · YOU' : '')), text('small', 'muted', c.who(state.seats[s])), text('b', 'score-number', String(state.scores[s])))),
      d ? el('div', { class: 'score-mid' }, text('span', 'eyebrow', 'DEAL'), text('b', '', state.board + ' / ' + state.deals), text('small', 'muted', 'Dealer: ' + NAMES[d.dealer])) : null);
  }
  // A stack of face-down cards: the tricks a player has collected this deal (each trick is one set of four cards).
  const pileOf = (n) => el('span', { class: 'pile', 'aria-label': n + (n === 1 ? ' trick won' : ' tricks won') }, ...Array.from({ length: Math.min(n, 6) }, (_, i) => el('i', { style: '--i:' + i })), el('em', {}, String(n)));
  function contractBar(c) {
    const { state } = c, d = state.deal, k = d.contract;
    if (!k) return el('div', { class: 'contract-bar' }, text('span', 'eyebrow', 'BIDDING'), text('small', 'muted', 'No contract yet'));
    const known = d.partner !== null, solo = d.solo, side = d.tricksBy[k.declarer] + (known && d.partner !== k.declarer ? d.tricksBy[d.partner] : 0);
    return el('div', { class: 'contract-bar' },
      el('div', { class: 'contract-main' }, text('span', 'eyebrow', 'CONTRACT'), el('b', { class: 'contract' }, contractLabel(k)), text('small', 'muted', NAMES[k.declarer] + ' declares')),
      el('div', { class: 'contract-facts' },
        el('span', {}, 'Needs ', el('b', {}, k.target), ' of 13 tricks'),
        el('span', {}, known ? 'Declarer side has ' : 'Declarer has ', el('b', {}, side), known ? '' : ' (+ partner)'),
        el('span', {}, 'Defenders need ', el('b', {}, 14 - k.target)),
        d.called ? el('span', {}, 'Called ', cardLabel(d.called, c), solo ? ' · playing alone' : known ? ' · ' + NAMES[d.partner] + ' is the partner' : ' · partner hidden') : null,
        k.denom === 'N' ? el('span', {}, 'No trumps') : el('span', { class: d.trumpBroken ? 'ok' : '' }, 'Trumps ', suitSpan(k.denom), d.trumpBroken ? ' broken, can be led' : ' not broken yet, cannot be led')));
  }
  function table(c) {
    const { state } = c, d = state.deal, me = Math.max(0, state.mySeat), done = d.trick.length === 0 && d.lastTrick, trickCards = d.trick.length ? d.trick : (d.lastTrick?.cards || []), lastWinner = done ? d.lastTrick.winner : null;
    const rel = (k) => (me + k) % 4, pos = ['bottom', 'left', 'top', 'right']; // clockwise from you
    const seatEl = (k) => {
      const seat = rel(k), id = state.seats[seat];
      const tags = [seat === d.dealer ? 'DEALER' : null, d.contract && seat === d.contract.declarer ? 'DECLARER' : null, d.partner === seat && d.contract && seat !== d.contract.declarer ? 'PARTNER' : null].filter(Boolean);
      return el('div', { class: 'felt-seat pos-' + pos[k] + (d.turn === seat ? ' turn' : '') + (lastWinner === seat ? ' winner' : '') },
        el('div', { class: 'plate' }, c.avatar(id), el('b', {}, c.who(id) + (seat === state.mySeat ? ' · You' : '')), text('small', 'muted', [NAMES[seat], ...tags, d.counts[seat] + ' cards'].join(' · '))),
        d.contract ? el('div', { class: 'collected' }, pileOf(d.tricksBy[seat]), text('small', 'muted', 'tricks')) : null);
    };
    const slots = [0, 1, 2, 3].map((k) => { const seat = rel(k), played = trickCards.find((x) => x.seat === seat); return el('div', { class: 'trick-slot pos-' + pos[k] + (lastWinner === seat ? ' winner' : '') }, played ? c.card(played.card, { label: NAMES[seat] + ' played' }) : null); });
    const caption = d.trick.length ? '' : done ? c.who(state.seats[lastWinner]) + ' took the trick and collects it' : d.contract ? 'No cards played yet' : '';
    return el('div', { class: 'felt' }, seatEl(2), el('div', { class: 'felt-mid' }, seatEl(1), el('div', { class: 'trick', role: 'group', 'aria-label': 'Cards played this trick' }, ...slots), seatEl(3)), text('div', 'trick-caption', caption), seatEl(0));
  }

  function bidBox(c) {
    const { state, send } = c, d = state.deal, legal = d.legalCalls;
    if (!legal) return null;
    const ok = (call) => legal.bids.includes(call);
    return el('div', { class: 'bid-box' }, el('div', { class: 'bid-grid' }, ...[1, 2, 3, 4, 5, 6, 7].flatMap((level) => ['C', 'D', 'H', 'S', 'N'].map((s) => { const call = level + s; return el('button', { type: 'button', class: 'bid' + (pick === call ? ' selected' : ''), 'data-focus': 'bid-' + call, 'aria-label': level + ' ' + { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades', N: 'no trump' }[s], 'aria-pressed': pick === call, disabled: c.busy || !ok(call), onclick: () => { pick = call; c.render(); } }, level, suitSpan(s)); }))),
      el('div', { class: 'bid-special' }, el('button', { type: 'button', class: 'bid-special-btn' + (pick === 'P' ? ' selected' : ''), 'data-focus': 'bid-P', 'aria-pressed': pick === 'P', disabled: c.busy, onclick: () => { pick = 'P'; c.render(); } }, 'Pass')),
      c.button(pick ? 'Confirm: ' + (pick === 'P' ? 'Pass' : pick[0] + ' ' + { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades', N: 'No Trump' }[pick[1]]) : 'Choose a call', async () => { const call = pick; if (await send('call', { call })) pick = ''; }, 'primary', !pick, 'bid-confirm'));
  }
  function callBox(c) {
    const { state, send } = c, d = state.deal;
    if (!d.callable) return null;
    const mine = new Set(d.myHand);
    return el('div', { class: 'call-box' },
      text('p', 'muted small', 'Name one card. Whoever holds it is your secret partner. A card from your own hand means you play alone.'),
      ...['S', 'H', 'D', 'C'].map((s) => el('div', { class: 'call-row' }, suitSpan(s), ...[...ranksAsc].reverse().map((r) => { const code = s + r; return el('button', { type: 'button', class: 'call-card' + (callPick === code ? ' selected' : '') + (mine.has(code) ? ' own' : ''), 'data-focus': 'call-' + code, 'aria-pressed': callPick === code, disabled: c.busy, onclick: () => { callPick = code; c.render(); } }, c.rankLabel(r)); }))),
      c.button(callPick ? ['Call ', cardLabel(callPick, c)] : 'Choose a card', async () => { const card = callPick; if (await send('callCard', { card })) callPick = ''; }, 'primary', !callPick, 'call-confirm'));
  }
  function turnBanner(c) {
    const { state } = c, d = state.deal; let msg = '', mine = false;
    if (state.phase === 'bidding') { mine = d.turn === state.mySeat; msg = mine ? 'Your turn to bid.' : c.who(state.seats[d.turn]) + ' is bidding…'; }
    else if (state.phase === 'calling') { mine = d.turn === state.mySeat; msg = mine ? 'You are the declarer. Call a partner card.' : c.who(state.seats[d.turn]) + ' is calling a partner card…'; }
    else if (state.phase === 'playing') {
      mine = d.turn === state.mySeat;
      msg = mine ? (d.trick.length ? 'Your turn. Follow suit if you can.' : 'Your turn. Lead a card.') : c.who(state.seats[d.turn]) + ' is playing…';
    }
    return msg ? el('div', { class: 'turn-banner' + (mine ? ' mine' : ''), role: 'status' }, mine ? c.icon('spark') : null, msg) : null;
  }
  function role(c) {
    const { state } = c, d = state.deal;
    if (!d.contract || state.mySeat < 0) return null;
    if (state.mySeat === d.contract.declarer) return d.called ? 'You are the declarer.' : null;
    if (d.iAmPartner) return 'You hold the called card: you are the declarer’s secret partner. Help take tricks. Show yourself by playing it, or hide until then.';
    return d.called ? 'You are a defender. Stop the contract, and work out who the partner is.' : null;
  }
  // Explains why trump cards are greyed out when you are leading.
  function leadHint(c) {
    const { state } = c, d = state.deal, k = d.contract;
    if (state.phase !== 'playing' || !k || k.denom === 'N' || d.turn !== state.mySeat || d.trick.length || d.trumpBroken) return '';
    return d.myHand.some((x) => x[0] === k.denom) && d.legal && d.legal.length < d.myHand.length ? 'You cannot lead trumps (' + SUITS[k.denom] + ') until someone plays one. A player with none of the led suit can trump in to break them.' : '';
  }
  function handPanel(c, extra) {
    const { state, send } = c, d = state.deal; if (state.mySeat < 0) return null;
    const legal = state.phase === 'playing' && d.turn === state.mySeat ? d.legal : null, play = (card) => send('play', { card });
    const note = role(c);
    return el('section', { class: 'tk-panel hand-panel mine' + (d.turn === state.mySeat ? ' active' : '') }, el('div', { class: 'panel-heading' }, el('div', {}, text('span', 'eyebrow', 'YOUR HAND · ' + NAMES[state.mySeat].toUpperCase()), el('h3', {}, 'Your cards')), text('span', 'hcp', d.myPoints + ' points')),
      note ? text('p', 'role-note', note) : null,
      leadHint(c) ? text('p', 'hint', leadHint(c)) : null,
      handRow(c, d.myHand, { legal, play, scroll: 'mine' }),
      legal && pick ? c.button('Play ' + c.rankLabel(pick.slice(1)) + c.SUIT[pick[0]], () => play(pick), 'primary', !legal.includes(pick), 'play-confirm') : legal ? text('p', 'muted small', 'Tap a card to choose it. Tap again to play. Grey cards cannot be played.') : null,
      extra || null);
  }
  function reveal(c, entry, host) {
    const { state, send } = c;
    return c.panel('reveal-panel', text('span', 'eyebrow', 'DEAL ' + entry.board + ' RESULT'), el('h2', {}, resultText(entry, c)), dealDetail(c, entry),
      host ? c.button(state.board >= state.deals ? 'SHOW FINAL RESULT' : 'NEXT DEAL', () => send('next'), 'host-button', false, 'next') : text('p', 'waiting', 'Waiting for the host to continue.'));
  }
  function dealDetail(c, e) {
    const hands = el('div', { class: 'all-hands' }, e.hands.map((h, i) => el('div', { class: 'reveal-hand' }, el('b', {}, NAMES[i] + ' · ' + c.who(e.seats[i]) + (e.contract && i === e.contract.declarer ? ' · declarer' : e.contract && i === e.partner ? ' · partner' : '') + (e.delta[i] ? ' · +' + e.delta[i] : '')), handRow(c, h, { small: true }))));
    const calls = el('div', { class: 'auction auction-small' }, SHORT.map((s) => el('b', { class: 'auction-head' }, s)), [...Array(e.dealer).fill(null), ...e.calls].map((x) => el('span', { class: 'auction-cell' + (x && x.call !== 'P' ? ' call' : '') }, x ? callLabel(x.call) : '')));
    return el('div', { class: 'deal-detail' }, e.contract ? el('small', { class: 'muted' }, 'Called card: ', cardLabel(e.called, c), ' · Declarer side took ' + e.made + ' of ' + e.target + ' tricks') : null, calls, hands);
  }
  function finale(c) {
    const { state, send } = c, host = state.hostId === state.meId, w = state.finalWinners || [], mine = state.mySeat >= 0 && w.includes(state.mySeat);
    return c.panel('finale-panel', c.icon('trophy', 'big-trophy'), text('span', 'eyebrow', 'MATCH OVER'), el('h1', {}, w.length > 1 ? 'It’s a tie!' : c.who(state.seats[w[0]]) + ' wins!'), el('p', { class: 'muted' }, mine ? 'Well played!' : 'Better luck next match.'), scoreStrip(c),
      el('fieldset', { class: 'pace-settings' }, el('legend', {}, 'Number of deals'), el('div', { class: 'pace-options' }, [2, 4, 8].map((n) => el('button', { type: 'button', class: state.deals === n ? 'selected' : '', 'aria-pressed': state.deals === n, disabled: c.busy || !host, onclick: () => send('settings', { deals: n }) }, n + ' deals')))),
      host ? [c.botControls(), c.button('PLAY AGAIN', () => send('start'), 'host-button start-ticket', state.players.filter((p) => !p.departed).length < 4), c.button('Shuffle seats', () => send('shuffleSeats'), 'secondary')] : text('p', 'waiting', 'Waiting for the host to start a new match.'));
  }
  function screen(c) {
    const { state } = c, d = state.deal, host = state.hostId === state.meId;
    if (state.phase === 'finished') return el('div', { class: 'tk-scene' }, finale(c), pastDeals(c));
    const key = state.match + ':' + d.board + ':' + d.calls.length + ':' + d.tricks + ':' + d.trick.length + ':' + state.phase;
    if (key !== pickKey) { pickKey = key; pick = ''; callPick = ''; }
    return el('div', { class: 'tk-scene' }, scoreStrip(c),
      el('div', { class: 'bridge-grid' },
        el('div', { class: 'main-col' }, c.panel('table-panel', contractBar(c), table(c), turnBanner(c)),
          state.phase === 'bidding' ? c.panel('bidding-panel', el('div', { class: 'panel-heading' }, el('div', {}, text('span', 'eyebrow', 'BIDDING'), el('h3', {}, 'The auction'))), auction(c, d), bidBox(c)) : null,
          state.phase === 'calling' && d.callable ? c.panel('call-panel', el('div', { class: 'panel-heading' }, el('div', {}, text('span', 'eyebrow', 'DECLARER'), el('h3', {}, 'Call your partner’s card'))), callBox(c)) : null,
          state.phase === 'reveal' ? reveal(c, state.history.at(-1), host) : null),
        el('div', { class: 'side-col' }, state.phase !== 'reveal' ? handPanel(c) : null, state.phase === 'playing' || state.phase === 'calling' ? c.panel('auction-panel', el('h3', {}, 'The bidding'), auction(c, d)) : null, c.roster((p) => { const i = state.seats.indexOf(p.id); return i < 0 ? null : NAMES[i].toUpperCase(); }))),
      pastDeals(c, state.phase === 'reveal' ? 1 : 0));
  }
  function pastDeals(c, skip = 0) {
    const { state } = c, list = state.history.slice(0, state.history.length - skip);
    return list.length ? c.panel('history', el('h3', {}, 'Past deals'), ...list.slice().reverse().map((e) => el('details', { 'data-details': 'deal-' + state.match + '-' + e.board }, el('summary', {}, 'Deal ' + e.board + ' · ' + resultText(e, c)), dealDetail(c, e)))) : null;
  }
})();


