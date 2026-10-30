/* Shared geometry and puzzle rules. No roles or private room state live here. */
(function (root, factory) {
  const world = factory();
  if (typeof module === "object" && module.exports) module.exports = world;
  else root.HeistWorld = world;
})(typeof window === "object" ? window : globalThis, () => {
  const WIDTH = 960,
    HEIGHT = 640,
    CELL = 20,
    SPEED = 105;
  const ROOMS = [
    { id: "lobby", name: "Lobby", x: 40, y: 40, color: "#314555" },
    { id: "gallery", name: "Gallery", x: 360, y: 40, color: "#4b354d" },
    { id: "vault", name: "Vault", x: 680, y: 40, color: "#4b4430" },
    { id: "security", name: "Security", x: 40, y: 380, color: "#274d50" },
    { id: "workshop", name: "Workshop", x: 360, y: 380, color: "#4b3933" },
    { id: "service", name: "Service Hall", x: 680, y: 380, color: "#33453a" },
  ].map((r) => ({ ...r, w: 240, h: 220 }));
  const DOORS = [
    { id: "north-west", name: "Lobby / Gallery", x: 280, y: 140, w: 80, h: 40 },
    { id: "north-east", name: "Gallery / Vault", x: 600, y: 140, w: 80, h: 40 },
    {
      id: "south-west",
      name: "Security / Workshop",
      x: 280,
      y: 460,
      w: 80,
      h: 40,
    },
    {
      id: "south-east",
      name: "Workshop / Service",
      x: 600,
      y: 460,
      w: 80,
      h: 40,
    },
    ...["west", "middle", "east"].map((n, i) => ({
      id: n,
      name: ["Lobby / Security", "Gallery / Workshop", "Vault / Service"][i],
      x: 140 + i * 320,
      y: 260,
      w: 40,
      h: 120,
    })),
  ];
  const STATIONS = ROOMS.map((r, i) => ({
    id: "station-" + r.id,
    room: r.id,
    x: r.x + 70,
    y: r.y + 70,
    kind: ["memory", "scan", "wires", "circuit", "wires", "memory"][i],
    name: [
      "Unlock Display",
      "Scan Treasure",
      "Fix Alarm",
      "Restore Camera",
      "Fix Alarm",
      "Unlock Display",
    ][i],
  }));
  const JOINTS = [
    {
      id: "statue-gallery",
      room: "gallery",
      name: "Move Statue",
      x: 550,
      y: 210,
    },
    {
      id: "statue-workshop",
      room: "workshop",
      name: "Move Statue",
      x: 550,
      y: 550,
    },
  ];
  const TRANSPORT = ROOMS.map((r) => ({
    id: "crate-" + r.id,
    room: r.id,
    x: r.x + 44,
    y: r.y + 156,
    name: r.id === "service" ? "Service Exit" : "Exhibit Crate",
  }));
  const OBSTACLES = ROOMS.flatMap((r) => [
    { x: r.x + 144, y: r.y + 32, w: 56, h: 44 },
    { x: r.x + 98, y: r.y + 186, w: 70, h: 20 },
  ])
    // job consoles, statues and crates stand just behind the spot where you use them
    .concat(
      STATIONS.map((s) => ({ x: s.x - 10, y: s.y - 23, w: 20, h: 14 })),
      JOINTS.map((j) => ({ x: j.x - 13, y: j.y - 31, w: 26, h: 26 })),
      TRANSPORT.map((t) => ({ x: t.x - 11, y: t.y - 23, w: 22, h: 18 })),
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
      y <= Math.min(31, Math.floor(p.y / CELL) + 2);
      y++
    )
      for (
        let x = Math.max(0, Math.floor(p.x / CELL) - 2);
        x <= Math.min(47, Math.floor(p.x / CELL) + 2);
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
    const key = (p) => Math.floor(p.y / CELL) * 48 + Math.floor(p.x / CELL),
      a = key(start),
      b = key(end),
      queue = [a],
      prev = new Map([[a, null]]);
    for (let i = 0; i < queue.length && !prev.has(b); i++) {
      const k = queue[i],
        x = k % 48,
        y = Math.floor(k / 48);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          n = ny * 48 + nx;
        if (
          nx < 0 ||
          nx >= 48 ||
          ny < 0 ||
          ny >= 32 ||
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
      cells.push(center(k % 48, Math.floor(k / 48)));
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
    const path = player.path || [player.pos || { x: 160, y: 150 }];
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
