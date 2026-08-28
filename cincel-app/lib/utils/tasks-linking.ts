import { getProjectsSnapshot } from "@/lib/repositories/projects-repository";
import type { Task, WorkflowType } from "@/lib/types/task";

function normalizeProjectKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function resolveProjectName(inputName: string, projectNames: string[]): string {
  const normalizedInput = normalizeProjectKey(inputName);
  const exactByNormalized = projectNames.find(
    (name) => normalizeProjectKey(name) === normalizedInput
  );
  return exactByNormalized ?? inputName;
}

/**
 * Reconcile each task's `project` string to the canonical project name
 * (accent/casing-insensitive). DB rows already carry canonical snapshots, so
 * this is a no-op for them; it still normalises the built-in mock task data.
 *
 * `workflow` is retained for call-site compatibility; `projectNames` may be
 * passed to reconcile against live project data instead of the mock set.
 */
export function loadLinkedTasks(
  workflow: WorkflowType,
  tasks: Task[],
  projectNames?: string[]
): Task[] {
  void workflow;
  const names =
    projectNames ?? getProjectsSnapshot().map((project) => project.name);

  return tasks.map((task) => {
    const resolved = resolveProjectName(task.project, names);
    return resolved !== task.project ? { ...task, project: resolved } : task;
  });
}
