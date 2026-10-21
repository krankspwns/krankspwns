const crypto = require('node:crypto');
const need = (ok, status, message) => { if (!ok) throw Object.assign(Error(message), { status }); };
const ROLES = {
  passenger: { name: 'Passenger', group: 'passenger', icon: '🎟️', description: 'Listen, share what you think, and vote. Find the Saboteurs.' },
  careful: { name: 'Careful Passenger', group: 'passenger', icon: '🔒', description: 'Once per game, lock your door for a night. It stops an attack on you, but not poison or overdose.' },
  brave: { name: 'Brave Passenger', group: 'passenger', icon: '🛡️', description: 'Once per game, protect someone from an attack tonight. If Medic also heals them, they die from overdose.' },
  witness: { name: 'Witness', group: 'passenger', icon: '👁️', description: 'Once per game, watch tonight. Learn whom the Saboteurs tried to attack, even if saved.' },
  speaker: { name: 'Speaker', group: 'passenger', icon: '📣', description: 'Once per game, make your vote for a person count twice.' },
  inspector: { name: 'Inspector', group: 'crew', icon: '🔎', description: 'Each night, check one other player. Learn GOOD or BAD in the morning if you survive.' },
  medic: { name: 'Medic', group: 'crew', icon: '🧪', description: 'One heal and one poison for the whole game. Heal the attacked player, poison someone else, or skip. Only one medicine per night.' },
  trainee: { name: 'Trainee', group: 'crew', icon: '⭐', description: 'You count as Crew. When Inspector or Medic is out, take their job from the next night.' },
  saboteur: { name: 'Saboteur', group: 'saboteur', icon: '🗡️', description: 'Agree on one attack with your team in 20 seconds. You can choose anyone, even yourself, or Skip.' },
  blocker: { name: 'Blocker', group: 'saboteur', icon: '🚫', description: 'Choose the shared attack with your team. Once per game, also stop one other player’s night power.' },
};
// Every phone follows the same fixed night windows, including spent powers or eliminated roles from the starting mix.
// Finishing when a particular player clicks would expose their secret identity.
const LEGACY_NIGHT = ['saboteur', 'medic', 'brave', 'careful', 'inspector', 'witness'];
const NIGHT = ['careful', 'saboteur', 'medic', 'brave', 'inspector', 'witness'];
const TIMERS = { briefing: 20, boarding: 6, settling: 4, night: 20, gathering: 4, morning: 8, discussion: 20, voting: 45, voteResult: 12 };
const group = p => ROLES[p.role]?.group;
const alive = room => room.players.filter(p => p.alive);
const present = room => room.players.filter(p => !p.departed);
const shuffle = list => { for (let i = list.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [list[i], list[j]] = [list[j], list[i]]; } return list; };
function teamSlots(count) {
  if (!Number.isInteger(count) || count < 5 || count > 12) return null;
  const saboteur = count === 5 ? 1 : count < 10 ? 2 : 3;
  const good = count - saboteur;
  return { saboteur, good, maxCrew: Math.min(3, Math.floor((good - 1) / 2)) };
}
const SPECIAL_PASSENGERS = ['careful', 'brave', 'witness', 'speaker'];
const CREW_ROLES = ['inspector', 'medic', 'trainee'];
function validateLoadout(count, roles) {
  const slots = teamSlots(count);
  need(slots && roles && typeof roles === 'object' && !Array.isArray(roles), 400, 'Gather at least five players before choosing roles.');
  need(Array.isArray(roles.crew) && Array.isArray(roles.passengers), 400, 'Choose the roles using the role cards.');
  need(roles.crew.length >= 1 && roles.crew.length <= slots.maxCrew && new Set(roles.crew).size === roles.crew.length && roles.crew.every(k => CREW_ROLES.includes(k)), 400, 'Keep at least one Crew member and more Passengers than Crew.');
  need(roles.crew.some(k => k === 'inspector' || k === 'medic'), 400, 'Choose Inspector or Medic so Trainee has a job to inherit.');
  need(roles.passengers.length <= slots.good - roles.crew.length && new Set(roles.passengers).size === roles.passengers.length && roles.passengers.every(k => SPECIAL_PASSENGERS.includes(k)), 400, 'Each Passenger power can appear once. The remaining seats are normal Passengers.');
  need(['normal', 'blocker'].includes(roles.saboteur) && (slots.saboteur > 1 || roles.saboteur === 'normal'), 400, 'A single Saboteur must be a normal Saboteur.');
  return { crew: [...roles.crew], passengers: [...roles.passengers], saboteur: roles.saboteur };
}
function randomLoadout(count) {
  const slots = teamSlots(count); need(slots, 400, 'Gather 5–12 players before shuffling roles.');
  const crew = slots.maxCrew === 1 ? [shuffle(['inspector', 'medic'])[0]] : shuffle([...CREW_ROLES]).slice(0, slots.maxCrew);
  const passengers = shuffle([...SPECIAL_PASSENGERS]).slice(0, crypto.randomInt(Math.min(4, slots.good - crew.length) + 1));
  return { crew, passengers, saboteur: slots.saboteur > 1 && crypto.randomInt(2) ? 'blocker' : 'normal' };
}
function plan(count, settings = {}) {
  const slots = teamSlots(count); if (!slots) return [];
  let crew, passengers, specialBad;
  if (settings.roles) {
    // A room can grow or shrink after its host selects a mix. Fit the saved choices to its current size.
    crew = [...settings.roles.crew].slice(0, slots.maxCrew);
    if (!crew.some(k => k === 'inspector' || k === 'medic')) crew[0] = 'inspector';
    passengers = [...settings.roles.passengers].slice(0, slots.good - crew.length);
    specialBad = settings.roles.saboteur === 'blocker' && slots.saboteur > 1;
  } else {
    crew = ['inspector', 'medic', 'trainee'].slice(0, slots.maxCrew);
    passengers = ['careful', 'witness'];
    if (count >= 9) passengers.push(settings.extra === 'speaker' ? 'speaker' : 'brave');
    specialBad = count === 12 && settings.blocker !== false;
  }
  while (passengers.length < slots.good - crew.length) passengers.push('passenger');
  const saboteurs = Array(slots.saboteur).fill('saboteur');
  if (specialBad) saboteurs[0] = 'blocker';
  return [...passengers, ...crew, ...saboteurs];
}
function phase(room, name, seconds = TIMERS[name] ?? null) {
  room.phase = name; room.step = (room.step || 0) + 1;
  room.duration = seconds; room.deadline = seconds === null ? null : Date.now() + seconds * 1000;
}
function start(room) {
  room.players = present(room);
  need(room.players.length >= 5 && room.players.length <= 12, 409, 'Gather 5–12 players to start.');
  const roles = shuffle(plan(room.players.length, room.settings));
  room.players.forEach((p, i) => Object.assign(p, { role: roles[i], originalRole: roles[i], alive: true, used: {}, reports: [], departed: false, promotedAt: null }));
  // Seat order is shuffled separately from roles and stays fixed for this whole match.
  room.seatOrder = shuffle(room.players.map(p => p.id));
  room.nightOrder = [...NIGHT];
  room.match = (room.match || 0) + 1; room.round = 0; room.history = []; room.ready = {};
  room.medicine = { heal: 1, poison: 1 }; room.winner = null; room.winReason = null;
  room.night = null; room.votes = {}; room.speeches = []; room.speakingOrder = []; room.speakerIndex = 0;
  room.paused = false; room.pauseRemaining = null; room.notice = null;
  phase(room, 'briefing');
}
function board(room) { phase(room, 'boarding'); }
function beginNight(room) {
  room.round++; room.ready = {}; room.votes = {}; room.electorate = [];
  room.night = { index: 0, choices: {}, blockedId: null, attackId: null, patientId: null, medicId: alive(room).find(p => p.role === 'medic')?.id || null, medicine: null, whispers: [] };
  phase(room, 'settling');
}
const nightStages = room => (room.nightOrder || LEGACY_NIGHT).filter(role => role === 'saboteur' || room.players.some(p => p.originalRole === role));
const nightRole = room => room.phase === 'night' ? nightStages(room)[room.night.index] : null;
function nightChoice(room, me, data) {
  need(room.phase === 'night' && me.alive, 409, 'Your night turn is not open.');
  const active = nightRole(room), power = data.power || 'pass', targetId = data.targetId || null;
  if (active === 'saboteur') {
    need(group(me) === 'saboteur', 403, 'Only the bad team can choose now.');
    const attackId = data.attackId || null;
    need(!attackId || alive(room).some(p => p.id === attackId), 400, 'Choose someone still in, or Skip.');
    need(['pass', 'block'].includes(power), 403, 'That power is not part of this turn.');
    const before = room.night.choices[me.id];
    if (power === 'block') {
      need(me.role === 'blocker', 403, 'Only Blocker can stop a night power.');
      need(!me.used.block, 409, 'Your block is already used.');
      need(targetId !== me.id && alive(room).some(p => p.id === targetId), 400, 'Choose another player still in.');
      room.night.blockedId = targetId; me.used.block = true;
    } else need(!targetId, 400, 'Choose a block only with the Blocker power.');
    // Attack proposals stay editable until the deadline; a confirmed block stays spent and fixed.
    room.night.choices[me.id] = { power: power === 'block' ? 'block' : before?.power || 'pass', targetId: power === 'block' ? targetId : before?.targetId || null, attackId };
    return;
  }
  need(me.role === active && active !== 'medic', 403, 'Wait for your role’s turn.');
  need(!room.night.choices[me.id], 409, 'You have already acted tonight.');
  need(!data.attackId, 403, 'Only Saboteurs can choose an attack.');
  const powers = { careful: 'lock', brave: 'cover', witness: 'watch', inspector: 'check' };
  need(power === 'pass' || powers[me.role] === power, 403, 'That power is not part of your role.');
  if (['lock', 'cover', 'watch'].includes(power)) need(!me.used[power], 409, 'You already used this power.');
  if (['cover', 'check'].includes(power)) need(targetId !== me.id && alive(room).some(p => p.id === targetId), 400, 'Choose another player still in.');
  else need(!targetId, 400, 'This power does not need a target.');
  room.night.choices[me.id] = { power, targetId };
  if (['lock', 'cover', 'watch'].includes(power)) me.used[power] = true;
}
function settleAttack(room) {
  const bad = alive(room).filter(p => group(p) === 'saboteur'), counts = new Map();
  for (const p of bad) {
    const id = room.night.choices[p.id]?.attackId || null; // Unselected is Skip, not a forced attack.
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const maximum = Math.max(0, ...counts.values()), tied = [...counts.keys()].filter(id => counts.get(id) === maximum);
  room.night.attackId = tied.length ? tied[crypto.randomInt(tied.length)] : null;
  // Medic goes before protection, so sees the original attack target, not a redirected victim.
  room.night.patientId = room.night.attackId;
}
function medicineChoice(room, me, data) {
  const n = room.night;
  need(nightRole(room) === 'medic' && me.alive && me.id === n.medicId, 403, 'Only Medic can choose in this turn.');
  need(n.blockedId !== me.id, 409, 'Your medicine cannot be used tonight. None is spent.');
  need(!n.medicine, 409, 'Your medicine choice is already saved.');
  need(['pass', 'heal', 'poison'].includes(data.power), 400, 'Choose heal, poison, or Skip.');
  const power = data.power, targetId = data.targetId || null;
  if (power !== 'pass') need(room.medicine[power] === 1, 409, 'You already used this medicine.');
  if (power === 'heal') need(n.patientId && (!targetId || targetId === n.patientId), 400, 'Nobody here needs that heal.');
  if (power === 'poison') need(targetId !== me.id && alive(room).some(p => p.id === targetId), 400, 'Choose another player still in.');
  if (power === 'pass') need(!targetId, 400, 'Skip does not need a target.');
  n.medicine = { power, targetId: power === 'heal' ? n.patientId : targetId };
  if (power !== 'pass') room.medicine[power] = 0;
}
function whisper(room, me, text) {
  need(nightRole(room) === 'saboteur' && me.alive && group(me) === 'saboteur', 403, 'Only the living bad team can use this chat during their turn.');
  const message = cleanText(text, 160); need(message, 400, 'Write a short message first.');
  need(room.night.whispers.filter(m => m.id === me.id).length < 6, 429, 'You have sent enough messages this turn. Choose your target together.');
  room.night.whispers.push({ id: me.id, text: message });
}
function remove(room, ids) {
  const outs = [];
  for (const id of new Set(ids.filter(Boolean))) {
    const p = room.players.find(p => p.id === id);
    if (p?.alive) { p.alive = false; outs.push({ id, role: p.role, group: group(p) }); }
  }
  const trainee = alive(room).find(p => p.role === 'trainee');
  if (trainee) {
    const lost = outs.find(p => p.role === 'inspector') || outs.find(p => p.role === 'medic');
    if (lost) { trainee.role = lost.role; trainee.promotedAt = room.round; trainee.reports.push({ round: room.round, type: 'promotion', role: lost.role }); }
  }
  const living = alive(room);
  if (!living.some(p => group(p) === 'saboteur')) { room.winner = 'good'; room.winReason = 'All Saboteurs are out.'; }
  else if (!living.some(p => group(p) === 'passenger')) { room.winner = 'bad'; room.winReason = 'All Passengers are out.'; }
  else if (!living.some(p => group(p) === 'crew')) { room.winner = 'bad'; room.winReason = 'All Crew are out.'; }
  return outs;
}
function resolveNight(room) {
  const n = room.night, deaths = [], choices = n.choices;
  const healId = n.medicine?.power === 'heal' ? n.medicine.targetId : null;
  const brave = alive(room).find(p => choices[p.id]?.power === 'cover' && n.blockedId !== p.id);
  const coverId = brave ? choices[brave.id].targetId : null;
  const locked = n.attackId && choices[n.attackId]?.power === 'lock' && n.blockedId !== n.attackId;
  const overdose = healId && healId === coverId;
  if (n.attackId && !locked && n.attackId !== coverId && n.attackId !== healId) deaths.push(n.attackId);
  if (overdose) deaths.push(healId); // Overdose bypasses a locked door, as does poison.
  if (n.medicine?.power === 'poison') deaths.push(n.medicine.targetId);
  const inspectors = alive(room).filter(p => p.role === 'inspector').map(p => p.id);
  const outs = remove(room, deaths);
  room.history.push({ type: 'night', round: room.round, outs });
  for (const p of alive(room)) {
    const choice = choices[p.id];
    if (choice?.power === 'watch') p.reports.push({ type: n.blockedId === p.id ? 'watch-blocked' : 'watch', round: room.round, ...(n.blockedId === p.id ? {} : { targetId: n.attackId }) });
    if (inspectors.includes(p.id) && choice?.power === 'check') p.reports.push({ type: n.blockedId === p.id ? 'check-blocked' : 'check', round: room.round, ...(n.blockedId === p.id ? {} : { targetId: choice.targetId, alignment: group(room.players.find(q => q.id === choice.targetId)) === 'saboteur' ? 'bad' : 'good' }) });
  }
  phase(room, 'gathering');
}
function beginDiscussion(room) {
  room.speakingOrder = room.seatOrder.filter(id => room.players.some(p => p.id === id && p.alive));
  room.speakerIndex = 0; phase(room, 'discussion');
}
const speakerId = room => room.phase === 'discussion' ? room.speakingOrder[room.speakerIndex] : null;
const cleanText = (text, max) => Array.from(String(text || '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('');
function speak(room, me, text) {
  need(room.phase === 'discussion' && me.alive && speakerId(room) === me.id, 403, 'Wait for your speaking turn.');
  need(room.settings.discussion === 'chat', 409, 'This room is speaking in person.');
  need(!room.speeches.some(m => m.round === room.round && m.id === me.id), 409, 'You have already spoken this round.');
  const message = cleanText(text, 280); need(message, 400, 'Write a message first.');
  room.speeches.push({ round: room.round, id: me.id, text: message });
}
function nextSpeaker(room) {
  room.speakerIndex++;
  if (room.speakerIndex >= room.speakingOrder.length) beginVote(room);
  else phase(room, 'discussion');
}
function finishSpeech(room, me) {
  need(room.phase === 'discussion' && me.alive && speakerId(room) === me.id, 403, 'Wait for your speaking turn.');
  need(room.settings.discussion !== 'chat', 409, 'Chat turns use their full 20 seconds so everyone can read.');
  nextSpeaker(room);
}
function beginVote(room) { room.electorate = alive(room).map(p => p.id); room.votes = {}; phase(room, 'voting'); }
function vote(room, me, data) {
  need(room.phase === 'voting' && me.alive && room.electorate.includes(me.id), 409, 'You cannot vote now.');
  need(!room.votes[me.id], 409, 'You have already voted.');
  const targetId = data.targetId || null;
  need(!targetId || alive(room).some(p => p.id === targetId), 400, 'Choose a player still in, or Skip.');
  const doubled = data.doubled === true;
  if (doubled) need(me.role === 'speaker' && !me.used.double && targetId, 403, 'You cannot use a double vote now.');
  room.votes[me.id] = { targetId, weight: doubled ? 2 : 1 }; if (doubled) me.used.double = true;
  if (room.electorate.every(id => room.votes[id])) resolveVote(room);
}
function resolveVote(room) {
  const votes = room.electorate.map(id => ({ id, ...(room.votes[id] || { targetId: null, weight: 1 }) })), counts = new Map();
  for (const v of votes) counts.set(v.targetId, (counts.get(v.targetId) || 0) + v.weight);
  const highest = Math.max(0, ...counts.values()), leaders = [...counts.keys()].filter(k => counts.get(k) === highest);
  const targetId = leaders.length === 1 ? leaders[0] : null, outs = remove(room, targetId ? [targetId] : []);
  room.history.push({ type: 'vote', round: room.round, outs, votes, reason: targetId ? 'voted' : leaders.length > 1 ? 'tie' : 'skip' });
  phase(room, 'voteResult'); // Even a winning removal gets its public ejection and full vote ledger.
}
function advance(room) {
  if (room.phase === 'briefing') board(room);
  else if (room.phase === 'boarding') beginNight(room);
  else if (room.phase === 'settling') phase(room, 'night');
  else if (room.phase === 'night') {
    if (nightRole(room) === 'saboteur') settleAttack(room);
    room.night.index++;
    if (room.night.index >= nightStages(room).length) resolveNight(room); else phase(room, 'night');
  } else if (room.phase === 'gathering') phase(room, 'morning');
  else if (room.phase === 'morning') { if (room.winner) phase(room, 'finished'); else beginDiscussion(room); }
  else if (room.phase === 'discussion') nextSpeaker(room);
  else if (room.phase === 'voting') resolveVote(room);
  else if (room.phase === 'voteResult') { if (room.winner) phase(room, 'finished'); else beginNight(room); }
}
function timed(room) {
  if (!room.paused && room.deadline && Date.now() >= room.deadline) { advance(room); return true; }
  return false;
}
function view(room, me) {
  const finished = room.phase === 'finished', n = room.night, active = nightRole(room);
  const introduced = !['lobby', 'briefing', 'boarding'].includes(room.phase), bad = introduced && group(me) === 'saboteur';
  // A running match keeps its dealt mix, including matches started before a balance update.
  const roles = room.phase === 'lobby' ? plan(present(room).length, room.settings) : room.players.map(p => p.originalRole || p.role);
  const summarize = list => Object.keys(ROLES).filter(k => list.includes(k)).map(role => ({ role, count: list.filter(k => k === role).length }));
  const info = p => ({ id: p.id, name: p.name, departed: !!p.departed, alive: p.alive !== false,
    seat: (room.seatOrder || []).indexOf(p.id) + 1, avatarIndex: p.avatarIndex ?? room.players.indexOf(p), voteLocked: room.phase === 'voting' && !!room.votes?.[p.id],
    ...(finished && p.role ? { role: p.role, group: group(p), alignment: group(p) === 'saboteur' ? 'bad' : 'good' } : p.alive === false ? { alignment: group(p) === 'saboteur' ? 'bad' : 'good' } : {}) });
  return {
    game: 'last-train', rulesVersion: 2, code: room.code, version: room.version, phase: room.phase, match: room.match || 0, round: room.round || 0, step: room.step || 0,
    deadline: room.deadline, duration: room.duration, remainingMs: room.paused ? room.pauseRemaining : room.deadline ? Math.max(0, room.deadline - Date.now()) : null, now: Date.now(), hostId: room.hostId, meId: me.id, paused: !!room.paused,
    settings: room.settings, catalog: ROLES, notice: room.notice || null, nightRole: active, nightOrder: room.phase === 'lobby' ? NIGHT.filter(role => role === 'saboteur' || roles.includes(role)) : nightStages(room), teamSlots: teamSlots(present(room).length),
    mix: summarize(roles), nextMix: finished ? summarize(plan(present(room).length, room.settings)) : null,
    counts: room.phase === 'lobby' ? null : Object.fromEntries(['passenger', 'crew', 'saboteur'].map(g => [g, (finished ? alive(room).filter(p => group(p) === g).length : roles.filter(role => ROLES[role]?.group === g).length)])),
    players: (room.seatOrder?.length ? room.seatOrder.map(id => room.players.find(p => p.id === id)).filter(Boolean) : room.players).map(info),
    history: (room.history || []).map(entry => ({ ...entry, outs: entry.outs.map(p => finished ? { ...p, alignment: p.group === 'saboteur' ? 'bad' : 'good' } : { id: p.id, alignment: p.group === 'saboteur' ? 'bad' : 'good' }) })), speeches: room.speeches || [], speakerId: speakerId(room), speakingOrder: room.speakingOrder || [], speakerIndex: room.speakerIndex || 0,
    winner: finished ? room.winner : null, winReason: finished ? room.winReason : null,
    me: { alive: me.alive !== false, departed: !!me.departed, role: introduced ? me.role || null : null, group: introduced ? group(me) || null : null,
      used: introduced ? me.used || {} : {}, reports: introduced ? me.reports || [] : [], promotedAt: introduced ? me.promotedAt : null,
      ready: !!room.ready?.[me.id], nightChoice: introduced ? n?.choices[me.id] || null : null, vote: room.votes?.[me.id] || null,
      ...(introduced && me.role === 'medic' && me.alive ? { medicine: room.medicine, ...(active === 'medic' ? { patientId: n.blockedId === me.id ? null : n.patientId, blocked: n.blockedId === me.id, medicineChoice: n.medicine } : {}) } : {}),
      ...(bad ? { allies: room.players.filter(p => group(p) === 'saboteur').map(p => ({ id: p.id, name: p.name, role: p.role, alive: p.alive })),
        ...(me.alive && room.phase === 'night' ? { attackId: n.attackId, ...(active === 'saboteur' ? { teamChoices: alive(room).filter(p => group(p) === 'saboteur').map(p => ({ id: p.id, attackId: n.choices[p.id]?.attackId || null, selected: !!n.choices[p.id] })), whispers: n.whispers } : {}) } : {}) } : {}),
    },
  };
}
module.exports = { ROLES, NIGHT, TIMERS, teamSlots, validateLoadout, randomLoadout, need, group, alive, present, plan, start, board, beginNight, nightStages, nightRole, nightChoice, settleAttack, medicineChoice, whisper, remove, resolveNight, beginDiscussion, speakerId, speak, nextSpeaker, finishSpeech, beginVote, vote, resolveVote, advance, timed, view, phase };
