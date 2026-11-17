import { describe, expect, it } from "vitest";

import {
  addTramo,
  draftFromFlow,
  draftToInput,
  emptyFlowDraft,
  gateOptions,
  gateValue,
  moveTramo,
  removeTramo,
  setTramoGate,
} from "./flow-draft";
import type { FlowEtapaOption } from "@/lib/types/flows-admin";

const etapas: FlowEtapaOption[] = [
  { id: "diseno", name: "Diseño", phases: [{ key: "ejecutivo", name: "Ejecutivo" }] },
  { id: "construccion", name: "Construcción", phases: [] },
];

const built = () => {
  let d = { ...emptyFlowDraft(), name: "Remodelación" };
  d = addTramo(d, "diseno");
  d = addTramo(d, "construccion");
  return setTramoGate(d, "construccion", { afterWorkflowId: "diseno", gatePhaseKey: "ejecutivo" });
};

describe("flow draft", () => {
  it("adds etapas once and builds the input in order", () => {
    const d = addTramo(built(), "diseno");
    expect(d.tramos.map((t) => t.workflowId)).toEqual(["diseno", "construccion"]);
    expect(draftToInput(d)).toEqual({
      name: "Remodelación",
      active: true,
      tramos: [
        { workflowId: "diseno", afterWorkflowId: null, gatePhaseKey: null },
        { workflowId: "construccion", afterWorkflowId: "diseno", gatePhaseKey: "ejecutivo" },
      ],
    });
  });

  it("needs a name and an etapa to save", () => {
    expect(draftToInput(emptyFlowDraft())).toBeNull();
    expect(draftToInput({ ...built(), name: "  " })).toBeNull();
  });

  it("offers only the fases of earlier etapas as gates", () => {
    const d = built();
    expect(gateOptions(d, "diseno", etapas)).toEqual([]);
    expect(gateOptions(d, "construccion", etapas).map((o) => o.label)).toEqual(["Ejecutivo de Diseño"]);
    expect(gateValue(d.tramos[1])).toBe("diseno|ejecutivo");
    expect(gateValue(d.tramos[0])).toBe("");
  });

  it("clears a gate that stops pointing backwards", () => {
    const moved = moveTramo(built(), "construccion", -1);
    expect(moved.tramos.map((t) => t.workflowId)).toEqual(["construccion", "diseno"]);
    expect(moved.tramos.every((t) => t.afterWorkflowId === null)).toBe(true);
    expect(removeTramo(built(), "diseno").tramos[0]).toMatchObject({ workflowId: "construccion", gatePhaseKey: null });
  });

  it("ignores moves past the ends and round-trips a flow", () => {
    const d = built();
    expect(moveTramo(d, "diseno", -1)).toBe(d);
    const again = draftFromFlow({
      id: "f",
      key: "remodelacion",
      name: "Remodelación",
      active: true,
      isDefault: false,
      projectCount: 0,
      tramos: [
        { workflowId: "diseno", workflowName: "Diseño", afterWorkflowId: null, gatePhaseKey: null },
      ],
    });
    expect(again).toMatchObject({ id: "f", isDefault: false, tramos: [{ workflowId: "diseno" }] });
  });
});
