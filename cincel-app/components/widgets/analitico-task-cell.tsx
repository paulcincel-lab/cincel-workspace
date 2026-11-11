import type { ReactNode } from "react";

import { daysLateLabel, type AnaliticoRow } from "@/components/tareas/tareas-analitico";
import { TASK_SUPPORT_COLUMN } from "@/components/tareas/task-cell-edits";
import { SUPPORT_COLUMN_LABEL } from "@/components/tareas/task-table-copy";
import { CLEAR_LABEL } from "@/components/widgets/editable-cell";
import { PeopleStack } from "@/components/widgets/PeopleStack";
import { Badge } from "@/components/ui/shadcn/badge";
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
        <span className="inline-flex max-w-[420px] min-w-0 items-center gap-1.5">
          <span title={row.tarea} className="truncate">
            {row.tarea}
          </span>
          <SubtaskProgressChip task={row.task} />
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

/** "2/5 subtareas completadas": the progress chip after a parent's title (#1048). */
export function subtaskProgressLabel(done: number, total: number): string {
  return `${done} de ${total} ${total === 1 ? "subtarea completada" : "subtareas completadas"}`;
}

/** The "2/5" chip of a task with subtasks (none on a subtask: one level only). */
export function SubtaskProgressChip({ task }: { task: { subtaskCount: number; subtaskDone: number; parentTaskId: string | null } }) {
  if (task.parentTaskId !== null || task.subtaskCount === 0) return null;
  return (
    // Hidden from the title link's name; the row's Subtareas column says the same to screen readers.
    <Badge
      variant="secondary"
      aria-hidden="true"
      title={subtaskProgressLabel(task.subtaskDone, task.subtaskCount)}
      data-slot="subtask-progress"
      className="shrink-0 px-1.5 py-px font-mono text-[10.5px]"
    >
      {task.subtaskDone}/{task.subtaskCount}
    </Badge>
  );
}
