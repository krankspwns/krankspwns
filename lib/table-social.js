// Room-side glue between a game room and the platform: who is signed in, WP wallets, cosmetics, emotes, gifts and
// WP awards. Every game keeps its own room object; this module adds one `room.social` block to it.
//
//  - A signed-in player's WP, avatars, borders and gifts live in their account and follow them to every game.
//  - A guest's WP and purchases live only in this room (room.social.guest) and vanish with the room.
const crypto = require('node:crypto');
const P = require('./platform');
const C = require('./catalog');

const MIN_HUMANS_FOR_WP = 2;   // a table of one person and bots earns nothing: no farming WP alone
const FEED_MS = 12000, FEED_MAX = 24, EMOTE_GAP_MS = 700;
const need = (ok, status, message) => { if (!ok) throw Object.assign(Error(message), { status }); };
const social = (room) => (room.social ||= { n: 0, feed: [], guest: {}, acct: {}, eq: {}, paid: {}, awards: null });
const defaultAvatar = (pid) => C.AVATARS[parseInt(crypto.createHash('sha256').update(String(pid)).digest('hex').slice(0, 6), 16) % C.AVATARS.length];
const guestWallet = (s, pid) => (s.guest[pid] ||= C.emptyWallet(C.START_WP));

// called when a player takes a seat (create / join / rejoin). uid is the signed-in account, or null for a guest.
async function link(room, p, uid) {
  const s = social(room);
  if (p.bot) return;
  if (uid) {
    const user = await P.getUser(uid);
    if (user) { s.acct[p.id] = uid; delete s.guest[p.id]; s.eq[p.id] = { ...user.eq }; return; }
  }
  if (s.acct[p.id] && !uid) return;   // a seat that belongs to an account stays with it when the code is used elsewhere
  guestWallet(s, p.id); s.eq[p.id] ||= { av: '', bd: '', acc: '' };
}
const accountOf = (room, pid) => social(room).acct[pid] || null;
async function walletOf(room, pid) {
  const s = social(room), uid = s.acct[pid];
  if (uid) { const u = await P.getUser(uid); if (u) return { ...P.walletOf(u), account: true }; }
  return { ...guestWallet(s, pid), account: false };
}
const cosmetics = (room) => {
  const s = social(room), out = {};
  for (const p of room.players) if (!p.bot) { const e = s.eq[p.id] || {}; out[p.id] = { av: e.av || defaultAvatar(p.id), bd: e.bd || '', acc: e.acc || '', member: !!s.acct[p.id] }; }
  return out;
};
async function view(room, me) {
  const s = social(room), now = Date.now();
  return { social: {
    n: s.n, feed: s.feed.filter((x) => now - x.at < FEED_MS), cos: cosmetics(room), wallet: await walletOf(room, me.id), awards: s.awards,
    prices: { av: C.PREMIUM, bd: C.BORDER_PRICE, acc: C.ACC_PRICE, gift: C.GIFTS, uses: C.GIFT_USES, avatars: C.AVATARS }, emotes: C.EMOTES, dailyCap: P.DAILY_EARN_CAP,
  } };
}
const push = (s, item) => { s.feed = [...s.feed.filter((x) => Date.now() - x.at < FEED_MS), { n: ++s.n, at: Date.now(), ...item }].slice(-FEED_MAX); };

const ACTIONS = ['emote', 'throw', 'buy', 'equip'];
async function act(room, me, body) {
  const s = social(room), uid = s.acct[me.id], id = typeof body.requestId === 'string' ? body.requestId : null;
  if (body.action === 'emote') {
    need(C.EMOTES.includes(body.e), 400, 'Unknown reaction.');
    if (s.feed.some((x) => x.id === me.id && x.t === 'e' && Date.now() - x.at < EMOTE_GAP_MS)) return;   // too fast: ignore
    push(s, { t: 'e', id: me.id, k: body.e }); return;
  }
  if (body.action === 'throw') {
    const target = String(body.target || '');
    need(C.own(C.GIFTS, body.item), 400, 'Unknown gift.');
    need(target !== me.id && room.players.some((p) => p.id === target && !p.departed), 400, 'Pick another player.');
    if (s.feed.some((x) => x.id === me.id && x.t === 'g' && Date.now() - x.at < 1500)) throw Object.assign(Error('Easy there, wait a moment.'), { status: 429 });
    if (uid) await P.useGift(uid, body.item, id); else C.useGiftFrom(guestWallet(s, me.id), body.item);
    push(s, { t: 'g', id: me.id, k: body.item, to: target }); return;
  }
  if (body.action === 'buy') {
    if (uid) await P.buy(uid, String(body.kind), String(body.key), id); else C.buyInto(guestWallet(s, me.id), String(body.kind), String(body.key));
    return;
  }
  if (body.action === 'equip') {
    const kind = String(body.kind), key = body.key === undefined || body.key === null ? '' : String(body.key);
    const w = uid ? P.walletOf(await P.equip(uid, kind, key, id)) : C.equipInto(guestWallet(s, me.id), kind, key);
    s.eq[me.id] = { ...w.eq }; return;
  }
  need(false, 400, 'Unknown action.');
}

// Award WP when a game ends. `places` lists the players best first: [{ id, place }] (ties share a place).
// Each match pays once. Needs two or more people at the table; bots never earn.
async function settle(room, game, places) {
  const s = social(room), match = room.match || 0;
  if (s.paid[match]) return false;
  s.paid[match] = true; s.paid = Object.fromEntries(Object.entries(s.paid).slice(-6));
  const humans = room.players.filter((p) => !p.bot && !p.departed);
  s.awards = { match, wp: {}, note: '' };
  if (humans.length < MIN_HUMANS_FOR_WP) { s.awards.note = 'solo'; return true; }
  const pay = C.placeWpFor(room.players.length);
  for (const { id, place } of places) {
    const p = room.players.find((q) => q.id === id), amount = pay[place - 1] || 0;
    if (!p || p.bot || !amount) continue;
    const uid = s.acct[id];
    if (uid) { try { await P.earn(uid, amount, `${game}:${room.code}:${match}:${id}`); } catch (e) { if (e.status !== 404) throw e; } }
    else guestWallet(s, id).pts += amount;
    s.awards.wp[id] = amount;
  }
  return true;
}
// leaving a room on purpose drops a guest's WP and purchases with it (they were only ever kept for this room)
function forget(room, me) {
  const s = social(room);
  if (!s.acct[me.id]) { delete s.guest[me.id]; delete s.eq[me.id]; }
}
module.exports = { social, link, forget, accountOf, walletOf, view, act, settle, ACTIONS, MIN_HUMANS_FOR_WP, defaultAvatar, cosmetics };


