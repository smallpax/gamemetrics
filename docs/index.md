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

Three tiers, one direction of data flow:

1. **SDK** — the game calls `GameMetrics.trackEvent(...)`. Events are persisted
   locally (Room) and uploaded in batches by a background worker (WorkManager),
   so tracking never blocks the game and survives offline periods and process
   death.
2. **Server** — a Next.js App Router backend exposes the ingestion REST API
   (`/v1/events`, `/v1/events/batch`), authenticated per-project by an
   `x-api-key` header, and writes events to **TimescaleDB** (a PostgreSQL
   hypertable) with a continuous aggregate for fast time-series reads. Separate
   `/v1/metrics/*` endpoints serve aggregated data.
3. **Portal** — a dashboard, behind email/password auth, that reads the metrics
   API and renders overview stats, time-series charts, top events, and a
   real-time live event view.

## Where to go next

- [**Architecture**](architecture.md) — the three tiers, data flow, and storage
  model in detail.
- [**SDK Reference**](sdk.md) — SDK integration guide, full API, event/context
  schema, and lifecycle.
- [**API Reference**](api-reference.md) — REST API: ingestion (`/v1/events`,
  `/v1/events/batch`) and metrics (`/v1/metrics/*`).
- [**Design Decisions**](design-decisions.md) — why batched ingestion,
  TimescaleDB, data-layer authz, and other tradeoffs.

## Key features

- **Zero-code setup** — the SDK auto-initializes from an Android
  `ContentProvider` reading `API_KEY` / `PROJECT_ID` manifest meta-data.
- **Offline-durable** — events are written to a local Room database before
  upload, so nothing is lost when the device is offline.
- **Batched background flush** — a WorkManager job uploads events in a single
  batched request per ≤500 events.
- **Real-time live view** — the portal shows events as they arrive.
- **Multi-tenant** — projects each have their own API key; ingestion resolves
  the project from the key.

For build/run instructions and the Quickstart, see the
[project README](https://github.com/) in the repository root.
