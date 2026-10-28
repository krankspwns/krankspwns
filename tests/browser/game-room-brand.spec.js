const {test,expect}=require('@playwright/test');
for(const width of [320,390,1100])test('Game Room logo is visibly centered, '+width,async({page},testInfo)=>{
  await page.setViewportSize({width,height:844});await page.goto('/?games=1');
  const logo=page.locator('.arcade-header .brand-mark');await expect(logo.locator('img')).toBeVisible();
  const geometry=await logo.evaluate(async e=>{
    const img=e.querySelector('img');await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;
    let x0=c.width,x1=0,y0=c.height,y1=0;
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(data[(y*c.width+x)*4+3]>24){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    const box=e.getBoundingClientRect(),image=img.getBoundingClientRect();
    return {width:box.width,height:box.height,dx:Math.abs(image.x+(x0+x1+1)/2/c.width*image.width-box.x-box.width/2),dy:Math.abs(image.y+(y0+y1+1)/2/c.height*image.height-box.y-box.height/2),right:pageXOffset+box.right,oldGlyph:e.textContent.includes('✦')};
  });
  expect(geometry.width).toBe(44);expect(geometry.height).toBe(44);expect(geometry.dx).toBeLessThan(.5);expect(geometry.dy).toBeLessThan(.5);expect(geometry.oldGlyph).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:testInfo.outputPath('game-room-logo.png')});
});

test('App and browser icons use the Game Room identity at their declared sizes',async({page})=>{
  await page.goto('/?games=1');
  const sizes=await page.evaluate(async()=>{
    const files={'/icon-192.png':192,'/icon-512.png':512,'/icon-maskable-512.png':512,'/apple-touch-icon.png':180};
    return Promise.all(Object.entries(files).map(async([src,size])=>{const image=new Image();image.src=src;await image.decode();return {width:image.naturalWidth,height:image.naturalHeight,size};}));
  });
  for(const s of sizes){expect(s.width).toBe(s.size);expect(s.height).toBe(s.size);}
  const response=await page.request.get('/icon.svg');expect(response.ok()).toBe(true);expect((await response.text()).length).toBeLessThan(20000);
});
