# The Grand Con: museum heist playtest

The new game lives at `/grand-heist.html` (`grand-heist` rooms, `gh-seat` local seat). The existing clue game, API, saved seats and recovery codes remain at `/grand-con.html`. It appears as **Grand Con: Gallery — Review** in the catalogue. Do not migrate active classic games into heist games.

## One simple goal

Staff finish every job or vote out every Thief. Thieves win when they equal or outnumber living Staff. A room needs 5–12 players: one Thief at 5–6, two at 7–12. Roles and public appearances shuffle independently each game. The optional Staff role is the Medic (one rescue of a fresh, unreported knockout within 20 seconds). Anyone alive can stand at the CCTV wall in Security to watch every room live for 25 seconds (33-second cooldown); walking away ends it, and a Thief can knock out the watcher.

## Explore, work, watch

Tap museum floors or use WASD/arrows to walk through six connected rooms. E uses a nearby action; R reports. Walls and locked doors block walking and sight. Nearby players are visible within 185 world units; a blackout reduces Staff sight to 80. The server computes paths, movement speed, sight, interaction distance and cooldowns. Other players’ hidden positions, paths, jobs and roles stay off their response.

Each character receives three short puzzles and one exhibit delivery. Staff jobs count toward the goal; Thieves have the same plausible cover jobs without increasing Staff progress. The four puzzle types are matching wires, rotating a circuit, dragging a scanner and repeating a flash sequence. Every completion checks a private challenge, its answer, minimum duration, location and phase on the server.

Two shared statues require two players holding their handles together for six seconds. Thieves can help, genuinely advancing Staff work, to build an alibi. Out Staff can also finish jobs, including shared statues, so losing living players cannot make the task goal impossible.

A visible treasure bag could be an ordinary delivery or a theft. Thieves can steal from the Gallery or Vault and deliver to the Service Exit, creating an extra reset job. There are at most two thefts per game. A bag prevents a knockout until delivered. Anonymous tracks fade after 18 seconds; witnesses see the actual knockout briefly, while the public roster hides unreported knockouts.

Thieves have a 30-second individual knockout cooldown, a shared 10-second attack gap and shared 35-second sabotage cooldown. Blackouts last 20 seconds; locked doors last 12. Staff can repair either early through a puzzle. Opening play and post-meeting play include a 15-second attack grace period.

## Report, discuss, vote

Reporting a nearby body or using the one emergency meeting at the red button in the Lobby freezes movement and tasks. All existing bodies become public. Public job progress updates here rather than giving away who completed a particular job.

Discussion lasts 45, 60 or 90 seconds, set by the host. After ten seconds the host can start voting early. Living players privately seal one player or Skip. Voting lasts 25 seconds; missing votes count as Skip. A unique highest player is escorted out, while a tie or winning Skip removes nobody. The reveal groups voters under their choices and shows only Staff/Thief, keeping special roles secret until the finale. A short verdict transition precedes returning to the museum or the winning lineup.

Out players have separate chat and cannot message living players. Practice bots and departed-character autopilot act from their own filtered view, do jobs and report witnesses; Thieves bluff. They are practice opponents, not a substitute for a real group playtest. Solo bot games do not earn farmable account rewards.

## Verification and next playtest

`node tests/heist.js` checks rules, privacy and the authenticated API. `tests/browser/heist.spec.js` exercises mobile/desktop entrances, actual puzzle controls, map navigation, reports, messages, voting, verdict and finale. Room-switch tests include all 30 directed pairs across six games. The regular server suite continues to cover existing games and account/recovery safeguards.

This is a playable prototype. First human playtests should measure how often Staff finish tasks before a vote, whether a single Thief at six players needs help, whether joint statues cause long waits, and how much discussion the map evidence creates. Keep the Playtest badge until those questions have real group feedback. No paid service or account is required for core play.

## 3D museum

`public/heist/map3d.js` (three.js, loaded from `/vendor/`) draws the museum in 3D. Arrow keys / WASD (or the thumb stick on touch screens) move your character at once and slide along the same walls as the server; the server follows along the same path a moment later and stays authoritative for every interaction. Tapping the floor still walks to that spot. Opening a job moves the camera in on the console. Without WebGL, or with `?map=2d`, the flat map (`map.js`) is used.

Choosing a job (or a room on the map) no longer walks you there: it lights a dotted guide line on the floor along the walkable route and you walk it yourself. Consoles, statues, crates, the emergency button and the CCTV wall are solid.

The 3D map is first person by default: you see your own hands (carrying the exhibit when you hold one), walk the rooms with full-height walls and ceilings, and look around by dragging (or turning with Left/Right). W/Up and S/Down walk, A/D sidestep; on phones a thumb stick walks and dragging looks. A navigation card at the top shows an arrow, the job's name and the distance, and chevrons on the floor lead the way. There is no overhead view. The game screen fills most of the page, with the action buttons floating at the right.

### Visual treatment

The museum uses midnight walls, pale marble, velvet runners, brass fittings and original framed gallery paintings (`/heist/gallery-art.webp`). Environment lighting and soft shadows give the materials depth; blackout transitions dim that lighting by elapsed time. Public characters have sculpted heads, hair and outfits rather than portrait discs, with matching skin tones on the first-person hands. Knocked-out models have closed eyes and a neutral expression. These appearances remain independent of secret roles.

The floating game controls leave space for the shared toolbar, including when it wraps on narrow phones. The same layout applies to the WebGL view and flat fallback. Job interactions wait for an in-flight movement request rather than dropping an action when E or a job button is pressed while walking.

`tests/browser/heist-graphics.spec.js` exercises the actual WebGL renderer at 320px, 390px and 1100px, art loading, toolbar clearance, blackout lighting and the flat fallback. The puzzle/report/vote test uses the flat view for deterministic position staging; separate tests cover first-person rendering and movement. All artwork and rendering code are self-hosted.
