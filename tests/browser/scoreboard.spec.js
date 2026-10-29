const { test, expect } = require('@playwright/test');
for (const width of [320,390,430,1280]) {
  test(`scoreboard keeps Calls and WP separate at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height:900 });
    await page.route('https://fonts.googleapis.com/**', route=>route.abort());
    await page.goto('/reckoning.html');
    await page.evaluate(() => {
      clearTimeout(timer); rtClose(); session=null;
      const values = [['Benny',34,53,57,115,512],['zzz',5,124,5,20,124],['Noob',3,116,6,17,182],['Pig',2,128,4,16,120],['Mel',2,163,2,8,105]];
      st = { code:'HMBM',round:42,meId:'p0',settings:{drink:true},players:values.map(([name,wins,pen,hits,calls,wp],i)=>({id:'p'+i,name,wins,wp,avatar:['lion','panda','cow','seal','penguin'][i],sess:{rounds:42,pen,hits,calls}})) };
      openScoreboard();
    });
    await expect(page.getByRole('dialog', { name:'Session Scoreboard' })).toBeVisible();
    await expect(page.locator('.sb-k')).toHaveText('CROWN CLASH');
    const measurements = await page.locator('.sbr:not(.hd)').evaluateAll(rows => rows.map(row => {
      const values=[...row.querySelectorAll('.sbv')];
      const bounds=values.map(n=>{const range=document.createRange();range.selectNodeContents(n);const r=range.getBoundingClientRect();return {left:r.left,right:r.right}});
      return { bounds,columns:values.map(n=>n.getBoundingClientRect().left) };
    }));
    for(const row of measurements) {
      for(let i=1;i<row.bounds.length;i++) expect(row.bounds[i].left-row.bounds[i-1].right).toBeGreaterThanOrEqual(4);
      expect(row.columns).toEqual(measurements[0].columns);
    }
    expect(await page.locator('.sbtab').evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
    // Longer sessions reserve enough width for four-digit calls and five-digit WP.
    await page.evaluate(() => {
      document.querySelector('.sb-ov').remove();
      st.players[0].sess.hits=999;st.players[0].sess.calls=1000;st.players[0].wp=10000;
      openScoreboard();
    });
    const gap = await page.locator('.sbr:not(.hd)').first().evaluate(row=>{
      const cells=row.querySelectorAll('.sbv');
      const a=document.createRange(),b=document.createRange();a.selectNodeContents(cells[2]);b.selectNodeContents(cells[3]);
      return b.getBoundingClientRect().left-a.getBoundingClientRect().right;
    });
    expect(gap).toBeGreaterThanOrEqual(4);
  });
}

test('Crown Clash branding follows language without changing the game route',async({page})=>{
  await page.goto('/?games=1');
  await page.getByRole('link',{name:/Crown Clash/}).click();
  await expect(page).toHaveURL(/\/reckoning\.html$/);
  for(const [lang,title] of [['en','Crown Clash'],['zh','王冠对决'],['zht','王冠對決']]){
    await page.evaluate(lang=>setLang(lang),lang);
    await expect(page).toHaveTitle(title);
    await expect(page.locator('#h1')).toHaveText(title);
    expect(await page.evaluate(()=>t('sbPlay'))).toContain('Crown Clash');
  }
  await page.reload();await expect(page).toHaveTitle('王冠對決');
});
