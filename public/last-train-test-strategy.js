/* Test clients reason only from their own authenticated view and remembered actions. */
((root, factory) => {
  const strategy = factory();
  if (typeof module === 'object' && module.exports) module.exports = strategy;
  else root.trainTestStrategy = strategy;
})(typeof window === 'object' ? window : globalThis, () => {
  'use strict';
  const name = (view, id) => view.players.find(p => p.id === id)?.name || 'that player';
  const hash = value => [...value].reduce((n,c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  function remember(bot, view) {
    if (!view.me.role) return false;
    const before = JSON.stringify(bot.memory);
    if (bot.memory?.match !== view.match) bot.memory = { match: view.match };
    const memory = bot.memory;
    if (memory.round !== view.round) {
      memory.round = view.round; memory.choice = null; memory.medicine = null; memory.blocked = false; delete memory.attackId;
    }
    if (view.me.nightChoice) memory.choice = { ...view.me.nightChoice };
    if (view.phase === 'night' && view.nightRole === 'medic' && view.me.role === 'medic') {
      memory.blocked = !!view.me.blocked;
      if (view.me.medicineChoice) memory.medicine = { ...view.me.medicineChoice };
    }
    if (view.phase === 'night' && view.me.group === 'saboteur' && view.nightRole !== 'saboteur') memory.attackId = view.me.attackId || null;
    return JSON.stringify(memory) !== before;
  }
  function lie(bot, view) {
    const memory = bot.memory || {}, allies = new Set((view.me.allies || []).map(p => p.id));
    const innocent = view.players.filter(p => p.alive && p.id !== view.meId && !allies.has(p.id));
    if (!innocent.length) return "I'm a Passenger. I have no new information. I think we should compare everyone's claims.";
    const covers = ['inspector','witness','medic','brave','careful','speaker','passenger'].filter(k => view.mix.some(m => m.role === k));
    const cover = covers[hash(bot.pid) % covers.length] || 'passenger';
    const target = innocent[(hash(bot.pid) + view.round) % innocent.length], who = name(view, target.id);
    if (cover === 'inspector') return "I'm Inspector. I checked " + who + ' last night: BAD. I think we should vote for ' + who + '.';
    if (cover === 'witness') {
      const other = innocent.find(p => p.id !== (memory.attackId || memory.choice?.attackId)) || target;
      return view.round <= 1 ? "I'm Witness. The Saboteurs targeted " + name(view, other.id) + ' last night. I used my watch.' : "I'm Witness. I already used my watch. I have no new report tonight.";
    }
    if (cover === 'medic') return view.round <= 1 ? "I'm Medic. I used my heal on " + who + ' last night.' : "I'm Medic. My heal is already used. I kept my poison last night.";
    if (cover === 'brave') return view.round <= 1 ? "I'm Brave Passenger. I chose to protect " + who + ' last night.' : "I'm Brave Passenger. I already used my protection. I have no new information.";
    if (cover === 'careful') return view.round <= 1 ? "I'm Careful Passenger. I used my door lock last night." : "I'm Careful Passenger. I already used my door lock. I have no new information.";
    if (cover === 'speaker') return "I'm Speaker. My double vote is still available. I don't trust " + who + '.';
    return "I'm a Passenger. I have no night power, but I don't trust " + who + '.';
  }
  // Bots sound different every turn: varied wording of the claim, an opener and an opinion about someone.
  // The randomness is seeded by bot, journey and round, so asking the same bot twice gives the same line.
  function seeded(seed) { let a = Math.imul(hash(seed) ^ 0x9e3779b9, 0x85ebca6b) >>> 0; const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; next(); next(); return next; }
  const OPENERS = ['', '', '', 'Okay. ', 'Morning, everyone. ', 'Right, quick one. ', 'Listen. ', 'Alright. ', 'Honestly? ', 'So. '];
  const CLAIMS = [r => 'I\'m ' + r + '.', r => 'My role is ' + r + '.', r => 'I\'ll be open: I\'m ' + r + '.', r => 'Cards on the table, I\'m ' + r + '.', r => 'For the record, I\'m ' + r + '.'];
  const PASSENGER_CLAIMS = ['I\'m a Passenger.', 'Just a Passenger here.', 'I\'m only a Passenger.', 'Cards on the table, I\'m a Passenger.'];
  const GOOD_TAKES = [n => 'I\'m keeping an eye on ' + n + '.', n => n + ' has been very quiet.', n => 'I trust ' + n + ' for now.', n => 'Something about ' + n + '\'s story feels off.', n => 'I want to hear from ' + n + ' next.', n => 'Can ' + n + ' explain last night?', () => 'Let\'s not rush the vote.', () => 'Let\'s compare every claim before voting.', () => ''];
  const BAD_TAKES = [n => n + ' seems nervous to me.', n => 'I don\'t buy ' + n + '\'s story.', n => 'We should look hard at ' + n + '.', n => n + ' is dodging questions.', n => 'Did anyone else notice ' + n + ' changing their story?', () => ''];
  function dress(bot, view, core) {
    const r = seeded([bot.pid || view.meId, view.match, view.round].join(':')), pick = list => list[Math.floor(r() * list.length)];
    const said = core.replace(/I'm (a |the )?(Passenger|Inspector|Medic|Witness|Brave Passenger|Careful Passenger|Speaker|Trainee)\./, (m, art, role) => role === 'Passenger' ? pick(PASSENGER_CLAIMS) : pick(CLAIMS)(role));
    const bad = view.me.group === 'saboteur', allies = new Set((view.me.allies || []).map(p => p.id));
    const others = view.players.filter(p => p.alive !== false && p.id !== view.meId && !(bad && allies.has(p.id)) && !core.includes(p.name));
    const take = others.length ? pick(bad ? BAD_TAKES : GOOD_TAKES)(name(view, pick(others).id)) : '';
    const line = pick(OPENERS) + said + (take ? ' ' + take : '');
    return line.length <= 280 ? line : said;
  }
  function statement(bot, view) { return dress(bot, view, claim(bot, view)); }
  function claim(bot, view) {
    const me = view.me, memory = bot.memory?.match === view.match && bot.memory.round === view.round ? bot.memory : {};
    if (me.group === 'saboteur') return lie(bot, view);
    const reports = (me.reports || []).filter(r => r.round === view.round), choice = me.nightChoice || memory.choice;
    const promotion = reports.find(r => r.type === 'promotion');
    const prefix = promotion ? "I was Trainee and became " + (promotion.role === 'medic' ? 'Medic' : 'Inspector') + '. ' : '';
    if (me.role === 'inspector') {
      const check = reports.find(r => r.type === 'check');
      if (check) return prefix + "I'm Inspector. I checked " + name(view, check.targetId) + ' last night: ' + check.alignment.toUpperCase() + '.';
      if (reports.some(r => r.type === 'check-blocked')) return "I'm Inspector. My check was blocked last night. I got no GOOD or BAD result.";
      return prefix + "I'm Inspector. I have no check result from last night.";
    }
    if (me.role === 'medic') {
      const medicine = memory.medicine;
      if (memory.blocked) return "I'm Medic. I was blocked last night, so I used no medicine.";
      if (medicine?.power === 'heal') return "I'm Medic. I used my heal on " + name(view, medicine.targetId) + ' last night.';
      if (medicine?.power === 'poison') return "I'm Medic. I used my poison on " + name(view, medicine.targetId) + ' last night.';
      if (medicine?.power === 'pass') return "I'm Medic. I used no medicine last night.";
      return prefix + "I'm Medic. My heal is " + (me.medicine?.heal ? 'still available' : 'used') + ' and my poison is ' + (me.medicine?.poison ? 'still available' : 'used') + '.';
    }
    if (me.role === 'witness') {
      const watch = reports.find(r => r.type === 'watch');
      if (watch) return watch.targetId ? "I'm Witness. The Saboteurs targeted " + name(view, watch.targetId) + " last night. I don't know whether medicine was used." : "I'm Witness. The Saboteurs chose no attack last night.";
      if (reports.some(r => r.type === 'watch-blocked')) return "I'm Witness. My watch was blocked last night. I did not see the target.";
      return "I'm Witness. I did not watch last night. My watch is " + (me.used?.watch ? 'already used.' : 'still available.');
    }
    if (me.role === 'brave') return choice?.power === 'cover' ? "I'm Brave Passenger. I chose to protect " + name(view, choice.targetId) + ' last night.' : "I'm Brave Passenger. I protected nobody last night. My protection is " + (me.used?.cover ? 'already used.' : 'still available.');
    if (me.role === 'careful') return choice?.power === 'lock' ? "I'm Careful Passenger. I used my door lock last night." : "I'm Careful Passenger. I did not lock my door last night. My lock is " + (me.used?.lock ? 'already used.' : 'still available.');
    if (me.role === 'speaker') return "I'm Speaker. My double vote is " + (me.used?.double ? 'already used.' : 'still available.');
    if (me.role === 'trainee') return "I'm Trainee. I have not been promoted, so I have no night action yet.";
    return "I'm a Passenger. I have no night power.";
  }
  return { remember, statement };
});
