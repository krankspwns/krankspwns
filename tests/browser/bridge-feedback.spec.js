const {test,expect}=require('@playwright/test');
const {call}=require('../helpers');
const handler=require('../../api/bridge');
const {randomUUID}=require('node:crypto');

async function fixture(page, playing=false) {
  const enter=(action,data)=>call(handler,{action,requestId:randomUUID(),...data});
  const host=(await enter('create',{name:'Ann'})).j;
  const guests=[];
  for(const name of ['Bo','Cy','Di']) guests.push((await enter('join',{code:host.code,name})).j);
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
  await page.addInitScript(seat=>{if(!localStorage.getItem('br-seat'))localStorage.setItem('br-seat',JSON.stringify(seat));},{code:host.code,pid:host.meId,tok:host.tok});
  await page.goto('/bridge.html');
  return {host,room,guests};
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
  await expect(page.locator('.deal-status')).toContainText('Your Tricks:');
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

for (const [label, width, partner, made] of [['phone',320,2,true],['phone defenders',320,0,false],['desktop defenders',1100,0,false]]) {
  test('Deal reveal: balanced card rows, named seats and celebrated winners, ' + label, async({page},testInfo)=>{
    await page.setViewportSize({width,height:900});
    await page.emulateMedia({reducedMotion:'no-preference'});
    const {room}=await fixture(page,true);
    room.d.partner=partner;
    // Reuse a genuine deciding play so scores/history stay server-authoritative.
    room.d.tricks=6;
    room.d.tricksBy=made?[6,0,0,0]:[0,6,0,0];
    room.d.trick=[{seat:0,card:made?'HA':'H2'},{seat:1,card:made?'H2':'HA'},{seat:2,card:'H3'}];
    room.d.turn=3; room.d.hands[3]=['H4'];
    handler._rules.doPlay(room,'H4'); room.d.collectUntil=Date.now()-1;
    globalThis.__roomStoreRooms.bridge.set(room.code,room);
    await page.reload();
    await expect(page.locator('.victory-banner')).toBeVisible();
    await expect(page.locator('.victory-player')).toHaveCount(made?2:3);
    await expect(page.locator('.victory-banner h1')).toHaveText(made?'Contract Made!':'Defenders Win!');
    await expect(page.locator('.reveal-hand')).toHaveCount(4);
    const rows=await page.locator('.reveal-hand').evaluateAll(hands=>hands.map(h=>[...h.querySelectorAll('.result-card-row')].map(r=>r.children.length)));
    expect(rows).toEqual(Array.from({length:4},()=>[5,4,4]));
    await expect(page.locator('body')).not.toContainText(/North|South|East|West/);
    const delay=()=>page.locator('.victory-banner').evaluate(e=>parseFloat(getComputedStyle(e).animationDelay));
    const first=await delay();
    globalThis.__roomStoreRooms.bridge.get(room.code).version++;
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(delay).toBeLessThan(first);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({path:testInfo.outputPath('deal-result.png'),fullPage:true});
    room.phase='finished';
    globalThis.__roomStoreRooms.bridge.set(room.code,room);
    await page.reload();
    await expect(page.locator('.victory-banner')).toContainText(/Wins!|Joint Champions!/);
    await page.screenshot({path:testInfo.outputPath('match-winner.png'),fullPage:true});
  });
}

test('Only the called-card holder sees the secret-partner badge before playing it',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  const {host,room,guests}=await fixture(page,true);
  room.d.called=room.d.original[2][0]; room.d.revealed=false;
  globalThis.__roomStoreRooms.bridge.set(room.code,room);
  await page.reload();
  await expect(page.locator('.partner-pending')).toContainText('Partner Hidden');
  await expect(page.locator('.partner-private')).toHaveCount(0);
  await expect(page.locator('.team-privacy')).toContainText('Team totals stay hidden');
  const partner=guests[1];
  await page.evaluate(s=>localStorage.setItem('br-seat',JSON.stringify(s)),{code:partner.code,pid:partner.meId,tok:partner.tok});
  await page.reload();
  await expect(page.locator('.partner-private')).toContainText('You’re the Secret Partner');
  await expect(page.locator('.partner-private')).toContainText('Only You Can See This');
  await expect(page.locator('.called-partner-card')).toHaveCount(1);
  await page.screenshot({path:testInfo.outputPath('private-partner.png'),fullPage:true});
  const live=globalThis.__roomStoreRooms.bridge.get(room.code);
  live.d.turn=2;
  handler._rules.doPlay(live,live.d.called);
  await page.reload();
  await expect(page.locator('.partner-private')).toContainText('Your Team Is Now Public');
  await page.evaluate(s=>localStorage.setItem('br-seat',JSON.stringify(s)),{code:host.code,pid:host.meId,tok:host.tok});
  await page.reload();
  await expect(page.locator('.partner-pending')).toHaveCount(0);
  await expect(page.locator('.team-privacy')).toContainText('Cy is the partner.');
});
