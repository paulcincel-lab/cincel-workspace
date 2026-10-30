import { cn } from "@/lib/utils";
import { BASE_STATUS_COLOR, statusBorderClass, statusTintClass } from "@/lib/tasks/status-options";
import type { TaskStatus } from "@/lib/types/core";
import type { ScheduleStatus, ScheduleTask } from "@/lib/types/schedule";

export const STATUS_LABEL: Record<ScheduleStatus, string> = {
  pending: "Pendiente",
  progress: "En proceso",
  done: "Realizada",
};

const STATUS_ICON: Record<ScheduleStatus, string> = {
  pending: "",
  progress: "½",
  done: "✓",
};

/** Schedule statuses read as the matching task status, so they share its color. */
const STATUS_BASE: Record<ScheduleStatus, TaskStatus> = {
  pending: "pendiente",
  progress: "en_proceso",
  done: "completado",
};

function statusClass(status: ScheduleStatus): string {
  const token = BASE_STATUS_COLOR[STATUS_BASE[status]];
  return cn(statusBorderClass(token), statusTintClass(token), "text-foreground");
}

/** Click cycles pending -> progress -> done -> pending. */
const STATUS_NEXT: Record<ScheduleStatus, ScheduleStatus> = {
  pending: "progress",
  progress: "done",
  done: "pending",
};

const STATUS_ACTION_LABEL: Record<ScheduleStatus, string> = {
  pending: "clic para marcar en proceso",
  progress: "clic para marcar realizada",
  done: "clic para volver a pendiente",
};

function fmtSlashDate(iso: string): string {
  // "YYYY-MM-DD" -> "DD/MM"
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

interface TaskCardProps {
  task: ScheduleTask;
  className?: string;
  /** Display-only: no status/flag interaction. Used in Phase 2 boards and the report route. */
  readOnly?: boolean;
  onCycleStatus?: (task: ScheduleTask, next: ScheduleStatus) => void;
  onToggleFlag?: (task: ScheduleTask) => void;
}

export function TaskCard({ task, className, readOnly = false, onCycleStatus, onToggleFlag }: TaskCardProps) {
  const interactive = !readOnly;

  return (
    <div
      className={cn("flex items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-2", className)}
      data-status={task.status}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "f" || event.key === "F") {
                event.preventDefault();
                onToggleFlag?.(task);
              }
            }
          : undefined
      }
    >
      {interactive ? (
        <button
          type="button"
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            statusClass(task.status)
          )}
          aria-label={`Estado: ${STATUS_LABEL[task.status]} — ${STATUS_ACTION_LABEL[task.status]}`}
          title={`${STATUS_LABEL[task.status]} — ${STATUS_ACTION_LABEL[task.status]}`}
          onClick={() => onCycleStatus?.(task, STATUS_NEXT[task.status])}
        >
          {STATUS_ICON[task.status]}
        </button>
      ) : (
        <span
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
            statusClass(task.status)
          )}
          aria-label={`Estado: ${STATUS_LABEL[task.status]}`}
          title={STATUS_LABEL[task.status]}
        >
          {STATUS_ICON[task.status]}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-foreground">{task.tarea}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-1 py-0.5 font-medium">{task.planta}</span>{" "}
          {task.responsable ?? "Sin responsable"} · {fmtSlashDate(task.inicio)}–{fmtSlashDate(task.fin)}
        </p>
      </div>
      {interactive ? (
        <button
          type="button"
          aria-pressed={task.flagged}
          aria-label={task.flagged ? "Quitar atención especial" : "Marcar atención especial"}
          title={task.flagged ? "Quitar atención especial" : "Marcar atención especial"}
          className={cn(
            "shrink-0 rounded p-0.5 transition-colors hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            task.flagged ? "text-amber-500" : "text-muted-foreground/40"
          )}
          onClick={() => onToggleFlag?.(task)}
        >
          ⚠
        </button>
      ) : task.flagged ? (
        <span className="shrink-0 text-amber-500" aria-label="Atención especial" title="Atención especial">
          ⚠
        </span>
      ) : null}
    </div>
  );
}
