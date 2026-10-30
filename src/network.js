// Bounded requests keep a stalled fetch from freezing the action queue.
const REQUEST_TIMEOUT_MS = 10000;
async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || 'Server error'), { status: response.status });
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Connection timed out. Please retry.');
    throw error;
  } finally { clearTimeout(timeout); }
}
function newRequestId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
}
async function api(action, extra = {}) {
  const t0 = Date.now(), owner = session;
  const body = { action, round: st?.round || 0, ...(session || {}), cn: chatHave, ...extra };
  // These requests either do not mutate the room, or have no seat yet to deduplicate against.
  const retryable = action === 'join' && !!body.recoveryCode || !['create', 'join', 'leave', 'emote', 'rt', 'predStart'].includes(action);
  if (retryable || action === 'join') body.requestId = newRequestId();
  body.requestId = window.RoomIntent?.id('reckoning', body, body.requestId) || body.requestId;
  const payload = JSON.stringify(body);
  for (let attempt = 0; ; attempt++) {
    try {
      if (owner && session !== owner) throw Object.assign(new Error('Session changed'), { status: 409 });
      const data = await fetchJson('/api/game', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload,
      });
      if (owner && session !== owner) throw Object.assign(new Error('Session changed'), { status: 409 });
      window.RoomIntent?.done('reckoning', action);
      noteClock(data.now, t0, Date.now());
      return data;
    } catch (error) {
      if (!retryable || attempt >= 2 || (error.status && error.status !== 503)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
}
