# Live-session relay

The relay that lets two friends write one page together, at **relay.thoughtdesk.org**. It's a Cloudflare Worker with one Durable Object per session. The Durable Object passes both people's edits and cursors between them (Yjs over a WebSocket).

- **It keeps nothing.** When everyone has left, the room is gone. Each person's app keeps the session's state locally, so reconnecting, or restarting mid-session, loses nothing.
- **It's only held open while someone writes.** A room is paid for every second someone is connected, so the app lets go after 10 minutes with no writing and nobody at the page. It reconnects when its person comes back, or when the other one writes or comes back: their app wakes it with an empty broadcast on Supabase Realtime (`nudges` in `src/lib/cloud/`).
- **Only the two people in an active session get in** (`src/auth.ts`):
  1. The app sends the person's Supabase access token as the WebSocket's second subprotocol (`Sec-WebSocket-Protocol: thoughtdesk, <token>`), never in the address, so it stays out of URLs and their logs. The relay answers with `thoughtdesk`.
  2. The relay checks the token against the project's public signing keys (ES256, via `jose`). No secret is needed.
  3. It asks Supabase whether that session is active, **using that person's own token**. Row-level security returns the session only to its two people, so the database makes the decision.
- **It keeps asking.** Every minute, a room checks again with each person's token: an expired sign-in closes that person's connection (the app reconnects with a fresh one), and a session that has ended, or two people who are no longer friends, closes the room.
- **Limits:** a message may be up to 4 MB (a long page pasted at once fits), and one person may have up to 3 connections in a room (the app needs one). Who's connecting reaches the room from the Worker alone, never from the client.
- **Rooms are session IDs** (UUIDs from `cowork_sessions`). Any other path gets a 404.

## Run it

```bash
cd server
npm install
npm run dev          # ws://localhost:8787, with real sign-in checks (needs internet)
npm test             # the sign-in checks: tokens, sessions, test mode
npm run check        # type-checks the Worker
```

The interface tests start the relay themselves with `npm run test-relay`: port 8788, with `AUTH_MODE=test`, which accepts the fake cloud's `test.<user id>` tokens. Test mode works only for requests from this computer (`CF-Connecting-IP` is a loopback address, which Cloudflare never lets an outside request claim), whatever the setting says.

## Deploy it

You need a free Cloudflare account. Durable Objects that store data in SQLite are on the free plan, and this one doesn't even store anything.

```bash
cd server
npx wrangler login     # once: approve in the browser
npm run deploy         # relay.thoughtdesk.org
```

`wrangler.jsonc` puts it on relay.thoughtdesk.org (a custom domain on the same Cloudflare account) and nowhere else (`workers_dev: false`). The app connects there unless `VITE_COWORK_URL` says otherwise at build time, and its content security policy (`src-tauri/tauri.conf.json`, `connect-src`) allows only `wss://relay.thoughtdesk.org`. The Supabase project's address and publishable key are in `wrangler.jsonc` (`vars`); both are public by design.
