// ---- the stage: one row at a time, big cards ----
function layoutFor(rowIdx, n) {
  const k = ROWS[rowIdx];
  if (isLandscape()) {   // short, wide screen: row info on the left, tiles fill the rest; pick the biggest cards that fit on screen
    const cap = [124, 124, 96, 80][rowIdx], gap = 10, pad = 16, cg = 6;
    const W = (document.getElementById('app').clientWidth || window.innerWidth) - 28 - 230 - 14;
    const appEl = document.getElementById('app');
    const top = appEl.getBoundingClientRect().bottom + window.scrollY;   // header and banner are already on the page
    const H = Math.max(170, window.innerHeight - top - 26), overhead = 84;
    let best = null;
    for (let c = 1; c <= Math.min(Math.max(n, 1), 8); c++) {
      const rows = Math.ceil(n / c);
      const cwW = ((W - (c - 1) * gap) / c - pad - (k - 1) * cg) / k;
      const cwH = ((H - (rows - 1) * gap) / rows - overhead) / 1.45;
      const cw = Math.floor(Math.min(cap, cwW, cwH));
      if (!best || cw > best.cw) best = { cols: c, cw };
    }
    return { cols: best.cols, cw: Math.max(34, best.cw) };
  }
  const W = (document.getElementById('app').clientWidth || window.innerWidth) - 30;   // panel padding
  const cap = [124, 124, 96, 80][rowIdx], minCw = [70, 70, 54, 40][rowIdx], gap = 10, pad = 16, cg = 6;
  const cwFor = (c) => Math.floor(Math.min(cap, ((W - (c - 1) * gap) / c - pad - (k - 1) * cg) / k));
  const rowsOf = (c) => Math.ceil(n / c), maxC = Math.max(1, Math.min(n, 6));
  let cols = null;
  for (let c = maxC; c >= 1; c--) if (cwFor(c) >= cap && rowsOf(c) <= 6) { cols = c; break; }   // full-size cards, as many across as fit
  if (cols === null) for (let c = 1; c <= maxC; c++) if (cwFor(c) >= minCw && rowsOf(c) <= 6) { cols = c; break; }
  if (cols === null) { cols = 1; for (let c = 1; c <= maxC; c++) if (cwFor(c) >= minCw) cols = c; }
  return { cols, cw: Math.max(30, cwFor(cols)) };
}

// a card split along a jagged line, halves drifting apart
// the row turns over like a quick drumroll: one player after another, about a tenth of a second apart (never more than 0.7 s in all)
const CASCADE_STEP = 90, CASCADE_MAX = 700;
const cascadeOf = (n) => Math.min(CASCADE_MAX, Math.max(0, n - 1) * CASCADE_STEP);
// what is left of a loser's card depends on what hit it: every attack leaves its own mark
const ATK_ENDS = { dragon: 'burnt', eagle: 'claws', thunder: 'zap', comet: 'crater', meteors: 'cracked', shark: 'bitten', ninja: 'sliced', blackhole: 'warp', fist: 'crushed', ice: 'frozen', cannon: 'hole', ufo: 'vapor' };
const atkStyleOf = (res) => ATK_STYLES[((st ? st.round : 0) * 5 + res.row * 3 + res.losers.length) % ATK_STYLES.length];   // the same pick on every phone
// the damage is painted once per kind (noise, charring, cracks, frost…) and laid over the card as a mask, a shading layer and a glowing layer
const ENDTEX = {};
const nzHash = (x, y, sd) => { let h = (x * 374761393 + y * 668265263 + sd * 1274126177) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const nzV = (x, y, sd) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return nzHash(xi, yi, sd) * (1 - u) * (1 - v) + nzHash(xi + 1, yi, sd) * u * (1 - v) + nzHash(xi, yi + 1, sd) * (1 - u) * v + nzHash(xi + 1, yi + 1, sd) * u * v; };
const nzF = (x, y, sd, o = 4) => { let a = 0.5, f = 1, t = 0; for (let i = 0; i < o; i++) { t += a * nzV(x * f, y * f, sd + i); f *= 2; a *= 0.5; } return t / 0.9375; };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function endTex(kind) {
  if (ENDTEX[kind]) return ENDTEX[kind];
  const big = kind === 'frozen', CW = big ? 300 : 200, CH = big ? 400 : 290, mk = () => { const c = document.createElement('canvas'); c.width = CW; c.height = CH; return c; };
  const extra = [], mask = mk(), ov = mk(), gl = mk(), rt = mk(), mg = mask.getContext('2d'), og = ov.getContext('2d'), gg = gl.getContext('2d'), rg = rt.getContext('2d');
  mg.fillStyle = '#000'; mg.fillRect(0, 0, CW, CH);
  const rnd = (() => { let sd = 7 + kind.length * 13; return () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; }; })();
  // per-pixel pass: fn(x, y, edgeDist) -> [maskAlpha 0-1, [r,g,b,a] shade, [r,g,b,a] glow]
  const pix = (fn) => {
    const mi = mg.getImageData(0, 0, CW, CH), oi = og.getImageData(0, 0, CW, CH), gi = gg.getImageData(0, 0, CW, CH);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const d = Math.min(x, CW - 1 - x, y, CH - 1 - y), r = fn(x, y, d), i = (y * CW + x) * 4;
      mi.data[i + 3] = Math.round(clamp01(r[0]) * 255);
      if (r[1]) { oi.data[i] = r[1][0]; oi.data[i + 1] = r[1][1]; oi.data[i + 2] = r[1][2]; oi.data[i + 3] = Math.round(clamp01(r[1][3]) * 255); }
      if (r[2]) { gi.data[i] = r[2][0]; gi.data[i + 1] = r[2][1]; gi.data[i + 2] = r[2][2]; gi.data[i + 3] = Math.round(clamp01(r[2][3]) * 255); }
    }
    mg.putImageData(mi, 0, 0); og.putImageData(oi, 0, 0); gg.putImageData(gi, 0, 0);
  };
  const burnAround = (cx, cy, R, wob, chr, sd, power = 1) => (x, y, d) => {   // a ragged burn: consumed inside, glowing rim, charred margin
    const rad = Math.hypot(x - cx, y - cy); if (rad > R * 1.9 + chr + 8) return [1, null, null];
    const ang = Math.atan2(y - cy, x - cx), n = nzF(Math.cos(ang) * 2.4 + 5, Math.sin(ang) * 2.4 + 5, sd) * 1.4 + nzF(x / 22, y / 22, sd + 9) * 0.9;
    const q = (R * (0.65 + 0.55 * n * wob) - rad) * power;   // > 0 inside the burn
    const consumed = q > 6, rim = Math.exp(-Math.pow((q - 3) / 3.2, 2)), char = clamp01((q + chr) / (chr + 4)), speck = nzF(x / 3, y / 3, sd + 20) > 0.66 ? 0.18 : 0;
    return [consumed ? 0 : 1, q > -chr ? [8 + 20 * (1 - char), 5 + 10 * (1 - char), 3, clamp01(char * 0.93 + speck * (q > -chr ? 1 : 0))] : null, rim > 0.04 ? [255, 120 + 110 * rim, 30 + 50 * rim, rim * 0.95] : null];
  };
  const crackTree = (g, cg, x, y, ang, len, w, depth) => {
    for (let i = 0; i < 6 && depth > 0; i++) {
      ang += (rnd() - 0.5) * 0.9; const step = len * (0.12 + rnd() * 0.1), nx = x + Math.cos(ang) * step, ny = y + Math.sin(ang) * step;
      if (g) { g.strokeStyle = 'rgba(8,4,2,.95)'; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke(); }
      if (cg) { cg.strokeStyle = 'rgba(255,130,40,.9)'; cg.lineWidth = Math.max(0.8, w * 0.5); cg.lineCap = 'round'; cg.beginPath(); cg.moveTo(x, y); cg.lineTo(nx, ny); cg.stroke(); cg.strokeStyle = 'rgba(255,230,150,.9)'; cg.lineWidth = Math.max(0.5, w * 0.2); cg.beginPath(); cg.moveTo(x, y); cg.lineTo(nx, ny); cg.stroke(); }
      if (rnd() < 0.42) crackTree(g, cg, nx, ny, ang + (rnd() < 0.5 ? 0.8 : -0.8), len * 0.6, w * 0.65, depth - 1);
      x = nx; y = ny; w *= 0.86; if (x < -10 || x > CW + 10 || y < -10 || y > CH + 10) break;
    }
  };
  if (kind === 'burnt') {
    pix((x, y, d) => {
      const n = nzF(x / 34, y / 34, 3) * 1.1 + nzF(x / 11, y / 11, 8) * 0.35, safe = 1 - 0.9 * Math.max(Math.exp(-(Math.pow(x - 34, 2) + Math.pow(y - 40, 2)) / 3600), Math.exp(-(Math.pow(x - 166, 2) + Math.pow(y - 250, 2)) / 3600)), reach = (4 + 34 * n + 62 * Math.pow(y / CH, 2.6) * (0.4 + n)) * safe, q = reach - d;   // the rank corners are kept clear so the number can still be read
      const consumed = q > 24, rim = Math.exp(-Math.pow((q - 21) / 3.4, 2)), char = clamp01((q + 22) / 26), speck = nzF(x / 2.5, y / 2.5, 40) > 0.7 ? 0.2 : 0;
      return [consumed ? 0 : 1, q > -22 ? [10 + 22 * (1 - char), 6 + 10 * (1 - char), 4, clamp01(char * 0.94 + speck)] : null, rim > 0.04 ? [255, 110 + 120 * rim, 24 + 60 * rim, rim] : null];
    });
  } else if (kind === 'crater') {
    const cx = 122, cy = 118;
    og.save(); og.translate(cx, cy); og.rotate(Math.atan2(-40 - cy, 230 - cx)); const tl = 260, tr = og.createLinearGradient(0, 0, tl, 0); tr.addColorStop(0, 'rgba(14,8,4,.75)'); tr.addColorStop(0.6, 'rgba(14,8,4,.25)'); tr.addColorStop(1, 'rgba(14,8,4,0)'); og.fillStyle = tr; og.beginPath(); og.moveTo(0, -40); og.quadraticCurveTo(tl * 0.5, -22, tl, -6); og.lineTo(tl, 6); og.quadraticCurveTo(tl * 0.5, 22, 0, 40); og.closePath(); og.filter = 'blur(6px)'; og.fill(); og.filter = 'none'; og.restore();
    gg.save(); gg.translate(cx, cy); gg.rotate(Math.atan2(-40 - cy, 230 - cx)); const gt = gg.createLinearGradient(0, 0, 170, 0); gt.addColorStop(0, 'rgba(255,150,50,.55)'); gt.addColorStop(1, 'rgba(255,150,50,0)'); gg.fillStyle = gt; gg.filter = 'blur(5px)'; gg.fillRect(0, -9, 170, 18); gg.filter = 'none'; gg.restore();
    pix(burnAround(cx, cy, 40, 0.5, 26, 11));
    for (let i = 0; i < 7; i++) { const a = rnd() * 6.283; crackTree(og, gg, cx + Math.cos(a) * 46, cy + Math.sin(a) * 46, a, 70, 2.2, 2); }
  } else if (kind === 'hole') {
    pix(burnAround(104, 150, 66, 1, 36, 17));
    og.save(); og.globalCompositeOperation = 'source-over'; for (let i = 0; i < 14; i++) { const a = rnd() * 6.283, r0 = 70 + rnd() * 14, r1 = r0 + 20 + rnd() * 36; og.strokeStyle = 'rgba(15,8,4,.55)'; og.lineWidth = 1.2 + rnd() * 1.6; og.beginPath(); og.moveTo(104 + Math.cos(a) * r0, 150 + Math.sin(a) * r0); og.lineTo(104 + Math.cos(a + (rnd() - 0.5) * 0.3) * r1, 150 + Math.sin(a + (rnd() - 0.5) * 0.3) * r1); og.stroke(); } og.restore();
  } else if (kind === 'vapor') {
    pix((x, y) => {
      const cx = Math.floor(x / 3), cy = Math.floor(y / 3), r = Math.hypot(x - 100, y - 148), ang = Math.atan2(y - 148, x - 100), edgeN = nzF(Math.cos(ang) * 2.2 + 6, Math.sin(ang) * 2.2 + 6, 5), R = 50 + 30 * edgeN, f = R - r, jit = (nzHash(cx, cy, 8) - 0.5) * 22;
      const gone = f + jit > 12, band = Math.exp(-Math.pow((f + jit - 8) / 6, 2)), halo = clamp01(1 - r / 120), hex = (Math.abs(((x * 0.866 + y * 0.5) % 20) - 10) < 0.6 || Math.abs(((x * 0.866 - y * 0.5) % 20) - 10) < 0.6 || Math.abs((y % 20) - 10) < 0.6) && r < 110 ? 0.28 : 0;
      return [gone ? 0 : f + jit > 2 ? (nzHash(cx, cy, 3) > 0.5 ? 1 : 0.3) : 1, [10, 40 + 30 * halo, 30 + 20 * halo, clamp01(halo * halo * 0.5 + (f + jit > -10 ? 0.35 : 0) + hex * 0.5)], band > 0.05 ? [150 + 105 * band, 255, 200 + 55 * band, band * 0.95] : null];
    });
    for (let i = 0; i < 46; i++) { const x = 100 + (rnd() - 0.5) * 120, y = 148 - rnd() * 190, l = 5 + rnd() * 16; const gr = gg.createLinearGradient(x, y, x, y + l); gr.addColorStop(0, 'rgba(190,255,225,0)'); gr.addColorStop(1, 'rgba(190,255,225,' + (0.4 + rnd() * 0.5) + ')'); gg.strokeStyle = gr; gg.lineWidth = 1 + rnd() * 1.6; gg.beginPath(); gg.moveTo(x, y); gg.lineTo(x, y + l); gg.stroke(); }
  } else if (kind === 'cracked') {
    pix((x, y) => {
      const dx = x - 100, dy = y - 150, r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx), n = nzF(Math.cos(ang) * 2 + 4, Math.sin(ang) * 2 + 4, 21), rad = 24 + 12 * n, q = rad - r;
      const halo = clamp01(1 - r / 96), rim = Math.exp(-Math.pow((q - 1) / 3, 2)), ring = Math.abs(((r - 36) % 22) - 11) < 1.1 && r > 36 && r < 92 ? 0.16 : 0, pit = nzF(x / 4, y / 4, 31) > 0.76 && r < 110 ? 0.45 : 0;
      return [q > 5 ? 0 : 1, [40 + 60 * halo, 14 + 20 * halo, 6, clamp01(halo * halo * 0.62 + ring + pit * 0.6 + (q > -16 ? 0.5 * clamp01((q + 16) / 16) : 0))], rim > 0.04 ? [255, 120 + 120 * rim, 30 + 60 * rim, rim] : null];
    });
    for (let k = 0; k < 8; k++) { const a0 = k / 8 * 6.283 + rnd() * 0.4; crackTree(og, gg, 100 + Math.cos(a0) * 30, 150 + Math.sin(a0) * 30, a0, 150, 4.4, 3); }
  } else if (kind === 'claws') {
    const gashes = [[[52, 46], [72, 146], [86, 252]], [[98, 30], [116, 142], [130, 262]], [[144, 52], [156, 132], [164, 214]]];
    for (const [a0, a1, a2] of gashes) {
      const pts = []; for (let i = 0; i <= 28; i++) { const t = i / 28, u = 1 - t, x = u * u * a0[0] + 2 * u * t * a1[0] + t * t * a2[0], y = u * u * a0[1] + 2 * u * t * a1[1] + t * t * a2[1]; pts.push({ x, y, w: 0.8 + 3.4 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.96 + 0.02)), 0.7) }); }
      pts.forEach((q, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; q.nx = -dy / l; q.ny = dx / l; });
      const edge = (side, k) => pts.map((q) => [q.x + q.nx * side * (q.w * k), q.y + q.ny * side * (q.w * k)]);
      const poly = (g, L, R) => { g.beginPath(); L.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]); g.closePath(); };
      og.fillStyle = 'rgba(25,5,8,.3)'; poly(og, edge(1, 1.9), edge(-1, 1.9)); og.fill();   // the shadow the tear throws
      og.fillStyle = 'rgba(28,6,10,.6)'; poly(og, edge(1, 1.2), edge(-1, 1.2)); og.fill();
      mg.globalCompositeOperation = 'destination-out'; poly(mg, edge(1, 1), edge(-1, 1)); mg.fill(); mg.globalCompositeOperation = 'source-over';
      const lip = og.createLinearGradient(0, 0, CW, 0); lip.addColorStop(0, 'rgba(255,253,248,.95)'); lip.addColorStop(1, 'rgba(235,226,214,.95)');   // a curled lip of paper on one side
      og.fillStyle = lip; poly(og, edge(1, 1.05), pts.map((q) => [q.x + q.nx * (q.w * 1.05 + 2.6 + q.w * 0.3), q.y + q.ny * (q.w * 1.05 + 2.6 + q.w * 0.3)])); og.fill();
      og.strokeStyle = 'rgba(70,40,30,.5)'; og.lineWidth = 0.9; og.beginPath(); edge(1, 1.05).forEach((q, i) => (i ? og.lineTo(q[0], q[1]) : og.moveTo(q[0], q[1]))); og.stroke();
      og.fillStyle = 'rgba(30,8,10,.32)'; poly(og, edge(-1, 1), pts.map((q) => [q.x - q.nx * (q.w + 3), q.y - q.ny * (q.w + 3)])); og.fill();
      for (let i = 0; i < 46; i++) { const q = pts[Math.floor(rnd() * pts.length)], sd = rnd() < 0.5 ? -1 : 1, l = 2 + rnd() * 6; og.strokeStyle = 'rgba(255,250,242,.85)'; og.lineWidth = 0.8; og.beginPath(); og.moveTo(q.x + q.nx * sd * q.w, q.y + q.ny * sd * q.w); og.lineTo(q.x + q.nx * sd * (q.w + l) + (rnd() - 0.5) * 3, q.y + q.ny * sd * (q.w + l) + (rnd() - 0.5) * 5); og.stroke(); }
      for (let k = 0; k < 5; k++) { const off = (rnd() < 0.5 ? -1 : 1) * (14 + rnd() * 18), i0 = Math.floor(rnd() * 14), i1 = i0 + 4 + Math.floor(rnd() * 8); og.strokeStyle = 'rgba(255,255,255,.38)'; og.lineWidth = 1; og.beginPath(); for (let i = i0; i <= Math.min(i1, pts.length - 1); i++) { const q = pts[i]; og.lineTo(q.x + q.nx * off, q.y + q.ny * off); } og.stroke(); }
    }
    const feather = (x, y, ang, len) => {
      og.save(); og.translate(x, y); og.rotate(ang); og.shadowColor = 'rgba(0,0,0,.35)'; og.shadowBlur = 4; og.shadowOffsetY = 2;
      const gr = og.createLinearGradient(0, 0, len, 0); gr.addColorStop(0, '#fbf7ee'); gr.addColorStop(0.55, '#d9c7a6'); gr.addColorStop(1, '#6b4a2a'); og.fillStyle = gr;
      og.beginPath(); og.moveTo(0, 0); og.bezierCurveTo(len * 0.25, -len * 0.2, len * 0.75, -len * 0.2, len, 0); og.bezierCurveTo(len * 0.75, len * 0.2, len * 0.25, len * 0.2, 0, 0); og.fill(); og.shadowBlur = 0; og.shadowOffsetY = 0;
      og.strokeStyle = 'rgba(70,45,25,.6)'; og.lineWidth = 0.8; for (let i = 1; i < 14; i++) { const t = i / 14, bx = len * t, hy = len * 0.18 * Math.sin(Math.PI * t); og.beginPath(); og.moveTo(bx, 0); og.lineTo(bx + len * 0.08, -hy); og.moveTo(bx, 0); og.lineTo(bx + len * 0.08, hy); og.stroke(); }
      og.strokeStyle = '#8a6a44'; og.lineWidth = 1.6; og.beginPath(); og.moveTo(-len * 0.12, 0); og.lineTo(len, 0); og.stroke(); og.restore();
    };
    feather(150, 236, -0.55, 74); feather(40, 66, 2.45, 60);
  } else if (kind === 'zap') {
    // what a strike really leaves on paper: a hole blown through with charred, ragged edges, a smoky soot bloom with
    // flecks of carbon, and a few soft scorched channels where the current crawled across the surface
    const ex = 110, ey = 134;
    const chan = [];
    const crawl = (x, y, ang, len, w, depth) => {
      const n = Math.max(3, Math.round(len / 6));
      for (let i = 0; i < n; i++) { ang += (rnd() - 0.5) * 0.8; const nx = x + Math.cos(ang) * len / n, ny = y + Math.sin(ang) * len / n; chan.push([x, y, nx, ny, w]); x = nx; y = ny; w *= 0.9; if (depth > 0 && rnd() < 0.28) crawl(x, y, ang + (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.5), len * 0.4, w * 0.75, depth - 1); }
    };
    for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283 + rnd() * 0.9; crawl(ex + Math.cos(a) * 20, ey + Math.sin(a) * 20, a, 50 + rnd() * 45, 4.2, 2); }
    // the channels into their own soft layer first, so the soot can sit over them
    const ch = document.createElement('canvas'); ch.width = CW; ch.height = CH; const cg2 = ch.getContext('2d'); cg2.lineCap = 'round'; cg2.lineJoin = 'round';
    for (const [x0, y0, x1, y1, w] of chan) { cg2.strokeStyle = 'rgba(70,40,18,.35)'; cg2.lineWidth = w * 3.2; cg2.beginPath(); cg2.moveTo(x0, y0); cg2.lineTo(x1, y1); cg2.stroke(); }
    for (const [x0, y0, x1, y1, w] of chan) { cg2.strokeStyle = 'rgba(22,12,6,.8)'; cg2.lineWidth = Math.max(0.6, w * 0.9); cg2.beginPath(); cg2.moveTo(x0, y0); cg2.lineTo(x1, y1); cg2.stroke(); }
    // the hole and its soot, from noise so the char is uneven and grainy
    const hole = burnAround(ex, ey, 22, 1.2, 30, 31);
    pix((x, y, d) => {
      const r = hole(x, y, d), dist = Math.hypot(x - ex, y - ey), n = nzF(x / 9, y / 9, 61), grain = nzF(x / 2.2, y / 2.2, 63);
      const soot = clamp01(1 - dist / (62 + 34 * n)) ** 1.6 * 0.85, fleck = grain > 0.72 && dist < 90 ? (grain - 0.72) * 2.2 : 0;
      const sh = r[1] || [24, 16, 10, clamp01(soot + fleck)];
      return [r[0], [sh[0], sh[1], sh[2], clamp01(Math.max(sh[3], soot + fleck))], r[2] ? [255, 110 + r[2][1] * 0.2, 40, r[2][3] * 0.45] : null];   // the rim only smoulders
    });
    og.save(); og.filter = 'blur(.7px)'; og.drawImage(ch, 0, 0); og.restore();
    // keep both rank corners clean
    for (const g2 of [og, gg]) { g2.save(); g2.globalCompositeOperation = 'destination-out'; for (const [cx, cy] of [[22, 34], [CW - 22, CH - 34]]) { const cg = g2.createRadialGradient(cx, cy, 18, cx, cy, 50); cg.addColorStop(0, 'rgba(0,0,0,1)'); cg.addColorStop(1, 'rgba(0,0,0,0)'); g2.fillStyle = cg; g2.fillRect(0, 0, CW, CH); } g2.restore(); }
  } else if (kind === 'bitten') {
    const cx = 236, cy = 128, rx = 86, ry = 70, N = 30;   // the jaw: an ellipse whose centre sits off the right edge
    const edge = (a, grow = 0) => { const t = (a / 6.2832) * N + 0.35 * Math.sin(a * 7), fr = t - Math.floor(t), k = Math.floor(t), amp = 3 + 11 * nzHash(k, 3, 41), sk = 0.3 + 0.4 * nzHash(k, 5, 43); const saw = (fr < sk ? fr / sk : (1 - fr) / (1 - sk)) * amp, wob = 7 * nzF(Math.cos(a) * 1.6 + 3, Math.sin(a) * 1.6 + 3, 47) - 3.5; return [cx + Math.cos(a) * (rx + saw + wob + grow), cy + Math.sin(a) * (ry + (saw + wob) * 0.8 + grow)]; };
    const outline = (g, grow) => { g.beginPath(); for (let i = 0; i <= 360; i++) { const [x, y] = edge(i / 360 * 6.2832, grow); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
    // wet, darker paper soaking out from the bite
    og.save(); outline(og, 26); og.clip(); const wet = og.createRadialGradient(cx, cy, rx * 0.8, cx, cy, rx + 30); wet.addColorStop(0, 'rgba(30,70,120,.4)'); wet.addColorStop(1, 'rgba(30,70,120,0)'); og.fillStyle = wet; og.fillRect(0, 0, CW, CH); og.restore();
    // the shadow of the torn lip, then the cut itself
    og.save(); og.filter = 'blur(3px)'; og.strokeStyle = 'rgba(10,20,35,.55)'; og.lineWidth = 7; outline(og, 3); og.stroke(); og.restore();
    mg.globalCompositeOperation = 'destination-out'; outline(mg, 0); mg.fill(); mg.globalCompositeOperation = 'source-over';
    og.strokeStyle = 'rgba(255,255,255,.9)'; og.lineWidth = 1.6; outline(og, 1.4); og.stroke();   // the bright torn paper edge
    for (let i = 0; i < 70; i++) { const a = 1.6 + rnd() * 3.1, [x, y] = edge(a, 1), l = 2 + rnd() * 5; og.strokeStyle = 'rgba(255,255,255,.7)'; og.lineWidth = 0.7; og.beginPath(); og.moveTo(x, y); og.lineTo(x - Math.cos(a) * l + (rnd() - 0.5) * 2, y - Math.sin(a) * l + (rnd() - 0.5) * 2); og.stroke(); }
    // the other row of teeth: triangular punctures just outside the bite
    for (let i = 0; i < 9; i++) {
      const a = 1.95 + i * 0.27 + (rnd() - 0.5) * 0.08, [x, y] = edge(a, 16 + rnd() * 6), sz = 2.6 + rnd() * 2.2, ang = a + Math.PI;
      if (x < 4 || y < 4 || y > CH - 60) continue;
      const tri = (g, k) => { g.beginPath(); g.moveTo(x + Math.cos(ang) * sz * 1.4 * k, y + Math.sin(ang) * sz * 1.4 * k); g.lineTo(x + Math.cos(ang + 2.3) * sz * k, y + Math.sin(ang + 2.3) * sz * k); g.lineTo(x + Math.cos(ang - 2.3) * sz * k, y + Math.sin(ang - 2.3) * sz * k); g.closePath(); };
      og.save(); og.filter = 'blur(1.5px)'; og.fillStyle = 'rgba(15,25,40,.4)'; tri(og, 1.8); og.fill(); og.restore();
      mg.globalCompositeOperation = 'destination-out'; tri(mg, 1); mg.fill(); mg.globalCompositeOperation = 'source-over';
    }
    // a few small tears running from the bite into the card
    for (const a of [2.3, 3.0, 3.75]) { const [x, y] = edge(a, 0); crackTree(og, null, x, y, a + Math.PI + (rnd() - 0.5) * 0.4, 46, 1.3, 1); }
    // water: beads clustered round the bite and two drips running down
    for (let i = 0; i < 16; i++) { const a = 1.7 + rnd() * 2.9, [x, y] = edge(a, 10 + rnd() * 34), r = 2 + rnd() * 4.5; if (x < 4 || y > CH - 8) continue; const dg = og.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x, y, r); dg.addColorStop(0, 'rgba(255,255,255,.95)'); dg.addColorStop(0.35, 'rgba(200,230,255,.4)'); dg.addColorStop(1, 'rgba(25,70,140,.5)'); og.fillStyle = dg; og.beginPath(); og.ellipse(x, y, r * 0.85, r, 0, 0, 6.283); og.fill(); }
    for (const a of [2.15, 2.6]) { const [x, y] = edge(a, 2); const len = 40 + rnd() * 30, gr = og.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, 'rgba(40,90,160,.45)'); gr.addColorStop(1, 'rgba(40,90,160,0)'); og.fillStyle = gr; og.beginPath(); og.moveTo(x - 2.5, y); og.quadraticCurveTo(x - 1, y + len * 0.6, x, y + len); og.quadraticCurveTo(x + 1, y + len * 0.6, x + 2.5, y); og.fill(); og.fillStyle = 'rgba(220,240,255,.85)'; og.beginPath(); og.arc(x, y + len - 2, 2.6, 0, 6.283); og.fill(); }
  } else if (kind === 'frozen') {
    // the card sealed in a block of clear ice: thicker (bluer) toward the edges, a bevelled glassy rim, milky patches, frost
    // feathering in from the sides, fractures from a knock, trapped air bubbles and icicles hanging off the bottom
    const X0 = 50, Y0 = 55, X1 = 250, Y1 = 345, CX = (X0 + X1) / 2, CY = (Y0 + Y1) / 2;
    const blockSd = (x, y) => {   // signed distance to the chunky block (negative inside)
      const pad = 9 + 7 * nzF(x / 26, y / 26, 41, 2), hx = (X1 - X0) / 2 + pad, hy = (Y1 - Y0) / 2 + pad, R = 18;
      const qx = Math.abs(x - CX) - hx + R, qy = Math.abs(y - CY) - hy + R;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R;
    };
    pix((x, y) => {
      const sd = blockSd(x, y); if (sd > 0) return [1, null, null];
      const dd = -sd, edge = clamp01(1 - dd / 46), n = nzF(x / 10, y / 10, 6), fine = nzF(x / 2.6, y / 2.6, 13, 3);
      // the ice body: cool and fairly clear in the middle, deeper blue where it is thick at the sides
      const depth = clamp01((y - Y0) / (Y1 - Y0)) * 0.25;   // a little deeper toward the bottom, for volume
      let r = 178 - 95 * edge - 40 * depth, g = 222 - 55 * edge - 20 * depth, b = 250 - 10 * edge, a = 0.07 + 0.46 * edge * edge + 0.06 * depth;
      const milk = clamp01((nzF(x / 34, y / 34, 23) - 0.56) * 3.2) * 0.12;   // cloudy patches frozen in
      // hoarfrost: feathery white creeping in from the edges, heaviest in the corners
      const corner = clamp01(1 - Math.min(Math.hypot(x - X0, y - Y0), Math.hypot(x - X1, y - Y0), Math.hypot(x - X0, y - Y1), Math.hypot(x - X1, y - Y1)) / 90);
      const frost = clamp01(1 - dd / (4 + 26 * n * n + 58 * corner * corner)) * clamp01(fine * 1.5 - 0.2) * (0.55 + 0.45 * corner);   // patchy along the sides, thick in the corners
      // the bevelled rim: light catches the top-left edge, the bottom-right sits in shade
      const rim = clamp01(1 - dd / 5), lit = clamp01(((CX - x) / 100 + (CY - y) / 145) * 0.8 + 0.4);
      const gloss = Math.exp(-Math.pow(((x - y * 0.55) - 30) / 22, 2)) * 0.2 + Math.exp(-Math.pow(((x - y * 0.55) - 72) / 7, 2)) * 0.14;   // a broad and a sharp streak of reflected light
      const w = clamp01(milk + frost * 0.85 + gloss + rim * lit * 0.9);
      r = r + (255 - r) * w; g = g + (255 - g) * w; b = b + (255 - b) * w;
      a = clamp01(a + milk + frost * 0.7 + gloss + rim * (0.35 + 0.5 * lit));
      if (rim > 0 && lit < 0.35) { r *= 0.7; g *= 0.8; a = Math.max(a, 0.55 * rim); }   // the shaded side of the rim
      return [1, [r, g, b, a], null];
    });
    // fractures from a knock near the top-right corner: a dark seam, a bright edge beside it, and a faint plane of broken ice
    const kx = X1 - 34, ky = Y0 + 48;
    const crack = (x, y, ang, len, dep) => {
      const pts = [[x, y]]; let cx = x, cy = y, a = ang;
      for (let i = 0; i < 6; i++) { a += (rnd() - 0.5) * 0.5; cx += Math.cos(a) * len / 6; cy += Math.sin(a) * len / 6; pts.push([cx, cy]); }
      const line = (col, w, ox = 0, oy = 0) => { og.strokeStyle = col; og.lineWidth = w; og.lineJoin = 'round'; og.lineCap = 'round'; og.beginPath(); pts.forEach((q, i) => (i ? og.lineTo(q[0] + ox, q[1] + oy) : og.moveTo(q[0] + ox, q[1] + oy))); og.stroke(); };
      og.fillStyle = 'rgba(255,255,255,.06)'; og.beginPath(); og.moveTo(x, y); pts.forEach((q) => og.lineTo(q[0], q[1])); og.lineTo(pts[pts.length - 1][0] + Math.cos(ang + 1.3) * len * 0.22, pts[pts.length - 1][1] + Math.sin(ang + 1.3) * len * 0.22); og.closePath(); og.fill();
      line('rgba(40,95,150,.32)', 2.4, 1, 1.2); line('rgba(255,255,255,.35)', 3.2); line('rgba(255,255,255,.92)', 1);
      if (dep > 0) for (let i = 2; i < 6; i += 2) if (rnd() < 0.75) crack(pts[i][0], pts[i][1], a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.5), len * 0.45, dep - 1);
    };
    for (let i = 0; i < 6; i++) crack(kx, ky, Math.PI * 0.55 + i * 0.32 + (rnd() - 0.5) * 0.2, 70 + rnd() * 90, 1);
    { const cg = og.createRadialGradient(kx, ky, 0, kx, ky, 11); cg.addColorStop(0, 'rgba(255,255,255,.85)'); cg.addColorStop(1, 'rgba(255,255,255,0)'); og.fillStyle = cg; og.beginPath(); og.arc(kx, ky, 11, 0, 6.283); og.fill(); }   // the small white chip where it was struck
    // air bubbles trapped in streams as the water froze
    for (let s = 0; s < 5; s++) {
      let bx = X0 + 20 + rnd() * 160, by = Y1 - 10 - rnd() * 60;
      const n = 5 + Math.floor(rnd() * 7);
      for (let i = 0; i < n; i++) {
        const rr = 0.8 + rnd() * (i < 2 ? 3.6 : 2.2); bx += (rnd() - 0.5) * 8; by -= 6 + rnd() * 14;
        if (blockSd(bx, by) > -6) continue;
        og.fillStyle = 'rgba(255,255,255,.1)'; og.beginPath(); og.arc(bx, by, rr, 0, 6.283); og.fill();
        og.strokeStyle = 'rgba(255,255,255,.6)'; og.lineWidth = 0.8; og.stroke();
        og.fillStyle = 'rgba(255,255,255,.95)'; og.beginPath(); og.arc(bx - rr * 0.35, by - rr * 0.35, Math.max(0.5, rr * 0.28), 0, 6.283); og.fill();
      }
    }
    // icicles hanging off the bottom of the block, each with a drop at the tip
    const yb = (x) => { let y = Y1; while (y < CH - 2 && blockSd(x, y) < 0) y++; return y - 2; };
    for (let i = 0; i < 9; i++) {
      const x = X0 + 6 + (i + 0.5) / 9 * (X1 - X0 - 12) + (rnd() - 0.5) * 10, top = yb(x), len = 12 + rnd() * (i % 3 === 1 ? 34 : 20), w = 5 + rnd() * 5;
      const gr = og.createLinearGradient(x - w, 0, x + w, 0); gr.addColorStop(0, 'rgba(120,180,230,.55)'); gr.addColorStop(0.35, 'rgba(240,250,255,.9)'); gr.addColorStop(0.6, 'rgba(170,215,248,.7)'); gr.addColorStop(1, 'rgba(110,165,220,.6)');
      og.fillStyle = gr; og.beginPath(); og.moveTo(x - w, top - 3); og.quadraticCurveTo(x - w * 0.5, top + len * 0.5, x + (rnd() - 0.5) * 2, top + len); og.quadraticCurveTo(x + w * 0.45, top + len * 0.45, x + w, top - 3); og.closePath(); og.fill();
      og.strokeStyle = 'rgba(255,255,255,.75)'; og.lineWidth = 1; og.beginPath(); og.moveTo(x - w * 0.35, top); og.quadraticCurveTo(x - w * 0.2, top + len * 0.45, x, top + len * 0.85); og.stroke();
      if (rnd() < 0.6) { og.fillStyle = 'rgba(220,240,255,.85)'; og.beginPath(); og.ellipse(x, top + len + 3, 1.8, 2.5, 0, 0, 6.283); og.fill(); }
    }
    // a few cold glints on the surface
    for (let i = 0; i < 6; i++) { const x = X0 + rnd() * (X1 - X0), y = Y0 + rnd() * (Y1 - Y0), r = 3 + rnd() * 6; gg.strokeStyle = 'rgba(255,255,255,.95)'; gg.lineWidth = 1.2; gg.beginPath(); gg.moveTo(x - r, y); gg.lineTo(x + r, y); gg.moveTo(x, y - r); gg.lineTo(x, y + r); gg.stroke(); const sg = gg.createRadialGradient(x, y, 0, x, y, r * 1.6); sg.addColorStop(0, 'rgba(255,255,255,.55)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); gg.fillStyle = sg; gg.beginPath(); gg.arc(x, y, r * 1.6, 0, 6.283); gg.fill(); }
  } else if (kind === 'crushed') {
    const rectSd = (x, y) => { const qx = Math.abs(x - 100) - 72, qy = Math.abs(y - 150) - 40; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 9; };   // < 0 inside the imprint of the hammer head
    const hgt = (x, y) => {
      const sd = rectSd(x, y), dent = -1.7 * clamp01(-sd / 8) + 0.4 * Math.exp(-Math.pow((sd - 1) / 5, 2)), rivets = [[-56, -26], [56, -26], [-56, 26], [56, 26]].reduce((a, [rx, ry]) => a - 0.55 * Math.exp(-(Math.pow(x - 100 - rx, 2) + Math.pow(y - 150 - ry, 2)) / 14), 0);
      const ridged = 1 - Math.abs(2 * nzF(x / 46, y / 46, 4) - 1), crease = 0.6 * Math.pow(ridged, 6) * clamp01(Math.abs(sd) / 30);
      return dent + rivets + crease * 0.5;
    };
    pix((x, y, d) => {
      const l = (hgt(x + 1.6, y + 1.6) - hgt(x - 1.6, y - 1.6)) * 2.4, sd = rectSd(x, y), n = nzF(x / 7, y / 7, 3), tear = 1.5 + 6 * n, a = clamp01((d - tear) / 1.6), fib = d - tear > 0 && d - tear < 2.4;
      const shade = fib ? [252, 247, 236, 0.92] : l > 0 ? [255, 250, 240, clamp01(l * 0.85)] : [24, 16, 10, clamp01(-l * 0.9 + (sd < 0 ? 0.22 : 0))];
      return [a, shade, null];
    });
    for (const [x0, y0] of [[28, 110], [172, 110], [28, 190], [172, 190]]) { const dir = Math.atan2(y0 - 150, x0 - 100); crackTree(og, null, x0, y0, dir + (rnd() - 0.5) * 0.4, 90, 1.7, 2); }
  } else if (kind === 'smashed') {
    // a paper card that took a hammer blow: a shallow dent the shape of the hammer's face with soft walls and a raised lip,
    // creases running from it to the edges, fine wrinkles, steel scuffs in the dent and a tear where the paper split
    const IX = 100, IY = 138, HX = 60, HY = 36, R = 9;
    const rectSd = (x, y) => { const qx = Math.abs(x - IX) - HX + R, qy = Math.abs(y - IY) - HY + R; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R; };
    const smooth = (e0, e1, v) => { const t = clamp01((v - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
    const creases = [];   // from the corners and sides of the dent out to the card's edge: alternately a fold up (ridge) and a fold down (valley)
    for (const [sx, sy, ex, ey] of [[IX - HX, IY - HY, 4, 30], [IX + HX, IY - HY, 196, 22], [IX - HX, IY + HY, 6, 262], [IX + HX, IY + HY, 194, 270], [IX - 18, IY - HY, 70, 4], [IX + HX, IY + 6, 198, 150], [IX - HX, IY - 4, 2, 128], [IX + 22, IY + HY, 140, 288]]) {
      const mx = (sx + ex) / 2 + (rnd() - 0.5) * 26, my = (sy + ey) / 2 + (rnd() - 0.5) * 26; creases.push({ pts: [[sx, sy], [mx, my], [ex, ey]], s: creases.length % 2 ? 1 : -1, w: 0.8 + rnd() * 0.7 });
    }
    const segD = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = clamp01(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)); return [Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t), t]; };
    const hgt = (x, y) => {
      const sd = rectSd(x, y);
      let h = -2.2 * (1 - smooth(-10, 0, sd)) + 0.5 * Math.exp(-Math.pow((sd - 3) / 4.5, 2));   // the dent and the lip pushed up round it
      if (sd < 0) h -= 0.1 * nzF(x / 5, y / 5, 9, 2);   // the floor is compressed, faintly grainy
      for (const c of creases) { const [d1, t1] = segD(x, y, c.pts[0], c.pts[1]), [d2, t2] = segD(x, y, c.pts[1], c.pts[2]), dd = Math.min(d1, d2), along = d1 < d2 ? t1 * 0.5 : 0.5 + t2 * 0.5; if (dd < 6) h += c.s * c.w * Math.exp(-dd * dd / 3.2) * (1 - along * 0.75) * smooth(-2, 6, sd); }
      const rid = 1 - Math.abs(2 * nzF(x / 52, y / 52, 4) - 1); h += 0.13 * rid * rid * rid;   // a few soft wrinkles
      return h;
    };
    const tear = [[124, 290]]; { let tx = 124, ty = 290; while (ty > IY + HY + 2) { ty -= 7 + rnd() * 6; tx += (rnd() - 0.5) * 9; tear.push([tx, Math.max(ty, IY + HY + 2)]); } }
    const tearD = (x, y) => { let best = 1e9, at = 0; for (let i = 0; i < tear.length - 1; i++) { const [d, t] = segD(x, y, tear[i], tear[i + 1]); if (d < best) { best = d; at = (i + t) / (tear.length - 1); } } return [best, at]; };
    pix((x, y) => {
      const l = (hgt(x + 1.5, y + 1.5) - hgt(x - 1.5, y - 1.5)) * 1.15, sd = rectSd(x, y);   // lit from the top left: a slope rising toward the bottom right faces the light
      const [td, tat] = tearD(x, y), gap = 2.6 * (1 - tat) + 0.4;   // the split is widest at the edge and closes up toward the dent
      if (td < gap) return [0, null, null];
      if (td < gap + 1.4) return [1, [250, 246, 236, 0.95], null];   // torn fibres along the split
      const ao = sd < 0 ? 0.16 * (1 - smooth(-12, 0, -sd)) : 0;   // darker in the dent's corners and walls
      const scuff = sd < 0 ? clamp01((nzF(x / 9, y / 3, 17) - 0.55) * 2.2) * 0.22 : 0;   // steel scuffs, dragged sideways
      const shade = l > 0 ? [255, 251, 242, Math.min(0.7, l * 0.75)] : [26, 18, 12, Math.min(0.5, -l * 0.7 + ao + scuff)];   // a shallow dent in card: soft shadows, never a black bar
      if (l > 0 && (ao || scuff)) return [1, [70, 66, 64, clamp01(ao + scuff)], null];
      const tearSh = td < gap + 6 && x > tear[0][0] - 2 ? 0.25 * (1 - (td - gap) / 6) : 0;   // one side of the split curls up a little and throws a shadow
      if (tearSh > 0) return [1, [26, 18, 12, clamp01(shade[3] + tearSh)], null];
      return [1, shade, null];
    });
  } else if (kind === 'punched') {
    const rectSd = (x, y) => { const qx = Math.abs(x - 100) - 64, qy = Math.abs(y - 150) - 30; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0); };   // the hammer-head sized hole
    pix((x, y, d) => {
      const jag = (nzF(x / 5, y / 5, 7) - 0.5) * 7, sd = rectSd(x, y) + jag, topSide = y < 150, flap = sd > 0 && sd < 15 ? 1 - sd / 15 : 0, inner = Math.abs(x - 100) < 64 && Math.abs(y - 150) < 30;
      const lit = topSide ? 0.55 : -0.5, shade = flap > 0 ? (lit > 0 ? [255, 250, 240, flap * 0.7] : [20, 14, 10, flap * 0.75]) : (sd < 0 ? null : [20, 14, 10, clamp01(0.25 * (1 - sd / 50))]);
      return [sd < 0 ? 0 : 1, shade, null];
    });
    for (let i = 0; i < 40; i++) { const side = Math.floor(rnd() * 4), t = rnd(), x = side < 2 ? 36 + t * 128 : (side === 2 ? 36 : 164), y = side < 2 ? (side === 0 ? 120 : 180) : 120 + t * 60; og.strokeStyle = 'rgba(255,250,240,.9)'; og.lineWidth = 0.9; og.beginPath(); og.moveTo(x, y); og.lineTo(x + (rnd() - 0.5) * 9, y + (side === 0 ? -1 : side === 1 ? 1 : 0) * rnd() * 7); og.stroke(); }
    for (let k = 0; k < 6; k++) { const cx = k % 2 ? 164 : 36, cy = k < 3 ? 120 : 180; crackTree(og, null, cx, cy, Math.atan2(cy - 150, cx - 100) + (rnd() - 0.5) * 0.5, 80, 1.6, 2); }
  } else if (kind === 'crumple') {
    const cols = 6, rows = 8, pts = []; for (let j = 0; j <= rows; j++) { pts.push([]); for (let i = 0; i <= cols; i++) pts[j].push([i / cols * CW + (i > 0 && i < cols ? (rnd() - 0.5) * 30 : 0), j / rows * CH + (j > 0 && j < rows ? (rnd() - 0.5) * 30 : 0)]); }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) for (const tri of [[pts[j][i], pts[j][i + 1], pts[j + 1][i]], [pts[j][i + 1], pts[j + 1][i + 1], pts[j + 1][i]]]) {
      const l = (rnd() - 0.5) * 1.25; og.fillStyle = l > 0 ? `rgba(255,252,245,${l * 0.7})` : `rgba(20,14,10,${-l * 0.75})`; og.beginPath(); tri.forEach((q, n) => (n ? og.lineTo(q[0], q[1]) : og.moveTo(q[0], q[1]))); og.closePath(); og.fill();
      og.strokeStyle = 'rgba(40,30,22,.22)'; og.lineWidth = 0.8; og.stroke();
    }
    const mi2 = mg.getImageData(0, 0, CW, CH); for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const d = Math.min(x, CW - 1 - x, y, CH - 1 - y), n = nzF(x / 7, y / 7, 3); mi2.data[(y * CW + x) * 4 + 3] = Math.round(clamp01((d - (2 + 9 * n)) / 1.6) * 255); } mg.putImageData(mi2, 0, 0);
  } else if (kind === 'abduct') {
    pix((x, y) => {
      const cx = Math.floor(x / 3), cy = Math.floor(y / 3), f = y / CH + 0.3 * (nzF(x / 30, y / 30, 5) - 0.5) + 0.1 * (nzHash(cx, cy, 8) - 0.5), edge = Math.exp(-Math.pow((f - 0.72) / 0.05, 2));
      return [f > 0.8 ? 0 : f > 0.66 ? (nzHash(cx, cy, 3) > (f - 0.66) / 0.14 ? 1 : 0) : 1, f > 0.5 ? [120, 255, 200, clamp01((f - 0.5) * 0.9)] : null, edge > 0.05 ? [170 + 85 * edge, 255, 215 + 40 * edge, edge * 0.9] : null];
    });
    const bm = gg.createLinearGradient(0, CH * 0.45, 0, CH); bm.addColorStop(0, 'rgba(130,255,200,0)'); bm.addColorStop(1, 'rgba(130,255,200,.55)'); gg.fillStyle = bm; gg.fillRect(0, CH * 0.45, CW, CH * 0.55);
    for (let i = 0; i < 70; i++) { const x = rnd() * CW, y = CH * (0.4 + rnd() * 0.6), l = 6 + rnd() * 24, gr = gg.createLinearGradient(x, y, x, y - l); gr.addColorStop(0, 'rgba(210,255,235,.9)'); gr.addColorStop(1, 'rgba(210,255,235,0)'); gg.strokeStyle = gr; gg.lineWidth = 1 + rnd() * 1.8; gg.beginPath(); gg.moveTo(x, y); gg.lineTo(x, y - l); gg.stroke(); }
    for (let i = 0; i < 18; i++) { const x = rnd() * CW, y = CH * (0.5 + rnd() * 0.5), r = 1.5 + rnd() * 2.6; gg.fillStyle = 'rgba(230,255,245,.95)'; gg.fillRect(x - r, y - r, r * 2, r * 2); }
  } else if (kind === 'glyph') {
    const cx0 = 100, cy0 = 150, R = 66;
    pix((x, y) => {
      const r = Math.hypot(x - cx0, y - cy0), cut = Math.abs(r - R) < 2.4 ? 0 : 1, halo = clamp01(1 - Math.abs(r - R) / 38), inside = r < R - 3;
      return [cut, [14, 30, 22, clamp01(halo * halo * 0.55 + (inside ? 0.18 : 0))], Math.abs(r - R) < 5.4 && cut ? [120, 255, 190, clamp01(1 - Math.abs(r - R - 0.6) / 4)] : null];
    });
    og.save(); og.translate(cx0, cy0); gg.save(); gg.translate(cx0, cy0);
    const glyph = (g, k, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); if (k === 0) { g.moveTo(-4, -8); g.lineTo(-4, 8); g.moveTo(-4, 0); g.lineTo(6, -6); } else if (k === 1) { g.arc(0, 0, 6, 0.3, 5.2); g.moveTo(-8, 8); g.lineTo(8, 8); } else if (k === 2) { g.moveTo(-7, 7); g.lineTo(0, -8); g.lineTo(7, 7); g.moveTo(-4, 1); g.lineTo(4, 1); } else if (k === 3) { g.moveTo(-6, -6); g.lineTo(6, 6); g.moveTo(6, -6); g.lineTo(-6, 6); g.moveTo(0, -9); g.lineTo(0, 9); } else { g.moveTo(-7, 0); g.quadraticCurveTo(0, -12, 7, 0); g.quadraticCurveTo(0, 12, -7, 0); g.moveTo(0, -2); g.lineTo(0, 2); } g.stroke(); };
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; for (const [g, w, col] of [[og, 3.6, 'rgba(10,22,16,.85)'], [gg, 2, 'rgba(140,255,200,.95)']]) { g.save(); g.rotate(a); g.translate(0, -(R + 22)); glyph(g, i % 5, w, col); g.restore(); } }
    for (const [g, w, col] of [[og, 3, 'rgba(10,22,16,.8)'], [gg, 1.6, 'rgba(140,255,200,.9)']]) { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.beginPath(); for (let i = 0; i < 3; i++) { const a = -1.5708 + i * 2.0944, x = Math.cos(a) * (R - 16), y = Math.sin(a) * (R - 16); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.stroke(); g.beginPath(); g.arc(0, 0, R - 34, 0, 6.283); g.stroke(); g.beginPath(); g.arc(0, 0, 6, 0, 6.283); g.stroke(); }
    og.restore(); gg.restore();
  } else if (kind === 'melt') {
    const cx0 = 100, cy0 = 120, drips = [[78, 40], [100, 64], [124, 34], [58, 22], [142, 26]];
    pix((x, y) => {
      const r = Math.hypot(x - cx0, y - cy0), ang = Math.atan2(y - cy0, x - cx0), rad = 44 + 8 * nzF(Math.cos(ang) * 2 + 3, Math.sin(ang) * 2 + 3, 9) * 2;
      let inHole = r < rad; for (const [dx, len] of drips) { const t = (y - (cy0 + 36)) / len; if (t > 0 && t < 1 && Math.abs(x - dx) < (7 - 4 * t) * (1 - t * 0.3) + (t > 0.85 ? 0 : 0)) inHole = inHole || true; }
      return [inHole ? 0 : 1, null, null];
    });
    const goo = (g, a1, a2) => { g.fillStyle = a1; g.strokeStyle = a2; };
    og.lineCap = 'round';
    for (const [dx, len] of drips) { const gr = og.createLinearGradient(dx - 8, 0, dx + 8, 0); gr.addColorStop(0, 'rgba(40,150,90,.95)'); gr.addColorStop(0.4, 'rgba(160,255,200,.98)'); gr.addColorStop(1, 'rgba(30,120,70,.95)'); og.fillStyle = gr; og.beginPath(); og.moveTo(dx - 9, cy0 + 38); og.quadraticCurveTo(dx - 5, cy0 + 38 + len * 0.7, dx, cy0 + 44 + len); og.quadraticCurveTo(dx + 5, cy0 + 38 + len * 0.7, dx + 9, cy0 + 38); og.closePath(); og.fill(); og.beginPath(); og.arc(dx, cy0 + 44 + len, 4.6, 0, 6.283); og.fill(); og.fillStyle = 'rgba(255,255,255,.8)'; og.beginPath(); og.ellipse(dx - 2, cy0 + 42 + len * 0.5, 1.4, len * 0.25, 0, 0, 6.283); og.fill(); }
    og.strokeStyle = 'rgba(30,140,85,.95)'; og.lineWidth = 11; og.beginPath(); for (let i = 0; i <= 64; i++) { const a = i / 64 * 6.283, rr = 46 + 8 * nzF(Math.cos(a) * 2 + 3, Math.sin(a) * 2 + 3, 9) * 2; i ? og.lineTo(cx0 + Math.cos(a) * rr, cy0 + Math.sin(a) * rr) : og.moveTo(cx0 + Math.cos(a) * rr, cy0 + Math.sin(a) * rr); } og.closePath(); og.stroke();
    og.strokeStyle = 'rgba(170,255,210,.9)'; og.lineWidth = 4; og.stroke(); og.strokeStyle = 'rgba(255,255,255,.7)'; og.lineWidth = 1.4; og.stroke();
    gg.shadowColor = 'rgba(120,255,190,1)'; gg.shadowBlur = 22; gg.strokeStyle = 'rgba(150,255,200,.8)'; gg.lineWidth = 5; gg.beginPath(); for (let i = 0; i <= 64; i++) { const a = i / 64 * 6.283, rr = 46 + 8 * nzF(Math.cos(a) * 2 + 3, Math.sin(a) * 2 + 3, 9) * 2; i ? gg.lineTo(cx0 + Math.cos(a) * rr, cy0 + Math.sin(a) * rr) : gg.moveTo(cx0 + Math.cos(a) * rr, cy0 + Math.sin(a) * rr); } gg.closePath(); gg.stroke();
  } else if (kind === 'glitch') {
    for (let y = 0; y < CH; y += 4) { og.fillStyle = 'rgba(40,255,170,.14)'; og.fillRect(0, y, CW, 1.4); }
    og.strokeStyle = 'rgba(80,255,190,.22)'; og.lineWidth = 1; for (let x = 0; x <= CW; x += 20) { og.beginPath(); og.moveTo(x, 0); og.lineTo(x, CH); og.stroke(); } for (let y = 0; y <= CH; y += 20) { og.beginPath(); og.moveTo(0, y); og.lineTo(CW, y); og.stroke(); }
    for (let i = 0; i < 7; i++) { const y = rnd() * CH, h = 3 + rnd() * 10; og.fillStyle = `rgba(${rnd() < 0.5 ? '255,60,140' : '60,255,220'},${0.25 + rnd() * 0.3})`; og.fillRect(0, y, CW, h); gg.fillStyle = 'rgba(160,255,220,.5)'; gg.fillRect(rnd() * 80, y, 40 + rnd() * 120, 1.6); }
    for (let i = 0; i < 40; i++) { gg.fillStyle = 'rgba(190,255,230,.9)'; const x = rnd() * CW, y = rnd() * CH, w = 3 + rnd() * 8; gg.fillRect(x, y, w, w * 0.6); }
  
  } else if (kind === 'glyph2') {
    const cx0 = 100, cy0 = 150, R = 62, tmp = document.createElement('canvas'); tmp.width = CW; tmp.height = CH; const tg = tmp.getContext('2d');
    pix((x, y) => {
      const dx = x - cx0, dy = y - cy0, r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx), bin = ((ang / 6.2832 + 1) * 16) % 1, dash = bin < 0.84;
      const outer = Math.abs(r - R) < 1.9 && dash ? 0 : 1, inner = Math.abs(r - 40) < 1.2 && ((ang / 6.2832 + 1) * 10) % 1 < 0.7 ? 0 : 1;
      const halo = clamp01(1 - Math.max(0, r - R) / 46), soot = nzF(x / 5, y / 5, 7) > 0.66 && r < R + 30 ? 0.18 : 0, edge = Math.exp(-Math.pow((r - R) / 4, 2));
      return [Math.min(outer, inner), [12, 26, 20, clamp01(halo * halo * 0.5 + (r < R ? 0.14 : 0) + soot)], edge > 0.05 && outer ? [110, 255, 185, edge * 0.5] : null];
    });
    og.save(); og.translate(cx0, cy0); tg.save(); tg.translate(cx0, cy0);
    const line = (a1, a2, wd) => { for (const [g, w, col] of [[og, wd + 2.4, 'rgba(8,20,14,.7)'], [tg, wd, 'rgba(150,255,205,.95)']]) { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); a1(g); g.stroke(); } };
    const ringArc = (r, w, from = 0, to = 6.2832) => line((g) => g.arc(0, 0, r, from, to), w);
    ringArc(R + 8, 1.4); ringArc(R - 12, 1.2); ringArc(R - 22, 1);
    for (let i = 0; i < 72; i++) { const a = i / 72 * 6.2832, l = i % 6 === 0 ? 8 : 3.6, r0 = R + 12; line((g) => { g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * (r0 + l), Math.sin(a) * (r0 + l)); }, i % 6 === 0 ? 1.6 : 1); }
    const glyph = (k, g, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); if (k === 0) { g.moveTo(-3, -7); g.lineTo(-3, 7); g.moveTo(-3, 0); g.lineTo(5, -5); g.moveTo(-3, 0); g.lineTo(5, 5); } else if (k === 1) { g.arc(0, -1, 5, 0.4, 5.9); g.moveTo(-6, 7); g.lineTo(6, 7); } else if (k === 2) { g.moveTo(-6, 6); g.lineTo(0, -7); g.lineTo(6, 6); g.moveTo(-3.4, 1); g.lineTo(3.4, 1); g.moveTo(0, -7); g.lineTo(0, -10); } else if (k === 3) { g.moveTo(-5, -5); g.lineTo(5, 5); g.moveTo(5, -5); g.lineTo(-5, 5); g.moveTo(0, -8); g.lineTo(0, 8); } else if (k === 4) { g.moveTo(-6, 0); g.quadraticCurveTo(0, -10, 6, 0); g.quadraticCurveTo(0, 10, -6, 0); g.moveTo(0, -2); g.lineTo(0, 2); } else { g.moveTo(-5, -6); g.lineTo(5, -6); g.lineTo(0, 6); g.closePath(); g.moveTo(0, -1); g.lineTo(0, -1.2); } g.stroke(); };
    for (let i = 0; i < 16; i++) { const a = i / 16 * 6.2832; for (const [g, w, col] of [[og, 3.4, 'rgba(8,20,14,.75)'], [tg, 1.7, 'rgba(160,255,215,.98)']]) { g.save(); g.rotate(a); g.translate(0, -(R + 26)); glyph((i * 7 + 3) % 6, g, w, col); g.restore(); } }
    const hexTri = (rr, rot) => line((g) => { for (let i = 0; i < 3; i++) { const a = rot + i * 2.0944, x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); }, 1.5);
    hexTri(R - 26, -1.5708); hexTri(R - 26, 1.5708);
    for (let i = 0; i < 6; i++) { const a = -1.5708 + i * 1.0472; line((g) => { g.moveTo(Math.cos(a) * (R - 26), Math.sin(a) * (R - 26)); g.lineTo(Math.cos(a) * (R - 3), Math.sin(a) * (R - 3)); }, 1); for (const [g, rr, col] of [[tg, 2.8, 'rgba(255,255,255,1)'], [og, 4, 'rgba(8,20,14,.8)']]) { g.fillStyle = col; g.beginPath(); g.arc(Math.cos(a) * (R - 26), Math.sin(a) * (R - 26), rr, 0, 6.2832); g.fill(); } }
    line((g) => { g.ellipse(0, 3, 15, 5, 0, 0, 6.2832); g.moveTo(-8, 1); g.quadraticCurveTo(0, -14, 8, 1); }, 1.6); line((g) => { g.moveTo(-6, 9); g.lineTo(-9, 15); g.moveTo(0, 9); g.lineTo(0, 16); g.moveTo(6, 9); g.lineTo(9, 15); }, 1.1);
    og.restore(); tg.restore();
    gg.shadowColor = 'rgba(90,255,190,1)'; gg.shadowBlur = 12; gg.drawImage(tmp, 0, 0); gg.shadowBlur = 0; gg.drawImage(tmp, 0, 0);
    // the rotating layer: a dashed ring with orbiting sparks
    rg.save(); rg.translate(cx0, cy0); rg.shadowColor = 'rgba(90,255,190,1)'; rg.shadowBlur = 10;
    rg.strokeStyle = 'rgba(170,255,220,.9)'; rg.lineWidth = 2; rg.lineCap = 'round'; for (let i = 0; i < 28; i++) { const a = i / 28 * 6.2832; rg.beginPath(); rg.arc(0, 0, R + 44, a, a + 0.1); rg.stroke(); }
    for (let i = 0; i < 3; i++) { const a = i * 2.0944; rg.fillStyle = 'rgba(255,255,255,1)'; rg.beginPath(); rg.arc(Math.cos(a) * (R + 44), Math.sin(a) * (R + 44), 3.4, 0, 6.2832); rg.fill(); }
    rg.restore();
  } else if (kind === 'beam') {
    const cx = 100, cy = 136, R = 42, C = 5;
    pix((x, y) => {
      const gx = Math.floor(x / C), gy = Math.floor(y / C), mx = gx * C + C / 2, my = gy * C + C / 2, r = Math.hypot(mx - cx, my - cy), rr = Math.hypot(x - cx, y - cy);
      const band = (r - R) / 30, keep = r < R ? 0 : band > 1 ? 1 : (nzHash(gx, gy, 77) < band * band * 1.2 ? 1 : 0);   // a pixelated dissolve front
      const edgeGlow = keep && r < R + 30 ? clamp01(1 - (r - R) / 30) : 0, ring = Math.exp(-Math.pow((rr - (R + 46)) / 1.4, 2)) * 0.55, tint = clamp01(1 - rr / 140) * 0.16;
      return [keep, [20, 120, 130, clamp01(tint + edgeGlow * 0.3)], edgeGlow > 0.02 || ring > 0.02 ? [140, 255, 240, clamp01(Math.pow(edgeGlow, 1.5) * 1.1 + ring)] : null];
    });
    // cells of the card lifted into the beam, smaller and fainter the higher they go
    for (let i = 0; i < 46; i++) { const t = rnd(), x = cx + (rnd() - 0.5) * (R * 1.6) * (1 - t * 0.4), y = cy - R * 0.4 - t * (cy - 6), sz = (1 - t) * 4 + 1.5, al = (1 - t) * 0.9 + 0.1; gg.fillStyle = rnd() < 0.3 ? `rgba(255,255,255,${al})` : `rgba(120,255,235,${al})`; gg.fillRect(Math.round(x), Math.round(y), sz, sz); }
  } else if (kind === 'hud') {
    // a modern targeting HUD: a clean laser-cut disc, glass tint, gradient arcs on separate spinning layers, readouts, an anamorphic flare
    const cx0 = 100, cy0 = 150, R = 56, CY = [95, 251, 241], VI = [160, 130, 255], PK = [255, 120, 220];
    const grad = (g, a, b, c0, c1, al = 1) => { const gr = g.createLinearGradient(a[0], a[1], b[0], b[1]); gr.addColorStop(0, `rgba(${c0[0]},${c0[1]},${c0[2]},${al})`); gr.addColorStop(1, `rgba(${c1[0]},${c1[1]},${c1[2]},${al})`); return gr; };
    pix((x, y) => {
      const r = Math.hypot(x - cx0, y - cy0), cut = Math.abs(r - R) < 1.7 ? 0 : 1, shadow = clamp01(1 - Math.abs(r - R) / 20), inside = r < R - 2, edgeN = Math.atan2(y - cy0, x - cx0), tint = inside ? clamp01(0.12 + 0.22 * (r / R)) : 0;
      const halo = clamp01(1 - Math.max(0, r - (R + 8)) / 62), dark = Math.max(0.9 * Math.pow(halo, 1.15), inside ? 0.58 : 0);   // a deep navy spotlight so the neon reads on the pale card
      return [cut, [6, 14, 32, clamp01(dark)], Math.abs(r - R) < 4.4 && cut ? [110, 255, 235, clamp01(1 - Math.abs(r - R - 0.4) / 3.6) * 0.95] : (inside ? [90, 220, 255, tint * 0.3] : null)];
    });
    const sheen = og.createLinearGradient(cx0 - R, cy0 - R, cx0 + R * 0.4, cy0 + R * 0.6); sheen.addColorStop(0, 'rgba(255,255,255,.34)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); og.save(); og.beginPath(); og.arc(cx0, cy0, R - 3, 0, 6.2832); og.clip(); og.fillStyle = sheen; og.fillRect(0, 0, CW, CH); const vg = og.createRadialGradient(cx0, cy0, 8, cx0, cy0, R); vg.addColorStop(0, 'rgba(120,255,240,.2)'); vg.addColorStop(1, 'rgba(90,120,255,.3)'); og.fillStyle = vg; og.fillRect(0, 0, CW, CH); og.restore();
    const tmp = document.createElement('canvas'); tmp.width = CW; tmp.height = CH; const tg = tmp.getContext('2d');
    // fixed HUD: corner brackets, ticks, readouts, the core and the lens flare
    tg.strokeStyle = grad(tg, [20, 60], [180, 240], CY, VI, 0.95); tg.lineWidth = 2; tg.lineCap = 'square';
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x = cx0 + sx * 66, y = cy0 + sy * 66; tg.beginPath(); tg.moveTo(x, y - sy * 14); tg.lineTo(x, y); tg.lineTo(x - sx * 14, y); tg.stroke(); }
    tg.lineWidth = 1.2; for (let i = 0; i < 4; i++) { const a = i * 1.5708; tg.beginPath(); tg.moveTo(cx0 + Math.cos(a) * (R + 5), cy0 + Math.sin(a) * (R + 5)); tg.lineTo(cx0 + Math.cos(a) * (R + 17), cy0 + Math.sin(a) * (R + 17)); tg.stroke(); }
    tg.font = '700 8px ui-monospace, Menlo, monospace'; tg.textAlign = 'center'; tg.fillStyle = 'rgba(190,255,248,.98)'; tg.fillText('TARGET LOCKED', cx0, cy0 - R - 24); tg.font = '600 6.5px ui-monospace, Menlo, monospace'; tg.fillStyle = 'rgba(160,230,255,.9)'; tg.fillText('48.213° N   73.077° W', cx0, cy0 + R + 30); tg.fillStyle = 'rgba(255,170,235,.95)'; tg.fillText('SIGNAL LOST  ·  100%', cx0, cy0 + R + 40);
    tg.fillStyle = 'rgba(255,255,255,1)'; tg.beginPath(); tg.arc(cx0, cy0, 3.4, 0, 6.2832); tg.fill(); tg.strokeStyle = 'rgba(180,255,245,1)'; tg.lineWidth = 1.4; tg.beginPath(); tg.arc(cx0, cy0, 9, 0, 6.2832); tg.stroke(); tg.beginPath(); tg.moveTo(cx0 - 20, cy0); tg.lineTo(cx0 - 12, cy0); tg.moveTo(cx0 + 12, cy0); tg.lineTo(cx0 + 20, cy0); tg.moveTo(cx0, cy0 - 20); tg.lineTo(cx0, cy0 - 12); tg.moveTo(cx0, cy0 + 12); tg.lineTo(cx0, cy0 + 20); tg.stroke();
    const fl = tg.createLinearGradient(0, 0, CW, 0); fl.addColorStop(0, 'rgba(95,251,241,0)'); fl.addColorStop(0.5, 'rgba(235,255,252,1)'); fl.addColorStop(1, 'rgba(160,130,255,0)'); tg.fillStyle = fl; tg.fillRect(0, cy0 - 1, CW, 2);
    const fl2 = tg.createLinearGradient(0, cy0 - 40, 0, cy0 + 40); fl2.addColorStop(0, 'rgba(255,255,255,0)'); fl2.addColorStop(0.5, 'rgba(255,255,255,.8)'); fl2.addColorStop(1, 'rgba(255,255,255,0)'); tg.fillStyle = fl2; tg.fillRect(cx0 - 0.7, cy0 - 40, 1.4, 80);
    gg.shadowColor = 'rgba(95,251,241,1)'; gg.shadowBlur = 10; gg.drawImage(tmp, 0, 0); gg.shadowBlur = 0; gg.drawImage(tmp, 0, 0);
    // the spinning layers (each its own canvas)
    const layer = () => { const c = mk(); extra.push(c); const g = c.getContext('2d'); g.translate(cx0, cy0); g.shadowColor = 'rgba(95,251,241,.95)'; g.shadowBlur = 9; g.lineCap = 'round'; return g; };
    let g = layer(); g.strokeStyle = grad(g, [-80, -80], [80, 80], CY, VI); g.lineWidth = 3.2; for (let i = 0; i < 4; i++) { const a = i * 1.5708 + 0.25; g.beginPath(); g.arc(0, 0, 82, a, a + 0.62 - (i % 2) * 0.16); g.stroke(); } g.lineWidth = 1.4; g.strokeStyle = 'rgba(210,235,255,.85)'; g.beginPath(); g.arc(0, 0, 82, 0, 6.2832); g.setLineDash([1, 7]); g.stroke(); g.setLineDash([]);
    for (let i = 0; i < 3; i++) { const a = i * 2.0944 + 0.9; g.fillStyle = i === 0 ? 'rgba(255,140,230,1)' : 'rgba(255,255,255,1)'; g.beginPath(); g.arc(Math.cos(a) * 82, Math.sin(a) * 82, 3.2, 0, 6.2832); g.fill(); }
    g = layer(); g.lineWidth = 1.8; for (let i = 0; i < 60; i++) { const a = i / 60 * 6.2832, long = i % 5 === 0; g.strokeStyle = long ? 'rgba(255,255,255,.95)' : 'rgba(170,240,255,.7)'; g.beginPath(); g.moveTo(Math.cos(a) * (long ? 66 : 69), Math.sin(a) * (long ? 66 : 69)); g.lineTo(Math.cos(a) * 73, Math.sin(a) * 73); g.stroke(); }
    g = layer(); g.strokeStyle = grad(g, [-50, 50], [50, -50], PK, CY); g.lineWidth = 4.4; g.beginPath(); g.arc(0, 0, 45, -1.2, 3.6); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(Math.cos(3.6) * 45, Math.sin(3.6) * 45, 4.2, 0, 6.2832); g.fill(); g.strokeStyle = 'rgba(200,225,255,.6)'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, 34, 0.5, 5.4); g.stroke();
  } else if (kind === 'glitch2') {
    pix((x, y) => {
      const f = y / CH, cx = Math.floor(x / 4), cy = Math.floor(y / 4), t = clamp01((f - 0.58) / 0.34 + 0.2 * (nzF(x / 14, y / 14, 5) - 0.5)), keep = nzHash(cx, cy, 9) > t * 1.05;
      return [keep ? 1 : 0, null, null];
    });
    for (let y = 0; y < CH; y += 3) { og.fillStyle = 'rgba(30,255,200,.13)'; og.fillRect(0, y, CW, 1); }
    og.strokeStyle = 'rgba(80,255,200,.14)'; og.lineWidth = 1; for (let x = 10; x < CW; x += 20) { og.beginPath(); og.moveTo(x, 0); og.lineTo(x, CH); og.stroke(); }
    for (let i = 0; i < 6; i++) { const w = 26 + rnd() * 70, h = 6 + rnd() * 16, x = rnd() * (CW - w), y = 40 + rnd() * (CH - 110); og.fillStyle = rnd() < 0.5 ? 'rgba(255,50,140,.32)' : 'rgba(50,255,220,.3)'; og.fillRect(x, y, w, h); og.fillStyle = 'rgba(255,255,255,.18)'; og.fillRect(x + 6, y + 2, w * 0.5, 1.4); }
    const bg = og.createLinearGradient(0, CH * 0.45, 0, CH * 0.45 + 16); bg.addColorStop(0, 'rgba(60,255,220,0)'); bg.addColorStop(0.5, 'rgba(210,255,248,.85)'); bg.addColorStop(1, 'rgba(60,255,220,0)'); og.fillStyle = bg; og.fillRect(0, CH * 0.45, CW, 16);
    gg.shadowColor = 'rgba(80,255,210,1)'; gg.shadowBlur = 14; gg.fillStyle = 'rgba(210,255,248,.95)'; gg.fillRect(0, CH * 0.45 + 7, CW, 2); gg.shadowBlur = 0;
    og.font = 'bold 13px monospace'; gg.font = 'bold 13px monospace'; const chars = '01ABCDEF2389<>/\\+=';
    for (const cx2 of [8, 22, 172, 186]) for (let y = 14; y < CH; y += 14) { const a = clamp01(1 - Math.abs(y - CH * 0.6) / (CH * 0.5)) * (0.25 + 0.7 * nzHash(cx2, Math.floor(y / 14), 2)); const ch = chars[Math.floor(nzHash(cx2, Math.floor(y / 14), 6) * chars.length)]; gg.fillStyle = `rgba(150,255,215,${a})`; gg.fillText(ch, cx2, y); }
    for (let i = 0; i < 46; i++) { const x = rnd() * CW, y = CH * (0.62 + rnd() * 0.38), w = 2 + rnd() * 4; gg.fillStyle = `rgba(190,255,235,${0.4 + rnd() * 0.5})`; gg.fillRect(x, y - (1 - (y / CH - 0.62) / 0.38) * rnd() * 18, w, w); }

  } else if (kind === 'warp') {
    pix((x, y) => {
      const dx = x - 100, dy = y - 148, r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx), tw = ang + 2.6 * (1 - Math.min(1, r / 170)), n = nzF(Math.cos(tw) * r / 26 + 8, Math.sin(tw) * r / 26 + 8, 14), cut = 52 + 46 * n, q = cut - r, halo = clamp01(1 - r / 150);
      const edge = Math.exp(-Math.pow((q - 1) / 5, 2));
      return [q > 4 ? 0 : 1, [34, 8, 80, clamp01(halo * 0.55 + (q > -22 ? 0.5 * clamp01((q + 22) / 22) : 0))], edge > 0.05 ? [200, 120 + 80 * edge, 255, edge * 0.9] : null];
    });
    og.save(); og.globalCompositeOperation = 'lighter'; for (let a = 0; a < 4; a++) { og.beginPath(); for (let i = 0; i <= 70; i++) { const q = i / 70, ang = a * 1.571 + q * 7, rr = 14 + q * 120, x = 100 + Math.cos(ang) * rr, y = 148 + Math.sin(ang) * rr * 1.05; i ? og.lineTo(x, y) : og.moveTo(x, y); } og.strokeStyle = 'rgba(190,130,255,.35)'; og.lineWidth = 4; og.stroke(); og.strokeStyle = 'rgba(255,235,255,.4)'; og.lineWidth = 1; og.stroke(); } og.restore();
    paintBlackHole(og, 100, 148, 24, 1.2, 1);
    paintBlackHole(gg, 100, 148, 24, 1.2, 0.5);
  } else if (kind === 'sliced') {
    const cuts = [0.22, 0.5, 0.78];
    for (const c of cuts) { const y0 = c * CH + 0.11 * CH, y1 = c * CH - 0.11 * CH; const lg = gg.createLinearGradient(0, 0, CW, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.25, 'rgba(255,255,255,.75)'); lg.addColorStop(0.75, 'rgba(255,255,255,.75)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); gg.strokeStyle = lg; gg.lineWidth = 2.4; gg.shadowColor = 'rgba(190,220,255,.9)'; gg.shadowBlur = 8; gg.beginPath(); gg.moveTo(0, y0); gg.lineTo(CW, y1); gg.stroke(); }
    og.save(); og.shadowColor = 'rgba(0,0,0,.65)'; og.shadowBlur = 6; og.shadowOffsetY = 3; paintShuriken(og, 150, 118, 20, 24, 1); paintShuriken(og, 52, 190, 17, -38, 1); og.restore();
  }
  return (ENDTEX[kind] = { mask: mask.toDataURL(), ov: ov.toDataURL(), gl: gl.toDataURL(), rt: kind === 'glyph2' ? rt.toDataURL() : '', ex: extra.map((c) => c.toDataURL()) });
}
let UFO_END = 9;   // the saucer's mark: 1 vaporised pixels, 2 abducted, 3 glyph circle, 4 melted goo, 5 glitch
let FIST_END = 6;   // which look the hammer leaves behind: 1 folded, 2 shattered, 3 squashed with a hammer imprint, 4 punched through, 5 crumpled, 6 smashed (dented, creased, torn)
function glitchCard2(id, animate, as, cascade) {
  const tex = endTex('glitch2'), box = el('div', { class: 'tcard end e-glitch2' + (animate ? ' tearing' : '') });
  let sd = 31; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const hs = [5, 7, 6, 9, 5, 8, 7, 10, 6, 8, 7, 9, 5, 4, 3, 1];   // strip heights in percent
  let y0 = 0; const total = hs.reduce((a, b) => a + b, 0);
  hs.forEach((h, i) => {
    const top = y0 / total * 100, bot = (y0 + h) / total * 100; y0 += h; const mid = (top + bot) / 200;
    const c = cardEl(id, { as }); c.classList.add('half', 'gl2'); c.style.clipPath = `inset(${top}% 0 ${100 - bot}% 0)`; c.style.webkitMaskImage = c.style.maskImage = `url(${tex.mask})`; c.style.webkitMaskSize = c.style.maskSize = '100% 100%';
    const amp = 2 + 15 * Math.sin(Math.PI * Math.min(1, mid * 1.1)), off = (rnd() - 0.5) * amp * (i % 5 === 3 ? 2.2 : 1), ab = 1.2 + 3.4 * mid, holo = i === 6 || i === 10;
    const w = el('div', { class: 'gl' }, c); w.style.transform = `translateX(calc(var(--cw) * ${(off * 0.011).toFixed(3)}))`; w.style.opacity = String(mid < 0.38 ? 1 : Math.max(0.3, 1 - (mid - 0.38) * 1.15));
    w.style.filter = `drop-shadow(${ab.toFixed(1)}px 0 0 rgba(255,40,130,.85)) drop-shadow(${(-ab).toFixed(1)}px 0 0 rgba(40,255,215,.85))` + (holo ? ' hue-rotate(140deg) saturate(2.2) brightness(1.3)' : '');
    box.append(w);
  });
  const fx = el('div', { class: 'tfx' }); fx.style.backgroundImage = `url(${tex.ov})`; fx.style.backgroundSize = '100% 100%';
  const gl = el('div', { class: 'tfg' }); gl.style.backgroundImage = `url(${tex.gl})`; gl.style.backgroundSize = '100% 100%'; box.append(fx, gl);
  if (cascade) box.style.setProperty('--cd', cascade + 'ms');
  return box;
}
function glitchCard(id, animate, as, cascade) {
  const tex = endTex('glitch'), box = el('div', { class: 'tcard end e-glitch' + (animate ? ' tearing' : '') });
  let sd = 19; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; }, N = 9;
  for (let i = 0; i < N; i++) {
    const top = i / N * 100, bot = (i + 1) / N * 100, c = cardEl(id, { as }); c.classList.add('half'); c.style.clipPath = `inset(${top}% 0 ${100 - bot}% 0)`;
    const w = el('div', { class: 'gl' }, c), off = (rnd() - 0.5) * (i % 3 === 1 ? 18 : 7), gone = i === 5 || i === 7;
    w.style.transform = `translateX(calc(var(--cw) * ${(off * 0.012).toFixed(3)}))`; w.style.opacity = gone ? '0.28' : i % 4 === 2 ? '0.62' : '1';
    w.style.filter = `drop-shadow(${(2 + rnd() * 2).toFixed(1)}px 0 0 rgba(255,40,120,.85)) drop-shadow(${(-2 - rnd() * 2).toFixed(1)}px 0 0 rgba(40,255,210,.85))` + (gone ? ' hue-rotate(120deg) saturate(2)' : '');
    box.append(w);
  }
  const fx = el('div', { class: 'tfx' }); fx.style.backgroundImage = `url(${tex.ov})`; fx.style.backgroundSize = '100% 100%';
  const gl = el('div', { class: 'tfg' }); gl.style.backgroundImage = `url(${tex.gl})`; gl.style.backgroundSize = '100% 100%'; box.append(fx, gl);
  if (cascade) box.style.setProperty('--cd', cascade + 'ms');
  return box;
}
function shatteredCard(id, animate, as, cascade) {
  const cols = 3, rows = 4, pts = []; let sd = 11; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  for (let j = 0; j <= rows; j++) { pts.push([]); for (let i = 0; i <= cols; i++) pts[j].push([i / cols * 100 + (i > 0 && i < cols ? (rnd() - 0.5) * 24 : 0), j / rows * 100 + (j > 0 && j < rows ? (rnd() - 0.5) * 16 : 0)]); }
  const box = el('div', { class: 'tcard end e-shatter' + (animate ? ' tearing' : '') });
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const q = [pts[j][i], pts[j][i + 1], pts[j + 1][i + 1], pts[j + 1][i]], cx = i / cols * 100 + 100 / cols / 2 - 50, cy = j / rows * 100 + 100 / rows / 2 - 50;
    const c = cardEl(id, { as }); c.classList.add('half'); c.style.clipPath = `polygon(${q.map((p) => p[0] + '% ' + p[1] + '%').join(',')})`;
    const w = el('div', { class: 'shd' }, c); w.style.transform = `translate(calc(var(--cw) * ${(cx * 0.0016 + (rnd() - 0.5) * 0.03).toFixed(3)}), calc(var(--cw) * ${(cy * 0.0016 + (rnd() - 0.5) * 0.03).toFixed(3)})) rotate(${((rnd() - 0.5) * 9).toFixed(1)}deg)`; w.style.filter = `drop-shadow(0 0 .6px rgba(255,255,255,.9)) drop-shadow(0 2px 3px rgba(0,0,0,.55)) brightness(${(0.78 + rnd() * 0.3).toFixed(2)})`;
    box.append(w);
  }
  if (cascade) box.style.setProperty('--cd', cascade + 'ms');
  return box;
}
function foldedCard(id, animate, as, cascade) {
  const panel = (n, ...extra) => { const c = cardEl(id, { as }); c.classList.add('endc'); return el('div', { class: 'fp fp' + n }, c, el('div', { class: 'fsh' }), ...extra); };
  const box = el('div', { class: 'tcard end e-fold' + (animate ? ' tearing' : '') }, panel(1, el('div', { class: 'dogear' })), panel(2), panel(3));
  if (cascade) box.style.setProperty('--cd', cascade + 'ms');
  return box;
}
function tornCard(id, animate, as = null, cascade = 0, style = '') {
  let kind = ATK_ENDS[style];
  if (kind === 'vapor' && UFO_END > 1) kind = ['vapor', 'abduct', 'glyph', 'melt', 'glitch', 'glyph2', 'glitch2', 'hud', 'beam'][UFO_END - 1];
  if (kind === 'crushed' && FIST_END === 4) kind = 'punched'; else if (kind === 'crushed' && FIST_END === 5) kind = 'crumple'; else if (kind === 'crushed' && FIST_END === 6) kind = 'smashed';
  if (kind === 'glitch') return glitchCard(id, animate, as, cascade);
  if (kind === 'glitch2') return glitchCard2(id, animate, as, cascade);
  if (kind === 'crushed' && FIST_END === 1) return foldedCard(id, animate, as, cascade);
  if (kind === 'crushed' && FIST_END === 2) return shatteredCard(id, animate, as, cascade);
  if (!kind) {
    const half = (side) => { const c = cardEl(id, { as }); c.classList.add('half', side); return c; };
    const box = el('div', { class: 'tcard' + (animate ? ' tearing' : '') }, half('l'), half('r'));
    if (cascade) box.style.setProperty('--cd', cascade + 'ms');   // the tear waits until everyone's card is over
    return box;
  }
  const tex = endTex(kind);
  let box;
  const mask = `url(${tex.mask})`;
  if (kind === 'sliced') {
    const cuts = [0.22, 0.5, 0.78], yAt = (c, x) => (c - 0.11 + 0.22 * (1 - x)) * 100, edges = [null, ...cuts, null];   // three parallel blade cuts leaving four strips
    const strip = (k) => {
      const top = edges[k], bot = edges[k + 1], pts = [];
      if (top === null) pts.push('0 0', '100% 0'); else pts.push(`0 ${yAt(top, 0)}%`, `100% ${yAt(top, 1)}%`);
      if (bot === null) pts.push('100% 100%', '0 100%'); else pts.push(`100% ${yAt(bot, 1)}%`, `0 ${yAt(bot, 0)}%`);
      const c = cardEl(id, { as }); c.classList.add('half'); c.style.clipPath = `polygon(${pts.join(',')})`;
      return el('div', { class: 'sp sp' + (k + 1) }, c);
    };
    box = el('div', { class: 'tcard end e-sliced' + (animate ? ' tearing' : '') }, strip(0), strip(1), strip(2), strip(3));
  } else {
    const c = cardEl(id, { as }); c.classList.add('endc'); if (kind !== 'frozen') { c.style.webkitMaskImage = c.style.maskImage = mask; c.style.webkitMaskSize = c.style.maskSize = '100% 100%'; }
    box = el('div', { class: 'tcard end e-' + kind + (animate ? ' tearing' : '') }, c);
  }
  const fx = el('div', { class: 'tfx' }); fx.style.backgroundImage = `url(${tex.ov})`; fx.style.backgroundSize = '100% 100%';
  const gl = el('div', { class: 'tfg' }); gl.style.backgroundImage = `url(${tex.gl})`; gl.style.backgroundSize = '100% 100%';
  if (kind !== 'sliced' && kind !== 'warp' && kind !== 'vapor' && kind !== 'frozen' && kind !== 'abduct' && kind !== 'melt' && kind !== 'glyph' && kind !== 'glyph2' && kind !== 'hud') { fx.style.webkitMaskImage = fx.style.maskImage = mask; fx.style.webkitMaskSize = fx.style.maskSize = '100% 100%'; }
  box.append(fx, gl);
  (tex.ex || []).forEach((u, i) => { const d = el('div', { class: 'tfr tfq' + i }); d.style.backgroundImage = `url(${u})`; d.style.backgroundSize = '100% 100%'; box.append(d); });
  if (kind === 'hud') box.append(el('div', { class: 'tsweep' }));
  if (tex.rt) { const rtl = el('div', { class: 'tfr' }); rtl.style.backgroundImage = `url(${tex.rt})`; rtl.style.backgroundSize = '100% 100%'; box.append(rtl); }
  if (cascade) box.style.setProperty('--cd', cascade + 'ms');
  return box;
}

// a short line of match commentary for a row that has just been scored
const HAND_RANK = ['none', 'pair', 'straight', 'flush', 'triple', 'sflush', 'royal'];
function commentFor(res) {
  const ent = res.entries || [], names = res.tie ? [] : loserNames(res);
  if (res.tie) return t('cmTie');
  if (res.streak && res.streak.n >= 3) return t('cmStreak', { name: res.streak.name, n: res.streak.n, row: res.row + 1 });
  if (res.row === 3) {
    const best = ent.reduce((a, e) => (!a || HAND_RANK.indexOf(e.hand) > HAND_RANK.indexOf(a.hand) ? e : a), null);
    if (best && ['royal', 'sflush', 'triple'].includes(best.hand)) return t('cmHand_' + best.hand, { name: best.name });
  }
  if (res.row === 2) {
    const perfect = ent.find((e) => e.total === 10.5), bust = ent.filter((e) => e.bust);
    if (perfect) return t('cmPerfect', { name: perfect.name });
    if (bust.length) return bust.length === 1 ? t('cmBust', { name: bust[0].name }) : t('cmBusts', { names: bust.map((e) => e.name).join(', ') });
  }
  if (res.row === 0 || res.row === 1) {
    const star = ent.filter((e) => e.val === (res.row === 0 ? 14 : 2));
    if (star.length > 1) return t(res.row === 0 ? 'cmAces' : 'cmTwos', { n: star.length });
    if (star.length === 1) return t(res.row === 0 ? 'cmAce' : 'cmTwo', { name: star[0].name });
  }
  if (ent.some((e) => e.as)) return t('cmJoker');
  if (res.penalty >= 4) return t('cmBig', { pen: res.penalty });
  if (names.length > 1) return t('cmShared', { names: names.join(', ') });
  // nothing special happened: say why this player lost
  const L = ent.find((e) => e.id === res.losers[0]);
  if (!L) return '';
  const face = (c) => (c === 'JK' ? '★' : String(c).slice(0, -1));
  if (res.row === 0) return t('cmLow', { name: L.name, card: face((L.as || L.cards)[0]) });
  if (res.row === 1) return t('cmHigh', { name: L.name, card: face((L.as || L.cards)[0]) });
  if (res.row === 2) return t('cmFar', { name: L.name, total: L.total });
  return t('cmWeak', { name: L.name, hand: t('gh_' + L.hand) });
}
const hitSeen = new Set();
// before a row opens: tap the player you think will lose it
// while guesses are being made the cards are out of sight: just the players to pick from, and the clock
function predPanel(active, row, win, open = true) {
  const others = active.filter((p) => p.id !== st.meId), total = win.until - win.from, gone = Math.max(0, Math.min(total, serverNow() - win.from));
  const joined = active.some((p) => p.id === st.meId);
  const key = 'open:' + st.round + ':' + st.currentRow, first = predSeen !== key; predSeen = key;
  const mine = st.myPreds || [null, null, null, null], decided = mine.filter((x) => x).length;
  // tap a player (or Skip) for each row; tapping the same one again leaves that row undecided
  const setPick = (r, v) => { if (!open) return; const next = mine[r] === v ? null : v; st.myPreds = mine.map((x, i) => (i === r ? next : x)); SND.play('tick'); render(); act('predict', { row: r, target: next === null ? '' : next }); };
  return el('div', { class: 'predpanel' + (first ? ' pp-in' : '') },
    el('div', { class: 'ppt' }, el('b', {}, t('predTitle')), joined ? el('small', { class: 'ppmine' + (decided === 4 ? ' all' : '') }, t('predMine', { n: decided })) : '', el('div', { class: 'ppodds' },
      el('span', { class: 'po win' }, el('small', {}, t('predRight')), el('b', {}, '+' + (st.predWp || 3) + ' WP')),
      el('span', { class: 'po lose' }, el('small', {}, t('predWrong')), el('b', {}, '−' + (st.predPen || 1) + ' WP')),
      el('span', { class: 'po skip' }, el('small', {}, t('predSkip')), el('b', {}, '0')))),
    joined ? el('div', { class: 'pprows' }, ...[0, 1, 2, 3].map((r) => {
      const pick = mine[r], chip = (v, kids, cls = '', name = '') => el('button', { type: 'button', class: 'ppchip' + cls + (pick === v ? ' on' : ''), title: name, disabled: !open, 'aria-pressed': String(pick === v), onclick: () => setPick(r, v) }, ...kids);
      return el('div', { class: 'pprow' + (pick ? ' done' : '') + (pick === '-' ? ' skipped' : '') }, el('div', { class: 'pprh' }, el('b', {}, t('rowN', { n: r + 1 })), el('small', {}, t('rule' + (r + 1))),
          el('button', { type: 'button', class: 'ppskip' + (pick === '-' ? ' on' : ''), disabled: !open, 'aria-pressed': String(pick === '-'), onclick: () => setPick(r, '-') }, pick === '-' ? icon('check', 13) : '', t('predSkip'))),
        el('div', { class: 'ppchips' }, ...others.map((p) => chip(p.id, [avatarEl(p.avatar, 38, '', p.acc, p.bd), el('span', {}, p.name)], '', p.name))));
    })) : el('div', { class: 'ppn' }, t('predWatch')),
    open ? el('div', { class: 'predbar' }, el('i', { style: `animation-duration:${total}ms;animation-delay:-${gone}ms` })) : el('div', { class: 'predbar idle' }),
    el('small', { class: 'ppn ppcount' }, !open ? t('predSoon') : st.predN ? t('predPicked', { n: st.predN }) : t('predNoneYet')));
}
// before the picker opens: a quiet screen, so nothing ever appears greyed out
function predReady() {
  const key = 'wait:' + st.round + ':' + st.currentRow, first = predSeen !== key; predSeen = key;
  return el('div', { class: 'predpanel predready' + (first ? ' pp-in' : '') }, el('div', { class: 'ppt' }, el('b', {}, t('predReadyT')), el('small', {}, t('predSoon'))), el('div', { class: 'ppdots' }, el('i'), el('i'), el('i')));
}
let predSeen = '';
// the guessing window: re-draw the moment it opens and the moment it closes
let predTick = { key: '', timers: [] };
function predSchedule(win) {
  const key = win ? win.from + ':' + win.until : '';
  if (predTick.key === key) return;
  predTick.timers.forEach(clearTimeout); predTick = { key, timers: [] };
  if (!win) return;
  // each step waits for the moment on the server's clock; the clock estimate can be refined meanwhile, so a timer that wakes a little
  // early simply waits for the rest instead of leaving the screen stuck on the picker
  const at = (target, fn) => { const wait = target - serverNow(); if (wait > 0) predTick.timers.push(setTimeout(() => (predTick.key === key ? at(target, fn) : null), wait + 20)); else fn(); };
  const now = serverNow();
  if (win.from - 200 > now) at(win.from - 200, () => { if (st) render(); });
  if (win.until > now) at(win.until, () => {
    const pnl = document.querySelector('.predpanel');
    const go = () => { screenAnim = true; if (st) render(); };   // the cards come in one after another
    if (pnl) { pnl.classList.add('pp-out'); setTimeout(go, 240); } else go();
  });
}
// a safety net for the guessing screens: if what is shown no longer matches the clock (a missed timer, a phone that slept), redraw
setInterval(() => {
  if (!st || !st.predWin || document.hidden || st.phase !== 'dealt' || (st.currentRow ?? 0) !== 0) return;
  const w = st.predWin, now = serverNow(), want = now < w.from - 200 ? 'ready' : now < w.until ? 'open' : 'done';
  const shown = document.querySelector('.predready') ? 'ready' : document.querySelector('.predpanel:not(.pp-out)') ? 'open' : 'done';
  const k = want + ':' + w.from + ':' + w.until;
  if (want !== shown && !(want === 'open' && shown === 'ready' && now < w.from) && predFixed !== k) { predFixed = k; render(); }   // once per step: never a redraw loop
}, 600);
let predFixed = '';
let predAwait = 0;
// the four calls you made before row 1, ticked off as each row is revealed
function myCallsStrip(cur) {
  const mine = st.myPreds; if (!mine || !mine.some((x) => x && x !== '-')) return '';
  const res = st.rowResults || [];
  return el('div', { class: 'mycalls' }, el('span', { class: 'mc-k' }, t('predCallsK')), el('div', { class: 'mc-list' }, ...mine.map((pk, r) => {
    const rr = res.find((x) => x.row === r), who = pk && pk !== '-' ? st.players.find((q) => q.id === pk) : null;
    const state = !who ? 'skip' : !rr ? (r === cur ? 'now' : 'wait') : rr.tie ? 'tie' : rr.losers.includes(pk) ? 'hit' : 'miss';
    return el('span', { class: 'mc ' + state, title: t('rowN', { n: r + 1 }) + ' · ' + (who ? who.name : t('predSkip')) },
      el('small', {}, String(r + 1)), who ? avatarEl(who.avatar, 24, '', who.acc, who.bd) : (() => { const i = el('i', { class: 'mc-skip', 'aria-label': t('predSkip') }); i.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="10.6" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.55)" stroke-width="1.4" stroke-dasharray="3 2.4"/><path d="M8.6 8.2v7.6l5.6-3.8z" fill="#cfd6e6"/><rect x="15" y="8.2" width="1.9" height="7.6" rx=".9" fill="#cfd6e6"/></svg>'; return i; })(),
      state === 'hit' ? el('b', { class: 'mc-s' }, icon('check', 10)) : state === 'miss' ? el('b', { class: 'mc-s' }, icon('x', 10)) : '');
  })));
}
// this round's points so far: every scored row's penalty plus the late point; a row whose strike is still flying is not counted yet
function roundPts(id) {
  let n = (st.latePen && st.latePen[id]) || 0;
  const rs = st.rowResults || [], last = rs.reduce((m, r) => Math.max(m, r.row), -1);
  for (const r of rs) if (!r.tie && r.losers.includes(id) && !(r.row === last && r.losers.some((x) => atkHeld.has(x)))) n += r.penalty;
  return n;
}
function stagePanel(active) {
  const row = Math.min(stageRow ?? st.currentRow ?? 0, 4);
  if (row >= 4) return finalPanel(active);
  const res = (st.rowResults || []).find((r) => r.row === row);
  const isCurrent = row === st.currentRow;
  const start = ROWS.slice(0, row).reduce((a, n) => a + n, 0), k = ROWS[row];
  const { cols, cw } = layoutFor(row, active.length);
  const tearNow = tearRows.has(row);
  const cellsOf = (p) => p.board.slice(start, start + k);
  const upOf = (p) => cellsOf(p).every((c) => c && c.up);
  const openedN = active.filter(upOf).length;
  const win = !res && isCurrent && st.predWin && active.length >= 2 ? st.predWin : null;
  predSchedule(win);
  // the last "ready" is shown at once, a beat before the server's reply carries the guessing window: that beat must not show the face-down cards
  const waitingWin = !win && !res && isCurrent && row === 0 && !st.predWin && !st.allReady && active.length >= 2 && active.every((p) => p.ready) && (predAwait = predAwait || Date.now(), Date.now() - predAwait < 6000);
  if (!waitingWin) predAwait = 0;
  const guessing = waitingWin || (!!win && serverNow() < win.until);   // nobody opens the row while guesses are being made
  const guessOpen = !waitingWin && !!win && serverNow() >= win.from - 200 && serverNow() < win.until;   // the picker appears already usable

  const dots = el('div', { class: 'sdots' });
  for (let r = 0; r < 4; r++) {
    const done = (st.rowResults || []).some((x) => x.row === r);
    dots.append(el('span', { class: 'sdot' + (done ? ' done' : '') + (r === row ? ' now' : '') }, String(r + 1)));
  }
  const head = el('div', { class: 'sthead' },
    el('div', {}, el('div', { class: 'kicker' }, t('stageRowOf', { n: row + 1 })), el('div', { class: 'strule' }, t('rule' + (row + 1)))),
    dots);

  // what happens next: the host opens the row, everyone else waits (or turns their own cards over)
  let control = '';
  if (res && (res.losers.some((id) => atkHeld.has(id)) || (res.tie && atkHeld.has('tie:' + res.row)))) {
    control = el('div', { class: 'stcontrol' }, el('div', { class: 'swait' }, el('span', { class: 'dot' })));   // the verdict waits for the creature
  } else if (res) {
    const names = loserNames(res);
    control = el('div', { class: 'stresult' + (res.tie ? ' tie' : '') },
      res.tie ? el('span', { class: 'tiechip' }, t('tie')) : el('span', { class: 'resk' }, t(names.length > 1 ? 'losers' : 'loser')),
      ...(res.tie ? [] : names.map((n) => el('span', { class: 'loserchip' }, n))),
      el('span', { class: 'grow' }),
      res.tie ? el('div', { class: 'rpen none' }, t('noPenalty')) : el('div', { class: 'rpen' }, '×' + res.penalty),
      ...(commentFor(res) ? [el('div', { class: 'stextra commentary' }, el('span', { class: 'cmic' }, '🎙️'), el('span', {}, commentFor(res)))] : []),
      ...(res.hits && res.hits.length ? [el('div', { class: 'stextra hitline' + ((res.hitIds || []).includes(st.meId) ? ' me' : '') }, t('cmCalled', { names: res.hits.join(', '), wp: res.wp || st.predWp || 3 }))] : []),
      ...(res.misses && res.misses.length ? [el('div', { class: 'stextra missline' }, t('cmMissed', { names: res.misses.join(', '), pen: st.predPen || 1 }))] : []));
    const hk = st.round + ':' + row;
    if ((res.hitIds || []).includes(st.meId) && !hitSeen.has(hk)) { hitSeen.add(hk); setTimeout(() => SND.play('chime'), 350); }
  } else if (isCurrent && !guessing) {   // while the guesses are being made the guessing panel says it all
    const drinkWait = lateDrinkPending() || (drinkPendingRow() >= 0 && drinkPendingRow() < row);
    control = el('div', { class: 'stcontrol' },
      st.isHost ? el('button', { class: 'big', disabled: guessing || drinkWait, onclick: () => act('flipRowAll', { row, up: true }) }, guessing ? t('predWaitHost') : drinkWait ? t('drinkHold') : t('stageHost', { n: row + 1 })) : el('div', { class: 'swait' }, el('span', { class: 'dot' }), drinkWait ? t('drinkHold') : t(guessing ? 'predWaitHost' : 'stageWaitHost')),
      el('div', { class: 'scount' }, t('openedN', { n: openedN, total: active.length })),
      );
  }

  const picks = res ? res.picks : isCurrent ? st.predPicks : null;   // who thinks who will lose
  const grid = el('div', { class: 'tiles', style: `grid-template-columns: repeat(${cols}, minmax(0, 1fr))` });
  const ordered = [...active].sort((a, b) => (b.id === st.meId) - (a.id === st.meId));   // you first
  ordered.forEach((p, idx) => {
    const mine = p.id === st.meId;
    const loseReal = !!res && !res.tie && res.losers.includes(p.id);
    const held = !!res && res.losers.some((id) => atkHeld.has(id));   // the creature is still on its way: nobody is marked yet, so nothing gives the loser away
    const lose = loseReal && !held;
    const safe = !!res && !res.tie && !loseReal && !held;
    const cells = cellsOf(p), allUp = upOf(p);
    const flipMine = () => act('flipRow', { row, up: !allUp });
    const cards = el('div', { class: 'tcards' });
    const tiers = tiersOf(row, cells.map((cell) => cell && cell.up && cell.c !== '?' ? cell.c : null));
    cells.forEach((cell, i) => {
      const vis = !!cell && cell.up && cell.c !== '?';
      const f = fx[p.id + ':' + (start + i)];
      const fxCls = f ? 'fx-' + f : '';
      const as = vis && res ? effOf(res, p.id, i) : null;   // a joker turns into its best card once the row is scored
      if (vis && lose) cards.append(tornCard(cell.c, tearNow, as, tearNow ? cascadeOf(active.length) : 0, res ? atkStyleOf(res) : ''));
      else if (vis) { const cn = cardEl(cell.c, { up: true, extra: fxCls, as, morph: !!as && tearNow, prime: tiers[i] }); if (f === 'flip') cn.style.animationDelay = Math.min(idx * CASCADE_STEP, CASCADE_MAX) + 'ms'; cards.append(cn); }
      else cards.append(cardEl(cell && cell.c !== '?' ? cell.c : '?', { up: false, extra: fxCls, onclick: mine && isCurrent && !res ? flipMine : null }));
    });
    const status = res
      ? (lose ? el('span', { class: 'tstat lost' }, icon('x', 12), t('lostTag')) : safe ? el('span', { class: 'tstat safe' }, icon('tick', 12), t('safeTag')) : el('span', { class: 'tstat wait pend', 'aria-label': '…' }, el('i'), el('i'), el('i')))
      : el('span', { class: 'tstat ' + (allUp ? 'open' : 'wait') }, ...(allUp ? [icon('tick', 12), t('openedState')] : [t('hiddenState')]));
    const voters = picks ? active.filter((q) => picks[q.id] === p.id) : [];
    // who called this player as the loser, and once the row is scored whether they were right
    const verdict = res && !res.tie ? (res.losers.includes(p.id) ? 'right' : 'wrong') : '';
    const votes = voters.length ? el('div', { class: 'tvotes ' + verdict, title: voters.map((q) => q.name).join(', ') }, el('span', { class: 'tvl' }, t('pickedBy')),
      el('span', { class: 'tvavs' }, ...voters.slice(0, 5).map((q) => el('span', { class: 'tvav' }, avatarEl(q.avatar, 20, '', q.acc, q.bd)))), voters.length > 5 ? el('span', { class: 'tvn' }, '+' + (voters.length - 5)) : '',
      verdict ? el('span', { class: 'tvv' }, icon(verdict === 'right' ? 'check' : 'x', 11), t(verdict === 'right' ? 'predRight' : 'predWrong')) : '') : '';
    grid.append(el('div', { class: 'tile' + (mine ? ' me' : '') + (lose ? ' lose' : '') + (safe ? ' safe' : '') + (screenAnim ? ' fx-in' : ''), style: screenAnim ? `animation-delay:${idx * 70}ms` : '' },
      el('div', { class: 'tname' }, avatarEl(p.avatar, 20, lose ? 'sad' : safe ? 'happy' : '', p.acc, p.bd), el('span', { class: 'tn' }, p.name + (mine ? t('you') : '')), p.isHost ? el('span', { class: 'tag' }, t('host')) : '', (() => { const n = roundPts(p.id); return el('span', { class: 'tpts' + (n ? ' some' : ''), title: t('tptsTip') }, ptsN(n)); })()),
      cards,
      votes,
      el('div', { class: 'tfoot' }, status,
        mine && isCurrent && !res ? el('button', { class: 'ghost tflip', disabled: guessing, onclick: flipMine }, allUp ? t('flipDown') : t('flipUp')) : '')));
  });

  [...grid.children].forEach((c, i) => { if (ordered[i]) c.dataset.pid = ordered[i].id; });
  return el('div', { class: 'panel stage' + (stageEnter ? ' stage-enter' : ''), style: `--cw:${cw}px` },
    head, control, guessing ? '' : myCallsStrip(row), guessing ? (guessOpen ? predPanel(active, row, win, true) : predReady()) : grid);   // the cards stay out of sight until the guessing is over
}

// after row 4: everyone's whole board, each row coloured by whether they lost it
function finalPanel(active) {
  const results = Object.fromEntries((st.rowResults || []).map((r) => [r.row, r]));
  const legend = el('div', { class: 'flegend' },
    el('span', { class: 'lg lost' }, t('legLost')), el('span', { class: 'lg safe' }, t('legSafe')), el('span', { class: 'lg tie' }, t('legTie')));
  const grid = el('div', { class: 'ftiles' });
  const ordered = [...active].sort((a, b) => (b.id === st.meId) - (a.id === st.meId));
  ordered.forEach((p, idx) => {
    let lostCount = 0;
    const rows = el('div', { class: 'frows' });
    for (let r = 0; r < 4; r++) {
      const res = results[r];
      const entry = res && res.entries.find((e) => e.id === p.id);
      const lose = !!res && !res.tie && res.losers.includes(p.id);
      if (lose) lostCount++;
      const cls = !res || res.tie ? 'tie' : lose ? 'lost' : 'safe';
      rows.append(el('div', { class: 'frow ' + cls },
        el('span', { class: 'fnum' }, String(r + 1)),
        el('span', { class: 'fcards' }, ...(entry ? (() => { const tr = tiersOf(r, entry.cards); return entry.cards.map((c, ci) => cardEl(c, { up: true, as: entry.as ? entry.as[ci] : null, prime: lose ? '' : tr[ci] })); })() : [])),
        el('span', { class: 'fmark' }, lose ? el('b', { class: 'iconlabel' }, icon('x', 12), '×' + res.penalty) : res && !res.tie ? icon('tick', 14) : '')));
    }
    grid.append(el('div', { class: 'ftile' + (p.id === st.meId ? ' me' : '') + (screenAnim ? ' fx-in' : ''), style: screenAnim ? `animation-delay:${idx * 80}ms` : '' },
      el('div', { class: 'tname' }, avatarEl(p.avatar, 20, '', p.acc, p.bd), el('span', { class: 'tn' }, p.name + (p.id === st.meId ? t('you') : '')), p.isHost ? el('span', { class: 'tag' }, t('host')) : ''),
      rows,
      el('div', { class: 'fsum' + (lostCount ? ' bad' : '') }, t('lostRows', { n: lostCount }))));
  });
  const hall = hallPanel(), recap = recapPanel();
  const det = el('details', { class: 'fdrop' }, el('summary', {}, el('span', { class: 'fd-t' }, t('finalTitle')), el('span', { class: 'fd-h' }, t('showBoard')), el('span', { class: 'fd-c' }, '▾')),
    el('div', { class: 'sthead' }, el('div', {}, el('div', { class: 'kicker' }, t('allDone'))), legend), grid);
  det.open = finalOpen;
  det.addEventListener('toggle', () => { finalOpen = det.open; det.querySelector('.fd-h').textContent = t(det.open ? 'hideBoard' : 'showBoard'); });
  if (finalOpen) det.querySelector('.fd-h').textContent = t('hideBoard');
  return el('div', { class: 'panel final' + (stageEnter ? ' stage-enter' : '') }, nextRoundBar(active), hall, recap, det);
}
// full-colour icons for the Ready button: a fan of two playing cards, then a glossy tick
const NB_SVG = {
  cards: '<defs><linearGradient id="nbc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#e9e3d6"/></linearGradient></defs><g transform="rotate(-14 13 22)"><rect x="4" y="6" width="15" height="21" rx="2.6" fill="url(#nbc)" stroke="#b9ae98" stroke-width=".9"/><path d="M11.5 12.2c1.6-2.6 4.6-1 3.2 1.3l-3.2 3.6-3.2-3.6c-1.4-2.3 1.6-3.9 3.2-1.3z" fill="#e0353b"/><text x="6.2" y="11" font-size="5" font-weight="800" fill="#e0353b" font-family="Inter,system-ui,sans-serif">A</text></g><g transform="rotate(12 19 22)"><rect x="13" y="5" width="15" height="21" rx="2.6" fill="url(#nbc)" stroke="#b9ae98" stroke-width=".9"/><path d="M20.5 10.6c-1.3 2.4-4.4 3.8-4.4 6.2 0 1.5 1.6 2.4 3.1 1.6l-.6 2.2h3.8l-.6-2.2c1.5.8 3.1-.1 3.1-1.6 0-2.4-3.1-3.8-4.4-6.2z" fill="#1d2233"/><text x="15.2" y="10" font-size="5" font-weight="800" fill="#1d2233" font-family="Inter,system-ui,sans-serif">K</text></g>',
  tick: '<defs><radialGradient id="nbt" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9f7e6"/></radialGradient></defs><circle cx="16" cy="16" r="13" fill="url(#nbt)"/><circle cx="16" cy="16" r="13" fill="none" stroke="#bff0d3" stroke-width="1"/><path d="M9.8 16.4l4.2 4.2 8.4-8.6" fill="none" stroke="#1f9a58" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="12" cy="10" rx="4.2" ry="2" fill="#fff" opacity=".7" transform="rotate(-30 12 10)"/>',
};
function nbIcon(on) { const w = el('span', { class: 'nbi' }); w.innerHTML = uniqSvg(`<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">${NB_SVG[on ? 'tick' : 'cards']}</svg>`); return w; }
// everyone taps Ready for another round; when the last one does, the next round is dealt (the host can still deal straight away from the top)
let nbSeen = { round: -1, ids: new Set() }, nbPressAt = 0;
// Ready can be tapped as often as anyone likes: only the final choice is sent, once taps have settled, one request at a time,
// and the phone keeps listening to the room meanwhile (nothing is queued, so the next round is never held back)
let nbWant = null, nbRound = -1, nbTimer = null, nbBusy = false;
function nbSend() {
  nbRound = st.round; clearTimeout(nbTimer);
  nbTimer = setTimeout(async () => {
    if (nbBusy || nbWant === null || !st || st.round !== nbRound) return;
    const want = nbWant; nbBusy = true;
    try { const j = await api('nextReady', { ready: want }); if (adopt(j)) safeRender(); } catch {}   // a late tap after the deal is simply dropped
    nbBusy = false;
    if (nbWant !== null && nbWant !== want && st && st.round === nbRound) nbSend();   // changed their mind while it was on its way
    else if (nbWant === want) nbWant = null;   // the room now says what we wanted
  }, 250);
}
function nextRoundBar(active) {
  const me = active.find((p) => p.id === st.meId); if (!me) return '';
  if (nbWant !== null && nbRound !== st.round) nbWant = null;   // a new round was dealt: forget any tap still settling
  const shown = (p) => (p.id === st.meId && nbWant !== null ? nbWant : p.nextReady);
  const n = active.filter(shown).length, mine = shown(me), pressAge = Date.now() - nbPressAt;   // the press keeps playing through the redraw the server's reply causes
  queueMicrotask(() => { nbSeen = { round: st.round, ids: new Set(active.filter(shown).map((p) => p.id)) }; });   // remembered after drawing, so only new arrivals celebrate
  return el('div', { class: 'nextbar' + (mine ? ' on' : '') },
    el('div', { class: 'nb-l' }, el('b', {}, t('nextT')), el('small', {}, el('b', { class: 'nb-n' }, t('nextN', { n, of: active.length })), ' · ', t('nextHint'))),
    el('div', { class: 'nb-avs' }, ...active.map((p) => { const r = shown(p), fresh = r && nbSeen.round === st.round && !nbSeen.ids.has(p.id); return el('span', { class: 'nb-av' + (r ? ' r' : '') + (fresh ? ' just' : ''), title: p.name }, avatarEl(p.avatar, 26, '', p.acc, p.bd), fresh ? el('i', { class: 'nb-spark' }) : ''); })),
    el('button', { type: 'button', class: 'nbbtn' + (mine ? ' on' : '') + (pressAge < 600 ? ' just' : ''), style: pressAge < 600 ? `animation-delay:-${pressAge}ms` : '', 'aria-pressed': String(!!mine), onclick: () => { nbPressAt = Date.now(); nbWant = !mine; nbRound = st.round; SND.play(mine ? 'unready' : 'ready'); buzz(15); render(); nbSend(); } }, nbIcon(mine), el('span', {}, mine ? t('nextIn') : t('nextBtn'))));
}
let finalOpen = false;

// a few story lines about the round that just finished
function recapPanel() {
  const res = st.rowResults || [], items = [];
  const nameOf = (id) => (st.players.find((q) => q.id === id) || {}).name || '?';
  const avatarOfId = (id) => avatarEl(avOf(id), 28, '', accOf(id), bdOf(id));
  const hits = [];
  for (const r of res) if (!r.tie && r.penalty > 0) for (const id of r.losers) hits.push({ id, pen: r.penalty, row: r.row + 1 });
  const top = hits.sort((a, b) => b.pen - a.pen)[0];
  if (top && top.pen > 1) items.push([avatarOfId(top.id), t('rcHit', { name: nameOf(top.id), n: top.pen, row: top.row })]);
  for (const r of res) { const e = r.entries.find((x) => x.as && x.cards.includes('JK')); if (e) { const ci = e.cards.indexOf('JK'); const c = e.as[ci]; items.push([avatarOfId(e.id), t('rcJoker', { name: e.name, card: c.slice(0, -1) + SUIT[c.slice(-1)], row: r.row + 1 })]); break; } }
  const lostBy = new Set(res.flatMap((r) => (r.tie ? [] : r.losers)));
  const clean = activePlayers().filter((p) => !lostBy.has(p.id));
  if (clean.length && clean.length < activePlayers().length) items.push([avatarOfId(clean[0].id), t('rcClean', { names: clean.map((p) => p.name).join(', ') })]);
  const perfect = res.flatMap((r) => (r.row === 2 ? r.entries.filter((e) => e.total === 10.5) : []));
  if (perfect.length) items.push([avatarOfId(perfect[0].id), t('rcPerfect', { name: perfect.map((e) => e.name).join(', ') })]);
  { const hitsBy = {}, callsBy = {}, wpBy = {}; for (const r of res) { for (const id of r.hitIds || []) { hitsBy[id] = (hitsBy[id] || 0) + 1; wpBy[id] = (wpBy[id] || 0) + (r.wp || st.predWp || 3); } if (!r.tie) for (const id of Object.keys(r.picks || {})) callsBy[id] = (callsBy[id] || 0) + 1; }
    const top = Object.entries(hitsBy).sort((a, b) => b[1] - a[1] || (callsBy[a[0]] || 0) - (callsBy[b[0]] || 0))[0];
    if (top) items.push([avatarOfId(top[0]), t('rcCaller', { name: nameOf(top[0]), n: top[1], of: callsBy[top[0]] || top[1], wp: wpBy[top[0]] })]); }
  const ties = res.filter((r) => r.tie).length;
  if (ties) items.push([icon('swap', 22), t('rcTies', { n: ties })]);
  if (!items.length) return '';
  const pnames = st.players.map((q) => q.name).sort((a, b) => b.length - a.length);
  const withNames = (txt) => { const out = []; let rest = txt; while (rest) { let at = -1, nm = ''; for (const n of pnames) { const i = rest.indexOf(n); if (i >= 0 && (at < 0 || i < at)) { at = i; nm = n; } } if (at < 0) { out.push(rest); break; } if (at) out.push(rest.slice(0, at)); out.push(el('b', { class: 'rcname' }, nm)); rest = rest.slice(at + nm.length); } return out; };   // every player's name picked out in gold
  return el('div', { class: 'recap' }, el('div', { class: 'kicker' }, t('recapTitle')), ...items.slice(0, 4).map(([ic, txt]) => el('div', { class: 'rcp' }, el('span', { class: 'rcp-i' }, ic), el('span', {}, ...withNames(txt)))));
}

// this round's ranking: the lowest total penalty over the four rows is on top (nothing carries over between rounds)
function hallPanel() {
  const res = st.rowResults || [];
  const list = activePlayers().map((p) => {
    let penalty = 0, lost = 0;
    for (const r of res) if (!r.tie && r.losers.includes(p.id)) { penalty += r.penalty; lost++; }
    penalty += (st.latePen && st.latePen[p.id]) || 0;   // the last to get ready (or arranged by the clock) carries a point
    return { id: p.id, name: p.name, penalty, lost, wins: p.wins || 0 };
  }).sort((a, b) => a.penalty - b.penalty || a.lost - b.lost || a.name.localeCompare(b.name));
  if (!list.length) return '';
  const medals = ['#ffcf40', '#cfd6e6', '#d99a63'];
  let rank = 0, prevKey = null;
  list.forEach((h, i) => { const key = h.penalty;   // the same points means the same place, exactly as the round win is decided
  if (key !== prevKey) rank = i + 1; prevKey = key; h.rank = rank; h.i = i; });
  const anim = screenAnim || stageEnter;   // entrance animations only play when this screen appears, not on every refresh
  const hd = anim && document.querySelector('.nextfx') ? 1.5 : 0;   // the "Final Board" banner is still crossing the screen: start once it has gone
  const won = (st.winners || []);
  const winBadge = (h) => won.includes(h.id) ? el('span', { class: 'winbadge' }, icon('trophy', 12), t('hallWin')) : '';
  const wpChip = (h) => st.placeWp && st.placeWp[h.id] ? el('span', { class: 'wpgain' }, '+' + st.placeWp[h.id] + ' WP') : '';
  const winsChip = (h) => h.wins ? el('span', { class: 'winscount', title: t('hallWins', { n: h.wins }) }, icon('trophy', 12), '×' + h.wins) : '';
  const mood = (h) => (won.includes(h.id) || h.rank === 1 ? 'happy' : h.i === list.length - 1 && list.length > 1 && h.penalty > list[0].penalty ? 'sad' : '');
  // the podium: 2nd - 1st - 3rd, blocks as tall as the finish
  let podium = '';
  if (list.length >= 2) {
    const top = list.slice(0, 3);
    const order = top.length === 3 ? [top[1], top[0], top[2]] : [top[1], top[0]];
    const heights = { 1: 86, 2: 62, 3: 44 };
    podium = el('div', { class: 'podium' + (anim ? ' anim' : '') }, ...order.map((h) => {
      const size = h.rank === 1 ? 54 : 44, r3 = Math.min(h.rank, 3);
      const node = el('div', { class: 'pd pd' + r3 + (h.id === st.meId ? ' me' : ''), 'data-pid': h.id },
        h === top[0] ? el('i', { class: 'pd-beam' }) : '',
        h === top[0] ? el('span', { class: 'pd-spark' }, ...[0, 1, 2, 3, 4].map(() => el('i'))) : '',
        h.rank === 1 ? el('span', { class: 'pd-crown' }, icon('trophy', 22)) : '',
        avatarEl(avOf(h.id), size, mood(h), accOf(h.id), bdOf(h.id)),
        el('b', { class: 'pd-n' }, h.name + (h.id === st.meId ? t('you') : '')),
        el('span', { class: 'pd-p' }, ptsN(h.penalty)),
        el('span', { class: 'pd-w' }, winBadge(h), winsChip(h), wpChip(h)),
        el('div', { class: 'pd-b', style: `height:${heights[r3]}px;background:linear-gradient(180deg,${medals[r3 - 1]},${['#c28a10', '#8d96ab', '#9a5f2e'][r3 - 1]})` }, el('span', {}, String(h.rank))));
      node.style.setProperty('--pdd', hd + [0.62, 0.3, 0][r3 - 1] + 's');   // third rises first, the winner last
      return node;
    }));
  }
  const rest = list.length >= 2 ? list.slice(3) : list;
  const rows = el('div', { class: 'hall' });
  rest.forEach((h, i) => {
    const me = h.id === st.meId;
    rows.append(el('div', { class: 'hrow' + (me ? ' me' : '') + (h.rank === 1 ? ' top' : ''), 'data-pid': h.id, style: anim ? `animation-delay:${hd + (podium ? 1.1 : 0) + i * 0.07}s` : 'animation:none' },
      el('span', { class: 'hrank', style: h.rank <= 3 ? `background:${medals[h.rank - 1]};color:#1a1407` : '' }, h.rank === 1 ? icon('trophy', 16) : String(h.rank)),
      el('span', { class: 'hav' }, avatarEl(avOf(h.id), 30, mood(h), accOf(h.id), bdOf(h.id))),
      el('span', { class: 'hname' }, el('b', {}, h.name + (me ? t('you') : '')), el('small', {}, t('hallLost', { n: h.lost }))),
      winBadge(h), winsChip(h), wpChip(h),
      el('span', { class: 'hpts' }, el('b', {}, ptsN(h.penalty)))));
  });
  const tie = st.winners && !st.winners.length && list.length > 1;   // a full tie: nobody earns a round win
  return el('div', { class: 'hallwrap' }, el('div', { class: 'sthead' }, el('div', {}, el('div', { class: 'kicker' }, t('hallSub', { n: st.round })), el('div', { class: 'strule iconlabel' }, icon('trophy', 22), t('hallTitle'))), el('button', { type: 'button', class: 'ghost sbbtn', onclick: openScoreboard }, withIcon('trophy', t('sbBtn'), 14))),
    podium, rest.length ? rows : '', tie ? el('p', { class: 'hallnote' }, t('hallTie')) : '');
}


let inviteOpen = false;   // the Invite dropdown (copy link / QR)
document.addEventListener('click', (e) => { if (inviteOpen && !(e.target.closest && e.target.closest('.invwrap'))) { inviteOpen = false; render(); } });
// everyone at the table, name under the avatar: a green ring means ready; tap somebody to throw a gift at them
let giftTarget = null;
// small drawn badges for last round's titles
const TITLE_SVG = {
  fire: '<defs><linearGradient id="tfa" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff4d1f"/><stop offset=".6" stop-color="#ffa21f"/><stop offset="1" stop-color="#ffe27a"/></linearGradient></defs><circle cx="10" cy="10" r="9.5" fill="#2a1408"/><path d="M10 3.2c.6 2.6 3.9 4 3.9 7.6a3.9 3.9 0 0 1-7.8 0c0-1.7.9-2.7 1.8-3.5.1 1.2.7 2 1.5 2.3-.4-2.2-.1-4.6.6-6.4z" fill="url(#tfa)"/><path d="M10 9.3c.4 1.2 1.7 1.8 1.7 3.2a1.7 1.7 0 0 1-3.4 0c0-1 .7-1.7 1.7-3.2z" fill="#fff3c4"/>',
  sniper: '<circle cx="10" cy="10" r="9.5" fill="#2b0b12"/><circle cx="10" cy="10" r="7" fill="#ff4d5e"/><circle cx="10" cy="10" r="5" fill="#fff"/><circle cx="10" cy="10" r="3" fill="#ff4d5e"/><circle cx="10" cy="10" r="1.2" fill="#fff"/><path d="M15.5 4.5l-5 5" stroke="#ffe27a" stroke-width="1.4" stroke-linecap="round"/><path d="M14.2 3.6l2.3.1-.1 2.3" fill="none" stroke="#ffe27a" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
  clean: '<defs><linearGradient id="tcl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ad0ff"/><stop offset="1" stop-color="#3a6bff"/></linearGradient></defs><circle cx="10" cy="10" r="9.5" fill="#0b1a33"/><path d="M10 3.4l5.2 2v4.1c0 3.2-2.2 5.6-5.2 6.9-3-1.3-5.2-3.7-5.2-6.9V5.4z" fill="url(#tcl)"/><path d="M7.4 9.9l1.8 1.8 3.5-3.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
};
function titleBadge(key, size = 18) {
  if (!TITLE_SVG[key]) return '';
  const w = el('span', { class: 'ttl', title: t('title_' + key), 'aria-label': t('title_' + key) }); w.style.width = w.style.height = size + 'px';
  w.innerHTML = uniqSvg(`<svg viewBox="0 0 20 20" width="100%" height="100%">${TITLE_SVG[key]}</svg>`);
  return w;
}
function rosterStrip() {
  const list = activePlayers();
  if (list.length < 1 || list.every((p) => p.ready) && Math.min(stageRow ?? st.currentRow ?? 0, 4) >= 4) return null;   // not on the Hall of Fame
  const canThrow = giftTotal() > 0;
  // balanced rows: as many per row as fit, then spread evenly (5 → one row of 5, 7 on a phone → 4 + 3, never 4 + 1)
  const rs = el('div', { class: 'rs', style: `--per:${Math.min(list.length, 5)}` });
  const fit = () => { const w = rs.clientWidth; if (!w) return; const max = Math.max(3, Math.floor((w + 2) / 66)), rows = Math.ceil(list.length / max); rs.style.setProperty('--per', Math.ceil(list.length / rows)); };
  if (window.ResizeObserver) new ResizeObserver(fit).observe(rs);
  rs.append(...list.map((p) => {
    const me = p.id === st.meId;
    const b = el('button', { type: 'button', class: 'rsp' + (p.ready ? ' ready' : '') + (me ? ' me' : '') + (canThrow && !me ? ' hit' : ''), 'data-pid': p.id, title: p.name + (p.ready ? ' · ' + t('pillReady') : ''),
      onclick: (e) => { if (me || !canThrow) return; e.stopPropagation(); giftTarget = p.id; giftPick = null; giftTrayOpen = true; syncEmoteUi(); } },
      el('span', { class: 'rsav' }, avatarEl(p.avatar, 40, '', p.acc, p.bd), titleBadge(p.title)),
      el('span', { class: 'rsn' }, p.name),
      el('span', { class: 'rsw' + (p.wins ? '' : ' zero'), title: t('hallWins', { n: p.wins || 0 }) }, icon('trophy', 11), '×' + (p.wins || 0)));
    return b;
  }));
  return rs;
}
