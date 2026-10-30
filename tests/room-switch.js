const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const loadHandlers = () => Object.fromEntries(['reckoning', 'last-train', 'bridge', 'hot-joker', 'grand-con', 'grand-heist'].map(g => [g, require('../api/' + (g === 'reckoning' ? 'game' : g))]));
let handlers, backend;
async function call(game, body, method = 'POST', headers = {}) {
  let result, status, outHeaders = {};
  const req = { method, body: { requestId: crypto.randomUUID(), ...body }, query: body, headers: { host: 'x.test', 'x-kp': '1', ...(method === 'GET' ? { 'x-tok': body.tok } : {}), ...headers }, url: '/api/' + game };
  const res = { setHeader(k, v) { outHeaders[k.toLowerCase()] = v; }, status(n) { status = n; return this; }, json(j) { result = j; } };
  await (game === 'platform' ? require('../api/platform') : handlers[game])(req, res); return { status, data: result, headers: outHeaders };
}
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const seat = (data, previous) => ({ code: data.code, pid: data.meId, tok: data.tok || previous?.tok });
async function create(game, count = 2) {
  const state = ok(await call(game, { action: 'create', name: 'Host' })), seats = [seat(state)];
  for (let i = 1; i < count; i++) seats.push(seat(ok(await call(game, { action: 'join', code: state.code, name: 'Friend' + i }))));
  return { seats, state: ok(await call(game, seats[0], 'GET')) };
}
async function main() {
  // Every directed pair uses the real destination state API, not just a migration helper.
  for (const from of Object.keys(handlers)) for (const to of Object.keys(handlers)) {
    if (from === to) continue;
    const { seats, state } = await create(from);
    const move = ok(await call(from, { ...seats[0], action: 'switchGame', version: state.version, game: to }));
    assert.equal(move.roomSwitch.game, to);
    assert.deepEqual(Object.keys(move), ['roomSwitch']); // no old roles, hands or other players' secrets
    for (const s of seats) {
      const old = ok(await call(from, s, 'GET')); assert.deepEqual(old.roomSwitch, { ...move.roomSwitch, pid: s.pid });
      const next = ok(await call(to, { ...s, code: move.roomSwitch.code }, 'GET'));
      assert.equal(next.phase, 'lobby'); assert.equal(next.hostId, seats[0].pid); assert.equal(next.meId, s.pid);
      assert.deepEqual(next.players.map(p => p.id), seats.map(p => p.pid));
      assert.equal(next.players.find(p => p.id === s.pid).name, s.pid === seats[0].pid ? 'Host' : 'Friend1');
    }
    const initial = ok(await call(to, { ...seats[0], code: move.roomSwitch.code }, 'GET'));
    const balance = initial.wallet?.pts ?? initial.social?.wallet?.pts ?? initial.me?.wallet?.wp;
    assert.equal(balance, 25, 'guest WP preserved in ' + to);
    const min = require('../lib/room-switch').GAMES[to].min;
    for (let i = 2; i < min; i++) ok(await call(to, { action: 'join', code: move.roomSwitch.code, name: 'Extra' + i }));
    const begun = ok(await call(to, { ...seats[0], code: move.roomSwitch.code, action: to === 'reckoning' ? 'deal' : 'start', match: 0, round: 0, step: 0 }));
    assert.notEqual(begun.phase, 'lobby', 'destination can actually start: ' + to);
    const retry = ok(await call(from, { ...seats[0], action: 'switchGame', version: state.version, game: to })); assert.deepEqual(retry, move);
    const delayed = ok(await call(from, { ...seats[1], action: 'leave' })); assert.equal(delayed.roomSwitch.game, to);
    assert.equal((await call(from, { ...seats[0], tok: 'wrong' }, 'GET')).status, 403);
  }
  const { seats, state } = await create('hot-joker', 5);
  const request = { ...seats[0], action: 'switchGame', version: state.version, game: 'bridge' };
  assert.equal((await call('hot-joker', request)).status, 409); // never truncate to four seats
  assert.equal((await call('hot-joker', { ...request, ...seats[1], game: 'grand-con' })).status, 403);
  assert.equal((await call('hot-joker', { ...request, game: 'missing' })).status, 400);
  assert.equal((await call('hot-joker', { ...request, version: 0, game: 'grand-con' })).status, 409);
  const started = ok(await call('hot-joker', { ...seats[0], action: 'start', match: state.match }));
  assert.equal((await call('hot-joker', { ...request, version: started.version, game: 'grand-con' })).status, 409);
  const switched = ok(await call('hot-joker', { ...request, version: started.version, game: 'grand-con', confirm: true }));
  const next = ok(await call('grand-con', { ...seats[0], code: switched.roomSwitch.code }, 'GET'));
  assert.equal(next.me.team, null); assert.equal(next.history.length, 0);
  // Race two different switch choices: one destination, one frozen source, no split party.
  const race = await create('bridge');
  const results = await Promise.all(['hot-joker', 'last-train'].map(game => call('bridge', { ...race.seats[0], action: 'switchGame', version: race.state.version, game })));
  const moves = results.filter(r => r.status === 200).map(r => r.data.roomSwitch);
  assert(moves.length); for (const m of moves) assert.deepEqual(m, moves[0]);
  // Round trip reserves a new code instead of overwriting a frozen room (or creating redirect loops).
  const first = moves[0], fresh = ok(await call(first.game, { ...race.seats[0], code: first.code }, 'GET'));
  const back = ok(await call(first.game, { ...race.seats[0], code: first.code, action: 'switchGame', version: fresh.version, game: 'bridge' }));
  assert.notEqual(back.roomSwitch.code, race.seats[0].code);
  // A lone human and bots cannot pretend to be a party; bots move with their party once another human has joined.
  const solo = await create('bridge', 1);
  assert.equal((await call('bridge', { ...solo.seats[0], action: 'switchGame', version: solo.state.version, game: 'last-train' })).status, 409);
  const bot = ok(await call('bridge', { ...solo.seats[0], action: 'addBot', match: 0 }));
  assert.equal((await call('bridge', { ...solo.seats[0], action: 'switchGame', version: bot.version, game: 'hot-joker' })).status, 409);
  const botParty = await create('bridge');
  const withBot = ok(await call('bridge', { ...botParty.seats[0], action: 'addBot', match: 0 }));
  const supported = await call('bridge', { ...botParty.seats[0], action: 'switchGame', game: 'last-train', version: withBot.version });
  const moved=ok(supported);const destination=ok(await call('last-train',{...botParty.seats[0],code:moved.roomSwitch.code},'GET'));
  assert.equal(destination.players.filter(p=>p.bot).length,1);
  const betting = await create('last-train');
  const trainStore = require('../lib/last-train-store'), pending = await trainStore.load(betting.state.code);
  pending.bets = { [betting.seats[1].pid]: { stake: 5 } }; await trainStore.save(pending);
  const blocked = await call('last-train', { ...betting.seats[0], action: 'switchGame', game: 'bridge', version: pending.version });
  assert.equal(blocked.status, 409); assert.match(blocked.data.error, /bet/);
  // Guest money and cosmetics survive crossing both wallet implementations.
  const walletRoom = await create('bridge'); let walletSeat = walletRoom.seats[0];
  ok(await call('bridge', { ...walletSeat, action: 'buy', kind: 'gift', key: 'rose', match: 0 }));
  ok(await call('bridge', { ...walletSeat, action: 'equip', kind: 'av', key: 'fox', match: 0 }));
  let sourceGame = 'bridge';
  for (const target of ['last-train', 'reckoning', 'grand-con']) {
    const st = ok(await call(sourceGame, walletSeat, 'GET'));
    const moved = ok(await call(sourceGame, { ...walletSeat, action: 'switchGame', version: st.version, game: target }));
    walletSeat = { ...walletSeat, code: moved.roomSwitch.code };
    const st2 = ok(await call(target, walletSeat, 'GET'));
    assert.equal(st2.wallet?.pts ?? st2.social?.wallet?.pts ?? st2.me?.wallet?.wp, 15);
    assert.equal((st2.wallet || st2.social?.wallet || st2.me?.wallet).gifts.rose, 3);
    if (target === 'reckoning') assert.equal(st2.players.find(p => p.id === walletSeat.pid).avatar, 'fox');
    sourceGame = target;
  }
  // Recovering after a switch rotates the only valid token; an old device cannot switch the room.
  const beforeRecovery = ok(await call(sourceGame, walletSeat, 'GET'));
  const restored = ok(await call(sourceGame, { action: 'join', code: walletSeat.code, name: 'Host', recoveryCode: beforeRecovery.recoveryCode || beforeRecovery.me.recoveryCode }));
  assert.notEqual(restored.tok, walletSeat.tok);
  assert.equal((await call(sourceGame, { ...walletSeat, action: 'switchGame', game: 'bridge', version: restored.version })).status, 403);
  walletSeat = seat(restored);
  ok(await call(sourceGame, { ...walletSeat, action: 'switchGame', game: 'reckoning', version: restored.version }));
  // Observers move too; departed/kicked travellers do not reappear in the destination.
  const train = await create('last-train', 5);
  ok(await call('last-train', { ...train.seats[0], action: 'start', match: 0, round: 0, step: 0 }));
  const observer = ok(await call('last-train', { action: 'join', code: train.state.code, name: 'Observer' }));
  ok(await call('last-train', { ...train.seats[0], action: 'kick', targetId: train.seats[4].pid }));
  const trainNow = ok(await call('last-train', train.seats[0], 'GET'));
  const fullParty = ok(await call('last-train', { ...train.seats[0], action: 'switchGame', game: 'hot-joker', version: trainNow.version, confirm: true }));
  const audience = ok(await call('hot-joker', { code: fullParty.roomSwitch.code, pid: observer.meId, tok: observer.tok }, 'GET'));
  assert.equal(audience.players.length, 5); assert(audience.players.some(p => p.id === observer.meId));
  assert(!audience.players.some(p => p.id === train.seats[4].pid));
  // Signed-in wallets remain account-backed, with no new guest allowance on migration.
  const P = require('../lib/platform'); P.verifiers.google = async sub => ({ sub });
  const nonce = ok(await call('platform', { action: 'nonce' })).nonce;
  const login = await call('platform', { action: 'login', provider: 'google', idToken: 'switch-owner', nonce, consent: { accepted: true, age: true, version: P.CONSENT_VERSION } });
  ok(login); const cookie = String(login.headers['set-cookie']).split(';')[0];
  const signed = ok(await call('bridge', { action: 'create', name: 'Member' }, 'POST', { cookie }));
  const signedSeat = seat(signed); ok(await call('bridge', { action: 'join', code: signed.code, name: 'Guest' }));
  let signedGame = 'bridge', signedOwner = signedSeat;
  for (const target of ['reckoning', 'last-train', 'grand-con']) {
    const st = ok(await call(signedGame, signedOwner, 'GET'));
    const moved = ok(await call(signedGame, { ...signedOwner, action: 'switchGame', game: target, version: st.version }));
    signedOwner = { ...signedOwner, code: moved.roomSwitch.code };
    const st2 = ok(await call(target, signedOwner, 'GET'));
    if (target !== 'last-train') assert.equal((st2.wallet || st2.social?.wallet).account, true);
    assert.equal(st2.wallet?.pts ?? st2.social?.wallet?.pts ?? st2.me?.wallet?.wp, signed.social.wallet.pts);
    const rejoined = ok(await call(target, { action: 'join', code: signedOwner.code, name: 'Member' }, 'POST', { cookie }));
    assert.equal(rejoined.meId, signedOwner.pid); signedOwner = seat(rejoined);
    signedGame = target;
  }
  if (backend) {
    const uncertain = await create('reckoning');
    const payload = { ...uncertain.seats[0], action: 'switchGame', version: uncertain.state.version, game: 'last-train' };
    backend.fault.dropNextWrite = true;
    assert.equal((await call('reckoning', payload)).status, 503, 'committed switch response lost');
    const recovered = ok(await call('reckoning', payload));
    assert.equal(recovered.roomSwitch.game, 'last-train');
    const source = JSON.parse(await backend.client.get('room:' + uncertain.seats[0].code));
    const dest = JSON.parse(await backend.client.get('last-train:room:' + recovered.roomSwitch.code));
    assert.deepEqual(dest.players.map(p => p.id), uncertain.seats.map(s => s.pid));
    assert.equal(source.switchedTo.code, dest.code);
    assert(await backend.client.ttl('last-train:room:' + dest.code) > 43000);
    const outage = await create('grand-con'); backend.fault.unavailable = true;
    assert.equal((await call('grand-con', { ...outage.seats[0], action: 'switchGame', version: outage.state.version, game: 'bridge' })).status, 503);
    backend.fault.unavailable = false;
    assert.equal(ok(await call('grand-con', outage.seats[0], 'GET')).phase, 'lobby');
  }
  console.log('Room switch: all 30 game pairs, permissions, capacity, confirmation, retries, stale actions and races passed.');
}
(async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-switch'; process.env.ACCOUNT_PEPPER = 'test-switch';
  if (process.argv.includes('--redis')) {
    backend = await require('./helpers').startRedis();
    process.env.UPSTASH_REDIS_REST_URL = backend.url; process.env.UPSTASH_REDIS_REST_TOKEN = 'local-test';
  }
  try { handlers = loadHandlers(); await main(); } finally { await backend?.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
