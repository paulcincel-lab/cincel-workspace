/**
 * Range SQL, day aggregates and load per person/day (Calendario BE §5). Server-only.
 * Reads never load every task: a range returns its items plus per-day aggregates computed in SQL.
 * Tasks are read here; meetings join in the meetings issue and hours in the load issue, so
 * `events` counts 0 and `hours` / `workday` / `loadLabel` are null until then.
 */
import "server-only";

import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canSeeAdminData, resolveActivitiesCapabilities, resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { viewerScopeOf } from "@/lib/auth/viewer-scope";
import { emptyDay } from "@/lib/calendario/empty";
import { PER_DAY_LIMIT, effectiveFilters, taskRowToItem, type TaskItemRow } from "@/lib/calendario/items";
import { DEFAULT_TASK_HOURS, loadLabel, meetingHoursByDay, overlaps, workdayHours } from "@/lib/calendario/load";
import { getWorkdayHoursSetting } from "@/lib/calendario/workday-setting";
import { db } from "@/lib/db/client";
import {
  calendarEventAttendees,
  calendarEvents,
  positions,
  projectMembers,
  projects,
  staff,
  staffPositions,
  taskStatuses,
  taskSupport,
  tasks,
  workflowPhases,
  workflowTaskTemplates,
  workflows,
} from "@/lib/db/schema";
import { todayInAppTimeZone } from "@/lib/project-flow/admin-tasks";
import { openTaskSql, taskDueSql, whereFilters } from "@/lib/repositories/tasks-repository";
import { getTimeTrackingSettings, TIME_TRACKING_TIME_ZONE } from "@/lib/time-tracking/settings";
import { approvedAbsences } from "@/lib/vacations/approved-absences";
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

/**
 * Planned hours per person and day (BE §9). The caller has already checked who the viewer may see:
 * `input.staffIds` is the final list (default: the viewer). Rows come back for every person and date
 * of the range, sorted by date then person.
 *
 * Hours of a day = effective hours of the person's open tasks due that day where they are the manager
 * (support tasks count 0, D5) + their confirmed meetings clipped to the jornada. Another person's
 * cached Google events are never read (visible to the owner only).
 */
export async function dayLoadRows(
  user: AuthenticatedUser,
  input: { from: string; to: string; staffIds?: string[] },
): Promise<DayLoad[]> {
  const staffIds = [...new Set(input.staffIds?.length ? input.staffIds : [user.member.id])];
  const { from, to } = input;
  const [settings, orgDefault] = await Promise.all([getTimeTrackingSettings(), getWorkdayHoursSetting()]);
  const dayStartUtc = `${from}T00:00:00Z`;
  const windowStart = new Date(Date.parse(dayStartUtc) - 86_400_000);
  const windowEnd = new Date(Date.parse(`${to}T00:00:00Z`) + 2 * 86_400_000);
  const dueSql = sql<string>`coalesce(${tasks.commitmentDate}, ${tasks.deliveryDate})`;
  const adminOk = canSeeAdminData(user);

  const [capacityRows, absences, taskRows, cincelRows, googleRows] = await Promise.all([
    db
      .select({ staffId: staffPositions.staffId, weekly: sql<number | null>`max(${positions.weeklyCapacityHours})` })
      .from(staffPositions)
      .innerJoin(positions, eq(positions.id, staffPositions.positionId))
      .where(and(inArray(staffPositions.staffId, staffIds), isNull(positions.deletedAt)))
      .groupBy(staffPositions.staffId),
    approvedAbsences(db, { from, to, staffIds }),
    db
      .select({
        id: tasks.id,
        staffId: tasks.managerId,
        due: dueSql,
        kind: tasks.kind,
        hours: sql<number>`coalesce(${tasks.estimatedHours}, ${workflowTaskTemplates.defaultEstimatedHours}, ${DEFAULT_TASK_HOURS}::numeric)::float8`,
      })
      .from(tasks)
      .leftJoin(workflowTaskTemplates, eq(workflowTaskTemplates.id, tasks.templateId))
      .where(
        and(
          inArray(tasks.managerId, staffIds),
          isNull(tasks.deletedAt),
          eq(tasks.archived, false),
          sql`${dueSql} between ${from}::date and ${to}::date`,
          sql`${tasks.status} <> 'completado'`,
          sql`not exists (select 1 from core.task_statuses ts_open where ts_open.id = ${tasks.customStatusId} and ts_open.deleted_at is null and ts_open.closes)`,
        ),
      )
      .orderBy(asc(tasks.id)),
    db
      .select({
        id: calendarEvents.id,
        staffId: calendarEventAttendees.staffId,
        startsAt: calendarEvents.startsAt,
        endsAt: calendarEvents.endsAt,
      })
      .from(calendarEvents)
      .innerJoin(calendarEventAttendees, eq(calendarEventAttendees.eventId, calendarEvents.id))
      .where(
        and(
          eq(calendarEvents.source, "cincel"),
          eq(calendarEvents.status, "confirmada"),
          eq(calendarEvents.allDay, false),
          isNull(calendarEvents.deletedAt),
          inArray(calendarEventAttendees.staffId, staffIds),
          ne(calendarEventAttendees.response, "rechaza"),
          lt(calendarEvents.startsAt, windowEnd),
          gt(calendarEvents.endsAt, windowStart),
        ),
      )
      .orderBy(asc(calendarEvents.id)),
    staffIds.includes(user.member.id)
      ? db
          .select({ id: calendarEvents.id, staffId: calendarEvents.ownerStaffId, startsAt: calendarEvents.startsAt, endsAt: calendarEvents.endsAt })
          .from(calendarEvents)
          .where(
            and(
              eq(calendarEvents.source, "google"),
              eq(calendarEvents.ownerStaffId, user.member.id),
              eq(calendarEvents.status, "confirmada"),
              eq(calendarEvents.allDay, false),
              isNull(calendarEvents.deletedAt),
              lt(calendarEvents.startsAt, windowEnd),
              gt(calendarEvents.endsAt, windowStart),
            ),
          )
          .orderBy(asc(calendarEvents.id))
      : Promise.resolve([] as { id: string; staffId: string | null; startsAt: Date; endsAt: Date }[]),
  ]);

  const weeklyOf = new Map(capacityRows.map((r) => [r.staffId, r.weekly === null ? null : Number(r.weekly)]));
  const absent = new Set<string>();
  for (const a of absences) {
    for (let d = a.from > from ? a.from : from; d <= (a.to < to ? a.to : to); d = nextDate(d)) absent.add(`${a.staffId}|${d}`);
  }

  type Cell = DayLoad & { intervals: { id: string; start: string; end: string }[] };
  const cells = new Map<string, Cell>();
  const cellOf = (staffId: string, date: string): Cell => {
    const key = `${staffId}|${date}`;
    let cell = cells.get(key);
    if (!cell) {
      const workday = absent.has(key)
        ? 0
        : workdayHours({ weeklyCapacityHours: weeklyOf.get(staffId) ?? null, workDays: settings.workDays.length }, orgDefault);
      cell = { date, staffId, hours: 0, workday, label: "libre", tasks: [], meetings: [], overlaps: [], intervals: [] };
      cells.set(key, cell);
    }
    return cell;
  };
  for (const staffId of staffIds) for (let d = from; d <= to; d = nextDate(d)) cellOf(staffId, d);

  for (const t of taskRows) {
    if (!t.staffId || !t.due) continue;
    if (t.kind === "admin" && !adminOk && t.staffId !== user.member.id) continue;
    cellOf(t.staffId, String(t.due)).tasks.push({ taskId: t.id, hours: Number(t.hours) });
  }
  const seen = new Set<string>();
  for (const e of [...cincelRows, ...googleRows]) {
    if (!e.staffId || seen.has(`${e.id}|${e.staffId}`)) continue;
    seen.add(`${e.id}|${e.staffId}`);
    const start = e.startsAt.toISOString();
    const end = e.endsAt.toISOString();
    const perDay = meetingHoursByDay(
      { start, end },
      { from, to, dayStart: settings.dayStart, dayEnd: settings.dayEnd, timeZone: TIME_TRACKING_TIME_ZONE },
    );
    for (const [date, hours] of Object.entries(perDay)) {
      const cell = cellOf(e.staffId, date);
      cell.meetings.push({ eventId: e.id, hours });
      cell.intervals.push({ id: e.id, start, end });
    }
  }

  const out: DayLoad[] = [];
  for (const cell of [...cells.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.staffId < b.staffId ? -1 : 1))) {
    const { intervals, ...row } = cell;
    const hours = Math.round([...row.tasks, ...row.meetings].reduce((sum, x) => sum + x.hours, 0) * 100) / 100;
    out.push({ ...row, hours, label: loadLabel(hours, row.workday), overlaps: overlaps(intervals) });
  }
  return out;
}

function nextDate(date: string): string {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Of `staffIds`, the people who are members of an active project the viewer is also a member of. */
export async function staffSharingActiveProject(viewerId: string, staffIds: string[]): Promise<Set<string>> {
  if (staffIds.length === 0) return new Set();
  const mine = alias(projectMembers, "mine");
  const rows = await db
    .selectDistinct({ staffId: projectMembers.staffId })
    .from(projectMembers)
    .innerJoin(mine, and(eq(mine.projectId, projectMembers.projectId), eq(mine.staffId, viewerId)))
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(inArray(projectMembers.staffId, staffIds), eq(projects.status, "activo"), isNull(projects.deletedAt)));
  return new Set(rows.map((r) => r.staffId));
}
