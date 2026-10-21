(() => {
  'use strict';
  const root = document.getElementById('lt-app');
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const save = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const lastGame = () => { try { localStorage.setItem('arcade-last-game', 'last-train'); } catch {} };
  const invitation = new URLSearchParams(location.search).get('room')?.toUpperCase() || '';
  let seat = read('lt-seat'), state = null, busy = false, error = '', connected = true, timer, polling;
  let name = read('lt-name') || '', code = invitation, recovery = '', showCard = false, sceneKey = '', enteredKey = '';
  let speechDraft = '', whisperDraft = '', draftStep = '', lastCardOpen = false;
  const motionOK = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!seat?.tok || (invitation && invitation !== seat.code)) { seat = null; save('lt-seat', null); }
  if (seat) lastGame();
  const groupName = group => ({ passenger: 'Good · Passenger', crew: 'Good · Crew', saboteur: 'Bad · Saboteur' }[group] || 'Secret team');
  const role = key => state?.catalog?.[key] || { name: 'Secret role', icon: '🔒', description: '' };
  const who = id => state?.players.find(p => p.id === id)?.name || 'Nobody';
  const ROLE_ART = { passenger:0, careful:1, brave:2, witness:3, speaker:4, inspector:5, medic:6, trainee:7, saboteur:8, blocker:9 };
  function portrait(index, set, cls = '', label = '') {
    return el('span', { class: 'portrait portrait-' + set + ' ' + cls, style: '--px:' + ((index % 4) * 100 / 3) + '%;--py:' + (Math.floor(index / 4) * 50) + '%', 'aria-hidden': 'true', 'data-portrait-set': set, ...(label ? { 'data-role-art': label } : {}) });
  }
  const rolePortrait = (key, cls = '') => portrait(ROLE_ART[key] ?? 0, 'roles', cls, key);
  function avatar(id, cls = '') {
    const p = typeof id === 'object' ? id : state?.players.find(p => p.id === id);
    return portrait(p?.avatarIndex ?? Math.max(0, (p?.seat || 1) - 1), 'passengers', cls);
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
  const train = cls => el('div', { class: 'train-art ' + (cls || ''), 'aria-hidden': 'true' }, el('img', { src: '/last-train/cabin.webp', alt: '', width: 480, height: 300 }));
  const announce = text => document.getElementById('lt-announcer').textContent = text;
  async function request(action, extra = {}, owner = seat) {
    const payload = { action, ...owner, ...extra, requestId: crypto.randomUUID(), match: state?.match || 0, round: state?.round || 0, step: state?.step || 0 };
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
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
    if (data.me.role && state && !state.me.role) showCard = true;
    state = { ...data, receivedAt: Date.now() };
    if (changed) announce(data.phase === 'night' ? roleName(data.nightRole) + ' turn. Everyone else rests in their cabin.' : data.phase === 'discussion' ? 'Speaking turn: ' + data.players.find(p => p.id === data.speakerId)?.name : ({ briefing: 'Meet the good and bad teams.', boarding: 'All aboard.', settling: 'Close your eyes. Your cabin is ready.', gathering: 'Meet in the lounge.', morning: 'Morning. See who is out.', voting: 'Time to vote.', voteResult: 'The votes are in.', finished: 'The game has ended.' }[data.phase] || 'Room ready.'));
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
        const changed = !state || state.version !== data.version || !connected;
        adopt(data); connected = true; if (changed) render(); else tick();
      } catch (e) { if (seat !== owner && seat) return; connected = false; error = e.name === 'AbortError' ? 'No connection. Trying again…' : e.message; render(); }
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
      connected = true;
    } catch (e) { error = e.name === 'AbortError' ? 'Connection stopped. We are checking whether your choice was saved.' : e.message; await poll(); }
    finally { busy = false; render(); }
  }
  function dialog(title, ...children) {
    const opener = document.activeElement?.dataset.focus;
    const d = el('dialog', { class: 'lt-dialog' }, el('h2', { tabIndex: -1 }, title), ...children);
    d.addEventListener('close', () => { d.remove(); [...root.querySelectorAll('[data-focus]')].find(n => n.dataset.focus === opener)?.focus({ preventScroll: true }); });
    document.body.append(d); d.showModal(); d.querySelector('h2').focus({ preventScroll: true }); d.scrollTop = 0; return d;
  }
  const roleName = key => key === 'saboteur' ? 'Saboteurs' : role(key).name;
  const player = id => state?.players.find(p => p.id === id);
  const fence = () => [state?.code, state?.match, state?.step].join(':');
  function rules() {
    const d = dialog('One train. Two secret teams.', txt('p', 'muted', '6–12 friends. Each person uses their own phone. Keep your role private.'),
      el('div', { class: 'rules-groups' }, el('div', {}, el('b', {}, 'GOOD · Passengers + Crew'), txt('p', '', 'Find every Saboteur. Keep at least one Passenger and one Crew member alive.')), el('div', {}, el('b', {}, 'BAD · Saboteurs'), txt('p', '', 'Get all Passengers OR all Crew out. Your teammates share a private cabin.'))),
      el('ol', {}, el('li', {}, el('b', {}, 'Meet the roles, then board. '), 'Seats are shuffled at the start. Your seat also sets your speaking order for the whole game.'), el('li', {}, el('b', {}, 'Close your eyes in your cabin. '), 'Each night turn lasts 20 seconds. Only the active role gets a choice; everyone else waits.'), el('li', {}, el('b', {}, 'Saboteurs → Medic → Brave → Careful → Inspector → Witness. '), 'Saboteurs can change their target votes before time ends. Most votes choose the shared target. A tie is random among the tied choices, including Skip. An unselected vote is Skip.'), el('li', {}, el('b', {}, 'Meet in the lounge. '), 'Each living player gets 20 seconds, from the first seat to the last. Chat rooms share one written statement per turn. In-person rooms speak aloud.'), el('li', {}, el('b', {}, 'Vote, or Skip. '), 'The unique player with most votes is out only if they beat Skip. Ties remove nobody. Everyone then sees who voted for whom, and whether the removed player was good or bad.')),
      txt('p', 'rule-highlight', 'Too much help is deadly: if Brave protects someone and Medic heals them on the same night, that player dies from overdose.'),
      el('details', {}, el('summary', {}, 'Powers and extra rules'), ...(state ? Object.entries(state.catalog).map(([,r]) => txt('p', '', r.name + ' — ' + r.description)) : [txt('p', '', 'Crew include Inspector, Medic and Trainee. Passenger powers include a door lock, protection and witnessing an attack.')]),
        txt('p', '', 'Medic gets one heal and one poison for the whole game. Only one medicine per night. Healing responds to the original attack. Brave now stops an attack rather than taking the hit. Poison and overdose bypass protection and a locked door.'),
        txt('p', '', 'Witness learns the original attack target, even if saved. That target may be good or bad: Saboteurs can attack themselves or teammates. Inspector learns GOOD or BAD. Reports arrive in the morning only if their owner survives.'),
        txt('p', '', 'A confirmed limited power is spent, even if blocked. A missed choice skips without spending it. A blocked Medic sees no patient and spends no medicine.'),
        txt('p', '', 'Trainee counts as Crew from the start. If Inspector or Medic is out, the surviving Trainee takes that job next night. A new Medic inherits only the medicine left. If both jobs are lost together, Inspector takes priority.'),
        txt('p', '', 'Resolve all night deaths together. If the last Saboteur and last good group die together, good wins. Out players watch quietly and cannot act, speak or vote.'),
        txt('p', '', 'Night turns follow the roles in this room’s starting mix. Their windows stay the same length, even after someone is out, blocked or has used their power. Other phones never learn who acted from the timing. Missing day votes count as Skip. The host can pause for a disconnected player; leaving never kills a character.')));
    d.append(btn('Got it', () => d.close(), 'gold'));
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
  function header() { return el('header', { class: 'lt-header' }, el('a', { href: '/?games=1', class: 'back' }, '← All games'), el('a', { href: '/last-train.html', class: 'wordmark' }, txt('span', 'brand-icon', 'LT'), el('span', {}, txt('small', '', 'THE GAME ROOM'), txt('b', '', 'LAST TRAIN'))), btn('How to play', rules, 'text-button')); }
  function landing() {
    return el('div', { class: 'landing' }, el('section', { class: 'intro' }, txt('span', 'eyebrow', 'EVERY CABIN HIDES A SECRET.'), train(), el('h1', {}, 'All aboard.', el('br'), el('em', {}, 'Trust no easy story.')), txt('p', 'muted', 'A secret role. A private cabin. A train full of suspects. Use your power at night, then meet to talk and vote.'), el('div', { class: 'chips' }, txt('span', '', '6–12 friends'), txt('span', '', 'Secret teams'), txt('span', '', 'Night powers'))),
      el('section', { class: 'panel entrance' }, txt('span', 'eyebrow', 'YOUR TICKET TO PLAY'), el('h2', {}, 'Catch the last train.'), el('label', { htmlFor: 'lt-name' }, 'Your name'), el('input', { id: 'lt-name', value: name, maxLength: 12, autocomplete: 'nickname', placeholder: 'Your name', oninput: e => name = e.target.value }), btn('Create a room', () => enter('create'), 'gold'), txt('div', 'or', 'or join your friends'), el('label', { htmlFor: 'lt-code' }, 'Room code'), el('input', { id: 'lt-code', class: 'code-input', maxLength: 4, value: code, placeholder: 'ABCD', autocomplete: 'off', oninput: e => code = e.target.value }), btn('Join room', () => enter('join'), 'secondary'), el('details', {}, el('summary', {}, 'Rejoin on another phone'), txt('p', 'muted small', 'Use the same name and your saved private code.'), el('label', { htmlFor: 'lt-recovery' }, 'Rejoin code'), el('input', { id: 'lt-recovery', value: recovery, oninput: e => recovery = e.target.value })), txt('p', 'muted small', 'Good players and bad players can both lie. Your private role tells you which side you are on.')));
  }
  function roomBar() {
    return el('div', { class: 'room-bar' }, el('div', {}, txt('small', 'eyebrow', 'PRIVATE ROOM'), txt('b', 'room-code', state.code)), el('div', { class: 'room-buttons' }, el('button', { type: 'button', 'data-invite': '', onclick: invite }, 'Copy link'), btn('Rejoin code', recoveryDialog, 'text-button'), !['lobby', 'finished'].includes(state.phase) && state.hostId === state.meId ? btn(state.paused ? 'Resume' : 'Pause', () => send(state.paused ? 'resume' : 'pause'), 'text-button') : null, btn('Leave', () => { if (confirm('Leave the train? Save your rejoin code if you want to come back.')) send('leave'); }, 'text-button')));
  }
  function traveller(p, cls = '', secretRole = null) {
    return el('div', { class: 'traveller ' + cls, 'aria-hidden': 'true' }, secretRole ? rolePortrait(secretRole) : avatar(p));
  }
  function roster() {
    return el('section', { class: 'panel roster-panel' }, el('div', { class: 'panel-heading' }, el('h3', {}, 'Your fellow travellers'), txt('small', 'muted', state.players.filter(p => !p.departed).length + '/12 IN ROOM')), el('div', { class: 'roster' }, ...state.players.map(p => el('div', { class: 'seat' + (p.id === state.meId ? ' mine' : '') + (!p.alive ? ' out' : '') }, avatar(p, 'avatar'), el('div', { class: 'seat-label' }, txt('b', '', p.name + (p.id === state.meId ? ' · You' : '')), txt('small', '', p.role ? role(p.role).name + ' · ' + (p.alive ? groupName(p.group) : 'OUT') : p.departed ? 'AWAY' : p.id === state.hostId ? 'HOST' : 'READY TO BOARD'))))));
  }
  function setting(extra = {}) { return send('settings', { ...state.settings, ...extra }); }
  function waitingRoom() {
    const n = state.players.filter(p => !p.departed).length, host = state.hostId === state.meId;
    return el('div', { class: 'lobby-grid' }, el('section', { class: 'panel waiting-panel' }, txt('span', 'eyebrow', 'PLATFORM 07 · LAST DEPARTURE'), el('h1', {}, 'Your train is waiting.'), txt('p', 'muted', 'Share your code. Bring at least 6 friends. Each person needs their own phone.'), txt('div', 'large-code', state.code),
      el('div', { class: 'room-setting' }, txt('b', '', 'How will you share your findings?'), el('div', { class: 'mode-switch', role: 'group', 'aria-label': 'Speaking mode' }, ...[['in-person','In person'],['chat','Chat room']].map(([mode,label]) => btn(label, () => setting({ discussion: mode }), state.settings.discussion === mode ? 'selected' : '', !host, 'mode-' + mode))), txt('p', 'muted small', state.settings.discussion === 'chat' ? 'Each player gets 20 seconds to type one statement. Everyone can read the train chat.' : 'Sit together. Each player gets 20 seconds to speak aloud, in seat order.')),
      n >= 6 ? el('div', { class: 'role-mix' }, ...state.mix.map(m => el('span', {}, rolePortrait(m.role, 'mix-portrait'), txt('b', '', m.count + '×'), role(m.role).name))) : txt('p', 'muted', (6 - n) + ' more needed to start.'),
      host && n >= 9 ? el('label', { class: 'setting-label', htmlFor: 'lt-extra' }, 'Extra Passenger power', el('select', { id: 'lt-extra', disabled: busy, onchange: e => setting({ extra: e.target.value }) }, el('option', { value: 'brave', selected: state.settings.extra === 'brave' }, 'Brave Passenger'), el('option', { value: 'speaker', selected: state.settings.extra === 'speaker' }, 'Speaker'))) : null,
      host && n === 12 ? el('label', { class: 'check-setting' }, el('input', { type: 'checkbox', checked: state.settings.blocker, disabled: busy, onchange: e => setting({ blocker: e.target.checked }) }), 'Include Blocker on the bad team') : null,
      host ? btn('START JOURNEY', () => send('start'), 'host', n < 6) : txt('p', 'waiting', 'The host will start your journey.'), btn('See the rules', rules, 'text-button')), roster());
  }
  function clock() { return el('div', { class: 'journey-clock', role: 'timer', 'aria-live': 'off' }, txt('span', 'countdown', ''), txt('small', '', state.paused ? 'PAUSED' : 'SECONDS')); }
  function hud(kicker, title, subtitle) { return el('div', { class: 'scene-hud' }, el('div', {}, txt('span', 'eyebrow', kicker), el('h1', {}, title), subtitle ? txt('p', '', subtitle) : null), state.deadline || state.paused ? clock() : null); }
  const art = name => el('picture', { class: 'world-picture' }, name === 'cabin' ? el('source', { media: '(max-width: 680px)', srcset: '/last-train/cabin-mobile.webp' }) : null, el('img', { class: 'world-art', src: '/last-train/' + name + '.webp', alt: '', 'aria-hidden': 'true' }));
  const rolePreview = { passenger: 'Listen, share and vote.', careful: 'Lock your own door once.', brave: 'Protect someone once. Heal + protection is deadly.', witness: 'Watch the attack target once.', speaker: 'Use a double vote once.', inspector: 'Check GOOD or BAD each night.', medic: 'One heal and one poison. Choose one per night.', trainee: 'Take a fallen Crew member’s job.', saboteur: 'Choose one shared attack. Anyone can be a target.', blocker: 'A Saboteur who can also block one power once.' };
  function introScene() {
    const groups = [['good', 'GOOD TEAM', 'Passengers + Crew', 'Find every Saboteur. Keep both good groups alive.'], ['bad', 'BAD TEAM', 'Saboteurs', 'Get all Passengers OR all Crew out. Your team knows each other.']];
    return el('section', { class: 'role-intro scene-panel' }, hud('BEFORE WE DEPART', 'Meet the two teams.', 'These are the roles aboard tonight. Who gets which role stays secret.'), el('div', { class: 'team-intros' }, ...groups.map(([g,tag,title,goal]) => el('section', { class: 'team-intro ' + g }, txt('span', 'team-label', tag), el('h2', {}, title), txt('p', 'team-intro-goal', goal), el('div', { class: 'introduced-roles' }, ...state.mix.filter(m => (role(m.role).group === 'saboteur') === (g === 'bad')).map(m => el('div', { class: 'introduced-role' }, rolePortrait(m.role, 'intro-portrait'), el('div', {}, el('b', {}, role(m.role).name, txt('small', '', ' ×' + m.count)), txt('p', '', rolePreview[m.role]), g === 'good' ? txt('small', 'intro-kind ' + role(m.role).group, role(m.role).group === 'crew' ? 'CREW' : 'PASSENGER') : null))))))),
      el('div', { class: 'intro-footer' }, txt('p', 'muted small', 'Seats are shuffled separately from roles. Your seat number sets your speaking order.'), state.me.ready ? txt('p', 'choice-saved', '✓ Ready to board. Waiting for the others…') : btn('I’m ready · board the train', () => send('ready'), 'gold')));
  }
  function boardingScene() {
    return el('section', { style: '--elapsed:' + Math.max(0,(state.duration || 6) - (state.remainingMs || 0)/1000) + 's', class: 'world platform-scene', 'aria-label': 'Everyone boards the train' }, art('platform'), hud('ALL ABOARD', 'The last train is leaving.', 'Your seat is set. Your secret is waiting.'), el('div', { class: 'boarding-queue' }, ...state.players.map((p,i) => el('div', { class: 'boarding-person', style: '--order:' + i + ';--total:' + state.players.length }, traveller(p), txt('span', '', p.name)))), el('div', { class: 'boarding-manifest' }, ...state.players.map(p => txt('span', '', String(p.seat).padStart(2,'0') + ' · ' + p.name))));
  }
  function chooseTarget(title, kind, action, extra = {}, { self = false, skip = false } = {}) {
    const bound = fence(); let selected = null, double = false;
    const d = dialog(title, txt('p', 'muted small', kind)); d.dataset.turn = bound;
    const list = el('div', { class: 'manifest-targets' });
    const confirm = btn('Confirm choice', () => { if (fence() !== bound) return d.close(); d.close(); send(action, { ...extra, ...(action === 'vote' ? { targetId: selected === 'skip' ? null : selected, doubled: double } : action === 'night' && state.nightRole === 'saboteur' && extra.power !== 'block' ? { attackId: selected === 'skip' ? null : selected } : { targetId: selected }) }); }, action === 'vote' ? 'gold' : 'secondary', true, 'confirm-target');
    const select = id => { selected = id; list.querySelectorAll('button').forEach(b => { b.classList.toggle('selected', b.dataset.id === id); b.setAttribute('aria-pressed', b.dataset.id === id); }); confirm.disabled = false; confirm.textContent = 'Confirm: ' + (id === 'skip' ? 'Skip' : who(id)); if (id === 'skip') { double = false; if (doubleInput) { doubleInput.checked = false; doubleInput.disabled = true; } } else if (doubleInput) doubleInput.disabled = false; };
    let doubleInput;
    if (skip) { const b = btn('Skip · nobody', () => select('skip'), 'manifest-target skip'); b.dataset.id = 'skip'; list.append(b); }
    for (const p of state.players.filter(p => p.alive && (self || p.id !== state.meId))) {
      const b = btn('', () => select(p.id), 'manifest-target', false, 'manifest-' + p.id); b.dataset.id = p.id; b.setAttribute('aria-pressed','false'); b.append(avatar(p), txt('b','',p.name + (p.id === state.meId ? ' · You' : '')), txt('small','', 'SEAT ' + p.seat)); list.append(b);
    }
    d.append(el('p', { class: 'manifest-time' }, 'Time left: ', txt('span','countdown',''), ' seconds'), list);
    if (action === 'vote' && state.me.role === 'speaker' && !state.me.used.double) { doubleInput = el('input', { type: 'checkbox', onchange: e => double = e.target.checked }); d.append(el('label', { class: 'check-setting' }, doubleInput, 'Use my double vote · once per game')); }
    d.append(confirm, btn('Cancel', () => d.close(), 'text-button'));
  }
  function blockTarget() {
    const attackId = state.me.nightChoice?.attackId || null;
    chooseTarget('Whose night power will you block?', 'Once per game. This does not add another attack.', 'night', { power: 'block', attackId });
  }
  function badConsole() {
    const me = state.me;
    return el('section', { class: 'action-console bad-console', 'aria-label': 'Saboteur team choices' }, txt('span', 'eyebrow', 'YOUR PRIVATE TEAM CABIN'), el('h2', {}, 'Agree on one target.'),
      txt('p', 'console-hint', 'You can change your vote until time ends. A tied choice is random; Skip can win too.'),
      el('div', { class: 'team-proposals' }, ...me.teamChoices.map(p => el('div', {}, rolePortrait(me.allies.find(a => a.id === p.id)?.role || 'saboteur'), el('b', {}, who(p.id) + (p.id === state.meId ? ' · You' : '')), txt('small', '', p.attackId ? '→ ' + who(p.attackId) : p.selected ? '→ Skip' : 'Choosing… · defaults to Skip')))),
      btn(me.nightChoice ? 'Change attack: ' + (me.nightChoice.attackId ? who(me.nightChoice.attackId) : 'Skip') : 'Choose attack or Skip', () => chooseTarget('Who will your team attack?', 'Anyone is allowed, including yourself and teammates.', 'night', {}, { self: true, skip: true }), 'danger'),
      me.role === 'blocker' ? me.used.block ? txt('p', 'console-hint', '🚫 Block used' + (me.nightChoice?.targetId ? ': ' + who(me.nightChoice.targetId) : '')) : btn('Use Blocker power', blockTarget, 'text-button') : null,
      el('details', { class: 'team-chat', 'data-details': 'team-chat', open: me.whispers.length > 0 }, el('summary', {}, 'Whisper to your team' + (me.whispers.length ? ' (' + me.whispers.length + ')' : '')), el('div', { class: 'whispers', role: 'log', 'aria-label': 'Private Saboteur chat' }, ...me.whispers.map(m => el('p', {}, el('b', {}, who(m.id) + ': '), m.text))), el('form', { class: 'whisper-form', onsubmit: async e => { e.preventDefault(); const text = whisperDraft; if (!text.trim()) return; whisperDraft = ''; await send('whisper', { text }); } }, el('input', { id: 'lt-whisper', maxLength: 160, value: whisperDraft, placeholder: 'Only your bad team can read this', 'aria-label': 'Whisper to your team', disabled: busy, oninput: e => whisperDraft = e.target.value }), el('button', { type: 'submit', disabled: busy, 'data-focus': 'send-whisper' }, 'Send'))));
  }
  function actionConsole() {
    const me = state.me, active = state.nightRole;
    if (state.paused) return el('section', { class: 'rest-note' }, txt('span','','Ⅱ'), el('h2', {}, 'Time stands still.'), txt('p', '', 'The host has paused the journey.'));
    if (!me.alive) return el('section', { class: 'rest-note' }, txt('span','','🎟️'), el('h2', {}, 'Your journey is over.'), txt('p', '', 'Watch quietly. The living players still have a train to save.'));
    if (active === 'saboteur' && me.group === 'saboteur') return badConsole();
    if (active !== me.role) return el('section', { class: 'rest-note' }, txt('span', 'sleep-icon', '☾'), el('h2', {}, 'Rest in your cabin.'), txt('p', '', roleName(active) + ' are taking their turn. Keep your eyes closed and your role secret.'));
    if (active === 'medic') {
      const stock = txt('p', 'medicine-counts', 'HEAL ' + me.medicine.heal + '   /   POISON ' + me.medicine.poison);
      if (me.blocked) return el('section', { class: 'action-console' }, stock, el('h2', {}, 'Your medicine is blocked.'), txt('p', '', 'No patient is shown. No medicine is spent tonight.'));
      if (me.medicineChoice) return el('section', { class: 'action-console' }, stock, txt('p', 'choice-saved', '✓ ' + ({ heal: 'Heal', poison: 'Poison', pass: 'Skip' }[me.medicineChoice.power]) + ' saved.'), txt('p', 'console-hint', 'Keep quiet until the next role wakes up.'));
      return el('section', { class: 'action-console medic-console' }, stock, el('div', { class: 'patient-heading' }, me.patientId ? avatar(me.patientId) : null, el('h2', {}, me.patientId ? who(me.patientId) + ' was attacked.' : 'No one was attacked.')), txt('p', 'console-hint', 'Heal, poison, or Skip. Only one medicine tonight.'),
        btn('Heal ' + (me.patientId ? who(me.patientId) : 'someone'), () => send('medicine', { power: 'heal' }), 'heal', !me.patientId || !me.medicine.heal), btn('Poison someone', () => chooseTarget('Who will you poison?', 'They will be out tonight, even if protected. You might choose a good player.', 'medicine', { power: 'poison' }), 'danger', !me.medicine.poison), btn('Skip · save medicine', () => send('medicine', { power: 'pass' }), 'text-button'), txt('p', 'overdose-hint', 'If Brave also protects your healed patient, that player dies from overdose.'));
    }
    if (me.nightChoice) return el('section', { class: 'action-console' }, txt('p', 'choice-saved', '✓ Your choice is saved.'), txt('p', 'console-hint', 'Stay quiet. The next cabin wakes when the timer ends.'));
    const power = { brave: 'cover', careful: 'lock', inspector: 'check', witness: 'watch' }[active];
    if (me.used[power]) return el('section', { class: 'action-console' }, el('h2', {}, 'Your power is already used.'), txt('p', 'console-hint', 'Save your story for the lounge. Your turn will pass automatically.'));
    return el('section', { class: 'action-console power-console' }, rolePortrait(me.role, 'console-role-icon'), el('h2', {}, { brave: 'Who needs protection?', careful: 'Lock your door tonight?', inspector: 'Who will you check?', witness: 'Watch tonight’s attack?' }[active]),
      txt('p', 'console-hint', active === 'brave' ? 'Once per game. Protection + Medic’s heal causes a deadly overdose.' : active === 'inspector' ? 'Choose one person. Your GOOD or BAD report arrives in the morning.' : active === 'careful' ? 'Once per game. Stops an attack on you, but not poison or overdose.' : 'Once per game. You will learn the original attack target if you survive.'),
      btn({ brave: 'Choose someone to protect', careful: 'Lock my door', inspector: 'Choose someone to check', witness: 'Watch tonight' }[active], () => ['brave','inspector'].includes(active) ? chooseTarget(active === 'brave' ? 'Who will you protect?' : 'Who will you check?', active === 'brave' ? 'If they are also healed, they die from overdose.' : 'You learn GOOD or BAD in the morning if you survive.', 'night', { power }) : send('night', { power }), 'gold'), btn(active === 'inspector' ? 'Skip check' : 'Skip · save my power', () => send('night', { power: 'pass' }), 'text-button'));
  }
  function cabinScene() {
    const me = state.me, settling = state.phase === 'settling';
    const badTogether = !settling && state.nightRole === 'saboteur' && me.alive && me.group === 'saboteur';
    const roommates = badTogether ? me.allies.filter(p => p.alive && p.id !== state.meId).map(p => ({ ...player(p.id), knownRole: p.role })) : [];
    return el('section', { class: 'world cabin-scene' + (badTogether ? ' conspiracy' : '') + (settling ? ' eyes-closing' : ''), 'aria-label': badTogether ? 'Your Saboteur team shares a private cabin' : 'Your private train cabin' }, art('cabin'),
      hud('NIGHT ' + state.round + ' · ' + (badTogether ? 'PRIVATE TEAM CABIN' : 'CABIN ' + String(player(state.meId).seat).padStart(2,'0')), settling ? 'Close your eyes.' : roleName(state.nightRole) + ', wake up.', settling ? 'The carriage lights dim. Your secret role is on the ticket below.' : badTogether ? 'Only your bad team can see this cabin and its plan.' : 'Only the active role acts. Everyone else rests.'),
      el('div', { class: 'cabin-travellers count-' + roommates.length }, ...roommates.map(p => el('div', { class: 'cabin-person' }, traveller(p, '', p.knownRole), txt('span', '', p.name)))),
      settling ? el('div', { class: 'curtain-message' }, txt('span','','☾'), txt('p','','Settle into your cabin…')) : actionConsole());
  }
  function loungeSeats() {
    return el('div', { class: 'lounge-seats', 'aria-label': 'Speaking order, left to right' }, ...state.players.map(p => {
      const statement = state.settings.discussion === 'chat' && state.speakerId === p.id ? state.speeches.find(m => m.round === state.round && m.id === p.id) : null;
      return el('div', { class: 'lounge-seat' + (!p.alive ? ' empty' : '') + (state.speakerId === p.id ? ' speaking' : '') + (p.id === state.meId ? ' yours' : ''), 'data-player': p.id }, txt('span', 'seat-number', String(p.seat).padStart(2,'0')), p.alive ? traveller(p) : txt('span','empty-seat','—'), txt('b', 'lounge-name', p.name + (p.id === state.meId ? ' · You' : '')), txt('small', 'seat-status', !p.alive ? 'OUT · ' + (p.group === 'saboteur' ? 'BAD' : 'GOOD') : state.speakerId === p.id ? 'SPEAKING' : p.voteLocked ? 'VOTED' : 'ON BOARD'), statement ? txt('p','speech-bubble',statement.text) : null);
    }));
  }
  function outs(entry) {
    if (!entry || !entry.outs.length) return txt('p', 'nobody-out', '✦ Nobody is out.');
    return el('div', { class: 'revealed-outs' }, ...entry.outs.map(p => el('div', { class: 'revealed-out ' + (p.group === 'saboteur' ? 'bad' : 'good') }, rolePortrait(p.role, 'reveal-avatar'), el('div', {}, el('b', {}, who(p.id) + ' is out'), txt('span', 'alignment-stamp', p.group === 'saboteur' ? 'BAD · SABOTEUR' : 'GOOD · ' + (p.group === 'crew' ? 'CREW' : 'PASSENGER')), txt('small', '', role(p.role).name)))));
  }
  function ledger(entry) { return el('div', { class: 'vote-ledger' }, ...entry.votes.map(v => el('div', { class: 'vote-row' }, txt('b', '', who(v.id)), txt('span', '', '→ ' + (v.targetId ? who(v.targetId) : 'Skip') + (v.weight === 2 ? ' ×2' : ''))))); }
  function ledgerDialog(entry) { const d = dialog('Who voted for whom', outs(entry), ledger(entry)); d.append(btn('Close', () => d.close(), 'gold')); }
  function speechConsole() {
    const me = state.me, own = state.speakerId === state.meId, mode = state.settings.discussion;
    const said = state.speeches.find(m => m.round === state.round && m.id === state.meId);
    return el('section', { class: 'speech-console' }, el('div', { class: 'speaking-person' }, avatar(state.speakerId), el('div', {}, txt('small', '', 'SEAT ' + player(state.speakerId).seat + ' · ' + (state.speakerIndex + 1) + '/' + state.speakingOrder.length), el('h2', {}, own ? 'It’s your turn.' : who(state.speakerId) + ' has the floor.')), txt('span','countdown speaker-seconds','')),
      txt('p', 'console-hint', own ? mode === 'chat' ? 'Share your findings in one short message before your 20 seconds end.' : 'Tell the group what you know. You have up to 20 seconds.' : mode === 'chat' ? 'Listen by reading. Your turn follows the seat numbers.' : 'Listen to their story. Your turn follows the seat numbers.'),
      own && me.alive ? mode === 'chat' ? said ? txt('p','choice-saved','✓ Findings shared. Everyone can read them below.') : el('form', { class: 'speech-form', onsubmit: async e => { e.preventDefault(); if (!speechDraft.trim()) return; const text = speechDraft; await send('speak', { text }); } }, el('textarea', { id: 'lt-speech', rows: 3, maxLength: 280, value: speechDraft, placeholder: 'What did you find? Who do you trust?', 'aria-label': 'Your findings', disabled: busy || state.paused, oninput: e => speechDraft = e.target.value }), el('button', { type: 'submit', class: 'gold', disabled: busy || state.paused, 'data-focus': 'share-findings' }, 'Share findings')) : btn('I’m done speaking', () => send('finishSpeech'), 'gold', state.paused) : null);
  }
  function loungeScene() {
    const phase = state.phase, latest = state.history.at(-1), gathering = phase === 'gathering';
    const titles = { gathering: 'Everyone to the lounge.', morning: 'A new morning. A few secrets.', discussion: 'One seat. One story.', voting: 'Who leaves the train?', voteResult: latest?.outs.length ? 'One player leaves the train.' : 'No one leaves this time.' };
    const subtitles = { gathering: 'Cabin doors open. Meet your fellow travellers.', morning: 'See who is out. Check your ticket for any new private report.', discussion: 'Speaking order runs left to right, by seat number. Each person gets 20 seconds.', voting: 'Vote for someone or Skip. Choices stay hidden until everyone has voted.', voteResult: 'The full vote record is below. Good or bad, their secret is now out.' };
    return el('section', { class: 'world lounge-scene phase-' + phase, 'aria-label': 'The train gathering lounge' }, art('lounge'), hud('ROUND ' + state.round + ' · THE GATHERING LOUNGE', titles[phase], subtitles[phase]), loungeSeats(),
      gathering ? txt('p', 'gathering-caption', 'Take your seat…') : phase === 'morning' ? el('section', { class: 'lounge-console morning-reveal' }, outs(latest), txt('p', 'console-hint', 'The next part begins when the timer ends.')) : phase === 'discussion' ? speechConsole() : phase === 'voting' ? el('section', { class: 'lounge-console voting-console' }, el('h2', {}, state.me.vote ? 'Your vote is sealed.' : state.me.alive ? 'Your vote. Your decision.' : 'Watch the vote quietly.'), state.me.vote ? txt('p', 'choice-saved', '✓ ' + (state.me.vote.targetId ? who(state.me.vote.targetId) : 'Skip') + (state.me.vote.weight === 2 ? ' · counts twice' : '')) : state.me.alive && !state.paused ? btn('Choose a player or Skip', () => chooseTarget('Who should leave the train?', 'Your vote is final after confirmation. Ties remove nobody.', 'vote', {}, { self: true, skip: true }), 'gold') : null, txt('p', 'console-hint', state.players.filter(p => p.voteLocked).length + ' / ' + state.players.filter(p => p.alive).length + ' votes sealed')) : el('section', { class: 'lounge-console ejection-reveal' }, outs(latest), latest?.reason === 'tie' ? txt('p', 'console-hint', 'A tie. Nobody is voted out.') : latest?.reason === 'skip' ? txt('p', 'console-hint', 'The group chose Skip.') : null, latest?.votes ? el('div', { class: 'inline-votes' }, ledger(latest)) : null, txt('p', 'console-hint', 'The next part begins when the timer ends.')));
  }
  function reportMessage(r) {
    if (r.type === 'watch') return r.targetId ? 'The Saboteurs tried to attack ' + who(r.targetId) + '. The target may be good or bad.' : 'The Saboteurs did not choose an attack.';
    if (r.type === 'watch-blocked') return 'Your watch was blocked. No target is known.';
    if (r.type === 'check') return who(r.targetId) + ' is ' + r.alignment.toUpperCase() + '.';
    if (r.type === 'check-blocked') return 'Your check was blocked. No result is known.';
    return 'You are now ' + role(r.role).name + '. Your new power starts next night.';
  }
  function reportsDialog() { const d = dialog('Your private reports', ...[...state.me.reports].reverse().map(r => el('div', { class: 'report' }, txt('small','','ROUND ' + r.round), txt('p','',reportMessage(r))))); d.append(btn('Close', () => d.close(), 'gold')); }
  function roleDock() {
    const me = state.me, sealed = !me.role, limited = { careful:'lock', brave:'cover', witness:'watch', speaker:'double', blocker:'block' }[me.role];
    return el('aside', { class: 'role-dock' + (showCard && !sealed ? ' revealed' : ''), 'aria-label': 'Your private role card' },
      el('div', { class: 'ticket-notch' }), btn('', () => { showCard = !showCard; render(); }, 'ticket-toggle', sealed, 'toggle-card'),
      el('div', { class: 'ticket-face' }, sealed || !showCard ? txt('span','ticket-icon ticket-sealed','LT') : rolePortrait(me.role,'ticket-icon ticket-role-portrait'), el('div', { class:'ticket-copy' }, txt('small','',sealed ? 'YOUR SEALED ROLE TICKET' : !me.alive ? 'YOUR ROLE · YOU ARE OUT' : 'YOUR PRIVATE ROLE TICKET'), el('b',{},sealed ? 'Your role awaits in your cabin.' : showCard ? role(me.role).name : 'Tap your ticket to reveal your role'), txt('span','ticket-subtitle',sealed ? 'Board the train first.' : showCard ? groupName(me.group) + (limited ? ' · ' + (me.used[limited] ? 'POWER USED' : 'POWER AVAILABLE') : me.medicine ? ' · Heal ' + me.medicine.heal + ' / Poison ' + me.medicine.poison : '') : 'Keep your screen private.'))),
      !sealed ? el('div', {class:'ticket-tools'}, btn(showCard ? 'Hide role' : 'Show role', () => { showCard = !showCard; render(); }, 'text-button',false,'show-role'), state.me.reports.length ? btn('Reports (' + state.me.reports.length + ')', reportsDialog, 'report-button') : null) : null,
      showCard && !sealed ? txt('p','ticket-rule',role(me.role).description) : null);
  }
  function chatLog() {
    if (state.settings.discussion !== 'chat' || !['gathering','morning','discussion','voting','voteResult','finished'].includes(state.phase)) return null;
    return el('section', { class: 'panel train-chat' }, el('div', {class:'panel-heading'}, el('h2',{},'The train chat'), txt('small','muted','ONE VOICE AT A TIME')), state.speeches.length ? el('div', {class:'public-messages',role:'log','aria-label':'Shared findings'}, ...state.speeches.map(m => el('article', {class:'public-message'}, avatar(m.id, 'message-avatar'), el('div',{}, el('div', {class:'message-byline'}, el('b',{},who(m.id)), txt('small','','ROUND ' + m.round + ' · SEAT ' + player(m.id).seat)), txt('p','',m.text))))) : txt('p','muted small','Findings appear here during each player’s speaking turn.'));
  }
  function history() { return state.history.length ? el('section', { class: 'panel history' }, el('h3', {}, 'Journey so far'), ...state.history.map((entry,i) => el('details', {'data-details':'event-' + i}, el('summary',{},(entry.type === 'night' ? 'Night ' : 'Vote ') + entry.round + ' · ' + entry.outs.length + ' out'), outs(entry), entry.type === 'vote' ? ledger(entry) : null))) : null; }
  function finale() {
    const latest = state.history.at(-1);
    return el('div', { class:'finale' }, el('section', {class:'world finale-scene'}, art('lounge'), hud('THE JOURNEY IS OVER', state.winner === 'good' ? 'The good team wins!' : 'The Saboteurs win!', state.winReason), txt('div','victory-icon',state.winner === 'good' ? '🏆' : '🗡️'), el('div', {class:'final-roles'}, ...state.players.map(p => el('div',{class:'final-role ' + p.group},rolePortrait(p.role, 'role-icon'),el('div',{},txt('b','',p.name + (p.id === state.meId ? ' · You' : '')),txt('small','',role(p.role).name + ' · ' + (p.group === 'saboteur' ? 'BAD' : 'GOOD')))))),
      latest?.votes ? btn('See the final vote', () => ledgerDialog(latest), 'secondary') : null, state.hostId === state.meId ? btn('PLAY AGAIN', () => send('start'),'host',state.players.filter(p => !p.departed).length < 6) : txt('p','waiting','The host can start another journey.')), chatLog(), history());
  }
  function match() {
    const scene = state.phase === 'briefing' ? introScene() : state.phase === 'boarding' ? boardingScene() : ['settling','night'].includes(state.phase) ? cabinScene() : loungeScene();
    return el('div', {class:'journey'}, scene, chatLog(), history());
  }
  function render() {
    const active = document.activeElement, focusId = active?.id, focusKey = active?.dataset.focus, cursor = active?.selectionStart;
    const openDetails = [...root.querySelectorAll('details[open][data-details]')].map(n => n.dataset.details);
    if (state) {
      const next = state.code + ':' + state.match;
      if (next !== sceneKey) { sceneKey = next; showCard = false; }
      const step = [state.code,state.match,state.round,state.phase,state.nightRole,state.speakerId].join(':');
      if (step !== draftStep) { draftStep = step; speechDraft = ''; whisperDraft = ''; }
    }
    const playing = !!state && !!seat && state.phase !== 'lobby';
    root.classList.toggle('on-journey',playing);
    const content = !seat ? landing() : !state ? panel(el('h2',{},'Finding your train…'),btn('Try again',poll,'secondary')) : state.phase === 'lobby' ? waitingRoom() : state.phase === 'finished' ? finale() : match();
    const key = [state?.code,state?.match,state?.phase,state?.nightRole,state?.phase === 'discussion' ? state.speakerId : ''].join(':');
    root.replaceChildren(...[header(), error ? el('div',{class:'error',role:'alert'},error,btn('Close',()=>{error='';render();},'text-button')) : null, seat && !connected ? txt('p','connection','Reconnecting. Your ticket is saved.') : null, state && seat ? roomBar() : null, state?.notice ? txt('p','waiting',state.notice) : null,
      state?.paused ? el('div',{class:'pause-banner',role:'status'},txt('b','','Ⅱ Journey paused'),txt('span','','Timers and choices are on hold.'),state.hostId === state.meId ? btn('RESUME JOURNEY',()=>send('resume'),'host') : null) : null,
      content,playing && !['briefing','boarding'].includes(state.phase) ? roleDock() : null,txt('footer','','Last Train · Every cabin hides a secret.')].filter(Boolean));
    for (const n of root.querySelectorAll('details[data-details]')) if (openDetails.includes(n.dataset.details)) n.open = true;
    root.querySelectorAll('.action-console').forEach(panel => panel.prepend(txt('span','countdown action-seconds','')));
    root.querySelector('.ticket-toggle')?.setAttribute('aria-label',showCard ? 'Hide my role card' : 'Show my role card');
    const restored = focusId ? document.getElementById(focusId) : [...root.querySelectorAll('[data-focus]')].find(n => n.dataset.focus === focusKey);
    if (restored) { restored.focus({preventScroll:true}); if(typeof cursor === 'number' && restored.setSelectionRange) try{restored.setSelectionRange(cursor,cursor);}catch{} }
    root.dataset.paused = String(!!state?.paused); root.dataset.phase = state?.phase || 'home'; root.dataset.nightRole = state?.nightRole || '';
    const sceneChanged = key !== enteredKey;
    if (sceneChanged) {
      root.querySelector('.world,.scene-panel,.lobby-grid,.landing')?.classList.add(motionOK ? 'scene-enter' : 'scene-static'); enteredKey = key;
    }
    if (sceneChanged || showCard && !lastCardOpen) {
      const ownTurn = state?.phase === 'discussion' && state.speakerId === state.meId;
      const ownNight = state?.phase === 'night' && (state.nightRole === state.me.role || state.nightRole === 'saboteur' && state.me.group === 'saboteur');
      if (ownTurn || ownNight) requestAnimationFrame(() => {
        const panel = root.querySelector(ownTurn ? '.speech-console' : '.action-console'), ticket = root.querySelector('.role-dock');
        if (!panel || !ticket) return;
        const gap = panel.getBoundingClientRect().bottom - ticket.getBoundingClientRect().top + 18;
        // Only reveal controls when the pinned ticket would cover them. Keep visible scenes still.
        if (gap > 0) window.scrollBy({ top: gap, behavior: motionOK ? 'smooth' : 'instant' });
      });
    }
    lastCardOpen = showCard;
    tick();
  }
  function tick() {
    if (!state) return;
    const seconds = state.deadline ? Math.max(0,Math.ceil((state.deadline - state.now - (Date.now()-state.receivedAt))/1000)) : 0;
    document.querySelectorAll('#lt-app .countdown,.lt-dialog .countdown').forEach(n => {n.textContent=state.paused?'Ⅱ':String(seconds).padStart(2,'0');n.classList.toggle('urgent',seconds<=5);n.setAttribute('aria-label',state.paused?'Paused':seconds+' seconds remaining');});
    root.querySelectorAll('.journey-clock').forEach(n=>n.style.setProperty('--remaining',state.paused?1:Math.min(1,seconds/(state.duration||20))));
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && seat){clearTimeout(timer);poll();}});
  setInterval(tick,500);render();if(seat)poll();
})();
