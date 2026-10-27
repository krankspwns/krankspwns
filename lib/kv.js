// Small key-value layer for accounts: Upstash Redis (REST) or an in-memory Map for local development and tests.
// Documents carry a numeric version `v`; cas() only writes when the stored version is the one the caller read.
const crypto = require('node:crypto');
const url = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const mem = (globalThis.__kvMemory ||= new Map());
const alive = (e) => e && (!e.until || e.until > Date.now());
async function redis(command) {
  try {
    const response = await fetch(url(), { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: JSON.stringify(command), signal: AbortSignal.timeout(3000) });
    const result = await response.json();
    if (!response.ok || result.error) throw Error();
    return result.result;
  } catch { throw Object.assign(Error('Connection lost. Please try again.'), { status: 503 }); }
}
const CAS = `local r=redis.call('GET',KEYS[1]); local want=tonumber(ARGV[2]); if r then if tonumber(cjson.decode(r).v or 0)~=want then return 0 end elseif want~=0 then return 0 end; if tonumber(ARGV[3])>0 then redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[3]) else redis.call('SET',KEYS[1],ARGV[1]) end; return 1`;
async function get(key) {
  if (!url()) { const e = mem.get(key); if (!alive(e)) { mem.delete(key); return null; } return structuredClone(e.value); }
  const raw = await redis(['GET', key]); return raw ? JSON.parse(raw) : null;
}
async function set(key, value, ttl = 0) {
  if (!url()) { mem.set(key, { value: structuredClone(value), until: ttl ? Date.now() + ttl * 1000 : 0 }); return; }
  await redis(ttl ? ['SET', key, JSON.stringify(value), 'EX', String(ttl)] : ['SET', key, JSON.stringify(value)]);
}
async function del(key) { if (!url()) { mem.delete(key); return; } await redis(['DEL', key]); }
// Writes doc as version expected+1. Returns false when someone else changed it first.
async function cas(key, expected, doc, ttl = 0) {
  doc.v = expected + 1;
  if (!url()) {
    const e = mem.get(key), cur = alive(e) ? (e.value.v || 0) : 0;
    if (cur !== expected) return false;
    mem.set(key, { value: structuredClone(doc), until: ttl ? Date.now() + ttl * 1000 : 0 }); return true;
  }
  return (await redis(['EVAL', CAS, '1', key, JSON.stringify(doc), String(expected), String(ttl)])) === 1;
}
// Read, change and write a document, retrying on a conflict. fn receives the current doc (or null) and returns the new doc.
async function update(key, fn, ttl = 0) {
  for (let i = 0; i < 10; i++) {
    const cur = await get(key), next = await fn(cur ? structuredClone(cur) : null);
    if (next === undefined) return cur;
    if (await cas(key, cur ? cur.v || 0 : 0, next, ttl)) return next;
    await new Promise((r) => setTimeout(r, 5 + crypto.randomInt(25)));
  }
  throw Object.assign(Error('Please try again.'), { status: 503 });
}
// get-and-delete in one step: a nonce can be used once
async function take(key) {
  if (!url()) { const e = mem.get(key); mem.delete(key); return alive(e) ? structuredClone(e.value) : null; }
  const raw = await redis(['GETDEL', key]); return raw ? JSON.parse(raw) : null;
}
async function hit(key, windowSeconds) {
  const k = 'rl:' + key + ':' + Math.floor(Date.now() / 1000 / windowSeconds);
  if (!url()) {
    for (const [name, e] of mem) if (name.startsWith('rl:') && !alive(e)) mem.delete(name);
    const e = mem.get(k) || { value: 0, until: Date.now() + windowSeconds * 2000 }; e.value++; mem.set(k, e); return e.value;
  }
  return redis(['EVAL', `local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end;return n`, '1', k, String(windowSeconds * 2)]);
}
module.exports = { get, set, del, cas, update, take, hit };

