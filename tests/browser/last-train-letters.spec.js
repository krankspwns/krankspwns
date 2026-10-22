const {test,expect}=require('@playwright/test');
const {call:rawCall}=require('../helpers');
const crypto=require('node:crypto');
const api=require('../../api/last-train'),rules=require('../../lib/last-train-rules'),store=require('../../lib/last-train-store');
const call=(body,query={},headers={})=>rawCall(api,body,query,{...headers,'x-forwarded-for':test.info().testId});
async function roomFixture(){
  const make=(action,extra)=>call({action,requestId:crypto.randomUUID(),...extra});
  const host=(await make('create',{name:'Benny'})).j,seats=[host];
  for(const name of ['Mel','Mochi','Juno','Zee'])seats.push((await make('join',{code:host.code,name})).j);
  const room=await store.load(host.code);rules.start(room);rules.beginNight(room);room.deadline=Date.now()+120000;await store.save(room);return seats;
}
async function open(browser,seat,width=390,failDismiss=()=>false){
  const context=await browser.newContext({viewport:{width,height:844}}),errors=[];
  await context.addInitScript(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:seat.code,pid:seat.meId,tok:seat.tok});
  await context.route('**/api/last-train**',async route=>{
    const req=route.request(),url=new URL(req.url()),body=req.method()==='POST'?JSON.parse(req.postData()):null;
    if(body?.action==='dismissLetters'&&failDismiss())return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary connection loss'})});
    const response=await call(body,Object.fromEntries(url.searchParams),req.headers());await route.fulfill({status:response.s,contentType:'application/json',body:JSON.stringify(response.j)});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('/last-train.html');await page.locator('.room-code').waitFor();return{context,page,errors};
}
const letterbox=page=>page.getByRole('dialog',{name:'Private letters',exact:true});
async function send(page,to,text){
  if(!await letterbox(page).isVisible())await page.getByRole('button',{name:/^Open private letters/}).click();
  await letterbox(page).getByLabel('To',{exact:true}).selectOption({label:to});await letterbox(page).getByLabel('Your message',{exact:true}).fill(text);await letterbox(page).getByRole('button',{name:'Send letter',exact:true}).click();await expect(letterbox(page).getByRole('status')).toHaveText('Your letter is on its way.');
}
test('letters arrive privately, show safe text, and disappear on close while unopened arrivals survive',async({browser},info)=>{
  const seats=await roomFixture(),a=await open(browser,seats[0]),b=await open(browser,seats[1],320),c=await open(browser,seats[2]);
  try{
    const message='<img src=x onerror=alert(1)> Meet near cabin 4.';
    await send(a.page,'Mel',message);await expect(b.page.getByRole('button',{name:'Open private letters (1 unread)',exact:true})).toBeVisible();
    const room=await store.load(seats[0].code);expect(room.letters).toHaveLength(1);expect(rules.view(room,room.players.find(p=>p.id===seats[2].meId)).me.letters).toEqual([]);expect(rules.view(room,room.players.find(p=>p.id===seats[0].meId)).me.letters).toEqual([]);
    // Merely receiving or refreshing must not consume an unopened letter.
    await b.page.reload();await b.page.getByRole('button',{name:'Open private letters (1 unread)',exact:true}).click();
    await expect(letterbox(b.page).locator('.letter-text')).toHaveText(message);await expect(letterbox(b.page).locator('.letter-text img')).toHaveCount(0);
    expect(await b.page.evaluate(()=>JSON.stringify(localStorage))).not.toContain(message);
    await b.page.screenshot({path:info.outputPath('private-letters-mobile.png')});
    expect(await letterbox(b.page).evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);expect(await b.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await letterbox(b.page).getByRole('button',{name:'Close private letters'}).click();await expect.poll(async()=>(await store.load(seats[0].code)).letters.length).toBe(0);
    await b.page.getByRole('button',{name:'Open private letters',exact:true}).click();await expect(letterbox(b.page).locator('.private-letter')).toHaveCount(0);await b.page.keyboard.press('Escape');
    await send(a.page,'Mel','A second sealed letter.');await expect(b.page.getByRole('button',{name:'Open private letters (1 unread)',exact:true})).toBeVisible();
    await b.page.getByRole('button',{name:'Open private letters (1 unread)',exact:true}).click();await expect(letterbox(b.page).locator('.letter-text')).toHaveText('A second sealed letter.');
    // New delivery during a pending dismissal is not included in its explicit IDs.
    let release;const gate=new Promise(resolve=>release=resolve);let caught;const blocked=new Promise(resolve=>caught=resolve);
    await b.context.route('**/api/last-train',async route=>{const body=JSON.parse(route.request().postData()||'null');if(body?.action!=='dismissLetters')return route.fallback();caught();await gate;return route.fallback();});
    await b.page.keyboard.press('Escape');await blocked;await send(a.page,'Mel','Keep this unopened.');release();
    await expect.poll(async()=>(await store.load(seats[0].code)).letters.map(m=>m.text)).toEqual(['Keep this unopened.']);await expect(b.page.getByRole('button',{name:'Open private letters (1 unread)',exact:true})).toBeVisible();
    expect([...a.errors,...b.errors,...c.errors]).toEqual([]);
  }finally{await Promise.all([a.context.close(),b.context.close(),c.context.close()]);}
});
test('closed letters stay gone through reload and failed deletion, with drafts preserved across night steps',async({browser})=>{
  const seats=await roomFixture();let fail=false;const a=await open(browser,seats[0]),b=await open(browser,seats[1],390,()=>fail);
  try{
    await send(a.page,'Mel','A letter that should disappear.');await b.page.getByRole('button',{name:'Open private letters (1 unread)',exact:true}).click();await expect(letterbox(b.page).locator('.private-letter')).toHaveCount(1);
    fail=true;await b.page.keyboard.press('Escape');await b.page.reload();await b.page.getByRole('button',{name:'Open private letters',exact:true}).click();await expect(letterbox(b.page).locator('.private-letter')).toHaveCount(0);
    expect((await store.load(seats[0].code)).letters).toHaveLength(1);await b.page.keyboard.press('Escape');fail=false;await expect.poll(async()=>(await store.load(seats[0].code)).letters.length,{timeout:12000}).toBe(0);
    await letterbox(a.page).getByLabel('Your message').fill('I want this draft to stay.');
    const room=await store.load(seats[0].code);rules.advance(room);room.deadline=Date.now()+120000;await store.save(room);
    await expect(a.page.locator('#lt-app')).toHaveAttribute('data-phase','night');await expect(letterbox(a.page).getByLabel('Your message')).toHaveValue('I want this draft to stay.');
    await letterbox(a.page).getByRole('button',{name:'Send letter',exact:true}).click();await expect(letterbox(a.page).getByRole('status')).toHaveText('Your letter is on its way.');
    await b.page.getByRole('button',{name:'Open private letters (1 unread)',exact:true}).click();await expect(letterbox(b.page).locator('.letter-text')).toHaveText('I want this draft to stay.');
    // A reload while reading is an exit, and consumes displayed letters.
    await b.page.reload();await b.page.getByRole('button',{name:'Open private letters',exact:true}).click();await expect(letterbox(b.page).locator('.private-letter')).toHaveCount(0);await b.page.keyboard.press('Escape');await expect.poll(async()=>(await store.load(seats[0].code)).letters.length).toBe(0);
    expect([...a.errors,...b.errors]).toEqual([]);
  }finally{await Promise.all([a.context.close(),b.context.close()]);}
});
