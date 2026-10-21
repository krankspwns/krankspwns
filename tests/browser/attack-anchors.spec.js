const { test, expect } = require('@playwright/test');
for (const style of ['ice', 'blackhole']) {
  test(`${style} stays attached to vertically stacked targets during scrolling`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 390, height: 600 });
    await page.goto('/reckoning.html');
    await page.evaluate(style => {
      clearTimeout(timer); rtClose(); session = null; render = () => {};
      ui.calm = false; SND.setMode(0); document.body.classList.remove('calm', 'autocalm');
      const entries = [
        { id: 'winner', name: 'Alex', cards: ['QS','KS','AS'], hand: 'royal' },
        { id: 'first', name: 'Jamie', cards: ['2H','5C','8D'], hand: 'none' },
        { id: 'second', name: 'Taylor', cards: ['2D','5H','8C'], hand: 'none' },
      ];
      st = { code: 'TEST', round: 1, phase: 'dealt', meId: 'winner', settings: {}, rowResults: [], players: entries.map(e => ({ ...e, ready: true, avatar: 'fox', board: e.cards.map(c => ({ c, up: true })) })) };
      ATK_STYLES.fill(style);
      const grid = el('div', { class: 'tiles', style: 'grid-template-columns:1fr;gap:350px;padding-top:200px;padding-bottom:600px' }, ...entries.map(e => el('article', { class: 'tile', 'data-pid': e.id, style: 'height:240px;position:relative' }, el('div', { class:'tcards' }, ...e.cards.map(c => cardEl(c))), el('span', { class:'tstat pend' }))));
      app.replaceChildren(el('section', { class:'stage' }, grid));
      atkHeld.clear(); atkHeld.add('first'); atkHeld.add('second');
      window.anchorErrors = []; window.anchorDraws = 0; window.observeAnchors = true;
      const error = (g, y, edge) => {
        if (!window.observeAnchors) return;
        const transform = g.getTransform(), actual = y * transform.d + transform.f;
        const expected = ['first','second'].map(id => { const r=document.querySelector(`[data-pid="${id}"]`).getBoundingClientRect(); return edge ? r.top : r.top+r.height/2; });
        window.anchorErrors.push(Math.min(...expected.map(v => Math.abs(v-actual))));
        window.anchorDraws++;
      };
      if (style === 'blackhole') {
        const paint = paintBlackHole;
        paintBlackHole = (g,x,y,...args) => { error(g,y,false); return paint(g,x,y,...args); };
      } else {
        const roundRect = CanvasRenderingContext2D.prototype.roundRect;
        CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,...args) {
          if (Math.abs(h-240)<1) error(this,y,true);
          return roundRect.call(this,x,y,w,h,...args);
        };
      }
      window.attackFinished = false;
      runShowdown({ row:3, penalty:3, losers:['first','second'], entries }).then(() => { window.attackFinished=true; });
    }, style);
    await page.waitForFunction(() => window.anchorDraws > 8);
    await page.evaluate(() => { window.anchorErrors=[]; window.scrollBy(0,120); });
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => Math.max(...window.anchorErrors))).toBeLessThan(3);
    await page.evaluate(() => { window.observeAnchors=false; });
    await page.waitForFunction(() => window.attackFinished, { timeout: 25000 });
    await expect(page.locator('.tile.lose')).toHaveCount(2);
    await expect(page.locator('.atkfx')).toHaveCount(0);
  });
}
