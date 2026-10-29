const crypto = require('node:crypto');
const { unsaved } = require('./last-train-store');
const need = (ok, status, message) => { if (!ok) throw Object.assign(Error(message), { status }); };
const ROLES = {
  passenger: { name: 'Passenger', group: 'passenger', icon: '🎟️', description: 'Listen, share what you think, and vote. Find the Saboteurs.' },
  careful: { name: 'Careful Passenger', group: 'passenger', icon: '🔒', description: 'Once per game, lock your door for a night. It stops an attack on you, but not poison or overdose.' },
  brave: { name: 'Brave Passenger', group: 'passenger', icon: '🛡️', description: 'Once per game, protect someone from an attack tonight. If Medic also heals them, they die from overdose.' },
  witness: { name: 'Witness', group: 'passenger', icon: '👁️', description: 'Twice per game, either watch tonight’s attack (see whom the Saboteurs targeted, even if saved) or glimpse two faces in the corridor: one of them is a Saboteur.' },
  speaker: { name: 'Speaker', group: 'passenger', icon: '📣', description: 'Once per game, make your vote for a person count twice.' },
  inspector: { name: 'Inspector', group: 'crew', icon: '🔎', description: 'Each night, check one other player. See GOOD or BAD immediately.' },
  medic: { name: 'Medic', group: 'crew', icon: '🧪', description: 'One heal and one poison for the whole game. Heal the attacked player, poison someone else, or skip. Only one medicine per night.' },
  trainee: { name: 'Trainee', group: 'crew', icon: '⭐', description: 'You count as Crew. When Inspector or Medic is out, take their job from the next night.' },
  conductor: { name: 'Conductor', group: 'crew', icon: '🎫', description: 'Each night, check another traveller’s ticket and learn straight away whether they left their cabin tonight. Anyone who walks the corridor counts: an attacker, a protector, the Night Porter, the Guard or the Steward. A Forger’s disguise hides a walk.' },
  porter: { name: 'Night Porter', group: 'crew', icon: '🏮', description: 'Each night, keep watch outside another traveller’s cabin. In the morning you learn who came to that door. Not the same cabin two nights in a row.' },
  guard: { name: 'Guard', group: 'crew', icon: '💂', description: 'Each night, guard another traveller. If they are attacked and nothing else saves them, you take the attack and are out instead. Not the same traveller two nights in a row.' },
  steward: { name: 'Steward', group: 'crew', icon: '💊', description: 'Each night, give another traveller a sleeping pill. Tonight their night power does nothing, but they cannot be attacked. Not the same traveller two nights in a row.' },
  signalman: { name: 'Signalman', group: 'crew', icon: '🚦', description: 'Once per game, call a Signal Stop at night. In the next vote a tie removes nobody, and there is no re-vote.' },
  saboteur: { name: 'Saboteur', group: 'saboteur', icon: '🗡️', description: 'Agree on one attack with your team before the night timer ends. You can choose anyone, even yourself, or Skip.' },
  forger: { name: 'Forger', group: 'saboteur', icon: '🎭', description: 'Choose the shared attack with your team. Once per game, disguise yourself or a teammate: if the Inspector checks them tonight, they read as GOOD.' },
  blocker: { name: 'Blocker', group: 'saboteur', icon: '🚫', description: 'Choose the shared attack with your team. Once per game, also stop one other player’s night power.' },
  framer: { name: 'Framer', group: 'saboteur', icon: '🖼️', description: 'Choose the shared attack with your team. Once per game, frame a good traveller: if the Inspector checks them tonight, they read as BAD.' },
  silencer: { name: 'Silencer', group: 'saboteur', icon: '🤐', description: 'Choose the shared attack with your team. Once per game, gag a traveller: they cannot speak in the next lounge, and everyone sees they were gagged.' },
  smuggler: { name: 'Smuggler', group: 'saboteur', icon: '📦', description: 'Choose the shared attack with your team. Once per game, make tonight’s attack silent: no footsteps, and the Conductor and Night Porter cannot see that walk.' },
};
// Every phone follows the same fixed night windows, including spent powers or eliminated roles from the starting mix.
// Finishing when a particular player clicks would expose their secret identity.
const LEGACY_NIGHT = ['saboteur', 'medic', 'brave', 'careful', 'inspector', 'witness'];
const NIGHT = ['careful', 'saboteur', 'medic', 'brave', 'inspector', 'witness'];
const SHARED_NIGHT = ['moves', 'responses'];
const NIGHT_ROLES = { moves: ['saboteur', 'blocker', 'forger', 'framer', 'silencer', 'smuggler', 'brave', 'careful', 'porter', 'guard', 'steward'], responses: ['medic', 'inspector', 'witness', 'conductor', 'signalman'] };
const TIMERS = { briefing: 20, boarding: 6, settling: 4, night: 20, gathering: 4, morning: 30, discussion: 20, voting: 45, revoteInfo: 7, voteResult: 12 };
const LAST_WORDS_RESULT = 20; // a removed player gets about 10 seconds for last words after the ticket is cancelled
// Quick Journey: the same rules with shorter waits, and speaking turns of at most 20 seconds.
const QUICK_TIMERS = { briefing: 12, boarding: 6, settling: 3, gathering: 3, morning: 15, voting: 25, revoteInfo: 5, voteResult: 8 };
const QUICK_NIGHT = 30, QUICK_LAST_WORDS = 14, QUICK_SPEAK = 20;
const quick = room => !!room.settings?.quick;
const timer = (room, name) => (quick(room) && QUICK_TIMERS[name] !== undefined ? QUICK_TIMERS[name] : TIMERS[name] ?? null);
// The Last Train wallet is separate from Crown Clash: WP, frames and throwables belong to this room only.
const EMOTES = ['laugh', 'wow', 'cry', 'think', 'angry', 'cool', 'sus', 'shh', 'eyes', 'heart', 'oof', 'rip', 'aiyo', 'steady', 'faster', 'gg', 'wp', 'gl'];
const FRAMES = { silver: 15, gold: 20, emerald: 20, ice: 25, neon: 30, royal: 30, fire: 40, rainbow: 50 };
const GIFTS = { tomato: 10, rose: 10, snowball: 10, popper: 10, balloon: 10, kiss: 10, pie: 15, bomb: 20, fireworks: 25 };
const GIFT_USES = 3, START_WP = 25, TESTER_WP = 1000, SPEAK_SECONDS = [15, 20, 30, 45];
// Reactions and throws never happen at night: a tap there could hint that someone holds a power.
const SOCIAL_PHASES = ['lobby', 'gathering', 'morning', 'discussion', 'voting', 'revoteInfo', 'voteResult', 'finished'];
const PIN_PHASES = ['gathering', 'morning', 'discussion', 'voting', 'revoteInfo'];
const testerName = () => { const v = process.env.TESTER_NAME === undefined ? 'benny' : String(process.env.TESTER_NAME).trim().toLowerCase(); return v === 'off' ? '' : v; };
const isTester = p => !!testerName() && String(p?.name || '').trim().toLowerCase() === testerName();
// Carriage events: at most one per night, public to everyone, never revealing a role.
const EVENTS = {
  'long-tunnel': { name: 'Long Tunnel', about: 'A long, dark tunnel. Speaking time is doubled this round.' },
  express: { name: 'Express Stop', about: 'The train is in a hurry. Speaking time is halved and the vote lasts 30 seconds.' },
  fog: { name: 'Fogged Windows', about: 'No reactions or throws in the lounge this round. Only talking.' },
  snack: { name: 'Midnight Snack', about: 'The dining car is open. Everyone still aboard gets +5 WP.' },
  'power-cut': { name: 'Power Cut', about: 'Inspector checks and Witness sightings do not work tonight. Their powers are not spent.' },
  sealed: { name: 'Sealed Ballots', about: 'This round’s vote shows only who leaves. Who voted for whom stays sealed until the end.' },
  luggage: { name: 'Lost Luggage', about: 'Everyone still aboard finds a small true clue in the morning.' },
  'full-moon': { name: 'Full Moon', about: 'The Saboteurs must agree on their attack in the first 15 seconds tonight.' },
  quiet: { name: 'Quiet Carriage', about: 'No letters can be sent tonight.' },
};
const socialOpen = room => SOCIAL_PHASES.includes(room.phase) && !(eventOn(room, 'fog') && !['lobby', 'finished'].includes(room.phase));
const eventOn = (room, key) => room.event?.key === key && room.event.round === room.round;
// Side quests: each traveller gets one private goal per journey, worth QUEST_WP once done. Goals that would give away
// a hidden team (who is a Saboteur) are only scored when the journey ends.
const QUEST_WP = 10;
const QUESTS = {
  crowd: { name: 'Go With The Crowd', goal: 'Vote for the traveller who leaves, in 2 different votes.', target: 2, team: 'any' },
  lowkey: { name: 'Low Profile', goal: 'Have no pins on you when 2 votes open.', target: 2, team: 'any' },
  penpal: { name: 'Pen Pal', goal: 'Send letters to 3 different travellers.', target: 3, team: 'any' },
  longhaul: { name: 'Long Haul', goal: 'Still be aboard after the third night.', target: 1, team: 'any', players: 7 },
  clean: { name: 'Clean Ticket', goal: 'Reach the end still aboard, with no vote ever cast against you.', target: 1, team: 'any', end: true },
  hunter: { name: 'Saboteur Hunter', goal: 'Vote for a Saboteur in 2 different votes.', target: 2, team: 'good', end: true },
  nose: { name: 'Sharp Nose', goal: 'Have your pin on a Saboteur when 2 votes open.', target: 2, team: 'good', end: true },
  misdirect: { name: 'Misdirection', goal: 'Help vote out a good traveller.', target: 1, team: 'bad' },
};
function dealQuests(room) {
  room.quests = {}; room.pinLog = [];
  for (const p of room.players) {
    const team = group(p) === 'saboteur' ? 'bad' : 'good';
    const pool = Object.keys(QUESTS).filter(k => [team, 'any'].includes(QUESTS[k].team) && room.players.length >= (QUESTS[k].players || 0));
    room.quests[p.id] = { key: pool[crypto.randomInt(pool.length)], n: 0, done: false };
  }
}
function questStep(room, id, key, by = 1) {
  const q = room.quests?.[id]; if (!q || q.key !== key || q.done || by <= 0) return;
  q.n = Math.min(QUESTS[key].target, q.n + by);
  if (q.n >= QUESTS[key].target) { q.done = true; earn(room, id, QUEST_WP, 'Side quest: ' + QUESTS[key].name); }
}
const questView = q => q && QUESTS[q.key] ? { key: q.key, name: QUESTS[q.key].name, goal: QUESTS[q.key].goal, n: q.n, target: QUESTS[q.key].target, done: q.done, end: !!QUESTS[q.key].end, wp: QUEST_WP } : null;
// Ghost whisper: once per journey a traveller who is out sends one word, optionally about someone, to a traveller still
// aboard. It arrives at the next dawn with the ghost's name. Ghosts who climbed to see a role have given it up.
const WHISPER_WORDS = ['Liar', 'Trust', 'Saboteur', 'Good', 'Watch', 'Protect', 'Vote', 'Wait'];
const whisperOpen = (room, me) => room.players.includes(me) && !!me.role && me.alive === false && !me.departed && !['lobby', 'finished'].includes(room.phase) && !room.ghostWhispers?.[me.id] && !room.climbs?.[me.id];
function ghostWhisper(room, me, data) {
  need(whisperOpen(room, me), 409, 'Your ghost whisper is not available.');
  const to = alive(room).find(p => p.id === data.targetId); need(to, 400, 'Choose a traveller still aboard.');
  need(WHISPER_WORDS.includes(data.word), 400, 'Choose one of the words.');
  const about = data.aboutId ? alive(room).find(p => p.id === data.aboutId && p.id !== to.id) : null; need(!data.aboutId || about, 400, 'Choose someone else still aboard to whisper about.');
  (room.ghostWhispers ||= {})[me.id] = { to: to.id, word: data.word, aboutId: about?.id || null, round: room.round };
}
function deliverWhispers(room) {
  for (const [from, w] of Object.entries(room.ghostWhispers || {})) {
    if (w.delivered !== undefined) continue;
    const to = room.players.find(p => p.id === w.to && p.alive);
    w.delivered = to ? room.round : false;
    if (to) to.reports.push({ type: 'ghostWhisper', round: room.round, from, word: w.word, aboutId: w.aboutId });
  }
}
// Vote betting: ghosts and observers stake WP on who the coming vote removes, or on nobody leaving. A right bet pays
// back double. Bets close when the vote is decided; a journey that ends before then refunds them.
const BET_STAKES = [5, 10], BET_PHASES = ['morning', 'discussion', 'voting', 'revoteInfo'];
const betOpen = (room, me) => !me.departed && (!!me.observer || (room.players.includes(me) && !!me.role && me.alive === false)) && BET_PHASES.includes(room.phase) && !room.winner;
function bet(room, me, data) {
  need(betOpen(room, me), 409, 'Bets are open to ghosts and observers until the vote is decided.');
  need(!room.bets?.[me.id], 409, 'Your bet on this vote is already placed.');
  const stake = Number(data.stake); need(BET_STAKES.includes(stake), 400, 'Bet 5 or 10 WP.');
  const targetId = data.targetId || null;
  need(!targetId || alive(room).some(p => p.id === targetId), 400, 'Bet on a traveller still aboard, or on nobody leaving.');
  need(balance(room, me) >= stake, 409, 'You do not have enough WP for that bet.');
  wallet(room, me.id).spent += stake;
  (room.bets ||= {})[me.id] = { round: room.round, targetId, stake };
}
function settleBets(room, outId) {
  for (const [id, b] of Object.entries(room.bets || {})) {
    const won = b.targetId === (outId || null);
    if (won) earn(room, id, b.stake * 2, 'Bet paid out');
    (room.betLog ||= []).push({ id, ...b, outId: outId || null, won });
  }
  room.bets = {};
}
function refundBets(room) {
  for (const [id, b] of Object.entries(room.bets || {})) wallet(room, id).spent -= b.stake;
  room.bets = {};
}
function pickEvent(room) {
  // Automated tests set LAST_TRAIN_EVENTS=off so random events never change a scripted night.
  if (room.settings?.events === false || process.env.LAST_TRAIN_EVENTS === 'off') return null;
  if (crypto.randomInt(100) >= 55) return null;
  const keys = Object.keys(EVENTS).filter(k => k !== room.lastEvent);
  const key = keys[crypto.randomInt(keys.length)]; room.lastEvent = key;
  return { key, round: room.round };
}
const group = p => ROLES[p.role]?.group;
const alive = room => room.players.filter(p => p.alive);
const present = room => room.players.filter(p => !p.departed);
const shuffle = list => { for (let i = list.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [list[i], list[j]] = [list[j], list[i]]; } return list; };
function teamSlots(count) {
  if (!Number.isInteger(count) || count < 5 || count > 12) return null;
  const saboteur = count === 5 ? 1 : count < 10 ? 2 : 3;
  const good = count - saboteur;
  return { saboteur, good, maxCrew: count === 6 ? 2 : Math.min(3, Math.floor((good - 1) / 2)) };
}
const SPECIAL_PASSENGERS = ['careful', 'brave', 'witness', 'speaker'];
const CREW_ROLES = ['inspector', 'medic', 'trainee', 'conductor', 'porter', 'guard', 'steward', 'signalman'];
// With 5 players the single Crew member must bring information to the good team.
const SOLO_CREW = ['inspector', 'medic', 'conductor', 'porter'];
const INHERITABLE = ['inspector', 'medic'];
const BAD_SPECIALS = ['blocker', 'forger', 'framer', 'silencer', 'smuggler'];
// Older mixes named one special Saboteur; newer ones list any number of them.
const badOf = roles => Array.isArray(roles?.bad) ? roles.bad : roles?.saboteur && roles.saboteur !== 'normal' ? [roles.saboteur] : [];
function validateLoadout(count, roles) {
  const slots = teamSlots(count);
  need(slots && roles && typeof roles === 'object' && !Array.isArray(roles), 400, 'Gather at least five players before choosing roles.');
  need(Array.isArray(roles.crew) && Array.isArray(roles.passengers), 400, 'Choose the roles using the role cards.');
  need(roles.crew.length >= 1 && roles.crew.length <= slots.maxCrew && new Set(roles.crew).size === roles.crew.length && roles.crew.every(k => CREW_ROLES.includes(k)), 400, count === 6 ? 'Choose one or two Crew members for six players.' : 'Keep at least one Crew member and more Passengers than Crew.');
  need(slots.maxCrew > 1 || SOLO_CREW.includes(roles.crew[0]), 400, 'With 5 players, the Crew member is the Inspector, Medic, Conductor or Night Porter.');
  need(!roles.crew.includes('trainee') || roles.crew.some(k => INHERITABLE.includes(k)), 400, 'Choose Inspector or Medic so Trainee has a job to inherit.');
  need(roles.passengers.length <= slots.good - roles.crew.length && new Set(roles.passengers).size === roles.passengers.length && roles.passengers.every(k => SPECIAL_PASSENGERS.includes(k)), 400, 'Each Passenger power can appear once. The remaining seats are normal Passengers.');
  const bad = badOf(roles);
  need(roles.saboteur === undefined || ['normal', ...BAD_SPECIALS].includes(roles.saboteur), 400, 'Choose the bad team on screen.');
  need(bad.length <= slots.saboteur && new Set(bad).size === bad.length && bad.every(k => BAD_SPECIALS.includes(k)), 400, 'Each Saboteur power can appear once, one per Saboteur.');
  need(slots.saboteur > 1 || !bad.includes('blocker'), 400, 'A single Saboteur cannot be a Blocker.');
  return { crew: [...roles.crew], passengers: [...roles.passengers], bad: [...bad] };
}
function randomLoadout(count) {
  const slots = teamSlots(count); need(slots, 400, 'Gather 5–12 players before shuffling roles.');
  const crew = slots.maxCrew === 1 ? [shuffle([...SOLO_CREW])[0]] : shuffle([...CREW_ROLES]).slice(0, slots.maxCrew);
  if (crew.includes('trainee') && !crew.some(k => INHERITABLE.includes(k))) crew[crew.indexOf('trainee')] = shuffle([...INHERITABLE])[0];
  const passengers = shuffle([...SPECIAL_PASSENGERS]).slice(0, crypto.randomInt(Math.min(4, slots.good - crew.length) + 1));
  const pool = BAD_SPECIALS.filter(k => slots.saboteur > 1 || k !== 'blocker');
  const bad = shuffle([...pool]).slice(0, crypto.randomInt(Math.min(2, slots.saboteur) + 1));
  return { crew, passengers, bad };
}
function plan(count, settings = {}) {
  const slots = teamSlots(count); if (!slots) return [];
  let crew, passengers, specialBad = [];
  if (settings.roles) {
    // A room can grow or shrink after its host selects a mix. Fit the saved choices to its current size.
    crew = [...settings.roles.crew].filter(k => CREW_ROLES.includes(k)).slice(0, slots.maxCrew);
    if (!crew.length || (slots.maxCrew === 1 && !SOLO_CREW.includes(crew[0]))) crew = ['inspector'];
    if (crew.includes('trainee') && !crew.some(k => INHERITABLE.includes(k))) crew[crew.indexOf('trainee')] = 'inspector';
    passengers = [...settings.roles.passengers].slice(0, slots.good - crew.length);
    specialBad = badOf(settings.roles).filter(k => BAD_SPECIALS.includes(k) && (k !== 'blocker' || slots.saboteur > 1)).slice(0, slots.saboteur);
  } else {
    crew = ['inspector', 'medic', 'trainee'].slice(0, slots.maxCrew);
    passengers = ['careful', 'witness'];
    if (count >= 9) passengers.push(settings.extra === 'speaker' ? 'speaker' : 'brave');
    specialBad = count === 12 && settings.blocker !== false ? ['blocker'] : [];
  }
  while (passengers.length < slots.good - crew.length) passengers.push('passenger');
  const saboteurs = Array(slots.saboteur).fill('saboteur');
  specialBad.forEach((k, i) => { saboteurs[i] = k; });
  return [...passengers, ...crew, ...saboteurs];
}
function phase(room, name, seconds = timer(room, name)) {
  room.phase = name; room.step = (room.step || 0) + 1;
  room.duration = seconds; room.deadline = seconds === null || room.paused ? null : Date.now() + seconds * 1000;
  if (room.paused) room.pauseRemaining = seconds === null ? null : seconds * 1000;
}
// Observers take the free seats when a new journey starts.
function seatObservers(room) {
  room.players = present(room);
  for (const o of room.observers || []) if (room.players.length < 12) { delete o.observer; delete o.alive; room.players.push(o); }
  room.observers = (room.observers || []).filter(o => o.observer);
}
// The host can start over at any point: deal again now, or return everyone to the platform.
function restart(room, to) {
  if (to === 'deal') { seatObservers(room); return start(room); }
  seatObservers(room); refundBets(room);
  for (const p of room.players) { delete p.role; delete p.originalRole; delete p.alive; p.used = {}; p.reports = []; }
  Object.assign(room, { round: 0, seatOrder: null, history: [], night: null, votes: {}, speeches: [], paused: false, pauseRemaining: null, winner: null, winReason: null, event: null, suspects: {} });
  phase(room, 'lobby', null);
}
function start(room) {
  seatObservers(room);
  need(room.players.length >= 5 && room.players.length <= 12, 409, 'Gather 5–12 players to start.');
  // Auto shuffle draws a fresh role mix for every journey, unless the host just picked or shuffled one for this journey.
  if (room.settings?.autoShuffle && !room.settings.mixPicked) room.settings.roles = randomLoadout(room.players.length);
  if (room.settings) delete room.settings.mixPicked;
  const roles = shuffle(plan(room.players.length, room.settings));
  room.players.forEach((p, i) => Object.assign(p, { role: roles[i], originalRole: roles[i], alive: true, outRound: undefined, used: {}, reports: [], departed: false, promotedAt: null }));
  // Seat order is shuffled separately from roles and stays fixed for this whole match.
  room.seatOrder = shuffle(room.players.map(p => p.id));
  room.nightOrder = [...NIGHT]; room.nightMode = 'shared';
  room.match = (room.match || 0) + 1; room.round = 0; room.history = []; room.ready = {};
  room.medicine = { heal: 1, poison: 1 }; room.winner = null; room.winReason = null;
  room.letters ||= []; room.letterRate ||= {};
  room.stats = {}; room.suspects = {}; room.climbs = {}; room.earnings = {}; room.awards = null;
  room.event = null; room.lastEvent = null; room.sealedRounds = []; room.nightLog = []; room.ghosts = {}; room.signalRound = null; room.gag = null;
  refundBets(room); room.betLog = []; room.ghostWhispers = {}; dealQuests(room);
  room.night = null; room.votes = {}; room.voteAttempt = 1; room.voteCandidates = null; room.speeches = []; room.voiceDrafts = {}; room.speakingOrder = []; room.speakerIndex = 0;
  room.paused = false; room.pauseRemaining = null; room.notice = null;
  phase(room, 'briefing');
}
function board(room) { phase(room, 'boarding'); }
function beginNight(room) {
  // Finish an in-progress legacy night unchanged, then upgrade at the next night boundary.
  room.nightMode ||= 'shared';
  room.round++; room.ready = {}; room.suspects = {}; room.votes = {}; room.electorate = []; room.voteAttempt = 1; room.voteCandidates = null;
  room.night = { index: 0, choices: {}, blockedId: null, disguiseId: null, attackId: null, patientId: null, medicId: alive(room).find(p => p.role === 'medic')?.id || null, medicine: null, whispers: [] };
  room.event = pickEvent(room);
  if (eventOn(room, 'snack')) for (const p of alive(room)) earn(room, p.id, 5, 'Midnight snack');
  if (eventOn(room, 'sealed')) room.sealedRounds = [...(room.sealedRounds || []), room.round];
  phase(room, 'settling');
}
const nightStages = room => room.nightMode === 'shared' ? SHARED_NIGHT : (room.nightOrder || LEGACY_NIGHT).filter(role => role === 'saboteur' || room.players.some(p => p.originalRole === role));
const nightRole = room => room.phase === 'night' ? nightStages(room)[room.night.index] : null;
const activeRole = (room, me) => {
  if (room.nightMode !== 'shared') return nightRole(room);
  if (nightRole(room) === 'moves' && group(me) === 'saboteur') return 'saboteur';
  return group(me) !== 'saboteur' && NIGHT_ROLES[nightRole(room)]?.includes(me.role) ? me.role : 'rest';
};
const nightSeconds = room => room.nightMode === 'shared' ? (quick(room) ? QUICK_NIGHT : SHARED_SECONDS) : TIMERS.night;
const SHARED_SECONDS = 45;
function nightChoice(room, me, data) {
  need(room.phase === 'night' && me.alive, 409, 'Your night turn is not open.');
  const active = activeRole(room, me), power = data.power || 'pass', targetId = data.targetId || null;
  if (active === 'saboteur') {
    need(group(me) === 'saboteur', 403, 'Only the bad team can choose now.');
    const attackId = data.attackId || null;
    need(!attackId || alive(room).some(p => p.id === attackId), 400, 'Choose someone still in, or Skip.');
    need(['pass', 'block', 'disguise', 'walk', 'frame', 'gag', 'smuggle'].includes(power), 403, 'That power is not part of this turn.');
    const before = room.night.choices[me.id];
    // Each Saboteur can nominate who walks the corridor to make the attack (themselves or a teammate).
    if (power === 'walk') {
      const walkerId = data.walkerId || null;
      need(!walkerId || alive(room).some(p => p.id === walkerId && group(p) === 'saboteur'), 400, 'Choose yourself or a teammate still in.');
      room.night.choices[me.id] = before ? { ...before, walkerId } : { power: 'pass', targetId: null, attackId: null, walkOnly: true, walkerId };
      return;
    }
    // Full moon: the attack must be agreed in the first 15 seconds.
    if (eventOn(room, 'full-moon') && room.deadline && attackId !== (before?.attackId || null)) need(room.deadline - Date.now() > (room.duration - 15) * 1000, 409, 'Full moon: the attack had to be chosen in the first 15 seconds.');
    if (power === 'disguise') {
      need(me.role === 'forger', 403, 'Only Forger can disguise someone.');
      need(!me.used.disguise, 409, 'Your disguise is already used.');
      need(alive(room).some(p => p.id === targetId && group(p) === 'saboteur'), 400, 'Disguise yourself or a teammate still in.');
      room.night.disguiseId = targetId; me.used.disguise = true;
      room.night.choices[me.id] = { power: before?.power || 'pass', targetId: before?.targetId || null, disguiseId: targetId, attackId: before?.attackId ?? attackId, ...(before?.walkerId ? { walkerId: before.walkerId } : {}) };
      return;
    }
    // Framer, Silencer and Smuggler: a once-per-game move that never changes the team's attack choice.
    if (['frame', 'gag', 'smuggle'].includes(power)) {
      const owner = { frame: 'framer', gag: 'silencer', smuggle: 'smuggler' }[power];
      need(me.role === owner, 403, 'That power is not part of your role.');
      need(!me.used[power], 409, 'You already used this power.');
      if (power === 'frame') need(alive(room).some(p => p.id === targetId && group(p) !== 'saboteur'), 400, 'Frame a good traveller still in.');
      if (power === 'gag') need(targetId !== me.id && alive(room).some(p => p.id === targetId), 400, 'Choose another player still in.');
      if (power === 'smuggle') need(!targetId, 400, 'This power does not need a target.');
      me.used[power] = true;
      if (power === 'frame') room.night.frame = { by: me.id, targetId }; else if (power === 'gag') room.night.gag = { by: me.id, targetId }; else room.night.smuggle = { by: me.id };
      room.night.choices[me.id] = { power: before?.power || 'pass', targetId: before?.targetId || null, attackId: before?.attackId ?? null, ...(!before || (before.walkOnly && !before.attackId) ? { walkOnly: true } : {}), ...(before?.walkerId ? { walkerId: before.walkerId } : {}), ...(before?.disguiseId ? { disguiseId: before.disguiseId } : {}), [power + 'Id']: targetId || me.id };
      return;
    }
    if (power === 'block') {
      need(me.role === 'blocker', 403, 'Only Blocker can stop a night power.');
      need(!me.used.block, 409, 'Your block is already used.');
      need(targetId !== me.id && alive(room).some(p => p.id === targetId), 400, 'Choose another player still in.');
      room.night.blockedId = targetId; me.used.block = true;
    } else need(!targetId, 400, 'Choose a block only with the Blocker power.');
    // Attack proposals stay editable until the deadline; a confirmed block stays spent and fixed.
    room.night.choices[me.id] = { power: power === 'block' ? 'block' : before?.power || 'pass', targetId: power === 'block' ? targetId : before?.targetId || null, attackId, ...(before?.disguiseId ? { disguiseId: before.disguiseId } : {}), ...(before?.walkerId ? { walkerId: before.walkerId } : {}), ...Object.fromEntries(['frameId', 'gagId', 'smuggleId'].filter(k => before?.[k]).map(k => [k, before[k]])) };
    return;
  }
  need(me.role === active && active !== 'medic', 403, 'Wait for your role’s turn.');
  need(!room.night.choices[me.id], 409, 'You have already acted tonight.');
  need(!data.attackId, 403, 'Only Saboteurs can choose an attack.');
  const powers = { careful: ['lock'], brave: ['cover'], witness: ['watch', 'glimpse'], inspector: ['check'], conductor: ['manifest'], porter: ['post'], guard: ['guard'], steward: ['pill'], signalman: ['signal'] };
  need(power === 'pass' || powers[me.role]?.includes(power), 403, 'That power is not part of your role.');
  if (['check', 'watch', 'glimpse'].includes(power)) need(!eventOn(room, 'power-cut'), 409, 'Power cut: checks and sightings do not work tonight. Your power is not spent.');
  if (['lock', 'cover', 'signal'].includes(power)) need(!me.used[power], 409, 'You already used this power.');
  if (['watch', 'glimpse'].includes(power)) need(sightsLeft(me) > 0, 409, 'You have used both sightings.');
  if (TARGETED.includes(power)) need(targetId !== me.id && alive(room).some(p => p.id === targetId), 400, 'Choose another player still in.');
  else need(!targetId, 400, 'This power does not need a target.');
  // The Night Porter, Guard and Steward move on each night: never the same traveller two nights running.
  if (ROTATING.includes(power)) need(!(me.used.last?.round === room.round - 1 && me.used.last.targetId === targetId), 409, 'Choose someone different from last night.');
  room.night.choices[me.id] = { power, targetId };
  if (['lock', 'cover', 'signal'].includes(power)) me.used[power] = true;
  if (ROTATING.includes(power)) me.used.last = { round: room.round, targetId };
  if (['watch', 'glimpse'].includes(power)) { me.used.sight = SIGHTS - sightsLeft(me) + 1; if (me.used.sight >= SIGHTS) me.used.watch = true; }
  if (['check', 'watch', 'glimpse', 'manifest'].includes(power)) recordNightResult(room, me);
}
const TARGETED = ['cover', 'check', 'manifest', 'post', 'guard', 'pill'];
const ROTATING = ['post', 'guard', 'pill'];
// A blocked power and a sleeping pill both stop a night power; only the pill also keeps its taker safe.
const stopped = (n, id) => !!id && (n.blockedId === id || n.sleepId === id);
// Witness has two sightings. A game from before this rule that already spent its single watch has none left.
const SIGHTS = 2;
const sightsLeft = me => me.used?.sight !== undefined ? Math.max(0, SIGHTS - me.used.sight) : me.used?.watch ? 0 : SIGHTS;
// These roles act after the Saboteur/Blocker turn, so their result is final on confirmation.
function recordNightResult(room, me) {
  const n = room.night, choice = n.choices[me.id];
  if (!['check', 'watch', 'glimpse', 'manifest'].includes(choice?.power)) return;
  const type = choice.power;
  me.reports ||= [];
  if (me.reports.some(r => r.round === room.round && [type, type + '-blocked'].includes(r.type))) return;
  const blocked = stopped(n, me.id);
  // A disguised Saboteur reads as GOOD to the Inspector tonight, and as staying in to the Conductor.
  const checked = type === 'check' && room.players.find(p => p.id === choice.targetId);
  me.reports.push({ type: blocked ? type + '-blocked' : type, round: room.round,
    ...(blocked ? {} : type === 'check' ? { targetId: choice.targetId, alignment: (group(checked) === 'saboteur' && n.disguiseId !== checked.id) || (n.frame?.targetId === checked.id && !stopped(n, n.frame.by)) ? 'bad' : 'good' } : type === 'glimpse' ? { ids: glimpse(room, me) }
      : type === 'manifest' ? { targetId: choice.targetId, walked: n.disguiseId !== choice.targetId && (n.walks || []).some(w => w.by === choice.targetId) } : { targetId: n.attackId }) });
}
// Two faces in the corridor, one of them a Saboteur. With a single Saboteur in the game, three faces.
function glimpse(room, me) {
  const bad = alive(room).filter(p => group(p) === 'saboteur'), good = alive(room).filter(p => group(p) !== 'saboteur' && p.id !== me.id);
  if (!bad.length) return [];
  const solo = room.players.filter(p => group(p) === 'saboteur').length === 1;
  return shuffle([shuffle([...bad])[0].id, ...shuffle([...good]).slice(0, solo ? 2 : 1).map(p => p.id)]);
}
function settleAttack(room) {
  settleSleep(room);
  // A Saboteur who took the Steward's sleeping pill sleeps through the attack.
  const bad = alive(room).filter(p => group(p) === 'saboteur' && p.id !== room.night.sleepId), counts = new Map();
  for (const p of bad) {
    const id = room.night.choices[p.id]?.attackId;
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  const maximum = Math.max(0, ...counts.values()), tied = [...counts.keys()].filter(id => counts.get(id) === maximum);
  room.night.attackId = tied.length ? tied[crypto.randomInt(tied.length)] : null;
  // Medic sees the original attack target, regardless of protection or a locked door.
  room.night.patientId = room.night.attackId;
  planWalks(room);
}
// The Steward's pill lands at the end of the first phase, unless the Steward was blocked. A Blocker or Forger who
// swallowed it slept through their own move.
function settleSleep(room) {
  const n = room.night, steward = alive(room).find(p => n.choices[p.id]?.power === 'pill');
  n.sleepId = steward && n.blockedId !== steward.id ? n.choices[steward.id].targetId : null;
  if (!n.sleepId) return;
  const sleeper = n.choices[n.sleepId];
  if (sleeper?.power === 'block' && n.blockedId === sleeper.targetId) n.blockedId = null;
  if (sleeper?.disguiseId && n.disguiseId === sleeper.disguiseId) n.disguiseId = null;
  for (const k of ['frame', 'gag', 'smuggle']) if (n[k]?.by === n.sleepId) n[k] = null;
}
// Every walk tonight, decided when the first phase ends: the Saboteur who makes the attack, and the good travellers who
// go to someone's door (Brave, Night Porter, Guard, Steward). The Conductor reads these; footsteps are heard at dawn.
function planWalks(room) {
  const n = room.night, walks = [];
  if (n.attackId) {
    const walker = pickWalker(room, alive(room).filter(p => group(p) === 'saboteur' && p.id !== n.attackId && p.id !== n.sleepId));
    // The Smuggler's silent attack leaves no walk for anyone to hear or see; the replay still shows it.
    if (walker && n.smuggle && !stopped(n, n.smuggle.by)) n.silentWalk = { kind: 'saboteur', by: walker.id, to: n.attackId, silent: true };
    else if (walker) walks.push({ kind: 'saboteur', by: walker.id, to: n.attackId });
  }
  for (const [power, kind] of [['cover', 'brave'], ['post', 'porter'], ['guard', 'guard'], ['pill', 'steward']]) {
    const p = alive(room).find(q => n.choices[q.id]?.power === power && !stopped(n, q.id));
    if (p) walks.push({ kind, by: p.id, to: n.choices[p.id].targetId });
  }
  n.walks = walks;
}
function medicineChoice(room, me, data) {
  const n = room.night;
  need(activeRole(room, me) === 'medic' && me.alive && me.id === n.medicId, 403, 'Only Medic can choose in this turn.');
  need(!stopped(n, me.id), 409, 'Your medicine cannot be used tonight. None is spent.');
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
  need(activeRole(room, me) === 'saboteur' && me.alive && group(me) === 'saboteur', 403, 'Only the living bad team can use this chat during their turn.');
  const message = cleanText(text, 160); need(message, 400, 'Write a short message first.');
  need(room.night.whispers.filter(m => m.id === me.id).length < 6, 429, 'You have sent enough messages this turn. Choose your target together.');
  room.night.whispers.push({ id: me.id, text: message });
}
function remove(room, ids, night = false) {
  const outs = [];
  for (const id of new Set(ids.filter(Boolean))) {
    const p = room.players.find(p => p.id === id);
    if (p?.alive) { p.alive = false; p.outRound = room.round; outs.push({ id, role: p.role, group: group(p) }); }
  }
  const trainee = alive(room).find(p => p.role === 'trainee');
  if (trainee) {
    const lost = outs.find(p => p.role === 'inspector') || outs.find(p => p.role === 'medic');
    if (lost) { trainee.role = lost.role; trainee.promotedAt = room.round; trainee.reports.push({ round: room.round, type: 'promotion', role: lost.role }); }
  }
  // Five-player backup: a 5-player journey has a single Crew member. If they fall on the first night, a random
  // Passenger still aboard quietly takes their job from the next night, with whatever medicine is left, and gives up
  // their own power. Only when another Passenger stays aboard, so the good team keeps both groups.
  const crewLost = outs.find(p => p.role === 'inspector') || outs.find(p => p.role === 'medic') || outs.find(p => p.group === 'crew');
  const passengers = alive(room).filter(p => group(p) === 'passenger');
  if (night && room.round === 1 && room.players.length === 5 && crewLost && !alive(room).some(p => group(p) === 'crew') && passengers.length >= 2) {
    const heir = passengers[crypto.randomInt(passengers.length)];
    heir.role = crewLost.role; heir.promotedAt = room.round;
    heir.reports.push({ round: room.round, type: 'promotion', role: crewLost.role, backup: true });
  }
  const living = alive(room);
  if (!living.some(p => group(p) === 'saboteur')) { room.winner = 'good'; room.winReason = 'All Saboteurs are out.'; }
  else if (!living.some(p => group(p) === 'passenger')) { room.winner = 'bad'; room.winReason = 'All Passengers are out.'; }
  else if (!living.some(p => group(p) === 'crew')) { room.winner = 'bad'; room.winReason = 'All Crew are out.'; }
  return outs;
}
// Footsteps: the cabins sit around a looped corridor (cabin = seat number). One Saboteur walks the
// shorter way round from their cabin to the target's cabin. One traveller whose door they passed hears it.
const cabinOf = (room, id) => (room.seatOrder || []).indexOf(id) + 1;
function walkRoute(cabins, from, to) {
  const fwd = (to - from + cabins) % cabins, back = cabins - fwd;
  const dir = fwd < back ? 1 : fwd > back ? -1 : (crypto.randomInt(2) ? 1 : -1);
  const route = [from]; for (let c = from; c !== to;) { c = ((c - 1 + dir + cabins) % cabins) + 1; route.push(c); }
  return { dir, route };
}
function pickWalker(room, team) {
  // Nominated walkers win; different nominations are drawn at random; no nomination means anyone on the team.
  const nominated = [...new Set(team.map(p => room.night.choices[p.id]?.walkerId).filter(id => team.some(p => p.id === id)))];
  if (!nominated.length) return shuffle([...team])[0];
  const pick = nominated[crypto.randomInt(nominated.length)];
  return team.find(p => p.id === pick);
}
// Listening: in phase 1 every good traveller may flip a coin, up to twice. Heads means they listen at the door tonight.
const LISTEN_FLIPS = 2;
function listening(room, me) {
  need(room.settings?.footsteps !== false, 409, 'Footsteps are switched off in this room.');
  need(room.phase === 'night' && room.nightMode === 'shared' && nightRole(room) === 'moves', 409, 'Listening is only possible in night phase 1.');
  need(me.alive !== false && !me.observer && group(me) !== 'saboteur', 403, 'Only good travellers listen at their doors.');
  return ((room.night.listen ||= {})[me.id] ||= { flips: [], heads: false });
}
function listen(room, me) {
  const mine = listening(room, me);
  // Two flips, plus up to two more earned by rubbing the coin after tails.
  need(!mine.heads && mine.flips.length < LISTEN_FLIPS + (mine.bonus || 0), 409, mine.heads ? 'You are already listening.' : 'You have used your flips tonight.');
  const heads = crypto.randomInt(2) === 1; mine.flips.push(heads ? 'heads' : 'tails'); mine.heads = heads;
}
// Out of flips after tails, rubbing the coin earns one more: 15 taps for a third flip, 25 for a fourth.
const RUB_TAPS = [15, 25];
function earnFlip(room, me) {
  const mine = listening(room, me), bonus = mine.bonus || 0;
  need(!mine.heads && bonus < RUB_TAPS.length && mine.flips.length >= LISTEN_FLIPS + bonus, 409, 'You can rub the coin when your flips are used up.');
  mine.bonus = bonus + 1;
}
// A listener who keeps their ear steady at the door (a short game on the phone) gets sharp ears for the night:
// footsteps narrow to the nearest cabins, and a lock click comes with its side.
function sharpen(room, me) {
  const mine = listening(room, me);
  need(mine.heads, 409, 'Flip heads to listen first.');
  mine.sharp = true;
}
// A walk the shorter way round; one listening traveller whose door it passed hears it.
function walk(room, kind, walker, targetId) {
  if (!walker) return null;
  const cabins = room.seatOrder.length, from = cabinOf(room, walker.id), to = cabinOf(room, targetId);
  if (!from || !to || from === to) return null;
  const { dir, route } = walkRoute(cabins, from, to), passed = route.slice(1, -1);
  const hearer = shuffle(alive(room).filter(p => p.id !== walker.id && room.night.listen?.[p.id]?.heads && passed.includes(cabinOf(room, p.id))))[0];
  if (hearer) {
    // The clue names every cabin the steps could have come from (up to half way round), never the destination.
    const at = cabinOf(room, hearer.id), reach = Math.floor((cabins - 1) / 2), occupied = new Set(alive(room).map(p => cabinOf(room, p.id)));
    const origins = Array.from({ length: reach }, (_, i) => ((at - 1 - dir * (i + 1)) % cabins + cabins) % cabins + 1).filter(c => occupied.has(c)).slice(0, room.night.listen[hearer.id].sharp ? 2 : reach);
    hearer.reports.push({ type: 'footsteps', round: room.round, cabin: at, dir, from: origins, time: (1 + crypto.randomInt(3)) + ':' + String(crypto.randomInt(60)).padStart(2, '0') + ' AM' });
  }
  return { kind, by: walker.id, from, to, route, heardBy: hearer?.id || null };
}
// Footsteps: every walk planned when the first phase ended (attacker, Brave, Night Porter, Guard, Steward) can be heard.
function footsteps(room) {
  const n = room.night; if (room.settings?.footsteps === false) return [];
  if (!n.walks) planWalks(room);
  return n.walks.map(w => walk(room, w.kind, room.players.find(p => p.id === w.by), w.to)).filter(Boolean);
}
// A door lock clicks: a listening traveller (heads on the coin) in the cabin on either side hears it, but not which side.
// A blocked lock never turns, so it makes no sound.
function lockClicks(room) {
  const n = room.night, cabins = room.seatOrder?.length || 0; if (!cabins || room.settings?.footsteps === false) return [];
  return alive(room).filter(p => n.choices[p.id]?.power === 'lock' && !stopped(n, p.id)).map(locker => {
    const at = cabinOf(room, locker.id), beside = [at % cabins + 1, (at - 2 + cabins) % cabins + 1];
    const heard = alive(room).filter(p => p.id !== locker.id && n.listen?.[p.id]?.heads && beside.includes(cabinOf(room, p.id)));
    const time = (1 + crypto.randomInt(3)) + ':' + String(crypto.randomInt(60)).padStart(2, '0') + ' AM';
    // The report names both of the listener's neighbours, so it never says which door clicked.
    const sides = c => [c % cabins + 1, (c - 2 + cabins) % cabins + 1].sort((a, b) => a - b);
    for (const p of heard) p.reports.push({ type: 'lock', round: room.round, near: n.listen[p.id].sharp ? [at] : sides(cabinOf(room, p.id)), time, ...(n.listen[p.id].sharp ? { sharp: true } : {}) });
    return { by: locker.id, heardBy: heard.map(p => p.id) };
  });
}
function resolveNight(room) {
  const n = room.night, deaths = [], choices = n.choices;
  const healId = n.medicine?.power === 'heal' ? n.medicine.targetId : null;
  const by = power => alive(room).find(p => choices[p.id]?.power === power && !stopped(n, p.id));
  const brave = by('cover'), coverId = brave ? choices[brave.id].targetId : null;
  const locked = n.attackId && choices[n.attackId]?.power === 'lock' && !stopped(n, n.attackId);
  // A traveller asleep on the Steward's pill cannot be attacked.
  const asleep = n.attackId && n.attackId === n.sleepId;
  const overdose = healId && healId === coverId;
  const lands = n.attackId && !locked && !asleep && n.attackId !== coverId && n.attackId !== healId;
  // The Guard takes an attack that would otherwise land on the traveller they guard.
  const guard = by('guard'), guardTakes = lands && guard && choices[guard.id].targetId === n.attackId;
  const victimId = guardTakes ? guard.id : lands ? n.attackId : null, fatalAttack = !!victimId;
  if (victimId) deaths.push(victimId);
  if (overdose) deaths.push(healId); // Overdose bypasses a locked door, as does poison.
  if (n.medicine?.power === 'poison') deaths.push(n.medicine.targetId);
  if (n.attackId && (!lands || guardTakes) && !(overdose && healId === n.attackId)) {
    // Guardian award: whoever stopped the attack. A locked door saves its own owner.
    const steward = asleep && by('pill');
    const savers = locked ? [n.attackId] : guardTakes ? [guard.id] : steward ? [steward.id] : [...(brave && coverId === n.attackId ? [brave.id] : []), ...(healId === n.attackId && n.medicId ? [n.medicId] : [])];
    for (const id of savers) stat(room, id).saves++;
  }
  if (!n.walks) planWalks(room);
  // The Night Porter learns who came to the door they kept watch on (never themselves).
  for (const porter of alive(room).filter(p => choices[p.id]?.power === 'post')) {
    const target = choices[porter.id].targetId;
    porter.reports.push(stopped(n, porter.id) ? { type: 'post-blocked', round: room.round } : { type: 'post', round: room.round, targetId: target, ids: [...new Set(n.walks.filter(w => w.to === target && w.by !== porter.id).map(w => w.by))] });
  }
  if (n.sleepId) room.players.find(p => p.id === n.sleepId)?.reports.push({ type: 'sleep', round: room.round });
  // The Silencer's gag keeps one traveller quiet in the coming lounge.
  room.gag = n.gag && !stopped(n, n.gag.by) ? { round: room.round, id: n.gag.targetId } : null;
  // A Signal Stop applies to the coming vote.
  const signal = alive(room).find(p => choices[p.id]?.power === 'signal');
  if (signal && !stopped(n, signal.id)) room.signalRound = room.round;
  const steps = footsteps(room), locks = lockClicks(room);
  const outs = remove(room, deaths, true);
  for (const out of outs) {
    out.causes = [];
    if (fatalAttack && out.id === victimId) out.causes.push('attack');
    if (overdose && out.id === healId) out.causes.push('overdose');
    if (n.medicine?.power === 'poison' && out.id === n.medicine.targetId) out.causes.push('poison');
  }
  room.history.push({ type: 'night', round: room.round, outs });
  // Kept private until the finale, where the night replay shows what really happened.
  const all = power => alive(room).concat(outs.map(o => room.players.find(p => p.id === o.id))).filter(p => choices[p.id]?.power === power);
  const picks = power => all(power).map(p => ({ by: p.id, targetId: choices[p.id].targetId, ...(stopped(n, p.id) ? { stopped: true } : {}) }));
  (room.nightLog ||= []).push({ round: room.round, event: room.event?.round === room.round ? room.event.key : null, attackId: n.attackId, blockedId: n.blockedId, disguiseId: n.disguiseId || null,
    frameId: n.frame && !stopped(n, n.frame.by) ? n.frame.targetId : null, gagId: room.gag?.id || null, silentWalk: n.silentWalk || null,
    lockId: locked ? n.attackId : null, coverId, healId, poisonId: n.medicine?.power === 'poison' ? n.medicine.targetId : null, sleepId: n.sleepId || null, guardTook: guardTakes ? guard.id : null,
    guards: picks('guard'), posts: picks('post'), manifests: picks('manifest'), signal: signal ? { by: signal.id, ...(stopped(n, signal.id) ? { stopped: true } : {}) } : null,
    checks: all('check').map(p => ({ by: p.id, targetId: choices[p.id].targetId })), sights: [...all('watch'), ...all('glimpse')].map(p => ({ by: p.id, type: choices[p.id].power })), outs: outs.map(o => ({ id: o.id, causes: o.causes })), footsteps: steps, locks });
  if (eventOn(room, 'luggage')) for (const p of alive(room)) {
    const other = shuffle(alive(room).filter(q => q.id !== p.id))[0];
    const roles = [...new Set(room.players.map(q => q.originalRole || q.role))].filter(r => group({ role: r }) !== 'saboteur' && r !== other?.role && r !== other?.originalRole);
    if (other && roles.length) p.reports.push({ type: 'clue', round: room.round, targetId: other.id, role: roles[crypto.randomInt(roles.length)] });
  }
  // Complete reports for choices made on an older deployment; new choices are recorded immediately.
  for (const p of alive(room)) recordNightResult(room, p);
  deliverWhispers(room);
  if (room.round >= 3) for (const p of alive(room)) questStep(room, p.id, 'longhaul');
  phase(room, 'gathering');
}
function beginDiscussion(room) {
  room.voiceDrafts = {};
  const gagged = room.gag?.round === room.round && room.players.find(p => p.id === room.gag.id && p.alive);
  room.speakingOrder = room.seatOrder.filter(id => id !== gagged?.id && room.players.some(p => p.id === id && p.alive));
  if (gagged) room.speeches.push({ round: room.round, id: gagged.id, text: '', gagged: true });
  room.speakerIndex = 0;
  while (room.speakerIndex < room.speakingOrder.length && gone(room, room.speakingOrder[room.speakerIndex])) room.speakerIndex++;
  if (room.speakerIndex >= room.speakingOrder.length) beginVote(room); else phase(room, 'discussion', speakSeconds(room));
}
const speakSeconds = room => {
  const chosen = SPEAK_SECONDS.includes(room.settings?.speakSeconds) ? room.settings.speakSeconds : TIMERS.discussion, base = quick(room) ? Math.min(QUICK_SPEAK, chosen) : chosen;
  return eventOn(room, 'long-tunnel') ? Math.min(90, base * 2) : eventOn(room, 'express') ? Math.max(10, Math.round(base / 2)) : base;
};
const speakerId = room => room.phase === 'discussion' ? room.speakingOrder[room.speakerIndex] : null;
const cleanText = (text, max) => Array.from(String(text || '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('');
function sendLetter(room, me, targetId, text) {
  const target = room.players.find(p => p.id === targetId && !p.departed);
  need(target && target.id !== me.id, 400, 'Choose another traveller on this train.');
  if (!['lobby', 'finished'].includes(room.phase)) need((me.alive !== false) === (target.alive !== false), 403, 'Players who are out can only write to other players who are out.');
  need(!(eventOn(room, 'quiet') && ['settling', 'night'].includes(room.phase)), 409, 'Quiet carriage: no letters tonight.');
  need(typeof text === 'string' && Array.from(text).length <= 500, 400, 'Keep your letter within 500 characters.');
  const message = cleanText(text, 500); need(message, 400, 'Write your letter first.');
  const now = Date.now(), recent = (room.letterRate?.[me.id] || []).filter(t => now - t < 60000);
  need(recent.length < 8, 429, 'Give your letters a moment to arrive before sending more.');
  // Letters stay in both letterboxes; the oldest are dropped once the room keeps 400.
  const letters = room.letters || [];
  room.letters = [...letters, { id: crypto.randomUUID(), from: me.id, to: target.id, text: message, round: room.round || 0, match: room.match || 0, sentAt: now, read: false }].slice(-400);
  room.letterRate = { ...room.letterRate, [me.id]: [...recent, now] };
  const q = room.quests?.[me.id];
  if (q?.key === 'penpal' && !['lobby', 'finished'].includes(room.phase) && !(q.to ||= []).includes(target.id)) { q.to.push(target.id); questStep(room, me.id, 'penpal'); }
}
function dismissLetters(room, me, ids) {
  need(Array.isArray(ids) && ids.length <= 30 && ids.every(id => typeof id === 'string' && id.length <= 80), 400, 'Close the letterbox and try again.');
  // Only the recipient can mark a letter read. Unknown or already-read IDs are harmless.
  const selected = new Set(ids);
  for (const m of room.letters || []) if (m.to === me.id && selected.has(m.id)) m.read = true;
}
function speak(room, me, text) {
  need(!room.speeches.some(m => m.round === room.round && m.id === me.id), 409, 'You have already spoken this round.');
  need(room.phase === 'discussion' && me.alive && speakerId(room) === me.id, 403, 'Wait for your speaking turn.');
  const message = cleanText(text, 280); need(message, 400, 'Write a message first.');
  room.speeches.push({ round: room.round, id: me.id, text: message });
  nextSpeaker(room);
}
// A traveller who left (or was removed) stays aboard, but the table never waits for them: their speaking turn is
// skipped, a vote is complete once everyone still connected has voted, and the briefing needs only them.
const gone = (room, id) => !!room.players.find(p => p.id === id)?.departed;
const voteDone = room => room.electorate.every(id => room.votes[id] || gone(room, id));
function nextSpeaker(room) {
  const draft = room.voiceDrafts?.[speakerId(room)];
  // Slow mobile uploads finish after the turn moves on; the clip never takes the next speaker's turn.
  if (draft) draft.expiresAt = Date.now() + 60000;
  room.speakerIndex++;
  while (room.speakerIndex < room.speakingOrder.length && gone(room, room.speakingOrder[room.speakerIndex])) room.speakerIndex++;
  if (room.speakerIndex >= room.speakingOrder.length) beginVote(room);
  else phase(room, 'discussion', speakSeconds(room));
}
// Called after someone leaves or is removed, so the current step moves on without waiting for them.
function afterDeparture(room) {
  if (room.phase === 'discussion' && gone(room, speakerId(room))) nextSpeaker(room);
  else if (room.phase === 'voting' && voteDone(room)) resolveVote(room);
  else if (room.phase === 'briefing') { const here = alive(room).filter(p => !p.departed); if (here.length && here.every(p => room.ready?.[p.id])) board(room); }
}
function finishSpeech(room, me) {
  need(room.phase === 'discussion' && me.alive && speakerId(room) === me.id, 403, 'Wait for your speaking turn.');
  need(room.settings.discussion !== 'chat', 409, 'Send a message or wait for your turn to end.');
  nextSpeaker(room);
}
function beginVote(room, candidates = null) {
  if (!candidates) {
    // Pins as the vote opens, for side quests.
    const pins = { ...(room.suspects || {}) }; (room.pinLog ||= []).push({ round: room.round, pins });
    for (const p of alive(room)) if (!Object.values(pins).includes(p.id)) questStep(room, p.id, 'lowkey');
  }
  room.electorate = alive(room).map(p => p.id); room.votes = {};
  room.voteAttempt = candidates ? 2 : 1; room.voteCandidates = candidates;
  phase(room, 'voting', eventOn(room, 'express') ? Math.min(30, timer(room, 'voting')) : timer(room, 'voting'));
}
function vote(room, me, data) {
  need(room.phase === 'voting' && me.alive && room.electorate.includes(me.id), 409, 'You cannot vote now.');
  need(!room.votes[me.id], 409, 'You have already voted.');
  const targetId = data.targetId || null;
  need(!targetId || alive(room).some(p => p.id === targetId), 400, 'Choose a player still in, or Skip.');
  need(!targetId || !room.voteCandidates || room.voteCandidates.includes(targetId), 400, 'Choose one of the tied players, or Skip.');
  const doubled = data.doubled === true;
  if (doubled) need(me.role === 'speaker' && !me.used.double && targetId, 403, 'You cannot use a double vote now.');
  room.votes[me.id] = { targetId, weight: doubled ? 2 : 1 }; if (doubled) me.used.double = true;
  if (voteDone(room)) resolveVote(room);
}
function resolveVote(room) {
  const votes = room.electorate.map(id => ({ id, ...(room.votes[id] || { targetId: null, weight: 1 }) })), counts = new Map();
  for (const v of votes) {
    const target = v.targetId && room.players.find(p => p.id === v.targetId);
    if (!target || group(target) !== 'saboteur') continue;
    stat(room, target.id).heat += v.weight;
    const voter = room.players.find(p => p.id === v.id);
    if (voter && group(voter) !== 'saboteur') stat(room, voter.id).eye++;
  }
  // Skip and missing ballots are abstentions; they never defeat an actual player vote.
  for (const v of votes) if (v.targetId) counts.set(v.targetId, (counts.get(v.targetId) || 0) + v.weight);
  const highest = Math.max(0, ...counts.values()), leaders = [...counts.keys()].filter(k => counts.get(k) === highest);
  const attempt = room.voteAttempt || 1;
  // Signal Stop: a tie in this vote removes nobody and is not voted again.
  if (leaders.length > 1 && room.signalRound === room.round) {
    room.history.push({ type: 'vote', round: room.round, attempt, outs: [], votes, reason: 'signal', tiedIds: leaders });
    settleBets(room, null);
    phase(room, 'voteResult', timer(room, 'voteResult')); return;
  }
  if (leaders.length > 1 && attempt === 1) {
    room.history.push({ type: 'vote', round: room.round, attempt, outs: [], votes, reason: 'revote', tiedIds: leaders });
    room.voteAttempt = 2; room.voteCandidates = leaders; room.votes = {};
    phase(room, 'revoteInfo'); return;
  }
  // An all-abstain re-vote still resolves the original tie among its candidates.
  const pool = leaders.length ? leaders : attempt === 2 ? room.voteCandidates || [] : [];
  const random = pool.length > 1;
  const targetId = pool.length ? pool[random ? crypto.randomInt(pool.length) : 0] : null, outs = remove(room, targetId ? [targetId] : []);
  room.history.push({ type: 'vote', round: room.round, attempt, outs, votes, reason: random ? 'random' : targetId ? 'voted' : 'skip', ...(random ? { tiedIds: pool } : {}) });
  for (const out of outs) {
    if (out.group === 'saboteur') for (const v of votes) { if (v.targetId === out.id) earn(room, v.id, 5, 'Your vote removed a Saboteur'); }
    else for (const p of alive(room).filter(p => group(p) === 'saboteur')) earn(room, p.id, 5, 'A good player was voted out');
    for (const v of votes) if (v.targetId === out.id) { questStep(room, v.id, 'crowd'); if (out.group !== 'saboteur') questStep(room, v.id, 'misdirect'); }
  }
  settleBets(room, targetId);
  phase(room, 'voteResult', outs.length ? (quick(room) ? QUICK_LAST_WORDS : LAST_WORDS_RESULT) : timer(room, 'voteResult')); // Even a winning removal gets its public ejection and full vote ledger.
}
const stat = (room, id) => ((room.stats ||= {})[id] ||= { eye: 0, heat: 0, saves: 0 });
function earn(room, id, n, reason) {
  if(room.players.find(p=>p.id===id)?.bot || !require('./practice-bots').canEarn(room))return;
  const w = wallet(room, id); w.earned += n;
  ((room.earnings ||= {})[id] ||= []).push({ n, reason });
}
function wallet(room, id) {
  const w = ((room.wallet ||= {})[id] ||= { earned: 0, spent: 0, frames: [], frame: '', gifts: {} });
  w.frames ||= []; w.gifts ||= {}; return w;
}
const netOf = (room, id) => wallet(room, id).earned - wallet(room, id).spent;
// a signed-in player's balance is their account's WP (room.snap) plus what changed in this room and is not banked yet (room.sync)
const balance = (room, p) => (room.acct?.[p.id] && room.snap?.[p.id] !== undefined ? room.snap[p.id] + netOf(room, p.id) - (room.sync?.[p.id] || 0) : START_WP + (isTester(p) ? TESTER_WP : 0) + netOf(room, p.id));
const prize = count => count <= 7 ? 15 : count <= 10 ? 20 : 25;
function finish(room) {
  const cast = room.players.filter(p => p.role), win = room.winner;
  refundBets(room);
  const isBad = id => { const p = room.players.find(x => x.id === id); return !!p && group(p) === 'saboteur'; };
  const ballots = room.history.filter(e => e.type === 'vote' && e.votes);
  for (const p of cast) {
    const key = room.quests?.[p.id]?.key;
    if (key === 'clean') questStep(room, p.id, key, p.alive && !ballots.some(e => e.votes.some(v => v.targetId === p.id)) ? 1 : 0);
    if (key === 'hunter') questStep(room, p.id, key, ballots.filter(e => e.votes.some(v => v.id === p.id && isBad(v.targetId))).length);
    if (key === 'nose') questStep(room, p.id, key, (room.pinLog || []).filter(l => isBad(l.pins[p.id])).length);
  }
  for (const p of cast) {
    if ((group(p) === 'saboteur') === (win === 'bad')) earn(room, p.id, prize(cast.length), 'Your team won');
    if (p.alive) earn(room, p.id, 5, 'Still aboard at the end');
  }
  for (const [id, g] of Object.entries(room.ghosts || {})) {
    const right = g.ids.filter((x, i) => ghostRight(g, room.players.find(p => p.id === x), i)).length;
    if (right) earn(room, id, right * 5, 'Ghost guess: ' + right + ' right');
    if (right === g.ids.length) earn(room, id, 5, 'Ghost guess: all right');
  }
  // Awards for this journey; the room keeps a tally across journeys.
  const best = (list, score) => { const top = Math.max(0, ...list.map(score)); return top > 0 ? list.filter(p => score(p) === top).map(p => p.id) : []; };
  const good = cast.filter(p => group(p) !== 'saboteur'), bad = cast.filter(p => group(p) === 'saboteur');
  const lasted = p => { const out = room.history.find(e => e.outs.some(o => o.id === p.id)); return out ? out.round : room.round + 1; };
  const liarScore = p => lasted(p) * 100 - (room.stats?.[p.id]?.heat || 0);
  room.awards = { eye: best(good, p => room.stats?.[p.id]?.eye || 0), liar: bad.length ? best(bad, p => Math.max(1, liarScore(p))).slice(0, 1) : [], guard: best(cast, p => room.stats?.[p.id]?.saves || 0) };
  room.sess ||= {};
  for (const p of cast) {
    const t = room.sess[p.id] ||= { journeys: 0, wins: 0, eye: 0, liar: 0, guard: 0 };
    t.journeys++; if ((group(p) === 'saboteur') === (win === 'bad')) t.wins++;
    for (const k of ['eye', 'liar', 'guard']) if (room.awards[k].includes(p.id)) t[k]++;
  }
  phase(room, 'finished');
}
// Players who are out may make one ghost guess until the journey ends, about the travellers still aboard.
// Good ghosts name the Saboteurs still aboard. Saboteur ghosts match each power still aboard (any good role but a
// plain Passenger) to the traveller holding it.
const ghostKind = me => (group(me) === 'saboteur' ? 'powers' : 'saboteurs');
// A promoted Trainee counts for both the job they started with and the one they took over.
const ghostRight = (g, p, i) => (g.kind === 'powers' ? !!p && (p.role === g.roles[i] || p.originalRole === g.roles[i]) : group(p) === 'saboteur');
const ghostOpen = (room, me) => me.alive === false && !['lobby', 'finished'].includes(room.phase);
const ghostPool = (room, me) => room.players.filter(p => p.id !== me.id && p.role && p.alive !== false && (ghostKind(me) === 'saboteurs' || group(p) !== 'saboteur'));
// The powers still aboard, in a fixed order that says nothing about seats.
const ghostRoles = room => room.players.filter(p => p.alive !== false && p.role && p.role !== 'passenger' && group(p) !== 'saboteur').map(p => p.role).sort((a, b) => Object.keys(ROLES).indexOf(a) - Object.keys(ROLES).indexOf(b));
const ghostNeed = (room, me) => (ghostKind(me) === 'powers' ? ghostRoles(room).length : room.players.filter(p => p.alive !== false && group(p) === 'saboteur').length);
// Every ghost may climb: what they learn at the peak is how they earn their guess points.
const CLIMB_MIN_MS = 12000;
const climbOpen = (room, me) => room.players.includes(me) && me.alive === false && !me.departed && !['lobby', 'finished'].includes(room.phase);
function ghostClimb(room, me) {
  need(climbOpen(room, me), 409, 'The ghost climb opens once you are out.');
  const left = room.players.filter(p => p.id !== me.id && !me.reports.some(r => r.type === 'ghostReveal' && r.targetId === p.id));
  need(left.length, 409, 'You already know every role.');
  (room.climbs ||= {})[me.id] = { seed: crypto.randomInt(2 ** 31), startedAt: Date.now(), done: false };
}
function ghostReveal(room, me, targetId) {
  const run = room.climbs?.[me.id];
  need(climbOpen(room, me) && run && !run.done, 409, 'Start a climb first.');
  need(Date.now() - run.startedAt >= CLIMB_MIN_MS, 409, 'Reach the peak first.');
  const target = room.players.find(p => p.id === targetId && p.id !== me.id);
  need(target && !me.reports.some(r => r.type === 'ghostReveal' && r.targetId === targetId), 400, 'Choose another traveller whose role you have not seen.');
  run.done = true;
  me.reports.push({ type: 'ghostReveal', round: room.round, targetId, role: target.role });
}
function ghostGuess(room, me, ids) {
  need(room.players.includes(me) && me.alive === false && !['lobby', 'finished'].includes(room.phase), 409, 'Only players who are out can make a ghost guess.');
  need(!room.ghosts?.[me.id], 409, 'Your ghost guess is already locked.');
  const count = ghostNeed(room, me), pool = ghostPool(room, me);
  need(count, 409, 'There is nobody left to guess.');
  need(Array.isArray(ids) && ids.length === count && new Set(ids).size === count && ids.every(id => pool.some(p => p.id === id)), 400, 'Choose ' + count + (count === 1 ? ' player.' : ' different players.'));
  const kind = ghostKind(me); (room.ghosts ||= {})[me.id] = { ids: [...ids], round: room.round, kind, ...(kind === 'powers' ? { roles: ghostRoles(room) } : {}) };
}
function lastWords(room, me, text) {
  const entry = room.history.at(-1);
  need(room.phase === 'voteResult' && entry?.type === 'vote' && entry.outs.some(o => o.id === me.id), 403, 'Only the player leaving the train can say last words.');
  need(!entry.lastWords, 409, 'Your last words are already shared.');
  const message = cleanText(text, 120); need(message, 400, 'Write your last words first.');
  entry.lastWords = { id: me.id, text: message };
}
function emote(room, me, key, now = Date.now()) {
  need(EMOTES.includes(key), 400, 'Unknown reaction.');
  need(socialOpen(room), 409, eventOn(room, 'fog') ? 'Fogged windows: no reactions this round.' : 'Reactions are off at night.');
  room.emoteAt ||= {};
  if (now - (room.emoteAt[me.id] || 0) < 900) return false; // one reaction a second, so nobody can drown out a turn
  room.emoteAt[me.id] = now; room.emoteN = (room.emoteN || 0) + 1;
  room.emotes = [...(room.emotes || []).filter(x => now - x.at < 8000), { n: room.emoteN, id: me.id, e: key, at: now }].slice(-16);
  return true;
}
function buy(room, me, kind, key) {
  const table = kind === 'frame' ? FRAMES : kind === 'gift' ? GIFTS : null;
  need(table && Object.hasOwn(table, key), 400, 'Unknown item.');
  const w = wallet(room, me.id);
  if (kind === 'frame') need(!w.frames.includes(key), 409, 'You already own that frame.');
  else need((w.gifts[key] || 0) + GIFT_USES <= 99, 409, 'That is plenty already.');
  need(balance(room, me) >= table[key], 402, 'Not enough WP yet.');
  w.spent += table[key];
  if (kind === 'frame') { w.frames.push(key); w.frame = key; } else w.gifts[key] = (w.gifts[key] || 0) + GIFT_USES;
}
function wear(room, me, frame) {
  const w = wallet(room, me.id);
  need(frame === '' || w.frames.includes(frame), 403, 'Buy that frame in the shop first.');
  w.frame = frame;
}
function throwGift(room, me, item, targetId, now = Date.now()) {
  need(Object.hasOwn(GIFTS, item), 400, 'Unknown item.');
  need(socialOpen(room), 409, eventOn(room, 'fog') ? 'Fogged windows: no throws this round.' : 'Nothing is thrown at night.');
  need(me.alive !== false || ['lobby', 'finished'].includes(room.phase), 403, 'Players who are out can only react.');
  const w = wallet(room, me.id); need((w.gifts[item] || 0) > 0, 403, 'You have none left. Buy more in the shop.');
  const target = room.players.find(p => p.id === targetId && !p.departed);
  need(target && (target.id !== me.id || isTester(me)), 400, 'Pick another traveller.');
  // A speaker gets their first five seconds in peace.
  if (room.phase === 'discussion' && speakerId(room) === target.id && room.deadline && now - (room.deadline - (room.duration || 0) * 1000) < 5000) need(false, 409, 'Let them start speaking first.');
  room.giftAt ||= {};
  if (now - (room.giftAt[me.id] || 0) < 1500) return false;
  room.giftAt[me.id] = now; w.gifts[item]--; room.giftN = (room.giftN || 0) + 1;
  room.gifts = [...(room.gifts || []).filter(x => now - x.at < 10000), { n: room.giftN, from: me.id, to: target.id, item, at: now }].slice(-10);
  return true;
}
function suspect(room, me, targetId) {
  need(PIN_PHASES.includes(room.phase) && me.alive !== false && !me.departed, 409, 'Pins are open in the lounge.');
  need(targetId === null || (targetId !== me.id && alive(room).some(p => p.id === targetId)), 400, 'Pin another player still aboard.');
  room.suspects ||= {};
  if (targetId) room.suspects[me.id] = targetId; else delete room.suspects[me.id];
}
function advance(room) {
  if (room.phase === 'briefing') board(room);
  else if (room.phase === 'boarding') beginNight(room);
  else if (room.phase === 'settling') phase(room, 'night', nightSeconds(room));
  else if (room.phase === 'night') {
    if (['saboteur', 'moves'].includes(nightRole(room))) settleAttack(room);
    room.night.index++;
    if (room.night.index >= nightStages(room).length) resolveNight(room); else phase(room, 'night', nightSeconds(room));
  } else if (room.phase === 'gathering') phase(room, 'morning');
  else if (room.phase === 'morning') { if (room.winner) finish(room); else beginDiscussion(room); }
  else if (room.phase === 'discussion') nextSpeaker(room);
  else if (room.phase === 'voting') resolveVote(room);
  else if (room.phase === 'revoteInfo') beginVote(room, room.voteCandidates);
  else if (room.phase === 'voteResult') { if (room.winner) finish(room); else beginNight(room); }
}
function timed(room) {
  if (!room.paused && room.deadline && Date.now() >= room.deadline) { advance(room); return true; }
  return false;
}
const readFor = (read, from, me) => from === me.id ? true : !!read;
function view(room, me) {
  const finished = room.phase === 'finished', n = room.night, active = room.phase === 'night' ? activeRole(room, me) : null;
  const introduced = !['lobby', 'briefing', 'boarding'].includes(room.phase), bad = introduced && group(me) === 'saboteur';
  // A running match keeps its dealt mix, including matches started before a balance update.
  const roles = room.phase === 'lobby' ? plan(present(room).length, room.settings) : room.players.map(p => p.originalRole || p.role);
  const pins = {}; if (PIN_PHASES.includes(room.phase)) for (const id of Object.values(room.suspects || {})) pins[id] = (pins[id] || 0) + 1;
  const summarize = list => Object.keys(ROLES).filter(k => list.includes(k)).map(role => ({ role, count: list.filter(k => k === role).length }));
  const info = p => ({ id: p.id, name: p.name, bot: !!p.bot, departed: !!p.departed, ...(p.kicked ? { kicked: true } : {}), alive: p.alive !== false,
    seat: (room.seatOrder || []).indexOf(p.id) + 1, avatarIndex: p.avatarIndex ?? room.players.indexOf(p), voteLocked: room.phase === 'voting' && !!room.votes?.[p.id], frame: room.wallet?.[p.id]?.frame || '', pins: pins[p.id] || 0, host: p.id === room.hostId,
    ...(finished && p.role ? { role: p.role, group: group(p), alignment: group(p) === 'saboteur' ? 'bad' : 'good' } : p.alive === false ? { alignment: group(p) === 'saboteur' ? 'bad' : 'good' } : {}) });
  return {
    game: 'last-train', rulesVersion: 2, code: room.code, version: room.version, phase: room.phase, match: room.match || 0, round: room.round || 0, step: room.step || 0,
    deadline: room.deadline, duration: room.duration, remainingMs: room.paused ? room.pauseRemaining : room.deadline ? Math.max(0, room.deadline - Date.now()) : null, now: Date.now(), hostId: room.hostId, meId: me.id, paused: !!room.paused,
    settings: room.settings, catalog: ROLES, notice: room.notice || null, nightRole: active, nightPhase: room.nightMode === 'shared' && room.phase === 'night' ? room.night.index + 1 : null, nightOrder: room.phase === 'lobby' ? NIGHT.filter(role => role === 'saboteur' || roles.includes(role)) : nightStages(room), teamSlots: teamSlots(present(room).length),
    mix: summarize(roles), nextMix: finished ? summarize(plan(present(room).length, room.settings)) : null,
    voteAttempt: room.voteAttempt || 1, voteCandidates: ['voting','revoteInfo'].includes(room.phase) ? room.voteCandidates || null : null,
    counts: room.phase === 'lobby' ? null : Object.fromEntries(['passenger', 'crew', 'saboteur'].map(g => [g, (finished ? alive(room).filter(p => group(p) === g).length : roles.filter(role => ROLES[role]?.group === g).length)])),
    observers: (room.observers || []).map(o => ({ id: o.id, name: o.name, avatarIndex: o.avatarIndex ?? 0, observer: true })),
    players: (room.seatOrder?.length ? room.seatOrder.map(id => room.players.find(p => p.id === id)).filter(Boolean) : room.players).map(info),
    history: (room.history || []).map(entry => (!finished && entry.type === 'vote' && (room.sealedRounds || []).includes(entry.round) ? { ...entry, votes: null, sealed: true } : entry)).map(entry => ({ ...entry, outs: entry.outs.map(p => finished ? { ...p, alignment: p.group === 'saboteur' ? 'bad' : 'good' } : { id: p.id, ...(entry.type === 'night' && p.causes ? { causes: p.causes } : {}), alignment: p.group === 'saboteur' ? 'bad' : 'good' }) })), speeches: (room.speeches || []).map(m => m.audio ? { ...m, audio: { ...m.audio, available: me.id === m.id || room.phase !== 'discussion' || room.round !== m.round || speakerId(room) !== m.id } } : m), speakerId: speakerId(room), speakingOrder: room.speakingOrder || [], speakerIndex: room.speakerIndex || 0,
    storageWarning: unsaved(), winner: finished ? room.winner : null, winReason: finished ? room.winReason : null, signalStop: room.signalRound === room.round && ['gathering', 'morning', 'discussion', 'voting', 'revoteInfo', 'voteResult'].includes(room.phase),
    emotes: room.emotes || [], emoteN: room.emoteN || 0, gifts: room.gifts || [], giftN: room.giftN || 0, emoteKeys: EMOTES, socialOpen: socialOpen(room), pinsOpen: PIN_PHASES.includes(room.phase),
    event: room.event && room.event.round === room.round && room.phase !== 'lobby' ? { key: room.event.key, ...EVENTS[room.event.key] } : null,
    nightLog: finished ? room.nightLog || [] : null, ghosts: finished ? room.ghosts || {} : null,
    quests: finished ? Object.fromEntries(Object.entries(room.quests || {}).map(([id, q]) => [id, questView(q)])) : null, ghostWhispers: finished ? room.ghostWhispers || {} : null, betLog: finished ? room.betLog || [] : null,
    whisperWords: WHISPER_WORDS, betStakes: BET_STAKES, saboteurCount: room.phase === 'lobby' ? null : room.players.filter(p => group(p) === 'saboteur').length,
    prices: { frames: FRAMES, gifts: GIFTS, uses: GIFT_USES }, awards: finished ? room.awards || null : null, session: room.sess || {}, speakSeconds: speakSeconds(room),
    me: { alive: me.alive !== false, departed: !!me.departed, role: introduced ? me.role || null : null, group: introduced ? group(me) || null : null,
      used: introduced ? me.used || {} : {}, reports: introduced ? me.reports || [] : [], promotedAt: introduced ? me.promotedAt : null,
      letters: (room.letters || []).filter(m => m.to === me.id || m.from === me.id).map(({ id, from, to, text, round, sentAt, read }) => ({ id, from, to, text, round, sentAt, read: readFor(read, from, me) })),
      wallet: { wp: balance(room, me), frames: wallet(room, me.id).frames, frame: wallet(room, me.id).frame, gifts: wallet(room, me.id).gifts, earnings: room.earnings?.[me.id] || [], tester: isTester(me) },
      suspect: PIN_PHASES.includes(room.phase) ? room.suspects?.[me.id] || null : null,
      quest: introduced ? questView(room.quests?.[me.id]) : null,
      whisperOpen: whisperOpen(room, me), whisper: room.ghostWhispers?.[me.id] || null,
      betOpen: betOpen(room, me) && !room.bets?.[me.id], bet: room.bets?.[me.id] || null, lastBet: (room.betLog || []).filter(b => b.id === me.id).at(-1) || null,
      observer: !!me.observer, climbOpen: climbOpen(room, me), ghostClimb: room.climbs?.[me.id] ? { seed: room.climbs[me.id].seed, done: room.climbs[me.id].done } : null, ghostGuess: room.ghosts?.[me.id] || null, ghostOpen: ghostOpen(room, me), ghostNeed: me.alive === false ? ghostNeed(room, me) : null, ghostKind: me.alive === false && introduced ? ghostKind(me) : null, ghostRoles: me.alive === false && introduced && ghostKind(me) === 'powers' ? ghostRoles(room) : null, listen: room.phase === 'night' ? room.night?.listen?.[me.id] || null : null, sightsLeft: introduced && me.role === 'witness' ? sightsLeft(me) : null,
      voiceDraft: room.voiceDrafts?.[me.id] || null, ready: !!room.ready?.[me.id], nightChoice: introduced ? n?.choices[me.id] || null : null, vote: room.votes?.[me.id] || null,
      ...(introduced && me.role === 'medic' && me.alive ? { medicine: room.medicine, ...(active === 'medic' ? { patientId: stopped(n, me.id) ? null : n.patientId, blocked: stopped(n, me.id), medicineChoice: n.medicine } : {}) } : {}),
      ...(bad ? { allies: room.players.filter(p => group(p) === 'saboteur').map(p => ({ id: p.id, name: p.name, role: p.role, alive: p.alive })),
        ...(me.alive && room.phase === 'night' ? { attackId: n.attackId, ...(active === 'saboteur' ? { teamChoices: alive(room).filter(p => group(p) === 'saboteur').map(p => ({ id: p.id, attackId: n.choices[p.id]?.attackId || null, walkerId: n.choices[p.id]?.walkerId || null, selected: !!n.choices[p.id] && !n.choices[p.id].walkOnly })), whispers: n.whispers } : {}) } : {}) } : {}),
    },
  };
}
module.exports = { afterDeparture, QUESTS, WHISPER_WORDS, BET_STAKES, ghostWhisper, bet, BAD_SPECIALS, CREW_ROLES, SOLO_CREW, RUB_TAPS, earnFlip, sharpen, ghostClimb, ghostReveal, CLIMB_MIN_MS, listen, LISTEN_FLIPS, restart, seatObservers, EVENTS, eventOn, ghostGuess, sightsLeft, EMOTES, FRAMES, GIFTS, GIFT_USES, START_WP, SPEAK_SECONDS, emote, buy, wear, throwGift, suspect, lastWords, finish, balance, netOf, wallet, ROLES, NIGHT, SHARED_NIGHT, activeRole, TIMERS, teamSlots, validateLoadout, randomLoadout, need, group, alive, present, plan, start, board, beginNight, nightStages, nightRole, nightChoice, settleAttack, medicineChoice, whisper, sendLetter, dismissLetters, remove, resolveNight, beginDiscussion, speakerId, speak, nextSpeaker, finishSpeech, beginVote, vote, resolveVote, advance, timed, view, phase };
