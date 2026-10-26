// Bots wait a moment before each move so the table feels human. The wait is stored on the room, so
// whichever request arrives first after it ends plays the move. Set BOT_FAST=1 (tests) to skip it.
const crypto = require('node:crypto');
const MIN_MS = 900, SPREAD_MS = 1800;
// Returns { act, changed }. `changed` means the room was modified and must be saved.
function pace(room) {
  if (process.env.BOT_FAST === '1') return { act: true, changed: false };
  const now = Date.now();
  if (!room.botAt) { room.botAt = now + MIN_MS + crypto.randomInt(SPREAD_MS); return { act: false, changed: true }; }
  if (now < room.botAt) return { act: false, changed: false };
  room.botAt = null;
  return { act: true, changed: true };
}
module.exports = { pace };

