const crypto = require('node:crypto');
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const memory = globalThis.__lastTrainRooms ||= new Map();
const voices = globalThis.__lastTrainVoices ||= new Map();
const limits = globalThis.__lastTrainLimits ||= new Map();
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
  const raw = await redis(['GET', 'last-train:room:' + code]);
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
  if (await redis(['EVAL',script,'1','last-train:room:'+room.code,JSON.stringify(room),String(before)]) !== 1) throw new Conflict();
}
// Recordings are separate from the frequently polled room JSON and expire after 12 hours.
async function saveVoice(code, match, clip) {
  const key = ['last-train:voice', code, match, clip.id].join(':');
  const payload = JSON.stringify(clip);
  if (url) {
    const inserted = await redis(['SET', key, payload, 'EX', 43200, 'NX']);
    if (!inserted) {
      const existing = await redis(['GET', key]);
      if (existing !== payload) throw Object.assign(Error('That recording was already uploaded.'), { status: 409 });
    }
  } else {
    for (const [k,v] of voices) if (v.until < Date.now()) voices.delete(k);
    const existing = voices.get(key);
    if (existing && existing.payload !== payload) throw Object.assign(Error('That recording was already uploaded.'), { status: 409 });
    voices.set(key, { payload, until: Date.now() + 43200000 });
  }
}
async function loadVoice(code, match, id) {
  const key = ['last-train:voice', code, match, id].join(':');
  const entry = voices.get(key);
  const raw = url ? await redis(['GET', key]) : entry && entry.until > Date.now() ? entry.payload : null;
  return raw ? JSON.parse(raw) : null;
}
async function rateLimit(ip) {
  const key = crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0,24) + ':' + Math.floor(Date.now()/60000);
  let count;
  if (url) count = await redis(['EVAL',`local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],120) end;return n`,'1','last-train:limit:'+key]);
  else {
    for (const [k,v] of limits) if (v.until<Date.now()) limits.delete(k);
    const entry=limits.get(key)||{count:0,until:Date.now()+120000};count=++entry.count;limits.set(key,entry);
  }
  if (count>40) throw Object.assign(Error('Too many attempts. Try again in a minute.'),{status:429});
}
// On Vercel without Redis, rooms live only in one server instance's memory and vanish when it is recycled.
const unsaved=()=>!url&&!!process.env.VERCEL;
module.exports={load,save,saveVoice,loadVoice,rateLimit,Conflict,unsaved};
