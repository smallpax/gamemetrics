# GameMetrics — REST API Reference

The GameMetrics server exposes a small REST API for ingesting gameplay events and
reading back aggregated metrics. This document is a reference catalog of every
`/v1` endpoint, written against the route handlers in `/server/src/app/v1/`;
every path, parameter, response shape, and status code is taken from the code.

---

## Overview

- **Base path.** All public endpoints live under `/v1` (e.g.
  `POST /v1/events`). Paths in this doc are relative to your server's base URL
  (dev default `http://localhost:3000`).
- **JSON.** Every endpoint accepts and returns `application/json`.
- **Authentication.** All `/v1` endpoints authenticate with an **`x-api-key`**
  header; the key resolves to a single project, and every query is scoped to that
  project (see [Authentication](#authentication)).
- **Two auth contexts.** The `/v1` API described here is the **machine** API
  (game SDKs, integrators) — it is api-key authenticated and completely separate
  from the **portal** (the dashboard), which uses email/password session cookies.
  The portal also has internal routes (e.g. `/projects/:id/live/recent`) that use
  the session cookie and are **not** part of this `/v1` reference; they proxy to
  `/v1` server-side after resolving the project's key. This doc covers only the
  `/v1` api-key API.

The endpoints split into two groups:

| Group | Endpoints |
| --- | --- |
| Ingestion (write) | `POST /v1/events`, `POST /v1/events/batch` |
| Read | `GET /v1/metrics/overview`, `GET /v1/metrics/events`, `GET /v1/metrics/timeseries`, `GET /v1/events/recent` |

---

## Authentication

Send your project's key in the `x-api-key` request header on **every** `/v1`
request:

```bash
curl http://localhost:3000/v1/metrics/overview \
  -H "x-api-key: YOUR_API_KEY"
```

The server looks the key up in `api_keys` and resolves the owning `project_id`;
all data access is scoped to that project. There is no other credential — the key
both authenticates and selects the tenant.

| Condition | Status | Body |
| --- | --- | --- |
| No `x-api-key` header | `401` | `{ "error": "Missing x-api-key header" }` |
| Header present but key unknown | `401` | `{ "error": "Invalid API key" }` |

> Note: on the two ingestion endpoints the rate-limit check runs **before** the
> key is validated (it is keyed on the raw header value), so a flood of requests
> with an unknown key can be throttled with `429` before it would otherwise get
> `401`. See [Rate limiting](#rate-limiting).

---

## Endpoints

### POST /v1/events

Ingest a **single** event.

- **Auth:** `x-api-key`.
- **Rate limited:** yes (per key — see [Rate limiting](#rate-limiting)).
- **Request body** (`application/json`):

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `event_name` | string | yes | Non-empty, ≤ 128 chars. |
| `user_id` | string \| null | no | ≤ 256 chars. |
| `session_id` | string \| null | no | ≤ 256 chars. |
| `params` | object | no | Arbitrary JSON object; serialized form ≤ 8 KB. Defaults to `{}`. |
| `timestamp` | string | no | ISO 8601. Defaults to server time (`now`). |

Max request body size: **32 KB**.

```bash
curl -X POST http://localhost:3000/v1/events \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"event_name":"level_complete","user_id":"player_1","params":{"level":3,"score":9500}}'
```

**Response — `201 Created`:**

```json
{ "ok": true }
```

**Status codes:** `201` success · `400` invalid JSON or a validation failure
(body is `{ "error": "<reason>" }`) · `401` missing/invalid key · `413` body
larger than 32 KB · `429` rate limited.

---

### POST /v1/events/batch

Ingest **many** events in one request. This is the endpoint the SDK uses.

- **Auth:** `x-api-key`.
- **Rate limited:** yes (per key).
- **Request body** (`application/json`): an object with an `events` array; each
  element has the **same shape** as the single-event body above.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `events` | array | yes | 1 … **500** events. Each element validated like `POST /v1/events`. |

Max request body size: **2 MB**. Max events per batch: **500**.

**Whole-batch-atomic:** if *any* event is malformed the entire batch is rejected
with `400` and **nothing** is written. A `201` means every event was stored.

```bash
curl -X POST http://localhost:3000/v1/events/batch \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"events":[
        {"event_name":"app_open","user_id":"player_1"},
        {"event_name":"level_complete","user_id":"player_1","params":{"level":3}}
      ]}'
```

**Response — `201 Created`:**

```json
{ "inserted": 2 }
```

**Status codes:**

| Status | When | Example body |
| --- | --- | --- |
| `201` | All events stored | `{ "inserted": 2 }` |
| `400` | Missing/!array/empty `events`, or a malformed event | `{ "error": "events[1]: event_name must not be empty" }` |
| `401` | Missing/invalid key | `{ "error": "Invalid API key" }` |
| `413` | Body > 2 MB, or more than 500 events | `{ "error": "Batch too large: 742 events (max 500)" }` |
| `429` | Rate limited | `{ "error": "Rate limit exceeded" }` |

---

### GET /v1/metrics/overview

Headline summary numbers for a time range: total events, distinct users (DAU +
total), and session count. Reads **raw `events`** (the hourly aggregate can't
answer distinct-user/session counts).

- **Auth:** `x-api-key`. **Rate limited:** no.
- **Query params:**

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `from` | string (ISO 8601) | `to` − 7 days | Start of range (inclusive). |
| `to` | string (ISO 8601) | `now` | End of range (inclusive). |

`dau` = distinct `user_id`s active in the trailing 24 h ending at `to`,
intersected with the range.

```bash
curl "http://localhost:3000/v1/metrics/overview?from=2026-06-28T00:00:00Z&to=2026-07-05T00:00:00Z" \
  -H "x-api-key: YOUR_API_KEY"
```

**Response — `200 OK`:**

```json
{
  "range": { "from": "2026-06-28T00:00:00.000Z", "to": "2026-07-05T00:00:00.000Z" },
  "total_events": 458,
  "users": { "dau": 12, "total": 12 },
  "sessions": 428
}
```

**Status codes:** `200` success · `400` invalid `from`/`to`, or `from` after `to`
· `401` missing/invalid key.

---

### GET /v1/metrics/events

Per-event-name breakdown (counts, descending) — the "top events" view. Reads
**raw `events`** (the aggregate has no event-name dimension).

- **Auth:** `x-api-key`. **Rate limited:** no.
- **Query params:** `from`, `to` — same types/defaults as
  [overview](#get-v1metricsoverview).

```bash
curl "http://localhost:3000/v1/metrics/events" \
  -H "x-api-key: YOUR_API_KEY"
```

**Response — `200 OK`** (sorted by `count` desc, then `event_name` asc; `events`
is `[]` for an empty range):

```json
{
  "range": { "from": "2026-06-28T10:25:47.091Z", "to": "2026-07-05T10:25:47.091Z" },
  "events": [
    { "event_name": "app_open", "count": 120 },
    { "event_name": "level_start", "count": 98 },
    { "event_name": "level_complete", "count": 76 }
  ]
}
```

**Status codes:** `200` success · `400` invalid range · `401` missing/invalid key.

---

### GET /v1/metrics/timeseries

Time-bucketed event counts for charts. Chooses its data source per request:
without an `event_name` filter it reads the pre-computed **`event_counts_hourly`**
aggregate (fast path); with an `event_name` filter it scans **raw `events`** (the
aggregate has no event-name dimension). The chosen source is reported in the
`source` field.

- **Auth:** `x-api-key`. **Rate limited:** no.
- **Query params:**

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `from` | string (ISO 8601) | `to` − 7 days | Start of range (inclusive). |
| `to` | string (ISO 8601) | `now` | End of range (inclusive). |
| `interval` | `"hour"` \| `"day"` | `"day"` | Bucket width. |
| `event_name` | string | *(none)* | If present, counts only this event and reads raw `events` (`source: "events"`). |

```bash
curl "http://localhost:3000/v1/metrics/timeseries?interval=day&from=2026-06-28T00:00:00Z&to=2026-07-05T00:00:00Z" \
  -H "x-api-key: YOUR_API_KEY"
```

**Response — `200 OK`** (`series` in ascending bucket order; `[]` for an empty
range). `source` is `"aggregate"` when the fast path was used, `"events"` when
it fell back to raw:

```json
{
  "range": { "from": "2026-06-28T00:00:00.000Z", "to": "2026-07-05T00:00:00.000Z" },
  "interval": "day",
  "event_name": null,
  "source": "aggregate",
  "series": [
    { "bucket": "2026-06-28T00:00:00.000Z", "count": 41 },
    { "bucket": "2026-06-29T00:00:00.000Z", "count": 62 }
  ]
}
```

With `?event_name=level_complete`, `event_name` echoes the filter and `source`
is `"events"`.

**Status codes:** `200` success · `400` invalid range or an `interval` other than
`hour`/`day` (`{ "error": "Invalid 'interval'; expected 'hour' or 'day'" }`) ·
`401` missing/invalid key.

---

### GET /v1/events/recent

The most recent events for the project, newest-first, with full per-row detail.
Powers the portal's live debug view. Reads **raw `events`**.

- **Auth:** `x-api-key`. **Rate limited:** no.
- **Query params:**

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `limit` | number | `50` | Clamped to `1 … 200`. |
| `since` | string (ISO 8601) | *(none)* | Return only events strictly **newer** than this timestamp (for tail polling). |

```bash
curl "http://localhost:3000/v1/events/recent?limit=2" \
  -H "x-api-key: YOUR_API_KEY"
```

**Response — `200 OK`** (newest first; `params` is the stored JSON object,
including the SDK's nested `context`/`user_properties` when present):

```json
{
  "events": [
    {
      "id": "7c9e...-uuid",
      "event_name": "level_complete",
      "user_id": "player_1",
      "session_id": "sess_abc",
      "params": { "level": 3, "score": 9500 },
      "timestamp": "2026-07-05T10:25:47.000Z"
    }
  ]
}
```

**Status codes:** `200` success · `400` `limit` not a positive number, or invalid
`since` · `401` missing/invalid key.

---

## Rate limiting

Rate limiting uses an in-memory sliding window. It is applied in two places:

| Scope | Keyed by | Default limit | Applies to |
| --- | --- | --- | --- |
| Ingestion | API key (`x-api-key`) | 100 requests / 60 s | `POST /v1/events`, `POST /v1/events/batch` |
| Login | Client IP | 5 requests / 60 s | Portal `POST /api/auth/sign-in/email` (not a `/v1` endpoint) |

Limits are configurable via env vars (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`,
`LOGIN_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW_MS`).

When a limit is exceeded the response is `429` with a **`Retry-After`** header (in
seconds) indicating when the oldest in-window request ages out:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 42
```
```json
{ "error": "Rate limit exceeded" }
```

The SDK honors `Retry-After` and reschedules its flush.

> Flagged, verified against the code: **only the two ingestion endpoints and the
> portal login are rate-limited.** The read endpoints
> (`/v1/metrics/*`, `/v1/events/recent`) do **not** call the rate limiter. Also
> note the limiter's state is per-process/in-memory, so it is enforced per server
> instance (see [architecture.md §9](./architecture.md#9-security)).

---

## Error responses

All errors are JSON of the shape `{ "error": "<human-readable reason>" }`. Common
cases:

**`400 Bad Request`** — malformed JSON or a validation failure. On batch the
message includes the offending index:

```json
{ "error": "events[1]: event_name exceeds 128 characters" }
```

Validation reasons include: `event_name is required and must be a string`,
`event_name must not be empty`, `event_name exceeds 128 characters`,
`user_id must be a string`, `user_id exceeds 256 characters`,
`params must be a JSON object`, `params exceeds 8192 bytes`,
`timestamp is not a valid ISO 8601 date`, and range errors such as
`'from' must be before or equal to 'to'`.

**`401 Unauthorized`** — missing or invalid API key:

```json
{ "error": "Missing x-api-key header" }
```
```json
{ "error": "Invalid API key" }
```

**`413 Payload Too Large`** — body over the endpoint cap, or a batch over 500
events. The body size is checked against `Content-Length` first, then the actual
bytes:

```json
{ "error": "Request body too large" }
```
```json
{ "error": "Batch too large: 742 events (max 500)" }
```

**`429 Too Many Requests`** — rate limited (with a `Retry-After` header):

```json
{ "error": "Rate limit exceeded" }
```

---

## See also

- [architecture.md](./architecture.md) — system design; **§4** (retrieval:
  aggregate-vs-raw per endpoint), **§5** (ingestion path, batch semantics),
  **§6** (ingestion input hardening).
- [sdk.md](./sdk.md) — the Android SDK that posts to `POST /v1/events/batch`.
