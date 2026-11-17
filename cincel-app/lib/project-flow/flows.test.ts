import { describe, expect, it } from "vitest";

import { mapFlowTramos } from "./flows";

const row = (
  key: string,
  sortOrder: number,
  after: string | null = null,
  phase: string | null = null,
) => ({
  workflowId: `id-${key}`,
  workflowKey: key,
  sortOrder,
  afterWorkflowId: after,
  gatePhaseKey: phase,
});

describe("mapFlowTramos", () => {
  it("orders by sort order and builds gates", () => {
    const out = mapFlowTramos([
      row("construccion", 3, "id-diseno", "ejecutivo"),
      row("presale", 1),
      row("diseno", 2, "id-presale", "cobro"),
    ]);
    expect(out.map((t) => t.workflowKey)).toEqual([
      "presale",
      "diseno",
      "construccion",
    ]);
    expect(out[0].gate).toBeNull();
    expect(out[1].gate).toEqual({
      afterWorkflowId: "id-presale",
      phaseKey: "cobro",
    });
  });

  it("drops a half-filled gate", () => {
    expect(
      mapFlowTramos([row("diseno", 1, "id-presale", null)])[0].gate,
    ).toBeNull();
  });
});
