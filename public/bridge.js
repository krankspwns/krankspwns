(() => {
  'use strict';
  const seatLabel = i => 'Seat ' + (i + 1);
  const celebrationStarts = new Map();
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
    // Playability changes when collection expires, without a stored room mutation.
    viewKey: s => JSON.stringify(s.deal?.legal || null),
    landing: {
      art: () => el('div', { class: 'club-art', 'aria-hidden': 'true' }, el('img', { src: '/game-art/bridge.webp', alt: '', width: 1200, height: 800, fetchPriority: 'high' })),
      eyebrow: 'FLOATING BRIDGE', title: ['Singaporean Bridge', 'for four.'], lead: 'Bid for a contract, then call a card. Whoever holds it is your secret partner, and nobody knows who until the cards show it.',
      chips: ['4 players', 'Hidden Partners', '2, 4 or 8 deals'], steps: [['hand', 'Bid Your Hand'], ['cards', 'Call a Partner Card'], ['trophy', 'Score as an Individual']],
      note: 'You need exactly 4 players, each with their own phone. New to the game? Open How to Play.',
    },
    waitingChips: ['4 players', 'Partners are secret', 'Individual Scores'],
    startBlock: (s, n) => (n < 4 ? `Waiting for ${4 - n} more player${4 - n === 1 ? '' : 's'}.` : ''),
    rosterTag: (p, s) => { const seat = s.seats.indexOf(p.id); return seat < 0 ? null : seatLabel(seat); },
    waiting: (c) => seatPreview(c),
    guide: (B) => [
      () => [B.h('Four players. No fixed teams.'), B.p('Everyone gets 13 cards. You bid for a contract, then the bidder secretly picks a partner by naming a card. Whoever holds that card is the partner, and nobody is told who.'),
        B.chips(['4 players', '13 cards each', 'Hidden partners']),
        B.steps([['🗣️', 'Bid', 'Promise how many tricks you can win.'], ['🃏', 'Call a card', 'Whoever holds it is your secret partner.'], ['♠️', 'Play the tricks', 'Follow suit. The highest card or trump wins.'], ['🏆', 'Score', 'Win your target before the others stop you.']])],
      () => [B.h('Bid for the contract'), B.p('Starting with the dealer, each player bids or passes. A bid is a number and a suit (or No Trump). The number promises tricks: 6 plus the number.'),
        B.table([['1', '7 tricks'], ['2', '8 tricks'], ['3', '9 tricks'], ['4', '10 tricks'], ['5', '11 tricks'], ['6', '12 tricks'], ['7', 'all 13 tricks']], ['BID', 'PROMISE']),
        B.p('Each bid must beat the last: more tricks, or the same number in a higher suit.'),
        B.chips(['♣ lowest', '♦', '♥', '♠', 'No Trump highest']),
        B.list(['There is no double.', 'Three passes in a row end the bidding.', 'The highest bidder is the declarer, and their suit is trump.'])],
      () => [B.h('Call a partner card'), B.p('The declarer names any card. Whoever holds it is the declarer’s secret partner.'),
        B.row([B.example('Declarer calls', B.cards([B.card('A', '♥')]), 'The holder is the partner', 'good'), B.example('Everyone else', B.cards([B.back(), B.back(), B.back()]), 'Nobody is told who')]),
        B.list(['The partner stays hidden until they play the called card.', 'The declarer can call a card from their own hand and play alone.', 'All teams are shown when the deal ends.'])],
      () => [B.h('Play the tricks'), B.p('The player left of the declarer leads. In No Trump, the declarer leads.'),
        B.list(['You must follow the suit that was led, if you can.', 'The highest trump wins the trick. With no trump played, the highest card of the suit led wins.', 'The winner of a trick leads the next one.']),
        B.row([B.example('Spades led. You hold ♠', B.cards([B.card('9', '♠')]), 'You must play a spade', 'good'), B.example('Spades led. No ♠', B.cards([B.card('4', '♥')]), 'Play anything, even trump')])],
      () => [B.h('Scoring'), B.p('The deal stops as soon as either side reaches its trick target. Unplayed tricks never count as extra losses.'),
        B.table([['7 tricks', '1 point'], ['8 tricks', '2 points'], ['9 tricks', '4 points'], ['10 tricks', '8 points'], ['11 tricks', '16 points'], ['12 tricks', '32 points'], ['13 tricks', '64 points']], ['CONTRACT MADE', 'EACH DECLARER-SIDE PLAYER']),
        B.p('If the defenders reach their target first, each defender scores 1 point.')],
      () => [B.h('Good to know'), B.list(['A hand needs 4 points to be playable: A = 4, K = 3, Q = 2, J = 1, plus 1 for each card after the fourth in a suit. A weaker hand is thrown in and dealt again.', 'The host picks 2, 4 or 8 deals. The player with the most points at the end wins.', 'Your scores are your own. Partners change every deal.', 'Sit in the clockwise order shown in the room.'])],
    ],

    rulesTitle: 'Bid. Call a Card. Find Your Partner.',
    rules: () => [
      el('p', {}, 'Four players sit around the table. Everyone gets 13 cards. There are no fixed teams: partners are decided by the cards.'),
      el('ol', {},
        el('li', {}, el('b', {}, 'Bid. '), 'Starting with the dealer, each player bids or passes. A bid of “1” promises 7 tricks (6 + the number), “2” promises 8, and so on up to “7” for all 13. Each bid must beat the last: more tricks, or the same number in a higher suit (♣ < ♦ < ♥ < ♠ < NT). There is no double. Bidding ends after three passes in a row. The highest bidder is the declarer, and the suit is trump.'),
        el('li', {}, el('b', {}, 'Call a card. '), 'The declarer names any card, for example the ace of hearts. Whoever holds that card is the declarer’s secret partner. Nobody is told who it is. The declarer may even call a card from their own hand and play alone.'),
        el('li', {}, el('b', {}, 'Play. '), 'The player left of the declarer leads. In no trump, the declarer leads. You must follow suit if you can. The highest trump wins the trick, or else the highest card of the suit led. The partner stays hidden until they play the called card. All teams are shown when the deal ends.'),
        el('li', {}, el('b', {}, 'Score. '), 'The deal stops as soon as either side reaches its trick target. If the declarer team wins, both score 1, 2, 4, 8, 16, 32 or 64 points for a contract of 7 to 13 tricks. If the defenders reach their target first, each defender scores 1 point. Unplayed tricks do not count as extra losses.')),
      el('p', { class: 'muted small' }, 'Winner: the player with the most points after the chosen number of deals. A hand needs 4 points to be playable (A=4, K=3, Q=2, J=1, plus 1 for each card after the fourth in a suit). Hands with less are thrown in and dealt again.'),
    ],
    screen: (c) => screen(c),
    afterRender: (c) => {
      collectTrick(c);
      try { flair(c); } catch {}
      const banner = document.querySelector('.victory-banner');
      const key = c.state && [c.state.code,c.state.match,c.state.phase,c.state.board,'victory-scroll'].join(':');
      if (banner && c.fresh(key)) banner.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'start'});
    },
  });

  function seatPreview(c) {
    const { state, send, busy } = c;
    const host = state.hostId === state.meId;
    return el('div', { class: 'seat-preview' },
      el('fieldset', { class: 'pace-settings' }, el('legend', {}, 'Number of Deals'), el('div', { class: 'pace-options' }, [2, 4, 8].map((n) => el('button', { type: 'button', class: state.deals === n ? 'selected' : '', 'aria-pressed': state.deals === n, disabled: !host, onclick: () => { if (busy || state.deals === n) return; state.deals = n; send('settings', { deals: n }); } }, n + ' deals')))),
      el('div', { class: 'partners' }, [0, 1, 2, 3].map((i) => el('div', { class: 'partner-card' }, text('b', '', state.seats[i] ? seatLabel(i) + ' · ' + c.who(state.seats[i]) : seatLabel(i) + ' · Waiting…')))),
      host ? c.button('Shuffle Seats', () => send('shuffleSeats'), 'secondary', state.players.length < 2, undefined, 'shuffle:blue') : null,
      text('p', 'muted small', 'Choose a seat and sit in this clockwise order. Your name follows you through bidding and play.'));
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
      const face = c.card(code, { small: opts.small, disabled: opts.legal ? !playable : false, selected: pick === code && playable, onclick: opts.legal ? () => { if (pick === code) opts.play(code); else { pick = code; c.render(); } } : undefined });
      if (opts.privatePartner && code === c.state.deal.called) { face.classList.add('called-partner-card'); face.setAttribute('aria-label',face.getAttribute('aria-label') + ' · Your Called Card'); }
      return face;
    }), cards.length ? null : text('span', 'muted small', 'No cards'));
  }
  function auction(c, d) {
    const cells = [...Array(d.dealer).fill(null), ...d.calls];
    return el('div', { class: 'auction', role: 'table', 'aria-label': 'Bidding So Far' }, ...auctionHeads(c, c.state.seats, d.dealer),
      ...cells.map((x) => el('span', { class: 'auction-cell' + (x && x.call !== 'P' ? ' call' : ''), role: 'cell' }, x ? callLabel(x.call) : '')),
      d.turn !== null && c.state.phase === 'bidding' ? el('span', { class: 'auction-cell now' }, '…') : null);
  }
  function scoreStrip(c) {
    const { state } = c, d = state.deal;
    return el('div', { class: 'score-strip four' }, [0, 1, 2, 3].map((s) => el('div', { class: 'score-team' + (state.mySeat === s ? ' mine' : '') }, text('span', 'eyebrow', seatLabel(s) + (state.mySeat === s ? ' · You' : '')), text('small', 'muted', c.who(state.seats[s])), text('b', 'score-number', String(state.scores[s])))),
      d ? el('div', { class: 'score-mid' }, text('span', 'eyebrow', 'DEAL'), text('b', '', state.board + ' / ' + state.deals), text('small', 'muted', 'Dealer: ' + c.who(state.seats[d.dealer]))) : null);
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
      el('div', { class: 'team-progress-grid' }, side('Declarer Team', known ? p.declarer : null, target, 'declarer-progress'), side('Defenders', known ? p.defenders : null, 14 - target, 'defender-progress')),
      el('div', { class: 'deal-status' },
        text('b', 'my-tricks', 'Your Tricks: ' + (d.tricksBy[state.mySeat] || 0)), text('span', '', (13 - d.tricks) + ' tricks left'),
        state.mySeat === k.declarer && d.called && d.partner === null ? text('span','partner-pending','Partner Hidden · Waiting for the Called Card') : null,
        text('span', 'trump-state', k.denom === 'N' ? 'No trumps' : 'Trumps ' + SUITS[k.denom] + (d.trumpBroken ? ' · open' : ' · not open yet'))),
      !known ? text('p', 'muted small team-privacy', 'Team totals stay hidden until the partner reveals themselves. Individual trick counts are always visible.') :
        d.solo ? text('p', 'muted small team-privacy', 'The declarer is playing alone.') : d.partner !== null ? text('p', 'muted small team-privacy', c.who(state.seats[d.partner]) + ' is the partner.') : text('p', 'muted small team-privacy', 'These team totals are private to you while your role is hidden.'));
  }
  function table(c) {
    const { state } = c, d = state.deal, me = Math.max(0, state.mySeat), done = d.trick.length === 0 && d.lastTrick, trickCards = d.trick.length ? d.trick : collecting(state) ? (d.lastTrick?.cards || []) : [], lastWinner = done ? d.lastTrick.winner : null;
    const rel = (k) => (me + k) % 4, pos = ['bottom', 'left', 'top', 'right']; // clockwise from you
    const seatEl = (k) => {
      const seat = rel(k), id = state.seats[seat];
      const isDeclarer = !!d.contract && seat === d.contract.declarer;
      const isPartner = !!d.contract && d.partner === seat && seat !== d.contract.declarer;
      const isDefender = !!d.contract && d.partner !== null && !isDeclarer && !isPartner;
      const tags = [seat === d.dealer ? 'DEALER' : null].filter(Boolean);
      return el('div', { 'data-bridge-seat': seat, class: 'felt-seat pos-' + pos[k] + (d.turn === seat ? ' turn' : '') + (lastWinner === seat ? ' winner' : '') },
        el('div', { class: 'plate' }, c.avatar(id, isDeclarer ? 'declarer-avatar' : isPartner ? 'revealed-partner' : isDefender ? 'defender-avatar' : ''), el('b', {}, c.who(id) + (seat === state.mySeat ? ' · You' : '')), isDeclarer ? text('small','declarer-tag','Declarer') : isPartner ? text('small','partner-tag','Partner') : isDefender ? text('small','defender-tag','Defender') : null, text('small', 'muted', [...tags, d.counts[seat] + ' cards'].join(' · '))),
        d.contract ? el('div', { class: 'collected' }, pileOf(d.tricksBy[seat]), text('small', 'muted', 'tricks')) : null);
    };
    const slots = [0, 1, 2, 3].map((k) => { const seat = rel(k), played = trickCards.find((x) => x.seat === seat); return el('div', { 'data-bridge-seat': seat, class: 'trick-slot pos-' + pos[k] + (lastWinner === seat ? ' winner' : '') }, played ? c.card(played.card, { label: c.who(state.seats[seat]) + ' played' }) : null); });
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
      c.button(pick ? 'Bid ' + pick[0] + ' ' + names[pick[1]] : 'Choose Number and Suit', async () => { const call = pick; if (await send('call', { call })) { pick = ''; bidLevel = 0; bidSuit = ''; } }, 'primary', !pick || !ok(pick), 'bid-confirm', 'check:ink'),
      c.button('Pass', () => send('call', { call: 'P' }), 'secondary', false, 'bid-P', 'skip:blue'));
  }
  function callBox(c) {
    const { state, send } = c, d = state.deal;
    if (!d.callable) return null;
    const mine = new Set(d.myHand);
    return el('div', { class: 'call-box' },
      text('p', 'muted small', 'Name one card. Whoever holds it is your secret partner. A card from your own hand means you play alone.'),
      ...['S', 'H', 'D', 'C'].map((s) => el('div', { class: 'call-row' }, suitSpan(s), ...[...ranksAsc].reverse().map((r) => { const code = s + r; return el('button', { type: 'button', class: 'call-card' + (callPick === code ? ' selected' : '') + (mine.has(code) ? ' own' : ''), 'data-focus': 'call-' + code, 'aria-pressed': callPick === code, disabled: c.busy, onclick: () => { callPick = code; c.render(); } }, c.rankLabel(r)); }))),
      c.button(callPick ? ['Call ', cardLabel(callPick, c)] : 'Choose a Card', async () => { const card = callPick; if (await send('callCard', { card })) callPick = ''; }, 'primary', !callPick, 'call-confirm', 'spark:ink'));
  }
  function turnBanner(c) {
    const { state } = c, d = state.deal; let msg = '', mine = false;
    if (collecting(state)) return el('div', { class: 'turn-banner collecting-banner', role: 'status' }, c.icon('cards'), c.who(state.seats[d.lastTrick.winner]) + ' wins this trick. Collecting cards…');
    if (state.phase === 'bidding') { mine = d.turn === state.mySeat; msg = mine ? 'Your turn to bid.' : c.who(state.seats[d.turn]) + ' is bidding…'; }
    else if (state.phase === 'calling') { mine = d.turn === state.mySeat; msg = mine ? 'You are the declarer. Call a partner card.' : c.who(state.seats[d.turn]) + ' is calling a partner card…'; }
    else if (state.phase === 'playing') {
      mine = d.turn === state.mySeat;
      msg = mine ? (!d.legal ? 'Getting your cards ready…' : d.trick.length ? 'Your turn. Follow suit if you can.' : 'Your turn. Lead a card.') : c.who(state.seats[d.turn]) + ' is playing…';
    }
    return msg ? el('div', { class: 'turn-banner' + (mine ? ' mine' : ''), role: 'status' }, mine ? c.icon('spark') : null, msg) : null;
  }
  function role(c) {
    const { state } = c, d = state.deal;
    if (!d.contract || state.mySeat < 0) return null;
    if (state.mySeat === d.contract.declarer) return d.called ? 'You are the declarer.' : null;
    if (d.iAmPartner && d.partner !== null) return 'You are ' + c.who(state.seats[d.contract.declarer]) + '’s partner. Work together to win the contract.';
    if (d.iAmPartner) return 'You hold the called card: you are the declarer’s secret partner. Help take tricks. Your identity stays hidden until you play it.';
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
    return el('section', { class: 'tk-panel hand-panel mine' + (d.turn === state.mySeat ? ' active' : '') }, el('div', { class: 'panel-heading' }, el('div', {}, text('span', 'eyebrow', 'YOUR HAND · ' + seatLabel(state.mySeat)), el('h3', {}, 'Your Cards')), text('span', 'hcp', d.myPoints + ' points')),
      d.iAmPartner ? el('div', {class:'partner-private'}, c.icon('lock'), el('div',{}, text('b','',d.partner === null ? 'You’re the Secret Partner' : 'You’re the Partner'), text('small','', (d.partner === null ? 'Only You Can See This · ' : 'Your Team Is Now Public · ') + c.who(state.seats[d.contract.declarer]) + ' Called ' + c.rankLabel(d.called.slice(1)) + SUITS[d.called[0]]))) : null,
      note ? text('p', 'role-note', note) : null,
      leadHint(c) ? text('p', 'hint', leadHint(c)) : null,
      handRow(c, d.myHand, { legal, play, scroll: 'mine', privatePartner:d.iAmPartner }),
      legal && pick ? c.button('Play ' + c.rankLabel(pick.slice(1)) + c.SUIT[pick[0]], () => play(pick), 'primary', !legal.includes(pick), 'play-confirm', 'cards:ink') : legal ? text('p', 'muted small', 'Tap a card to choose it. Tap again to play. Grey cards cannot be played.') : null,
      extra || null);
  }
  function auctionHeads(c, seats, dealer) {
    return seats.map((id, i) => el('div', { class: 'auction-head', role: 'columnheader' },
      c.avatar(id), text('b', '', c.who(id)), i === dealer ? text('small', '', 'Dealer') : null));
  }
  function victory(c, seats, title, subtitle, key) {
    if (!celebrationStarts.has(key)) celebrationStarts.set(key, Date.now());
    const elapsed = Date.now() - celebrationStarts.get(key);
    return el('section', { class: 'victory-banner', 'aria-label': title, style: '--victory-delay:-' + elapsed + 'ms;--winner-count:' + Math.max(1,seats.length) },
      el('div', { class: 'victory-sparks', 'aria-hidden': 'true' }, ...Array.from({length:12}, (_,i) => el('i', {style:'--spark:' + i}))),
      c.icon('crown', 'victory-crown'), text('span', 'eyebrow', 'The Winners'), el('h1', {}, title),
      el('div', { class: 'victory-players' }, seats.map(i => el('div', { class: 'victory-player' }, c.avatar(c.state.seats[i]), text('b', '', c.who(c.state.seats[i]))))),
      text('p', 'victory-subtitle', subtitle));
  }
  function dealVictory(c, entry) {
    if (!entry.contract || collecting(c.state)) return null;
    const team = [entry.contract.declarer, entry.partner];
    const winners = [0,1,2,3].filter(i => entry.success ? team.includes(i) : !team.includes(i));
    return victory(c, winners, entry.success ? 'Contract Made!' : 'Defenders Win!',
      winners.map(i=>c.who(entry.seats[i])).join(' & ') + ' · +' + entry.delta[winners[0]] + ' ' + (entry.delta[winners[0]] === 1 ? 'Point' : 'Points') + (winners.length > 1 ? ' Each' : ''),
      [c.state.code,c.state.match,entry.board,'deal'].join(':'));
  }
  function reveal(c, entry, host) {
    const { state, send } = c;
    return c.panel('reveal-panel', text('span', 'eyebrow', 'Deal ' + entry.board + ' Result'), el('h2', {}, resultText(entry, c)), dealDetail(c, entry),
      host ? c.button(state.board >= state.deals ? 'Show Final Result' : 'Next Deal', () => send('next'), 'host-button', collecting(state), 'next', 'play:ink') : text('p', 'waiting', 'Waiting for the host to continue.'));
  }
  function balancedCards(c, cards) {
    const rows = Math.max(1, Math.ceil(cards.length / 5)), base = Math.floor(cards.length / rows), extra = cards.length % rows;
    let from = 0;
    return el('div', {class:'result-card-rows'}, ...Array.from({length:rows}, (_,i) => {
      const count = base + (i < extra ? 1 : 0), row = cards.slice(from, from + count); from += count;
      return el('div', {class:'result-card-row'}, row.map(code=>c.card(code,{small:true})));
    }));
  }
  function dealDetail(c, e) {
    const hands = el('div', { class: 'all-hands' }, e.hands.map((h, i) => {
      const role = !e.contract ? 'Player' : i === e.contract.declarer ? (e.partner === i ? 'Solo Declarer' : 'Declarer') : i === e.partner ? 'Partner' : 'Defender';
      return el('section', { class:'reveal-hand' },
        el('div', {class:'result-player'}, c.avatar(e.seats[i]), el('div', {}, text('b','',c.who(e.seats[i])), text('small','muted',role)), e.delta[i] ? text('strong','result-points','+' + e.delta[i]) : null),
        balancedCards(c,h));
    }));
    const calls = el('div', { class: 'auction auction-small' }, auctionHeads(c,e.seats,e.dealer), [...Array(e.dealer).fill(null), ...e.calls].map((x) => el('span', { class: 'auction-cell' + (x && x.call !== 'P' ? ' call' : '') }, x ? callLabel(x.call) : '')));
    return el('div', { class: 'deal-detail' }, e.contract ? el('p', { class: 'result-summary' }, 'Called Card: ', cardLabel(e.called, c), ' · Declarer Team: ' + e.made + '/' + e.target + (e.endedEarly ? ' · ' + e.remaining + ' unplayed tricks' : '')) : null,
      hands, el('details', {'data-details':'result-bids-' + c.state.match + '-' + e.board}, el('summary',{},'Bidding History'), calls));
  }
  function finale(c) {
    const { state, send } = c, host = state.hostId === state.meId, w = state.finalWinners || [], mine = state.mySeat >= 0 && w.includes(state.mySeat);
    return c.panel('finale-panel', victory(c, w, w.length > 1 ? 'Joint Champions!' : c.who(state.seats[w[0]]) + ' Wins!', mine ? 'Well Played · Match Complete' : 'Match Complete · Until Next Time', [state.code,state.match,'match'].join(':')), scoreStrip(c),
      el('fieldset', { class: 'pace-settings' }, el('legend', {}, 'Number of Deals'), el('div', { class: 'pace-options' }, [2, 4, 8].map((n) => el('button', { type: 'button', class: state.deals === n ? 'selected' : '', 'aria-pressed': state.deals === n, disabled: !host, onclick: () => { if (c.busy || state.deals === n) return; state.deals = n; send('settings', { deals: n }); } }, n + ' deals')))),
      host ? [c.botControls(), c.button('Play Again', () => send('start'), 'host-button start-ticket', state.players.filter((p) => !p.departed).length < 4, undefined, 'refresh:ink'), c.button('Shuffle Seats', () => send('shuffleSeats'), 'secondary')] : text('p', 'waiting', 'Waiting for the host to start a new match.'));
  }
  function screen(c) {
    const { state } = c, d = state.deal, host = state.hostId === state.meId;
    if (state.phase === 'finished') return el('div', { class: 'tk-scene' }, finale(c), pastDeals(c));
    if (state.phase === 'reveal' && !collecting(state)) return el('div', {class:'tk-scene'}, dealVictory(c,state.history.at(-1)), reveal(c,state.history.at(-1),host), el('details', {class:'final-table', 'data-details':'final-table'}, el('summary',{},'Final Table'), c.panel('table-panel',contractBar(c),table(c),turnBanner(c))), pastDeals(c,1));
    const key = state.match + ':' + d.board + ':' + d.calls.length + ':' + d.tricks + ':' + d.trick.length + ':' + state.phase;
    if (key !== pickKey) { pickKey = key; pick = ''; callPick = ''; bidLevel = 0; bidSuit = ''; }
    return el('div', { class: 'tk-scene' }, el('details', { class: 'match-scores', 'data-details': 'match-scores' }, el('summary', {}, 'Match Scores · Deal ' + state.board + ' / ' + state.deals), scoreStrip(c)),
      el('div', { class: 'bridge-grid' },
        el('div', { class: 'main-col' }, c.panel('table-panel', contractBar(c), table(c), turnBanner(c)),
          state.phase === 'bidding' ? c.panel('bidding-panel', el('div', { class: 'panel-heading' }, el('div', {}, text('span', 'eyebrow', 'BIDDING'), el('h3', {}, 'The Auction'))), bidBox(c), el('details', { 'data-details': 'bidding-live' }, el('summary', {}, 'Bidding So Far'), auction(c, d))) : null,
          state.phase === 'calling' && d.callable ? c.panel('call-panel', el('div', { class: 'panel-heading' }, el('div', {}, text('span', 'eyebrow', 'DECLARER'), el('h3', {}, 'Call Your Partner’s Card'))), callBox(c)) : null,
          state.phase === 'reveal' ? reveal(c, state.history.at(-1), host) : null),
        el('div', { class: 'side-col' }, state.phase !== 'reveal' ? handPanel(c) : null, state.phase === 'playing' || state.phase === 'calling' ? c.panel('auction-panel', el('h3', {}, 'The Bidding'), auction(c, d)) : null, c.roster((p) => { const i = state.seats.indexOf(p.id); return i < 0 ? null : seatLabel(i); }))),
      pastDeals(c, state.phase === 'reveal' ? 1 : 0));
  }
  // Keep the same overlay nodes across polls. Coordinates belong to the table,
  // so scrolling moves the flying cards and their destination together.
  // ---- extra animation: dealing, cards flying to the table, bid bubbles, reveals ----
  let fx = null;
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const plateOf = (seat) => document.querySelector('.felt-seat[data-bridge-seat="' + seat + '"] .plate');
  function bubble(node, label, cls) {
    if (!node || calm()) return;
    const r = node.getBoundingClientRect(), b = el('div', { class: 'br-bubble ' + (cls || '') }, label);
    b.style.left = r.left + r.width / 2 + 'px'; b.style.top = r.top + 'px'; document.body.append(b); setTimeout(() => b.remove(), 1500);
  }
  function flyCard(c, code, from, slotCard) {
    const to = slotCard.getBoundingClientRect();
    if (calm() || !from || !to.width) return;
    slotCard.style.opacity = 0;
    const n = c.card(code); n.classList.add('br-fly'); n.style.width = to.width + 'px'; n.style.height = to.height + 'px'; document.body.append(n);
    const at = (r, k) => 'translate(' + (r.left + r.width / 2 - to.width / 2) + 'px,' + (r.top + r.height / 2 - to.height / 2) + 'px) scale(' + k + ')';
    const end = () => { n.remove(); slotCard.style.opacity = ''; };
    const a = n.animate([{ transform: at(from, from.width > to.width ? 1 : 0.55) }, { transform: at(to, 1) }], { duration: 420, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'forwards' });
    a.onfinish = end; a.oncancel = end;
  }
  function flair(c) {
    const st = c.state, d = st?.deal; if (!st || !d || !['bidding', 'calling', 'playing', 'reveal'].includes(st.phase)) { fx = null; return; }
    const deal = st.match + ':' + st.board, hand = [...document.querySelectorAll('.hand-panel .hand-row .pcard')];
    const rects = new Map(); hand.forEach((n, i) => { if (d.myHand?.[i]) rects.set(d.myHand[i], n.getBoundingClientRect()); });
    const trick = (d.trick.length ? d.trick : collecting(st) ? (d.lastTrick?.cards || []) : []);
    const now = { deal, cards: new Set(trick.map((x) => deal + ':' + x.card)), calls: d.calls.length, contract: !!d.contract, partner: d.partner, broken: !!d.trumpBroken, trickNo: d.lastTrick?.number || 0, rects };
    const was = fx && fx.deal === deal ? fx : null;
    if (!fx || fx.deal !== deal) {
      // a fresh deal: the cards are dealt out to the hand one by one
      if (fx && !calm()) hand.forEach((n, i) => n.animate([{ opacity: 0, transform: 'translateY(-60px) scale(.6) rotate(-8deg)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: i * 55, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
    } else if (!document.hidden) {
      const fresh = trick.filter((x) => !was.cards.has(deal + ':' + x.card));
      fresh.forEach((x) => {
        const slot = document.querySelector('.trick-slot[data-bridge-seat="' + x.seat + '"] .pcard'); if (!slot) return;
        flyCard(c, x.card, x.seat === st.mySeat ? was.rects.get(x.card) || plateOf(x.seat)?.getBoundingClientRect() : plateOf(x.seat)?.getBoundingClientRect(), slot);
      });
      if (now.calls > was.calls) { const call = d.calls[d.calls.length - 1]; if (call) { bubble(plateOf(call.seat), call.call === 'P' ? 'Pass' : call.call[0] + ' ' + SUITS[call.call[1]], call.call === 'P' ? 'pass' : 'bid'); [...document.querySelectorAll('.auction-cell.call')].at(-1)?.classList.add('br-pop'); } }
      if (now.contract && !was.contract) { bubble(plateOf(d.contract.declarer), 'Contract ' + d.contract.level + ' ' + SUITS[d.contract.denom], 'bid'); document.querySelector('.contract-bar')?.classList.add('br-pop'); }
      if (now.partner !== null && now.partner !== undefined && (was.partner === null || was.partner === undefined)) { bubble(plateOf(d.partner), '🤝 Partner revealed!', 'reveal'); document.querySelector('.called-card')?.classList.add('br-pop'); }
      if (now.broken && !was.broken) bubble(document.querySelector('.trick'), '♦ Trumps are open!', 'reveal');
      if (now.trickNo > was.trickNo && d.lastTrick) bubble(plateOf(d.lastTrick.winner), 'Wins the trick!', 'win');
    }
    fx = now;
  }
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
    return list.length ? c.panel('history', el('h3', {}, 'Past Deals'), ...list.slice().reverse().map((e) => el('details', { 'data-details': 'deal-' + state.match + '-' + e.board }, el('summary', {}, 'Deal ' + e.board + ' · ' + resultText(e, c)), dealDetail(c, e)))) : null;
  }
})();


