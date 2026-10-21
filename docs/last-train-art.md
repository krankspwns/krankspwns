# Last Train character and environment art

All game artwork is served locally from `public/last-train/`. Images are compressed WebP assets; no remote art provider is called at runtime.

- `cabin.webp`: wide, hand-free first-person cabin facing an empty opposite sofa.
- `cabin-mobile.webp`: portrait composition of the same hand-free cabin, selected with a picture/source media query.
- `lounge.webp`: the empty observation salon and raised rear floor, behind the composited sofas.
- `seated.webp`: transparent 4-column × 3-row atlas of the same 12 public characters, seated head to shoes.
- `banquette.webp`: transparent six-seat velvet sofa, behind the meeting-room character layer.
- `platform.webp`: boarding scene and game-selector thumbnail.
- `roles.webp`: 4-column × 3-row role-portrait atlas, 1448 × 1086 pixels.
- `passengers.webp`: 4-column × 3-row neutral human-portrait atlas, 1448 × 1086 pixels.

The role, passenger and seated atlas cells are square, 362 × 362 pixels. CSS uses `background-size: 400% 300%`; column positions are 0%, 33.333%, 66.667%, 100%, and row positions are 0%, 50%, 100%. There is no per-frame image editing or runtime canvas dependency.

Role atlas indices, left to right, top to bottom:

| Index | Character |
| --- | --- |
| 0 | Passenger, cream travelling coat and ticket |
| 1 | Careful Passenger, navy high collar and brass padlock |
| 2 | Brave Passenger, green coat and shield pin |
| 3 | Witness, silver hair, glasses and notebook |
| 4 | Speaker, wine-red waistcoat and microphone |
| 5 | Inspector, railway investigator uniform and cap |
| 6 | Medic, ivory-and-teal coat and medicine vial |
| 7 | Trainee, navy uniform and single-star badge |
| 8 | Saboteur, dark coat and crimson gloves |
| 9 | Blocker, violet coat and electrical device |
| 10–11 | Spare civilian characters, unused by role mapping |

Role-specific portraits appear in the public role introduction, the owner's private ticket/actions, eliminated-role reveals and the final role list. A living unknown player's actual role must never choose their public portrait.

Each player receives an independent, unused civilian `avatarIndex` from 0–11 when joining. It stays unchanged on role deals, seat shuffles, promotion and recovery. Public seating, patient targets, target manifests and chat always use that neutral portrait. Old local seats fall back to their original player-array position. This keeps portraits unique in a new 12-player room without disclosing roles.

The cabin omits an external avatar of its owner to preserve first-person perspective. The bottom ticket represents the owner. In a shared Saboteur cabin, only the other living teammates are shown opposite the viewer; each teammate uses their distinct public civilian appearance, matching the lounge and target list.

The palette draws on Row of Reckoning's midnight blue and warm gold, with violet upholstery in the artwork, green healing actions and red attack/poison actions. Host controls retain the slate-blue treatment.

The lounge lays out permanent seat order left to right, then onto the next sofa: six seats per row on larger screens, four on phones. Eliminated players leave an empty seat. Character and sofa layers are transparent; their placement never uses a living player’s secret role.

Inter is self-hosted as `public/fonts/inter-variable.woff2` under the included SIL Open Font License. Weight 800 headings, weight 600 controls, warm gold primary buttons and slate-blue host buttons follow Row of Reckoning’s styling.

The private role drawer sits outside the regularly refreshed scene tree. Tap, drag or swipe its bottom handle to open/close; Enter/Space toggle, Up opens, Down/Escape close. Closed content is invisible, inert and excluded from the accessibility tree. Room polls and power updates preserve the handle node, gesture, open state and CSS slide. Reduced motion disables the slide.
