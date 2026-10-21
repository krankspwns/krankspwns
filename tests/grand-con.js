const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {call,startRedis}=require('./helpers');
(async()=>{
  const redis=process.argv.includes('--redis')?await startRedis():null;
  try{
    if(redis){process.env.UPSTASH_REDIS_REST_URL=redis.url;process.env.UPSTASH_REDIS_REST_TOKEN='test';}
    const handler=require('../api/grand-con');
    const id=()=>crypto.randomUUID();
    const enter=(action,data)=>call(handler,{action,requestId:id(),...data});
    const host=(await enter('create',{name:'Host'})).j;
    const joined=await Promise.all(Array.from({length:3},(_,i)=>enter('join',{code:host.code,name:'Guest '+i})));
    assert.ok(joined.every(r=>r.s===200));
    const seats=[host,...joined.map(r=>r.j)];
    const get=seat=>call(handler,null,{code:host.code,pid:seat.meId},{'x-tok':seat.tok});
    const post=async(seat,action,extra={})=>{const current=(await get(seat)).j;return call(handler,{action,requestId:id(),code:host.code,pid:seat.meId,tok:seat.tok,match:current.match,lotNumber:current.lotNumber,...extra});};
    assert.equal((await post(seats[1],'start')).s,403);
    assert.equal((await enter('join',{code:host.code,name:'Host'})).s,409);
    assert.equal((await post(host,'start')).s,200);
    const views=await Promise.all(seats.map(get));
    for(const response of views){
      assert.ok(response.j.me.team);assert.equal(response.j.players.length,4);
      assert.ok(response.j.players.every(p=>!('team'in p)&&!('tokenHash'in p)&&!('used'in p)));
      assert.ok(!('genuine'in response.j.lot)&&!('value'in response.j.lot));
    }
    assert.equal((await enter('join',{code:host.code,name:'Late arrival'})).s,409);
    for(let lot=1;lot<=5;lot++){
      assert.equal((await post(host,'advance')).j.phase,'actions');
      const locked=await Promise.all(seats.map((seat,i)=>post(seat,'power',{power:lot===1&&i===0?'investigate':'pass'})));
      assert.ok(locked.every(r=>r.s===200));
      assert.equal((await get(host)).j.phase,'bidding');
      if(lot===1){assert.ok((await get(host)).j.me.action.report);assert.ok(!(await get(seats[1])).j.me.action.report);}
      assert.equal((await post(host,'bid',{amount:999,verdict:'pass'})).s,400);
      const requestId=id();
      const bids=await Promise.all(seats.map((seat,i)=>post(seat,'bid',{requestId:i===0?requestId:id(),amount:i===0?3:0,verdict:'genuine'})));
      assert.ok(bids.every(r=>r.s===200));
      const revealed=(await get(host)).j;
      assert.equal(revealed.phase,'reveal');assert.equal(revealed.history.length,lot);
      const replay=await call(handler,{action:'bid',code:host.code,pid:host.meId,tok:host.tok,requestId,match:revealed.match,lotNumber:lot,amount:3,verdict:'genuine'});
      assert.equal(replay.s,200);assert.equal(replay.j.me.coins,revealed.me.coins,'replayed bid does not spend twice');
      await post(host,'next');
    }
    const final=(await get(host)).j;
    assert.equal(final.phase,'finished');assert.ok(final.players.every(p=>p.team));assert.ok(final.winningTeam);
    assert.equal(final.history.filter(l=>l.genuine).length,3);
    const recoverRequest={action:'join',code:host.code,name:'Host',recoveryCode:final.me.recoveryCode,requestId:id()};
    const recovered=await call(handler,recoverRequest);
    assert.equal(recovered.s,200);assert.notEqual(recovered.j.tok,host.tok);assert.equal((await get(host)).s,401);
    assert.equal((await call(handler,recoverRequest)).j.tok,recovered.j.tok,'lost recovery response can be replayed');
    assert.equal((await enter('join',{code:host.code,name:'Host',recoveryCode:final.me.recoveryCode})).s,409,'old recovery secret rotates');
    const nextHost={...recovered.j,tok:recovered.j.tok};
    await post(nextHost,'start');
    const raw=redis?JSON.parse(await redis.client.get('grand-con:room:'+host.code)):globalThis.__grandConRooms.get(host.code);
    raw.deadline=Date.now()-1;
    if(redis)await redis.client.set('grand-con:room:'+host.code,JSON.stringify(raw));
    assert.equal((await get(nextHost)).j.phase,'actions','polls advance expired phases');
    if(redis){assert.ok(await redis.client.ttl('grand-con:room:'+host.code)>0);redis.fault.unavailable=true;assert.equal((await get(nextHost)).s,503);redis.fault.unavailable=false;}
    const rules=handler._rules;
    const fixture=()=>({lot:0,phase:'bidding',players:[{id:'a',coins:38,portfolio:0,hits:0,calls:0},{id:'b',coins:40,portfolio:0,hits:0,calls:0}],lots:[{genuine:false,value:2}],actions:{a:{power:'insure'}},bids:{a:{amount:8,verdict:'forged'},b:{amount:5,verdict:'genuine'}},history:[]});
    const insured=fixture();rules.settle(insured);
    assert.equal(insured.history[0].refund,8);assert.equal(insured.players[0].coins,40);assert.equal(insured.players[0].portfolio,2);assert.equal(insured.players[1].coins,39);
    const leveraged=fixture();leveraged.actions={a:{power:'leverage'}};leveraged.bids={a:{amount:5,verdict:'pass'},b:{amount:8,verdict:'pass'}};rules.settle(leveraged);
    assert.equal(leveraged.history[0].winnerId,'a','rotating priority resolves equal effective bids');assert.equal(leveraged.players[0].coins,33,'leverage buyer pays only their entered bid');
    const unsold=fixture();unsold.actions={};unsold.bids={};rules.settle(unsold);assert.equal(unsold.history[0].winnerId,null);assert.equal(unsold.players[0].coins,38,'missing bids pass without spending');
    const crowd=(await enter('create',{name:'Crowd host'})).j;
    const crowdJoins=await Promise.all(Array.from({length:11},(_,i)=>enter('join',{code:crowd.code,name:'Crowd '+i})));
    assert.ok(crowdJoins.every(r=>r.s===200),'all simultaneous joins survive storage conflicts');
    const crowdPost=(seat,action,data={})=>call(handler,{action,code:crowd.code,pid:seat.meId,tok:seat.tok,requestId:id(),match:1,lotNumber:1,...data});
    await crowdPost(crowd,'start');await crowdPost(crowd,'advance');
    const crowdActions=await Promise.all(crowdJoins.map(r=>crowdPost(r.j,'power',{power:'pass'})));
    assert.ok(crowdActions.every(r=>r.s===200),'simultaneous secret actions persist');
    const hostLeft=await crowdPost(crowd,'leave');
    assert.equal(hostLeft.j.phase,'bidding','departing last actor does not hold up remaining players');
    assert.notEqual(hostLeft.j.hostId,crowd.meId,'host transfers to a remaining player');

    console.log('Grand Con '+(redis?'Redis':'memory')+': private views, concurrent play, five lots, receipts, recovery and deadlines passed');
  }finally{if(redis)await redis.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
