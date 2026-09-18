import { cn } from "@/lib/utils";
import type { ScheduleStatus, ScheduleTask } from "@/lib/types/schedule";

const STATUS_LABEL: Record<ScheduleStatus, string> = {
  pending: "Pendiente",
  progress: "En proceso",
  done: "Realizada",
};

const STATUS_ICON: Record<ScheduleStatus, string> = {
  pending: "",
  progress: "½",
  done: "✓",
};

const STATUS_CLASS: Record<ScheduleStatus, string> = {
  pending: "border-border bg-background text-muted-foreground",
  progress: "border-yellow-500/50 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  done: "border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400",
};

function fmtSlashDate(iso: string): string {
  // "YYYY-MM-DD" -> "DD/MM"
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

interface TaskCardProps {
  task: ScheduleTask;
  className?: string;
}

/** Read-only display of a schedule task: status marker, text, meta, flag. Phase 3 adds click handlers. */
export function TaskCard({ task, className }: TaskCardProps) {
  return (
    <div
      className={cn("flex items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-2", className)}
      data-status={task.status}
    >
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          STATUS_CLASS[task.status]
        )}
        aria-label={`Estado: ${STATUS_LABEL[task.status]}`}
        title={STATUS_LABEL[task.status]}
      >
        {STATUS_ICON[task.status]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-foreground">{task.tarea}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-1 py-0.5 font-medium">{task.planta}</span>{" "}
          {task.responsable ?? "Sin responsable"} · {fmtSlashDate(task.inicio)}–{fmtSlashDate(task.fin)}
        </p>
      </div>
      {task.flagged ? (
        <span className="shrink-0 text-amber-500" aria-label="Atención especial" title="Atención especial">
          ⚠
        </span>
      ) : null}
    </div>
  );
}
