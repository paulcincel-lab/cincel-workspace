/**
 * Activities (tasks) data access.
 *
 * Reads/writes go to Postgres via the Server Actions in
 * `lib/actions/activities-actions.ts` (Drizzle + session authz). No
 * localStorage: pages server-render initial data and hydrate via
 * `fetchActivities()`; `getActivitiesSnapshot()` returns the built-in mock set
 * only as a pre-hydration seed.
 */
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

function getBaseTasksForWorkflow(workflow: WorkflowType): Task[] {
  if (workflow === "Presale") return presaleTasks;
  if (workflow === "Diseño") return disenoTasks;
  return operativasTasks;
}

export function getActivitiesSnapshot(workflow: WorkflowType): Task[] {
  return getBaseTasksForWorkflow(workflow);
}

export async function fetchActivities(workflow: WorkflowType): Promise<Task[]> {
  return fetchActivitiesAction(workflow);
}

export async function saveActivities(
  workflow: WorkflowType,
  tasks: Task[]
): Promise<void> {
  await saveActivitiesAction(workflow, tasks);
}

export async function saveActivity(task: Task): Promise<void> {
  await saveActivityAction(task);
}
