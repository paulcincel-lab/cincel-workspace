import { describe, expect, it } from "vitest";

import { projectStartInput, selectedStartEtapa } from "./project-create-form";
import type { ProjectCreateStartOptions } from "@/lib/types/core";

const etapa = (id: string, name: string, sortOrder: number) => ({
  id,
  key: id,
  name,
  sortOrder,
  phases: [{ id: `${id}-f`, name: "Fase", sortOrder: 0, templateCount: 2 }],
});

const options: ProjectCreateStartOptions = {
  defaultWorkflowId: "presale",
  etapas: [etapa("presale", "Presale", 1), etapa("diseno", "Diseño", 2)],
  flows: [
    { id: "default", name: "Predeterminado", isDefault: true, defaultWorkflowId: "presale" },
    { id: "remodel", name: "Remodelación", isDefault: false, defaultWorkflowId: "diseno" },
  ],
};

describe("create form with flows", () => {
  it("sends nothing while the default flow and etapa are untouched", () => {
    expect(projectStartInput(options, { uncheckedPhaseIds: new Set() })).toEqual({});
    expect(projectStartInput(options, { flowId: "default", uncheckedPhaseIds: new Set() })).toEqual({});
  });

  it("sends only the flow for another flow, so the server starts its first etapa", () => {
    expect(projectStartInput(options, { flowId: "remodel", uncheckedPhaseIds: new Set() })).toEqual({
      flowId: "remodel",
    });
    expect(selectedStartEtapa(options, { flowId: "remodel", uncheckedPhaseIds: new Set() })?.id).toBe("diseno");
  });

  it("sends the flow together with an explicit etapa", () => {
    expect(
      projectStartInput(options, { flowId: "remodel", workflowId: "presale", uncheckedPhaseIds: new Set() }),
    ).toEqual({ flowId: "remodel", startWorkflowId: "presale", phaseIds: ["presale-f"] });
    expect(projectStartInput(options, { flowId: "remodel", workflowId: null, uncheckedPhaseIds: new Set() })).toEqual({
      flowId: "remodel",
      startWorkflowId: null,
    });
  });
});
