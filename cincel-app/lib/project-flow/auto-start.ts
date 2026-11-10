import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import {
  projectStages,
  projects,
  taskStatuses,
  tasks,
  tramoStartBatches,
  workflowPhases,
  workflows,
} from "@/lib/db/schema";
import type { StartTramoResult } from "@/lib/types/core";

import { READINESS } from "./catalog";
import { refreshStageClosed } from "./closing";
import type { FlowDb, FlowExecutor, FlowTx } from "./db";
import { FLOW_ERROR, flowError } from "./errors";
import { startTramo } from "./start-tramo";

/** Active fase ids of a tramo, in catalog order. */
async function activePhaseIds(db: FlowExecutor, workflowId: string): Promise<string[]> {
  const rows = await db
    .select({ id: workflowPhases.id })
    .from(workflowPhases)
    .where(and(eq(workflowPhases.workflowId, workflowId), eq(workflowPhases.active, true)))
    .orderBy(asc(workflowPhases.sortOrder), asc(workflowPhases.name));
  return rows.map((r) => r.id);
}

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
  const [first] = await tx
    .select({ id: workflows.id, autoStart: workflows.autoStart })
    .from(workflows)
    .where(and(isNull(workflows.deletedAt), eq(workflows.active, true)))
    .orderBy(asc(workflows.sortOrder), asc(workflows.name))
    .limit(1);
  if (!first || first.autoStart !== "on_create") return null;
  const phaseIds = await activePhaseIds(tx, first.id);
  if (phaseIds.length === 0) return null;
  return startTramo(tx, {
    projectId,
    workflowId: first.id,
    phaseIds,
    assignment: { mode: "none" },
    actorId,
    trigger: "on_create",
  });
}

/**
 * Project create with a chosen starting tramo (#1034): starts `workflowId`
 * with `phaseIds` (every active fase when missing; a tramo without fases
 * opens its stage only), unassigned, `trigger: 'on_create'`. Errors: INVALID
 * (unknown, deleted or inactive tramo), PHASE_MISMATCH, NO_PHASES.
 */
export async function startChosenOnCreate(
  tx: FlowTx,
  projectId: string,
  actorId: string,
  workflowId: string,
  phaseIds?: string[]
): Promise<StartTramoResult> {
  const [wf] = await tx
    .select({ id: workflows.id })
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), isNull(workflows.deletedAt), eq(workflows.active, true)))
    .limit(1);
  if (!wf) throw flowError(FLOW_ERROR.INVALID, "startWorkflowId");
  const ids = phaseIds ?? (await activePhaseIds(tx, workflowId));
  return startTramo(tx, {
    projectId,
    workflowId,
    phaseIds: ids,
    assignment: { mode: "none" },
    actorId,
    trigger: "on_create",
    stageOnly: phaseIds === undefined && ids.length === 0,
  });
}

/**
 * Readiness of one project for a tramo whose rule follows `after` (BE §9.1):
 * the stage of `after` exists and the gate fase is done (every live,
 * unarchived task in it completado, at least one counting as completed), or
 * the project has no task in the gate fase (not contracted). A gate fase
 * missing from the catalog never counts as ready.
 */
export async function isProjectReadyAfter(
  db: FlowExecutor,
  projectId: string,
  afterWorkflowId: string,
  gatePhaseKey: string
): Promise<boolean> {
  const [stage] = await db
    .select({ workflowId: projectStages.workflowId })
    .from(projectStages)
    .where(and(eq(projectStages.projectId, projectId), eq(projectStages.workflowId, afterWorkflowId)))
    .limit(1);
  if (!stage) return false;

  const [gate] = await db
    .select({ id: workflowPhases.id })
    .from(workflowPhases)
    .where(and(eq(workflowPhases.workflowId, afterWorkflowId), eq(workflowPhases.key, gatePhaseKey)))
    .limit(1);
  if (!gate) return false;

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${tasks.status} <> 'completado')::int`,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'completado' and (${tasks.customStatusId} is null or ${taskStatuses.countsAsCompleted}))::int`,
    })
    .from(tasks)
    .leftJoin(taskStatuses, eq(taskStatuses.id, tasks.customStatusId))
    .where(
      and(
        eq(tasks.projectId, projectId),
        eq(tasks.phaseId, gate.id),
        isNull(tasks.deletedAt),
        eq(tasks.archived, false)
      )
    );
  const total = Number(counts?.total ?? 0);
  if (total === 0) return true;
  return Number(counts?.open ?? 0) === 0 && Number(counts?.done ?? 0) > 0;
}

/** Who a start without an actor is recorded under: whoever opened the previous stage, else its latest batch. */
async function fallbackActor(db: FlowExecutor, projectId: string, workflowId: string): Promise<string | null> {
  const [stage] = await db
    .select({ startedById: projectStages.startedById })
    .from(projectStages)
    .where(
      and(
        eq(projectStages.projectId, projectId),
        eq(projectStages.workflowId, workflowId),
        isNotNull(projectStages.startedById)
      )
    )
    .limit(1);
  if (stage?.startedById) return stage.startedById;
  const [batch] = await db
    .select({ startedById: tramoStartBatches.startedById })
    .from(tramoStartBatches)
    .where(and(eq(tramoStartBatches.projectId, projectId), isNotNull(tramoStartBatches.startedById)))
    .orderBy(desc(tramoStartBatches.createdAt))
    .limit(1);
  return batch?.startedById ?? null;
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
  const [source] = await db
    .select({ key: workflows.key })
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .limit(1);
  if (!source) return [];

  const followers = Object.entries(READINESS).filter(([, rule]) => rule.after === source.key);
  if (followers.length === 0) return [];

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt), inArray(projects.status, ["activo", "pausado"])))
    .limit(1);
  if (!project) return [];

  const candidates = await db
    .select({ id: workflows.id, key: workflows.key })
    .from(workflows)
    .where(
      and(
        inArray(
          workflows.key,
          followers.map(([key]) => key)
        ),
        isNull(workflows.deletedAt),
        eq(workflows.active, true),
        eq(workflows.autoStart, "on_ready")
      )
    )
    .orderBy(asc(workflows.sortOrder));

  const results: StartTramoResult[] = [];
  for (const next of candidates) {
    const rule = READINESS[next.key];
    const [started] = await db
      .select({ workflowId: projectStages.workflowId })
      .from(projectStages)
      .where(and(eq(projectStages.projectId, projectId), eq(projectStages.workflowId, next.id)))
      .limit(1);
    if (started) continue;
    if (!(await isProjectReadyAfter(db, projectId, workflowId, rule.phaseKey))) continue;
    const phaseIds = await activePhaseIds(db, next.id);
    if (phaseIds.length === 0) continue;

    // startTramo re-checks under the project lock: a double trigger creates nothing twice.
    // Either handle runs a transaction (a savepoint inside an open one).
    const result = await (db as FlowDb).transaction(async (tx) => {
      const [stillOpen] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .for("update");
      if (!stillOpen) return null;
      const [already] = await tx
        .select({ workflowId: projectStages.workflowId })
        .from(projectStages)
        .where(and(eq(projectStages.projectId, projectId), eq(projectStages.workflowId, next.id)))
        .limit(1);
      if (already) return null;
      return startTramo(tx, {
        projectId,
        workflowId: next.id,
        phaseIds,
        assignment: { mode: "none" },
        actorId,
        trigger: "on_ready",
      });
    });
    if (result) results.push(result);
  }
  return results;
}

/**
 * Runs in `after()` from task status changes and import/remap applies
 * (BE §9.8): `refreshStageClosed`, then `autoStartOnReady` with the actor of
 * the triggering change (null → the start is recorded under whoever opened the
 * previous stage; skipped when there is nobody). Failures are logged as one
 * JSON line with a `trace_id`; the next status change retries.
 */
export async function onTaskClosingChanged(
  db: FlowExecutor,
  projectId: string,
  workflowId: string,
  actorId: string | null = null,
  traceId: string = randomUUID()
): Promise<void> {
  try {
    await refreshStageClosed(db, projectId, workflowId);
    const actor = actorId ?? (await fallbackActor(db, projectId, workflowId));
    if (!actor) return;
    await autoStartOnReady(db, projectId, workflowId, actor);
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "project flow: closing change failed",
        trace_id: traceId,
        projectId,
        workflowId,
        err: err instanceof Error ? err.message : String(err),
      })
    );
  }
}
