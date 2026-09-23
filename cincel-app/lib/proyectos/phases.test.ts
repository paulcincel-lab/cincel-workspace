import { describe, expect, it } from "vitest";

import { normalizePhases, projectPhaseOptions } from "./phases";

describe("normalizePhases", () => {
  it("trims, drops blanks and case-insensitive duplicates, keeping order", () => {
    expect(normalizePhases([" Anteproyecto ", "", null, "Ejecutivo", "anteproyecto", undefined, "  "])).toEqual([
      "Anteproyecto",
      "Ejecutivo",
    ]);
  });
});

describe("projectPhaseOptions", () => {
  it("offers the department phases, deduplicated", () => {
    const options = projectPhaseOptions();
    expect(options.length).toBeGreaterThan(0);
    expect(new Set(options.map((o) => o.toLowerCase())).size).toBe(options.length);
  });

  it("keeps a project's custom phases so they can be unticked", () => {
    expect(projectPhaseOptions(["Fase especial"])).toContain("Fase especial");
  });
});
