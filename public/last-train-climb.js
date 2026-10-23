/* Ghost Climb: a small 3D block parkour course for players who are out, in the spirit of Minecraft parkour.
   Move with the joystick (or WASD / arrow keys), drag to look around, and tap Jump (or Space).
   Reaching the peak lets the ghost learn one traveller's role. Every phone builds the same course from the server's seed.
   Three.js loads only when a climb starts. */
(() => {
  'use strict';
  const THREE_URL = '/vendor/three-0.170.0.module.min.js';
  const GRAVITY = 26, JUMP = 9.2, BOUNCE = 14, SPEED = 4.4, COYOTE = .12, BUFFER = .16, HALF = .3, HEIGHT = .95, EYE = 1.5;
  const THEMES = [
    { name: 'Meadow Isles', sky: 0x8fc8ff, fog: 0xbfe3ff, top: ['#5fae3f', '#4f9a34', '#6cc049'], side: ['#8a6038', '#7a5230', '#96693e'], stone: ['#8a8a8a', '#7a7a7a', '#999999'] },
    { name: 'Frozen Peaks', sky: 0x9fb8e8, fog: 0xd8e6ff, top: ['#f4f8ff', '#e2ecfb', '#ffffff'], side: ['#9fb3cc', '#8ea3bd', '#b0c3da'], stone: ['#7d8aa0', '#6e7a90', '#8c99ae'] },
    { name: 'Ember Rocks', sky: 0x3a1a2a, fog: 0x5a2a30, top: ['#8a2a2a', '#7a2222', '#9a3434'], side: ['#5a1a1e', '#4a1418', '#6a2024'], stone: ['#4a3a3a', '#3e3030', '#584646'] },
  ];
  // A tiny seeded generator, so every phone with the same seed builds the same course.
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // Blocks sit on integer cells; a block's top surface is at y + 0.5.
  function build(seed) {
    const r = rng(seed), theme = THEMES[Math.floor(r() * THEMES.length)], blocks = [], taken = new Set();
    const key = (x, y, z) => x + ',' + y + ',' + z;
    const free = (x, y, z) => ![0, 1, 2, -1].some(dy => taken.has(key(x, y + dy, z)));
    const put = (x, y, z, kind, extra = {}) => { const b = { x, y, z, kind, ...extra }; blocks.push(b); taken.add(key(x, y, z)); return b; };
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) put(x, 0, z, 'grass');
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    let d = 0, x = 0, y = 0, z = 0;
    const turn = () => { if (r() < .35) d = (d + (r() < .5 ? 1 : 3)) % 4; };
    const sections = ['hops', 'lift', 'slime'].sort(() => r() - .5);
    for (const kind of sections) {
      if (kind === 'lift') {
        for (let i = 0; i < 2; i++) {
          turn(); const [dx, dz] = dirs[d];
          // A plank lift slides along the path; hop on when it is close, hop off when it reaches the far side.
          const cx = x + dx * 3, cz = z + dz * 3; put(cx, y, cz, 'lift', { ax: dx, az: dz, amp: 1.4, period: 4.2 + r(), phase: r() * 6.28 });
          x = cx + dx * 3; z = cz + dz * 3; put(x, y, z, 'stone');
        }
      } else if (kind === 'slime') {
        for (let i = 0; i < 2; i++) {
          turn(); const [dx, dz] = dirs[d];
          x += dx * 2; z += dz * 2; put(x, y, z, 'slime');
          x += dx * 2; z += dz * 2; y += 3; put(x, y, z, 'stone');
          // A wider landing after the bounce.
          if (!taken.has(key(x + Math.abs(dz), y, z + Math.abs(dx)))) put(x + Math.abs(dz), y, z + Math.abs(dx), 'stone', { wide: true });
        }
      } else {
        for (let i = 0; i < 4; i++) {
          let placed = false;
          for (let tries = 0; tries < 12 && !placed; tries++) {
            turn(); const [dx, dz] = dirs[d], up = r() < .5 ? 1 : 0, len = up || r() < .7 ? 2 : 3, side = 0;
            const nx = x + dx * len + (dz ? side : 0), nz = z + dz * len + (dx ? side : 0), ny = y + up;
            if (!free(nx, ny, nz)) continue;
            x = nx; y = ny; z = nz; put(x, y, z, 'stone'); placed = true;
            // Two blocks wide, so every landing is a generous target.
            if (!taken.has(key(x + Math.abs(dz), y, z + Math.abs(dx)))) put(x + Math.abs(dz), y, z + Math.abs(dx), 'stone', { wide: true });
          }
        }
      }
      // A golden checkpoint pad after every section.
      turn(); const [dx, dz] = dirs[d]; x += dx * 3; z += dz * 3;
      for (const [ox, oz] of [[0, 0], [dx ? 0 : 1, dz ? 0 : 1]]) put(x + ox, y, z + oz, 'gold');
    }
    blocks.filter(b => b.kind === 'gold').slice(-2).forEach(b => { b.kind = 'peak'; });
    return { theme, blocks, top: y };
  }
  // Every jump on a course is proven with the real physics before it is used: a few ways of approaching it,
  // and for lifts, a range of moments to hop on. A course that fails is skipped for the next seed in a fixed order,
  // so every phone still builds the same course.
  function jumpPossible(seed, ai, bi, o) {
    const { blocks } = build(seed), A = blocks[ai], B = blocks[bi]; let landed = false, bounced = false;
    const sim = simulate(blocks, { land: b => { if (b === B) landed = true; }, bounce: () => { bounced = true; } });
    let now = o.t0 * 1000; sim.step(0, now, 0, 0, false);
    const dx0 = B.cx - A.cx, dz0 = B.cz - A.cz, l0 = Math.hypot(dx0, dz0) || 1;
    sim.place({ x: A.cx + dx0 / l0 * o.off, y: A.y + .5, z: A.cz + dz0 / l0 * o.off });
    if (A.kind === 'slime') sim.me.vy = BOUNCE;
    for (let i = 0; i < 240; i++) {
      now += 1000 / 60; const dx = B.cx - sim.me.x, dz = B.cz - sim.me.z, dist = Math.hypot(dx, dz), go = dist > .05 && (!o.wait || !sim.me.ground || dist < o.wait);
      sim.step(1 / 60, now, go ? dx / dist : 0, go ? dz / dist : 0, !!sim.me.ground && go && dist < o.j);
      if (landed || (B.kind === 'slime' && bounced)) return true;
      if (sim.me.y < Math.min(A.y, B.y) - 3 || sim.me.y <= sim.floor) return false;
    }
    return false;
  }
  function playable(seed) {
    const { blocks } = build(seed), path = blocks.map((b, i) => i).slice(9).filter(i => !blocks[i].wide), pairs = [[4, path[0]]];
    for (let k = 0; k < path.length - 1; k++) { const a = blocks[path[k]], b = blocks[path[k + 1]]; if (['gold', 'peak'].includes(a.kind) && a.kind === b.kind && a.y === b.y) continue; pairs.push([path[k], path[k + 1]]); }
    return pairs.every(([ai, bi]) => { const lift = blocks[ai].kind === 'lift' || blocks[bi].kind === 'lift';
      for (const t0 of lift ? [0, .4, .8, 1.2, 1.6, 2, 2.4, 2.8, 3.2, 3.6] : [0]) for (const off of [0, .3, .45]) for (const j of [3, 2.7, 2.4, 2.1, 1.8, 1.5, 1.2, .9]) for (const wait of lift && blocks[ai].kind !== 'lift' ? [0, 1.8, 2.2] : [0])
        if (jumpPossible(seed, ai, bi, { t0, off, j, wait })) return true;
      return false; });
  }
  function course(seed) {
    for (let k = 0; k < 16; k++) { const s = (seed + k * 7919) >>> 0; if (playable(s)) return build(s); }
    return build(seed);
  }

  // The physics, separate from drawing so tests can run it without a screen. Movement (mx, mz) is a world direction, length ≤ 1.
  function simulate(blocks, on = {}) {
    const me = { x: 0, y: .5, z: 0, vx: 0, vy: 0, vz: 0, ground: null, coyote: 0, face: 0, jumped: false };
    const floor = Math.min(...blocks.map(b => b.y)) - .5;
    for (const b of blocks) { b.cx ??= b.x; b.cz ??= b.z; }
    const liftPos = (b, now) => { const k = Math.sin(now / 1000 * 6.283 / b.period + b.phase) * b.amp; return [b.x + b.ax * k, b.z + b.az * k]; };
    const overlaps = b => Math.abs(me.x - b.cx) < .5 + HALF && Math.abs(me.z - b.cz) < .5 + HALF && me.y < b.y + .5 && me.y + HEIGHT > b.y - .5;
    const wall = b => Math.abs(me.x - b.cx) < .5 + HALF && Math.abs(me.z - b.cz) < .5 + HALF && me.y < b.y + .5 - .02 && me.y + HEIGHT > b.y - .5 + .02;
    function step(dt, now, mx, mz, wantJump) {
      // Lifts move first and carry whoever stands on them.
      for (const b of blocks) if (b.kind === 'lift') { const [nx, nz] = liftPos(b, now); if (me.ground === b) { me.x += nx - b.cx; me.z += nz - b.cz; } b.cx = nx; b.cz = nz; }
      const grip = me.ground ? 16 : 9; me.vx += (mx * SPEED - me.vx) * Math.min(1, dt * grip); me.vz += (mz * SPEED - me.vz) * Math.min(1, dt * grip);
      if (Math.hypot(mx, mz) > .1) me.face = Math.atan2(me.vx, me.vz);
      me.coyote = me.ground ? COYOTE : me.coyote - dt; me.jumped = false;
      if (wantJump && me.coyote > 0) { me.vy = JUMP; me.ground = null; me.coyote = 0; me.jumped = true; on.jump?.(); }
      me.vy = Math.max(-30, me.vy - GRAVITY * dt);
      const near = blocks.filter(b => Math.abs(b.cx - me.x) < 3 && Math.abs(b.cz - me.z) < 3 && Math.abs(b.y - me.y) < 4);
      // Vertical first (land or bump), then sideways, so standing on a block never reads as hitting a wall.
      me.ground = null; me.y += me.vy * dt;
      for (const b of near) if (overlaps(b)) {
        if (me.vy <= 0) {
          me.y = b.y + .5; me.vy = 0; me.ground = b;
          if (b.kind === 'slime') { me.vy = BOUNCE; me.ground = null; on.bounce?.(); }
          on.land?.(b);
        } else { me.y = b.y - .5 - HEIGHT - 1e-3; me.vy = 0; }
      }
      me.x += me.vx * dt; for (const b of near) if (wall(b)) { me.x = me.vx > 0 ? b.cx - .5 - HALF - 1e-3 : b.cx + .5 + HALF + 1e-3; me.vx = 0; }
      me.z += me.vz * dt; for (const b of near) if (wall(b)) { me.z = me.vz > 0 ? b.cz - .5 - HALF - 1e-3 : b.cz + .5 + HALF + 1e-3; me.vz = 0; }
      // Falling into the void sends the ghost back to the last checkpoint.
      // Missing a jump lands on the grass floor, which sends the ghost back to its last block.
      if (me.y < floor) { me.y = floor; me.vy = 0; on.fell?.(); }
    }
    const place = p => Object.assign(me, { x: p.x, y: p.y + .05, z: p.z, vx: 0, vy: 0, vz: 0, ground: null });
    return { me, step, place, floor };
  }

  let threePromise = null;
  const loadThree = () => threePromise ||= import(THREE_URL);

  window.createGhostClimb = ({ seed, sfx, onFinish, onClose }) => {
    const d = document.createElement('dialog'); d.className = 'lt-dialog climb-dialog climb-3d'; d.setAttribute('aria-label', 'Ghost Climb');
    d.innerHTML = '<div class="climb-head"><div><small class="climb-theme">GHOST CLIMB</small><b>Reach The Peak</b></div><button type="button" class="climb-view" aria-pressed="false"></button><span class="climb-time">0.0s</span><button type="button" class="climb-close" aria-label="Leave the climb">×</button></div>'
      + '<div class="climb-stage"><canvas></canvas><div class="climb-progress"><i></i></div><i class="climb-cross" aria-hidden="true"></i><p class="climb-toast">Loading the course…</p>'
      + '<div class="climb-stick" aria-label="Move"><i></i></div><button type="button" class="climb-jump" aria-label="Jump">JUMP</button>'
      + '<p class="climb-hint">Drag to look · Stick to move · Jump</p></div>';
    document.body.append(d); d.showModal();
    const canvas = d.querySelector('canvas'), stage = d.querySelector('.climb-stage'), timeEl = d.querySelector('.climb-time'), bar = d.querySelector('.climb-progress i'), toast = d.querySelector('.climb-toast');
    let closed = false, raf = 0, renderer = null, camera = null;
    function say(text, ms = 1400) { toast.textContent = text; toast.hidden = false; clearTimeout(say.t); if (ms) say.t = setTimeout(() => { toast.hidden = true; }, ms); }
    function close() { if (closed) return; closed = true; cancelAnimationFrame(raf); removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); removeEventListener('resize', resize); try { renderer?.dispose(); } catch {} d.close(); d.remove(); }
    d.querySelector('.climb-close').onclick = () => { close(); onClose?.(); };
    d.addEventListener('cancel', e => { e.preventDefault(); close(); onClose?.(); });

    // Input: a virtual stick, a jump button, drag-to-look, and the keyboard.
    const input = { mx: 0, mz: 0, jump: 0, keys: new Set() }, look = { yaw: Math.PI * .25, pitch: .4 };
    // First person (like Minecraft) by default: the view always faces where you walk. Third person follows behind.
    const PITCH = { first: [-1, 1.4], third: [.08, 1.2] }, viewBtn = d.querySelector('.climb-view');
    let view = 'first'; try { if (localStorage.getItem('lt-climb-view') === 'third') view = 'third'; } catch {}
    function setView(next) {
      view = next; stage.classList.toggle('first-person', view === 'first'); viewBtn.textContent = view === 'first' ? 'Third Person' : 'First Person';
      viewBtn.setAttribute('aria-label', 'Switch to ' + viewBtn.textContent.toLowerCase()); look.pitch = view === 'first' ? .4 : .5;
      try { localStorage.setItem('lt-climb-view', view); } catch {}
    }
    viewBtn.onclick = () => setView(view === 'first' ? 'third' : 'first');
    const stick = d.querySelector('.climb-stick'), knob = stick.firstChild;
    let stickId = null;
    const stickMove = e => { const rc = stick.getBoundingClientRect(), cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2, R = rc.width / 2;
      let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      input.mx = dx; input.mz = dy; knob.style.transform = 'translate(' + dx * R * .55 + 'px,' + dy * R * .55 + 'px)'; };
    stick.addEventListener('pointerdown', e => { e.preventDefault(); stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); });
    stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) stickMove(e); });
    for (const t of ['pointerup', 'pointercancel']) stick.addEventListener(t, e => { if (e.pointerId !== stickId) return; stickId = null; input.mx = input.mz = 0; knob.style.transform = ''; });
    const jumpBtn = d.querySelector('.climb-jump');
    jumpBtn.addEventListener('pointerdown', e => { e.preventDefault(); input.jump = BUFFER; jumpBtn.classList.add('down'); });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) jumpBtn.addEventListener(t, () => jumpBtn.classList.remove('down'));
    let lookId = null, lastX = 0, lastY = 0;
    canvas.addEventListener('pointerdown', e => { lookId = e.pointerId; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (e.pointerId !== lookId) return; look.yaw -= (e.clientX - lastX) * .008; look.pitch = Math.max(PITCH[view][0], Math.min(PITCH[view][1], look.pitch + (e.clientY - lastY) * .006)); lastX = e.clientX; lastY = e.clientY; });
    for (const t of ['pointerup', 'pointercancel']) canvas.addEventListener(t, e => { if (e.pointerId === lookId) lookId = null; });
    function onKey(e) {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (![' ', 'w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'q', 'e'].includes(k)) return;
      e.preventDefault(); if (e.type === 'keydown') { input.keys.add(k); if (k === ' ') input.jump = BUFFER; } else input.keys.delete(k);
    }
    addEventListener('keydown', onKey); addEventListener('keyup', onKey); setView(view);
    function resize() { if (!renderer) return; const rc = stage.getBoundingClientRect(); renderer.setSize(rc.width, rc.height, false); camera.aspect = rc.width / Math.max(1, rc.height); camera.updateProjectionMatrix(); }

    // Building and checking the course takes a moment, so it happens after the screen opens.
    let theme, blocks, top;
    new Promise(done => setTimeout(done, 30)).then(() => { ({ theme, blocks, top } = course(seed)); d.querySelector('.climb-theme').textContent = theme.name.toUpperCase(); return loadThree(); }).then(THREE => {
      if (closed) return;
      try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false }); } catch { say('This browser cannot show the 3D climb.', 0); return; }
      renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
      const scene = new THREE.Scene(); scene.background = new THREE.Color(theme.sky); scene.fog = new THREE.Fog(theme.fog, 14, 46);
      camera = new THREE.PerspectiveCamera(62, 1, .1, 200);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.15));
      const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(6, 12, 4); scene.add(sun);
      // Pixel textures drawn on a 16×16 canvas, sharp like Minecraft.
      const texture = paint => { const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'); paint(g); const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; };
      const noise = (cols, r2 = rng(cols.join().length * 977)) => g => { for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { g.fillStyle = cols[Math.floor(r2() * cols.length)]; g.fillRect(i, j, 1, 1); } };
      const mat = paint => new THREE.MeshLambertMaterial({ map: texture(paint) });
      const grassSide = mat(g => { noise(theme.side)(g); const r2 = rng(5); for (let i = 0; i < 16; i++) { g.fillStyle = theme.top[i % 3]; g.fillRect(i, 0, 1, 3 + Math.floor(r2() * 2)); } });
      const M = {
        grass: [grassSide, grassSide, mat(noise(theme.top)), mat(noise(theme.side)), grassSide, grassSide],
        stone: mat(noise(theme.stone)),
        gold: mat(g => { noise(['#f6d55c', '#e8c040', '#fbe38a'])(g); g.fillStyle = '#c8962a'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1); g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16); }),
        peak: mat(g => { noise(['#8ff0ff', '#5fd8f0', '#c8fbff'])(g); g.fillStyle = '#2aa8c8'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1); }),
        lift: mat(g => { noise(['#b07a40', '#9a6a36', '#c48a4a'])(g); g.fillStyle = '#6a4420'; for (const yy of [0, 5, 10, 15]) g.fillRect(0, yy, 16, 1); }),
        slime: new THREE.MeshLambertMaterial({ map: texture(noise(['#7fdc5a', '#6fcc4a', '#9af07a'])), transparent: true, opacity: .85 }),
      };
      const box = new THREE.BoxGeometry(1, 1, 1);
      for (const b of blocks) { b.mesh = new THREE.Mesh(box, M[b.kind] || M.stone); b.mesh.position.set(b.x, b.y, b.z); scene.add(b.mesh); b.cx = b.x; b.cz = b.z; }
      // A grass floor under the whole course: something to judge jumps against, and a soft landing after a miss.
      const xs = blocks.map(b => b.x), zs = blocks.map(b => b.z), span = Math.max(...xs) - Math.min(...xs) + 40, depth = Math.max(...zs) - Math.min(...zs) + 40;
      const grassTex = texture(noise(theme.top)); grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(span, depth);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, depth), new THREE.MeshLambertMaterial({ map: grassTex }));
      ground.rotation.x = -Math.PI / 2; ground.position.set((Math.max(...xs) + Math.min(...xs)) / 2, Math.min(...blocks.map(b => b.y)) - .5, (Math.max(...zs) + Math.min(...zs)) / 2); scene.add(ground);
      // The flag on the peak, and a few blocky clouds.
      const peak = blocks.find(b => b.kind === 'peak');
      const pole = new THREE.Mesh(new THREE.BoxGeometry(.08, 2.2, .08), new THREE.MeshLambertMaterial({ color: 0xf3eadb })); pole.position.set(peak.x, peak.y + 1.6, peak.z); scene.add(pole);
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(.9, .55, .04), new THREE.MeshLambertMaterial({ color: 0xffd36a, emissive: 0x6a4a10 })); cloth.position.set(peak.x + .48, peak.y + 2.4, peak.z); scene.add(cloth);
      const r3 = rng(seed ^ 0x5bd1e995);
      for (let i = 0; i < 14; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(3 + r3() * 4, .6, 2 + r3() * 3), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: .8 })); c.position.set((r3() - .5) * 60, top + 4 + r3() * 10, (r3() - .5) * 60); scene.add(c); }
      // The ghost: a blocky sheet with eyes, plus a soft shadow so jumps are easy to judge.
      const ghost = new THREE.Group(), sheet = new THREE.MeshLambertMaterial({ color: 0xf6f3ff, emissive: 0x3a3360, transparent: true, opacity: .93 });
      ghost.add(new THREE.Mesh(new THREE.BoxGeometry(.6, .8, .6), sheet));
      for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.BoxGeometry(.1, .16, .02), new THREE.MeshBasicMaterial({ color: 0x2a1d55 })); eye.position.set(s * .13, .12, .31); ghost.add(eye); }
      for (let i = 0; i < 3; i++) { const t2 = new THREE.Mesh(new THREE.BoxGeometry(.18, .14, .6), sheet); t2.position.set(-.2 + i * .2, -.46, 0); ghost.add(t2); }
      scene.add(ghost);
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(.34, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .35, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

      let safe = { x: 0, y: .5, z: 0 }, t0 = performance.now(), last = t0, finished = false, falls = 0, reached = -1, pads = 0;
      const camPos = new THREE.Vector3(), path = blocks.slice(9).filter(b => !b.wide);
      // The next block to jump to glows, and after a fall the view turns to face it.
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true }));
      scene.add(outline);
      const next = () => path[Math.min(path.length - 1, reached + 1)];
      const faceNext = () => { const b = next(); look.yaw = Math.atan2(-(b.cx - me.x), -(b.cz - me.z)); };
      const sim = simulate(blocks, {
        jump: () => sfx?.play('tap'), bounce: () => sfx?.play('pop'),
        land: b => {
          // Falling puts you back on the last solid block you stood on.
          if (['grass', 'stone', 'gold', 'peak'].includes(b.kind)) safe = { x: b.x, y: b.y + .5, z: b.z };
          const i = path.indexOf(b.wide ? path.find(q => q.y === b.y && Math.abs(q.x - b.x) + Math.abs(q.z - b.z) === 1) : b);
          if (i > reached) { reached = i; if (b.kind === 'gold' && path[i - 1]?.kind !== 'gold') { pads++; say('Section ' + pads + ' cleared!'); sfx?.play('chime'); } }
          if (b.kind === 'peak' && !finished) { finished = true; win(); }
        },
        fell: () => { falls++; sim.place(safe); faceNext(); say('Whoops! Try that jump again.'); sfx?.play('tick'); },
      });
      const me = sim.me;
      function step(dt, now) {
        const k = input.keys, fwd = (k.has('w') || k.has('ArrowUp') ? 1 : 0) - (k.has('s') || k.has('ArrowDown') ? 1 : 0) - input.mz, strafe = (k.has('d') || k.has('ArrowRight') ? 1 : 0) - (k.has('a') || k.has('ArrowLeft') ? 1 : 0) + input.mx;
        if (k.has('q')) look.yaw += dt * 2; if (k.has('e')) look.yaw -= dt * 2;
        // In third person the camera swings in behind the ghost while it walks forward.
        if (view === 'third' && lookId === null && fwd > .3 && me.ground) { const want = me.face + Math.PI, diff = (want - look.yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI; look.yaw += diff * Math.min(1, dt * 2.2); }
        // Movement is relative to where the camera looks: forward walks away from the camera.
        const n = Math.max(1, Math.hypot(fwd, strafe)), fx = -Math.sin(look.yaw), fz = -Math.cos(look.yaw);
        sim.step(dt, now, (fx * fwd - fz * strafe) / n, (fz * fwd + fx * strafe) / n, input.jump > 0);
        input.jump = me.jumped ? 0 : input.jump - dt;
      }
      function draw(now) {
        for (const b of blocks) {
          b.mesh.position.set(b.cx, b.y, b.cz);
        }
        cloth.rotation.y = Math.sin(now / 300) * .25;
        ghost.position.set(me.x, me.y + .5 + (me.ground ? Math.sin(now / 300) * .03 : 0), me.z);
        ghost.rotation.y += ((me.face - ghost.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * .2;
        // Shadow on the highest surface below the ghost.
        let floor = sim.floor; for (const b of blocks) if (Math.abs(b.cx - me.x) < .5 + HALF * .6 && Math.abs(b.cz - me.z) < .5 + HALF * .6 && b.y + .5 <= me.y + .01) floor = Math.max(floor, b.y + .5);
        { shadow.position.set(me.x, floor + .01, me.z); const h = me.y - floor; shadow.scale.setScalar(Math.max(.4, 1 - h * .12)); shadow.material.opacity = Math.max(.1, .4 - h * .05); }
        const nb = next(); outline.position.copy(nb.mesh.position); outline.visible = !finished; outline.material.opacity = .55 + Math.sin(now / 220) * .35;
        ghost.visible = view === 'third';
        if (view === 'first') {
          // Eyes at Minecraft height, so block tops stay in view; pitch above zero looks down.
          const cp = Math.cos(look.pitch); camera.position.set(me.x, me.y + EYE, me.z);
          camera.lookAt(me.x - Math.sin(look.yaw) * cp, me.y + EYE - Math.sin(look.pitch), me.z - Math.cos(look.yaw) * cp);
        } else {
          const dist = 5.6; camPos.set(me.x + Math.sin(look.yaw) * Math.cos(look.pitch) * dist, me.y + .8 + Math.sin(look.pitch) * dist, me.z + Math.cos(look.yaw) * Math.cos(look.pitch) * dist);
          camera.position.lerp(camPos, .25); camera.lookAt(me.x, me.y + .6, me.z);
        }
        renderer.render(scene, camera);
        bar.style.width = (Math.max(0, Math.min(1, (me.y - .5) / Math.max(1, top))) * 100).toFixed(1) + '%';
      }
      function frame(now) {
        const dt = Math.max(0, Math.min(.033, (now - last) / 1000)); last = Math.max(last, now);
        if (!finished) { step(dt, now); timeEl.textContent = ((now - t0) / 1000).toFixed(1) + 's'; }
        draw(now); raf = requestAnimationFrame(frame);
      }
      function win() { sfx?.play('good'); say('You reached the peak!', 0); setTimeout(() => { close(); onFinish({ seconds: (performance.now() - t0) / 1000, falls }); }, 1000); }
      // Read-only handle for automated tests.
      d.climb = { me, blocks, look, input };
      resize(); addEventListener('resize', resize); toast.hidden = true; t0 = last = performance.now();
      faceNext(); camera.position.set(me.x + 4, me.y + 3, me.z + 4); raf = requestAnimationFrame(frame);
    }).catch(() => say('The climb could not load. Check your connection and try again.', 0));
    return { close };
  };
  window.ghostClimbCourse = course;
  window.ghostClimbSim = simulate;
})();
