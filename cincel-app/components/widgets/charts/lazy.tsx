"use client";

import { lazy, Suspense } from "react";

import type { AreaSeriesChartProps } from "./AreaSeriesChart";
import type { DonutChartProps } from "./DonutChart";

/**
 * Charts load on demand (issue 922): recharts is the largest client library
 * of the widget set, and only the Visual style draws it, so it ships as its
 * own chunk instead of with every route that shows a widget. The server
 * still renders the chart, and the fallback keeps the chart's box so nothing
 * moves while the chunk arrives.
 */
export const loadDonutChart = () => import("./DonutChart");
export const loadAreaSeriesChart = () => import("./AreaSeriesChart");

const DonutChart = lazy(loadDonutChart);
const AreaSeriesChart = lazy(loadAreaSeriesChart);

export function LazyDonutChart(props: DonutChartProps) {
  return (
    <Suspense fallback={<div data-slot="chart-placeholder" className="size-full" />}>
      <DonutChart {...props} />
    </Suspense>
  );
}

export function LazyAreaSeriesChart(props: AreaSeriesChartProps) {
  return (
    <Suspense fallback={<div data-slot="chart-placeholder" className="h-56 w-full" />}>
      <AreaSeriesChart {...props} />
    </Suspense>
  );
}
