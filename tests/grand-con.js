const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {call,startRedis}=require('./helpers');
(async()=>{
  const redis=process.argv.includes('--redis')?await startRedis():null;
  try{
    if(redis){process.env.UPSTASH_REDIS_REST_URL=redis.url;process.env.UPSTASH_REDIS_REST_TOKEN='test';}
    const handler=require('../api/grand-con'),rules=handler._rules,id=()=>crypto.randomUUID();
    const enter=(action,data)=>call(handler,{action,requestId:id(),...data});
    const host=(await enter('create',{name:'Host'})).j;
    const joined=await Promise.all(Array.from({length:5},(_,i)=>enter('join',{code:host.code,name:'Guest '+i})));
    assert.ok(joined.every(r=>r.s===200));
    const seats=[host,...joined.map(r=>r.j)];
    const get=seat=>call(handler,null,{code:seat.code,pid:seat.meId},{'x-tok':seat.tok});
    const post=async(seat,action,extra={})=>{const current=(await get(seat)).j;return call(handler,{action,requestId:id(),code:seat.code,pid:seat.meId,tok:seat.tok,match:current.match,lotNumber:current.lotNumber,...extra});};
    const raw=async code=>redis?JSON.parse(await redis.client.get('grand-con:room:'+code)):structuredClone(globalThis.__grandConRooms.get(code));
    const save=async room=>redis?redis.client.set('grand-con:room:'+room.code,JSON.stringify(room)):globalThis.__grandConRooms.set(room.code,structuredClone(room));
    const expire=async seat=>{const r=await raw(seat.code);r.deadline=Date.now()-1;await save(r);return (await get(seat)).j;};
    assert.equal((await post(seats[1],'start')).s,403);
    assert.equal((await enter('join',{code:host.code,name:'Host'})).s,409);
    assert.equal((await post(host,'start')).j.phase,'forging');
    assert.equal((await enter('join',{code:host.code,name:'Late arrival'})).s,409);
    let firstVoteRequest;
    for(let round=1;round<=5;round++){
      const views=(await Promise.all(seats.map(get))).map(r=>r.j);
      assert.equal(views[0].lotNumber,round);
      assert.equal(views.filter(v=>v.me.team==='ring').length,2);
      assert.equal(new Set(views.filter(v=>v.me.ring).flatMap(v=>v.me.ring.allies)).size,2);
      for(const v of views){
        assert.equal(v.me.document,null,'House cannot catch an alteration by reading before it is sealed');
        assert.ok(v.players.every(p=>!('team'in p)&&!('tokenHash'in p)));
        assert.ok(!('genuine'in v.lot)&&!('documents'in v)&&!('forgerId'in v));
        if(v.me.team==='house')assert.ok(!('ring'in v.me));
      }
      const ringView=views.find(v=>v.me.ring),editor=seats.find(s=>s.meId===ringView.me.ring.forgerId);
      const house=seats.find(s=>views.find(v=>v.meId===s.meId).me.team==='house');
      const options=ringView.me.ring.options,targetId=options[round%options.length].ownerId;
      assert.equal((await post(house,'forge',{targetId})).s,403);
      assert.equal((await post(editor,'forge',{targetId:'invalid'})).s,400);
      const forgeId=id();
      assert.equal((await post(editor,'forge',{targetId,requestId:forgeId})).j.phase,'discussion');
      assert.equal((await post(editor,'forge',{targetId,requestId:forgeId})).s,200,'forgery replay is idempotent');
      assert.equal((await post(editor,'forge',{targetId:options.find(o=>o.ownerId!==targetId).ownerId,requestId:forgeId})).s,409);
      const delivered=(await Promise.all(seats.map(get))).map(r=>r.j);
      assert.equal(new Set(delivered.map(v=>v.me.document.source)).size,6,'each player has a distinct source');
      assert.equal(delivered.find(v=>v.meId===targetId).me.document.text,options.find(o=>o.ownerId===targetId).altered);
      for(const v of delivered.filter(v=>v.me.team==='house')){
        assert.ok(!('tamper'in v.me.document)&&!('original'in v.me.document)&&!('replacement'in v.me.document));
        assert.ok(!JSON.stringify(v).includes('oppositeForged'));
      }
      if(round===1){
        const before=delivered[0].deadline,extension=(await post(house,'extend')).j;
        assert.equal(extension.deadline,before+30000);assert.equal((await post(editor,'extend')).s,409);
        assert.equal((await post(house,'advance')).s,house.meId===host.meId?200:403);
        if(house.meId!==host.meId)await post(host,'advance');
      }else await post(host,'advance');
      const voting=(await get(host)).j;assert.equal(voting.phase,'voting');assert.equal(voting.required,4);
      assert.equal((await post(host,'vote',{choice:'maybe'})).s,400);
      const genuine=ringView.me.ring.genuine,housePoint=round%2===1;
      const choice=(genuine===housePoint)?'approve':'reject';
      const requestId=id();if(round===1)firstVoteRequest=requestId;
      assert.equal((await post(host,'vote',{choice,requestId})).s,200);
      const hidden=(await get(seats[1])).j;
      assert.equal(hidden.me.vote,null);assert.ok(hidden.players.find(p=>p.id===host.meId).voteLocked);
      assert.ok(hidden.players.every(p=>!('choice'in p)&&!('vote'in p)));
      assert.equal((await post(host,'vote',{choice})).s,409,'votes cannot be changed');
      const votes=await Promise.all(seats.slice(1).map(s=>post(s,'vote',{choice})));
      assert.ok(votes.every(r=>r.s===200));
      const result=(await get(host)).j;assert.equal(result.phase,'reveal');assert.equal(result.history.length,round);
      const last=result.history.at(-1);assert.equal(last.pointTo,housePoint?'house':'ring');assert.equal(last.documents.length,6);
      assert.equal(last.documents.filter(d=>d.received!==d.original).length,1,'exactly one report changes');
      assert.equal(last.tamper.ownerId,targetId);assert.ok(result.players.every(p=>!('team'in p)),'teams stay hidden at deal reveals');
      assert.equal((await post(host,'vote',{choice,requestId})).s,200,'vote response can be replayed after settlement');
      assert.equal((await get(host)).j.history.length,round,'replay does not award another point');
      await post(host,'next');
    }
    const final=(await get(host)).j;assert.equal(final.phase,'finished');assert.equal(final.winningTeam,'house');assert.deepEqual(final.score,{house:3,ring:2});assert.ok(final.players.every(p=>p.team));
    const stale=await post(host,'vote',{choice:'approve',requestId:firstVoteRequest});assert.equal(stale.s,409,'different request fingerprint is rejected');
    const recoverRequest={action:'join',code:host.code,name:'Host',recoveryCode:final.me.recoveryCode,requestId:id()};
    const recovered=await call(handler,recoverRequest);assert.equal(recovered.s,200);assert.notEqual(recovered.j.tok,host.tok);assert.equal((await get(host)).s,401);
    assert.equal((await call(handler,recoverRequest)).j.tok,recovered.j.tok);assert.equal((await enter('join',{code:host.code,name:'Host',recoveryCode:final.me.recoveryCode})).s,409);
    const nextHost=recovered.j;await post(nextHost,'start');assert.equal((await get(nextHost)).j.history.length,0);
    assert.equal((await expire(nextHost)).phase,'discussion','expired Ring editor picks one report automatically');
    assert.equal((await expire(nextHost)).phase,'voting');
    assert.equal((await expire(nextHost)).phase,'reveal','missing votes cannot stall a match');
    const missing=(await get(nextHost)).j.history[0];assert.equal(missing.approved,false);assert.ok(missing.votes.every(v=>v.choice==='missed'));
    if(redis){assert.ok(await redis.client.ttl('grand-con:room:'+host.code)>0);redis.fault.unavailable=true;assert.equal((await get(nextHost)).s,503);redis.fault.unavailable=false;}

    // Vote threshold is fixed when voting opens; a tie rejects even if a voter leaves.
    const fixture=()=>({lot:0,phase:'voting',score:{house:0,ring:0},lots:[{caseId:'harbor',genuine:true}],electorate:['a','b','c','d'],votes:{a:'approve',b:'approve',c:'reject'},tamper:{ownerId:'a'},documents:[],history:[]});
    const tie=fixture();rules.settle(tie);assert.equal(tie.history[0].approved,false);assert.equal(tie.history[0].pointTo,'ring');
    const majority=fixture();majority.votes.d='approve';rules.settle(majority);assert.equal(majority.history[0].approved,true);assert.equal(majority.score.house,1);
    const sweep=fixture();sweep.score.house=2;sweep.votes.d='approve';rules.settle(sweep);assert.equal(sweep.score.house,3);
    // Every authored case works with both truths and 4–12 distinct document assignments.
    for(const c of require('../lib/grand-con-cases'))for(const genuine of [false,true])for(let n=4;n<=12;n++){
      const r={lot:0,players:Array.from({length:n},(_,i)=>({id:String(i),team:i<Math.floor(n/3)?'ring':'house'})),lots:[{caseId:c.id,genuine}]};
      rules.beginLot(r);rules.deliver(r,r.players[0].id);assert.equal(r.documents.length,n);assert.equal(new Set(r.documents.map(d=>d.source)).size,n);
      assert.ok(r.documents.some(d=>d.ownerId===r.tamper.ownerId&&d.text!==r.tamper.altered));
      assert.ok(r.players.some(p=>p.id===r.tamper.ownerId));
    }
    const crowd=(await enter('create',{name:'Crowd host'})).j;
    const crowdJoins=await Promise.all(Array.from({length:11},(_,i)=>enter('join',{code:crowd.code,name:'Crowd '+i})));
    assert.ok(crowdJoins.every(r=>r.s===200));await post(crowd,'start');await expire(crowd);await post(crowd,'advance');
    const locked=await Promise.all(crowdJoins.map(r=>post(r.j,'vote',{choice:'approve'})));assert.ok(locked.every(r=>r.s===200));
    const hostLeft=(await post(crowd,'leave')).j;assert.notEqual(hostLeft.hostId,crowd.meId);assert.equal(hostLeft.phase,'voting');assert.equal(hostLeft.required,7,'leaving cannot reduce approval threshold');
    await expire(crowdJoins[0].j);assert.equal((await get(crowdJoins[0].j)).j.history[0].votes.find(v=>v.id===crowd.meId).choice,'missed');
    // Saved auction seats survive the rules upgrade, but their obsolete match does not.
    const legacy=(await enter('create',{name:'Legacy'})).j,r=await raw(legacy.code);delete r.rulesVersion;r.phase='bidding';r.players[0].team='gilt';r.lots=[{name:'Old auction'}];await save(r);
    const upgraded=(await get(legacy)).j;assert.equal(upgraded.phase,'lobby');assert.equal(upgraded.me.team,null);assert.ok(upgraded.notice);assert.equal(upgraded.me.recoveryCode,legacy.me.recoveryCode);
    console.log('Grand Con '+(redis?'Redis':'memory')+': five-deal match, privacy, sabotage, sealed votes, deadlines, 12-player concurrency, recovery and migration passed');
  }finally{if(redis)await redis.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
