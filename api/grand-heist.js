const { createRoomApi, need } = require("../lib/room-api");
const R = require("../lib/heist-rules"),
  bots = require("../lib/heist-bot");
const api = createRoomApi({
  ns: "grand-heist",
  min: 5,
  max: 12,
  init(room) {
    room.settings = { discussionSeconds: 60, specials: true };
    room.step = 0;
  },
  settings(room, body) {
    const next = { ...room.settings };
    if (body.discussionSeconds !== undefined) {
      need(
        [45, 60, 90].includes(body.discussionSeconds),
        400,
        "Choose 45, 60 or 90 seconds.",
      );
      next.discussionSeconds = body.discussionSeconds;
    }
    if (body.specials !== undefined) {
      need(
        typeof body.specials === "boolean",
        400,
        "Choose whether to use special roles.",
      );
      next.specials = body.specials;
    }
    room.settings = next;
  },
  start: R.start,
  tick(room) {
    const before = room.phase;
    let changed = R.tick(room);
    changed = bots.tick(room) || changed;
    if (room.phase === "live") {
      const win = R.win(room);
      if (win) {
        R.finish(room, win);
        changed = true;
      }
    }
    return changed || before !== room.phase;
  },
  results: (room) =>
    room.players
      .filter((p) => p.team === room.winner)
      .map((p) => ({ id: p.id, place: 1 })),
  onLeave(room) {
    if (
      room.phase === "voting" &&
      room.electorate.every(
        (id) =>
          Object.hasOwn(room.votes, id) ||
          room.players.find((p) => p.id === id)?.departed,
      )
    )
      R.resolveVote(room);
  },
  actions: {
    ...Object.fromEntries(
      [
        "move",
        "beginTask",
        "finishTask",
        "cancelTask",
        "pickup",
        "steal",
        "deliver",
        "hold",
        "knockout",
        "revive",
        "sabotage",
        "camera",
        "report",
        "emergency",
        "chat",
        "vote",
      ].map((name) => [name, (room, p, body) => R[name](room, p, body)]),
    ),
    advance(room, p, b, { host }) {
      host();
      R.need(b.step === room.step, 409, "The meeting moved on.");
      need(room.phase === "discussion", 409, "The discussion is over.");
      need(
        Date.now() - room.lastMeetingAt >= 10000,
        409,
        "Give everyone at least ten seconds to speak.",
      );
      R.beginVote(room);
    },
  },
  view: R.view,
});
module.exports = api.handler;
module.exports._rules = R;
