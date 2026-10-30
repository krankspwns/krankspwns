const crypto = require("node:crypto"),
  W = require("../public/heist/world");
const need = (ok, status, message) => {
  if (!ok) throw Object.assign(Error(message), { status });
};
const pick = (a) => a[crypto.randomInt(a.length)],
  id = () => crypto.randomUUID(),
  shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
const living = (r) => r.players.filter((p) => p.alive),
  closed = (r, now = Date.now()) =>
    r.sabotage?.kind === "door" && r.sabotage.until > now
      ? [r.sabotage.door]
      : [];
const pos = (p, now = Date.now()) => W.position(p, now);
const phase = (r, name, seconds = null) => {
  r.phase = name;
  r.step = (r.step || 0) + 1;
  r.deadline = seconds === null ? null : Date.now() + seconds * 1000;
};
const stop = (p, now = Date.now()) => {
  p.pos = pos(p, now);
  p.path = [p.pos];
  p.walkAt = now;
};
const radius = (r, p) =>
  r.sabotage?.kind === "lights" &&
  r.sabotage.until > Date.now() &&
  p.team !== "thief"
    ? 80
    : 185;
const sees = (r, p, q) =>
  W.distance(pos(p), q) <= radius(r, p) && W.line(pos(p), q, closed(r));
const cameraSees = (p, q) =>
  p.camera?.until > Date.now() && W.roomAt(q)?.id === p.camera.room;
const publicPerson = (p, i) => ({
  id: p.id,
  name: p.name,
  avatarIndex: p.avatarIndex ?? i,
  bot: !!p.bot,
  departed: !!p.departed,
});
function fence(r, b) {
  need(b.step === r.step, 409, "The game moved on. Check the current screen.");
}
function active(r, p, b) {
  fence(r, b);
  need(r.phase === "live", 409, "Wait until the museum opens again.");
  need(p.alive, 403, "You are out. You can still help with jobs.");
}
function near(r, p, point, d = 48) {
  need(
    W.distance(pos(p), point) <= d && W.line(pos(p), point, closed(r)),
    409,
    "Move closer first.",
  );
}
function progress(r) {
  const done =
    r.players
      .filter((p) => p.team === "staff")
      .flatMap((p) => p.jobs || [])
      .filter((j) => j.done).length +
    (r.joints || []).filter((j) => j.done).length +
    (r.recovery || []).filter((j) => j.done).length;
  return {
    done,
    total:
      r.players
        .filter((p) => p.team === "staff")
        .reduce((n, p) => n + (p.jobs || []).length, 0) +
      (r.joints || []).length +
      (r.recovery || []).length,
  };
}
function win(r) {
  const alive = living(r),
    bad = alive.filter((p) => p.team === "thief").length,
    good = alive.length - bad;
  if (!bad) return "staff";
  if (bad >= good) return "thief";
  const p = progress(r);
  if (p.done >= p.total) return "staff";
  return null;
}
function finish(r, winner) {
  r.winner = winner;
  r.reason =
    winner === "staff"
      ? living(r).some((p) => p.team === "thief")
        ? "The museum is secure."
        : "Every thief was caught."
      : "The thieves took control of the museum.";
  r.publicProgress = progress(r);
  phase(r, "finished");
  r.players.forEach((p) => {
    stop(p);
    p.challenge = null;
    p.camera = null;
  });
}
function spawn(r) {
  const now = Date.now();
  r.players.forEach((p, i) => {
    p.pos = { x: 110 + (i % 4) * 28, y: 120 + Math.floor(i / 4) * 28 };
    p.path = [p.pos];
    p.walkAt = now;
    p.challenge = null;
    p.camera = null;
    p.killAt = Math.max(p.killAt || 0, now + 15000);
  });
}
function start(r) {
  need(
    r.players.length >= 5 && r.players.length <= 12,
    409,
    "Gather 5–12 players to start.",
  );
  r.match = (r.match || 0) + 1;
  r.step = (r.step || 0) + 1;
  const bad = r.players.length <= 6 ? 1 : 2,
    teams = shuffle(r.players.map((_, i) => (i < bad ? "thief" : "staff"))),
    looks = shuffle(Array.from({ length: 12 }, (_, i) => i));
  const staffSlots = shuffle(
    teams
      .map((team, i) => (team === "staff" ? i : null))
      .filter((i) => i !== null),
  );
  r.players.forEach((p, i) => {
    p.team = teams[i];
    p.avatarIndex = looks[i];
    p.role =
      p.team === "thief"
        ? "thief"
        : r.settings.specials !== false && staffSlots.indexOf(i) < 2
          ? ["medic", "camera"][staffSlots.indexOf(i)]
          : "staff";
    Object.assign(p, {
      alive: true,
      knownOut: false,
      chatAt: 0,
      botMemory: {},
      usedMedic: false,
      emergency: 1,
      bag: null,
      challenge: null,
      camera: null,
      cameraAt: 0,
      killAt: Date.now() + 15000,
      observations: [],
      botPlan: null,
      botAt: 0,
    });
    const stations = shuffle(W.STATIONS.slice()).slice(0, 3);
    p.jobs = [
      ...stations.map((s, k) => ({
        id: id(),
        station: s.id,
        kind: s.kind,
        name: s.name,
        room: s.room,
        x: s.x,
        y: s.y,
        done: false,
      })),
      {
        ...W.TRANSPORT[i % 6],
        id: id(),
        kind: "carry",
        name: "Move Exhibit",
        station: W.TRANSPORT[i % 6].id,
        dest: W.TRANSPORT[(i + 2) % 6].id,
        done: false,
      },
    ];
  });
  Object.assign(r, {
    winner: null,
    pendingWinner: null,
    report: null,
    verdict: null,
    electorate: [],
    reason: null,
    bodies: [],
    events: [],
    trail: [],
    chat: [],
    ghostChat: [],
    history: [],
    knownOut: {},
    recovery: [],
    thefts: 0,
    sabotage: null,
    sabotageAt: 0,
    attackAt: 0,
    lastMeetingAt: Date.now(),
    meeting: 0,
    votes: {},
    publicProgress: { done: 0, total: 0 },
    joints: W.JOINTS.map((j) => ({
      ...j,
      holders: {},
      progress: 0,
      lastAt: Date.now(),
      done: false,
    })),
  });
  spawn(r);
  phase(r, "briefing", 10);
  r.publicProgress = progress(r);
}
function move(r, p, b) {
  fence(r, b);
  need(r.phase === "live", 409, "The meeting is still in progress.");
  need(
    Number.isFinite(b.x) &&
      Number.isFinite(b.y) &&
      b.x >= 0 &&
      b.x < W.WIDTH &&
      b.y >= 0 &&
      b.y < W.HEIGHT,
    400,
    "Choose a spot on the museum floor.",
  );
  const from = pos(p),
    to = { x: b.x, y: b.y },
    path = W.route(from, to, closed(r));
  need(path, 400, "That route is closed. Choose another way.");
  p.pos = from;
  p.path = path;
  p.walkAt = Date.now();
  p.challenge = null;
  p.camera = null;
  for (const j of r.joints || []) delete j.holders[p.id];
}
function taskFor(r, p, jobId) {
  return (
    (p.jobs || []).find((j) => j.id === jobId) ||
    r.recovery?.find((j) => j.id === jobId)
  );
}
function beginTask(r, p, b) {
  fence(r, b);
  need(r.phase === "live", 409, "Jobs pause during meetings.");
  let job = taskFor(r, p, b.jobId);
  if (b.repair) {
    need(
      r.sabotage && r.sabotage.until > Date.now(),
      409,
      "The system is already working.",
    );
    const point =
      r.sabotage.kind === "lights"
        ? W.STATIONS[3]
        : W.DOORS.find((d) => d.id === r.sabotage.door);
    job = {
      id: "repair",
      kind: r.sabotage.kind === "lights" ? "wires" : "circuit",
      name: "Restore " + (r.sabotage.kind === "lights" ? "Power" : "Door"),
      ...(r.sabotage.kind === "door"
        ? W.repairPoint(point, pos(p))
        : { x: point.x, y: point.y }),
      repairUntil: r.sabotage.until,
    };
  }
  need(
    job && !job.done && job.kind !== "carry",
    400,
    "Choose an unfinished job.",
  );
  need(p.alive || p.team === "staff", 403, "Your team cannot do ghost jobs.");
  near(r, p, job);
  stop(p);
  p.camera = null;
  const puzzle =
    job.kind === "wires"
      ? { left: shuffle([0, 1, 2, 3]), right: shuffle([0, 1, 2, 3]) }
      : job.kind === "circuit"
        ? { rotations: Array.from({ length: 6 }, () => crypto.randomInt(4)) }
        : job.kind === "memory"
          ? { sequence: Array.from({ length: 4 }, () => crypto.randomInt(4)) }
          : {
              spots: shuffle([
                { x: 0.22, y: 0.25 },
                { x: 0.75, y: 0.3 },
                { x: 0.3, y: 0.75 },
                { x: 0.72, y: 0.72 },
              ]).slice(0, 3),
            };
  if (puzzle.rotations && W.circuitValid(puzzle.rotations))
    puzzle.rotations[0] = (puzzle.rotations[0] + 1) % 4;
  p.challenge = {
    id: id(),
    jobId: job.id,
    kind: job.kind,
    name: job.name,
    x: job.x,
    y: job.y,
    startedAt: Date.now(),
    minMs: job.kind === "memory" ? 5000 : 4000,
    expiresAt: Date.now() + 90000,
    puzzle,
    repairUntil: job.repairUntil || null,
  };
  return p.challenge;
}
function proofValid(c, proof) {
  if (c.kind === "wires")
    return (
      Array.isArray(proof) &&
      proof.length === 4 &&
      proof.every(
        (v, i) => Number.isInteger(v) && c.puzzle.left[i] === c.puzzle.right[v],
      )
    );
  if (c.kind === "circuit") return W.circuitValid(proof);
  if (c.kind === "memory")
    return (
      Array.isArray(proof) &&
      proof.length === 4 &&
      proof.every((v, i) => v === c.puzzle.sequence[i])
    );
  if (c.kind === "scan")
    return (
      Array.isArray(proof) &&
      proof.length >= 3 &&
      proof.length <= 120 &&
      proof.every(
        (p) =>
          p &&
          Number.isFinite(p.x) &&
          Number.isFinite(p.y) &&
          p.x >= 0 &&
          p.x <= 1 &&
          p.y >= 0 &&
          p.y <= 1,
      ) &&
      c.puzzle.spots.every((s) => proof.some((p) => W.distance(p, s) < 0.12))
    );
  return false;
}
function finishTask(r, p, b) {
  fence(r, b);
  need(r.phase === "live", 409, "Jobs pause during meetings.");
  const c = p.challenge;
  need(
    c && c.id === b.challengeId && Date.now() <= c.expiresAt,
    409,
    "Open this job again.",
  );
  near(r, p, c);
  need(
    Date.now() - c.startedAt >= c.minMs,
    409,
    "Finish the job before leaving.",
  );
  need(proofValid(c, b.proof), 400, "The puzzle is not finished yet.");
  if (c.jobId === "repair") {
    need(
      r.sabotage?.until === c.repairUntil,
      409,
      "The system is already working.",
    );
    r.sabotage = null;
  } else {
    const job = taskFor(r, p, c.jobId);
    need(job && !job.done, 409, "This job is already finished.");
    job.done = true;
  }
  p.challenge = null;
  const winner = win(r);
  if (winner) finish(r, winner);
}
function cancelTask(r, p, b) {
  fence(r, b);
  p.challenge = null;
}
function pickup(r, p, b) {
  fence(r, b);
  need(
    r.phase === "live" && (p.alive || p.team === "staff"),
    409,
    "This delivery is not available now.",
  );
  need(!p.bag, 409, "Deliver the exhibit you are carrying first.");
  const job = (p.jobs || []).find(
    (j) => j.id === b.jobId && j.kind === "carry" && !j.done,
  );
  need(job, 400, "Choose your exhibit job.");
  near(r, p, job);
  p.bag = { kind: "job", jobId: job.id, dest: job.dest };
  p.challenge = null;
}
function steal(r, p, b) {
  active(r, p, b);
  need(p.team === "thief", 403, "Only thieves steal exhibits.");
  need(!p.bag, 409, "Deliver the exhibit you are carrying first.");
  need(r.thefts < 2, 409, "The service exit is being watched now.");
  const crate = W.TRANSPORT.find(
    (s) => s.id === b.station && ["gallery", "vault"].includes(s.room),
  );
  need(crate, 400, "Choose an exhibit in the Gallery or Vault.");
  near(r, p, crate);
  r.thefts++;
  p.bag = { kind: "stolen", dest: "crate-service" };
}
function deliver(r, p, b) {
  fence(r, b);
  need(r.phase === "live" && p.bag, 409, "You are not carrying an exhibit.");
  const dest = W.TRANSPORT.find((s) => s.id === p.bag.dest);
  near(r, p, dest);
  if (p.bag.kind === "job") {
    const j = p.jobs.find((j) => j.id === p.bag.jobId);
    need(j && !j.done, 409, "This delivery is already finished.");
    j.done = true;
  } else {
    const s = W.STATIONS[2];
    r.recovery.push({
      ...s,
      id: id(),
      kind: "wires",
      name: "Reset Stolen Display",
      done: false,
    });
  }
  p.bag = null;
  const winner = win(r);
  if (winner) finish(r, winner);
}
function hold(r, p, b) {
  fence(r, b);
  need(
    r.phase === "live" && (p.alive || p.team === "staff"),
    409,
    "This job is not available now.",
  );
  const j = r.joints.find((j) => j.id === b.jobId);
  need(j && !j.done, 409, "This statue is already in place.");
  near(r, p, j);
  need(
    Number.isFinite(b.pull) && b.pull >= 0 && b.pull <= 1,
    400,
    "Drag the handle along its track.",
  );
  stop(p);
  p.challenge = null;
  if (b.pull < 0.8) delete j.holders[p.id];
  else j.holders[p.id] = { at: Date.now() };
  updateJoints(r);
}
function updateJoints(r) {
  let changed = false,
    now = Date.now();
  for (const j of r.joints || []) {
    if (j.done) continue;
    const holders = Object.keys(j.holders).filter((id) => {
      const p = r.players.find((p) => p.id === id);
      return (
        p &&
        (p.alive || p.team === "staff") &&
        now - j.holders[id].at < 1500 &&
        W.distance(pos(p), j) < 48
      );
    });
    const elapsed = Math.max(0, Math.min(1000, now - j.lastAt));
    if (holders.length >= 2 && elapsed > 0) {
      j.progress = Math.min(6000, j.progress + elapsed);
      changed = true;
    } else if (!holders.length && j.progress) {
      j.progress = 0;
      changed = true;
    }
    if (elapsed > 0) {
      j.lastAt = now;
      changed = changed || holders.length > 0;
    }
    if (j.progress >= 6000) {
      j.done = true;
      j.holders = {};
    }
  }
  return changed;
}
function knockout(r, p, b) {
  active(r, p, b);
  need(p.team === "thief" && !p.bag, 403, "You cannot knock anyone out now.");
  need(
    Date.now() >= (p.killAt || 0) && Date.now() >= (r.attackAt || 0),
    409,
    "Your knockout is cooling down.",
  );
  const target = r.players.find(
    (q) => q.id === b.targetId && q.alive && q.team !== "thief",
  );
  need(target, 400, "Choose a nearby staff member.");
  const at = pos(target);
  near(r, p, at, 40);
  const witnesses = r.players
    .filter(
      (q) =>
        q.alive &&
        ((sees(r, q, pos(p)) && sees(r, q, at)) ||
          (cameraSees(q, pos(p)) && cameraSees(q, at))),
    )
    .map((q) => q.id);
  const pp = pos(p),
    path = p.path || [],
    end = path.at(-1) || at,
    dist = W.distance(pp, end) || 1;
  r.events = [
    ...r.events,
    {
      id: id(),
      kind: "knockout",
      actor: p.id,
      target: target.id,
      at: Date.now(),
      x: at.x,
      y: at.y,
      witnesses,
    },
  ].slice(-12);
  r.trail = [
    ...(r.trail || []),
    {
      x: at.x,
      y: at.y,
      dx: (end.x - pp.x) / dist,
      dy: (end.y - pp.y) / dist,
      at: Date.now(),
    },
  ].slice(-10);
  r.bodies.push({
    id: id(),
    playerId: target.id,
    x: at.x,
    y: at.y,
    at: Date.now(),
    reported: false,
  });
  stop(target);
  target.alive = false;
  target.challenge = null;
  target.camera = null;
  target.bag = null;
  p.killAt = Date.now() + 30000;
  r.attackAt = Date.now() + 10000;
  const winner = win(r);
  if (winner) finish(r, winner);
}
function revive(r, p, b) {
  active(r, p, b);
  need(
    p.role === "medic" && !p.usedMedic,
    403,
    "Your rescue is not available.",
  );
  const body = r.bodies.find(
    (q) => q.id === b.bodyId && !q.reported && Date.now() - q.at <= 20000,
  );
  need(body, 409, "It is too late to rescue this player.");
  near(r, p, body);
  const target = r.players.find((q) => q.id === body.playerId);
  need(target && !target.alive, 409, "This player is already back.");
  target.alive = true;
  target.pos = { x: body.x, y: body.y };
  target.path = [target.pos];
  target.walkAt = Date.now();
  target.challenge = null;
  r.bodies = r.bodies.filter((q) => q !== body);
  p.usedMedic = true;
}
function sabotage(r, p, b) {
  active(r, p, b);
  need(p.team === "thief", 403, "Only thieves can sabotage.");
  need(
    Date.now() >= (r.sabotageAt || 0),
    409,
    "The team sabotage is cooling down.",
  );
  need(["lights", "door"].includes(b.kind), 400, "Choose lights or a door.");
  if (b.kind === "door")
    need(
      W.DOORS.some((d) => d.id === b.door),
      400,
      "Choose a door.",
    );
  r.players.forEach((q) => stop(q));
  r.sabotage = {
    kind: b.kind,
    door: b.kind === "door" ? b.door : null,
    until: Date.now() + (b.kind === "door" ? 12000 : 20000),
  };
  if (b.kind === "door")
    for (const q of r.players) {
      const at = W.snap(q.pos, closed(r));
      q.pos = at || q.pos;
      q.path = [q.pos];
    }
  r.sabotageAt = Date.now() + 35000;
}
function camera(r, p, b) {
  active(r, p, b);
  need(
    p.role === "camera",
    403,
    "Only the Camera Operator can use this console.",
  );
  near(r, p, W.STATIONS[3]);
  need(Date.now() >= (p.cameraAt || 0), 409, "The camera is cooling down.");
  need(["lobby", "gallery", "vault"].includes(b.room), 400, "Choose a camera.");
  stop(p);
  p.challenge = null;
  p.camera = { room: b.room, until: Date.now() + 6000 };
  p.cameraAt = Date.now() + 30000;
}
function meeting(r, p, body) {
  const now = Date.now();
  r.publicProgress = progress(r);
  r.meeting = (r.meeting || 0) + 1;
  r.report = body
    ? { by: p.id, playerId: body.playerId, room: W.roomAt(body)?.id || null }
    : { by: p.id, playerId: null, room: "lobby" };
  r.bodies.forEach((q) => {
    q.reported = true;
    const victim = r.players.find((p) => p.id === q.playerId);
    if (victim) victim.knownOut = true;
  });
  r.players.forEach((q) => {
    stop(q, now);
    q.challenge = null;
    q.camera = null;
  });
  for (const j of r.joints) j.holders = {};
  r.chat = [];
  r.votes = {};
  r.sabotage = null;
  phase(r, "discussion", r.settings.discussionSeconds || 60);
  r.lastMeetingAt = now;
}
function report(r, p, b) {
  active(r, p, b);
  const body = r.bodies.find((q) => q.id === b.bodyId && !q.reported);
  need(body, 409, "This player was already reported.");
  near(r, p, body, 58);
  meeting(r, p, body);
}
function emergency(r, p, b) {
  active(r, p, b);
  need(p.emergency > 0, 409, "You already used your emergency meeting.");
  need(
    Date.now() - r.lastMeetingAt >= 15000,
    409,
    "Give everyone time to explore first.",
  );
  near(r, p, { x: 160, y: 150 }, 80);
  p.emergency--;
  meeting(r, p, null);
}
function chat(r, p, b) {
  fence(r, b);
  need(
    ["live", "discussion", "voting", "verdict"].includes(r.phase),
    409,
    "Chat opens after the museum opens.",
  );
  need(
    typeof b.text === "string" && Array.from(b.text).length <= 280,
    400,
    "Keep your message within 280 characters.",
  );
  const message = b.text
    .normalize("NFC")
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g,
      " ",
    )
    .trim();
  need(message, 400, "Write a message first.");
  need(Date.now() - (p.chatAt || 0) >= 1000, 429, "Give the others a moment.");
  p.chatAt = Date.now();
  if (!p.alive) {
    r.ghostChat = [
      ...r.ghostChat,
      { id: p.id, text: message, at: Date.now() },
    ].slice(-30);
    return;
  }
  need(r.phase === "discussion", 409, "Talk during the meeting.");
  r.chat = [...r.chat, { id: p.id, text: message, at: Date.now() }].slice(-60);
}
function beginVote(r) {
  r.electorate = living(r)
    .filter((p) => !p.departed)
    .map((p) => p.id);
  r.votes = {};
  phase(r, "voting", 25);
  if (!r.electorate.length) resolveVote(r);
}
function vote(r, p, b) {
  fence(r, b);
  need(
    r.phase === "voting" && r.electorate.includes(p.id),
    403,
    "You are not voting now.",
  );
  need(!Object.hasOwn(r.votes, p.id), 409, "Your vote is already sealed.");
  const target = b.targetId || null;
  need(
    !target || living(r).some((p) => p.id === target),
    400,
    "Choose someone still in, or Skip.",
  );
  r.votes[p.id] = target;
  if (r.electorate.every((id) => Object.hasOwn(r.votes, id))) resolveVote(r);
}
function resolveVote(r) {
  const ballots = r.electorate.map((id) => ({
      id,
      target: r.votes[id] || null,
    })),
    counts = new Map();
  for (const b of ballots)
    counts.set(b.target, (counts.get(b.target) || 0) + 1);
  const max = Math.max(0, ...counts.values()),
    leaders = [...counts].filter(([, n]) => n === max).map(([id]) => id),
    out = leaders.length === 1 ? leaders[0] : null;
  let alignment = null;
  if (out) {
    const p = r.players.find((p) => p.id === out);
    p.alive = false;
    p.knownOut = true;
    p.bag = null;
    alignment = p.team;
  }
  r.verdict = {
    meeting: r.meeting,
    ballots,
    out,
    alignment,
    reason: out ? "voted" : leaders.length > 1 ? "tie" : "skip",
  };
  r.history.push({
    ...r.verdict,
    report: r.report,
    chat: r.chat.map((m) => ({ ...m })),
    progress: progress(r),
  });
  r.pendingWinner = win(r);
  phase(r, "verdict", 8);
}
function tick(r) {
  let changed = false;
  if (r.phase === "live") {
    changed = updateJoints(r) || changed;
    const winner = win(r);
    if (winner) {
      finish(r, winner);
      return true;
    }
    if (r.sabotage && r.sabotage.until <= Date.now()) {
      r.sabotage = null;
      changed = true;
    }
  }
  if (r.deadline && Date.now() >= r.deadline) {
    if (r.phase === "briefing") {
      phase(r, "live");
      for (const p of r.players) p.killAt = Date.now() + 15000;
    } else if (r.phase === "discussion") beginVote(r);
    else if (r.phase === "voting") resolveVote(r);
    else if (r.phase === "verdict") {
      if (r.pendingWinner) finish(r, r.pendingWinner);
      else {
        spawn(r);
        r.bodies = [];
        phase(r, "live");
      }
    }
    changed = true;
  }
  return changed;
}
function view(r, me) {
  const now = Date.now(),
    live = r.phase === "live",
    finished = r.phase === "finished",
    mine = pos(me, now),
    ghost = !me.alive && r.phase !== "lobby",
    people = r.players.map((p, i) => ({
      ...publicPerson(p, i),
      alive: live
        ? p.id === me.id
          ? p.alive
          : !p.knownOut
        : p.alive !== false,
      alignment: finished
        ? p.team
        : p.knownOut && r.history?.some((h) => h.out === p.id)
          ? p.team
          : null,
      voteLocked: r.phase === "voting" && Object.hasOwn(r.votes || {}, p.id),
    }));
  const visible = r.players
    .filter(
      (p) =>
        p.id !== me.id &&
        (ghost ? !p.alive : p.alive) &&
        sees(r, me, pos(p, now)),
    )
    .map((p) => ({ id: p.id, ...pos(p, now), bag: !!p.bag }));
  const bodies = (r.bodies || [])
    .filter(
      (b) =>
        !b.reported && (b.playerId === me.id || (!ghost && sees(r, me, b))),
    )
    .map(({ id, playerId, x, y, at }) => ({ id, playerId, x, y, at }));
  const ownJobs = (me.jobs || []).map((j) => ({ ...j }));
  const additional = (r.recovery || []).map((j) => ({ ...j }));
  const result = {
    step: r.step || 0,
    players: people,
    nearby: live ? visible : [],
    bodies: live ? bodies : [],
    trails:
      live && !ghost
        ? (r.trail || [])
            .filter((t) => now - t.at < 18000 && sees(r, me, t))
            .map((t) => ({ ...t }))
        : [],
    events: live
      ? (r.events || [])
          .filter(
            (e) =>
              now - e.at < 5000 &&
              (e.target === me.id || (!ghost && e.witnesses.includes(me.id))),
          )
          .map(({ witnesses, ...e }) => e)
      : [],
    progress: r.publicProgress || { done: 0, total: 0 },
    sabotage: live && r.sabotage?.until > now ? { ...r.sabotage } : null,
    meeting: r.meeting || 0,
    meetingStartedAt: r.lastMeetingAt || 0,
    report: r.report || null,
    chat: r.phase === "discussion" ? r.chat || [] : [],
    ghostChat: ghost ? r.ghostChat || [] : [],
    verdict: r.phase === "verdict" ? r.verdict : null,
    history: r.history || [],
    winner: finished ? r.winner : null,
    winReason: finished ? r.reason : null,
    joints: live
      ? (r.joints || []).map((j) => ({
          id: j.id,
          x: j.x,
          y: j.y,
          room: j.room,
          name: j.name,
          done: j.done,
          ...(W.distance(mine, j) < 80
            ? {
                progress: j.progress,
                helpers: Object.keys(j.holders).filter(
                  (id) => now - j.holders[id].at < 1500,
                ).length,
              }
            : {}),
        }))
      : [],
    recovery: live ? additional : [],
    me: {
      alive: me.alive !== false,
      role: me.role || null,
      team: me.team || null,
      position: mine,
      path: me.path || [mine],
      walkAt: me.walkAt || now,
      bag: me.bag || null,
      jobs: ownJobs,
      challenge: me.challenge || null,
      emergency: me.emergency ?? 1,
      usedMedic: !!me.usedMedic,
      killAt: Math.max(me.killAt || 0, r.attackAt || 0),
      sabotageAt: r.sabotageAt || 0,
      cameraAt: me.cameraAt || 0,
      vision: radius(r, me),
      allies:
        me.team === "thief"
          ? r.players.filter((p) => p.team === "thief").map((p) => p.id)
          : [],
      vote: Object.hasOwn(r.votes || {}, me.id)
        ? { targetId: r.votes[me.id] }
        : null,
      camera:
        live && me.camera?.until > now
          ? {
              ...me.camera,
              players: r.players
                .filter((p) => p.alive && cameraSees(me, pos(p, now)))
                .map((p) => ({ id: p.id, ...pos(p, now), bag: !!p.bag })),
            }
          : null,
    },
  };
  if (finished)
    result.roles = r.players.map((p) => ({
      id: p.id,
      team: p.team,
      role: p.role,
    }));
  return result;
}
module.exports = {
  W,
  need,
  closed,
  pos,
  phase,
  stop,
  living,
  sees,
  progress,
  win,
  finish,
  start,
  move,
  beginTask,
  finishTask,
  cancelTask,
  proofValid,
  pickup,
  steal,
  deliver,
  hold,
  updateJoints,
  knockout,
  revive,
  sabotage,
  camera,
  report,
  emergency,
  chat,
  beginVote,
  vote,
  resolveVote,
  tick,
  view,
};
