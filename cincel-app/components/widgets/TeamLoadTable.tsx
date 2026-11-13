"use client";

import type { ReactNode } from "react";

import { LoadBar } from "@/components/v2/status/LoadBar";
import type { TeamLoadRow } from "@/lib/proyectos/project-summary";
import { cn } from "@/lib/utils";

/**
 * "Carga del equipo" of Proyecto · Resumen (Analítico): one row per person of
 * the project team, sorted by load. `Persona` (name + "{etapa} · {rol}"),
 * `Aquí` (open tasks in this project), `Venc.` (overdue here, `destructive`
 * above 0) and `Carga total` (70 × 6 px bar plus the percentage, both in the
 * `OCCUPANCY_HEAT` tone: success, warning, destructive).
 */
export type TeamLoadTableProps = {
  rows: TeamLoadRow[];
  /** Accessible table caption (visually hidden). */
  caption?: string;
};

export const TEAM_LOAD_EMPTY_TEXT = "Este proyecto aún no tiene equipo";

const TONE_TEXT: Record<TeamLoadRow["tone"], string> = {
  ok: "text-success",
  warn: "text-warning",
  critical: "text-destructive",
};

const TH = "bg-muted px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[.08em] text-muted-foreground";
const TD = "border-b border-accent px-3 py-[7px] text-[12.5px]";

export function TeamLoadTable({ rows, caption = "Carga del equipo" }: TeamLoadTableProps): ReactNode {
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-[12.5px] text-muted-foreground">{TEAM_LOAD_EMPTY_TEXT}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[380px] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(TH, "sticky left-0 pl-4")}>
              Persona
            </th>
            <th scope="col" className={cn(TH, "text-right")}>
              Aquí
            </th>
            <th scope="col" className={cn(TH, "text-right")}>
              Venc.
            </th>
            <th scope="col" className={cn(TH, "text-right")}>
              Carga total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.staffId}>
              <th scope="row" className={cn(TD, "sticky left-0 max-w-[220px] bg-card pl-4 font-normal")}>
                <span className="block truncate font-medium text-foreground" title={row.name}>
                  {row.name}
                </span>
                {row.context ? (
                  <span className="block truncate text-xs text-muted-foreground" title={row.context}>
                    {row.context}
                  </span>
                ) : null}
              </th>
              <td className={cn(TD, "text-right font-mono tabular-nums")}>{row.here}</td>
              <td className={cn(TD, "text-right font-mono tabular-nums", row.overdueHere > 0 && "text-destructive")}>
                {row.overdueHere}
              </td>
              <td className={cn(TD, "text-right")}>
                <span className="inline-flex items-center justify-end gap-2">
                  <LoadBar
                    className="h-1.5 w-[70px]"
                    tone={row.tone}
                    segments={[{ percent: Math.min(100, row.loadPct), label: `${row.loadPct} %` }]}
                  />
                  <span className={cn("w-12 font-mono tabular-nums", TONE_TEXT[row.tone])}>{row.loadPct} %</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
