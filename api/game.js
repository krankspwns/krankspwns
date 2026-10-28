// Single serverless endpoint for the whole game.
// State lives in Redis (Upstash, via Vercel Marketplace) so every serverless
// instance sees the same room. Without Redis env vars it falls back to
// in-memory storage, which is only suitable for local testing.
const crypto = require('crypto');
const P = require('../lib/platform');
const { AVATARS, ACC_PRICE, PREMIUM, GIFTS, BORDER_PRICE, EMOTES, GIFT_USES, START_WP, placeWpFor, predWpFor } = require('../lib/catalog');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const TTL_SECONDS = 60 * 60 * 12;
// a chosen animal is kept (friends may pick the same one); with no choice the player gets a random animal nobody has yet
function pickAvatar(want, taken = []) {
  if (AVATARS.includes(want)) return want;
  const free = AVATARS.filter((a) => !taken.includes(a));
  const pool = free.length ? free : AVATARS;
  return pool[crypto.randomInt(pool.length)];
}
// ---- the shop: every round won earns win points; points are spent on accessories, special avatars and throwable gifts ----
// Spending lowers the points, never the win count. Everything lives with the player inside the room.
const WP_PER_WIN = 10;   // what a round win was worth before the rewards scaled with the table (rooms older than wpv 2 still count it)
// the top three of a round earn WP, more at a bigger table: 1st gets 10 at up to 3 players and 5 more for every 3 players after that
// (4-6: 15 / 10 / 5, 7-9: 20 / 15 / 10, 10-12: 25 / 20 / 15); 2nd and 3rd get 5 and 10 less
// the tester (a player called Benny) gets 1000 WP to try the shop, and may throw gifts at themselves
// a player called Benny gets the test points; set the TESTER_NAME environment variable to another name, or to "off", to change or disable it
const testerEnv = process.env.TESTER_NAME === undefined ? 'benny' : String(process.env.TESTER_NAME).trim().toLowerCase();
const TESTER_NAME = testerEnv === 'off' ? '' : testerEnv, TESTER_WP = 1000;
const isTester = (p) => !!TESTER_NAME && !!p && String(p.name || '').trim().toLowerCase() === TESTER_NAME;
const PRED_PENALTY = 1;   // points lost for a wrong call (the guessing time is a room setting)
const startWp = () => (globalThis.__startWp ?? START_WP);   // the tests of the shop start from zero
const netOf = (room, pid) => (room.wpv === 2 ? 0 : ((room.wins && room.wins[pid]) || 0) * WP_PER_WIN) + ((room.bonus && room.bonus[pid]) || 0) - ((room.spent && room.spent[pid]) || 0);
const acctOf = (room, pid) => (room.acct && room.acct[pid]) || null;   // the account id behind a seat, never sent to players
const legacyBalanceOf = (room, pid) => startWp() + (isTester(room.players.find((q) => q.id === pid)) ? TESTER_WP : 0) + (room.wpv === 2 ? 0 : ((room.wins && room.wins[pid]) || 0) * WP_PER_WIN) + ((room.bonus && room.bonus[pid]) || 0) - ((room.spent && room.spent[pid]) || 0);
const balanceOf = (room, pid) => (acctOf(room, pid) && room.snap && room.snap[pid] !== undefined ? room.snap[pid] + netOf(room, pid) - ((room.sync && room.sync[pid]) || 0) : legacyBalanceOf(room, pid));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const inventoryOf = (p) => { p.owned = p.owned || { acc: [], av: [], bd: [] }; p.owned.bd = p.owned.bd || []; p.gifts = p.gifts || {}; return p; };
const MAX_PLAYERS = 12;
const HAND_SIZE = 7;
const ROW_SIZES = [1, 1, 2, 3];
const SLOTS = 7; // rows of 1, 1, 2, 3

// ---- realtime push (optional): Ably tells every phone "room X is now at version N", so phones fetch only when something changed ----
// Set ABLY_API_KEY (appId.keyId:secret) to switch it on; without it everything keeps polling as before.
const ABLY_KEY = process.env.ABLY_API_KEY || '';
const ABLY_REST = process.env.ABLY_REST_HOST || 'https://rest.ably.io';
const ABLY_RT = process.env.ABLY_RT_HOST || 'https://realtime.ably.io';
const RT_TTL = 60 * 60 * 2;
const rtChannel = (code) => 'room-' + code;
// the announcement is just the version, plus any gift or reaction from the last few seconds so everyone can play it without waiting for a fetch
function rtData(room) {
  const now = Date.now();
  const g = (room.gifts || []).filter((x) => now - x.at < 3000);
  return g.length ? JSON.stringify({ v: room.version, g }) : String(room.version);
}
// let the response go out first and finish the push afterwards (Vercel keeps the function alive for waitUntil); elsewhere just wait for it
function background(promise) {
  try {
    const ctx = globalThis[Symbol.for('@vercel/request-context')];
    const wu = ctx && ctx.get && ctx.get() && ctx.get().waitUntil;
    if (wu) { wu(promise); return; }
  } catch {}
  return promise;
}
async function rtPublish(room) {
  if (!ABLY_KEY) return;
  try {
    await fetch(`${ABLY_REST}/channels/${rtChannel(room.code)}/messages`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(ABLY_KEY).toString('base64'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'v', data: rtData(room) }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {}   // a missed push is covered by the slow fallback poll
}
// a subscribe-only token for one room, signed as a JWT so no extra round trip to Ably is needed
function rtUrl(code) {
  if (!ABLY_KEY) return null;
  const [keyName, secret] = ABLY_KEY.split(':');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const head = b64({ typ: 'JWT', alg: 'HS256', kid: keyName });
  const body = b64({ iat, exp: iat + RT_TTL, 'x-ably-capability': JSON.stringify({ [rtChannel(code)]: ['subscribe'] }) });
  const sig = crypto.createHmac('sha256', secret).update(head + '.' + body).digest('base64url');
  return { url: `${ABLY_RT}/event-stream?channels=${rtChannel(code)}&v=1.2&accessToken=${head}.${body}.${sig}`, ttl: RT_TTL };
}

const mem = (globalThis.__rooms = globalThis.__rooms || new Map());

async function redis(cmd) {
  try {
    const response = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(3000),
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error('Redis unavailable');
    return data.result;
  } catch { throw new HttpError(503, 'Connection interrupted. Please retry.'); }
}

// Many phones poll the same room: share one Redis read between polls that land on the same server within a moment.
const roomCache = (globalThis.__roomCache = globalThis.__roomCache || new Map());
async function loadRoomCached(code, maxAge = 700) {
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
elseif tonumber(ARGV[2]) ~= 0 then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
return 1`;

// ---- signed-in players: WP and shop items live in their account (lib/platform.js) and follow them to every game ----
async function hydrate(room, pid) {   // bring the account's wallet into the room before anything reads it
  const uid = acctOf(room, pid), p = room.players.find((q) => q.id === pid);
  if (!uid || !p) return;
  const user = await P.getUser(uid);
  if (!user) return;
  (room.snap ||= {})[pid] = user.pts;
  p.owned = { acc: [...user.owned.acc], av: [...user.owned.av], bd: [...user.owned.bd] }; p.gifts = { ...user.gifts };
}
async function linkAccount(room, p, uid) {   // a player took a seat while signed in
  const user = uid && await P.getUser(uid);
  if (!user) return;
  (room.acct ||= {})[p.id] = uid;
  p.avatar = P.eqOf(user).av;
  p.bd = user.eq.bd || ''; p.acc = user.eq.acc || '';
  await hydrate(room, p.id);
}
async function commitAccounts(room) {   // bank what a signed-in player earned (or lost) here, exactly once per change
  for (const [pid, uid] of Object.entries(room.acct || {})) {
    const net = netOf(room, pid), done = (room.sync && room.sync[pid]) || 0;
    if (net === done) continue;
    const n = ((room.syncN ||= {})[pid] || 0) + 1, key = `reckoning:${room.code}:${pid}:${n}`;
    try {
      const user = net > done ? await P.earn(uid, net - done, key) : await P.credit(uid, net - done, key);
      (room.snap ||= {})[pid] = user.pts; (room.sync ||= {})[pid] = net; room.syncN[pid] = n;
    } catch (e) { if (e.status !== 404) throw e; delete room.acct[pid]; }
  }
}

async function saveRoom(room) {
  await commitAccounts(room);
  const expected = room.version || 0;
  room.version = expected + 1;
  if (!REDIS_URL) {
    const current = mem.get(room.code);
    if ((current ? current.version : 0) !== expected) throw new Conflict();
    mem.set(room.code, JSON.parse(JSON.stringify(room)));
    roomCache.delete(room.code);
    return background(rtPublish(room));
  }
  const ok = await redis(['EVAL', CAS_LUA, '1', `room:${room.code}`, JSON.stringify(room), String(expected), String(TTL_SECONDS)]);
  if (ok !== 1) throw new Conflict();
  roomCache.delete(room.code);
  await background(rtPublish(room));
}

// host-controlled game settings
const READY_GRACE_MS = 3000;   // a Ready this soon after the deadline still counts as in time (the request can be on its way when the clock runs out)
const TIMERS = [0, 30, 45, 60, 90, 120];   // seconds to arrange; 0 = no timer
const MULTS = [0.5, 1, 2, 3];   // penalty multiplier; a fractional result is rounded up (1 x 0.5 = 1, 3 x 0.5 = 2)
const PRED_SECS = [7, 10, 15, 20, 25, 30];   // how long the guessing window lasts
const settingsOf = (room) => ({ timer: 0, jokers: true, mult: 1, chat: true, predSec: 15, drink: false, ...(room.settings || {}) });

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

// ---- who is who: every player holds a secret token. Player ids are public (everyone sees them), so an id alone never proves anything.
const newToken = () => crypto.randomBytes(24).toString('base64url');
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
function tokenOk(p, tok) {
  if (!p || !p.tkh || !tok) return false;
  const a = Buffer.from(p.tkh), b = Buffer.from(hashToken(tok));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function issueToken(p) { const tok = newToken(); p.tkh = hashToken(tok); return tok; }
// The recovery secret rotates with the seat token; only its owner sees it.
function recoveryCode(room, p) {
  return crypto.createHmac('sha256', p.tkh).update('recover:' + room.code + ':' + p.id).digest('base64url').slice(0, 24);
}
function recoveredToken(room, p, code, requestId) {
  return crypto.createHmac('sha256', String(code).trim()).update('seat:' + room.code + ':' + p.id + ':' + requestId).digest('base64url');
}
function recoveryOk(room, p, code) {
  const a = Buffer.from(hashToken(recoveryCode(room, p)));
  const b = Buffer.from(hashToken(String(code || '').trim()));
  return crypto.timingSafeEqual(a, b);
}
const REQUEST_TTL_MS = 120000;
function requestFingerprint(action, b) {
  const { requestId, cn, tok, ...data } = b;
  return hashToken(JSON.stringify([action, data]));
}
function rememberRequest(room, pid, b, action) {
  if (!b.requestId) return;
  room.requests = room.requests || {};
  const recent = (room.requests[pid] || []).filter((r) => Date.now() - r.at < REQUEST_TTL_MS);
  recent.push({ id: b.requestId, fp: requestFingerprint(action, b), at: Date.now() });
  room.requests[pid] = recent.slice(-128);
}

// ---- abuse limits: best effort per address, so one machine cannot hammer the game or burn the database quota ----
const rlMem = (globalThis.__rl = globalThis.__rl || new Map());
function clientIp(req) {
  const h = (req && req.headers) || {};
  return String(h['x-vercel-forwarded-for'] || h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || '').trim();
}
function memStrike(key, max, windowMs) {
  const now = Date.now();
  let e = rlMem.get(key);
  if (!e || now > e.reset) { e = { n: 0, reset: now + windowMs }; rlMem.set(key, e); }
  e.n++;
  if (rlMem.size > 4000) for (const [k, v] of rlMem) if (now > v.reset) rlMem.delete(k);
  return e.n > max;
}
const RL_LUA = "local n = redis.call('INCR', KEYS[1]) if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end return n";
// counts one use of `key`; true once the address is over its allowance (shared across servers when Redis is there)
async function strike(ip, kind, max, seconds) {
  if (!ip) return false;   // local testing: no address, no limit
  if (!REDIS_URL) return memStrike(kind + ip, max, seconds * 1000);
  try { return Number(await redis(['EVAL', RL_LUA, '1', `rl:${kind}:${ip}`, String(seconds)])) > max; } catch { return false; }
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
  for (const [id, n] of Object.entries(latePenOf(room))) if (id in tot) tot[id] += n;   // the last to get ready carries a point too
  const vals = Object.values(tot);
  room.winnersRound = room.round;
  room.winners = [];
  room.placeWp = {};
  if (vals.length && Math.max(...vals) !== Math.min(...vals)) {
    const best = Math.min(...vals), worst = Math.max(...vals);
    room.wins = room.wins || {};
    for (const p of act) if (tot[p.id] === best) {
      room.winners.push(p.id);
      room.wins[p.id] = (room.wins[p.id] || 0) + 1;
    }
    // WP for the top three places; tied players share a place (1, 1, 3) and each gets its full reward; last place earns nothing
    if (room.wpv !== 2) {   // an older room: its round wins were worth 10 each, keep what they already earned
      room.bonus = room.bonus || {};
      for (const [id, n] of Object.entries(room.wins)) room.bonus[id] = (room.bonus[id] || 0) + (id in tot && tot[id] === best ? n - 1 : n) * WP_PER_WIN;
      room.wpv = 2;
    }
    const prize = placeWpFor(act.length);
    room.bonus = room.bonus || {};
    for (const p of act) {
      const place = 1 + vals.filter((v) => v < tot[p.id]).length;
      const n = tot[p.id] === worst || place > 3 ? 0 : prize[place - 1];
      if (n) { room.placeWp[p.id] = n; room.bonus[p.id] = (room.bonus[p.id] || 0) + n; }
    }
  }
  // the session scoreboard and the titles shown next round
  room.sess = room.sess || {}; room.titles = {};
  const results = Object.values(room.results);
  for (const p of act) {
    const sx = room.sess[p.id] = room.sess[p.id] || { rounds: 0, pen: 0, rows: 0, hits: 0, calls: 0, streak: 0, best: 0 };
    const lostRows = results.filter((r) => !r.tie && r.losers.includes(p.id)).length;
    const hits = results.filter((r) => (r.hitIds || []).includes(p.id)).length;
    const calls = results.filter((r) => !r.tie && r.picks && r.picks[p.id]).length;
    sx.rounds++; sx.pen += tot[p.id]; sx.rows += lostRows; sx.hits += hits; sx.calls += calls;
    sx.streak = room.winners.includes(p.id) ? sx.streak + 1 : 0; sx.best = Math.max(sx.best, sx.streak);
    const allClean = act.every((q) => !results.some((r) => !r.tie && r.losers.includes(q.id)));
    room.titles[p.id] = sx.streak >= 2 ? 'fire' : hits >= 3 ? 'sniper' : !lostRows && !allClean ? 'clean' : '';
  }
}

// Results are kept for the whole round once a row has been scored, even if the cards are turned back over.
// short lines in the chat about what is happening at the table (gifts, row results, people coming and going)
function sysChat(room, o) {
  if (settingsOf(room).chat === false) return;
  room.chatN = (room.chatN || 0) + 1;
  room.chat = [...(room.chat || []), { n: room.chatN, sys: true, ...o, at: Date.now() }].slice(-60);
}
const CHAT_REACTS = ['heart', 'laugh', 'up', 'fire', 'wow'];
// one guessing window before row 1 opens: everyone calls the loser of all four rows (or skips a row) at once,
// and nobody can turn cards over until it is done
function predWindow(room) {
  if (globalThis.__predOff) return null;   // the tests switch the window off, except in the test of the window itself
  const row = currentRowOf(room), active = activeOf(room);
  if (room.phase !== 'dealt' || row >= ROW_SIZES.length || active.length < 2 || !active.every((p) => p.ready)) return null;
  // a moment after the "everyone is ready" banner; the later rows have no window of their own
  let from = row === 0 && room.allReady && room.allReady.at ? room.allReady.at + 1000 : null;
  if (!from) return null;
  if (settingsOf(room).drink && Object.keys(drinksFor(room, 'late')).length) {   // drink mode: the late drinkers drink first, then the guessing opens
    if (lateDrinkPending(room)) return null;
    from = Math.max(from, (room.drunkLateAt || 0) + 1000);   // a beat after the last glass is down
  }
  // everybody has decided every row: no need to sit out the clock (a beat is kept so the last pick is seen)
  const early = room.predEnd && room.predEnd[0];
  const ms = settingsOf(room).predSec * 1000;
  return { from, until: early ? Math.min(from + ms, Math.max(early + 700, from + 1200)) : from + ms };
}
function storeResults(room) {
  room.results = room.results || {};
  for (const r of rowResults(room)) {
    if (room.results[r.row]) continue;
    room.results[r.row] = { ...r, penalty: Math.ceil(r.penalty * settingsOf(room).mult), at: Date.now() };
    const names = r.losers.map((id) => (room.players.find((q) => q.id === id) || {}).name).filter(Boolean);
    // how often each player has lost each row, for the commentary ("third time Ben loses row 2")
    room.rl = room.rl || {};
    if (!r.tie) for (const id of r.losers) { const a = room.rl[id] = room.rl[id] || [0, 0, 0, 0]; a[r.row]++; }
    if (!r.tie && r.losers.length === 1) room.results[r.row].streak = { name: names[0], n: room.rl[r.losers[0]][r.row] };
    // predictions: whoever named a loser of this row earns a few points
    const pr = Object.fromEntries(Object.entries((room.preds && room.preds[r.row]) || {}).filter(([, tgt]) => tgt));   // a skipped row is stored as null
    room.results[r.row].called = Object.keys(pr).length;
    room.results[r.row].picks = { ...pr };   // who named whom, shown on the tiles once the row is open
    if (!r.tie) {
      const PRED_WP = room.results[r.row].wp = predWpFor(activeOf(room).length);
      const hit = Object.entries(pr).filter(([pid, tgt]) => r.losers.includes(tgt) && room.players.some((q) => q.id === pid));
      const miss = Object.entries(pr).filter(([pid, tgt]) => !r.losers.includes(tgt) && room.players.some((q) => q.id === pid) && balanceOf(room, pid) >= PRED_PENALTY);   // a wrong call costs a point, never below zero
      if (miss.length) {
        room.bonus = room.bonus || {};
        for (const [pid] of miss) room.bonus[pid] = (room.bonus[pid] || 0) - PRED_PENALTY;
        room.results[r.row].misses = miss.map(([pid]) => room.players.find((q) => q.id === pid).name);
        room.results[r.row].missIds = miss.map(([pid]) => pid);
      }
      if (hit.length || miss.length) sysChat(room, { k: 'called', names: hit.map(([pid]) => room.players.find((q) => q.id === pid).name), miss: room.results[r.row].misses || [], wp: PRED_WP, pen: PRED_PENALTY });
      if (hit.length) {
        room.bonus = room.bonus || {};
        for (const [pid] of hit) room.bonus[pid] = (room.bonus[pid] || 0) + PRED_WP;
        room.results[r.row].hits = hit.map(([pid]) => room.players.find((q) => q.id === pid).name);
        room.results[r.row].hitIds = hit.map(([pid]) => pid);
      }
    }
    sysChat(room, r.tie ? { k: 'tie', row: r.row } : { k: 'lose', row: r.row, names, pen: room.results[r.row].penalty });
  }
  tallyWins(room);   // `at` lets every phone advance to the next row at the same moment
}
// When the arranging time runs out, anyone who is not ready gets their cards placed in order and is marked ready.
// one penalty point for being last to get ready, or for every player the clock had to arrange
const LATE_PEN = 1;
function latePenOf(room) {
  const a = room.allReady; if (!a) return {};
  const ids = a.timer ? (a.ids || []) : [a.id];
  return Object.fromEntries(ids.filter((id) => room.players.some((p) => p.id === id)).map((id) => [id, LATE_PEN]));
}
// drink mode: what each player owes for a row (its losers drink the penalty), or for 'late': the last to get ready, before the guessing
function drinksFor(room, row) {
  const out = {};
  if (row === 'late') { if (room.phase === 'dealt' && room.allReady) Object.assign(out, latePenOf(room)); }
  else { const r = room.results && room.results[row]; if (!r) return {}; if (!r.tie) for (const id of r.losers) out[id] = (out[id] || 0) + r.penalty; }
  const act = new Set(activeOf(room).map((p) => p.id));
  return Object.fromEntries(Object.entries(out).filter(([id]) => act.has(id)));   // someone who has left or been set inactive never holds the table up
}
// the last to get ready still owe their drink (nothing else happens until they have had it)
function lateDrinkPending(room) {
  if (!settingsOf(room).drink || room.phase !== 'dealt' || !room.allReady) return false;
  const done = (room.drunk && room.drunk.late) || {};
  return Object.keys(drinksFor(room, 'late')).some((id) => !done[id]);
}
// the first row whose drinkers have not all finished, or -1
function drinksPending(room) {
  if (!settingsOf(room).drink || room.phase !== 'dealt') return -1;
  for (let row = 0; row < ROW_SIZES.length; row++) {
    if (!(room.results && room.results[row])) break;
    const done = (room.drunk && room.drunk[row]) || {};
    if (Object.keys(drinksFor(room, row)).some((id) => !done[id])) return row;
  }
  return -1;
}
function enforceTimer(room) {
  if (room.phase !== 'dealt' || !room.deadline || Date.now() < room.deadline) return false;
  room.deadline = null;
  const active = activeOf(room);
  let last = null;
  const late = [], lateIds = [];   // everyone who ran out of time
  for (const p of active) {
    if (p.ready) continue;
    for (let i = 0; i < p.board.length && p.hand.length; i++) if (!p.board[i]) p.board[i] = { c: p.hand.shift(), up: false };
    if (p.board.every(Boolean)) { for (const c of p.board) c.up = false; p.ready = true; last = p; late.push(p.name); lateIds.push(p.id); }
  }
  if (last && active.length > 1 && active.every((p) => p.ready)) room.allReady = { id: last.id, name: last.name, names: late, ids: lateIds, at: Date.now(), timer: true };
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
// ---- reactions: kept apart from the room (like presence), so a burst of them never competes with real moves ----
const emoMem = (globalThis.__emo = globalThis.__emo || new Map());   // code -> { n, list } (local testing only)
const EMO_LUA = `
local items = redis.call('LRANGE', KEYS[1], 0, 11)
local now = tonumber(ARGV[3])
for _, raw in ipairs(items) do local o = cjson.decode(raw); if o.id == ARGV[1] and now - tonumber(o.at) < 900 then return 0 end end
local n = redis.call('INCR', KEYS[2])
redis.call('LPUSH', KEYS[1], cjson.encode({ id = ARGV[1], e = ARGV[2], at = now, n = n }))
redis.call('LTRIM', KEYS[1], 0, 11)
redis.call('EXPIRE', KEYS[1], ARGV[4]) redis.call('EXPIRE', KEYS[2], ARGV[4])
return n`;
async function pushEmote(code, pid, e) {   // the new reaction, or null when this player sent one less than a second ago
  const now = Date.now();
  if (!REDIS_URL) {
    const m = emoMem.get(code) || { n: 0, list: [] };
    if (m.list.some((x) => x.id === pid && now - x.at < 900)) return null;
    const it = { id: pid, e, at: now, n: ++m.n }; m.list = [it, ...m.list].slice(0, 12); emoMem.set(code, m); return it;
  }
  const n = await redis(['EVAL', EMO_LUA, '2', `emo:${code}`, `emon:${code}`, pid, e, String(now), String(TTL_SECONDS)]);
  return n ? { id: pid, e, at: now, n: Number(n) } : null;
}
async function readEmotes(code) {
  if (!REDIS_URL) { const m = emoMem.get(code) || { n: 0, list: [] }; return { emoteN: m.n, emotes: m.list.filter((x) => Date.now() - x.at < 8000).reverse() }; }
  try {
    const all = ((await redis(['LRANGE', `emo:${code}`, '0', '11'])) || []).map((r) => JSON.parse(r));   // one call per poll: the newest number comes from the list itself
    return { emoteN: all.reduce((m, x) => Math.max(m, x.n), 0), emotes: all.filter((x) => Date.now() - x.at < 8000).reverse() };
  } catch { return { emoteN: 0, emotes: [] }; }
}
async function rtPublishEmote(room, it) {
  if (!ABLY_KEY) return;
  try { await fetch(`${ABLY_REST}/channels/${rtChannel(room.code)}/messages`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(ABLY_KEY).toString('base64'), 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'v', data: JSON.stringify({ v: room.version, e: [it] }) }), signal: AbortSignal.timeout(1500) }); } catch {}
}
const hostFull = (globalThis.__hostFull = globalThis.__hostFull || new Map());
const OFFLINE_AFTER_MS = 45000;
// only the host gets the presence info (it is what the kick button is for)
async function viewFor(room, pid, cn) {
  const [seen, emo] = await Promise.all([room.hostId === pid ? readPresence(room.code) : null, readEmotes(room.code)]);
  return { ...view(room, pid, seen, cn), ...emo };
}

function view(room, pid, seen, cn) {
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
    latePen: latePenOf(room),
    settings: settingsOf(room),
    drunk: room.drunk || {},   // drink mode: who has finished their drinks, row by row
    gifts: (room.gifts || []).filter((x) => Date.now() - x.at < 10000),
    giftN: room.giftN || 0,
    wallet: (() => { const m = inventoryOf(me); return { pts: balanceOf(room, me.id), owned: m.owned, gifts: m.gifts, account: !!acctOf(room, me.id), dailyCap: P.DAILY_EARN_CAP }; })(),
    prices: { wp: placeWpFor(activeOf(room).length)[0], place: placeWpFor(activeOf(room).length), acc: ACC_PRICE, av: PREMIUM, bd: BORDER_PRICE, gift: GIFTS, uses: GIFT_USES, test: isTester(me) },
    chatN: room.chatN || 0,
    chatR: room.chatR || {},
    winners: room.winnersRound === room.round && room.round ? room.winners || [] : null,
    placeWp: room.winnersRound === room.round && room.round ? room.placeWp || {} : null,   // WP each player earned for their place this round   // who won the round that just finished ([] = a full tie, null = not finished)
    // chat: only what this phone hasn't got yet (its last seen number comes with every request)
    chat: (room.chat || []).filter((m) => m.n > (Number.isFinite(cn) ? cn : (room.chatN || 0) - 30)),
    deadline: room.deadline || null,
    rowResults: Object.values(room.results || {}).sort((a, b) => a.row - b.row),
    currentRow: currentRowOf(room),
    predWin: predWindow(room),
    myPreds: [0, 1, 2, 3].map((r) => { const m = room.preds && room.preds[r]; return m && me.id in m ? (m[me.id] || '-') : null; }),   // a player id, '-' for a skipped row, null while undecided
    predPicks: (() => { const w = predWindow(room); if (w && Date.now() < w.until) return null; const m = (room.preds && room.preds[currentRowOf(room)]) || {}; return Object.fromEntries(Object.entries(m).filter(([, tgt]) => tgt)); })(),   // everybody's calls, only once the guessing is over
    predN: activeOf(room).filter((p) => [0, 1, 2, 3].every((r) => room.preds && room.preds[r] && p.id in room.preds[r])).length,   // players who have decided every row
    predWp: predWpFor(activeOf(room).length),
    predPen: PRED_PENALTY,
    recoveryCode: recoveryCode(room, me),
    meId: me.id,
    hostId: room.hostId,
    isHost: room.hostId === me.id,
    hand: me.hand,
    players: room.players.map((p) => {
      const mine = p.id === me.id;
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar || AVATARS[0],
        acc: p.acc || '',
        bd: p.bd || '',
        wp: balanceOf(room, p.id),
        member: !!acctOf(room, p.id),
        inv: (() => { const q = inventoryOf(p); return { acc: q.owned.acc, av: q.owned.av, bd: q.owned.bd, gifts: Object.fromEntries(Object.entries(q.gifts).filter(([, n]) => n > 0)) }; })(),   // what everyone owns is public (normal animals aside)
        wins: (room.wins && room.wins[p.id]) || 0,
        nextReady: !!(room.nextReady && room.nextReady[p.id]),
        sess: (room.sess && room.sess[p.id]) || null,
        title: (room.titles && room.titles[p.id]) || '',
        released: !!p.released,
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

async function handle(action, b, query, ctx = {}) {
  if (action === 'create') {
    need(!(await strike(ctx.ip, 'c', 20, 600)), 429, 'Too many new rooms. Try again in a few minutes.');
    const name = cleanName(b.name);
    need(name, 400, 'Enter a name');
    let code;
    do code = makeCode();
    while (await loadRoom(code));
    const host = { id: crypto.randomUUID(), name, avatar: pickAvatar(b.avatar), hand: [], board: Array(SLOTS).fill(null), ready: false };
    const tok = issueToken(host);
    const room = { code, hostId: host.id, phase: 'lobby', round: 0, players: [host], version: 0, wpv: 2 };
    await linkAccount(room, host, ctx.uid);
    await saveRoom(room);
    await touchPresence(code, host.id);
    return { ...(await viewFor(room, host.id)), tok };
  }

  const code = String(b.code || query.code || '').toUpperCase();
  if (action === 'join') need(!(await strike(ctx.ip, 'j', 40, 600)), 429, 'Too many tries. Wait a few minutes.');
  let room = /^[A-Z]{4}$/.test(code) ? (action === 'state' ? await loadRoomCached(code, query.f ? 0 : 700) : await loadRoom(code)) : null;
  if (!room) { need(!(await strike(ctx.ip, 'nf', 30, 600)), 429, 'Too many tries. Wait a few minutes.'); throw new HttpError(404, 'Room not found'); }
  const switched = await require('../lib/room-switch').handle('reckoning', room, { method: action === 'state' ? 'GET' : 'POST', headers: { 'x-tok': ctx.tok } }, { ...query, ...b }, commitAccounts); if (switched) return switched;
  if (room.deadline && Date.now() >= room.deadline && room.phase === 'dealt') {   // time is up: arrange the stragglers' cards
    if (action === 'state') room = await loadRoom(code);
    // a Ready pressed as the clock ran out (it may reach us a moment late): that player was on time, not arranged by the timer
    if (room && action === 'ready' && b.ready && Date.now() - room.deadline < READY_GRACE_MS) {
      const pl = room.players.find((q) => q.id === String(b.pid || query.pid || ''));
      if (pl && tokenOk(pl, ctx.tok) && !pl.ready && !pl.spectator && pl.board.every(Boolean)) { pl.ready = true; for (const c of pl.board) c.up = false; }
    }
    if (room && enforceTimer(room)) { storeResults(room); await saveRoom(room); }
    need(room, 404, 'Room not found');
  }

  if (action === 'join') {
    const name = cleanName(b.name);
    need(name, 400, 'Enter a name');
    // Account ownership restores its seat; guests prove ownership with a private code.
    const owned = ctx.uid && room.players.find(p=>acctOf(room,p.id)===ctx.uid);
    const same = owned || room.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (same) {
      const receipt = same.recoveryReceipt;
      const replayTok = owned ? P.seatToken(ctx.uid,'reckoning:'+code,same.id,b.requestId) : b.requestId && b.recoveryCode ? recoveredToken(room, same, b.recoveryCode, b.requestId) : null;
      // Recover the response to a committed recovery without rotating the token twice.
      if (receipt && receipt.id === b.requestId && Date.now() - receipt.at < REQUEST_TTL_MS && tokenOk(same, replayTok)) {
        return { ...(await viewFor(room, same.id)), tok: replayTok };
      }
      need(owned || recoveryOk(room, same, b.recoveryCode), 409, 'Recovery code required for this name');
      delete same.released;
      const tok = replayTok || issueToken(same);
      same.tkh = hashToken(tok);   // the old token stops working
      same.recoveryReceipt = b.requestId ? { id: b.requestId, at: Date.now() } : null;
      if (ctx.uid) await linkAccount(room, same, ctx.uid);
      await saveRoom(room);
      seenThrottle.delete(code + ':' + same.id);
      await touchPresence(code, same.id);
      return { ...(await viewFor(room, same.id)), tok };
    }
    need(room.players.length < MAX_PLAYERS, 409, `Room is full (${MAX_PLAYERS} players)`);   // checked after a rejoin, which takes no new seat
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
    const tok = issueToken(p);
    room.players.push(p);
    if (ctx.uid) await linkAccount(room, p, ctx.uid);
    sysChat(room, { k: 'join', fn: name });
    await saveRoom(room);
    await touchPresence(code, p.id);
    return { ...(await viewFor(room, p.id)), tok };
  }

  const pid = String(b.pid || query.pid || '');
  const cnRaw = query.cn !== undefined ? query.cn : b.cn;
  const cnOf = cnRaw === undefined || cnRaw === '' ? undefined : Number(cnRaw);
  let me = room.players.find((p) => p.id === pid);
  // Another server may still cache the token from before a seat recovery.
  // Verify against Redis before rejecting a newly rotated token.
  if (action === 'state' && (!me || !tokenOk(me, ctx.tok))) {
    roomCache.delete(code);
    room = await loadRoom(code);
    need(room, 404, 'Room not found');
    me = room.players.find((p) => p.id === pid);
  }
  need(me && tokenOk(me, ctx.tok), 404, 'You are not in this room');
  if (acctOf(room, pid)) await hydrate(room, pid);
  if (b.requestId) {
    const prior = (room.requests && room.requests[pid] || []).find((r) => r.id === b.requestId);
    if (prior) {
      need(prior.fp === requestFingerprint(action, b), 409, 'Request ID already used');
      return viewFor(room, pid, cnOf);
    }
  }
  await touchPresence(code, pid);
  const PLAYER_ACTIONS = ['predict', 'place', 'move', 'unplace', 'flip', 'flipRow', 'flipRowUp', 'flipRowAll', 'ready'];
  need(!(me.spectator && PLAYER_ACTIONS.includes(action)), 409, 'Wait for the next round');
  const active = activeOf(room);

  switch (action) {
    case 'rt':
      return { rt: rtUrl(code) };

    case 'state':
      // nothing new for a non-host: a tiny reply keeps slow connections quick
      if (query.v && Number(query.v) === room.version) {
        // the host also needs fresh online/offline marks, so it gets the full view only every 10 s; in between it can take the tiny reply too
        if (room.hostId !== pid) return { same: true, version: room.version, now: Date.now(), ...(await readEmotes(code)) };   // reactions are not part of the version, so they ride along
        const hk = code + ':host', last = hostFull.get(hk) || 0;
        if (Date.now() - last < 10000) return { same: true, version: room.version, now: Date.now(), ...(await readEmotes(code)) };
        hostFull.set(hk, Date.now());
      }
      return viewFor(room, pid, cnOf);

    case 'nextReady': {   // after row 4: each player says they are ready for another round; once everyone is, it is dealt as if the host had pressed deal
      need(room.phase === 'dealt' && ROW_SIZES.every((_, i) => room.results && room.results[i]), 409, 'The round is not over yet');
      need(b.ready === false || drinksPending(room) < 0, 409, 'Finish the drinks first');
      room.nextReady = room.nextReady || {};
      if (b.ready === false) delete room.nextReady[pid]; else room.nextReady[pid] = true;
      if (!activeOf(room).every((p) => room.nextReady[p.id])) break;
    }
    // falls through: everyone is ready
    case 'deal': {
      need(room.hostId === pid || action === 'nextReady', 403, 'Only the host can do that');
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
      room.preds = {};
      room.drunk = {}; room.drunkLateAt = 0;
      room.predEnd = {};
      room.deadline = set.timer ? Date.now() + set.timer * 1000 : null;
      room.phase = 'dealt';
      room.allReady = null;
      room.nextReady = {};
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
      { const w = predWindow(room); need(!w || Date.now() >= w.until, 409, 'Wait for the guesses'); }
      const slot = slotOf(b.slot);
      need(me.board[slot], 400, 'Nothing there');
      need(rowOfSlot(slot) <= currentRowOf(room), 409, 'Not this row yet');
      { const dp = drinksPending(room); need(me.board[slot].up || (!lateDrinkPending(room) && (dp < 0 || dp >= rowOfSlot(slot))), 409, 'Finish the drinks first'); }
      me.board[slot].up = !me.board[slot].up;
      break;
    }

    case 'flipRowUp': // kept for older clients
    case 'flipRow': {
      need(room.phase === 'dealt', 409, 'No cards dealt');
      need(active.every((p) => p.ready), 409, 'Wait until everyone is ready');
      { const w = predWindow(room); need(!w || Date.now() >= w.until, 409, 'Wait for the guesses'); }
      const row = Number(b.row);
      need(Number.isInteger(row) && row >= 0 && row < ROW_SIZES.length, 400, 'Bad row');
      need(row <= currentRowOf(room), 409, 'Not this row yet');
      { const dp = drinksPending(room); need(!(action === 'flipRowUp' || b.up) || (!lateDrinkPending(room) && (dp < 0 || dp >= row)), 409, 'Finish the drinks first'); }
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
      { const w = predWindow(room); need(!w || Date.now() >= w.until, 409, 'Wait for the guesses'); }
      const row = Number(b.row);
      need(Number.isInteger(row) && row >= 0 && row < ROW_SIZES.length, 400, 'Bad row');
      need(row <= currentRowOf(room), 409, 'Not this row yet');
      { const dp = drinksPending(room); need(!b.up || (!lateDrinkPending(room) && (dp < 0 || dp >= row)), 409, 'Finish the drinks first'); }
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
      if (b.ready && room.allReady && room.allReady.timer) break;   // the clock has already settled who was late: a Ready now changes nothing
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
      if (b.chat !== undefined) next.chat = !!b.chat;
      if (b.mult !== undefined) { need(MULTS.includes(Number(b.mult)), 400, 'Pick a multiplier from the list'); next.mult = Number(b.mult); }
      if (b.predSec !== undefined) { need(PRED_SECS.includes(Number(b.predSec)), 400, 'Pick a time from the list'); next.predSec = Number(b.predSec); }
      if (b.drink !== undefined) next.drink = !!b.drink;
      room.settings = next;
      break;
    }

    case 'emote': {   // stored and pushed on their own: the room itself is not touched
      need(EMOTES.includes(b.e), 400, 'Unknown reaction');
      const it = await pushEmote(code, pid, b.e);   // one reaction per player per second, so nobody can flood the table
      if (it) await background(rtPublishEmote(room, it));
      return viewFor(room, pid, cnOf);
    }

    case 'chat': {
      need(settingsOf(room).chat !== false, 403, 'Chat is turned off');
      const text = Array.from(String(b.text || '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 140).join('');
      need(text, 400, 'Write something first');
      const now = Date.now();
      room.chatAt = room.chatAt || {};
      if (now - (room.chatAt[pid] || 0) < 600) return viewFor(room, pid, cnOf);   // one message at a time
      room.chatAt[pid] = now;
      room.chatN = (room.chatN || 0) + 1;
      room.chat = [...(room.chat || []), { n: room.chatN, id: pid, name: me.name, avatar: me.avatar, acc: me.acc || '', bd: me.bd || '', text, at: now }].slice(-50);
      break;
    }

    case 'predict': {   // call who will lose each row: right = +3 points, wrong = -1, a skipped row = nothing
      const w = predWindow(room), now = Date.now(), row = Number(b.row);
      need(w && now >= w.from - 1500 && now <= w.until + 1500, 409, 'Guessing is closed');   // a pick made in time on a slow connection still counts
      need(Number.isInteger(row) && row >= 0 && row < ROW_SIZES.length, 400, 'Bad row');
      room.preds = room.preds || {};
      room.preds[row] = room.preds[row] || {};
      if (b.target === '') delete room.preds[row][pid];   // undecided again
      else if (b.target === '-') room.preds[row][pid] = null;   // skip this row
      else { const tgt = active.find((p) => p.id === String(b.target)); need(tgt && tgt.id !== pid, 400, 'Pick another player'); room.preds[row][pid] = tgt.id; }
      if (active.every((p) => [0, 1, 2, 3].every((r) => room.preds[r] && p.id in room.preds[r]))) { room.predEnd = room.predEnd || {}; room.predEnd[0] = room.predEnd[0] || now; }   // everyone has decided every row: the window closes early
      else if (room.predEnd) delete room.predEnd[0];
      break;
    }

    case 'predStart':   // older phones still send this; the later rows no longer have a guessing window of their own
      return viewFor(room, pid, cnOf);

    case 'creact': {   // one reaction per player per chat message; tapping the same one again takes it back
      need(CHAT_REACTS.includes(b.e), 400, 'Unknown reaction');
      const n = Number(b.n);
      need((room.chat || []).some((m) => m.n === n && !m.sys), 404, 'That message is gone');
      const now = Date.now();
      room.reactAt = room.reactAt || {};
      if (now - (room.reactAt[pid] || 0) < 350) return viewFor(room, pid, cnOf);
      room.reactAt[pid] = now;
      room.chatR = room.chatR || {};
      const cur = room.chatR[n] || {};
      let had = null;
      for (const [e, ids] of Object.entries(cur)) { const i = ids.indexOf(pid); if (i >= 0) { ids.splice(i, 1); had = e; if (!ids.length) delete cur[e]; } }
      if (had !== b.e) (cur[b.e] = cur[b.e] || []).push(pid);
      if (Object.keys(cur).length) room.chatR[n] = cur; else delete room.chatR[n];
      const live = new Set(room.chat.map((m) => m.n));
      for (const k of Object.keys(room.chatR)) if (!live.has(Number(k))) delete room.chatR[k];
      break;
    }

    case 'avatar':
      if (b.avatar !== undefined) { need(AVATARS.includes(b.avatar) || inventoryOf(me).owned.av.includes(b.avatar), 403, 'Buy that avatar in the shop first'); me.avatar = b.avatar; }
      if (b.bd !== undefined) { need(b.bd === '' || inventoryOf(me).owned.bd.includes(b.bd), 403, 'Buy that border in the shop first'); me.bd = b.bd; }
      if (b.acc !== undefined) {
        need(b.acc === '' || inventoryOf(me).owned.acc.includes(b.acc), 403, 'Buy that in the shop first');
        me.acc = b.acc;
      }
      if (acctOf(room, pid)) for (const [k, v] of [['av', b.avatar], ['bd', b.bd], ['acc', b.acc]]) if (v !== undefined) await P.equip(acctOf(room, pid), k, v, b.requestId && b.requestId + ':' + k);   // the look follows the account to other games
      break;

    case 'buy': {
      inventoryOf(me);
      const buyer = acctOf(room, pid);
      const kind = String(b.kind), key = String(b.key);
      const table = kind === 'acc' ? ACC_PRICE : kind === 'av' ? PREMIUM : kind === 'bd' ? BORDER_PRICE : kind === 'gift' ? GIFTS : null;
      const price = table && own(table, key) ? table[key] : undefined;
      need(price !== undefined, 400, 'Unknown item');
      if (kind === 'acc') need(!me.owned.acc.includes(key), 409, 'You already own that');
      if (kind === 'av') need(!me.owned.av.includes(key), 409, 'You already own that');
      if (kind === 'bd') need(!me.owned.bd.includes(key), 409, 'You already own that');
      if (kind === 'gift') need((me.gifts[key] || 0) + GIFT_USES <= 99, 409, 'That is plenty already');
      need(balanceOf(room, pid) >= price, 402, 'Not enough win points');
      if (buyer) {   // the account is the wallet: it checks the price again and never charges one request twice
        const user = await P.buy(buyer, kind, key, b.requestId);
        me.owned = { acc: [...user.owned.acc], av: [...user.owned.av], bd: [...user.owned.bd] }; me.gifts = { ...user.gifts }; (room.snap ||= {})[pid] = user.pts;
        break;
      }
      room.spent = room.spent || {};
      room.spent[pid] = (room.spent[pid] || 0) + price;   // the win count itself is untouched
      if (kind === 'acc') me.owned.acc.push(key);
      else if (kind === 'av') me.owned.av.push(key);
      else if (kind === 'bd') me.owned.bd.push(key);
      else me.gifts[key] = (me.gifts[key] || 0) + GIFT_USES;   // every purchase adds another pack of throws
      break;
    }

    case 'throw': {
      inventoryOf(me);
      const key = String(b.item);
      need(own(GIFTS, key), 400, 'Unknown item');
      need(own(me.gifts, key) && me.gifts[key] > 0, 403, 'You have none left');
      const all = String(b.target) === 'all';   // everyone at once costs every throw of the pack
      const target = all ? null : room.players.find((q) => q.id === String(b.target));
      if (all) { need(room.players.length > 1 || isTester(me), 400, 'Nobody to throw at'); need(me.gifts[key] >= GIFT_USES, 403, `Throwing at everyone needs all ${GIFT_USES} throws`); }
      else need(target && (target.id !== pid || isTester(me)), 400, 'Pick another player');   // only the tester may throw at themselves
      const now = Date.now();
      room.giftAt = room.giftAt || {};
      if (now - (room.giftAt[pid] || 0) < 1500) return viewFor(room, pid, cnOf);   // one throw at a time
      room.giftAt[pid] = now;
      if (acctOf(room, pid)) for (let i = 0; i < (all ? GIFT_USES : 1); i++) await P.useGift(acctOf(room, pid), key, b.requestId && b.requestId + ':' + i);
      me.gifts[key] -= all ? GIFT_USES : 1;
      room.giftN = (room.giftN || 0) + 1;
      room.gifts = [...(room.gifts || []).filter((x) => now - x.at < 10000), { n: room.giftN, from: pid, to: all ? 'all' : target.id, item: key, at: now }].slice(-10);
      sysChat(room, { k: 'gift', fn: me.name, tn: all ? '*' : target.name, item: key });
      break;
    }

    case 'rename': {   // a player renames themselves; the host can rename anyone
      const target = room.players.find((q) => q.id === String(b.target || pid));
      need(target, 404, 'Player not found');
      need(target.id === pid || room.hostId === pid, 403, 'Only the host can rename someone else');
      const name = cleanName(b.name);
      need(name, 400, 'Enter a name');
      if (name === target.name) break;
      need(!room.players.some((q) => q.id !== target.id && q.name.toLowerCase() === name.toLowerCase()), 409, 'Name already taken');
      const was = target.name;
      target.name = name;
      // this round's results carry names for the replays and the commentary: keep them in step
      for (const r of Object.values(room.results || {})) {
        for (const e of r.entries || []) if (e.id === target.id) e.name = name;
        if (r.hits && r.hitIds) r.hits = r.hitIds.map((id, i) => (id === target.id ? name : r.hits[i]));
        if (r.misses && r.missIds) r.misses = r.missIds.map((id, i) => (id === target.id ? name : r.misses[i]));
        if (r.streak && r.streak.name === was && r.losers && r.losers[0] === target.id) r.streak.name = name;
      }
      sysChat(room, { k: 'rename', fn: was, tn: name });
      break;
    }
    case 'drank': {   // drink mode: a loser says they have finished; the host can wave a row through for everyone
      const row = b.row === 'late' ? 'late' : Number(b.row);
      need(row === 'late' ? !!room.allReady : Number.isInteger(row) && row >= 0 && row < ROW_SIZES.length && room.results && room.results[row], 400, 'Bad row');
      const owed = drinksFor(room, row);
      room.drunk = room.drunk || {}; room.drunk[row] = room.drunk[row] || {};
      if (b.all) { need(room.hostId === pid, 403, 'Only the host can do that'); for (const id of Object.keys(owed)) room.drunk[row][id] = true; }
      else { need(owed[pid], 400, 'Nothing to drink this row'); room.drunk[row][pid] = true; }
      if (row === 'late' && !room.drunkLateAt && !lateDrinkPending(room)) room.drunkLateAt = Date.now();   // the guessing opens a beat after the last of them
      break;
    }
    case 'release': {   // inactive players keep their seat, cards and points; recovery still requires their private code
      need(room.hostId === pid, 403, 'Only the host can do that');
      const target = room.players.find((q) => q.id === String(b.target));
      need(target, 404, 'Player not found');
      need(target.id !== pid, 400, 'You can’t do that to yourself');
      if (b.on === false) delete target.released; else target.released = true;
      break;
    }
    case 'kick': {
      // The host removes a player (for example someone who lost their connection and can't get back in).
      need(room.hostId === pid, 403, 'Only the host can do that');
      const target = room.players.find((q) => q.id === String(b.target));
      need(target, 404, 'Player not found');
      need(target.id !== pid, 400, 'You can’t remove yourself');
      room.players = room.players.filter((q) => q.id !== target.id);
      if (room.requests) delete room.requests[target.id];
      sysChat(room, { k: 'leave', fn: target.name });
      room.allReady = null;
      seenMem.get(code) && delete seenMem.get(code)[target.id];
      break;
    }

    case 'leave': {
      const leaver = room.players.find((p) => p.id === pid);
      room.players = room.players.filter((p) => p.id !== pid);
      if (room.requests) delete room.requests[pid];
      if (leaver && room.players.length) sysChat(room, { k: 'leave', fn: leaver.name });
      if (!room.players.length) {
        await commitAccounts(room);
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
  rememberRequest(room, pid, b, action);
  await saveRoom(room);
  return viewFor(room, pid, cnOf);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    need(req.method === 'GET' || req.method === 'POST', 405, 'Method not allowed');
    const ip = clientIp(req);
    if (ip) need(!memStrike('all' + ip, 1500, 60000), 429, 'Slow down a little.');
    const query = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    let body = req.body;
    if (typeof body === 'string') { need(body.length <= 8000, 413, 'Too much data'); try { body = body ? JSON.parse(body) : {}; } catch { throw new HttpError(400, 'Bad request'); } }
    body = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    need(JSON.stringify(body).length <= 8000, 413, 'Too much data');
    const action = req.method === 'GET' ? 'state' : typeof body.action === 'string' ? body.action : '';
    if (body.requestId !== undefined) need(typeof body.requestId === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId), 400, 'Bad request ID');
    const h = req.headers || {};
    const tok = String(h['x-tok'] || body.tok || '').slice(0, 100);
    const uid = await P.identify(req);
    let result;
    for (let attempt = 0; ; attempt++) {
      try {
        result = await handle(action, body, query, { ip, tok, uid });
        break;
      } catch (e) {
        if (!(e instanceof Conflict) || attempt >= 10) throw e;
        await new Promise((r) => setTimeout(r, 15 + Math.random() * 35 * (attempt + 1)));
      }
    }
    res.status(200).json(result);
  } catch (e) {
    const status = e instanceof Conflict ? 503 : e.status || 500;
    if (status === 500) console.error(e);
    if (status === 429) res.setHeader('Retry-After', '60');
    res.status(status).json({ error: status === 500 ? 'Server error' : status === 503 ? 'Busy, try again' : e.message });
  }
};

module.exports.evaluateRow = evaluateRow;
module.exports.handOf = handOf;
module.exports.cleanName = cleanName;
module.exports.enforceTimer = enforceTimer;
module.exports.placeWpFor = placeWpFor;
module.exports.predWpFor = predWpFor;
module.exports.tallyWins = tallyWins;
