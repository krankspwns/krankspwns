// Shared client for every game: Google / Apple sign-in, the account and WP wallet, the shop (avatars, borders, accessories,
// consumables), reactions and gifts, and the sound controls. It watches the game's own server replies, so each game
// only needs to load this one script.
(() => {
  'use strict';
  const API = '/api/platform';
  const GAME_API = /^\/api\/(bridge|hot-joker|grand-con)$/;
  const PAGE = { '/bridge.html': 'bridge', '/hot-joker.html': 'hot-joker', '/grand-con.html': 'grand-con', '/last-train.html': 'last-train' }[location.pathname] || 'reckoning';
  const OWN_TABLE_UI = PAGE === 'reckoning' || PAGE === 'last-train';   // these two already draw their own reactions, shop and gifts
  const FREE = { cat: '🐱', dog: '🐶', fox: '🦊', bear: '🐻', panda: '🐼', rabbit: '🐰', frog: '🐸', lion: '🦁', pig: '🐷', koala: '🐨', owl: '🦉', tiger: '🐯', penguin: '🐧', monkey: '🐵', elephant: '🐘', mouse: '🐭', chicken: '🐔', cow: '🐮', dino: '🦖', unicorn: '🦄' };
  const PREM = { dragon: '🐲', robot: '🤖', alien: '👽', ghost: '👻', wizard: '🧙', ninja: '🥷' };
  const LEGEND = new Set(['phoenix', 'shadowphoenix', 'moonwolf', 'samurai', 'thundertiger', 'goldlion', 'reaper']);
  const ACC = { hat: '🎩', shades: '🕶️', mustache: '🧔', flower: '🌸', headphones: '🎧', horns: '😈', crown: '👑', halo: '😇' };
  const GIFT = { tomato: '🍅', rose: '🌹', snowball: '❄️', popper: '🎉', balloon: '🎈', kiss: '💋', pie: '🥧', ghost: '👻', rocket: '🚀', bomb: '💣', zap: '⚡', fireworks: '🎆', disco: '🪩', cash: '💸' };
  const EMO = { laugh: '😂', wow: '😮', cry: '😢', cool: '😎', fire: '🔥', rip: '🪦', angry: '😠', think: '🤔', heart: '❤️', trophy: '🏆' };
  const TAG = { gg: 'GG', ez: 'EZ', gl: 'GL', wp: 'WP', oof: 'OOF', faster: 'FASTER LEH', aiyo: 'AIYO!', steady: 'STEADY' };
  const CLIPS = new Set(['gg', 'ez', 'gl', 'wp', 'oof', 'faster', 'aiyo', 'steady']);
  const KIND_NAME = { av: 'Avatars', bd: 'Borders', acc: 'Accessories', gift: 'Gifts' };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2');

  let account = null, config = null, seat = null, st = null, seenFeed = null, seenAward = null, busy = false;
  const real = window.fetch.bind(window);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : String(Math.random()).slice(2) + Date.now());

  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (v === undefined || v === null || v === false) continue; if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : v); }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c);
    return n;
  }
  async function api(body) {
    const r = await real(API, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'x-kp': '1' }, body: JSON.stringify({ requestId: uid(), ...body }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(Error(j.error || 'Please try again.'), { status: r.status, needConsent: j.needConsent }); return j;
  }
  const sfx = (n) => window.GameAudio?.sfx(n);

  // ---------- small art ----------
  function avatar(key, bd = '', acc = '', size = 40) {
    const inner = LEGEND.has(key) ? el('img', { src: '/avatars/' + key + '.webp', alt: '', width: size, height: size, loading: 'lazy' }) : el('span', { class: 'pf-face', text: FREE[key] || PREM[key] || '🙂' });
    const w = el('span', { class: 'pf-av' + (bd ? ' pf-bd pf-bd-' + bd : ''), style: `--s:${size}px`, 'aria-hidden': 'true' }, inner);
    if (acc && ACC[acc]) w.append(el('i', { class: 'pf-acc', text: ACC[acc] })); return w;
  }
  const emoteArt = (k) => (TAG[k] ? el('b', { class: 'pf-tag', text: TAG[k] }) : el('span', { class: 'pf-emo', text: EMO[k] || '🙂' }));
  function toast(text, icon) {
    let lane = document.getElementById('pf-toasts'); if (!lane) { lane = el('div', { id: 'pf-toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(lane); }
    while (lane.children.length > 3) lane.firstChild.remove();
    const t = el('div', { class: 'pf-toast' }, icon || null, el('span', { text })); lane.append(t); setTimeout(() => t.remove(), 4200);
  }
  const wallet = () => (st?.social ? st.social.wallet : account ? { pts: account.pts, owned: account.owned, gifts: account.gifts, eq: account.eq, account: true } : null);
  const catalog = () => st?.social?.prices || config?.catalog;

  // ---------- sign-in ----------
  let overlay = null;
  const close = () => { overlay?.remove(); overlay = null; document.body.classList.remove('pf-lock'); };
  function modal(title, ...body) {
    close();
    overlay = el('div', { class: 'pf-ov', onclick: (e) => { if (e.target === overlay) close(); } }, el('div', { class: 'pf-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('div', { class: 'pf-head' }, el('h2', { text: title }), el('button', { type: 'button', class: 'pf-x', 'aria-label': 'Close', onclick: close, text: '✕' })), ...body));
    document.body.append(overlay); document.body.classList.add('pf-lock'); return overlay;
  }
  const script = (src) => new Promise((ok, bad) => { if ([...document.scripts].some((s) => s.src === src)) return ok(); const s = el('script', { src, async: true }); s.onload = ok; s.onerror = bad; document.head.append(s); });
  function setBusy(on) {   // full-dialog spinner while the server verifies the sign-in
    const box = overlay?.querySelector('.pf-box'); if (!box) return;
    box.querySelector('.pf-busy')?.remove(); box.removeAttribute('aria-busy');
    if (on) { box.setAttribute('aria-busy', 'true'); box.append(el('div', { class: 'pf-busy', role: 'status' }, el('i', { class: 'pf-spin', 'aria-hidden': 'true' }), el('span', { text: 'Signing you in…' }))); }
  }
  async function finishLogin(provider, idToken, nonce, ui) {
    setBusy(true); ui.error.hidden = true;
    try {
      const j = await api({ action: 'login', provider, idToken, nonce, consent: { accepted: true, age: true, version: config.consentVersion } });
      account = j.account; sfx('good'); close(); renderChip(); relink();
      toast(j.created ? `Welcome! You start with ${config.startWp} WP.` : 'Signed in.', '👋');
      if (seat) toast('This seat now plays on your account, so WP you earn here is banked to it.', 'ℹ️');
    } catch (e) { ui.error.textContent = e.message; ui.error.hidden = false; sfx('error'); setBusy(false); await prepare(ui); }
  }
  // the room keeps its own record of whose seat this is: tell it when the player signs in or out
  const relink = async () => { if (seat && st?.social) { try { await roomAct('relink'); } catch {} renderDock(); renderChip(); } };
  async function prepare(ui) {   // a fresh one-time code for each attempt (stops a captured sign-in being replayed)
    ui.nonce = (await api({ action: 'nonce' })).nonce;
    if (config.google && window.google?.accounts?.id) {
      google.accounts.id.initialize({ client_id: config.google, nonce: ui.nonce, callback: (r) => finishLogin('google', r.credential, ui.nonce, ui), ux_mode: 'popup' });
      ui.gbox.replaceChildren(); google.accounts.id.renderButton(ui.gbox, { theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'pill', width: Math.min(400, Math.max(200, Math.round(ui.gbox.parentElement?.clientWidth || 280))), logo_alignment: 'center' });
    }
  }
  async function openLogin() {
    if (!config?.enabled) return toast('Sign-in is not switched on yet.', '⚠️');
    const ui = { error: el('p', { class: 'pf-err', role: 'alert', hidden: true }), gbox: el('div', { class: 'pf-gbox' }), nonce: '' };
    const a = el('input', { type: 'checkbox', id: 'pf-c1' }), b = el('input', { type: 'checkbox', id: 'pf-c2' });
    const buttons = el('div', { class: 'pf-providers', 'aria-disabled': 'true' });
    const sync = () => { const on = a.checked && b.checked; buttons.classList.toggle('off', !on); document.querySelector('.pf-hint')?.toggleAttribute('hidden', on); };
    a.onchange = b.onchange = sync;
    if (config.google) buttons.append(ui.gbox);
    if (config.apple) buttons.append(el('button', { type: 'button', class: 'pf-apple', onclick: async () => {
      if (!a.checked || !b.checked) return;
      try { await script('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js');
        AppleID.auth.init({ clientId: config.apple, scope: '', redirectURI: location.origin + '/', state: 'kp', nonce: ui.nonce, usePopup: true });
        const r = await AppleID.auth.signIn(); await finishLogin('apple', r.authorization.id_token, ui.nonce, ui);
      } catch (e) { if (e && e.error !== 'popup_closed_by_user') { ui.error.textContent = 'Apple sign-in did not finish.'; ui.error.hidden = false; } }
    }, text: ' Continue with Apple' }));
    const perk = (icon, title, text) => el('li', {}, el('span', { class: 'pf-perk', text: icon }), el('div', {}, el('b', { text: title }), el('small', { text })));
    const ov = modal('',
      el('section', { class: 'pf-login-hero' },
        el('div', { class: 'pf-logo', 'aria-hidden': 'true' }, ...['🃏', '🏆', '🎁'].map((t) => el('span', { text: t }))),
        el('h2', { text: 'Join the Game Room' }), el('p', { text: 'One account for every game. Your WP and style go wherever you play.' })),
      el('ul', { class: 'pf-perks' },
        perk('🏆', 'Keep your WP', 'Earn WP by winning with friends and spend it in any game'),
        perk('🎨', 'Your own style', 'Avatars, borders and accessories are yours in every game'),
        perk('🎁', 'Gifts & reactions', 'Your gifts follow you from room to room')),
      el('section', { class: 'pf-consent' },
        el('label', { class: 'pf-check', for: 'pf-c1' }, a, el('span', {}, 'I have read the ', el('a', { href: '/privacy.html', target: '_blank', rel: 'noopener', text: 'Privacy Notice' }), ' and agree to my data being used as it describes.')),
        el('label', { class: 'pf-check', for: 'pf-c2' }, b, el('span', { text: 'I am 13 or older, or a parent or guardian agrees for me.' }))),
      buttons, el('p', { class: 'pf-hint', text: 'Tick both boxes to continue' }), ui.error,
      el('p', { class: 'pf-fine', text: 'We keep no name, email or photo from Google or Apple. Download or delete your data any time.' }),
      el('div', { class: 'pf-or' }, el('span', { text: 'or' })),
      el('button', { type: 'button', class: 'pf-ghost pf-guest', onclick: close, text: 'Play as a guest' }),
      el('p', { class: 'pf-fine', text: 'Guests earn WP inside a room, but it is lost when they leave the room or change game.' }));
    ov.querySelector('.pf-head')?.remove();
    ov.querySelector('.pf-box').prepend(el('button', { type: 'button', class: 'pf-x pf-x-float', 'aria-label': 'Close', onclick: close, text: '✕' }));
    sync();
    try { if (config.google) await script('https://accounts.google.com/gsi/client'); await prepare(ui); } catch { ui.error.textContent = 'Could not reach the sign-in service. Check your connection.'; ui.error.hidden = false; }
  }

  // ---------- account ----------
  function openAccount() {
    const eq = account.eq || {}, a = window.GameAudio, prefs = a?.prefs() || {};
    const run = (fn) => async () => { try { await fn(); } catch (e) { toast(e.message, '⚠️'); } };
    const nick = el('input', { type: 'text', maxlength: 12, value: account.nick || '', placeholder: 'Pick a nickname', 'aria-label': 'Nickname', onkeydown: (e) => { if (e.key === 'Enter') save.click(); } });
    const save = el('button', { type: 'button', class: 'pf-small', text: 'Save', onclick: run(async () => { account = (await api({ action: 'nick', nick: nick.value })).account; renderChip(); toast('Nickname saved.', '✅'); }) });
    const count = (o) => Object.values(o).reduce((n, v) => n + v.length, 0);
    const gifts = Object.values(account.gifts || {}).reduce((n, v) => n + Math.max(0, v), 0);
    const cap = config.dailyCap || 400, got = Math.min(cap, account.earnedToday || 0);
    const toggle = (label, hint, on, fn) => el('label', { class: 'pf-switch' }, el('span', {}, el('b', { text: label }), el('small', { text: hint })), el('input', { type: 'checkbox', checked: on ? true : undefined, onchange: (e) => fn(e.target.checked) }));
    const provider = account.provider === 'apple' ? ' Apple' : 'Google';
    modal('Your account',
      el('section', { class: 'pf-hero' }, avatar(eq.av || 'cat', eq.bd, eq.acc, 84),
        el('div', { class: 'pf-who' }, el('b', { class: 'pf-name', text: account.nick || 'Player' }), el('small', { text: 'Signed in with ' + provider }),
          el('div', { class: 'pf-row' }, nick, save))),
      el('section', { class: 'pf-wpcard' }, el('div', {}, el('small', { text: 'YOUR WP' }), el('b', { class: 'pf-big', text: '🏆 ' + account.pts.toLocaleString() })),
        el('div', { class: 'pf-meter', role: 'img', 'aria-label': got + ' of ' + cap + ' WP earned today' }, el('i', { style: 'width:' + Math.round(got / cap * 100) + '%' }), el('small', { text: 'Earned today ' + got + ' / ' + cap }))),
      el('div', { class: 'pf-stats' },
        el('div', {}, el('b', { text: String(count({ a: account.owned.av }) + 20) }), el('small', { text: 'Avatars' })),
        el('div', {}, el('b', { text: String(account.owned.bd.length) }), el('small', { text: 'Borders' })),
        el('div', {}, el('b', { text: String(account.owned.acc.length) }), el('small', { text: 'Accessories' })),
        el('div', {}, el('b', { text: gifts > 9999 ? '9999+' : String(gifts) }), el('small', { text: 'Gifts' }))),
      el('div', { class: 'pf-cta' }, el('button', { type: 'button', text: '🛍️  Shop & change look', onclick: () => openShop() })),
      el('p', { class: 'pf-note', text: 'Win games with other people to earn WP. Use them in the shop in any game.' }),
      a ? el('section', { class: 'pf-card' }, el('h3', { text: 'Sound' }),
        toggle('Sound effects', 'Taps, cards and reactions', prefs.sfx, (v) => a.setSfx(v)),
        a.game ? toggle('Background music', a.themeName() + ' theme', prefs.music, (v) => a.setMusic(v)) : null) : null,
      el('details', { class: 'pf-card' }, el('summary', { text: 'Privacy & data' }),
        el('p', { class: 'pf-note', text: 'We keep your nickname, WP, items and consent record. No name, email or photo from ' + provider.trim() + '.' }),
        el('div', { class: 'pf-row wrap' },
          el('button', { type: 'button', class: 'pf-ghost', text: 'Download my data', onclick: run(async () => {
            const j = await api({ action: 'export' }), url = URL.createObjectURL(new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' }));
            el('a', { href: url, download: 'krankspwns-my-data.json' }).click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
          }) }),
          el('button', { type: 'button', class: 'pf-danger', text: 'Delete my account', onclick: run(async () => {
            if (prompt('This permanently deletes your account, WP and items. Type DELETE to confirm.') !== 'DELETE') return;
            await api({ action: 'delete', confirm: 'DELETE' }); account = null; close(); renderChip(); toast('Your account and data were deleted.', '🗑️');
          }) })),
        el('p', { class: 'pf-fine' }, el('a', { href: '/privacy.html', target: '_blank', rel: 'noopener', text: 'Privacy Notice' }), ' · consent version ', account.consent?.version || '')),
      el('div', { class: 'pf-row wrap pf-signout' },
        el('button', { type: 'button', class: 'pf-ghost', text: 'Sign out', onclick: run(async () => { await api({ action: 'logout' }); account = null; close(); renderChip(); await relink(); toast('Signed out.', '👋'); }) }),
        el('button', { type: 'button', class: 'pf-ghost', text: 'Sign out everywhere', onclick: run(async () => { await api({ action: 'logoutAll' }); account = null; close(); renderChip(); await relink(); toast('Signed out on every device.', '👋'); }) })));
  }

  // ---------- shop ----------
  let shopTab = 'av';
  async function shopAct(action, extra) {
    if (busy) return; busy = true;
    try {
      if (st?.social && seat) { const r = await roomAct(action, extra); if (!r) throw Error('Please try again.'); }
      else if (account) account = (await api({ action, ...extra })).account;
      else throw Error('Join a room or sign in first.');
      sfx(action === 'buy' ? 'coin' : 'pop'); renderChip(); if (overlay?.dataset.shop) openShop(true);
    } catch (e) { toast(e.message, '⚠️'); sfx('error'); } finally { busy = false; }
  }
  function openShop(keep) {
    const w = wallet(), c = catalog();
    if (!w || !c) return toast(account ? 'The shop opens inside a room, or after you sign in.' : 'Sign in, or join a room as a guest, to use the shop.', '🛍️');
    const scroll = overlay?.querySelector('.pf-grid')?.scrollTop || 0;
    const tabs = el('div', { class: 'pf-tabs', role: 'tablist' }, ...Object.keys(KIND_NAME).map((k) => el('button', { type: 'button', role: 'tab', class: k === shopTab ? 'on' : '', 'aria-selected': String(k === shopTab), onclick: () => { shopTab = k; openShop(true); }, text: KIND_NAME[k] })));
    const items = [];
    const card = (pre, name, sub, btn) => el('div', { class: 'pf-item' }, el('div', { class: 'pf-pre' }, pre), el('b', { text: name }), el('small', { text: sub }), btn);
    const eq = w.eq || {};
    if (shopTab === 'av') {
      for (const k of c.avatars || Object.keys(FREE)) items.push(card(avatar(k, eq.bd, '', 48), cap(k), 'Free', el('button', { type: 'button', disabled: eq.av === k || undefined, onclick: () => shopAct('equip', { kind: 'av', key: k }), text: eq.av === k ? 'In use' : 'Use' })));
      for (const [k, price] of Object.entries(c.av).sort((x, y) => x[1] - y[1])) { const own = w.owned.av.includes(k);
        items.push(card(avatar(k, eq.bd, '', 48), cap(k), own ? 'Owned' : price + ' WP', own ? el('button', { type: 'button', disabled: eq.av === k || undefined, onclick: () => shopAct('equip', { kind: 'av', key: k }), text: eq.av === k ? 'In use' : 'Use' }) : el('button', { type: 'button', disabled: w.pts < price || undefined, onclick: () => shopAct('buy', { kind: 'av', key: k }), text: 'Buy · ' + price }))); }
    } else if (shopTab === 'bd' || shopTab === 'acc') {
      const kind = shopTab, cur = eq[kind];
      for (const [k, price] of Object.entries(c[kind]).sort((x, y) => x[1] - y[1])) { const own = w.owned[kind].includes(k);
        const pre = kind === 'bd' ? avatar(eq.av || 'cat', k, eq.acc, 48) : avatar(eq.av || 'cat', eq.bd, k, 48);
        items.push(card(pre, cap(k), own ? (cur === k ? 'Wearing' : 'Owned') : price + ' WP', own ? el('button', { type: 'button', class: 'pf-ghost', onclick: () => shopAct('equip', { kind, key: cur === k ? '' : k }), text: cur === k ? 'Take off' : 'Wear' }) : el('button', { type: 'button', disabled: w.pts < price || undefined, onclick: () => shopAct('buy', { kind, key: k }), text: 'Buy · ' + price }))); }
    } else {
      for (const [k, price] of Object.entries(c.gift).sort((x, y) => x[1] - y[1])) { const left = w.gifts[k] || 0;
        items.push(card(el('span', { class: 'pf-gift', text: GIFT[k] }), cap(k), left ? `${left} left` : `Pack of ${c.uses}`, el('button', { type: 'button', disabled: w.pts < price || undefined, onclick: () => shopAct('buy', { kind: 'gift', key: k }), text: 'Buy · ' + price }))); }
    }
    const ov = modal('Shop', el('p', { class: 'pf-wp' }, '🏆 ', el('b', { text: String(w.pts) }), ' WP', st?.social && !w.account ? el('small', { text: ' · guest WP stay in this room only' }) : null), tabs, el('div', { class: 'pf-grid' }, ...items));
    ov.dataset.shop = '1'; const g = ov.querySelector('.pf-grid'); if (keep) g.scrollTop = scroll;
  }

  // ---------- table: reactions, gifts, players ----------
  async function roomAct(action, extra = {}) {
    if (!seat || !st) return null;
    const r = await real(seat.api, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra, code: seat.code, pid: seat.pid, tok: seat.tok, match: st.match, requestId: uid() }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(Error(j.error || 'Please try again.'), { status: r.status });
    observe(seat.api, { action, pid: seat.pid, tok: seat.tok }, j); return j;
  }
  let tray = null, dock = null;
  const closeTray = () => { tray?.remove(); tray = null; };
  function openTray(kind) {
    const was = tray?.dataset.kind; closeTray(); if (was === kind) return;
    tray = el('div', { class: 'pf-tray', 'data-kind': kind, role: 'menu' });
    if (kind === 'emote') tray.append(...st.social.emotes.map((k) => el('button', { type: 'button', role: 'menuitem', 'aria-label': k, onclick: async () => { closeTray(); const p = mine('e', k); floatEmote({ n: 0, t: 'e', id: st.meId, k }); try { await roomAct('emote', { e: k }); } catch (e) { drop(p); toast(e.message, '⚠️'); } } }, emoteArt(k))));
    if (kind === 'gift') {
      const mine = Object.entries(st.social.wallet.gifts || {}).filter(([, n]) => n > 0);
      if (!mine.length) tray.append(el('p', { class: 'pf-note', text: 'No gifts yet. Buy some in the shop.' }), el('button', { type: 'button', text: 'Open the shop', onclick: () => { closeTray(); shopTab = 'gift'; openShop(); } }));
      else tray.append(...mine.map(([k, n]) => el('button', { type: 'button', role: 'menuitem', onclick: () => pickTarget(k) }, el('span', { class: 'pf-gift', text: GIFT[k] }), el('small', { text: '×' + n }))));
    }
    if (kind === 'players') tray.append(...playerRows());
    document.body.append(tray);
  }
  function playerRows() {
    return st.players.filter((p) => !p.bot && !p.departed).map((p) => { const c = st.social.cos[p.id] || {};
      return el('div', { class: 'pf-prow' }, avatar(c.av || 'cat', c.bd, c.acc, 34), el('span', { class: 'pf-pname' }, p.name + (p.id === st.meId ? ' (you)' : ''), c.member ? el('i', { title: 'Signed-in player', text: ' ✔' }) : null)); });
  }
  function pickTarget(item) {
    closeTray(); tray = el('div', { class: 'pf-tray', 'data-kind': 'target' }, el('p', { class: 'pf-note', text: 'Throw ' + cap(item) + ' at…' }),
      ...st.players.filter((p) => !p.bot && !p.departed && p.id !== st.meId).map((p) => { const c = st.social.cos[p.id] || {};
        return el('button', { type: 'button', onclick: async () => { closeTray(); const q = mine('g', item); flyGift({ n: 0, t: 'g', id: st.meId, to: p.id, k: item }); try { await roomAct('throw', { item, target: p.id }); } catch (e) { drop(q); toast(e.message, '⚠️'); sfx('error'); } } }, avatar(c.av || 'cat', c.bd, c.acc, 34), el('small', { text: p.name })); }));
    document.body.append(tray);
  }
  function renderDock() {
    const show = !!(st?.social && seat) && !OWN_TABLE_UI;
    if (!show) { dock?.remove(); dock = null; closeTray(); return; }
    const w = st.social.wallet;
    const btn = (label, text, fn) => el('button', { type: 'button', 'aria-label': label, title: label, onclick: fn, text });
    const next = el('div', { id: 'pf-dock' }, btn('Reactions', '😀', () => openTray('emote')), btn('Throw a gift', '🎁', () => openTray('gift')), btn('Players', '👥', () => openTray('players')),
      el('button', { type: 'button', class: 'pf-wpchip', 'aria-label': 'Shop', onclick: () => openShop(), text: '🏆 ' + w.pts }));
    dock ? dock.replaceWith(next) : document.body.append(next); dock = next;
  }
  // my own emote / gift is shown the moment I tap it; when the server's copy comes back in the feed it is skipped once
  const pending = [];
  const mine = (t, k) => { const p = { t, k, at: Date.now() }; pending.push(p); return p; };
  const drop = (p) => { const i = pending.indexOf(p); if (i >= 0) pending.splice(i, 1); };
  const isEcho = (it) => { const now = Date.now(); for (let i = pending.length - 1; i >= 0; i--) if (now - pending[i].at > 15000) pending.splice(i, 1);
    if (!st || it.id !== st.meId) return false; const i = pending.findIndex((p) => p.t === it.t && p.k === it.k); if (i < 0) return false; pending.splice(i, 1); return true; };
  // voice clips are fetched once and reused, so there is no network wait when someone reacts
  const clips = {};
  const clip = (k) => (clips[k] ||= Object.assign(new Audio('/audio/' + k + '.mp3'), { preload: 'auto' }));
  const warmClips = () => { if (!warmClips.done && window.GameAudio?.prefs().sfx) { warmClips.done = true; CLIPS.forEach((k) => { try { clip(k).load(); } catch {} }); } };
  function floatEmote(item) {
    if (document.hidden) return;
    const p = st.players.find((q) => q.id === item.id), c = st.social.cos[item.id] || {};
    const f = el('div', { class: 'pf-float', style: `--x:${10 + Math.random() * 70}%` }, avatar(c.av || 'cat', c.bd, c.acc, 30), el('small', { text: p?.name || '' }), emoteArt(item.k));
    document.body.append(f); setTimeout(() => f.remove(), 2800);
    if (window.GameAudio && window.GameAudio.prefs().sfx && CLIPS.has(item.k)) { try { const a = clip(item.k).cloneNode(); a.volume = 0.8; a.play().catch(() => sfx('pop')); } catch { sfx('pop'); } } else sfx('pop');
  }
  function flyGift(item) {
    if (document.hidden) return;
    const from = st.players.find((q) => q.id === item.id), to = st.players.find((q) => q.id === item.to);
    const f = el('div', { class: 'pf-fly' }, el('span', { class: 'pf-gift', text: GIFT[item.k] || '🎁' }), el('small', { text: `${from?.name || '?'} → ${to?.name || '?'}` }));
    document.body.append(f); setTimeout(() => f.remove(), 2200); sfx('whoosh'); if (item.to === st.meId) setTimeout(() => sfx('bad'), 500);
  }
  // game reply -> platform state
  const PHASE_SFX = { playing: 'deal', bidding: 'deal', forging: 'deal', discussion: 'turn', voting: 'turn', reveal: 'reveal', finished: 'win' };
  function observe(url, init, j) {
    if (!j || !j.social || !j.meId || !j.code) return;
    let body = {}; try { body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}; } catch {}
    if (body.action === 'leave') { seat = null; st = null; seenFeed = null; renderDock(); return; }
    const path = new URL(url, location.href).pathname, hdr = init?.headers?.['x-tok'] || (init?.headers instanceof Headers ? init.headers.get('x-tok') : '');
    const tok = j.tok || body.tok || hdr || (seat && seat.code === j.code && seat.pid === j.meId ? seat.tok : '');
    if (!tok) return;
    const prev = st; seat = { api: path, code: j.code, pid: j.meId, tok };
    if (prev && prev.code !== j.code) { seenFeed = null; seenAward = null; }
    st = j; warmClips();
    if (account && j.social.wallet.account) { const w = j.social.wallet; Object.assign(account, { pts: w.pts, owned: w.owned, gifts: w.gifts, eq: w.eq }); }
    const feed = j.social.feed || [];
    if (seenFeed === null) seenFeed = j.social.n; else {
      for (const it of feed) if (it.n > seenFeed && !isEcho(it)) { if (it.t === 'e') floatEmote(it); else if (it.t === 'g') flyGift(it); }
      seenFeed = Math.max(seenFeed, j.social.n);
    }
    const aw = j.social.awards;
    if (aw && seenAward !== aw.match) { if (seenAward !== null || prev) { const n = aw.wp[j.meId]; if (n) { toast(`+${n} WP${j.social.wallet.account ? ' added to your account' : ' (guest: kept for this room only)'}`, '🏆'); sfx('win'); } else if (aw.note === 'solo') toast('No WP for games with bots only. Play with another person to earn WP.', 'ℹ️'); } seenAward = aw.match; }
    if (prev && prev.phase !== j.phase && PHASE_SFX[j.phase] && window.GameAudio?.game) sfx(PHASE_SFX[j.phase]);
    if (!prev || prev.social.wallet.pts !== j.social.wallet.pts || prev.social.n !== j.social.n || prev.meId !== j.meId) { renderDock(); renderChip(); }
  }
  window.fetch = async function (input, init) {
    const res = await real(input, init);
    try { const u = new URL(typeof input === 'string' ? input : input.url, location.href); if (u.origin === location.origin && GAME_API.test(u.pathname)) res.clone().json().then((j) => observe(u.href, init, j)).catch(() => {}); } catch {}
    return res;
  };

  // ---------- the account chip ----------
  let chip = null;
  function renderChip() {
    const w = wallet();
    const next = account
      ? el('button', { id: 'pf-chip', type: 'button', onclick: openAccount, title: 'Your account' }, avatar(account.eq?.av || 'cat', account.eq?.bd, account.eq?.acc, 30), el('span', { class: 'pf-cn' }, el('b', { text: account.nick || 'My account' }), el('small', { text: '🏆 ' + account.pts.toLocaleString() })))
      : el('button', { id: 'pf-chip', type: 'button', class: 'guest', onclick: openLogin, title: 'Sign in with Google or Apple' }, el('span', { text: seat && w ? 'Guest · 🏆 ' + w.pts : 'Sign in' }), seat ? null : el('small', { text: 'or play as guest' }));
    chip ? chip.replaceWith(next) : document.body.append(next); chip = next;
  }
  window.Platform = { openLogin, openShop, account: () => account, avatar, toast };
  // Signed in: pre-fill each game's "Your name" box with the account nickname (only when empty, never over what the player typed).
  const NAME_BOXES = '#lt-name, #gc-name, #player-name, #tk-name';
  function fillNames() {
    const nick = account?.nick; if (!nick) return;
    document.querySelectorAll(NAME_BOXES).forEach((i) => {
      if (i.value || i.dataset.pfFilled || i.dataset.pfTyped) return;
      i.dataset.pfFilled = '1'; i.value = i.maxLength > 0 ? Array.from(nick).slice(0, i.maxLength).join('') : nick;
      i.dispatchEvent(new Event('input', { bubbles: true }));   // so the game's own state picks it up
    });
  }
  document.addEventListener('input', (e) => { if (e.isTrusted && e.target.matches?.(NAME_BOXES)) e.target.dataset.pfTyped = '1'; }, true);
  new MutationObserver(fillNames).observe(document.documentElement, { childList: true, subtree: true });
  (async () => {
    try { const j = await (await real(API, { credentials: 'same-origin' })).json(); config = { ...j.config, catalog: j.catalog, dailyCap: j.dailyCap }; account = j.account; } catch { config = { enabled: false }; }
    renderChip();
  })();
  document.addEventListener('click', (e) => { if (tray && !e.composedPath().some((n) => n.matches?.('.pf-tray, #pf-dock'))) closeTray(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeTray(); close(); } });
})();




