const crypto = require('node:crypto');
const R = require('../lib/hot-joker-rules');
const { createRoomApi, need, present, shuffle } = require('../lib/room-api');

const TURN_OPTIONS = [20, 40, 60];
const SET_SIZE = 4;
const randomIndex = (n) => crypto.randomInt(n);
const setDeadline = (room) => { room.deadline = Date.now() + (room.settings.turnSeconds || 40) * 1000; };
const place = (room, id) => { if (room.hands[id].length === 0 && !room.placed.includes(id)) room.placed.push(id); };

function start(room) {
  need(room.players.length >= 3, 409, 'Hot Joker needs at least 3 players.');
  const order = room.players.map((p) => p.id), hands = R.deal(order);
  room.order = order; room.match = (room.match || 0) + 1;
  room.sets = []; room.placed = []; room.loser = null; room.last = {}; room.idle = 0; room.losses = room.losses || {};
  for (const id of order) {
    const laid = R.layDown(hands[id], SET_SIZE);
    hands[id] = laid.hand; laid.ranks.forEach((rank) => room.sets.push({ id, rank }));
  }
  room.hands = hands; room.turn = 0; room.taker = order[randomIndex(order.length)];
  room.log = [{ kind: 'deal', taker: room.taker }];
  order.forEach((id) => place(room, id));
  room.phase = 'playing'; setDeadline(room);
}
function finish(room) {
  room.loser = R.jokerHolder(room.order, room.hands);
  room.losses[room.loser] = (room.losses[room.loser] || 0) + 1;
  room.phase = 'finished'; room.taker = null; room.deadline = null;
}
// When no set can ever form again, the remaining sets are swept to whoever holds most of each rank,
// everyone but the Joker holder is safe, and the game ends.
function sweep(room) {
  const holder = R.jokerHolder(room.order, room.hands), alive = R.alive(room.order, room.hands), byRank = {};
  for (const id of alive) for (const card of room.hands[id]) if (!R.isJoker(card)) { const r = R.rankOf(card); byRank[r] = byRank[r] || {}; byRank[r][id] = (byRank[r][id] || 0) + 1; }
  for (const [rank, owners] of Object.entries(byRank)) room.sets.push({ id: Object.entries(owners).sort((a, b) => b[1] - a[1])[0][0], rank });
  for (const id of alive) if (id !== holder) { room.hands[id] = []; place(room, id); }
  room.hands[holder] = [R.JOKER];
}
function advance(room, from) {
  if (R.alive(room.order, room.hands).length <= 1) { finish(room); return; }
  const next = R.nextTaker(room.order, room.hands, from);
  // Stuck: no set is possible, or nobody has made one for three full rounds.
  if (R.frozen(room.order, room.hands, next, SET_SIZE) || room.idle >= 3 * R.alive(room.order, room.hands).length) { sweep(room); finish(room); return; }
  room.taker = next; setDeadline(room);
}
function takeCard(room, index) {
  const taker = room.taker, source = R.sourceFor(room.order, room.hands, taker);
  const [card] = room.hands[source].splice(index, 1), hand = room.hands[taker];
  hand.splice(randomIndex(hand.length + 1), 0, card);
  const laid = R.layDown(hand, SET_SIZE);
  room.hands[taker] = laid.hand; laid.ranks.forEach((rank) => room.sets.push({ id: taker, rank }));
  room.turn++; room.idle = laid.ranks.length ? 0 : (room.idle || 0) + 1;
  room.last = { [taker]: { kind: 'got', card, other: source, turn: room.turn }, [source]: { kind: 'lost', card, other: taker, turn: room.turn } };
  room.log = [...room.log, { kind: 'take', taker, source, sets: laid.ranks, turn: room.turn }].slice(-60);
  place(room, source); place(room, taker);
  advance(room, taker);
}
// Takes a random card for a player who left or ran out of time.
function tick(room) {
  let changed = false;
  for (let i = 0; i < 2000 && room.phase === 'playing'; i++) {
    const actor = room.players.find((p) => p.id === room.taker), expired = room.deadline && Date.now() > room.deadline;
    if (!actor?.departed && !expired) break;
    takeCard(room, randomIndex(room.hands[R.sourceFor(room.order, room.hands, room.taker)].length));
    changed = true;
  }
  return changed;
}
function view(room, me) {
  const lobby = room.phase === 'lobby', order = lobby || !room.order ? present(room).map((p) => p.id) : room.order;
  const hands = room.hands || {}, playing = room.phase === 'playing';
  const source = playing ? R.sourceFor(order, hands, room.taker) : null, hand = hands[me.id] || [];
  return {
    order, taker: playing ? room.taker : null, source, sourceCount: source ? hands[source].length : 0, turn: room.turn || 0,
    counts: Object.fromEntries(order.map((id) => [id, (hands[id] || []).length])),
    sets: room.sets || [], placed: room.placed || [], loser: room.loser || null, losses: room.losses || {}, log: room.log || [],
    me: { hand, last: room.last?.[me.id] || null, out: room.phase !== 'lobby' && hand.length === 0, place: (room.placed || []).indexOf(me.id) + 1 },
  };
}

const api = createRoomApi({
  ns: 'hot-joker', min: 3, max: 10,
  init(room) { room.settings = { turnSeconds: 40 }; room.losses = {}; },
  settings(room, body) { need(TURN_OPTIONS.includes(body.turnSeconds), 400, 'Choose 20, 40 or 60 seconds.'); room.settings = { ...room.settings, turnSeconds: body.turnSeconds }; },
  start,
  tick,
  actions: {
    shuffleSeats(room, me, body, { host }) {
      host(); need(['lobby', 'finished'].includes(room.phase), 409, 'Change seats before the next game.');
      room.players = shuffle(present(room));
    },
    take(room, me, body) {
      need(room.phase === 'playing', 409, 'No card can be taken now.');
      need(room.taker === me.id, 409, 'It is not your turn.');
      need(body.turn === room.turn, 409, 'That turn is already over.');
      const source = R.sourceFor(room.order, room.hands, me.id);
      need(Number.isInteger(body.index) && body.index >= 0 && body.index < room.hands[source].length, 400, 'Choose one of the cards.');
      takeCard(room, body.index);
    },
    shuffle(room, me) {
      need(room.phase === 'playing', 409, 'The game is not in progress.');
      room.hands[me.id] = shuffle(room.hands[me.id].slice());
    },
    move(room, me, body) {
      need(room.phase === 'playing', 409, 'The game is not in progress.');
      const hand = room.hands[me.id].slice(), ok = (i) => Number.isInteger(i) && i >= 0 && i < hand.length;
      need(ok(body.from) && ok(body.to), 400, 'Choose a card to move.');
      hand.splice(body.to, 0, hand.splice(body.from, 1)[0]);
      room.hands[me.id] = hand;
    },
  },
  view,
});
module.exports = api.handler;





