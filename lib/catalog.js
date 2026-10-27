// Shared WP economy and shop catalogue: used by every game and by the account service.
// Prices are in WP. Free animals are never sold; only the keys below can be bought.
const AVATARS = ['cat', 'dog', 'fox', 'bear', 'panda', 'rabbit', 'frog', 'lion', 'pig', 'koala', 'owl', 'tiger', 'penguin', 'monkey', 'elephant', 'mouse', 'chicken', 'cow', 'dino', 'unicorn'];
const ACC_PRICE = { hat: 10, shades: 20, mustache: 20, flower: 20, headphones: 30, horns: 30, crown: 40, halo: 50 };
const PREMIUM = { dragon: 30, robot: 30, alien: 30, ghost: 30, wizard: 40, ninja: 40, phoenix: 150, shadowphoenix: 200, moonwolf: 150, samurai: 150, thundertiger: 150, goldlion: 200, reaper: 200 };
const GIFTS = { tomato: 10, rose: 10, snowball: 10, popper: 10, balloon: 10, kiss: 10, pie: 15, ghost: 15, rocket: 20, bomb: 20, zap: 20, fireworks: 25, disco: 25, cash: 25 };
const BORDER_PRICE = { silver: 15, gold: 20, emerald: 20, ice: 25, neon: 30, royal: 30, fire: 40, rainbow: 50 };
const EMOTES = ['laugh', 'wow', 'cry', 'cool', 'fire', 'gg', 'ez', 'gl', 'wp', 'rip', 'angry', 'think', 'heart', 'trophy', 'oof', 'faster', 'aiyo', 'steady'];
const GIFT_USES = 3;   // one purchase = three throws
const START_WP = 25;   // every room player (and every new account, once) starts with a little to spend
// the top three of a game earn WP, more at a bigger table: 1st gets 10 at up to 3 players and 5 more for every 3 players after that
const placeWpFor = (n) => { const first = 5 + 5 * Math.ceil(Math.max(n, 1) / 3); return [first, first - 5, first - 10].map((v) => Math.max(v, 0)); };
const predWpFor = (n) => Math.max(n, 2);
const PRICES = { av: PREMIUM, bd: BORDER_PRICE, acc: ACC_PRICE, gift: GIFTS };
const KINDS = ['av', 'bd', 'acc', 'gift'];
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const emptyWallet = (pts = 0) => ({ pts, owned: { av: [], bd: [], acc: [] }, gifts: {}, eq: { av: '', bd: '', acc: '' } });

// Pure wallet rules, shared by account wallets and guest (in-room) wallets. They throw { status, message }.
const fail = (status, message) => Object.assign(Error(message), { status });
function buyInto(w, kind, key) {
  if (!KINDS.includes(kind) || !own(PRICES[kind], key)) throw fail(400, 'That item is not for sale.');
  const price = PRICES[kind][key];
  if (kind === 'gift') {
    if ((w.gifts[key] || 0) + GIFT_USES > 99) throw fail(409, 'That is plenty already.');
    if (w.pts < price) throw fail(409, 'Not enough WP.');
    w.pts -= price; w.gifts[key] = (w.gifts[key] || 0) + GIFT_USES; return w;
  }
  if (w.owned[kind].includes(key)) throw fail(409, 'You already own that.');
  if (w.pts < price) throw fail(409, 'Not enough WP.');
  w.pts -= price; w.owned[kind].push(key); return w;
}
function equipInto(w, kind, key) {
  if (!['av', 'bd', 'acc'].includes(kind)) throw fail(400, 'You cannot wear that.');
  if (key === '' || key === null || key === undefined) { if (kind === 'av') throw fail(400, 'Pick an avatar.'); w.eq[kind] = ''; return w; }
  key = String(key);
  const free = kind === 'av' && AVATARS.includes(key);
  if (!free && !w.owned[kind].includes(key)) throw fail(409, 'You do not own that yet.');
  w.eq[kind] = key; return w;
}
function useGiftFrom(w, key) {
  if (!own(GIFTS, key)) throw fail(400, 'Unknown gift.');
  if (!(w.gifts[key] > 0)) throw fail(409, 'You have no ' + key + ' left. Buy a pack in the shop.');
  w.gifts[key]--; if (!w.gifts[key]) delete w.gifts[key]; return w;
}
module.exports = { AVATARS, ACC_PRICE, PREMIUM, GIFTS, BORDER_PRICE, EMOTES, GIFT_USES, START_WP, placeWpFor, predWpFor, PRICES, KINDS, own, emptyWallet, buyInto, equipInto, useGiftFrom, fail };


