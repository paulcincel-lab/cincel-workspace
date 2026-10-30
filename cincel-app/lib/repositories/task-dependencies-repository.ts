import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { staff, taskDependencies, tasks } from "@/lib/db/schema";
import type { TaskRef } from "@/lib/types/core";

/** How far the cycle check follows `depends_on` edges from the new target. */
export const DEPENDENCY_CYCLE_MAX_DEPTH = 50;

/** Returns the `depends_on_task_id`s of the given tasks. */
export type DependsOnLookup = (taskIds: string[]) => Promise<string[]>;

/**
 * Whether adding `taskId → dependsOnTaskId` would close a cycle: walks
 * `depends_on` from the target, level by level, looking for `taskId`.
 * A walk that is still going after `maxDepth` levels can't be proven
 * acyclic and is reported as a cycle, so the add is refused.
 */
export async function wouldCreateCycle(
  taskId: string,
  dependsOnTaskId: string,
  lookup: DependsOnLookup,
  maxDepth: number = DEPENDENCY_CYCLE_MAX_DEPTH,
): Promise<boolean> {
  if (taskId === dependsOnTaskId) return true;
  const seen = new Set<string>([dependsOnTaskId]);
  let frontier = [dependsOnTaskId];
  for (let depth = 0; frontier.length > 0; depth++) {
    if (depth >= maxDepth) return true;
    const next: string[] = [];
    for (const id of await lookup(frontier)) {
      if (id === taskId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
    frontier = next;
  }
  return false;
}

async function dependsOnOf(taskIds: string[]): Promise<string[]> {
  if (taskIds.length === 0) return [];
  const rows = await db
    .select({ id: taskDependencies.dependsOnTaskId })
    .from(taskDependencies)
    .where(inArray(taskDependencies.taskId, taskIds));
  return rows.map((r) => r.id);
}

async function liveTask(id: string) {
  const [row] = await db
    .select({ id: tasks.id, projectId: tasks.projectId })
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Project of a live task, or null when it doesn't exist or is deleted. */
export async function getTaskProjectId(id: string): Promise<string | null> {
  return (await liveTask(id))?.projectId ?? null;
}

/**
 * `taskId` waits on `dependsOnTaskId`. Both tasks must be live and in the
 * same project; self, duplicate and cycle-closing edges are refused.
 */
export async function addTaskDependency(
  taskId: string,
  dependsOnTaskId: string,
): Promise<void> {
  if (taskId === dependsOnTaskId)
    throw new Error("SELF: a task can't depend on itself");
  const [task, target] = await Promise.all([
    liveTask(taskId),
    liveTask(dependsOnTaskId),
  ]);
  if (!task || !target) throw new Error("NOT_FOUND: task");
  if (task.projectId !== target.projectId) {
    throw new Error("OTHER_PROJECT: dependencies must be in the same project");
  }
  const [existing] = await db
    .select({ id: taskDependencies.id })
    .from(taskDependencies)
    .where(
      and(
        eq(taskDependencies.taskId, taskId),
        eq(taskDependencies.dependsOnTaskId, dependsOnTaskId),
      ),
    )
    .limit(1);
  if (existing) throw new Error("DUPLICATE: dependency already exists");
  if (await wouldCreateCycle(taskId, dependsOnTaskId, dependsOnOf)) {
    throw new Error("CYCLE: dependency would close a cycle");
  }
  const inserted = await db
    .insert(taskDependencies)
    .values({ taskId, dependsOnTaskId })
    .onConflictDoNothing()
    .returning({ id: taskDependencies.id });
  if (inserted.length === 0)
    throw new Error("DUPLICATE: dependency already exists");
}

export async function removeTaskDependency(
  taskId: string,
  dependsOnTaskId: string,
): Promise<void> {
  const deleted = await db
    .delete(taskDependencies)
    .where(
      and(
        eq(taskDependencies.taskId, taskId),
        eq(taskDependencies.dependsOnTaskId, dependsOnTaskId),
      ),
    )
    .returning({ id: taskDependencies.id });
  if (deleted.length === 0) throw new Error("NOT_FOUND: dependency");
}

const taskRefColumns = {
  id: tasks.id,
  title: tasks.title,
  status: tasks.status,
  managerName: staff.name,
  commitmentDate: tasks.commitmentDate,
};

/** Live tasks `taskId` waits on (`dependsOn`) and that wait on it (`blocks`). */
export async function listTaskDependencies(
  taskId: string,
): Promise<{ dependsOn: TaskRef[]; blocks: TaskRef[] }> {
  const [dependsOn, blocks] = await Promise.all([
    db
      .select(taskRefColumns)
      .from(taskDependencies)
      .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnTaskId))
      .leftJoin(staff, eq(staff.id, tasks.managerId))
      .where(and(eq(taskDependencies.taskId, taskId), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.commitmentDate), asc(tasks.title)),
    db
      .select(taskRefColumns)
      .from(taskDependencies)
      .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
      .leftJoin(staff, eq(staff.id, tasks.managerId))
      .where(
        and(
          eq(taskDependencies.dependsOnTaskId, taskId),
          isNull(tasks.deletedAt),
        ),
      )
      .orderBy(asc(tasks.commitmentDate), asc(tasks.title)),
  ]);
  return { dependsOn, blocks };
}
