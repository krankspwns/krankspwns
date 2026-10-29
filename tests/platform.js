// Accounts, WP wallets, guest rooms, emotes and PDPA rights (memory store; no network).
const assert = require('node:assert/strict');
process.env.GOOGLE_CLIENT_ID = 'test-google'; process.env.APPLE_CLIENT_ID = 'test-apple'; process.env.ACCOUNT_PEPPER = 'test-pepper';
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.KV_REST_API_URL;
const P = require('../lib/platform');
const platform = require('../api/platform');
const hotJoker = require('../api/hot-joker');
const bridge = require('../api/bridge');
const { randomUUID } = require('node:crypto');

// fake Google / Apple: the "ID token" is just the user's id
P.verifiers.google = async (t) => { if (!t.startsWith('g-')) throw Object.assign(Error('bad'), { status: 401 }); return { sub: t }; };
P.verifiers.apple = async (t) => ({ sub: t });

function call(handler, method, body, headers = {}, query = {}) {
  return new Promise((resolve) => {
    const out = { headers: {} };
    const res = { setHeader: (k, v) => { out.headers[k.toLowerCase()] = v; }, status(c) { out.s = c; return this; }, json(j) { out.j = j; resolve(out); } };
    handler({ method, body, headers: { host: 'x.test', ...headers }, query }, res);
  });
}
const rid = () => randomUUID().replace(/-/g, '');
const post = (body, cookie, extra = {}) => call(platform, 'POST', { requestId: rid(), ...body }, { 'x-kp': '1', ...(cookie ? { cookie } : {}), ...extra });
const cookieOf = (r) => String(r.headers['set-cookie'] || '').split(';')[0];
async function signIn(sub, provider = 'google', consent = { accepted: true, age: true, version: P.CONSENT_VERSION }) {
  const n = (await post({ action: 'nonce' })).j.nonce;
  return post({ action: 'login', provider, idToken: sub, nonce: n, consent });
}

(async () => {
  // config and CSRF
  assert.equal((await call(platform, 'GET', null)).j.config.enabled, true);
  assert.equal((await call(platform, 'POST', { action: 'nonce' }, {})).s, 403, 'state changes need the custom header');
  assert.equal((await call(platform, 'POST', { action: 'nonce' }, { 'x-kp': '1', origin: 'https://evil.test' })).s, 403, 'cross-site origin is refused');

  // login needs consent for a new account, a fresh nonce, and a valid token
  let r = await signIn('g-ann', 'google', null); assert.equal(r.s, 428); assert.equal(r.j.needConsent, true);
  r = await signIn('g-ann', 'google', { accepted: true, age: false, version: P.CONSENT_VERSION }); assert.equal(r.s, 428, 'age confirmation is required');
  r = await post({ action: 'login', provider: 'google', idToken: 'g-ann', nonce: 'never-issued', consent: { accepted: true, age: true, version: P.CONSENT_VERSION } }); assert.equal(r.s, 401, 'unknown nonce');
  r = await signIn('bad-token'); assert.equal(r.s, 401);
  r = await signIn('g-ann'); assert.equal(r.s, 200); assert.equal(r.j.created, true);
  const ck = r.headers['set-cookie']; assert.match(ck, /HttpOnly/); assert.match(ck, /SameSite=Strict/); assert.ok(!/ann/.test(ck));
  const ann = cookieOf(r); assert.equal(r.j.account.pts, 25, 'welcome WP');
  const again = await signIn('g-ann', 'google', null); assert.equal(again.s, 200, 'existing accounts sign in without re-consenting'); assert.equal(again.j.created, false);
  assert.equal((await call(platform, 'GET', null, { cookie: ann })).j.account.id, r.j.account.id);
  assert.equal((await call(platform, 'GET', null, { cookie: 'kp_session=forged' })).j.account, null);
  // a nonce works once
  const n = (await post({ action: 'nonce' })).j.nonce;
  const ok1 = await post({ action: 'login', provider: 'apple', idToken: 'a-bob', nonce: n, consent: { accepted: true, age: true, version: P.CONSENT_VERSION } });
  const replay = await post({ action: 'login', provider: 'apple', idToken: 'a-bob', nonce: n }); assert.equal(ok1.s, 200); assert.equal(replay.s, 401, 'a nonce cannot be replayed');
  const bob = cookieOf(ok1);
  // provider ids are stored only as keyed hashes
  const stored = JSON.stringify([...globalThis.__kvMemory.values()]); assert.ok(!stored.includes('g-ann') && !stored.includes('a-bob'), 'raw provider ids are never stored');

  // shop: buy once per request, equip, unowned items refused
  let req = rid();
  r = await call(platform, 'POST', { action: 'buy', kind: 'bd', key: 'silver', requestId: req }, { 'x-kp': '1', cookie: ann }); assert.equal(r.j.account.pts, 10);
  r = await call(platform, 'POST', { action: 'buy', kind: 'bd', key: 'silver', requestId: req }, { 'x-kp': '1', cookie: ann }); assert.equal(r.j.account.pts, 10, 'the same request never charges twice');
  assert.equal((await post({ action: 'buy', kind: 'bd', key: 'gold' }, ann)).s, 409, 'not enough WP');
  assert.equal((await post({ action: 'equip', kind: 'bd', key: 'fire' }, ann)).s, 409, 'cannot wear what you do not own');
  assert.equal((await post({ action: 'equip', kind: 'bd', key: 'silver' }, ann)).j.account.eq.bd, 'silver');
  assert.equal((await post({ action: 'buy', kind: 'bd', key: 'silver' }, null)).s, 401, 'sign in required');

  // a room with two signed-in players and one guest: Last Laugh
  const hj = (b, h = {}, q) => call(hotJoker, q ? 'GET' : 'POST', q ? null : { requestId: rid(), ...b }, h, q);
  let host = (await hj({ action: 'create', name: 'Ann' }, { cookie: ann })).j; assert.equal(host.social.wallet.account, true); assert.equal(host.social.cos[host.meId].bd, 'silver', 'equipped border follows the account');
  const bobJ = (await hj({ action: 'join', name: 'Bob', code: host.code }, { cookie: bob })).j;
  const guest = (await hj({ action: 'join', name: 'Gus', code: host.code })).j;
  assert.equal(guest.social.wallet.account, false); assert.equal(guest.social.wallet.pts, 25, 'guests start with room WP');
  const own = { Ann: host, Bob: bobJ, Gus: guest }; const seat = (n) => ({ pid: own[n].meId, tok: own[n].tok, code: host.code });
  // guest shopping is local to the room
  r = (await hj({ action: 'buy', kind: 'bd', key: 'silver', match: 0, ...seat('Gus') })).j; assert.equal(r.social.wallet.pts, 10);
  r = (await hj({ action: 'equip', kind: 'bd', key: 'silver', match: 0, ...seat('Gus') })).j; assert.equal(r.social.cos[guest.meId].bd, 'silver');
  // emotes and gifts reach everyone
  r = (await hj({ action: 'emote', e: 'gg', match: 0, ...seat('Gus') })).j; assert.ok(r.social.feed.some((f) => f.k === 'gg'));
  assert.equal((await hj({ action: 'emote', e: 'nope', match: 0, ...seat('Gus') })).s, 400);
  assert.equal((await hj({ action: 'throw', item: 'rose', target: host.meId, match: 0, ...seat('Gus') })).s, 409, 'no gifts yet');
  await hj({ action: 'buy', kind: 'gift', key: 'tomato', match: 0, ...seat('Ann') }); // 25 - 15 (silver) = 10 WP: a tomato costs 10
  r = (await hj({ action: 'throw', item: 'tomato', target: bobJ.meId, match: 0, ...seat('Ann') })).j; assert.ok(r.social.feed.some((f) => f.t === 'g' && f.to === bobJ.meId)); assert.equal(r.social.wallet.gifts.tomato, 2);
  // play a game to the end: first out wins WP. Everyone plays on autopilot by letting turns expire.
  const start = (await hj({ action: 'start', match: 0, ...seat('Ann') })); assert.equal(start.s, 200);
  const rules = require('../lib/hot-joker-rules');
  const rooms = globalThis.__roomStoreRooms['hot-joker']; const room = rooms.get(host.code);
  // finish the game directly in the stored room, then let the next request settle it
  room.phase = 'finished'; room.placed = [bobJ.meId, host.meId, guest.meId]; room.loser = null; rooms.set(host.code, room);
  void rules;
  r = (await hj(null, { 'x-tok': host.tok }, { code: host.code, pid: host.meId })).j;
  assert.equal(r.social.awards.wp[bobJ.meId], 10, 'first place of three');
  assert.ok(r.social.awards.wp[host.meId] > 0);
  const paid = await call(platform, 'GET', null, { cookie: bob }); assert.ok(paid.j.account.pts > 25, 'signed-in winner is paid into the account');
  const guestState = (await hj(null, { 'x-tok': guest.tok }, { code: host.code, pid: guest.meId })).j; assert.equal(guestState.social.wallet.account, false);
  const total = (await hj(null, { 'x-tok': guest.tok }, { code: host.code, pid: guest.meId })).j; assert.equal(total.social.awards.match, 1, 'one payout per match');
  const ptsAfter = (await call(platform, 'GET', null, { cookie: bob })).j.account.pts;
  await hj(null, { 'x-tok': host.tok }, { code: host.code, pid: host.meId });
  assert.equal((await call(platform, 'GET', null, { cookie: bob })).j.account.pts, ptsAfter, 'never paid twice');
  // a guest who leaves loses their room wallet
  await hj({ action: 'leave', ...seat('Gus'), match: 1 });
  // solo with bots earns nothing
  const solo = (await hj({ action: 'create', name: 'Solo' }, { cookie: bob })).j; await hj({ action: 'addBot', match: 0, pid: solo.meId, tok: solo.tok, code: solo.code }); await hj({ action: 'addBot', match: 0, pid: solo.meId, tok: solo.tok, code: solo.code });
  // bridge also carries the platform
  const bh = (await call(bridge, 'POST', { requestId: rid(), action: 'create', name: 'Br' }, { cookie: ann })).j; assert.equal(bh.social.wallet.account, true);

  // daily cap on earnings
  const user = await P.getUser((await call(platform, 'GET', null, { cookie: ann })).j.account.id);
  for (let i = 0; i < 60; i++) await P.earn(user.id, 20, 'cap:' + i);
  const capped = await P.getUser(user.id); assert.ok(capped.earn.n <= P.DAILY_EARN_CAP, 'daily earning cap'); assert.ok(capped.pts <= 10 + P.DAILY_EARN_CAP + 25);

  // PDPA: export, then delete everything
  r = await post({ action: 'export' }, ann); assert.equal(r.s, 200); assert.ok(r.j.account.pts >= 0); assert.ok(!('ix' in r.j.account) && !r.j.account.sessions);
  assert.equal((await post({ action: 'delete', confirm: 'no' }, ann)).s, 400);
  r = await post({ action: 'delete', confirm: 'DELETE' }, ann); assert.equal(r.s, 200); assert.match(r.headers['set-cookie'], /Max-Age=0/);
  assert.equal((await call(platform, 'GET', null, { cookie: ann })).j.account, null, 'session is gone');
  assert.equal((await post({ action: 'buy', kind: 'bd', key: 'gold' }, ann)).s, 401);
  r = await signIn('g-ann', 'google', null); assert.equal(r.s, 428, 'the old account no longer exists: consent is asked again');
  // sign out
  assert.equal((await post({ action: 'logout' }, bob)).s, 200); assert.equal((await call(platform, 'GET', null, { cookie: bob })).j.account, null);
  console.log('Accounts: Google/Apple sign-in, consent, nonces, sessions, CSRF, WP wallet, shop, guest rooms, awards, daily cap, export and delete passed');
})().catch((e) => { console.error(e); process.exit(1); });

