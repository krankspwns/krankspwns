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
const letterbox=page=>page.getByRole('dialog',{name:'Private Letters',exact:true});
async function openThread(page,name){
  if(!await letterbox(page).isVisible())await page.getByRole('button',{name:/^Open private letters/}).click();
  if(await letterbox(page).getByRole('button',{name:'Back to your letterbox'}).isVisible())await letterbox(page).getByRole('button',{name:'Back to your letterbox'}).click();
  const thread=letterbox(page).getByRole('button',{name:new RegExp('^Letters with '+name)});
  await (await thread.count()?thread:letterbox(page).getByRole('button',{name:'Write to '+name,exact:true})).click();
}
async function send(page,to,text){
  await openThread(page,to);await letterbox(page).getByLabel('Your letter to '+to,{exact:true}).fill(text);await letterbox(page).getByRole('button',{name:'Send',exact:true}).click();
  await expect(letterbox(page).locator('.letter-bubble.mine').last()).toHaveText(text);
}
test('letters arrive privately, show safe text, stay in both letterboxes and are marked read when opened',async({browser},info)=>{
  const seats=await roomFixture(),a=await open(browser,seats[0]),b=await open(browser,seats[1],320),c=await open(browser,seats[2]);
  try{
    const message='<img src=x onerror=alert(1)> Meet near cabin 4.';
    await send(a.page,'Mel',message);await expect(b.page.getByRole('button',{name:'Open private letters (1 unread)',exact:true})).toBeVisible();
    let room=await store.load(seats[0].code);expect(room.letters).toHaveLength(1);
    expect(rules.view(room,room.players.find(p=>p.id===seats[2].meId)).me.letters).toEqual([]);
    expect(rules.view(room,room.players.find(p=>p.id===seats[0].meId)).me.letters.map(m=>m.text)).toEqual([message]);
    // Merely receiving or refreshing must not mark a letter read.
    await b.page.reload();await b.page.getByRole('button',{name:'Open private letters (1 unread)',exact:true}).click();
    await expect(letterbox(b.page).getByRole('button',{name:'Letters with Benny, 1 unread'})).toBeVisible();
    expect((await store.load(seats[0].code)).letters[0].read).toBe(false);
    await letterbox(b.page).getByRole('button',{name:'Letters with Benny, 1 unread'}).click();
    await expect(letterbox(b.page).locator('.letter-bubble')).toHaveText(message);await expect(letterbox(b.page).locator('.letter-bubble img')).toHaveCount(0);
    expect(await b.page.evaluate(()=>JSON.stringify(localStorage))).not.toContain(message);
    await expect.poll(async()=>(await store.load(seats[0].code)).letters[0].read).toBe(true);
    await b.page.screenshot({path:info.outputPath('private-letters-mobile.png')});
    expect(await letterbox(b.page).evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);expect(await b.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    // Read letters stay: closing and reopening keeps the conversation.
    await letterbox(b.page).getByRole('button',{name:'Close private letters'}).click();
    await b.page.getByRole('button',{name:'Open private letters',exact:true}).click();await letterbox(b.page).getByRole('button',{name:'Letters with Benny'}).click();
    await expect(letterbox(b.page).locator('.letter-bubble')).toHaveCount(1);
    // An open conversation reads arrivals at once, so the sender closes theirs first.
    await a.page.keyboard.press('Escape');await a.page.keyboard.press('Escape');await expect(letterbox(a.page)).toHaveCount(0);
    await send(b.page,'Benny','Seat 3, after the bell.');await expect(a.page.getByRole('button',{name:'Open private letters (1 unread)',exact:true})).toBeVisible();
    await openThread(a.page,'Mel');await expect(letterbox(a.page).locator('.letter-bubble')).toHaveText([message,'Seat 3, after the bell.']);
    await expect(c.page.getByRole('button',{name:'Open private letters',exact:true})).toBeVisible();
    expect([...a.errors,...b.errors,...c.errors]).toEqual([]);
  }finally{await Promise.all([a.context.close(),b.context.close(),c.context.close()]);}
});
test('a failed read receipt keeps the letter unread, and drafts survive night steps',async({browser})=>{
  const seats=await roomFixture();let fail=false;const a=await open(browser,seats[0]),b=await open(browser,seats[1],390,()=>fail);
  try{
    await send(a.page,'Mel','Read me twice.');
    fail=true;await b.page.getByRole('button',{name:'Open private letters (1 unread)',exact:true}).click();await letterbox(b.page).getByRole('button',{name:/^Letters with Benny/}).click();
    await expect(letterbox(b.page).locator('.letter-bubble')).toHaveText('Read me twice.');
    await b.page.waitForTimeout(500);expect((await store.load(seats[0].code)).letters[0].read).toBe(false);
    fail=false;await b.page.keyboard.press('Escape');await b.page.keyboard.press('Escape');
    await b.page.getByRole('button',{name:'Open private letters (1 unread)',exact:true}).click();await letterbox(b.page).getByRole('button',{name:/^Letters with Benny/}).click();
    await expect.poll(async()=>(await store.load(seats[0].code)).letters[0].read).toBe(true);
    // An open conversation reads arrivals at once, so the receiver closes theirs before the next letter.
    await b.page.keyboard.press('Escape');await b.page.keyboard.press('Escape');await expect(letterbox(b.page)).toHaveCount(0);
    await openThread(a.page,'Mel');await letterbox(a.page).getByLabel('Your letter to Mel').fill('I want this draft to stay.');
    const room=await store.load(seats[0].code);rules.advance(room);room.deadline=Date.now()+120000;await store.save(room);
    await expect(a.page.locator('#lt-app')).toHaveAttribute('data-phase','night');await expect(letterbox(a.page).getByLabel('Your letter to Mel')).toHaveValue('I want this draft to stay.');
    await letterbox(a.page).getByRole('button',{name:'Send',exact:true}).click();await expect(letterbox(a.page).locator('.letter-bubble.mine').last()).toHaveText('I want this draft to stay.');
    await b.page.getByRole('button',{name:'Open private letters (1 unread)',exact:true}).click();await letterbox(b.page).getByRole('button',{name:/^Letters with Benny/}).click();
    await expect(letterbox(b.page).locator('.letter-bubble')).toHaveText(['Read me twice.','I want this draft to stay.']);
    expect([...a.errors,...b.errors]).toEqual([]);
  }finally{await Promise.all([a.context.close(),b.context.close()]);}
});
