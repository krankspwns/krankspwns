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
  if (!REDIS_URL) return mem.get(code) || null;
  const raw = await redis(['GET', `room:${code}`]);
  return raw ? JSON.parse(raw) : null;
}

async function saveRoom(room) {
  room.version = (room.version || 0) + 1;
  if (!REDIS_URL) return void mem.set(room.code, room);
  await redis(['SET', `room:${room.code}`, JSON.stringify(room), 'EX', TTL_SECONDS]);
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
      const visible = p.id === me.id || p.locked;
      return {
        id: p.id,
        name: p.name,
        isHost: p.id === room.hostId,
        locked: p.locked,
        handCount: p.hand.length,
        // Others' boards are face-down until that player locks in.
        board: visible ? p.board : p.board.map((c) => (c ? '?' : null)),
      };
    }),
  };
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
    const host = { id: crypto.randomUUID(), name, hand: [], board: Array(SLOTS).fill(null), locked: false };
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
    const p = { id: crypto.randomUUID(), name, hand: [], board: Array(SLOTS).fill(null), locked: false };
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
        p.locked = false;
      }
      room.phase = 'dealt';
      room.round += 1;
      break;
    }

    case 'place': {
      need(room.phase === 'dealt' && !me.locked, 409, 'Cannot move cards now');
      const slot = Number(b.slot);
      need(Number.isInteger(slot) && slot >= 0 && slot < SLOTS, 400, 'Bad slot');
      need(me.board[slot] === null, 409, 'Slot occupied');
      const i = me.hand.indexOf(b.card);
      need(i >= 0, 400, 'Card not in your hand');
      me.hand.splice(i, 1);
      me.board[slot] = b.card;
      break;
    }

    case 'unplace': {
      need(room.phase === 'dealt' && !me.locked, 409, 'Cannot move cards now');
      const slot = Number(b.slot);
      need(Number.isInteger(slot) && slot >= 0 && slot < SLOTS && me.board[slot], 400, 'Nothing there');
      me.hand.push(me.board[slot]);
      me.board[slot] = null;
      break;
    }

    case 'lock':
      need(room.phase === 'dealt', 409, 'No cards dealt');
      me.locked = !!b.locked;
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
    res.status(200).json(await handle(action, body, query));
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    res.status(status).json({ error: status === 500 ? 'Server error' : e.message });
  }
};
