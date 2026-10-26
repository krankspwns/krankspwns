// Singaporean (floating) bridge rules. Seats are 0..3 clockwise. There are no fixed
// partnerships: the auction winner (declarer) names a "called card" and whoever holds
// it is a hidden partner. No doubles, no dummy. Scores are individual.
const crypto = require('node:crypto');
const SUITS = ['C', 'D', 'H', 'S'];            // bid and rank order, low to high
const DENOMS = ['C', 'D', 'H', 'S', 'N'];       // N = No Trump
const RANKS = '23456789TJQKA';
const SEATS = ['North', 'East', 'South', 'West'];
const rankOf = (card) => RANKS.indexOf(card[1]);
const suitOf = (card) => card[0];
const left = (seat) => (seat + 1) % 4;

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const deck = () => SUITS.flatMap((s) => [...RANKS].map((r) => s + r));
function sortHand(hand) { return hand.slice().sort((a, b) => SUITS.indexOf(suitOf(b)) - SUITS.indexOf(suitOf(a)) || rankOf(b) - rankOf(a)); }
// Playable-hand points: A4 K3 Q2 J1, plus 1 for every card after the 4th in a suit.
function points(hand) {
  const high = hand.reduce((n, c) => n + Math.max(0, rankOf(c) - 8), 0);
  const long = SUITS.reduce((n, s) => n + Math.max(0, hand.filter((c) => suitOf(c) === s).length - 4), 0);
  return high + long;
}
const MIN_POINTS = 4;
const playable = (hand) => points(hand) >= MIN_POINTS;
// Deal 13 each. A "wash" (any hand under 4 points) is thrown in and redealt.
function deal() {
  for (;;) {
    const cards = shuffle(deck());
    const hands = [0, 1, 2, 3].map((i) => sortHand(cards.slice(i * 13, i * 13 + 13)));
    if (hands.every(playable)) return hands;
  }
}
const dealerFor = (board) => (board - 1) % 4;

// ---- Auction: bids '1C'..'7N' or 'P'. A bid of level n commits to 6 + n tricks. ----
const bidValue = (call) => (Number(call[0]) - 1) * 5 + DENOMS.indexOf(call[1]);
const isBid = (call) => typeof call === 'string' && /^[1-7][CDHSN]$/.test(call);
function lastBid(calls) {
  for (let i = calls.length - 1; i >= 0; i--) if (isBid(calls[i].call)) return calls[i];
  return null;
}
function legalCalls(calls) {
  const bid = lastBid(calls), bids = [];
  for (let level = 1; level <= 7; level++) for (const d of DENOMS) { const c = level + d; if (!bid || bidValue(c) > bidValue(bid.call)) bids.push(c); }
  return { pass: true, bids };
}
const isLegalCall = (calls, call) => call === 'P' || legalCalls(calls).bids.includes(call);
function auctionOver(calls) {
  if (calls.length < 4) return false;
  if (!lastBid(calls)) return calls.length === 4;
  return calls.slice(-3).every((c) => c.call === 'P');
}
// The declarer is the highest bidder.
function contractOf(calls) {
  const bid = lastBid(calls);
  return bid ? { level: Number(bid.call[0]), denom: bid.call[1], declarer: bid.seat } : null;
}
const isCard = (card) => typeof card === 'string' && /^[CDHS][2-9TJQKA]$/.test(card);

// ---- Play ----
// Cards a player may play. Follow suit if possible. When leading, trumps may not be led until a trump
// has been played ("broken"), unless the hand holds nothing but trumps.
function legalCards(hand, ledSuit, opts = {}) {
  if (!ledSuit) {
    const side = opts.trump && !opts.broken ? hand.filter((c) => suitOf(c) !== opts.trump) : [];
    return side.length ? side : hand.slice();
  }
  const follow = hand.filter((c) => suitOf(c) === ledSuit);
  return follow.length ? follow : hand.slice();
}
function trickWinner(cards, trump) {
  let best = cards[0];
  for (const entry of cards.slice(1)) {
    const a = suitOf(entry.card), b = suitOf(best.card);
    if (a === b ? rankOf(entry.card) > rankOf(best.card) : (a === trump && b !== trump)) best = entry;
  }
  return best.seat;
}
// Opening lead: left of declarer, or the declarer in no trump.
const openingLeader = (contract) => (contract.denom === 'N' ? contract.declarer : left(contract.declarer));

// ---- Scoring ----
// Made: 1, 2, 4, ... 64 points for 7..13 tricks. Defeated: 1, 2, 4, ... per undertrick.
const target = (contract) => 6 + contract.level;
const madePoints = (contract) => 2 ** (contract.level - 1);
const underPoints = (down) => 2 ** (down - 1);
// tricks = tricks taken by declarer and partner together. Returns per-seat score changes.
function scoreDeal(contract, partner, tricks) {
  const delta = [0, 0, 0, 0], need = target(contract);
  if (tricks >= need) {
    delta[contract.declarer] = madePoints(contract);
    delta[partner] = madePoints(contract);
  } else {
    const p = underPoints(need - tricks);
    for (let s = 0; s < 4; s++) if (s !== contract.declarer && s !== partner) delta[s] = p;
  }
  return { delta, made: tricks >= need };
}
const contractName = (c) => c.level + (c.denom === 'N' ? 'NT' : c.denom);

module.exports = { SUITS, DENOMS, RANKS, SEATS, MIN_POINTS, rankOf, suitOf, left, shuffle, deck, sortHand, deal, points, playable, dealerFor, bidValue, isBid, isCard, legalCalls, isLegalCall, auctionOver, contractOf, legalCards, trickWinner, openingLeader, target, madePoints, underPoints, scoreDeal, contractName };


