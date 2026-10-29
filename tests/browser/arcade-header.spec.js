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

test('shared sound controls use Crown Clash colour artwork for all three modes',async({page},testInfo)=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const colors=fs.readFileSync(require.resolve('../../src/icons.js'),'utf8').split('const COLOR_ICONS =')[1];
  const keys=['volume-x','volume-2','music'];
  const art=keys.map(key=>{
    const row=colors.split('\n').find(line=>line.startsWith("  '"+key+"':")||line.startsWith('  '+key+':'));
    return vm.runInNewContext(row.slice(row.indexOf(':')+1).trim().replace(/,$/,''));
  });
  for(const path of ['/?games=1','/bridge.html','/hot-joker.html','/grand-con.html']){
    await page.goto(path);
    const sound=page.locator('.header-tools > .pf-dd:not(.pf-language)');
    for(let mode=0;mode<3;mode++){
      await sound.locator('.pf-ddbtn').click();
      const choices=sound.getByRole('menuitemradio');
      const match=await choices.evaluateAll((buttons,art)=>buttons.every((button,i)=>{
        const svg=button.querySelector('svg'),expected=document.createElement('div');expected.innerHTML='<svg>'+art[i]+'</svg>';
        return svg.getAttribute('viewBox')==='0 0 32 32'&&svg.innerHTML.replace(/-shared-av-\d+/g,'')===expected.firstChild.innerHTML;
      }),art);
      expect(match).toBe(true);
      await choices.nth(mode).click();
      expect(await sound.locator('.pf-ddbtn .pf-art').first().evaluate((node,body)=>{
        const expected=document.createElement('div');expected.innerHTML='<svg>'+body+'</svg>';
        return node.querySelector('svg').innerHTML.replace(/-shared-av-\d+/g,'')===expected.firstChild.innerHTML;
      },art[mode])).toBe(true);
    }
    const ids=await sound.locator('svg [id]').evaluateAll(nodes=>nodes.map(n=>n.id));expect(new Set(ids).size).toBe(ids.length);
    if(path==='/?games=1')await page.screenshot({path:testInfo.outputPath('colour-sound-icons.png')});
  }
});
