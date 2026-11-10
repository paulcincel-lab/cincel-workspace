"use client";

import type { ReactNode } from "react";

import type { StatusCount } from "@/lib/proyectos/project-summary";
import type { TaskStatus } from "@/lib/types/core";

/**
 * "Tareas por estatus" (Visual Resumen): a 150 px donut, one arc per status
 * with 2 px gaps and the total in the center, its legend, and a visually
 * hidden table with the same numbers. Colors are the status tokens: En
 * proceso `chart-2`, Pendiente `chart-3`, Bloqueado `destructive`,
 * Completado `chart-1`. With no task it renders `empty` instead.
 */
export type StatusDonutWidgetProps = {
  counts: StatusCount[];
  /** Rendered in place of the donut and legend when every count is 0. */
  empty?: ReactNode;
};

export const STATUS_TOKEN: Record<TaskStatus, string> = {
  en_proceso: "var(--chart-2)",
  pendiente: "var(--chart-3)",
  bloqueado: "var(--destructive)",
  completado: "var(--chart-1)",
};

const R = 60;
const STROKE = 22;
const CIRCUMFERENCE = 2 * Math.PI * R;
const GAP = 2;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "7 tareas: 2 en proceso, 3 pendientes, 1 bloqueada, 1 completada". */
export function donutLabel(counts: StatusCount[]): string {
  const of = (status: TaskStatus) => counts.find((c) => c.status === status)?.count ?? 0;
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  return `${plural(total, "tarea", "tareas")}: ${of("en_proceso")} en proceso, ${plural(of("pendiente"), "pendiente", "pendientes")}, ${plural(of("bloqueado"), "bloqueada", "bloqueadas")}, ${plural(of("completado"), "completada", "completadas")}`;
}

export function StatusDonutWidget({ counts, empty }: StatusDonutWidgetProps): ReactNode {
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  if (total === 0) return empty ?? null;

  const segments = counts.filter((c) => c.count > 0);
  const gap = segments.length > 1 ? GAP : 0;
  let offset = 0;
  const arcs = segments.map((c) => {
    const length = (c.count / total) * CIRCUMFERENCE;
    const arc = { status: c.status, dash: Math.max(0, length - gap), offset };
    offset += length;
    return arc;
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="ring-in relative size-[150px] flex-none">
        <svg width="150" height="150" viewBox="0 0 160 160" role="img" aria-label={donutLabel(counts)}>
          {arcs.map((arc) => (
            <circle
              key={arc.status}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={STATUS_TOKEN[arc.status]}
              strokeWidth={STROKE}
              strokeDasharray={`${arc.dash} ${CIRCUMFERENCE - arc.dash}`}
              strokeDashoffset={-arc.offset}
              transform="rotate(-90 80 80)"
            />
          ))}
        </svg>
        <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[26px] font-semibold leading-none tabular-nums text-foreground">{total}</span>
          <span className="text-[11.5px] text-muted-foreground">tareas</span>
        </div>
      </div>
      <ul aria-hidden="true" className="flex min-w-[140px] flex-1 flex-col gap-2.5 text-[13px]">
        {counts.map((c) => (
          <li key={c.status} className="flex items-center gap-2">
            <span className="size-2.5 flex-none rounded-[3px]" style={{ background: STATUS_TOKEN[c.status] }} />
            <span className="flex-1 text-foreground">{c.label}</span>
            <span className="font-mono tabular-nums text-foreground">{c.count}</span>
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>Tareas por estatus</caption>
        <thead>
          <tr>
            <th scope="col">Estatus</th>
            <th scope="col">Tareas</th>
          </tr>
        </thead>
        <tbody>
          {counts.map((c) => (
            <tr key={c.status}>
              <th scope="row">{c.label}</th>
              <td>{c.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
