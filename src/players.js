// ---- player list: everyone can see it; the host can remove players ----
let kickBusy = null;   // a removal that has been sent and is waiting for the server
let renameId = null, renameDraft = '', renameErr = '';   // the name being edited in the player list
function startRename(p) { renameId = p.id; renameDraft = p.name; renameErr = ''; renderPlayers(); const i = document.querySelector('.pl-ov .rnin'); if (i) { i.focus(); i.select(); } }
function saveRename() {
  const p = st && st.players.find((q) => q.id === renameId);
  const name = Array.from(renameDraft.normalize('NFC').replace(/\s+/g, ' ').trim()).slice(0, NAME_MAX).join('').trim();
  if (!p) { renameId = null; return renderPlayers(); }
  if (!name) { renameErr = t('e_name'); return renderPlayers(); }
  if (st.players.some((q) => q.id !== p.id && q.name.toLowerCase() === name.toLowerCase())) { renameErr = t('e_taken'); return renderPlayers(); }
  renameId = null; renameErr = '';
  if (name !== p.name) {
    p.name = name;   // shows at once; the room catches up with the reply
    if (p.id === st.meId) { formName = name; try { localStorage.setItem('sct-name', name); } catch {} }
    act('rename', { target: p.id, name }); render();
  }
  renderPlayers();
}
let kickArm = null, kickTimer = null;   // two-step kick: first tap arms it, second confirms

// ---- the scoreboard as a 1080x1920 picture, the size of an Instagram Story ----
const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
// the three session awards, each with its own badge (viewBox 0 0 40 40)
const SB_AW = {
  sbMost: { col: '255,200,60', svg: '<defs><linearGradient id="awG1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#ffcf40"/><stop offset="1" stop-color="#c88a0a"/></linearGradient></defs><path d="M12 6h16v8a8 8 0 01-16 0z" fill="url(#awG1)" stroke="#8a5a00" stroke-width="1.2"/><path d="M12 8H7v3a6 6 0 006 6M28 8h5v3a6 6 0 01-6 6" fill="none" stroke="#e0a520" stroke-width="2.2" stroke-linecap="round"/><path d="M18 21.5h4v5h-4z" fill="#d9a020"/><path d="M13 27h14l1.5 5h-17z" fill="url(#awG1)" stroke="#8a5a00" stroke-width="1.2"/><path d="M20 9.2l1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4z" fill="#fff8d8"/><path d="M14.5 8.5c0 3 .5 5 2 6.5" stroke="rgba(255,255,255,.7)" stroke-width="1.4" fill="none" stroke-linecap="round"/>' },
  sbCaller: { col: '90,215,255', svg: '<defs><linearGradient id="awG2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8f6ff"/><stop offset="1" stop-color="#3aa8e0"/></linearGradient></defs><path d="M13 3l4 11h-6l-4-11zM27 3l-4 11h6l4-11z" fill="#ff5d8f"/><path d="M13 3l4 11h-3l-4-11zM27 3l-4 11h3l4-11z" fill="#c8336a"/><circle cx="20" cy="25" r="11" fill="url(#awG2)" stroke="#1d6d9a" stroke-width="1.3"/><circle cx="20" cy="25" r="7.6" fill="#fff"/><circle cx="20" cy="25" r="5.4" fill="#ff4d6a"/><circle cx="20" cy="25" r="3" fill="#fff"/><circle cx="20" cy="25" r="1.4" fill="#ff4d6a"/><path d="M31 13l-10.2 11.2" stroke="#2b2f45" stroke-width="1.6" stroke-linecap="round"/><path d="M31 13l3.4-.6-1.2 2.6-2.6.4zM31 13l.6-3.4-2.6 1.2-.4 2.6z" fill="#ffcf40"/>' },
  sbClean: { col: '110,220,150', svg: '<defs><linearGradient id="awG3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8ffd8"/><stop offset=".55" stop-color="#3ccf78"/><stop offset="1" stop-color="#16884a"/></linearGradient></defs><path d="M20 3l13 4.5v9.5c0 9-5.6 15.4-13 20-7.4-4.6-13-11-13-20V7.5z" fill="url(#awG3)" stroke="#0e6a37" stroke-width="1.3"/><path d="M20 6.5l10 3.4v7.2c0 7-4.2 12-10 15.8z" fill="rgba(255,255,255,.18)"/><path d="M13.5 19.5l4.5 4.5 8.5-9" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 9.5c0 4 .3 7 1.5 9" stroke="rgba(255,255,255,.6)" stroke-width="1.4" fill="none" stroke-linecap="round"/>' },
};
const awardEl = (k, size = 30) => { const d = document.createElement('span'); d.className = 'sbaw'; d.innerHTML = `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">${SB_AW[k].svg}</svg>`; return d; };
const svgImg = async (svgEl, size) => {
  const v = svgEl.cloneNode(true); v.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); v.setAttribute('width', size); v.setAttribute('height', size);
  const url = URL.createObjectURL(new Blob([v.outerHTML], { type: 'image/svg+xml' })); const im = await loadImg(url); setTimeout(() => URL.revokeObjectURL(url), 4000); return im;
};
const avatarImg = (key) => (LEGEND_KEYS.includes(key) ? loadImg('/avatars/' + key + '.webp') : svgImg(avatarEl(key, 160).querySelector('svg'), 160));
async function scoreboardImage(data) {
  const { list, rounds, most, caller, clean } = data, W = 1080, H = 1920;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  try { await document.fonts.ready; } catch {}
  const FONT = 'Inter, system-ui, -apple-system, sans-serif', f = (w, px) => `${w} ${px}px ${FONT}`;
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const fit = (txt, maxW) => { let s2 = String(txt); if (g.measureText(s2).width <= maxW) return s2; while (s2.length > 1 && g.measureText(s2 + '…').width > maxW) s2 = s2.slice(0, -1); return s2 + '…'; };
  const spaced = (txt, x, y, gap) => { const chars = [...txt], tot = chars.reduce((a, c) => a + g.measureText(c).width, 0) + gap * (chars.length - 1); let cx = x - tot / 2; g.textAlign = 'left'; for (const c of chars) { g.fillText(c, cx, y); cx += g.measureText(c).width + gap; } g.textAlign = 'center'; };
  const disc = (im, x, y, d, ring) => { g.save(); g.beginPath(); g.arc(x, y, d / 2, 0, 6.2832); g.closePath(); if (ring) { g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 16; g.fillStyle = '#1b2442'; g.fill(); g.shadowBlur = 0; } g.clip(); if (im) g.drawImage(im, x - d / 2, y - d / 2, d, d); g.restore(); if (ring) { g.strokeStyle = ring; g.lineWidth = Math.max(3, d * 0.05); g.beginPath(); g.arc(x, y, d / 2, 0, 6.2832); g.stroke(); } };
  const ims = new Map(); await Promise.all([...new Set(list.map((e) => e.p.avatar))].map(async (k) => ims.set(k, await avatarImg(k))));
  const awImgs = new Map(); await Promise.all(Object.keys(SB_AW).map(async (k) => { const d = document.createElement('div'); d.innerHTML = `<svg viewBox="0 0 40 40">${SB_AW[k].svg}</svg>`; awImgs.set(k, await svgImg(d.firstChild, 120)); }));
  const titles = new Map(); await Promise.all([...new Set(list.map((e) => e.p.title).filter((k) => TITLE_SVG[k]))].map(async (k) => { const d = document.createElement('div'); d.innerHTML = `<svg viewBox="0 0 20 20">${TITLE_SVG[k]}</svg>`; titles.set(k, await svgImg(d.firstChild, 60)); }));
  const icon = await loadImg('/icon-192.png');
  // background: deep navy, a gold glow from the top, faint card suits
  const bgg = g.createLinearGradient(0, 0, 0, H); bgg.addColorStop(0, '#18213f'); bgg.addColorStop(1, '#0a0f22'); g.fillStyle = bgg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, 260, 0, W / 2, 260, 760); glow.addColorStop(0, 'rgba(255,207,64,.30)'); glow.addColorStop(1, 'rgba(255,207,64,0)'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const hls = [['sbMost', most, most && '×' + most[0].p.wins], ['sbCaller', caller, caller && caller[0].x.hits + '/' + caller[0].x.calls], ['sbClean', clean, clean && String(clean[0].x.pen)]].filter((h) => h[1]);
  // the whole block is centred in the space above the footer; rows grow when there are only a few players
  const rowH = Math.min(150, Math.floor((list.length > 6 ? 940 : 820) / Math.max(1, list.length))), blockH = 250 + (hls.length ? 330 : 40) + 30 + list.length * rowH;
  const top = Math.max(120, Math.round((1700 - blockH) / 2));
  // faint card suits, only in the empty space below the table
  { const free0 = top + blockH + 40; if (1690 - free0 > 260) { g.fillStyle = 'rgba(255,255,255,.035)'; g.font = f(400, Math.min(380, 1690 - free0)); g.textBaseline = 'bottom'; g.fillText('♠', 170, 1700); g.fillText('♣', 920, 1700); g.textBaseline = 'alphabetic'; } }
  // heading
  g.fillStyle = 'rgba(255,226,140,.9)'; g.font = f(800, 32); spaced('CROWN CLASH', W / 2, top + 40, 14);
  const tg = g.createLinearGradient(0, top + 70, 0, top + 170); tg.addColorStop(0, '#fff6d8'); tg.addColorStop(1, '#ffcf57'); g.fillStyle = tg; g.font = f(900, 92); g.shadowColor = 'rgba(255,190,60,.45)'; g.shadowBlur = 30; g.fillText(fit(t('sbTitle'), 980), W / 2, top + 152); g.shadowBlur = 0;
  g.fillStyle = 'rgba(255,255,255,.7)'; g.font = f(500, 34); g.fillText(fit(t('room') + ' ' + st.code + '  ·  ' + t('sbRounds', { n: rounds }) + '  ·  ' + new Date().toLocaleDateString(), 980), W / 2, top + 220);
  let y = top + 280;
  if (hls.length) {
    const gap = 24, cw = (W - 120 - gap * (hls.length - 1)) / hls.length, ch = 270;
    hls.forEach(([k, es, v], i) => {
      const x = 60 + i * (cw + gap), ac = SB_AW[k].col; rr(x, y, cw, ch, 32); const cg = g.createLinearGradient(x, y, x + cw, y + ch); cg.addColorStop(0, `rgba(${ac},.2)`); cg.addColorStop(.7, 'rgba(255,255,255,.04)'); g.fillStyle = cg; g.fill(); g.strokeStyle = `rgba(${ac},.6)`; g.lineWidth = 2.5; g.stroke();
      const aw = awImgs.get(k); if (aw) g.drawImage(aw, x + cw - 70, y + 14, 56, 56);
      const d = 104, cx = x + cw / 2; es.forEach((e, j) => disc(ims.get(e.p.avatar), cx + (j - (es.length - 1) / 2) * 80, y + 82, d, '#ffcf40'));
      g.fillStyle = `rgb(${ac})`; g.font = f(800, 24); g.fillText(fit(t(k).toUpperCase(), cw - 30), cx, y + 172);
      g.fillStyle = '#fff'; g.font = f(800, 36); g.fillText(fit(es.map((e) => e.p.name).join(' & '), cw - 30), cx, y + 216);
      g.fillStyle = 'rgba(255,255,255,.7)'; g.font = f(600, 30); g.fillText(v, cx, y + 254);
    });
    y += ch + 60;
  } else y += 40;
  // the table
  const colX = [600, 718, 838, 958], head = [t('sbWins'), (drinkOn() ? t('sbDrinks') : t('sbPen')), t('sbCalls'), t('sbWp')];
  g.font = f(800, 22); g.fillStyle = 'rgba(255,255,255,.55)'; head.forEach((h2, i) => g.fillText(fit(h2.toUpperCase(), 116), colX[i], y)); g.textAlign = 'left'; g.fillText(t('sbPlayer').toUpperCase(), 236, y); g.textAlign = 'center';
  y += 26;
  const medals = ['#ffcf40', '#cfd6e6', '#d99a63'];
  list.forEach((e, i) => {
    const ry = y + i * rowH, hgt = rowH - 12, mid = ry + hgt / 2;
    rr(50, ry, W - 100, hgt, 24);
    if (e.rank === 1 && rounds) { const lg = g.createLinearGradient(50, 0, W - 50, 0); lg.addColorStop(0, 'rgba(255,207,64,.24)'); lg.addColorStop(1, 'rgba(255,255,255,.05)'); g.fillStyle = lg; } else g.fillStyle = 'rgba(255,255,255,.05)';
    g.fill(); if (e.p.id === st.meId) { g.strokeStyle = 'rgba(255,207,64,.85)'; g.lineWidth = 3; g.stroke(); }
    const rd = Math.min(56, hgt * 0.62); g.beginPath(); g.arc(102, mid, rd / 2, 0, 6.2832); g.fillStyle = e.rank <= 3 && rounds ? medals[e.rank - 1] : 'rgba(255,255,255,.12)'; g.fill();
    g.fillStyle = e.rank <= 3 && rounds ? '#1a1407' : '#fff'; g.font = f(900, rd * 0.5); g.textBaseline = 'middle'; g.fillText(String(e.rank), 102, mid + 1);
    const ad = Math.min(76, hgt * 0.78); disc(ims.get(e.p.avatar), 180, mid, ad, 'rgba(255,255,255,.25)');
    g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = f(800, Math.min(40, hgt * 0.46)); const nm = fit(e.p.name, e.p.title ? 260 : 300); g.fillText(nm, 236, mid + 1);
    const tim = titles.get(e.p.title), ts = Math.min(36, hgt * 0.5); if (tim) g.drawImage(tim, 236 + g.measureText(nm).width + 10, mid - ts / 2, ts, ts);
    g.textAlign = 'center';
    [String(e.p.wins || 0), String(e.x.pen), e.x.hits + '/' + e.x.calls, String(e.p.wp ?? 0)].forEach((v, k) => { let px = Math.min(42, hgt * 0.48); g.font = f(800, px); while (g.measureText(v).width > 106 && px > 20) { px -= 2; g.font = f(800, px); } g.fillStyle = k === 3 ? '#ffd56b' : '#fff'; g.fillText(v, colX[k], mid + 1); });   // shrinks to fit its column, never over the row's edge
    g.textBaseline = 'alphabetic';
  });
  // footer: the app icon and where to play
  const fy = 1800; if (icon) { g.save(); rr(W / 2 - 250, fy - 46, 92, 92, 22); g.clip(); g.drawImage(icon, W / 2 - 250, fy - 46, 92, 92); g.restore(); }
  g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = f(800, 34); g.fillText(fit(t('sbPlay'), 380), W / 2 - 140, fy - 4); g.fillStyle = 'rgba(255,226,140,.85)'; g.font = f(600, 28); g.fillText(fit(location.hostname.endsWith('.vercel.app') ? PUBLIC_HOST : location.host, 380), W / 2 - 140, fy + 36);
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}
async function shareScoreboard(btn, ready) {
  btn.disabled = true;
  try {
    const blob = await ready; if (!blob) throw new Error('no image');
    const file = new File([blob], 'ror-scoreboard.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); } catch {} return; }   // the phone's share sheet: Instagram is there, then pick Story
    const url = URL.createObjectURL(blob), a = el('a', { href: url, download: 'ror-scoreboard.png' }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 8000);
    toast(t('sbSaved'));
    if (/Android|iPhone|iPad/i.test(navigator.userAgent)) setTimeout(() => { location.href = 'instagram://story-camera'; }, 900);   // no share sheet: save the picture, then open Instagram's story camera
  } catch { toast(t('sbShareFail')); } finally { btn.disabled = false; }
}
// the whole session at a glance, made to be screenshotted and shared
function openScoreboard() {
  if (!st || document.querySelector('.sb-ov')) return;
  const close = () => { ov.remove(); if (!document.querySelector('.guide-ov')) document.body.classList.remove('noscroll'); };
  const blank = { rounds: 0, pen: 0, rows: 0, hits: 0, calls: 0, streak: 0, best: 0 };
  const list = st.players.map((p) => ({ p, x: p.sess || blank })).sort((a, b) => (b.p.wins || 0) - (a.p.wins || 0) || a.x.pen - b.x.pen || b.x.hits - a.x.hits || a.p.name.localeCompare(b.p.name));
  const rounds = Math.max(0, ...list.map((e) => Math.max(e.x.rounds, e.p.wins || 0)));
  let rank = 0, prev = null; list.forEach((e, i) => { const k = (e.p.wins || 0) + ':' + e.x.pen; if (k !== prev) rank = i + 1; prev = k; e.rank = rank; });
  // a highlight goes to the best player, or is shared by two; a bigger tie shows nothing
  const pickTop = (score, ok) => { const c = list.filter((e) => e.x.rounds && ok(e)); if (!c.length) return null; const top = Math.max(...c.map(score)), all = c.filter((e) => score(e) === top); return all.length > 2 ? null : all; };
  const most = pickTop((e) => e.p.wins || 0, (e) => e.p.wins > 0), caller = pickTop((e) => e.x.hits * 100 - e.x.calls, (e) => e.x.hits > 0), clean = list.filter((e) => e.x.rounds).length > 1 ? pickTop((e) => -e.x.pen / e.x.rounds, () => true) : null;
  const hl = (k, es, v) => es ? el('div', { class: 'sbh', style: `--awc:${SB_AW[k].col}` }, awardEl(k, 30), el('span', { class: 'sbhav' }, ...es.map((e) => avatarEl(e.p.avatar, 30, 'happy', e.p.acc, e.p.bd))), el('div', {}, el('small', {}, t(k)), el('b', {}, es.map((e) => e.p.name).join(' & ')), el('em', {}, v))) : '';
  const medals = ['#ffcf40', '#cfd6e6', '#d99a63'];
  const rows = list.map((e) => el('div', { class: 'sbr' + (e.p.id === st.meId ? ' me' : '') + (e.rank === 1 && rounds ? ' top' : '') },
    el('span', { class: 'sbrk', style: e.rank <= 3 && rounds ? `background:${medals[e.rank - 1]};color:#1a1407` : '' }, String(e.rank)),
    avatarEl(e.p.avatar, 28, '', e.p.acc, e.p.bd),
    el('span', { class: 'sbn' }, el('b', {}, e.p.name), titleBadge(e.p.title, 15)),
    el('span', { class: 'sbv' }, String(e.p.wins || 0)), el('span', { class: 'sbv' }, String(e.x.pen)), el('span', { class: 'sbv' }, e.x.hits + '/' + e.x.calls), el('span', { class: 'sbv wp' }, String(e.p.wp ?? 0))));
  const d = new Date();
  const box = el('div', { class: 'avbox sbbox' + (list.length > 7 ? ' many' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': t('sbTitle') },
    el('div', { class: 'sb-k' }, 'CROWN CLASH'),
    el('div', { class: 'sb-t' }, t('sbTitle')),
    el('div', { class: 'sb-sub' }, t('room') + ' ' + st.code + ' · ' + t('sbRounds', { n: rounds }) + ' · ' + d.toLocaleDateString()),
    rounds ? el('div', { class: 'sbhl' }, hl('sbMost', most, most ? '×' + most[0].p.wins : ''), hl('sbCaller', caller, caller ? caller[0].x.hits + '/' + caller[0].x.calls : ''), hl('sbClean', clean, clean ? String(clean[0].x.pen) : '')) : el('p', { class: 'leavep' }, t('sbEmpty')),
    el('div', { class: 'sbtab' }, el('div', { class: 'sbr hd' }, el('span'), el('span'), el('span', { class: 'sbn' }, t('sbPlayer')), el('span', { class: 'sbv' }, t('sbWins')), el('span', { class: 'sbv' }, (drinkOn() ? t('sbDrinks') : t('sbPen'))), el('span', { class: 'sbv' }, t('sbCalls')), el('span', { class: 'sbv' }, t('sbWp'))), ...rows),
    el('div', { class: 'sbfoot' }, (() => { const b = el('button', { type: 'button', class: 'igshare', onclick: () => shareScoreboard(b, ready) }, (() => { const i = el('span', { class: 'igring' }); i.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="4.4 2.6" transform="rotate(-80 12 12)"/><path d="M12 7.6v8.8M7.6 12h8.8" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>'; return i; })(), t('sbShare')); return b; })(), el('button', { type: 'button', class: 'ghost', onclick: close }, t('qrClose'))));
  const ready = scoreboardImage({ list, rounds, most, caller, clean }).catch(() => null);   // drawn straight away, so the share sheet opens the moment the button is tapped
  const ov = el('div', { class: 'guide-ov sb-ov', onclick: (e) => { if (e.target === ov) close(); } }, box);
  document.body.append(ov); document.body.classList.add('noscroll');
}
function openPlayers() {
  if (document.querySelector('.pl-ov')) return;
  const ov = el('div', { class: 'guide-ov pl-ov', onclick: (e) => { if (e.target === ov) closePlayers(); } });
  ov.close = closePlayers;
  document.body.append(ov);
  document.body.classList.add('noscroll');
  renderPlayers();
}
function closePlayers() { document.querySelector('.pl-ov')?.remove(); if (!document.querySelector('.guide-ov')) document.body.classList.remove('noscroll'); kickArm = null; clearTimeout(kickTimer); }

// a player's shop items as small thumbnails: accessories, borders, special characters and gifts left
function playerInv(p) {
  const v = p.inv; if (!v) return '';
  const th = (node, name) => { const w = el('span', { class: 'invth', title: name }, node); return w; };
  const items = [
    ...v.av.map((k) => th(avatarEl(k, 26), t('av_' + k))),
    ...v.acc.map((k) => th(avatarEl(p.avatar, 26, '', k), t('acc_' + k))),
    ...v.bd.map((k) => th(avatarEl(p.avatar, 26, '', '', k), t('bd_' + k))),
    ...Object.entries(v.gifts).map(([k, n]) => th(el('span', { class: 'invgift' }, giftEl(k, 22), el('i', {}, '×' + n)), t('gift_' + k))),
  ];
  return items.length ? el('div', { class: 'pinv' }, ...items) : el('div', { class: 'pinv none' }, t('invNoItems'));
}
function renderPlayers() {
  const ov = document.querySelector('.pl-ov');
  if (!ov || !st) return;
  const rows = st.players.map((p) => {
    const me = p.id === st.meId;
    const status = p.spectator ? el('span', { class: 'pill wait' }, t('observing'))
      : st.phase === 'lobby' ? el('span', { class: 'tag joined' }, t('joined'))
      : p.ready ? el('span', { class: 'pill go' }, icon('tick', 13), t('plReady')) : pill(p);
    const canKick = st.isHost && !me;
    const armed = kickArm === p.id;
    const presence = st.isHost && p.online !== undefined && !me
      ? el('span', { class: 'pdot ' + (p.online ? 'on' : 'off') }, p.online ? t('online') : t('offlineAgo', { n: p.seenAgo ?? '?' })) : '';
    const relBtn = canKick ? el('button', { class: 'relbtn' + (p.released ? ' on' : ''), title: t(p.released ? 'relUndoTip' : 'relTip', { name: p.name }), onclick: () => { p.released = !p.released; renderPlayers(); act('release', { target: p.id, on: p.released }); } }, withIcon('swap', t(p.released ? 'relUndo' : 'relBtn'), 14)) : '';
    return el('div', { class: 'prow' + (p.online === false ? ' offline' : '') + (p.released ? ' released' : '') },
      me
        ? editableAvatar(p.avatar, 40, setMyAvatar, p.acc, p.bd)
        : avatarEl(p.avatar, 40, '', p.acc, p.bd),
      el('div', { class: 'pinfo' },
        renameId === p.id
          ? el('form', { class: 'rnform', onsubmit: (e) => { e.preventDefault(); saveRename(); } },
              el('input', { class: 'rnin', value: renameDraft, maxlength: 24, enterkeyhint: 'done', autocomplete: 'off', 'aria-label': t('renameTip'),
                oninput: (e) => { renameDraft = Array.from(e.target.value).slice(0, NAME_MAX).join(''); if (e.target.value !== renameDraft) e.target.value = renameDraft; },
                onkeydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); renameId = null; renderPlayers(); } } }),
              el('button', { type: 'submit', class: 'rnok', 'aria-label': t('renameSave') }, icon('tick', 16)),
              el('button', { type: 'button', class: 'rnx', 'aria-label': t('gClose'), onclick: () => { renameId = null; renderPlayers(); } }, icon('x', 15)))
          : el('div', { class: 'pname' }, el('span', { class: 'pnm' }, p.name + (me ? t('you') : '')),
              (me || st.isHost) ? el('button', { type: 'button', class: 'rnbtn', title: t('renameTip'), 'aria-label': t('renameTip'), onclick: () => startRename(p) }, icon('edit', 14)) : '',
              p.isHost ? el('span', { class: 'tag' }, t('host')) : ''),
        renameId === p.id && renameErr ? el('div', { class: 'rnerr' }, renameErr) : '',
        p.released ? el('div', { class: 'relnote' }, t('relNote', { name: p.name })) : '',
        el('div', { class: 'ptags' }, status, presence, el('span', { class: 'wpchip sm', title: t('shopPtsHint') }, icon('trophy', 12), t('wpN', { n: p.wp || 0 }))),
        playerInv(p)),
      canKick ? el('div', { class: 'pacts' }, relBtn, kickBusy === p.id
        ? el('button', { class: 'kickbtn armed busy', disabled: true }, el('i', { class: 'spin' }), t('kickWorking'))
        : el('button', { class: 'kickbtn' + (armed ? ' armed' : ''), onclick: () => {
            if (armed) { kickArm = null; clearTimeout(kickTimer); kickBusy = p.id; renderPlayers(); setTimeout(() => { if (kickBusy === p.id) { kickBusy = null; if (document.querySelector('.pl-ov')) renderPlayers(); } }, 7000); act('kick', { target: p.id }); }
            else { kickArm = p.id; clearTimeout(kickTimer); kickTimer = setTimeout(() => { kickArm = null; renderPlayers(); }, 4000); renderPlayers(); }
          } }, withIcon('user-x', armed ? t('kickSure') : t('kick'), 15))) : '');
  });
  rows.forEach((r, i) => { r.dataset.pid = st.players[i].id; });
  const keep = ov.querySelector('.gscroll')?.scrollTop || 0;
  const typing = document.activeElement && document.activeElement.classList.contains('rnin') ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;   // a room update must not steal the name being typed
  ov.replaceChildren(el('div', { class: 'guide pl', role: 'dialog', 'aria-modal': 'true' },
    el('div', { class: 'ghead' }, el('div', { class: 'gtitle' }, el('b', {}, icon('users', 15)), t('playersTitle', { n: st.players.length })),
      el('button', { class: 'ghost gx', 'aria-label': t('gClose'), onclick: closePlayers }, icon('x', 16))),
    el('div', { class: 'gscroll' }, el('div', { class: 'plist' }, ...rows), el('p', { class: 'plhint' }, st.isHost ? t('kickHint') : t('hostOnlyHint'))),
    el('div', { class: 'gfoot' }, el('button', { type: 'button', class: 'ghost', onclick: () => { closePlayers(); openScoreboard(); } }, withIcon('trophy', t('sbBtn'))), el('button', { onclick: closePlayers }, t('gClose')))));
  const sc = ov.querySelector('.gscroll'); if (sc) sc.scrollTop = keep;
  const rin = typing && ov.querySelector('.rnin'); if (rin) { rin.focus({ preventScroll: true }); try { rin.setSelectionRange(typing[0], typing[1]); } catch {} }
}


function showRound(n) {
  document.querySelector('.roundfx')?.remove();
  const o = el('div', { class: 'roundfx' }, el('div', { class: 'rf-glow' }), el('div', { class: 'rf-box' }, el('div', { class: 'rf-k' }, t('roundK')), el('div', { class: 'rf-n', 'data-n': String(n) }, String(n)), el('i', { class: 'rf-line' })));
  document.body.append(o);
  window.scrollTo(0, 0);   // a new round starts at the top, instead of landing wherever the old screen was scrolled to
  setTimeout(() => o.remove(), 3900);
}

function toast(msg, cls = '') {
  if (cls) document.querySelectorAll('.toast.' + cls).forEach((n) => n.remove());
  const t = el('div', { class: 'toast ' + (cls || 'main') }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), cls === 'low' ? 1600 : 3300);
}

function diffFx(prev, next) {
  if (next.players.some((p) => p.id !== next.meId && !prev.players.some((x) => x.id === p.id))) SND.play('join');
  if (prev.players.some((p) => p.id !== next.meId && !next.players.some((x) => x.id === p.id))) SND.play('leave');
  if (prev.phase === 'dealt' && next.phase === 'dealt') {
    next.players.filter((p) => !prev.players.some((x) => x.id === p.id)).forEach((p) => toast(t('toastJoin', { name: p.name })));
    prev.players.filter((p) => !next.players.some((x) => x.id === p.id)).forEach((p) => toast(t('toastLeft', { name: p.name })));
  }
  for (const p of next.players) {
    const pp = prev.players.find((x) => x.id === p.id);
    if (!pp) { newSeats.add(p.id); continue; }
    for (let i = 0; i < p.board.length; i++) {
      const a = face(prev, pp, pp.board[i]), b = face(next, p, p.board[i]);
      if (a === b || !b && a) continue;
      if (!a) fx[p.id + ':' + i] = 'pop';
      else if (a === '#' || b === '#') fx[p.id + ':' + i] = 'flip';
      else fx[p.id + ':' + i] = 'pop';
    }
  }
}

