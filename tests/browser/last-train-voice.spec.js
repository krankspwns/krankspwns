const {test,expect}=require('@playwright/test');
const {call}=require('../helpers');
const handler=require('../../api/last-train'),rules=require('../../lib/last-train-rules'),store=require('../../lib/last-train-store');
test.use({launchOptions:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']}});
async function fixture(browser,{mode='chat',denied=false}={}){
  const enter=async(action,extra)=>{const r=await call(handler,{action,requestId:crypto.randomUUID(),...extra});expect(r.s).toBe(200);return r.j;};
  const host=await enter('create',{name:'Host'}),seats=[host];for(let i=1;i<6;i++)seats.push(await enter('join',{code:host.code,name:'Rider '+i}));
  let room=await store.load(host.code);room.settings.discussion=mode;rules.start(room);room.round=1;rules.beginDiscussion(room);room.speakingOrder=[host.meId,...seats.slice(1).map(s=>s.meId)];room.deadline=Date.now()+120000;await store.save(room);
  const contexts=[];
  const open=async seat=>{
    const context=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone']});contexts.push(context);
    await context.addInitScript(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:seat.code,pid:seat.meId,tok:seat.tok});
    if(denied)await context.addInitScript(()=>navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Denied','NotAllowedError')));
    await context.addInitScript(()=>{const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.micRequests=0;navigator.mediaDevices.getUserMedia=async(...a)=>{window.micRequests++;const s=await get(...a);window.recordedStream=s;return s;};});
    await context.route('**/api/last-train**',async route=>{const req=route.request(),u=new URL(req.url());const r=await call(handler,req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(u.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/last-train.html');await expect(page.locator('#lt-app')).toHaveAttribute('data-phase','discussion');return{page,errors};
  };
  return {host,seats,open,contexts,post:async(action,extra={})=>{const r=await store.load(host.code);return enter(action,{code:host.code,pid:host.meId,tok:host.tok,match:r.match,round:r.round,step:r.step,...extra});}};
}
test('a recorded turn is shared without poll payloads, then another phone can play it and keep playback through updates',async({browser},info)=>{
  const b=await fixture(browser),a=await b.open(b.host),other=await b.open(b.seats[1]);
  try{
    expect(await a.page.evaluate(()=>window.micRequests)).toBe(0);
    await a.page.getByRole('button',{name:'Record Voice',exact:true}).click();await expect(a.page.getByRole('button',{name:'Stop & Share',exact:true})).toBeVisible();
    await expect(a.page.getByRole('button',{name:'Type Message'})).toHaveCount(0);await a.page.waitForTimeout(1200);
    await a.page.getByRole('button',{name:'Stop & Share',exact:true}).click();await expect.poll(async()=>(await store.load(b.host.code)).speeches.length).toBe(1);
    let room=await store.load(b.host.code);const message=room.speeches[0];expect(message.audio.durationMs).toBeGreaterThan(900);expect(message.audio.durationMs).toBeLessThanOrEqual(20000);expect(message.audio.data).toBeUndefined();
    expect(room.speakerIndex).toBe(1);expect(room.speakingOrder[1]).toBe(b.seats[1].meId);
    await expect(other.page.getByRole('button',{name:/^Play voice message/})).toBeEnabled();
    expect(await a.page.evaluate(()=>window.recordedStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
    await other.page.getByRole('button',{name:/^Play voice message/}).click();const audio=other.page.locator('.voice-message audio');
    await expect(other.page.getByRole('button',{name:/^Pause voice message/})).toBeVisible();await expect.poll(()=>audio.evaluate(a=>a.readyState)).toBeGreaterThanOrEqual(2);expect(await audio.evaluate(a=>a.duration)).toBeGreaterThan(.5);
    // Play state and the loaded URL survive ordinary room updates; the clip is not fetched by polling.
    await audio.evaluate(a=>{window.savedVoicePlayer=a;a.loop=true;return a.play();});
    room=await store.load(b.host.code);room.notice='Voice retained';await store.save(room);await expect(other.page.locator('.waiting')).toContainText('Voice retained');
    expect(await audio.evaluate(a=>a===window.savedVoicePlayer)).toBe(true);await expect(audio).toHaveJSProperty('paused',false);
    expect(await other.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await other.page.screenshot({path:info.outputPath('voice-playback-mobile.png'),fullPage:true});
    expect([...a.errors,...other.errors]).toEqual([]);
  }finally{await Promise.all(b.contexts.map(c=>c.close()));}
});
test('turn expiry auto-shares a recording, while pause and discard release the microphone without a message',async({browser})=>{
  const b=await fixture(browser),a=await b.open(b.host);
  try{
    await a.page.getByRole('button',{name:'Record Voice',exact:true}).click();await expect(a.page.getByRole('button',{name:'Stop & Share',exact:true})).toBeVisible();await a.page.waitForTimeout(500);
    await b.post('pause');await expect(a.page.locator('.voice-time')).toContainText('Paused');await expect(a.page.getByRole('button',{name:'Stop & Share',exact:true})).toBeDisabled();
    await a.page.getByRole('button',{name:'Discard',exact:true}).click();expect(await a.page.evaluate(()=>window.recordedStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);expect((await store.load(b.host.code)).speeches).toHaveLength(0);
    await b.post('resume');await expect(a.page.getByRole('button',{name:'Record Voice',exact:true})).toBeEnabled();await a.page.getByRole('button',{name:'Record Voice',exact:true}).click();await expect(a.page.getByRole('button',{name:'Stop & Share',exact:true})).toBeVisible();await a.page.waitForTimeout(500);
    let room=await store.load(b.host.code);room.deadline=Date.now()+700;room.duration=20;await store.save(room);await expect.poll(async()=>(await store.load(b.host.code)).speeches.length).toBe(1);
    expect(await a.page.evaluate(()=>window.recordedStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);expect(a.errors).toEqual([]);
  }finally{await Promise.all(b.contexts.map(c=>c.close()));}
});
test('denied microphone leaves typed discussion available without changing another player’s turn',async({browser})=>{
  const b=await fixture(browser,{denied:true}),a=await b.open(b.host);
  try{
    await a.page.getByRole('button',{name:'Record Voice',exact:true}).click();await expect(a.page.locator('.voice-feedback')).toContainText('Microphone access is off');
    await a.page.getByRole('button',{name:'Type Message'}).click();await expect(a.page.getByLabel('Your findings')).toBeEnabled();await a.page.getByLabel('Your findings').fill('I can still share a typed message.');await a.page.getByRole('button',{name:'Share Message',exact:true}).click();
    await expect.poll(async()=>(await store.load(b.host.code)).speeches[0]?.text).toBe('I can still share a typed message.');expect(a.errors).toEqual([]);
  }finally{await Promise.all(b.contexts.map(c=>c.close()));}
});
test('in-person rooms can also record their turn and replay it after moving to the next speaker',async({browser})=>{
  const b=await fixture(browser,{mode:'in-person'}),a=await b.open(b.host);
  try{
    await a.page.getByRole('button',{name:'Record Voice',exact:true}).click();await expect(a.page.getByRole('button',{name:'Stop & Share',exact:true})).toBeVisible();await a.page.waitForTimeout(700);await a.page.getByRole('button',{name:'Stop & Share',exact:true}).click();await expect.poll(async()=>(await store.load(b.host.code)).speeches.length).toBe(1);
    expect((await store.load(b.host.code)).speakerIndex).toBe(1);await expect(a.page.getByRole('button',{name:'I’m Done Speaking',exact:true})).toHaveCount(0);await expect(a.page.getByRole('heading',{name:'Conversations Aboard',exact:true})).toBeVisible();await expect(a.page.getByRole('button',{name:/^Play voice message/})).toBeEnabled();expect(a.errors).toEqual([]);
  }finally{await Promise.all(b.contexts.map(c=>c.close()));}
});
