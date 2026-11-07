import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { areaWorkflows, areas, workflowPhases, workflowTaskTemplates, workflows } from "@/lib/db/schema";
import { READINESS } from "@/lib/project-flow/catalog";
import { notImplemented } from "@/lib/project-flow/not-implemented";
import { recordChanges } from "@/lib/repositories/history-repository";
import { listPhasesByWorkflow } from "@/lib/repositories/workflow-phases-repository";
import type {
  TramoReadiness,
  Workflow,
  WorkflowDetail,
  WorkflowInput,
  WorkflowPhase,
  WorkflowRef,
  WorkflowTaskTemplate,
  WorkflowTaskTemplateInput,
} from "@/lib/types/core";

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

function toWorkflow(row: typeof workflows.$inferSelect): Workflow {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    active: row.active,
    sortOrder: row.sortOrder,
    autoStart: row.autoStart,
  };
}

/**
 * `phaseNames`: fase id → name. `phaseId`/`phaseName` are "" only for a
 * template without a fase, which exists only before 0024 backfills them.
 */
export function toTemplate(
  row: typeof workflowTaskTemplates.$inferSelect,
  phaseNames?: ReadonlyMap<string, string>
): WorkflowTaskTemplate {
  return {
    id: row.id,
    workflowId: row.workflowId,
    phaseId: row.phaseId ?? "",
    phaseName: (row.phaseId && phaseNames?.get(row.phaseId)) || "",
    phase: row.phase,
    title: row.title,
    notes: row.notes,
    defaultPriority: row.defaultPriority,
    commitmentOffsetDays: row.commitmentOffsetDays,
    reviewOffsetDays: row.reviewOffsetDays,
    deliveryOffsetDays: row.deliveryOffsetDays,
    sortOrder: row.sortOrder,
    active: row.active,
  };
}

async function phaseNamesOf(phaseIds: Array<string | null>): Promise<Map<string, string>> {
  const ids = [...new Set(phaseIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: workflowPhases.id, name: workflowPhases.name })
    .from(workflowPhases)
    .where(inArray(workflowPhases.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

const toRef = (w: { id: string; key: string; name: string; sortOrder: number }): WorkflowRef => ({
  id: w.id,
  key: w.key,
  name: w.name,
  sortOrder: w.sortOrder,
});

/**
 * Readiness from `READINESS` (lib/project-flow/catalog.ts), resolved through
 * `workflow_phases.key` among live workflows. Null for a tramo with no rule,
 * or when the previous tramo or its gate fase is missing.
 */
function resolveReadiness(
  workflow: { key: string },
  byKey: ReadonlyMap<string, { id: string; key: string; name: string; sortOrder: number }>,
  phasesOf: (workflowId: string) => Array<{ id: string; name: string; sortOrder: number; key: string | null }>
): TramoReadiness {
  const rule = READINESS[workflow.key];
  if (!rule) return null;
  const after = byKey.get(rule.after);
  if (!after) return null;
  const gate = phasesOf(after.id).find((p) => p.key === rule.phaseKey);
  if (!gate) return null;
  return { afterWorkflow: toRef(after), afterPhase: { id: gate.id, name: gate.name, sortOrder: gate.sortOrder } };
}

export async function listWorkflows(
  options: { includeInactive?: boolean; includeInactiveTemplates?: boolean; includeInactivePhases?: boolean } = {}
): Promise<WorkflowDetail[]> {
  const rows = await db.query.workflows.findMany({
    where: and(
      isNull(workflows.deletedAt),
      options.includeInactive ? undefined : eq(workflows.active, true)
    ),
    orderBy: [asc(workflows.sortOrder), asc(workflows.name)],
    with: {
      templates: {
        where: options.includeInactiveTemplates ? undefined : eq(workflowTaskTemplates.active, true),
        orderBy: asc(workflowTaskTemplates.sortOrder),
      },
    },
  });
  const ids = rows.map((r) => r.id);
  const [phases, gateRows, areaRows] = await Promise.all([
    listPhasesByWorkflow(ids, { includeInactive: options.includeInactivePhases }),
    // Every fase with a key of every live workflow: readiness gates may sit in a tramo filtered out above.
    db
      .select({
        id: workflowPhases.id,
        workflowId: workflowPhases.workflowId,
        key: workflowPhases.key,
        name: workflowPhases.name,
        sortOrder: workflowPhases.sortOrder,
      })
      .from(workflowPhases),
    // Deprecated `areas` field, kept until the UI stops reading it.
    ids.length
      ? db
          .select({ workflowId: areaWorkflows.workflowId, id: areas.id, name: areas.name })
          .from(areaWorkflows)
          .innerJoin(areas, eq(areas.id, areaWorkflows.areaId))
          .where(and(inArray(areaWorkflows.workflowId, ids), isNull(areas.deletedAt)))
      : Promise.resolve([] as Array<{ workflowId: string; id: string; name: string }>),
  ]);
  const allWorkflows = await db
    .select({ id: workflows.id, key: workflows.key, name: workflows.name, sortOrder: workflows.sortOrder })
    .from(workflows)
    .where(isNull(workflows.deletedAt));
  const byKey = new Map(allWorkflows.map((w) => [w.key, w]));
  const phaseNames = new Map(gateRows.map((p) => [p.id, p.name]));
  const phasesOf = (workflowId: string) => gateRows.filter((p) => p.workflowId === workflowId);
  return rows.map((r) => ({
    ...toWorkflow(r),
    phases: phases.get(r.id) ?? ([] as WorkflowPhase[]),
    templates: r.templates.map((t) => toTemplate(t, phaseNames)),
    readiness: resolveReadiness(r, byKey, phasesOf),
    areas: areaRows.filter((a) => a.workflowId === r.id).map((a) => ({ id: a.id, name: a.name })),
  }));
}

export async function getWorkflow(id: string): Promise<WorkflowDetail | null> {
  const all = await listWorkflows({ includeInactive: true, includeInactiveTemplates: true });
  return all.find((w) => w.id === id) ?? null;
}

export async function getWorkflowByKey(key: string): Promise<WorkflowDetail | null> {
  const all = await listWorkflows({ includeInactive: true, includeInactiveTemplates: true });
  return all.find((w) => w.key === key) ?? null;
}

function toValues(input: WorkflowInput) {
  return {
    key: input.key.trim().toLowerCase(),
    name: input.name.trim(),
    description: clean(input.description),
    active: input.active ?? true,
    sortOrder: input.sortOrder ?? 0,
  };
}

export async function createWorkflow(input: WorkflowInput, actorId: string): Promise<Workflow> {
  const [row] = await db.insert(workflows).values(toValues(input)).returning();
  await recordChanges({
    entity: "workflow",
    entityId: row.id,
    actorId,
    before: { name: null },
    after: { name: row.name },
    fields: ["name"],
  });
  return toWorkflow(row);
}

export async function updateWorkflow(
  id: string,
  patch: Partial<WorkflowInput>,
  actorId: string
): Promise<Workflow> {
  const [before] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, id), isNull(workflows.deletedAt)))
    .limit(1);
  if (!before) throw new Error("WORKFLOW_NOT_FOUND");
  const merged = toValues({
    key: patch.key ?? before.key,
    name: patch.name ?? before.name,
    description: patch.description === undefined ? before.description : patch.description,
    active: patch.active ?? before.active,
    sortOrder: patch.sortOrder ?? before.sortOrder,
  });
  const [after] = await db.update(workflows).set(merged).where(eq(workflows.id, id)).returning();
  await recordChanges({
    entity: "workflow",
    entityId: id,
    actorId,
    before,
    after,
    fields: ["key", "name", "description", "active", "sortOrder"],
  });
  return toWorkflow(after);
}

export async function softDeleteWorkflow(id: string, actorId: string): Promise<void> {
  const [row] = await db
    .update(workflows)
    .set({ deletedAt: new Date(), active: false })
    .where(and(eq(workflows.id, id), isNull(workflows.deletedAt)))
    .returning();
  if (!row) throw new Error("WORKFLOW_NOT_FOUND");
  await recordChanges({
    entity: "workflow",
    entityId: id,
    actorId,
    before: { deleted: false },
    after: { deleted: true },
    fields: ["deleted"],
  });
}

// ── Templates ───────────────────────────────────────────────────────────────
function toTemplateValues(input: WorkflowTaskTemplateInput) {
  return {
    phase: clean(input.phase),
    // Old-UI fallback (phaseId from the old `phase` text, else the first fase) lands in #739.
    ...(input.phaseId ? { phaseId: input.phaseId } : {}),
    title: input.title.trim(),
    notes: clean(input.notes),
    defaultPriority: input.defaultPriority ?? "media",
    commitmentOffsetDays: input.commitmentOffsetDays ?? null,
    reviewOffsetDays: input.reviewOffsetDays ?? null,
    deliveryOffsetDays: input.deliveryOffsetDays ?? null,
    sortOrder: input.sortOrder ?? 0,
    active: input.active ?? true,
  };
}

export async function listTemplates(
  workflowId: string,
  options: { includeInactive?: boolean } = {}
): Promise<WorkflowTaskTemplate[]> {
  const rows = await db
    .select()
    .from(workflowTaskTemplates)
    .where(
      and(
        eq(workflowTaskTemplates.workflowId, workflowId),
        options.includeInactive ? undefined : eq(workflowTaskTemplates.active, true)
      )
    )
    .orderBy(asc(workflowTaskTemplates.sortOrder), asc(workflowTaskTemplates.title));
  const names = await phaseNamesOf(rows.map((r) => r.phaseId));
  return rows.map((r) => toTemplate(r, names));
}

export async function createTemplate(
  workflowId: string,
  input: WorkflowTaskTemplateInput,
  actorId: string
): Promise<WorkflowTaskTemplate> {
  const values = toTemplateValues(input);
  if (input.sortOrder === undefined) {
    const existing = await listTemplates(workflowId, { includeInactive: true });
    values.sortOrder = existing.length;
  }
  const [row] = await db
    .insert(workflowTaskTemplates)
    .values({ workflowId, ...values })
    .returning();
  await recordChange(workflowId, actorId, "template_added", null, row.title);
  return toTemplate(row, await phaseNamesOf([row.phaseId]));
}

export async function updateTemplate(
  id: string,
  patch: Partial<WorkflowTaskTemplateInput>,
  actorId: string
): Promise<WorkflowTaskTemplate> {
  const [before] = await db
    .select()
    .from(workflowTaskTemplates)
    .where(eq(workflowTaskTemplates.id, id))
    .limit(1);
  if (!before) throw new Error("TEMPLATE_NOT_FOUND");
  const merged = toTemplateValues({
    phase: patch.phase === undefined ? before.phase : patch.phase,
    phaseId: patch.phaseId ?? before.phaseId ?? undefined,
    title: patch.title ?? before.title,
    notes: patch.notes === undefined ? before.notes : patch.notes,
    defaultPriority: patch.defaultPriority ?? before.defaultPriority,
    commitmentOffsetDays:
      patch.commitmentOffsetDays === undefined ? before.commitmentOffsetDays : patch.commitmentOffsetDays,
    reviewOffsetDays: patch.reviewOffsetDays === undefined ? before.reviewOffsetDays : patch.reviewOffsetDays,
    deliveryOffsetDays:
      patch.deliveryOffsetDays === undefined ? before.deliveryOffsetDays : patch.deliveryOffsetDays,
    sortOrder: patch.sortOrder ?? before.sortOrder,
    active: patch.active ?? before.active,
  });
  const [after] = await db
    .update(workflowTaskTemplates)
    .set(merged)
    .where(eq(workflowTaskTemplates.id, id))
    .returning();
  if (before.title !== after.title) {
    await recordChange(before.workflowId, actorId, "template_title", before.title, after.title);
  }
  if (before.active !== after.active) {
    await recordChange(before.workflowId, actorId, "template_active", `${before.title}: ${before.active}`, `${after.title}: ${after.active}`);
  }
  return toTemplate(after, await phaseNamesOf([after.phaseId]));
}

/** Templates are never hard-deleted while tasks may reference them; deactivate. */
export async function deactivateTemplate(id: string, actorId: string): Promise<WorkflowTaskTemplate> {
  return updateTemplate(id, { active: false }, actorId);
}

export async function reorderTemplates(workflowId: string, orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) {
      await tx
        .update(workflowTaskTemplates)
        .set({ sortOrder: i })
        .where(and(eq(workflowTaskTemplates.id, id), eq(workflowTaskTemplates.workflowId, workflowId)));
    }
  });
}

/** Active tramos for the sidebar and tabs, by `sortOrder` (BE §8.2). */
export async function listTramosNav(): Promise<WorkflowRef[]> {
  return notImplemented("listTramosNav");
}

/**
 * The UI switch (BE §7.1): `true` stores `on_create` for the first active
 * tramo and `on_ready` for the others; `false` stores `manual`. NOT_FOUND.
 */
export async function setWorkflowAutoStart(id: string, enabled: boolean, actorId: string): Promise<Workflow> {
  return notImplemented("setWorkflowAutoStart", id, enabled, actorId);
}

/** @deprecated Áreas are removed (ADR 0003). */
export async function listAreasForWorkflow(workflowId: string) {
  return db
    .select({ id: areas.id, name: areas.name })
    .from(areaWorkflows)
    .innerJoin(areas, eq(areas.id, areaWorkflows.areaId))
    .where(and(eq(areaWorkflows.workflowId, workflowId), isNull(areas.deletedAt)))
    .orderBy(asc(areas.name));
}

async function recordChange(
  workflowId: string,
  actorId: string,
  field: string,
  before: string | null,
  after: string | null
) {
  await recordChanges({
    entity: "workflow",
    entityId: workflowId,
    actorId,
    before: { [field]: before },
    after: { [field]: after },
    fields: [field],
  });
}
