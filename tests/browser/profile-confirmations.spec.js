const {test,expect}=require('@playwright/test');
const C=require('../../lib/catalog');
const catalog={av:C.PREMIUM,bd:C.BORDER_PRICE,acc:C.ACC_PRICE,gift:C.GIFTS,uses:C.GIFT_USES,avatars:C.AVATARS};
const account={id:'confirm-profile',nick:'Benny',provider:'google',pts:99584,earnedToday:0,eq:{av:'panda',bd:'gold',acc:'crown'},owned:{av:[],bd:['gold'],acc:['crown']},gifts:{}};
async function fixture(page,handle=()=>null) {
  await page.route('**/api/platform',async route=>{
    const body=route.request().method()==='POST'?route.request().postDataJSON():null;
    const failure=body && await handle(body);
    await route.fulfill(failure || {json:body?{ok:true,account}:{config:{enabled:false},catalog,dailyCap:400,account}});
  });
  await page.goto('/hot-joker.html');
  await expect(page.locator('body')).toHaveClass(/pf-signed-in/);
}
const profile=page=>page.getByRole('dialog',{name:'Your account',exact:true});
const open=page=>page.locator('#pf-dock').getByRole('button',{name:'Profile',exact:true}).click();
for(const [action,label,title] of [['logout','Sign out','Sign out?'],['logoutAll','Sign out everywhere','Sign out everywhere?'],['delete','Delete My Account','Delete your account?']]) {
  test(label+': cancel does nothing, explicit confirmation sends once',async({page},testInfo)=>{
    await page.setViewportSize({width:390,height:700});
    const requests=[],browserDialogs=[];page.on('dialog',async d=>{browserDialogs.push(d.type());await d.dismiss();});
    await fixture(page,body=>{requests.push(body);});
    await open(page);
    if(action==='delete')await profile(page).locator('.pf-privacy summary').click();
    await profile(page).getByRole('button',{name:label,exact:true}).click();
    const confirm=page.getByRole('dialog',{name:title,exact:true});
    await expect(confirm).toBeVisible();expect(requests).toHaveLength(0);
    await page.screenshot({path:testInfo.outputPath('confirmation.png')});
    await confirm.getByRole('button',{name:'Cancel',exact:true}).click();
    await expect(profile(page)).toBeVisible();expect(requests).toHaveLength(0);
    await profile(page).getByRole('button',{name:label,exact:true}).click();
    await page.keyboard.press('Escape');
    await expect(profile(page)).toBeVisible();expect(requests).toHaveLength(0);
    await profile(page).getByRole('button',{name:label,exact:true}).click();
    await confirm.getByRole('button',{name:'Close',exact:true}).click();
    await expect(profile(page)).toBeVisible();expect(requests).toHaveLength(0);
    await profile(page).getByRole('button',{name:label,exact:true}).click();
    const submit=confirm.getByRole('button',{name:label,exact:true});
    if(action==='delete'){
      await expect(submit).toBeDisabled();
      await confirm.getByRole('textbox').fill('delete');await expect(submit).toBeDisabled();
      await confirm.getByRole('textbox').fill('DELETE');await expect(submit).toBeEnabled();
    }
    // Repeated submit events while the request is in flight must not repeat the action.
    await confirm.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
    await expect(page.locator('.pf-ov')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveClass(/pf-signed-in/);
    expect(requests).toHaveLength(1);expect(requests[0].action).toBe(action);
    if(action==='delete')expect(requests[0].confirm).toBe('DELETE');
    expect(browserDialogs).toEqual([]);
  });
}

test('A failed account action keeps the confirmation open and allows retry',async({page})=>{
  let count=0;
  await fixture(page,body=>{if(body.action==='logoutAll' && ++count===1)return {status:503,json:{error:'Try again shortly.'}};});
  await open(page);await profile(page).getByRole('button',{name:'Sign out everywhere',exact:true}).click();
  const confirm=page.getByRole('dialog',{name:'Sign out everywhere?',exact:true});
  await confirm.getByRole('button',{name:'Sign out everywhere',exact:true}).click();
  await expect(confirm.getByRole('alert')).toHaveText('Try again shortly.');
  await expect(page.locator('body')).toHaveClass(/pf-signed-in/);
  await confirm.getByRole('button',{name:'Sign out everywhere',exact:true}).click();
  await expect(page.locator('.pf-ov')).toHaveCount(0);expect(count).toBe(2);
});

for(const width of [320,390])test('Profile scroll stays in the popup and restores the page, '+width,async({page})=>{
  await page.setViewportSize({width,height:600});await fixture(page);
  await page.evaluate(()=>scrollTo(0,450));const before=await page.evaluate(()=>scrollY);expect(before).toBeGreaterThan(100);
  const background=page.locator('.tk-intro h1');const beforeBounds=await background.boundingBox();
  await open(page);const box=profile(page);await box.locator('.pf-privacy summary').click();
  await expect(page.locator('body')).toHaveCSS('position','fixed');
  await expect(box).toHaveCSS('scrollbar-width','none');await expect(box).toHaveCSS('overscroll-behavior-y','contain');
  expect(await box.evaluate(e=>getComputedStyle(e,'::-webkit-scrollbar').display)).toBe('none');
  await box.evaluate(e=>e.scrollTop=0);
  const bounds=await box.boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.wheel(0,450);
  await expect.poll(()=>box.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
  await box.evaluate(e=>e.scrollTop=e.scrollHeight);await page.mouse.wheel(0,900);
  expect((await background.boundingBox()).y).toBeCloseTo(beforeBounds.y,0);
  await page.mouse.move(2,2);await page.mouse.wheel(0,900);
  expect((await background.boundingBox()).y).toBeCloseTo(beforeBounds.y,0);
  // Tab wraps to a control in the modal instead of reaching the background.
  await box.getByRole('button',{name:'Sign out everywhere',exact:true}).focus();await page.keyboard.press('Tab');
  await expect(box.getByRole('button',{name:'Close',exact:true})).toBeFocused();
  await box.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.locator('body')).not.toHaveClass(/pf-lock/);
  expect(await page.evaluate(()=>scrollY)).toBeCloseTo(before,0);
  expect(await page.evaluate(()=>document.body.style.position)).toBe('');
});
