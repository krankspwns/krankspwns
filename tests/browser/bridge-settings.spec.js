const {test,expect}=require('@playwright/test');
for(const width of [320,1100])test('Hidden Alliance uses circular 2/4/6/8 deal choices, '+width,async({page},testInfo)=>{
  await page.setViewportSize({width,height:844});await page.goto('/?games=1');
  await expect(page.getByRole('heading',{name:'Hidden Alliance',exact:true})).toBeVisible();
  await page.goto('/bridge.html');await expect(page).toHaveTitle('Hidden Alliance · The Game Room');
  await page.fill('#tk-name','Host');await page.getByRole('button',{name:'Create a Room',exact:true}).click();
  const choices=page.locator('.pf-room-waiting .pf-deal-options');
  await expect(choices.locator('button')).toHaveText(['2','4','6','8']);
  const sizes=await choices.locator('button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return {width:r.width,height:r.height,radius:getComputedStyle(b).borderRadius};}));
  for(const s of sizes){expect(s.width).toBe(48);expect(s.height).toBe(48);expect(s.radius).toBe('50%');}
  await choices.getByRole('button',{name:'6 deals',exact:true}).click();
  await expect(choices.getByRole('button',{name:'6 deals',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'Settings',exact:true});
  await expect(settings.locator('.pf-deal-options button')).toHaveText(['2','4','6','8']);
  await expect(settings.getByRole('button',{name:'6 deals',exact:true})).toHaveAttribute('aria-pressed','true');
  await settings.getByRole('button',{name:'8 deals',exact:true}).click();
  await expect(settings.getByRole('button',{name:'8 deals',exact:true})).toHaveAttribute('aria-pressed','true');
  await settings.getByRole('button',{name:'Close',exact:true}).click();
  await expect(choices.getByRole('button',{name:'8 deals',exact:true})).toHaveAttribute('aria-pressed','true');
  await choices.getByRole('button',{name:'6 deals',exact:true}).click();await expect(choices.getByRole('button',{name:'6 deals',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:testInfo.outputPath('deal-circles.png')});
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'Add a bot',exact:true}).click();
  const response=page.waitForResponse(r=>r.url().endsWith('/api/bridge') && r.request().method()==='POST' && r.request().postDataJSON().action==='start');
  await page.getByRole('button',{name:'START GAME',exact:true}).click();
  const data=await (await response).json();expect(data.deals).toBe(6);expect(data.phase).toBe('bidding');
});
