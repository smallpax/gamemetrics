# GameMetrics — Design Decisions

This document records the key design decisions behind GameMetrics and the
reasoning for each: the choice made, the problem it solves, the main alternative
considered, and why this option won. It is the "why we chose this" companion to
[architecture.md](./architecture.md) (which covers *how* the system works) — so
where a decision has mechanics, this doc links there rather than repeating them.

A framing note that runs through several of these: this is a project whose point
is to **design and justify an analytics pipeline**, so decisions deliberately
favor understanding and control of the storage/retrieval/ingestion path over
shipping-fastest. Where that tradeoff is real, it is called out honestly.

---

## Build the backend instead of using a BaaS (Firebase / Supabase)

**Choice.** Implement the ingestion API, storage schema, and metrics API
ourselves on Postgres/TimescaleDB, rather than adopting a Backend-as-a-Service
(Firebase Analytics, Supabase, Amplitude, etc.).

**Problem.** A game needs somewhere to send events and something that turns them
into charts. A BaaS solves exactly that, often in an afternoon.

**Alternative.** Use Firebase Analytics or Supabase: managed ingestion, managed
storage, managed dashboards, autoscaling, no ops.

**Why build.** The entire subject of this project *is* the pipeline — how events
are stored, why they're partitioned that way, when to read a pre-aggregate versus
raw rows, how ingestion stays cheap and atomic. A BaaS is valuable precisely
because it **hides** those decisions; adopting one would hide the thing being
designed and justified. Building it also buys real properties that matter beyond
the exercise: **data ownership** (events live in a database we control, not a
third party's), **portability** (plain Postgres + SQL, no proprietary lock-in),
and **control** over the efficiency choices (chunking, continuous aggregates,
batch ingestion) that a managed product would make for us.

**Honest tradeoff.** For a team whose goal is to *ship a game*, a BaaS is the
right call — it is faster, operationally free, and battle-tested. Self-hosting
means we own scaling, backups, and uptime. This project accepts that cost on
purpose because the learning and control are the deliverable; it is not a claim
that everyone should hand-roll analytics.

---

## TimescaleDB with a hypertable and a continuous aggregate

**Choice.** Store events in a TimescaleDB **hypertable** partitioned on time, and
maintain a **continuous aggregate** (`event_counts_hourly`) for chart/count reads.

**Problem.** The workload is append-heavy and time-ordered on write, and almost
always "aggregate over a time window for one project" on read. A plain table
makes every windowed read scan history, and recomputes counts that never change.

**Alternative.** A vanilla Postgres table with indexes; or a separate OLAP store
(ClickHouse, BigQuery); or rolling our own summary tables with cron jobs.

**Why this won.** The hypertable keeps it *plain Postgres* (same `pg` driver,
same SQL, no second datastore to operate) while adding exactly the time-series
primitives this workload needs: time-partitioned chunks give **chunk exclusion**
so a range query touches only the overlapping chunks, and the continuous
aggregate **pre-rolls** hourly counts so a chart reads a handful of rows instead
of scanning thousands — with real-time aggregation keeping it fresh. A dedicated
OLAP store would be more power than a single-tenant-per-key dashboard needs and
another system to run; hand-rolled summary tables would reinvent, less correctly,
what continuous aggregates already do.

See [architecture.md §3](./architecture.md#3-storage-strategy-and-why) for the
mechanics and [§4](./architecture.md#4-retrieval-strategy-and-why) for the
aggregate-vs-raw read decision.

---

## ContentProvider auto-initialization (vs. requiring `init()`)

**Choice.** The SDK initializes itself at process start via a manifest-declared
`ContentProvider`, reading credentials from `<meta-data>` — no app code required.
A manual `GameMetrics.init(...)` and an `AUTO_INIT=false` opt-out remain.

**Problem.** Every required integration step is a step a developer can get wrong
or forget. Requiring an `Application` subclass and an `init()` call in
`onCreate()` is friction, and misordering it (tracking before init) is a common
bug.

**Alternative.** Require the host app to call `GameMetrics.init(context, key,
projectId)` in a custom `Application.onCreate()`.

**Why this won.** Android runs every installed `ContentProvider`'s `onCreate()`
after the `Application` is constructed but **before** `Application.onCreate()`, so
a provider is a reliable, app-code-free hook that guarantees the SDK is ready
before the first Activity exists. That turns integration into "add two meta-data
lines" with zero initialization code and no ordering hazard. This is the same
mechanism Firebase used (`FirebaseInitProvider`); the **modern equivalent is
AndroidX App Startup**, which formalizes the pattern and lets multiple libraries
share a single provider. We keep manual `init()` for the cases auto-init can't
serve (runtime credentials, or opting out).

See [sdk.md § Auto-initialization](./sdk.md#auto-initialization).

**Tradeoff.** A hidden provider is slightly less obvious than an explicit call,
and it costs a small fixed amount of startup work; the `AUTO_INIT=false` flag
exists so an app that wants full control can take it.

---

## Instance core behind a static facade

**Choice.** Public API is a static `object GameMetrics` (`trackEvent`,
`setUserId`, …) that delegates to a single internal instance,
`GameMetricsClient`, which holds all state (session id, user id, buffer,
scheduling, crash handler).

**Problem.** Two competing goals. Callers want the ergonomics of
`GameMetrics.trackEvent(...)` from anywhere, with no object to thread through the
app. Maintainers want the state and behavior to live in something testable and
not tangled into global statics.

**Alternative.** Put everything in the static object (simplest for the caller,
but global mutable state that's hard to test and reset), or expose an instance
the caller must construct and pass around (testable, but pushes lifecycle
management onto every integrator).

**Why this won.** The split gets both: the facade is a thin, zero-state shim that
delegates — the *call site* stays effortless — while all real logic sits in a
plain class that can be constructed, exercised, and reasoned about in isolation.
The facade also becomes the single place to enforce "initialized before use"
(a clear `IllegalStateException` if not). It's the standard SDK shape for exactly
this reason.

---

## Local buffer + batched background flush (Room + WorkManager)

**Choice.** `trackEvent` writes to a local Room/SQLite buffer and returns
immediately; a WorkManager job uploads events in batches later.

**Problem.** A game's frame loop must never block on analytics, networks drop,
and processes die — yet events shouldn't be lost or sent one-HTTP-call-each.

**Alternative.** Send each event over HTTP inline (or from an in-memory queue
with no persistence).

**Why this won.** Persisting first, then flushing, is what buys the three
properties that matter:

- **Never block the game.** `trackEvent` does a local enqueue off the caller
  thread and returns; no network I/O on the hot path.
- **Offline resilience / durability.** Events live in SQLite until a batch is
  *confirmed* stored, so they survive no-network periods, restarts, and process
  death. An in-memory-only queue loses everything on the next crash.
- **Efficiency.** WorkManager coalesces events and uploads up to 500 per request
  (with network constraints and backoff), instead of one connection per event.
- **Crash-safe upload.** Because events are already persisted, the uncaught-
  exception handler can synchronously flush what's pending within a hard time
  budget before the process dies, and anything unsent is still on disk for next
  launch.

The cost is that **events are eventually-delivered, not instant** — an explicit,
documented property, mitigated by flush-on-background and an on-demand `flush()`.

See [sdk.md § Event lifecycle](./sdk.md#event-lifecycle).

---

## Whole-batch-atomic ingestion

**Choice.** `POST /v1/events/batch` validates every event first; if any is
malformed it rejects the **entire** batch with `400` and writes nothing. A `201`
means every event was stored.

**Problem.** With a partial-success model ("store the valid ones, skip the bad
ones") the client can't know *which* events were kept, so it can't safely clear
its send buffer without a reconciliation protocol.

**Alternative.** Accept-valid / skip-invalid, returning per-item results.

**Why this won.** All-or-nothing gives the SDK a clean contract: **on `201`, drop
exactly the batch you sent; on `400`, it's a client bug — log and drop; on
`5xx`/`429`, keep and retry.** No partial-state bookkeeping on the device.
Because the write is a single multi-row `INSERT`, atomicity also falls out for
free at the database level, and malformed input is a client defect worth
surfacing loudly rather than silently dropping. The tradeoff — one bad event
fails its whole batch — is acceptable because the SDK only ever assembles batches
from data it validated on the way in, so a rejection signals a real bug, not
routine noise.

See [architecture.md §5](./architecture.md#5-ingestion-path).

---

## Two separate authentication systems

**Choice.** Machine traffic (SDKs/integrators hitting `/v1/*`) authenticates with
a per-project **`x-api-key`**; humans (the dashboard) authenticate with an
email/password **session cookie**. They share no code path.

**Problem.** The two callers have genuinely different threat models. An API key is
a long-lived secret embedded in a shipped game binary, scoped to one project's
data. A portal login is an interactive human credential that should be
short-lived, revocable, and tied to a user and the projects they own.

**Alternative.** One unified auth system serving both (e.g. issue the game a user
session too, or gate the dashboard with API keys).

**Why this won.** Conflating them would force one mechanism to satisfy two
incompatible sets of requirements — a bearer secret suitable for a client binary
is a poor fit for a revocable human session and vice versa. Keeping them separate
means each is as simple and as strict as its own model demands, the machine path
never depends on human session handling, and the ingestion routes are completely
untouched by portal auth (the middleware matcher deliberately excludes `/v1/*`).

See [architecture.md §8](./architecture.md#8-two-separate-auth-systems).

---

## A vetted auth library (Better Auth) instead of hand-rolling

**Choice.** Use Better Auth for the portal's password hashing, sessions, and
cookies rather than implementing them.

**Problem.** The dashboard needs email/password login with correctly hashed
passwords, secure session tokens, and safe cookie handling.

**Alternative.** Hand-roll it: pick a hashing algorithm, manage salts, mint and
store session tokens, set cookie flags.

**Why this won.** This is the deliberate asymmetry in what this project builds
versus buys. The **pipeline** — storage, retrieval, ingestion — is the subject
worth building and understanding. **Authentication is a security-critical solved
problem** where a subtle mistake (a weak hash, a token-comparison flaw, a missing
cookie flag) is a real vulnerability, and where a well-maintained library encodes
years of hard-won correctness. So we build the thing we're studying and buy the
security-critical commodity: the library owns password hashing (we never write
`user`/`account` rows by hand — even the demo seed goes through
`auth.api.signUpEmail`), and sessions are DB-backed and revocable.

**Note.** The exact hashing algorithm is Better Auth's built-in default (not
overridden here) — see the flag in
[architecture.md §8](./architecture.md#8-two-separate-auth-systems).

---

## Authorization in the data layer, not middleware

**Choice.** Every protected portal page and route enforces auth **in the data
layer** (`requireUser()` / `getOwnedProject()` in the server components and route
handlers). Middleware is treated as an optimistic redirect only, explicitly *not*
the security boundary.

**Problem.** It's tempting to gate access once, in Next.js middleware, and treat
everything behind it as protected.

**Alternative.** Rely on middleware as the authorization boundary.

**Why this won.** **CVE-2025-29927** demonstrated that Next.js middleware auth
gates can be bypassed — so anything relying on middleware alone is exposed. Moving
the real check next to the data access makes bypassing the outer layer harmless:
each page/route independently verifies the session and that the logged-in user
**owns** the requested project (returning the same `404` for "missing" and "not
yours" so existence isn't leaked across accounts). Middleware stays only as a UX
nicety (bounce cookie-less users to `/login` and save a render). Defense that
lives where the data is read can't be skipped by skipping a layer above it.

See [architecture.md §9](./architecture.md#9-security).

---

## See also

- [architecture.md](./architecture.md) — how the system works (storage §3,
  retrieval §4, ingestion §5, auth §8, security §9).
- [sdk.md](./sdk.md) — SDK integration, auto-init, and event lifecycle.
- [api-reference.md](./api-reference.md) — the REST API these decisions shape.
