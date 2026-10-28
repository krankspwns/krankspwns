const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { call, startRedis } = require('./helpers');
const R = require('../lib/bridge-rules');

function rulesTests() {
  const c = (seat, call) => ({ seat, call });
  // Scoring: 1, 2, 4 ... 64 for 7..13 tricks, shared by declarer and partner.
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((level) => R.madePoints({ level })), [1, 2, 4, 8, 16, 32, 64]);
  assert.deepEqual(R.scoreDeal({ level: 3, declarer: 0 }, 2, 9), { delta: [4, 0, 4, 0], made: true });
  assert.deepEqual(R.scoreDeal({ level: 3, declarer: 0 }, 2, 12).delta, [4, 0, 4, 0], 'no overtrick points');
  assert.deepEqual(R.scoreDeal({ level: 3, declarer: 0 }, 0, 9).delta, [4, 0, 0, 0], 'a solo declarer scores once');
  assert.deepEqual(R.scoreDeal({ level: 3, declarer: 0 }, 2, 8), { delta: [0, 1, 0, 1], made: false });
  assert.deepEqual(R.scoreDeal({ level: 3, declarer: 0 }, 2, 6).delta, [0, 4, 0, 4], 'penalty doubles per undertrick');
  assert.deepEqual(R.scoreDeal({ level: 1, declarer: 1 }, 1, 3).delta, [8, 0, 8, 8], 'a solo declarer failing scores for all three defenders');
  assert.equal(R.dealerFor(5), 0);
  // Points and washes.
  assert.equal(R.points(['SA', 'SK', 'SQ', 'SJ', 'S2', 'S3']), 10 + 2);
  assert.equal(R.points(['C2', 'C3', 'D4', 'D5', 'H6', 'H7', 'S8', 'S9']), 0);
  for (let i = 0; i < 50; i++) {
    const hands = R.deal();
    assert.ok(hands.every((h) => h.length === 13 && R.playable(h)), 'washed hands are redealt');
    assert.equal(new Set(hands.flat()).size, 52);
  }
  // Auction: no double or redouble, bids only rise.
  assert.ok(R.isLegalCall([], 'P') && R.isLegalCall([], '1C') && !R.isLegalCall([], 'X') && !R.isLegalCall([], 'XX') && !R.isLegalCall([], '8C'));
  const calls = [c(0, '1H')];
  assert.ok(!R.isLegalCall(calls, '1H') && !R.isLegalCall(calls, '1C') && R.isLegalCall(calls, '1S') && R.isLegalCall(calls, '2C') && !R.isLegalCall(calls, 'X'));
  assert.ok(!R.auctionOver([c(0, 'P'), c(1, 'P'), c(2, 'P')]) && R.auctionOver([c(0, 'P'), c(1, 'P'), c(2, 'P'), c(3, 'P')]));
  assert.equal(R.contractOf([c(0, 'P'), c(1, 'P'), c(2, 'P'), c(3, 'P')]), null);
  const open = [c(0, '1S'), c(1, 'P'), c(2, '3S'), c(3, 'P'), c(0, 'P')];
  assert.ok(!R.auctionOver(open));
  open.push(c(1, 'P'));
  assert.ok(R.auctionOver(open));
  assert.deepEqual(R.contractOf(open), { level: 3, denom: 'S', declarer: 2 }, 'the highest bidder declares');
  assert.equal(R.openingLeader({ denom: 'S', declarer: 2 }), 3);
  assert.equal(R.openingLeader({ denom: 'N', declarer: 2 }), 2);
  assert.ok(R.isCard('SA') && R.isCard('CT') && !R.isCard('JK') && !R.isCard('S1') && !R.isCard(5));
  // Trick rules.
  assert.deepEqual(R.legalCards(['SA', 'HK', 'H2'], 'H'), ['HK', 'H2']);
  assert.deepEqual(R.legalCards(['SA', 'D3'], 'H'), ['SA', 'D3']);
  // Trumps cannot be led until one has been played, unless the hand holds nothing else.
  assert.deepEqual(R.legalCards(['CA', 'C5', 'H2', 'DK'], null, { trump: 'C', broken: false }), ['H2', 'DK'], 'no trump lead before trumps are broken');
  assert.deepEqual(R.legalCards(['CA', 'C5', 'H2', 'DK'], null, { trump: 'C', broken: true }), ['CA', 'C5', 'H2', 'DK'], 'any lead once broken');
  assert.deepEqual(R.legalCards(['CA', 'C5'], null, { trump: 'C', broken: false }), ['CA', 'C5'], 'a hand of only trumps may lead them');
  assert.deepEqual(R.legalCards(['CA', 'H2'], null, { trump: null, broken: false }), ['CA', 'H2'], 'no trump suit means no restriction');
  assert.deepEqual(R.legalCards(['CA', 'H2'], 'H', { trump: 'C', broken: false }), ['H2'], 'following suit still comes first');
  assert.deepEqual(R.legalCards(['CA', 'D2'], 'H', { trump: 'C', broken: false }), ['CA', 'D2'], 'a void player may trump in or discard');
  const t = [{ seat: 0, card: 'HK' }, { seat: 1, card: 'HA' }, { seat: 2, card: 'S2' }, { seat: 3, card: 'D9' }];
  assert.equal(R.trickWinner(t, 'S'), 2);
  assert.equal(R.trickWinner(t, null), 1);
}

(async () => {
  rulesTests();
  const redis = process.argv.includes('--redis') ? await startRedis() : null;
  const realNow = Date.now; let clockOffset = 0;
  Date.now = () => realNow() + clockOffset;
  try {
    if (redis) { process.env.UPSTASH_REDIS_REST_URL = redis.url; process.env.UPSTASH_REDIS_REST_TOKEN = 'test'; }
    const handler = require('../api/bridge'), id = () => crypto.randomUUID();
    const enter = (action, data) => call(handler, { action, requestId: id(), ...data });
    const get = (seat) => call(handler, null, { code: seat.code, pid: seat.meId }, { 'x-tok': seat.tok });
    const post = async (seat, action, extra = {}) => { const cur = (await get(seat)).j; return call(handler, { action, requestId: id(), code: seat.code, pid: seat.meId, tok: seat.tok, match: cur.match, ...extra }); };
    const raw = async (code) => redis ? JSON.parse(await redis.client.get('bridge:room:' + code)) : structuredClone(globalThis.__roomStoreRooms.bridge.get(code));

    const host = (await enter('create', { name: 'Ann' })).j;
    assert.equal((await post(host, 'start')).s, 409, 'needs four players');
    const joined = [];
    for (const name of ['Bo', 'Cy', 'Di']) { const r = await enter('join', { code: host.code, name }); assert.equal(r.s, 200); joined.push(r.j); }
    assert.equal((await enter('join', { code: host.code, name: 'Ed' })).s, 409, 'room is full');
    const players = [host, ...joined];
    assert.equal((await post(joined[0], 'start')).s, 403);
    assert.equal((await post(host, 'settings', { deals: 3 })).s, 400);
    assert.equal((await post(host, 'settings', { deals: 6 })).j.settings.deals, 6);
    assert.equal((await get(host)).j.deals,6,'six-deal choice persists');
    assert.equal((await post(host, 'settings', { deals: 2 })).j.settings.deals, 2);
    assert.equal((await post(host, 'start')).j.phase, 'bidding');
    assert.equal((await enter('join', { code: host.code, name: 'Late' })).s, 409);

    const by = Object.fromEntries(players.map((p) => [p.meId, p]));
    // Advance only the presentation hold, without sleeping through every trick.
    const settled = async seat => {
      let v = (await get(seat)).j;
      if (v.deal?.collectUntil > Date.now()) { clockOffset += v.deal.collectUntil - Date.now() + 1; v = (await get(seat)).j; }
      return v;
    };
    const view = () => settled(host);
    const assertDecided = e => {
      const played = e.tricksBy.reduce((a, b) => a + b, 0);
      const won = e.tricksBy[e.contract.declarer] + (e.partner === e.contract.declarer ? 0 : e.tricksBy[e.partner]);
      assert.equal(e.remaining, 13 - played);
      assert.ok(e.success ? won >= R.target(e.contract) : played - won >= 14 - R.target(e.contract), 'a side reached its target');
      assert.deepEqual(e.delta, R.scoreDeal(e.contract, e.partner, e.scoredTricks).delta);
    };
    const actorOf = (v) => by[v.seats[v.deal.turn]];
    // Privacy: nobody sees another hand, and the partner stays secret until revealed.
    async function assertPrivacy() {
      const room = await raw(host.code); if (!room.d) return;
      for (const p of players) {
        const v = (await get(p)).j, seat = room.seats.indexOf(p.meId), json = JSON.stringify(v.deal);
        assert.ok(!('hands' in v.deal) && !('original' in v.deal) && !json.includes('tokenHash'));
        const shown = new Set([room.d.called, ...room.d.trick.map((x) => x.card), ...(room.d.lastTrick?.cards || []).map((x) => x.card)]);
        room.d.hands.forEach((h, s) => { if (s === seat) return; for (const card of h) assert.ok(!json.includes('"' + card + '"') || shown.has(card), 'leaked ' + card); });
        if (!room.d.revealed && room.phase === 'playing') assert.equal(v.deal.partner, null, 'partner is hidden');
        assert.equal(v.deal.myHand.length, room.d.hands[seat].length);
      }
    }
    let v = await view(), actor = actorOf(v), other = players.find((p) => p !== actor);
    assert.equal((await post(other, 'call', { call: 'P' })).s, 409);
    assert.equal((await post(actor, 'call', { call: 'X' })).s, 400, 'no doubles');
    assert.equal((await post(actor, 'call', { call: '8C' })).s, 400);
    assert.equal((await post(actor, 'callCard', { card: 'SA' })).s, 409);
    assert.equal((await post(actor, 'play', { card: 'SA' })).s, 409);
    const stale = await call(handler, { action: 'call', requestId: id(), code: actor.code, pid: actor.meId, tok: actor.tok, match: 99, call: 'P' });
    assert.equal(stale.s, 409);
    const rid = id(), fixed = { action: 'call', requestId: rid, code: actor.code, pid: actor.meId, tok: actor.tok, match: v.match, call: '1N' };
    const first = await call(handler, fixed), replay = await call(handler, fixed);
    assert.equal(first.s, 200); assert.equal(replay.s, 200); assert.equal(replay.j.deal.calls.length, 1, 'a retried call applies once');
    assert.equal((await call(handler, { ...fixed, call: 'P' })).s, 409);

    // Play the whole match with a randomized legal bot.
    let steps = 0, contracts = 0, passedOut = 0;
    while (true) {
      v = await view();
      if (v.phase === 'reveal') {
        const e = v.history.at(-1);
        assert.equal(e.hands.flat().length, 52);
        if (e.contract) {
          contracts++;
          assertDecided(e);
          assert.ok(e.hands[e.partner].includes(e.called), 'the partner holds the called card');
          assert.deepEqual(e.delta, R.scoreDeal(e.contract, e.partner, e.scoredTricks).delta);
        } else { passedOut++; assert.deepEqual(e.delta, [0, 0, 0, 0]); }
        assert.equal((await post(joined[0], 'next')).s, 403);
        assert.equal((await post(host, 'next')).s, 200);
        continue;
      }
      if (v.phase === 'finished') break;
      assert.ok(++steps < 800, 'match did not finish');
      actor = actorOf(v);
      const mine = (await get(actor)).j, d = mine.deal;
      if (steps % 9 === 0) await assertPrivacy();
      if (v.phase === 'bidding') {
        assert.ok(d.legalCalls, 'actor sees legal calls');
        const options = ['P', 'P', 'P', ...d.legalCalls.bids.filter((b) => b[0] <= '4').slice(0, 4)];
        assert.equal((await post(actor, 'call', { call: options[crypto.randomInt(options.length)] })).s, 200);
      } else if (v.phase === 'calling') {
        assert.ok(d.callable && d.contract.declarer === d.turn);
        assert.equal((await post(actor, 'callCard', { card: 'JK' })).s, 400);
        assert.equal((await post(players.find((p) => p !== actor), 'callCard', { card: 'SA' })).s, 409, 'only the declarer calls');
        const card = crypto.randomInt(5) === 0 ? d.myHand[0] : R.deck()[crypto.randomInt(52)];
        assert.equal((await post(actor, 'callCard', { card })).s, 200);
      } else {
        assert.ok(d.legal, 'player to act has playable cards');
        if (d.trick.length) {
          const led = d.trick[0].card[0], room = await raw(host.code), hand = room.d.hands[d.turn], off = hand.find((x) => x[0] !== led);
          if (off && hand.some((x) => x[0] === led)) assert.equal((await post(actor, 'play', { card: off })).s, 400);
        } else {
          const room = await raw(host.code), hand = room.d.hands[d.turn], trump = room.d.contract.denom, held = hand.find((x) => x[0] === trump);
          if (trump !== 'N' && !room.d.trumpBroken && held && hand.some((x) => x[0] !== trump)) assert.equal((await post(actor, 'play', { card: held })).s, 400, 'the server refuses a trump lead before trumps are broken');
        }
        assert.equal((await post(actor, 'play', { card: d.legal[crypto.randomInt(d.legal.length)] })).s, 200);
      }
    }
    const done = await view();
    assert.equal(done.history.length, 2);
    assert.ok(done.finalWinners.length >= 1);
    for (let s = 0; s < 4; s++) assert.equal(done.scores[s], done.history.reduce((n, e) => n + e.delta[s], 0));
    assert.ok(done.history.every((e, i) => e.board === i + 1 && e.seats.length === 4));
    assert.equal(contracts + passedOut, 2);

    // Every contract level, either winning side, and a solo declarer all stop
    // on the deciding trick. Unplayed tricks never inflate a defender's reward.
    const rules = handler._rules;
    for (let level = 1; level <= 7; level++) for (const solo of [false, true]) for (const made of [false, true]) {
      const f = { players: ['a','b','c','d'].map(id => ({id})), seats: ['a','b','c','d'], settings: {}, history: [], scores: [0,0,0,0], board: 1 };
      rules.startDeal(f); f.phase = 'playing';
      const d = f.d, target = 6 + level, needed = made ? target : 14 - target;
      Object.assign(d, { contract: { level, denom: 'N', declarer: 0 }, declarer: 0, partner: solo ? 0 : 2, called: 'CA', turn: 3, tricks: needed - 1, tricksBy: made ? [needed - 1,0,0,0] : [0,needed - 1,0,0], trick: [{seat:0,card:made?'HA':'H2'},{seat:1,card:made?'H2':'HA'},{seat:2,card:'H3'}] });
      d.hands[3] = ['H4','C2'];
      rules.doPlay(f, 'H4');
      assert.equal(f.phase, 'reveal', 'target ends the deal at level ' + level);
      assert.equal(f.history.length, 1); assert.equal(f.history[0].success, made); assertDecided(f.history[0]);
      assert.ok(f.d.collectUntil > Date.now(), 'the final trick still has its collection window');
      if (!made) assert.ok(f.history[0].delta.every(n => n === 0 || n === 1), 'no unplayed undertrick penalties');
    }
    // Totals must not give away which seat is the hidden partner.
    {
      const f = { players: ['a','b','c','d'].map(id => ({id})), seats: ['a','b','c','d'], settings: {}, history: [], scores: [0,0,0,0], board: 1 };
      rules.startDeal(f); f.phase = 'playing';
      Object.assign(f.d, { contract:{level:1,denom:'N',declarer:0}, declarer:0, partner:2, called:'CA', revealed:false, tricks:3, tricksBy:[1,1,1,0] });
      f.d.called = f.d.original[2][0];
      for (let i=0;i<4;i++) { const v=rules.view(f,f.players[i]); assert.equal(v.deal.iAmPartner,i===2); assert.equal(v.deal.partner,null); }
      for (const seat of [0,1,3]) { const p = rules.view(f,f.players[seat]).deal.progress; assert.equal(p.declarer,null); assert.equal(p.defenders,null); }
      assert.equal(rules.view(f,f.players[2]).deal.progress.declarer,2,'partner privately knows their team total');
      f.d.revealed = true;
      for (const p of f.players) assert.deepEqual(rules.view(f,p).deal.progress,{declarer:2,defenders:1,target:7,defenderTarget:7,remaining:10});
    }
    // Getting close to defeat must not reveal a partner who has not played the called card.
    {
      const f = {players:['a','b','c','d'].map(id=>({id})), seats:['a','b','c','d'], settings:{}, history:[], scores:[0,0,0,0], board:1};
      rules.startDeal(f); f.phase='playing';
      Object.assign(f.d,{contract:{level:1,denom:'N',declarer:0},declarer:0,partner:2,called:'CA',revealed:false,turn:3,tricks:5,tricksBy:[0,5,0,0],trick:[{seat:0,card:'H2'},{seat:1,card:'HA'},{seat:2,card:'H3'}]});
      f.d.hands[2]=['CA']; f.d.hands[3]=['H4'];
      rules.doPlay(f,'H4');
      assert.equal(f.phase,'playing'); assert.equal(f.d.tricksBy[1],6);
      assert.equal(f.d.revealed,false,'one trick from defeat still keeps the partner hidden');
      assert.equal(rules.view(f,f.players[0]).deal.partner,null);
      assert.equal(rules.view(f,f.players[0]).deal.progress.defenders,null);
    }
    // A deciding API play is idempotent; the next deal waits for collection.
    {
      const f = await raw(host.code); f.phase = 'playing'; f.history = []; f.scores = [0,0,0,0];
      rules.startDeal(f); f.phase = 'playing'; const d = f.d;
      Object.assign(d,{contract:{level:1,denom:'N',declarer:0},declarer:0,partner:2,called:'CA',revealed:true,turn:3,tricks:6,tricksBy:[6,0,0,0],trick:[{seat:0,card:'HA'},{seat:1,card:'H2'},{seat:2,card:'H3'}]});
      d.hands[3] = ['H4','C2'];
      const save = async room => redis ? redis.client.set('bridge:room:'+room.code,JSON.stringify(room)) : globalThis.__roomStoreRooms.bridge.set(room.code,structuredClone(room));
      await save(f);
      const finisher = players.find(p=>p.meId===f.seats[3]);
      const request = {action:'play',requestId:id(),code:f.code,pid:finisher.meId,tok:finisher.tok,match:f.match,card:'H4'};
      assert.equal((await call(handler,request)).j.phase,'reveal');
      assert.equal((await call(handler,request)).j.history.length,1,'winning replay scores only once');
      assert.equal((await post(finisher,'play',{card:'C2'})).s,409,'no extra play after the target');
      assert.equal((await post(host,'next')).s,409,'let the winner collect first');
      await settled(host); assert.equal((await post(host,'next')).s,200);
    }

    // The called card is the only reveal during play, including a level-7 contract.
    const staged = require('../api/bridge')._rules;
    const room = { phase: 'bidding', players: [], seats: [], settings: {}, history: [], scores: [0, 0, 0, 0], board: 1 };
    staged.startDeal(room);
    room.d.original = [['SA', 'S2'], ['HA', 'H2'], ['DA', 'D2'], ['CA', 'C2']]; room.d.hands = room.d.original.map((h) => h.slice());
    room.d.turn = 0;
    staged.doCall(room, '7C'); staged.doCall(room, 'P'); staged.doCall(room, 'P'); staged.doCall(room, 'P');
    assert.equal(room.phase, 'calling'); assert.equal(room.d.turn, 0);
    staged.doCallCard(room, 'DA');
    assert.equal(room.phase, 'playing'); assert.equal(room.d.turn, 1, 'left of declarer leads');
    assert.equal(room.d.partner, 2); assert.equal(room.d.revealed, false, 'even a level-7 partner stays hidden until the called card is played');
    // Trumps (clubs) are unbroken: a void player who discards does not open them, one who trumps does.
    assert.equal(room.d.trumpBroken, false);
    staged.doPlay(room, 'HA'); assert.equal(room.d.revealed, false); staged.doPlay(room, 'DA');
    assert.equal(room.d.revealed, true, 'playing the called card reveals its holder immediately');
    assert.equal(room.d.trumpBroken, false, 'discarding another suit does not break trumps');
    staged.doPlay(room, 'CA');
    assert.equal(room.d.trumpBroken, true, 'trumping in breaks trumps');
    staged.doPlay(room, 'SA');
    assert.equal(room.d.tricksBy[3], 1, 'the highest trump collects the trick');
    assert.equal(room.d.turn, 3, 'the trick winner leads next');

    // Rematch resets individual scores.
    assert.equal((await post(host, 'settings', { deals: 4 })).j.settings.deals, 4);
    const again = (await post(host, 'start')).j;
    assert.equal(again.match, 2); assert.equal(again.board, 1); assert.deepEqual(again.scores, [0, 0, 0, 0]);

    // A player who leaves is auto-passed / auto-played so the table never stalls.
    const roomNow = await raw(host.code);
    const leaver = by[roomNow.seats[roomNow.d.turn === 0 ? 1 : roomNow.d.turn]], leaverSeat = roomNow.seats.indexOf(leaver.meId);
    const stayer = players.find((p) => p !== leaver);
    assert.equal((await post(leaver, 'leave')).s, 200);
    assert.equal((await get(leaver)).s, 200, 'a departed player can still read state');
    assert.equal((await post(leaver, 'call', { call: 'P' })).s, 403);
    for (let i = 0; i < 60; i++) {
      v = await settled(stayer);
      if (!['bidding', 'calling', 'playing'].includes(v.phase)) break;
      assert.notEqual(v.deal.turn, leaverSeat, 'the game skips the departed seat automatically');
      const a = by[v.seats[v.deal.turn]], mine = (await get(a)).j;
      if (v.phase === 'bidding') await post(a, 'call', { call: 'P' });
      else if (v.phase === 'calling') await post(a, 'callCard', { card: 'SA' });
      else await post(a, 'play', { card: mine.deal.legal[0] });
    }
    const named = (await get(host)).j.players.find((p) => p.id === leaver.meId).name;
    assert.equal((await enter('join', { code: host.code, name: named })).s, 409);
    assert.equal((await enter('join', { code: host.code, name: named, recoveryCode: 'wrong' })).s, 409);
    const rejoined = await enter('join', { code: host.code, name: named, recoveryCode: leaver.recoveryCode });
    assert.equal(rejoined.s, 200); assert.notEqual(rejoined.j.tok, leaver.tok);
    assert.equal((await get(leaver)).s, 401, 'the old device is signed out');
    // ---- Bots: one per button press, host only, and they play full games ----
    process.env.BOT_FAST = '1';
    {
      const h = (await enter('create', { name: 'Zed' })).j, guest = (await enter('join', { code: h.code, name: 'Yan' })).j;
      assert.equal((await post(guest, 'addBot')).s, 403, 'only the host adds bots');
      assert.equal((await post(h, 'removeBot')).s, 409, 'nothing to remove yet');
      assert.equal((await post(h, 'addBot')).j.players.filter((p) => p.bot).length, 1, 'one bot per press');
      assert.equal((await post(h, 'addBot')).j.players.length, 4);
      assert.equal((await post(h, 'addBot')).s, 409, 'the table is full');
      assert.equal((await post(h, 'removeBot')).j.players.length, 3);
      const full = (await post(h, 'addBot')).j;
      assert.equal(new Set(full.players.map((p) => p.name.toLowerCase())).size, 4, 'bot names are unique');
      assert.ok(full.players.filter((p) => p.bot).every((p) => !('tokenHash' in p) && !('tok' in p)));
      assert.equal(full.hostId, h.meId);
      assert.equal((await post(h, 'start')).j.phase, 'bidding');
      assert.equal((await post(h, 'addBot')).s, 409, 'no new bots mid-game');
      const humans = { [h.meId]: h, [guest.meId]: guest };
      let guard = 0;
      for (;;) {
        v = await settled(h);
        if (v.phase === 'reveal') { assert.equal((await post(h, 'next')).s, 200); continue; }
        if (v.phase === 'finished') break;
        assert.ok(++guard < 400, 'bot game did not finish');
        const who = humans[v.seats[v.deal.turn]]; assert.ok(who, 'bots finish their moves before a human is asked');
        const mine = (await get(who)).j.deal;
        if (v.phase === 'bidding') assert.equal((await post(who, 'call', { call: 'P' })).s, 200);
        else if (v.phase === 'calling') assert.equal((await post(who, 'callCard', { card: 'SA' })).s, 200);
        else assert.equal((await post(who, 'play', { card: mine.legal[0] })).s, 200);
      }
      assert.equal((await get(h)).j.history.length, 4, 'a default four-deal match with bots finishes');
      // Bot-only deals: every move is legal and the bots bid sensibly (neither always nor never).
      const rules = require('../api/bridge')._rules;
      let contracts = 0, made = 0, solo = 0, levels = {};
      for (let g = 0; g < 200; g++) {
        const ids = ['a', 'b', 'c', 'd'], r = { phase: 'bidding', players: ids.map((x) => ({ id: x, name: x, bot: true })), seats: ids, settings: {}, history: [], scores: [0, 0, 0, 0], board: 1 + (g % 4) };
        rules.startDeal(r);
        for (let n = 0; ['bidding', 'calling', 'playing'].includes(r.phase); n++) {
          assert.ok(n < 80, 'bot deal did not finish');
          const d = r.d, seat = d.turn, hand = d.hands[seat].slice(), before = r.phase;
          rules.botMove(r);
          if (before === 'playing') assert.equal(r.d.hands[seat].length, hand.length - 1, 'the bot played exactly one card from its own hand');
        }
        const e = r.history[0];
        if (e.contract) { contracts++; levels[e.contract.level] = (levels[e.contract.level] || 0) + 1; if (e.success) made++; if (e.partner === e.contract.declarer) solo++; assertDecided(e); }
      }
      assert.ok(contracts > 100, 'bots bid on most deals (' + contracts + ')');
      assert.ok(made / contracts > 0.25 && made / contracts < 0.95, 'bot contracts are made some of the time, not always (' + made + '/' + contracts + ')');
      assert.ok((levels[6] || 0) + (levels[7] || 0) < contracts * 0.05, 'bots rarely bid slams');
      assert.ok(solo < contracts * 0.2, 'bots rarely call their own card');
    }
    console.log('Singaporean Bridge ' + (redis ? 'Redis' : 'memory') + ': scoring, auction, called card, hidden partner, full 2-deal match, privacy, replay safety, autopilot, bots and recovery passed');
  } finally { Date.now = realNow; if (redis) await redis.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });









