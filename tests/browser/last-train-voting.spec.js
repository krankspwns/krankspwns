const { test, expect } = require('@playwright/test');
const { call } = require('../helpers');
const handler = require('../../api/last-train'), rules = require('../../lib/last-train-rules'), store = require('../../lib/last-train-store');
async function fixture(browser, instrumentAudio = false) {
  const make = async (action,data) => { const r=await call(handler,{action,requestId:crypto.randomUUID(),...data},{},{'x-forwarded-for':test.info().testId});expect(r.s).toBe(200);return r.j; };
  const host=await make('create',{name:'Host'}),seats=[host];
  for(let i=1;i<6;i++)seats.push(await make('join',{code:host.code,name:i===1?'Luna':'Guest '+i}));
  const room=await store.load(host.code);rules.start(room);room.nightMode='legacy';rules.beginVote(room);await store.save(room);
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:host.code,pid:host.meId,tok:host.tok});
  if(instrumentAudio)await context.addInitScript(()=>{
    const Native=window.AudioContext;
    window.AudioContext=class extends Native {
      constructor(){super();window.testAudioContext=this;window.testMusicSources=[];window.testGains=[];}
      createBufferSource(){const node=super.createBufferSource();window.testMusicSources.push(node);return node;}
      createGain(){const node=super.createGain();window.testGains.push(node);return node;}
    };
  });
  await context.route('**/api/last-train**',async route=>{const req=route.request(),u=new URL(req.url()),r=await call(handler,req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(u.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/last-train.html');
  await expect(page.locator('#lt-app')).toHaveAttribute('data-phase','voting');
  const post=async(s,action,extra={})=>{const room=await store.load(host.code);return make(action,{code:s.code,pid:s.meId,tok:s.tok,match:room.match,round:room.round,step:room.step,...extra});};
  return {context,page,host,seats,post,errors};
}
test('tied ballots open one restricted re-vote, retain grouped voters on reload and randomly resolve a second tie',async({browser},info)=>{
  const b=await fixture(browser),{page,seats,post}=b;
  try{
    const before=await store.load(b.host.code),targets=before.players.filter(p=>rules.group(p)==='saboteur').map(p=>p.id);
    for(let i=0;i<6;i++)await post(seats[i],'vote',{targetId:targets[i%2]});
    await expect(page.locator('#lt-app')).toHaveAttribute('data-phase','revoteInfo');
    const notice=page.getByRole('dialog',{name:'The vote is tied.',exact:true});await expect(notice).toBeVisible();await expect(notice.locator('.revote-candidate')).toHaveCount(2);
    await expect(page.getByRole('button',{name:'Choose A Player Or Skip',exact:true})).toHaveCount(0);
    let pending=await store.load(b.host.code);expect(pending.duration).toBe(7);expect(pending.votes).toEqual({});
    await page.screenshot({path:info.outputPath('revote-info-mobile.png')});await notice.getByRole('button',{name:'Got It',exact:true}).click();
    pending.deadline=Date.now()-1;await store.save(pending);
    await expect(page.getByRole('heading',{name:'A tie. Vote once more.'})).toBeVisible();
    let room=await store.load(b.host.code);expect(room.voteAttempt).toBe(2);expect(room.votes).toEqual({});
    const stale=await call(handler,{action:'vote',requestId:crypto.randomUUID(),code:b.host.code,pid:b.host.meId,tok:b.host.tok,match:before.match,round:before.round,step:before.step,targetId:targets[0]});expect(stale.s).toBe(409);
    await page.reload();await expect(page.getByRole('heading',{name:'A tie. Vote once more.'})).toBeVisible();
    await page.getByText('See The First Vote',{exact:true}).click();
    const grouped=page.locator('.previous-vote .vote-group');await expect(grouped).toHaveCount(2);
    for(let i=0;i<2;i++){await expect(grouped.nth(i).locator('.vote-row')).toHaveCount(3);await expect(grouped.nth(i).locator('.vote-total')).toHaveText('3 votes');}
    await page.getByRole('button',{name:'Choose A Player Or Skip',exact:true}).click();
    const dialog=page.getByRole('dialog');await expect(dialog.locator('.manifest-target')).toHaveCount(3);
    await dialog.locator('[data-id="'+targets[0]+'"]').click();await dialog.getByRole('button',{name:/^Confirm:/}).click();
    for(let i=1;i<6;i++)await post(seats[i],'vote',{targetId:targets[i%2]});
    await expect(page.locator('#lt-app')).toHaveAttribute('data-phase','voteResult');
    room=await store.load(b.host.code);expect(room.history).toHaveLength(2);expect(room.history[1].reason).toBe('random');expect(targets).toContain(room.history[1].outs[0].id);
    await expect(page.locator('.elimination-cinema')).toHaveCount(0,{timeout:9000});
    await expect(page.locator('.inline-votes .vote-group')).toHaveCount(2);await expect(page.locator('.inline-votes .vote-row')).toHaveCount(6);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath('grouped-revote-mobile.png'),fullPage:true});
    expect(b.errors).toEqual([]);
  }finally{await b.context.close();}
});
test('five Skip ballots do not cancel the sole player vote',async({browser})=>{
  const b=await fixture(browser);
  try{
    for(let i=0;i<6;i++)await b.post(b.seats[i],'vote',{targetId:i===0?b.seats[1].meId:null});
    const room=await store.load(b.host.code);expect(room.history[0].outs[0].id).toBe(b.seats[1].meId);
    await expect(b.page.locator('#lt-app')).toHaveAttribute('data-phase','voteResult');
    await expect(b.page.locator('.elimination-cinema')).toHaveCount(0,{timeout:9000});
    const votes=b.page.locator('.inline-votes');await expect(votes.locator('.vote-group')).toHaveCount(2);await expect(votes.locator('.vote-group[data-target="'+b.seats[1].meId+'"] .vote-row')).toHaveCount(1);await expect(votes.locator('.abstained .vote-row')).toHaveCount(5);
  }finally{await b.context.close();}
});
test('a normal game gesture starts the original looping score, softens discussion and pauses audio with the game',async({browser})=>{
  const b=await fixture(browser,true);
  try{
    await b.page.locator('.scene-hud h1').click();
    await expect.poll(()=>b.page.evaluate(()=>window.testMusicSources?.length||0)).toBe(1);
    expect(await b.page.evaluate(()=>({loop:window.testMusicSources[0].loop,duration:window.testMusicSources[0].buffer.duration,state:window.testAudioContext.state}))).toMatchObject({loop:true,state:'running'});
    await b.post(b.host,'pause');await expect.poll(()=>b.page.evaluate(()=>window.testAudioContext.state)).toBe('suspended');
    await b.post(b.host,'resume');await expect.poll(()=>b.page.evaluate(()=>window.testAudioContext.state)).toBe('running');
    let room=await store.load(b.host.code);rules.beginDiscussion(room);await store.save(room);await expect(b.page.locator('#lt-app')).toHaveAttribute('data-phase','discussion');
    await expect.poll(()=>b.page.evaluate(()=>window.testGains[1].gain.value)).toBeLessThan(.09);
    room=await store.load(b.host.code);rules.board(room);room.paused=true;room.pauseRemaining=5000;room.deadline=null;await store.save(room);await expect(b.page.locator('#lt-app')).toHaveAttribute('data-phase','boarding');
    await expect.poll(()=>b.page.evaluate(()=>window.testAudioContext.state)).toBe('suspended');
    await expect(b.page.locator('.boarding-sound')).toHaveCount(0);expect(b.errors).toEqual([]);
  }finally{await b.context.close();}
});
test('one Saboteur proposal reaches Medic and resolves an attack when the teammate never chooses',async({browser})=>{
  const b=await fixture(browser);
  try{
    let room=await store.load(b.host.code);rules.beginNight(room);rules.advance(room);while(rules.nightRole(room)!=='saboteur')rules.advance(room);await store.save(room);
    const bad=room.players.filter(p=>rules.group(p)==='saboteur'),target=room.players.find(p=>p.role==='witness'),medic=room.players.find(p=>p.role==='medic');
    await b.post(b.seats.find(s=>s.meId===bad[0].id),'night',{attackId:target.id});
    room=await store.load(b.host.code);expect(room.night.choices[bad[1].id]).toBeUndefined();room.deadline=Date.now()-1;await store.save(room);
    const seat=b.seats.find(s=>s.meId===medic.id),result=await call(handler,null,{code:seat.code,pid:seat.meId},{'x-tok':seat.tok});expect(result.s).toBe(200);expect(result.j.nightRole).toBe('medic');expect(result.j.me.patientId).toBe(target.id);
    room=await store.load(b.host.code);while(room.phase==='night')rules.advance(room);expect(room.phase).toBe('gathering');expect(room.players.find(p=>p.id===target.id).alive).toBe(false);
  }finally{await b.context.close();}
});
