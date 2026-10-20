const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const table = fs.readFileSync(path.join(__dirname, '../../src/table.js'), 'utf8');
const framing = table.slice(table.indexOf('// Frame the next-round controls'), table.indexOf('function render() {'));
async function setup(page, height = 844, hallHeight = 340) {
  await page.setViewportSize({ width: 390, height });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install();
  await page.setContent(`<style>body{margin:0}.before,.after{height:1400px}.final{padding:16px}.nextbar{height:90px;margin-bottom:16px}.hallwrap{height:${hallHeight}px}</style><div class="before"></div><div class="final"><div class="nextbar">Another Round?</div><div class="hallwrap">Hall of Fame</div></div><div class="after"></div>`);
  await page.addScriptTag({ content: 'var st={code:"TEST",round:1};' + framing });
}
async function bounds(page) {
  return page.evaluate(() => ({
    y: scrollY, top: document.querySelector('.nextbar').getBoundingClientRect().top,
    bottom: document.querySelector('.hallwrap').getBoundingClientRect().bottom, height: innerHeight,
  }));
}
for (const from of ['above', 'below']) {
  test(`frames Another Round and standings when arriving from ${from}`, async ({ page }) => {
    await setup(page);
    await page.evaluate(from => { scrollTo(0, from === 'above' ? 0 : 2600); syncHallFraming(); }, from);
    const start = (await bounds(page)).y;
    await page.clock.runFor(750);
    const middle = (await bounds(page)).y;
    expect(middle).not.toBe(start);
    await page.clock.runFor(1200);
    const final = await bounds(page);
    expect(final.top).toBeGreaterThanOrEqual(15);
    expect(final.bottom).toBeLessThanOrEqual(final.height - 15);
    // Readiness refreshes do not take the player back after they browse elsewhere.
    await page.evaluate(() => { scrollTo(0, 0); syncHallFraming(); });
    await page.clock.runFor(2000);
    expect((await bounds(page)).y).toBe(0);
  });
}
test('waits until the celebration closes, then frames the final screen', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { const overlay=document.createElement('div'); overlay.className='winfx'; document.body.append(overlay); syncHallFraming(); });
  await page.clock.runFor(2000);
  expect((await bounds(page)).y).toBe(0);
  await page.evaluate(() => document.querySelector('.winfx').remove());
  await page.clock.runFor(1500);
  expect((await bounds(page)).top).toBeGreaterThanOrEqual(15);
  expect((await bounds(page)).bottom).toBeLessThanOrEqual(829);
});
test('short screens retain the controls and beginning of the rankings', async ({ page }) => {
  await setup(page, 390, 900);
  await page.evaluate(() => { scrollTo(0, 2600); syncHallFraming(); });
  await page.clock.runFor(2000);
  const final = await bounds(page);
  expect(final.top).toBeCloseTo(16, 0);
  expect(await page.locator('.hallwrap').evaluate(n => n.getBoundingClientRect().top)).toBeLessThan(200);
});
test('does not move a view that already contains both sections', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { scrollTo(0, 1300); syncHallFraming(); });
  await page.clock.runFor(2000);
  expect((await bounds(page)).y).toBe(1300);
});
test('cancels the pending pan when a new round starts', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { syncHallFraming(); st.round=2; document.querySelector('.final').remove(); syncHallFraming(); });
  await page.clock.runFor(2000);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});
