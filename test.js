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
  v = (await post({ action: 'place', code: c.code, pid: me, card, slot: 3 })).j;
  assert.equal(v.hand.length, 6); assert.equal(v.players[0].board[3].c, card);
  assert.equal((await g(ps[1].pid)).j.players[0].board[3].c, '?', 'face-down hidden from others');
  v = (await post({ action: 'flip', code: c.code, pid: me, slot: 3 })).j;
  assert.equal((await g(ps[1].pid)).j.players[0].board[3].c, card, 'face-up visible');
  v = (await post({ action: 'move', code: c.code, pid: me, from: 3, to: 6 })).j;
  assert.equal(v.players[0].board[6].c, card); assert.equal(v.players[0].board[6].up, true, 'flip state kept');
  await post({ action: 'place', code: c.code, pid: me, card: card2, slot: 0 });
  v = (await post({ action: 'move', code: c.code, pid: me, from: 0, to: 6 })).j;
  assert.equal(v.players[0].board[0].c, card, 'swap'); assert.equal(v.players[0].board[6].c, card2);
  v = (await post({ action: 'place', code: c.code, pid: me, card: v.hand[0], slot: 0 })).j;
  assert.equal(v.hand.length, 5, 'occupant returned to hand'); assert.equal(v.players[0].board.filter(Boolean).length, 2);
  v = (await post({ action: 'flipRowUp', code: c.code, pid: me, row: 3 })).j;
  assert.equal(v.players[0].board[6].up, true, 'row 3 flipped up'); assert.equal(v.players[0].board[0].up, false, 'row 0 untouched');
  v = (await post({ action: 'ready', code: c.code, pid: me, ready: true })).j;
  assert.ok(v.players[0].ready && v.players[0].board.every(x => !x || !x.up), 'ready hides all faces');
  assert.equal((await post({ action: 'move', code: c.code, pid: me, from: 0, to: 1 })).s, 409, 'frozen while ready');
  assert.equal((await post({ action: 'place', code: c.code, pid: me, card: v.hand[0], slot: 1 })).s, 409, 'no place while ready');
  assert.equal((await post({ action: 'unplace', code: c.code, pid: me, slot: 0 })).s, 409, 'no unplace while ready');
  assert.equal((await post({ action: 'flip', code: c.code, pid: me, slot: 0 })).s, 200, 'flip allowed while ready');
  v = (await post({ action: 'ready', code: c.code, pid: me, ready: false })).j;
  assert.equal(v.players[0].ready, false);
  assert.equal((await post({ action: 'move', code: c.code, pid: me, from: 5, to: 1 })).s, 400, 'empty source');
  v = (await post({ action: 'unplace', code: c.code, pid: me, slot: 0 })).j;
  assert.equal(v.hand.length, 6);
  v = (await post({ action: 'deal', code: c.code, pid: ps[0].pid })).j;
  assert.equal(v.hand.length, 7); assert.ok(v.players.every(p => !p.ready && p.board.every(x => !x)), 'reset');
  // 10 players: allowed, 11th rejected, 70 cards dealt from two decks
  const big = (await post({ action: 'create', name: 'H' })).j;
  for (let i = 1; i < 10; i++) assert.equal((await post({ action: 'join', code: big.code, name: 'Q' + i })).s, 200);
  assert.equal((await post({ action: 'join', code: big.code, name: 'Q10' })).s, 409, '11th player rejected');
  const bv = (await post({ action: 'deal', code: big.code, pid: big.meId })).j;
  assert.equal(bv.players.length, 10); assert.equal(bv.maxPlayers, 10); assert.equal(bv.hand.length, 7);
  console.log('all ok');
})().catch(e => { console.error(e); process.exit(1); });
