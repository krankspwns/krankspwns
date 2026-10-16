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
  assert.equal((await post({ action: 'join', code: c.code, name: 'Extra' })).s, 409, '6th player rejected');
  assert.equal((await post({ action: 'deal', code: c.code, pid: ps[1].pid })).s, 403, 'non-host cannot deal');
  let v = (await post({ action: 'deal', code: c.code, pid: ps[0].pid })).j;
  const all = [];
  for (const p of ps) { const s = (await call('GET', null, { code: c.code, pid: p.pid })).j; assert.equal(s.hand.length, 7); all.push(...s.hand); }
  assert.equal(new Set(all).size, 35, 'no duplicate cards');
  const card = v.hand[0];
  v = (await post({ action: 'place', code: c.code, pid: ps[0].pid, card, slot: 3 })).j;
  assert.equal(v.hand.length, 6); assert.equal(v.players[0].board[3], card);
  const other = (await call('GET', null, { code: c.code, pid: ps[1].pid })).j;
  assert.equal(other.players[0].board[3], '?', 'hidden until locked');
  await post({ action: 'lock', code: c.code, pid: ps[0].pid, locked: true });
  assert.equal((await call('GET', null, { code: c.code, pid: ps[1].pid })).j.players[0].board[3], card, 'revealed after lock');
  assert.equal((await post({ action: 'unplace', code: c.code, pid: ps[0].pid, slot: 3 })).s, 409, 'locked');
  v = (await post({ action: 'deal', code: c.code, pid: ps[0].pid })).j;
  assert.equal(v.hand.length, 7); assert.ok(v.players.every(p => !p.locked && p.board.every(x => !x)), 'reset');
  console.log('all ok');
})().catch(e => { console.error(e); process.exit(1); });
