// Row-scoring rules, written straight from the game rules.
const assert = require('assert');
const { evaluateRow, handOf } = require('./api/game.js');
const mk = (cardsPerPlayer) => cardsPerPlayer.map((cards, i) => ({ id: 'p' + i, name: 'P' + i, cards }));
const ev = (row, cards) => { const r = evaluateRow(row, mk(cards)); return { losers: r.losers.join(','), penalty: r.penalty }; };
const TIE = { losers: '', penalty: 0 };

// Row 1: lowest card loses, Ace is highest; each Ace doubles the penalty
assert.deepEqual(ev(0, [['9S'], ['3H'], ['KD']]), { losers: 'p1', penalty: 1 }, 'no ace: penalty 1');
assert.deepEqual(ev(0, [['3S'], ['3H'], ['KD']]), { losers: 'p0,p1', penalty: 1 }, 'same lowest rank, any suit -> both lose');
assert.deepEqual(ev(0, [['AS'], ['3H'], ['KD']]), { losers: 'p1', penalty: 2 }, 'one ace: 2');
assert.deepEqual(ev(0, [['AS'], ['AH'], ['3D'], ['9C']]), { losers: 'p2', penalty: 4 }, 'two aces: 4');
assert.deepEqual(ev(0, [['AS'], ['AH'], ['AD'], ['2C']]), { losers: 'p3', penalty: 6 }, 'three aces: 6');
assert.deepEqual(ev(0, [['2S'], ['5H']]), { losers: 'p0', penalty: 1 }, '2 is the smallest');

// Row 2: smallest wins, so the highest loses (Ace highest); each 2 doubles the penalty
assert.deepEqual(ev(1, [['5S'], ['9H'], ['KD']]), { losers: 'p2', penalty: 1 }, 'no 2: penalty 1');
assert.deepEqual(ev(1, [['2S'], ['9H'], ['KD']]), { losers: 'p2', penalty: 2 }, 'one 2: 2');
assert.deepEqual(ev(1, [['2S'], ['2H'], ['5D']]), { losers: 'p2', penalty: 4 }, 'two 2s: 4');
assert.deepEqual(ev(1, [['3S'], ['AH'], ['AD']]), { losers: 'p1,p2', penalty: 1 }, 'Ace is the biggest; ties both lose');

// Row 3: closest to 10.5 (J/Q/K = 0.5, A = 1); over 10.5 loses, else the lowest total loses
assert.deepEqual(ev(2, [['10S', 'QH'], ['AD', 'JC'], ['KS', 'KD']]), { losers: 'p2', penalty: 1 }, 'nobody over: lowest (1.0) loses');
assert.deepEqual(ev(2, [['10S', '3H'], ['9D', 'QC'], ['8S', '8D']]), { losers: 'p0,p2', penalty: 1 }, '13 and 16 are over 10.5: both lose');
assert.deepEqual(ev(2, [['5S', '5H'], ['6D', '4C'], ['AS', 'KD']]), { losers: 'p2', penalty: 1 }, '10, 10 and 1.5');
assert.deepEqual(ev(2, [['2S', '3H'], ['3D', '2C']]), TIE, 'equal totals: everyone ties, no penalty');
assert.equal(evaluateRow(2, mk([['10S', 'QH'], ['AD', 'AS']])).entries[0].total, 10.5);

// Row 4: hand detection
const h = (c) => handOf(c);
assert.equal(h(['2S', '4H', '6D']), 'none'); assert.equal(h(['2S', '2H', '6D']), 'pair');
assert.equal(h(['2S', '3H', '4D']), 'straight'); assert.equal(h(['4S', '2H', '3D']), 'straight', 'order does not matter');
assert.equal(h(['QS', 'KH', 'AD']), 'straight', 'Q-K-A'); assert.equal(h(['AS', '2H', '3D']), 'straight', 'A-2-3');
assert.equal(h(['KS', 'AH', '2D']), 'none', 'K-A-2 does not wrap');
assert.equal(h(['5S', '9S', 'KS']), 'flush'); assert.equal(h(['5S', '9S', 'KH']), 'none', 'two of a suit is not a combo');
assert.equal(h(['7S', '7H', '7D']), 'triple'); assert.equal(h(['2S', '3S', '4S']), 'sflush');
// only the weakest hand loses
assert.deepEqual(ev(3, [['2S', '3S', '4S'], ['5S', '9S', 'KS'], ['2H', '2D', '6C']]), { losers: 'p2', penalty: 6 }, 'pair loses; flush(2)+royal(4) raise it');
assert.deepEqual(ev(3, [['2S', '4H', '6D'], ['3S', '8H', 'JD'], ['7S', '7H', '9C']]), { losers: 'p0,p1', penalty: 1 }, 'both no-pattern lose, penalty 1');
assert.deepEqual(ev(3, [['7S', '7H', '7D'], ['2H', '2D', '6C']]), { losers: 'p1', penalty: 3 }, 'triple adds 3');
assert.deepEqual(ev(3, [['5S', '9S', 'KS'], ['2H', '3D', '4C']]), { losers: 'p1', penalty: 2 }, 'flush adds 2');
assert.deepEqual(ev(3, [['2S', '3S', '4S'], ['2H', '3D', '4C']]), { losers: 'p1', penalty: 4 }, 'royal flush adds 4');
assert.deepEqual(ev(3, [['2S', '3S', '4S'], ['AH', 'AD', 'AC'], ['KS', 'QS', 'JS']]), { losers: 'p1', penalty: 11 }, 'triple is weakest of these; 4 + 3 + 4 adds up');

// Everyone the same -> nobody is the loser, no penalty (even when Aces / 2s would normally add to it)
assert.deepEqual(ev(0, [['KS'], ['KH']]), TIE, 'row 1: two Kings');
assert.deepEqual(ev(0, [['AS'], ['AH']]), TIE, 'row 1: two Aces, still no penalty');
assert.deepEqual(ev(0, [['KS'], ['KH'], ['KD']]), TIE, 'row 1: all the same, any number of players');
assert.deepEqual(ev(1, [['2S'], ['2H']]), TIE, 'row 2: two 2s');
assert.deepEqual(ev(1, [['9S'], ['9H'], ['9D']]), TIE, 'row 2: all 9s');
assert.deepEqual(ev(2, [['10S', 'QH'], ['10D', 'KC']]), TIE, 'row 3: both exactly 10.5');
assert.deepEqual(ev(2, [['10S', '9H'], ['8D', '9C']]), TIE, 'row 3: everyone over 10.5, so everyone loses = tie');
assert.deepEqual(ev(3, [['2S', '2H', '6D'], ['9S', '9H', 'KD']]), TIE, 'row 4: both pairs');
assert.deepEqual(ev(3, [['2S', '4H', '6D'], ['3S', '8H', 'JD']]), TIE, 'row 4: both no pattern');
assert.deepEqual(ev(3, [['7S', '7H', '7D'], ['9S', '9H', '9D']]), TIE, 'row 4: both triples');
assert.equal(evaluateRow(0, mk([['KS'], ['KH']])).tie, true);
assert.equal(evaluateRow(0, mk([['KS'], ['3H']])).tie, false);
console.log('rules ok');
