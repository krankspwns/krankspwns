// Account endpoint: sign-in with Google or Apple, session, profile, shop and the PDPA rights (export and delete).
const P = require('../lib/platform');
const C = require('../lib/catalog');
const { need } = P;

function sameOrigin(req) {
  const origin = req.headers?.origin; if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
const clearCookie = (req) => P.cookie(req, '', 0);

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    need(['GET', 'POST'].includes(req.method), 405, 'Method not allowed.');
    const uid = await P.identify(req);
    if (req.method === 'GET') {
      const account = uid ? await P.getUser(uid) : null;
      if (uid && !account) res.setHeader('Set-Cookie', clearCookie(req));
      return res.status(200).json({ config: P.config(), catalog: { av: C.PREMIUM, bd: C.BORDER_PRICE, acc: C.ACC_PRICE, gift: C.GIFTS, uses: C.GIFT_USES, avatars: C.AVATARS }, dailyCap: P.DAILY_EARN_CAP, account: account ? P.publicAccount(account) : null });
    }
    // state changes need our own header (a cross-site form cannot send it) and a same-site origin
    need(req.headers?.['x-kp'] === '1' && sameOrigin(req), 403, 'Request blocked.');
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const ip = String(req.headers?.['x-forwarded-for'] || 'local').split(',')[0].trim();
    const action = body.action;
    if (action === 'nonce') return res.status(200).json({ nonce: await P.issueNonce(ip) });
    if (action === 'login') {
      const out = await P.login(req, body);
      res.setHeader('Set-Cookie', P.cookie(req, out.tok, 30 * 86400));
      return res.status(200).json({ account: out.account, created: out.created });
    }
    if (action === 'logout') { await P.endSession(req); res.setHeader('Set-Cookie', clearCookie(req)); return res.status(200).json({ ok: true }); }
    need(uid, 401, 'Please sign in.');
    const idem = typeof body.requestId === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId) ? body.requestId : null;
    let user;
    if (action === 'buy') { need(idem, 400, 'Please refresh and try again.'); user = await P.buy(uid, body.kind, String(body.key || ''), idem); }
    else if (action === 'equip') { user = await P.equip(uid, body.kind, body.key, idem); }
    else if (action === 'nick') { user = await P.setNick(uid, body.nick); }
    else if (action === 'logoutAll') { await P.signOutEverywhere(uid); res.setHeader('Set-Cookie', clearCookie(req)); return res.status(200).json({ ok: true }); }
    else if (action === 'export') { res.setHeader('Content-Disposition', 'attachment; filename="krankspwns-my-data.json"'); return res.status(200).json(await P.exportData(uid)); }
    else if (action === 'delete') {
      need(body.confirm === 'DELETE', 400, 'Type DELETE to confirm.');
      await P.deleteAccount(uid); res.setHeader('Set-Cookie', clearCookie(req)); return res.status(200).json({ ok: true });
    } else need(false, 400, 'Unknown action.');
    return res.status(200).json({ account: P.publicAccount(user || await P.getUser(uid)) });
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : error.status || 500;
    if (status === 500) console.error(error.message);
    res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : error.message, needConsent: error.needConsent || undefined });
  }
}
module.exports = handler;



