// Practice players act from their own filtered view; they never inspect other roles or hidden positions.
const R = require("./heist-rules"),
  W = R.W;
const proof = (c) =>
  c.kind === "wires"
    ? c.puzzle.left.map((v) => c.puzzle.right.indexOf(v))
    : c.kind === "memory"
      ? c.puzzle.sequence
      : c.kind === "scan"
        ? c.puzzle.spots
        : [0, 0, 2, 0, 0, 3];
const pick = (a) => (a.length ? a[Math.floor(Math.random() * a.length)] : null);
function tick(room) {
  if (!["live", "discussion", "voting"].includes(room.phase)) return false;
  let changed = false;
  const now = Date.now();
  for (const p of room.players.filter((p) => p.bot || p.departed)) {
    if (now < (p.botAt || 0)) continue;
    p.botAt = now + 650;
    changed = true;
    const v = R.view(room, p),
      b = { step: room.step };
    p.botMemory ||= {};
    const seen = v.events.find(
      (e) => e.kind === "knockout" && e.actor !== p.id,
    );
    if (seen) p.botMemory.accused = seen.actor;
    try {
      if (
        room.phase === "discussion" &&
        p.alive &&
        !room.chat.some((m) => m.id === p.id)
      ) {
        const accused = room.players.find((q) => q.id === p.botMemory.accused),
          where = W.roomAt(v.me.position)?.name || "hall";
        R.chat(room, p, {
          ...b,
          text:
            p.team === "thief"
              ? "I was checking an exhibit in the " + where + "."
              : accused
                ? "I saw " + accused.name + " knock someone out."
                : "I was working in the " +
                  where +
                  ". Did anyone see someone leave?",
        });
        continue;
      }
      if (
        room.phase === "voting" &&
        p.alive &&
        !Object.hasOwn(room.votes, p.id)
      ) {
        const accused = v.players.find(
            (q) => q.id === p.botMemory.accused && q.alive,
          ),
          choices = v.players.filter(
            (q) => q.alive && q.id !== p.id && !v.me.allies.includes(q.id),
          );
        const target =
          accused ||
          (p.team === "thief" || Math.random() < 0.35 ? pick(choices) : null);
        R.vote(room, p, { ...b, targetId: target?.id || null });
        continue;
      }
      if (room.phase !== "live" || (!p.alive && p.team === "thief")) continue;
      if (p.role === "medic" && !p.usedMedic && p.alive) {
        const body = v.bodies.find((q) => now - q.at < 18000);
        if (body) {
          if (W.distance(v.me.position, body) < 45)
            R.revive(room, p, { ...b, bodyId: body.id });
          else R.move(room, p, { ...b, x: body.x, y: body.y });
          continue;
        }
      }
      if (p.alive && v.bodies.length && p.team !== "thief") {
        const body = v.bodies[0];
        if (W.distance(v.me.position, body) < 52)
          R.report(room, p, { ...b, bodyId: body.id });
        else R.move(room, p, { ...b, x: body.x, y: body.y });
        continue;
      }
      if (p.team === "thief" && p.alive) {
        const victim = v.nearby.find((q) => !v.me.allies.includes(q.id));
        if (
          victim &&
          !p.bag &&
          now >= v.me.killAt &&
          (v.nearby.length < 3 || Math.random() < 0.1)
        ) {
          if (W.distance(v.me.position, victim) < 38)
            R.knockout(room, p, { ...b, targetId: victim.id });
          else R.move(room, p, { ...b, x: victim.x, y: victim.y });
          continue;
        }
        const crate = W.TRANSPORT.find(
          (s) =>
            ["gallery", "vault"].includes(s.room) &&
            W.distance(v.me.position, s) < 40,
        );
        if (crate && !p.bag && room.thefts < 2 && Math.random() < 0.18) {
          R.steal(room, p, { ...b, station: crate.id });
          continue;
        }
        if (now >= v.me.sabotageAt && Math.random() < 0.12) {
          R.sabotage(room, p, { ...b, kind: "lights" });
          continue;
        }
      }
      if (p.challenge) {
        if (now - p.challenge.startedAt >= p.challenge.minMs + 700)
          R.finishTask(room, p, {
            ...b,
            challengeId: p.challenge.id,
            proof: proof(p.challenge),
          });
        continue;
      }
      if (p.bag) {
        const dest = W.TRANSPORT.find((s) => s.id === p.bag.dest);
        if (W.distance(v.me.position, dest) < 42) R.deliver(room, p, b);
        else if (W.distance(v.me.position, p.path?.at(-1) || v.me.position) < 6)
          R.move(room, p, { ...b, x: dest.x, y: dest.y });
        continue;
      }
      let target =
        p.botPlan &&
        [...v.me.jobs, ...v.recovery, ...v.joints].find(
          (j) => j.id === p.botPlan && !j.done,
        );
      if (!target) {
        target = pick([
          ...v.me.jobs.filter((j) => !j.done),
          ...v.recovery.filter((j) => !j.done),
          ...v.joints.filter((j) => !j.done),
        ]);
        p.botPlan = target?.id;
      }
      if (!target) {
        const destination = pick(W.ROOMS);
        R.move(room, p, {
          ...b,
          x: destination.x + 120,
          y: destination.y + 110,
        });
        continue;
      }
      if (W.distance(v.me.position, target) < 40) {
        if (target.id.startsWith("statue-"))
          R.hold(room, p, { ...b, jobId: target.id, pull: 1 });
        else if (target.kind === "carry")
          R.pickup(room, p, { ...b, jobId: target.id });
        else R.beginTask(room, p, { ...b, jobId: target.id });
      } else if (W.distance(v.me.position, p.path?.at(-1) || v.me.position) < 6)
        R.move(room, p, { ...b, x: target.x, y: target.y });
    } catch (e) {
      if (![400, 403, 409, 429].includes(e.status)) throw e;
      p.botPlan = null;
    }
  }
  return changed;
}
module.exports = { tick, proof };
