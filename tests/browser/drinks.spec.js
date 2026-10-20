const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const source = (file) => fs.readFileSync(path.join(__dirname, '../../src', file), 'utf8');

for (const kind of ['last-ready', 'auto-placed', 'row']) {
  for (const finish of ['player', 'host']) {
    test(`${kind} drinks end with Cheers after ${finish} completion`, async ({ page }) => {
      await page.clock.install();
      await page.setContent('<style>' + source('styles.css') + '</style>');
      await page.addScriptTag({ content: source('cards.js') });
      await page.addScriptTag({ content: `
        var st, session = {}, lang = 'en';
        var SND = { play(sound) { window.sounds.push(sound); } };
        window.sounds = [];
        var activePlayers = () => st.players;
        var serverNow = () => Date.now();
        var atkHeld = new Set();
        var t = key => key;
        var avatarEl = () => document.createElement('span');
        var avOf = () => '', accOf = () => '', bdOf = () => '';
        var icon = () => document.createElement('span');
        var buzz = () => {}, act = () => {};
      ` });
      await page.addScriptTag({ content: source('results.js') });
      await page.evaluate(({ kind, finish }) => {
        st = {
          settings: { drink: true }, phase: 'dealt', meId: 'p', isHost: finish === 'host',
          players: [{ id: 'p', name: 'Player' }], drunk: {},
          allReady: { at: Date.now() - 3000, timer: kind === 'auto-placed' },
          latePen: kind === 'row' ? {} : { p: 2 },
          rowResults: kind === 'row' ? [{ row: 0, losers: ['p'], penalty: 2, at: Date.now() - 3000 }] : [],
        };
        syncDrinkUi();
      }, { kind, finish });
      await expect(page.locator('.drinkfx')).toBeVisible();
      await page.locator(finish === 'host' ? '.dkskip' : '.dkbtn').click();
      await expect(page.locator('.dkp.drain')).toHaveCount(1);
      await page.clock.runFor(1150);
      await expect(page.locator('.drinkfx.cheers')).toBeVisible();
      await expect(page.locator('.dkcheer')).toBeVisible();
      expect(await page.evaluate(() => window.sounds.filter(s => s === 'chime').length)).toBe(1);
      await page.clock.runFor(1500);
      await expect(page.locator('.drinkfx')).toHaveCount(0);
    });
  }
}
