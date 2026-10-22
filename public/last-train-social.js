/* Reactions, the shop and throwables. Artwork comes from Row of Reckoning (window.TRAIN_ART).
   The wallet is this room's own Last Train wallet. Nothing here is tied to a turn, and nothing works at night. */
(() => {
  'use strict';
  window.createTrainSocial = ({ dock, request, onState, sfx }) => {
    const ART = window.TRAIN_ART, motionOK = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    let state = null, owner = null, fab = null, tray = null, trayTab = 'emotes', shop = null, shopTab = 'frames', throwItem = null;
    let emoteSeen = null, giftSeen = null, roomKey = '', lastEmote = 0, giftQ = [], giftRun = false, uniq = 0;
    const FRAME_NAMES = { silver: 'Silver', gold: 'Gold', emerald: 'Emerald', ice: 'Ice', neon: 'Neon', royal: 'Royal', fire: 'Fire', rainbow: 'Rainbow' };
    const GIFT_NAMES = { tomato: 'Tomato', rose: 'Rose', snowball: 'Snowball', popper: 'Popper', balloon: 'Balloon', kiss: 'Kiss', pie: 'Pie', bomb: 'Bomb', fireworks: 'Fireworks' };
    const EMOTE_NAMES = { laugh: 'Laugh', wow: 'Wow', cry: 'Cry', think: 'Think', angry: 'Angry', cool: 'Cool', sus: 'Suspicious', shh: 'Shh', eyes: 'Watching you', heart: 'Heart', oof: 'Oof', rip: 'RIP', aiyo: 'Aiyo', steady: 'Steady', faster: 'Faster', gg: 'Good game', wp: 'Well played', gl: 'Good luck' };
    const NEW_EMOTES = new Set(['sus', 'shh', 'eyes']);
    const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
    const button = (cls, label, click) => { const b = node('button', cls); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.onclick = click; return b; };
    // Gradients inside each SVG need their own ids, or the first copy on the page paints every later one.
    function svg(inner, cls = '') {
      const n = ++uniq, html = inner.replace(/id="([^"]+)"/g, (m, id) => 'id="' + id + '-' + n + '"').replace(/url\(#([^)]+)\)/g, (m, id) => 'url(#' + id + '-' + n + ')');
      const s = node('span', 'art48 ' + cls); s.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true">' + html + '</svg>'; return s;
    }
    const player = id => state?.players.find(p => p.id === id);
    function portrait(p, cls = '') {
      const i = p?.avatarIndex ?? 0, face = node('span', 'portrait portrait-passengers ' + (p?.frame ? 'has-frame bd-' + p.frame + ' ' : '') + cls);
      face.style.setProperty('--px', (i % 4) * 100 / 3 + '%'); face.style.setProperty('--py', Math.floor(i / 4) * 50 + '%'); face.setAttribute('aria-hidden', 'true');
      return face;
    }
    const wallet = () => state?.me.wallet || { wp: 0, frames: [], frame: '', gifts: {} };
    const owned = () => Object.values(wallet().gifts || {}).reduce((a, n) => a + Math.max(0, n), 0);
    async function act(action, extra) {
      const snapshot = { owner, state };
      try { const data = await request(action, extra, snapshot.owner, snapshot.state); onState(data, snapshot.owner); return data; }
      catch (e) { toast(e.message || 'Please try again.'); sfx.play('tie'); return null; }
    }
    function toast(text, extra) {
      let lane = document.querySelector('.social-toasts'); if (!lane) { lane = node('div', 'social-toasts'); lane.setAttribute('role', 'status'); document.body.append(lane); }
      while (lane.children.length >= 3) lane.firstChild.remove();
      const t = node('div', 'social-toast'); if (extra) t.append(extra); t.append(node('span', '', text)); lane.append(t);
      setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3200);
    }
    // Where a player sits on screen right now: their lounge seat, else their roster portrait.
    function anchor(id) {
      if (!id || !/^[\w-]+$/.test(id)) return null;
      for (const sel of [`.lounge-seat[data-player="${id}"] .seated-traveller`, `.cabin-person[data-player="${id}"]`, `.lt-roster [data-player="${id}"] .portrait`]) {
        for (const n of document.querySelectorAll(sel)) { const r = n.getBoundingClientRect(); if (r.width && r.bottom > 30 && r.top < innerHeight - 60) return n; }
      }
      return null;
    }
    function floatEmote(id, key) {
      if (document.hidden || !ART.emotes[key]) return;
      const p = player(id), at = anchor(id), bubble = node('div', 'emote-float' + (p && !p.alive && !['lobby', 'finished'].includes(state.phase) ? ' ghost' : ''));
      bubble.append(svg(ART.emotes[key]));
      if (at) {
        const r = at.getBoundingClientRect(), seat = at.classList.contains('seated-traveller');
        bubble.style.left = r.left + r.width / 2 + 'px'; bubble.style.top = (seat ? r.top + r.height * .12 : r.top) + 'px';
        if (!seat) bubble.classList.add('small');
      } else {
        // Nobody to point at on screen: float up the side with their face and name.
        bubble.classList.add('lane'); bubble.prepend(portrait(p, 'mini'), node('small', '', p?.name || ''));
        bubble.style.left = (18 + Math.random() * 46) + '%'; bubble.style.top = (innerHeight - 160) + 'px';
      }
      document.body.append(bubble); setTimeout(() => bubble.remove(), 2600);
    }
    function sendEmote(key) {
      if (Date.now() - lastEmote < 900 || !state?.socialOpen) return;
      lastEmote = Date.now(); floatEmote(state.meId, key); sfx.emote(key); closeTray();
      request('emote', { e: key }, owner, state).catch(() => {});
    }
    // ---- throws ----
    const GIFT_MS = { tomato: 1900, pie: 1900, snowball: 1900, rose: 2100, popper: 1900, balloon: 1900, kiss: 2100, bomb: 2100, fireworks: 2100 };
    function queueGift(g) { if (giftQ.length >= 4) giftQ.shift(); giftQ.push(g); runGiftQ(); }
    function runGiftQ() {
      if (giftRun || !giftQ.length) return;
      const g = giftQ.shift(); giftRun = true;
      const from = player(g.from), to = player(g.to);
      toast((g.from === state.meId ? 'You' : from?.name || 'Someone') + ' threw ' + (GIFT_NAMES[g.item] || '').toLowerCase() + ' at ' + (g.to === state.meId ? 'you' : to?.name || 'someone'), portrait(from, 'mini'));
      flyGift(g);
      setTimeout(() => { giftRun = false; runGiftQ(); }, (GIFT_MS[g.item] || 1900) + (giftQ.length ? 250 : 0));
    }
    function flyGift(g) {
      const kind = ART.giftKinds[g.item] || ['', 'splat', '#e8352e'], style = kind[1], color = kind[2] || '#fff';
      const W = innerWidth, H = innerHeight, rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
      const point = n => { if (!n) return null; const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * (n.classList.contains('seated-traveller') ? .3 : .5)]; };
      const start = point(g.from === state.meId ? fab : anchor(g.from)) || [W - 40, H - 120];
      let target = anchor(g.to), end = point(target) || [W / 2, H * .3];
      const impactSound = style === 'boom' ? 'boom' : ['petals', 'kiss'].includes(style) ? 'chime' : ['splat', 'splash'].includes(style) ? 'splat' : 'pop';
      sfx.play('throw');
      const flinch = () => { const seat = target?.closest('.lounge-seat, .lt-roster-person') || target; try { seat?.animate([{ transform: 'none' }, { transform: 'translateX(-5px) rotate(-1.5deg)' }, { transform: 'translateX(5px) rotate(1.5deg)' }, { transform: 'none' }], { duration: 420 }); } catch {} };
      if (!motionOK) { setTimeout(() => { sfx.play(impactSound); flinch(); }, 500); return; }
      const fx = node('div', 'giftfx'); document.body.append(fx);
      const anim = (n, frames, opt) => { try { return n.animate(frames, opt); } catch { return null; } };
      const box = (css, html = '') => { const d = node('i', 'giftbit'); d.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;' + css; if (html) d.innerHTML = html; fx.append(d); return d; };
      const [x0, y0] = start; let [x1, y1] = end;
      const spray = (n, o = {}) => { const { cols = [color], spd = [60, 150], life = [500, 900], size = [4, 8], g: grav = 140, round = true, rect = false } = o;
        for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), v = rnd(spd[0], spd[1]), L = rnd(life[0], life[1]), sz = rnd(size[0], size[1]);
          const d = box(`width:${rect ? sz * 1.6 : sz}px;height:${sz}px;background:${pick(cols)};border-radius:${round ? '50%' : '2px'}`);
          anim(d, [{ transform: `translate(${x1}px,${y1}px)`, opacity: 1 }, { transform: `translate(${x1 + Math.cos(a) * v}px,${y1 + Math.sin(a) * v + grav * .5}px) rotate(${rnd(-360, 360)}deg)`, opacity: 0 }], { duration: L, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }); } };
      const ring = (c, sz = 70, ms = 420) => { const d = box(`width:${sz}px;height:${sz}px;margin:${-sz / 2}px 0 0 ${-sz / 2}px;border-radius:50%;border:3px solid ${c}`); anim(d, [{ transform: `translate(${x1}px,${y1}px) scale(.2)`, opacity: .9 }, { transform: `translate(${x1}px,${y1}px) scale(1)`, opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' }); };
      const blob = (c, sz = 50, stay = 1400) => { const d = box(`width:${sz}px;height:${sz * .9}px;margin:${-sz / 2}px 0 0 ${-sz / 2}px;border-radius:48% 52% 45% 55% / 55% 45% 55% 45%;background:radial-gradient(circle at 35% 30%, #fff8, ${c} 55%)`);
        anim(d, [{ transform: `translate(${x1}px,${y1}px) scale(.2)`, opacity: 1 }, { transform: `translate(${x1}px,${y1}px) scale(1.15)`, opacity: 1, offset: .22 }, { transform: `translate(${x1}px,${y1 + 6}px) scale(1)`, opacity: 1, offset: .75 }, { transform: `translate(${x1}px,${y1 + 14}px) scale(.95)`, opacity: 0 }], { duration: stay, fill: 'forwards' }); };
      const impact = () => {
        sfx.play(impactSound); flinch();
        if (style === 'splat') { blob(color); spray(8, { spd: [50, 110], size: [3, 7], g: 120 }); }
        else if (style === 'petals') { spray(10, { cols: ['#ff4d6d', '#ff8fb8', '#ffc2d4'], spd: [30, 80], life: [900, 1400], size: [5, 9], g: 90, round: false }); }
        else if (style === 'confetti') spray(18, { cols: ['#ffd23f', '#ff5a8a', '#4fc3ff', '#7be08f', '#b77bff'], spd: [70, 170], life: [800, 1300], size: [4, 7], g: 160, rect: true, round: false });
        else if (style === 'boom') { ring('#ffb02e', 84, 380); blob('#ff7a1f', 46, 500); spray(10, { cols: ['#ffd23f', '#ff7a1f', '#555'], spd: [70, 150], g: 80 }); }
        else if (style === 'fireworks') { ring('#fff', 56, 380); spray(16, { cols: ['#ff4d8d', '#ffd23f', '#4fc3ff', '#fff'], spd: [70, 140], g: 60, size: [3, 6] }); }
        else if (style === 'splash') { ring('#8fd0ff', 74, 420); spray(14, { cols: ['#3aa8ff', '#8fd0ff', '#ffffff'], spd: [60, 150], g: 220, size: [3, 7] }); }
        else if (style === 'kiss') { const k = box('font-size:28px;line-height:1', '💋'); anim(k, [{ transform: `translate(${x1 - 14}px,${y1 - 14}px) scale(1.8)`, opacity: 0 }, { transform: `translate(${x1 - 14}px,${y1 - 14}px) scale(1)`, opacity: 1, offset: .25 }, { transform: `translate(${x1 - 14}px,${y1 - 14}px) scale(1)`, opacity: 1, offset: .75 }, { transform: `translate(${x1 - 14}px,${y1 - 14}px)`, opacity: 0 }], { duration: 1300, fill: 'forwards' }); spray(8, { cols: ['#ff3d7f', '#ff8fb8'], spd: [40, 90], size: [4, 7] }); }
        else spray(8, {});
        if (g.to === state.meId) document.body.animate?.([{ transform: 'none' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(3px,-2px)' }, { transform: 'none' }], { duration: 300 });
      };
      const proj = svg(ART.gifts[g.item] || ART.gifts.tomato, 'gift-projectile'); fx.append(proj);
      const dist = Math.hypot(x1 - x0, y1 - y0), dur = Math.round(Math.min(780, Math.max(460, dist * .9))), arc = -Math.min(120, dist * .32), t0 = performance.now();
      const step = now => {
        const k = Math.min(1, (now - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const moved = point(anchor(g.to)); if (moved) [x1, y1] = moved; // follows the target if the page moves
        const x = x0 + (x1 - x0) * e, y = y0 + (y1 - y0) * e + arc * 4 * e * (1 - e);
        proj.style.transform = `translate(${x - 18}px,${y - 18}px) scale(${(.6 + .5 * Math.sin(Math.PI * Math.min(1, k * 1.1))).toFixed(2)}) rotate(${(k * 380).toFixed(0)}deg)`;
        if (k < 1) requestAnimationFrame(step); else { target = anchor(g.to); proj.remove(); impact(); setTimeout(() => fx.remove(), 1900); }
      };
      requestAnimationFrame(step);
    }
    async function sendThrow(item, targetId) {
      closeTray(); closeShop();
      const g = { from: state.meId, to: targetId, item }; queueGift(g);
      await act('throw', { item, targetId });
    }
    // ---- tray: reactions and throws ----
    function closeTray() { tray?.remove(); tray = null; throwItem = null; fab?.setAttribute('aria-expanded', 'false'); }
    function renderTray() {
      if (!tray) return;
      tray.replaceChildren();
      const head = node('div', 'tray-tabs');
      for (const [k, label] of [['emotes', 'Reactions'], ['throw', 'Throw' + (owned() ? ' · ' + owned() : '')]]) {
        const t = button('tray-tab' + (trayTab === k ? ' on' : ''), null, () => { trayTab = k; throwItem = null; renderTray(); }); t.textContent = label; t.setAttribute('aria-pressed', String(trayTab === k)); head.append(t);
      }
      tray.append(head);
      if (!state.socialOpen) { tray.append(node('p', 'tray-note', 'Reactions rest at night, so nobody gives away a secret move. They return in the lounge.')); return; }
      if (trayTab === 'emotes') {
        const grid = node('div', 'emote-grid');
        for (const key of state.emoteKeys) { const b = button('emote-cell' + (NEW_EMOTES.has(key) ? ' new' : ''), EMOTE_NAMES[key], () => sendEmote(key)); b.append(svg(ART.emotes[key])); grid.append(b); }
        tray.append(grid);
        if (!state.me.alive && !['lobby', 'finished'].includes(state.phase)) tray.append(node('p', 'tray-note', 'You are out. Your reactions show faded, like a ghost.'));
        return;
      }
      if (!state.me.alive && !['lobby', 'finished'].includes(state.phase)) { tray.append(node('p', 'tray-note', 'Players who are out can only react.')); return; }
      const gifts = Object.entries(wallet().gifts || {}).filter(([, n]) => n > 0);
      if (!gifts.length) { tray.append(node('p', 'tray-note', 'You have nothing to throw yet.')); const s = button('tray-shop gold', null, () => { closeTray(); openShop('gifts'); }); s.textContent = 'Visit the shop'; tray.append(s); return; }
      if (!throwItem || !(wallet().gifts[throwItem] > 0)) throwItem = gifts[0][0];
      const items = node('div', 'throw-items');
      for (const [k, n] of gifts) { const b = button('throw-item' + (throwItem === k ? ' on' : ''), GIFT_NAMES[k], () => { throwItem = k; renderTray(); }); b.append(svg(ART.gifts[k]), node('small', '', '×' + n)); items.append(b); }
      tray.append(items, node('p', 'tray-label', 'Throw ' + GIFT_NAMES[throwItem].toLowerCase() + ' at'));
      const people = node('div', 'throw-people');
      for (const p of state.players.filter(p => !p.departed && (p.id !== state.meId || wallet().tester))) {
        const b = button('throw-person', 'Throw at ' + p.name, () => sendThrow(throwItem, p.id)); b.append(portrait(p), node('span', '', p.id === state.meId ? 'You' : p.name)); people.append(b);
      }
      tray.append(people);
    }
    function toggleTray() {
      if (tray) return closeTray();
      tray = node('div', 'emote-tray'); tray.setAttribute('role', 'dialog'); tray.setAttribute('aria-label', 'Reactions and throws');
      tray.onclick = e => e.stopPropagation(); document.body.append(tray); fab.setAttribute('aria-expanded', 'true'); renderTray();
    }
    document.addEventListener('click', e => { if (tray && !e.target.closest?.('.emote-tray, .emote-fab')) closeTray(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && tray) closeTray(); });
    // ---- shop ----
    function closeShop() { shop?.close(); }
    function renderShop() {
      if (!shop) return;
      const w = wallet(), body = shop.querySelector('.shop-body');
      shop.querySelector('.shop-wp').textContent = w.wp + ' WP';
      shop.querySelectorAll('.shop-tab').forEach(t => { t.classList.toggle('on', t.dataset.tab === shopTab); t.setAttribute('aria-selected', String(t.dataset.tab === shopTab)); });
      body.replaceChildren();
      body.append(node('p', 'shop-note', shopTab === 'frames' ? 'A ring around your portrait, seen by everyone in this room: the roster, letters, Players list and the finale.' : 'Each pack is ' + state.prices.uses + ' throws. Throw from the reaction button in the lounge. Never at night.'));
      const grid = node('div', 'shop-grid');
      const items = shopTab === 'frames' ? Object.entries(state.prices.frames) : Object.entries(state.prices.gifts);
      items.sort((a, b) => a[1] - b[1]);
      for (const [key, price] of items) {
        const mine = shopTab === 'frames' ? w.frames.includes(key) : (w.gifts[key] || 0), wearing = shopTab === 'frames' && w.frame === key;
        const card = button('shop-item' + (wearing ? ' wearing' : '') + (mine ? ' owned' : ''), null, async () => {
          if (shopTab === 'frames' && mine) { await act('wear', { frame: wearing ? '' : key }); sfx.play('pop'); return; }
          if (w.wp < price) { toast('You need ' + (price - w.wp) + ' more WP. Win journeys, vote out Saboteurs and stay aboard to earn more.'); return; }
          const done = await act('buy', { kind: shopTab === 'frames' ? 'frame' : 'gift', key }); if (done) { sfx.play('buy'); card.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 320 }); }
        });
        if (shopTab === 'frames') { const f = portrait({ ...state.players.find(p => p.id === state.meId), frame: key }, 'shop-frame'); card.append(f); }
        else card.append(svg(ART.gifts[key], 'shop-gift'));
        card.append(node('b', '', shopTab === 'frames' ? FRAME_NAMES[key] : GIFT_NAMES[key]));
        card.append(node('small', 'shop-price' + (mine && shopTab === 'frames' ? ' own' : ''), shopTab === 'frames' && mine ? (wearing ? 'Wearing' : 'Wear') : price + ' WP'));
        if (shopTab === 'gifts' && mine) card.append(node('span', 'shop-count', '×' + mine));
        card.setAttribute('aria-label', (shopTab === 'frames' ? FRAME_NAMES[key] + ' frame' : GIFT_NAMES[key]) + (shopTab === 'frames' && mine ? wearing ? ', wearing. Take off' : ', owned. Wear it' : ', ' + price + ' WP'));
        grid.append(card);
      }
      body.append(grid);
      const earned = w.earnings || [];
      if (earned.length) { const list = node('details', 'shop-earned'); list.append(node('summary', '', 'Earned this journey · +' + earned.reduce((a, e) => a + e.n, 0) + ' WP')); for (const e of earned) list.append(node('p', '', '+' + e.n + ' · ' + e.reason)); body.append(list); }
      const how = node('details', 'shop-how'); how.append(node('summary', '', 'How to earn WP'));
      for (const line of ['Your team wins: +15 (5–7 players), +20 (8–10), +25 (11–12)', 'Still aboard at the end: +5', 'Your vote removes a Saboteur: +5', 'Saboteurs: a good player is voted out: +5', 'Everyone starts with 25 WP. WP stays in this room only.']) how.append(node('p', '', line));
      body.append(how);
    }
    function openShop(tab) {
      if (!state || shop) return;
      if (tab) shopTab = tab;
      shop = node('dialog', 'shop-sheet'); shop.setAttribute('aria-labelledby', 'shop-title');
      const head = node('header', 'shop-head'), title = node('h2', '', 'Shop'); title.id = 'shop-title';
      const wp = node('b', 'shop-wp'), x = button('shop-close', 'Close shop', closeShop); x.textContent = '×';
      head.append(title, node('span', 'shop-spacer'), node('small', '', 'Your wallet'), wp, x);
      const tabs = node('div', 'shop-tabs'); tabs.setAttribute('role', 'tablist');
      for (const [k, label] of [['frames', 'Frames'], ['gifts', 'Throwables']]) { const t = button('shop-tab', null, () => { shopTab = k; renderShop(); }); t.dataset.tab = k; t.setAttribute('role', 'tab'); t.textContent = label; tabs.append(t); }
      shop.append(head, tabs, node('div', 'shop-body'));
      shop.addEventListener('click', e => { if (e.target === shop) closeShop(); });
      shop.addEventListener('close', () => { shop.remove(); shop = null; });
      document.body.append(shop); renderShop(); shop.showModal(); x.focus({ preventScroll: true });
    }
    function sync(next, seat) {
      const key = next && seat ? next.code + ':' + seat.pid : '';
      if (key !== roomKey) { roomKey = key; emoteSeen = giftSeen = null; closeTray(); closeShop(); }
      state = next; owner = seat;
      if (!key) { fab?.remove(); fab = null; return; }
      if (!fab) {
        fab = button('emote-fab', 'Reactions and throws', e => { e.stopPropagation(); toggleTray(); });
        fab.setAttribute('aria-haspopup', 'dialog'); fab.setAttribute('aria-expanded', 'false'); fab.append(svg(ART.emotes.laugh));
        fab.append(node('b', 'fab-badge')); dock.append(fab);
      }
      fab.classList.toggle('resting', !state.socialOpen);
      const badge = fab.querySelector('.fab-badge'), n = owned(); badge.hidden = !n || !state.socialOpen; badge.textContent = String(n);
      if (emoteSeen === null) emoteSeen = state.emoteN; else {
        const fresh = state.emotes.filter(x => x.n > emoteSeen && x.id !== state.meId && state.now - x.at < 6000);
        for (const x of fresh) { floatEmote(x.id, x.e); sfx.emote(x.e); }
        emoteSeen = Math.max(emoteSeen, state.emoteN);
      }
      if (giftSeen === null) giftSeen = state.giftN; else {
        for (const g of state.gifts.filter(g => g.n > giftSeen && g.from !== state.meId && state.now - g.at < 8000)) queueGift(g);
        giftSeen = Math.max(giftSeen, state.giftN);
      }
      if (tray) renderTray(); if (shop) renderShop();
    }
    return { sync, openShop, portrait, svg };
  };
})();
