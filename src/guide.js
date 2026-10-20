// ---- "How to play": a paged guide with diagrams made from the game's own cards ----
const GUIDE_STEPS = 9;
let guideIdx = 0;

const gcards = (ids, extra = '') => el('div', { class: 'gcards ' + extra }, ...ids.map((c) => cardEl(c, { up: true })));
const gchip = (txt, cls = '') => el('span', { class: 'gchip ' + cls }, txt);
const gexample = (name, ids, tag, tagCls, note) => el('div', { class: 'gex ' + (tagCls || '') },
  el('div', { class: 'gex-n' }, name), gcards(ids), note ? el('div', { class: 'gex-v' }, note) : '', tag ? el('div', { class: 'gex-t ' + tagCls }, tag) : '');
const gscale = (hl, reverse) => {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  return el('div', { class: 'gscale' },
    el('div', { class: 'gscale-r' }, ...ranks.map((r) => el('span', { class: 'gr' + (r === hl ? ' hl' : '') }, r))),
    el('div', { class: 'gscale-a' }, el('span', {}, t('gLow')), el('i', {}), el('span', {}, t('gHigh'))));
};
const gpens = (items) => el('div', { class: 'gpens' }, ...items.map(([a, b]) => el('div', { class: 'gpen' }, el('span', {}, a), el('b', {}, b))));
const gslot = (ids) => el('div', { class: 'gslot' + (ids ? ' full' : '') }, ids ? cardEl(ids, { up: true }) : '');

function guideBody(i) {
  const wrap = el('div', { class: 'gbody' });
  const h = (k) => el('h3', {}, t(k)), p = (k) => el('p', {}, t(k));
  if (i === 0) {   // overview: the 1-1-2-3 layout
    const lay = el('div', { class: 'glayout' });
    [1, 1, 2, 3].forEach((n, r) => lay.append(el('div', { class: 'gl-row' },
      el('span', { class: 'gl-n' }, String(r + 1)),
      el('div', { class: 'gl-slots' }, ...Array.from({ length: n }, () => gslot())),
      el('div', { class: 'gl-t' }, el('b', {}, t('g_r' + (r + 1))), el('small', {}, t('gCards', { n }))))));
    wrap.append(h('g1t'), p('g1p'), lay);
  } else if (i === 1) {   // flow
    const steps = [['deal', 'g2a'], ['arrange', 'g2b'], ['ready', 'g2c'], ['reveal', 'g2d'], ['penalty', 'g2e']];
    wrap.append(h('g2t'), el('div', { class: 'gsteps' }, ...steps.map(([ic, k], n) => el('div', { class: 'gstep' }, el('span', { class: 'gf-i colorful' }, colorIcon(STEP_ICONS[ic], 42), el('span', { class: 'gst-n' }, String(n + 1))), el('div', { class: 'gst-t' }, el('b', {}, t(k)), el('small', {}, t('g2l' + (n + 1))))))));
  } else if (i === 2) {   // placing cards
    const slots = el('div', { class: 'gmini' }, el('div', { class: 'gslots r1' }, gslot('7H')), el('div', { class: 'gslots r1' }, gslot()), el('div', { class: 'gslots r2' }, gslot(), gslot()), el('div', { class: 'gslots r3' }, gslot(), gslot(), gslot()));
    const hand = el('div', { class: 'ghand' }, el('div', { class: 'ghand-l' }, t('gHand')), gcards(['KS', '3D', '9C']), el('div', { class: 'gtapmark iconlabel' }, icon('hand', 16), t('gTap')));
    wrap.append(h('g3t'), el('div', { class: 'gtapdemo' }, hand, el('span', { class: 'gbigarrow' }, '→'), slots),
      el('ul', { class: 'glist bullets' }, ...['g3a', 'g3b', 'g3c'].map((k) => el('li', {}, t(k)))));
  } else if (i === 3) {   // row 1
    wrap.append(h('g4t'), p('g4p'),
      el('div', { class: 'gexs' }, gexample('Ann', ['9D'], t('gSafe'), 'safe'), gexample('Bob', ['3C'], t('gLoses'), 'lose'), gexample('Cy', ['AS'], t('gSafe'), 'safe')),
      gscale('A'), el('p', { class: 'gnote' }, t('g4n')),
      gpens([[t('gNone', { what: 'Ace' }), '×1'], ['1 Ace', '×2'], ['2 Aces', '×4'], ['3 Aces', '×6']]));
  } else if (i === 4) {   // row 2
    wrap.append(h('g5t'), p('g5p'),
      el('div', { class: 'gexs' }, gexample('Ann', ['KH'], t('gLoses'), 'lose'), gexample('Bob', ['5C'], t('gSafe'), 'safe'), gexample('Cy', ['2D'], t('gSafe'), 'safe')),
      gscale('2'), el('p', { class: 'gnote' }, t('g5n')),
      gpens([[t('gNone', { what: '2' }), '×1'], ['1 × 2', '×2'], ['2 × 2', '×4'], ['3 × 2', '×6']]));
  } else if (i === 5) {   // row 3
    wrap.append(h('g6t'), p('g6p'),
      el('div', { class: 'gvals' }, gchip(t('g6v1')), gchip(t('g6v2')), gchip(t('g6v3'))),
      el('div', { class: 'gexs' }, gexample('Ann', ['10S', 'QH'], t('gPerfect'), 'perfect', '10 + 0.5 = 10.5'), gexample('Bob', ['9D', '5C'], t('gBust'), 'lose', '9 + 5 = 14'), gexample('Cy', ['AD', 'JC'], t('gSafe'), 'safe', '1 + 0.5 = 1.5')),
      el('p', { class: 'gnote' }, t('g6n')),
      gpens([[t('gNone', { what: '10.5' }), '×1'], ['1 × 10.5', '×2'], ['2 × 10.5', '×4'], ['3 × 10.5', '×6']]));
  } else if (i === 6) {   // row 4 ladder
    const rungs = [['none', ['2C', '5D', '9S'], ''], ['pair', ['7H', '7C', 'KD'], ''], ['straight', ['4S', '5H', '6D'], ''], ['flush', ['3H', '8H', 'KH'], '+2'],
      ['triple', ['9S', '9H', '9D'], '+3'], ['sflush', ['4S', '5S', '6S'], '+4'], ['royal', ['QD', 'KD', 'AD'], '+5']];
    const ladder = el('div', { class: 'gladder' });
    rungs.forEach(([k, ids, bonus], n) => ladder.append(el('div', { class: 'grung' }, el('span', { class: 'grung-n' }, String(n + 1)), el('div', { class: 'grung-l' }, t('gh_' + k)), gcards(ids), bonus ? el('span', { class: 'gbonus' }, bonus) : el('span', { class: 'gbonus none' }, '—'))));
    wrap.append(h('g7t'), p('g7p'),
      el('div', { class: 'gladder-wrap' }, el('div', { class: 'gl-end weak' }, el('b', {}, t('h7a')), ' ▼'), ladder, el('div', { class: 'gl-end strong' }, el('b', {}, t('h7b')), ' ▲')),
      el('p', { class: 'gnote' }, t('g7pen')), el('p', { class: 'gnote dim' }, t('g7note')));
  } else if (i === 7) {   // calling the losers, WP and the shop
    const demo = el('div', { class: 'pprow done gdemo' }, el('div', { class: 'pprh' }, el('b', {}, t('rowN', { n: 1 })), el('small', {}, t('rule1')), el('span', { class: 'ppskip' }, t('predSkip'))),
      el('div', { class: 'ppchips' }, ...[['Ann', 'panda'], ['Bob', 'frog'], ['Cy', 'owl']].map(([n, av], k) => el('span', { class: 'ppchip' + (k === 1 ? ' on' : '') }, avatarEl(av, 38), el('span', {}, n)))));
    wrap.append(h('gGt'), el('p', {}, t('gGp', { n: (st && st.settings && st.settings.predSec) || 15 })), demo,
      el('div', { class: 'ppodds' }, el('span', { class: 'po win' }, el('small', {}, t('predRight')), el('b', {}, '+3 WP')), el('span', { class: 'po lose' }, el('small', {}, t('predWrong')), el('b', {}, '−1 WP')), el('span', { class: 'po skip' }, el('small', {}, t('predSkip')), el('b', {}, '0'))),
      el('ul', { class: 'glist bullets' }, ...['gGa', 'gGb', 'gGc', 'gGd'].map((k) => el('li', {}, t(k)))));
  } else {   // good to know
    wrap.append(h('g8t'),
      el('div', { class: 'gtie' }, gexample('Ann', ['KS'], '', 'tie'), gexample('Bob', ['KH'], '', 'tie'), el('div', { class: 'gtie-r' }, gchip(t('tie'), 'tiechip'), gchip(t('noPenalty'), 'nop'))),
      el('div', { class: 'gjk' }, el('div', { class: 'gjk-t' }, el('b', {}, '★ ' + t('gjkT'))), el('p', { class: 'gnote' }, t('gjkP')),
        ...[['gjk1', ['JK'], ['AS']], ['gjk2', ['JK'], ['2S']], ['gjk3', ['5H', 'JK'], ['5H', '5S']], ['gjk4', ['9H', '10H', 'JK'], ['9H', '10H', '8H']]].map(([k, ids, as]) =>
          el('div', { class: 'gjk-r' }, el('div', { class: 'gjk-c' }, el('div', { class: 'gcards' }, ...ids.map((c) => cardEl(c, { up: true }))), el('span', { class: 'gjk-a' }, '→'), el('div', { class: 'gcards' }, ...ids.map((c, i) => cardEl(c, { up: true, as: c === 'JK' ? as[i] : null })))), el('span', { class: 'gjk-l' }, t(k))))),
      el('ul', { class: 'glist bullets' }, ...['g8a', 'g8b', 'g8c', 'g8d', 'g8f', 'g8e'].map((k) => el('li', {}, t(k)))),
      el('div', { class: 'flegend gleg' }, el('span', { class: 'lg lost' }, t('legLost')), el('span', { class: 'lg safe' }, t('legSafe')), el('span', { class: 'lg tie' }, t('legTie'))));
  }
  return wrap;
}

function renderGuide() {
  let ov = document.querySelector('.guide-ov.g-guide');
  if (!ov) return;
  const prev = ov.querySelector('.gscroll');
  const keepTop = prev ? prev.scrollTop : 0;
  ov.replaceChildren(el('div', { class: 'guide', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('guideTitle') },
    el('div', { class: 'ghead' }, el('div', { class: 'gtitle' }, el('b', {}, icon('book', 16)), t('guideTitle')),
      el('div', { class: 'langsw gl' }, ...[['en', 'EN'], ['zh', '简体'], ['zht', '繁體']].map(([l, label]) => { const b = el('button', { type: 'button', class: l === lang ? 'on' : '', onclick: () => setLang(l) }, label); b.dataset.l = l; return b; })),
      el('button', { class: 'ghost gx', 'aria-label': t('gClose'), onclick: closeGuide }, icon('x', 16))),
    el('div', { class: 'gscroll' }, guideBody(guideIdx)),
    el('div', { class: 'gfoot' },
      el('button', { class: 'ghost', disabled: guideIdx === 0, onclick: () => { guideIdx--; renderGuide(); ov.querySelector('.gscroll').scrollTop = 0; } }, '‹ ' + t('gBack')),
      el('div', { class: 'gdots' }, ...Array.from({ length: GUIDE_STEPS }, (_, n) => el('button', { class: 'gdot' + (n === guideIdx ? ' on' : ''), 'aria-label': String(n + 1), onclick: () => { guideIdx = n; renderGuide(); ov.querySelector('.gscroll').scrollTop = 0; } }))),
      guideIdx === GUIDE_STEPS - 1
        ? el('button', { onclick: closeGuide }, t('gDone'))
        : el('button', { onclick: () => { guideIdx++; renderGuide(); ov.querySelector('.gscroll').scrollTop = 0; } }, t('gNext') + ' ›'))));
  const sc = ov.querySelector('.gscroll'); if (sc && prev) sc.scrollTop = keepTop;
}

function openGuide(i = 0) {
  guideIdx = i;
  if (!document.querySelector('.guide-ov.g-guide')) {
    const ov = el('div', { class: 'guide-ov g-guide', onclick: (e) => { if (e.target === ov) closeGuide(); } });
    ov.close = closeGuide;
    document.body.append(ov);
    document.body.classList.add('noscroll');
  }
  renderGuide();
}
function closeGuide() { document.querySelector('.guide-ov.g-guide')?.remove(); if (!document.querySelector('.guide-ov')) document.body.classList.remove('noscroll'); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePlayers(); closeGuide(); } });



