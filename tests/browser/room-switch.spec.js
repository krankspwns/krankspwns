const { test, expect } = require('@playwright/test');
const crypto = require('node:crypto');
const SEATS = { bridge: 'br-seat', 'hot-joker': 'hj-seat', reckoning: 'sct', 'grand-con': 'gc-seat', 'last-train': 'lt-seat' };
async function post(request, game, body) {
  const r = await request.post('/api/' + (game === 'reckoning' ? 'game' : game), { data: { requestId: crypto.randomUUID(), ...body } });
  const j = await r.json(); expect(r.ok(), JSON.stringify(j)).toBeTruthy(); return j;
}
for (const width of [320, 390, 1100]) test('whole party switches games without rejoining at ' + width, async ({ browser, request }, testInfo) => {
  const host = await post(request, 'bridge', { action: 'create', name: 'Host' });
  const friend = await post(request, 'bridge', { action: 'join', code: host.code, name: 'Friend' });
  for (const name of ['Third', 'Fourth']) await post(request, 'bridge', { action: 'join', code: host.code, name });
  const contexts = await Promise.all([host, friend].map(async s => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript(({ s }) => { if (location.protocol === 'http:' && !localStorage.getItem('br-seat')) localStorage.setItem('br-seat', JSON.stringify({ code: s.code, pid: s.meId, tok: s.tok })); }, { s });
    return context;
  }));
  try {
    const pages = await Promise.all(contexts.map(c => c.newPage())), errors = [];
    for (const page of pages) page.on('pageerror', e => errors.push(e.message));
    await Promise.all(pages.map(p => p.goto('/bridge.html')));
    await expect(pages[0].getByRole('button', { name: 'Switch game', exact: true })).toBeVisible();
    await expect(pages[1].getByRole('button', { name: 'Switch game', exact: true })).toHaveCount(0);
    const titles = { 'hot-joker': 'Hot Joker', reckoning: 'Row of Reckoning', 'grand-con': 'The Grand Con', 'last-train': 'Last Train', bridge: 'Hidden Alliance' };
    for (const game of ['hot-joker', 'reckoning', 'grand-con', 'last-train', 'bridge']) {
      if (width === 390 && game === 'hot-joker') await contexts[1].setOffline(true);
      const tools = await pages[0].locator('#pf-dock button').evaluateAll(nodes => nodes.map(n => ({ left: n.getBoundingClientRect().left, right: n.getBoundingClientRect().right })));
      for (const box of tools) { expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width); }
      await pages[0].getByRole('button', { name: 'Switch game', exact: true }).click();
      const picker = pages[0].getByRole('dialog', { name: 'Switch game', exact: true });
      await expect(picker).toBeVisible();
      if (game === 'hot-joker') {
        await pages[0].evaluate(() => document.fonts.ready);
        await pages[0].screenshot({ path: testInfo.outputPath('switch-picker-' + width + '.png'), fullPage: true });
        expect(await pages[0].evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      }
      await picker.getByRole('button', { name: new RegExp(titles[game]) }).click();
      await pages[0].getByRole('button', { name: 'Switch everyone to ' + titles[game], exact: true }).click();
      await expect(pages[0].locator('.pf-transfer')).toBeVisible();
      await expect(pages[0].locator('.pf-transfer-name')).toHaveText(titles[game]);
      for (let i = 0; i < pages.length; i++) {
        if (i === 1 && width === 390 && game === 'hot-joker') await contexts[1].setOffline(false);
        await expect(pages[i]).toHaveURL(new RegExp('/' + game + '.html(?:\\?room=|$)'));
        await expect(pages[i].locator('.pf-transfer')).toHaveCount(0);
        await expect.poll(async () => pages[i].evaluate(k => JSON.parse(localStorage.getItem(k) || 'null')?.pid, SEATS[game])).toBe(i === 0 ? host.meId : friend.meId);
      }
      await expect(pages[0].getByRole('button', { name: 'Switch game', exact: true })).toBeVisible();
      const code = await pages[0].evaluate(k => JSON.parse(localStorage.getItem(k)).code, SEATS[game]);
      const state = await post(request, game, { action: 'state', code, pid: host.meId, tok: host.tok });
      expect(state.players).toHaveLength(4); expect(state.phase).toBe('lobby');
    }
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(c => c.close())); }
});

for (const reducedMotion of ['reduce', 'no-preference']) test('transfer screen waits for destination room, '+reducedMotion, async ({browser,request},testInfo)=>{
  const host=await post(request,'bridge',{action:'create',name:'Traveller'});
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion});
  let release;const gate=new Promise(resolve=>{release=resolve;});
  try {
    await context.addInitScript(({host})=>{
      localStorage.setItem('br-seat',JSON.stringify({code:host.code,pid:host.meId,tok:host.tok}));
      sessionStorage.setItem('kp-game-transfer',JSON.stringify({game:'bridge',title:'Hidden Alliance',at:Date.now()}));
    },{host});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/bridge*',async route=>{await gate;await route.continue();});
    if(reducedMotion==='reduce')await page.clock.install();
    await page.goto('/bridge.html?room='+host.code);
    const screen=page.locator('.pf-transfer');
    await expect(screen).toBeVisible();await expect(screen).toContainText('Teleporting to another game…');await expect(screen).toContainText('Hidden Alliance');
    expect(await page.locator('.pf-transfer-track i').evaluate(e=>getComputedStyle(e).animationName)).toBe(reducedMotion==='reduce'?'none':'pf-transfer-travel');
    await page.screenshot({path:testInfo.outputPath('teleporting.png')});
    if(reducedMotion==='reduce'){
      await page.clock.fastForward(16000);
      await expect(screen.getByRole('button',{name:'Retry loading'})).toBeVisible();
      await expect(screen).toContainText('Your seat is saved.');
    }
    release();await expect(screen).toHaveCount(0,{timeout:10000});
    await expect(page.locator('html')).not.toHaveClass(/pf-transferring/);
    expect(await page.evaluate(()=>sessionStorage.getItem('kp-game-transfer'))).toBeNull();
    await expect(page.locator('.large-code')).toContainText(host.code);
    expect(errors).toEqual([]);
  }finally{release();await context.close();}
});
