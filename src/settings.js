// ---- display & accessibility (kept on this phone only) ----
const UI_DEFAULT = { fourcolor: false, text: 0, haptics: true, calm: false, voice: true, theme: 'gold' };
// each colour scheme's picker icon: a little jewel on that scheme's own background
const THEME_ART = { gold: ['#18213b', '#080c18', '#e8d3a2', '#c9a96a', '#8d7442'], emerald: ['#15402f', '#06150e', '#f3dca0', '#e0b45a', '#9a7a35'], royal: ['#34215f', '#0d0820', '#ffc6dc', '#ff8fb8', '#b55a80'], crimson: ['#45182a', '#130609', '#ffdcc8', '#f2b49a', '#b5705a'], ocean: ['#0f3b54', '#040f18', '#c6f0fa', '#7fd6ec', '#3f93a8'] };
function themeIcon(k, size = 40) {
  const [b1, b3, hi, mid, lo] = THEME_ART[k] || THEME_ART.gold, w = el('span', { class: 'themeico' });
  w.style.cssText = `display:inline-block;width:${size}px;height:${size}px;line-height:0`;
  w.innerHTML = `<svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden="true"><defs><radialGradient id="tb${k}" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="${b1}"/><stop offset="1" stop-color="${b3}"/></radialGradient><linearGradient id="tg${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></linearGradient></defs><circle cx="20" cy="20" r="19" fill="url(#tb${k})"/><circle cx="20" cy="20" r="18" fill="none" stroke="${mid}" stroke-opacity=".55" stroke-width="1.200"/><path d="M20 7.500l9 9-9 16-9-16z" fill="url(#tg${k})"/><path d="M11 16.500h18L20 7.500z" fill="#fff" opacity=".3"/><path d="M20 7.500l-2.600 9L20 32.500z" fill="#fff" opacity=".16"/><path d="M11 16.500h18" stroke="${hi}" stroke-width=".8" opacity=".8"/><path d="M31.500 8l.8 1.900 1.900.8-1.900.8-.8 1.900-.8-1.900-1.900-.8 1.900-.8z" fill="${hi}"/><circle cx="8.500" cy="30" r="1.100" fill="${mid}"/></svg>`;
  return w;
}
const THEMES = [['gold', '#c9a96a', '#18213b'], ['emerald', '#e0b45a', '#15402f'], ['royal', '#ff8fb8', '#34215f'], ['crimson', '#f2b49a', '#45182a'], ['ocean', '#7fd6ec', '#0f3b54']];
let ui = (() => { try { return { ...UI_DEFAULT, ...JSON.parse(localStorage.getItem('sct-ui') || '{}') }; } catch { return { ...UI_DEFAULT }; } })();
function applyUi() {
  if (ui.theme && ui.theme !== 'gold' && THEMES.some((x) => x[0] === ui.theme)) document.documentElement.dataset.theme = ui.theme; else delete document.documentElement.dataset.theme;
  const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = (THEMES.find((x) => x[0] === ui.theme) || THEMES[0])[2];
  document.body.classList.toggle('fourcolor', !!ui.fourcolor);
  document.body.classList.toggle('calm', !!ui.calm);
  const pct = [100, 118, 135][ui.text] || 100;
  document.documentElement.style.setProperty('-webkit-text-size-adjust', pct + '%'); document.documentElement.style.setProperty('text-size-adjust', pct + '%');
}
function setUi(k, v) { ui[k] = v; try { localStorage.setItem('sct-ui', JSON.stringify(ui)); } catch {} applyUi(); if ((st || session) && (k === 'fourcolor' || k === 'calm' || k === 'text')) safeRender(); renderSettings(); }   // colour scheme, vibration and voice are applied without rebuilding the screen behind
const buzz = (pat) => { if (ui.haptics) { try { navigator.vibrate && navigator.vibrate(pat); } catch {} } };

// ---- settings screen: host game rules (everyone sees them) + this phone's display options ----
const TIMER_CHOICES = [0, 30, 45, 60, 90, 120];
function openSettings() {
  if (document.querySelector('.set-ov')) return;
  const close = () => { ov.remove(); if (!document.querySelector('.guide-ov')) document.body.classList.remove('noscroll'); };
  const ov = el('div', { class: 'guide-ov set-ov', onclick: (e) => { if (e.target === ov) close(); } });
  ov.close = close;
  document.body.append(ov); document.body.classList.add('noscroll');
  renderSettings();
}
function renderSettings() {
  const ov = document.querySelector('.set-ov'); if (!ov) return;
  const keep = ov.querySelector('.setscroll');
  const top = keep ? keep.scrollTop : 0;
  const seg = (opts, cur, on, disabled) => el('div', { class: 'seg' + (disabled ? ' ro' : ''), style: `grid-template-columns:repeat(${opts.length <= 4 ? opts.length : 3},minmax(0,1fr))` }, ...opts.map(([v, label]) => el('button', { type: 'button', class: v === cur ? 'on' : '', disabled: !!disabled, onclick: () => on(v) }, label)));
  const row = (title, hint, ctl, stack) => {
    if (ctl.getAttribute('role') === 'switch') ctl.setAttribute('aria-label', title);
    return el('div', { class: 'setrow' + (stack ? ' stack' : '') }, el('div', { class: 'setl' }, el('b', {}, title), hint ? el('small', {}, hint) : ''), ctl);
  };
  const sw = (on, change, disabled) => el('button', { type: 'button', role: 'switch', 'aria-checked': String(!!on), class: 'sw' + (on ? ' on' : ''), disabled: !!disabled, onclick: () => change(!on) }, el('i'));
  const card = (cls, ic, title, tag, ...kids) => el('section', { class: 'setcard ' + cls }, el('header', {}, el('span', { class: 'sechip' }, icon(ic, 16)), el('h4', {}, title), tag ? el('em', {}, tag) : ''), ...kids);
  const inRoom = !!(st && session);
  const gs = (inRoom && st.settings) || { timer: 0, jokers: true, mult: 1, predSec: 15, drink: false };
  const canEdit = inRoom && st.isHost;
  const change = (patch) => { if (!canEdit) return; st.settings = { ...gs, ...patch }; renderSettings(); act('settings', patch); };
  const sections = [];
  if (inRoom) sections.push(card('game', 'clock', t('setGame'), canEdit ? '' : t('setHostBadge'),
    canEdit ? '' : el('p', { class: 'setnote' }, t('setHostOnly')),
    row(t('setTimer'), t('setTimerHint'), seg(TIMER_CHOICES.map((v) => [v, v ? v + t('setSecs') : t('setNone')]), gs.timer, (v) => change({ timer: v }), !canEdit), true),
    row(t('setPred'), t('setPredHint'), seg([7, 10, 15, 20, 25, 30].map((v) => [v, v + t('setSecs')]), gs.predSec || 15, (v) => change({ predSec: v }), !canEdit), true),
    row(t('setMult'), t('setMultHint'), seg([[0.5, '×0.5'], [1, '×1'], [2, '×2'], [3, '×3']], gs.mult, (v) => change({ mult: v }), !canEdit), true),
    row(t('setDrink'), t('setDrinkHint'), sw(!!gs.drink, (v) => change({ drink: v }), !canEdit)),
    row(t('setChat'), t('setChatHint'), sw(gs.chat !== false, (v) => change({ chat: v }), !canEdit)),
    row(t('setJokers'), t('setJokersHint'), sw(gs.jokers, (v) => change({ jokers: v }), !canEdit))));
  sections.push(card('look', 'eye', t('setDisplay'), t('setPhone'),
    row(t('setTheme'), '', el('div', { class: 'swatches', role: 'radiogroup', 'aria-label': t('setTheme') }, ...THEMES.map(([k, c, bg]) => el('button', { type: 'button', role: 'radio', 'aria-checked': String((ui.theme || 'gold') === k), 'aria-label': t('theme_' + k), title: t('theme_' + k), class: 'swatch' + ((ui.theme || 'gold') === k ? ' on' : ''), onclick: () => setUi('theme', k) }, themeIcon(k, 38)))), true),
    row(t('setText'), '', seg([[0, 'A'], [1, 'A+'], [2, 'A++']], ui.text, (v) => setUi('text', v)), true),
    row(t('setFour'), t('setFourHint'), sw(!!ui.fourcolor, (v) => setUi('fourcolor', v))),
    row(t('setCalm'), t('setCalmHint'), sw(!!ui.calm, (v) => setUi('calm', v)))));
  sections.push(card('feel', 'zap', t('setFeel'), t('setPhone'),
    row(t('setHaptics'), t('setHapticsHint'), sw(!!ui.haptics, (v) => setUi('haptics', v))),
    row(t('setVoice'), t('setVoiceHint'), sw(!!ui.voice, (v) => setUi('voice', v)))));
  if (inRoom && st.recoveryCode) {
    const copy = el('button', { type: 'button', class: 'ghost', onclick: () => copyText(st.recoveryCode, copy) }, t('recoveryCopy'));
    sections.push(card('recovery', 'lock', t('recoveryTitle'), '', el('p', { class: 'setnote' }, t('recoveryHint')),
      el('input', { readOnly: true, type: 'password', value: st.recoveryCode, 'aria-label': t('recoveryLabel'), onclick: (e) => { e.target.type = 'text'; e.target.select(); } }), copy));
  }
  if (inRoom) sections.push(el('button', { type: 'button', class: 'ghost setsync', onclick: () => { resync(); toast(t('setSynced'), 'low'); } }, icon('swap', 16), t('setSync')));
  // nothing in the panel changed (a poll or push rebuilt the screen behind it): leave it alone so touch scrolling is never interrupted
  const sig = JSON.stringify([lang, inRoom, canEdit, gs, ui, inRoom && st.isHost]);
  if (keep && ov.dataset.sig === sig) return;
  ov.dataset.sig = sig;
  const chrome = JSON.stringify([lang, inRoom, canEdit]);
  if (keep && ov.dataset.chrome === chrome) {   // same header and footer: swap only the rows inside the scroller, which keeps the scroller itself (and its momentum)
    keep.replaceChildren(...sections); keep.scrollTop = top; return;
  }
  ov.dataset.chrome = chrome;
  ov.replaceChildren(el('div', { class: 'guide setbox' + (keep ? ' still' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': t('settings') },
    el('div', { class: 'ghead' }, el('div', { class: 'gtitle' }, el('b', { class: 'colorful' }, colorIcon(SET_ICON, 22)), t('settings')), el('button', { class: 'ghost gx', 'aria-label': t('gClose'), onclick: ov.close }, icon('x', 16))),
    el('div', { class: 'gscroll setscroll' }, ...sections),
    el('div', { class: 'gfoot' }, el('span'), el('button', { onclick: ov.close }, t('qrClose')))));
  ov.querySelector('.setscroll').scrollTop = top;
}

// you won the round: a card with your animal, the win count and any accessory it just unlocked
// the win card waits for the Hall of Fame: after the last strike, the verdict, the drinks and the "Final Board" banner
let celebrateKey = '';
function celebrateWhenReady(id, round) {
  const key = round + ':' + id; if (celebrateKey === key) return; celebrateKey = key;
  const t0 = Date.now();
  const tick = () => {
    if (!st || st.round !== round) return;
    const busy = document.querySelector('.resfx, .atkfx, .nextfx, .drinkfx, .winfx') || !document.querySelector('.hallwrap') || drinkPendingRow() >= 0;
    if (busy && Date.now() - t0 < 90000) return setTimeout(tick, 400);
    if (busy) return;
    setTimeout(() => { const me = st && st.players.find((q) => q.id === id); if (me && st.round === round) celebrateWin(me); }, 1600);   // a moment to take in the podium first
  };
  setTimeout(tick, 1500);
}
function celebrateWin(me) {
  document.querySelector('.winfx')?.remove();
  const pts = st && st.wallet ? st.wallet.pts : 0;
  const shut = () => { if (box.classList.contains('out')) return; box.classList.add('out'); setTimeout(() => box.remove(), 420); };
  const box = el('div', { class: 'winfx', role: 'status', onclick: shut },
    el('div', { class: 'winbox' },
      el('div', { class: 'wf-k' }, t('roundWon')),
      el('div', { class: 'wf-av' }, el('i', { class: 'wf-rays' }), el('i', { class: 'wf-halo' }), avatarEl(me.avatar, 92, 'happy', me.acc, me.bd)),
      el('div', { class: 'wf-t' }, t('winsN', { n: me.wins })),
      el('div', { class: 'wf-s' }, t('wpEarned', { n: (st && st.placeWp && st.placeWp[me.id]) || (st && st.prices ? st.prices.wp : 10), pts })),
      el('button', { type: 'button', class: 'wf-shop', onclick: (e) => { e.stopPropagation(); box.remove(); openShop(); } }, el('span', { class: 'iconlabel' }, shopIcon(20), t('shopOpen')))));
  document.body.append(box);
  SND.play('safe'); buzz([60, 40, 60]);
  setTimeout(burstConfetti, 180);
  setTimeout(shut, 6500);
}


// ---- QR code to join the room (the generator is loaded only when it is first needed) ----
let qrLoading = null;
function loadQR() {
  if (window.qrcode) return Promise.resolve();
  return qrLoading || (qrLoading = new Promise((res, rej) => {
    const sc = document.createElement('script'); sc.src = '/qrcode.js'; sc.onload = res; sc.onerror = () => { qrLoading = null; rej(new Error('qr')); };
    document.head.append(sc);
  }));
}
function qrSvg(text) {
  const q = window.qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), m = 3;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + m * 2} ${n + m * 2}" shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#14182b"/></svg>`;
}
async function openQR() {
  if (!st || document.querySelector('.qr-ov')) return;
  const link = `${shareOrigin()}/?room=${st.code}`;
  const close = () => { ov.remove(); if (!document.querySelector('.guide-ov')) document.body.classList.remove('noscroll'); };
  const box = el('div', { class: 'avbox qrbox', role: 'dialog', 'aria-modal': 'true' },
    el('div', { class: 'avtitle' }, t('qrTitle')),
    el('div', { class: 'qrimg' }, el('i', { class: 'spin' })),
    el('div', { class: 'qrcode' }, st.code),
    el('p', { class: 'leavep' }, t('qrHint')),
    el('div', { class: 'leaverow' }, el('button', { type: 'button', class: 'ghost', onclick: close }, t('qrClose')), (() => { const b = el('button', { type: 'button', class: 'qrcopy', onclick: () => copyText(link, b) }, el('span', { class: 'iconlabel' }, el('span', { class: 'cpdisc' }, icon('link', 16)), t('qrCopy'))); return b; })()));
  const ov = el('div', { class: 'guide-ov qr-ov', onclick: (e) => { if (e.target === ov) close(); } }, box);
  document.body.append(ov); document.body.classList.add('noscroll');
  try { await loadQR(); box.querySelector('.qrimg').innerHTML = qrSvg(link); }
  catch { box.querySelector('.qrimg').textContent = link; box.querySelector('.qrimg').classList.add('fail'); }
}

// your own avatar: tapping the animal makes it hop; the little swap badge opens the picker
function editableAvatar(key, size, onPick, acc = '', bd = '') {
  const badge = el('button', { type: 'button', class: 'avbadge', title: t('changeAvatar'), 'aria-label': t('changeAvatar') }, icon('swap', 11));
  const wrap = el('span', { class: 'avedit' }, avatarEl(key, size, '', acc, bd), badge);
  badge.onclick = (e) => { e.stopPropagation(); openAvatarPicker(key, onPick, acc); };
  return wrap;
}

// a small picker: tap an animal to choose it
function openAvatarPicker(current, onPick, curAcc = '') {
  document.querySelector('.av-ov')?.remove();
  const close = () => { ov.remove(); if (!document.querySelector('.guide-ov')) document.body.classList.remove('noscroll'); };
  const ov = el('div', { class: 'guide-ov av-ov', onclick: (e) => { if (e.target === ov) close(); } });
  const draw = () => {
    const me = st && session ? st.players.find((q) => q.id === st.meId) : null;
    const w = me && st.wallet;
    const keep = ov.querySelector('.avbox'), top = keep ? keep.scrollTop : 0;
    const cur = me ? me.avatar : current, acc = me ? me.acc || '' : curAcc, bd = me ? me.bd || '' : '';
    const head = (txt, n) => el('div', { class: 'avtitle invhead' + (n === undefined ? '' : ' sec') }, txt, n === undefined ? '' : el('em', {}, String(n)));
    const empty = el('p', { class: 'invempty' }, t('invEmpty'));
    const none = () => el('span', { class: 'accnone' }, icon('x', 18));
    // animals: a pick closes the plain picker (landing page), but inside a room the inventory stays open so you can mix and match
    const special = w ? w.owned.av : [], animals = [...AVATAR_KEYS, ...special];
    const pickAnimal = (k) => { if (me) { onPick(k); draw(); } else { close(); onPick(k); } };
    const parts = [head(me ? t('invTitle') : t('pickAnimal'))];
    if (me) parts.push(head(t('invAnimals'), animals.length));
    const animalGrid = (list) => el('div', { class: 'avgrid' }, ...list.map((k) => el('button', { type: 'button', class: 'avpick' + (k === cur ? ' on' : ''), 'aria-label': k, onclick: () => pickAnimal(k) }, avatarEl(k, 64, '', acc, bd))));
    parts.push(animalGrid(AVATAR_KEYS));
    if (special.length) parts.push(el('div', { class: 'invsub' }, icon('zap', 13), t('invSpecial')), animalGrid(special));
    if (me) {
      const grid = (opts, curKey, on, preview) => el('div', { class: 'accgrid' }, ...opts.map(([k, label]) => el('button', { type: 'button', class: 'accpick' + (k === curKey ? ' on' : ''), onclick: () => { on(k); draw(); } }, k ? preview(k) : none(), el('small', {}, label))));
      parts.push(head(t('invAcc'), w.owned.acc.length));
      parts.push(w.owned.acc.length ? grid([['', t('accNone')], ...w.owned.acc.map((k) => [k, t('acc_' + k)])], acc, setMyAcc, (k) => avatarEl(cur, 44, '', k, bd)) : empty.cloneNode(true));
      parts.push(head(t('invBd'), w.owned.bd.length));
      parts.push(w.owned.bd.length ? grid([['', t('accNone')], ...w.owned.bd.map((k) => [k, t('bd_' + k)])], bd, setMyBd, (k) => avatarEl(cur, 44, '', acc, k)) : empty.cloneNode(true));
      const gifts = GIFT_KEYS.filter((k) => (w.gifts[k] || 0) > 0);
      parts.push(head(t('invGifts'), gifts.reduce((n, k) => n + w.gifts[k], 0)));
      parts.push(gifts.length ? el('div', { class: 'accgrid invgifts' }, ...gifts.map((k) => el('button', { type: 'button', class: 'accpick', title: t('giftThrowNow'), onclick: () => { close(); openGiftTray(k); } }, giftEl(k, 40), el('small', {}, t('gift_' + k) + ' ×' + w.gifts[k])))) : empty.cloneNode(true));
      parts.push(el('button', { type: 'button', class: 'shoplink', onclick: () => { close(); openShop(); } }, el('span', { class: 'iconlabel' }, shopIcon(20), t('shopOpen'))));
      parts.push(el('p', { class: 'invpts' }, t('invPts', { n: w.pts })));
    }
    ov.replaceChildren(el('div', { class: 'avbox invbox', role: 'dialog', 'aria-modal': 'true' }, ...parts));
    ov.querySelector('.avbox').scrollTop = top;
  };
  draw();
  document.body.append(ov);
  document.body.classList.add('noscroll');
}
function setMyBd(k) {
  const me = st && st.players.find((q) => q.id === st.meId);
  if (me) { me.bd = k; render(); }
  act('avatar', { bd: k });
}
function setMyAcc(k) {
  const me = st && st.players.find((q) => q.id === st.meId);
  if (me) { me.acc = k; render(); }
  act('avatar', { acc: k });
}

// the how-to-play button's full-colour icon: an open book
const GUIDE_ICON = '<defs><linearGradient id="gbL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6bd6ff"/><stop offset="1" stop-color="#3a7bff"/></linearGradient><linearGradient id="gbR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8fc0"/><stop offset="1" stop-color="#ff5a8a"/></linearGradient></defs><ellipse cx="16" cy="28.800" rx="12" ry="1.500" fill="#000" opacity=".18"/><path d="M15 8.500Q9 5 3 6.500V25q6-1.500 12 1.800z" fill="url(#gbL)"/><path d="M17 8.500Q23 5 29 6.500V25q-6-1.500-12 1.800z" fill="url(#gbR)"/><path d="M15 8.500v18.300h2V8.500z" fill="#ffd23f"/><path d="M6 10.500q4.500-.8 7.500 1M6 14.200q4.500-.8 7.500 1M6 17.900q4.500-.8 7.500 1M26 10.500q-4.500-.8-7.500 1M26 14.200q-4.500-.8-7.500 1M26 17.900q-4.500-.8-7.500 1" stroke="#fff" stroke-width="1.200" stroke-linecap="round" opacity=".8" fill="none"/><path d="M16 1.500l1.100 2.600 2.600 1.100-2.600 1.100L16 8.900l-1.100-2.600-2.600-1.100 2.600-1.100z" fill="#ffd23f"/>';
function guideIcon(size = 22) {
  const w = el('span', { class: 'guideico' }); w.style.cssText = `display:inline-block;width:${size}px;height:${size}px;line-height:0`;
  w.innerHTML = `<svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true">${GUIDE_ICON}</svg>`;
  return w;
}
const SET_ICON = '<defs><linearGradient id="sg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff8a1f"/></linearGradient></defs><path d="M14 2.500h4l.8 3.300q1.300.4 2.500 1.200l3-1.700 2.800 2.800-1.700 3q.8 1.200 1.200 2.500l3.300.8v4l-3.300.8q-.4 1.300-1.200 2.500l1.700 3-2.800 2.800-3-1.700q-1.200.8-2.500 1.200L18 29.500h-4l-.8-3.300q-1.300-.4-2.500-1.200l-3 1.700-2.800-2.800 1.700-3q-.8-1.200-1.200-2.500L2.500 18v-4l3.300-.8q.4-1.300 1.200-2.500l-1.700-3 2.800-2.800 3 1.700q1.200-.8 2.500-1.200z" fill="url(#sg1)"/><path d="M9 8q3-3.500 7-3.500" stroke="#fff" stroke-width="1.400" stroke-linecap="round" fill="none" opacity=".6"/><circle cx="16" cy="16" r="5.500" fill="#2a3a8a"/><circle cx="16" cy="16" r="3" fill="#6bd6ff"/><circle cx="14.800" cy="14.800" r="1" fill="#fff"/>';
const BULB_ICON = '<defs><radialGradient id="bulbg" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fffbd0"/><stop offset=".55" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff9a1f"/></radialGradient></defs><g stroke="#ffd23f" stroke-width="2" stroke-linecap="round"><path d="M16 1.500v2M5 5.500l1.400 1.400M27 5.500l-1.400 1.400M1.500 15h2M28.500 15h2"/></g><path d="M16 5.500c-5 0-8.500 3.800-8.500 8.400 0 3 1.400 4.700 2.800 6.300 1 1.100 1.500 2.100 1.500 3.300h8.400c0-1.200.5-2.200 1.500-3.300 1.400-1.600 2.800-3.300 2.800-6.300 0-4.600-3.500-8.400-8.500-8.400z" fill="url(#bulbg)"/><path d="M11.300 11q1.500-3 4.500-3.200" fill="none" stroke="#fff" stroke-width="1.600" stroke-linecap="round" opacity=".75"/><path d="M13 17.500l1.500-3 1.500 2 1.500-2 1.500 3" fill="none" stroke="#e8861a" stroke-width="1.100" stroke-linecap="round" stroke-linejoin="round"/><rect x="11.300" y="23.500" width="9.400" height="2.800" rx="1.200" fill="#9aa4b8"/><rect x="12.300" y="26.500" width="7.400" height="2.400" rx="1.200" fill="#6b748c"/>';
// full-colour icons for the 'How a round goes' steps
const STEP_ICONS = {
  deal: '<g transform="scale(.727)"><defs><linearGradient id="sdb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6aa8ff"/><stop offset="1" stop-color="#3b4fd8"/></linearGradient></defs><g transform="rotate(-16 22 26)"><rect x="8" y="9" width="19" height="27" rx="3" fill="url(#sdb)" stroke="#fff" stroke-width="1.400"/><path d="M17.500 17l4 5.500-4 5.500-4-5.500z" fill="#fff" opacity=".55"/></g><g transform="rotate(14 22 26)"><rect x="17" y="8" width="19" height="27" rx="3" fill="#fffdf6" stroke="#d8d2c4" stroke-width="1.200"/><path d="M26.500 25.500c-4-2.600-5.500-4.600-5.500-6.400a3 3 0 015.500-1.500 3 3 0 015.500 1.500c0 1.800-1.500 3.800-5.500 6.400z" fill="#ef4660"/><text x="20" y="16" font-size="6.500" font-weight="800" fill="#ef4660" font-family="sans-serif">A</text></g></g>',
  arrange: '<g transform="scale(.727)"><rect x="16.5" y="2" width="11" height="15" rx="2" fill="#fffdf6" stroke="#cfc8b8" stroke-width="1"/><text x="22.0" y="13.2" font-size="9.500" font-weight="700" fill="#2a2f45" text-anchor="middle" font-family="sans-serif">♠</text><rect x="10" y="12" width="11" height="15" rx="2" fill="#fffdf6" stroke="#cfc8b8" stroke-width="1"/><text x="15.5" y="23.2" font-size="9.500" font-weight="700" fill="#ef4660" text-anchor="middle" font-family="sans-serif">♥</text><rect x="23" y="12" width="11" height="15" rx="2" fill="#fffdf6" stroke="#cfc8b8" stroke-width="1"/><text x="28.5" y="23.2" font-size="9.500" font-weight="700" fill="#2a2f45" text-anchor="middle" font-family="sans-serif">♣</text><rect x="3.5" y="23" width="11" height="15" rx="2" fill="#fffdf6" stroke="#cfc8b8" stroke-width="1"/><text x="9.0" y="34.2" font-size="9.500" font-weight="700" fill="#ef4660" text-anchor="middle" font-family="sans-serif">♦</text><rect x="16.5" y="23" width="11" height="15" rx="2" fill="#fffdf6" stroke="#cfc8b8" stroke-width="1"/><text x="22.0" y="34.2" font-size="9.500" font-weight="700" fill="#2a2f45" text-anchor="middle" font-family="sans-serif">♠</text><rect x="29.5" y="23" width="11" height="15" rx="2" fill="#fffdf6" stroke="#cfc8b8" stroke-width="1"/><text x="35.0" y="34.2" font-size="9.500" font-weight="700" fill="#ef4660" text-anchor="middle" font-family="sans-serif">♥</text></g>',
  ready: '<g transform="scale(.727)"><defs><linearGradient id="srk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6aa8ff"/><stop offset="1" stop-color="#3a46d0"/></linearGradient><linearGradient id="srl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#e0a21a"/></linearGradient></defs><rect x="5" y="4" width="23" height="33" rx="3.500" fill="url(#srk)" stroke="#fff" stroke-width="1.600"/><rect x="9" y="8" width="15" height="25" rx="2" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.200"/><path d="M16.500 14l4 6.500-4 6.500-4-6.500z" fill="#fff" fill-opacity=".45"/><path d="M26 25v-4.500a5 5 0 0110 0V25" fill="none" stroke="#c9d2e8" stroke-width="3.200" stroke-linecap="round"/><rect x="22.500" y="24" width="17" height="14" rx="3" fill="url(#srl)" stroke="#fff" stroke-width="1.400"/><circle cx="31" cy="30" r="2.200" fill="#8a5a08"/><rect x="30" y="30.500" width="2" height="4" rx="1" fill="#8a5a08"/></g>',
  reveal: '<g transform="scale(.727)"><defs><radialGradient id="srvg"><stop offset="0" stop-color="#ffe27a" stop-opacity=".9"/><stop offset="1" stop-color="#ffb02e" stop-opacity="0"/></radialGradient></defs><circle cx="22" cy="22" r="21" fill="url(#srvg)"/><g stroke="#ffd23f" stroke-width="1.600" stroke-linecap="round" opacity=".7"><path d="M22 22L44.0 22.0" /><path d="M22 22L41.1 33.0" /><path d="M22 22L33.0 41.1" /><path d="M22 22L22.0 44.0" /><path d="M22 22L11.0 41.1" /><path d="M22 22L2.9 33.0" /><path d="M22 22L0.0 22.0" /><path d="M22 22L2.9 11.0" /><path d="M22 22L11.0 2.9" /><path d="M22 22L22.0 0.0" /><path d="M22 22L33.0 2.9" /><path d="M22 22L41.1 11.0" /></g><g transform="rotate(-9 22 22)"><rect x="9.500" y="5.500" width="25" height="33" rx="4" fill="#fffdf6" stroke="#d8d2c4" stroke-width="1.400"/><text x="13.500" y="15.500" font-size="9" font-weight="800" fill="#ef4660" font-family="sans-serif">A</text><path d="M22 31c-6.500-4.200-8.800-7.400-8.800-10.300a4.700 4.700 0 018.800-2.300 4.700 4.700 0 018.800 2.300c0 2.900-2.300 6.100-8.800 10.300z" fill="#ef4660"/><ellipse cx="18.500" cy="19.500" rx="2" ry="1.200" fill="#fff" opacity=".5"/></g><path d="M37.500 5l1.200 3 3 1.200-3 1.200-1.200 3-1.200-3-3-1.200 3-1.200z" fill="#fff"/><path d="M6 32l.9 2.200 2.200.9-2.200.9L6 38.200l-.9-2.200-2.200-.9 2.200-.9z" fill="#fff" opacity=".9"/></g>',
  penalty: '<g transform="scale(.727)"><defs><linearGradient id="spn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff07a"/><stop offset=".55" stop-color="#ffab2e"/><stop offset="1" stop-color="#ff5a3c"/></linearGradient><radialGradient id="spg"><stop offset="0" stop-color="#ff8a3c" stop-opacity=".55"/><stop offset="1" stop-color="#ff8a3c" stop-opacity="0"/></radialGradient></defs><circle cx="22" cy="22" r="20" fill="url(#spg)"/><path d="M25.500 3L10 24.500h9.500L16.500 41 34 18.500h-10z" fill="url(#spn)" stroke="#fff" stroke-width="1.600" stroke-linejoin="round"/></g>',
};
// full-colour icons for the chat and gift buttons
const SEND_ICON = '<defs><linearGradient id="snd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6bd6ff"/><stop offset="1" stop-color="#3a6bff"/></linearGradient></defs><path d="M3.500 15.500L28 4.500l-6 23-6.200-7.300z" fill="url(#snd)"/><path d="M28 4.500L15.800 20.200l-2.300 6.500-1.800-8.200z" fill="#fff" opacity=".92"/><path d="M13.500 26.700l2.300-6.500 3.400 4z" fill="#b6c8ff"/>';
const CHAT_ICON = '<defs><linearGradient id="chc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6bd6ff"/><stop offset="1" stop-color="#3a6bff"/></linearGradient></defs><path d="M7.500 4h17q4.500 0 4.500 4.500v10q0 4.500-4.500 4.500H15l-6.500 5.500V23H7.500Q3 23 3 18.500v-10Q3 4 7.500 4z" fill="url(#chc)"/><path d="M7 9q2-2.500 6-2.500" fill="none" stroke="#fff" stroke-width="1.500" stroke-linecap="round" opacity=".55"/><rect x="8" y="10" width="16" height="2.200" rx="1.100" fill="#fff"/><rect x="8" y="14.500" width="11" height="2.200" rx="1.100" fill="#fff" opacity=".85"/>', GIFT_ICON = '<defs><linearGradient id="gfb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8f6bff"/><stop offset="1" stop-color="#3a7bff"/></linearGradient></defs><ellipse cx="16" cy="29.500" rx="11" ry="1.400" fill="#000" opacity=".18"/><rect x="5" y="14" width="22" height="15" rx="2" fill="url(#gfb)"/><rect x="3.500" y="10" width="25" height="6" rx="2" fill="#a68bff"/><rect x="14" y="10" width="4" height="19" fill="#ff8fc0"/><path d="M16 4.200l1.400 3 3.200.4-2.400 2.200.7 3.200-2.900-1.700-2.900 1.700.7-3.200-2.400-2.200 3.200-.4z" fill="#ffd23f" stroke="#e0a21a" stroke-width=".6" stroke-linejoin="round"/><circle cx="25" cy="5" r="1.200" fill="#6bd6ff"/><circle cx="6" cy="7" r="1" fill="#7be08f"/>';
const colorIcon = (svg, size) => { const w = el('span', { class: 'cico' }); w.style.cssText = `display:inline-block;width:${size}px;height:${size}px;line-height:0`; w.innerHTML = uniqSvg(`<svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true">${svg}</svg>`); return w; };
// the shop's full-colour icon: a little storefront
const SHOP_ICON = '<ellipse cx="16" cy="29.500" rx="12" ry="1.600" fill="#000" opacity=".18"/><rect x="5" y="14" width="22" height="15" rx="1.600" fill="#ffe9c2"/><rect x="8" y="18" width="8" height="6.500" rx="1" fill="#8fd3ff" stroke="#6aa9d6" stroke-width=".8"/><path d="M12 18v6.500M8 21.200h8" stroke="#fff" stroke-width=".9" opacity=".8"/><rect x="19.500" y="18" width="5" height="11" rx="1" fill="#9b5e2e"/><circle cx="23" cy="24" r=".7" fill="#ffd23f"/><path d="M6 5h20l4 9H2z" fill="#ff4d5a"/><path d="M11.800 5h3.200l-.9 9h-3.600zM18 5h3.200l1.300 9H19z" fill="#fff"/><path d="M2 14a3.500 3.500 0 007 0zM16 14a3.500 3.500 0 007 0z" fill="#fff"/><path d="M9 14a3.500 3.500 0 007 0zM23 14a3.500 3.500 0 007 0z" fill="#ff4d5a"/><circle cx="27.500" cy="4" r="1.500" fill="#ffd23f"/><circle cx="4.500" cy="3.500" r="1.100" fill="#6bd6ff"/>';
function shopIcon(size = 24) {
  const w = el('span', { class: 'shopico' }); w.style.cssText = `display:inline-block;width:${size}px;height:${size}px;line-height:0`;
  w.innerHTML = uniqSvg(`<svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true">${SHOP_ICON}</svg>`);
  return w;
}
// the win-point numbers (shop chip and header badge) roll like a slot machine: each digit spins down (or up) to its new value
let wpDisp = null, wpTarget = null;
const wpFmt = (kind, v) => (kind === 'badge' ? (v >= 10000 ? Math.round(v / 1000) + 'k' : String(v)) : t('wpN', { n: v }));
const ODO_ROW = 1.15, ODO_COPIES = 5;
function odoCol(startIdx) {
  const col = el('span', { class: 'odd' }), strip = el('div', { class: 'strip' });
  for (let c = 0; c < ODO_COPIES; c++) for (let d = 0; d < 10; d++) strip.append(el('div', {}, String(d)));
  strip.style.transform = `translateY(${-startIdx * ODO_ROW}em)`; col.append(strip); col.dataset.idx = String(startIdx); return col;
}
// fill `host` with the text for value v; digits become spinnable columns (starting at their own digit, or at `startDigits` when given)
function odoBuild(host, kind, v, startDigits) {
  host.dataset.wpnum = kind; host.dataset.shown = String(v); host.classList.add('odo');
  const txt = wpFmt(kind, v), nums = String(Math.abs(v)).length; let di = 0;
  const total = [...txt].filter((c) => /\d/.test(c)).length;
  host.replaceChildren(...[...txt].map((ch) => { if (!/\d/.test(ch)) return el('span', { class: 'odc' }, ch); const k = total - 1 - di++; const start = startDigits && startDigits[k] !== undefined ? startDigits[k] : +ch; return odoCol(2 * 10 + start); }));
}
function odoRoll(host, kind, from, to) {
  const oldD = String(Math.abs(from)).split('').map(Number).reverse(), newD = String(Math.abs(to)).split('').map(Number).reverse();
  odoBuild(host, kind, to, oldD.map((d, k) => d));   // columns start at the old digits
  const cols = [...host.querySelectorAll('.odd')].reverse(), down = to < from, loops = Math.abs(to - from) >= 100 ? 1 : 0;
  host.classList.add('rolling', down ? 'dn' : 'up');
  let longest = 0;
  cols.forEach((col, k) => {
    const od = oldD[k] === undefined ? 0 : oldD[k], nd = newD[k];
    if (od === nd && !(loops && k < 2)) return;
    let end = 20 + nd; if (down) { if (nd > od) end -= 10; end -= 10 * (loops && k < 2 ? 1 : 0); } else { if (nd < od) end += 10; end += 10 * (loops && k < 2 ? 1 : 0); }
    const dur = 650 + k * 140 + (loops ? 250 : 0), delay = k * 70; longest = Math.max(longest, dur + delay);
    const strip = col.firstChild, a0 = -(20 + od) * ODO_ROW, a1 = -end * ODO_ROW;
    strip.style.transform = `translateY(${a0}em)`;
    const an = strip.animate([{ transform: `translateY(${a0}em)` }, { transform: `translateY(${a1 + (down ? 0.18 : -0.18)}em)`, offset: 0.88 }, { transform: `translateY(${a1}em)` }], { duration: dur, delay, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'forwards' });
    an.onfinish = () => { strip.style.transform = `translateY(${-(20 + nd) * ODO_ROW}em)`; try { an.cancel(); } catch {} };
  });
  setTimeout(() => host.classList.remove('rolling', 'dn', 'up'), longest + 150);
}
function wpTo(target) {
  document.querySelectorAll('.wpplain').forEach((n) => { const v = t('wpN', { n: target }); if (n.textContent !== v) n.textContent = v; });
  const hosts = [...document.querySelectorAll('[data-wpnum]')];
  const fresh = wpTarget !== target;
  if (fresh) {
    const from = wpDisp === null ? target : wpDisp; wpTarget = target;
    const diff = target - from, quick = wpDisp === null || ui.calm || document.hidden || diff === 0;
    hosts.forEach((h) => { quick ? odoBuild(h, h.dataset.wpnum, target) : odoRoll(h, h.dataset.wpnum, from, target); });
    if (!quick) {
      const host = document.querySelector('.wpchip') || document.querySelector('#shopBtn');
      if (host) {
        const r0 = host.getBoundingClientRect(), pop = el('span', { class: 'wppop ' + (diff < 0 ? 'neg' : 'pos') }, (diff < 0 ? '−' : '+') + Math.abs(diff));
        pop.style.left = r0.left + r0.width / 2 + 'px'; pop.style.top = r0.top + r0.height / 2 + 'px'; document.body.append(pop); setTimeout(() => pop.remove(), 1300);
        host.classList.remove('wpbump'); void host.offsetWidth; host.classList.add('wpbump');
      }
    }
    wpDisp = target;
  } else {
    // a freshly drawn panel: show the settled value (nothing to roll)
    hosts.forEach((h) => { if (h.dataset.shown !== String(target)) odoBuild(h, h.dataset.wpnum, target); });
  }
}
