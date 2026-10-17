// Single serverless endpoint for the whole game.
// State lives in Redis (Upstash, via Vercel Marketplace) so every serverless
// instance sees the same room. Without Redis env vars it falls back to
// in-memory storage, which is only suitable for local testing.
const crypto = require('crypto');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const TTL_SECONDS = 60 * 60 * 12;
const MAX_PLAYERS = 10;
const HAND_SIZE = 7;
const ROW_SIZES = [1, 1, 2, 3];
const SLOTS = 7; // rows of 1, 1, 2, 3

const mem = (globalThis.__rooms = globalThis.__rooms || new Map());

async function redis(cmd) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

async function loadRoom(code) {
  if (!REDIS_URL) return mem.has(code) ? JSON.parse(JSON.stringify(mem.get(code))) : null;
  const raw = await redis(['GET', `room:${code}`]);
  return raw ? JSON.parse(raw) : null;
}

class Conflict extends Error {}

// Compare-and-set on room.version so two players acting at the same moment
// can't overwrite each other's change. On conflict the request is retried.
const CAS_LUA = `
local cur = redis.call('GET', KEYS[1])
if cur then
  local o = cjson.decode(cur)
  if tonumber(o.version) ~= tonumber(ARGV[2]) then return 0 end
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
return 1`;

async function saveRoom(room) {
  const expected = room.version || 0;
  room.version = expected + 1;
  if (!REDIS_URL) return void mem.set(room.code, room);
  const ok = await redis(['EVAL', CAS_LUA, '1', `room:${room.code}`, JSON.stringify(room), String(expected), String(TTL_SECONDS)]);
  if (ok !== 1) throw new Conflict();
}

function newDeck() {
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];
  for (const s of ['S', 'H', 'D', 'C']) for (const r of ranks) deck.push(r + s);
  return deck;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c = '';
  for (let i = 0; i < 4; i++) c += letters[crypto.randomInt(letters.length)];
  return c;
}

function cleanName(n) {
  return String(n || '').trim().slice(0, 16);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}


// ---- row scoring: who loses each row, and how big the penalty is ----
const RANK_VAL = { A: 14, K: 13, Q: 12, J: 11 };
const rankOf = (c) => RANK_VAL[c.slice(0, -1)] || Number(c.slice(0, -1));   // 2 is lowest, Ace highest
const suitOf = (c) => c.slice(-1);
// Row 3 points, doubled so everything stays an integer: A = 1, J/Q/K = 0.5, others face value
const pts2 = (c) => { const r = c.slice(0, -1); return r === 'A' ? 2 : 'JQK'.includes(r) ? 1 : Number(r) * 2; };

// Row 4 hands, weakest to strongest
const HAND_ORDER = ['none', 'pair', 'straight', 'flush', 'triple', 'sflush', 'royal'];
const HAND_PENALTY = { flush: 2, triple: 3, sflush: 4, royal: 5 };   // what a strong hand adds to the losers' penalty
function handOf(cards) {
  const rs = cards.map(rankOf).sort((a, b) => a - b);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const straight = (rs[1] === rs[0] + 1 && rs[2] === rs[1] + 1) || (rs[0] === 2 && rs[1] === 3 && rs[2] === 14);   // A-2-3 and Q-K-A both count
  if (straight && flush) return rs[0] >= 10 ? 'royal' : 'sflush';   // 10-J-Q, J-Q-K or Q-K-A in one suit is a royal flush
  if (rs[0] === rs[2]) return 'triple';
  if (flush) return 'flush';
  if (straight) return 'straight';
  if (rs[0] === rs[1] || rs[1] === rs[2]) return 'pair';
  return 'none';
}

// players: [{ id, name, cards: ['AS', ...] }] -> { row, losers: [id], penalty, entries }
function evaluateRow(row, players) {
  const entries = players.map((p) => ({ id: p.id, name: p.name, cards: p.cards }));
  const pick = (vals, fn) => { const t = fn(...vals); return entries.filter((_, i) => vals[i] === t); };
  let losers, penalty = 1;
  if (row === 0) {            // lowest card loses; every Ace held by anyone doubles up the penalty
    const v = entries.map((e) => rankOf(e.cards[0]));
    entries.forEach((e, i) => (e.val = v[i]));
    losers = pick(v, Math.min);
    const aces = v.filter((x) => x === 14).length;
    if (aces) penalty = aces * 2;
  } else if (row === 1) {     // smallest card wins, so the highest card loses; every 2 doubles up the penalty
    const v = entries.map((e) => rankOf(e.cards[0]));
    entries.forEach((e, i) => (e.val = v[i]));
    losers = pick(v, Math.max);
    const twos = v.filter((x) => x === 2).length;
    if (twos) penalty = twos * 2;
  } else if (row === 2) {     // closest to 10.5: anything over loses; if nobody is over, the lowest total loses
    const v = entries.map((e) => e.cards.reduce((a, c) => a + pts2(c), 0));
    entries.forEach((e, i) => { e.total = v[i] / 2; e.bust = v[i] > 21; });
    const bust = entries.filter((e) => e.bust);
    losers = bust.length ? bust : pick(v, Math.min);
  } else {                    // pattern: only the weakest hand loses; strong hands raise the penalty
    const h = entries.map((e) => handOf(e.cards));
    entries.forEach((e, i) => (e.hand = h[i]));
    const weakest = Math.min(...h.map((x) => HAND_ORDER.indexOf(x)));
    losers = entries.filter((e, i) => HAND_ORDER.indexOf(h[i]) === weakest);
    // strong hands held by the players who did NOT lose raise the penalty (the loser's own hand never counts)
    const bonus = entries.reduce((a, e, i) => a + (losers.includes(e) ? 0 : HAND_PENALTY[h[i]] || 0), 0);
    if (bonus) penalty = bonus;
  }
  // If everybody would lose, nobody is behind anybody else: a tie, no penalty for anyone.
  const tie = losers.length === entries.length;
  return { row, losers: tie ? [] : losers.map((e) => e.id), penalty: tie ? 0 : penalty, tie, entries };
}

// Players who joined while a round was under way only watch until the next deal.
const activeOf = (room) => room.players.filter((p) => !p.spectator);

// A row is scored once everyone's cards in it are face up (and the game is under way).
function rowResults(room) {
  const players = activeOf(room);
  if (room.phase !== 'dealt' || players.length < 2 || !players.every((p) => p.ready)) return [];
  const out = [];
  let start = 0;
  ROW_SIZES.forEach((n, row) => {
    const slice = players.map((p) => p.board.slice(start, start + n));
    if (slice.every((cs) => cs.every((c) => c && c.up))) {
      out.push(evaluateRow(row, players.map((p, i) => ({ id: p.id, name: p.name, cards: slice[i].map((c) => c.c) }))));
    }
    start += n;
  });
  return out;
}

// Rows that have been scored at any point this round; lets clients announce a row only the first time.
function markScored(room) {
  const rows = rowResults(room).map((r) => r.row);
  room.scored = [...new Set([...(room.scored || []), ...rows])].sort();
}

function view(room, pid) {
  const me = room.players.find((p) => p.id === pid);
  if (!me) throw new HttpError(404, 'You are not in this room');
  return {
    code: room.code,
    version: room.version,
    phase: room.phase,
    round: room.round,
    maxPlayers: MAX_PLAYERS,
    now: Date.now(),
    allReady: room.allReady || null,
    rowResults: rowResults(room),
    scoredRows: room.scored || [],
    meId: me.id,
    isHost: room.hostId === me.id,
    hand: me.hand,
    players: room.players.map((p) => {
      const mine = p.id === me.id;
      return {
        id: p.id,
        name: p.name,
        isHost: p.id === room.hostId,
        ready: p.ready,
        spectator: !!p.spectator,
        handCount: p.hand.length,
        // Board slots are null or {c, up}. Others only see cards flipped face up.
        board: p.board.map((s) => (s && (mine || s.up) ? s : s ? { c: '?', up: false } : null)),
      };
    }),
  };
}

function slotOf(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n >= SLOTS) throw new HttpError(400, 'Bad slot');
  return n;
}

function need(cond, status, msg) {
  if (!cond) throw new HttpError(status, msg);
}

async function handle(action, b, query) {
  if (action === 'create') {
    const name = cleanName(b.name);
    need(name, 400, 'Enter a name');
    let code;
    do code = makeCode();
    while (await loadRoom(code));
    const host = { id: crypto.randomUUID(), name, hand: [], board: Array(SLOTS).fill(null), ready: false };
    const room = { code, hostId: host.id, phase: 'lobby', round: 0, players: [host], version: 0 };
    await saveRoom(room);
    return view(room, host.id);
  }

  const code = String(b.code || query.code || '').toUpperCase();
  const room = await loadRoom(code);
  need(room, 404, 'Room not found');

  if (action === 'join') {
    const name = cleanName(b.name);
    need(name, 400, 'Enter a name');
    need(room.players.length < MAX_PLAYERS, 409, `Room is full (${MAX_PLAYERS} players)`);
    need(!room.players.some((p) => p.name.toLowerCase() === name.toLowerCase()), 409, 'Name already taken');
    const p = { id: crypto.randomUUID(), name, hand: [], board: Array(SLOTS).fill(null), ready: false };
    if (room.phase === 'dealt') {
      if (activeOf(room).every((q) => q.ready)) {
        // Game in progress (everyone is ready): watch this round, get dealt in at the next one.
        p.spectator = true;
      } else {
        // Still arranging: deal 7 cards from what's left (top up with a fresh deck if short).
        if (!room.deck || room.deck.length < HAND_SIZE) room.deck = shuffle((room.deck || []).concat(newDeck()));
        p.hand = room.deck.splice(0, HAND_SIZE);
        room.allReady = null;
      }
    }
    room.players.push(p);
    await saveRoom(room);
    return view(room, p.id);
  }

  const pid = String(b.pid || query.pid || '');
  const me = room.players.find((p) => p.id === pid);
  need(me, 404, 'You are not in this room');
  const PLAYER_ACTIONS = ['place', 'move', 'unplace', 'flip', 'flipRow', 'flipRowUp', 'flipRowAll', 'ready'];
  need(!(me.spectator && PLAYER_ACTIONS.includes(action)), 409, 'Wait for the next round');
  const active = activeOf(room);

  switch (action) {
    case 'state':
      return view(room, pid);

    case 'deal': {
      need(room.hostId === pid, 403, 'Only the host can do that');
      // One deck covers up to 7 players (49 cards); more players add extra decks.
      const decks = Math.ceil((room.players.length * HAND_SIZE) / 52);
      const deck = shuffle(Array.from({ length: decks }, newDeck).flat());
      for (const p of room.players) {
        p.spectator = false;
        p.hand = deck.splice(0, HAND_SIZE);
        p.board = Array(SLOTS).fill(null);
        p.ready = false;
      }
      room.deck = deck; // leftovers, for players who join mid-round
      room.scored = [];
      room.phase = 'dealt';
      room.allReady = null;
      room.round += 1;
      break;
    }

    case 'place': {
      // hand -> slot; if the slot is occupied the occupant returns to the hand
      need(room.phase === 'dealt', 409, 'No cards dealt');
      need(!me.ready, 409, 'Unready to move cards');
      const slot = slotOf(b.slot);
      const i = me.hand.indexOf(b.card);
      need(i >= 0, 400, 'Card not in your hand');
      me.hand.splice(i, 1);
      if (me.board[slot]) me.hand.push(me.board[slot].c);
      me.board[slot] = { c: b.card, up: false };
      break;
    }

    case 'move': {
      // slot -> slot (swap if occupied) keeping each card's flip state
      need(room.phase === 'dealt', 409, 'No cards dealt');
      need(!me.ready, 409, 'Unready to move cards');
      const from = slotOf(b.from), to = slotOf(b.to);
      need(me.board[from], 400, 'Nothing there');
      [me.board[from], me.board[to]] = [me.board[to], me.board[from]];
      break;
    }

    case 'unplace': {
      need(room.phase === 'dealt', 409, 'No cards dealt');
      need(!me.ready, 409, 'Unready to move cards');
      const slot = slotOf(b.slot);
      need(me.board[slot], 400, 'Nothing there');
      me.hand.push(me.board[slot].c);
      me.board[slot] = null;
      break;
    }

    case 'flip': {
      need(room.phase === 'dealt', 409, 'No cards dealt');
      const slot = slotOf(b.slot);
      need(me.board[slot], 400, 'Nothing there');
      me.board[slot].up = !me.board[slot].up;
      break;
    }

    case 'flipRowUp': // kept for older clients
    case 'flipRow': {
      need(room.phase === 'dealt', 409, 'No cards dealt');
      need(active.every((p) => p.ready), 409, 'Wait until everyone is ready');
      const row = Number(b.row);
      need(Number.isInteger(row) && row >= 0 && row < ROW_SIZES.length, 400, 'Bad row');
      const start = ROW_SIZES.slice(0, row).reduce((a, n) => a + n, 0);
      const up = action === 'flipRowUp' ? true : !!b.up;
      for (let i = start; i < start + ROW_SIZES[row]; i++) if (me.board[i]) me.board[i].up = up;
      break;
    }

    case 'flipRowAll': {
      // Host reveals (or hides) one row for every player at once.
      need(room.hostId === pid, 403, 'Only the host can do that');
      need(room.phase === 'dealt', 409, 'No cards dealt');
      need(active.every((p) => p.ready), 409, 'Wait until everyone is ready');
      const row = Number(b.row);
      need(Number.isInteger(row) && row >= 0 && row < ROW_SIZES.length, 400, 'Bad row');
      const start = ROW_SIZES.slice(0, row).reduce((a, n) => a + n, 0);
      for (const pl of active) {
        for (let i = start; i < start + ROW_SIZES[row]; i++) if (pl.board[i]) pl.board[i].up = !!b.up;
      }
      break;
    }

    case 'ready':
      // Ready hides every face (for you too) and freezes your cards until you unready.
      need(room.phase === 'dealt', 409, 'No cards dealt');
      // Once everyone is ready the round is under way: no taking it back until a new deal.
      need(b.ready || !active.every((p) => p.ready), 409, 'Game in progress');
      me.ready = !!b.ready;
      if (me.ready) {
        need(me.board.every(Boolean), 409, 'Place all 7 cards in the rows first');
        for (const c of me.board) c.up = false;
      }
      // When the last player becomes ready, remember who it was so everyone can see.
      room.allReady = me.ready && active.length > 1 && active.every((p) => p.ready)
        ? { id: me.id, name: me.name, at: Date.now() }
        : null;
      break;

    case 'leave': {
      room.players = room.players.filter((p) => p.id !== pid);
      if (!room.players.length) {
        if (!REDIS_URL) mem.delete(code);
        else await redis(['DEL', `room:${code}`]);
        return { left: true };
      }
      if (room.hostId === pid) room.hostId = (room.players.find((p) => !p.spectator) || room.players[0]).id;
      room.allReady = null;
      markScored(room);
      await saveRoom(room);
      return { left: true };
    }

    default:
      throw new HttpError(400, 'Unknown action');
  }
  markScored(room);
  await saveRoom(room);
  return view(room, pid);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const query = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    let body = req.body;
    if (typeof body === 'string') body = body ? JSON.parse(body) : {};
    body = body || {};
    const action = req.method === 'GET' ? 'state' : body.action;
    let result;
    for (let attempt = 0; ; attempt++) {
      try {
        result = await handle(action, body, query);
        break;
      } catch (e) {
        if (!(e instanceof Conflict) || attempt >= 8) throw e;
      }
    }
    res.status(200).json(result);
  } catch (e) {
    const status = e instanceof Conflict ? 503 : e.status || 500;
    if (status === 500) console.error(e);
    res.status(status).json({ error: status === 500 ? 'Server error' : status === 503 ? 'Busy, try again' : e.message });
  }
};

module.exports.evaluateRow = evaluateRow;
module.exports.handOf = handOf;
