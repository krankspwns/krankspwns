const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { call, startRedis } = require('./helpers');
const R = require('../lib/hot-joker-rules');

function rulesTests() {
  const deck = R.deck();
  assert.equal(deck.length, 53); assert.equal(new Set(deck).size, 53); assert.ok(deck.includes('JK'));
  for (const n of [3, 4, 5, 7, 10]) {
    const ids = Array.from({ length: n }, (_, i) => 'p' + i), hands = R.deal(ids), sizes = ids.map((id) => hands[id].length);
    assert.equal(sizes.reduce((a, b) => a + b), 53); assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
    assert.equal(new Set(ids.flatMap((id) => hands[id])).size, 53);
  }
  const lay = (hand, size) => { const r = R.layDown(hand, size); return { hand: r.hand, ranks: r.ranks }; };
  assert.deepEqual(lay(['S7', 'H7', 'D7', 'JK', 'S2']), { hand: ['D7', 'JK', 'S2'], ranks: ['7'] }, 'pairs are the default; the odd card stays');
  assert.deepEqual(R.layDown(['S7', 'H7', 'D7', 'C7', 'JK']).sets, [{ rank: '7', cards: ['S7', 'H7'] }, { rank: '7', cards: ['D7', 'C7'] }], 'each set lists its cards');
  assert.deepEqual(lay(['JK', 'JK']).ranks, [], 'the Joker never pairs');
  // Clockwise order A > B > C: B takes from A, C from B, A from C; empty players are skipped.
  const order = ['A', 'B', 'C'], hands = { A: ['S2'], B: ['S3'], C: ['S4'] };
  assert.equal(R.sourceFor(order, hands, 'B'), 'A'); assert.equal(R.sourceFor(order, hands, 'C'), 'B'); assert.equal(R.sourceFor(order, hands, 'A'), 'C');
  assert.equal(R.nextTaker(order, hands, 'B'), 'C');
  hands.B = [];
  assert.equal(R.sourceFor(order, hands, 'C'), 'A', 'C takes from A once B is out');
  assert.equal(R.nextTaker(order, hands, 'A'), 'C', 'turn order skips players who are out');
  hands.C = [];
  assert.equal(R.nextTaker(order, hands, 'A'), null);
}

(async () => {
  rulesTests();
  const redis = process.argv.includes('--redis') ? await startRedis() : null;
  try {
    if (redis) { process.env.UPSTASH_REDIS_REST_URL = redis.url; process.env.UPSTASH_REDIS_REST_TOKEN = 'test'; }
    const handler = require('../api/hot-joker'), id = () => crypto.randomUUID();
    let ip = 0; // each room joins from its own address so the create/join rate limit is not shared
    const enter = (action, data) => call(handler, { action, requestId: id(), ...data }, {}, { 'x-forwarded-for': 'test-' + ip });
    const get = (seat) => call(handler, null, { code: seat.code, pid: seat.meId }, { 'x-tok': seat.tok });
    const post = async (seat, action, extra = {}) => { const cur = (await get(seat)).j; return call(handler, { action, requestId: id(), code: seat.code, pid: seat.meId, tok: seat.tok, match: cur.match, ...extra }); };
    const raw = async (code) => redis ? JSON.parse(await redis.client.get('hot-joker:room:' + code)) : structuredClone(globalThis.__roomStoreRooms['hot-joker'].get(code));
    const save = async (room) => redis ? redis.client.set('hot-joker:room:' + room.code, JSON.stringify(room)) : globalThis.__roomStoreRooms['hot-joker'].set(room.code, structuredClone(room));

    async function room(n) {
      ip++;
      const host = (await enter('create', { name: 'P0' })).j, players = [host];
      for (let i = 1; i < n; i++) { const r = await enter('join', { code: host.code, name: 'P' + i }); assert.equal(r.s, 200); players.push(r.j); }
      return players;
    }
    // Lobby rules.
    const lobby = await room(2);
    assert.equal((await post(lobby[0], 'start')).s, 409, 'needs three players');
    assert.equal((await post(lobby[0], 'settings', {})).s, 400);
    const third = await enter('join', { code: lobby[0].code, name: 'P2' }); lobby.push(third.j);
    assert.equal((await post(lobby[1], 'start')).s, 403, 'only the host starts');
    assert.equal((await post(lobby[1], 'shuffleSeats')).s, 403);
    assert.equal((await post(lobby[0], 'take', { index: 0, turn: 0 })).s, 409);
    assert.equal((await get(lobby[0])).j.minPlayers,3);
    assert.equal((await post(lobby[0], 'start')).s,200,'exactly three players can start');
    const crowd = await room(10);
    assert.equal((await enter('join', { code: crowd[0].code, name: 'P11' })).s, 409, 'ten players is the limit');

    let totalSets = 0;
    for (const n of [3, 4, 5, 6, 10]) {
      const players = await room(n), host = players[0], by = Object.fromEntries(players.map((p) => [p.meId, p]));
      assert.equal((await post(host, 'shuffleSeats')).s, 200);
      const started = (await post(host, 'start')).j;
      assert.equal(started.phase, 'playing'); assert.equal(started.order.length, n);
      assert.equal((await enter('join', { code: host.code, name: 'Late' })).s, 409);
      let steps = 0, view = (await get(host)).j;
      const ownerView = async (p) => (await get(p)).j;
      // No one can read another player's cards; only counts are public.
      async function assertPrivacy() {
        const r = await raw(host.code);
        for (const p of players) {
          const v = await ownerView(p), json = JSON.stringify(v);
          assert.deepEqual(v.me.hand.slice().sort(), r.hands[p.meId].slice().sort());
          assert.ok(!json.includes('tokenHash') && !('hands' in v) && !('priv' in v));
          for (const other of players) {
            assert.equal(v.counts[other.meId], r.hands[other.meId].length);
            if (other === p) continue;
            for (const card of r.hands[other.meId]) if (!v.me.hand.includes(card) && v.me.last?.card !== card) assert.ok(!json.includes('"' + card + '"'), 'leaked a hidden card');
          }
        }
        // Conservation: hands + laid-down sets always account for the whole deck.
        const all = Object.values(r.hands).flat().length + r.sets.reduce((n, s) => n + s.cards.length, 0);
        assert.equal(all, 53);
      }
      await assertPrivacy();
      assert.equal(view.sets.reduce((n, s) => n + s.cards.length, 0) + Object.values(view.counts).reduce((a, b) => a + b, 0), 53);
      assert.ok(view.sets.every((s) => s.cards.length === 2 && s.cards.every((c) => c.slice(1) === s.rank)), 'every set is a pair of one rank');
      const jokerHolders = [];
      while (view.phase === 'playing') {
        assert.ok(++steps < 3000, 'game did not finish');
        const taker = by[view.taker], v = await ownerView(taker);
        assert.equal(v.taker, taker.meId);
        const idx = v.order.indexOf(taker.meId), expectSource = v.order[(idx - 1 + n) % n];
        if (view.counts[expectSource] > 0) assert.equal(v.source, expectSource, 'cards are taken from the previous player');
        assert.ok(v.sourceCount > 0);
        if (steps === 1) {
          const outsider = players.find((p) => p.meId !== taker.meId);
          assert.equal((await post(outsider, 'take', { index: 0, turn: v.turn })).s, 409, 'out of turn');
          assert.equal((await post(taker, 'take', { index: v.sourceCount, turn: v.turn })).s, 400, 'index out of range');
          assert.equal((await post(taker, 'take', { index: -1, turn: v.turn })).s, 400);
          assert.equal((await post(taker, 'take', { index: 0, turn: v.turn + 1 })).s, 409, 'stale turn');
          const source = by[v.source], held = (await ownerView(source)).me.hand.slice();
          assert.equal((await post(source, 'shuffle')).s, 409, 'draw source cannot shuffle');
          assert.equal((await post(source, 'move', { from: 0, to: held.length - 1 })).s, 409, 'draw source cannot move cards');
          assert.deepEqual((await ownerView(source)).me.hand, held, 'locked card positions stay unchanged');
          // Arranging cards never changes the multiset.
          const before = (await ownerView(taker)).me.hand.slice().sort();
          await post(taker, 'shuffle'); await post(taker, 'move', { from: 0, to: before.length - 1 });
          assert.deepEqual((await ownerView(taker)).me.hand.slice().sort(), before);
          assert.equal((await post(taker, 'move', { from: 0, to: 99 })).s, 400);
          // The previous owner of a request id cannot apply it twice.
          const rid = id(), body = { action: 'take', requestId: rid, code: taker.code, pid: taker.meId, tok: taker.tok, match: v.match, index: 0, turn: v.turn };
          assert.equal((await call(handler, body)).s, 200); assert.equal((await call(handler, body)).s, 200);
          assert.equal((await get(host)).j.turn, v.turn + 1, 'a retried take applies once');
        } else {
          const index = crypto.randomInt(v.sourceCount);
          if (steps % 7 === 0) await assertPrivacy();
          const res = await post(taker, 'take', { index, turn: v.turn });
          assert.equal(res.s, 200);
          // The victim privately learns what was taken; the public log does not name the card.
          const victim = by[res.j.log.at(-1).source], vv = await ownerView(victim);
          assert.equal(vv.me.last.kind, 'lost'); assert.equal(vv.me.last.turn, res.j.turn);
          assert.ok(!JSON.stringify(res.j.log).includes(vv.me.last.card));
        }
        view = (await get(host)).j;
        const r = await raw(host.code);
        for (const [pid, hand] of Object.entries(r.hands)) { if (hand.includes('JK')) jokerHolders.push(pid); }
      }
      assert.equal(view.phase, 'finished');
      const final = await raw(host.code);
      assert.equal(final.sets.length, 26, 'all twenty-six pairs were laid down, so the game never ends early');
      assert.ok(view.turn >= 8, 'the game ran for many turns');
      assert.ok(final.sets.every((s) => !final.hands[view.loser].some((c) => s.cards.includes(c))), 'laid-down cards leave the hand');
      assert.ok(final.sets.every((s) => view.sets.some((v) => v.id === s.id && v.rank === s.rank)), 'everyone can see who laid down which sets');
      assert.equal(view.loser, final.loser);
      assert.deepEqual(final.hands[view.loser], ['JK'], 'the loser holds only the Joker');
      assert.equal(Object.values(final.hands).flat().length, 1);
      assert.equal(view.placed.length, n - 1);
      assert.equal(view.losses[view.loser], 1);
      assert.ok(!view.placed.includes(view.loser));
      assert.equal((await post(players[0], 'take', { index: 0, turn: view.turn })).s, 409, 'nothing to take after the end');
      totalSets += final.sets.length;
      if (n === 4) {
        // Rematch keeps the Joker tally and deals fresh cards.
        assert.equal((await post(host, 'start')).s, 200);
        const next = (await get(host)).j;
        assert.equal(next.match, 2); assert.equal(next.phase, 'playing'); assert.equal(next.losses[view.loser], 1);
        // A turn that runs out of time is taken for the player.
        const r = await raw(host.code); r.deadline = Date.now() - 1; await save(r);
        const after = (await get(host)).j;
        assert.equal(after.turn, next.turn + 1, 'the timer takes a random card');
        assert.ok(after.deadline > Date.now());
        // A player who leaves is skipped automatically, and can come back with the rejoin code.
        const leaver = by[after.taker];
        assert.equal((await post(leaver, 'leave')).s, 200);
        const stayer = players.find((p) => p !== leaver);
        const afterLeave = (await get(stayer)).j;
        assert.ok(afterLeave.phase === 'finished' || afterLeave.taker !== leaver.meId, 'the departed player is auto-played');
        assert.equal((await post(leaver, 'take', { index: 0, turn: afterLeave.turn })).s, 403);
        const named = afterLeave.players.find((p) => p.id === leaver.meId).name;
        assert.equal((await enter('join', { code: host.code, name: named })).s, 409);
        const back = await enter('join', { code: host.code, name: named, recoveryCode: leaver.recoveryCode });
        assert.equal(back.s, 200); assert.equal((await get(leaver)).s, 401);
      }
    }
    assert.equal(totalSets, 26 * 5);
    // Pairs are mandatory; previous four-card settings are rejected.
    {
      const [h] = await room(3);
      assert.equal((await post(h, 'settings', { setSize: 3 })).s, 400);
      assert.equal((await post(h, 'settings', { setSize: 4 })).s, 400);
      assert.equal((await post(h, 'settings', { setSize: 2 })).j.settings.setSize, 2);
      // A room saved by an older version (sets without card lists) must still load.
      const old = await raw(h.code); old.sets = [{ id: h.meId, rank: '7' }]; await save(old);
      assert.deepEqual((await get(h)).j.sets, [{ id: h.meId, rank: '7', cards: [] }], 'older rooms still load');
    }
    // Convert a saved four-card game without losing cards or keeping pairs in hand.
    {
      const players=await room(3),h=players[0],saved=await raw(h.code),ids=players.map(p=>p.meId);
      Object.assign(saved,{phase:'playing',order:ids,turn:5,match:1,taker:ids[0],placed:[],log:[],deadline:Date.now()+60000});
      saved.settings.setSize=4;
      saved.hands={[ids[0]]:['S7','H7','SA','HA'],[ids[1]]:['D7','DA','JK'],[ids[2]]:['C7','CA']};
      saved.sets=R.RANKS.filter(rank=>!['A','7'].includes(rank)).map(rank=>({id:ids[1],rank,cards:R.SUITS.map(suit=>suit+rank)}));
      await save(saved);const migrated=(await get(h)).j;
      assert.equal(migrated.settings.setSize,2);assert.equal(migrated.sets.length,24);
      assert.ok(migrated.sets.every(set=>set.cards.length===2));assert.equal(migrated.taker,ids[1]);
      assert.ok(migrated.placed.includes(ids[0]));
      const final=await raw(h.code),cards=[...Object.values(final.hands).flat(),...final.sets.flatMap(set=>set.cards)];
      assert.equal(cards.length,53);assert.equal(new Set(cards).size,53,'migration preserves every card exactly once');
      for(const hand of Object.values(final.hands))assert.equal(R.layDown(hand).sets.length,0);
    }
    // ---- Bots: one per button press, host only, and they take cards like a person ----
    process.env.BOT_FAST = '1';
    {
      const [h, guest] = await room(2);
      assert.equal((await post(guest, 'addBot')).s, 403, 'only the host adds bots');
      assert.equal((await post(h, 'removeBot')).s, 409, 'nothing to remove yet');
      assert.equal((await post(h, 'addBot')).j.players.filter((p) => p.bot).length, 1, 'one bot per press');
      assert.equal((await post(h, 'addBot')).j.players.filter((p) => p.bot).length, 2);
      assert.equal((await post(h, 'removeBot')).j.players.filter((p) => p.bot).length, 1);
      const withBots = (await post(h, 'addBot')).j;
      assert.equal(new Set(withBots.players.map((p) => p.name.toLowerCase())).size, withBots.players.length, 'bot names are unique');
      assert.equal(withBots.hostId, h.meId);
      assert.equal((await post(h, 'start')).j.phase, 'playing');
      assert.equal((await post(h, 'addBot')).s, 409, 'no new bots mid-game');
      const humans = { [h.meId]: h, [guest.meId]: guest };
      let guard = 0, view = (await get(h)).j;
      while (view.phase === 'playing') {
        assert.ok(++guard < 3000, 'bot game did not finish');
        const who = humans[view.taker]; assert.ok(who, 'bots finish their moves before a human is asked');
        const v = (await get(who)).j;
        assert.equal((await post(who, 'take', { index: crypto.randomInt(v.sourceCount), turn: v.turn })).s, 200);
        view = (await get(h)).j;
      }
      assert.equal(view.phase, 'finished');
      assert.equal(view.placed.length, 3);
      assert.equal(Object.values(view.losses).reduce((a, b) => a + b, 0), 1);
      // Rematch keeps the bot at the table.
      assert.equal((await post(h, 'start')).j.phase, 'playing');
      assert.equal((await get(h)).j.players.filter((p) => p.bot).length, 2);
    }
    console.log('Last Laugh ' + (redis ? 'Redis' : 'memory') + ': clockwise taking, hidden hands, sets, 3–10 player games, privacy, timers, autopilot, bots and recovery passed');
  } finally { if (redis) await redis.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });













