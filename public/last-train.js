(() => {
  'use strict';
  const root = document.getElementById('lt-app');
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const save = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const lastGame = () => { try { localStorage.setItem('arcade-last-game', 'last-train'); } catch {} };
  const invitation = new URLSearchParams(location.search).get('room')?.toUpperCase() || '';
  let seat = read('lt-seat'), state = null, busy = false, error = '', connected = true, timer, polling, pollFails = 0, connectionError = false;
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
  const fromModule = (data, owner) => { if (seat?.tok === owner.tok && seat.code === owner.code) { adopt(data); render(); } };
  const notebook = window.createTrainNotebook(fabDock);
  const letters = window.createTrainLetters(fabDock, { request, onState: fromModule, sfx });
  const social = window.createTrainSocial({ dock: fabDock, request, onState: fromModule, sfx });
  const testPlayers = new URLSearchParams(location.search).get('test') === '1' ? window.createTrainTestPlayers(root) : null;
  const compactScene = matchMedia('(max-width: 680px)');
  const motionOK = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!seat?.tok || (invitation && invitation !== seat.code)) { seat = null; save('lt-seat', null); }
  if (seat) lastGame();
  const groupName = group => ({ passenger: 'Good · Passenger', crew: 'Good · Crew', saboteur: 'Bad · Saboteur' }[group] || 'Secret team');
  const role = key => state?.catalog?.[key] || { name: 'Secret role', icon: '🔒', description: '' };
  const who = id => state?.players.find(p => p.id === id)?.name || 'Nobody';
  const ROLE_ART = { passenger:0, careful:1, brave:2, witness:3, speaker:4, inspector:5, medic:6, trainee:7, saboteur:8, blocker:9 };
  let crestSerial = 0;
  function portrait(index, set, cls = '', label = '') {
    return el('span', { class: 'portrait portrait-' + set + ' ' + cls, style: '--px:' + ((index % 4) * 100 / 3) + '%;--py:' + (Math.floor(index / 4) * 50) + '%', 'aria-hidden': 'true', 'data-portrait-set': set, ...(label ? { 'data-role-art': label } : {}) });
  }
  const rolePortrait = (key, cls = '') => portrait(ROLE_ART[key] ?? 0, 'roles', cls, key);
  function avatar(id, cls = '') {
    const p = typeof id === 'object' ? id : state?.players.find(p => p.id === id);
    const index = p?.avatarIndex ?? Math.max(0, (p?.seat || 1) - 1);
    const node = portrait(index, 'passengers', cls + (p?.frame ? ' has-frame bd-' + p.frame : ''));
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
    if (changed) announce(data.phase === 'night' ? (data.nightPhase ? 'Night phase ' + data.nightPhase + ' of 2. Everyone has 25 seconds.' : roleName(data.nightRole) + ' turn.') : data.phase === 'discussion' ? 'Speaking turn: ' + data.players.find(p => p.id === data.speakerId)?.name : ({ briefing: 'Meet the good and bad teams.', boarding: 'All aboard.', settling: 'Close your eyes. Your cabin is ready.', gathering: 'Meet in the lounge.', morning: 'Morning. See who is out.', revoteInfo: 'The vote is tied. A re-vote will begin shortly.', voting: data.voteAttempt === 2 ? 'The vote tied. Vote again between the tied players.' : 'Time to vote.', voteResult: 'The votes are in.', finished: 'The game has ended.' }[data.phase] || 'Room ready.'));
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
          if ([401, 404].includes(response.status)) { seat = null; state = null; save('lt-seat', null); }
          throw Error(data.error || 'Please try again.');
        }
        const changed = !state || state.version !== data.version || !connected || connectionError;
        pollFails = 0; if (connectionError) { error = ''; connectionError = false; }
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
  function rules() {
    const d = dialog('One train. Two secret teams.', txt('p', 'muted', '5–12 friends. Each person uses their own phone. Keep your role private.'),
      el('div', { class: 'rules-groups' }, el('div', {}, el('b', {}, 'GOOD · Passengers + Crew'), txt('p', '', 'Find every Saboteur. Keep at least one Passenger and one Crew member alive.')), el('div', {}, el('b', {}, 'BAD · Saboteurs'), txt('p', '', 'Get all Passengers OR all Crew out. Your teammates share a private cabin.'))),
      txt('p', 'muted small', '5 players: 1 Saboteur. 6–9 players: 2 Saboteurs. 10–12 players: 3 Saboteurs.'),
      el('ol', {}, el('li', {}, el('b', {}, 'Meet the roles, then board. '), 'Seats are shuffled at the start. Your seat also sets your speaking order for the whole game.'), el('li', {}, el('b', {}, 'Close your eyes in your cabin. '), 'Two shared night phases last 25 seconds each. Everyone can use their private night notebook in both phases.'), el('li', {}, el('b', {}, 'Phase 1: attack, block, protect and lock. Phase 2: heal, check and watch. '), 'The first phase resolves together before the second starts. Saboteurs can change their target votes before time ends. Only player targets count toward the attack. A tie is random among tied players. If nobody picks a target, nobody is attacked.'), el('li', {}, el('b', {}, 'Meet in the lounge. '), 'Each living player gets up to 20 seconds (the host can choose 15–45), from the first seat to the last. Sharing a message or recording moves to the next player. Chat rooms let each player type or record one message. Voice recordings can be played after their turn. In-person rooms speak aloud.'), el('li', {}, el('b', {}, 'Vote, or Skip. '), 'The player with most votes is out. Skip is an abstention. A tie starts one re-vote between tied players. If that ties too, one tied player is out at random. Everyone then sees who voted for whom, and whether the removed player was good or bad.')),
      txt('p', 'rule-highlight', 'Too much help is deadly: if Brave protects someone and Medic heals them on the same night, that player dies from overdose.'),
      el('details', {}, el('summary', {}, 'Powers And Extra Rules'), ...(state ? Object.entries(state.catalog).map(([,r]) => txt('p', '', r.name + ' — ' + r.description)) : [txt('p', '', 'Crew include Inspector, Medic and Trainee. Passenger powers include a door lock, protection and witnessing an attack.')]),
        txt('p', '', 'Medic gets one heal and one poison for the whole game. Only one medicine per night. Healing responds to the original attack. Brave now stops an attack rather than taking the hit. Poison and overdose bypass protection and a locked door.'),
        txt('p', '', 'Witness learns the original attack target, even if saved. That target may be good or bad: Saboteurs can attack themselves or teammates. Inspector learns GOOD or BAD. Inspector and Witness see their private result immediately when they use their power.'),
        txt('p', '', 'A confirmed limited power is spent, even if blocked. A missed choice skips without spending it. A blocked Medic sees no patient and spends no medicine.'),
        txt('p', '', 'Trainee counts as Crew from the start. If Inspector or Medic is out, the surviving Trainee takes that job next night. A new Medic inherits only the medicine left. If both jobs are lost together, Inspector takes priority.'),
        txt('p', '', 'Resolve all night deaths together. If the last Saboteur and last good group die together, good wins. Out players watch quietly and cannot act, speak or vote.'),
        txt('p', '', 'Night turns follow the roles in this room’s starting mix. Their windows stay the same length, even after someone is out, blocked or has used their power. Other phones never learn who acted from the timing. Missing day votes count as Skip. The host can pause for a disconnected player; leaving never kills a character.')));
    d.append(btn('Got It', () => d.close(), 'gold'));
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
      txt('small', '', p.id === state.meId ? 'You' : p.name));
  }
  function playersDialog() {
    const sess = state.session || {};
    const d = dialog('Travellers', txt('p', 'muted small', state.players.filter(p => !p.departed).length + ' in this room. Seat order sets the speaking order.'),
      el('div', { class: 'players-list' }, ...state.players.map(p => el('div', { class: 'players-row' + (p.id === state.meId ? ' me' : '') + (!p.alive && state.phase !== 'lobby' ? ' out' : '') },
        avatar(p, 'players-face'), el('div', {}, el('b', {}, p.name + (p.id === state.meId ? ' · You' : '')), txt('small', '', [p.seat ? 'Seat ' + p.seat : null, p.id === state.hostId ? 'Host' : null, p.departed ? 'Away' : !p.alive && state.phase !== 'lobby' ? 'Out' : state.phase === 'lobby' ? 'Ready to board' : 'On board'].filter(Boolean).join(' · '))),
        sess[p.id]?.journeys ? txt('span', 'players-wins', sess[p.id].wins + ' / ' + sess[p.id].journeys + ' wins') : null))));
    d.append(btn('Close', () => d.close(), 'gold'));
  }
  function header() {
    const inRoom = !!(state && seat), w = state?.me?.wallet;
    const top = el('div', { class: 'lt-topbar' },
      el('a', { href: '/?games=1', class: 'lt-iconbtn home-link', 'aria-label': 'All games', title: 'All games' }, '←'),
      svgButton('lt-iconbtn', 'How to play', ICONS.guide, rules),
      el('span', { class: 'lt-spacer' }),
      (() => { const b = svgButton('lt-pill sound-pill', SOUND_MODES[sfx.mode], ICONS.sound[sfx.mode], e => soundMenu(e.currentTarget)); b.insertAdjacentHTML('beforeend', '<svg class="caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'); b.setAttribute('aria-haspopup', 'menu'); return b; })(),
      inRoom && w ? (() => { const b = svgButton('lt-iconbtn shop-button', 'Shop · ' + w.wp + ' WP', ICONS.shop, () => social.openShop()); b.append(txt('b', 'wp-badge', w.wp + ' WP')); return b; })() : null);
    const title = el('a', { href: '/last-train.html', class: 'lt-title' }, txt('i', '', ''), trainMark('brand-icon'), txt('span', '', 'LAST TRAIN'), txt('i', '', ''));
    if (!inRoom) return el('header', { class: 'lt-header' }, top, title);
    const host = state.hostId === state.meId, aboard = state.players.filter(p => !p.departed && (state.phase === 'lobby' || p.alive)).length;
    const card = el('section', { class: 'lt-gamecard', 'aria-label': 'Room ' + state.code },
      el('div', { class: 'gamecard-row' }, el('span', { class: 'room-badge' }, txt('small', '', 'ROOM'), txt('b', 'room-code', state.code)), btn('Leave', leaveDialog, 'leave-button', false, 'leave-room')),
      el('p', { class: 'gamecard-stats' }, txt('b', '', String(state.players.filter(p => !p.departed).length)), ' Travellers · ', txt('span', 'aboard', aboard + (state.phase === 'lobby' ? ' Ready' : ' Aboard')), ' · ' + phaseLabel()),
      el('div', { class: 'gamecard-buttons' }, btn('Players', playersDialog, 'card-button', false, 'players'), (() => { const b = btn('Invite ▾', e => inviteMenu(e.currentTarget), 'card-button', false, 'invite'); b.dataset.invite = ''; b.setAttribute('aria-haspopup', 'menu'); return b; })(),
        !['lobby', 'finished'].includes(state.phase) && host ? btn(state.paused ? 'Resume' : 'Pause', () => send(state.paused ? 'resume' : 'pause'), 'card-button slate', false, 'pause') : null),
      el('div', { class: 'lt-roster', 'aria-label': 'Travellers in seat order' }, ...state.players.filter(p => !p.departed || state.phase !== 'lobby').map(rosterPerson)));
    return el('header', { class: 'lt-header in-room' }, top, title, card);
  }
  function landing() {
    return el('div', { class: 'landing' }, el('section', { class: 'intro' }, txt('span', 'eyebrow', 'EVERY CABIN HIDES A SECRET.'), train(), el('h1', {}, 'All aboard.', el('br'), el('em', {}, 'Trust no easy story.')), txt('p', 'muted', 'A secret role. A private cabin. A train full of suspects. Use your power at night, then meet to talk and vote.'), el('div', { class: 'chips' }, txt('span', '', '5–12 friends'), txt('span', '', 'Secret teams'), txt('span', '', 'Night powers'))),
      el('section', { class: 'panel entrance' }, txt('span', 'eyebrow', 'YOUR TICKET TO PLAY'), el('h2', {}, 'Catch the last train.'), el('label', { htmlFor: 'lt-name' }, 'Your name'), el('input', { id: 'lt-name', value: name, maxLength: 12, autocomplete: 'nickname', placeholder: 'Your name', oninput: e => name = e.target.value }), btn('Create A Room', () => enter('create'), 'gold'), txt('div', 'or', 'or join your friends'), el('label', { htmlFor: 'lt-code' }, 'Room code'), el('input', { id: 'lt-code', class: 'code-input', maxLength: 4, value: code, placeholder: 'ABCD', autocomplete: 'off', oninput: e => code = e.target.value }), btn('Join Room', () => enter('join'), 'secondary'), el('details', {}, el('summary', {}, 'Rejoin On Another Phone'), txt('p', 'muted small', 'Use the same name and your saved private code.'), el('label', { htmlFor: 'lt-recovery' }, 'Rejoin code'), el('input', { id: 'lt-recovery', value: recovery, oninput: e => recovery = e.target.value })), txt('p', 'muted small', 'Good players and bad players can both lie. Your private role tells you which side you are on.')));
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
    return el('section', { class: 'panel roster-panel' }, el('div', { class: 'panel-heading' }, el('h3', {}, 'Your fellow travellers'), txt('small', 'muted', state.players.filter(p => !p.departed).length + '/12 IN ROOM')), el('div', { class: 'roster' }, ...state.players.map(p => el('div', { class: 'seat' + (p.id === state.meId ? ' mine' : '') + (!p.alive ? ' out' : '') }, avatar(p, 'avatar'), el('div', { class: 'seat-label' }, txt('b', '', p.name + (p.id === state.meId ? ' · You' : '')), txt('small', '', p.role ? role(p.role).name + ' · ' + (p.alive ? groupName(p.group) : 'OUT') : p.departed ? 'AWAY' : p.id === state.hostId ? 'HOST' : 'READY TO BOARD'))))));
  }
  function setting(extra = {}) { return send('settings', { ...state.settings, ...extra }); }
  function startJourneyButton(disabled, replay = false) {
    const n = btn(replay ? 'PLAY AGAIN' : 'START JOURNEY', () => send('start'), 'host departure-button', disabled);
    n.setAttribute('aria-label', replay ? 'PLAY AGAIN' : 'START JOURNEY');
    const icon = el('span', { class: 'departure-icon', 'aria-hidden': 'true' });
    icon.append(trainMark('ticket-train'));
    n.replaceChildren(icon, el('span', { class: 'departure-copy' }, txt('small', '', replay ? 'A NEW DEAL. A NEW SECRET.' : 'ALL ABOARD'), txt('b', '', replay ? 'Another Journey' : 'Start Journey')), txt('span', 'departure-arrow', '→'));
    return n;
  }
  function waitingRoom() {
    const n = state.players.filter(p => !p.departed).length, host = state.hostId === state.meId;
    return el('div', { class: 'lobby-grid' }, el('section', { class: 'panel waiting-panel' }, art('platform'), txt('span', 'eyebrow', 'PLATFORM 07 · LAST DEPARTURE'), el('h1', {}, 'Your train is waiting.'), txt('p', 'muted', 'Share your code. Gather at least 5 players. Each person needs their own phone.'), txt('div', 'large-code', state.code),
      el('div', { class: 'room-setting' }, txt('b', '', 'How will you share your findings?'), el('div', { class: 'mode-switch', role: 'group', 'aria-label': 'Speaking mode' }, ...[['in-person','In Person'],['chat','Chat Room']].map(([mode,label]) => btn(label, () => setting({ discussion: mode }), state.settings.discussion === mode ? 'selected' : '', !host, 'mode-' + mode))), txt('p', 'muted small', state.settings.discussion === 'chat' ? 'Each player gets ' + state.speakSeconds + ' seconds to type or record one message. Voice recordings can be played after their turn.' : 'Sit together. Each player gets ' + state.speakSeconds + ' seconds to speak aloud, in seat order.')),
      el('div', { class: 'room-setting' }, txt('b', '', 'Speaking time per player'), el('div', { class: 'mode-switch speak-switch', role: 'group', 'aria-label': 'Speaking time per player' }, ...[15, 20, 30, 45].map(n => btn(n + 's', () => setting({ speakSeconds: n }), state.speakSeconds === n ? 'selected' : '', !host, 'speak-' + n)))),
      n >= 5 ? el('div', { class: 'role-mix' }, ...state.mix.map(m => el('span', {}, rolePortrait(m.role, 'mix-portrait'), txt('b', '', m.count + '×'), role(m.role).name))) : txt('p', 'muted', (5 - n) + ' more needed to start.'),
      host ? el('div', { class: 'role-settings-actions' }, btn('Choose Roles', roleSettingsDialog, 'secondary', n < 5), btn('Shuffle Roles', () => send('shuffleRoles'), 'text-button', n < 5), txt('p', 'muted small', 'Roles are dealt to players at random.')) : null,
      host ? startJourneyButton(n < 5) : txt('p', 'waiting', 'The host will start your journey.'), btn('See The Rules', rules, 'text-button')), roster());
  }
  function roleSettingsDialog() {
    const slots = state.teamSlots; if (!slots || state.hostId !== state.meId) return;
    const selectedMix = state.phase === 'finished' ? state.nextMix : state.mix;
    let draft = { crew: selectedMix.filter(m => role(m.role).group === 'crew').map(m => m.role), passengers: selectedMix.filter(m => role(m.role).group === 'passenger' && m.role !== 'passenger').map(m => m.role), saboteur: selectedMix.some(m => m.role === 'blocker') ? 'blocker' : 'normal' };
    const d = dialog('Choose tonight’s roles', txt('p', 'muted small', 'Choose the role mix. Players receive their roles at random. ' + (state.players.filter(p => !p.departed).length === 6 ? 'Six players can have two Passengers and two Crew.' : 'Passengers outnumber Crew.')));
    d.classList.add('role-picker'); d.dataset.turn = fence();
    const content = el('div', { class: 'role-picker-content' });
    const commit = btn('Use These Roles', () => { d.close(); setting({ roles: draft }); }, 'gold');
    const refresh = () => {
      const passengerSeats = slots.good - draft.crew.length;
      const valid = draft.crew.length >= 1 && draft.crew.length <= slots.maxCrew && draft.crew.some(k => k === 'inspector' || k === 'medic') && draft.passengers.length <= passengerSeats;
      commit.disabled = !valid || busy;
      const option = (key, list, disabled = false) => el('label', { class: 'role-option' + (draft[list].includes(key) ? ' selected' : '') },
        el('input', { type: list === 'crew' && slots.maxCrew === 1 ? 'radio' : 'checkbox', name: list === 'crew' && slots.maxCrew === 1 ? 'crew-role' : 'role-' + key, checked: draft[list].includes(key), disabled, onchange: e => { draft[list] = list === 'crew' && slots.maxCrew === 1 ? [key] : e.target.checked ? [...draft[list], key] : draft[list].filter(k => k !== key); refresh(); } }), rolePortrait(key, 'picker-portrait'), el('div', {}, txt('b', '', role(key).name), txt('small', '', rolePreview[key])));
      content.replaceChildren(
        el('div', { class: 'role-budget' }, txt('b', '', passengerSeats + ' Passengers'), txt('span', '', draft.crew.length + ' Crew'), txt('span', '', slots.saboteur + (slots.saboteur === 1 ? ' Saboteur' : ' Saboteurs'))),
        el('section', { class: 'picker-group' }, el('div', { class: 'picker-heading' }, el('h3', {}, 'Crew'), txt('small', '', slots.maxCrew === 1 ? 'CHOOSE 1' : 'CHOOSE 1–' + slots.maxCrew)), txt('p', 'muted small', 'Include Inspector or Medic. Trainee needs one of them to inherit a job.'), el('div', { class: 'picker-grid' }, ...['inspector', 'medic', 'trainee'].map(k => option(k, 'crew', slots.maxCrew === 1 ? k === 'trainee' : !draft.crew.includes(k) && (draft.crew.length >= slots.maxCrew || draft.passengers.length > passengerSeats - 1))))),
        el('section', { class: 'picker-group' }, el('div', { class: 'picker-heading' }, el('h3', {}, 'Passengers'), btn('All Normal', () => { draft.passengers = []; refresh(); }, 'text-button')), txt('p', 'muted small', (passengerSeats - draft.passengers.length) + ' normal Passengers. Add powers below, or leave every Passenger normal.'), el('div', { class: 'picker-grid' }, ...['careful', 'brave', 'witness', 'speaker'].map(k => option(k, 'passengers', !draft.passengers.includes(k) && draft.passengers.length >= passengerSeats)))),
        el('section', { class: 'picker-group bad-picker' }, el('h3', {}, 'Bad team'), el('div', { class: 'picker-grid' }, ...['normal', ...(slots.saboteur > 1 ? ['blocker'] : [])].map(value => el('label', { class: 'role-option' + (draft.saboteur === value ? ' selected' : '') }, el('input', { type: 'radio', name: 'bad-role-mix', checked: draft.saboteur === value, onchange: () => { draft.saboteur = value; refresh(); } }), rolePortrait(value === 'normal' ? 'saboteur' : 'blocker', 'picker-portrait'), el('div', {}, txt('b', '', value === 'normal' ? slots.saboteur + ' × Saboteur' : '1 × Blocker'), txt('small', '', value === 'normal' ? 'Normal Saboteurs only.' : (slots.saboteur - 1) + ' normal Saboteur' + (slots.saboteur > 2 ? 's' : '') + ' + one Blocker.')))))));
    };
    d.append(content, commit, btn('Recommended Roles', () => { d.close(); setting({ roles: null }); }, 'text-button'), btn('Cancel', () => d.close(), 'text-button')); refresh();
  }
  function clock() { return el('div', { class: 'journey-clock', role: 'timer', 'aria-live': 'off' }, txt('span', 'countdown', ''), txt('small', '', state.paused ? 'PAUSED' : 'SECONDS')); }
  function hud(kicker, title, subtitle) { return el('div', { class: 'scene-hud' }, el('div', {}, txt('span', 'eyebrow', kicker), el('h1', {}, title), subtitle ? txt('p', '', subtitle) : null), state.deadline || state.paused ? clock() : null); }
  const art = name => { const mobile = { cabin:'cabin', 'lounge-room':'lounge-room-mobile' }[name]; return el('picture', { class: 'world-picture' }, mobile ? el('source', { media: '(max-width: 680px)', srcset: '/last-train/' + mobile + '.webp' }) : null, el('img', { class: 'world-art', src: '/last-train/' + name + '.webp', alt: '', 'aria-hidden': 'true' })); };
  const rolePreview = { passenger: 'Listen, share and vote.', careful: 'Lock your own door once.', brave: 'Protect someone once. Heal + protection is deadly.', witness: 'Watch the attack target once.', speaker: 'Use a double vote once.', inspector: 'Check GOOD or BAD each night.', medic: 'One heal and one poison. Choose one per night.', trainee: 'Take a fallen Crew member’s job.', saboteur: 'Choose one shared attack. Anyone can be a target.', blocker: 'A Saboteur who can also block one power once.' };
  function introScene() {
    prepareBoardingVideo();
    const groups = [['good', 'GOOD TEAM', 'Passengers + Crew', 'Find every Saboteur. Keep both good groups alive.'], ['bad', 'BAD TEAM', 'Saboteurs', 'Get all Passengers OR all Crew out. Your team knows each other.']];
    return el('section', { class: 'role-intro scene-panel' }, art('platform'), hud('BEFORE WE DEPART', 'Meet the two teams.', 'These are the roles aboard tonight. Who gets which role stays secret.'), el('div', { class: 'team-intros' }, ...groups.map(([g,tag,title,goal]) => el('section', { class: 'team-intro ' + g }, txt('span', 'team-label', tag), el('h2', {}, title), txt('p', 'team-intro-goal', goal), el('div', { class: 'introduced-roles' }, ...state.mix.filter(m => (role(m.role).group === 'saboteur') === (g === 'bad')).map(m => el('div', { class: 'introduced-role' }, rolePortrait(m.role, 'intro-portrait'), el('div', {}, el('b', {}, role(m.role).name, txt('small', '', ' ×' + m.count)), txt('p', '', rolePreview[m.role]), g === 'good' ? txt('small', 'intro-kind ' + role(m.role).group, role(m.role).group === 'crew' ? 'CREW' : 'PASSENGER') : null))))))),
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
      el('div', { class: 'boarding-queue', 'aria-label': 'Passenger boarding checks' }, ...state.players.map((p,i) => el('div', { class: 'boarding-person', style: '--order:' + i + ';--total:' + state.players.length }, avatar(p, 'boarding-avatar'), el('div', {}, txt('b', '', p.name), txt('small', '', 'CABIN ' + String(p.seat).padStart(2, '0'))), txt('span', 'boarding-check', '✓')))));
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
    b.append(...[el('span', { class: 'target-face' }, avatar(p), txt('i', 'target-check', '✓')), txt('b', '', p.name + (p.id === state.meId ? ' · You' : '')), txt('small', '', 'Seat ' + p.seat), p.pins ? txt('span', 'target-pins', '📌 ' + p.pins) : null].filter(Boolean));
    return b;
  }
  function skipCard(onPick) {
    const b = btn('', onPick, 'manifest-target skip', false, 'manifest-skip'); b.dataset.id = 'skip'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', 'Skip · nobody');
    b.append(el('span', { class: 'target-face skip-face' }, txt('span', '', '⊘'), txt('i', 'target-check', '✓')), txt('b', '', 'Skip'), txt('small', '', 'Nobody'));
    return b;
  }
  function chooseTarget(title, kind, action, extra = {}, { self = false, skip = false } = {}) {
    const bound = fence(); let selected = null, double = false;
    const tone = action === 'vote' ? 'vote' : action === 'medicine' ? 'poison' : { cover: 'protect', check: 'check', block: 'block' }[extra.power] || 'attack';
    const d = dialog(title, el('div', { class: 'target-hint' }, toneIcon(tone), txt('p', '', kind))); d.dataset.turn = bound; d.classList.add('target-dialog', 'tone-' + tone);
    const list = el('div', { class: 'manifest-targets' });
    const chosen = el('span', { class: 'confirm-face' });
    const confirm = btn('Choose Someone', () => { if (fence() !== bound) return d.close(); d.close(); send(action, { ...extra, ...(action === 'vote' ? { targetId: selected === 'skip' ? null : selected, doubled: double } : action === 'night' && state.nightRole === 'saboteur' && extra.power !== 'block' ? { attackId: selected === 'skip' ? null : selected } : { targetId: selected }) }); }, tone === 'vote' ? 'gold' : ['attack', 'poison', 'block'].includes(tone) ? 'danger' : tone === 'protect' ? 'heal' : 'secondary', true, 'confirm-target');
    const select = id => {
      selected = id; list.querySelectorAll('button').forEach(b => { b.classList.toggle('selected', b.dataset.id === id); b.setAttribute('aria-pressed', b.dataset.id === id); });
      confirm.disabled = false; confirm.replaceChildren(id === 'skip' ? el('span', { class: 'confirm-skip', 'aria-hidden': 'true' }, '⊘') : avatar(id, 'confirm-avatar'), txt('span', '', 'Confirm: ' + (id === 'skip' ? 'Skip' : who(id))));
      if (id === 'skip') { double = false; if (doubleInput) { doubleInput.checked = false; doubleInput.disabled = true; } } else if (doubleInput) doubleInput.disabled = false;
    };
    let doubleInput;
    if (skip) list.append(skipCard(() => select('skip')));
    for (const p of state.players.filter(p => p.alive && (self || p.id !== state.meId) && (action !== 'vote' || !state.voteCandidates || state.voteCandidates.includes(p.id)))) list.append(targetCard(p, () => select(p.id)));
    d.append(el('p', { class: 'manifest-time' }, txt('span', 'countdown', ''), 's left'), list);
    if (action === 'vote' && state.me.role === 'speaker' && !state.me.used.double) { doubleInput = el('input', { type: 'checkbox', onchange: e => double = e.target.checked }); d.append(el('label', { class: 'check-setting double-vote-toggle' }, doubleInput, el('span', {}, el('b', {}, 'Use My Double Vote'), txt('small', '', 'Counts twice · once per game')))); }
    d.append(el('div', { class: 'confirm-bar' }, confirm, btn('Cancel', () => d.close(), 'text-button')));
  }
  function blockTarget() {
    const attackId = state.me.nightChoice?.attackId || null;
    chooseTarget('Whose night power will you block?', 'Once per game. This does not add another attack.', 'night', { power: 'block', attackId });
  }
  function badConsole() {
    const me = state.me;
    return el('section', { class: 'action-console bad-console', 'aria-label': 'Saboteur team choices' }, el('h2', {}, me.allies.filter(p => p.alive).length > 1 ? 'Agree on one target.' : 'Choose your target.'),
      txt('p', 'console-hint', 'Pick a player or Skip. You can choose again until time ends.'),
      el('div', { class: 'team-proposals', 'aria-label': 'Your team’s target choices' }, ...me.teamChoices.map(p => el('div', { class: 'team-proposal', 'data-voter': p.id, 'data-target': p.attackId || (p.selected ? 'skip' : 'pending') },
        el('div', { class: 'proposal-target' }, p.attackId ? avatar(p.attackId, 'chosen-avatar') : txt('span', 'choice-symbol', p.selected ? '—' : '?'), avatar(p.id, 'chooser-avatar')),
        txt('b', 'proposal-name', p.attackId ? who(p.attackId) : p.selected ? 'Skip' : 'Choosing…'),
        txt('small', 'proposal-by', (p.id === state.meId ? 'You' : who(p.id)) + (p.selected ? ' chose' : ' · no vote yet'))))),
      btn('Choose Target', () => chooseTarget('Who will your team attack?', 'Anyone is allowed, including yourself and teammates. You may choose Skip.', 'night', {}, { self: true, skip: true }), 'danger', false, 'choose-team-target'),
      me.role === 'blocker' ? me.used.block ? txt('p', 'console-hint', 'Block used' + (me.nightChoice?.targetId ? ': ' + who(me.nightChoice.targetId) : '')) : btn('Use Blocker Power', blockTarget, 'text-button') : null,
      el('details', { class: 'team-chat', 'data-details': 'team-chat', open: false }, el('summary', {}, 'Whisper To Your Team' + (me.whispers.length ? ' (' + me.whispers.length + ')' : '')), el('div', { class: 'whispers', role: 'log', 'aria-label': 'Private Saboteur chat' }, ...me.whispers.map(m => el('p', {}, el('b', {}, who(m.id) + ': '), m.text))), el('form', { class: 'whisper-form', onsubmit: async e => { e.preventDefault(); const text = whisperDraft; if (!text.trim()) return; whisperDraft = ''; await send('whisper', { text }); } }, el('input', { id: 'lt-whisper', maxLength: 160, value: whisperDraft, placeholder: 'Only your bad team can read this', 'aria-label': 'Whisper To Your Team', disabled: busy, oninput: e => whisperDraft = e.target.value }), el('button', { type: 'submit', disabled: busy, 'data-focus': 'send-whisper' }, 'Send'))));
  }
  function medicineButton(kind, label, click, disabled) {
    const n = btn(label, click, kind === 'heal' ? 'heal' : 'danger', disabled);
    n.setAttribute('aria-label', label);
    n.replaceChildren(el('img', { class: 'medicine-icon', src: '/last-train/medicine-' + kind + '.svg', alt: '', 'aria-hidden': 'true', width: 54, height: 54 }), txt('span', '', kind === 'heal' ? 'Heal' : 'Poison'));
    return n;
  }
  const nightNotesKey = () => 'lt-night-notes:' + [state.code, state.meId, state.match].join(':');
  const nightNotes = () => read(nightNotesKey()) || { marks: {}, stories: {} };
  function updateNightNotes(change) { save(nightNotesKey(), { ...nightNotes(), ...change }); }
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
            const chip = el('button', { type: 'button', class: 'trust-chip ' + value, 'aria-pressed': String(notes.marks?.[p.id] === value), disabled: state.paused, 'data-focus': 'trust-' + p.id + '-' + value,
              onclick: () => { updateNightNotes({ marks: { ...nightNotes().marks, [p.id]: nightNotes().marks?.[p.id] === value ? '' : value } }); render(); } }, txt('span', 'trust-icon', ''), txt('small', '', label));
            chip.firstChild.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + window.TRAIN_ART.trust[value] + '</svg>'; return chip; }))))) :
        el('div', { class: 'night-question' },
          txt('p', 'console-hint', 'What will you tell the group? Write your made-up story here to remember it during discussion.'),
          el('label', { htmlFor: 'night-cover-story' }, 'Your private cover story'),
          el('textarea', { id: 'night-cover-story', rows: 4, maxLength: 280, value: coverStory(), disabled: state.paused,
            placeholder: 'What did you claim to see or do tonight?', oninput: e => updateNightNotes({ stories: { ...nightNotes().stories, [state.round]: e.target.value } }) })),
      txt('p', 'console-hint', 'Saved on this device. You can also open Notes to write or draw.'));
  }
  function actionConsole() {
    const me = state.me, active = state.nightRole;
    if (state.paused) return el('section', { class: 'rest-note' }, txt('span','','Ⅱ'), el('h2', {}, 'Time stands still.'), txt('p', '', 'The host has paused the journey.'));
    if (!me.alive) return el('section', { class: 'rest-note' }, txt('span','','🎟️'), el('h2', {}, 'Your journey is over.'), txt('p', '', 'Watch quietly. The living players still have a train to save.'));
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
    const power = { brave: 'cover', careful: 'lock', inspector: 'check', witness: 'watch' }[active];
    if (me.used[power]) return el('section', { class: 'action-console' }, el('h2', {}, 'Your power is already used.'), txt('p', 'console-hint', 'Use your private night notebook to prepare for the lounge.'));
    return el('section', { class: 'action-console power-console' }, rolePortrait(me.role, 'console-role-icon'), el('h2', {}, { brave: 'Who needs protection?', careful: 'Lock your door tonight?', inspector: 'Who will you check?', witness: 'Watch tonight’s attack?' }[active]),
      el('div', { class: 'power-description' }, txt('p', 'power-limit', active === 'inspector' ? 'Every night.' : 'Once per game.'),
        txt('p', 'console-hint', active === 'brave' ? 'Protection + Medic’s heal causes a deadly overdose.' : active === 'inspector' ? 'See GOOD or BAD as soon as you choose.' : active === 'careful' ? 'Stops an attack on you, but not poison or overdose.' : 'See the original attack target immediately.')),
      el('div', { class: 'power-buttons' },
        btn({ brave: 'Choose', careful: 'Lock Door', inspector: 'Choose', witness: 'Watch' }[active], () => ['brave','inspector'].includes(active) ? chooseTarget(active === 'brave' ? 'Who will you protect?' : 'Who will you check?', active === 'brave' ? 'If they are also healed, they die from overdose.' : 'You see GOOD or BAD immediately after choosing.', 'night', { power }) : send('night', { power }), 'gold'),
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
  function cabinScene() {
    const me = state.me, settling = state.phase === 'settling';
    const badTogether = !settling && state.nightRole === 'saboteur' && me.alive && me.group === 'saboteur';
    const roommates = badTogether ? me.allies.filter(p => p.alive && p.id !== state.meId).map(p => player(p.id)) : [];
    const patient = patientScene();
    const sceneHud = hud('NIGHT ' + state.round + ' · ' + (badTogether ? 'PRIVATE TEAM CABIN' : 'CABIN ' + String(player(state.meId).seat).padStart(2,'0')), settling ? 'Close your eyes.' : state.nightPhase ? 'Night phase ' + state.nightPhase + ' of 2.' : roleName(state.nightRole) + ', wake up.', settling ? 'Your secret role is on the ticket below.' : state.nightPhase ? '25 seconds for everyone. Make your choices and keep your notes private.' : badTogether ? 'Only your team can see these choices.' : 'Only the active role acts. Everyone else rests.');
    // Where the night is up to: the same two steps on every phone.
    const step = settling ? 0 : state.nightPhase || 1;
    sceneHud.firstChild.append(el('ol', { class: 'night-steps', 'aria-label': 'Night progress' }, ...[['Move', 1], ['Respond', 2], ['Morning', 3]].map(([label, n]) => el('li', { class: n < step ? 'done' : n === step ? 'on' : '', 'aria-current': n === step ? 'step' : null }, txt('span', 'step-dot', n < step ? '✓' : n === 3 ? '☀' : String(n)), label))));
    return el('section', { class: 'world cabin-scene' + (badTogether ? ' conspiracy' : '') + (patient ? ' infirmary' : '') + (settling ? ' eyes-closing' : ''), 'aria-label': badTogether ? 'Your Saboteur team shares a private cabin' : 'Your private train cabin' },
      el('div', { class: 'cabin-view' }, art(badTogether || patient ? 'cabin-floor' : 'cabin'), motionOK && !state.paused ? el('div', { class: 'passing-lights', 'aria-hidden': 'true' }) : null,
        sceneHud, me.role && !settling ? ticketChip() : null,
        el('div', { class: 'cabin-travellers count-' + roommates.length }, ...roommates.map(p => el('div', { class: 'cabin-person', 'data-player': p.id }, seatedTraveller(p), txt('span', '', p.name)))),
        patient),
      settling ? el('div', { class: 'curtain-message' }, txt('span','','☾'), txt('p','','Settle into your cabin…')) : el('div', { class: 'night-panels' }, actionConsole(), state.nightPhase && me.alive ? nightNotebook() : null));
  }
  const svgPin = () => { const n = el('span', { class: 'pin-svg', 'aria-hidden': 'true' }); n.innerHTML = '<svg viewBox="0 0 32 32">' + TONE_ICONS.pin + '</svg>'; return n; };
  function loungeSeats() {
    const perRow = compactScene.matches ? 4 : 6;
    const rows = Math.ceil(state.players.length / perRow);
    const seats = state.players.map((p, i) => {
      const row = Math.floor(i / perRow), col = i % perRow, count = Math.min(perRow, state.players.length - row * perRow);
      const near = rows > 1 && row === rows - 1;
      const depth = rows === 1 ? 1 : row / (rows - 1);
      const y = rows === 1 ? 89 : compactScene.matches ? (rows === 2 ? [56,93][row] : [40,66,93][row]) : [58,94][row];
      const width = compactScene.matches ? 20 + depth * 3 : 13 + depth * 2.5;
      // Every row sits in close pairs, like the near row: two armchairs side by side, then an aisle.
      const groups = compactScene.matches ? { 4: [[23.5,2],[76.5,2]], 3: [[29,2],[78,1]], 2: [[50,2]], 1: [[50,1]] } : { 6: [[16,2],[50,2],[84,2]], 5: [[19,2],[50,1],[81,2]], 4: [[27,2],[73,2]], 3: [[33,2],[75,1]], 2: [[50,2]], 1: [[50,1]] };
      const slots = groups[count].flatMap(([center, n]) => n === 2 ? [center - width * .41, center + width * .41] : [center]);
      const x = slots[col];
      return el('div', { class: 'lounge-seat' + (!p.alive ? ' empty alignment-' + (p.alignment || (p.group === 'saboteur' ? 'bad' : 'good')) : '') + (state.speakerId === p.id ? ' speaking' : '') + (p.id === state.meId ? ' yours' : ''), 'data-player': p.id, 'data-facing': near ? 'away' : 'toward', 'data-seat-pair': Math.floor(col / 2), style: '--seat-x:' + x + '%;--seat-y:' + y + '%;--seat-width:' + width + '%;--seat-layer:' + (row * 2 + 2) + ';--depth:' + depth.toFixed(2) },
        el('span', { class: 'seat-number', 'aria-label': 'Seat ' + p.seat + (!p.alive ? ' · Out' : '') }, String(p.seat).padStart(2,'0')), !p.alive ? el('span', { class: 'out-stamp', 'aria-hidden': 'true' }, 'OUT') : null, el('div', { class: 'seat-figure' }, el('span', { class: 'seat-shadow', 'aria-hidden': 'true' }), seatedTraveller(p)),
        el('div', { class: 'seat-caption' }, el('div', { class: 'seat-name-row' }, near ? avatar(p, 'seat-identity') : null, txt('b', 'lounge-name', p.name + (p.id === state.meId ? ' · You' : ''))), txt('small', 'seat-status', !p.alive ? 'OUT · ' + ((p.alignment || (p.group === 'saboteur' ? 'bad' : 'good')) === 'bad' ? 'BAD' : 'GOOD') : state.speakerId === p.id ? 'SPEAKING' : p.voteLocked ? 'VOTED' : 'ON BOARD'), p.pins ? el('span', { class: 'seat-pins', 'aria-label': p.pins + (p.pins === 1 ? ' suspect pin' : ' suspect pins') }, svgPin(), txt('b', '', String(p.pins)), txt('small', '', p.pins === 1 ? 'pin' : 'pins')) : null));
    });
    const banks = [];
    for (let i = 0; i < seats.length; i += perRow) banks.push(el('div', { class: 'sofa-row' }, ...seats.slice(i, i + perRow)));
    return el('div', { class: 'lounge-seats', 'aria-label': 'Speaking order, left to right, then the next row' }, ...banks);
  }
  function outs(entry) {
    if (!entry || !entry.outs.length) return txt('p', 'nobody-out', 'Everyone is still aboard.');
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
  function choiceCard(cls, icon, title, sub, click, disabled, key) {
    const b = btn('', click, 'speak-choice ' + cls, disabled, key); b.setAttribute('aria-label', title);
    b.innerHTML = '<span class="choice-icon">' + icon + '</span><span class="choice-copy"><b></b><small></small></span>';
    b.querySelector('b').textContent = title; b.querySelector('small').textContent = sub; return b;
  }
  let typing = false, typingKey = '';
  function speechConsole() {
    const me = state.me, own = state.speakerId === state.meId, mode = state.settings.discussion;
    const said = state.speeches.find(m => m.round === state.round && m.id === state.meId);
    const turnKey = [state.code, state.match, state.round, state.speakerId].join(':'); if (turnKey !== typingKey) { typingKey = turnKey; typing = false; }
    const busyVoice = voice.busy(), myReports = own && me.alive && me.reports.length;
    let options = null;
    if (own && me.alive) {
      if (said) options = txt('p', 'choice-saved', said.audio ? 'Voice shared. The next player has the floor.' : 'You’ve had your say. Let’s hear the next traveller.');
      else if (mode === 'chat' && typing) options = el('form', { class: 'speech-form', onsubmit: async e => { e.preventDefault(); if (!speechDraft.trim()) return; const text = speechDraft; await send('speak', { text }); } },
        el('textarea', { id: 'lt-speech', rows: 3, maxLength: 280, value: speechDraft, placeholder: 'What did you find? Who do you trust?', 'aria-label': 'Your findings', disabled: busy || state.paused, oninput: e => speechDraft = e.target.value }),
        el('div', { class: 'speech-form-actions' }, btn('Use Voice Instead', () => { typing = false; render(); }, 'text-button', false, 'use-voice'), el('button', { type: 'submit', class: 'gold', disabled: busy || state.paused, 'data-focus': 'share-findings' }, 'Share Message')));
      else options = el('div', { class: 'speak-choices' + (busyVoice ? ' recording' : '') }, voice.controls(),
        busyVoice ? null : mode === 'chat' ? choiceCard('type-choice', KEYS_ICON, 'Type Message', 'One short message', () => { typing = true; render(); requestAnimationFrame(() => document.getElementById('lt-speech')?.focus()); }, state.paused, 'type-message')
          : choiceCard('done-choice', DONE_ICON, 'I’m Done Speaking', 'Pass to the next seat', () => send('finishSpeech'), state.paused, 'done-speaking'));
    }
    return el('section', { class: 'speech-console' }, el('div', { class: 'speaking-person' }, avatar(state.speakerId), el('div', {}, txt('small', '', 'SEAT ' + player(state.speakerId).seat + ' · ' + (state.speakerIndex + 1) + '/' + state.speakingOrder.length), el('h2', {}, own ? 'It’s your turn.' : who(state.speakerId) + ' has the floor.')), txt('span','countdown speaker-seconds','')),
      txt('p', 'console-hint', own ? mode === 'chat' ? 'What happened last night? Record your voice or type one short message.' : 'Tell the group what you know, out loud. You can also record it. Up to ' + state.speakSeconds + ' seconds.' : mode === 'chat' ? 'Read their message, or play their recording after this turn. Your turn follows the seat numbers.' : 'Listen to their story. Your turn follows the seat numbers.'),
      own && me.alive && me.group === 'saboteur' && coverStory() ? el('aside', { class: 'private-question' }, txt('small', '', 'YOUR PRIVATE COVER STORY'), txt('p', '', coverStory())) : null,
      myReports ? btn('My Reports (' + me.reports.length + ')', reportsDialog, 'secondary reports-quick', false, 'turn-reports') : null,
      options);
  }
  // Suspect pins: a public count, not a vote. Each living player can pin one person and change it any time.
  function pinBar() {
    if (!state.pinsOpen || !state.me.alive || state.paused) return null;
    const pinned = state.me.suspect;
    return el('div', { class: 'pin-bar' }, btn(pinned ? '📌 Change' : '📌 Pin A Suspect', pinDialog, 'pin-button', false, 'pin-suspect'), el('p', {}, pinned ? el('span', {}, 'You suspect ', el('b', {}, who(pinned)), '.') : 'Everyone sees the count, not who pinned.'));
  }
  function pinDialog() {
    const d = dialog('Who do you suspect?', el('div', { class: 'target-hint' }, toneIcon('pin'), txt('p', '', 'Only the number of pins is shown, never who pinned. Pins reset each night and are not votes.'))); d.classList.add('target-dialog', 'tone-pin');
    const grid = el('div', { class: 'manifest-targets' }, ...state.players.filter(p => p.alive && p.id !== state.meId).map(p => { const b = targetCard(p, () => { d.close(); send('suspect', { targetId: p.id }); }, state.me.suspect === p.id ? 'selected' : ''); b.setAttribute('aria-pressed', String(state.me.suspect === p.id)); return b; }));
    d.append(...[grid, el('div', { class: 'confirm-bar' }, ...[state.me.suspect ? btn('Clear My Pin', () => { d.close(); send('suspect', { targetId: null }); }, 'secondary') : null, btn('Cancel', () => d.close(), 'text-button')].filter(Boolean))]);
  }
  let lastWordsDraft = '';
  function lastWordsBlock(entry) {
    if (!entry?.outs.length || entry.type !== 'vote') return null;
    if (entry.lastWords) return el('blockquote', { class: 'last-words' }, avatar(entry.lastWords.id, 'last-words-face'), el('div', {}, txt('small', '', 'LAST WORDS · ' + who(entry.lastWords.id).toUpperCase()), txt('p', '', '“' + entry.lastWords.text + '”')));
    if (!entry.outs.some(o => o.id === state.meId)) return txt('p', 'console-hint last-words-wait', who(entry.outs[0].id) + ' may say a few last words…');
    return el('form', { class: 'last-words-form', onsubmit: e => { e.preventDefault(); if (lastWordsDraft.trim()) send('lastWords', { text: lastWordsDraft }); } },
      el('label', { htmlFor: 'lt-last-words' }, 'Your last words'), el('input', { id: 'lt-last-words', maxLength: 120, value: lastWordsDraft, placeholder: 'One line for the group…', autocomplete: 'off', oninput: e => lastWordsDraft = e.target.value }), el('button', { type: 'submit', class: 'gold', disabled: busy, 'data-focus': 'send-last-words' }, 'Say It'));
  }
  function loungeScene() {
    const phase = state.phase, latest = state.history.at(-1), gathering = phase === 'gathering';
    const titles = { revoteInfo: 'The vote is tied.', gathering: 'Everyone to the lounge.', morning: 'A new morning. A few secrets.', discussion: 'One seat. One story.', voting: state.voteAttempt === 2 ? 'A tie. Vote once more.' : 'Who leaves the train?', voteResult: latest?.outs.length ? 'One player leaves the train.' : 'No one leaves this time.' };
    const subtitles = { revoteInfo: 'Take a moment to review the tied players. Everyone will vote again.', gathering: 'Cabin doors open. Meet your fellow travellers.', morning: 'See who is out. Check your ticket for any new private report.', discussion: 'Speak in seat order. You have up to ' + state.speakSeconds + ' seconds; sharing moves to the next player.', voting: state.voteAttempt === 2 ? 'Choose between the tied players. Another tie means a random elimination.' : 'The player with most votes leaves. Skip does not cancel votes for a player.', voteResult: 'Their team is revealed. Their role stays secret until the end.' };
    return el('section', { class: 'world lounge-scene phase-' + phase, 'aria-label': 'The train gathering lounge' }, hud('ROUND ' + state.round + ' · THE GATHERING LOUNGE', titles[phase], subtitles[phase]), el('div', { class: 'lounge-room', 'aria-label': 'Everyone seated together in the observation lounge' }, art('lounge-room'), loungeSeats(), el('div', { class: 'lounge-light', 'aria-hidden': 'true' })), pinBar(),
      gathering ? txt('p', 'gathering-caption', 'Take your seat…') : phase === 'morning' ? el('section', { class: 'lounge-console morning-reveal' }, outs(latest), txt('p', 'console-hint', 'The next part begins when the timer ends.')) : phase === 'revoteInfo' ? el('section', { class: 'lounge-console' }, revoteInfoCard(), el('details', {}, el('summary', {}, 'See The First Vote'), ledger(latest))) : phase === 'discussion' ? speechConsole() : phase === 'voting' ? el('section', { class: 'lounge-console voting-console' }, el('h2', {}, state.me.vote ? 'Your vote is sealed.' : state.me.alive ? 'Your vote. Your decision.' : 'Watch the vote quietly.'), state.me.vote ? txt('p', 'choice-saved', '✓ ' + (state.me.vote.targetId ? who(state.me.vote.targetId) : 'Skip') + (state.me.vote.weight === 2 ? ' · counts twice' : '')) : state.me.alive && !state.paused ? btn('Choose A Player Or Skip', () => chooseTarget('Who should leave the train?', state.voteAttempt === 2 ? 'Only tied players can be chosen. Another tie is decided at random.' : 'Your vote is final. Skip is an abstention. A tie starts one re-vote.', 'vote', {}, { self: true, skip: true }), 'gold') : null, txt('p', 'console-hint', state.players.filter(p => p.voteLocked).length + ' / ' + state.players.filter(p => p.alive).length + ' votes sealed'), state.voteAttempt === 2 && latest?.reason === 'revote' ? el('details', { class: 'previous-vote', 'data-details': 'first-vote-' + state.round }, el('summary', {}, 'See The First Vote'), ledger(latest)) : null) : el('section', { class: 'lounge-console ejection-reveal' }, outs(latest), lastWordsBlock(latest), latest?.reason === 'random' ? txt('p', 'console-hint', 'The re-vote tied. One tied player was chosen at random.') : latest?.reason === 'skip' ? txt('p', 'console-hint', 'No player received a vote. Everyone stays aboard.') : null, latest?.votes ? el('div', { class: 'inline-votes' }, ledger(latest)) : null, txt('p', 'console-hint', 'The next part begins when the timer ends.')));
  }
  function reportMessage(r) {
    if (r.type === 'watch') return r.targetId ? 'The Saboteurs tried to attack ' + who(r.targetId) + '. The target may be good or bad.' : 'The Saboteurs did not choose an attack.';
    if (r.type === 'watch-blocked') return 'Your watch was blocked. No target is known.';
    if (r.type === 'check') return who(r.targetId) + ' is ' + r.alignment.toUpperCase() + '.';
    if (r.type === 'check-blocked') return 'Your check was blocked. No result is known.';
    return 'You are now ' + role(r.role).name + '. Your new power starts next night.';
  }
  function reportsDialog() { const d = dialog('Your private reports', ...[...state.me.reports].reverse().map(r => el('div', { class: 'report' }, txt('small','','ROUND ' + r.round), txt('p','',reportMessage(r))))); d.append(btn('Close', () => d.close(), 'gold')); }
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
    const me = state.me, limited = { careful:'lock', brave:'cover', witness:'watch', speaker:'double', blocker:'block' }[me.role];
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
    const d = dialog('The journey ends here.',
      el('div', { class: 'cinema-window', 'aria-hidden': 'true' }, el('div', { class: 'station-streaks' })),
      el('div', { class: 'cancelled-ticket' }, txt('span','eyebrow','LAST TRAIN · PASSENGER TICKET'), avatar(out.id, 'cinema-avatar'), el('h3',{},who(out.id)), txt('small','cinema-seat','SEAT ' + String(player(out.id).seat).padStart(2,'0')), txt('span','cancel-stamp','TICKET CANCELLED')),
      txt('p','cinema-alignment ' + (bad ? 'bad' : 'good'),bad ? 'BAD' : 'GOOD'),
      txt('p','cinema-caption',who(out.id) + ' leaves at the next station.'));
    d.classList.add('elimination-cinema');
    d.style.setProperty('--cinema-offset', '-' + Math.max(0, elapsed) + 's');
    d.dataset.paused = String(!!state.paused);
    d.append(btn('View Votes', () => d.close(), 'gold', false, 'view-votes'));
    d.addEventListener('close', () => { if (cinemaNode === d) { cinemaNode = null; requestAnimationFrame(flyVotes); } });
    if (!state.paused) setTimeout(() => { if (cinemaNode === d) sfx.play('stamp'); }, Math.max(0, 1950 - elapsed * 1000));
    cinemaNode = d;
    cinemaEnd = 4.8;
  }
  // After the result, each ballot flies as a ticket stub from the voter's seat to the person they chose.
  let votesFlownKey = '';
  function flyVotes() {
    const entry = state?.history.at(-1);
    if (!motionOK || state.phase !== 'voteResult' || entry?.type !== 'vote' || cinemaNode || state.paused) return;
    const key = [state.code, state.match, state.round, state.history.length].join(':'); if (votesFlownKey === key) return; votesFlownKey = key;
    const seatOf = id => { const n = root.querySelector(`.lounge-seat[data-player="${id}"] .seated-traveller`); if (!n) return null; const r = n.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight ? [r.left + r.width / 2, r.top + r.height * .35, n.closest('.lounge-seat')] : null; };
    const tally = new Map();
    entry.votes.filter(v => v.targetId).forEach((v, i) => {
      const from = seatOf(v.id), to = seatOf(v.targetId); if (!from || !to) return;
      const stub = el('div', { class: 'vote-stub', 'aria-hidden': 'true' }, avatar(v.id, 'stub-face'), v.weight === 2 ? txt('b', '', '×2') : null);
      document.body.append(stub);
      const dx = to[0] - from[0], dy = to[1] - from[1], lift = -Math.min(90, Math.hypot(dx, dy) * .4);
      const a = stub.animate([{ transform: `translate(${from[0]}px,${from[1]}px) scale(.4) rotate(-12deg)`, opacity: 0 }, { transform: `translate(${from[0] + dx * .5}px,${from[1] + dy * .5 + lift}px) scale(1) rotate(6deg)`, opacity: 1, offset: .5 }, { transform: `translate(${to[0]}px,${to[1]}px) scale(.7) rotate(0)`, opacity: 1 }], { duration: 760, delay: 400 + i * 160, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'both' });
      a.onfinish = () => { stub.remove(); const seat = to[2]; if (!seat.isConnected) return; tally.set(v.targetId, (tally.get(v.targetId) || 0) + v.weight);
        let chip = seat.querySelector('.vote-tally'); if (!chip) { chip = el('span', { class: 'vote-tally' }); seat.append(chip); } chip.textContent = tally.get(v.targetId); chip.animate([{ transform: 'translateX(-50%) scale(1.5)' }, { transform: 'translateX(-50%) scale(1)' }], { duration: 260 }); sfx.play('tick'); };
    });
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
    return el('section', { class: 'panel train-chat' }, el('div', {class:'panel-heading'}, el('h2',{},'Conversations aboard'), txt('small','muted','ONE VOICE AT A TIME')),
      rounds.length ? el('div', { class: 'night-accordions' }, ...rounds.map(round => {
        const messages = state.speeches.filter(m => m.round === round);
        return el('details', { class: 'night-accordion', 'data-details': 'chat-night-' + round, open: round === (night ? rounds.at(-1) : state.round) }, el('summary', {}, txt('span', 'night-tag', 'NIGHT ' + String(round).padStart(2, '0')), txt('b', '', 'The morning conversation'), txt('small', '', messages.length + ' voices'), txt('span', 'accordion-chevron', '⌄')), el('div', {class:'public-messages',role:'log','aria-label':'Shared findings · Night ' + round}, ...messages.map(m => el('article', {class:'public-message'}, avatar(m.id, 'message-avatar'), el('div',{}, el('div', {class:'message-byline'}, el('b',{},who(m.id)), txt('small','','SEAT ' + player(m.id).seat)), m.audio ? voice.player(m) : txt('p','',m.text))))));
      })) : txt('p','muted small','Messages will appear here when the conversation begins.'));
  }
  function history() {
    const rounds = [...new Set(state.history.map(e => e.round))];
    return rounds.length ? el('section', { class: 'history journey-log' }, el('div', { class: 'log-heading' }, txt('span','eyebrow','THE JOURNEY LOG'), el('h2', {}, 'Along the way')),
      el('div', { class: 'night-accordions' }, ...rounds.map(round => {
        const entries = state.history.filter(e => e.round === round), outsCount = entries.reduce((n, e) => n + e.outs.length, 0);
        return el('details', { class: 'night-accordion', 'data-details': 'log-night-' + round, open: round === state.round }, el('summary', {}, txt('span', 'night-tag', 'NIGHT ' + String(round).padStart(2, '0')), txt('b', '', 'From nightfall to the vote'), txt('small', '', outsCount ? outsCount + ' out' : 'All aboard'), txt('span', 'accordion-chevron', '⌄')), el('div', { class: 'night-log-body' }, ...entries.map(entry => el('section', { class: 'night-log-event' }, el('h3', {}, entry.type === 'night' ? 'At daybreak' : entry.reason === 'revote' ? 'First vote · tied' : entry.attempt === 2 ? 'Re-vote' : 'The group’s vote'), outs(entry), entry.votes ? ledger(entry) : null))));
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
    return el('section', { class: 'panel journey-awards' }, txt('span', 'eyebrow', 'JOURNEY AWARDS'), el('h2', {}, 'Tonight’s honours'),
      el('div', { class: 'award-cards' }, ...AWARDS.map(([key, name, about, art]) => el('article', { class: 'award-card award-' + key }, medal(art), txt('b', '', name), txt('small', '', about),
        el('div', { class: 'award-winners' }, ...(awards[key].length ? awards[key].map(id => el('span', { class: 'award-winner' }, avatar(id, 'award-face'), txt('span', '', id === state.meId ? 'You' : who(id)))) : [txt('span', 'award-none', 'Nobody this time')]))))),
      earned.length ? el('div', { class: 'wp-earned' }, el('div', { class: 'wp-earned-head' }, txt('b', '', 'Your WP this journey'), txt('span', 'wp-badge', '+' + earned.reduce((a, e) => a + e.n, 0) + ' WP')), ...earned.map(e => el('p', {}, txt('span', '', e.reason), txt('b', '', '+' + e.n)))) : null,
      table.length ? el('div', { class: 'session-board' }, txt('span', 'eyebrow', 'THIS ROOM SO FAR'), el('div', { class: 'session-table', role: 'table', 'aria-label': 'Session scoreboard' },
        el('div', { class: 'session-row head', role: 'row' }, txt('span', '', 'Traveller'), txt('span', '', 'Wins'), ...AWARDS.map(([key, name, , art]) => { const h = medal(art); h.title = name; h.setAttribute('aria-label', name); h.removeAttribute('aria-hidden'); return h; })),
        ...table.map(p => el('div', { class: 'session-row' + (p.id === state.meId ? ' me' : ''), role: 'row' }, el('span', { class: 'session-name' }, avatar(p, 'session-face'), txt('span', '', p.id === state.meId ? 'You' : p.name)), txt('b', '', sess[p.id].wins + '/' + sess[p.id].journeys), ...['eye', 'liar', 'guard'].map(k => txt('span', sess[p.id][k] ? 'has' : '', String(sess[p.id][k]))))))) : null);
  }
  function finale() {
    const latest = state.history.at(-1), bad = state.winner === 'bad';
    const winners = state.players.filter(p => (p.group === 'saboteur') === bad);
    return el('div', {class:'finale'}, el('section', {class:'world finale-scene ' + (bad ? 'bad-victory' : 'good-victory')},
      el('div', {class:'winner-stage'}, art('lounge-room'), el('div', {class:'winner-heading'}, txt('span','eyebrow','THE LAST WORD'), trainMark('victory-mark'), el('h1',{},bad ? 'The Saboteurs win!' : 'The good team wins!'), txt('p','',bad ? 'They played their part. They kept their secrets.' : 'The truth made it through the night.'), txt('small','winner-reason',state.winReason)),
        txt('div','winner-team-label','THE WINNING TEAM'), el('div', {class:'winner-cast',style:'--winners:'+winners.length+';--winner-columns:'+Math.min(3,winners.length)}, ...winners.map(p => el('article',{class:'winner-person'},standingTraveller(p),el('div',{class:'winner-nameplate'},el('b',{},p.name + (p.id === state.meId ? ' · You' : '')),txt('small','',role(p.role).name))))),
        el('div',{class:'victory-actions'},state.hostId === state.meId ? startJourneyButton(state.players.filter(p => !p.departed).length < 5, true) : txt('p','waiting','The host can start another journey.'), state.hostId === state.meId ? el('div', { class: 'victory-role-actions' }, btn('Choose Roles', roleSettingsDialog, 'text-button', state.players.filter(p => !p.departed).length < 5), btn('Shuffle Roles', () => send('shuffleRoles'), 'text-button', state.players.filter(p => !p.departed).length < 5)) : null, latest?.votes ? btn('See The Final Vote',()=>ledgerDialog(latest),'text-button',false,'final-vote') : null)),
      el('section',{class:'panel final-manifest'},txt('span','eyebrow','BEHIND EVERY FACE'),el('h2',{},'The full cast'),el('div',{class:'final-roles'},...state.players.map(p=>el('div',{class:'final-role '+p.group},avatar(p,'role-icon'),el('div',{},txt('b','',p.name + (p.id === state.meId ? ' · You' : '')),txt('small','',role(p.role).name + ' · ' + (p.group === 'saboteur' ? 'BAD' : 'GOOD')))))))),awardsPanel(),chatLog(),history());
  }
  function match() {
    const scene = state.phase === 'briefing' ? introScene() : state.phase === 'boarding' ? boardingScene() : ['settling','night'].includes(state.phase) ? cabinScene() : loungeScene();
    return el('div', {class:'journey'}, scene, chatLog(), history());
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
    return state?.me.reports.find(r => r.round === state.round && ['check','watch','check-blocked','watch-blocked'].includes(r.type));
  }
  function privateResultCard(result) {
    const blocked = result.type.endsWith('-blocked'), check = result.type.startsWith('check');
    return el('section', { class: 'private-night-result ' + (blocked ? 'blocked' : check ? result.alignment : 'witness-result'), 'aria-label': 'Your night result' },
      txt('span', 'eyebrow', 'FOR YOUR EYES ONLY'),
      !blocked && result.targetId ? avatar(result.targetId, 'result-portrait') : txt('span', 'result-symbol', blocked ? '⊘' : '—'),
      el('h3', {}, blocked ? 'Your power was blocked.' : result.targetId ? who(result.targetId) : 'Nobody was targeted.'),
      !blocked && check ? txt('strong', 'result-verdict', result.alignment.toUpperCase()) : !blocked && result.targetId ? txt('strong', 'result-verdict', 'ATTACK TARGET') : null,
      txt('p', '', blocked ? 'No result was revealed tonight.' : check ? 'Their exact role stays secret.' : 'This shows the attack target. It does not reveal healing or poison.'));
  }
  function syncPrivateResult() {
    if (!state || state.paused || !['night','gathering','morning'].includes(state.phase)) return;
    const result = currentPrivateResult(); if (!result) return;
    const key = [state.code,state.meId,state.match,result.round,result.type].join(':');
    if (key === privateResultKey) return;
    privateResultKey = key;
    try { if (sessionStorage.getItem('lt-result:' + key)) return; sessionStorage.setItem('lt-result:' + key, '1'); } catch {}
    const d = dialog('Your private result', privateResultCard(result)); d.classList.add('night-result-dialog'); d.dataset.turn = fence();
    d.append(el('button', { type: 'button', class: 'gold', onclick: () => d.close() }, 'Got It'));
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
    root.replaceChildren(...[header(), error ? el('div',{class:'error',role:'alert'},error,btn('Close',()=>{error='';render();},'text-button')) : null, seat && !connected ? txt('p','connection','Reconnecting. Your ticket is saved.') : null, state?.notice ? txt('p','waiting',state.notice) : null,
      state?.paused ? el('div',{class:'pause-banner',role:'status'},txt('b','','Ⅱ Journey paused'),txt('span','','Timers and choices are on hold.'),state.hostId === state.meId ? btn('RESUME JOURNEY',()=>send('resume'),'host') : null) : null,
      content,txt('footer','','Last Train · Every cabin hides a secret.')].filter(Boolean));
    for (const n of root.querySelectorAll('details[data-details]')) if (String(state?.round || 0) === root.dataset.round && detailStates.has(n.dataset.details)) n.open = detailStates.get(n.dataset.details);
    testPlayers?.sync(state, seat);
    syncRoleDock(playing && !['briefing','boarding','finished'].includes(state.phase));
    updateOverlayViewport();
    syncElimination();
    // Pins stay open while speakers change, and close when the lounge ends.
    if (!state?.pinsOpen) document.querySelectorAll('dialog.tone-pin[open]').forEach(d => d.close());
    if (state?.phase === 'voteResult') requestAnimationFrame(flyVotes);
    letters.sync(state, seat);
    social.sync(state, seat);
    syncPrivateResult();
    syncRevoteNotice();
    const restored = focusId ? document.getElementById(focusId) : [...root.querySelectorAll('[data-focus]')].find(n => n.dataset.focus === focusKey);
    if (restored) { restored.focus({preventScroll:true}); if(typeof cursor === 'number' && restored.setSelectionRange) try{restored.setSelectionRange(cursor,cursor);}catch{} }
    root.dataset.round = String(state?.round || 0); root.dataset.paused = String(!!state?.paused); root.dataset.phase = state?.phase || 'home'; root.dataset.nightRole = state?.nightRole || '';
    const sceneChanged = key !== enteredKey;
    if (sceneChanged) {
      root.querySelector('.world,.scene-panel,.lobby-grid,.landing')?.classList.add(motionOK && !state?.paused ? 'scene-enter' : 'scene-static'); enteredKey = key;
    }
    if (sceneChanged) {
      const ownTurn = state?.phase === 'discussion' && state.speakerId === state.meId;
      if (ownTurn) requestAnimationFrame(() => {
        const panel = root.querySelector(ownTurn ? '.speech-console' : '.action-console'), ticket = dockNode;
        if (!panel || !ticket) return;
        const gap = panel.getBoundingClientRect().bottom - ticket.getBoundingClientRect().top + 18;
        // Only reveal controls when the pinned ticket would cover them. Keep visible scenes still.
        if (gap > 0) window.scrollBy({ top: gap, behavior: motionOK ? 'smooth' : 'instant' });
      });
    }
    tick();
  }
  function tick() {
    voice.sync(state, seat);
    soundtrack.sync(state, !!seat, boardingVideo);
    syncBoardingVideo();
    notebook.sync(state && seat ? { ...seat, match: state.match || 1 } : null, state ? (state.phase === 'lobby' ? 'Waiting to board' : 'Round ' + state.round + ' · ' + (state.paused ? 'Paused' : state.phase === 'night' ? (state.nightPhase ? 'Night phase ' + state.nightPhase + ' of 2' : roleName(state.nightRole) + ' turn') : ({ briefing:'Meet the teams', boarding:'All aboard', settling:'Nightfall', gathering:'Gathering', morning:'Morning', discussion:'Discussion', voting:'Voting', revoteInfo:'Tied vote', voteResult:'Vote results', finished:'Journey ended' }[state.phase] || ''))) : '', state?.players || [], state && seat && state.me.role ? state.me.reports.map(r => ({ round: r.round, text: reportMessage(r), tone: r.alignment || r.type })) : []);
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
    if (mustAct && !state.paused && seconds > 0 && seconds <= 5 && tickKey !== lastTick) { lastTick = tickKey; sfx.play('tick'); try { navigator.vibrate?.(15); } catch {} }
    // The last five seconds turn red, wherever a countdown is shown.
    const urgent = !!state.deadline && !state.paused && seconds <= 5;
    document.querySelectorAll('#lt-app .countdown,.lt-dialog .countdown').forEach(n => {n.textContent=state.paused?'Ⅱ':String(seconds).padStart(2,'0');n.classList.toggle('urgent',urgent);n.setAttribute('aria-label',state.paused?'Paused':seconds+' seconds remaining');});
    root.querySelectorAll('.journey-clock').forEach(n=>{n.style.setProperty('--remaining',state.paused?1:Math.min(1,seconds/(state.duration||20)));n.classList.toggle('urgent',urgent);});
  }
  window.visualViewport?.addEventListener('resize', updateOverlayViewport);
  window.visualViewport?.addEventListener('scroll', updateOverlayViewport);
  window.addEventListener('resize', updateOverlayViewport);
  compactScene.addEventListener('change', () => { if (state) render(); });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && seat){clearTimeout(timer);poll();}});
  setInterval(tick,500);render();if(seat)poll();
})();
