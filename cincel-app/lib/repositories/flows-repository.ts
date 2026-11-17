/**
 * Flows catalog (#1035): the etapas of each flow in order, with the gate that
 * says when an etapa is ready. Admin reads and writes for Ajustes › Flujos.
 * Exactly one flow is the default; projects without a flow follow it.
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { flows, flowTramos, projects, workflowPhases, workflows } from "@/lib/db/schema";
import type { FlowExecutor } from "@/lib/project-flow/db";
import { FLOW_ERROR, flowError } from "@/lib/project-flow/errors";
import { flowKeyFor, validateFlowTramos } from "@/lib/project-flow/flow-validation";
import { nameKey } from "@/lib/project-flow/names";
import type {
  AjustesFlujosPageData,
  FlowAdminRow,
  FlowEtapaOption,
  FlowInput,
} from "@/lib/types/flows-admin";

/** Every flow (inactive ones too) with its etapas in order, and the live projects each one governs. */
export async function listFlowsAdmin(): Promise<FlowAdminRow[]> {
  const flowRows = await db.select().from(flows).orderBy(asc(flows.name));
  if (flowRows.length === 0) return [];
  const [tramoRows, ownCounts] = await Promise.all([
    db
      .select({
        flowId: flowTramos.flowId,
        workflowId: flowTramos.workflowId,
        workflowName: workflows.name,
        afterWorkflowId: flowTramos.afterWorkflowId,
        gatePhaseKey: flowTramos.gatePhaseKey,
      })
      .from(flowTramos)
      .innerJoin(workflows, eq(workflows.id, flowTramos.workflowId))
      .orderBy(asc(flowTramos.sortOrder), asc(workflows.name)),
    db
      .select({ flowId: projects.flowId, n: sql<number>`count(*)::int` })
      .from(projects)
      .where(isNull(projects.deletedAt))
      .groupBy(projects.flowId),
  ]);
  const counts = new Map<string | null, number>(ownCounts.map((r) => [r.flowId, Number(r.n)]));
  const activeIds = new Set(flowRows.filter((f) => f.active).map((f) => f.id));
  // Projects without a flow, or whose flow is inactive, follow the default.
  const toDefault = [...counts.entries()]
    .filter(([id]) => id === null || !activeIds.has(id))
    .reduce((sum, [, n]) => sum + n, 0);
  return flowRows.map((f) => ({
    id: f.id,
    key: f.key,
    name: f.name,
    active: f.active,
    isDefault: f.isDefault,
    projectCount: (activeIds.has(f.id) ? (counts.get(f.id) ?? 0) : 0) + (f.isDefault ? toDefault : 0),
    tramos: tramoRows
      .filter((t) => t.flowId === f.id)
      .map(({ workflowId, workflowName, afterWorkflowId, gatePhaseKey }) => ({
        workflowId,
        workflowName,
        afterWorkflowId,
        gatePhaseKey,
      })),
  }));
}

/** The live, active etapas an admin can put in a flow, with their keyed fases (the possible gates). */
export async function listFlowEtapaOptions(): Promise<FlowEtapaOption[]> {
  const etapas = await db
    .select({ id: workflows.id, name: workflows.name })
    .from(workflows)
    .where(and(isNull(workflows.deletedAt), eq(workflows.active, true)))
    .orderBy(asc(workflows.sortOrder), asc(workflows.name));
  if (etapas.length === 0) return [];
  const phases = await db
    .select({ workflowId: workflowPhases.workflowId, key: workflowPhases.key, name: workflowPhases.name })
    .from(workflowPhases)
    .where(
      and(
        inArray(
          workflowPhases.workflowId,
          etapas.map((e) => e.id)
        ),
        eq(workflowPhases.active, true)
      )
    )
    .orderBy(asc(workflowPhases.sortOrder), asc(workflowPhases.name));
  return etapas.map((e) => ({
    ...e,
    phases: phases
      .filter((p): p is typeof p & { key: string } => p.workflowId === e.id && p.key !== null)
      .map((p) => ({ key: p.key, name: p.name })),
  }));
}

export async function getFlowsPageData(): Promise<AjustesFlujosPageData> {
  const [flowRows, etapas] = await Promise.all([listFlowsAdmin(), listFlowEtapaOptions()]);
  return { flows: flowRows, etapas };
}

/** Checks the etapas of a flow against the catalog: live etapas, gate fases that exist. */
async function assertTramosValid(tx: FlowExecutor, tramos: FlowInput["tramos"]): Promise<void> {
  const ids = [...new Set(tramos.flatMap((t) => [t.workflowId, ...(t.afterWorkflowId ? [t.afterWorkflowId] : [])]))];
  const live = await tx
    .select({ id: workflows.id })
    .from(workflows)
    .where(and(inArray(workflows.id, ids), isNull(workflows.deletedAt)));
  if (live.length !== ids.length) throw flowError(FLOW_ERROR.INVALID, "tramos");
  const phaseRows = await tx
    .select({ workflowId: workflowPhases.workflowId, key: workflowPhases.key })
    .from(workflowPhases)
    .where(inArray(workflowPhases.workflowId, ids));
  const keys = new Map<string, Set<string>>();
  for (const p of phaseRows) {
    if (!p.key) continue;
    const set = keys.get(p.workflowId) ?? new Set<string>();
    set.add(p.key);
    keys.set(p.workflowId, set);
  }
  validateFlowTramos(tramos, keys);
}

async function assertNameFree(tx: FlowExecutor, name: string, exceptId?: string): Promise<void> {
  const rows = await tx.select({ id: flows.id, name: flows.name }).from(flows);
  const wanted = nameKey(name);
  if (rows.some((r) => r.id !== exceptId && nameKey(r.name) === wanted)) throw flowError(FLOW_ERROR.NAME_TAKEN);
}

async function writeTramos(tx: FlowExecutor, flowId: string, tramos: FlowInput["tramos"]): Promise<void> {
  await tx.delete(flowTramos).where(eq(flowTramos.flowId, flowId));
  await tx.insert(flowTramos).values(
    tramos.map((t, index) => ({
      flowId,
      workflowId: t.workflowId,
      sortOrder: index,
      afterWorkflowId: t.afterWorkflowId ?? null,
      gatePhaseKey: t.gatePhaseKey ?? null,
    }))
  );
}

/** Creates an active, non-default flow. Errors: EMPTY (name), NAME_TAKEN, INVALID. */
export async function createFlow(input: FlowInput): Promise<FlowAdminRow> {
  const id = await db.transaction(async (tx) => {
    await assertNameFree(tx, input.name);
    await assertTramosValid(tx, input.tramos);
    const taken = new Set((await tx.select({ key: flows.key }).from(flows)).map((r) => r.key));
    const [row] = await tx
      .insert(flows)
      .values({ key: flowKeyFor(input.name, taken), name: input.name, active: input.active ?? true, isDefault: false })
      .returning({ id: flows.id });
    await writeTramos(tx, row.id, input.tramos);
    return row.id;
  });
  return requireFlowRow(id);
}

/**
 * Renames a flow, replaces its etapas (order, gates) and toggles `active`.
 * The default flow stays active. Errors: NOT_FOUND, NAME_TAKEN, INVALID.
 */
export async function updateFlow(id: string, input: FlowInput): Promise<FlowAdminRow> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(flows).where(eq(flows.id, id)).for("update").limit(1);
    if (!row) throw flowError(FLOW_ERROR.NOT_FOUND);
    if (row.isDefault && input.active === false) throw flowError(FLOW_ERROR.INVALID, "active");
    await assertNameFree(tx, input.name, id);
    await assertTramosValid(tx, input.tramos);
    await tx
      .update(flows)
      .set({ name: input.name, active: input.active ?? row.active, updatedAt: new Date() })
      .where(eq(flows.id, id));
    await writeTramos(tx, id, input.tramos);
  });
  return requireFlowRow(id);
}

/** Makes an active flow the default (the previous default stops being one). Errors: NOT_FOUND, INVALID. */
export async function setDefaultFlow(id: string): Promise<FlowAdminRow> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(flows).where(eq(flows.id, id)).for("update").limit(1);
    if (!row) throw flowError(FLOW_ERROR.NOT_FOUND);
    if (!row.active) throw flowError(FLOW_ERROR.INVALID, "active");
    if (row.isDefault) return;
    // The partial unique index allows one default: clear before setting.
    await tx.update(flows).set({ isDefault: false, updatedAt: new Date() }).where(eq(flows.isDefault, true));
    await tx.update(flows).set({ isDefault: true, updatedAt: new Date() }).where(eq(flows.id, id));
  });
  return requireFlowRow(id);
}

async function requireFlowRow(id: string): Promise<FlowAdminRow> {
  const row = (await listFlowsAdmin()).find((f) => f.id === id);
  if (!row) throw flowError(FLOW_ERROR.NOT_FOUND);
  return row;
}
