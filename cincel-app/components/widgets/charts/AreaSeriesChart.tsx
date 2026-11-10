"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/shadcn/chart";

/**
 * The recharts line/area chart of `LineSeriesWidget` (Visual). Kept in its
 * own module so recharts loads as a separate chunk (see `./lazy`).
 *
 * The legend is plain markup under the chart, not recharts' `Legend`: that one
 * measures itself with `getBoundingClientRect` and moves when the measure
 * changes, which it does while the container scales in (`ring-in`), so the
 * legend shifted the layout (#985).
 */
export type AreaSeriesChartProps = {
  config: ChartConfig;
  rows: Record<string, string | number>[];
  series: { key: string; dashed?: boolean; area?: boolean }[];
};

export default function AreaSeriesChart({ config, rows, series }: AreaSeriesChartProps) {
  return (
    <div className="flex h-56 w-full flex-col">
      <ChartContainer config={config} className="aspect-auto min-h-0 w-full flex-1">
        <AreaChart accessibilityLayer data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={`var(--color-${s.key})`}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              fill={`var(--color-${s.key})`}
              fillOpacity={s.area ? 0.12 : 0}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ChartContainer>
      <div data-slot="chart-legend" className="flex items-center justify-center gap-4 pt-3 text-xs">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <div className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: config[s.key]?.color }} />
            {config[s.key]?.label}
          </div>
        ))}
      </div>
    </div>
  );
}
