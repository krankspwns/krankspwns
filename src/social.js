// ---- quick reactions: little drawn faces that float up for everyone ----
const FACE = '<circle cx="24" cy="24" r="21" fill="#ffd23f" stroke="#e0a51a" stroke-width="2"/>';
const EMOTE_ART = {
  laugh: FACE + '<path d="M13 21q4-5 8 0M27 21q4-5 8 0" fill="none" stroke="#5a3b0a" stroke-width="2.6" stroke-linecap="round"/><path d="M12 28h24q-1 11-12 11T12 28z" fill="#7a2a1a"/><path d="M16 35q8 4 16 0" fill="#ff8a8a"/>',
  wow: FACE + '<circle cx="17" cy="20" r="4.2" fill="#fff"/><circle cx="31" cy="20" r="4.2" fill="#fff"/><circle cx="17" cy="20.5" r="2" fill="#3a2a10"/><circle cx="31" cy="20.5" r="2" fill="#3a2a10"/><path d="M11 11q5-4 10-1M27 10q5-3 10 1" fill="none" stroke="#5a3b0a" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="24" cy="34" rx="4.5" ry="5.5" fill="#7a2a1a"/>',
  cry: FACE + '<path d="M13 20q4 3 8 0M27 20q4 3 8 0" fill="none" stroke="#5a3b0a" stroke-width="2.6" stroke-linecap="round"/><path d="M16 36q8-7 16 0" fill="none" stroke="#5a3b0a" stroke-width="2.6" stroke-linecap="round"/><path d="M15 24c-3 5-3 8 0 8s3-3 0-8zM33 24c3 5 3 8 0 8s-3-3 0-8z" fill="#5ec8ff"/>',
  cool: FACE + '<path d="M8 19h32v3q0 8-7 8t-6-6h-4q1 6-6 6t-9-8z" fill="#1d2233"/><path d="M13 22l5-2" stroke="#7fb2ff" stroke-width="1.6" stroke-linecap="round"/><path d="M16 35q8 6 16 0" fill="none" stroke="#5a3b0a" stroke-width="2.6" stroke-linecap="round"/>',
  fire: '<path d="M24 4c3 8 12 11 12 23a12 12 0 01-24 0c0-5 3-8 5-11 1 3 2 4 4 4 0-7-1-11 3-16z" fill="#ff7a1a"/><path d="M24 22c2 5 7 6 7 12a7 7 0 01-14 0c0-4 3-6 4-9 1 2 2 3 3 3z" fill="#ffd23f"/>',
  gg: '<defs><linearGradient id="ebgg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#84e6ad"/><stop offset=".55" stop-color="#4fdc8a"/><stop offset="1" stop-color="#3eac6c"/></linearGradient></defs><rect x="3.0" y="11.0" width="42.0" height="30.0" rx="10.0" fill="#000" opacity=".28"/><rect x="3.0" y="9.0" width="42.0" height="30.0" rx="10.0" fill="url(#ebgg)"/><rect x="3.6" y="9.6" width="40.8" height="28.8" rx="9.4" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/><rect x="6.0" y="11.0" width="36.0" height="11.4" rx="7.0" fill="#fff" opacity=".24"/><text x="24" y="31" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="900" font-size="19" fill="#06361b">GG</text>',
  ez: '<defs><linearGradient id="ebez" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a38dff"/><stop offset=".55" stop-color="#7c5cff"/><stop offset="1" stop-color="#6148c7"/></linearGradient></defs><rect x="3.0" y="11.0" width="42.0" height="30.0" rx="10.0" fill="#000" opacity=".28"/><rect x="3.0" y="9.0" width="42.0" height="30.0" rx="10.0" fill="url(#ebez)"/><rect x="3.6" y="9.6" width="40.8" height="28.8" rx="9.4" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/><rect x="6.0" y="11.0" width="36.0" height="11.4" rx="7.0" fill="#fff" opacity=".24"/><text x="24" y="31" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="900" font-size="19" fill="#fff">EZ</text>',
  gl: '<defs><linearGradient id="ebgl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffca7e"/><stop offset=".55" stop-color="#ffb347"/><stop offset="1" stop-color="#c78c37"/></linearGradient></defs><rect x="3.0" y="11.0" width="42.0" height="30.0" rx="10.0" fill="#000" opacity=".28"/><rect x="3.0" y="9.0" width="42.0" height="30.0" rx="10.0" fill="url(#ebgl)"/><rect x="3.6" y="9.6" width="40.8" height="28.8" rx="9.4" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/><rect x="6.0" y="11.0" width="36.0" height="11.4" rx="7.0" fill="#fff" opacity=".24"/><text x="24" y="31" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="900" font-size="19" fill="#3a2105">GL</text>',
  wp: '<defs><linearGradient id="ebwp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#80c2ff"/><stop offset=".55" stop-color="#4aa8ff"/><stop offset="1" stop-color="#3a83c7"/></linearGradient></defs><rect x="3.0" y="11.0" width="42.0" height="30.0" rx="10.0" fill="#000" opacity=".28"/><rect x="3.0" y="9.0" width="42.0" height="30.0" rx="10.0" fill="url(#ebwp)"/><rect x="3.6" y="9.6" width="40.8" height="28.8" rx="9.4" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/><rect x="6.0" y="11.0" width="36.0" height="11.4" rx="7.0" fill="#fff" opacity=".24"/><text x="24" y="31" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="900" font-size="19" fill="#06223f">WP</text>',
  faster: '<defs><linearGradient id="ebfaster" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffad77"/><stop offset=".55" stop-color="#ff8a3d"/><stop offset="1" stop-color="#c76c30"/></linearGradient></defs><rect x="2.0" y="9.0" width="44.0" height="34.0" rx="11.0" fill="#000" opacity=".28"/><rect x="2.0" y="7.0" width="44.0" height="34.0" rx="11.0" fill="url(#ebfaster)"/><rect x="2.6" y="7.6" width="42.8" height="32.8" rx="10.4" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/><rect x="5.0" y="9.0" width="38.0" height="12.9" rx="8.0" fill="#fff" opacity=".24"/><text x="24" y="23" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="900" font-size="11" fill="#3a1503" textLength="35" lengthAdjust="spacingAndGlyphs">FASTER</text><text x="24" y="36" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="900" font-size="11" fill="#3a1503" textLength="22" lengthAdjust="spacingAndGlyphs">LEH</text>',
  aiyo: '<defs><linearGradient id="ebaiyo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c897ff"/><stop offset=".55" stop-color="#b06bff"/><stop offset="1" stop-color="#8953c7"/></linearGradient></defs><rect x="2.0" y="11.0" width="44.0" height="30.0" rx="10.0" fill="#000" opacity=".28"/><rect x="2.0" y="9.0" width="44.0" height="30.0" rx="10.0" fill="url(#ebaiyo)"/><rect x="2.6" y="9.6" width="42.8" height="28.8" rx="9.4" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/><rect x="5.0" y="11.0" width="38.0" height="11.4" rx="7.0" fill="#fff" opacity=".24"/><text x="24" y="29" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="900" font-size="14" fill="#fff" textLength="34" lengthAdjust="spacingAndGlyphs">AIYO!</text>',
  steady: '<defs><linearGradient id="ebsteady" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6dd6cc"/><stop offset=".55" stop-color="#2ec4b6"/><stop offset="1" stop-color="#24998e"/></linearGradient></defs><rect x="2.0" y="11.0" width="44.0" height="30.0" rx="10.0" fill="#000" opacity=".28"/><rect x="2.0" y="9.0" width="44.0" height="30.0" rx="10.0" fill="url(#ebsteady)"/><rect x="2.6" y="9.6" width="42.8" height="28.8" rx="9.4" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/><rect x="5.0" y="11.0" width="38.0" height="11.4" rx="7.0" fill="#fff" opacity=".24"/><text x="24" y="29" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="900" font-size="12" fill="#052b27" textLength="35" lengthAdjust="spacingAndGlyphs">STEADY</text>',
  oof: '<defs><linearGradient id="eboof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff97ae"/><stop offset=".55" stop-color="#ff6b8b"/><stop offset="1" stop-color="#c7536c"/></linearGradient></defs><rect x="3.0" y="11.0" width="42.0" height="30.0" rx="10.0" fill="#000" opacity=".28"/><rect x="3.0" y="9.0" width="42.0" height="30.0" rx="10.0" fill="url(#eboof)"/><rect x="3.6" y="9.6" width="40.8" height="28.8" rx="9.4" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/><rect x="6.0" y="11.0" width="36.0" height="11.4" rx="7.0" fill="#fff" opacity=".24"/><text x="24" y="31" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="900" font-size="17" fill="#3d0716">OOF</text>',
  rip: '<path d="M24 4c-9 0-16 6-16 15 0 5 2.5 8 5.5 10v7h21v-7c3-2 5.5-5 5.5-10 0-9-7-15-16-15z" fill="#f2f4f8" stroke="#aeb6c6" stroke-width="1.5"/><ellipse cx="17" cy="21" rx="4.4" ry="5" fill="#1d2233"/><ellipse cx="31" cy="21" rx="4.4" ry="5" fill="#1d2233"/><path d="M24 26l-2.4 4.6h4.8z" fill="#1d2233"/><path d="M18 36v5M24 36v5M30 36v5" stroke="#aeb6c6" stroke-width="1.6"/>',
  angry: '<circle cx="24" cy="24" r="21" fill="#ff6b5e" stroke="#c43a2d" stroke-width="2"/><path d="M10 14l11 5M38 14l-11 5" stroke="#4a0f0a" stroke-width="3" stroke-linecap="round"/><circle cx="16.5" cy="23" r="3" fill="#2a0a06"/><circle cx="31.5" cy="23" r="3" fill="#2a0a06"/><path d="M15 37q9-8 18 0" fill="none" stroke="#4a0f0a" stroke-width="3" stroke-linecap="round"/>',
  think: FACE + '<path d="M12 17q4-3 8-1M28 15q4-2 8 1" fill="none" stroke="#5a3b0a" stroke-width="2.4" stroke-linecap="round"/><circle cx="17" cy="23" r="2.4" fill="#3a2a10"/><circle cx="31" cy="23" r="2.4" fill="#3a2a10"/><path d="M18 35h12" stroke="#5a3b0a" stroke-width="2.6" stroke-linecap="round"/><text x="37" y="12" font-family="Inter,system-ui,sans-serif" font-weight="900" font-size="14" fill="#fff">?</text>',
  heart: '<path d="M24 41C10 31 5 23 5 15.5 5 10 9 6 14.5 6 19 6 22 8.5 24 12c2-3.500 5-6 9.500-6C39 6 43 10 43 15.500 43 23 38 31 24 41z" fill="#ff5c7a" stroke="#c42f50" stroke-width="2"/><path d="M13 14q2-4 6-3" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>',
  trophy: '<path d="M14 6h20v12a10 10 0 01-20 0z" fill="#ffcf40" stroke="#c28a10" stroke-width="1.6"/><path d="M14 10H7q0 9 8 11M34 10h7q0 9-8 11" fill="none" stroke="#c28a10" stroke-width="2.4" stroke-linecap="round"/><path d="M24 28v7M16 41h16M18 35h12v6H18z" fill="#ffcf40" stroke="#c28a10" stroke-width="1.6" stroke-linejoin="round"/><path d="M19 10v8" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6"/>',
};
const EMOTE_KEYS = Object.keys(EMOTE_ART);
function emoteEl(key, size = 34) {
  const w = el('span', { class: 'emo' });
  w.style.width = w.style.height = size + 'px';
  w.innerHTML = uniqSvg(`<svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">${EMOTE_ART[key] || ''}</svg>`);
  return w;
}
// a few reactions are spoken in a Singlish voice (the phone's own speech engine; the closest accent it has)
const VOICE_EMOTES = {
  gg: { text: 'Good game!', pitch: 1.05, rate: 1.05 },
  ez: { text: 'Eeeasy!', pitch: 1.0, rate: 0.85 },
  gl: { text: 'Good luck!', pitch: 1.05, rate: 1.05 },
  wp: { text: 'Well played!', pitch: 1.05, rate: 1.0 },
  faster: { text: 'Faster leh!', pitch: 1.12, rate: 1.18 },
  aiyo: { text: 'Aiyoh!', pitch: 1.25, rate: 0.95 },
  steady: { text: 'Steady lah!', pitch: 0.95, rate: 1.0 },
  oof: { text: 'Oof!', pitch: 0.65, rate: 1.1 },
};
const ACCENT_PREF = ['en-sg', 'en-my', 'en-in', 'en-gb', 'en-au', 'en-za', 'en-ie', 'en-us'];
function pickVoice(voices) {
  const norm = (v) => (v.lang || '').toLowerCase().replace('_', '-');
  const named = voices.find((v) => /singapore/i.test(v.name));
  if (named) return named;
  for (const code of ACCENT_PREF) { const v = voices.find((x) => norm(x) === code); if (v) return v; }
  return voices.find((v) => norm(v).startsWith('en')) || null;
}
let voiceList = [];
try { if (window.speechSynthesis) { const load = () => { voiceList = speechSynthesis.getVoices() || []; }; load(); speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', load); } } catch {}
function speakEmote(key) {
  const v = VOICE_EMOTES[key];
  if (!v || !ui.voice || SND.mode === 0 || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;
  try {
    if (!voiceList.length) voiceList = speechSynthesis.getVoices() || [];
    if (!voiceList.length) return false;   // no voices on this phone: the synthesised sound plays instead
    const u = new SpeechSynthesisUtterance(v.text);
    const voice = pickVoice(voiceList);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-SG';
    u.pitch = v.pitch; u.rate = v.rate; u.volume = 1;
    speechSynthesis.cancel();   // never a queue of old reactions
    speechSynthesis.speak(u);
    return true;
  } catch { return false; }
}
const CLIP_EMOTES = new Set(['gg', 'ez', 'gl', 'wp', 'faster', 'aiyo', 'steady', 'oof']);
// voice clip first; if it can't play, the phone's own voice; if that can't either, the synthesised sound
const playEmoteSound = (k) => {
  if (CLIP_EMOTES.has(k) && ui.voice) { SND.clip(k).then((ok) => { if (!ok && !speakEmote(k)) SND.play('emo_' + k); }); return; }
  if (!speakEmote(k)) SND.play('emo_' + k);
};
let emoLane = Math.floor(Math.random() * 5), emoteSeen = null, emoteLast = 0, emoteTrayOpen = false;
function sendEmote(k) {
  if (Date.now() - emoteLast < 900) return;
  emoteLast = Date.now();
  floatEmote(st && st.meId, k);
  playEmoteSound(k);
  api('emote', { e: k }).catch(() => {});
  emoteTrayOpen = false; syncEmoteUi();
}
function floatEmote(pid, key) {
  if (document.hidden) return;
  const pl = st && st.players.find((q) => q.id === pid);
  // any free lane across the whole width, picked at random (never just the first few from the left)
  const busy = new Set([...document.querySelectorAll('.emofloat')].map((x) => +x.style.getPropertyValue('--lane')));
  const free = [0, 1, 2, 3, 4].filter((l) => !busy.has(l));
  const pool = free.length ? free : [0, 1, 2, 3, 4];
  const lane = pool[Math.floor(Math.random() * pool.length)];
  const b = el('div', { class: 'emofloat' }, pl ? avatarEl(pl.avatar, 34, '', pl.acc, pl.bd) : '', pl ? el('small', {}, pl.name) : '', emoteEl(key, 42));
  b.style.setProperty('--lane', lane);
  document.body.append(b);
  setTimeout(() => b.remove(), 2800);
}
// reactions other players sent since we last looked
function handleEmotes(j) {
  const list = j.emotes || [];
  if (emoteSeen === null) { emoteSeen = j.emoteN || 0; return; }   // first look at this room: don't replay old ones
  for (const x of list) if (x.n > emoteSeen && x.id !== j.meId && serverNow() - x.at < 6000) { floatEmote(x.id, x.e); playEmoteSound(x.e); }
  emoteSeen = Math.max(emoteSeen, j.emoteN || 0);
}
function syncEmoteUi() {
  let fab = document.getElementById('emoteFab');
  const show = !!(session && st);
  document.body.classList.toggle('hasfab', show);
  { if (show && st.wallet) wpTo(st.wallet.pts); const sh = document.getElementById('shopBtn'); if (sh) { sh.hidden = !show; if (show && st.wallet) { let b = sh.querySelector('.shopwp'); if (!b) { b = el('b', { class: 'shopwp' }); sh.append(b); } const n = st.wallet.pts; if (!b.dataset.wpnum) odoBuild(b, 'badge', wpDisp === null ? n : wpDisp); sh.classList.add('haswp'); sh.title = sh.ariaLabel = t('shopTitle') + ' · ' + t('wpN', { n }); } } }
  syncGiftUi();
  if (!show) { fab?.remove(); document.getElementById('chatFab')?.remove(); document.getElementById('emoteTray')?.remove(); document.querySelector('.chatpop')?.remove(); return; }
  if (!fab) {
    fab = el('button', { id: 'emoteFab', type: 'button', class: 'emotefab', 'aria-label': t('emoteTitle'), title: t('emoteTitle'), onclick: (e) => { e.stopPropagation(); emoteTrayOpen = !emoteTrayOpen; syncEmoteUi(); } }, emoteEl('laugh', 30));
    document.body.append(fab);
  }
  let cfab = document.getElementById('chatFab');
  const wantChat = chatOn();
  if (wantChat && !cfab) {
    cfab = el('button', { id: 'chatFab', type: 'button', class: 'emotefab chatfab', 'aria-label': t('chatTitle'), title: t('chatTitle'), onclick: (e) => { e.stopPropagation(); openChat(); } }, colorIcon(CHAT_ICON, 30), el('i', { class: 'cbadge' }));
    document.body.append(cfab);
  } else if (!wantChat && cfab) { cfab.remove(); cfab = null; document.querySelector('.chat-ov')?.remove(); }
  if (cfab) { const n = chatUnread(), bd = cfab.querySelector('.cbadge'); bd.textContent = n > 9 ? '9+' : String(n); bd.style.display = n ? 'grid' : 'none'; }
  let tray = document.getElementById('emoteTray');
  if (emoteTrayOpen && !tray) {
    if (ui.voice) CLIP_EMOTES.forEach((k) => { try { fetch('/audio/' + k + '.mp3').catch(() => {}); } catch {} });   // warm the cache
    tray = el('div', { id: 'emoteTray', class: 'emotetray', role: 'menu', onclick: (e) => e.stopPropagation() }, ...EMOTE_KEYS.map((k) => el('button', { type: 'button', role: 'menuitem', 'aria-label': k, onclick: () => sendEmote(k) }, emoteEl(k, 36))));
    document.body.append(tray);
  } else if (!emoteTrayOpen && tray) tray.remove();
}
document.addEventListener('click', (e) => { if (emoteTrayOpen && !(e.target.closest && e.target.closest('#emoteTray, #emoteFab'))) { emoteTrayOpen = false; syncEmoteUi(); } });


// ---- chat: a text room for the table (messages arrive with the normal updates) ----
let chatLog = [], chatHave = undefined, chatSeen = 0, chatPopT = null;
const chatOn = () => !!(st && st.settings && st.settings.chat !== false);
function handleChat(j, prev) {
  if (j.chatR) { const mine = chatR; chatR = { ...j.chatR }; const now = Date.now(); for (const n of Object.keys(chatRHold)) { if (chatRHold[n] < now) delete chatRHold[n]; else if (mine[n]) chatR[n] = mine[n]; else delete chatR[n]; } }
  if (!prev || prev.code !== j.code || chatHave === undefined) { chatLog = []; chatHave = undefined; chatSeen = j.chatN || 0; }
  const fresh = (j.chat || []).filter((m) => !chatLog.some((x) => x.n === m.n));
  if (fresh.length) {
    chatLog = [...chatLog, ...fresh].sort((a, b) => a.n - b.n).slice(-100);
    const open = !!document.querySelector('.chat-ov');
    if (chatHave !== undefined) {   // not the history we got when joining
      const incoming = fresh.filter((m) => m.id !== j.meId && !m.sys);
      if (open) chatSeen = j.chatN || 0;
      else if (incoming.length) { chatPop(incoming[incoming.length - 1]); SND.play('pop'); }
    }
  }
  chatHave = Math.max(chatHave === undefined ? 0 : chatHave, j.chatN || 0, ...chatLog.map((m) => m.n));
  if (document.querySelector('.chat-ov')) renderChat(true);
  syncEmoteUi();   // the unread badge follows chat even when nothing else on screen is rebuilt
}
function chatUnread() { return st ? chatLog.filter((m) => !m.sys && m.id !== st.meId && m.n > chatSeen).length : 0; }
function chatPop(m) {
  document.querySelector('.chatpop')?.remove(); clearTimeout(chatPopT);
  const b = el('button', { type: 'button', class: 'chatpop', onclick: openChat }, avatarEl(m.avatar, 26, '', m.acc, m.bd), el('span', {}, el('b', {}, m.name), ' ', chatSticker(m) ? emoteEl(chatSticker(m), 26) : m.text));
  document.body.append(b);
  chatPopT = setTimeout(() => b.remove(), 4200);
}
function openChat() {
  if (document.querySelector('.chat-ov') || !chatOn()) return;
  document.querySelector('.chatpop')?.remove();
  const close = () => { ov.remove(); chatSeen = st ? st.chatN || 0 : chatSeen; if (!document.querySelector('.guide-ov')) document.body.classList.remove('noscroll'); syncEmoteUi(); };
  const ov = el('div', { class: 'guide-ov chat-ov', onclick: (e) => { if (e.target === ov) close(); } });
  ov.close = close;
  document.body.append(ov); document.body.classList.add('noscroll');
  chatSeen = st ? st.chatN || 0 : 0;
  chatNodes = new Map();
  chatLog.forEach((m) => chatShown.add(m.n));   // what is already there appears at once; only new arrivals pop in
  renderChat(false);
  syncEmoteUi();
  setTimeout(() => document.querySelector('.chat-in input')?.focus(), 120);
}
function sendChat(text) {
  text = (text || '').trim();
  if (!text || !st) return;
  const me = st.players.find((q) => q.id === st.meId);
  // show it straight away; the server's copy replaces it on the next update
  const tmp = { n: -Date.now(), id: st.meId, name: me ? me.name : '', avatar: me ? me.avatar : 'cat', acc: me ? me.acc : '', bd: me ? me.bd : '', text: text.slice(0, 140), pending: true };
  chatLog = [...chatLog, tmp];
  renderChat(true);
  api('chat', { text }).then((j) => { chatLog = chatLog.filter((m) => m !== tmp); if (j) { const keep = j.chat || []; chatLog = [...chatLog, ...keep.filter((m) => !chatLog.some((x) => x.n === m.n))].sort((a, b) => a.n - b.n); chatHave = Math.max(chatHave || 0, j.chatN || 0); chatSeen = j.chatN || 0; } renderChat(true); }).catch((e) => { chatLog = chatLog.filter((m) => m !== tmp); err = e.message; renderChat(true); toast(tErr(e.message), 'low'); });
}
// each player gets their own colour in the chat, so a busy table is easy to follow
const CHAT_HUES = [350, 24, 46, 140, 172, 202, 262, 312];
const chatHue = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return CHAT_HUES[h % CHAT_HUES.length]; };
const STICKER_RE = /^\[s:(\w+)\]$/, BIGEMO_RE = /^(?:\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*\s*){1,3}$/u;
const chatSticker = (m) => { const x = STICKER_RE.exec(m.text); return x && EMOTE_ART[x[1]] ? x[1] : null; };
let chatTray = false, chatShown = new Set(), chatPendText = new Set(), chatR = {}, chatPick = null, chatRHold = {};
const REACT_EMO = { heart: '❤️', laugh: '😂', up: '👍', fire: '🔥', wow: '😮' };
function sendReact(n, k) {
  const cur = { ...(chatR[n] || {}) };
  let had = null;
  for (const e of Object.keys(cur)) { const ids = cur[e].filter((x) => x !== st.meId); if (cur[e].length !== ids.length) had = e; if (ids.length) cur[e] = ids; else delete cur[e]; }
  if (had !== k) cur[k] = [...(cur[k] || []), st.meId];
  chatR = { ...chatR }; if (Object.keys(cur).length) chatR[n] = cur; else delete chatR[n];
  chatPick = null; chatRHold[n] = Date.now() + 3000; renderChat(true);   // for a moment, an older update from the server must not undo what you just tapped
  api('creact', { n, e: k }).then((j) => { if (j && j.chatR) { delete chatRHold[n]; chatR = j.chatR; renderChat(true); } }).catch(() => { delete chatRHold[n]; });
}
// a short line about what happened at the table
function chatSysLine(m, fresh) {
  const ic = m.k === 'gift' ? giftEl(m.item, 16) : m.k === 'lose' ? icon('x', 12) : m.k === 'tie' ? icon('tick', 12) : '';
  const txt = m.k === 'gift' ? (m.tn === '*' ? t('chatSysGiftAll', { from: m.fn, item: t('gift_' + m.item) }) : t('chatSysGift', { from: m.fn, to: m.tn, item: t('gift_' + m.item) }))
    : m.k === 'lose' ? t('chatSysLose', { names: (m.names || []).join(', '), n: m.row + 1, pen: m.pen })
    : m.k === 'tie' ? t('chatSysTie', { n: m.row + 1 })
    : m.k === 'called' ? [(m.names || []).length ? t('chatSysCalled', { names: m.names.join(', '), wp: m.wp }) : '', (m.miss || []).length ? t('chatSysMissed', { names: m.miss.join(', '), pen: m.pen }) : ''].filter(Boolean).join(' · ')
    : m.k === 'rename' ? t('chatSysRename', { from: m.fn, to: m.tn })
    : m.k === 'join' ? t('chatSysJoin', { name: m.fn }) : t('chatSysLeave', { name: m.fn });
  return el('div', { class: 'csys ' + m.k + (fresh ? ' new' : '') }, ic, el('span', {}, txt));
}
function chatAgo(m) {
  if (!m.at || m.pending) return '';
  const sec = Math.max(0, (serverNow() - m.at) / 1000);
  return sec < 45 ? t('chatNow') : sec < 3600 ? Math.round(sec / 60) + 'm' : Math.round(sec / 3600) + 'h';
}
// the chat window is built once; an update only touches the messages that changed, so a tap never flashes, re-plays animations or drops the keyboard
let chatNodes = new Map();
function chatFresh(m, mine) {   // true the first time a message is drawn, for its one-off pop-in
  if (m.pending) { chatPendText.add(m.text); return true; }
  let f = !chatShown.has(m.n);
  if (f && mine && chatPendText.delete(m.text)) f = false;   // your own message already popped in while it was sending
  chatShown.add(m.n);
  return f;
}
function chatMsgEl(m, i, fresh) {
  const mine = m.id === (st && st.meId), stk = chatSticker(m), big = !stk && BIGEMO_RE.test(m.text);
  const prev = chatLog[i - 1];
  const same = i && !prev.sys && prev.id === m.id && !stk && !chatSticker(prev);   // a run from one person only shows the name once
  const pick = () => { if (m.pending) return; chatPick = chatPick === m.n ? null : m.n; renderChat(true); };
  const head = el('div', { class: 'chead' }, el('b', {}, m.name + (mine ? t('you') : '')), el('em', {}, chatAgo(m)));
  const body = stk
    ? el('div', { class: 'cstk', onclick: (e) => { const n = e.currentTarget; n.classList.remove('again'); void n.offsetWidth; n.classList.add('again'); pick(); } }, emoteEl(stk, 76))
    : big ? el('div', { class: 'cbigemo', onclick: pick }, m.text)
    : el('div', { class: 'cbub', onclick: pick }, el('span', {}, m.text));
  return el('div', { class: 'cmsg' + (mine ? ' mine' : '') + (m.pending ? ' pending' : '') + (fresh ? ' new' : '') + (stk ? ' sticker' : '') + (same ? ' same' : ''), style: `--h:${chatHue(m.id)}` },
    same ? el('span', { class: 'cgap' }) : avatarEl(m.avatar, 34, '', m.acc, m.bd),
    el('div', { class: 'ccol' }, same ? '' : head, body, el('div', { class: 'cx' }, ...chatExtras(m))));
}
// the reaction bar and the chips under a message: swapped in place, so the message itself never redraws
function chatExtras(m) {
  const rs = chatR[m.n] || {}, myR = Object.keys(rs).find((k) => rs[k].includes(st.meId));
  const chips = Object.keys(rs).length ? el('div', { class: 'rchips' }, ...Object.keys(rs).map((k) => el('button', { type: 'button', class: 'rchip' + (rs[k].includes(st.meId) ? ' on' : ''), onclick: () => sendReact(m.n, k) }, REACT_EMO[k], el('i', {}, String(rs[k].length))))) : '';
  const picker = chatPick === m.n && !m.pending ? el('div', { class: 'rpick' }, ...Object.keys(REACT_EMO).map((k) => el('button', { type: 'button', class: k === myR ? 'on' : '', onclick: () => sendReact(m.n, k) }, REACT_EMO[k]))) : '';
  return [picker, chips];
}
function chatShell(ov) {
  const input = el('input', { type: 'text', maxLength: 140, placeholder: t('chatPh'), enterKeyHint: 'send', 'aria-label': t('chatPh'), onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = input.value; input.value = ''; sendChat(v); } } });
  const quick = ['chatQ1', 'chatQ2', 'chatQ3', 'chatQ4'].map((k) => el('button', { type: 'button', class: 'ghost qchip', onclick: () => sendChat(t(k)) }, t(k)));
  const box = el('div', { class: 'guide chatbox', role: 'dialog', 'aria-modal': 'true' },
    el('div', { class: 'ghead' }, el('div', { class: 'gtitle' }, el('b', { class: 'colorful' }, colorIcon(CHAT_ICON, 22)), t('chatTitle')), el('button', { class: 'ghost gx', 'aria-label': t('gClose'), onclick: ov.close }, icon('x', 16))),
    el('div', { class: 'chatwho' }),
    el('div', { class: 'chatlist' }),
    el('div', { class: 'qrow' }, ...quick),
    el('div', { class: 'chat-in' },
      el('button', { type: 'button', class: 'stkbtn', 'aria-label': t('chatStickers'), title: t('chatStickers'), onclick: () => { chatTray = !chatTray; renderChat(true); } }, emoteEl('laugh', 30)),
      input, el('button', { type: 'button', class: 'sendbtn', 'aria-label': t('chatSend'), onclick: () => { const v = input.value; input.value = ''; sendChat(v); input.focus(); } }, colorIcon(SEND_ICON, 26))));
  box.addEventListener('pointerdown', (e) => { if (e.target.closest('button, .cbub, .cstk, .cbigemo')) e.preventDefault(); });   // tapping never pulls focus off the text box, so the keyboard stays put
  ov.replaceChildren(box);
  return box;
}
function renderChat(keepScroll) {
  const ov = document.querySelector('.chat-ov'); if (!ov) return;
  let box = ov.querySelector('.chatbox');
  if (!box) { chatNodes = new Map(); box = chatShell(ov); }
  const list = box.querySelector('.chatlist');
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60, top = list.scrollTop;
  // who is here
  const who = box.querySelector('.chatwho'), here = (st ? st.players : []).slice(0, 7);
  const whoSig = here.map((q) => q.avatar + q.acc + q.bd).join('|') + (st ? st.players.length : 0);
  if (who.dataset.sig !== whoSig) {
    who.dataset.sig = whoSig; who.hidden = !here.length;
    who.replaceChildren(el('span', { class: 'cw-av' }, ...here.map((q) => avatarEl(q.avatar, 24, '', q.acc, q.bd))), el('small', {}, t('chatHere', { n: st ? st.players.length : 0 })));
  }
  // messages: keep what is unchanged, rebuild only what is different
  const keep = new Set(); let pos = 0;
  const place = (node) => { const ref = list.children[pos]; if (ref !== node) list.insertBefore(node, ref || null); pos++; };
  chatLog.forEach((m, i) => {
    const key = m.n; keep.add(key);
    const xs = (chatR[m.n] ? JSON.stringify(chatR[m.n]) : '') + (chatPick === m.n ? '|pick' : '');
    const sig = [m.text, m.pending ? 1 : 0, chatAgo(m), i && chatLog[i - 1].id === m.id && !chatLog[i - 1].sys ? 1 : 0, m.sys ? '' : st.meId].join('\u0001');
    let c = chatNodes.get(key);
    if (c && c.sig === sig && c.xs !== xs && !m.sys) { c.node.querySelector('.cx').replaceChildren(...chatExtras(m)); c.xs = xs; }
    if (!c || c.sig !== sig) {
      const fresh = !c && (m.sys ? !chatShown.has(m.n) : chatFresh(m, m.id === st.meId));
      if (m.sys) chatShown.add(m.n);
      const node = m.sys ? chatSysLine(m, fresh) : chatMsgEl(m, i, fresh);
      if (c) c.node.replaceWith(node);
      c = { sig, xs, node }; chatNodes.set(key, c);
    }
    place(c.node);
  });
  for (const [k, c] of [...chatNodes]) if (!keep.has(k)) { c.node.remove(); chatNodes.delete(k); }
  let empty = list.querySelector('.chatempty');
  if (!chatLog.length) {
    if (!empty) list.append(el('div', { class: 'chatempty' }, el('div', { class: 'ce-stk' }, ...['laugh', 'clap', 'fire'].filter((k) => EMOTE_ART[k]).map((k, n) => el('span', { style: `animation-delay:${n * .25}s` }, emoteEl(k, 48)))), el('p', {}, t('chatEmpty'))));
  } else if (empty) empty.remove();
  // sticker tray
  let tray = box.querySelector('.stktray');
  box.querySelector('.stkbtn').classList.toggle('on', chatTray);
  if (chatTray && !tray) list.after(el('div', { class: 'stktray' }, ...EMOTE_KEYS.map((k) => el('button', { type: 'button', 'aria-label': k, onclick: () => { chatTray = false; sendChat('[s:' + k + ']'); } }, emoteEl(k, 40)))));
  else if (!chatTray && tray) tray.remove();
  if (!keepScroll || atBottom) list.scrollTop = list.scrollHeight; else list.scrollTop = top;
}

