(() => {
  'use strict';
  const root = document.getElementById('lt-app');
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const save = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const lastGame = () => { try { localStorage.setItem('arcade-last-game', 'last-train'); } catch {} };
  const invitation = new URLSearchParams(location.search).get('room')?.toUpperCase() || '';
  let goneStrikes = 0, seat = read('lt-seat'), state = null, busy = false, error = '', connected = true, timer, polling, pollFails = 0, connectionError = false;
  let name = read('lt-name') || '', code = invitation, recovery = '', showCard = false, sceneKey = '', enteredKey = '';
  let speechDraft = '', whisperDraft = '', draftStep = '';
  let dockNode = null, dockStamp = '', drawerGesture = null, suppressDrawerClick = false;
  let cinemaNode = null, cinemaKey = '', cinemaEnd = null;
  let boardingVideo = null, boardingVideoKey = '';
  const sfx = window.createTrainSfx();
  const soundtrack = window.createTrainSoundtrack(() => {
    if (boardingVideo?.muted && !state?.paused) { boardingVideo.muted = false; syncBoardingVideo(); }
  }, () => sfx.mode === 2);
  sfx.onMode(() => { soundtrack.refresh(); if (boardingVideo) boardingVideo.muted = sfx.mode === 0; render(); });
  let lastTick = '';
  let boardingExit = null, boardingExitTimer, privateResultKey = '', revoteNoticeKey = '';
  const voice = window.createTrainVoice({ request, onState: (data, owner) => { if (seat?.tok === owner.tok && seat.code === owner.code) { adopt(data); render(); } }, onChange: () => queueMicrotask(render), onAudio: active => soundtrack.setVoiceActive(active) });
  const overlayRoot = document.getElementById('lt-overlays');
  // Notes, Letters and Reactions sit together in one corner so they are always one tap away.
  const fabDock = document.createElement('div'); fabDock.className = 'lt-fabs'; overlayRoot.append(fabDock);
  // The carriage map is one tap away for everyone, all journey long.
  const mapFab = document.createElement('button'); mapFab.type = 'button'; mapFab.className = 'map-fab'; mapFab.hidden = true; mapFab.setAttribute('aria-label', 'Open carriage map'); mapFab.title = 'Carriage Map';
  mapFab.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="ltmapfab" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1c9"/><stop offset="1" stop-color="#e9c46f"/></linearGradient></defs><path d="M4 8.5 11 6l10 3 7-2.5v17L21 26l-10-3-7 2.5z" fill="url(#ltmapfab)" stroke="#7a4c14" stroke-width="1.2" stroke-linejoin="round"/><path d="M11 6v17M21 9v17" stroke="#7a4c14" stroke-width="1.1" opacity=".55"/><rect x="8" y="11.5" width="16" height="9" rx="4.5" fill="none" stroke="#a8323f" stroke-width="1.8"/><circle cx="12" cy="11.5" r="1.4" fill="#a8323f"/><circle cx="20" cy="20.5" r="1.4" fill="#a8323f"/></svg><span>Map</span>';
  mapFab.onclick = () => mapDialog(); fabDock.prepend(mapFab);
  const fromModule = (data, owner) => { if (seat?.tok === owner.tok && seat.code === owner.code) { adopt(data); render(); } };
  const notebook = window.createTrainNotebook(fabDock);
  const letters = window.createTrainLetters(fabDock, { request, onState: fromModule, sfx });
  const social = window.createTrainSocial({ dock: fabDock, request, onState: fromModule, sfx });
  const testPlayers = new URLSearchParams(location.search).get('test') === '1' ? window.createTrainTestPlayers(root) : null;
  const compactScene = matchMedia('(max-width: 680px)');
  // Phone preferences (like Row of Reckoning): colour scheme, text size, calm mode and vibration.
  const THEMES = [['navy', 'Orient Navy', '#1f3157', '#e9c46f'], ['plum', 'Midnight Plum', '#2b2350', '#f2ce86'], ['emerald', 'Emerald Sleeper', '#163d34', '#e9c46f'], ['oxblood', 'Oxblood', '#4a1426', '#f2d9a6'], ['smoke', 'Smoke & Brass', '#2a2d33', '#d9a441']];
  let ui = { theme: 'navy', text: 0, calm: false, haptics: true, ...(read('lt-ui') || {}) };
  const systemCalm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let motionOK = !systemCalm && !ui.calm;
  function applyUi() {
    const html = document.documentElement;
    if (ui.theme && ui.theme !== 'plum' && THEMES.some(t => t[0] === ui.theme)) html.dataset.ltTheme = ui.theme; else delete html.dataset.ltTheme;
    html.classList.toggle('lt-calm', !!ui.calm); html.style.setProperty('--lt-zoom', [1, 1.08, 1.16][ui.text] || 1);
    motionOK = !systemCalm && !ui.calm;
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = (THEMES.find(t => t[0] === ui.theme) || THEMES[0])[2];
  }
  const setUi = (key, value) => { ui = { ...ui, [key]: value }; save('lt-ui', ui); applyUi(); render(); };
  applyUi();
  // A soft click for every button press; buttons with their own sound play that on top.
  document.addEventListener('click', e => { const b = e.target.closest?.('button, summary, [role=switch]'); if (b && !b.disabled && b.closest('#lt-app, dialog, #lt-overlays, .lt-menu')) sfx.play('tap'); }, true);
  if (!seat?.tok || (invitation && invitation !== seat.code)) { seat = null; save('lt-seat', null); }
  if (seat) lastGame();
  const groupName = group => ({ passenger: 'Good · Passenger', crew: 'Good · Crew', saboteur: 'Bad · Saboteur' }[group] || 'Secret team');
  const role = key => state?.catalog?.[key] || { name: 'Secret role', icon: '🔒', description: '' };
  const who = id => state?.players.find(p => p.id === id)?.name || 'Nobody';
  const ROLE_ART = { passenger:0, careful:1, brave:2, witness:3, speaker:4, inspector:5, medic:6, trainee:7, saboteur:8, blocker:9, steward:10, forger:11 };
  // Crew roles without a painted portrait get a crest: their tool on a lamp-lit badge.
  const ROLE_CRESTS = {
    conductor: '<rect x="13" y="34" width="38" height="20" rx="3" fill="#fff1c9" stroke="#b8862c" stroke-width="2"/><path d="M19 40h16M19 46h10" stroke="#b8862c" stroke-width="2.4" stroke-linecap="round"/><circle cx="43" cy="44" r="4" fill="#1b1130"/><path d="M14 27c0-9 8-15 18-15s18 6 18 15z" fill="#22355f"/><path d="M10 27h44v5H10z" fill="#16233f"/><path d="M14 23h36" stroke="#e9c46f" stroke-width="3"/><circle cx="32" cy="18" r="3.4" fill="#e9c46f"/>',
    porter: '<path d="M32 6v6" stroke="#b8862c" stroke-width="3" stroke-linecap="round"/><path d="M24 12h16l-2 6H26z" fill="#e9c46f"/><rect x="21" y="18" width="22" height="30" rx="4" fill="#3a2a10" stroke="#e9c46f" stroke-width="2.4"/><rect x="25" y="22" width="14" height="22" rx="3" fill="#ffd56b"/><path d="M32 26c3 4 3 9 0 13-3-4-3-9 0-13z" fill="#fff8e0"/><path d="M19 48h26l-3 6H22z" fill="#e9c46f"/><circle cx="32" cy="34" r="16" fill="#ffd56b" opacity=".16"/>',
    guard: '<path d="M32 6l20 7v14c0 13-9 22-20 27C21 49 12 40 12 27V13z" fill="#22355f" stroke="#e9c46f" stroke-width="2.6"/><path d="M32 6v48C21 49 12 40 12 27V13z" fill="#2c4578"/><path d="M32 19l3.6 7.4 8 1.1-5.8 5.6 1.4 8L32 37.4l-7.2 3.7 1.4-8-5.8-5.6 8-1.1z" fill="#ffd56b"/>',
    framer: '<rect x="11" y="10" width="42" height="44" rx="3" fill="#5a2a1a" stroke="#e9c46f" stroke-width="3"/><rect x="17" y="16" width="30" height="32" rx="2" fill="#2a1420"/><circle cx="32" cy="27" r="6" fill="#c9b8a8"/><path d="M21 46c2-8 7-11 11-11s9 3 11 11z" fill="#c9b8a8"/><path d="M18 22l28 22M46 22 18 44" stroke="#ff5c6c" stroke-width="3.4" stroke-linecap="round"/>',
    silencer: '<circle cx="32" cy="32" r="20" fill="#f1d7c4"/><circle cx="25" cy="27" r="2.6" fill="#2a1420"/><circle cx="39" cy="27" r="2.6" fill="#2a1420"/><path d="M22 39h20" stroke="#2a1420" stroke-width="2.4" stroke-linecap="round"/><path d="M15 34l34 10M15 44l34-10" stroke="#b02a3f" stroke-width="6" stroke-linecap="round"/>',
    smuggler: '<path d="M12 24l20-10 20 10v22L32 56 12 46z" fill="#8a5a2c" stroke="#e9c46f" stroke-width="2"/><path d="M12 24l20 10 20-10M32 34v22" stroke="#e9c46f" stroke-width="2"/><path d="M20 20l20 10" stroke="#5a3a18" stroke-width="5"/><circle cx="46" cy="12" r="7" fill="#170f08" stroke="#c8bdff" stroke-width="2"/><path d="M43 12h6" stroke="#c8bdff" stroke-width="2" stroke-linecap="round"/>',
    stowaway: '<rect x="12" y="22" width="40" height="30" rx="5" fill="#7a4b1e" stroke="#e9c46f" stroke-width="2.4"/><path d="M24 22v-6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6" fill="none" stroke="#e9c46f" stroke-width="2.6"/><path d="M12 33h40" stroke="#5a3415" stroke-width="2.4"/><path d="M27 27q5-6 10 0v4H27z" fill="#170f08"/><circle cx="30" cy="30" r="1.4" fill="#ff5c6c"/><circle cx="34.5" cy="30" r="1.4" fill="#ff5c6c"/>',
    signalman: '<path d="M30 14h4v42h-4z" fill="#8b97b3"/><path d="M22 56h20" stroke="#8b97b3" stroke-width="4" stroke-linecap="round"/><rect x="21" y="8" width="22" height="30" rx="6" fill="#16233f" stroke="#e9c46f" stroke-width="2.2"/><circle cx="32" cy="17" r="5.5" fill="#ff5c6c"/><circle cx="32" cy="17" r="8.5" fill="#ff5c6c" opacity=".25"/><circle cx="32" cy="30" r="5.5" fill="#2f5f45"/><path d="M43 14l14-4v8z" fill="#e9c46f"/>',
  };
  let crestSerial = 0;
  function portrait(index, set, cls = '', label = '') {
    return el('span', { class: 'portrait portrait-' + set + ' ' + cls, style: '--px:' + ((index % 4) * 100 / 3) + '%;--py:' + (Math.floor(index / 4) * 50) + '%', 'aria-hidden': 'true', 'data-portrait-set': set, ...(label ? { 'data-role-art': label } : {}) });
  }
  function rolePortrait(key, cls = '') {
    if (ROLE_ART[key] !== undefined || !ROLE_CRESTS[key]) return portrait(ROLE_ART[key] ?? 0, 'roles', cls, key);
    const crest = el('span', { class: 'portrait role-crest crest-' + key + ' ' + cls, 'aria-hidden': 'true', 'data-role-art': key });
    crest.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true">' + ROLE_CRESTS[key] + '</svg>'; return crest;
  }
  // Saboteurs see their teammates marked in red everywhere (faces and names); nobody else sees it.
  const isAlly = id => !!id && id !== state?.meId && !!state?.me?.allies?.some(a => a.id === id);
  const allyCls = id => isAlly(id) ? ' ally-name' : '';
  function avatar(id, cls = '') {
    const p = typeof id === 'object' ? id : state?.players.find(p => p.id === id);
    const index = p?.avatarIndex ?? Math.max(0, (p?.seat || 1) - 1);
    const node = portrait(index, 'passengers', cls + (p?.frame ? ' has-frame bd-' + p.frame : '') + (isAlly(p?.id) ? ' is-ally' : ''));
    node.dataset.avatarIndex = index;
    return node;
  }
  function el(tag, props = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k in n && !k.startsWith('aria')) n[k] = v;
      else n.setAttribute(k, v);
    }
    for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) n.append(child);
    return n;
  }
  const txt = (tag, cls, value) => el(tag, { class: cls }, value);
  // The big Create button: an icon tile, a label with a short line under it, and an arrow.
  const CTA_ICONS = {
    create: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="3"/><path d="M12 9.5v5M9.5 12h5"/></svg>',
  };
  // One arrow drawing for every round arrow button, so it always sits in the exact centre of its circle.
  const ARROW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
  const arrowMark = cls => { const n = el('span', { class: cls, 'aria-hidden': 'true' }); n.innerHTML = ARROW_SVG; return n; };
  function ctaButton(label, sub, click, cls, icon) {
    const b = el('button', { type: 'button', class: 'cta ' + cls, disabled: busy, 'data-focus': label, 'aria-label': label, onclick: click }, el('span', { class: 'cta-icon', 'aria-hidden': 'true' }), el('span', { class: 'cta-text' }, txt('b', '', label), txt('small', '', sub)), el('span', { class: 'cta-arrow', 'aria-hidden': 'true' }));
    b.querySelector('.cta-icon').innerHTML = icon; b.querySelector('.cta-arrow').innerHTML = ARROW_SVG; return b;
  }
  const btn = (label, click, cls = '', disabled = false, key = label) => el('button', { type: 'button', class: cls, disabled: busy || disabled, 'data-focus': key, onclick: click }, label);
  const panel = (...children) => el('section', { class: 'panel' }, ...children);
  const train = cls => el('div', { class: 'train-art ' + (cls || ''), 'aria-hidden': 'true' }, el('img', { src: '/last-train/train-icon.webp', alt: '', width: 1254, height: 1254 }));
  const announce = text => document.getElementById('lt-announcer').textContent = text;
  async function request(action, extra = {}, owner = seat, context = state, { timeout: limit = 8000 } = {}) {
    const payload = { action, ...owner, ...extra, requestId: extra.requestId || crypto.randomUUID(), match: context?.match || 0, round: context?.round || 0, step: context?.step || 0 };
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), limit);
      try {
        const response = await fetch('/api/last-train', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw Object.assign(Error(data.error || 'Please try again.'), { status: response.status });
        return data;
      } catch (e) { if (attempt >= 1 || ['create', 'join', 'leave'].includes(action) || (e.status && e.status !== 503)) throw e; }
      finally { clearTimeout(timeout); }
    }
  }
  function adopt(data) {
    if (state && state.code === data.code && data.version < state.version) return;
    const changed = state?.step !== data.step;
    if (state && (state.code !== data.code || state.match !== data.match || state.step !== data.step)) document.querySelectorAll('dialog[data-turn]').forEach(d => d.close());
    if (state && (data.phase !== state.phase || data.nightRole !== state.nightRole || data.nightPhase !== state.nightPhase)) showCard = false;
    if (data.me.role && state && !state.me.role && data.phase === 'settling') showCard = true;
    const previous = state;
    state = { ...data, receivedAt: Date.now() };
    cue(previous, state);
    if (changed) announce(data.phase === 'night' ? (data.nightPhase ? 'Night phase ' + data.nightPhase + ' of 2. Everyone has 45 seconds.' : roleName(data.nightRole) + ' turn.') : data.phase === 'discussion' ? 'Speaking turn: ' + data.players.find(p => p.id === data.speakerId)?.name : ({ briefing: 'Meet the good and bad teams.', boarding: 'All aboard.', settling: 'Close your eyes. Your cabin is ready.', gathering: 'Meet in the lounge.', morning: 'Morning. See who is out.', revoteInfo: 'The vote is tied. A re-vote will begin shortly.', voting: data.voteAttempt === 2 ? 'The vote tied. Vote again between the tied players.' : 'Time to vote.', voteResult: 'The votes are in.', finished: 'The game has ended.' }[data.phase] || 'Room ready.'));
  }
  // Every phone hears the same cues at the same moments, so a sound never gives away a secret choice.
  function cue(prev, next) {
    if (!prev || prev.code !== next.code || prev.match !== next.match && next.phase !== 'briefing') return;
    const entered = prev.phase !== next.phase, latest = next.history.at(-1);
    if (entered) {
      if (next.phase === 'boarding') sfx.play('horn');
      else if (next.phase === 'settling' || next.phase === 'gathering') sfx.play('door');
      else if (next.phase === 'morning') { sfx.play('bell'); if (latest?.outs.length) setTimeout(() => sfx.play('sting'), 1100); }
      else if (next.phase === 'revoteInfo') sfx.play('tie');
      else if (next.phase === 'voteResult' && !latest?.outs.length) sfx.play('pop');
      else if (next.phase === 'finished') { const mine = next.players.find(p => p.id === next.meId); sfx.play((mine?.group === 'saboteur') === (next.winner === 'bad') ? 'good' : 'bad'); }
    } else if (next.phase === 'night' && prev.nightPhase !== next.nightPhase) sfx.play('creak');
    if (next.phase === 'discussion' && next.speakerId === next.meId && (entered || prev.speakerId !== next.speakerId)) sfx.play('chime');
  }
  function schedule() { clearTimeout(timer); if (seat) timer = setTimeout(poll, 1000); }
  function poll() {
    if (polling) return polling;
    const owner = seat; if (!owner) return Promise.resolve();
    polling = (async () => {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/last-train?code=' + owner.code + '&pid=' + owner.pid, { headers: { 'x-tok': owner.tok }, signal: controller.signal });
        const data = await response.json(); if (seat !== owner) return;
        if (!response.ok) {
          // One "room not found" or "ticket not recognised" can be a passing glitch. Only after several in a row
          // (about five seconds) does the phone let go of the room, and then it says why.
          if ([401, 404].includes(response.status)) {
            if (++goneStrikes < 5) { connected = false; connectionError = true; error = 'Reconnecting to your room…'; render(); return; }
            seat = null; state = null; save('lt-seat', null);
            throw Error(response.status === 404 ? 'That room has closed. Rooms close after 12 hours without play.' : 'This seat was opened on another phone. Rejoin with your name and private rejoin code.');
          }
          throw Error(data.error || 'Please try again.');
        }
        const changed = !state || state.version !== data.version || !connected || connectionError;
        pollFails = 0; goneStrikes = 0; if (connectionError) { error = ''; connectionError = false; }
        adopt(data); connected = true; if (changed) render(); else tick();
      } catch (e) {
        if (seat !== owner && seat) return;
        // Brief drops, slow replies and background tabs are normal on phones. Only warn after several misses in a row.
        const network = e.name === 'AbortError' || e instanceof TypeError;
        if (network) {
          if (!document.hidden) pollFails++;
          if (pollFails >= 3) { connected = false; connectionError = true; error = 'No connection. Trying again…'; render(); }
        } else { connected = false; error = e.message; render(); }
      }
      finally { clearTimeout(timeout); polling = null; if (seat === owner) schedule(); }
    })();
    return polling;
  }
  async function enter(action) {
    if (busy) return; busy = true; error = ''; render();
    try {
      const data = await request(action, { name: name.trim(), code: code.trim().toUpperCase(), recoveryCode: recovery.trim() }, null);
      seat = { code: data.code, pid: data.meId, tok: data.tok }; save('lt-seat', seat); save('lt-name', name.trim()); lastGame();
      showCard = false; adopt(data); connected = true; schedule();
    } catch (e) { error = e.name === 'AbortError' ? 'No reply. Check your internet and try again.' : e.message; }
    finally { busy = false; render(); }
  }
  async function send(action, extra = {}) {
    if (busy || !seat) return; const owner = seat; busy = true; error = ''; render();
    try {
      const data = await request(action, extra, owner); if (seat !== owner) return;
      if (action === 'leave') { seat = null; state = null; showCard = false; save('lt-seat', null); clearTimeout(timer); }
      else adopt(data);
      if (action === 'vote') sfx.play('punch');
      connected = true;
    } catch (e) { error = e.name === 'AbortError' ? 'Connection stopped. We are checking whether your choice was saved.' : e.message; await poll(); }
    finally { busy = false; render(); }
  }
  function dialog(title, ...children) {
    const opener = document.activeElement?.dataset.focus;
    const d = el('dialog', { class: 'lt-dialog' }, el('h2', { tabIndex: -1 }, title), ...children);
    const titleId = 'lt-dialog-title-' + crypto.randomUUID(); d.querySelector('h2').id = titleId; d.setAttribute('aria-labelledby', titleId);
    d.addEventListener('close', () => { d.remove(); [...document.querySelectorAll('[data-focus]')].find(n => n.dataset.focus === opener)?.focus({ preventScroll: true }); });
    document.body.append(d); d.showModal(); d.querySelector('h2').focus({ preventScroll: true }); d.scrollTop = 0; return d;
  }
  const roleName = key => key === 'saboteur' ? 'Saboteurs' : role(key).name;
  const player = id => state?.players.find(p => p.id === id);
  const fence = () => [state?.code, state?.match, state?.step].join(':');
  // How to play: short pages with an icon per idea, like Row of Reckoning's guide. Back / Next and dots move between them.
  const GUIDE_PAGES = [
    { title: 'One train. Two secret teams.', body: () => [
      el('div', { class: 'guide-tiles' }, ...[['📱', 'Own phone', '5–12 players, one phone each'], ['🎟️', 'Secret role', 'Only you see your ticket'], ['🌙', 'Nights and days', 'Secret moves, then talk']].map(([i, t, s]) => el('div', { class: 'guide-tile' }, txt('span', 'guide-emoji', i), txt('b', '', t), txt('small', '', s)))),
      el('div', { class: 'guide-teams' },
        el('div', { class: 'guide-team good' }, rolePortrait('passenger', 'guide-team-art'), el('div', {}, txt('span', 'guide-team-tag', 'GOOD TEAM'), txt('b', '', 'Passengers + Crew'), txt('p', '', 'Find every Saboteur. Keep at least one Passenger and one Crew member alive.'))),
        el('div', { class: 'guide-team bad' }, rolePortrait('saboteur', 'guide-team-art'), el('div', {}, txt('span', 'guide-team-tag', 'BAD TEAM'), txt('b', '', 'Saboteurs'), txt('p', '', 'Get all Passengers OR all Crew out. You know your teammates.')))),
      el('div', { class: 'guide-counts' }, txt('small', '', 'SABOTEURS ABOARD'), ...[['5', '1'], ['6–9', '2'], ['10–12', '3']].map(([n, b]) => el('div', { class: 'guide-count' }, txt('b', '', n), txt('span', '', 'players'), txt('i', '', '🗡️ × ' + b)))),
    ] },
    { title: 'How a journey goes', body: () => [
      el('ol', { class: 'guide-steps' }, ...[['🎟️', 'Board', 'Meet tonight’s roles and get your secret ticket. Seats are shuffled; your seat is your speaking order.'],
        ['🌙', 'Night', 'Two 45-second phases. Everyone with a power uses it at the same time, in secret.'],
        ['☀️', 'Morning', 'See who is out, and read your private reports.'],
        ['💬', 'Lounge', 'One at a time, in seat order, share what you know, or what you want them to believe.'],
        ['🗳️', 'Vote', 'Vote someone off the train, or Skip. Then the next night falls.']].map(([i, t, s]) => el('li', {}, txt('span', 'guide-step-icon', i), el('div', {}, txt('b', '', t), txt('p', '', s))))),
      txt('p', 'guide-note', '🔁 Repeat until one team wins.'),
    ] },
    { title: 'At night', body: () => [
      el('div', { class: 'guide-phases' },
        el('section', { class: 'guide-phase' }, txt('span', 'guide-phase-tag', 'PHASE 1 · MOVES'), ...[['🗡️', 'Saboteurs attack'], ['⛔', 'Blocker blocks a power'], ['🎭', 'Forger disguises a teammate'], ['🖼️', 'Framer frames a good traveller'], ['🤐', 'Silencer gags someone'], ['📦', 'Smuggler hides the attack walk'], ['🛡️', 'Brave protects'], ['🔒', 'Careful locks their door'], ['🏮', 'Night Porter watches a door'], ['💂', 'Guard stands by someone'], ['💊', 'Steward hands out a sleeping pill']].map(([i, t]) => el('div', { class: 'guide-row' }, txt('span', '', i), txt('p', '', t)))),
        el('section', { class: 'guide-phase two' }, txt('span', 'guide-phase-tag', 'PHASE 2 · RESPONSES'), ...[['🧪', 'Medic heals or poisons'], ['🔎', 'Inspector checks GOOD or BAD'], ['👁️', 'Witness watches or glimpses'], ['🎫', 'Conductor checks who walked'], ['🚦', 'Signalman may call a Signal Stop']].map(([i, t]) => el('div', { class: 'guide-row' }, txt('span', '', i), txt('p', '', t))))),
      el('div', { class: 'guide-list' }, ...[['🎯', 'Saboteurs agree on one target. A tie is random; no pick means no attack.'], ['👂', 'Good travellers can flip a coin to listen for footsteps at their door.'], ['📓', 'Everyone has a private notebook while the timer runs.']].map(([i, t]) => el('div', { class: 'guide-row' }, txt('span', '', i), txt('p', '', t)))),
    ] },
    { title: 'Talk and vote', body: () => [
      el('div', { class: 'guide-list' }, ...[['⏱️', 'Up to 45 seconds each, in seat order. The host can choose 15–45.'], ['💬', 'Chat Room: type or record one message. In Person: speak aloud.'], ['📌', 'Pin a suspect: everyone sees the count, never who pinned.'],
        ['🗳️', 'Most votes leaves the train. Skip is an abstention.'], ['⚖️', 'A tie gets one re-vote. Another tie is decided at random.'], ['🎭', 'The removed player’s team is revealed. Their role stays secret.']].map(([i, t]) => el('div', { class: 'guide-row' }, txt('span', '', i), txt('p', '', t)))),
      txt('p', 'rule-highlight', 'Too much help is deadly: if Brave protects someone and Medic heals them on the same night, that player dies from overdose.'),
    ] },
    { title: 'The roles', body: () => [powerTeams()] },
    { title: 'Extra rules', body: () => [extraRules()] },
  ];
  let guidePage = 0;
  function rules(page) {
    guidePage = Number.isInteger(page) ? page : 0;
    const d = dialog(GUIDE_PAGES[0].title); d.classList.add('guide-dialog');
    const heading = d.querySelector('h2'), body = el('div', { class: 'guide-page' }), foot = el('div', { class: 'guide-foot' });
    d.append(body, foot);
    const go = n => { guidePage = Math.max(0, Math.min(GUIDE_PAGES.length - 1, n)); draw(); body.scrollTop = 0; d.scrollTop = 0; };
    const draw = () => {
      const pg = GUIDE_PAGES[guidePage], last = guidePage === GUIDE_PAGES.length - 1;
      heading.textContent = pg.title; body.replaceChildren(txt('span', 'guide-step-no', (guidePage + 1) + ' / ' + GUIDE_PAGES.length), ...pg.body());
      foot.replaceChildren(btn('‹ Back', () => go(guidePage - 1), 'secondary guide-back', guidePage === 0),
        el('div', { class: 'guide-dots' }, ...GUIDE_PAGES.map((p, n) => el('button', { type: 'button', class: 'guide-dot' + (n === guidePage ? ' on' : ''), 'aria-label': p.title, 'aria-current': n === guidePage ? 'step' : 'false', onclick: () => go(n) }))),
        last ? btn('Got It', () => d.close(), 'gold guide-next') : btn('Next ›', () => go(guidePage + 1), 'gold guide-next'));
    };
    d.addEventListener('keydown', e => { if (e.key === 'ArrowRight') go(guidePage + 1); if (e.key === 'ArrowLeft') go(guidePage - 1); });
    draw();
  }
  // Powers And Extra Rules: role cards grouped by team (portrait, when it acts, how often, one line), then the
  // extra rules as short rows with an icon each, so the page can be scanned instead of read.
  const ROLE_FACTS = {
    passenger: ['Day', 'Always', 'Listen, share and vote. No night power.'], careful: ['Night · phase 1', 'Once', 'Lock your door: stops an attack on you. Listening neighbours may hear it click.'],
    brave: ['Night · phase 1', 'Once', 'Protect someone from tonight’s attack.'], witness: ['Night · phase 2', 'Twice', 'Watch the attack, or glimpse two faces (one is bad).'],
    speaker: ['Day · vote', 'Once', 'Your vote counts twice.'], inspector: ['Night · phase 2', 'Every night', 'Check a player: GOOD or BAD.'],
    medic: ['Night · phase 2', '1 heal + 1 poison', 'Heal the attacked player, or poison someone.'], trainee: ['When Crew falls', 'Takes over', 'Becomes Inspector or Medic if one is out.'],
    conductor: ['Night · phase 2', 'Every night', 'Learn whether a traveller left their cabin tonight.'], porter: ['Night · phase 1', 'Every night', 'Watch a door; learn who came to it.'],
    guard: ['Night · phase 1', 'Every night', 'Guard someone; take the attack in their place.'], steward: ['Night · phase 1', 'Every night', 'A sleeping pill: no power tonight, but safe from attack.'],
    signalman: ['Night · phase 2', 'Once', 'Signal Stop: a tie in the next vote removes nobody.'],
    saboteur: ['Night · phase 1', 'Every night', 'Agree on one attack with your team.'], blocker: ['Night · phase 1', 'Once', 'Stop one player’s night power.'],
    forger: ['Night · phase 1', 'Once', 'Make a teammate read GOOD to the Inspector.'],
    framer: ['Night · phase 1', 'Once', 'Make a good traveller read BAD to the Inspector.'], silencer: ['Night · phase 1', 'Once', 'Gag someone: they skip the next lounge.'],
    smuggler: ['Night · phase 1', 'Once', 'A silent attack: no footsteps, no walk seen.'], stowaway: ['Hidden', 'Turns once', 'Good until a Saboteur is out, then joins the bad team.'],
  };
  const ROLE_NAMES = { passenger: 'Passenger', careful: 'Careful Passenger', brave: 'Brave Passenger', witness: 'Witness', speaker: 'Speaker', inspector: 'Inspector', medic: 'Medic', trainee: 'Trainee', conductor: 'Conductor', porter: 'Night Porter', guard: 'Guard', steward: 'Steward', signalman: 'Signalman', saboteur: 'Saboteur', blocker: 'Blocker', forger: 'Forger', framer: 'Framer', silencer: 'Silencer', smuggler: 'Smuggler', stowaway: 'Stowaway' };
  const EXTRA_RULES = [
    ['🧪', 'Medicine', 'One heal and one poison for the whole game, one per night. Heal answers the original attack. Poison gets past protection and locked doors.'],
    ['⚠️', 'Too much help', 'If Brave protects and Medic heals the same person on the same night, they die from an overdose.'],
    ['🔎', 'Instant results', 'Inspector learns GOOD or BAD, Witness learns the original target (even if saved). Both see it straight away.'],
    ['🔋', 'Spent powers', 'A confirmed once-only power is spent even if blocked. Missing your turn skips without spending it. A blocked Medic spends nothing.'],
    ['⭐', 'Trainee promotion', 'If Inspector or Medic is out, the Trainee takes the job next night (Inspector first if both are lost), with only the medicine left.'],
    ['🎖️', 'Five-player backup', 'With 5 players there is one Crew member. If they are out on the first night, a random Passenger still aboard secretly takes their job next night, with any medicine already used, and loses their own power.'],
    ['⚖️', 'Dawn ties', 'Night deaths happen together. If the last Saboteur and the last good group fall together, good wins.'],
    ['🎲', 'Carriage events', 'Some nights one public event changes the rules: Power Cut, Long Tunnel, Sealed Ballots and more. The host can turn events off.'],
    ['👻', 'Ghosts', 'Out players watch quietly. They can climb the Ghost Climb to see a role, and make a guess before the journey ends for +5 WP each.'],
    ['👀', 'Observers', 'People who join mid-journey watch what is public and take a seat next journey.'],
    ['⏱️', 'Fair timing', 'Night windows never shorten, so nobody learns who acted from the timing. Missing votes count as Skip; leaving never kills a character.'],
  ];
  function powerTeams() {
    const name = k => state?.catalog?.[k]?.name || ROLE_NAMES[k];
    const card = k => el('div', { class: 'power-card' }, rolePortrait(k, 'power-card-art'), el('div', { class: 'power-card-copy' }, txt('b', '', name(k)),
      el('div', { class: 'power-card-tags' }, txt('span', 'when', ROLE_FACTS[k][0]), txt('span', 'uses', ROLE_FACTS[k][1])), txt('p', '', ROLE_FACTS[k][2]),
      state?.catalog?.[k] ? el('details', { class: 'power-more' }, el('summary', {}, 'Full rule'), txt('p', '', state.catalog[k].description)) : null));
    const team = (cls, title, keys) => el('section', { class: 'power-team ' + cls }, txt('h3', '', title), el('div', { class: 'power-cards' }, ...keys.map(card)));
    return el('div', { class: 'powers-rules' },
      team('passengers', 'Passengers', ['passenger', 'careful', 'brave', 'witness', 'speaker']), team('crew', 'Crew', ['inspector', 'medic', 'trainee', 'conductor', 'porter', 'guard', 'steward', 'signalman']), team('bad', 'Saboteurs', ['saboteur', 'blocker', 'forger', 'framer', 'silencer', 'smuggler', 'stowaway']));
  }
  function extraRules() {
    return el('div', { class: 'powers-rules' },
      el('section', { class: 'extra-rules' }, ...EXTRA_RULES.map(([icon, title, text]) => el('div', { class: 'extra-rule' }, txt('span', 'extra-icon', icon), el('div', {}, txt('b', '', title), txt('p', '', text))))));
  }
  function recoveryDialog() {
    const d = dialog('Save your rejoin code', txt('p', '', 'Keep this code private. On another phone, use the same name, room and this code. Rejoining signs out the old phone.'), el('input', { readOnly: true, value: state.me.recoveryCode, 'aria-label': 'Rejoin code', onclick: e => e.target.select() }));
    d.append(btn('Close', () => d.close(), 'gold'));
  }
  async function invite() {
    const url = location.origin + '/last-train.html?room=' + state.code;
    try { await navigator.clipboard.writeText(url); announce('Link copied'); root.querySelector('[data-invite]').textContent = 'Copied!'; }
    catch { error = 'Copy this link: ' + url; render(); }
  }
  function trainMark(cls = '') {
    const n = el('span', { class: 'train-mark ' + cls, 'aria-hidden': 'true' });
    const id = 'train-crest-' + ++crestSerial;
    n.innerHTML = '<svg viewBox="0 0 48 48" fill="none"><defs><linearGradient id="' + id + '-gold" x1="7" y1="3" x2="39" y2="43" gradientUnits="userSpaceOnUse"><stop stop-color="#fff0b4"/><stop offset=".44" stop-color="#dca343"/><stop offset=".65" stop-color="#fff0ad"/><stop offset="1" stop-color="#bd7823"/></linearGradient><linearGradient id="' + id + '-body" x1="15" y1="12" x2="34" y2="35" gradientUnits="userSpaceOnUse"><stop stop-color="#5dd7c3"/><stop offset=".45" stop-color="#147c83"/><stop offset="1" stop-color="#194250"/></linearGradient><linearGradient id="' + id + '-glass" x1="16" y1="14" x2="31" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#c5efff"/><stop offset=".48" stop-color="#4c98c4"/><stop offset="1" stop-color="#56509b"/></linearGradient></defs><path d="M8 35V19a16 16 0 0 1 32 0v16" stroke="url(#' + id + '-gold)" stroke-width="1.8"/><path d="M12 35V19a12 12 0 0 1 24 0v16" stroke="#f0c16a" stroke-opacity=".35"/><rect x="14" y="11" width="20" height="26" rx="7" fill="url(#' + id + '-body)" stroke="url(#' + id + '-gold)" stroke-width="1.6"/><path d="M15 26h18v5a6 6 0 0 1-6 5h-6a6 6 0 0 1-6-5z" fill="#a94260"/><rect x="17" y="15" width="14" height="9" rx="2" fill="url(#' + id + '-glass)" stroke="#f3d58e" stroke-width=".9"/><path d="M24 15v9M19 17h4M19 19h2" stroke="#e6f7ff" stroke-opacity=".75" stroke-linecap="round"/><path d="M21 8h6M19 39l-4 5M29 39l4 5M18 42h12" stroke="url(#' + id + '-gold)" stroke-width="1.7" stroke-linecap="round"/><circle cx="19.5" cy="29.5" r="2" fill="#ffeaa4"/><circle cx="28.5" cy="29.5" r="2" fill="#ffeaa4"/><path d="M21 33h6" stroke="#f5b88b" stroke-width="1.2" stroke-linecap="round"/></svg>';
    return n;
  }
  const ICONS = {
    gear: '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="ltgear" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe7a0"/><stop offset=".55" stop-color="#e9b84a"/><stop offset="1" stop-color="#b07a24"/></linearGradient></defs><path d="M13.53 5.69 L14.19 2.52 17.81 2.52 18.47 5.69 21.54 6.96 24.25 5.19 26.81 7.75 25.04 10.46 26.31 13.53 29.48 14.19 29.48 17.81 26.31 18.47 25.04 21.54 26.81 24.25 24.25 26.81 21.54 25.04 18.47 26.31 17.81 29.48 14.19 29.48 13.53 26.31 10.46 25.04 7.75 26.81 5.19 24.25 6.96 21.54 5.69 18.47 2.52 17.81 2.52 14.19 5.69 13.53 6.96 10.46 5.19 7.75 7.75 5.19 10.46 6.96Z" fill="url(#ltgear)" stroke="#7a4c14" stroke-width="1" stroke-linejoin="round"/><circle cx="16" cy="16" r="5" fill="#2a2148" stroke="#7a4c14" stroke-width="1"/><circle cx="14.6" cy="14.6" r="1.3" fill="#fff" opacity=".35"/></svg>',
    guide: '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="ltgbL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6bd6ff"/><stop offset="1" stop-color="#3a7bff"/></linearGradient><linearGradient id="ltgbR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8fc0"/><stop offset="1" stop-color="#ff5a8a"/></linearGradient></defs><ellipse cx="16" cy="28.8" rx="12" ry="1.5" fill="#000" opacity=".18"/><path d="M15 8.5Q9 5 3 6.5V25q6-1.5 12 1.8z" fill="url(#ltgbL)"/><path d="M17 8.5Q23 5 29 6.5V25q-6-1.5-12 1.8z" fill="url(#ltgbR)"/><path d="M15 8.5v18.3h2V8.5z" fill="#ffd23f"/><path d="M6 10.5q4.5-.8 7.5 1M6 14.2q4.5-.8 7.5 1M6 17.9q4.5-.8 7.5 1M26 10.5q-4.5-.8-7.5 1M26 14.2q-4.5-.8-7.5 1M26 17.9q-4.5-.8-7.5 1" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".8" fill="none"/><path d="M16 1.5l1.1 2.6 2.6 1.1-2.6 1.1L16 8.9l-1.1-2.6-2.6-1.1 2.6-1.1z" fill="#ffd23f"/></svg>',
    shop: '<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="29.5" rx="12" ry="1.6" fill="#000" opacity=".18"/><rect x="5" y="14" width="22" height="15" rx="1.6" fill="#ffe9c2"/><rect x="8" y="18" width="8" height="6.5" rx="1" fill="#8fd3ff" stroke="#6aa9d6" stroke-width=".8"/><path d="M12 18v6.5M8 21.2h8" stroke="#fff" stroke-width=".9" opacity=".8"/><rect x="19.5" y="18" width="5" height="11" rx="1" fill="#9b5e2e"/><circle cx="23" cy="24" r=".7" fill="#ffd23f"/><path d="M6 5h20l4 9H2z" fill="#ff4d5a"/><path d="M11.8 5h3.2l-.9 9h-3.6zM18 5h3.2l1.3 9H19z" fill="#fff"/><path d="M2 14a3.5 3.5 0 007 0zM16 14a3.5 3.5 0 007 0z" fill="#fff"/><path d="M9 14a3.5 3.5 0 007 0zM23 14a3.5 3.5 0 007 0z" fill="#ff4d5a"/><circle cx="27.5" cy="4" r="1.5" fill="#ffd23f"/><circle cx="4.5" cy="3.5" r="1.1" fill="#6bd6ff"/></svg>',
    sound: ['<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 12h5.5L15 6v20l-6.5-6H3z" fill="#ffb347"/><path d="M20 12l8 8M28 12l-8 8" stroke="#ff8293" stroke-width="3" stroke-linecap="round"/></svg>',
      '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="ltv1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6bd6ff"/><stop offset="1" stop-color="#3a7bff"/></linearGradient></defs><path d="M3 12h5.5L15 6v20l-6.5-6H3z" fill="url(#ltv1)"/><path d="M19.5 12a5.5 5.5 0 010 8" fill="none" stroke="#5ee8b0" stroke-width="3" stroke-linecap="round"/></svg>',
      '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="ltv2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6bd6ff"/><stop offset="1" stop-color="#3a7bff"/></linearGradient></defs><path d="M3 12h5.5L15 6v20l-6.5-6H3z" fill="url(#ltv2)"/><path d="M19.5 12a5.5 5.5 0 010 8" fill="none" stroke="#5ee8b0" stroke-width="3" stroke-linecap="round"/><path d="M23.5 8.5a10.5 10.5 0 010 15" fill="none" stroke="#ffd23f" stroke-width="3" stroke-linecap="round"/></svg>'],
  };
  const svgButton = (cls, label, svg, click) => { const b = el('button', { type: 'button', class: cls, 'aria-label': label, title: label, onclick: click }); b.innerHTML = svg; return b; };
  const SOUND_MODES = ['Sound Off', 'Sound Effects On', 'Effects + Music On'];
  function soundMenu(anchor) {
    const menu = el('div', { class: 'lt-menu sound-menu', role: 'menu' }, ...SOUND_MODES.map((label, m) => el('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(sfx.mode === m), class: sfx.mode === m ? 'on' : '', onclick: () => { menu.remove(); sfx.setMode(m); if (m) sfx.play('pop'); } }, label)));
    popMenu(anchor, menu);
  }
  // Languages: the same choice as Row of Reckoning. The page text is swapped by last-train-i18n.js; the menu shows each
  // language in its own script, so those names stay as written.
  const i18n = window.ltI18n;
  i18n.onChange(() => render());
  function langMenu(anchor) {
    const menu = el('div', { class: 'lt-menu lang-menu', role: 'menu', 'data-no-tr': '' }, ...Object.entries(i18n.LANGS).map(([code, [short, full]]) => el('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(i18n.lang === code), class: i18n.lang === code ? 'on' : '', onclick: () => { menu.remove(); i18n.set(code); } }, txt('b', '', short), txt('span', '', full))));
    popMenu(anchor, menu);
  }
  function popMenu(anchor, menu) {
    document.querySelectorAll('.lt-menu').forEach(m => m.remove());
    const r = anchor.getBoundingClientRect();
    menu.style.top = r.bottom + 8 + 'px';
    if (r.left + r.width / 2 > innerWidth / 2) menu.style.right = Math.max(10, innerWidth - r.right) + 'px'; else menu.style.left = Math.max(10, r.left) + 'px';
    document.body.append(menu);
    const away = e => { if (!menu.contains(e.target) && e.target !== anchor) { menu.remove(); document.removeEventListener('pointerdown', away, true); } };
    setTimeout(() => document.addEventListener('pointerdown', away, true));
    menu.querySelector('button')?.focus({ preventScroll: true });
  }
  function inviteMenu(anchor) {
    popMenu(anchor, el('div', { class: 'lt-menu', role: 'menu' },
      el('button', { type: 'button', role: 'menuitem', onclick: e => { e.currentTarget.parentNode.remove(); invite(); } }, 'Copy Invite Link'),
      el('button', { type: 'button', role: 'menuitem', onclick: e => { e.currentTarget.parentNode.remove(); qrDialog(); } }, 'QR Code'),
      el('button', { type: 'button', role: 'menuitem', onclick: e => { e.currentTarget.parentNode.remove(); recoveryDialog(); } }, 'My Rejoin Code')));
  }
  function loadQR() {
    if (window.qrcode) return Promise.resolve();
    return new Promise((resolve, reject) => document.head.append(el('script', { src: '/qrcode.js', onload: resolve, onerror: reject })));
  }
  async function qrDialog() {
    const url = location.origin + '/last-train.html?room=' + state.code, box = el('div', { class: 'qr-box', 'aria-label': 'QR code for the room link' });
    const d = dialog('Scan to join', txt('p', 'muted small', 'Point a phone camera at the code to open room ' + state.code + '.'), box);
    d.append(btn('Copy Link', invite, 'secondary'), btn('Close', () => d.close(), 'gold'));
    try { await loadQR(); const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make(); box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }
    catch { box.textContent = url; }
  }
  // The host can start over at any time: a fresh deal now, or back to the platform to change roles and settings.
  // Settings: the room's rules (host changes them between journeys; everyone can see them) and this phone's options.
  function settingsDialog() {
    const d = dialog('Settings'); d.classList.add('settings-dialog');
    const body = el('div', { class: 'settings-body' }); d.append(body, el('div', { class: 'confirm-bar' }, btn('Done', () => d.close(), 'gold')));
    const seg = (options, current, pick, disabled) => el('div', { class: 'set-seg', role: 'group' }, ...options.map(([value, label]) => el('button', { type: 'button', class: value === current ? 'on' : '', 'aria-pressed': String(value === current), disabled: !!disabled, onclick: () => pick(value) }, label)));
    const sw = (on, change, disabled, label) => el('button', { type: 'button', role: 'switch', class: 'set-switch' + (on ? ' on' : ''), 'aria-checked': String(!!on), 'aria-label': label, disabled: !!disabled, onclick: () => change(!on) }, el('i'));
    const row = (title, hint, control, stack) => el('div', { class: 'set-row' + (stack ? ' stack' : '') }, el('div', { class: 'set-label' }, txt('b', '', title), hint ? txt('small', '', hint) : null), control);
    const card = (icon, title, tag, ...kids) => el('section', { class: 'set-card' }, el('header', {}, txt('span', 'set-chip', icon), el('h3', {}, title), tag ? txt('em', '', tag) : null), ...kids.filter(Boolean));
    const draw = () => {
      const inRoom = !!(state && seat), host = inRoom && state.hostId === state.meId, editable = host && ['lobby', 'finished'].includes(state.phase), st = state?.settings || {};
      const change = async patch => { if (!editable) return; await setting(patch); draw(); };
      body.replaceChildren(...[
        inRoom ? card('🚂', 'Room Rules', host ? (editable ? 'HOST' : 'BETWEEN JOURNEYS') : 'HOST ONLY',
          !editable ? txt('p', 'set-note', host ? 'You can change these on the platform or after the journey ends.' : 'Only the host can change these. Everyone sees the same rules.') : null,
          row('Sharing Findings', '', seg([['in-person', 'In Person'], ['chat', 'Chat Room']], st.discussion, v => change({ discussion: v }), !editable), true),
          row('Speaking Time', 'Per player, per turn', seg([15, 20, 30, 45].map(n => [n, n + 's']), state.speakSeconds, v => change({ speakSeconds: v }), !editable), true),
          row('Carriage Events', 'A random event on some nights', sw(st.events !== false, v => change({ events: v }), !editable, 'Carriage Events')),
          row('Footsteps & Carriage Map', 'Walks can be heard; good travellers flip to listen', sw(st.footsteps !== false, v => change({ footsteps: v }), !editable, 'Footsteps & Carriage Map')),
          row('Allow Observers', 'Late joiners watch until the next journey', sw(st.observers !== false, v => change({ observers: v }), !editable, 'Allow Observers')),
          row('Shuffle Roles Every Journey', 'A new random role mix each start', sw(!!st.autoShuffle, v => change({ autoShuffle: v }), !editable, 'Shuffle Roles Every Journey')),
          editable ? el('div', { class: 'set-actions' }, btn('Choose Roles', () => { d.close(); roleSettingsDialog(); }, 'secondary'), btn('Shuffle Roles', async () => { await send('shuffleRoles'); draw(); }, 'text-button')) : null) : null,
        card('🎨', 'Display', 'THIS PHONE',
          row('Colour Scheme', (THEMES.find(t => t[0] === ui.theme) || THEMES[0])[1], el('div', { class: 'set-swatches', role: 'radiogroup', 'aria-label': 'Colour scheme' }, ...THEMES.map(([key, name, bg, accent]) => el('button', { type: 'button', role: 'radio', class: 'set-swatch' + (ui.theme === key ? ' on' : ''), 'aria-checked': String(ui.theme === key), 'aria-label': name, title: name, style: '--sw-bg:' + bg + ';--sw-accent:' + accent, onclick: () => { setUi('theme', key); draw(); } }))), true),
          row('Language', '', el('div', { class: 'set-seg', role: 'group', 'data-no-tr': '' }, ...Object.entries(i18n.LANGS).map(([code, [, full]]) => el('button', { type: 'button', class: code === i18n.lang ? 'on' : '', 'aria-pressed': String(code === i18n.lang), onclick: () => { i18n.set(code); draw(); } }, full))), true),
          row('Text Size', '', seg([[0, 'A'], [1, 'A+'], [2, 'A++']], ui.text, v => { setUi('text', v); draw(); }), true),
          row('Calm Mode', 'Turns off most animations', sw(!!ui.calm, v => { setUi('calm', v); draw(); }, false, 'Calm Mode'))),
        card('🔔', 'Sound & Feel', 'THIS PHONE',
          row('Sound', '', seg([[0, 'Off'], [1, 'Effects'], [2, 'Effects + Music']], sfx.mode, v => { sfx.setMode(v); if (v) sfx.play('pop'); render(); draw(); }), true),
          row('Vibration', 'A buzz in your last 5 seconds', sw(!!ui.haptics, v => { setUi('haptics', v); draw(); }, false, 'Vibration'))),
      ].filter(Boolean));
    };
    draw();
  }
  function restartDialog() {
    const n = state.players.filter(p => !p.departed).length + (state.observers || []).length;
    const d = dialog('Restart the journey?', txt('p', 'muted', 'This ends the current journey for everyone. Roles, seats and night powers are dealt again.' + ((state.observers || []).length ? ' Observers take a seat.' : '')));
    d.classList.add('restart-dialog');
    d.append(el('div', { class: 'restart-options' },
      choiceCard('restart-deal', '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M18 3v4h-4M6 21v-4h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>', 'Deal Again Now', 'Same players, new roles', () => { d.close(); send('restart', { to: 'deal' }); }, n < 5, 'restart-deal'),
      choiceCard('restart-lobby', '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" fill="currentColor" opacity=".25"/><path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>', 'Back To Platform', 'Change roles or settings', () => { d.close(); send('restart', { to: 'lobby' }); }, false, 'restart-lobby')),
      ...[n < 5 ? txt('p', 'muted small', 'Dealing again needs at least 5 players. Go back to the platform to wait for more.') : null, btn('Cancel', () => d.close(), 'text-button')].filter(Boolean));
  }
  function leaveDialog() {
    const host = state.hostId === state.meId;
    const d = dialog('Leave the train?', txt('p', 'muted', state.phase === 'lobby' ? 'You can join again with the room code.' : 'Your character stays aboard. Save your rejoin code if you want to come back.'), host ? txt('p', 'muted small', 'You are the host: another player becomes host.') : null);
    d.classList.add('leave-dialog');
    d.append(el('div', { class: 'dialog-actions' }, btn('Stay', () => d.close(), 'secondary'), btn('Leave', () => { d.close(); send('leave'); }, 'danger leave-confirm')));
  }
  const phaseLabel = () => state.paused ? 'Paused' : ({ lobby: 'Waiting to board', briefing: 'Meet the teams', boarding: 'All aboard', settling: 'Night ' + state.round, night: 'Night ' + state.round, gathering: 'Lounge · Round ' + state.round, morning: 'Morning · Round ' + state.round, discussion: 'Lounge · Round ' + state.round, voting: 'Vote · Round ' + state.round, revoteInfo: 'Re-vote · Round ' + state.round, voteResult: 'Vote result · Round ' + state.round, finished: 'Journey ended' }[state.phase] || '');
  function rosterPerson(p) {
    const status = p.departed ? 'away' : !p.alive && state.phase !== 'lobby' ? 'out' : state.speakerId === p.id ? 'speaking' : p.voteLocked ? 'voted' : '';
    return el('div', { class: 'lt-roster-person ' + status + (p.id === state.meId ? ' me' : ''), 'data-player': p.id, title: p.name + (status ? ' · ' + status : '') },
      el('span', { class: 'roster-face' }, avatar(p), p.host ? txt('i', 'roster-host', '★') : null, p.pins ? el('i', { class: 'roster-pins', 'aria-label': p.pins + ' suspect pins' }, '📌' + p.pins) : null),
      txt('small', allyCls(p.id), p.id === state.meId ? 'You' : p.name));
  }
  function playersDialog() {
    const sess = state.session || {};
    const d = dialog('Travellers', txt('p', 'muted small', state.players.filter(p => !p.departed).length + ' in this room. Seat order sets the speaking order.'),
      el('div', { class: 'players-list' }, ...state.players.map(p => el('div', { class: 'players-row' + (p.id === state.meId ? ' me' : '') + (!p.alive && state.phase !== 'lobby' ? ' out' : '') },
        avatar(p, 'players-face'), el('div', {}, el('b', {}, p.name + (p.id === state.meId ? ' · You' : '')), txt('small', '', [p.seat ? 'Seat ' + p.seat : null, p.id === state.hostId ? 'Host' : null, p.departed ? 'Away' : !p.alive && state.phase !== 'lobby' ? 'Out' : state.phase === 'lobby' ? 'Ready to board' : 'On board'].filter(Boolean).join(' · '))),
        sess[p.id]?.journeys ? txt('span', 'players-wins', sess[p.id].wins + ' / ' + sess[p.id].journeys + ' wins') : null))));
    if ((state.observers || []).length) d.insertBefore(el('div', { class: 'observers-list' }, txt('small', 'eyebrow', 'WATCHING · SEAT AT THE NEXT JOURNEY'), ...state.observers.map(o => el('div', { class: 'players-row observer' }, avatar(o, 'players-face'), el('div', {}, el('b', {}, o.name + (o.id === state.meId ? ' · You' : '')), txt('small', '', 'Observer'))))), null);
    d.append(btn('Close', () => d.close(), 'gold'));
  }
  function header() {
    const inRoom = !!(state && seat), w = state?.me?.wallet;
    const top = el('div', { class: 'lt-topbar' },
      el('a', { href: '/?games=1', class: 'lt-iconbtn home-link', 'aria-label': 'All games', title: 'All games' }, '←'),
      svgButton('lt-iconbtn', 'How to play', ICONS.guide, rules),
      svgButton('lt-iconbtn settings-button', 'Settings', ICONS.gear, settingsDialog),
      el('span', { class: 'lt-spacer' }),
      (() => { const b = svgButton('lt-pill sound-pill', SOUND_MODES[sfx.mode], ICONS.sound[sfx.mode], e => soundMenu(e.currentTarget)); b.insertAdjacentHTML('beforeend', '<svg class="caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'); b.setAttribute('aria-haspopup', 'menu'); return b; })(),
      (() => { const b = el('button', { type: 'button', class: 'lt-pill lang-pill', 'aria-haspopup': 'menu', 'aria-label': 'Language', title: 'Language', onclick: e => langMenu(e.currentTarget) }, el('span', { 'data-no-tr': '' }, i18n.LANGS[i18n.lang][0])); b.insertAdjacentHTML('beforeend', '<svg class="caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'); return b; })(),
      inRoom && w ? (() => { const b = svgButton('lt-iconbtn shop-button', 'Shop · ' + w.wp + ' WP', ICONS.shop, () => social.openShop()); b.append(txt('b', 'wp-badge', w.wp + ' WP')); return b; })() : null);
    const title = el('a', { href: '/last-train.html', class: 'lt-title' }, txt('i', '', ''), trainMark('brand-icon'), txt('span', '', 'LAST TRAIN'), txt('i', '', ''));
    if (!inRoom) return el('header', { class: 'lt-header' }, top, title);
    const host = state.hostId === state.meId, aboard = state.players.filter(p => !p.departed && (state.phase === 'lobby' || p.alive)).length;
    const card = el('section', { class: 'lt-gamecard', 'aria-label': 'Room ' + state.code },
      el('div', { class: 'gamecard-row' }, el('span', { class: 'room-badge' }, txt('small', '', 'ROOM'), txt('b', 'room-code', state.code)), btn('Leave', leaveDialog, 'leave-button', false, 'leave-room')),
      el('p', { class: 'gamecard-stats' }, txt('b', '', String(state.players.filter(p => !p.departed).length)), ' Travellers · ', txt('span', 'aboard', aboard + (state.phase === 'lobby' ? ' Ready' : ' Aboard')), ' · ' + phaseLabel(), (state.observers || []).length ? txt('span', 'watching', ' · 👀 ' + state.observers.length + ' watching') : null),
      el('div', { class: 'gamecard-buttons' }, btn('Players', playersDialog, 'card-button', false, 'players'), (() => { const b = btn('Invite ▾', e => inviteMenu(e.currentTarget), 'card-button', false, 'invite'); b.dataset.invite = ''; b.setAttribute('aria-haspopup', 'menu'); return b; })(),
        !['lobby', 'finished'].includes(state.phase) && host ? btn(state.paused ? 'Resume' : 'Pause', () => send(state.paused ? 'resume' : 'pause'), 'card-button slate', false, 'pause') : null,
        state.phase !== 'lobby' && host ? (() => { const b = btn('Restart', restartDialog, 'card-button restart-button', false, 'restart'); b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M20.5 3.5v5h-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Restart</span>'; b.setAttribute('aria-label', 'Restart'); return b; })() : null),
      el('div', { class: 'lt-roster', 'aria-label': 'Travellers in seat order' }, ...state.players.filter(p => !p.departed || state.phase !== 'lobby').map(rosterPerson)));
    return el('header', { class: 'lt-header in-room' }, top, title, card);
  }
  function landing() {
    return el('div', { class: 'landing' }, el('section', { class: 'intro' }, txt('span', 'eyebrow', 'EVERY CABIN HIDES A SECRET.'), train(), el('h1', {}, 'All aboard.', el('br'), el('em', {}, 'Trust no easy story.')), txt('p', 'muted', 'A secret role. A private cabin. A train full of suspects. Use your power at night, then meet to talk and vote.'), el('div', { class: 'chips' }, txt('span', '', '5–12 friends'), txt('span', '', 'Secret teams'), txt('span', '', 'Night powers'))),
      el('section', { class: 'panel entrance' }, txt('span', 'eyebrow', 'YOUR TICKET TO PLAY'), el('h2', {}, 'Catch the last train.'), el('label', { htmlFor: 'lt-name' }, 'Your name'), el('input', { id: 'lt-name', value: name, maxLength: 10, autocomplete: 'nickname', placeholder: 'Your name', oninput: e => name = e.target.value }), ctaButton('Create A Room', 'Host a game for friends', () => enter('create'), 'cta-create', CTA_ICONS.create), txt('div', 'or', 'or join your friends'), el('label', { htmlFor: 'lt-code' }, 'Room code'), el('form', { class: 'join-row', onsubmit: e => { e.preventDefault(); enter('join'); } }, el('input', { id: 'lt-code', class: 'code-input', maxLength: 4, value: code, placeholder: 'ABCD', autocomplete: 'off', enterkeyhint: 'go', oninput: e => code = e.target.value }), el('button', { type: 'submit', class: 'join-go', disabled: busy, 'data-focus': 'Join Room', 'aria-label': 'Join Room' }, txt('span', '', 'Join'), arrowMark('join-arrow'))), el('details', {}, el('summary', {}, 'Rejoin On Another Phone'), txt('p', 'muted small', 'Use the same name and your saved private code.'), el('label', { htmlFor: 'lt-recovery' }, 'Rejoin code'), el('input', { id: 'lt-recovery', value: recovery, oninput: e => recovery = e.target.value })), txt('p', 'muted small', 'Good players and bad players can both lie. Your private role tells you which side you are on.')));
  }
  function traveller(p, cls = '') {
    return el('div', { class: 'traveller ' + cls, 'aria-hidden': 'true' }, avatar(p));
  }
  function seatedTraveller(p) {
    const index = p.avatarIndex ?? Math.max(0, (p.seat || 1) - 1);
    // Measured row boundaries keep neighbouring shoes outside each rendered sprite.
    const col = index % 4, row = Math.floor(index / 4);
    const bands = [[0,368,722,1086],[0,374,729,1086],[0,368,725,1086],[0,368,728,1086]][col];
    const y = bands[row], height = bands[row + 1] - y;
    return el('div', { class: 'seated-traveller', 'data-avatar-index': index, 'data-atlas-row': row, 'aria-hidden': 'true', style: '--px:' + (col * 100 / 3) + '%;--py:' + (y / (1086 - height) * 100) + '%;--sprite-y-size:' + (1086 / height * 100) + '%;--back-y:' + (row * 50) + '%;--head-x:' + [57.5, 52.8, 51.4, 56][col] + '%' });
  }
  function roster() {
    return el('section', { class: 'panel roster-panel' }, el('div', { class: 'panel-heading' }, el('h3', {}, 'Your Fellow Travellers'), txt('small', 'muted', state.players.filter(p => !p.departed).length + '/12 IN ROOM')), el('div', { class: 'roster' }, ...state.players.map(p => el('div', { class: 'seat' + (p.id === state.meId ? ' mine' : '') + (!p.alive ? ' out' : '') }, avatar(p, 'avatar'), el('div', { class: 'seat-label' }, txt('b', '', p.name + (p.id === state.meId ? ' · You' : '')), txt('small', '', p.role ? role(p.role).name + ' · ' + (p.alive ? groupName(p.group) : 'OUT') : p.departed ? 'AWAY' : p.id === state.hostId ? 'HOST' : 'READY TO BOARD'))))));
  }
  function setting(extra = {}) { return send('settings', { ...state.settings, ...extra }); }
  function startJourneyButton(disabled, replay = false) {
    const n = btn(replay ? 'PLAY AGAIN' : 'START JOURNEY', () => send('start'), 'host departure-button', disabled);
    n.setAttribute('aria-label', replay ? 'PLAY AGAIN' : 'START JOURNEY');
    const icon = el('span', { class: 'departure-icon', 'aria-hidden': 'true' });
    icon.append(trainMark('ticket-train'));
    n.replaceChildren(icon, el('span', { class: 'departure-copy' }, txt('small', '', replay ? 'A NEW DEAL. A NEW SECRET.' : 'ALL ABOARD'), txt('b', '', replay ? 'Another Journey' : 'Start Journey')), el('span', { class: 'departure-arrow', 'aria-hidden': 'true' }));
    // An SVG arrow sits in the exact centre of its circle, unlike a text arrow on the font's baseline.
    n.lastChild.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
    return n;
  }
  function waitingRoom() {
    const n = state.players.filter(p => !p.departed).length, host = state.hostId === state.meId;
    return el('div', { class: 'lobby-grid' }, el('section', { class: 'panel waiting-panel' }, art('platform'), txt('span', 'eyebrow', 'PLATFORM 07 · LAST DEPARTURE'), el('h1', {}, 'Your train is waiting.'), txt('p', 'muted', 'Share your code. Gather at least 5 players. Each person needs their own phone.'), txt('div', 'large-code', state.code),
      el('div', { class: 'room-setting' }, txt('b', '', 'How will everyone talk each round?'), el('div', { class: 'mode-switch', role: 'group', 'aria-label': 'Speaking mode' }, ...[['chat','Chat Room'],['in-person','In Person']].map(([mode,label]) => btn(label, () => setting({ discussion: mode }), state.settings.discussion === mode ? 'selected' : '', !host, 'mode-' + mode))), txt('p', 'muted small', state.settings.discussion === 'chat' ? 'Each player gets ' + state.speakSeconds + ' seconds to type or record one message. Voice recordings can be played after their turn.' : 'Sit together. Each player gets ' + state.speakSeconds + ' seconds to speak aloud, in seat order.')),
      el('div', { class: 'room-setting' }, txt('b', '', 'Speaking time per player'), el('div', { class: 'mode-switch speak-switch', role: 'group', 'aria-label': 'Speaking time per player' }, ...[15, 20, 30, 45].map(n => btn(n + 's', () => setting({ speakSeconds: n }), state.speakSeconds === n ? 'selected' : '', !host, 'speak-' + n)))),
      // Four room switches as a compact 2×2 grid: title and switch on top, a short line under.
      el('div', { class: 'room-setting toggles toggle-grid' }, ...[['events', 'Carriage Events', 'A random twist on some nights.'], ['observers', 'Allow Observers', 'Late joiners watch, then play next.'], ['footsteps', 'Footsteps & Map', 'Hear Saboteurs walk past your door.'], ['autoShuffle', 'Shuffle Roles', 'A new role mix every journey.']].map(([key, label, hint]) =>
        el('label', { class: 'switch-row toggle-card' }, toggleIcon(key), el('span', {}, txt('b', '', label), txt('small', '', hint)), el('input', { type: 'checkbox', role: 'switch', checked: key === 'autoShuffle' ? !!state.settings.autoShuffle : state.settings[key] !== false, disabled: !host || busy, onchange: e => setting({ [key]: e.target.checked }) })))),
      n >= 5 ? el('div', { class: 'role-mix' }, ...state.mix.map(m => el('span', {}, rolePortrait(m.role, 'mix-portrait'), txt('b', '', m.count + '×'), role(m.role).name))) : txt('p', 'muted', (5 - n) + ' more needed to start.'),
      host ? el('div', { class: 'role-settings-actions' }, btn('Choose Roles', roleSettingsDialog, 'secondary', n < 5), btn('Shuffle Roles', () => send('shuffleRoles'), 'text-button', n < 5), txt('p', 'muted small', state.settings.autoShuffle ? (state.settings.mixPicked ? 'This journey uses the mix you set. After it, a new mix is drawn each journey.' : 'Shuffle is on: a new role mix is drawn when the journey starts.') : 'Roles are dealt to players at random.')) : null,
      host ? startJourneyButton(n < 5) : txt('p', 'waiting', 'The host will start your journey.'), btn('See The Rules', rules, 'text-button')), roster());
  }
  const BAD_KEYS = ['blocker', 'forger', 'framer', 'silencer', 'smuggler'];
  const CREW_KEYS = ['inspector', 'medic', 'trainee', 'conductor', 'porter', 'guard', 'steward', 'signalman'], SOLO_CREW = ['inspector', 'medic', 'conductor', 'porter'];
  function roleSettingsDialog() {
    const slots = state.teamSlots; if (!slots || state.hostId !== state.meId) return;
    const selectedMix = state.phase === 'finished' ? state.nextMix : state.mix;
    let draft = { crew: selectedMix.filter(m => role(m.role).group === 'crew').map(m => m.role), passengers: selectedMix.filter(m => role(m.role).group === 'passenger' && !['passenger', 'stowaway'].includes(m.role)).map(m => m.role),
      bad: selectedMix.filter(m => BAD_KEYS.includes(m.role)).map(m => m.role), stowaway: selectedMix.some(m => m.role === 'stowaway') };
    const d = dialog('Choose tonight’s roles', txt('p', 'muted small', 'Choose the role mix. Players receive their roles at random. ' + (state.players.filter(p => !p.departed).length === 6 ? 'Six players can have two Passengers and two Crew.' : 'Passengers outnumber Crew.')));
    d.classList.add('role-picker'); d.dataset.turn = fence();
    const content = el('div', { class: 'role-picker-content' });
    const commit = btn('Use These Roles', () => { d.close(); setting({ roles: draft, autoShuffle: false }); }, 'gold');
    const refresh = () => {
      const passengerSeats = slots.good - draft.crew.length;
      const free = passengerSeats - draft.passengers.length - (draft.stowaway ? 1 : 0);
      const valid = free >= 0 && draft.bad.length <= slots.saboteur && draft.crew.length >= 1 && draft.crew.length <= slots.maxCrew && (!draft.crew.includes('trainee') || draft.crew.some(k => k === 'inspector' || k === 'medic')) && (slots.maxCrew > 1 || SOLO_CREW.includes(draft.crew[0])) && draft.passengers.length <= passengerSeats;
      commit.disabled = !valid || busy;
      const option = (key, list, disabled = false) => el('label', { class: 'role-option' + (draft[list].includes(key) ? ' selected' : '') },
        el('input', { type: list === 'crew' && slots.maxCrew === 1 ? 'radio' : 'checkbox', name: list === 'crew' && slots.maxCrew === 1 ? 'crew-role' : 'role-' + key, checked: draft[list].includes(key), disabled, onchange: e => { draft[list] = list === 'crew' && slots.maxCrew === 1 ? [key] : e.target.checked ? [...draft[list], key] : draft[list].filter(k => k !== key); refresh(); } }), rolePortrait(key, 'picker-portrait'), el('div', {}, txt('b', '', role(key).name), txt('small', '', rolePreview[key])));
      content.replaceChildren(
        el('div', { class: 'role-budget' }, txt('b', '', passengerSeats + ' Passengers'), txt('span', '', draft.crew.length + ' Crew'), txt('span', '', slots.saboteur + (slots.saboteur === 1 ? ' Saboteur' : ' Saboteurs'))),
        el('section', { class: 'picker-group' }, el('div', { class: 'picker-heading' }, el('h3', {}, 'Crew'), txt('small', '', slots.maxCrew === 1 ? 'CHOOSE 1' : 'CHOOSE 1–' + slots.maxCrew)), txt('p', 'muted small', slots.maxCrew === 1 ? 'With 5 players, choose a Crew member who brings information.' : 'A Trainee needs an Inspector or Medic to take over from.'), el('div', { class: 'picker-grid' }, ...CREW_KEYS.map(k => option(k, 'crew', slots.maxCrew === 1 ? !SOLO_CREW.includes(k) : !draft.crew.includes(k) && (draft.crew.length >= slots.maxCrew || draft.passengers.length > passengerSeats - 1))))),
        el('section', { class: 'picker-group' }, el('div', { class: 'picker-heading' }, el('h3', {}, 'Passengers'), btn('All Normal', () => { draft.passengers = []; refresh(); }, 'text-button')), txt('p', 'muted small', Math.max(0, free) + ' normal Passengers. Add powers below, or leave every Passenger normal.'), el('div', { class: 'picker-grid' }, ...['careful', 'brave', 'witness', 'speaker'].map(k => option(k, 'passengers', !draft.passengers.includes(k) && free <= 0)))),
        // Bad team: give some Saboteurs a power (one each), and choose whether a Stowaway hides among the Passengers.
        el('section', { class: 'picker-group bad-picker' }, el('div', { class: 'picker-heading' }, el('h3', {}, 'Bad team'), txt('small', '', 'UP TO ' + slots.saboteur + (slots.saboteur === 1 ? ' POWER' : ' POWERS'))),
          txt('p', 'muted small', (slots.saboteur - draft.bad.length) + (slots.saboteur - draft.bad.length === 1 ? ' normal Saboteur.' : ' normal Saboteurs.') + ' Each power replaces one normal Saboteur.'),
          el('div', { class: 'picker-grid' }, ...BAD_KEYS.filter(k => slots.saboteur > 1 || k !== 'blocker').map(k => option(k, 'bad', !draft.bad.includes(k) && draft.bad.length >= slots.saboteur)))),
        el('section', { class: 'picker-group stowaway-picker' }, el('div', { class: 'picker-heading' }, el('h3', {}, 'Hidden traitor'), txt('small', '', 'OPTIONAL')),
          el('label', { class: 'role-option' + (draft.stowaway ? ' selected' : '') }, el('input', { type: 'checkbox', name: 'role-stowaway', checked: draft.stowaway, disabled: !draft.stowaway && free <= 0, onchange: e => { draft.stowaway = e.target.checked; refresh(); } }), rolePortrait('stowaway', 'picker-portrait'), el('div', {}, txt('b', '', role('stowaway').name), txt('small', '', rolePreview.stowaway)))));
    };
    d.append(content, commit, btn('Recommended Roles', () => { d.close(); setting({ roles: null, autoShuffle: false }); }, 'text-button'), btn('Cancel', () => d.close(), 'text-button')); refresh();
  }
  function clock() { return el('div', { class: 'journey-clock', role: 'timer', 'aria-live': 'off' }, txt('span', 'countdown', ''), txt('small', '', state.paused ? 'PAUSED' : 'SECONDS')); }
  // One small picture per room switch: a lightning-struck lantern, opera glasses, footprints and shuffle arrows.
  const TOGGLE_ICONS = {
    events: '<path d="M18.5 3 7 18h7.5L12 29l13-16h-7.8z" fill="#ffd56b" stroke="#c98f12" stroke-width="1.3" stroke-linejoin="round"/>',
    observers: '<path d="M9 9h5v4H9zM18 9h5v4h-5z" fill="#8b97b3"/><circle cx="9.5" cy="19" r="6.5" fill="#2d4a72" stroke="#8fd6ff" stroke-width="2.2"/><circle cx="22.5" cy="19" r="6.5" fill="#2d4a72" stroke="#8fd6ff" stroke-width="2.2"/><path d="M14 17.5h4" stroke="#8fd6ff" stroke-width="2.2"/><circle cx="7.5" cy="17" r="1.8" fill="#e8fdff"/><circle cx="20.5" cy="17" r="1.8" fill="#e8fdff"/>',
    footsteps: '<g fill="#f2ce86"><ellipse cx="10" cy="9" rx="4" ry="5.2"/><ellipse cx="10" cy="18" rx="3" ry="2.6"/><ellipse cx="21" cy="14" rx="4" ry="5.2"/><ellipse cx="21" cy="23" rx="3" ry="2.6"/></g>',
    autoShuffle: '<g fill="none" stroke="#c9a2ff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h5c6 0 8 14 14 14h4M4 23h5c2.5 0 4-2.4 5.4-5M18 12.6C19.6 10.4 21 9 23 9h4"/><path d="M24 5.5 27.5 9 24 12.5M24 19.5l3.5 3.5-3.5 3.5"/></g>',
  };
  const toggleIcon = key => { const i = el('span', { class: 'toggle-icon', 'aria-hidden': 'true' }); i.innerHTML = '<svg viewBox="0 0 32 32">' + TOGGLE_ICONS[key] + '</svg>'; return i; };
  const EVENT_ICONS = { 'long-tunnel': '🚇', express: '⚡', fog: '🌫️', snack: '🍰', 'power-cut': '🔌', sealed: '✉️', luggage: '🧳', 'full-moon': '🌕', quiet: '🤫' };
  function eventChip() {
    if (!state.event || ['lobby', 'briefing', 'boarding', 'finished'].includes(state.phase)) return null;
    // A small pill so the scene stays visible; tap it for the rule.
    return el('details', { class: 'event-chip event-' + state.event.key, 'data-details': 'event-' + state.match + '-' + state.round }, el('summary', { 'aria-label': 'Carriage event: ' + state.event.name + '. Tap for details' }, txt('span', 'event-icon', EVENT_ICONS[state.event.key] || '✦'), el('span', { class: 'event-name' }, txt('small', '', 'EVENT'), txt('b', '', state.event.name)), txt('span', 'event-more', 'i')), el('div', { class: 'event-about' }, txt('small', '', 'CARRIAGE EVENT · NIGHT ' + state.round), txt('p', '', state.event.about)));
  }
  // A Signal Stop is public: the lounge shows it until the vote is done.
  const signalChip = () => state.signalStop ? el('details', { class: 'event-chip event-signal', 'data-details': 'signal-' + state.match + '-' + state.round }, el('summary', { 'aria-label': 'Signal Stop. Tap for details' }, txt('span', 'event-icon', '🚦'), el('span', { class: 'event-name' }, txt('small', '', 'SIGNAL'), txt('b', '', 'Signal Stop')), txt('span', 'event-more', 'i')), el('div', { class: 'event-about' }, txt('small', '', 'CALLED LAST NIGHT'), txt('p', '', 'If today’s vote ties, nobody leaves the train and there is no re-vote.'))) : null;
  function hud(kicker, title, subtitle) { return el('div', { class: 'scene-hud' }, el('div', {}, txt('span', 'eyebrow', kicker), el('h1', {}, title), subtitle ? txt('p', '', subtitle) : null, eventChip(), signalChip()), state.deadline || state.paused ? clock() : null); }
  const art = name => { const mobile = { cabin:'cabin', 'lounge-room':'lounge-room-mobile' }[name]; return el('picture', { class: 'world-picture' }, mobile ? el('source', { media: '(max-width: 680px)', srcset: '/last-train/' + mobile + '.webp' }) : null, el('img', { class: 'world-art', src: '/last-train/' + name + '.webp', alt: '', 'aria-hidden': 'true' })); };
  const rolePreview = { passenger: 'Listen, share and vote.', careful: 'Lock your own door once.', brave: 'Protect someone once. Heal + protection is deadly.', witness: 'Twice: watch the attack, or glimpse two faces (one is bad).', speaker: 'Use a double vote once.', inspector: 'Check GOOD or BAD each night.', medic: 'One heal and one poison. Choose one per night.', trainee: 'Take a fallen Crew member’s job.', conductor: 'Each night, learn whether someone left their cabin.', porter: 'Each night, watch a door and learn who came.', guard: 'Each night, take an attack for someone.', steward: 'Each night, a sleeping pill: no power, but safe.', signalman: 'Once: a tie in the next vote removes nobody.', saboteur: 'Choose one shared attack. Anyone can be a target.', blocker: 'A Saboteur who can also block one power once.', forger: 'A Saboteur who can disguise one teammate once: they read GOOD to the Inspector that night.', framer: 'A Saboteur who can frame a good traveller once: they read BAD to the Inspector.', silencer: 'A Saboteur who can gag someone once: they skip the next lounge.', smuggler: 'A Saboteur who can make one attack silent: no footsteps, no walk seen.', stowaway: 'Takes a Passenger seat. Good until a Saboteur is out, then secretly joins the bad team.' };
  function introScene() {
    prepareBoardingVideo();
    const groups = [['good', 'GOOD TEAM', 'Passengers + Crew', 'Find every Saboteur. Keep both good groups alive.'], ['bad', 'BAD TEAM', 'Saboteurs', 'Get all Passengers OR all Crew out. Your team knows each other.']];
    return el('section', { class: 'role-intro scene-panel' }, art('platform'), hud('BEFORE WE DEPART', 'Meet the two teams.', 'These are the roles aboard tonight. Who gets which role stays secret.'), el('div', { class: 'team-intros' }, ...groups.map(([g,tag,title,goal]) => el('section', { class: 'team-intro ' + g }, txt('span', 'team-label', tag), el('h2', {}, title), txt('p', 'team-intro-goal', goal), ...(g === 'good' ? [['passenger', 'Passengers', 'Ordinary travellers. Some have a once-per-game power.'], ['crew', 'Crew', 'Train staff with a job every night. If every Crew member is out, the Saboteurs win.']] : [['saboteur', null, null]]).map(([kind, head, about]) => {
        const mix = state.mix.filter(m => role(m.role).group === kind), count = mix.reduce((n, m) => n + m.count, 0);
        return el('div', { class: 'intro-subgroup ' + kind }, head ? el('div', { class: 'intro-subhead' }, txt('b', '', head), txt('span', 'intro-count', String(count)), txt('small', '', about)) : null,
          el('div', { class: 'introduced-roles' }, ...mix.map(m => el('div', { class: 'introduced-role' }, rolePortrait(m.role, 'intro-portrait'), el('div', {}, el('b', {}, role(m.role).name, txt('small', '', ' ×' + m.count)), txt('p', '', rolePreview[m.role]))))));
      })))),
      el('div', { class: 'intro-footer' }, txt('p', 'muted small', 'Seats are shuffled separately from roles. Your seat number sets your speaking order.'), state.me.ready ? txt('p', 'choice-saved', '✓ Ready to board. Waiting for the others…') : btn('I’m Ready · Board The Train', () => send('ready'), 'gold')));
  }
  function prepareBoardingVideo() {
    const key = [state.code, state.match, 'boarding'].join(':');
    if (!motionOK || (boardingVideo && boardingVideoKey === key)) return;
    boardingVideo?.pause();
    boardingVideoKey = key;
    boardingVideo = el('video', { class: 'boarding-video', src: '/last-train/boarding.c0472ce51f03.mp4', poster: '/last-train/boarding-poster.webp', muted: false, defaultMuted: false, playsInline: true, preload: 'auto', tabIndex: -1,
      onloadedmetadata: syncBoardingVideo, onloadeddata: syncBoardingVideo, onseeked: syncBoardingVideo,
      onerror: e => { e.currentTarget.hidden = true; } });
    // Warm the approved clip during the introduction, before the shared boarding clock starts.
    boardingVideo.load();
  }
  function revealBoardingFrame(video) {
    if (video.framePending || video.dataset.ready || video.seeking || video.readyState < 2) return;
    video.framePending = true;
    const reveal = () => {
      video.framePending = false;
      if (boardingVideo === video && video.isConnected && !video.seeking && video.readyState >= 2 && state?.phase === 'boarding') video.dataset.ready = 'true';
    };
    // Keep the poster visible until the correctly positioned frame has actually been decoded.
    if (video.requestVideoFrameCallback && !state.paused) video.requestVideoFrameCallback(reveal);
    else requestAnimationFrame(reveal);
  }
  function boardingScene() {
    prepareBoardingVideo();
    return el('section', { style: '--elapsed:' + Math.max(0,(state.duration || 6) - (state.remainingMs || 0)/1000) + 's', class: 'world platform-scene', 'aria-label': 'Everyone boards the train' },
      el('div', { class: 'boarding-cinema', 'aria-hidden': 'true' }, el('img', { class: 'boarding-poster', src: '/last-train/boarding-poster.webp', alt: '' }), motionOK ? boardingVideo : null),
      hud('ALL ABOARD', 'Next stop: the unknown.', 'The carriage is ready. Find your cabin.'),
      el('div', { class: 'boarding-board' }, el('div', { class: 'boarding-board-head' }, txt('span', 'eyebrow', 'PASSENGER MANIFEST'), el('span', { class: 'boarding-count', style: '--total:' + state.players.length }, txt('b', '', String(state.players.length)), ' Boarding')), el('div', { class: 'boarding-progress', 'aria-hidden': 'true' }, el('i')),
        el('div', { class: 'boarding-queue', 'aria-label': 'Passenger boarding checks' }, ...state.players.map((p,i) => el('div', { class: 'boarding-person' + (p.id === state.meId ? ' mine' : ''), style: '--order:' + i + ';--total:' + state.players.length }, avatar(p, 'boarding-avatar'), el('div', { class: 'bp-copy' }, txt('b', '', p.name + (p.id === state.meId ? ' · You' : '')), txt('small', '', 'LAST TRAIN · FIRST CLASS')), el('div', { class: 'bp-stub' }, txt('small', '', 'CABIN'), txt('b', '', String(p.seat).padStart(2, '0'))), txt('span', 'boarding-check', 'ABOARD'))))));
  }
  async function playBoardingVideo(video) {
    video.playPending = true;
    try { await video.play(); }
    catch (e) {
      if (boardingVideo !== video || e.name === 'AbortError') return;
      if (e.name === 'NotAllowedError' && !video.muted) {
        // A blocked soundtrack must not hide the movie or stop the room clock.
        video.muted = true;

        try { await video.play(); }
        catch (fallback) { if (fallback.name !== 'AbortError' && boardingVideo === video) { video.hidden = true; video.pause(); } }
      } else { video.hidden = true; video.pause(); }
    } finally { video.playPending = false; }
  }
  function syncBoardingVideo() {
    const video = boardingVideo;
    if (!video) return;
    if (state?.phase === 'briefing' && seat) return;
    if (state?.phase !== 'boarding' || !seat) {
      video.pause(); video.removeAttribute('src'); video.load();
      boardingVideo = null; boardingVideoKey = ''; return;
    }

    if (!video.isConnected || video.hidden || video.readyState < 1 || !Number.isFinite(video.duration)) return;
    const elapsed = Math.max(0, (state.duration || 6) - (state.remainingMs || 0) / 1000 + (state.paused ? 0 : (Date.now() - state.receivedAt) / 1000));
    const target = Math.min(elapsed, video.duration);
    // Server time owns the transition; media completion never advances the room.
    if (video.seeking) return;
    if (Math.abs(video.currentTime - target) > (state.paused || !video.positioned ? .05 : 1.25)) {
      try { video.positioned = true; video.currentTime = target; } catch { return; }
      return;
    }
    video.positioned = true;
    revealBoardingFrame(video);
    if (state.paused || document.hidden || elapsed >= video.duration) video.pause();
    else if (video.paused && !video.playPending) playBoardingVideo(video);
  }
  // One picker for votes, night powers and pins: big faces, a clear selected state, and a confirm bar that names the choice.
  const TONE_ICONS = {
    vote: '<path d="M7 11h18v15a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" fill="#f2ce86"/><path d="M5 9h22v4H5z" fill="#c9963d"/><path d="M12 4h8l1 9h-10z" fill="#fff6dc"/><path d="M13 17l2.5 2.5L20 15" stroke="#5a3608" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    attack: '<path d="M22 3l7 1-1 7-13 13-6-6z" fill="#e9eef7"/><path d="M22 3l7 1-1 7-7-1z" fill="#ffffff"/><path d="M8 17l7 7-2.5 2.5-7-7z" fill="#c9963d"/><path d="M4 25l3 3-2.5 2.5-3-3z" fill="#7a2a2a"/>',
    protect: '<path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z" fill="#5fe3b8"/><path d="M16 3v26C10 27 5 22 5 15V7z" fill="#2fae88"/><path d="M11 15.5l3.5 3.5L21 12" stroke="#063326" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    check: '<circle cx="13.5" cy="13.5" r="8.5" fill="#bdf6ff44" stroke="#e8fdff" stroke-width="3"/><path d="M20 20l7.5 7.5" stroke="#f2ce86" stroke-width="4.5" stroke-linecap="round"/>',
    poison: '<path d="M12 3h8v6c0 2 7 4 7 11v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-6c0-7 7-9 7-11z" fill="#7a3fa0"/><path d="M6 19c6-2 13 2 20 0v7a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" fill="#8ef03f"/><circle cx="16" cy="22" r="3" fill="#f6f0e0"/>',
    block: '<circle cx="16" cy="16" r="11" fill="none" stroke="#ff8fa0" stroke-width="4"/><path d="M8.5 8.5l15 15" stroke="#ff8fa0" stroke-width="4" stroke-linecap="round"/>',
    pin: '<path d="M19 3l10 10-3 1-4 4 1 6-3 2-5-6-8 8-1-1 8-8-6-5 2-3 6 1 4-4z" fill="#ff7293"/><path d="M19 3l10 10-3 1-8-8z" fill="#ffb3c2"/>',
  };
  const toneIcon = tone => { const n = el('span', { class: 'tone-icon', 'aria-hidden': 'true' }); n.innerHTML = '<svg viewBox="0 0 32 32">' + TONE_ICONS[tone] + '</svg>'; return n; };
  function targetCard(p, onPick, extraClass = '') {
    const b = btn('', onPick, 'manifest-target ' + extraClass, false, 'manifest-' + p.id); b.dataset.id = p.id; b.setAttribute('aria-pressed', 'false');
    b.append(...[el('span', { class: 'target-face' }, avatar(p), txt('i', 'target-check', '✓')), txt('b', allyCls(p.id), p.name + (p.id === state.meId ? ' · You' : '')), txt('small', '', isAlly(p.id) ? 'Teammate · Seat ' + p.seat : 'Seat ' + p.seat), p.pins ? txt('span', 'target-pins', '📌 ' + p.pins) : null].filter(Boolean));
    return b;
  }
  function skipCard(onPick) {
    const b = btn('', onPick, 'manifest-target skip', false, 'manifest-skip'); b.dataset.id = 'skip'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', 'Skip · nobody');
    b.append(el('span', { class: 'target-face skip-face' }, txt('span', '', '⊘'), txt('i', 'target-check', '✓')), txt('b', '', 'Skip'), txt('small', '', 'Nobody'));
    return b;
  }
  function chooseTarget(title, kind, action, extra = {}, { self = false, skip = false, only = null } = {}) {
    const bound = fence(); let selected = null, double = false;
    const tone = action === 'vote' ? 'vote' : action === 'medicine' ? 'poison' : { cover: 'protect', check: 'check', block: 'block', frame: 'check', gag: 'block', manifest: 'check', post: 'check', guard: 'protect', pill: 'protect' }[extra.power] || 'attack';
    const d = dialog(title, el('div', { class: 'target-hint' }, toneIcon(tone), txt('p', '', kind))); d.dataset.turn = bound; d.classList.add('target-dialog', 'tone-' + tone);
    const list = el('div', { class: 'manifest-targets' });
    const chosen = el('span', { class: 'confirm-face' });
    const confirm = btn('Choose Someone', () => { if (fence() !== bound) return d.close(); d.close(); send(action, { ...extra, ...(action === 'vote' ? { targetId: selected === 'skip' ? null : selected, doubled: double } : action === 'night' && state.nightRole === 'saboteur' && !['block', 'frame', 'gag'].includes(extra.power) ? { attackId: selected === 'skip' ? null : selected } : { targetId: selected }) }); }, tone === 'vote' ? 'gold' : ['attack', 'poison', 'block'].includes(tone) ? 'danger' : tone === 'protect' ? 'heal' : 'secondary', true, 'confirm-target');
    const select = id => {
      selected = id; list.querySelectorAll('button').forEach(b => { b.classList.toggle('selected', b.dataset.id === id); b.setAttribute('aria-pressed', b.dataset.id === id); });
      confirm.disabled = false; confirm.replaceChildren(id === 'skip' ? el('span', { class: 'confirm-skip', 'aria-hidden': 'true' }, '⊘') : avatar(id, 'confirm-avatar'), txt('span', '', 'Confirm: ' + (id === 'skip' ? 'Skip' : who(id))));
      if (id === 'skip') { double = false; if (doubleInput) { doubleInput.checked = false; doubleInput.disabled = true; } } else if (doubleInput) doubleInput.disabled = false;
    };
    let doubleInput;
    if (skip) list.append(skipCard(() => select('skip')));
    // The Inspector sees whom they already checked, so a check is not wasted on the same person.
    const checked = new Map(extra.power === 'check' ? (state.me.reports || []).filter(r => r.type === 'check').map(r => [r.targetId, r]) : []);
    // The Conductor sees earlier ticket checks; the Porter, Guard and Steward cannot pick last night's traveller again.
    const tickets = new Map(extra.power === 'manifest' ? (state.me.reports || []).filter(r => r.type === 'manifest').map(r => [r.targetId, r]) : []);
    const last = ['post', 'guard', 'pill'].includes(extra.power) && state.me.used?.last?.round === state.round - 1 ? state.me.used.last.targetId : null;
    for (const p of state.players.filter(p => p.alive && (self || p.id !== state.meId) && (!only || only(p)) && (action !== 'vote' || !state.voteCandidates || state.voteCandidates.includes(p.id)))) {
      const c = checked.get(p.id), card = targetCard(p, () => select(p.id), c ? 'checked checked-' + c.alignment : '');
      if (action === 'night' && state.nightRole === 'saboteur' && !extra.power && state.settings.footsteps !== false) { const k = walkNoise(plannedWalker(), p.id); card.append(txt('span', 'noise-tag' + (k ? ' loud' : ''), k ? '👣 Passes ' + k + (k === 1 ? ' door' : ' doors') : '🔇 Silent')); }
      if (c) { card.append(txt('span', 'checked-tag', c.alignment.toUpperCase() + ' · N' + c.round)); card.setAttribute('aria-label', p.name + ', already checked: ' + c.alignment.toUpperCase() + ' on Night ' + c.round); }
      const t = tickets.get(p.id); if (t) card.append(txt('span', 'checked-tag ticket-tag' + (t.walked ? ' walked' : ''), (t.walked ? 'WALKED' : 'STAYED IN') + ' · N' + t.round));
      if (p.id === last) { card.disabled = true; card.classList.add('last-night'); card.append(txt('span', 'checked-tag last-tag', 'LAST NIGHT')); }
      list.append(card);
    }
    if (checked.size) d.querySelector('.target-hint').after(el('p', { class: 'checked-legend' }, txt('span', 'good', 'GOOD'), txt('span', 'bad', 'BAD'), ' Already checked'));
    d.append(el('p', { class: 'manifest-time' }, txt('span', 'countdown', ''), 's left'), list);
    if (action === 'vote' && state.me.role === 'speaker' && !state.me.used.double) { doubleInput = el('input', { type: 'checkbox', onchange: e => double = e.target.checked }); d.append(el('label', { class: 'check-setting double-vote-toggle' }, doubleInput, el('span', {}, el('b', {}, 'Use My Double Vote'), txt('small', '', 'Counts twice · once per game')))); }
    d.append(el('div', { class: 'confirm-bar' }, confirm, btn('Cancel', () => d.close(), 'text-button')));
  }
  // How many awake travellers a walk to this cabin passes (the shorter way round; a tie counts the louder way).
  function walkNoise(walkerId, targetId) {
    const seated = state.players.filter(p => p.seat), n = seated.length, from = player(walkerId)?.seat, to = player(targetId)?.seat;
    if (!from || !to || from === to) return 0;
    const fwd = (to - from + n) % n, back = n - fwd, count = dir => { let k = 0; for (let c = ring(from + dir, n); c !== to; c = ring(c + dir, n)) if (seated.some(p => p.seat === c && p.alive && p.id !== walkerId)) k++; return k; };
    return fwd < back ? count(1) : fwd > back ? count(-1) : Math.max(count(1), count(-1));
  }
  function plannedWalker() {
    const picks = [...new Set((state.me.teamChoices || []).map(c => c.walkerId).filter(Boolean))];
    return state.me.nightChoice?.walkerId || (picks.length === 1 ? picks[0] : state.meId);
  }
  function disguiseTarget() {
    const bound = fence(), mates = state.me.allies.filter(p => p.alive);
    const d = dialog('Who will you disguise?', el('div', { class: 'target-hint' }, toneIcon('protect'), txt('p', '', 'Once per game. If the Inspector checks them tonight, they read as GOOD.'))); d.dataset.turn = bound; d.classList.add('target-dialog', 'tone-protect');
    d.append(el('div', { class: 'manifest-targets' }, ...mates.map(m => targetCard(player(m.id), () => { d.close(); if (fence() === bound) send('night', { power: 'disguise', targetId: m.id, attackId: state.me.nightChoice?.attackId || null }); }))), el('div', { class: 'confirm-bar' }, btn('Cancel', () => d.close(), 'text-button')));
  }
  function blockTarget() {
    const attackId = state.me.nightChoice?.attackId || null;
    chooseTarget('Whose night power will you block?', 'Once per game. This does not add another attack.', 'night', { power: 'block', attackId });
  }
  // Saboteurs pick who walks the corridor to make the attack. One pick wins; different picks are drawn at random.
  function walkerPicker() {
    const team = (state.me.teamChoices || []).map(c => c.id); if (state.settings.footsteps === false || team.length < 2) return null;
    const mine = state.me.nightChoice?.walkerId || null;
    return el('div', { class: 'walker-picker' }, el('div', { class: 'walker-head' }, txt('b', '', 'Who Walks To The Target?'), txt('small', '', 'Their footsteps may be heard. No pick = random. Different picks = random between them.')),
      el('div', { class: 'walker-options' }, ...team.map(id => { const by = state.me.teamChoices.filter(c => c.walkerId === id).map(c => c.id);
        return el('button', { type: 'button', class: 'walker-option' + (mine === id ? ' mine' : '') + (by.length ? ' picked' : ''), 'aria-pressed': String(mine === id), disabled: busy || state.paused, 'data-focus': 'walker-' + id, onclick: () => send('night', { power: 'walk', walkerId: mine === id ? null : id }) },
          avatar(id, 'walker-face'), txt('b', '', id === state.meId ? 'Me' : who(id)), txt('small', '', 'Cabin ' + String(player(id).seat).padStart(2, '0')), by.length ? el('span', { class: 'walker-votes' }, ...by.map(v => avatar(v, 'walker-vote'))) : null); })));
  }
  const pickTeamTarget = () => chooseTarget('Who will your team attack?', 'Anyone is allowed, including yourself and teammates. You may choose Skip.', 'night', {}, { self: true, skip: true });
  function badConsole() {
    const me = state.me;
    return el('section', { class: 'action-console bad-console', 'aria-label': 'Saboteur team choices' }, el('h2', {}, me.allies.filter(p => p.alive).length > 1 ? 'Agree on one target.' : 'Choose your target.'),
      txt('p', 'console-hint', 'Pick a player or Skip. You can choose again until time ends.'),
      el('div', { class: 'team-proposals', 'aria-label': 'Your team’s target choices' }, ...me.teamChoices.map(p => el('button', { type: 'button', class: 'team-proposal' + (p.id === state.meId ? ' mine' : p.attackId ? ' adoptable' : ''), 'data-voter': p.id, 'data-target': p.attackId || (p.selected ? 'skip' : 'pending'), 'data-focus': 'proposal-' + p.id, disabled: busy || state.paused || (p.id !== state.meId && !p.attackId) || (p.id !== state.meId && p.attackId === me.nightChoice?.attackId),
          // Your own card opens the picker; a teammate's chosen target can be tapped to choose it too.
          'aria-label': p.id === state.meId ? 'Choose Target' : p.attackId ? (p.attackId === me.nightChoice?.attackId ? 'You agree on ' + who(p.attackId) : 'Also choose ' + who(p.attackId)) : who(p.id) + ' has not chosen',
          onclick: () => p.id === state.meId ? pickTeamTarget() : p.attackId && send('night', { attackId: p.attackId }) },
        el('div', { class: 'proposal-target' }, p.attackId ? avatar(p.attackId, 'chosen-avatar') : txt('span', 'choice-symbol', p.selected ? '—' : '?'), avatar(p.id, 'chooser-avatar')),
        txt('b', 'proposal-name', p.attackId ? who(p.attackId) : p.selected ? 'Skip' : 'Choosing…'),
        txt('small', 'proposal-by', (p.id === state.meId ? 'You' : who(p.id)) + (p.selected ? ' chose' : ' · no vote yet')),
        txt('span', 'proposal-tap', p.id === state.meId ? (p.selected ? 'Tap to change' : 'Tap to choose') : p.attackId && p.attackId !== me.nightChoice?.attackId ? 'Tap to agree' : p.attackId ? '✓ Agreed' : '')))),
      walkerPicker(),
      state.settings.footsteps !== false ? el('details', { class: 'team-map', 'data-details': 'team-map', open: true }, el('summary', {}, '🗺️ Carriage Map · Your Team In Red'), carriageMap({})) : null,
      me.role === 'forger' ? me.used.disguise ? txt('p', 'console-hint', 'Disguise used' + (me.nightChoice?.disguiseId ? ': ' + who(me.nightChoice.disguiseId) : '')) : btn('Use Forger Disguise', disguiseTarget, 'secondary', false, 'use-disguise') : null,
      me.role === 'blocker' ? me.used.block ? txt('p', 'console-hint', 'Block used' + (me.nightChoice?.targetId ? ': ' + who(me.nightChoice.targetId) : '')) : btn('Use Blocker Power', blockTarget, 'text-button') : null,
      me.role === 'framer' ? me.used.frame ? txt('p', 'console-hint', 'Frame used' + (me.nightChoice?.frameId ? ': ' + who(me.nightChoice.frameId) : '')) : btn('Use Framer Power', () => chooseTarget('Who will you frame?', 'Once per game. If the Inspector checks them tonight, they read as BAD.', 'night', { power: 'frame' }, { only: p => !isAlly(p.id) }), 'secondary', false, 'use-frame') : null,
      me.role === 'silencer' ? me.used.gag ? txt('p', 'console-hint', 'Gag used' + (me.nightChoice?.gagId ? ': ' + who(me.nightChoice.gagId) : '')) : btn('Gag Someone', () => chooseTarget('Who will you gag?', 'Once per game. They cannot speak in the next lounge, and everyone sees they were gagged.', 'night', { power: 'gag' }), 'secondary', false, 'use-gag') : null,
      me.role === 'smuggler' ? me.used.smuggle ? txt('p', 'console-hint', 'Tonight’s attack is silent.') : btn('Make The Attack Silent', () => send('night', { power: 'smuggle' }), 'secondary', false, 'use-smuggle') : null,
      el('details', { class: 'team-chat', 'data-details': 'team-chat', open: false }, el('summary', {}, 'Whisper To Your Team' + (me.whispers.length ? ' (' + me.whispers.length + ')' : '')), el('div', { class: 'whispers', role: 'log', 'aria-label': 'Private Saboteur chat' }, ...me.whispers.map(m => el('p', {}, el('b', {}, who(m.id) + ': '), el('span', { 'data-no-tr': '' }, m.text)))), el('form', { class: 'whisper-form', onsubmit: async e => { e.preventDefault(); const text = whisperDraft; if (!text.trim()) return; whisperDraft = ''; await send('whisper', { text }); } }, el('input', { id: 'lt-whisper', maxLength: 160, value: whisperDraft, placeholder: 'Only your bad team can read this', 'aria-label': 'Whisper To Your Team', disabled: busy, oninput: e => whisperDraft = e.target.value }), el('button', { type: 'submit', disabled: busy, 'data-focus': 'send-whisper' }, 'Send'))));
  }
  function medicineButton(kind, label, click, disabled) {
    const n = btn(label, click, kind === 'heal' ? 'heal' : 'danger', disabled);
    n.setAttribute('aria-label', label);
    // A glass-vial card: the bottle floats over a glow, with what it does and how many are left.
    const left = state.me.medicine?.[kind] ?? 0, patient = state.me.patientId;
    n.classList.add('medicine-card', 'med-' + kind);
    n.replaceChildren(el('span', { class: 'med-art', 'aria-hidden': 'true' }, el('img', { class: 'medicine-icon', src: '/last-train/medicine-' + kind + '.svg', alt: '', width: 64, height: 64 })),
      el('span', { class: 'med-copy' }, txt('b', '', kind === 'heal' ? 'Heal' : 'Poison'), txt('small', '', kind === 'heal' ? (patient ? 'Save ' + who(patient) : 'Nobody to save') : 'Choose anyone')),
      txt('span', 'med-left', left + ' left'));
    return n;
  }
  const nightNotesKey = () => 'lt-night-notes:' + [state.code, state.meId, state.match].join(':');
  const nightNotes = () => ({ marks: {}, stories: {}, people: {}, tags: {}, ...(read(nightNotesKey()) || {}) });
  // Optional tags beside Trust / Unsure / Suspect: could have walked past my door, and a clashing role claim.
  function noteTags(p) {
    const mine = nightNotes().tags[p.id] || [];
    return el('div', { class: 'note-tags', role: 'group', 'aria-label': 'Tags for ' + p.name }, ...(window.TRAIN_ART.noteTags || []).map(([value, label, art]) => {
      const tag = el('button', { type: 'button', class: 'note-tag ' + value, 'aria-pressed': String(mine.includes(value)), disabled: state.paused, 'data-focus': 'tag-' + p.id + '-' + value,
        onclick: () => { const cur = nightNotes().tags[p.id] || []; updateNightNotes({ tags: { ...nightNotes().tags, [p.id]: cur.includes(value) ? cur.filter(x => x !== value) : [...cur, value] } }); render(); } }, el('span', { class: 'note-tag-icon' }), txt('small', '', label));
      tag.firstChild.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + art + '</svg>'; return tag; }));
  }
  // The footsteps clue can tag every cabin it names in one tap.
  function tagFootsteps(r) {
    const ids = state.players.filter(p => r.from.includes(p.seat) && p.id !== state.meId).map(p => p.id), tags = { ...nightNotes().tags };
    for (const id of ids) tags[id] = [...new Set([...(tags[id] || []), 'steps'])];
    updateNightNotes({ tags }); render();
  }
  // The cabin notebook, the carriage map and the Notes popup share these marks; each change tells the others to redraw.
  function updateNightNotes(change) { save(nightNotesKey(), { ...nightNotes(), ...change }); dispatchEvent(new CustomEvent('lt-notes-change', { detail: 'game' })); }
  addEventListener('lt-notes-change', e => { document.querySelectorAll('.loop-map').forEach(m => m.repaintMarks?.()); if (e.detail !== 'game' && state && seat) render(); });
  const coverStory = () => nightNotes().stories?.[state.round] || '';
  function nightNotebook() {
    const notes = nightNotes(), preparingStory = state.me.group === 'saboteur' && state.nightPhase === 2;
    return el('section', { class: 'night-notebook', 'aria-label': 'Private night notebook' },
      txt('span', 'eyebrow', 'YOUR PRIVATE NIGHT NOTEBOOK'),
      el('h2', {}, preparingStory ? 'Prepare your cover story.' : 'Who do you trust?'),
      txt('p', 'console-hint', 'Optional. Only you can see this, on this device. It never casts a vote.'),
      !preparingStory ? el('div', { class: 'night-trust-list' }, ...state.players.filter(p => p.alive && p.id !== state.meId).map(p =>
        el('div', { class: 'night-trust-row' }, avatar(p), txt('span', '', p.name),
          el('div', { class: 'trust-chips', role: 'group', 'aria-label': 'Your view of ' + p.name }, ...[['trust', 'Trust'], ['unsure', 'Unsure'], ['suspect', 'Suspect']].map(([value, label]) => {
            const chip = el('button', { type: 'button', class: 'trust-chip ' + value, 'aria-pressed': String((notes.marks?.[p.id] || 'unsure') === value), disabled: state.paused, 'data-focus': 'trust-' + p.id + '-' + value,
              onclick: () => { updateNightNotes({ marks: { ...nightNotes().marks, [p.id]: value } }); render(); } }, txt('span', 'trust-icon', ''), txt('small', '', label));
            chip.firstChild.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' + window.TRAIN_ART.trustLines[value] + '</svg>'; return chip; })),
          noteTags(p),
          // A clue or claim per traveller, shared with Notes · People on this device.
          el('input', { id: 'night-clue-' + p.id, class: 'night-clue', maxLength: 80, value: notes.people?.[p.id] || '', placeholder: 'Clues or claims…', autocomplete: 'off', 'aria-label': 'Clues or claims about ' + p.name, disabled: state.paused,
            oninput: e => updateNightNotes({ people: { ...(nightNotes().people || {}), [p.id]: e.target.value } }) })))) :
        el('div', { class: 'night-question' },
          txt('p', 'console-hint', 'What will you tell the group? Write your made-up story here to remember it during discussion.'),
          el('ul', { class: 'cover-tips' }, txt('li', '', 'Claim a role that is in tonight’s mix, but not one a teammate is claiming.'),
            txt('li', '', 'Keep it small: one thing you did or saw. Big claims get checked.'), txt('li', '', 'Point gently at someone who is not on your team.')),
          phraseBar('story'),
          el('label', { htmlFor: 'night-cover-story' }, 'Your private cover story'),
          el('textarea', { id: 'night-cover-story', rows: 4, maxLength: 280, value: coverStory(), disabled: state.paused,
            placeholder: 'What did you claim to see or do tonight?', oninput: e => updateNightNotes({ stories: { ...nightNotes().stories, [state.round]: e.target.value } }) })),
      txt('p', 'console-hint', 'Saved on this device. You can also open Notes to write or draw.'));
  }
  // Phase 1: good travellers flip a coin (up to twice). Heads means they listen at the door tonight.
  let flipsSeen = 0, flipsKey = '', flipAt = 0, revealCap = null;
  const COIN = side => '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="coin-' + side + '" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff3c0"/><stop offset=".55" stop-color="#e9b84a"/><stop offset="1" stop-color="#a8721e"/></radialGradient></defs><circle cx="32" cy="32" r="30" fill="url(#coin-' + side + ')" stroke="#7a4c14" stroke-width="2"/><circle cx="32" cy="32" r="24" fill="none" stroke="#fff6d0" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="2 3"/>'
    + (side === 'heads' ? '<g fill="none" stroke="#6a3d10" stroke-width="1.7" stroke-linecap="round"><path d="M15.5 41.5q-4.5-9.5 1-19M48.5 41.5q4.5-9.5-1-19M14.2 36.8l3.2-.9M13.6 31.6l3.1.3M14.8 26.6l2.8 1.1M49.8 36.8l-3.2-.9M50.4 31.6l-3.1.3M49.2 26.6l-2.8 1.1"/></g><g transform="translate(0 1.9)" fill="#5e360c"><path d="M29 18.5v-3.2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3.2z"/><rect x="21.5" y="18.5" width="21" height="22" rx="5.5"/><rect x="25" y="22" width="14" height="7.5" rx="2" fill="#fff3c0"/><path d="M32 22v7.5" stroke="#5e360c" stroke-width="1.2"/><circle cx="26.6" cy="35" r="2.3" fill="#fff3c0"/><circle cx="37.4" cy="35" r="2.3" fill="#fff3c0"/><rect x="30" y="33.6" width="4" height="2.8" rx="1" fill="#c9963a"/><path d="M21.5 40.5h21l-3 5.5h-15z"/><path d="M26 43.3h12" stroke="#c9963a" stroke-width="1"/></g>'
    : '<path d="M38 18a14 14 0 1 0 8 25 12 12 0 0 1-8-25z" fill="#6a3d10" opacity=".85"/><text x="40" y="30" font-family="Inter,sans-serif" font-weight="900" font-size="9" fill="#6a3d10">z</text><text x="45" y="23" font-family="Inter,sans-serif" font-weight="900" font-size="7" fill="#6a3d10">z</text>') + '</svg>';
  function listenCard() {
    const me = state.me; if (state.settings.footsteps === false || state.nightPhase !== 1 || !me.alive || me.group === 'saboteur' || me.observer) return null;
    // While the big toss plays, the card keeps showing the flips from before it.
    const real = me.listen || { flips: [], heads: false }, flips = real.flips.slice(0, revealCap ?? real.flips.length), l = { flips, heads: flips.at(-1) === 'heads' };
    const left = 2 + (real.bonus || 0) - l.flips.length, last = l.flips.at(-1), key = [state.code, state.match, state.round].join(':');
    if (key !== flipsKey) { flipsKey = key; flipsSeen = l.flips.length; rubs = 0; ear.progress = 0; ear.pos = .2; ear.vel = 0; }
    const fresh = l.flips.length > flipsSeen; flipsSeen = l.flips.length; if (fresh) flipAt = Date.now();
    // Re-renders continue the same spin instead of restarting it.
    const spinning = last && Date.now() - flipAt < 1100;
    const coin = el('div', { class: 'coin' + (spinning ? ' spin-' + last : '') + (last ? ' show-' + last : ''), style: spinning ? 'animation-delay:-' + (Date.now() - flipAt) + 'ms' : '' }, el('span', { class: 'coin-face heads' }), el('span', { class: 'coin-face tails' }));
    coin.children[0].innerHTML = COIN('heads'); coin.children[1].innerHTML = COIN('tails');
    if (fresh && revealCap === null && !motionOK) sfx.play('coin');
    // Out of flips: rub the coin 15 times for luck to earn one more.
    const rubbing = !l.heads && !left && (real.bonus || 0) < RUB_TAPS.length && revealCap === null, RUBS = RUB_TAPS[real.bonus || 0];
    if (rubbing) { coin.classList.add('rubbable'); coin.setAttribute('role', 'button'); coin.setAttribute('aria-label', 'Rub the coin for luck, ' + rubs + ' of ' + RUBS); coin.tabIndex = 0; coin.onclick = rubCoin; coin.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rubCoin(); } }; }
    const sharp = l.heads && real.sharp;
    return el('section', { class: 'listen-card' + (l.heads ? ' listening' : '') + (rubbing ? ' rubbing' : '') }, coin, el('div', { class: 'listen-copy' }, txt('span', 'eyebrow', 'LISTEN AT YOUR DOOR'),
      el('h3', {}, sharp ? 'Sharp ears tonight.' : l.heads ? 'Heads! You’re listening tonight.' : rubbing ? (real.bonus ? 'Rub harder for one last flip.' : 'Rub the coin for luck.') : last === 'tails' && !left ? 'Tails again. You dozed off.' : last === 'tails' ? 'Tails. Try once more?' : 'Flip a coin to stay awake.'),
      txt('p', '', sharp ? 'Footsteps will narrow to the nearest cabins, and you’ll hear which side a lock clicks.' : l.heads ? 'Optional: press your ear to the door. Keep the line in the green to get sharp ears.' : rubbing ? 'Tap the coin ' + RUBS + ' times to earn ' + (real.bonus ? 'a fourth' : 'a third') + ' flip.' : !left ? 'You won’t hear anything tonight.' : 'Heads: you listen for footsteps tonight.' + (real.bonus ? ' One lucky flip left.' : ' You get two tries.')),
      rubbing ? el('div', { class: 'rub-meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(RUBS), 'aria-valuenow': String(rubs) }, el('i', { style: 'width:' + (rubs / RUBS * 100) + '%' }), txt('b', '', rubs + ' / ' + RUBS)) : null,
      l.heads && !sharp ? earGame() : null,
      !l.heads && left ? btn(real.bonus && l.flips.length >= 2 ? 'Flip Your Lucky Coin' : l.flips.length ? 'Flip Again (1 Left)' : 'Flip The Coin', flipCoin, 'gold flip-button', busy || state.paused || revealCap !== null, 'flip-coin') : null));
  }
  // Taps to earn the third and fourth flips (matching the rules).
  const RUB_TAPS = [15, 25]; let rubs = 0;
  function rubCoin() {
    const RUBS = RUB_TAPS[state.me.listen?.bonus || 0]; if (busy || state.paused || !RUBS || rubs >= RUBS) return;
    rubs++; sfx.play(rubs === RUBS ? 'chime' : 'tick'); if (ui.haptics) try { navigator.vibrate?.(8); } catch {}
    const coin = root.querySelector('.listen-card .coin'); coin?.animate([{ transform: 'rotate(-12deg) scale(1.05)' }, { transform: 'rotate(10deg)' }, { transform: 'none' }], { duration: 220 });
    // The meter stays full while the new flip is earned, then empties once it arrives.
    if (rubs === RUBS) { render(); send('earnFlip').finally(() => { rubs = 0; render(); }); } else render();
  }
  // Ear to the door: hold to press closer (the needle moves left), let go and the train's rattle pushes it right.
  // Keep the needle in the quiet zone for 8 seconds in total to get sharp ears.
  const ear = { pos: .2, vel: 0, progress: 0, holding: false, raf: 0, last: 0, done: false };
  const EAR_GOAL = 8, QUIET = [.38, .62];
  function earGame() {
    const knob = el('i', { class: 'ear-needle' }), fill = el('i', { class: 'ear-fill' });
    const hold = el('button', { type: 'button', class: 'ear-hold' + (ear.holding ? ' down' : ''), 'data-focus': 'ear-hold', disabled: state.paused }, txt('span', '', '👂'), txt('b', '', 'Hold To Lean In'));
    // The page redraws often, so letting go is heard on the whole window, not just this button.
    const press = on => e => { e.preventDefault(); ear.holding = on; root.querySelector('.ear-hold')?.classList.toggle('down', on);
      if (on) for (const t of ['pointerup', 'pointercancel', 'blur']) addEventListener(t, press(false), { once: true }); };
    hold.addEventListener('pointerdown', press(true)); hold.addEventListener('contextmenu', e => e.preventDefault());
    hold.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') press(true)(e); }); hold.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') press(false)(e); });
    if (!ear.raf) { ear.last = performance.now(); ear.raf = requestAnimationFrame(earTick); }
    return el('div', { class: 'ear-game' }, el('div', { class: 'ear-track', 'aria-hidden': 'true' }, el('span', { class: 'ear-quiet', style: 'left:' + QUIET[0] * 100 + '%;width:' + (QUIET[1] - QUIET[0]) * 100 + '%' }), knob),
      txt('small', 'ear-hint', 'Hold to lean in (moves left), let go to ease off. Fill the bar below.'),
      el('div', { class: 'ear-progress', role: 'progressbar', 'aria-label': 'Listening steadily', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(ear.progress / EAR_GOAL * 100)) }, fill), hold);
  }
  function earTick(now) {
    const game = root.querySelector('.ear-game'); if (!game || !state || state.paused) { ear.raf = 0; ear.holding = false; return; }
    const dt = Math.min(.05, (now - ear.last) / 1000); ear.last = now;
    // Holding pushes left; the rattle pushes right with a little random shake.
    ear.vel += ((ear.holding ? -1.1 : .9) + (Math.random() - .5) * 2.4) * dt; ear.vel *= .96; ear.pos = Math.min(1, Math.max(0, ear.pos + ear.vel * dt * 1.6));
    if (ear.pos <= 0 || ear.pos >= 1) ear.vel *= -.3;
    const quiet = ear.pos >= QUIET[0] && ear.pos <= QUIET[1];
    ear.progress = Math.max(0, ear.progress + (quiet ? dt : -dt * .35));
    game.querySelector('.ear-needle').style.left = (ear.pos * 100) + '%'; game.classList.toggle('quiet', quiet);
    game.querySelector('.ear-fill').style.width = Math.min(100, ear.progress / EAR_GOAL * 100) + '%';
    if (ear.progress >= EAR_GOAL && !ear.done) { ear.done = true; ear.raf = 0; sfx.play('chime'); send('sharpen').finally(() => { ear.done = false; }); return; }
    ear.raf = requestAnimationFrame(earTick);
  }
  async function flipCoin() {
    const from = root.querySelector('.listen-card .coin')?.getBoundingClientRect(), before = state.me.listen?.flips.length || 0;
    revealCap = before; await send('listen');
    const after = state?.me.listen?.flips || [];
    if (after.length > before && motionOK && from) await tossCoin(from, after.at(-1));
    revealCap = null; flipsSeen = after.length; flipAt = 0; render();
  }
  // The big toss: the coin flies to the middle, grows, then is thrown up spinning end over end at a steady rate,
  // shows its edge as it turns, lands with a bounce and wobbles to rest on the result.
  function tossCoin(from, side) {
    return new Promise(done => {
      const layer = el('div', { class: 'toss-layer', 'aria-hidden': 'true' }), shadow = el('i', { class: 'toss-shadow' });
      const spin = el('div', { class: 'toss-spin' }, el('span', { class: 'coin-face heads' }), el('span', { class: 'coin-face tails' }));
      const tilt = el('div', { class: 'toss-tilt' }, spin), coin = el('div', { class: 'toss-coin' }, tilt);
      spin.querySelector('.heads').innerHTML = COIN('heads'); spin.querySelector('.tails').innerHTML = COIN('tails');
      const label = el('div', { class: 'toss-result ' + side }, txt('b', '', side === 'heads' ? 'HEADS' : 'TAILS'), txt('small', '', side === 'heads' ? 'You’re listening tonight' : (state.me.listen?.flips.length || 0) < 2 ? 'One more try' : 'You dozed off'));
      layer.append(shadow, coin, label); document.body.append(layer);
      const size = 72, cx = innerWidth / 2, cy = innerHeight * .58, sx = from.left + from.width / 2, sy = from.top + from.height / 2, big = Math.min(2.6, innerWidth * .46 / size), high = Math.min(innerHeight * .4, 340);
      coin.style.left = cx - size / 2 + 'px'; coin.style.top = cy - size / 2 + 'px';
      // Timeline (ms): fly to centre 0–650, rise 650–1650, fall 1650–2550, bounce 2550–2900, wobble to rest by 3500, label until 4400.
      const T = 4400, k = ms => ms / T, at = (x, y, s) => `translate(${x - cx}px, ${y - cy}px) scale(${s})`;
      layer.animate([{ opacity: 0 }, { opacity: 1, offset: .1 }, { opacity: 1, offset: .9 }, { opacity: 0 }], { duration: T, fill: 'both' });
      coin.animate([
        { transform: at(sx, sy, from.width / size), easing: 'cubic-bezier(.3,.7,.3,1)' },
        { transform: at(cx, cy, big), offset: k(650) },
        { transform: at(cx, cy, big), offset: k(700), easing: 'cubic-bezier(.15,.7,.35,1)' },
        { transform: at(cx, cy - high, big * .92), offset: k(1650), easing: 'cubic-bezier(.65,0,.85,.35)' },
        { transform: at(cx, cy, big), offset: k(2550), easing: 'cubic-bezier(.2,.7,.4,1)' },
        { transform: at(cx, cy - 22, big), offset: k(2720), easing: 'cubic-bezier(.6,0,.8,.4)' },
        { transform: at(cx, cy, big), offset: k(2900) },
        { transform: at(cx, cy, big) }], { duration: T, fill: 'forwards' });
      // A steady spin in the air (about 4½ turns), ending on the result, then a damped wobble as it settles.
      const end = 4 * 360 + (side === 'tails' ? 180 : 0);
      spin.animate([
        { transform: 'rotateX(0deg)' }, { transform: 'rotateX(0deg)', offset: k(700) },
        { transform: `rotateX(${end - 40}deg)`, offset: k(2550) },
        { transform: `rotateX(${end + 24}deg)`, offset: k(2780), easing: 'ease-in-out' },
        { transform: `rotateX(${end - 12}deg)`, offset: k(3020), easing: 'ease-in-out' },
        { transform: `rotateX(${end + 5}deg)`, offset: k(3260), easing: 'ease-in-out' },
        { transform: `rotateX(${end}deg)`, offset: k(3500) },
        { transform: `rotateX(${end}deg)` }], { duration: T, fill: 'forwards' });
      // A slight sideways lean in the air so the coin's edge catches the light.
      tilt.animate([{ transform: 'rotateY(0deg) rotateZ(0deg)' }, { transform: 'rotateY(0deg) rotateZ(0deg)', offset: k(700) }, { transform: 'rotateY(16deg) rotateZ(-8deg)', offset: k(1650) }, { transform: 'rotateY(-10deg) rotateZ(6deg)', offset: k(2550) }, { transform: 'rotateY(0deg) rotateZ(0deg)', offset: k(3300) }, { transform: 'rotateY(0deg) rotateZ(0deg)' }], { duration: T, fill: 'forwards' });
      shadow.style.top = cy + size * big / 2 + 8 + 'px';
      shadow.animate([{ opacity: 0, transform: 'translate(-50%, 0) scale(.4)' }, { opacity: .55, transform: 'translate(-50%, 0) scale(1)', offset: k(650) }, { opacity: .55, transform: 'translate(-50%, 0) scale(1)', offset: k(700) }, { opacity: .12, transform: 'translate(-50%, 0) scale(.4)', offset: k(1650) }, { opacity: .6, transform: 'translate(-50%, 0) scale(1.05)', offset: k(2550) }, { opacity: .45, transform: 'translate(-50%, 0) scale(.85)', offset: k(2720) }, { opacity: .6, transform: 'translate(-50%, 0) scale(1)', offset: k(2900) }, { opacity: .6, transform: 'translate(-50%, 0) scale(1)' }], { duration: T, fill: 'forwards' });
      label.style.top = cy + size * big / 2 + 32 + 'px';
      label.animate([{ opacity: 0, transform: 'translate(-50%, 10px) scale(.8)' }, { opacity: 0, transform: 'translate(-50%, 10px) scale(.8)', offset: k(3250) }, { opacity: 1, transform: 'translate(-50%, 0) scale(1.08)', offset: k(3500) }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: k(3650) }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)' }], { duration: T, fill: 'forwards' });
      setTimeout(() => sfx.play('coin'), 650); setTimeout(() => sfx.play('tick'), 2550); setTimeout(() => sfx.play(side === 'heads' ? 'chime' : 'tick'), 3450);
      setTimeout(() => { layer.remove(); done(); }, T);
    });
  }
  function actionConsole() {
    const me = state.me, active = state.nightRole;
    if (state.paused) return el('section', { class: 'rest-note' }, txt('span','','Ⅱ'), el('h2', {}, 'Time stands still.'), txt('p', '', 'The host has paused the journey.'));
    if (!me.alive) return el('section', { class: 'rest-note' }, txt('span','','🎟️'), el('h2', {}, 'Your journey is over.'), txt('p', '', 'Watch quietly. The living players still have a train to save.'), ghostBlock());
    if (active === 'saboteur' && me.group === 'saboteur') return badConsole();
    if (active !== me.role && state.nightPhase) return el('section', { class: 'rest-note' }, txt('span', 'sleep-icon', '☾'), el('h2', {}, 'Keep your thoughts private.'), txt('p', '', 'Use your night notebook while the timer runs.'));
    if (active !== me.role) return el('section', { class: 'rest-note' }, txt('span', 'sleep-icon', '☾'), el('h2', {}, 'Rest in your cabin.'), txt('p', '', roleName(active) + ' are taking their turn. Keep your eyes closed and your role secret.'));
    if (active === 'medic') {
      const stock = txt('p', 'medicine-counts', 'HEAL ' + me.medicine.heal + '   /   POISON ' + me.medicine.poison);
      if (me.blocked) return el('section', { class: 'action-console' }, stock, el('h2', {}, 'Your medicine is blocked.'), txt('p', '', 'No patient is shown. No medicine is spent tonight.'));
      if (me.medicineChoice) return el('section', { class: 'action-console' }, stock, txt('p', 'choice-saved', ({ heal: 'Medicine given.', poison: 'Poison delivered.', pass: 'You kept your medicine.' }[me.medicineChoice.power])), txt('p', 'console-hint', 'Use your private night notebook while the timer runs.'));
      return el('section', { class: 'action-console medic-console' }, stock, el('div', { class: 'patient-heading' }, me.patientId ? avatar(me.patientId) : null, el('h2', {}, me.patientId ? who(me.patientId) + ' was attacked.' : 'No one was attacked.')), txt('p', 'console-hint', 'Heal, poison, or Skip. Only one medicine tonight.'),
        medicineButton('heal', 'Heal ' + (me.patientId ? who(me.patientId) : 'someone'), () => send('medicine', { power: 'heal' }), !me.patientId || !me.medicine.heal), medicineButton('poison', 'Poison Someone', () => chooseTarget('Who will you poison?', 'They will be out tonight, even if protected. You might choose a good player.', 'medicine', { power: 'poison' }), !me.medicine.poison), btn('Skip', () => send('medicine', { power: 'pass' }), 'secondary skip-power'), txt('p', 'overdose-hint', 'If Brave also protects your healed patient, that player dies from overdose.'));
    }
    if (me.nightChoice) return el('section', { class: 'action-console' }, currentPrivateResult() ? privateResultCard(currentPrivateResult()) : txt('p', 'choice-saved', 'Your turn is complete.'), txt('p', 'console-hint', 'Use your private night notebook while the timer runs.'));
    if (active === 'witness') {
      if (!me.sightsLeft) return el('section', { class: 'action-console' }, el('h2', {}, 'You have used both sightings.'), txt('p', 'console-hint', 'Use your private night notebook to prepare for the lounge.'));
      if (state.event?.key === 'power-cut') return el('section', { class: 'action-console' }, el('h2', {}, 'Power cut tonight.'), txt('p', 'console-hint', 'Sightings do not work tonight. Your sightings are not spent.'));
      return el('section', { class: 'action-console power-console witness-console' }, rolePortrait(me.role, 'console-role-icon'), el('h2', {}, 'Use a sighting tonight?'),
        txt('p', 'power-limit', me.sightsLeft + (me.sightsLeft === 1 ? ' sighting left' : ' sightings left') + ' · twice per game'),
        el('div', { class: 'sight-options' },
          sightCard('watch', 'Watch', 'See who the Saboteurs attack tonight, even if they are saved.', () => send('night', { power: 'watch' })),
          sightCard('glimpse', 'Glimpse', state.saboteurCount === 1 ? 'See three faces in the corridor. One of them is the Saboteur.' : 'See two faces in the corridor. One of them is a Saboteur.', () => send('night', { power: 'glimpse' }))),
        btn('Skip', () => send('night', { power: 'pass' }), 'secondary skip-power'));
    }
    if (active === 'inspector' && state.event?.key === 'power-cut') return el('section', { class: 'action-console' }, el('h2', {}, 'Power cut tonight.'), txt('p', 'console-hint', 'Checks do not work tonight. Try again next night.'));
    const power = POWER_OF[active];
    if (NEW_CREW[active]) return crewConsole(active);
    if (me.used[power]) return el('section', { class: 'action-console' }, el('h2', {}, 'Your power is already used.'), txt('p', 'console-hint', 'Use your private night notebook to prepare for the lounge.'));
    return el('section', { class: 'action-console power-console' }, rolePortrait(me.role, 'console-role-icon'), el('h2', {}, { brave: 'Who needs protection?', careful: 'Lock your door tonight?', inspector: 'Who will you check?', witness: 'Watch tonight’s attack?' }[active]),
      el('div', { class: 'power-description' }, txt('p', 'power-limit', active === 'inspector' ? 'Every night.' : 'Once per game.'),
        txt('p', 'console-hint', active === 'brave' ? 'Protection + Medic’s heal causes a deadly overdose. You walk to their cabin, so someone may hear your footsteps.' : active === 'inspector' ? 'See GOOD or BAD as soon as you choose.' : active === 'careful' ? 'Stops an attack on you, but not poison or overdose.' : 'See the original attack target immediately.')),
      el('div', { class: 'power-buttons' },
        btn({ brave: 'Choose', careful: 'Lock Door', inspector: 'Choose', witness: 'Watch' }[active], () => ['brave','inspector'].includes(active) ? chooseTarget(active === 'brave' ? 'Who will you protect?' : 'Who will you check?', active === 'brave' ? 'If they are also healed, they die from overdose.' : 'You see GOOD or BAD immediately after choosing.', 'night', { power }) : send('night', { power }), 'gold'),
        btn('Skip', () => send('night', { power: 'pass' }), 'secondary skip-power')));
  }
  // The newer Crew jobs share one console: a heading, how often, what happens, and Choose (or Call) plus Skip.
  const POWER_OF = { brave: 'cover', careful: 'lock', inspector: 'check', witness: 'watch', conductor: 'manifest', porter: 'post', guard: 'guard', steward: 'pill', signalman: 'signal' };
  const NEW_CREW = {
    conductor: { title: 'Whose ticket will you check?', limit: 'Every night.', hint: 'See straight away whether they left their cabin tonight. Attackers and protectors walk; a Forger’s disguise hides a walk.', pick: 'Whose ticket will you check?', pickHint: 'You learn WALKED or STAYED IN as soon as you choose.' },
    porter: { title: 'Which door will you watch?', limit: 'Every night · a new door each night.', hint: 'In the morning you learn who came to that door. You walk there too, so you may be heard.', pick: 'Which door will you watch?', pickHint: 'You learn who came to their door by morning.' },
    guard: { title: 'Who will you guard?', limit: 'Every night · someone new each night.', hint: 'If they are attacked and nothing else saves them, you take the attack and are out instead.', pick: 'Who will you guard?', pickHint: 'If they are attacked, you take it for them.' },
    steward: { title: 'Who gets a sleeping pill?', limit: 'Every night · someone new each night.', hint: 'Their night power does nothing tonight, but nobody can attack them.', pick: 'Who gets a sleeping pill?', pickHint: 'No power tonight for them, but they are safe from the attack.' },
    signalman: { title: 'Call a Signal Stop?', limit: 'Once per game.', hint: 'In the next vote a tie removes nobody, and there is no re-vote. Everyone sees the signal in the morning.' },
  };
  function crewConsole(active) {
    const me = state.me, c = NEW_CREW[active], power = POWER_OF[active];
    if (active === 'signalman' && me.used.signal) return el('section', { class: 'action-console' }, el('h2', {}, 'Your power is already used.'), txt('p', 'console-hint', 'Use your private night notebook to prepare for the lounge.'));
    return el('section', { class: 'action-console power-console crew-console crew-' + active }, rolePortrait(me.role, 'console-role-icon'), el('h2', {}, c.title),
      el('div', { class: 'power-description' }, txt('p', 'power-limit', c.limit), txt('p', 'console-hint', c.hint)),
      el('div', { class: 'power-buttons' },
        btn(active === 'signalman' ? 'Call Signal Stop' : 'Choose', () => active === 'signalman' ? send('night', { power }) : chooseTarget(c.pick, c.pickHint, 'night', { power }), 'gold'),
        btn('Skip', () => send('night', { power: 'pass' }), 'secondary skip-power')));
  }
  // Lying figures overhang their 362px atlas cells, so each is cropped from its own measured left edge (396px wide).
  function patientCrop(index) {
    const row = Math.floor(index / 4), col = index % 4;
    const left = [[18,386,728,1104],[2,374,734,1094],[6,388,728,1096]][row][col], right = [[380,746,1098,1442],[380,746,1114,1446],[388,740,1108,1446]][row][col];
    const start = Math.max(0, Math.min(1448 - 396, left - 8));
    // Neighbouring figures overlap the crop, so clip to this figure's own extent.
    return { x: start / (1448 - 396) * 100, clip: 'inset(0 ' + Math.max(0, (start + 396 - right - 3) / 396 * 100) + '% 0 ' + Math.max(0, (left - 3 - start) / 396 * 100) + '%)' };
  }
  function patientScene() {
    const me = state.me;
    if (state.phase !== 'night' || state.nightRole !== 'medic' || me.role !== 'medic' || !me.alive || me.blocked || !me.patientId) return null;
    const p = player(me.patientId), index = p.avatarIndex ?? p.seat - 1;
    return el('div', { class: 'patient-scene' + (me.medicineChoice?.power === 'heal' ? ' treated' : ''), 'data-patient': p.id, 'aria-label': p.name + ' is unconscious on the cabin floor' },
      el('div', { class: 'patient-body', 'data-avatar-index': index, 'aria-hidden': 'true', style: 'clip-path:' + patientCrop(index).clip + ';--px:' + patientCrop(index).x + '%;--py:' + ([100,436,752][Math.floor(index / 4)] / 806 * 100) + '%;--patient-x-size:' + (1448 / 396 * 100) + '%;--patient-y-size:' + (1086 / 280 * 100) + '%' }),
      txt('span', 'patient-floor-label', p.name + (me.medicineChoice?.power === 'heal' ? ' · HEAL GIVEN' : ' · ATTACKED')));
  }
  // The role at a glance in the cabin corner. Tap to hide it if someone can see your screen.
  function ticketChip() {
    let hidden = false; try { hidden = sessionStorage.getItem('lt-chip-hidden') === '1'; } catch {}
    const chip = el('button', { type: 'button', class: 'ticket-chip' + (hidden ? ' hidden-role' : ''), 'data-focus': 'ticket-chip', 'aria-label': hidden ? 'Show my role here' : 'Your role: ' + role(state.me.role).name + '. Tap to hide', onclick: () => { try { sessionStorage.setItem('lt-chip-hidden', hidden ? '0' : '1'); } catch {} render(); } },
      hidden ? txt('span', 'chip-hidden', '🎟️') : rolePortrait(state.me.role, 'chip-portrait'), el('span', {}, txt('small', '', 'YOUR TICKET'), hidden ? 'Tap to show' : role(state.me.role).name));
    return chip;
  }
  // The carriage map: cabins (seat numbers) around a looped corridor, in a 340 × 230 drawing.
  function loopLayout(count) {
    const top = Math.ceil((count - 2) / 2), bottom = count - 2 - top, spots = {};
    for (let i = 0; i < top; i++) { const x = 60 + 220 * (i + .5) / top; spots[i + 1] = { x, y: 34, cx: x, cy: 74 }; }
    spots[top + 1] = { x: 314, y: 115, cx: 276, cy: 115 };
    for (let i = 0; i < bottom; i++) { const x = 60 + 220 * (bottom - i - .5) / bottom; spots[top + 2 + i] = { x, y: 196, cx: x, cy: 156 }; }
    spots[count] = { x: 26, y: 115, cx: 64, cy: 115 };
    return spots;
  }
  // The corridor's centre line: a stadium (two straights and two half circles), measured clockwise from the top left.
  // The corridor band runs between the outer track (y 62–168) and the lounge (y 88–142), so steps walk its middle, clear of the cabins.
  const LOOP = { x1: 107, x2: 233, y1: 75, y2: 155, r: 40 }, LOOP_ARC = Math.PI * LOOP.r, LOOP_LEN = 2 * (LOOP.x2 - LOOP.x1) + 2 * LOOP_ARC;
  function loopPoint(t) {
    const S = LOOP.x2 - LOOP.x1; t = ((t % LOOP_LEN) + LOOP_LEN) % LOOP_LEN;
    if (t < S) return { x: LOOP.x1 + t, y: LOOP.y1 };
    if ((t -= S) < LOOP_ARC) { const a = -Math.PI / 2 + t / LOOP.r; return { x: LOOP.x2 + LOOP.r * Math.cos(a), y: 115 + LOOP.r * Math.sin(a) }; }
    if ((t -= LOOP_ARC) < S) return { x: LOOP.x2 - t, y: LOOP.y2 };
    t -= S; const a = Math.PI / 2 + t / LOOP.r; return { x: LOOP.x1 + LOOP.r * Math.cos(a), y: 115 + LOOP.r * Math.sin(a) };
  }
  function loopPosition(pt) { let best = 0, dist = Infinity; for (let t = 0; t < LOOP_LEN; t += 1) { const q = loopPoint(t), d = Math.hypot(q.x - pt.x, q.y - pt.y); if (d < dist) { dist = d; best = t; } } return best; }
  // A walk follows the corridor from door to door, the short way round between each pair of cabins.
  function corridorPath(cabins, spots) {
    const pts = []; const ts = cabins.map(c => loopPosition({ x: spots[c].cx, y: spots[c].cy }));
    for (let i = 1; i < ts.length; i++) {
      const fwd = ((ts[i] - ts[i - 1]) % LOOP_LEN + LOOP_LEN) % LOOP_LEN, dir = fwd <= LOOP_LEN / 2 ? 1 : -1, len = dir > 0 ? fwd : LOOP_LEN - fwd;
      for (let d = 0; d <= len; d += 4) pts.push(loopPoint(ts[i - 1] + dir * d));
    }
    return pts;
  }
  function footprints(points, fade) {
    // Steps every 13 units along the whole path, alternating left and right of the centre line.
    const segs = points.slice(1).map((b, i) => ({ a: points[i], b, len: Math.hypot(b.x - points[i].x, b.y - points[i].y) })).filter(g => g.len > 0);
    const total = segs.reduce((n, g) => n + g.len, 0), gap = 13, out = [];
    let seg = 0, start = 0;
    for (let d = gap / 2, step = 0; d < total; d += gap, step++) {
      while (seg < segs.length - 1 && start + segs[seg].len < d) start += segs[seg++].len;
      const { a, b, len } = segs[seg], t = (d - start) / len, ang = Math.atan2(b.y - a.y, b.x - a.x), side = step % 2 ? 3.2 : -3.2;
      const x = a.x + (b.x - a.x) * t - Math.sin(ang) * side, y = a.y + (b.y - a.y) * t + Math.cos(ang) * side;
      const o = fade ? Math.max(.15, 1 - Math.abs(d / total - .5) * 1.7) : .95;
      out.push('<g transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + (ang * 180 / Math.PI + 90).toFixed(0) + ')" opacity="' + o.toFixed(2) + '"><ellipse cx="0" cy="-2.5" rx="2.6" ry="3.4"/><ellipse cx="0" cy="3.2" rx="2" ry="1.7"/></g>');
    }
    return out.join('');
  }
  function carriageMap({ route = null, walker = null, fade = false, victim = null, walks = null, marks = false } = {}) {
    walks ||= route ? [{ route, by: walker, kind: 'saboteur' }] : [];
    const people = state.players.filter(p => p.seat).sort((a, b) => a.seat - b.seat), spots = loopLayout(people.length);
    const corridor = c => ({ x: spots[c].cx, y: spots[c].cy });

    // Partial routes (a heard clue) only show the steps near the listener's door.
    const svg = '<svg class="loop-art" viewBox="0 0 340 230" aria-hidden="true"><rect x="52" y="62" width="236" height="106" rx="53" class="loop-corridor"/><rect x="82" y="88" width="176" height="54" rx="27" class="loop-lounge"/><text x="170" y="119" class="loop-label">OBSERVATION LOUNGE</text>'
      + walks.map(w => '<g class="loop-steps ' + w.kind + '">' + footprints(corridorPath(w.route, spots), fade) + '</g>').join('') + '</svg>';
    const map = el('div', { class: 'carriage-map loop-map', 'aria-label': 'Carriage map: ' + people.map(p => 'cabin ' + p.seat + ' ' + p.name).join(', ') });
    map.innerHTML = svg;
    // With marks on, each cabin shows your private notebook view (Trust green, Suspect red, tags as badges) and a tap cycles it.
    const notes = marks ? nightNotes() : null, markable = p => marks && p.id !== state.meId && p.alive && !state.me.observer;
    const paintMark = (node, p) => { const m = notes.marks?.[p.id] || 'unsure', tags = notes.tags?.[p.id] || [];
      node.classList.remove('mark-trust', 'mark-suspect'); if (m !== 'unsure') node.classList.add('mark-' + m);
      node.querySelector('.map-badges')?.replaceChildren(...(m === 'trust' ? [txt('i', 'badge-trust', '✓')] : m === 'suspect' ? [txt('i', 'badge-suspect', '!')] : []), ...tags.map(t => txt('i', 'badge-' + t, t === 'steps' ? '👣' : '✕')));
      node.setAttribute('aria-label', 'Cabin ' + p.seat + ', ' + p.name + ': ' + ({ trust: 'trusted', suspect: 'suspected', unsure: 'unsure' }[m]) + '. Tap to change.'); };
    const painted = [];
    for (const p of people) { const s = spots[p.seat], tap = markable(p);
      const cabin = el('div', { class: 'map-cabin' + (p.id === state.meId ? ' you' : '') + (isAlly(p.id) ? ' ally' : '') + (!p.alive && state.phase !== 'lobby' ? ' out' : '') + (victim === p.id ? ' victim' : '') + (tap ? ' markable' : ''), style: 'left:' + (s.x / 3.4) + '%;top:' + (s.y / 2.3) + '%', title: 'Cabin ' + p.seat + ' · ' + p.name,
        ...(tap ? { role: 'button', tabIndex: 0, onclick: () => cycle(), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycle(); } } } : {}) },
        txt('span', 'map-no', String(p.seat).padStart(2, '0')), avatar(p, 'map-face'), txt('span', 'map-name' + (p.id === state.meId ? ' me' : ''), p.name), marks ? el('span', { class: 'map-badges', 'aria-hidden': 'true' }) : null);
      function cycle() { const cur = nightNotes().marks?.[p.id] || 'unsure', next = { unsure: 'trust', trust: 'suspect', suspect: 'unsure' }[cur];
        updateNightNotes({ marks: { ...nightNotes().marks, [p.id]: next } }); notes.marks = nightNotes().marks; paintMark(cabin, p); sfx.play('tap'); render(); }
      if (marks) { paintMark(cabin, p); painted.push([cabin, p]); }
      map.append(cabin); }
    // Any open map (the lounge's or the map popup) repaints when marks change elsewhere.
    if (marks) map.repaintMarks = () => { Object.assign(notes, nightNotes()); painted.forEach(([c, p]) => paintMark(c, p)); };
    for (const w of walks) if (w.by && !fade) { const end = loopPoint(loopPosition(corridor(w.route.at(-1)))); map.append(el('span', { class: 'map-walker ' + w.kind, style: 'left:' + (end.x / 3.4) + '%;top:' + (end.y / 2.3) + '%' }, avatar(w.by, 'map-walker-face'))); }
    if (!marks) return map;
    // A legend under a marked map: what the colours and badges mean.
    return el('div', { class: 'map-with-legend' }, map, el('div', { class: 'map-legend' }, txt('span', 'lg-trust', 'Trust'), txt('span', 'lg-suspect', 'Suspect'), txt('span', 'lg-unsure', 'Unsure'), txt('span', 'lg-steps', '👣 Walk Path'), txt('span', 'lg-clash', '✕ Role Clash'), txt('small', '', 'Tap a cabin to change your mark. Only you see this.')));
  }
  function cabinScene() {
    const me = state.me, settling = state.phase === 'settling';
    const badTogether = !settling && state.nightRole === 'saboteur' && me.alive && me.group === 'saboteur';
    const roommates = badTogether ? me.allies.filter(p => p.alive && p.id !== state.meId).map(p => player(p.id)) : [];
    const patient = patientScene();
    const sceneHud = hud('NIGHT ' + state.round + ' · ' + (badTogether ? 'PRIVATE TEAM CABIN' : 'CABIN ' + String(player(state.meId).seat).padStart(2,'0')), settling ? 'Close your eyes.' : state.nightPhase ? 'Night phase ' + state.nightPhase + ' of 2.' : roleName(state.nightRole) + ', wake up.', settling ? 'Your secret role is on the ticket below.' : state.nightPhase ? '45 seconds for everyone. Make your choices and keep your notes private.' : badTogether ? 'Only your team can see these choices.' : 'Only the active role acts. Everyone else rests.');
    // Where the night is up to: the same two steps on every phone.
    const step = settling ? 0 : state.nightPhase || 1;
    // Shown under the cabin picture so it never covers the travellers.
    // A little rail line: the train travels from Move to Respond to Morning as the night clock runs.
    const STOP_ICONS = {
      1: '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><radialGradient id="st-moon" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff6c8"/><stop offset="1" stop-color="#f2c45a"/></radialGradient></defs><circle cx="16" cy="16" r="15" fill="#1a2156"/><circle cx="16" cy="16" r="15" fill="none" stroke="#3a4a9a" stroke-width="1"/><path d="M19.5 6.5a10 10 0 1 0 6 17.8A8.2 8.2 0 0 1 19.5 6.5z" fill="url(#st-moon)"/><circle cx="13" cy="14" r="1.4" fill="#d9a23a" opacity=".6"/><circle cx="16" cy="21" r="1" fill="#d9a23a" opacity=".5"/><path d="M24 7l.6 1.3 1.4.2-1 1 .2 1.4-1.2-.7-1.2.7.2-1.4-1-1 1.4-.2z" fill="#fff"/><circle cx="26.5" cy="14" r=".8" fill="#fff"/></svg>',
      2: '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><radialGradient id="st-flame" cx=".5" cy=".6" r=".6"><stop offset="0" stop-color="#fff7c0"/><stop offset=".5" stop-color="#ffb43a"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient></defs><circle cx="16" cy="16" r="15" fill="#3a1f12"/><circle cx="16" cy="18" r="11" fill="url(#st-flame)" opacity=".55"/><path d="M12 5.5h8M16 5.5v2.5" stroke="#c9963a" stroke-width="1.8" stroke-linecap="round"/><path d="M11 9h10l1.2 2.4v10.4a2.2 2.2 0 0 1-2.2 2.2h-8a2.2 2.2 0 0 1-2.2-2.2V11.4z" fill="#ffe3a066" stroke="#d9a441" stroke-width="1.6" stroke-linejoin="round"/><path d="M16 13.5c2 1.8 2.6 3.3 2.6 4.6a2.6 2.6 0 0 1-5.2 0c0-1.3.6-2.8 2.6-4.6z" fill="#ff8a1e"/><path d="M16 16c1 .9 1.3 1.6 1.3 2.3a1.3 1.3 0 0 1-2.6 0c0-.7.3-1.4 1.3-2.3z" fill="#fff3b0"/><path d="M9.5 24h13" stroke="#c9963a" stroke-width="2" stroke-linecap="round"/></svg>',
      3: '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="st-dawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b3d8f"/><stop offset=".55" stop-color="#ff8f6b"/><stop offset="1" stop-color="#ffd27a"/></linearGradient><clipPath id="st-clip"><circle cx="16" cy="16" r="15"/></clipPath></defs><g clip-path="url(#st-clip)"><rect width="32" height="32" fill="url(#st-dawn)"/><circle cx="16" cy="20" r="6.5" fill="#fff1a8"/><circle cx="16" cy="20" r="9" fill="#ffe27a" opacity=".35"/><path d="M16 9v2.5M8.5 12l1.6 1.6M23.5 12l-1.6 1.6" stroke="#fff6d0" stroke-width="1.6" stroke-linecap="round"/><path d="M-2 22q8-5 14-1t22-2v15H-2z" fill="#3c2a5a"/><path d="M-2 25q10-4 18 0t18-1v10H-2z" fill="#2a1c42"/></g><circle cx="16" cy="16" r="15" fill="none" stroke="#ffc48a" stroke-width="1"/></svg>',
    };
    const stops = [['Move', 1, 'Attacks & protection'], ['Respond', 2, 'Checks, sightings, medicine'], ['Morning', 3, 'Everyone wakes']];
    const phaseDone = state.phase === 'night' && state.duration ? Math.min(1, Math.max(0, 1 - (state.remainingMs || 0) / 1000 / state.duration)) : 0;
    const steps = el('div', { class: 'night-track' + (step === 2 && phaseDone > .955 ? ' arrived' : ''), 'data-step': step, style: '--step:' + step + ';--phase:' + phaseDone.toFixed(3), 'aria-label': 'Night progress' },
      el('div', { class: 'track-rail', 'aria-hidden': 'true' }, el('i', { class: 'track-fill' })),
      (() => { const t = el('span', { class: 'track-train', 'aria-hidden': 'true' }); t.innerHTML = '<svg viewBox="0 0 44 24"><path d="M4 6h17v12H4z" fill="#f6e4c6"/><path d="M21 9h11a6 6 0 0 1 6 6v3H21z" fill="#e9c46f"/><rect x="7" y="9" width="5" height="4" rx="1" fill="#3a2a55"/><rect x="14" y="9" width="5" height="4" rx="1" fill="#3a2a55"/><path d="M27 9V5h4v4" fill="#e9c46f"/><path d="M2 18h38" stroke="#c9a96a" stroke-width="1.4"/><circle cx="9" cy="20" r="2.6" fill="#2a2340" stroke="#f6e4c6" stroke-width="1.2"/><circle cx="18" cy="20" r="2.6" fill="#2a2340" stroke="#f6e4c6" stroke-width="1.2"/><circle cx="31" cy="20" r="2.6" fill="#2a2340" stroke="#f6e4c6" stroke-width="1.2"/><circle cx="38.5" cy="14.5" r="1.6" fill="#fff6d0"/></svg><i class="puff"></i><i class="puff"></i>'; return t; })(),
      el('ol', { class: 'track-stops' }, ...stops.map(([label, n, sub]) => { const dot = el('span', { class: 'stop-dot' }); dot.innerHTML = STOP_ICONS[n];
        return el('li', { class: 'track-stop ' + (n < step ? 'done' : n === step ? 'on' : 'next'), 'aria-current': n === step ? 'step' : null }, dot, txt('b', '', label), txt('small', '', sub)); })));
    return el('section', { class: 'world cabin-scene' + (badTogether ? ' conspiracy' : '') + (patient ? ' infirmary' : '') + (settling ? ' eyes-closing' : ''), 'aria-label': badTogether ? 'Your Saboteur team shares a private cabin' : 'Your private train cabin' },
      el('div', { class: 'cabin-view' }, art(badTogether || patient ? 'cabin-floor' : 'cabin'), motionOK && !state.paused ? el('div', { class: 'cabin-lights', 'aria-hidden': 'true' }) : null,
        sceneHud, me.role && !settling ? ticketChip() : null,
        el('div', { class: 'cabin-travellers count-' + roommates.length }, ...roommates.map(p => el('div', { class: 'cabin-person', 'data-player': p.id }, seatedTraveller(p), txt('span', '', p.name)))),
        patient),
      settling || state.nightPhase ? steps : null,
      settling ? el('div', { class: 'curtain-message' }, txt('span','','☾'), txt('p','','Settle into your cabin…')) : el('div', { class: 'night-panels' }, listenCard(), actionConsole(), state.nightPhase && me.alive ? nightNotebook() : null));
  }
  const svgPin = () => { const n = el('span', { class: 'pin-svg', 'aria-hidden': 'true' }); n.innerHTML = '<svg viewBox="0 0 32 32">' + TONE_ICONS.pin + '</svg>'; return n; };
  function loungeSeats() {
    const perRow = compactScene.matches ? 4 : 6, tallies = voteTallies(), topVotes = Math.max(0, ...tallies.values());
    const rows = Math.ceil(state.players.length / perRow);
    const seats = state.players.map((p, i) => {
      const row = Math.floor(i / perRow), col = i % perRow, count = Math.min(perRow, state.players.length - row * perRow);
      const near = rows > 1 && row === rows - 1;
      const depth = rows === 1 ? 1 : row / (rows - 1);
      const y = rows === 1 ? 89 : compactScene.matches ? (rows === 2 ? [58,93][row] : [43,68,93][row]) : [60,94][row];
      const width = compactScene.matches ? 20 + depth * 3 : 13 + depth * 2.5;
      // Every row sits in close pairs, like the near row: two armchairs side by side, then an aisle.
      const groups = compactScene.matches ? { 4: [[23.5,2],[76.5,2]], 3: [[29,2],[78,1]], 2: [[50,2]], 1: [[50,1]] } : { 6: [[16,2],[50,2],[84,2]], 5: [[19,2],[50,1],[81,2]], 4: [[27,2],[73,2]], 3: [[33,2],[75,1]], 2: [[50,2]], 1: [[50,1]] };
      const slots = groups[count].flatMap(([center, n]) => n === 2 ? [center - width * .41, center + width * .41] : [center]);
      // Rows further back sit closer together, so outer chairs never touch the angled side walls.
      const x = 50 + (slots[col] - 50) * (.74 + .26 * depth);
      return el('div', { class: 'lounge-seat' + (!p.alive ? ' empty alignment-' + (p.alignment || (p.group === 'saboteur' ? 'bad' : 'good')) : '') + (state.speakerId === p.id ? ' speaking' : '') + (p.id === state.meId ? ' yours' : ''), 'data-player': p.id, 'data-facing': near ? 'away' : 'toward', 'data-seat-pair': Math.floor(col / 2), style: '--seat-x:' + x + '%;--seat-y:' + y + '%;--seat-width:' + width + '%;--seat-layer:' + (row * 2 + 2) + ';--depth:' + depth.toFixed(2) },
        el('span', { class: 'seat-number', 'aria-label': 'Seat ' + p.seat + (!p.alive ? ' · Out' : '') }, String(p.seat).padStart(2,'0')), !p.alive ? el('span', { class: 'out-stamp', 'aria-hidden': 'true' }, 'OUT') : null, el('div', { class: 'seat-figure' }, el('span', { class: 'seat-shadow', 'aria-hidden': 'true' }), seatedTraveller(p)),
        el('div', { class: 'seat-caption' }, el('div', { class: 'seat-name-row' }, avatar(p, 'seat-identity'), el('b', { class: 'lounge-name' + allyCls(p.id), title: p.name + (p.id === state.meId ? ' (you)' : '') }, p.name + (isAlly(p.id) ? ' 🗡️' : ''))), txt('small', 'seat-status', !p.alive ? 'OUT · ' + ((p.alignment || (p.group === 'saboteur' ? 'bad' : 'good')) === 'bad' ? 'BAD' : 'GOOD') : state.speakerId === p.id ? 'SPEAKING' : p.voteLocked ? 'VOTED' : 'ON BOARD'), p.pins ? el('span', { class: 'seat-pins', 'aria-label': p.pins + (p.pins === 1 ? ' suspect pin' : ' suspect pins') }, svgPin(), txt('b', '', String(p.pins)), txt('small', '', p.pins === 1 ? 'pin' : 'pins')) : null, tallies.has(p.id) ? tallyBadge(tallies.get(p.id), tallies.get(p.id) === topVotes) : null));
    });
    const banks = [];
    for (let i = 0; i < seats.length; i += perRow) banks.push(el('div', { class: 'sofa-row' }, ...seats.slice(i, i + perRow)));
    return el('div', { class: 'lounge-seats', 'aria-label': 'Speaking order, left to right, then the next row' }, ...banks);
  }
  function outs(entry) {
    if (!entry || !entry.outs.length) return el('div', { class: 'nobody-out', role: 'status' }, el('span', { class: 'nobody-icon', 'aria-hidden': 'true' }, '✓'), el('div', {}, txt('b', '', 'Everyone is still aboard.'), txt('small', '', entry?.type === 'vote' ? 'Nobody left the train this time.' : 'Nobody was lost in the night.')));
    return el('div', { class: 'revealed-outs' }, ...entry.outs.map(p => {
      const alignment = p.alignment || (p.group === 'saboteur' ? 'bad' : 'good');
      return el('div', { class: 'revealed-out ' + alignment }, avatar(p.id, 'reveal-avatar'), el('div', {}, el('b', {}, who(p.id) + ' is out'), txt('span', 'alignment-stamp', alignment.toUpperCase()), entry.type === 'night' && p.causes?.length ? txt('span', 'death-cause', p.causes.map(c => ({ attack: 'Attacked', poison: 'Poisoned', overdose: 'Overdose' }[c])).filter(Boolean).join(' + ')) : null, state.phase === 'finished' && p.role ? txt('small', '', role(p.role).name) : txt('small', '', 'Their role stays secret until the journey ends.')));
    }));
  }
  function votePerson(id) {
    return el('span', { class: 'vote-person' }, id ? avatar(id) : txt('span', 'skip-avatar', '—'), txt('b', '', id ? who(id) : 'Skip'));
  }
  function ledger(entry) {
    const groups = new Map();
    for (const v of entry.votes) {
      if (!groups.has(v.targetId)) groups.set(v.targetId, { targetId: v.targetId, votes: [], total: 0 });
      const g = groups.get(v.targetId); g.votes.push(v); g.total += v.weight;
    }
    const ordered = [...groups.values()].sort((a,b) => a.targetId === null ? 1 : b.targetId === null ? -1 : b.total - a.total);
    return el('div', { class: 'vote-ledger grouped-votes', 'aria-label': 'Votes grouped by target' }, ...ordered.map(g =>
      el('section', { class: 'vote-group' + (g.targetId ? '' : ' abstained'), 'data-target': g.targetId || 'skip' },
        el('div', { class: 'vote-group-heading' }, votePerson(g.targetId), txt('span', 'vote-total', g.targetId ? g.total + (g.total === 1 ? ' vote' : ' votes') : g.votes.length + ' skipped')),
        txt('small', 'vote-group-label', g.targetId ? 'VOTED BY' : 'SKIPPED'),
        el('div', { class: 'vote-group-voters' }, ...g.votes.map(v => el('div', { class: 'vote-row', 'aria-label': who(v.id) + ' voted for ' + (v.targetId ? who(v.targetId) : 'Skip') + (v.weight === 2 ? ' with a double vote' : '') }, votePerson(v.id), v.weight === 2 ? txt('small', 'double-vote', '×2') : null))))));
  }
  function ledgerDialog(entry) { const d = dialog('Who voted for whom', outs(entry), ledger(entry)); d.append(btn('Close', () => d.close(), 'gold')); }
  const KEYS_ICON = '<svg fill="none" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="2.6" fill="#2fb8ae" stroke="#157a73" stroke-width="1.4"/><path d="M6 9.5h1.5M9.5 9.5H11M13 9.5h1.5M16.5 9.5H18M6 12.5h1.5M9.5 12.5H11M13 12.5h1.5M16.5 12.5H18" stroke="#ffe28a" stroke-width="1.9" stroke-linecap="round"/><path d="M8 15.5h8" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/></svg>';
  const DONE_ICON = '<svg fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="#34cf86" stroke="#168a54" stroke-width="1.4"/><path d="M12 3.6a8.4 8.4 0 0 1 8 5.8C16 10 7 8.6 4.6 7.2A8.4 8.4 0 0 1 12 3.6z" fill="#fff" opacity=".2"/><path d="M7.5 12.4l3 3 6-6.4" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // The Witness's two sightings: a wide card each, with a little night scene, the full effect and a go arrow.
  const SIGHT_ART = {
    watch: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#0d2546"/><circle cx="48" cy="15" r="5" fill="#fff4cf"/><circle cx="51" cy="13" r="4.5" fill="#0d2546"/><path d="M8 34Q32 12 56 34 32 56 8 34z" fill="#e8fdff"/><circle cx="32" cy="34" r="10" fill="#2a8fd8"/><circle cx="32" cy="34" r="4.6" fill="#071a2a"/><circle cx="35.5" cy="30.5" r="2.2" fill="#fff"/><path d="M8 34Q32 12 56 34" fill="none" stroke="#8fd6ff" stroke-width="2.4" stroke-linecap="round"/></svg>',
    glimpse: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#24164a"/><path d="M14 52V16h36v36" fill="#3a2a72" stroke="#c8bdff" stroke-width="2.2"/><path d="M14 16l12 10v26M50 16 38 26v26" fill="none" stroke="#6d5bc4" stroke-width="2"/><g fill="#e9e3ff"><circle cx="24" cy="37" r="5"/><path d="M15 52q9-11 18 0z"/></g><g fill="#a99be6"><circle cx="40" cy="37" r="5"/><path d="M31 52q9-11 18 0z"/></g><text x="45" y="28" font-family="Inter,sans-serif" font-weight="900" font-size="11" fill="#ffd56b">?</text></svg>',
    glimpse3: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#24164a"/><path d="M12 52V16h40v36" fill="#3a2a72" stroke="#c8bdff" stroke-width="2.2"/><path d="M12 16l12 10v26M52 16 40 26v26" fill="none" stroke="#6d5bc4" stroke-width="2"/><g fill="#e9e3ff"><circle cx="21" cy="39" r="4"/><path d="M14 52q7-9 14 0z"/></g><g fill="#c8bdff"><circle cx="32" cy="37" r="4.4"/><path d="M24.5 52q7.5-10 15 0z"/></g><g fill="#a99be6"><circle cx="43" cy="39" r="4"/><path d="M36 52q7-9 14 0z"/></g><text x="45" y="28" font-family="Inter,sans-serif" font-weight="900" font-size="11" fill="#ffd56b">?</text></svg>',
  };
  function sightCard(kind, title, sub, click) {
    const b = btn('', click, 'sight-card ' + kind, busy, 'witness-' + kind); b.setAttribute('aria-label', title);
    b.innerHTML = '<span class="sight-art">' + SIGHT_ART[kind === 'glimpse' && state.saboteurCount === 1 ? 'glimpse3' : kind] + '</span><span class="sight-copy"><b></b><small></small></span><span class="sight-go" aria-hidden="true">›</span>';
    b.querySelector('b').textContent = title; b.querySelector('small').textContent = sub; return b;
  }
  function choiceCard(cls, icon, title, sub, click, disabled, key) {
    const b = btn('', click, 'speak-choice ' + cls, disabled, key); b.setAttribute('aria-label', title);
    b.innerHTML = '<span class="choice-icon">' + icon + '</span><span class="choice-copy"><b></b><small></small></span>';
    b.querySelector('b').textContent = title; b.querySelector('small').textContent = sub; return b;
  }
  let typing = false, typingKey = '', arrivedKey = null;
  // Quick phrases for a typed message: tap a chip to add a short line, or pick a face for "I suspect…" and friends.
  // Results from last night come first, then a role claim (or a Saboteur's cover story), then everyday lines.
  let phrasePick = null;
  const REPORT_CHIP = {
    check: r => who(r.targetId) + ' is ' + r.alignment.toUpperCase(),
    watch: r => r.targetId ? 'Attack on ' + who(r.targetId) : 'No attack seen',
    glimpse: r => r.ids.length ? r.ids.map(who).join(' or ') + ' is bad' : 'Empty corridor',
    footsteps: r => 'Footsteps from cabin ' + cabinList(r.from),
    clue: r => who(r.targetId) + ' isn’t ' + role(r.role).name,
    lock: r => 'Lock: ' + lockNeighbours(r).map(p => p.name).join(' or '),
  };
  const GOOD_ROLES = ['passenger', 'careful', 'brave', 'witness', 'speaker', 'inspector', 'medic', 'trainee', 'conductor', 'porter', 'guard', 'steward', 'signalman'];
  const fakeChips = () => [
    { cls: 'cover', label: 'Claim a role…', roles: k => k === 'passenger' ? 'I’m just a Passenger, no night power.' : 'I’m the ' + role(k).name + '.' },
    { cls: 'cover', label: 'Say … is GOOD', pick: n => 'I checked ' + n + ': GOOD.' }, { cls: 'cover', label: 'Say … is BAD', pick: n => 'I checked ' + n + ': BAD.' },
    { cls: 'cover', label: 'Heard steps…', pick: n => 'I heard footsteps from ' + n + '’s side of the corridor.' },
    { cls: 'cover', label: 'Protected…', pick: n => 'I protected ' + n + ' last night.' }, { cls: 'cover', label: 'Quiet night', text: 'I stayed in my cabin and heard nothing.' }];
  function phraseChips() {
    const me = state.me, reports = me.reports || [], round = Math.max(0, ...reports.map(r => r.round)), chips = [];
    for (const r of reports.filter(x => x.round === round && REPORT_CHIP[x.type])) chips.push({ cls: 'report', label: REPORT_CHIP[r.type](r), text: reportMessage(r) });
    // Saboteurs get believable fake lines: claim any good role, invent a check or a sound in the corridor.
    if (me.group === 'saboteur') chips.push(...(coverStory() ? [{ cls: 'cover', label: '🎭 Cover story', text: coverStory() }] : []), ...fakeChips());
    else chips.push({ cls: 'claim', label: role(me.role).name, text: me.role === 'passenger' ? 'I’m a Passenger, no night power.' : 'I’m the ' + role(me.role).name + '.' });
    chips.push({ label: 'I suspect…', pick: n => 'I suspect ' + n + '.' }, { label: 'I trust…', pick: n => 'I trust ' + n + '.' }, { label: 'Vote out…', pick: n => 'Let’s vote out ' + n + '.' },
      { label: 'No info', text: 'I have nothing from last night.' }, { label: 'Let’s skip', text: 'If we’re unsure, let’s skip this vote.' });
    return chips;
  }
  // Phrases go into the discussion message, or (for 'story') into tonight's private cover story.
  function addPhrase(text, target) {
    const join = cur => ((cur.trim() ? cur.trim() + ' ' : '') + text).slice(0, 280);
    if (target === 'story') updateNightNotes({ stories: { ...nightNotes().stories, [state.round]: join(coverStory()) } }); else speechDraft = join(speechDraft);
    phrasePick = null; render();
    requestAnimationFrame(() => { const t = document.getElementById(target === 'story' ? 'night-cover-story' : 'lt-speech'); t?.focus(); t?.setSelectionRange(t.value.length, t.value.length); });
  }
  function phraseBar(target) {
    const off = busy || state.paused, chips = target === 'story' ? fakeChips() : phraseChips(), picking = chips.find(c => c.label === phrasePick), add = text => addPhrase(text, target);
    return el('div', { class: 'phrase-bar', 'aria-label': 'Quick phrases' },
      el('div', { class: 'phrase-chips' }, ...chips.map(c => el('button', { type: 'button', class: 'phrase-chip' + (c.cls ? ' ' + c.cls : '') + (phrasePick === c.label ? ' on' : ''), disabled: off, 'data-focus': 'phrase-' + c.label,
        onclick: () => { if (c.pick || c.roles) { phrasePick = phrasePick === c.label ? null : c.label; render(); } else add(window.ltI18n.t(c.text)); } }, c.label))),
      picking?.pick ? el('div', { class: 'phrase-people' }, ...state.players.filter(p => p.alive && p.id !== state.meId).map(p => el('button', { type: 'button', class: 'phrase-person', disabled: off, 'aria-label': p.name,
        onclick: () => add(window.ltI18n.t(picking.pick(p.name))) }, avatar(p), txt('small', allyCls(p.id), p.name)))) : null,
      picking?.roles ? el('div', { class: 'phrase-people phrase-roles' }, ...GOOD_ROLES.filter(k => k === 'passenger' || !state.mix?.length || state.mix.some(m => m.role === k)).map(k => el('button', { type: 'button', class: 'phrase-person', disabled: off, 'aria-label': role(k).name,
        onclick: () => add(window.ltI18n.t(picking.roles(k))) }, rolePortrait(k, 'phrase-role-art'), txt('small', '', role(k).name)))) : null);
  }
  function speechConsole() {
    const me = state.me, own = state.speakerId === state.meId, mode = state.settings.discussion;
    const said = state.speeches.find(m => m.round === state.round && m.id === state.meId);
    const turnKey = [state.code, state.match, state.round, state.speakerId].join(':'); if (turnKey !== typingKey) { typingKey = turnKey; typing = false; }
    const busyVoice = voice.busy(), myReports = own && me.alive && me.reports.length;
    let options = null;
    if (own && me.alive) {
      if (said) options = txt('p', 'choice-saved', said.audio ? 'Voice shared. The next player has the floor.' : 'You’ve had your say. Let’s hear the next traveller.');
      else if (mode === 'chat' && typing) options = el('form', { class: 'speech-form', onsubmit: async e => { e.preventDefault(); if (!speechDraft.trim()) return; const text = speechDraft; await send('speak', { text }); } },
        phraseBar(),
        el('textarea', { id: 'lt-speech', rows: 3, maxLength: 280, value: speechDraft, placeholder: 'What did you find? Who do you trust?', 'aria-label': 'Your findings', disabled: busy || state.paused, oninput: e => speechDraft = e.target.value }),
        el('div', { class: 'speech-form-actions' }, btn('Use Voice Instead', () => { typing = false; render(); }, 'text-button', false, 'use-voice'), el('button', { type: 'submit', class: 'gold', disabled: busy || state.paused, 'data-focus': 'share-findings' }, 'Share Message')));
      else options = el('div', { class: 'speak-choices' + (busyVoice ? ' recording' : '') }, voice.controls(),
        busyVoice ? null : mode === 'chat' ? choiceCard('type-choice', KEYS_ICON, 'Type Message', 'One message', () => { typing = true; render(); requestAnimationFrame(() => document.getElementById('lt-speech')?.focus()); }, state.paused, 'type-message')
          : choiceCard('done-choice', DONE_ICON, 'I’m Done Speaking', 'Next seat', () => send('finishSpeech'), state.paused, 'done-speaking'));
    }
    return el('section', { class: 'speech-console' }, el('div', { class: 'speaking-person' }, avatar(state.speakerId), el('div', {}, txt('small', '', 'SEAT ' + player(state.speakerId).seat + ' · ' + (state.speakerIndex + 1) + '/' + state.speakingOrder.length), el('h2', {}, own ? 'It’s your turn.' : who(state.speakerId) + ' has the floor.')), txt('span','countdown speaker-seconds','')),
      txt('p', 'console-hint', own ? mode === 'chat' ? 'What happened last night? Record your voice or type one short message.' : 'Tell the group what you know, out loud. You can also record it. Up to ' + state.speakSeconds + ' seconds.' : mode === 'chat' ? 'Read their message, or play their recording after this turn. Your turn follows the seat numbers.' : 'Listen to their story. Your turn follows the seat numbers.'),
      own && me.alive && me.group === 'saboteur' && coverStory() ? el('aside', { class: 'private-question' }, txt('small', '', 'YOUR PRIVATE COVER STORY'), txt('p', '', coverStory())) : null,
      myReports ? btn('My Reports (' + me.reports.length + ')', reportsDialog, 'secondary reports-quick', false, 'turn-reports') : null,
      options);
  }
  // Suspect pins: a public count, not a vote. Each living player can pin one person and change it any time.
  function pinBar() {
    if (!state.pinsOpen || !state.me.alive || state.paused || state.phase === 'morning') return null;
    const pinned = state.me.suspect;
    // A round pin button: the pin itself, or the face you pinned with a small pin badge.
    const b = el('button', { type: 'button', class: 'pin-button pin-round' + (pinned ? ' pinned' : ''), disabled: busy, 'data-focus': 'pin-suspect', 'aria-label': pinned ? 'Change my pin (now ' + who(pinned) + ')' : 'Pin A Suspect', onclick: pinDialog },
      pinned ? avatar(pinned, 'pin-face') : svgPin(), pinned ? el('span', { class: 'pin-badge', 'aria-hidden': 'true' }, svgPin()) : null);
    return el('div', { class: 'pin-bar' }, b, el('p', {}, pinned ? el('span', {}, 'You suspect ', el('b', {}, who(pinned)), '. Tap to change.') : el('span', {}, el('b', {}, 'Pin A Suspect'), ' · only the count is shown')));
  }
  function pinDialog() {
    const d = dialog('Who do you suspect?', el('div', { class: 'target-hint' }, toneIcon('pin'), txt('p', '', 'Only the number of pins is shown, never who pinned. Pins reset each night and are not votes.'))); d.classList.add('target-dialog', 'tone-pin');
    const grid = el('div', { class: 'manifest-targets' }, ...state.players.filter(p => p.alive && p.id !== state.meId).map(p => { const b = targetCard(p, () => { d.close(); send('suspect', { targetId: p.id }); }, state.me.suspect === p.id ? 'selected' : ''); b.setAttribute('aria-pressed', String(state.me.suspect === p.id)); return b; }));
    d.append(...[grid, el('div', { class: 'confirm-bar' }, ...[state.me.suspect ? btn('Clear My Pin', () => { d.close(); send('suspect', { targetId: null }); }, 'secondary') : null, btn('Cancel', () => d.close(), 'text-button')].filter(Boolean))]);
  }
  let lastWordsDraft = '';
  function lastWordsBlock(entry) {
    if (!entry?.outs.length || entry.type !== 'vote') return null;
    if (entry.lastWords) return el('blockquote', { class: 'last-words' }, avatar(entry.lastWords.id, 'last-words-face'), el('div', {}, txt('small', '', 'LAST WORDS · ' + who(entry.lastWords.id).toUpperCase()), el('p', { 'data-no-tr': '' }, '“' + entry.lastWords.text + '”')));
    if (!entry.outs.some(o => o.id === state.meId)) return txt('p', 'console-hint last-words-wait', who(entry.outs[0].id) + ' may say a few last words…');
    return el('form', { class: 'last-words-form', onsubmit: e => { e.preventDefault(); if (lastWordsDraft.trim()) send('lastWords', { text: lastWordsDraft }); } },
      el('label', { htmlFor: 'lt-last-words' }, 'Your last words'), el('input', { id: 'lt-last-words', maxLength: 120, value: lastWordsDraft, placeholder: 'One line for the group…', autocomplete: 'off', oninput: e => lastWordsDraft = e.target.value }), el('button', { type: 'submit', class: 'gold', disabled: busy, 'data-focus': 'send-last-words' }, 'Say It'));
  }
  // Before anyone speaks: a quiet moment to think, with a nudge to pin a suspect.
  function thinkCard() {
    const first = state.players.filter(p => p.alive).sort((x, y) => x.seat - y.seat)[0]?.id, mine = state.me.suspect;
    return el('div', { class: 'think-card' }, el('div', { class: 'think-head' }, el('span', { class: 'think-icon', 'aria-hidden': 'true' }, txt('span', 'countdown', '')), el('div', {}, txt('small', '', 'BEFORE THE DISCUSSION'), el('h3', {}, 'Take a moment to think.'))),
      txt('p', 'console-hint', 'Look at who is out and check your reports. ' + (first ? (first === state.meId ? 'You speak first.' : who(first) + ' speaks first.') : '')),
      state.me.alive && !state.paused ? el('div', { class: 'think-pin' }, el('button', { type: 'button', class: 'pin-button pin-round' + (mine ? ' pinned' : ''), disabled: busy, 'data-focus': 'think-pin', 'aria-label': mine ? 'Change My Pin' : 'Pin A Suspect', onclick: pinDialog }, mine ? avatar(mine, 'pin-face') : svgPin(), mine ? el('span', { class: 'pin-badge', 'aria-hidden': 'true' }, svgPin()) : null), el('small', {}, el('b', {}, mine ? 'You pinned ' + who(mine) + '.' : 'Pin A Suspect'), mine ? ' Tap to change. Only the count is shown.' : ' Optional. Everyone sees the count, never who pinned.')) : null);
  }
  // The map in the lounge; footprints appear for the one traveller who heard them last night.
  // A heard clue draws the steps just before and after the listener's own door.
  const ring = (c, n) => ((c - 1) % n + n) % n + 1;
  const heardRoute = r => { const n = state.players.filter(p => p.seat).length; return [ring(r.cabin - r.dir, n), r.cabin, ring(r.cabin + r.dir, n)]; };
  const cabinList = list => list.map(c => String(c).padStart(2, '0')).join(', ').replace(/, ([^,]*)$/, ' or $1');
  function carriagePanel() {
    if (state.settings.footsteps === false || !state.players.some(p => p.seat)) return null;
    const heard = (state.me.reports || []).find(r => r.type === 'footsteps' && r.round === state.round);
    return el('details', { class: 'panel carriage-panel' + (heard ? ' heard' : ''), 'data-details': 'carriage-' + state.round, open: true }, el('summary', {}, txt('span', 'map-summary-icon', '🗺️'), el('span', {}, txt('b', '', 'Carriage Map'), txt('small', '', heard ? 'You heard footsteps last night' : 'Cabin number = seat number')), txt('span', 'accordion-chevron', '⌄')),
      carriageMap({ route: heard ? heardRoute(heard) : null, fade: true, marks: true }), heard ? footstepsNote(heard) : txt('p', 'muted small map-hint', 'The corridor loops around the lounge. At night a Saboteur walks the shorter way round to attack, and one traveller they pass may hear footsteps.'));
  }
  function footstepsNote(r) {
    return el('div', { class: 'footsteps-note' }, el('span', { class: 'footsteps-icon', 'aria-hidden': 'true' }), el('div', {}, txt('b', '', 'Someone walked past your door at ' + r.time + '.'), txt('p', '', (r.from.length ? 'They came from the direction of cabin ' + cabinList(r.from) + ', and kept walking past you.' : 'They kept walking past you.') + ' It could be a Saboteur, or a Brave Passenger going to protect someone.'),
      r.from.length ? (() => { const tagged = r.from.every(c => { const p = state.players.find(q => q.seat === c); return !p || p.id === state.meId || (nightNotes().tags[p.id] || []).includes('steps'); });
        return el('button', { type: 'button', class: 'tag-steps-button' + (tagged ? ' done' : ''), disabled: tagged, 'data-focus': 'tag-steps', onclick: e => { const b = e.currentTarget; tagFootsteps(r); b.classList.add('done'); b.disabled = true; b.textContent = '✓ Tagged As Walk Path'; } }, tagged ? '✓ Tagged As Walk Path' : '👣 Tag These Cabins'); })() : null));
  }
  function mapDialog() {
    if (!state?.players.some(p => p.seat)) return;
    const heard = (state.me.reports || []).filter(r => r.type === 'footsteps' && r.round === state.round);
    const d = dialog('Carriage Map', txt('p', 'muted small', 'Cabin number = seat number. The corridor loops around the lounge.' + (state.me.allies?.length > 1 ? ' Your team is marked in red.' : '')),
      carriageMap({ route: heard[0] ? heardRoute(heard[0]) : null, fade: true, marks: true }), ...heard.map(footstepsNote));
    d.classList.add('map-dialog'); d.append(btn('Close', () => d.close(), 'gold'));
  }
  function loungeScene() {
    const phase = state.phase, latest = state.history.at(-1), gathering = phase === 'gathering';
    const titles = { revoteInfo: 'The vote is tied.', gathering: 'Everyone to the lounge.', morning: 'A new morning. A few secrets.', discussion: 'One seat. One story.', voting: state.voteAttempt === 2 ? 'A tie. Vote once more.' : 'Who leaves the train?', voteResult: latest?.outs.length ? 'One player leaves the train.' : 'No one leaves this time.' };
    const subtitles = { revoteInfo: 'Take a moment to review the tied players. Everyone will vote again.', gathering: 'Cabin doors open. Meet your fellow travellers.', morning: 'See who is out. Check your ticket for any new private report.', discussion: 'Speak in seat order. You have up to ' + state.speakSeconds + ' seconds; sharing moves to the next player.', voting: state.voteAttempt === 2 ? 'Choose between the tied players. Another tie means a random elimination.' : 'The player with most votes leaves. Skip does not cancel votes for a player.', voteResult: 'Their team is revealed. Their role stays secret until the end.' };
    return el('section', { class: 'world lounge-scene phase-' + phase, 'aria-label': 'The train gathering lounge' }, hud('ROUND ' + state.round + ' · THE GATHERING LOUNGE', titles[phase], subtitles[phase]), el('div', { class: 'lounge-room', 'aria-label': 'Everyone seated together in the observation lounge' }, art('lounge-room'), loungeSeats(), el('div', { class: 'lounge-light', 'aria-hidden': 'true' }), pinBar()), ghostBlock(), carriagePanel(),
      gathering ? txt('p', 'gathering-caption', 'Take your seat…') : phase === 'morning' ? el('section', { class: 'lounge-console morning-reveal' }, outs(latest), thinkCard()) : phase === 'revoteInfo' ? el('section', { class: 'lounge-console' }, revoteInfoCard(), el('details', {}, el('summary', {}, 'See The First Vote'), ledger(latest))) : phase === 'discussion' ? speechConsole() : phase === 'voting' ? el('section', { class: 'lounge-console voting-console' }, el('h2', {}, state.me.vote ? 'Your vote is sealed.' : state.me.alive ? 'Your vote. Your decision.' : 'Watch the vote quietly.'), state.me.vote ? txt('p', 'choice-saved', '✓ ' + (state.me.vote.targetId ? who(state.me.vote.targetId) : 'Skip') + (state.me.vote.weight === 2 ? ' · counts twice' : '')) : state.me.alive && !state.paused ? btn('Choose A Player Or Skip', () => chooseTarget('Who should leave the train?', state.voteAttempt === 2 ? 'Only tied players can be chosen. Another tie is decided at random.' : 'Your vote is final. Skip is an abstention. A tie starts one re-vote.', 'vote', {}, { self: true, skip: true }), 'gold') : null, txt('p', 'console-hint', state.players.filter(p => p.voteLocked).length + ' / ' + state.players.filter(p => p.alive).length + ' votes sealed'), state.voteAttempt === 2 && latest?.reason === 'revote' ? el('details', { class: 'previous-vote', 'data-details': 'first-vote-' + state.round }, el('summary', {}, 'See The First Vote'), ledger(latest)) : null) : el('section', { class: 'lounge-console ejection-reveal' }, outs(latest), lastWordsBlock(latest), latest?.reason === 'random' ? txt('p', 'console-hint', 'The re-vote tied. One tied player was chosen at random.') : latest?.reason === 'skip' ? txt('p', 'console-hint', 'No player received a vote. Everyone stays aboard.') : latest?.reason === 'signal' ? txt('p', 'console-hint', '🚦 Signal Stop: the vote tied, so nobody leaves this time.') : null, latest?.votes ? el('div', { class: 'inline-votes' }, ledger(latest)) : latest?.sealed ? txt('p', 'console-hint sealed-note', '✉️ Sealed ballots: who voted for whom is revealed at the end.') : null, txt('p', 'console-hint', 'The next part begins when the timer ends.')));
  }
  const cabinPerson = cabin => state.players.find(p => p.seat === cabin);
  const lockNeighbours = r => [...new Set(r.near || [])].map(cabinPerson).filter(Boolean);
  function reportMessage(r) {
    if (r.type === 'watch') return r.targetId ? 'The Saboteurs tried to attack ' + who(r.targetId) + '. The target may be good or bad.' : 'The Saboteurs did not choose an attack.';
    if (r.type === 'watch-blocked') return 'Your watch was blocked. No target is known.';
    if (r.type === 'glimpse') return r.ids.length ? 'One of ' + r.ids.map(who).join(r.ids.length > 2 ? ', ' : ' and ').replace(/, ([^,]*)$/, ' and $1') + ' is a Saboteur.' : 'The corridor was empty.';
    if (r.type === 'glimpse-blocked') return 'Your glimpse was blocked. You saw no one.';
    if (r.type === 'lock' && r.sharp) return 'At ' + r.time + ' a lock clicked shut in ' + (lockNeighbours(r)[0]?.name || 'a neighbour') + '’s cabin, right next to you. Your sharp ears caught the side.';
    if (r.type === 'lock') return 'At ' + r.time + ' a lock clicked shut next door: either ' + lockNeighbours(r).map(p => p.name + '’s').join(' or ') + '. You couldn’t tell which side.';
    if (r.type === 'footsteps') return 'Footsteps at ' + r.time + ': someone came past your door from the direction of cabin ' + cabinList(r.from) + '.';
    if (r.type === 'ghostReveal') return 'From the peak: ' + who(r.targetId) + ' is the ' + role(r.role).name + '.';
    if (r.type === 'clue') return 'Lost luggage: ' + who(r.targetId) + ' is not the ' + role(r.role).name + '.';
    if (r.type === 'check') return who(r.targetId) + ' is ' + r.alignment.toUpperCase() + '.';
    if (r.type === 'check-blocked') return 'Your check was blocked. No result is known.';
    if (r.type === 'manifest') return who(r.targetId) + (r.walked ? ' left their cabin tonight.' : ' stayed in their cabin tonight.');
    if (r.type === 'manifest-blocked') return 'Your ticket check was stopped. No result is known.';
    if (r.type === 'post') return r.ids.length ? (r.ids.length === 1 ? who(r.ids[0]) + ' came to ' + who(r.targetId) + '’s door.' : r.ids.map(who).join(' and ') + ' came to ' + who(r.targetId) + '’s door.') : 'Nobody came to ' + who(r.targetId) + '’s door.';
    if (r.type === 'post-blocked') return 'You could not keep watch tonight. No result is known.';
    if (r.type === 'turned') return 'A Saboteur is out. You have turned: you are now on the bad team, and you attack with them from tonight.';
    if (r.type === 'stowaway') return who(r.targetId) + ' was the Stowaway. They have joined your team.';
    if (r.type === 'sleep') return 'Someone gave you a sleeping pill. Your power did nothing tonight, but you were safe from the attack.';
    if (r.backup) return 'The ' + role(r.role).name + ' is out. You are now the ' + role(r.role).name + ', with their power and anything they used. It starts next night; your own power is gone.';
    return 'You are now ' + role(r.role).name + '. Your new power starts next night.';
  }
  // Private reports, oldest night first: one card per result with the person, an icon and a clear verdict.
  const REPORT_ICONS = {
    check: '<circle cx="13.5" cy="13.5" r="8.5" fill="#bdf6ff33" stroke="#e8fdff" stroke-width="3"/><path d="M20 20l7.5 7.5" stroke="#f2ce86" stroke-width="4.5" stroke-linecap="round"/>',
    watch: '<path d="M2.5 16Q16 3.5 29.5 16 16 28.5 2.5 16z" fill="#e8fdff"/><circle cx="16" cy="16" r="6" fill="#2a8fd8"/><circle cx="16" cy="16" r="2.6" fill="#071a2a"/><circle cx="18" cy="14" r="1.3" fill="#fff"/>',
    blocked: '<circle cx="16" cy="16" r="11" fill="none" stroke="#b9aed0" stroke-width="3.6"/><path d="M8.5 8.5l15 15" stroke="#b9aed0" stroke-width="3.6" stroke-linecap="round"/>',
    glimpse: '<path d="M4 8h24v16H4z" fill="#1b2a44" stroke="#8fd6ff" stroke-width="2"/><path d="M4 8l9 8-9 8M28 8l-9 8 9 8" fill="#2d4a72"/><circle cx="16" cy="15" r="3.6" fill="#e8fdff"/><path d="M10 26q6-6 12 0z" fill="#e8fdff"/>',
    clue: '<rect x="5" y="9" width="22" height="17" rx="3" fill="#c9893f" stroke="#7a4e14" stroke-width="1.4"/><path d="M12 9V6.5a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 20 6.5V9" fill="none" stroke="#7a4e14" stroke-width="2"/><rect x="13" y="14" width="10" height="7" rx="1" fill="#fff6dc"/><path d="M15 17h6" stroke="#7a4e14" stroke-width="1.3"/>',
    footsteps: '<g fill="#f2ce86"><ellipse cx="10" cy="9" rx="4" ry="5.2"/><ellipse cx="10" cy="18" rx="3" ry="2.6"/><ellipse cx="21" cy="14" rx="4" ry="5.2"/><ellipse cx="21" cy="23" rx="3" ry="2.6"/></g>',
    ghostReveal: '<path d="M3 27 12 12l4 6 3-4 10 13z" fill="#8b97b3"/><path d="M12 12l2.4 3.6L12 15l-2 1.2z" fill="#f4f8ff"/><path d="M22 6v8" stroke="#f3eadb" stroke-width="1.4"/><path d="M22 6l6 2.2-6 2.2z" fill="#ffd36a"/>',
    lock: '<rect x="7" y="14" width="18" height="13" rx="3" fill="#f2ce86" stroke="#9a6a1e" stroke-width="1.4"/><path d="M11 14v-3.5a5 5 0 0 1 10 0V14" fill="none" stroke="#e8fdff" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="20" r="2" fill="#5a3a0e"/><path d="M27 9l2.5-2M28 13h3M5 9 2.5 7M4 13H1" stroke="#ffe7a8" stroke-width="1.6" stroke-linecap="round"/>',
    manifest: '<rect x="4" y="9" width="24" height="15" rx="2.5" fill="#fff1c9" stroke="#b8862c" stroke-width="1.6"/><path d="M8 14h11M8 19h7" stroke="#b8862c" stroke-width="2" stroke-linecap="round"/><circle cx="23" cy="18" r="2.6" fill="#1b1130"/>',
    post: '<path d="M16 3v4" stroke="#b8862c" stroke-width="2" stroke-linecap="round"/><path d="M11 7h10l-1.5 4h-7z" fill="#e9c46f"/><rect x="9.5" y="11" width="13" height="16" rx="3" fill="#3a2a10" stroke="#e9c46f" stroke-width="1.6"/><rect x="12" y="13.5" width="8" height="11" rx="2" fill="#ffd56b"/>',
    turned: '<rect x="5" y="11" width="22" height="16" rx="3" fill="#7a4b1e" stroke="#e9c46f" stroke-width="1.6"/><path d="M12 11V8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" fill="none" stroke="#e9c46f" stroke-width="1.6"/><circle cx="13" cy="18" r="1.6" fill="#ff5c6c"/><circle cx="19" cy="18" r="1.6" fill="#ff5c6c"/>',
    stowaway: '<rect x="5" y="11" width="22" height="16" rx="3" fill="#7a4b1e" stroke="#e9c46f" stroke-width="1.6"/><path d="M12 11V8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" fill="none" stroke="#e9c46f" stroke-width="1.6"/><path d="M11 20h10" stroke="#ff8a9a" stroke-width="2" stroke-linecap="round"/>',
    sleep: '<path d="M21 5a11 11 0 1 0 6 18 9 9 0 0 1-6-18z" fill="#c8bdff"/><rect x="5" y="20" width="14" height="7" rx="3.5" fill="#fff" stroke="#8f7bff" stroke-width="1.4"/><path d="M12 20v7" stroke="#8f7bff" stroke-width="1.4"/><text x="22" y="12" font-family="Inter,sans-serif" font-weight="900" font-size="7" fill="#fff">z</text>',
    promotion: '<path d="M16 3l3.8 7.8 8.6 1.2-6.2 6 1.5 8.6L16 22.5l-7.7 4.1 1.5-8.6-6.2-6 8.6-1.2z" fill="#ffd56b" stroke="#c98f12" stroke-width="1.2" stroke-linejoin="round"/>',
  };
  function reportCard(r) {
    const kind = r.type.endsWith('-blocked') ? 'blocked' : r.type === 'promotion' ? 'promotion' : r.type;
    const icon = el('span', { class: 'report-icon', 'aria-hidden': 'true' }); icon.innerHTML = '<svg viewBox="0 0 32 32">' + REPORT_ICONS[kind] + '</svg>';
    const title = { check: 'Inspector check', watch: 'Witness sighting', glimpse: 'Corridor glimpse', clue: 'Lost luggage', footsteps: 'Footsteps', lock: 'Lock click', ghostReveal: 'Ghost climb', blocked: 'Power blocked', promotion: 'Promotion', manifest: 'Ticket check', post: 'Door watch', sleep: 'Sleeping pill', turned: 'You turned', stowaway: 'New teammate' }[kind];
    const verdict = kind === 'check' ? txt('span', 'report-verdict ' + r.alignment, r.alignment.toUpperCase()) : kind === 'watch' && r.targetId ? txt('span', 'report-verdict watch', 'TARGET') : kind === 'manifest' ? txt('span', 'report-verdict ticket' + (r.walked ? ' walked' : ''), r.walked ? 'WALKED' : 'STAYED IN') : null;
    return el('article', { class: 'report-item ' + kind + (r.alignment ? ' ' + r.alignment : '') },
      icon, el('div', { class: 'report-body' }, txt('small', '', title), txt('p', '', reportMessage(r))),
      kind === 'glimpse' && r.ids?.length ? el('div', { class: 'report-faces' }, ...r.ids.map(id => avatar(id, 'report-face'))) : kind === 'lock' ? el('div', { class: 'report-faces' }, ...lockNeighbours(r).map(p => avatar(p.id, 'report-face'))) : kind === 'post' && r.ids?.length ? el('div', { class: 'report-faces' }, ...r.ids.map(id => avatar(id, 'report-face'))) : r.targetId && kind !== 'blocked' ? el('div', { class: 'report-target' }, avatar(r.targetId, 'report-face'), verdict) : kind === 'promotion' ? rolePortrait(r.role, 'report-face') : null);
  }
  function reportList() {
    const rounds = [...new Set(state.me.reports.map(r => r.round))].sort((a, b) => a - b);
    if (!rounds.length) return txt('p', 'reports-empty', 'Private results from your night power will appear here, such as a check or a sighting.');
    return el('div', { class: 'report-list' }, ...rounds.map(round => el('section', { class: 'report-night' }, el('h3', {}, nightBadge(round)), ...state.me.reports.filter(r => r.round === round).map(reportCard))));
  }
  function reportsDialog() { const d = dialog('Your private reports', txt('p', 'muted small', 'Only you can see these. Night 1 is at the top.'), reportList()); d.classList.add('reports-dialog'); d.append(btn('Close', () => d.close(), 'gold')); }
  function setRoleCard(open) {
    showCard = !!open;
    if (!dockNode) return;
    dockNode.classList.toggle('revealed', showCard);
    const handle = dockNode.querySelector('.drawer-handle'), content = dockNode.querySelector('.drawer-content');
    const arrow = el('span', { class: 'drawer-arrow', 'aria-hidden': 'true' });
    arrow.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="#f5c95c" stroke-width="2"><path d="M4 10l4-4 4 4"/></svg>';
    handle.replaceChildren(...[arrow, txt('span', '', showCard ? 'Hide Role' : 'Show Role'), !showCard && state.me.reports.length ? txt('small', 'drawer-report-count', String(state.me.reports.length)) : null].filter(Boolean));
    handle.setAttribute('aria-label', showCard ? 'Hide Role' : 'Show Role');
    handle.setAttribute('aria-expanded', String(showCard));
    content.inert = !showCard;
    content.setAttribute('aria-hidden', String(!showCard));
    if (!showCard && content.contains(document.activeElement)) handle.focus({ preventScroll: true });
  }
  function syncRoleDock(visible) {
    if (!visible) { dockNode?.remove(); dockNode = null; dockStamp = ''; drawerGesture = null; return; }
    if (!dockNode) {
      const handle = el('button', { type: 'button', class: 'drawer-handle', 'aria-controls': 'lt-role-content', 'data-focus': 'show-role', onclick: e => {
        if (suppressDrawerClick && e.detail !== 0) { suppressDrawerClick = false; return; }
        suppressDrawerClick = false;
        setRoleCard(!showCard);
      }});
      dockNode = el('aside', { class: 'role-dock', 'aria-label': 'Your private role card' }, handle, el('div', { id: 'lt-role-content', class: 'drawer-content' }));
      overlayRoot.append(dockNode);
      handle.addEventListener('pointerdown', e => {
        if (!e.isPrimary || e.button !== 0) return;
        suppressDrawerClick = false;
        drawerGesture = { id: e.pointerId, y: e.clientY, dy: 0 };
        handle.setPointerCapture(e.pointerId);
      });
      handle.addEventListener('pointermove', e => {
        if (drawerGesture?.id !== e.pointerId) return;
        drawerGesture.dy = e.clientY - drawerGesture.y;
        const travel = dockNode.offsetHeight - handle.offsetHeight;
        const dy = Math.max(showCard ? 0 : -travel, Math.min(showCard ? travel : 0, drawerGesture.dy));
        dockNode.classList.add('dragging');
        dockNode.style.setProperty('--drawer-drag', dy + 'px');
      });
      const end = e => {
        if (drawerGesture?.id !== e.pointerId) return;
        const dy = drawerGesture.dy;
        drawerGesture = null;
        dockNode.classList.remove('dragging');
        dockNode.style.removeProperty('--drawer-drag');
        if (Math.abs(dy) > 24) {
          suppressDrawerClick = true;
          if (e.type !== 'pointercancel') setRoleCard(dy < 0);
        }
      };
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
      handle.addEventListener('lostpointercapture', end);
      handle.addEventListener('keydown', e => {
        if (['ArrowUp','ArrowDown','Escape'].includes(e.key)) { e.preventDefault(); setRoleCard(e.key === 'ArrowUp'); }
      });
    }
    const me = state.me, limited = { careful:'lock', brave:'cover', witness:'watch', speaker:'double', blocker:'block', forger:'disguise' }[me.role];
    const stamp = JSON.stringify([me.role, me.alive, me.used, me.medicine, me.reports, me.allies, busy]);
    if (stamp !== dockStamp) {
      const focusedReports = document.activeElement?.dataset.focus === 'role-reports';
      dockNode.querySelector('.drawer-content').replaceChildren(...[
        el('div', { class: 'ticket-face' }, rolePortrait(me.role, 'ticket-icon ticket-role-portrait'), el('div', { class:'ticket-copy' }, txt('small','', !me.alive ? 'YOUR ROLE · YOU ARE OUT' : 'YOUR PRIVATE ROLE'), el('b',{},role(me.role).name), txt('span','ticket-subtitle',groupName(me.group) + (limited ? ' · ' + (me.used[limited] ? 'POWER USED' : 'POWER AVAILABLE') : me.medicine ? ' · Heal ' + me.medicine.heal + ' / Poison ' + me.medicine.poison : '')))),
        me.group === 'saboteur' ? el('section', { class: 'ticket-allies', 'aria-label': 'Your Saboteur teammates' }, txt('small', 'eyebrow', 'YOUR TEAMMATES'), me.allies.filter(p => p.id !== state.meId).length ? el('div', { class: 'ticket-allies-list' }, ...me.allies.filter(p => p.id !== state.meId).map(p => el('div', { class: 'ticket-ally' + (p.alive ? '' : ' is-out'), 'data-player': p.id }, avatar(p.id, 'ally-portrait'), el('div', {}, txt('b', '', p.name), txt('small', '', role(p.role).name + (p.alive ? ' · On board' : ' · Out')))))) : txt('p', '', 'You are the only Saboteur.')) : null,
        txt('p','ticket-rule',role(me.role).description),
        me.reports.length ? btn('Reports (' + me.reports.length + ')', reportsDialog, 'report-button', false, 'role-reports') : null
      ].filter(Boolean));
      dockStamp = stamp;
      if (focusedReports && showCard) dockNode.querySelector('.report-button')?.focus({ preventScroll: true });
    }
    setRoleCard(showCard);
  }
  const carriage = door => '<svg viewBox="0 0 260 92" aria-hidden="true"><defs><linearGradient id="lt-car" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a2a3c"/><stop offset=".55" stop-color="#4a1726"/><stop offset="1" stop-color="#2a0c16"/></linearGradient><linearGradient id="lt-win" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a8"/><stop offset="1" stop-color="#f0a948"/></linearGradient></defs>'
    + '<rect x="0" y="40" width="10" height="5" fill="#1a0d14"/><rect x="250" y="40" width="10" height="5" fill="#1a0d14"/>'
    + '<path d="M14 18q0-10 12-11h208q12 1 12 11v52H14z" fill="url(#lt-car)" stroke="#d9b06a" stroke-width="1.2"/><path d="M18 14q2-5 10-5h204q8 0 10 5" fill="none" stroke="#f3d08a" stroke-width="1" opacity=".6"/>'
    + '<path d="M14 58h232" stroke="#e8c27a" stroke-width="1.6"/><path d="M14 62h232" stroke="#e8c27a" stroke-width=".7" opacity=".7"/>'
    + (door ? [20, 48, 160, 192, 222] : [22, 54, 86, 118, 150, 182, 214]).map(x => '<rect x="' + x + '" y="22" width="' + (x === 222 ? 16 : 24) + '" height="20" rx="3" fill="url(#lt-win)" stroke="#d9b06a" stroke-width="1"/><path d="M' + (x + 2) + ' 25h' + (x === 222 ? 12 : 20) + '" stroke="#fff6d8" stroke-width="1.4" opacity=".7"/>').join('')
    + (door ? '<rect class="door-gap" x="104" y="20" width="32" height="44" rx="2" fill="#ffd27a"/><rect class="door-gap-glow" x="98" y="16" width="44" height="52" rx="6" fill="#ffcf75" opacity=".25"/><rect class="door-panel" x="104" y="20" width="32" height="44" rx="2" fill="#5a1d2e" stroke="#e8c27a" stroke-width="1.2"/><rect class="door-panel" x="110" y="25" width="20" height="14" rx="2" fill="url(#lt-win)" opacity=".85"/>' : '')
    + '<rect x="20" y="70" width="70" height="7" rx="3" fill="#160910"/><rect x="170" y="70" width="70" height="7" rx="3" fill="#160910"/>'
    + [34, 74, 186, 226].map(x => '<g transform="translate(' + x + ' 80)"><g class="wheel"><circle r="9" fill="#120a10" stroke="#8a6a3a" stroke-width="1.6"/><path d="M-6 0h12M0 -6v12" stroke="#c9a15a" stroke-width="1.4"/><circle r="2.4" fill="#e8c27a"/></g></g>').join('')
    + '</svg>';
  function syncElimination() {
    const entry = state?.history.at(-1);
    if (state?.phase !== 'voteResult' || entry?.type !== 'vote' || !entry.outs.length) {
      cinemaNode?.close(); cinemaNode = null; cinemaKey = ''; return;
    }
    const key = [state.code, state.match, state.round, state.history.length].join(':');
    const elapsed = (state.duration || 12) - (state.remainingMs || 0) / 1000;
    if (cinemaKey === key) {
      if (cinemaNode) cinemaNode.dataset.paused = String(!!state.paused);
      return;
    }
    cinemaKey = key;
    if (read('lt-ejection-seen') === key || elapsed >= 4.8) return;
    save('lt-ejection-seen', key);
    const out = entry.outs[0], bad = out.alignment === 'bad' || out.group === 'saboteur';
    // The carriage door slides open and the voted-out traveller is tossed onto the tracks as the train speeds on.
    const stage = el('div', { class: 'throw-stage', 'aria-hidden': 'true' },
      el('div', { class: 'throw-sky' }, el('i', { class: 'throw-moon' })), el('div', { class: 'throw-hills' }), el('div', { class: 'throw-poles' }), el('div', { class: 'throw-ground' }),
      el('div', { class: 'throw-train' }), el('div', { class: 'throw-fall' }, el('div', { class: 'throw-arc' }, avatar(out.id, 'throw-avatar'))), el('i', { class: 'throw-dust' }), el('div', { class: 'throw-bits' }, ...Array.from({ length: 7 }, (_, i) => el('i', { style: '--i:' + i }))), el('div', { class: 'throw-dizzy' }, ...Array.from({ length: 3 }, (_, i) => el('i', { style: '--i:' + i }, '★'))), txt('span', 'throw-thud', 'THUD!'), el('i', { class: 'throw-speed' }), txt('span', 'throw-stamp', 'OFF THE TRAIN'));
    stage.querySelector('.throw-train').innerHTML = carriage(false) + carriage(true) + carriage(false);
    const d = dialog('Thrown off the train!', stage,
      el('div', { class: 'throw-name' }, el('h3', {}, who(out.id)), txt('small', 'cinema-seat', 'SEAT ' + String(player(out.id).seat).padStart(2,'0'))),
      txt('p','cinema-alignment ' + (bad ? 'bad' : 'good'),bad ? 'BAD' : 'GOOD'),
      txt('p','cinema-caption',who(out.id) + ' is off the train for good.'));
    d.classList.add('elimination-cinema');
    d.style.setProperty('--cinema-offset', '-' + Math.max(0, elapsed) + 's');
    d.dataset.paused = String(!!state.paused);
    d.addEventListener('close', () => { if (cinemaNode === d) { cinemaNode = null; requestAnimationFrame(flyVotes); } });
    if (!state.paused) { setTimeout(() => { if (cinemaNode === d) sfx.play('throw'); }, Math.max(0, 1000 - elapsed * 1000)); setTimeout(() => { if (cinemaNode === d) sfx.play('stamp'); }, Math.max(0, 2500 - elapsed * 1000)); }
    cinemaNode = d;
    cinemaEnd = 4.8;
  }
  // After the result, each ballot flies as a ticket stub from the voter's seat to the person they chose.
  let votesFlownKey = '', tallyKey = '';
  const voteKey = () => [state.code, state.match, state.round, state.history.length].join(':');
  const BALLOT = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="9" width="14" height="8.5" rx="1.6" fill="currentColor" opacity=".35"/><path d="M6.5 3.5h7v8h-7z" fill="#fffaf0" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8.2 7.4l1.4 1.4 2.4-2.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.5 12.5h15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  function tallyBadge(n, lead) { const b = el('span', { class: 'vote-tally' + (lead ? ' lead' : ''), 'aria-label': n + (n === 1 ? ' vote' : ' votes') }); b.innerHTML = BALLOT; b.append(txt('b', '', String(n)), txt('small', '', n === 1 ? 'vote' : 'votes')); return b; }
  function voteTallies() {
    const entry = state.history.at(-1), t = new Map();
    if (state.phase !== 'voteResult' || entry?.type !== 'vote' || !entry.votes || tallyKey !== voteKey()) return t;
    for (const v of entry.votes) if (v.targetId) t.set(v.targetId, (t.get(v.targetId) || 0) + v.weight);
    return t;
  }
  function flyVotes() {
    const entry = state?.history.at(-1);
    if (state?.phase !== 'voteResult' || entry?.type !== 'vote' || !entry.votes || cinemaNode || state.paused) return;
    const key = voteKey(); if (votesFlownKey === key) return; votesFlownKey = key;
    if (!motionOK) { tallyKey = key; render(); return; }
    const seatOf = id => { const n = root.querySelector(`.lounge-seat[data-player="${id}"] .seated-traveller`); if (!n) return null; const r = n.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight ? [r.left + r.width / 2, r.top + r.height * .35, n.closest('.lounge-seat')] : null; };
    const tally = new Map(), top = Math.max(0, ...[...entry.votes.reduce((m, v) => v.targetId ? m.set(v.targetId, (m.get(v.targetId) || 0) + v.weight) : m, new Map()).values()]);
    let flying = 0;
    const landed = () => { if (--flying === 0 && votesFlownKey === key) { tallyKey = key; if (state.phase === 'voteResult' && !root.querySelector('.vote-tally')) render(); } };
    (entry.votes || []).filter(v => v.targetId).forEach((v, i) => {
      const from = seatOf(v.id), to = seatOf(v.targetId); if (!from || !to) return; flying++;
      const stub = el('div', { class: 'vote-stub', 'aria-hidden': 'true' }, avatar(v.id, 'stub-face'), v.weight === 2 ? txt('b', '', '×2') : null);
      document.body.append(stub);
      const dx = to[0] - from[0], dy = to[1] - from[1], lift = -Math.min(90, Math.hypot(dx, dy) * .4);
      const a = stub.animate([{ transform: `translate(${from[0]}px,${from[1]}px) scale(.4) rotate(-12deg)`, opacity: 0 }, { transform: `translate(${from[0] + dx * .5}px,${from[1] + dy * .5 + lift}px) scale(1) rotate(6deg)`, opacity: 1, offset: .5 }, { transform: `translate(${to[0]}px,${to[1]}px) scale(.7) rotate(0)`, opacity: 1 }], { duration: 760, delay: 400 + i * 160, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'both' });
      a.onfinish = () => { stub.remove(); landed(); const seat = to[2]; if (!seat.isConnected) return; tally.set(v.targetId, (tally.get(v.targetId) || 0) + v.weight);
        const n = tally.get(v.targetId), chip = tallyBadge(n, n === top); seat.querySelector('.vote-tally')?.remove(); seat.querySelector('.seat-caption')?.append(chip); chip.animate([{ scale: '1.6' }, { scale: '1' }], { duration: 300, easing: 'cubic-bezier(.3,1.6,.5,1)' }); sfx.play('tick'); };
      a.oncancel = landed;
    });
    if (!flying) { tallyKey = key; render(); }
  }
  function updateOverlayViewport() {
    const viewport = window.visualViewport;
    overlayRoot.style.top = (viewport?.offsetTop || 0) + 'px';
    overlayRoot.style.height = (viewport?.height || innerHeight) + 'px';
  }
  function chatLog() {
    const night = ['settling','night'].includes(state.phase);
    // At night, earlier conversations stay readable (and playable) from the cabin.
    if ((state.settings.discussion !== 'chat' && !state.speeches.length) || (night && !state.speeches.length) || !['settling','night','gathering','morning','discussion','voting','revoteInfo','voteResult','finished'].includes(state.phase)) return null;
    const rounds = [...new Set(state.speeches.map(m => m.round))];
    return el('section', { class: 'panel train-chat' }, el('div', {class:'panel-heading'}, el('h2',{},'Conversations Aboard'), txt('small','muted','ONE VOICE AT A TIME')),
      rounds.length ? el('div', { class: 'night-accordions' }, ...rounds.map(round => {
        const messages = state.speeches.filter(m => m.round === round);
        return el('details', { class: 'night-accordion', 'data-details': 'chat-night-' + round, open: round === (night ? rounds.at(-1) : state.round) }, el('summary', {}, nightBadge(round), txt('b', '', 'The Morning Conversation'), txt('small', '', messages.length + (messages.length === 1 ? ' voice' : ' voices')), txt('span', 'accordion-chevron', '⌄')), el('div', {class:'public-messages',role:'log','aria-label':'Shared findings · Night ' + round}, ...messages.map(m => el('article', {class:'public-message'}, avatar(m.id, 'message-avatar'), el('div',{}, el('div', {class:'message-byline'}, el('b',{ class: allyCls(m.id).trim() },who(m.id)), txt('small','','SEAT ' + player(m.id).seat)), m.gagged ? txt('p','gagged-note','🤐 Gagged by a Saboteur. No words this round.') : m.audio ? voice.player(m) : el('p',{'data-no-tr':''},m.text))))));
      })) : txt('p','muted small','Messages will appear here when the conversation begins.'));
  }
  // One badge for a night everywhere it appears: a moon and a big night number, so nights stand apart at a glance.
  const nightBadge = round => el('span', { class: 'night-tag night-badge', 'data-night': String(round % 4) }, txt('span', 'night-moon', '☾'), txt('small', '', 'NIGHT'), txt('b', '', String(round)));
  function history() {
    const rounds = [...new Set(state.history.map(e => e.round))];
    return rounds.length ? el('section', { class: 'history journey-log' }, el('div', { class: 'log-heading' }, txt('span','eyebrow','THE JOURNEY LOG'), el('h2', {}, 'Along The Way')),
      el('div', { class: 'night-accordions' }, ...rounds.map(round => {
        const entries = state.history.filter(e => e.round === round), outsCount = entries.reduce((n, e) => n + e.outs.length, 0);
        return el('details', { class: 'night-accordion', 'data-details': 'log-night-' + round, open: round === state.round }, el('summary', {}, nightBadge(round), txt('b', '', 'From Nightfall To The Vote'), txt('small', '', outsCount ? outsCount + ' Out' : 'All Aboard'), txt('span', 'accordion-chevron', '⌄')), el('div', { class: 'night-log-body' }, ...entries.map(entry => el('section', { class: 'night-log-event' }, el('h3', {}, entry.type === 'night' ? 'At Daybreak' : entry.reason === 'revote' ? 'First vote · tied' : entry.attempt === 2 ? 'Re-vote' : 'The group’s vote'), outs(entry), entry.votes ? ledger(entry) : null))));
      }))) : null;
  }
  function standingTraveller(p) {
    const index = p.avatarIndex ?? Math.max(0, p.seat - 1);
    // Alpha bounds differ in each atlas cell. Center the person and place their soles on the nameplate's ground line.
    const centerOffsets = [-17.2, -1.76, 2.88, 7.96, -14.17, -5.75, 3.04, 1.43, -7.64, -8.31, 4.15, 2.71];
    const groundOffsets = [1.435, .239, 1.435, 0, .957, 1.196, 1.435, 1.675, 4.067, 5.742, 5.024, 5.263];
    return el('div', { class: 'standing-traveller', 'data-avatar-index': index, 'aria-hidden': 'true', style: '--px:' + (index % 4 * 100 / 3) + '%;--py:' + (Math.floor(index / 4) * 50) + '%;--figure-shift:' + (centerOffsets[index] || 0) + '%;--ground-shift:' + (groundOffsets[index] || 0) + '%' });
  }
  const AWARDS = [
    ['eye', 'Sharpest Eye', 'Most votes on Saboteurs', '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="mEr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#16656a"/><stop offset=".5" stop-color="#3fc7c0"/><stop offset="1" stop-color="#16656a"/></linearGradient><linearGradient id="mErim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4c8"/><stop offset=".35" stop-color="#e6b453"/><stop offset=".7" stop-color="#a8701f"/><stop offset="1" stop-color="#ffe29a"/></linearGradient><radialGradient id="mEf" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#1a4d5c"/><stop offset="1" stop-color="#0b1f2c"/></radialGradient></defs><path d="M17 1h11l7 23-8.5 5z" fill="url(#mEr)"/><path d="M47 1H36l-7 23 8.5 5z" fill="url(#mEr)"/><path d="M22.5 1h2.5l7 23-2.4 1.4zM41.5 1H39l-7 23 2.4 1.4z" fill="#fff" opacity=".22"/><ellipse cx="32" cy="61" rx="15" ry="2.2" fill="#000" opacity=".28"/><circle cx="32" cy="39" r="21" fill="url(#mErim)"/><circle cx="32" cy="39" r="21" fill="none" stroke="#7a4e14" stroke-width=".8" opacity=".6"/><circle cx="32" cy="39" r="16.6" fill="url(#mEf)"/><circle cx="32" cy="39" r="16.6" fill="none" stroke="#5a3a0e" stroke-width="1" opacity=".55"/><circle cx="32" cy="39" r="18.8" fill="none" stroke="#fff3c6" stroke-width=".7" stroke-dasharray="1.2 2.2" opacity=".8"/><circle cx="29.5" cy="37" r="10.2" fill="#d9fbff" opacity=".2" stroke="#f2feff" stroke-width="2.8"/><path d="M36.8 44.3l6.4 6.4" stroke="#f2ce86" stroke-width="4.8" stroke-linecap="round"/><path d="M36.8 44.3l6.4 6.4" stroke="#7a4e14" stroke-width="1" stroke-linecap="round" opacity=".5"/><path d="M21.6 37q7.9-7.6 15.8 0-7.9 7.6-15.8 0z" fill="#fff"/><circle cx="29.5" cy="37" r="3.7" fill="#14a3ad"/><circle cx="29.5" cy="37" r="1.7" fill="#04212a"/><circle cx="30.8" cy="35.7" r=".9" fill="#fff"/><path d="M17.5 31a16 16 0 0 1 11-8.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".55"/><path d="M50 18l1.1 2.7 2.7 1.1-2.7 1.1L50 25.6l-1.1-2.7-2.7-1.1 2.7-1.1z" fill="#fff6d2"/></svg>'],
    ['liar', 'Best Liar', 'The Saboteur who hid best', '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="mLr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6a2a5c"/><stop offset=".5" stop-color="#d46ab0"/><stop offset="1" stop-color="#6a2a5c"/></linearGradient><linearGradient id="mLrim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4c8"/><stop offset=".35" stop-color="#e6b453"/><stop offset=".7" stop-color="#a8701f"/><stop offset="1" stop-color="#ffe29a"/></linearGradient><radialGradient id="mLf" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#5a2a62"/><stop offset="1" stop-color="#21102a"/></radialGradient></defs><path d="M17 1h11l7 23-8.5 5z" fill="url(#mLr)"/><path d="M47 1H36l-7 23 8.5 5z" fill="url(#mLr)"/><path d="M22.5 1h2.5l7 23-2.4 1.4zM41.5 1H39l-7 23 2.4 1.4z" fill="#fff" opacity=".22"/><ellipse cx="32" cy="61" rx="15" ry="2.2" fill="#000" opacity=".28"/><circle cx="32" cy="39" r="21" fill="url(#mLrim)"/><circle cx="32" cy="39" r="21" fill="none" stroke="#7a4e14" stroke-width=".8" opacity=".6"/><circle cx="32" cy="39" r="16.6" fill="url(#mLf)"/><circle cx="32" cy="39" r="16.6" fill="none" stroke="#5a3a0e" stroke-width="1" opacity=".55"/><circle cx="32" cy="39" r="18.8" fill="none" stroke="#fff3c6" stroke-width=".7" stroke-dasharray="1.2 2.2" opacity=".8"/><g transform="rotate(14 36 38)"><path d="M29 29h14v8.5c0 5.5-3.2 9.5-7 9.5s-7-4-7-9.5z" fill="#9b5bb5" stroke="#e9c9ff" stroke-width=".8"/><path d="M31.6 35.2q1.6-1.4 3.2 0M37.4 35.2q1.6-1.4 3.2 0" stroke="#2a0f3a" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M32.6 42.4q3.4-2.6 6.8 0" stroke="#2a0f3a" stroke-width="1.3" fill="none" stroke-linecap="round"/></g><g transform="rotate(-12 28 40)"><path d="M20.5 30.5h15v9c0 6-3.4 10-7.5 10s-7.5-4-7.5-10z" fill="#fffaf2" stroke="#c9a96a" stroke-width=".8"/><path d="M23 36.5q1.8-1.8 3.6 0M29.4 36.5q1.8-1.8 3.6 0" stroke="#3a1a40" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M23.8 41.6q4.2 3.6 8.4 0" stroke="#c3366f" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="23" cy="39.6" r="1.2" fill="#ff9ab8" opacity=".7"/><circle cx="33" cy="39.6" r="1.2" fill="#ff9ab8" opacity=".7"/></g><path d="M17.5 31a16 16 0 0 1 11-8.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".55"/><path d="M50 18l1.1 2.7 2.7 1.1-2.7 1.1L50 25.6l-1.1-2.7-2.7-1.1 2.7-1.1z" fill="#fff6d2"/></svg>'],
    ['guard', 'Guardian', 'Most attacks stopped', '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="mGr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22337a"/><stop offset=".5" stop-color="#5b86ff"/><stop offset="1" stop-color="#22337a"/></linearGradient><linearGradient id="mGrim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4c8"/><stop offset=".35" stop-color="#e6b453"/><stop offset=".7" stop-color="#a8701f"/><stop offset="1" stop-color="#ffe29a"/></linearGradient><radialGradient id="mGf" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#2a3a7a"/><stop offset="1" stop-color="#0f1638"/></radialGradient></defs><path d="M17 1h11l7 23-8.5 5z" fill="url(#mGr)"/><path d="M47 1H36l-7 23 8.5 5z" fill="url(#mGr)"/><path d="M22.5 1h2.5l7 23-2.4 1.4zM41.5 1H39l-7 23 2.4 1.4z" fill="#fff" opacity=".22"/><ellipse cx="32" cy="61" rx="15" ry="2.2" fill="#000" opacity=".28"/><circle cx="32" cy="39" r="21" fill="url(#mGrim)"/><circle cx="32" cy="39" r="21" fill="none" stroke="#7a4e14" stroke-width=".8" opacity=".6"/><circle cx="32" cy="39" r="16.6" fill="url(#mGf)"/><circle cx="32" cy="39" r="16.6" fill="none" stroke="#5a3a0e" stroke-width="1" opacity=".55"/><circle cx="32" cy="39" r="18.8" fill="none" stroke="#fff3c6" stroke-width=".7" stroke-dasharray="1.2 2.2" opacity=".8"/><path d="M32 26.5l10 3.6v8.2c0 6.6-4.2 11-10 13.4-5.8-2.4-10-6.8-10-13.4v-8.2z" fill="#fff3d0" stroke="#a8701f" stroke-width="1"/><path d="M32 29.3l7.4 2.7v6.4c0 5.1-3.1 8.5-7.4 10.4-4.3-1.9-7.4-5.3-7.4-10.4V32z" fill="#2f5bd0"/><path d="M32 29.3v19.5c-4.3-1.9-7.4-5.3-7.4-10.4V32z" fill="#4f7cff"/><path d="M32 33.2l1.5 3.1 3.4.5-2.5 2.4.6 3.4-3-1.6-3 1.6.6-3.4-2.5-2.4 3.4-.5z" fill="#ffe08a"/><path d="M17.5 31a16 16 0 0 1 11-8.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".55"/><path d="M50 18l1.1 2.7 2.7 1.1-2.7 1.1L50 25.6l-1.1-2.7-2.7-1.1 2.7-1.1z" fill="#fff6d2"/></svg>'],
  ];
  const medal = svg => { const n = el('span', { class: 'award-medal', 'aria-hidden': 'true' }); n.innerHTML = svg; return n; };
  function awardsPanel() {
    const awards = state.awards || { eye: [], liar: [], guard: [] }, sess = state.session || {}, earned = state.me.wallet?.earnings || [];
    const table = state.players.filter(p => sess[p.id]?.journeys).sort((a, b) => sess[b.id].wins - sess[a.id].wins || sess[b.id].eye + sess[b.id].liar + sess[b.id].guard - (sess[a.id].eye + sess[a.id].liar + sess[a.id].guard));
    return el('section', { class: 'panel journey-awards' }, txt('span', 'eyebrow', 'JOURNEY AWARDS'), el('h2', {}, 'Tonight’s Honours'),
      el('div', { class: 'award-cards' }, ...AWARDS.map(([key, name, about, art]) => el('article', { class: 'award-card award-' + key }, medal(art), txt('b', '', name), txt('small', '', about),
        el('div', { class: 'award-winners' }, ...(awards[key].length ? awards[key].map(id => el('span', { class: 'award-winner' }, avatar(id, 'award-face'), txt('span', '', id === state.meId ? 'You' : who(id)))) : [txt('span', 'award-none', 'Nobody this time')]))))),
      earned.length ? el('div', { class: 'wp-earned' }, el('div', { class: 'wp-earned-head' }, txt('b', '', 'Your WP this journey'), txt('span', 'wp-badge', '+' + earned.reduce((a, e) => a + e.n, 0) + ' WP')), ...earned.map(e => el('p', {}, txt('span', '', e.reason), txt('b', '', '+' + e.n)))) : null,
      table.length ? el('div', { class: 'session-board' }, txt('span', 'eyebrow', 'THIS ROOM SO FAR'), el('div', { class: 'session-table', role: 'table', 'aria-label': 'Session scoreboard' },
        el('div', { class: 'session-row head', role: 'row' }, txt('span', '', 'Traveller'), txt('span', '', 'Wins'), ...AWARDS.map(([key, name, , art]) => { const h = medal(art); h.title = name; h.setAttribute('aria-label', name); h.removeAttribute('aria-hidden'); return h; })),
        ...table.map(p => el('div', { class: 'session-row' + (p.id === state.meId ? ' me' : ''), role: 'row' }, el('span', { class: 'session-name' }, avatar(p, 'session-face'), txt('span', '', p.id === state.meId ? 'You' : p.name)), txt('b', '', sess[p.id].wins + '/' + sess[p.id].journeys), ...['eye', 'liar', 'guard'].map(k => txt('span', sess[p.id][k] ? 'has' : '', String(sess[p.id][k]))))))) : null);
  }
  // The finale replays every night: who was targeted, who was protected, who checked whom.
  // Older journeys logged one walk as an object; newer ones log every walk in a list.
  const WALK_LABEL = { brave: 'Brave', porter: 'Night Porter', guard: 'Guard', steward: 'Steward' }, WALK_ICON = { brave: '🛡️', porter: '🏮', guard: '💂', steward: '💊' };
  const walksOf = n => (Array.isArray(n.footsteps) ? n.footsteps : n.footsteps ? [{ kind: 'saboteur', ...n.footsteps }] : []).filter(w => w.route);
  function nightReplay() {
    const log = state.nightLog || []; if (!log.length) return null;
    const line = (icon, text, ...ids) => el('li', { class: 'replay-line' }, txt('span', 'replay-icon', icon), txt('span', 'replay-text', text), el('span', { class: 'replay-faces' }, ...ids.filter(Boolean).map(id => avatar(id, 'replay-face'))));
    const name = id => who(id) + ' (' + role(player(id)?.role).name + ')';
    return el('section', { class: 'panel night-replay' }, txt('span', 'eyebrow', 'WHAT REALLY HAPPENED'), el('h2', {}, 'Night Replay'),
      ...log.map(n => el('article', { class: 'replay-night' }, el('h3', {}, nightBadge(n.round), n.event ? txt('span', 'replay-event', (EVENT_ICONS[n.event] || '✦') + ' ' + ({ 'long-tunnel': 'Long Tunnel', express: 'Express Stop', fog: 'Fogged Windows', snack: 'Midnight Snack', 'power-cut': 'Power Cut', sealed: 'Sealed Ballots', luggage: 'Lost Luggage', 'full-moon': 'Full Moon', quiet: 'Quiet Carriage' }[n.event] || n.event)) : null),
        el('ol', {}, ...[
          n.attackId ? line('🗡️', 'The Saboteurs attacked ' + name(n.attackId) + '.', n.attackId) : line('🗡️', 'The Saboteurs chose no attack.'),
          n.blockedId ? line('🚫', 'The Blocker blocked ' + name(n.blockedId) + '.', n.blockedId) : null,
          n.disguiseId ? line('🎭', 'The Forger disguised ' + name(n.disguiseId) + '.', n.disguiseId) : null,
          ...(n.locks?.length ? n.locks.map(l => line('🔒', name(l.by) + ' locked their door' + (n.lockId === l.by ? ', which stopped the attack' : '') + (l.heardBy?.length ? '. ' + l.heardBy.map(who).join(' and ') + ' heard it click.' : '.'), l.by)) : n.lockId ? [line('🔒', name(n.lockId) + ' locked their door.', n.lockId)] : []),
          n.coverId ? line('🛡️', 'Brave protected ' + name(n.coverId) + '.', n.coverId) : null,
          n.healId ? line('🧪', 'Medic healed ' + name(n.healId) + '.', n.healId) : null,
          n.poisonId ? line('☠️', 'Medic poisoned ' + name(n.poisonId) + '.', n.poisonId) : null,
          ...(n.checks || []).map(c => line('🔎', who(c.by) + ' checked ' + name(c.targetId) + '.', c.by, c.targetId)),
          ...(n.sights || []).map(x => line(x.type === 'glimpse' ? '👀' : '👁️', who(x.by) + (x.type === 'glimpse' ? ' glimpsed faces in the corridor.' : ' watched the attack.'), x.by)),
          n.frameId ? line('🖼️', 'The Framer framed ' + name(n.frameId) + '.', n.frameId) : null,
          n.gagId ? line('🤐', 'The Silencer gagged ' + name(n.gagId) + '.', n.gagId) : null,
          n.silentWalk ? line('📦', 'The attack was smuggled: ' + who(n.silentWalk.by) + ' walked to ' + who(n.silentWalk.to) + ' without a sound.', n.silentWalk.by) : null,
          n.sleepId ? line('💊', 'The Steward gave ' + name(n.sleepId) + ' a sleeping pill.', n.sleepId) : null,
          ...(n.guards || []).map(g => line('💂', who(g.by) + (g.stopped ? ' could not guard tonight.' : n.guardTook === g.by ? ' guarded ' + name(g.targetId) + ' and took the attack.' : ' guarded ' + name(g.targetId) + '.'), g.by, g.targetId)),
          ...(n.posts || []).map(g => line('🏮', who(g.by) + (g.stopped ? ' could not keep watch tonight.' : ' watched ' + name(g.targetId) + '’s door.'), g.by, g.targetId)),
          ...(n.manifests || []).map(g => line('🎫', who(g.by) + ' checked ' + name(g.targetId) + '’s ticket.', g.by, g.targetId)),
          n.signal ? line('🚦', who(n.signal.by) + (n.signal.stopped ? ' tried to call a Signal Stop, but was stopped.' : ' called a Signal Stop.'), n.signal.by) : null,
          ...walksOf(n).map(w => line(w.kind === 'saboteur' ? '👣' : WALK_ICON[w.kind] || '👣', who(w.by) + (WALK_LABEL[w.kind] ? ' (' + WALK_LABEL[w.kind] + ') walked from cabin ' : ' walked from cabin ') + String(w.from).padStart(2, '0') + ' to cabin ' + String(w.to).padStart(2, '0') + (w.heardBy ? '. ' + who(w.heardBy) + ' heard the footsteps.' : '. Nobody heard them.'), w.by)),
          n.outs.length ? line('🎟️', n.outs.map(o => who(o.id)).join(' and ') + (n.outs.length > 1 ? ' were' : ' was') + ' out by morning.', ...n.outs.map(o => o.id)) : line('☀️', 'Everyone woke up.'),
        ].filter(Boolean)), walksOf(n).length ? carriageMap({ walks: walksOf(n), victim: n.attackId }) : null)));
  }
  function ghostStrip() {
    const ghosts = Object.entries(state.ghosts || {}); if (!ghosts.length) return null;
    const bad = new Set(state.players.filter(p => p.group === 'saboteur').map(p => p.id)), roleOf = id => state.players.find(p => p.id === id) || {};
    return el('section', { class: 'panel ghost-strip' }, el('div', { class: 'ghost-strip-head' }, ghostIcon(), el('div', {}, txt('span', 'eyebrow', 'FROM BEYOND THE TRAIN'), el('h2', {}, 'Ghost Guesses'))),
      ...ghosts.map(([id, g]) => el('div', { class: 'ghost-row' }, el('span', { class: 'ghost-who' }, avatar(id, 'replay-face'), txt('b', '', id === state.meId ? 'You' : who(id)), g.kind === 'powers' ? txt('small', 'ghost-kind', 'Powers') : null), el('span', { class: 'ghost-picks' }, ...g.ids.map((x, i) => { const ok = g.kind === 'powers' ? [roleOf(x).role, roleOf(x).originalRole].includes(g.roles?.[i]) : bad.has(x); return el('span', { class: 'ghost-pick ' + (ok ? 'right' : 'wrong') }, avatar(x, 'replay-face'), txt('small', '', (g.roles ? role(g.roles[i]).name + ' ' : '') + (ok ? '✓' : '✗'))); })))));
  }
  const CHIP_ICONS = {
    roles: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5" width="10" height="14" rx="2" transform="rotate(-10 8.5 12)" fill="#f2ce86" stroke="#7a4c14" stroke-width="1.2"/><rect x="10" y="4.5" width="10" height="14" rx="2" transform="rotate(8 15 11.5)" fill="#fff3d6" stroke="#7a4c14" stroke-width="1.2"/><circle cx="15" cy="10" r="2" fill="#c94b68"/><path d="M12.4 15.2c.6-1.6 1.6-2.3 2.6-2.3s2 .7 2.6 2.3" stroke="#c94b68" stroke-width="1.6" stroke-linecap="round"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7h3.5c2.2 0 3.4 1 4.6 3l1.8 3.2c1.1 2 2.4 3 4.6 3H20M3 17h3.5c2.2 0 3.4-1 4.6-3M14.5 9.8c1-1.8 2.3-2.8 4-2.8H20" stroke="#8fd6ff" stroke-width="2" stroke-linecap="round"/><path d="M17.5 4.5 20.5 7l-3 2.5M17.5 13.5l3 2.5-3 2.5" stroke="#8fd6ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    votes: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="11" width="16" height="9" rx="2" fill="#c9893f" stroke="#7a4e14" stroke-width="1.2"/><path d="M8 4.5h8v9H8z" fill="#fffaf0" stroke="#7a4e14" stroke-width="1.2"/><path d="M10 9l1.5 1.5 3-3.2" stroke="#2fae6c" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 14.5h17" stroke="#7a4e14" stroke-width="1.6" stroke-linecap="round"/></svg>',
  };
  function actionChip(icon, title, sub, click, disabled, key) {
    const b = btn('', click, 'action-chip chip-' + icon, disabled, key); b.setAttribute('aria-label', title);
    b.innerHTML = '<span class="chip-icon">' + CHIP_ICONS[icon] + '</span><span class="chip-copy"><b></b><small></small></span>';
    b.querySelector('b').textContent = title; b.querySelector('small').textContent = sub; return b;
  }
  function finale() {
    const latest = state.history.at(-1), bad = state.winner === 'bad';
    const winners = state.players.filter(p => (p.group === 'saboteur') === bad);
    return el('div', {class:'finale'}, el('section', {class:'world finale-scene ' + (bad ? 'bad-victory' : 'good-victory')},
      el('div', {class:'winner-stage'}, art('lounge-room'), el('div', {class:'winner-heading'}, txt('span','eyebrow','THE LAST WORD'), trainMark('victory-mark'), el('h1',{},bad ? 'The Saboteurs win!' : 'The good team wins!'), txt('p','',bad ? 'They played their part. They kept their secrets.' : 'The truth made it through the night.'), txt('small','winner-reason',state.winReason)),
        txt('div','winner-team-label','THE WINNING TEAM'), el('div', {class:'winner-cast',style:'--winners:'+winners.length+';--winner-columns:'+Math.min(3,winners.length)}, ...winners.map(p => el('article',{class:'winner-person'},standingTraveller(p),el('div',{class:'winner-nameplate'},el('b',{},p.name + (p.id === state.meId ? ' · You' : '')),txt('small','',role(p.role).name))))),
        el('div',{class:'victory-actions'},state.hostId === state.meId ? startJourneyButton(state.players.filter(p => !p.departed).length < 5, true) : txt('p','waiting','The host can start another journey.'), el('div', { class: 'victory-role-actions' }, ...[
          state.hostId === state.meId ? actionChip('roles', 'Choose Roles', state.settings.autoShuffle ? 'Pick by hand' : 'Set the mix', roleSettingsDialog, state.players.filter(p => !p.departed).length < 5) : null,
          // With auto shuffle on, every new journey already draws a fresh mix.
          state.hostId === state.meId ? actionChip('shuffle', 'Shuffle Roles', 'Random mix', () => send('shuffleRoles'), state.players.filter(p => !p.departed).length < 5) : null,
          latest?.votes ? actionChip('votes', 'Final Vote', 'Who voted whom', () => ledgerDialog(latest), false, 'final-vote') : null].filter(Boolean)))),
      el('section',{class:'panel final-manifest'},txt('span','eyebrow','BEHIND EVERY FACE'),el('h2',{},'The Full Cast'),el('div',{class:'final-roles'},...state.players.map(p=>el('div',{class:'final-role '+p.group},avatar(p,'role-icon'),el('div',{},txt('b','',p.name + (p.id === state.meId ? ' · You' : '')),txt('small','',role(p.role).name + ' · ' + (p.group === 'saboteur' ? 'BAD' : 'GOOD')))))))),awardsPanel(),nightReplay(),ghostStrip(),chatLog(),history());
  }
  // Ghost guess: right after going out, good players lock in who they think the Saboteurs are.
  const GHOST_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="lt-ghost-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#e3dcff"/><stop offset="1" stop-color="#a996f2"/></linearGradient><radialGradient id="lt-ghost-glow"><stop offset="0" stop-color="#b8a6ff" stop-opacity=".55"/><stop offset="1" stop-color="#b8a6ff" stop-opacity="0"/></radialGradient></defs><circle cx="23" cy="24" r="22" fill="url(#lt-ghost-glow)"/><path d="M22 5.5c-8.6 0-14 6.6-14 15.2v17.6c0 1.5 1.7 2.3 2.9 1.3l2.5-2.1 2.9 2.5a2.3 2.3 0 0 0 3 0l2.7-2.4 2.7 2.4a2.3 2.3 0 0 0 3 0l2.9-2.5 2.5 2.1c1.2 1 2.9.2 2.9-1.3V20.7c0-8.6-5.4-15.2-14-15.2z" fill="url(#lt-ghost-body)" stroke="#6d5bd0" stroke-width="1.3" stroke-linejoin="round"/><path d="M13 13.5c1.6-3.3 4.7-5.3 8.4-5.6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".9"/><ellipse cx="17.3" cy="20" rx="2.3" ry="3.1" fill="#2a1d55"/><ellipse cx="26.7" cy="20" rx="2.3" ry="3.1" fill="#2a1d55"/><circle cx="18" cy="18.9" r=".9" fill="#fff"/><circle cx="27.4" cy="18.9" r=".9" fill="#fff"/><ellipse cx="22" cy="26.6" rx="1.7" ry="2.1" fill="#2a1d55"/><circle cx="13.6" cy="24.6" r="1.9" fill="#ff9ec2" opacity=".55"/><circle cx="30.4" cy="24.6" r="1.9" fill="#ff9ec2" opacity=".55"/><path d="M33.5 27.5c2 .2 3.3 1 4 2.3" fill="none" stroke="#c9bdf7" stroke-width="3" stroke-linecap="round"/><circle cx="38.5" cy="33" r="5.2" fill="#bdf6ff55" stroke="#f2c86b" stroke-width="2.4"/><path d="M36.6 31.2a2.6 2.6 0 0 1 2.6-.9" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/><path d="M42.2 36.7l3.3 3.3" stroke="#d99a2b" stroke-width="3.2" stroke-linecap="round"/></svg>';
  const ghostIcon = cls => { const n = el('span', { class: 'ghost-icon ' + (cls || ''), 'aria-hidden': 'true' }); n.innerHTML = GHOST_ICON; return n; };
  // Ghost Climb: after the ghost guess, players who are out can climb to the peak to learn one traveller's role.
  function climbCard() {
    const me = state.me; if (!me.climbOpen || !window.createGhostClimb) return null;
    const seen = (me.reports || []).filter(r => r.type === 'ghostReveal');
    return el('section', { class: 'climb-card' }, el('div', { class: 'climb-card-art', 'aria-hidden': 'true' }), el('div', { class: 'climb-card-copy' },
      txt('span', 'eyebrow', 'GHOST CLIMB'), el('h3', {}, 'Escape Up The Luggage'), txt('p', '', 'Climb to the green signal to see one traveller’s role. Ghosts stay silent: no hints to the living.'),
      seen.length ? el('div', { class: 'climb-seen' }, ...seen.map(r => el('span', { class: 'climb-seen-item' }, avatar(r.targetId, 'climb-seen-face'), el('span', {}, txt('b', '', who(r.targetId)), txt('small', '', role(r.role).name))))) : null,
      // A finished climb whose reveal was not picked yet keeps its reward.
      me.ghostClimb && !me.ghostClimb.done && climbedSeeds.has(me.ghostClimb.seed) ? btn('Choose Whose Role To See', pickReveal, 'gold climb-start', busy || state.paused, 'pick-reveal')
        : btn(seen.length ? 'Climb Again' : 'Start The Climb', startClimb, 'gold climb-start', busy || state.paused, 'start-climb')));
  }
  const climbedSeeds = new Set();
  async function startClimb() {
    await send('ghostClimb'); const run = state?.me.ghostClimb; if (!run || run.done) return;
    climbNewsKey = newsKey(); climbHandle = window.createGhostClimb({ seed: run.seed, sfx, onAudio: on => soundtrack.hold('climb', on),
      onFinish: () => { climbHandle = null; climbedSeeds.add(run.seed); render(); if (state.phase !== 'finished') pickReveal(); }, onClose: () => { climbHandle = null; } });
  }
  // While a ghost climbs, news from the train arrives as short lines; when the journey ends, the climb closes.
  let climbHandle = null, climbNewsKey = '';
  const newsKey = () => state ? [state.match, ['settling', 'night'].includes(state.phase) ? 'night' : state.phase, state.round, state.phase === 'discussion' ? state.speakerId : '', state.history.length, state.voteAttempt || 1].join(':') : '';
  function syncClimbNews() {
    if (!climbHandle?.open || !state) return;
    if (state.phase === 'finished') { climbHandle.end(state.winner === 'good' ? 'The good team won the journey.' : 'The Saboteurs won the journey.'); climbHandle = null; return; }
    const key = newsKey(); if (key === climbNewsKey) return; climbNewsKey = key;
    const latest = state.history.at(-1), names = ids => ids.map(o => who(o.id)).join(' and ');
    const text = ['settling', 'night'].includes(state.phase) ? 'Night ' + state.round + ' falls. Cabins are dark.'
      : state.phase === 'morning' ? (latest?.outs.length ? 'Morning: ' + names(latest.outs) + (latest.outs.length > 1 ? ' are out.' : ' is out.') : 'Morning: everyone is still aboard.')
      : state.phase === 'discussion' ? who(state.speakerId) + ' has the floor.'
      : state.phase === 'voting' ? (state.voteAttempt === 2 ? 'A tie. They vote again.' : 'The vote is open.')
      : state.phase === 'voteResult' ? (latest?.outs.length ? names(latest.outs) + ' left the train.' : 'Nobody left the train.') : '';
    climbHandle.notify(text);
  }
  function pickReveal() {
    const seen = new Set((state.me.reports || []).filter(r => r.type === 'ghostReveal').map(r => r.targetId));
    const d = dialog('Whose role will you see?', el('div', { class: 'target-hint' }, ghostIcon('tone-icon ghost-tone'), txt('p', '', 'You reached the peak. Choose one traveller. Only you will see their role.'))); d.classList.add('target-dialog', 'tone-pin', 'reveal-dialog');
    d.append(el('div', { class: 'manifest-targets' }, ...state.players.filter(p => p.id !== state.meId && !seen.has(p.id)).map(p => targetCard(p, async () => {
      d.close(); await send('ghostReveal', { targetId: p.id });
      const r = (state.me.reports || []).find(x => x.type === 'ghostReveal' && x.targetId === p.id); if (!r) return;
      const res = dialog('From the peak', el('section', { class: 'private-night-result reveal-result' }, txt('span', 'eyebrow', 'ONLY YOU CAN SEE THIS'), avatar(r.targetId, 'result-portrait'), el('h3', {}, who(r.targetId)), rolePortrait(r.role, 'reveal-role-art'), txt('strong', 'result-verdict', role(r.role).name.toUpperCase()), txt('p', '', 'Keep it to yourself. Ghosts do not help the living.')));
      res.append(btn('Got It', () => res.close(), 'gold')); sfx.play('chime');
    }))), el('div', { class: 'confirm-bar' }, btn('Choose Later', () => d.close(), 'text-button')));
  }
  // The ghost area: the guess first, then the climb once the guess is settled.
  function ghostBlock() {
    const guess = ghostGuessBlock(), climb = state.phase === 'finished' ? null : climbCard();
    return guess || climb ? el('div', { class: 'ghost-stack' }, guess, climb) : null;
  }
  function ghostGuessBlock() {
    const me = state.me;
    if (me.observer || me.alive || !state.saboteurCount || ['lobby', 'finished'].includes(state.phase)) return null;
    if (me.ghostGuess) return el('div', { class: 'ghost-block locked' }, ghostIcon(), el('div', {}, txt('b', '', me.ghostGuess.kind === 'powers' ? 'Your Powers Guess Is Locked' : 'Your Ghost Guess Is Locked'), el('div', { class: 'ghost-faces' }, ...me.ghostGuess.ids.map((id, i) => el('span', { class: 'ghost-face' }, avatar(id), txt('small', '', who(id) + (me.ghostGuess.roles ? ' · ' + role(me.ghostGuess.roles[i]).name : ''))))), txt('small', '', 'Revealed at the end. +5 WP for each right guess.')));
    if (!me.ghostOpen || !me.ghostNeed) return null;
    const n = me.ghostNeed, powers = me.ghostKind === 'powers', gone = state.saboteurCount - n;
    const ask = powers ? 'Who holds each power still aboard? ' + me.ghostRoles.map(r => role(r).name).join(', ') + '.'
      : (n > 1 ? 'Who are the ' + n + ' Saboteurs' : 'Who is the Saboteur') + (gone ? ' still aboard' : '') + '?';
    return el('div', { class: 'ghost-block' }, ghostIcon(), el('div', {}, txt('b', '', powers ? 'Make Your Powers Guess' : 'Make Your Ghost Guess'), txt('small', '', ask + ' Open until the journey ends. +5 WP for each right guess. Climb to the peak first to learn a role.')), btn('Guess Now', powers ? powersDialog : ghostDialog, 'gold', false, 'ghost-guess'));
  }
  // Saboteur ghosts match each power still aboard to the traveller they think holds it.
  function powersDialog() {
    const roles = state.me.ghostRoles, picks = roles.map(() => null); let active = 0;
    const d = dialog('Your powers guess', el('div', { class: 'target-hint' }, ghostIcon('tone-icon ghost-tone'), txt('p', '', 'Pick a power, then the traveller you think holds it. +5 WP for each right match. Your guess locks once you confirm.'))); d.classList.add('target-dialog', 'tone-pin', 'ghost-dialog', 'powers-dialog');
    const slots = el('div', { class: 'power-slots' }), confirm = btn('Match Every Power', () => { d.close(); send('ghostGuess', { ids: picks }); }, 'gold', true, 'confirm-ghost');
    const people = state.players.filter(p => p.id !== state.meId && p.alive !== false && !isAlly(p.id));
    const grid = el('div', { class: 'manifest-targets' }, ...people.map(p => targetCard(p, () => {
      const was = picks.indexOf(p.id); if (was >= 0) picks[was] = null; picks[active] = p.id;
      const empty = picks.findIndex(x => !x); active = empty >= 0 ? empty : active; paint();
    })));
    function paint() {
      slots.replaceChildren(...roles.map((r, i) => { const b = el('button', { type: 'button', class: 'power-slot' + (i === active ? ' active' : '') + (picks[i] ? ' set' : ''), 'aria-pressed': String(i === active) },
        el('span', { class: 'power-slot-pic' }, rolePortrait(r, 'power-slot-art'), picks[i] ? avatar(picks[i], 'power-slot-face') : null), el('span', { class: 'power-slot-text' }, txt('b', '', role(r).name), txt('small', '', picks[i] ? who(picks[i]) : 'Choose who')));
        b.onclick = () => { active = i; paint(); }; return b; }));
      grid.querySelectorAll('.manifest-target').forEach(n => { const i = picks.indexOf(n.dataset.id); n.classList.toggle('selected', i >= 0); n.setAttribute('aria-pressed', String(i >= 0)); });
      const left = picks.filter(x => !x).length; confirm.disabled = left > 0; confirm.textContent = left ? left + ' Left To Match' : 'Lock My Guess';
    }
    paint(); d.append(slots, grid, el('div', { class: 'confirm-bar' }, confirm, btn('Cancel', () => d.close(), 'text-button')));
  }
  function ghostDialog() {
    const need = state.me.ghostNeed, picked = new Set();
    const d = dialog('Your ghost guess', el('div', { class: 'target-hint' }, ghostIcon('tone-icon ghost-tone'), txt('p', '', 'Choose ' + need + ' traveller' + (need > 1 ? 's' : '') + ' still aboard you think ' + (need > 1 ? 'are Saboteurs' : 'is the Saboteur') + '. Your guess locks once you confirm.'))); d.classList.add('target-dialog', 'tone-pin', 'ghost-dialog');
    const confirm = btn('Choose ' + need, () => { d.close(); send('ghostGuess', { ids: [...picked] }); }, 'gold', true, 'confirm-ghost');
    const grid = el('div', { class: 'manifest-targets' }, ...state.players.filter(p => p.id !== state.meId && p.alive !== false).map(p => { const b = targetCard(p, () => {
      if (picked.has(p.id)) picked.delete(p.id); else if (picked.size < need) picked.add(p.id);
      grid.querySelectorAll('.manifest-target').forEach(n => { n.classList.toggle('selected', picked.has(n.dataset.id)); n.setAttribute('aria-pressed', String(picked.has(n.dataset.id))); });
      confirm.disabled = picked.size !== need; confirm.textContent = picked.size === need ? 'Lock My Guess' : 'Choose ' + (need - picked.size) + ' More'; }); return b; }));
    d.append(grid, el('div', { class: 'confirm-bar' }, confirm, btn('Cancel', () => d.close(), 'text-button')));
  }
  // Observers see only what is public. Nights are dark for them.
  function observerNight() {
    return el('section', { class: 'world observer-night', 'aria-label': 'The train is dark' }, hud('NIGHT ' + state.round, 'The train is dark.', 'Everyone is in their cabin. Observers wait for morning.'), el('div', { class: 'observer-dark', 'aria-hidden': 'true' }, txt('span', '', '☾')));
  }
  function match() {
    const scene = state.phase === 'briefing' ? introScene() : state.phase === 'boarding' ? boardingScene() : ['settling','night'].includes(state.phase) ? (state.me.observer ? observerNight() : cabinScene()) : loungeScene();
    return el('div', {class:'journey'}, scene, el('div', { class: 'journey-columns' }, chatLog(), history()));
  }
  function bridgeBoarding() {
    if (root.dataset.phase !== 'boarding' || state?.phase !== 'settling' || !motionOK) return;
    boardingExit?.remove(); clearTimeout(boardingExitTimer);
    const rect = root.getBoundingClientRect(), snapshot = root.cloneNode(true), styles = getComputedStyle(root);
    // Preserve the whole visible page, including its last video frame, while the new layout settles below it.
    snapshot.removeAttribute('id'); snapshot.inert = true;
    snapshot.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    snapshot.querySelectorAll('.scene-enter').forEach(n => n.classList.remove('scene-enter'));
    const videoCopy = snapshot.querySelector('video.boarding-video');
    if (videoCopy && boardingVideo?.readyState >= 2) {
      const frame = document.createElement('canvas'); frame.className = 'boarding-video';
      frame.width = boardingVideo.videoWidth; frame.height = boardingVideo.videoHeight;
      try { frame.getContext('2d').drawImage(boardingVideo, 0, 0); videoCopy.replaceWith(frame); } catch { videoCopy.remove(); }
    } else videoCopy?.remove();
    Object.assign(snapshot.style, { position: 'absolute', top: rect.top + 'px', left: rect.left + 'px', width: rect.width + 'px', maxWidth: 'none', padding: styles.padding, margin: '0' });
    boardingExit = el('div', { class: 'boarding-departure', 'aria-hidden': 'true' },
      el('div', { class: 'boarding-departure-frame' }, snapshot), el('div', { class: 'boarding-departure-shade' }));
    document.body.append(boardingExit);
    const exit = boardingExit;
    exit.addEventListener('animationend', e => { if (e.target === exit) { exit.remove(); if (boardingExit === exit) boardingExit = null; } });
    boardingExitTimer = setTimeout(() => { exit.remove(); if (boardingExit === exit) boardingExit = null; }, 2500);
  }
  function revoteInfoCard() {
    const ids = state.voteCandidates || state.history.at(-1)?.tiedIds || [];
    return el('div', { class: 'revote-info' }, txt('span', 'eyebrow', 'THE FIRST VOTE IS TIED'),
      el('div', { class: 'revote-candidates' }, ...ids.map(id => el('div', { class: 'revote-candidate' }, avatar(id), txt('b', '', who(id))))),
      txt('p', '', 'Vote again between these players. If the re-vote ties too, one tied player will leave at random.'),
      el('p', { class: 'revote-countdown' }, 'Re-vote begins in ', txt('span', 'countdown', ''), ' seconds.'));
  }
  function syncRevoteNotice() {
    if (state?.phase !== 'revoteInfo' || state.paused) return;
    const key = [state.code,state.match,state.round].join(':'); if (revoteNoticeKey === key) return;
    revoteNoticeKey = key;
    const d = dialog('The vote is tied.', revoteInfoCard()); d.classList.add('revote-dialog'); d.dataset.turn = fence();
    d.append(el('button', { type: 'button', class: 'gold', onclick: () => d.close() }, 'Got It'));
  }
  function currentPrivateResult() {
    // The morning's lost-luggage clue comes first after the night; the night result was already shown in the cabin.
    const clue = state?.phase !== 'night' ? state?.me.reports.find(r => r.round === state.round && ['footsteps', 'lock'].includes(r.type) && !seenResult(r)) || state?.me.reports.find(r => r.round === state.round && r.type === 'clue') : null;
    const dawn = state?.phase !== 'night' ? state?.me.reports.find(r => r.round === state.round && ['post', 'post-blocked', 'sleep', 'turned', 'stowaway'].includes(r.type) && !seenResult(r)) : null;
    return clue || dawn || state?.me.reports.find(r => r.round === state.round && ['check','watch','glimpse','manifest','check-blocked','watch-blocked','glimpse-blocked','manifest-blocked'].includes(r.type));
  }
  const resultKey = r => [state.code, state.meId, state.match, r.round, r.type, r.time || ''].join(':');
  const seenResult = r => { try { return !!sessionStorage.getItem('lt-result:' + resultKey(r)); } catch { return false; } };
  function privateResultCard(result) {
    if (result.type === 'lock') return el('section', { class: 'private-night-result lock-result', 'aria-label': 'Your night result' }, txt('span', 'eyebrow', 'ONLY YOU HEARD THIS'),
      el('div', { class: 'glimpse-faces' }, ...lockNeighbours(result).map(p => el('div', { class: 'glimpse-face' }, avatar(p.id, 'result-portrait'), txt('b', '', p.name)))),
      el('h3', {}, 'A lock clicked next door.'), txt('p', '', reportMessage(result) + ' Only a Careful Passenger can lock their door.'));
    if (result.type === 'footsteps') return el('section', { class: 'private-night-result footsteps-result', 'aria-label': 'Your night result' }, txt('span', 'eyebrow', 'ONLY YOU HEARD THIS'),
      el('h3', {}, 'Footsteps in the night.'), carriageMap({ route: heardRoute(result), fade: true }), footstepsNote(result));
    const blocked = result.type.endsWith('-blocked'), check = result.type.startsWith('check');
    if (['turned', 'stowaway'].includes(result.type)) return el('section', { class: 'private-night-result crew-result turned-result', 'aria-label': 'Your night result' }, txt('span', 'eyebrow', 'FOR YOUR EYES ONLY'),
      result.type === 'stowaway' ? avatar(result.targetId, 'result-portrait') : rolePortrait('stowaway', 'result-portrait'), el('h3', {}, result.type === 'turned' ? 'You have turned.' : 'The Stowaway joins you.'), txt('p', '', reportMessage(result)));
    if (!blocked && ['manifest', 'post', 'sleep'].includes(result.type)) return el('section', { class: 'private-night-result crew-result ' + result.type + '-result' + (result.walked ? ' walked' : ''), 'aria-label': 'Your night result' },
      txt('span', 'eyebrow', 'FOR YOUR EYES ONLY'),
      result.type === 'post' && result.ids.length ? el('div', { class: 'glimpse-faces' }, ...result.ids.map(id => el('div', { class: 'glimpse-face' }, avatar(id, 'result-portrait'), txt('b', '', who(id))))) : result.targetId ? avatar(result.targetId, 'result-portrait') : txt('span', 'result-symbol', result.type === 'sleep' ? '☾' : '—'),
      el('h3', {}, result.type === 'manifest' ? who(result.targetId) : result.type === 'post' ? 'Your door watch' : 'A sleeping pill.'),
      result.type === 'manifest' ? txt('strong', 'result-verdict', result.walked ? 'WALKED' : 'STAYED IN') : null,
      txt('p', '', reportMessage(result)));
    if (!blocked && ['glimpse', 'clue'].includes(result.type)) return el('section', { class: 'private-night-result ' + (result.type === 'glimpse' ? 'glimpse-result' : 'clue-result'), 'aria-label': 'Your night result' },
      txt('span', 'eyebrow', 'FOR YOUR EYES ONLY'),
      result.type === 'glimpse' ? el('div', { class: 'glimpse-faces' }, ...(result.ids || []).map(id => el('div', { class: 'glimpse-face' }, avatar(id, 'result-portrait'), txt('b', '', who(id))))) : avatar(result.targetId, 'result-portrait'),
      el('h3', {}, result.type === 'glimpse' ? (result.ids?.length > 2 ? 'One of these three is a Saboteur.' : 'One of these two is a Saboteur.') : who(result.targetId) + ' is not the ' + role(result.role).name + '.'),
      txt('p', '', result.type === 'glimpse' ? 'Faces in the corridor. You saw one of them sneaking out, but not which.' : 'You found this in a lost suitcase. It is true.'));
    return el('section', { class: 'private-night-result ' + (blocked ? 'blocked' : check ? result.alignment : 'witness-result'), 'aria-label': 'Your night result' },
      txt('span', 'eyebrow', 'FOR YOUR EYES ONLY'),
      !blocked && result.targetId ? avatar(result.targetId, 'result-portrait') : txt('span', 'result-symbol', blocked ? '⊘' : '—'),
      el('h3', {}, blocked ? 'Your power was blocked.' : result.targetId ? who(result.targetId) : 'Nobody was targeted.'),
      !blocked && check ? txt('strong', 'result-verdict', result.alignment.toUpperCase()) : !blocked && result.targetId ? txt('strong', 'result-verdict', 'ATTACK TARGET') : null,
      txt('p', '', blocked ? 'No result was revealed tonight.' : check ? 'Their exact role stays secret.' : 'This shows the attack target. It does not reveal healing or poison.'));
  }
  // A new journey opens with the roles being shuffled: face-down cards fan out, flip, swap places twice,
  // flip back and gather, then the curtain lifts onto the team page. It never takes clicks.
  let shuffledKey = '';
  function syncShuffle() {
    if (state?.phase !== 'briefing' || !state.mix?.length || !motionOK) return;
    const key = state.code + ':' + state.match; if (shuffledKey === key) return; shuffledKey = key;
    try { if (sessionStorage.getItem('lt-shuffled') === key) return; sessionStorage.setItem('lt-shuffled', key); } catch {}
    const roles = state.mix.flatMap(m => Array(m.count).fill(m.role)).slice(0, 12);
    const deck = el('div', { class: 'shuffle-deck' }), cards = roles.map(r => el('div', { class: 'shuffle-card' + (role(r).group === 'saboteur' ? ' bad' : '') },
      el('div', { class: 'shuffle-face shuffle-back' }, txt('span', '', '🎟️')), el('div', { class: 'shuffle-face shuffle-front' }, rolePortrait(r, 'shuffle-art'), txt('b', '', role(r).name))));
    deck.append(...cards);
    const overlay = el('div', { class: 'shuffle-overlay', 'aria-hidden': 'true' }, el('div', { class: 'shuffle-title' }, txt('small', '', state.match > 1 ? 'A NEW DEAL. A NEW SECRET.' : 'TONIGHT’S ROLES'), txt('b', '', 'Shuffling The Roles')), deck);
    document.body.append(overlay);
    const W = Math.min(innerWidth, 900), H = Math.min(innerHeight, 700), place = (c, x, y, r) => { c.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + r + 'deg)'; };
    const scatter = () => cards.forEach(c => place(c, (Math.random() - .5) * W * .62, (Math.random() - .5) * H * .4 + 30, (Math.random() - .5) * 40));
    cards.forEach((c, i) => place(c, i * .6, -i * .6, 0));
    const at = (ms, fn) => setTimeout(() => { if (overlay.isConnected) fn(); }, ms);
    at(60, () => overlay.classList.add('on'));
    at(380, () => { sfx.play('shuffle'); const n = cards.length; cards.forEach((c, i) => { const a = (i - (n - 1) / 2) * Math.min(14, 120 / n); place(c, Math.sin(a * Math.PI / 180) * Math.min(W * .42, 260), 40 - Math.cos(a * Math.PI / 180) * 30 + 30, a); }); });
    at(950, () => cards.forEach((c, i) => setTimeout(() => c.classList.add('up'), i * 45)));
    at(1650, () => { sfx.play('shuffle'); scatter(); });
    at(2150, scatter);
    at(2650, () => { cards.forEach(c => c.classList.remove('up')); });
    at(2950, () => cards.forEach((c, i) => place(c, i * .6, -i * .6, 0)));
    at(3300, () => overlay.classList.add('out'));
    at(3800, () => overlay.remove());
  }
  function syncPrivateResult() {
    if (!state || state.paused || !['night','gathering','morning'].includes(state.phase)) return;
    const result = currentPrivateResult(); if (!result) return;
    const key = resultKey(result);
    if (key === privateResultKey) return;
    privateResultKey = key;
    try { if (sessionStorage.getItem('lt-result:' + key)) return; sessionStorage.setItem('lt-result:' + key, '1'); } catch {}
    const d = dialog('Your private result', privateResultCard(result)); d.classList.add('night-result-dialog'); d.dataset.turn = fence();
    d.append(el('button', { type: 'button', class: 'gold', onclick: () => d.close() }, 'Got It'));
    if (result.type === 'footsteps') sfx.play('steps');
    d.addEventListener('close', () => requestAnimationFrame(syncPrivateResult));
  }
  function render() {
    const active = document.activeElement, focusId = active?.id, focusKey = active?.dataset.focus, cursor = active?.selectionStart;
    const detailStates = new Map([...root.querySelectorAll('details[data-details]')].map(n => [n.dataset.details, n.open]));
    if (state) {
      const next = state.code + ':' + state.match;
      if (next !== sceneKey) { sceneKey = next; showCard = false; }
      const step = [state.code,state.match,state.round,state.phase,state.nightRole,state.nightPhase,state.speakerId].join(':');
      if (step !== draftStep) { draftStep = step; speechDraft = ''; whisperDraft = ''; }
    }
    voice.sync(state, seat);
    bridgeBoarding();
    const playing = !!state && !!seat && state.phase !== 'lobby';
    root.classList.toggle('on-journey',playing);
    const content = !seat ? landing() : !state ? panel(el('h2',{},'Finding your train…'),btn('Try Again',poll,'secondary')) : state.phase === 'lobby' ? waitingRoom() : state.phase === 'finished' ? finale() : match();
    const key = [state?.code,state?.match,state?.phase,state?.nightRole,state?.nightPhase,state?.phase === 'discussion' ? state.speakerId : ''].join(':');
    // Sideways strips (the traveller strip, the face pickers) keep their scroll position when the page redraws.
    const strips = new Map([...root.querySelectorAll('.lt-roster, .phrase-people')].map(n => [n.classList[0], n.scrollLeft]));
    root.replaceChildren(...[header(), error ? el('div',{class:'error',role:'alert'},error,btn('Close',()=>{error='';render();},'text-button')) : null, seat && !connected ? txt('p','connection','Reconnecting. Your ticket is saved.') : null, state?.notice ? txt('p','waiting',state.notice) : null,
      state?.me?.observer ? el('div',{class:'observer-banner',role:'status'},txt('span','','👀'),el('div',{},txt('b','','You are watching this journey.'),txt('small','','You see what everyone sees. You take a seat when the next journey starts.'))) : null,
      state?.paused ? el('div',{class:'pause-banner',role:'status'},txt('b','','Ⅱ Journey paused'),txt('span','','Timers and choices are on hold.'),state.hostId === state.meId ? btn('RESUME JOURNEY',()=>send('resume'),'host') : null) : null,
      content,txt('footer','','Last Train · Every cabin hides a secret.')].filter(Boolean));
    for (const [cls, left] of strips) { const n = root.querySelector('.' + cls); if (n && left) n.scrollLeft = left; }
    for (const n of root.querySelectorAll('details[data-details]')) if (String(state?.round || 0) === root.dataset.round && detailStates.has(n.dataset.details)) n.open = detailStates.get(n.dataset.details);
    testPlayers?.sync(state, seat);
    syncRoleDock(playing && !state.me.observer && !['briefing','boarding','finished'].includes(state.phase));
    updateOverlayViewport();
    syncElimination();
    // Pins stay open while speakers change, and close when the lounge ends.
    if (!state?.pinsOpen) document.querySelectorAll('dialog.tone-pin[open]').forEach(d => d.close());
    if (state?.phase === 'voteResult') requestAnimationFrame(flyVotes);
    letters.sync(state?.me?.observer ? null : state, state?.me?.observer ? null : seat);
    mapFab.hidden = !(seat && state && !['lobby', 'briefing', 'boarding'].includes(state.phase) && state.players.some(p => p.seat));
    social.sync(state, seat);
    syncPrivateResult();
    syncShuffle();
    syncClimbNews();
    syncRevoteNotice();
    const restored = focusId ? document.getElementById(focusId) : [...root.querySelectorAll('[data-focus]')].find(n => n.dataset.focus === focusKey);
    if (restored) { restored.focus({preventScroll:true}); if(typeof cursor === 'number' && restored.setSelectionRange) try{restored.setSelectionRange(cursor,cursor);}catch{} }
    root.dataset.round = String(state?.round || 0); root.dataset.paused = String(!!state?.paused); root.dataset.phase = state?.phase || 'home'; root.dataset.nightRole = state?.nightRole || '';
    const sceneChanged = key !== enteredKey;
    if (sceneChanged) {
      root.querySelector('.world,.scene-panel,.lobby-grid,.landing')?.classList.add(motionOK && !state?.paused ? 'scene-enter' : 'scene-static'); enteredKey = key;
    }
    // Important moments bring their controls into view: your speaking turn, your vote, your night choice, and the
    // results of a night or a vote. Nothing moves when the panel is already on screen or you are typing elsewhere.
    if (sceneChanged && state && !state.paused && !state.me?.observer) requestAnimationFrame(() => {
      const me = state.me, ownTurn = state.phase === 'discussion' && state.speakerId === state.meId;
      const target = ownTurn ? '.speech-console' : state.phase === 'voting' && me.alive && !me.vote ? '.voting-console'
        : state.phase === 'night' ? '.action-console' : ['morning', 'revoteInfo', 'voteResult'].includes(state.phase) ? '.lounge-console' : null;
      const panel = target && root.querySelector(target), typing = document.activeElement?.matches?.('input, textarea');
      if (!panel || (typing && !ownTurn)) return;
      const top = 64, bottom = (dockNode?.isConnected ? dockNode.getBoundingClientRect().top : innerHeight) - 16, r = panel.getBoundingClientRect();
      if (r.top >= top && r.bottom <= bottom) return;
      // Fit the whole panel above the pinned ticket when it fits; otherwise bring its top into view.
      window.scrollBy({ top: r.height <= bottom - top ? r.bottom - bottom : r.top - top, behavior: motionOK ? 'smooth' : 'instant' });
    });
    tick();
  }
  function tick() {
    voice.sync(state, seat);
    soundtrack.sync(state, !!seat, boardingVideo);
    syncBoardingVideo();
    notebook.sync(state && seat ? { ...seat, match: state.match || 1 } : null, state ? (state.phase === 'lobby' ? 'Waiting to board' : 'Round ' + state.round + ' · ' + (state.paused ? 'Paused' : state.phase === 'night' ? (state.nightPhase ? 'Night phase ' + state.nightPhase + ' of 2' : roleName(state.nightRole) + ' turn') : ({ briefing:'Meet the teams', boarding:'All aboard', settling:'Nightfall', gathering:'Gathering', morning:'Morning', discussion:'Discussion', voting:'Voting', revoteInfo:'Tied vote', voteResult:'Vote results', finished:'Journey ended' }[state.phase] || ''))) : '', state?.players || [], state && seat && state.me.role ? JSON.stringify(state.me.reports) : '', reportList);
    sfx.wheels(!!seat && !!state && ['settling', 'night'].includes(state.phase) && !state.paused);
    if (!state) return;
    if (cinemaNode && !state.paused) {
      const elapsed = (state.duration || 12) - (state.remainingMs || 0) / 1000 + (Date.now() - state.receivedAt) / 1000;
      if (elapsed >= cinemaEnd) cinemaNode.close();
    }
    const seconds = state.deadline ? Math.max(0,Math.ceil((state.deadline - state.now - (Date.now()-state.receivedAt))/1000)) : 0;
    // Ticks only for the person who still has to act: their speaking turn, or a vote not yet cast.
    const mustAct = (state.phase === 'discussion' && state.speakerId === state.meId) || (state.phase === 'voting' && state.me.alive && !state.me.vote);
    const tickKey = state.step + ':' + seconds;
    if (mustAct && !state.paused && seconds > 0 && seconds <= 5 && tickKey !== lastTick) { lastTick = tickKey; sfx.play('tick'); if (ui.haptics) try { navigator.vibrate?.(15); } catch {} }
    // The last five seconds turn red, wherever a countdown is shown.
    const urgent = !!state.deadline && !state.paused && seconds <= 5;
    document.querySelectorAll('#lt-app .countdown,.lt-dialog .countdown').forEach(n => {n.textContent=state.paused?'Ⅱ':String(seconds).padStart(2,'0');n.classList.toggle('urgent',urgent);n.setAttribute('aria-label',state.paused?'Paused':seconds+' seconds remaining');});
    root.querySelectorAll('.think-icon').forEach(n => n.style.setProperty('--p', (state.duration ? Math.min(100, seconds / state.duration * 100) : 100).toFixed(1) + '%'));
    // The train pulls into Morning and lights it just before the lounge opens.
    root.querySelectorAll('.night-track').forEach(n => { const done = state.phase === 'night' && state.duration ? 1 - seconds / state.duration : 0, arrived = n.dataset.step === '2' && done > .955 && !state.paused;
      if (arrived && !n.classList.contains('arrived') && arrivedKey !== state.step) { arrivedKey = state.step; sfx.play('chime'); } n.classList.toggle('arrived', arrived); });
    root.querySelectorAll('.night-track').forEach(n=>n.style.setProperty('--phase',state.phase==='night'&&state.duration?Math.min(1,Math.max(0,1-seconds/state.duration)).toFixed(3):0));
    root.querySelectorAll('.journey-clock').forEach(n=>{n.style.setProperty('--remaining',state.paused?1:Math.min(1,seconds/(state.duration||20)));n.classList.toggle('urgent',urgent);});
  }
  window.visualViewport?.addEventListener('resize', updateOverlayViewport);
  window.visualViewport?.addEventListener('scroll', updateOverlayViewport);
  window.addEventListener('resize', updateOverlayViewport);
  compactScene.addEventListener('change', () => { if (state) render(); });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && seat){clearTimeout(timer);poll();}});
  setInterval(tick,500);render();if(seat)poll();
})();
