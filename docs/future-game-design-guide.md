# The Game Room: a guide for future games

Derived from Crown Clash, Last Train, the code in this repository, and the owner's repeated playtest feedback. Treat explicit preferences as requirements; treat inferred patterns as starting points to validate with people. A passing test cannot establish that a party game is fun.

## The experience to aim for

**A game friends understand quickly, argue about willingly, and remember because of what someone did.** Phones support the table: they give private information, resolve choices fairly and put on the reveal. A clear theme makes the rules easier to understand.

| Pattern | Evidence | Requirement for a new game |
| --- | --- | --- |
| Clear stakes, visible consequence | Row's attack multipliers and drink consequences; Last Train's opposing teams and votes | Explain the goal in one sentence. Each main action must visibly change the situation. |
| People create the drama | Calling attacks, choosing targets, lying about private roles and findings | Information should produce a question, accusation, bargain or risky decision. A solitary puzzle with an audience is insufficient. |
| Easy language | Earlier Grand Con feedback about pigment reports, appraisal/bidding and clock terminology | Use everyday verbs and short sentences. Teach any specialist fact inside the clue. Avoid needing cultural, US-specific or subject knowledge. |
| Beautiful, believable setting | Requests for first-person cabins, seated humans, richer colors and role portraits | Use a coherent environment, expressive human character art and consistent light. For Grand Con the preferred direction is cartoon people with realistic collectible objects and trophies. Compose art and controls separately so panels do not cover the scene. |
| A satisfying moment of impact | Original Eagle felt stronger than simplified replacements; requests for a multiplier, pause and shake | Build anticipation → action → impact → readable outcome. Motion must strengthen an actual event, not merely zoom an illustration. |
| Comfortable phone play | Reports of cramped columns, visible popup scrollbars, unexpected zoom and abrupt anchors | Test at 320px as well as desktop. Use 16px text in mobile inputs. Keep pinch zoom available. Avoid horizontal scrolling and moving the page on routine polls. |
| Private information stays usable | Hideable role card, reports, teammates, notes and letters | Provide an easy-to-hide private card. Keep teammates and spent powers easy to find. Never show a private result publicly. |
| Nobody gets a useless seat | Passengers need night activities; Grand Con players need more than one repeated sentence | Every seat needs relevant information or meaningful agency. Design for maximum player count, not only four players. |
| Controls have a language | Matching slate-blue host actions; shiny gold Start/Another Journey tickets | Give host-only progression actions one consistent treatment. Differentiate choice, confirmation, danger and optional tools. Do not make every button gold. |
| The outcome deserves attention | Grouped votes, elimination staging, winners' portraits, Hall of Fame framing | Show who chose what and why the result happened. Celebrate the people involved. Keep a readable, grouped history. |

## Gameplay requirements

1. **One core loop and one understandable win condition.** Make a useful first choice within a minute. Additional roles should create new decisions, not introduce several competing currencies and score systems.
2. **Information should connect.** Give different people useful facts that can be compared. Do not distribute identical clues or generic filler at larger tables. Include a concrete question that turns each clue into conversation.
3. **Agency needs a tradeoff.** A once-per-game check, a limited heal or a protection decision is useful because choosing when and whom matters. Avoid optional choices that never affect the result.
4. **Time should fit the group.** Short, predictable action windows; enough discussion time for the actual player count; clear phase names and countdowns. Settings should control meaningful differences such as pace or speaking mode.
5. **Handle downtime intentionally.** Offer a private, relevant activity. When phone activity can identify a secret role, everyone needs the same time window and an activity. Never advance a hidden-role phase merely because its owner finished.
6. **Keep the table together.** Prefer no elimination unless elimination is central to the game. If someone is out, retain an appropriate way to follow the story without leaking private information to the living.
7. **Replay comes from fresh situations.** Shuffle teams, seats and content independently. Add authored situations with different facts, not just new names on the same solution. Repeated role assignments may happen; randomness must not quietly favor the host.
8. **Learn from the reveal.** Explain the decisive facts, expose the manipulated clue, and let players compare earlier statements. Reveal only information the rules promise at that stage.

## Visual and interaction requirements

- Use the same self-hosted Inter family and deliberate size/weight hierarchy as the finished games. Large titles, readable body copy, restrained uppercase labels.
- Choose a distinctive palette within the collection: deep backgrounds, warm metallic accents, and purposeful team/action colors. Luxury comes from composition, spacing, lighting and art, not a border on every nested box.
- Give each game its own setting and cast. Public appearance must not depend on secret allegiance. Secret role art belongs inside private cards or the role guide.
- Stage opening, phase transitions and results. Prefer a short in-place reveal to an unavoidable modal. Support reduced motion, pause where relevant, and never replay an animation on every poll.
- Put controls below or beside the main art. Keep private drawers collapsed by default, with their close action reachable. Modal dialogs need names, keyboard dismissal and predictable focus return.
- Group votes by choice or target; group history and conversation by round. Keep names and long numbers from colliding. Test long names, 12-player rooms and narrow phones.
- Preserve drafts, focus, selection and open accordions across updates. Only move focus/scroll for a clear user action or a new essential result. Never steal focus while someone types.
- Use sound to support events, within browser and device policies. No overlapping loops. Loading or denied audio must never stall the game.

## Technical baseline

Server-authoritative decisions, authenticated private views, sealed votes, bounded text, match/round checks, idempotent mutations, atomic room updates, recovery, host transfer, timeout fallback and separate game namespaces. Keep public history free of hidden team/role data until the intended reveal. Do not weaken these for test bots or demos.

## Before calling a game ready

- A new player can state their goal and next action without a verbal explanation from the developer.
- Four players and twelve players each have useful material and enough time to contribute.
- A player can explain why their last choice mattered; reveals explain surprises.
- A full phone-to-API match, reload/recovery, timeout, stale action and private-data isolation checks pass.
- Mobile screenshots are reviewed at 320px and 390px; desktop at 1100px or wider. Test drawers, long names, input focus, grouped votes and final results.
- Human playtesting establishes whether people actually debate, bluff and want another round. Track dominant strategies, idle seats, repetitive content and time spent waiting.

## Applying this to The Grand Con

The owner subsequently approved a separate live museum heist remake, inspired by Among Us, with movement, short mini-games, Staff and Thieves, reports and voting. Preserve the clue game at `/grand-con.html` as **Grand Con: Gallery (Review)**; the remake uses `/grand-heist.html` and separate seats. Keep the remake marked **Playtest** until real group tests confirm pacing and balance. See [the museum playtest rules](grand-heist.md).

For the classic Gallery game, keep its distinct promise: nobody is eliminated, each player holds a clue, one clue is changed, and the table votes REAL or FAKE. Improve the parts that prevent that promise from working: generic extra clues, too little time for larger groups, no durable record of claims, no limited decision beyond the final vote, and a flat presentation. Use a luxury private-gallery setting, a new human cast, actual illustrated lots, a hideable private card, a public claims board, one private original-clue check per player per match, and a reveal that compares claims with the true evidence. Keep the score as first team to three; introduce no bidding economy or extra win condition.

## Production and cost preferences

Prefer self-hosted artwork, fonts, audio and approved video. Core play should not require friends to create accounts, install an app, or buy access. Avoid a new paid service or external account merely to deliver an effect the project can host itself. Keep large art out of frequently polled JSON; reuse cached assets and make loading failures harmless. Voice permission should be requested only when a player chooses to record, with typing or in-person play still usable.

A preview must be real and reviewable: show an actual screenshot, playable page or produced clip. Do not describe a finished video without attaching a working artifact. Verify the exact commit and deployment state before saying a release is live. Keep a game marked REVIEW until human playtests support promoting it.

**Grand Con art refinement:** The owner prefers cartoon avatars over realistic human portraits, while retaining the realistic crown and giving the trophy the same detailed material quality. Do not infer that cartoon characters require flat icon-style objects, or automatically restyle the other finished games.
