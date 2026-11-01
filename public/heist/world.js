/* Shared geometry and puzzle rules. No roles or private room state live here. */
(function (root, factory) {
  const world = factory();
  if (typeof module === "object" && module.exports) module.exports = world;
  else root.HeistWorld = world;
})(typeof window === "object" ? window : globalThis, () => {
  // Rooms are 480 x 440: four times the floor of the first version, with room for pillars, two display cases and two job consoles.
  const ROOM_W = 480,
    ROOM_H = 440,
    GAP_X = 80,
    GAP_Y = 120,
    WIDTH = 40 * 2 + ROOM_W * 3 + GAP_X * 2,
    HEIGHT = 40 * 2 + ROOM_H * 2 + GAP_Y,
    CELL = 20,
    SPEED = 105,
    COLS = Math.ceil(WIDTH / CELL),
    ROWS = Math.ceil(HEIGHT / CELL);
  const colX = (i) => 40 + i * (ROOM_W + GAP_X), rowY = (j) => 40 + j * (ROOM_H + GAP_Y);
  const ROOMS = [
    { id: "lobby", name: "Lobby", x: colX(0), y: rowY(0), color: "#314555" },
    { id: "gallery", name: "Gallery", x: colX(1), y: rowY(0), color: "#4b354d" },
    { id: "vault", name: "Vault", x: colX(2), y: rowY(0), color: "#4b4430" },
    { id: "security", name: "Security", x: colX(0), y: rowY(1), color: "#274d50" },
    { id: "workshop", name: "Workshop", x: colX(1), y: rowY(1), color: "#4b3933" },
    { id: "service", name: "Service Hall", x: colX(2), y: rowY(1), color: "#33453a" },
  ].map((r) => ({ ...r, w: ROOM_W, h: ROOM_H }));
  const DOORS = [
    { id: "north-west", name: "Lobby / Gallery", x: colX(0) + ROOM_W, y: rowY(0) + ROOM_H / 2 - 20, w: GAP_X, h: 40 },
    { id: "north-east", name: "Gallery / Vault", x: colX(1) + ROOM_W, y: rowY(0) + ROOM_H / 2 - 20, w: GAP_X, h: 40 },
    { id: "south-west", name: "Security / Workshop", x: colX(0) + ROOM_W, y: rowY(1) + ROOM_H / 2 - 20, w: GAP_X, h: 40 },
    { id: "south-east", name: "Workshop / Service", x: colX(1) + ROOM_W, y: rowY(1) + ROOM_H / 2 - 20, w: GAP_X, h: 40 },
    ...["west", "middle", "east"].map((n, i) => ({
      id: n,
      name: ["Lobby / Security", "Gallery / Workshop", "Vault / Service"][i],
      x: colX(i) + ROOM_W / 2 - 20,
      y: rowY(0) + ROOM_H,
      w: 40,
      h: GAP_Y,
    })),
  ];
  const at = (r, x, y) => ({ x: r.x + x, y: r.y + y });
  // first and second job console in every room
  const KIND_A = ["memory", "scan", "wires", "circuit", "wires", "memory"], KIND_B = ["wires", "memory", "scan", "wires", "scan", "circuit"];
  const JOB_NAME = { memory: "Unlock Display", scan: "Scan Treasure", wires: "Fix Alarm", circuit: "Restore Camera" };
  const STATIONS = [
    ...ROOMS.map((r, i) => ({ id: "station-" + r.id, room: r.id, ...at(r, 100, 110), kind: KIND_A[i], name: JOB_NAME[KIND_A[i]] })),
    ...ROOMS.map((r, i) => ({ id: "station2-" + r.id, room: r.id, ...at(r, 380, 330), kind: KIND_B[i], name: JOB_NAME[KIND_B[i]] })),
  ];
  const JOINTS = [
    { id: "statue-gallery", room: "gallery", name: "Move Statue", ...at(ROOMS[1], 330, 230) },
    { id: "statue-workshop", room: "workshop", name: "Move Statue", ...at(ROOMS[4], 330, 230) },
  ];
  const TRANSPORT = ROOMS.map((r) => ({
    id: "crate-" + r.id,
    room: r.id,
    ...at(r, 50, 330),
    name: r.id === "service" ? "Service Exit" : "Exhibit Crate",
  }));
  // the red button for calling a meeting: stand in front of it in the Lobby
  const EMERGENCY = { id: "emergency", room: "lobby", ...at(ROOMS[0], 420, 380), name: "Emergency Button" };
  // the CCTV wall in Security: stand in front of it to watch every room
  const CCTV = { id: "cctv", room: "security", ...at(ROOMS[3], 240, 410), name: "CCTV Wall" };
  // furniture that every room shares; the 3D museum builds exactly these
  const FURNITURE = ROOMS.map((r) => ({
    room: r.id,
    cases: [at(r, 380, 60), at(r, 100, 380)], // centres of the 56 x 44 display cases
    benches: [at(r, 360, 400), at(r, 130, 40)], // centres of the 70 x 20 benches
    pillars: [at(r, 150, 150), at(r, 330, 150), at(r, 150, 290), at(r, 330, 290)],
  }));
  const OBSTACLES = FURNITURE.flatMap((f) => [
    ...f.cases.map((c) => ({ x: c.x - 28, y: c.y - 22, w: 56, h: 44 })),
    ...f.benches.map((c) => ({ x: c.x - 35, y: c.y - 10, w: 70, h: 20 })),
    ...f.pillars.map((c) => ({ x: c.x - 10, y: c.y - 10, w: 20, h: 20 })),
  ]).concat(
    // job consoles, statues, crates, the emergency button and the CCTV wall stand just behind the spot where you use them
    STATIONS.map((s) => ({ x: s.x - 10, y: s.y - 23, w: 20, h: 14 })),
    JOINTS.map((j) => ({ x: j.x - 13, y: j.y - 31, w: 26, h: 26 })),
    TRANSPORT.map((t) => ({ x: t.x - 11, y: t.y - 23, w: 22, h: 18 })),
    [
      { x: EMERGENCY.x - 9, y: EMERGENCY.y - 22, w: 18, h: 14 },
      { x: CCTV.x - 18, y: CCTV.y - 22, w: 36, h: 14 },
    ],
  );
  const inRect = (p, r) =>
    p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  const roomAt = (p) => ROOMS.find((r) => inRect(p, r));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const walkable = (p, closed = []) =>
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    !OBSTACLES.some((o) => inRect(p, o)) &&
    !DOORS.some((d) => closed.includes(d.id) && inRect(p, d)) &&
    (ROOMS.some((r) => inRect(p, r)) || DOORS.some((d) => inRect(p, d)));
  function line(a, b, closed = []) {
    const n = Math.ceil(distance(a, b) / 8);
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0;
      if (
        !walkable(
          { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
          closed,
        )
      )
        return false;
    }
    return true;
  }
  const center = (x, y) => ({ x: x * CELL + CELL / 2, y: y * CELL + CELL / 2 });
  function snap(p, closed = []) {
    let best = null,
      d = Infinity;
    for (
      let y = Math.max(0, Math.floor(p.y / CELL) - 2);
      y <= Math.min(ROWS - 1, Math.floor(p.y / CELL) + 2);
      y++
    )
      for (
        let x = Math.max(0, Math.floor(p.x / CELL) - 2);
        x <= Math.min(COLS - 1, Math.floor(p.x / CELL) + 2);
        x++
      ) {
        const q = center(x, y),
          dd = distance(p, q);
        if (walkable(q, closed) && dd < d) {
          best = q;
          d = dd;
        }
      }
    return best;
  }
  function route(from, to, closed = []) {
    const start = snap(from, closed),
      end = snap(to, closed);
    if (!start || !end || distance(end, to) > 35) return null;
    const key = (p) => Math.floor(p.y / CELL) * COLS + Math.floor(p.x / CELL),
      a = key(start),
      b = key(end),
      queue = [a],
      prev = new Map([[a, null]]);
    for (let i = 0; i < queue.length && !prev.has(b); i++) {
      const k = queue[i],
        x = k % COLS,
        y = Math.floor(k / COLS);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          n = ny * COLS + nx;
        if (
          nx < 0 ||
          nx >= COLS ||
          ny < 0 ||
          ny >= ROWS ||
          prev.has(n) ||
          !walkable(center(nx, ny), closed)
        )
          continue;
        prev.set(n, k);
        queue.push(n);
      }
    }
    if (!prev.has(b)) return null;
    const cells = [];
    for (let k = b; k !== null; k = prev.get(k))
      cells.push(center(k % COLS, Math.floor(k / COLS)));
    cells.reverse();
    // walk straight wherever the way is clear, ending exactly where you pointed
    const pts = [from, ...cells];
    if (walkable(to, closed)) pts.push(to);
    const clear = (a, b) =>
      [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]].every(([dx, dy]) =>
        line({ x: a.x + dx, y: a.y + dy }, { x: b.x + dx, y: b.y + dy }, closed),
      );
    const out = [from];
    for (let i = 0; i < pts.length - 1; ) {
      let j = pts.length - 1;
      while (j > i + 1 && !clear(pts[i], pts[j])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }
  function position(player, now) {
    const path = player.path || [player.pos || { x: 300, y: 260 }];
    let left = (Math.max(0, now - (player.walkAt || now)) / 1000) * SPEED;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        d = distance(a, b);
      if (left < d)
        return {
          x: a.x + (b.x - a.x) * (d ? left / d : 0),
          y: a.y + (b.y - a.y) * (d ? left / d : 0),
        };
      left -= d;
    }
    return { ...path[path.length - 1] };
  }
  function circuitValid(rotations) {
    if (
      !Array.isArray(rotations) ||
      rotations.length !== 6 ||
      rotations.some((r) => !Number.isInteger(r) || r < 0 || r > 3)
    )
      return false;
    const elbows = new Set([2, 5]);
    let cell = 0,
      entry = 3;
    const visited = new Set();
    while (!visited.has(cell)) {
      visited.add(cell);
      const ports = (elbows.has(cell) ? [0, 1] : [1, 3]).map(
        (p) => (p + rotations[cell]) % 4,
      );
      if (!ports.includes(entry)) return false;
      const exit = ports.find((p) => p !== entry),
        x = cell % 3,
        y = Math.floor(cell / 3),
        nx = x + [0, 1, 0, -1][exit],
        ny = y + [-1, 0, 1, 0][exit];
      if (nx < 0 || nx > 2 || ny < 0 || ny > 1)
        return cell === 3 && exit === 3 && visited.size === 6;
      cell = ny * 3 + nx;
      entry = (exit + 2) % 4;
    }
    return false;
  }
  const repairPoint = (d, p) =>
    d.w > d.h
      ? { x: p.x < d.x + d.w / 2 ? d.x - 10 : d.x + d.w + 10, y: d.y + d.h / 2 }
      : {
          x: d.x + d.w / 2,
          y: p.y < d.y + d.h / 2 ? d.y - 10 : d.y + d.h + 10,
        };
  return {
    repairPoint,
    WIDTH,
    HEIGHT,
    CELL,
    SPEED,
    ROOMS,
    DOORS,
    STATIONS,
    JOINTS,
    TRANSPORT,
    OBSTACLES,
    FURNITURE,
    EMERGENCY,
    CCTV,
    inRect,
    roomAt,
    distance,
    walkable,
    line,
    snap,
    route,
    position,
    circuitValid,
  };
});
