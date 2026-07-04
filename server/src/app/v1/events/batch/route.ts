import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { authenticate } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  MAX_BATCH_BODY_BYTES,
  MAX_BATCH_EVENTS,
  NormalizedEvent,
  normalizeEvent,
  readJsonBody,
} from "@/lib/events";

/**
 * POST /v1/events/batch
 * Ingest many events in one request. Body: { "events": [ <event>, ... ] } where
 * each element has the same shape as POST /v1/events
 * (event_name, user_id?, session_id?, params?, timestamp?).
 *
 * Auth: x-api-key, project resolved from the key (same as the single endpoint).
 *
 * Validity is WHOLE-BATCH-ATOMIC: if any event is malformed, the entire batch
 * is rejected (400) and nothing is written. A 201 therefore means every event
 * in the batch was stored, so the SDK can safely drop its send buffer. See the
 * commit / PR notes for the rationale vs. accept-valid-skip-invalid.
 *
 * All events are written in a single round-trip via a multi-row unnest INSERT.
 *
 * Responses:
 *   201 { inserted: N }
 *   400 empty array / not an array / malformed event (with index)
 *   413 body too large / more than MAX_BATCH_EVENTS events
 *   429 rate limited (Retry-After header)
 */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing x-api-key header" },
      { status: 401 },
    );
  }

  // Rate limit by key before touching the DB (throttles invalid-key floods too).
  const rl = checkRateLimit(apiKey);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;

  const parsed = await readJsonBody(req, MAX_BATCH_BODY_BYTES);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const body = parsed.value;
  if (typeof body !== "object" || body === null || !("events" in body)) {
    return NextResponse.json(
      { error: "Body must include an 'events' array" },
      { status: 400 },
    );
  }
  const events = (body as { events: unknown }).events;
  if (!Array.isArray(events)) {
    return NextResponse.json(
      { error: "'events' must be an array" },
      { status: 400 },
    );
  }
  if (events.length === 0) {
    return NextResponse.json(
      { error: "'events' must not be empty" },
      { status: 400 },
    );
  }
  if (events.length > MAX_BATCH_EVENTS) {
    return NextResponse.json(
      {
        error: `Batch too large: ${events.length} events (max ${MAX_BATCH_EVENTS})`,
      },
      { status: 413 },
    );
  }

  // Validate/normalize every event. Any failure rejects the whole batch.
  const normalized: NormalizedEvent[] = [];
  for (let i = 0; i < events.length; i++) {
    const result = normalizeEvent(events[i]);
    if (!result.ok) {
      return NextResponse.json(
        { error: `events[${i}]: ${result.error}` },
        { status: 400 },
      );
    }
    normalized.push(result.event);
  }

  // Single round-trip multi-row insert. project_id is a constant; the rest are
  // passed as parallel arrays and expanded with unnest. params arrives as a
  // text[] of JSON strings and is cast to jsonb per row.
  await db.query(
    `INSERT INTO events (project_id, event_name, user_id, session_id, params, timestamp)
     SELECT $1, e.event_name, e.user_id, e.session_id, e.params::jsonb, e.timestamp
     FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::timestamptz[])
       AS e(event_name, user_id, session_id, params, timestamp)`,
    [
      auth.projectId,
      normalized.map((e) => e.event_name),
      normalized.map((e) => e.user_id),
      normalized.map((e) => e.session_id),
      normalized.map((e) => e.paramsJson),
      normalized.map((e) => e.timestamp),
    ],
  );

  return NextResponse.json({ inserted: normalized.length }, { status: 201 });
}
