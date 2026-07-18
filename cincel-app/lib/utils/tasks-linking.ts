import { projects as baseProjects } from "@/lib/data/projects";
import type { Task, WorkflowType } from "@/lib/types/task";

const PROJECTS_STORAGE_KEY = "cincel.projects.data.v1";

function tasksStorageKey(workflow: WorkflowType): string {
  return `cincel.actividades.${workflow}.tasks.v1`;
}

function normalizeProjectKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function loadProjectsForLinking() {
  if (typeof window === "undefined") {
    return baseProjects;
  }

  const stored = localStorage.getItem(PROJECTS_STORAGE_KEY);

  if (!stored) {
    return baseProjects;
  }

  try {
    const parsed = JSON.parse(stored) as typeof baseProjects;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : baseProjects;
  } catch {
    return baseProjects;
  }
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

  const storageKey = tasksStorageKey(workflow);
  const stored = localStorage.getItem(storageKey);

  let sourceTasks: Task[] = fallback;

  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Task[];
      if (Array.isArray(parsed)) {
        sourceTasks = parsed;
      }
    } catch {
      localStorage.removeItem(storageKey);
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
    localStorage.setItem(storageKey, JSON.stringify(linked));
  }

  return linked;
}
