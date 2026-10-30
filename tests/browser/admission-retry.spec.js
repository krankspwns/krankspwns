const {test,expect}=require('@playwright/test');
const {call}=require('../helpers'),{randomUUID}=require('node:crypto');
for(const [game,apiName,input,join,code] of [
  ['reckoning','game','#player-name','Join','#room-code'],
  ['bridge','bridge','#tk-name','Join Room','#tk-code'],
  ['hot-joker','hot-joker','#tk-name','Join Room','#tk-code'],
  ['grand-con','grand-con','#gc-name','Join room','#gc-code'],
  ['last-train','last-train','#lt-name','Join Room','#lt-code'],
])test(game+': a lost initial join response can be resumed after reload without another seat',async({page})=>{
  const handler=require('../../api/'+apiName);
  const h=(await call(handler,{action:'create',name:'Host',requestId:randomUUID()})).j;
  let lost=false,firstId,firstSeat,latest;
  await page.route('**/api/'+apiName+'**',async route=>{
    const req=route.request(),url=new URL(req.url()),body=req.method()==='POST'?req.postDataJSON():null;
    const r=await call(handler,body,Object.fromEntries(url.searchParams),req.headers());
    if(body?.action==='join'){
      if(!lost){expect(r.s).toBe(200);firstId=body.requestId;firstSeat=r.j.meId;lost=true;return route.abort();}
      expect(body.requestId).toBe(firstId);expect(r.j.meId).toBe(firstSeat);latest=r.j;
    }
    await route.fulfill({status:r.s,json:r.j});
  });
  await page.goto('/'+game+'.html');
  // Each game's name and code fields keep their native IDs.
  const fields=async()=>{
    const name=page.locator(input);await name.fill('Lost Guest');await page.locator(code).fill(h.code);
    await page.getByRole('button',{name:join,exact:true}).click();
  };
  await fields();await expect.poll(()=>lost).toBe(true);
  await expect(page.getByRole('button',{name:join,exact:true})).toBeEnabled();
  await page.reload();await fields();await expect.poll(()=>latest?.meId).toBe(firstSeat);
  expect(latest.players).toHaveLength(2);
});
