import { Suspense } from "react";
import {
  requireOwnedProject,
  fetchEvents,
  fetchTimeseries,
} from "@/lib/portal";
import {
  resolveRange,
  defaultInterval,
  isRangeKey,
  isInterval,
  RANGES,
  type RangeKey,
  type Interval,
} from "@/lib/range";
import { formatNumber, formatPercent } from "@/lib/format";
import { AppHeader } from "@/components/AppHeader";
import { Panel } from "@/components/Panel";
import { StatCard } from "@/components/StatCard";
import { StatCardSkeleton, ChartSkeleton } from "@/components/Skeleton";
import { RangeControls } from "@/components/RangeControls";
import { TimeseriesChart } from "@/components/TimeseriesChart";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

type SearchParams = { range?: string; interval?: string };

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; eventName: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id, eventName: rawName } = await params;
  const sp = await searchParams;
  const eventName = decodeURIComponent(rawName);

  const { user, project } = await requireOwnedProject(id);

  const range: RangeKey = isRangeKey(sp.range) ? sp.range : "7d";
  const interval: Interval = isInterval(sp.interval)
    ? sp.interval
    : defaultInterval(range);
  const backQuery = `?range=${range}&interval=${interval}`;
  const dataKey = `${range}:${interval}`;

  return (
    <>
      <AppHeader
        crumbs={[
          { label: project.name, href: `/projects/${id}${backQuery}` },
          { label: eventName },
        ]}
        user={user}
      />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-faint">
              Event
            </p>
            <h1 className="mt-1 font-mono text-2xl font-semibold tracking-tight text-fg">
              {eventName}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {RANGES.find((r) => r.key === range)?.label}
            </p>
          </div>
          <RangeControls range={range} interval={interval} />
        </div>

        <Suspense key={`stat:${dataKey}`} fallback={<StatsSkeleton />}>
          <StatsSection
            projectId={id}
            range={range}
            eventName={eventName}
          />
        </Suspense>

        <div className="mt-6">
          <Panel
            title={`${eventName} over time`}
            subtitle={interval === "hour" ? "Hourly buckets" : "Daily buckets"}
          >
            <Suspense key={`chart:${dataKey}`} fallback={<ChartSkeleton />}>
              <EventChartSection
                projectId={id}
                range={range}
                interval={interval}
                eventName={eventName}
              />
            </Suspense>
          </Panel>
        </div>
      </main>
    </>
  );
}

async function StatsSection({
  projectId,
  range,
  eventName,
}: {
  projectId: string;
  range: RangeKey;
  eventName: string;
}) {
  const data = await fetchEvents(projectId, resolveRange(range));
  const total = data.events.reduce((sum, e) => sum + e.count, 0);
  const thisEvent = data.events.find((e) => e.event_name === eventName);
  const count = thisEvent?.count ?? 0;
  const share = total > 0 ? count / total : 0;
  const rank = data.events.findIndex((e) => e.event_name === eventName) + 1;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      <StatCard label="Event count" value={count} accent />
      <StatCardLike
        label="Share of all events"
        value={total > 0 ? formatPercent(share) : "—"}
        hint={`of ${formatNumber(total)} total`}
      />
      <StatCardLike
        label="Rank"
        value={rank > 0 ? `#${rank}` : "—"}
        hint={`of ${data.events.length} event types`}
      />
    </div>
  );
}

/** Variant of StatCard that displays a preformatted string value. */
function StatCardLike({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-faint">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-fg">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

async function EventChartSection({
  projectId,
  range,
  interval,
  eventName,
}: {
  projectId: string;
  range: RangeKey;
  interval: Interval;
  eventName: string;
}) {
  const data = await fetchTimeseries(
    projectId,
    resolveRange(range),
    interval,
    eventName,
  );
  if (data.series.length === 0) {
    return (
      <EmptyState
        message={`No "${eventName}" events were recorded in this time range.`}
      />
    );
  }
  return (
    <TimeseriesChart
      data={data.series}
      interval={interval}
      color="var(--color-accent-2)"
    />
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}
