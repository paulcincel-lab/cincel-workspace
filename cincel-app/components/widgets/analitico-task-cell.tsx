import type { ReactNode } from "react";

import { daysLateLabel, type AnaliticoRow } from "@/components/tareas/tareas-analitico";
import { TASK_SUPPORT_COLUMN } from "@/components/tareas/task-cell-edits";
import { SUPPORT_COLUMN_LABEL } from "@/components/tareas/task-table-copy";
import { CLEAR_LABEL } from "@/components/widgets/editable-cell";
import { PeopleStack } from "@/components/widgets/PeopleStack";
import { statusDotClass } from "@/lib/tasks/status-options";
import { tramoColorVar } from "@/lib/tramos/compat";
import { cn } from "@/lib/utils";

/**
 * The cells of a Tareas · Analítico task row (`ANALITICO_COLUMNS` over
 * `AnaliticoRow`), for every table that lists tasks in that shape: the
 * Tareas table and the project rows of Proyectos · Analítico (#1042).
 * Undefined: the table formats the value itself.
 */
export function renderAnaliticoTaskCell(columnKey: string, row: AnaliticoRow): ReactNode | undefined {
  switch (columnKey) {
    case "tarea":
      return (
        <span title={row.tarea} className="block max-w-[420px] truncate">
          {row.tarea}
        </span>
      );
    case "tramo": {
      const tramo = row.task.workflow;
      if (!tramo) return <span className="text-muted-foreground">{row.tramo}</span>;
      return (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full" style={{ background: tramoColorVar(tramo.key, tramo.sortOrder) }} />
          {row.tramo}
        </span>
      );
    }
    case "fase":
      return row.task.phase ? (
        <span title={row.fase} className="block max-w-[180px] truncate">
          {row.fase}
        </span>
      ) : (
        <span className="text-muted-foreground">{CLEAR_LABEL.phase}</span>
      );
    case "responsable":
      return (
        <span title={row.responsable} className="block max-w-[180px] truncate">
          {row.responsable}
        </span>
      );
    case TASK_SUPPORT_COLUMN:
      return <PeopleStack people={row.task.support} label={SUPPORT_COLUMN_LABEL} />;
    case "estatus":
      return (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("size-[7px] shrink-0 rounded-full", statusDotClass(row.statusToken))} />
          {row.estatus}
        </span>
      );
    case "vence":
      return <span className={row.overdue ? "text-destructive" : undefined}>{row.vence}</span>;
    case "diasRetraso":
      if (row.diasRetraso <= 0) return "—";
      return (
        <>
          <span aria-hidden="true">{row.diasRetraso}</span>
          <span className="sr-only">{daysLateLabel(row.diasRetraso)}</span>
        </>
      );
    default:
      return undefined;
  }
}
