// Hot Joker: a 52-card deck plus one Joker is dealt to everyone. Players take a
// hidden card from the previous player with cards left and lay down complete
// sets (four of a kind, or pairs in the quicker variant). The player left
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
// Removes every complete set (size 4 = four of a kind, size 2 = a pair). Returns the ranks put down,
// repeated once per set.
function layDown(hand, size = 4) {
  const count = {};
  for (const c of hand) if (!isJoker(c)) count[rankOf(c)] = (count[rankOf(c)] || 0) + 1;
  const ranks = [], remove = {};
  for (const r of RANKS) { const sets = Math.floor((count[r] || 0) / size); for (let i = 0; i < sets; i++) ranks.push(r); if (sets) remove[r] = sets * size; }
  const rest = hand.filter((c) => { if (isJoker(c) || !remove[rankOf(c)]) return true; remove[rankOf(c)]--; return false; });
  return { hand: rest, ranks };
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
// Each turn a player gains one card and loses one when the next player takes from them, so the
// number of cards a player holds at the start of their turn never grows unless a set is laid.
// A set of `size` needs size-1 cards of one rank in hand before the take. When nobody can reach
// that, no set can ever form again: the table is frozen.
function frozen(order, hands, takerId, size) {
  const source = sourceFor(order, hands, takerId);
  return alive(order, hands).every((id) => hands[id].length - (id === source ? 1 : 0) <= size - 2);
}
const jokerHolder = (order, hands) => order.find((id) => hands[id].includes(JOKER)) || null;
module.exports = { SUITS, RANKS, JOKER, rankOf, isJoker, shuffle, deck, deal, layDown, alive, sourceFor, nextTaker, frozen, jokerHolder };

