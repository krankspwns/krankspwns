// Last Laugh: a 52-card deck plus one Joker is dealt to everyone. Players take a
// hidden card from the previous player with cards left and lay down complete
// pairs. The player left
// holding the Joker loses.
const crypto = require('node:crypto');
const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const JOKER = 'JK';
const rankOf = (card) => card.slice(1);
const isJoker = (card) => card === JOKER;
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const deck = () => [...SUITS.flatMap((s) => RANKS.map((r) => s + r)), JOKER];
// Deals every card; the first few players may hold one more card than the rest.
function deal(ids) {
  const cards = shuffle(deck()), hands = Object.fromEntries(ids.map((id) => [id, []]));
  cards.forEach((c, i) => hands[ids[i % ids.length]].push(c));
  return hands;
}
// Removes every matching pair. Returns the remaining hand,
// the rank of each set put down, and the cards of each set.
function layDown(hand) {
  const size=2;
  const byRank = {}, used = new Set(), sets = [];
  for (const c of hand) if (!isJoker(c)) (byRank[rankOf(c)] ||= []).push(c);
  for (const r of RANKS) {
    const cards = byRank[r] || [];
    for (let i = 0; i + size <= cards.length; i += size) { const set = cards.slice(i, i + size); set.forEach((c) => used.add(c)); sets.push({ rank: r, cards: set }); }
  }
  return { hand: hand.filter((c) => !used.has(c)), ranks: sets.map((s) => s.rank), sets };
}
// Players still holding cards, in table order.
const alive = (order, hands) => order.filter((id) => hands[id].length > 0);
// The previous player in the circle who still has cards, or null.
function sourceFor(order, hands, takerId) {
  const i = order.indexOf(takerId);
  for (let step = 1; step < order.length; step++) {
    const id = order[(i - step + order.length * 2) % order.length];
    if (hands[id].length > 0) return id;
  }
  return null;
}
// The next player clockwise who still has cards.
function nextTaker(order, hands, fromId) {
  const i = order.indexOf(fromId);
  for (let step = 1; step <= order.length; step++) {
    const id = order[(i + step) % order.length];
    if (hands[id].length > 0 && id !== fromId) return id;
  }
  return null;
}
const jokerHolder = (order, hands) => order.find((id) => hands[id].includes(JOKER)) || null;
module.exports = { SUITS, RANKS, JOKER, rankOf, isJoker, shuffle, deck, deal, layDown, alive, sourceFor, nextTaker, jokerHolder };


