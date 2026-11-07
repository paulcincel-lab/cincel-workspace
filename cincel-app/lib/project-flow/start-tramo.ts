import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import {
  historyEvents,
  projectStages,
  projects,
  taskAttachments,
  taskChecklistItems,
  taskDependencies,
  taskLinks,
  taskSupport,
  tasks,
  tramoStartBatches,
  workflowPhases,
  workflows,
  workflowTaskTemplates,
} from "@/lib/db/schema";
import type {
  StaffCandidate,
  StartTramoAssignment,
  StartTramoPreview,
  StartTramoResult,
  WorkflowRef,
} from "@/lib/types/core";

import { FLOW_TIME_ZONE, TRAMO_STARTED_FIELD, TRAMO_START_UNDONE_FIELD, type TramoStartTrigger } from "./catalog";
import { refreshStageClosed } from "./closing";
import type { FlowExecutor, FlowTx } from "./db";
import { flowError } from "./errors";

/** Input of `startTramo` (BE §9.6). */
export type StartTramoParams = {
  projectId: string;
  workflowId: string;
  /** Checked fases; empty → NO_PHASES unless `stageOnly`. */
  phaseIds: string[];
  assignment: StartTramoAssignment;
  actorId: string;
  trigger: TramoStartTrigger;
  /** Admin, manual trigger only: also sets the firm-wide auto-start in the same transaction. */
  autoStart?: boolean;
  /** Internal (admin "Asignar tramo"): open the stage and set it current, no fases or tasks. */
  stageOnly?: boolean;
};

type LiveWorkflow = WorkflowRef & { autoStart: "on_create" | "on_ready" | "manual" };

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Today (YYYY-MM-DD) in the firm's time zone. */
export function flowToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FLOW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** `base` (YYYY-MM-DD) + `days`; null when the template has no offset. */
export function offsetDate(base: string, days: number | null | undefined): string | null {
  if (days === null || days === undefined) return null;
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The task manager of a fase under an assignment mode (BE §9.6 step 6). */
export function managerFor(assignment: StartTramoAssignment, phaseId: string | null, actorId: string): string | null {
  switch (assignment.mode) {
    case "self":
      return actorId;
    case "by_phase":
      return phaseId ? (assignment.managers[phaseId] ?? null) : null;
    default:
      return null;
  }
}

async function findLiveWorkflow(db: FlowExecutor, workflowId: string): Promise<LiveWorkflow | null> {
  const [wf] = await db
    .select({
      id: workflows.id,
      key: workflows.key,
      name: workflows.name,
      sortOrder: workflows.sortOrder,
      autoStart: workflows.autoStart,
    })
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), isNull(workflows.deletedAt), eq(workflows.active, true)))
    .limit(1);
  return wf ?? null;
}

/** A live task of the project already holds the template (the `tasks_project_template_uq` rule). */
// Columns are qualified by hand: in a select without joins Drizzle renders them unqualified, and
// inside this subquery an unqualified "id" would resolve to tasks.id.
const templateUsed = (projectId: string) =>
  sql<boolean>`exists (select 1 from ${tasks} t where t.project_id = ${projectId} and t.template_id = ${workflowTaskTemplates}.id and t.deleted_at is null)`;

/** Active templates of the given fases with no live task on the project, in catalog order. */
async function missingTemplates(db: FlowExecutor, projectId: string, workflowId: string, phaseIds: string[]) {
  if (phaseIds.length === 0) return [];
  return db
    .select({
      id: workflowTaskTemplates.id,
      phaseId: workflowTaskTemplates.phaseId,
      title: workflowTaskTemplates.title,
      notes: workflowTaskTemplates.notes,
      defaultPriority: workflowTaskTemplates.defaultPriority,
      commitmentOffsetDays: workflowTaskTemplates.commitmentOffsetDays,
      reviewOffsetDays: workflowTaskTemplates.reviewOffsetDays,
      deliveryOffsetDays: workflowTaskTemplates.deliveryOffsetDays,
    })
    .from(workflowTaskTemplates)
    .innerJoin(workflowPhases, eq(workflowPhases.id, workflowTaskTemplates.phaseId))
    .where(
      and(
        eq(workflowTaskTemplates.workflowId, workflowId),
        eq(workflowTaskTemplates.active, true),
        inArray(workflowTaskTemplates.phaseId, phaseIds),
        sql`not ${templateUsed(projectId)}`
      )
    )
    .orderBy(asc(workflowPhases.sortOrder), asc(workflowTaskTemplates.sortOrder), asc(workflowTaskTemplates.title));
}

/** Active templates of the checked fases (created + skipped). */
async function countTemplates(db: FlowExecutor, workflowId: string, phaseIds: string[]): Promise<number> {
  if (phaseIds.length === 0) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(workflowTaskTemplates)
    .where(
      and(
        eq(workflowTaskTemplates.workflowId, workflowId),
        eq(workflowTaskTemplates.active, true),
        inArray(workflowTaskTemplates.phaseId, phaseIds)
      )
    );
  return Number(row?.n ?? 0);
}

// ── Preview ─────────────────────────────────────────────────────────────────

/**
 * The "Iniciar tramo" sheet's data (BE §9.3): per active fase, the templates
 * still to create, the count already created, and the candidates.
 */
export async function previewStartTramo(
  db: FlowExecutor,
  projectId: string,
  workflowId: string
): Promise<StartTramoPreview> {
  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  if (!project) throw flowError("NOT_FOUND");
  const wf = await findLiveWorkflow(db, workflowId);
  if (!wf) throw flowError("NOT_FOUND");

  const phases = await db
    .select({ id: workflowPhases.id, name: workflowPhases.name, sortOrder: workflowPhases.sortOrder })
    .from(workflowPhases)
    .where(and(eq(workflowPhases.workflowId, workflowId), eq(workflowPhases.active, true)))
    .orderBy(asc(workflowPhases.sortOrder), asc(workflowPhases.name));
  const phaseIds = phases.map((p) => p.id);

  const templates =
    phaseIds.length === 0
      ? []
      : await db
          .select({
            id: workflowTaskTemplates.id,
            phaseId: workflowTaskTemplates.phaseId,
            title: workflowTaskTemplates.title,
            used: templateUsed(projectId),
          })
          .from(workflowTaskTemplates)
          .where(
            and(
              eq(workflowTaskTemplates.workflowId, workflowId),
              eq(workflowTaskTemplates.active, true),
              inArray(workflowTaskTemplates.phaseId, phaseIds)
            )
          )
          .orderBy(asc(workflowTaskTemplates.sortOrder), asc(workflowTaskTemplates.title));

  const [stage] = await db
    .select({ workflowId: projectStages.workflowId })
    .from(projectStages)
    .where(and(eq(projectStages.projectId, projectId), eq(projectStages.workflowId, workflowId)))
    .limit(1);

  // Loaded on demand so the scripts that import this module don't pull the repository in.
  let candidates = new Map<string, StaffCandidate[]>();
  if (phaseIds.length > 0) {
    const { listCandidates } = await import("@/lib/repositories/positions-repository");
    candidates = await listCandidates(db, phaseIds);
  }

  return {
    project,
    workflow: { id: wf.id, key: wf.key, name: wf.name, sortOrder: wf.sortOrder },
    alreadyStarted: Boolean(stage),
    autoStart: wf.autoStart !== "manual",
    phases: phases.map((phase) => {
      const own = templates.filter((t) => t.phaseId === phase.id);
      return {
        phase,
        templates: own.filter((t) => !t.used).map((t) => ({ id: t.id, title: t.title })),
        existing: own.filter((t) => t.used).length,
        candidates: candidates.get(phase.id) ?? [],
      };
    }),
  };
}

// ── Start ───────────────────────────────────────────────────────────────────

/**
 * The admin auto-start toggle sent with a manual start (BE §9.6 step 7, §3.2):
 * on → `on_create` for the first active tramo, `on_ready` for the others;
 * off → `manual`.
 */
async function writeAutoStart(tx: FlowTx, wf: LiveWorkflow, enabled: boolean, actorId: string): Promise<void> {
  let next: LiveWorkflow["autoStart"] = "manual";
  if (enabled) {
    const [first] = await tx
      .select({ id: workflows.id })
      .from(workflows)
      .where(and(isNull(workflows.deletedAt), eq(workflows.active, true)))
      .orderBy(asc(workflows.sortOrder), asc(workflows.name))
      .limit(1);
    next = first?.id === wf.id ? "on_create" : "on_ready";
  }
  if (next === wf.autoStart) return;
  await tx.update(workflows).set({ autoStart: next }).where(eq(workflows.id, wf.id));
  await tx.insert(historyEvents).values({
    entity: "workflow",
    entityId: wf.id,
    kind: "cambio",
    actorId,
    field: "autoStart",
    beforeValue: wf.autoStart,
    afterValue: next,
  });
}

/**
 * Starts (or extends) a tramo on a project, idempotently, inside the given
 * transaction (BE §9.6). Locks the project row first. Errors: NOT_FOUND,
 * NO_PHASES, PHASE_MISMATCH.
 */
export async function startTramo(tx: FlowTx, params: StartTramoParams): Promise<StartTramoResult> {
  const { projectId, workflowId, assignment, actorId, trigger } = params;

  // 1. The row lock serializes concurrent starts and undos on the project.
  const [project] = await tx
    .select({
      id: projects.id,
      name: projects.name,
      startDate: projects.startDate,
      currentWorkflowId: projects.currentWorkflowId,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .for("update");
  if (!project) throw flowError("NOT_FOUND");
  const wf = await findLiveWorkflow(tx, workflowId);
  if (!wf) throw flowError("NOT_FOUND");
  const workflow: WorkflowRef = { id: wf.id, key: wf.key, name: wf.name, sortOrder: wf.sortOrder };

  // 2. Fases.
  const stageOnly = params.stageOnly === true;
  const phaseIds = stageOnly ? [] : [...new Set(params.phaseIds)];
  if (!stageOnly) {
    if (phaseIds.length === 0) throw flowError("NO_PHASES");
    const valid = await tx
      .select({ id: workflowPhases.id })
      .from(workflowPhases)
      .where(
        and(
          inArray(workflowPhases.id, phaseIds),
          eq(workflowPhases.workflowId, workflowId),
          eq(workflowPhases.active, true)
        )
      );
    if (valid.length !== phaseIds.length) throw flowError("PHASE_MISMATCH");
  }

  // 3. Templates to create, re-read under the lock.
  const toCreate = stageOnly ? [] : await missingTemplates(tx, projectId, workflowId, phaseIds);

  // 4. Stage.
  const insertedStage = await tx
    .insert(projectStages)
    .values({ projectId, workflowId, startedById: actorId })
    .onConflictDoNothing()
    .returning({ workflowId: projectStages.workflowId });
  const stageCreated = insertedStage.length > 0;
  if (!stageCreated && toCreate.length > 0) {
    await tx
      .update(projectStages)
      .set({ closedAt: null })
      .where(
        and(
          eq(projectStages.projectId, projectId),
          eq(projectStages.workflowId, workflowId),
          isNotNull(projectStages.closedAt)
        )
      );
  }

  // 5. The current tramo only moves forward.
  let currentChanged = false;
  const previousCurrentWorkflowId = project.currentWorkflowId;
  if (previousCurrentWorkflowId !== workflowId) {
    let move = previousCurrentWorkflowId === null;
    if (previousCurrentWorkflowId !== null) {
      const [current] = await tx
        .select({ sortOrder: workflows.sortOrder })
        .from(workflows)
        .where(eq(workflows.id, previousCurrentWorkflowId))
        .limit(1);
      move = !current || current.sortOrder < wf.sortOrder;
    }
    if (move) {
      await tx.update(projects).set({ currentWorkflowId: workflowId }).where(eq(projects.id, projectId));
      await tx.insert(historyEvents).values({
        entity: "project",
        entityId: projectId,
        kind: "cambio",
        actorId,
        field: "currentWorkflowId",
        beforeValue: previousCurrentWorkflowId,
        afterValue: workflowId,
      });
      currentChanged = true;
    }
  }

  // 6. Batch, then the tasks (inserted directly: no per-task history).
  let batchId: string | null = null;
  let createdCount = 0;
  if (toCreate.length > 0) {
    const [batch] = await tx
      .insert(tramoStartBatches)
      .values({
        projectId,
        workflowId,
        startedById: actorId,
        trigger,
        phaseIds,
        assignmentMode: assignment.mode,
        createdCount: toCreate.length,
        stageCreated,
        previousCurrentWorkflowId: currentChanged ? previousCurrentWorkflowId : null,
        currentChanged,
        // Wall clock, not the transaction start: orders two batches of one transaction.
        createdAt: sql`clock_timestamp()`,
      })
      .returning({ id: tramoStartBatches.id });

    const base = project.startDate ?? flowToday();
    const inserted = await tx
      .insert(tasks)
      .values(
        toCreate.map((t) => ({
          projectId,
          kind: "workflow" as const,
          templateId: t.id,
          workflowId,
          phaseId: t.phaseId,
          startBatchId: batch.id,
          title: t.title,
          notes: t.notes,
          createdById: actorId,
          managerId: managerFor(assignment, t.phaseId, actorId),
          priority: t.defaultPriority,
          commitmentDate: offsetDate(base, t.commitmentOffsetDays),
          reviewDate: offsetDate(base, t.reviewOffsetDays),
          deliveryDate: offsetDate(base, t.deliveryOffsetDays),
        }))
      )
      // Second guard: tasks_project_template_uq (partial unique on live rows).
      .onConflictDoNothing()
      .returning({ id: tasks.id });
    createdCount = inserted.length;

    if (createdCount === 0) {
      await tx.delete(tramoStartBatches).where(eq(tramoStartBatches.id, batch.id));
    } else {
      batchId = batch.id;
      if (createdCount !== toCreate.length) {
        await tx.update(tramoStartBatches).set({ createdCount }).where(eq(tramoStartBatches.id, batch.id));
      }
    }
  }
  const requested = stageOnly ? 0 : await countTemplates(tx, workflowId, phaseIds);

  // 7. Firm-wide auto-start (admin only; the action checks the role).
  if (params.autoStart !== undefined && trigger === "manual") {
    await writeAutoStart(tx, wf, params.autoStart, actorId);
  }

  // 8. One project history change, when the start did something.
  if (createdCount > 0 || stageCreated) {
    await tx.insert(historyEvents).values({
      entity: "project",
      entityId: projectId,
      kind: "cambio",
      actorId,
      field: TRAMO_STARTED_FIELD,
      beforeValue: null,
      afterValue: `${wf.key}: ${createdCount}`,
    });
  }

  return {
    batchId,
    createdCount,
    skippedCount: Math.max(0, requested - createdCount),
    stageCreated,
    project: { id: project.id, name: project.name },
    workflow,
  };
}

// ── Undo ────────────────────────────────────────────────────────────────────

/** True when any task of the batch was edited, deleted, commented, or got related rows (BE §9.7). */
export async function isBatchTouched(db: FlowExecutor, batchId: string): Promise<boolean> {
  const ids = sql`(select ${tasks.id} from ${tasks} where ${tasks.startBatchId} = ${batchId})`;
  const rows = await db.execute<{ touched: boolean }>(sql`select (
    exists (select 1 from ${tasks} where ${tasks.startBatchId} = ${batchId}
      and (${tasks.updatedAt} <> ${tasks.createdAt} or ${tasks.deletedAt} is not null))
    or exists (select 1 from ${historyEvents} where ${historyEvents.entity} = 'task' and ${historyEvents.entityId} in ${ids})
    or exists (select 1 from ${taskChecklistItems} where ${taskChecklistItems.taskId} in ${ids})
    or exists (select 1 from ${taskSupport} where ${taskSupport.taskId} in ${ids})
    or exists (select 1 from ${taskAttachments} where ${taskAttachments.taskId} in ${ids})
    or exists (select 1 from ${taskLinks} where ${taskLinks.taskId} in ${ids})
    or exists (select 1 from ${tasks} where ${tasks.parentTaskId} in ${ids})
    or exists (select 1 from ${taskDependencies} where ${taskDependencies.taskId} in ${ids}
      or ${taskDependencies.dependsOnTaskId} in ${ids})
  ) as touched`);
  return Boolean(rows[0]?.touched);
}

/**
 * Undoes a start batch (BE §9.7): soft-deletes its tasks, removes the stage
 * it opened when nothing else of the tramo remains, restores the current
 * tramo. Errors: NOT_FOUND, TOUCHED.
 */
export async function undoStartTramo(tx: FlowTx, batchId: string, actorId: string): Promise<void> {
  const [peek] = await tx
    .select({ projectId: tramoStartBatches.projectId })
    .from(tramoStartBatches)
    .where(eq(tramoStartBatches.id, batchId))
    .limit(1);
  if (!peek) throw flowError("NOT_FOUND");

  // 1. The project row first (same order as startTramo, so the two can't deadlock), then the batch.
  const [project] = await tx
    .select({ id: projects.id, currentWorkflowId: projects.currentWorkflowId })
    .from(projects)
    .where(eq(projects.id, peek.projectId))
    .for("update");
  if (!project) throw flowError("NOT_FOUND");
  const [batch] = await tx
    .select()
    .from(tramoStartBatches)
    .where(eq(tramoStartBatches.id, batchId))
    .for("update");
  if (!batch || batch.undoneAt) throw flowError("NOT_FOUND");

  // A later live batch of the same tramo depends on this one.
  const [latest] = await tx
    .select({ id: tramoStartBatches.id })
    .from(tramoStartBatches)
    .where(
      and(
        eq(tramoStartBatches.projectId, batch.projectId),
        eq(tramoStartBatches.workflowId, batch.workflowId),
        isNull(tramoStartBatches.undoneAt)
      )
    )
    .orderBy(desc(tramoStartBatches.createdAt), desc(tramoStartBatches.id))
    .limit(1);
  if (latest?.id !== batch.id) throw flowError("TOUCHED");

  // 2.
  if (await isBatchTouched(tx, batchId)) throw flowError("TOUCHED");

  // 3. Soft-delete: history stays and the template slots free up.
  await tx
    .update(tasks)
    .set({ deletedAt: new Date() })
    .where(and(eq(tasks.startBatchId, batchId), isNull(tasks.deletedAt)));

  // 4. The stage it opened goes when nothing else of the tramo remains.
  let stageRemains = true;
  if (batch.stageCreated) {
    const [other] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.projectId, batch.projectId), eq(tasks.workflowId, batch.workflowId), isNull(tasks.deletedAt)))
      .limit(1);
    if (!other) {
      await tx
        .delete(projectStages)
        .where(and(eq(projectStages.projectId, batch.projectId), eq(projectStages.workflowId, batch.workflowId)));
      stageRemains = false;
    }
  }

  // 5. The current tramo goes back when nothing moved it since.
  if (batch.currentChanged && project.currentWorkflowId === batch.workflowId) {
    await tx
      .update(projects)
      .set({ currentWorkflowId: batch.previousCurrentWorkflowId })
      .where(eq(projects.id, batch.projectId));
    await tx.insert(historyEvents).values({
      entity: "project",
      entityId: batch.projectId,
      kind: "cambio",
      actorId,
      field: "currentWorkflowId",
      beforeValue: batch.workflowId,
      afterValue: batch.previousCurrentWorkflowId,
    });
  }

  // 6.
  await tx
    .update(tramoStartBatches)
    .set({ undoneAt: new Date(), undoneById: actorId })
    .where(eq(tramoStartBatches.id, batchId));
  const [wf] = await tx
    .select({ key: workflows.key })
    .from(workflows)
    .where(eq(workflows.id, batch.workflowId))
    .limit(1);
  await tx.insert(historyEvents).values({
    entity: "project",
    entityId: batch.projectId,
    kind: "cambio",
    actorId,
    field: TRAMO_START_UNDONE_FIELD,
    beforeValue: `${wf?.key ?? batch.workflowId}: ${batch.createdCount}`,
    afterValue: null,
  });

  // 7. startTramo may have cleared closed_at.
  if (stageRemains) await refreshStageClosed(tx, batch.projectId, batch.workflowId);
}
