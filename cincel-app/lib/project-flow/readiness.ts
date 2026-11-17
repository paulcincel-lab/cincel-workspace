import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { EtapaBoard, EtapaCandidateProject, ViewerScope, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";

import { flows, projects, projectStages, taskStatuses, tasks, etapaStartBatches, workflowPhases, workflows } from "../db/schema";

import { READINESS } from "./catalog";
import type { FlowExecutor } from "./db";
import { flowError } from "./errors";
import { effectiveFlowId, listActiveFlows, workflowIdsInFlows } from "./flows";
import { batchTouchedSql } from "./start-etapa";

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

/** What `readinessBucket` knows about one project not started in etapa T. */
export type ReadinessFacts = {
  /** False for the first etapa (no rule). */
  hasRule: boolean;
  /** The rule's `after` etapa is the first active etapa. */
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
    // Upcoming projects are only listed when stage P exists or P is the first etapa.
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

function byName(a: EtapaCandidateProject, b: EtapaCandidateProject): number {
  return a.project.name.localeCompare(b.project.name, "es");
}

/**
 * The "Listos para iniciar" / "Próximos" / started lists of one etapa
 * (BE §9.1, §9.2). One query per bucket with grouped counts; no N+1.
 * Throws `NOT_FOUND` when the workflow is missing or inactive.
 */
export async function etapaBoard(db: FlowExecutor, workflowId: string, viewer: ViewerScope): Promise<EtapaBoard> {
  // Admin data (client, origin, admin tasks) never reaches the board, so every viewer gets the same lists.
  void viewer;

  const etapas = await db
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

  const toRef = (w: (typeof etapas)[number]): WorkflowRef => ({
    id: w.id,
    key: w.key,
    name: w.name,
    sortOrder: w.sortOrder,
  });
  const etapaById = new Map(etapas.map((w) => [w.id, toRef(w)]));

  const target = etapas.find((w) => w.id === workflowId && w.active);
  if (!target) throw flowError("NOT_FOUND");
  const workflow = toRef(target);
  // ── Rules as data: one group per distinct gate among the flows that hold T ──
  // A project follows its own flow, else the default one; it is a candidate of
  // T only when that flow has T. An etapa that sits in no flow keeps the legacy
  // rule (READINESS, the seed source) for every project.
  const activeFlows = await listActiveFlows(db);
  const defaultFlowId = effectiveFlowId(null, activeFlows);
  const inFlows = workflowIdsInFlows(activeFlows);
  const activeIds = new Set(etapas.filter((w) => w.active).map((w) => w.id));

  type RuleGroup = {
    /** Flows of this group; null = the legacy group (every project). */
    flowIds: string[] | null;
    afterEtapa: (typeof etapas)[number] | null;
    gatePhase: WorkflowPhaseRef | null;
    afterIsFirst: boolean;
  };
  const phaseCache = new Map<string, WorkflowPhaseRef | null>();
  async function gatePhaseOf(afterId: string, phaseKey: string): Promise<WorkflowPhaseRef | null> {
    const cacheKey = `${afterId}|${phaseKey}`;
    const hit = phaseCache.get(cacheKey);
    if (hit !== undefined) return hit;
    const [phase] = await db
      .select({ id: workflowPhases.id, name: workflowPhases.name, sortOrder: workflowPhases.sortOrder })
      .from(workflowPhases)
      .where(and(eq(workflowPhases.workflowId, afterId), eq(workflowPhases.key, phaseKey)))
      .limit(1);
    phaseCache.set(cacheKey, phase ?? null);
    return phase ?? null;
  }

  const groups = new Map<string, RuleGroup>();
  if (inFlows.has(workflowId)) {
    for (const flow of activeFlows) {
      const tramo = flow.tramos.find((t) => t.workflowId === workflowId);
      if (!tramo) continue;
      const afterEtapa = tramo.gate ? (etapas.find((w) => w.id === tramo.gate!.afterWorkflowId) ?? null) : null;
      const gatePhase = afterEtapa && tramo.gate ? await gatePhaseOf(afterEtapa.id, tramo.gate.phaseKey) : null;
      const firstOfFlow = flow.tramos.find((t) => activeIds.has(t.workflowId))?.workflowId ?? null;
      const afterIsFirst = afterEtapa != null && afterEtapa.id === firstOfFlow;
      const groupKey = `${afterEtapa?.id ?? ""}|${gatePhase?.id ?? ""}|${afterIsFirst}`;
      const group = groups.get(groupKey);
      if (group?.flowIds) group.flowIds.push(flow.flowId);
      else groups.set(groupKey, { flowIds: [flow.flowId], afterEtapa, gatePhase, afterIsFirst });
    }
  } else {
    // Resolve the legacy rule by keys, so renames don't break it. A rule whose
    // etapa or fase is gone behaves like the first etapa.
    const rule = READINESS[target.key] ?? null;
    const afterEtapa = rule ? (etapas.find((w) => w.key === rule.after) ?? null) : null;
    const gatePhase = rule && afterEtapa ? await gatePhaseOf(afterEtapa.id, rule.phaseKey) : null;
    const firstActive = etapas.find((w) => w.active) ?? null;
    groups.set("legacy", {
      flowIds: null,
      afterEtapa,
      gatePhase,
      afterIsFirst: afterEtapa != null && afterEtapa.id === firstActive?.id,
    });
  }

  const ready: EtapaCandidateProject[] = [];
  const upcoming: EtapaCandidateProject[] = [];
  /** The flow a project follows: its own when active, else the default. */
  const effectiveFlow = sql`coalesce((select ${flows.id} from ${flows} where ${flows.id} = ${projects.flowId} and ${flows.active}), ${
    defaultFlowId ? sql`${defaultFlowId}::uuid` : sql`null::uuid`
  })`;

  for (const group of groups.values()) {
    const { afterEtapa, gatePhase, afterIsFirst } = group;
    const hasRule = afterEtapa != null && gatePhase != null;

    // ── Candidates: live active/paused projects with no stage row for T ──────
    const stageT = alias(projectStages, "stage_t");
    const stageP = alias(projectStages, "stage_p");
    const gateId = hasRule && gatePhase ? gatePhase.id : null;
    const afterId = hasRule && afterEtapa ? afterEtapa.id : null;

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
      .where(
        and(
          isNull(projects.deletedAt),
          inArray(projects.status, ["activo", "pausado"]),
          isNull(stageT.projectId),
          group.flowIds ? inArray(effectiveFlow, group.flowIds) : undefined
        )
      )
      .groupBy(projects.id, stageP.startedAt);

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
        currentEtapa: row.currentWorkflowId ? (etapaById.get(row.currentWorkflowId) ?? null) : null,
      };
      if (verdict.bucket === "ready") {
        ready.push({ ...base, readySince: verdict.readySince.toISOString(), pending: null });
      } else if (verdict.bucket === "upcoming" && afterEtapa && gatePhase) {
        upcoming.push({
          ...base,
          readySince: null,
          pending: { etapa: toRef(afterEtapa), phase: gatePhase, open: verdict.open, total: verdict.total },
        });
      }
    }
  }
  ready.sort(byName);
  upcoming.sort(byName);

  // ── Started: projects with a stage row for T, with their latest live batch ─
  // One query: the batch comes from a lateral join and "touched" is the same
  // check `isBatchTouched` runs, so the board costs no query per batch.
  const latestBatch = sql`(
    select ${etapaStartBatches.id} as id, ${etapaStartBatches.createdCount} as created_count
    from ${etapaStartBatches}
    where ${etapaStartBatches.projectId} = ${projects.id}
      and ${etapaStartBatches.workflowId} = ${workflowId}
      and ${etapaStartBatches.undoneAt} is null
    order by ${etapaStartBatches.createdAt} desc, ${etapaStartBatches.id} desc
    limit 1
  )`;
  const startedRows = await db.execute<{
    project_id: string;
    batch_id: string | null;
    created_count: number | null;
    touched: boolean | null;
  }>(sql`
    select ${projects.id} as project_id, b.id as batch_id, b.created_count as created_count,
      case when b.id is null then false else ${batchTouchedSql(sql`b.id`)} end as touched
    from ${projectStages}
    inner join ${projects} on ${projects.id} = ${projectStages.projectId}
    left join lateral ${latestBatch} b on true
    where ${projectStages.workflowId} = ${workflowId} and ${projects.deletedAt} is null
    order by ${projects.name} asc
  `);

  const started: EtapaBoard["started"] = [...startedRows].map((r) => ({
    projectId: r.project_id,
    batchId: r.batch_id ?? null,
    createdCount: r.batch_id ? Number(r.created_count ?? 0) : 0,
    canUndo: r.batch_id != null && r.touched === false,
  }));

  return { workflow, ready, upcoming, started };
}
