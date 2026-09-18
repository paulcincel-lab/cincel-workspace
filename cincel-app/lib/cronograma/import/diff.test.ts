import { describe, expect, it } from "vitest";
import { computeImportDiff } from "./diff";
import type { NormalizedScheduleTask } from "@/lib/types/schedule";

function task(overrides: Partial<NormalizedScheduleTask> & { stableKey: string; tarea: string }): NormalizedScheduleTask {
  return {
    legacyId: null,
    planta: "PB",
    seccion: "Preliminares",
    responsable: null,
    inicio: "2026-01-01",
    fin: "2026-01-02",
    ...overrides,
  };
}

describe("computeImportDiff", () => {
  it("counts a moved row (same stableKey, different dates) as kept, not new/removed", () => {
    const existing = [{ stableKey: "PB-abc", tarea: "Tarea A" }];
    const incoming = [task({ stableKey: "PB-abc", tarea: "Tarea A", inicio: "2026-02-01", fin: "2026-02-05" })];
    const diff = computeImportDiff(existing, incoming);
    expect(diff).toEqual({ keptCount: 1, newCount: 0, removedCount: 0, removedTasks: [] });
  });

  it("counts a changed-date row the same as a moved row (kept, dates aren't part of the key)", () => {
    const existing = [{ stableKey: "PB-abc", tarea: "Tarea A" }];
    const incoming = [task({ stableKey: "PB-abc", tarea: "Tarea A", fin: "2026-03-01" })];
    const diff = computeImportDiff(existing, incoming);
    expect(diff.keptCount).toBe(1);
    expect(diff.newCount).toBe(0);
  });

  it("counts a task not present before as new", () => {
    const existing: Array<{ stableKey: string; tarea: string }> = [];
    const incoming = [task({ stableKey: "PB-xyz", tarea: "Tarea nueva" })];
    const diff = computeImportDiff(existing, incoming);
    expect(diff).toEqual({ keptCount: 0, newCount: 1, removedCount: 0, removedTasks: [] });
  });

  it("counts a task no longer present in the import as removed, listing it", () => {
    const existing = [{ stableKey: "PB-old", tarea: "Tarea vieja" }];
    const incoming: NormalizedScheduleTask[] = [];
    const diff = computeImportDiff(existing, incoming);
    expect(diff).toEqual({
      keptCount: 0,
      newCount: 0,
      removedCount: 1,
      removedTasks: [{ stableKey: "PB-old", tarea: "Tarea vieja" }],
    });
  });

  it("handles a mixed kept + new + removed import", () => {
    const existing = [
      { stableKey: "PB-a", tarea: "A" },
      { stableKey: "PB-b", tarea: "B" },
    ];
    const incoming = [task({ stableKey: "PB-a", tarea: "A" }), task({ stableKey: "PB-c", tarea: "C" })];
    const diff = computeImportDiff(existing, incoming);
    expect(diff.keptCount).toBe(1);
    expect(diff.newCount).toBe(1);
    expect(diff.removedCount).toBe(1);
    expect(diff.removedTasks).toEqual([{ stableKey: "PB-b", tarea: "B" }]);
  });
});
