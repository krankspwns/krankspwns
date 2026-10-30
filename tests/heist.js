// The museum is a separate room type: never mutate classic Grand Con rooms.
const assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto");
const R = require("../lib/heist-rules"),
  B = require("../lib/heist-bot"),
  W = R.W,
  { call } = require("./helpers"),
  api = require("../api/grand-heist");
let clock = 1900000000000;
const realNow = Date.now;
Date.now = () => clock;
const room = (n = 7) => {
  const r = {
    settings: { discussionSeconds: 45, specials: true },
    players: Array.from({ length: n }, (_, i) => ({
      id: "p" + i,
      name: "Guest " + i,
    })),
    phase: "lobby",
  };
  R.start(r);
  clock += 10001;
  R.tick(r);
  return r;
};
const at = (p, point) => {
  p.pos = { x: point.x, y: point.y };
  p.path = [p.pos];
  p.walkAt = clock;
};
const body = (r) => ({ step: r.step });
const rejects = (fn, status) => assert.throws(fn, (e) => e.status === status);
(async () => {
  for (const n of [5, 6, 7, 12]) {
    const r = room(n);
    assert.equal(
      r.players.filter((p) => p.team === "thief").length,
      n <= 6 ? 1 : 2,
    );
    assert.equal(new Set(r.players.map((p) => p.avatarIndex)).size, n);
    assert.equal(r.players.filter((p) => p.role === "medic").length, 1);
    assert.equal(r.players.filter((p) => p.role === "camera").length, 1);
  }
  {
    const r = room(),
      p = r.players.find((p) => p.team === "staff"),
      bad = r.players.filter((p) => p.team === "thief");
    at(p, { x: 110, y: 110 });
    at(bad[0], { x: 750, y: 450 });
    const v = R.view(r, p);
    assert.equal(v.me.allies.length, 0);
    assert.ok(!v.nearby.some((q) => q.id === bad[0].id));
    assert.ok(
      v.players.every(
        (q) =>
          !Object.hasOwn(q, "role") &&
          !Object.hasOwn(q, "position") &&
          !Object.hasOwn(q, "team"),
      ),
    );
    assert.equal(v.roles, undefined);
    assert.equal(R.view(r, bad[0]).me.allies.length, 2);
    R.move(r, p, { ...body(r), x: 430, y: 110 });
    const start = R.pos(p);
    clock += 1000;
    assert.ok(W.distance(start, R.pos(p)) <= 106);
    clock += 15000;
    assert.ok(W.distance(R.pos(p), { x: 430, y: 110 }) < 20);
    rejects(() => R.move(r, p, { step: r.step - 1, x: 110, y: 110 }), 409);
    rejects(() => R.move(r, p, { ...body(r), x: NaN, y: 0 }), 400);
    for (const station of W.STATIONS) {
      p.jobs = [{ ...station, id: randomUUID(), done: false }];
      at(p, station);
      R.beginTask(r, p, { ...body(r), jobId: p.jobs[0].id });
      const c = p.challenge;
      rejects(
        () =>
          R.finishTask(r, p, {
            ...body(r),
            challengeId: c.id,
            proof: B.proof(c),
          }),
        409,
      );
      clock += c.minMs;
      rejects(
        () => R.finishTask(r, p, { ...body(r), challengeId: c.id, proof: [] }),
        400,
      );
      if (c.kind === "scan")
        rejects(
          () =>
            R.finishTask(r, p, {
              ...body(r),
              challengeId: c.id,
              proof: [null, null, null],
            }),
          400,
        );
      R.finishTask(r, p, { ...body(r), challengeId: c.id, proof: B.proof(c) });
      assert.equal(p.jobs[0].done, true);
      rejects(
        () =>
          R.finishTask(r, p, {
            ...body(r),
            challengeId: c.id,
            proof: B.proof(c),
          }),
        409,
      );
    }
  }
  {
    const r = room(),
      thief = r.players.find((p) => p.team === "thief"),
      victim = r.players.find((p) => p.role === "staff"),
      medic = r.players.find((p) => p.role === "medic"),
      camera = r.players.find((p) => p.role === "camera");
    at(thief, { x: 430, y: 140 });
    at(victim, { x: 450, y: 140 });
    at(medic, { x: 430, y: 150 });
    at(camera, W.STATIONS[3]);
    clock += 20000;
    R.camera(r, camera, { ...body(r), room: "gallery" });
    assert.ok(
      R.view(r, camera).me.camera.players.some((p) => p.id === thief.id),
    );
    R.knockout(r, thief, { ...body(r), targetId: victim.id });
    assert.equal(victim.alive, false);
    assert.ok(R.view(r, medic).events.some((e) => e.actor === thief.id));
    assert.ok(R.view(r, camera).events.some((e) => e.actor === thief.id));
    assert.equal(
      R.view(r, medic).players.find((p) => p.id === victim.id).alive,
      true,
      "unreported death remains hidden on public roster",
    );
    R.chat(r, victim, { ...body(r), text: "Private ghost message" });
    assert.equal(R.view(r, medic).ghostChat.length, 0);
    assert.equal(R.view(r, victim).ghostChat.length, 1);
    const b = r.bodies[0];
    R.revive(r, medic, { ...body(r), bodyId: b.id });
    assert.equal(victim.alive, true);
    assert.equal(medic.usedMedic, true);
    clock += 31000;
    R.knockout(r, thief, { ...body(r), targetId: victim.id });
    rejects(
      () => R.revive(r, medic, { ...body(r), bodyId: r.bodies[0].id }),
      403,
    );
    R.report(r, medic, { ...body(r), bodyId: r.bodies[0].id });
    assert.equal(r.phase, "discussion");
    assert.equal(
      R.view(r, medic).players.find((p) => p.id === victim.id).alive,
      false,
    );
    assert.equal(
      R.view(r, medic).players.find((p) => p.id === victim.id).alignment,
      null,
    );
    rejects(() => R.move(r, thief, { ...body(r), x: 450, y: 140 }), 409);
    R.beginVote(r);
    for (const id of [...r.electorate])
      R.vote(
        r,
        r.players.find((p) => p.id === id),
        { ...body(r), targetId: thief.id },
      );
    assert.equal(r.phase, "verdict");
    assert.equal(r.verdict.alignment, "thief");
    assert.ok(!JSON.stringify(r.verdict).includes("medic"));
    clock += 8001;
    R.tick(r);
    assert.equal(r.phase, "live");
  }
  {
    for (const [from, to] of [
      [{ x: 70, y: 150 }, { x: 170, y: 130 }],
      [{ x: 100, y: 120 }, { x: 420, y: 150 }],
      [{ x: 120, y: 80 }, { x: 470, y: 430 }],
    ]) {
      const path = W.route(from, to);
      assert.deepEqual(path.at(-1), to, "a walk ends exactly where you pointed");
      assert.ok(path.slice(1).every((q, i) => W.line(path[i], q)), "straight legs never cross walls or props");
    }
    const r = room(),
      p = r.players.find((p) => p.team === "thief");
    at(p, { x: 270, y: 160 });
    R.sabotage(r, p, { ...body(r), kind: "door", door: "north-west" });
    assert.equal(
      W.route({ x: 270, y: 160 }, { x: 370, y: 160 }, R.closed(r))?.some(
        (q) => q.x > 280 && q.x < 360 && q.y < 180,
      ),
      false,
    );
    const repair = W.repairPoint(W.DOORS[0], R.pos(p));
    assert.ok(W.walkable(repair, R.closed(r)));
    R.beginTask(r, p, { ...body(r), repair: true });
    clock += 4001;
    R.finishTask(r, p, {
      ...body(r),
      challengeId: p.challenge.id,
      proof: B.proof(p.challenge),
    });
    assert.equal(r.sabotage, null);
    rejects(() => R.sabotage(r, p, { ...body(r), kind: "lights" }), 409);
    clock += 35001;
    R.sabotage(r, p, { ...body(r), kind: "lights" });
    assert.equal(
      R.view(
        r,
        r.players.find((q) => q.team === "staff"),
      ).me.vision,
      80,
    );
    clock += 20001;
    R.tick(r);
    assert.equal(r.sabotage, null);
    for (let i = 0; i < 2; i++) {
      at(p, W.TRANSPORT[1]);
      R.steal(r, p, { ...body(r), station: "crate-gallery" });
      rejects(
        () =>
          R.knockout(r, p, {
            ...body(r),
            targetId: r.players.find((q) => q.team === "staff").id,
          }),
        403,
      );
      at(p, W.TRANSPORT[5]);
      R.deliver(r, p, body(r));
    }
    at(p, W.TRANSPORT[1]);
    rejects(() => R.steal(r, p, { ...body(r), station: "crate-gallery" }), 409);
    assert.equal(r.recovery.length, 2);
    const staff = r.players.filter((q) => q.team === "staff"),
      j = r.joints[0];
    at(staff[0], j);
    at(staff[1], j);
    for (let i = 0; i < 15; i++) {
      R.hold(r, staff[0], { ...body(r), jobId: j.id, pull: 1 });
      clock += 500;
      R.tick(r);
    }
    assert.equal(j.done, false, "one player cannot complete a joint job");
    j.progress = 0;
    for (let i = 0; i < 13 && !j.done; i++) {
      R.hold(r, staff[0], { ...body(r), jobId: j.id, pull: 1 });
      R.hold(r, staff[1], { ...body(r), jobId: j.id, pull: 1 });
      clock += 500;
      R.tick(r);
    }
    assert.equal(j.done, true);
  }
  {
    const r = room(5),
      bad = r.players.find((p) => p.team === "thief"),
      p = r.players.find((p) => p.team === "staff");
    clock += 16000;
    at(p, { x: 160, y: 150 });
    R.emergency(r, p, body(r));
    R.beginVote(r);
    r.electorate.forEach((id) =>
      R.vote(
        r,
        r.players.find((p) => p.id === id),
        { ...body(r), targetId: bad.id },
      ),
    );
    clock += 8001;
    R.tick(r);
    assert.equal(r.phase, "finished");
    assert.equal(r.winner, "staff");
    assert.equal(R.view(r, p).roles.length, 5);
    const tasks = room(5);
    tasks.players
      .filter((p) => p.team === "staff")
      .forEach((p) => p.jobs.forEach((j) => (j.done = true)));
    tasks.joints.forEach((j) => (j.done = true));
    R.tick(tasks);
    assert.equal(tasks.winner, "staff");
    const parity = room(5);
    parity.players
      .filter((p) => p.team === "staff")
      .slice(0, 3)
      .forEach((p) => (p.alive = false));
    R.tick(parity);
    assert.equal(parity.winner, "thief");
  }
  // Exercise admission, authenticated polling, host-only actions, receipts and step fences through the actual API.
  let ip = 0;
  const post = (b) =>
    call(
      api,
      { requestId: randomUUID(), ...b },
      {},
      { "x-forwarded-for": "heist-test-" + ++ip },
    );
  const h = await post({ action: "create", name: "Host" });
  assert.equal(h.s, 200);
  const seats = [h.j];
  for (let i = 1; i < 5; i++) {
    const j = await post({ action: "join", code: h.j.code, name: "Guest" + i });
    assert.equal(j.s, 200);
    seats.push(j.j);
  }
  const auth = (s) => ({
    code: s.code,
    pid: s.meId,
    tok: s.tok,
    match: 0,
    step: 0,
  });
  assert.equal((await post({ ...auth(seats[1]), action: "start" })).s, 403);
  const start = await post({ ...auth(h.j), action: "start" });
  assert.equal(start.s, 200);
  assert.equal(start.j.phase, "briefing");
  const liveRoom = globalThis.__roomStoreRooms["grand-heist"].get(h.j.code);
  clock += 10001;
  const v = await call(
    api,
    null,
    { code: h.j.code, pid: h.j.meId },
    { "x-tok": h.j.tok },
  );
  assert.equal(v.s, 200);
  assert.equal(v.j.phase, "live");
  assert.equal(
    (
      await post({
        ...auth(h.j),
        match: v.j.match,
        step: v.j.step - 1,
        action: "move",
        x: 160,
        y: 150,
      })
    ).s,
    409,
  );
  const moveReceipt = {
    ...auth(h.j),
    action: "move",
    match: v.j.match,
    step: v.j.step,
    x: 160,
    y: 150,
    requestId: randomUUID(),
  };
  const moved = await post(moveReceipt),
    replayed = await post(moveReceipt);
  assert.equal(moved.s, 200);
  assert.equal(replayed.s, 200);
  assert.equal(
    moved.j.version,
    replayed.j.version,
    "movement retry applies once",
  );
  assert.equal(liveRoom.players.length, 5);
  assert.equal(
    (
      await call(
        api,
        null,
        { code: h.j.code, pid: h.j.meId },
        { "x-tok": "wrong" },
      )
    ).s,
    401,
  );
  // Timed practice games must make progress all the way to a result.
  for (const n of [5, 7, 12]) {
    const r = room(n);
    r.players.forEach((p) => (p.bot = true));
    for (let i = 0; i < 2400 && r.phase !== "finished"; i++) {
      clock += 750;
      R.tick(r);
      B.tick(r);
      if (r.phase === "live" && R.win(r)) R.finish(r, R.win(r));
    }
    assert.equal(r.phase, "finished", n + " practice bots reach a result");
    assert.ok(["staff", "thief"].includes(r.winner));
  }
  Date.now = realNow;
  console.log(
    "Museum heist: roles, private views, timed movement, all puzzles, sabotage/repair, carry/theft, joint work, rescue, meetings, votes, wins and authenticated API passed.",
  );
})().catch((e) => {
  Date.now = realNow;
  console.error(e);
  process.exit(1);
});
