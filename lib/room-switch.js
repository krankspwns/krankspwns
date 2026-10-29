// A switch freezes the source and creates a clean destination in ONE CAS.
// Existing seat secrets survive; game-specific private state never crosses games.
const crypto = require('node:crypto');
const C = require('./catalog');
const P = require('./platform');
const GAMES = {
  reckoning: { title: 'Row of Reckoning', min: 2, max: 12 },
  'last-train': { title: 'Last Train', min: 5, max: 12 },
  bridge: { title: 'Hidden Alliance', min: 4, max: 4 },
  'hot-joker': { title: 'Last Laugh', min: 3, max: 10 },
  'grand-con': { title: 'The Grand Con', min: 4, max: 12 },
};
const need = (ok, status, message) => { if (!ok) throw Object.assign(Error(message), { status }); };
const hash = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const seatHash = (game, p) => game === 'reckoning' ? p?.tkh : p?.tokenHash;
const key = (game, code) => (game === 'reckoning' ? '' : game + ':') + 'room:' + code;
const members = room => [...room.players, ...(room.observers || [])].filter(p => !p.departed && !p.kicked && !p.released);
const memory = game => game === 'reckoning' ? (globalThis.__rooms ||= new Map()) : game === 'grand-con' ? (globalThis.__grandConRooms ||= new Map()) : game === 'last-train' ? (globalThis.__lastTrainRooms ||= new Map()) : ((globalThis.__roomStoreRooms ||= {})[game] ||= new Map());
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
async function redis(command) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: JSON.stringify(command), signal: AbortSignal.timeout(3000) });
    const j = await r.json(); if (!r.ok || j.error) throw Error(); return j.result;
  } catch { throw Object.assign(Error('Connection lost. Retry the switch; nobody has to rejoin.'), { status: 503 }); }
}
const testerBonus = p => {
  const name = process.env.TESTER_NAME === undefined ? 'benny' : process.env.TESTER_NAME.toLowerCase().trim();
  return name !== 'off' && p.name.trim().toLowerCase() === name ? 1000 : 0;
};
function guestWallet(game, room, p) {
  const saved = structuredClone(room.switchWallets?.[p.id] || C.emptyWallet(C.START_WP));
  if (game === 'reckoning') {
    saved.pts = (globalThis.__startWp ?? C.START_WP) + testerBonus(p) + (room.wpv === 2 ? 0 : (room.wins?.[p.id] || 0) * 10) + (room.bonus?.[p.id] || 0) - (room.spent?.[p.id] || 0);
    saved.owned = structuredClone(p.owned || saved.owned); saved.gifts = { ...(p.gifts || {}) };
    saved.eq = { av: p.avatar || saved.eq.av, bd: p.bd || '', acc: p.acc || '' };
  } else if (game === 'last-train') {
    const w = room.wallet?.[p.id] || {};
    saved.pts = C.START_WP + testerBonus(p) + (w.earned || 0) - (w.spent || 0);
    saved.owned.bd = [...(w.frames || [])]; saved.eq.bd = w.frame || ''; saved.gifts = { ...(w.gifts || {}) };
  } else {
    const w = room.social?.guest?.[p.id];
    if (w) return structuredClone(w);
  }
  return saved;
}
async function destination(game, from, room, code) {
  const next = { code, version: 1, hostId: room.hostId, phase: 'lobby', match: 0, round: 0, step: 0, players: [], settings: {}, receipts: [], history: [], switchWallets: {} };
  if (game === 'reckoning') next.wpv = 2;
  if (game === 'grand-con') Object.assign(next, { rulesVersion: 2, lot: 0, settings: { discussionSeconds: 0 } });
  if (game === 'last-train') Object.assign(next, { rulesVersion: 2, settings: { extra: 'brave', blocker: true, discussion: 'chat', speakSeconds: 45, autoShuffle: process.env.LAST_TRAIN_AUTO_SHUFFLE !== 'off' } });
  if (game === 'bridge') next.settings = { deals: 4 };
  if (game === 'hot-joker') Object.assign(next, { settings: { turnSeconds: 40, setSize: 2 }, losses: {} });
  next.social = { n: 0, feed: [], guest: {}, acct: {}, eq: {}, paid: {}, awards: null };
  for (const [i, p] of members(room).entries()) {
    const q = { id: p.id, name: p.name, ...(p.base ? { base: p.base } : {}), bot: !!p.bot, [game === 'reckoning' ? 'tkh' : 'tokenHash']: seatHash(from, p), avatarIndex: p.avatarIndex ?? i, hand: [], board: Array(7).fill(null), ready: false };
    const uid = room.acct?.[p.id] || room.social?.acct?.[p.id];
    const user = uid && await P.getUser(uid);
    const w = user ? { ...P.walletOf(user), eq: P.eqOf(user) } : guestWallet(from, room, p);
    next.switchWallets[p.id] = structuredClone(w);
    q.avatar = w.eq.av || C.AVATARS[i % C.AVATARS.length]; q.bd = w.eq.bd || ''; q.acc = w.eq.acc || '';
    q.owned = structuredClone(w.owned); q.gifts = { ...w.gifts };
    if (user) {
      (next.acct ||= {})[p.id] = uid; (next.snap ||= {})[p.id] = user.pts;
      next.social.acct[p.id] = uid;
    } else {
      next.social.guest[p.id] = structuredClone(w);
      if (game === 'reckoning') (next.bonus ||= {})[p.id] = w.pts - (globalThis.__startWp ?? C.START_WP) - testerBonus(p);
    }
    next.social.eq[p.id] = { ...w.eq };
    (next.wallet ||= {})[p.id] = { earned: user ? 0 : w.pts - C.START_WP - testerBonus(p), spent: 0, frames: [...w.owned.bd], frame: w.eq.bd || '', gifts: { ...w.gifts } };
    next.players.push(q);
  }
  return next;
}
const reply = (room, me) => ({ roomSwitch: { ...room.switchedTo, page: '/' + room.switchedTo.game + '.html', pid: me.id } });
// Called immediately after load, before timers, joins, receipts or game mutations.
async function handle(game, room, req, body, prepare) {
  const action = req.method === 'GET' ? 'state' : body.action;
  if (!room.switchedTo && action !== 'switchGame') return null;
  const me = [...room.players, ...(room.observers || [])].find(p => p.id === body.pid);
  const tok = req.headers?.['x-tok'] || body.tok;
  const digest = seatHash(game, me);
  need(me && tok && digest && digest.length === 64 && crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hash(tok))), 403, room.switchedTo ? 'This room switched games. Open the latest invite, or resume on your original device.' : 'Your room seat could not be verified.');
  need(members(room).some(p => p.id === me.id) && !(room.kicked || []).includes(me.id), 403, 'You are no longer in this room.');
  if (room.switchedTo) return reply(room, me);
  need(req.method === 'POST', 405, 'Use the Switch game button.');
  need(room.hostId === me.id && !me.bot, 403, 'Only the host can switch games.');
  need(typeof body.requestId === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId), 400, 'Please retry the switch.');
  need(body.version === room.version, 409, 'The room changed. Check everyone is still here and try again.');
  const target = Object.hasOwn(GAMES, body.game) && GAMES[body.game]; need(target && body.game !== game, 400, 'Choose another game.');
  const people = members(room);
  need(people.filter(p => !p.bot).length >= 2, 409, 'Play with at least one other person to switch together.');
  need(!people.some(p => p.bot) || ['bridge', 'hot-joker'].includes(body.game), 409, 'Remove practice bots before switching to a game without bot support.');
  need(!Object.keys(room.bets || {}).length, 409, 'Finish the current vote before switching so every WP bet is settled.');
  need(people.length <= target.max, 409, target.title + ' has room for ' + target.max + '. Nobody was moved.');
  // Below the minimum is fine: the new lobby can invite more friends or add bots.
  const active = room.phase !== 'lobby' && room.phase !== 'finished';
  need(!active || body.confirm === true, 409, 'Confirm ending the current game before switching.');
  need(url || !process.env.VERCEL, 503, 'Switching games needs shared room storage. Your current room has not changed.');
  // Account synchronization uses the source game’s existing bookkeeping.
  if (prepare) await prepare(room);
  for (let attempt = 0; attempt < 24; attempt++) {
    const code = attempt ? Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[crypto.randomInt(24)]).join('') : room.code;
    const next = await destination(body.game, game, room, code);
    const frozen = { ...room, version: room.version + 1, switchedTo: { game: body.game, code }, deadline: null };
    let result;
    if (url) {
      result = await redis(['EVAL', `local cur=redis.call('GET',KEYS[1]);if not cur or tonumber(cjson.decode(cur).version)~=tonumber(ARGV[1]) then return -1 end;if redis.call('EXISTS',KEYS[2])==1 then return 0 end;redis.call('SET',KEYS[1],ARGV[2],'EX',43200);redis.call('SET',KEYS[2],ARGV[3],'EX',43200);return 1`, '2', key(game, room.code), key(body.game, code), String(room.version), JSON.stringify(frozen), JSON.stringify(next)]);
    } else {
      const source = memory(game), dest = memory(body.game);
      if (source.get(room.code)?.version !== room.version) result = -1;
      else if (dest.has(code)) result = 0;
      else { source.set(room.code, structuredClone(frozen)); dest.set(code, structuredClone(next)); result = 1; }
    }
    if (result === -1) throw Object.assign(Error('The room changed. Refresh and retry; nobody was moved by this request.'), { status: 409 });
    if (result === 1) { globalThis.__roomCache?.delete(room.code); return reply(frozen, me); }
  }
  throw Object.assign(Error('Could not reserve a new room. Nobody was moved. Please retry.'), { status: 503 });
}
module.exports = { handle, GAMES };
