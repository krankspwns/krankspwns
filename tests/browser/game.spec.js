const { test, expect } = require('@playwright/test');
async function setup(page) {
  await page.addInitScript(() => {
    localStorage.setItem('sct-snd', '0');
    localStorage.setItem('sct-ui', JSON.stringify({ calm: true, voice: false }));
    localStorage.setItem('sct-lang', 'en');
  });
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.goto('/');
}
async function create(page, name = 'Host') {
  await setup(page);
  await page.getByLabel('Your name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create a new room', exact: true }).click();
  await expect(page.locator('.bigcode')).toBeVisible();
  return (await page.locator('.bigcode').textContent()).trim();
}
async function placeCards(page) {
  for (let slot = 0; slot < 7; slot++) {
    await page.locator('.hand .card').first().press('Enter');
    await expect(page.locator('[data-slot="0"]')).toBeFocused();
    for (let step = 0; step < slot; step++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.locator(`[data-slot="${slot}"] .card`)).toHaveCount(1);
  }
  await expect(page.locator('.hand .card')).toHaveCount(0);
}
test('two players complete a round using keyboard cards on desktop and mobile', async ({ page, browser }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  const code = await create(page);
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const guest = await mobile.newPage(); guest.on('pageerror', (error) => errors.push(error.message));
  try {
    await setup(guest);
    await guest.getByLabel('Your name', { exact: true }).fill('Guest');
    await guest.getByLabel('Room code', { exact: true }).fill(code);
    await guest.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(guest.locator('.bigcode')).toHaveText(code);
    await expect(page.locator('.seat:not(.empty)')).toHaveCount(2);
    await page.locator('.waitroom > button.big').click();
    await expect(page.locator('.hand .card')).toHaveCount(7);
    await expect(guest.locator('.hand .card')).toHaveCount(7);
    await placeCards(page);
    // An occupied slot can be selected and swapped, then returned to the hand.
    const firstCard = await page.locator('[data-slot="0"]').getAttribute('aria-label');
    await page.locator('[data-slot="0"]').press('Enter');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
    await expect(page.locator('[data-slot="1"]')).toHaveAttribute('aria-label', firstCard.replace('Row 1', 'Row 2'));
    await page.locator('[data-slot="1"]').press('Delete');
    await expect(page.locator('.hand .card')).toHaveCount(1);
    await page.locator('.hand .card').press('Enter');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
    await placeCards(guest);
    await page.locator('.readybtn').click(); await guest.locator('.readybtn').click();
    for (let row = 0; row < 4; row++) {
      const reveal = page.locator('.stcontrol button.big');
      await expect(reveal).toBeVisible({ timeout: 45000 });
      await reveal.click();
      // A scored row advances automatically after its verdict.
      await expect(page.locator('.ritem:not(.pending)')).toHaveCount(row + 1, { timeout: 20000 });
    }
    await expect(page.locator('.hallwrap')).toBeVisible({ timeout: 45000 });
    await expect(guest.locator('.hallwrap')).toBeVisible({ timeout: 45000 });
    for (const viewer of [page, guest]) {
      await expect.poll(() => viewer.evaluate(() => {
        const controls = document.querySelector('.final .nextbar').getBoundingClientRect();
        const standings = document.querySelector('.final .hallwrap').getBoundingClientRect();
        return controls.top >= 0 && standings.bottom <= innerHeight;
      })).toBe(true);
    }
    await page.reload();
    await expect(page.locator('.hallwrap')).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await mobile.close(); }
});
test('dialogs trap focus, preserve it during refresh, and restore the opener', async ({ page }) => {
  await create(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('inert', '');
  const last = dialog.locator('.gfoot button').last();
  await last.focus(); await page.keyboard.press('Tab');
  await expect(dialog.locator('button').first()).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(last).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
  await expect(page.locator('main')).not.toHaveAttribute('inert');
});
test('a lost action response is retried once without repeating the purchase', async ({ page }) => {
  await create(page);
  let dropped = false;
  await page.route('**/api/game', async (route) => {
    const data = route.request().postDataJSON();
    if (data?.action === 'buy' && !dropped) {
      dropped = true; await route.fetch(); await route.abort('connectionreset');
    } else await route.continue();
  });
  // Exercise the transport with the same action the shop uses and inspect authoritative state.
  const bought = await page.evaluate(() => api('buy', { kind: 'gift', key: 'tomato' }));
  expect(dropped).toBe(true);
  expect(bought.wallet.gifts.tomato).toBe(3);
  expect(bought.wallet.pts).toBe(15);
});
test('seat recovery requires the private code and invalidates the old session', async ({ page, browser }) => {
  const code = await create(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const recovery = await page.getByLabel('Recovery code', { exact: true }).inputValue();
  await page.keyboard.press('Escape');
  const other = await browser.newContext(); const newcomer = await other.newPage();
  try {
    await setup(newcomer);
    await newcomer.getByLabel('Your name', { exact: true }).fill('Host');
    await newcomer.getByLabel('Room code', { exact: true }).fill(code);
    await newcomer.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(newcomer.locator('.err')).toContainText('recovery code');
    let dropped = false;
    await newcomer.route('**/api/game', async (route) => {
      const data = route.request().postDataJSON();
      if (data?.action === 'join' && data.recoveryCode && !dropped) { dropped = true; await route.fetch(); await route.abort('connectionreset'); }
      else await route.continue();
    });
    await newcomer.getByLabel('Recovery code', { exact: true }).fill(recovery);
    await newcomer.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(newcomer.locator('.bigcode')).toHaveText(code);
    expect(dropped).toBe(true);
    await page.reload();
    await expect(page.locator('.joincard')).toBeVisible();
  } finally { await other.close(); }
});

test('stalled polling times out, then recovers after an offline period', async ({ page, context }) => {
  const code = await create(page);
  let stalled;
  await page.route('**/api/game?**', (route) => { stalled = route; });
  const start = Date.now();
  await page.evaluate(() => poll(true, true));
  expect(Date.now() - start).toBeLessThan(13000);
  expect(await page.evaluate(() => connFails)).toBe(1);
  await stalled.abort().catch(() => {});
  await page.unroute('**/api/game?**');
  await context.setOffline(true);
  await page.evaluate(() => poll(true, true));
  await expect(page.locator('#connbar')).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => resync());
  await expect(page.locator('#connbar')).toHaveCount(0);
  await expect(page.locator('.bigcode')).toHaveText(code);
});

test('a delayed poll cannot undo a newer move', async ({ page }) => {
  await create(page);
  await page.locator('.waitroom > button.big').click();
  await expect(page.locator('.hand .card')).toHaveCount(7);
  let release, captured;
  const capturedResponse = new Promise((resolve) => { captured = resolve; });
  await page.route('**/api/game?**', async (route) => {
    const response = await route.fetch();
    captured();
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ response });
  }, { times: 1 });
  const polling = page.evaluate(() => poll(true, true));
  await capturedResponse;
  await page.locator('.hand .card').first().click();
  await expect.poll(() => page.evaluate(() => pending)).toBe(0);
  release(); await polling;
  await expect(page.locator('[data-slot="0"] .card')).toHaveCount(1);
  await expect(page.locator('.hand .card')).toHaveCount(6);
});

test('a rejected optimistic move is reconciled even if the first fresh read fails', async ({ page }) => {
  await create(page);
  await page.locator('.waitroom > button.big').click();
  await expect(page.locator('.hand .card')).toHaveCount(7);
  let failedMove = false, failedRead = false;
  const ids = [];
  await page.route('**/api/game**', async (route) => {
    const data = route.request().postDataJSON();
    if (data?.action === 'place') {
      failedMove = true; ids.push(data.requestId);
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Busy, try again' }) });
    } else if (failedMove && !failedRead && route.request().method() === 'GET') {
      failedRead = true;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Busy, try again' }) });
    } else await route.continue();
  });
  await page.locator('.hand .card').first().click();
  await expect(page.locator('.hand .card')).toHaveCount(6);
  await expect(page.locator('.hand .card')).toHaveCount(7);
  await expect(page.locator('[data-slot="0"] .card')).toHaveCount(0);
  await expect(page.locator('#connbar')).toHaveCount(0);
  expect(failedRead).toBe(true);
  expect(ids).toHaveLength(3);
  expect(new Set(ids).size).toBe(1);
});

test('host opens confirmed cards once and refreshes preserve reveal progress', async ({ page, browser }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const code = await create(page);
  const context = await browser.newContext();
  const guest = await context.newPage();
  try {
    await setup(guest);
    await guest.getByLabel('Your name', { exact: true }).fill('Guest');
    await guest.getByLabel('Room code', { exact: true }).fill(code);
    await guest.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.locator('.seat:not(.empty)')).toHaveCount(2);
    await page.locator('.waitroom > button.big').click();
    await expect(page.locator('.hand .card')).toHaveCount(7);
    await expect(guest.locator('.hand .card')).toHaveCount(7);
    await placeCards(page); await placeCards(guest);
    await page.locator('.readybtn').click(); await guest.locator('.readybtn').click();
    await expect(page.locator('.stcontrol button.big')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('.stcontrol button.big')).toBeEnabled();
    // Hold the reveal before the server receives it, representing a slow connection.
    await page.evaluate(() => { clearTimeout(timer); rtClose(); });
    let release, received;
    const gate = new Promise(resolve => { release = resolve; });
    const request = new Promise(resolve => { received = resolve; });
    await page.route('**/api/game', async route => {
      if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'flipRowAll') {
        received(); await gate;
      }
      await route.continue();
    });
    await page.locator('.stcontrol button.big').click(); await request;
    await expect(page.locator('.stcontrol button.big')).toBeDisabled();
    await expect(page.locator('.stage .fx-flip')).toHaveCount(0);
    expect(await page.evaluate(() => st.players.filter(p => !p.spectator).every(p => !p.board[0].up))).toBe(true);
    release();
    await page.waitForFunction(() => !!document.querySelector('.stage [data-reveal-key].fx-flip'));
    const progress = await page.evaluate(() => {
      const card = document.querySelector('.stage [data-reveal-key].fx-flip');
      const key = card.dataset.revealKey;
      const animation = card.getAnimations().find(a => a.animationName === 'flipin');
      const before = animation.currentTime, delay = animation.effect.getTiming().delay;
      render();
      const replacement = [...document.querySelectorAll('[data-reveal-key]')].find(n => n.dataset.revealKey === key);
      const continued = replacement.getAnimations().find(a => a.animationName === 'flipin');
      return { before, after: continued.currentTime, delay, afterDelay: continued.effect.getTiming().delay };
    });
    expect(progress.after).toBeCloseTo(progress.before, 1);
    expect(progress.afterDelay).toBe(progress.delay);
    await page.waitForTimeout(1250);
    await page.evaluate(() => render());
    await expect(page.locator('.stage .fx-flip')).toHaveCount(0);
    expect(await page.evaluate(() => st.rowResults.length)).toBe(1);
  } finally { await context.close(); }
});
