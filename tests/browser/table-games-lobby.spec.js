const { test, expect } = require('@playwright/test');

for (const game of [{ page: '/hot-joker.html', title: 'Last Laugh' }, { page: '/bridge.html', title: 'Bridge' }]) {
  test(game.title + ': creating a room opens the waiting room, and the host can add and remove bots', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(game.page);
    await page.fill('#tk-name', 'Host');
    await page.getByRole('button', { name: 'Create a Room' }).click();
    await expect(page.locator('.large-code')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a bot' })).toBeVisible();
    await page.getByRole('button', { name: 'Add a bot' }).click();
    await expect(page.locator('.seat-bot')).toHaveCount(1);
    await page.getByRole('button', { name: 'Add a bot' }).click();
    await expect(page.locator('.seat-bot')).toHaveCount(2);
    await page.getByRole('button', { name: 'Remove a bot' }).click();
    await expect(page.locator('.seat-bot')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

async function hotJokerWith(page, bots) {
  await page.goto('/hot-joker.html');
  await page.fill('#tk-name', 'Host');
  await page.getByRole('button', { name: 'Create a Room' }).click();
  await expect(page.locator('.large-code')).toBeVisible();
  for (let i = 1; i <= bots; i++) { await page.getByRole('button', { name: 'Add a bot' }).click(); await expect(page.locator('.seat-bot')).toHaveCount(i); }
  await page.getByRole('button', { name: 'START GAME' }).click();
  await expect(page.locator('.circle')).toBeVisible();
}
const overlap = (a, b) => a.x < b.x + b.width - 2 && b.x < a.x + a.width - 2 && a.y < b.y + b.height - 2 && b.y < a.y + a.height - 2;

for (const [label, size, bots] of [['desktop', { width: 1200, height: 900 }, 4], ['phone', { width: 360, height: 760 }, 4], ['desktop full table', { width: 1200, height: 900 }, 9], ['phone full table', { width: 360, height: 760 }, 9]]) {
  test('Last Laugh circle, ' + label + ' with ' + (bots + 1) + ' players: seats do not overlap, pairs are shown, no pair stays in hand', async ({ page }) => {
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


test('Last Laugh starts with three players and always lays down pairs',async({page})=>{
  await page.goto('/hot-joker.html');await page.fill('#tk-name','Host');
  await page.getByRole('button',{name:'Create a Room',exact:true}).click();
  const start=page.getByRole('button',{name:'START GAME',exact:true});
  await expect(start).toBeDisabled();
  await expect(page.getByText('Pairs Only · Match two cards with the same number or face.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Add a bot',exact:true}).click();await expect(start).toBeDisabled();
  await page.getByRole('button',{name:'Add a bot',exact:true}).click();await expect(start).toBeEnabled();
  await expect(page.getByRole('button',{name:/four of a kind/i})).toHaveCount(0);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'Settings',exact:true});
  await expect(settings.getByText('Turn Timer',{exact:true})).toBeVisible();await expect(settings.getByRole('button',{name:/four of a kind/i})).toHaveCount(0);
  await settings.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('.pfg-btn').click();await expect(page.locator('.pfg-body')).not.toContainText('four of a kind');await page.locator('.pfg-x').click();
  const response=page.waitForResponse(r=>r.url().endsWith('/api/hot-joker') && r.request().method()==='POST' && r.request().postDataJSON().action==='start');
  await start.click();const data=await (await response).json();
  expect(data.minPlayers).toBe(3);expect(data.settings.setSize).toBe(2);expect(data.order).toHaveLength(3);expect(data.sets.every(set=>set.cards.length===2)).toBe(true);
  await expect(page.locator('.circle-seat')).toHaveCount(3);
});

test('Last Laugh name appears in catalogue, title, hero and both Chinese variants',async({page})=>{
  await page.goto('/?games=1');
  await page.getByRole('link',{name:/Last Laugh/}).click();
  await expect(page).toHaveURL(/\/hot-joker\.html$/);
  await expect(page).toHaveTitle('Last Laugh · The Game Room');
  await expect(page.locator('.header-brand-copy b')).toHaveText('LAST LAUGH');
  await expect(page.locator('.tk-intro h1')).toContainText('Last');
  await expect(page.locator('.tk-intro h1 em')).toHaveText('Laugh.');
  for(const [lang,title] of [['zh','笑到最后'],['zht','笑到最後'],['en','LAST LAUGH']]){
    await page.evaluate(lang=>GameI18n.set(lang),lang);
    await expect(page.locator('.header-brand-copy b')).toHaveText(title);
  }
});
