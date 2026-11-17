/**
 * Pure helpers of the Ajustes › Flujos editor (#1035): the draft of one flow,
 * its order, and the gates it can offer. No imports from the server.
 */
import type { FlowAdminRow, FlowEtapaOption, FlowInput } from "@/lib/types/flows-admin";

export type FlowDraftTramo = {
  workflowId: string;
  afterWorkflowId: string | null;
  gatePhaseKey: string | null;
};

export type FlowDraft = {
  /** Null while creating. */
  id: string | null;
  name: string;
  active: boolean;
  isDefault: boolean;
  tramos: FlowDraftTramo[];
};

export const emptyFlowDraft = (): FlowDraft => ({ id: null, name: "", active: true, isDefault: false, tramos: [] });

export function draftFromFlow(flow: FlowAdminRow): FlowDraft {
  return {
    id: flow.id,
    name: flow.name,
    active: flow.active,
    isDefault: flow.isDefault,
    tramos: flow.tramos.map(({ workflowId, afterWorkflowId, gatePhaseKey }) => ({
      workflowId,
      afterWorkflowId,
      gatePhaseKey,
    })),
  };
}

/** Adds an etapa at the end, without a gate. A repeated etapa is ignored. */
export function addTramo(draft: FlowDraft, workflowId: string): FlowDraft {
  if (draft.tramos.some((t) => t.workflowId === workflowId)) return draft;
  return { ...draft, tramos: [...draft.tramos, { workflowId, afterWorkflowId: null, gatePhaseKey: null }] };
}

/** Clears every gate that no longer points at an etapa placed before its own. */
function pruneGates(tramos: FlowDraftTramo[]): FlowDraftTramo[] {
  const seen = new Set<string>();
  return tramos.map((t) => {
    const valid = t.afterWorkflowId !== null && seen.has(t.afterWorkflowId);
    seen.add(t.workflowId);
    return valid ? t : { ...t, afterWorkflowId: null, gatePhaseKey: null };
  });
}

/** Removes an etapa; gates that waited on it are cleared. */
export function removeTramo(draft: FlowDraft, workflowId: string): FlowDraft {
  return { ...draft, tramos: pruneGates(draft.tramos.filter((t) => t.workflowId !== workflowId)) };
}

/** Moves an etapa one place (-1 up, +1 down); gates that now point forward are cleared. */
export function moveTramo(draft: FlowDraft, workflowId: string, delta: -1 | 1): FlowDraft {
  const from = draft.tramos.findIndex((t) => t.workflowId === workflowId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= draft.tramos.length) return draft;
  const next = [...draft.tramos];
  [next[from], next[to]] = [next[to], next[from]];
  return { ...draft, tramos: pruneGates(next) };
}

/** Sets or clears (`gate` null) the gate of an etapa. */
export function setTramoGate(
  draft: FlowDraft,
  workflowId: string,
  gate: { afterWorkflowId: string; gatePhaseKey: string } | null,
): FlowDraft {
  return {
    ...draft,
    tramos: pruneGates(
      draft.tramos.map((t) =>
        t.workflowId === workflowId
          ? { ...t, afterWorkflowId: gate?.afterWorkflowId ?? null, gatePhaseKey: gate?.gatePhaseKey ?? null }
          : t,
      ),
    ),
  };
}

export type GateOption = { value: string; afterWorkflowId: string; gatePhaseKey: string; label: string };

/** Gates an etapa can wait on: each keyed fase of the etapas placed before it. */
export function gateOptions(draft: FlowDraft, workflowId: string, etapas: readonly FlowEtapaOption[]): GateOption[] {
  const index = draft.tramos.findIndex((t) => t.workflowId === workflowId);
  const byId = new Map(etapas.map((e) => [e.id, e]));
  return draft.tramos.slice(0, Math.max(index, 0)).flatMap((t) => {
    const etapa = byId.get(t.workflowId);
    return (etapa?.phases ?? []).map((p) => ({
      value: `${etapa!.id}|${p.key}`,
      afterWorkflowId: etapa!.id,
      gatePhaseKey: p.key,
      label: `${p.name} de ${etapa!.name}`,
    }));
  });
}

/** The value of the gate select for an etapa ("" = no gate). */
export function gateValue(tramo: FlowDraftTramo): string {
  return tramo.afterWorkflowId && tramo.gatePhaseKey ? `${tramo.afterWorkflowId}|${tramo.gatePhaseKey}` : "";
}

/** The action input of a draft, or null while it can't be saved (no name, no etapas). */
export function draftToInput(draft: FlowDraft): FlowInput | null {
  const name = draft.name.trim();
  if (!name || draft.tramos.length === 0) return null;
  return { name, active: draft.active, tramos: draft.tramos };
}
