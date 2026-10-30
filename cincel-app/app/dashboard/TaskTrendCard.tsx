"use client";

import { useEffect, useState } from "react";
import { TrendingUpIcon } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/shadcn/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { fetchDashboardTaskTrendAction } from "@/lib/actions/dashboard-actions";
import type { TaskTrend, TaskTrendRange } from "@/lib/dashboard/task-trend";

// Fixed per series, so switching the range never repaints the colors.
const config = {
  completed: { label: "Completadas", color: "var(--chart-1)" },
  created: { label: "Creadas", color: "var(--chart-2)" },
} satisfies ChartConfig;

type SeriesKey = keyof typeof config;

// 8px marker with a ring in the card surface color.
function marker(key: SeriesKey) {
  return {
    r: 4,
    fill: `var(--color-${key})`,
    stroke: "var(--card)",
    strokeWidth: 2,
  };
}

export function TaskTrendCard() {
  const [range, setRange] = useState<TaskTrendRange>("semana");
  const [trend, setTrend] = useState<TaskTrend | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDashboardTaskTrendAction(range)
      .then((next) => {
        if (!cancelled) setTrend(next);
      })
      .catch(() => {
        if (!cancelled) setTrend({ labels: [], created: [], completed: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const data = (trend?.labels ?? []).map((label, i) => ({
    label,
    completed: trend!.completed[i] ?? 0,
    created: trend!.created[i] ?? 0,
  }));
  const isEmpty =
    trend !== null && data.every((d) => d.completed === 0 && d.created === 0);

  return (
    <Card className="min-w-0 lg:col-span-2">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2.5 font-semibold">
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-lg bg-chart-1/10 text-chart-1"
          >
            <TrendingUpIcon className="size-4" />
          </span>
          Avance de tareas
        </CardTitle>
        <CardAction>
          <Select
            value={range}
            onValueChange={(value) => setRange(value as TaskTrendRange)}
          >
            <SelectTrigger aria-label="Periodo" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semana">Semana</SelectItem>
              <SelectItem value="mes">Mes</SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent>
        {trend === null ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : isEmpty ? (
          <p className="text-sm text-muted-foreground">
            Sin tareas creadas ni completadas en este periodo.
          </p>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-64 w-full">
            <ComposedChart
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
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, name, item) => (
                      <div className="grid gap-0.5">
                        <span className="font-mono font-medium text-foreground tabular-nums">
                          {value} tareas
                        </span>
                        <span className="text-muted-foreground">
                          {config[name as SeriesKey]?.label ?? name} ·{" "}
                          {item.payload?.label}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                dataKey="completed"
                type="monotone"
                stroke="var(--color-completed)"
                strokeWidth={2}
                fill="var(--color-completed)"
                fillOpacity={0.1}
                dot={marker("completed")}
                activeDot={marker("completed")}
              />
              <Line
                dataKey="created"
                type="monotone"
                stroke="var(--color-created)"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={marker("created")}
                activeDot={marker("created")}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
