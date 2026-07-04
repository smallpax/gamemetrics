import { NextRequest } from "next/server";

/**
 * Shared event-ingestion helpers used by both POST /v1/events (single) and
 * POST /v1/events/batch. Keeping validation/normalization here guarantees the
 * two endpoints accept exactly the same event shape and enforce identical
 * limits.
 */

// --- Limits (input hardening) ---------------------------------------------
export const MAX_EVENT_NAME_LEN = 128;
export const MAX_ID_LEN = 256; // user_id, session_id
export const MAX_PARAMS_BYTES = 8 * 1024; // serialized JSON params
export const MAX_BATCH_EVENTS = 500; // events per batch request
export const MAX_SINGLE_BODY_BYTES = 32 * 1024; // /v1/events request body
export const MAX_BATCH_BODY_BYTES = 2 * 1024 * 1024; // /v1/events/batch body

/** A validated event, ready to bind to a parameterized INSERT. */
export interface NormalizedEvent {
  event_name: string;
  user_id: string | null;
  session_id: string | null;
  paramsJson: string; // JSON string, always valid (defaults to "{}")
  timestamp: string; // ISO 8601, defaults to now()
}

export type NormalizeResult =
  | { ok: true; event: NormalizedEvent }
  | { ok: false; error: string };

/**
 * Validate + normalize one raw event object. Same rules for single and batch.
 * Returns a normalized event or a human-readable reason for rejection.
 */
export function normalizeEvent(raw: unknown): NormalizeResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "event must be a JSON object" };
  }
  const e = raw as Record<string, unknown>;

  // event_name: required, non-empty, bounded length.
  const name = e.event_name;
  if (typeof name !== "string") {
    return { ok: false, error: "event_name is required and must be a string" };
  }
  if (name.trim().length === 0) {
    return { ok: false, error: "event_name must not be empty" };
  }
  if (name.length > MAX_EVENT_NAME_LEN) {
    return {
      ok: false,
      error: `event_name exceeds ${MAX_EVENT_NAME_LEN} characters`,
    };
  }

  // user_id / session_id: optional strings, bounded length.
  const user_id = optionalId(e.user_id, "user_id");
  if (!user_id.ok) return user_id;
  const session_id = optionalId(e.session_id, "session_id");
  if (!session_id.ok) return session_id;

  // params: optional plain object, bounded serialized size.
  let paramsJson = "{}";
  if (e.params !== undefined && e.params !== null) {
    if (
      typeof e.params !== "object" ||
      Array.isArray(e.params)
    ) {
      return { ok: false, error: "params must be a JSON object" };
    }
    paramsJson = JSON.stringify(e.params);
    if (Buffer.byteLength(paramsJson) > MAX_PARAMS_BYTES) {
      return {
        ok: false,
        error: `params exceeds ${MAX_PARAMS_BYTES} bytes`,
      };
    }
  }

  // timestamp: optional ISO 8601, defaults to now.
  let timestamp = new Date().toISOString();
  if (e.timestamp !== undefined && e.timestamp !== null) {
    if (typeof e.timestamp !== "string") {
      return { ok: false, error: "timestamp must be an ISO 8601 string" };
    }
    const d = new Date(e.timestamp);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: "timestamp is not a valid ISO 8601 date" };
    }
    timestamp = d.toISOString();
  }

  return {
    ok: true,
    event: {
      event_name: name,
      user_id: user_id.value,
      session_id: session_id.value,
      paramsJson,
      timestamp,
    },
  };
}

type IdResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

function optionalId(v: unknown, field: string): IdResult {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "string") {
    return { ok: false, error: `${field} must be a string` };
  }
  if (v.length > MAX_ID_LEN) {
    return { ok: false, error: `${field} exceeds ${MAX_ID_LEN} characters` };
  }
  return { ok: true, value: v };
}

// --- Body reading with a size cap -----------------------------------------
export type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: number; error: string };

/**
 * Read and JSON-parse a request body, rejecting anything larger than
 * `maxBytes` with 413 (checking Content-Length first, then the actual bytes)
 * and invalid JSON with 400.
 */
export async function readJsonBody(
  req: NextRequest,
  maxBytes: number,
): Promise<BodyResult> {
  const declared = req.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) {
    return { ok: false, status: 413, error: "Request body too large" };
  }

  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) {
    return { ok: false, status: 413, error: "Request body too large" };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }
}
