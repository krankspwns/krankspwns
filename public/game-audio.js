// Sound for the games that have none of their own (Bridge, Last Laugh, Grand Con): small synthesised effects and a looping
// background tune per game. Nothing is downloaded. Audio starts only after a tap (browser rule) and can be turned off.
(() => {
  'use strict';
  const KEY = 'kp-audio';
  const THEMES = {
    bridge: { name: 'Hidden Alliance', wave: 'triangle', lead: 'sine', root: 196, scale: [0, 2, 4, 5, 7, 9, 11], bpm: 84, bass: [0, -5, -3, -7],
      tune: [[4, 1], [2, 1], [0, 2], [2, 1], [4, 1], [7, 2], [5, 1], [4, 1], [2, 2], [0, 1], [2, 1], [4, 2]] },
    'hot-joker': { name: 'Last Laugh', wave: 'square', lead: 'triangle', mwave: 'sine', vol: 0.07, root: 220, scale: [0, 2, 4, 7, 9], bpm: 92, bass: [0, 0, 7, 5],
      tune: [[0, 0.5], [2, 0.5], [4, 0.5], [2, 0.5], [7, 1], [4, 1], [9, 0.5], [7, 0.5], [4, 0.5], [2, 0.5], [0, 1], [4, 1]] },
    'grand-con': { name: 'Grand Con', wave: 'sawtooth', lead: 'triangle', root: 164.81, scale: [0, 2, 3, 5, 7, 8, 10], bpm: 72, bass: [0, 0, -4, -2],
      tune: [[0, 2], [2, 1], [3, 1], [4, 2], [2, 1], [0, 1], [-2, 2], [0, 1], [2, 1], [3, 3]] },
  };
  const game = ({ '/bridge.html': 'bridge', '/hot-joker.html': 'hot-joker', '/grand-con.html': 'grand-con' })[location.pathname] || null;
  let prefs = { sfx: true, music: true }; try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} };
  let ctx = null, master = null, musicGain = null, timer = null, step = 0, nextAt = 0, playing = false;
  const theme = () => THEMES[game] || THEMES.bridge;
  const hz = (degree, octave = 0) => { const t = theme(), n = t.scale.length, d = ((degree % n) + n) % n, o = Math.floor(degree / n); return t.root * Math.pow(2, (t.scale[d] + 12 * (o + octave)) / 12); };
  function boot() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master); return true;
  }
  function tone(freq, start, dur, { type = 'sine', gain = 0.2, to = null, dest = master } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, start); if (to) o.frequency.exponentialRampToValueAtTime(to, start + dur);
    g.gain.setValueAtTime(0.0001, start); g.gain.exponentialRampToValueAtTime(gain, start + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(dest); o.start(start); o.stop(start + dur + 0.05);
  }
  function noise(start, dur, gain = 0.15, hp = 1200) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur)), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = gain; s.connect(f); f.connect(g); g.connect(master); s.start(start);
  }
  // effect name -> notes. Each game plays them in its own voice (waveform and key).
  const SFX = {
    tap: (t, w) => tone(hz(4, 1), t, 0.06, { type: w, gain: 0.08 }),
    deal: (t) => { noise(t, 0.05, 0.2, 2500); noise(t + 0.07, 0.05, 0.14, 2500); },
    turn: (t, w) => { tone(hz(0, 1), t, 0.18, { type: w, gain: 0.12 }); tone(hz(4, 1), t + 0.1, 0.25, { type: w, gain: 0.1 }); },
    play: (t, w) => { noise(t, 0.04, 0.16, 1800); tone(hz(2, 0), t, 0.1, { type: w, gain: 0.1, to: hz(0, 0) }); },
    good: (t, w) => [0, 2, 4].forEach((d, i) => tone(hz(d, 1), t + i * 0.08, 0.2, { type: w, gain: 0.13 })),
    bad: (t, w) => { tone(hz(2, 0), t, 0.25, { type: w, gain: 0.12, to: hz(-3, 0) }); },
    win: (t, w) => [0, 2, 4, 7, 9].forEach((d, i) => tone(hz(d, 1), t + i * 0.1, 0.35, { type: w, gain: 0.14 })),
    lose: (t, w) => [4, 2, 0, -3].forEach((d, i) => tone(hz(d, 0), t + i * 0.16, 0.4, { type: w, gain: 0.12 })),
    reveal: (t, w) => { tone(hz(-2, 0), t, 0.6, { type: w, gain: 0.1, to: hz(5, 1) }); noise(t + 0.5, 0.2, 0.1, 3000); },
    coin: (t) => { tone(1318, t, 0.08, { type: 'square', gain: 0.07 }); tone(1760, t + 0.07, 0.22, { type: 'square', gain: 0.07 }); },
    pop: (t) => tone(520, t, 0.12, { type: 'sine', gain: 0.18, to: 1040 }),
    whoosh: (t) => { noise(t, 0.35, 0.18, 700); tone(300, t, 0.3, { type: 'sine', gain: 0.08, to: 80 }); },
    error: (t) => { tone(160, t, 0.18, { type: 'sawtooth', gain: 0.08 }); },
    // one little sound for each drawn reaction (same feel as Crown Clash)
    emo_laugh: (t) => [0, 1, 2, 3, 4].forEach((i) => { noise(t + i * 0.12, 0.04, 0.08, 2400); tone(330 - i * 14, t + i * 0.12, 0.1, { type: 'triangle', gain: 0.16 - i * 0.02, to: 290 - i * 16 }); }),
    emo_wow: (t) => { tone(260, t, 0.38, { gain: 0.2, to: 980 }); tone(520, t + 0.02, 0.34, { type: 'triangle', gain: 0.08, to: 1960 }); },
    emo_cry: (t) => [[620, 480], [540, 360]].forEach(([f, to], i) => tone(f, t + i * 0.32, 0.3, { gain: 0.1, to })),
    emo_cool: (t) => { tone(330, t, 0.18, { type: 'triangle', gain: 0.1, to: 392 }); tone(494, t + 0.18, 0.38, { type: 'triangle', gain: 0.1 }); },
    emo_fire: (t) => { noise(t, 0.6, 0.14, 800); for (let i = 0; i < 8; i++) noise(t + 0.05 + i * 0.06, 0.03, 0.12, 2500); },
    emo_rip: (t) => [196, 185, 175, 147].forEach((f, i) => tone(f, t + i * 0.2, i === 3 ? 0.5 : 0.18, { type: 'sawtooth', gain: 0.08, to: f * (i === 3 ? 0.9 : 1) })),
    emo_angry: (t) => { tone(95, t, 0.5, { type: 'sawtooth', gain: 0.2, to: 70 }); noise(t, 0.45, 0.12, 300); },
    emo_think: (t) => { tone(220, t, 0.5, { gain: 0.14, to: 232 }); tone(330, t + 0.5, 0.22, { type: 'triangle', gain: 0.13, to: 392 }); },
    emo_heart: (t) => { [0, 0.15].forEach((d) => tone(110, t + d, 0.16, { gain: 0.22, to: 55 })); [659, 784, 988, 1319].forEach((f, i) => tone(f, t + 0.38 + i * 0.11, i === 3 ? 0.9 : 0.5, { gain: 0.07 })); },
    emo_trophy: (t) => [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.11, i === 3 ? 0.5 : 0.14, { type: 'square', gain: 0.07 })),
  };
  function sfx(name) {
    if (!prefs.sfx || !boot() || !SFX[name]) return;
    const t = ctx.currentTime + 0.01; SFX[name](t, theme().wave);
  }
  // background music: a looping tune with a bass line, scheduled a little ahead of time
  function schedule() {
    const t = theme(), beat = 60 / t.bpm;
    while (nextAt < ctx.currentTime + 0.3) {
      const [deg, len] = t.tune[step % t.tune.length];
      tone(hz(deg, 1), nextAt, len * beat * 0.9, { type: t.lead, gain: 0.5, dest: musicGain });
      if (step % 2 === 0) tone(hz(t.bass[(step / 2 | 0) % t.bass.length] , -1), nextAt, len * beat * 1.8, { type: t.mwave || t.wave, gain: 0.45, dest: musicGain });
      nextAt += len * beat; step++;
    }
  }
  function startMusic() {
    if (!game || !prefs.music || playing || document.hidden || !boot()) return;
    playing = true; nextAt = ctx.currentTime + 0.1; step = 0; musicGain.gain.cancelScheduledValues(0); musicGain.gain.setTargetAtTime(theme().vol || 0.16, ctx.currentTime, 0.3);
    timer = setInterval(schedule, 120); schedule();
  }
  function stopMusic() { if (!playing) return; playing = false; clearInterval(timer); if (ctx) musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopMusic(); else startMusic(); });
  // browsers only allow sound after a tap: the first one starts the music, and every button gives a click
  document.addEventListener('pointerdown', (e) => { startMusic(); if (e.target.closest?.('button, [role=button], a')) sfx('tap'); }, true);
  // one shared header dropdown (same look as Crown Clash's sound control). A single element is reused, so it survives the games' re-renders.
  let menuHost = null;
  const MODES = [['volume-x', 'Sound off'], ['volume-2', 'Effects'], ['music', 'Effects + music']];
  const mode = () => (!prefs.sfx ? 0 : prefs.music ? 2 : 1);
  function setMode(m) { prefs.sfx = m > 0; prefs.music = m > 1; save(); if (m > 1) startMusic(); else stopMusic(); if (m > 0) sfx('coin'); drawMenu(); }
  function drawMenu() {
    if (!menuHost) return;
    const h = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; return n; };
    const cur = mode(), open = menuHost.classList.contains('open');
    const btn = h('button', 'pf-ddbtn'); btn.type = 'button'; btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', String(open)); btn.setAttribute('aria-label', 'Sound: ' + MODES[cur][1]); btn.title = 'Sound: ' + MODES[cur][1];
    const caret=window.AvatarArt.icon('caret',11);caret.classList.add('pf-ddcaret');
    btn.append(window.AvatarArt.icon(MODES[cur][0]),caret);
    btn.onclick = (e) => { e.stopPropagation(); document.querySelectorAll('.header-tools .pf-dd.open').forEach(n => { if(n !== menuHost) { n.classList.remove('open'); n.querySelector('button')?.setAttribute('aria-expanded', 'false'); } }); menuHost.classList.toggle('open'); btn.setAttribute('aria-expanded', String(menuHost.classList.contains('open'))); };
    const list = h('div', 'pf-ddmenu'); list.setAttribute('role', 'menu');
    MODES.forEach(([ic, label], m) => {
      const b = h('button', m === cur ? 'on' : ''); b.type = 'button'; b.setAttribute('role', 'menuitemradio'); b.setAttribute('aria-checked', String(m === cur));
      b.append(window.AvatarArt.icon(ic), h('span', '', label)); b.onclick = (e) => { e.stopPropagation(); menuHost.classList.remove('open'); setMode(m); };
      list.append(b);
    });
    menuHost.replaceChildren(btn, list);
  }
  function soundMenu() {
    if (!menuHost) {
      menuHost = document.createElement('div'); menuHost.className = 'pf-dd'; drawMenu();
      document.addEventListener('click', () => { if (menuHost.classList.contains('open')) { menuHost.classList.remove('open'); drawMenu(); } });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuHost.classList.contains('open')) { menuHost.classList.remove('open'); drawMenu(); } });
    }
    return menuHost;
  }
  window.GameAudio = {
    game, prefs: () => ({ ...prefs }), sfx, soundMenu,
    setSfx(on) { prefs.sfx = !!on; save(); if (on) sfx('coin'); drawMenu(); },
    setMusic(on) { prefs.music = !!on; save(); if (on) startMusic(); else stopMusic(); drawMenu(); },
    themeName: () => (game ? theme().name : ''),
  };
})();


