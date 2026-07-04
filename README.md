# GameMetrics

A small, self-hosted analytics stack for mobile games: an Android SDK that
batches and ships gameplay events, and a Next.js + TimescaleDB server that
ingests them and serves a dashboard portal.

This is a monorepo with two independent projects:

| Path | What | Stack |
|------|------|-------|
| [`/sdk`](./sdk) | Android SDK + a sample app that demonstrates it | Kotlin, Gradle |
| [`/server`](./server) | Event ingestion API, metrics API, and dashboard portal | Next.js (App Router), TimescaleDB, Better Auth |

## Architecture at a glance

```
  ┌─────────────┐   x-api-key    ┌──────────────────────┐
  │  Android    │  POST /v1/events(/batch)               │
  │  SDK (/sdk) │ ─────────────► │  Server (/server)      │
  └─────────────┘                │  • ingestion API        │
                                 │  • metrics API          │
  ┌─────────────┐   session cookie│  • dashboard portal     │
  │  Browser    │ ─────────────► │    (email/password auth)│
  └─────────────┘                └──────────┬─────────────┘
                                            │
                                    TimescaleDB (Postgres)
```

Two separate auth systems, kept separate:
- **Ingestion** (`/v1/*`) authenticates with an **`x-api-key`** — used by games/SDKs.
- **Portal** (dashboard UI) uses **email/password sessions** — used by humans.

## Getting an API key

1. Start the server (see [`/server/README.md`](./server/README.md)): bring up
   TimescaleDB, run the migration, and start Next.js.
2. Sign up in the portal, create a project — it generates an API key.
3. Put that key in the sample app's manifest
   (`sdk/app/src/main/AndroidManifest.xml`, the `com.gamemetrics.API_KEY`
   meta-data), replacing `YOUR_API_KEY_HERE`. **Don't commit a real key.**

By default the SDK targets `http://10.0.2.2:3000` — the Android emulator's alias
for `localhost` on the host machine — so it reaches a server running on your dev
box. Change the host for a real deployment.

## Local development

- **Server:** [`server/README.md`](./server/README.md). Requires a
  `BETTER_AUTH_SECRET` (see `server/.env.example`); the server refuses to start
  without one.
- **SDK:** open [`/sdk`](./sdk) in Android Studio, or build the sample with
  `./gradlew :app:assembleDebug`.

## License

[MIT](./LICENSE)
