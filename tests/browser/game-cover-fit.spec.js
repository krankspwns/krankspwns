const {test,expect}=require('@playwright/test');
for(const width of [320,390,620,621,820,1000,1440])test('complete game covers fit at '+width,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});await page.goto('/?games=1');
  await page.locator('.game-art img').evaluateAll(images=>Promise.all(images.map(image=>{image.loading='eager';return image.decode();})));
  const covers=await page.locator('.game-art').evaluateAll(frames=>frames.map(frame=>{
    const img=frame.querySelector('img'),r=frame.getBoundingClientRect(),image=img.getBoundingClientRect(),css=getComputedStyle(img);
    const scale=Math.min(image.width/img.naturalWidth,image.height/img.naturalHeight);
    return {ratio:r.width/r.height,fit:css.objectFit,renderedWidth:img.naturalWidth*scale,renderedHeight:img.naturalHeight*scale,width:r.width,height:r.height,imageWidth:image.width,imageHeight:image.height,transform:css.transform};
  }));
  expect(covers).toHaveLength(5);
  for(const cover of covers){
    expect(cover.ratio).toBeCloseTo(1.5,2);expect(cover.fit).toBe('contain');
    expect(cover.imageWidth).toBeCloseTo(cover.width,1);expect(cover.imageHeight).toBeCloseTo(cover.height,1);
    expect(cover.renderedWidth).toBeLessThanOrEqual(cover.width+.1);expect(cover.renderedHeight).toBeLessThanOrEqual(cover.height+.1);
    expect(cover.transform).toBe('none');
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  if([390,820,1440].includes(width))await page.screenshot({path:testInfo.outputPath('game-covers.png'),fullPage:true});
});
test('hover keeps the artwork fully framed',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/?games=1');
  await page.locator('.game-card').first().hover();
  await expect(page.locator('.game-card img').first()).toHaveCSS('transform','none');
});
