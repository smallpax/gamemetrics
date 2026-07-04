/** Display formatting helpers shared across portal pages. */

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const full = new Intl.NumberFormat("en-US");

/** 1234 -> "1,234"; used where exact figures matter (cards, tables). */
export function formatNumber(n: number): string {
  return full.format(n);
}

/** 12345 -> "12.3K"; used for dense axis labels. */
export function formatCompact(n: number): string {
  return compact.format(n);
}

/** 0.1234 -> "12.3%". */
export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/**
 * Format a bucket timestamp for the chart axis / tooltip according to interval.
 * hour -> "Jun 24, 3 PM"; day -> "Jun 24".
 */
export function formatBucket(iso: string, interval: "hour" | "day"): string {
  const d = new Date(iso);
  if (interval === "hour") {
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
    });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Short axis tick — hour shows time, day shows date. */
export function formatTick(iso: string, interval: "hour" | "day"): string {
  const d = new Date(iso);
  if (interval === "hour") {
    return d.toLocaleTimeString("en-US", { hour: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
