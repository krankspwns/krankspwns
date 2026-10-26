const { test, expect } = require('@playwright/test');

// Plays a deal against three bots (the human always passes, then plays its first legal card) and checks
// that the table is laid out properly once tricks are being collected.
async function playUntilTrickCollected(page) {
  await page.goto('/bridge.html');
  await page.fill('#tk-name', 'Host');
  await page.getByRole('button', { name: 'Create a Room' }).click();
  await expect(page.locator('.large-code')).toBeVisible();
  for (let i = 1; i <= 3; i++) { await page.getByRole('button', { name: '+ Add a bot' }).click(); await expect(page.locator('.seat-bot')).toHaveCount(i); }
  await page.getByRole('button', { name: 'START GAME' }).click();
  const deadline = Date.now() + 100000;
  while (Date.now() < deadline) {
    const collected = await page.locator('.pile em').allTextContents();
    if (collected.some((t) => Number(t) > 0) && await page.locator('.trick-slot .pcard').count() > 0) return;
    // The table re-renders every second, so click straight in the page instead of waiting for a stable element.
    await page.evaluate(() => {
      const q = (s) => document.querySelector(s), on = (b) => b && !b.disabled;
      if (on(q('[data-focus="next"]'))) q('[data-focus="next"]').click();
      else if (on(q('[data-focus="bid-confirm"]'))) q('[data-focus="bid-confirm"]').click();
      else if (on(q('[data-focus="bid-P"]'))) q('[data-focus="bid-P"]').click();
      else if (on(q('[data-focus="call-confirm"]'))) q('[data-focus="call-confirm"]').click();
      else if (on(q('[data-focus="call-SA"]'))) q('[data-focus="call-SA"]').click();
      else if (on(q('[data-focus="play-confirm"]'))) q('[data-focus="play-confirm"]').click();
      else { const card = q('.hand-row button.pcard.playable:not([disabled])'); if (card) card.click(); }
    });
    await page.waitForTimeout(400);
  }
  throw new Error('no trick was collected in time');
}
const overlap = (a, b) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

for (const [label, size] of [['desktop', { width: 1200, height: 900 }], ['phone', { width: 360, height: 760 }]]) {
  test('Bridge table during play, ' + label + ': nothing overlaps, no sideways scrolling, tricks are collected in stacks', async ({ page }) => {
    test.setTimeout(150000);
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(size);
    await playUntilTrickCollected(page);
    await expect(page.locator('.contract-bar')).toBeVisible();
    await expect(page.locator('.contract-bar')).toContainText('Needs');
    await expect(page.locator('.contract-bar')).toContainText(/Trumps|No trumps/);
    await expect(page.locator('.collected')).toHaveCount(4);
    const boxes = async (sel) => page.locator(sel).evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
    const plates = await boxes('.felt-seat'), cards = (await boxes('.trick-slot .pcard')), trick = (await boxes('.trick'))[0];
    for (let i = 0; i < plates.length; i++) for (let j = i + 1; j < plates.length; j++) expect(overlap(plates[i], plates[j]), 'seat ' + i + ' overlaps seat ' + j).toBe(false);
    for (const p of plates) for (const card of cards) expect(overlap(p, card), 'a played card overlaps a player seat').toBe(false);
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) expect(overlap(cards[i], cards[j]), 'played cards overlap each other').toBe(false);
    for (const card of cards) { expect(card.x).toBeGreaterThanOrEqual(trick.x - 1); expect(card.x + card.width).toBeLessThanOrEqual(trick.x + trick.width + 1); expect(card.y).toBeGreaterThanOrEqual(trick.y - 1); expect(card.y + card.height).toBeLessThanOrEqual(trick.y + trick.height + 1); }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}


