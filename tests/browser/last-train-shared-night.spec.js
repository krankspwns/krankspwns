const { test, expect } = require('@playwright/test');
const { call: rawCall } = require('../helpers');
const api = require('../../api/last-train'), rules = require('../../lib/last-train-rules'), store = require('../../lib/last-train-store');
const call = (body, query = {}, headers = {}) => rawCall(api, body, query, { ...headers, 'x-forwarded-for': test.info().testId });
async function setup(browser) {
  const make = async (action, extra) => { const r = await call({ action, requestId: crypto.randomUUID(), ...extra }); expect(r.s).toBe(200); return r.j; };
  const host = await make('create', { name: 'Host' }), seats = [host];
  for(let i=1;i<9;i++)seats.push(await make('join',{code:host.code,name:'Traveller '+i}));
  const room = await store.load(host.code); rules.start(room);
  ['passenger','careful','brave','witness','inspector','medic','trainee','saboteur','blocker'].forEach((role,i)=>Object.assign(room.players[i],{role,originalRole:role}));
  rules.beginNight(room); rules.advance(room); room.deadline=Date.now()+120000; await store.save(room);
  const contexts=[];
  const open=async(role,width=390)=>{
    const person=room.players.find(p=>p.role===role),s=seats.find(s=>s.meId===person.id),context=await browser.newContext({viewport:{width,height:844}}); contexts.push(context);
    await context.addInitScript(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:s.code,pid:s.meId,tok:s.tok});
    const requests=[];
    await context.route('**/api/last-train**',async route=>{const req=route.request(),url=new URL(req.url()),body=req.method()==='POST'?JSON.parse(req.postData()):null;if(body)requests.push(body);const r=await call(body,Object.fromEntries(url.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/last-train.html');await expect(page.locator('.room-code')).toHaveText(host.code);return {page,person,requests,errors};
  };
  const save=async room=>{room.deadline=Date.now()+120000;await store.save(room);};
  return {room,host,open,save,close:()=>Promise.all(contexts.map(c=>c.close()))};
}
test('shared nights give everyone private activities, preserve notes and keep power results private',async({browser},info)=>{
  const b=await setup(browser);
  try {
    const passenger=await b.open('passenger'),inspector=await b.open('inspector'),blocker=await b.open('blocker');
    await expect(passenger.page.locator('.scene-hud h1')).toHaveText('Night phase 1 of 2.');
    await expect(inspector.page.getByRole('button',{name:'Choose',exact:true})).toHaveCount(0);
    const mark=passenger.page.getByLabel('Your view of '+blocker.person.name,{exact:true});await mark.selectOption('suspect');await passenger.page.reload();await expect(mark).toHaveValue('suspect');
    expect(passenger.requests).toHaveLength(0);
    await blocker.page.locator('.team-chat summary').click();
    expect(await blocker.page.getByLabel('Whisper to your team',{exact:true}).evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(16);
    await blocker.page.getByRole('button',{name:'Choose Target',exact:true}).click();let d=blocker.page.getByRole('dialog');await d.locator('[data-id="'+passenger.person.id+'"]').click();await d.getByRole('button',{name:/^Confirm:/}).click();
    await blocker.page.getByRole('button',{name:'Use Blocker power',exact:true}).click();d=blocker.page.getByRole('dialog');await d.locator('[data-id="'+inspector.person.id+'"]').click();await d.getByRole('button',{name:/^Confirm:/}).click();
    await expect(blocker.page.locator('.bad-console')).toContainText('Block used: '+inspector.person.name);
    let room=await store.load(b.host.code);expect(room.phase).toBe('night');expect(room.duration).toBe(25);expect(room.night.choices[blocker.person.id].attackId).toBe(passenger.person.id);
    rules.advance(room);await b.save(room);
    await expect(passenger.page.locator('.scene-hud h1')).toHaveText('Night phase 2 of 2.');
    await expect(mark).toHaveValue('suspect');await mark.selectOption('trust');await passenger.page.reload();await expect(mark).toHaveValue('trust');
    await expect(passenger.page.getByRole('heading',{name:'Who do you trust?',exact:true})).toBeVisible();
    await expect(passenger.page.getByLabel('Your private cover story',{exact:true})).toHaveCount(0);
    const story=blocker.page.getByLabel('Your private cover story',{exact:true});await story.fill('I watched the corridor and saw nothing.');await blocker.page.reload();await expect(story).toHaveValue('I watched the corridor and saw nothing.');
    expect(blocker.requests.some(r=>JSON.stringify(r).includes('I watched the corridor'))).toBe(false);
    expect(await story.evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(16);
    await inspector.page.getByRole('button',{name:'Choose',exact:true}).click();d=inspector.page.getByRole('dialog');await d.locator('[data-id="'+blocker.person.id+'"]').click();await d.getByRole('button',{name:/^Confirm:/}).click();await expect(inspector.page.getByRole('dialog',{name:'Your private result',exact:true})).toContainText('blocked');
    await expect(passenger.page.getByRole('dialog',{name:'Your private result',exact:true})).toHaveCount(0);
    const medic=await b.open('medic');await expect(medic.page.locator('.patient-heading')).toContainText(passenger.person.name+' was attacked.');
    await passenger.page.screenshot({path:info.outputPath('passenger-night-notebook-mobile.png'),fullPage:true});
    await passenger.page.getByRole('button',{name:/^Open private letters/}).click();const message=passenger.page.getByLabel('Your message',{exact:true});expect(await message.evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(16);await message.fill('Hello');await passenger.page.keyboard.press('Escape');
    room=await store.load(b.host.code);rules.medicineChoice(room,room.players.find(p=>p.role==='medic'),{power:'heal'});rules.advance(room);rules.advance(room);rules.advance(room);room.speakerIndex=room.speakingOrder.indexOf(blocker.person.id);await b.save(room);
    await expect(blocker.page.locator('.private-question')).toContainText('I watched the corridor and saw nothing.');
    await expect(passenger.page.locator('.private-question')).toHaveCount(0);
    room=await store.load(b.host.code);rules.beginNight(room);rules.advance(room);rules.advance(room);await b.save(room);
    await expect(blocker.page.getByLabel('Your private cover story',{exact:true})).toHaveValue('');
    await expect(mark).toHaveValue('trust');
    expect(await passenger.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect([...passenger.errors,...inspector.errors,...blocker.errors,...medic.errors]).toEqual([]);
  } finally {await b.close();}
});
test('morning and journey log show attack, poison and overdose without exact role disclosure',async({browser},info)=>{
  const b=await setup(browser);
  try {
    const room=b.room,passenger=room.players.find(p=>p.role==='passenger'),medic=room.players.find(p=>p.role==='medic'),brave=room.players.find(p=>p.role==='brave');
    rules.nightChoice(room,room.players.find(p=>p.role==='saboteur'),{attackId:passenger.id});rules.advance(room);rules.medicineChoice(room,medic,{power:'poison',targetId:brave.id});rules.advance(room);rules.advance(room);await b.save(room);
    const a=await b.open('inspector');await expect(a.page.locator('.morning-reveal .revealed-out')).toHaveCount(2);await expect(a.page.locator('.morning-reveal')).toContainText('Attacked');await expect(a.page.locator('.morning-reveal')).toContainText('Poisoned');await expect(a.page.locator('.morning-reveal')).toContainText('Their role stays secret');await expect(a.page.locator('.journey-log')).toContainText('Poisoned');
    room.history[0].outs[0].causes=['overdose'];await b.save(room);await expect(a.page.locator('.morning-reveal')).toContainText('Overdose');await a.page.screenshot({path:info.outputPath('morning-death-causes-mobile.png'),fullPage:true});expect(a.errors).toEqual([]);
  } finally {await b.close();}
});


test('mobile controls keep text at 16px including lobby, discussion, private letters and notebook',async({browser})=>{
  const b=await setup(browser);
  try {
    const a=await b.open('passenger',320),page=a.page;
    await page.getByRole('button',{name:'Open private notebook',exact:true}).click();
    const notebook=page.locator('dialog.notebook');
    const textMode=notebook.getByRole('button',{name:'Type',exact:true});await textMode.click();
    expect(await notebook.locator('textarea').evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(16);
    await page.keyboard.press('Escape');
    let room=await store.load(b.host.code);rules.beginDiscussion(room);room.speakerIndex=room.speakingOrder.indexOf(a.person.id);room.settings.discussion='chat';await b.save(room);
    await expect(page.getByLabel('Your findings',{exact:true})).toBeVisible();
    expect(await page.getByLabel('Your findings',{exact:true}).evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(16);
    await page.getByRole('button',{name:/^Open private letters/}).click();
    for(const control of await page.locator('.letter-compose textarea,.letter-compose select').all())expect(await control.evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(16);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>localStorage.removeItem('lt-seat'));await page.goto('/last-train.html');
    const fields=page.locator('input:not([type=checkbox]):not([type=radio]),textarea,select');expect(await fields.count()).toBeGreaterThan(0);
    for(const control of await fields.all())expect(await control.evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(a.errors).toEqual([]);
  }finally{await b.close();}
});
