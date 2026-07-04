import { NextRequest, NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Better Auth's catch-all portal auth handler (/api/auth/*).
 *
 * GET is delegated straight through. POST is wrapped so we can rate-limit the
 * login endpoint ourselves — the auth library does not brute-force protect it
 * for us. We reuse the Build 2 sliding-window limiter (in-memory; same
 * single-instance tradeoff noted there).
 */
const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

// Strict, separate budget for login attempts, keyed per client IP.
const LOGIN_MAX = Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 5);
const LOGIN_WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 60_000);

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

export async function POST(req: NextRequest) {
  // Only the email sign-in path is brute-force sensitive.
  if (req.nextUrl.pathname.endsWith("/sign-in/email")) {
    const rl = checkRateLimit(
      `login:${clientIp(req)}`,
      LOGIN_MAX,
      LOGIN_WINDOW_MS,
    );
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSec) },
        },
      );
    }
  }
  return handlers.POST(req);
}
