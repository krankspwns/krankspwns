// ---- optimistic actions: the board updates instantly, the server confirms in the background ----
let pending = 0, queue = Promise.resolve(), best = null, failed = false;

function predict(action, x) {
  const next = structuredClone(st);
  const me = next.players.find((p) => p.id === next.meId);
  if (next.phase !== 'dealt') return null;
  const move = ['place', 'move', 'unplace'].includes(action);
  if (move && me.ready) return null;
  switch (action) {
    case 'place': {
      const i = next.hand.indexOf(x.card);
      if (i < 0) return null;
      next.hand.splice(i, 1);
      if (me.board[x.slot]) next.hand.push(me.board[x.slot].c);
      me.board[x.slot] = { c: x.card, up: false };
      return next;
    }
    case 'move':
      if (!me.board[x.from]) return null;
      [me.board[x.from], me.board[x.to]] = [me.board[x.to], me.board[x.from]];
      return next;
    case 'unplace':
      if (!me.board[x.slot]) return null;
      next.hand.push(me.board[x.slot].c);
      me.board[x.slot] = null;
      return next;
    case 'flip':
      if (!me.board[x.slot]) return null;
      me.board[x.slot].up = !me.board[x.slot].up;
      return next;
    case 'flipRow': {
      if (!next.players.filter((p) => !p.spectator).every((p) => p.ready)) return null;
      const start = ROWS.slice(0, x.row).reduce((a, n) => a + n, 0);
      for (let i = start; i < start + ROWS[x.row]; i++) if (me.board[i]) me.board[i].up = !!x.up;
      return next;
    }
    case 'flipRowAll': {
      if (!next.players.filter((p) => !p.spectator).every((p) => p.ready)) return null;
      const start = ROWS.slice(0, x.row).reduce((a, n) => a + n, 0);
      for (const pl of next.players.filter((p) => !p.spectator)) for (let i = start; i < start + ROWS[x.row]; i++) if (pl.board[i]) pl.board[i].up = !!x.up;
      return next;
    }
    case 'ready':
      if (x.ready && !me.board.every(Boolean)) return null;
      if (!x.ready && next.players.filter((p) => !p.spectator).every((p) => p.ready)) return null;   // game in progress
      me.ready = !!x.ready;
      if (me.ready) me.board.forEach((c) => c && (c.up = false));
      return next;
  }
  return null;
}

const ACT_SOUND = { predict: '', place: 'place', move: 'place', unplace: 'return', flip: 'flip', flipRow: 'flip', flipRowAll: 'flip', kick: 'kick' };
function act(action, extra = {}) {
  if (!session) return;
  const mine = session;
  if (['place', 'move', 'unplace', 'ready', 'deal'].includes(action)) keyboardPick = null;
  err = '';
  if (action === 'ready') SND.play(extra.ready ? 'ready' : 'unready'); else if (ACT_SOUND[action]) SND.play(ACT_SOUND[action]);
  const next = st && predict(action, extra);
  if (next) { diffFx(st, next); st = next; render(); }
  if (action === 'deal') showBusy(t('dealing'));   // no optimistic preview for a deal: show that something is happening
  pending++;
  // Requests go out one at a time, in order, so quick successive moves can't overtake each other.
  queue = queue
    .then(async () => {
      if (session !== mine || failed) return;
      try {
        const j = await api(action, { ...extra, ...mine });
        if (session !== mine) return;
        if (!best || j.version > best.version) best = j;
      }
      catch (e) { if (session !== mine) return; err = e.message; failed = true; needsReconcile = true; SND.play('error'); if (!e.status || e.status >= 500) { connFails = Math.max(connFails, 1); setConn(true); } }
    })
    .then(async () => {
      if (session !== mine || --pending > 0) return;
      let j = best; best = null;
      if (failed) {   // something was rejected: pull the real state so the screen can't drift
        failed = false;
        try {
          j = await fetchJson(`/api/game?code=${mine.code}&pid=${mine.pid}&f=1&cn=${chatHave ?? ''}`, { headers: { 'x-tok': mine.tok || '' } });
          if (session === mine) { needsReconcile = false; connFails = 0; setConn(false); }
        } catch (e) { if (session === mine && e.status === 404) return dropSession(/not in this room/i.test(e.message) ? 'You were removed from the room by the host' : 'Room no longer available'); }
        if (session !== mine) return;
      }
      if (j && !j.error) adopt(j);
      if (!dragging) render();
      hideBusy();
    });
}

// a full-screen "working…" layer for actions the server has to finish before anything can be shown
let busyEl = null, busyAt = 0;
function showBusy(msg) {
  if (busyEl) return;
  busyAt = Date.now();
  busyEl = el('div', { class: 'loadbanner full', role: 'status' }, el('i', { class: 'spin' }), el('span', {}, msg));
  document.body.append(busyEl);
}
function hideBusy() {
  const o = busyEl; if (!o) return;
  busyEl = null;
  setTimeout(() => o.remove(), Math.max(0, 450 - (Date.now() - busyAt)));   // never just a flash
}

function dropSession(message) {
  emoteSeen = null; chatLog = []; chatHave = undefined;
  if (/removed/i.test(message)) SND.play('kick');
  session = null; st = null; rtClose(); setConn(false); save(); clearTimeout(timer); closePlayers(); err = message; render();
}

// joining a different room in another tab of this browser means leaving this one (the browser shares one saved seat between its tabs)
window.addEventListener('storage', (e) => {
  if (e.key !== 'sct' || !e.newValue || !session) return;
  let n; try { n = JSON.parse(e.newValue); } catch { return; }
  if (!n || !n.code || n.code === session.code) return;
  const old = session;
  try { fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'leave', code: old.code, pid: old.pid, tok: old.tok }), keepalive: true }); } catch {}
  emoteSeen = null; giftSeen = null; wpDisp = null; wpTarget = null; chatLog = []; chatHave = undefined;
  clearTimeout(timer); rtClose(); session = null; st = null; closePlayers();   // not save(): that would erase the other tab's new seat
  err = 'You joined another room in another tab'; render();
});

// leaving asks first; the poller is stopped before the request so a late reply can never be mistaken for being kicked
function confirmLeave() {
  if (document.querySelector('.leave-ov')) return;
  const close = () => ov.remove();
  const ov = el('div', { class: 'guide-ov leave-ov', onclick: (e) => { if (e.target === ov) close(); } },
    el('div', { class: 'avbox leavebox', role: 'alertdialog', 'aria-modal': 'true' },
      el('div', { class: 'avtitle' }, t('leaveQ')),
      el('p', { class: 'leavep' }, st && st.isHost && st.players.length > 1 ? t('leaveHostNote') : t('leaveNote')),
      el('div', { class: 'leaverow' },
        el('button', { type: 'button', class: 'ghost', onclick: close }, t('stay')),
        el('button', { type: 'button', class: 'dangerbtn leavego', onclick: () => { close(); leave(); } }, el('span', { class: 'iconlabel' }, el('span', { class: 'cpdisc' }, icon('logout', 16)), t('leaveYes'))))));
  document.body.append(ov);
}

async function leave() {
  const s = session;
  emoteSeen = null; giftSeen = null; wpDisp = null; wpTarget = null; chatLog = []; chatHave = undefined;
  clearTimeout(timer); session = null; rtClose();   // stop polling at once
  closePlayers();
  const ov = el('div', { class: 'loadbanner full', role: 'status' }, el('i', { class: 'spin' }), el('span', {}, t('leaving')));
  document.body.append(ov);
  const started = Date.now();
  try { if (s) await api('leave', s); } catch {}
  if (Date.now() - started < 450) await new Promise((r) => setTimeout(r, 450 - (Date.now() - started)));   // never just a flash
  st = null; save(); render();
  ov.remove();
}

