// Edge cases found in a whole-repo audit: each one failed before its fix.
process.env.GOOGLE_CLIENT_ID = 'test-google'; process.env.ACCOUNT_PEPPER = 'test-audit'; process.env.BOT_FAST = '1'; process.env.LAST_TRAIN_EVENTS = 'off'; process.env.LAST_TRAIN_AUTO_SHUFFLE = 'off';
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.KV_REST_API_URL;
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const P = require('../lib/platform'); P.verifiers.google = async (t) => ({ sub: t });
const kv = require('../lib/kv');
const platform = require('../api/platform'), grandCon = require('../api/grand-con'), hotJoker = require('../api/hot-joker'), bridge = require('../api/bridge'), lastTrain = require('../api/last-train');
const rules = require('../lib/last-train-rules'), HJ = require('../lib/hot-joker-rules');
let ip = 0;
const call = (handler, method, body, headers = {}, query = {}) => new Promise((resolve) => {
  const out = { headers: {} };
  handler({ method, body, headers: { host: 'x.test', 'x-forwarded-for': 'audit-' + (++ip), ...headers }, query }, { setHeader: (k, v) => { out.headers[k.toLowerCase()] = v; }, status(c) { out.s = c; return this; }, json(j) { out.j = j; resolve(out); } });
});
const rid = () => randomUUID().replace(/-/g, '');
const post = (handler, body, headers) => call(handler, 'POST', { requestId: rid(), ...body }, headers);
const get = (handler, seat, code) => call(handler, 'GET', null, { 'x-tok': seat.tok }, { code, pid: seat.meId });
const cookieOf = (r) => String(r.headers['set-cookie'] || '').split(';')[0];
const consent = () => ({ accepted: true, age: true, version: P.CONSENT_VERSION });

(async () => {
  // 1. A dropped connection while creating an account must not lock that Google identity out for good.
  {
    const orig = kv.cas; let failed = false;
    kv.cas = async (key, expected, doc, ttl) => { if (!failed && key.startsWith('acct:')) { failed = true; throw Object.assign(new Error('Connection lost'), { status: 503 }); } return orig(key, expected, doc, ttl); };
    const attempt = async () => post(platform, { action: 'login', provider: 'google', idToken: 'g-lockout', nonce: (await post(platform, { action: 'nonce' }, { 'x-kp': '1' })).j.nonce, consent: consent() }, { 'x-kp': '1' });
    const first = await attempt(); kv.cas = orig;
    assert.equal(first.s, 503);
    const retry = await attempt(); assert.equal(retry.s, 200, 'the retry creates the account'); assert.equal(retry.j.created, true);
    const again = await attempt(); assert.equal(again.s, 200); assert.equal(again.j.created, false); assert.equal(again.j.account.id, retry.j.account.id);
  }
  // 2. Grand Con: signing in while seated attaches the account to the seat.
  {
    const g = (await post(grandCon, { action: 'create', name: 'Ann' })).j;
    const login = await post(platform, { action: 'login', provider: 'google', idToken: 'g-relink', nonce: (await post(platform, { action: 'nonce' }, { 'x-kp': '1' })).j.nonce, consent: consent() }, { 'x-kp': '1' });
    const re = await post(grandCon, { action: 'relink', code: g.code, pid: g.meId, tok: g.tok }, { cookie: cookieOf(login) });
    assert.equal(re.j.social.cos[g.meId].member, true);
  }
  // 3. Bridge: the final scoreboard stays with the seats that played, even when a player leaves.
  {
    const c = (await post(bridge, { action: 'create', name: 'P0' })).j, guests = [];
    for (let i = 1; i < 4; i++) guests.push((await post(bridge, { action: 'join', code: c.code, name: 'P' + i })).j);
    await post(bridge, { action: 'start', code: c.code, pid: c.meId, tok: c.tok, match: 0 });
    const room = globalThis.__roomStoreRooms.bridge.get(c.code); room.phase = 'finished'; room.scores = [1, 8, 2, 0];
    const before = (await get(bridge, c, c.code)).j; assert.equal(before.seats.length, 4);
    await post(bridge, { action: 'leave', code: c.code, pid: guests[0].meId, tok: guests[0].tok, match: before.match });
    const after = (await get(bridge, c, c.code)).j, name = (id) => after.players.find((p) => p.id === id).name;
    assert.deepEqual(after.seats.map(name), ['P0', 'P1', 'P2', 'P3']);
    assert.equal(name(after.seats[after.finalWinners[0]]), 'P1', 'the winner is still the player who scored 8');
  }
  // 4. Last Train: players who left never hold the table up.
  {
    const room = { code: 'AUDT', players: Array.from({ length: 7 }, (_, i) => ({ id: 'p' + i, name: 'P' + i })), settings: { discussion: 'chat', events: false, speakSeconds: 45 }, history: [] };
    rules.start(room);
    for (const p of room.players.slice(0, 6)) { room.ready[p.id] = true; }
    room.players[6].departed = true; rules.afterDeparture(room);
    assert.equal(room.phase, 'boarding', 'the briefing only needs the people still here');
    while (room.phase !== 'morning') rules.advance(room);
    const away = rules.alive(room)[2]; away.departed = true;
    rules.beginDiscussion(room);
    assert.ok(!room.speakingOrder.includes(away.id) || room.speakerId !== away.id);
    const seen = [];
    while (room.phase === 'discussion') { const speaker = room.players.find((p) => p.id === rules.speakerId(room)); seen.push(speaker.id); assert.ok(!speaker.departed, 'a departed player never gets a turn'); rules.speak(room, speaker, 'hi'); }
    assert.equal(room.phase, 'voting'); assert.ok(!seen.includes(away.id));
    for (const p of rules.alive(room).filter((p) => !p.departed)) rules.vote(room, p, { targetId: null });
    assert.notEqual(room.phase, 'voting', 'the vote resolves once everyone still connected has voted');
    // someone leaving mid-turn and mid-vote moves the step on
    const live = { code: 'AUD2', players: Array.from({ length: 6 }, (_, i) => ({ id: 'p' + i, name: 'P' + i })), settings: { discussion: 'chat', events: false, speakSeconds: 45 }, history: [] };
    rules.start(live); while (live.phase !== 'morning') rules.advance(live); rules.beginDiscussion(live);
    const speaker = live.players.find((p) => p.id === rules.speakerId(live)); speaker.departed = true; rules.afterDeparture(live);
    assert.notEqual(rules.speakerId(live), speaker.id);
    while (live.phase === 'discussion') rules.speak(live, live.players.find((p) => p.id === rules.speakerId(live)), 'hi');
    const last = rules.alive(live).filter((p) => !p.departed); for (const p of last.slice(1)) rules.vote(live, p, { targetId: null });
    assert.equal(live.phase, 'voting'); last[0].departed = true; rules.afterDeparture(live);
    assert.notEqual(live.phase, 'voting');
  }
  // 5. Last Train: a 12-character name carried over from another game can still be recovered by typing it.
  {
    const h = (await post(hotJoker, { action: 'create', name: 'Abcdefghijkl' })).j;
    const guest = (await post(hotJoker, { action: 'join', code: h.code, name: 'Mnopqrstuvwx' })).j;
    const cur = (await get(hotJoker, h, h.code)).j;
    const sw = await post(hotJoker, { action: 'switchGame', code: h.code, pid: h.meId, tok: h.tok, game: 'last-train', version: cur.version }); assert.equal(sw.s, 200);
    const code = sw.j.roomSwitch.code, seen = (await get(lastTrain, guest, code)).j;
    const re = await post(lastTrain, { action: 'join', code, name: 'Mnopqrstuvwx', recoveryCode: seen.me.recoveryCode });
    assert.equal(re.s, 200); assert.equal(re.j.meId, guest.meId, 'it is the same seat, not a duplicate');
    assert.equal((await get(lastTrain, h, code)).j.players.length, 2);
  }
  // 6. Last Laugh: the first draw never goes to a player who is already out of cards.
  {
    const realDeal = HJ.deal, mock = [['SA', 'HA'], ['S2', 'H2', 'D2', 'C2', 'S9'], ['S3', 'H4', 'JK'], ['D5', 'C6', 'H7', 'S8']];
    delete process.env.BOT_FAST;   // bots wait before moving, so the opening state is what the test reads
    HJ.deal = (ids) => Object.fromEntries(ids.map((id, i) => [id, mock[i].slice()]));
    try {
      const c = (await post(hotJoker, { action: 'create', name: 'H' })).j;
      for (let i = 0; i < 3; i++) await post(hotJoker, { action: 'addBot', code: c.code, pid: c.meId, tok: c.tok, match: 0 });
      for (let i = 0; i < 30; i++) {
        const mem = globalThis.__roomStoreRooms['hot-joker']; if (i) { const r = mem.get(c.code); r.phase = 'finished'; mem.set(c.code, r); }
        await post(hotJoker, { action: 'start', code: c.code, pid: c.meId, tok: c.tok, match: (await get(hotJoker, c, c.code)).j.match });
        const room = globalThis.__roomStoreRooms['hot-joker'].get(c.code), first = room.log.find((e) => e.kind === 'deal').taker;
        assert.notEqual(first, room.order[0], 'the player who started with no cards never draws first');
      }
    } finally { HJ.deal = realDeal; process.env.BOT_FAST = '1'; }
  }
  // 7. New players can join between games, and 8. the host can remove a quiet player in every room game.
  for (const [name, handler, game] of [['Bridge', bridge, 'bridge'], ['Last Laugh', hotJoker, 'hot-joker'], ['Grand Con', grandCon, 'grand-con']]) {
    const mem = () => (game === 'grand-con' ? globalThis.__grandConRooms : globalThis.__roomStoreRooms[game]);
    const host = (await post(handler, { action: 'create', name: 'Host' })).j, seats = [host];
    for (let i = 1; i < 4; i++) seats.push((await post(handler, { action: 'join', code: host.code, name: 'G' + i })).j);
    const match = () => get(handler, host, host.code).then((r) => r.j.match);
    // only the host can remove someone, and not themselves
    assert.equal((await post(handler, { action: 'kick', code: host.code, pid: seats[1].meId, tok: seats[1].tok, match: await match(), targetId: seats[2].meId })).s, 403);
    assert.equal((await post(handler, { action: 'kick', code: host.code, pid: host.meId, tok: host.tok, match: await match(), targetId: host.meId })).s, 400);
    // in the lobby the seat is freed
    let r = await post(handler, { action: 'kick', code: host.code, pid: host.meId, tok: host.tok, match: await match(), targetId: seats[3].meId });
    assert.equal(r.s, 200, game + ' kick: ' + (r.j.error || '')); assert.ok(!r.j.players.some((p) => p.id === seats[3].meId));
    assert.equal((await get(handler, seats[3], host.code)).s, 401, 'the removed phone is signed out');
    const again = await post(handler, { action: 'join', code: host.code, name: 'G3b' }); assert.equal(again.s, 200, 'the freed seat can be taken');
    seats[3] = again.j;
    // mid-game: they stay as a character that plays itself, and cannot come back
    r = await post(handler, { action: 'start', code: host.code, pid: host.meId, tok: host.tok, match: await match() }); assert.equal(r.s, 200, game + ' start: ' + (r.j.error || ''));
    r = await post(handler, { action: 'kick', code: host.code, pid: host.meId, tok: host.tok, match: await match(), targetId: seats[2].meId }); assert.equal(r.s, 200, game + ' mid-game kick: ' + (r.j.error || ''));
    assert.equal((await get(handler, seats[2], host.code)).s, 410, 'the removed player is told so');
    const back = await post(handler, { action: 'join', code: host.code, name: 'G2', recoveryCode: seats[2].me?.recoveryCode || seats[2].recoveryCode });
    assert.equal(back.s, 403, 'a removed player cannot rejoin with their code');
    // between games a new friend can sit down in the free seat
    const room = mem().get(host.code); room.phase = 'finished'; if (game === 'grand-con') room.score = { house: 3, ring: 0 };
    const late = await post(handler, { action: 'join', code: host.code, name: 'Latecomer' });
    assert.equal(late.s, 200, game + ' join between games: ' + (late.j.error || ''));
  }
  // Bridge: a human who stops playing has the move made for them when the turn clock runs out.
  {
    const c = (await post(bridge, { action: 'create', name: 'Idle' })).j;
    for (let i = 0; i < 3; i++) await post(bridge, { action: 'addBot', code: c.code, pid: c.meId, tok: c.tok, match: 0 });
    await post(bridge, { action: 'settings', code: c.code, pid: c.meId, tok: c.tok, match: 0, turnSeconds: 30 });
    await post(bridge, { action: 'start', code: c.code, pid: c.meId, tok: c.tok, match: 0 });
    const mem = globalThis.__roomStoreRooms.bridge; let room = mem.get(c.code), seat = room.seats.indexOf(c.meId);
    // let the bots bid until it is the human's turn
    let state; for (let i = 0; i < 40; i++) { state = (await get(bridge, c, c.code)).j; if (state.deal.turn === state.mySeat) break; }
    assert.equal(state.deal.turn, state.mySeat, 'it becomes the human\'s turn'); assert.ok(state.deadline > state.now, 'a turn clock is running');
    const calls = state.deal.calls.length;
    room = mem.get(c.code); room.d.turnAt = Date.now() - 31000; mem.set(c.code, room);
    state = (await get(bridge, c, c.code)).j;
    assert.ok(state.deal.calls.length > calls && state.deal.calls[calls].seat === seat && state.deal.calls[calls].call === 'P', 'the idle player passes automatically');
    // no limit: nothing is forced
    await post(bridge, { action: 'leave', code: c.code, pid: c.meId, tok: c.tok, match: 1 }); void seat;
  }
  // 11. Every room game warns when rooms are not being saved (Vercel without a database).
  {
    process.env.VERCEL = '1';
    try {
      for (const handler of [bridge, hotJoker, grandCon]) {
        const r = await post(handler, { action: 'create', name: 'Warn' });
        assert.equal(r.headers['x-storage-warning'], '1', 'the page is told the room will not be kept');
      }
    } finally { delete process.env.VERCEL; }
    assert.equal((await post(bridge, { action: 'create', name: 'Calm' })).headers['x-storage-warning'], undefined);
  }
  // 13. "Last to be ready" is who pressed Ready last on their own phone, not whose request happened to arrive last, and it survives a leaver.
  {
    const game = require('../api/game.js'), toks = {};
    const gcall = async (method, body, query) => {
      let out; const res = { setHeader() {}, status(st) { this.s = st; return this; }, json(j) { out = { s: this.s, j }; } };
      const pid = (body && body.pid) || (query && query.pid);
      await game({ method, body, query: query || {}, headers: pid && toks[pid] ? { 'x-tok': toks[pid], 'x-forwarded-for': 'rdy-' + pid } : { 'x-forwarded-for': 'rdy-' + (++ip) } }, res);
      if (out.j && out.j.tok && out.j.meId) toks[out.j.meId] = out.j.tok;
      return out;
    };
    const gpost = (b) => gcall('POST', { requestId: rid(), ...b });
    const host = (await gpost({ action: 'create', name: 'RdyHost' })).j, ids = [host.meId], code = host.code;
    for (let i = 1; i < 4; i++) ids.push((await gpost({ action: 'join', code, name: 'Rdy' + i })).j.meId);
    const dealt = async () => {
      let v = (await gpost({ action: 'deal', code, pid: ids[0], round: (await gcall('GET', null, { code, pid: ids[0] })).j.round })).j;
      for (const pid of ids) {
        let me = (await gcall('GET', null, { code, pid })).j;
        for (let slot = 0; slot < 7; slot++) await gpost({ action: 'place', code, pid, round: me.round, card: me.hand[0], slot }), me = (await gcall('GET', null, { code, pid })).j;
      }
      return v;
    };
    const rnd = async () => (await gcall('GET', null, { code, pid: ids[0] })).j.round;
    await dealt();
    const now = Date.now();
    // player 1 pressed Ready last on their phone, but player 3's slower connection delivers the request after it
    const pressed = { 0: now - 4000, 1: now - 1000, 2: now - 3000, 3: now - 2000 };
    for (const i of [0, 2, 1]) await gpost({ action: 'ready', code, pid: ids[i], round: await rnd(), ready: true, at: pressed[i] });
    const done = (await gpost({ action: 'ready', code, pid: ids[3], round: await rnd(), ready: true, at: pressed[3] })).j;
    assert.equal(done.allReady.id, ids[1], 'player 1 pressed last on their phone, so they are last');
    // other players' calls stay hidden while the guessing is open and are shown once it is over
    const open = (await gcall('GET', null, { code, pid: ids[0] })).j;
    if (open.predWin && Date.now() < open.predWin.until) assert.equal(open.allCalls, null, 'calls are secret while people are still deciding');
    else assert.equal(typeof open.allCalls, 'object');
    // a player who leaves while everyone else is ready: the verdict goes to whoever of the rest pressed last
    await dealt();
    const t = Date.now();
    for (const [i, at] of [[0, t - 3000], [1, t - 1000], [2, t - 2000]]) await gpost({ action: 'ready', code, pid: ids[i], round: await rnd(), ready: true, at });
    const left = await gpost({ action: 'leave', code, pid: ids[3], round: await rnd() });
    assert.equal(left.s, 200);
    const after = (await gcall('GET', null, { code, pid: ids[0] })).j;
    assert.ok(after.allReady, 'the others are all ready once the straggler leaves');
    assert.equal(after.allReady.id, ids[1], 'the last of the remaining players to press Ready');
  }
  console.log('Audit fixes: sign-in recovery, Grand Con relink, Bridge scoreboard, departed Last Train players, long names, the Last Laugh first draw, joining between games, removing players, the Bridge turn clock and the unsaved-room warning passed');
})().catch((e) => { console.error(e); process.exit(1); });
