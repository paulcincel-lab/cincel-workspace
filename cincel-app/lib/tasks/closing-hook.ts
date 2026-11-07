import "server-only";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";

import { db } from "@/lib/db/client";
import { onTaskClosingChanged } from "@/lib/project-flow/auto-start";

/** The task fields the closing hook needs (any `Task` row satisfies it). */
export type ClosingHookTask = {
  projectId: string;
  workflowId: string | null;
};

/**
 * Runs the closing hook for one (project, tramo) pair (BE §9.8): refreshes
 * the stage's `closed_at` and auto-starts the tramos that became ready. Never
 * throws: a failure is logged as one JSON line with `trace_id` and the next
 * status change retries.
 */
export async function runTaskClosingHook(
  projectId: string,
  workflowId: string,
  actorId: string | null,
  traceId: string = randomUUID()
): Promise<void> {
  try {
    await onTaskClosingChanged(db, projectId, workflowId, actorId);
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "task.closing_hook_failed",
        trace_id: traceId,
        projectId,
        workflowId,
        err: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

/** The request id when the request carries one, else a new uuid. */
async function requestTraceId(): Promise<string> {
  try {
    const id = (await headers()).get("x-request-id")?.trim();
    if (id) return id;
  } catch {
    // Outside a request scope (scripts, tests): fall through to a new id.
  }
  return randomUUID();
}

/**
 * Schedules the closing hook in `after()` for each distinct (project, tramo)
 * pair of the given tasks, once the response is sent. Tasks without a tramo
 * (admin tasks, legacy rows) have no stage to close and are skipped.
 */
export async function scheduleTaskClosingHook(
  tasks: ClosingHookTask | ClosingHookTask[],
  actorId: string | null
): Promise<void> {
  const pairs = new Map<string, { projectId: string; workflowId: string }>();
  for (const task of Array.isArray(tasks) ? tasks : [tasks]) {
    if (!task.workflowId) continue;
    pairs.set(`${task.projectId}:${task.workflowId}`, { projectId: task.projectId, workflowId: task.workflowId });
  }
  if (pairs.size === 0) return;
  const traceId = await requestTraceId();
  for (const { projectId, workflowId } of pairs.values()) {
    after(() => runTaskClosingHook(projectId, workflowId, actorId, traceId));
  }
}
