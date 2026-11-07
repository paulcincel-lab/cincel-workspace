import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { foldText, formatDueDate, mergeRanked, noteTitle, searchTerms, searchWorkspace, type RankedResult } from "./search";

function r(type: RankedResult["type"], id: string, score: number, recency = 0): RankedResult {
  return { type, id, title: id, subtitle: "", url: `/${id}`, score, recency };
}

describe("mergeRanked", () => {
  it("orders by score, ties by recency", () => {
    const out = mergeRanked([[r("proyecto", "a", 2, 1), r("proyecto", "b", 3, 1)], [r("tarea", "c", 2, 5)]], 20);
    expect(out.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("keeps at most `limit` with the best result of every type that has any", () => {
    const projects = [r("proyecto", "p1", 4), r("proyecto", "p2", 3.9), r("proyecto", "p3", 3.8)];
    const tasks = [r("tarea", "t1", 1)];
    const notes = [r("nota", "n1", 1.2)];
    const out = mergeRanked([projects, tasks, notes], 3);
    expect(out).toHaveLength(3);
    expect(out.map((x) => x.id)).toEqual(["p1", "n1", "t1"]);
  });

  it("fills the rest of the limit by rank once every type is in", () => {
    const out = mergeRanked([[r("proyecto", "p1", 4), r("proyecto", "p2", 3)], [r("tarea", "t1", 1)]], 3);
    expect(out.map((x) => x.id)).toEqual(["p1", "p2", "t1"]);
  });

  it("with a limit under the number of types keeps the best type leaders", () => {
    const out = mergeRanked([[r("proyecto", "p1", 4)], [r("tarea", "t1", 1)], [r("nota", "n1", 2)]], 2);
    expect(out.map((x) => x.id)).toEqual(["p1", "n1"]);
  });
});

describe("query helpers", () => {
  it("folds case and accents", () => {
    expect(foldText("  Diseño  CASA Pérez ")).toBe("diseno casa perez");
  });

  it("escapes LIKE wildcards and builds the word-start pattern", () => {
    expect(searchTerms("50%_x")).toEqual({
      folded: "50%_x",
      prefix: "50\\%\\_x%",
      contains: "%50\\%\\_x%",
      wordStart: "% 50 x%",
    });
    expect(searchTerms("--").wordStart).toBeNull();
  });

  it("formats the due date and the note title", () => {
    expect(formatDueDate("2026-11-12")).toBe("12 nov 2026");
    expect(formatDueDate(null)).toBeNull();
    expect(noteTitle("", "# Pendientes\nresto")).toBe("Pendientes");
    expect(noteTitle("  Mi nota ", "x")).toBe("Mi nota");
    expect(noteTitle("", "")).toBe("Nota");
  });
});

describe("searchWorkspace input", () => {
  it("throws INVALID for a query under 2 trimmed chars", async () => {
    const user = { member: { id: "s" }, email: "", access: "Colaborador" } as never;
    await expect(searchWorkspace(user, { query: " a " })).rejects.toThrow(/^INVALID/);
  });
});
