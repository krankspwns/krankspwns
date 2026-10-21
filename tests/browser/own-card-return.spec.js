const { test, expect } = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path');
const table = fs.readFileSync(path.join(__dirname, '../../src/table.js'), 'utf8');
const returning = table.slice(table.indexOf('// Return from the attack camera'), table.indexOf('// Frame the next-round controls'));
async function setup(page) {
  await page.setViewportSize({ width:390, height:600 });
  await page.emulateMedia({ reducedMotion:'no-preference' });
  await page.clock.install();
  await page.setContent('<style>body{margin:0}.stage{padding-top:1200px}.tcards{height:100px}footer{height:1500px}</style><div class="stage"><div class="tile me"><div class="tcards">My cards</div></div></div><footer></footer>');
  await page.addScriptTag({ content:'var st={code:"TEST",round:1,currentRow:1}; var stageRow=1; var drinkPendingRow=()=>-1,lateDrinkPending=()=>false;' });
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname,'../../src/showdown.js'),'utf8') });
  await page.addScriptTag({ content: returning });
}
test('returns gently to own cards after all row popups clear', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { const o=document.createElement('div'); o.className='resfx'; document.body.append(o); scrollTo(0,2100); queueOwnCardReturn(); });
  await page.clock.runFor(1800);
  expect(await page.evaluate(() => scrollY)).toBe(2100);
  await page.evaluate(() => { document.querySelector('.resfx').className='drinkfx'; });
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => scrollY)).toBe(2100);
  await page.evaluate(() => document.querySelector('.drinkfx').remove());
  await page.clock.runFor(250);
  const middle = await page.evaluate(() => scrollY);
  expect(middle).toBeLessThan(2100);
  expect(middle).toBeGreaterThan(1000);
  await page.clock.runFor(1200);
  const center = await page.locator('.tcards').evaluate(n=>{const r=n.getBoundingClientRect();return r.top+r.height/2});
  expect(center).toBeCloseTo(270,0);
});
test('waits for the next row and gives Hall of Fame framing priority', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { stageRow=0; queueOwnCardReturn(); });
  await page.clock.runFor(1500);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.evaluate(() => { const final=document.createElement('div');final.className='final';document.body.append(final);stageRow=4; });
  await page.clock.runFor(1500);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});
