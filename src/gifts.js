// ---- gifts: three throws per purchase, played on every phone like a live gift ----
let giftTrayOpen = false, giftPick = null, giftSeen = null, giftLast = 0;
const myGifts = () => (st && st.wallet && st.wallet.gifts) || {};
const giftTotal = () => Object.values(myGifts()).reduce((a, n) => a + (n > 0 ? n : 0), 0);
// opened a moment later: the tap that asked for it is still travelling up the page, and the outside-tap handler would close the tray again
function openGiftTray(item) { setTimeout(() => { giftTrayOpen = true; giftPick = item || null; syncEmoteUi(); }, 30); }
let giftTraySig = '';
function syncGiftUi() {
  const show = !!(session && st) && giftTotal() > 0 && (st.players.length > 1 || (st.prices && st.prices.test));   // alone? only while the shop is in testing mode
  let fab = document.getElementById('giftFab');
  if (!show) { fab?.remove(); document.getElementById('giftTray')?.remove(); giftTrayOpen = false; giftPick = null; return; }
  if (!fab) { fab = el('button', { id: 'giftFab', type: 'button', class: 'emotefab giftfab', 'aria-label': t('giftTitle'), title: t('giftTitle'), onclick: (e) => { e.stopPropagation(); giftTrayOpen = !giftTrayOpen; giftPick = null; giftTarget = null; syncEmoteUi(); } }, colorIcon(GIFT_ICON, 30), el('i', { class: 'cbadge' })); document.body.append(fab); }
  fab.querySelector('.cbadge').textContent = String(giftTotal());
  const old = document.getElementById('giftTray');
  if (!giftTrayOpen) { old?.remove(); giftTraySig = ''; return; }
  // the tray is only touched when what it shows has changed, and then filled in place: it never slides in again while open
  const sig = JSON.stringify([giftPick, giftTarget, myGifts(), st.players.map((p) => [p.id, p.name, p.avatar, p.acc, p.bd]), lang, st.prices && st.prices.uses]);
  if (old && sig === giftTraySig) return;
  giftTraySig = sig;
  const owned = GIFT_KEYS.filter((k) => (myGifts()[k] || 0) > 0);
  if (giftPick && !owned.includes(giftPick)) giftPick = null;
  const body = giftPick
    ? [el('h5', {}, el('button', { type: 'button', class: 'ghost', onclick: () => { giftPick = null; syncEmoteUi(); } }, '‹'),  giftEl(giftPick, 22), t('giftWho', { name: t('gift_' + giftPick) })),
       el('div', { class: 'giftwho' }, (st.players.length > 1 || (st.prices && st.prices.test)) ? el('button', { type: 'button', class: 'giftall', disabled: (myGifts()[giftPick] || 0) < st.prices.uses, onclick: () => sendGift(giftPick, 'all') }, el('span', { class: 'gall' }, icon('users', 20)), el('span', {}, el('b', {}, t('giftEveryone')), el('small', {}, (myGifts()[giftPick] || 0) < st.prices.uses ? t('giftEveryoneNeed', { n: st.prices.uses }) : t('giftEveryoneCost', { n: st.prices.uses })))) : '', ...st.players.filter((p) => p.id !== st.meId || (st.prices && st.prices.test)).map((p) => el('button', { type: 'button', onclick: () => sendGift(giftPick, p.id) }, avatarEl(p.avatar, 30, '', p.acc, p.bd), el('span', {}, p.name + (p.id === st.meId ? t('you') : '')))))]
    : [el('h5', {}, t('giftTitle') + (giftTarget ? ' → ' + ((st.players.find((q) => q.id === giftTarget) || {}).name || '') : '')), el('div', { class: 'giftgrid' }, ...owned.map((k) => el('button', { type: 'button', onclick: () => { if (giftTarget && st.players.some((q) => q.id === giftTarget)) sendGift(k, giftTarget); else { giftPick = k; syncEmoteUi(); } } }, giftEl(k, 36), el('small', {}, t('gift_' + k) + ' ×' + myGifts()[k]))))];
  if (old) old.replaceChildren(...body);
  else document.body.append(el('div', { id: 'giftTray', class: 'gifttray', role: 'menu', onclick: (e) => e.stopPropagation() }, ...body));
}
document.addEventListener('click', (e) => { if (giftTrayOpen && !(e.target.closest && e.target.closest('#giftTray, #giftFab'))) { giftTrayOpen = false; giftPick = null; giftTarget = null; syncEmoteUi(); } });
function sendGift(item, target) {
  if (Date.now() - giftLast < 1500 || (myGifts()[item] || 0) < (target === 'all' ? st.prices.uses : 1)) return;
  giftLast = Date.now();
  st.wallet.gifts[item] -= target === 'all' ? st.prices.uses : 1;   // shown at once; the server copy follows
  giftTrayOpen = false; giftPick = null; giftTarget = null;
  queueGift({ item, from: st.meId, to: target });
  syncEmoteUi();
  act('throw', { item, target });
}
function handleGifts(j) {
  if (!j.gifts) return;
  if (giftSeen === null) { giftSeen = j.giftN || 0; return; }
  for (const g of j.gifts) if (g.n > giftSeen && g.from !== j.meId && serverNow() - g.at < 8000) queueGift(g);
  giftSeen = Math.max(giftSeen, j.giftN || 0);
}
// who threw what at whom: shown as that throw's animation starts
function giftBanner(g) {
  if (!st) return;
  const from = st.players.find((p) => p.id === g.from), to = st.players.find((p) => p.id === g.to);
  const everyone = g.to === 'all';
  const toMe = everyone ? (g.from !== st.meId || st.players.length === 1) : g.to === st.meId;
  let lane = document.querySelector('.giftbanners');
  if (!lane) { lane = el('div', { class: 'giftbanners' }); document.body.append(lane); }
  while (lane.children.length >= 3) lane.firstChild.remove();
  const ban = el('div', { class: 'giftbanner' + (toMe ? ' tome' : '') }, from ? avatarEl(from.avatar, 30, '', from.acc, from.bd) : '', el('span', {}, everyone ? t('giftBannerAll', { from: from ? from.name : '?' }) : t('giftBanner', { from: from ? from.name : '?', to: to ? (toMe ? t('giftYou') : to.name) : '?' })), el('em', { class: 'gg' }, giftEl(g.item, 28)));
  lane.append(ban);
  setTimeout(() => { ban.classList.add('out'); setTimeout(() => { ban.remove(); if (!lane.children.length) lane.remove(); }, 450); }, 3600);
}
// throws that arrive together play one after another instead of piling up on top of each other
const GIFT_MS = { tomato: 2900, pie: 2900, snowball: 3900, rose: 4400, popper: 3300, rocket: 3600, bomb: 5200, fireworks: 5200, balloon: 3400, kiss: 3500, ghost: 3800, zap: 3200, disco: 4600, cash: 4300 };
let giftQ = [], giftRun = false;
function queueGift(g) {
  if (giftQ.length >= 4) giftQ.shift();   // a flood: the oldest waiting effect is skipped
  giftQ.push(g); runGiftQ();
}
function runGiftQ() {
  if (giftRun || !giftQ.length) return;
  const g = giftQ.shift(); giftRun = true;
  const all = g.to === 'all' && !!st, others = all ? st.players.filter((p) => p.id !== g.from).map((p) => p.id) : [];
  const mini = giftIsMini(g), atMe = !!st && g.from !== st.meId && (g.to === st.meId || (all && others.includes(st.meId))), lead = atMe ? 600 : 0;
  giftBanner(g);
  let ms;
  if (all && g.from === st.meId && others.length) {   // I threw at everyone: one throw flies to each of them, one after another
    others.forEach((id, i) => setTimeout(() => playGiftMini({ ...g, to: id }), i * 140)); ms = 1900 + (others.length - 1) * 140;
  } else if (atMe) {   // aimed at me (alone or with everyone): it flies from the thrower's avatar onto mine, then the full show
    playGiftMini({ ...g, to: st.meId }); setTimeout(() => playGift(g), lead); ms = lead + (GIFT_MS[g.item] || 3000);
  } else if (mini) { playGiftMini(g); ms = 1900; }
  else { playGift(g); ms = GIFT_MS[g.item] || 3000; }
  setTimeout(() => { giftRun = false; runGiftQ(); }, ms + (giftQ.length ? 250 : 0));
}

// a throw at somebody else: a small projectile flies from the thrower to that player and lands with a tiny version of the effect (the target itself gets the full show)
const giftIsMini = (g) => !!st && g.to !== 'all' && g.to !== st.meId;
function giftAnchor(pid, anyWhere = false) {
  if (!/^[\w-]+$/.test(String(pid))) return null;
  let off = null;
  for (const sel of [`.tile[data-pid="${pid}"] .tname .av`, `.who[data-pid="${pid}"] .av`, `.seat[data-pid="${pid}"] .av`, `.prow[data-pid="${pid}"] .av`, `.pd[data-pid="${pid}"] .av`, `.rsp[data-pid="${pid}"] .av`, `.hrow[data-pid="${pid}"] .av`]) {
    for (const n of document.querySelectorAll(sel)) {
      const r = n.getBoundingClientRect();
      if (!r.width) continue;
      if (r.bottom > 0 && r.top < window.innerHeight) return n;
      off = off || n;
    }
  }
  return anyWhere ? off : null;
}
function playGiftMini(g) {
  const art = GIFT_ART[g.item] || GIFT_ART.tomato, kind = art[1], color = art[2] || '#fff';
  const W = window.innerWidth, H = window.innerHeight, rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
  const mineThrow = g.from === st.meId;
  const toName = (st.players.find((q) => q.id === g.to) || {}).name || '';
  // where the target is right now (it is looked up every frame, so a layout change mid-flight cannot make the throw miss);
  // a player scrolled off the screen is aimed at on the nearest edge, with their name shown
  const tgt = () => {
    const n = giftAnchor(g.to, true);
    if (!n) return { x: W / 2, y: H * 0.3, n: null, edge: '' };
    const r = n.getBoundingClientRect();
    let x = r.left + r.width / 2, y = r.top + r.height / 2, edge = '';
    if (y < 40) { y = 40; edge = '▲'; } else if (y > H - 40) { y = H - 40; edge = '▼'; }
    return { x: Math.min(W - 26, Math.max(26, x)), y, n, edge };
  };
  const fEl = mineThrow ? document.getElementById('giftFab') : giftAnchor(g.from);
  let T = tgt();
  const [x0, y0] = (() => { if (fEl) { const r = fEl.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; } return mineThrow ? [W - 44, H - 70] : [T.x < W / 2 ? W + 30 : -30, T.y + 90]; })();
  let x1 = T.x, y1 = T.y;
  const impactSnd = kind === 'boom' ? 'boom' : kind === 'petals' || kind === 'kiss' || kind === 'disco' ? 'chime' : kind === 'splat' || kind === 'splash' ? 'splat' : kind === 'zap' ? 'thunder' : kind === 'ghost' ? 'whoosh' : 'pop';
  SND.play('throw');
  const dist = Math.hypot(x1 - x0, y1 - y0), dur = Math.round(Math.min(760, Math.max(440, dist * 0.9)));
  const hit = (n) => {   // the target flinches
    if (!n) return;
    const tile = n.closest('.tile, .who, .seat, .prow') || n;
    try { tile.animate([{ transform: 'none' }, { transform: 'translateX(-5px) rotate(-1.5deg)' }, { transform: 'translateX(5px) rotate(1.5deg)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], { duration: 420 }); } catch {}
    n.classList.add('hop'); setTimeout(() => n.classList.remove('hop'), 720);
  };
  if (ui.calm) { setTimeout(() => { SND.play(impactSnd); hit(T.n); }, dur); return; }
  const fx = el('div', { class: 'giftfx' }); document.body.append(fx);
  const anim = (n, frames, opt) => { try { return n.animate(frames, opt); } catch { return null; } };
  const box = (css, html = '') => { const d = el('i', { class: 'giftbit' }); d.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;' + css; if (html) d.innerHTML = html; fx.append(d); return d; };
  // little particles that fly out and fall
  const spray = (n, o = {}) => { const { cols = [color], spd = [60, 150], life = [500, 900], size = [4, 8], g: grav = 140, round = true, rect = false } = o;
    for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), v = rnd(spd[0], spd[1]), L = rnd(life[0], life[1]), sz = rnd(size[0], size[1]);
      const d = box(`width:${rect ? sz * 1.6 : sz}px;height:${sz}px;background:${pick(cols)};border-radius:${round ? '50%' : '2px'}`);
      const dx = Math.cos(a) * v, dy = Math.sin(a) * v;
      anim(d, [{ transform: `translate(${x1}px,${y1}px) rotate(0)`, opacity: 1 }, { transform: `translate(${x1 + dx}px,${y1 + dy + grav * 0.5}px) rotate(${rnd(-360, 360)}deg)`, opacity: 0 }], { duration: L, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }); } };
  const ring = (c, sz = 70, ms = 420) => { const d = box(`width:${sz}px;height:${sz}px;margin:${-sz / 2}px 0 0 ${-sz / 2}px;border-radius:50%;border:3px solid ${c}`); anim(d, [{ transform: `translate(${x1}px,${y1}px) scale(.2)`, opacity: .9 }, { transform: `translate(${x1}px,${y1}px) scale(1)`, opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' }); };
  const blob = (c, sz = 46, stay = 1300) => { const d = box(`width:${sz}px;height:${sz * 0.9}px;margin:${-sz / 2}px 0 0 ${-sz / 2}px;border-radius:48% 52% 45% 55% / 55% 45% 55% 45%;background:radial-gradient(circle at 35% 30%, #fff8, ${c} 55%)`);
    anim(d, [{ transform: `translate(${x1}px,${y1}px) scale(.2)`, opacity: 1 }, { transform: `translate(${x1}px,${y1}px) scale(1.15)`, opacity: 1, offset: .22 }, { transform: `translate(${x1}px,${y1 + 6}px) scale(1)`, opacity: 1, offset: .75 }, { transform: `translate(${x1}px,${y1 + 14}px) scale(.95)`, opacity: 0 }], { duration: stay, fill: 'forwards' }); };
  const impact = () => {
    SND.play(impactSnd); hit(T.n);
    if (T.edge) { const lb = box('padding:3px 10px;border-radius:99px;background:rgba(20,26,48,.92);border:1px solid rgba(255,255,255,.35);color:#fff;font:700 12px system-ui;white-space:nowrap', `${toName} ${T.edge}`); anim(lb, [{ transform: `translate(${x1 - 30}px,${y1 + (T.edge === '▲' ? 26 : -40)}px)`, opacity: 0 }, { transform: `translate(${x1 - 30}px,${y1 + (T.edge === '▲' ? 26 : -40)}px)`, opacity: 1, offset: .15 }, { transform: `translate(${x1 - 30}px,${y1 + (T.edge === '▲' ? 26 : -40)}px)`, opacity: 1, offset: .8 }, { transform: `translate(${x1 - 30}px,${y1 + (T.edge === '▲' ? 26 : -40)}px)`, opacity: 0 }], { duration: 1500, fill: 'forwards' }); }
    if (kind === 'splat') { blob(color); spray(7, { cols: [color], spd: [50, 110], size: [3, 7], g: 120 }); }
    else if (kind === 'petals') { spray(9, { cols: ['#ff4d6d', '#ff8fb8', '#ffc2d4'], spd: [30, 80], life: [900, 1400], size: [5, 9], g: 90, round: false }); const h = box('font-size:22px;line-height:1', '❤️'); anim(h, [{ transform: `translate(${x1 - 11}px,${y1 - 11}px) scale(.3)`, opacity: 1 }, { transform: `translate(${x1 - 11}px,${y1 - 46}px) scale(1.1)`, opacity: 0 }], { duration: 1000, easing: 'ease-out', fill: 'forwards' }); }
    else if (kind === 'confetti') spray(16, { cols: ['#ffd23f', '#ff5a8a', '#4fc3ff', '#7be08f', '#b77bff'], spd: [70, 170], life: [800, 1300], size: [4, 7], g: 160, rect: true, round: false });
    else if (kind === 'boom') { ring('#ffb02e', 80, 380); blob('#ff7a1f', 44, 500); spray(9, { cols: ['#ffd23f', '#ff7a1f', '#555'], spd: [70, 150], g: 80 }); }
    else if (kind === 'rocket') { ring('#ffd23f', 70, 420); spray(10, { cols: ['#ffd23f', '#ff9a1f', '#fff'], spd: [60, 160], g: 100 }); }
    else if (kind === 'fireworks') { ring('#fff', 56, 380); spray(14, { cols: ['#ff4d8d', '#ffd23f', '#4fc3ff', '#fff'], spd: [70, 140], g: 60, size: [3, 6] }); }
    else if (kind === 'splash') { ring('#8fd0ff', 74, 420); spray(14, { cols: ['#3aa8ff', '#8fd0ff', '#ffffff'], spd: [60, 150], g: 220, size: [3, 7] }); }
    else if (kind === 'kiss') { const k = box('font-size:26px;line-height:1', '💋'); anim(k, [{ transform: `translate(${x1 - 13}px,${y1 - 13}px) scale(1.8)`, opacity: 0 }, { transform: `translate(${x1 - 13}px,${y1 - 13}px) scale(1)`, opacity: 1, offset: .25 }, { transform: `translate(${x1 - 13}px,${y1 - 13}px) scale(1)`, opacity: 1, offset: .75 }, { transform: `translate(${x1 - 13}px,${y1 - 13}px) scale(1)`, opacity: 0 }], { duration: 1300, fill: 'forwards' }); spray(8, { cols: ['#ff3d7f', '#ff8fb8'], spd: [40, 90], size: [4, 7] }); }
    else if (kind === 'ghost') { spray(10, { cols: ['#ffffff', '#dfe5ff'], spd: [40, 100], g: -40, size: [6, 11] }); const b2 = box('font:900 16px/1 Inter,system-ui,sans-serif;color:#fff;text-shadow:0 2px 0 #5a648c', 'BOO!'); anim(b2, [{ transform: `translate(${x1 - 18}px,${y1 - 30}px) scale(.4)`, opacity: 0 }, { transform: `translate(${x1 - 18}px,${y1 - 40}px) scale(1.1)`, opacity: 1, offset: .3 }, { transform: `translate(${x1 - 18}px,${y1 - 50}px) scale(1)`, opacity: 0 }], { duration: 1100, fill: 'forwards' }); }
    else if (kind === 'zap') { ring('#fff6b0', 66, 300); spray(12, { cols: ['#ffd23f', '#fff6b0', '#8fd0ff'], spd: [80, 180], g: 40, size: [2, 5] }); }
    else if (kind === 'disco') { ring('#ff8fe0', 60, 420); ring('#7fe3ff', 80, 520); spray(14, { cols: ['#ff8fe0', '#7fe3ff', '#ffe27a', '#fff'], spd: [60, 140], g: 40, size: [3, 6] }); }
    else if (kind === 'cash') spray(14, { cols: ['#3fbf6a', '#8fe3a6', '#ffcf40'], spd: [60, 150], life: [900, 1400], size: [5, 8], g: 180, rect: true, round: false });
    else spray(8, {});
  };
  const proj = giftEl(g.item, 34); proj.style.cssText += ';position:fixed;left:0;top:0;pointer-events:none;will-change:transform;filter:drop-shadow(0 4px 6px rgba(0,0,0,.45))';
  fx.append(proj);
  const arc = -Math.min(110, dist * 0.3), start = performance.now();
  let lastTrail = -1;
  const step = (now) => {
    const k = Math.min(1, (now - start) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // eases in and out
    T = tgt(); x1 = T.x; y1 = T.y;   // follows the target
    const x = x0 + (x1 - x0) * e, y = y0 + (y1 - y0) * e + arc * 4 * e * (1 - e);
    proj.style.transform = `translate(${x - 17}px,${y - 17}px) scale(${(0.55 + 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.1))).toFixed(2)}) rotate(${(k * 380).toFixed(0)}deg)`;
    const tb = Math.floor(k * 6);
    if (tb !== lastTrail && tb < 6) { lastTrail = tb; const d = box(`width:7px;height:7px;margin:-3px 0 0 -3px;border-radius:50%;background:${color};opacity:.5`); anim(d, [{ transform: `translate(${x}px,${y}px) scale(1)`, opacity: .5 }, { transform: `translate(${x}px,${y}px) scale(.2)`, opacity: 0 }], { duration: 320, fill: 'forwards' }); }
    if (k < 1) requestAnimationFrame(step);
    else { proj.remove(); impact(); setTimeout(() => fx.remove(), 1800); }
  };
  requestAnimationFrame(step);
}
function playGift(g) {
  if (!st) return;
  const art = GIFT_ART[g.item] || GIFT_ART.tomato, kind = art[1];
  const from = st.players.find((p) => p.id === g.from), to = st.players.find((p) => p.id === g.to);
  const everyone = g.to === 'all';
  const toMe = everyone ? (g.from !== st.meId || st.players.length === 1) : g.to === st.meId;   // a throw at everyone hits every phone but the thrower's
  SND.play('throw');
  if (toMe) buzz([40, 30, 80]);
  if (ui.calm) { setTimeout(() => SND.play(kind === 'boom' ? 'boom' : kind === 'petals' ? 'chime' : kind === 'splat' ? 'splat' : 'pop'), 450); return; }

  const W = window.innerWidth, H = window.innerHeight, fx = el('div', { class: 'giftfx' });
  document.body.append(fx);
  const rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
  const anim = (node, frames, opt) => { try { return node.animate(frames, opt); } catch { return null; } };
  const later = (ms, fn) => setTimeout(fn, ms);
  let deadline = Date.now() + 3600; const keepFor = (ms) => { deadline = Math.max(deadline, Date.now() + ms); };
  const tx = toMe ? W / 2 : W * rnd(0.3, 0.7), ty = toMe ? H * 0.42 : H * rnd(0.3, 0.5);

  // --- toolkit ---
  const node = (css, cls = 'giftbit', html = '') => { const d = el('i', { class: cls }); d.style.cssText = css; if (html) d.innerHTML = html; fx.append(d); return d; };
  // a particle thrown from (x,y) that arcs and falls
  const part = (x, y, o) => {
    const { ang = 0, spd = 400, g = 900, life: lf = 1200, size = 8, color = '#fff', round = true, spin = 0, delay = 0, w, h, end = 0.4, glow = false } = o;
    const d = node(`width:${w || size}px;height:${h || size}px;background:${color};border-radius:${round ? '50%' : '2px'};margin:${-(h || size) / 2}px 0 0 ${-(w || size) / 2}px;${glow ? `box-shadow:0 0 ${size * 1.6}px ${color};` : ''}${delay ? 'opacity:0;' : ''}`);
    const T = lf / 1000, vx = Math.cos(ang) * spd, vy = Math.sin(ang) * spd, fr = [];
    for (let i = 0; i <= 8; i++) { const k = i / 8, tt = k * T; fr.push({ transform: `translate(${x + vx * tt}px,${y + vy * tt + 0.5 * g * tt * tt}px) rotate(${spin * k}deg) scale(${1 - (1 - end) * k})`, opacity: i < 6 ? 1 : 1 - (i - 5) / 3 }); }
    anim(d, fr, { duration: lf, delay, easing: 'linear', fill: 'forwards' }); keepFor(lf + delay + 200);
  };
  const ring = (x, y, color, maxR, dur = 700, width = 5, delay = 0) => { const d = node(`left:${x - maxR}px;top:${y - maxR}px;width:${maxR * 2}px;height:${maxR * 2}px;border-radius:50%;border:${width}px solid ${color};opacity:0`, 'giftbit'); anim(d, [{ transform: 'scale(.05)', opacity: 0.9 }, { transform: 'scale(1)', opacity: 0 }], { duration: dur, delay, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' }); keepFor(dur + delay + 200); };
  const flash = (color = '#fff', peak = 0.85, dur = 600, delay = 0) => { const d = node(`inset:0;left:0;top:0;width:100%;height:100%;background:${color};opacity:0`, 'giftflash'); anim(d, [{ opacity: peak }, { opacity: 0 }], { duration: dur, delay, fill: 'forwards' }); keepFor(dur + delay + 100); };
  const glowAt = (x, y, color, size, dur = 700, delay = 0) => { const d = node(`left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;background:radial-gradient(circle, ${color} 0, ${color}00 70%);opacity:0`, 'giftbit'); anim(d, [{ transform: 'scale(.3)', opacity: 0.95 }, { transform: 'scale(1.25)', opacity: 0 }], { duration: dur, delay, fill: 'forwards' }); keepFor(dur + delay + 100); };
  const pop = (x, y, text, color, size = 54, rot = -8, delay = 0) => { const d = node(`left:${x}px;top:${y}px;font:900 ${size}px/1 Inter,system-ui,sans-serif;color:${color};-webkit-text-stroke:3px #fff;paint-order:stroke fill;text-shadow:0 6px 0 rgba(0,0,0,.25);white-space:nowrap;opacity:0`, 'giftbit'); d.textContent = text; anim(d, [{ transform: `translate(-50%,-50%) rotate(${rot}deg) scale(.1)`, opacity: 0 }, { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1.25)`, opacity: 1, offset: 0.25 }, { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1)`, opacity: 1, offset: 0.7 }, { transform: `translate(-50%,-70%) rotate(${rot}deg) scale(1)`, opacity: 0 }], { duration: 1500, delay, fill: 'forwards' }); keepFor(1700 + delay); };
  const shake = (ms = 500) => { app.classList.add('shake'); later(ms, () => app.classList.remove('shake')); };   // not <body>: a transformed body would re-anchor every fixed layer and make the effects jump
  // the gift itself flying in on an arc, with a fading trail of copies behind it
  const fly = (x0, y0, x1, y1, { size = 64, dur = 700, spin = 380, arc = 0.2, grow = 1.5, ghosts = 4 } = {}, done) => {
    const trail = [];
    for (let i = ghosts; i >= 0; i--) {
      const s0 = el('span', { class: 'giftfly' }, giftEl(g.item, size)); s0.style.opacity = i ? String(0.32 - i * 0.05) : '1'; fx.append(s0); trail.push(s0);
      const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - H * arc;
      const a = anim(s0, [{ transform: `translate(${x0 - size / 2}px,${y0 - size / 2}px) rotate(0deg) scale(.7)` }, { transform: `translate(${mx - size / 2}px,${my - size / 2}px) rotate(${spin * 0.55}deg) scale(${(1 + grow) / 2})`, offset: 0.55 }, { transform: `translate(${x1 - size / 2}px,${y1 - size / 2}px) rotate(${spin}deg) scale(${grow})` }], { duration: dur, delay: i * 38, easing: 'cubic-bezier(.35,.6,.5,1)', fill: 'forwards' });
      if (i === 0) { if (a) a.onfinish = () => { trail.forEach((x) => x.remove()); done && done(); }; else { trail.forEach((x) => x.remove()); done && done(); } }
    }
  };
  const fromX = Math.random() < 0.5 ? -50 : W + 50, fromY = H * 0.88;
  // a burst of particles shaped like a heart (or a star) so a firework can draw a picture
  const shapeBurst = (cx, cy, size, colors, kind2 = 'heart', n = 46, life = 1700) => {
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * Math.PI * 2; let vx, vy;
      if (kind2 === 'heart') { vx = 16 * Math.pow(Math.sin(t0), 3); vy = -(13 * Math.cos(t0) - 5 * Math.cos(2 * t0) - 2 * Math.cos(3 * t0) - Math.cos(4 * t0)); }
      else { const r2 = i % 2 ? 0.5 : 1; vx = Math.sin(t0) * 16 * r2; vy = -Math.cos(t0) * 16 * r2; }
      part(cx, cy, { ang: Math.atan2(vy, vx), spd: Math.hypot(vx, vy) * size * 4.2, g: 110, life, size: rnd(6, 9), color: colors[i % colors.length], end: 0.2, glow: true });
    }
  };
  const SNOWFLAKE = '<svg viewBox="0 0 24 24" width="100%" height="100%"><g stroke="#e8f6ff" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M3.300 7l17.400 10M3.300 17L20.700 7"/><path d="M9.500 3.800L12 6.500l2.500-2.700M9.500 20.200L12 17.500l2.500 2.700M4.200 10.200l3.500.8-.6-3.600M19.800 13.800l-3.500-.8.6 3.600M4.200 13.800l3.500-.8-.6 3.600M19.800 10.200l-3.500.8.6-3.600"/></g></svg>';

  // a splat is one self-contained picture (blob + drips + shine), so it fades as a whole and nothing is left behind.
  // Aimed at you it lands as a few splats around the edges of the screen, keeping the middle clear to play.
  const splatOne = (cx, cy, R, color, dark, { seeds = false, cherry = false, delay = 0 } = {}) => {
    const tomato = seeds;
    const S = R * 4.6, bx = S / 2, by = S / 2, N = 12, uid = 'sp' + Math.floor(Math.random() * 1e6);
    const lit = color === '#fff1d0' ? '#ffffff' : '#ff5a47', pt = (a, r) => [bx + Math.cos(a) * r, by + Math.sin(a) * r];
    // one smooth splat outline: a lumpy puddle with a few broad tongues of juice that taper outwards, plus loose drops beyond the tips
    const f1 = rnd(0, 6.28), f2 = rnd(0, 6.28), nb = 6 + Math.floor(rnd(0, 3)), bumps = Array.from({ length: nb }, (_, i) => ({ a: (i / nb) * 6.2832 + rnd(-0.25, 0.25), h: rnd(0.35, 0.75), w: rnd(0.2, 0.34) }));
    const rad = (th) => { let v = 0.8 + 0.09 * Math.sin(3 * th + f1) + 0.06 * Math.sin(5 * th + f2); for (const b of bumps) { let dd = Math.atan2(Math.sin(th - b.a), Math.cos(th - b.a)); v += b.h * Math.exp(-(dd / b.w) * (dd / b.w)); } return v; };
    let d = ''; const M = 120;
    for (let i = 0; i < M; i++) { const th = (i / M) * 6.2832, [x, y] = pt(th, R * rad(th)); d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }
    let arms = '', drops = '';
    for (const b of bumps) { if (Math.random() < 0.7) { const [dx, dy] = pt(b.a + rnd(-0.08, 0.08), R * (0.8 + b.h + rnd(0.2, 0.4))); drops += `<circle cx="${dx}" cy="${dy}" r="${R * rnd(0.05, tomato ? 0.14 : 0.1)}"/>`; } }
    // smooth tapering drips hanging below
    let drips = '', runs = ''; const nd = 2 + Math.floor(rnd(0, 2));
    for (let k = 0; k < nd; k++) {
      const x = bx + (k - (nd - 1) / 2) * R * 0.55 + rnd(-R * 0.08, R * 0.08), w = rnd(R * 0.15, R * 0.24), y0 = by + R * 0.3, len = R * rnd(0.6, 0.9), run = R * rnd(1.0, 1.7);
      drips += `<path d="M${x - w} ${y0} Q${x - w * 0.3} ${y0 + len * 0.5} ${x - w * 0.34} ${y0 + len} h${w * 0.68} Q${x + w * 0.3} ${y0 + len * 0.5} ${x + w} ${y0}z"/><circle cx="${x}" cy="${y0 + len}" r="${w * 0.42}"/>`;
      // every drip runs on its own: a different length (some barely move), a slight wander, a round bead leading the way down
      const ys = y0 + len * 0.75, rl = R * (k === 0 ? rnd(0.3, 0.6) : rnd(0.8, 1.7)) * (run / R > 1.3 ? 1 : 0.85), wob = rnd(-1, 1) * w * 0.35, sw = w * rnd(0.66, 0.84);
      runs += `<path class="rp" d="M${x} ${ys} C${x + wob} ${ys + rl * 0.35} ${x - wob * 0.6} ${ys + rl * 0.7} ${x + wob * 0.3} ${ys + rl}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" stroke-width="${sw.toFixed(1)}" stroke-linecap="round" fill="none" stroke="url(#${uid}r)" data-rl="${rl.toFixed(1)}"/><g class="rb"><circle cx="${x + wob * 0.3}" cy="${ys + rl}" r="${(sw * 0.66).toFixed(1)}" fill="url(#${uid}r)"/></g>`;
    }
    const gloss = (id) => `<filter id="${id}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="${(R * 0.07).toFixed(1)}" result="b"/><feSpecularLighting in="b" surfaceScale="${(R * 0.06).toFixed(1)}" specularConstant="1.1" specularExponent="26" lighting-color="#fff" result="s"><feDistantLight azimuth="225" elevation="52"/></feSpecularLighting><feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/><feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3=".9" k4="0"/></filter>`;
    let tom = '';
    if (tomato) {
      // juicy flesh in the middle, a darker wet rim, skin shards, gel-wrapped seeds, long streaks and a glossy sheen
      const inner = Array.from({ length: 10 }, (_, i) => pt((i / 10) * 6.2832, R * rnd(0.34, 0.5))); let id2 = `M${(inner[0][0] + inner[9][0]) / 2} ${(inner[0][1] + inner[9][1]) / 2}`; for (let i = 0; i < 10; i++) { const p0 = inner[i], p1 = inner[(i + 1) % 10]; id2 += ` Q${p0[0]} ${p0[1]} ${(p0[0] + p1[0]) / 2} ${(p0[1] + p1[1]) / 2}`; }
      tom += `<path d="${d}Z" fill="none" stroke="#7a0a0a" stroke-width="${R * 0.07}" opacity=".55" stroke-linejoin="round"/><path d="${id2}Z" fill="#ff7d66" opacity=".55"/>`;
      for (let i = 0; i < 7; i++) { const a = rnd(0, 6.28), r0 = R * rnd(0.55, 0.95), [kx, ky] = pt(a, r0), sc = R * rnd(0.1, 0.17); tom += `<path d="M${kx - sc} ${ky} q${sc} ${-sc * 1.4} ${sc * 2} 0 q${-sc} ${sc * 0.5} ${-sc * 2} 0z" fill="#e8301f" stroke="#fff3ee" stroke-width="${R * 0.025}" transform="rotate(${a * 57.3 + 90} ${kx} ${ky})"/>`; }
      for (let i = 0; i < 5; i++) { const a = rnd(0, 6.28), L = R * rnd(1.3, 1.6), [x0, y0] = pt(a, R * 0.9), [x1, y1] = pt(a, L), w = R * rnd(0.14, 0.2), [qx, qy] = pt(a + 1.5708, w), [rx, ry] = pt(a - 1.5708, w); tom += `<path d="M${x0 + (qx - bx)} ${y0 + (qy - by)} Q${x1} ${y1} ${x0 + (rx - bx)} ${y0 + (ry - by)}z" fill="#d8261c"/><circle cx="${x1 + Math.cos(a) * R * 0.14}" cy="${y1 + Math.sin(a) * R * 0.14}" r="${R * 0.06}" fill="#d8261c"/>`; }
    }
    const seedArt = seeds ? Array.from({ length: 6 }, () => { const a = rnd(0, 6.28), r = R * rnd(0.12, 0.6), [sx, sy] = pt(a, r), rot = rnd(0, 180); return `<ellipse cx="${sx}" cy="${sy}" rx="${R * 0.13}" ry="${R * 0.09}" fill="#ff9a80" opacity=".45" transform="rotate(${rot} ${sx} ${sy})"/><ellipse cx="${sx}" cy="${sy}" rx="${R * 0.065}" ry="${R * 0.042}" fill="#f2cf63" transform="rotate(${rot} ${sx} ${sy})"/><ellipse cx="${sx - R * 0.02}" cy="${sy - R * 0.015}" rx="${R * 0.025}" ry="${R * 0.015}" fill="#fff" opacity=".8" transform="rotate(${rot} ${sx} ${sy})"/>`; }).join('') : '';
    const cherryArt = cherry ? `<circle cx="${bx}" cy="${by - R * 0.05}" r="${R * 0.17}" fill="#e8352e"/><circle cx="${bx - R * 0.05}" cy="${by - R * 0.1}" r="${R * 0.05}" fill="#fff" opacity=".7"/>` : '';
    const n = node(`left:${cx - bx}px;top:${cy - by}px;width:${S}px;height:${S}px;opacity:0;transform-origin:${bx}px ${by}px;filter:drop-shadow(0 4px 6px rgba(0,0,0,.35))`, 'giftbit', `<svg viewBox="0 0 ${S} ${S}" width="100%" height="100%"><defs><radialGradient id="${uid}" gradientUnits="userSpaceOnUse" cx="${bx}" cy="${by}" r="${R * 1.5}"><stop offset="0" stop-color="${lit}"/><stop offset=".55" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></radialGradient>${gloss(uid + 'g')}</defs><g filter="url(#${uid}g)"><g fill="url(#${uid})"><path d="${d}Z"/>${arms}${drips}${drops}</g>${tom}${seedArt}</g><ellipse cx="${bx - R * 0.28}" cy="${by - R * 0.32}" rx="${R * 0.3}" ry="${R * 0.13}" fill="#fff" opacity=".4" transform="rotate(-30 ${bx - R * 0.28} ${by - R * 0.32})"/><ellipse cx="${bx + R * 0.34}" cy="${by + R * 0.12}" rx="${R * 0.1}" ry="${R * 0.05}" fill="#fff" opacity=".3" transform="rotate(-30 ${bx + R * 0.34} ${by + R * 0.12})"/>${cherryArt}</svg>`);
    // the runs: the same juice, revealed downwards like it is sliding off the glass, then fading with the splat
    const rn = node(`left:${cx - bx}px;top:${cy - by}px;width:${S}px;height:${S * 1.5}px;opacity:0;filter:drop-shadow(0 3px 4px rgba(0,0,0,.3))`, 'giftbit', `<svg viewBox="0 0 ${S} ${S * 1.5}" width="100%" height="100%"><defs><linearGradient id="${uid}r" gradientUnits="userSpaceOnUse" x1="0" y1="${by}" x2="0" y2="${S * 1.4}"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></linearGradient>${gloss(uid + 'h')}</defs><g filter="url(#${uid}h)">${runs}</g></svg>`);
    anim(rn, [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0, transform: `translateY(${R * 0.4}px)` }], { duration: 2350, delay: delay + 350, easing: 'ease-in', fill: 'forwards' });
    rn.querySelectorAll('.rp').forEach((pa, k) => {
      const rl = +pa.dataset.rl, ms = 700 + (rl / R) * 650, dl = delay + 380 + k * 140 + rnd(0, 120), ez = 'cubic-bezier(.55,0,.45,1)';   // slow to start, gathers speed, slows as it thins out
      anim(pa, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: ms, delay: dl, easing: ez, fill: 'both' });
      anim(pa.nextElementSibling, [{ transform: `translateY(${-rl}px)`, opacity: 0 }, { transform: `translateY(${-rl * 0.94}px)`, opacity: 1, offset: 0.06 }, { transform: 'translateY(0)', opacity: 1 }], { duration: ms, delay: dl, easing: ez, fill: 'both' });
    });
    anim(n, [{ opacity: 0, transform: 'scale(1.5,.5)' }, { opacity: 1, transform: 'scale(1.3,.75)', offset: 0.05 }, { opacity: 1, transform: 'scale(.88,1.14)', offset: 0.13 }, { opacity: 1, transform: 'scale(1.06,.96)', offset: 0.2 }, { opacity: 1, transform: 'scale(.98,1.02)', offset: 0.27 }, { opacity: 1, transform: `translateY(${R * 0.12}px) scale(1)`, offset: 0.7 }, { opacity: 0, transform: `translateY(${R * 0.4}px) scale(1.02,1.06)` }], { duration: 2700, delay, fill: 'forwards' });
    if (tomato) for (let i = 0; i < 7; i++) part(cx, cy, { ang: rnd(0, Math.PI * 2), spd: rnd(260, 560), g: 1100, life: rnd(700, 1200), w: R * 0.16, h: R * 0.09, color: pick(['#e8301f', '#ff5a47', '#b81c14']), round: false, spin: rnd(-600, 600), end: 0.5, delay });
    else for (let i = 0; i < 8; i++) part(cx, cy, { ang: rnd(0, Math.PI * 2), spd: rnd(200, 480), g: 1100, life: rnd(700, 1200), size: R * rnd(0.1, 0.18), color: pick(['#fff1d0', '#ffffff', '#f6dcaa']), end: 0.7, delay });
    for (let i = 0; i < 12; i++) part(cx, cy, { ang: rnd(0, Math.PI * 2), spd: rnd(220, 620), g: 1400, life: rnd(600, 1100), size: rnd(4, 10), color: i % 4 ? color : dark, end: 0.6, delay });
    keepFor(2800 + delay);
  };
  const splat = (color, dark, word, opts = {}) => {
    SND.play('splat'); if (toMe) shake(300);
    if (toMe) {
      const R = Math.min(W, H) * 0.12;
      [[0.17, 0.19], [0.84, 0.36], [0.2, 0.74]].forEach(([fx0, fy0], i) => splatOne(W * fx0 + rnd(-10, 10), H * fy0 + rnd(-14, 14), R * rnd(0.9, 1.1), color, dark, { ...opts, delay: i * 90 }));
      pop(W / 2, H * 0.14, word, color === '#fff1d0' ? '#e0a04a' : color, 46);
    } else {
      splatOne(tx, ty, 50, color, dark, opts);
      pop(tx, ty - 80, word, color === '#fff1d0' ? '#e0a04a' : color, 34);
    }
  };

  if (kind === 'splat' && g.item === 'tomato') {
    fly(fromX, fromY, tx, ty, { size: 70, dur: 640, spin: 520, grow: toMe ? 2.6 : 1.6 }, () => { splat('#e8352e', '#a81818', 'SPLAT!', { seeds: true }); });
  } else if (kind === 'splat' && g.item === 'pie') {
    fly(fromX, fromY, tx, ty, { size: 76, dur: 700, spin: 300, grow: toMe ? 2.6 : 1.6 }, () => { splat('#fff1d0', '#e0b872', 'PLOP!', { cherry: true }); });
  } else if (g.item === 'snowball') {   // a packed snowball: powdery hit, then the spot freezes over in ice, shivers, and shatters
    // sparkly comet trail while it flies
    for (let i = 0; i < 12; i++) { const k = i / 12; later(k * 600, () => { const px = fromX + (tx - fromX) * k, py = fromY + (ty - fromY) * k - Math.sin(k * 3.14) * H * 0.2; part(px, py, { ang: rnd(0, 6.28), spd: rnd(30, 110), g: 60, life: rnd(500, 850), size: rnd(7, 15), color: 'rgba(240,248,255,.85)', end: 1.8 }); part(px, py, { ang: rnd(0, 6.28), spd: rnd(60, 160), g: 100, life: rnd(500, 900), size: rnd(3, 6), color: '#bfe4ff', end: 0.2, glow: true }); }); }
    // one block of ice: jagged crystal with facets and a shine; it grows, shivers, then bursts into shards
    const iceBlock = (cx, cy, R, delay = 0, hold = 900) => {
      const sz = R * 2.6, c = sz / 2, N = 11, pts = Array.from({ length: N }, (_, i) => { const a = (i / N) * 6.2832 - 1.5708, r = R * (i % 2 ? rnd(0.62, 0.78) : rnd(0.95, 1.12)); return [c + Math.cos(a) * r, c + Math.sin(a) * r]; });
      const poly = pts.map((q) => q.join(',')).join(' '), uid = 'ic' + Math.floor(Math.random() * 1e6);
      const facets = pts.map((q, i) => (i % 2 === 0 ? `<line x1="${c}" y1="${c}" x2="${q[0]}" y2="${q[1]}" stroke="#fff" stroke-opacity=".55" stroke-width="${R * 0.03}"/>` : '')).join('');
      const blk = node(`left:${cx - c}px;top:${cy - c}px;width:${sz}px;height:${sz}px;opacity:0;transform-origin:50% 50%;filter:drop-shadow(0 4px 8px rgba(40,110,170,.45))`, 'giftbit', `<svg viewBox="0 0 ${sz} ${sz}" width="100%" height="100%"><defs><linearGradient id="${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4fcff"/><stop offset=".5" stop-color="#a9dcf7"/><stop offset="1" stop-color="#5fb2ec"/></linearGradient></defs><polygon points="${poly}" fill="url(#${uid})" fill-opacity=".92" stroke="#fff" stroke-width="${R * 0.05}" stroke-linejoin="round"/>${facets}<polygon points="${pts[0].join(',')} ${pts[2].join(',')} ${c},${c}" fill="#fff" opacity=".45"/><ellipse cx="${c - R * 0.35}" cy="${c - R * 0.4}" rx="${R * 0.18}" ry="${R * 0.07}" fill="#fff" opacity=".85" transform="rotate(-35 ${c - R * 0.35} ${c - R * 0.4})"/></svg>`);
      anim(blk, [{ opacity: 0, transform: 'scale(.15) rotate(-12deg)' }, { opacity: 1, transform: 'scale(1.18) rotate(3deg)', offset: 0.5 }, { opacity: 1, transform: 'scale(1) rotate(0deg)' }], { duration: 380, delay, easing: 'cubic-bezier(.2,1.3,.4,1)', fill: 'forwards' });
      later(delay, () => SND.play('chime'));
      // chattering shiver while it holds
      const sh = Array.from({ length: 12 }, (_, i) => ({ transform: `translate(${i % 2 ? 3 : -3}px,${i % 3 ? 1 : -1}px) scale(1)` }));
      later(delay + 380, () => anim(blk, sh, { duration: hold, easing: 'linear' }));
      later(delay + 380 + hold, () => {
        blk.remove(); SND.play('boom'); SND.play('crackle'); ring(cx, cy, '#e8f6ff', R * 1.5, 600, 5);
        glowAt(cx, cy, '#ffffff', R * 3, 500);
        for (let i = 0; i < 20; i++) part(cx, cy, { ang: rnd(0, 6.28), spd: rnd(300, 760), g: 1100, life: rnd(800, 1300), w: R * rnd(0.1, 0.2), h: R * rnd(0.22, 0.4), color: pick(['#e8f6ff', '#a9dcf7', '#ffffff', '#7ec4f0']), round: false, spin: rnd(-900, 900), end: 0.5, glow: true });
        for (let i = 0; i < 16; i++) part(cx, cy, { ang: rnd(0, 6.28), spd: rnd(120, 420), g: 400, life: rnd(1000, 1600), size: rnd(3, 7), color: '#fff', end: 0.2, glow: true });
        for (let i = 0; i < 5; i++) { const a2 = rnd(0, 6.28), rr = rnd(0.5, 1.3) * R, sx = cx + Math.cos(a2) * rr, sy = cy + Math.sin(a2) * rr, sz2 = rnd(16, 28); const st = node(`left:${sx - sz2 / 2}px;top:${sy - sz2 / 2}px;width:${sz2}px;height:${sz2}px;opacity:0`, 'giftbit', '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 1l2.600 8.400L23 12l-8.400 2.600L12 23l-2.600-8.400L1 12l8.400-2.600z" fill="#fff"/></svg>'); anim(st, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.1) rotate(45deg)', opacity: 1, offset: 0.35 }, { transform: 'scale(0)', opacity: 0 }], { duration: 800, delay: i * 70, fill: 'forwards' }); }
      });
      keepFor(delay + 380 + hold + 1800);
    };
    fly(fromX, fromY, tx, ty, { size: 64, dur: 620, spin: 700, grow: toMe ? 2.2 : 1.5, ghosts: 3 }, () => {
      SND.play('splat'); if (toMe) shake(220);
      // the powder puff
      for (let i = 0; i < 5; i++) { const sz = (toMe ? 150 : 120) * rnd(0.6, 1), ox = rnd(-26, 26), oy = rnd(-20, 20); const pf = node(`left:${tx + ox - sz / 2}px;top:${ty + oy - sz / 2}px;width:${sz}px;height:${sz}px;border-radius:50%;background:radial-gradient(circle, #fff 0, rgba(255,255,255,.9) 40%, rgba(220,240,255,0) 70%);opacity:0`, 'giftbit'); anim(pf, [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(.9)', opacity: 1, offset: 0.25 }, { transform: `translate(${ox * 0.5}px,${-18 - i * 6}px) scale(1.3)`, opacity: 0 }], { duration: 1000 + i * 80, delay: i * 40, easing: 'ease-out', fill: 'forwards' }); }
      for (let i = 0; i < 18; i++) part(tx, ty, { ang: rnd(0, Math.PI * 2), spd: rnd(160, 520), g: 500, life: rnd(800, 1300), size: rnd(4, 9), color: '#fff', end: 0.2, glow: true });
      // ice: aimed at you it freezes a few spots around the screen edges (middle stays clear); at someone else, one big block on them
      if (toMe) { const R = Math.min(W, H) * 0.12; [[0.17, 0.2], [0.83, 0.38], [0.2, 0.74]].forEach(([fx0, fy0], i) => iceBlock(W * fx0, H * fy0, R * rnd(0.9, 1.1), 250 + i * 110, 800)); }
      else iceBlock(tx, ty, 60, 250, 900);
      // BRRR! that shivers, then the cold fades
      const w = node(`left:${tx}px;top:${toMe ? H * 0.12 : ty - 100}px;font:900 ${toMe ? 56 : 42}px/1 Inter,system-ui,sans-serif;color:#7fc8ff;-webkit-text-stroke:3px #fff;paint-order:stroke fill;text-shadow:0 6px 0 rgba(0,0,0,.25);opacity:0;white-space:nowrap`, 'giftbit'); w.textContent = 'BRRR!';
      if (toMe) w.style.left = W / 2 + 'px';
      anim(w, [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 1, offset: 0.12 }, ...Array.from({ length: 12 }, (_, i) => ({ transform: `translate(calc(-50% + ${i % 2 ? 4 : -4}px),-50%) scale(1)`, opacity: 1, offset: 0.18 + i * 0.05 })), { transform: 'translate(-50%,-90%) scale(1)', opacity: 0 }], { duration: 1900, delay: 150, fill: 'forwards' });
      const fr = node('left:0;top:0;width:100%;height:100%;pointer-events:none;opacity:0;box-shadow:inset 0 0 50px 16px rgba(225,245,255,.8), inset 0 0 120px 40px rgba(150,205,255,.38)', 'giftbit');
      anim(fr, [{ opacity: 0 }, { opacity: toMe ? 0.45 : 0.28, offset: 0.2 }, { opacity: toMe ? 0.35 : 0.2, offset: 0.65 }, { opacity: 0 }], { duration: 2700, fill: 'forwards' });
      for (let i = 0; i < 20; i++) { const x = rnd(0, W), sz = rnd(14, 26), sw = rnd(20, 60); const f = node(`width:${sz}px;height:${sz}px;opacity:0`, 'giftbit', SNOWFLAKE); anim(f, [{ transform: `translate(${x}px,-30px) rotate(0deg)`, opacity: 0.95 }, { transform: `translate(${x + sw}px,${H * 0.35}px) rotate(120deg)`, opacity: 0.95, offset: 0.4 }, { transform: `translate(${x - sw}px,${H * 0.7}px) rotate(240deg)`, opacity: 0.9, offset: 0.75 }, { transform: `translate(${x + sw / 2}px,${H + 20}px) rotate(360deg)`, opacity: 0 }], { duration: rnd(2400, 3400), delay: 800 + rnd(0, 700), fill: 'forwards' }); }
      keepFor(3900);
    });
  } else if (kind === 'petals') {   // a bouquet fountain: roses shoot up, burst into petals, hearts float up
    SND.play('chime');
    const n = 7;
    for (let i = 0; i < n; i++) {
      const x = W * (0.12 + (0.76 * i) / (n - 1)) + rnd(-18, 18), peak = H * rnd(0.18, 0.5), delay = i * 110, s0 = el('span', { class: 'giftfly' }, giftEl('rose', rnd(46, 66))); s0.style.opacity = '0'; fx.append(s0);
      anim(s0, [{ transform: `translate(${x}px,${H + 40}px) rotate(${rnd(-30, 30)}deg) scale(.7)`, opacity: 1 }, { transform: `translate(${x + rnd(-30, 30)}px,${peak}px) rotate(${rnd(-90, 90)}deg) scale(1.25)`, opacity: 1, offset: 0.62 }, { transform: `translate(${x + rnd(-60, 60)}px,${peak + 40}px) rotate(${rnd(-160, 160)}deg) scale(.2)`, opacity: 0 }], { duration: 1500, delay, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
      later(delay + 920, () => {
        glowAt(x, peak, '#ff6b8f', 150, 700);
        for (let k = 0; k < 7; k++) { const pt = el('span', { class: 'giftbit' }, giftEl('petal', rnd(14, 26))); fx.append(pt); const dx = rnd(-110, 110), sw = rnd(25, 60); anim(pt, [{ transform: `translate(${x}px,${peak}px) rotate(0deg) scale(.4)`, opacity: 1 }, { transform: `translate(${x + dx}px,${peak + H * 0.18}px) rotate(${rnd(90, 240)}deg) scale(1)`, opacity: 1, offset: 0.3 }, { transform: `translate(${x + dx + sw}px,${peak + H * 0.4}px) rotate(${rnd(240, 420)}deg) scale(1)`, opacity: 1, offset: 0.65 }, { transform: `translate(${x + dx - sw}px,${H + 40}px) rotate(${rnd(420, 700)}deg) scale(.9)`, opacity: 0.2 }], { duration: rnd(2000, 3000), fill: 'forwards' }); }
        if (i % 2 === 0) SND.play('chime');
      });
    }
    for (let i = 0; i < 12; i++) { const x = rnd(0.05, 0.95) * W, sz = rnd(22, 40), hh = el('span', { class: 'giftbit' }, giftEl('heart', sz)); fx.append(hh); anim(hh, [{ transform: `translate(${x}px,${H + 30}px) scale(.5)`, opacity: 0 }, { transform: `translate(${x + 30}px,${H * 0.7}px) scale(1)`, opacity: 1, offset: 0.2 }, { transform: `translate(${x - 30}px,${H * 0.35}px) scale(1.05)`, opacity: 1, offset: 0.6 }, { transform: `translate(${x + 20}px,${-40}px) scale(1.1)`, opacity: 0 }], { duration: rnd(2200, 3200), delay: 500 + i * 130, fill: 'forwards' }); }
    later(900, () => { glowAt(W / 2, H * 0.4, '#ff6b9a', toMe ? 520 : 380, 1500); shapeBurst(W / 2, H * 0.36, toMe ? 1.1 : 0.9, ['#ff4d8d', '#ff8fb8', '#ffd0e0', '#fff'], 'heart', 44, 1900); SND.play('chime'); });
    for (let i = 0; i < 14; i++) { const sx = rnd(0.05, 0.95) * W, sy = rnd(0.15, 0.85) * H, sz = rnd(12, 22); const st = node(`left:${sx - sz / 2}px;top:${sy - sz / 2}px;width:${sz}px;height:${sz}px;opacity:0`, 'giftbit', '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 1l2.600 8.400L23 12l-8.400 2.600L12 23l-2.600-8.400L1 12l8.400-2.600z" fill="#ffd0e8"/></svg>'); anim(st, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1) rotate(30deg)', opacity: 1, offset: 0.4 }, { transform: 'scale(0)', opacity: 0 }], { duration: 1000, delay: 400 + i * 160, fill: 'forwards' }); }
    if (toMe) { const big = node(`left:${W / 2 - 80}px;top:${H * 0.38 - 80}px;width:160px;height:160px;opacity:0`, 'giftbit'); big.append(giftEl('heart', 160)); anim(big, [{ transform: 'scale(.1)', opacity: 0 }, { transform: 'scale(1.2)', opacity: 1, offset: 0.3 }, { transform: 'scale(1)', opacity: 1, offset: 0.55 }, { transform: 'scale(1.4)', opacity: 0 }], { duration: 1600, delay: 700, fill: 'forwards' }); }
    keepFor(4600);
  } else if (kind === 'confetti') {   // party cannons from both bottom corners, ribbons, and a confetti rain
    const cols = ['#ffd23f', '#ff5a8a', '#4fc3ff', '#7be08f', '#b77bff', '#ff7a1f'];
    fly(fromX, fromY, tx, H * 0.55, { size: 58, dur: 520, spin: 200, grow: 1.2, ghosts: 2 }, () => {
      SND.play('pop');
      [[0, H, -Math.PI * 0.32], [W, H, -Math.PI * 0.68]].forEach(([cx, cy, ang0], side) => {
        glowAt(cx, cy, '#fff7c2', 240, 500); pop(side ? W * 0.82 : W * 0.18, H * 0.78, 'POP!', pick(cols), 44, side ? 8 : -8);
        for (let i = 0; i < 34; i++) part(cx, cy, { ang: ang0 + rnd(-0.55, 0.55), spd: rnd(700, 1500), g: 1100, life: rnd(1500, 2400), w: rnd(6, 11), h: rnd(10, 18), color: pick(cols), round: false, spin: rnd(-900, 900), end: 0.9 });
        for (let i = 0; i < 8; i++) part(cx, cy, { ang: ang0 + rnd(-0.35, 0.35), spd: rnd(600, 1200), g: 700, life: rnd(1600, 2400), w: 5, h: rnd(60, 110), color: pick(cols), round: false, spin: rnd(-500, 500), end: 0.9 });
      });
      later(260, () => { SND.play('pop'); burstConfetti(); });
      later(560, () => SND.play('chime'));
      // balloons floating up with a sway, each with a highlight and a string
      later(350, () => SND.play('balloons'));
      const bcols = ['#ff5a8a', '#4fb4ff', '#ffd23f', '#7be08f', '#b77bff', '#ff8a1f'];
      for (let i = 0; i < 8; i++) {
        const bx2 = W * (0.08 + (0.84 * i) / 7) + rnd(-18, 18), bw = rnd(46, 64), c = bcols[i % bcols.length], dur = rnd(2800, 3800), sw = rnd(14, 28);
        const bl = node(`left:0;top:0;width:${bw}px;height:${bw * 1.5}px;opacity:0`, 'giftbit', `<svg viewBox="0 0 40 60" width="100%" height="100%"><path d="M20 58q-3 0-1 -4h2q2 4-1 4z" fill="${c}"/><path d="M20 56q-4 4 0 8-4 4 0 8" stroke="#fff" stroke-width="1" fill="none" opacity=".7"/><ellipse cx="20" cy="22" rx="17" ry="21" fill="${c}"/><ellipse cx="13" cy="13" rx="4.500" ry="7" fill="#fff" opacity=".45" transform="rotate(25 13 13)"/><path d="M17 43l3 4 3-4z" fill="${c}"/></svg>`);
        anim(bl, [{ transform: `translate(${bx2}px,${H + 60}px) rotate(-4deg)`, opacity: 1 }, { transform: `translate(${bx2 + sw}px,${H * 0.6}px) rotate(5deg)`, opacity: 1, offset: 0.35 }, { transform: `translate(${bx2 - sw}px,${H * 0.3}px) rotate(-5deg)`, opacity: 1, offset: 0.7 }, { transform: `translate(${bx2 + sw / 2}px,${-bw * 2}px) rotate(3deg)`, opacity: 1 }], { duration: dur, delay: 200 + i * 140, easing: 'ease-in-out', fill: 'forwards' }); keepFor(dur + 1600);
      }
      // glitter twinkles
      for (let i = 0; i < 22; i++) { const gx = rnd(0, W), gy = rnd(0, H * 0.8), gs = rnd(8, 16); const gl = node(`left:${gx - gs / 2}px;top:${gy - gs / 2}px;width:${gs}px;height:${gs}px;opacity:0`, 'giftbit', `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 1l2.600 8.400L23 12l-8.400 2.600L12 23l-2.600-8.400L1 12l8.400-2.600z" fill="${pick(cols)}"/></svg>`); anim(gl, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1) rotate(45deg)', opacity: 1, offset: 0.4 }, { transform: 'scale(0)', opacity: 0 }], { duration: 800, delay: 300 + rnd(0, 2200), fill: 'forwards' }); }
      keepFor(3600);
    });
  } else if (kind === 'rocket') {   // ignition on the pad, a wobbling climb with flame and smoke, then a firework finale
    const x0 = toMe ? W / 2 : W * rnd(0.25, 0.75), padY = H - 40, apexY = H * rnd(0.16, 0.24), x1 = x0 + rnd(-W * 0.12, W * 0.12), RS = 64;
    const smoke = (x, y, size, delay = 0, life = 1100) => { const d = node(`left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;background:radial-gradient(circle, rgba(235,238,245,.9), rgba(170,176,196,.55) 60%, rgba(120,126,150,0) 72%);opacity:0`, 'giftbit'); anim(d, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 0.85, offset: 0.2 }, { transform: 'scale(2.1)', opacity: 0 }], { duration: life, delay, fill: 'forwards' }); keepFor(life + delay + 100); };
    // 1) ignition: smoke rolls out sideways on the pad, sparks, a small rumble
    SND.play('sizzle'); shake(260);
    for (let i = 0; i < 9; i++) { const sx = x0 + rnd(-50, 50); smoke(sx, padY + rnd(-6, 8), rnd(40, 78), i * 45, 1300); }
    for (let i = 0; i < 14; i++) part(x0, padY, { ang: -Math.PI / 2 + rnd(-1.3, 1.3), spd: rnd(120, 380), g: 900, life: rnd(500, 900), size: rnd(3, 7), color: pick(['#ffd23f', '#ff9a1f', '#fff']), end: 0.2, glow: true });
    // 2) the rocket: a flame that flickers, a wobbling climb along a curve
    const wrap = el('span', { class: 'giftfly' }); wrap.style.cssText = 'width:' + RS + 'px;height:' + (RS * 1.9) + 'px;transform-origin:50% 40%'; fx.append(wrap);
    const art = giftEl('rocket', RS); art.style.cssText += ';position:absolute;left:0;top:0'; wrap.append(art);
    const flame = el('i', { class: 'giftbit' }); flame.style.cssText = `position:absolute;left:${RS * 0.28}px;top:${RS * 0.88}px;width:${RS * 0.44}px;height:${RS * 1.0}px;border-radius:50% 50% 60% 60%/30% 30% 70% 70%;background:linear-gradient(180deg,#fff7c0 0,#ffd23f 28%,#ff7a1f 65%,rgba(255,60,20,0) 100%);transform-origin:50% 0;filter:blur(.4px)`; wrap.append(flame);
    anim(flame, [{ transform: 'scaleY(.8) scaleX(.9)' }, { transform: 'scaleY(1.25) scaleX(1.05)' }, { transform: 'scaleY(.9) scaleX(.95)' }, { transform: 'scaleY(1.3) scaleX(1)' }], { duration: 160, iterations: Infinity, direction: 'alternate' });
    SND.play('whistle');
    const climbStart = 420, climbMs = 1150, N = 16, frames = [];
    const pos = (k) => { const e = k * k * (3 - 2 * k) * 0.35 + k * k * 0.65; return [x0 + (x1 - x0) * e + Math.sin(k * 11) * 9 * Math.min(1, k * 3), padY - (padY - apexY) * e]; };
    for (let i = 0; i <= N; i++) { const k = i / N, [px, py] = pos(k), [qx, qy] = pos(Math.min(1, k + 0.04)), ang = Math.atan2(qx - px, py - qy) * 57.3; frames.push({ transform: `translate(${px - RS / 2}px,${py - RS * 0.5}px) rotate(${ang}deg) scale(${0.8 + k * 0.45})`, offset: k }); }
    anim(wrap, frames, { duration: climbMs, delay: climbStart, easing: 'linear', fill: 'forwards' }); keepFor(climbStart + climbMs + 3600);
    const hold = anim(wrap, [{ transform: `translate(${x0 - RS / 2}px,${padY - RS * 0.5}px) rotate(0deg) scale(.8)` }, { transform: `translate(${x0 - RS / 2 + 3}px,${padY - RS * 0.5 - 2}px) rotate(1.5deg) scale(.8)` }, { transform: `translate(${x0 - RS / 2 - 3}px,${padY - RS * 0.5 - 1}px) rotate(-1.5deg) scale(.8)` }], { duration: 90, iterations: Math.ceil(climbStart / 90), direction: 'alternate' });
    for (let i = 0; i < 26; i++) { const k = i / 26, [px, py] = pos(k); later(climbStart + k * climbMs, () => { smoke(px + rnd(-6, 6), py + RS * 0.75, rnd(26, 52), 0, 1100); part(px, py + RS * 0.7, { ang: Math.PI / 2 + rnd(-0.5, 0.5), spd: rnd(120, 300), g: 300, life: rnd(400, 800), size: rnd(3, 7), color: pick(['#ffd23f', '#ff9a1f', '#fff3c0']), end: 0.1, glow: true }); }); }
    // 3) the finale
    later(climbStart + climbMs, () => {
      wrap.remove(); const bx = x1, by = apexY;
      SND.play('boom'); shake(toMe ? 260 : 220); flash('#fff3c2', 0.28, 380);
      glowAt(bx, by, '#ffd23f', 380, 900); ring(bx, by, '#fff', 170, 700, 5); ring(bx, by, '#ffb02e', 120, 800, 4, 90);
      for (let i = 0; i < 56; i++) part(bx, by, { ang: (i / 56) * Math.PI * 2 + rnd(-0.04, 0.04), spd: rnd(260, 560), g: 480, life: rnd(1200, 2000), size: rnd(6, 10), color: pick(['#ffd23f', '#ff9a1f', '#fff3c0', '#ff5a3c']), end: 0.15, glow: true });
      for (let i = 0; i < 18; i++) part(bx, by, { ang: rnd(0, Math.PI * 2), spd: rnd(120, 260), g: 700, life: rnd(2000, 2800), size: rnd(4, 6), color: '#ffe9a0', end: 0.2, glow: true });
      [['#ff4d6d', -150, 40], ['#4fe0ff', 150, 70], ['#b77bff', 0, 110]].forEach(([col, dx, dy], i) => later(260 + i * 170, () => { SND.play('pop'); glowAt(bx + dx, by + dy, col, 200, 700); ring(bx + dx, by + dy, col, 90, 700, 3); for (let k = 0; k < 28; k++) part(bx + dx, by + dy, { ang: (k / 28) * Math.PI * 2, spd: rnd(140, 260), g: 380, life: rnd(1100, 1700), size: rnd(5, 8), color: col, end: 0.15, glow: true }); }));
      pop(bx, by + 150, 'WHOOSH!', '#ff7a1f', toMe ? 50 : 40, 6); later(300, () => SND.play('crackle')); later(900, () => SND.play('crackle')); keepFor(3400);
    });
  } else if (kind === 'boom') {   // the bomb is thrown, lands with a thud, its fuse burns down while it shakes and glows, then a fireball
    const bs = toMe ? 130 : 88, FUSE = 1500, LAND = 650, R = toMe ? Math.min(W, H) * 0.34 : 190;
    const wrap = el('span', { class: 'giftfly' }); wrap.style.cssText = `width:${bs}px;height:${bs}px;transform-origin:50% 85%`; fx.append(wrap);
    const art = giftEl('bomb', bs); art.style.cssText += ';position:absolute;left:0;top:0;filter:drop-shadow(0 6px 8px rgba(0,0,0,.45)) drop-shadow(0 0 6px rgba(255,255,255,.4))'; wrap.append(art);
    const glow = node(`left:${tx - bs}px;top:${ty - bs}px;width:${bs * 2}px;height:${bs * 2}px;border-radius:50%;background:radial-gradient(circle, rgba(255,60,40,.85), rgba(255,60,40,0) 65%);opacity:0`, 'giftbit');
    const base = `translate(${tx - bs / 2}px,${ty - bs / 2}px)`;
    SND.play('throw');
    // 1) the throw: an arc with spin, then a squashed landing
    anim(wrap, [{ transform: `translate(${fromX - bs / 2}px,${fromY}px) rotate(0deg) scale(.55)` }, { transform: `translate(${(fromX + tx) / 2 - bs / 2}px,${Math.min(fromY, ty) - H * 0.2}px) rotate(360deg) scale(1)`, offset: 0.55 }, { transform: `${base} rotate(700deg) scale(1.05, .9)`, offset: 0.86 }, { transform: `${base} rotate(720deg) scale(.92, 1.1)`, offset: 0.93 }, { transform: `${base} rotate(720deg) scale(1)` }], { duration: LAND, easing: 'ease-in', fill: 'forwards' });
    later(LAND - 40, () => { SND.play('splat'); shake(160); ring(tx, ty + bs * 0.4, '#e8dcc8', bs * 0.9, 600, 6); for (let i = 0; i < 14; i++) part(tx + rnd(-bs / 2, bs / 2), ty + bs * 0.42, { ang: -Math.PI / 2 + rnd(-1.4, 1.4), spd: rnd(80, 240), g: 500, life: rnd(500, 900), size: rnd(8, 18), color: 'rgba(214,200,176,.7)', end: 1.6 }); });
    // 2) the fuse burns: it wobbles harder and harder, glows red, sparks fly from the fuse tip, 3-2-1
    later(LAND, () => {
      SND.play('sizzle');
      const wob = []; const steps = 28;
      for (let i = 0; i <= steps; i++) { const k = i / steps, amp = 2 + k * k * 9, sc = 1 + k * k * 0.22; wob.push({ transform: `${base} rotate(${(i % 2 ? 1 : -1) * amp}deg) scale(${sc})`, offset: k }); }
      anim(wrap, wob, { duration: FUSE, easing: 'linear', fill: 'forwards' });
      anim(glow, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 0.25, transform: 'scale(.9)', offset: 0.3 }, { opacity: 0.55, transform: 'scale(1)', offset: 0.6 }, { opacity: 0.9, transform: 'scale(1.25)' }], { duration: FUSE, fill: 'forwards', easing: 'ease-in' });
      anim(art, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.4) sepia(.6) hue-rotate(-30deg) saturate(3)', offset: 0.5 }, { filter: 'brightness(2.2) sepia(1) hue-rotate(-20deg) saturate(5)' }], { duration: FUSE, fill: 'forwards', easing: 'ease-in' });
      const fx0 = tx + bs * 0.22, fy0 = ty - bs * 0.44;
      for (let i = 0; i < 34; i++) later(i * (FUSE / 34), () => { part(fx0 + rnd(-3, 3), fy0, { ang: -Math.PI / 2 + rnd(-1.4, 1.4), spd: rnd(120, 340), g: 700, life: rnd(300, 650), size: rnd(3, 6), color: pick(['#ffd23f', '#ff9a1f', '#fff3c0']), end: 0.2, glow: true }); });
      const al = node(`left:${tx - bs * 0.62}px;top:${ty - bs * 0.62}px;width:${bs * 1.24}px;height:${bs * 1.24}px;border-radius:50%;border:4px solid #ff4d4d;opacity:0`, 'giftbit');
      anim(al, [{ transform: 'scale(.6)', opacity: 0.9 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: 500, iterations: 3, delay: 100, fill: 'forwards' });
      const cd = node(`left:${tx}px;top:${ty - bs * 0.92}px;font:900 70px/1 Inter,system-ui,sans-serif;color:#ff4d4d;-webkit-text-stroke:3px #fff;paint-order:stroke fill;text-shadow:0 6px 0 rgba(0,0,0,.25);opacity:0`, 'giftbit');
      [3, 2, 1].forEach((n, i) => later(i * (FUSE / 3), () => { SND.play('beep'); cd.textContent = String(n); anim(cd, [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.35)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%,-50%) scale(.9)', opacity: i === 2 ? 0 : 0.9 }], { duration: FUSE / 3 - 20, fill: 'forwards' }); }));
    });
    // 3) the blast
    later(LAND + FUSE, () => {
      wrap.remove(); glow.remove(); SND.play('boom'); shake(toMe ? 420 : 600);
      if (!reduceFx()) { const e = atkEngine(); e.cv.style.zIndex = '261'; e.explosion(tx, ty, toMe ? 1.5 : 1); e.ring(tx, ty, R * 1.3, [255, 220, 150], 650, 10); later(250, () => e.smoke(tx, ty, toMe ? 16 : 10, { size: [30, R * 0.5], life: [1100, 1900] })); setTimeout(() => e.stop(), 2600); } flash('#fff', toMe ? 0.4 : 0.7, 200); if (!toMe) flash('#ff9d2e', 0.4, 700, 90);
      // scorch mark that lingers a moment
      const sc = node(`left:${tx - R * 0.7}px;top:${ty - R * 0.28}px;width:${R * 1.4}px;height:${R * 0.56}px;border-radius:50%;background:radial-gradient(ellipse, rgba(10,8,8,.7), rgba(10,8,8,0) 70%);opacity:0`, 'giftbit'); anim(sc, [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0.8, offset: 0.7 }, { opacity: 0 }], { duration: 2400, fill: 'forwards' });
      // the fireball: three layers bursting outwards
      [['rgba(255,60,30,0)', '#ff3d1f', 1.0, 0], ['rgba(255,150,30,0)', '#ff9a1f', 0.74, 40], ['rgba(255,250,200,0)', '#fff3b8', 0.46, 80]].forEach(([c0, c1, f, dl]) => { const d = node(`left:${tx - R * f}px;top:${ty - R * f}px;width:${R * 2 * f}px;height:${R * 2 * f}px;border-radius:50%;background:radial-gradient(circle, ${c1} 0 35%, ${c1}cc 55%, ${c0} 72%);opacity:0;filter:blur(1px)`, 'giftbit'); anim(d, [{ transform: 'scale(.1)', opacity: 1 }, { transform: 'scale(1)', opacity: 1, offset: 0.35 }, { transform: 'scale(1.25)', opacity: 0 }], { duration: 900, delay: dl, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' }); });
      ring(tx, ty, '#fff', R * 1.5, 700, 9); ring(tx, ty, '#ffb02e', R * 1.2, 900, 6, 90);
      const bb = node(`left:${tx - R * 0.5}px;top:${ty - R * 0.5}px;width:${R}px;height:${R}px;opacity:0`, 'giftbit'); bb.append(giftEl('burst', R)); anim(bb, [{ transform: 'scale(.2) rotate(-10deg)', opacity: 1 }, { transform: 'scale(1.1) rotate(6deg)', opacity: 1, offset: 0.4 }, { transform: 'scale(1.25) rotate(10deg)', opacity: 0 }], { duration: 800, fill: 'forwards' });
      for (let i = 0; i < (toMe ? 34 : 46); i++) part(tx, ty, { ang: rnd(0, Math.PI * 2), spd: rnd(240, toMe ? 760 : 1000), g: 900, life: rnd(900, 1700), size: rnd(6, 15), color: pick(['#2b2f3f', '#3a3f55', '#ff7a1f', '#ffd23f']), spin: rnd(-720, 720), end: 0.3 });
      for (let i = 0; i < 22; i++) part(tx, ty, { ang: rnd(0, Math.PI * 2), spd: rnd(160, 520), g: 500, life: rnd(1300, 2200), size: rnd(3, 6), color: pick(['#ffd23f', '#ff9a1f', '#fff']), end: 0.2, glow: true });
      // a mushroom of smoke climbing up from the blast
      for (let i = 0; i < 8; i++) { const sx = tx + rnd(-R * 0.18, R * 0.18), size = R * rnd(0.5, 0.8); const sm = node(`left:${sx - size / 2}px;top:${ty - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;background:radial-gradient(circle, rgba(88,92,108,.85), rgba(60,64,80,.55) 60%, rgba(60,64,80,0) 72%);opacity:0`, 'giftbit'); anim(sm, [{ transform: 'translateY(0) scale(.3)', opacity: 0 }, { transform: `translateY(${-R * (0.3 + i * 0.1)}px) scale(.9)`, opacity: 0.9, offset: 0.35 }, { transform: `translateY(${-R * (0.8 + i * 0.12)}px) scale(${1.4 + i * 0.12})`, opacity: 0 }], { duration: 2300, delay: 150 + i * 70, easing: 'ease-out', fill: 'forwards' }); }
      pop(tx, ty - R * 0.95, 'BOOM!', '#ff5a3c', toMe ? 60 : 56, -7, 80);
      later(250, () => SND.play('crackle')); later(900, () => SND.play('crackle')); keepFor(3600);
    });
    keepFor(LAND + FUSE + 3800);
  } else if (kind === 'splash') {   // a water balloon: it swells and wobbles, bursts, a wave crashes down and the screen is left beaded with water
    const cv = document.createElement('canvas'), dpr = Math.min(2, devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr; cv.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none`; fx.append(cv);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const T0 = performance.now(), DUR = 3300, FLY = 560, SWELL = 420, POP = FLY + SWELL, sc = toMe ? 1 : 0.45;
    const cx = toMe ? W / 2 : tx, cy = toMe ? H * 0.45 : ty, R0 = 34, R1 = toMe ? Math.min(W, H) * 0.34 : 70;
    const shreds = [], drops = [], spray = [];
    let popped = false, last = T0;
    SND.play('throw');
    const burst = () => {
      popped = true; SND.play('splat'); SND.play('pop'); SND.play('boom'); if (toMe) shake(320);
      for (let i = 0; i < 9; i++) { const a2 = (i / 9) * 6.283 + rnd(-.2, .2); shreds.push({ x: cx + Math.cos(a2) * R1 * .9, y: cy + Math.sin(a2) * R1 * .9, vx: Math.cos(a2) * rnd(500, 900) * sc, vy: Math.sin(a2) * rnd(500, 900) * sc - 200, rot: rnd(0, 6), vr: rnd(-12, 12), w: rnd(22, 40) * (toMe ? 1 : .5) }); }
      for (let i = 0; i < (toMe ? 260 : 90); i++) { const a2 = rnd(0, 6.283), v = rnd(200, 1300) * sc; spray.push({ x: cx + Math.cos(a2) * R1 * rnd(.2, .9), y: cy + Math.sin(a2) * R1 * rnd(.2, .9), vx: Math.cos(a2) * v, vy: Math.sin(a2) * v - 150, r: rnd(2, 7) * (toMe ? 1 : .6), life: rnd(500, 1100), t: 0 }); }
      // water left on the glass: beads of every size that slowly slide down
      const nd = toMe ? 70 : 18;
      for (let i = 0; i < nd; i++) { const r = toMe ? (Math.random() < .2 ? rnd(14, 26) : rnd(4, 12)) : rnd(3, 9); drops.push({ x: toMe ? rnd(0, W) : cx + rnd(-90, 90), y: toMe ? rnd(0, H) : cy + rnd(-60, 70), r, v: r > 10 ? rnd(30, 90) : rnd(0, 18), delay: rnd(0, 400), trail: [] }); }
      pop(toMe ? W / 2 : cx, toMe ? H * 0.16 : cy - 90, 'SPLOOSH!', '#2f8fff', toMe ? 58 : 36, -6);
    };
    const bead = (x, y, r, a) => {   // a drop of water: refracts darker at the bottom, a bright highlight on top
      const gr = g.createRadialGradient(x - r * .3, y - r * .35, r * .1, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${.85 * a})`); gr.addColorStop(.35, `rgba(200,230,255,${.35 * a})`); gr.addColorStop(.8, `rgba(60,130,210,${.45 * a})`); gr.addColorStop(1, `rgba(20,70,150,${.6 * a})`);
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r * .92, r, 0, 0, 6.283); g.fill();
      g.fillStyle = `rgba(255,255,255,${.9 * a})`; g.beginPath(); g.ellipse(x - r * .32, y - r * .38, r * .22, r * .14, -.5, 0, 6.283); g.fill();
    };
    const frame = (now) => {
      const t = now - T0, dt = Math.min(.05, (now - last) / 1000); last = now; if (t > DUR) { cv.remove(); return; }
      g.clearRect(0, 0, W, H);
      const A = t > DUR - 700 ? (DUR - t) / 700 : 1;
      if (!popped) {
        // flight then a swell: the balloon grows and wobbles like jelly, a sheen sliding over it
        let x, y, r, sx = 1, sy = 1;
        if (t < FLY) { const k = t / FLY, e = 1 - Math.pow(1 - k, 2); x = fromX + (cx - fromX) * e; y = fromY + (cy - fromY) * e - Math.sin(k * Math.PI) * H * .2; r = R0 * (.8 + .4 * k); sx = 1 + .12 * Math.sin(t / 50); sy = 2 - sx; }
        else { const k = (t - FLY) / SWELL; x = cx; y = cy; r = R0 + (R1 - R0) * (1 - Math.pow(1 - k, 3)); const wob = Math.sin(k * 28) * .09 * (1 - k * .3); sx = 1 + wob; sy = 1 - wob; if (k > .85) { sx += (k - .85) * 1.4; sy += (k - .85) * .8; } }
        g.save(); g.translate(x, y); g.scale(sx, sy);
        const bg = g.createRadialGradient(-r * .35, -r * .4, r * .1, 0, 0, r); bg.addColorStop(0, 'rgba(210,240,255,.95)'); bg.addColorStop(.45, 'rgba(58,168,255,.9)'); bg.addColorStop(1, 'rgba(18,80,170,.95)');
        g.fillStyle = bg; g.beginPath(); g.ellipse(0, 0, r * .92, r, 0, 0, 6.283); g.fill();
        g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(-r * .38, -r * .45, r * .2, r * .32, .5, 0, 6.283); g.fill();
        g.fillStyle = '#1d63c4'; g.beginPath(); g.moveTo(-r * .08, r * .98); g.lineTo(0, r * 1.12); g.lineTo(r * .08, r * .98); g.fill();   // the knot
        g.restore();
        if (t >= POP) burst();
      } else {
        const pt = t - POP;
        // the wave: a sheet of water crashing down from the top with a foamy edge
        if (toMe && pt < 1100) { const k = Math.min(1, pt / 520), edge = H * 1.15 * (1 - Math.pow(1 - k, 2)), fade = pt > 600 ? 1 - (pt - 600) / 500 : 1;
          const wg = g.createLinearGradient(0, edge - H * .6, 0, edge); wg.addColorStop(0, `rgba(40,120,220,${.0 * fade})`); wg.addColorStop(.6, `rgba(70,160,240,${.35 * fade})`); wg.addColorStop(1, `rgba(150,215,255,${.55 * fade})`);
          g.fillStyle = wg; g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); for (let x = W; x >= 0; x -= 16) g.lineTo(x, edge + Math.sin(x * .04 + pt * .02) * 14); g.closePath(); g.fill();
          g.fillStyle = `rgba(240,250,255,${.8 * fade})`; for (let x = 0; x <= W; x += 10) { const yy = edge + Math.sin(x * .04 + pt * .02) * 14; g.beginPath(); g.arc(x, yy, 4 + 3 * Math.sin(x * .3 + pt * .03), 0, 6.283); g.fill(); } }
        // spray
        for (const p2 of spray) { p2.t += dt * 1000; if (p2.t > p2.life) continue; p2.vy += 1500 * dt; p2.x += p2.vx * dt; p2.y += p2.vy * dt; bead(p2.x, p2.y, p2.r, 1 - p2.t / p2.life); }
        // rubber shreds
        for (const sh of shreds) { sh.vy += 1600 * dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.rot += sh.vr * dt; g.save(); g.translate(sh.x, sh.y); g.rotate(sh.rot); g.globalAlpha = A; g.fillStyle = '#2a86e6'; g.beginPath(); g.moveTo(-sh.w / 2, 0); g.quadraticCurveTo(0, -sh.w * .4, sh.w / 2, 0); g.quadraticCurveTo(0, sh.w * .15, -sh.w / 2, 0); g.fill(); g.restore(); }
        // beads on the glass, sliding with wet trails, and a ripple of light over them
        for (const dr of drops) { if (pt < dr.delay) continue; dr.y += dr.v * dt; if (dr.v > 20) { dr.trail.push([dr.x, dr.y]); if (dr.trail.length > 40) dr.trail.shift(); }
          if (dr.trail.length > 1) { g.strokeStyle = `rgba(170,215,255,${.25 * A})`; g.lineWidth = dr.r * .9; g.lineCap = 'round'; g.beginPath(); dr.trail.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke(); }
          bead(dr.x, dr.y, dr.r * Math.min(1, (pt - dr.delay) / 120), A); }
        if (toMe && pt < 2200) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = .12 * A; g.strokeStyle = '#bfe6ff'; g.lineWidth = 2; for (let i = 0; i < 6; i++) { const yy = (pt * .15 + i * H / 6) % H; g.beginPath(); for (let x = 0; x <= W; x += 12) g.lineTo(x, yy + Math.sin(x * .03 + i + pt * .004) * 10); g.stroke(); } g.restore(); }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    keepFor(DUR + 200);
  } else if (kind === 'kiss') {   // a romantic moment: pink haze, glossy lips pucker and blow a kiss, prints stamped around, a big heart bursts into a shower of hearts
    const cv = document.createElement('canvas'), dpr = Math.min(2, devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr; cv.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none`; fx.append(cv);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const T0 = performance.now(), DUR = 3400, cx = toMe ? W / 2 : tx, cy = toMe ? H * .42 : ty, S = toMe ? Math.min(W, H) * .5 : 120;
    const bokeh = Array.from({ length: toMe ? 26 : 8 }, () => ({ x: toMe ? rnd(0, W) : cx + rnd(-120, 120), y: toMe ? rnd(0, H) : cy + rnd(-90, 90), r: rnd(8, 26) * (toMe ? 1 : .6), v: rnd(10, 30), ph: rnd(0, 6.28) }));
    const prints = (toMe ? [[.24, .2, -18], [.78, .3, 14], [.22, .72, 10], [.74, .8, -12]] : [[0, 0, -10]]).map(([fx2, fy2, rot], i) => ({ x: toMe ? W * fx2 : cx + rnd(-30, 30), y: toMe ? H * fy2 : cy + rnd(-20, 20), rot: rot * Math.PI / 180, at: 900 + i * 220, s: toMe ? rnd(.32, .42) : .5 }));
    const hearts = [];
    let burst = false, last = T0;
    const lipPath = (w, h, pucker) => {   // upper lip with its cupid's bow, lower lip fuller; pucker pulls the corners in
      const k = 1 - pucker * .35, up = new Path2D(), lo = new Path2D();
      up.moveTo(-w * k, 0); up.bezierCurveTo(-w * .7 * k, -h * .55, -w * .28, -h * .95, -w * .02, -h * .42); up.bezierCurveTo(0, -h * .38, 0, -h * .38, w * .02, -h * .42); up.bezierCurveTo(w * .28, -h * .95, w * .7 * k, -h * .55, w * k, 0); up.bezierCurveTo(w * .5 * k, -h * .12, -w * .5 * k, -h * .12, -w * k, 0);
      lo.moveTo(-w * k, 0); lo.bezierCurveTo(-w * .5 * k, h * .12, w * .5 * k, h * .12, w * k, 0); lo.bezierCurveTo(w * .65 * k, h * 1.05, -w * .65 * k, h * 1.05, -w * k, 0);
      return [up, lo];
    };
    const drawLips = (x, y, w, h, rot, pucker, a, gloss, lines) => {
      g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = a; const [up, lo] = lipPath(w, h, pucker);
      const lg = g.createLinearGradient(0, -h, 0, h); lg.addColorStop(0, '#ff6a9a'); lg.addColorStop(.5, '#e8195c'); lg.addColorStop(1, '#a30d3f');
      g.fillStyle = lg; g.fill(up); g.fill(lo);
      if (lines) { g.strokeStyle = 'rgba(110,0,35,.35)'; g.lineWidth = Math.max(1, w * .012); for (let i = -6; i <= 6; i++) { const lx = i * w * .12; g.beginPath(); g.moveTo(lx, -h * .05); g.quadraticCurveTo(lx * 1.05, h * .4, lx * .9, h * .78); g.stroke(); g.beginPath(); g.moveTo(lx, -h * .06); g.quadraticCurveTo(lx * 1.05, -h * .32, lx * .92, -h * .55); g.stroke(); } }
      g.strokeStyle = 'rgba(90,0,30,.5)'; g.lineWidth = Math.max(1.2, w * .02); g.beginPath(); g.moveTo(-w * (1 - pucker * .35), 0); g.bezierCurveTo(-w * .4, h * .1, w * .4, h * .1, w * (1 - pucker * .35), 0); g.stroke();
      if (gloss) { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(-w * .1, h * .45, w * .3, h * .1, 0, 0, 6.283); g.fill(); g.beginPath(); g.ellipse(-w * .42, -h * .45, w * .12, h * .06, -.4, 0, 6.283); g.fill(); }
      g.restore();
    };
    const heart = (x, y, r, rot, flip, col, a) => { g.save(); g.translate(x, y); g.rotate(rot); g.scale(Math.max(.1, Math.abs(flip)), 1); g.globalAlpha = a; g.fillStyle = col; g.beginPath(); g.moveTo(0, r * .35); g.bezierCurveTo(-r * 1.1, -r * .35, -r * .5, -r * 1.05, 0, -r * .45); g.bezierCurveTo(r * .5, -r * 1.05, r * 1.1, -r * .35, 0, r * .35); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(-r * .35, -r * .5, r * .16, r * .1, -.6, 0, 6.283); g.fill(); g.restore(); };
    SND.play('whoosh'); later(420, () => SND.play('chime'));
    pop(toMe ? W / 2 : cx, toMe ? H * .12 : cy - 90, 'MWAH!', '#ff3d7f', toMe ? 58 : 36, -6, 520);
    const frame = (now) => {
      const t = now - T0, dt = Math.min(.05, (now - last) / 1000); last = now; if (t > DUR) { cv.remove(); return; }
      g.clearRect(0, 0, W, H);
      const A = Math.min(1, t / 300) * (t > DUR - 700 ? (DUR - t) / 700 : 1);
      if (toMe) { const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .2, W / 2, H / 2, Math.max(W, H) * .75); vg.addColorStop(0, 'rgba(255,120,170,0)'); vg.addColorStop(1, `rgba(255,70,140,${.38 * A})`); g.fillStyle = vg; g.fillRect(0, 0, W, H); }
      g.save(); g.globalCompositeOperation = 'lighter'; for (const b of bokeh) { const y = b.y - (t / 1000) * b.v, a2 = (.18 + .1 * Math.sin(t / 400 + b.ph)) * A; heart(b.x, y, b.r, 0, 1, `rgba(255,140,190,${a2})`, 1); } g.restore();
      // the giant lips: rise in, pucker twice, blow the kiss (lean forward, then fade)
      if (t < 1500) { const k = Math.min(1, t / 350), pk = t < 350 ? 0 : t < 1100 ? .5 + .5 * Math.sin((t - 350) / 750 * Math.PI * 3) : 1, lean = t > 1100 ? (t - 1100) / 400 : 0, s2 = S * (.6 + .4 * (1 - Math.pow(1 - k, 3))) * (1 + lean * .5);
        drawLips(cx, cy, s2 * .5, s2 * .32, 0, pk, A * (1 - lean), true, false);
        if (t > 1050 && t < 1400) { const kk = (t - 1050) / 350; g.strokeStyle = `rgba(255,190,215,${.8 * (1 - kk)})`; g.lineWidth = 4; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(cx, cy, s2 * (.4 + kk * .8 + i * .12), 0, 6.283); g.stroke(); } } }
      // lipstick prints stamped one after another, with real lip lines
      for (const pr of prints) { if (t < pr.at) continue; const k = Math.min(1, (t - pr.at) / 160), sq = k < 1 ? 1.6 - .6 * k : 1; if (k >= 1 && !pr.done) { pr.done = true; SND.play('pop'); for (let i = 0; i < 5; i++) hearts.push({ x: pr.x, y: pr.y, vx: rnd(-120, 120), vy: rnd(-260, -120), r: rnd(6, 11), rot: rnd(-.5, .5), flip: rnd(0, 6), vf: rnd(6, 10), col: pick(['#ff4d8d', '#ff8fb8', '#ffc2d4']), life: 1400, t: 0 }); }
        drawLips(pr.x, pr.y, S * pr.s * sq, S * pr.s * .62 * sq, pr.rot, 0, A * .92 * Math.min(1, k * 2), false, true); }
      // the big heart: pulses, then bursts into a shower
      const ht = t - 1500;
      if (ht > 0 && !burst) { const k = Math.min(1, ht / 500), r = S * .42 * (k < 1 ? .3 + .7 * Math.sin(k * Math.PI / 2) : 1) * (1 + .08 * Math.sin(ht / 70)); heart(cx, cy + r * .2, r, 0, 1, '#ff2a6d', A); if (ht > 650) { burst = true; SND.play('chime'); SND.play('pop'); for (let i = 0; i < (toMe ? 70 : 24); i++) { const a2 = rnd(0, 6.283), v = rnd(200, 700) * (toMe ? 1 : .6); hearts.push({ x: cx, y: cy, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v - 200, r: rnd(7, 18) * (toMe ? 1 : .7), rot: rnd(-.6, .6), flip: rnd(0, 6), vf: rnd(5, 11), col: pick(['#ff2a6d', '#ff4d8d', '#ff8fb8', '#ffc2d4', '#ffffff']), life: rnd(1300, 2000), t: 0 }); } } }
      for (const h of hearts) { h.t += dt * 1000; if (h.t > h.life) continue; h.vx *= Math.pow(.3, dt); h.vy = h.vy * Math.pow(.3, dt) + 260 * dt; h.x += h.vx * dt + Math.sin(h.t / 200) * .6; h.y += h.vy * dt; h.flip += h.vf * dt; heart(h.x, h.y, h.r, h.rot, Math.cos(h.flip), h.col, A * Math.min(1, 1.6 - h.t / h.life)); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    keepFor(DUR + 200);
  } else if (kind === 'ghost') {   // a haunting: moonlit dark, fog rolls in, the lights flicker, a ghost drifts in, stares, then rushes the screen: BOO! and leaves frosty handprints
    const cv = document.createElement('canvas'), dpr = Math.min(2, devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr; cv.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none`; fx.append(cv);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const T0 = performance.now(), DUR = 3700, LUNGE = 2150, cx = toMe ? W / 2 : tx, cy = toMe ? H * 0.46 : ty, S = toMe ? Math.min(W, H) * 0.34 : 64;
    const fog = Array.from({ length: toMe ? 22 : 9 }, () => ({ x: toMe ? rnd(-100, W + 100) : cx + rnd(-130, 130), y: toMe ? rnd(H * 0.62, H * 1.05) : cy + rnd(10, 60), r: rnd(90, 210) * (toMe ? 1 : 0.45), v: rnd(-26, 26), ph: rnd(0, 6.28) }));
    const wisps = [], prints = [], trail = [];
    const side = fromX < W / 2 ? -1 : 1;
    const ghost = (x, y, s, a, ph, mouth, eyes, reach) => {
      g.save(); g.translate(x, y); g.globalAlpha = a;
      g.shadowColor = 'rgba(160,195,255,.95)'; g.shadowBlur = s * 0.35;
      const body = new Path2D(), hw = s * 0.5, top = -s * 0.62, hem = s * 0.58;
      body.moveTo(-hw, -s * 0.1); body.bezierCurveTo(-hw, top - s * 0.05, hw, top - s * 0.05, hw, -s * 0.1);
      body.bezierCurveTo(hw * 1.04, hem * 0.4, hw * 1.12, hem * 0.75, hw * 1.15, hem);
      for (let i = 0; i < 5; i++) { const x0 = hw * 1.15 - (i + 0.5) * (hw * 2.3 / 5), x1 = hw * 1.15 - (i + 1) * (hw * 2.3 / 5), dip = hem + s * (0.12 + 0.05 * Math.sin(ph * 3 + i * 1.7)) * (i % 2 ? -0.5 : 1); body.quadraticCurveTo(x0, dip, x1, hem + s * 0.04 * Math.sin(ph * 3 + i)); }
      body.bezierCurveTo(-hw * 1.12, hem * 0.75, -hw * 1.04, hem * 0.4, -hw, -s * 0.1); body.closePath();
      const bg = g.createRadialGradient(-s * 0.12, -s * 0.3, s * 0.05, 0, 0, s * 0.85); bg.addColorStop(0, 'rgba(255,255,255,.98)'); bg.addColorStop(0.55, 'rgba(232,240,255,.9)'); bg.addColorStop(1, 'rgba(170,190,240,.55)');
      g.fillStyle = bg; g.fill(body);
      // arms: drifting at its sides, reaching out for the lunge
      for (const sd of [-1, 1]) { g.beginPath(); const ax = sd * hw * 0.95, ay = s * 0.05; g.moveTo(ax, ay - s * 0.12); g.quadraticCurveTo(ax + sd * s * (0.28 + reach * 0.25), ay - s * (0.1 + reach * 0.35) + Math.sin(ph * 2 + sd) * s * 0.05, ax + sd * s * (0.32 + reach * 0.3), ay - s * (0.02 + reach * 0.4)); g.quadraticCurveTo(ax + sd * s * 0.12, ay + s * 0.08, ax, ay + s * 0.12); g.fill(); }
      g.shadowBlur = 0;
      // hollow eyes that glow before the lunge, and a mouth that opens into a howl
      for (const sd of [-1, 1]) { g.fillStyle = '#10162e'; g.beginPath(); g.ellipse(sd * s * 0.17, -s * 0.2, s * 0.085, s * (0.12 + mouth * 0.03), sd * 0.12, 0, 6.283); g.fill();
        if (eyes > 0) { const eg = g.createRadialGradient(sd * s * 0.17, -s * 0.2, 0, sd * s * 0.17, -s * 0.2, s * 0.16); eg.addColorStop(0, `rgba(160,255,240,${eyes})`); eg.addColorStop(0.35, `rgba(90,220,255,${eyes * 0.6})`); eg.addColorStop(1, 'rgba(90,220,255,0)'); g.fillStyle = eg; g.beginPath(); g.arc(sd * s * 0.17, -s * 0.2, s * 0.16, 0, 6.283); g.fill(); } }
      g.fillStyle = '#10162e'; g.beginPath(); g.ellipse(0, s * 0.06, s * (0.06 + mouth * 0.08), s * (0.05 + mouth * 0.2), 0, 0, 6.283); g.fill();
      if (mouth > 0.3) { g.fillStyle = 'rgba(60,30,80,.6)'; g.beginPath(); g.ellipse(0, s * (0.1 + mouth * 0.08), s * mouth * 0.05, s * mouth * 0.06, 0, 0, 6.283); g.fill(); }
      g.restore();
    };
    const hand = (x, y, s, rot, a) => {   // a frosty handprint left on the glass
      g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = a; g.shadowColor = 'rgba(200,225,255,.9)'; g.shadowBlur = s * 0.15; g.fillStyle = 'rgba(225,238,255,.42)';
      g.beginPath(); g.ellipse(0, s * 0.18, s * 0.34, s * 0.38, 0, 0, 6.283); g.fill();
      [[-0.32, -0.28, 0.1, 0.36, -0.28], [-0.12, -0.5, 0.1, 0.42, -0.08], [0.08, -0.54, 0.1, 0.44, 0.04], [0.26, -0.44, 0.09, 0.38, 0.18], [0.42, 0.02, 0.09, 0.3, 0.9]].forEach(([fx2, fy2, rw, rh, fr]) => { g.save(); g.translate(fx2 * s, fy2 * s); g.rotate(fr); g.beginPath(); g.ellipse(0, 0, rw * s, rh * s, 0, 0, 6.283); g.fill(); g.restore(); });
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(rnd(-s * 0.3, s * 0.3), rnd(-s * 0.2, s * 0.45), rnd(1, 2.5), 0, 6.283); g.fill(); }
      g.restore();
    };
    SND.play('whoosh'); later(500, () => SND.play('swoop'));
    let last = T0, booed = false;
    const frame = (now) => {
      const t = now - T0, dt = Math.min(0.05, (now - last) / 1000); last = now; if (t > DUR) { cv.remove(); return; }
      g.clearRect(0, 0, W, H);
      const A = Math.min(1, t / 450) * (t > DUR - 700 ? (DUR - t) / 700 : 1);
      // moonlit dark with a heavy vignette (only around the target when it is aimed at someone else)
      if (toMe) { g.fillStyle = `rgba(6,10,30,${0.55 * A})`; g.fillRect(0, 0, W, H); const vg = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.2, W / 2, H * 0.45, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,12,${0.6 * A})`); g.fillStyle = vg; g.fillRect(0, 0, W, H);
        const mg = g.createRadialGradient(W * 0.82, H * 0.1, 0, W * 0.82, H * 0.1, W * 0.5); mg.addColorStop(0, `rgba(170,200,255,${0.22 * A})`); mg.addColorStop(1, 'rgba(170,200,255,0)'); g.fillStyle = mg; g.fillRect(0, 0, W, H); }
      else { const vg = g.createRadialGradient(cx, cy, 20, cx, cy, 190); vg.addColorStop(0, `rgba(6,10,30,${0.5 * A})`); vg.addColorStop(1, 'rgba(6,10,30,0)'); g.fillStyle = vg; g.fillRect(cx - 200, cy - 200, 400, 400); }
      // fog creeping in from below
      const fk = Math.min(1, t / 1200);
      for (const f of fog) { const x = f.x + Math.sin(t / 1400 + f.ph) * 30 + f.v * t / 1000, y = f.y + (1 - fk) * 140 * (toMe ? 1 : 0.3); const fgr = g.createRadialGradient(x, y, 0, x, y, f.r); fgr.addColorStop(0, `rgba(190,205,240,${0.2 * A * fk})`); fgr.addColorStop(1, 'rgba(190,205,240,0)'); g.fillStyle = fgr; g.beginPath(); g.arc(x, y, f.r, 0, 6.283); g.fill(); }
      // the ghost
      let gx, gy, gs = S, ga = 0.78, mouth = 0, eyes = 0, reach = 0;
      if (t < 500) ga = 0;
      else if (t < 1900) { const k = (t - 500) / 1400, e = 1 - Math.pow(1 - k, 2);
        if (toMe) { gx = side < 0 ? -S + (cx + S) * e : W + S - (W + S - cx) * e; gy = cy + Math.sin(k * 7) * S * 0.25; }
        else { const ang = side < 0 ? Math.PI + k * Math.PI * 2.2 : -k * Math.PI * 2.2, rr = 70 * (1 - k * 0.4); gx = cx + Math.cos(ang) * rr; gy = cy - 30 + Math.sin(ang) * rr * 0.6; }
        ga = 0.78 * Math.min(1, (t - 500) / 400); }
      else if (t < LUNGE) { const k = (t - 1900) / 250; gx = cx; gy = toMe ? cy : cy - 34; gs = S * (1 - 0.1 * k); eyes = k; }
      else { const k = Math.min(1, (t - LUNGE) / 300), e = 1 - Math.pow(1 - k, 3); gx = cx; gy = (toMe ? cy : cy - 34) + e * S * 0.2; gs = S * (0.9 + e * (toMe ? 2.6 : 1.1)); ga = 0.78 + 0.22 * e; mouth = e; eyes = 1; reach = e;
        if (t > LUNGE + 380) ga = Math.max(0, 1 - (t - LUNGE - 380) / 300); }
      if (gx !== undefined && ga > 0.01) {
        trail.push([gx, gy, gs]); if (trail.length > 6) trail.shift();
        if (t < LUNGE) trail.forEach(([x, y, s2], i) => ghost(x, y, s2, ga * A * 0.08 * i, (t - 40 * (6 - i)) / 300, 0, 0, 0));
        ghost(gx, gy, gs, ga * A, t / 300, mouth, eyes, reach);
      }
      // BOO! the lunge: shake, a cold flash, wisps tear off, handprints slap onto the glass
      if (!booed && t >= LUNGE + 120) { booed = true; SND.play('roar'); shake(toMe ? 380 : 240); flash('#dfe8ff', toMe ? 0.5 : 0.3, 280);
        pop(toMe ? W / 2 : cx, toMe ? H * 0.16 : cy - 92, 'BOO!', '#7d8fe0', toMe ? 72 : 42, -5);
        for (let i = 0; i < (toMe ? 46 : 18); i++) { const a2 = rnd(0, 6.283), v = rnd(80, 380) * (toMe ? 1 : 0.5); wisps.push({ x: cx + Math.cos(a2) * S * 0.3, y: cy + Math.sin(a2) * S * 0.3, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v - 60, r: rnd(10, 28) * (toMe ? 1 : 0.5), life: rnd(900, 1500), t: 0, cu: rnd(-3, 3) }); }
        if (toMe) [[0.2, 0.3, -0.35], [0.8, 0.55, 0.3], [0.32, 0.74, 0.12], [0.7, 0.22, -0.18]].forEach(([px, py, r2], i) => later(140 + i * 120, () => { prints.push({ x: W * px, y: H * py, rot: r2, s: Math.min(W, H) * rnd(0.17, 0.22), at: performance.now() - T0 }); SND.play('splat'); }));
        else prints.push({ x: cx + 26, y: cy - 6, rot: 0.2, s: 44, at: t });
      }
      for (const p of prints) { const k = (t - p.at) / 160; hand(p.x, p.y, p.s * (k < 1 ? 1.25 - 0.25 * k : 1), p.rot, A * Math.min(1, k) * Math.max(0, Math.min(1, (DUR - 300 - t) / 900))); }
      for (const w of wisps) { w.t += dt * 1000; if (w.t > w.life) continue; w.vx *= Math.pow(0.15, dt); w.vy = w.vy * Math.pow(0.2, dt) - 40 * dt; w.x += (w.vx + Math.sin(w.t / 160 + w.cu) * 30) * dt; w.y += w.vy * dt; const a2 = 0.35 * A * (1 - w.t / w.life), r = w.r * (1 + w.t / w.life); const wg = g.createRadialGradient(w.x, w.y, 0, w.x, w.y, r); wg.addColorStop(0, `rgba(235,242,255,${a2})`); wg.addColorStop(1, 'rgba(235,242,255,0)'); g.fillStyle = wg; g.beginPath(); g.arc(w.x, w.y, r, 0, 6.283); g.fill(); }
      // the lights flicker as it arrives
      if (toMe && t > 250 && t < 1200 && Math.sin(t / 37) * Math.sin(t / 91) > 0.55) { g.fillStyle = `rgba(0,0,6,${0.55 * A})`; g.fillRect(0, 0, W, H); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    keepFor(DUR + 200);
  } else if (kind === 'zap') {   // a storm: the sky darkens, rain sweeps in, clouds roll and flicker, then a huge bolt cracks down
    const cv = document.createElement('canvas'), dpr = Math.min(2, devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr; cv.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none`; fx.append(cv);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const T0 = performance.now(), DUR = 3200, hitAt = 1250, hx = tx, hy = toMe ? H * 0.8 : ty;   // aimed at you it splits the whole screen
    const drops = Array.from({ length: 160 }, () => ({ x: rnd(-W * 0.3, W * 1.1), y: rnd(-H, H), v: rnd(900, 1500), l: rnd(14, 30) }));
    const base = H * (toMe ? 0.2 : 0.14), clouds = Array.from({ length: 34 }, (_, i) => { const x = (i / 33) * (W + 120) - 60; return { side: x < W / 2 ? -1 : 1, x, y: base - rnd(10, 70) - (i % 3) * 18, r: rnd(46, 92), ph: rnd(0, 6.28) }; }).sort((p, q) => p.y - q.y);   // one continuous bank of storm cloud across the top
    let flx = W / 2;
    const jag = (x0, y0, x1, y1, disp, depth) => { let pts = [[x0, y0], [x1, y1]]; for (let k = 0; k < depth; k++) { const n = []; for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1], mx = (ax + bx) / 2, my = (ay + by) / 2, dx = by - ay, dy = ax - bx, l = Math.hypot(dx, dy) || 1, o = rnd(-disp, disp); n.push(pts[i], [mx + dx / l * o, my + dy / l * o]); } n.push(pts[pts.length - 1]); pts = n; disp *= 0.55; } return pts; };
    let bolt = null, branches = [], arcs = [], flick = 0, lastFl = 0;
    // from the very top of the screen, through the clouds, down to the target; aimed at you it carries on to the bottom edge
    const mkBolt = () => { const x0 = hx + rnd(-W * 0.18, W * 0.18), main = jag(x0, -30, hx, hy, Math.max(80, hy) * 0.16, 8); return toMe ? main.concat(jag(hx, hy, hx + rnd(-60, 60), H + 30, 40, 6).slice(1)) : main; };
    const strikeNow = () => {
      bolt = mkBolt(); flx = hx; flick = 1;
      branches = []; for (let i = 0; i < 12; i++) { const q = bolt[Math.floor(rnd(6, bolt.length - 10))], a2 = Math.PI / 2 + rnd(-1.2, 1.2), L = rnd(80, 260); branches.push(jag(q[0], q[1], q[0] + Math.cos(a2) * L, q[1] + Math.sin(a2) * L * 0.8, 30, 5)); }
      SND.play('thunder'); SND.play('impact'); SND.play('boom'); shake(toMe ? 520 : 300);
      if (toMe) { const a2 = document.getElementById('app'); if (a2) { a2.animate([{ filter: 'invert(1) hue-rotate(180deg)' }, { filter: 'none', offset: .3 }, { filter: 'invert(1) hue-rotate(180deg)', offset: .5 }, { filter: 'none' }], { duration: 260 }); } }
      for (let i = 0; i < 40; i++) part(hx, hy, { ang: rnd(0, 6.28), spd: rnd(200, 700), g: 900, life: rnd(400, 900), size: rnd(2, 5), color: pick(['#fff6b0', '#ffffff', '#9fd6ff']), end: 0.2, glow: true });
      ring(hx, hy, '#fff6b0', toMe ? 260 : 130, 520, 6); ring(hx, hy, '#9fd6ff', toMe ? 180 : 90, 420, 4, 80);
      for (let i = 0; i < 10; i++) part(hx + rnd(-20, 20), hy, { ang: -Math.PI / 2 + rnd(-.6, .6), spd: rnd(40, 120), g: -60, life: rnd(1200, 2000), size: rnd(14, 26), color: 'rgba(70,70,85,.45)', end: 2.2 });
      pop(toMe ? W / 2 : hx, toMe ? H * 0.3 : hy - 80, 'ZAP!', '#ffe14d', toMe ? 72 : 44, -8);
    };
    later(hitAt, strikeNow); later(hitAt + 260, () => { bolt = mkBolt(); flick = 1; SND.play('crackle'); });   // it re-strikes once
    const edgeArc = () => { const side = Math.floor(rnd(0, 4)), L = rnd(80, 200), p0 = side < 2 ? [rnd(0, W - L), side ? H - 4 : 4] : [side === 2 ? 4 : W - 4, rnd(0, H - L)], p1 = side < 2 ? [p0[0] + L, p0[1]] : [p0[0], p0[1] + L]; arcs.push({ pts: jag(p0[0], p0[1], p1[0], p1[1], 16, 5), life: 160 }); };
    SND.play('whoosh');
    const frame = (now) => {
      const t = now - T0; if (t > DUR) { cv.remove(); return; }
      g.clearRect(0, 0, W, H);
      const inA = Math.min(1, t / 500), outA = t > DUR - 600 ? (DUR - t) / 600 : 1, A = inA * outA;
      // the dark sky
      g.fillStyle = `rgba(8,12,28,${0.62 * A})`; g.fillRect(0, 0, W, H);
      // lightning lighting up the clouds from inside, more often as the strike nears
      if (t < hitAt + 400 && now - lastFl > (t < hitAt ? 520 - t * 0.3 : 120) && Math.random() < 0.6) { flick = 1; lastFl = now; flx = rnd(W * 0.1, W * 0.9); }
      flick *= 0.86;
      // clouds rolling in from both sides
      const k0 = Math.min(1, t / 900), ease0 = 1 - Math.pow(1 - k0, 3);
      g.fillStyle = `rgba(22,26,40,${0.95 * A})`; g.fillRect(0, 0, W, Math.max(0, base - 60) * ease0);   // the solid sky above the cloud bank
      for (const c of clouds) { const x = c.side < 0 ? -c.r * 2 + (c.x + c.r * 2) * ease0 : W + c.r * 2 - (W + c.r * 2 - c.x) * ease0, y = c.y + Math.sin(t / 900 + c.ph) * 4;
        const lit = flick * Math.max(0, 1 - Math.abs(x - flx) / (W * 0.45));   // lit from inside, near where the lightning is
        const cg = g.createRadialGradient(x, y + c.r * 0.35, c.r * 0.1, x, y, c.r);
        cg.addColorStop(0, `rgba(${70 + 170 * lit},${76 + 170 * lit},${98 + 157 * lit},${0.98 * A})`); cg.addColorStop(0.55, `rgba(${44 + 60 * lit},${48 + 60 * lit},${66 + 70 * lit},${0.97 * A})`); cg.addColorStop(1, 'rgba(26,30,44,0)');
        g.fillStyle = cg; g.beginPath(); g.arc(x, y, c.r, 0, 6.283); g.fill();
        g.strokeStyle = `rgba(150,165,200,${0.18 * A})`; g.lineWidth = 2; g.beginPath(); g.arc(x, y, c.r * 0.82, 0.3, 2.84); g.stroke(); }   // soft light catching each billow's underside
      if (flick > 0.05) { g.save(); g.globalCompositeOperation = 'lighter'; const fg2 = g.createRadialGradient(flx, base - 30, 0, flx, base - 30, W * 0.35); fg2.addColorStop(0, `rgba(170,200,255,${0.45 * flick * A})`); fg2.addColorStop(1, 'rgba(170,200,255,0)'); g.fillStyle = fg2; g.fillRect(0, 0, W, base + 80); g.restore(); }
      // rain sweeping in at an angle
      g.strokeStyle = `rgba(170,200,255,${0.45 * A})`; g.lineWidth = 1.3; g.beginPath();
      for (const r of drops) { const y = ((r.y + (t / 1000) * r.v) % (H + 60)) - 30, x = r.x + (y + 30) * 0.25; g.moveTo(x, y); g.lineTo(x + r.l * 0.25, y + r.l); } g.stroke();
      // the bolt, with a bloom; it fades out over half a second
      if (bolt && t >= hitAt) { const k = Math.max(0, 1 - Math.pow((t - hitAt) / 1000, 2)) * (0.75 + 0.25 * Math.random()), line = (pts, w, a, col) => { g.strokeStyle = col.replace('A', a * k); g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke(); };
        g.save(); g.globalCompositeOperation = 'lighter'; line(bolt, 48, 0.12, 'rgba(140,190,255,A)'); line(bolt, 22, 0.32, 'rgba(170,210,255,A)'); line(bolt, 10, 0.7, 'rgba(215,235,255,A)'); line(bolt, 4.5, 1, 'rgba(255,255,255,A)'); for (const br of branches) { line(br, 10, 0.25, 'rgba(170,215,255,A)'); line(br, 2.4, 0.95, 'rgba(255,255,255,A)'); }
        const ig = g.createRadialGradient(hx, hy, 0, hx, hy, toMe ? 160 : 90); ig.addColorStop(0, `rgba(255,250,220,${0.9 * k})`); ig.addColorStop(1, 'rgba(160,210,255,0)'); g.fillStyle = ig; g.beginPath(); g.arc(hx, hy, toMe ? 160 : 90, 0, 6.283); g.fill();   // the glow where it strikes
        const fl = Math.max(0, 1 - (t - hitAt) / 220); if (fl > 0) { g.fillStyle = `rgba(235,245,255,${fl * (toMe ? 0.8 : 0.45)})`; g.fillRect(0, 0, W, H); }
        g.restore(); }
      // electricity crawling along the screen edges after the hit
      if (toMe && t > hitAt && t < DUR - 500 && Math.random() < 0.35) edgeArc();
      g.save(); g.globalCompositeOperation = 'lighter'; for (let i = arcs.length - 1; i >= 0; i--) { const a2 = arcs[i]; a2.life -= 16; if (a2.life <= 0) { arcs.splice(i, 1); continue; } g.strokeStyle = `rgba(160,215,255,${a2.life / 160})`; g.lineWidth = 2.4; g.beginPath(); a2.pts.forEach((q, j) => (j ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke(); } g.restore();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    keepFor(DUR + 200);
  } else if (kind === 'disco') {   // the club opens: lights drop, a mirrored ball lowers on its chain and spins, beams sweep, light spots race across everything, the floor lights up to the beat
    const cv = document.createElement('canvas'), dpr = Math.min(2, devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr; cv.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none`; fx.append(cv);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const T0 = performance.now(), DUR = 4400, BEAT = 470, R = toMe ? Math.min(W, H) * 0.13 : 30, bx = toMe ? W / 2 : tx, by = toMe ? H * 0.24 : Math.max(60, ty - 95);
    const COLS = [[255, 70, 200], [80, 220, 255], [255, 215, 80], [150, 255, 140], [180, 120, 255]];
    const spots = Array.from({ length: toMe ? 150 : 40 }, () => ({ lon: rnd(0, 6.283), lat: rnd(-1.2, 1.2), s: rnd(2, 6), c: Math.random() < 0.6 ? [255, 255, 255] : pick(COLS) }));
    const sparks = [];
    const ballY = (t) => { const k = Math.min(1, t / 700); return by - Math.pow(1 - k, 3) * (by + R * 2) + (k === 1 ? Math.sin((t - 700) / 140) * Math.max(0, 1 - (t - 700) / 600) * 6 : 0); };   // lowered in, with a little bounce on the chain
    const drawBall = (x, y, rot, pulse) => {
      g.save(); g.translate(x, y);
      const sg = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R); sg.addColorStop(0, '#d9dfef'); sg.addColorStop(0.6, '#6a7390'); sg.addColorStop(1, '#232a3f'); g.fillStyle = sg; g.beginPath(); g.arc(0, 0, R, 0, 6.283); g.fill();
      g.beginPath(); g.arc(0, 0, R, 0, 6.283); g.clip();
      const rows = 12, cols = 24;   // mirror tiles on a turning sphere: each one catches the light as it comes round
      for (let i = 0; i < rows; i++) { const la = -Math.PI / 2 + (i + 0.5) * Math.PI / rows, cy2 = Math.sin(la) * R, rr = Math.cos(la) * R, th = R * Math.PI / rows * 0.86;
        for (let j = 0; j < cols; j++) { const lo = j / cols * 6.283 + rot, z = Math.cos(lo); if (z <= 0.02) continue; const cx2 = Math.sin(lo) * rr, tw = rr * 6.283 / cols * z * 0.86;
          const hash = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453, rn = hash - Math.floor(hash), lit = Math.pow(Math.max(0, 0.45 * z - 0.35 * Math.sin(la) + 0.25 * Math.sin(lo + 0.6)), 1.4) + (rn > 0.86 ? 0.5 + 0.5 * Math.sin(rot * 9 + j) : 0);
          const tint = COLS[(i + j) % COLS.length], tm = pulse * 0.35 * (rn > 0.5 ? 1 : 0), v = Math.min(255, 70 + lit * 200);
          g.fillStyle = `rgb(${Math.round(v * (1 - tm) + tint[0] * tm)},${Math.round(v * (1 - tm) + tint[1] * tm)},${Math.round(v * 1.04 * (1 - tm) + tint[2] * tm)})`; g.fillRect(cx2 - tw / 2, cy2 - th / 2, tw, th); } }
      g.restore();
      g.save(); g.translate(x, y); g.globalCompositeOperation = 'lighter'; const hl = g.createRadialGradient(-R * 0.4, -R * 0.45, 0, -R * 0.4, -R * 0.45, R * 0.55); hl.addColorStop(0, 'rgba(255,255,255,.65)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = hl; g.beginPath(); g.arc(-R * 0.4, -R * 0.45, R * 0.55, 0, 6.283); g.fill();
      const halo = g.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.9); halo.addColorStop(0, `rgba(220,230,255,${0.25 + pulse * 0.25})`); halo.addColorStop(1, 'rgba(220,230,255,0)'); g.fillStyle = halo; g.beginPath(); g.arc(0, 0, R * 1.9, 0, 6.283); g.fill(); g.restore();
    };
    const floorY = H * 0.7;
    const drawFloor = (beat, A, pulse) => {   // a lit dance floor in perspective
      const rows = 5, cols = 7, vx = W / 2, vy = H * 0.35;
      for (let r = 0; r < rows; r++) { const y0 = floorY + Math.pow(r / rows, 1.6) * (H - floorY) * 1.05, y1 = floorY + Math.pow((r + 1) / rows, 1.6) * (H - floorY) * 1.05;
        for (let c = 0; c < cols; c++) { const xAt = (y, cc) => vx + ((cc / cols) * W * 1.9 - W * 0.95) * ((y - vy) / (H - vy)); const on = (r + c + beat) % 3 === 0 || (r * 3 + c * 5 + beat * 7) % 11 === 0; const col = COLS[(r * 2 + c + beat) % COLS.length];
          g.fillStyle = on ? `rgba(${col[0]},${col[1]},${col[2]},${(0.4 + pulse * 0.3) * A})` : `rgba(20,16,40,${0.55 * A})`;
          g.beginPath(); g.moveTo(xAt(y0, c) + 1, y0 + 1); g.lineTo(xAt(y0, c + 1) - 1, y0 + 1); g.lineTo(xAt(y1, c + 1) - 1, y1 - 1); g.lineTo(xAt(y1, c) + 1, y1 - 1); g.closePath(); g.fill(); } }
      const fg = g.createLinearGradient(0, floorY - 20, 0, floorY + 60); fg.addColorStop(0, `rgba(10,6,24,${0.9 * A})`); fg.addColorStop(1, 'rgba(10,6,24,0)'); g.fillStyle = fg; g.fillRect(0, floorY - 20, W, 80);
    };
    SND.play('whoosh'); later(700, () => { SND.play('balloons'); SND.play('chime'); });
    for (let i = 0; i < 8; i++) later(700 + i * BEAT, () => SND.play(i % 2 ? 'tick' : 'pop'));
    pop(toMe ? W / 2 : tx, toMe ? H * 0.5 : ty + 16, 'DANCE!', '#ff4fd0', toMe ? 64 : 38, -6, 760);
    let last = T0, lastBeat = -1;
    const frame = (now) => {
      const t = now - T0, dt = Math.min(0.05, (now - last) / 1000); last = now; if (t > DUR) { cv.remove(); return; }
      g.clearRect(0, 0, W, H);
      const A = Math.min(1, t / 400) * (t > DUR - 700 ? (DUR - t) / 700 : 1), on = t > 700, bt = Math.max(0, t - 700), beat = Math.floor(bt / BEAT), pulse = on ? Math.exp(-(bt % BEAT) / 140) : 0, rot = t / 650;
      if (beat !== lastBeat && on) { lastBeat = beat; for (let i = 0; i < (toMe ? 14 : 5); i++) { const a2 = rnd(0, 6.283), v = rnd(120, 340); sparks.push({ x: bx, y: by, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v, c: pick(COLS), life: 700, t: 0 }); } }
      // the room goes dark, washed in the colour of the beat
      if (toMe) { g.fillStyle = `rgba(8,4,22,${0.72 * A})`; g.fillRect(0, 0, W, H); if (on) { const wc = COLS[beat % COLS.length], wash = g.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, Math.max(W, H) * 0.8); wash.addColorStop(0, `rgba(${wc[0]},${wc[1]},${wc[2]},${0.16 * pulse * A})`); wash.addColorStop(1, `rgba(${wc[0]},${wc[1]},${wc[2]},0)`); g.fillStyle = wash; g.fillRect(0, 0, W, H); } drawFloor(beat, A * (on ? 1 : 0.3), pulse); }
      else { const vg = g.createRadialGradient(bx, by + 60, 10, bx, by + 60, 200); vg.addColorStop(0, `rgba(8,4,22,${0.55 * A})`); vg.addColorStop(1, 'rgba(8,4,22,0)'); g.fillStyle = vg; g.fillRect(bx - 210, by - 150, 420, 420); }
      const y = ballY(t);
      // sweeping beams from the ball
      if (on) { g.save(); g.globalCompositeOperation = 'lighter'; const n = toMe ? 6 : 4, L = toMe ? Math.hypot(W, H) : 190;
        for (let i = 0; i < n; i++) { const a2 = Math.PI / 2 + Math.sin(t / 900 + i * 1.3) * 1.25, c = COLS[(i + beat) % COLS.length], w = 0.07 + 0.03 * pulse; const bg = g.createLinearGradient(bx, y, bx + Math.cos(a2) * L, y + Math.sin(a2) * L); bg.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${0.42 * A})`); bg.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`); g.fillStyle = bg; g.beginPath(); g.moveTo(bx, y); g.lineTo(bx + Math.cos(a2 - w) * L, y + Math.sin(a2 - w) * L); g.lineTo(bx + Math.cos(a2 + w) * L, y + Math.sin(a2 + w) * L); g.closePath(); g.fill(); }
        // the classic: hundreds of reflected light spots sliding across the room as the ball turns
        for (const s of spots) { const lo = s.lon + rot * 1.6, z = Math.cos(lo); if (z < 0.1) continue; const sx = toMe ? W / 2 + Math.sin(lo) * W * 0.75 : bx + Math.sin(lo) * 150, sy = toMe ? y + R + (s.lat + 1.25) * (H - y) * 0.42 : y + R * 0.8 + (s.lat + 1.25) * 50, a2 = A * Math.min(1, z * 2) * (0.55 + 0.45 * pulse);
          const sg = g.createRadialGradient(sx, sy, 0, sx, sy, s.s * 2.4); sg.addColorStop(0, `rgba(${s.c[0]},${s.c[1]},${s.c[2]},${a2})`); sg.addColorStop(0.4, `rgba(${s.c[0]},${s.c[1]},${s.c[2]},${a2 * 0.5})`); sg.addColorStop(1, `rgba(${s.c[0]},${s.c[1]},${s.c[2]},0)`); g.fillStyle = sg; g.beginPath(); g.ellipse(sx, sy, s.s * 2.4 * (0.5 + 0.5 * z), s.s * 2.4, 0, 0, 6.283); g.fill(); }
        g.restore(); }
      // the chain and the ball
      g.globalAlpha = A; g.strokeStyle = '#8c94ad'; g.lineWidth = toMe ? 3 : 2; g.setLineDash([5, 3]); g.beginPath(); g.moveTo(bx, 0); g.lineTo(bx, y - R); g.stroke(); g.setLineDash([]);
      drawBall(bx, y, rot, pulse); g.globalAlpha = 1;
      // a glint flaring on the ball each beat, and sparks thrown off
      if (on) { g.save(); g.globalCompositeOperation = 'lighter'; const gx = bx - R * 0.3, gy = y - R * 0.35, gl = R * (0.9 + pulse * 1.4); g.strokeStyle = `rgba(255,255,255,${0.85 * pulse * A})`; g.lineWidth = 2; g.beginPath(); g.moveTo(gx - gl, gy); g.lineTo(gx + gl, gy); g.moveTo(gx, gy - gl); g.lineTo(gx, gy + gl); g.stroke();
        for (const s of sparks) { s.t += dt * 1000; if (s.t > s.life) continue; s.vx *= Math.pow(0.2, dt); s.vy = s.vy * Math.pow(0.2, dt) + 120 * dt; s.x += s.vx * dt; s.y += s.vy * dt; const a2 = A * (1 - s.t / s.life); g.fillStyle = `rgba(${s.c[0]},${s.c[1]},${s.c[2]},${a2})`; g.beginPath(); g.arc(s.x, s.y, 2.6, 0, 6.283); g.fill(); }
        g.restore(); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    keepFor(DUR + 200);
  } else if (kind === 'cash') {   // jackpot: money guns fire banknotes from the bottom corners, coins rain and bounce, a giant gold coin spins
    const cv = document.createElement('canvas'), dpr = Math.min(2, devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr; cv.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none`; fx.append(cv);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const T0 = performance.now(), DUR = 4100, bills = [], coins = [], floor = H - 14, sc = toMe ? 1 : 0.75;
    const gun = (side, n, d0) => { for (let i = 0; i < n; i++) later(d0 + i * 45, () => { const x0 = side < 0 ? -10 : W + 10, a = side < 0 ? rnd(-1.45, -0.75) : Math.PI - rnd(-1.45, -0.75), v = rnd(700, 1250) * (toMe ? 1 : 0.8), z = rnd(0.55, 1.35); bills.push({ x: x0, y: H * 0.92, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: rnd(0, 6.28), vr: rnd(-6, 6), flip: rnd(0, 6.28), vf: rnd(5, 11), sway: rnd(0, 6.28), z, born: performance.now() }); if (i % 6 === 0) SND.play('whoosh'); }); };
    if (toMe) { gun(-1, 26, 200); gun(1, 26, 380); gun(-1, 16, 1100); gun(1, 16, 1250); } else { const side = tx < W / 2 ? -1 : 1; gun(side, 22, 200); }
    for (let i = 0; i < (toMe ? 34 : 14); i++) later(500 + rnd(0, 2000), () => coins.push({ x: toMe ? rnd(20, W - 20) : tx + rnd(-120, 120), y: -20, vy: rnd(100, 300), vx: rnd(-40, 40), spin: rnd(0, 6.28), vs: rnd(8, 16), r: rnd(9, 15) * (toMe ? 1 : 0.8), bounces: 0 }));
    const drawBill = (b) => { const w = 64 * b.z * sc, h = 30 * b.z * sc, fl = Math.cos(b.flip); g.save(); g.translate(b.x, b.y); g.rotate(b.rot); g.scale(1, Math.max(0.06, Math.abs(fl))); g.globalAlpha = Math.min(1, 0.55 + b.z * 0.4);
      const front = fl > 0, gr = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); gr.addColorStop(0, front ? '#9be8b2' : '#6cc98a'); gr.addColorStop(0.5, front ? '#59c47d' : '#3ea765'); gr.addColorStop(1, front ? '#2f9a57' : '#2a8048');
      g.fillStyle = gr; g.beginPath(); g.roundRect ? g.roundRect(-w / 2, -h / 2, w, h, 3) : g.rect(-w / 2, -h / 2, w, h); g.fill(); g.strokeStyle = 'rgba(20,90,45,.8)'; g.lineWidth = 1; g.stroke();
      g.strokeStyle = 'rgba(230,255,240,.55)'; g.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
      g.fillStyle = 'rgba(232,255,240,.9)'; g.beginPath(); g.ellipse(0, 0, h * 0.34, h * 0.34, 0, 0, 6.283); g.fill();
      g.fillStyle = '#1e7a40'; g.font = `900 ${h * 0.5}px Inter, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, h * 0.03);
      g.fillStyle = `rgba(255,255,255,${0.35 * Math.pow(Math.abs(Math.sin(b.flip)), 6)})`; g.fillRect(-w / 2, -h / 2, w, h);   // a glint as it turns
      g.restore(); };
    const drawCoin = (c) => { const sx = Math.cos(c.spin); g.save(); g.translate(c.x, c.y); g.scale(Math.max(0.12, Math.abs(sx)), 1);
      const cg = g.createRadialGradient(-c.r * 0.35, -c.r * 0.4, 1, 0, 0, c.r); cg.addColorStop(0, '#fff6c2'); cg.addColorStop(0.5, '#ffcf40'); cg.addColorStop(1, '#b67c06');
      g.fillStyle = cg; g.beginPath(); g.arc(0, 0, c.r, 0, 6.283); g.fill(); g.strokeStyle = '#9a6400'; g.lineWidth = 1.2; g.stroke(); g.fillStyle = '#8a5a00'; g.font = `900 ${c.r * 1.1}px Inter, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 1); g.restore(); };
    // the giant coin in the middle, spinning under JACKPOT!
    const bx = toMe ? W / 2 : tx, by = toMe ? H * 0.42 : ty - 30, BR = toMe ? Math.min(W, H) * 0.17 : 46;
    later(300, () => { SND.play('chime'); SND.play('balloons'); });
    pop(bx, by - BR - (toMe ? 46 : 30), 'JACKPOT!', '#ffcf40', toMe ? 56 : 32, -4, 350);
    let last = T0;
    const frame = (now) => {
      const t = now - T0, dt = Math.min(0.05, (now - last) / 1000); last = now; if (t > DUR) { cv.remove(); return; }
      g.clearRect(0, 0, W, H);
      const A = t > DUR - 600 ? (DUR - t) / 600 : 1; g.globalAlpha = A;
      // a warm golden glow behind everything
      const gl = g.createRadialGradient(bx, by, 0, bx, by, BR * 4); gl.addColorStop(0, `rgba(255,210,80,${0.32 * Math.min(1, t / 400)})`); gl.addColorStop(1, 'rgba(255,210,80,0)'); g.fillStyle = gl; g.fillRect(0, 0, W, H);
      // the big coin: spins, with rays and a glint
      if (t > 250) { const k = Math.min(1, (t - 250) / 350), s2 = (k < 1 ? 0.3 + 0.85 * Math.sin(k * Math.PI / 2) * 1.08 : 1) * BR, spin = (t - 250) / 260, sx = Math.cos(spin);
        g.save(); g.translate(bx, by); g.rotate(t / 1800); g.globalAlpha = 0.28 * A; g.fillStyle = '#ffe28a'; for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.beginPath(); g.moveTo(0, 0); g.lineTo(s2 * 2.6, -s2 * 0.22); g.lineTo(s2 * 2.6, s2 * 0.22); g.closePath(); g.fill(); } g.restore();
        g.save(); g.translate(bx, by); g.scale(Math.max(0.08, Math.abs(sx)), 1);
        g.fillStyle = '#9a6400'; g.beginPath(); g.arc(sx > 0 ? -3 : 3, 3, s2, 0, 6.283); g.fill();   // the rim's thickness
        const cg = g.createRadialGradient(-s2 * 0.3, -s2 * 0.35, 2, 0, 0, s2); cg.addColorStop(0, '#fff8d0'); cg.addColorStop(0.45, '#ffd34d'); cg.addColorStop(1, '#c08508'); g.fillStyle = cg; g.beginPath(); g.arc(0, 0, s2, 0, 6.283); g.fill();
        g.strokeStyle = 'rgba(150,95,0,.8)'; g.lineWidth = s2 * 0.07; g.beginPath(); g.arc(0, 0, s2 * 0.8, 0, 6.283); g.stroke();
        g.fillStyle = '#8a5a00'; g.font = `900 ${s2 * 1.05}px Inter, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, s2 * 0.05);
        g.globalCompositeOperation = 'lighter'; const gx = ((t / 900) % 2) * s2 * 3 - s2 * 1.5, gg2 = g.createLinearGradient(gx - s2 * 0.4, 0, gx + s2 * 0.4, 0); gg2.addColorStop(0, 'rgba(255,255,255,0)'); gg2.addColorStop(0.5, 'rgba(255,255,255,.55)'); gg2.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gg2; g.beginPath(); g.arc(0, 0, s2, 0, 6.283); g.fill();
        g.restore(); }
      // banknotes: shot up, then air drag takes over and they flutter down flipping
      for (const b of bills) { b.vx *= Math.pow(0.12, dt); b.vy = b.vy * Math.pow(0.15, dt) + 420 * dt; if (b.vy > 140 * b.z) b.vy = 140 * b.z; b.sway += dt * 3; b.x += (b.vx + Math.sin(b.sway) * 40 * b.z) * dt; b.y += b.vy * dt; b.rot += b.vr * dt * 0.3; b.flip += b.vf * dt; }
      bills.sort((p, q) => p.z - q.z); for (const b of bills) if (b.y < H + 60) drawBill(b);
      // coins: fall, bounce on the floor, settle
      for (const c of coins) { c.vy += 1400 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.spin += c.vs * dt; if (c.y > floor - c.r && c.vy > 0) { c.y = floor - c.r; if (c.bounces < 3) { c.vy *= -0.45; c.bounces++; if (c.bounces === 1 && Math.random() < 0.4) SND.play('tick'); } else { c.vy = 0; c.vs *= 0.9; } } drawCoin(c); }
      // golden glitter
      if (Math.random() < 0.6) part(rnd(0, W), rnd(0, H * 0.7), { ang: Math.PI / 2, spd: rnd(20, 60), g: 40, life: rnd(600, 1000), size: rnd(3, 6), color: pick(['#ffe28a', '#fff6c2', '#ffcf40']), end: 0.1, glow: true });
      g.globalAlpha = 1;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    keepFor(DUR + 200);
  } else if (kind === 'fireworks') {   // a volley of shells with different bursts
    const cols = [['#ff5a5a', '#ffd23f'], ['#4fc3ff', '#ffffff'], ['#b77bff', '#ff8fc0'], ['#7be08f', '#ffd23f'], ['#ffd23f', '#ff7a1f']];
    const shells = 6;
    for (let i = 0; i < shells; i++) {
      const delay = i * 380, x = W * (0.12 + (0.76 * (i % 3)) / 2) + rnd(-30, 30) + (i > 2 ? W * 0.08 : 0), by = H * rnd(0.14, 0.42), [c1, c2] = cols[i % cols.length], style = ['peony', 'ring', 'willow', 'double', 'peony', 'ring'][i];
      later(delay, () => {
        SND.play('whistle');
        const sh = node(`width:9px;height:9px;border-radius:50%;background:#fff3c2;box-shadow:0 0 12px 4px #ffd23f;opacity:0;margin:-4px 0 0 -4px`, 'giftbit');
        anim(sh, [{ transform: `translate(${x}px,${H + 10}px)`, opacity: 1 }, { transform: `translate(${x + rnd(-20, 20)}px,${by}px)`, opacity: 1 }], { duration: 640, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'forwards' });
        for (let k = 0; k < 10; k++) later(k * 58, () => part(x, H - (H - by) * (k / 10), { ang: Math.PI / 2, spd: 30, g: 200, life: 500, size: 4, color: '#ffd23f', end: 0.1 }));
        later(640, () => {
          sh.remove(); SND.play('pop'); if (i % 2) SND.play('crackle');
          flash(c1, 0.18, 400); glowAt(x, by, c1, 360, 800); ring(x, by, c2, 150, 800, 3);
          if (style === 'ring' || style === 'double') for (let k = 0; k < 32; k++) part(x, by, { ang: (k / 32) * Math.PI * 2, spd: 340, g: 260, life: 1600, size: 9, color: c1, end: 0.2, glow: true });
          if (style === 'double') for (let k = 0; k < 22; k++) part(x, by, { ang: (k / 22) * Math.PI * 2 + 0.2, spd: 190, g: 260, life: 1600, size: 8, color: c2, end: 0.2, glow: true });
          if (style === 'peony') for (let k = 0; k < 44; k++) part(x, by, { ang: rnd(0, Math.PI * 2), spd: rnd(120, 440), g: 340, life: rnd(1200, 1900), size: rnd(6, 11), color: k % 3 ? c1 : c2, end: 0.2, glow: true });
          if (style === 'willow') for (let k = 0; k < 36; k++) part(x, by, { ang: rnd(0, Math.PI * 2), spd: rnd(120, 360), g: 760, life: rnd(1900, 2700), size: rnd(5, 8), color: '#ffd98a', end: 0.25, glow: true });
        });
      });
    }
    // two picture shells to close: a heart, then a star, with a spark fountain at the bottom the whole time
    later(shells * 380 + 150, () => { SND.play('whistle'); later(500, () => { SND.play('pop'); glowAt(W * 0.35, H * 0.3, '#ff4d8d', 320, 800); shapeBurst(W * 0.35, H * 0.3, 1.25, ['#ff4d8d', '#ff8fb8', '#fff'], 'heart', 52, 1900); }); });
    later(shells * 380 + 700, () => { SND.play('whistle'); later(500, () => { SND.play('pop'); glowAt(W * 0.66, H * 0.26, '#ffd23f', 320, 800); shapeBurst(W * 0.66, H * 0.26, 1.25, ['#ffd23f', '#fff3c0', '#ff9a1f'], 'star', 50, 1900); }); });
    for (let i = 0; i < 60; i++) later(i * 70, () => part(W / 2 + rnd(-30, 30), H - 10, { ang: -Math.PI / 2 + rnd(-0.5, 0.5), spd: rnd(380, 640), g: 900, life: rnd(700, 1100), size: rnd(3, 6), color: pick(['#ffd23f', '#ff9a1f', '#fff3c0']), end: 0.2, glow: true }));
    keepFor(shells * 380 + 4200);
  } else {
    fly(fromX, fromY, tx, ty, { size: 64 }, () => { SND.play('pop'); burstConfetti(); });
  }
  const reap = () => { if (Date.now() < deadline) setTimeout(reap, 300); else fx.remove(); };
  setTimeout(reap, 300);
}

