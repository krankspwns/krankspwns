const {test,expect}=require('@playwright/test');
const {call}=require('../helpers');
const handler=require('../../api/hot-joker');
const {randomUUID}=require('node:crypto');

test('One tap draws a card while its owner cannot rearrange, then unlocks their hand',async({browser})=>{
  const enter=(action,data)=>call(handler,{action,requestId:randomUUID(),...data});
  const a=(await enter('create',{name:'Ann'})).j;
  const b=(await enter('join',{code:a.code,name:'Bo'})).j;
  const c=(await enter('join',{code:a.code,name:'Cy'})).j;
  await enter('start',{code:a.code,pid:a.meId,tok:a.tok,match:a.match});
  const room=globalThis.__roomStoreRooms['hot-joker'].get(a.code);
  Object.assign(room,{order:[a.meId,b.meId,c.meId],hands:{[a.meId]:['S2','H3'],[b.meId]:['D4','C5'],[c.meId]:['S6','HK','JK']},taker:a.meId,turn:0,placed:[],sets:[],last:{},deadline:Date.now()+60000});
  const current=()=>globalThis.__roomStoreRooms['hot-joker'].get(a.code);
  const requests=[];
  async function open(seat){
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const page=await context.newPage();
    await page.route('**/api/hot-joker**',async route=>{
      const req=route.request(),url=new URL(req.url());
      const body=req.method()==='POST'?req.postDataJSON():null;
      if(body)requests.push(body);
      const res=await call(handler,body,Object.fromEntries(url.searchParams),req.headers());
      await route.fulfill({status:res.s,json:res.j});
    });
    await page.addInitScript(seat=>localStorage.setItem('hj-seat',JSON.stringify({code:seat.code,pid:seat.meId,tok:seat.tok})),seat);
    await page.goto('/hot-joker.html');
    await expect(page.locator('.hand-row .pcard')).toHaveCount(room.hands[seat.meId].length);
    return {context,page};
  }
  const source=await open(c),taker=await open(a);
  await expect(source.page.locator('.hand-panel')).toContainText('Your cards are locked');
  await expect(source.page.locator('[data-focus="shuffle"], [data-focus="move-left"], [data-focus="move-right"]')).toHaveCount(0);
  await expect(source.page.locator('.hand-row button')).toHaveCount(0);
  const card=source.page.locator('.hand-row .pcard').first();
  await card.scrollIntoViewIfNeeded();const box=await card.boundingBox();
  await source.page.mouse.move(box.x+10,box.y+10);await source.page.mouse.down();await source.page.mouse.move(box.x+90,box.y+10,{steps:5});await source.page.mouse.up();
  expect(requests.filter(r=>['move','shuffle'].includes(r.action))).toHaveLength(0);
  await expect(taker.page.locator('[data-focus="take-confirm"]')).toHaveCount(0);
  await taker.page.locator('[data-focus="pick-0"]').evaluate(n=>{n.click();n.click()});
  await expect.poll(()=>current().turn).toBe(1);
  expect(requests.filter(r=>r.action==='take')).toHaveLength(1);
  expect(current().hands[c.meId]).toEqual(['HK','JK']);
  await expect(source.page.locator('[data-focus="shuffle"]')).toBeVisible();
  await source.page.locator('[data-focus="shuffle"]').click();
  await expect.poll(()=>requests.filter(r=>r.action==='shuffle').length).toBe(1);
  expect(current().hands[c.meId].slice().sort()).toEqual(['HK','JK']);
  await source.context.close();await taker.context.close();
});
