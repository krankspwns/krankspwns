// Shared room API for the card games: create / join / rejoin / leave, host
// transfer, authenticated state, idempotent requests and conflict retries.
// A game supplies its rules through hooks (see api/bridge.js, api/hot-joker.js).
const crypto = require('node:crypto');
const { createStore, Conflict } = require('./room-store');
const P = require('./platform');
const social = require('./table-social');
const need = (ok, status, message) => { if (!ok) throw Object.assign(Error(message), { status }); };
const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const secret = () => crypto.randomBytes(24).toString('base64url');
const equal = (a, b) => crypto.timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const cleanName = (name) => Array.from(String(name || '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 12).join('').replace(/(\s*[\[\(\{]\s*bot\s*[\]\)\}])+\s*$/i, '').trim();
const present = (room) => room.players.filter((p) => !p.departed);
const humans = (room) => present(room).filter((p) => !p.bot);
const BOT_NAMES = ['Mei', 'Arjun', 'Siti', 'Wei', 'Priya', 'Hock', 'Lena', 'Raj', 'Jun', 'Aisha', 'Ken', 'Mala', 'Tariq', 'Bao', 'Nora', 'Faris'];
const IGNORED = new Set(['tok', 'pid', 'requestId', 'code']);

function createRoomApi(cfg) {
  const store = createStore(cfg.ns);
  const recovery = (room, p) => crypto.createHmac('sha256', p.tokenHash).update(cfg.ns + ':' + room.code + ':' + p.id).digest('base64url').slice(0, 24);
  // the game's own view plus the platform's: wallet, cosmetics, emotes and WP awards
  const respond = async (room, me, extra) => ({ ...view(room, me), ...(await social.view(room, me)), ...extra });
  const view = (room, me) => ({
    game: cfg.ns, code: room.code, version: room.version, phase: room.phase, match: room.match || 0, deadline: room.deadline || null, now: Date.now(),
    hostId: room.hostId, meId: me.id, notice: room.notice || null, settings: room.settings || {}, minPlayers: cfg.min, maxPlayers: cfg.max,
    players: room.players.map((p, i) => ({ id: p.id, name: p.name, avatarIndex: i, departed: !!p.departed, bot: !!p.bot })),
    recoveryCode: recovery(room, me),
    ...cfg.view(room, me),
  });
  async function execute(req, body) {
    const gameActions = Object.keys(cfg.actions || {});
    const action = req.method === 'GET' ? 'state' : body.action;
    need(['state', 'create', 'join', 'leave', 'start', 'settings', 'addBot', 'removeBot', ...social.ACTIONS, ...gameActions].includes(action), 400, 'Unknown action.');
    if (action === 'create') {
      const name = cleanName(body.name); need(name, 400, 'Enter your name.');
      let code; for (let i = 0; i < 10; i++) { code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[crypto.randomInt(24)]).join(''); if (!await store.load(code)) break; code = null; }
      need(code, 503, 'Please try creating the room again.');
      const tok = secret(), p = { id: crypto.randomUUID(), name, tokenHash: hash(tok) };
      const room = { code, version: 0, hostId: p.id, phase: 'lobby', match: 0, settings: {}, players: [p], receipts: [] };
      cfg.init?.(room); await social.link(room, p, await P.identify(req)); await store.save(room); return respond(room, p, { tok });
    }
    const code = String(body.code || '').toUpperCase(); need(/^[A-Z]{4}$/.test(code), 400, 'Enter a four-letter room code.');
    const room = await store.load(code); need(room, 404, 'Room not found.');
    if (action === 'join') {
      const name = cleanName(body.name); need(name, 400, 'Enter your name.');
      const same = room.players.filter((q) => !q.bot && (q.base || q.name).toLowerCase() === name.toLowerCase());
      let p = body.recoveryCode ? same.find((q) => equal(recovery(room, q), String(body.recoveryCode).trim())) || same[0] : (room.phase === 'lobby' && room.players.length < cfg.max ? null : same[0]), tok;
      if (p) {
        const replay = body.requestId && body.recoveryCode ? crypto.createHmac('sha256', String(body.recoveryCode).trim()).update(cfg.ns + ':' + code + ':' + p.id + ':' + body.requestId).digest('base64url') : null;
        if (p.recoveryReceipt === body.requestId && replay && equal(p.tokenHash, hash(replay))) return respond(room, p, { tok: replay });
        need(body.recoveryCode && equal(recovery(room, p), String(body.recoveryCode).trim()), 409, 'That name is already in this room. Enter its rejoin code.');
        tok = replay || secret(); p.tokenHash = hash(tok); p.departed = false; p.recoveryReceipt = body.requestId || null;
        if (!room.players.some((q) => q.id === room.hostId && !q.departed && !q.bot)) room.hostId = p.id;
      } else {
        need(room.phase === 'lobby', 409, 'The game has started. You can only rejoin an existing player.');
        need(room.players.length < cfg.max, 409, 'This room has ' + cfg.max + ' players.');
        tok = secret(); p = { id: crypto.randomUUID(), name, tokenHash: hash(tok) }; room.players.push(p);
        // two real players with one name get [1], [2] ... so they can be told apart
        const twins = room.players.filter((q) => !q.bot && (q.base || q.name).toLowerCase() === name.toLowerCase());
        if (twins.length > 1) twins.forEach((q, i) => { q.base = q.base || q.name; q.name = Array.from(q.base).slice(0, 8).join('') + ' [' + (i + 1) + ']'; });
      }
      if (!room.hostId) room.hostId = p.id;
      await social.link(room, p, await P.identify(req));
      await store.save(room); return respond(room, p, { tok });
    }
    const me = room.players.find((p) => p.id === body.pid);
    need(me && body.tok && equal(me.tokenHash, hash(body.tok)), 401, 'We could not load your place. Use your rejoin code to come back.');
    need(!me.departed || action === 'state', 403, 'Use your rejoin code to come back.');
    const fingerprint = hash(JSON.stringify(Object.entries(body).filter(([k]) => !IGNORED.has(k)).sort(([a], [b]) => a < b ? -1 : 1)));
    const receipt = (room.receipts || []).find((r) => r.pid === me.id && r.id === body.requestId);
    if (action !== 'state' && receipt) { need(receipt.fingerprint === fingerprint, 409, 'That request was already used. Please refresh and try again.'); return respond(room, me); }
    // a finished game pays its WP once, whether a player's move or the clock ended it
    const payout = async () => (cfg.results && room.phase === 'finished' ? social.settle(room, cfg.ns, cfg.results(room)) : false);
    let changed = !!cfg.tick?.(room);
    if (action === 'state') { if (await payout()) changed = true; if (changed) await store.save(room); return respond(room, me); }
    if (action !== 'leave') need(body.match === room.match, 409, 'The game has changed. Check the new screen.');
    const host = () => need(room.hostId === me.id, 403, 'Only the host can do that.');
    if (action === 'settings') {
      host(); need(['lobby', 'finished'].includes(room.phase), 409, 'Change settings before the next game.'); cfg.settings(room, body);
    } else if (action === 'start') {
      host(); need(['lobby', 'finished'].includes(room.phase), 409, 'The game has already started.');
      room.players = present(room); room.notice = null; cfg.start(room, body);
    } else if (action === 'leave') {
      if (room.phase === 'lobby') room.players = room.players.filter((p) => p.id !== me.id); else me.departed = true;
      if (room.hostId === me.id) room.hostId = humans(room)[0]?.id || null;
      cfg.onLeave?.(room, me); social.forget(room, me);
    } else if (action === 'addBot') {
      host(); need(['lobby', 'finished'].includes(room.phase), 409, 'Add bots before the game starts.');
      need(present(room).length < cfg.max, 409, 'This room has ' + cfg.max + ' players.');
      const taken = new Set(room.players.map((p) => p.name.replace(/ \[Bot\]$/, '').toLowerCase())), free = BOT_NAMES.filter((n) => !taken.has(n.toLowerCase()));
      const name = (free.length ? free[crypto.randomInt(free.length)] : 'Bot ' + (room.players.length + 1)) + ' [Bot]';
      room.players.push({ id: crypto.randomUUID(), name, tokenHash: hash(secret()), bot: true });
    } else if (action === 'removeBot') {
      host(); need(['lobby', 'finished'].includes(room.phase), 409, 'Remove bots before the game starts.');
      const bots = room.players.filter((p) => p.bot); need(bots.length, 409, 'There are no bots to remove.');
      room.players = room.players.filter((p) => p.id !== bots.at(-1).id);
    } else if (social.ACTIONS.includes(action)) {
      await social.act(room, me, body, action === 'relink' ? await P.identify(req) : undefined);
    } else {
      cfg.actions[action](room, me, body, { host });
    }
    cfg.tick?.(room); await payout();
    room.receipts = [...(room.receipts || []), { pid: me.id, id: body.requestId, fingerprint }].slice(-100);
    await store.save(room); return respond(room, me);
  }
  async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      need(['GET', 'POST'].includes(req.method), 405, 'Method not allowed.');
      const body = req.method === 'GET' ? { ...req.query, tok: req.headers?.['x-tok'] } : typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      if (req.method === 'POST') {
        need(typeof body.requestId === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId), 400, 'Please refresh and try again.');
        if (['create', 'join'].includes(body.action)) await store.rateLimit(req.headers?.['x-forwarded-for'] || 'local');
      }
      let result;
      for (let i = 0; i < 8; i++) { try { result = await execute(req, body); break; } catch (error) { if (!(error instanceof Conflict) || i === 7) throw error; await new Promise((resolve) => setTimeout(resolve, 5 + crypto.randomInt(35) + i * 12)); } }
      res.status(200).json(result);
    } catch (error) {
      const status = error instanceof Conflict ? 503 : error instanceof SyntaxError ? 400 : error.status || 500;
      if (status === 500) console.error(error);
      res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : error.message });
    }
  }
  return { handler, view, store, need, present };
}
module.exports = { createRoomApi, need, present, shuffle: (a) => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; } };







