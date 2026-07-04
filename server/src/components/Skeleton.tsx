/** Shimmer placeholder. Compose with width/height/rounded utility classes. */
export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`skeleton rounded-md ${className}`} style={style} />;
}

/** Card-shaped skeleton matching <StatCard>. */
export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="mt-4 h-8 w-20" />
    </div>
  );
}

const BAR_HEIGHTS = [40, 65, 50, 80, 55, 70, 45, 90, 60, 75, 50, 85];

export function ChartSkeleton() {
  return (
    <div className="flex h-72 items-end gap-2 px-2 pb-2">
      {BAR_HEIGHTS.map((h, i) => (
        <div key={i} className="flex h-full flex-1 items-end">
          <Skeleton className="w-full rounded-t-md" style={{ height: `${h}%` }} />
        </div>
      ))}
    </div>
  );
}
