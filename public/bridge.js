(() => {
  'use strict';
  const NAMES = ['North', 'East', 'South', 'West'], SHORT = ['N', 'E', 'S', 'W'];
  const SUITS = { S: '♠', H: '♥', D: '♦', C: '♣', N: 'NT' };
  const el = TableKit.el, text = TableKit.text;
  let pick = '', pickKey = '', callPick = '', bidLevel = 0, bidSuit = '', collection = null;
  const serverNow = s => s.now + Date.now() - (s.receivedAt || Date.now());
  const collecting = s => !!s.deal?.collectUntil && serverNow(s) < s.deal.collectUntil;
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
      art: () => el('div', { class: 'club-art', 'aria-hidden': 'true' }, el('img', { src: '/game-art/bridge.webp', alt: '', width: 1200, height: 800, fetchPriority: 'high' })),
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
        el('li', {}, el('b', {}, 'Score. '), 'The deal stops as soon as either side reaches its trick target. If the declarer team wins, both score 1, 2, 4, 8, 16, 32 or 64 points for a contract of 7 to 13 tricks. If the defenders reach their target first, each defender scores 1 point. Unplayed tricks do not count as extra losses.')),
      el('p', { class: 'muted small' }, 'Winner: the player with the most points after the chosen number of deals. A hand needs 4 points to be playable (A=4, K=3, Q=2, J=1, plus 1 for each card after the fourth in a suit). Hands with less are thrown in and dealt again.'),
    ],
    screen: (c) => screen(c),
    afterRender: (c) => collectTrick(c),
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
    const r = e.result, outcome = e.endedEarly ? (e.success ? 'contract made' : 'contract stopped') : r > 0 ? 'made +' + r : r === 0 ? 'made exactly' : 'down ' + -r;
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
    const p = d.progress || {}, target = k.target, known = p.declarer !== null && p.declarer !== undefined;
    const side = (label, count, goal, cls) => el('div', { class: 'team-progress ' + cls },
      text('span', 'eyebrow', label), el('div', { class: 'team-total' }, text('b', '', count == null ? '—' : String(count)), text('span', '', '/ ' + goal)),
      text('small', '', count == null ? 'Needs ' + goal + ' tricks to win' : count >= goal ? 'Target reached' : 'Needs ' + (goal - count) + ' more ' + (goal - count === 1 ? 'trick' : 'tricks')),
      count == null ? text('small', 'muted', 'Partner hidden') : el('progress', { value: count, max: goal, 'aria-label': label + ' tricks won' }));
    return el('div', { class: 'contract-bar' },
      el('div', { class: 'contract-heading' },
        el('div', { class: 'contract-main' }, text('span', 'eyebrow', 'CONTRACT'), el('b', { class: 'contract' }, contractLabel(k)), text('small', 'muted', c.who(state.seats[k.declarer]) + ' declares')),
        d.called ? el('div', { class: 'called-card' }, text('span', 'eyebrow', 'CALLED CARD'), c.card(d.called, { small: true })) : null),
      el('div', { class: 'team-progress-grid' }, side('Declarer team', known ? p.declarer : null, target, 'declarer-progress'), side('Defenders', known ? p.defenders : null, 14 - target, 'defender-progress')),
      el('div', { class: 'deal-status' },
        text('b', 'my-tricks', 'Your tricks: ' + (d.tricksBy[state.mySeat] || 0)), text('span', '', (13 - d.tricks) + ' tricks left'),
        text('span', 'trump-state', k.denom === 'N' ? 'No trumps' : 'Trumps ' + SUITS[k.denom] + (d.trumpBroken ? ' · open' : ' · not open yet'))),
      !known ? text('p', 'muted small team-privacy', 'Team totals appear when the partner is revealed.') :
        d.solo ? text('p', 'muted small team-privacy', 'The declarer is playing alone.') : d.partner !== null ? text('p', 'muted small team-privacy', c.who(state.seats[d.partner]) + ' is the partner.') : text('p', 'muted small team-privacy', 'These team totals are private to you while your role is hidden.'));
  }
  function table(c) {
    const { state } = c, d = state.deal, me = Math.max(0, state.mySeat), done = d.trick.length === 0 && d.lastTrick, trickCards = d.trick.length ? d.trick : collecting(state) ? (d.lastTrick?.cards || []) : [], lastWinner = done ? d.lastTrick.winner : null;
    const rel = (k) => (me + k) % 4, pos = ['bottom', 'left', 'top', 'right']; // clockwise from you
    const seatEl = (k) => {
      const seat = rel(k), id = state.seats[seat];
      const tags = [seat === d.dealer ? 'DEALER' : null, d.contract && seat === d.contract.declarer ? 'DECLARER' : null, d.partner === seat && d.contract && seat !== d.contract.declarer ? 'PARTNER' : null].filter(Boolean);
      return el('div', { 'data-bridge-seat': seat, class: 'felt-seat pos-' + pos[k] + (d.turn === seat ? ' turn' : '') + (lastWinner === seat ? ' winner' : '') },
        el('div', { class: 'plate' }, c.avatar(id), el('b', {}, c.who(id) + (seat === state.mySeat ? ' · You' : '')), text('small', 'muted', [NAMES[seat], ...tags, d.counts[seat] + ' cards'].join(' · '))),
        d.contract ? el('div', { class: 'collected' }, pileOf(d.tricksBy[seat]), text('small', 'muted', 'tricks')) : null);
    };
    const slots = [0, 1, 2, 3].map((k) => { const seat = rel(k), played = trickCards.find((x) => x.seat === seat); return el('div', { 'data-bridge-seat': seat, class: 'trick-slot pos-' + pos[k] + (lastWinner === seat ? ' winner' : '') }, played ? c.card(played.card, { label: NAMES[seat] + ' played' }) : null); });
    const caption = d.trick.length ? '' : done ? c.who(state.seats[lastWinner]) + ' won trick ' + (d.lastTrick.number || d.tricks) : d.contract ? 'No cards played yet' : '';
    return el('div', { class: 'felt' }, seatEl(2), el('div', { class: 'felt-mid' }, seatEl(1), el('div', { class: 'trick', role: 'group', 'aria-label': 'Cards played this trick' }, ...slots), seatEl(3)), text('div', 'trick-caption', caption), seatEl(0));
  }

  function bidBox(c) {
    const { state, send } = c, d = state.deal, legal = d.legalCalls;
    if (!legal) return text('p', 'waiting', 'Waiting for the next bid.');
    const names = { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades', N: 'No Trump' };
    const ok = call => legal.bids.includes(call);
    const highest = [...d.calls].reverse().find(x => x.call !== 'P');
    return el('div', { class: 'bid-box' },
      highest ? el('p', { class: 'current-bid' }, 'Highest bid: ', el('b', {}, callLabel(highest.call)), ' · ' + c.who(state.seats[highest.seat])) : text('p', 'muted small', 'Choose a number, then a suit or No Trump.'),
      el('fieldset', { class: 'bid-picker' }, el('legend', {}, '1. Number'), el('div', { class: 'bid-levels' }, [1, 2, 3, 4, 5, 6, 7].map(level =>
        el('button', { type: 'button', class: 'bid' + (bidLevel === level ? ' selected' : ''), 'data-focus': 'bid-level-' + level, 'aria-label': 'Level ' + level, 'aria-pressed': bidLevel === level, disabled: c.busy || !legal.bids.some(call => call[0] === String(level)), onclick: () => { bidLevel = level; if (!ok(level + bidSuit)) bidSuit = ''; pick = bidSuit ? level + bidSuit : ''; c.render(); } }, String(level))))),
      el('fieldset', { class: 'bid-picker' }, el('legend', {}, '2. Suit'), el('div', { class: 'bid-suits' }, ['C', 'D', 'H', 'S', 'N'].map(suit =>
        el('button', { type: 'button', class: 'bid' + (bidSuit === suit ? ' selected' : ''), 'data-focus': 'bid-suit-' + suit, 'aria-label': names[suit], 'aria-pressed': bidSuit === suit, disabled: c.busy || !bidLevel || !ok(bidLevel + suit), onclick: () => { bidSuit = suit; pick = bidLevel + suit; c.render(); } }, suitSpan(suit))))),
      bidLevel ? text('p', 'bid-explanation', 'Your team needs ' + (6 + bidLevel) + ' tricks.') : null,
      c.button(pick ? 'Bid ' + pick[0] + ' ' + names[pick[1]] : 'Choose number and suit', async () => { const call = pick; if (await send('call', { call })) { pick = ''; bidLevel = 0; bidSuit = ''; } }, 'primary', !pick || !ok(pick), 'bid-confirm'),
      c.button('Pass', () => send('call', { call: 'P' }), 'secondary', false, 'bid-P'));
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
    if (collecting(state)) return el('div', { class: 'turn-banner collecting-banner', role: 'status' }, c.icon('cards'), c.who(state.seats[d.lastTrick.winner]) + ' wins this trick. Collecting cards…');
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
      host ? c.button(state.board >= state.deals ? 'SHOW FINAL RESULT' : 'NEXT DEAL', () => send('next'), 'host-button', collecting(state), 'next') : text('p', 'waiting', 'Waiting for the host to continue.'));
  }
  function dealDetail(c, e) {
    const hands = el('div', { class: 'all-hands' }, e.hands.map((h, i) => el('div', { class: 'reveal-hand' }, el('b', {}, NAMES[i] + ' · ' + c.who(e.seats[i]) + (e.contract && i === e.contract.declarer ? ' · declarer' : e.contract && i === e.partner ? ' · partner' : '') + (e.delta[i] ? ' · +' + e.delta[i] : '')), handRow(c, h, { small: true }))));
    const calls = el('div', { class: 'auction auction-small' }, SHORT.map((s) => el('b', { class: 'auction-head' }, s)), [...Array(e.dealer).fill(null), ...e.calls].map((x) => el('span', { class: 'auction-cell' + (x && x.call !== 'P' ? ' call' : '') }, x ? callLabel(x.call) : '')));
    return el('div', { class: 'deal-detail' }, e.contract ? el('small', { class: 'muted' }, 'Called card: ', cardLabel(e.called, c), ' · Declarer team: ' + e.made + '/' + e.target + (e.endedEarly ? ' · ' + e.remaining + ' unplayed tricks' : '')) : null, calls, hands);
  }
  function finale(c) {
    const { state, send } = c, host = state.hostId === state.meId, w = state.finalWinners || [], mine = state.mySeat >= 0 && w.includes(state.mySeat);
    return c.panel('finale-panel', el('img', { class: 'club-trophy', src: '/grand-con/trophy.webp', alt: '', width: 160, height: 160 }), text('span', 'eyebrow', 'MATCH OVER'), el('h1', {}, w.length > 1 ? 'It’s a tie!' : c.who(state.seats[w[0]]) + ' wins!'), el('div', { class: 'club-winners' }, w.map(i => el('div', {}, c.avatar(state.seats[i]), text('b', '', c.who(state.seats[i]))))), el('p', { class: 'muted' }, mine ? 'Well played!' : 'Better luck next match.'), scoreStrip(c),
      el('fieldset', { class: 'pace-settings' }, el('legend', {}, 'Number of deals'), el('div', { class: 'pace-options' }, [2, 4, 8].map((n) => el('button', { type: 'button', class: state.deals === n ? 'selected' : '', 'aria-pressed': state.deals === n, disabled: c.busy || !host, onclick: () => send('settings', { deals: n }) }, n + ' deals')))),
      host ? [c.botControls(), c.button('PLAY AGAIN', () => send('start'), 'host-button start-ticket', state.players.filter((p) => !p.departed).length < 4), c.button('Shuffle seats', () => send('shuffleSeats'), 'secondary')] : text('p', 'waiting', 'Waiting for the host to start a new match.'));
  }
  function screen(c) {
    const { state } = c, d = state.deal, host = state.hostId === state.meId;
    if (state.phase === 'finished') return el('div', { class: 'tk-scene' }, finale(c), pastDeals(c));
    const key = state.match + ':' + d.board + ':' + d.calls.length + ':' + d.tricks + ':' + d.trick.length + ':' + state.phase;
    if (key !== pickKey) { pickKey = key; pick = ''; callPick = ''; bidLevel = 0; bidSuit = ''; }
    return el('div', { class: 'tk-scene' }, el('details', { class: 'match-scores', 'data-details': 'match-scores' }, el('summary', {}, 'Match scores · Deal ' + state.board + ' / ' + state.deals), scoreStrip(c)),
      el('div', { class: 'bridge-grid' },
        el('div', { class: 'main-col' }, c.panel('table-panel', contractBar(c), table(c), turnBanner(c)),
          state.phase === 'bidding' ? c.panel('bidding-panel', el('div', { class: 'panel-heading' }, el('div', {}, text('span', 'eyebrow', 'BIDDING'), el('h3', {}, 'The auction'))), bidBox(c), el('details', { 'data-details': 'bidding-live' }, el('summary', {}, 'Bidding so far'), auction(c, d))) : null,
          state.phase === 'calling' && d.callable ? c.panel('call-panel', el('div', { class: 'panel-heading' }, el('div', {}, text('span', 'eyebrow', 'DECLARER'), el('h3', {}, 'Call your partner’s card'))), callBox(c)) : null,
          state.phase === 'reveal' ? reveal(c, state.history.at(-1), host) : null),
        el('div', { class: 'side-col' }, state.phase !== 'reveal' ? handPanel(c) : null, state.phase === 'playing' || state.phase === 'calling' ? c.panel('auction-panel', el('h3', {}, 'The bidding'), auction(c, d)) : null, c.roster((p) => { const i = state.seats.indexOf(p.id); return i < 0 ? null : NAMES[i].toUpperCase(); }))),
      pastDeals(c, state.phase === 'reveal' ? 1 : 0));
  }
  // Keep the same overlay nodes across polls. Coordinates belong to the table,
  // so scrolling moves the flying cards and their destination together.
  function collectTrick(c) {
    const s = c.state, panel = document.querySelector('.table-panel');
    const clear = () => { if (collection) { clearTimeout(collection.timer); collection.node?.remove(); collection = null; } };
    if (!s || !panel || !collecting(s)) { clear(); return; }
    const d = s.deal, last = d.lastTrick;
    if (!last?.cards?.length) return;
    const key = [s.code, s.match, d.board, last.number || d.tricks].join(':');
    const remaining = d.collectUntil - serverNow(s);
    document.querySelector('.tk-scene')?.classList.remove('scene-enter');
    if (collection?.key === key) {
      if (collection.node) { panel.append(collection.node); panel.classList.add('trick-collecting'); }
      return;
    }
    clear();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const layer = reduced ? null : el('div', { class: 'collection-layer', 'aria-hidden': 'true', 'data-trick': key });
    collection = { key, node: layer, timer: setTimeout(() => { clear(); c.render(); }, remaining + 25) };
    if (!layer) return;
    panel.append(layer);
    const box = layer.getBoundingClientRect();
    const target = panel.querySelector('.felt-seat[data-bridge-seat="' + last.winner + '"] .collected')?.getBoundingClientRect();
    const centre = panel.querySelector('.trick')?.getBoundingClientRect();
    if (!target || !centre) { clear(); return; }
    last.cards.forEach((played, i) => {
      const source = panel.querySelector('.trick-slot[data-bridge-seat="' + played.seat + '"] .pcard')?.getBoundingClientRect();
      if (!source) return;
      const card = c.card(played.card), wrapper = el('span', { class: 'collection-card', style: 'left:' + (source.left - box.left) + 'px;top:' + (source.top - box.top) + 'px;width:' + source.width + 'px;height:' + source.height + 'px' }, card);
      card.style.width = source.width + 'px'; card.style.height = source.height + 'px';
      layer.append(wrapper);
      const middleX = centre.left + centre.width / 2 - source.width / 2 - source.left + i * 2;
      const middleY = centre.top + centre.height / 2 - source.height / 2 - source.top + i * 2;
      const endX = target.left + target.width / 2 - source.width / 2 - source.left;
      const endY = target.top + target.height / 2 - source.height / 2 - source.top;
      const stack = 'translate(' + middleX + 'px,' + middleY + 'px) rotate(' + (i * 4 - 6) + 'deg)';
      const animation = wrapper.animate([
        { transform: 'translate(0,0)', opacity: 1, offset: 0 },
        { transform: stack, opacity: 1, offset: .34 },
        { transform: stack, opacity: 1, offset: .5 },
        { transform: 'translate(' + endX + 'px,' + endY + 'px) scale(.28)', opacity: .25, offset: 1 },
      ], { duration: Math.max(1, d.collectUntil - last.at), easing: 'cubic-bezier(.35,0,.2,1)', fill: 'both' });
      animation.currentTime = Math.max(0, serverNow(s) - last.at);
    });
    panel.classList.add('trick-collecting');
  }

  function pastDeals(c, skip = 0) {
    const { state } = c, list = state.history.slice(0, state.history.length - skip);
    return list.length ? c.panel('history', el('h3', {}, 'Past deals'), ...list.slice().reverse().map((e) => el('details', { 'data-details': 'deal-' + state.match + '-' + e.board }, el('summary', {}, 'Deal ' + e.board + ' · ' + resultText(e, c)), dealDetail(c, e)))) : null;
  }
})();


