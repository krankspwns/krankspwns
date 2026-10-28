const {test,expect}=require('@playwright/test');
for(const width of [320,390,1100])test('Ivory game list with individual card palettes, '+width,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});await page.goto('/?games=1');
  await expect(page.locator('body')).toHaveCSS('background-color','rgb(250, 248, 243)');
  await expect(page.locator('html')).toHaveCSS('color-scheme','light');
  await expect(page.locator('.game-card')).toHaveCount(5);
  const colors=await page.locator('.game-card').evaluateAll(cards=>cards.map(card=>{
    const css=getComputedStyle(card),rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number),luminance=value=>rgb(value).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const backgrounds=css.backgroundImage.match(/rgb\([^)]+\)/g);
    const ratios=['p','.game-tag','.game-cta'].map(selector=>{
      const fg=luminance(getComputedStyle(card.querySelector(selector)).color);
      return Math.min(...backgrounds.map(bg=>{const v=luminance(bg);return (Math.max(fg,v)+.05)/(Math.min(fg,v)+.05);}));
    });
    return {background:css.backgroundImage,ratios};
  }));
  expect(new Set(colors.map(c=>c.background)).size).toBe(5);for(const card of colors)for(const ratio of card.ratios)expect(ratio).toBeGreaterThanOrEqual(4.5);
  await expect(page.locator('.reckoning-card')).toHaveCSS('background-image','linear-gradient(145deg, rgb(31, 38, 53), rgb(16, 22, 34))');
  await expect(page.locator('.reckoning-card')).toHaveCSS('color','rgb(244, 234, 216)');
  await expect(page.locator('.reckoning-card img')).toHaveAttribute('src','/game-art/reckoning.webp');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:testInfo.outputPath('game-list.png'),fullPage:true});
  await page.getByRole('link',{name:/Row of Reckoning/}).click();
  await expect(page.locator('html')).not.toHaveCSS('color-scheme','light');
});
