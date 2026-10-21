const {test,expect}=require('@playwright/test');
test('game hub selects both games and keeps legacy invitations working',async({page})=>{
  await page.goto('/?games=1');
  await expect(page.getByRole('heading',{name:'Bring your people. Pick your game.'})).toBeVisible();
  await page.getByRole('link',{name:/Row of Reckoning/}).click();
  await expect(page.getByRole('button',{name:'Create a new room',exact:true})).toBeVisible();
  await page.goto('/?room=ABCD');
  await expect(page).toHaveURL(/reckoning\.html/);
  await expect(page.getByRole('button',{name:'Join room ABCD'})).toBeVisible();
  await page.goto('/?games=1');await page.getByRole('link',{name:/The Grand Con/}).click();
  await expect(page.getByRole('heading',{name:'Let the con begin.'})).toBeVisible();
});
test('four phones play all five auctions and reveal their syndicates',async({browser},testInfo)=>{
  const contexts=[],pages=[],errors=[];
  try{
    for(let i=0;i<4;i++){
      const context=await browser.newContext({viewport:{width:i===0?1100:390,height:844},reducedMotion:'reduce'});contexts.push(context);
      const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));pages.push(p);
      await p.goto('/grand-con.html');await p.getByLabel('Your name',{exact:true}).fill(i===0?'Host':'Guest '+i);
    }
    const host=pages[0];await host.getByRole('button',{name:'Create an auction',exact:true}).click();
    const code=await host.locator('.room-code').textContent();
    for(const p of pages.slice(1)){await p.getByLabel('Room code',{exact:true}).fill(code);await p.getByRole('button',{name:'Join auction',exact:true}).click();}
    await expect(host.locator('.seat')).toHaveCount(4);
    await host.getByRole('button',{name:'BEGIN FIVE AUCTIONS'}).click();
    for(let lot=1;lot<=5;lot++){
      await expect(host.getByRole('heading',{name:'What’s your story?'})).toBeVisible();
      await host.getByRole('button',{name:'OPEN SECRET ACTIONS'}).click();
      await Promise.all(pages.map(async(p,i)=>{
        await expect(p.getByRole('heading',{name:'Call in a favor.'})).toBeVisible();
        if(lot===1&&i===0){await p.locator('.power-card').filter({hasText:'Investigate'}).click();await p.getByRole('button',{name:'Lock Investigate',exact:true}).click();}
        else await p.getByRole('button',{name:'Lock pass',exact:true}).click();
      }));
      await Promise.all(pages.map(async(p,i)=>{
        await expect(p.getByRole('heading',{name:'Name your price.'})).toBeVisible();
        if(lot===1){await expect(p.locator('.dossier-content')).toHaveCount(0);await p.getByRole('button',{name:'Open dossier'}).click();if(i===0)await expect(p.locator('.verified')).toBeVisible();else await expect(p.locator('.verified')).toHaveCount(0);}
        await p.getByLabel(/Your bid/).fill(i===0?'3':'0');await p.getByRole('button',{name:'Seal bid & appraisal'}).click();
      }));
      await expect(host.getByText('THE HAMMER HAS FALLEN',{exact:true})).toBeVisible();
      await expect(host.locator('.bid-row')).toHaveCount(4);
      if(lot===1){
        await pages[1].reload();await expect(pages[1].getByText('THE HAMMER HAS FALLEN',{exact:true})).toBeVisible();
        expect(await pages[1].evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await pages[1].screenshot({path:testInfo.outputPath('grand-con-mobile.png'),fullPage:true});
      }
      await host.getByRole('button',{name:lot===5?'REVEAL THE SYNDICATES':'OPEN LOT '+(lot+1)}).click();
    }
    await expect(host.getByRole('heading',{name:/wins\.|perfect deadlock/})).toBeVisible();
    await expect(host.locator('.team-score')).toHaveCount(2);
    await expect(host.locator('.final-row')).toHaveCount(4);
    await pages[2].goto('/');await expect(pages[2]).toHaveURL(/grand-con\.html/);
    await expect(pages[2].locator('.final-row')).toHaveCount(4);
    await host.goto('/?games=1');await expect(host.getByRole('link',{name:/The Grand Con/})).toBeVisible();
    await host.screenshot({path:testInfo.outputPath('game-hub.png'),fullPage:true});
    expect(errors).toEqual([]);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
test('Grand Con rules open and close with the keyboard on small screens',async({page})=>{
  await page.setViewportSize({width:320,height:650});await page.goto('/grand-con.html');
  await page.getByRole('button',{name:'How to play'}).click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('saved seats resume the last selected game while All games remains reachable',async({page})=>{
  await page.goto('/?games=1');
  const codes=await page.evaluate(async()=>{
    const create=async(url,name)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',name,requestId:crypto.randomUUID()})});return r.json();};
    const row=await create('/api/game','Row host'),con=await create('/api/grand-con','Con host');
    localStorage.setItem('sct',JSON.stringify({code:row.code,pid:row.meId,tok:row.tok}));
    localStorage.setItem('gc-seat',JSON.stringify({code:con.code,pid:con.meId,tok:con.tok}));
    localStorage.setItem('arcade-last-game','grand-con');return {row:row.code,con:con.code};
  });
  await page.goto('/');await expect(page).toHaveURL(/grand-con\.html/);await expect(page.locator('.room-code')).toHaveText(codes.con);
  await page.getByRole('link',{name:'← All games'}).click();await page.getByRole('link',{name:/Row of Reckoning/}).click();
  await expect(page.locator('.bigcode')).toHaveText(codes.row);
  await page.goto('/');await expect(page).toHaveURL(/reckoning\.html/);await expect(page.locator('.bigcode')).toHaveText(codes.row);
});
