"use server";

import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveDashboardCapabilities, scopeDashboardProjects, scopeDashboardTasks } from "@/lib/auth/permissions";
import {
  TASK_TREND_TIME_ZONE,
  bucketTaskTrend,
  taskTrendBuckets,
  taskTrendQueryWindow,
  type TaskTrend,
  type TaskTrendRange,
} from "@/lib/dashboard/task-trend";
import * as tasksRepository from "@/lib/repositories/tasks-repository";
import { stubDefault } from "@/lib/stubs";
import type { InicioData } from "@/lib/types/redesign";

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
 * with the shared shapes of `lib/types/widgets.ts`. Scoped by
 * `scopeDashboardProjects` / `scopeDashboardTasks`; admin tasks only with
 * `canSeeAdminData`. Phase 1 stub returns empty data.
 */
export async function fetchInicioAction(): Promise<InicioData> {
  return stubDefault<InicioData>({
    kpis: [],
    tasksByTramo: [],
    weeklyPace: [],
    attention: [],
    myDay: [],
    projectsProgress: [],
    workload: [],
  });
}
