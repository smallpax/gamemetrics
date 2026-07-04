import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * OPTIMISTIC redirect only — NOT the authorization boundary.
 *
 * CVE-2025-29927 showed middleware auth gates can be bypassed, so this must not
 * be the thing that protects data. Real enforcement lives in the server
 * components / data layer (requireUser + getOwnedProject in @/lib/portal).
 * This just spares unauthenticated users a render by bouncing them to /login
 * when the session cookie is absent.
 *
 * The matcher is deliberately narrow: it covers only portal pages and never
 * touches the ingestion API (/v1/*) or the auth handler (/api/auth/*), so
 * x-api-key ingestion is completely unaffected.
 */
export function middleware(req: NextRequest) {
  const hasSession = getSessionCookie(req);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/projects/:path*"],
};
