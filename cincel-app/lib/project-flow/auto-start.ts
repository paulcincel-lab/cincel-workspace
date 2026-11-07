import type { StartTramoResult } from "@/lib/types/core";

import type { FlowExecutor, FlowTx } from "./db";
import { notImplemented } from "./not-implemented";

/**
 * Project create (BE §9.4 step 3): when the first active tramo has
 * `auto_start = 'on_create'`, starts it with every active fase, unassigned.
 * Null when auto-start is off.
 */
export async function autoStartOnCreate(
  tx: FlowTx,
  projectId: string,
  actorId: string
): Promise<StartTramoResult | null> {
  return notImplemented("autoStartOnCreate", tx, projectId, actorId);
}

/**
 * After `workflowId` changed on the project (BE §9.8 step 2): starts each
 * later tramo whose rule follows it, has `auto_start = 'on_ready'`, is now
 * ready and isn't started yet. Each start runs in its own transaction.
 */
export async function autoStartOnReady(
  db: FlowExecutor,
  projectId: string,
  workflowId: string,
  actorId: string
): Promise<StartTramoResult[]> {
  return notImplemented("autoStartOnReady", db, projectId, workflowId, actorId);
}

/**
 * Runs in `after()` from task status changes and import/remap applies
 * (BE §9.8): `refreshStageClosed`, then `autoStartOnReady` with the actor of
 * the triggering change (null → the start is recorded without an actor).
 * Failures are logged as one JSON line with a `trace_id`.
 */
export async function onTaskClosingChanged(
  db: FlowExecutor,
  projectId: string,
  workflowId: string,
  actorId: string | null = null
): Promise<void> {
  return notImplemented("onTaskClosingChanged", db, projectId, workflowId, actorId);
}
