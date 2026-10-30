const {test,expect}=require('@playwright/test');
const C=require('../../lib/catalog');
const catalog={av:C.PREMIUM,bd:C.BORDER_PRICE,acc:C.ACC_PRICE,gift:C.GIFTS,uses:C.GIFT_USES,avatars:C.AVATARS};
async function checkDock(page) {
  await expect(page.locator('#pf-chip')).toHaveCount(0);
  const dock=page.locator('#pf-dock');
  await expect(dock).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  for(const label of ['Profile']) await expect(dock.getByRole('button',{name:label,exact:true})).toHaveCount(1);
  const geometry=await dock.locator('.pf-tool').evaluateAll(buttons=>buttons.map(b=>{
    const r=b.getBoundingClientRect(),a=b.firstElementChild.getBoundingClientRect(),s=getComputedStyle(b);
    return {x:r.x,right:r.right,width:r.width,height:r.height,dx:Math.abs(a.x+a.width/2-r.x-r.width/2),dy:Math.abs(a.y+a.height/2-r.y-r.height/2),bg:s.backgroundColor};
  }));
  const width=await page.evaluate(()=>innerWidth);
  for(const b of geometry) {expect(b.x).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(width);expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);expect(b.dx).toBeLessThan(1);expect(b.dy).toBeLessThan(1);expect(b.bg).toBe('rgba(17, 19, 38, 0.94)');}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
}
for(const width of [320,390,1100]) {
  test('Shared floating controls and original animal shop, '+width,async({page},testInfo)=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize({width,height:844});
    await page.goto('/hot-joker.html');
    await page.fill('#tk-name','Host');
    await page.getByRole('button',{name:'Create a Room'}).click();
    await expect(page.locator('.large-code')).toBeVisible();
    await expect(page.locator('#pf-dock .pf-tool')).toHaveCount(2);
    await expect(page.locator('#pf-dock').getByRole('button',{name:'Players',exact:true})).toHaveCount(0);
    await checkDock(page);
    await page.locator('#pf-dock').getByRole('button',{name:'Reactions',exact:true}).click();
    await expect(page.locator('.pf-tray svg').first()).toBeVisible();
    await page.locator('.pf-tray').getByRole('menuitem',{name:'laugh',exact:true}).click();
    await expect(page.locator('.pf-float')).toBeVisible();
    await page.locator('.pf-header-shop').click();
    await expect(page.locator('.pf-item .pf-av svg')).toHaveCount(C.AVATARS.length+Object.keys(C.PREMIUM).length);
    expect(await page.evaluate(()=>AvatarArt.keys.sort())).toEqual([...C.AVATARS,...Object.keys(C.PREMIUM)].sort());
    const ids=await page.locator('.pf-grid [id]').evaluateAll(ns=>ns.map(n=>n.id));
    expect(new Set(ids).size).toBe(ids.length);
    await page.screenshot({path:testInfo.outputPath('shop-'+width+'.png'),fullPage:true});
    const cat=page.locator('.pf-item').filter({has:page.getByText('Cat',{exact:true})});
    if(await cat.getByRole('button',{name:'Use',exact:true}).count()) await cat.getByRole('button',{name:'Use',exact:true}).click();
    await expect(cat.getByRole('button',{name:'In use',exact:true})).toBeDisabled();
    await page.locator('.pf-x').click();
    await page.locator('#pf-dock').getByRole('button',{name:'Profile',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'Your Profile'})).toContainText('Host');
    await page.locator('.pf-x').click();
    const code=(await page.locator('.large-code').textContent()).trim();
    const joined=await page.request.post('/api/hot-joker',{data:{action:'join',requestId:crypto.randomUUID(),code,name:'Friend'}});
    expect(joined.ok()).toBe(true);
    await expect(page.locator('#pf-dock .pf-tool')).toHaveCount(4);
    await expect(page.locator('#pf-dock').getByRole('button',{name:'Throw a Gift'})).toBeVisible();
    await checkDock(page);
    await expect(page.getByRole('button',{name:'Switch game',exact:true})).toBeVisible();
    await page.locator('#pf-dock').getByRole('button',{name:'Players',exact:true}).click();
    await expect(page.locator('.pf-tray[data-kind=players]')).toBeVisible();
    const friend=await joined.json();
    const left=await page.request.post('/api/hot-joker',{data:{action:'leave',requestId:crypto.randomUUID(),code,pid:friend.meId,tok:friend.tok,match:friend.match}});
    expect(left.ok()).toBe(true);
    await expect(page.locator('#pf-dock').getByRole('button',{name:'Players',exact:true})).toHaveCount(0);
    await expect(page.locator('.pf-tray[data-kind=players]')).toHaveCount(0);
    await expect(page.locator('#pf-dock .pf-tool')).toHaveCount(2);
    await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
    await page.screenshot({path:testInfo.outputPath('tools-'+width+'.png'),fullPage:true});
    expect(errors).toEqual([]);
  });
}
for(const width of [320,390]) {
  test('Profile edits only on request, privacy spacing and fitted accessories, '+width,async({page},testInfo)=>{
    await page.setViewportSize({width,height:844});
    const account={id:'ui-profile',nick:'Benny',provider:'google',pts:99584,earnedToday:0,eq:{av:'panda',bd:'gold',acc:'crown'},owned:{av:[],bd:['gold'],acc:['crown']},gifts:{}};
    await page.route('**/api/platform',route=>{
      const body=route.request().method()==='POST'?route.request().postDataJSON():null;
      if(body?.action==='nick')account.nick=body.nick;
      return route.fulfill({json:body?{account}:{config:{enabled:false},catalog,dailyCap:400,account}});
    });
    await page.goto('/hot-joker.html');
    await expect(page.locator('#pf-dock .pf-tool')).toHaveCount(1);
    await checkDock(page);
    await page.locator('#pf-dock').getByRole('button',{name:'Profile',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Your account'});
    await expect(dialog).toContainText('Benny');
    await expect(dialog.getByRole('textbox',{name:'Nickname'})).not.toBeVisible();
    await expect(dialog.getByRole('button',{name:'Save',exact:true})).not.toBeVisible();
    await dialog.getByRole('button',{name:'Edit Nickname'}).click();
    await dialog.getByRole('textbox',{name:'Nickname'}).fill('Benny Two');
    await dialog.getByRole('button',{name:'Save',exact:true}).click();
    await expect(dialog.locator('.pf-name')).toHaveText('Benny Two');
    await expect(dialog.getByRole('textbox',{name:'Nickname'})).not.toBeVisible();
    await dialog.getByRole('button',{name:'Edit Nickname'}).click();
    await dialog.getByRole('textbox',{name:'Nickname'}).fill('Discard Me');
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    await expect(dialog.locator('.pf-name')).toHaveText('Benny Two');
    await expect(dialog.getByRole('button',{name:'Customise Avatar'})).toBeVisible();
    await dialog.locator('.pf-privacy summary').click();
    await expect(dialog.getByRole('button',{name:'Download My Data'})).toBeVisible();
    const sizes=await dialog.locator('.pf-privacy').evaluate(e=>{
      const r=e.getBoundingClientRect(),s=e.querySelector('summary span').getBoundingClientRect(),buttons=[...e.querySelectorAll('.pf-privacy-actions button')].map(n=>n.getBoundingClientRect());
      return {center:Math.abs(s.x+s.width/2-r.x-r.width/2),gap:buttons[1].top-buttons[0].bottom};
    });
    expect(sizes.center).toBeLessThan(1);expect(sizes.gap).toBeGreaterThanOrEqual(10);
    const avatarFit=await page.locator('#pf-dock .pf-av').evaluate(e=>{const r=e.getBoundingClientRect(),s=e.querySelector('svg').getBoundingClientRect();return {dx:Math.abs(r.x+r.width/2-s.x-s.width/2),dy:Math.abs(r.y+r.height/2-s.y-s.height/2),inside:s.width<r.width};});
    expect(avatarFit.dx).toBeLessThan(1);expect(avatarFit.dy).toBeLessThan(1);expect(avatarFit.inside).toBe(true);
    await page.screenshot({path:testInfo.outputPath('profile.png'),fullPage:true});
  });
}

for(const game of ['bridge','hot-joker','grand-con','last-train']) {
  test(game+': header keeps sound, language and wallet shop together',async({page},testInfo)=>{
    await page.setViewportSize({width:320,height:844});
    const account={id:'header-profile',nick:'Benny',provider:'google',pts:99584,eq:{av:'panda'},owned:{av:[],bd:[],acc:[]},gifts:{}};
    await page.route('**/api/platform',route=>route.fulfill({json:{config:{enabled:false},catalog,dailyCap:400,account}}));
    await page.goto('/'+game+'.html');
    const shop=page.locator('.pf-header-shop');
    await expect(shop).toBeVisible();
    // Wait for account loading; native Last Train's home header has no game poll to redraw it.
    await expect(shop.locator('.pf-shop-wp')).toHaveText('100k');
    await expect(page.locator('#pf-dock').getByRole('button',{name:'Shop',exact:true})).toHaveCount(0);
    const bounds=await shop.evaluate(b=>{
      const r=b.getBoundingClientRect(),s=b.querySelector('.pf-art').getBoundingClientRect();
      return {right:r.right,dx:Math.abs(s.x+s.width/2-r.x-r.width/2),dy:Math.abs(s.y+s.height/2-r.y-r.height/2)};
    });
    expect(bounds.right).toBeLessThanOrEqual(320);expect(bounds.dx).toBeLessThan(1);expect(bounds.dy).toBeLessThan(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    await shop.click();
    await expect(page.getByRole('dialog',{name:'Shop',exact:true})).toBeVisible();
    await page.locator('.pf-x').click();
    await page.screenshot({path:testInfo.outputPath('header.png')});
  });
}

for(const [game,field,value,label] of [['bridge','deals',8,'8 deals'],['hot-joker','turnSeconds',60,'60 sec'],['grand-con','discussionSeconds',120,'120 sec']]) {
  test(game+': help/settings stay left and host settings save',async({page})=>{
    await page.setViewportSize({width:320,height:844});
    await page.goto('/'+game+'.html');
    const left=page.locator('.header-left');
    await expect(left.getByRole('button',{name:'How to Play',exact:true})).toBeVisible();
    await expect(left.getByRole('button',{name:'Settings',exact:true})).toBeVisible();
    const bounds=await page.locator('.header-controls').evaluate(e=>({left:e.querySelector('.header-left').getBoundingClientRect().right,right:e.querySelector('.header-tools').getBoundingClientRect().left}));
    expect(bounds.left).toBeLessThan(bounds.right);
    await left.getByRole('button',{name:'Settings',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Settings',exact:true});
    const effects=dialog.getByRole('checkbox',{name:'Sound effects',exact:true});
    await effects.uncheck();expect(await page.evaluate(()=>GameAudio.prefs().sfx)).toBe(false);
    await effects.check();expect(await page.evaluate(()=>GameAudio.prefs().sfx)).toBe(true);
    await page.locator('.pf-x').click();
    await page.fill(game==='grand-con'?'#gc-name':'#tk-name','Host');
    await page.getByRole('button',{name:/Create a (Room|room)/,exact:true}).click();
    await expect(page.locator('.large-code')).toBeVisible();
    await left.getByRole('button',{name:'Settings',exact:true}).click();
    const response=page.waitForResponse(r=>r.url().includes('/api/'+game) && r.request().method()==='POST');
    await dialog.getByRole('button',{name:label,exact:true}).click();
    const data=await (await response).json();expect(data.settings?.[field] ?? data[field]).toBe(value);
    await expect(dialog.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');
    await page.locator('.pf-x').click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  });
}

// UI-only account fixtures; real account ownership/recovery is covered by account-rejoin.js.
for(const game of ['bridge','hot-joker','grand-con','last-train','reckoning']) {
  test(game+': recovery controls are guest-only',async({page})=>{
    let account={id:'recovery-ui',nick:'Owner',provider:'google',pts:1000,earnedToday:0,eq:{av:'panda'},owned:{av:[],bd:[],acc:[]},gifts:{}};
    await page.route('**/api/platform',route=>{
      const action=route.request().method()==='POST'?route.request().postDataJSON().action:null;
      if(action==='logout')account=null;
      return route.fulfill({json:{config:{enabled:false},catalog,dailyCap:400,account}});
    });
    const api=game==='reckoning'?'game':game;
    await page.route('**/api/'+api+'*',async route=>{
      const response=await route.fetch(),data=await response.json();
      const wallet=data.social?.wallet || data.wallet || data.me?.wallet;
      if(wallet)wallet.account=!!account;
      await route.fulfill({response,json:data});
    });
    await page.goto('/'+game+'.html');
    await expect(page.locator('body')).toHaveClass(/pf-signed-in/);
    const entrance=page.locator('[data-guest-only=landing]');
    await expect(entrance).toHaveCount(1);await expect(entrance).toBeHidden();
    await page.fill(game==='reckoning'?'#player-name':game==='last-train'?'#lt-name':game==='grand-con'?'#gc-name':'#tk-name','Owner');
    await page.getByRole('button',{name:/^Create (a Room|a room|A Room|a new room)$/}).click();
    await expect(page.locator('body')).toHaveClass(/pf-account-seat/);
    if(game==='last-train')await page.getByRole('button',{name:'Invite ▾',exact:true}).click();
    if(game==='reckoning')await page.locator('#setBtn').click();
    const recovery=page.locator('[data-guest-only=room]');
    await expect(recovery).toHaveCount(1);await expect(recovery).toBeHidden();
    if(game==='reckoning')await page.keyboard.press('Escape');
    if(game==='last-train')await page.keyboard.press('Escape');
    // Signing out brings guest code controls back without a page reload.
    await page.locator('#pf-dock').getByRole('button',{name:'Profile',exact:true}).click();
    await page.getByRole('button',{name:'Sign out',exact:true}).click();
    await page.getByRole('dialog',{name:'Sign out?',exact:true}).getByRole('button',{name:'Sign out',exact:true}).click();
    await expect(page.locator('body')).not.toHaveClass(/pf-signed-in/);
    if(game==='last-train')await page.getByRole('button',{name:'Invite ▾',exact:true}).click();
    if(game==='reckoning')await page.locator('#setBtn').click();
    if(['bridge','hot-joker','grand-con'].includes(game))await page.locator('.pf-room-invite').click();
    await expect(page.locator('[data-guest-only=room]')).toBeVisible();
  });
}
