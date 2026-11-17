/**
 * Page data and inputs of Ajustes › Flujos (#1035): the flows catalog, with
 * each flow's etapas in order and the gate that says when an etapa is ready.
 * Client-safe: no imports.
 */

/** One etapa of a flow. The gate needs both `afterWorkflowId` and `gatePhaseKey`, or neither. */
export type FlowTramoInput = {
  workflowId: string;
  afterWorkflowId?: string | null;
  gatePhaseKey?: string | null;
};

/** `createFlowAction` / `updateFlowAction`: the etapas are in flow order. */
export type FlowInput = {
  name: string;
  active?: boolean;
  tramos: FlowTramoInput[];
};

export type FlowAdminTramo = {
  workflowId: string;
  workflowName: string;
  afterWorkflowId: string | null;
  gatePhaseKey: string | null;
};

export type FlowAdminRow = {
  id: string;
  key: string;
  name: string;
  active: boolean;
  isDefault: boolean;
  /** Live projects that follow this flow (their own, or the default when they have none). */
  projectCount: number;
  tramos: FlowAdminTramo[];
};

/** An etapa the editor can add to a flow, with the fases that can be a gate. */
export type FlowEtapaOption = {
  id: string;
  name: string;
  phases: Array<{ key: string; name: string }>;
};

export type AjustesFlujosPageData = {
  flows: FlowAdminRow[];
  etapas: FlowEtapaOption[];
};
