import { NextRequest, NextResponse } from "next/server";
import { getUser, getOwnedProject, fetchRecentEvents } from "@/lib/portal";

/**
 * Portal-internal poll endpoint for the live view:
 *   GET /projects/:id/live/recent?since=&limit=
 *
 * The client polls this; it resolves the project's API key server-side and
 * proxies to the real /v1/events/recent. This is the single transport seam —
 * replacing it with an SSE/stream handler later wouldn't change the client UI's
 * data shape ({ events: RecentEvent[] }).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Session + ownership check in the route itself (defense in depth — not
  // relying on middleware). Unauthenticated → 401; not-owned/missing → 404.
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const project = await getOwnedProject(id, user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const since = sp.get("since") ?? undefined;
  const limitRaw = sp.get("limit");
  const limit = limitRaw != null ? Number(limitRaw) : undefined;

  try {
    const data = await fetchRecentEvents(id, { since, limit });
    return NextResponse.json(data, {
      // Never cache a live feed.
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load events" },
      { status: 502 },
    );
  }
}
