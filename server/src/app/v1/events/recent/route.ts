import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { authenticate } from "@/lib/api";

/**
 * GET /v1/events/recent?limit=&since=
 * The most recent events for the calling project, newest-first, with full
 * detail (id, event_name, user_id, session_id, params, timestamp). Powers the
 * portal's live debug view.
 *
 * Auth: x-api-key, project-scoped (same as the rest of /v1).
 *
 * Query params:
 *   limit  optional, default 50, clamped to 1..200.
 *   since  optional ISO 8601 timestamp; returns only events strictly newer than
 *          it, so a poller can fetch just the new tail. Combined with `limit`,
 *          a single poll returns at most `limit` of the newest events newer than
 *          `since` (acceptable for a live debug feed; clients dedupe by id).
 */
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;

  const params = req.nextUrl.searchParams;

  const limitRaw = Number(params.get("limit") ?? 50);
  if (!Number.isFinite(limitRaw) || limitRaw < 1) {
    return NextResponse.json(
      { error: "'limit' must be a positive number" },
      { status: 400 },
    );
  }
  const limit = Math.min(Math.floor(limitRaw), 200);

  const sinceRaw = params.get("since");
  let since: Date | null = null;
  if (sinceRaw !== null) {
    since = new Date(sinceRaw);
    if (Number.isNaN(since.getTime())) {
      return NextResponse.json(
        { error: "Invalid 'since' timestamp; expected ISO 8601" },
        { status: 400 },
      );
    }
  }

  const where = ["project_id = $1"];
  const args: (string | Date | number)[] = [auth.projectId];
  if (since) {
    args.push(since);
    where.push(`timestamp > $${args.length}`);
  }
  args.push(limit);

  const result = await db.query(
    `SELECT id, event_name, user_id, session_id, params, timestamp
     FROM events
     WHERE ${where.join(" AND ")}
     ORDER BY timestamp DESC
     LIMIT $${args.length}`,
    args,
  );

  return NextResponse.json({
    events: result.rows.map((r) => ({
      id: r.id,
      event_name: r.event_name,
      user_id: r.user_id,
      session_id: r.session_id,
      params: r.params,
      timestamp: r.timestamp.toISOString(),
    })),
  });
}
