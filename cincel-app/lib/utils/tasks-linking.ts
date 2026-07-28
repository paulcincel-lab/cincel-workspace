import { getProjectsSnapshot } from "@/lib/repositories/projects-repository";
import { activitiesStorageKey } from "@/lib/repositories/activities-repository";
import { readStorage, writeStorage, removeStorage } from "@/lib/repositories/browser-state-repository";
import type { Task, WorkflowType } from "@/lib/types/task";

function normalizeProjectKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function loadProjectsForLinking() {
  return getProjectsSnapshot();
}

function resolveProjectName(inputName: string, projectNames: string[]): string {
  const normalizedInput = normalizeProjectKey(inputName);

  const exactByNormalized = projectNames.find(
    (name) => normalizeProjectKey(name) === normalizedInput
  );

  if (exactByNormalized) {
    return exactByNormalized;
  }

  return inputName;
}

export function loadLinkedTasks(workflow: WorkflowType, fallback: Task[]): Task[] {
  if (typeof window === "undefined") {
    return fallback;
  }

  const storageKey = activitiesStorageKey(workflow);
  const stored = readStorage(storageKey);

  let sourceTasks: Task[] = fallback;

  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Task[];
      if (Array.isArray(parsed)) {
        sourceTasks = parsed;
      }
    } catch {
      removeStorage(storageKey);
    }
  }

  const projectNames = loadProjectsForLinking().map((project) => project.name);

  let changed = false;

  const linked = sourceTasks.map((task) => {
    const resolvedProjectName = resolveProjectName(task.project, projectNames);

    if (resolvedProjectName !== task.project) {
      changed = true;
      return {
        ...task,
        project: resolvedProjectName,
      };
    }

    return task;
  });

  if (changed) {
    writeStorage(storageKey, JSON.stringify(linked));
  }

  return linked;
}
