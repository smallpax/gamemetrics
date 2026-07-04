import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

/**
 * Shared helpers for the read/query API under /v1/metrics/*.
 * All metrics endpoints authenticate the same way as /v1/events (x-api-key),
 * resolve the project from the key, and scope every query to that project.
 */

export type AuthResult =
  | { ok: true; projectId: string }
  | { ok: false; response: NextResponse };

/** Resolve the calling project from the x-api-key header. */
export async function authenticate(req: NextRequest): Promise<AuthResult> {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Missing x-api-key header" },
        { status: 401 },
      ),
    };
  }

  const keyRow = await db.query(
    "SELECT project_id FROM api_keys WHERE key = $1",
    [apiKey],
  );
  if (keyRow.rowCount === 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid API key" }, { status: 401 }),
    };
  }

  return { ok: true, projectId: keyRow.rows[0].project_id };
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export type RangeResult =
  | { ok: true; from: Date; to: Date }
  | { ok: false; error: string };

/**
 * Parse ?from= / ?to= ISO 8601 timestamps. Defaults to the last 7 days.
 * Returned Dates are passed to pg as bound parameters (timestamptz), never
 * interpolated into SQL.
 */
export function parseTimeRange(params: URLSearchParams): RangeResult {
  const toRaw = params.get("to");
  const fromRaw = params.get("from");

  let to: Date;
  if (toRaw === null) {
    to = new Date();
  } else {
    to = new Date(toRaw);
    if (Number.isNaN(to.getTime())) {
      return { ok: false, error: "Invalid 'to' timestamp; expected ISO 8601" };
    }
  }

  let from: Date;
  if (fromRaw === null) {
    from = new Date(to.getTime() - SEVEN_DAYS_MS);
  } else {
    from = new Date(fromRaw);
    if (Number.isNaN(from.getTime())) {
      return { ok: false, error: "Invalid 'from' timestamp; expected ISO 8601" };
    }
  }

  if (from.getTime() > to.getTime()) {
    return { ok: false, error: "'from' must be before or equal to 'to'" };
  }

  return { ok: true, from, to };
}
