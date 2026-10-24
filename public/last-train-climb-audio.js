/* Ghost Climb sound: a short looping tune for each world and the climb's own effects, synthesised live with Web Audio.
   Sound mode follows the game: 0 = off, 1 = effects only, 2 = effects + music. */
(() => {
  'use strict';
  const midi = n => 440 * 2 ** ((n - 69) / 12);
  // Four bars per loop: a chord per bar (MIDI notes), a bass root, and a lead pattern of chord-tone steps per 8th note
  // (an index into the chord, +3 for an octave up, -1 for a rest).
  const SONGS = [
    { bpm: 108, swing: .18, lead: 'keys', chords: [[57, 60, 64, 67], [50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59]], bass: [45, 38, 43, 36],
      steps: [0, 2, 3, -1, 2, 1, 3, 4, 1, 3, -1, 2, 4, 3, 2, -1] }, // Midnight Station: late-night jazz
    { bpm: 124, swing: 0, lead: 'bell', chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], bass: [48, 43, 45, 41],
      steps: [0, 1, 2, 3, 2, 1, 4, 2, 0, 2, 3, 5, 4, 2, 3, -1] }, // Snowline Pass: bright and frosty
    { bpm: 116, swing: .1, lead: 'pluck', chords: [[50, 53, 57], [48, 52, 55], [46, 50, 53], [45, 49, 52]], bass: [38, 36, 34, 33],
      steps: [0, -1, 2, 1, 0, 3, -1, 2, 1, 2, 4, -1, 3, 2, 1, 0] }, // Desert Express: dusty and rolling
    { bpm: 136, swing: 0, lead: 'square', chords: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 51, 54]], bass: [40, 36, 38, 35],
      steps: [0, 0, 2, 0, 3, 0, 2, 1, 0, 0, 2, 0, 4, 3, 2, 1] }, // Furnace Line: driving and hot
  ];
  window.createClimbAudio = ({ mode = 2, song = 0 } = {}) => {
    let ctx = null, out = null, music = null, noiseBuf = null, timer = 0, next = 0, step = 0, stopped = false;
    const S = SONGS[song % SONGS.length], beat = 60 / S.bpm / 2; // one 8th note
    function ensure() {
      if (!mode || stopped) return null;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return null; }
        const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.connect(ctx.destination);
        out = ctx.createGain(); out.gain.value = .9; out.connect(comp);
        music = ctx.createGain(); music.gain.value = 0; music.connect(out);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      return ctx;
    }
    function tone({ f, f2, at = 0, dur = .2, vol = .1, type = 'sine', attack = .005, lp = 0, bus = out, vib = 0 }) {
      const t = Math.max(ctx.currentTime, at || ctx.currentTime), o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vib; lg.gain.value = f * .03; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + .05); }
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      let node = o; if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); node = fl; }
      node.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + .05);
    }
    function hiss({ at = 0, dur = .05, vol = .05, f = 6000, type = 'highpass', f2, bus = out }) {
      const t = Math.max(ctx.currentTime, at || ctx.currentTime), src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf; src.loop = true; fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .003); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      src.connect(fl); fl.connect(g); g.connect(bus); src.start(t, Math.random() * .5); src.stop(t + dur + .05);
    }
    // The lead voices, each a small blend of oscillators.
    const LEAD = {
      keys: (f, t) => { tone({ f, at: t, dur: .5, vol: .05, type: 'sine', bus: music }); tone({ f: f * 2, at: t, dur: .25, vol: .018, type: 'triangle', bus: music }); },
      bell: (f, t) => { tone({ f: f * 2, at: t, dur: .6, vol: .04, type: 'sine', bus: music }); tone({ f: f * 4.01, at: t, dur: .25, vol: .012, type: 'sine', bus: music }); },
      pluck: (f, t) => tone({ f, at: t, dur: .32, vol: .05, type: 'sawtooth', lp: 1600, bus: music }),
      square: (f, t) => tone({ f, at: t, dur: .18, vol: .035, type: 'square', lp: 2200, bus: music }),
    };
    // The beat rolls like wheels on the rails: a soft "chk-a chk-a" on every 8th, a thump on 1 and 3.
    function schedule() {
      if (!ctx || stopped) return;
      while (next < ctx.currentTime + .25) {
        const bar = Math.floor(step / 8) % 4, pos = step % 8, swing = pos % 2 ? beat * S.swing : 0, t = next + swing, chord = S.chords[bar];
        hiss({ at: t, dur: .04, vol: pos % 2 ? .018 : .03, f: 5200, bus: music });
        if (pos % 4 === 0) tone({ f: 110, f2: 45, at: t, dur: .18, vol: .16, type: 'sine', bus: music });
        if (pos === 4) hiss({ at: t, dur: .1, vol: .04, f: 1800, type: 'bandpass', bus: music });
        if (pos % 2 === 0) tone({ f: midi(S.bass[bar] + (pos === 6 ? 7 : 0)), at: t, dur: beat * 1.8, vol: .07, type: 'triangle', lp: 700, bus: music });
        if (pos === 0) chord.forEach(n => tone({ f: midi(n), at: t, dur: beat * 7.5, vol: .012, type: 'sawtooth', lp: 900, attack: .08, bus: music }));
        const s = S.steps[(bar % 2) * 8 + pos];
        if (s >= 0) LEAD[S.lead](midi(chord[s % chord.length] + 12 * (1 + Math.floor(s / chord.length))), t);
        // A far-off train whistle every eight bars.
        if (step % 64 === 0 && step) [0, .01].forEach((dt, i) => tone({ f: midi(i ? 74 : 69), at: t + dt, dur: 1.1, vol: .018, type: 'sawtooth', lp: 1200, attack: .12, bus: music }));
        next += beat; step++;
      }
    }
    const fx = name => {
      if (!ensure()) return;
      const t = ctx.currentTime;
      ({
        jump: () => { tone({ f: 300, f2: 620, dur: .16, vol: .12, type: 'triangle' }); hiss({ dur: .12, vol: .03, f: 2500, f2: 5000, type: 'bandpass' }); },
        land: () => { tone({ f: 140, f2: 70, dur: .12, vol: .14 }); hiss({ dur: .06, vol: .05, f: 900, type: 'lowpass' }); },
        step: () => hiss({ dur: .035, vol: .025, f: 1400, type: 'bandpass' }),
        news: () => [880, 1175].forEach((f, i) => tone({ f, at: t + i * .09, dur: .25, vol: .035, type: 'triangle' })),
        bounce: () => { tone({ f: 180, f2: 720, dur: .35, vol: .13, type: 'sine', vib: 18 }); tone({ f: 360, f2: 1100, dur: .25, vol: .04, type: 'triangle' }); },
        platform: () => [[1319, 0], [1047, .28]].forEach(([f, dt]) => { tone({ f, at: t + dt, dur: .9, vol: .07 }); tone({ f: f * 2.01, at: t + dt, dur: .4, vol: .02 }); }),
        fall: () => { tone({ f: 900, f2: 180, dur: .55, vol: .08, type: 'triangle' }); hiss({ at: t + .5, dur: .25, vol: .08, f: 600, type: 'lowpass', f2: 150 }); },
        win: () => {
          [69, 74, 78].forEach(n => tone({ f: midi(n), dur: 1.2, vol: .05, type: 'sawtooth', lp: 1800, attack: .06 }));
          [72, 76, 79, 84].forEach((n, i) => tone({ f: midi(n), at: t + .5 + i * .12, dur: i === 3 ? 1 : .3, vol: .08, type: 'triangle' }));
        },
      })[name]?.();
    };
    return {
      // A tap inside the climb counts as a user gesture, which some browsers need before audio can start.
      unlock() { if (!ensure()) return; if (mode === 2 && !timer) { next = ctx.currentTime + .1; music.gain.setTargetAtTime(1, ctx.currentTime, .4); timer = setInterval(schedule, 60); schedule(); } },
      fx,
      get state() { return ctx ? ctx.state + (timer ? '+music' : '') : 'none'; },
      stop() { stopped = true; clearInterval(timer); timer = 0; if (ctx) { const c = ctx; music?.gain.setTargetAtTime(0, c.currentTime, .15); setTimeout(() => c.close().catch(() => {}), 400); } },
    };
  };
})();
