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

