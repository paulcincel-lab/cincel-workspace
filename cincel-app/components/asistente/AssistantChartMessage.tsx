"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ACCENT = "var(--foreground)";
const GRID = "var(--border)";
const AXIS = "var(--muted-foreground)";

type ChartDataPoint = { label: string; value: number };

type Props = {
  chartType: "bar" | "line";
  title: string;
  data: ChartDataPoint[];
};

export function AssistantChartMessage({ chartType, title, data }: Props) {
  const height =
    chartType === "bar"
      ? Math.min(280, Math.max(data.length * 44, 120))
      : 260;

  return (
    <div className="w-full max-w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <div className="w-full p-3" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "bar" ? (
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid stroke={GRID} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke={AXIS} />
              <YAxis
                type="category"
                dataKey="label"
                width={110}
                tick={{ fontSize: 12 }}
                stroke={AXIS}
              />
              <Tooltip />
              <Bar dataKey="value" fill={ACCENT} radius={[0, 4, 4, 0]} maxBarSize={20} />
            </BarChart>
          ) : (
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke={AXIS} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke={AXIS} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="value"
                stroke={ACCENT}
                strokeWidth={2}
                fill={ACCENT}
                fillOpacity={0.1}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
