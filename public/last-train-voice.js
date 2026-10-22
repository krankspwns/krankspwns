/* Opt-in, turn-limited voice messages. Audio bytes are fetched only for playback. */
(() => {
  'use strict';
  window.createTrainVoice = api => {
    let state, owner, roomKey = '', operation = 0, recorder, stream, chunks = [], session, recording = false, pending = false, uploading = false, sharing = false, finalizing = false;
    let started = 0, recorded = 0, status = '', retryClip, playback = new Set();
    const players = new Map();
    const pane = document.createElement('section'); pane.className = 'voice-recorder'; pane.setAttribute('aria-label', 'Record a voice message');
    const title = document.createElement('b'); title.textContent = 'Record your message';
    const hint = document.createElement('p'); hint.className = 'voice-hint'; hint.textContent = 'Record during your turn. Everyone can listen after it ends.';
    const actions = document.createElement('div'); actions.className = 'voice-actions';
    const record = document.createElement('button'); record.type = 'button'; record.className = 'voice-record';
    record.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="2" width="8" height="13" rx="4" fill="currentColor"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span>Record voice</span>';
    const stop = document.createElement('button'); stop.type = 'button'; stop.className = 'gold'; stop.textContent = 'Stop & share';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'text-button'; cancel.textContent = 'Discard';
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'secondary'; retry.textContent = 'Retry sharing';
    const meter = document.createElement('span'); meter.className = 'voice-time';
    const feedback = document.createElement('p'); feedback.className = 'voice-feedback'; feedback.setAttribute('role', 'status');
    actions.append(record, stop, cancel, retry, meter); pane.append(title, hint, actions, feedback);
    const supported = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
    const ownTurn = () => state?.phase === 'discussion' && state.speakerId === state.meId && state.me.alive;
    const hasShared = () => state?.speeches.some(m => m.round === state.round && m.id === state.meId);
    const elapsed = () => recorded + (recording && recorder?.state === 'recording' ? performance.now() - started : 0);
    const release = () => { stream?.getTracks().forEach(track => track.stop()); stream = null; };
    const duck = () => api.onAudio(recording || pending || playback.size > 0);
    function update() {
      const active = recording || pending;
      record.hidden = active || uploading || finalizing || !!retryClip;
      record.disabled = !supported() || !ownTurn() || state.paused || hasShared();
      stop.hidden = !recording; stop.disabled = state?.paused;
      cancel.hidden = !active; retry.hidden = !retryClip || uploading;
      retry.disabled = state?.paused;
      meter.hidden = !recording; meter.textContent = (state?.paused ? 'Paused · ' : '● ') + Math.min(20, Math.floor(elapsed() / 1000)) + 's / 20s';
      pane.classList.toggle('is-recording', recording);
      feedback.textContent = !supported() ? 'Voice recording is not supported here. You can still type or speak aloud.' : status;
      duck();
    }
    function changed() { update(); api.onChange(); }
    async function upload(clip) {
      finalizing = false; uploading = true; retryClip = null; status = 'Sharing your recording…'; changed();
      try {
        const result = await api.request('speakVoice', { voiceId: clip.id, audioData: clip.data, mimeType: clip.mimeType, durationMs: clip.durationMs }, clip.owner, clip.state);
        if (clip.roomKey === roomKey) { status = 'Voice shared. Everyone can listen after your turn.'; api.onState(result, clip.owner); }
      } catch (e) {
        if (clip.roomKey === roomKey) { retryClip = clip; status = e.status && e.status < 500 ? e.message : 'The upload did not finish. Retry sharing while this turn is still recent.'; }
      } finally { uploading = false; changed(); }
    }
    function stopRecording(share) {
      if (!recorder || recorder.state === 'inactive') return;
      recorded = elapsed(); sharing = share; finalizing = share; recorder.stop(); recording = false; release();
      status = share ? 'Preparing your recording…' : 'Recording discarded.'; changed();
    }
    async function start() {
      if (!ownTurn() || state.paused || hasShared() || pending || recording || uploading || finalizing || recorder) return;
      const op = ++operation, snapshot = { ...state }, seat = { ...owner }; pending = true; status = 'Allow microphone access to record.'; playback.forEach(audio => audio.pause()); changed();
      let media;
      try {
        media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        if (op !== operation || !ownTurn() || state.paused || state.round !== snapshot.round) { media.getTracks().forEach(t => t.stop()); return; }
        stream = media;
        const result = await api.request('beginVoice', {}, seat, snapshot);
        if (op !== operation || !ownTurn() || state.paused || result.speakerId !== seat.pid) { media.getTracks().forEach(t => t.stop()); if (stream === media) stream = null; return; }
        const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t));
        if (!mimeType) throw Error('This browser cannot record a supported audio format. You can still type or speak aloud.');
        session = { owner: seat, state: snapshot, roomKey, id: result.me.voiceDraft.id };
        chunks = []; recorded = 0; sharing = false;
        recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 24000 });
        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        recorder.onerror = () => { stopRecording(false); status = 'The microphone stopped. You can still type or speak aloud.'; changed(); };
        recorder.onstop = async () => {
          const send = sharing, capture = session, durationMs = Math.min(20000, Math.round(recorded)), blob = new Blob(chunks, { type: recorder.mimeType });
          release(); recording = false; recorder = null; chunks = []; duck();
          if (!send || capture.roomKey !== roomKey) { finalizing = false; changed(); return; }
          if (blob.size > 256 * 1024 || durationMs < 100 || !blob.size) { finalizing = false; status = 'No usable recording was captured. Try again or type your message.'; changed(); return; }
          const reader = new FileReader();
          reader.onload = () => { if (capture.roomKey === roomKey) upload({ ...capture, mimeType: blob.type, durationMs, data: reader.result.split(',')[1] }); };
          reader.onerror = () => { finalizing = false; status = 'The recording could not be read. Please try again.'; changed(); };
          reader.readAsDataURL(blob);
        };
        started = performance.now(); recording = true; recorder.start(250); status = 'Recording. It will share automatically when your time ends.';
        api.onState(result, seat);
      } catch (e) {
        media?.getTracks().forEach(t => t.stop()); if (stream === media) stream = null;
        if (op === operation) status = e.name === 'NotAllowedError' ? 'Microphone access was denied. You can still type or speak aloud.' : e.message || 'The microphone is unavailable. You can still type or speak aloud.';
      } finally { if (op === operation) { pending = false; changed(); } }
    }
    record.onclick = start; stop.onclick = () => stopRecording(true);
    cancel.onclick = () => { operation++; pending = false; if (recording) stopRecording(false); else release(); status = 'Recording discarded.'; changed(); };
    retry.onclick = () => { if (retryClip) upload(retryClip); };
    function player(message) {
      const id = message.audio.id;
      let entry = players.get(id);
      if (!entry) {
        const box = document.createElement('div'); box.className = 'voice-message';
        const button = document.createElement('button'); button.type = 'button'; button.className = 'voice-play';
        const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none'; audio.hidden = true; audio.setAttribute('aria-label', 'Recording by ' + (state.players.find(p => p.id === message.id)?.name || 'a traveller'));
        const info = document.createElement('span'); info.className = 'voice-play-status'; info.setAttribute('role', 'status');
        box.append(button, audio, info); entry = { box, button, audio, info, url: null, loading: false }; players.set(id, entry);
        button.onclick = async () => {
          if (recording || pending || entry.loading) return;
          entry.loading = true; button.disabled = true; info.textContent = 'Loading recording…';
          const expected = roomKey, seat = { ...owner };
          try {
            const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
            let response; try { response = await fetch('/api/last-train?code=' + seat.code + '&pid=' + seat.pid + '&voice=' + encodeURIComponent(id), { headers: { 'x-tok': seat.tok }, signal: controller.signal }); } finally { clearTimeout(timeout); }
            const clip = await response.json(); if (!response.ok) throw Error(clip.error || 'Recording unavailable.');
            if (expected !== roomKey) return;
            const bytes = Uint8Array.from(atob(clip.data), c => c.charCodeAt(0));
            entry.url = URL.createObjectURL(new Blob([bytes], { type: clip.mimeType })); audio.src = entry.url; audio.hidden = false; button.hidden = true; info.textContent = '';
            try { await audio.play(); } catch { info.textContent = 'Tap play to listen.'; }
          } catch (e) { if (expected === roomKey) info.textContent = e.name === 'AbortError' ? 'Loading took too long. Tap to retry.' : e.message; }
          finally { entry.loading = false; button.disabled = false; }
        };
        audio.onplay = () => { if (recording || pending) return audio.pause(); for (const other of playback) if (other !== audio) other.pause(); playback.add(audio); duck(); };
        audio.onpause = audio.onended = () => { playback.delete(audio); duck(); };
        audio.onerror = () => { playback.delete(audio); info.textContent = 'This recording cannot be played on this browser.'; duck(); };
      }
      entry.button.disabled = !message.audio.available || recording || pending || entry.loading;
      entry.button.textContent = message.audio.available ? '▶ Play voice · ' + Math.ceil(message.audio.durationMs / 1000) + 's' : 'Voice ready after their turn';
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
        if (!['gathering','morning','discussion','voting','voteResult','finished'].includes(state?.phase)) playback.forEach(audio => audio.pause());
        if (retryClip && retryClip.state.round !== state?.round) { retryClip = null; status = ''; }
        if (newRound && !recording && !pending && !uploading) { retryClip = null; status = ''; }
        if (recording) {
          if (!seat || !state || hasShared()) stopRecording(false);
          else if (!ownTurn()) stopRecording(true);
          else {
            if (state.paused && recorder.state === 'recording') { recorded = elapsed(); recorder.pause(); }
            else if (!state.paused && recorder.state === 'paused') { started = performance.now(); recorder.resume(); }
            const remaining = state.remainingMs - (state.paused ? 0 : Date.now() - state.receivedAt);
            if (!state.paused && (elapsed() >= 19500 || remaining <= 500)) stopRecording(true);
          }
        }
        update();
      }
    };
  };
})();
