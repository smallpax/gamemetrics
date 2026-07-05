# GameMetrics

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

```bash
cd server

# Start TimescaleDB (PostgreSQL 16) on :5432
docker compose up -d

# Install dependencies
npm install

# Configure environment. BETTER_AUTH_SECRET is REQUIRED — the server refuses to
# start without it. Copy the template and set a secret:
cp .env.example .env
export BETTER_AUTH_SECRET=$(openssl rand -base64 32)   # also paste it into .env

# Create tables + hypertable + continuous aggregate
npm run migrate

# Start the dev server → http://localhost:3000
npm run dev
```

Then open **http://localhost:3000**, sign up at `/signup`, and **create a
project** in the portal — that generates the API key you'll give the SDK.

Optional sample data:

```bash
npm run seed         # creates a "Test Game" project and prints an API key (for curl testing)
npm run seed:events  # generates a week of sample events for the first project
npm run seed:auth    # creates a demo login (demo@gamemetrics.dev / demo-password-123)
                     # and, if it owns no projects yet, a demo project + API key
```

> **Note:** `npm run seed:auth` loads the auth module, so it needs
> `BETTER_AUTH_SECRET` set in the environment (the `export` above covers it). It
> creates the demo user and ensures that user owns a "Sample Project" with an API
> key, so the demo login always lands on usable data.

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

Deeper docs live in [`/docs`](./docs) *(being written)*:

- [`architecture.md`](./docs/architecture.md) — the three tiers, data flow, and storage model in detail
- [`sdk.md`](./docs/sdk.md) — SDK integration guide, full API, event/context schema, and lifecycle
- [`api-reference.md`](./docs/api-reference.md) — REST API: ingestion (`/v1/events`, `/v1/events/batch`) and metrics (`/v1/metrics/*`)
- [`design-decisions.md`](./docs/design-decisions.md) — why batched ingestion, TimescaleDB, data-layer authz, and other tradeoffs

## License

[MIT](./LICENSE)
