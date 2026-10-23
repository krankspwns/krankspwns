const {test,expect}=require('@playwright/test');
const {call}=require('../helpers');
const handler=require('../../api/last-train'),rules=require('../../lib/last-train-rules'),store=require('../../lib/last-train-store');
async function fixture(browser,count=12){
  const make=async(action,extra)=>{const r=await call(handler,{action,requestId:crypto.randomUUID(),...extra},{},{'x-forwarded-for':test.info().testId});expect(r.s).toBe(200);return r.j;};
  const host=await make('create',{name:'Host'}),seats=[host];for(let i=1;i<count;i++)seats.push(await make('join',{code:host.code,name:'Rider '+i}));
  const room=await store.load(host.code);rules.start(room);room.nightMode='legacy';rules.beginNight(room);rules.advance(room);await store.save(room);
  const contexts=[];
  const open=async person=>{
    const seat=seats.find(s=>s.meId===person.id),context=await browser.newContext({viewport:{width:390,height:844}});contexts.push(context);
    await context.addInitScript(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:seat.code,pid:seat.meId,tok:seat.tok});
    await context.route('**/api/last-train**',async route=>{const req=route.request(),q=new URL(req.url()),r=await call(handler,req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(q.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/last-train.html');await expect(page.locator('.room-code')).toHaveText(host.code);return{page,errors,seat};
  };
  return{host,room,open,contexts};
}
test('Inspector and Witness see immediate private results in a centered card, kept after closing and without duplicate reports',async({browser},info)=>{
  const b=await fixture(browser);let room=b.room;
  const inspector=room.players.find(p=>p.role==='inspector'),witness=room.players.find(p=>p.role==='witness'),bad=room.players.find(p=>p.role==='saboteur'),other=room.players.find(p=>p.role==='passenger');
  try{
    while(rules.nightRole(room)!=='saboteur')rules.advance(room);
    for(const p of rules.alive(room).filter(p=>rules.group(p)==='saboteur'))rules.nightChoice(room,p,{attackId:inspector.id});
    while(rules.nightRole(room)!=='inspector')rules.advance(room);room.deadline=Date.now()+120000;await store.save(room);
    const a=await b.open(inspector),o=await b.open(other),w=await b.open(witness);
    await a.page.getByRole('button',{name:'Choose',exact:true}).click();const target=a.page.getByRole('dialog');await target.locator('[data-id="'+bad.id+'"]').click();await target.getByRole('button',{name:/^Confirm:/}).click();
    const result=a.page.getByRole('dialog',{name:'Your private result',exact:true});await expect(result).toBeVisible();await expect(result.locator('.result-verdict')).toHaveText('BAD');await expect(result.getByRole('heading',{name:bad.name,exact:true})).toBeVisible();
    room=await store.load(b.host.code);expect(room.phase).toBe('night');expect(rules.nightRole(room)).toBe('inspector');expect(room.players.find(p=>p.id===inspector.id).reports).toHaveLength(1);
    await expect(o.page.locator('.night-result-dialog')).toHaveCount(0);await expect(w.page.locator('.night-result-dialog')).toHaveCount(0);
    const view=(await call(handler,null,{code:o.seat.code,pid:o.seat.meId},{'x-tok':o.seat.tok})).j;expect(view.me.reports).toEqual([]);expect(view.players.find(p=>p.id===bad.id).role).toBeUndefined();
    await a.page.waitForTimeout(500);await a.page.screenshot({path:info.outputPath('inspector-immediate-mobile.png')});await result.getByRole('button',{name:'Got It',exact:true}).click();await expect(a.page.locator('.action-console .result-verdict')).toHaveText('BAD');
    await a.page.reload();await expect(a.page.locator('.night-result-dialog')).toHaveCount(0);await expect(a.page.locator('.action-console .result-verdict')).toHaveText('BAD');
    rules.advance(room);room.deadline=Date.now()+120000;await store.save(room);await expect(w.page.locator('#lt-app')).toHaveAttribute('data-night-role','witness');await w.page.getByRole('button',{name:'Watch',exact:true}).click();
    const watched=w.page.getByRole('dialog',{name:'Your private result',exact:true});await expect(watched.locator('.result-verdict')).toHaveText('ATTACK TARGET');await expect(watched.getByRole('heading',{name:inspector.name,exact:true})).toBeVisible();
    room=await store.load(b.host.code);while(room.phase==='night')rules.advance(room);expect(room.players.find(p=>p.id===inspector.id).alive).toBe(false);expect(room.players.find(p=>p.id===inspector.id).reports).toHaveLength(1);expect(room.players.find(p=>p.id===witness.id).reports).toHaveLength(1);
    expect([...a.errors,...o.errors,...w.errors]).toEqual([]);
  }finally{await Promise.all(b.contexts.map(c=>c.close()));}
});
test('a blocked check shows no target alignment, and Saboteur role cards identify teammates by their public avatars',async({browser},info)=>{
  const b=await fixture(browser);let room=b.room;const inspector=room.players.find(p=>p.role==='inspector'),bad=room.players.find(p=>p.role==='saboteur');
  try{
    while(rules.nightRole(room)!=='inspector')rules.advance(room);room.night.blockedId=inspector.id;room.deadline=Date.now()+120000;await store.save(room);
    const a=await b.open(inspector),s=await b.open(bad);
    await a.page.getByRole('button',{name:'Choose',exact:true}).click();const target=a.page.getByRole('dialog');await target.locator('[data-id="'+bad.id+'"]').click();await target.getByRole('button',{name:/^Confirm:/}).click();
    const result=a.page.getByRole('dialog',{name:'Your private result',exact:true});await expect(result.getByRole('heading',{name:'Your power was blocked.',exact:true})).toBeVisible();await expect(result.locator('.result-verdict')).toHaveCount(0);
    await s.page.getByRole('button',{name:'Show Role',exact:true}).click();const allies=room.players.filter(p=>rules.group(p)==='saboteur'&&p.id!==bad.id);await expect(s.page.locator('.ticket-ally')).toHaveCount(2);
    for(const ally of allies){const row=s.page.locator('.ticket-ally[data-player="'+ally.id+'"]');await expect(row).toContainText(ally.name);await expect(row.locator('.portrait')).toHaveAttribute('data-avatar-index',String(ally.avatarIndex));}
    await expect(a.page.locator('.ticket-allies')).toHaveCount(0);await s.page.waitForTimeout(400);await s.page.screenshot({path:info.outputPath('saboteur-teammates-mobile.png')});
    room=await store.load(b.host.code);rules.remove(room,[allies[0].id]);await store.save(room);await expect(s.page.locator('.ticket-ally[data-player="'+allies[0].id+'"]')).toHaveClass(/is-out/);await expect(s.page.locator('.ticket-ally[data-player="'+allies[0].id+'"]')).toContainText('Out');
    expect(await s.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }finally{await Promise.all(b.contexts.map(c=>c.close()));}
});
test('a single Saboteur role card says there are no teammates',async({browser})=>{
  const b=await fixture(browser,5);
  try{const bad=b.room.players.find(p=>p.role==='saboteur'),s=await b.open(bad);await s.page.getByRole('button',{name:'Show Role',exact:true}).click();await expect(s.page.locator('.ticket-allies')).toHaveText('YOUR TEAMMATESYou are the only Saboteur.');await expect(s.page.locator('.ticket-ally')).toHaveCount(0);}finally{await Promise.all(b.contexts.map(c=>c.close()));}
});
test('the Inspector sees earlier checks on the picker and can paste the latest report into a chat message',async({browser})=>{
  const b=await fixture(browser);let room=b.room;const inspector=room.players.find(p=>p.role==='inspector'),bad=room.players.find(p=>p.role==='saboteur'),good=room.players.find(p=>p.role==='passenger');
  try{
    while(room.phase==='night')rules.advance(room);rules.beginNight(room);rules.advance(room);
    const me=room.players.find(p=>p.id===inspector.id);me.reports.push({type:'check',round:1,targetId:bad.id,alignment:'bad'},{type:'check',round:1,targetId:good.id,alignment:'good'});
    while(rules.nightRole(room)!=='inspector')rules.advance(room);room.deadline=Date.now()+120000;await store.save(room);
    const a=await b.open(inspector);await a.page.getByRole('button',{name:'Choose',exact:true}).click();const picker=a.page.getByRole('dialog');
    await expect(picker.locator('[data-id="'+bad.id+'"] .checked-tag')).toHaveText('BAD · N1');await expect(picker.locator('[data-id="'+good.id+'"]')).toHaveClass(/checked-good/);await expect(picker.locator('.checked-tag')).toHaveCount(2);
    await picker.getByRole('button',{name:'Cancel',exact:true}).click();
    room=await store.load(b.host.code);room.settings.discussion='chat';while(room.phase==='night')rules.advance(room);room.phase='morning';rules.beginDiscussion(room);room.speakerIndex=room.speakingOrder.indexOf(inspector.id);room.deadline=Date.now()+120000;await store.save(room);
    await a.page.getByRole('button',{name:'Type Message',exact:true}).click();const chips=a.page.getByLabel('Quick phrases');
    await chips.getByRole('button',{name:bad.name+' is BAD',exact:true}).click();await chips.getByRole('button',{name:good.name+' is GOOD',exact:true}).click();
    await chips.getByRole('button',{name:'I suspect…',exact:true}).click();await chips.getByRole('button',{name:bad.name,exact:true}).click();
    await expect(a.page.locator('#lt-speech')).toHaveValue(bad.name+' is BAD. '+good.name+' is GOOD. I suspect '+bad.name+'.');expect(a.errors).toEqual([]);
  }finally{await Promise.all(b.contexts.map(c=>c.close()));}
});
