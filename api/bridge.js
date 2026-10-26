const R = require('../lib/bridge-rules');
const { createRoomApi, need, present, shuffle } = require('../lib/room-api');

const DEAL_OPTIONS = [2, 4, 8];
const trumpOf = (contract) => (contract.denom === 'N' ? null : contract.denom);
const sideTricks = (d) => d.tricksBy[d.declarer] + (d.partner !== d.declarer ? d.tricksBy[d.partner] : 0);

function startDeal(room) {
  const board = room.board, hands = R.deal(), dealer = R.dealerFor(board);
  room.d = { board, dealer, hands, original: hands.map((h) => h.slice()), calls: [], turn: dealer, contract: null, declarer: null, called: null, partner: null, revealed: false, trick: [], lastTrick: null, tricks: 0, tricksBy: [0, 0, 0, 0] };
  room.phase = 'bidding';
}
function start(room) {
  need(room.players.length === 4, 409, 'Bridge needs exactly 4 players.');
  room.seats = room.players.map((p) => p.id);
  room.match = (room.match || 0) + 1; room.board = 1; room.scores = [0, 0, 0, 0]; room.history = [];
  startDeal(room);
}
// The hidden partner announces themselves when the defenders are one trick from defeating the contract.
function checkAnnounce(room) {
  const d = room.d;
  if (d.revealed) return;
  const lost = d.tricks - sideTricks(d);
  if (lost >= 13 - R.target(d.contract)) d.revealed = true;
}
function finishDeal(room) {
  const d = room.d, entry = { seats: room.seats.slice(), board: d.board, dealer: d.dealer, calls: d.calls.map((c) => ({ ...c })), hands: d.original, contract: null, called: null, partner: null, tricksBy: d.tricksBy.slice(), delta: [0, 0, 0, 0] };
  if (d.contract) {
    const tricks = sideTricks(d), result = R.scoreDeal(d.contract, d.partner, tricks);
    result.delta.forEach((n, s) => { room.scores[s] += n; });
    Object.assign(entry, { contract: { ...d.contract, name: R.contractName(d.contract) }, called: d.called, partner: d.partner, made: tricks, target: R.target(d.contract), result: tricks - R.target(d.contract), success: result.made, delta: result.delta });
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
  checkAnnounce(room);
}
function doPlay(room, card) {
  const d = room.d, seat = d.turn;
  d.hands[seat] = d.hands[seat].filter((c) => c !== card);
  d.trick.push({ seat, card });
  if (card === d.called) d.revealed = true;
  if (d.trick.length < 4) { d.turn = R.left(seat); return; }
  const winner = R.trickWinner(d.trick, trumpOf(d.contract));
  d.tricksBy[winner]++; d.tricks++;
  d.lastTrick = { cards: d.trick, winner }; d.trick = []; d.turn = winner;
  checkAnnounce(room);
  if (d.tricks === 13) finishDeal(room);
}
const legalFor = (d) => R.legalCards(d.hands[d.turn], d.trick[0] && R.suitOf(d.trick[0].card));
function autoCard(d) {
  const mine = d.hands[d.turn];
  return R.deck().reverse().find((c) => !mine.includes(c) && R.rankOf(c) === 12) || R.deck().find((c) => !mine.includes(c));
}
function autopilot(room) {
  let changed = false;
  for (let i = 0; i < 400 && ['bidding', 'calling', 'playing'].includes(room.phase); i++) {
    const d = room.d, actor = room.players.find((p) => p.id === room.seats[d.turn]);
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
    called: d.called, turn: ['bidding', 'calling', 'playing'].includes(room.phase) ? d.turn : null, trick: d.trick, lastTrick: d.lastTrick, tricks: d.tricks, tricksBy: d.tricksBy,
    counts: d.hands.map((h) => h.length), myHand: mySeat >= 0 ? d.hands[mySeat] : [], myPoints: mySeat >= 0 ? R.points(d.original[mySeat]) : 0,
    partner: d.revealed || room.phase === 'reveal' ? d.partner : null,
    iAmPartner: mySeat >= 0 && !!d.called && d.original[mySeat].includes(d.called) && mySeat !== d.declarer,
    solo: !!d.called && d.partner === d.declarer && (d.revealed || room.phase === 'reveal'),
  };
  if (bidding && mySeat === d.turn) deal.legalCalls = R.legalCalls(d.calls);
  if (calling && mySeat === d.turn) deal.callable = true;
  if (play && mySeat === d.turn) deal.legal = legalFor(d);
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
      need(seat >= 0 && d.turn === seat, 409, 'It is not your turn to play.');
      need(typeof body.card === 'string' && d.hands[seat].includes(body.card), 400, 'That card is not in the hand.');
      need(legalFor(d).includes(body.card), 400, 'You must follow the suit that was led.');
      doPlay(room, body.card);
    },
    next(room, me, body, { host }) {
      host(); need(room.phase === 'reveal', 409, 'This deal has not ended yet.');
      if (room.board >= (room.settings.deals || 4)) room.phase = 'finished'; else { room.board++; startDeal(room); }
    },
  },
  view,
});
module.exports = api.handler;
module.exports._rules = { start, startDeal, doCall, doCallCard, doPlay, finishDeal, view };

