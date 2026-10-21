function copyText(text, btn) {
  const done = () => { const keep = [...btn.childNodes]; btn.replaceChildren(withIcon('tick', t('copied'))); setTimeout(() => btn.replaceChildren(...keep), 1400); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => {});
  else done();
}

function waitSettings() {
  const g = st.settings || {};
  const bits = [[icon('clock', 14), g.timer ? g.timer + t('setSecs') : t('setNoTimer')], [icon(g.jokers === false ? 'x' : 'tick', 14), g.jokers === false ? t('setNoJokers') : t('setJokersOn')]];
  if (g.mult !== 1) bits.push([icon('zap', 14), t('setMultN', { n: g.mult })]);
  return el('div', { class: 'setchips' }, ...bits.map(([ic, txt]) => el('span', { class: 'setchip' }, ic, txt)),
    st.isHost ? el('button', { type: 'button', class: 'ghost setedit', onclick: openSettings }, icon('sliders', 14), t('setEdit')) : '');
}
// one Invite button for everything: copy the room code, copy the link, or show a QR code
function inviteControl() {
  const link = `${shareOrigin()}/?room=${st.code}`;
  const close = () => { inviteOpen = false; render(); };
  const copyItem = (icon_, label, text) => { const b = el('button', { type: 'button', role: 'menuitem', onclick: () => { copyText(text, b); setTimeout(() => { if (inviteOpen) close(); }, 900); } }, withIcon(icon_, label)); return b; };
  const menu = el('div', { class: 'invmenu', role: 'menu', onclick: (e) => e.stopPropagation() },
    copyItem('copy', t('copyCode'), st.code),
    copyItem('link', t('inviteCopy'), link),
    el('button', { type: 'button', role: 'menuitem', onclick: () => { inviteOpen = false; render(); openQR(); } }, withIcon('qr', t('qrBtn'))));
  return el('span', { class: 'invwrap' },
    el('button', { class: 'ghost', title: t('inviteTip'), 'aria-haspopup': 'menu', 'aria-expanded': String(inviteOpen), onclick: (e) => { e.stopPropagation(); inviteOpen = !inviteOpen; render(); } },
      withIcon('link', t('invite')), icon('caret', 12, 'caret' + (inviteOpen ? ' up' : ''))),
    inviteOpen ? menu : '');
}

function renderWaitingRoom() {
  const link = `${shareOrigin()}/?room=${st.code}`;

  const seats = el('div', { class: 'seats' });
  for (let i = 0; i < st.maxPlayers; i++) {
    const p = st.players[i];
    const pop = p && newSeats.has(p.id) ? ' fx-pop' : '';
    seats.append(p
      ? el('div', { class: 'seat' + (p.id === st.meId ? ' me' : '') + pop },
          p.id === st.meId
            ? editableAvatar(p.avatar, 54, setMyAvatar, p.acc, p.bd)
            : avatarEl(p.avatar, 54, '', p.acc, p.bd),
          el('div', { class: 'sname' }, p.name + (p.id === st.meId ? t('you') : '')),
          p.isHost ? el('span', { class: 'tag' }, t('host')) : p.online === false ? el('span', { class: 'tag offl' }, t('offlineTag')) : el('span', { class: 'tag joined' }, t('joined')))
      : el('div', { class: 'seat empty' + (i - st.players.length < 2 ? ' live' : '') },
          el('div', { class: 'avatar av-empty' }, el('i', { class: 'ring' }), icon('plus', 18)),
          el('div', { class: 'sname' }, t('waitingPlayer'), el('span', { class: 'wdots' }, el('i'), el('i'), el('i')))));
  }

  [...seats.children].forEach((c, i) => { if (st.players[i]) c.dataset.pid = st.players[i].id; });
  const action = st.isHost
    ? el('button', { class: 'big', onclick: () => act('deal') }, t('dealN', { n: st.players.length }))
    : el('div', { class: 'waiting' }, el('span', { class: 'dot' }), t('waitingHost'));

  app.append(el('div', { class: 'panel waitroom' + (screenAnim ? ' fx-in' : '') },
    el('div', { class: 'kicker' }, t('roomCode')),
    el('div', { class: 'bigcode' }, st.code),
    el('div', { class: 'row center waitact' }, inviteControl(), el('button', { class: 'ghost', onclick: openPlayers }, withIcon('users', t('playersBtn')))),
    el('div', { class: 'count' }, t('joinedCount', { n: st.players.length, max: st.maxPlayers })),
    waitSettings(),
    seats,
    action,
    el('div', { class: 'row center' }, el('button', { class: 'ghost', onclick: confirmLeave }, t('leaveRoom')))));
}

// player label: name on one line, status tags underneath so it never wraps messily
function who(p, label, size = 26) {
  const w = el('div', { class: 'who' },
    el('div', { class: 'wname' }, avatarEl(p.avatar, size, '', p.acc, p.bd), el('span', { class: 'wtxt' }, label)),
    el('div', { class: 'wtags' }, p.isHost ? el('span', { class: 'tag' }, t('host')) : '', pill(p)));
  w.dataset.pid = p.id;   // so a thrown gift knows where to fly
  return w;
}

function pill(p) {
  if (p.spectator) return el('span', { class: 'pill wait' }, t('observing'));
  if (p.ready) return el('span', { class: 'pill go' }, icon('tick', 13), t('pillReady'));
  const n = p.board.filter(Boolean).length;
  return el('span', { class: 'pill wait' }, t('pillArranging', { n, t: p.board.length }));
}

function bannerRemaining() {
  if (!st || !st.allReady) return 0;
  const elapsed = (serverNow() - st.allReady.at) / 1000;
  return BANNER_SECONDS - elapsed;
}

function burstConfetti() {
  if (reduceFx()) return;
  const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
  const cv = el('canvas', { class: 'confetti' }); cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const COLS = [[255, 214, 102], [245, 185, 65], [255, 236, 170], [255, 255, 255], [111, 207, 151], [255, 128, 128], [122, 170, 255], [190, 140, 255]];
  const ps = [], n = W < 500 ? 120 : 180;
  const add = (x, y, ang, spd, k) => { const c = COLS[k % COLS.length]; ps.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, c, w: 8 + Math.random() * 6, h: 5 + Math.random() * 4, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3, f: Math.random() * 6.28, vf: 0.08 + Math.random() * 0.14, sway: Math.random() * 6.28, star: Math.random() < 0.12, d: Math.random() * 6 | 0 }); };
  for (let i = 0; i < n; i++) {
    const side = i % 3;   // two corner cannons and a pop from the top centre
    if (side === 0) add(-10, H * 0.82, -1.05 - Math.random() * 0.5, 13 + Math.random() * 9, i);
    else if (side === 1) add(W + 10, H * 0.82, -Math.PI + 1.05 + Math.random() * 0.5, 13 + Math.random() * 9, i);
    else add(W * (0.2 + Math.random() * 0.6), -20, 1.57 + (Math.random() - 0.5) * 0.6, 2 + Math.random() * 4, i);
  }
  document.body.append(cv);
  const t0 = performance.now(); let last = t0;
  const tick = (now) => {
    const dt = Math.min(2.5, (now - last) / 16.67), t = now - t0; last = now;
    g.clearRect(0, 0, W, H);
    const fade = t > 4200 ? Math.max(0, 1 - (t - 4200) / 900) : 1;
    for (const q of ps) {
      if (q.d > 0) { q.d -= dt; continue; }   // a few frames of stagger so it reads as a burst, not a block
      q.vx *= Math.pow(0.975, dt); q.vy = q.vy * Math.pow(0.975, dt) + 0.32 * dt; if (q.vy > 3.2) q.vy = 3.2;   // air drag gives the slow flutter
      q.sway += 0.05 * dt; q.x += (q.vx + Math.sin(q.sway) * 0.9) * dt; q.y += q.vy * dt; q.r += q.vr * dt; q.f += q.vf * dt;
      if (q.y > H + 30) continue;
      const fl = Math.cos(q.f), lit = 0.62 + 0.38 * Math.abs(fl), shine = Math.pow(Math.abs(fl), 18);   // the foil catches the light as it turns
      const [r0, g0, b0] = q.c, cr = Math.min(255, r0 * lit + 255 * shine * 0.6), cg = Math.min(255, g0 * lit + 255 * shine * 0.6), cb = Math.min(255, b0 * lit + 255 * shine * 0.6);
      g.save(); g.translate(q.x, q.y); g.rotate(q.r); g.globalAlpha = fade;
      g.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
      if (q.star) { const s2 = q.w * 0.55 * (0.6 + 0.4 * Math.abs(fl)); g.beginPath(); for (let k = 0; k < 8; k++) { const a = k * 0.785, rr = k % 2 ? s2 * 0.32 : s2; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.fill(); }
      else { g.scale(1, Math.max(0.08, Math.abs(fl))); g.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); }
      g.restore();
    }
    if (t < 5200) requestAnimationFrame(tick); else cv.remove();
  };
  requestAnimationFrame(tick);
}

// the arranging countdown: the same server-time deadline on every phone
function timerLeft() { return st && st.deadline && st.phase === 'dealt' && !st.allReady ? (st.deadline - serverNow()) / 1000 : null; }
function timerBar() {
  const left = timerLeft();
  if (left === null) return null;
  const total = (st.settings && st.settings.timer) || 60;
  return el('div', { class: 'timerbar', id: 'timerbar' }, icon('clock', 18), el('b', { id: 'tm-t' }, fmtLeft(left)), el('div', { class: 'tm-bar' }, el('i', { id: 'tm-f', style: `width:${Math.max(0, Math.min(100, (left / total) * 100))}%` })));
}
const fmtLeft = (l) => { if (l <= 0) return t('timesUp'); const secs = Math.ceil(l); return Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'); };
let lastTick = -1;
function timerTick() {
  if (document.hidden) return setTimeout(timerTick, 1000);
  const left = timerLeft();
  const bar = document.getElementById('timerbar');
  if (left === null) { if (bar) bar.remove(); return setTimeout(timerTick, 1000); }
  if (!bar) return setTimeout(timerTick, 500);
  const total = (st.settings && st.settings.timer) || 60;
  const secs = Math.max(0, Math.ceil(left));
  document.getElementById('tm-t').textContent = left <= 0 ? t('timesUp') : Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
  document.getElementById('tm-f').style.width = Math.max(0, Math.min(100, (left / total) * 100)) + '%';
  bar.classList.toggle('urgent', left <= 10);
  if (left <= 5 && left > 0 && secs !== lastTick) { lastTick = secs; SND.play('tick'); buzz(15); }
  setTimeout(timerTick, 250);
}
timerTick();
// when the arranging clock runs out, the server arranges the stragglers the moment any phone asks: every phone asks (with or without
// the countdown on screen, a moment apart so they don't collide) and keeps asking until it has happened
let deadlineAsk = 0, deadlineTries = 0;
setInterval(() => {
  if (!session || !st || st.phase !== 'dealt' || !st.deadline || st.allReady) { deadlineTries = 0; return; }
  const over = serverNow() - st.deadline;
  if (over < 150 + (st.isHost ? 0 : 250 + Math.random() * 400) || deadlineTries >= 12 || Date.now() - deadlineAsk < 1500) return;
  deadlineAsk = Date.now(); deadlineTries++;
  clearTimeout(timer); poll(true, true).then(() => { if (session) startPolling(); });
}, 250);
// what the host has switched on, visible to everyone
function settingChips() {
  const g = st.settings; if (!g) return null;
  const bits = [];
  if (g.timer) bits.push([icon('clock', 14), g.timer + t('setSecs')]);
  if (g.jokers === false) bits.push([icon('x', 14), t('setNoJokers')]);
  if (g.mult !== 1) bits.push([icon('zap', 14), '×' + g.mult]);
  if (!bits.length || st.phase !== 'dealt' || st.allReady) return null;
  return el('div', { class: 'setchips' }, ...bits.map(([ic, txt]) => el('span', { class: 'setchip' }, ic, txt)));
}

// who was last: one name normally, or everyone the clock caught (a long list is shortened)
// the people who were last to get ready, as avatar + name chips that wrap (never cut off)
const lastIds = () => { const a = st.allReady; return ((a.timer ? a.ids : [a.id]) || []).filter((id) => st.players.some((q) => q.id === id)); };
function lastChips(size, cls) {
  const ids = lastIds();
  if (!ids.length) return el('div', { class: 'lpeople ' + cls }, el('b', {}, st.allReady.timer ? t('timesUp') : st.allReady.name));
  return el('div', { class: 'lpeople ' + cls + (ids.length === 1 ? ' one' : '') }, ...ids.map((id) => el('span', { class: 'lpc' }, avatarEl(avOf(id), ids.length === 1 ? size : Math.round(size * 0.7), 'sad', accOf(id), bdOf(id)), el('b', {}, dkName(id)))));
}
// the New Round shine runs on the page's clock: a redrawn button picks the sweep up exactly where it was instead of starting over
const nrSheen = (b) => { requestAnimationFrame(() => { if (b.isConnected) for (const a of b.getAnimations({ subtree: true })) if (a.animationName === 'sheen') a.startTime = 0; }); return b; };
function lastBanner() {
  const left = bannerRemaining();
  if (left <= 0) return null;
  if (confettiAt !== st.allReady.at) { confettiAt = st.allReady.at; if (left > BANNER_SECONDS - 6) burstConfetti(); }
  // one banner element for the whole 20 s: a redraw of the page re-attaches it instead of rebuilding it, so its entrance, shine and pulse never restart mid-way
  const key = st.allReady.at + ':' + (st.allReady.timer ? 't' : 'r') + ':' + lang;
  if (bannerNode && bannerKey === key) {
    const nm = bannerNode.querySelector('.lb-name'), sig = lastIds().map(dkName).join('|'); if (nm && nm.dataset.sig !== sig) { nm.dataset.sig = sig; nm.replaceChildren(lastChips(44, 'big')); }
    bannerNode.querySelector('#lb-sec').textContent = t('secs', { n: Math.ceil(left) }); bannerNode.querySelector('#lb-fill').style.width = (left / BANNER_SECONDS) * 100 + '%';
    phaseBanner(bannerNode); if (Date.now() - bannerT0 > 750) bannerNode.classList.add('still');
    return bannerNode;
  }
  bannerKey = key; bannerT0 = Date.now(); bannerP0 = performance.now();
  bannerNode = el('div', { class: 'lastbanner', id: 'lastbanner' },
    el('div', { class: 'lb-k' }, t(st.allReady.timer ? 'timesUpK' : 'bannerK')),
    el('div', { class: 'lb-name', 'data-sig': lastIds().map(dkName).join('|') }, lastChips(44, 'big')),
    el('div', { class: 'lb-s', id: 'lb-sec' }, t('secs', { n: Math.ceil(left) })),
    el('div', { class: 'lb-bar' }, el('i', { id: 'lb-fill', style: `width:${(left / BANNER_SECONDS) * 100}%` })));
  phaseBanner(bannerNode); const mine = bannerNode; setTimeout(() => mine.classList.add('still'), 900);
  return bannerNode;
}
// a re-attached node restarts its CSS animations: the shine and the name pulse are put back to where they would be had the banner never been redrawn
const phaseBanner = (n) => queueMicrotask(() => { if (!n.isConnected) return; const base = document.timeline.currentTime - (performance.now() - bannerP0); for (const a of n.getAnimations({ subtree: true })) if (a.animationName === 'sheen' || a.animationName === 'namepulse') a.startTime = base; });
let bannerNode = null, bannerKey = '', bannerT0 = 0, bannerP0 = 0;

// keeps the banner countdown moving and removes it when the 20 seconds are up
function bannerTick() {
  const b = document.getElementById('lastbanner');
  if (!b || document.hidden) return setTimeout(bannerTick, 1000);
  const left = bannerRemaining();
  if (left <= 0) {
    // never pull the page out from under a strike or a verdict: wait until they are over
    if (document.querySelector('.atkfx, .resfx')) return setTimeout(bannerTick, 400);
    const r = b.getBoundingClientRect(), cs = getComputedStyle(b), h = r.height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    if (r.bottom < 60) { safeRender(); window.scrollBy(0, -h); }   // scrolled out of sight: take it away and keep everything on screen exactly where it was
    else { b.style.overflow = 'hidden'; const an = b.animate([{ height: r.height + 'px', opacity: 1 }, { height: '0px', opacity: 0, marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px' }], { duration: 380, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }); an.onfinish = () => safeRender(); }   // in view: it folds away
    return setTimeout(bannerTick, 1000);
  }
  document.getElementById('lb-sec').textContent = t('secs', { n: Math.ceil(left) });
  document.getElementById('lb-fill').style.width = (left / BANNER_SECONDS) * 100 + '%';
  setTimeout(bannerTick, 500);
}
bannerTick();

const isLandscape = () => window.matchMedia('(orientation: landscape) and (max-height: 520px)').matches;

function screenName() {
  if (!session) return 'landing';
  if (!st) return 'rejoin';
  if (st.phase === 'lobby') return 'wait';
  const active = st.players.filter((p) => !p.spectator);
  return active.length && active.every((p) => p.ready) ? 'stage' : 'arrange';
}

// Rebuilding the page while someone is scrolling stops the scroll dead (or throws the page back up).
// So updates that arrive from the network wait until the finger has been still for a moment.
let lastTouch = 0, renderTimer = null, renderQueued = false, stageScroll = false;
['touchstart', 'touchmove', 'touchend', 'wheel', 'scroll'].forEach((ev) => window.addEventListener(ev, () => { lastTouch = Date.now(); }, { passive: true, capture: true }));
let renderSince = 0;
function safeRender() {
  const idle = Date.now() - lastTouch;
  if (!renderSince) renderSince = Date.now();
  // a screen waiting on a finger for more than ~2s is drawn anyway, so one phone can't fall far behind the table
  if ((idle >= 400 && !dragging) || (!dragging && Date.now() - renderSince > 2200)) { renderQueued = false; renderSince = 0; return render(); }
  renderQueued = true;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => { if (renderQueued) safeRender(); }, Math.max(60, 420 - idle));
}

// a rebuilt screen would restart every endless animation (the room code's shimmer jumped back to the start): line new ones up with the page clock instead
function keepLoopsInStep() {
  try {
    for (const a of document.getAnimations()) {
      const ti = a.effect && a.effect.getComputedTiming();
      if (ti && ti.iterations === Infinity && ti.duration > 0 && a.currentTime < 80) a.currentTime = (document.timeline.currentTime % ti.duration);
    }
  } catch {}
}
// opening the site with a room saved: the app icon and the room code while the state comes in
let rejoinAt = 0, rejoinT = null;
function renderRejoin() {
  if (!rejoinAt) rejoinAt = Date.now();
  const slow = Date.now() - rejoinAt > 7000;
  app.append(el('div', { class: 'rejoin' },
    el('div', { class: 'rj-ic' }, el('img', { src: '/icon-192.png', alt: '' })),
    el('div', { class: 'rj-t' }, t('rejoinT')), el('div', { class: 'rj-code' }, session.code),
    slow ? el('div', { class: 'rj-slow' }, el('p', {}, t('rejoinSlow')), el('div', { class: 'rj-btns' },
      el('button', { type: 'button', onclick: () => { rejoinAt = Date.now(); render(); resync(); } }, t('retryNow')),
      el('button', { type: 'button', class: 'ghost', onclick: () => { rejoinAt = 0; session = null; save(); render(); } }, t('rejoinHome'))))
    : el('div', { class: 'rj-dots' }, el('i'), el('i'), el('i'))));
  clearTimeout(rejoinT); if (!slow) rejoinT = setTimeout(() => { if (session && !st) render(); }, 7050 - (Date.now() - rejoinAt));
}
// Return from the attack camera only after the whole row presentation is clear.
let ownCardReturnTimer = null, ownCardReturnAnimation = 0;
function queueOwnCardReturn() {
  clearTimeout(ownCardReturnTimer); cancelAnimationFrame(ownCardReturnAnimation);
  if (!st) return;
  const key = st.code + ':' + st.round;
  const current = () => st && st.code + ':' + st.round === key && !document.querySelector('.final');
  const blocked = () => document.querySelector('.atkfx, .resfx, .drinkfx, .nextfx, .winfx');
  const attempt = () => {
    ownCardReturnTimer = null;
    if (!current()) return;
    if (blocked() || drinkPendingRow() >= 0 || lateDrinkPending() || stageRow < (st.currentRow ?? 0)) {
      ownCardReturnTimer = setTimeout(attempt, 100); return;
    }
    const cards = document.querySelector('.stage .tile.me .tcards');
    if (!cards) return;
    const rect = cards.getBoundingClientRect();
    const tween = (duration, paint) => new Promise((resolve) => {
      const started = performance.now(), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const frame = (now) => {
        if (!current() || blocked()) { resolve(); return; }
        const progress = reduced ? 1 : Math.min(1, (now - started) / Math.max(900, duration));
        paint(progress);
        if (progress < 1) ownCardReturnAnimation = requestAnimationFrame(frame);
        else { ownCardReturnAnimation = 0; resolve(); }
      };
      ownCardReturnAnimation = requestAnimationFrame(frame);
    });
    panAttackCamera(rect.top + window.scrollY + rect.height / 2, innerHeight, tween);
  };
  ownCardReturnTimer = setTimeout(attempt, 100);
}

// Frame the next-round controls and standings once on arrival, wherever the viewer was.
let hallFramedKey = '', hallFrameTimer = null, hallFrameAnimation = 0;
function hallFrameTarget(first, hall, from = window.scrollY) {
  const top = first.getBoundingClientRect().top + window.scrollY - 16;
  const bottom = hall.getBoundingClientRect().bottom + window.scrollY + 16;
  const height = window.innerHeight;
  // Leave a view that already contains both sections alone. Otherwise center the
  // pair when it fits; on short screens keep Another Round and the podium first.
  if (top >= from && bottom <= from + height) return from;
  const target = bottom - top <= height ? (top + bottom - height) / 2 : top;
  return Math.max(0, Math.min(document.documentElement.scrollHeight - height, target));
}
function syncHallFraming() {
  const hall = document.querySelector('.final .hallwrap');
  if (!st || !hall) {
    clearTimeout(hallFrameTimer); hallFrameTimer = null;
    cancelAnimationFrame(hallFrameAnimation); hallFrameAnimation = 0;
    hallFramedKey = ''; return;
  }
  const key = st.code + ':' + st.round;
  if (hallFramedKey === key || hallFrameTimer !== null) return;
  const begin = () => {
    hallFrameTimer = null;
    if (!st || st.code + ':' + st.round !== key || !document.querySelector('.final .hallwrap')) return;
    if (document.querySelector('.atkfx, .resfx, .drinkfx, .nextfx, .winfx')) {
      hallFrameTimer = setTimeout(begin, 100); return;
    }
    hallFramedKey = key;
    const start = window.scrollY, started = performance.now();
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200;
    const frame = (now) => {
      const standings = document.querySelector('.final .hallwrap');
      if (!st || st.code + ':' + st.round !== key || !standings) return;
      const first = document.querySelector('.final .nextbar') || standings;
      const progress = duration ? Math.min(1, (now - started) / duration) : 1;
      const eased = progress * progress * (3 - 2 * progress);
      // Resolve against the original position so repeated frames do not chase
      // a moving "already visible" destination during the pan.
      const target = hallFrameTarget(first, standings, start);
      window.scrollTo({ top: start + (target - start) * eased, behavior: 'instant' });
      if (progress < 1) hallFrameAnimation = requestAnimationFrame(frame);
      else hallFrameAnimation = 0;
    };
    hallFrameAnimation = requestAnimationFrame(frame);
  };
  hallFrameTimer = setTimeout(begin, 600);   // allow the final panel's entrance to settle
}

function render() {
  const reveals = captureRevealAnimations(app);
  const focus = focusSnapshot(app);
  if (!st || st.phase !== 'dealt' || st.players.find((p) => p.id === st.meId)?.ready) keyboardPick = null;
  const keepY = window.scrollY;
  app.dataset.screen = screenName();
  app.replaceChildren();
  if (!session) renderLobby();
  else if (!st) renderRejoin();   // a saved room: show that we are getting back in, never the home page first
  else renderGame();
  restoreRevealAnimations(app, reveals);
  fx = {}; newSeats.clear(); screenAnim = false; dealAnim = false; tearRows.clear(); stageEnter = false;
  renderPlayers();   // keep an open player list in step with the room
  renderSettings();
  syncEmoteUi();
  renderShop();
  syncDrinkUi();
  keepLoopsInStep();
  restoreFocus(focus, app);
  // measuring the half-built page can clamp the scroll position; put it back
  if (Math.abs(window.scrollY - keepY) > 1) window.scrollTo(0, keepY);
  if (stageScroll) {   // moving on to the next row: bring it into view, but never while the player is scrolling
    stageScroll = false;
    const e = document.querySelector('.stage, .final');
    if (e && !e.classList.contains('final')) queueOwnCardReturn();
  }
  syncHallFraming();
}

const activePlayers = () => st.players.filter((p) => !p.spectator);   // joined mid-round players only watch


