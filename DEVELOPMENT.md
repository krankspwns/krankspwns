# Working on the game

Use Node 18+ and `npm ci`. Production remains a Vercel static frontend and one
serverless endpoint; no frontend framework or runtime dependencies were added.

## Frontend files

Edit the feature files in `src/`. `src/order.json` preserves the original
initialization order. `npm run build` checks the combined JavaScript syntax and
writes `public/app.js` and `public/styles.css`. These generated files are ignored
by Git; Vercel runs the build before serving `public/`. During development, run
`npm run watch` in a second terminal to rebuild after source edits.

The feature files currently share their original scope through concatenation.
This keeps the extraction incremental and preserves game behavior. Networking,
card controls, audio, effects, translations, settings, and game screens now have
separate source files. `public/index.html` contains only the page shell.

For local play run `npm run build` and `node tools/serve.js`, then open
http://127.0.0.1:3000 in separate browser profiles. The existing `npm run dev`
command uses Vercel's CLI for platform development. Without Redis configuration,
rooms live only in that local process.

## Checks

- `npm test`: build, existing API/rule tests, action replay and recovery tests.
- `npm run test:redis`: starts an isolated local Redis process and tests the real
  Redis commands and Lua scripts through a local REST bridge. Install
  `redis-server`, or set `REDIS_SERVER` to its binary path. Covers concurrent
  moves/joins, duplicate purchases, lost write/recovery responses, room TTL,
  storage failure and timeouts. It does not use a remote database.
- `npx playwright install chromium`, then `npm run test:browser`: desktop/mobile
  full-round play, keyboard controls, modal focus, recovery, response loss,
  stalled polling and stale responses. To use an installed Chromium, set
  `CHROMIUM_PATH` to its path. Playwright starts its own local game server.

GitHub Actions runs all three suites and retains browser traces on failure.
The REST bridge validates Redis behavior locally; it does not simulate Vercel
cold starts, Upstash networking, or a live Ably connection.

## Reliability and recovery

Browser requests have a 10-second deadline, including body reads; Redis calls
have a 3-second deadline. Room mutations use a random request ID shared by every
retry. Receipts are saved atomically with the room via compare-and-set and kept
for two minutes, up to 128 per player. Retries are bounded to three attempts;
non-idempotent seat creation and leaving are not automatically retried.

After an uncertain action the client fetches authoritative state, cancelling
later queued actions that depended on that action. Polling also forces a fresh
read until reconciliation succeeds. Poll requests are coalesced, failed polling
backs off, and Ably subscription tokens renew before expiry.

Each authenticated player can copy their private recovery code from Settings.
On another browser, expand “Recover an existing seat” on the join screen and
enter that code, their current name, and the room code. Names and inactivity no
longer authorize seat takeover. Recovery invalidates the old token and recovery
code. A retry of the same recovery request can retrieve its committed response
for two minutes without rotating the token again. Existing saved sessions still
work and receive their recovery code on their next authenticated state fetch.

Keep the recovery code private. If both browser storage and that code are lost,
the host can remove the old seat and the player can join again with a new seat.
