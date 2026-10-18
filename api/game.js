// Single serverless endpoint for the whole game.
// State lives in Redis (Upstash, via Vercel Marketplace) so every serverless
// instance sees the same room. Without Redis env vars it falls back to
// in-memory storage, which is only suitable for local testing.
const crypto = require('crypto');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const TTL_SECONDS = 60 * 60 * 12;
const AVATARS = ['cat', 'dog', 'fox', 'bear', 'panda', 'rabbit', 'frog', 'lion', 'pig', 'koala', 'owl', 'tiger'];
// a chosen animal is kept (friends may pick the same one); with no choice the player gets a random animal nobody has yet
function pickAvatar(want, taken = []) {
  if (AVATARS.includes(want)) return want;
  const free = AVATARS.filter((a) => !taken.includes(a));
  const pool = free.length ? free : AVATARS;
  return pool[crypto.randomInt(pool.length)];
}
// avatar accessories are unlocked by winning rounds in this room (lowest total penalty)
const ACC_WINS = { hat: 1, shades: 2, crown: 3, halo: 5 };
const EMOTES = ['laugh', 'wow', 'cry', 'cool', 'fire', 'gg', 'ez', 'gl', 'wp', 'rip', 'angry', 'think', 'heart', 'trophy'];
const MAX_PLAYERS = 15;
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

// Many phones poll the same room: share one Redis read between polls that land on the same server within a moment.
const roomCache = (globalThis.__roomCache = globalThis.__roomCache || new Map());
async function loadRoomCached(code, maxAge = 350) {
  const c = roomCache.get(code);
  if (c && Date.now() - c.at < maxAge) return JSON.parse(c.json);
  const room = await loadRoom(code);
  if (room) roomCache.set(code, { at: Date.now(), json: JSON.stringify(room) });
  return room;
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
  roomCache.delete(room.code);
  if (!REDIS_URL) return void mem.set(room.code, room);
  const ok = await redis(['EVAL', CAS_LUA, '1', `room:${room.code}`, JSON.stringify(room), String(expected), String(TTL_SECONDS)]);
  if (ok !== 1) throw new Conflict();
}

// host-controlled game settings
const TIMERS = [0, 30, 45, 60, 90, 120];   // seconds to arrange; 0 = no timer
const MULTS = [1, 2, 3];
const settingsOf = (room) => ({ timer: 0, jokers: true, mult: 1, ...(room.settings || {}) });

function newDeck(joker = true) {
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];
  for (const s of ['S', 'H', 'D', 'C']) for (const r of ranks) deck.push(r + s);
  if (joker) deck.push('JK');   // one joker per deck: a wild card that becomes whatever is best for its row
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

const NAME_MAX = 12;   // characters (an emoji or a Chinese character counts as one)
function cleanName(n) {
  const clean = String(n || '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(clean).slice(0, NAME_MAX).join('').trim();
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

// ---- jokers: each one turns into the best card for the row it sits in ----
const isJoker = (c) => c === 'JK';
const ALL_CARDS = ['S', 'H', 'D', 'C'].flatMap((s) => ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map((r) => r + s));
const ROW3_CARDS = ['JS', 'AS', '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', '10S'];   // every value a joker can be worth in row 3 (0.5, 1, 2 ... 10)

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

// Row 1 -> Ace, row 2 -> 2 (lowest wins), row 3 -> the value that gets closest to 10.5 without going over,
// row 4 -> whichever card makes the strongest hand. Returns the cards with every joker replaced.
function resolveJokers(row, cards) {
  const at = cards.map((c, i) => (isJoker(c) ? i : -1)).filter((i) => i >= 0);
  if (!at.length) return cards;
  const cands = row === 0 ? ['AS'] : row === 1 ? ['2S'] : row === 2 ? ROW3_CARDS : ALL_CARDS;
  const work = cards.slice();
  let best = null, bestScore = -Infinity;
  const score = () => {
    if (row === 2) { const t = work.reduce((a, c) => a + pts2(c), 0); return t <= 21 ? t : -t; }
    if (row === 3) return HAND_ORDER.indexOf(handOf(work));
    return 0;
  };
  const rec = (k) => {
    if (k === at.length) { const sc = score(); if (sc > bestScore) { bestScore = sc; best = work.slice(); } return; }
    for (const c of cands) { work[at[k]] = c; rec(k + 1); }
  };
  rec(0);
  return best;
}

// players: [{ id, name, cards: ['AS', ...] }] -> { row, losers: [id], penalty, entries }
function evaluateRow(row, players) {
  const effs = players.map((p) => resolveJokers(row, p.cards));
  const entries = players.map((p, i) => ({ id: p.id, name: p.name, cards: p.cards, ...(effs[i] !== p.cards ? { as: effs[i] } : {}) }));
  const pick = (vals, fn) => { const t = fn(...vals); return entries.filter((_, i) => vals[i] === t); };
  let losers, penalty = 1;
  if (row === 0) {            // lowest card loses; every Ace held by anyone doubles up the penalty
    const v = effs.map((cs) => rankOf(cs[0]));
    entries.forEach((e, i) => (e.val = v[i]));
    losers = pick(v, Math.min);
    const aces = v.filter((x) => x === 14).length;
    if (aces) penalty = aces * 2;
  } else if (row === 1) {     // smallest card wins, so the highest card loses; every 2 doubles up the penalty
    const v = effs.map((cs) => rankOf(cs[0]));
    entries.forEach((e, i) => (e.val = v[i]));
    losers = pick(v, Math.max);
    const twos = v.filter((x) => x === 2).length;
    if (twos) penalty = twos * 2;
  } else if (row === 2) {     // closest to 10.5: anything over loses; if nobody is over, the lowest total loses
    const v = effs.map((cs) => cs.reduce((a, c) => a + pts2(c), 0));
    entries.forEach((e, i) => { e.total = v[i] / 2; e.bust = v[i] > 21; });
    const bust = entries.filter((e) => e.bust);
    losers = bust.length ? bust : pick(v, Math.min);
    const perfect = entries.filter((e) => e.total === 10.5).length;   // every exact 10.5 doubles up the penalty, like Aces in row 1
    if (perfect) penalty = perfect * 2;
  } else {                    // pattern: only the weakest hand loses; strong hands raise the penalty
    const h = effs.map((cs) => handOf(cs));
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

// When the 4th row is scored the round is over: the player(s) with the lowest total penalty earn a win (a shared round with no loser earns none).
function tallyWins(room) {
  if (!ROW_SIZES.every((_, i) => room.results[i]) || room.tallied === room.round) return;
  room.tallied = room.round;
  const act = activeOf(room);
  const tot = Object.fromEntries(act.map((p) => [p.id, 0]));
  for (const r of Object.values(room.results)) if (!r.tie) for (const id of r.losers) if (id in tot) tot[id] += r.penalty;
  const vals = Object.values(tot);
  if (!vals.length || Math.max(...vals) === Math.min(...vals)) return;
  const best = Math.min(...vals);
  room.wins = room.wins || {};
  for (const p of act) if (tot[p.id] === best) {
    const w = (room.wins[p.id] = (room.wins[p.id] || 0) + 1);
    const unlocked = Object.entries(ACC_WINS).find(([, need]) => need === w);
    if (unlocked) p.acc = unlocked[0];   // a new accessory is worn straight away
  }
}

// Results are kept for the whole round once a row has been scored, even if the cards are turned back over.
function storeResults(room) {
  room.results = room.results || {};
  for (const r of rowResults(room)) if (!room.results[r.row]) room.results[r.row] = { ...r, penalty: r.penalty * settingsOf(room).mult, at: Date.now() };
  tallyWins(room);   // `at` lets every phone advance to the next row at the same moment
}
// When the arranging time runs out, anyone who is not ready gets their cards placed in order and is marked ready.
function enforceTimer(room) {
  if (room.phase !== 'dealt' || !room.deadline || Date.now() < room.deadline) return false;
  room.deadline = null;
  const active = activeOf(room);
  let last = null;
  for (const p of active) {
    if (p.ready) continue;
    for (let i = 0; i < p.board.length && p.hand.length; i++) if (!p.board[i]) p.board[i] = { c: p.hand.shift(), up: false };
    if (p.board.every(Boolean)) { for (const c of p.board) c.up = false; p.ready = true; last = p; }
  }
  if (last && active.length > 1 && active.every((p) => p.ready)) room.allReady = { id: last.id, name: last.name, at: Date.now(), timer: true };
  return true;
}

// The game goes top to bottom: the current row is the first one that has not been scored yet (4 = all done).
function currentRowOf(room) {
  for (let r = 0; r < ROW_SIZES.length; r++) if (!(room.results && room.results[r])) return r;
  return ROW_SIZES.length;
}
const rowOfSlot = (slot) => { let acc = 0; for (let r = 0; r < ROW_SIZES.length; r++) { acc += ROW_SIZES[r]; if (slot < acc) return r; } return ROW_SIZES.length; };

// ---- presence: when each player's browser last checked in (kept apart from the room, so it never changes the room version) ----
const seenMem = (globalThis.__seen = globalThis.__seen || new Map());          // code -> { pid: timestamp } (local testing only)
const seenThrottle = (globalThis.__seenW = globalThis.__seenW || new Map());   // 'code:pid' -> last write; keeps Redis traffic low
const PRESENCE_LUA = "redis.call('HSET', KEYS[1], ARGV[1], ARGV[2]) redis.call('EXPIRE', KEYS[1], ARGV[3]) return 1";
async function touchPresence(code, pid) {
  const k = code + ':' + pid, now = Date.now();
  if (now - (seenThrottle.get(k) || 0) < 20000) return;
  seenThrottle.set(k, now);
  if (!REDIS_URL) { const m = seenMem.get(code) || {}; m[pid] = now; seenMem.set(code, m); return; }
  try { await redis(['EVAL', PRESENCE_LUA, '1', `seen:${code}`, pid, String(now), String(TTL_SECONDS)]); } catch {}
}
async function readPresence(code) {
  if (!REDIS_URL) return seenMem.get(code) || {};
  try {
    const flat = await redis(['HGETALL', `seen:${code}`]);
    const o = {};
    for (let i = 0; i + 1 < flat.length; i += 2) o[flat[i]] = Number(flat[i + 1]);
    return o;
  } catch { return {}; }
}
const OFFLINE_AFTER_MS = 45000;
// only the host gets the presence info (it is what the kick button is for)
async function viewFor(room, pid) {
  const seen = room.hostId === pid ? await readPresence(room.code) : null;
  return view(room, pid, seen);
}

function view(room, pid, seen) {
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
    settings: settingsOf(room),
    emotes: (room.emotes || []).filter((x) => Date.now() - x.at < 8000),
    emoteN: room.emoteN || 0,
    deadline: room.deadline || null,
    rowResults: Object.values(room.results || {}).sort((a, b) => a.row - b.row),
    currentRow: currentRowOf(room),
    meId: me.id,
    isHost: room.hostId === me.id,
    hand: me.hand,
    players: room.players.map((p) => {
      const mine = p.id === me.id;
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar || AVATARS[0],
        acc: p.acc || '',
        wins: (room.wins && room.wins[p.id]) || 0,
        isHost: p.id === room.hostId,
        ready: p.ready,
        spectator: !!p.spectator,
        ...(seen ? (() => { const ts = seen[p.id]; const ago = ts ? Date.now() - ts : null; return { online: p.id === room.hostId || (ago !== null && ago < OFFLINE_AFTER_MS), seenAgo: ago === null ? null : Math.round(ago / 1000) }; })() : {}),
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
    const host = { id: crypto.randomUUID(), name, avatar: pickAvatar(b.avatar), hand: [], board: Array(SLOTS).fill(null), ready: false };
    const room = { code, hostId: host.id, phase: 'lobby', round: 0, players: [host], version: 0 };
    await saveRoom(room);
    await touchPresence(code, host.id);
    return viewFor(room, host.id);
  }

  const code = String(b.code || query.code || '').toUpperCase();
  let room = action === 'state' ? await loadRoomCached(code) : await loadRoom(code);
  need(room, 404, 'Room not found');
  if (room.deadline && Date.now() >= room.deadline && room.phase === 'dealt') {   // time is up: arrange the stragglers' cards
    if (action === 'state') room = await loadRoom(code);
    if (room && enforceTimer(room)) { storeResults(room); await saveRoom(room); }
    need(room, 404, 'Room not found');
  }

  if (action === 'join') {
    const name = cleanName(b.name);
    need(name, 400, 'Enter a name');
    need(room.players.length < MAX_PLAYERS, 409, `Room is full (${MAX_PLAYERS} players)`);
    // same name as someone who has gone quiet = that player coming back (lost phone data, new browser): hand their seat back
    const same = room.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (same) {
      const ts = (await readPresence(code))[same.id];
      need(!ts || Date.now() - ts > 20000, 409, 'Name already taken');
      seenThrottle.delete(code + ':' + same.id);
      await touchPresence(code, same.id);
      return viewFor(room, same.id);
    }
    const p = { id: crypto.randomUUID(), name, avatar: pickAvatar(b.avatar, room.players.map((q) => q.avatar)), hand: [], board: Array(SLOTS).fill(null), ready: false };
    if (room.phase === 'dealt') {
      if (activeOf(room).every((q) => q.ready)) {
        // Game in progress (everyone is ready): watch this round, get dealt in at the next one.
        p.spectator = true;
      } else {
        // Still arranging: deal 7 cards from what's left (top up with a fresh deck if short).
        if (!room.deck || room.deck.length < HAND_SIZE) room.deck = shuffle((room.deck || []).concat(newDeck(settingsOf(room).jokers)));
        p.hand = room.deck.splice(0, HAND_SIZE);
        room.allReady = null;
      }
    }
    room.players.push(p);
    await saveRoom(room);
    await touchPresence(code, p.id);
    return viewFor(room, p.id);
  }

  const pid = String(b.pid || query.pid || '');
  const me = room.players.find((p) => p.id === pid);
  need(me, 404, 'You are not in this room');
  await touchPresence(code, pid);
  const PLAYER_ACTIONS = ['place', 'move', 'unplace', 'flip', 'flipRow', 'flipRowUp', 'flipRowAll', 'ready'];
  need(!(me.spectator && PLAYER_ACTIONS.includes(action)), 409, 'Wait for the next round');
  const active = activeOf(room);

  switch (action) {
    case 'state':
      // nothing new for a non-host: a tiny reply keeps slow connections quick
      if (query.v && Number(query.v) === room.version && room.hostId !== pid) return { same: true, version: room.version, now: Date.now() };
      return viewFor(room, pid);

    case 'deal': {
      need(room.hostId === pid, 403, 'Only the host can do that');
      // One deck covers up to 7 players (49 cards); more players add extra decks.
      const decks = Math.ceil((room.players.length * HAND_SIZE) / 52);
      const set = settingsOf(room);
      const deck = shuffle(Array.from({ length: decks }, () => newDeck(set.jokers)).flat());
      for (const p of room.players) {
        p.spectator = false;
        p.hand = deck.splice(0, HAND_SIZE);
        p.board = Array(SLOTS).fill(null);
        p.ready = false;
      }
      room.deck = deck; // leftovers, for players who join mid-round
      room.results = {};
      room.deadline = set.timer ? Date.now() + set.timer * 1000 : null;
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
      need(rowOfSlot(slot) <= currentRowOf(room), 409, 'Not this row yet');
      me.board[slot].up = !me.board[slot].up;
      break;
    }

    case 'flipRowUp': // kept for older clients
    case 'flipRow': {
      need(room.phase === 'dealt', 409, 'No cards dealt');
      need(active.every((p) => p.ready), 409, 'Wait until everyone is ready');
      const row = Number(b.row);
      need(Number.isInteger(row) && row >= 0 && row < ROW_SIZES.length, 400, 'Bad row');
      need(row <= currentRowOf(room), 409, 'Not this row yet');
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
      need(row <= currentRowOf(room), 409, 'Not this row yet');
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
      if (room.allReady) room.deadline = null;
      break;

    case 'settings': {
      need(room.hostId === pid, 403, 'Only the host can do that');
      const cur = settingsOf(room);
      const next = { ...cur };
      if (b.timer !== undefined) { need(TIMERS.includes(Number(b.timer)), 400, 'Pick a time from the list'); next.timer = Number(b.timer); }
      if (b.jokers !== undefined) next.jokers = !!b.jokers;
      if (b.mult !== undefined) { need(MULTS.includes(Number(b.mult)), 400, 'Pick a multiplier from the list'); next.mult = Number(b.mult); }
      room.settings = next;
      break;
    }

    case 'emote': {
      need(EMOTES.includes(b.e), 400, 'Unknown reaction');
      const now = Date.now();
      room.emoteN = (room.emoteN || 0) + 1;
      const recent = (room.emotes || []).filter((x) => now - x.at < 8000);
      // one reaction per player per second, so nobody can flood the table
      if (recent.some((x) => x.id === pid && now - x.at < 900)) return viewFor(room, pid);
      recent.push({ id: pid, e: b.e, at: now, n: room.emoteN });
      room.emotes = recent.slice(-12);
      break;
    }

    case 'avatar':
      if (b.avatar !== undefined) { need(AVATARS.includes(b.avatar), 400, 'Pick an animal from the list'); me.avatar = b.avatar; }
      if (b.acc !== undefined) {
        need(b.acc === '' || (ACC_WINS[b.acc] && ((room.wins && room.wins[pid]) || 0) >= ACC_WINS[b.acc]), 403, 'Win more rounds to unlock that');
        me.acc = b.acc;
      }
      break;

    case 'kick': {
      // The host removes a player (for example someone who lost their connection and can't get back in).
      need(room.hostId === pid, 403, 'Only the host can do that');
      const target = room.players.find((q) => q.id === String(b.target));
      need(target, 404, 'Player not found');
      need(target.id !== pid, 400, 'You can’t remove yourself');
      room.players = room.players.filter((q) => q.id !== target.id);
      room.allReady = null;
      seenMem.get(code) && delete seenMem.get(code)[target.id];
      break;
    }

    case 'leave': {
      room.players = room.players.filter((p) => p.id !== pid);
      if (!room.players.length) {
        if (!REDIS_URL) mem.delete(code);
        else await redis(['DEL', `room:${code}`]);
        return { left: true };
      }
      if (room.hostId === pid) room.hostId = (room.players.find((p) => !p.spectator) || room.players[0]).id;
      room.allReady = null;
      storeResults(room);
      await saveRoom(room);
      return { left: true };
    }

    default:
      throw new HttpError(400, 'Unknown action');
  }
  storeResults(room);
  await saveRoom(room);
  return viewFor(room, pid);
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
module.exports.cleanName = cleanName;
module.exports.enforceTimer = enforceTimer;
