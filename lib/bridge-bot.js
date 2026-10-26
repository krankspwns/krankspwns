// A casual Singaporean bridge player. It only uses what a real player could see: its own hand, the
// auction, the current trick and whether the partner has been revealed. It follows simple rules of
// thumb, bids cautiously, and sometimes makes the kind of mistake a friendly player would.
const crypto = require('node:crypto');
const R = require('./bridge-rules');
const rnd = () => crypto.randomInt(1e6) / 1e6;
const chance = (p) => rnd() < p;
const pickOne = (a) => a[Math.floor(rnd() * a.length)];
const bySuit = (hand) => Object.fromEntries(R.SUITS.map((s) => [s, hand.filter((c) => R.suitOf(c) === s)]));
const hcp = (cards) => cards.reduce((n, c) => n + Math.max(0, R.rankOf(c) - 8), 0);
const low = (cards) => cards.slice().sort((a, b) => R.rankOf(a) - R.rankOf(b));
const high = (cards) => cards.slice().sort((a, b) => R.rankOf(b) - R.rankOf(a));

// ---- Bidding ----
function favouriteDenom(hand) {
  const by = bySuit(hand), longest = Math.max(...R.SUITS.map((s) => by[s].length));
  if (longest < 5 && R.points(hand) >= 14 && chance(0.6)) return 'N';
  const best = R.SUITS.filter((s) => by[s].length === longest).sort((a, b) => hcp(by[b]) - hcp(by[a]) || R.SUITS.indexOf(b) - R.SUITS.indexOf(a));
  return best[0];
}
function maxLevel(hand) {
  const by = bySuit(hand), longest = Math.max(...R.SUITS.map((s) => by[s].length)), aces = hand.filter((c) => c[1] === 'A').length;
  const feel = R.points(hand) + Math.max(0, longest - 4) + aces * 0.5 + (rnd() * 3 - 1.5); // gut feeling, not arithmetic
  if (feel < 10) return 0;
  return Math.min(5, 1 + Math.floor((feel - 10) / 3)) + (chance(0.08) ? 1 : 0);
}
function bid(calls, hand) {
  const cap = maxLevel(hand);
  if (cap < 1) return 'P';
  const denom = favouriteDenom(hand), options = R.legalCalls(calls).bids.filter((b) => b[1] === denom && Number(b[0]) <= cap);
  return options.length ? options[0] : 'P';
}

// ---- Calling the partner card ----
// Usually asks for an ace it lacks, most often the ace of trumps.
function callCard(hand, contract) {
  const trump = contract.denom === 'N' ? null : contract.denom, missing = (c) => !hand.includes(c);
  const aces = R.SUITS.map((s) => s + 'A').filter(missing), kings = R.SUITS.map((s) => s + 'K').filter(missing);
  if (trump && aces.includes(trump + 'A') && chance(0.75)) return trump + 'A';
  if (aces.length) return pickOne(aces);
  if (kings.length) return trump && kings.includes(trump + 'K') && chance(0.7) ? trump + 'K' : pickOne(kings);
  return high(R.deck().filter(missing))[0];
}

// ---- Card play ----
// ctx: { hand, legal, trick, trump, seat, declarer, called, iAmPartner, revealed, partner }
// `partner` is only given once the partner has been revealed.
function play(ctx) {
  const { legal, trick, trump, seat, declarer, called, iAmPartner, revealed, partner } = ctx;
  if (legal.length === 1) return legal[0];
  if (chance(0.08)) return pickOne(legal); // a slip or a hunch
  const role = seat === declarer ? 'declarer' : iAmPartner ? 'partner' : 'defender';
  const friendly = (s) => (role === 'declarer' ? revealed && s === partner && partner !== declarer
    : role === 'partner' ? s === declarer
      : s !== declarer && (!revealed || s !== partner));
  const hidden = role === 'partner' && !revealed;
  if (hidden && legal.includes(called) && chance(0.4)) return called; // partners usually show themselves
  const dumpOrder = (cards) => {
    const side = cards.filter((c) => R.suitOf(c) !== trump), trumps = cards.filter((c) => R.suitOf(c) === trump);
    let order = [...low(side), ...low(trumps)];
    if (hidden && order.length > 1 && chance(0.7)) order = order.filter((c) => c !== called);
    return order;
  };
  if (!trick.length) {
    const team = role !== 'defender', mine = legal, trumps = trump ? mine.filter((c) => R.suitOf(c) === trump) : [];
    if (team && trumps.length && trumps.some((c) => R.rankOf(c) >= 11) && chance(0.45)) return high(trumps)[0];
    const aces = mine.filter((c) => c[1] === 'A' && R.suitOf(c) !== trump);
    if (aces.length && chance(0.6)) return pickOne(aces);
    const side = mine.filter((c) => R.suitOf(c) !== trump), by = bySuit(side);
    if (!side.length) return low(trumps)[0];
    const longest = R.SUITS.reduce((best, s) => (by[s].length > by[best].length ? s : best), R.SUITS[0]);
    return low(by[longest])[0];
  }
  const winner = R.trickWinner(trick, trump), last = trick.length === 3;
  const beats = (card) => R.trickWinner([...trick, { seat, card }], trump) === seat;
  const winners = legal.filter(beats).sort((a, b) => (R.suitOf(a) === trump) - (R.suitOf(b) === trump) || R.rankOf(a) - R.rankOf(b));
  if (friendly(winner)) return dumpOrder(legal)[0];
  if (winners.length) {
    const showy = !last && winners.length > 1 && R.suitOf(winners[0]) !== trump && chance(0.2); // plays high "to be safe"
    return showy ? winners.filter((c) => R.suitOf(c) !== trump).at(-1) : winners[0];
  }
  return dumpOrder(legal)[0];
}

module.exports = { bid, callCard, play };

