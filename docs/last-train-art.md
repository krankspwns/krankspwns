# Last Train visual assets

All artwork and Inter are self-hosted. There are no runtime image or font provider calls. Public appearance is independent of secret role, and survives recovery, promotion, seat shuffles and new games.

- `passengers.webp`: twelve public portraits, four columns × three rows, 1448 × 1086. The fictional cast is Chinese, Thai and Vietnamese, with varied ages and distinct clothing.
- `seated.webp`: matching public characters, each physically drawn on a velvet sofa seat. Person and cushion are one sprite, so responsive scaling cannot detach them. The atlas is four columns × three rows. The renderer uses measured row boundaries per column plus a narrow clip at the crown to exclude adjoining sprite pixels. The previous separate sofa layer is no longer used.
- `patients.webp`: matching unconscious characters, without injuries or gore, on transparency. Each character is a horizontal sprite. Art regions are 362 × 160 at x = column × 362, y = 236 / 464 / 694. These measured bands account for the generous vertical spacing in the source image; they are not square portrait cells.
- `cabin.webp`, `cabin-mobile.webp`: hand-free first-person private cabin views.
- `cabin-floor.webp`: empty cabin wall and carpet, behind the seated Saboteur team or the Medic’s patient. There is no second sofa underneath a character’s integrated seat.
- `lounge.webp`: empty observation salon; the public seat sprites appear in fixed speaking order, left to right then onto the next row (six across on larger screens, four on phones).
- `platform.webp`: departure scene, introduction backdrop and elimination backdrop.
- `roles.webp`: private role illustrations and the public role catalog. Role indices remain Passenger 0, Careful 1, Brave 2, Witness 3, Speaker 4, Inspector 5, Medic 6, Trainee 7, Saboteur 8, Blocker 9. The two spare cells are unused.

Public portrait indices, left to right and top to bottom, use these identifying outfits: jade blouse / navy suit / burgundy blouse / camel blazer and glasses; blue coat / silver beard and wine jacket / ivory shirt and navy cardigan / violet blouse; emerald coat / magenta blouse / teal jacket / silver bob and red coat. The same index chooses portraits, seated bodies and patient bodies. Living players’ secret roles never choose their public appearance. Revealed out players remain as faded figures, with a red cross on their seat number and a green GOOD or red BAD label.

The Medic’s patient layer is rendered only during the living, unblocked Medic’s turn, using `me.patientId` already provided by the private API view. Other phones receive no patient identity. A heal changes the label to HEAL GIVEN; it does not promise survival, since protection plus healing can still cause overdose.

The cabin places power controls over the scenery with local contrast and no opaque outer panel. The private role drawer is hosted in a dedicated fixed layer sized to the visual viewport. It opens by tap, drag, touch swipe or keyboard. Closed content is invisible, inert and excluded from the accessibility tree. It collapses on phase/active-role changes, remains stable on polls and does not inherit scene animations. Inter is distributed under the included SIL Open Font License in `public/fonts/Inter-OFL.txt`.

Vote results have an original train-themed cinematic: a passenger ticket enters, is punched and stamped CANCELLED, then reveals the removed player’s alignment while station lights pass. It uses the public portrait, not the hidden role illustration. It lasts 4.8 seconds within the existing 12-second result phase, pauses with the room, can be skipped with View votes/Escape, does not replay on polling/reload, and is omitted when no one is removed. Reduced motion gives a static result. The illustrated vote record is three columns on larger screens and two on phones, with avatars, names, Skip and double-vote labels.

Use viewport screenshots when showing fixed overlays. Full-page screenshots include a viewport-fixed drawer at the capture viewport’s location inside the long image; they do not show where it would remain while a person scrolls.
