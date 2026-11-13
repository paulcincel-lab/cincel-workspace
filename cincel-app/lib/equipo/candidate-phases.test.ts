import { describe, expect, it } from "vitest";

import type { Position } from "@/lib/types/core";
import {
  candidatePhasesFor,
  formatCandidatePhases,
  summarizeCandidatePhases,
} from "./candidate-phases";

function position(id: string, phases: Array<[string, string, string]>): Position {
  return {
    id,
    name: id,
    sortOrder: 0,
    active: true,
    staffCount: 0,
    googleManaged: false,
    phases: phases.map(([phaseId, name, workflowName], i) => ({
      id: phaseId,
      name,
      sortOrder: i,
      workflowId: workflowName,
      workflowName,
    })),
  };
}

const catalog = [
  position("arq", [["f1", "Ejecutivo", "Diseño"], ["f2", "Proyecto Estructural", "Diseño"]]),
  position("res", [["f2", "Proyecto Estructural", "Diseño"], ["f3", "Obra", "Construcción"]]),
  position("dec", [["f4", "Mobiliario", "Decoración"]]),
];

describe("candidatePhasesFor", () => {
  it("unions the selected puestos' fases without duplicates, in catalog order", () => {
    expect(candidatePhasesFor(catalog, ["res", "arq"]).map((p) => p.id)).toEqual(["f1", "f2", "f3"]);
  });

  it("is empty with no puestos selected", () => {
    expect(candidatePhasesFor(catalog, [])).toEqual([]);
  });

  it("ignores unknown ids", () => {
    expect(candidatePhasesFor(catalog, ["missing", "dec"]).map((p) => p.id)).toEqual(["f4"]);
  });
});

describe("formatting", () => {
  const phases = candidatePhasesFor(catalog, ["arq", "res"]);

  it("labels each fase as etapa · fase", () => {
    expect(formatCandidatePhases(phases)).toBe(
      "Diseño · Ejecutivo, Diseño · Proyecto Estructural, Construcción · Obra"
    );
  });

  it("truncates to two names plus a count", () => {
    expect(summarizeCandidatePhases(phases)).toEqual({ text: "Ejecutivo, Proyecto Estructural", extra: 1 });
    expect(summarizeCandidatePhases(phases.slice(0, 1))).toEqual({ text: "Ejecutivo", extra: 0 });
  });
});
