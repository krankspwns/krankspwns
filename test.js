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
  // 10 players: allowed, 11th rejected, 70 cards dealt from two decks
  const big = (await post({ action: 'create', name: 'H' })).j;
  for (let i = 1; i < 10; i++) assert.equal((await post({ action: 'join', code: big.code, name: 'Q' + i })).s, 200);
  assert.equal((await post({ action: 'join', code: big.code, name: 'Q10' })).s, 409, '11th player rejected');
  const bv = (await post({ action: 'deal', code: big.code, pid: big.meId })).j;
  assert.equal(bv.players.length, 10); assert.equal(bv.maxPlayers, 10); assert.equal(bv.hand.length, 7);
  // late joiners: dealt 7 cards mid-round, even when the deck is nearly used up
  const late = (await post({ action: 'create', name: 'L0' })).j;
  for (let i = 1; i < 7; i++) await post({ action: 'join', code: late.code, name: 'L' + i });
  await post({ action: 'deal', code: late.code, pid: late.meId });
  const lj = (await post({ action: 'join', code: late.code, name: 'Late8' })).j;
  assert.equal(lj.phase, 'dealt'); assert.equal(lj.hand.length, 7); assert.equal(lj.players.length, 8);
  const lj2 = (await post({ action: 'join', code: late.code, name: 'Late9' })).j;
  assert.equal(lj2.hand.length, 7);
  console.log('all ok');
})().catch(e => { console.error(e); process.exit(1); });
