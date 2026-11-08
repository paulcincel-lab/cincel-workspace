"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useStyle } from "@/components/shell/StyleProvider";
import { Button } from "@/components/ui/shadcn/button";
import type { ChartConfig } from "@/components/ui/shadcn/chart";
import type { WidgetView } from "@/lib/stores/dashboard-store";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { RecordTableData } from "@/lib/types/widgets";

import { LazyAreaSeriesChart } from "./charts/lazy";
import { RecordTable, type RecordTableProps } from "./RecordTable";
import { StyleView } from "./StyleView";
import { WidgetCard, type WidgetCardProps } from "./WidgetCard";

/**
 * The library's line chart (redesign FE §4.10.2 "`WidgetCard` + `chart.tsx`
 * line; Analítico via `RecordTable`"): Visual draws the series with shadcn
 * `ChartContainer` (solid with area or dashed, horizontal grid only),
 * Esencial lists "label … values" as text, Analítico renders `table`.
 *
 * Dashboard extras (zustand.md §2.5), all optional: `view` picks the chart
 * (Visual) or the table (Analítico) whatever the style; `hiddenSeries` are
 * neither drawn nor listed (nor their table columns); `onToggleSeries` adds
 * legend toggle buttons (`aria-pressed` = shown; the last shown series cannot
 * be hidden).
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
  /** Dashboard override: "chart" = the Visual chart, "table" = the Analítico table; omitted = the style decides. */
  view?: WidgetView;
  /** Keys of series that are not drawn and not listed. */
  hiddenSeries?: readonly string[];
  /** Renders the legend as toggle buttons; called with the series key. */
  onToggleSeries?(key: string): void;
  /** Card header controls (`WidgetCard` `actions`), e.g. a range picker. */
  actions?: ReactNode;
  /** Collapse control of the card (`WidgetCard` `collapsible`). */
  collapsible?: WidgetCardProps["collapsible"];
};

function EmptyLine({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function SeriesToggles({
  series,
  hidden,
  onToggle,
}: {
  series: LineSeries[];
  hidden: ReadonlySet<string>;
  onToggle(key: string): void;
}) {
  const shownCount = series.filter((s) => !hidden.has(s.key)).length;
  return (
    <div role="group" aria-label="Series" data-slot="line-series-toggles" className="mb-3 flex flex-wrap gap-2">
      {series.map((s) => {
        const shown = !hidden.has(s.key);
        return (
          <Button
            key={s.key}
            type="button"
            variant="outline"
            size="xs"
            data-series={s.key}
            aria-pressed={shown}
            disabled={shown && shownCount <= 1}
            onClick={() => onToggle(s.key)}
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: shown ? s.colorVar : "var(--muted-foreground)" }}
            />
            {s.label}
          </Button>
        );
      })}
    </div>
  );
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
  view,
  hiddenSeries,
  onToggleSeries,
  actions,
  collapsible,
}: LineSeriesWidgetProps) {
  const { style } = useStyle();
  if (visibleIn && !visibleIn.includes(style)) return null;

  const hidden = new Set(hiddenSeries ?? []);
  const unhidden = series.filter((s) => !hidden.has(s.key));
  // Every series hidden (a stale value): show them all rather than nothing.
  const shown = unhidden.length > 0 ? unhidden : series;
  const hiddenKeys: ReadonlySet<string> = unhidden.length > 0 ? hidden : new Set<string>();

  const empty = points.length === 0 || points.every((p) => series.every((s) => !p.values[s.key]));
  const card = (children: ReactNode) => (
    <WidgetCard title={title} icon={icon} actions={actions} collapsible={collapsible}>
      {children}
    </WidgetCard>
  );
  if (empty) return card(<EmptyLine text={emptyText} />);

  const withToggles = (children: ReactNode) =>
    card(
      onToggleSeries ? (
        <>
          <SeriesToggles series={series} hidden={hiddenKeys} onToggle={onToggleSeries} />
          {children}
        </>
      ) : (
        children
      ),
    );

  const config = Object.fromEntries(shown.map((s) => [s.key, { label: s.label, color: s.colorVar }])) satisfies ChartConfig;
  const rows = points.map((p) => ({
    label: p.label,
    ...Object.fromEntries(Object.entries(p.values).filter(([key]) => !hiddenKeys.has(key))),
  }));
  const shownTable: RecordTableData =
    hiddenKeys.size > 0 ? { ...table, columns: table.columns.filter((c) => !hiddenKeys.has(c.key)) } : table;

  return (
    <StyleView
      view={view}
      visual={() => withToggles(<LazyAreaSeriesChart config={config} rows={rows} series={shown} />)}
      esencial={() =>
        withToggles(
          <ul className="flex flex-col divide-y divide-border">
            {points.map((p) => (
              <li key={p.key} className="flex items-baseline justify-between gap-4 py-2">
                <span>{p.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {shown.map((s) => `${p.values[s.key] ?? 0} ${s.label.toLocaleLowerCase("es-MX")}`).join(" · ")}
                </span>
              </li>
            ))}
          </ul>,
        )
      }
      analitico={() => withToggles(<RecordTable data={shownTable} renderCell={renderCell} view={view === "table" ? "table" : undefined} />)}
    />
  );
}
