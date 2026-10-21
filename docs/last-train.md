# Last Train

A separate 6–12-player secret-team game at `/last-train.html`. The existing Row of Reckoning and Grand Con (Review) remain separate. Its API is `/api/last-train`, Redis namespace `last-train:room:*`, and browser seat `lt-seat`.

The journey now uses illustrated train scenes: team introductions → boarding on the platform → closing eyes and finding a private cabin → sequential night turns → gathering in the lounge → speaking in seat order → a sealed vote → a public removal and vote record → the next night or winner.

## Teams and role mix

**Passengers and Crew are good.** They win together when all Saboteurs are out. **Saboteurs are bad.** They win when all Passengers OR all Crew are out. Resolve all deaths together; if the last Saboteur and the last good group die together, good wins.

| Players | Passengers | Crew | Saboteurs |
| --- | --- | --- | --- |
| 6 | 3 | 2 | 1 |
| 7 | 3 | 2 | 2 |
| 8 | 3 | 3 | 2 |
| 9 | 4 | 3 | 2 |
| 10 | 4 | 3 | 3 |
| 11 | 5 | 3 | 3 |
| 12 | 6 | 3 | 3 |

These are initial mixes for group playtesting, not a claim of verified competitive balance. The room includes Careful Passenger and Witness, plus ordinary Passengers. At 9–12, Brave Passenger is included, or the host may replace Brave with Speaker. Crew are Inspector and Medic, plus Trainee at 8–12. At 12, one of the three bad players defaults to Blocker; the host can disable that role.

| Role | Group | Power |
| --- | --- | --- |
| Passenger | Good · Passenger | Listen, share findings and vote. No night power. |
| Careful Passenger | Good · Passenger | Once per game, lock their own door to stop that night's Saboteur attack on them. Does not stop poison, overdose or voting. |
| Brave Passenger | Good · Passenger | Once per game, protect another living player from the attack. **Protection is now a shield, not a sacrifice. If Medic also heals that same person, the protected person dies from overdose.** |
| Witness | Good · Passenger | Once per game, watch tonight. If alive at the end of night, privately learn the original attack target, even if saved. A target can be good or bad. |
| Speaker | Good · Passenger | Once per game, a confirmed vote for a person counts twice. Cannot double Skip. Optional replacement for Brave. |
| Inspector | Good · Crew | Each night, check another living player. If alive at the end of night, privately learn GOOD or BAD, not their exact role. |
| Medic | Good · Crew | See the original attack target, then heal them, poison another living player, or Skip. One heal and one poison for the whole game. Only one medicine each night. Can heal themselves if attacked. |
| Trainee | Good · Crew | Starts with no night power. When Inspector or Medic is removed, privately take that job from the next night. Still Crew. Inherit only remaining medicine. If both jobs are lost together, Inspector takes priority. |
| Saboteur | Bad · Saboteur | Know the bad team. Agree on one shared attack, or Skip, within 20 seconds. Anyone still alive is allowed, including themselves and teammates. |
| Blocker | Bad · Saboteur | Also proposes the shared attack. Once per game, block one other living player's night power during the Saboteur turn. Does not stop the team's base attack. |

Living identities stay private; roles and alignment are revealed when a player is out, and all roles are shown at the end. A bottom-of-screen role ticket can be shown or hidden. It shows the role, good/bad group, remaining medicine or one-use power status, and access to private reports. It first appears in the cabin, where it reveals the role to the owner.

## Introduction, boarding and seats

The initial 20-second introduction briefly lists the available good and bad roles and counts without assigning any identities publicly. Everyone can press Ready to board sooner. All 6–12 travellers then board a train on a 6-second platform scene. A 4-second closing-eyes transition takes each person to their cabin.

Seat order is shuffled independently from role assignment at the start of the match. It never sorts by team and stays fixed for the whole match. Boarding names, cabin numbers and lounge seats use that same order. In the lounge, seats run left to right, then the next row; numbered seats keep this clear on smaller phones. Removed seats remain visibly empty and do not get a speaking turn.

## Sequential night turns

Each role window lasts the full **20 seconds**, whether its owner has confirmed, skipped, used their power, is blocked, or was removed. Only roles included in the original mix get a window; a role's window remains after its owner is out. Trainee can fill the Inspector or Medic window next night. Other players wait in their own cabin and do not need to submit dummy Ready actions.

1. **Saboteurs.** Living bad players see themselves and their living teammates sharing the same illustrated cabin. They privately see each other's target proposals and have a private team chat. Proposals may change until the deadline. The shared target is the most-voted choice; a tie is drawn randomly among tied choices. **Skip participates in the tally and random draw. An unselected proposal counts as Skip.** If Skip wins, nobody is attacked. A confirmed Blocker power is fixed and spent even if that player's attack proposal changes.
2. **Medic.** See the selected original attack target. Choose one available medicine or Skip. This happens before Brave and door-lock choices. A blocked Medic sees no patient and spends nothing. Only the owner receives the patient and medicine state.
3. **Brave Passenger**, if in the original mix. Choose one person to protect, or save the once-per-game power. A shield alone stops the attack. Shield plus healing on the same player causes a deadly overdose.
4. **Careful Passenger.** Lock their door, or save the once-per-game power.
5. **Inspector.** Check one other living player, or Skip. The result is delivered after the night only if the Inspector survives.
6. **Witness.** Watch tonight, or save the once-per-game power. The report names the original attack target, never attackers or a poison target. An explicit no-attack report is given if Skip won. A blocked Watch/Check produces a failure report, never invented information.

All choices except Saboteur proposals lock on confirmation. A confirmed limited power is spent even if blocked or unnecessary. Missing choices skip without spending a limited power. Dead characters cannot act or receive future Saboteur chat, proposals, patient information or medicine stock.

### Resolve the whole night together

A living, unblocked Brave shield and an unblocked door lock prevent the original attack. A confirmed heal prevents the original attack. If a player receives both Brave protection and healing, overdose removes that player **even if their door was locked**. Brave does not take the victim's place.

Poison removes its chosen victim independently. It bypasses a shield and locked door, may hit a good player, and still resolves if Medic dies. It does not heal the attack victim. A victim hit by multiple effects is removed once.

Resolve all victims together, then promote a surviving Trainee, check the winner, and deliver reports to survivors. Medicine is shared across the original and promoted Medic and never refills on promotion. Protection and healing cannot reverse a group vote. New promotions do not act in the night just completed.

## Gathering, speaking and voting

At night end a 4-second gathering transition brings everyone to the train lounge. An 8-second morning reveal shows who is out, their role and whether they were good or bad. Private reports are accessible from the owner's role ticket. If the game is over, this proceeds to the winner; otherwise speaking begins automatically.

The host chooses **In person** or **Chat room** before starting:

- **In person:** living players speak aloud in seat order, with up to 20 seconds each. Only the current speaker can press Done to finish early. Missing turns time out automatically.
- **Chat room:** each living player gets a full 20 seconds to type and submit one statement (up to 280 characters). Everyone can read the statements in the train chat, including previous rounds. Posting does not end the window early, allowing others to read it. Only the current speaker can post. Drafts survive a host pause/resume.

After every living player has had a turn, a 45-second sealed vote begins automatically. Everyone may vote for any living player, including themselves, or Skip. A confirmed vote cannot be changed. Missing votes count as Skip. The unique person with the most votes is removed only if they beat Skip; a tie removes nobody.

The 12-second result shows the removed person, **GOOD or BAD**, exact role, and the full voter → target record, including Skip and Speaker's double vote. The same record remains in Journey so far. Even a winning removal gets this reveal before the final screen. If all three groups still have someone alive, everyone returns to their own cabin for the next night. Otherwise the game shows the winner and every role. Replay deals new roles and seats and resets supplies.

## Rooms, privacy and timers

Four-letter room codes, 6–12-player starts and private authenticated seats. New names join only before a match starts; existing players can rejoin with their same name and private rejoin code. Recovery preserves character/powers and rotates the token, signing out the old phone. Losing connection or leaving never kills a character. Host controls transfer to another remaining player, preferring a living player.

Host pause freezes timers and rejects gameplay changes. Resume restores remaining time. Host cannot cut a night turn or the ordered speaking phase. Public morning/result scenes may be advanced by the host, while timers also advance them automatically. State polls settle expired steps. Choices use match/round/step fences and action receipts; retries cannot use another medicine, duplicate a statement or add another vote. Concurrent 12-player mutations use compare-and-swap storage and bounded retries.

Only explicit public fields and the authenticated owner's private data are returned. Public seat order, neutral human portraits, waiting screens and timing never identify living teams. All rendered chat uses text nodes, not HTML. Private team chat is limited to six short messages per bad player during that night window. Redis writes retain the existing 12-hour TTL and an independent room/rate-limit namespace. Local development uses in-memory storage. Obsolete simultaneous-night Last Train rooms reset to a lobby while preserving their private seats/recovery; existing games are unaffected.

## Private notebook

A floating Notes button on the right opens a private notebook in the lobby or during any game phase, including after elimination. Players can type notes or draw with a finger, stylus or mouse. Drawing tools include Pen, Eraser, Undo and Clear drawing; Undo can restore a cleared drawing. Text and drawings autosave on the current device and survive reloads, phase changes and pause/resume. The game continues while the notebook is open.

Notes belong to the current room, player and game. Lobby notes carry into the first game; another game starts a fresh notebook. Notes never enter game requests, room state or shared chat. They do not transfer to another device through a rejoin code.

## Visual and interaction checks

Cabin, lounge and platform use local compressed WebP artwork with a violet, midnight-blue and champagne-gold palette. The cabin has a seated first-person viewpoint with a wide composition that keeps the sofa visible on phones. Human portraits replace emoji characters; role portraits match each profession, while 12 unique neutral civilian portraits identify players publicly without revealing teams. See `last-train-art.md` for atlas mapping. The first-person cabin never shows an external avatar of the owner. Saboteur cabins show the other known teammates across from the viewer; the owner is represented by the private bottom role card. The shared lounge retains every numbered seat, with paired seats, a spotlight on the current speaker and faded figures for removed players. A role ticket stays pinned to the bottom. Action target manifests open as keyboard-accessible dialogs and close when the turn changes, preventing a stale choice from carrying into another turn. Reduced-motion mode keeps all scenes readable without boarding/transition animation.

## Optional test players

The host can open `/last-train.html?room=ROOM&test=1` on the browser where their host seat is saved, then press **Add 5 test players** in the lobby. The five clearly named Bot seats use their own ordinary API credentials and private views. They ready up, make simple legal night choices, post a labelled test statement in chat (or finish their in-person speaking turn after four seconds), and vote automatically. They prefer other bot seats as targets so the human can keep testing. They never start or advance a host-controlled phase or modify room settings.

Keep the test-mode page open while playing. Stop/Resume autoplay is available during the game; Remove test players is available only in the lobby. Bot seats are saved locally for reload recovery. No bots join until the host presses Add; guests and ordinary game URLs have no test controls. These are flow-testing clients, not strategic opponents.

## Verification

- `npm test`: existing game/recovery suites and Last Train rules/API tests.
- `REDIS_SERVER=/path/to/redis-server npm run test:redis`: real Redis concurrency, recovery and resolution tests.
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`: existing games plus a real 12-phone journey through the unshortened 20-second night windows, self-attack, poison, private reports, ordered speaking and public vote reveal; also ordered chat, pause/draft retention, safe text rendering, returning to cabins, small screens, settings and recovery.

Rules/API tests cover sealed introductions, independent fixed seating, stage ordering, editable proposals, random tied choices including Skip, all medicine/protection/overdose interactions, blocks, promotion, both faction-loss conditions and simultaneous-death priority, private reports/chat, ordered timed statements, votes, idempotency, phase fences, migration and 12-player concurrent input. Actual friends should playtest the new timing and overdose rule to assess fun and balance.
