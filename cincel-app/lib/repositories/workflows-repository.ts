import { and, asc, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { projects, tasks, workflowPhases, workflowTaskTemplates, workflows } from "@/lib/db/schema";
import { READINESS } from "@/lib/project-flow/catalog";
import type { FlowExecutor } from "@/lib/project-flow/db";
import { FLOW_ERROR, flowError } from "@/lib/project-flow/errors";
import { recordChanges } from "@/lib/repositories/history-repository";
import { assertPhaseInWorkflow, listPhasesByWorkflow } from "@/lib/repositories/workflow-phases-repository";
import { TRAMO_COLOR_SLOTS, type TramoColorSlot } from "@/lib/tramos/tramo-color";
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

/** A stored `color_slot` as a slot; anything outside 1–5 reads as null (derived color). */
export function toColorSlot(value: number | null | undefined): TramoColorSlot | null {
  return typeof value === "number" && (TRAMO_COLOR_SLOTS as readonly number[]).includes(value)
    ? (value as TramoColorSlot)
    : null;
}

function toWorkflow(row: typeof workflows.$inferSelect): Workflow {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    active: row.active,
    sortOrder: row.sortOrder,
    autoStart: row.autoStart,
    colorSlot: toColorSlot(row.colorSlot),
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
    title: row.title,
    notes: row.notes,
    defaultPriority: row.defaultPriority,
    commitmentOffsetDays: row.commitmentOffsetDays,
    reviewOffsetDays: row.reviewOffsetDays,
    deliveryOffsetDays: row.deliveryOffsetDays,
    defaultEstimatedHours: row.defaultEstimatedHours ?? null,
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

const toRef = (w: { id: string; key: string; name: string; sortOrder: number; colorSlot?: number | null }): WorkflowRef => ({
  id: w.id,
  key: w.key,
  name: w.name,
  sortOrder: w.sortOrder,
  // Only reads that select `color_slot` carry it.
  ...(w.colorSlot !== undefined ? { colorSlot: toColorSlot(w.colorSlot) } : {}),
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
  const [phases, gateRows] = await Promise.all([
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
  }));
}

/**
 * Active tramos with their active fases, in **one** query, for pickers that
 * only need the fases (Ajustes › Puestos, `PositionEditorDrawer`). Same order
 * and fase rows as `listWorkflows({})`, but `templates` is always `[]` and
 * `readiness` is always `null`: use `listWorkflows` when those matter.
 */
export async function listWorkflowPhaseTree(): Promise<WorkflowDetail[]> {
  const rows = await db
    .select({
      workflow: workflows,
      phase: {
        id: workflowPhases.id,
        name: workflowPhases.name,
        sortOrder: workflowPhases.sortOrder,
        active: workflowPhases.active,
      },
      templateCount: sql<number>`(
        select count(*)::int from ${workflowTaskTemplates}
        where ${workflowTaskTemplates.phaseId} = ${workflowPhases.id} and ${workflowTaskTemplates.active}
      )`,
    })
    .from(workflows)
    .leftJoin(workflowPhases, and(eq(workflowPhases.workflowId, workflows.id), eq(workflowPhases.active, true)))
    .where(and(isNull(workflows.deletedAt), eq(workflows.active, true)))
    .orderBy(asc(workflows.sortOrder), asc(workflows.name), asc(workflowPhases.sortOrder), asc(workflowPhases.name));
  const out = new Map<string, WorkflowDetail>();
  for (const row of rows) {
    let detail = out.get(row.workflow.id);
    if (!detail) {
      detail = { ...toWorkflow(row.workflow), phases: [], templates: [], readiness: null };
      out.set(row.workflow.id, detail);
    }
    if (row.phase) {
      detail.phases.push({
        id: row.phase.id,
        workflowId: row.workflow.id,
        name: row.phase.name,
        sortOrder: row.phase.sortOrder,
        active: row.phase.active,
        templateCount: Number(row.templateCount ?? 0),
      });
    }
  }
  return [...out.values()];
}

export async function getWorkflow(id: string): Promise<WorkflowDetail | null> {
  const all = await listWorkflows({ includeInactive: true, includeInactiveTemplates: true });
  return all.find((w) => w.id === id) ?? null;
}

export async function getWorkflowByKey(key: string): Promise<WorkflowDetail | null> {
  const all = await listWorkflows({ includeInactive: true, includeInactiveTemplates: true });
  return all.find((w) => w.key === key) ?? null;
}

/** INVALID for a color slot outside 1–5 (`workflows_color_slot_check`). */
function cleanColorSlot(value: number | null | undefined): TramoColorSlot | null {
  if (value === null || value === undefined) return null;
  const slot = toColorSlot(value);
  if (slot === null) throw new Error("INVALID: colorSlot");
  return slot;
}

function toValues(input: WorkflowInput) {
  return {
    key: input.key.trim().toLowerCase(),
    name: input.name.trim(),
    description: clean(input.description),
    active: input.active ?? true,
    sortOrder: input.sortOrder ?? 0,
    colorSlot: cleanColorSlot(input.colorSlot),
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
    colorSlot: patch.colorSlot === undefined ? toColorSlot(before.colorSlot) : patch.colorSlot,
  });
  const [after] = await db.update(workflows).set(merged).where(eq(workflows.id, id)).returning();
  await recordChanges({
    entity: "workflow",
    entityId: id,
    actorId,
    before,
    after,
    fields: ["key", "name", "description", "active", "sortOrder", "colorSlot"],
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
const UNIQUE_VIOLATION = "23505";
const TITLE_UNIQUE_INDEX = "workflow_task_templates_title_lower_uq";

/** Whether an error (or its `cause`, as drizzle wraps driver errors) is the per-fase title unique violation. */
function isTitleTaken(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === "object") {
      const e = current as { code?: unknown; constraint_name?: unknown; constraint?: unknown };
      if (e.code === UNIQUE_VIOLATION) {
        const constraint = e.constraint_name ?? e.constraint;
        return constraint === undefined || constraint === TITLE_UNIQUE_INDEX;
      }
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function toTemplateValues(input: WorkflowTaskTemplateInput) {
  return {
    phaseId: input.phaseId,
    title: input.title.trim(),
    notes: clean(input.notes),
    defaultPriority: input.defaultPriority ?? "media",
    commitmentOffsetDays: input.commitmentOffsetDays ?? null,
    reviewOffsetDays: input.reviewOffsetDays ?? null,
    deliveryOffsetDays: input.deliveryOffsetDays ?? null,
    defaultEstimatedHours: input.defaultEstimatedHours ?? null,
    sortOrder: input.sortOrder ?? 0,
    active: input.active ?? true,
  };
}

/**
 * NAME_TAKEN when another active template of the same fase has the same title
 * (case-insensitive), mirroring `workflow_task_templates_title_lower_uq`.
 */
async function assertTitleFree(
  executor: FlowExecutor,
  workflowId: string,
  phaseId: string,
  title: string,
  exceptId?: string
): Promise<void> {
  const [clash] = await executor
    .select({ id: workflowTaskTemplates.id })
    .from(workflowTaskTemplates)
    .where(
      and(
        eq(workflowTaskTemplates.workflowId, workflowId),
        eq(workflowTaskTemplates.phaseId, phaseId),
        eq(workflowTaskTemplates.active, true),
        sql`lower(${workflowTaskTemplates.title}) = lower(${title})`,
        exceptId ? ne(workflowTaskTemplates.id, exceptId) : undefined
      )
    )
    .limit(1);
  if (clash) throw flowError(FLOW_ERROR.NAME_TAKEN, "template title");
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

/** `phaseId` is required. Errors: NOT_FOUND (tramo), INVALID (no fase), PHASE_MISMATCH, NAME_TAKEN. */
export async function createTemplate(
  workflowId: string,
  input: WorkflowTaskTemplateInput,
  actorId: string
): Promise<WorkflowTaskTemplate> {
  if (!input.phaseId) throw flowError(FLOW_ERROR.INVALID, "phaseId");
  const values = toTemplateValues(input);
  let row: typeof workflowTaskTemplates.$inferSelect;
  try {
    row = await db.transaction(async (tx) => {
      const [workflow] = await tx
        .select({ id: workflows.id })
        .from(workflows)
        .where(and(eq(workflows.id, workflowId), isNull(workflows.deletedAt)))
        .limit(1);
      if (!workflow) throw flowError(FLOW_ERROR.NOT_FOUND, "workflow");
      await assertPhaseInWorkflow(tx, values.phaseId, workflowId);
      if (values.active) await assertTitleFree(tx, workflowId, values.phaseId, values.title);
      if (input.sortOrder === undefined) {
        const [{ n }] = await tx
          .select({ n: count() })
          .from(workflowTaskTemplates)
          .where(eq(workflowTaskTemplates.workflowId, workflowId));
        values.sortOrder = Number(n);
      }
      const [inserted] = await tx
        .insert(workflowTaskTemplates)
        .values({ workflowId, ...values })
        .returning();
      return inserted;
    });
  } catch (err) {
    if (isTitleTaken(err)) throw flowError(FLOW_ERROR.NAME_TAKEN, "template title");
    throw err;
  }
  await recordChange(workflowId, actorId, "template_added", null, row.title);
  return toTemplate(row, await phaseNamesOf([row.phaseId]));
}

/**
 * Partial patch. The result must have a fase: a patch without `phaseId` keeps
 * the current one, and a template with none needs one. Errors: NOT_FOUND,
 * INVALID (no fase), PHASE_MISMATCH, NAME_TAKEN.
 */
export async function updateTemplate(
  id: string,
  patch: Partial<WorkflowTaskTemplateInput>,
  actorId: string
): Promise<WorkflowTaskTemplate> {
  let before: typeof workflowTaskTemplates.$inferSelect;
  let after: typeof workflowTaskTemplates.$inferSelect;
  try {
    [before, after] = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(workflowTaskTemplates)
        .where(eq(workflowTaskTemplates.id, id))
        .limit(1);
      if (!current) throw flowError(FLOW_ERROR.NOT_FOUND, "template");
      const phaseId = patch.phaseId === undefined ? current.phaseId : patch.phaseId;
      if (!phaseId) throw flowError(FLOW_ERROR.INVALID, "phaseId");
      const merged = toTemplateValues({
        phaseId,
        title: patch.title ?? current.title,
        notes: patch.notes === undefined ? current.notes : patch.notes,
        defaultPriority: patch.defaultPriority ?? current.defaultPriority,
        commitmentOffsetDays:
          patch.commitmentOffsetDays === undefined ? current.commitmentOffsetDays : patch.commitmentOffsetDays,
        reviewOffsetDays: patch.reviewOffsetDays === undefined ? current.reviewOffsetDays : patch.reviewOffsetDays,
        deliveryOffsetDays:
          patch.deliveryOffsetDays === undefined ? current.deliveryOffsetDays : patch.deliveryOffsetDays,
        defaultEstimatedHours:
          patch.defaultEstimatedHours === undefined ? current.defaultEstimatedHours : patch.defaultEstimatedHours,
        sortOrder: patch.sortOrder ?? current.sortOrder,
        active: patch.active ?? current.active,
      });
      if (phaseId !== current.phaseId) await assertPhaseInWorkflow(tx, phaseId, current.workflowId);
      const competes =
        merged.active &&
        (phaseId !== current.phaseId ||
          !current.active ||
          merged.title.toLowerCase() !== current.title.toLowerCase());
      if (competes) await assertTitleFree(tx, current.workflowId, phaseId, merged.title, id);
      const [updated] = await tx
        .update(workflowTaskTemplates)
        .set(merged)
        .where(eq(workflowTaskTemplates.id, id))
        .returning();
      return [current, updated] as const;
    });
  } catch (err) {
    if (isTitleTaken(err)) throw flowError(FLOW_ERROR.NAME_TAKEN, "template title");
    throw err;
  }
  if (before.title !== after.title) {
    await recordChange(before.workflowId, actorId, "template_title", before.title, after.title);
  }
  if (before.phaseId !== after.phaseId) {
    const names = await phaseNamesOf([before.phaseId, after.phaseId]);
    await recordChange(
      before.workflowId,
      actorId,
      "template_phase",
      `${before.title}: ${(before.phaseId && names.get(before.phaseId)) || "—"}`,
      `${after.title}: ${(after.phaseId && names.get(after.phaseId)) || "—"}`
    );
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

/** One transaction, `sort_order` = index, live tramos only (Ajustes › Tramos y fases). */
export async function reorderWorkflows(orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) {
      await tx
        .update(workflows)
        .set({ sortOrder: i })
        .where(and(eq(workflows.id, id), isNull(workflows.deletedAt)));
    }
  });
}

/** Per tramo id: the live active projects whose current tramo it is ("Proyectos activos"). */
export async function countActiveProjectsByWorkflow(): Promise<Record<string, number>> {
  const rows = await db
    .select({ workflowId: projects.currentWorkflowId, n: count() })
    .from(projects)
    .where(and(isNull(projects.deletedAt), eq(projects.status, "activo"), sql`${projects.currentWorkflowId} is not null`))
    .groupBy(projects.currentWorkflowId);
  const out: Record<string, number> = {};
  for (const row of rows) if (row.workflowId) out[row.workflowId] = Number(row.n);
  return out;
}

/** Per fase id: its live tasks ("{n} tareas" in the tramo editor). */
export async function countTasksByPhase(): Promise<Record<string, number>> {
  const rows = await db
    .select({ phaseId: tasks.phaseId, n: count() })
    .from(tasks)
    .where(and(isNull(tasks.deletedAt), sql`${tasks.phaseId} is not null`))
    .groupBy(tasks.phaseId);
  const out: Record<string, number> = {};
  for (const row of rows) if (row.phaseId) out[row.phaseId] = Number(row.n);
  return out;
}

/** Active tramos for the sidebar and tabs, by `sortOrder` (BE §8.2). */
export async function listTramosNav(): Promise<WorkflowRef[]> {
  const rows = await db
    .select({
      id: workflows.id,
      key: workflows.key,
      name: workflows.name,
      sortOrder: workflows.sortOrder,
      colorSlot: workflows.colorSlot,
    })
    .from(workflows)
    .where(and(eq(workflows.active, true), isNull(workflows.deletedAt)))
    .orderBy(asc(workflows.sortOrder), asc(workflows.name));
  return rows.map(toRef);
}

/**
 * Whether Presale starts on its own when a project is created: a live,
 * active `presale` tramo set to `on_create` (the create dialog's copy). One
 * statement instead of the full `listWorkflows` the page used to read.
 */
export async function presaleAutoStart(): Promise<boolean> {
  const [row] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(
      and(
        eq(workflows.key, "presale"),
        eq(workflows.active, true),
        eq(workflows.autoStart, "on_create"),
        isNull(workflows.deletedAt)
      )
    )
    .limit(1);
  return row !== undefined;
}

/**
 * The UI switch (BE §7.1): `true` stores `on_create` for the first active
 * tramo and `on_ready` for the others; `false` stores `manual`. NOT_FOUND.
 */
export async function setWorkflowAutoStart(
  id: string,
  enabled: boolean,
  actorId: string,
  executor: FlowExecutor = db
): Promise<Workflow> {
  const [before] = await executor
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, id), isNull(workflows.deletedAt)))
    .limit(1);
  if (!before) throw flowError(FLOW_ERROR.NOT_FOUND, "workflow");
  let next: Workflow["autoStart"] = "manual";
  if (enabled) {
    const [first] = await executor
      .select({ id: workflows.id })
      .from(workflows)
      .where(and(eq(workflows.active, true), isNull(workflows.deletedAt)))
      .orderBy(asc(workflows.sortOrder), asc(workflows.name))
      .limit(1);
    next = first?.id === id ? "on_create" : "on_ready";
  }
  if (before.autoStart === next) return toWorkflow(before);
  const [after] = await executor.update(workflows).set({ autoStart: next }).where(eq(workflows.id, id)).returning();
  await recordChanges(
    { entity: "workflow", entityId: id, actorId, before, after, fields: ["autoStart"] },
    executor
  );
  return toWorkflow(after);
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
