import { and, eq, sql } from "drizzle-orm";

import type { TaskStatus } from "@/lib/types/core";

import { projectStages, tasks } from "../db/schema";

import type { FlowExecutor } from "./db";

/**
 * The `closed_at` change for a status write (BE §8.6): becoming `completado`
 * sets it to now (unless it was already closed); leaving `completado` sets
 * null; otherwise no change (empty object).
 */
export function closedAtPatch(
  before: { status: TaskStatus; closedAt: Date | null },
  nextStatus: TaskStatus,
  now: Date = new Date()
): { closedAt?: Date | null } {
  if (nextStatus === "completado") {
    if (before.status === "completado" && before.closedAt) return {};
    return { closedAt: now };
  }
  if (before.status === "completado" || before.closedAt) return { closedAt: null };
  return {};
}

/**
 * Sets `project_stages.closed_at` = now when every live, unarchived task of
 * (project, workflow) is closed, else null (BE §9.8 step 1). A stage with no
 * live task stays open; an already closed stage keeps its date.
 */
export async function refreshStageClosed(db: FlowExecutor, projectId: string, workflowId: string): Promise<void> {
  const live = and(
    eq(tasks.projectId, projectId),
    eq(tasks.workflowId, workflowId),
    sql`${tasks.deletedAt} is null`,
    eq(tasks.archived, false)
  );
  const allClosed = sql`exists (select 1 from ${tasks} where ${live}) and not exists (select 1 from ${tasks} where ${live} and ${tasks.status} <> 'completado')`;
  await db
    .update(projectStages)
    .set({
      closedAt: sql`case when ${allClosed} then coalesce(${projectStages.closedAt}, now()) else null end`,
    })
    .where(and(eq(projectStages.projectId, projectId), eq(projectStages.workflowId, workflowId)));
}
