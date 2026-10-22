# Last Train

A separate 5–12-player secret-team game at `/last-train.html`. The existing Row of Reckoning and Grand Con (Review) remain separate. Its API is `/api/last-train`, Redis namespace `last-train:room:*`, and browser seat `lt-seat`.

The journey now uses illustrated train scenes: team introductions → boarding on the platform → closing eyes and finding a private cabin → sequential night turns → gathering in the lounge → speaking in seat order → a sealed vote → a public removal and vote record → the next night or winner.

## Teams and role mix

**Passengers and Crew are good.** They win together when all Saboteurs are out. **Saboteurs are bad.** They win when all Passengers OR all Crew are out. Resolve all deaths together; if the last Saboteur and the last good group die together, good wins.

| Players | Passengers | Crew | Saboteurs |
| --- | --- | --- | --- |
| 5 | 3 | 1 | 1 |
| 6 | 2 | 2 | 2 |
| 7 | 3 | 2 | 2 |
| 8 | 4 | 2 | 2 |
| 9 | 4 | 3 | 2 |
| 10 | 4 | 3 | 3 |
| 11 | 5 | 3 | 3 |
| 12 | 6 | 3 | 3 |

Saboteur counts are 1 at five players, 2 at six to nine, and 3 at ten to twelve. A running game keeps its dealt roles and original role summary; the new mix applies when the host starts another journey.

These are initial mixes for group playtesting, not a claim of verified competitive balance. These are recommended mixes. Passengers outnumber Crew except at six players, where the recommended mix has two of each. Five-player rooms have one Crew slot (Inspector by default); six to eight have two (Inspector and Medic); nine to twelve have three (including Trainee). Recommended Passenger powers include Careful and Witness, plus Brave at nine or more. At twelve, one bad player defaults to Blocker.

The host can choose roles before the first journey and before replay: one to three distinct Crew within the size limit, at least Inspector or Medic; any subset of the four special Passenger roles, including none; normal Passengers fill every remaining Passenger seat. One Saboteur is always normal. With two or three Saboteurs, the host can use all normal Saboteurs or replace one with Blocker. Roles are always dealt to people at random. Shuffle roles creates a valid random mix and Recommended roles restores the preset. Choices adapt if the room grows or shrinks. An already-dealt match keeps its original roles.

| Role | Group | Power |
| --- | --- | --- |
| Passenger | Good · Passenger | Listen, share findings and vote. No night power. |
| Careful Passenger | Good · Passenger | Once per game, lock their own door to stop that night's Saboteur attack on them. Does not stop poison, overdose or voting. |
| Brave Passenger | Good · Passenger | Once per game, protect another living player from the attack. **Protection is now a shield, not a sacrifice. If Medic also heals that same person, the protected person dies from overdose.** |
| Witness | Good · Passenger | Once per game, watch tonight. Immediately and privately learn the original attack target, even if saved. A target can be good or bad. |
| Speaker | Good · Passenger | Once per game, a confirmed vote for a person counts twice. Cannot double Skip. Optional replacement for Brave. |
| Inspector | Good · Crew | Each night, check another living player. Immediately and privately learn GOOD or BAD, not their exact role. |
| Medic | Good · Crew | See the original attack target, then heal them, poison another living player, or Skip. One heal and one poison for the whole game. Only one medicine each night. Can heal themselves if attacked. |
| Trainee | Good · Crew | Starts with no night power. When Inspector or Medic is removed, privately take that job from the next night. Still Crew. Inherit only remaining medicine. If both jobs are lost together, Inspector takes priority. |
| Saboteur | Bad · Saboteur | Know the bad team. Agree on one shared attack, or Skip, within 25 seconds. Anyone still alive is allowed, including themselves and teammates. |
| Blocker | Bad · Saboteur | Also proposes the shared attack. Once per game, block one other living player's night power during the Saboteur turn. Does not stop the team's base attack. |

Living identities stay private. Eliminations reveal only GOOD or BAD; exact roles and Crew/Passenger membership remain hidden until the end. Public history is sanitized as well as the player list. Group counts stay at the starting totals during play so count changes cannot reveal a removed player’s good subgroup; finished games expose actual remaining counts and every role. A bottom-of-screen role ticket can be shown or hidden. It shows the role, good/bad group, remaining medicine or one-use power status, and access to private reports. Saboteurs also see their teammates’ public avatars, names, roles and alive/out status in the ticket. It first appears in the cabin, where it reveals the role to the owner.

## Introduction, boarding and seats

The initial 20-second introduction briefly lists the available good and bad roles and counts without assigning any identities publicly. Everyone can press Ready to board sooner. All 5–12 travellers then board a train on a 6-second platform scene. Boarding plays the approved, locally served walking-and-boarding video with its original soundtrack alongside sequential passenger boarding checks. The clip follows server time, pauses with the room, and resumes at the elapsed position on reload. Sound is enabled by default with no game mute toggle or saved mute preference. A normal game tap unlocks the Web Audio graph and original soundtrack. Browser autoplay restrictions can temporarily require a tap; muted autoplay keeps the picture moving until then. Device volume and OS/browser audio policy remain authoritative. The versioned video is cached in the browser for repeat games when storage permits. Reduced motion and playback failures show its still poster; media never delays the six-second phase. A 4-second closing-eyes transition takes each person to their cabin.

Seat order is shuffled independently from role assignment at the start of the match. It never sorts by team and stays fixed for the whole match. Boarding names, cabin numbers and lounge seats use that same order. In the lounge, seats run left to right, then the next row; numbered seats keep this clear on smaller phones. Removed seats remain visibly empty and do not get a speaking turn.

Boarding preserves the entire visible page with the final video frame, fades through full-screen darkness, then reveals the cabin and controls together; reduced-motion devices switch without this animation. `night-carriage.mp3` is a 53-second original piano-and-bowed-pad loop, composed locally without sampled or third-party music. It runs only in a joined journey, lowers during discussion, yields to boarding audio, and pauses when the game is paused or the page is hidden. `tools/compose-last-train.py` reproduces the score with numpy and ffmpeg.

## Two shared night phases

Every phone gets two fixed **25-second** phases. Confirming, skipping, spending a power or losing a role never shortens either window. A night already running on the old sequential rules finishes safely; the next night uses the shared phases.

1. **Make your move.** Saboteurs propose their shared attack and whisper privately. Blocker also chooses a one-use block. Brave Passenger chooses protection and Careful Passenger chooses their door lock. At the deadline, player-target proposals settle into one attack: ties choose randomly, Skip and missing proposals are abstentions, and no selected targets means no attack. Blocks apply to the whole night, including protection and locks chosen earlier in the same phase.
2. **Respond.** Medic sees the final attack target and chooses heal, poison or Skip. Inspector checks a player and Witness can watch the attack. Inspector and Witness get immediate private result cards; blocked powers reveal no result, and a blocked Medic sees no patient or medicine expenditure.

Everyone can use a private night notebook in both phases, including players whose powers are used or whose role has no action. Trust / Unsure / Suspect marks beside public player portraits stay available across both phases, so good players can continue editing without rushing. Saboteurs instead get a private cover-story field in phase 2, with a separate draft for each night, shown privately on their discussion turn. These activities are optional, stored only on that device for that seat and match, and never submit a vote or public message. The existing Notes tool remains available for writing and drawing. There is no public night completion indicator.

All choices except Saboteur proposals lock on confirmation. A confirmed limited power is spent even if blocked or unnecessary. Missing choices skip without spending a limited power. Dead characters cannot act or receive future Saboteur chat, proposals, patient information or medicine stock.

### Resolve the whole night together

A living, unblocked Brave shield and an unblocked door lock prevent the original attack. A confirmed heal prevents the original attack. If a player receives both Brave protection and healing, overdose removes that player **even if their door was locked**. Brave does not take the victim's place.

Poison removes its chosen victim independently. It bypasses a shield and locked door, may hit a good player, and still resolves if Medic dies. It does not heal the attack victim. A victim hit by multiple effects is removed once.

Resolve all victims together, then promote a surviving Trainee, check the winner, and keep private results already learned. Medicine is shared across the original and promoted Medic and never refills on promotion. Protection and healing cannot reverse a group vote. New promotions do not act in the night just completed.

## Gathering, speaking and voting

At night end a 4-second gathering transition brings everyone to the train lounge. An 8-second morning reveal shows who is out and whether they were GOOD or BAD, and the fatal cause: Attacked, Poisoned or Overdose. Multiple fatal causes are shown together. Exact roles remain secret. These causes also appear in the journey log; saved players are not announced as deaths. Private reports are accessible from the owner's role ticket. If the game is over, this proceeds to the winner; otherwise speaking begins automatically.

The host chooses **In person** or **Chat room** before starting:

- **In person:** living players speak aloud in seat order, with up to 20 seconds each (the host can choose 15, 20, 30 or 45 seconds in the lobby). Only the current speaker can press Done to finish early; sharing text or a recording also ends their turn immediately. Missing turns time out automatically.
- **Chat room:** each living player gets up to 20 seconds to type or record one message (up to 280 characters). Everyone can read the statements in the train chat, including previous rounds. Sharing a text message or a recording immediately advances to the next living player; the message remains available in the conversation. Only the current speaker can post. Drafts survive a host pause/resume.

After every living player has had a turn, a 45-second sealed vote begins automatically. Everyone may vote for any living player, including themselves, or Skip. A confirmed vote cannot be changed. Missing votes and Skip are abstentions: they never defeat a vote for a player. The player with most votes is removed, even if all other players skip. If all abstain on the first vote, nobody is removed. A tie first opens a seven-second information phase (`revoteInfo`) with the tied players’ avatars/names and the tie-break rules. Its centered card can be dismissed, but voting stays closed until that shared countdown ends. Then a new full 45-second sealed vote opens, restricted to the tied players. Everyone alive votes again; the phase step increments and ballots reset, so delayed first-ballot requests are rejected. If the re-vote ties, choose randomly among the tied leaders. If everyone abstains on the re-vote, choose randomly among the original tied candidates. A Speaker double vote remains spent if used on the first ballot.

The result shows the removed person, **GOOD or BAD**, and the vote record grouped by target: each target and vote total above the avatars/names of their voters. Abstentions form a separate group, and Speaker double votes show ×2. Both ballots remain in history when there is a re-vote. The same record remains in the journey log. Chat and the log group entries into Night 1, Night 2, and so on, each in its own accordion; the current night opens by default and manual open/closed choices survive polling until the next night. Even a winning removal gets this reveal before the final screen. When someone is voted out the result lasts 20 seconds instead of 12, and the removed player can share one line of last words (up to 120 characters) after the ticket is cancelled; it is shown to everyone and kept in the journey log. After the ticket animation, each ballot flies as a ticket stub from the voter's lounge seat to their choice.

**Suspect pins.** From gathering until the vote result, each living player can pin one suspect and change or clear it. Everyone sees only the number of pins on each portrait (roster and lounge seat), never who pinned. Pins are not votes and reset each night. If all three groups still have someone alive, everyone returns to their own cabin for the next night. Otherwise the game shows the winner and every role. Replay deals new roles and seats and resets supplies.

## Recorded discussion turns

During their own 20-second discussion turn, a player can choose **Record voice**, grant microphone permission, then **Stop & share**. Recording starts only after that tap and stops automatically at the end of the turn (maximum 20 seconds). **Discard** stops the microphone without sharing. Chat rooms retain typed messages as an alternative; in-person rooms can also record. A turn allows one typed message or one recording. Pausing the game pauses recording. Background music is silenced during capture and playback; hiding the tab stops and shares a recording, and leaving/reloading releases the microphone.

Shared clips appear under the speaker’s avatar/name in Conversations aboard, grouped by night. Sharing a clip immediately ends the speaking turn, so everyone in the room can play it right away. Playback is requested explicitly, never automatic for other players, and survives normal room updates. Microphone rejection or unsupported recording formats leave text/in-person play available.

The API reserves a recording ID during the authenticated speaker’s turn. A bounded 15-second upload grace period accepts the finished clip after a normal turn transition without allowing someone to start recording outside their turn. Clips use browser-native MP4/AAC where supported, otherwise WebM/Opus or Ogg/Opus, with a 256 KiB upload limit and declared duration capped at 20 seconds. An authenticated room member fetches audio separately on playback; audio bytes are never in the room state, URLs, receipts, or local storage. Separate Redis keys (or the development memory store) expire recordings after 12 hours. Starting another match removes access to the previous match’s recordings. No additional storage service is provisioned.

## Rooms, privacy and timers

Four-letter room codes, 5–12-player starts and private authenticated seats. New names join only before a match starts; existing players can rejoin with their same name and private rejoin code. Recovery preserves character/powers and rotates the token, signing out the old phone. Losing connection or leaving never kills a character. Host controls transfer to another remaining player, preferring a living player.

Host pause freezes timers and rejects gameplay changes, while an already-reserved voice upload may finish. Resume restores remaining time. Host cannot cut a night turn or the ordered speaking phase. Public morning/result scenes may be advanced by the host, while timers also advance them automatically. State polls settle expired steps. Choices use match/round/step fences and action receipts; retries cannot use another medicine, duplicate a statement or add another vote. Concurrent 12-player mutations use compare-and-swap storage and bounded retries.

Only explicit public fields and the authenticated owner's private data are returned. Public seat order, neutral human portraits, waiting screens and timing never identify living teams. All rendered chat uses text nodes, not HTML. Private team chat is limited to six short messages per bad player during that night window. Redis writes retain the existing 12-hour TTL and an independent room/rate-limit namespace. Local development uses in-memory storage. Obsolete simultaneous-night Last Train rooms reset to a lobby while preserving their private seats/recovery; existing games are unaffected.

## Private notebook

Notes, Letters and Reactions sit together as round buttons in the bottom-right corner, above the role ticket, in the lobby and during every phase. Notes opens a private notebook with three tabs. **People** lists every traveller with Trust / Unsure / Suspect chips (tap again to clear) and a one-line note each; the chips are the same marks as the night notebook in the cabin, which also uses chips instead of a dropdown. **Type** and **Draw** work as before: six ink colors, Pen, Eraser, Undo and Clear drawing. Everything autosaves on the current device and survives reloads, phase changes and pause/resume. The game continues while the notebook is open.

Notes belong to the current room, player and game. Lobby notes carry into the first game; another game starts a fresh notebook. Notes never enter game requests, room state or shared chat. They do not transfer to another device through a rejoin code.

## Header

The header follows Row of Reckoning: an icon bar (All games, How to play, the sound menu, and the Shop with the WP balance), the centred LAST TRAIN title, and a room card with the shimmering room code, Leave (with a confirmation popup), a stats line (travellers, aboard, phase), and Players / Invite ▾ / Pause. Invite offers the link, a QR code and the private rejoin code. The roster strip under it shows round portraits in seat order: the speaker has a gold ring and microphone, voted players a green ring, removed players turn grey with a red cross, the host has a star, and suspect-pin counts appear as small badges. Test bots collapse to one line.

## Reactions, shop and throwables

The reaction button opens a tray of 18 reactions from Row of Reckoning (EZ, fire and trophy are left out; SUS, Shh and Eyes are new). A reaction floats above the sender's lounge seat, or their roster portrait. Word reactions play the recorded voices. Reactions and throws are off during boarding, settling and night so a tap can never hint at a secret move. Players who are out can still react, shown faded like a ghost, but cannot throw.

The shop has two tabs. **Frames** are Row of Reckoning's eight borders (15–50 WP), drawn around the portrait in the roster, letters, Players list and the finale cast. **Throwables** are nine packs of three throws (10–25 WP), thrown from the reaction tray at a traveller's seat with the same arc and splat as Row of Reckoning. A speaker cannot be hit in the first five seconds of their turn. The wallet belongs to this room and is separate from Row of Reckoning: everyone starts with 25 WP and earns more by winning (+15 for 5–7 players, +20 for 8–10, +25 for 11–12), staying aboard to the end (+5), a vote that removes a Saboteur (+5 per voter), or, for Saboteurs, a good player voted out (+5).

## Awards and sound

The finale shows three journey awards: Sharpest Eye (most votes on Saboteurs), Best Liar (the Saboteur who lasted longest with the fewest votes against them) and Guardian (most attacks stopped by a lock, protection or heal), the player's WP for the journey, and the room's running scoreboard of wins and awards across journeys.

The sound menu offers Off, Effects, or Effects + Music (saved on the device). Effects are synthesised in the browser: a horn when boarding, a door on the way to the cabin and the lounge, soft wheel clatter during the night, a creak at the second night phase, the dining-car bell at morning, a chime on your own speaking turn, ticks in the last five seconds when you still have to act, a ticket punch for your vote, a stamp when a ticket is cancelled, a whistle on a tie, and a brass or cello sting at the end. Every phone hears the same cues at the same moments; a secret night choice never makes a sound.

## Visual and interaction checks

Cabin, lounge and platform use local compressed WebP artwork with a violet, midnight-blue and champagne-gold palette. The cabin has a seated first-person viewpoint with a wide composition that keeps the sofa visible on phones. Human portraits replace emoji characters; role portraits match each profession, while 12 unique neutral civilian portraits identify players publicly without revealing teams. See `last-train-art.md` for atlas mapping. The first-person cabin never shows an external avatar of the owner. Saboteur cabins show the other known teammates across from the viewer; the owner is represented by the private bottom role card. The shared lounge retains every numbered seat, with paired seats, a spotlight on the current speaker and faded figures for removed players. A role ticket stays pinned to the bottom during play, with a centered SVG chevron and no decorative drag line. The finished screen instead shows a full-body winning-team lineup and a public cast list, with a departure-ticket style Another Journey action. The header uses a train crest instead of the LT monogram. Action target manifests open as keyboard-accessible dialogs and close when the turn changes, preventing a stale choice from carrying into another turn. Reduced-motion mode keeps all scenes readable without boarding/transition animation.

## Optional test players

The host can open `/last-train.html?room=ROOM&test=1` on the browser where their host seat is saved, then press **Add 5 test players** in the lobby. The five clearly named Bot seats use their own ordinary API credentials and private views. They ready up, make simple legal night choices, share role-aware statements in the conversation (hand the floor to the next player as soon as they share), and vote automatically. They prefer other bot seats as targets so the human can keep testing. They never start or advance a host-controlled phase or modify room settings.

Use `&bots=4` to request four test players (accepted counts are 1–5, default five). Adding `&autobots=1` explicitly sets up that count once when the host opens the link in the lobby. Reloading reuses the saved seats. Switching from five to four removes only the final saved bot owned by that host browser, keeping human players in the room. Guests never get bot controls or auto-setup. Share the normal `?room=ROOM` link with friends; the host keeps the test-mode page open to run the bots. A running game is never resized by a link.

Starting another journey always shuffles roles and seats with fresh cryptographic randomness. Refreshing or rejoining retains the current deal. Random assignment allows consecutive repeats; bots do not reserve or force human roles.

Keep the test-mode page open while playing. Stop/Resume autoplay is available during the game; Remove test players is available only in the lobby. Bot seats are saved locally for reload recovery. Without the explicit `autobots=1` link option, bots join only after the host presses Add; guests and ordinary game URLs have no test controls. Inspector bots name their checked player and GOOD/BAD result; other good bots describe their own actions, blocked results, available powers or promotion. Medic remembers only medicine it actually used, including across a host reload. Witness never invents healing or poison knowledge. Saboteur and Blocker bots claim plausible good roles from the public role mix and fabricate results without exposing their teammates. Each bot uses only its own authenticated view. These are scripted playtest opponents, not AI models.

## Private letters

Private letters are available from the envelope button in the corner. The letterbox lists conversations, newest first, with unread counts; **Write to** shows each traveller's portrait and name, so there is no dropdown. A conversation shows both sides as bubbles grouped by night, with a reply box (up to 500 characters). Only the sender and recipient receive a letter in their private API views; there is no public history entry. Letters stay in the letterbox, including across journeys in the same room; opening a conversation marks its letters read. The badge counts unread letters and bounces, with a soft sound, when one arrives. During play, living players can write only to living players, and eliminated players only to other eliminated players. Pausing stops sending but still allows reading. Delivery is limited to eight letters per minute per sender; a room keeps its latest 400 letters.

## Verification

- `npm test`: existing game/recovery suites and Last Train rules/API tests.
- `REDIS_SERVER=/path/to/redis-server npm run test:redis`: real Redis concurrency, recovery and resolution tests.
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`: existing games plus a real 12-phone journey through the unshortened 20-second night windows, self-attack, poison, private reports, ordered speaking and public vote reveal; also ordered chat, pause/draft retention, safe text rendering, returning to cabins, small screens, settings and recovery.

Rules/API tests cover sealed introductions, independent fixed seating, stage ordering, editable proposals, random tied player targets, single-target attacks despite abstentions, one re-vote, random second-tie resolution, grouped vote history, all medicine/protection/overdose interactions, blocks, promotion, both faction-loss conditions and simultaneous-death priority, private reports/chat, ordered timed statements, votes, idempotency, phase fences, migration and 12-player concurrent input. Actual friends should playtest the new timing and overdose rule to assess fun and balance.
