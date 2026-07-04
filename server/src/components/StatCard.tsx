import { formatNumber } from "@/lib/format";

/**
 * Headline metric card for the dashboard overview row.
 */
export function StatCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line/0 hover:bg-surface-2">
      {accent && (
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent opacity-70" />
      )}
      <p className="text-xs font-medium uppercase tracking-wider text-faint">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-fg">
        {formatNumber(value)}
      </p>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
