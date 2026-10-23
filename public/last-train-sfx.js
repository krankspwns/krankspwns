/* Sound effects, synthesised live with Web Audio (no files) apart from the recorded emote voices.
   Sound mode: 0 = off, 1 = effects only, 2 = effects + music. Effects never play for a secret night choice. */
(() => {
  'use strict';
  window.createTrainSfx = () => {
    let ctx = null, bus = null, noiseBuf = null, mode = 2, clatter = null;
    try { const m = localStorage.getItem('lt-sound'); if (['0', '1', '2'].includes(m)) mode = +m; } catch {}
    const listeners = new Set(), clips = new Map(), last = {};
    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return null; }
        const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ctx.destination);
        bus = ctx.createGain(); bus.gain.value = .85; bus.connect(comp);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      return ctx;
    }
    const unlock = () => { if (mode) ensure(); };
    for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, unlock, { passive: true });
    function tone({ f = 440, f2 = null, type = 'sine', at = 0, dur = .15, vol = .2, attack = .005, lp = 0, out = bus }) {
      const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      let node = o; if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); node = fl; }
      node.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .05);
    }
    function noise({ at = 0, dur = .1, vol = .2, type = 'bandpass', f = 2000, f2 = null, q = 1, attack = .003, out = bus }) {
      const t = ctx.currentTime + at, src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf; src.loop = true; fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      src.connect(fl); fl.connect(g); g.connect(out); src.start(t, Math.random() * 1.5); src.stop(t + dur + .05);
    }
    function vowel({ f = 220, f2 = null, at = 0, dur = .12, vol = .2, a = 800, b = 1300, attack = .012 }) {
      const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      [[a, 1], [b, .6]].forEach(([fc, gain]) => { const bp = ctx.createBiquadFilter(), gg = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = fc; bp.Q.value = 6; gg.gain.value = gain; o.connect(bp); bp.connect(gg); gg.connect(g); });
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      g.connect(bus); o.start(t); o.stop(t + dur + .05);
    }
    function bell({ f = 880, at = 0, dur = .6, vol = .1 }) {
      tone({ f, at, dur, vol }); tone({ f: f * 2.01, at, dur: dur * .6, vol: vol * .35 }); tone({ f: f * 3.02, at, dur: dur * .3, vol: vol * .15 });
    }
    const rnd = (a, b) => a + Math.random() * (b - a);
    const R = {
      // the journey
      horn: () => { [[233, 0], [294, 0], [349, .02]].forEach(([f, at]) => { tone({ f, at, dur: 1.1, vol: .07, type: 'sawtooth', lp: 900, attack: .08 }); tone({ f: f * .995, at: at + 1.25, dur: .9, vol: .06, type: 'sawtooth', lp: 800, attack: .06 }); }); },
      door: () => { noise({ dur: .55, vol: .16, type: 'bandpass', f: 500, f2: 1400, q: .8, attack: .05 }); tone({ f: 120, f2: 70, at: .5, dur: .18, vol: .22 }); noise({ at: .5, dur: .08, vol: .2, type: 'lowpass', f: 800 }); },
      creak: () => { tone({ f: 180, f2: 260, dur: .45, vol: .05, type: 'sawtooth', lp: 700, attack: .1 }); noise({ dur: .4, vol: .05, type: 'bandpass', f: 900, q: 3, attack: .1 }); },
      bell: () => { bell({ f: 1175, dur: 1.2, vol: .12 }); bell({ f: 1175, at: .55, dur: 1.4, vol: .1 }); },
      sting: () => { tone({ f: 110, f2: 98, dur: 1.2, vol: .14, type: 'sawtooth', lp: 500, attack: .03 }); tone({ f: 147, f2: 139, dur: 1.2, vol: .08, type: 'sawtooth', lp: 600 }); },
      punch: () => { tone({ f: 1800, f2: 900, dur: .04, vol: .1, type: 'square', lp: 3000 }); noise({ at: .02, dur: .06, vol: .2, type: 'highpass', f: 2500 }); },
      tap: () => { tone({ f: 1500, f2: 900, dur: .045, vol: .045, type: 'triangle' }); noise({ dur: .02, vol: .03, type: 'highpass', f: 3000 }); },
      coin: () => { tone({ f: 2600, dur: .05, vol: .06, type: 'triangle' }); for (let i = 0; i < 7; i++) tone({ f: 3200 + (i % 2) * 400, at: .06 + i * .1, dur: .03, vol: .04 - i * .004, type: 'triangle' }); tone({ f: 1800, f2: 1500, at: .85, dur: .35, vol: .07, type: 'triangle' }); },
      steps: () => { for (let i = 0; i < 6; i++) { const at = i * .34; noise({ at, dur: .09, vol: .2 - i * .022, type: 'lowpass', f: 420 - i * 30, f2: 120 }); tone({ f: 70, f2: 45, at, dur: .1, vol: .1 - i * .012 }); } },
      throw: () => { noise({ dur: .55, vol: .2, type: 'bandpass', f: 300, f2: 2200, q: .9, attack: .08 }); tone({ f: 520, f2: 160, dur: .5, vol: .05, type: 'triangle' }); noise({ at: .62, dur: .18, vol: .28, type: 'lowpass', f: 500, f2: 90 }); tone({ f: 80, f2: 40, at: .62, dur: .22, vol: .3 }); },
      stamp: () => { noise({ dur: .12, vol: .34, type: 'lowpass', f: 700, f2: 120 }); tone({ f: 90, f2: 45, dur: .25, vol: .34 }); },
      tie: () => { tone({ f: 1400, dur: .16, vol: .07, type: 'triangle' }); tone({ f: 1400, at: .26, dur: .32, vol: .07, type: 'triangle' }); },
      chime: () => [784, 1046, 1318].forEach((f, i) => tone({ f, at: i * .09, dur: .45, vol: .1, type: 'triangle' })),
      tick: () => tone({ f: 1250, dur: .05, vol: .07, type: 'square', lp: 2500 }),
      good: () => { [392, 523, 659, 784].forEach((f, i) => tone({ f, at: i * .12, dur: i === 3 ? 1.1 : .3, vol: .1, type: 'sawtooth', lp: 2000, attack: .02 })); tone({ f: 196, at: .36, dur: 1.2, vol: .1, type: 'triangle' }); },
      bad: () => { [220, 208, 196, 147].forEach((f, i) => tone({ f, at: i * .3, dur: i === 3 ? 1.4 : .34, vol: .13, type: 'sawtooth', lp: 650, attack: .05 })); },
      letter: () => { noise({ dur: .18, vol: .08, type: 'bandpass', f: 3000, f2: 1500, q: 1 }); bell({ f: 1568, at: .12, dur: .5, vol: .06 }); },
      buy: () => { [1047, 1319, 1568].forEach((f, i) => tone({ f, at: i * .06, dur: .22, vol: .08, type: 'triangle' })); noise({ at: .05, dur: .15, vol: .05, type: 'highpass', f: 6000 }); },
      // reactions and throws (the same sounds as Row of Reckoning)
      throw: () => noise({ dur: .3, vol: .12, type: 'bandpass', f: 500, f2: 2600, q: 1.2 }),
      splat: () => { noise({ dur: .2, vol: .22, type: 'lowpass', f: 1800, f2: 300 }); tone({ f: 170, f2: 60, dur: .2, vol: .2 }); },
      boom: () => { noise({ dur: .8, vol: .3, type: 'lowpass', f: 900, f2: 70 }); tone({ f: 95, f2: 32, dur: .7, vol: .32 }); },
      pop: () => { tone({ f: 520, f2: 1150, dur: .1, vol: .12, type: 'triangle' }); noise({ dur: .12, vol: .12, type: 'highpass', f: 4000 }); tone({ f: 880, at: .1, dur: .22, vol: .08, type: 'triangle' }); },
      emo_laugh: () => { [0, .12, .24, .36, .48].forEach((at, i) => { noise({ at, dur: .035, vol: .1, type: 'bandpass', f: 2600, q: 1.5 }); vowel({ f: 330 - i * 14, f2: 290 - i * 16, at: at + .012, dur: .1, vol: 1.1 - i * .14, a: 780, b: 1250 }); }); },
      emo_wow: () => { tone({ f: 260, f2: 980, dur: .38, vol: .2 }); tone({ f: 520, f2: 1960, at: .02, dur: .34, vol: .08, type: 'triangle' }); },
      emo_cry: () => [[620, 480], [540, 360]].forEach(([a, b], i) => tone({ f: a, f2: b, at: i * .32, dur: .3, vol: .09 })),
      emo_cool: () => { tone({ f: 330, f2: 392, dur: .18, vol: .1, type: 'triangle', lp: 1500 }); tone({ f: 494, at: .18, dur: .38, vol: .1, type: 'triangle', lp: 1500 }); },
      emo_think: () => { tone({ f: 220, f2: 232, dur: .5, vol: .14 }); tone({ f: 330, f2: 392, at: .5, dur: .22, vol: .13, type: 'triangle' }); },
      emo_angry: () => { tone({ f: 95, f2: 70, dur: .5, vol: .22, type: 'sawtooth', lp: 500 }); noise({ dur: .45, vol: .16, type: 'lowpass', f: 700 }); },
      emo_heart: () => { [0, .15].forEach(at => tone({ f: 110, f2: 55, at, dur: .16, vol: .22 })); [659, 784, 988, 1319].forEach((f, i) => bell({ f, at: .38 + i * .11, dur: i === 3 ? .9 : .5, vol: .075 })); },
      emo_rip: () => [196, 185, 175, 147].forEach((f, i) => tone({ f, at: i * .2, dur: i === 3 ? .5 : .18, vol: .1, type: 'sawtooth', lp: 700 })),
      emo_sus: () => { tone({ f: 330, f2: 300, dur: .2, vol: .1, type: 'triangle', lp: 1200 }); tone({ f: 311, f2: 277, at: .24, dur: .4, vol: .1, type: 'triangle', lp: 1200 }); },
      emo_shh: () => noise({ dur: .7, vol: .12, type: 'highpass', f: 3200, attack: .08 }),
      emo_eyes: () => { tone({ f: 1400, f2: 1800, dur: .08, vol: .05, type: 'triangle' }); tone({ f: 1800, f2: 1400, at: .2, dur: .08, vol: .05, type: 'triangle' }); },
      emo_gg: () => [523, 784, 1047].forEach((f, i) => tone({ f, at: i * .1, dur: .3, vol: .09, type: 'triangle' })),
      emo_gl: () => [784, 988, 1175, 1568].forEach((f, i) => tone({ f, at: i * .08, dur: .28, vol: .07 })),
      emo_wp: () => { for (let i = 0; i < 11; i++) noise({ at: i * .045 + rnd(0, .02), dur: .05, vol: .22, type: 'bandpass', f: rnd(1200, 3200), q: 1.2 }); },
      emo_oof: () => { tone({ f: 220, f2: 70, dur: .22, vol: .32, type: 'triangle' }); noise({ dur: .1, vol: .22, type: 'lowpass', f: 600 }); },
      emo_faster: () => [0, .16, .3, .41, .5, .58, .65].forEach(at => tone({ f: 1500, at, dur: .04, vol: .07, type: 'square', lp: 2600 })),
      emo_aiyo: () => { tone({ f: 720, f2: 520, dur: .2, vol: .1 }); tone({ f: 460, f2: 330, at: .22, dur: .32, vol: .1 }); },
      emo_steady: () => [0, .2].forEach((at, i) => tone({ f: i ? 330 : 247, at, dur: .2, vol: .11, type: 'triangle', lp: 1400 })),
    };
    function play(name) {
      if (!mode || document.hidden || !R[name]) return;
      const now = performance.now(); if (now - (last[name] || 0) < 60) return; last[name] = now;
      if (!ensure()) return;
      try { R[name](); } catch {}
    }
    // Recorded voices from Row of Reckoning for the word reactions; the synthesised sound is the fallback.
    const VOICED = new Set(['gg', 'gl', 'wp', 'faster', 'aiyo', 'steady', 'oof']);
    function emote(key) {
      if (!mode) return;
      if (!VOICED.has(key)) return play('emo_' + key);
      let a = clips.get(key);
      if (!a) { a = new Audio('/audio/' + key + '.mp3'); a.preload = 'auto'; clips.set(key, a); }
      try { a.currentTime = 0; a.volume = .9; a.play().catch(() => play('emo_' + key)); } catch { play('emo_' + key); }
    }
    // The wheels: a soft two-beat clatter under the night, the same on every phone.
    function wheels(on) {
      if (!on || !mode) { if (clatter) { clearInterval(clatter); clatter = null; } return; }
      if (clatter || !ensure()) return;
      const beat = () => { if (!ctx || document.hidden) return; [0, .16, .62, .78].forEach(at => noise({ at, dur: .05, vol: .045, type: 'lowpass', f: 420, q: .7 })); };
      beat(); clatter = setInterval(beat, 1240);
    }
    return {
      play, emote, wheels,
      get mode() { return mode; },
      setMode(m) { mode = m; try { localStorage.setItem('lt-sound', String(m)); } catch {} if (!m) wheels(false); else ensure(); listeners.forEach(fn => fn(m)); },
      onMode(fn) { listeners.add(fn); },
    };
  };
})();
