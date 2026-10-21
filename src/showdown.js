// ---- the showdown: the row's strongest hand sends a creature to strike the weakest, and the screen follows it ----
const reduceFx = () => ui.calm || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);   // no big effects for calm mode or a phone set to reduce motion
const atkHeld = new Set();   // losers whose verdict is still being held back until the creature arrives
const ATK_STYLES = ['dragon', 'eagle', 'thunder', 'comet', 'meteors', 'shark', 'ninja', 'blackhole', 'fist', 'ice', 'cannon', 'ufo'];
// Ease into the attack framing instead of moving a large fraction on the first frame.
async function panAttackCamera(docY, height, tween) {
  const start = window.scrollY;
  const visibleY = docY - start;
  if (visibleY >= height * .25 && visibleY <= height * .7) return;
  const end = Math.max(0, Math.min(document.documentElement.scrollHeight - height, docY - height * .45));
  if (Math.abs(end - start) < 4) return;
  const duration = Math.min(1000, Math.max(650, Math.abs(end - start) * .7));
  await tween(duration, (progress) => {
    const eased = progress * progress * (3 - 2 * progress);
    window.scrollTo({ top: start + (end - start) * eased, behavior: 'instant' });
  });
}
function strengthOf(res, e) {   // bigger = stronger, for whatever that row rewards
  if (res.row === 0) return e.val;
  if (res.row === 1) return -e.val;
  if (res.row === 2) return e.bust ? -100 - e.total : e.total;
  return HAND_RANK.indexOf(e.hand);
}
const atkWait = (ms) => new Promise((r) => setTimeout(r, ms));
// ---- a small canvas engine for the showdown: additive fire and sparks, smoke, jagged lightning, slashes and shockwaves ----
function atkEngine() {
  const W = window.innerWidth, H = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas'); cv.className = 'atkcv'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;z-index:81`;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const parts = [], bolts = [], rings = [], slashes = [], beams = [], layers = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const sprites = new Map();
  const sprite = (c) => {   // a soft glowing dot in that colour, drawn once and reused
    const key = (c[0] >> 3) + ',' + (c[1] >> 3) + ',' + (c[2] >> 3);
    let s = sprites.get(key);
    if (!s) { s = document.createElement('canvas'); s.width = s.height = 64; const g = s.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, `rgba(${c[0]|0},${c[1]|0},${c[2]|0},1)`); gr.addColorStop(0.35, `rgba(${c[0]|0},${c[1]|0},${c[2]|0},.55)`); gr.addColorStop(1, `rgba(${c[0]|0},${c[1]|0},${c[2]|0},0)`); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); sprites.set(key, s); }
    return s;
  };
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  let frozen = 0, alive = true, last = performance.now();
  const emit = (o) => { const p = { x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0.98, life: 600, s: 8, s1: 0, col: [255, 170, 60], col1: [150, 30, 0], a: 1, add: true, ...o }; p.max = p.life; parts.push(p); if (parts.length > 1100) parts.shift(); };
  // one jagged line from a to b (midpoint displacement)
  const jag = (x0, y0, x1, y1, disp, depth = 5) => {
    let pts = [[x0, y0], [x1, y1]];
    for (let d = 0; d < depth; d++) { const n = []; for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = by - ay, dy = ax - bx, l = Math.hypot(dx, dy) || 1; const o = rnd(-disp, disp); n.push(pts[i], [mx + (dx / l) * o, my + (dy / l) * o]); } n.push(pts[pts.length - 1]); pts = n; disp *= 0.55; }
    return pts;
  };
  const api = {
    W, H, cv, rnd, emit,
    freeze(ms) { frozen = ms; },
    // a burst of particles (fire, sparks, debris...)
    burst(x, y, n, o = {}) { const { spd = [80, 380], life = [400, 900], s = [6, 18], col = [255, 190, 70], col1 = [160, 30, 0], g = 120, add = true, up = 0 } = o; for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), v = rnd(spd[0], spd[1]); emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, g, life: rnd(life[0], life[1]), s: rnd(s[0], s[1]), s1: 0, col, col1, add, drag: 0.94 }); } },
    // a stream of flame from (x,y) heading along (dx,dy)
    flame(x, y, dx, dy, n = 6, o = {}) { const { spd = 700, spread = 0.2, size = [14, 30], life = [260, 520] } = o; const a0 = Math.atan2(dy, dx); for (let i = 0; i < n; i++) { const a = a0 + rnd(-spread, spread), v = spd * rnd(0.6, 1.1); emit({ x: x + rnd(-4, 4), y: y + rnd(-4, 4), vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: -60, life: rnd(life[0], life[1]), s: rnd(size[0] * 0.6, size[0]), s1: rnd(size[1] * 0.8, size[1]), col: [255, 235, 140], col1: [200, 40, 0], drag: 0.96 }); } },
    smoke(x, y, n, o = {}) { const { size = [26, 60], life = [900, 1600] } = o; for (let i = 0; i < n; i++) emit({ x: x + rnd(-30, 30), y: y + rnd(-20, 20), vx: rnd(-40, 40), vy: rnd(-90, -20), g: -20, life: rnd(life[0], life[1]), s: size[0], s1: size[1] * rnd(0.8, 1.4), col: [70, 66, 78], col1: [30, 28, 36], a: 0.55, add: false, drag: 0.97 }); },
    embers(x0, y0, w, h, n = 24) { for (let i = 0; i < n; i++) emit({ x: x0 + rnd(0, w), y: y0 + rnd(0, h), vx: rnd(-30, 30), vy: rnd(-160, -50), g: -10, life: rnd(700, 1500), s: rnd(2, 5), s1: 0, col: [255, 200, 90], col1: [255, 80, 20], drag: 0.99 }); },
    ring(x, y, r1, col, ms = 520, w = 6) { rings.push({ x, y, r1, col, life: ms, max: ms, w }); },
    bolt(x0, y0, x1, y1, o = {}) { const { w = 7, ms = 300, branches = 3, col = [190, 215, 255] } = o; bolts.push({ x0, y0, x1, y1, w, col, life: ms, max: ms, branches, pts: jag(x0, y0, x1, y1, Math.hypot(x1 - x0, y1 - y0) * 0.12), subs: [], next: 0 }); },
    slash(x, y, ang, len, o = {}) { const { ms = 420, col = [210, 235, 255], w = 14 } = o; slashes.push({ x, y, ang, len, col, w, life: ms, max: ms }); },
    beam(x0, y0, x1, y1, o = {}) { const { w = 26, col = [255, 190, 70], ms = 80 } = o; beams.push({ x0, y0, x1, y1, w, col, life: ms, max: ms }); },
    speed(x, y, dx, dy, n = 4) { const l = Math.hypot(dx, dy) || 1; for (let i = 0; i < n; i++) { emit({ x: x + rnd(-90, 90), y: y + rnd(-90, 90), vx: (-dx / l) * 900, vy: (-dy / l) * 900, g: 0, life: 260, s: 3, s1: 1, col: [230, 240, 255], col1: [150, 190, 255], drag: 1 }); } },
    // the big one: a fireball with a flash, shockwaves, sparks, smoke and embers
    explosion(x, y, power = 1) { api.burst(x, y, 4, { spd: [0, 30], life: [90, 170], s: [55 * power, 95 * power], col: [255, 250, 225], col1: [255, 170, 60], g: 0 }); api.burst(x, y, 46 * power, { spd: [120, 560], life: [500, 1100], s: [14, 34], col: [255, 200, 80], col1: [190, 30, 0], g: 160 }); api.burst(x, y, 30 * power, { spd: [200, 700], life: [350, 800], s: [2, 5], col: [255, 245, 200], col1: [255, 120, 30], g: 260 }); api.smoke(x, y, 12 * power); api.ring(x, y, 220 * power, [255, 220, 140], 560, 10); api.ring(x, y, 140 * power, [255, 150, 60], 420, 6); },
    layer(fn) { layers.push(fn); return () => { const i = layers.indexOf(fn); if (i >= 0) layers.splice(i, 1); }; },   // draw anything each frame, under the particles
    stop() { alive = false; cv.remove(); },
  };
  function step(p, dt, i) { p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); return; } const f = dt / 1000; p.vx *= Math.pow(p.drag, dt / 16); p.vy *= Math.pow(p.drag, dt / 16); p.vy += p.g * f; p.x += p.vx * f; p.y += p.vy * f; }
  function draw(p) { const k = 1 - p.life / p.max, size = Math.max(0.5, p.s + (p.s1 - p.s) * k), c = mix(p.col, p.col1, Math.min(1, k * 1.4)); ctx.globalAlpha = Math.max(0, p.a * Math.pow(1 - k, p.add ? 1.2 : 0.8)); ctx.drawImage(sprite(c), p.x - size, p.y - size, size * 2, size * 2); ctx.globalAlpha = 1; }
  const loop = (now) => {
    if (!alive) return;
    let dt = Math.min(48, now - last); last = now;
    if (frozen > 0) { frozen -= dt; dt = 0; }
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    for (const fn of layers) { ctx.save(); try { fn(ctx); } catch {} ctx.restore(); }
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; if (p.add) continue; step(p, dt, i); if (p.life > 0) draw(p); }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; if (!p.add) continue; step(p, dt, i); if (p.life > 0) draw(p); }
    for (let i = beams.length - 1; i >= 0; i--) { const b = beams[i]; b.life -= dt; if (b.life <= 0) { beams.splice(i, 1); continue; } const k = b.life / b.max; ctx.lineCap = 'round'; for (const [ww, al, cc] of [[b.w * 2.2, 0.18, b.col], [b.w, 0.5, b.col], [b.w * 0.4, 0.95, [255, 250, 230]]]) { ctx.strokeStyle = `rgba(${cc[0]},${cc[1]},${cc[2]},${al * k})`; ctx.lineWidth = ww; ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke(); } }
    for (let i = bolts.length - 1; i >= 0; i--) {   // lightning re-jags a few times so it flickers
      const b = bolts[i]; b.life -= dt; if (b.life <= 0) { bolts.splice(i, 1); continue; }
      b.next -= dt; if (b.next <= 0) { b.next = 55; b.pts = jag(b.x0, b.y0, b.x1, b.y1, Math.hypot(b.x1 - b.x0, b.y1 - b.y0) * 0.12); b.subs = []; for (let s = 0; s < b.branches; s++) { const from = b.pts[Math.floor(rnd(4, b.pts.length - 4))]; const a = Math.atan2(b.y1 - b.y0, b.x1 - b.x0) + rnd(-1.1, 1.1), l = rnd(60, 160); b.subs.push(jag(from[0], from[1], from[0] + Math.cos(a) * l, from[1] + Math.sin(a) * l, l * 0.2, 4)); } }
      const k = Math.min(1, b.life / (b.max * 0.5)), line = (pts, w, al, c) => { ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${al * k})`; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath(); pts.forEach((q, j) => (j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke(); };
      line(b.pts, b.w * 3.2, 0.16, b.col); line(b.pts, b.w * 1.4, 0.5, b.col); line(b.pts, b.w * 0.5, 1, [255, 255, 255]);
      for (const sp of b.subs) { line(sp, b.w * 0.9, 0.45, b.col); line(sp, b.w * 0.3, 0.9, [255, 255, 255]); }
    }
    for (let i = slashes.length - 1; i >= 0; i--) {   // a bright crescent that sweeps across and fades
      const s = slashes[i]; s.life -= dt; if (s.life <= 0) { slashes.splice(i, 1); continue; }
      const k = 1 - s.life / s.max, reveal = Math.min(1, k / 0.35), fade = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65;
      const ca = Math.cos(s.ang), sa = Math.sin(s.ang), x0 = s.x - ca * s.len / 2, y0 = s.y - sa * s.len / 2, bend = s.len * 0.18;
      const pt = (t) => { const u = 1 - t, cx = s.x - sa * bend, cy = s.y + ca * bend; return [u * u * x0 + 2 * u * t * cx + t * t * (x0 + ca * s.len), u * u * y0 + 2 * u * t * cy + t * t * (y0 + sa * s.len)]; };
      for (const [ww, al, cc] of [[s.w * 2.4, 0.22, s.col], [s.w, 0.6, s.col], [s.w * 0.35, 1, [255, 255, 255]]]) { ctx.strokeStyle = `rgba(${cc[0]},${cc[1]},${cc[2]},${al * fade})`; ctx.lineWidth = ww; ctx.lineCap = 'round'; ctx.beginPath(); for (let j = 0; j <= 18; j++) { const q = pt((j / 18) * reveal); j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.stroke(); }
    }
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.life -= dt; if (r.life <= 0) { rings.splice(i, 1); continue; } const k = 1 - r.life / r.max, e = 1 - Math.pow(1 - k, 3); ctx.strokeStyle = `rgba(${r.col[0]},${r.col[1]},${r.col[2]},${(1 - k) * 0.9})`; ctx.lineWidth = Math.max(1, r.w * (1 - k)); ctx.beginPath(); ctx.arc(r.x, r.y, r.r1 * e, 0, 6.283); ctx.stroke(); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  document.body.append(cv);
  return api;
}


// ---- hand-drawn showdown props (canvas): a black hole with accretion disk, a flying saucer, a shark and a war hammer ----
function paintBlackHole(g, x, y, R, rot, a) {
  g.save(); g.globalAlpha = a; g.translate(x, y);
  let gr = g.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 3.2); gr.addColorStop(0, 'rgba(120,70,255,.5)'); gr.addColorStop(0.45, 'rgba(60,20,150,.2)'); gr.addColorStop(1, 'rgba(20,0,60,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R * 3.2, 0, 6.283); g.fill();
  const disk = (front) => {
    g.save(); g.rotate(-0.3); g.scale(1, 0.3); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 48; i++) {
      const q = i / 47, r = R * (1.06 + q * 1.4), a0 = Math.pow(1 - q, 1.2) * 0.6, gg = g.createLinearGradient(-r, 0, r, 0);
      gg.addColorStop(0, `rgba(255,${230 - q * 130 | 0},${150 - q * 110 | 0},${a0})`); gg.addColorStop(0.5, `rgba(255,${120 - q * 60 | 0},${50 + q * 40 | 0},${a0 * 0.4})`); gg.addColorStop(1, `rgba(170,70,255,${a0 * 0.3})`);
      g.strokeStyle = gg; g.lineWidth = R * 0.05; g.beginPath(); g.arc(0, 0, r, front ? 0 : Math.PI, front ? Math.PI : 6.283); g.stroke();
    }
    for (let k = 0; k < 14; k++) {   // glowing knots of matter orbiting in the disk
      const ang = rot * (1.6 - k * 0.05) + k * 0.9, r = R * (1.15 + (k % 5) * 0.28), px = Math.cos(ang) * r, py = Math.sin(ang) * r;
      if ((py > 0) !== front) continue; const kg = g.createRadialGradient(px, py, 0, px, py, R * 0.22); kg.addColorStop(0, 'rgba(255,240,210,.9)'); kg.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = kg; g.beginPath(); g.arc(px, py, R * 0.22, 0, 6.283); g.fill();
    }
    g.restore();
  };
  disk(false);
  g.globalCompositeOperation = 'source-over';
  const hg = g.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.18); hg.addColorStop(0, 'rgba(0,0,0,1)'); hg.addColorStop(0.7, 'rgba(0,0,0,.9)'); hg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = hg; g.beginPath(); g.arc(0, 0, R * 1.18, 0, 6.283); g.fill();
  g.fillStyle = '#000'; g.beginPath(); g.arc(0, 0, R, 0, 6.283); g.fill();
  g.globalCompositeOperation = 'lighter';
  const ring = g.createRadialGradient(0, 0, R * 0.96, 0, 0, R * 1.2); ring.addColorStop(0, 'rgba(255,255,255,0)'); ring.addColorStop(0.35, 'rgba(255,235,190,.95)'); ring.addColorStop(1, 'rgba(255,150,80,0)'); g.fillStyle = ring; g.beginPath(); g.arc(0, 0, R * 1.2, 0, 6.283); g.fill();   // the photon ring
  g.save(); g.rotate(-0.3); const lg = g.createLinearGradient(-R * 1.5, 0, R * 1.5, 0); lg.addColorStop(0, 'rgba(255,240,200,.85)'); lg.addColorStop(0.5, 'rgba(255,170,90,.6)'); lg.addColorStop(1, 'rgba(190,100,255,.35)'); g.strokeStyle = lg; g.lineWidth = R * 0.11; g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, R * 1.2, Math.PI * 1.08, Math.PI * 1.92); g.stroke(); g.restore();   // the far side of the disk, bent over the top
  g.globalCompositeOperation = 'source-over'; disk(true);
  g.restore();
}
function paintUfo(g, x, y, s, rot, t, ch = 0) {
  // a sleek saucer: brushed-metal lens hull with panel seams, a darker underside with a glowing core,
  // chasing rim lights and a smoked-glass dome with a faint pilot inside
  g.save(); g.translate(x, y); g.rotate(rot * 0.0174533); g.scale(s, s);
  const pulse = 0.5 + 0.5 * Math.sin(t / 160);
  // soft light it throws downward
  const glow = g.createRadialGradient(0, 30, 6, 0, 30, 110); glow.addColorStop(0, `rgba(110,255,210,${0.32 + 0.15 * ch})`); glow.addColorStop(1, 'rgba(110,255,210,0)'); g.fillStyle = glow; g.beginPath(); g.ellipse(0, 30, 112, 46, 0, 0, 6.283); g.fill();
  // underside
  const ug = g.createLinearGradient(0, 6, 0, 34); ug.addColorStop(0, '#3d4658'); ug.addColorStop(1, '#141a26'); g.fillStyle = ug; g.beginPath(); g.ellipse(0, 12, 84, 21, 0, 0, Math.PI); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(150,170,200,.25)'; g.lineWidth = 1.2; for (const rr of [62, 44]) { g.beginPath(); g.ellipse(0, 14, rr, rr * 0.24, 0, 0.1, Math.PI - 0.1); g.stroke(); }
  // the engine core, brighter while it charges
  const cr = 15 + 3 * pulse + 10 * ch, cg = g.createRadialGradient(0, 26, 0, 0, 26, cr * 1.9); cg.addColorStop(0, 'rgba(255,255,255,1)'); cg.addColorStop(0.3, `rgba(150,255,220,${0.85 + 0.15 * ch})`); cg.addColorStop(1, 'rgba(60,220,170,0)');
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = cg; g.beginPath(); g.ellipse(0, 26, cr * 1.9, cr * 0.75, 0, 0, 6.283); g.fill(); g.restore();
  g.fillStyle = '#0d121c'; g.beginPath(); g.ellipse(0, 24, 22, 6, 0, 0, 6.283); g.fill(); g.fillStyle = `rgba(190,255,235,${0.75 + 0.25 * pulse})`; g.beginPath(); g.ellipse(0, 25, 16, 3.6, 0, 0, 6.283); g.fill();
  // the top hull: a lens of brushed metal
  const hull = () => { g.beginPath(); g.moveTo(-92, 10); g.bezierCurveTo(-70, -6, -36, -18, 0, -19); g.bezierCurveTo(36, -18, 70, -6, 92, 10); g.bezierCurveTo(60, 17, -60, 17, -92, 10); g.closePath(); };
  const hg = g.createLinearGradient(0, -20, 0, 16); hg.addColorStop(0, '#f4f7fc'); hg.addColorStop(0.45, '#b9c4d4'); hg.addColorStop(0.8, '#7a879b'); hg.addColorStop(1, '#4a5466'); g.fillStyle = hg; hull(); g.fill();
  g.save(); hull(); g.clip();
  const sp = g.createLinearGradient(-92, 0, 92, 0); sp.addColorStop(0, 'rgba(255,255,255,0)'); sp.addColorStop(0.3, 'rgba(255,255,255,.55)'); sp.addColorStop(0.38, 'rgba(255,255,255,0)'); sp.addColorStop(0.7, 'rgba(255,255,255,.18)'); sp.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sp; g.fillRect(-95, -22, 190, 40);   // a specular band
  g.strokeStyle = 'rgba(40,52,70,.35)'; g.lineWidth = 1; for (let i = -5; i <= 5; i++) { if (!i) continue; const bx = i * 16; g.beginPath(); g.moveTo(bx * 0.35, -17); g.quadraticCurveTo(bx * 0.8, -6, bx * 1.12, 14); g.stroke(); }   // panel seams fanning out
  g.strokeStyle = 'rgba(40,52,70,.3)'; g.beginPath(); g.ellipse(0, 2, 70, 9, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  g.restore();
  // a bright machined rim
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-90, 10); g.bezierCurveTo(-60, 16.5, 60, 16.5, 90, 10); g.stroke();
  g.strokeStyle = 'rgba(20,28,40,.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-90, 11.6); g.bezierCurveTo(-60, 18.2, 60, 18.2, 90, 11.6); g.stroke();
  // chasing rim lights
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 11; i++) {
    const u = -0.86 + i * 0.172, lx = u * 88, ly = 10 + 5.5 * (1 - u * u), head = ((t / (95 - 50 * ch)) % 11 + 11) % 11, d = Math.min(Math.abs(i - head), 11 - Math.abs(i - head)), on = Math.max(0, 1 - d / 2.2);
    const lr = 3.2 + 4 * on, lg = g.createRadialGradient(lx, ly, 0, lx, ly, lr * 2); lg.addColorStop(0, `rgba(255,255,255,${0.55 + 0.45 * on})`); lg.addColorStop(0.35, `rgba(120,255,215,${0.45 + 0.5 * on})`); lg.addColorStop(1, 'rgba(120,255,215,0)'); g.fillStyle = lg; g.beginPath(); g.arc(lx, ly, lr * 2, 0, 6.283); g.fill();
  }
  g.restore();
  // dome collar
  const cl = g.createLinearGradient(0, -24, 0, -14); cl.addColorStop(0, '#dfe6f0'); cl.addColorStop(1, '#5c677a'); g.fillStyle = cl; g.beginPath(); g.ellipse(0, -18, 38, 7, 0, 0, 6.283); g.fill();
  // the dome: smoked glass, a faint pilot, reflections
  const dome = () => { g.beginPath(); g.moveTo(-33, -19); g.bezierCurveTo(-33, -46, -18, -58, 0, -58); g.bezierCurveTo(18, -58, 33, -46, 33, -19); g.closePath(); };
  const dg = g.createLinearGradient(0, -58, 0, -18); dg.addColorStop(0, 'rgba(40,110,140,.92)'); dg.addColorStop(1, 'rgba(12,36,58,.95)'); g.fillStyle = dg; dome(); g.fill();
  g.save(); dome(); g.clip();
  g.fillStyle = 'rgba(80,200,170,.35)'; g.beginPath(); g.ellipse(0, -30, 9, 10.5, 0, 0, 6.283); g.fill(); g.beginPath(); g.ellipse(0, -16, 15, 9, 0, Math.PI, 6.283); g.fill();   // the pilot's silhouette
  g.fillStyle = `rgba(170,255,225,${0.7 + 0.3 * pulse})`; for (const ex of [-3.6, 3.6]) { g.beginPath(); g.ellipse(ex, -31, 2.6, 1.5, ex < 0 ? 0.5 : -0.5, 0, 6.283); g.fill(); }
  const rf = g.createLinearGradient(-30, -56, 10, -24); rf.addColorStop(0, 'rgba(255,255,255,.75)'); rf.addColorStop(0.5, 'rgba(255,255,255,.08)'); rf.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rf; g.beginPath(); g.moveTo(-27, -24); g.bezierCurveTo(-28, -44, -16, -54, -2, -55); g.bezierCurveTo(-14, -50, -21, -40, -20, -24); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(14, -47, 3.4, 1.8, 0.7, 0, 6.283); g.fill();
  g.restore();
  g.strokeStyle = 'rgba(200,245,255,.7)'; g.lineWidth = 1.3; dome(); g.stroke();
  // a little antenna with a blinking tip
  g.strokeStyle = '#9aa6b8'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, -58); g.lineTo(0, -66); g.stroke();
  const at = (Math.floor(t / 420) % 2) ? 1 : 0.25; g.save(); g.globalCompositeOperation = 'lighter'; const ag = g.createRadialGradient(0, -67, 0, 0, -67, 7); ag.addColorStop(0, `rgba(255,120,120,${at})`); ag.addColorStop(1, 'rgba(255,80,80,0)'); g.fillStyle = ag; g.beginPath(); g.arc(0, -67, 7, 0, 6.283); g.fill(); g.restore();
  g.restore();
}
// the bite point (where the teeth meet) sits at local (SHARK_BITE_X, SHARK_BITE_Y); half the gape at full open is about SHARK_GAPE
const SHARK_BITE_X = 112, SHARK_BITE_Y = 13, SHARK_GAPE = 27;
function paintShark(g, x, y, s, rot, flip, open, chunk = 0) {
  g.save(); g.translate(x, y); g.rotate(rot * 0.0174533); g.scale(s * flip, s);
  const t = performance.now();
  g.lineJoin = 'round'; g.lineCap = 'round';
  const fin = (pts, c0, c1) => { const gr = g.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]); g.quadraticCurveTo(pts[3][0], pts[3][1], pts[4][0], pts[4][1]); g.closePath(); g.fill(); };
  // tail (the upper lobe longer), sweeping slightly
  const sw = Math.sin(t / 120) * 4;
  fin([[-126, -2], [-150, -30], [-188, -66 + sw], [-160, -26], [-142, 0]], '#4c6683', '#26384f');
  fin([[-136, 2], [-152, 16], [-172, 36 + sw * 0.6], [-152, 14], [-128, 6]], '#4c6683', '#2c3f58');
  // second dorsal and pelvic fins, far side pectoral
  fin([[-84, -22], [-92, -36], [-102, -38], [-96, -26], [-94, -18]], '#40597a', '#26384f');
  fin([[-70, 20], [-82, 34], [-96, 38], [-88, 26], [-84, 18]], '#5d7796', '#3a5170');
  // body: a torpedo, countershaded (slate-blue back, white belly with a crisp waterline)
  const body = () => { g.beginPath(); g.moveTo(132, 6); g.bezierCurveTo(124, -14, 92, -32, 40, -38); g.bezierCurveTo(-20, -42, -80, -28, -132, -2); g.lineTo(-132, 4); g.bezierCurveTo(-80, 22, -20, 32, 40, 32); g.bezierCurveTo(84, 30, 116, 22, 132, 6); g.closePath(); };
  const bg = g.createLinearGradient(0, -40, 0, 20); bg.addColorStop(0, '#2b3f58'); bg.addColorStop(0.5, '#4f6c8c'); bg.addColorStop(1, '#6f8aa6'); g.fillStyle = bg; body(); g.fill();
  g.save(); body(); g.clip();
  g.fillStyle = '#eef3f8'; g.beginPath(); g.moveTo(140, 8); g.bezierCurveTo(90, 4, 60, 10, 30, 6); g.bezierCurveTo(0, 2, -20, 12, -50, 10); g.bezierCurveTo(-80, 8, -110, 4, -140, 4); g.lineTo(-140, 50); g.lineTo(140, 50); g.closePath(); g.fill();
  const bs = g.createLinearGradient(0, 4, 0, 34); bs.addColorStop(0, 'rgba(255,255,255,0)'); bs.addColorStop(1, 'rgba(120,140,165,.45)'); g.fillStyle = bs; g.fillRect(-140, 4, 280, 40);   // the belly turns away from the light
  const rim = g.createLinearGradient(0, -40, 0, -20); rim.addColorStop(0, 'rgba(200,225,255,.45)'); rim.addColorStop(1, 'rgba(200,225,255,0)'); g.fillStyle = rim; g.fillRect(-140, -44, 280, 26);   // light catching the back
  g.strokeStyle = 'rgba(20,32,48,.55)'; g.lineWidth = 1.6; for (let i = 0; i < 5; i++) { const gx = 52 - i * 7; g.beginPath(); g.moveTo(gx, -16 + i); g.quadraticCurveTo(gx - 5, -2, gx + 1, 12 - i * 0.5); g.stroke(); }   // five gill slits
  g.restore();
  // dorsal fin, swept back, and the near pectoral fin
  fin([[18, -36], [-2, -70], [-34, -92], [-26, -56], [-44, -34]], '#3d5677', '#1f2f45');
  fin([[34, 18], [14, 44], [-18, 66], [-2, 40], [6, 20]], '#4c6683', '#2a3d56');
  // the head ahead of the hinge: the snout lifts as the jaw opens, the lower jaw drops
  const hx = 62, hy = 12, up = -0.16 * open, down = 0.62 * open;
  // the open mouth: dark gullet first
  if (open > 0.02) {
    g.save(); g.translate(hx, hy);
    const ut = [Math.cos(up) * 58 - Math.sin(up) * -2, Math.sin(up) * 58 + Math.cos(up) * -2], lt = [Math.cos(down) * 52 - Math.sin(down) * 8, Math.sin(down) * 52 + Math.cos(down) * 8];
    const mg = g.createRadialGradient(10, 4, 4, 18, 4, 60); mg.addColorStop(0, '#2a0508'); mg.addColorStop(0.6, '#6b1220'); mg.addColorStop(1, '#a8394a');
    g.fillStyle = mg; g.beginPath(); g.moveTo(-4, 0); g.lineTo(ut[0], ut[1]); g.quadraticCurveTo((ut[0] + lt[0]) / 2 + 6, (ut[1] + lt[1]) / 2, lt[0], lt[1]); g.closePath(); g.fill();
    g.restore();
  }
  // lower jaw
  g.save(); g.translate(hx, hy); g.rotate(down);
  const lj = g.createLinearGradient(0, 0, 0, 18); lj.addColorStop(0, '#f2f6fa'); lj.addColorStop(1, '#b9c7d6'); g.fillStyle = lj;
  g.beginPath(); g.moveTo(-6, 2); g.quadraticCurveTo(26, 12, 50, 10); g.quadraticCurveTo(56, 9, 58, 6); g.quadraticCurveTo(30, 4, -6, -1); g.closePath(); g.fill();
  if (open > 0.05) { g.fillStyle = '#c2475a'; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(28, 2, 54, 5); g.lineTo(54, 8); g.quadraticCurveTo(28, 6, 0, 3); g.closePath(); g.fill(); }   // gum
  g.fillStyle = '#fbfaf3'; for (let i = 0; i < 9; i++) { const tx = 8 + i * 5.4, ty = 3 + i * 0.25; g.beginPath(); g.moveTo(tx - 2.2, ty); g.lineTo(tx + 0.4, ty - 5.5 - (i % 2)); g.lineTo(tx + 2.4, ty); g.closePath(); g.fill(); }   // lower teeth, pointing up
  g.restore();
  // upper jaw / snout
  g.save(); g.translate(hx, hy); g.rotate(up);
  const sn = g.createLinearGradient(0, -40, 0, 0); sn.addColorStop(0, '#2b3f58'); sn.addColorStop(0.55, '#55728f'); sn.addColorStop(1, '#e6edf4'); g.fillStyle = sn;
  g.beginPath(); g.moveTo(-14, -44); g.bezierCurveTo(26, -42, 62, -24, 70, -6); g.quadraticCurveTo(70, 0, 62, 0); g.quadraticCurveTo(30, -2, -4, 0); g.closePath(); g.fill();
  if (open > 0.05) { g.fillStyle = '#c2475a'; g.beginPath(); g.moveTo(-2, -1); g.quadraticCurveTo(30, -3, 60, -1); g.lineTo(60, 2); g.quadraticCurveTo(30, 1, -2, 2); g.closePath(); g.fill(); }
  g.fillStyle = '#fbfaf3'; for (let i = 0; i < 10; i++) { const tx = 6 + i * 5.3, ty = -0.5; g.beginPath(); g.moveTo(tx - 2.4, ty); g.lineTo(tx + 0.2, ty + 6.5 + (i % 2) * 1.2); g.lineTo(tx + 2.6, ty); g.closePath(); g.fill(); }   // upper teeth, serrated triangles pointing down
  // the eye: dark, round, a cold glint; the nostril
  g.fillStyle = '#05070c'; g.beginPath(); g.ellipse(36, -14, 4.6, 4.2, 0, 0, 6.283); g.fill(); g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(37.6, -15.6, 1.4, 0, 6.283); g.fill();
  g.strokeStyle = 'rgba(15,25,40,.6)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(58, -10); g.quadraticCurveTo(62, -8, 64, -10); g.stroke();
  g.restore();
  // a torn piece of the card held in its teeth
  if (chunk > 0.01) {
    g.save(); g.translate(SHARK_BITE_X - 4, SHARK_BITE_Y); g.rotate(0.1); g.globalAlpha = chunk;
    g.fillStyle = '#f7f3ea'; g.strokeStyle = 'rgba(80,70,60,.5)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-4, -20); g.quadraticCurveTo(14, -14, 18, 0); g.quadraticCurveTo(14, 14, -4, 20); for (let i = 0; i < 6; i++) g.lineTo(i % 2 ? 2 : -3, 20 - (i + 1) * 6.6); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
  g.restore();
}
function paintHammer(g, x, y, s, rot, glow = 0) {
  // a forged war hammer: steel head shaded like real metal (sky above, dark horizon, ground below), worn bevels, an engraved
  // knotwork panel, a dark iron collar, a stitched leather grip over an ash shaft and an iron pommel with a strap
  g.save(); g.translate(x, y); g.rotate(rot * 0.0174533); g.scale(s, s);
  if (glow > 0.02) { g.globalCompositeOperation = 'lighter'; const ag = g.createRadialGradient(0, 0, 20, 0, 0, 170); ag.addColorStop(0, `rgba(255,200,120,${0.32 * glow})`); ag.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = ag; g.beginPath(); g.arc(0, 0, 170, 0, 6.283); g.fill(); g.globalCompositeOperation = 'source-over'; }
  const rr = (x0, y0, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x0, y0, w, h, r) : g.rect(x0, y0, w, h); };
  const cyl = (x0, w, stops) => { const gr = g.createLinearGradient(x0, 0, x0 + w, 0); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };   // round things are lit from the left
  // ---- the shaft: pale ash with grain, then a leather grip wound in a spiral and stitched ----
  g.fillStyle = cyl(-13, 26, [[0, '#4a3420'], [0.3, '#a58457'], [0.55, '#c49f6c'], [1, '#3e2b19']]); rr(-13, -320, 26, 330, 6); g.fill();
  g.strokeStyle = 'rgba(60,38,18,.35)'; g.lineWidth = 0.9; for (let i = -10; i <= 10; i += 4) { g.beginPath(); g.moveTo(i, -320); g.bezierCurveTo(i + 2, -240, i - 2, -120, i + 1, 10); g.stroke(); }
  for (let i = 0; i < 11; i++) {   // overlapping leather bands: each one darker at its lower edge where it tucks under the next
    const yy = -86 - i * 19, band = new Path2D(); band.moveTo(-14.5, yy + 9); band.lineTo(14.5, yy - 4); band.lineTo(14.5, yy + 13); band.lineTo(-14.5, yy + 26); band.closePath();
    g.fillStyle = cyl(-14.5, 29, [[0, '#2a170c'], [0.35, '#6e4426'], [0.5, '#80522e'], [1, '#22130a']]); g.fill(band);
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-14.5, yy + 26); g.lineTo(14.5, yy + 13); g.stroke();
    g.strokeStyle = 'rgba(230,200,150,.55)'; g.lineWidth = 0.9; g.setLineDash([2.2, 2.4]); g.beginPath(); g.moveTo(-12, yy + 13); g.lineTo(12, yy + 2); g.stroke(); g.setLineDash([]);
  }
  // iron pommel with a leather strap loop
  g.strokeStyle = '#3b2412'; g.lineWidth = 5.5; g.beginPath(); g.ellipse(0, -352, 12, 15, 0, 0, 6.283); g.stroke(); g.strokeStyle = 'rgba(160,110,70,.5)'; g.lineWidth = 1.2; g.stroke();
  g.fillStyle = cyl(-18, 36, [[0, '#1f242c'], [0.3, '#8e98a8'], [0.45, '#d3dae4'], [0.7, '#59626f'], [1, '#161a20']]); rr(-18, -338, 36, 22, 6); g.fill(); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1.5; g.stroke();
  // the dark iron collar where the shaft goes into the head
  g.fillStyle = cyl(-19, 38, [[0, '#14181e'], [0.35, '#5c6573'], [0.5, '#8a93a1'], [1, '#101318']]); rr(-19, -70, 38, 16, 3); g.fill(); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-19, -56, 38, 2);
  // ---- the head ----
  const HW = 100, HH = 56, C = 14;
  const outline = new Path2D(); outline.moveTo(-HW + C, -HH); outline.lineTo(HW - C, -HH); outline.lineTo(HW, -HH + C); outline.lineTo(HW, HH - C); outline.lineTo(HW - C, HH); outline.lineTo(-HW + C, HH); outline.lineTo(-HW, HH - C); outline.lineTo(-HW, -HH + C); outline.closePath();
  g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 18; g.shadowOffsetY = 8; g.fillStyle = '#2a3039'; g.fill(outline); g.restore();
  const steel = g.createLinearGradient(0, -HH, 0, HH);   // polished steel mirrors its surroundings: bright sky, a sharp dark horizon, the ground
  steel.addColorStop(0, '#f4f7fb'); steel.addColorStop(0.16, '#c2cbd7'); steel.addColorStop(0.42, '#7b8696'); steel.addColorStop(0.5, '#2c333d'); steel.addColorStop(0.56, '#4a5361'); steel.addColorStop(0.8, '#69727f'); steel.addColorStop(1, '#22272f');
  g.fillStyle = steel; g.fill(outline);
  g.save(); g.clip(outline);
  for (let i = 0; i < 70; i++) { const yy = -HH + ((i * 37) % 112) + (i % 3) * 0.4; g.strokeStyle = i % 2 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.07)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-HW, yy); g.lineTo(HW, yy + 0.6); g.stroke(); }   // brushed grain
  for (const sx of [-1, 1]) {   // the striking faces: separate thick plates, a touch darker and battered
    const fx = sx > 0 ? HW - 26 : -HW, fg = g.createLinearGradient(0, -HH, 0, HH); fg.addColorStop(0, '#dfe5ed'); fg.addColorStop(0.45, '#5c6573'); fg.addColorStop(0.52, '#232931'); fg.addColorStop(1, '#3a414c');
    g.fillStyle = fg; g.fillRect(fx, -HH, 26, 2 * HH); g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(sx > 0 ? fx : fx + 24, -HH, 2, 2 * HH); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(sx > 0 ? fx + 2 : fx + 22, -HH, 1, 2 * HH);
    for (let k = 0; k < 6; k++) { const dx = fx + 4 + ((k * 7) % 18), dy = -HH + 10 + ((k * 29) % 90); g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(dx, dy, 3, 2, 0.4, 0, 6.283); g.fill(); g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(dx - 1, dy - 1, 2, 1, 0.4, 0, 6.283); g.fill(); }   // hammer marks
  }
  // the engraved panel: a recessed field with knotwork cut into it (dark groove, light lip below it)
  const PW = 52, PH = 34; g.fillStyle = 'rgba(10,14,20,.35)'; rr(-PW, -PH, PW * 2, PH * 2, 5); g.fill(); g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-PW + 4, PH); g.lineTo(PW - 4, PH); g.stroke(); g.strokeStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.moveTo(-PW + 4, -PH); g.lineTo(PW - 4, -PH); g.stroke();
  const knot = new Path2D(); for (let i = 0; i < 4; i++) { const cx = -36 + i * 24; knot.moveTo(cx - 12, -16); knot.bezierCurveTo(cx - 2, -30, cx + 14, -2, cx + 12, 16); knot.moveTo(cx - 12, 16); knot.bezierCurveTo(cx - 2, 30, cx + 14, 2, cx + 12, -16); } knot.moveTo(-48, 0); knot.bezierCurveTo(-30, -26, 30, 26, 48, 0); knot.moveTo(-48, 0); knot.bezierCurveTo(-30, 26, 30, -26, 48, 0);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.save(); g.translate(0, 1.2); g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 3.4; g.stroke(knot); g.restore();
  g.strokeStyle = 'rgba(12,16,22,.85)'; g.lineWidth = 3; g.stroke(knot);
  if (glow > 0.05) { g.strokeStyle = `rgba(255,170,80,${0.75 * glow})`; g.lineWidth = 1.6; g.stroke(knot); }   // the engraving glows when it is charged
  // wear: fine scratches and nicks along the edges
  for (let i = 0; i < 26; i++) { const sx2 = -HW + ((i * 53) % 190) + 5, sy2 = -HH + ((i * 31) % 104) + 4, l = 6 + (i % 5) * 4, a = (i % 7) * 0.35 - 1; g.strokeStyle = i % 2 ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.25)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(sx2, sy2); g.lineTo(sx2 + Math.cos(a) * l, sy2 + Math.sin(a) * l); g.stroke(); }
  g.restore();
  // bevels: a bright catch of light on the upper chamfers and the top edge, shade on the lower ones
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-HW, -HH + C); g.lineTo(-HW + C, -HH); g.lineTo(HW - C, -HH); g.lineTo(HW, -HH + C); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-HW + C + 2, -HH + 4); g.lineTo(HW - C - 2, -HH + 4); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-HW, HH - C); g.lineTo(-HW + C, HH); g.lineTo(HW - C, HH); g.lineTo(HW, HH - C); g.stroke();
  g.strokeStyle = 'rgba(8,10,14,.9)'; g.lineWidth = 1.5; g.stroke(outline);
  if (glow > 0.05) { g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = `rgba(255,190,110,${0.5 * glow})`; g.lineWidth = 3; g.stroke(outline); g.restore(); }   // heat at the rim on impact
  // a sliver of the top face, seen from a little above: the head reads as a solid block, not a plate
  const top = new Path2D(); top.moveTo(-HW + C, -HH); top.lineTo(-HW + C + 10, -HH - 11); top.lineTo(HW - C - 10, -HH - 11); top.lineTo(HW - C, -HH); top.closePath();
  const tg = g.createLinearGradient(0, -HH - 11, 0, -HH); tg.addColorStop(0, '#8d98a8'); tg.addColorStop(1, '#e6ecf3'); g.fillStyle = tg; g.fill(top); g.strokeStyle = 'rgba(8,10,14,.8)'; g.lineWidth = 1.3; g.stroke(top);
  g.fillStyle = cyl(-17, 34, [[0, '#14181e'], [0.35, '#5c6573'], [0.5, '#8a93a1'], [1, '#101318']]); rr(-17, -HH - 22, 34, 14, 3); g.fill();   // the collar sits on top of it
  g.restore();
}
function paintNinja(g, x, y, s, a, t) {
  g.save(); g.translate(x, y); g.scale(s, s); g.globalAlpha = a;
  const flow = Math.sin(t / 110) * 6;
  g.fillStyle = '#c41e3a'; g.beginPath(); g.moveTo(24, 6); g.quadraticCurveTo(70, -4 + flow, 96, 16 + flow * 2); g.quadraticCurveTo(66, 12 + flow, 28, 18); g.closePath(); g.fill();   // headband tails
  g.beginPath(); g.moveTo(24, 10); g.quadraticCurveTo(64, 14 + flow, 90, 40 + flow * 1.5); g.quadraticCurveTo(62, 26 + flow, 26, 22); g.closePath(); g.fill();
  const hood = g.createRadialGradient(-10, -12, 4, 0, 0, 52); hood.addColorStop(0, '#2b3350'); hood.addColorStop(1, '#070a14');
  g.fillStyle = hood; g.beginPath(); g.arc(0, 0, 44, 0, 6.283); g.fill();
  g.fillStyle = '#e9d2b6'; g.beginPath(); g.ellipse(2, 2, 30, 12, 0, 0, 6.283); g.fill();   // the eye slit
  g.fillStyle = '#0a0d18'; g.fillRect(-30, 8, 66, 24);
  g.fillStyle = '#c41e3a'; g.fillRect(-44, -18, 88, 11);   // headband
  g.save(); g.globalCompositeOperation = 'lighter'; for (const ex of [-12, 16]) { const eg = g.createRadialGradient(ex, 2, 0, ex, 2, 14); eg.addColorStop(0, 'rgba(255,255,255,1)'); eg.addColorStop(0.4, 'rgba(255,90,90,.9)'); eg.addColorStop(1, 'rgba(255,40,40,0)'); g.fillStyle = eg; g.beginPath(); g.arc(ex, 2, 14, 0, 6.283); g.fill(); } g.restore();
  g.fillStyle = '#0a0d18'; g.beginPath(); g.moveTo(-18, -2); g.lineTo(-4, 4); g.lineTo(-18, 5); g.closePath(); g.fill(); g.beginPath(); g.moveTo(26, -2); g.lineTo(12, 4); g.lineTo(26, 5); g.closePath(); g.fill();
  g.restore();
}
function paintShuriken(g, x, y, r, rot, a) {
  g.save(); g.globalAlpha = a; g.translate(x, y); g.rotate(rot * 0.0174533);
  for (let i = 0; i < 4; i++) {
    const an = i * Math.PI / 2, tx = Math.cos(an) * r, ty = Math.sin(an) * r, l = [Math.cos(an + 0.8) * r * 0.34, Math.sin(an + 0.8) * r * 0.34], rr2 = [Math.cos(an - 0.8) * r * 0.34, Math.sin(an - 0.8) * r * 0.34];
    const lg = g.createLinearGradient(0, 0, tx, ty); lg.addColorStop(0, '#9aa5b8'); lg.addColorStop(1, '#ffffff');
    g.fillStyle = lg; g.beginPath(); g.moveTo(0, 0); g.lineTo(l[0], l[1]); g.lineTo(tx, ty); g.closePath(); g.fill();
    const dg = g.createLinearGradient(0, 0, tx, ty); dg.addColorStop(0, '#3b4458'); dg.addColorStop(1, '#8793a8');
    g.fillStyle = dg; g.beginPath(); g.moveTo(0, 0); g.lineTo(rr2[0], rr2[1]); g.lineTo(tx, ty); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(15,20,32,.9)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(tx, ty); g.lineTo(rr2[0], rr2[1]); g.stroke();
  }
  g.fillStyle = '#1a2030'; g.beginPath(); g.arc(0, 0, r * 0.26, 0, 6.283); g.fill(); g.strokeStyle = '#c9a24a'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#05070c'; g.beginPath(); g.arc(0, 0, r * 0.12, 0, 6.283); g.fill();
  g.restore();
}
function paintMeteor(g, hx, hy, dx, dy, sz, rocks) {
  const L = 230 * sz, nx = -dy, ny = dx;
  g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
  for (const [w, c0, c1, l] of [[34, 'rgba(255,70,10,.4)', 'rgba(255,60,10,0)', 1], [22, 'rgba(255,150,40,.65)', 'rgba(255,100,20,0)', 0.8], [9, 'rgba(255,250,215,.95)', 'rgba(255,200,100,0)', 0.45]]) { const gr = g.createLinearGradient(hx, hy, hx + dx * L * l, hy + dy * L * l); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.strokeStyle = gr; g.lineWidth = w * sz; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + dx * L * l, hy + dy * L * l); g.stroke(); }
  for (let i = -1; i <= 1; i += 2) { const gr = g.createLinearGradient(hx, hy, hx + dx * L * 0.7 + nx * i * 26 * sz, hy + dy * L * 0.7 + ny * i * 26 * sz); gr.addColorStop(0, 'rgba(255,170,60,.5)'); gr.addColorStop(1, 'rgba(255,80,10,0)'); g.strokeStyle = gr; g.lineWidth = 9 * sz; g.beginPath(); g.moveTo(hx + nx * i * 6 * sz, hy + ny * i * 6 * sz); g.quadraticCurveTo(hx + dx * L * 0.35 + nx * i * 22 * sz, hy + dy * L * 0.35 + ny * i * 22 * sz, hx + dx * L * 0.7 + nx * i * 26 * sz, hy + dy * L * 0.7 + ny * i * 26 * sz); g.stroke(); }
  const hg = g.createRadialGradient(hx, hy, 0, hx, hy, 52 * sz); hg.addColorStop(0, 'rgba(255,240,200,.85)'); hg.addColorStop(0.4, 'rgba(255,140,40,.45)'); hg.addColorStop(1, 'rgba(255,60,10,0)'); g.fillStyle = hg; g.beginPath(); g.arc(hx, hy, 52 * sz, 0, 6.283); g.fill();
  g.globalCompositeOperation = 'source-over';
  const R = 19 * sz; g.beginPath(); rocks.forEach((f, i) => { const a = i / rocks.length * 6.283, q = [hx + Math.cos(a) * R * f, hy + Math.sin(a) * R * f]; i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath();
  const rg = g.createRadialGradient(hx - dx * R * 0.4, hy - dy * R * 0.4, 1, hx, hy, R * 1.2); rg.addColorStop(0, '#7a5a40'); rg.addColorStop(0.5, '#2f1f15'); rg.addColorStop(1, '#0d0705'); g.fillStyle = rg; g.fill(); g.strokeStyle = 'rgba(255,170,70,.85)'; g.lineWidth = 2 * sz; g.stroke();
  g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,150,50,.85)'; g.lineWidth = 1.6 * sz; for (let k = 0; k < 3; k++) { const a = k * 2.1 + rocks[0]; g.beginPath(); g.moveTo(hx + Math.cos(a) * R * 0.15, hy + Math.sin(a) * R * 0.15); g.lineTo(hx + Math.cos(a + 0.4) * R * 0.8, hy + Math.sin(a + 0.4) * R * 0.8); g.stroke(); }
  g.restore();
}
function paintCannon(g, x, y, ang, rec, spin, fuse, t) {
  g.save(); g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,.38)'; g.beginPath(); g.ellipse(0, 44, 76, 13, 0, 0, 6.283); g.fill();
  const wd = g.createLinearGradient(0, 4, 0, 36); wd.addColorStop(0, '#8a5a30'); wd.addColorStop(1, '#4a2c14');
  g.fillStyle = wd; g.beginPath(); g.moveTo(-52, 8); g.lineTo(46, 8); g.lineTo(34, 40); g.lineTo(-40, 40); g.closePath(); g.fill(); g.strokeStyle = '#2a1608'; g.lineWidth = 3; g.stroke();
  g.strokeStyle = '#2b2f38'; g.lineWidth = 5; g.beginPath(); g.moveTo(-46, 16); g.lineTo(40, 16); g.stroke();
  const wc = [0, 24], WR = 36;
  g.fillStyle = '#7a4f28'; g.strokeStyle = '#21140a'; g.lineWidth = 4; g.beginPath(); g.arc(wc[0], wc[1], WR, 0, 6.283); g.fill(); g.stroke();
  g.strokeStyle = '#2a2f39'; g.lineWidth = 6; g.beginPath(); g.arc(wc[0], wc[1], WR - 3, 0, 6.283); g.stroke();
  g.strokeStyle = '#c99b4e'; g.lineWidth = 5; for (let i = 0; i < 8; i++) { const a = spin + i * 0.7854; g.beginPath(); g.moveTo(wc[0] + Math.cos(a) * 8, wc[1] + Math.sin(a) * 8); g.lineTo(wc[0] + Math.cos(a) * (WR - 5), wc[1] + Math.sin(a) * (WR - 5)); g.stroke(); }
  g.fillStyle = '#e8bd62'; for (let i = 0; i < 12; i++) { const a = spin + i * 0.5236; g.beginPath(); g.arc(wc[0] + Math.cos(a) * (WR - 3), wc[1] + Math.sin(a) * (WR - 3), 2.2, 0, 6.283); g.fill(); }
  const hub = g.createRadialGradient(wc[0] - 2, wc[1] - 2, 1, wc[0], wc[1], 9); hub.addColorStop(0, '#fff2c0'); hub.addColorStop(1, '#a8741a'); g.fillStyle = hub; g.beginPath(); g.arc(wc[0], wc[1], 9, 0, 6.283); g.fill();
  const flip = Math.cos(ang) < 0 ? -1 : 1;
  g.save(); g.translate(0, -4); g.rotate(ang); g.scale(1, flip); g.translate(-rec, 0);
  const bg = g.createLinearGradient(0, -24, 0, 24); bg.addColorStop(0, '#8b97a8'); bg.addColorStop(0.25, '#4b5566'); bg.addColorStop(0.7, '#1e2530'); bg.addColorStop(1, '#0a0d13');
  g.fillStyle = bg; g.beginPath(); g.moveTo(-30, -24); g.lineTo(80, -18); g.lineTo(80, 18); g.lineTo(-30, 24); g.closePath(); g.fill(); g.beginPath(); g.arc(-30, 0, 24, Math.PI / 2, Math.PI * 1.5); g.fill();
  g.fillStyle = '#1a1f29'; g.beginPath(); g.arc(-56, 0, 9, 0, 6.283); g.fill(); g.fillRect(-56, -3, 20, 6);
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-40, -19); g.lineTo(76, -14); g.stroke();
  const gd = g.createLinearGradient(0, -22, 0, 22); gd.addColorStop(0, '#fff0b0'); gd.addColorStop(0.5, '#d4a02a'); gd.addColorStop(1, '#6e4a0a');
  g.fillStyle = gd; for (const bx of [-12, 24, 58]) { const h = 23 - (bx + 30) * 0.045; g.fillRect(bx, -h, 8, h * 2); }
  g.fillRect(78, -21, 14, 42); g.fillStyle = '#000'; g.beginPath(); g.ellipse(92, 0, 3.5, 13, 0, 0, 6.283); g.fill();
  g.strokeStyle = '#6b5528'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-14, -23); g.quadraticCurveTo(-18, -38, -10, -46); g.stroke();
  if (fuse) { const fx = -10, fy = -46, fl = 0.7 + 0.3 * Math.sin(t / 40), fg = g.createRadialGradient(fx, fy, 0, fx, fy, 16 * fl); fg.addColorStop(0, 'rgba(255,255,230,1)'); fg.addColorStop(0.4, 'rgba(255,170,50,.8)'); fg.addColorStop(1, 'rgba(255,90,10,0)'); g.globalCompositeOperation = 'lighter'; g.fillStyle = fg; g.beginPath(); g.arc(fx, fy, 16 * fl, 0, 6.283); g.fill(); }
  g.restore(); g.restore();
}

// while a strike is playing the page holds still: the creatures are aimed at where the loser's card is, and a finger scroll would make them miss
// (the attack moves the camera itself; the Skip button still works)
{ const busy = () => !!document.querySelector('.atkfx');
  const stop = (e) => { if (busy() && !(e.target.closest && e.target.closest('.atkskip, button, .guide-ov, .drinkfx, .shop-ov, .set-ov'))) e.preventDefault(); };   // an open popup (the shop, settings, chat…) still scrolls
  for (const ev of ['wheel', 'touchmove']) document.addEventListener(ev, stop, { passive: false });
  document.addEventListener('keydown', (e) => { if (busy() && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) e.preventDefault(); }); }
async function runShowdown(res) {
  const release = (id, keepCards = false) => {   // the verdict lands on that tile: the card tears, the tile turns red, the tag says LOST
    atkHeld.delete(id);
    const tile = document.querySelector(`.tile[data-pid="${id}"]`), e = res.entries.find((x) => x.id === id);
    if (!tile || !e) return;
    tile.classList.add('lose');
    const cards = tile.querySelector('.tcards'); if (cards && !keepCards) { cards.replaceChildren(...e.cards.map((c, ci) => tornCard(c, true, e.as ? e.as[ci] : null, 0, atkStyleOf(res)))); cards.querySelectorAll('.tcard.end').forEach((n) => n.classList.add('hitin')); }
    const tag = tile.querySelector('.tstat'); if (tag) tag.replaceWith(el('span', { class: 'tstat lost' }, icon('x', 12), t('lostTag')));
    if (!res.losers.some((x) => atkHeld.has(x))) document.querySelectorAll('.tile .tstat.pend').forEach((n) => n.replaceWith(el('span', { class: 'tstat safe' }, icon('tick', 12), t('safeTag'))));   // the last strike landed: everyone else is safe
  };
  const releaseAll = () => res.losers.slice().forEach(release);
  let E = null;
  try {
    const ent = res.entries, champ = ent.reduce((a, e) => (!a || strengthOf(res, e) > strengthOf(res, a) ? e : a), null);
    const targets = res.losers.map((id) => ent.find((e) => e.id === id)).filter(Boolean);
    // every player tied for the strongest hand sends a creature: they are paired off with the losers (as many strikes as the bigger side, at most three)
    const champs = champ ? ent.filter((e) => strengthOf(res, e) === strengthOf(res, champ) && !res.losers.includes(e.id)).slice(0, 3) : [];
    if (champ && !champs.length) champs.push(champ);
    const pairs = Array.from({ length: Math.min(3, Math.max(champs.length, targets.length)) }, (_, i) => ({ champ: champs[i % champs.length], tgt: targets[i % targets.length] }));
    const W = window.innerWidth, H = window.innerHeight, style = ATK_STYLES[(st.round * 5 + res.row * 3 + res.losers.length) % ATK_STYLES.length];
    const blocked = !!document.querySelector('.guide-ov, .avbig') || document.hidden;
    const tileOf = (id) => document.querySelector(`.tile[data-pid="${id}"]`);
    const champTile = champ && tileOf(champ.id);
    if (!champ || !targets.length || reduceFx()) { releaseAll(); if (st) render(); return; }
    SND.play({ thunder: 'thunder', eagle: 'swoop', meteors: 'swoop', shark: 'swoop', ninja: 'whistle', fist: 'whistle', ufo: 'whistle', cannon: 'tick', ice: 'chime' }[style] || 'roar');
    const fx = el('div', { class: 'atkfx' }); document.body.append(fx);
    E = atkEngine();
    let skip = false;
    fx.append(el('button', { type: 'button', class: 'atkskip', onclick: () => { skip = true; } }, t('atkSkip')));
    const cap = el('div', { class: 'atkcap' }, t('atkCaption', { name: champ.name })); fx.append(cap);
    const rnd = E.rnd, app = document.getElementById('app');
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const tween = async (ms, fn) => { const t0 = performance.now(); for (;;) { await raf(); const k = skip ? 1 : Math.min(1, (performance.now() - t0) / ms); fn(k); if (k >= 1) break; } };
    const wait = (ms) => atkWait(skip ? 0 : ms);
    const ease = (k) => (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
    const mk = (css, html = '') => { const d = el('i', { class: 'atkbit' }); d.style.cssText = css; if (html) d.innerHTML = html; fx.append(d); return d; };
    const anim = (n, f, o) => { try { return n.animate(f, o); } catch { return null; } };
    const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - H);
    const docPos = (n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + window.scrollY + r.height / 2 }; };
    let scrollNow = window.scrollY;
    const follow = (docY, rate = 0.18) => { const want = Math.max(0, Math.min(maxScroll(), docY - H * 0.45)); scrollNow += (want - scrollNow) * rate; window.scrollTo(0, scrollNow); };
    const vp = (pos) => ({ x: pos.x, y: pos.y - window.scrollY });
    // ---- screen effects ----
    const dimEl = mk('inset:0;width:100vw;height:100vh;background:radial-gradient(circle at 50% 45%, rgba(0,0,0,.35), rgba(0,0,0,.8));opacity:0;transition:opacity .3s ease'); dimEl.style.zIndex = '82';
    const setDim = (a) => { dimEl.style.opacity = String(a); };
    const flash = (col = '#fff', a = 0.6, ms = 260) => { const f = mk(`inset:0;width:100vw;height:100vh;background:${col};z-index:86`); anim(f, [{ opacity: a }, { opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' }); setTimeout(() => f.remove(), ms + 50); };
    const shake = (amp = 10, ms = 460) => { if (!app) return; const fr = [{ transform: 'none' }]; for (let i = 0; i < 9; i++) { const k = 1 - i / 9; fr.push({ transform: `translate(${(rnd(-1, 1) * amp * k).toFixed(1)}px,${(rnd(-1, 1) * amp * k).toFixed(1)}px) rotate(${(rnd(-1, 1) * amp * k * 0.06).toFixed(2)}deg)` }); } fr.push({ transform: 'none' }); anim(app, fr, { duration: ms }); };
    const punch = (x, y, s = 1.07, ms = 340) => { if (!app) return; app.style.transformOrigin = `${x}px ${y + window.scrollY}px`; const a = anim(app, [{ transform: 'scale(1)' }, { transform: `scale(${s})`, offset: .22 }, { transform: 'scale(1)' }], { duration: ms, easing: 'ease-out' }); if (a) a.onfinish = () => { app.style.transformOrigin = ''; }; };
    const jitter = (amp) => { if (app) app.style.transform = amp ? `translate(${rnd(-amp, amp).toFixed(1)}px,${rnd(-amp, amp).toFixed(1)}px)` : ''; };
    const pop = (x, y, text, col = '#ff5a5a', delay = 0) => { y = Math.max(y, 250); x = Math.min(W - 130, Math.max(60, x)); const p = mk(`font:900 80px system-ui;color:${col};-webkit-text-stroke:4px #fff;paint-order:stroke fill;text-shadow:0 6px 0 rgba(0,0,0,.45), 0 0 28px ${col}, 0 0 4px #000;white-space:nowrap;z-index:95;opacity:0`, text); anim(p, [{ transform: `translate(${x - 40}px,${y - 30}px) scale(.2) rotate(-10deg)`, opacity: 0 }, { transform: `translate(${x - 40}px,${y - 60}px) scale(1.5) rotate(-6deg)`, opacity: 1, offset: .1 }, { transform: `translate(${x - 40}px,${y - 70}px) scale(1.1) rotate(-4deg)`, opacity: 1, offset: .7 }, { transform: `translate(${x - 40}px,${y - 130}px) scale(1)`, opacity: 0 }], { duration: 1900, delay, fill: 'forwards' }); };
    const hurt = (tile) => { try { tile.animate([{ transform: 'none', filter: 'brightness(1)' }, { transform: 'translate(-12px,4px) rotate(-2.5deg)', filter: 'brightness(2.2)', offset: .12 }, { transform: 'translate(10px,-4px) rotate(2deg)', filter: 'brightness(1.4)', offset: .3 }, { transform: 'translate(-7px,2px)', offset: .5 }, { transform: 'translate(4px)', offset: .7 }, { transform: 'none', filter: 'brightness(1)' }], { duration: 640 }); tile.animate([{ boxShadow: '0 0 0 0 rgba(255,80,80,0)' }, { boxShadow: '0 0 0 6px rgba(255,90,90,.95), 0 0 60px rgba(255,80,80,.9)', offset: .2 }, { boxShadow: '0 0 0 0 rgba(255,80,80,0)' }], { duration: 1100 }); } catch {} };
    const scorch = (tile, col) => { const s = mk(`position:absolute;inset:0;width:100%;height:100%;border-radius:14px;background:radial-gradient(circle at 50% 55%, ${col}, transparent 70%);mix-blend-mode:multiply;opacity:0`); tile.append(s); anim(s, [{ opacity: 0 }, { opacity: .85, offset: .25 }, { opacity: .55 }], { duration: 1400, fill: 'forwards' }); setTimeout(() => s.remove(), 1450); };
    const creature = (emoji, size) => { const c = mk(`font-size:${size}px;line-height:1;width:${size}px;height:${size}px;filter:drop-shadow(0 10px 14px rgba(0,0,0,.55));will-change:transform;z-index:85`); c.innerHTML = `<span class="atkflap">${emoji}</span>`; c.size = size; return c; };
    const place = (c, x, y, s = 1, rot = 0, flip = 1) => { c.style.transform = `translate(${x - c.size / 2}px,${y - c.size / 2}px) scale(${(s * flip).toFixed(3)},${s.toFixed(3)}) rotate(${rot.toFixed(1)}deg)`; };
    const tileRect = (n) => n.getBoundingClientRect();

    // ---- a screen is in the way (shop, chat, settings...): one quick pass across the foreground ----
    if (blocked || !champTile) {
      cap.remove();
      const emo = { dragon: '🐉', eagle: '🦅', thunder: '⛈️', comet: '☄️', meteors: '🌠', shark: '🦈', ninja: '🥷', blackhole: '🌀', fist: '🔨', ice: '🧊', cannon: '💣', ufo: '🛸' }[style], c = creature(emo, 96);
      let hx = W * 0.8, hy = H * 0.62;
      await tween(900, (k) => { const e = ease(k), x = -60 + (W * 0.8 + 60) * e, y = H * 0.2 + H * 0.42 * e + Math.sin(k * 9) * 14; place(c, x, y, 0.6 + 0.5 * Math.min(1, k * 3), 14); E.flame(x - 30, y + 10, -1, 0.2, 3, { spd: 160, spread: 0.6, size: [12, 26], life: [300, 500] }); });
      c.remove(); E.explosion(hx, hy, 1.2); flash('#fff', 0.45, 240); shake(12); SND.play('impact'); releaseAll();
      await wait(700); E.stop(); fx.remove(); if (st) render(); return;
    }

    // ---- 1) the screen goes to the strongest hand, which charges up ----
    // all the tied hands charge up together; the screen goes to the first of them
    const charge = async () => {
      const cs = [...new Map(pairs.map((p) => [p.champ.id, p.champ])).values()];
      const tl0 = tileOf(cs[0].id) || champTile;
      await panAttackCamera(docPos(tl0).y, H, tween); scrollNow = window.scrollY;
      for (const c of cs) {
        const tl = tileOf(c.id); if (!tl) continue;
        anim(tl, [{ boxShadow: '0 0 0 0 rgba(255,207,64,0)' }, { boxShadow: '0 0 0 5px rgba(255,207,64,.98), 0 0 70px rgba(255,207,64,.95)', offset: .4 }, { boxShadow: '0 0 0 0 rgba(255,207,64,0)' }], { duration: 950 });
        const r = tileRect(tl); for (let i = 0; i < 28; i++) E.emit({ x: r.left + rnd(0, r.width), y: r.top + rnd(0, r.height), vx: rnd(-20, 20), vy: rnd(-200, -60), g: -30, life: rnd(500, 900), s: rnd(4, 9), s1: 0, col: [255, 235, 150], col1: [255, 160, 30], drag: 0.97 });
      }
      cap.textContent = t(cs.length > 1 ? 'atkCaptionN' : 'atkCaption', { name: cs.map((c) => c.name).join(' & ') });
      cap.classList.add('on');
      await wait(420);
      setDim(style === 'thunder' ? 0.9 : 0.55);
    };
    await charge();
    const shown = pairs.map((p) => p.tgt), seen = new Set(), followBase = follow, jitterBase = jitter, flashBase = flash;
    const anchoredStrikes = style === 'ice' || style === 'blackhole';
    // These effects cover a tile. Keep their drawing in document coordinates
    // while the camera travels to the next target.
    const tileLayer = (draw) => {
      const scrollAtStart = window.scrollY;
      return E.layer((g) => { g.save(); g.translate(0, scrollAtStart - window.scrollY); try { draw(g); } finally { g.restore(); } });
    };
    // every strike is its own little show and they all run at the same time, a beat apart; only the first one steers the camera
    const strike = async (ti) => {
      const follow = ti === 0 ? followBase : () => {}, jitter = ti === 0 ? jitterBase : () => {};
      const flash = ti === 0 ? flashBase : (c, al, ms) => flashBase(c, al * 0.4, ms);   // several strikes at once must not white the screen out
      const cTile = tileOf(pairs[ti].champ.id) || champTile;
      let from = docPos(cTile.querySelector('.tcards') || cTile);
      const tgt = shown[ti], tTile = tileOf(tgt.id); if (!tTile) { release(tgt.id); return; }
      const again = seen.has(tgt.id); seen.add(tgt.id);
      const popT = (...a) => { if (!again) pop(...a); };
      const tdoc = () => docPos(tTile), pen = '×' + res.penalty;
      if (style === 'dragon') {
        // a long dragon drawn in one piece: a horned head that leads in a straight line and a scaled body that follows the path it flew
        const LEN = 400, HEAD = 1.4;   // a big round head reads as cute
        const goal = tdoc(), hoverDoc = { x: Math.min(W - 100, Math.max(100, goal.x + (goal.x > W / 2 ? -140 : 140))), y: goal.y - 210 };
        const dir0 = Math.atan2(hoverDoc.y - from.y, hoverDoc.x - from.x);
        const hist = []; for (let d = LEN + 80; d >= 0; d -= 6) hist.push({ x: from.x - Math.cos(dir0) * d, y: from.y - Math.sin(dir0) * d });   // the body starts already stretched out behind the head
        const D = { x: from.x, y: from.y, ang: dir0, alpha: 0, scale: 0.42, mouth: 0.1, flame: 0, v: 0, charge: 0 };
        const pushHist = () => { const l = hist[hist.length - 1]; if (Math.hypot(D.x - l.x, D.y - l.y) > 4) hist.push({ x: D.x, y: D.y }); if (hist.length > 1400) hist.shift(); };
        const sampleAll = (ds) => {   // points at the given (rising) distances back along the path, in one pass
          const out = []; let acc = 0, prev = { x: D.x, y: D.y }, i = hist.length - 1, k = 0;
          while (k < ds.length) {
            if (i < 0) { out.push(prev); k++; continue; }
            const q = hist[i], seg = Math.hypot(prev.x - q.x, prev.y - q.y);
            if (acc + seg >= ds[k]) { const f = (ds[k] - acc) / (seg || 1); out.push({ x: prev.x + (q.x - prev.x) * f, y: prev.y + (q.y - prev.y) * f }); k++; }
            else { acc += seg; prev = q; i--; }
          }
          return out;
        };
        const turn = (to, rate) => { let d = to - D.ang; d = Math.atan2(Math.sin(d), Math.cos(d)); D.ang += d * rate; };
        const fillPath = (g, pts, close = true) => { g.beginPath(); pts.forEach((q, j) => (j ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); if (close) g.closePath(); };
        const paintDragon = (g) => {
          if (D.alpha < 0.02) return;
          const sy = window.scrollY, tt = performance.now(), sc = D.scale; g.globalAlpha = D.alpha;
          // ---- the body: one smooth tapering ribbon with scales, a pale belly and a flaming spine ----
          const N = shown.length > 1 ? 44 : 60, step = (LEN * sc) / N, L = [], R = [], C = [];
          const S = sampleAll(Array.from({ length: N + 2 }, (_, i) => i * step + 30 * sc));   // the whole spine in one walk along the flight path
          const hq = S[0], tq = S[N], side = hq.x >= tq.x ? 1 : -1;   // the belly is on the side facing the ground, judged by which way the whole body runs
          for (let i = 0; i <= N; i++) {
            const q = S[i], a = S[Math.max(0, i - 1)], b = S[i + 1];
            let dx = a.x - b.x, dy = a.y - b.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
            const nx = -dy * side, ny = dx * side, t = i / N, wave = Math.sin(tt * 0.005 - i * 0.28) * 5 * (0.2 + t), w = (24 * Math.pow(1 - t, 0.7) + 2.5) * sc;
            const px = q.x + nx * wave, py = q.y - sy + ny * wave;
            L.push([px + nx * w, py + ny * w, nx, ny, w, dx, dy]); R.push([px - nx * w, py - ny * w]); C.push([px, py]);
          }
          // spine fins first (they sit behind the body), on the upper side
          g.beginPath();   // all the fins in one path, one fill
          for (let i = 4; i < N - 4; i += 3) {
            const t = i / N, [, , nx, ny, w, dx, dy] = L[i], up = ny < 0 ? 1 : -1, cx = C[i][0], cy = C[i][1], h = (20 * (1 - t) + 6) * sc, sway = Math.sin(tt * 0.008 - i * 0.4) * 4 * sc;
            const bx = cx + nx * up * w * 0.9, by = cy + ny * up * w * 0.9, tipx = bx + nx * up * h + dx * (h * 0.9) + sway, tipy = by + ny * up * h + dy * (h * 0.9);
            g.moveTo(bx + dx * 7 * sc, by + dy * 7 * sc); g.quadraticCurveTo(bx + nx * up * h * 0.6 + dx * 2, by + ny * up * h * 0.6 + dy * 2, tipx, tipy); g.quadraticCurveTo(bx + nx * up * h * 0.3 - dx * 6, by + ny * up * h * 0.3 - dy * 6, bx - dx * 7 * sc, by - dy * 7 * sc); g.closePath();
          }
          g.fillStyle = '#ffb03a'; g.fill();
          // two clawed legs on the belly side, paddling as it flies (drawn first, so the body covers the hips)
          for (const [li, ph] of [[Math.round(N * 0.17), 0], [Math.round(N * 0.52), 2.1]]) {
            const [, , nx, ny, w, dx, dy] = L[li], cx = C[li][0], cy = C[li][1], sw = Math.sin(tt * 0.011 + ph);
            const bx = cx + nx * w * 0.5, by = cy + ny * w * 0.5, l1 = 27 * sc, l2 = 22 * sc;
            const ax = nx * Math.cos(0.5 * sw) - dx * Math.sin(0.5 * sw) * 0.9, ay = ny * Math.cos(0.5 * sw) - dy * Math.sin(0.5 * sw) * 0.9;
            const kx = bx + ax * l1 - dx * 5 * sc, ky = by + ay * l1 - dy * 5 * sc, fx = kx + (nx * 0.35 + dx * 0.95) * l2, fy = ky + (ny * 0.35 + dy * 0.95) * l2;
            g.lineCap = 'round'; g.lineJoin = 'round';
            for (const [lw, col] of [[15 * sc, 'rgba(6,60,34,.85)'], [11 * sc, '#1c8f52']]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(bx, by); g.lineTo(kx, ky); g.stroke(); g.lineWidth = lw * 0.8; g.beginPath(); g.moveTo(kx, ky); g.lineTo(fx, fy); g.stroke(); }
            g.strokeStyle = '#f2e4c0'; g.lineWidth = 3 * sc; for (const ca of [-0.6, 0, 0.6]) { const cdx = dx * Math.cos(ca) - nx * Math.sin(ca), cdy = dy * Math.cos(ca) - ny * Math.sin(ca); g.beginPath(); g.moveTo(fx, fy); g.quadraticCurveTo(fx + cdx * 9 * sc, fy + cdy * 9 * sc, fx + cdx * 10 * sc + nx * 6 * sc, fy + cdy * 10 * sc + ny * 6 * sc); g.stroke(); }
          }
          const edge = L.map((q) => [q[0], q[1]]).concat(R.slice().reverse());
          const bg = g.createLinearGradient(C[0][0], C[0][1], C[N][0], C[N][1]); bg.addColorStop(0, '#34c46e'); bg.addColorStop(0.55, '#1f9a58'); bg.addColorStop(1, '#127046');
          fillPath(g, edge); g.lineJoin = 'round'; g.strokeStyle = `rgba(255,${150 - 40 * D.mouth},50,${0.14 + 0.22 * D.mouth})`; g.lineWidth = (12 + 10 * D.mouth) * sc; g.stroke();   // an ember glow round the body (a wide soft stroke: far cheaper than a canvas blur)
          g.fillStyle = bg; g.fill(); g.strokeStyle = 'rgba(6,60,34,.7)'; g.lineWidth = 2; g.stroke();
          // round, tube-like shading: a soft highlight along the back and a shadow where it turns under
          const band = (a0, a1, P) => { const pts = []; for (let i = 0; i <= N; i++) pts.push([C[i][0] + (P[i][0] - C[i][0]) * a0, C[i][1] + (P[i][1] - C[i][1]) * a0]); for (let i = N; i >= 0; i--) pts.push([C[i][0] + (P[i][0] - C[i][0]) * a1, C[i][1] + (P[i][1] - C[i][1]) * a1]); return pts; };
          g.fillStyle = 'rgba(190,255,215,.22)'; fillPath(g, band(0.28, 0.72, R)); g.fill();
          g.fillStyle = 'rgba(230,255,235,.18)'; fillPath(g, band(0.42, 0.58, R)); g.fill();
          g.fillStyle = 'rgba(4,40,22,.28)'; fillPath(g, band(0.8, 1, L)); g.fill();
          // pale belly stripe along the lower edge
          const belly = []; for (let i = 0; i <= N; i++) belly.push([C[i][0] + (L[i][0] - C[i][0]) * 0.78, C[i][1] + (L[i][1] - C[i][1]) * 0.78]); for (let i = N; i >= 0; i--) belly.push([C[i][0] + (L[i][0] - C[i][0]) * 0.18, C[i][1] + (L[i][1] - C[i][1]) * 0.18]);
          g.fillStyle = 'rgba(255,222,140,.9)'; fillPath(g, belly); g.fill();
          // overlapping scales on the back, rounded toward the tail, and ridged plates across the belly
          g.lineCap = 'round';
          const scD = new Path2D(), scL = new Path2D(), plates = new Path2D();   // batched: three strokes for every scale and plate
          for (let i = 3; i < N - 4; i += 2) {
            const [, , nx, ny, w, dx, dy] = L[i]; if (w < 5) break; const cx = C[i][0], cy = C[i][1], ha = Math.atan2(dy, dx), r = w * 0.3;
            for (const [k, off] of [[-0.62, (i % 4) * 0.5], [-0.2, ((i + 2) % 4) * 0.5]]) { const px = cx + nx * w * k - dx * off * r, py = cy + ny * w * k - dy * off * r; scD.moveTo(px + Math.cos(ha + 1.5708) * r, py + Math.sin(ha + 1.5708) * r); scD.arc(px, py, r, ha + 1.5708, ha + 4.7124); scL.moveTo(px - dx + Math.cos(ha + 2) * r * 0.8, py - dy + Math.sin(ha + 2) * r * 0.8); scL.arc(px - dx, py - dy, r * 0.8, ha + 2, ha + 3.4); }
            plates.moveTo(cx + nx * w * 0.22, cy + ny * w * 0.22); plates.lineTo(cx + nx * w * 0.74, cy + ny * w * 0.74);
          }
          g.strokeStyle = 'rgba(6,64,36,.55)'; g.lineWidth = 1.4; g.stroke(scD); g.strokeStyle = 'rgba(200,255,220,.22)'; g.lineWidth = 0.9; g.stroke(scL); g.strokeStyle = 'rgba(160,110,30,.4)'; g.lineWidth = 1.2; g.stroke(plates);
          // the tail ends in a flame
          { const [, , nx, ny, , dx, dy] = L[N], tx = C[N][0], ty = C[N][1]; for (let j = 0; j < 3; j++) { const a = (j - 1) * 0.5, len = (34 - Math.abs(j - 1) * 10) * sc, ex = tx - dx * len * Math.cos(a) + nx * len * Math.sin(a) * 0.8 + Math.sin(tt * 0.01 + j) * 3, ey = ty - dy * len * Math.cos(a) + ny * len * Math.sin(a) * 0.8; const gr = g.createLinearGradient(tx, ty, ex, ey); gr.addColorStop(0, '#ff7a1f'); gr.addColorStop(1, '#ffe27a'); g.fillStyle = gr; g.beginPath(); g.moveTo(tx + nx * 5 * sc, ty + ny * 5 * sc); g.quadraticCurveTo((tx + ex) / 2 + nx * 8 * sc, (ty + ey) / 2 + ny * 8 * sc, ex, ey); g.quadraticCurveTo((tx + ex) / 2 - nx * 8 * sc, (ty + ey) / 2 - ny * 8 * sc, tx - nx * 5 * sc, ty - ny * 5 * sc); g.closePath(); g.fill(); } }
          // ---- the head: a round, friendly face with big shiny eyes, blushing cheeks and little horns ----
          g.save(); g.translate(D.x, D.y - sy); g.rotate(D.ang); if (Math.cos(D.ang) < 0) g.scale(1, -1); g.scale(sc * HEAD, sc * HEAD);
          g.lineJoin = 'round'; g.lineCap = 'round';
          const mo = D.mouth, flick = Math.sin(tt * 0.01), blink = (tt % 3200) < 120 && mo < 0.5;
          // a soft tuft of flame-coloured mane on top, swaying
          g.fillStyle = '#ff9a3a'; for (let j = 0; j < 4; j++) { const x0 = -30 + j * 9, y0 = -26 + j * 2.5, len = 30 - j * 4, wv = Math.sin(tt * 0.009 - j * 0.8) * 5; g.beginPath(); g.moveTo(x0 + 6, y0 + 4); g.quadraticCurveTo(x0 - len * 0.4, y0 - len * 0.6 + wv, x0 - len, y0 - len * 0.3 + wv); g.quadraticCurveTo(x0 - len * 0.5, y0 + 2, x0 - 4, y0 + 8); g.closePath(); g.fill(); }
          // two short rounded horns
          for (const [x0, y0, x1, y1] of [[-8, -28, -26, -50], [-20, -22, -42, -38]]) { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, '#fff4d6'); gr.addColorStop(1, '#f0b642'); g.fillStyle = gr; g.beginPath(); g.moveTo(x0 - 5, y0 + 3); g.quadraticCurveTo(x1 + 2, y1 + 10, x1, y1); g.quadraticCurveTo(x1 + 10, y1 + 6, x0 + 6, y0 + 1); g.closePath(); g.fill(); g.strokeStyle = 'rgba(150,95,20,.5)'; g.lineWidth = 1.3; g.stroke(); }
          // a little fin ear
          g.fillStyle = '#2aa862'; g.beginPath(); g.moveTo(-14, -12); g.quadraticCurveTo(-40, -20, -46, -6); g.quadraticCurveTo(-30, -4, -16, -2); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,190,160,.6)'; g.beginPath(); g.moveTo(-18, -9); g.quadraticCurveTo(-34, -14, -39, -7); g.quadraticCurveTo(-28, -6, -18, -5); g.closePath(); g.fill();
          // the head: a big round skull and a short rounded snout, all one shape
          const hg = g.createRadialGradient(4, -18, 4, 10, -4, 52); hg.addColorStop(0, '#6ae89a'); hg.addColorStop(0.55, '#2cb56a'); hg.addColorStop(1, '#178a4c'); g.fillStyle = hg;
          g.beginPath(); g.moveTo(-30, 8); g.bezierCurveTo(-36, -18, -16, -36, 6, -34); g.bezierCurveTo(26, -32, 36, -22, 44, -14); g.bezierCurveTo(60, -16, 76, -10, 76, 2); g.bezierCurveTo(76, 14 + mo * 4, 60, 18 + mo * 6, 40, 18 + mo * 6); g.bezierCurveTo(20, 22, -22, 24, -30, 8); g.closePath(); g.fill(); g.strokeStyle = 'rgba(8,70,38,.75)'; g.lineWidth = 2; g.stroke();
          g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.ellipse(-2, -24, 18, 6, -0.15, 0, 6.283); g.fill();   // a soft shine on the crown
          // cream muzzle
          g.fillStyle = '#fff1c4'; g.beginPath(); g.ellipse(52, 6 + mo * 3, 23, 10 + mo * 3, 0.05, 0, 6.283); g.fill();
          // the mouth: a little smile, or a round open mouth while it breathes fire
          if (mo > 0.35) {
            g.fillStyle = '#5a1630'; g.beginPath(); g.ellipse(56, 9 + mo * 3, 11 * mo, 7 * mo, 0, 0, 6.283); g.fill();
            g.fillStyle = '#ff7a96'; g.beginPath(); g.ellipse(55, 12 + mo * 4, 7 * mo, 3 * mo, 0, 0, 6.283); g.fill();
            g.fillStyle = '#fff'; g.beginPath(); g.moveTo(50, 4 + mo * 2); g.lineTo(53, 9 + mo * 2); g.lineTo(56, 4 + mo * 2); g.closePath(); g.fill();   // one tiny fang
          } else { g.strokeStyle = '#3a1a1a'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(40, 9); g.quadraticCurveTo(52, 17, 64, 9); g.stroke(); }
          // nostrils, with a puff of fire when it is about to breathe
          g.fillStyle = 'rgba(30,70,40,.8)'; g.beginPath(); g.ellipse(68, -4, 2.2, 1.6, 0.4, 0, 6.283); g.fill(); g.beginPath(); g.ellipse(61, -6, 2, 1.5, 0.4, 0, 6.283); g.fill();
          if (mo > 0.6) { g.fillStyle = `rgba(255,170,60,${0.5 + 0.3 * flick})`; g.beginPath(); g.arc(72, -8, 5 + 2 * flick, 0, 6.283); g.fill(); }
          // short curly whiskers
          g.strokeStyle = 'rgba(255,205,100,.85)'; g.lineWidth = 2.2; g.beginPath(); for (const [wx, wy, ph, dir] of [[66, -2, 0, -1], [60, 6, 1.7, 1]]) { g.moveTo(wx, wy); for (let k = 1; k <= 8; k++) { const s2 = k / 8; g.lineTo(wx - s2 * 66, wy + dir * s2 * 12 + Math.sin(tt * 0.006 - s2 * 5 + ph) * 8 * s2); } } g.stroke();
          // rosy cheek
          g.fillStyle = 'rgba(255,120,150,.5)'; g.beginPath(); g.ellipse(24, 10, 8, 4.5, 0, 0, 6.283); g.fill();
          // the eye: big and round, a dark pupil with two shiny highlights (a quick blink now and then)
          g.save(); g.translate(14, -10);
          if (blink) { g.strokeStyle = '#1b1430'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(-10, 1); g.quadraticCurveTo(0, 6, 10, 1); g.stroke(); }
          else {
            g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, 0, 12, 13, 0, 0, 6.283); g.fill(); g.strokeStyle = 'rgba(8,70,38,.6)'; g.lineWidth = 1.4; g.stroke();
            const pg = g.createRadialGradient(4, 1, 1, 4, 2, 9.5); pg.addColorStop(0, '#5a3a8a'); pg.addColorStop(0.6, '#2a1a4a'); pg.addColorStop(1, '#120a22'); g.fillStyle = pg; g.beginPath(); g.ellipse(4, 2, 8.6, 9.6, 0, 0, 6.283); g.fill();
            g.fillStyle = '#fff'; g.beginPath(); g.arc(1, -3, 3.6, 0, 6.283); g.fill(); g.beginPath(); g.arc(7.5, 6, 1.7, 0, 6.283); g.fill();
            if (mo > 0.5) { g.strokeStyle = '#0d4a28'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(-9, -15); g.quadraticCurveTo(2, -17, 11, -12); g.stroke(); }   // a determined little brow while it breathes fire
          }
          g.restore();
          g.restore();
          if (D.charge > 0.02) {
            const m = mouthAt(), r = (10 + 30 * D.charge) * sc * (1 + 0.08 * Math.sin(tt * 0.04));
            g.save(); g.globalCompositeOperation = 'lighter';
            const og = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, r * 2.4); og.addColorStop(0, `rgba(255,170,60,${0.5 * D.charge})`); og.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = og; g.beginPath(); g.arc(m.x, m.y, r * 2.4, 0, 6.283); g.fill();
            const cg = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, r); cg.addColorStop(0, 'rgba(255,255,235,1)'); cg.addColorStop(0.35, 'rgba(255,220,120,.95)'); cg.addColorStop(0.75, 'rgba(255,120,30,.7)'); cg.addColorStop(1, 'rgba(255,60,10,0)'); g.fillStyle = cg; g.beginPath(); g.arc(m.x, m.y, r, 0, 6.283); g.fill();
            g.restore();
          }
        };
        // at speed the dragon smears: a few fainter copies trail behind it, like the eagle's afterimages
        const dropLayer = E.layer((g) => { paintDragon(g); g.globalAlpha = 1; });   // one paint a frame (speed lines show the pace), so several dragons at once stay smooth
        const mouthAt = () => { const v = vp(D), c = Math.cos(D.ang), s2 = Math.sin(D.ang), up = (Math.cos(D.ang) < 0 ? -1 : 1) * 12 * D.scale * HEAD; return { x: v.x + c * 62 * D.scale * HEAD - s2 * up, y: v.y + s2 * 62 * D.scale * HEAD + c * up }; };
        const goTo = (tx, ty, ms, o = {}) => new Promise((resolve) => {
          const sx = D.x, sy0 = D.y; let px = D.x, py = D.y;
          // a graceful swoop: a curve bowed to one side, flown with an ease in and out, the head always along the curve
          const bow = o.arc ? Math.hypot(tx - sx, ty - sy0) * o.arc : 0, mx = (sx + tx) / 2 + ((ty - sy0) / (Math.hypot(tx - sx, ty - sy0) || 1)) * bow, my = (sy0 + ty) / 2 - ((tx - sx) / (Math.hypot(tx - sx, ty - sy0) || 1)) * bow;
          tween(ms, (k) => {
            const e = o.ease ? o.ease(k) : 0.5 - 0.5 * Math.cos(Math.PI * k), u = 1 - e;
            D.x = u * u * sx + 2 * u * e * mx + e * e * tx; D.y = u * u * sy0 + 2 * u * e * my + e * e * ty;
            const tdx = 2 * u * (mx - sx) + 2 * e * (tx - mx), tdy = 2 * u * (my - sy0) + 2 * e * (ty - my);
            if (Math.hypot(tdx, tdy) > 0.5) turn(Math.atan2(tdy, tdx), 0.3);
            if (o.alpha) { const sp = Math.hypot(D.x - px, D.y - py); D.v = Math.min(1, sp / 34); if (sp > 6) { const v = vp(D); E.speed(v.x, v.y, D.x - px, D.y - py, 4); } }
            px = D.x; py = D.y;
            if (o.alpha) D.alpha = Math.min(1, k * 4) * (o.fadeOut ? 1 - Math.max(0, k - 0.6) / 0.4 : 1);
            if (o.scale) D.scale = o.scale(k);
            if (o.follow !== false) follow(D.y, 0.14);
            pushHist();
          }).then(resolve);
        });
        const dist = Math.hypot(hoverDoc.x - from.x, hoverDoc.y - from.y), ms = Math.round(Math.min(1700, Math.max(1150, dist * 1.15)));
        await goTo(hoverDoc.x, hoverDoc.y, ms, { alpha: true, arc: 0.22 * (hoverDoc.x > from.x ? 1 : -1), scale: (k) => 0.42 + 0.26 * Math.min(1, k * 2.2) });
        D.v = 0;
        // hovers over the loser, turns to face it and draws in fire
        const T0 = vp(tdoc()), face = vp(hoverDoc).x < T0.x ? 1 : -1;
        await tween(420, (k) => { const hv = vp({ x: D.x, y: D.y }); turn(Math.atan2(T0.y - hv.y, T0.x - hv.x) - 0.25 * face, 0.14); D.scale = 0.68 + 0.08 * ease(k); D.mouth = 0.1 + 0.9 * ease(k); D.charge = ease(k); D.y = hoverDoc.y + Math.sin(performance.now() * 0.008) * 6; const m = mouthAt(); for (let i = 0; i < 3; i++) { const a = rnd(0, 6.283), r = rnd(60, 110); E.emit({ x: m.x + Math.cos(a) * r, y: m.y + Math.sin(a) * r, vx: -Math.cos(a) * 340, vy: -Math.sin(a) * 340, life: 220, s: rnd(8, 16), s1: 2, col: [255, 210, 100], col1: [255, 80, 20], drag: 1 }); } });
        E.freeze(90); await wait(90); SND.play('roar');
        // the breath, straight from its mouth onto the loser's card
        const T = vp(tdoc()), r0 = tileRect(tTile);
        await tween(780, (k) => {
          D.y = hoverDoc.y + Math.sin(performance.now() * 0.012) * 5; const hv = vp({ x: D.x, y: D.y });
          turn(Math.atan2(T.y - hv.y, T.x - hv.x), 0.25); D.mouth = 1; D.charge = Math.max(0, 1 - k * 2.5);
          const mouth = mouthAt(), aim = { x: T.x + rnd(-14, 14), y: T.y + rnd(-14, 14) }, dx = aim.x - mouth.x, dy = aim.y - mouth.y;
          E.flame(mouth.x, mouth.y, dx, dy, 14, { spd: 1250, spread: 0.1, size: [20, 44], life: [260, 440] }); E.beam(mouth.x, mouth.y, aim.x, aim.y, { w: 24, ms: 70 });
          E.burst(aim.x, aim.y, 4, { spd: [80, 300], life: [300, 600], s: [10, 22], col: [255, 240, 170], col1: [220, 50, 0], g: -80 });
          E.embers(r0.left, r0.top, r0.width, r0.height, 2);
          jitter(1 + 5 * k); setDim(0.55 + 0.1 * Math.random());
        });
        jitter(0); D.mouth = 0.3; D.charge = 0;
        // the blast
        E.explosion(T.x, T.y, 1.5); flash('#ffb84a', 0.5, 380); shake(16, 560); punch(T.x, T.y); popT(T.x, T.y, pen, '#ffb02e'); hurt(tTile); scorch(tTile, 'rgba(40,12,0,.95)'); SND.play('impact'); SND.play('boom'); release(tgt.id);
        if (false) { from = { x: D.x, y: D.y }; await wait(500); dropLayer(); }   // (the next loser gets a fresh dragon from the strongest hand)
        else { goTo(D.x + face * 440, D.y - 400, 950, { ease: (k) => k * k, alpha: true, fadeOut: true, follow: false }).then(dropLayer); from = tdoc(); await wait(950); }
      } else if (style === 'eagle') {
        const c = creature('🦅', 108);
        const goal = tdoc(), dist = Math.hypot(goal.x - from.x, goal.y - from.y), ms = Math.round(Math.min(1150, Math.max(700, dist * 0.8)));
        let prev = null, lastGhost = 0;
        await tween(ms, (k) => {
          const e = k * k * (3 - 2 * k), up = -Math.sin(Math.PI * Math.min(1, k * 1.15)) * Math.min(200, dist * 0.4);
          const pos = { x: from.x + (goal.x - from.x) * e, y: from.y + (goal.y - from.y) * e + up };
          follow(pos.y, 0.22); const v = vp(pos), dx = prev ? v.x - prev.x : 1, dy = prev ? v.y - prev.y : 1; prev = v;
          const ang = Math.atan2(dy, dx) * 57.3, face = dx >= 0 ? 1 : -1;
          place(c, v.x, v.y, 0.5 + 0.7 * Math.min(1, k * 3) + 0.4 * k * k, face > 0 ? ang * 0.5 : -(180 - ang) * 0.5, face);
          E.speed(v.x, v.y, dx, dy, 3);
          const nowT = performance.now(); if (nowT - lastGhost > 40) { lastGhost = nowT; const g = creature('🦅', 108); place(g, v.x, v.y, 0.5 + 0.7 * Math.min(1, k * 3), 0, face); g.style.opacity = '.35'; anim(g, [{ opacity: .4 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }); setTimeout(() => g.remove(), 280); }
        });
        const T = vp(tdoc());
        E.freeze(100); await wait(100); SND.play('impact');
        // three claw slashes, one after the other
        [[-0.7, -26, 0], [-0.95, 4, 70], [-0.45, 30, 140]].forEach(([a, off, d]) => setTimeout(() => { E.slash(T.x + off * 0.6, T.y + off, a, 330, { ms: 440, w: 15 }); E.burst(T.x + off, T.y + off, 8, { spd: [120, 380], life: [300, 600], s: [3, 7], col: [235, 245, 255], col1: [150, 190, 255], g: 40 }); hurt(tTile); if (d) shake(10, 300); }, skip ? 0 : d));
        await wait(260);
        flash('#e8f4ff', 0.4, 300); shake(15, 520); punch(T.x, T.y, 1.06); E.ring(T.x, T.y, 250, [200, 230, 255], 520, 7); E.ring(T.x, T.y, 150, [255, 255, 255], 380, 4);
        for (let i = 0; i < 26; i++) E.emit({ x: T.x + rnd(-20, 20), y: T.y + rnd(-20, 20), vx: rnd(-420, 420), vy: rnd(-380, 120), g: 160, life: rnd(700, 1400), s: rnd(5, 9), s1: 2, col: [255, 255, 255], col1: [170, 200, 255], drag: 0.96 });   // feathers
        popT(T.x, T.y, pen, '#cfe6ff'); release(tgt.id);
        anim(c, [{ opacity: 1 }, { opacity: 0, transform: c.style.transform + ' translate(200px,-120px) scale(1.3)' }], { duration: 480, fill: 'forwards' });
        from = tdoc();
        await wait(ti < shown.length - 1 ? 520 : 760);
      } else {
        // from the sky: the screen goes to the loser first
        if (ti === 0 || anchoredStrikes) { await panAttackCamera(tdoc().y, H, tween); scrollNow = window.scrollY; }
        const T = vp(tdoc());
        if (style === 'thunder') {
          // a real storm cloud: dark puffs painted on the canvas, rolling in from the side, rain falling, lit from inside by every strike
          const S1 = Math.min(1.1, (W / 2 - 8) / 200), cx = Math.min(W - 200 * S1 - 4, Math.max(200 * S1 + 4, T.x)), cy = Math.max(175 * S1 + 12, T.y - 240), CL = { x: cx + (cx > W / 2 ? 260 : -260), y: cy - 40, s: 0.35, a: 0, f: 0 };
          const PUFFS = [[-120, 14, 62], [-70, -18, 78], [-10, -38, 90], [55, -22, 80], [115, 12, 64], [-85, 34, 54], [0, 28, 74], [82, 32, 56], [-35, -2, 66], [38, -6, 70]];
          const dropCloud = E.layer((g) => {
            if (CL.a < 0.01) return;
            g.save(); g.globalAlpha = CL.a;
            for (const [px, py, pr] of PUFFS) { const x = CL.x + px * CL.s, y = CL.y + py * CL.s, r = pr * CL.s * 1.25; const gr = g.createRadialGradient(x, y - r * 0.25, r * 0.1, x, y, r); gr.addColorStop(0, '#59638a'); gr.addColorStop(0.55, '#2a3150'); gr.addColorStop(1, 'rgba(14,18,36,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); }
            if (CL.f > 0.02) { g.globalCompositeOperation = 'lighter'; for (const [px, py, pr] of PUFFS) { const x = CL.x + px * CL.s, y = CL.y + py * CL.s + pr * CL.s * 0.2, r = pr * CL.s * 1.3; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(190,215,255,${(CL.f * 0.42).toFixed(3)})`); gr.addColorStop(1, 'rgba(120,160,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); } }
            g.restore();
          });
          const rain = (n) => { for (let i = 0; i < n; i++) E.emit({ x: CL.x + rnd(-130, 130) * CL.s, y: CL.y + 40 * CL.s, vx: -90, vy: rnd(800, 1100), g: 0, life: rnd(350, 520), s: 2.2, s1: 1.2, col: [190, 215, 255], col1: [110, 150, 230], drag: 1 }); };
          SND.play('swoop');
          await tween(760, (k) => {
            const e = ease(k); CL.x = cx + (CL.x0 === undefined ? (CL.x0 = CL.x - cx) : CL.x0) * (1 - e); CL.a = Math.min(1, k * 3); CL.s = 0.35 + (S1 - 0.35) * e;
            CL.f = Math.random() < 0.18 ? rnd(0.2, 0.6) : CL.f * 0.8; rain(3);
            if (Math.random() < 0.12) E.bolt(CL.x + rnd(-80, 80) * CL.s, CL.y, CL.x + rnd(-130, 130) * CL.s, CL.y + 90 * CL.s, { w: 3, ms: 130, branches: 1 });
          });
          for (let i = 0; i < 4; i++) {
            const big = i === 3, tx = T.x + rnd(-18, 18), bx = cx + rnd(-40, 40);
            await tween(i ? 140 : 260, () => { CL.f = rnd(0.15, 0.55); rain(2); });   // it flickers before every strike
            flash('#fff', big ? 0.6 : 0.38, big ? 420 : 280); E.freeze(big ? 80 : 0); CL.f = 1;
            E.bolt(bx, CL.y + 60 * CL.s, tx, T.y, { w: big ? 14 : 9, ms: big ? 560 : 340, branches: big ? 7 : 4 });
            E.beam(bx, CL.y + 60 * CL.s, tx, T.y, { w: big ? 70 : 46, col: [150, 195, 255], ms: big ? 140 : 90 });   // the glow around the bolt
            E.burst(tx, T.y, big ? 40 : 18, { spd: [100, 460], life: [300, 760], s: [3, 8], col: [235, 245, 255], col1: [90, 130, 255], g: 80 }); E.ring(tx, T.y, big ? 260 : 160, [190, 215, 255], 480, big ? 9 : 5);
            if (big) { E.explosion(tx, T.y, 1.1); setDim(0.97); setTimeout(() => setDim(0.9), 260); }
            shake(big ? 19 : 10, big ? 600 : 340); hurt(tTile); SND.play('thunder');
            const fade = setInterval(() => { CL.f *= 0.8; }, 30); setTimeout(() => clearInterval(fade), 500);
            await wait(big ? 200 : 300);
          }
          punch(T.x, T.y, 1.06); popT(T.x, T.y, pen, '#bcd8ff');
          const r0 = tileRect(tTile); for (let i = 0; i < 8; i++) setTimeout(() => { const a = { x: r0.left + rnd(0, r0.width), y: r0.top + rnd(0, r0.height) }, b = { x: r0.left + rnd(0, r0.width), y: r0.top + rnd(0, r0.height) }; E.bolt(a.x, a.y, b.x, b.y, { w: 3, ms: 140, branches: 1 }); }, skip ? 0 : i * 70);   // the tile crackles
          E.smoke(T.x, T.y, 8); scorch(tTile, 'rgba(10,14,40,.95)'); release(tgt.id);
          tween(700, (k) => { CL.a = 1 - k; CL.x += 3; CL.f *= 0.9; }).then(dropCloud);
          await wait(ti < shown.length - 1 ? 750 : 1300);
        } else if (style === 'meteors') {
          // a shower of rock-and-fire meteors across the sky, the biggest one for the loser
          SND.play('swoop'); setDim(0.8);
          const dx = 0.5, dy = -0.86, dist = Math.max(H, 700), t0 = performance.now(), items = [];
          const rockSet = () => Array.from({ length: 9 }, () => rnd(0.78, 1.18));
          for (let i = 0; i < 13; i++) items.push({ tx: Math.min(W - 20, Math.max(20, T.x + rnd(-170, 170))), ty: T.y + rnd(-130, 160), t0: i * 90 + rnd(0, 50), dur: rnd(380, 520), sz: rnd(0.5, 0.85), rocks: rockSet() });
          items.push({ tx: T.x, ty: T.y, t0: 1300, dur: 700, sz: 1.75, big: true, rocks: rockSet() });
          const at = (m, now) => { const k = (now - m.t0) / m.dur; if (k < 0 || k >= 1) return null; const e = Math.pow(k, 1.5); return { x: m.tx + dx * dist * (1 - e), y: m.ty + dy * dist * (1 - e) }; };
          const dropM = E.layer((g) => { const now = performance.now() - t0; for (const m of items) { const q = at(m, now); if (q) paintMeteor(g, q.x, q.y, dx, dy, m.sz, m.rocks); } });
          await tween(2000, (k) => {
            const now = k * 2000;
            for (const m of items) {
              const q = at(m, now); if (q && Math.random() < (m.big ? 1 : 0.5)) { E.emit({ x: q.x + dx * 24 * m.sz, y: q.y + dy * 24 * m.sz, vx: rnd(-50, 50) + dx * 90, vy: rnd(-30, 60) + dy * 90, g: 120, life: rnd(350, 700), s: rnd(3, 7) * m.sz, s1: 0, col: [255, 210, 110], col1: [255, 60, 10] }); if (m.big) E.emit({ x: q.x + dx * 60, y: q.y + dy * 60, vx: dx * 60, vy: dy * 60, g: -10, life: rnd(500, 900), s: rnd(14, 26), s1: rnd(40, 70), col: [60, 50, 48], col1: [30, 26, 26], add: false, a: 0.55 }); }
              if (m.done || now < m.t0 + m.dur) continue; m.done = true;
              if (!m.big) { E.burst(m.tx, m.ty, 9, { spd: [60, 240], life: [300, 650], s: [4, 9], col: [255, 230, 150], col1: [255, 80, 20], g: 220 }); E.burst(m.tx, m.ty, 4, { spd: [60, 200], life: [400, 800], s: [4, 8], col: [70, 56, 50], col1: [30, 24, 22], g: 500, add: false }); E.ring(m.tx, m.ty, 80, [255, 190, 90], 340, 3); SND.play('pop'); }
              else { E.freeze(100); flash('#ffd9a0', 0.5, 380); E.explosion(T.x, T.y, 1.8); E.burst(T.x, T.y, 30, { spd: [160, 640], life: [700, 1300], s: [6, 14], col: [90, 70, 60], col1: [30, 24, 22], g: 800, add: false }); E.ring(T.x, T.y, 320, [255, 255, 255], 540, 8); E.ring(T.x, T.y, 200, [255, 170, 70], 460, 6); shake(24, 660); punch(T.x, T.y, 1.1, 430); popT(T.x, T.y, pen, '#ffb347', 350); hurt(tTile); scorch(tTile, 'rgba(30,10,0,.5)'); SND.play('boom'); SND.play('impact'); release(tgt.id); }
            }
          });
          dropM();
          await wait(ti < shown.length - 1 ? 700 : 1500);
        } else if (style === 'shark') {
          // jaws: a fin circles in the dark water, then a huge shark breaches out of it and bites the card in half
          SND.play('swoop'); setDim(0.9);
          const side = T.x > W / 2 ? -1 : 1, mv = -side, wy = Math.min(H - 80, T.y + 105);
          const F = { x: T.x + side * Math.min(W * 0.58, 340), a: 0, dy: 0 }, Wt = { a: 0, t0: performance.now() };
          const wave = (x, t) => wy + 6 + Math.sin(x * 0.035 + t * 2.4) * 5 + Math.sin(x * 0.09 - t * 3.1) * 2.5;
          const dropWater = E.layer((g) => {
            if (Wt.a < 0.01) return; const t = (performance.now() - Wt.t0) / 1000; g.save(); g.globalAlpha = Wt.a;
            g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W + 14; x += 14) g.lineTo(x, wave(x, t)); g.lineTo(W, H); g.closePath();
            const gr = g.createLinearGradient(0, wy, 0, wy + 170); gr.addColorStop(0, 'rgba(70,150,220,.5)'); gr.addColorStop(1, 'rgba(8,40,100,.8)'); g.fillStyle = gr; g.fill();
            g.strokeStyle = 'rgba(215,242,255,.7)'; g.lineWidth = 2.2; g.beginPath(); for (let x = 0; x <= W + 14; x += 14) { const y = wave(x, t); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.restore();
          });
          const dropFin = E.layer((g) => {
            if (F.a < 0.01) return; g.save(); g.globalAlpha = F.a; const x = F.x, y = wy + 4 + F.dy;
            g.strokeStyle = 'rgba(215,242,255,.75)'; g.lineWidth = 3; g.lineCap = 'round';
            for (const o of [-1, 1]) { g.beginPath(); g.moveTo(x + mv * 8, y + 2); g.lineTo(x - mv * 84, y + o * 16); g.stroke(); }
            g.beginPath(); g.ellipse(x, y + 3, 38, 9, 0, 0, 6.283); g.stroke();
            const gr = g.createLinearGradient(x, y - 56, x, y); gr.addColorStop(0, '#8aa2c0'); gr.addColorStop(1, '#27374f'); g.fillStyle = gr;
            g.beginPath(); g.moveTo(x - 28, y); g.quadraticCurveTo(x - 9 + mv * 7, y - 30, x + mv * 20, y - 58); g.quadraticCurveTo(x + 11 + mv * 2, y - 24, x + 28, y); g.closePath(); g.fill(); g.restore();
          });
          let sonar = 0;
          await tween(1150, (k) => {
            Wt.a = Math.min(1, k * 3); F.x = T.x + side * Math.min(W * 0.58, 340) * Math.pow(1 - ease(k), 1); F.a = Math.min(1, k * 5);
            const now = performance.now(); if (now - sonar > 240) { sonar = now; E.ring(F.x, wy, 110, [200, 235, 255], 760, 2); if (k > 0.5) punch(T.x, T.y, 1.014, 280); }
            if (Math.random() < 0.7) E.burst(F.x - mv * 22, wy, 1, { spd: [10, 70], life: [300, 640], s: [3, 6], col: [215, 240, 255], col1: [100, 170, 235], g: 140, add: false, up: 90 });
          });
          await wait(260);
          await tween(320, (k) => { F.dy = k * 46; F.a = 1 - k; });   // it dives: the water goes still
          E.burst(F.x, wy, 10, { spd: [20, 100], life: [500, 900], s: [4, 8], col: [215, 240, 255], col1: [100, 170, 235], g: -60, add: false, up: 0 });
          await wait(380);
          // the bite on the card is a crescent cut from its right edge (see endTex 'bitten'): its front sits at 75% of the width,
          // centred at 44% of the height, spanning 48% of it. The jaws snap shut exactly there, so the mark appears where the teeth met.
          const Sk = { x: -999, y: -999, s: 1, rot: 0, o: 0, chunk: 0 }, dropShark = E.layer((g) => paintShark(g, Sk.x, Sk.y, Sk.s, Sk.rot, -1, Sk.o, Sk.chunk));
          const ent = res.entries.find((x) => x.id === tgt.id), cardEls = () => [...tTile.querySelectorAll('.tcards > *')];
          const biteAt = (el2) => { const q = el2.getBoundingClientRect(), half = q.height * 70 / 290, sc = half / SHARK_GAPE; return { s: sc, x: q.left + q.width * 0.75 + SHARK_BITE_X * sc, y: q.top + q.height * 128 / 290 - SHARK_BITE_Y * sc }; };   // where the shark must be (it faces left)
          const water = (x, n, big) => { for (let i = 0; i < n; i++) E.emit({ x: x + rnd(-40, 40), y: wy + rnd(-6, 10), vx: rnd(-160, 160), vy: -rnd(300, big ? 1000 : 700), g: 900, life: rnd(700, 1400), s: rnd(4, 11), s1: 1, col: [235, 248, 255], col1: [110, 175, 235], add: false, drag: 0.995 }); E.ring(x, wy, big ? 300 : 200, [220, 242, 255], 620, big ? 9 : 6); E.ring(x, wy + 10, big ? 200 : 130, [255, 255, 255], 440, 4); };
          const order = cardEls().map((_, i) => i).reverse();   // right to left, one chomp per card
          { const y0 = window.scrollY, y1 = Math.max(0, Math.min(maxScroll(), tdoc().y - H * 0.45)); if (Math.abs(y1 - y0) > 4) await tween(520, (k) => { scrollNow = y0 + (y1 - y0) * ease(k); window.scrollTo(0, scrollNow); }); }   // bring the loser's card fully into view first; the page then stays still for the strike
          let P = biteAt(cardEls()[order[0]]);
          const startX = Math.max(P.x + 160 * P.s, W + 60 * P.s), startY = wy + 90 * P.s;
          Sk.x = startX; Sk.y = startY; Sk.s = P.s; Sk.rot = -24;
          water(Math.min(W - 20, P.x + 40 * P.s), 70, true); SND.play('splat'); SND.play('boom'); flash('#bfe6ff', 0.3, 280); shake(12, 380);
          // 1) the breach: it surges up out of the water, mouth gaping, and hangs just short of the card
          let trail = 0;
          await tween(620, (k) => {
            P = biteAt(cardEls()[order[0]]); Sk.s = P.s;   // measured every frame, in case anything still moves
            const pre = { x: P.x + 46 * P.s, y: P.y - 6 * P.s }, e = 1 - Math.pow(1 - k, 3), x = startX + (pre.x - startX) * e, y = startY + (pre.y - startY) * e - Math.sin(Math.PI * k) * 40 * P.s;
            Sk.x = x; Sk.y = y; Sk.rot = -24 * (1 - e) + 6 * Math.sin(Math.PI * k); Sk.o = Math.min(1, k * 1.6);
            const now = performance.now(); if (now - trail > 30) { trail = now; for (let i = 0; i < 3; i++) E.emit({ x: x + rnd(20, 110) * P.s, y: y + rnd(-10, 30) * P.s, vx: rnd(-40, 80), vy: rnd(0, 140), g: 700, life: rnd(500, 900), s: rnd(3, 8), s1: 1, col: [235, 248, 255], col1: [110, 175, 235], add: false }); }
          });
          // 2) the bites: lunge, snap shut on the exact spot, the mark appears; then the next card
          for (let bi = 0; bi < order.length; bi++) {
            const idx = order[bi], card = cardEls()[idx]; if (!card) continue;
            const fx = Sk.x, fy = Sk.y, fr = Sk.rot;
            await tween(bi ? 200 : 150, (k) => { P = biteAt(card); Sk.s = P.s; const e = k * k; Sk.x = fx + (P.x - fx) * e; Sk.y = fy + (P.y - fy) * e; Sk.rot = fr * (1 - e); Sk.o = 1; });
            await tween(80, (k) => { P = biteAt(card); Sk.x = P.x; Sk.y = P.y; Sk.o = 1 - k; });   // SNAP, on the spot
            P = biteAt(card); Sk.x = P.x; Sk.y = P.y; Sk.rot = 0; Sk.o = 0;
            E.freeze(120); SND.play('impact'); SND.play('tear'); shake(18 - bi * 4, 360);
            const mouth = { x: P.x - SHARK_BITE_X * P.s, y: P.y + SHARK_BITE_Y * P.s };
            E.burst(mouth.x, mouth.y, 22, { spd: [120, 420], life: [500, 1000], s: [3, 7], col: [250, 248, 240], col1: [200, 190, 170], g: 600, add: false, up: 120 });   // shreds of card
            E.ring(mouth.x, mouth.y, 120 * P.s, [210, 240, 255], 360, 4);
            const torn = tornCard(ent.cards[idx], true, ent.as ? ent.as[idx] : null, 0, 'shark'); torn.classList.add('hitin'); card.replaceWith(torn);   // the bite mark, exactly under the teeth
            if (bi === 0) { punch(mouth.x, mouth.y, 1.06, 300); popT(T.x, T.y, pen, '#9fd8ff', 300); }
            await wait(110);
            if (bi < order.length - 1) await tween(160, (k) => { Sk.x = P.x + 34 * P.s * k; Sk.y = P.y - 4 * P.s * k; Sk.o = k; Sk.chunk = 0; });   // lets go and opens again for the next card
          }
          // 3) it shakes its head with the piece in its teeth
          Sk.chunk = 1; hurt(tTile); scorch(tTile, 'rgba(10,40,90,.4)');
          await tween(420, (k) => { Sk.rot = Math.sin(k * Math.PI * 5) * 7 * (1 - k); Sk.x = P.x + Math.sin(k * Math.PI * 5) * 6 * P.s; });
          release(tgt.id, true);
          // 4) and drops back into the water with it
          const bx = Sk.x, by0 = Sk.y, endX = bx + 150 * P.s, endY = wy + 140 * P.s;
          await tween(560, (k) => { const e = k * k; Sk.x = bx + (endX - bx) * k; Sk.y = by0 + (endY - by0) * e - Math.sin(Math.PI * k) * 30 * P.s; Sk.rot = 34 * e; });
          const xe = Math.min(W - 20, Sk.x - 60 * P.s);
          water(xe, 50, true); SND.play('splat'); shake(10, 360);
          await tween(500, (k) => { Wt.a = 1 - k; });
          dropShark(); dropWater(); dropFin();
          await wait(ti < shown.length - 1 ? 450 : 1100);
        } else if (style === 'ninja') {
          // a masked ninja out of a smoke bomb: stars spin up in a ring round the loser in bullet time, then every one strikes at once
          SND.play('whistle'); setDim(0.82);
          const F = vp(from), st0 = performance.now(), N = 10, stars = [], NJ = { a: 0, s: 0.45, x: F.x, y: F.y - 40 }, RET = { a: 0, r: 120 };
          E.smoke(F.x, F.y, 10, { size: [40, 100] }); E.burst(F.x, F.y, 18, { spd: [80, 300], life: [300, 700], s: [4, 10], col: [210, 210, 225], col1: [50, 50, 70], g: 0, add: false }); E.ring(F.x, F.y, 160, [255, 255, 255], 380, 4);
          for (let i = 0; i < N; i++) stars.push({ ang: i / N * 6.283, rr: 118 + (i % 2) * 22, t0: 200 + i * 70, dur: 420, rot0: rnd(0, 360), sz: 18 + (i % 3) * 2, state: 0, hit: 0, bend: rnd(-90, 90) });
          const BIG = { a: 0, x: 0, y: 0, rot: 0, r: 64 };
          const ringPos = (s2, now) => { const spin = Math.max(0, now - 900) * 0.0026; const a2 = s2.ang + spin; return { x: T.x + Math.cos(a2) * s2.rr, y: T.y + Math.sin(a2) * s2.rr * 0.8 }; };
          const dropN = E.layer((g) => {
            const now = performance.now() - st0;
            if (NJ.a > 0.01) paintNinja(g, NJ.x, NJ.y, NJ.s, NJ.a, now);
            if (RET.a > 0.01) {   // a red target reticle locks onto the loser
              g.save(); g.translate(T.x, T.y); g.globalAlpha = RET.a; g.strokeStyle = '#ff3b3b'; g.lineWidth = 3; g.shadowColor = '#ff3b3b'; g.shadowBlur = 14; g.rotate(now * 0.002);
              g.beginPath(); g.arc(0, 0, RET.r, 0, 6.283); g.stroke(); g.beginPath(); g.arc(0, 0, RET.r * 0.62, 0, 6.283); g.stroke(); for (let i = 0; i < 4; i++) { g.rotate(1.5708); g.beginPath(); g.moveTo(RET.r - 10, 0); g.lineTo(RET.r + 14, 0); g.stroke(); } g.restore();
            }
            for (const s2 of stars) {
              if (s2.state === 3) { if (now - s2.hit < 1200) paintShuriken(g, T.x + Math.cos(s2.ang) * 16, T.y + Math.sin(s2.ang) * 16, s2.sz, s2.rot0 + 400, Math.max(0, 1 - (now - s2.hit - 800) / 400)); continue; }
              let q;
              if (s2.state === 0) { const k = (now - s2.t0) / s2.dur; if (k < 0) continue; if (k >= 1) s2.state = 1; else { const e = 1 - Math.pow(1 - k, 2), t2 = ringPos(s2, 0); q = { x: F.x + (t2.x - F.x) * e + s2.bend * Math.sin(Math.PI * k), y: F.y + (t2.y - F.y) * e - Math.abs(s2.bend) * 0.6 * Math.sin(Math.PI * k) }; } }
              if (s2.state === 1) q = ringPos(s2, now);
              if (s2.state === 2) { const k = Math.min(1, (now - s2.go) / 200), e = k * k, r0 = s2.from, q0 = { x: T.x + Math.cos(s2.ang) * 16, y: T.y + Math.sin(s2.ang) * 16 }; q = { x: r0.x + (q0.x - r0.x) * e, y: r0.y + (q0.y - r0.y) * e }; }
              if (!q) continue; const spinR = s2.rot0 + now * (s2.state === 1 ? 0.9 : 1.6);
              for (const back of [0.05, 0.1, 0.15]) paintShuriken(g, q.x - (q.x - T.x) * back * (s2.state === 2 ? 0.8 : 0), q.y - (q.y - T.y) * back * (s2.state === 2 ? 0.8 : 0), s2.sz, spinR - back * 200, 0.14);
              g.save(); g.globalCompositeOperation = 'lighter'; const gg = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, s2.sz * 1.8); gg.addColorStop(0, 'rgba(200,225,255,.45)'); gg.addColorStop(1, 'rgba(140,180,255,0)'); g.fillStyle = gg; g.beginPath(); g.arc(q.x, q.y, s2.sz * 1.8, 0, 6.283); g.fill(); g.restore();
              paintShuriken(g, q.x, q.y, s2.sz, spinR, 1); s2.px = q;
            }
            if (BIG.a > 0.01) { for (const back of [0.12, 0.08, 0.04]) paintShuriken(g, BIG.x - 70 * back * 4, BIG.y, BIG.r, BIG.rot - back * 400, 0.18); paintShuriken(g, BIG.x, BIG.y, BIG.r, BIG.rot, BIG.a); }
          });
          // 1) the ninja appears in the smoke
          await tween(380, (k) => { NJ.a = Math.min(1, k * 3); NJ.s = 0.4 + 0.2 * ease(k); NJ.y = F.y - 40 - 20 * ease(k); });
          // 2) the stars fly out to a ring round the loser
          SND.play('swoop'); RET.a = 0;
          await tween(1000, (k) => {
            const now = performance.now() - st0; NJ.a = 1 - Math.max(0, (k - 0.3) / 0.7); RET.a = Math.min(1, k * 2); RET.r = 120 - 30 * ease(k);
            for (const s2 of stars) { if (s2.state === 0 && Math.random() < 0.3) { const q = s2.px; if (q) E.emit({ x: q.x, y: q.y, vx: 0, vy: 0, life: 260, s: 5, s1: 1, col: [225, 235, 255], col1: [140, 170, 230], drag: 1 }); } }
          });
          NJ.a = 0;
          // 3) bullet time: the ring spins slowly, sparks glint, the reticle pulses
          E.freeze(60); SND.play('beep');
          await tween(620, (k) => { setDim(0.82 + 0.12 * k); RET.r = 90 - 12 * Math.sin(k * 18); const q = stars[Math.floor(rnd(0, N))].px; if (q && Math.random() < 0.5) E.burst(q.x, q.y, 1, { spd: [10, 50], life: [200, 400], s: [3, 6], col: [255, 255, 255], col1: [150, 190, 255], g: 0 }); });
          // 4) every star strikes at once
          const now2 = performance.now() - st0;
          for (const s2 of stars) { s2.from = ringPos(s2, now2); s2.go = now2; s2.state = 2; }
          SND.play('whistle');
          await tween(200, () => {});
          const nowH = performance.now() - st0; for (const s2 of stars) { s2.state = 3; s2.hit = nowH; }
          E.freeze(110); RET.a = 0; flash('#fff', 0.65, 300); SND.play('impact'); SND.play('tick');
          for (const s2 of stars) E.burst(T.x + Math.cos(s2.ang) * 16, T.y + Math.sin(s2.ang) * 16, 6, { spd: [80, 300], life: [200, 500], s: [3, 7], col: [255, 255, 255], col1: [255, 220, 120], g: 100 });
          E.ring(T.x, T.y, 280, [255, 255, 255], 480, 7);
          // 5) a giant star slices clean through, and the cross-cut
          BIG.a = 1; SND.play('swoop'); const bx0 = T.x - 240, bx1 = T.x + 240;
          await tween(320, (k) => { BIG.x = bx0 + (bx1 - bx0) * k; BIG.y = T.y + (k - 0.5) * -60; BIG.rot = k * 900; if (Math.random() < 0.8) E.burst(BIG.x, BIG.y, 2, { spd: [20, 90], life: [200, 420], s: [3, 6], col: [255, 255, 255], col1: [150, 190, 255], g: 0 }); });
          BIG.a = 0;
          [[-0.9, -22], [0.9, 22], [0, 0]].forEach(([a, o], i) => setTimeout(() => { E.slash(T.x + o * 0.6, T.y + o, a + (i === 2 ? -1.57 : 0), 380, { ms: 460, w: 17, col: [255, 255, 255] }); E.slash(T.x + o * 0.6, T.y + o, a + (i === 2 ? -1.57 : 0), 380, { ms: 460, w: 7, col: [255, 60, 60] }); }, skip ? 0 : i * 70));
          await wait(180); flash('#fff', 0.5, 300); shake(18, 520); punch(T.x, T.y, 1.07); popT(T.x, T.y, pen, '#e6ecff'); hurt(tTile); scorch(tTile, 'rgba(10,14,40,.5)'); E.smoke(T.x, T.y, 6); SND.play('impact'); SND.play('tear'); release(tgt.id);
          setTimeout(dropN, 1300);
          await wait(ti < shown.length - 1 ? 650 : 1500);
        } else if (style === 'blackhole') {
          // a vortex opens over the loser and pulls its cards in
          SND.play('roar'); setDim(0.92);
          const BH = { r: 0, rot: 0, a: 1 };
          const dropBH = tileLayer((g) => { if (BH.r < 2) return; paintBlackHole(g, T.x, T.y, BH.r, BH.rot, BH.a); });
          await tween(650, (k) => { BH.r = 62 * ease(k); BH.rot += 0.05; });
          try { tTile.animate([{ transform: 'none' }, { transform: 'scale(.94) rotate(-3deg)', offset: .25 }, { transform: 'scale(.82) rotate(4deg)', offset: .6 }, { transform: 'scale(.62) rotate(-8deg)', opacity: .55 }], { duration: 950, easing: 'ease-in' }); } catch {}
          await tween(950, (k) => {
            BH.rot += 0.07 + k * 0.1; BH.r = 62 + 4 * Math.sin(k * 22);
            for (let i = 0; i < 3; i++) { const a = rnd(0, 6.283), r0 = rnd(130, 240), x = T.x + Math.cos(a) * r0, y = T.y + Math.sin(a) * r0 * 0.8; E.emit({ x, y, vx: -Math.cos(a) * r0 / 0.45, vy: -Math.sin(a) * r0 * 0.8 / 0.45, life: 450, s: 6, s1: 1, col: [225, 175, 255], col1: [110, 50, 200], drag: 1 }); }
          });
          await tween(220, (k) => { BH.r = 66 * (1 - k * k); });
          E.freeze(100); flash('#e3c4ff', 0.55, 420); E.burst(T.x, T.y, 46, { spd: [140, 520], life: [500, 1100], s: [6, 16], col: [235, 200, 255], col1: [100, 40, 200], g: 80 }); E.ring(T.x, T.y, 280, [210, 160, 255], 560, 8); E.ring(T.x, T.y, 170, [255, 255, 255], 380, 4);
          shake(20, 600); punch(T.x, T.y, 1.08, 420); popT(T.x, T.y, pen, '#e0b8ff', 250); hurt(tTile); scorch(tTile, 'rgba(30,0,60,.55)'); SND.play('boom'); release(tgt.id);
          dropBH();
          await wait(ti < shown.length - 1 ? 650 : 1500);
        } else if (style === 'fist') {
          // a glowing war hammer from the sky: shockwave, lava cracks, lightning
          SND.play('whistle'); setDim(0.78);
          const Hm = { x: -999, y: -999, s: 0.9, rot: 0, glow: 0.3 }, dropHm = E.layer((g) => paintHammer(g, Hm.x, Hm.y, Hm.s, Hm.rot, Hm.glow)), sh = mk('width:240px;height:70px;margin:-35px 0 0 -120px;border-radius:50%;background:radial-gradient(ellipse, rgba(0,0,0,.72), transparent 70%);opacity:0');
          const y0 = -200, yHit = Math.max(130, T.y - 24);
          await tween(660, (k) => { const e = k * k * k, y = y0 + (yHit - y0) * e; Hm.x = T.x + 80 * (1 - e); Hm.y = y; Hm.s = 0.75 + 0.4 * e; Hm.rot = 32 * (1 - e); Hm.glow = 0.3 + 0.7 * k; sh.style.opacity = String(k); sh.style.transform = `translate(${T.x}px,${T.y + 44}px) scale(${0.4 + 0.9 * k})`; E.speed(Hm.x, y, 0, 1, 2); if (Math.random() < 0.8) E.emit({ x: Hm.x + rnd(-80, 80), y: y + rnd(-40, 40), vx: rnd(-30, 30), vy: -rnd(60, 200), g: 0, life: rnd(300, 600), s: rnd(4, 9), s1: 0, col: [255, 220, 130], col1: [255, 90, 20] }); });
          sh.remove(); E.freeze(130); SND.play('boom'); SND.play('impact'); Hm.glow = 1;
          // the ground gives way: jagged cracks that taper from the impact and branch, dark crevices with a lit lip, a faint ember
          // only deep in the main ones, a dented crater ringed by broken fractures; they run outward in a split second, then fade
          const CX = T.x, CY = T.y + 24, branches = [];   // each crack is one tapered ribbon (points with width and distance from the impact)
          const crack = (x, y, ang, len, w, dep, d0) => {
            let cx = x, cy = y, a = ang, dist = d0; const n = 5 + Math.floor(rnd(0, 4)), step = len / n, pts = [{ x, y, w, d: d0 }];
            branches.push({ pts, main: dep === 2 });
            for (let j = 0; j < n; j++) {
              a += (rnd(0, 1) < 0.3 ? rnd(-0.6, 0.6) : rnd(-0.18, 0.18)) * (j ? 1 : 0.4);   // mostly straight runs with the odd sharp turn, like a fracture in something hard
              cx += Math.cos(a) * step * rnd(0.7, 1.3); cy += Math.sin(a) * step * rnd(0.7, 1.3) * 0.72;   // flattened: the cracks lie on the table
              dist += step; const ww = w * Math.max(0, 1 - (j + 1) / n); pts.push({ x: cx, y: cy, w: ww, d: dist });
              if (dep > 0 && j > 0 && j < n - 1 && rnd(0, 1) < 0.28) crack(cx, cy, a + (rnd(0, 1) < 0.5 ? -1 : 1) * rnd(0.45, 1.1), len * rnd(0.3, 0.55), ww * 0.75, dep - 1, dist);
            }
          };
          const nMain = 7; for (let i = 0; i < nMain; i++) crack(CX + rnd(-6, 6), CY + rnd(-4, 4), (i / nMain) * 6.283 + rnd(-0.35, 0.35), rnd(70, 150), rnd(4.5, 7), 2, 0);
          for (let i = 0; i < 14; i++) { const a = rnd(0, 6.283), r = rnd(14, 34); crack(CX + Math.cos(a) * r, CY + Math.sin(a) * r * 0.72, a + rnd(-0.6, 0.6), rnd(12, 26), 1.6, 0, r); }   // short hairline fractures round the dent
          const rings = Array.from({ length: 5 }, () => ({ r: rnd(26, 46), a0: rnd(0, 6.283), span: rnd(0.5, 1.3) }));
          const maxD = branches.reduce((m, br) => Math.max(m, br.pts[br.pts.length - 1].d), 1);
          // the visible part of a crack as one filled, tapering shape: it grows out to `reach`, so there are no joints to show
          const ribbon = (pts, reach, wk, oy) => {
            const vis = []; for (let i = 0; i < pts.length; i++) { const q = pts[i]; if (q.d <= reach) { vis.push(q); continue; } const pv = pts[i - 1]; if (pv) { const f = (reach - pv.d) / (q.d - pv.d || 1); vis.push({ x: pv.x + (q.x - pv.x) * f, y: pv.y + (q.y - pv.y) * f, w: pv.w + (q.w - pv.w) * f * 0.5, d: reach }); } break; }
            if (vis.length < 2) return null;
            const L = [], R = [];
            vis.forEach((q, i) => { const a = vis[Math.max(0, i - 1)], b = vis[Math.min(vis.length - 1, i + 1)]; let dx = b.x - a.x, dy = b.y - a.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; const h = Math.max(0.3, q.w * wk) / 2; L.push([q.x - dy * h, q.y + dx * h + oy]); R.push([q.x + dy * h, q.y - dx * h + oy]); });
            const path = new Path2D(); path.moveTo(L[0][0], L[0][1]); L.forEach((q) => path.lineTo(q[0], q[1])); for (let i = R.length - 1; i >= 0; i--) path.lineTo(R[i][0], R[i][1]); path.closePath(); return path;
          };
          const ct0 = performance.now(), dropCr = E.layer((g) => {
            const t = (performance.now() - ct0) / 1000; if (t > 1.9) return;
            const reach = Math.min(1, t / 0.28) * maxD * 1.05, fade = 1 - Math.max(0, t - 1.25) / 0.65; g.globalAlpha = Math.max(0, fade);
            // the dent: a dark, soft-edged bowl
            const dg = g.createRadialGradient(CX, CY, 0, CX, CY, 58); dg.addColorStop(0, 'rgba(10,6,3,.55)'); dg.addColorStop(0.6, 'rgba(20,12,6,.25)'); dg.addColorStop(1, 'rgba(20,12,6,0)'); g.save(); g.translate(CX, CY); g.scale(1, 0.72); g.translate(-CX, -CY); g.fillStyle = dg; g.beginPath(); g.arc(CX, CY, 58, 0, 6.283); g.fill();
            g.lineCap = 'round'; for (const q of rings) { g.strokeStyle = 'rgba(8,5,3,.7)'; g.lineWidth = 2; g.beginPath(); g.arc(CX, CY, q.r, q.a0, q.a0 + q.span * Math.min(1, t / 0.2)); g.stroke(); g.strokeStyle = 'rgba(255,235,210,.14)'; g.lineWidth = 1; g.beginPath(); g.arc(CX, CY - 1.4, q.r, q.a0, q.a0 + q.span * Math.min(1, t / 0.2)); g.stroke(); } g.restore();
            const lips = new Path2D(), dark = new Path2D();   // every crack in one fill per layer: nothing doubles up where they meet
            for (const br of branches) { const l = ribbon(br.pts, reach, 0.7, -1.3), d = ribbon(br.pts, reach, 1, 0.5); if (l) lips.addPath(l); if (d) dark.addPath(d); }
            g.fillStyle = 'rgba(255,236,214,.2)'; g.fill(lips, 'nonzero');   // the lit upper lip of each crevice
            g.fillStyle = 'rgba(6,4,2,.9)'; g.fill(dark, 'nonzero');          // the crevice itself
            const ember = Math.max(0, 1 - t / 0.9);   // a dull glow deep down right where it struck, cooling fast
            if (ember > 0) { g.save(); g.globalCompositeOperation = 'lighter'; const eg = g.createRadialGradient(CX, CY, 0, CX, CY, 26); eg.addColorStop(0, `rgba(255,120,40,${0.5 * ember})`); eg.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = eg; g.fill(dark, 'nonzero'); g.restore(); }
          });
          flash('#fff0d0', 0.5, 340); for (const [rr, c, w, ms] of [[360, [255, 240, 210], 10, 580], [230, [255, 190, 100], 7, 460], [120, [255, 255, 255], 4, 330]]) E.ring(T.x, T.y, rr, c, ms, w);
          for (let i = 0; i < 6; i++) E.bolt(Hm.x + rnd(-60, 60), Hm.y + rnd(-30, 30), T.x + rnd(-170, 170), T.y + rnd(30, 120), { w: 4, ms: 260, branches: 2, col: [255, 190, 90] });
          E.burst(T.x, T.y, 38, { spd: [140, 580], life: [600, 1200], s: [6, 15], col: [150, 130, 110], col1: [60, 50, 45], g: 900, add: false }); E.burst(T.x, T.y, 26, { spd: [100, 480], life: [500, 1000], s: [4, 9], col: [255, 230, 150], col1: [255, 80, 20], g: 500 }); E.smoke(T.x, T.y, 12, { size: [40, 100] });
          shake(28, 700); punch(T.x, T.y, 1.12, 440); popT(T.x, T.y, pen, '#ffd27a', 200); hurt(tTile); scorch(tTile, 'rgba(30,15,0,.5)'); release(tgt.id);
          try { tTile.animate([{ transform: 'none' }, { transform: 'scale(1.06,.78)', offset: .25 }, { transform: 'none' }], { duration: 520 }); } catch {}
          await wait(320);
          await tween(480, (k) => { Hm.y -= 14 * k; Hm.rot = -10 * k; Hm.glow = 1 - k; });
          dropHm(); setTimeout(dropCr, 1300);
          await wait(ti < shown.length - 1 ? 650 : 1500);
        } else if (style === 'ice') {
          // an ice slab grows over the loser's tile (frost ferns, crystals, mist), then it bursts into shards
          SND.play('chime'); setDim(0.72);
          const r = tileRect(tTile), IC = { k: 0 }, shards = [];
          const seg = []; const fern = (x, y, an, len, dep, d0) => { if (dep <= 0 || len < 5) return; const x2 = x + Math.cos(an) * len, y2 = y + Math.sin(an) * len; seg.push([x, y, x2, y2, d0, dep]); fern(x2, y2, an + 0.6, len * 0.62, dep - 1, d0 + 0.08); fern(x2, y2, an - 0.6, len * 0.62, dep - 1, d0 + 0.08); fern(x2, y2, an + rnd(-0.15, 0.15), len * 0.72, dep - 1, d0 + 0.1); };
          for (let i = 0; i < 9; i++) { const side = i % 4; const px = side === 0 ? r.left + rnd(0, r.width) : side === 1 ? r.right : side === 2 ? r.left + rnd(0, r.width) : r.left; const py = side === 0 ? r.top : side === 1 ? r.top + rnd(0, r.height) : r.bottom; const base = side === 0 ? Math.PI / 2 : side === 1 ? Math.PI : side === 2 ? -Math.PI / 2 : 0; fern(px, py, base + rnd(-0.3, 0.3), rnd(34, 52), 4, rnd(0, 0.25)); }
          const crystals = Array.from({ length: 12 }, (_, i) => { const bottom = i < 7, bx = bottom ? r.left + (i + 0.5) / 7 * r.width + rnd(-8, 8) : (i % 2 ? r.right : r.left), by = bottom ? r.bottom + 4 : r.top + rnd(0.3, 0.9) * r.height; return { x: bx, y: by, an: bottom ? -Math.PI / 2 + rnd(-0.45, 0.45) : (i % 2 ? -0.4 : -Math.PI + 0.4) + rnd(-0.3, 0.3), len: bottom ? rnd(48, 96) : rnd(30, 60), w: rnd(15, 26), d: rnd(0, 0.35) }; });
          const rrPath = (g, pad = 0) => { g.beginPath(); g.roundRect ? g.roundRect(r.left - pad, r.top - pad, r.width + pad * 2, r.height + pad * 2, 14 + pad) : g.rect(r.left - pad, r.top - pad, r.width + pad * 2, r.height + pad * 2); };
          let lastT = performance.now();
          const dropIce = tileLayer((g) => {
            const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
            if (shards.length) { for (const sh of shards) { sh.life -= dt; if (sh.life <= 0) continue; sh.vy += 900 * dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.rot += sh.vr * dt; g.save(); g.globalAlpha = Math.min(1, sh.life * 1.4); g.translate(sh.x, sh.y); g.rotate(sh.rot); const gr = g.createLinearGradient(-sh.sz, -sh.sz, sh.sz, sh.sz); gr.addColorStop(0, 'rgba(250,255,255,.95)'); gr.addColorStop(0.5, 'rgba(150,210,255,.8)'); gr.addColorStop(1, 'rgba(70,140,230,.75)'); g.fillStyle = gr; g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(sh.sz, 0); g.lineTo(-sh.sz * 0.5, sh.sz * 0.8); g.lineTo(-sh.sz * 0.7, -sh.sz * 0.6); g.closePath(); g.fill(); g.stroke(); g.restore(); } return; }
            if (IC.k <= 0) return; const k = IC.k;
            g.save(); rrPath(g); g.clip();
            const sl = g.createLinearGradient(r.left, r.top, r.right, r.bottom); sl.addColorStop(0, `rgba(235,250,255,${0.62 * k})`); sl.addColorStop(0.45, `rgba(130,195,255,${0.5 * k})`); sl.addColorStop(1, `rgba(215,242,255,${0.62 * k})`); g.fillStyle = sl; g.fillRect(r.left, r.top, r.width, r.height);
            g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineCap = 'round'; for (const [x1, y1, x2, y2, d0, dep] of seg) { const p = Math.max(0, Math.min(1, (k * 1.4 - d0) * 2.2)); if (p <= 0) continue; g.lineWidth = 0.8 + dep * 0.5; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p); g.stroke(); }
            const sx = r.left + ((now / 900) % 1.6 - 0.3) * r.width * 1.6, bg2 = g.createLinearGradient(sx - 40, 0, sx + 40, 0); bg2.addColorStop(0, 'rgba(255,255,255,0)'); bg2.addColorStop(0.5, `rgba(255,255,255,${0.35 * k})`); bg2.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = bg2; g.save(); g.translate(0, 0); g.transform(1, 0, -0.35, 1, 0, 0); g.fillRect(sx - 40, r.top, 80, r.height); g.restore();
            g.restore();
            g.save(); g.shadowColor = 'rgba(150,215,255,.95)'; g.shadowBlur = 22; g.strokeStyle = `rgba(255,255,255,${0.95 * k})`; g.lineWidth = 3; rrPath(g); g.stroke(); g.restore();
            for (const c of crystals) { const q = Math.max(0, Math.min(1, (k - c.d) / 0.55)); if (q <= 0) continue; const L2 = c.len * q, ca = Math.cos(c.an), sa = Math.sin(c.an), nx = -sa, ny = ca, tx = c.x + ca * L2, ty = c.y + sa * L2, mx = c.x + ca * L2 * 0.35, my = c.y + sa * L2 * 0.35, hw = c.w * 0.5 * q; const lf = g.createLinearGradient(c.x - nx * hw, c.y - ny * hw, tx, ty); lf.addColorStop(0, 'rgba(230,248,255,.95)'); lf.addColorStop(1, 'rgba(255,255,255,.98)'); g.fillStyle = lf; g.beginPath(); g.moveTo(c.x - nx * hw, c.y - ny * hw); g.lineTo(mx - nx * hw * 1.05, my - ny * hw * 1.05); g.lineTo(tx, ty); g.lineTo(c.x, c.y); g.closePath(); g.fill(); const rf = g.createLinearGradient(c.x + nx * hw, c.y + ny * hw, tx, ty); rf.addColorStop(0, 'rgba(90,165,240,.95)'); rf.addColorStop(1, 'rgba(170,220,255,.95)'); g.fillStyle = rf; g.beginPath(); g.moveTo(c.x + nx * hw, c.y + ny * hw); g.lineTo(mx + nx * hw * 1.05, my + ny * hw * 1.05); g.lineTo(tx, ty); g.lineTo(c.x, c.y); g.closePath(); g.fill(); g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(c.x - nx * hw, c.y - ny * hw); g.lineTo(mx - nx * hw * 1.05, my - ny * hw * 1.05); g.lineTo(tx, ty); g.lineTo(mx + nx * hw * 1.05, my + ny * hw * 1.05); g.lineTo(c.x + nx * hw, c.y + ny * hw); g.stroke(); if (q > 0.85) { g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2; const gl = 9 + 4 * Math.sin(now / 120 + c.x); g.beginPath(); g.moveTo(tx - gl, ty); g.lineTo(tx + gl, ty); g.moveTo(tx, ty - gl); g.lineTo(tx, ty + gl); g.stroke(); g.restore(); } }
          });
          await tween(1000, (k) => {
            IC.k = k;
            if (Math.random() < 0.8) E.emit({ x: r.left + rnd(0, r.width), y: r.top - 24, vx: rnd(-30, 30), vy: rnd(50, 130), g: 20, life: 900, s: rnd(3, 6), s1: 2, col: [255, 255, 255], col1: [170, 215, 255], drag: 0.99 });
            if (Math.random() < 0.5) E.emit({ x: r.left + rnd(0, r.width), y: r.bottom + 6, vx: rnd(-40, 40), vy: -rnd(20, 70), g: -10, life: 1100, s: rnd(28, 48), s1: rnd(60, 90), col: [210, 236, 255], col1: [170, 210, 250], add: false, a: 0.22, drag: 0.99 });
          });
          SND.play('crackle'); await wait(420);
          E.freeze(110); SND.play('boom'); SND.play('impact');
          for (let i = 0; i < 46; i++) { const px = r.left + rnd(0, r.width), py = r.top + rnd(0, r.height), an = Math.atan2(py - T.y, px - T.x), sp = rnd(180, 700); shards.push({ x: px, y: py, vx: Math.cos(an) * sp + rnd(-60, 60), vy: Math.sin(an) * sp - rnd(80, 320), rot: rnd(0, 6.28), vr: rnd(-8, 8), sz: rnd(8, 26), life: rnd(0.9, 1.6) }); }
          IC.k = 0;
          E.burst(T.x, T.y, 30, { spd: [100, 380], life: [400, 800], s: [6, 12], col: [255, 255, 255], col1: [160, 215, 255], g: 100 });
          E.ring(T.x, T.y, 320, [190, 230, 255], 540, 9); E.ring(T.x, T.y, 180, [255, 255, 255], 380, 5); flash('#d6f0ff', 0.5, 360);
          shake(20, 600); punch(T.x, T.y, 1.07); popT(T.x, T.y, pen, '#bfe6ff', 200); hurt(tTile); release(tgt.id);
          setTimeout(dropIce, 1800);
          await wait(ti < shown.length - 1 ? 650 : 1500);
        } else if (style === 'cannon') {
          // an ornate cannon rolls in from the side, the fuse burns down and it fires
          setDim(0.7);
          const dirx = T.x > W / 2 ? 1 : -1, cx = dirx > 0 ? 70 : W - 70, cy = Math.min(H - 100, Math.max(140, T.y + 90)), ang = Math.atan2(T.y - (cy - 4), T.x - cx);
          const C = { off: 190, rec: 0, fuse: false, spin: 0 }, ball = { x: 0, y: 0, a: 0, px: 0, py: 0 }, cn0 = performance.now();
          const dropCn = E.layer((g) => {
            paintCannon(g, cx - dirx * C.off, cy, ang, C.rec, C.spin, C.fuse, performance.now() - cn0);
            if (ball.a > 0) { for (const [b2, al] of [[0.3, 0.18], [0.15, 0.3]]) { const bx2 = ball.x - (ball.x - ball.px) * b2 * 4, by2 = ball.y - (ball.y - ball.py) * b2 * 4; g.save(); g.globalAlpha = al; g.fillStyle = '#222'; g.beginPath(); g.arc(bx2, by2, 17, 0, 6.283); g.fill(); g.restore(); } g.save(); const gr2 = g.createRadialGradient(ball.x - 6, ball.y - 7, 2, ball.x, ball.y, 20); gr2.addColorStop(0, '#d7dde8'); gr2.addColorStop(0.35, '#4b5566'); gr2.addColorStop(1, '#05070a'); g.fillStyle = gr2; g.beginPath(); g.arc(ball.x, ball.y, 19, 0, 6.283); g.fill(); g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 1.5; g.stroke(); g.restore(); }
          });
          SND.play('whistle');
          await tween(520, (k) => { C.off = 190 * (1 - ease(k)); C.spin = (1 - ease(k)) * 9 * dirx; });
          const fuseXY = () => { const fl = Math.cos(ang) < 0 ? -1 : 1, lx = -10, ly = -46 * fl, ca = Math.cos(ang), sa = Math.sin(ang); return [cx + lx * ca - ly * sa, cy - 4 + lx * sa + ly * ca]; };
          C.fuse = true;
          await tween(620, () => { const [fx, fy] = fuseXY(); E.burst(fx, fy, 2, { spd: [30, 140], life: [200, 420], s: [3, 6], col: [255, 240, 170], col1: [255, 110, 30], g: 120 }); });
          C.fuse = false;
          const mx = cx + Math.cos(ang) * 94, my = cy - 4 + Math.sin(ang) * 94;
          SND.play('boom'); E.flame(mx, my, Math.cos(ang), Math.sin(ang), 18, { spd: 560, spread: 0.32, size: [20, 46], life: [220, 460] }); E.smoke(mx, my, 12, { size: [44, 96] }); E.ring(mx, my, 110, [255, 220, 150], 360, 6); flash('#ffe3b0', 0.3, 200); shake(9, 300);
          const dst = Math.hypot(T.x - mx, T.y - my), arc = Math.min(130, dst * 0.18), rc0 = performance.now(); ball.a = 1; ball.x = ball.px = mx; ball.y = ball.py = my;
          await tween(560, (k) => { C.rec = 26 * Math.max(0, 1 - (performance.now() - rc0) / 280); ball.px = ball.x; ball.py = ball.y; ball.x = mx + (T.x - mx) * k; ball.y = my + (T.y - my) * k - arc * 4 * k * (1 - k); E.smoke(ball.x, ball.y, 1, { size: [12, 26], life: [320, 560] }); if (Math.random() < 0.6) E.emit({ x: ball.x, y: ball.y, vx: rnd(-30, 30), vy: rnd(-30, 30), g: 100, life: 300, s: 4, s1: 0, col: [255, 200, 100], col1: [255, 70, 10] }); });
          ball.a = 0; C.rec = 0;
          E.freeze(110); flash('#fff0c8', 0.6, 380); E.explosion(T.x, T.y, 1.7); E.burst(T.x, T.y, 24, { spd: [140, 560], life: [600, 1200], s: [6, 13], col: [90, 76, 68], col1: [30, 26, 24], g: 800, add: false }); E.ring(T.x, T.y, 320, [255, 255, 255], 520, 8); E.ring(T.x, T.y, 190, [255, 180, 80], 440, 6);
          shake(22, 640); punch(T.x, T.y, 1.1, 420); popT(T.x, T.y, pen, '#ffb02e', 300); hurt(tTile); scorch(tTile, 'rgba(30,10,0,.5)'); SND.play('impact'); release(tgt.id);
          await wait(500);
          await tween(400, (k) => { C.off = 200 * k; C.spin = -k * 6 * dirx; });
          dropCn();
          await wait(ti < shown.length - 1 ? 300 : 900);
        } else if (style === 'ufo') {
          // an invasion: the saucer sweeps its searchlight, locks onto the tile, lifts it, charges a plasma cannon and vaporises it
          SND.play('whistle'); setDim(0.9);
          const r = tileRect(tTile), uy = Math.max(110, T.y - 200), U = { x: T.x + (T.x > W / 2 ? -1 : 1) * W * 0.65, y: -140, b: 0, f: 1, ang: 0, lock: 0, ch: 0, dx: 0, dy: -300, sc: 0.7, rot: 0 }, ut0 = performance.now();
          const dropUfo = E.layer((g) => paintUfo(g, U.dx, U.dy, U.sc * 1.2, U.rot, performance.now() - ut0, U.ch));
          const cardBox = () => (tTile.querySelector('.tcards') || tTile).getBoundingClientRect();   // measured every frame: the page and the tile move during the attack
          const dropBm = E.layer((g) => {
            if (U.b <= 0.01) return;
            const rr = cardBox(), by2 = U.dy + 24 * U.sc * 1.2, ex = rr.left + rr.width / 2, ey = rr.bottom + 4, al = U.f * U.b, now = performance.now();
            let tx = ex, hw = rr.width / 2 + 10;
            if (U.lock < 1) { tx = ex + Math.sin(U.ang) * W * 0.5 * (1 - U.lock); hw = 60 + (hw - 60) * U.lock; }
            const top = 20 * U.sc * 1.2, ty = ey;
            g.save(); g.globalCompositeOperation = 'lighter';
            // three nested cones: wide and faint to narrow and bright, so the edges are soft
            for (const [wk, a0] of [[1, 0.16], [0.72, 0.18], [0.42, 0.22]]) {
              const lt = U.dx - top * wk, rt = U.dx + top * wk, lb = tx - hw * wk, rb = tx + hw * wk;
              const gr = g.createLinearGradient(0, by2, 0, ty); gr.addColorStop(0, `rgba(190,255,230,${a0 * 1.6 * al})`); gr.addColorStop(0.7, `rgba(120,255,200,${a0 * al})`); gr.addColorStop(1, `rgba(120,255,200,${a0 * 0.5 * al})`);
              g.fillStyle = gr; g.beginPath(); g.moveTo(lt, by2); g.lineTo(rt, by2); g.lineTo(rb, ty); g.lineTo(lb, ty); g.closePath(); g.fill();
            }
            // rings of light rising up the beam
            for (let i = 0; i < 5; i++) {
              const ph = ((now / 900 + i / 5) % 1), y = ty - ph * (ty - by2), w2 = hw + (top - hw) * ph, x2 = tx + (U.dx - tx) * ph;
              g.strokeStyle = `rgba(210,255,240,${0.4 * (1 - ph) * al})`; g.lineWidth = 2; g.beginPath(); g.ellipse(x2, y, w2, Math.max(2, w2 * 0.16), 0, 0, 6.283); g.stroke();
            }
            const pool = g.createRadialGradient(tx, ty, 0, tx, ty, hw * 1.3); pool.addColorStop(0, `rgba(210,255,235,${0.45 * al})`); pool.addColorStop(1, 'rgba(110,255,200,0)'); g.fillStyle = pool; g.beginPath(); g.ellipse(tx, ty, hw * 1.3, hw * 0.3, 0, 0, 6.283); g.fill();
            g.restore();
          });
          // 1) it arrives, the whole screen rumbling
          await tween(760, (k) => { const e = ease(k); U.x = U.x + (T.x - U.x) * 0.15; U.y = -140 + (uy + 140) * e; U.dx = U.x; U.dy = U.y + Math.sin(k * 14) * 6; U.sc = 0.6 + 0.45 * e; U.rot = Math.sin(k * 10) * 7; jitter(3 * k); });
          jitter(0); SND.play('boom'); shake(10, 420); E.ring(U.dx, U.dy + 40, 260, [150, 255, 210], 640, 6);
          // 2) the searchlight sweeps across the area, then locks onto the loser
          SND.play('beep'); U.b = 0.01;
          await tween(1000, (k) => { U.b = Math.min(1, k * 6); U.ang = k * 9; U.lock = k > 0.72 ? Math.min(1, (k - 0.72) / 0.28) : 0; U.dx = U.x + Math.sin(k * 16) * 7; U.dy = uy + Math.sin(k * 11) * 5; });
          U.lock = 1; SND.play('chime'); { const cb = cardBox(); E.ring(cb.left + cb.width / 2, cb.bottom, 150, [160, 255, 215], 520, 4); }
          // 3) the tile is lifted and spun in the beam, wind spiralling up around it
          try { tTile.animate([{ transform: 'none', filter: 'none' }, { transform: 'translateY(-30px) rotate(-4deg)', filter: 'brightness(1.3) drop-shadow(0 0 16px #7dffc8)', offset: .2 }, { transform: 'translateY(-52px) rotate(6deg)', filter: 'brightness(1.5) drop-shadow(0 0 26px #7dffc8)', offset: .6 }, { transform: 'translateY(-46px) rotate(-5deg)', filter: 'brightness(1.6) drop-shadow(0 0 30px #7dffc8)' }], { duration: 1100, easing: 'ease-in-out' }); } catch {}
          await tween(1100, (k) => {
            U.dx = U.x + Math.sin(k * 20) * 6; U.dy = uy + Math.sin(k * 13) * 5; U.ch = Math.max(0, (k - 0.35) / 0.65);
            for (let i = 0; i < 3; i++) { const cb = cardBox(), a = rnd(0, 6.283), rr = cb.width * rnd(0.35, 0.6), cx2 = cb.left + cb.width / 2, cy2 = cb.bottom - 6; E.emit({ x: cx2 + Math.cos(a) * rr, y: cy2 + rnd(-6, 6), vx: -Math.sin(a) * 160, vy: -rnd(160, 340), g: 0, life: rnd(500, 900), s: rnd(3, 7), s1: 1, col: [210, 255, 235], col1: [60, 230, 160], drag: 0.99 }); }
            if (k > 0.6 && Math.random() < 0.5) { const cb = cardBox(); E.bolt(U.dx + rnd(-30, 30), U.dy + 30, cb.left + rnd(0, cb.width), cb.top + rnd(0, cb.height), { w: 3, ms: 140, branches: 1, col: [150, 255, 210] }); }
            jitter(2 * k);
          });
          jitter(0);
          // 4) fire: a thick plasma beam, then the tile is vaporised
          E.freeze(110); SND.play('thunder'); SND.play('boom'); flash('#d4ffee', 0.22, 260); U.ch = 1;
          { const cb = cardBox(), cx = cb.left + cb.width / 2, cy = cb.top + cb.height / 2; for (let i = 0; i < 3; i++) E.beam(U.dx, U.dy + 30, cx, cy, { w: 46 - i * 14, col: i % 2 ? [255, 255, 255] : [110, 255, 190], ms: 260 }); E.bolt(U.dx, U.dy + 30, cx, cy, { w: 8, ms: 420, branches: 4, col: [130, 255, 200] }); }
          E.explosion(T.x, T.y, 1.5); E.burst(T.x, T.y, 60, { spd: [160, 700], life: [600, 1300], s: [4, 10], col: [235, 255, 245], col1: [30, 200, 130], g: 160 });
          for (const [rr, c, w, ms] of [[340, [150, 255, 210], 9, 600], [220, [255, 255, 255], 6, 460], [120, [100, 255, 190], 4, 340]]) E.ring(T.x, T.y, rr, c, ms, w);
          shake(26, 700); punch(T.x, T.y, 1.1, 440); popT(T.x, T.y, pen, '#9dffd0', 220); hurt(tTile); scorch(tTile, 'rgba(0,40,20,.55)'); release(tgt.id);
          await wait(300);
          // 5) it leaves in a hurry, a sonic ring behind it
          E.ring(U.dx, U.dy, 300, [200, 255, 230], 520, 5); SND.play('swoop');
          await tween(520, (k) => { U.ch = 1 - k; U.f = 1 - k; U.b = 1 - k; const e = k * k, ox = U.dx; U.dx += 34; U.dy -= 38 * e * 3; E.speed(U.dx, U.dy, 1, -1, 3); });
          dropBm(); dropUfo();
          await wait(ti < shown.length - 1 ? 400 : 1100);
        } else {
          const cm = { x: -999, y: -999, s: 0.5, a: 0 }, sh = mk(`width:240px;height:240px;margin:-120px 0 0 -120px;border-radius:50%;background:radial-gradient(circle, rgba(0,0,0,.75), transparent 70%);opacity:0`), warn = mk(`inset:0;width:100vw;height:100vh;background:radial-gradient(circle at ${T.x}px ${T.y}px, rgba(255,60,40,.0), rgba(255,40,30,.28));opacity:0`);
          const sx = Math.min(W + 30, T.x + W * 0.62), sy = Math.max(-40, T.y - H * 0.7);
          const cdx = sx - T.x, cdy = sy - T.y, cl2 = Math.hypot(cdx, cdy) || 1, ux = cdx / cl2, uy = cdy / cl2;   // the tail points back the way it came
          const dropComet = E.layer((g) => {
            if (cm.a <= 0) return; const sc = cm.s, tail = 360 * sc, nx = -uy, ny = ux; g.globalAlpha = cm.a; g.globalCompositeOperation = 'lighter';
            for (const [wd, c0, al] of [[46, '255,120,30', 0.55], [30, '255,190,80', 0.7], [14, '255,250,220', 0.9]]) { const gr = g.createLinearGradient(cm.x, cm.y, cm.x + ux * tail, cm.y + uy * tail); gr.addColorStop(0, `rgba(${c0},${al})`); gr.addColorStop(1, `rgba(${c0},0)`); g.fillStyle = gr; g.beginPath(); g.moveTo(cm.x + nx * wd * sc * 0.5, cm.y + ny * wd * sc * 0.5); g.lineTo(cm.x + ux * tail, cm.y + uy * tail); g.lineTo(cm.x - nx * wd * sc * 0.5, cm.y - ny * wd * sc * 0.5); g.closePath(); g.fill(); }
            const hr = 50 * sc, og = g.createRadialGradient(cm.x, cm.y, 0, cm.x, cm.y, hr); og.addColorStop(0, 'rgba(255,255,240,1)'); og.addColorStop(0.3, 'rgba(255,214,120,.95)'); og.addColorStop(0.65, 'rgba(255,110,30,.55)'); og.addColorStop(1, 'rgba(255,60,10,0)'); g.fillStyle = og; g.beginPath(); g.arc(cm.x, cm.y, hr, 0, 6.283); g.fill();
            g.globalCompositeOperation = 'source-over'; const rk = g.createRadialGradient(cm.x - 5 * sc, cm.y - 6 * sc, 2, cm.x, cm.y, 24 * sc); rk.addColorStop(0, '#fff2c4'); rk.addColorStop(0.5, '#ff9a3a'); rk.addColorStop(1, '#a83a10'); g.fillStyle = rk; g.beginPath(); g.arc(cm.x, cm.y, 22 * sc, 0, 6.283); g.fill();   // the rock at its heart
          });
          SND.play('swoop');
          await tween(1700, (k) => {
            const e = Math.pow(k, 1.7), slow = k > 0.85 ? 1 : 0;   // it falls faster and faster, so there is time to see it coming
            const x = sx + (T.x - sx) * e, y = sy + (T.y - sy) * e;
            cm.x = x; cm.y = y; cm.s = 0.5 + 0.9 * e; cm.a = Math.min(1, k * 5);
            sh.style.opacity = String(0.95 * Math.min(1, k * 1.4)); sh.style.transform = `translate(${T.x}px,${T.y}px) scale(${0.25 + 1.0 * e})`; warn.style.opacity = String(0.6 + 0.4 * Math.sin(k * 22));
            E.flame(x + ux * 30, y + uy * 30, ux, uy, 5, { spd: 180, spread: 0.45, size: [16, 40], life: [500, 900] }); E.burst(x, y, 1, { spd: [40, 160], life: [400, 800], s: [3, 7], col: [255, 230, 150], col1: [255, 90, 20], g: 120 });
            jitter(6 * e);
          });
          jitter(0); dropComet(); sh.remove(); warn.remove();
          flash('#fff', 0.6, 420); E.freeze(110); await wait(110);
          E.explosion(T.x, T.y, 2); E.burst(T.x, T.y, 28, { spd: [160, 620], life: [700, 1300], s: [6, 14], col: [150, 120, 100], col1: [40, 30, 30], g: 900, add: false });
          E.ring(T.x, T.y, 300, [255, 255, 255], 500, 8); E.smoke(T.x, T.y, 18, { size: [40, 90] });
          shake(24, 700); punch(T.x, T.y, 1.1, 420); popT(T.x, T.y, pen, '#ffc247', 300); hurt(tTile); scorch(tTile, 'rgba(30,10,0,.5)'); SND.play('boom'); SND.play('impact'); release(tgt.id);
          await wait(ti < shown.length - 1 ? 900 : 1500);   // long enough to read the penalty before the verdict takes over
        }
      }
    };
    if (anchoredStrikes) {
      for (let ti = 0; ti < shown.length; ti++) await strike(ti);
    } else await Promise.all(shown.map(async (_, ti) => { await wait(ti * 450); await strike(ti); }));
    targets.slice(3).forEach((e) => release(e.id));
    dimEl.style.transition = 'opacity 1.1s cubic-bezier(.4,0,.2,1)'; setDim(0); cap.classList.remove('on');
    await wait(1150);
    E.stop(); fx.remove();
    { const y = window.scrollY; if (app) { app.style.transform = ''; } if (st) render(); window.scrollTo(0, y); }   // show the verdict chip and the results list, staying where we are
  } catch (err) {
    console.error('showdown', err);
    if (E) E.stop(); releaseAll(); document.querySelector('.atkfx')?.remove(); const a = document.getElementById('app'); if (a) { a.style.transform = ''; a.style.transformOrigin = ''; } if (st) render();
  }
}

// a dead heat: two creatures set off from the two ends of the table, meet in the middle and clash, then it is settled with a handshake
async function runClash(res) {
  const W = window.innerWidth, H = window.innerHeight;
  const pairs = [['🐉', '🐲'], ['🦅', '🦉'], ['🦁', '🐯'], ['🦈', '🐊']], pair = pairs[(st.round * 3 + res.row) % pairs.length];
  const tiles = [...document.querySelectorAll('.stage .tile[data-pid]')];
  const blocked = !!document.querySelector('.guide-ov, .avbig') || document.hidden || tiles.length < 2;
  if (reduceFx()) { atkHeld.delete('tie:' + res.row); return; }
  const fx = el('div', { class: 'atkfx' }); document.body.append(fx);
  const E = atkEngine();
  let skip = false;
  fx.append(el('button', { type: 'button', class: 'atkskip', onclick: () => { skip = true; } }, t('atkSkip')));
  const cap = el('div', { class: 'atkcap' }, t('atkClash')); fx.append(cap);
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const tween = async (ms, fn) => { const t0 = performance.now(); for (;;) { await raf(); const k = skip ? 1 : Math.min(1, (performance.now() - t0) / ms); fn(k); if (k >= 1) break; } };
  const ease = (k) => (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const mk = (css, html = '') => { const d = el('i', { class: 'atkbit' }); d.style.cssText = css; if (html) d.innerHTML = html; fx.append(d); return d; };
  const anim = (n, f, o) => { try { return n.animate(f, o); } catch { return null; } };
  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - H);
  const docY = (n) => { const r = n.getBoundingClientRect(); return r.top + window.scrollY + r.height / 2; };
  let scrollNow = window.scrollY;
  const follow = (y, rate = 0.2) => { const want = Math.max(0, Math.min(maxScroll(), y - H * 0.45)); scrollNow += (want - scrollNow) * rate; window.scrollTo(0, scrollNow); };
  const spark = (x, y, n, cols, spd = 180, life = 700, size = [4, 9]) => E.burst(x, y, n, { spd: [spd * 0.4, spd * 1.3], life: [life * 0.6, life * 1.2], s: [size[0], size[1] * 1.8], col: [255, 230, 160], col1: [255, 110, 30], g: 80 });
  const ring = (x, y, col, sz = 140, ms = 560) => E.ring(x, y, sz * 1.15, [255, 235, 180], ms, 7);
  const shakeAll = () => { try { document.getElementById('app')?.animate([{ transform: 'none' }, { transform: 'translate(-8px,5px)' }, { transform: 'translate(8px,-4px)' }, { transform: 'translate(-5px,3px)' }, { transform: 'translate(3px)' }, { transform: 'none' }], { duration: 440 }); } catch {} };
  const cx = W / 2, cy = H * 0.46;
  SND.play('roar');
  try {
    let first = null, last = null;
    if (!blocked) {
      first = tiles[0]; last = tiles[tiles.length - 1];
      const midY = (docY(first) + docY(last)) / 2;
      await panAttackCamera(docY(first), H, tween); scrollNow = window.scrollY;
      anim(first, [{ boxShadow: '0 0 0 0 rgba(255,207,64,0)' }, { boxShadow: '0 0 0 4px rgba(255,207,64,.95), 0 0 46px rgba(255,207,64,.8)', offset: .4 }, { boxShadow: '0 0 0 0 rgba(255,207,64,0)' }], { duration: 800 });
      anim(last, [{ boxShadow: '0 0 0 0 rgba(255,207,64,0)' }, { boxShadow: '0 0 0 4px rgba(255,207,64,.95), 0 0 46px rgba(255,207,64,.8)', offset: .4 }, { boxShadow: '0 0 0 0 rgba(255,207,64,0)' }], { duration: 800 });
      cap.classList.add('on');
      const a = mk('font-size:72px;line-height:1;filter:drop-shadow(0 8px 12px rgba(0,0,0,.55))', pair[0]);
      const b = mk('font-size:72px;line-height:1;filter:drop-shadow(0 8px 12px rgba(0,0,0,.55))', pair[1]);
      const ay0 = docY(first) - scrollNow;   // where the first one starts on screen
      SND.play('swoop');
      await tween(1050, (k) => {
        const e = ease(k);
        follow(docY(first) + (midY - docY(first)) * e, 0.2);   // the screen travels from the top of the table to its middle
        const ax = W * 0.18 + (cx - 34 - W * 0.18) * e, ay = Math.max(40, ay0 + (cy - ay0) * e) + Math.sin(k * 8) * 10;
        const bx = W * 0.82 + (cx + 34 - W * 0.82) * e, by = H + 60 + (cy - H - 60) * e + Math.sin(k * 8 + 2) * 10;
        a.style.transform = `translate(${ax - 36}px,${ay - 36}px) scale(${(0.5 + 0.6 * Math.min(1, k * 3)).toFixed(2)})`;
        b.style.transform = `translate(${bx - 36}px,${by - 36}px) scaleX(-1) scale(${(0.5 + 0.6 * Math.min(1, k * 3)).toFixed(2)})`;
        if (Math.random() < 0.6) { spark(ax, ay + 8, 1, ['#ffd23f', '#ff9a1f'], 30, 450, [6, 12]); spark(bx, by + 8, 1, ['#9fd2ff', '#fff'], 30, 450, [6, 12]); }
      });
      // the clash
      SND.play('clash');
      const flash = mk('inset:0;width:100vw;height:100vh;background:#fff'); anim(flash, [{ opacity: .4 }, { opacity: 0 }], { duration: 320, fill: 'forwards' });
      E.freeze(90); E.explosion(cx, cy, 1.5); E.ring(cx, cy, 300, [160, 210, 255], 560, 8); for (let i = 0; i < 3; i++) E.bolt(cx + (Math.random() - 0.5) * 60, cy + (Math.random() - 0.5) * 60, cx + (Math.random() - 0.5) * 360, cy + (Math.random() - 0.5) * 360, { w: 5, ms: 340, branches: 2 }); shakeAll();
      const word = mk('font:900 46px system-ui;color:#fff;letter-spacing:2px;-webkit-text-stroke:2px #b8780a;text-shadow:0 0 24px #ffd23f, 0 4px 0 #b8780a;white-space:nowrap', 'CLASH!');
      anim(word, [{ transform: `translate(${cx - 100}px,${cy - 120}px) scale(.2) rotate(-8deg)`, opacity: 0 }, { transform: `translate(${cx - 100}px,${cy - 120}px) scale(1.25) rotate(-4deg)`, opacity: 1, offset: .35 }, { transform: `translate(${cx - 100}px,${cy - 130}px) scale(1) rotate(-4deg)`, opacity: 1, offset: .75 }, { transform: `translate(${cx - 100}px,${cy - 150}px) scale(1.05)`, opacity: 0 }], { duration: 1100, fill: 'forwards' });
      a.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 200, fill: 'forwards' }); b.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 200, fill: 'forwards' });
      await new Promise((r) => setTimeout(r, skip ? 0 : 650));
      // settled: a handshake and a gold pulse over the whole table
      const hs = mk('font-size:64px;line-height:1', '🤝'); anim(hs, [{ transform: `translate(${cx - 32}px,${cy}px) scale(.2)`, opacity: 0 }, { transform: `translate(${cx - 32}px,${cy - 20}px) scale(1.2)`, opacity: 1, offset: .4 }, { transform: `translate(${cx - 32}px,${cy - 60}px) scale(1)`, opacity: 0 }], { duration: 1000, fill: 'forwards' });
      spark(cx, cy, 16, ['#ffd23f', '#ff8fb8', '#7be08f', '#9fd2ff'], 200, 1100, [5, 9]);
      document.querySelectorAll('.stage .tile').forEach((n) => anim(n, [{ boxShadow: '0 0 0 0 rgba(255,207,64,0)' }, { boxShadow: '0 0 0 3px rgba(255,207,64,.85), 0 0 26px rgba(255,207,64,.55)', offset: .4 }, { boxShadow: '0 0 0 0 rgba(255,207,64,0)' }], { duration: 900 }));
      SND.play('tie');
      await new Promise((r) => setTimeout(r, skip ? 0 : 700));
    } else {   // a screen is in the way: a quick clash across the foreground
      cap.remove();
      const a = mk('font-size:64px;line-height:1', pair[0]), b = mk('font-size:64px;line-height:1', pair[1]);
      await tween(700, (k) => { const e = ease(k); a.style.transform = `translate(${-60 + (cx - 30 + 60) * e}px,${H * 0.3}px)`; b.style.transform = `translate(${W + 60 - (W + 60 - cx - 30) * e}px,${H * 0.3}px) scaleX(-1)`; });
      SND.play('clash'); ring(cx, H * 0.3 + 32, '#fff', 160, 500); spark(cx, H * 0.3 + 32, 22, ['#ffd23f', '#fff', '#9fd2ff'], 220); shakeAll();
      a.remove(); b.remove(); SND.play('tie');
      await new Promise((r) => setTimeout(r, skip ? 0 : 500));
    }
  } catch (e) { /* the verdict follows anyway */ }
  await new Promise((r) => setTimeout(r, skip ? 0 : 300)); E.stop(); fx.remove();
  atkHeld.delete('tie:' + res.row);
  { const y = window.scrollY; if (st) render(); window.scrollTo(0, y); }   // now the verdict chip and the results list may show
}
function showResult(r, view, elapsed = 0) {
  // the row turns over and the cards tear first; the verdict then eases in over them
  const at = (ms) => Math.max(0, ms - elapsed);
  const cas = cascadeOf(r.entries.length);
  if (elapsed < 300) SND.play('flip');
  for (let i = 1; i < r.entries.length && i * CASCADE_STEP <= CASCADE_MAX; i++) setTimeout(() => SND.play('tick'), at(i * CASCADE_STEP));   // the drumroll
  if (r.entries.some((e) => e.as)) setTimeout(() => SND.play('morph'), at(520 + cas));
  const showdown = !r.tie && r.losers.length && elapsed < 1500 && !reduceFx();
  const clashing = r.tie && elapsed < 1500 && !reduceFx() && r.entries.length >= 2;
  if (r.tie && !clashing) setTimeout(() => SND.play('tie'), at(380 + cas));
  else if (!showdown && !clashing) setTimeout(() => SND.play('tear'), at(520 + cas));   // with a showdown the tear happens when the creature lands
  if (showdown) {   // the strongest hand's creature strikes the weakest first, then the verdict
    r.losers.forEach((id) => atkHeld.add(id));
    setTimeout(() => { runShowdown(r).then(() => buildResult(r, view, 0)); }, at(700 + cas));
    return;
  }
  if (clashing) { atkHeld.add('tie:' + r.row); setTimeout(() => { runClash(r).then(() => buildResult(r, view, 0)); }, at(700 + cas)); return; }
  setTimeout(() => buildResult(r, view, Math.max(0, elapsed - 950 - cas)), at(950 + cas));
}

function buildResult(r, view, late = 0) {
  document.querySelector('.resfx')?.remove();
  const meId = (view || st).meId;
  const names = loserNames(r);
  const iLose = !r.tie && r.losers.includes(meId);
  const others = r.losers.filter((id) => id !== meId).map((id) => r.entries.find((e) => e.id === id).name);
  const penalty = r.tie ? el('div', { class: 'respen big none' }, t('noPenalty')) : el('div', { class: 'respen big' }, el('small', {}, t('penalty')), '×' + r.penalty);
  // the same torn / safe tiles as the stage, inside the pop-up (you first), sized so they all fit on screen
  const k = r.entries[0].cards.length, n = r.entries.length;
  const availW = Math.min(window.innerWidth * 0.92, 580) - 36, availH = window.innerHeight * 0.94 - 190;
  let best = null;
  for (let c = 1; c <= Math.min(n, 6); c++) {
    const rows = Math.ceil(n / c), tw = (availW - (c - 1) * 8) / c;
    const cw = Math.floor(Math.min(70, (tw - 16 - k * 14 - (k - 1) * 6) / k, ((availH - (rows - 1) * 8) / rows - 62) / 1.45));
    if (!best || cw > best.cw) best = { c, cw };
  }
  const board = el('div', { class: 'tiles resboard', style: `--cw:${Math.max(best.cw, 14)}px; grid-template-columns: repeat(${best.c}, minmax(0, 1fr))` },
    ...[...r.entries].sort((a, b) => (b.id === meId) - (a.id === meId)).map((e) => {
      const lose = !r.tie && r.losers.includes(e.id), safe = !r.tie && !lose, mine = e.id === meId;
      return el('div', { class: 'tile' + (mine ? ' me' : '') + (lose ? ' lose' : '') + (safe ? ' safe' : '') },
        el('div', { class: 'tname' }, avatarEl(avOf(e.id), 18, lose ? 'sad' : safe ? 'happy' : '', accOf(e.id), bdOf(e.id)), el('span', { class: 'tn' }, e.name + (mine ? t('you') : ''))),
        el('div', { class: 'tcards' }, ...(() => { const tr = tiersOf(r.row, e.cards); return e.cards.map((c, ci) => lose ? tornCard(c, true, e.as ? e.as[ci] : null, 0, atkStyleOf(r)) : cardEl(c, { up: true, as: e.as ? e.as[ci] : null, morph: !!e.as, prime: tr[ci] })); })()),
        el('div', { class: 'tfoot' }, lose ? el('span', { class: 'tstat lost' }, icon('x', 12), t('lostTag')) : safe ? el('span', { class: 'tstat safe' }, icon('tick', 12), t('safeTag')) : ''));
    }));
  const cm = commentFor(r);
  const extra = [cm ? el('div', { class: 'resextra' }, '🎙️ ' + cm) : '', r.hits && r.hits.length ? el('div', { class: 'resextra hit' }, t('cmCalled', { names: r.hits.join(', '), wp: r.wp || st.predWp || 3 })) : '', r.misses && r.misses.length ? el('div', { class: 'resextra miss' }, t('cmMissed', { names: r.misses.join(', '), pen: st.predPen || 1 })) : ''];
  const box = iLose
    ? el('div', { class: 'resbox hasboard youlose' },
        el('div', { class: 'rf-k' }, t('rowN', { n: r.row + 1 })),
        el('div', { class: 'resnames youlose' }, t('youLose')),
        others.length ? el('div', { class: 'resk' }, t('alongWith', { names: others.join(' · ') })) : '',
        penalty, ...extra, board)
    : el('div', { class: 'resbox hasboard' },
        el('div', { class: 'rf-k' }, t('rowN', { n: r.row + 1 })),
        r.tie ? '' : el('div', { class: 'resk' }, t(names.length > 1 ? 'losers' : 'loser')),
        el('div', { class: 'resnames' }, r.tie ? t('tie') : names.join(' · ')),
        penalty, ...extra, board);
  const o = el('div', { class: 'resfx' + (iLose ? ' lose' : '') }, iLose ? el('div', { class: 'spikes' }) : '', box);
  document.body.append(o);
  if (!r.tie) {
    if (iLose) setTimeout(() => SND.play('youlose'), 250);
    else { setTimeout(() => SND.play('names'), 250); setTimeout(() => SND.play('safe'), 700); }
  }
  if (iLose) buzz([220, 90, 220, 90, 360]);
  setTimeout(() => { o.remove(); queueOwnCardReturn(); }, Math.max(900, 3700 - late));
   // the host's phone says when the next row's guessing may begin
}

function showNext(row) {
  document.querySelector('.nextfx')?.remove();
  const done = row >= 4;
  SND.play('whoosh'); if (done) setTimeout(() => SND.play('final'), 450);
  const o = el('div', { class: 'nextfx' }, el('i', { class: 'nx-streak' }), el('div', { class: 'nx-box' },
    el('div', { class: 'nx-k' }, done ? t('allDone') : t('nextUp')),
    el('div', { class: 'nx-n' }, done ? t('finalTitle') : t('rowN', { n: row + 1 })),
    done ? '' : el('div', { class: 'nx-r' }, t('rule' + (row + 1)))));
  document.body.append(o);
  setTimeout(() => o.remove(), 1900);
}


