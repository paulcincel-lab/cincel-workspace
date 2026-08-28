/**
 * Activities (tasks) data access.
 *
 * Phase 2: reads/writes go to Postgres via the Server Actions in
 * `lib/actions/activities-actions.ts` (Drizzle + session authz). This module
 * keeps its historical function names/signatures so existing callers don't
 * change.
 *
 * The per-workflow `cincel.actividades.<workflow>.tasks.v1` localStorage keys
 * are still the source for the synchronous readers (`tasks-linking`,
 * proyectos ficha, dashboard, clientes/equipo aggregates) — fetch/save mirror
 * the DB result into them. `getActivitiesSnapshot()` reads that key for first
 * paint, falling back to the built-in mock set.
 */
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import type { Task, WorkflowType } from "@/lib/types/task";
import {
  fetchActivitiesAction,
  saveActivitiesAction,
  saveActivityAction,
} from "@/lib/actions/activities-actions";

export type { Task, WorkflowType };

export function activitiesStorageKey(workflow: WorkflowType): string {
  return `cincel.actividades.${workflow}.tasks.v1`;
}

function getBaseTasksForWorkflow(workflow: WorkflowType): Task[] {
  if (workflow === "Presale") return presaleTasks;
  if (workflow === "Diseño") return disenoTasks;
  return operativasTasks;
}

/**
 * Mirror the full task list for a workflow into its localStorage key. Postgres
 * is the source of truth (Phase 2), but the synchronous readers
 * (`tasks-linking`, proyectos ficha, dashboard) still read this key. Callers
 * that hold the full list keep it fresh; pass the full array, never a diff.
 */
export function mirrorActivitiesToStorage(
  workflow: WorkflowType,
  tasks: Task[]
): void {
  if (typeof window !== "undefined" && tasks.length > 0) {
    writeStorage(activitiesStorageKey(workflow), JSON.stringify(tasks));
  }
}

export function getActivitiesSnapshot(workflow: WorkflowType): Task[] {
  if (typeof window === "undefined") {
    return getBaseTasksForWorkflow(workflow);
  }

  const stored = readStorage(activitiesStorageKey(workflow));
  if (!stored) return getBaseTasksForWorkflow(workflow);

  try {
    const parsed = JSON.parse(stored) as Task[];
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : getBaseTasksForWorkflow(workflow);
  } catch {
    return getBaseTasksForWorkflow(workflow);
  }
}

export async function fetchActivities(workflow: WorkflowType): Promise<Task[]> {
  const tasks = await fetchActivitiesAction(workflow);
  mirrorActivitiesToStorage(workflow, tasks);
  return tasks;
}

export async function saveActivities(
  workflow: WorkflowType,
  tasks: Task[]
): Promise<void> {
  // `tasks` may be a diffed subset — do not mirror it here (that would truncate
  // the localStorage list). Callers mirror their full array separately.
  await saveActivitiesAction(workflow, tasks);
}

export async function saveActivity(task: Task): Promise<void> {
  await saveActivityAction(task);
}
