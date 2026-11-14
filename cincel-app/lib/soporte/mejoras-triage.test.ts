import { describe, expect, it } from "vitest";

import {
  BOARD_STATUSES,
  changesRow,
  formatFirstResponse,
  groupByStatus,
  inProgressCount,
  inverseChange,
  mejorasFilterParams,
  parseMejorasFilters,
  patchCounts,
  patchPages,
  rowPatchOf,
} from "@/lib/soporte/mejoras-triage";
import type { MejorasCounts, TicketListRow } from "@/lib/types/soporte";

const PERSON = { id: "p1", name: "Ana Pérez", photoUrl: null };

function row(over: Partial<TicketListRow> = {}): TicketListRow {
  return {
    id: "t1",
    code: "SOL-0001",
    kind: "error",
    title: "Falla",
    area: "tareas",
    status: "nuevo",
    priority: null,
    author: PERSON,
    assignee: null,
    githubIssueNumber: null,
    githubIssueUrl: null,
    attachmentCount: 0,
    createdAt: "2026-11-01T10:00:00Z",
    updatedAt: "2026-11-01T10:00:00Z",
    closedAt: null,
    ...over,
  };
}

const COUNTS: MejorasCounts = {
  byStatus: { nuevo: 4, en_revision: 2, planeado: 1, en_progreso: 3, resuelto: 5, descartado: 1 },
  nuevo: 4,
  total: 16,
};

describe("triage patches", () => {
  it("has the five board columns in flow order", () => {
    expect(BOARD_STATUSES).toEqual(["nuevo", "en_revision", "planeado", "en_progreso", "resuelto"]);
  });

  it("patches the row with the new status, priority and assignee", () => {
    expect(rowPatchOf({ id: "t1", patch: { status: "planeado", priority: "alta", assigneeId: "p1" }, assignee: PERSON })).toEqual({
      status: "planeado",
      priority: "alta",
      assignee: PERSON,
    });
    expect(rowPatchOf({ id: "t1", patch: { assigneeId: null } })).toEqual({ assignee: null });
  });

  it("builds the inverse from the row before the change", () => {
    const before = row({ status: "en_revision", priority: "baja", assignee: PERSON });
    expect(inverseChange(before, { id: "t1", patch: { status: "resuelto", assigneeId: null } })).toEqual({
      id: "t1",
      patch: { status: "en_revision", assigneeId: "p1" },
      assignee: PERSON,
    });
  });

  it("knows when a patch changes nothing", () => {
    const r = row({ status: "nuevo", assignee: PERSON });
    expect(changesRow(r, { status: "nuevo" })).toBe(false);
    expect(changesRow(r, { assigneeId: "p1" })).toBe(false);
    expect(changesRow(r, { status: "planeado" })).toBe(true);
    expect(changesRow(r, { priority: "alta" })).toBe(true);
  });

  it("patches only the changed rows of every page", () => {
    const data = { pages: [{ rows: [row(), row({ id: "t2" })], nextCursor: null }], pageParams: [null] };
    const next = patchPages(data, [{ id: "t2", patch: { status: "resuelto" } }]);
    expect(next.pages[0]!.rows.map((r) => r.status)).toEqual(["nuevo", "resuelto"]);
    expect(data.pages[0]!.rows[1]!.status).toBe("nuevo");
  });

  it("moves the counts and the nuevo badge", () => {
    const next = patchCounts(COUNTS, [
      { from: "nuevo", to: "en_revision" },
      { from: "nuevo", to: "nuevo" },
    ]);
    expect(next.byStatus.nuevo).toBe(3);
    expect(next.byStatus.en_revision).toBe(3);
    expect(next.nuevo).toBe(3);
    expect(next.total).toBe(16);
  });

  it("never goes below zero", () => {
    const zero = { ...COUNTS, byStatus: { ...COUNTS.byStatus, nuevo: 0 }, nuevo: 0 };
    expect(patchCounts(zero, [{ from: "nuevo", to: "resuelto" }]).nuevo).toBe(0);
  });

  it("groups rows by status", () => {
    const groups = groupByStatus([row(), row({ id: "t2", status: "resuelto" })]);
    expect(groups.nuevo).toHaveLength(1);
    expect(groups.resuelto).toHaveLength(1);
    expect(groups.descartado).toHaveLength(0);
  });
});

describe("header stats", () => {
  it("counts the solicitudes in progress", () => {
    expect(inProgressCount(COUNTS)).toBe(6);
  });

  it("formats the first response time", () => {
    expect(formatFirstResponse(undefined)).toBe("—");
    expect(formatFirstResponse(null)).toBe("—");
    expect(formatFirstResponse(0.5)).toBe("30 min");
    expect(formatFirstResponse(6.2)).toBe("6 h");
    expect(formatFirstResponse(72)).toBe("3 d");
  });
});

describe("filters in the URL", () => {
  it("round-trips every filter", () => {
    const filters = { status: "planeado", kind: "mejora", area: "inicio", priority: "alta", assigneeId: "p1", authorId: "p2", q: "tabla" } as const;
    expect(parseMejorasFilters(mejorasFilterParams(filters))).toEqual(filters);
  });

  it("reads Sin asignar", () => {
    expect(parseMejorasFilters(new URLSearchParams("asignado=sin"))).toEqual({ unassigned: true });
    expect(mejorasFilterParams({ unassigned: true }).get("asignado")).toBe("sin");
  });

  it("ignores unknown values", () => {
    expect(parseMejorasFilters(new URLSearchParams("estado=hecho&tipo=x&area=y&prioridad=z"))).toEqual({});
  });
});
