import "server-only";

import { and, eq, isNull, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/client";
import { projects, staff, taskStatuses, tasks, workflowPhases, workflows } from "@/lib/db/schema";
import { daysBetween, type NextTask } from "@/lib/proyectos/project-summary";
import {
  RESUMEN_NEXT_LIMIT,
  RESUMEN_RECENT_LIMIT,
  type ResumenManagerBucket,
  type ResumenPhaseBucket,
} from "@/lib/proyectos/resumen-summary";
import type { WorkflowRef } from "@/lib/types/core";

/**
 * The SQL behind `qk.proyectos.resumenSummary(id)` (#1051): the Resumen's
 * task numbers as aggregates, so the client never loads the project's task
 * list. The task set is the one the Resumen counted before (the project
 * Tareas tab read): live, not archived tasks of a live project, admin tasks
 * only with `includeAdmin`. Open is any status but completado and the due
 * date is the commitment date, as the Resumen counts them.
 */

/** Rows the "Lo que sigue" candidates read before the exact order (title in es-MX) is applied. */
const NEXT_CANDIDATES = 20;

function baseWhere(projectId: string, includeAdmin: boolean): SQL {
  return and(
    eq(tasks.projectId, projectId),
    isNull(tasks.deletedAt),
    isNull(projects.deletedAt),
    eq(tasks.archived, false),
    includeAdmin ? undefined : ne(tasks.kind, "admin"),
  )!;
}

const done = sql`${tasks.status} = 'completado'`;
const open = sql`${tasks.status} <> 'completado'`;
/** `isTaskClosed`: completado, or a live custom status that closes (joined as `taskStatuses`). */
const closed = sql`(${tasks.status} = 'completado' or coalesce(${taskStatuses.closes}, false))`;
const overdue = (today: string) => sql`(${open} and ${tasks.commitmentDate} < ${today}::date)`;
const daysLate = (today: string) => sql`(${today}::date - ${tasks.commitmentDate})`;
const int = (expr: SQL) => sql<number>`(${expr})::int`;
const utcDay = (expr: SQL) => sql<string | null>`to_char((${expr}) at time zone 'UTC', 'YYYY-MM-DD')`;

function workflowOf(r: { workflowId: string | null; workflowKey: string | null; workflowName: string | null; workflowSort: number | null }): WorkflowRef | null {
  return r.workflowId ? { id: r.workflowId, key: r.workflowKey ?? "", name: r.workflowName ?? "", sortOrder: r.workflowSort ?? 0 } : null;
}

/** Per etapa and fase: the top-level tasks' counts and dates (one grouped statement). */
export async function resumenPhaseBuckets(projectId: string, includeAdmin: boolean, today: string): Promise<ResumenPhaseBucket[]> {
  const rows = await db
    .select({
      workflowId: tasks.workflowId,
      workflowKey: workflows.key,
      workflowName: workflows.name,
      workflowSort: workflows.sortOrder,
      phaseId: tasks.phaseId,
      phaseName: workflowPhases.name,
      phaseSort: workflowPhases.sortOrder,
      total: int(sql`count(*)`),
      done: int(sql`count(*) filter (where ${done})`),
      closed: int(sql`count(*) filter (where ${closed})`),
      pendiente: int(sql`count(*) filter (where ${tasks.status} = 'pendiente')`),
      enProceso: int(sql`count(*) filter (where ${tasks.status} = 'en_proceso')`),
      blocked: int(sql`count(*) filter (where ${tasks.status} = 'bloqueado')`),
      overdue: int(sql`count(*) filter (where ${overdue(today)})`),
      daysLateSum: int(sql`coalesce(sum(${daysLate(today)}) filter (where ${overdue(today)}), 0)`),
      shownOverdue: int(sql`count(*) filter (where ${overdue(today)} and not ${closed})`),
      shownDaysLateSum: int(sql`coalesce(sum(${daysLate(today)}) filter (where ${overdue(today)} and not ${closed}), 0)`),
      shownBlocked: int(sql`count(*) filter (where ${tasks.status} = 'bloqueado' and not ${closed})`),
      earliestDue: sql<string | null>`min(${tasks.commitmentDate})::text`,
      latestDue: sql<string | null>`max(${tasks.commitmentDate})::text`,
      earliestCreated: utcDay(sql`min(${tasks.createdAt})`),
      latestClosed: utcDay(sql`max(${tasks.closedAt})`),
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(workflows, eq(workflows.id, tasks.workflowId))
    .leftJoin(workflowPhases, eq(workflowPhases.id, tasks.phaseId))
    .leftJoin(taskStatuses, and(eq(taskStatuses.id, tasks.customStatusId), isNull(taskStatuses.deletedAt)))
    .where(and(baseWhere(projectId, includeAdmin), isNull(tasks.parentTaskId)))
    .groupBy(
      tasks.workflowId,
      workflows.key,
      workflows.name,
      workflows.sortOrder,
      tasks.phaseId,
      workflowPhases.name,
      workflowPhases.sortOrder,
    )
    .orderBy(sql`${workflows.sortOrder} asc nulls last`, sql`${workflowPhases.sortOrder} asc nulls last`);
  return rows.map((r) => ({
    workflow: workflowOf(r),
    phase: r.phaseId && r.phaseName !== null ? { id: r.phaseId, name: r.phaseName, sortOrder: r.phaseSort ?? 0 } : null,
    total: r.total,
    done: r.done,
    closed: r.closed,
    pendiente: r.pendiente,
    enProceso: r.enProceso,
    blocked: r.blocked,
    overdue: r.overdue,
    daysLateSum: r.daysLateSum,
    shownOverdue: r.shownOverdue,
    shownDaysLateSum: r.shownDaysLateSum,
    shownBlocked: r.shownBlocked,
    earliestDue: r.earliestDue,
    latestDue: r.latestDue,
    earliestCreated: r.earliestCreated,
    latestClosed: r.latestClosed,
  }));
}

/** Per Responsable and etapa: every task (subtasks included) and the top-level counts (one grouped statement). */
export async function resumenManagerBuckets(projectId: string, includeAdmin: boolean, today: string): Promise<ResumenManagerBucket[]> {
  const live = sql`${tasks.parentTaskId} is null`;
  const rows = await db
    .select({
      staffId: sql<string>`${tasks.managerId}`,
      workflowId: tasks.workflowId,
      workflowKey: workflows.key,
      workflowName: workflows.name,
      workflowSort: workflows.sortOrder,
      all: int(sql`count(*)`),
      live: int(sql`count(*) filter (where ${live})`),
      liveOpen: int(sql`count(*) filter (where ${live} and ${open})`),
      liveOverdue: int(sql`count(*) filter (where ${live} and ${overdue(today)})`),
      liveBlocked: int(sql`count(*) filter (where ${live} and ${tasks.status} = 'bloqueado')`),
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(workflows, eq(workflows.id, tasks.workflowId))
    .where(and(baseWhere(projectId, includeAdmin), sql`${tasks.managerId} is not null`))
    .groupBy(tasks.managerId, tasks.workflowId, workflows.key, workflows.name, workflows.sortOrder);
  return rows.map((r) => ({
    staffId: r.staffId,
    workflow: workflowOf(r),
    all: r.all,
    live: r.live,
    liveOpen: r.liveOpen,
    liveOverdue: r.liveOverdue,
    liveBlocked: r.liveBlocked,
  }));
}

/** The open top-level tasks as "Lo que sigue" cards: `urgent` the most urgent ones, else the newest. */
async function openTaskCards(projectId: string, includeAdmin: boolean, today: string, by: "urgent" | "newest"): Promise<NextTask[]> {
  const child = alias(tasks, "child_task");
  const subtasks = db
    .select({
      parentId: sql<string>`${child.parentTaskId}`.as("parent_id"),
      total: sql<number>`count(*)::int`.as("sub_total"),
      done: sql<number>`(count(*) filter (where ${child.status} = 'completado'))::int`.as("sub_done"),
    })
    .from(child)
    .where(and(isNull(child.deletedAt), eq(child.archived, false), sql`${child.parentTaskId} is not null`))
    .groupBy(child.parentTaskId)
    .as("sub_agg");
  const urgent = sql`(${tasks.status} = 'bloqueado' or ${overdue(today)})`;
  const late = sql`(case when ${overdue(today)} then ${daysLate(today)} else 0 end)`;
  const order =
    by === "urgent"
      ? [sql`${urgent} desc`, sql`(case when ${urgent} then ${late} else 0 end) desc`, sql`${tasks.commitmentDate} asc nulls last`, sql`${tasks.title} asc`]
      : [sql`${tasks.createdAt} desc`, sql`${tasks.id} desc`];
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      due: sql<string | null>`${tasks.commitmentDate}::text`,
      workflowKey: workflows.key,
      phaseName: workflowPhases.name,
      managerId: tasks.managerId,
      managerName: staff.name,
      subTotal: sql<number>`coalesce(${subtasks.total}, 0)::int`,
      subDone: sql<number>`coalesce(${subtasks.done}, 0)::int`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(workflows, eq(workflows.id, tasks.workflowId))
    .leftJoin(workflowPhases, eq(workflowPhases.id, tasks.phaseId))
    .leftJoin(staff, eq(staff.id, tasks.managerId))
    .leftJoin(subtasks, eq(subtasks.parentId, tasks.id))
    .where(and(baseWhere(projectId, includeAdmin), isNull(tasks.parentTaskId), open))
    .orderBy(...order)
    .limit(by === "urgent" ? NEXT_CANDIDATES : RESUMEN_RECENT_LIMIT);
  const cards = rows.map(
    (r): NextTask => ({
      id: r.id,
      title: r.title,
      etapaKey: r.workflowKey ?? null,
      phase: r.phaseName ?? null,
      responsable: r.managerId ? { id: r.managerId, name: r.managerName ?? "" } : null,
      dueDate: r.due,
      daysLate: r.due !== null && r.due < today ? daysBetween(r.due, today) : 0,
      blocked: r.status === "bloqueado",
      subtasks: { done: r.subDone, total: r.subTotal },
    }),
  );
  if (by === "newest") return cards;
  // The `nextTasks` order exactly (es-MX titles), then the first ones.
  const isUrgent = (t: NextTask) => t.blocked || t.daysLate > 0;
  cards.sort((a, b) => {
    if (isUrgent(a) !== isUrgent(b)) return isUrgent(a) ? -1 : 1;
    if (isUrgent(a) && a.daysLate !== b.daysLate) return b.daysLate - a.daysLate;
    if (a.dueDate !== b.dueDate) {
      if (a.dueDate === null) return 1;
      if (b.dueDate === null) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    return a.title.localeCompare(b.title, "es");
  });
  return cards.slice(0, RESUMEN_NEXT_LIMIT);
}

/** Every aggregate of the summary, in four statements at once. */
export async function resumenTaskAggregates(
  projectId: string,
  includeAdmin: boolean,
  today: string,
): Promise<{ buckets: ResumenPhaseBucket[]; managers: ResumenManagerBucket[]; next: NextTask[]; recent: NextTask[] }> {
  const [buckets, managers, next, recent] = await Promise.all([
    resumenPhaseBuckets(projectId, includeAdmin, today),
    resumenManagerBuckets(projectId, includeAdmin, today),
    openTaskCards(projectId, includeAdmin, today, "urgent"),
    openTaskCards(projectId, includeAdmin, today, "newest"),
  ]);
  return { buckets, managers, next, recent };
}
