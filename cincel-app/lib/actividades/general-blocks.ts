import type { ProjectListItem, ProjectTramo, TaskListItem } from "@/lib/types/core";
import { removeStorage } from "@/lib/repositories/browser-state-repository";

/** Storage key of the removed "Proyecto / Actividad" selector on General. */
export const LEGACY_GROUP_BY_STORAGE_KEY = "cincel.actividades.general.groupBy.v1";

/** Deletes the removed selector's remembered choice. Safe when storage is blocked. */
export function clearLegacyGroupByStorage(): void {
  try {
    removeStorage(LEGACY_GROUP_BY_STORAGE_KEY);
  } catch {
    // Storage blocked (private mode, etc.): nothing to clean up.
  }
}

export type GeneralProjectBlock = {
  id: string;
  name: string;
  tramos: ProjectTramo[];
  tasks: TaskListItem[];
};

const LAST = Number.MAX_SAFE_INTEGER;

/** Tramo order, then fase order; tasks without either go last, stable otherwise. */
export function compareByTramoThenFase(a: TaskListItem, b: TaskListItem): number {
  const tramo = (a.workflow?.sortOrder ?? LAST) - (b.workflow?.sortOrder ?? LAST);
  if (tramo !== 0) return tramo;
  return (a.phaseRef?.sortOrder ?? LAST) - (b.phaseRef?.sortOrder ?? LAST);
}

/**
 * General view (FE §3.2): one block per project, always. Each block carries
 * the project's started tramos for `TramoChips`, and its rows sorted by tramo
 * order, then fase order. Admin tasks never appear here.
 */
export function buildGeneralProjectBlocks(
  tasks: TaskListItem[],
  projects: ProjectListItem[],
): GeneralProjectBlock[] {
  const tramosByProject = new Map(projects.map((p) => [p.id, p.tramos ?? []]));
  const blocks = new Map<string, GeneralProjectBlock>();
  for (const task of tasks) {
    if (task.kind === "admin") continue;
    let block = blocks.get(task.project.id);
    if (!block) {
      block = {
        id: task.project.id,
        name: task.project.name,
        tramos: tramosByProject.get(task.project.id) ?? [],
        tasks: [],
      };
      blocks.set(task.project.id, block);
    }
    block.tasks.push(task);
  }
  for (const block of blocks.values()) {
    block.tasks = block.tasks
      .map((task, index) => ({ task, index }))
      .sort((a, b) => compareByTramoThenFase(a.task, b.task) || a.index - b.index)
      .map(({ task }) => task);
  }
  return [...blocks.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}
