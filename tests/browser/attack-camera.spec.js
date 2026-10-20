const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
test('attack camera eases from the current position and leaves visible targets alone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.setContent('<style>body{margin:0;height:4000px}</style>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../../src/showdown.js'), 'utf8') });
  const result = await page.evaluate(async () => {
    window.scrollTo(0, 800);
    const positions = []; let duration;
    await panAttackCamera(2200, 600, async (ms, frame) => {
      duration = ms;
      for (const progress of [0, .1, .25, .5, .75, 1]) { frame(progress); positions.push(window.scrollY); }
    });
    let unnecessaryPan = false;
    await panAttackCamera(window.scrollY + 300, 600, async () => { unnecessaryPan = true; });
    return { positions, duration, unnecessaryPan };
  });
  expect(result.positions[0]).toBe(800);
  expect(result.positions.at(-1)).toBe(1930);
  expect(result.positions[1] - 800).toBeLessThan(50);
  expect(result.positions).toEqual([...result.positions].sort((a, b) => a - b));
  expect(result.duration).toBeGreaterThanOrEqual(650);
  expect(result.unnecessaryPan).toBe(false);
});
test('drink list scrolls without a visible scrollbar and Cheers stops scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.setContent('<style>' + fs.readFileSync(path.join(__dirname, '../../src/styles.css'), 'utf8') + '</style><div class="drinkfx"><div class="dkbox"><div style="height:1500px">Drinks</div><div class="dkcheer">Cheers!</div></div></div>');
  const result = await page.evaluate(() => {
    const box = document.querySelector('.dkbox'); box.scrollTop = 300;
    const scrollable = box.scrollTop;
    const scrollbar = getComputedStyle(box).scrollbarWidth;
    document.querySelector('.drinkfx').classList.add('cheers'); box.scrollTop = 300;
    return { scrollable, scrollbar, cheersScroll: box.scrollTop, overflow: getComputedStyle(box).overflow };
  });
  expect(result.scrollable).toBe(300);
  expect(result.scrollbar).toBe('none');
  expect(result.cheersScroll).toBe(0);
  expect(result.overflow).toBe('clip');
});
