import { isTaskClosed } from "@/lib/tasks/status-options";
import type { ProjectSpaceRef, TaskListItem, WorkflowPhaseRef } from "@/lib/types/core";

/** `/actividades/general`: every tramo at once. Any other slug is a `workflows.key`. */
export const GENERAL_SLUG = "general";

/** Shown in the Fase cell for a task with no fase (or one outside this tramo's catalog). */
export const NO_PHASE_LABEL = "Sin fase · revisar";

type PhaseRanked = Pick<TaskListItem, "phaseId">;

/** Catalog position of a fase; tasks with no fase, or one outside the catalog, sort last. */
export function phaseRank(phases: WorkflowPhaseRef[], phaseId: string | null): number {
  if (!phaseId) return Number.MAX_SAFE_INTEGER;
  const phase = phases.find((p) => p.id === phaseId);
  return phase ? phase.sortOrder : Number.MAX_SAFE_INTEGER - 1;
}

/**
 * Block order on a tramo page: fase `sortOrder`, then the manual `sortOrder`
 * (unordered rows after ordered ones), then `createdAt`.
 */
export function sortTramoTasks<T extends PhaseRanked & Pick<TaskListItem, "sortOrder" | "createdAt">>(
  tasks: T[],
  phases: WorkflowPhaseRef[]
): T[] {
  return [...tasks].sort((a, b) => {
    const byPhase = phaseRank(phases, a.phaseId) - phaseRank(phases, b.phaseId);
    if (byPhase !== 0) return byPhase;
    const aOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/**
 * A drag inside a project block may only move a task among the tasks of its
 * own fase: the fase of every position has to stay what it was. A drop into
 * another fase changes that sequence and is refused.
 */
export function isWithinPhaseReorder(current: Array<PhaseRanked & { id: string }>, orderedIds: string[]): boolean {
  if (current.length !== orderedIds.length) return false;
  const phaseById = new Map(current.map((t) => [t.id, t.phaseId ?? null]));
  return orderedIds.every((id, index) => phaseById.has(id) && phaseById.get(id) === (current[index].phaseId ?? null));
}

/** Open tasks per fase id, for the fase strip. */
export function openTasksByPhase(
  tasks: Array<PhaseRanked & Pick<TaskListItem, "status" | "customStatus" | "archived">>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const task of tasks) {
    if (!task.phaseId || task.archived || isTaskClosed(task)) continue;
    counts[task.phaseId] = (counts[task.phaseId] ?? 0) + 1;
  }
  return counts;
}

/**
 * Quick-add fase: the fase of the block's last open task (in block order),
 * else the tramo's first fase.
 */
export function defaultQuickAddPhaseId(
  blockTasks: Array<PhaseRanked & Pick<TaskListItem, "status" | "customStatus">>,
  phases: WorkflowPhaseRef[]
): string | null {
  for (let i = blockTasks.length - 1; i >= 0; i -= 1) {
    const task = blockTasks[i];
    if (!isTaskClosed(task) && task.phaseId && phases.some((p) => p.id === task.phaseId)) return task.phaseId;
  }
  return phases[0]?.id ?? null;
}

/** Espacios seen on the listed tasks, per project, in name order. */
export function spacesByProjectOf(
  tasks: Array<{ project: { id: string }; space: ProjectSpaceRef | null }>
): Record<string, ProjectSpaceRef[]> {
  const byProject = new Map<string, Map<string, ProjectSpaceRef>>();
  for (const task of tasks) {
    if (!task.space) continue;
    const spaces = byProject.get(task.project.id) ?? new Map<string, ProjectSpaceRef>();
    spaces.set(task.space.id, task.space);
    byProject.set(task.project.id, spaces);
  }
  return Object.fromEntries(
    [...byProject.entries()].map(([projectId, spaces]) => [
      projectId,
      [...spaces.values()].sort((a, b) => a.name.localeCompare(b.name, "es")),
    ])
  );
}

/** Espacio filter options: "{proyecto} · {espacio}", by project then espacio name. */
export function spaceFilterOptions(
  tasks: Array<{ project: { id: string; name: string }; space: ProjectSpaceRef | null }>
): Array<{ id: string; label: string }> {
  const options = new Map<string, { id: string; label: string; project: string; space: string }>();
  for (const task of tasks) {
    if (!task.space) continue;
    options.set(task.space.id, {
      id: task.space.id,
      label: `${task.project.name} · ${task.space.name}`,
      project: task.project.name,
      space: task.space.name,
    });
  }
  return [...options.values()]
    .sort((a, b) => a.project.localeCompare(b.project, "es") || a.space.localeCompare(b.space, "es"))
    .map(({ id, label }) => ({ id, label }));
}

/** DOM id of a project block, for the `?project=` deep link scroll. */
export function projectBlockDomId(projectId: string): string {
  return `proyecto-${projectId}`;
}
