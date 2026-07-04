import { Suspense } from "react";
import {
  requireOwnedProject,
  fetchOverview,
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
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Panel } from "@/components/Panel";
import { StatCard } from "@/components/StatCard";
import { StatCardSkeleton, ChartSkeleton, Skeleton } from "@/components/Skeleton";
import { RangeControls } from "@/components/RangeControls";
import { TimeseriesChart } from "@/components/TimeseriesChart";
import { TopEvents } from "@/components/TopEvents";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

type SearchParams = { range?: string; interval?: string };

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const { user, project } = await requireOwnedProject(id);

  const range: RangeKey = isRangeKey(sp.range) ? sp.range : "7d";
  const interval: Interval = isInterval(sp.interval)
    ? sp.interval
    : defaultInterval(range);
  const query = `?range=${range}&interval=${interval}`;
  // Key the suspense boundaries so changing controls shows a fresh skeleton.
  const dataKey = `${range}:${interval}`;

  return (
    <>
      <AppHeader crumbs={[{ label: project.name }]} user={user} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">
              {project.name}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {RANGES.find((r) => r.key === range)?.label}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/projects/${id}/live`}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-fg"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-positive" />
              </span>
              Live view
            </Link>
            <RangeControls range={range} interval={interval} />
          </div>
        </div>

        {/* Overview cards */}
        <Suspense key={`ov:${dataKey}`} fallback={<OverviewSkeleton />}>
          <OverviewSection projectId={id} range={range} />
        </Suspense>

        {/* Time-series chart */}
        <div className="mt-6">
          <Panel title="Events over time" subtitle={intervalLabel(interval)}>
            <Suspense key={`ts:${dataKey}`} fallback={<ChartSkeleton />}>
              <ChartSection
                projectId={id}
                range={range}
                interval={interval}
              />
            </Suspense>
          </Panel>
        </div>

        {/* Top events */}
        <div className="mt-6">
          <Panel title="Top events" subtitle="Breakdown by event name">
            <Suspense key={`ev:${dataKey}`} fallback={<EventsSkeleton />}>
              <EventsSection projectId={id} range={range} query={query} />
            </Suspense>
          </Panel>
        </div>
      </main>
    </>
  );
}

function intervalLabel(interval: Interval) {
  return interval === "hour" ? "Hourly buckets" : "Daily buckets";
}

async function OverviewSection({
  projectId,
  range,
}: {
  projectId: string;
  range: RangeKey;
}) {
  const data = await fetchOverview(projectId, resolveRange(range));
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Total events" value={data.total_events} accent />
      <StatCard
        label="DAU"
        value={data.users.dau}
        hint="Active in last 24h"
      />
      <StatCard label="Total users" value={data.users.total} hint="In range" />
      <StatCard label="Sessions" value={data.sessions} hint="In range" />
    </div>
  );
}

async function ChartSection({
  projectId,
  range,
  interval,
}: {
  projectId: string;
  range: RangeKey;
  interval: Interval;
}) {
  const data = await fetchTimeseries(projectId, resolveRange(range), interval);
  if (data.series.length === 0) {
    return (
      <EmptyState message="No events were recorded in this time range. Try a wider range." />
    );
  }
  return <TimeseriesChart data={data.series} interval={interval} />;
}

async function EventsSection({
  projectId,
  range,
  query,
}: {
  projectId: string;
  range: RangeKey;
  query: string;
}) {
  const data = await fetchEvents(projectId, resolveRange(range));
  return (
    <TopEvents projectId={projectId} events={data.events} query={query} />
  );
}

// ---- Skeletons ----

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

function EventsSkeleton() {
  return (
    <div className="space-y-4 py-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-1.5 w-full" />
        </div>
      ))}
    </div>
  );
}
