// ---- sound: everything is synthesised live with the Web Audio API, so there are no audio files to download ----
const SND = (() => {
  let ctx = null, master = null, sfxBus = null, musBus = null, noiseBuf = null;
  let mode = 1;   // 0 = off, 1 = sound effects, 2 = effects + background music
  try { const m = localStorage.getItem('sct-snd'); if (m === '0' || m === '1' || m === '2') mode = +m; } catch {}
  const lastPlayed = {};
  let musicTimer = null, nextT = 0, stepI = 0;

  function build(c) {
    master = c.createGain(); master.gain.value = 0.9;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
    master.connect(comp); comp.connect(c.destination);
    sfxBus = c.createGain(); sfxBus.connect(master);
    musBus = c.createGain(); musBus.gain.value = 0; musBus.connect(master);
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC({ latencyHint: 'interactive' }); build(ctx); } catch { try { ctx = new AC(); build(ctx); } catch { ctx = null; return null; } }
      try { navigator.audioSession && (navigator.audioSession.type = 'playback'); } catch {}   // iOS 16.4+: sound even with the silent switch on
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});   // also covers iOS's 'interrupted' state (calls, Siri, app switches)
    return ctx;
  }
  // iOS keeps WebAudio muted behind the ringer switch unless a media element is playing: a silent looping clip fixes that
  let keepAlive = null;
  function silentClip() {
    if (keepAlive) return;
    try {
      const n = 800, b = new Uint8Array(44 + n); const dv = new DataView(b.buffer), w = (o, str) => [...str].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
      w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
      dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true); b.fill(128, 44);
      keepAlive = new Audio(URL.createObjectURL(new Blob([b], { type: 'audio/wav' }))); keepAlive.loop = true; keepAlive.volume = 0.01;
      keepAlive.play().catch(() => { keepAlive = null; });
    } catch { keepAlive = null; }
  }

  // building blocks
  function tone({ f = 440, f2 = null, type = 'sine', at = 0, dur = 0.15, vol = 0.2, attack = 0.005, bus = sfxBus, lp = 0 }) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); node = fl; }
    node.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise({ at = 0, dur = 0.1, vol = 0.2, type = 'bandpass', f = 2000, f2 = null, q = 1, attack = 0.003, bus = sfxBus }) {
    const t = ctx.currentTime + at, src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(bus); src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }
  // a voice-like vowel: a buzzing source shaped by two resonances (formants)
  function vowel({ f = 220, f2 = null, at = 0, dur = 0.12, vol = 0.2, a = 800, b = 1300, attack = 0.012, bus = sfxBus }) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    [[a, 1], [b, 0.6]].forEach(([fc, gain]) => { const bp = ctx.createBiquadFilter(), gg = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = fc; bp.Q.value = 6; gg.gain.value = gain; o.connect(bp); bp.connect(gg); gg.connect(g); });
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }
  // a soft bell: the note plus two quieter overtones that die away faster
  function bell({ f = 880, at = 0, dur = 0.6, vol = 0.1, bus = sfxBus }) {
    tone({ f, at, dur, vol, type: 'sine', bus }); tone({ f: f * 2.01, at, dur: dur * 0.6, vol: vol * 0.35, type: 'sine', bus }); tone({ f: f * 3.02, at, dur: dur * 0.3, vol: vol * 0.15, type: 'sine', bus });
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  // sound effects
  const R = {
    tap: () => tone({ f: 1500, f2: 1100, dur: 0.035, vol: 0.045, type: 'triangle' }),
    place: () => { noise({ dur: 0.07, vol: 0.24, type: 'lowpass', f: 1400, q: 0.7 }); tone({ f: 190, f2: 80, dur: 0.1, vol: 0.32 }); },
    lift: () => { noise({ dur: 0.06, vol: 0.1, type: 'highpass', f: 3000, f2: 5000 }); tone({ f: 520, f2: 900, dur: 0.07, vol: 0.06, type: 'triangle' }); },
    return: () => { noise({ dur: 0.08, vol: 0.13, type: 'bandpass', f: 2600, f2: 1200, q: 1.2 }); tone({ f: 700, f2: 380, dur: 0.09, vol: 0.08, type: 'triangle' }); },
    flip: () => { noise({ dur: 0.14, vol: 0.22, type: 'bandpass', f: 1000, f2: 4200, q: 1.1 }); tone({ f: 2400, f2: 1800, at: 0.12, dur: 0.03, vol: 0.06, type: 'square', lp: 4000 }); },
    shuffle: () => {
      for (let i = 0; i < 16; i++) noise({ at: i * 0.038 + rnd(0, 0.01), dur: 0.05, vol: rnd(0.09, 0.16), type: 'bandpass', f: rnd(2200, 4700), q: 1.5 });
      tone({ f: 170, f2: 90, at: 0.66, dur: 0.1, vol: 0.22 }); noise({ at: 0.66, dur: 0.06, vol: 0.18, type: 'lowpass', f: 1300 });
    },
    ready: () => { tone({ f: 659, dur: 0.12, vol: 0.16, type: 'triangle' }); tone({ f: 988, at: 0.09, dur: 0.22, vol: 0.16, type: 'triangle' }); tone({ f: 1976, at: 0.09, dur: 0.3, vol: 0.04 }); },
    unready: () => tone({ f: 620, f2: 380, dur: 0.16, vol: 0.14, type: 'triangle' }),
    allready: () => {
      [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ f, at: i * 0.07, dur: 0.5, vol: 0.13, type: 'triangle' }));
      tone({ f: 130.8, dur: 0.9, vol: 0.18 }); tone({ f: 196, dur: 0.9, vol: 0.1 }); noise({ at: 0.3, dur: 0.5, vol: 0.05, type: 'highpass', f: 6000 });
    },
    join: () => { tone({ f: 520, f2: 820, dur: 0.1, vol: 0.13 }); tone({ f: 1040, f2: 1640, at: 0.04, dur: 0.08, vol: 0.04 }); },
    leave: () => tone({ f: 520, f2: 300, dur: 0.14, vol: 0.12 }),
    kick: () => { tone({ f: 200, f2: 70, dur: 0.25, vol: 0.3, type: 'sawtooth', lp: 700 }); noise({ dur: 0.15, vol: 0.15, type: 'lowpass', f: 900 }); },
    error: () => { tone({ f: 190, dur: 0.11, vol: 0.14, type: 'square', lp: 900 }); tone({ f: 150, at: 0.13, dur: 0.16, vol: 0.14, type: 'square', lp: 800 }); },
    tear: () => {
      noise({ dur: 0.55, vol: 0.34, type: 'highpass', f: 4200, f2: 900, q: 0.6 });
      for (let i = 0; i < 9; i++) noise({ at: 0.03 + i * 0.055 + rnd(0, 0.02), dur: 0.03, vol: 0.14, type: 'bandpass', f: rnd(1500, 5000), q: 3 });
      tone({ f: 90, f2: 55, at: 0.05, dur: 0.35, vol: 0.18, type: 'sawtooth', lp: 400 });
    },
    // one little sound for every reaction
    emo_laugh: () => {   // ha-ha-ha-ha-ha: breathy bursts on an 'a' vowel that sag in pitch and fade
      [0, 0.12, 0.24, 0.36, 0.48].forEach((at, i) => {
        noise({ at, dur: 0.035, vol: 0.1, type: 'bandpass', f: 2600, q: 1.5 });
        vowel({ f: 330 - i * 14, f2: 290 - i * 16, at: at + 0.012, dur: 0.1, vol: 1.1 - i * 0.14, a: 780, b: 1250 });
      });
      vowel({ f: 250, f2: 200, at: 0.62, dur: 0.22, vol: 0.3, a: 700, b: 1100, attack: 0.05 });
    },
    emo_wow: () => { tone({ f: 260, f2: 980, dur: 0.38, vol: 0.2, type: 'sine' }); tone({ f: 520, f2: 1960, at: 0.02, dur: 0.34, vol: 0.08, type: 'triangle' }); },
    emo_cry: () => [[620, 480], [540, 360]].forEach(([a, b], i) => { tone({ f: a, f2: b, at: i * 0.32, dur: 0.3, vol: 0.09, type: 'sine' }); tone({ f: a * 1.01, f2: b * 1.01, at: i * 0.32 + 0.02, dur: 0.3, vol: 0.05, type: 'sine' }); }),
    emo_cool: () => { tone({ f: 330, f2: 392, dur: 0.18, vol: 0.1, type: 'triangle', lp: 1500 }); tone({ f: 494, at: 0.18, dur: 0.38, vol: 0.1, type: 'triangle', lp: 1500 }); },
    emo_fire: () => { noise({ dur: 0.6, vol: 0.14, type: 'bandpass', f: 600, f2: 3500, q: 0.7 }); for (let i = 0; i < 8; i++) noise({ at: 0.05 + i * 0.06 + rnd(0, 0.02), dur: 0.03, vol: 0.12, type: 'highpass', f: 4500 }); tone({ f: 110, f2: 70, dur: 0.4, vol: 0.12, type: 'sawtooth', lp: 400 }); },
    emo_gg: () => [523, 784, 1047].forEach((f, i) => tone({ f, at: i * 0.1, dur: 0.3, vol: 0.09, type: 'triangle' })),
    emo_ez: () => [392, 523, 659, 784].forEach((f, i) => tone({ f, at: i * 0.07, dur: 0.16, vol: 0.09, type: 'sawtooth', lp: 1800 })),
    emo_gl: () => [784, 988, 1175, 1568].forEach((f, i) => { tone({ f, at: i * 0.08, dur: 0.28, vol: 0.07, type: 'sine' }); tone({ f: f * 2, at: i * 0.08, dur: 0.2, vol: 0.025, type: 'sine' }); }),
    emo_wp: () => { for (let i = 0; i < 11; i++) noise({ at: i * 0.045 + rnd(0, 0.02), dur: 0.05, vol: 0.22, type: 'bandpass', f: rnd(1200, 3200), q: 1.2 }); },
    emo_rip: () => { [196, 185, 175, 147].forEach((f, i) => tone({ f, f2: f * (i === 3 ? 0.9 : 1), at: i * 0.2, dur: i === 3 ? 0.5 : 0.18, vol: 0.1, type: 'sawtooth', lp: 700 })); },
    emo_angry: () => { tone({ f: 95, f2: 70, dur: 0.5, vol: 0.22, type: 'sawtooth', lp: 500 }); noise({ dur: 0.45, vol: 0.16, type: 'lowpass', f: 700 }); for (let i = 0; i < 6; i++) tone({ f: 190, at: i * 0.07, dur: 0.05, vol: 0.09, type: 'square', lp: 500 }); },
    emo_think: () => { tone({ f: 220, f2: 232, dur: 0.5, vol: 0.14, type: 'sine' }); tone({ f: 330, f2: 392, at: 0.5, dur: 0.22, vol: 0.13, type: 'triangle' }); },
    emo_heart: () => {   // lub-dub, then a warm little music-box phrase
      [0, 0.15].forEach((at) => { tone({ f: 110, f2: 55, at, dur: 0.16, vol: 0.22, type: 'sine' }); });
      [659, 784, 988, 1319].forEach((f, i) => bell({ f, at: 0.38 + i * 0.11, dur: i === 3 ? 0.9 : 0.5, vol: 0.075 }));
      tone({ f: 330, at: 0.38, dur: 0.9, vol: 0.05, type: 'triangle', lp: 900 });
    },
    emo_trophy: () => [523, 659, 784, 1047].forEach((f, i) => tone({ f, at: i * 0.11, dur: i === 3 ? 0.5 : 0.14, vol: 0.09, type: 'square', lp: 2200 })),
    emo_oof: () => { tone({ f: 220, f2: 70, dur: 0.22, vol: 0.32, type: 'triangle' }); noise({ dur: 0.1, vol: 0.22, type: 'lowpass', f: 600 }); },
    emo_faster: () => [0, 0.16, 0.3, 0.41, 0.5, 0.58, 0.65].forEach((at) => tone({ f: 1500, at, dur: 0.04, vol: 0.07, type: 'square', lp: 2600 })),
    emo_aiyo: () => { tone({ f: 720, f2: 520, dur: 0.2, vol: 0.1, type: 'sine' }); tone({ f: 460, f2: 330, at: 0.22, dur: 0.32, vol: 0.1, type: 'sine' }); },
    emo_steady: () => [0, 0.2].forEach((at, i) => tone({ f: i ? 330 : 247, at, dur: 0.2, vol: 0.11, type: 'triangle', lp: 1400 })),
    pop: () => { tone({ f: 600, f2: 1100, dur: 0.09, vol: 0.09, type: 'sine' }); tone({ f: 1500, at: 0.07, dur: 0.07, vol: 0.05 }); },
    tick: () => tone({ f: 1250, dur: 0.05, vol: 0.07, type: 'square', lp: 2500 }),
    whistle: () => { tone({ f: 500, f2: 2600, dur: 0.7, vol: 0.07, type: 'triangle' }); },
    crackle: () => { for (let i = 0; i < 9; i++) noise({ at: i * 0.045 + Math.random() * 0.03, dur: 0.04, vol: 0.12, type: 'highpass', f: 3000 + Math.random() * 3000 }); },
    sizzle: () => { noise({ dur: 0.9, vol: 0.1, type: 'highpass', f: 5000, f2: 9000 }); tone({ f: 2200, f2: 3400, dur: 0.9, vol: 0.025, type: 'sawtooth' }); },
    beep: () => tone({ f: 880, dur: 0.1, vol: 0.12, type: 'square', lp: 2200 }),
    throw: () => noise({ dur: 0.3, vol: 0.12, type: 'bandpass', f: 500, f2: 2600, q: 1.2 }),
    splat: () => { noise({ dur: 0.2, vol: 0.22, type: 'lowpass', f: 1800, f2: 300 }); tone({ f: 170, f2: 60, dur: 0.2, vol: 0.2 }); },
    boom: () => { noise({ dur: 0.8, vol: 0.3, type: 'lowpass', f: 900, f2: 70 }); tone({ f: 95, f2: 32, dur: 0.7, vol: 0.32 }); },
    pop: () => { tone({ f: 520, f2: 1150, dur: 0.1, vol: 0.12, type: 'triangle' }); noise({ dur: 0.12, vol: 0.12, type: 'highpass', f: 4000 }); tone({ f: 880, at: 0.1, dur: 0.22, vol: 0.08, type: 'triangle' }); },
    chime: () => [784, 1046, 1318].forEach((f, i) => tone({ f, at: i * 0.09, dur: 0.45, vol: 0.1, type: 'triangle' })),
    // a row's best card or pattern has been placed: a different little flourish for each tier
    prime_top: () => { [1046, 1318, 1568, 2093].forEach((f, i) => tone({ f, at: i * 0.07, dur: 0.3, vol: 0.09, type: 'triangle' })); tone({ f: 3136, at: 0.28, dur: 0.25, vol: 0.04, type: 'sine' }); },
    prime_pair: () => { tone({ f: 880, dur: 0.18, vol: 0.09, type: 'sine' }); tone({ f: 1175, at: 0.1, dur: 0.26, vol: 0.09, type: 'sine' }); },
    prime_straight: () => [659, 784, 988].forEach((f, i) => tone({ f, at: i * 0.1, dur: 0.22, vol: 0.09, type: 'triangle' })),
    prime_flush: () => { noise({ dur: 0.5, vol: 0.05, type: 'bandpass', f: 1500, f2: 5200, q: 1.2 }); [880, 1319, 1760].forEach((f, i) => tone({ f, at: 0.06 + i * 0.08, dur: 0.3, vol: 0.07, type: 'sine' })); },
    prime_triple: () => { [523, 659, 784].forEach((f) => tone({ f, dur: 0.5, vol: 0.08, type: 'triangle', lp: 2600 })); tone({ f: 1046, at: 0.12, dur: 0.4, vol: 0.08, type: 'triangle' }); tone({ f: 131, dur: 0.3, vol: 0.14 }); },
    prime_sflush: () => { [523, 659, 784, 1046, 1319].forEach((f, i) => tone({ f, at: i * 0.07, dur: 0.4, vol: 0.08, type: 'triangle' })); [2349, 2794, 3136].forEach((f, i) => tone({ f, at: 0.35 + i * 0.07, dur: 0.2, vol: 0.04, type: 'sine' })); noise({ at: 0.25, dur: 0.5, vol: 0.04, type: 'highpass', f: 6000 }); },
    prime_royal: () => { tone({ f: 98, dur: 0.5, vol: 0.18 }); [523, 659, 784, 1046, 1319, 1568].forEach((f, i) => tone({ f, at: i * 0.075, dur: 0.55, vol: 0.085, type: 'triangle' })); [1046, 1319, 1568].forEach((f) => tone({ f, at: 0.5, dur: 0.7, vol: 0.07, type: 'triangle', lp: 3000 })); [2093, 2637, 3136, 3951].forEach((f, i) => tone({ f, at: 0.55 + i * 0.07, dur: 0.22, vol: 0.04, type: 'sine' })); noise({ at: 0.45, dur: 0.7, vol: 0.05, type: 'highpass', f: 6500 }); },
    // the showdown: a roar, a swooping dive, thunder and the hit
    roar: () => { noise({ dur: 0.9, vol: 0.14, type: 'lowpass', f: 700, f2: 120 }); tone({ f: 110, f2: 55, dur: 0.85, vol: 0.2, type: 'sawtooth', lp: 500 }); tone({ f: 190, f2: 90, at: 0.05, dur: 0.6, vol: 0.08, type: 'sawtooth', lp: 700 }); },
    swoop: () => { noise({ dur: 0.7, vol: 0.12, type: 'bandpass', f: 500, f2: 3200, q: 1.1 }); tone({ f: 900, f2: 400, at: 0.45, dur: 0.25, vol: 0.06, type: 'triangle' }); },
    thunder: () => { noise({ dur: 1.1, vol: 0.2, type: 'lowpass', f: 1500, f2: 60 }); noise({ at: 0.02, dur: 0.12, vol: 0.2, type: 'highpass', f: 4000 }); tone({ f: 70, f2: 38, dur: 0.9, vol: 0.2 }); },
    clash: () => { noise({ dur: 0.22, vol: 0.22, type: 'highpass', f: 2500 }); [880, 1320, 1760].forEach((f, i) => tone({ f, at: i * 0.01, dur: 0.5, vol: 0.09, type: 'sawtooth', lp: 3600 })); tone({ f: 120, f2: 50, dur: 0.35, vol: 0.25 }); },
    impact: () => { noise({ dur: 0.35, vol: 0.2, type: 'lowpass', f: 1600, f2: 150 }); tone({ f: 130, f2: 50, dur: 0.3, vol: 0.28 }); },
    // balloons rising: a soft airy lift, rubbery squeaks and a sparkle of glitter
    balloons: () => { noise({ dur: 1.6, vol: 0.07, type: 'bandpass', f: 350, f2: 1600, q: 0.9 }); [0, 0.18, 0.37, 0.55, 0.8, 1.05].forEach((at, i) => tone({ f: 640 + (i * 137) % 420, f2: 980 + (i * 91) % 380, at, dur: 0.12, vol: 0.05, type: 'sine' })); [0.5, 0.7, 0.95, 1.2, 1.45].forEach((at, i) => tone({ f: 2100 + i * 260, at, dur: 0.16, vol: 0.035, type: 'triangle' })); },
    gulp: () => {   // three swallows as the glass tips back, then the empty glass set down with a clink
      for (const [at, k] of [[0.18, 1], [0.46, 0.92], [0.74, 0.85]]) {
        tone({ f: 230 * k, f2: 85 * k, at, dur: 0.13, vol: 0.24, lp: 700 });   // the swallow
        tone({ f: 110 * k, f2: 260 * k, at: at + 0.09, dur: 0.06, vol: 0.12, lp: 900 });   // the little 'glk'
        noise({ at: at + 0.02, dur: 0.1, vol: 0.07, type: 'lowpass', f: 900, f2: 250 });   // liquid going down
      }
      tone({ f: 2500, at: 1.02, dur: 0.22, vol: 0.045, type: 'triangle' }); tone({ f: 3700, at: 1.03, dur: 0.16, vol: 0.025, type: 'sine' });
    },
    boing: () => { tone({ f: 300, f2: 700, dur: 0.14, vol: 0.09, type: 'triangle' }); tone({ f: 700, f2: 420, at: 0.12, dur: 0.12, vol: 0.06, type: 'triangle' }); },
    morph: () => {   // a rising sparkle as the joker turns into its card
      [660, 830, 988, 1244, 1568, 1976].forEach((f, i) => tone({ f, at: i * 0.07, dur: 0.22, vol: 0.07, type: 'triangle' }));
      noise({ at: 0.05, dur: 0.5, vol: 0.05, type: 'bandpass', f: 3000, f2: 9000, q: 2 }); tone({ f: 2637, at: 0.45, dur: 0.4, vol: 0.06 });
    },
    safe: () => { tone({ f: 880, dur: 0.18, vol: 0.1 }); tone({ f: 1320, at: 0.06, dur: 0.22, vol: 0.08 }); },
    tie: () => { tone({ f: 392, dur: 0.18, vol: 0.11, type: 'triangle' }); tone({ f: 392, at: 0.2, dur: 0.25, vol: 0.11, type: 'triangle' }); },
    names: () => { tone({ f: 330, f2: 300, dur: 0.5, vol: 0.16 }); tone({ f: 660, dur: 0.4, vol: 0.05 }); noise({ dur: 0.08, vol: 0.1, type: 'lowpass', f: 800 }); },
    youlose: () => {
      tone({ f: 220, f2: 38, dur: 1.1, vol: 0.5 }); tone({ f: 164, f2: 82, dur: 1, vol: 0.16, type: 'sawtooth', lp: 500 });
      tone({ f: 233, f2: 116, at: 0.05, dur: 0.9, vol: 0.1, type: 'sawtooth', lp: 600 }); noise({ dur: 0.6, vol: 0.22, type: 'lowpass', f: 1800, f2: 200 });
    },
    whoosh: () => { noise({ dur: 0.35, vol: 0.15, type: 'bandpass', f: 300, f2: 2600, q: 0.9 }); noise({ at: 0.3, dur: 0.4, vol: 0.12, type: 'bandpass', f: 2600, f2: 400, q: 0.9 }); },
    round: () => {
      [[392, 0.16], [784.8, 0.065], [1184, 0.03]].forEach(([f, v], i) => tone({ f, dur: 1.6 - i * 0.4, vol: v }));
      tone({ f: 98, dur: 1.4, vol: 0.18 });
    },
    final: () => {
      [392, 523, 659, 784].forEach((f, i) => { tone({ f, at: i * 0.13, dur: 0.7, vol: 0.12, type: 'triangle' }); tone({ f: f / 2, at: i * 0.13, dur: 0.7, vol: 0.07 }); });
      tone({ f: 1046, at: 0.55, dur: 1.2, vol: 0.1 }); tone({ f: 1318, at: 0.62, dur: 1.1, vol: 0.08 }); noise({ at: 0.5, dur: 0.9, vol: 0.06, type: 'highpass', f: 7000 });
    },
  };

  // background music: a slow, jazzy lounge loop (Am7 Dm7 G7 Cmaj7 Fmaj7 Bm7b5 E7 Am7), 8 bars
  const EIGHTH = 60 / 88 / 2;
  const PROG = [[45, [60, 64, 67]], [50, [60, 65, 69]], [43, [59, 65, 67]], [48, [59, 64, 67]], [41, [57, 60, 64]], [47, [57, 62, 65]], [40, [56, 59, 62]], [45, [60, 64, 67]]];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function musicStep(i, t) {
    const rel = Math.max(0, t - ctx.currentTime), bar = Math.floor(i / 8) % 8, s = i % 8, [bass, chord] = PROG[bar], bus = musBus;
    if (s === 0 || s === 4) tone({ f: 120, f2: 46, at: rel, dur: 0.22, vol: 0.34, bus });                                  // soft kick
    if (s === 0) tone({ f: mtof(bass), at: rel, dur: EIGHTH * 3.4, vol: 0.34, bus, lp: 500, attack: 0.012 });              // bass
    if (s === 4) tone({ f: mtof(bass + 7), at: rel, dur: EIGHTH * 2.6, vol: 0.26, bus, lp: 500, attack: 0.012 });
    if (s === 0) chord.forEach((n) => tone({ f: mtof(n), at: rel, dur: EIGHTH * 7.5, vol: 0.05, bus, attack: 0.25 }));      // slow pad
    if (s === 2 || s === 5) chord.forEach((n) => tone({ f: mtof(n + 12), type: 'triangle', at: rel, dur: 0.5, vol: 0.06, bus, lp: 1800 }));   // comping stabs
    noise({ at: rel, dur: 0.035, vol: s % 2 ? 0.035 : 0.055, type: 'highpass', f: 7000, bus });                          // shaker
    if ((s === 3 || s === 6) && Math.random() < 0.5) tone({ f: mtof(chord[Math.floor(Math.random() * 3)] + 24), at: rel, dur: 0.9, vol: 0.05, bus });   // little bell
  }
  function schedule() { if (!ctx) return; while (nextT < ctx.currentTime + 0.4) { musicStep(stepI, nextT); nextT += EIGHTH; stepI = (stepI + 1) % 64; } }
  function startMusic() {
    if (musicTimer || !ensure()) return;
    nextT = ctx.currentTime + 0.15; stepI = 0;
    const g = musBus.gain, now = ctx.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0.4, now + 1.2);
    musicTimer = setInterval(schedule, 120);
  }
  function stopMusic() {
    if (!musicTimer) return;
    clearInterval(musicTimer); musicTimer = null;
    if (ctx) { const g = musBus.gain, now = ctx.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + 0.5); }
  }
  function applyMode() { if (mode >= 2) startMusic(); else stopMusic(); }
  // leaving the browser (home screen, another app, lock screen) must silence everything, including the silent clip that keeps iOS audio alive
  let stale = false;   // set when the page was backgrounded: iOS can then report 'running' while the output is dead
  const quiet = () => {
    stale = true;
    try { ctx && ctx.suspend().catch(() => {}); } catch {}
    try { keepAlive && keepAlive.pause(); } catch {}
    try { window.speechSynthesis && speechSynthesis.cancel(); } catch {}
    try { navigator.audioSession && (navigator.audioSession.type = 'auto'); } catch {}
  };
  // iOS/Android can leave a context stuck in 'suspended'/'interrupted' after another app had the speaker: if resume() doesn't take, build a fresh one
  // the first tap after coming back builds a brand-new engine (created inside the tap, which is the only time iOS allows it)
  function rebuild() {
    const old = ctx, wasMusic = !!musicTimer;
    try { clearInterval(musicTimer); } catch {} musicTimer = null;
    ctx = null;
    try { old && old.close().catch(() => {}); } catch {}
    if (ensure()) { try { navigator.audioSession && (navigator.audioSession.type = 'playback'); } catch {} try { keepAlive && keepAlive.play().catch(() => {}); } catch {} if (wasMusic) applyMode(); }
  }
  let reviveT = null;
  function revive() {
    if (mode === 0 || !ctx) return;
    clearTimeout(reviveT);
    try { ctx.resume().catch(() => {}); } catch {}
    reviveT = setTimeout(() => {
      if (!ctx || ctx.state === 'running' || document.hidden) return;
      const old = ctx, wasMusic = !!musicTimer;
      try { clearInterval(musicTimer); } catch {} musicTimer = null;
      ctx = null;
      try { old.close().catch(() => {}); } catch {}
      if (ensure() && wasMusic) applyMode();
    }, 350);
  }
  const wake = () => {
    if (mode === 0) return;
    revive();
    try { navigator.audioSession && (navigator.audioSession.type = 'playback'); } catch {}
    try { ctx && ctx.resume().catch(() => {}); } catch {}
    try { keepAlive && keepAlive.play().catch(() => {}); } catch {}
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) quiet(); else wake(); });
  window.addEventListener('pagehide', quiet);
  window.addEventListener('pageshow', wake);
  // every tap is a chance to wake the engine again if the browser put it to sleep
  ['touchend', 'click', 'pointerup'].forEach((ev) => window.addEventListener(ev, () => { if (mode === 0 || !ctx || document.hidden) return; if (stale) { stale = false; rebuild(); } else if (ctx.state !== 'running') revive(); }, true));

  return {
    play(name) {
      if (mode === 0 || !R[name]) return;
      const now = performance.now();
      if (now - (lastPlayed[name] || 0) < (name === 'tap' ? 40 : 60)) return;
      lastPlayed[name] = now;
      setTimeout(() => {   // never run audio work inside a touch/drag handler
        try { const c = ensure(); if (c && c.state === 'running') R[name](); } catch {}   // a sleeping engine is woken for next time; stale sounds are dropped, not queued
      }, 0);
    },
    // recorded-style voice clips (generated once, shipped as small mp3 files): resolves true if played, false if they can't be
    clips: {},
    async clip(name) {
      if (mode === 0) return true;
      try {
        const c = ensure(); if (!c) return false;
        if (!this.clips[name]) this.clips[name] = fetch('/audio/' + name + '.mp3').then((r) => { if (!r.ok) throw new Error('clip'); return r.arrayBuffer(); }).then((b) => new Promise((res, rej) => c.decodeAudioData(b, res, rej)));
        const buf = await this.clips[name];
        if (c.state !== 'running') return false;
        const src = c.createBufferSource(), g = c.createGain();
        src.buffer = buf; g.gain.value = 1.1; src.connect(g); g.connect(sfxBus); src.start();
        return true;
      } catch { delete this.clips[name]; return false; }
    },
    unlock() { ensure(); silentClip(); applyMode(); },
    get mode() { return mode; },
    setMode(m) { mode = m; try { localStorage.setItem('sct-snd', String(m)); } catch {} if (ensure()) applyMode(); },
    cycle() { this.setMode((mode + 1) % 3); return mode; },
    state() { return ctx ? ctx.state : 'none'; },
    names: Object.keys(R),
    async render(name, sec = 2.5) {   // for testing: renders a sound offline and reports its loudness
      const saved = { ctx, master, sfxBus, musBus, noiseBuf };
      const off = new OfflineAudioContext(1, Math.ceil(44100 * sec), 44100);
      ctx = off; build(off);
      try {
        if (name === 'music') { musBus.gain.value = 0.4; for (let i = 0; i < Math.ceil(sec / EIGHTH); i++) musicStep(i, i * EIGHTH); }
        else R[name]();
        const d = (await off.startRendering()).getChannelData(0);
        let peak = 0, sum = 0;
        for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; }
        return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4) };
      } finally { ({ ctx, master, sfxBus, musBus, noiseBuf } = saved); }
    },
  };
})();
window.SND = SND;
// browsers only allow audio after a tap: wake the sound engine on the first one
// audio is only woken on touchend/click/keydown (iOS requires that anyway) and never inside a pointerdown, so it can't interfere with a card being picked up
['click', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, () => SND.unlock(), { once: true, capture: true }));
// a soft tick on every button
