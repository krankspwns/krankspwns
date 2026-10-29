const {test,expect}=require('@playwright/test');
for(const width of [320,390,1100])test('catalogue sound and language work at '+width,async({page},testInfo)=>{
  await page.setViewportSize({width,height:844});await page.goto('/?games=1');
  const header=page.locator('.arcade-header'),sound=header.locator('.pf-dd').first(),language=header.locator('.pf-language');
  await expect(sound.getByRole('button',{name:/Sound:/})).toBeVisible();
  await expect(language.getByRole('button',{name:'Language',exact:true})).toBeVisible();
  for(const control of [sound,language]){
    const bounds=await control.locator('.pf-ddbtn').boundingBox();expect(bounds.height).toBeGreaterThanOrEqual(44);expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
  }
  await sound.locator('.pf-ddbtn').click();await language.locator('.pf-ddbtn').click();await expect(sound).not.toHaveClass(/open/);
  await sound.locator('.pf-ddbtn').click();await expect(language).not.toHaveClass(/open/);
  await sound.getByRole('menuitemradio',{name:'Sound off',exact:true}).click();
  expect(await page.evaluate(()=>GameAudio.prefs())).toEqual({sfx:false,music:false});
  await language.locator('.pf-ddbtn').click();await language.getByRole('menuitemradio',{name:'简体 · 简体中文',exact:true}).click();
  await expect(page.locator('h1')).toContainText('选一款游戏。');
  await expect(page.locator('.reckoning-card h2')).toHaveText('王冠对决');await expect(page.locator('.joker-card h2')).toHaveText('笑到最后');
  await page.reload();await expect(page.locator('h1')).toContainText('选一款游戏。');
  expect(await page.evaluate(()=>GameAudio.prefs().sfx)).toBe(false);
  await language.locator('.pf-ddbtn').click();await language.getByRole('menuitemradio',{name:'繁體 · 繁體中文',exact:true}).click();
  await expect(page.locator('.reckoning-card h2')).toHaveText('王冠對決');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:testInfo.outputPath('header.png')});
  await language.locator('.pf-ddbtn').click();await language.getByRole('menuitemradio',{name:'EN · English',exact:true}).click();
  await expect(page.locator('h1')).toContainText('Pick your game.');
  await page.getByRole('link',{name:/Last Laugh/}).click();
  expect(await page.evaluate(()=>GameAudio.prefs().sfx)).toBe(false);
  await expect(page.locator('html')).toHaveAttribute('lang','en');
});
