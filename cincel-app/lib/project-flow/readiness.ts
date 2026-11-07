import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { TramoBoard, TramoCandidateProject, ViewerScope, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";

import { projects, projectStages, taskStatuses, tasks, tramoStartBatches, workflowPhases, workflows } from "../db/schema";

import { READINESS } from "./catalog";
import type { FlowExecutor } from "./db";
import { flowError } from "./errors";
import { isBatchTouched } from "./start-tramo";

/** Live tasks of the gate fase on one project, counted (BE §9.1). */
export type GateCounts = {
  /** Live, unarchived tasks in the gate fase. */
  total: number;
  /** Of those, `status = 'completado'` (any closing status, Cancelado included). */
  closed: number;
  /** Of those, completed work (`isTaskCompleted`: no custom status, or one that counts as completed). */
  completed: number;
  /** Latest `closed_at` among the closed ones. */
  maxClosedAt: Date | null;
};

/** What `readinessBucket` knows about one project not started in tramo T. */
export type ReadinessFacts = {
  /** False for the first tramo (no rule). */
  hasRule: boolean;
  /** The rule's `after` tramo is the first active tramo. */
  afterIsFirst: boolean;
  /** `project_stages(P).started_at`; null when the project has no stage for P. */
  afterStageStartedAt: Date | null;
  gate: GateCounts;
  projectCreatedAt: Date;
};

export type ReadinessVerdict =
  | { bucket: "ready"; readySince: Date }
  | { bucket: "upcoming"; open: number; total: number }
  | { bucket: "hidden" };

/**
 * The readiness table of BE §9.1 for one project without a stage row for T.
 * Pure, so the table is unit-tested row by row.
 */
export function readinessBucket(facts: ReadinessFacts): ReadinessVerdict {
  if (!facts.hasRule) return { bucket: "ready", readySince: facts.projectCreatedAt };

  if (!facts.afterStageStartedAt) {
    // Upcoming projects are only listed when stage P exists or P is the first tramo.
    return facts.afterIsFirst ? { bucket: "upcoming", open: 0, total: 0 } : { bucket: "hidden" };
  }

  const { total, closed, completed, maxClosedAt } = facts.gate;
  // The fase wasn't contracted (RD-2).
  if (total === 0) return { bucket: "ready", readySince: facts.afterStageStartedAt };
  if (closed === total && completed >= 1) {
    return { bucket: "ready", readySince: maxClosedAt ?? facts.afterStageStartedAt };
  }
  return { bucket: "upcoming", open: total - closed, total };
}

function byName(a: TramoCandidateProject, b: TramoCandidateProject): number {
  return a.project.name.localeCompare(b.project.name, "es");
}

/**
 * The "Listos para iniciar" / "Próximos" / started lists of one tramo
 * (BE §9.1, §9.2). One query per bucket with grouped counts; no N+1.
 * Throws `NOT_FOUND` when the workflow is missing or inactive.
 */
export async function tramoBoard(db: FlowExecutor, workflowId: string, viewer: ViewerScope): Promise<TramoBoard> {
  // Admin data (client, origin, admin tasks) never reaches the board, so every viewer gets the same lists.
  void viewer;

  const tramos = await db
    .select({
      id: workflows.id,
      key: workflows.key,
      name: workflows.name,
      sortOrder: workflows.sortOrder,
      active: workflows.active,
    })
    .from(workflows)
    .where(isNull(workflows.deletedAt))
    .orderBy(asc(workflows.sortOrder), asc(workflows.name));

  const toRef = (w: (typeof tramos)[number]): WorkflowRef => ({
    id: w.id,
    key: w.key,
    name: w.name,
    sortOrder: w.sortOrder,
  });
  const tramoById = new Map(tramos.map((w) => [w.id, toRef(w)]));

  const target = tramos.find((w) => w.id === workflowId && w.active);
  if (!target) throw flowError("NOT_FOUND");
  const workflow = toRef(target);
  const firstActive = tramos.find((w) => w.active) ?? null;

  // Resolve the rule by keys, so renames don't break it. A rule whose tramo
  // or fase is gone behaves like the first tramo.
  const rule = READINESS[target.key] ?? null;
  const afterTramo = rule ? (tramos.find((w) => w.key === rule.after) ?? null) : null;
  let gatePhase: WorkflowPhaseRef | null = null;
  if (rule && afterTramo) {
    const [phase] = await db
      .select({ id: workflowPhases.id, name: workflowPhases.name, sortOrder: workflowPhases.sortOrder })
      .from(workflowPhases)
      .where(and(eq(workflowPhases.workflowId, afterTramo.id), eq(workflowPhases.key, rule.phaseKey)))
      .limit(1);
    gatePhase = phase ?? null;
  }
  const hasRule = afterTramo != null && gatePhase != null;
  const afterIsFirst = afterTramo != null && afterTramo.id === firstActive?.id;

  // ── Candidates: live active/paused projects with no stage row for T ──────
  const stageT = alias(projectStages, "stage_t");
  const stageP = alias(projectStages, "stage_p");
  const gateId = hasRule && gatePhase ? gatePhase.id : null;
  const afterId = hasRule && afterTramo ? afterTramo.id : null;

  const isClosed = sql`${tasks.status} = 'completado'`;
  const candidates = await db
    .select({
      id: projects.id,
      name: projects.name,
      createdAt: projects.createdAt,
      currentWorkflowId: projects.currentWorkflowId,
      afterStartedAt: stageP.startedAt,
      total: sql<number>`count(${tasks.id})`.mapWith(Number),
      closed: sql<number>`count(${tasks.id}) filter (where ${isClosed})`.mapWith(Number),
      completed: sql<number>`count(${tasks.id}) filter (where ${isClosed} and (${tasks.customStatusId} is null or coalesce(${taskStatuses.countsAsCompleted}, false)))`.mapWith(
        Number
      ),
      maxClosedAt: sql<Date | null>`max(${tasks.closedAt}) filter (where ${isClosed})`.mapWith(tasks.closedAt),
    })
    .from(projects)
    .leftJoin(stageT, and(eq(stageT.projectId, projects.id), eq(stageT.workflowId, workflowId)))
    .leftJoin(stageP, and(eq(stageP.projectId, projects.id), afterId ? eq(stageP.workflowId, afterId) : sql`false`))
    .leftJoin(
      tasks,
      and(
        eq(tasks.projectId, projects.id),
        gateId ? eq(tasks.phaseId, gateId) : sql`false`,
        isNull(tasks.deletedAt),
        eq(tasks.archived, false)
      )
    )
    .leftJoin(taskStatuses, eq(taskStatuses.id, tasks.customStatusId))
    .where(and(isNull(projects.deletedAt), inArray(projects.status, ["activo", "pausado"]), isNull(stageT.projectId)))
    .groupBy(projects.id, stageP.startedAt);

  const ready: TramoCandidateProject[] = [];
  const upcoming: TramoCandidateProject[] = [];
  for (const row of candidates) {
    const verdict = readinessBucket({
      hasRule,
      afterIsFirst,
      afterStageStartedAt: row.afterStartedAt,
      gate: { total: row.total, closed: row.closed, completed: row.completed, maxClosedAt: row.maxClosedAt },
      projectCreatedAt: row.createdAt,
    });
    const base = {
      project: { id: row.id, name: row.name },
      currentTramo: row.currentWorkflowId ? (tramoById.get(row.currentWorkflowId) ?? null) : null,
    };
    if (verdict.bucket === "ready") {
      ready.push({ ...base, readySince: verdict.readySince.toISOString(), pending: null });
    } else if (verdict.bucket === "upcoming" && afterTramo && gatePhase) {
      upcoming.push({
        ...base,
        readySince: null,
        pending: { tramo: toRef(afterTramo), phase: gatePhase, open: verdict.open, total: verdict.total },
      });
    }
  }
  ready.sort(byName);
  upcoming.sort(byName);

  // ── Started: projects with a stage row for T, with their latest live batch ─
  const startedRows = await db
    .select({ projectId: projects.id })
    .from(projectStages)
    .innerJoin(projects, eq(projects.id, projectStages.projectId))
    .where(and(eq(projectStages.workflowId, workflowId), isNull(projects.deletedAt)))
    .orderBy(asc(projects.name));

  const batches = startedRows.length
    ? await db
        .selectDistinctOn([tramoStartBatches.projectId], {
          id: tramoStartBatches.id,
          projectId: tramoStartBatches.projectId,
          createdCount: tramoStartBatches.createdCount,
        })
        .from(tramoStartBatches)
        .where(
          and(
            eq(tramoStartBatches.workflowId, workflowId),
            isNull(tramoStartBatches.undoneAt),
            inArray(
              tramoStartBatches.projectId,
              startedRows.map((r) => r.projectId)
            )
          )
        )
        .orderBy(tramoStartBatches.projectId, desc(tramoStartBatches.createdAt), desc(tramoStartBatches.id))
    : [];
  const batchByProject = new Map(batches.map((b) => [b.projectId, b]));
  const touched = new Map(await Promise.all(batches.map(async (b) => [b.id, await isBatchTouched(db, b.id)] as const)));

  const started: TramoBoard["started"] = startedRows.map((r) => {
    const batch = batchByProject.get(r.projectId) ?? null;
    return {
      projectId: r.projectId,
      batchId: batch?.id ?? null,
      createdCount: batch?.createdCount ?? 0,
      canUndo: batch != null && touched.get(batch.id) === false,
    };
  });

  return { workflow, ready, upcoming, started };
}
