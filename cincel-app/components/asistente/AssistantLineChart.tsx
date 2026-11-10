"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/shadcn/chart";

import type { ChartDataPoint } from "./widget-adapters";

export type AssistantLineChartProps = {
  title: string;
  data: ChartDataPoint[];
};

// Point marker: 8px dot with a ring in the card surface color.
const POINT = {
  r: 4,
  fill: "var(--color-value)",
  stroke: "var(--card)",
  strokeWidth: 2,
};

/**
 * The recharts trend line of `render_chart` (`line`). Kept in its own module
 * so recharts loads as a separate chunk when an answer draws a trend, not
 * with the /asistente page.
 */
export default function AssistantLineChart({ title, data }: AssistantLineChartProps) {
  const config = {
    value: { label: title, color: "var(--chart-1)" },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill="var(--color-value)"
          fillOpacity={0.1}
          dot={POINT}
          activeDot={POINT}
        />
      </AreaChart>
    </ChartContainer>
  );
}
