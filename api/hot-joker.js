const crypto = require('node:crypto');
const R = require('../lib/hot-joker-rules');
const { pace } = require('../lib/bot-pace');
const { createRoomApi, need, present, shuffle } = require('../lib/room-api');

const TURN_OPTIONS = [20, 40, 60];
const randomIndex = (n) => crypto.randomInt(n);
const setDeadline = (room) => { room.deadline = Date.now() + (room.settings.turnSeconds || 40) * 1000; };
const place = (room, id) => { if (room.hands[id].length === 0 && !room.placed.includes(id)) room.placed.push(id); };

function start(room) {
  need(room.players.length >= 3, 409, 'Last Laugh needs at least 3 players.');
  const order = room.players.map((p) => p.id), hands = R.deal(order);
  room.order = order; room.match = (room.match || 0) + 1;
  room.sets = []; room.placed = []; room.loser = null; room.last = {}; room.losses = room.losses || {};
  for (const id of order) {
    const laid = R.layDown(hands[id]);
    hands[id] = laid.hand; laid.sets.forEach((s) => room.sets.push({ id, ...s }));
  }
  room.hands = hands; room.turn = 0;
  order.forEach((id) => place(room, id));
  // Some hands are all pairs and start empty: they are already out, so the first draw goes to someone with cards.
  const holders = R.alive(order, hands);
  room.taker = holders[randomIndex(holders.length)];
  room.log = [{ kind: 'deal', taker: room.taker }];
  room.phase = 'playing'; setDeadline(room);
  if (holders.length <= 1) finish(room);
}
function finish(room) {
  room.loser = R.jokerHolder(room.order, room.hands);
  room.losses[room.loser] = (room.losses[room.loser] || 0) + 1;
  room.phase = 'finished'; room.taker = null; room.deadline = null;
}
function advance(room, from) {
  if (R.alive(room.order, room.hands).length <= 1) { finish(room); return; }
  const next = R.nextTaker(room.order, room.hands, from);
  room.taker = next; setDeadline(room);
}
function takeCard(room, index) {
  const taker = room.taker, source = R.sourceFor(room.order, room.hands, taker);
  const [card] = room.hands[source].splice(index, 1), hand = room.hands[taker];
  hand.splice(randomIndex(hand.length + 1), 0, card);
  const laid = R.layDown(hand);
  room.hands[taker] = laid.hand; laid.sets.forEach((s) => room.sets.push({ id: taker, ...s }));
  room.turn++;
  room.last = { [taker]: { kind: 'got', card, other: source, turn: room.turn }, [source]: { kind: 'lost', card, other: taker, turn: room.turn } };
  room.log = [...room.log, { kind: 'take', taker, source, sets: laid.ranks, turn: room.turn }].slice(-60);
  place(room, source); place(room, taker);
  advance(room, taker);
}
// Takes a random card for a player who left or ran out of time. Bots play after a short, human-like wait.
function botIndex(n) {
  if (n > 2 && crypto.randomInt(100) < 30) return crypto.randomInt(2) ? 0 : n - 1; // people like the end cards
  return randomIndex(n);
}
function tick(room) {
  let changed = false;
  // Upgrade saved rooms without redealing or losing cards.
  if(room.settings.setSize!==2) {
    room.settings.setSize=2;changed=true;
    room.sets=(room.sets||[]).flatMap(set=>set.cards?.length===4?[{...set,cards:set.cards.slice(0,2)},{...set,cards:set.cards.slice(2)}]:[set]);
    if(room.phase==='playing') {
      for(const id of room.order) {
        const laid=R.layDown(room.hands[id]);room.hands[id]=laid.hand;
        laid.sets.forEach(set=>room.sets.push({id,...set}));place(room,id);
        if(laid.ranks.length)room.log=[...(room.log||[]),{kind:'pairs',taker:id,sets:laid.ranks,turn:room.turn}].slice(-60);
      }
      if(R.alive(room.order,room.hands).length<=1)finish(room);
      else if(!room.hands[room.taker]?.length)advance(room,room.taker);
      room.notice='Last Laugh now uses pairs only. Your remaining cards have been kept.';
    }
  }
  for (let i = 0; i < 2000 && room.phase === 'playing'; i++) {
    const actor = room.players.find((p) => p.id === room.taker), expired = room.deadline && Date.now() > room.deadline;
    const count = room.hands[R.sourceFor(room.order, room.hands, room.taker)].length;
    if (actor?.bot && !actor.departed) {
      const wait = pace(room); changed ||= wait.changed;
      if (!wait.act) break;
      takeCard(room, botIndex(count)); changed = true; continue;
    }
    if (!actor?.departed && !expired) break;
    takeCard(room, randomIndex(count));
    changed = true;
  }
  return changed;
}
function view(room, me) {
  const lobby = room.phase === 'lobby', order = lobby || !room.order ? present(room).map((p) => p.id) : room.order;
  const hands = room.hands || {}, playing = room.phase === 'playing';
  const source = playing ? R.sourceFor(order, hands, room.taker) : null, hand = hands[me.id] || [];
  return {
    order, seatOrder: present(room).map((p) => p.id), taker: playing ? room.taker : null, source, sourceCount: source ? hands[source].length : 0, turn: room.turn || 0,
    counts: Object.fromEntries(order.map((id) => [id, (hands[id] || []).length])),
    sets: (room.sets || []).map((s) => ({ ...s, cards: s.cards || [] })), placed: room.placed || [], loser: room.loser || null, losses: room.losses || {}, log: room.log || [],
    // A player who is already safe has nothing left to protect, so they may watch everyone else's cards face up.
    reveal: playing && hand.length === 0 && !me.departed ? Object.fromEntries(order.filter((id) => hands[id]?.length).map((id) => [id, hands[id]])) : null,
    me: { hand, last: room.last?.[me.id] || null, out: room.phase !== 'lobby' && hand.length === 0, place: (room.placed || []).indexOf(me.id) + 1 },
  };
}

const api = createRoomApi({
  ns: 'hot-joker', min: 3, max: 10,
  init(room) { room.settings = { turnSeconds: 40, setSize: 2 }; room.losses = {}; },
  settings(room, body) {
    const next = { ...room.settings };
    need(body.turnSeconds !== undefined || body.setSize !== undefined, 400, 'Choose a setting.');
    if (body.turnSeconds !== undefined) { need(TURN_OPTIONS.includes(body.turnSeconds), 400, 'Choose 20, 40 or 60 seconds.'); next.turnSeconds = body.turnSeconds; }
    if (body.setSize !== undefined) { need(body.setSize===2, 400, 'Last Laugh uses pairs only.'); next.setSize = body.setSize; }
    room.settings = next;
  },
  start,
  tick,
  // the first player out of cards wins; the one left holding the Joker earns nothing
  results: (room) => (room.placed || []).map((id, i) => ({ id, place: i + 1 })),
  actions: {
    shuffleSeats(room, me, body, { host }) {
      host(); need(['lobby', 'finished'].includes(room.phase), 409, 'Change seats before the next game.');
      room.players = shuffle(present(room));
    },
    // Arrange the table: the host can seat anyone, and each player can move their own seat, before a game starts.
    moveSeat(room, me, body, { host }) {
      need(['lobby', 'finished'].includes(room.phase), 409, 'Change seats before the next game.');
      const list = present(room), from = list.findIndex((p) => p.id === body.id);
      need(from >= 0, 400, 'Choose a player at the table.');
      if (body.id !== me.id) host();
      need(Number.isInteger(body.to) && body.to >= 0 && body.to < list.length, 400, 'Choose a seat.');
      list.splice(body.to, 0, list.splice(from, 1)[0]);
      room.players = [...list, ...room.players.filter((p) => p.departed)];
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
      need(R.sourceFor(room.order, room.hands, room.taker) !== me.id, 409, 'Your cards are locked while someone is drawing from you.');
      room.hands[me.id] = shuffle(room.hands[me.id].slice());
    },
    move(room, me, body) {
      need(room.phase === 'playing', 409, 'The game is not in progress.');
      need(R.sourceFor(room.order, room.hands, room.taker) !== me.id, 409, 'Your cards are locked while someone is drawing from you.');
      const hand = room.hands[me.id].slice(), ok = (i) => Number.isInteger(i) && i >= 0 && i < hand.length;
      need(ok(body.from) && ok(body.to), 400, 'Choose a card to move.');
      hand.splice(body.to, 0, hand.splice(body.from, 1)[0]);
      room.hands[me.id] = hand;
    },
  },
  view,
});
module.exports = api.handler;










