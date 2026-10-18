const assert = require('assert');
const h = require('./api/game.js');
async function call(method, body, query) {
  let out;
  const res = { setHeader() {}, status(s) { this.s = s; return this; }, json(j) { out = { s: this.s, j }; } };
  await h({ method, body, query }, res);
  return out;
}
const post = (b) => call('POST', b, {});
(async () => {
  const c = (await post({ action: 'create', name: 'Host' })).j;
  const ps = [{ pid: c.meId }];
  for (let i = 1; i < 5; i++) ps.push({ pid: (await post({ action: 'join', code: c.code, name: 'P' + i })).j.meId });
  assert.equal((await post({ action: 'deal', code: c.code, pid: ps[1].pid })).s, 403, 'non-host cannot deal');
  let v = (await post({ action: 'deal', code: c.code, pid: ps[0].pid })).j;
  const all = [];
  for (const p of ps) { const s = (await call('GET', null, { code: c.code, pid: p.pid })).j; assert.equal(s.hand.length, 7); all.push(...s.hand); }
  assert.equal(new Set(all).size, 35, 'no duplicate cards');
  const card = v.hand[0], card2 = v.hand[1];
  const me = ps[0].pid, g = (pid) => call('GET', null, { code: c.code, pid });
  v = (await post({ action: 'place', code: c.code, pid: me, card, slot: 0 })).j;
  assert.equal(v.hand.length, 6); assert.equal(v.players[0].board[0].c, card);
  assert.equal((await g(ps[1].pid)).j.players[0].board[0].c, '?', 'face-down hidden from others');
  v = (await post({ action: 'flip', code: c.code, pid: me, slot: 0 })).j;
  assert.equal((await g(ps[1].pid)).j.players[0].board[0].c, card, 'face-up visible');
  v = (await post({ action: 'move', code: c.code, pid: me, from: 0, to: 6 })).j;
  assert.equal(v.players[0].board[6].c, card); assert.equal(v.players[0].board[6].up, true, 'flip state kept');
  await post({ action: 'place', code: c.code, pid: me, card: card2, slot: 0 });
  v = (await post({ action: 'move', code: c.code, pid: me, from: 0, to: 6 })).j;
  assert.equal(v.players[0].board[0].c, card, 'swap'); assert.equal(v.players[0].board[6].c, card2);
  v = (await post({ action: 'place', code: c.code, pid: me, card: v.hand[0], slot: 0 })).j;
  assert.equal(v.hand.length, 5, 'occupant returned to hand'); assert.equal(v.players[0].board.filter(Boolean).length, 2);
  assert.equal((await post({ action: 'flipRowUp', code: c.code, pid: me, row: 3 })).s, 409, 'row flip needs everyone ready');
  assert.equal((await post({ action: 'flipRowAll', code: c.code, pid: me, row: 0, up: true })).s, 409, 'host row open needs everyone ready');
  assert.equal((await post({ action: 'ready', code: c.code, pid: me, ready: true })).s, 409, 'cannot ready with empty slots');
  for (const slot of [1, 2, 3, 4, 5]) v = (await post({ action: 'place', code: c.code, pid: me, card: v.hand[0], slot })).j;
  assert.equal(v.hand.length, 0); assert.ok(v.players[0].board.every(Boolean));
  v = (await post({ action: 'ready', code: c.code, pid: me, ready: true })).j;
  assert.ok(v.players[0].ready && v.players[0].board.every(x => !x || !x.up), 'ready hides all faces');
  assert.equal((await post({ action: 'move', code: c.code, pid: me, from: 0, to: 1 })).s, 409, 'frozen while ready');
  assert.equal((await post({ action: 'place', code: c.code, pid: me, card: v.hand[0], slot: 1 })).s, 409, 'no place while ready');
  assert.equal((await post({ action: 'unplace', code: c.code, pid: me, slot: 0 })).s, 409, 'no unplace while ready');
  assert.equal((await post({ action: 'flip', code: c.code, pid: me, slot: 0 })).s, 200, 'flip allowed while ready');
  v = (await post({ action: 'ready', code: c.code, pid: me, ready: false })).j;
  assert.equal(v.players[0].ready, false);
  v = (await post({ action: 'unplace', code: c.code, pid: me, slot: 0 })).j;
  assert.equal(v.hand.length, 1);
  assert.equal((await post({ action: 'move', code: c.code, pid: me, from: 0, to: 1 })).s, 400, 'empty source');
  v = (await post({ action: 'deal', code: c.code, pid: ps[0].pid })).j;
  assert.equal(v.hand.length, 7); assert.ok(v.players.every(p => !p.ready && p.board.every(x => !x)), 'reset');
  // everyone ready -> last player to ready is recorded; unready clears it
  const room = (await post({ action: 'create', name: 'A' })).j;
  const rp = [room.meId];
  for (const n of ['B', 'C']) rp.push((await post({ action: 'join', code: room.code, name: n })).j.meId);
  await post({ action: 'deal', code: room.code, pid: rp[0] });
  for (const id of rp) {
    let s = (await call('GET', null, { code: room.code, pid: id })).j;
    for (let slot = 0; slot < 7; slot++) s = (await post({ action: 'place', code: room.code, pid: id, card: s.hand[0], slot })).j;
  }
  await post({ action: 'ready', code: room.code, pid: rp[0], ready: true });
  assert.equal((await post({ action: 'ready', code: room.code, pid: rp[2], ready: true })).j.allReady, null, 'not all ready yet');
  const done = (await post({ action: 'ready', code: room.code, pid: rp[1], ready: true })).j;
  assert.equal(done.allReady.name, 'B', 'last to ready is shown'); assert.ok(done.now >= done.allReady.at);
  assert.equal(done.currentRow, 0, 'the game starts at row 1');
  // rows are played top to bottom
  assert.equal((await post({ action: 'flipRow', code: room.code, pid: rp[0], row: 3, up: true })).s, 409, 'cannot open row 4 before row 1');
  assert.equal((await post({ action: 'flip', code: room.code, pid: rp[0], slot: 6 })).s, 409, 'cannot flip a card of a later row');
  assert.equal((await post({ action: 'flipRowAll', code: room.code, pid: rp[0], row: 2, up: true })).s, 409, 'host cannot skip ahead');
  assert.equal((await post({ action: 'ready', code: room.code, pid: rp[1], ready: false })).s, 409, 'cannot unready once everyone is ready');
  assert.equal((await post({ action: 'flipRowAll', code: room.code, pid: rp[1], row: 0, up: true })).s, 403, 'only the host opens rows for everyone');
  // one player opening their own row is not enough to score it
  v = (await post({ action: 'flipRow', code: room.code, pid: rp[0], row: 0, up: true })).j;
  assert.ok(v.players[0].board[0].up && !v.players[0].board[1].up, 'a player can turn over their own current row');
  assert.equal(v.rowResults.length, 0, 'one player alone opening a row is not enough');
  v = (await post({ action: 'flipRow', code: room.code, pid: rp[0], row: 0, up: false })).j;
  // host opens each row in turn
  const sizes = [1, 1, 2, 3];
  let start = 0;
  for (let row = 0; row < 4; row++) {
    v = (await post({ action: 'flipRowAll', code: room.code, pid: rp[0], row, up: true })).j;
    assert.ok(v.players.every(pl => pl.board.slice(start, start + sizes[row]).every(x => x.up)), 'host opened the row for everyone');
    assert.equal(v.rowResults.length, row + 1, 'row ' + (row + 1) + ' scored'); assert.equal(v.currentRow, row + 1, 'moves on to the next row');
    const r = v.rowResults[row];
    assert.ok(r.tie ? r.penalty === 0 && !r.losers.length : r.losers.length >= 1 && r.penalty >= 1);
    assert.equal(r.entries.length, 3); assert.ok(r.entries.every(e => e.cards.length === sizes[row]), 'entries carry the cards');
    if (row === 3) assert.ok(r.entries.every(e => e.hand), 'row 4 entries carry the hand');
    start += sizes[row];
  }
  assert.equal(v.currentRow, 4, 'all four rows done');
  // results stay for the whole round, even if cards are turned back over
  v = (await post({ action: 'flipRowAll', code: room.code, pid: rp[0], row: 3, up: false })).j;
  assert.ok(v.players.every(pl => pl.board.slice(4).every(x => !x.up)), 'host closed row 4 for everyone');
  assert.equal(v.rowResults.length, 4, 'results persist after closing');
  v = (await post({ action: 'flipRowAll', code: room.code, pid: rp[0], row: 3, up: true })).j;
  assert.equal(v.rowResults.length, 4, 'reopening does not duplicate the result');
  // joining while the game is in progress (everyone ready): watch only, then dealt in next round
  const watch = (await post({ action: 'join', code: room.code, name: 'Watcher' })).j;
  assert.equal(watch.players.find(pl => pl.id === watch.meId).spectator, true, 'joiner is a spectator');
  assert.equal(watch.hand.length, 0);
  assert.equal(watch.allReady && watch.allReady.name, 'B', 'banner not disturbed by a spectator');
  assert.equal((await post({ action: 'place', code: room.code, pid: watch.meId, card: '2S', slot: 0 })).s, 409, 'spectator cannot place');
  assert.equal((await post({ action: 'ready', code: room.code, pid: watch.meId, ready: true })).s, 409, 'spectator cannot ready');
  assert.equal((await post({ action: 'ready', code: room.code, pid: rp[1], ready: false })).s, 409, 'still in progress');
  assert.equal((await call('GET', null, { code: room.code, pid: watch.meId })).j.rowResults.length, 4, 'spectator sees results');
  const nextRound = (await post({ action: 'deal', code: room.code, pid: rp[0] })).j;
  assert.ok(nextRound.players.every(pl => !pl.spectator), 'everyone is dealt in at the next round');
  assert.equal(nextRound.rowResults.length, 0, 'results are cleared for the new round'); assert.equal(nextRound.currentRow, 0);
  assert.equal((await call('GET', null, { code: room.code, pid: watch.meId })).j.hand.length, 7, 'former spectator now has cards');
  // joining while still arranging (not everyone ready) -> dealt in as a normal player, banner/ready state reset
  const arr = (await post({ action: 'create', name: 'X' })).j;
  const ar2 = (await post({ action: 'join', code: arr.code, name: 'Y' })).j;
  await post({ action: 'deal', code: arr.code, pid: arr.meId });
  const late2 = (await post({ action: 'join', code: arr.code, name: 'Z' })).j;
  assert.equal(late2.players.find(pl => pl.id === late2.meId).spectator, false, 'joining before everyone is ready: a normal player');
  assert.equal(late2.hand.length, 7);
  // kicking and presence
  const kr = (await post({ action: 'create', name: 'KHost' })).j;
  const kp = [];
  for (const n of ['K1', 'K2', 'K3']) kp.push((await post({ action: 'join', code: kr.code, name: n })).j.meId);
  const hostView = (await call('GET', null, { code: kr.code, pid: kr.meId })).j;
  assert.ok(hostView.players.every(pl => pl.online === true), 'everyone just checked in: online (host view)');
  const guestView = (await call('GET', null, { code: kr.code, pid: kp[0] })).j;
  assert.ok(guestView.players.every(pl => pl.online === undefined), 'non-hosts do not get presence info');
  globalThis.__seen.get(kr.code)[kp[1]] = Date.now() - 60000;   // K2 stopped checking in a minute ago
  const hv2 = (await call('GET', null, { code: kr.code, pid: kr.meId })).j;
  assert.equal(hv2.players.find(pl => pl.id === kp[1]).online, false, 'a player who stopped checking in shows as offline');
  assert.ok(hv2.players.find(pl => pl.id === kp[1]).seenAgo >= 59);
  assert.equal((await post({ action: 'kick', code: kr.code, pid: kp[0], target: kp[2] })).s, 403, 'only the host can kick');
  assert.equal((await post({ action: 'kick', code: kr.code, pid: kr.meId, target: kr.meId })).s, 400, 'host cannot kick themselves');
  assert.equal((await post({ action: 'kick', code: kr.code, pid: kr.meId, target: 'nobody' })).s, 404, 'unknown player');
  const afterKick = (await post({ action: 'kick', code: kr.code, pid: kr.meId, target: kp[1] })).j;
  assert.equal(afterKick.players.length, 3); assert.ok(!afterKick.players.some(pl => pl.id === kp[1]), 'kicked player is gone');
  const gone = await call('GET', null, { code: kr.code, pid: kp[1] });
  assert.equal(gone.s, 404, 'the kicked player is no longer in the room'); assert.match(gone.j.error, /not in this room/);
  assert.equal((await post({ action: 'join', code: kr.code, name: 'K2' })).s, 200, 'their name is free again, so they can rejoin');
  // kicking mid-game: if the kicked player was the only one not ready, the game moves on
  await post({ action: 'deal', code: kr.code, pid: kr.meId });
  const live = (await call('GET', null, { code: kr.code, pid: kr.meId })).j;
  for (const pl of live.players) {
    if (pl.id === kp[0]) continue;   // K1 never gets ready
    let sv = (await call('GET', null, { code: kr.code, pid: pl.id })).j;
    while (sv.hand.length) { const me2 = sv.players.find(q => q.id === pl.id); sv = (await post({ action: 'place', code: kr.code, pid: pl.id, card: sv.hand[0], slot: me2.board.findIndex(q => !q) })).j; }
    await post({ action: 'ready', code: kr.code, pid: pl.id, ready: true });
  }
  const stuck = (await call('GET', null, { code: kr.code, pid: kr.meId })).j;
  assert.equal(stuck.players.filter(pl => !pl.spectator).every(pl => pl.ready), false, 'K1 still not ready: game waits');
  const kicked2 = (await post({ action: 'kick', code: kr.code, pid: kr.meId, target: kp[0] })).j;
  assert.ok(kicked2.players.filter(pl => !pl.spectator).every(pl => pl.ready), 'after kicking the only player who was not ready, everyone left is ready');
  // 15 players: allowed, 16th rejected, 105 cards dealt from three decks
  const big = (await post({ action: 'create', name: 'H' })).j;
  for (let i = 1; i < 15; i++) assert.equal((await post({ action: 'join', code: big.code, name: 'Q' + i })).s, 200);
  assert.equal((await post({ action: 'join', code: big.code, name: 'Q15' })).s, 409, '16th player rejected');
  const bv = (await post({ action: 'deal', code: big.code, pid: big.meId })).j;
  assert.equal(bv.players.length, 15); assert.equal(bv.maxPlayers, 15); assert.equal(bv.hand.length, 7);
  // late joiners: dealt 7 cards mid-round, even when the deck is nearly used up
  const late = (await post({ action: 'create', name: 'L0' })).j;
  for (let i = 1; i < 7; i++) await post({ action: 'join', code: late.code, name: 'L' + i });
  await post({ action: 'deal', code: late.code, pid: late.meId });
  const lj = (await post({ action: 'join', code: late.code, name: 'Late8' })).j;
  assert.equal(lj.phase, 'dealt'); assert.equal(lj.hand.length, 7); assert.equal(lj.players.length, 8);
  const lj2 = (await post({ action: 'join', code: late.code, name: 'Late9' })).j;
  assert.equal(lj2.hand.length, 7);
  // host settings: only the host, timer auto-arranges stragglers, jokers off, multiplier
  const hs = (await post({ action: 'create', name: 'Hst' })).j;
  const hp = (await post({ action: 'join', code: hs.code, name: 'Pl' })).j;
  assert.equal((await post({ action: 'settings', code: hs.code, pid: hp.meId, timer: 30 })).s, 403, 'only the host changes settings');
  assert.equal((await post({ action: 'settings', code: hs.code, pid: hs.meId, timer: 33 })).s, 400, 'unknown timer rejected');
  const st1 = (await post({ action: 'settings', code: hs.code, pid: hs.meId, timer: 30, jokers: false, mult: 2 })).j;
  assert.deepEqual(st1.settings, { timer: 30, jokers: false, mult: 2, chat: true });
  const d1 = (await post({ action: 'deal', code: hs.code, pid: hs.meId })).j;
  assert.ok(d1.deadline > Date.now() + 25000 && d1.deadline <= Date.now() + 30500, 'deadline set from the timer');
  const rm = globalThis.__rooms.get(hs.code);
  assert.ok(![...rm.deck, ...rm.players.flatMap(p => p.hand)].includes('JK'), 'no joker when jokers are off');
  // Pl is ready; the host never arranged: time runs out
  await post({ action: 'place', code: hs.code, pid: hp.meId, card: rm.players[1].hand[0], slot: 0 });
  globalThis.__rooms.get(hs.code).deadline = Date.now() - 1;
  const after = (await post({ action: 'state', code: hs.code, pid: hs.meId })).j;
  assert.ok(after.players.every(p => p.ready), 'everyone is made ready when the time is up');
  assert.ok(after.allReady && after.allReady.timer, 'timer flag on the all-ready banner');
  assert.equal(after.deadline, null);
  assert.equal(after.hand.length, 0, 'the host\'s hand was placed on the board');
  // round wins unlock avatar accessories
  const wr = (await post({ action: 'create', name: 'WA' })).j;
  const wb = (await post({ action: 'join', code: wr.code, name: 'WB' })).j;
  await post({ action: 'deal', code: wr.code, pid: wr.meId });
  for (const pid of [wr.meId, wb.meId]) {
    let v = (await call('GET', null, { code: wr.code, pid })).j;
    for (let i = 0; i < 7; i++) await post({ action: 'place', code: wr.code, pid, card: v.hand[i] === undefined ? (await call('GET', null, { code: wr.code, pid })).j.hand[0] : (await call('GET', null, { code: wr.code, pid })).j.hand[0], slot: i });
    await post({ action: 'ready', code: wr.code, pid, ready: true });
  }
  const wroom = globalThis.__rooms.get(wr.code);
  const rigW = (pl, cs) => cs.forEach((c, i) => (pl.board[i].c = c));
  rigW(wroom.players[0], ['3S', '4S', '10S', 'QH', '2S', '3S', '4S']); rigW(wroom.players[1], ['KH', 'KD', '3C', '4D', '7H', '7C', '7D']);
  for (let row = 0; row < 4; row++) await post({ action: 'flipRowAll', code: wr.code, pid: wr.meId, row, up: true });
  const wv = (await call('GET', null, { code: wr.code, pid: wr.meId })).j;
  assert.equal(wv.rowResults.length, 4);
  assert.equal(wv.players.reduce((a, p) => a + p.wins, 0), 1, 'exactly one round winner');
  const winner = wv.players.find((p) => p.wins === 1);
  assert.equal(winner.acc, 'hat', 'first win unlocks the party hat');
  const loserId = wv.players.find((p) => p.wins === 0).id;
  assert.equal((await post({ action: 'avatar', code: wr.code, pid: loserId, acc: 'crown' })).s, 403, 'locked accessory refused');
  assert.equal((await post({ action: 'avatar', code: wr.code, pid: winner.id, acc: 'shades' })).s, 403, 'needs 2 wins');
  assert.equal((await post({ action: 'avatar', code: wr.code, pid: winner.id, acc: '' })).j.players.find((p) => p.id === winner.id).acc, '', 'can take it off');
  // chat: cleaned, limited, only new messages sent back, and the host can switch it off
  const cr = (await post({ action: 'create', name: 'CA' })).j;
  const cb2 = (await post({ action: 'join', code: cr.code, name: 'CB' })).j;
  const m1 = (await post({ action: 'chat', code: cr.code, pid: cr.meId, text: '  hi\u0000   there\u202e  ' })).j;
  assert.equal(m1.chat.length, 1); assert.equal(m1.chat[0].text, 'hi there'); assert.equal(m1.chat[0].name, 'CA');
  assert.equal((await post({ action: 'chat', code: cr.code, pid: cr.meId, text: '   ' })).s, 400, 'blank message refused');
  await post({ action: 'chat', code: cr.code, pid: cr.meId, text: 'too fast' });   // inside the 600ms window: ignored
  assert.equal(globalThis.__rooms.get(cr.code).chatN, 1, 'rate limit: one message at a time per player');
  const m2 = (await post({ action: 'chat', code: cr.code, pid: cb2.meId, text: 'x'.repeat(400) })).j;
  assert.equal(m2.chat.find((m) => m.name === 'CB').text.length, 140, 'messages are cut at 140 characters');
  const since = (await call('GET', null, { code: cr.code, pid: cr.meId, cn: '1' })).j;
  assert.deepEqual(since.chat.map((m) => m.n), [2], 'only messages newer than the last seen number');
  await post({ action: 'settings', code: cr.code, pid: cr.meId, chat: false });
  assert.equal((await post({ action: 'chat', code: cr.code, pid: cb2.meId, text: 'hello?' })).s, 403, 'chat off');
  console.log('all ok');
})().catch(e => { console.error(e); process.exit(1); });
