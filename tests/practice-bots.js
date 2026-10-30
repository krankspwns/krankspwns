process.env.BOT_FAST='1';process.env.LAST_TRAIN_AUTO_SHUFFLE='off';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
let handlers,R,trainBot,conBot,crownBot,backend;
const realNow=Date.now;let now=realNow();Date.now=()=>now;
async function call(game,body,method='POST'){
  let status,data;await handlers[game]({method,body:{requestId:crypto.randomUUID(),...body},query:body,headers:{'x-tok':body.tok,host:'x.test'},url:'/api/'+game},{setHeader(){},status(n){status=n;return this;},json(j){data=j;}});return {status,data};
}
const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.data));return result.data;};
const creds=s=>({code:s.code,pid:s.meId,tok:s.tok});
async function send(game,seat,action,body={}){const state=ok(await call(game,seat,'GET'));return ok(await call(game,{...seat,action,match:state.match||0,round:state.round||0,step:state.step||0,board:state.board,dealStep:state.dealStep,lotNumber:state.lotNumber,...body}));}
async function setup(game,count){let state=ok(await call(game,{action:'create',name:'Host'}));const seat=creds(state);for(let i=1;i<count;i++)state=await send(game,seat,'addBot');return {seat,state};}
async function controls(){
  for(const game of Object.keys(handlers)){
    const {seat}=await setup(game,1),friend=creds(ok(await call(game,{action:'join',code:seat.code,name:'Friend'})));
    assert.equal((await call(game,{...friend,action:'addBot',match:0,round:0,step:0})).status,403);
    const requestId=crypto.randomUUID(),request={...seat,action:'addBot',match:0,round:0,step:0,requestId};
    const first=ok(await call(game,request)),again=ok(await call(game,request));assert.equal(first.players.length,again.players.length,'idempotent add');
    assert.equal(again.players.filter(p=>p.bot).length,1);
    assert.ok(!JSON.stringify(again).includes('tokenHash'));assert.ok(!JSON.stringify(again).includes('botWait'));
    assert.equal((await call(game,{...friend,action:'removeBot',match:0,round:0,step:0})).status,403);
    const removed=await send(game,seat,'removeBot');assert.equal(removed.players.filter(p=>p.bot).length,0);
    assert.equal((await call(game,{...seat,action:'removeBot',match:0,round:0,step:0,targetId:friend.pid})).status,409);
    for(let i=2;i<12;i++)await send(game,seat,'addBot');
    assert.equal((await call(game,{...seat,action:'addBot',match:0,round:0,step:0})).status,409,'capacity');
    const left=await send(game,seat,'leave');if(game!=='reckoning')assert.equal(left.hostId,friend.pid);
  }
}
async function crown(){
  for(const hand of [['AS','2H','10C','JS','QH','KS','JK'],['JK','JK','2S','3C','4D','5H','6S']]){
    const cards=crownBot.arrange(hand);assert.deepEqual(cards.slice().sort(),hand.slice().sort());assert.equal(cards.length,7);
  }
  const {seat}=await setup('reckoning',4);await send('reckoning',seat,'settings',{drink:false,timer:0});
  let state=await send('reckoning',seat,'deal');
  assert.equal((await call('reckoning',{...seat,action:'removeBot'})).status,409);
  for(let slot=0;slot<7;slot++)state=await send('reckoning',seat,'place',{slot,card:state.hand[0]});
  state=await send('reckoning',seat,'ready',{ready:true});
  assert.ok(state.players.every(p=>p.ready));assert.ok(state.players.filter(p=>p.bot).every(p=>p.board.every(s=>s.c==='?')),'hidden boards stay hidden');
  now+=1500;state=ok(await call('reckoning',seat,'GET'));
  assert.equal(state.predN,3,'bots make all four calls');
  for(let row=0;row<4;row++)state=await send('reckoning',seat,'predict',{row,target:'-'});
  now+=2000;
  for(let row=0;row<4;row++){
    state=ok(await call('reckoning',seat,'GET'));
    state=await send('reckoning',seat,'flipRow',{row,up:true});
    assert.equal(state.currentRow,row+1);
  }
  assert.equal(state.wallet.pts,25,'solo practice does not earn WP');
  assert.ok(state.players.filter(p=>p.bot).every(p=>p.wp===25),'bots earn no WP');
  state=await send('reckoning',seat,'addBot');assert.equal(state.players.at(-1).spectator,true,'new result-screen bot waits for the next deal');
  state=await send('reckoning',seat,'deal');assert.equal(state.players.filter(p=>p.bot).length,4);assert.ok(state.players.every(p=>p.handCount+p.board.filter(Boolean).length===7));
}
async function train(){
  const {seat}=await setup('last-train',6);let state=await send('last-train',seat,'start');
  assert.equal((await call('last-train',{...seat,action:'removeBot',match:state.match,round:state.round,step:state.step})).status,409);
  state=await send('last-train',seat,'pause');const pausedVersion=state.version;now+=100000;
  state=ok(await call('last-train',seat,'GET'));assert.equal(state.version,pausedVersion,'paused bots do not act');assert.equal(state.paused,true);
  await send('last-train',seat,'resume');state=await send('last-train',seat,'ready');
  let turns=0;
  while(state.phase!=='finished'&&turns++<250){
    state=ok(await call('last-train',seat,'GET'));
    if(state.phase==='finished')break;
    for(const p of state.players.filter(p=>p.id!==seat.pid&&p.alive)){assert.equal(p.role,undefined);assert.equal(p.group,undefined);}
    const memory={pid:seat.pid};require('../public/last-train-test-strategy').remember(memory,state);
    const move=trainBot.decide(state,memory);
    if(move){state=await send('last-train',seat,move.action,move);continue;}
    if(state.deadline)now=state.deadline+1;else assert.fail('stuck phase '+state.phase);
  }
  assert.equal(state.phase,'finished','a whole journey finishes with server bots');
  assert.ok(state.speeches.length>0,'bots discuss');assert.ok(state.history.some(e=>e.type==='vote'&&e.votes.some(v=>v.id!==seat.pid)),'bots vote');
  assert.equal(state.me.wallet.wp,25,'solo train practice does not earn WP');
  assert.ok(!JSON.stringify(state).includes('botMemory'));
  state=await send('last-train',seat,'removeBot');assert.equal(state.players.filter(p=>p.bot).length,4);
}
function trainRoles(){
  for(const role of Object.keys(R.ROLES)){
    const room={code:'TEST',players:Array.from({length:7},(_,i)=>({id:'p'+i,name:'P'+i})),settings:{autoShuffle:false,events:false,discussion:'chat',extra:'brave',blocker:true},phase:'lobby'};
    R.start(room);room.players.forEach((p,i)=>Object.assign(p,{role:i===0?role:i===1?'saboteur':i===2?'medic':i===3?'inspector':'passenger',originalRole:i===0?role:'passenger',alive:true,used:{},reports:[]}));
    const bot=room.players[0];bot.bot=true;R.beginNight(room);room.phase='night';
    room.night.index=['medic','inspector','witness','conductor','signalman'].includes(role)?1:0;
    room.night.patientId='p4';
    const before=JSON.stringify(room.night);trainBot.tick(room);
    if(!['trainee','passenger','speaker'].includes(role))assert.notEqual(JSON.stringify(room.night),before,'power used or intentionally skipped: '+role);
    assert.ok(!bot.used||!Object.values(bot.used).includes(-1));
  }
}
async function con(){
  const {seat}=await setup('grand-con',4);let state=await send('grand-con',seat,'start');
  assert.equal((await call('grand-con',{...seat,action:'addBot'})).status,409);
  let rounds=0;
  while(state.phase!=='finished'&&rounds++<6){
    if(state.me.ring?.forgerId===seat.pid&&!state.me.ring.tamper)state=await send('grand-con',seat,'forge',{targetId:state.me.ring.options[0].ownerId});
    now=state.deadline+1;state=ok(await call('grand-con',seat,'GET'));assert.equal(state.phase,'discussion');
    state=await send('grand-con',seat,'claim',{choice:'unsure',text:'Let us compare clues.'});
    assert.equal(state.claims.filter(c=>c.id!==seat.pid).length,3,'bots share public evidence');
    state=await send('grand-con',seat,'advance');
    state=await send('grand-con',seat,'vote',{choice:'approve'});assert.equal(state.phase,'reveal');
    assert.equal(state.history.at(-1).votes.filter(v=>v.choice!=='missed').length,4,'all bots vote');
    for(const p of state.players.filter(p=>p.id!==seat.pid))assert.equal(p.team,undefined,'teams stay secret');
    state=await send('grand-con',seat,'next');
  }
  assert.equal(state.phase,'finished');assert.equal(state.social.wallet.pts,25,'solo con practice does not earn WP');
  assert.ok(!JSON.stringify(state).includes('botMemory'));
  assert.equal(conBot.verdict({meId:'a',lotNumber:1,me:{team:'house',document:{text:'Unknown clue'}},claims:[{id:'b',text:'I think fake.',choice:'reject'}]}),'reject');
}
(async()=>{try{
  if(process.argv.includes('--redis')){backend=await require('./helpers').startRedis();process.env.UPSTASH_REDIS_REST_URL=backend.url;process.env.UPSTASH_REDIS_REST_TOKEN='local-test';}
  handlers={reckoning:require('../api/game'),'last-train':require('../api/last-train'),'grand-con':require('../api/grand-con')};
  R=require('../lib/last-train-rules');trainBot=require('../lib/last-train-bot');conBot=require('../lib/grand-con-bot');crownBot=require('../lib/crown-clash-bot');
  const B=require('../lib/practice-bots');delete process.env.BOT_FAST;const waitBot={};assert.equal(B.due(waitBot,'night').act,false);assert.equal(B.due(waitBot,'night').changed,false);now+=3000;assert.equal(B.due(waitBot,'night').act,true);assert.equal(B.due(waitBot,'next-night').act,false);process.env.BOT_FAST='1';
  await controls();await crown();trainRoles();await train();await con();console.log('Practice bots: host controls, limits, receipts, private views, every train role, whole matches and solo rewards passed');}finally{Date.now=realNow;await backend?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
