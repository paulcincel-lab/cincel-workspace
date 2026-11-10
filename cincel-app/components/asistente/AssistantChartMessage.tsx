"use client";

import { lazy, Suspense } from "react";

import { DistributionWidget } from "@/components/widgets/DistributionWidget";
import { WidgetCard } from "@/components/widgets/WidgetCard";

import { toDistributionSegments, type ChartDataPoint } from "./widget-adapters";

type Props = {
  chartType: "bar" | "line";
  title: string;
  data: ChartDataPoint[];
};

/** recharts arrives on demand, like the widget charts (`components/widgets/charts/lazy`). */
export const loadAssistantLineChart = () => import("./AssistantLineChart");
const AssistantLineChart = lazy(loadAssistantLineChart);

/**
 * `render_chart` (redesign FE §3.9, §4.11.1): adapter onto the widget library.
 * A comparison (`bar`) is a `DistributionWidget`, which renders the user's
 * style; a trend (`line`) is a `chart.tsx` line (`AssistantLineChart`, drawn
 * in `var(--chart-1)`) inside a `WidgetCard`. The labelled box keeps the
 * chart's size while its chunk loads.
 */
export function AssistantChartMessage({ chartType, title, data }: Props) {
  if (chartType === "bar") {
    return <DistributionWidget title={title} segments={toDistributionSegments(data)} />;
  }

  return (
    <WidgetCard title={title}>
      <div
        role="img"
        aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}
        className="h-64 w-full"
      >
        <Suspense fallback={<div data-slot="chart-placeholder" className="size-full" />}>
          <AssistantLineChart title={title} data={data} />
        </Suspense>
      </div>
    </WidgetCard>
  );
}
