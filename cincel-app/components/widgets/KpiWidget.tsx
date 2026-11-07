"use client";

import type { KpiDatum } from "@/lib/types/widgets";

/**
 * KPIs in three styles (redesign FE §4.10.1); filters `visibleIn` by the
 * current style. Extends `components/v2/layout/KpiRow`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type KpiWidgetProps = { items: KpiDatum[] };

export function KpiWidget(props: KpiWidgetProps) {
  void props;
  return null;
}
