const {test,expect}=require('@playwright/test');
for(const game of ['bridge','hot-joker','grand-con']) {
  test(game+': Chinese choices translate rules and survive reload without altering drafts',async({page},testInfo)=>{
    await page.setViewportSize({width:320,height:844});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/'+game+'.html');
    const name=page.locator(game==='grand-con'?'#gc-name':'#tk-name');
    await name.fill('Benny');
    const chooser=page.locator('.pf-language');
    await chooser.getByRole('button',{name:'Language',exact:true}).click();
    await chooser.getByRole('menuitemradio',{name:'简体 · 简体中文',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
    await expect(page.getByRole('button',{name:'创建房间',exact:true})).toBeVisible();
    await expect(name).toHaveValue('Benny');
    await page.locator('.pfg-btn').click();
    await expect(page.locator('.pfg-ov')).toBeVisible();
    const content=await page.locator('.pfg-body').textContent();
    expect(content).toMatch(/[\u4e00-\u9fff]/);
    await page.locator('.pfg-x').click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({path:testInfo.outputPath('zh.png'),fullPage:true});
    await chooser.getByRole('button',{name:'Language',exact:true}).click();
    await chooser.getByRole('menuitemradio',{name:'繁體 · 繁體中文',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('lang','zh-TW');
    await expect(name).toHaveValue('Benny');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang','zh-TW');
    await expect(page.getByRole('button',{name:'建立房間',exact:true})).toBeVisible();
    await chooser.getByRole('button',{name:'Language',exact:true}).click();
    await chooser.getByRole('menuitemradio',{name:'EN · English',exact:true}).click();
    await expect(page.getByRole('button',{name:/Create a (Room|room)/,exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  });
}
test('A Chinese Bridge room retains credentials, names and card codes across language changes',async({page})=>{
  await page.goto('/bridge.html');
  await page.fill('#tk-name','Alice');
  await page.getByRole('button',{name:'Create a Room'}).click();
  const code=await page.locator('.large-code').textContent();
  await page.evaluate(()=>GameI18n.set('zh'));
  await expect(page.getByRole('button',{name:'添加电脑玩家',exact:true})).toBeVisible();
  await expect(page.locator('.large-code')).toHaveText(code);
  await expect(page.locator('.seat-name b')).toContainText('Alice');
  await page.getByRole('button',{name:'添加电脑玩家',exact:true}).click();
  await expect(page.locator('.seat-bot')).toHaveCount(1);
  const result=await page.evaluate(()=>({
    clue:GameI18n.t('The painting was made in 1954, not 1906.'),
    dynamic:GameI18n.t('Alice laid down a pair of Kings.'),
  }));
  expect(result.clue).toBe('画作完成于 1954 年，而不是 1906 年。');
  expect(result.dynamic).toBe('Alice 放下了 一对 K。');
});
