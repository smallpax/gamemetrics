"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBucket, formatCompact, formatNumber, formatTick } from "@/lib/format";
import type { Interval } from "@/lib/range";

export interface ChartPoint {
  bucket: string;
  count: number;
}

/**
 * Events-over-time area chart. Pure presentation — it receives already-fetched
 * series data as props (no API key, no client fetching).
 */
export function TimeseriesChart({
  data,
  interval,
  color = "var(--color-accent)",
}: {
  data: ChartPoint[];
  interval: Interval;
  color?: string;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="fillArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-line)"
            vertical={false}
          />
          <XAxis
            dataKey="bucket"
            tickFormatter={(v) => formatTick(v, interval)}
            tick={{ fill: "var(--color-faint)", fontSize: 11 }}
            axisLine={{ stroke: "var(--color-line)" }}
            tickLine={false}
            minTickGap={24}
            dy={6}
          />
          <YAxis
            tickFormatter={(v) => formatCompact(v)}
            tick={{ fill: "var(--color-faint)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
            allowDecimals={false}
          />
          <Tooltip
            content={<ChartTooltip interval={interval} />}
            cursor={{ stroke: "var(--color-line)", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke={color}
            strokeWidth={2}
            fill="url(#fillArea)"
            activeDot={{ r: 4, strokeWidth: 0, fill: color }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  interval,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  interval: Interval;
}) {
  if (!active || !payload?.length || label === undefined) return null;
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 shadow-xl">
      <p className="text-xs text-muted">{formatBucket(label, interval)}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-fg">
        {formatNumber(payload[0].value)}
        <span className="ml-1 font-normal text-faint">events</span>
      </p>
    </div>
  );
}
