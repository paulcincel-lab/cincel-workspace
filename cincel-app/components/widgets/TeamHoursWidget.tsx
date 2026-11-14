"use client";

import { StyleView } from "@/components/widgets/StyleView";
import {
  formatHoursCell,
  formatHoursDiff,
  teamHoursStatus,
  WEEKDAY_SHORT,
  weekdayOf,
  type TeamHoursStatusTone,
} from "@/lib/time-tracking/horario-copy";
import type { TeamHoursRow } from "@/lib/types/redesign";
import { cn } from "@/lib/utils";

/**
 * "Horas del equipo" of Ajustes › Control de horario (canvas
 * `Ajustes-Horario`), the one settings view that changes with the
 * presentation style. Visual and Analítico: Persona · one column per day ·
 * Total · Meta · Diferencia · Retardos · Estado, plus the
 * "Promedio (con registro)" footer. Esencial: the person, total / meta and
 * the status with its dot. Hours in Geist Mono, right-aligned, one decimal,
 * "—" without a record; the table scrolls inside its card.
 */
export type TeamHoursWidgetProps = {
  rows: TeamHoursRow[];
  /** The day columns (`reportDays`). */
  dates: string[];
  /** Another week's rows are loading; the shown ones are the previous week's. */
  loading?: boolean;
};

export const TEAM_HOURS_EMPTY = "Sin personas que registren horario esta semana.";

export const AVERAGE_LABEL = "Promedio (con registro)";

export type TeamHoursModelRow = {
  id: string;
  name: string;
  cells: string[];
  total: string;
  target: string;
  diff: string;
  /** Diferencia ≥ 0. */
  onTarget: boolean;
  late: string;
  status: { label: string; tone: TeamHoursStatusTone };
};

export type TeamHoursModel = {
  dayLabels: string[];
  rows: TeamHoursModelRow[];
  /** Averages of the people with a record; null when nobody has one. */
  average: Omit<TeamHoursModelRow, "id" | "name" | "status"> | null;
};

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function oneDecimal(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

/** The displayed values of the report: labels, per-person cells and the averages row. */
export function teamHoursModel(rows: TeamHoursRow[], dates: string[]): TeamHoursModel {
  const hoursOn = (row: TeamHoursRow, date: string) => row.days.find((day) => day.date === date)?.hours ?? 0;
  const modelRows = rows.map<TeamHoursModelRow>((row) => {
    const diff = row.total - row.target;
    return {
      id: row.staffId,
      name: row.name,
      cells: dates.map((date) => formatHoursCell(hoursOn(row, date))),
      total: oneDecimal(row.total),
      target: oneDecimal(row.target),
      diff: formatHoursDiff(diff),
      onTarget: Math.round(diff * 10) / 10 >= 0,
      late: String(row.lateCount),
      status: teamHoursStatus(row),
    };
  });
  const recorded = rows.filter((row) => row.status !== "sin_registro");
  const averageDiff = mean(recorded.map((row) => row.total - row.target));
  const average =
    recorded.length === 0
      ? null
      : {
          cells: dates.map((date) => formatHoursCell(mean(recorded.map((row) => hoursOn(row, date))))),
          total: oneDecimal(mean(recorded.map((row) => row.total))),
          target: oneDecimal(mean(recorded.map((row) => row.target))),
          diff: formatHoursDiff(averageDiff),
          onTarget: Math.round(averageDiff * 10) / 10 >= 0,
          late: oneDecimal(mean(recorded.map((row) => row.lateCount))),
        };
  const dayLabels = dates.map((date) => {
    const short = WEEKDAY_SHORT[weekdayOf(date)];
    return short.charAt(0).toUpperCase() + short.slice(1);
  });
  return { dayLabels, rows: modelRows, average };
}

const STATUS_TONE: Record<TeamHoursStatusTone, string> = {
  success: "bg-tint-success text-success",
  warning: "bg-tint-warning text-warning-ink",
  destructive: "bg-tint-destructive text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

const DOT_TONE: Record<TeamHoursStatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  neutral: "bg-muted-foreground",
};

function StatusPill({ status, dot = false }: { status: TeamHoursModelRow["status"]; dot?: boolean }) {
  return (
    <span
      data-slot="team-hours-status"
      data-tone={status.tone}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-medium",
        STATUS_TONE[status.tone],
      )}
    >
      {dot ? <span aria-hidden="true" className={cn("size-1.5 rounded-full", DOT_TONE[status.tone])} /> : null}
      {status.label}
    </span>
  );
}

const TH = "whitespace-nowrap border-b border-border bg-muted px-3 py-2 font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase";
const TD = "border-b border-accent px-3 py-2 text-[13px]";
const NUM = "text-right font-mono tabular-nums";

function Diff({ value, onTarget }: { value: string; onTarget: boolean }) {
  return <span className={onTarget ? "text-success" : "text-destructive"}>{value}</span>;
}

function FullTable({ model }: { model: TeamHoursModel }) {
  return (
    <table className="w-full min-w-[640px] border-collapse text-left">
      <caption className="sr-only">Horas del equipo por día</caption>
      <thead>
        <tr>
          <th scope="col" className={TH}>
            Persona
          </th>
          {model.dayLabels.map((label, i) => (
            <th key={`${label}-${i}`} scope="col" className={cn(TH, "text-right")}>
              {label}
            </th>
          ))}
          <th scope="col" className={cn(TH, "text-right")}>
            Total
          </th>
          <th scope="col" className={cn(TH, "text-right")}>
            Meta
          </th>
          <th scope="col" className={cn(TH, "text-right")}>
            Diferencia
          </th>
          <th scope="col" className={cn(TH, "text-right")}>
            Retardos
          </th>
          <th scope="col" className={TH}>
            Estado
          </th>
        </tr>
      </thead>
      <tbody>
        {model.rows.map((row) => (
          <tr key={row.id} data-staff={row.id}>
            <th scope="row" className={cn(TD, "font-medium text-foreground")}>
              {row.name}
            </th>
            {row.cells.map((cell, i) => (
              <td key={i} className={cn(TD, NUM)}>
                {cell}
              </td>
            ))}
            <td className={cn(TD, NUM)}>{row.total}</td>
            <td className={cn(TD, NUM, "text-muted-foreground")}>{row.target}</td>
            <td className={cn(TD, NUM)}>
              <Diff value={row.diff} onTarget={row.onTarget} />
            </td>
            <td className={cn(TD, NUM)}>{row.late}</td>
            <td className={TD}>
              <StatusPill status={row.status} />
            </td>
          </tr>
        ))}
      </tbody>
      {model.average ? (
        <tfoot>
          <tr data-testid="team-hours-average">
            <th scope="row" className={cn(TD, "border-b-0 font-medium text-foreground")}>
              {AVERAGE_LABEL}
            </th>
            {model.average.cells.map((cell, i) => (
              <td key={i} className={cn(TD, NUM, "border-b-0")}>
                {cell}
              </td>
            ))}
            <td className={cn(TD, NUM, "border-b-0")}>{model.average.total}</td>
            <td className={cn(TD, NUM, "border-b-0 text-muted-foreground")}>{model.average.target}</td>
            <td className={cn(TD, NUM, "border-b-0")}>
              <Diff value={model.average.diff} onTarget={model.average.onTarget} />
            </td>
            <td className={cn(TD, NUM, "border-b-0")}>{model.average.late}</td>
            <td className={cn(TD, "border-b-0")} />
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}

function TotalsTable({ model }: { model: TeamHoursModel }) {
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">Horas del equipo de la semana</caption>
      <thead>
        <tr>
          <th scope="col" className={TH}>
            Persona
          </th>
          <th scope="col" className={cn(TH, "text-right")}>
            Total / meta
          </th>
          <th scope="col" className={TH}>
            Estado
          </th>
        </tr>
      </thead>
      <tbody>
        {model.rows.map((row) => (
          <tr key={row.id} data-staff={row.id}>
            <th scope="row" className={cn(TD, "font-medium text-foreground")}>
              {row.name}
            </th>
            <td className={cn(TD, NUM)}>
              {row.total} / {row.target} h
            </td>
            <td className={TD}>
              <StatusPill status={row.status} dot />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TeamHoursWidget({ rows, dates, loading = false }: TeamHoursWidgetProps) {
  if (rows.length === 0) {
    return <p className="text-[13px] text-muted-foreground">{TEAM_HOURS_EMPTY}</p>;
  }
  const model = teamHoursModel(rows, dates);
  const full = () => <FullTable model={model} />;
  return (
    <div
      data-slot="team-hours-widget"
      aria-busy={loading || undefined}
      className="anim-in overflow-x-auto rounded-[10px] border border-border"
    >
      <StyleView visual={full} analitico={full} esencial={() => <TotalsTable model={model} />} />
    </div>
  );
}
