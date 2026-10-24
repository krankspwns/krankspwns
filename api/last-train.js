const crypto = require('node:crypto');
const store = require('../lib/last-train-store');
const rules = require('../lib/last-train-rules');
const voice = require('../lib/last-train-voice');
const { need, present } = rules;
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const secret = () => crypto.randomBytes(24).toString('base64url');
const equal = (a, b) => crypto.timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
// Names stay short so they fit under a seat in the lounge and on the carriage map.
const NAME_MAX = 10;
const cleanName = value => Array.from(String(value || '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '').replace(/\s+/g, ' ').trim()).slice(0, NAME_MAX).join('').trim();
const recovery = (room, p) => crypto.createHmac('sha256', p.tokenHash).update('last-train:' + room.code + ':' + p.id).digest('base64url').slice(0, 24);
function player(name) { const tok = secret(); return { p: { id: crypto.randomUUID(), name, tokenHash: hash(tok) }, tok }; }
function view(room, me) { const result = rules.view(room, me); result.me.recoveryCode = recovery(room, me); return result; }
async function execute(req, body) {
  const action = req.method === 'GET' ? (body.voice ? 'voice' : 'state') : body.action;
  need(['voice', 'beginVoice', 'speakVoice', 'state', 'create', 'join', 'settings', 'shuffleRoles', 'start', 'ready', 'night', 'medicine', 'advance', 'speak', 'finishSpeech', 'whisper', 'letter', 'dismissLetters', 'vote', 'pause', 'resume', 'leave', 'emote', 'buy', 'wear', 'throw', 'suspect', 'listen', 'earnFlip', 'sharpen', 'ghostClimb', 'ghostReveal', 'lastWords', 'ghostGuess', 'restart'].includes(action), 400, 'Unknown choice. Please reload.');
  if (action === 'create') {
    const name = cleanName(body.name); need(name, 400, 'Enter your name.');
    let code;
    for (let i = 0; i < 10; i++) {
      code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[crypto.randomInt(24)]).join('');
      if (!await store.load(code)) break;
      code = null;
    }
    need(code, 503, 'Please try creating the room again.');
    const { p, tok } = player(name); p.avatarIndex = crypto.randomInt(12);
    const room = { code, version: 0, hostId: p.id, phase: 'lobby', rulesVersion: 2, settings: { extra: 'brave', blocker: true, discussion: 'chat', speakSeconds: 45, autoShuffle: process.env.LAST_TRAIN_AUTO_SHUFFLE !== 'off' }, players: [p], history: [], step: 0 };
    await store.save(room); return { ...view(room, p), tok };
  }
  const code = String(body.code || '').toUpperCase(); need(/^[A-Z]{4}$/.test(code), 400, 'Enter a four-letter room code.');
  // A room that was just written can briefly read as missing from the database; look once more before saying it is gone.
  let room = await store.load(code);
  if (!room) { await new Promise(done => setTimeout(done, 350)); room = await store.load(code); }
  need(room, 404, 'Room not found.');
  let upgraded = false;
  if (room.rulesVersion !== 2) {
    Object.assign(room, { rulesVersion: 2, phase: 'lobby', round: 0, step: (room.step || 0) + 1, deadline: null, duration: null, night: null, votes: {}, history: [], speeches: [], seatOrder: null, paused: false, winner: null, receipts: [], notice: 'Last Train has a new journey and night order. The host can start the new game.' });
    room.settings = { ...room.settings, discussion: 'in-person' };
    for (const p of room.players) { delete p.role; delete p.originalRole; delete p.alive; p.used = {}; p.reports = []; }
    upgraded = true;
  }
  if (action === 'join') {
    const name = cleanName(body.name); need(name, 400, 'Enter your name.');
    room.observers ||= [];
    let me = [...room.players, ...room.observers].find(p => p.name.toLowerCase() === name.toLowerCase()), tok;
    if (me) {
      const replay = body.recoveryCode ? crypto.createHmac('sha256', String(body.recoveryCode).trim()).update('lt:' + code + ':' + me.id + ':' + body.requestId).digest('base64url') : null;
      if (me.recoveryReceipt === body.requestId && replay && equal(me.tokenHash, hash(replay))) return { ...view(room, me), tok: replay };
      need(body.recoveryCode && equal(recovery(room, me), String(body.recoveryCode).trim()), 409, 'That name is already here. Enter its private rejoin code.');
      tok = replay; me.tokenHash = hash(tok); me.departed = false; me.recoveryReceipt = body.requestId;
    } else {
      // Mid-journey arrivals watch as Observers and take a seat when the next journey starts.
      const watching = room.phase !== 'lobby';
      if (watching) { need(room.settings.observers !== false, 409, 'This journey has started. The host has turned off observers.'); need(room.observers.length < 12, 409, 'This room has enough observers.'); }
      else need(room.players.length < 12, 409, 'This room already has 12 players.');
      const created = player(name); me = created.p; tok = created.tok;
      const taken = [...room.players.map((p, index) => p.avatarIndex ?? index), ...room.observers.map(o => o.avatarIndex)];
      const available = Array.from({ length: 12 }, (_, i) => i).filter(i => !taken.includes(i));
      me.avatarIndex = available.length ? available[crypto.randomInt(available.length)] : crypto.randomInt(12);
      if (watching) { me.observer = true; me.alive = false; room.observers.push(me); } else room.players.push(me);
    }
    if (!room.players.some(p => p.id === room.hostId && !p.departed)) room.hostId = me.id;
    await store.save(room); return { ...view(room, me), tok };
  }
  const me = room.players.find(p => p.id === body.pid) || (room.observers || []).find(p => p.id === body.pid);
  need(me && body.tok && equal(me.tokenHash, hash(body.tok)), 401, 'Use your private rejoin code to return to the game.');
  const fingerprint = hash(JSON.stringify([action, body.match, body.round, body.step, body.power, body.targetId, body.attackId, body.doubled, body.extra, body.blocker, body.discussion, body.text, body.roles, body.letterIds, body.ids, body.to, body.events, body.observers, body.autoShuffle, body.footsteps, body.e, body.kind, body.key, body.item, body.frame, body.voiceId, body.mimeType, body.durationMs, body.audioData ? hash(body.audioData) : null]));
  const receipt = (room.receipts || []).find(r => r.pid === me.id && r.id === body.requestId);
  if (action !== 'state' && receipt) { need(receipt.fingerprint === fingerprint, 409, 'That request was already used. Reload the game.'); return view(room, me); }
  need(!me.departed || ['state', 'voice', 'dismissLetters', 'wear', 'buy'].includes(action), 403, 'Use your rejoin code to come back.');
  need(!me.observer || ['state', 'voice', 'emote', 'leave'].includes(action), 403, 'Observers watch this journey. You take a seat when the next journey starts.');
  const changed = rules.timed(room);
  if (action === 'voice') {
    const speech = room.speeches?.find(m => m.audio?.id === body.voice);
    need(speech, 404, 'Recording not found.');
    need(me.id === speech.id || room.phase !== 'discussion' || room.round !== speech.round || rules.speakerId(room) !== speech.id, 409, 'You can listen after their turn ends.');
    const clip = await store.loadVoice(code, room.match, body.voice); need(clip, 404, 'This recording has expired.');
    if (changed || upgraded) await store.save(room); return clip;
  }
  if (action === 'state') { if (changed || upgraded) await store.save(room); return view(room, me); }
  // Versioned phase fences stop delayed choices applying to a different night or phase.
  if (action === 'speakVoice') need(body.match === room.match && body.round === room.round, 409, 'This recording belongs to an earlier turn.');
  else if (['letter', 'dismissLetters'].includes(action)) need(body.match === (room.match || 0), 409, 'A new journey has started. Open your letters again.');
  // Reactions, the shop and pins are not tied to a turn, so a phase change never rejects them.
  else if (!['leave', 'emote', 'buy', 'wear', 'throw', 'suspect', 'ghostGuess', 'restart', 'listen', 'earnFlip', 'sharpen', 'ghostClimb', 'ghostReveal'].includes(action)) need(body.match === (room.match || 0) && body.round === (room.round || 0) && body.step === (room.step || 0), 409, 'The game moved on. Check the current screen.');
  const host = () => need(room.hostId === me.id, 403, 'Only the host can do that.');
  need(!room.paused || ['resume', 'leave', 'dismissLetters', 'speakVoice', 'emote', 'buy', 'wear', 'throw'].includes(action), 409, 'The game is paused.');
  if (action === 'settings') {
    host(); need(['lobby','finished'].includes(room.phase), 409, 'Change roles before the game starts.');
    need(['brave', 'speaker'].includes(body.extra) && typeof body.blocker === 'boolean' && ['in-person', 'chat'].includes(body.discussion), 400, 'Choose the role mix on screen.');
    const speakSeconds = body.speakSeconds === undefined ? room.settings.speakSeconds || 45 : body.speakSeconds;
    need(rules.SPEAK_SECONDS.includes(speakSeconds), 400, 'Choose 15, 20, 30 or 45 seconds.');
    const roles = body.roles === undefined ? room.settings.roles || null : body.roles === null ? null : rules.validateLoadout(present(room).length, body.roles);
    room.settings = { extra: body.extra, blocker: body.blocker, discussion: body.discussion, speakSeconds, roles, events: body.events === undefined ? room.settings.events !== false : !!body.events, observers: body.observers === undefined ? room.settings.observers !== false : !!body.observers, autoShuffle: body.autoShuffle === undefined ? !!room.settings.autoShuffle : !!body.autoShuffle, footsteps: body.footsteps === undefined ? room.settings.footsteps !== false : !!body.footsteps };
  }
  if (action === 'shuffleRoles') { host(); need(['lobby','finished'].includes(room.phase), 409, 'Shuffle roles before the journey starts.'); room.settings.roles = rules.randomLoadout(present(room).length); }
  if (action === 'start') { host(); need(['lobby', 'finished'].includes(room.phase), 409, 'A game is already running.'); rules.start(room); }
  if (action === 'ready') {
    need(room.phase === 'briefing' && me.alive, 409, 'You cannot use Ready now.');
    room.ready[me.id] = true;
    if (rules.alive(room).every(p => room.ready[p.id])) rules.board(room);
  }
  if (action === 'night') rules.nightChoice(room, me, body);
  if (action === 'medicine') rules.medicineChoice(room, me, body);
  if (action === 'vote') rules.vote(room, me, body);
  if (action === 'beginVoice') voice.begin(room, me);
  if (action === 'speakVoice') { const clip = voice.prepare(room, me, body); await store.saveVoice(code, room.match, clip); voice.publish(room, me, clip); }
  if (action === 'speak') rules.speak(room, me, body.text);
  if (action === 'whisper') rules.whisper(room, me, body.text);
  if (action === 'letter') rules.sendLetter(room, me, body.targetId, body.text);
  if (action === 'dismissLetters') rules.dismissLetters(room, me, body.letterIds);
  if (action === 'finishSpeech') rules.finishSpeech(room, me);
  if (action === 'emote' && !rules.emote(room, me, String(body.e))) return view(room, me);
  if (action === 'buy') rules.buy(room, me, String(body.kind), String(body.key));
  if (action === 'wear') rules.wear(room, me, String(body.frame ?? ''));
  if (action === 'throw' && !rules.throwGift(room, me, String(body.item), String(body.targetId || ''))) return view(room, me);
  if (action === 'suspect') rules.suspect(room, me, body.targetId ? String(body.targetId) : null);
  if (action === 'lastWords') rules.lastWords(room, me, body.text);
  if (action === 'ghostGuess') rules.ghostGuess(room, me, body.ids);
  if (action === 'listen') rules.listen(room, me);
  if (action === 'earnFlip') rules.earnFlip(room, me);
  if (action === 'sharpen') rules.sharpen(room, me);
  if (action === 'ghostClimb') rules.ghostClimb(room, me);
  if (action === 'ghostReveal') rules.ghostReveal(room, me, body.targetId);
  if (action === 'restart') { host(); need(room.phase !== 'lobby', 409, 'There is no journey to restart.'); need(['lobby', 'deal'].includes(body.to), 400, 'Choose how to restart.'); rules.restart(room, body.to); }
  if (action === 'advance') {
    host(); need(['morning', 'voteResult'].includes(room.phase), 409, 'Everyone gets their full turn. Wait for this step to finish.'); rules.advance(room);
  }
  if (action === 'pause') {
    host(); need(!['lobby', 'finished'].includes(room.phase) && !room.paused, 409, 'There is no running timer to pause.');
    room.pauseRemaining = room.deadline ? Math.max(0, room.deadline - Date.now()) : null;
    room.deadline = null; room.paused = true; room.step++;
  }
  if (action === 'resume') {
    host(); need(room.paused, 409, 'The game is already running.');
    room.paused = false; room.deadline = room.pauseRemaining === null ? null : Date.now() + room.pauseRemaining; room.pauseRemaining = null; room.step++;
  }
  if (action === 'leave' && me.observer) room.observers = room.observers.filter(o => o.id !== me.id);
  else if (action === 'leave') {
    if (room.phase === 'lobby') room.players = room.players.filter(p => p.id !== me.id);
    else me.departed = true;
    if (room.hostId === me.id) room.hostId = present(room).find(p => p.alive !== false)?.id || present(room)[0]?.id || null;
    // Departure never changes alive/group counts or committed actions. Timed phases handle missing input.
  }
  room.receipts = [...(room.receipts || []), { pid: me.id, id: body.requestId, fingerprint }].slice(-200);
  await store.save(room); return view(room, me);
}
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    need(['GET', 'POST'].includes(req.method), 405, 'Method not allowed.');
    const body = req.method === 'GET' ? { ...req.query, tok: req.headers?.['x-tok'] } : typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    need(body && typeof body === 'object' && !Array.isArray(body), 400, 'Please refresh and try again.');
    if (req.method === 'POST') {
      need(typeof body.requestId === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId), 400, 'Please refresh and try again.');
      if (['create', 'join'].includes(body.action)) await store.rateLimit(req.headers?.['x-forwarded-for'] || 'local');
    }
    let result;
    for (let i = 0; i < 12; i++) {
      try { result = await execute(req, body); break; }
      catch (error) { if (!(error instanceof store.Conflict) || i === 11) throw error; await new Promise(resolve => setTimeout(resolve, 5 + crypto.randomInt(40) + i * 10)); }
    }
    res.status(200).json(result);
  } catch (error) {
    const status = error instanceof store.Conflict ? 503 : error instanceof SyntaxError ? 400 : error.status || 500;
    if (status === 500) console.error(error);
    res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : error.message });
  }
};
