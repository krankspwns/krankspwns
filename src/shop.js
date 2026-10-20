// ---- the shop: spend win points on accessories, special avatars and throwable gifts ----
let shopTab = 'av', shopBusy = null, shopBusyT = null, shopFlash = null, shopBusyN = 0;
function openShop(tab) {
  if (!session || !st) return;
  if (tab) shopTab = tab;
  if (document.querySelector('.shop-ov')) return;
  const close = () => { ov.remove(); if (!document.querySelector('.guide-ov')) document.body.classList.remove('noscroll'); };
  const ov = el('div', { class: 'guide-ov shop-ov', onclick: (e) => { if (e.target === ov) close(); } });
  ov.close = close;
  document.body.append(ov); document.body.classList.add('noscroll');
  renderShop();
}
function renderShop() {
  const ov = document.querySelector('.shop-ov'); if (!ov) return;
  const me = st && session ? st.players.find((q) => q.id === st.meId) : null, w = st && st.wallet;
  if (!me || !w) return ov.close();
  if (shopBusy) {   // the purchase has landed (or failed to): stop the spinner, and give a bought item a little pop
    const [bk, bkey] = shopBusy.split(':');
    const got = bk === 'gift' ? (w.gifts[bkey] || 0) > shopBusyN : (w.owned[bk] || []).includes(bkey);
    if (got) { shopFlash = shopBusy; shopBusy = null; clearTimeout(shopBusyT); setTimeout(() => { shopFlash = null; renderShop(); }, 900); SND.play('safe'); }
  }
  const sig = JSON.stringify([lang, shopTab, w, me.avatar, me.acc, me.bd, shopBusy, shopFlash]);
  if (ov.dataset.sig === sig) return;
  const keep = ov.querySelector('.shopscroll'), top = keep ? keep.scrollTop : 0;
  ov.dataset.sig = sig;
  const pr = st.prices;
  const buy = (kind, key, price, label) => {
    const busy = shopBusy === kind + ':' + key;
    return el('button', { type: 'button', class: busy ? 'busy' : '', 'aria-busy': String(busy), disabled: busy || !!shopBusy || w.pts < price, title: w.pts < price ? t('shopNeed', { n: price - w.pts }) : '',
      onclick: () => { shopBusy = kind + ':' + key; shopBusyN = kind === 'gift' ? (w.gifts[key] || 0) : 0; clearTimeout(shopBusyT); shopBusyT = setTimeout(() => { shopBusy = null; renderShop(); }, 6000); SND.play('ready'); renderShop(); act('buy', { kind, key }); } },
      ...(busy ? [el('i', { class: 'spin sm' }), t('shopBuying')] : [el('span', { class: 'buylbl' }, label || t('shopBuyLbl')), el('span', { class: 'pricepill' }, icon('trophy', 12, 'mono'), String(price))]));
  };
  const card = (own, pre, name, sub, btn, fk) => el('div', { class: 'shopitem' + (own ? ' own' : '') + (fk && shopFlash === fk ? ' flash' : '') }, el('div', { class: 'shoppre' }, pre), el('b', {}, name), sub ? el('small', {}, sub) : '', btn);
  let items = [], note = '';
  if (shopTab === 'acc') {
    note = t('shopAccNote');
    items = Object.keys(pr.acc).sort((a, b) => pr.acc[a] - pr.acc[b]).map((k) => {
      const own = w.owned.acc.includes(k), worn = me.acc === k;
      return card(own, avatarEl(me.avatar, 54, '', k, me.bd), t('acc_' + k), own ? (worn ? t('shopWearing') : t('shopOwned')) : t('wpN', { n: pr.acc[k] }),
        own ? el('button', { type: 'button', class: 'ghost', onclick: () => setMyAcc(worn ? '' : k) }, worn ? t('shopTakeOff') : t('shopWear')) : buy('acc', k, pr.acc[k]), 'acc:' + k);
    });
  } else if (shopTab === 'bd') {
    note = t('shopBdNote');
    items = [...BORDERS].sort((a, b) => pr.bd[a] - pr.bd[b]).map((k) => {
      const own = w.owned.bd.includes(k), worn = me.bd === k;
      return card(own, avatarEl(me.avatar, 54, '', me.acc, k), t('bd_' + k), own ? (worn ? t('shopWearing') : t('shopOwned')) : t('wpN', { n: pr.bd[k] }),
        own ? el('button', { type: 'button', class: 'ghost', onclick: () => setMyBd(worn ? '' : k) }, worn ? t('shopTakeOff') : t('shopWear')) : buy('bd', k, pr.bd[k]), 'bd:' + k);
    });
  } else if (shopTab === 'av') {
    note = t('shopAvNote');
    const avCard = (k) => {
      const own = w.owned.av.includes(k), using = me.avatar === k;
      return card(own, avatarEl(k, 58, '', me.acc, me.bd), t('av_' + k), own ? (using ? t('shopInUse') : t('shopOwned')) : t('wpN', { n: pr.av[k] }),
        own ? el('button', { type: 'button', class: 'ghost', disabled: using, onclick: () => setMyAvatar(k) }, using ? t('shopInUse') : t('shopUse')) : buy('av', k, pr.av[k]), 'av:' + k);
    };
    const byPrice = (keys) => [...keys].sort((a, b) => (pr.av[a] || 0) - (pr.av[b] || 0));   // cheapest first (a stable sort keeps the usual order within a price)
    items = [...byPrice(PREMIUM_KEYS).map(avCard), el('div', { class: 'shopsub legend' }, icon('zap', 14), t('shopLegend')), ...byPrice(LEGEND_KEYS).map(avCard)];
  } else {
    note = t('shopGiftNote', { n: pr.uses });
    items = [...GIFT_KEYS].sort((a, b) => (pr.gift[a] || 0) - (pr.gift[b] || 0)).map((k) => {   // cheapest first
      const left = w.gifts[k] || 0;
      return card(left > 0, giftEl(k, 60), t('gift_' + k), left > 0 ? t('giftLeft', { n: left }) : t('shopPack', { n: pr.uses }),
        buy('gift', k, pr.gift[k]), 'gift:' + k);   // throwing happens from the gift tray in the game
    });
  }
  const tabs = el('div', { class: 'shoptabs', role: 'tablist' }, ...[['av', t('shopTabAv')], ['bd', t('shopTabBd')], ['acc', t('shopTabAcc')], ['gift', t('shopTabGift')]].map(([k, label]) => el('button', { type: 'button', role: 'tab', class: k === shopTab ? 'on' : '', 'aria-selected': String(k === shopTab), onclick: () => { shopTab = k; renderShop(); } }, label)));
  const oldChip = ov.querySelector('.wpchip');   // kept across redraws so a roll in progress isn't cut short
  ov.replaceChildren(el('div', { class: 'guide setbox shopbox' + (keep ? ' still' : ''), role: 'dialog', 'aria-modal': 'true' },
    el('div', { class: 'ghead shophead' }, el('div', { class: 'gtitle' }, el('b', {}, shopIcon(18)), t('shopTitle')), el('span', { class: 'wpchip', title: t('shopPtsHint') }, icon('trophy', 14), el('span', { class: 'wpplain' }, t('wpN', { n: w.pts }))   /* plain text: the rolling digits could vanish on some browsers (Brave and Safari on iPhone) */), el('button', { class: 'ghost gx', 'aria-label': t('gClose'), onclick: ov.close }, icon('x', 16))),
    el('div', { class: 'gscroll shopscroll' }, tabs, el('p', { class: 'shopnote' }, note), el('div', { class: 'shopgrid' }, ...items)),
    el('div', { class: 'gfoot' }, el('span'), el('button', { onclick: ov.close }, t('qrClose')))));
  ov.querySelector('.shopscroll').scrollTop = top;
  if (oldChip) { const nc = ov.querySelector('.wpchip'); if (nc) nc.replaceWith(oldChip); }
  wpTo(w.pts);
}

