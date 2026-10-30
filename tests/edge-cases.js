// Regressions for the follow-up whole-repository review (memory backend).
process.env.GOOGLE_CLIENT_ID='test-edge';process.env.ACCOUNT_PEPPER='test-edge';
process.env.LAST_TRAIN_EVENTS='off';process.env.LAST_TRAIN_AUTO_SHUFFLE='off';
delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.KV_REST_API_URL;
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {call}=require('./helpers'),P=require('../lib/platform');
P.verifiers.google=async sub=>({sub});
const apis=Object.fromEntries(['game','bridge','hot-joker','last-train','grand-con'].map(g=>[g,require('../api/'+g)]));
let ip=0;
const post=(g,body,headers={})=>call(apis[g],{requestId:randomUUID(),...body},{},{'x-forwarded-for':'edge-'+(++ip),...headers});
const state=(g,s)=>call(apis[g],null,{code:s.code,pid:s.meId,f:'1'},{'x-tok':s.tok});
const mem=g=>g==='game'?globalThis.__rooms:g==='grand-con'?globalThis.__grandConRooms:g==='last-train'?globalThis.__lastTrainRooms:globalThis.__roomStoreRooms[g];
async function act(g,s,action,extra={}){const v=(await state(g,s)).j;return post(g,{action,code:s.code,pid:s.meId,tok:s.tok,match:v.match||0,round:v.round||0,step:v.step||0,board:v.board,dealStep:v.dealStep,...extra});}
async function create(g,n=1,headers={}){const h=await post(g,{action:'create',name:'Host'},headers);assert.equal(h.s,200);const seats=[h.j];for(let i=1;i<n;i++){const p=await post(g,{action:'join',code:h.j.code,name:'P'+i});assert.equal(p.s,200);seats.push(p.j);}return seats;}
async function login(sub){const req={headers:{'x-forwarded-for':'edge-login'}};return P.login(req,{provider:'google',idToken:sub,nonce:await P.issueNonce('edge-login'),consent:{accepted:true,age:true,version:P.CONSENT_VERSION}});}
(async()=>{
  for(const g of Object.keys(apis)){
    const [h]=await create(g),body={action:'join',code:h.code,name:'RetryGuest',requestId:randomUUID()};
    const first=await post(g,body),retry=await post(g,body);
    assert.equal(first.s,200,g);assert.equal(retry.s,200,g);assert.equal(first.j.meId,retry.j.meId,g+' initial retry keeps the seat');assert.equal(first.j.tok,retry.j.tok);
    assert.equal(mem(g).get(h.code).players.length,2);
    const parallel={action:'join',code:h.code,name:'Concurrent',requestId:randomUUID()};
    const both=await Promise.all([post(g,parallel),post(g,parallel)]);
    assert.ok(both.every(r=>r.s===200));assert.equal(both[0].j.meId,both[1].j.meId,g+' concurrent admission commits once');
    assert.equal(mem(g).get(h.code).players.length,3);
    assert.equal((await post(g,{...body,name:'Other'})).s,409,'an admission cannot change identity');
    const recovery=first.j.recoveryCode||first.j.me.recoveryCode;
    assert.equal((await post(g,{action:'join',code:h.code,name:'RetryGuest',recoveryCode:recovery})).s,200);
    assert.equal((await post(g,body)).s,409,'a recovered seat cannot be reclaimed using its old admission');
    const copy=JSON.stringify((await state(g,h)).j);assert.ok(!copy.includes('admission')&&!copy.includes(body.requestId),'admission capabilities stay private');
  }
  {
    const [h]=await create('game'),body={action:'join',name:'Query Guest',requestId:randomUUID()};
    const a=await call(apis.game,body,{code:h.code}),b=await call(apis.game,body,{code:h.code});
    assert.equal(a.s,200);assert.equal(b.s,200);assert.equal(a.j.meId,b.j.meId,'Crown query-code joins also replay safely');
  }
  for(const [g,n] of [['bridge',4],['hot-joker',10],['grand-con',12]]){
    const seats=await create(g,n),h=seats[0];assert.equal((await act(g,h,'start')).s,200);
    mem(g).get(h.code).phase='finished';assert.equal((await act(g,seats[1],'leave')).s,200);
    assert.equal((await post(g,{action:'join',code:h.code,name:'Replacement'})).s,200);
    const denied=await post(g,{action:'join',code:h.code,name:'P1',recoveryCode:seats[1].recoveryCode||seats[1].me.recoveryCode});
    assert.equal(denied.s,409,g+' recovery respects a full room');assert.equal(mem(g).get(h.code).players.filter(p=>!p.departed).length,n);
  }
  {
    const [h]=await create('game');await act('game',h,'addBot');await act('game',h,'leave');
    const joined=await post('game',{action:'join',code:h.code,name:'New Host'});assert.equal(joined.j.hostId,joined.j.meId);
    assert.equal((await act('game',joined.j,'deal')).s,200);
    const old=mem('game').get(h.code).round;await act('game',joined.j,'deal');
    const r=mem('game').get(h.code),p=r.players.find(p=>p.id===joined.j.meId);await act('game',joined.j,'place',{card:p.hand[0],slot:0});
    assert.equal((await act('game',joined.j,'move',{from:0,to:1,round:old})).s,409);
    assert.equal((await act('game',joined.j,'move',{from:0,to:1,round:undefined})).s,409,'missing round is not a bypass');
    assert.ok(mem('game').get(h.code).players.find(p=>p.id===joined.j.meId).board[0]);
  }
  {
    const seats=await create('bridge',4),h=seats[0];await act('bridge',h,'start');
    const r=mem('bridge').get(h.code);r.board=2;r.d.board=2;r.d.turn=0;
    assert.equal((await act('bridge',h,'call',{board:1,call:'P'})).s,409);
    assert.equal((await act('bridge',h,'call',{board:undefined,call:'P'})).s,409);
    const before=(await state('bridge',h)).j;await act('bridge',h,'call',{call:'P'});
    const current=mem('bridge').get(h.code);current.d.turn=0;
    assert.equal((await act('bridge',h,'call',{call:'P',dealStep:before.dealStep})).s,409,'old turn in the same deal is rejected');
    current.phase='finished';current.scores=[1,8,2,0];await act('bridge',seats[1],'leave');await act('bridge',h,'shuffleSeats');
    const after=(await state('bridge',h)).j;assert.equal(after.players.find(p=>p.id===after.seats[after.finalWinners[0]])?.name,'P1');
    // Removing a bot must also retain its historical identity.
    const bots=await create('bridge');for(let i=0;i<3;i++)await act('bridge',bots[0],'addBot');await act('bridge',bots[0],'start');
    const rb=mem('bridge').get(bots[0].code);rb.phase='finished';rb.scores=[0,1,2,8];const winner=rb.seats[3];await act('bridge',bots[0],'removeBot');
    assert.ok((await state('bridge',bots[0])).j.players.some(p=>p.id===winner));
  }
  {
    const seats=await create('last-train',5),h=seats[0];await act('last-train',h,'start');
    const watcher=(await post('last-train',{action:'join',code:h.code,name:'Watcher'})).j;
    for(const s of seats)assert.equal((await act('last-train',s,'leave')).s,200);
    assert.equal((await state('last-train',watcher)).j.hostId,watcher.meId);
    mem('last-train').get(h.code).hostId=null;
    assert.equal((await state('last-train',watcher)).j.hostId,watcher.meId,'a saved abandoned room repairs its host on reload');
    assert.equal((await act('last-train',watcher,'night',{power:'pass'})).s,403,'observer host gains no secret powers');
    assert.equal((await act('last-train',watcher,'restart',{to:'lobby'})).s,200,'observer host can recover an abandoned journey');
    const lobby=(await state('last-train',watcher)).j;assert.equal(lobby.phase,'lobby');assert.equal(lobby.me.observer,false);assert.equal(lobby.hostId,watcher.meId);
  }
  for(const g of Object.keys(apis)){
    const session=await login('revoke-'+g),cookie='kp_session='+session.tok;
    const [h]=await create(g,1,{cookie});await P.signOutEverywhere(session.account.id);
    assert.equal((await act(g,h,'buy',{kind:g==='last-train'?'frame':'gift',key:g==='last-train'?'silver':'tomato'})).s,401,g+' revoked room cannot charge an account');
    assert.equal((await P.getUser(session.account.id)).pts,25);
    const fresh=await login('revoke-'+g);
    const recovered=await post(g,{action:'join',code:h.code,name:'Host'},{cookie:'kp_session='+fresh.tok});assert.equal(recovered.s,200);
    assert.equal((await act(g,recovered.j,'buy',{kind:g==='last-train'?'frame':'gift',key:g==='last-train'?'silver':'tomato'})).s,200,g+' signing in and recovering refreshes the grant');
  }
  {
    const session=await login('switch-revoked'),cookie='kp_session='+session.tok;
    const [h]=await create('hot-joker',2,{cookie});await P.signOutEverywhere(session.account.id);
    const v=(await state('hot-joker',h)).j;
    const switched=await act('hot-joker',h,'switchGame',{game:'bridge',version:v.version});assert.equal(switched.s,200);
    const target={...h,code:switched.j.roomSwitch.code};
    assert.equal((await act('bridge',target,'buy',{kind:'gift',key:'tomato'})).s,401,'switching games does not renew a revoked grant');
    // Grant validation also happens inside the account CAS, not only in the room precheck.
    await assert.rejects(P.buy(session.account.id,'gift','tomato',randomUUID(),0),e=>e.status===401);
  }
  {
    const session=await login('cleanup-fault'),kv=require('../lib/kv'),remove=kv.del;
    kv.del=async()=>{throw Object.assign(Error('Storage unavailable'),{status:503});};
    try { await assert.rejects(P.signOutEverywhere(session.account.id),e=>e.status===503); }
    finally { kv.del=remove; }
    assert.equal(await P.identify({headers:{cookie:'kp_session='+session.tok}}),null,'a failed cleanup cannot keep an old account session alive');
    await assert.rejects(P.assertRoomGrant(session.account.id,0),e=>e.status===401,'room grants revoke before session cleanup can fail');
  }
  console.log('Follow-up audit: retry-safe guest admission, capacity, round/deal fences, host recovery, historical identities and account grant revocation passed for all five games');
})().catch(e=>{console.error(e);process.exitCode=1});
