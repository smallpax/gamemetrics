import { cache } from "react";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import db from "@/lib/db";
import { auth } from "@/lib/auth";

/**
 * Server-side data layer for the developer portal.
 *
 * Project listing is read straight from the DB (it's not one of the metrics
 * endpoints). Metric reads go through the real /v1/metrics/* HTTP API, exactly
 * as an external integrator would — the difference is we resolve the project's
 * x-api-key on the server and attach it here, so the key never reaches client JS.
 *
 * AUTHORIZATION lives here, in the data layer — NOT solely in middleware.
 * Middleware-only gating is bypassable (CVE-2025-29927), so every portal page
 * and portal API route calls requireUser()/getOwnedProject() directly. This is
 * the portal's session auth and is entirely separate from the ingestion API's
 * x-api-key auth.
 */

export interface PortalUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Resolve the logged-in portal user from the session cookie, or redirect to
 * /login. Call this at the top of every protected page and portal API route.
 */
export async function requireUser(): Promise<PortalUser> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

/** Like requireUser but returns null instead of redirecting (for API routes). */
export async function getUser(): Promise<PortalUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

export interface ProjectSummary {
  id: string;
  name: string;
  apiKey: string | null;
  eventCount: number;
  createdAt: string;
}

/** Projects owned by the given user, scoped by owner_id. */
export async function listProjects(ownerId: string): Promise<ProjectSummary[]> {
  const result = await db.query(
    `SELECT
       p.id,
       p.name,
       p.created_at,
       (SELECT key FROM api_keys k WHERE k.project_id = p.id
        ORDER BY k.created_at ASC LIMIT 1)            AS api_key,
       (SELECT count(*)::int FROM events e WHERE e.project_id = p.id) AS event_count
     FROM projects p
     WHERE p.owner_id = $1
     ORDER BY p.created_at ASC`,
    [ownerId],
  );
  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    apiKey: r.api_key,
    eventCount: r.event_count,
    createdAt: r.created_at.toISOString(),
  }));
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fetch a project ONLY if `ownerId` owns it. Returns null when the project
 * doesn't exist OR belongs to someone else — callers surface both as 404 so
 * project existence isn't leaked across accounts. This is the per-project
 * authorization gate.
 */
export async function getOwnedProject(
  id: string,
  ownerId: string,
): Promise<{ id: string; name: string; apiKey: string | null } | null> {
  // Guard: a malformed id would make Postgres throw on the uuid cast.
  if (!UUID_RE.test(id)) return null;
  const result = await db.query(
    `SELECT p.id, p.name,
       (SELECT key FROM api_keys k WHERE k.project_id = p.id
        ORDER BY k.created_at ASC LIMIT 1) AS api_key
     FROM projects p WHERE p.id = $1 AND p.owner_id = $2`,
    [id, ownerId],
  );
  if (result.rowCount === 0) return null;
  const r = result.rows[0];
  return { id: r.id, name: r.name, apiKey: r.api_key };
}

export interface OwnedProject {
  id: string;
  name: string;
  apiKey: string | null;
}

/**
 * The portal's per-project authorization gate: require a logged-in user AND
 * ownership of `id`, or 404. Wrapped in React cache() so that calling it from a
 * route's generateMetadata AND its component body in the same request costs a
 * single DB round-trip.
 *
 * Why it's also used in generateMetadata: a notFound() thrown from the streamed
 * page/layout body can lose the race against Next's shell flush and surface as
 * HTTP 200 (with the not-found UI). generateMetadata resolves before the
 * response streams, so throwing there guarantees a real 404 status. The body
 * check remains the actual data-access guard; the metadata check fixes status.
 */
export const requireOwnedProject = cache(
  async (id: string): Promise<{ user: PortalUser; project: OwnedProject }> => {
    const user = await requireUser();
    const project = await getOwnedProject(id, user.id);
    if (!project) notFound();
    return { user, project };
  },
);

/**
 * Resolve a project's API key by id WITHOUT an ownership check. Internal only:
 * used by the metric fetchers below, which are always reached after the caller
 * has already verified ownership via getOwnedProject(). Not exported.
 */
async function resolveApiKey(id: string): Promise<string | null> {
  if (!UUID_RE.test(id)) return null;
  const result = await db.query(
    `SELECT key FROM api_keys WHERE project_id = $1
     ORDER BY created_at ASC LIMIT 1`,
    [id],
  );
  return result.rowCount === 0 ? null : result.rows[0].key;
}

// ---- Metric responses (mirror the /v1/metrics/* route shapes) ----

export interface OverviewData {
  total_events: number;
  users: { dau: number; total: number };
  sessions: number;
  range: { from: string; to: string };
}

export interface EventsData {
  events: { event_name: string; count: number }[];
  range: { from: string; to: string };
}

export interface TimeseriesData {
  series: { bucket: string; count: number }[];
  interval: "hour" | "day";
  event_name: string | null;
  range: { from: string; to: string };
}

type Endpoint = "overview" | "events" | "timeseries";

async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

/**
 * Call a metrics endpoint for a project, resolving its API key server-side.
 * Throws on a non-OK response so callers can surface an error state.
 */
async function metricsFetch<T>(
  projectId: string,
  endpoint: Endpoint,
  params: Record<string, string>,
): Promise<T> {
  const apiKey = await resolveApiKey(projectId);
  if (!apiKey) {
    throw new Error("Project has no API key");
  }

  const qs = new URLSearchParams(params).toString();
  const url = `${await baseUrl()}/v1/metrics/${endpoint}${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    headers: { "x-api-key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`metrics/${endpoint} responded ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchOverview(
  projectId: string,
  range: { from: Date; to: Date },
): Promise<OverviewData> {
  return metricsFetch<OverviewData>(projectId, "overview", {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  });
}

export function fetchEvents(
  projectId: string,
  range: { from: Date; to: Date },
): Promise<EventsData> {
  return metricsFetch<EventsData>(projectId, "events", {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  });
}

export function fetchTimeseries(
  projectId: string,
  range: { from: Date; to: Date },
  interval: "hour" | "day",
  eventName?: string,
): Promise<TimeseriesData> {
  const params: Record<string, string> = {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    interval,
  };
  if (eventName) params.event_name = eventName;
  return metricsFetch<TimeseriesData>(projectId, "timeseries", params);
}

// ---- Live event stream (mirrors /v1/events/recent) ----

export interface RecentEvent {
  id: string;
  event_name: string;
  user_id: string | null;
  session_id: string | null;
  params: Record<string, unknown>;
  timestamp: string;
}

export interface RecentEventsData {
  events: RecentEvent[];
}

/**
 * Fetch the recent-events tail for a project through the real /v1/events/recent
 * API, resolving the project's x-api-key server-side (same as metricsFetch — the
 * key never reaches client JS). The live view polls a thin portal route that
 * calls this; that route is the transport seam where polling could later be
 * swapped for SSE without touching the client UI.
 */
export async function fetchRecentEvents(
  projectId: string,
  opts: { limit?: number; since?: string } = {},
): Promise<RecentEventsData> {
  const apiKey = await resolveApiKey(projectId);
  if (!apiKey) {
    throw new Error("Project has no API key");
  }

  const params = new URLSearchParams();
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.since) params.set("since", opts.since);
  const qs = params.toString();
  const url = `${await baseUrl()}/v1/events/recent${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    headers: { "x-api-key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`events/recent responded ${res.status}`);
  }
  return res.json() as Promise<RecentEventsData>;
}
