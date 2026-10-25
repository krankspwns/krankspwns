# The Grand Con — Truth Team vs Lie Team

A discussion and deception game for 4–12 friends in the same room, each with a private phone. Best with 6–8. Nobody is eliminated. This replaces the original auction economy: no credits, bids, appraisal side bet, favors, or probabilistic leads.

## One decision and one score

Secret teams stay fixed for the match. The Lie Team has `floor(players / 3)` members; everyone else is on the Truth Team. Lie Team players know each other. Truth Team players know only their own allegiance.

For each round, the group votes **REAL** or **FAKE**: does the item match what the seller says? The Truth Team earns a point for a correct group answer. The Lie Team earns a point for the wrong group decision. First to three points wins, in three to five rounds. Only at the final team reveal do allegiances become public. The optional check and public claims support this same goal; they add no second score or currency.

## Each round

1. **The setup — 30 seconds.** One Lie Team player sees the true case and chooses one player’s report to replace with a prewritten alteration. The editor rotates between Lie Team players. All Lie Team players see the truth and the editor’s options. A report may belong to either team, including the editor; otherwise revealing the altered report would confirm the recipient as Truth Team. The alteration locks on confirmation, but no one receives a document until the shared 30-second setup timer ends. Everyone can prepare a private question while waiting. At the deadline the server chooses one automatically. If the editor leaves, another present Lie Team player takes over; if none remains, the server seals a report immediately and keeps the shared deadline.
2. **Discussion — 60–120 seconds.** Each player receives a distinct document with a concrete fact, its limits, and a question to ask. One report is altered; all others are factually accurate but may be incomplete. A Truth Team player is not warned if their document was altered. Lie Team players see the final alteration. Talk out loud, compare dates and identifying marks, question what repairs explain, quote selectively, or lie. Anyone can add 30 seconds once per round. The host can open voting early.
3. **Vote — 30 seconds.** Choose REAL or FAKE and confirm it. A vote cannot be changed. Other players see submission status, never the choice. More than half of the players present when voting opens must vote REAL. Ties and too few REAL votes answer FAKE. Missing votes add no REAL vote; leaving does not lower the fixed threshold, and already sealed votes remain. All votes in or timer expiry resolves the deal.
4. **Reveal.** The server shows the truth, result, point awarded, votes, altered report, and its original wording. All original reports are available for review. Allegiances remain secret. The history preserves these details so players can question earlier statements. The host opens the next deal, or reveals the teams once either side reaches three points.
5. **Rematch.** Present players receive fresh shuffled allegiances, cases, and report assignments. At least four players must be present.

## Clues

Eight authored cases cover a painting, recording, crown, clock, mask, medal, comic and signed match ball. Each has separate connected genuine and fake evidence sets, not random “probably original” hints. Every match shuffles the cases. Authenticity is chosen independently per deal; there is no fixed genuine/fake quota to count.

Each case has twelve subject-specific reports. Four to twelve players each get a different source about the actual object: its marks, manufacture, repairs, ownership, photographs or use. Four-player tables receive the core four connected clues; extra seats receive additional relevant evidence, not generic price or delivery filler. The recipients are shuffled independently of allegiance. Exactly one clue is changed, and every offered change differs from the original.

Discussion time defaults to Auto: ten seconds per player, with a minimum of 60 and maximum of 120 seconds. Before starting or replaying, the host can choose Auto, 60, 90 or 120. One shared +30-second extension remains available.

The same eight cases can recur in later matches, with genuine/fake versions and different recipients. This is a first playable ruleset: automated checks establish correct mechanics and privacy, not competitive balance or whether a real group enjoys the discussion. Case variety, timing, and team sizes need table playtesting.

## Plain English in the app

The public names are **Truth Team / Lie Team**, and players vote **REAL / FAKE**. The private panel is **Your secret card**, containing **Your clue**. Buttons use direct actions such as **Start game**, **Start vote**, **Confirm REAL**, and **Next round**. The main rules show the two goals and three steps; timing, the private check and tie details are available under **More rules**. Each vote also shows the exact number of REAL votes needed.

Cases and questions use everyday English. Required facts are included in the clues, without assuming players know about art, clocks, or old objects. For example, the clock’s identifying number is described as “clock number 87,” and “working parts inside” replaces “mechanism.” Case clues use short sentences and include the background needed to interpret them. Changes preserve the connected facts and the one changed clue.

Internal API names remain `house` / `ring` and `approve` / `reject`, so stored room state and request receipts remain compatible. `house` means Truth Team, `ring` means Lie Team, `approve` is displayed as REAL, and `reject` as FAKE. These internal values are never used as player-facing labels.

Before the clue delivery, everyone has a private question field on their own phone. It is stored on that device for that seat, match and round, and appears privately beside the discussion board. It is never submitted as a public claim automatically.

## Claims and one private check

During discussion, anyone may leave a public claim of up to 180 characters and choose “I think REAL”, “I think FAKE” or “Not sure”. This is a statement, not a vote, and may be a lie. Players can update their statement, at most once every two seconds. Only the current round is editable. Claims remain readable during voting and are saved with the reveal. The original-evidence review places a player's statement beside their true clue; a changed-clue recipient is explicitly identified as having received different wording, without exposing their team.

Every player on either team also has **one original-clue check per match**. During discussion, choose another present player. The server privately returns that player's original clue and source; it does not reveal the target's team, whether they lied, or the global REAL/FAKE answer. The check cannot target oneself and is spent immediately on confirmation. Its private report remains on the owner's secret card across later rounds. The power resets on rematch. Neither the use nor report is included in public roster, claims or history. Lie Team players can use the same controls, preventing the existence of a check from confirming someone as Truth Team.

## Presentation

Grand Con has its own twelve-person fictional Chinese, Thai and Vietnamese cartoon gallery cast, an illustrated private gallery and an eight-item artifact atlas. People use expressive cartoon illustration; collectible objects and the jeweled gold winner’s trophy retain a realistic material finish. Public portraits are assigned by seat, independently of secret team. The teal, champagne-gold and burgundy theme uses the shared self-hosted Inter font. Main choices use gold; host progression uses slate blue; Start/Play Again share a gold invitation treatment.

Controls sit below the object artwork. The secret card is a bottom drawer with an always-reachable local hide action and Escape support. It closes for voting and results. Opening or hiding it never sends a network action. Vote results group people under REAL, FAKE and NO VOTE. Result animation stages the verdict, point and changed clue without an extra blocking popup, respects reduced motion and is attached to phase entry rather than routine polls. Final team cards show human portraits and team goals, without adding another currency or win condition. All phone text fields use at least 16px text and keep pinch zoom enabled.

The game remains marked REVIEW. Automated checks verify rules and privacy; they do not establish fun or balance. In particular, playtest how the original-clue check changes the Truth Team's advantage, whether twelve people have enough discussion time, and whether claims encourage bluffing rather than mechanical clue counting.

## Routing, persistence and recovery

- `/` — game selector; `/?games=1` always opens it, bypassing saved-seat resume.
- `/reckoning.html` — existing game; legacy `/?room=ABCD` links still route here.
- `/grand-con.html` — this game; invitations use `/grand-con.html?room=ABCD`.

Games keep independent seat storage and room namespaces. Grand Con uses the existing Redis connection, compare-and-set writes and 12-hour expiry, with in-memory development fallback. Requests have bounded retries and mutation receipts so duplicate forge/vote/next requests cannot apply twice.

Only the requesting player receives their team, document, sealed vote, and recovery code. Lie Team-only briefings are filtered on the server, including for a Truth Team host. Public history reveals documents and votes only after resolution. Seat recovery rotates the token and recovery code, signing out the old device. New players join only in the lobby; existing seats can recover during play. The host transfers on departure.

Persisted rooms from the old auction rules reset to the lobby on their first request, preserving player identities, tokens, and recovery codes. The UI explains the rules change. Old match data is discarded rather than interpreted as the new rules.

## Verification

`npm test` covers both games, a full five-round Grand Con match, Lie Team permissions, exact one-report alteration, private state, sealed voting, score replays, extension limits, timeout fallback, fixed vote thresholds, recovery, old-room migration, every case/truth with 4–12 assignments, and concurrent 12-player joins/votes.

`npm run test:redis` repeats API checks through a real local Redis REST bridge, including CAS, TTL, and unavailable storage. `npm run test:browser` includes six independent devices playing five rounds, document selection, discussion extension, private reports, mobile layout, reload, final team reveal and rematch, hub navigation and keyboard rules access, alongside existing Row of Reckoning regressions.
