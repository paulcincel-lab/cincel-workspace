"use client";

import type { DistributionSegment } from "@/lib/types/widgets";

/**
 * Distribution in three styles (redesign FE §4.10.1): donut + legend, text
 * list, or table with %, heat and totals. Reuses `chart.tsx`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type DistributionWidgetProps = {
  title: string;
  segments: DistributionSegment[];
  totalLabel?: string;
  secondaryLabel?: string;
  extraColumns?: { key: string; label: string }[];
};

export function DistributionWidget(props: DistributionWidgetProps) {
  void props;
  return null;
}
