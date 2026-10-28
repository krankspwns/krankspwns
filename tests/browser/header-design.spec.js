const {test,expect}=require('@playwright/test');
for(const game of ['bridge','hot-joker','grand-con'])for(const width of [320,390,1100])test(game+': grouped navigation and aligned header controls, '+width,async({page},testInfo)=>{
  await page.setViewportSize({width,height:844});await page.goto('/'+game+'.html');
  const header=page.locator('.game-header');const back=header.getByRole('link',{name:'All games',exact:true});
  await expect(back).toBeVisible();await expect(header.getByRole('button',{name:'How to Play',exact:true})).toBeVisible();
  const geometry=await header.evaluate(h=>{
    const rect=s=>h.querySelector(s).getBoundingClientRect();const back=rect('.header-back'),brand=rect('.header-brand'),left=rect('.header-left'),right=rect('.header-tools'),title=h.querySelector('.header-brand-copy b'),svg=h.querySelector('.header-back-art svg'),path=svg.getBBox();
    return {backWidth:back.width,backHeight:back.height,gap:brand.left-back.right,titleFont:parseFloat(getComputedStyle(title).fontSize),textOverflow:title.scrollWidth-title.clientWidth,leftX:left.x,rightX:right.x,rightEdge:right.right,navY:back.y,controlsY:left.y,arrowCenter:path.x+path.width/2};
  });
  expect(geometry.backWidth).toBe(44);expect(geometry.backHeight).toBe(44);expect(geometry.gap).toBe(12);expect(geometry.titleFont).toBeGreaterThanOrEqual(13);expect(geometry.textOverflow).toBeLessThanOrEqual(1);
  expect(geometry.leftX).toBeLessThan(geometry.rightX);expect(geometry.rightEdge).toBeLessThanOrEqual(width);expect(geometry.arrowCenter).toBe(12);
  if(width<760)expect(geometry.controlsY).toBeGreaterThan(geometry.navY+40);else expect(Math.abs(geometry.controlsY-geometry.navY)).toBeLessThan(8);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:testInfo.outputPath('header.png')});
  await header.getByRole('button',{name:'How to Play',exact:true}).click();await expect(page.locator('.pfg-ov')).toBeVisible();await page.locator('.pfg-x').click();
  await header.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('dialog',{name:'Settings',exact:true})).toBeVisible();await page.locator('.pf-x').click();
  await back.click();await expect(page.getByRole('heading',{name:'Hidden Alliance',exact:true})).toBeVisible();
});
