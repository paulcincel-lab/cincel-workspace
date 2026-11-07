"use client";

import type { ProgressItem } from "@/lib/types/widgets";

/**
 * Progress list in three styles (redesign FE §4.10.1). Reuses `CapacityRing`,
 * `LoadBar`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type ProgressListWidgetProps = { title: string; items: ProgressItem[]; variant?: "bars" | "rings" };

export function ProgressListWidget(props: ProgressListWidgetProps) {
  void props;
  return null;
}
