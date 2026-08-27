# ♞ Chess

A modern, mobile-friendly two-player online chess game built with **Next.js (App Router)**.
Two people log in with a shared password, each claim a color from their own device, and
play in near-real-time. Game state is persisted server-side so it survives refreshes,
new devices, and Vercel's stateless serverless functions.

## Features

- Full chess rules (castling, en passant, promotion, check/checkmate/stalemate/draw) via `chess.js`, validated **server-side** so no illegal moves are possible.
- Two-device online play with light polling for live sync.
- Clean dark UI: legal-move hints, last-move + check highlights, captured-piece trays, move list, promotion picker.
- Fully responsive — board scales to the viewport, panels stack on mobile, touch-friendly tap targets.
- Single shared password gate (hardcoded in env), signed httpOnly auth cookie.
- Pluggable persistence — **Vercel Edge Config**, **Vercel KV / Upstash Redis**, or an automatic in-memory fallback for local dev. The backend is auto-detected from env vars.

## Getting started (local)

```bash
npm install
cp .env.example .env.local   # then edit the values
npm run dev
```

Open http://localhost:3000. A `.env.local` with a dev password is already included
(`GAME_PASSWORD=letmein`). With no Redis credentials set, the app uses in-memory storage —
perfect for local testing (state resets when the dev server restarts).

To play a real 2-player game locally, open the app in two different browsers (or one normal
+ one private window) so each has its own identity, then claim opposite colors.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `GAME_PASSWORD` | The single shared password both players type to enter. |
| `SESSION_SECRET` | Long random string used to sign the auth cookie. |
| **Edge Config** | |
| `EDGE_CONFIG` | Read connection string, auto-injected when you connect an Edge Config store. Read-only. |
| `VERCEL_API_TOKEN` | Vercel API token (Account → Settings → Tokens) — **required for writes**, since Edge Config writes go through the Vercel REST API. |
| `VERCEL_TEAM_ID` | Only if the Edge Config store belongs to a Vercel team. |
| **or Redis / KV** | |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Redis REST credentials (Vercel KV). `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` also work. |

The backend is chosen automatically: Edge Config if `EDGE_CONFIG` is present, else Redis if the KV/Upstash vars are present, else in-memory.

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Deploy to Vercel

1. Push this folder to a Git repo and **Import** it in Vercel.
2. Pick a persistence store:
   - **Edge Config (this project's setup):** Vercel dashboard → **Storage** → create an
     **Edge Config** store and connect it to the project (this injects `EDGE_CONFIG`).
     Then create a **Vercel API token** (Account → Settings → Tokens) and add it as
     `VERCEL_API_TOKEN` so the app can write moves. Add `VERCEL_TEAM_ID` too if the store
     lives under a team.
   - **or Redis/KV:** create an **Upstash Redis** database and connect it (injects
     `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
   > Without any store the app still runs, but in-memory state resets on cold start —
   > fine for a demo, not for real games.
3. Add `GAME_PASSWORD` and `SESSION_SECRET` under **Settings → Environment Variables**.
4. Deploy. Share the URL and password with your opponent.

> **Edge Config notes:** it's read-optimized (ideal for the polling reads) and writes are
> rate-limited, but a turn-based game only writes on a move / seat claim / reset, so the
> write volume is tiny. Writes propagate globally within a second or two, so an opponent
> sees your move on their next poll.

## How it works

- `middleware.ts` gates `/` and `/api/game` behind the signed auth cookie.
- `lib/game.ts` holds the single source of truth. Every move is re-validated against the
  stored FEN with `chess.js`; the server enforces turn order and seat ownership.
- Each browser gets a stable `chess_client` id used to bind it to the White or Black seat.
- The client polls `GET /api/game` every 1.5s and re-renders on change.
- **New game** resets the board while keeping both players in their seats.

### Seat model note

A seat is bound to the browser that claimed it (via an httpOnly cookie). If a player clears
their cookies they'll rejoin as a spectator; use **New game** or clear the Redis key
(`chess:game:main`) to free the seats.
