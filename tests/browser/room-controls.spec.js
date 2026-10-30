const {test,expect}=require('@playwright/test');
for(const game of ['bridge','hot-joker','grand-con']) {
  test(game+': Row room code and Invite actions work on a small phone',async({page},testInfo)=>{
    await page.setViewportSize({width:320,height:844});
    await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.copiedInvite=value;}}}));
    await page.goto('/'+game+'.html');
    await page.fill(game==='grand-con'?'#gc-name':'#tk-name','Host');
    await page.getByRole('button',{name:/^Create a (Room|room)$/}).click();
    const room=page.locator('.pf-room-bar');
    await expect(room).toHaveClass(/pf-room-waiting/);
    const code=(await room.locator('.room-code').textContent()).trim();
    const invite=room.getByRole('button',{name:'Invite',exact:true});
    await invite.click();
    await room.getByRole('menuitem',{name:'Copy Room Code',exact:true}).click();
    expect(await page.evaluate(()=>copiedInvite)).toBe(code);
    await expect(invite).toHaveAttribute('aria-expanded','false');
    await invite.click();
    await room.getByRole('menuitem',{name:'Copy Invite Link',exact:true}).click();
    expect(await page.evaluate(()=>copiedInvite)).toBe('http://127.0.0.1:3000/'+game+'.html?room='+code);
    await invite.click();
    await room.getByRole('menuitem',{name:'QR Code',exact:true}).click();
    await expect(page.locator('.pf-room-qr svg')).toBeVisible();
    await expect(page.locator('.pf-qr-code')).toHaveText(code);
    await page.locator('.pf-x').click();
    await invite.click();
    await room.getByRole('menuitem',{name:'Rejoin Code',exact:true}).click();
    await expect(page.getByRole('textbox',{name:/Rejoin [Cc]ode/})).not.toBeEmpty();
    await page.keyboard.press('Escape');
    await invite.click();await page.keyboard.press('Escape');
    await expect(invite).toHaveAttribute('aria-expanded','false');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:testInfo.outputPath('room-phone.png')});
    await page.setViewportSize({width:1100,height:844});
    await page.screenshot({path:testInfo.outputPath('room-desktop.png')});
    await room.getByRole('button',{name:'Leave Room',exact:true}).click();
    await page.getByRole('button',{name:'Stay',exact:true}).click();
    await expect(room).toBeVisible();
  });
}

test('Shared waiting room uses Row’s actual room-code, panel and button styles',async({browser})=>{
  const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage();
  try {
    for(const width of [320,390,1100]) {
      await page.setViewportSize({width,height:844});
      const styles=async selectors=>{
        await page.evaluate(()=>document.fonts.ready);
        return page.evaluate(selectors=>Object.fromEntries(Object.entries(selectors).map(([key,selector])=>{
          const s=getComputedStyle(document.querySelector(selector));
          const props=key==='panel'?['padding','borderRadius','backgroundColor','borderTopColor','boxShadow','rowGap','fontFamily']:key==='code'?['fontSize','fontWeight','letterSpacing','backgroundImage','lineHeight','paddingLeft']:key==='label'?['fontSize','letterSpacing','fontWeight','opacity','color']:['fontFamily','fontSize','fontWeight','letterSpacing','padding','borderRadius','borderTopColor','backgroundImage','backgroundColor','color'];
          return [key,Object.fromEntries(props.map(p=>[p,s[p]]))];
        })),selectors);
      };
      await page.goto('/reckoning.html');
      if(await page.locator('#player-name').count()) {await page.fill('#player-name','Style');await page.getByRole('button',{name:'Create a new room',exact:true}).click();}
      await expect(page.locator('.waitroom')).toBeVisible();
      const reference=await styles({panel:'.waitroom',code:'.bigcode',label:'.waitroom>.kicker',invite:'.waitact .invwrap>button',players:'.waitact>button'});
      for(const game of ['bridge','hot-joker','grand-con']) {
        await page.goto('/'+game+'.html');
        const name=page.locator(game==='grand-con'?'#gc-name':'#tk-name');
        if(await name.count()){await name.fill('Style');await page.getByRole('button',{name:/^Create a (Room|room)$/}).click();}
        await expect(page.locator('.pf-room-waiting')).toBeVisible();
        const actual=await styles({panel:'.pf-room-waiting',code:'.pf-lobby-code',label:'.pf-room-label',invite:'.pf-room-invite',players:'.pf-room-players'});
        expect(actual,game+' at '+width+'px').toEqual(reference);
        // Last Laugh seats everyone in the circle it is played in, which players can rearrange by dragging.
        await expect(page.locator(game==='hot-joker'?'.pf-room-waiting .seat-circle':'.pf-room-waiting .pf-room-seats')).toBeVisible();
        await expect(page.locator('.waiting-card')).toHaveCount(0);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
      }
    }
  } finally {await context.close();}
});
