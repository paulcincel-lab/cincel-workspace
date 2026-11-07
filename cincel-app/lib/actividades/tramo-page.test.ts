import { describe, expect, it } from "vitest";

import type { TaskStatus } from "@/lib/types/core";
import {
  defaultQuickAddPhaseId,
  isWithinPhaseReorder,
  openTasksByPhase,
  sortTramoTasks,
  spaceFilterOptions,
  spacesByProjectOf,
} from "./tramo-page";

const phases = [
  { id: "f1", name: "Anteproyecto", sortOrder: 0 },
  { id: "f2", name: "Proyecto Arquitectónico", sortOrder: 1 },
  { id: "f3", name: "Ejecutivo", sortOrder: 2 },
];

type Row = {
  id: string;
  phaseId: string | null;
  sortOrder: number | null;
  createdAt: string;
  status: TaskStatus;
  customStatus: { id: string; name: string; closes: boolean; countsAsCompleted: boolean } | null;
  archived: boolean;
};

function task(id: string, phaseId: string | null, extra: Partial<Row> = {}): Row {
  return {
    id,
    phaseId,
    sortOrder: null,
    createdAt: "2026-01-01T00:00:00Z",
    status: "pendiente",
    customStatus: null,
    archived: false,
    ...extra,
  };
}

describe("sortTramoTasks", () => {
  it("orders by fase, then manual order, then creation; no fase goes last", () => {
    const rows = [
      task("sin", null),
      task("e", "f3"),
      task("a2", "f1", { sortOrder: 2 }),
      task("a1", "f1", { sortOrder: 1 }),
      task("a-new", "f1", { createdAt: "2026-02-01T00:00:00Z" }),
      task("a-old", "f1"),
      task("p", "f2"),
    ];
    expect(sortTramoTasks(rows, phases).map((t) => t.id)).toEqual(["a1", "a2", "a-old", "a-new", "p", "e", "sin"]);
  });
});

describe("isWithinPhaseReorder", () => {
  const current = [task("a", "f1"), task("b", "f1"), task("c", "f2"), task("d", null)];

  it("allows a move inside the same fase", () => {
    expect(isWithinPhaseReorder(current, ["b", "a", "c", "d"])).toBe(true);
  });

  it("refuses a drop into another fase", () => {
    expect(isWithinPhaseReorder(current, ["a", "c", "b", "d"])).toBe(false);
    expect(isWithinPhaseReorder(current, ["a", "b", "d", "c"])).toBe(false);
  });

  it("refuses an order that doesn't match the block", () => {
    expect(isWithinPhaseReorder(current, ["a", "b", "c"])).toBe(false);
    expect(isWithinPhaseReorder(current, ["a", "b", "c", "x"])).toBe(false);
  });
});

describe("openTasksByPhase", () => {
  it("counts open, unarchived tasks per fase", () => {
    const rows = [
      task("a", "f1"),
      task("b", "f1", { status: "completado" }),
      task("c", "f1", { customStatus: { id: "x", name: "Cancelado", closes: true, countsAsCompleted: false } }),
      task("d", "f2", { archived: true }),
      task("e", "f3"),
      task("f", null),
    ];
    expect(openTasksByPhase(rows)).toEqual({ f1: 1, f3: 1 });
  });
});

describe("defaultQuickAddPhaseId", () => {
  it("uses the fase of the block's last open task", () => {
    expect(defaultQuickAddPhaseId([task("a", "f1"), task("b", "f2"), task("c", "f3", { status: "completado" })], phases)).toBe(
      "f2"
    );
  });

  it("falls back to the first fase", () => {
    expect(defaultQuickAddPhaseId([], phases)).toBe("f1");
    expect(defaultQuickAddPhaseId([task("a", null)], phases)).toBe("f1");
    expect(defaultQuickAddPhaseId([], [])).toBeNull();
  });
});

describe("espacios", () => {
  const rows = [
    { project: { id: "p2", name: "Torre Norte" }, space: { id: "s3", name: "Depto 201" } },
    { project: { id: "p1", name: "Casa Lomas" }, space: { id: "s2", name: "Planta baja" } },
    { project: { id: "p1", name: "Casa Lomas" }, space: { id: "s1", name: "Azotea" } },
    { project: { id: "p1", name: "Casa Lomas" }, space: { id: "s1", name: "Azotea" } },
    { project: { id: "p1", name: "Casa Lomas" }, space: null },
  ];

  it("labels filter options as proyecto · espacio", () => {
    expect(spaceFilterOptions(rows)).toEqual([
      { id: "s1", label: "Casa Lomas · Azotea" },
      { id: "s2", label: "Casa Lomas · Planta baja" },
      { id: "s3", label: "Torre Norte · Depto 201" },
    ]);
  });

  it("groups espacios by project", () => {
    expect(spacesByProjectOf(rows)).toEqual({
      p1: [
        { id: "s1", name: "Azotea" },
        { id: "s2", name: "Planta baja" },
      ],
      p2: [{ id: "s3", name: "Depto 201" }],
    });
  });
});
