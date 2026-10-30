// Exercise the actual WebGL renderer, including software rendering on CI.
const { test, expect } = require("@playwright/test");
const { call } = require("../helpers"),
  { randomUUID } = require("node:crypto"),
  api = require("../../api/grand-heist"),
  R = api._rules;
test("museum graphics render on phones and desktop, dim during sabotage and keep controls clear", async ({
  playwright,
}, info) => {
  const browser = await playwright.chromium.launch({
    channel: process.env.CHROMIUM_CHANNEL || undefined,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  try {
    let n = 0;
    const post = (b) =>
        call(
          api,
          { requestId: randomUUID(), ...b },
          {},
          { "x-forwarded-for": "heist-art-" + ++n },
        ),
      host = (await post({ action: "create", name: "Benny" })).j;
    for (const name of ["Mei", "Ash", "Luna", "Kai"])
      await post({ action: "join", code: host.code, name });
    const room = () =>
      globalThis.__roomStoreRooms["grand-heist"].get(host.code);
    R.start(room());
    R.phase(room(), "live");
    const own = room().players.find((p) => p.id === host.meId);
    own.pos = { x: 150, y: 180 };
    own.path = [own.pos];
    own.walkAt = Date.now();
    room().players.forEach((p, i) => {
      p.avatarIndex = i;
      if (p !== own) {
        p.pos = { x: 100 + i * 32, y: 125 };
        p.path = [p.pos];
        p.walkAt = Date.now();
      }
    });
    await context.addInitScript(
      (s) =>
        localStorage.setItem(
          "gh-seat",
          JSON.stringify({ code: s.code, pid: s.meId, tok: s.tok }),
        ),
      host,
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
    page.on("console", (m) => {
      if (/Shader Error|WebGLProgram.*error/i.test(m.text()))
        errors.push(m.text());
    });
    await page.goto("/grand-heist.html");
    await page.waitForFunction(
      () =>
        document.querySelector("#museum-map")?.__map?.renderer?.info.render
          .calls > 0,
    );
    await expect(page.locator("#museum-map")).toHaveAttribute("data-map", "3d");
    await expect(page.locator(".map3d-loading")).toHaveCount(0);
    // The art is decoded and actually attached to the scene, rather than just requested.
    await expect
      .poll(() =>
        page
          .locator("#museum-map")
          .evaluate((c) => c.__map.paintTex?.size || 0),
      )
      .toBeGreaterThan(0);
    for (const width of [320, 390, 1100]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(350);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const overlap = () =>
        page.evaluate(() => {
          const a = document
              .querySelector(".action-bar")
              .getBoundingClientRect(),
            b = document.getElementById("pf-dock").getBoundingClientRect();
          return (
            Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
            Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
          );
        });
      await expect.poll(overlap).toBe(0);
      await page.screenshot({
        path: info.outputPath("gallery-" + width + ".png"),
        fullPage: true,
      });
    }
    room().sabotage = { kind: "lights", until: Date.now() + 20000 };
    await expect
      .poll(
        () =>
          page
            .locator("#museum-map")
            .evaluate((c) => c.__map.scene.environmentIntensity),
        { timeout: 15000 },
      )
      .toBeLessThan(0.12);
    await page.screenshot({
      path: info.outputPath("blackout.png"),
      fullPage: true,
    });
    room().sabotage = null;
    await expect
      .poll(() =>
        page
          .locator("#museum-map")
          .evaluate((c) => c.__map.scene.environmentIntensity),
      )
      .toBeGreaterThan(0.6);
    await page.goto("/grand-heist.html?map=2d");
    await expect(page.locator("#museum-map")).toHaveAttribute("data-map", "2d");
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
  }
});
