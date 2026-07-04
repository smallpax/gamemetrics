/**
 * In-memory sliding-window rate limiter, keyed by API key.
 *
 * Each key keeps a log of request timestamps; a request is allowed if fewer
 * than `max` requests fall within the trailing `windowMs`. When the limit is
 * hit we compute how long until the oldest in-window request ages out, which
 * becomes the `Retry-After` value.
 *
 * TRADEOFF: state lives in this process's memory. It is correct for a single
 * instance but does NOT survive across multiple instances or a restart — each
 * instance would enforce the limit independently. For a multi-instance
 * deployment this should move to a shared store (e.g. Redis with a sorted-set
 * sliding window). That's a known, accepted limitation at this scale.
 */

const DEFAULT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 100);
const DEFAULT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);

/** Per-key log of request timestamps (ms epoch), oldest first. */
const hits = new Map<string, number[]>();

export type RateLimitResult =
  | { ok: true; remaining: number; limit: number }
  | { ok: false; retryAfterSec: number; limit: number };

export function checkRateLimit(
  key: string,
  max: number = DEFAULT_MAX,
  windowMs: number = DEFAULT_WINDOW_MS,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Drop timestamps that have aged out of the window.
  const fresh = (hits.get(key) ?? []).filter((t) => t > cutoff);

  if (fresh.length >= max) {
    hits.set(key, fresh);
    const oldest = fresh[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { ok: false, retryAfterSec, limit: max };
  }

  fresh.push(now);
  hits.set(key, fresh);
  return { ok: true, remaining: max - fresh.length, limit: max };
}

/** Test/maintenance helper: forget all recorded requests. */
export function resetRateLimit(): void {
  hits.clear();
}
