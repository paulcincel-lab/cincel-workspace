// @vitest-environment node
import { describe, expect, it } from "vitest";

import { tramoPhaseLabel } from "./labels";

const diseno = { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 };
const ejecutivo = { id: "p1", name: "Ejecutivo", sortOrder: 3 };

describe("tramoPhaseLabel", () => {
  it("joins tramo and fase", () => {
    expect(tramoPhaseLabel({ kind: "workflow", workflow: diseno, phaseRef: ejecutivo })).toBe("Diseño · Ejecutivo");
  });

  it("accepts the fase as `phase` once it is a ref", () => {
    expect(tramoPhaseLabel({ kind: "usuario", workflow: diseno, phase: ejecutivo })).toBe("Diseño · Ejecutivo");
  });

  it("shows the tramo alone without a fase", () => {
    expect(tramoPhaseLabel({ kind: "workflow", workflow: diseno, phaseRef: null })).toBe("Diseño");
    expect(tramoPhaseLabel({ kind: "usuario", workflow: diseno })).toBe("Diseño");
  });

  it("ignores the deprecated free-text fase", () => {
    expect(tramoPhaseLabel({ kind: "workflow", workflow: diseno, phaseRef: null, phase: "Anteproyecto" })).toBe("Diseño");
  });

  it("labels admin tasks Administración", () => {
    expect(tramoPhaseLabel({ kind: "admin", workflow: null, phaseRef: null })).toBe("Administración");
  });

  it("is a dash without a tramo", () => {
    expect(tramoPhaseLabel({ kind: "usuario", workflow: null, phaseRef: null })).toBe("—");
    expect(tramoPhaseLabel({ kind: "usuario", workflow: null, phaseRef: ejecutivo })).toBe("—");
  });
});
