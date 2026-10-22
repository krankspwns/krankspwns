const crypto = require('node:crypto');
const rules = require('./last-train-rules');
const { need } = rules;
const MAX_BYTES = 256 * 1024;
function begin(room, me) {
  need(room.phase === 'discussion' && me.alive && rules.speakerId(room) === me.id, 403, 'Wait for your speaking turn.');
  need(!room.speeches.some(m => m.round === room.round && m.id === me.id), 409, 'You have already shared this turn.');
  room.voiceDrafts ||= {};
  room.voiceDrafts[me.id] ||= { id: crypto.randomUUID(), round: room.round };
}
function prepare(room, me, body) {
  const draft = room.voiceDrafts?.[me.id];
  need(draft && draft.id === body.voiceId && draft.round === room.round, 409, 'This recording belongs to an earlier turn.');
  const ownTurn = room.phase === 'discussion' && rules.speakerId(room) === me.id;
  need(ownTurn || draft.expiresAt > Date.now(), 409, 'The recording arrived too late. Please use your next turn.');
  need(!room.speeches.some(m => m.round === room.round && m.id === me.id), 409, 'You have already shared this turn.');
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.split(';')[0].trim().toLowerCase() : '';
  need(['audio/webm', 'audio/ogg', 'audio/mp4'].includes(mimeType), 400, 'This recording format is not supported. Try a typed message.');
  need(Number.isFinite(body.durationMs) && body.durationMs >= 100 && body.durationMs <= 20000, 400, 'Keep your recording within 20 seconds.');
  need(typeof body.audioData === 'string' && body.audioData.length <= Math.ceil(MAX_BYTES / 3) * 4 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.audioData), 413, 'The recording is too large or could not be read. Try a shorter clip.');
  const bytes = Buffer.from(body.audioData, 'base64');
  const valid = mimeType === 'audio/webm' ? bytes.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex')) : mimeType === 'audio/ogg' ? bytes.subarray(0, 4).toString() === 'OggS' : bytes.subarray(4, 8).toString() === 'ftyp';
  need(bytes.length > 16 && bytes.length <= MAX_BYTES && valid, 400, 'The recording could not be read. Please try again.');
  return { id: draft.id, mimeType, durationMs: Math.round(body.durationMs), data: body.audioData };
}
function publish(room, me, clip) {
  room.speeches.push({ round: room.round, id: me.id, audio: { id: clip.id, mimeType: clip.mimeType, durationMs: clip.durationMs } });
  delete room.voiceDrafts[me.id];
  // A late upload must never consume the following player's turn.
  if (room.phase === 'discussion' && rules.speakerId(room) === me.id) rules.nextSpeaker(room);
}
module.exports = { begin, prepare, publish, MAX_BYTES };
