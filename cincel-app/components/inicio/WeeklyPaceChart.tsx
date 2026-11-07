"use client";

import { LineSeriesWidget, type LineSeries } from "@/components/widgets/LineSeriesWidget";
import type { InicioData } from "@/lib/types/redesign";
import type { RecordTableData } from "@/lib/types/widgets";

export type WeeklyPaceChartProps = { weeks: InicioData["weeklyPace"] };

const SERIES: LineSeries[] = [
  { key: "completed", label: "Completadas", colorVar: "var(--chart-1)", area: true },
  { key: "created", label: "Creadas", colorVar: "var(--chart-4)", dashed: true },
];

/** "2 nov" for a `YYYY-MM-DD` week start. */
export function weekLabel(weekStart: string): string {
  const date = new Date(`${weekStart.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return weekStart;
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

/** Analítico "Ritmo semanal" table: Semana, Creadas, Completadas, Neto. */
export function weeklyPaceTable(weeks: InicioData["weeklyPace"]): RecordTableData {
  return {
    columns: [
      { key: "semana", label: "Semana" },
      { key: "created", label: "Creadas", align: "right", mono: true, format: "count" },
      { key: "completed", label: "Completadas", align: "right", mono: true, format: "count" },
      { key: "neto", label: "Neto", align: "right", mono: true, format: "delta" },
    ],
    rows: weeks.map((w) => ({
      id: w.weekStart,
      semana: weekLabel(w.weekStart),
      created: w.created,
      completed: w.completed,
      neto: w.completed - w.created,
    })),
  };
}

function renderNeto(columnKey: string, row: Record<string, unknown>) {
  if (columnKey !== "neto" || typeof row.neto !== "number") return undefined;
  const value = row.neto;
  const text = value > 0 ? `+${value}` : String(value);
  return <span className={value < 0 ? "text-destructive" : undefined}>{text}</span>;
}

/**
 * "Ritmo semanal" (redesign FE §3.2, §4.3): 8 weeks, Completadas solid
 * `chart-1` with area and Creadas dashed `chart-4` in Visual; the table in
 * Analítico. Esencial has no charts and no pace list (FE §3.2), so the widget
 * is shown in Visual and Analítico only.
 */
export function WeeklyPaceChart({ weeks }: WeeklyPaceChartProps) {
  return (
    <LineSeriesWidget
      title="Ritmo semanal"
      points={weeks.map((w) => ({
        key: w.weekStart,
        label: weekLabel(w.weekStart),
        values: { completed: w.completed, created: w.created },
      }))}
      series={SERIES}
      table={weeklyPaceTable(weeks)}
      renderCell={renderNeto}
      visibleIn={["visual", "analitico"]}
      emptyText="Sin tareas creadas ni completadas en las últimas 8 semanas."
    />
  );
}
