const {test,expect}=require('@playwright/test');
const {call}=require('../helpers');
const handler=require('../../api/bridge');
const {randomUUID}=require('node:crypto');

async function fixture(page, playing=false) {
  const enter=(action,data)=>call(handler,{action,requestId:randomUUID(),...data});
  const host=(await enter('create',{name:'Ann'})).j;
  for(const name of ['Bo','Cy','Di']) await enter('join',{code:host.code,name});
  await enter('start',{code:host.code,pid:host.meId,tok:host.tok,match:host.match});
  const room=globalThis.__roomStoreRooms.bridge.get(host.code);
  room.phase=playing?'playing':'bidding';
  room.d.turn=room.seats.indexOf(host.meId);
  if(playing) {
    Object.assign(room.d,{contract:{level:1,denom:'N',declarer:0},declarer:0,partner:2,called:'CA',revealed:true,tricks:6,tricksBy:[6,0,0,0],trick:[],lastTrick:null});
  }
  await page.route('**/api/bridge**',async route=>{
    const req=route.request(),url=new URL(req.url());
    const result=await call(handler,req.method()==='POST'?req.postDataJSON():null,Object.fromEntries(url.searchParams),req.headers());
    await route.fulfill({status:result.s,json:result.j});
  });
  await page.addInitScript(seat=>localStorage.setItem('br-seat',JSON.stringify(seat)),{code:host.code,pid:host.meId,tok:host.tok});
  await page.goto('/bridge.html');
  return {host,room};
}

test('Compact mobile bidding uses separate number and suit choices, with transparent card labels',async({page},testInfo)=>{
  await page.setViewportSize({width:320,height:760});
  const {room}=await fixture(page);
  await expect(page.locator('.bid-levels button')).toHaveCount(7);
  await expect(page.locator('.bid-suits button')).toHaveCount(5);
  await page.getByRole('button',{name:'Level 2',exact:true}).click();
  await page.getByRole('button',{name:'Spades',exact:true}).click();
  await expect(page.locator('[data-focus="bid-confirm"]')).toHaveText('Bid 2 Spades');
  await expect(page.locator('.bid-explanation')).toHaveText('Your team needs 8 tricks.');
  expect(await page.locator('.card-index').first().evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:testInfo.outputPath('bidding-320.png'),fullPage:true});
  await page.locator('[data-focus="bid-confirm"]').click();
  await expect.poll(()=>globalThis.__roomStoreRooms.bridge.get(room.code).d.calls.at(-1)?.call).toBe('2S');
});

test('The deciding trick collects toward its winner before next deal is allowed',async({page},testInfo)=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:390,height:844});
  const {host,room}=await fixture(page,true);
  await expect(page.locator('.team-progress-grid')).toContainText('Defenders');
  await expect(page.locator('.deal-status')).toContainText('Your tricks:');
  await page.screenshot({path:testInfo.outputPath('play-390.png'),fullPage:true});
  // Stage the fourth card and let the real engine decide and score the deal.
  room.d.turn=3;
  room.d.trick=[{seat:0,card:'HA'},{seat:1,card:'H2'},{seat:2,card:'H3'}];
  room.d.hands[3]=['H4','C2'];
  handler._rules.doPlay(room,'H4');
  globalThis.__roomStoreRooms.bridge.set(room.code,room);
  await page.reload();
  await expect(page.locator('.collection-card')).toHaveCount(4);
  await expect(page.locator('.trick-caption')).toContainText('won trick 7');
  await expect(page.locator('[data-focus="next"]')).toBeDisabled();
  expect(room.phase).toBe('reveal');
  expect(room.history).toHaveLength(1);
  const frames=await page.locator('.collection-card').first().evaluate(e=>e.getAnimations()[0].effect.getKeyframes());
  expect(frames.at(-1).transform).toContain('scale(0.28)');
  await page.waitForTimeout(1800);
  await expect(page.locator('.collection-card')).toHaveCount(0);
  await expect(page.locator('[data-focus="next"]')).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
