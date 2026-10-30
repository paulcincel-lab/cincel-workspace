"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/shadcn/chart";

type ChartDataPoint = { label: string; value: number };

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

export function AssistantChartMessage({ chartType, title, data }: Props) {
  const height =
    chartType === "bar" ? Math.min(280, Math.max(data.length * 44, 120)) : 260;

  const config = {
    value: { label: title, color: "var(--chart-1)" },
  } satisfies ChartConfig;

  return (
    <div className="w-full max-w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <div className="w-full p-3">
        <ChartContainer
          config={config}
          className="aspect-auto w-full"
          style={{ height }}
        >
          {chartType === "bar" ? (
            <BarChart
              accessibilityLayer
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={110}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar
                dataKey="value"
                fill="var(--color-value)"
                radius={[0, 4, 4, 0]}
                maxBarSize={20}
              />
            </BarChart>
          ) : (
            <AreaChart
              accessibilityLayer
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <ChartTooltip
                content={<ChartTooltipContent indicator="line" />}
              />
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
          )}
        </ChartContainer>
      </div>
    </div>
  );
}
