process.env.LAST_TRAIN_AUTO_SHUFFLE = 'off';
process.env.LAST_TRAIN_EVENTS = 'off';
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { call, startRedis } = require('./helpers');
(async () => {
  const redis = process.argv.includes('--redis') ? await startRedis() : null;
  if (redis) { process.env.UPSTASH_REDIS_REST_URL=redis.url;process.env.UPSTASH_REDIS_REST_TOKEN='test'; }
  try {
    const handler=require('../api/last-train'),rules=require('../lib/last-train-rules'),store=require('../lib/last-train-store');
    const enter=(action,extra)=>call(handler,{action,requestId:crypto.randomUUID(),...extra});
    const host=(await enter('create',{name:'Host'})).j,seats=[host];for(let i=1;i<6;i++)seats.push((await enter('join',{code:host.code,name:'Guest '+i})).j);
    let room=await store.load(host.code);room.settings.discussion='chat';rules.start(room);rules.beginDiscussion(room);await store.save(room);
    const first=seats.find(s=>s.meId===rules.speakerId(room)),other=seats.find(s=>s.meId!==first.meId);
    const get=(s,extra={})=>call(handler,null,{code:s.code,pid:s.meId,...extra},{'x-tok':s.tok});
    const post=async(s,action,extra={})=>{const r=await store.load(s.code);return enter(action,{code:s.code,pid:s.meId,tok:s.tok,match:r.match,round:r.round,step:r.step,...extra});};
    assert.equal((await post(other,'beginVoice')).s,403);
    const begun=(await post(first,'beginVoice')).j,draft=begun.me.voiceDraft;assert.ok(draft.id);assert.equal((await get(other)).j.me.voiceDraft,null);
    const audioData=Buffer.concat([Buffer.from('1a45dfa3','hex'),Buffer.alloc(80,1)]).toString('base64');
    const payload={voiceId:draft.id,mimeType:'audio/webm;codecs=opus',durationMs:1500,audioData};
    assert.equal((await post(other,'speakVoice',payload)).s,409);
    assert.equal((await post(first,'speakVoice',{...payload,durationMs:45501})).s,400);
    assert.equal((await post(first,'speakVoice',{...payload,mimeType:'text/html'})).s,400);
    assert.equal((await post(first,'speakVoice',{...payload,audioData:Buffer.alloc(600000,1).toString('base64')})).s,413);
    assert.equal((await post(first,'speakVoice',{...payload,audioData:Buffer.alloc(80,1).toString('base64')})).s,400);
    // Reserve during the turn, then allow a short upload grace period without accepting another speaker's identity.
    const original=await store.load(host.code);rules.nextSpeaker(original);await store.save(original);
    const body={action:'speakVoice',requestId:crypto.randomUUID(),code:first.code,pid:first.meId,tok:first.tok,match:begun.match,round:begun.round,step:begun.step,...payload};
    const sent=await call(handler,body);assert.equal(sent.s,200);assert.equal(sent.j.speeches.length,1);assert.equal(sent.j.speakerId,rules.speakerId(original),'late upload must not skip the next speaker');assert.equal(sent.j.speeches[0].audio.available,true);assert.ok(!JSON.stringify(sent.j).includes(audioData));
    assert.equal((await call(handler,body)).s,200);assert.equal((await store.load(host.code)).speeches.length,1);
    assert.equal((await post(first,'speakVoice',payload)).s,409);
    const downloaded=await get(other,{voice:draft.id});assert.equal(downloaded.s,200);assert.equal(downloaded.j.data,audioData);
    assert.equal((await call(handler,null,{code:host.code,pid:other.meId,voice:draft.id},{'x-tok':'wrong'})).s,401);
    assert.equal((await get(other,{voice:crypto.randomUUID()})).s,404);
    // Sharing voice ends the speaker's turn, making the clip immediately playable by the room.
    room=await store.load(host.code);const second=seats.find(s=>s.meId===rules.speakerId(room));const began=(await post(second,'beginVoice')).j;
    assert.equal((await post(host,'pause')).s,200);
    assert.equal((await post(second,'speakVoice',{...payload,voiceId:began.me.voiceDraft.id})).s,200);
    assert.equal((await get(first,{voice:began.me.voiceDraft.id})).s,200);assert.notEqual((await get(first)).j.speakerId,second.meId);const paused=(await get(first)).j;assert.equal(paused.paused,true);assert.equal(paused.remainingMs,45000);assert.equal(paused.deadline,null);await post(host,'resume');assert.equal((await get(second,{voice:began.me.voiceDraft.id})).s,200);
    assert.equal((await post(second,'speak',{text:'A second submission'})).s,409);
    assert.equal((await get(first,{voice:began.me.voiceDraft.id})).s,200);
    // A late upload expires, and a previous match can never attach audio to the new game.
    room=await store.load(host.code);const third=seats.find(s=>s.meId===rules.speakerId(room)),thirdDraft=(await post(third,'beginVoice')).j.me.voiceDraft;
    room=await store.load(host.code);rules.nextSpeaker(room);room.voiceDrafts[third.meId].expiresAt=Date.now()-1;await store.save(room);
    assert.equal((await post(third,'speakVoice',{...payload,voiceId:thirdDraft.id})).s,409);
    room=await store.load(host.code);rules.start(room);await store.save(room);
    assert.equal((await get(first,{voice:draft.id})).s,404);assert.equal((await call(handler,{...body,requestId:crypto.randomUUID()})).s,409);assert.equal((await store.load(host.code)).speeches.length,0);
    console.log('Last Train voice '+(redis?'Redis':'memory')+': authenticated turn reservations, bounded clips, upload grace, idempotency, playback timing and match isolation passed');
  } finally { if(redis)await redis.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
