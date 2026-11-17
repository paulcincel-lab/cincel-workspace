import { and, asc, eq } from "drizzle-orm";

import { flows, flowTramos, projects, workflows } from "../db/schema";

import type { FlowExecutor } from "./db";

/** A readiness gate as data: fase `phaseKey` of etapa `afterWorkflowId` is done. */
export type FlowGate = { afterWorkflowId: string; phaseKey: string };

/** One etapa of a flow, in order. `gate` is null when the etapa has no rule. */
export type FlowTramoRef = {
  workflowId: string;
  workflowKey: string;
  sortOrder: number;
  gate: FlowGate | null;
};

export type ProjectFlow = {
  flowId: string;
  key: string;
  name: string;
  isDefault: boolean;
  tramos: FlowTramoRef[];
};

type TramoRow = {
  workflowId: string;
  workflowKey: string;
  sortOrder: number;
  afterWorkflowId: string | null;
  gatePhaseKey: string | null;
};

/** Pure: orders tramo rows and builds their gates (a gate needs both columns). */
export function mapFlowTramos(rows: readonly TramoRow[]): FlowTramoRef[] {
  return [...rows]
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.workflowKey.localeCompare(b.workflowKey),
    )
    .map((r) => ({
      workflowId: r.workflowId,
      workflowKey: r.workflowKey,
      sortOrder: r.sortOrder,
      gate:
        r.afterWorkflowId && r.gatePhaseKey
          ? { afterWorkflowId: r.afterWorkflowId, phaseKey: r.gatePhaseKey }
          : null,
    }));
}

/**
 * The flow a project follows (its own, or the default when it has none or its
 * flow is inactive), with etapas in order and their gates. Null when there is
 * no usable flow at all.
 */
export async function getFlowForProject(
  db: FlowExecutor,
  projectId: string,
): Promise<ProjectFlow | null> {
  const [own] = await db
    .select({ id: flows.id })
    .from(projects)
    .innerJoin(
      flows,
      and(eq(flows.id, projects.flowId), eq(flows.active, true)),
    )
    .where(eq(projects.id, projectId))
    .limit(1);
  const [flow] = own
    ? await db.select().from(flows).where(eq(flows.id, own.id)).limit(1)
    : await db.select().from(flows).where(eq(flows.isDefault, true)).limit(1);
  if (!flow) return null;

  const rows = await db
    .select({
      workflowId: flowTramos.workflowId,
      workflowKey: workflows.key,
      sortOrder: flowTramos.sortOrder,
      afterWorkflowId: flowTramos.afterWorkflowId,
      gatePhaseKey: flowTramos.gatePhaseKey,
    })
    .from(flowTramos)
    .innerJoin(workflows, eq(workflows.id, flowTramos.workflowId))
    .where(eq(flowTramos.flowId, flow.id))
    .orderBy(asc(flowTramos.sortOrder));
  return {
    flowId: flow.id,
    key: flow.key,
    name: flow.name,
    isDefault: flow.isDefault,
    tramos: mapFlowTramos(rows),
  };
}

/** Every active flow with its etapas in order and their gates (readiness reads all of them in one pass). */
export async function listActiveFlows(db: FlowExecutor): Promise<ProjectFlow[]> {
  const flowRows = await db
    .select()
    .from(flows)
    .where(eq(flows.active, true))
    .orderBy(asc(flows.name));
  if (flowRows.length === 0) return [];
  const rows = await db
    .select({
      flowId: flowTramos.flowId,
      workflowId: flowTramos.workflowId,
      workflowKey: workflows.key,
      sortOrder: flowTramos.sortOrder,
      afterWorkflowId: flowTramos.afterWorkflowId,
      gatePhaseKey: flowTramos.gatePhaseKey,
    })
    .from(flowTramos)
    .innerJoin(workflows, eq(workflows.id, flowTramos.workflowId))
    .orderBy(asc(flowTramos.sortOrder));
  return flowRows.map((flow) => ({
    flowId: flow.id,
    key: flow.key,
    name: flow.name,
    isDefault: flow.isDefault,
    tramos: mapFlowTramos(rows.filter((r) => r.flowId === flow.id)),
  }));
}

/** Pure: the etapas of `flow` whose gate waits on `afterWorkflowId`, in flow order. */
export function gateFollowers(
  flow: Pick<ProjectFlow, "tramos"> | null,
  afterWorkflowId: string,
): FlowTramoRef[] {
  if (!flow) return [];
  return flow.tramos.filter((t) => t.gate?.afterWorkflowId === afterWorkflowId);
}

/** Pure: the ids of every etapa that sits in at least one of the given flows. */
export function workflowIdsInFlows(
  list: ReadonlyArray<Pick<ProjectFlow, "tramos">>,
): Set<string> {
  return new Set(list.flatMap((f) => f.tramos.map((t) => t.workflowId)));
}

/**
 * Pure: the id of the flow a project follows: its own when that flow is in
 * `active`, else the default one (null when there is none).
 */
export function effectiveFlowId(
  projectFlowId: string | null,
  active: ReadonlyArray<Pick<ProjectFlow, "flowId" | "isDefault">>,
): string | null {
  if (projectFlowId && active.some((f) => f.flowId === projectFlowId)) {
    return projectFlowId;
  }
  return active.find((f) => f.isDefault)?.flowId ?? null;
}
