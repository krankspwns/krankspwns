const {test,expect}=require('@playwright/test');
const C=require('../../lib/catalog');
const catalog={av:C.PREMIUM,bd:C.BORDER_PRICE,acc:C.ACC_PRICE,gift:C.GIFTS,uses:C.GIFT_USES,avatars:C.AVATARS};
async function checkDock(page) {
  await expect(page.locator('#pf-chip')).toHaveCount(0);
  const dock=page.locator('#pf-dock');
  await expect(dock).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  for(const label of ['Shop','Profile']) await expect(dock.getByRole('button',{name:label,exact:true})).toHaveCount(1);
  const geometry=await dock.locator('button').evaluateAll(buttons=>buttons.map(b=>{
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
    await expect(page.locator('#pf-dock button')).toHaveCount(4);
    await checkDock(page);
    await page.locator('#pf-dock').getByRole('button',{name:'Reactions',exact:true}).click();
    await expect(page.locator('.pf-tray svg').first()).toBeVisible();
    await page.locator('.pf-tray').getByRole('menuitem',{name:'laugh',exact:true}).click();
    await expect(page.locator('.pf-float')).toBeVisible();
    await page.locator('#pf-dock').getByRole('button',{name:'Shop',exact:true}).click();
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
    await expect(page.locator('#pf-dock button')).toHaveCount(5);
    await expect(page.locator('#pf-dock').getByRole('button',{name:'Throw a Gift'})).toBeVisible();
    await checkDock(page);
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
    await expect(page.locator('#pf-dock button')).toHaveCount(2);
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
