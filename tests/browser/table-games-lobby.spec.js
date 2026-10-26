const { test, expect } = require('@playwright/test');

for (const game of [{ page: '/hot-joker.html', title: 'Hot Joker' }, { page: '/bridge.html', title: 'Bridge' }]) {
  test(game.title + ': creating a room opens the waiting room, and the host can add and remove bots', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(game.page);
    await page.fill('#tk-name', 'Host');
    await page.getByRole('button', { name: 'Create a room' }).click();
    await expect(page.locator('.large-code')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Add a bot' })).toBeVisible();
    await page.getByRole('button', { name: '+ Add a bot' }).click();
    await expect(page.locator('.seat-bot')).toHaveCount(1);
    await page.getByRole('button', { name: '+ Add a bot' }).click();
    await expect(page.locator('.seat-bot')).toHaveCount(2);
    await page.getByRole('button', { name: '− Remove a bot' }).click();
    await expect(page.locator('.seat-bot')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

async function hotJokerWith(page, bots) {
  await page.goto('/hot-joker.html');
  await page.fill('#tk-name', 'Host');
  await page.getByRole('button', { name: 'Create a room' }).click();
  await expect(page.locator('.large-code')).toBeVisible();
  for (let i = 1; i <= bots; i++) { await page.getByRole('button', { name: '+ Add a bot' }).click(); await expect(page.locator('.seat-bot')).toHaveCount(i); }
  await page.getByRole('button', { name: 'START GAME' }).click();
  await expect(page.locator('.circle')).toBeVisible();
}
const overlap = (a, b) => a.x < b.x + b.width - 2 && b.x < a.x + a.width - 2 && a.y < b.y + b.height - 2 && b.y < a.y + a.height - 2;

for (const [label, size, bots] of [['desktop', { width: 1200, height: 900 }, 4], ['phone', { width: 360, height: 760 }, 4], ['desktop full table', { width: 1200, height: 900 }, 9], ['phone full table', { width: 360, height: 760 }, 9]]) {
  test('Hot Joker circle, ' + label + ' with ' + (bots + 1) + ' players: seats do not overlap, pairs are shown, no pair stays in hand', async ({ page }) => {
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(size);
    await hotJokerWith(page, bots);
    await expect(page.locator('.circle-seat')).toHaveCount(bots + 1);
    const boxes = await page.locator('.circle-seat .tile').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j]), 'seats ' + i + ' and ' + j + ' overlap').toBe(false);
    const wrap = await page.locator('.circle').boundingBox();
    for (const b of boxes) { expect(b.x).toBeGreaterThanOrEqual(wrap.x - 4); expect(b.x + b.width).toBeLessThanOrEqual(wrap.x + wrap.width + 4); }
    await expect(page.locator('.sets-panel .set-chip').first()).toBeVisible();
    const ranks = await page.locator('.hand-row .pcard').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label').split(' of ')[0]).filter((r) => r !== 'Joker'));
    expect(new Set(ranks).size, 'a hand never keeps two cards of one rank').toBe(ranks.length);
    await page.reload();
    await expect(page.locator('.circle')).toBeVisible();
    await expect(page.getByText('Loading your game…')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

