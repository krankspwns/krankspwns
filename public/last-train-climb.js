/* Ghost Climb: a ghost escapes the train by climbing a stack of luggage, carts and platforms to a railway signal.
   Move with the joystick (or WASD / arrow keys), drag to look around, and tap Jump (or Space).
   Reaching the signal lets the ghost learn one traveller's role. Every phone builds the same course from the server's seed.
   Three.js loads only when a climb starts. */
(() => {
  'use strict';
  const THREE_URL = '/vendor/three-0.170.0.module.min.js';
  const GRAVITY = 26, JUMP = 9.2, BOUNCE = 14, SPEED = 4.4, COYOTE = .12, BUFFER = .16, HALF = .3, HEIGHT = .95, EYE = 1.5, BELOW = 2.5;
  // Each world the ghost escapes into: sky, light, floor, luggage style, scenery and music.
  const THEMES = [
    { name: 'Midnight Station', sky: ['#0a1030', '#26306a', '#7a5a9a'], fog: '#2d2f62', hemi: ['#9fb0ff', '#2a1c3a', 1.25], sun: ['#ffe0b0', 1.2], floor: 'platform', bag: 'suitcase',
      colors: ['#c24b3f', '#2f9a93', '#e0aa3e', '#4466c2', '#9a5ab8'], carriage: '#7a1f2b', post: '#4a4f6a', accent: '#ffd36a', scenery: 'city', air: 'stars', song: 0 },
    { name: 'Snowline Pass', sky: ['#4f8fe8', '#9cc4ff', '#ffe0ec'], fog: '#e6eeff', hemi: ['#ffffff', '#7a8fb0', 1.35], sun: ['#fff4e0', 1.1], floor: 'snow', bag: 'crate',
      colors: ['#c8693f', '#d9a050', '#b0563a', '#e2b56a'], carriage: '#1f5a46', post: '#6a5040', accent: '#7fe0ff', scenery: 'mountains', air: 'snow', song: 1 },
    { name: 'Desert Express', sky: ['#ff7a52', '#ffad6e', '#ffe3a8'], fog: '#ffcf9a', hemi: ['#ffe8c8', '#8a5a3a', 1.3], sun: ['#fff0c8', 1.25], floor: 'sand', bag: 'trunk',
      colors: ['#8e4a2f', '#2f7896', '#c8902e', '#6f3f86', '#3f8a55'], carriage: '#2a4a8a', post: '#7a5a3a', accent: '#ffe08a', scenery: 'mesas', air: 'dust', song: 2 },
    { name: 'Furnace Line', sky: ['#120509', '#3a0e14', '#8a3418'], fog: '#4a1a10', hemi: ['#ffb08a', '#2a0a08', 1.15], sun: ['#ffb070', 1.3], floor: 'grate', bag: 'tin',
      colors: ['#c27a3a', '#9aa0aa', '#d4ab2c', '#a8463a'], carriage: '#2a2a32', post: '#3a3236', accent: '#ff9a3a', scenery: 'chimneys', air: 'embers', song: 3 },
  ];
  // A tiny seeded generator, so every phone with the same seed builds the same course.
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // Blocks sit on integer cells; a block's top surface is at y + 0.5. The start is the roof of the last carriage.
  // Every piece reserves the space it needs (a lift's whole track, the air above a bounce) before it is placed,
  // so nothing ever moves through or overlaps anything else.
  function build(seed) {
    const r = rng(seed), theme = THEMES[Math.floor(r() * THEMES.length)], blocks = [], taken = new Set();
    const key = (x, y, z) => x + ',' + y + ',' + z;
    const clear = cells => cells.every(([x, y, z]) => [-1, 0, 1, 2].every(dy => !taken.has(key(x, y + dy, z))));
    const reserve = cells => cells.forEach(([x, y, z]) => taken.add(key(x, y, z)));
    const put = (x, y, z, kind, extra = {}) => { const b = { x, y, z, kind, ...extra }; blocks.push(b); taken.add(key(x, y, z)); return b; };
    for (let x = -6; x <= 1; x++) for (let z = -1; z <= 1; z++) put(x, 0, z, 'roof');
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    let d = 0, x = 1, y = 0, z = 0, bad = false; // from the front edge of the roof
    // Try a few headings for each piece; a course with a piece that never fits is rejected later.
    function piece(plan) {
      for (let tries = 0; tries < 16; tries++) {
        if (tries || r() < .35) d = (d + (r() < .5 ? 1 : 3)) % 4;
        const [dx, dz] = dirs[d], p = plan(dx, dz, Math.abs(dz), Math.abs(dx));
        if (clear(p.need)) { p.place(); return; }
      }
      bad = true;
    }
    const line = (dx, dz, from, to, ys) => { const out = []; for (let k = from; k <= to; k++) for (const yy of ys) out.push([x + dx * k, yy, z + dz * k]); return out; };
    // Five sections: an easy one first, then four from the rest in a random order, each a little harder than the last.
    const easy = ['hops', 'lift', 'slime'][Math.floor(r() * 3)];
    // A Fisher–Yates shuffle with the seeded generator: the same on every browser (sort with a random comparator is not).
    const rest = ['hops', 'lift', 'slime', 'belt', 'elevator', 'beam', 'ice'].filter(k => k !== easy);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    const sections = [easy, ...rest.slice(0, 4)];
    sections.forEach((kind, level) => {
      for (let i = 0; i < (['hops', 'ice'].includes(kind) ? 4 : 2); i++) piece((dx, dz, px, pz) => {
        if (kind === 'lift') {
          // A baggage cart slides along the path; hop on when it is close, hop off when it reaches the far side.
          const track = line(dx, dz, 1, 5, [y]);
          return { need: [...track, ...line(dx, dz, 6, 6, [y])], place: () => {
            const cx = x + dx * 3, cz = z + dz * 3; reserve(track); put(cx, y, cz, 'lift', { ax: dx, az: dz, amp: 1.4, period: 4.2 + r() - level * .25, phase: r() * 6.28 });
            x = cx + dx * 3; z = cz + dz * 3; put(x, y, z, 'stone'); } };
        }
        if (kind === 'slime') {
          // A spring buffer bounces the ghost three levels up onto a landing (narrower later on).
          const land = [x + dx * 4, y + 3, z + dz * 4], side = [land[0] + px, land[1], land[2] + pz], wide = level < 3;
          return { need: [...line(dx, dz, 1, 4, [y, y + 3]), side], place: () => {
            reserve(line(dx, dz, 1, 4, [y + 1, y + 2])); put(x + dx * 2, y, z + dz * 2, 'slime');
            [x, y, z] = land; put(x, y, z, 'stone'); if (wide) put(...side, 'stone', { wide: true }); else reserve([side]); } };
        }
        if (kind === 'belt') {
          // A baggage conveyor: three belts in a row that push sideways (or back), then a gap to the next crate.
          const cells = line(dx, dz, 1, 3, [y]), push = r() < .7 ? (r() < .5 ? 1 : -1) : 0, speed = 1.5 + level * .15;
          const [bx, bz] = push ? [pz * push * speed, px * push * speed] : [-dx * speed * .7, -dz * speed * .7];
          return { need: [...cells, ...line(dx, dz, 4, 5, [y]), [x + dx * 5 + px, y, z + dz * 5 + pz]], place: () => {
            cells.forEach(([cx, cy, cz]) => put(cx, cy, cz, 'belt', { bx, bz, dirX: bx, dirZ: bz }));
            x += dx * 5; z += dz * 5; put(x, y, z, 'stone'); put(x + px, y, z + pz, 'stone', { wide: true }); } };
        }
        if (kind === 'elevator') {
          // A freight elevator: hop on at the bottom, ride up three levels, step off at the top.
          const rise = 3, shaft = [];
          for (let h = 0; h <= rise + 2; h++) shaft.push([x + dx * 2, y + h, z + dz * 2]);
          return { need: [...line(dx, dz, 1, 1, [y, y + rise]), ...shaft, ...line(dx, dz, 3, 4, [y + rise]), [x + dx * 4 + px, y + rise, z + dz * 4 + pz]], place: () => {
            reserve(shaft); put(x + dx * 2, y, z + dz * 2, 'elevator', { rise, period: 5.2 - level * .2, phase: r() * 6.28 });
            [x, y, z] = [x + dx * 4, y + rise, z + dz * 4]; put(x, y, z, 'stone'); put(x + px, y, z + pz, 'stone', { wide: true }); } };
        }
        if (kind === 'beam') {
          // A narrow steel beam three blocks long: walk the line. The second one starts after a small gap.
          const gap = i ? 1 : 0, cells = line(dx, dz, 1 + gap, 3 + gap, [y]);
          return { need: [...line(dx, dz, 1, 4 + gap, [y]), [x + dx * (4 + gap) + px, y, z + dz * (4 + gap) + pz]], place: () => {
            const mid = cells[1]; reserve(cells); put(mid[0], y, mid[2], 'beam', { hx: dx ? 1.5 : .17, hz: dz ? 1.5 : .17 });
            x += dx * (4 + gap); z += dz * (4 + gap); put(x, y, z, 'stone'); put(x + px, y, z + pz, 'stone', { wide: true }); } };
        }
        // Hops, on crates or slippery frosted ice: wide landings early on, longer and narrower later.
        const ice = kind === 'ice', up = !ice && r() < .5 ? 1 : 0, len = up || r() < (ice ? .8 : .7 - level * .1) ? 2 : 3, nx = x + dx * len, ny = y + up, nz = z + dz * len;
        const wide = !ice && r() > level * .2;
        return { need: [...line(dx, dz, 1, len - 1, [y, ny]), [nx, ny, nz], [nx + px, ny, nz + pz]], place: () => {
          [x, y, z] = [nx, ny, nz]; put(x, y, z, ice ? 'ice' : 'stone'); if (wide) put(x + px, y, z + pz, 'stone', { wide: true }); else reserve([[x + px, y, z + pz]]); } };
      });
      // A station platform after every section; the last one carries the signal.
      // Each platform is one level up, so every course really climbs.
      piece((dx, dz, px, pz) => ({ need: [...line(dx, dz, 1, 2, [y, y + 1]), [x + dx * 2 + px, y + 1, z + dz * 2 + pz]], place: () => {
        x += dx * 2; y += 1; z += dz * 2; put(x, y, z, 'gold'); put(x + px, y, z + pz, 'gold', { wide: true }); } }));
    });
    blocks.filter(b => b.kind === 'gold').slice(-2).forEach(b => { b.kind = 'peak'; });
    return { theme, blocks, top: y, bad };
  }
  // The blocks the ghost moves along, in order: the carriage roof and the extra width of wide landings are left out.
  const pathIndexes = blocks => blocks.map((b, i) => i).filter(i => blocks[i].kind !== 'roof' && !blocks[i].wide);
  // Every jump on a course is proven with the real physics before it is used: a few ways of approaching it,
  // and for lifts, a range of moments to hop on. A course that fails is skipped for the next seed in a fixed order,
  // so every phone still builds the same course.
  function jumpPossible(seed, ai, bi, o) {
    const { blocks } = build(seed), A = blocks[ai], B = blocks[bi]; let landed = false, bounced = false;
    const sim = simulate(blocks, { land: b => { if (b === B) landed = true; }, bounce: () => { bounced = true; } });
    let now = o.t0 * 1000; sim.step(0, now, 0, 0, false);
    const dx0 = B.cx - A.cx, dz0 = B.cz - A.cz, l0 = Math.hypot(dx0, dz0) || 1;
    sim.place({ x: A.cx + dx0 / l0 * o.off, y: A.cy + .5, z: A.cz + dz0 / l0 * o.off });
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
    const { blocks, bad } = build(seed); if (bad) return false;
    const path = pathIndexes(blocks), pairs = [[blocks.findIndex(b => b.kind === 'roof' && b.x === 1 && b.z === 0), path[0]]];
    for (let k = 0; k < path.length - 1; k++) { const a = blocks[path[k]], b = blocks[path[k + 1]]; if (['gold', 'peak'].includes(a.kind) && a.kind === b.kind && a.y === b.y) continue; pairs.push([path[k], path[k + 1]]); }
    const moving = b => ['lift', 'elevator'].includes(b.kind);
    return pairs.every(([ai, bi]) => { const lift = moving(blocks[ai]) || moving(blocks[bi]);
      for (const t0 of lift ? [0, .4, .8, 1.2, 1.6, 2, 2.4, 2.8, 3.2, 3.6, 4, 4.4, 4.8] : [0]) for (const off of [0, .3, .45]) for (const j of [3, 2.7, 2.4, 2.1, 1.8, 1.5, 1.2, .9]) for (const wait of lift && !moving(blocks[ai]) ? [0, 1.8, 2.2] : [0])
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
    const floor = Math.min(...blocks.map(b => b.y)) - BELOW;
    // Every block has a centre (cx, cy, cz) that moving pieces update, and half-sizes (hx, hz): narrow beams are thin.
    for (const b of blocks) { b.cx ??= b.x; b.cz ??= b.z; b.cy ??= b.y; b.hx ??= .5; b.hz ??= .5; }
    const liftPos = (b, now) => { const k = Math.sin(now / 1000 * 6.283 / b.period + b.phase) * b.amp; return [b.x + b.ax * k, b.z + b.az * k]; };
    // Freight elevators rise from their level to `rise` blocks higher and back, pausing a little at each end.
    const elevatorY = (b, now) => { const c = Math.cos(now / 1000 * 6.283 / b.period + b.phase); return b.y + b.rise * Math.min(1, Math.max(0, (1 - c) / 2 * 1.2 - .1)); };
    const overlaps = b => Math.abs(me.x - b.cx) < b.hx + HALF && Math.abs(me.z - b.cz) < b.hz + HALF && me.y < b.cy + .5 && me.y + HEIGHT > b.cy - .5;
    const wall = b => Math.abs(me.x - b.cx) < b.hx + HALF && Math.abs(me.z - b.cz) < b.hz + HALF && me.y < b.cy + .5 - .02 && me.y + HEIGHT > b.cy - .5 + .02;
    function step(dt, now, mx, mz, wantJump) {
      // Moving pieces go first and carry whoever stands on them; belts push the ghost along.
      for (const b of blocks) {
        if (b.kind === 'lift') { const [nx, nz] = liftPos(b, now); if (me.ground === b) { me.x += nx - b.cx; me.z += nz - b.cz; } b.cx = nx; b.cz = nz; }
        else if (b.kind === 'elevator') { const ny = elevatorY(b, now); if (me.ground === b) me.y += ny - b.cy; b.cy = ny; }
      }
      if (me.ground?.kind === 'belt') { me.x += me.ground.bx * dt; me.z += me.ground.bz * dt; }
      // Ice barely grips, so the ghost slides; the air gives a little steering.
      const grip = me.ground ? (me.ground.kind === 'ice' ? 2.4 : 16) : 9; me.vx += (mx * SPEED - me.vx) * Math.min(1, dt * grip); me.vz += (mz * SPEED - me.vz) * Math.min(1, dt * grip);
      if (Math.hypot(mx, mz) > .1) me.face = Math.atan2(me.vx, me.vz);
      me.coyote = me.ground ? COYOTE : me.coyote - dt; me.jumped = false;
      if (wantJump && me.coyote > 0) { me.vy = JUMP; me.ground = null; me.coyote = 0; me.jumped = true; on.jump?.(); }
      me.vy = Math.max(-30, me.vy - GRAVITY * dt);
      const near = blocks.filter(b => Math.abs(b.cx - me.x) < 3 + b.hx && Math.abs(b.cz - me.z) < 3 + b.hz && Math.abs(b.cy - me.y) < 4.5);
      // Vertical first (land or bump), then sideways, so standing on a block never reads as hitting a wall.
      me.ground = null; me.y += me.vy * dt;
      for (const b of near) if (overlaps(b)) {
        if (me.vy <= 0) {
          me.y = b.cy + .5; me.vy = 0; me.ground = b;
          if (b.kind === 'slime') { me.vy = BOUNCE; me.ground = null; on.bounce?.(b); }
          on.land?.(b);
        } else { me.y = b.cy - .5 - HEIGHT - 1e-3; me.vy = 0; }
      }
      me.x += me.vx * dt; for (const b of near) if (wall(b)) { me.x = me.vx > 0 ? b.cx - b.hx - HALF - 1e-3 : b.cx + b.hx + HALF + 1e-3; me.vx = 0; }
      me.z += me.vz * dt; for (const b of near) if (wall(b)) { me.z = me.vz > 0 ? b.cz - b.hz - HALF - 1e-3 : b.cz + b.hz + HALF + 1e-3; me.vz = 0; }
      // Missing a jump lands on the floor, which sends the ghost back to its last block.
      if (me.y < floor) { me.y = floor; me.vy = 0; on.fell?.(); }
    }
    const place = p => Object.assign(me, { x: p.x, y: p.y + .05, z: p.z, vx: 0, vy: 0, vz: 0, ground: null });
    return { me, step, place, floor };
  }


  let threePromise = null;
  const loadThree = () => threePromise ||= import(THREE_URL);

  // Painted art: smooth canvas drawings (not pixels), shaded so every block reads as solid, colourful luggage.
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = c => Math.round(Math.max(0, Math.min(255, k > 0 ? c + (255 - c) * k : c * (1 + k)))); return 'rgb(' + f(n >> 16) + ',' + f(n >> 8 & 255) + ',' + f(n & 255) + ')'; };
  function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function body(g, color, S = 128) {
    const gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, shade(color, .22)); gr.addColorStop(1, shade(color, -.22));
    g.fillStyle = shade(color, -.45); g.fillRect(0, 0, S, S); rrect(g, 4, 4, S - 8, S - 8, 16); g.fillStyle = gr; g.fill();
    g.strokeStyle = shade(color, .4); g.lineWidth = 2; rrect(g, 9, 9, S - 18, S - 18, 12); g.stroke();
  }
  const rivets = (g, pts, col = '#e8c46a') => pts.forEach(([x, y]) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); g.fillStyle = '#fff8'; g.beginPath(); g.arc(x - 1, y - 1, 1.5, 0, 7); g.fill(); });
  const PAINT = {
    suitcase: (g, c, top) => { body(g, c); g.fillStyle = shade(c, -.5);
      if (top) { g.fillStyle = shade(c, -.6); for (const x of [38, 82]) { rrect(g, x, 56, 8, 16, 3); g.fill(); } rrect(g, 34, 58, 60, 12, 6); g.fill(); g.fillStyle = shade(c, -.25); rrect(g, 38, 59, 52, 4, 2); g.fill(); }
      else { for (const x of [30, 86]) { g.fillRect(x, 4, 12, 120); g.fillStyle = '#e2bd62'; g.fillRect(x - 2, 58, 16, 12); g.fillStyle = shade(c, -.5); } }
      rivets(g, [[16, 16], [112, 16], [16, 112], [112, 112]]); },
    crate: (g, c, top) => {
      if (top) { g.fillStyle = shade(c, -.3); g.fillRect(0, 0, 128, 128); g.fillStyle = '#f7fbff'; rrect(g, 3, 3, 122, 122, 22); g.fill(); g.fillStyle = '#d6e6f8'; for (const [x, y, r] of [[36, 40, 14], [88, 76, 18], [50, 96, 10]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } return; }
      body(g, c); g.strokeStyle = shade(c, -.4); g.lineWidth = 3; for (const y of [36, 64, 92]) { g.beginPath(); g.moveTo(8, y); g.lineTo(120, y); g.stroke(); }
      g.lineWidth = 9; g.beginPath(); g.moveTo(14, 114); g.lineTo(114, 14); g.stroke();
      g.fillStyle = '#f4f9ff'; g.beginPath(); g.moveTo(0, 0); g.lineTo(128, 0); g.lineTo(128, 14); for (let x = 128; x >= 0; x -= 16) g.quadraticCurveTo(x - 8, 26, x - 16, 14); g.fill(); },
    trunk: (g, c, top) => { body(g, c); g.fillStyle = '#d8ae55';
      if (top) { for (const x of [26, 92]) g.fillRect(x, 4, 10, 120); g.fillStyle = '#b88a35'; rrect(g, 52, 50, 24, 28, 5); g.fill(); }
      else { for (const y of [26, 92]) g.fillRect(4, y, 120, 10); rivets(g, [[20, 31], [64, 31], [108, 31], [20, 97], [64, 97], [108, 97]], '#9a7230'); } },
    tin: (g, c, top) => { body(g, c); rivets(g, [16, 40, 64, 88, 112].flatMap(v => [[v, 14], [v, 114], [14, v], [114, v]]), shade(c, .5));
      if (top) { g.strokeStyle = shade(c, -.35); g.lineWidth = 6; g.beginPath(); g.moveTo(30, 64); g.lineTo(98, 64); g.moveTo(64, 30); g.lineTo(64, 98); g.stroke(); }
      else { g.save(); rrect(g, 10, 88, 108, 22, 4); g.clip(); for (let x = -20; x < 140; x += 18) { g.fillStyle = (x / 18) % 2 ? '#1c1c1c' : '#f2c230'; g.beginPath(); g.moveTo(x, 110); g.lineTo(x + 18, 88); g.lineTo(x + 27, 88); g.lineTo(x + 9, 110); g.fill(); } g.restore(); } },
    cart: (g, c, top) => {
      if (top) { g.fillStyle = '#5a5f6a'; g.fillRect(0, 0, 128, 128); const cols = ['#c98a4a', '#b87a3e', '#d39552', '#bd8044']; cols.forEach((k, i) => { g.fillStyle = k; rrect(g, 8, 8 + i * 28.5, 112, 25, 4); g.fill(); }); return; }
      g.fillStyle = '#3c4250'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#c98a4a'; g.fillRect(0, 0, 128, 30);
      g.strokeStyle = '#7a8296'; g.lineWidth = 6; rrect(g, 8, 36, 112, 54, 6); g.stroke();
      for (const x of [32, 96]) { g.fillStyle = '#16181e'; g.beginPath(); g.arc(x, 106, 18, 0, 7); g.fill(); g.fillStyle = '#b8bfcc'; g.beginPath(); g.arc(x, 106, 7, 0, 7); g.fill(); } },
    spring: (g, c, top) => {
      if (top) { ['#e8453c', '#fff4e8', '#e8453c', '#fff4e8', '#ffd23a'].forEach((k, i) => { g.fillStyle = k; g.beginPath(); g.arc(64, 64, 62 - i * 12, 0, 7); g.fill(); });
        g.fillStyle = '#fff8d8'; g.beginPath(); g.arc(58, 58, 5, 0, 7); g.fill(); return; }
      for (let x = -40; x < 170; x += 24) { g.fillStyle = (Math.round(x / 24) & 1) ? '#22201c' : '#ffcf2a'; g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 24, 0); g.lineTo(x + 48, 0); g.lineTo(x + 24, 128); g.fill(); }
      g.fillStyle = '#e8453c'; g.fillRect(0, 0, 128, 18); g.fillRect(0, 110, 128, 18); },
    platform: (g, c, top, peak) => {
      if (top) { g.fillStyle = peak ? '#f6dc8a' : '#cfc8ba'; g.fillRect(0, 0, 128, 128); const r2 = rng(peak ? 9 : 4); for (let i = 0; i < 90; i++) { g.fillStyle = peak ? '#e6c46a' : '#b9b2a4'; g.fillRect(r2() * 128, r2() * 128, 2, 2); }
        g.fillStyle = peak ? '#ffffff' : '#f2c230'; for (const [x, y, w, h] of [[0, 0, 128, 12], [0, 116, 128, 12]]) g.fillRect(x, y, w, h);
        if (peak) { g.fillStyle = '#c8962a'; rrect(g, 30, 40, 68, 48, 8); g.fill(); g.fillStyle = '#fff3c8'; g.font = 'bold 22px Inter, sans-serif'; g.textAlign = 'center'; g.fillText('EXIT', 64, 72); } return; }
      g.fillStyle = '#7a3a2e'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#9a4c3a';
      for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) { rrect(g, col * 32 + (row % 2) * 16 + 2, 20 + row * 14, 28, 11, 2); g.fill(); }
      g.fillStyle = peak ? '#ffe08a' : '#f4ecdc'; g.fillRect(0, 0, 128, 16); },
    // A rubber conveyor with chevrons pointing the way it moves (+x on the texture), steel rollers on the sides.
    belt: (g, c, top) => {
      if (top) { g.fillStyle = '#26282e'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#3a3d46'; for (let x = 0; x < 128; x += 16) g.fillRect(x, 0, 3, 128);
        g.fillStyle = '#f2c230'; for (let x = 8; x < 128; x += 42) { g.beginPath(); g.moveTo(x, 34); g.lineTo(x + 22, 64); g.lineTo(x, 94); g.lineTo(x + 10, 94); g.lineTo(x + 32, 64); g.lineTo(x + 10, 34); g.fill(); } return; }
      g.fillStyle = '#5a5f6a'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#26282e'; g.fillRect(0, 0, 128, 26); for (const x of [20, 64, 108]) { g.fillStyle = '#9aa3b5'; g.beginPath(); g.arc(x, 74, 16, 0, 7); g.fill(); g.fillStyle = '#3a3d46'; g.beginPath(); g.arc(x, 74, 6, 0, 7); g.fill(); } },
    // A freight elevator: diamond plate with hazard edges, a steel cage below.
    freight: (g, c, top) => {
      if (top) { g.fillStyle = '#8a929f'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#a7aebb'; for (let x = 0; x < 128; x += 16) for (let y = (x / 16 % 2) * 8; y < 128; y += 16) { g.save(); g.translate(x + 8, y + 4); g.rotate(.7); g.fillRect(-5, -1.5, 10, 3); g.restore(); }
        g.save(); rrect(g, 0, 0, 128, 128, 0); g.lineWidth = 14; g.setLineDash([14, 14]); g.strokeStyle = '#f2c230'; g.strokeRect(7, 7, 114, 114); g.setLineDash([14, 14]); g.lineDashOffset = 14; g.strokeStyle = '#22201c'; g.strokeRect(7, 7, 114, 114); g.restore(); return; }
      g.fillStyle = '#4a505c'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#7a8292'; for (let x = 8; x < 128; x += 24) g.fillRect(x, 0, 6, 128); g.fillStyle = '#f2c230'; g.fillRect(0, 0, 128, 14); },
    // A steel beam with a yellow safety line down the middle.
    rail: (g, c, top) => { g.fillStyle = '#9aa3b5'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#7a8292'; g.fillRect(0, 0, 128, 10); g.fillRect(0, 118, 128, 10);
      if (top) { g.fillStyle = '#f2c230'; g.fillRect(0, 58, 128, 12); } g.fillStyle = '#5a6272'; for (let x = 10; x < 128; x += 28) { g.beginPath(); g.arc(x, 24, 4, 0, 7); g.arc(x, 104, 4, 0, 7); g.fill(); } },
    // Frosted ice: pale blue with white cracks and a sparkle.
    ice: (g, c, top) => { const gr = g.createLinearGradient(0, 0, 128, 128); gr.addColorStop(0, '#e8fbff'); gr.addColorStop(1, '#8fd0ee'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#ffffffcc'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 30); g.lineTo(50, 60); g.lineTo(44, 100); g.moveTo(50, 60); g.lineTo(110, 50); g.moveTo(80, 120); g.lineTo(96, 80); g.stroke();
      g.strokeStyle = '#5aa8d0'; g.lineWidth = 4; rrect(g, 3, 3, 122, 122, 14); g.stroke(); if (top) { g.fillStyle = '#fff'; g.beginPath(); g.arc(92, 30, 4, 0, 7); g.fill(); } },
    roof: (g, c, top) => {
      g.fillStyle = shade(c, -.1); g.fillRect(0, 0, 128, 128);
      if (top) { for (let y = 0; y < 128; y += 16) { g.fillStyle = shade(c, .18); g.fillRect(0, y, 128, 3); g.fillStyle = shade(c, -.35); g.fillRect(0, y + 13, 128, 3); } return; }
      g.fillStyle = '#e2bd62'; g.fillRect(0, 28, 128, 8); g.fillStyle = shade(c, -.4); g.fillRect(0, 0, 128, 10); },
  };
  window.createGhostClimb = ({ seed, sfx, onFinish, onClose, onAudio }) => {
    const d = document.createElement('dialog'); d.className = 'lt-dialog climb-dialog climb-3d'; d.setAttribute('aria-label', 'Ghost Climb');
    d.innerHTML = '<div class="climb-head"><div class="climb-title"><small class="climb-theme">GHOST CLIMB</small><b>Reach The Signal</b></div><div class="climb-view" role="group" aria-label="Camera"><button type="button" data-view="first" aria-label="First person">1st</button><button type="button" data-view="third" aria-label="Third person">3rd</button></div><span class="climb-time">0.0s</span><button type="button" class="climb-close" aria-label="Leave the climb">×</button></div>'
      + '<div class="climb-stage"><canvas></canvas><div class="climb-route" aria-hidden="true"><i class="route-line"></i><i class="route-fill"></i><span class="route-ghost"></span></div><i class="climb-cross" aria-hidden="true"></i><p class="climb-toast">Loading the line…</p>'
      + '<div class="climb-stick" aria-label="Move"><span class="stick-arrows" aria-hidden="true"></span><i></i></div>'
      + '<div class="climb-jump" role="button" aria-label="Jump"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l7 8h-4.5v7h-5v-7H5z"/></svg><span>JUMP</span></div>'
      + '<p class="climb-hint">Drag to look · Stick to move · Jump</p><ol class="climb-news" aria-live="polite"></ol></div>';
    document.body.append(d); d.showModal(); document.body.classList.add('climbing'); onAudio?.(true);
    const canvas = d.querySelector('canvas'), stage = d.querySelector('.climb-stage'), timeEl = d.querySelector('.climb-time'), toast = d.querySelector('.climb-toast'), route = d.querySelector('.climb-route');
    let closed = false, raf = 0, renderer = null, camera = null, audio = null;
    function say(text, ms = 1600) { toast.textContent = text; toast.hidden = false; clearTimeout(say.t); if (ms) say.t = setTimeout(() => { toast.hidden = true; }, ms); }
    function close() { if (closed) return; closed = true; cancelAnimationFrame(raf); removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); removeEventListener('resize', resize); audio?.stop(); onAudio?.(false); document.body.classList.remove('climbing'); try { renderer?.dispose(); } catch {} d.close(); d.remove(); }
    d.querySelector('.climb-close').onclick = () => { close(); onClose?.(); };
    d.addEventListener('cancel', e => { e.preventDefault(); close(); onClose?.(); });
    // No text selection, long-press menus or double-tap zoom while playing.
    for (const t of ['contextmenu', 'selectstart', 'dblclick']) d.addEventListener(t, e => e.preventDefault());
    for (const t of ['pointerdown', 'keydown']) d.addEventListener(t, () => audio?.unlock(), { passive: true });

    // Input: a virtual stick, a jump button, drag-to-look, and the keyboard.
    const input = { mx: 0, mz: 0, jump: 0, keys: new Set() }, look = { yaw: Math.PI * .25, pitch: .4 };
    // First person by default: the view always faces where you walk. Third person follows behind.
    const PITCH = { first: [-1, 1.4], third: [.08, 1.2] }, viewBtns = d.querySelectorAll('.climb-view button');
    let view = 'first'; try { if (localStorage.getItem('lt-climb-view') === 'third') view = 'third'; } catch {}
    function setView(next) {
      view = next; stage.classList.toggle('first-person', view === 'first'); look.pitch = view === 'first' ? .4 : .5;
      for (const b of viewBtns) { b.classList.toggle('on', b.dataset.view === view); b.setAttribute('aria-pressed', String(b.dataset.view === view)); }
      try { localStorage.setItem('lt-climb-view', view); } catch {}
    }
    for (const b of viewBtns) b.onclick = () => setView(b.dataset.view);
    const stick = d.querySelector('.climb-stick'), knob = stick.querySelector('i');
    let stickId = null;
    const stickMove = e => { const rc = stick.getBoundingClientRect(), cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2, R = rc.width / 2;
      let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      input.mx = dx; input.mz = dy; knob.style.transform = 'translate(' + dx * R * .5 + 'px,' + dy * R * .5 + 'px)'; stick.classList.add('held'); };
    stick.addEventListener('pointerdown', e => { e.preventDefault(); stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); });
    stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) stickMove(e); });
    for (const t of ['pointerup', 'pointercancel']) stick.addEventListener(t, e => { if (e.pointerId !== stickId) return; stickId = null; input.mx = input.mz = 0; knob.style.transform = ''; stick.classList.remove('held'); });
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
    new Promise(done => setTimeout(done, 30)).then(() => {
      ({ theme, blocks, top } = course(seed)); d.querySelector('.climb-theme').textContent = theme.name.toUpperCase();
      audio = window.createClimbAudio?.({ mode: sfx ? sfx.mode : 2, song: theme.song }) || null; audio?.unlock();
      return loadThree();
    }).then(THREE => {
      if (closed) return;
      try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch { say('This browser cannot show the 3D climb.', 0); return; }
      renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
      const scene = new THREE.Scene(), C = h => new THREE.Color(h);
      scene.fog = new THREE.Fog(C(theme.fog), 24, 120);
      camera = new THREE.PerspectiveCamera(62, 1, .1, 400);
      scene.add(new THREE.HemisphereLight(C(theme.hemi[0]), C(theme.hemi[1]), theme.hemi[2]));
      const sun = new THREE.DirectionalLight(C(theme.sun[0]), theme.sun[1]); sun.position.set(8, 14, 5); scene.add(sun);
      const art = (paint, size = 128, repeat) => { const c = document.createElement('canvas'); c.width = c.height = size; paint(c.getContext('2d'), size);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); } return t; };
      const lambert = o => new THREE.MeshLambertMaterial(o);
      const cache = new Map(), faces = (style, color, peak) => {
        const k = style + color + (peak ? 'p' : ''); if (cache.has(k)) return cache.get(k);
        const side = lambert({ map: art(g => PAINT[style](g, color, false, peak)) }), topM = lambert({ map: art(g => PAINT[style](g, color, true, peak)), ...(peak ? { emissive: C('#3a2a00') } : {}) });
        const m = [side, side, topM, side, side, side]; cache.set(k, m); return m;
      };
      // The sky: a soft gradient dome that always surrounds the camera.
      const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { a: { value: C(theme.sky[0]) }, b: { value: C(theme.sky[1]) }, c: { value: C(theme.sky[2]) } },
        vertexShader: 'varying vec3 v; void main() { v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 a; uniform vec3 b; uniform vec3 c; varying vec3 v; void main() { vec3 col = mix(c, b, smoothstep(-0.02, 0.22, v.y)); col = mix(col, a, smoothstep(0.22, 0.8, v.y)); gl_FragColor = vec4(col, 1.0);\n#include <colorspace_fragment>\n}' }));
      sky.renderOrder = -1; scene.add(sky);

      // The course: luggage, carts, spring buffers, platforms, and the roof of the carriage the ghost escapes from.
      const pick = rng(seed ^ 0x2545f491), box = new THREE.BoxGeometry(.96, .96, .96), floorY = Math.min(...blocks.map(b => b.y)) - BELOW;
      const postM = lambert({ color: C(theme.post) });
      for (const b of blocks) {
        const style = { stone: theme.bag, lift: 'cart', slime: 'spring', gold: 'platform', peak: 'platform', roof: 'roof', belt: 'belt', elevator: 'freight', beam: 'rail', ice: 'ice' }[b.kind];
        const geo = b.kind === 'roof' ? new THREE.BoxGeometry(1, 1, 1) : b.kind === 'beam' ? new THREE.BoxGeometry(b.hx * 2, .26, b.hz * 2) : box;
        let mats = faces(style, b.kind === 'roof' ? theme.carriage : theme.colors[Math.floor(pick() * theme.colors.length)], b.kind === 'peak');
        if (b.kind === 'belt') { mats = mats.map(m => m.clone()); mats[2].map = mats[2].map.clone(); mats[2].map.wrapS = THREE.RepeatWrapping; mats[2].map.needsUpdate = true; b.beltMap = mats[2].map; b.beltSpeed = Math.hypot(b.bx, b.bz); }
        if (b.kind === 'ice') mats = mats.map(m => { const c = m.clone(); c.transparent = true; c.opacity = .9; c.emissive = C('#16384a'); return c; });
        b.mesh = new THREE.Mesh(geo, mats);
        if (b.kind === 'belt') b.mesh.rotation.y = Math.atan2(-b.bz, b.bx);
        b.mesh.position.set(b.x, b.y, b.z); scene.add(b.mesh); b.cx = b.x; b.cz = b.z; b.cy = b.y;
        // Blocks float freely; only elevators run between two short guide rails over their shaft.
        if (b.kind === 'elevator') for (const s2 of [-1, 1]) { const h = b.rise + 1.2, g2 = new THREE.Mesh(new THREE.BoxGeometry(.08, h, .08), lambert({ color: C('#f2c230') })); g2.position.set(b.x + s2 * .56, b.y - .5 + h / 2, b.z + s2 * .56); scene.add(g2); }
      }
      // The carriage below the roof, its wheels, and the rails it stands on.
      const carM = lambert({ map: art(g => { g.fillStyle = theme.carriage; g.fillRect(0, 0, 256, 256); g.fillStyle = shade(theme.carriage, -.35); g.fillRect(0, 200, 256, 56);
        g.fillStyle = '#e2bd62'; g.fillRect(0, 176, 256, 10); for (const x of [24, 140]) { g.fillStyle = shade(theme.carriage, -.5); rrect(g, x - 6, 40, 104, 110, 14); g.fill(); const gl = g.createLinearGradient(0, 46, 0, 144); gl.addColorStop(0, '#ffe8a8'); gl.addColorStop(1, '#f2b45a'); g.fillStyle = gl; rrect(g, x, 46, 92, 98, 10); g.fill(); } }, 256, [4, 1]), emissive: C('#2a1a08') });
      const carriage = new THREE.Mesh(new THREE.BoxGeometry(8, BELOW - .8, 2.8), carM); carriage.position.set(-2.5, floorY + .3 + (BELOW - .8) / 2, 0); scene.add(carriage);
      const wheelG = new THREE.CylinderGeometry(.34, .34, .18, 16), wheelM = lambert({ color: C('#1c1d24') });
      for (const x of [-5.6, -4.6, -.4, .6]) for (const z of [-.72, .72]) { const w = new THREE.Mesh(wheelG, wheelM); w.rotation.x = Math.PI / 2; w.position.set(x, floorY + .36, z); scene.add(w); }
      const railM = lambert({ color: C('#c8ccd6') }), sleeperM = lambert({ color: C('#5a4030') });
      for (const z of [-.72, .72]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(160, .07, .07), railM); rail.position.set(0, floorY + .1, z); scene.add(rail); }
      const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(.28, .06, 2), sleeperM, 230), m4 = new THREE.Matrix4();
      for (let i = 0; i < 230; i++) { m4.makeTranslation(-80 + i * .7, floorY + .03, 0); sleepers.setMatrixAt(i, m4); } scene.add(sleepers);

      // The ground, the scenery around the course, and the air (stars, snow, dust or embers).
      const xs = blocks.map(b => b.x), zs = blocks.map(b => b.z), mid = [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2];
      const groundTex = art((g, S) => {
        const r2 = rng(17);
        if (theme.floor === 'platform') { g.fillStyle = '#2e3046'; g.fillRect(0, 0, S, S); g.strokeStyle = '#3c3f5a'; g.lineWidth = 3; for (let k = 0; k <= S; k += S / 4) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, S); g.moveTo(0, k); g.lineTo(S, k); g.stroke(); } }
        if (theme.floor === 'snow') { g.fillStyle = '#f2f6ff'; g.fillRect(0, 0, S, S); for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(170,195,235,.25)'; g.beginPath(); g.ellipse(r2() * S, r2() * S, 10 + r2() * 30, 4 + r2() * 10, 0, 0, 7); g.fill(); } }
        if (theme.floor === 'sand') { g.fillStyle = '#efc98e'; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(190,130,70,.35)'; g.lineWidth = 3; for (let y = 10; y < S; y += 22) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= S; x += 32) g.quadraticCurveTo(x + 16, y + (r2() - .5) * 14, x + 32, y); g.stroke(); } }
        if (theme.floor === 'grate') { g.fillStyle = '#7a2a12'; g.fillRect(0, 0, S, S); g.fillStyle = '#2a2428'; for (let x = 0; x < S; x += 32) for (let y = 0; y < S; y += 32) { rrect(g, x + 2, y + 2, 28, 28, 4); g.fill(); } g.fillStyle = '#3a3236'; for (let x = 0; x < S; x += 32) for (let y = 0; y < S; y += 32) g.fillRect(x + 6, y + 6, 20, 3); }
      }, 256, [40, 40]);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), lambert({ map: groundTex, ...(theme.floor === 'grate' ? { emissive: C('#1a0602') } : {}) }));
      ground.rotation.x = -Math.PI / 2; ground.position.set(mid[0], floorY, mid[1]); scene.add(ground);
      const rs = rng(seed ^ 0x9e3779b9), ring = (n, fn) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + rs() * .3, R = 70 + rs() * 25; fn(mid[0] + Math.cos(a) * R, mid[1] + Math.sin(a) * R, rs); } };
      if (theme.scenery === 'city') {
        const win = art(g => { g.fillStyle = '#161a33'; g.fillRect(0, 0, 64, 64); for (let x = 4; x < 64; x += 12) for (let y = 4; y < 64; y += 12) { g.fillStyle = rs() < .45 ? '#ffd88a' : '#22284a'; g.fillRect(x, y, 6, 7); } }, 64, [2, 4]);
        ring(36, (x, z, r) => { const w = 5 + r() * 6, h = 10 + r() * 34, b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), lambert({ color: C('#2a2f55'), map: win, emissive: C('#ffffff'), emissiveMap: win, emissiveIntensity: .7 })); b.position.set(x, floorY + h / 2, z); scene.add(b); });
      } else if (theme.scenery === 'mountains') {
        ring(18, (x, z, r) => { const h = 22 + r() * 30, rad = 14 + r() * 14, m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 6), lambert({ color: C('#7f97c4'), flatShading: true })); m.position.set(x, floorY + h / 2, z); scene.add(m);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * .4, h * .4, 6), lambert({ color: C('#ffffff'), flatShading: true })); cap.position.set(x, floorY + h * .8 + .05, z); scene.add(cap); });
      } else if (theme.scenery === 'mesas') {
        ring(16, (x, z, r) => { const h = 8 + r() * 14, rad = 7 + r() * 9, m = new THREE.Mesh(new THREE.CylinderGeometry(rad * .8, rad, h, 7), lambert({ color: C(r() < .5 ? '#c4693d' : '#b2583a'), flatShading: true })); m.position.set(x, floorY + h / 2, z); scene.add(m); });
      } else {
        ring(22, (x, z, r) => { const h = 18 + r() * 26, c = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2, h, 10), lambert({ color: C('#2c2428') })); c.position.set(x, floorY + h / 2, z); scene.add(c);
          const glow = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, .8, 10), new THREE.MeshBasicMaterial({ color: C('#ff8a2a') })); glow.position.set(x, floorY + h - .4, z); scene.add(glow); });
      }
      if (['snow', 'dust'].includes(theme.air)) for (let i = 0; i < 12; i++) { const cloud = new THREE.Group(), cm = lambert({ color: C('#ffffff'), transparent: true, opacity: .85 });
        for (let k = 0; k < 4; k++) { const s2 = new THREE.Mesh(new THREE.SphereGeometry(1.6 + rs() * 1.4, 12, 8), cm); s2.position.set(k * 1.8 - 2.7, rs() * .6, rs() * 1.2); s2.scale.y = .55; cloud.add(s2); }
        cloud.position.set(mid[0] + (rs() - .5) * 90, top + 8 + rs() * 12, mid[1] + (rs() - .5) * 90); scene.add(cloud); }
      const AIR = { stars: [500, '#ffffff', 1.6, false], snow: [600, '#ffffff', .09, true], dust: [260, '#fff0d0', .06, true], embers: [360, '#ffa040', .08, true] }[theme.air];
      const airPos = new Float32Array(AIR[0] * 3);
      for (let i = 0; i < AIR[0]; i++) {
        if (theme.air === 'stars') { const a = rs() * Math.PI * 2, e = .12 + rs() * 1.3; airPos.set([Math.cos(a) * Math.cos(e) * 160, Math.sin(e) * 160, Math.sin(a) * Math.cos(e) * 160], i * 3); }
        else airPos.set([(rs() - .5) * 30, rs() * 20, (rs() - .5) * 30], i * 3);
      }
      const airGeo = new THREE.BufferGeometry(); airGeo.setAttribute('position', new THREE.BufferAttribute(airPos, 3));
      const air = new THREE.Points(airGeo, new THREE.PointsMaterial({ color: C(AIR[1]), size: AIR[2], sizeAttenuation: AIR[3], transparent: true, opacity: .9, fog: theme.air !== 'stars', depthWrite: false, ...(theme.air === 'embers' ? { blending: THREE.AdditiveBlending } : {}) }));
      scene.add(air);

      // Lamps on every platform, and the railway signal at the top: green means go.
      const lampM = new THREE.MeshBasicMaterial({ color: C(theme.accent) });
      // The lamp stands on the outer edge of each platform, out of the ghost's way.
      for (const b of blocks.filter(q => q.kind === 'gold' && q.wide)) { const main = blocks.find(q => q.kind === 'gold' && !q.wide && q.y === b.y && Math.abs(q.x - b.x) + Math.abs(q.z - b.z) === 1), lx = b.x + (b.x - main.x) * .42, lz = b.z + (b.z - main.z) * .42;
        const p = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, 1.5, 8), postM); p.position.set(lx, b.y + 1.2, lz); scene.add(p);
        const l = new THREE.Mesh(new THREE.SphereGeometry(.13, 16, 10), lampM); l.position.set(lx, b.y + 2, lz); scene.add(l); }
      const peak = blocks.find(b => b.kind === 'peak' && !b.wide);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, 2.6, 10), lambert({ color: C('#2a2c34') })); mast.position.set(peak.x, peak.y + 1.8, peak.z); scene.add(mast);
      const head = new THREE.Mesh(new THREE.BoxGeometry(.36, .86, .28), lambert({ color: C('#16171c') })); head.position.set(peak.x, peak.y + 3.2, peak.z); scene.add(head);
      [['#2aff7a', .26], ['#3a2a10', 0], ['#3a1010', -.26]].forEach(([col, dy]) => { const lens = new THREE.Mesh(new THREE.SphereGeometry(.085, 16, 10), new THREE.MeshBasicMaterial({ color: C(col) })); lens.position.set(peak.x, peak.y + 3.2 + dy, peak.z + .15); scene.add(lens); });
      const glowTex = art((g, S) => { const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(120,255,170,.9)'); gr.addColorStop(1, 'rgba(120,255,170,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); }, 64);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false })); glow.position.set(peak.x, peak.y + 3.46, peak.z + .2); glow.scale.setScalar(1.4); scene.add(glow);

      // The ghost: a soft rounded sheet with a glowing hem, plus a shadow so jumps are easy to judge.
      const ghost = new THREE.Group(), sheet = new THREE.MeshLambertMaterial({ color: C('#f7f4ff'), emissive: C('#4a3f80'), transparent: true, opacity: .95 });
      const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(.28, .33, .5, 24), sheet); bodyMesh.position.y = .35; ghost.add(bodyMesh);
      const headMesh = new THREE.Mesh(new THREE.SphereGeometry(.28, 24, 16), sheet); headMesh.position.y = .6; ghost.add(headMesh);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, hem = new THREE.Mesh(new THREE.SphereGeometry(.1, 12, 8), sheet); hem.position.set(Math.sin(a) * .25, .1, Math.cos(a) * .25); ghost.add(hem); }
      for (const sx of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(.05, 12, 8), new THREE.MeshBasicMaterial({ color: C('#2a1d55') })); eye.scale.y = 1.5; eye.position.set(sx * .1, .64, .25); ghost.add(eye); }
      scene.add(ghost);
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(.34, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .35, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
      // A bobbing marker over the next block to jump to.
      const marker = new THREE.Mesh(new THREE.ConeGeometry(.16, .32, 16), new THREE.MeshBasicMaterial({ color: C(theme.accent), transparent: true, opacity: .9 })); marker.rotation.x = Math.PI; scene.add(marker);

      // The first time each kind of obstacle is next, the board says what it does.
      const TIPS = { lift: 'BAGGAGE CART · TIME YOUR HOP', slime: 'SPRING BUFFER · BOUNCE UP', belt: 'CONVEYOR · IT PUSHES YOU', elevator: 'FREIGHT LIFT · RIDE IT UP', beam: 'NARROW BEAM · WALK THE LINE', ice: 'FROSTED ICE · YOU WILL SLIDE' }, tipped = new Set();
      let safe = { x: 0, y: .5, z: 0, index: -1 }, t0 = performance.now(), last = t0, finished = false, falls = 0, reached = -1, best = -1, pads = 0, walked = 0;
      const camPos = new THREE.Vector3(), path = blocks.filter(b => b.kind !== 'roof' && !b.wide);
      // The route strip at the top: one stop per platform, and the ghost moving along it.
      const stops = path.map((b, i) => [b, i]).filter(([b, i]) => ['gold', 'peak'].includes(b.kind) && !['gold', 'peak'].includes(path[i - 1]?.kind));
      for (const [, i] of stops) { const dot = document.createElement('span'); dot.className = 'route-stop'; dot.style.left = ((i + 1) / path.length * 100) + '%'; route.append(dot); }
      const next = () => path[Math.min(path.length - 1, reached + 1)];
      const faceNext = () => { const b = next(); look.yaw = Math.atan2(-(b.cx - me.x), -(b.cz - me.z)); };
      const sim = simulate(blocks, {
        jump: () => audio?.fx('jump'),
        bounce: b => { b.squash = performance.now(); audio?.fx('bounce'); },
        land: b => {
          // Falling puts you back on the last solid block you stood on.
          // Falling sends the ghost back to the latest station platform it reached (the carriage roof at first).
          const i = path.indexOf(b.wide ? path.find(q => q.y === b.y && Math.abs(q.x - b.x) + Math.abs(q.z - b.z) === 1) : b);
          if (i > reached) reached = i;
          if (b.kind === 'gold' && i >= safe.index) safe = { x: path[i].x, y: path[i].y + .5, z: path[i].z, index: i };
          if (i > best) { best = i; if (['gold', 'peak'].includes(b.kind) && !['gold', 'peak'].includes(path[i - 1]?.kind)) { pads++; if (b.kind === 'gold') { say('PLATFORM ' + pads + ' · CHECKPOINT SAVED'); audio?.fx('platform'); } } }
          if (b.kind === 'peak' && !finished) { finished = true; win(); }
        },
        fell: () => { falls++; sim.place(safe); reached = safe.index; faceNext(); say(safe.index < 0 ? 'WHOOPS · BACK TO THE CARRIAGE' : 'WHOOPS · BACK TO THE CHECKPOINT'); audio?.fx('fall'); },
      });
      const me = sim.me;
      function step(dt, now) {
        const k = input.keys, fwd = (k.has('w') || k.has('ArrowUp') ? 1 : 0) - (k.has('s') || k.has('ArrowDown') ? 1 : 0) - input.mz, strafe = (k.has('d') || k.has('ArrowRight') ? 1 : 0) - (k.has('a') || k.has('ArrowLeft') ? 1 : 0) + input.mx;
        if (k.has('q')) look.yaw += dt * 2; if (k.has('e')) look.yaw -= dt * 2;
        // In third person the camera swings in behind the ghost while it walks forward.
        if (view === 'third' && lookId === null && fwd > .3 && me.ground) { const want = me.face + Math.PI, diff = (want - look.yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI; look.yaw += diff * Math.min(1, dt * 2.2); }
        // Movement is relative to where the camera looks: forward walks away from the camera.
        const n = Math.max(1, Math.hypot(fwd, strafe)), fx = -Math.sin(look.yaw), fz = -Math.cos(look.yaw), was = me.ground, fallSpeed = me.vy;
        sim.step(dt, now, (fx * fwd - fz * strafe) / n, (fz * fwd + fx * strafe) / n, input.jump > 0);
        input.jump = me.jumped ? 0 : input.jump - dt;
        if (!was && me.ground && fallSpeed < -4) audio?.fx('land');
        if (me.ground && (walked += Math.hypot(me.vx, me.vz) * dt) > .9) { walked = 0; audio?.fx('step'); }
      }
      function draw(now) {
        for (const b of blocks) {
          b.mesh.position.set(b.cx, b.cy + (b.kind === 'beam' ? .37 : 0), b.cz);
          if (b.beltMap) b.beltMap.offset.x = -(now / 1000) * b.beltSpeed;
          if (b.squash) { const t = now - b.squash; b.mesh.scale.y = t < 500 ? 1 - .3 * Math.exp(-t / 90) * Math.cos(t / 40) : 1; }
        }
        glow.material.opacity = .65 + Math.sin(now / 260) * .3;
        // Snow falls, embers rise and dust drifts in a box that follows the ghost.
        if (theme.air !== 'stars') {
          const v = { snow: [0, -.012, .004], dust: [.01, .001, .004], embers: [.002, .02, 0] }[theme.air];
          for (let i = 0; i < AIR[0]; i++) { airPos[i * 3] = ((airPos[i * 3] + v[0] + Math.sin(now / 900 + i) * v[2] + 15) % 30 + 30) % 30 - 15; airPos[i * 3 + 1] = ((airPos[i * 3 + 1] + v[1]) % 20 + 20) % 20; airPos[i * 3 + 2] = ((airPos[i * 3 + 2] + Math.cos(now / 1100 + i) * v[2] + 15) % 30 + 30) % 30 - 15; }
          airGeo.attributes.position.needsUpdate = true; air.position.set(me.x, me.y - 8, me.z);
        } else air.position.set(me.x, 0, me.z);
        ghost.position.set(me.x, me.y + (me.ground ? Math.sin(now / 300) * .03 : 0), me.z);
        ghost.rotation.y += ((me.face - ghost.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * .2;
        // Shadow on the highest surface below the ghost.
        let under = sim.floor; for (const b of blocks) if (Math.abs(b.cx - me.x) < b.hx + HALF * .6 && Math.abs(b.cz - me.z) < b.hz + HALF * .6 && b.cy + .5 <= me.y + .01) under = Math.max(under, b.cy + .5);
        { shadow.position.set(me.x, under + .01, me.z); const h = me.y - under; shadow.scale.setScalar(Math.max(.4, 1 - h * .12)); shadow.material.opacity = Math.max(.1, .4 - h * .05); }
        const nb = next(); if (TIPS[nb.kind] && !tipped.has(nb.kind)) { tipped.add(nb.kind); say(TIPS[nb.kind], 2200); }
        marker.visible = !finished; marker.position.set(nb.cx, nb.cy + 1.05 + Math.sin(now / 260) * .12, nb.cz); marker.rotation.y = now / 600;
        ghost.visible = view === 'third';
        if (view === 'first') {
          // Eyes high enough that block tops stay in view; pitch above zero looks down.
          const cp = Math.cos(look.pitch); camera.position.set(me.x, me.y + EYE, me.z);
          camera.lookAt(me.x - Math.sin(look.yaw) * cp, me.y + EYE - Math.sin(look.pitch), me.z - Math.cos(look.yaw) * cp);
        } else {
          const dist = 5.6; camPos.set(me.x + Math.sin(look.yaw) * Math.cos(look.pitch) * dist, me.y + .8 + Math.sin(look.pitch) * dist, me.z + Math.cos(look.yaw) * Math.cos(look.pitch) * dist);
          camera.position.lerp(camPos, .25); camera.lookAt(me.x, me.y + .6, me.z);
        }
        sky.position.copy(camera.position);
        renderer.render(scene, camera);
        route.style.setProperty('--done', ((best + 1) / path.length * 100).toFixed(1) + '%');
      }
      function frame(now) {
        const dt = Math.max(0, Math.min(.033, (now - last) / 1000)); last = Math.max(last, now);
        if (!finished) { step(dt, now); timeEl.textContent = ((now - t0) / 1000).toFixed(1) + 's'; }
        draw(now); raf = requestAnimationFrame(frame);
      }
      function win() { audio?.fx('win'); say('SIGNAL REACHED · YOU ESCAPED', 0); setTimeout(() => { close(); onFinish({ seconds: (performance.now() - t0) / 1000, falls }); }, 1200); }
      // Read-only handle for automated tests.
      d.climb = { me, blocks, look, input, audio };
      resize(); addEventListener('resize', resize); toast.hidden = true; t0 = last = performance.now();
      faceNext(); camera.position.set(me.x + 4, me.y + 3, me.z + 4); raf = requestAnimationFrame(frame);
    }).catch(() => say('The climb could not load. Check your connection and try again.', 0));
    // News from the train while climbing: a short line that slides in and fades after a few seconds.
    const news = d.querySelector('.climb-news');
    function notify(text) {
      if (closed || !text) return; const li = document.createElement('li'); li.textContent = text; news.prepend(li);
      while (news.children.length > 3) news.lastChild.remove(); audio?.fx('news');
      setTimeout(() => li.classList.add('gone'), 4200); setTimeout(() => li.remove(), 4800);
    }
    // When the journey ends mid-climb, say so and close after a moment.
    function end(text) { if (closed) return; notify(text); say('THE JOURNEY HAS ENDED', 0); setTimeout(() => { close(); onClose?.(); }, 3200); }
    return { close, notify, end, get open() { return !closed; } };
  };
  window.ghostClimbCourse = course;
  window.ghostClimbSim = simulate;
})();
