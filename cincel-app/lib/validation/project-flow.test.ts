import { describe, expect, it } from "vitest";

import {
  OrderedIdsSchema,
  parseInput,
  ProjectCreateInputSchema,
  StartTramoInputSchema,
  WorkflowPhaseInputSchema,
} from "./project-flow";

const id = "3f1c2a4e-8b7d-4c6e-9a1f-2b3c4d5e6f70";
const other = "7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d";

describe("parseInput", () => {
  it("returns the parsed value, trimmed", () => {
    expect(parseInput(ProjectCreateInputSchema, { name: "  Casa Lomas  " })).toEqual({ name: "Casa Lomas" });
  });

  it("throws EMPTY for an empty or blank name", () => {
    expect(() => parseInput(ProjectCreateInputSchema, { name: "" })).toThrow(/^EMPTY$/);
    expect(() => parseInput(WorkflowPhaseInputSchema, { name: "   " })).toThrow(/^EMPTY$/);
  });

  it("throws INVALID with the path for other issues", () => {
    expect(() => parseInput(ProjectCreateInputSchema, { name: "x".repeat(121) })).toThrow("INVALID: name");
    expect(() => parseInput(ProjectCreateInputSchema, null)).toThrow(/^INVALID/);
    expect(() => parseInput(OrderedIdsSchema, ["not-a-uuid"])).toThrow("INVALID: 0");
  });

  it("checks the tramo start payload", () => {
    const base = { projectId: id, workflowId: other, phaseIds: [id], assignment: { mode: "self" } };
    expect(parseInput(StartTramoInputSchema, base)).toEqual(base);
    expect(
      parseInput(StartTramoInputSchema, { ...base, assignment: { mode: "by_phase", managers: { [id]: null } } })
    ).toEqual({ ...base, assignment: { mode: "by_phase", managers: { [id]: null } } });
    expect(() => parseInput(StartTramoInputSchema, { ...base, assignment: { mode: "everyone" } })).toThrow(
      /^INVALID: assignment/
    );
    expect(() => parseInput(StartTramoInputSchema, { ...base, projectId: "nope" })).toThrow("INVALID: projectId");
  });
});
