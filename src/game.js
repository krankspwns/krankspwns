let readyStripSeen = -1;
function renderGame() {
  if (err) app.append(el('div', { class: 'err' }, tErr(err)));
  if (st.phase === 'lobby') return renderWaitingRoom();
  const me = st.players.find(p => p.id === st.meId);
  const active = activePlayers();
  const readyCount = active.filter(p => p.ready).length;
  const panel = (i, extraCls = '') => ({ class: ('panel ' + extraCls + ' ' + (screenAnim ? 'fx-in' : '')).trim(), style: screenAnim ? `animation-delay:${i * 80}ms` : '' });

  const invite = inviteControl();
  const head = el('div', panel(0, 'gamehead'),
    el('div', { class: 'roomcode' }, el('span', { class: 'kicker' }, t('room')), el('span', { class: 'code' }, st.code)),
    el('div', { class: 'hstats' }, t('playersN', { n: st.players.length, max: st.maxPlayers }), el('span', { class: 'sep' }, '·'),
      ...(readyCount < active.length ? [el('b', { style: 'color:#8fe0ae' }, t('readyN', { r: readyCount, n: active.length })), el('span', { class: 'sep' }, '·')] : []), t('roundN', { n: st.round })),   // the ready count only matters while cards are being arranged
    el('div', { class: 'hactions' + (st.isHost ? '' : ' even') }, el('button', { class: 'ghost', onclick: openPlayers }, withIcon('users', t('playersBtn'))), invite, st.isHost ? nrSheen(el('button', { class: 'nrbtn', onclick: () => act('deal') }, el('span', { class: 'nric' }, icon('shuffle', 15)), el('span', {}, t('reset')))) : ''),
    el('button', { class: 'ghost leavebtn', onclick: confirmLeave }, withIcon('logout', t('leave'))));
  const strip = rosterStrip(); if (strip) head.append(strip);   // inside the same card as the room code and buttons
  app.append(head);
  const tbar = timerBar(); if (tbar) app.append(tbar);
  const chips = settingChips(); if (chips) app.append(chips);
  const banner = lastBanner();
  if (banner) app.append(banner);

  // Everyone playing is ready: the game moves to the stage, one row at a time
  if (active.length && active.every((p) => p.ready)) {
    if (me.spectator) {
      app.append(el('div', { class: 'panel observer slim' }, el('span', { class: 'obs-eye sm' }, icon('eye', 26)),
        el('div', {}, el('div', { class: 'obs-title' }, t('obsTitle')), el('div', { class: 'obs-text' }, t('obsWait')))));
    }
    app.append(stagePanel(active));
    const res = resultsPanel(); if (res) app.append(res);
    if(st.currentRow===4&&drinkPendingRow()<0)app.append(crownBotControls());
    const watchers = st.players.filter((p) => p.spectator);
    if (watchers.length) app.append(el('div', { class: 'panel watchers' }, el('span', { class: 'lrk' }, t('watching')), ...watchers.map((p) => el('span', { class: 'loserchip wchip' }, p.name))));
    return;
  }

  if (me.spectator) {   // joined while the round was under way: watch, and get dealt in next round
    app.append(el('div', panel(1, 'observer'),
      el('div', { class: 'obs-eye' }, icon('eye', 46)),
      el('div', { class: 'obs-title' }, t('obsTitle')),
      el('div', { class: 'obs-text' }, t('obsText')),
      el('div', { class: 'waiting' }, el('span', { class: 'dot' }), t('obsWait'))));
    const res = resultsPanel(); if (res) app.append(res);
    const grid = el('div', { class: 'others' });
    active.forEach((p, i) => grid.append(el('div', panel(2 + i * .5, p.ready ? 'is-ready' : ''), who(p, p.name), boardEl(p.board, false, p.id))));
    if (grid.children.length) app.append(grid);
    return;
  }

  const placed = me.board.filter(Boolean).length;
  const total = me.board.length;
  const inProgress = active.every((p) => p.ready);   // everyone playing is ready: round is under way
  const readyBtn = inProgress
    ? el('span', { class: 'pill live' }, el('i', { class: 'livedot' }), t('inProgress'))
    : me.ready
    ? el('button', { class: 'unreadybtn', onclick: () => act('ready', { ready: false }) }, t('unready'))
    : el('button', { class: 'readybtn', disabled: placed < total, style: `--p:${(placed / total) * 100}%`, onclick: () => act('ready', { ready: true, at: serverNow() }) },
        placed < total ? t('placeAll', { p: placed, t: total }) : t('imReady'));

  if (!me.ready && readyStripSeen === st.round) readyStripSeen = -1;   // unready: it may slide in again next time
  app.append(el('div', panel(1, 'ownpanel' + (me.ready ? ' is-ready' : '')),
    el('div', { class: 'row' },
      who(me, me.name + t('you'), 34),
      readyBtn),
    inProgress ? '' : me.ready ? el('div', { class: 'readystrip' + (readyStripSeen === st.round ? '' : (readyStripSeen = st.round, ' anim')) }, el('span', { class: 'tick' }, icon('tick', 15)),
      el('div', {}, t('youReady'), el('small', {}, t('waitMore', { n: active.length - readyCount })))) : '',
    boardEl(me.board, true, me.id),
    el('div', { class: 'hint' }, inProgress
      ? t('hintProgress')
      : me.ready
      ? t('hintReady')
      : t('hintArrange'))));

  const results = resultsPanel();   // below your own board, so opening rows never pushes the controls down
  if (results) app.append(results);

  const hand = el('div', { class: 'hand' }), row1 = el('div', { class: 'hcards' }), row2 = el('div', { class: 'hcards' });
  st.hand.forEach((c, i) => {
    const d = dealAnim ? ' fx-deal' : '';
    const node = me.ready
      ? cardEl(c, { up: false, extra: d.trim() })
      : cardEl(c, { src: 'hand', extra: d.trim(), onclick: () => {   // tap: drop into the next free slot (top row first)
          const slot = me.board.findIndex((x) => !x);
          if (slot >= 0) act('place', { card: c, slot });
        } });
    if (dealAnim) { const col = i < 4 ? i : i - 4, cols = i < 4 ? Math.min(4, st.hand.length) : st.hand.length - 4; node.style.animationDelay = i * 85 + 200 + 'ms'; node.style.setProperty('--dx', ((cols - 1) / 2 - col) * 112 + '%'); node.style.setProperty('--dy', (i < 4 ? -95 : -205) + '%'); node.style.setProperty('--dr', ((i * 37) % 17 - 8) + 'deg'); }
    (i < 4 ? row1 : row2).append(node);
  });
  hand.append(el('p', { id: 'keyboard-hint', class: 'sr-only' }, t('keyboardHint')), row1); if (row2.children.length) hand.append(row2);
  const handTitle = me.ready ? t('handHidden') : !st.hand.length ? t('handDone') : t('handTap');
  const handSub = me.ready ? t('handSubHidden') : !st.hand.length ? t('handSubDone') : t('handSubTap');
  const handPanel = el('div', panel(2, 'handpanel'),
    el('div', { class: 'handhead' }, el('div', { class: 'name' }, handTitle), el('small', {}, handSub)), hand);
  if (!me.ready) handPanel.dataset.hand = '';
  if (!me.ready && !inProgress) app.append(handPanel);   // ready = all cards placed and locked, so the hand goes away; Unready brings it back

  const others = el('div', { class: 'others' });
  active.filter(p => p.id !== st.meId).forEach((p, i) => others.append(el('div', panel(3 + i * .5, p.ready ? 'is-ready' : ''),
    who(p, p.name),
    boardEl(p.board, false, p.id))));
  if (others.children.length) app.append(others);
  const watchers = st.players.filter((p) => p.spectator);
  if (watchers.length) {
    app.append(el('div', { class: 'panel watchers' }, el('span', { class: 'lrk' }, t('watching')), ...watchers.map((p) => el('span', { class: 'loserchip wchip' }, p.name))));
  }
}

function renderLobby() {
  const nameIn = el('input', { id: 'player-name', 'aria-label': t('yourName'), placeholder: t('namePh'), maxLength: NAME_MAX, value: formName, oninput: (e) => { formName = e.target.value; } });
  const pickLanding = (k) => { formAvatar = k; try { localStorage.setItem('sct-av', k); } catch {} avBtn.replaceWith((avBtn = editableAvatar(k, 46, pickLanding))); };
  let avBtn = editableAvatar(formAvatar, 46, pickLanding);
  const name = el('div', { class: 'namerow' }, avBtn, nameIn);
  const joinBtn = el('button', { class: 'ghost big joinbtn' + (formCode ? ' ready' : ''), onclick: () => go('join') }, t('join'));
  const code = el('input', { id: 'room-code', 'aria-label': t('roomCode'), class: 'codein', placeholder: 'ABCD', maxLength: 4, value: formCode, oninput: (e) => { formCode = e.target.value; joinBtn.classList.toggle('ready', formCode.trim().length > 0); } });
  const remember = () => { try { localStorage.setItem('sct-name', formName); } catch {} };
  const go = (action) => { remember(); enter(action, { name: formName, code: formCode, avatar: formAvatar, recoveryCode: formRecovery }); };

  const fan = el('div', { class: 'fan' });
  ['AS', 'KH', 'QD', 'JC', '10S'].forEach((id, i) => {
    const c = cardEl(id, {});
    c.style.setProperty('--r', (i - 2) * 14 + 'deg');
    c.style.setProperty('--d', i * 90 + 'ms');
    fan.append(c);
  });

  const hero = el('div', { class: 'hero' },
    el('div', { class: 'kicker' }, t('kicker')),
    el('h2', {}, t('h2a'), el('em', {}, t('h2b'))),
    el('p', {}, t('heroP')),
    el('div', { class: 'chips' },
      el('span', { class: 'chip' }, icon('users', 16), t('chip1')),
      el('span', { class: 'chip' }, icon('hand', 16), t('chip2')),
      el('span', { class: 'chip' }, icon('eye-off', 16), t('chip3')),
      el('span', { class: 'chip' }, icon('phone', 16), t('chip4'))),
    fan);

  const invited = !!inviteCode;
  const form = invited
    ? el('div', { class: 'panel joincard fx-in invited' },
        el('div', { class: 'invitebanner' }, el('span', { class: 'inv-i' }, icon('ticket', 30)), el('div', {}, el('b', {}, t('invitedTo', { code: inviteCode })), leftOld ? el('small', {}, t('leftOld')) : '')),
        el('label', {}, t('yourName')), name,
        el('button', { class: 'big', onclick: () => { remember(); enter('join', { name: formName, code: inviteCode, avatar: formAvatar, recoveryCode: formRecovery }); } }, t('joinRoomN', { code: inviteCode })),
        el('div', { class: 'or' }, t('createOwn')),
        el('div', { class: 'row' },
          el('button', { class: 'ghost', onclick: () => go('create') }, t('create')),
          el('button', { class: 'ghost', onclick: () => { formCode = inviteCode; inviteCode = ''; leftOld = false; render(); } }, t('otherCode'))),
        el('div', { class: 'err' }, tErr(err)))
    : el('div', { class: 'panel joincard fx-in' },
    el('h3', {}, t('takeSeat')),
    el('label', {}, t('yourName')), name,
    el('button', { class: 'big', onclick: () => go('create') }, t('create')),
    el('div', { class: 'or' }, t('orJoin')),
    el('label', {}, t('roomCode')),
    el('div', { class: 'row' }, el('div', { class: 'grow' }, code), joinBtn),
    el('div', { class: 'err' }, tErr(err)));
  const recoveryInput = el('input', { id: 'seat-recovery', type: 'password', autocomplete: 'off', maxLength: 24, value: formRecovery, 'aria-label': t('recoveryLabel'), oninput: (e) => { formRecovery = e.target.value.trim(); } });
  form.append(el('details', { class: 'recovery-form', 'data-guest-only':'landing', open: !!formRecovery || err.startsWith('Recovery code') },
    el('summary', {}, t('recoveryOptional')),
    el('div', { class: 'recovery-fields' }, el('label', { htmlFor: 'seat-recovery' }, t('recoveryLabel')), recoveryInput)));
  const jb = form.querySelector('.row .big'); if (jb) jb.style.cssText = 'width:auto;padding:12px 22px;font-size:14px';

  app.append(el('div', { class: 'landing' + (invited ? ' invited' : '') }, hero, form));
}

let entering = false;
async function enter(action, body) {
  if (entering) return;
  entering = true;
  err = '';
  // instant feedback: a banner over the form while the room is being created / joined
  const card = document.querySelector('.joincard');
  if (card) {
    card.classList.add('busy');
    card.querySelectorAll('button, input').forEach((x) => { x.disabled = true; });
    card.append(el('div', { class: 'loadbanner', role: 'status' }, el('i', { class: 'spin' }), el('span', {}, t(action === 'create' ? 'creating' : 'joining'))));
  }
  try {
    session = null;
    pending = 0; queue = Promise.resolve(); best = null; failed = false; needsReconcile = false; connFails = 0; setConn(false);
    adopt(await api(action, body));
    inviteCode = ''; leftOld = false; formRecovery = '';
    session = { code: st.code, pid: st.meId, tok: st.tok, recoveryCode: st.recoveryCode };   // the token is this seat's secret: the id alone proves nothing
    save(); startPolling();
  } catch (e) { err = e.message; }
  entering = false;
  render();
}

// Only accept state that is at least as new as what we already show, so a slow
// poll response can't roll the board back after a move.
