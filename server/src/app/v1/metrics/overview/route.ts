import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { authenticate, parseTimeRange } from "@/lib/api";

/**
 * GET /v1/metrics/overview?from=&to=
 * Summary numbers for the portal's headline cards: total events, distinct users
 * (DAU + total), and session count, for a time range (default: last 7 days).
 *
 * Data source: raw `events`.
 * The event_counts_hourly aggregate only stores per-(project, hour) row counts —
 * it has no user_id / session_id columns, so it cannot answer distinct-user
 * (DAU / total) or session counts. Since 3 of the 4 figures require raw events
 * anyway, total_events is computed from the same scan so every number is
 * consistent for an arbitrary (even sub-hour) from/to window.
 *
 * DAU = distinct users active in the trailing 24h ending at `to`, intersected
 * with the requested range.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;

  const range = parseTimeRange(req.nextUrl.searchParams);
  if (!range.ok) {
    return NextResponse.json({ error: range.error }, { status: 400 });
  }
  const { from, to } = range;
  const dauWindowStart = new Date(to.getTime() - 24 * 60 * 60 * 1000);

  const result = await db.query(
    `SELECT
       count(*)::int                                              AS total_events,
       count(DISTINCT user_id)::int                               AS users_total,
       count(DISTINCT user_id) FILTER (WHERE timestamp >= $4)::int AS dau,
       count(DISTINCT session_id)::int                            AS sessions
     FROM events
     WHERE project_id = $1
       AND timestamp >= $2
       AND timestamp <= $3`,
    [auth.projectId, from, to, dauWindowStart],
  );

  const row = result.rows[0];

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    total_events: row.total_events,
    users: { dau: row.dau, total: row.users_total },
    sessions: row.sessions,
  });
}
