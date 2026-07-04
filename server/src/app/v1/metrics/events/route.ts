import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { authenticate, parseTimeRange } from "@/lib/api";

/**
 * GET /v1/metrics/events?from=&to=
 * Per-event breakdown: count grouped by event_name, descending — powers the
 * portal's "top events" view.
 *
 * Data source: raw `events`.
 * The event_counts_hourly aggregate has no event_name dimension, so a per-event
 * breakdown can only come from the raw table.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;

  const range = parseTimeRange(req.nextUrl.searchParams);
  if (!range.ok) {
    return NextResponse.json({ error: range.error }, { status: 400 });
  }
  const { from, to } = range;

  const result = await db.query(
    `SELECT event_name, count(*)::int AS count
     FROM events
     WHERE project_id = $1
       AND timestamp >= $2
       AND timestamp <= $3
     GROUP BY event_name
     ORDER BY count DESC, event_name ASC`,
    [auth.projectId, from, to],
  );

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    events: result.rows, // [] for an empty range
  });
}
