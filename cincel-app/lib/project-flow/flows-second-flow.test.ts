import { describe, expect, it } from "vitest";

import {
  effectiveFlowId,
  gateFollowers,
  mapFlowTramos,
  workflowIdsInFlows,
  type ProjectFlow,
} from "./flows";
import { flowKeyFor, validateFlowTramos } from "./flow-validation";

const row = (key: string, sortOrder: number, after: string | null = null, phase: string | null = null) => ({
  workflowId: `id-${key}`,
  workflowKey: key,
  sortOrder,
  afterWorkflowId: after,
  gatePhaseKey: phase,
});

/** The seeded default flow: Presale → Diseño → Construcción. */
const defaultFlow: ProjectFlow = {
  flowId: "flow-default",
  key: "default",
  name: "Predeterminado",
  isDefault: true,
  tramos: mapFlowTramos([
    row("presale", 1),
    row("diseno", 2, "id-presale", "cobro"),
    row("construccion", 3, "id-diseno", "ejecutivo"),
  ]),
};

/** A remodel that skips Presale: Diseño → Construcción. */
const remodel: ProjectFlow = {
  flowId: "flow-remodel",
  key: "remodelacion",
  name: "Remodelación",
  isDefault: false,
  tramos: mapFlowTramos([row("diseno", 1), row("construccion", 2, "id-diseno", "ejecutivo")]),
};

describe("a second flow (Diseño → Construcción)", () => {
  it("makes Diseño the first etapa and keeps its gate for Construcción", () => {
    expect(remodel.tramos[0]).toMatchObject({ workflowKey: "diseno", gate: null });
    expect(gateFollowers(remodel, "id-diseno").map((t) => [t.workflowKey, t.gate?.phaseKey])).toEqual([
      ["construccion", "ejecutivo"],
    ]);
  });

  it("does not make Diseño wait on Presale there, unlike the default flow", () => {
    expect(gateFollowers(defaultFlow, "id-presale").map((t) => t.workflowKey)).toEqual(["diseno"]);
    expect(gateFollowers(remodel, "id-presale")).toEqual([]);
  });

  it("leaves the default flow's followers unchanged", () => {
    expect(gateFollowers(defaultFlow, "id-diseno").map((t) => [t.workflowKey, t.gate?.phaseKey])).toEqual([
      ["construccion", "ejecutivo"],
    ]);
    expect(gateFollowers(null, "id-diseno")).toEqual([]);
  });

  it("resolves the flow assigned to a project, else the default", () => {
    const active = [defaultFlow, remodel];
    expect(effectiveFlowId("flow-remodel", active)).toBe("flow-remodel");
    expect(effectiveFlowId(null, active)).toBe("flow-default");
    // Its flow went inactive (not in the active list): the default applies.
    expect(effectiveFlowId("flow-remodel", [defaultFlow])).toBe("flow-default");
    expect(effectiveFlowId(null, [])).toBeNull();
  });

  it("knows which etapas sit in a flow", () => {
    expect([...workflowIdsInFlows([remodel])].sort()).toEqual(["id-construccion", "id-diseno"]);
    expect(workflowIdsInFlows([remodel]).has("id-presale")).toBe(false);
  });
});

describe("validateFlowTramos", () => {
  const keys = new Map([
    ["a", new Set(["cobro"])],
    ["b", new Set(["ejecutivo"])],
  ]);

  it("accepts Diseño → Construcción with a gate on an earlier etapa", () => {
    expect(() =>
      validateFlowTramos([{ workflowId: "a" }, { workflowId: "b", afterWorkflowId: "a", gatePhaseKey: "cobro" }], keys),
    ).not.toThrow();
  });

  it.each([
    ["no etapas", []],
    ["an etapa twice", [{ workflowId: "a" }, { workflowId: "a" }]],
    ["half a gate", [{ workflowId: "a" }, { workflowId: "b", afterWorkflowId: "a" }]],
    ["a gate on a later etapa", [{ workflowId: "a", afterWorkflowId: "b", gatePhaseKey: "ejecutivo" }, { workflowId: "b" }]],
    ["a gate on itself", [{ workflowId: "a", afterWorkflowId: "a", gatePhaseKey: "cobro" }]],
    ["a fase that does not exist", [{ workflowId: "a" }, { workflowId: "b", afterWorkflowId: "a", gatePhaseKey: "nope" }]],
  ])("rejects %s", (_name, tramos) => {
    expect(() => validateFlowTramos(tramos, keys)).toThrow(/^INVALID: tramos$/);
  });
});

describe("flowKeyFor", () => {
  it("slugs the name and avoids taken keys", () => {
    expect(flowKeyFor("Remodelación rápida", new Set())).toBe("remodelacion_rapida");
    expect(flowKeyFor("Remodelación rápida", new Set(["remodelacion_rapida"]))).toBe("remodelacion_rapida_2");
    expect(flowKeyFor("¡¡", new Set())).toBe("flujo");
  });
});
