/**
 * Portfolio read for Proyectos and its Analítico table (redesign BE §7.12,
 * §9.7): one row per live project with real vs plan, budget spent, open /
 * overdue task counts, delivery and a 7-day open-task series.
 *
 * Visibility is decided by the caller (`includeAdminData`, from
 * `canSeeAdminData`): without it, admin tasks are not counted and the budget
 * is null. The next delivery never names an admin task, for anyone.
 */
import { and, asc, eq, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";

import { TASK_TREND_TIME_ZONE, localIsoDate } from "@/lib/dashboard/task-trend";
import { db } from "@/lib/db/client";
import { projectSchedules, projects, schedulePaymentRows, scheduleTasks, tasks } from "@/lib/db/schema";
import {
  daysBetweenIso,
  lastDaysIso,
  portfolioProgress,
  seriesFor,
  type PortfolioSchedule,
} from "@/lib/projects/portfolio-metrics";
import type { PortfolioRow } from "@/lib/types/redesign";

export const PORTFOLIO_SERIES_DAYS = 7;

export type PortfolioOptions = {
  /** `canSeeAdminData(user)`: admin tasks counted and budget returned. */
  includeAdminData: boolean;
  now: Date;
  timeZone?: string;
};

async function loadSchedules(projectIds: string[]): Promise<Map<string, PortfolioSchedule>> {
  const out = new Map<string, PortfolioSchedule>();
  if (projectIds.length === 0) return out;
  const schedules = await db
    .select({ id: projectSchedules.id, projectId: projectSchedules.projectId })
    .from(projectSchedules)
    .where(inArray(projectSchedules.projectId, projectIds));
  if (schedules.length === 0) return out;

  const scheduleIds = schedules.map((s) => s.id);
  const [taskRows, paymentRows] = await Promise.all([
    db
      .select({
        scheduleId: scheduleTasks.scheduleId,
        id: scheduleTasks.id,
        stableKey: scheduleTasks.stableKey,
        legacyId: scheduleTasks.legacyId,
        planta: scheduleTasks.planta,
        seccion: scheduleTasks.seccion,
        responsable: scheduleTasks.responsable,
        inicio: scheduleTasks.inicio,
        fin: scheduleTasks.fin,
        tarea: scheduleTasks.tarea,
        status: scheduleTasks.status,
        flagged: scheduleTasks.flagged,
      })
      .from(scheduleTasks)
      .where(inArray(scheduleTasks.scheduleId, scheduleIds))
      .orderBy(asc(scheduleTasks.sortOrder)),
    db
      .select({
        scheduleId: schedulePaymentRows.scheduleId,
        fecha: schedulePaymentRows.fecha,
        pagadoPct: schedulePaymentRows.pagadoPct,
        avancePct: schedulePaymentRows.avancePct,
      })
      .from(schedulePaymentRows)
      .where(inArray(schedulePaymentRows.scheduleId, scheduleIds))
      .orderBy(asc(schedulePaymentRows.fecha)),
  ]);

  const bySchedule = new Map<string, PortfolioSchedule>();
  for (const s of schedules) {
    const entry: PortfolioSchedule = { tasks: [], payments: [] };
    bySchedule.set(s.id, entry);
    out.set(s.projectId, entry);
  }
  for (const { scheduleId, ...t } of taskRows) bySchedule.get(scheduleId)?.tasks.push(t);
  for (const p of paymentRows) {
    bySchedule.get(p.scheduleId)?.payments.push({
      fecha: p.fecha,
      pagadoPct: Number(p.pagadoPct),
      avancePct: Number(p.avancePct),
    });
  }
  return out;
}

/** Open = live, unarchived and not completed (same rule as the Proyectos list counts). */
function openTaskConditions(projectIds: string[], includeAdminTasks: boolean) {
  return and(
    inArray(tasks.projectId, projectIds),
    isNull(tasks.deletedAt),
    eq(tasks.archived, false),
    ne(tasks.status, "completado"),
    includeAdminTasks ? undefined : ne(tasks.kind, "admin"),
  );
}

async function loadOpenCounts(
  projectIds: string[],
  todayIso: string,
  includeAdminTasks: boolean,
): Promise<Map<string, { open: number; overdue: number }>> {
  const rows = await db
    .select({
      projectId: tasks.projectId,
      open: sql<number>`count(*)::int`,
      overdue: sql<number>`(count(*) filter (where ${tasks.commitmentDate} < ${todayIso}::date))::int`,
    })
    .from(tasks)
    .where(openTaskConditions(projectIds, includeAdminTasks))
    .groupBy(tasks.projectId);
  return new Map(rows.map((r) => [r.projectId, { open: Number(r.open), overdue: Number(r.overdue) }]));
}

/** Next open task by commitment date (today or later). Admin tasks are never named. */
async function loadNextDeliveries(
  projectIds: string[],
  todayIso: string,
): Promise<Map<string, { title: string; date: string }>> {
  const rows = await db
    .selectDistinctOn([tasks.projectId], {
      projectId: tasks.projectId,
      title: tasks.title,
      date: tasks.commitmentDate,
    })
    .from(tasks)
    .where(
      and(
        openTaskConditions(projectIds, false),
        isNotNull(tasks.commitmentDate),
        gte(tasks.commitmentDate, todayIso),
      ),
    )
    .orderBy(tasks.projectId, asc(tasks.commitmentDate), asc(tasks.title), asc(tasks.id));
  const out = new Map<string, { title: string; date: string }>();
  for (const r of rows) if (r.date) out.set(r.projectId, { title: r.title, date: r.date });
  return out;
}

/**
 * Open tasks per project at the end of each local day in `[fromIso, toIso]`:
 * created before the day ended and not completed by then. A completed task
 * without `closed_at` (legacy rows) counts as closed on every day.
 */
async function loadOpenSeries(
  projectIds: string[],
  fromIso: string,
  toIso: string,
  timeZone: string,
  includeAdminTasks: boolean,
): Promise<Map<string, Map<string, number>>> {
  const kindFilter = includeAdminTasks ? sql`` : sql` and ${tasks.kind} <> 'admin'`;
  const dayEnd = sql`((g.day::date + 1)::timestamp at time zone ${timeZone})`;
  const rows = await db.execute<{ project_id: string; day: string; value: number }>(sql`
    select ${tasks.projectId} as project_id, to_char(g.day, 'YYYY-MM-DD') as day, count(*)::int as value
    from generate_series(${fromIso}::timestamp, ${toIso}::timestamp, interval '1 day') as g(day)
    join ${tasks}
      on ${tasks.createdAt} < ${dayEnd}
      and not (${tasks.status} = 'completado' and (${tasks.closedAt} is null or ${tasks.closedAt} < ${dayEnd}))
    where ${inArray(tasks.projectId, projectIds)}
      and ${tasks.deletedAt} is null
      and ${tasks.archived} = false${kindFilter}
    group by 1, 2
  `);
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    let byDate = out.get(r.project_id);
    if (!byDate) {
      byDate = new Map();
      out.set(r.project_id, byDate);
    }
    byDate.set(r.day, Number(r.value));
  }
  return out;
}

/** One `PortfolioRow` per live project (the scope of `listProjects` with no filters), by name. */
export async function listPortfolioRows(opts: PortfolioOptions): Promise<PortfolioRow[]> {
  const timeZone = opts.timeZone ?? TASK_TREND_TIME_ZONE;
  const todayIso = localIsoDate(opts.now, timeZone);
  const dates = lastDaysIso(todayIso, PORTFOLIO_SERIES_DAYS);

  const projectRows = await db
    .select({ id: projects.id, progress: projects.progress, endDate: projects.endDate })
    .from(projects)
    .where(isNull(projects.deletedAt))
    .orderBy(asc(projects.name));
  if (projectRows.length === 0) return [];
  const ids = projectRows.map((p) => p.id);

  const [schedules, counts, deliveries, series] = await Promise.all([
    loadSchedules(ids),
    loadOpenCounts(ids, todayIso, opts.includeAdminData),
    loadNextDeliveries(ids, todayIso),
    loadOpenSeries(ids, dates[0]!, dates[dates.length - 1]!, timeZone, opts.includeAdminData),
  ]);

  return projectRows.map((p) => {
    const progress = portfolioProgress({ progress: p.progress, schedule: schedules.get(p.id) ?? null }, opts.now);
    const count = counts.get(p.id);
    return {
      projectId: p.id,
      real: progress.real,
      plan: progress.plan,
      deviation: progress.deviation,
      budgetSpentPct: opts.includeAdminData ? progress.budgetSpentPct : null,
      open: count?.open ?? 0,
      overdue: count?.overdue ?? 0,
      daysToDelivery: p.endDate ? daysBetweenIso(todayIso, p.endDate) : null,
      nextDelivery: deliveries.get(p.id) ?? null,
      series7: seriesFor(dates, series.get(p.id)),
    };
  });
}
