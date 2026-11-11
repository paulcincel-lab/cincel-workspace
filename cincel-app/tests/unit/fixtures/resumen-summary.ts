/**
 * `ResumenTareasSummary` computed in JS from task rows, with the semantics of
 * the SQL in `lib/proyectos/resumen-summary-repository.ts` (top-level tasks,
 * open = not completado, due = commitment date). Tests build the summary
 * from their task fixtures with it, and the DB test checks the SQL against it.
 */
import type { QueryClient } from "@tanstack/react-query";

import { daysBetween, nextTasks, type NextTask, type ProjectSummaryInput } from "@/lib/proyectos/project-summary";
import {
  RESUMEN_NEXT_LIMIT,
  resumenGroupLists,
  RESUMEN_RECENT_LIMIT,
  type ResumenManagerBucket,
  type ResumenPhaseBucket,
  type ResumenTareasSummary,
} from "@/lib/proyectos/resumen-summary";
import { qk } from "@/lib/query/keys";
import { isTaskClosed } from "@/lib/tasks/status-options";
import type { TaskListRow, WorkflowRef } from "@/lib/types/core";

const due = (t: TaskListRow) => (t.commitmentDate ? t.commitmentDate.slice(0, 10) : null);
const minOf = (values: (string | null)[]) => values.filter((v): v is string => v !== null).sort()[0] ?? null;
const maxOf = (values: (string | null)[]) => values.filter((v): v is string => v !== null).sort().at(-1) ?? null;
const ref = (t: TaskListRow): WorkflowRef | null =>
  t.workflow ? { id: t.workflow.id, key: t.workflow.key, name: t.workflow.name, sortOrder: t.workflow.sortOrder } : null;

function card(t: TaskListRow, today: string): NextTask {
  const d = due(t);
  return {
    id: t.id,
    title: t.title,
    tramoKey: t.workflow?.key ?? null,
    phase: t.phase?.name ?? null,
    responsable: t.manager,
    dueDate: d,
    daysLate: d !== null && d < today ? daysBetween(d, today) : 0,
    blocked: t.status === "bloqueado",
    subtasks: { done: t.subtaskDone, total: t.subtaskCount },
  };
}

export function resumenSummaryOfRows(
  tasks: TaskListRow[],
  today: string,
  options: { includeAdmin?: boolean; canViewTasks?: boolean } = {},
): ResumenTareasSummary {
  const rows = tasks.filter((t) => !t.archived);
  const live = rows.filter((t) => !t.parentTaskId);
  const isOpen = (t: TaskListRow) => t.status !== "completado";
  const isOverdue = (t: TaskListRow) => isOpen(t) && due(t) !== null && due(t)! < today;
  const late = (t: TaskListRow) => (isOverdue(t) ? daysBetween(due(t)!, today) : 0);

  const byPhase = new Map<string, TaskListRow[]>();
  for (const t of live) {
    const key = `${t.workflowId ?? ""}:${t.phaseId ?? ""}`;
    byPhase.set(key, [...(byPhase.get(key) ?? []), t]);
  }
  const buckets: ResumenPhaseBucket[] = [...byPhase.values()].map((group) => {
    const [first] = group;
    const shown = group.filter((t) => !isTaskClosed(t));
    return {
      workflow: ref(first!),
      phase: first!.phase ? { id: first!.phase.id, name: first!.phase.name, sortOrder: first!.phase.sortOrder } : null,
      total: group.length,
      done: group.filter((t) => t.status === "completado").length,
      closed: group.length - shown.length,
      pendiente: group.filter((t) => t.status === "pendiente").length,
      enProceso: group.filter((t) => t.status === "en_proceso").length,
      blocked: group.filter((t) => t.status === "bloqueado").length,
      overdue: group.filter(isOverdue).length,
      daysLateSum: group.reduce((acc, t) => acc + late(t), 0),
      shownOverdue: shown.filter(isOverdue).length,
      shownDaysLateSum: shown.reduce((acc, t) => acc + late(t), 0),
      shownBlocked: shown.filter((t) => t.status === "bloqueado").length,
      earliestDue: minOf(group.map(due)),
      latestDue: maxOf(group.map(due)),
      earliestCreated: minOf(group.map((t) => t.createdAt?.slice(0, 10) ?? null)),
      latestClosed: maxOf(group.map((t) => (t.closedAt ? t.closedAt.slice(0, 10) : null))),
    };
  });

  const byManager = new Map<string, TaskListRow[]>();
  for (const t of rows) {
    if (!t.managerId) continue;
    const key = `${t.managerId}:${t.workflowId ?? ""}`;
    byManager.set(key, [...(byManager.get(key) ?? []), t]);
  }
  const managers: ResumenManagerBucket[] = [...byManager.values()].map((group) => {
    const own = group.filter((t) => !t.parentTaskId);
    return {
      staffId: group[0]!.managerId!,
      workflow: ref(group[0]!),
      all: group.length,
      live: own.length,
      liveOpen: own.filter(isOpen).length,
      liveOverdue: own.filter(isOverdue).length,
      liveBlocked: own.filter((t) => t.status === "bloqueado").length,
    };
  });

  const recent = live
    .filter(isOpen)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id.localeCompare(a.id))
    .slice(0, RESUMEN_RECENT_LIMIT)
    .map((t) => card(t, today));

  return {
    canViewTasks: options.canViewTasks ?? true,
    includeAdmin: options.includeAdmin ?? false,
    today,
    buckets,
    managers,
    next: nextTasks(rows, today, RESUMEN_NEXT_LIMIT),
    recent,
  };
}

/** The server's "retraso" order: overdue, open, closed; each by due date (undated last), then id. */
export function retrasoOrder(rows: TaskListRow[], today: string): TaskListRow[] {
  const rank = (t: TaskListRow) => {
    const d = t.commitmentDate ?? t.deliveryDate ?? null;
    if (isTaskClosed(t)) return 2;
    return d !== null && d < today ? 0 : 1;
  };
  const dueOf = (t: TaskListRow) => t.commitmentDate ?? t.deliveryDate ?? "9999-12-31";
  return [...rows].sort((a, b) => rank(a) - rank(b) || dueOf(a).localeCompare(dueOf(b)) || a.id.localeCompare(b.id));
}

/**
 * Seeds what the Resumen page prefetches for `rows`: the task numbers
 * (`qk.proyectos.resumenSummary(id)`) and the first page of every
 * "Tareas por tramo" group (`qk.tareas.list(f)`, all its rows, "retraso" order).
 */
export function seedResumenTasks(
  client: QueryClient,
  input: Pick<ProjectSummaryInput, "project" | "tramoCatalog" | "today">,
  rows: TaskListRow[],
  options: { includeAdmin?: boolean; hideCompleted?: boolean; pageSize?: number } = {},
): ResumenTareasSummary {
  const summary = resumenSummaryOfRows(rows, input.today, { includeAdmin: options.includeAdmin ?? false });
  client.setQueryData(qk.proyectos.resumenSummary(input.project.id), summary);
  const live = rows.filter((t) => !t.parentTaskId && !t.archived && (!options.hideCompleted || !isTaskClosed(t)));
  for (const list of resumenGroupLists(input, summary, options.hideCompleted ?? false)) {
    const own = retrasoOrder(live.filter((t) => (t.workflowId ?? "admin") === list.id), input.today);
    const size = options.pageSize ?? own.length;
    client.setQueryData(qk.tareas.list(list.filters), {
      pages: [{ rows: own.slice(0, size), nextCursor: own.length > size ? "next" : null, total: own.length }],
      pageParams: [null],
    });
  }
  return summary;
}
