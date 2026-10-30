// The unpredictable client request ID is the capability for retrying an initial join.
// Only its digest is retained in the room; names alone never restore a seat.
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function token(scope, body) {
  return crypto.createHmac('sha256', body.requestId).update('initial-join:' + scope + ':' + body.code.toUpperCase()).digest('base64url');
}
function replay(scope, room, body, name, people = room.players) {
  if (!body.requestId || body.recoveryCode) return null;
  const key = hash(body.requestId), p = people.find(p => p.admission?.key === key);
  if (!p) return null;
  const tok = token(scope, body), digest = p.tokenHash || p.tkh;
  if (p.admission.name !== name || p.kicked || p.departed || digest !== hash(tok)) throw Object.assign(Error('This join has expired. Use your rejoin code.'), { status: 409 });
  return { p, tok };
}
function remember(scope, p, body, name) {
  if (!body.requestId) return null;
  p.admission = { key: hash(body.requestId), name };
  return token(scope, body);
}
module.exports = { replay, remember };
