import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { authenticate, parseTimeRange } from "@/lib/api";

/**
 * GET /v1/metrics/timeseries?interval=hour|day&from=&to=&event_name=
 * Time-bucketed counts for charts. Returns { series: [{ bucket, count }] }
 * in ascending bucket order.
 *
 * Data source — chosen per request:
 *  - No event_name filter: read the event_counts_hourly continuous aggregate
 *    (pre-computed hourly counts, much faster than scanning raw). For
 *    interval=day we roll the hourly buckets up with time_bucket('1 day', ...).
 *  - event_name filter present: the aggregate has no event_name dimension, so
 *    we fall back to time_bucket over raw `events`.
 *
 * The aggregate is configured with real-time aggregation (migration 002), so the
 * view already unions materialized data with the live raw tail — no recency gap.
 */
const INTERVALS: Record<string, string> = { hour: "1 hour", day: "1 day" };

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;

  const params = req.nextUrl.searchParams;

  const range = parseTimeRange(params);
  if (!range.ok) {
    return NextResponse.json({ error: range.error }, { status: 400 });
  }
  const { from, to } = range;

  const intervalRaw = params.get("interval") ?? "day";
  const intervalLiteral = INTERVALS[intervalRaw];
  if (!intervalLiteral) {
    return NextResponse.json(
      { error: "Invalid 'interval'; expected 'hour' or 'day'" },
      { status: 400 },
    );
  }

  const eventName = params.get("event_name");

  let rows: { bucket: Date; count: number }[];
  let source: "aggregate" | "events";

  if (eventName === null) {
    // Fast path: pre-aggregated hourly counts.
    source = "aggregate";
    if (intervalRaw === "hour") {
      const result = await db.query(
        `SELECT bucket, event_count::int AS count
         FROM event_counts_hourly
         WHERE project_id = $1
           AND bucket >= $2
           AND bucket <= $3
         ORDER BY bucket ASC`,
        [auth.projectId, from, to],
      );
      rows = result.rows;
    } else {
      const result = await db.query(
        `SELECT time_bucket('1 day', bucket) AS bucket, sum(event_count)::int AS count
         FROM event_counts_hourly
         WHERE project_id = $1
           AND bucket >= $2
           AND bucket <= $3
         GROUP BY 1
         ORDER BY 1 ASC`,
        [auth.projectId, from, to],
      );
      rows = result.rows;
    }
  } else {
    // The aggregate can't slice by event_name; scan raw events instead.
    source = "events";
    const result = await db.query(
      `SELECT time_bucket($4::interval, timestamp) AS bucket, count(*)::int AS count
       FROM events
       WHERE project_id = $1
         AND timestamp >= $2
         AND timestamp <= $3
         AND event_name = $5
       GROUP BY 1
       ORDER BY 1 ASC`,
      [auth.projectId, from, to, intervalLiteral, eventName],
    );
    rows = result.rows;
  }

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    interval: intervalRaw,
    event_name: eventName,
    source,
    series: rows, // [] for an empty range
  });
}
