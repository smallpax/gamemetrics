import { AppHeader } from "@/components/AppHeader";
import { Panel } from "@/components/Panel";
import {
  Skeleton,
  StatCardSkeleton,
  ChartSkeleton,
} from "@/components/Skeleton";

export default function Loading() {
  return (
    <>
      <AppHeader crumbs={[{ label: "…" }, { label: "…" }]} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-9 w-72" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="mt-6">
          <Panel title="Over time">
            <ChartSkeleton />
          </Panel>
        </div>
      </main>
    </>
  );
}
