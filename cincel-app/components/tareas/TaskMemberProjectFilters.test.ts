import { describe, expect, it } from "vitest";

import { matchesMemberFilter, matchesProjectFilter } from "./TaskMemberProjectFilters";

const ana = { id: "a", name: "Ana" };
const beto = { id: "b", name: "Beto" };
const task = { manager: ana, support: [beto], project: { id: "p1", name: "P1", clientName: "C" } };

describe("matchesMemberFilter", () => {
  it("matches everything when nothing is selected", () => {
    expect(matchesMemberFilter(task, [])).toBe(true);
  });

  it("matches the manager and support members", () => {
    expect(matchesMemberFilter(task, ["a"])).toBe(true);
    expect(matchesMemberFilter(task, ["b"])).toBe(true);
  });

  it("excludes tasks assigned to nobody selected", () => {
    expect(matchesMemberFilter(task, ["z"])).toBe(false);
    expect(matchesMemberFilter({ ...task, manager: null, support: [] }, ["a"])).toBe(false);
  });
});

describe("matchesProjectFilter", () => {
  it("filters by project id, empty means all", () => {
    expect(matchesProjectFilter(task, "")).toBe(true);
    expect(matchesProjectFilter(task, "p1")).toBe(true);
    expect(matchesProjectFilter(task, "p2")).toBe(false);
  });
});
