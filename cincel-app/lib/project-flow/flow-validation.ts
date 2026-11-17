import { FLOW_ERROR, flowError } from "./errors";

/** The shape `validateFlowTramos` checks (no database). */
export type FlowTramoDraft = {
  workflowId: string;
  afterWorkflowId?: string | null;
  gatePhaseKey?: string | null;
};

/**
 * Pure: throws `INVALID: tramos` unless the etapas of a flow make sense:
 * at least one, none twice, a gate has both its etapa and its fase or
 * neither, the gate's etapa sits earlier in the same flow, and the gate fase
 * is one of that etapa's keyed fases (`phaseKeysByWorkflow`).
 */
export function validateFlowTramos(
  tramos: readonly FlowTramoDraft[],
  phaseKeysByWorkflow: ReadonlyMap<string, ReadonlySet<string>>,
): void {
  if (tramos.length === 0) throw flowError(FLOW_ERROR.INVALID, "tramos");
  const seen = new Set<string>();
  for (const t of tramos) {
    const after = t.afterWorkflowId ?? null;
    const phaseKey = t.gatePhaseKey ?? null;
    if ((after === null) !== (phaseKey === null)) throw flowError(FLOW_ERROR.INVALID, "tramos");
    if (after !== null && phaseKey !== null) {
      if (after === t.workflowId || !seen.has(after)) throw flowError(FLOW_ERROR.INVALID, "tramos");
      if (!phaseKeysByWorkflow.get(after)?.has(phaseKey)) throw flowError(FLOW_ERROR.INVALID, "tramos");
    }
    if (seen.has(t.workflowId)) throw flowError(FLOW_ERROR.INVALID, "tramos");
    seen.add(t.workflowId);
  }
}

/** Pure: `key` of a new flow from its name (lowercase ascii, `_`), unique among `taken`. */
export function flowKeyFor(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "flujo";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
