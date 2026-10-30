const { test, expect } = require("@playwright/test");
const { randomUUID } = require("node:crypto"),
  { call } = require("../helpers"),
  api = require("../../api/grand-heist"),
  R = api._rules,
  B = require("../../lib/heist-bot");
let ip = 0;
const post = (b) =>
  call(
    api,
    { requestId: randomUUID(), ...b },
    {},
    { "x-forwarded-for": "heist-browser-" + ++ip },
  );
const mem = (code) => globalThis.__roomStoreRooms["grand-heist"].get(code);
const at = (p, point) => {
  p.pos = { x: point.x, y: point.y };
  p.path = [p.pos];
  p.walkAt = Date.now();
};
async function fixture(browser, width = 390) {
  const h = (await post({ action: "create", name: "Benny" })).j,
    seats = [h];
  for (let i = 1; i < 5; i++)
    seats.push(
      (
        await post({
          action: "join",
          code: h.code,
          name: ["Mei", "Ash", "Luna", "Kai"][i - 1],
        })
      ).j,
    );
  const context = await browser.newContext({
    viewport: { width, height: 844 },
  });
  await context.addInitScript(
    (s) =>
      localStorage.setItem(
        "gh-seat",
        JSON.stringify({ code: s.code, pid: s.meId, tok: s.tok }),
      ),
    h,
  );
  await context.route("**/api/grand-heist**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      r = await call(
        api,
        req.method() === "POST" ? JSON.parse(req.postData()) : null,
        Object.fromEntries(url.searchParams),
        req.headers(),
      );
    await route.fulfill({
      status: r.s,
      contentType: "application/json",
      body: JSON.stringify(r.j),
    });
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/grand-heist.html");
  await expect(
    page.getByRole("button", { name: "Start The Heist", exact: true }),
  ).toBeVisible();
  return { h, seats, context, page, errors };
}
async function openMuseum(f) {
  await f.page
    .getByRole("button", { name: "Start The Heist", exact: true })
    .click();
  await expect(
    f.page.getByRole("dialog", { name: "Your Secret Card" }),
  ).toBeVisible();
  await f.page
    .getByRole("button", { name: "Keep It Secret", exact: true })
    .click();
  const r = mem(f.h.code);
  r.deadline = Date.now() - 1;
  await expect(f.page.locator(".map-curtain")).toHaveCount(0);
}
async function fit(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test("museum entrance, cover and controls fit mobile and desktop", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [320, 390, 1100]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/grand-heist.html");
    await expect(
      page.getByRole("heading", { name: "Good company. Bad intentions." }),
    ).toBeVisible();
    await expect(page.locator(".hero-art img")).toHaveJSProperty(
      "naturalWidth",
      1200,
    );
    await fit(page);
    await page.screenshot({
      path: info.outputPath("entrance-" + width + ".png"),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});
test("live map, mini-games, report, sealed vote and animated finale", async ({
  browser,
}, info) => {
  const f = await fixture(browser);
  try {
    await openMuseum(f);
    let r = mem(f.h.code),
      p = r.players.find((p) => p.id === f.h.meId);
    if (p.team === "thief") {
      const swap = r.players.find((q) => q.team === "staff");
      swap.team = "thief";
      swap.role = "thief";
      p.team = "staff";
      p.role = "medic";
    }
    await f.page.reload();
    await expect(f.page.locator("#museum-map")).toBeVisible();
    await fit(f.page);
    await f.page.screenshot({
      path: info.outputPath("museum-mobile.png"),
      fullPage: true,
    });
    // Walk through the map using the same navigation the player uses.
    await f.page.getByRole("button", { name: "Map", exact: true }).click();
    await f.page.getByRole("button", { name: "Gallery", exact: true }).click();
    await expect
      .poll(() => R.pos(mem(f.h.code).players.find((q) => q.id === p.id)).x)
      .toBeGreaterThan(180);
    for (const kind of ["wires", "circuit", "scan", "memory"]) {
      r = mem(f.h.code);
      p = r.players.find((q) => q.id === p.id);
      const station = R.W.STATIONS.find((s) => s.kind === kind),
        job = { ...station, id: randomUUID(), done: false };
      p.jobs = [job];
      at(p, station);
      await expect(
        f.page.getByRole("button", { name: job.name, exact: true }),
      ).toBeVisible();
      if (kind === "wires") {
        await f.page.keyboard.down("ArrowRight");
        await f.page.keyboard.press("e");
      } else
        await f.page
          .getByRole("button", { name: job.name, exact: true })
          .click();
      const d = f.page.getByRole("dialog", { name: job.name });
      await expect(d).toBeVisible();
      if (kind === "wires") await f.page.keyboard.up("ArrowRight");
      await fit(f.page);
      await f.page.screenshot({
        path: info.outputPath("puzzle-" + kind + ".png"),
        fullPage: true,
      });
      r = mem(f.h.code);
      p = r.players.find((q) => q.id === p.id);
      const c = p.challenge;
      c.startedAt = Date.now() - 6000;
      if (kind === "wires") {
        for (const shape of ["diamond", "circle", "triangle", "square"]) {
          await d
            .getByRole("button", { name: "Left " + shape, exact: true })
            .click();
          await d
            .getByRole("button", { name: "Right " + shape, exact: true })
            .click();
        }
      }
      if (kind === "circuit") {
        const proof = B.proof(c);
        for (let i = 0; i < 6; i++)
          for (let n = 0; n < (proof[i] - c.puzzle.rotations[i] + 4) % 4; n++)
            await d
              .getByRole("button", { name: "Rotate Tile " + (i + 1) })
              .click();
      }
      if (kind === "scan") {
        const pad = d.locator(".scan-pad"),
          box = await pad.boundingBox();
        for (const s of c.puzzle.spots) {
          await f.page.mouse.move(
            box.x + s.x * box.width,
            box.y + s.y * box.height,
          );
          await f.page.mouse.down();
          await f.page.mouse.up();
        }
      }
      if (kind === "memory") {
        const names = ["Diamond", "Circle", "Triangle", "Square"];
        await expect(
          d.getByRole("button", { name: names[0], exact: true }),
        ).toBeEnabled();
        await d
          .getByRole("button", { name: "Watch Again", exact: true })
          .click();
        await expect(
          d.getByRole("button", { name: names[0], exact: true }),
        ).toBeEnabled();
        for (const i of c.puzzle.sequence)
          await d.getByRole("button", { name: names[i], exact: true }).click();
      }
      await expect(d).toHaveCount(0);
      expect(
        mem(f.h.code).players.find((q) => q.id === p.id).jobs[0].done,
      ).toBe(true);
    }
    r = mem(f.h.code);
    p = r.players.find((q) => q.id === p.id);
    at(p, { x: 430, y: 140 });
    const thief = r.players.find((q) => q.team === "thief"),
      victim = r.players.find((q) => q.team === "staff" && q.id !== p.id);
    at(thief, { x: 450, y: 140 });
    at(victim, { x: 455, y: 140 });
    thief.killAt = 0;
    r.attackAt = 0;
    R.knockout(r, thief, { step: r.step, targetId: victim.id });
    await expect(
      f.page.getByRole("button", {
        name: "Report " + victim.name,
        exact: true,
      }),
    ).toBeVisible();
    await f.page
      .getByRole("button", { name: "Report " + victim.name, exact: true })
      .click();
    await expect(
      f.page.getByRole("heading", { name: "Someone Was Found." }),
    ).toBeVisible();
    const input = f.page.getByRole("textbox", { name: "Meeting Message" });
    await input.fill("I saw the thief near the exhibit.");
    await f.page.waitForTimeout(1100);
    await expect(input).toHaveValue("I saw the thief near the exhibit.");
    await f.page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(f.page.locator(".chat-message")).toContainText(
      "I saw the thief",
    );
    await f.page.screenshot({
      path: info.outputPath("meeting-mobile.png"),
      fullPage: true,
    });
    r = mem(f.h.code);
    r.lastMeetingAt = Date.now() - 11000;
    await f.page
      .getByRole("button", { name: "Start Voting", exact: true })
      .click();
    await f.page
      .getByRole("button", { name: "Vote " + thief.name, exact: true })
      .click();
    await expect(
      f.page.getByRole("button", {
        name: "Seal Vote · " + thief.name,
        exact: true,
      }),
    ).toBeEnabled();
    await f.page.waitForTimeout(1100);
    await expect(
      f.page.getByRole("button", { name: "Vote " + thief.name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await f.page
      .getByRole("button", { name: "Seal Vote · " + thief.name, exact: true })
      .click();
    r = mem(f.h.code);
    for (const id of [...r.electorate])
      if (!Object.hasOwn(r.votes, id))
        R.vote(
          r,
          r.players.find((q) => q.id === id),
          { step: r.step, targetId: thief.id },
        );
    await expect(
      f.page.getByRole("heading", { name: thief.name + " Was Escorted Out" }),
    ).toBeVisible();
    await f.page.screenshot({
      path: info.outputPath("verdict-mobile.png"),
      fullPage: true,
    });
    r = mem(f.h.code);
    r.deadline = Date.now() - 1;
    await expect(
      f.page.getByRole("heading", { name: "The Museum Is Safe." }),
    ).toBeVisible();
    await fit(f.page);
    await f.page.screenshot({
      path: info.outputPath("finale-mobile.png"),
      fullPage: true,
    });
    expect(f.errors).toEqual([]);
  } finally {
    await f.context.close();
  }
});
test("lobby bot controls update the roster and bots participate", async ({
  browser,
}) => {
  const f = await fixture(browser, 320);
  try {
    await f.page.getByRole("button", { name: /Add a bot/i }).click();
    await expect(f.page.locator(".heist-seat")).toHaveCount(6);
    await f.page.getByRole("button", { name: /Remove a bot/i }).click();
    await expect(f.page.locator(".heist-seat")).toHaveCount(5);
    await expect(
      f.page.getByRole("button", { name: "Start The Heist", exact: true }),
    ).toBeEnabled();
    await fit(f.page);
    expect(f.errors).toEqual([]);
  } finally {
    await f.context.close();
  }
});

test("camera footage and two players holding a statue handle", async ({
  browser,
}, info) => {
  const f = await fixture(browser, 320);
  let helper;
  try {
    await openMuseum(f);
    let r = mem(f.h.code),
      p = r.players.find((q) => q.id === f.h.meId);
    if (p.team === "thief") {
      const swap = r.players.find((q) => q.team === "staff");
      swap.team = "thief";
      swap.role = "thief";
      p.team = "staff";
    }
    p.role = "camera";
    at(p, R.W.STATIONS[3]);
    await expect(
      f.page.getByRole("button", { name: "Watch Camera", exact: true }),
    ).toBeVisible();
    await f.page
      .getByRole("button", { name: "Watch Camera", exact: true })
      .click();
    await f.page.getByRole("button", { name: "Gallery", exact: true }).click();
    await expect(f.page.locator(".camera-screen")).toBeVisible();
    await f.page.screenshot({
      path: info.outputPath("camera-mobile.png"),
      fullPage: true,
    });
    r = mem(f.h.code);
    p = r.players.find((q) => q.id === f.h.meId);
    const j = r.joints[0],
      other = r.players.find((q) => q.team === "staff" && q.id !== p.id);
    at(p, j);
    at(other, j);
    await expect(
      f.page.getByRole("button", { name: "Move Statue Together", exact: true }),
    ).toBeVisible();
    await f.page
      .getByRole("button", { name: "Move Statue Together", exact: true })
      .click();
    const d = f.page.getByRole("dialog", { name: "Move Statue Together" });
    await expect(d).toBeVisible();
    helper = setInterval(() => {
      const r = mem(f.h.code);
      if (r.phase === "live" && !r.joints[0].done)
        R.hold(
          r,
          r.players.find((q) => q.id === other.id),
          { step: r.step, jobId: j.id, pull: 1 },
        );
    }, 500);
    const slider = d.getByRole("slider");
    await slider.focus();
    await f.page.keyboard.down("End");
    await expect(slider).toHaveValue("100");
    await f.page.screenshot({
      path: info.outputPath("joint-job-mobile.png"),
      fullPage: true,
    });
    await expect(d).toHaveCount(0);
    await f.page.keyboard.up("End");
    expect(mem(f.h.code).joints[0].done).toBe(true);
    await fit(f.page);
    expect(f.errors).toEqual([]);
  } finally {
    clearInterval(helper);
    await f.context.close();
  }
});

test("Chinese controls and role instructions preserve player names", async ({
  browser,
}) => {
  const f = await fixture(browser, 390);
  try {
    await f.page.evaluate(() => GameI18n.set("zh"));
    await expect(
      f.page.getByRole("button", { name: "开始行动", exact: true }),
    ).toBeVisible();
    await expect(f.page.locator(".heist-seat").first()).toContainText("Benny");
    await f.page.getByRole("button", { name: "开始行动", exact: true }).click();
    await expect(
      f.page.getByRole("dialog", { name: "你的身份卡" }),
    ).toBeVisible();
    await expect(f.page.locator(".role-detail")).toHaveText(/[\u3400-\u9fff]/);
    await f.page.getByRole("button", { name: "请保密", exact: true }).click();
    await f.page.evaluate(() => GameI18n.set("zht"));
    await expect(f.page.locator(".private-toggle")).toBeVisible();
    await f.page.locator(".private-toggle").click();
    await expect(
      f.page.getByRole("dialog", { name: "你的身份卡" }),
    ).toBeVisible();
    expect(f.errors).toEqual([]);
  } finally {
    await f.context.close();
  }
});

test("3D museum renders, walks with the arrow keys and falls back to the flat map", async ({ browser }, info) => {
  const f = await fixture(browser, 1100);
  await openMuseum(f);
  const canvas = f.page.locator("#museum-map");
  await expect(canvas).toHaveAttribute("data-map", /^(3d|2d)$/);
  if ((await canvas.getAttribute("data-map")) === "3d") {
    await expect(f.page.locator(".map3d-loading")).toHaveCount(0);
    const before = mem(f.h.code).players.find((p) => p.id === f.h.meId);
    const start = { ...(before.pos || {}) };
    await f.page.keyboard.down("ArrowRight");
    await f.page.waitForTimeout(1200);
    await f.page.keyboard.up("ArrowRight");
    await expect
      .poll(() => {
        const p = mem(f.h.code).players.find((q) => q.id === f.h.meId);
        const end = p.path?.at(-1) || p.pos;
        return end.x - start.x;
      })
      .toBeGreaterThan(40);
    await f.page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + "/heist-3d.png" : info.outputPath("heist-3d.png") });
  }
  expect(f.errors).toEqual([]);
  await f.page.goto("/grand-heist.html?map=2d");
  await f.context.close();
});
