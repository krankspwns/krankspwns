# Accounts, WP and the shared shop

## What players get
- **Sign in with Google or Apple** (optional). Signed-in WP, avatars, borders, accessories and gifts follow the account to every game.
- **Guests** can play everything. A guest earns and spends WP inside a room only; it disappears when they leave the room, the room expires, or they switch game.
- **WP** is earned by finishing in the top places of a game with at least two people (bots earn nothing, and a table of one person plus bots pays nothing). Rewards use `placeWpFor` in `lib/catalog.js`; signed-in earnings are capped at 400 WP a day (SGT).
- **Reactions, gifts, avatars and borders** work in all five games. Bridge, Hot Joker and Grand Con use the shared dock from `public/platform.js`; Reckoning and Last Train keep their own screens but use the same account wallet.
- **Sound:** Bridge, Hot Joker and Grand Con each have their own effects and looping music (`public/game-audio.js`, no files to download). Reckoning and Last Train keep their own audio.

## Setup (Vercel environment variables)
| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth web client ID (Google Cloud console). Authorised JavaScript origin = your site. |
| `APPLE_CLIENT_ID` | Apple Services ID. Register the site domain and return URL `https://<site>/` in Apple Developer. |
| `ACCOUNT_PEPPER` | Long random secret used to hash provider user ids. **Required in production** (sign-in stays off without it). Never change it, or existing accounts cannot be found. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Already used for rooms; accounts are stored here too. |

Before launch fill in the organisation name and DPO email in `public/privacy.html` (marked `[to be added]`).

## Security
- ID tokens are verified server-side (signature via the provider's JWKS, issuer, audience, expiry) with a one-time server nonce.
- Sessions: random 256-bit token, stored hashed, `HttpOnly; SameSite=Strict; Secure` (`__Host-` prefix on HTTPS), 14-day idle / 30-day absolute expiry, "sign out everywhere".
- State-changing requests need a custom header plus a same-origin check. Sign-in attempts and nonces are rate limited.
- Purchases are idempotent per request id, and server-checked (price, ownership). WP from play is capped per day.

## PDPA
- No name, email or photo is stored; the provider id is kept only as an HMAC hash.
- Explicit consent + 13+ confirmation before an account is created; consent version and time are recorded (`CONSENT_VERSION` in `lib/platform.js`; bump it to re-ask).
- Access/portability: Account → Download my data. Withdrawal/erasure: Account → Delete my account.
- Cross-border transfers (Vercel, Upstash, Google/Apple) are disclosed in the Privacy Notice.
- **Still to do outside the code:** appoint a DPO, add their contact, a data-breach response plan (PDPC notification), and a scheduled job to delete accounts inactive for 12 months (`last` is stored on each account). Have counsel review the notice.

## Code map
`lib/catalog.js` prices and wallet rules · `lib/kv.js` storage · `lib/platform.js` accounts · `api/platform.js` endpoint · `lib/table-social.js` per-room wallet, emotes, gifts, awards · `tests/platform.js`.

