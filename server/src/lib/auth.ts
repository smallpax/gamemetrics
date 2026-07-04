import { betterAuth } from "better-auth";
import { Pool } from "pg";

/**
 * Better Auth server instance — the PORTAL's authentication system.
 *
 * This is entirely separate from the ingestion API's x-api-key auth
 * (/v1/events, /v1/events/batch, /v1/metrics/*). Games/SDKs never touch this;
 * it exists only to authenticate humans using the dashboard UI.
 *
 * Sessions are stored in the database (the `session` table), not JWT-only, so
 * they are revocable — appropriate for a traditional (non-edge) server. The
 * library owns password hashing, session tokens, and cookie handling.
 */

// Dedicated pool for auth. Uses the same connection settings as @/lib/db but is
// constructed here so the Better Auth CLI can load this file standalone.
const pool = new Pool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? "gamemetrics",
  password: process.env.DB_PASSWORD ?? "gamemetrics",
  database: process.env.DB_NAME ?? "gamemetrics",
});

// Session-signing secret. Required — no fallback, so a misconfigured deployment
// fails fast instead of silently running on a known/public default. Set
// BETTER_AUTH_SECRET in the environment (see .env.example); generate one with
// e.g. `openssl rand -base64 32`.
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error(
    "BETTER_AUTH_SECRET is not set. Set it in the environment (see .env.example).",
  );
}

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    // DB-backed sessions (default). 7-day expiry, refreshed daily.
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    cookies: {
      // httpOnly is enforced by the library; be explicit about the rest.
      sessionToken: {
        attributes: {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
        },
      },
    },
  },
});
