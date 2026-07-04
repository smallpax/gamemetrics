/**
 * Shared date-range + interval definitions. Pure (no server/client imports) so
 * both the server pages and the client <RangeControls> can use it.
 *
 * The portal drives data fetching through URL search params: `?range=7d&interval=day`.
 * The server resolves a RangeKey to concrete from/to timestamps at request time,
 * so the client only ever puts a stable key in the URL (no hydration drift).
 */
export type RangeKey = "24h" | "7d" | "30d";
export type Interval = "hour" | "day";

export const RANGES: { key: RangeKey; label: string; ms: number }[] = [
  { key: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

export const INTERVALS: { key: Interval; label: string }[] = [
  { key: "hour", label: "Hourly" },
  { key: "day", label: "Daily" },
];

export function isRangeKey(v: string | undefined): v is RangeKey {
  return v === "24h" || v === "7d" || v === "30d";
}

export function isInterval(v: string | undefined): v is Interval {
  return v === "hour" || v === "day";
}

export function resolveRange(key: RangeKey): { from: Date; to: Date } {
  const def = RANGES.find((r) => r.key === key) ?? RANGES[1];
  const to = new Date();
  return { from: new Date(to.getTime() - def.ms), to };
}

/** Sensible default bucketing for a range when the user hasn't picked one. */
export function defaultInterval(key: RangeKey): Interval {
  return key === "24h" ? "hour" : "day";
}
