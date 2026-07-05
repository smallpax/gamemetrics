# GameMetrics

Mobile-game analytics SDK backend — Day 1 foundation.

## Prerequisites

- Node.js 20+
- Docker & Docker Compose

## Setup

```bash
# Start TimescaleDB
docker compose up -d

# Install dependencies
npm install

# Configure environment. BETTER_AUTH_SECRET is REQUIRED — the server (and any
# script that loads the auth module, e.g. seed:auth) refuses to start without it.
cp .env.example .env
export BETTER_AUTH_SECRET=$(openssl rand -base64 32)   # also paste into .env

# Run migration (creates tables + hypertable + continuous aggregate)
npm run migrate

# Seed test project & API key
npm run seed

# Seed a demo portal user and assign the demo projects to it (prints login)
npm run seed:auth

# Start the dev server
npm run dev
```

## Test the ingestion endpoint

Replace `YOUR_API_KEY` with the key printed by the seed script:

```bash
curl -X POST http://localhost:3000/v1/events \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"event_name":"level_complete","user_id":"player_1","session_id":"abc123","params":{"level":3,"score":9500}}'
```

Expected response: `{"ok":true}` with HTTP 201.

## Batch ingestion

`POST /v1/events/batch` ingests many events in one request (and one DB
round-trip). Same auth (`x-api-key`) and same per-event shape as `/v1/events`.

```bash
curl -X POST http://localhost:3000/v1/events/batch \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"events":[
    {"event_name":"level_start","user_id":"p1","params":{"level":3}},
    {"event_name":"level_complete","user_id":"p1","params":{"level":3,"score":9500}}
  ]}'
```

Expected response: `{"inserted":2}` with HTTP 201.

Validity is **whole-batch-atomic**: if any event is malformed the entire batch
is rejected (`400`) and nothing is written, so a `201` guarantees every event
was stored. Limits: 1–500 events per batch (`413` if exceeded, `400` if empty),
2 MB body cap, `event_name` ≤ 128 chars, `params` ≤ 8 KB.

## Rate limiting

Both ingestion endpoints are rate limited per API key (default 100 requests /
60 s, override with `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`). Over the limit
returns `429` with a `Retry-After` header. State is in-memory — correct for a
single instance; a multi-instance deployment would need a shared store (Redis).

## Portal accounts & authentication

The dashboard UI uses email/password auth via [Better Auth](https://better-auth.com),
with **database-backed (revocable) sessions** and `httpOnly` + `secure`(prod) +
`sameSite=lax` cookies. This is completely separate from ingestion: `/v1/*`
endpoints authenticate only via `x-api-key` and never use sessions.

- Pages: `/signup`, `/login`, and sign-out from the header.
- Projects belong to users (`projects.owner_id`). The list shows only your
  projects, and every `/projects/[id]` route verifies ownership in the server
  data layer (`requireOwnedProject`) — non-owned/missing projects return **404**.
- Authorization is enforced in the server components / data layer, **not** in
  middleware alone (middleware gates are bypassable — CVE-2025-29927). The
  middleware only does an optimistic redirect for unauthenticated users.
- The login endpoint is rate-limited per IP (default 5 / 60s) → **429** with
  `Retry-After`.

`BETTER_AUTH_SECRET` is **required** — there is no fallback, so a misconfigured
deployment fails fast instead of running on a known default. Set it in the
environment (see `.env.example`); optionally set `BETTER_AUTH_URL`.

> Note: the ownership gate lives in each `/projects/[id]` route's
> `generateMetadata` (which resolves before the streamed response is flushed) so
> unauthorized access returns a true 404 status. A route-level `loading.tsx`
> above these pages would flush a 200 shell first, so those pages intentionally
> rely on their in-page `<Suspense>` skeletons instead. The correct 404 status
> is observable in a production build (`npm run build && npm start`); Next's dev
> server always renders `notFound()` as 200, though the access control is
> identical in both.

## Verify in the database

```bash
docker compose exec db psql -U gamemetrics -c "SELECT * FROM events;"
```
