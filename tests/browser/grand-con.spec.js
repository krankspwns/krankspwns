const {test,expect}=require('@playwright/test');
test('game hub selects both games and keeps legacy invitations working',async({page})=>{
  await page.goto('/?games=1');
  await expect(page.getByRole('heading',{name:'Bring your people. Pick your game.'})).toBeVisible();
  await page.getByRole('link',{name:/Crown Clash/}).click();
  await expect(page.getByRole('button',{name:'Create a new room',exact:true})).toBeVisible();
  await page.goto('/?room=ABCD');
  await expect(page).toHaveURL(/reckoning\.html/);
  await expect(page.getByRole('button',{name:'Join room ABCD'})).toBeVisible();
  await page.goto('/?games=1');await page.getByRole('link',{name:/The Grand Con/}).click();
  await expect(page.getByRole('heading',{name:'Ready to play?'})).toBeVisible();
});
test('six phones forge evidence, vote through a full match, and reveal teams',async({browser},testInfo)=>{
  test.setTimeout(300000);
  const contexts=[],pages=[],errors=[];
  try{
    for(let i=0;i<6;i++){
      const context=await browser.newContext({viewport:{width:i===0?1100:390,height:844},reducedMotion:'reduce'});contexts.push(context);
      const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));pages.push(p);
      await p.goto('/grand-con.html');await p.getByLabel('Your name',{exact:true}).fill(i===0?'Host':'Guest '+i);
    }
    const host=pages[0];await host.getByRole('button',{name:'Create a room',exact:true}).click();
    const code=await host.locator('.room-code').textContent();
    for(const p of pages.slice(1)){await p.getByLabel('Room code',{exact:true}).fill(code);await p.getByRole('button',{name:'Join room',exact:true}).click();}
    await expect(host.locator('.seat')).toHaveCount(6);
    await host.getByRole('button',{name:'START GAME'}).click();
    const read=p=>p.evaluate(async()=>{
      const seat=JSON.parse(localStorage.getItem('gc-seat'));
      return (await fetch('/api/grand-con?code='+seat.code+'&pid='+seat.pid,{headers:{'x-tok':seat.tok}})).json();
    });
    for(let deal=1;deal<=5;deal++){
      await expect(host.getByRole('heading',{name:'One clue is being changed.'})).toBeVisible();
      await expect(host.locator('.phase-rail [aria-current="step"]')).toHaveText('Ready');
      await expect(host.locator('.identity-card')).toHaveCount(0);
      const states=await Promise.all(pages.map(read)),ring=states.find(s=>s.me.ring).me.ring;
      const editor=pages[states.findIndex(s=>s.meId===ring.forgerId)];
      await Promise.all(pages.map(async p=>{await expect(p.getByRole('heading',{name:'One clue is being changed.'})).toBeVisible();await p.getByRole('button',{name:'Open my card',exact:true}).click();}));
      await expect(editor.getByRole('heading',{name:'Pick a clue to change'})).toBeVisible();
      await editor.locator('.forgery-option').first().click();
      if(deal===1)await editor.screenshot({path:testInfo.outputPath('grand-con-ring-editor.png')});
      await editor.getByRole('button',{name:'Confirm clue change',exact:true}).click();
      await expect(host.getByRole('heading',{name:'Talk about your clues.'})).toBeVisible({timeout:35000});
      await Promise.all(pages.map(async(p,i)=>{
        await expect(p.locator('.clue')).toBeVisible();
        if(states[i].me.team==='house')await expect(p.locator('.ring-brief')).toHaveCount(0);
      }));
      await Promise.all(pages.map(p=>p.getByRole('button',{name:'Hide my card',exact:true}).click()));
      if(deal===1){
        await pages[1].getByRole('button',{name:'More time · +30 seconds',exact:true}).click();
        await expect(host.getByRole('button',{name:'Extra time added'})).toBeDisabled();
        await expect(host.locator('.phase-rail [aria-current="step"]')).toHaveText('Talk');
        await pages[1].screenshot({path:testInfo.outputPath('grand-con-discussion-mobile.png'),fullPage:true});
        expect(await pages[1].evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await pages[1].setViewportSize({width:320,height:650});
        expect(await pages[1].evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await pages[1].setViewportSize({width:390,height:844});
      }
      await host.getByRole('button',{name:'START VOTE'}).click();
      // Alternate point winners so the complete five-deal flow is exercised deterministically.
      const choice=(ring.genuine===(deal%2===1))?'REAL':'FAKE';
      await Promise.all(pages.map(async(p,i)=>{
        await expect(p.getByRole('heading',{name:'Is this item real or fake?'})).toBeVisible();
        const vote=p.getByRole('button',{name:new RegExp('^'+choice)});
        await vote.click();await expect(vote).toBeFocused();
        if(deal===1&&i===1){await p.reload();await expect(p.getByRole('heading',{name:'Is this item real or fake?'})).toBeVisible();await p.getByRole('button',{name:new RegExp('^'+choice)}).click();}
        await p.getByRole('button',{name:'Confirm '+choice,exact:true}).click();
      }));
      await expect(host.locator('.match-grid .tamper-reveal')).toBeVisible();
      await expect(host.locator('.match-grid .vote-row')).toHaveCount(6);
      await expect(host.locator('.score-pips .filled')).toHaveCount(deal);
      await expect(host.locator('.phase-rail [aria-current="step"]')).toHaveText('Answer');
      await expect(host.getByRole('button',{name:deal===5?'SHOW TEAMS':'NEXT ROUND '+(deal+1)})).toBeVisible();
      if(deal===1){
        await pages[1].reload();await expect(pages[1].locator('.match-grid .tamper-reveal')).toBeVisible();
        await pages[1].locator('.match-grid .evidence-audit summary').click();
        await expect(pages[1].locator('.match-grid .audit-document')).toHaveCount(6);
        await pages[1].screenshot({path:testInfo.outputPath('grand-con-reveal-mobile.png'),fullPage:true});
      }
      await host.getByRole('button',{name:deal===5?'SHOW TEAMS':'NEXT ROUND '+(deal+1)}).click();
    }
    await expect(host.getByRole('heading',{name:'Truth Team wins!'})).toBeVisible();
    await expect(host.locator('.team-score')).toHaveCount(2);await expect(host.locator('.team-player')).toHaveCount(6);
    await pages[2].goto('/');await expect(pages[2]).toHaveURL(/grand-con\.html/);await expect(pages[2].locator('.team-player')).toHaveCount(6);
    await host.screenshot({path:testInfo.outputPath('grand-con-finale.png'),fullPage:true});
    await host.getByRole('button',{name:'PLAY AGAIN'}).click();await expect(host.getByRole('heading',{name:'One clue is being changed.'})).toBeVisible();
    await host.goto('/?games=1');await expect(host.getByRole('link',{name:/The Grand Con/})).toBeVisible();
    expect(errors).toEqual([]);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
test('Grand Con rules open and close with the keyboard on small screens',async({page})=>{
  await page.setViewportSize({width:320,height:650});await page.goto('/grand-con.html');
  await page.getByRole('button',{name:'How to play'}).click();
  const rules=page.getByRole('dialog');await expect(rules).toBeVisible();
  await expect(rules.getByRole('heading',{name:'Read. Talk. Vote.'})).toBeInViewport();
  await expect(rules.getByText('Help the group pick the correct answer.',{exact:true})).toBeInViewport();
  await expect(rules.getByText('You know the answer. Make the group pick the wrong one.',{exact:true})).toBeInViewport();
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
  await page.getByRole('link',{name:'← All games'}).click();await page.getByRole('link',{name:/Crown Clash/}).click();
  await expect(page.locator('.bigcode')).toHaveText(codes.row);
  await page.goto('/');await expect(page).toHaveURL(/reckoning\.html/);await expect(page.locator('.bigcode')).toHaveText(codes.row);
});
