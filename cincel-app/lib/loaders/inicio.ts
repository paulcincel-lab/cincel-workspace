import "server-only";

import { cache } from "react";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
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
  INICIO_KPI_OWN_HOURS_LABEL,
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
  attentionProgress,
  dominantTramoByStaff,
  horasSemanaKpi,
  inicioHero,
  openShiftsOf,
  projectTeam,
  scopedStaffIds,
  todayAgendaItems,
} from "@/lib/dashboard/inicio-visual";
import { TASK_TREND_TIME_ZONE, bucketTaskTrend, localIsoDate, taskTrendQueryWindow } from "@/lib/dashboard/task-trend";
import { db } from "@/lib/db/client";
import { dailySeries, kpiFromDaily } from "@/lib/metrics/series";
import { toAgendaItems, toAttentionItems, toDistribution, toPersonDatum, toProgressItems } from "@/lib/metrics/widgets";
import { remindersForDay } from "@/lib/my-space/reminders-for-day";
import { getFirstLoginState, type FirstLoginState } from "@/lib/onboarding/first-login-server";
import * as inicioRepository from "@/lib/repositories/inicio-repository";
import * as projectsRepository from "@/lib/repositories/projects-repository";
import * as staffRepository from "@/lib/repositories/staff-repository";
import * as tasksRepository from "@/lib/repositories/tasks-repository";
import { isTaskClosed } from "@/lib/tasks/status-options";
import { mondayOf } from "@/lib/time-tracking/local-time";
import { getTimeTrackingSettings } from "@/lib/time-tracking/settings";
import { weekHours } from "@/lib/time-tracking/week-hours";
import { canSeeAdminData, tramoColorVar } from "@/lib/tramos/compat";
import type { TaskKind } from "@/lib/types/core";
import type { InicioData } from "@/lib/types/redesign";
import type { KpiDatum } from "@/lib/types/widgets";

/** `qk.inicio()` (Query Migration Phase 3, #937): every Inicio widget plus the first-login banner flag. */
export type InicioPageData = {
  inicio: InicioData;
  firstLogin: Pick<FirstLoginState, "showGoogleSetupBanner">;
};

/**
 * The first-login state once per request: the page reads it for the wizard
 * redirect and the loader for the banner, so a server render runs its
 * queries once. A failed read is null (Inicio shows as usual, no banner).
 */
export const readFirstLoginState = cache(async (): Promise<FirstLoginState | null> => {
  try {
    return await getFirstLoginState();
  } catch {
    return null;
  }
});

/**
 * `qk.inicio()` loader (`(user) => data`): `getInicioPageData` calls it
 * after the session check and the `/inicio` server prefetch calls it
 * directly. Its result is dehydrated into the page HTML, so it only returns
 * what `user` may see (admin-only fields are stripped in `loadInicio`).
 */
export async function loadInicioPage(user: AuthenticatedUser): Promise<InicioPageData> {
  const [inicio, firstLogin] = await Promise.all([loadInicio(user), readFirstLoginState()]);
  return { inicio, firstLogin: { showGoogleSetupBanner: firstLogin?.showGoogleSetupBanner ?? false } };
}

/**
 * Inicio (redesign BE §7.10): every widget of the page from one read, built
 * with the metrics helper and the widget builders over the existing dashboard
 * sources. Projects and tasks are scoped by `scopeDashboardProjects` /
 * `scopeDashboardTasks`; admin tasks only reach callers with
 * `canSeeAdminData` (the task read leaves them out for everyone else), a
 * non-admin's `projectsProgress` carries no `budgetPct`, and no returned
 * shape carries client or origin fields.
 *
 * Tasks come from the slim `listTaskRows` projection (no `notes`).
 * `weeklyPace` and `completadas_semana` use the "Avance de tareas" source,
 * which never counts admin tasks (BE §8.8). `plan` / `budgetPct` stay null
 * until a plan source exists.
 *
 * Inicio Visual (#989) adds `hero`, `openShifts` (null without
 * `sections.showTeamWorkload`), `todayAgenda`, the `abiertas` and
 * `horas_semana` KPIs (the viewer's own hours without team access), the
 * attention subtask progress and the project open / overdue / delivery /
 * team fields.
 */
export async function loadInicio(user: AuthenticatedUser): Promise<InicioData> {
  const { dataScope, sections } = resolveDashboardCapabilities(user);
  // Open shifts and the team's hours need the team workload section (#989).
  const showTeam = sections.showTeamWorkload;
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

  const [
    allTasks,
    allProjects,
    trendSource,
    taskEvents,
    projectEvents,
    staff,
    reminders,
    openShiftIds,
    hoursSettings,
  ] = await Promise.all([
    tasksRepository.listTaskRows({ archived: false, kind: kinds }, viewer),
    projectsRepository.listProjects({}, viewer),
    tasksRepository.listTaskTrendSource(trendWindow.from, trendWindow.to),
    inicioRepository.listStatusEvents("task", historySince),
    inicioRepository.listStatusEvents("project", historySince),
    staffRepository.listStaff(),
    remindersForDay(db, viewerId, today),
    showTeam ? inicioRepository.listOpenShiftStaffIds(today) : Promise.resolve(null),
    getTimeTrackingSettings(),
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

  // Horas esta semana: the scope's staff with team access, else the viewer's own hours.
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const staffInScope = scopedStaffIds(dataScope, { viewerId, staff, tasks: openTasks, projects: scopedProjects });
  const hoursStaff = showTeam ? staffInScope : [viewerId];
  const weekStart = mondayOf(today);

  // ── KPIs ──
  const daily = (countOn: (day: string) => number) => dailySeries(inMemoryCounter(countOn), INICIO_KPI_DAYS, now, tz);
  const [
    projectsDaily,
    overdueDaily,
    blockedDaily,
    reviewsDaily,
    completedDaily,
    openDaily,
    thisWeekHours,
    lastWeekHours,
  ] = await Promise.all([
    daily((day) => scopedProjects.filter((p) => projectActiveOn(projectStatusAt, p, day, tz)).length),
    daily((day) => tasks.filter((t) => state.overdue(t, day)).length),
    daily((day) => tasks.filter((t) => state.blocked(t, day)).length),
    daily((day) => tasks.filter((t) => state.reviewDue(t, day)).length),
    daily((day) => completedInWeek(completions, day, tz)),
    daily((day) => tasks.filter((t) => state.open(t, day)).length),
    weekHours(db, hoursStaff, weekStart, hoursSettings),
    weekHours(db, hoursStaff, shiftIsoDate(weekStart, -7), hoursSettings),
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
    {
      ...kpiFromDaily(INICIO_KPI.abiertas.key, INICIO_KPI.abiertas.label, openDaily, {
        goodWhen: "down",
        href: INICIO_KPI.abiertas.href,
      }),
      split: tramoSplit(openTasks, tramoOfTask),
      caption: tramoConcentrationLine(openTasks, taskTramoGroup, KPI_CONTEXT.noOpen),
      visibleIn: ["visual", "analitico"],
    },
    {
      ...horasSemanaKpi({
        key: INICIO_KPI.horasSemana.key,
        label: showTeam ? INICIO_KPI.horasSemana.label : INICIO_KPI_OWN_HOURS_LABEL,
        href: INICIO_KPI.horasSemana.href,
        thisWeek: thisWeekHours.values(),
        lastWeek: lastWeekHours.values(),
        today,
      }),
      visibleIn: ["visual"],
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

  // ── Ritmo semanal: 12 weeks (INICIO_PACE_WEEKS), oldest first ──
  const pace = bucketTaskTrend({ buckets: weeks, timeZone: tz, createdAt: trendCreatedAt, completions });
  const weeklyPace = weeks.map((bucket, i) => ({
    weekStart: bucket.from,
    created: pace.created[i] ?? 0,
    completed: pace.completed[i] ?? 0,
  }));

  // ── Requiere atención ──
  const openById = new Map(openTasks.map((t) => [t.id, t]));
  const attention = toAttentionItems(openTasks, now).map((item) => {
    const task = openById.get(item.id);
    return task ? { ...item, ...attentionProgress(task) } : item;
  });

  // ── Mi día: the caller's events and tasks of today, plus their reminders ──
  const mine = openTasks.filter((t) => involves(t, viewerId));
  const myDay = myDayItems(toAgendaItems({ kind: "tasks", items: mine }), reminders, today, tz);

  // ── Avance de proyectos activos (budgetPct is admin-only) ──
  const portfolio = inicioPortfolioRows(activeProjects, tasks, today, (t, day) => state.open(t, day));
  const tramoByStaff = dominantTramoByStaff(openTasks);
  const rowById = new Map(portfolio.map((row) => [row.projectId, row]));
  const projectById = new Map(activeProjects.map((p) => [p.id, p]));
  const openByProject = new Map<string, typeof openTasks>();
  for (const task of openTasks) openByProject.set(task.projectId, [...(openByProject.get(task.projectId) ?? []), task]);
  const projectsProgress = toProgressItems(activeProjects, portfolio).map((item) => {
    const row = rowById.get(item.id);
    const project = projectById.get(item.id);
    return {
      ...item,
      ...(isAdmin ? {} : { budgetPct: null }),
      open: row?.open ?? 0,
      overdue: row?.overdue ?? 0,
      deliveryDate: project?.endDate ?? null,
      team: project ? projectTeam(project, openByProject.get(item.id) ?? [], tramoByStaff) : [],
    };
  });

  // ── Carga por persona ──
  const workload = inicioWorkloadRows(staff, tasks, today).map((row) => toPersonDatum(staffById.get(row.staffId)!, row));

  // ── Inicio Visual (#989): hero, open shifts, today's agenda ──
  const hero = inicioHero(openTasks, overdueToday, today);
  const openShifts =
    showTeam && openShiftIds ? openShiftsOf(openShiftIds, new Set(staffInScope), staffById, tramoByStaff) : null;
  const todayAgenda = todayAgendaItems(openTasks, today, tz);

  return {
    kpis,
    tasksByTramo,
    weeklyPace,
    attention,
    myDay,
    projectsProgress,
    workload,
    hero,
    openShifts,
    todayAgenda,
  };
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
