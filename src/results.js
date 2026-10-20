// ---- row-by-row stage: which row is on screen, and how long a scored row stays up before moving on ----
let stageRow = null, holdTimer = null, stageEnter = false;
const tearRows = new Set();   // rows whose tear animation should play on the next render
const HOLD_MS = 7800;         // 5s pop-up + a moment to look at the torn cards

let holdWait = 0;
function advanceStage() {
  holdTimer = null;
  if (!st) return;
  // the next row never cuts in on a strike or a verdict that is still playing (up to 8 s of extra patience)
  if (document.querySelector('.atkfx, .resfx, .drinkfx') && holdWait < 16) { holdWait++; holdTimer = setTimeout(advanceStage, 500); return; }
  holdWait = 0;
  const target = st.currentRow ?? 0;
  { const dp = drinkPendingRow(); if (dp >= 0 && dp >= stageRow && stageRow < target) { holdTimer = setTimeout(advanceStage, 500); return; } }   // drink mode: the next row waits on the stage until the drinks are done
  if (stageRow < target) {
    stageRow = Math.min(stageRow + 1, target);
    stageEnter = true;
    showNext(stageRow);
    stageScroll = true;
    safeRender();
    if (stageRow < target) holdTimer = setTimeout(advanceStage, 2500);   // catching up on rows scored while we were busy
  }
}

// Which row is on stage follows the server's clock: a scored row stays up until its stamp + HOLD_MS, then everyone moves on together.
function planStage(j, prev) {
  const target = Math.min(j.currentRow ?? 0, 4);
  const last = (j.rowResults || []).reduce((a, r) => (!a || (r.at || 0) > (a.at || 0) ? r : a), null);
  const left = last && last.at ? last.at + HOLD_MS - serverNow() : -1;
  clearTimeout(holdTimer); holdTimer = null;
  if (left > 0 && last.row < target) {
    stageRow = last.row;
    holdTimer = setTimeout(advanceStage, left);
  } else if (left > 0 && last.row >= target) {   // the final row (4) is on show
    stageRow = last.row;
    holdTimer = setTimeout(advanceStage, left);
  } else if (stageRow !== target && stageRow != null && prev && (drinkPendingRow() >= stageRow || document.querySelector('.drinkfx'))) {
    holdTimer = setTimeout(advanceStage, 500);   // drink mode: stay on the scored row until its drinks are done
  } else if (stageRow !== target) {
    const had = stageRow != null && prev;
    stageRow = target;
    if (had) { stageEnter = true; showNext(target); stageScroll = true; }
  }
}

function adopt(j) {
  if (st && st.code === j.code && j.version < st.version) return false;
  const prev = st && st.code === j.code ? st : null;
  j.recvAt = Date.now();
  if (prev) diffFx(prev, j);
  if (prev && j.round > prev.round) { showRound(j.round); SND.play('round'); setTimeout(() => SND.play('shuffle'), 450); }
  if (prev && !prev.allReady && j.allReady) setTimeout(() => SND.play('allready'), 150);
  const target = j.currentRow ?? 0;
  if (!prev || prev.round !== j.round) { stageRow = Math.min(target, 4); clearTimeout(holdTimer); holdTimer = null; }
  st = j;   // planStage and the pop-up read the new state
  handleEmotes(j);
  handleGifts(j);
  handleChat(j, prev);
  if (prev) { const was = prev.players.find((q) => q.id === prev.meId), now = j.players.find((q) => q.id === j.meId); if (was && now && (now.wins || 0) > (was.wins || 0)) celebrateWhenReady(now.id, j.round); }
  if (prev) {   // announce a row the moment it is scored; results persist, so reopening a row is never re-announced
    const had = new Set((prev.rowResults || []).map((r) => r.row));
    const fresh = (j.rowResults || []).filter((r) => !had.has(r.row));
    if (fresh.length) {
      const r = fresh[fresh.length - 1];
      const elapsed = r.at ? Math.max(0, serverNow() - r.at) : 0;   // a phone that hears late joins part-way through
      if (elapsed < 9000) { showResult(r, j, Math.min(elapsed, 1200)); tearRows.add(r.row); }   // a row this phone has never seen still gets its full show, however late the news came
    }
  }
  planStage(j, prev);
  const key = (x) => x.phase + ':' + x.round;
  if (!prev || key(prev) !== key(j)) { screenAnim = true; dealAnim = j.phase === 'dealt'; }
  st = j; lastKey = j.version;
  return true;
}

// What a card looks like to me: its id, '#' for a face-down card, or null for an empty slot.
function face(view, p, s) {
  if (!s) return null;
  const visible = p.id === view.meId ? (!p.ready || s.up) : s.up;
  return visible ? s.c : '#';
}


// ---- row results (computed by the server once everyone's row is face up) ----
function cardChip(id, as) {
  if (as && id === 'JK') return el('span', { class: 'cchip jk' }, '★→' + as.slice(0, -1) + SUIT[as.slice(-1)]);
  if (id === 'JK') return el('span', { class: 'cchip jk' }, '★');
  const suit = id.slice(-1);
  return el('span', { class: 'cchip' + (suit === 'H' || suit === 'D' ? ' red' : '') }, id.slice(0, -1) + SUIT[suit]);
}
const effOf = (r, id, i) => { const e = r.entries.find((x) => x.id === id); return e && e.as ? e.as[i] : null; };
function loserNames(r) { return r.losers.map((id) => r.entries.find((e) => e.id === id).name); }

// Scoreboard: four fixed rows, always in the same place. Tap a row to see everyone's cards.
const openRows = new Set();

// ---- drink mode: after each row its losers drink their penalty, and the table waits until they all say they have ----
const drinkOn = () => !!(st && st.settings && st.settings.drink);
const dkName = (id) => (st.players.find((q) => q.id === id) || {}).name || '?';
const ptsN = (n) => drinkOn() ? t('drinksN', { n }) : t('hallPts', { n });
function drinksOf(row) {   // { id: [drinks] } for a row, or for 'late' (the last to get ready, before the guessing): the same sum the server makes
  const act = new Set(activePlayers().map((p) => p.id)), out = {};
  if (row === 'late') { if (!st.allReady || st.phase !== 'dealt') return null; for (const [id, n] of Object.entries(st.latePen || {})) out[id] = [n]; }
  else { const r = (st.rowResults || []).find((x) => x.row === row); if (!r) return null; if (!r.tie) for (const id of r.losers) out[id] = [(out[id] ? out[id][0] : 0) + r.penalty]; }
  for (const id of Object.keys(out)) if (!act.has(id)) delete out[id];
  return out;
}
function lateDrinkPending() {
  if (!drinkOn() || !st || st.phase !== 'dealt' || !st.allReady) return false;
  const owed = drinksOf('late') || {}, done = (st.drunk && st.drunk.late) || {};
  return Object.keys(owed).some((id) => !done[id]);
}
function drinkPendingRow() {
  if (!drinkOn() || !st || st.phase !== 'dealt') return -1;
  for (let row = 0; row < 4; row++) {
    const owed = drinksOf(row); if (!owed) break;
    const done = (st.drunk && st.drunk[row]) || {};
    if (Object.keys(owed).some((id) => !done[id])) return row;
  }
  return -1;
}
const SHOT_SVG = (full) => `<svg viewBox="0 0 30 40" aria-hidden="true"><defs><linearGradient id="shL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#d9771c"/></linearGradient><linearGradient id="shG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="rgba(255,255,255,.55)"/><stop offset=".5" stop-color="rgba(255,255,255,.12)"/><stop offset="1" stop-color="rgba(255,255,255,.4)"/></linearGradient></defs>`
  + (full ? '<path class="shliq" d="M6.2 9h17.6l-2 22.5H8.2z" fill="url(#shL)"/><ellipse class="shliq" cx="15" cy="9" rx="8.8" ry="1.6" fill="#ffe7a8"/>' : '<path d="M8.3 29h13.4l-.2 2.5H8.5z" fill="rgba(255,210,122,.45)"/>')
  + '<path d="M4 3h22l-3.2 33H7.2z" fill="url(#shG)" fill-opacity=".35" stroke="rgba(255,255,255,.85)" stroke-width="1.4" stroke-linejoin="round"/><path d="M7.2 36h15.6l.4-4.5H6.8z" fill="rgba(255,255,255,.35)"/><path d="M7.5 6.5l2 24" stroke="rgba(255,255,255,.7)" stroke-width="1.3" stroke-linecap="round"/></svg>';
let drinkSig = '', drinkCheer = null, drinkBusyAt = 0, drinkSeen = { row: -1, done: {} };   // who had finished at the last drawing, so a fresh finish plays its glasses draining
function syncDrinkUi() {
  const ov = document.querySelector('.drinkfx');
  const keyOf = (v) => (v === 'late' ? 'late' : +v);
  let row = st && session ? (lateDrinkPending() ? 'late' : drinkPendingRow()) : -1, closing = false;
  // the last drinker has just finished: draw the row once more so their glasses drain, then the cheers
  if (row === -1 && ov && !drinkCheer && !ov.classList.contains('out') && st) { const k = keyOf(ov.dataset.row), o = drinksOf(k); if (o && drinkSeen.row === k && Object.keys(o).some((id) => !drinkSeen.done[id])) { row = k; closing = true; } }
  const late = row === 'late';
  if (document.querySelector('.resfx, .atkfx, .nextfx')) drinkBusyAt = Date.now();
  const busy = Date.now() - drinkBusyAt < 700;   // the row's own reveal plays first, and a beat after it
  const r = !late && row >= 0 ? (st.rowResults || []).find((x) => x.row === row) : null;
  const held = !closing && (late ? serverNow() - (st.allReady.at || 0) < 1400 && !ov : r && (r.losers.some((id) => atkHeld.has(id)) || (r.tie && atkHeld.has('tie:' + r.row)) || (r.at && serverNow() - r.at < 1800 && !ov)));   // the verdict (or the everyone-is-ready moment) is seen first
  if (row === -1 || (busy && !closing && !late) || held) {
    if (ov && !ov.classList.contains('out')) {   // everyone has finished: a toast of the glasses, then away
      if (row === -1 && !drinkCheer) { drinkCheer = ov; ov.classList.add('cheers'); SND.play('chime'); setTimeout(() => { ov.classList.add('out'); setTimeout(() => { ov.remove(); drinkCheer = null; }, 380); }, 1100); }
      else if (row !== -1) ov.remove();
    }
    drinkSig = ''; return;
  }
  const owed = drinksOf(row), done = (st.drunk && st.drunk[row]) || {}, ids = Object.keys(owed);
  const sig = JSON.stringify([lang, row, owed, done, st.meId, st.isHost]);
  if (ov && sig === drinkSig && !ov.classList.contains('cheers')) return;
  const fresh = !ov || ov.dataset.row !== String(row) || ov.classList.contains('cheers');
  drinkSig = sig;
  const nDone = ids.filter((id) => done[id]).length, mine = owed[st.meId], meDone = !!done[st.meId];
  const justDone = drinkSeen.row === row ? ids.filter((id) => done[id] && !drinkSeen.done[id]) : [];
  drinkSeen = { row, done: { ...done } };
  if (justDone.length) SND.play('gulp');
  const waitNames = ids.filter((id) => !done[id]).map((id) => dkName(id));
  const people = ids.map((id, i) => {
    const [n] = owed[id], ok = !!done[id], shown = Math.min(n, 8);
    const drain = justDone.includes(id);
    return el('div', { class: 'dkp' + (ok ? ' ok' : '') + (drain ? ' drain' : '') + (id === st.meId ? ' me' : ''), style: `--d:${i * 0.12}s` },
      el('span', { class: 'dkav' }, avatarEl(avOf(id), 46, ok ? 'happy' : 'sad', accOf(id), bdOf(id)), ok ? el('b', { class: 'dktick' }, icon('tick', 12)) : ''),
      el('div', { class: 'dkinfo' }, el('b', {}, dkName(id) + (id === st.meId ? t('you') : '')),
        el('div', { class: 'dkshots' }, ...Array.from({ length: shown }, (_, k) => { const g2 = el('span', { class: 'shot', style: `--k:${(i * 0.12 + k * 0.07).toFixed(2)}s` }); g2.innerHTML = SHOT_SVG(!ok || drain); if (drain) g2.style.setProperty('--k', (k * 0.12).toFixed(2) + 's'); return g2; }), n > shown ? el('em', {}, '×' + n) : ''),
        late ? el('small', { class: 'dklate' }, st.allReady.timer ? t('drinkAuto') : t('drinkLate')) : ''),
      el('span', { class: 'dkn' + (ok ? ' ok' : '') }, ok ? t('drinkFin') : t('drinksN', { n })));
  });
  const foot = mine && !meDone
    ? el('button', { type: 'button', class: 'dkbtn', onclick: () => { st.drunk = st.drunk || {}; st.drunk[row] = { ...(st.drunk[row] || {}), [st.meId]: true }; buzz(30); act('drank', { row }); syncDrinkUi(); } }, el('span', { class: 'dkbic' }, icon('tick', 16)), t('drinkBtn', { n: mine[0] }))
    : el('div', { class: 'dkwait' }, el('span', { class: 'dot' }), !waitNames.length ? t('drinkAllDone') : mine ? t('drinkMeDone') : t('drinkWait', { names: waitNames.join(', ') }));
  const box = el('div', { class: 'dkbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('drinkT') },
    el('div', { class: 'dkglow' }),
    el('div', { class: 'dkhead' }, el('div', { class: 'dkk' }, late ? t('drinkLateK') : t('drinkK', { n: row + 1 })), el('div', { class: 'dkt' }, t('drinkT')),
      el('div', { class: 'dkprog' }, el('span', { class: 'dkbar' }, el('i', { style: `width:${ids.length ? (nDone / ids.length) * 100 : 0}%` })), el('span', {}, t('drinkProg', { d: nDone, n: ids.length })))),
    el('div', { class: 'dklist' }, ...people),
    foot,
    st.isHost ? el('button', { type: 'button', class: 'ghost dkskip', onclick: () => { st.drunk = st.drunk || {}; st.drunk[row] = Object.fromEntries(ids.map((id) => [id, true])); act('drank', { row, all: true }); syncDrinkUi(); } }, (() => { const s = el('span', { class: 'dkskic' }); s.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5v13l8.5-6.5z M12.5 5.5v13l8.5-6.5z" fill="#ffc27a"/></svg>'; return s; })(),el('span', {}, t('drinkSkip')), el('em', { class: 'dkhost' }, t('host'))) : '',
    el('div', { class: 'dkcheer' }, t('drinkCheers')));
  const node = ov || el('div', { class: 'drinkfx' });
  node.dataset.row = String(row); node.classList.remove('cheers', 'out'); node.classList.toggle('fresh', fresh);
  node.replaceChildren(box);
  if (!ov) { document.body.append(node); SND.play('pop'); }
  if (closing) { drinkCheer = node; setTimeout(() => { node.classList.add('cheers'); SND.play('chime'); setTimeout(() => { node.classList.add('out'); setTimeout(() => { node.remove(); drinkCheer = null; }, 380); }, 1100); }, 1100); }   // every drink penalty ends with draining glasses, then Cheers!
}
setInterval(() => { if (st && (drinkOn() || document.querySelector('.drinkfx'))) syncDrinkUi(); }, 400);

function resultsPanel() {
  const list = st.rowResults || [];
  if (!list.length && !st.allReady) return null;
  const byRow = Object.fromEntries(list.filter((r) => !r.losers.some((id) => atkHeld.has(id)) && !(r.tie && atkHeld.has('tie:' + r.row))).map((r) => [r.row, r]));   // a row whose creature is still flying stays a secret
  const box = el('div', { class: 'panel results' }, el('div', { class: 'reshead' }, el('div', { class: 'name' }, t('resTitle')), el('span', { class: 'resprog' }, ...[0, 1, 2, 3].map((i) => el('i', { class: 'rc' + (i + 1) + (byRow[i] ? ' on' : '') })))));
  if (st.allReady) {   // stays visible after the banner is gone
    box.append(el('div', { class: 'lastready' },
      el('span', { class: 'lrtxt' }, el('span', { class: 'lrk' }, icon('clock', 12, 'mono'), t('lastReady')), lastChips(30, 'sm')),
      Object.keys(st.latePen || {}).length ? el('span', { class: 'rpen mid lrpen', title: t('latePenTip') }, '+' + Object.values(st.latePen)[0]) : ''));
  }
  const board = el('div', { class: 'rlist' });
  for (let row = 0; row < 4; row++) {
    const r = byRow[row];
    const num = el('div', { class: 'rnum' }, String(row + 1));
    const rule = el('div', { class: 'rrule' }, t('rule' + (row + 1)));
    if (!r) {   // not opened yet: a quiet placeholder so the layout never jumps around
      board.append(el('div', { class: 'ritem pending rc' + (row + 1) }, num, el('div', { class: 'rbody' }, rule, el('div', { class: 'rwait' }, t('notOpened'))), el('div')));
      continue;
    }
    const names = loserNames(r);
    const open = openRows.has(row);
    const item = el('div', { class: 'ritem rc' + (row + 1) + ' ' + (r.tie ? 'tie' : 'lose') + (open ? ' open' : ''), role: 'button', tabindex: 0, 'data-focus': 'result-row-' + row,
      onkeydown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } },
      onclick: () => { open ? openRows.delete(row) : openRows.add(row); render(); } },
      num,
      el('div', { class: 'rbody' }, rule,
        el('div', { class: 'rchips' }, ...(r.tie ? [el('span', { class: 'tiechip' }, t('tie'))] : r.losers.map((id, i) => el('span', { class: 'loserchip' }, avatarEl(avOf(id), 20, 'sad', accOf(id), ''), el('span', {}, names[i])))))),
      el('div', { class: 'rside' },
        r.tie ? el('div', { class: 'rpen none' }, t('noPenalty')) : el('div', { class: 'rpen' + (r.penalty >= 4 ? ' big' : r.penalty >= 2 ? ' mid' : '') }, '×' + r.penalty),
        el('span', { class: 'rcaret' })));
    if (open) {
      const detail = el('div', { class: 'rdet' });
      r.entries.forEach((e) => {
        const lose = r.losers.includes(e.id);
        const value = el('span', { class: 'rdv' }, ...e.cards.map((c, ci) => cardChip(c, e.as ? e.as[ci] : null)));
        if (r.row === 2) value.append(el('b', { class: e.bust ? 'bad' : '' }, ` ${e.total}`), e.bust ? el('em', {}, ` ${t('bust')}`) : '');
        if (r.row === 3) value.append(el('span', { class: 'tstep rdhand' + (e.hand === 'none' ? ' bad' : ' tt-' + e.hand) }, t('gh_' + e.hand)));   // the same pattern pill as the row 4 tip
        detail.append(el('div', { class: 'rd' + (lose ? ' lose' : '') }, el('span', { class: 'rdn' }, e.name), value));
      });
      item.append(detail);
    }
    board.append(item);
  }
  box.append(board, el('div', { class: 'rtip' }, t('tapDetails')));
  return box;
}


