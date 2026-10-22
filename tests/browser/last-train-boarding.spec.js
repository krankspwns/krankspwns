const { test, expect } = require('@playwright/test');
const { call } = require('../helpers');
const handler = require('../../api/last-train');
const rules = require('../../lib/last-train-rules');
const store = require('../../lib/last-train-store');

async function boarding(browser, { reducedMotion = 'no-preference', blockedDownload = false, blockedAutoplay = false } = {}) {
  const headers = { 'x-forwarded-for': test.info().testId };
  const make = async body => {
    const result = await call(handler, { requestId: crypto.randomUUID(), ...body }, {}, headers);
    expect(result.s).toBe(200); return result.j;
  };
  const host = await make({ action: 'create', name: 'Boarding host' });
  for (let i = 1; i < 12; i++) await make({ action: 'join', code: host.code, name: 'Traveller ' + i });
  const room = await store.load(host.code);
  rules.start(room); rules.board(room);
  Object.assign(room, { paused: true, pauseRemaining: 3000, deadline: null });
  await store.save(room);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion });
  const owner = { code: host.code, pid: host.meId, tok: host.tok };
  await context.addInitScript(seat => localStorage.setItem('lt-seat', JSON.stringify(seat)), owner);
  if (blockedAutoplay) await context.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      return this.classList.contains('boarding-video') ? Promise.reject(new DOMException('Autoplay blocked', 'NotAllowedError')) : play.call(this);
    };
  });
  await context.route('**/api/last-train**', async route => {
    const req = route.request(), url = new URL(req.url());
    const result = await call(handler, req.method() === 'POST' ? JSON.parse(req.postData()) : null, Object.fromEntries(url.searchParams), { ...req.headers(), ...headers });
    await route.fulfill({ status: result.s, contentType: 'application/json', body: JSON.stringify(result.j) });
  });
  if (blockedDownload) await context.route('**/last-train/boarding.mp4', route => route.abort());
  const page = await context.newPage(), errors = [], mediaRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().endsWith('/boarding.mp4')) mediaRequests.push(request.url()); });
  await page.goto('/last-train.html');
  await expect(page.locator('#lt-app')).toHaveAttribute('data-phase', 'boarding');
  return { page, context, errors, mediaRequests, host, post: async action => {
    const current = await store.load(host.code);
    return make({ action, ...owner, match: current.match, round: current.round, step: current.step });
  } };
}

test('boarding video seeks on reload, survives updates, pauses and resumes on server time', async ({ browser }, info) => {
  const b = await boarding(browser), { page } = b;
  try {
    const video = page.locator('.boarding-video');
    await expect.poll(() => video.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
    await expect.poll(() => video.evaluate(v => Math.abs(v.currentTime - 3))).toBeLessThan(.1);
    expect(await video.evaluate(v => ({ paused: v.paused, muted: v.muted, inline: v.playsInline, loop: v.loop, audio: v.audioTracks?.length || 0 }))).toEqual({ paused: true, muted: true, inline: true, loop: false, audio: 0 });
    await page.evaluate(() => { window.savedBoardingVideo = document.querySelector('.boarding-video'); });
    const room = await store.load(b.host.code); room.notice = 'Manifest confirmed'; await store.save(room);
    await expect(page.locator('.waiting')).toContainText('Manifest confirmed');
    expect(await video.evaluate(v => v === window.savedBoardingVideo)).toBe(true);
    await b.post('resume');
    await expect.poll(() => video.evaluate(v => v.paused)).toBe(false);
    await b.post('pause');
    await expect(page.locator('#lt-app')).toHaveAttribute('data-paused', 'true');
    await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
    expect(await video.evaluate(v => v === window.savedBoardingVideo)).toBe(true);
    const pausedTime = await video.evaluate(v => v.currentTime);
    await page.waitForTimeout(650);
    expect(Math.abs(await video.evaluate(v => v.currentTime) - pausedTime)).toBeLessThan(.1);
    await page.reload();
    await expect.poll(() => page.locator('.boarding-video').evaluate((v, time) => Math.abs(v.currentTime - time), pausedTime)).toBeLessThan(.15);
    expect(await page.locator('.boarding-video').evaluate(v => getComputedStyle(v).objectFit)).toBe('contain');
    expect(await page.locator('.platform-scene').evaluate(scene => getComputedStyle(scene).opacity)).toBe('1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.boarding-person')).toHaveCount(12);
    const manifestFits = () => page.locator('.platform-scene').evaluate(scene => [...scene.querySelectorAll('.boarding-person')].every(person => person.getBoundingClientRect().bottom <= scene.getBoundingClientRect().bottom));
    expect(await manifestFits()).toBe(true);
    await page.screenshot({ path: info.outputPath('boarding-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1240, height: 960 });
    expect(await manifestFits()).toBe(true);
    await page.screenshot({ path: info.outputPath('boarding-desktop.png'), fullPage: true });
    await b.post('resume');
    await expect(page.locator('#lt-app')).toHaveAttribute('data-phase', 'settling', { timeout: 7000 });
    await expect(page.locator('.boarding-video')).toHaveCount(0);
    expect(b.errors).toEqual([]);
  } finally { await b.context.close(); }
});

for (const variant of ['reduced motion', 'failed download', 'blocked autoplay']) {
  test('boarding continues on schedule with ' + variant, async ({ browser }) => {
    const b = await boarding(browser, { reducedMotion: variant === 'reduced motion' ? 'reduce' : 'no-preference', blockedDownload: variant === 'failed download', blockedAutoplay: variant === 'blocked autoplay' });
    try {
      await expect(b.page.locator('.boarding-poster')).toBeVisible();
      if (variant === 'reduced motion') {
        await expect(b.page.locator('.boarding-video')).toHaveCount(0);
        expect(b.mediaRequests).toEqual([]);
      } else if (variant === 'failed download') await expect(b.page.locator('.boarding-video')).toBeHidden();
      await b.post('resume');
      if (variant === 'blocked autoplay') await expect(b.page.locator('.boarding-video')).toBeHidden();
      await expect(b.page.locator('#lt-app')).toHaveAttribute('data-phase', 'settling', { timeout: 7000 });
      expect(b.errors).toEqual([]);
    } finally { await b.context.close(); }
  });
}
