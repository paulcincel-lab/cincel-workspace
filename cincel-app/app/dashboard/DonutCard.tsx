"use client";

import type { ReactNode } from "react";
import { Pie, PieChart } from "recharts";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/shadcn/chart";
import type { DonutSlice } from "@/lib/dashboard/donut-groups";

interface DonutCardProps {
  title: string;
  icon: ReactNode;
  slices: DonutSlice[];
  /** Word under the total in the donut center, e.g. "tareas". */
  unit: string;
  emptyText: string;
}

/** Donut on a 200px box: ring 28px thick, 2px gap between segments. */
const SIZE = 200;
const RING = 28;
const GAP = 2;

export function DonutCard({
  title,
  icon,
  slices,
  unit,
  emptyText,
}: DonutCardProps) {
  const total = slices.reduce((sum, s) => sum + s.count, 0);
  const visible = slices.filter((s) => s.count > 0);
  const config = Object.fromEntries(
    slices.map((s) => [s.key, { label: s.label, color: s.color }]),
  ) satisfies ChartConfig;

  return (
    <Card className="min-w-0">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2.5 font-semibold">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <div
              className="relative shrink-0"
              style={{ width: SIZE, height: SIZE }}
            >
              <ChartContainer
                config={config}
                className="aspect-square size-full"
              >
                <PieChart>
                  <ChartTooltip
                    content={<ChartTooltipContent nameKey="key" hideLabel />}
                  />
                  <Pie
                    data={visible.map((s) => ({
                      key: s.key,
                      count: s.count,
                      fill: s.color,
                    }))}
                    dataKey="count"
                    nameKey="key"
                    innerRadius={SIZE / 2 - RING}
                    outerRadius={SIZE / 2}
                    stroke="var(--card)"
                    strokeWidth={visible.length > 1 ? GAP : 0}
                    isAnimationActive={false}
                  />
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-semibold tabular-nums">
                  {total}
                </span>
                <span className="text-xs text-muted-foreground">{unit}</span>
              </div>
            </div>
            <ul className="flex w-full min-w-0 flex-col gap-2 text-sm">
              {slices.map((s) => (
                <li key={s.key} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  <span className="font-mono tabular-nums">{s.count}</span>
                  <span className="w-10 text-right font-mono tabular-nums text-muted-foreground">
                    {Math.round((s.count / total) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
