import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { authenticate } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  MAX_SINGLE_BODY_BYTES,
  normalizeEvent,
  readJsonBody,
} from "@/lib/events";

/**
 * POST /v1/events
 * Ingest a single event. Body: { event_name, user_id?, session_id?, params?,
 * timestamp? }. Auth: x-api-key, project resolved from the key.
 *
 * Backward-compatible contract: returns { ok: true } with HTTP 201 on success.
 * For high-volume ingestion, prefer POST /v1/events/batch.
 */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing x-api-key header" },
      { status: 401 },
    );
  }

  const rl = checkRateLimit(apiKey);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;

  const parsed = await readJsonBody(req, MAX_SINGLE_BODY_BYTES);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const result = normalizeEvent(parsed.value);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const { event_name, user_id, session_id, paramsJson, timestamp } = result.event;

  await db.query(
    `INSERT INTO events (project_id, event_name, user_id, session_id, params, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [auth.projectId, event_name, user_id, session_id, paramsJson, timestamp],
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}
