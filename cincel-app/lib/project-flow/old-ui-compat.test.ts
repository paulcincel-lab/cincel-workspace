import { describe, expect, it } from "vitest";

import {
  isUniqueViolationOn,
  matchPhaseByName,
  PROJECT_NAME_UNIQUE_INDEX,
  resolveTemplatePhaseId,
  rethrowProjectNameTaken,
} from "./old-ui-compat";

const phases = [
  { id: "f-ejecutivo", name: "Ejecutivo", sortOrder: 2, active: true },
  { id: "f-anteproyecto", name: "Anteproyecto", sortOrder: 1, active: true },
  { id: "f-levantamiento", name: "Levantamiento", sortOrder: 0, active: false },
];

describe("resolveTemplatePhaseId", () => {
  it("uses phaseId when given, ignoring the old text", () => {
    expect(resolveTemplatePhaseId({ phaseId: "f-ejecutivo", phase: "Anteproyecto" }, phases)).toBe("f-ejecutivo");
  });

  it("falls back to the old phase text by nameKey (case, accents, spaces)", () => {
    expect(resolveTemplatePhaseId({ phase: "  ejécutivo " }, phases)).toBe("f-ejecutivo");
    expect(resolveTemplatePhaseId({ phaseId: "", phase: "ANTEPROYECTO" }, phases)).toBe("f-anteproyecto");
  });

  it("matches an inactive fase by name when it is the only one with that name", () => {
    expect(resolveTemplatePhaseId({ phase: "levantamiento" }, phases)).toBe("f-levantamiento");
  });

  it("falls back to the tramo's first active fase in catalog order", () => {
    expect(resolveTemplatePhaseId({ phase: "Otra cosa" }, phases)).toBe("f-anteproyecto");
    expect(resolveTemplatePhaseId({ phase: null }, phases)).toBe("f-anteproyecto");
    expect(resolveTemplatePhaseId({}, phases)).toBe("f-anteproyecto");
  });

  it("uses the first fase when none is active, and null when there are none", () => {
    const inactive = phases.map((p) => ({ ...p, active: false }));
    expect(resolveTemplatePhaseId({}, inactive)).toBe("f-levantamiento");
    expect(resolveTemplatePhaseId({ phase: "Ejecutivo" }, [])).toBeNull();
  });
});

describe("matchPhaseByName", () => {
  it("prefers the active fase when two share a nameKey", () => {
    const dup = [
      { id: "old", name: "Diseño", sortOrder: 0, active: false },
      { id: "new", name: "Diseno", sortOrder: 1, active: true },
    ];
    expect(matchPhaseByName("diseño", dup)).toBe("new");
  });

  it("returns null for empty text or no match", () => {
    expect(matchPhaseByName("  ", phases)).toBeNull();
    expect(matchPhaseByName(undefined, phases)).toBeNull();
    expect(matchPhaseByName("Obra", phases)).toBeNull();
  });
});

describe("project NAME_TAKEN", () => {
  const pgError = (constraint: string) => Object.assign(new Error("duplicate key"), { code: "23505", constraint_name: constraint });

  it("detects the violation on the error or a wrapped cause", () => {
    expect(isUniqueViolationOn(pgError(PROJECT_NAME_UNIQUE_INDEX), PROJECT_NAME_UNIQUE_INDEX)).toBe(true);
    const wrapped = new Error("Failed query", { cause: pgError(PROJECT_NAME_UNIQUE_INDEX) });
    expect(isUniqueViolationOn(wrapped, PROJECT_NAME_UNIQUE_INDEX)).toBe(true);
    const nodePg = Object.assign(new Error("dup"), { code: "23505", constraint: PROJECT_NAME_UNIQUE_INDEX });
    expect(isUniqueViolationOn(nodePg, PROJECT_NAME_UNIQUE_INDEX)).toBe(true);
  });

  it("ignores other constraints and other errors", () => {
    expect(isUniqueViolationOn(pgError("projects_code_key"), PROJECT_NAME_UNIQUE_INDEX)).toBe(false);
    expect(isUniqueViolationOn(new Error("boom"), PROJECT_NAME_UNIQUE_INDEX)).toBe(false);
    expect(isUniqueViolationOn(null, PROJECT_NAME_UNIQUE_INDEX)).toBe(false);
  });

  it("rethrows the name violation as NAME_TAKEN and anything else unchanged", () => {
    expect(() => rethrowProjectNameTaken(pgError(PROJECT_NAME_UNIQUE_INDEX))).toThrow(/^NAME_TAKEN$/);
    const other = new Error("boom");
    expect(() => rethrowProjectNameTaken(other)).toThrow(other);
  });
});
