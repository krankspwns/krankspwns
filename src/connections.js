// what the screen is drawn from: reactions, chat and the clock don't change it, so they never trigger a rebuild (which would replay every entrance animation)
const IGNORED_FOR_RENDER = new Set(['version', 'now', 'emotes', 'emoteN', 'gifts', 'giftN', 'wallet', 'chat', 'chatN', 'recvAt', 'seenAgo', 'predN']);   // predN is patched into the page directly, so other people's guesses never redraw the screen
const renderSig = (v) => JSON.stringify(v, (k, val) => (IGNORED_FOR_RENDER.has(k) ? undefined : val));
let connFails = 0, needsReconcile = false;
function setConn(down) {
  const has = document.getElementById('connbar');
  if (down && !has) {
    const bar = el('div', { id: 'connbar', class: 'connbar', role: 'status' }, el('i', { class: 'spin sm' }), el('span', {}, t('reconnecting')), el('button', { type: 'button', onclick: () => resync() }, t('retryNow')));
    document.body.append(bar);
  } else if (!down && has) has.remove();
}
async function pollOnce(force = false, fresh = false) {
  if (!session) return;
  force = force || needsReconcile; fresh = fresh || needsReconcile;
  const t0 = Date.now(), mine = session;
  try {
    const j = await fetchJson(`/api/game?code=${mine.code}&pid=${mine.pid}&cn=${chatHave}${!force && st && st.version ? '&v=' + st.version : ''}${fresh ? '&f=1' : ''}`, { headers: { 'x-tok': mine.tok || '' } });
    if (session !== mine) return;   // we left (or switched rooms) while this was in flight
    noteClock(j.now, t0, Date.now());
    if (connFails) { connFails = 0; setConn(false); }
    if (j.same) { if (st && j.emotes) handleEmotes({ ...j, meId: st.meId }); return; }   // reactions arrive even when the room itself has not changed
    if (dragging || pending > 0) return;
    // the host's online/offline dots change without the room itself changing, so look for those too
    const presenceSig = (v) => v.players.map((q) => q.id + (q.online === false ? 'x' : '')).join();
    if (!force && j.version <= (st?.version ?? 0) && !(st?.isHost && (document.querySelector('.pl-ov') || presenceSig(j) !== presenceSig(st)))) return;
    const unchanged = !!st && !force && renderSig(j) === renderSig(st) && !err;
    adopt(j);
    needsReconcile = false;
    err = '';
    if (!unchanged) safeRender(); else { renderShop(); syncEmoteUi(); const pc = document.querySelector('.ppcount'); if (pc && st.predN !== undefined && serverNow() >= (st.predWin ? st.predWin.from : 0)) pc.textContent = st.predN ? t('predPicked', { n: st.predN }) : t('predNoneYet'); }
  } catch (e) {
    if (session !== mine) return;
    if (e.status === 404) return dropSession(/not in this room/i.test(e.message) ? 'You were removed from the room by the host' : 'Room no longer available');
    if (++connFails >= 2 || !navigator.onLine) setConn(true);
  }
}
let pollFlight = null;
async function poll(force = false, fresh = false) {
  if (pollFlight) {
    await pollFlight;
    if (!force && !fresh) return;
    return poll(force, fresh);
  }
  const flight = pollOnce(force, fresh);
  pollFlight = flight;
  try { await flight; } finally { if (pollFlight === flight) pollFlight = null; }
}
// pull the newest state right now (used by the reconnect banner and the settings screen)
function resync() { clearTimeout(timer); poll(true).then(() => { if (session) startPolling(); }); }
window.addEventListener('online', () => { if (session) resync(); });
window.addEventListener('offline', () => { if (session) setConn(true); });
window.addEventListener('focus', () => { if (session && !document.hidden) resync(); });
window.addEventListener('pageshow', () => { if (session) resync(); });

// adaptive polling keeps the free Redis quota alive: fast while cards are in play, slower in the lobby, slowest when the tab is hidden
// avatars idle with an occasional blink or breath instead of looping forever: the same life for a fraction of the work
(function fidget() {
  if (!document.hidden && !document.body.classList.contains('calm') && !document.body.classList.contains('autocalm')) {
    // each avatar has about a one in four chance per round, so all of them blink every few seconds, never all at once
    document.querySelectorAll('.av:not(.happy):not(.sad)').forEach((a) => {
      const r = Math.random();
      if (r > .3) return;
      const c = r < .26 ? 'blk' : 'fid';
      a.classList.add(c); setTimeout(() => a.classList.remove(c), c === 'blk' ? 600 : 1400);
    });
  }
  setTimeout(fidget, 1400 + Math.random() * 1400);
})();
let seenVer = null, seenAt = Date.now();
const idleFor = () => { if (st && st.version !== seenVer) { seenVer = st.version; seenAt = Date.now(); } return Date.now() - seenAt; };
// nothing has changed for a while (everyone is thinking): ease off so the radio can sleep; any change snaps back to full speed
const pollDelay = () => { if (rtLive && !document.hidden && !connFails) return st && st.allReady ? 2500 : st && st.phase === 'dealt' ? 8000 : 15000; const base = document.hidden ? 15000 : connFails ? Math.min(30000, 2000 * 2 ** Math.min(connFails - 1, 4)) : document.querySelector('.chat-ov') ? 1000 : st && st.phase === 'lobby' ? 3000 : st && st.allReady ? 1000 : st && st.phase === 'dealt' ? 1800 : 1200; const idle = idleFor(); return document.hidden || connFails || st && st.allReady || document.querySelector('.chat-ov') ? base : idle > 60000 ? Math.max(base, 3500) : idle > 20000 ? Math.max(base, 2000) : base; };
// low battery or Data Saver: quietly switch the decorative animations off
try { const sv = () => document.body.classList.toggle('autocalm', !!(navigator.connection && navigator.connection.saveData)); sv(); if (navigator.getBattery) navigator.getBattery().then((b) => { const f = () => document.body.classList.toggle('autocalm', (!b.charging && b.level <= 0.2) || !!(navigator.connection && navigator.connection.saveData)); f(); b.addEventListener('levelchange', f); b.addEventListener('chargingchange', f); }); } catch (e) {}
// push channel: the server announces each new room version, so the polling below only has to be a slow safety net while it is connected
let rtES = null, rtLive = false, rtFor = '', rtRetry = null, rtRenew = null, rtWant = 0, rtBusy = false;
// fetch right now, skipping the server's short read cache, and ask again if what came back is older than what was announced
async function rtFetch(n) {
  if (rtBusy) return; rtBusy = true; clearTimeout(timer);
  try { await poll(false, true); } finally { rtBusy = false; }
  if (session && st && st.version < rtWant && n < 6) return void setTimeout(() => rtFetch(n + 1), 250 + n * 150);
  if (session) startPolling();
}
function rtClose() { clearTimeout(rtRetry); clearTimeout(rtRenew); rtWant = 0; rtFor = ''; if (rtES) { rtES.close(); rtES = null; } rtLive = false; }
async function rtOpen() {
  if (!session || document.hidden || !window.EventSource || (rtES && rtFor === session.code)) return;
  rtClose();
  const code = session.code;
  try {
    const j = await api('rt', session);
    if (!j.rt || !session || session.code !== code || rtES) return;
    rtFor = code;
    const es = rtES = new EventSource(j.rt.url);
    es.onopen = () => { if (rtES === es) rtLive = true; };
    rtRenew = setTimeout(() => { if (rtES === es) { rtClose(); rtOpen(); } }, Math.max(30, Number(j.rt.ttl || 7200) - 60) * 1000);
    es.onmessage = (e) => {
      if (rtES !== es) return;
      if (!session) return rtClose();
      let v = 0, d = null; try { const m = JSON.parse(e.data); d = typeof m.data === 'string' && m.data[0] === '{' ? JSON.parse(m.data) : m.data; v = Number(d && typeof d === 'object' ? d.v : d) || 0; } catch {}
      if (d && typeof d === 'object' && st) {   // gifts and reactions ride along with the announcement, so they play straight away
        if (d.g) handleGifts({ gifts: d.g, giftN: Math.max(...d.g.map((x) => x.n)), meId: st.meId });
        if (d.e) handleEmotes({ emotes: d.e, emoteN: Math.max(...d.e.map((x) => x.n)), meId: st.meId });
      }
      rtWant = Math.max(rtWant, v); rtFetch(0);
    };
    es.onerror = () => { if (rtES !== es) return; rtLive = false; if (es.readyState === 2) { rtClose(); rtRetry = setTimeout(rtOpen, 15000); } };
  } catch { rtRetry = setTimeout(rtOpen, 30000); }
}
let pollGeneration = 0;
function startPolling() {
  clearTimeout(timer);
  rtOpen();
  const generation = ++pollGeneration;
  const tick = async () => { await poll(); if (session && generation === pollGeneration) timer = setTimeout(tick, pollDelay()); };
  timer = setTimeout(tick, pollDelay());
}
// coming back to the app (unlocking the phone, switching back from WhatsApp) catches up straight away
document.addEventListener('visibilitychange', () => { if (document.hidden) rtClose(); else if (session) { resync(); rtOpen(); } });

