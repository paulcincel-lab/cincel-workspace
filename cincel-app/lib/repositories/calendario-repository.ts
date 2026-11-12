/**
 * Range SQL, day aggregates and load per person/day (Calendario BE §5). Server-only.
 * Reads never load every task: a range returns its items plus per-day aggregates computed in SQL.
 * Tasks are read here; meetings join in the meetings issue and hours in the load issue, so
 * `events` counts 0 and `hours` / `workday` / `loadLabel` are null until then.
 */
import "server-only";

import { and, asc, desc, eq, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveActivitiesCapabilities, resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { viewerScopeOf } from "@/lib/auth/viewer-scope";
import { emptyDay } from "@/lib/calendario/empty";
import { PER_DAY_LIMIT, effectiveFilters, taskRowToItem, type TaskItemRow } from "@/lib/calendario/items";
import { db } from "@/lib/db/client";
import {
  projects,
  staff,
  taskStatuses,
  taskSupport,
  tasks,
  workflowPhases,
  workflowTaskTemplates,
  workflows,
} from "@/lib/db/schema";
import { todayInAppTimeZone } from "@/lib/project-flow/admin-tasks";
import { openTaskSql, taskDueSql, whereFilters } from "@/lib/repositories/tasks-repository";
import { stubDefault } from "@/lib/stubs";
import { addDays } from "@/lib/time-tracking/local-time";
import {
  eventDayAggregates,
  eventItemsInRange,
  eventKpis,
  mergeEventDays,
  mergeEventItems,
  mergeEventKpis,
} from "@/lib/repositories/calendario-events-range";
import type {
  CalDay,
  CalItem,
  CalKpis,
  CalPersonRef,
  CalendarioFilters,
  CalendarioListInput,
  CalendarioListPage,
  CalendarioRangeInput,
  DayLoad,
} from "@/lib/types/calendario";
import type { TaskFilters } from "@/lib/types/core";

/** Default and maximum rows of a list page (BE §5.4). */
export const LIST_PAGE_DEFAULT = 50;
export const LIST_PAGE_MAX = 100;

/** Days a day list can hold (the longest range the actions accept). */
const MAX_DAYS = 92;

type Scope = {
  /** The task filters, window and viewer rules; null when the filters match no task (`mostrar = reuniones`). */
  where: SQL | undefined;
  none: boolean;
  canEdit: boolean;
};

/**
 * One scope for every read: the viewer rules of `listTasks` (`ViewerScope`, admin tasks only for
 * administrators), the Calendario filters (BE §5.1) and the due-date window `from..to`.
 */
function taskScope(user: AuthenticatedUser, from: string, to: string, filters: CalendarioFilters): Scope {
  const viewer = viewerScopeOf(user);
  const eff = effectiveFilters(filters, resolveCalendarCapabilities(user).canViewTeamCalendar);
  const f: TaskFilters = {};
  if (eff.quien === "yo") {
    if (eff.apoyo) f.involvesStaffId = viewer.staffId;
    else f.managerId = viewer.staffId;
    // An administrator's own admin tasks show in "yo" (kindCondition drops them from anyone else's).
    if (viewer.isAdmin) f.kind = ["workflow", "usuario", "admin"];
  } else if (eff.responsable) {
    f.managerId = eff.responsable;
  }
  if (eff.proyectos.length > 0) f.projectIds = eff.proyectos;
  if (eff.tramo === "none") f.withoutWorkflow = true;
  else if (eff.tramo) f.workflowId = eff.tramo;
  const due = taskDueSql();
  const where = and(
    whereFilters(f, viewer),
    sql`${due} between ${from}::date and ${to}::date`,
    eff.ocultarCompletadas ? openTaskSql() : undefined,
  );
  return { where, none: eff.mostrar === "reuniones", canEdit: resolveActivitiesCapabilities(user).canCreateActivity };
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < MAX_DAYS; d = addDays(d, 1)) out.push(d);
  return out;
}

/** One query: a row per day of the range (empty days return zeros). */
export async function dayAggregates(user: AuthenticatedUser, input: CalendarioRangeInput, today: string): Promise<CalDay[]> {
  const scope = taskScope(user, input.from, input.to, input.filters);
  const byDay = new Map<string, { tasks: number; overdue: number; completed: number }>();
  if (!scope.none) {
    const due = taskDueSql();
    const rows = await db
      .select({
        day: sql<string>`(${due})::text`,
        tasks: sql<number>`count(*)::int`,
        overdue: sql<number>`(count(*) filter (where ${openTaskSql()} and ${due} < ${today}::date))::int`,
        completed: sql<number>`(count(*) filter (where not ${openTaskSql()}))::int`,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(scope.where)
      .groupBy(due);
    for (const r of rows) byDay.set(r.day, { tasks: Number(r.tasks), overdue: Number(r.overdue), completed: Number(r.completed) });
  }
  const days = datesBetween(input.from, input.to).map((date) => ({ ...emptyDay(date), ...(byDay.get(date) ?? {}) }));
  const events = await eventDayAggregates(user, input, input.filters, eventScope(user));
  return mergeEventDays(days, events, input.filters);
}

/** The people supporting each task (`task_support`), by task id. */
async function supportOf(taskIds: string[]): Promise<Map<string, CalPersonRef[]>> {
  const out = new Map<string, CalPersonRef[]>();
  if (taskIds.length === 0) return out;
  const rows = await db
    .select({ taskId: taskSupport.taskId, id: staff.id, name: staff.name })
    .from(taskSupport)
    .innerJoin(staff, eq(staff.id, taskSupport.staffId))
    .where(and(inArray(taskSupport.taskId, taskIds), isNull(staff.deletedAt)))
    .orderBy(asc(staff.name));
  for (const r of rows) {
    const list = out.get(r.taskId) ?? [];
    list.push({ id: r.id, name: r.name });
    out.set(r.taskId, list);
  }
  return out;
}

/** The task's own columns of an item row (BE §5.2); `support` is read apart. */
function itemFields() {
  return {
    id: tasks.id,
    title: tasks.title,
    commitmentDate: tasks.commitmentDate,
    deliveryDate: tasks.deliveryDate,
    status: tasks.status,
    priority: tasks.priority,
    customStatusName: taskStatuses.name,
    customStatusCloses: taskStatuses.closes,
    managerId: tasks.managerId,
    managerName: staff.name,
    parentTaskId: tasks.parentTaskId,
    estimatedHours: tasks.estimatedHours,
    templateHours: workflowTaskTemplates.defaultEstimatedHours,
    projectId: tasks.projectId,
    projectName: projects.name,
    workflowId: tasks.workflowId,
    workflowKey: workflows.key,
    workflowName: workflows.name,
    workflowSortOrder: workflows.sortOrder,
    workflowColorSlot: workflows.colorSlot,
    phaseId: tasks.phaseId,
    phaseName: workflowPhases.name,
    waiting: sql<boolean>`exists (select 1 from core.task_dependencies td join core.tasks dep on dep.id = td.depends_on_task_id where td.task_id = ${tasks.id} and dep.deleted_at is null and dep.status <> 'completado')`,
  };
}

type ItemRow = Omit<TaskItemRow, "support">;

/** Task rows as items, with their support people (one more query). */
async function toItems(rows: ItemRow[], today: string, canEdit: boolean): Promise<CalItem[]> {
  const support = await supportOf(rows.map((r) => r.id));
  return rows.map((r) => taskRowToItem({ ...r, support: support.get(r.id) ?? [] }, { today, canEdit }));
}

function eventScope(user: AuthenticatedUser) {
  return { canViewTeam: resolveCalendarCapabilities(user).canViewTeamCalendar };
}

/** Task and event items of the range, at most `perDayLimit` per day. */
export async function rangeItems(
  user: AuthenticatedUser,
  input: CalendarioRangeInput,
  perDayLimit: number = PER_DAY_LIMIT[input.view],
  today: string = todayInAppTimeZone(),
): Promise<{ items: CalItem[]; truncated: boolean }> {
  const scope = taskScope(user, input.from, input.to, input.filters);
  const taskPart = scope.none ? { items: [] as CalItem[], truncated: false } : await taskItemsInRange(scope, today, perDayLimit);
  const events = await eventItemsInRange(user, input, input.filters, eventScope(user), { perDayLimit });
  return mergeEventItems(taskPart, events, input.filters);
}

async function taskItemsInRange(
  scope: ReturnType<typeof taskScope>,
  today: string,
  perDayLimit: number,
): Promise<{ items: CalItem[]; truncated: boolean }> {
  const due = taskDueSql();
  // Rank the tasks of each day: overdue, then open by priority, then completed.
  const ranked = db
    .select({
      id: tasks.id,
      rn: sql<number>`row_number() over (partition by ${due} order by (case when not ${openTaskSql()} then 2 when ${due} < ${today}::date then 0 else 1 end), (case ${tasks.priority} when 'alta' then 0 when 'media' then 1 else 2 end), ${tasks.title}, ${tasks.id})`.as(
        "rn",
      ),
      dayTotal: sql<number>`(count(*) over (partition by ${due}))::int`.as("day_total"),
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(scope.where)
    .as("ranked");
  const rows = await db
    .select({ ...itemFields(), dayTotal: ranked.dayTotal, rn: ranked.rn })
    .from(tasks)
    .innerJoin(ranked, eq(ranked.id, tasks.id))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(workflows, eq(workflows.id, tasks.workflowId))
    .leftJoin(workflowPhases, eq(workflowPhases.id, tasks.phaseId))
    .leftJoin(workflowTaskTemplates, eq(workflowTaskTemplates.id, tasks.templateId))
    .leftJoin(staff, eq(staff.id, tasks.managerId))
    .leftJoin(taskStatuses, and(eq(taskStatuses.id, tasks.customStatusId), isNull(taskStatuses.deletedAt)))
    .where(lte(ranked.rn, perDayLimit))
    .orderBy(asc(sql`coalesce(${tasks.commitmentDate}, ${tasks.deliveryDate})`), asc(ranked.rn));
  const items = await toItems(rows, today, scope.canEdit);
  return { items, truncated: rows.some((r) => Number(r.dayTotal) > perDayLimit) };
}

export async function rangeKpis(user: AuthenticatedUser, input: CalendarioRangeInput, today: string): Promise<CalKpis> {
  const scope = taskScope(user, input.from, input.to, input.filters);
  const kpis: CalKpis = { tasks: 0, meetings: 0, meetingHours: 0, overdue: 0, overduePct: 0, unassigned: 0 };
  const taskKpis = scope.none ? kpis : await taskKpisOf(scope, today, kpis);
  return mergeEventKpis(taskKpis, await eventKpis(user, input, input.filters, eventScope(user)), input.filters);
}

async function taskKpisOf(scope: ReturnType<typeof taskScope>, today: string, kpis: CalKpis): Promise<CalKpis> {
  const due = taskDueSql();
  const [row] = await db
    .select({
      tasks: sql<number>`count(*)::int`,
      open: sql<number>`(count(*) filter (where ${openTaskSql()}))::int`,
      overdue: sql<number>`(count(*) filter (where ${openTaskSql()} and ${due} < ${today}::date))::int`,
      unassigned: sql<number>`(count(*) filter (where ${openTaskSql()} and ${tasks.managerId} is null))::int`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(scope.where);
  const open = Number(row?.open ?? 0);
  const overdue = Number(row?.overdue ?? 0);
  return {
    ...kpis,
    tasks: Number(row?.tasks ?? 0),
    overdue,
    overduePct: open === 0 ? 0 : Math.round((overdue / open) * 100),
    unassigned: Number(row?.unassigned ?? 0),
  };
}

type ListKey = { d: string; t: string; i: string };

/** Opaque cursor: base64url JSON of the last `(date, title, id)` key. */
export function encodeListCursor(key: ListKey): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

export function decodeListCursor(cursor: string): ListKey {
  try {
    const v = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<ListKey>;
    if (typeof v.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.d) && typeof v.t === "string" && typeof v.i === "string") {
      return { d: v.d, t: v.t, i: v.i };
    }
  } catch {
    // falls through
  }
  throw new Error("INVALID: cursor");
}

/** Keyset page of items in `(date, kindOrder, start, title, id)` order (tasks only until meetings join). */
export async function listItemsPage(user: AuthenticatedUser, input: CalendarioListInput): Promise<CalendarioListPage> {
  const scope = taskScope(user, input.from, input.to, input.filters);
  if (scope.none) return { rows: [], nextCursor: null, total: 0 };
  const today = todayInAppTimeZone();
  const limit = Math.min(Math.max(input.limit ?? LIST_PAGE_DEFAULT, 1), LIST_PAGE_MAX);
  const dir = input.orderDir === "desc" ? "desc" : "asc";
  const due = taskDueSql();
  const key = input.cursor ? decodeListCursor(input.cursor) : null;
  const after = key
    ? dir === "asc"
      ? sql`(${due}, ${tasks.title}, ${tasks.id}) > (${key.d}::date, ${key.t}, ${key.i}::uuid)`
      : sql`(${due}, ${tasks.title}, ${tasks.id}) < (${key.d}::date, ${key.t}, ${key.i}::uuid)`
    : undefined;
  const order = dir === "asc" ? [asc(due), asc(tasks.title), asc(tasks.id)] : [desc(due), desc(tasks.title), desc(tasks.id)];
  const [rows, totals] = await Promise.all([
    db
      .select(itemFields())
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(workflows, eq(workflows.id, tasks.workflowId))
      .leftJoin(workflowPhases, eq(workflowPhases.id, tasks.phaseId))
      .leftJoin(workflowTaskTemplates, eq(workflowTaskTemplates.id, tasks.templateId))
      .leftJoin(staff, eq(staff.id, tasks.managerId))
      .leftJoin(taskStatuses, and(eq(taskStatuses.id, tasks.customStatusId), isNull(taskStatuses.deletedAt)))
      .where(and(scope.where, after))
      .orderBy(...order)
      .limit(limit + 1),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(scope.where),
  ]);
  const page = rows.slice(0, limit);
  const items = await toItems(page, today, scope.canEdit);
  const last = items[items.length - 1];
  return {
    rows: items,
    nextCursor: rows.length > limit && last?.kind === "task" ? encodeListCursor({ d: last.date, t: last.title, i: last.taskId }) : null,
    total: Number(totals[0]?.total ?? 0),
  };
}

/** Planned hours per person and day (BE §9). */
export async function dayLoadRows(
  user: AuthenticatedUser,
  input: { from: string; to: string; staffIds?: string[] },
): Promise<DayLoad[]> {
  return stubDefault([] as DayLoad[], user, input);
}
