// Shared client for every game: Google / Apple sign-in, the account and WP wallet, the shop (avatars, borders, accessories,
// consumables), reactions and gifts, and the sound controls. It watches the game's own server replies, so each game
// only needs to load this one script.
(() => {
  'use strict';
  const API = '/api/platform';
  const GAME_API = /^\/api\/(bridge|hot-joker|grand-con)$/;
  const PAGE = { '/bridge.html': 'bridge', '/hot-joker.html': 'hot-joker', '/grand-con.html': 'grand-con', '/last-train.html': 'last-train', '/reckoning.html':'reckoning' }[location.pathname] || 'arcade';
  const OWN_TABLE_UI = PAGE === 'reckoning' || PAGE === 'last-train';   // these two already draw their own reactions, shop and gifts

  const EMO = { laugh: '😂', wow: '😮', cry: '😢', cool: '😎', fire: '🔥', rip: '🪦', angry: '😠', think: '🤔', heart: '❤️', trophy: '🏆' };
  const TAG = { gg: 'GG', ez: 'EZ', gl: 'GL', wp: 'WP', oof: 'OOF', faster: 'FASTER LEH', aiyo: 'AIYO!', steady: 'STEADY' };
  const CLIPS = new Set(['gg', 'ez', 'gl', 'wp', 'oof', 'faster', 'aiyo', 'steady']);
  const KIND_NAME = { av: 'Avatars', bd: 'Borders', acc: 'Accessories', gift: 'Gifts' };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2');

  let accountSeat = false, roomClosed = false;
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
    const inner = window.AvatarArt.el(key, acc);
    return el('span', { class: 'pf-av' + (bd ? ' pf-bd pf-bd-' + bd : ''), style: `--s:${size}px;--ring-pad:${Math.min(10,Math.max(1.5,size*.075))}px`, 'aria-hidden': 'true' }, inner);
  }
  if (!window.EmoteArt) { const s = document.createElement('script'); s.src = '/emote-art.js'; document.head.append(s); }
  const emoteArt = (k) => (window.EmoteArt?.has(k) ? window.EmoteArt.el(k, 36) : TAG[k] ? el('b', { class: 'pf-tag', text: TAG[k] }) : el('span', { class: 'pf-emo', text: EMO[k] || '🙂' }));
  function toast(text, icon) {
    let lane = document.getElementById('pf-toasts'); if (!lane) { lane = el('div', { id: 'pf-toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(lane); }
    while (lane.children.length > 3) lane.firstChild.remove();
    const t = el('div', { class: 'pf-toast' }, icon || null, el('span', { text })); lane.append(t); setTimeout(() => t.remove(), 4200);
  }
  const wallet = () => (st?.social ? st.social.wallet : account ? { pts: account.pts, owned: account.owned, gifts: account.gifts, eq: account.eq, account: true } : null);
  const catalog = () => st?.social?.prices || config?.catalog;

  // ---------- sign-in ----------
  let overlay = null, pageLock = null, returnFocus = null;
  function lockPage() {
    if(pageLock)return;
    const props=['position','top','left','right','width'];
    pageLock={x:scrollX,y:scrollY,styles:props.map(k=>[k,document.body.style.getPropertyValue(k),document.body.style.getPropertyPriority(k)])};
    returnFocus=document.activeElement;
    Object.assign(document.body.style,{position:'fixed',top:-pageLock.y+'px',left:'0',right:'0',width:'100%'});
    document.body.classList.add('pf-lock');document.documentElement.classList.add('pf-page-lock');
  }
  function close() {
    overlay?.remove();overlay=null;
    if(pageLock){
      const saved=pageLock;pageLock=null;
      saved.styles.forEach(([k,value,priority])=>value?document.body.style.setProperty(k,value,priority):document.body.style.removeProperty(k));
      document.body.classList.remove('pf-lock');document.documentElement.classList.remove('pf-page-lock');
      window.scrollTo({left:saved.x,top:saved.y,behavior:'instant'});
      if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});returnFocus=null;
    }
  }
  function dismissModal() {
    if(overlay?.dataset.pending)return;
    if(overlay?.onDismiss)overlay.onDismiss();else close();
  }
  function modal(title, ...body) {
    // Replacing a popup keeps the original page position locked throughout.
    lockPage();overlay?.remove();
    overlay = el('div', { class: 'pf-ov', onclick: (e) => { if (e.target === overlay) dismissModal(); } }, el('div', { class: 'pf-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': title,tabindex:-1 },
      el('div', { class: 'pf-head' }, el('h2', { text: title }), el('button', { type: 'button', class: 'pf-x', 'aria-label': 'Close', onclick: dismissModal, text: '✕' })), ...body));
    document.body.append(overlay);overlay.querySelector('.pf-box').focus({preventScroll:true});return overlay;
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
  const relink = async () => { if (seat && st?.social) { try { await roomAct('relink'); } catch {} renderChip(); } };
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
    const name = el('b', {class:'pf-name',text:account.nick || 'Player'});
    const nick = el('input', {type:'text',maxlength:12,value:account.nick || '',placeholder:'Pick a nickname','aria-label':'Nickname',onkeydown:e=>{if(e.key==='Escape'){e.stopPropagation();cancelEdit();}}});
    const cancelEdit = () => { editor.hidden=true; nameRow.hidden=false; edit.focus(); };
    const edit = el('button', {type:'button',class:'pf-edit','aria-label':'Edit Nickname',text:'Edit',onclick:()=>{nick.value=account.nick || '';nameRow.hidden=true;editor.hidden=false;nick.focus();nick.select();}});
    const nameRow = el('div',{class:'pf-name-row'},name,edit);
    const save = el('button',{type:'submit',class:'pf-small',text:'Save'});
    const editor = el('form',{class:'pf-name-editor',hidden:true,onsubmit:async e=>{
      e.preventDefault();if(save.disabled)return;save.disabled=true;
      try {account=(await api({action:'nick',nick:nick.value})).account;name.textContent=account.nick || 'Player';renderChip();cancelEdit();toast('Nickname saved.','✅');}
      catch(error){toast(error.message,'⚠️');}finally{save.disabled=false;}
    }},nick,el('div',{class:'pf-row'},save,el('button',{type:'button',class:'pf-ghost',text:'Cancel',onclick:cancelEdit})));
    const count = (o) => Object.values(o).reduce((n, v) => n + v.length, 0);
    const gifts = Object.values(account.gifts || {}).reduce((n, v) => n + Math.max(0, v), 0);
    const cap = config.dailyCap || 400, got = Math.min(cap, account.earnedToday || 0);
    const toggle = (label, hint, on, fn) => el('label', { class: 'pf-switch' }, el('span', {}, el('b', { text: label }), el('small', { text: hint })), el('input', { type: 'checkbox', checked: on ? true : undefined, onchange: (e) => fn(e.target.checked) }));
    const provider = account.provider === 'apple' ? ' Apple' : 'Google';
    modal('Your account',
      el('section', { class: 'pf-hero' }, avatar(eq.av || 'cat', eq.bd, eq.acc, 84),
        el('div', { class: 'pf-who' }, nameRow, el('small', { text: 'Signed in with ' + provider })), editor),
      el('section', { class: 'pf-wpcard' }, el('div', {}, el('small', { text: 'YOUR WP' }), el('b', { class: 'pf-big', text: '🏆 ' + account.pts.toLocaleString() })),
        el('div', { class: 'pf-meter', role: 'img', 'aria-label': got + ' of ' + cap + ' WP earned today' }, el('i', { style: 'width:' + Math.round(got / cap * 100) + '%' }), el('small', { text: 'Earned today ' + got + ' / ' + cap }))),
      el('div', { class: 'pf-stats' },
        el('div', {}, el('b', { text: String(count({ a: account.owned.av }) + 20) }), el('small', { text: 'Avatars' })),
        el('div', {}, el('b', { text: String(account.owned.bd.length) }), el('small', { text: 'Borders' })),
        el('div', {}, el('b', { text: String(account.owned.acc.length) }), el('small', { text: 'Accessories' })),
        el('div', {}, el('b', { text: gifts > 9999 ? '9999+' : String(gifts) }), el('small', { text: 'Gifts' }))),
      el('div', { class: 'pf-cta' }, el('button', { type: 'button', class:'pf-customise', onclick: () => openShop() }, window.AvatarArt.tool('shop'), 'Customise Avatar')),
      el('p', { class: 'pf-note', text: 'Win games with other people to earn WP. Use them in the shop in any game.' }),
      a ? el('section', { class: 'pf-card' }, el('h3', { text: 'Sound' }),
        toggle('Sound effects', 'Taps, cards and reactions', prefs.sfx, (v) => a.setSfx(v)),
        a.game ? toggle('Background music', a.themeName() + ' theme', prefs.music, (v) => a.setMusic(v)) : null) : null,
      el('details', { class: 'pf-card pf-privacy' }, el('summary', {}, el('span',{text:'Privacy & Data'})),
        el('div',{class:'pf-privacy-content'},
        el('p', { class: 'pf-note', text: 'We keep your nickname, WP, items and consent record. No name, email or photo from ' + provider.trim() + '.' }),
        el('div', { class: 'pf-privacy-actions' },
          el('button', { type: 'button', class: 'pf-ghost', text: 'Download My Data', onclick: run(async () => {
            const j = await api({ action: 'export' }), url = URL.createObjectURL(new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' }));
            el('a', { href: url, download: 'krankspwns-my-data.json' }).click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
          }) }),
          el('button', { type: 'button', class: 'pf-danger', text: 'Delete My Account', 'data-account-action':'delete', onclick: () => confirmAccountAction('delete') })),
        el('p', { class: 'pf-fine' }, el('a', { href: '/privacy.html', target: '_blank', rel: 'noopener', text: 'Privacy Notice' }), ' · consent version ', account.consent?.version || ''))),
      el('div', { class: 'pf-row wrap pf-signout' },
        el('button', { type: 'button', class: 'pf-ghost', text: 'Sign out', 'data-account-action':'logout', onclick:()=>confirmAccountAction('logout') }),
        el('button', { type: 'button', class: 'pf-ghost', text: 'Sign out everywhere', 'data-account-action':'logoutAll', onclick:()=>confirmAccountAction('logoutAll') })));
  }

  function confirmAccountAction(action) {
    const deleting=action==='delete', everywhere=action==='logoutAll';
    const title=deleting?'Delete your account?':everywhere?'Sign out everywhere?':'Sign out?';
    const label=deleting?'Delete My Account':everywhere?'Sign out everywhere':'Sign out';
    const previousScroll=overlay?.querySelector('.pf-box').scrollTop || 0, privacyOpen=!!overlay?.querySelector('.pf-privacy')?.open;
    const cancel=()=>{
      openAccount();const box=overlay.querySelector('.pf-box');box.querySelector('.pf-privacy').open=privacyOpen;
      box.scrollTop=previousScroll;box.querySelector('[data-account-action="'+action+'"]').focus({preventScroll:true});
    };
    let pending=false;
    const error=el('p',{class:'pf-confirm-error',role:'alert',hidden:true});
    const input=deleting?el('input',{id:'pf-delete-confirm',type:'text',autocomplete:'off',autocapitalize:'off',spellcheck:'false','aria-label':'Type DELETE to confirm',placeholder:'DELETE',oninput:e=>{submit.disabled=e.target.value!=='DELETE';}}):null;
    const submit=el('button',{type:'submit',class:'pf-confirm-go'+(deleting?' pf-danger':''),text:label,disabled:deleting || undefined});
    const back=el('button',{type:'button',class:'pf-ghost',text:'Cancel',onclick:cancel});
    const form=el('form',{class:'pf-account-confirm',onsubmit:async e=>{
      e.preventDefault();if(pending || deleting && input.value!=='DELETE')return;
      pending=true;ov.dataset.pending='1';submit.disabled=true;back.disabled=true;if(input)input.disabled=true;error.hidden=true;
      try {
        await api({action,...(deleting?{confirm:'DELETE'}:{})});account=null;close();renderChip();
        if(!deleting)await relink();
        toast(deleting?'Your account and data were deleted.':everywhere?'Signed out on every device.':'Signed out.',deleting?'🗑️':'👋');
      } catch(e) {
        pending=false;delete ov.dataset.pending;submit.disabled=deleting && input.value!=='DELETE';back.disabled=false;if(input)input.disabled=false;
        error.textContent=e.message;error.hidden=false;
      }
    }},el('p',{class:'pf-note',text:deleting?'This permanently deletes your account, WP and items. Type DELETE to confirm.':everywhere?'This signs you out on every device. Your account, WP and items will stay saved.':'Sign out on this device? Your account, WP and items will stay saved.'}),
      deleting?el('label',{for:'pf-delete-confirm',text:'Type DELETE to confirm'}):null,input,error,el('div',{class:'pf-row'},back,submit));
    const ov=modal(title,form);ov.onDismiss=cancel;back.focus({preventScroll:true});
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
      for (const k of c.avatars || window.AvatarArt.free) items.push(card(avatar(k, eq.bd, '', 48), cap(k), 'Free', el('button', { type: 'button', disabled: eq.av === k || undefined, onclick: () => shopAct('equip', { kind: 'av', key: k }), text: eq.av === k ? 'In use' : 'Use' })));
      for (const [k, price] of Object.entries(c.av).sort((x, y) => x[1] - y[1])) { const own = w.owned.av.includes(k);
        items.push(card(avatar(k, eq.bd, '', 48), cap(k), own ? 'Owned' : price + ' WP', own ? el('button', { type: 'button', disabled: eq.av === k || undefined, onclick: () => shopAct('equip', { kind: 'av', key: k }), text: eq.av === k ? 'In use' : 'Use' }) : el('button', { type: 'button', disabled: w.pts < price || undefined, onclick: () => shopAct('buy', { kind: 'av', key: k }), text: 'Buy · ' + price }))); }
    } else if (shopTab === 'bd' || shopTab === 'acc') {
      const kind = shopTab, cur = eq[kind];
      for (const [k, price] of Object.entries(c[kind]).sort((x, y) => x[1] - y[1])) { const own = w.owned[kind].includes(k);
        const pre = kind === 'bd' ? avatar(eq.av || 'cat', k, eq.acc, 48) : avatar(eq.av || 'cat', eq.bd, k, 48);
        items.push(card(pre, cap(k), own ? (cur === k ? 'Wearing' : 'Owned') : price + ' WP', own ? el('button', { type: 'button', class: 'pf-ghost', onclick: () => shopAct('equip', { kind, key: cur === k ? '' : k }), text: cur === k ? 'Take off' : 'Wear' }) : el('button', { type: 'button', disabled: w.pts < price || undefined, onclick: () => shopAct('buy', { kind, key: k }), text: 'Buy · ' + price }))); }
    } else {
      for (const [k, price] of Object.entries(c.gift).sort((x, y) => x[1] - y[1])) { const left = w.gifts[k] || 0;
        items.push(card(window.AvatarArt.gift(k,48), cap(k), left ? `${left} left` : `Pack of ${c.uses}`, el('button', { type: 'button', disabled: w.pts < price || undefined, onclick: () => shopAct('buy', { kind: 'gift', key: k }), text: 'Buy · ' + price }))); }
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
      else tray.append(...mine.map(([k, n]) => el('button', { type: 'button', role: 'menuitem', 'aria-label':cap(k), onclick: () => pickTarget(k) }, window.AvatarArt.gift(k,40), el('small', { text: '×' + n }))));
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
  function openProfile() {
    closeTray();
    if (account) return openAccount();
    const w = wallet(), eq = st?.social?.cos[st.meId] || w?.eq || {}, me = st?.players.find(p=>p.id===st.meId);
    modal('Your Profile',
      el('section', {class:'pf-hero'}, avatar(eq.av || 'cat', eq.bd, eq.acc, 72),
        el('div', {class:'pf-who'}, el('b', {class:'pf-name',text:me?.name || 'Guest'}), el('small',{text:'Guest Profile'}))),
      el('p', {class:'pf-wp'}, 'Your WP: ', el('b',{text:(w?.pts || 0).toLocaleString()})),
      el('p', {class:'pf-note',text:'Guest WP and items belong to this room. Sign in to keep your collection across games.'}),
      el('button', {type:'button',onclick:()=>openShop(),disabled:!w || undefined,text:'Open Shop'}),
      el('button', {type:'button',class:'pf-ghost',onclick:openLogin,text:'Sign In with Google or Apple'}));
  }
  // Row's room code + Invite dropdown, shared by the table games and Grand Con.
  let activeInvite=null, qrLoading=null;
  function closeInvite() {
    if(!activeInvite)return;
    activeInvite.menu.hidden=true;activeInvite.button.setAttribute('aria-expanded','false');activeInvite=null;
  }
  document.addEventListener('click',e=>{if(activeInvite && !activeInvite.wrap.contains(e.target))closeInvite();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && activeInvite){const b=activeInvite.button;closeInvite();b.focus();}});
  async function copyRoomText(value) {
    try {await navigator.clipboard.writeText(value);toast('Copied!');closeInvite();}
    catch {modal('Copy Link',el('input',{readOnly:true,value,'aria-label':'Copy Link',onclick:e=>e.target.select()}));}
  }
  async function roomQR(code,link) {
    closeInvite();
    const image=el('div',{class:'pf-room-qr',role:'status',text:'Loading…'});
    const ov=modal('Scan to join',image,el('b',{class:'pf-qr-code','data-no-tr':'',text:code}),el('p',{class:'pf-note',text:'Point a phone camera at the code to open the room.'}),el('button',{type:'button',text:'Copy Invite Link',onclick:()=>copyRoomText(link)}));
    try {
      if(!window.qrcode)await (qrLoading ||= new Promise((resolve,reject)=>{
        const s=el('script',{src:'/qrcode.js'});s.onload=resolve;s.onerror=()=>{s.remove();qrLoading=null;reject(Error('QR code could not load.'));};document.head.append(s);
      }));
      if(overlay!==ov)return;
      const q=window.qrcode(0,'M');q.addData(link);q.make();const n=q.getModuleCount(),margin=4;
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 '+(n+margin*2)+' '+(n+margin*2));svg.setAttribute('shape-rendering','crispEdges');svg.setAttribute('role','img');svg.setAttribute('aria-label','QR Code');
      let path='';for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.isDark(y,x))path+='M'+(x+margin)+' '+(y+margin)+'h1v1h-1z';
      svg.innerHTML='<rect width="100%" height="100%" fill="white"/><path fill="#14182b" d="'+path+'"/>';image.replaceChildren(svg);
    } catch(e) {if(overlay===ov)image.textContent=e.message;}
  }
  function roomBar({code,page,phase,onLeave,onRecovery,body=[],count}) {
    const link=location.origin+page+'?room='+code;
    const icon=k=>['link','copy','qr','users'].includes(k)?window.AvatarArt.tool(k):window.AvatarArt.icon(k,16);
    const menu=el('div',{class:'pf-invite-menu',role:'menu',hidden:true});
    const item=(label,key,fn)=>el('button',{type:'button',role:'menuitem',onclick:fn},icon(key),label);
    menu.append(item('Copy Room Code','copy',()=>copyRoomText(code)),item('Copy Invite Link','link',()=>copyRoomText(link)),item('QR Code','qr',()=>roomQR(code,link)));
    if(onRecovery)menu.append(guestOnly(item('Rejoin Code','lock',()=>{closeInvite();onRecovery();}),true));
    const wrap=el('span',{class:'pf-invite-wrap'});
    const invite=el('button',{type:'button',class:'pf-room-action pf-room-invite','aria-haspopup':'menu','aria-expanded':'false',onclick:()=>{
      const open=menu.hidden;closeInvite();if(open){menu.hidden=false;invite.setAttribute('aria-expanded','true');activeInvite={menu,button:invite,wrap};}
    },onkeydown:e=>{if(e.key==='ArrowDown'){e.preventDefault();menu.hidden=false;invite.setAttribute('aria-expanded','true');activeInvite={menu,button:invite,wrap};menu.querySelector('button').focus();}}},icon('link'),'Invite',window.AvatarArt.icon('caret',11));
    wrap.append(invite,menu);
    const players=el('button',{type:'button',class:'pf-room-action pf-room-players',onclick:()=>{closeInvite();modal('Players',...playerRows());}},icon('users'),'Players');
    const leave=el('button',{type:'button',class:'pf-room-action pf-room-leave',onclick:onLeave},'Leave Room');
    const label=el('div',{class:'pf-room-label',text:'Room Code'});
    const roomCode=el('div',{class:'room-code '+(phase==='lobby'?'large-code pf-lobby-code':'pf-game-code'),'data-no-tr':'',text:code});
    return el('section',{class:'pf-room-bar'+(phase==='lobby'?' pf-room-waiting':''),'aria-label':'Room'},
      ...(phase==='lobby'?[label,roomCode,el('div',{class:'pf-room-actions'},wrap,players),count?el('div',{class:'pf-room-count',text:count}):null,...body,el('div',{class:'pf-room-footer'},leave)]
        :[el('div',{class:'pf-room-identity'},label,roomCode),el('div',{class:'pf-room-actions'},players,wrap,leave)]));
  }
  function roomSeats({players,max,meId,hostId,avatar,status}) {
    return el('div',{class:'pf-room-seats'},...Array.from({length:Math.max(max,players.length)},(_,i)=>{
      const p=players[i];
      if(!p)return el('div',{class:'pf-room-seat empty'},el('span',{class:'pf-seat-avatar pf-empty-avatar','aria-hidden':'true',text:'+'}),el('div',{class:'pf-seat-name',text:'Waiting…'}));
      const face=avatar(p.id);face.classList.add('pf-seat-avatar');
      return el('div',{class:'pf-room-seat seat'+(p.id===meId?' me mine':'')+(p.bot?' seat-bot':'')+(p.departed?' seat-away':'')},face,
        el('div',{class:'pf-seat-name seat-name',title:p.name,'data-no-tr':''},el('b',{text:p.name+(p.id===meId?' · You':'')})),
        el('small',{class:'pf-seat-tag',text:p.departed?'AWAY':p.bot?['BOT',status?.(p)].filter(Boolean).join(' · '):status?.(p)||(p.id===hostId?'HOST':'JOINED')}));
    }));
  }

  function headerNav({page,title,art}) {
    const arrow=el('span',{'aria-hidden':'true',class:'header-back-art'});
    arrow.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 6-6 6 6 6M6 12h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return el('nav',{class:'header-nav','aria-label':'Game Navigation'},
      el('a',{href:'/?games=1',class:'header-back','aria-label':'All games',title:'All games'},arrow),
      el('a',{href:page,class:'header-brand'},el('span',{class:'header-brand-art','aria-hidden':'true'},art),
        el('span',{class:'header-brand-copy'},el('small',{text:'THE GAME ROOM'}),el('b',{text:title.toUpperCase()}))));
  }
  function settingsButton() {
    return el('button',{type:'button',class:'pf-settings-btn','aria-label':'Settings',title:'Settings',onclick:openSettings},window.AvatarArt.tool('settings'));
  }
  function dealOptions(value,disabled,onChange) {
    return el('div',{class:'pf-deal-options'},...[2,4,6,8].map(n=>el('button',{type:'button',class:'pf-deal-choice','aria-label':n+' deals','aria-pressed':String(n===value),disabled:disabled || undefined,onclick:()=>onChange(n)},String(n))));
  }
  function openSettings() {
    const a=window.GameAudio, prefs=a?.prefs() || {};
    const toggle=(label,on,change)=>el('label',{class:'pf-switch'},el('b',{text:label}),el('input',{type:'checkbox',checked:on || undefined,onchange:e=>change(e.target.checked)}));
    const content=[];
    if(a) content.push(el('section',{class:'pf-card'},el('h3',{text:'Sound'}),toggle('Sound effects',prefs.sfx,v=>a.setSfx(v)),toggle('Background music',prefs.music,v=>a.setMusic(v))));
    const rules={bridge:['Number of Deals','deals',[[2,'2 deals'],[4,'4 deals'],[6,'6 deals'],[8,'8 deals']]],'hot-joker':['Turn Timer','turnSeconds',[[20,'20 sec'],[40,'40 sec'],[60,'60 sec']]],'grand-con':['Time to talk','discussionSeconds',[[0,'Auto'],[60,'60 sec'],[90,'90 sec'],[120,'120 sec']]]}[PAGE];
    if(st && seat && rules) {
      const [label,key,choices]=rules, editable=st.hostId===st.meId && ['lobby','finished'].includes(st.phase);
      const current=key==='deals'?st.deals:st.settings?.[key] ?? 0;
      const choose=async value=>{
        group.querySelectorAll('button').forEach(b=>b.disabled=true);
        try {await roomAct('settings',{[key]:value});openSettings();} catch(e) {toast(e.message,'⚠️');group.querySelectorAll('button').forEach(b=>b.disabled=!editable);}
      };
      const group=PAGE==='bridge'?dealOptions(current,!editable,choose):el('div',{class:'pf-settings-options'},...choices.map(([value,text])=>el('button',{type:'button',text,'aria-pressed':String(value===current),disabled:!editable || undefined,onclick:()=>choose(value)})));
      content.push(el('section',{class:'pf-card'},el('h3',{text:label}),group));
    }
    modal('Settings',...content);
  }
  function shopButton(options = {}) {
    const w = wallet(), points = options.points ?? w?.pts;
    const b = el('button', {type:'button',class:'pf-header-shop', 'aria-label':points == null ? 'Shop' : 'Shop · '+points+' WP', title:points == null ? 'Shop' : 'Shop · '+points+' WP', onclick:options.open || (()=>{closeTray();openShop();})}, window.AvatarArt.tool('shop'));
    if (options.open) b.dataset.nativeWallet = '1';
    if (points != null) b.append(el('b',{class:'pf-shop-wp','data-no-tr':'',text:points >= 10000 ? Math.round(points / 1000)+'k' : String(points)}));
    return b;
  }
  function refreshHeaderShop() {
    // Native Row and Last Train keep their own room-wallet updates.
    document.querySelectorAll('.pf-header-shop:not([data-native-wallet])').forEach(b=>b.replaceWith(shopButton()));
  }
  function clearRoom() {
    roomClosed=true;
    if(!seat && !st)return;
    seat=null;st=null;accountSeat=false;seenFeed=null;seenAward=null;closeTray();renderChip();
  }
  function renderDock() {
    const inRoom = !!(st?.social && seat), w = wallet();
    const hasOtherPlayers = inRoom && st.players.some(p=>!p.bot && !p.departed && p.id!==st.meId);
    refreshHeaderShop();
    if (!inRoom || (!hasOtherPlayers && tray?.dataset.kind==='players')) closeTray();
    const btn = (label, art, fn, extra={}) => el('button', { type:'button', class:'pf-tool', 'aria-label':label, title:label, onclick:fn, ...extra }, art);
    const tools = inRoom && !OWN_TABLE_UI ? [
      btn('Reactions', window.EmoteArt.el('laugh',32), ()=>openTray('emote')),
      ...(hasOtherPlayers ? [
        btn('Throw a Gift',window.AvatarArt.tool('gift'),()=>openTray('gift')),
        btn('Players',window.AvatarArt.tool('players'),()=>openTray('players')),
      ] : []),
    ] : [];
    const eq = account?.eq || st?.social?.cos[st.meId] || w?.eq;
    const profileArt = eq?.av ? avatar(eq.av,eq.bd,eq.acc,32) : window.AvatarArt.tool('profile');
    const next = el('div', { id:'pf-dock', role:'toolbar', 'aria-label':'Player Tools' }, ...tools,
      ...(PAGE === 'arcade' ? [btn('Shop',window.AvatarArt.tool('shop'),()=>{closeTray();openShop();},{disabled:!w || undefined,title:w?'Shop · '+w.pts.toLocaleString()+' WP':'Join a room or sign in to use the shop'})] : []),
      btn('Profile',profileArt,openProfile,{title:account?.nick || 'Your Profile'}));
    document.body.classList.toggle('pf-native-tools',OWN_TABLE_UI);
    document.body.classList.add('pf-floating-tools');
    dock ? dock.replaceWith(next) : document.body.append(next); dock=next;
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
    if (window.GameAudio && window.GameAudio.prefs().sfx && CLIPS.has(item.k)) { try { const a = clip(item.k).cloneNode(); a.volume = 0.8; a.play().catch(() => sfx('pop')); } catch { sfx('pop'); } } else sfx(CLIPS.has(item.k) ? 'pop' : 'emo_' + item.k);
  }
  function flyGift(item) {
    if (document.hidden) return;
    const from = st.players.find((q) => q.id === item.id), to = st.players.find((q) => q.id === item.to);
    const f = el('div', { class: 'pf-fly' }, window.AvatarArt.gift(item.k,72), el('small', { text: `${from?.name || '?'} → ${to?.name || '?'}` }));
    document.body.append(f); setTimeout(() => f.remove(), 2200); sfx('whoosh'); if (item.to === st.meId) setTimeout(() => sfx('bad'), 500);
  }
  // game reply -> platform state
  const PHASE_SFX = { playing: 'deal', bidding: 'deal', forging: 'deal', discussion: 'turn', voting: 'turn', reveal: 'reveal', finished: 'win' };
  function observe(url, init, j) {
    if (!j || !j.social || !j.meId || !j.code) return;
    let body = {}; try { body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}; } catch {}
    if(roomClosed && !['create','join'].includes(body.action))return;
    roomClosed=false;
    if (body.action === 'leave') { seat = null; st = null; seenFeed = null; renderDock(); return; }
    const path = new URL(url, location.href).pathname, hdr = init?.headers?.['x-tok'] || (init?.headers instanceof Headers ? init.headers.get('x-tok') : '');
    const tok = j.tok || body.tok || hdr || (seat && seat.code === j.code && seat.pid === j.meId ? seat.tok : '');
    if (!tok) return;
    const prev = st; seat = { api: path, code: j.code, pid: j.meId, tok };
    if (prev && prev.code !== j.code) { seenFeed = null; seenAward = null; }
    st = j; accountSeat = !!j.social.wallet.account; updateRecoveryVisibility(); warmClips();
    if (account && j.social.wallet.account) { const w = j.social.wallet; Object.assign(account, { pts: w.pts, owned: w.owned, gifts: w.gifts, eq: w.eq }); }
    const feed = j.social.feed || [];
    if (seenFeed === null) seenFeed = j.social.n; else {
      for (const it of feed) if (it.n > seenFeed && !isEcho(it)) { if (it.t === 'e') floatEmote(it); else if (it.t === 'g') flyGift(it); }
      seenFeed = Math.max(seenFeed, j.social.n);
    }
    const aw = j.social.awards;
    if (aw && seenAward !== aw.match) { if (seenAward !== null || prev) { const n = aw.wp[j.meId]; if (n) { toast(`+${n} WP${j.social.wallet.account ? ' added to your account' : ' (guest: kept for this room only)'}`, '🏆'); sfx('win'); } else if (aw.note === 'solo') toast('No WP for games with bots only. Play with another person to earn WP.', 'ℹ️'); } seenAward = aw.match; }
    if (prev && prev.phase !== j.phase && PHASE_SFX[j.phase] && window.GameAudio?.game) sfx(PHASE_SFX[j.phase]);
    if (!prev || prev.social.wallet.pts !== j.social.wallet.pts || prev.social.n !== j.social.n || prev.meId !== j.meId || prev.players.filter(p=>!p.bot && !p.departed).length !== j.players.filter(p=>!p.bot && !p.departed).length) { renderChip(); }
  }
  window.fetch = async function (input, init) {
    const res = await real(input, init);
    try { const u = new URL(typeof input === 'string' ? input : input.url, location.href); if (u.origin === location.origin && (GAME_API.test(u.pathname) || /^\/api\/(game|last-train)$/.test(u.pathname))) res.clone().json().then(j=>{
      if(GAME_API.test(u.pathname)) observe(u.href,init,j);
      else if(j.meId && (j.wallet || j.me?.wallet)) {accountSeat=!!(j.wallet || j.me.wallet).account;updateRecoveryVisibility();}
    }).catch(()=>{}); } catch {}
    return res;
  };

  // Keep this entry point for wallet/sign-in updates; there is no second chip.
  function updateRecoveryVisibility() {
    document.body.classList.toggle('pf-signed-in',!!account);
    document.body.classList.toggle('pf-account-seat',accountSeat);
  }
  function guestOnly(node, room = false) {node.dataset.guestOnly = room ? 'room' : 'landing';return node;}
  const needsRecovery = () => !account || !accountSeat;
  function renderChip() { updateRecoveryVisibility(); document.getElementById('pf-chip')?.remove(); renderDock(); }
  window.Platform = { openLogin, openShop, shopButton, settingsButton, headerNav, dealOptions, roomBar, roomSeats, clearRoom, guestOnly, needsRecovery, account: () => account, avatar, toast };
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
  document.addEventListener('keydown', (e) => {
    if(e.key==='Escape') {closeTray();if(overlay){e.preventDefault();e.stopImmediatePropagation();dismissModal();}}
    if(e.key==='Tab' && overlay) {
      const controls=[...overlay.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex="0"]')].filter(n=>!n.disabled && n.getClientRects().length);
      const first=controls[0],last=controls.at(-1);if(!first)return;
      if(e.shiftKey && (document.activeElement===first || !controls.includes(document.activeElement))){e.preventDefault();last.focus();}
      else if(!e.shiftKey && (document.activeElement===last || !controls.includes(document.activeElement))){e.preventDefault();first.focus();}
    }
  });
})();




