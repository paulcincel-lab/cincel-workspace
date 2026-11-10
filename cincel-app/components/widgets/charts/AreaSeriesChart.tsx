"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/shadcn/chart";

/**
 * The recharts line/area chart of `LineSeriesWidget` (Visual). Kept in its
 * own module so recharts loads as a separate chunk (see `./lazy`).
 */
export type AreaSeriesChartProps = {
  config: ChartConfig;
  rows: Record<string, string | number>[];
  series: { key: string; dashed?: boolean; area?: boolean }[];
};

export default function AreaSeriesChart({ config, rows, series }: AreaSeriesChartProps) {
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <AreaChart accessibilityLayer data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend content={<ChartLegendContent />} />
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
  );
}
