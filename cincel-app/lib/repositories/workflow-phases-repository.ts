/**
 * Fases: the ordered catalog of each etapa (project flow BE §8.1). Changes
 * are recorded in `history_events` under entity `workflow` (field
 * `phase:<name>`), like template edits.
 */
import { and, asc, count, eq, inArray, isNull, ne } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { workflowPhases, workflowTaskTemplates, workflows } from "@/lib/db/schema";
import type { FlowExecutor } from "@/lib/project-flow/db";
import { nameKey } from "@/lib/project-flow/names";
import { recordChange } from "@/lib/repositories/history-repository";
import type { WorkflowPhase, WorkflowPhaseInput, WorkflowPhaseRef } from "@/lib/types/core";

export type ListPhasesOptions = { includeInactive?: boolean };

/** Fases of several etapas at once, in catalog order (`sort_order`, then name). Etapas without fases map to []. */
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

/** One etapa's fases in catalog order. */
export async function listPhases(workflowId: string, opts: ListPhasesOptions = {}): Promise<WorkflowPhase[]> {
  return (await listPhasesByWorkflow([workflowId], opts)).get(workflowId) ?? [];
}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === "object" && (current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function cleanName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error("EMPTY");
  return name;
}

/** NAME_TAKEN when another fase of the etapa has the same nameKey (lower, no accents, collapsed spaces). */
async function assertNameFree(executor: FlowExecutor, workflowId: string, name: string, exceptId?: string) {
  const rows = await executor
    .select({ name: workflowPhases.name })
    .from(workflowPhases)
    .where(
      and(eq(workflowPhases.workflowId, workflowId), exceptId ? ne(workflowPhases.id, exceptId) : undefined)
    );
  const key = nameKey(name);
  if (rows.some((r) => nameKey(r.name) === key)) throw new Error("NAME_TAKEN");
}

async function templateCountOf(executor: FlowExecutor, phaseId: string): Promise<number> {
  const [row] = await executor
    .select({ n: count() })
    .from(workflowTaskTemplates)
    .where(and(eq(workflowTaskTemplates.phaseId, phaseId), eq(workflowTaskTemplates.active, true)));
  return Number(row?.n ?? 0);
}

function toPhase(row: typeof workflowPhases.$inferSelect, templateCount: number): WorkflowPhase {
  return {
    id: row.id,
    workflowId: row.workflowId,
    name: row.name,
    sortOrder: row.sortOrder,
    active: row.active,
    templateCount,
  };
}

/** History under entity `workflow`, field `phase:<name>`. */
async function recordPhaseChange(
  executor: FlowExecutor,
  workflowId: string,
  actorId: string,
  phaseName: string,
  before: string | null,
  after: string | null
) {
  await recordChange(
    { entity: "workflow", entityId: workflowId, actorId, field: `phase:${phaseName}`, before, after },
    executor
  );
}

/** Appends a fase last. Errors: NOT_FOUND (etapa), NAME_TAKEN (lower(name) or nameKey), EMPTY. */
export async function createPhase(workflowId: string, input: WorkflowPhaseInput, actorId: string): Promise<WorkflowPhase> {
  const name = cleanName(input.name);
  try {
    return await db.transaction(async (tx) => {
      const [workflow] = await tx
        .select({ id: workflows.id })
        .from(workflows)
        .where(and(eq(workflows.id, workflowId), isNull(workflows.deletedAt)))
        .limit(1);
      if (!workflow) throw new Error("NOT_FOUND");
      await assertNameFree(tx, workflowId, name);
      const existing = await tx
        .select({ sortOrder: workflowPhases.sortOrder })
        .from(workflowPhases)
        .where(eq(workflowPhases.workflowId, workflowId));
      const sortOrder = existing.reduce((max, r) => Math.max(max, r.sortOrder + 1), 0);
      const [row] = await tx
        .insert(workflowPhases)
        .values({ workflowId, name, sortOrder, active: input.active ?? true })
        .returning();
      await recordPhaseChange(tx, workflowId, actorId, row.name, null, row.name);
      return toPhase(row, 0);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new Error("NAME_TAKEN");
    throw err;
  }
}

/** Rename, activate or deactivate. Errors: NOT_FOUND, NAME_TAKEN, EMPTY. */
export async function updatePhase(
  id: string,
  patch: Partial<WorkflowPhaseInput>,
  actorId: string
): Promise<WorkflowPhase> {
  const nextName = patch.name === undefined ? undefined : cleanName(patch.name);
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(workflowPhases).where(eq(workflowPhases.id, id)).limit(1);
      if (!before) throw new Error("NOT_FOUND");
      const name = nextName ?? before.name;
      const active = patch.active ?? before.active;
      if (name !== before.name) await assertNameFree(tx, before.workflowId, name, id);
      if (name === before.name && active === before.active) {
        return toPhase(before, await templateCountOf(tx, id));
      }
      const [after] = await tx
        .update(workflowPhases)
        .set({ name, active })
        .where(eq(workflowPhases.id, id))
        .returning();
      if (after.name !== before.name) {
        await recordPhaseChange(tx, before.workflowId, actorId, before.name, before.name, after.name);
      }
      if (after.active !== before.active) {
        await recordPhaseChange(
          tx,
          before.workflowId,
          actorId,
          after.name,
          before.active ? "activa" : "inactiva",
          after.active ? "activa" : "inactiva"
        );
      }
      return toPhase(after, await templateCountOf(tx, id));
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new Error("NAME_TAKEN");
    throw err;
  }
}

/** One transaction, `sort_order` = index. `orderedIds` must be exactly the etapa's fase ids (else NOT_FOUND). */
export async function reorderPhases(workflowId: string, orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: workflowPhases.id })
      .from(workflowPhases)
      .where(eq(workflowPhases.workflowId, workflowId));
    const current = new Set(rows.map((r) => r.id));
    const given = new Set(orderedIds);
    if (given.size !== orderedIds.length || given.size !== current.size || orderedIds.some((id) => !current.has(id))) {
      throw new Error("NOT_FOUND");
    }
    for (const [i, id] of orderedIds.entries()) {
      await tx
        .update(workflowPhases)
        .set({ sortOrder: i })
        .where(and(eq(workflowPhases.id, id), eq(workflowPhases.workflowId, workflowId)));
    }
  });
}

/** Throws PHASE_MISMATCH unless `phaseId` is a fase of `workflowId`. */
export async function assertPhaseInWorkflow(tx: FlowExecutor, phaseId: string, workflowId: string): Promise<void> {
  const [row] = await tx
    .select({ id: workflowPhases.id })
    .from(workflowPhases)
    .where(and(eq(workflowPhases.id, phaseId), eq(workflowPhases.workflowId, workflowId)))
    .limit(1);
  if (!row) throw new Error("PHASE_MISMATCH");
}

/** The fase with `workflow_phases.key = phaseKey` in the live etapa `workflowKey`, or null (readiness gates). */
export async function resolveGatePhase(
  executor: FlowExecutor,
  workflowKey: string,
  phaseKey: string
): Promise<WorkflowPhaseRef | null> {
  const [row] = await executor
    .select({ id: workflowPhases.id, name: workflowPhases.name, sortOrder: workflowPhases.sortOrder })
    .from(workflowPhases)
    .innerJoin(workflows, eq(workflows.id, workflowPhases.workflowId))
    .where(and(eq(workflows.key, workflowKey), isNull(workflows.deletedAt), eq(workflowPhases.key, phaseKey)))
    .limit(1);
  return row ?? null;
}
