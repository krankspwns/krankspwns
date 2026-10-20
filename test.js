const assert = require('assert');
process.env.TESTER_NAME = 'benny';   // the shop tester is only switched on when asked for
const h = require('./api/game.js');
const toks = {};   // every player's secret token, picked up from the create / join replies and sent along automatically
async function call(method, body, query) {
  let out;
  const res = { setHeader() {}, status(s) { this.s = s; return this; }, json(j) { out = { s: this.s, j }; } };
  const pid = (body && body.pid) || (query && query.pid);
  const headers = pid && toks[pid] ? { 'x-tok': toks[pid] } : {};
  await h({ method, body, query, headers }, res);
  if (out.j && out.j.tok && out.j.meId) toks[out.j.meId] = out.j.tok;
  return out;
}
globalThis.__testToks = toks;
globalThis.__predOff = true;
globalThis.__startWp = 0;   // the shop tests count from zero; the real starting amount is tested on its own below
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
  // 12 players: allowed, 13th rejected, 84 cards dealt from two decks
  const big = (await post({ action: 'create', name: 'H' })).j;
  for (let i = 1; i < 12; i++) assert.equal((await post({ action: 'join', code: big.code, name: 'Q' + i })).s, 200);
  assert.equal((await post({ action: 'join', code: big.code, name: 'Q12' })).s, 409, '13th player rejected');
  const bv = (await post({ action: 'deal', code: big.code, pid: big.meId })).j;
  assert.equal(bv.players.length, 12); assert.equal(bv.maxPlayers, 12); assert.equal(bv.hand.length, 7);
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
  assert.deepEqual(after.allReady.names, ['Hst', 'Pl'], 'every straggler is named');
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
  assert.equal(winner.acc, '', 'nothing is handed out automatically any more: accessories are bought');
  assert.deepEqual(wv.winners, [winner.id], 'the view says who won the round');
  // the shop: 1 win = 10 win points; spending lowers the points but never the win count
  const loserId = wv.players.find((p) => p.wins === 0).id;
  const wal = async (pid) => (await call('GET', null, { code: wr.code, pid })).j;
  assert.equal((await wal(winner.id)).wallet.pts, 10, 'a win is worth 10 points'); assert.equal((await wal(loserId)).wallet.pts, 0);
  assert.equal((await post({ action: 'buy', code: wr.code, pid: loserId, kind: 'acc', key: 'hat' })).s, 402, 'cannot afford it');
  assert.equal((await post({ action: 'buy', code: wr.code, pid: winner.id, kind: 'acc', key: 'crown' })).s, 402, 'crown costs more');
  assert.equal((await post({ action: 'buy', code: wr.code, pid: winner.id, kind: 'acc', key: 'nope' })).s, 400, 'unknown item');
  assert.equal((await post({ action: 'avatar', code: wr.code, pid: winner.id, acc: 'hat' })).s, 403, 'cannot wear what is not owned');
  const bought = (await post({ action: 'buy', code: wr.code, pid: winner.id, kind: 'acc', key: 'hat' })).j;
  assert.equal(bought.wallet.pts, 0, 'points go down'); assert.equal(bought.players.find((p) => p.id === winner.id).wins, 1, 'the win count does not');
  assert.deepEqual(bought.wallet.owned.acc, ['hat']);
  assert.equal((await post({ action: 'buy', code: wr.code, pid: winner.id, kind: 'acc', key: 'hat' })).s, 409, 'already owned');
  assert.equal((await post({ action: 'avatar', code: wr.code, pid: winner.id, acc: 'hat' })).j.players.find((p) => p.id === winner.id).acc, 'hat', 'now it can be worn');
  assert.equal((await post({ action: 'avatar', code: wr.code, pid: winner.id, acc: '' })).j.players.find((p) => p.id === winner.id).acc, '', 'and taken off');
  assert.equal((await post({ action: 'avatar', code: wr.code, pid: winner.id, avatar: 'dragon' })).s, 403, 'special avatars must be bought');
  // avatar borders
  globalThis.__rooms.get(wr.code).wins[winner.id] = 14;
  assert.equal((await post({ action: 'avatar', code: wr.code, pid: winner.id, bd: 'gold' })).s, 403, 'border must be bought first');
  const bdv = (await post({ action: 'buy', code: wr.code, pid: winner.id, kind: 'bd', key: 'gold' })).j;
  assert.deepEqual(bdv.wallet.owned.bd, ['gold']);
  assert.equal((await post({ action: 'avatar', code: wr.code, pid: winner.id, bd: 'gold' })).j.players.find((p) => p.id === winner.id).bd, 'gold', 'border worn and visible to everyone');
  assert.equal((await post({ action: 'buy', code: wr.code, pid: winner.id, kind: 'bd', key: 'gold' })).s, 409, 'already owned');
  // gifts: three throws per purchase, throttled, only at another player
  const wroom2 = globalThis.__rooms.get(wr.code); wroom2.wins[winner.id] = 14;   // 140 points to play with
  assert.equal((await post({ action: 'throw', code: wr.code, pid: winner.id, item: 'tomato', target: loserId })).s, 403, 'nothing bought yet');
  assert.equal((await post({ action: 'buy', code: wr.code, pid: winner.id, kind: 'gift', key: 'tomato' })).j.wallet.gifts.tomato, 3);
  assert.equal((await post({ action: 'buy', code: wr.code, pid: winner.id, kind: 'gift', key: 'tomato' })).j.wallet.gifts.tomato, 6, 'buying again adds another pack');
  globalThis.__rooms.get(wr.code).players.find((q) => q.id === winner.id).gifts.tomato = 3;   // back to one pack for the throw checks below
  assert.equal((await post({ action: 'throw', code: wr.code, pid: winner.id, item: 'tomato', target: winner.id })).s, 400, 'not at yourself');
  const th = (await post({ action: 'throw', code: wr.code, pid: winner.id, item: 'tomato', target: loserId })).j;
  assert.equal(th.wallet.gifts.tomato, 2); assert.equal(th.gifts.length, 1); assert.equal(th.gifts[0].to, loserId);
  const seenByLoser = (await wal(loserId)); assert.equal(seenByLoser.gifts[0].item, 'tomato', 'everyone sees the throw');
  await post({ action: 'throw', code: wr.code, pid: winner.id, item: 'tomato', target: loserId });   // inside the 1.5 s window: ignored
  assert.equal((await wal(winner.id)).wallet.gifts.tomato, 2, 'throttled');
  globalThis.__rooms.get(wr.code).giftAt[winner.id] = 0;
  await post({ action: 'throw', code: wr.code, pid: winner.id, item: 'tomato', target: loserId });
  globalThis.__rooms.get(wr.code).giftAt[winner.id] = 0;
  assert.equal((await post({ action: 'throw', code: wr.code, pid: winner.id, item: 'tomato', target: loserId })).j.wallet.gifts.tomato, 0, 'three throws');
  globalThis.__rooms.get(wr.code).giftAt[winner.id] = 0;
  assert.equal((await post({ action: 'throw', code: wr.code, pid: winner.id, item: 'tomato', target: loserId })).s, 403, 'fourth is refused');
  assert.equal((await post({ action: 'buy', code: wr.code, pid: winner.id, kind: 'gift', key: 'tomato' })).j.wallet.gifts.tomato, 3, 'can rebuy once empty');
  // everyone at once costs the whole pack
  globalThis.__rooms.get(wr.code).giftAt[winner.id] = 0;
  await post({ action: 'throw', code: wr.code, pid: winner.id, item: 'tomato', target: loserId });
  globalThis.__rooms.get(wr.code).giftAt[winner.id] = 0;
  assert.equal((await post({ action: 'throw', code: wr.code, pid: winner.id, item: 'tomato', target: 'all' })).s, 403, 'only 2 left: not enough for everyone');
  await post({ action: 'buy', code: wr.code, pid: winner.id, kind: 'gift', key: 'rose' });
  globalThis.__rooms.get(wr.code).giftAt[winner.id] = 0;
  const allv = (await post({ action: 'throw', code: wr.code, pid: winner.id, item: 'rose', target: 'all' })).j;
  assert.equal(allv.wallet.gifts.rose, 0, 'throwing at everyone uses all three'); assert.equal(allv.gifts[allv.gifts.length - 1].to, 'all');
  assert.equal((await wal(loserId)).gifts.pop().to, 'all', 'everyone sees it');
  assert.equal((await post({ action: 'buy', code: wr.code, pid: winner.id, kind: 'av', key: 'dragon' })).j.wallet.owned.av[0], 'dragon');
  assert.equal((await post({ action: 'avatar', code: wr.code, pid: winner.id, avatar: 'dragon' })).j.players.find((p) => p.id === winner.id).avatar, 'dragon', 'a bought avatar can be used');
  // only a player called Benny gets the 1000 WP testing allowance, and may throw at themselves
  const bn = (await post({ action: 'create', name: ' benny ' })).j;
  assert.equal(bn.wallet.pts, 1000, 'Benny starts with 1000 WP'); assert.equal(bn.prices.test, true);
  const nb = (await post({ action: 'join', code: bn.code, name: 'Bennyx' })).j;
  assert.equal(nb.wallet.pts, 0, 'everyone else starts with nothing'); assert.equal(nb.prices.test, false);
  assert.equal((await post({ action: 'buy', code: bn.code, pid: nb.meId, kind: 'acc', key: 'hat' })).s, 402);
  assert.equal((await post({ action: 'buy', code: bn.code, pid: bn.meId, kind: 'gift', key: 'rose' })).j.wallet.pts, 990);
  assert.equal((await post({ action: 'throw', code: bn.code, pid: bn.meId, item: 'rose', target: bn.meId })).s, 200, 'the tester may throw at themselves');
  // everyone can see each player's points and shop items
  const pv = (await call('GET', null, { code: bn.code, pid: nb.meId })).j;
  const bennyRow = pv.players.find((p) => p.id === bn.meId);
  assert.equal(bennyRow.wp, 990); assert.deepEqual(bennyRow.inv.gifts, { rose: 2 }, 'everyone sees what others own');
  assert.equal(pv.players.find((p) => p.id === nb.meId).wp, 0);
  // chat: cleaned, limited, only new messages sent back, and the host can switch it off
  const cr = (await post({ action: 'create', name: 'CA' })).j;
  const cb2 = (await post({ action: 'join', code: cr.code, name: 'CB' })).j;
  const m1 = (await post({ action: 'chat', code: cr.code, pid: cr.meId, text: '  hi\u0000   there\u202e  ' })).j;
  assert.equal(m1.chat.filter((m) => !m.sys).length, 1); const hi = m1.chat.find((m) => !m.sys); assert.equal(hi.text, 'hi there'); assert.equal(hi.name, 'CA');
  assert.equal(m1.chat[0].k, 'join', 'joining is announced in the chat');
  assert.equal((await post({ action: 'chat', code: cr.code, pid: cr.meId, text: '   ' })).s, 400, 'blank message refused');
  await post({ action: 'chat', code: cr.code, pid: cr.meId, text: 'too fast' });   // inside the 600ms window: ignored
  assert.equal(globalThis.__rooms.get(cr.code).chatN, 2, 'rate limit: one message at a time per player');
  const m2 = (await post({ action: 'chat', code: cr.code, pid: cb2.meId, text: 'x'.repeat(400) })).j;
  assert.equal(m2.chat.find((m) => m.name === 'CB').text.length, 140, 'messages are cut at 140 characters');
  const since = (await call('GET', null, { code: cr.code, pid: cr.meId, cn: '2' })).j;
  assert.deepEqual(since.chat.map((m) => m.n), [3], 'only messages newer than the last seen number');
  // reactions: one per player per message, tap again to take it back
  assert.deepEqual((await post({ action: 'creact', code: cr.code, pid: cb2.meId, n: hi.n, e: 'heart' })).j.chatR[hi.n].heart, [cb2.meId]);
  await new Promise((r) => setTimeout(r, 400));
  assert.deepEqual(Object.keys((await post({ action: 'creact', code: cr.code, pid: cb2.meId, n: hi.n, e: 'fire' })).j.chatR[hi.n]), ['fire'], 'a new reaction replaces the old one');
  assert.equal((await post({ action: 'creact', code: cr.code, pid: cb2.meId, n: 999, e: 'fire' })).s, 404, 'no reacting to missing messages');
  await post({ action: 'settings', code: cr.code, pid: cr.meId, chat: false });
  assert.equal((await post({ action: 'chat', code: cr.code, pid: cb2.meId, text: 'hello?' })).s, 403, 'chat off');
  // half penalties are rounded up
  const hr = (await post({ action: 'create', name: 'HA' })).j;
  const hb = (await post({ action: 'join', code: hr.code, name: 'HB' })).j;
  assert.equal((await post({ action: 'settings', code: hr.code, pid: hr.meId, mult: 0.5 })).j.settings.mult, 0.5);
  assert.equal((await post({ action: 'settings', code: hr.code, pid: hr.meId, mult: 0.75 })).s, 400, 'only listed multipliers');
  await post({ action: 'deal', code: hr.code, pid: hr.meId });
  for (const pid of [hr.meId, hb.meId]) { for (let i = 0; i < 7; i++) await post({ action: 'place', code: hr.code, pid, card: (await call('GET', null, { code: hr.code, pid })).j.hand[0], slot: i }); await post({ action: 'ready', code: hr.code, pid, ready: true }); }
  const hroom = globalThis.__rooms.get(hr.code);
  hroom.players[0].board.forEach((c, i) => (c.c = ['3S', '4S', '10S', 'QH', '2S', '3S', '4S'][i])); hroom.players[1].board.forEach((c, i) => (c.c = ['KH', 'KD', '3C', '4D', '7H', '7C', '7D'][i]));
  for (let row = 0; row < 4; row++) await post({ action: 'flipRowAll', code: hr.code, pid: hr.meId, row, up: true });
  const hv = (await call('GET', null, { code: hr.code, pid: hr.meId })).j;
  assert.deepEqual(hv.rowResults.map((r) => r.penalty), [1, 1, 1, 2], 'x0.5: a penalty of 1 stays 1 and 3 becomes 2 (rounded up)');
  { const sx = hv.players.map((q) => q.sess); const lost = (id) => hv.rowResults.filter((r) => !r.tie && r.losers.includes(id)).reduce((t, r) => t + r.penalty, 0) + ((hv.latePen || {})[id] || 0);
    assert.ok(sx.every((x) => x && x.rounds === 1), 'the session scoreboard counts the finished round');
    assert.deepEqual(hv.players.map((q) => q.sess.pen), hv.players.map((q) => lost(q.id)), 'and each player\'s total penalty'); }
  { // ---- ready for the next round: once every player is, the next round is dealt ----
    const r0 = hv.round;
    assert.equal((await post({ action: 'nextReady', code: hr.code, pid: hb.meId })).s, 200);
    let v = (await call('GET', null, { code: hr.code, pid: hr.meId })).j;
    assert.equal(v.round, r0, 'one player ready is not enough'); assert.deepEqual(v.players.map((q) => q.nextReady), [false, true]);
    assert.equal((await post({ action: 'nextReady', code: hr.code, pid: hr.meId })).s, 200);
    v = (await call('GET', null, { code: hr.code, pid: hr.meId })).j;
    assert.equal(v.round, r0 + 1, 'everyone ready deals the next round'); assert.equal(v.hand.length, 7); assert.ok(v.players.every((q) => !q.nextReady), 'and clears the ready marks');
    assert.equal((await post({ action: 'nextReady', code: hr.code, pid: hb.meId })).s, 409, 'only once the round is over');
  }
  // ---- predictions: name who will lose a row, earn points when right ----
  globalThis.__predOff = false;
  const pa = (await post({ action: 'create', name: 'PA' })).j, pb = (await post({ action: 'join', code: pa.code, name: 'PB' })).j, pc = (await post({ action: 'join', code: pa.code, name: 'PC' })).j;
  await post({ action: 'deal', code: pa.code, pid: pa.meId });
  assert.equal((await post({ action: 'predict', code: pa.code, pid: pa.meId, row: 0, target: pb.meId })).s, 409, 'no guessing before everyone is ready');
  const proom = globalThis.__rooms.get(pa.code);
  for (const pl of proom.players) { pl.board = Array(7).fill(null).map((_, i) => ({ c: 'x', up: false })); pl.hand = []; pl.ready = true; }
  proom.allReady = { id: pa.meId, name: 'PA', at: Date.now() + 800 };   // the guessing window opens 2.5 s after the last ready
  proom.bonus = { [pc.meId]: 5 };
  const setRow = (cards) => { proom.players.forEach((pl, i) => { pl.board[0].c = cards[i]; }); };
  setRow(['KS', '3H', 'AD']);   // row 1: lowest card loses -> PB
  assert.equal((await post({ action: 'predict', code: pa.code, pid: pa.meId, row: 0, target: pb.meId })).s, 409, 'the window has not opened yet');
  assert.equal((await post({ action: 'flip', code: pa.code, pid: pa.meId, slot: 0 })).s, 409, 'no turning cards over while guesses are coming');
  globalThis.__rooms.get(pa.code).allReady.at = Date.now() - 3000;   // now inside the window
  assert.equal((await post({ action: 'predict', code: pa.code, pid: pa.meId, row: 0, target: pa.meId })).s, 400, 'not yourself');
  assert.equal((await post({ action: 'predict', code: pa.code, pid: pa.meId, row: 7, target: pb.meId })).s, 400, 'only rows 1 to 4');
  assert.equal((await post({ action: 'predict', code: pa.code, pid: pa.meId, row: 0, target: pb.meId })).s, 200);
  assert.equal((await post({ action: 'predict', code: pa.code, pid: pa.meId, row: 2, target: pc.meId })).s, 200, 'every row is called in the same window');
  assert.equal((await post({ action: 'predict', code: pb.meId && pa.code, pid: pb.meId, row: 0, target: pa.meId })).s, 200);
  assert.equal((await post({ action: 'predict', code: pa.code, pid: pb.meId, row: 0, target: '' })).s, 200, 'a guess can be taken back');
  assert.equal((await post({ action: 'predict', code: pa.code, pid: pc.meId, row: 0, target: pa.meId })).s, 200);
  const pv0 = (await call('GET', null, { code: pa.code, pid: pa.meId })).j;
  assert.deepEqual(pv0.myPreds, [pb.meId, null, pc.meId, null]); assert.equal(pv0.predN, 0, 'nobody has decided every row yet'); assert.ok(pv0.predWin && pv0.predWin.until > Date.now(), 'the window comes with the state');
  assert.ok(pv0.predWin.until - Date.now() > 2500, 'with picks missing the clock runs on');
  for (const [pid, picks] of [[pa.meId, { 1: '-', 3: '-' }], [pb.meId, { 0: pa.meId, 1: '-', 2: '-', 3: pc.meId }], [pc.meId, { 1: '-', 2: '-', 3: '-' }]]) for (const [row, target] of Object.entries(picks)) assert.equal((await post({ action: 'predict', code: pa.code, pid, row: +row, target })).s, 200);
  const pvAll = (await call('GET', null, { code: pa.code, pid: pa.meId })).j;
  assert.deepEqual(pvAll.myPreds, [pb.meId, '-', pc.meId, '-'], 'a skipped row reads as "-"'); assert.equal(pvAll.predN, 3);
  assert.ok(pvAll.predWin.until - Date.now() < 1500, 'once everybody has decided every row, the window closes early');
  globalThis.__rooms.get(pa.code).allReady.at = Date.now() - 20000;   // the window is over
  for (const pl of globalThis.__rooms.get(pa.code).players) pl.board[0].up = true;
  { const v0 = globalThis.__rooms.get(pa.code).version; const er = await post({ action: 'emote', code: pa.code, pid: pa.meId, e: 'gg' });
    assert.equal(globalThis.__rooms.get(pa.code).version, v0, 'a reaction never changes the room, so it cannot collide with a move');
    assert.ok(er.j.emotes.some((x) => x.id === pa.meId && x.e === 'gg'), 'it still reaches everyone');
    await post({ action: 'emote', code: pa.code, pid: pa.meId, e: 'ez' }); assert.equal((await call('GET', null, { code: pa.code, pid: pa.meId })).j.emotes.filter((x) => x.id === pa.meId).length, 1, 'one per second'); }
  await post({ action: 'avatar', code: pa.code, pid: pa.meId, avatar: 'cat' });   // any saved action stores the finished row
  const pr0 = globalThis.__rooms.get(pa.code).results[0];
  assert.deepEqual(pr0.losers, [pb.meId]); assert.deepEqual(pr0.hits, ['PA'], 'only the right guess counts');
  assert.equal(globalThis.__rooms.get(pa.code).bonus[pa.meId], 3, 'a right guess earns points');
  assert.equal(globalThis.__rooms.get(pa.code).bonus[pc.meId], 4, 'a wrong guess costs a point'); assert.deepEqual(pr0.misses, ['PC']);
  assert.equal(pr0.streak.n, 1);
  assert.equal((await call('GET', null, { code: pa.code, pid: pa.meId })).j.wallet.pts, 3);

  // the later rows have no window of their own: the calls were all made before row 1
  assert.equal((await call('GET', null, { code: pa.code, pid: pa.meId })).j.predWin, null, 'row 2 opens without a new window');
  assert.deepEqual(globalThis.__rooms.get(pa.code).results[0].picks, { [pa.meId]: pb.meId, [pb.meId]: pa.meId, [pc.meId]: pa.meId });
  globalThis.__predOff = true;
  { // ---- the last to get ready carries one penalty point into the round total ----
    const la = (await post({ action: 'create', name: 'LA' })).j, lb = (await post({ action: 'join', code: la.code, name: 'LB' })).j;
    await post({ action: 'deal', code: la.code, pid: la.meId });
    for (const pid of [la.meId, lb.meId]) { for (let i = 0; i < 7; i++) await post({ action: 'place', code: la.code, pid, card: (await call('GET', null, { code: la.code, pid })).j.hand[0], slot: i }); await post({ action: 'ready', code: la.code, pid, ready: true }); }
    const lv = (await call('GET', null, { code: la.code, pid: la.meId })).j;
    assert.deepEqual(lv.latePen, { [lb.meId]: 1 }, 'LB was last to get ready');
    const lroom = globalThis.__rooms.get(la.code);
    lroom.players[0].board.forEach((c, i) => (c.c = ['5S', '5H', '5D', '5C', '6S', '6H', '6D'][i])); lroom.players[1].board.forEach((c, i) => (c.c = ['5S', '5H', '5D', '5C', '6S', '6H', '6D'][i]));   // identical boards: every row a tie
    for (let row = 0; row < 4; row++) await post({ action: 'flipRowAll', code: la.code, pid: la.meId, row, up: true });
    const lw = (await call('GET', null, { code: la.code, pid: la.meId })).j;
    assert.deepEqual(lw.winners, [la.meId], 'all rows tied, so the late point decides the round');
    assert.equal(lw.players.find((p) => p.id === lb.meId).sess.pen, 1);
  }
  { // ---- every player starts with 25 WP ----
    delete globalThis.__startWp;
    const sw = (await post({ action: 'create', name: 'Starter' })).j, sj = (await post({ action: 'join', code: sw.code, name: 'Joiner' })).j;
    assert.equal(sw.wallet.pts, 25, 'the creator starts with 25 WP'); assert.equal(sj.wallet.pts, 25, 'so does everyone who joins');
    globalThis.__startWp = 0;
  }
  // ---- security ----
  const sa = (await post({ action: 'create', name: 'SecA' })).j, sb = (await post({ action: 'join', code: sa.code, name: 'SecB' })).j;
  const rawCall = async (method, body, query, headers = {}) => { let out; const res = { setHeader() {}, status(x) { this.s = x; return this; }, json(j) { out = { s: this.s, j }; } }; await h({ method, body, query, headers }, res); return out; };
  assert.ok(sa.tok && sb.tok && sa.tok !== sb.tok, 'every player gets their own secret token');
  assert.equal(JSON.stringify((await call('GET', null, { code: sa.code, pid: sa.meId })).j).includes('tkh'), false, 'token hashes never leave the server');
  // a player id is public (everyone sees it) and proves nothing on its own
  assert.equal((await rawCall('GET', null, { code: sa.code, pid: sa.meId })).s, 404, 'no token: refused');
  assert.equal((await rawCall('GET', null, { code: sa.code, pid: sa.meId }, { 'x-tok': 'nope' })).s, 404, 'wrong token: refused');
  assert.equal((await rawCall('GET', null, { code: sa.code, pid: sa.meId }, { 'x-tok': sb.tok })).s, 404, "another player's token does not work for you");
  assert.equal((await rawCall('POST', { action: 'kick', code: sa.code, pid: sa.meId, target: sb.meId })).s, 404, 'nobody can act as the host by knowing their id');
  assert.equal((await rawCall('POST', { action: 'deal', code: sa.code, pid: sa.meId, tok: sb.tok })).s, 404, 'a guest cannot deal as the host');
  assert.equal((await rawCall('POST', { action: 'deal', code: sa.code, pid: sb.meId, tok: sb.tok })).s, 403, 'a guest cannot deal even with their own token');
  assert.equal((await rawCall('POST', { action: 'join', code: sa.code, name: 'SecA' })).s, 409, 'a seat cannot be taken over while its owner is around');
  assert.equal((await rawCall('GET', null, { code: sa.code, pid: sa.meId }, { 'x-tok': sa.tok })).s, 200, 'the real token works (header)');
  assert.equal((await rawCall('POST', { action: 'state', code: sa.code, pid: sa.meId, tok: sa.tok })).s, 200, 'the real token works (body)');
  // junk input
  assert.equal((await rawCall('GET', null, { code: '../x', pid: 'a' })).s, 404, 'odd room codes are refused');
  assert.equal((await rawCall('POST', 'not json', {})).s, 400, 'broken json is a 400, not a crash');
  assert.equal((await rawCall('POST', { action: 'chat', code: sa.code, pid: sa.meId, tok: sa.tok, text: 'x'.repeat(9000) })).s, 413, 'oversized bodies are refused');
  assert.equal((await rawCall('PUT', {}, {})).s, 405, 'only GET and POST');
  await post({ action: 'buy', code: sa.code, pid: sa.meId, kind: 'gift', key: 'constructor' }).then((r) => assert.equal(r.s, 400, 'prototype names are not shop items'));
  await post({ action: 'buy', code: sa.code, pid: sa.meId, kind: 'gift', key: '__proto__' }).then((r) => assert.equal(r.s, 400));
  assert.equal((await post({ action: 'throw', code: sa.code, pid: sa.meId, item: 'constructor', target: sb.meId })).s, 400);
  // per-address limits (only when the platform tells us the address)
  let limited = 0;
  for (let i = 0; i < 25; i++) if ((await rawCall('POST', { action: 'create', name: 'Spam' + i }, {}, { 'x-real-ip': '203.0.113.9' })).s === 429) limited++;
  assert.ok(limited >= 4, 'creating rooms in bulk gets limited');
  let nf = 0;
  for (let i = 0; i < 40; i++) if ((await rawCall('GET', null, { code: 'ZZZZ', pid: 'x' }, { 'x-real-ip': '203.0.113.10' })).s === 429) nf++;
  assert.ok(nf >= 5, 'guessing room codes gets limited');
  console.log('all ok');
})().catch(e => { console.error(e); process.exit(1); });
