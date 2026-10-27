// Accounts for the game room: Google / Apple sign-in, sessions, consent records and the persistent WP wallet.
//
// Privacy by design (Singapore PDPA): we keep only what the games need. No name, email or photo is stored: the provider's
// stable user id is kept only as a keyed hash (HMAC with ACCOUNT_PEPPER), the nickname is whatever the player types, and
// the rest is WP, cosmetics and the consent record. Everything is exportable and deletable by the account holder.
//
// Security: ID tokens are verified against the provider's published keys (signature, issuer, audience, expiry and a
// one-time server nonce). Sessions are random 256-bit tokens kept hashed server-side and sent as HttpOnly,
// SameSite=Strict (+Secure, __Host- prefixed over HTTPS) cookies, with an idle and an absolute expiry.
const crypto = require('node:crypto');
const kv = require('./kv');
const C = require('./catalog');

const CONSENT_VERSION = '2026-10-28';
const SESSION_DAYS = 30, IDLE_DAYS = 14, MAX_SESSIONS = 8;
const DAY = 86400000;
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const need = (ok, status, message, extra) => { if (!ok) throw Object.assign(Error(message), { status }, extra); };
const secure = (req) => !!process.env.VERCEL || String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0] === 'https';
const COOKIE_SECURE = '__Host-kp_session', COOKIE_PLAIN = 'kp_session';

// ---- configuration ----
const pepper = () => {
  if (process.env.ACCOUNT_PEPPER) return process.env.ACCOUNT_PEPPER;
  if (process.env.VERCEL) return null;   // never invent a pepper in production: ids hashed with it could not be found again
  return (globalThis.__accountPepper ||= crypto.randomBytes(32).toString('hex'));
};
const clientIds = () => ({ google: process.env.GOOGLE_CLIENT_ID || '', apple: process.env.APPLE_CLIENT_ID || '' });
function config() {
  const ids = clientIds(), ready = !!pepper();
  return { enabled: ready && !!(ids.google || ids.apple), google: ready ? ids.google : '', apple: ready ? ids.apple : '', consentVersion: CONSENT_VERSION, startWp: C.START_WP };
}
const subHash = (provider, sub) => crypto.createHmac('sha256', pepper() || 'x').update(provider + ':' + sub).digest('hex');

// ---- ID token verification ----
const JWKS_URL = { google: 'https://www.googleapis.com/oauth2/v3/certs', apple: 'https://appleid.apple.com/auth/keys' };
const ISSUERS = { google: ['https://accounts.google.com', 'accounts.google.com'], apple: ['https://appleid.apple.com'] };
async function jwks(provider, force) {
  const cache = (globalThis.__jwks ||= {}), c = cache[provider];
  if (c && !force && Date.now() - c.at < 3600000) return c.keys;
  const response = await fetch(JWKS_URL[provider], { signal: AbortSignal.timeout(4000) });
  need(response.ok, 503, 'Sign-in is unavailable right now. Please try again.');
  const keys = (await response.json()).keys || []; cache[provider] = { at: Date.now(), keys }; return keys;
}
async function verifyIdToken(provider, idToken, nonce) {
  const aud = clientIds()[provider];
  need(aud, 400, 'That sign-in method is not available.');
  const parts = String(idToken || '').split('.');
  need(parts.length === 3 && idToken.length < 6000, 401, 'Sign-in failed. Please try again.');
  let header, claims;
  try { header = JSON.parse(Buffer.from(parts[0], 'base64url')); claims = JSON.parse(Buffer.from(parts[1], 'base64url')); } catch { need(false, 401, 'Sign-in failed. Please try again.'); }
  need(header.alg === 'RS256' && header.kid, 401, 'Sign-in failed. Please try again.');
  let key = (await jwks(provider)).find((k) => k.kid === header.kid);
  if (!key) key = (await jwks(provider, true)).find((k) => k.kid === header.kid);
  need(key, 401, 'Sign-in failed. Please try again.');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), crypto.createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  const now = Math.floor(Date.now() / 1000), audOk = Array.isArray(claims.aud) ? claims.aud.includes(aud) : claims.aud === aud;
  need(ok && ISSUERS[provider].includes(claims.iss) && audOk && claims.exp > now && (!claims.iat || claims.iat <= now + 120) && claims.sub && claims.nonce === nonce, 401, 'Sign-in failed. Please try again.');
  return { sub: String(claims.sub) };
}
// tests replace these two with fakes
const verifiers = { google: (t, n) => verifyIdToken('google', t, n), apple: (t, n) => verifyIdToken('apple', t, n) };

// ---- one-time nonces (replay protection) ----
async function issueNonce(ip) {
  need(await kv.hit('nonce:' + sha(ip), 60) <= 30, 429, 'Too many attempts. Try again in a minute.');
  const nonce = crypto.randomBytes(24).toString('base64url'); await kv.set('nonce:' + sha(nonce), 1, 300); return nonce;
}
const consumeNonce = async (nonce) => need(nonce && await kv.take('nonce:' + sha(nonce)), 401, 'Sign-in expired. Please try again.');

// ---- accounts ----
const userKey = (uid) => 'acct:' + uid;
// everyone has a look from the start: a free animal picked from the account id until they choose one
const eqOf = (u) => ({ ...u.eq, av: u.eq.av || C.AVATARS[parseInt(sha(u.id).slice(0, 6), 16) % C.AVATARS.length] });
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const publicAccount = (u) => ({ id: u.id, nick: u.nick || '', provider: u.provider, pts: u.pts, owned: u.owned, gifts: u.gifts, eq: eqOf(u), consent: u.consent, created: u.created, earnedToday: u.earn && u.earn.day === today() ? u.earn.n : 0 });
const walletOf = (u) => ({ pts: u.pts, owned: u.owned, gifts: u.gifts, eq: eqOf(u) });
const getUser = async (uid) => (uid ? kv.get(userKey(uid)) : null);
async function mutate(uid, idem, fn) {   // change an account once: the same idempotency key never applies twice (retries are safe)
  let result;
  const doc = await kv.update(userKey(uid), (u) => {
    need(u, 404, 'Account not found.');
    if (idem && (u.applied || []).includes(idem)) return undefined;
    const w = { pts: u.pts, owned: u.owned, gifts: u.gifts, eq: u.eq };
    result = fn(w, u); Object.assign(u, w);
    if (idem) u.applied = [...(u.applied || []), idem].slice(-300);
    return u;
  });
  return doc;
}
const credit = (uid, amount, key) => mutate(uid, key, (w) => { w.pts = Math.max(0, w.pts + Math.trunc(amount)); });
// WP earned by playing is capped per day (Singapore time) so that farming with extra accounts or bots is not worth it
const DAILY_EARN_CAP = 400;
const earn = (uid, amount, key) => mutate(uid, key, (w, u) => {
  const day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), e = u.earn && u.earn.day === day ? u.earn : { day, n: 0 };
  const give = Math.max(0, Math.min(Math.trunc(amount), DAILY_EARN_CAP - e.n)); e.n += give; u.earn = e; w.pts += give;
});
const buy = (uid, kind, item, idem) => mutate(uid, idem && 'buy:' + idem, (w) => C.buyInto(w, kind, item));
const equip = (uid, kind, item, idem) => mutate(uid, idem && 'eq:' + idem, (w) => C.equipInto(w, kind, item));
const useGift = (uid, item, idem) => mutate(uid, idem && 'gift:' + idem, (w) => C.useGiftFrom(w, item));
const cleanNick = (n) => Array.from(String(n || '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 12).join('');
const setNick = async (uid, nick) => kv.update(userKey(uid), (u) => { need(u, 404, 'Account not found.'); u.nick = cleanNick(nick); return u; });

// ---- sessions ----
const sessKey = (tok) => 'sess:' + sha(tok);
function readCookie(req) {
  const jar = String(req?.headers?.cookie || '');
  for (const part of jar.split(';')) { const [k, ...v] = part.trim().split('='); if (k === COOKIE_SECURE || k === COOKIE_PLAIN) return v.join('='); }
  return '';
}
function cookie(req, tok, maxAgeSeconds) {
  const s = secure(req);
  return `${s ? COOKIE_SECURE : COOKIE_PLAIN}=${tok}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${s ? '; Secure' : ''}`;
}
async function createSession(user) {
  const tok = crypto.randomBytes(32).toString('base64url'), now = Date.now();
  await kv.set(sessKey(tok), { uid: user.id, at: now, seen: now }, SESSION_DAYS * 86400);
  const dropped = [];
  await kv.update(userKey(user.id), (u) => { u.sessions = [...(u.sessions || []), sha(tok)]; while (u.sessions.length > MAX_SESSIONS) dropped.push(u.sessions.shift()); u.last = now; return u; });
  for (const h of dropped) await kv.del('sess:' + h);
  return tok;
}
// who is calling: the account id, or null for a guest. Never throws, so a game never breaks on a bad cookie.
async function identify(req) {
  const tok = readCookie(req); if (!tok || tok.length > 100) return null;
  try {
    const s = await kv.get(sessKey(tok)); if (!s) return null;
    const now = Date.now();
    if (now - s.at > SESSION_DAYS * DAY || now - s.seen > IDLE_DAYS * DAY) { await kv.del(sessKey(tok)); return null; }
    if (now - s.seen > 3600000) { s.seen = now; await kv.set(sessKey(tok), s, Math.max(60, Math.floor((s.at + SESSION_DAYS * DAY - now) / 1000))); }
    return s.uid;
  } catch { return null; }
}
async function endSession(req) { const tok = readCookie(req); if (tok) await kv.del(sessKey(tok)); }

// ---- sign in / out ----
async function login(req, body) {
  const provider = body.provider; need(['google', 'apple'].includes(provider), 400, 'That sign-in method is not available.');
  need(config().enabled, 503, 'Sign-in is not set up yet.');
  const ip = String(req.headers?.['x-forwarded-for'] || 'local').split(',')[0].trim();
  need(await kv.hit('login:' + sha(ip), 60) <= 20, 429, 'Too many attempts. Try again in a minute.');
  await consumeNonce(body.nonce);
  const { sub } = await verifiers[provider](body.idToken, body.nonce);
  const idxKey = 'idx:' + provider + ':' + subHash(provider, sub);
  let idx = await kv.get(idxKey), user = idx && await getUser(idx.uid), created = false;
  if (!user) {
    const c = body.consent || {};
    need(c.accepted === true && c.age === true && c.version === CONSENT_VERSION, 428, 'Please read and accept the Privacy Notice to create your account.', { needConsent: true });
    const now = Date.now(), id = crypto.randomUUID();
    user = { id, v: 0, provider, ix: idxKey, nick: '', created: now, last: now, consent: { version: CONSENT_VERSION, at: now }, ...C.emptyWallet(C.START_WP), applied: [], sessions: [] };
    need(await kv.cas(idxKey, 0, { uid: id }), 409, 'Please try signing in again.');
    await kv.cas(userKey(id), 0, user); user.v = 1; created = true;
  }
  const tok = await createSession(user);
  return { tok, created, account: publicAccount(await getUser(user.id)) };
}
// everything we hold about the account, in a form the holder can keep (PDPA access request)
async function exportData(uid) {
  const u = await getUser(uid); need(u, 404, 'Account not found.');
  const { ix, sessions, applied, v, ...data } = u;
  return { exportedAt: new Date().toISOString(), note: 'This is everything we hold about your account. We do not store your name, email address or profile photo from Google or Apple.', account: data, activeSessions: (sessions || []).length };
}
// permanently remove the account (PDPA withdrawal of consent / deletion)
async function deleteAccount(uid) {
  const u = await getUser(uid); if (!u) return;
  for (const h of u.sessions || []) await kv.del('sess:' + h);
  await kv.del(u.ix);
  await kv.del(userKey(uid));
}
async function signOutEverywhere(uid) {
  const u = await getUser(uid); if (!u) return;
  for (const h of u.sessions || []) await kv.del('sess:' + h);
  await kv.update(userKey(uid), (x) => { if (!x) return undefined; x.sessions = []; return x; });
}
module.exports = { CONSENT_VERSION, config, verifiers, issueNonce, login, identify, endSession, createSession, cookie, getUser, walletOf, eqOf, publicAccount, credit, earn, DAILY_EARN_CAP, buy, equip, useGift, setNick, exportData, deleteAccount, signOutEverywhere, COOKIE_SECURE, COOKIE_PLAIN, secure, sha, need, subHash };

