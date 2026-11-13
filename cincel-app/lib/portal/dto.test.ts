// @vitest-environment node
/**
 * Portal DTO mappers (BE §B.4.3, §0.3, §10). The portal sees the schedule per
 * `seccion` only, and no `tarea`, `responsable` or staff other than the
 * manager ever reaches a portal response (§B.8 #10).
 */
import { describe, expect, it } from "vitest";

import { toPortalProjectDTO, toPortalScheduleDTO, type PortalProjectRow, type PortalScheduleTaskRow } from "./dto";

/** Keys and values that must never appear in any portal JSON. */
const FORBIDDEN_KEYS = ["tarea", "responsable", "responsableContactId", "coordinator", "coordinatorId",
  "flagged", "contractAmountMxn", "driveFolderId", "driveInternalFolderId", "statusUpdatedBy"];

function keysDeep(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      keysDeep(v, out);
    }
  }
  return out;
}

const projectRow = {
  id: "p1",
  name: "Casa Madrid 22",
  code: "MAD-22",
  addressStreet: "Madrid 22",
  addressCity: " ",
  addressState: "CDMX",
  status: "activo",
  progress: 40,
  startDate: "2026-01-05",
  endDate: "2026-09-30",
  managerName: "Laura",
  managerLastName: "Pérez",
  managerEmail: "laura@cincel.example",
  // Extra columns a careless query might select; the mapper must drop them.
  coordinatorId: "s2",
  coordinatorName: "Coordinador Secreto",
  contractAmountMxn: "1500000.00",
  driveInternalFolderId: "drive-internal",
} as PortalProjectRow;

function task(over: Partial<PortalScheduleTaskRow> & Record<string, unknown>): PortalScheduleTaskRow {
  return {
    planta: "Planta baja",
    seccion: "Preliminares",
    seccionOrder: 1,
    sortOrder: 1,
    inicio: "2026-02-02",
    fin: "2026-02-06",
    status: "pending",
    ...over,
  } as PortalScheduleTaskRow;
}

describe("toPortalProjectDTO", () => {
  it("joins the address without blanks and names the manager", () => {
    expect(toPortalProjectDTO(projectRow)).toEqual({
      id: "p1",
      name: "Casa Madrid 22",
      code: "MAD-22",
      address: "Madrid 22, CDMX",
      status: "activo",
      progressPct: 40,
      startDate: "2026-01-05",
      endDate: "2026-09-30",
      manager: { name: "Laura Pérez", email: "laura@cincel.example" },
      progressDeltaMonth: null,
    });
  });

  it("progressDeltaMonth is today's progress minus the month's first snapshot", () => {
    expect(toPortalProjectDTO({ ...projectRow, progressMonthStart: 32 }).progressDeltaMonth).toBe(8);
    expect(toPortalProjectDTO({ ...projectRow, progressMonthStart: null }).progressDeltaMonth).toBeNull();
  });

  it("returns null address and manager when they are missing", () => {
    const dto = toPortalProjectDTO({ ...projectRow, addressStreet: null, addressCity: null, addressState: "",
      managerName: null, managerLastName: null, managerEmail: null });
    expect(dto.address).toBeNull();
    expect(dto.manager).toBeNull();
  });

  it("carries no forbidden field and no staff name other than the manager", () => {
    const dto = toPortalProjectDTO(projectRow);
    const keys = keysDeep(dto);
    for (const k of FORBIDDEN_KEYS) expect(keys).not.toContain(k);
    const json = JSON.stringify(dto);
    expect(json).not.toContain("Coordinador Secreto");
    expect(json).not.toContain("1500000");
    expect(json).not.toContain("drive-internal");
  });
});

describe("toPortalScheduleDTO", () => {
  it("is null when the project has no schedule", () => {
    expect(toPortalScheduleDTO(null)).toBeNull();
  });

  it("groups by planta and seccion with first inicio, last fin and % done", () => {
    const dto = toPortalScheduleDTO([
      task({ sortOrder: 1, inicio: "2026-02-03", fin: "2026-02-05", status: "done" }),
      task({ sortOrder: 2, inicio: "2026-02-02", fin: "2026-02-10", status: "progress" }),
      task({ sortOrder: 3, inicio: "2026-02-04", fin: "2026-02-08", status: "pending" }),
      task({ sortOrder: 4, seccion: "Albañilerías", seccionOrder: 2, inicio: "2026-02-11", fin: "2026-02-20",
        status: "done" }),
      task({ sortOrder: 5, planta: "Planta alta", seccion: "Preliminares", inicio: "2026-03-01",
        fin: "2026-03-05" }),
    ]);
    expect(dto).toEqual({
      sections: [
        { key: "Planta baja::Preliminares", planta: "Planta baja", seccion: "Preliminares", start: "2026-02-02",
          end: "2026-02-10", progressPct: 33, actualStart: null, actualEnd: null, etapaKey: null },
        { key: "Planta baja::Albañilerías", planta: "Planta baja", seccion: "Albañilerías", start: "2026-02-11",
          end: "2026-02-20", progressPct: 100, actualStart: null, actualEnd: null, etapaKey: null },
        { key: "Planta alta::Preliminares", planta: "Planta alta", seccion: "Preliminares", start: "2026-03-01",
          end: "2026-03-05", progressPct: 0, actualStart: null, actualEnd: null, etapaKey: null },
      ],
    });
  });

  it("orders plantas by first appearance and sections by seccionOrder", () => {
    const dto = toPortalScheduleDTO([
      task({ sortOrder: 3, planta: "Azotea", seccion: "Acabados", seccionOrder: 7 }),
      task({ sortOrder: 1, planta: "Sótano", seccion: "Acabados", seccionOrder: 7 }),
      task({ sortOrder: 2, planta: "Sótano", seccion: "Preliminares", seccionOrder: 1 }),
    ]);
    expect(dto?.sections.map((s) => s.key)).toEqual(["Sótano::Preliminares", "Sótano::Acabados", "Azotea::Acabados"]);
  });

  it("drops tarea, responsable and flags even when the rows carry them", () => {
    const dto = toPortalScheduleDTO([
      task({ tarea: "Demolición de muro secreto", responsable: "Juan Contratista", responsableContactId: "c9",
        flagged: true, statusUpdatedBy: "s3" }),
    ]);
    const keys = keysDeep(dto);
    for (const k of FORBIDDEN_KEYS) expect(keys).not.toContain(k);
    expect(Object.keys(dto!.sections[0]).sort()).toEqual(
      ["actualEnd", "actualStart", "end", "etapaKey", "key", "planta", "progressPct", "seccion", "start"]);
    const json = JSON.stringify(dto);
    expect(json).not.toContain("Demolición de muro secreto");
    expect(json).not.toContain("Juan Contratista");
  });

  it("real dates: first start, and the last end only once every task finished", () => {
    const open = toPortalScheduleDTO([
      task({ sortOrder: 1, status: "done", startedOn: "2026-02-04", finishedOn: "2026-02-09" }),
      task({ sortOrder: 2, status: "progress", startedOn: "2026-02-03", finishedOn: null }),
    ]);
    expect(open!.sections[0]).toMatchObject({ actualStart: "2026-02-03", actualEnd: null });
    const closed = toPortalScheduleDTO([
      task({ sortOrder: 1, status: "done", startedOn: "2026-02-04", finishedOn: "2026-02-09" }),
      task({ sortOrder: 2, status: "done", startedOn: "2026-02-03", finishedOn: "2026-02-12" }),
    ]);
    expect(closed!.sections[0]).toMatchObject({ actualStart: "2026-02-03", actualEnd: "2026-02-12" });
  });

  it("etapaKey is the first linked task's etapa", () => {
    const dto = toPortalScheduleDTO([
      task({ sortOrder: 1, etapaKey: null }),
      task({ sortOrder: 2, etapaKey: "construccion" }),
      task({ sortOrder: 3, etapaKey: "diseno" }),
    ]);
    expect(dto!.sections[0].etapaKey).toBe("construccion");
  });
});
