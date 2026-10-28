# Game languages

Row of Reckoning and Last Train already provide English, Simplified Chinese and Traditional Chinese. Bridge, Hot Joker and The Grand Con use `public/game-i18n.js`, with the same `sct-lang` preference.

The shared layer translates text and accessible labels from local dictionaries. It preserves English originals to switch back, and leaves typed text, player names, card indices and room codes intact. Mark player-written content with `data-no-tr`.

Edit `public/game-i18n-zh.js`. Its exact entries include Grand Con's authored clues; templates handle changing scores and names. `{N0}` preserves a name, `{0}` translates a captured label, and `{#}` preserves a number. Give names and labels different numbered slots.

Generate Traditional Chinese with `OPENCC_PATH=/path/to/opencc-js node tools/game-zht.js` (OpenCC is an optional authoring tool, not a production dependency). Run `node tests/game-languages.js` and the language browser tests. The checks cover clue coverage and numeric facts in both dictionaries.
