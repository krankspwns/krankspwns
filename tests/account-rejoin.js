// Recover an account-linked seat without sharing guest recovery secrets.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
process.env.GOOGLE_CLIENT_ID='test-google';process.env.ACCOUNT_PEPPER='test-account-rejoin';
delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.KV_REST_API_URL;
const P=require('../lib/platform'), platform=require('../api/platform');
P.verifiers.google=async sub=>({sub});
function call(handler,body,cookie) {
  return new Promise((resolve,reject)=>{
    const out={headers:{}};
    const res={setHeader(k,v){out.headers[k.toLowerCase()]=v;},status(s){out.status=s;return this;},json(data){out.data=data;resolve(out);}};
    Promise.resolve(handler({method:'POST',headers:{host:'x.test','x-kp':'1',cookie:cookie||''},body:{requestId:randomUUID(),...body},query:{}},res)).catch(reject);
  });
}
async function login(sub) {
  const nonce=(await call(platform,{action:'nonce'})).data.nonce;
  const r=await call(platform,{action:'login',provider:'google',idToken:sub,nonce,consent:{accepted:true,age:true,version:P.CONSENT_VERSION}});
  assert.equal(r.status,200);return String(r.headers['set-cookie']).split(';')[0];
}
(async()=>{
  const owner=await login('owner'),other=await login('other');
  for(const game of ['game','last-train','bridge','hot-joker','grand-con']) {
    const api=require('../api/'+game);
    const made=await call(api,{action:'create',name:'Owner'},owner);assert.equal(made.status,200,game+': create');
    const original=made.data, requestId=randomUUID();
    const join={action:'join',code:original.code,name:'New Name',requestId};
    const recovered=await call(api,join,owner);assert.equal(recovered.status,200,game+': account rejoin');
    assert.equal(recovered.data.meId,original.meId,game+': same seat despite new nickname');
    assert.notEqual(recovered.data.tok,original.tok,game+': rotates token');
    const replay=await call(api,join,owner);assert.equal(replay.data.tok,recovered.data.tok,game+': retry-safe token');
    for(const cookie of [undefined,other]) {
      const stolen=await call(api,{action:'join',code:original.code,name:'Owner'},cookie);
      assert.notEqual(stolen.data?.meId,original.meId,game+': name or different account cannot reclaim seat');
    }
    const stale=await call(api,{action:'state',code:original.code,pid:original.meId,tok:original.tok},owner);
    assert.notEqual(stale.status,200,game+': old device signed out');
    const fresh=await call(api,{action:'state',code:original.code,pid:original.meId,tok:recovered.data.tok},owner);
    assert.equal(fresh.status,200,game+': new token works');
    const guest=await call(api,{action:'create',name:'Guest'});assert.equal(guest.status,200);
    const g=guest.data;
    const rejoined=await call(api,{action:'join',code:g.code,name:'Guest',recoveryCode:g.recoveryCode||g.me.recoveryCode});
    assert.equal(rejoined.status,200,game+': guest code still works');assert.equal(rejoined.data.meId,g.meId);
    console.log(game+': account ownership, token rotation/retries and guest recovery passed');
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
