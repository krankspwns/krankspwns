const {test,expect}=require('@playwright/test');
const {call:rawCall}=require('../helpers');
const api=require('../../api/grand-con'),rules=api._rules,store=require('../../lib/grand-con-store');
const call=(body,query={},headers={})=>rawCall(api,body,query,{...headers,'x-forwarded-for':test.info().testId});
async function fixture(browser,count=12){
  const make=async(action,extra)=>{const r=await call({action,requestId:crypto.randomUUID(),...extra});expect(r.s).toBe(200);return r.j;};
  const host=await make('create',{name:'Gallery host'}),seats=[host];for(let i=1;i<count;i++)seats.push(await make('join',{code:host.code,name:'Guest '+i}));
  const room=await store.load(host.code);rules.start(room);
  const target=room.players.find(p=>p.team==='house');rules.deliver(room,target.id);room.deadline=Date.now()+120000;await store.save(room);
  const contexts=[];
  const post=async(person,action,extra={})=>{const s=seats.find(s=>s.meId===person.id),r=await store.load(host.code);return call({action,code:s.code,pid:s.meId,tok:s.tok,requestId:crypto.randomUUID(),match:r.match,lotNumber:r.lot+1,...extra});};
  const open=async(person,width=390)=>{
    const s=seats.find(s=>s.meId===person.id),context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});contexts.push(context);
    await context.addInitScript(s=>localStorage.setItem('gc-seat',JSON.stringify(s)),{code:s.code,pid:s.meId,tok:s.tok});
    await context.route('**/api/grand-con**',async route=>{const req=route.request(),url=new URL(req.url()),r=await call(req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(url.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/grand-con.html');await expect(page.locator('.room-code')).toHaveText(host.code);return{page,errors,context};
  };
  return{host,room,target,post,open,close:()=>Promise.all(contexts.map(c=>c.close()))};
}
test('twelve gallery guests share safe claims while a one-use original-clue check stays private',async({browser},info)=>{
  const b=await fixture(browser),auditor=b.room.players.find(p=>p.team==='house'&&p.id!==b.target.id),other=b.room.players.find(p=>p.team==='ring');
  try{
    const a=await b.open(auditor,320),o=await b.open(other,1100);
    await expect(a.page.locator('.seat .guest-portrait')).toHaveCount(12);
    await a.page.getByRole('button',{name:'Open my card',exact:true}).click();
    await expect(a.page.getByRole('button',{name:'Check original',exact:true})).toBeDisabled();
    await a.page.locator('[data-focus="check-'+b.target.id+'"]').click();await a.page.getByRole('button',{name:'Check original',exact:true}).click();
    await expect(a.page.locator('.audit-report')).toContainText(b.room.tamper.original);
    await a.page.locator('.audit-report').scrollIntoViewIfNeeded();await a.page.screenshot({path:info.outputPath('grand-con-private-check-mobile.png')});
    await o.page.getByRole('button',{name:'Open my card',exact:true}).click();await expect(o.page.locator('.audit-report')).toHaveCount(0);await o.page.getByRole('button',{name:'Hide my card',exact:true}).click();
    await a.page.keyboard.press('Escape');await expect(a.page.getByRole('button',{name:'Open my card',exact:true})).toHaveAttribute('aria-expanded','false');
    const message='<img src=x onerror=alert(1)> The newer date is only on the frame.';
    await a.page.getByLabel('Your public claim',{exact:true}).fill(message);await a.page.getByLabel('Your public opinion',{exact:true}).selectOption('reject');await a.page.getByRole('button',{name:'Share claim',exact:true}).click();
    await expect(o.page.locator('.public-claim')).toContainText(message);await expect(o.page.locator('.public-claim img')).toHaveCount(0);
    await expect(o.page.locator('.public-claim')).toContainText('FAKE');
    await a.page.reload();await a.page.getByRole('button',{name:'Open my card',exact:true}).click();await expect(a.page.locator('.audit-report')).toContainText(b.room.tamper.original);await expect(a.page.getByRole('button',{name:'Check original',exact:true})).toHaveCount(0);await a.page.keyboard.press('Escape');
    expect(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await o.page.screenshot({path:info.outputPath('grand-con-gallery-discussion-desktop.png'),fullPage:true});
    await a.page.locator('.claims-board').scrollIntoViewIfNeeded();await a.page.screenshot({path:info.outputPath('grand-con-claims-mobile.png')});
    let room=await store.load(b.host.code);rules.advance(room);await store.save(room);
    await expect(a.page.getByRole('button',{name:'Confirm FAKE',exact:true})).toHaveCount(0);
    for(const p of room.players){const response=await b.post(p,'vote',{choice:'reject'});expect(response.s).toBe(200);}
    await expect(a.page.locator('.match-grid .tamper-reveal')).toBeVisible();await a.page.locator('.match-grid .evidence-audit summary').click();await expect(a.page.locator('.match-grid .claim-comparison')).toContainText(message);
    await expect(a.page.locator('.match-grid .vote-choice-group')).toHaveCount(1);await expect(a.page.locator('.match-grid .vote-row')).toHaveCount(12);
    await a.page.locator('.match-grid .tamper-reveal').scrollIntoViewIfNeeded();await a.page.screenshot({path:info.outputPath('grand-con-reveal-mobile.png')});
    expect([...a.errors,...o.errors]).toEqual([]);
  }finally{await b.close();}
});
test('claim drafts, selection and a hidden team survive another player update at 320px',async({browser})=>{
  const b=await fixture(browser,4);
  try{
    const a=await b.open(b.room.players[0],320),field=a.page.getByLabel('Your public claim',{exact:true});
    await field.fill('I want to compare the repair note.');await field.evaluate(n=>n.setSelectionRange(5,12));
    expect((await b.post(b.room.players[1],'claim',{text:'My clue mentions a photograph.',choice:'unsure'})).s).toBe(200);
    await expect(a.page.locator('.public-claim')).toHaveCount(1);await expect(field).toHaveValue('I want to compare the repair note.');expect(await field.evaluate(n=>[n.selectionStart,n.selectionEnd])).toEqual([5,12]);
    expect(await field.evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(16);
    const opinion=a.page.getByLabel('Your public opinion',{exact:true}),submit=a.page.getByRole('button',{name:'Share claim',exact:true});
    const ob=await opinion.boundingBox(),sb=await submit.boundingBox();expect(ob.width).toBeGreaterThanOrEqual(100);expect(ob.x+ob.width).toBeLessThanOrEqual(sb.x);
    expect(await a.page.getByLabel('Your public opinion',{exact:true}).evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(16);
    await expect(a.page.locator('.identity-card')).toHaveCount(0);expect(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(a.errors).toEqual([]);
  }finally{await b.close();}
});


test('setup keeps the shared deadline and private question after the editor seals a change',async({browser},info)=>{
  const b=await fixture(browser,6);
  try{
    let room=await store.load(b.host.code);rules.beginLot(room);room.deadline=Date.now()+120000;await store.save(room);
    const editor=room.players.find(p=>p.id===room.forgerId),guest=room.players.find(p=>p.team==='house');
    const a=await b.open(editor),g=await b.open(guest,320);
    await g.page.getByLabel('Your private question',{exact:true}).fill('Is the new date only on the cover?');
    await a.page.getByRole('button',{name:'Open my card',exact:true}).click();await a.page.locator('.forgery-option').first().click();await a.page.getByRole('button',{name:'Confirm clue change',exact:true}).click();
    await expect(a.page.locator('.ring-brief')).toContainText('sealed');room=await store.load(b.host.code);expect(room.phase).toBe('forging');const deadline=room.deadline;
    await g.page.reload();await expect(g.page.getByLabel('Your private question',{exact:true})).toHaveValue('Is the new date only on the cover?');
    expect((await store.load(b.host.code)).deadline).toBe(deadline);await g.page.getByRole('button',{name:'Open my card',exact:true}).click();await expect(g.page.locator('.clue')).toHaveCount(0);await g.page.keyboard.press('Escape');
    rules.advance(room);await store.save(room);await expect(g.page.locator('.private-prompt')).toContainText('Is the new date only on the cover?');await expect(g.page.getByRole('heading',{name:'Talk about your clues.'})).toBeVisible();
    expect([...a.errors,...g.errors]).toEqual([]);
  }finally{await b.close();}
});

test('the gallery entrance and human team reveal fit narrow and wide screens',async({browser},info)=>{
  const b=await fixture(browser,6);
  try{
    const a=await b.open(b.room.players[0],390);let room=await store.load(b.host.code);room.phase='finished';room.deadline=null;room.score={house:3,ring:1};await store.save(room);
    await expect(a.page.locator('.team-player')).toHaveCount(6);await expect(a.page.locator('.dossier')).toHaveCount(0);
    expect(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await a.page.screenshot({path:info.outputPath('grand-con-finale-mobile.png'),fullPage:true});
    await a.page.setViewportSize({width:1100,height:844});await a.page.screenshot({path:info.outputPath('grand-con-finale-desktop.png'),fullPage:true});
    const entrance=await browser.newContext({viewport:{width:1100,height:844},reducedMotion:'reduce'});
    try{const page=await entrance.newPage();await page.goto('/grand-con.html');await expect(page.getByRole('heading',{name:'Ready to play?'})).toBeVisible();await page.screenshot({path:info.outputPath('grand-con-entrance-desktop.png'),fullPage:true});
      await page.setViewportSize({width:320,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('grand-con-entrance-mobile.png'),fullPage:true});
    }finally{await entrance.close();}
    expect(a.errors).toEqual([]);
  }finally{await b.close();}
});
