const R = require('../lib/bridge-rules');
const B = require('../lib/bridge-bot');
const { pace } = require('../lib/bot-pace');
const { createRoomApi, need, present, shuffle } = require('../lib/room-api');

const DEAL_OPTIONS = [2, 4, 8];
const COLLECT_MS = 1600;
const trumpOf = (contract) => (contract.denom === 'N' ? null : contract.denom);
const sideTricks = (d) => d.tricksBy[d.declarer] + (Number.isInteger(d.partner) && d.partner !== d.declarer ? d.tricksBy[d.partner] : 0);
const decided = d => !!d.contract && (sideTricks(d) >= R.target(d.contract) || d.tricks - sideTricks(d) >= 14 - R.target(d.contract));

function startDeal(room) {
  const board = room.board, hands = R.deal(), dealer = R.dealerFor(board);
  room.d = { board, dealer, hands, original: hands.map((h) => h.slice()), calls: [], turn: dealer, contract: null, declarer: null, called: null, partner: null, revealed: false, trumpBroken: false, trick: [], lastTrick: null, tricks: 0, tricksBy: [0, 0, 0, 0] };
  room.phase = 'bidding';
}
function start(room) {
  need(room.players.length === 4, 409, 'Bridge needs exactly 4 players.');
  room.seats = room.players.map((p) => p.id);
  room.match = (room.match || 0) + 1; room.board = 1; room.scores = [0, 0, 0, 0]; room.history = [];
  startDeal(room);
}
function finishDeal(room) {
  const d = room.d, entry = { seats: room.seats.slice(), board: d.board, dealer: d.dealer, calls: d.calls.map((c) => ({ ...c })), hands: d.original, contract: null, called: null, partner: null, tricksBy: d.tricksBy.slice(), delta: [0, 0, 0, 0] };
  if (d.contract) {
    const tricks = sideTricks(d), remaining = 13 - d.tricks;
    // Stopping early leaves unplayed cards. Only score the defeat already
    // guaranteed, rather than counting those unplayed tricks as losses too.
    const scoredTricks = tricks >= R.target(d.contract) ? tricks : tricks + remaining;
    const result = R.scoreDeal(d.contract, d.partner, scoredTricks);
    result.delta.forEach((n, s) => { room.scores[s] += n; });
    Object.assign(entry, { contract: { ...d.contract, name: R.contractName(d.contract) }, called: d.called, partner: d.partner, made: tricks, scoredTricks, remaining, endedEarly: remaining > 0, target: R.target(d.contract), result: scoredTricks - R.target(d.contract), success: result.made, delta: result.delta });
  }
  room.history.push(entry);
  room.phase = 'reveal';
}
function doCall(room, call) {
  const d = room.d;
  d.calls.push({ seat: d.turn, call });
  if (!R.auctionOver(d.calls)) { d.turn = R.left(d.turn); return; }
  const contract = R.contractOf(d.calls);
  if (!contract) { finishDeal(room); return; }
  d.contract = contract; d.declarer = contract.declarer; d.turn = contract.declarer; room.phase = 'calling';
}
function doCallCard(room, card) {
  const d = room.d;
  d.called = card;
  d.partner = d.original.findIndex((h) => h.includes(card));
  d.turn = R.openingLeader(d.contract); room.phase = 'playing';
}
function doPlay(room, card) {
  const d = room.d, seat = d.turn;
  d.hands[seat] = d.hands[seat].filter((c) => c !== card);
  d.trick.push({ seat, card });
  if (card === d.called) d.revealed = true;
  if (R.suitOf(card) === trumpOf(d.contract)) d.trumpBroken = true; // a void player trumping in (or any trump played) opens trumps for leading
  if (d.trick.length < 4) { d.turn = R.left(seat); return; }
  const winner = R.trickWinner(d.trick, trumpOf(d.contract));
  d.tricksBy[winner]++; d.tricks++;
  d.lastTrick = { cards: d.trick, winner, number: d.tricks, at: Date.now() };
  d.collectUntil = d.lastTrick.at + COLLECT_MS;
  d.trick = []; d.turn = winner;
  if (decided(d)) finishDeal(room);
}
const legalFor = (d) => R.legalCards(d.hands[d.turn], d.trick[0] && R.suitOf(d.trick[0].card), { trump: d.contract && trumpOf(d.contract), broken: d.trumpBroken });
function autoCard(d) {
  const mine = d.hands[d.turn];
  return R.deck().reverse().find((c) => !mine.includes(c) && R.rankOf(c) === 12) || R.deck().find((c) => !mine.includes(c));
}
function botMove(room) {
  const d = room.d, seat = d.turn, hand = d.hands[seat];
  if (room.phase === 'bidding') {
    const call = B.bid(d.calls, hand);
    doCall(room, R.isLegalCall(d.calls, call) ? call : 'P');
  } else if (room.phase === 'calling') {
    const card = B.callCard(hand, d.contract);
    doCallCard(room, R.isCard(card) ? card : autoCard(d));
  } else {
    const legal = legalFor(d);
    const card = B.play({ hand, legal, trick: d.trick, trump: trumpOf(d.contract), seat, declarer: d.declarer, called: d.called, iAmPartner: seat !== d.declarer && d.original[seat].includes(d.called), revealed: d.revealed, partner: d.revealed ? d.partner : null });
    doPlay(room, legal.includes(card) ? card : legal[0]);
  }
}
function autopilot(room) {
  // Existing rooms may already have reached a target under the old 13-trick rule.
  if (room.phase === 'playing' && decided(room.d)) { finishDeal(room); return true; }
  // Older rooms could expose the partner before the called card was played.
  let changed = false;
  if (room.phase === 'playing' && room.d.revealed && room.d.hands.some(h => h.includes(room.d.called))) { room.d.revealed = false; changed = true; }
  for (let i = 0; i < 400 && ['bidding', 'calling', 'playing'].includes(room.phase); i++) {
    const d = room.d, actor = room.players.find((p) => p.id === room.seats[d.turn]);
    if (d.collectUntil > Date.now()) break;
    if (actor?.bot) {
      const wait = pace(room); changed ||= wait.changed;
      if (!wait.act) break;
      botMove(room); changed = true; continue;
    }
    if (!actor?.departed) break;
    if (room.phase === 'bidding') doCall(room, 'P');
    else if (room.phase === 'calling') doCallCard(room, autoCard(d));
    else doPlay(room, legalFor(d).slice().sort((a, b) => R.rankOf(a) - R.rankOf(b))[0]);
    changed = true;
  }
  return changed;
}
function view(room, me) {
  const lobby = ['lobby', 'finished'].includes(room.phase);
  const seats = lobby ? present(room).slice(0, 4).map((p) => p.id) : room.seats || present(room).slice(0, 4).map((p) => p.id);
  const mySeat = seats.indexOf(me.id), d = room.d, out = { seats, mySeat, deals: room.settings.deals || 4, board: room.board || 0, scores: room.scores || [0, 0, 0, 0], history: room.history || [], deal: null };
  if (!d || room.phase === 'lobby') return out;
  const bidding = room.phase === 'bidding', calling = room.phase === 'calling', play = room.phase === 'playing';
  const deal = {
    board: d.board, dealer: d.dealer, calls: d.calls, contract: d.contract && { ...d.contract, name: R.contractName(d.contract), target: R.target(d.contract) },
    called: d.called, turn: ['bidding', 'calling', 'playing'].includes(room.phase) ? d.turn : null, trick: d.trick, lastTrick: d.lastTrick, collectUntil: d.collectUntil || null, tricks: d.tricks, tricksBy: d.tricksBy, trumpBroken: d.trumpBroken,
    counts: d.hands.map((h) => h.length), myHand: mySeat >= 0 ? d.hands[mySeat] : [], myPoints: mySeat >= 0 ? R.points(d.original[mySeat]) : 0,
    partner: d.revealed || room.phase === 'reveal' ? d.partner : null,
    iAmPartner: mySeat >= 0 && !!d.called && d.original[mySeat].includes(d.called) && mySeat !== d.declarer,
    solo: !!d.called && d.partner === d.declarer && (d.revealed || room.phase === 'reveal'),
  };
  if (d.contract) {
    // Exact totals can identify the partner by subtraction. Only disclose them
    // after the public reveal, or privately to the player who holds that card.
    const known = d.revealed || ['reveal', 'finished'].includes(room.phase) || mySeat === d.partner;
    const won = sideTricks(d);
    deal.progress = { declarer: known ? won : null, defenders: known ? d.tricks - won : null, target: R.target(d.contract), defenderTarget: 14 - R.target(d.contract), remaining: 13 - d.tricks };
  }
  if (bidding && mySeat === d.turn) deal.legalCalls = R.legalCalls(d.calls);
  if (calling && mySeat === d.turn) deal.callable = true;
  if (play && mySeat === d.turn && !(d.collectUntil > Date.now())) deal.legal = legalFor(d);
  out.deal = deal;
  if (room.phase === 'finished') {
    const top = Math.max(...room.scores);
    out.finalWinners = room.scores.map((n, s) => (n === top ? s : -1)).filter((s) => s >= 0);
  }
  return out;
}

const api = createRoomApi({
  ns: 'bridge', min: 4, max: 4,
  init(room) { room.settings = { deals: 4 }; },
  settings(room, body) { need(DEAL_OPTIONS.includes(body.deals), 400, 'Choose 2, 4 or 8 deals.'); room.settings = { ...room.settings, deals: body.deals }; },
  start,
  tick: (room) => autopilot(room),
  // seats ranked by total score; equal scores share a place
  results(room) {
    let place = 0, prev = null;
    return (room.seats || []).map((id, i) => ({ id, score: room.scores[i] })).sort((a, b) => b.score - a.score).map((r, i) => { if (r.score !== prev) { place = i + 1; prev = r.score; } return { id: r.id, place }; });
  },
  onLeave(room) { if (room.phase === 'lobby') delete room.seats; },
  actions: {
    shuffleSeats(room, me, body, { host }) {
      host(); need(['lobby', 'finished'].includes(room.phase), 409, 'Change seats before the next game.');
      room.players = shuffle(present(room));
    },
    call(room, me, body) {
      need(room.phase === 'bidding', 409, 'The bidding is over.');
      const d = room.d, seat = room.seats.indexOf(me.id);
      need(seat === d.turn, 409, 'It is not your turn to bid.');
      need(R.isLegalCall(d.calls, body.call), 400, 'That call is not allowed now.');
      doCall(room, body.call);
    },
    callCard(room, me, body) {
      need(room.phase === 'calling', 409, 'No partner card is being called now.');
      const d = room.d, seat = room.seats.indexOf(me.id);
      need(seat === d.declarer, 409, 'Only the declarer calls a partner card.');
      need(R.isCard(body.card), 400, 'Choose a card.');
      doCallCard(room, body.card);
    },
    play(room, me, body) {
      need(room.phase === 'playing', 409, 'No card can be played now.');
      const d = room.d, seat = room.seats.indexOf(me.id);
      need(!(d.collectUntil > Date.now()), 409, 'The winner is collecting this trick.');
      need(seat >= 0 && d.turn === seat, 409, 'It is not your turn to play.');
      need(typeof body.card === 'string' && d.hands[seat].includes(body.card), 400, 'That card is not in the hand.');
      need(legalFor(d).includes(body.card), 400, d.trick.length ? 'You must follow the suit that was led.' : 'Trumps cannot be led until a trump has been played.');
      doPlay(room, body.card);
    },
    next(room, me, body, { host }) {
      host(); need(room.phase === 'reveal', 409, 'This deal has not ended yet.');
      need(!(room.d.collectUntil > Date.now()), 409, 'The winner is collecting this trick.');
      if (room.board >= (room.settings.deals || 4)) room.phase = 'finished'; else { room.board++; startDeal(room); }
    },
  },
  view,
});
module.exports = api.handler;
module.exports._rules = { start, startDeal, doCall, doCallCard, doPlay, finishDeal, view, botMove };









