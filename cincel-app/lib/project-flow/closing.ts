import type { TaskStatus } from "@/lib/types/core";

import type { FlowExecutor } from "./db";
import { notImplemented } from "./not-implemented";

/**
 * The `closed_at` change for a status write (BE §8.6): becoming `completado`
 * sets it to now (unless it was already closed); leaving `completado` sets
 * null; otherwise no change (empty object).
 */
export function closedAtPatch(
  before: { status: TaskStatus; closedAt: Date | null },
  nextStatus: TaskStatus
): { closedAt?: Date | null } {
  return notImplemented("closedAtPatch", before, nextStatus);
}

/**
 * Sets `project_stages.closed_at` = now when every live, unarchived task of
 * (project, workflow) is closed, else null (BE §9.8 step 1).
 */
export async function refreshStageClosed(db: FlowExecutor, projectId: string, workflowId: string): Promise<void> {
  return notImplemented("refreshStageClosed", db, projectId, workflowId);
}
