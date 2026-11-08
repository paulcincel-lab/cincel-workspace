"use client";

import { Pie, PieChart } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/shadcn/chart";

/**
 * The recharts donut of `DistributionWidget` (Visual). Kept in its own module
 * so recharts loads as a separate chunk (see `./lazy`), not with the route.
 */
export type DonutChartProps = {
  config: ChartConfig;
  data: { key: string; value: number; fill: string }[];
  innerRadius: number;
  outerRadius: number;
  /** Stroke between segments, in px. */
  gap: number;
};

export default function DonutChart({ config, data, innerRadius, outerRadius, gap }: DonutChartProps) {
  return (
    <ChartContainer config={config} className="aspect-square size-full">
      <PieChart accessibilityLayer={false}>
        <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="key"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          stroke="var(--card)"
          strokeWidth={gap}
          isAnimationActive={false}
        />
      </PieChart>
    </ChartContainer>
  );
}
