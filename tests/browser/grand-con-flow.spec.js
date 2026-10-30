const {test,expect}=require('@playwright/test');
const {call:rawCall}=require('../helpers');
const api=require('../../api/grand-con'),rules=api._rules,store=require('../../lib/grand-con-store');
test('capture the Grand Con flow with cartoon guests, private clues and a realistic trophy',async({browser},info)=>{
  const headers={'x-forwarded-for':info.testId},contexts=[];
  const call=(body,query={},extra={})=>rawCall(api,body,query,{...extra,...headers});
  const make=async(action,extra)=>{const r=await call({action,requestId:crypto.randomUUID(),...extra});expect(r.s).toBe(200);return r.j;};
  const host=await make('create',{name:'Benny'}),seats=[host];for(const name of ['Mei','Ash','Luna','Kai','Zoe'])seats.push(await make('join',{code:host.code,name}));
  const post=async(seat,action,extra={})=>{const room=await store.load(host.code);return make(action,{code:seat.code,pid:seat.meId,tok:seat.tok,match:room.match,lotNumber:room.lot+1,...extra});};
  const open=async seat=>{
    const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});contexts.push(context);
    await context.addInitScript(s=>localStorage.setItem('gc-seat',JSON.stringify(s)),{code:seat.code,pid:seat.meId,tok:seat.tok});
    await context.route('**/api/grand-con**',async route=>{const req=route.request(),url=new URL(req.url()),r=await call(req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(url.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('/grand-con.html');await expect(page.locator('.room-code')).toHaveText(host.code);return page;
  };
  const errors=[];
  const shot=async(page,name,focus)=>{if(focus)await page.locator(focus).scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:info.outputPath(name+'.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);};
  try{
    const hostPage=await open(host);await shot(hostPage,'01-lobby','.room-code');
    await post(host,'start');let room=await store.load(host.code);
    room.players.forEach((p,i)=>p.team=i===2||i===3?'ring':'house');room.lots[0]={caseId:'crown',genuine:false};rules.beginLot(room);
    const first=room.documents[0],meis=room.documents.find(d=>d.ownerId===seats[1].meId),oldOwner=first.ownerId;meis.ownerId=oldOwner;first.ownerId=seats[1].meId;await store.save(room);
    const forgerPage=await open(seats[2]),meiPage=await open(seats[1]);
    await forgerPage.getByRole('button',{name:'Open my card',exact:true}).click();await forgerPage.locator('[data-focus="forge-'+seats[1].meId+'"]').click();await shot(forgerPage,'02-lie-team-changes-clue','.forgery-preview');
    await forgerPage.getByRole('button',{name:'Confirm clue change',exact:true}).click();
    room=await store.load(host.code);expect(room.phase).toBe('forging');rules.advance(room);await store.save(room);
    await expect(meiPage.getByRole('heading',{name:'Talk about your clues.'})).toBeVisible();await meiPage.getByRole('button',{name:'Open my card',exact:true}).click();await shot(meiPage,'03-private-clue','.clue>p');await meiPage.keyboard.press('Escape');
    const received=p=>{const d=room.documents.find(d=>d.ownerId===p.meId);return d.ownerId===room.tamper.ownerId?room.tamper.altered:d.text;};
    await post(host,'claim',{text:'My clue: '+received(host),choice:'unsure'});await post(seats[1],'claim',{text:'My clue: '+received(seats[1]),choice:'approve'});await post(seats[2],'claim',{text:'The new metal is only around the stones. I think it is real.',choice:'approve'});
    await expect(hostPage.locator('.public-claim')).toHaveCount(3);await shot(hostPage,'04-discussion-and-claims','.claims-board');
    await hostPage.getByRole('button',{name:'Open my card',exact:true}).click();await hostPage.locator('[data-focus="check-'+seats[1].meId+'"]').click();await hostPage.getByRole('button',{name:'Check original',exact:true}).click();await expect(hostPage.locator('.audit-report')).toContainText('1865');await shot(hostPage,'05-private-original-check','.audit-report');await hostPage.keyboard.press('Escape');
    await post(host,'advance');await expect(hostPage.getByRole('heading',{name:'Is this item real or fake?'})).toBeVisible();await hostPage.locator('[data-focus=vote-reject]').click();await shot(hostPage,'06-sealed-voting','.action-voting');
    for(const seat of seats)await post(seat,'vote',{choice:'reject'});await expect(hostPage.locator('.reveal-panel')).toBeVisible();await shot(hostPage,'07-round-verdict','.match-grid .result-summary');await shot(hostPage,'08-changed-clue-revealed','.match-grid .tamper-reveal');
    await hostPage.locator('.reveal-panel').screenshot({path:info.outputPath('07-full-round-reveal.png')});
    for(let round=1;round<3;round++){
      await post(host,'next');room=await store.load(host.code);rules.deliver(room);rules.advance(room);await store.save(room);
      const choice=room.lots[room.lot].genuine?'approve':'reject';for(const seat of seats)await post(seat,'vote',{choice});
    }
    await post(host,'next');await expect(hostPage.getByRole('heading',{name:'Truth Team wins!'})).toBeVisible();await hostPage.evaluate(()=>scrollTo(0,0));
    const trophy=hostPage.locator('.victory-cup img');await expect(trophy).toBeVisible();expect(await trophy.evaluate(n=>n.complete&&n.naturalWidth>0)).toBe(true);
    await shot(hostPage,'09-winning-teams','.finale-panel>h1');await hostPage.screenshot({path:info.outputPath('09-full-finale.png'),fullPage:true});
    await hostPage.setViewportSize({width:1100,height:900});await shot(hostPage,'10-desktop-finale','.finale-panel>h1');
    expect(errors).toEqual([]);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
