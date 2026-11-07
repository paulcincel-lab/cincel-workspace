"use client";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { RecordTable } from "@/components/widgets/RecordTable";
import {
  formatHours,
  formatHoursDelta,
  isTrialDay,
  TEAM_HOURS_STATUS_LABEL,
  WEEKDAY_SHORT,
  weekdayOf,
} from "@/lib/time-tracking/horario-copy";
import type { PresentationStyle, TeamHoursRow } from "@/lib/types/redesign";
import type { RecordColumn, RecordTableData } from "@/lib/types/widgets";

export type TeamHoursTableProps = {
  weekStart: string;
  rows: TeamHoursRow[];
  style: PresentationStyle;
  /** `TimeTrackingSettings.requiredFrom`: days before it are trial days ("prueba"). */
  requiredFrom?: string | null;
};

const ONLY_ANALITICO: PresentationStyle[] = ["visual", "esencial"];
const ONLY_ESENCIAL: PresentationStyle[] = ["visual", "analitico"];
const NOT_ESENCIAL: PresentationStyle[] = ["esencial"];
const NOT_ANALITICO: PresentationStyle[] = ["analitico"];

/** Heat on "% cumplimiento": `warnAt` above `critAt` means lower values are worse. */
export const CUMPLIMIENTO_HEAT = { key: "cumplimiento", warnAt: 95, critAt: 85 } as const;

export const TRIAL_NOTE = "Durante la prueba estos datos son informativos y no salen en reportes de nómina.";

export const TEAM_HOURS_EMPTY = {
  title: "Sin personas que registren horario",
  description: "Aquí aparecen las horas de la semana de quienes registran entrada y salida.",
} as const;

function dayKey(date: string): string {
  return `d_${date}`;
}

/** The report's dates: every date any row carries, in order. */
function reportDates(rows: TeamHoursRow[]): string[] {
  const dates = new Set<string>();
  for (const row of rows) for (const day of row.days) dates.add(day.date);
  return [...dates].sort();
}

function dayCell(hours: number | undefined): string {
  return hours && hours > 0 ? formatHours(hours) : "—";
}

function compliance(row: Pick<TeamHoursRow, "total" | "target">): number {
  return row.target > 0 ? Math.round((row.total / row.target) * 100) : 0;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The `RecordTable` data of the weekly team report. Every style reads the same
 * rows; `hideOn` picks the columns: Visual = days, "x h de y h" and estado;
 * Esencial = one line per person; Analítico = per-day columns, total, meta,
 * diferencia, retardos, % cumplimiento (heat) and the averages row.
 */
export function buildTeamHoursTable(rows: TeamHoursRow[], requiredFrom: string | null = null): RecordTableData {
  const dates = reportDates(rows);
  const trial = dates.filter((date) => isTrialDay(date, requiredFrom));
  /** A week that is only partly trial marks its trial days; a full trial week gets the note instead. */
  const markDays = trial.length > 0 && trial.length < dates.length;
  const marked = (date: string) => markDays && isTrialDay(date, requiredFrom);

  const columns: RecordColumn[] = [
    { key: "persona", label: "Persona" },
    { key: "resumen", label: "Horas por día", hideOn: ONLY_ESENCIAL },
    ...dates.map<RecordColumn>((date) => ({
      key: dayKey(date),
      label: `${WEEKDAY_SHORT[weekdayOf(date)]}${marked(date) ? " · prueba" : ""}`,
      align: "right",
      mono: true,
      hideOn: NOT_ESENCIAL,
    })),
    { key: "horas", label: "Total", align: "right", hideOn: NOT_ANALITICO },
    { key: "total", label: "Total", align: "right", mono: true, format: "hours", hideOn: ONLY_ANALITICO },
    { key: "meta", label: "Meta", align: "right", mono: true, format: "hours", hideOn: ONLY_ANALITICO },
    { key: "diferencia", label: "Diferencia", align: "right", mono: true, hideOn: ONLY_ANALITICO },
    { key: "retardos", label: "Retardos", align: "right", mono: true, format: "count", hideOn: ONLY_ANALITICO },
    { key: "cumplimiento", label: "% cumplimiento", align: "right", mono: true, format: "percent", hideOn: ONLY_ANALITICO },
    { key: "estado", label: "Estado" },
  ];

  const tableRows = rows.map((row) => {
    const hoursByDate = new Map(row.days.map((day) => [day.date, day.hours]));
    const record: Record<string, unknown> = {
      id: row.staffId,
      persona: row.name,
      resumen:
        row.status === "sin_registro"
          ? "Sin registros esta semana"
          : dates
              .map((date) => {
                const cell = dayCell(hoursByDate.get(date));
                return marked(date) ? `${cell} (prueba)` : cell;
              })
              .join(" · "),
      horas: `${formatHours(row.total)} de ${formatHours(row.target)}`,
      total: round1(row.total),
      meta: round1(row.target),
      diferencia: formatHoursDelta(row.total - row.target),
      retardos: row.lateCount,
      cumplimiento: compliance(row),
      estado: TEAM_HOURS_STATUS_LABEL[row.status],
    };
    for (const date of dates) record[dayKey(date)] = dayCell(hoursByDate.get(date));
    return record;
  });

  const recorded = rows.filter((row) => row.status !== "sin_registro");
  const data: RecordTableData = { columns, rows: tableRows, heat: [CUMPLIMIENTO_HEAT] };
  if (recorded.length === 0) return data;

  const totals: Record<string, string | number> = {
    persona: "Promedio (con registro)",
    total: round1(average(recorded.map((row) => row.total))),
    meta: round1(average(recorded.map((row) => row.target))),
    diferencia: formatHoursDelta(average(recorded.map((row) => row.total - row.target))),
    retardos: recorded.reduce((sum, row) => sum + row.lateCount, 0),
    cumplimiento: Math.round(average(recorded.map(compliance))),
  };
  for (const date of dates) {
    totals[dayKey(date)] = dayCell(average(recorded.map((row) => row.days.find((day) => day.date === date)?.hours ?? 0)));
  }
  return { ...data, totals };
}

/**
 * "Horas del equipo" (redesign FE §3.8, §4.8) on `RecordTable`. The style
 * comes in as a prop and reaches the widget through `StyleProvider`, so this
 * component writes no per-style markup.
 */
export function TeamHoursTable({ weekStart, rows, style, requiredFrom = null }: TeamHoursTableProps) {
  const data = buildTeamHoursTable(rows, requiredFrom);
  const anyTrial = reportDates(rows).some((date) => isTrialDay(date, requiredFrom));
  return (
    <div className="flex flex-col gap-2" data-week={weekStart}>
      <StyleProvider key={style} style={style} scope="staff">
        <RecordTable data={data} emptyState={{ ...TEAM_HOURS_EMPTY }} />
      </StyleProvider>
      {anyTrial ? <p className="text-sm text-muted-foreground">{TRIAL_NOTE}</p> : null}
    </div>
  );
}
