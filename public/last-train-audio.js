/* Original local score; one audio graph for music and the boarding soundtrack.
   Web Audio follows the browser/OS audio policy. A normal game tap unlocks it. */
(() => {
  'use strict';
  window.createTrainSoundtrack = (onGesture, musicAllowed = () => true) => {
    let context, master, musicGain, source, buffer, loading, current, enabled = false, video, voiceActive = false;
    const routed = new WeakMap();
    const live = () => musicAllowed() && enabled && current && !current.paused && !document.hidden;
    function routeVideo() {
      if (!context || !video || routed.has(video)) return;
      try { const node = context.createMediaElementSource(video); node.connect(master); routed.set(video, node); } catch {}
    }
    function startMusic() {
      if (!context || !buffer || source || !live()) return;
      source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
      source.connect(musicGain); source.start();
    }
    function level() {
      if (!context) return;
      const phase = current?.phase;
      const target = !live() || voiceActive || phase === 'boarding' ? 0 : phase === 'discussion' ? .07 : phase === 'lobby' ? .1 : phase === 'finished' ? .22 : .16;
      musicGain.gain.cancelScheduledValues(context.currentTime);
      musicGain.gain.setTargetAtTime(target, context.currentTime, .45);
      if (live()) { context.resume().then(startMusic).catch(() => {}); }
      else { source?.stop(); source?.disconnect(); source = null; context.suspend().catch(() => {}); }
    }
    function unlock() {
      if (!context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        context = new Audio(); master = context.createGain(); musicGain = context.createGain();
        master.gain.value = 1; musicGain.gain.value = 0;
        musicGain.connect(master); master.connect(context.destination);
      }
      if (enabled && !document.hidden) context.resume().then(startMusic).catch(() => {});
      routeVideo(); level(); onGesture();
    }
    for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, unlock, { passive: true });
    document.addEventListener('visibilitychange', level);
    window.addEventListener('pagehide', () => { source?.stop(); source = null; context?.suspend().catch(() => {}); });
    return { refresh: level, setVoiceActive(active) { if (voiceActive !== active) { voiceActive = active; if (active && musicGain) { musicGain.gain.cancelScheduledValues(context.currentTime); musicGain.gain.setValueAtTime(0, context.currentTime); } level(); } }, sync(state, hasSeat, nextVideo) {
      if (video && video !== nextVideo) routed.get(video)?.disconnect();
      current = state; enabled = hasSeat; video = nextVideo; routeVideo();
      if (enabled && state && !loading) {
        // Decode after a user gesture creates the audio context; failures never block play.
        if (context) loading = fetch('/last-train/night-carriage.mp3').then(r => { if (!r.ok) throw Error('Music unavailable'); return r.arrayBuffer(); }).then(data => context.decodeAudioData(data)).then(decoded => { buffer = decoded; startMusic(); }).catch(() => {});
      }
      level();
    } };
  };
})();
