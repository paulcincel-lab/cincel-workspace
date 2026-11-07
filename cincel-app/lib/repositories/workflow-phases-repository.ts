/**
 * Fases: the ordered catalog of each tramo (project flow BE §8.1). Changes
 * are recorded in `history_events` under entity `workflow` (field
 * `phase:<name>`), like template edits.
 */
import { and, asc, count, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { workflowPhases, workflowTaskTemplates } from "@/lib/db/schema";
import type { FlowExecutor } from "@/lib/project-flow/db";
import { notImplemented } from "@/lib/project-flow/not-implemented";
import type { WorkflowPhase, WorkflowPhaseInput, WorkflowPhaseRef } from "@/lib/types/core";

export type ListPhasesOptions = { includeInactive?: boolean };

/** Fases of several tramos at once, in catalog order (`sort_order`, then name). Tramos without fases map to []. */
export async function listPhasesByWorkflow(
  workflowIds: string[],
  opts: ListPhasesOptions = {}
): Promise<Map<string, WorkflowPhase[]>> {
  const out = new Map<string, WorkflowPhase[]>(workflowIds.map((id) => [id, []]));
  if (workflowIds.length === 0) return out;
  const rows = await db
    .select()
    .from(workflowPhases)
    .where(
      and(
        inArray(workflowPhases.workflowId, workflowIds),
        opts.includeInactive ? undefined : eq(workflowPhases.active, true)
      )
    )
    .orderBy(asc(workflowPhases.sortOrder), asc(workflowPhases.name));
  const counts = new Map<string, number>();
  if (rows.length > 0) {
    const countRows = await db
      .select({ phaseId: workflowTaskTemplates.phaseId, n: count() })
      .from(workflowTaskTemplates)
      .where(
        and(
          inArray(
            workflowTaskTemplates.phaseId,
            rows.map((r) => r.id)
          ),
          eq(workflowTaskTemplates.active, true)
        )
      )
      .groupBy(workflowTaskTemplates.phaseId);
    for (const r of countRows) if (r.phaseId) counts.set(r.phaseId, Number(r.n));
  }
  for (const r of rows) {
    out.get(r.workflowId)?.push({
      id: r.id,
      workflowId: r.workflowId,
      name: r.name,
      sortOrder: r.sortOrder,
      active: r.active,
      templateCount: counts.get(r.id) ?? 0,
    });
  }
  return out;
}

/** One tramo's fases in catalog order. */
export async function listPhases(workflowId: string, opts: ListPhasesOptions = {}): Promise<WorkflowPhase[]> {
  return (await listPhasesByWorkflow([workflowId], opts)).get(workflowId) ?? [];
}

/** Appends a fase last. Errors: NOT_FOUND (tramo), NAME_TAKEN (lower(name) or nameKey), EMPTY. */
export async function createPhase(workflowId: string, input: WorkflowPhaseInput, actorId: string): Promise<WorkflowPhase> {
  return notImplemented("createPhase", workflowId, input, actorId);
}

/** Rename, activate or deactivate. Errors: NOT_FOUND, NAME_TAKEN, EMPTY. */
export async function updatePhase(
  id: string,
  patch: Partial<WorkflowPhaseInput>,
  actorId: string
): Promise<WorkflowPhase> {
  return notImplemented("updatePhase", id, patch, actorId);
}

/** One transaction, `sort_order` = index. `orderedIds` must be exactly the tramo's fase ids (else NOT_FOUND). */
export async function reorderPhases(workflowId: string, orderedIds: string[]): Promise<void> {
  return notImplemented("reorderPhases", workflowId, orderedIds);
}

/** Throws PHASE_MISMATCH unless `phaseId` is a fase of `workflowId`. */
export async function assertPhaseInWorkflow(tx: FlowExecutor, phaseId: string, workflowId: string): Promise<void> {
  return notImplemented("assertPhaseInWorkflow", tx, phaseId, workflowId);
}

/** The fase with `workflow_phases.key = phaseKey` in the live tramo `workflowKey`, or null (readiness gates). */
export async function resolveGatePhase(
  executor: FlowExecutor,
  workflowKey: string,
  phaseKey: string
): Promise<WorkflowPhaseRef | null> {
  return notImplemented("resolveGatePhase", executor, workflowKey, phaseKey);
}
