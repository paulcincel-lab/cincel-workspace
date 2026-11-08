"use server";

import { requireCapabilityUser } from "@/lib/auth/session";
import {
  resolveDashboardCapabilities,
  scopeDashboardProjects,
  scopeDashboardTasks,
  type DashboardDataScope,
} from "@/lib/auth/permissions";
import { viewerScopeOf } from "@/lib/auth/viewer-scope";
import {
  INICIO_KPI,
  INICIO_KPI_DAYS,
  averageAgeByKey,
  byTramoOrder,
  completedInWeek,
  inMemoryCounter,
  inicioPortfolioRows,
  inicioWeekBuckets,
  inicioWorkloadRows,
  involves,
  KPI_CONTEXT,
  myDayItems,
  nextReviewLine,
  projectActiveOn,
  projectTramoGroup,
  shiftIsoDate,
  statusResolver,
  taskDayState,
  taskTramoGroup,
  taskTramoKey,
  taskTramoLabel,
  tramoConcentrationLine,
  tramoCountsLine,
  tramoSplit,
} from "@/lib/dashboard/inicio";
import {
  TASK_TREND_TIME_ZONE,
  bucketTaskTrend,
  localIsoDate,
  taskTrendBuckets,
  taskTrendQueryWindow,
  type TaskTrend,
  type TaskTrendRange,
} from "@/lib/dashboard/task-trend";
import { db } from "@/lib/db/client";
import { dailySeries, kpiFromDaily } from "@/lib/metrics/series";
import { toAgendaItems, toAttentionItems, toDistribution, toPersonDatum, toProgressItems } from "@/lib/metrics/widgets";
import { remindersForDay } from "@/lib/my-space/reminders-for-day";
import * as inicioRepository from "@/lib/repositories/inicio-repository";
import * as projectsRepository from "@/lib/repositories/projects-repository";
import * as staffRepository from "@/lib/repositories/staff-repository";
import * as tasksRepository from "@/lib/repositories/tasks-repository";
import { isTaskClosed } from "@/lib/tasks/status-options";
import { canSeeAdminData, tramoColorVar } from "@/lib/tramos/compat";
import type { TaskKind } from "@/lib/types/core";
import type { InicioData } from "@/lib/types/redesign";
import type { KpiDatum } from "@/lib/types/widgets";

/**
 * "Avance de tareas" (#601): tasks created vs completed per day of the current
 * week (`semana`) or per week of the current month (`mes`), limited to the
 * viewer's dashboard data scope.
 */
export async function fetchDashboardTaskTrendAction(range: TaskTrendRange): Promise<TaskTrend> {
  if (range !== "semana" && range !== "mes") {
    throw new Error(`Invalid range: ${String(range)}`);
  }

  const user = await requireCapabilityUser();
  const { dataScope } = resolveDashboardCapabilities(user);
  const viewerId = user.member.id;

  const buckets = taskTrendBuckets(range, new Date(), TASK_TREND_TIME_ZONE);
  const { from, to } = taskTrendQueryWindow(buckets);
  const source = await tasksRepository.listTaskTrendSource(from, to);

  const projects = [...new Map(source.tasks.map((t) => [t.project.id, t.project])).values()].map((p) => ({
    id: p.id,
    name: p.name,
    manager: p.managerId ? { id: p.managerId } : null,
  }));
  const allowedProjectIds = new Set(
    scopeDashboardProjects({
      projects,
      tasks: source.tasks,
      viewerId,
      dataScope,
    }).map((p) => p.id)
  );
  const scoped = scopeDashboardTasks({
    tasks: source.tasks,
    viewerId,
    dataScope,
    allowedProjectIds,
  });
  const scopedIds = new Set(scoped.map((t) => t.id));

  return bucketTaskTrend({
    buckets,
    timeZone: TASK_TREND_TIME_ZONE,
    createdAt: scoped.map((t) => t.createdAt),
    completions: source.completions.filter((c) => scopedIds.has(c.taskId)),
  });
}

/**
 * Inicio (redesign BE §7.10): every widget of the page from one call, built
 * with the metrics helper and the widget builders over the existing dashboard
 * sources. Projects and tasks are scoped by `scopeDashboardProjects` /
 * `scopeDashboardTasks`; admin tasks only reach callers with
 * `canSeeAdminData` (the task read leaves them out for everyone else), and no
 * returned shape carries client or origin fields.
 *
 * `weeklyPace` and `completadas_semana` use the "Avance de tareas" source,
 * which never counts admin tasks (BE §8.8). `plan` / `budgetPct` stay null
 * until a plan source exists.
 */
export async function fetchInicioAction(): Promise<InicioData> {
  const user = await requireCapabilityUser();
  const { dataScope } = resolveDashboardCapabilities(user);
  const viewerId = user.member.id;
  const isAdmin = canSeeAdminData(user);
  const viewer = { ...viewerScopeOf(user), isAdmin };

  const now = new Date();
  const tz = TASK_TREND_TIME_ZONE;
  const today = localIsoDate(now, tz);
  const firstKpiDay = shiftIsoDate(today, -(INICIO_KPI_DAYS - 1));
  // Status changes since a day before the first KPI day (a margin for the UTC offset).
  const historySince = new Date(Date.parse(`${shiftIsoDate(firstKpiDay, -1)}T00:00:00Z`));

  const weeks = inicioWeekBuckets(now, tz);
  const trendWindow = taskTrendQueryWindow(weeks);
  const kinds: TaskKind[] = isAdmin ? ["workflow", "usuario", "admin"] : ["workflow", "usuario"];

  const [allTasks, allProjects, trendSource, taskEvents, projectEvents, staff, reminders] = await Promise.all([
    tasksRepository.listTasks({ archived: false, kind: kinds }, viewer),
    projectsRepository.listProjects({}, viewer),
    tasksRepository.listTaskTrendSource(trendWindow.from, trendWindow.to),
    inicioRepository.listStatusEvents("task", historySince),
    inicioRepository.listStatusEvents("project", historySince),
    staffRepository.listStaff(),
    remindersForDay(db, viewerId, today),
  ]);

  // Scope (same rules as the dashboard); non-admins never get admin tasks.
  const visibleTasks = isAdmin ? allTasks : allTasks.filter((t) => t.kind !== "admin");
  const scopedProjects = scopeDashboardProjects({
    projects: allProjects,
    tasks: visibleTasks,
    viewerId,
    dataScope,
  });
  const allowedProjectIds = new Set(scopedProjects.map((p) => p.id));
  const tasks = scopeDashboardTasks({ tasks: visibleTasks, viewerId, dataScope, allowedProjectIds });
  const taskIds = new Set(tasks.map((t) => t.id));
  const trend = scopedTrendSource(trendSource, viewerId, dataScope);
  const completions = trend.completions.filter((c) => taskIds.has(c.taskId));
  const trendCreatedAt = trend.tasks.filter((t) => taskIds.has(t.id)).map((t) => t.createdAt);

  const state = taskDayState(statusResolver(taskEvents.filter((e) => taskIds.has(e.entityId)), tz), tz);
  const projectStatusAt = statusResolver(projectEvents.filter((e) => allowedProjectIds.has(e.entityId)), tz);

  const openTasks = tasks.filter((t) => !isTaskClosed(t));
  const overdueToday = openTasks.filter((t) => state.overdue(t, today));
  const blockedToday = tasks.filter((t) => state.blocked(t, today));
  const reviewsToday = tasks.filter((t) => state.reviewDue(t, today));
  const activeProjects = scopedProjects.filter((p) => p.status === "activo");
  const tramoOfTask = (t: (typeof tasks)[number]) => t.workflow?.key ?? null;

  // ── KPIs ──
  const daily = (countOn: (day: string) => number) => dailySeries(inMemoryCounter(countOn), INICIO_KPI_DAYS, now, tz);
  const [projectsDaily, overdueDaily, blockedDaily, reviewsDaily, completedDaily] = await Promise.all([
    daily((day) => scopedProjects.filter((p) => projectActiveOn(projectStatusAt, p, day, tz)).length),
    daily((day) => tasks.filter((t) => state.overdue(t, day)).length),
    daily((day) => tasks.filter((t) => state.blocked(t, day)).length),
    daily((day) => tasks.filter((t) => state.reviewDue(t, day)).length),
    daily((day) => completedInWeek(completions, day, tz)),
  ]);

  const kpis: KpiDatum[] = [
    {
      ...kpiFromDaily(INICIO_KPI.proyectosActivos.key, INICIO_KPI.proyectosActivos.label, projectsDaily, {
        goodWhen: "up",
        href: INICIO_KPI.proyectosActivos.href,
        deltaWindow: "mes",
      }),
      split: tramoSplit(activeProjects, (p) => p.currentWorkflow?.key ?? null),
      caption: tramoCountsLine(activeProjects, projectTramoGroup, KPI_CONTEXT.noActiveProjects),
    },
    {
      ...kpiFromDaily(INICIO_KPI.vencidas.key, INICIO_KPI.vencidas.label, overdueDaily, {
        goodWhen: "down",
        href: INICIO_KPI.vencidas.href,
      }),
      split: tramoSplit(overdueToday, tramoOfTask),
      caption: tramoConcentrationLine(overdueToday, taskTramoGroup, KPI_CONTEXT.noOverdue),
    },
    {
      ...kpiFromDaily(INICIO_KPI.bloqueadas.key, INICIO_KPI.bloqueadas.label, blockedDaily, {
        goodWhen: "down",
        href: INICIO_KPI.bloqueadas.href,
      }),
      split: tramoSplit(blockedToday, tramoOfTask),
      caption: tramoConcentrationLine(blockedToday, taskTramoGroup, KPI_CONTEXT.noBlocked),
    },
    {
      ...kpiFromDaily(INICIO_KPI.revisiones.key, INICIO_KPI.revisiones.label, reviewsDaily, {
        goodWhen: "up",
        href: INICIO_KPI.revisiones.href,
      }),
      split: tramoSplit(reviewsToday, tramoOfTask),
      caption: nextReviewLine(openTasks, today),
    },
    {
      ...kpiFromDaily(INICIO_KPI.completadas.key, INICIO_KPI.completadas.label, completedDaily, {
        goodWhen: "up",
        href: INICIO_KPI.completadas.href,
      }),
      caption: "últimos 7 días",
      visibleIn: ["analitico"],
    },
  ];

  // ── Tareas abiertas por tramo: value = open, secondary = overdue, extra = { diasProm } ──
  const byTramo = [...openTasks].sort(byTramoOrder);
  const ages = averageAgeByKey(byTramo, taskTramoKey, today, tz);
  const tasksByTramo = toDistribution(byTramo, {
    keyOf: taskTramoKey,
    labelOf: taskTramoLabel,
    colorVarOf: (t) => tramoColorVar(taskTramoKey(t)),
    secondaryOf: (t) => (state.overdue(t, today) ? 1 : 0),
  }).map((segment) => ({ ...segment, extra: { diasProm: ages.get(segment.key) ?? 0 } }));

  // ── Ritmo semanal: 8 weeks, oldest first ──
  const pace = bucketTaskTrend({ buckets: weeks, timeZone: tz, createdAt: trendCreatedAt, completions });
  const weeklyPace = weeks.map((bucket, i) => ({
    weekStart: bucket.from,
    created: pace.created[i] ?? 0,
    completed: pace.completed[i] ?? 0,
  }));

  // ── Requiere atención ──
  const attention = toAttentionItems(openTasks, now);

  // ── Mi día: the caller's events and tasks of today, plus their reminders ──
  const mine = openTasks.filter((t) => involves(t, viewerId));
  const myDay = myDayItems(toAgendaItems({ kind: "tasks", items: mine }), reminders, today, tz);

  // ── Avance de proyectos activos ──
  const portfolio = inicioPortfolioRows(activeProjects, tasks, today, (t, day) => state.open(t, day));
  const projectsProgress = toProgressItems(activeProjects, portfolio).map((item) =>
    isAdmin ? item : { ...item, budgetPct: null }
  );

  // ── Carga por persona ──
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const workload = inicioWorkloadRows(staff, tasks, today).map((row) => toPersonDatum(staffById.get(row.staffId)!, row));

  return { kpis, tasksByTramo, weeklyPace, attention, myDay, projectsProgress, workload };
}

/** The "Avance de tareas" source limited to the caller's dashboard scope. */
function scopedTrendSource(
  source: Awaited<ReturnType<typeof tasksRepository.listTaskTrendSource>>,
  viewerId: string,
  dataScope: DashboardDataScope
) {
  const projects = [...new Map(source.tasks.map((t) => [t.project.id, t.project])).values()].map((p) => ({
    id: p.id,
    name: p.name,
    manager: p.managerId ? { id: p.managerId } : null,
  }));
  const allowedProjectIds = new Set(
    scopeDashboardProjects({ projects, tasks: source.tasks, viewerId, dataScope }).map((p) => p.id)
  );
  const tasks = scopeDashboardTasks({ tasks: source.tasks, viewerId, dataScope, allowedProjectIds });
  const ids = new Set(tasks.map((t) => t.id));
  return { tasks, completions: source.completions.filter((c) => ids.has(c.taskId)) };
}
