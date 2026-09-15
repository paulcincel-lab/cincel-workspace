import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { areaWorkflows, areas, workflowTaskTemplates, workflows } from "@/lib/db/schema";
import { recordChanges } from "@/lib/repositories/history-repository";
import type {
  Workflow,
  WorkflowDetail,
  WorkflowInput,
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
  };
}

export function toTemplate(row: typeof workflowTaskTemplates.$inferSelect): WorkflowTaskTemplate {
  return {
    id: row.id,
    workflowId: row.workflowId,
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

export async function listWorkflows(
  options: { includeInactive?: boolean; includeInactiveTemplates?: boolean } = {}
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
      areas: { with: { area: true } },
    },
  });
  return rows.map((r) => ({
    ...toWorkflow(r),
    templates: r.templates.map(toTemplate),
    areas: r.areas
      .filter((a) => a.area.deletedAt === null)
      .map((a) => ({ id: a.area.id, name: a.area.name })),
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
  return rows.map(toTemplate);
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
  return toTemplate(row);
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
  return toTemplate(after);
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
