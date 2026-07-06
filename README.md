# GameMetrics

📖 **[Live documentation site »](https://smallpax.github.io/gamemetrics/)**

**A mobile-game analytics SDK, backend, and dashboard.** Drop the Android SDK
into a game, and gameplay events flow to a self-hosted server that stores them
in TimescaleDB and visualizes them in a web portal.

## Overview

GameMetrics is a three-tier analytics system: an **Android (Kotlin) SDK** that
collects gameplay events on-device, a **Next.js + TimescaleDB server** that
ingests them over a REST API and serves aggregated metrics, and a **web portal**
that visualizes them. It's general-purpose — any Android game integrates by
adding the SDK and an API key — and multi-tenant: each project has its own API
key, and portal users only see the projects they own.

## Architecture

Three tiers, one direction of data flow:

1. **SDK (`/sdk`)** — the game calls `GameMetrics.trackEvent(...)`. Events are
   persisted locally (Room) and uploaded in batches by a background worker
   (WorkManager), so tracking never blocks the game and survives offline periods
   and process death.
2. **Server (`/server`)** — a Next.js App Router backend exposes the ingestion
   REST API (`/v1/events`, `/v1/events/batch`), authenticated per-project by an
   `x-api-key` header, and writes events to **TimescaleDB** (a PostgreSQL
   hypertable) with a continuous aggregate for fast time-series reads. Separate
   `/v1/metrics/*` endpoints serve aggregated data.
3. **Portal (`/server`, same app)** — a dashboard, behind email/password auth,
   that reads the metrics API and renders overview stats, time-series charts,
   top events, and a real-time live event view.

```
  Android game
  └─ GameMetrics SDK ──(x-api-key, POST /v1/events/batch)──►  Next.js server
                                                                │
                                                          TimescaleDB
                                                                │
  Browser ──(session cookie)──►  Portal (dashboard)  ◄──(/v1/metrics/*)
```

<!-- ARCHITECTURE DIAGRAM HERE -->

## Key features

- **Zero-code setup** — the SDK auto-initializes from an Android
  `ContentProvider` reading `API_KEY` / `PROJECT_ID` manifest meta-data; no
  `Application` subclass or manual `init()` call required.
- **Offline-durable** — events are written to a local Room database before
  upload, so nothing is lost when the device is offline.
- **Batched background flush** — a WorkManager job uploads events (periodically
  every ~15 min, on backgrounding, or on demand) in a single batched request per
  ≤500 events.
- **Auto-collected device context** — device model, OS, app version, screen,
  locale, and network type are attached to every event automatically.
- **Crash-safe upload** — an uncaught-exception handler persists the crash and
  flushes pending events before the process dies, within a hard time budget.
- **Rate-limit aware** — the SDK honors `429 Retry-After` and reschedules.
- **Batched ingestion** — the server ingests up to 500 events per request in one
  DB round-trip; batches are whole-batch-atomic.
- **Real-time live view** — the portal shows events as they arrive.
- **Multi-tenant** — projects each have their own API key; ingestion resolves
  the project from the key.
- **Developer portal with auth** — email/password sessions (Better Auth,
  DB-backed and revocable), with per-user project ownership enforced in the data
  layer.

## Tech stack

**SDK** (`/sdk`) — Kotlin, `minSdk` 24 / `compileSdk` 36, Java 11
- Room `2.7.1` (offline event store)
- WorkManager `2.10.1` (background flush)
- Kotlin Coroutines `1.10.1`, AndroidX Lifecycle `2.9.4`
- Android Gradle Plugin `9.0.1`, KSP `2.1.20-1.0.32`

**Server + portal** (`/server`) — Next.js `15.3` (App Router), React `19`
- TimescaleDB on PostgreSQL 16 (`timescale/timescaledb:latest-pg16`)
- `pg` `8.13` (parameterized queries; no ORM)
- Better Auth `1.6` (email/password, database sessions)
- Tailwind CSS `4`, Recharts `3.9`, TypeScript `5.7`, `tsx`

## Quickstart

### 1. Run the server + portal

Prerequisites: **Docker** (for TimescaleDB) and **Node.js 20+**.

> ⚠️ **Do step 1 first.** `BETTER_AUTH_SECRET` is REQUIRED — both the server and
> `npm run seed:auth` **fail fast** without it. Set it before any `npm run`
> command below.

```bash
cd server

# 1. Configure environment FIRST. Copy the template, then generate a secret and
#    paste it into .env as BETTER_AUTH_SECRET=...
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 2. Start TimescaleDB (PostgreSQL 16) on :5432
docker compose up -d

# 3. Install dependencies
npm install

# 4. Create tables + hypertable + continuous aggregate
npm run migrate

# 5. Load sample data (order matters: project → events → demo owner)
npm run seed && npm run seed:events && npm run seed:auth

# 6. Start the dev server → http://localhost:3000
npm run dev
```

7. Open **http://localhost:3000/login** and sign in with the demo credentials:
   **demo@gamemetrics.dev** / **demo-password-123** — it lands on a project
   pre-populated with a week of sample events. (Or sign up at `/signup` and
   create your own project to get an API key for the SDK.)

The seed scripts run in that order for a reason: `seed` creates the project,
`seed:events` fills it with a week of events, and `seed:auth` creates the demo
login and assigns it that populated project, so the dashboard has data on first
login.

> **Troubleshooting:** if `docker compose up -d` reports port **5432** is already
> allocated, an old container is holding it — run `docker ps`, then
> `docker stop <name> && docker rm <name>` and retry.

Smoke-test ingestion directly (use a key from the portal or `npm run seed`):

```bash
curl -X POST http://localhost:3000/v1/events \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"event_name":"level_complete","user_id":"player_1","params":{"level":3,"score":9500}}'
# → {"ok":true}  (HTTP 201)
```

### 2. Integrate the SDK into an Android game

The SDK is currently a **local Gradle module** (`:gamemetrics`), not yet
published to a Maven repository. To use it, include the module in your project
and depend on it:

```kotlin
// settings.gradle.kts
include(":gamemetrics")

// app/build.gradle.kts
dependencies {
    implementation(project(":gamemetrics"))
}
```

Add your API key and project id as manifest meta-data — the SDK auto-initializes
from these, no code required:

```xml
<!-- app/src/main/AndroidManifest.xml, inside <application> -->
<meta-data android:name="com.gamemetrics.API_KEY"    android:value="YOUR_API_KEY_HERE" />
<meta-data android:name="com.gamemetrics.PROJECT_ID" android:value="your-project-id" />
```

Then track events anywhere in your game:

```kotlin
import com.gamemetrics.GameMetrics

GameMetrics.setUserId("player_1")
GameMetrics.trackEvent("level_complete", mapOf("level" to 3, "score" to 9500))
GameMetrics.trackScreen("main_menu")
GameMetrics.logException(e)
```

Other entry points: `GameMetrics.setUserProperty(key, value)`,
`GameMetrics.flush()`, and manual init if you prefer it over auto-init —
`GameMetrics.init(context, apiKey, projectId)`.

> **Endpoint (dev default):** the SDK ships pointing at
> `http://10.0.2.2:3000/v1/events/batch` — `10.0.2.2` is the Android emulator's
> alias for `localhost` on the host, so it reaches a server running on your dev
> machine. The base URL is currently a compile-time constant in
> `sdk/gamemetrics/.../internal/sink/HttpSink.kt`; change `HOST` there to target
> another server. (A runtime override isn't exposed yet.)

A runnable sample app lives in `sdk/app`.

## Documentation

Deeper docs live in [`/docs`](./docs):

- [`architecture.md`](./docs/architecture.md) — the three tiers, data flow, and storage model in detail
- [`sdk.md`](./docs/sdk.md) — SDK integration guide, full API, event/context schema, and lifecycle
- [`api-reference.md`](./docs/api-reference.md) — REST API: ingestion (`/v1/events`, `/v1/events/batch`) and metrics (`/v1/metrics/*`)
- [`design-decisions.md`](./docs/design-decisions.md) — why batched ingestion, TimescaleDB, data-layer authz, and other tradeoffs

### Documentation site

The `/docs` Markdown is also published as a searchable, dark-themed static site
built with [MkDocs](https://www.mkdocs.org/) + the
[Material](https://squidfunk.github.io/mkdocs-material/) theme, with Mermaid
diagrams rendered inline.

Install the one dependency (Python 3):

```bash
pip install mkdocs-material
```

Then, from the repo root:

```bash
mkdocs serve   # live-reloading local preview at http://127.0.0.1:8000
mkdocs build   # generate the static site into ./site
```

`mkdocs build` writes a fully self-contained `site/` folder. Open
`site/index.html` directly in a browser — `use_directory_urls: false` keeps
links working over `file://`. Everything, including `mermaid.js` (vendored under
`docs/assets/javascripts/`) and the fonts, is bundled locally, so the site —
Mermaid diagrams included — renders completely offline with no CDN or network
access.

## License

[MIT](./LICENSE)
