"use client";

import type { ReactNode } from "react";

import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { DELTA_TEXT } from "@/components/v2/layout/KpiRow";
import type { KpiDeltaTone } from "@/lib/types/widgets";
import { cn } from "@/lib/utils";

/**
 * Analítico KPI strip (ADR 0005, frames `Main`, `Analitico-Vencidas`): one
 * card per figure in a `<dl>` (label `dt`, value and delta `dd`), five per
 * row from 1024 px, two below, one under 390 px. The delta line takes the
 * shared `DELTA_TEXT` tone colors of `KpiTile`; its text comes ready from the
 * producer (`formatKpiDelta` for signed values).
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

const NUMBER = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

function formatValue(value: string | number): string {
  return typeof value === "number" ? NUMBER.format(value) : value;
}

export function KpiStrip({ items, loading = false }: KpiStripProps): ReactNode {
  if (loading) return <LoadingSkeleton variant="kpis" rows={5} />;
  return (
    <dl data-slot="kpi-strip" className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <div key={item.key} data-kpi={item.key} className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card px-4 py-3">
          <dt className="truncate font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">{item.label}</dt>
          <dd
            data-slot="kpi-value"
            className={cn(
              "text-[26px] leading-tight font-semibold tabular-nums",
              item.tone === "destructive" ? "text-destructive" : "text-foreground",
            )}
          >
            {formatValue(item.value)}
            {item.secondary ? (
              <span data-slot="kpi-secondary" className="ml-1.5 text-[13px] font-normal text-muted-foreground">
                {item.secondary}
              </span>
            ) : null}
          </dd>
          {item.delta ? (
            <dd data-slot="kpi-delta" data-tone={item.delta.tone} className={cn("font-mono text-xs", DELTA_TEXT[item.delta.tone])}>
              {item.delta.label}
            </dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
