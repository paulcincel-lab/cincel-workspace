"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/shadcn/chart";
import { DistributionWidget } from "@/components/widgets/DistributionWidget";
import { WidgetCard } from "@/components/widgets/WidgetCard";

import { toDistributionSegments, type ChartDataPoint } from "./widget-adapters";

type Props = {
  chartType: "bar" | "line";
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
 * `render_chart` (redesign FE §3.9, §4.11.1): adapter onto the widget library.
 * A comparison (`bar`) is a `DistributionWidget`, which renders the user's
 * style; a trend (`line`) is a `chart.tsx` line inside a `WidgetCard`.
 */
export function AssistantChartMessage({ chartType, title, data }: Props) {
  if (chartType === "bar") {
    return <DistributionWidget title={title} segments={toDistributionSegments(data)} />;
  }

  const config = {
    value: { label: title, color: "var(--chart-1)" },
  } satisfies ChartConfig;

  return (
    <WidgetCard title={title}>
      <ChartContainer
        config={config}
        className="aspect-auto h-64 w-full"
        role="img"
        aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}
      >
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
    </WidgetCard>
  );
}
