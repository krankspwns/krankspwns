# Practice players

All five games support host-only **Add a bot** and **Remove a bot** controls before a match and on the results screen. Each press adds one seat or removes the most recently added bot. Bots count toward the game's normal player limits. They are labelled `[Bot]`, cannot become host, have no client token to recover, and can move with a party when its host switches games. An active match keeps its cast fixed; Crown Clash also allows its existing host reset to deal again.

## How they play

- **Crown Clash:** bots spend 6–14 seconds arranging their own seven cards. They compare candidate arrangements: high cards in row 1, low cards in row 2, a total near 10.5 in row 3, and strong patterns in row 4. Their calls are imperfect guesses; they cannot read hidden opposing cards. They reveal the current row, acknowledge their own drink result and ready up for the next round. A bot added after the results watches until the next deal.
- **Last Train:** bots ready up, use their night powers, share a short statement on their speaking turn and vote. Saboteurs know their teammates, follow a human teammate's selected target and can use their special power. Good bots know only their own reports and public statements; an Inspector's published accusation can influence their vote or a Medic's poison. The Medic normally heals the attacked player when a heal remains; poison needs a known or claimed BAD target. Protection and other limited powers can be saved. The Witness mixes watching the attack with glimpses of possible Saboteurs, within its two-sighting limit. Guards, Porters and Stewards obey the rotating-target rule. Saboteurs invent cover stories; other roles report their own actions and results. Night windows always run for their full duration, and paused games stop bot actions.
- **The Grand Con:** Truth bots interpret their own clue and compare public claims; an occasional original-clue check may resolve a disagreement. Lie bots use their permitted answer and teammate information to change a clue, bluff about evidence and push the wrong verdict. Bots do not shorten the forging or discussion timer. The host still starts voting or waits for its timer, and moves on after each reveal.
- **Hidden Alliance:** the existing bots bid, call a partner and play legal cards using the existing bridge strategy.
- **Last Laugh:** the existing bots take a hidden card, lay down pairs and shuffle their hand.

These are local rule-based practice opponents, with varied choices and simple reasoning, not a paid AI service. Server bots do not depend on the host keeping a bot tab open. They take paced turns when any authenticated player polls the room; no requests means the room sleeps until a player returns. Humans retain normal timers and phase controls.

## Privacy and rewards

Bots decide from their own seat's view; shared strategy code receives no other player's secret role, hand, vote or unshared report. Only the game rules apply the chosen action. Public replies include a bot marker, never bot memory or seat credentials. Add/remove permissions, player limits and request receipts are enforced on the server.

Bots never earn WP. Practice with only one human does not earn WP; games with at least two humans use the existing reward rules. Crown Clash still records round results and wins during practice.

Last Train's older `?test=1` browser-client tools remain available for development. The normal lobby controls create server bots and do not require that URL option.

Run `node tests/practice-bots.js` for the new games' API, full-match and privacy checks, or add `--redis` with `redis-server` available. Browser controls are covered by `tests/browser/practice-bots.spec.js`. `BOT_FAST=1` removes bot thinking delays for automated tests only.
