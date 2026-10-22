/* Opt-in, turn-limited voice messages. Audio bytes are fetched only for playback. */
(() => {
  'use strict';
  window.createTrainVoice = api => {
    let state, owner, roomKey = '', operation = 0, recorder, stream, chunks = [], session, recording = false, pending = false, uploading = false, sharing = false, finalizing = false;
    let started = 0, recorded = 0, running = false, stopTimer, status = '', retryClip, playback = new Set();
    const MAX_BYTES = 512 * 1024, PLAYBACK_PHASES = ['settling','night','gathering','morning','discussion','voting','revoteInfo','voteResult','finished'];
    const players = new Map();
    const pane = document.createElement('section'); pane.className = 'voice-recorder'; pane.setAttribute('aria-label', 'Record a voice message');
    const MIC = '<svg fill="none" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="2.5" width="8" height="12.5" rx="4" fill="#ff5c7a" stroke="#c42f50" stroke-width="1"/><rect x="9.6" y="4" width="2" height="5" rx="1" fill="#fff" opacity=".45"/><path d="M5 10.5v1.5a7 7 0 0 0 14 0v-1.5" fill="none" stroke="#ffd66b" stroke-width="1.9" stroke-linecap="round"/><path d="M12 19v2.5M8.5 21.5h7" stroke="#ffd66b" stroke-width="1.9" stroke-linecap="round"/></svg>';
    // Idle: one big card. Recording: a live panel with a timer, moving bars, Stop & Share and Discard.
    const record = document.createElement('button'); record.type = 'button'; record.className = 'speak-choice record-choice';
    record.setAttribute('aria-label', 'Record Voice'); record.innerHTML = '<span class="choice-icon">' + MIC + '</span><span class="choice-copy"><b>Record Voice</b><small>Up to 20 seconds</small></span>';
    const live = document.createElement('div'); live.className = 'voice-live';
    const liveHead = document.createElement('div'); liveHead.className = 'voice-live-head';
    const meter = document.createElement('span'); meter.className = 'voice-time';
    liveHead.innerHTML = '<span class="rec-dot" aria-hidden="true"></span><b>Recording</b>'; liveHead.append(meter);
    const bars = document.createElement('div'); bars.className = 'voice-live-bars'; bars.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 24; i++) { const bar = document.createElement('i'); bar.style.setProperty('--d', (i * 53 % 17) / 17 + 's'); bars.append(bar); }
    const progress = document.createElement('div'); progress.className = 'voice-progress'; progress.innerHTML = '<i></i>';
    const stop = document.createElement('button'); stop.type = 'button'; stop.className = 'gold'; stop.textContent = 'Stop & Share';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'text-button'; cancel.textContent = 'Discard';
    const liveActions = document.createElement('div'); liveActions.className = 'voice-actions'; liveActions.append(stop, cancel);
    live.append(liveHead, bars, progress, liveActions);
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'secondary'; retry.textContent = 'Retry Sharing';
    const feedback = document.createElement('p'); feedback.className = 'voice-feedback'; feedback.setAttribute('role', 'status');
    pane.append(record, live, retry, feedback);
    const supported = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
    const ownTurn = () => state?.phase === 'discussion' && state.speakerId === state.meId && state.me.alive;
    const hasShared = () => state?.speeches.some(m => m.round === state.round && m.id === state.meId);
    const elapsed = () => recorded + (running ? performance.now() - started : 0);
    const published = clip => !!state?.speeches.some(m => m.audio?.id === clip.id);
    const release = () => { stream?.getTracks().forEach(track => track.stop()); stream = null; };
    const duck = () => api.onAudio(recording || pending || playback.size > 0);
    function update() {
      const active = recording || pending;
      record.hidden = active || uploading || finalizing || !!retryClip;
      record.disabled = !supported() || !ownTurn() || state.paused || hasShared();
      live.hidden = !active; stop.hidden = !recording; stop.disabled = state?.paused;
      cancel.hidden = !active; retry.hidden = !retryClip || uploading;
      retry.disabled = state?.paused;
      const secs = Math.min(20, Math.floor(elapsed() / 1000));
      meter.textContent = state?.paused ? 'Paused' : '0:' + String(secs).padStart(2, '0') + ' / 0:20';
      progress.firstChild.style.width = Math.min(100, elapsed() / 200) + '%';
      liveHead.querySelector('b').textContent = recording ? 'Recording' : 'Starting the microphone…';
      pane.classList.toggle('is-recording', recording); pane.classList.toggle('is-busy', active || uploading || finalizing || !!retryClip);
      feedback.textContent = !supported() ? 'Voice recording is not supported here. You can still type or speak aloud.' : status;
      duck();
    }
    function changed() { update(); api.onChange(); }
    async function upload(clip) {
      finalizing = false; uploading = true; retryClip = null; status = 'Sharing your recording…'; changed();
      try {
        // One stable request ID per clip makes every retry idempotent, even when an earlier reply was lost.
        for (let attempt = 0; ; attempt++) {
          try {
            const result = await api.request('speakVoice', { voiceId: clip.id, audioData: clip.data, mimeType: clip.mimeType, durationMs: clip.durationMs, requestId: clip.requestId }, clip.owner, clip.state, { timeout: 25000 });
            if (clip.roomKey === roomKey) { status = 'Voice shared. The next player has the floor.'; api.onState(result, clip.owner); }
            return;
          } catch (e) {
            if ((e.status && e.status < 500) || attempt >= 2 || clip.roomKey !== roomKey) throw e;
            await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
          }
        }
      } catch (e) {
        if (clip.roomKey !== roomKey) return;
        if (published(clip)) { status = 'Voice shared. The next player has the floor.'; return; }
        retryClip = clip; status = e.status && e.status < 500 ? e.message : 'The upload did not finish. Retry sharing while this turn is still recent.';
      } finally { uploading = false; changed(); }
    }
    function finish(rec) {
      if (rec.finished) return;
      rec.finished = true; clearTimeout(stopTimer);
      const send = sharing, capture = session, durationMs = Math.min(20000, Math.round(recorded));
      // Some browsers report an empty recorder type; fall back to the requested container.
      const blob = new Blob(chunks, { type: rec.mimeType || rec.requestedType });
      release(); recording = false; running = false; sharing = false; if (recorder === rec) recorder = null; chunks = []; duck();
      if (!send || !capture || capture.roomKey !== roomKey) { finalizing = false; changed(); return; }
      if (!blob.size || durationMs < 100) { finalizing = false; status = 'No usable recording was captured. Try again or type your message.'; changed(); return; }
      if (blob.size > MAX_BYTES) { finalizing = false; status = 'That recording is too large to share. Try a shorter message or type it.'; changed(); return; }
      const reader = new FileReader();
      reader.onload = () => {
        if (capture.roomKey !== roomKey) { finalizing = false; changed(); return; }
        upload({ ...capture, requestId: crypto.randomUUID(), mimeType: blob.type, durationMs, data: String(reader.result).split(',')[1] || '' });
      };
      reader.onerror = () => { finalizing = false; status = 'The recording could not be read. Please try again.'; changed(); };
      reader.readAsDataURL(blob);
    }
    function stopRecording(share) {
      if (!recorder || recorder.state === 'inactive') return;
      const rec = recorder;
      recorded = elapsed(); running = false; sharing = share; finalizing = share; recording = false;
      // Keep the microphone open until the recorder flushes its final chunk; Safari can drop it otherwise.
      try { rec.stop(); } catch { finish(rec); }
      if (!share) release();
      clearTimeout(stopTimer); stopTimer = setTimeout(() => finish(rec), 3000);
      status = share ? 'Preparing your recording…' : 'Recording discarded.'; changed();
    }
    // isTypeSupported() can claim a format the encoder then rejects (Chrome: AAC in MP4 → EncodingError).
    // Start each candidate briefly and fall through to the next one if it fails before producing audio.
    const failedTypes = new Set();
    async function openRecorder(media) {
      const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].filter(t => !failedTypes.has(t) && MediaRecorder.isTypeSupported(t));
      for (const mimeType of types) {
        let rec;
        try { rec = new MediaRecorder(media, { mimeType, audioBitsPerSecond: 32000 }); } catch { failedTypes.add(mimeType); continue; }
        rec.requestedType = mimeType.split(';')[0];
        const ok = await new Promise(resolve => {
          const timer = setTimeout(() => resolve(rec.state === 'recording'), 700);
          rec.onerror = () => { clearTimeout(timer); resolve(false); };
          rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); clearTimeout(timer); resolve(rec.state === 'recording'); };
          try { rec.start(250); rec.startedAt = performance.now(); } catch { clearTimeout(timer); resolve(false); }
        });
        if (ok) return rec;
        failedTypes.add(mimeType); chunks = [];
        rec.ondataavailable = rec.onerror = null; try { if (rec.state !== 'inactive') rec.stop(); } catch {}
        if (media.getAudioTracks().every(t => t.readyState === 'ended')) break;
      }
      throw Error('This browser cannot record a supported audio format. You can still type or speak aloud.');
    }
    async function micPermission() {
      try { return (await navigator.permissions?.query({ name: 'microphone' }))?.state || 'prompt'; } catch { return 'prompt'; }
    }
    async function start() {
      if (!ownTurn() || state.paused || hasShared() || pending || recording || uploading || finalizing || recorder) return;
      const op = ++operation, snapshot = { ...state }, seat = { ...owner }; pending = true; playback.forEach(audio => audio.pause());
      // Only ask people to allow the microphone when the browser is actually going to ask.
      const permission = await micPermission();
      status = permission === 'denied' ? 'The microphone is blocked for this site. Allow it in your browser’s site settings, then tap Record Voice again.' : permission === 'granted' ? '' : 'Allow microphone access to record.'; changed();
      let media;
      try {
        media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        if (op !== operation || !ownTurn() || state.paused || state.round !== snapshot.round) { media.getTracks().forEach(t => t.stop()); return; }
        stream = media;
        const result = await api.request('beginVoice', {}, seat, snapshot);
        if (op !== operation || !ownTurn() || state.paused || result.speakerId !== seat.pid) { media.getTracks().forEach(t => t.stop()); if (stream === media) stream = null; return; }
        session = { owner: seat, state: snapshot, roomKey, id: result.me.voiceDraft.id };
        chunks = []; recorded = 0; sharing = false;
        const rec = await openRecorder(media);
        if (op !== operation || !ownTurn() || state.paused) { rec.ondataavailable = rec.onerror = null; try { rec.stop(); } catch {} media.getTracks().forEach(t => t.stop()); if (stream === media) stream = null; chunks = []; return; }
        recorder = rec;
        rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
        rec.onerror = () => { stopRecording(false); status = 'The microphone stopped. You can still type or speak aloud.'; changed(); };
        rec.onstop = () => {
          // The microphone can end on its own (a call, another app, an unplugged headset). Share what was captured.
          if (recording && recorder === rec) { recorded = elapsed(); running = false; recording = false; sharing = true; finalizing = true; status = 'The microphone stopped early. Sharing what was recorded…'; }
          finish(rec);
        };
        started = rec.startedAt; running = true; recording = true; status = 'Recording. It will share automatically when your time ends.';
        api.onState(result, seat);
      } catch (e) {
        if (recorder && !recording && !recorder.finished) recorder = null;
        media?.getTracks().forEach(t => t.stop()); if (stream === media) stream = null;
        if (op === operation) status = e.name === 'NotAllowedError' ? 'Microphone access is off for this site. Allow it in your browser’s site settings to record, or type instead.' : e.message || 'The microphone is unavailable. You can still type or speak aloud.';
      } finally { if (op === operation) { pending = false; changed(); } }
    }
    record.onclick = start; stop.onclick = () => stopRecording(true);
    cancel.onclick = () => { operation++; pending = false; if (recording) stopRecording(false); else release(); status = 'Recording discarded.'; changed(); };
    retry.onclick = () => { if (retryClip) upload(retryClip); };
    // A custom player: round play button, a waveform that fills as it plays, and the time.
    const ICONS = {
      play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.2v11.6a1.1 1.1 0 0 0 1.7.93l9.1-5.8a1.1 1.1 0 0 0 0-1.86l-9.1-5.8A1.1 1.1 0 0 0 9 6.2z" fill="currentColor"/></svg>',
      pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6" width="3.6" height="12" rx="1.4" fill="currentColor"/><rect x="13.4" y="6" width="3.6" height="12" rx="1.4" fill="currentColor"/></svg>',
      lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 10.5V8.3a3.5 3.5 0 0 1 7 0v2.2" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/><rect x="6" y="10.5" width="12" height="9" rx="2.4" fill="currentColor"/></svg>',
      load: '<svg viewBox="0 0 24 24" aria-hidden="true" class="spin"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="2.4"/><path d="M12 4.5a7.5 7.5 0 0 1 7.5 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    };
    const clock = sec => Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
    function player(message) {
      const id = message.audio.id, total = Math.max(1, Math.ceil(message.audio.durationMs / 1000));
      let entry = players.get(id);
      if (!entry) {
        const box = document.createElement('div'); box.className = 'voice-message';
        const button = document.createElement('button'); button.type = 'button'; button.className = 'voice-play';
        const wave = document.createElement('div'); wave.className = 'voice-wave'; wave.setAttribute('aria-hidden', 'true');
        // The bar heights come from the clip ID, so every phone draws the same shape.
        let seed = [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
        for (let i = 0; i < 30; i++) { seed = (seed * 1103515245 + 12345) >>> 0; const bar = document.createElement('i'); bar.style.height = (22 + (seed % 78) * (i % 6 === 0 ? .6 : 1)) + '%'; wave.append(bar); }
        const time = document.createElement('span'); time.className = 'voice-dur';
        const audio = document.createElement('audio'); audio.preload = 'none'; audio.hidden = true; audio.setAttribute('aria-label', 'Recording by ' + (state.players.find(p => p.id === message.id)?.name || 'a traveller'));
        const info = document.createElement('span'); info.className = 'voice-play-status'; info.setAttribute('role', 'status');
        box.append(button, wave, time, audio, info); entry = { box, button, wave, time, audio, info, url: null, loading: false }; players.set(id, entry);
        const paint = () => {
          const done = audio.duration && isFinite(audio.duration) ? audio.currentTime / audio.duration : 0;
          button.style.setProperty('--ring', (done * 360).toFixed(1) + 'deg');
          const lit = Math.round(done * wave.children.length); [...wave.children].forEach((bar, i) => bar.classList.toggle('on', i < lit));
          time.textContent = audio.paused && !audio.currentTime ? clock(total) : clock(audio.currentTime) + ' / ' + clock(total);
          const playing = !audio.paused && !audio.ended;
          box.classList.toggle('playing', playing);
          button.innerHTML = entry.loading ? ICONS.load : !entry.available ? ICONS.lock : playing ? ICONS.pause : ICONS.play;
          button.setAttribute('aria-label', !entry.available ? 'Voice message, ready after their turn' : (playing ? 'Pause' : 'Play') + ' voice message, ' + total + ' seconds');
        };
        entry.paint = paint;
        button.onclick = async () => {
          if (recording || pending || entry.loading) return;
          if (entry.url) { if (audio.paused) audio.play().catch(() => { info.textContent = 'Tap again to listen.'; }); else audio.pause(); return; }
          entry.loading = true; button.disabled = true; info.textContent = ''; paint();
          const expected = roomKey, seat = { ...owner };
          try {
            const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
            let response; try { response = await fetch('/api/last-train?code=' + seat.code + '&pid=' + seat.pid + '&voice=' + encodeURIComponent(id), { headers: { 'x-tok': seat.tok }, signal: controller.signal }); } finally { clearTimeout(timeout); }
            const clip = await response.json(); if (!response.ok) throw Error(clip.error || 'Recording unavailable.');
            if (expected !== roomKey) return;
            const bytes = Uint8Array.from(atob(clip.data), c => c.charCodeAt(0));
            entry.url = URL.createObjectURL(new Blob([bytes], { type: clip.mimeType })); audio.src = entry.url;
            try { await audio.play(); } catch { info.textContent = 'Tap play to listen.'; }
          } catch (e) { if (expected === roomKey) info.textContent = e.name === 'AbortError' ? 'Loading took too long. Tap to retry.' : e.message; }
          finally { entry.loading = false; button.disabled = false; paint(); }
        };
        audio.onplay = () => { if (recording || pending) return audio.pause(); for (const other of playback) if (other !== audio) other.pause(); playback.add(audio); duck(); paint(); };
        audio.ontimeupdate = paint;
        audio.onpause = audio.onended = () => { playback.delete(audio); duck(); if (audio.ended) audio.currentTime = 0; paint(); };
        audio.onerror = () => { playback.delete(audio); info.textContent = 'This recording cannot be played on this browser.'; duck(); paint(); };
      }
      entry.available = message.audio.available;
      entry.button.disabled = !message.audio.available || recording || pending || entry.loading;
      entry.box.classList.toggle('locked', !message.audio.available);
      if (!message.audio.available) entry.info.textContent = 'Ready after their turn';
      else if (entry.info.textContent === 'Ready after their turn') entry.info.textContent = '';
      entry.paint();
      return entry.box;
    }
    function reset() {
      operation++; pending = false; if (recording) stopRecording(false); release();
      for (const p of players.values()) { p.audio.pause(); p.audio.removeAttribute('src'); if (p.url) URL.revokeObjectURL(p.url); }
      players.clear(); playback.clear(); retryClip = null; finalizing = false; status = ''; duck();
    }
    addEventListener('pagehide', reset);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (recording) stopRecording(true); playback.forEach(audio => audio.pause()); } });
    return { controls: () => pane, player, busy: () => recording || pending || uploading || finalizing,
      sync(next, seat) {
        const nextKey = next && seat ? [seat.code, seat.pid, next.match].join(':') : '';
        if (nextKey !== roomKey) { reset(); roomKey = nextKey; }
        const newRound = state && next && state.round !== next.round;
        state = next; owner = seat;
        if (!PLAYBACK_PHASES.includes(state?.phase)) playback.forEach(audio => audio.pause());
        if (retryClip && published(retryClip)) { retryClip = null; status = 'Voice shared. The next player has the floor.'; }
        if (retryClip && retryClip.state.round !== state?.round) { retryClip = null; status = ''; }
        if (newRound && !recording && !pending && !uploading) { retryClip = null; status = ''; }
        if (recording) {
          if (!seat || !state || hasShared()) stopRecording(false);
          else if (!ownTurn()) stopRecording(true);
          else {
            if (state.paused && recorder.state === 'recording') { recorded = elapsed(); running = false; recorder.pause(); }
            else if (!state.paused && recorder.state === 'paused') { started = performance.now(); running = true; recorder.resume(); }
            const remaining = state.remainingMs - (state.paused ? 0 : Date.now() - state.receivedAt);
            if (!state.paused && (elapsed() >= 19500 || remaining <= 500)) stopRecording(true);
          }
        }
        update();
      }
    };
  };
})();
