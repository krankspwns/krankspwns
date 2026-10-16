// Single serverless endpoint for the whole game.
// State lives in Redis (Upstash, via Vercel Marketplace) so every serverless
// instance sees the same room. Without Redis env vars it falls back to
// in-memory storage, which is only suitable for local testing.
const crypto = require('crypto');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const TTL_SECONDS = 60 * 60 * 12;
const MAX_PLAYERS = 5;
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

function view(room, pid) {
  const me = room.players.find((p) => p.id === pid);
  if (!me) throw new HttpError(404, 'You are not in this room');
  return {
    code: room.code,
    version: room.version,
    phase: room.phase,
    round: room.round,
    meId: me.id,
    isHost: room.hostId === me.id,
    hand: me.hand,
    players: room.players.map((p) => {
      const mine = p.id === me.id;
      return {
        id: p.id,
        name: p.name,
        isHost: p.id === room.hostId,
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
    const host = { id: crypto.randomUUID(), name, hand: [], board: Array(SLOTS).fill(null) };
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
    need(room.phase === 'lobby', 409, 'Game already started — ask the host to reset to a lobby');
    need(room.players.length < MAX_PLAYERS, 409, `Room is full (${MAX_PLAYERS} players)`);
    need(!room.players.some((p) => p.name.toLowerCase() === name.toLowerCase()), 409, 'Name already taken');
    const p = { id: crypto.randomUUID(), name, hand: [], board: Array(SLOTS).fill(null) };
    room.players.push(p);
    await saveRoom(room);
    return view(room, p.id);
  }

  const pid = String(b.pid || query.pid || '');
  const me = room.players.find((p) => p.id === pid);
  need(me, 404, 'You are not in this room');

  switch (action) {
    case 'state':
      return view(room, pid);

    case 'deal': {
      need(room.hostId === pid, 403, 'Only the host can deal');
      const deck = shuffle(newDeck());
      for (const p of room.players) {
        p.hand = deck.splice(0, HAND_SIZE);
        p.board = Array(SLOTS).fill(null);
      }
      room.phase = 'dealt';
      room.round += 1;
      break;
    }

    case 'place': {
      // hand -> slot; if the slot is occupied the occupant returns to the hand
      need(room.phase === 'dealt', 409, 'No cards dealt');
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
      const from = slotOf(b.from), to = slotOf(b.to);
      need(me.board[from], 400, 'Nothing there');
      [me.board[from], me.board[to]] = [me.board[to], me.board[from]];
      break;
    }

    case 'unplace': {
      need(room.phase === 'dealt', 409, 'No cards dealt');
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

    case 'flipRowUp': {
      need(room.phase === 'dealt', 409, 'No cards dealt');
      const row = Number(b.row);
      need(Number.isInteger(row) && row >= 0 && row < ROW_SIZES.length, 400, 'Bad row');
      const start = ROW_SIZES.slice(0, row).reduce((a, n) => a + n, 0);
      for (let i = start; i < start + ROW_SIZES[row]; i++) if (me.board[i]) me.board[i].up = true;
      break;
    }

    case 'flipAllDown':
      need(room.phase === 'dealt', 409, 'No cards dealt');
      for (const s of me.board) if (s) s.up = false;
      break;

    case 'leave': {
      room.players = room.players.filter((p) => p.id !== pid);
      if (!room.players.length) {
        if (!REDIS_URL) mem.delete(code);
        else await redis(['DEL', `room:${code}`]);
        return { left: true };
      }
      if (room.hostId === pid) room.hostId = room.players[0].id;
      await saveRoom(room);
      return { left: true };
    }

    default:
      throw new HttpError(400, 'Unknown action');
  }
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
