(() => {
  "use strict";
  const W = HeistWorld,
    el = TableKit.el,
    txt = TableKit.text,
    root = document.getElementById("heist-app"),
    head = document.getElementById("heist-header");
  const KEY = "gh-seat",
    read = (k) => {
      try {
        return JSON.parse(localStorage.getItem(k) || "null");
      } catch {
        return null;
      }
    },
    store = (k, v) => {
      try {
        v == null
          ? localStorage.removeItem(k)
          : localStorage.setItem(k, JSON.stringify(v));
      } catch {}
    };
  let seat = read(KEY),
    state = null,
    busy = false,
    error = "",
    timer,
    offset = 0,
    scene = "",
    museum = null,
    dialog = null,
    dialogKey = "",
    pendingMove = null,
    lastMove = 0,
    votePick = undefined,
    jobTimer = null,
    holdTimer = null;
  let name = read("gh-name") || "",
    code =
      new URLSearchParams(location.search).get("room")?.toUpperCase() || "",
    recovery = "";
  if (code && seat?.code !== code) seat = null;
  const roles = {
    staff: [
      "Staff",
      "Finish your jobs and secure the museum. Find and vote out the thieves.",
    ],
    medic: [
      "Medic",
      "You are Staff. Once per game, rescue a freshly knocked-out player before anyone reports them.",
    ],
    camera: [
      "Camera Operator",
      "You are Staff. Visit Security to watch one room for six seconds.",
    ],
    thief: [
      "Thief",
      "Blend in, fake jobs, sabotage and knock out isolated Staff. Your teammates are listed below.",
    ],
  };
  const now = () => Date.now() + offset,
    who = (id) => state?.players.find((p) => p.id === id)?.name || "Skip",
    sound = (n) => window.GameAudio?.sfx(n);
  const button = (label, action, kind = "", disabled = false, extra = {}) =>
    el(
      "button",
      { type: "button", class: kind, disabled, onclick: action, ...extra },
      label,
    );
  function face(id, cls = "") {
    const p = state?.players.find((p) => p.id === id),
      i = p?.avatarIndex || 0;
    return el("span", {
      class: "heist-face " + cls,
      style:
        "--face-x:" +
        ((i % 4) * 100) / 3 +
        "%;--face-y:" +
        Math.floor(i / 4) * 50 +
        "%",
      "aria-hidden": "true",
    });
  }
  function announce(message) {
    document.getElementById("heist-announcer").textContent = message;
  }
  function closeDialog() {
    clearInterval(jobTimer);
    clearInterval(holdTimer);
    jobTimer = holdTimer = null;
    if (dialog) {
      dialog.close();
      dialog.remove();
      dialog = null;
    }
    dialogKey = "";
    museum?.focus?.(null);
  }
  function modal(title, ...children) {
    pendingMove = null;
    if (museum) {
      museum.keys.clear();
      museum.wasMoving = false;
    }
    closeDialog();
    if (title && state?.me?.challenge) museum?.focus?.(taskSpot());
    const d = el(
      "dialog",
      { class: "heist-dialog", "aria-label": title },
      el(
        "div",
        { class: "dialog-head" },
        el("h2", {}, title),
        button("×", () => d.close(), "", false, { "aria-label": "Close" }),
      ),
      ...children,
    );
    d.addEventListener("close", () => {
      clearInterval(jobTimer);
      clearInterval(holdTimer);
      jobTimer = holdTimer = null;
      if (dialog === d) {
        dialog = null;
        dialogKey = "";
      }
      d.remove();
    });
    document.body.append(d);
    dialog = d;
    d.showModal();
    return d;
  }
  async function request(action, extra = {}, owner = seat) {
    const payload = {
      action,
      ...owner,
      ...extra,
      requestId: crypto.randomUUID(),
      match: state?.match || 0,
      step: state?.step || 0,
    };
    payload.requestId =
      window.RoomIntent?.id("grand-heist", payload, payload.requestId) ||
      payload.requestId;
    for (let attempt = 0; ; attempt++) {
      const ctl = new AbortController(),
        timeout = setTimeout(() => ctl.abort(), 8000);
      try {
        const res = await fetch("/api/grand-heist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: ctl.signal,
        });
        const j = await res.json();
        if (!res.ok)
          throw Object.assign(Error(j.error || "Please try again."), {
            status: res.status,
          });
        window.RoomIntent?.done("grand-heist", action);
        return j;
      } catch (e) {
        if (
          attempt ||
          ["join", "create", "leave"].includes(action) ||
          (e.status && e.status !== 503)
        )
          throw e;
      } finally {
        clearTimeout(timeout);
      }
    }
  }
  function adopt(j) {
    if (
      !j?.meId ||
      (state && j.code === state.code && j.version < state.version)
    )
      return;
    const prev = state;
    offset = j.now - Date.now();
    state = j;
    j.players.forEach((p) => window.GameI18n?.protectName(p.name));
    try {
      localStorage.setItem("arcade-last-game", "grand-heist");
    } catch {}
    const key = j.code + ":" + j.match + ":" + j.phase;
    if (scene !== key) {
      scene = key;
      votePick = undefined;
      closeDialog();
      render();
      announce(
        {
          briefing: "Read your private role.",
          live: "The museum is open. Move around and do your jobs.",
          discussion: "Meeting called. Share what you saw.",
          voting: "Voting is open.",
          verdict: "The votes are revealed.",
          finished: "The game is over.",
        }[j.phase] || "Room ready.",
      );
      if (prev && prev.phase !== j.phase)
        sound(["verdict", "finished"].includes(j.phase) ? "win" : "turn");
      if (j.phase === "briefing") showRole();
    } else if (
      prev &&
      (prev.me.alive !== j.me.alive ||
        (["lobby", "finished"].includes(j.phase) && prev.version !== j.version))
    )
      render();
    else sync();
    showError();
    if (j.phase === "live" && j.me.challenge && !dialog)
      showPuzzle(j.me.challenge);
    if (
      dialogKey.startsWith("job:") &&
      (!j.me.challenge || j.me.challenge.id !== dialogKey.slice(4))
    )
      closeDialog();
    if (prev?.me.alive && !j.me.alive && j.phase === "live") {
      closeDialog();
      sound("lose");
      announce("You were knocked out. You can still help finish jobs.");
    }
  }
  async function poll() {
    if (!seat) return;
    const owner = seat,
      ctl = new AbortController(),
      timeout = setTimeout(() => ctl.abort(), 7000);
    try {
      const res = await fetch(
        "/api/grand-heist?code=" + seat.code + "&pid=" + seat.pid,
        { headers: { "x-tok": seat.tok }, signal: ctl.signal },
      );
      const j = await res.json();
      if (seat !== owner) return;
      if (!res.ok) {
        if ([401, 404, 410].includes(res.status)) {
          seat = null;
          state = null;
          store(KEY, null);
          scene = "";
          render();
        }
        throw Error(j.error || "Unable to load the room.");
      }
      error = "";
      adopt(j);
    } catch (e) {
      error =
        e.name === "AbortError"
          ? "Connection is slow. Your place is saved."
          : e.message;
      showError();
    } finally {
      clearTimeout(timeout);
      clearTimeout(timer);
      if (seat)
        timer = setTimeout(
          poll,
          document.hidden ? 5000 : state?.phase === "live" ? 350 : 1000,
        );
    }
  }
  async function enter(action) {
    if (busy) return;
    busy = true;
    render();
    try {
      const j = await request(
        action,
        {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          recoveryCode: recovery.trim(),
        },
        null,
      );
      seat = { code: j.code, pid: j.meId, tok: j.tok };
      store(KEY, seat);
      store("gh-name", name.trim());
      state = null;
      scene = "";
      adopt(j);
      poll();
    } catch (e) {
      error =
        e.name === "AbortError"
          ? "No reply. Try joining again; your place will be kept."
          : e.message;
    } finally {
      busy = false;
      render();
    }
  }
  async function send(action, extra = {}) {
    if (busy || !seat) return false;
    busy = true;
    try {
      const j = await request(action, extra);
      if (action === "leave") {
        seat = null;
        state = null;
        scene = "";
        clearTimeout(timer);
        store(KEY, null);
        closeDialog();
        render();
        return true;
      }
      error = "";
      adopt(j);
      return true;
    } catch (e) {
      error =
        e.name === "AbortError"
          ? "Connection lost. Your action will be checked."
          : e.message;
      showError();
      return false;
    } finally {
      busy = false;
      if (state && ["lobby", "finished"].includes(state.phase)) render();
    }
  }
  async function move(p) {
    if (!state || state.phase !== "live") return;
    if (busy || Date.now() - lastMove < 150) {
      pendingMove = p;
      return;
    }
    lastMove = Date.now();
    pendingMove = null;
    await send("move", { x: Math.round(p.x), y: Math.round(p.y) });
    if (pendingMove) {
      const next = pendingMove;
      pendingMove = null;
      move(next);
    }
  }
  function showError() {
    let n = document.getElementById("heist-error");
    if (!error) {
      n?.remove();
      return;
    }
    if (!n) {
      n = el("div", { id: "heist-error", class: "heist-error", role: "alert" });
      root.prepend(n);
    }
    n.replaceChildren(
      txt("span", "", error),
      button(
        "×",
        () => {
          error = "";
          n.remove();
        },
        "",
        false,
        { "aria-label": "Dismiss error" },
      ),
    );
  }
  function help() {
    modal(
      "How To Play",
      txt("p", "eyebrow", "THE GRAND CON · MUSEUM HEIST"),
      el(
        "ol",
        { class: "help-steps" },
        ...[
          [
            "Move",
            "Tap the floor to walk. Use arrow keys or WASD on a keyboard. Map and Your Jobs can guide you to another room.",
          ],
          [
            "Work",
            "Staff secure the museum through quick puzzles, deliveries and two-person statue jobs. Thieves can pretend to do the same jobs.",
          ],
          [
            "Watch",
            "You only see nearby people. Doors, walls and darkness block your view. A treasure bag could be a normal job or a theft.",
          ],
          [
            "Report",
            "Report a knocked-out player or use your one emergency meeting at the Lobby. Tell everyone what you saw.",
          ],
          [
            "Vote",
            "Vote for a suspect or Skip. A tie removes nobody. Only Staff or Thief is revealed when someone leaves.",
          ],
          [
            "Win",
            "Staff win by finishing every job or catching every thief. Thieves win when they equal or outnumber living Staff.",
          ],
          [
            "Stay Involved",
            "Knocked-out Staff can still finish jobs. Their chat is kept separate from living players.",
          ],
        ].map(([title, line]) => el("li", {}, el("b", {}, title + ". "), line)),
      ),
      txt(
        "p",
        "muted small",
        "Your appearance is independent of your secret role. Staff progress only updates publicly at meetings.",
      ),
    );
  }
  function header() {
    head.replaceChildren(
      Platform.headerNav({
        page: "/grand-heist.html",
        title: "The Grand Con",
        art: TableKit.icon("crown"),
      }),
      el(
        "div",
        { class: "header-controls" },
        el(
          "div",
          { class: "header-left" },
          button(AvatarArt.tool("guide"), help, "heist-help", false, {
            "aria-label": "How to play",
            title: "How to play",
          }),
          Platform.settingsButton(),
        ),
        el(
          "div",
          { class: "header-tools" },
          GameAudio.soundMenu(),
          GameI18n.menu(),
          Platform.shopButton(),
        ),
      ),
    );
  }
  function landing() {
    return el(
      "div",
      {},
      el(
        "section",
        { class: "heist-hero" },
        el(
          "div",
          {},
          txt("span", "eyebrow", "LIVE MUSEUM HEIST · PLAYTEST"),
          el(
            "h1",
            {},
            "Good company.",
            el("br"),
            el("em", {}, "Bad intentions."),
          ),
          el(
            "p",
            {},
            "Secure a museum full of treasures. Watch your friends. Some of them are here to steal everything.",
          ),
          el(
            "div",
            { class: "heist-facts" },
            ...["5–12 players", "Live movement", "Secret thieves"].map((t) =>
              txt("span", "", t),
            ),
          ),
        ),
        el(
          "div",
          { class: "hero-art" },
          el("img", {
            src: "/heist/cover.webp",
            alt: "A moonlit museum gala with glamorous guests and a guarded crown",
            width: 1200,
            height: 800,
          }),
          el(
            "div",
            { class: "hero-stamp" },
            txt("span", "eyebrow", "THE MUSEUM CLOSES. THE GAME BEGINS."),
            el("b", {}, "Do your jobs. Watch your back."),
          ),
        ),
      ),
      el(
        "div",
        { class: "entrance-grid" },
        el(
          "section",
          { class: "heist-panel" },
          txt("span", "eyebrow", "YOUR INVITATION"),
          el("h2", {}, "Enter After Hours"),
          el("label", { htmlFor: "gh-name" }, "Your Name"),
          el("input", {
            id: "gh-name",
            value: name,
            maxLength: 12,
            autocomplete: "nickname",
            oninput: (e) => (name = e.target.value),
          }),
          button("Create A Room", () => enter("create"), "ticket", busy),
          el("label", { htmlFor: "gh-code" }, "Room Code"),
          el(
            "div",
            { class: "join-row" },
            el("input", {
              id: "gh-code",
              maxLength: 4,
              value: code,
              placeholder: "ABCD",
              oninput: (e) => (code = e.target.value),
            }),
            button("Join Room", () => enter("join"), "", busy),
          ),
          el(
            "details",
            { "data-guest-only": "landing" },
            el("summary", {}, "Rejoin On Another Phone"),
            el("label", { htmlFor: "gh-recovery" }, "Rejoin Code"),
            el("input", {
              id: "gh-recovery",
              value: recovery,
              autocomplete: "off",
              oninput: (e) => (recovery = e.target.value),
            }),
          ),
        ),
        el(
          "section",
          { class: "heist-panel" },
          txt("span", "eyebrow", "ONE SIMPLE PLAN"),
          el("h2", {}, "Keep The Museum Safe"),
          el(
            "ol",
            { class: "how-list" },
            ...[
              "Explore the museum and finish quick mini-games.",
              "Thieves blend in, steal exhibits and knock out Staff.",
              "Find someone down? Report it and discuss what happened.",
              "Vote out the thieves, or finish securing the museum.",
            ].map((t, i) =>
              el("li", {}, el("b", {}, i + 1), el("span", {}, t)),
            ),
          ),
          button("See How To Play", help, "", false, {
            "aria-label": "Read the game rules",
          }),
        ),
      ),
      el(
        "a",
        { href: "/grand-con.html", class: "classic-link" },
        "Looking for the clue game? Grand Con: Gallery is still available under Review.",
      ),
    );
  }
  function roster() {
    return el(
      "div",
      { class: "heist-roster" },
      ...state.players.map((p) =>
        el(
          "div",
          {
            class:
              "heist-seat" +
              (!p.alive && state.phase !== "lobby" ? " out" : ""),
          },
          face(p.id),
          el(
            "div",
            {},
            el("b", {}, p.name),
            el(
              "small",
              {},
              p.id === state.hostId
                ? "HOST"
                : p.bot
                  ? "BOT"
                  : p.departed
                    ? "AWAY"
                    : "READY",
            ),
          ),
        ),
      ),
    );
  }
  function settings() {
    const host = state.hostId === state.meId;
    return el(
      "div",
      { class: "lobby-options" },
      el(
        "label",
        {},
        "Discussion",
        el(
          "select",
          {
            value: state.settings.discussionSeconds,
            disabled: !host,
            onchange: (e) =>
              send("settings", { discussionSeconds: Number(e.target.value) }),
          },
          ...[45, 60, 90].map((n) =>
            el(
              "option",
              { value: n, selected: state.settings.discussionSeconds === n },
              n + " sec",
            ),
          ),
        ),
      ),
      el(
        "label",
        {},
        el("input", {
          type: "checkbox",
          checked: state.settings.specials !== false,
          disabled: !host,
          onchange: (e) => send("settings", { specials: e.target.checked }),
        }),
        "Medic & Camera Operator",
      ),
    );
  }
  function leave() {
    modal(
      "Leave The Museum?",
      txt(
        "p",
        "muted",
        "Your character will continue automatically if a game is running. Keep your rejoin code to return.",
      ),
      el(
        "div",
        { class: "dialog-actions" },
        button("Stay", closeDialog),
        button("Leave", () => send("leave"), "danger-action"),
      ),
    );
  }
  function recoveryDialog() {
    modal(
      "Your Rejoin Code",
      txt(
        "p",
        "muted",
        "Keep this private. Use your same name and this code to return on another phone.",
      ),
      el("input", {
        readOnly: true,
        value: state.recoveryCode,
        "aria-label": "Rejoin Code",
        onclick: (e) => e.target.select(),
      }),
    );
  }
  function lobby() {
    const host = state.hostId === state.meId,
      n = state.players.filter((p) => !p.departed).length,
      bad = n <= 6 ? 1 : 2;
    return el(
      "div",
      {},
      el(
        "div",
        { class: "heist-lobby-copy" },
        txt("span", "eyebrow", "AFTER HOURS · PRIVATE MUSEUM"),
        el("h1", {}, "Everyone Has A Cover Story."),
        txt(
          "p",
          "muted",
          "Public faces. Private teams. Stay close enough to see what really happens.",
        ),
      ),
      Platform.roomBar({
        code: state.code,
        page: "/grand-heist.html",
        phase: state.phase,
        count: n + " of 12 guests have arrived",
        onRecovery: recoveryDialog,
        onLeave: leave,
        body: [
          el(
            "div",
            { class: "team-explain" },
            el(
              "div",
              {},
              txt("span", "eyebrow", "KEEP IT SAFE"),
              el("b", {}, Math.max(0, n - bad) + " Staff"),
              el("p", {}, "Secure the museum or catch every thief."),
            ),
            el(
              "div",
              {},
              txt("span", "eyebrow", "GET AWAY WITH IT"),
              el("b", {}, bad + (bad === 1 ? " Thief" : " Thieves")),
              el("p", {}, "Blend in. Sabotage. Knock out Staff."),
            ),
          ),
          roster(),
          settings(),
          Platform.botControls({
            state,
            max: 12,
            onSend: (action) => send(action),
            hint: "Bots walk, do jobs and report what they see. Thieves try to blend in.",
          }),
          host
            ? button(
                "Start The Heist",
                () => send("start"),
                "ticket lobby-start",
                n < 5 || busy,
              )
            : txt("p", "muted", "Waiting for the host to start."),
          n < 5
            ? txt(
                "p",
                "muted small",
                "Invite " + (5 - n) + " more players, or add bots.",
              )
            : null,
        ],
      }),
    );
  }
  function miniRoom() {
    return el(
      "div",
      { class: "room-mini" },
      el("span", {}, "ROOM ", el("b", {}, state.code)),
      button("Copy Link", async () => {
        try {
          await navigator.clipboard.writeText(
            location.origin + "/grand-heist.html?room=" + state.code,
          );
          Platform.toast("Invite link copied.");
        } catch {
          modal(
            "Invite Link",
            el("input", {
              readOnly: true,
              value: location.origin + "/grand-heist.html?room=" + state.code,
            }),
          );
        }
      }),
      button("Leave", leave),
    );
  }
  function roleToggle() {
    return el(
      "div",
      { class: "role-summary" },
      button(
        [
          face(state.meId),
          el(
            "span",
            {},
            el("small", {}, "KEEP THIS PRIVATE"),
            el("b", {}, "Your Secret Card"),
          ),
          txt("span", "", "⌃"),
        ],
        showRole,
        "private-toggle",
        false,
        { "aria-label": "Show Role" },
      ),
    );
  }
  function showRole() {
    if (!state?.me.role) return;
    const role = roles[state.me.role],
      d = modal(
        "Your Secret Card",
        face(state.meId, "role-face"),
        el(
          "b",
          { class: "role-team" + (state.me.team === "thief" ? " thief" : "") },
          role[0],
        ),
        txt("p", "role-detail", role[1]),
      );
    if (state.me.team === "thief") {
      d.append(
        txt("span", "eyebrow", "YOUR TEAMMATES"),
        el(
          "div",
          { class: "ally-list" },
          ...state.me.allies
            .filter((id) => id !== state.meId)
            .map((id) => el("div", {}, face(id), el("small", {}, who(id)))),
        ),
      );
      if (state.me.allies.length === 1)
        d.append(txt("p", "muted small", "You are the only thief."));
      d.append(
        txt(
          "p",
          "muted small",
          "Your normal jobs are a cover. Shared statue jobs genuinely help Staff. A carried exhibit could be a job or a theft.",
        ),
      );
    } else
      d.append(
        txt(
          "p",
          "muted small",
          "Your jobs remain available after you are knocked out. You can only speak to other out players then.",
        ),
      );
    if (Platform.needsRecovery())
      d.append(button("Save Rejoin Code", recoveryDialog, "role-mini"));
    d.append(
      el(
        "div",
        { class: "dialog-actions" },
        button("Keep It Secret", closeDialog, "ticket"),
      ),
    );
  }
  function showMap() {
    const d = modal(
      "Museum Map",
      txt(
        "p",
        "muted small",
        "Choose a room to walk there. You still have to travel through its corridors.",
      ),
      el(
        "div",
        { class: "room-choices" },
        ...W.ROOMS.map((r) =>
          button(
            r.name,
            () => {
              closeDialog();
              move({ x: r.x + 120, y: r.y + 135 });
            },
            "",
            false,
            { style: "--room-color:" + r.color },
          ),
        ),
      ),
    );
  }
  function showJobs() {
    const d = modal(
      "Your Jobs",
      txt(
        "p",
        "muted small",
        state.me.team === "thief"
          ? "Use these jobs as a cover. They will not secure the museum."
          : "Choose a job to walk toward it. Shared jobs and recoveries also help secure the museum.",
      ),
    );
    d.append(
      el(
        "div",
        { class: "heist-job-tray" },
        ...[...state.me.jobs, ...state.joints, ...state.recovery].map((j) =>
          button(
            [
              el("small", {}, W.ROOMS.find((r) => r.id === j.room)?.name || ""),
              el("b", {}, j.name),
              txt("small", "", j.done ? "Complete" : "Go To Job"),
            ],
            () => {
              closeDialog();
              move(j);
            },
            "job-tile" + (j.done ? " done" : ""),
            j.done,
          ),
        ),
      ),
    );
  }
  function taskSpot() {
    const c = state?.me?.challenge,
      spot = [...state.me.jobs, ...state.recovery, ...state.joints].find((j) => j.id === c?.id || j.id === c?.jobId);
    return spot || currentPos();
  }
  function currentPos() {
    return state
      ? W.position(
          {
            path: state.me.path,
            walkAt: state.me.walkAt,
            pos: state.me.position,
          },
          now(),
        )
      : { x: 160, y: 150 };
  }
  function closeEnough(p, d = 47) {
    return (
      W.distance(currentPos(), p) <= d &&
      W.line(
        currentPos(),
        p,
        state.sabotage?.kind === "door" ? [state.sabotage.door] : [],
      )
    );
  }
  function actionChoices() {
    if (!state || state.phase !== "live") return [];
    const me = state.me,
      choices = [];
    const body = state.bodies.find(
      (b) => closeEnough(b, 55) && b.playerId !== state.meId,
    );
    if (me.alive && body) {
      choices.push({
        label: "Report " + who(body.playerId),
        kind: "report-action",
        run: () => send("report", { bodyId: body.id }),
      });
      if (me.role === "medic" && !me.usedMedic && now() - body.at < 20000)
        choices.push({
          label: "Rescue " + who(body.playerId),
          kind: "primary-action",
          run: () => send("revive", { bodyId: body.id }),
        });
    }
    if (me.bag) {
      const dest = W.TRANSPORT.find((s) => s.id === me.bag.dest);
      if (closeEnough(dest))
        choices.push({
          label: "Deliver Exhibit",
          kind: "primary-action",
          run: () => send("deliver"),
        });
    }
    if (!me.bag) {
      const job = me.jobs.find((j) => !j.done && closeEnough(j));
      if (job)
        choices.push({
          label: job.kind === "carry" ? "Pick Up Exhibit" : job.name,
          kind: "primary-action",
          run: async () => {
            if (job.kind === "carry") await send("pickup", { jobId: job.id });
            else await openTask({ jobId: job.id });
          },
        });
    }
    const joint = state.joints.find((j) => !j.done && closeEnough(j));
    if (joint && (me.alive || me.team === "staff"))
      choices.push({
        label: "Move Statue Together",
        kind: "primary-action",
        run: () => showJoint(joint),
      });
    const recoveryJob = state.recovery.find((j) => !j.done && closeEnough(j));
    if (recoveryJob)
      choices.push({
        label: "Reset Stolen Display",
        kind: "primary-action",
        run: () => openTask({ jobId: recoveryJob.id }),
      });
    if (state.sabotage) {
      const s = state.sabotage,
        point =
          s.kind === "lights"
            ? W.STATIONS[3]
            : W.DOORS.find((d) => d.id === s.door),
        p = s.kind === "door" ? W.repairPoint(point, currentPos()) : point;
      if (closeEnough(p))
        choices.push({
          label: s.kind === "lights" ? "Restore Power" : "Open Door",
          kind: "primary-action",
          run: () => openTask({ repair: true }),
        });
    }
    if (me.alive && me.team === "thief") {
      const target = state.nearby.find(
        (p) => !me.allies.includes(p.id) && closeEnough(p, 39),
      );
      if (target && !me.bag)
        choices.push({
          label:
            "Knock Out " +
            who(target.id) +
            (now() < me.killAt
              ? " · " + Math.ceil((me.killAt - now()) / 1000) + "s"
              : ""),
          kind: "danger-action",
          disabled: now() < me.killAt,
          run: () => send("knockout", { targetId: target.id }),
        });
      const exhibit = W.TRANSPORT.find(
        (s) => ["gallery", "vault"].includes(s.room) && closeEnough(s),
      );
      if (exhibit && !me.bag)
        choices.push({
          label: "Steal Exhibit",
          kind: "danger-action",
          run: () => send("steal", { station: exhibit.id }),
        });
    }
    if (me.alive && me.role === "camera" && closeEnough(W.STATIONS[3]))
      choices.push({
        label: "Watch Camera",
        kind: "",
        disabled: now() < me.cameraAt,
        run: () => {
          modal(
            "Security Cameras",
            txt(
              "p",
              "muted small",
              "Six seconds of live footage. You stay at the console.",
            ),
            el(
              "div",
              { class: "room-choices" },
              ...W.ROOMS.filter((r) =>
                ["lobby", "gallery", "vault"].includes(r.id),
              ).map((r) =>
                button(r.name, async () => {
                  closeDialog();
                  await send("camera", { room: r.id });
                }),
              ),
            ),
          );
        },
      });
    if (me.alive && me.emergency > 0 && closeEnough({ x: 160, y: 150 }, 75))
      choices.push({
        label: "Emergency Meeting",
        kind: "",
        run: () => {
          modal(
            "Call A Meeting?",
            txt(
              "p",
              "muted",
              "You can use this once per game. Bring everyone together to discuss what you saw.",
            ),
            el(
              "div",
              { class: "dialog-actions" },
              button("Cancel", closeDialog),
              button(
                "Call Meeting",
                async () => {
                  closeDialog();
                  await send("emergency");
                },
                "report-action",
              ),
            ),
          );
        },
      });
    return choices;
  }
  async function primary() {
    const c = actionChoices().find((c) => !c.disabled);
    if (c) await c.run();
  }
  async function reportNearby() {
    const c = actionChoices().find((c) => c.kind === "report-action");
    if (c) await c.run();
  }
  function tools() {
    if (state.me.team !== "thief") return help();
    const cooling = now() < state.me.sabotageAt;
    modal(
      "Your Thief Tools",
      txt(
        "p",
        "muted small",
        cooling
          ? "Team sabotage ready in " +
              Math.ceil((state.me.sabotageAt - now()) / 1000) +
              " seconds."
          : "Your team shares a 35-second sabotage cooldown.",
      ),
      button(
        "Cut The Lights · 20s",
        async () => {
          closeDialog();
          await send("sabotage", { kind: "lights" });
        },
        "danger-action",
        cooling,
      ),
      txt("p", "eyebrow", "CLOSE A DOOR · 12 SECONDS"),
      el(
        "div",
        { class: "room-choices" },
        ...W.DOORS.map((d) =>
          button(
            d.name,
            async () => {
              closeDialog();
              await send("sabotage", { kind: "door", door: d.id });
            },
            "",
            cooling,
          ),
        ),
      ),
    );
  }
  function live() {
    return el(
      "div",
      {},
      miniRoom(),
      !state.me.alive
        ? txt(
            "p",
            "ghost-banner",
            "You are out. Staff can still finish jobs. Only out players can read your chat.",
          )
        : null,
      el(
        "div",
        { class: "museum-top" },
        el(
          "div",
          {},
          txt("span", "eyebrow", "AFTER HOURS"),
          el("h2", { id: "current-room" }, "Museum"),
        ),
        el(
          "div",
          { class: "museum-status" },
          el("span", { id: "museum-progress" }),
          el(
            "span",
            { class: "progress-track" },
            el("i", { id: "museum-progress-fill" }),
          ),
        ),
      ),
      el(
        "div",
        { class: "map-frame" },
        el("canvas", {
          class: "museum-map",
          id: "museum-map",
          tabIndex: 0,
          role: "application",
          "aria-label":
            "Museum. Tap a floor tile to walk. Arrow keys or WASD move; E uses a nearby job; R reports.",
        }),
        el(
          "div",
          { class: "map-chip" },
          el("i"),
          el("span", { id: "map-status" }, "Explore · Do Jobs · Stay Alert"),
        ),
        el(
          "div",
          { class: "map-hint" },
          el("span", {}, "TAP TO WALK · ARROWS / WASD"),
          el("span", {}, "E · USE     R · REPORT"),
        ),
      ),
      el("div", { class: "action-bar", id: "museum-actions" }),
      txt("p", "status-hint", ""),
      state.me.camera ? el("div", { id: "camera-feed" }) : null,
      roleToggle(),
    );
  }
  function showJoint(job) {
    const d = modal(
      "Move Statue Together",
      txt(
        "p",
        "muted",
        "Both players drag and hold a handle at the far end. Keep pulling together for six seconds.",
      ),
      el("div", { class: "joint-statue", "aria-hidden": "true" }, "♜"),
      el(
        "div",
        { class: "joint-progress" },
        el("i", { id: "joint-fill", style: "width:0%" }),
      ),
      txt(
        "p",
        "puzzle-meta",
        el("span", { id: "joint-helpers" }, "Waiting for another helper…"),
      ),
      el("label", { htmlFor: "joint-handle" }, "Your Handle"),
      el("input", {
        type: "range",
        id: "joint-handle",
        class: "joint-slider",
        min: 0,
        max: 100,
        value: 0,
        "aria-label": "Pull and hold your statue handle",
      }),
    );
    dialogKey = "joint:" + job.id;
    const slider = d.querySelector("input");
    let pull = 0;
    const release = () => {
      pull = 0;
      slider.value = 0;
    };
    slider.addEventListener("input", () => (pull = Number(slider.value) / 100));
    slider.addEventListener("pointerup", release);
    slider.addEventListener("pointercancel", release);
    slider.addEventListener("keyup", release);
    d.addEventListener("close", () => {
      pull = 0;
    });
    holdTimer = setInterval(async () => {
      if (dialog !== d) return;
      const current = state.joints.find((j) => j.id === job.id);
      if (current?.done) {
        closeDialog();
        sound("win");
        return;
      }
      const fill = d.querySelector("#joint-fill"),
        label = d.querySelector("#joint-helpers");
      fill.style.width = ((current?.progress || 0) / 6000) * 100 + "%";
      label.textContent =
        (current?.helpers || 0) >= 2
          ? "Pulling together…"
          : "Hold your handle. Waiting for a helper…";
      if (pull >= 0.8) await send("hold", { jobId: job.id, pull });
    }, 550);
  }
  async function openTask(extra) {
    if (await send("beginTask", extra)) showPuzzle(state.me.challenge);
  }
  function showPuzzle(c) {
    if (!c || dialogKey === "job:" + c.id) return;
    const d = modal(
      c.name,
      txt("p", "muted small", ""),
      el("div", { class: "puzzle-grid" }),
      el(
        "div",
        { class: "puzzle-meta" },
        el("span", { id: "job-note" }, "Complete the puzzle."),
        el("b", { id: "job-status" }, "In Progress"),
      ),
      el(
        "div",
        { class: "dialog-actions" },
        button("Leave Job", async () => {
          closeDialog();
          await send("cancelTask");
        }),
      ),
    );
    dialogKey = "job:" + c.id;
    const grid = d.querySelector(".puzzle-grid"),
      hint = d.querySelector(".muted"),
      note = d.querySelector("#job-note"),
      status = d.querySelector("#job-status");
    let proof = null,
      solved = false,
      sending = false;
    const save = () => {
      try {
        sessionStorage.setItem("heist-puzzle:" + c.id, JSON.stringify(proof));
      } catch {}
    };
    const restore = () => {
      try {
        return JSON.parse(
          sessionStorage.getItem("heist-puzzle:" + c.id) || "null",
        );
      } catch {
        return null;
      }
    };
    const submit = async () => {
      if (!solved || sending || dialog !== d) return;
      const left = c.minMs - (now() - c.startedAt);
      if (left > 0) {
        status.textContent = "Calibrating · " + Math.ceil(left / 1000) + "s";
        return;
      }
      sending = true;
      status.textContent = "Finishing…";
      if (await send("finishTask", { challengeId: c.id, proof })) {
        try {
          sessionStorage.removeItem("heist-puzzle:" + c.id);
        } catch {}
        closeDialog();
        sound("win");
      } else {
        sending = false;
        status.textContent = "Try Again";
      }
    };
    d.addEventListener("close", () => {
      if (state?.me.challenge?.id === c.id) send("cancelTask");
    });
    if (c.kind === "wires") {
      hint.textContent =
        "Tap a plug on the left, then its matching colour and shape on the right.";
      const colors = ["#ef98ab", "#87d7e6", "#efd283", "#99dfb2"],
        symbols = ["◆", "●", "▲", "■"];
      proof = restore() || [-1, -1, -1, -1];
      let selected = -1;
      grid.classList.add("wire-grid");
      const left = el("div", { class: "wire-column" }),
        right = el("div", { class: "wire-column" });
      grid.append(left, right);
      const wires = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      wires.classList.add("wire-lines");
      wires.setAttribute("aria-hidden", "true");
      grid.append(wires);
      function draw() {
        left.replaceChildren(
          ...c.puzzle.left.map((v, i) =>
            button(
              symbols[v],
              () => {
                selected = i;
                draw();
              },
              "wire-plug" +
                (selected === i ? " active" : "") +
                (proof[i] >= 0 ? " connected" : ""),
              false,
              {
                style: "--wire:" + colors[v],
                "aria-label":
                  "Left " + ["diamond", "circle", "triangle", "square"][v],
                "aria-pressed": String(selected === i),
              },
            ),
          ),
        );
        right.replaceChildren(
          ...c.puzzle.right.map((v, i) =>
            button(
              symbols[v],
              () => {
                if (selected < 0) return;
                if (c.puzzle.left[selected] !== v) {
                  note.textContent = "Those do not match. Try another plug.";
                  sound("bad");
                  return;
                }
                proof[selected] = i;
                selected = -1;
                solved = proof.every((n) => n >= 0);
                note.textContent = solved
                  ? "All four wires connected."
                  : "Wire connected.";
                save();
                draw();
                submit();
              },
              "wire-plug" + (proof.includes(i) ? " connected" : ""),
              false,
              {
                style: "--wire:" + colors[v],
                "aria-label":
                  "Right " + ["diamond", "circle", "triangle", "square"][v],
              },
            ),
          ),
        );
        wires.setAttribute(
          "viewBox",
          "0 0 " + grid.clientWidth + " " + grid.clientHeight,
        );
        wires.replaceChildren();
        proof.forEach((v, i) => {
          if (v < 0) return;
          const a = left.children[i],
            b = right.children[v],
            x1 = left.offsetLeft + left.offsetWidth,
            x2 = right.offsetLeft,
            y1 = a.offsetTop + a.offsetHeight / 2,
            y2 = b.offsetTop + b.offsetHeight / 2,
            path = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "path",
            );
          path.setAttribute(
            "d",
            `M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`,
          );
          path.setAttribute("stroke", colors[c.puzzle.left[i]]);
          path.setAttribute("stroke-width", "4");
          path.setAttribute("fill", "none");
          wires.append(path);
        });
      }
      draw();
      solved = proof.every((n) => n >= 0);
    } else if (c.kind === "circuit") {
      hint.textContent =
        "Rotate the six tiles to connect the green entrance to the exit. Use every tile.";
      proof = restore() || c.puzzle.rotations.slice();
      grid.classList.add("circuit-grid");
      function draw() {
        grid.replaceChildren(
          el("span", { class: "circuit-start" }),
          el("span", { class: "circuit-end" }),
          ...proof.map((r, i) => {
            const b = button(
              "",
              () => {
                proof[i] = (proof[i] + 1) % 4;
                solved = W.circuitValid(proof);
                save();
                draw();
                submit();
              },
              "",
              false,
              { "aria-label": "Rotate Tile " + (i + 1) },
            );
            b.innerHTML =
              '<svg viewBox="0 0 60 60" fill="none" stroke-width="9" stroke-linecap="round" style="transform:rotate(' +
              r * 90 +
              'deg)"><path d="' +
              ([2, 5].includes(i) ? "M30 2V30H58" : "M2 30H58") +
              '"/></svg>';
            return b;
          }),
        );
      }
      draw();
      solved = W.circuitValid(proof);
    } else if (c.kind === "scan") {
      hint.textContent =
        "Drag the scanner over all three marks. Arrow keys move it too.";
      proof = restore() || [];
      let p = { x: 0.5, y: 0.5 };
      const pad = el(
        "div",
        {
          class: "scan-pad",
          tabIndex: 0,
          "aria-label": "Treasure scanner. Drag, or use arrow keys.",
        },
        el("div", { class: "scan-object" }),
      );
      const spots = c.puzzle.spots.map((s, i) =>
        el(
          "span",
          {
            class: "scan-spot",
            style: "left:" + s.x * 100 + "%;top:" + s.y * 100 + "%",
          },
          i + 1,
        ),
      );
      const scanner = el("div", { class: "scanner" });
      pad.append(...spots, scanner);
      grid.append(pad);
      function scan() {
        scanner.style.left = p.x * 100 + "%";
        scanner.style.top = p.y * 100 + "%";
        if (proof.length >= 110)
          proof = proof
            .filter((p) => c.puzzle.spots.some((s) => W.distance(p, s) < 0.12))
            .slice(0, 6);
        if (
          proof.length < 120 &&
          (proof.length === 0 || W.distance(proof.at(-1), p) > 0.04)
        )
          proof.push({ ...p });
        spots.forEach((n, i) =>
          n.classList.toggle(
            "scanned",
            proof.some((p) => W.distance(p, c.puzzle.spots[i]) < 0.12),
          ),
        );
        solved = c.puzzle.spots.every((s) =>
          proof.some((p) => W.distance(p, s) < 0.12),
        );
        save();
        if (solved) {
          note.textContent = "All three marks scanned.";
          submit();
        }
      }
      let down = false;
      const update = (e) => {
        const r = pad.getBoundingClientRect();
        p = {
          x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
          y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
        };
        scan();
      };
      pad.addEventListener("pointerdown", (e) => {
        down = true;
        pad.setPointerCapture(e.pointerId);
        update(e);
      });
      pad.addEventListener("pointermove", (e) => {
        if (down) update(e);
      });
      pad.addEventListener("pointerup", () => (down = false));
      pad.addEventListener("pointercancel", () => (down = false));
      pad.addEventListener("keydown", (e) => {
        const delta = {
          ArrowUp: [0, -0.05],
          ArrowDown: [0, 0.05],
          ArrowLeft: [-0.05, 0],
          ArrowRight: [0.05, 0],
        }[e.key];
        if (delta) {
          e.preventDefault();
          p = {
            x: Math.max(0, Math.min(1, p.x + delta[0])),
            y: Math.max(0, Math.min(1, p.y + delta[1])),
          };
          scan();
        }
      });
      scan();
    } else {
      hint.textContent = "Watch the four flashes, then repeat the same order.";
      proof = [];
      const colors = ["#e799b0", "#8edec4", "#f1d184", "#9cbceb"],
        symbols = ["◆", "●", "▲", "■"];
      const display = el("div", { class: "memory-count" }, "WATCH");
      const keys = el("div", { class: "memory-grid" });
      grid.append(display, keys);
      let watching = true;
      keys.append(
        ...symbols.map((s, i) =>
          button(
            s,
            () => {
              if (watching || solved) return;
              proof.push(i);
              if (
                proof[proof.length - 1] !== c.puzzle.sequence[proof.length - 1]
              ) {
                proof = [];
                display.textContent = "TRY AGAIN";
                solved = false;
                sound("bad");
                return;
              }
              display.textContent =
                "●".repeat(proof.length) + "○".repeat(4 - proof.length);
              solved = proof.length === 4;
              save();
              submit();
            },
            "memory-key",
            true,
            {
              style: "--memory:" + colors[i],
              "aria-label": ["Diamond", "Circle", "Triangle", "Square"][i],
            },
          ),
        ),
      );
      let flash;
      function replay() {
        clearInterval(flash);
        proof = [];
        solved = false;
        watching = true;
        display.textContent = "WATCH";
        keys.querySelectorAll("button").forEach((n) => (n.disabled = true));
        const start = performance.now();
        flash = setInterval(() => {
          if (dialog !== d) {
            clearInterval(flash);
            return;
          }
          const t = performance.now() - start,
            idx = Math.floor(t / 650);
          keys
            .querySelectorAll("button")
            .forEach((n, i) =>
              n.classList.toggle(
                "flash",
                idx < 4 && t % 650 < 420 && c.puzzle.sequence[idx] === i,
              ),
            );
          if (idx >= 4) {
            watching = false;
            keys
              .querySelectorAll("button")
              .forEach((n) => (n.disabled = false));
            display.textContent = "○○○○";
            clearInterval(flash);
          }
        }, 80);
      }
      grid.append(button("Watch Again", replay));
      replay();
      d.addEventListener("close", () => clearInterval(flash));
    }
    jobTimer = setInterval(submit, 300);
  }
  function meetingPeople(voting = false) {
    return el(
      "div",
      { class: voting ? "vote-options" : "meeting-people" },
      ...state.players.map((p) =>
        voting
          ? button(
              [face(p.id), el("span", {}, p.name)],
              () => {
                votePick = p.id;
                renderVote();
              },
              "vote-person" + (votePick === p.id ? " selected" : ""),
              !p.alive || !!state.me.vote,
              {
                "aria-label": "Vote " + p.name,
                "aria-pressed": String(votePick === p.id),
              },
            )
          : el(
              "div",
              {
                class:
                  "meeting-person" +
                  (!p.alive ? " out" : "") +
                  (p.id === state.meId ? " mine" : "") +
                  (p.voteLocked ? " voted" : ""),
              },
              face(p.id),
              el("b", {}, p.name),
              el(
                "small",
                {},
                p.alive
                  ? p.voteLocked
                    ? "Vote Sealed"
                    : "In The Museum"
                  : "Out",
              ),
            ),
      ),
    );
  }
  function draftKey() {
    return [
      "gh-draft",
      state.code,
      state.match,
      state.meeting,
      state.me.alive ? "live" : "ghost",
    ].join(":");
  }
  function messages() {
    const list = state.me.alive ? state.chat : state.ghostChat;
    return el(
      "div",
      { class: "meeting-chat", "data-heist-chat": "" },
      ...(list || []).map((m) =>
        el(
          "div",
          { class: "chat-message" },
          face(m.id),
          el(
            "div",
            {},
            el("b", {}, who(m.id)),
            el("p", { "data-no-tr": "" }, m.text),
          ),
        ),
      ),
    );
  }
  function chatBox() {
    const input = el("input", {
      value: read(draftKey()) || "",
      maxLength: 280,
      placeholder: state.me.alive
        ? "What did you see?"
        : "Only out players can read this.",
      "aria-label": state.me.alive ? "Meeting Message" : "Ghost Message",
      oninput: (e) => store(draftKey(), e.target.value),
    });
    const form = el(
      "form",
      {
        class: "chat-compose",
        onsubmit: async (e) => {
          e.preventDefault();
          const text = input.value;
          if (await send("chat", { text })) {
            store(draftKey(), null);
            input.value = "";
          }
        },
      },
      input,
      el("button", { type: "submit" }, "Send"),
    );
    return el(
      "div",
      { class: "heist-panel" },
      el("h3", {}, state.me.alive ? "Tell Your Story" : "Out Players Only"),
      messages(),
      form,
    );
  }
  function meeting() {
    const reporter = state.report?.by,
      body = state.report?.playerId;
    return el(
      "div",
      { class: "heist-meeting" },
      miniRoom(),
      el(
        "div",
        { class: "meeting-hero" },
        face(body || reporter),
        el(
          "div",
          {},
          txt("span", "eyebrow", "MEETING " + state.meeting),
          el(
            "h1",
            {},
            state.phase === "voting"
              ? "Who Do You Suspect?"
              : body
                ? "Someone Was Found."
                : "Emergency Meeting",
          ),
          txt(
            "p",
            "muted small",
            body
              ? who(reporter) +
                  " found " +
                  who(body) +
                  " in the " +
                  (W.ROOMS.find((r) => r.id === state.report.room)?.name ||
                    "museum") +
                  "."
              : who(reporter) + " called everyone together.",
          ),
        ),
        el("span", { class: "meeting-clock", "data-timer": "" }),
      ),
      el(
        "div",
        { class: "meeting-progress" },
        el(
          "span",
          {},
          "Museum secured · " +
            state.progress.done +
            " / " +
            state.progress.total +
            " jobs",
        ),
        el("span", {}, "Progress updates at meetings."),
      ),
      el(
        "div",
        { class: "meeting-grid" },
        el(
          "div",
          {},
          state.phase === "voting" && state.me.alive
            ? el("section", { class: "heist-panel", id: "vote-panel" })
            : meetingPeople(),
        ),
        state.phase === "discussion" || !state.me.alive
          ? chatBox()
          : el(
              "section",
              { class: "heist-panel" },
              el("h3", {}, "Keep Your Vote Private"),
              txt(
                "p",
                "muted",
                "Votes stay sealed until everyone votes or time runs out. Skip counts as a vote. A tie removes nobody.",
              ),
              meetingPeople(),
            ),
      ),
      state.phase === "discussion" && state.hostId === state.meId
        ? button(
            "Start Voting",
            () => send("advance"),
            "ticket lobby-start",
            now() < state.meetingStartedAt + 10000,
            { "data-advance": "" },
          )
        : null,
      roleToggle(),
    );
  }
  function renderVote() {
    const key = JSON.stringify([
      state.me.vote,
      votePick,
      state.players.map((p) => [p.id, p.alive, p.voteLocked]),
    ]);
    if (key === voteKey) return;
    voteKey = key;
    const n = document.getElementById("vote-panel");
    if (!n) return;
    if (state.me.vote) {
      n.replaceChildren(
        el("h3", {}, "Your Vote Is Sealed"),
        txt(
          "p",
          "muted",
          "You chose " +
            who(state.me.vote.targetId) +
            ". Waiting for the others.",
        ),
        meetingPeople(),
      );
      return;
    }
    n.replaceChildren(
      el("h3", {}, "Choose A Player Or Skip"),
      meetingPeople(true),
      button(
        "Skip",
        () => {
          votePick = null;
          renderVote();
        },
        votePick === null ? "selected" : "",
        false,
        {
          "aria-pressed": String(votePick === null),
          "aria-label": "Vote Skip",
        },
      ),
      button(
        votePick === undefined
          ? "Choose Your Vote"
          : "Seal Vote · " + who(votePick),
        () => send("vote", { targetId: votePick }),
        "ticket vote-confirm",
        votePick === undefined,
      ),
    );
  }
  function ledger(v) {
    const groups = new Map();
    for (const b of v.ballots || []) {
      const list = groups.get(b.target) || [];
      list.push(b.id);
      groups.set(b.target, list);
    }
    return el(
      "div",
      { class: "vote-ledger" },
      ...[...groups].map(([target, ids]) =>
        el(
          "div",
          { class: "ledger-group" },
          el("b", {}, target ? who(target) : "Skip"),
          ...ids.map((id) => el("div", {}, face(id), el("span", {}, who(id)))),
        ),
      ),
    );
  }
  function verdict() {
    const v = state.verdict;
    return el(
      "div",
      { class: "heist-meeting" },
      miniRoom(),
      txt("span", "eyebrow", "THE MUSEUM HAS SPOKEN"),
      el(
        "div",
        { class: "verdict-stage" },
        v.out
          ? el(
              "div",
              { class: "ejected-person" },
              face(v.out),
              el("h2", {}, who(v.out) + " Was Escorted Out"),
              txt(
                "span",
                "alignment-label" + (v.alignment === "thief" ? " thief" : ""),
                v.alignment === "thief" ? "THIEF" : "STAFF",
              ),
            )
          : el(
              "div",
              {},
              el("h2", {}, "Nobody Was Escorted Out"),
              txt(
                "p",
                "muted",
                v.reason === "tie"
                  ? "The vote was tied."
                  : "The museum chose to skip.",
              ),
            ),
        el("span", { "data-timer": "", class: "muted small" }),
      ),
      ledger(v),
      roleToggle(),
    );
  }
  function finished() {
    const winners = state.roles.filter((p) => p.team === state.winner);
    const lineup = el(
      "div",
      { class: "winner-line" },
      ...winners.map((p) =>
        el(
          "div",
          { class: "winner-person" },
          face(p.id),
          el("b", {}, who(p.id)),
          el("small", {}, roles[p.role]?.[0] || p.role),
        ),
      ),
    );
    const reveal = el(
      "details",
      {},
      el("summary", {}, "Everyone’s Roles"),
      el(
        "div",
        { class: "heist-roster" },
        ...state.roles.map((p) =>
          el(
            "div",
            { class: "heist-seat" },
            face(p.id),
            el(
              "div",
              {},
              el("b", {}, who(p.id)),
              el("small", {}, roles[p.role]?.[0]),
            ),
          ),
        ),
      ),
    );
    const history = el(
      "details",
      {},
      el("summary", {}, "The Story Of The Heist"),
      ...state.history.map((v) =>
        el(
          "section",
          { class: "heist-panel" },
          el(
            "h3",
            {},
            "Meeting " +
              v.meeting +
              " · " +
              (v.out ? who(v.out) + " left" : "Nobody left"),
          ),
          ledger(v),
        ),
      ),
    );
    return el(
      "section",
      { class: "finale" },
      miniRoom(),
      el("img", {
        class: "trophy",
        src: "/grand-con/trophy.webp",
        alt: "Gold museum trophy",
        width: 160,
        height: 160,
      }),
      txt("span", "eyebrow", "AFTER HOURS · THE FINALE"),
      el(
        "h1",
        {},
        state.winner === "staff"
          ? "The Museum Is Safe."
          : "The Thieves Got Away.",
      ),
      txt("p", "muted", state.winReason),
      lineup,
      state.hostId === state.meId
        ? button(
            "Another Heist",
            () => send("start"),
            "ticket",
            state.players.filter((p) => !p.departed).length < 5,
          )
        : txt("p", "muted", "Waiting for the host to start another heist."),
      Platform.botControls({
        state,
        max: 12,
        onSend: (action) => send(action),
      }),
      reveal,
      history,
    );
  }
  function render() {
    actionsKey = "";
    messagesKey = "";
    voteKey = "";
    museum?.destroy();
    museum = null;
    document.body.classList.toggle("heist-live", state?.phase === "live");
    header();
    if (!seat) Platform.clearRoom();
    root.replaceChildren(
      !seat
        ? landing()
        : !state
          ? el(
              "section",
              { class: "loading-panel" },
              el("h2", {}, "Opening The Museum…"),
              button("Try Again", poll),
            )
          : state.phase === "lobby"
            ? lobby()
            : state.phase === "finished"
              ? finished()
              : state.phase === "discussion" || state.phase === "voting"
                ? meeting()
                : state.phase === "verdict"
                  ? verdict()
                  : live(),
    );
    if (state?.phase === "live" || state?.phase === "briefing") {
      museum = new (MuseumMap3D.supported() ? MuseumMap3D : MuseumMap)(document.getElementById("museum-map"), {
        state: () => state,
        now,
        move,
        action: primary,
        report: reportNearby,
      });
      if (state.phase === "briefing") {
        const overlay = el(
          "div",
          { class: "map-curtain" },
          el(
            "div",
            {},
            face(state.meId),
            txt("span", "eyebrow", "YOUR COVER STARTS NOW"),
            el("h2", {}, "The Museum Opens Soon."),
            txt("p", "muted", "Read your card. Everyone enters together."),
            el("b", { "data-timer": "" }),
          ),
        );
        document.querySelector(".map-frame").append(overlay);
      }
    }
    sync();
    showError();
  }
  let actionsKey = "",
    messagesKey = "",
    seenEvent = "",
    voteKey = "";
  function sync() {
    if (!state) return;
    const advance = document.querySelector("[data-advance]");
    if (advance) advance.disabled = now() < state.meetingStartedAt + 10000;
    const seconds = state.deadline
      ? Math.max(0, Math.ceil((state.deadline - now()) / 1000))
      : 0;
    for (const n of document.querySelectorAll("[data-timer]"))
      n.textContent = seconds + "s";
    if (state.phase === "live" || state.phase === "briefing") {
      const room = W.roomAt(currentPos());
      const label = document.getElementById("current-room");
      if (label) label.textContent = room?.name || "The Corridor";
      const p = state.progress,
        progress = document.getElementById("museum-progress"),
        fill = document.getElementById("museum-progress-fill");
      if (progress)
        progress.textContent =
          "Last Meeting · " + p.done + "/" + p.total + " jobs";
      if (fill)
        fill.style.width = (p.total ? (p.done / p.total) * 100 : 0) + "%";
      const status = document.getElementById("map-status");
      if (status)
        status.textContent =
          state.sabotage?.kind === "lights"
            ? "Lights Out · Restore Power In Security"
            : state.sabotage?.kind === "door"
              ? "A Door Is Locked · Find Another Route"
              : state.me.bag
                ? "Carrying An Exhibit · Reach Its Destination"
                : !state.me.alive
                  ? "Out · Help With Jobs · Keep Quiet"
                  : "Explore · Do Jobs · Stay Alert";
      const choices = state.phase === "live" ? actionChoices() : [],
        key = JSON.stringify([
          state.step,
          choices.map((c) => [c.label, c.disabled]),
          state.me.alive,
          state.me.team,
        ]);
      const bar = document.getElementById("museum-actions");
      if (bar && key !== actionsKey) {
        actionsKey = key;
        bar.replaceChildren(
          ...choices
            .slice(0, 3)
            .map((c) => button(c.label, c.run, c.kind, c.disabled)),
          el("span", { class: "bar-spacer" }),
          button("Your Jobs", showJobs),
          button("Map", showMap),
          state.me.alive
            ? button("Tools", tools)
            : button("Out Chat", () => modal("Out Players Only", chatBox())),
        );
      }
      const event = state.events.find(
        (e) => e.actor !== state.meId && e.target !== state.meId,
      );
      const hint = document.querySelector(".status-hint");
      if (hint)
        hint.textContent = event
          ? "You saw " +
            who(event.actor) +
            " knock out " +
            who(event.target) +
            "."
          : state.me.team === "thief"
            ? "Your teammates: " +
              state.me.allies
                .filter((id) => id !== state.meId)
                .map(who)
                .join(", ") +
              (state.me.allies.length === 1 ? "You are working alone." : "")
            : "Choose a glowing job marker, or open Your Jobs for directions.";
      if (event && event.id !== seenEvent) {
        seenEvent = event.id;
        sound("bad");
        announce(hint.textContent);
      }
      const feed = document.getElementById("camera-feed");
      if (state.me.camera) {
        if (!feed) {
          const n = el("div", { id: "camera-feed", class: "heist-panel" });
          document.querySelector(".action-bar")?.after(n);
        }
        const n = document.getElementById("camera-feed");
        if (n)
          n.replaceChildren(
            el(
              "h3",
              {},
              "Camera · " +
                W.ROOMS.find((r) => r.id === state.me.camera.room)?.name,
            ),
            txt(
              "p",
              "muted small",
              "Live for " +
                Math.max(0, Math.ceil((state.me.camera.until - now()) / 1000)) +
                "s",
            ),
            el("canvas", {
              class: "camera-screen",
              width: 528,
              height: 488,
              "aria-label": "Live security camera view",
            }),
          );
        museum?.drawCamera(
          n.querySelector("canvas"),
          state.me.camera.room,
          state.me.camera.players,
          state.players,
        );
      } else feed?.remove();
    }
    if (state.phase === "voting") renderVote();
    if (state.phase === "discussion" || !state.me.alive) {
      const key = JSON.stringify([state.chat, state.ghostChat]);
      if (key !== messagesKey) {
        messagesKey = key;
        for (const box of document.querySelectorAll("[data-heist-chat]")) {
          const n = messages();
          box.replaceChildren(...n.childNodes);
          box.scrollTop = box.scrollHeight;
        }
      }
    }
    if (dialogKey.startsWith("joint:")) {
      const j = state.joints.find((j) => j.id === dialogKey.slice(6));
      if (j?.done) {
        closeDialog();
        sound("win");
      }
    }
  }
  setInterval(() => {
    sync();
    if (pendingMove && !busy && Date.now() - lastMove > 150) {
      const p = pendingMove;
      pendingMove = null;
      move(p);
    }
  }, 250);
  addEventListener("visibilitychange", () => {
    if (!document.hidden && seat) {
      clearTimeout(timer);
      poll();
    }
  });
  render();
  if (seat) poll();
})();
