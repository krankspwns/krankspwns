/* The museum is drawn at world coordinates. Paths are timed by the server; frames are interpolated locally. */
(() => {
  const W = HeistWorld,
    colors = [
      "#ded1ac",
      "#9d3c51",
      "#344f9e",
      "#e8d9b4",
      "#bd8a34",
      "#3f7460",
      "#ac4365",
      "#3c5977",
      "#796d92",
      "#ac533a",
      "#347a78",
      "#69636b",
    ];
  const faces = new Image();
  faces.src = "/grand-con/guests.webp";
  const lots = new Image();
  lots.src = "/grand-con/lots.webp";
  const rounded = (c, x, y, w, h, r = 8) => {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
  };
  function floor() {
    const n = document.createElement("canvas");
    n.width = W.WIDTH;
    n.height = W.HEIGHT;
    const c = n.getContext("2d");
    c.fillStyle = "#07121c";
    c.fillRect(0, 0, n.width, n.height);
    for (const d of W.DOORS) {
      c.fillStyle = "#3e4c47";
      c.fillRect(d.x - 4, d.y - 4, d.w + 8, d.h + 8);
      c.fillStyle = "#233c3c";
      c.fillRect(d.x, d.y, d.w, d.h);
      c.strokeStyle = "#d4b97b44";
      c.strokeRect(d.x + 4, d.y + 4, d.w - 8, d.h - 8);
    }
    for (const [i, r] of W.ROOMS.entries()) {
      c.shadowColor = "#000b";
      c.shadowBlur = 15;
      c.shadowOffsetY = 8;
      c.fillStyle = "#07171d";
      rounded(c, r.x - 10, r.y - 10, r.w + 20, r.h + 20, 12);
      c.fill();
      c.shadowBlur = 0;
      c.shadowOffsetY = 0;
      const g = c.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      g.addColorStop(0, r.color);
      g.addColorStop(1, "#17282e");
      c.fillStyle = g;
      rounded(c, r.x, r.y, r.w, r.h, 7);
      c.fill();
      c.save();
      rounded(c, r.x, r.y, r.w, r.h, 7);
      c.clip();
      for (let x = r.x; x < r.x + r.w; x += 30)
        for (let y = r.y; y < r.y + r.h; y += 30) {
          c.fillStyle =
            ((x - r.x + y - r.y) / 30) % 2 ? "#e4d1a405" : "#00000008";
          c.fillRect(x, y, 30, 30);
          c.strokeStyle = "#e5d3a408";
          c.strokeRect(x, y, 30, 30);
        }
      c.restore();
      c.strokeStyle = "#d2b57c88";
      c.lineWidth = 2;
      rounded(c, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 5);
      c.stroke();
      c.strokeStyle = "#e1c99122";
      c.lineWidth = 1;
      c.strokeRect(r.x + 10, r.y + 10, r.w - 20, r.h - 20);
      // Wall lights, paintings and benches are placed off the walking routes.
      for (const dx of [16, 220]) {
        c.fillStyle = "#e7c978";
        c.beginPath();
        c.arc(r.x + dx, r.y + 21, 3, 0, Math.PI * 2);
        c.fill();
        const light = c.createRadialGradient(
          r.x + dx,
          r.y + 21,
          0,
          r.x + dx,
          r.y + 21,
          35,
        );
        light.addColorStop(0, "#efce7330");
        light.addColorStop(1, "#efce7300");
        c.fillStyle = light;
        c.fillRect(r.x + dx - 35, r.y - 14, 70, 70);
      }
      c.fillStyle = "#071820";
      rounded(c, r.x + 144, r.y + 32, 56, 44, 5);
      c.fill();
      c.strokeStyle = "#d4ba7f";
      c.stroke();
      c.fillStyle = "#dbc28c44";
      c.fillRect(r.x + 149, r.y + 37, 46, 34);
      c.fillStyle = "#c8b57988";
      c.fillRect(r.x + 155, r.y + 58, 34, 5);
      c.fillStyle = "#18262d";
      rounded(c, r.x + 98, r.y + 186, 70, 20, 5);
      c.fill();
      c.fillStyle = "#705b45";
      rounded(c, r.x + 101, r.y + 188, 64, 13, 3);
      c.fill();
      c.fillStyle = "#b9c8bc";
      c.font = "700 10px Inter, sans-serif";
      c.textAlign = "center";
      c.letterSpacing = "2px";
      c.fillText(
        (window.GameI18n?.t(r.name) || r.name).toUpperCase(),
        r.x + r.w / 2,
        r.y + 26,
      );
      c.letterSpacing = "0px";
      // Individual room accents keep the six spaces easy to identify.
      c.fillStyle = "#ecd59a0b";
      c.beginPath();
      c.ellipse(r.x + 120, r.y + 116, 70, 53, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#d6bd7a25";
      c.stroke();
      if (i === 3) {
        c.fillStyle = "#091d23";
        rounded(c, r.x + 80, r.y + 120, 88, 35, 6);
        c.fill();
        for (let j = 0; j < 3; j++) {
          c.fillStyle = "#5fa694";
          c.fillRect(r.x + 86 + j * 27, r.y + 126, 21, 15);
          c.fillStyle = "#a3ecc642";
          c.fillRect(r.x + 88 + j * 27, r.y + 128, 17, 3);
        }
      }
      if (i === 5) {
        c.fillStyle = "#142b28";
        c.fillRect(r.x + 170, r.y + 10, 50, 12);
        c.fillStyle = "#81c49e";
        c.font = "700 7px Inter";
        c.fillText("SERVICE EXIT", r.x + 195, r.y + 19);
      }
    }
    return n;
  }
  window.MuseumMap = class {
    static floor = floor;
    constructor(canvas, { state, now, move, action, report }) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.getState = state;
      this.now = now;
      this.move = move;
      this.action = action;
      this.report = report;
      this.floor = floor();
      this.rendered = new Map();
      this.keys = new Set();
      this.pan = { x: 230, y: 260 };
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas);
      this.resize();
      this.pointer = (e) => this.tap(e);
      canvas.addEventListener("pointerdown", this.pointer);
      this.keydown = (e) => {
        if (
          document.querySelector("dialog[open]") ||
          /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)
        )
          return;
        if (
          [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "w",
            "a",
            "s",
            "d",
          ].includes(e.key)
        ) {
          e.preventDefault();
          this.keys.add(e.key);
        }
        if (e.key.toLowerCase() === "e") this.action();
        if (e.key.toLowerCase() === "r") this.report();
      };
      this.keyup = (e) => {
        this.keys.delete(e.key);
        if (!this.keys.size && this.wasMoving) {
          this.move(this.localPosition());
          this.wasMoving = false;
        }
      };
      this.blur = () => {
        this.keys.clear();
      };
      addEventListener("keydown", this.keydown);
      addEventListener("keyup", this.keyup);
      addEventListener("blur", this.blur);
      this.frame();
    }
    resize() {
      const r = this.canvas.getBoundingClientRect(),
        dpr = Math.min(devicePixelRatio || 1, 2);
      this.width = r.width;
      this.height = r.height;
      this.canvas.width = r.width * dpr;
      this.canvas.height = r.height * dpr;
      this.dpr = dpr;
      this.scale = r.width >= 800 ? r.width / W.WIDTH : r.width / 460;
    }
    localPosition() {
      const s = this.getState();
      return s
        ? W.position(
            { path: s.me.path, walkAt: s.me.walkAt, pos: s.me.position },
            this.now(),
          )
        : { x: 160, y: 150 };
    }
    tap(e) {
      const s = this.getState();
      if (!s || s.phase !== "live" || document.querySelector("dialog[open]"))
        return;
      const r = this.canvas.getBoundingClientRect(),
        p = {
          x: (e.clientX - r.left - this.width / 2) / this.scale + this.pan.x,
          y: (e.clientY - r.top - this.height / 2) / this.scale + this.pan.y,
        };
      if (W.walkable(p, s.sabotage?.kind === "door" ? [s.sabotage.door] : [])) {
        this.ping = { ...p, at: performance.now() };
        this.move(p);
      }
    }
    character(c, p, person, own = false, ghost = false, down = false) {
      const i = person?.avatarIndex || 0,
        t = performance.now(),
        moving = p.moving,
        walk = moving ? Math.sin(t / 105) * 3 : 0;
      c.save();
      c.translate(p.x, p.y);
      if (down) c.rotate(-Math.PI / 2);
      if (ghost) c.globalAlpha = 0.38;
      c.fillStyle = "#0007";
      c.beginPath();
      c.ellipse(0, 12, 12, 5, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = colors[i];
      c.lineWidth = 5;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(-4, 4);
      c.lineTo(-5, 12 + walk);
      c.moveTo(4, 4);
      c.lineTo(5, 12 - walk);
      c.stroke();
      c.fillStyle = colors[i];
      rounded(c, -9, -8, 18, 17, 6);
      c.fill();
      c.fillStyle = "#f5ead5";
      c.beginPath();
      c.moveTo(-4, -8);
      c.lineTo(0, 2);
      c.lineTo(4, -8);
      c.fill();
      c.strokeStyle = colors[i];
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(-9, -5);
      c.lineTo(-12, 3 - walk / 2);
      c.moveTo(9, -5);
      c.lineTo(12, 3 + walk / 2);
      c.stroke();
      c.save();
      c.beginPath();
      c.arc(0, -17, 12, 0, Math.PI * 2);
      c.clip();
      if (faces.complete && faces.naturalWidth) {
        const size = faces.naturalWidth / 4;
        c.drawImage(
          faces,
          (i % 4) * size + 45,
          Math.floor(i / 4) * size,
          270,
          270,
          -12,
          -29,
          24,
          24,
        );
      } else {
        c.fillStyle = "#c49370";
        c.fillRect(-12, -29, 24, 24);
      }
      c.restore();
      if (own) {
        c.strokeStyle = "#f3d58e";
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(0, -17, 13.5, 0, Math.PI * 2);
        c.stroke();
      }
      if (p.bag) {
        c.fillStyle = "#a18450";
        rounded(c, 7, -3, 13, 14, 3);
        c.fill();
        c.strokeStyle = "#e9d3a0";
        c.stroke();
      }
      if (!down) {
        c.font = "600 10px Inter, sans-serif";
        c.textAlign = "center";
        const label = own ? "You" : person?.name || "";
        const w = c.measureText(label).width;
        c.fillStyle = "#071722d9";
        rounded(c, -w / 2 - 5, -48, w + 10, 15, 5);
        c.fill();
        c.fillStyle = own ? "#f9dfa2" : "#e6eeea";
        c.fillText(label, 0, -37);
      }
      c.restore();
    }
    frame() {
      if (this.destroyed) return;
      this.raf = requestAnimationFrame(() => this.frame());
      const s = this.getState();
      if (!s) return;
      if (this.language !== window.GameI18n?.lang) {
        this.language = window.GameI18n?.lang;
        this.floor = floor();
      }
      const now = this.now(),
        own = this.localPosition();
      const vx = W.WIDTH / 2,
        vy = W.HEIGHT / 2;
      const halfW = this.width / (2 * this.scale),
        halfH = this.height / (2 * this.scale),
        targetX =
          halfW >= vx ? vx : Math.max(halfW, Math.min(W.WIDTH - halfW, own.x)),
        targetY =
          halfH >= vy ? vy : Math.max(halfH, Math.min(W.HEIGHT - halfH, own.y));
      this.pan.x += (targetX - this.pan.x) * 0.13;
      this.pan.y += (targetY - this.pan.y) * 0.13;
      if (document.querySelector("dialog[open]")) this.keys.clear();
      if (this.keys.size && performance.now() - (this.lastMove || 0) > 180) {
        let dx =
            (this.keys.has("ArrowRight") || this.keys.has("d") ? 1 : 0) -
            (this.keys.has("ArrowLeft") || this.keys.has("a") ? 1 : 0),
          dy =
            (this.keys.has("ArrowDown") || this.keys.has("s") ? 1 : 0) -
            (this.keys.has("ArrowUp") || this.keys.has("w") ? 1 : 0);
        const length = Math.hypot(dx, dy);
        if (length) {
          dx /= length;
          dy /= length;
          let dest = own;
          for (let d = 10; d <= 65; d += 5) {
            const q = { x: own.x + dx * d, y: own.y + dy * d };
            if (
              !W.walkable(
                q,
                s.sabotage?.kind === "door" ? [s.sabotage.door] : [],
              )
            )
              break;
            dest = q;
          }
          this.move(dest);
          this.lastMove = performance.now();
          this.wasMoving = true;
        }
      }
      const c = this.ctx;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.fillStyle = "#07121b";
      c.fillRect(0, 0, this.width, this.height);
      c.translate(this.width / 2, this.height / 2);
      c.scale(this.scale, this.scale);
      c.translate(-this.pan.x, -this.pan.y);
      c.drawImage(this.floor, 0, 0);
      for (const r of W.ROOMS)
        if (lots.complete && lots.naturalWidth) {
          const sw = lots.naturalWidth / 4,
            sh = lots.naturalHeight / 2,
            index = {
              lobby: 4,
              gallery: 0,
              vault: 2,
              security: 3,
              workshop: 5,
              service: 7,
            }[r.id];
          c.save();
          c.globalAlpha = 0.8;
          c.drawImage(
            lots,
            (index % 4) * sw,
            Math.floor(index / 4) * sh,
            sw,
            sh,
            r.x + 148,
            r.y + 32,
            48,
            43,
          );
          c.restore();
        }
      const gradient = c.createRadialGradient(
        own.x,
        own.y,
        40,
        own.x,
        own.y,
        s.me.vision || 185,
      );
      gradient.addColorStop(0, "#020d1700");
      gradient.addColorStop(0.7, "#020d1730");
      gradient.addColorStop(1, "#020d17cc");
      c.fillStyle = gradient;
      c.fillRect(0, 0, W.WIDTH, W.HEIGHT);
      // Your jobs remain on the blueprint; other players' work is never exposed.
      for (const j of [...s.me.jobs, ...s.recovery, ...s.joints]) {
        if (j.done) continue;
        c.save();
        c.translate(j.x, j.y);
        const pulse = 1 + Math.sin(performance.now() / 600) * 0.08;
        c.scale(pulse, pulse);
        c.fillStyle = j.id.startsWith("statue-") ? "#b9b0e6" : "#e7ca82";
        c.shadowBlur = 12;
        c.shadowColor = c.fillStyle;
        c.beginPath();
        c.arc(0, 0, 9, 0, Math.PI * 2);
        c.fill();
        c.shadowBlur = 0;
        c.fillStyle = "#182830";
        c.font = "800 12px Inter";
        c.textAlign = "center";
        c.fillText(
          j.id.startsWith("statue-") ? "Ⅱ" : j.kind === "carry" ? "↗" : "!",
          0,
          4,
        );
        c.restore();
      }
      if (s.me.bag) {
        const dest = W.TRANSPORT.find((j) => j.id === s.me.bag.dest);
        c.strokeStyle = "#9cf0c3";
        c.lineWidth = 2;
        c.beginPath();
        c.arc(
          dest.x,
          dest.y,
          16 + Math.sin(performance.now() / 300) * 2,
          0,
          Math.PI * 2,
        );
        c.stroke();
        c.fillStyle = "#a1efcf";
        c.font = "600 10px Inter";
        c.textAlign = "center";
        c.fillText("DELIVER", dest.x, dest.y - 22);
      }
      if (s.sabotage?.kind === "door") {
        const d = W.DOORS.find((d) => d.id === s.sabotage.door);
        c.fillStyle = "#a4425299";
        c.fillRect(d.x, d.y, d.w, d.h);
        c.strokeStyle = "#f0919b";
        c.lineWidth = 3;
        c.strokeRect(d.x + 3, d.y + 3, d.w - 6, d.h - 6);
      }
      for (const t of s.trails) {
        c.save();
        c.globalAlpha = Math.max(0, 1 - (now - t.at) / 18000);
        for (let i = 0; i < 4; i++) {
          c.fillStyle = "#e9c87c";
          c.beginPath();
          c.ellipse(
            t.x + t.dx * i * 9 + (i % 2 ? 3 : -3),
            t.y + t.dy * i * 9,
            2,
            4,
            0,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
        c.restore();
      }
      for (const b of s.bodies)
        this.character(
          c,
          { x: b.x, y: b.y },
          s.players.find((p) => p.id === b.playerId),
          false,
          false,
          true,
        );
      const all = [
        ...s.nearby.map((p) => ({
          ...p,
          person: s.players.find((q) => q.id === p.id),
        })),
        {
          id: s.meId,
          ...own,
          person: s.players.find((q) => q.id === s.meId),
          bag: !!s.me.bag,
          own: true,
        },
      ].sort((a, b) => a.y - b.y);
      for (const p of all) {
        const old = this.rendered.get(p.id) || { x: p.x, y: p.y };
        const dd = W.distance(old, p);
        old.x += (p.x - old.x) * (p.own ? 0.55 : 0.3);
        old.y += (p.y - old.y) * (p.own ? 0.55 : 0.3);
        this.rendered.set(p.id, old);
        this.character(
          c,
          {
            ...old,
            bag: p.bag,
            moving:
              dd > 0.5 || (p.own && W.distance(own, s.me.path.at(-1)) > 4),
          },
          p.person,
          p.own,
          !s.me.alive,
        );
      }
      for (const e of s.events) {
        const t = (now - e.at) / 1000;
        if (t < 1.2 && t >= 0) {
          c.save();
          c.globalAlpha = 1 - t / 1.2;
          c.strokeStyle = "#f38eac";
          c.lineWidth = 4;
          c.beginPath();
          c.arc(e.x, e.y - 10, 18 + t * 20, -2.5, -0.3);
          c.stroke();
          c.restore();
        }
      }
      if (this.ping) {
        const t = (performance.now() - this.ping.at) / 600;
        if (t < 1) {
          c.strokeStyle = "#f2dfa3";
          c.globalAlpha = 1 - t;
          c.lineWidth = 1.5;
          c.beginPath();
          c.arc(this.ping.x, this.ping.y, 6 + t * 13, 0, Math.PI * 2);
          c.stroke();
          c.globalAlpha = 1;
        }
      }
    }
    drawCamera(canvas, room, players, people) {
      const r = W.ROOMS.find((r) => r.id === room);
      if (!r) return;
      const c = canvas.getContext("2d"),
        scale = canvas.width / (r.w + 24);
      c.setTransform(
        scale,
        0,
        0,
        scale,
        -(r.x - 12) * scale,
        -(r.y - 12) * scale,
      );
      c.drawImage(this.floor, 0, 0);
      for (const p of players)
        this.character(
          c,
          p,
          people.find((q) => q.id === p.id),
        );
      c.fillStyle = "#78c5b312";
      c.fillRect(r.x - 12, r.y - 12, r.w + 24, r.h + 24);
      c.strokeStyle = "#91d5c11c";
      c.lineWidth = 1;
      for (let y = r.y; y < r.y + r.h; y += 5) {
        c.beginPath();
        c.moveTo(r.x, y);
        c.lineTo(r.x + r.w, y);
        c.stroke();
      }
    }
    destroy() {
      this.destroyed = true;
      cancelAnimationFrame(this.raf);
      this.observer.disconnect();
      this.canvas.removeEventListener("pointerdown", this.pointer);
      removeEventListener("keydown", this.keydown);
      removeEventListener("keyup", this.keyup);
      removeEventListener("blur", this.blur);
    }
  };
})();
