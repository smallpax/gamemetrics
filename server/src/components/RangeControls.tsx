"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  RANGES,
  INTERVALS,
  defaultInterval,
  type RangeKey,
  type Interval,
} from "@/lib/range";

/**
 * Interval toggle + date-range presets. These write to the URL search params;
 * the server page re-reads them and re-fetches. Switching range also resets the
 * interval to a sensible default for that span (hourly for 24h, daily otherwise).
 */
export function RangeControls({
  range,
  interval,
}: {
  range: RangeKey;
  interval: Interval;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(next: Record<string, string>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) sp.set(k, v);
    startTransition(() => {
      router.push(`${pathname}?${sp.toString()}`, { scroll: false });
    });
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 transition-opacity ${
        pending ? "opacity-60" : ""
      }`}
    >
      <Segmented
        options={INTERVALS.map((i) => ({ key: i.key, label: i.label }))}
        active={interval}
        onSelect={(k) => update({ interval: k })}
      />
      <Segmented
        options={RANGES.map((r) => ({ key: r.key, label: r.label }))}
        active={range}
        onSelect={(k) =>
          update({ range: k, interval: defaultInterval(k as RangeKey) })
        }
      />
    </div>
  );
}

function Segmented({
  options,
  active,
  onSelect,
}: {
  options: { key: string; label: string }[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {options.map((o) => {
        const isActive = o.key === active;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onSelect(o.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? "bg-surface-2 text-fg shadow-sm"
                : "text-muted hover:text-fg"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
