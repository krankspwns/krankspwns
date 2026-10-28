const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),vm=require('node:vm');
const C=require('../../lib/catalog');
const source=fs.readFileSync(require.resolve('../../src/avatars.js'),'utf8');
const canonical=vm.runInNewContext(source.slice(source.indexOf('const GIFT_SVG ='),source.indexOf('const giftEl ='))+';GIFT_SVG;');
for(const game of ['bridge','hot-joker','grand-con'])test(game+': no room controls before joining or after seat expiry',async({page})=>{
  const dock=page.locator('#pf-dock');let expired=false;
  await page.route('**/api/'+game+'?*',async route=>expired?route.fulfill({status:401,json:{error:'Seat expired.'}}):route.continue());
  await page.goto('/'+game+'.html');
  for(const label of ['Players','Reactions','Throw a Gift'])await expect(dock.getByRole('button',{name:label,exact:true})).toHaveCount(0);
  const name=page.locator(game==='grand-con'?'#gc-name':'#tk-name');
  await name.fill('Host');await page.getByRole('button',{name:/^Create a (Room|room)$/}).click();
  await expect(dock.getByRole('button',{name:'Reactions',exact:true})).toBeVisible();
  expired=true;await expect(name).toBeVisible();
  for(const label of ['Players','Reactions','Throw a Gift'])await expect(dock.getByRole('button',{name:label,exact:true})).toHaveCount(0);
  expired=false;await name.fill('Return');await page.getByRole('button',{name:/^Create a (Room|room)$/}).click();
  await expect(dock.getByRole('button',{name:'Reactions',exact:true})).toBeVisible();
});

test('Gift shop, gift tray and thrown gift use Row’s SVG artwork',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/hot-joker.html');await page.fill('#tk-name','Host');await page.getByRole('button',{name:'Create a Room',exact:true}).click();
  const code=await page.locator('.large-code').textContent();
  const joined=await page.request.post('/api/hot-joker',{data:{action:'join',requestId:crypto.randomUUID(),code,name:'Friend'}});expect(joined.ok()).toBe(true);
  const dock=page.locator('#pf-dock');await expect(dock.getByRole('button',{name:'Throw a Gift',exact:true})).toBeVisible();
  await page.locator('.pf-header-shop').click();await page.getByRole('tab',{name:'Gifts',exact:true}).click();
  await expect(page.locator('.pf-grid .pf-gift svg')).toHaveCount(Object.keys(C.GIFTS).length);
  const comparison=await page.evaluate(reference=>Object.keys(reference).every(k=>{
    const expected=document.createElement('div');expected.innerHTML='<svg>'+reference[k]+'</svg>';
    return AvatarArt.gift(k).querySelector('svg').innerHTML.replace(/-shared-av-\d+/g,'')===expected.firstChild.innerHTML;
  }),Object.fromEntries(Object.keys(C.GIFTS).map(k=>[k,canonical[k]])));
  expect(comparison).toBe(true);
  const ids=await page.locator('.pf-grid svg [id]').evaluateAll(ns=>ns.map(n=>n.id));expect(new Set(ids).size).toBe(ids.length);
  await page.screenshot({path:testInfo.outputPath('row-gift-shop.png')});
  await page.locator('.pf-item').filter({has:page.getByText('Tomato',{exact:true})}).getByRole('button',{name:'Buy · 10',exact:true}).click();
  await page.locator('.pf-x').click();await dock.getByRole('button',{name:'Throw a Gift',exact:true}).click();
  const tomato=page.getByRole('menuitem',{name:'Tomato',exact:true});await expect(tomato.locator('svg')).toBeVisible();
  await tomato.click();
  const sent=page.waitForResponse(r=>r.url().endsWith('/api/hot-joker') && r.request().method()==='POST' && r.request().postDataJSON().action==='throw');
  await page.locator('.pf-tray').getByRole('button',{name:'Friend',exact:true}).click();
  await expect(page.locator('.pf-fly .pf-gift svg')).toBeAttached();
  expect((await (await sent).json()).social.wallet.gifts.tomato).toBe(C.GIFT_USES-1);
});
