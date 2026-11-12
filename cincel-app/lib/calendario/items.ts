/** Row → CalItem mapping (BE §5.2, §5.3). Pure and client-safe. Task mapping lives here; meetings map in `calendario-events-range.ts`. */
import { BASE_STATUS_LABEL } from "@/lib/tasks/status-options";
import { tramoColorSlot } from "@/lib/tramos/tramo-color";
import type { CalItem, CalPersonRef, CalTaskItem, CalTramoRef, CalendarioFilters } from "@/lib/types/calendario";
import type { TaskPriority, TaskStatus } from "@/lib/types/core";

/** Items per day the range loader returns, by vista (`mes` 3, `semana` 12, `dia` 200). */
export const PER_DAY_LIMIT = { mes: 3, semana: 12, dia: 200 } as const;

/** The due date a task shows: commitment date, else delivery date. */
export function dueDateOf(t: { commitmentDate: string | null; deliveryDate: string | null }): {
  date: string;
  field: "commitmentDate" | "deliveryDate";
} | null {
  if (t.commitmentDate) return { date: t.commitmentDate, field: "commitmentDate" };
  if (t.deliveryDate) return { date: t.deliveryDate, field: "deliveryDate" };
  return null;
}

/** Open task whose due date is before `today` (org midnight). */
export function isOverdue(t: { date: string; completed: boolean }, today: string): boolean {
  return !t.completed && t.date < today;
}

/** The tramo colour slot of a workflow row, or null. A missing `sortOrder` counts as 0 (no slot from order). */
export function tramoRefOf(
  w: { id: string; key: string | null; name: string; colorSlot: number | null; sortOrder?: number | null } | null,
): CalTramoRef | null {
  if (!w) return null;
  const slot = tramoColorSlot({ key: w.key ?? "", sortOrder: w.sortOrder ?? 0, colorSlot: w.colorSlot });
  return { id: w.id, key: w.key, name: w.name, colorSlot: slot };
}

/** What the range query selects for one task (BE §5.3). */
export type TaskItemRow = {
  id: string;
  title: string;
  commitmentDate: string | null;
  deliveryDate: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  customStatusName: string | null;
  customStatusCloses: boolean | null;
  managerId: string | null;
  managerName: string | null;
  parentTaskId: string | null;
  estimatedHours: number | null;
  templateHours: number | null;
  projectId: string | null;
  projectName: string | null;
  workflowId: string | null;
  workflowKey: string | null;
  workflowName: string | null;
  workflowSortOrder: number | null;
  workflowColorSlot: number | null;
  phaseId: string | null;
  phaseName: string | null;
  /** Waits on an open task it depends on. */
  waiting: boolean;
  support: CalPersonRef[];
};

/** A task row as a `CalTaskItem`. */
export function taskRowToItem(row: TaskItemRow, ctx: { today: string; canEdit: boolean }): CalTaskItem {
  const due = dueDateOf(row);
  if (!due) throw new Error("INVALID: calendar task without a due date");
  const completed = row.status === "completado" || row.customStatusCloses === true;
  const hoursSource: CalTaskItem["hoursSource"] =
    row.estimatedHours !== null ? "task" : row.templateHours !== null ? "template" : "default";
  return {
    kind: "task",
    id: `t:${row.id}`,
    taskId: row.id,
    title: row.title,
    date: due.date,
    dateField: due.field,
    project: row.projectId ? { id: row.projectId, name: row.projectName ?? "" } : null,
    tramo: row.workflowId
      ? tramoRefOf({
          id: row.workflowId,
          key: row.workflowKey,
          name: row.workflowName ?? "",
          colorSlot: row.workflowColorSlot,
          sortOrder: row.workflowSortOrder,
        })
      : null,
    phase: row.phaseId ? { id: row.phaseId, name: row.phaseName ?? "" } : null,
    status: row.status,
    statusLabel: row.customStatusName ?? BASE_STATUS_LABEL[row.status],
    priority: row.priority,
    manager: row.managerId ? { id: row.managerId, name: row.managerName ?? "" } : null,
    support: row.support,
    overdue: isOverdue({ date: due.date, completed }, ctx.today),
    completed,
    blocked: !completed && (row.status === "bloqueado" || row.waiting),
    hours: row.estimatedHours ?? row.templateHours ?? 1,
    hoursSource,
    parentTaskId: row.parentTaskId,
    canEdit: ctx.canEdit,
  };
}

/**
 * The filters a viewer may apply: `quien` is forced to `yo` without
 * `canViewTeamCalendar`, `responsable` only counts with `todos` (BE §5.1, §13).
 */
export function effectiveFilters(filters: CalendarioFilters, canViewTeamCalendar: boolean): CalendarioFilters {
  const quien = canViewTeamCalendar ? filters.quien : "yo";
  return { ...filters, quien, responsable: quien === "todos" ? filters.responsable : null };
}

const PRIORITY_RANK: Record<TaskPriority, number> = { alta: 0, media: 1, baja: 2 };

/** Rank within a day: events 0, overdue tasks 1, open tasks 2, completed 3. */
function dayRank(item: CalItem): number {
  if (item.kind === "event") return 0;
  if (item.completed) return 3;
  return item.overdue ? 1 : 2;
}

/** Order within a day: events by start, overdue tasks, open tasks by priority, completed. */
export function sortDayItems(items: CalItem[]): CalItem[] {
  return [...items].sort((a, b) => {
    const rank = dayRank(a) - dayRank(b);
    if (rank !== 0) return rank;
    if (a.kind === "event" && b.kind === "event") {
      return a.start < b.start ? -1 : a.start > b.start ? 1 : a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
    }
    if (a.kind === "task" && b.kind === "task") {
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
    }
    return 0;
  });
}
