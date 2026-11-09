"use client";

import type { ReactNode } from "react";

import type { KpiDeltaTone } from "@/lib/types/widgets";

/**
 * Analítico KPI strip (ADR 0005). Minimal markup for now: a `<dl>` of label
 * and value. Full behavior in #982.
 */
export type KpiStripItem = {
  key: string;
  label: string;
  value: string | number;
  secondary?: string;
  delta?: { label: string; tone: KpiDeltaTone };
  tone?: "default" | "destructive";
};
export type KpiStripProps = { items: KpiStripItem[]; loading?: boolean };

export function KpiStrip({ items }: KpiStripProps): ReactNode {
  return (
    <dl>
      {items.map((item) => (
        <div key={item.key}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
