// Keep the same private admission intent when a join response is lost, including after reload.
(() => {
  const pending = new Map();
  window.RoomIntent = {
    id(game, body, fallback) {
      if (body.action !== 'join' || body.recoveryCode) return fallback;
      const key = 'kp-join:' + game, signature = JSON.stringify([body.code, body.name]);
      let saved = pending.get(key);
      try { saved ||= JSON.parse(sessionStorage.getItem(key) || 'null'); } catch {}
      if (!saved || saved.signature !== signature || Date.now() - saved.at > 43200000) saved = { signature, id: fallback, at: Date.now() };
      pending.set(key, saved);
      try { sessionStorage.setItem(key, JSON.stringify(saved)); } catch {}
      return saved.id;
    },
    done(game, action) {
      if (action !== 'join') return;
      const key = 'kp-join:' + game; pending.delete(key);
      try { sessionStorage.removeItem(key); } catch {}
    },
  };
})();
