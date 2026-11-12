/**
 * Data behind Planear mi semana (BE §10.4): the backlog, the lanes (people with
 * workday, absences and booked hours) and the plan itself. Shared by
 * `loadPlanWeek` and the `plan_week` tool. Server-only.
 */
import "server-only";

import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";

import { isAgendaLead } from "@/lib/assistant/tools/agenda";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canSeeAdminData, resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { DEFAULT_WORKDAY_HOURS, effectiveHours, workdayHours } from "@/lib/calendario/load";
import { getWorkdayHoursSetting } from "@/lib/calendario/workday-setting";
import {
  orderBacklog,
  planWeek,
  type PlanWeekBacklogTask,
  type PlanWeekInput,
  type PlanWeekPerson,
  type PlanWeekResult,
} from "@/lib/calendario/plan-week";
import { db } from "@/lib/db/client";
import {
  positions,
  projects,
  staff,
  staffPositions,
  taskDependencies,
  tasks,
  vacationRequests,
  workflowTaskTemplates,
} from "@/lib/db/schema";
import { displayName } from "@/lib/people/aggregates";
import { todayInAppTimeZone } from "@/lib/project-flow/admin-tasks";
import { dayLoadRows } from "@/lib/repositories/calendario-repository";
import { addDays, mondayOf, weekDates } from "@/lib/time-tracking/local-time";
import type { DayLoad, PlanWeekData } from "@/lib/types/calendario";

/** Most backlog tasks one plan reads (the board pages beyond it with "Cargar más" later). */
export const PLAN_WEEK_BACKLOG_LIMIT = 200;

export type PlanWeekScope = { weekStart: string; staffIds?: string[]; taskIds?: string[] };

export type PlanWeekBacklogRow = PlanWeekBacklogTask & {
  projectName: string | null;
  /** Current commitment date, the `before` of the proposal change. */
  commitmentDate: string | null;
};

export type CollectedPlanWeek = {
  input: PlanWeekInput;
  backlog: PlanWeekBacklogRow[];
  /** Hours already planned per person and day, including the backlog tasks that are dated this week. */
  load: DayLoad[];
};

/** Planning (or viewing) the lane of someone else needs `canChangeResponsible` or `isAgendaLead`. */
export function canPlanOthers(user: AuthenticatedUser): boolean {
  return resolveActivitiesCapabilities(user).canChangeResponsible || isAgendaLead(user);
}

function weekdays(weekStart: string): string[] {
  return weekDates(weekStart).slice(0, 5);
}

/** Active staff of the lanes: the viewer first, then the requested ones sorted by name. */
async function loadLanes(user: AuthenticatedUser, staffIds: string[] | undefined) {
  const me = user.member.id;
  const others = [...new Set(staffIds ?? [])].filter((id) => id !== me);
  if (others.length > 0 && !canPlanOthers(user)) throw new Error("FORBIDDEN");
  const rows = await db
    .select({ id: staff.id, name: staff.name, lastName: staff.lastName })
    .from(staff)
    .where(and(inArray(staff.id, [me, ...others]), eq(staff.active, true), isNull(staff.deletedAt)));
  const people = rows.map((r) => ({ id: r.id, name: displayName(r.name, r.lastName) }));
  return people.sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : a.name.localeCompare(b.name, "es") || a.id.localeCompare(b.id)));
}

async function workdaysOf(staffIds: string[]): Promise<Map<string, number>> {
  // Same org default as the load meters (#1095 setting), so board and meters agree.
  const orgDefault = await getWorkdayHoursSetting();
  const rows = await db
    .select({ staffId: staffPositions.staffId, capacity: positions.weeklyCapacityHours })
    .from(staffPositions)
    .innerJoin(positions, eq(positions.id, staffPositions.positionId))
    .where(and(inArray(staffPositions.staffId, staffIds), isNull(positions.deletedAt)));
  const best = new Map<string, number>();
  for (const r of rows) {
    if (r.capacity === null) continue;
    best.set(r.staffId, Math.max(best.get(r.staffId) ?? 0, r.capacity));
  }
  return new Map(staffIds.map((id) => [id, workdayHours({ weeklyCapacityHours: best.get(id) ?? null, workDays: 5 }, orgDefault)]));
}

async function absencesOf(staffIds: string[], days: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>(staffIds.map((id) => [id, []]));
  const rows = await db
    .select({ staffId: vacationRequests.staffId, from: vacationRequests.fromDate, to: vacationRequests.toDate })
    .from(vacationRequests)
    .where(
      and(
        inArray(vacationRequests.staffId, staffIds),
        eq(vacationRequests.status, "aprobada"),
        lte(vacationRequests.fromDate, days[days.length - 1]!),
        gte(vacationRequests.toDate, days[0]!),
      ),
    );
  for (const r of rows) {
    const list = out.get(r.staffId);
    if (list) for (const d of days) if (d >= r.from && d <= r.to && !list.includes(d)) list.push(d);
  }
  return out;
}

/** Open tasks that are not dated, or were due last week, or were dropped on the board. */
async function loadBacklog(user: AuthenticatedUser, weekStart: string, peopleIds: string[], taskIds: string[]): Promise<PlanWeekBacklogRow[]> {
  const due = sql`coalesce(${tasks.commitmentDate}, ${tasks.deliveryDate})`;
  const lastWeek = addDays(weekStart, -7);
  const inLanes = inArray(tasks.managerId, peopleIds);
  const candidates = or(
    and(inLanes, or(sql`${due} is null`, and(gte(due, lastWeek), lte(due, addDays(weekStart, -1))))),
    taskIds.length > 0 ? and(inArray(tasks.id, taskIds), or(inLanes, isNull(tasks.managerId))) : undefined,
  );
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      priority: tasks.priority,
      managerId: tasks.managerId,
      projectId: tasks.projectId,
      projectName: projects.name,
      commitmentDate: tasks.commitmentDate,
      deliveryDate: tasks.deliveryDate,
      estimatedHours: tasks.estimatedHours,
      templateHours: workflowTaskTemplates.defaultEstimatedHours,
    })
    .from(tasks)
    .innerJoin(projects, and(eq(projects.id, tasks.projectId), isNull(projects.deletedAt)))
    .leftJoin(workflowTaskTemplates, eq(workflowTaskTemplates.id, tasks.templateId))
    .where(
      and(
        isNull(tasks.deletedAt),
        eq(tasks.archived, false),
        isNull(tasks.closedAt),
        ne(tasks.status, "completado"),
        canSeeAdminData(user) ? undefined : ne(tasks.kind, "admin"),
        candidates,
      ),
    )
    .orderBy(asc(tasks.id))
    .limit(PLAN_WEEK_BACKLOG_LIMIT);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const deps = await db
    .select({ taskId: taskDependencies.taskId, dependsOn: taskDependencies.dependsOnTaskId })
    .from(taskDependencies)
    .innerJoin(tasks, and(eq(tasks.id, taskDependencies.dependsOnTaskId), isNull(tasks.deletedAt), isNull(tasks.closedAt), ne(tasks.status, "completado")))
    .where(inArray(taskDependencies.taskId, ids));
  const dependsOn = new Map<string, string[]>();
  for (const d of deps) dependsOn.set(d.taskId, [...(dependsOn.get(d.taskId) ?? []), d.dependsOn]);

  return rows.map((r) => ({
    taskId: r.id,
    title: r.title,
    hours: effectiveHours({ estimatedHours: r.estimatedHours, templateHours: r.templateHours }).hours,
    priority: r.priority,
    managerId: r.managerId,
    deadline: r.deliveryDate,
    dependsOn: (dependsOn.get(r.id) ?? []).sort(),
    projectId: r.projectId,
    projectName: r.projectName,
    commitmentDate: r.commitmentDate,
  }));
}

/** Open dependencies that are not part of the backlog, with their date. */
async function loadExternalDeps(backlog: PlanWeekBacklogRow[]): Promise<Record<string, { title: string; date: string | null }>> {
  const inBacklog = new Set(backlog.map((t) => t.taskId));
  const wanted = [...new Set(backlog.flatMap((t) => t.dependsOn))].filter((id) => !inBacklog.has(id));
  if (wanted.length === 0) return {};
  const rows = await db
    .select({ id: tasks.id, title: tasks.title, date: sql<string | null>`coalesce(${tasks.commitmentDate}, ${tasks.deliveryDate})` })
    .from(tasks)
    .where(inArray(tasks.id, wanted));
  return Object.fromEntries(rows.map((r) => [r.id, { title: r.title, date: r.date }]));
}

/** Everything `planWeek` and the board need for a week, with the viewer's permissions applied. */
export async function collectPlanWeek(user: AuthenticatedUser, scope: PlanWeekScope, now: Date = new Date()): Promise<CollectedPlanWeek> {
  const weekStart = mondayOf(scope.weekStart);
  const days = weekdays(weekStart);
  const lanes = await loadLanes(user, scope.staffIds);
  const laneIds = lanes.map((p) => p.id);

  const [workdays, absences, backlog, load] = await Promise.all([
    workdaysOf(laneIds),
    absencesOf(laneIds, days),
    loadBacklog(user, weekStart, laneIds, scope.taskIds ?? []),
    dayLoadRows(user, { from: days[0]!, to: days[days.length - 1]!, staffIds: laneIds }),
  ]);
  const ordered = orderBacklog(backlog);
  const externalDeps = await loadExternalDeps(ordered);

  // The backlog tasks that are dated this week are in `load`, but planning moves them: don't count them twice.
  const moving = new Set(ordered.map((t) => t.taskId));
  const booked = new Map<string, Record<string, number>>(laneIds.map((id) => [id, {}]));
  for (const row of load) {
    const lane = booked.get(row.staffId);
    if (!lane) continue;
    const own = row.tasks.filter((t) => moving.has(t.taskId)).reduce((sum, t) => sum + t.hours, 0);
    lane[row.date] = Math.max(0, Math.round((row.hours - own) * 100) / 100);
  }

  const people: PlanWeekPerson[] = lanes.map((p) => ({
    staffId: p.id,
    name: p.name,
    workday: workdays.get(p.id) ?? DEFAULT_WORKDAY_HOURS,
    absent: absences.get(p.id) ?? [],
    booked: booked.get(p.id) ?? {},
  }));
  const today = todayInAppTimeZone(now);
  return { input: { weekStart, days, people, backlog: ordered, now: today, externalDeps }, backlog: ordered, load };
}

/** The deterministic plan for a week. */
export async function computePlanWeek(
  user: AuthenticatedUser,
  scope: PlanWeekScope,
  now?: Date,
): Promise<{ collected: CollectedPlanWeek; plan: PlanWeekResult }> {
  const collected = await collectPlanWeek(user, scope, now);
  return { collected, plan: planWeek(collected.input) };
}

/** `PlanWeekData` of the board: backlog, lanes and the hours before any proposal. */
export async function loadPlanWeekData(user: AuthenticatedUser, scope: { weekStart: string; staffIds?: string[] }): Promise<PlanWeekData> {
  const { input, backlog, load } = await collectPlanWeek(user, scope);
  const byCell = new Map(load.map((row) => [`${row.staffId}|${row.date}`, row.hours]));
  return {
    weekStart: input.weekStart,
    days: input.days,
    backlog: backlog.map((t) => ({
      taskId: t.taskId,
      title: t.title,
      projectName: t.projectName,
      hours: t.hours,
      priority: t.priority,
      managerId: t.managerId,
    })),
    people: input.people.map((p) => ({ staffId: p.staffId, name: p.name, workday: p.workday, absent: p.absent })),
    cells: input.people.flatMap((p) =>
      input.days.map((date) => {
        const hours = byCell.get(`${p.staffId}|${date}`) ?? 0;
        return { staffId: p.staffId, date, before: hours, after: hours, workday: p.absent.includes(date) ? 0 : p.workday };
      }),
    ),
  };
}
