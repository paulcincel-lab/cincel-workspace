"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useStyle } from "@/components/shell/StyleProvider";
import type { ChartConfig } from "@/components/ui/shadcn/chart";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { RecordTableData } from "@/lib/types/widgets";

import { LazyAreaSeriesChart } from "./charts/lazy";
import { RecordTable, type RecordTableProps } from "./RecordTable";
import { StyleView } from "./StyleView";
import { WidgetCard } from "./WidgetCard";

/**
 * The library's line chart (redesign FE §4.10.2 "`WidgetCard` + `chart.tsx`
 * line; Analítico via `RecordTable`"): Visual draws the series with shadcn
 * `ChartContainer` (solid with area or dashed, horizontal grid only),
 * Esencial lists "label … values" as text, Analítico renders `table`.
 */
export type LineSeries = {
  key: string;
  label: string;
  /** e.g. "var(--chart-1)". */
  colorVar: string;
  dashed?: boolean;
  area?: boolean;
};

export type LineSeriesWidgetProps = {
  title: string;
  icon?: LucideIcon;
  /** Oldest → newest; `values` is keyed by `LineSeries.key`. */
  points: { key: string; label: string; values: Record<string, number> }[];
  series: LineSeries[];
  /** Analítico (one row per point). */
  table: RecordTableData;
  renderCell?: RecordTableProps["renderCell"];
  /** Omitted = all styles (same rule as `KpiDatum.visibleIn`). */
  visibleIn?: PresentationStyle[];
  emptyText?: string;
};

function EmptyLine({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

export function LineSeriesWidget({
  title,
  icon,
  points,
  series,
  table,
  renderCell,
  visibleIn,
  emptyText = "Sin datos para mostrar.",
}: LineSeriesWidgetProps) {
  const { style } = useStyle();
  if (visibleIn && !visibleIn.includes(style)) return null;

  const empty = points.length === 0 || points.every((p) => series.every((s) => !p.values[s.key]));
  const card = (children: ReactNode) => (
    <WidgetCard title={title} icon={icon}>
      {children}
    </WidgetCard>
  );
  if (empty) return card(<EmptyLine text={emptyText} />);

  const config = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.colorVar }])) satisfies ChartConfig;
  const rows = points.map((p) => ({ label: p.label, ...p.values }));

  return (
    <StyleView
      visual={() => card(<LazyAreaSeriesChart config={config} rows={rows} series={series} />)}
      esencial={() =>
        card(
          <ul className="flex flex-col divide-y divide-border">
            {points.map((p) => (
              <li key={p.key} className="flex items-baseline justify-between gap-4 py-2">
                <span>{p.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {series.map((s) => `${p.values[s.key] ?? 0} ${s.label.toLocaleLowerCase("es-MX")}`).join(" · ")}
                </span>
              </li>
            ))}
          </ul>,
        )
      }
      analitico={() => card(<RecordTable data={table} renderCell={renderCell} />)}
    />
  );
}
