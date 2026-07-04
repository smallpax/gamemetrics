import Link from "next/link";
import { formatNumber, formatPercent } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";

/**
 * Per-event breakdown. Each row links to that event's detail page, carrying the
 * current range/interval through the query string so the drill-down keeps context.
 */
export function TopEvents({
  projectId,
  events,
  query,
}: {
  projectId: string;
  events: { event_name: string; count: number }[];
  query: string;
}) {
  if (events.length === 0) {
    return (
      <EmptyState message="No events have been recorded in this range yet." />
    );
  }

  const total = events.reduce((sum, e) => sum + e.count, 0);
  const max = events[0]?.count ?? 1;

  return (
    <ul className="divide-y divide-line-soft">
      {events.map((e) => {
        const share = total > 0 ? e.count / total : 0;
        const barWidth = max > 0 ? (e.count / max) * 100 : 0;
        return (
          <li key={e.event_name}>
            <Link
              href={`/projects/${projectId}/events/${encodeURIComponent(
                e.event_name,
              )}${query}`}
              className="group flex items-center gap-4 px-1 py-3 transition-colors hover:bg-surface-2/60"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-sm text-fg">
                    {e.event_name}
                  </span>
                  <span className="shrink-0 tabular-nums text-sm font-medium text-fg">
                    {formatNumber(e.count)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent-2 to-accent"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">
                    {formatPercent(share)}
                  </span>
                </div>
              </div>
              <ChevronIcon />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-muted"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
