# The Grand Con — first playable rules

An original auction and social bluffing game for friends at the same table. Phones carry private information; conversation happens in person. No moderator or player elimination. Target 6–12 players; 4–5 is an experimental small-table mode. The initial economy needs real group playtesting before competitive balance is considered final.

## Entry points

- `/` — The Game Room selector.
- `/reckoning.html` — existing Row of Reckoning home and rooms.
- `/grand-con.html` — The Grand Con home and rooms.
- Existing `/?room=ABCD` links continue to open Row of Reckoning.
- Grand Con invitations use `/grand-con.html?room=ABCD`.
- Saved seats resume directly from `/`. `/?games=1` always shows the selector.

The two games use independent seat storage and room namespaces. New game storage uses the project's existing Redis connection, with versioned compare-and-set writes and a 12-hour expiry. No Redis configuration means local in-memory play, matching the existing game's development setup.

## Win condition

Players are secretly split as evenly as possible between the Gilt Society and the Onyx Circle. Players know their own allegiance, but do not know their teammates. Every player starts with 40 credits.

After five auctions, each player's wealth is their remaining credits plus their purchased objects' resale values. The syndicate with the highest **average** player wealth wins; comparisons use exact totals and team sizes, not rounded display values. Equal averages are a draw. Everyone tied for highest personal wealth shares the MVP distinction. Each bid, fee, insurance refund and appraisal reward affects wealth.

## Each lot

1. **Discussion — 90 seconds.** A public object and seller's story appear. Each player gets a private lead. A lead agrees with authenticity with 70% probability, independently for each player. It is deliberately not proof. Say what you like about your evidence or allegiance. The host can end discussion early.
2. **Secret favors — 45 seconds.** Choose one unused favor, or pass. Each favor costs 2 credits and each can be used once per match. Choices lock on submission. All remaining players submitting advances the phase early.
3. **Sealed bidding — 45 seconds.** Submit an integer bid from 0 to your remaining credits and an appraisal vote: Genuine, Forged, or Abstain. Both lock together. Only your own bid is visible until resolution. Zero passes. Missing bids become zero with no appraisal.
4. **Reveal.** The object, resale value, bids, favors and appraisals become public. Only the buyer pays their actual bid. The host opens the next lot after everyone has read the outcome.
5. After lot five the host reveals the syndicates and final results. They can start a new match, resetting purses and favors and shuffling allegiances.

Exactly three of the five objects are genuine (14–28 credits each), and two are forgeries (0–5). Object values count toward wealth but cannot finance later bids. Players may use the history to deduce the remaining distribution.

## Favors

- **Investigate:** receive a private, verified authenticity and exact resale-value report. The host cannot see another player's report.
- **Insure:** if you buy a forgery on this lot, refund up to 8 credits of your actual bid. No refund if you do not win.
- **Leverage:** add 3 to a positive bid for winner comparison only. Pay the bid entered, not the boosted comparison value. Zero remains a pass.
- **Plant a rumor:** choose a public, anonymous claim that the lot is genuine or forged. Marked explicitly as unverified player information. It does not change the object's actual authenticity.
- **Pass:** no fee or effect.

Equal effective bids use a public priority order that rotates one seat each lot. The priority seat is shown in the bidding panel. Inactive seats do not delay a phase once all remaining players submit; their missing choices pass. Already locked bids remain binding.

Correct appraisals earn 2 credits. Wrong appraisals lose up to 1 credit, without making the purse negative. Abstaining has no reward or penalty.

## Privacy and recovery

Each device holds a private seat token. All room state requests require it. Only the requesting player receives their allegiance, lead, chosen favor and sealed bid; the public history reveals submitted favors and bids after the lot closes. Allegiances become public only at the final reveal.

Save the private code under **Seat code**. To recover on another device, enter the room, same name and code. Recovery replaces the token and recovery code, invalidating the previous device. The host transfers when leaving. New players can join only before a match; existing seats can recover during play.

## Verification

`npm test` includes the new API match tests. `npm run test:redis` runs both games against a real local Redis bridge. `npm run test:browser` covers routing, legacy invitations, four independent devices playing five auctions, seat reload, mobile layout and keyboard rules access, alongside the existing game regressions.
