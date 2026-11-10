/**
 * Portfolio read for Proyectos and its Analítico table (redesign BE §7.12,
 * §9.7): one row per live project with real vs plan, budget spent, open /
 * overdue task counts, delivery and a 7-day open-task series.
 *
 * Visibility is decided by the caller (`includeAdminData`, from
 * `canSeeAdminData`): without it, admin tasks are not counted and the budget
 * is null. The next delivery never names an admin task, for anyone.
 */
import { and, asc, eq, gte, inArray, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";

import { currentWeekEndIso } from "@/lib/cronograma/week";
import { TASK_TREND_TIME_ZONE, localIsoDate } from "@/lib/dashboard/task-trend";
import { db } from "@/lib/db/client";
import { projectSchedules, projects, schedulePaymentRows, scheduleTasks, tasks } from "@/lib/db/schema";
import {
  addDaysIso,
  daysBetweenIso,
  lastDaysIso,
  portfolioProgressFromCounts,
  seriesFor,
  type PortfolioScheduleCounts,
} from "@/lib/projects/portfolio-metrics";
import type { PortfolioRow } from "@/lib/types/redesign";

export const PORTFOLIO_SERIES_DAYS = 7;

export type PortfolioOptions = {
  /** `canSeeAdminData(user)`: admin tasks counted and budget returned. */
  includeAdminData: boolean;
  now: Date;
  timeZone?: string;
  /** Only these projects (Resumen reads one row); omitted = every live project. */
  projectIds?: readonly string[];
};

/**
 * A correlated subquery as a select field. The projects select has no join,
 * so Drizzle renders a field's own column chunks unqualified, and an
 * unqualified `"id"` inside the subquery would bind to the subquery's table.
 * Nesting the subquery one level keeps every column qualified.
 */
function correlated<T>(subquery: SQL): SQL<T> {
  return sql<T>`${subquery}`;
}

/**
 * The schedule aggregates `portfolioProgressFromCounts` needs, as one JSON
 * column per project: task counts (total, done, in progress, due by the end
 * of the current week). Projects without a schedule get zeros; no schedule
 * row ever reaches Node.
 */
function scheduleCountsColumn(weekEndIso: string) {
  return correlated<Omit<PortfolioScheduleCounts, "paidPct">>(sql`(
    select json_build_object(
      'total', count(*)::int,
      'done', (count(*) filter (where ${scheduleTasks.status} = 'done'))::int,
      'progress', (count(*) filter (where ${scheduleTasks.status} = 'progress'))::int,
      'planned', (count(*) filter (where ${scheduleTasks.fin} <= ${weekEndIso}::date))::int
    )
    from ${scheduleTasks}
    join ${projectSchedules} on ${projectSchedules.id} = ${scheduleTasks.scheduleId}
    where ${projectSchedules.projectId} = ${projects.id}
  )`);
}

/**
 * Paid % of the payment row in effect at the week's end (`pagosRowForDate`:
 * the last row on or before it, else the first row), or null without rows.
 * Admin data: for everyone else the column is a constant null and the
 * payment rows are never read.
 */
function paidPctColumn(weekEndIso: string, includeAdminData: boolean): SQL<string | null> {
  if (!includeAdminData) return sql<string | null>`null::numeric`;
  const paymentRow = (where: SQL, order: SQL) => sql`(
    select ${schedulePaymentRows.pagadoPct}
    from ${schedulePaymentRows}
    join ${projectSchedules} on ${projectSchedules.id} = ${schedulePaymentRows.scheduleId}
    where ${projectSchedules.projectId} = ${projects.id}${where}
    order by ${order}
    limit 1
  )`;
  return correlated<string | null>(sql`coalesce(
    ${paymentRow(sql` and ${schedulePaymentRows.fecha} <= ${weekEndIso}::date`, sql`${schedulePaymentRows.fecha} desc`)},
    ${paymentRow(sql``, sql`${schedulePaymentRows.fecha} asc`)}
  )`);
}

/** Open (live, unarchived, not completed) task count of the row's project; admin tasks only when asked. */
function openTasksColumn(includeAdminTasks: boolean, extra?: SQL) {
  const kindFilter = includeAdminTasks ? sql`` : sql` and ${tasks.kind} <> 'admin'`;
  return correlated<number>(sql`(
    select count(*)::int from ${tasks}
    where ${tasks.projectId} = ${projects.id}
      and ${tasks.deletedAt} is null
      and ${tasks.archived} = false
      and ${tasks.status} <> 'completado'${kindFilter}${extra ?? sql``}
  )`);
}

/**
 * Mean days late (one decimal) of the project's open overdue tasks today:
 * `today − commitment_date` over open tasks committed before today. Null when
 * none is overdue. Same admin-task rule as `overdue`.
 */
function avgDelayColumn(todayIso: string, includeAdminTasks: boolean) {
  const kindFilter = includeAdminTasks ? sql`` : sql` and ${tasks.kind} <> 'admin'`;
  return correlated<string | null>(sql`(
    select round(avg(${todayIso}::date - ${tasks.commitmentDate})::numeric, 1) from ${tasks}
    where ${tasks.projectId} = ${projects.id}
      and ${tasks.deletedAt} is null
      and ${tasks.archived} = false
      and ${tasks.status} <> 'completado'
      and ${tasks.commitmentDate} < ${todayIso}::date${kindFilter}
  )`);
}

/**
 * Overdue tasks as of the end of `dayIso` (a week ago): created before the
 * day ended, not completed by then (same rule as `loadOpenSeries`) and
 * committed before that day. Commitment-date edits are not historized, so
 * the current `commitment_date` is used (an approximation). One JSON column:
 * the count and the mean days late (null when none).
 */
function overdueAsOfColumn(dayIso: string, timeZone: string, includeAdminTasks: boolean) {
  const kindFilter = includeAdminTasks ? sql`` : sql` and ${tasks.kind} <> 'admin'`;
  const dayEnd = sql`((${dayIso}::date + 1)::timestamp at time zone ${timeZone})`;
  return correlated<{ count: number; avgDelay: string | number | null }>(sql`(
    select json_build_object(
      'count', count(*)::int,
      'avgDelay', round(avg(${dayIso}::date - ${tasks.commitmentDate})::numeric, 1)
    )
    from ${tasks}
    where ${tasks.projectId} = ${projects.id}
      and ${tasks.deletedAt} is null
      and ${tasks.archived} = false
      and ${tasks.createdAt} < ${dayEnd}
      and not (${tasks.status} = 'completado' and (${tasks.closedAt} is null or ${tasks.closedAt} < ${dayEnd}))
      and ${tasks.commitmentDate} < ${dayIso}::date${kindFilter}
  )`);
}

/** A numeric SQL value (string or number) as a number, or null. */
function numberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

/**
 * One `PortfolioRow` per live project (the scope of `listProjects` with no
 * filters), by name; with `projectIds`, only those (deleted ones left out).
 * Three statements: the projects with their open and overdue counts, the
 * mean delay (today and a week ago) and the schedule aggregates (progress is computed in SQL, so no schedule task or payment
 * row is loaded), the next deliveries and the 7-day series.
 */
export async function listPortfolioRows(opts: PortfolioOptions): Promise<PortfolioRow[]> {
  if (opts.projectIds && opts.projectIds.length === 0) return [];
  const timeZone = opts.timeZone ?? TASK_TREND_TIME_ZONE;
  const todayIso = localIsoDate(opts.now, timeZone);
  const weekEndIso = currentWeekEndIso(opts.now);
  const dates = lastDaysIso(todayIso, PORTFOLIO_SERIES_DAYS);
  const weekAgoIso = addDaysIso(todayIso, -7);

  const projectRows = await db
    .select({
      id: projects.id,
      progress: projects.progress,
      endDate: projects.endDate,
      open: openTasksColumn(opts.includeAdminData),
      overdue: openTasksColumn(opts.includeAdminData, sql` and ${tasks.commitmentDate} < ${todayIso}::date`),
      avgDelay: avgDelayColumn(todayIso, opts.includeAdminData),
      weekAgo: overdueAsOfColumn(weekAgoIso, timeZone, opts.includeAdminData),
      schedule: scheduleCountsColumn(weekEndIso),
      paidPct: paidPctColumn(weekEndIso, opts.includeAdminData),
    })
    .from(projects)
    .where(and(isNull(projects.deletedAt), opts.projectIds ? inArray(projects.id, [...opts.projectIds]) : undefined))
    .orderBy(asc(projects.name));
  if (projectRows.length === 0) return [];
  const ids = projectRows.map((p) => p.id);

  const [deliveries, series] = await Promise.all([
    loadNextDeliveries(ids, todayIso),
    loadOpenSeries(ids, dates[0]!, dates[dates.length - 1]!, timeZone, opts.includeAdminData),
  ]);

  return projectRows.map((p) => {
    const counts: PortfolioScheduleCounts = {
      total: Number(p.schedule?.total ?? 0),
      done: Number(p.schedule?.done ?? 0),
      progress: Number(p.schedule?.progress ?? 0),
      planned: Number(p.schedule?.planned ?? 0),
      paidPct: opts.includeAdminData && p.paidPct !== null ? Number(p.paidPct) : null,
    };
    const progress = portfolioProgressFromCounts({ progress: p.progress, schedule: counts });
    return {
      projectId: p.id,
      real: progress.real,
      plan: progress.plan,
      deviation: progress.deviation,
      budgetSpentPct: opts.includeAdminData ? progress.budgetSpentPct : null,
      open: Number(p.open ?? 0),
      overdue: Number(p.overdue ?? 0),
      avgDelayDays: numberOrNull(p.avgDelay),
      overdueWeekAgo: Number(p.weekAgo?.count ?? 0),
      avgDelayWeekAgo: numberOrNull(p.weekAgo?.avgDelay),
      daysToDelivery: p.endDate ? daysBetweenIso(todayIso, p.endDate) : null,
      nextDelivery: deliveries.get(p.id) ?? null,
      series7: seriesFor(dates, series.get(p.id)),
    };
  });
}
