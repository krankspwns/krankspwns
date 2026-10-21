const crypto = require('node:crypto');
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const memory = globalThis.__grandConRooms ||= new Map();
const limits = globalThis.__grandConLimits ||= new Map();
class Conflict extends Error {}
async function redis(command) {
  try {
    const response = await fetch(url, { method:'POST', headers:{Authorization:`Bearer ${token}`}, body:JSON.stringify(command), signal:AbortSignal.timeout(3000) });
    const result = await response.json();
    if (!response.ok || result.error) throw Error();
    return result.result;
  } catch { throw Object.assign(Error('Connection lost. Please try again.'), {status:503}); }
}
async function load(code) {
  if (!url) return memory.has(code) ? structuredClone(memory.get(code)) : null;
  const raw = await redis(['GET', 'grand-con:room:' + code]);
  return raw ? JSON.parse(raw) : null;
}
async function save(room) {
  const before = room.version;
  room.version++;
  if (!url) {
    if ((memory.get(room.code)?.version || 0) !== before) throw new Conflict();
    memory.set(room.code, structuredClone(room)); return;
  }
  const script = `local r=redis.call('GET',KEYS[1]); if r then if tonumber(cjson.decode(r).version)~=tonumber(ARGV[2]) then return 0 end elseif tonumber(ARGV[2])~=0 then return 0 end; redis.call('SET',KEYS[1],ARGV[1],'EX',43200);return 1`;
  if (await redis(['EVAL',script,'1','grand-con:room:'+room.code,JSON.stringify(room),String(before)]) !== 1) throw new Conflict();
}
async function rateLimit(ip) {
  const key = crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0,24) + ':' + Math.floor(Date.now()/60000);
  let count;
  if (url) count = await redis(['EVAL',`local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],120) end;return n`,'1','grand-con:limit:'+key]);
  else {
    for (const [k,v] of limits) if (v.until<Date.now()) limits.delete(k);
    const entry=limits.get(key)||{count:0,until:Date.now()+120000};count=++entry.count;limits.set(key,entry);
  }
  if (count>40) throw Object.assign(Error('Too many attempts. Try again in a minute.'),{status:429});
}
module.exports={load,save,rateLimit,Conflict};
