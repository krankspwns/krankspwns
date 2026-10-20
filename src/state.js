const ROWS = [1, 1, 2, 3];
const POLL_MS = 1500;
const app = document.getElementById('app');
let session = load();   // {code, pid}
// invite links always use the public address: a per-deploy Vercel link (opened from the dashboard or a notification) asks friends to log in to Vercel
const PUBLIC_HOST = 'krankspwns.vercel.app';
const shareOrigin = () => (location.hostname.endsWith('.vercel.app') && location.hostname !== PUBLIC_HOST ? 'https://' + PUBLIC_HOST : location.origin);
// Opened via an invite link (?room=CODE): if we were in a different room, leave it and offer to join the new one instead.
const invitedCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
let inviteCode = '', leftOld = false;
if (invitedCode) {
  if (!(session && session.code === invitedCode)) {
    inviteCode = invitedCode;
    if (session) {
      const old = session; session = null; leftOld = true;
      try { fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'leave', code: old.code, pid: old.pid, tok: old.tok }), keepalive: true }); } catch {}
      try { localStorage.removeItem('sct'); } catch {}
    }
  }
  try { history.replaceState(null, '', location.pathname); } catch {}   // so a reload doesn't repeat this
}
let st = null;          // latest server view
let err = '';
let timer = null;
let lastKey = '';
let fx = {};                 // 'playerId:slot' -> 'pop' | 'flip' (one render only)
let newSeats = new Set();    // players who just joined (one render only)
let screenAnim = false;      // entrance animation for a newly shown screen
let dealAnim = false;        // cards fly in after a deal
const NAME_MAX = 12;   // same limit as the server
let formName = Array.from(localStorage.getItem('sct-name') || '').slice(0, NAME_MAX).join(''), formCode = inviteCode;
const BANNER_SECONDS = 8;
let confettiAt = 0;
let formRecovery = '';

// ambient floating suits
(() => {
  const bg = document.getElementById('bg');
  for (let i = 0; i < 16; i++) {
    const sp = document.createElement('span');
    sp.textContent = '♠♥♦♣'[i % 4];
    sp.style.left = (i * 6.4 + Math.random() * 4) + '%';
    sp.style.fontSize = (28 + Math.random() * 56) + 'px';
    sp.style.animationDuration = (26 + Math.random() * 30) + 's';
    sp.style.animationDelay = (-Math.random() * 50) + 's';
    bg.append(sp);
  }
})();

function load() { for (const store of [() => localStorage, () => sessionStorage]) { try { const v = JSON.parse(store().getItem('sct') || 'null'); if (v && v.tok) return v; if (v) store().removeItem('sct'); } catch {} } return null; }   // a seat saved before tokens existed is dropped
function save() { for (const store of [() => localStorage, () => sessionStorage]) { try { session ? store().setItem('sct', JSON.stringify(session)) : store().removeItem('sct'); } catch {} } }

// every phone works out how far its clock is from the server's, so countdowns and row changes happen at the same moment for everyone
let clockSkew = 0, clockRtt = Infinity, clockAt = 0;
function noteClock(serverNow, t0, t1) {
  if (!serverNow) return;
  const rtt = t1 - t0;
  if (rtt <= clockRtt * 1.25 || t1 - clockAt > 45000) { clockSkew = serverNow - (t0 + t1) / 2; clockRtt = rtt; clockAt = t1; }
}
const serverNow = () => Date.now() + clockSkew;

