import { describe, expect, it } from "vitest";

import { toPortalTramosDTO, type PortalTramoRow } from "@/lib/portal/dto";
import {
  buildPortalDocumentos,
  buildPortalEntregas,
  buildPortalOverview,
  buildPortalProgress,
  buildPortalStepper,
  formatPortalFileSize,
  portalFileType,
} from "@/lib/portal/overview";
import type { PortalFileDTO, PortalProjectDTO, PortalScheduleDTO } from "@/lib/types/portal";

const project: PortalProjectDTO = {
  id: "p1",
  name: "Casa Lomas",
  code: "CL-01",
  address: null,
  status: "activo",
  progressPct: 41.6,
  startDate: "2026-01-15",
  endDate: "2026-12-20",
  manager: null,
};

const schedule: PortalScheduleDTO = {
  sections: [
    { key: "PB::Cimentación", planta: "PB", seccion: "Cimentación", start: "2026-02-01", end: "2026-02-28", progressPct: 100 },
    { key: "PB::Muros", planta: "PB", seccion: "Muros", start: "2026-03-01", end: "2026-12-15", progressPct: 50 },
    { key: "PA::Losa", planta: "PA", seccion: "Losa", start: "2026-11-01", end: "2026-11-30", progressPct: 0 },
  ],
};

const file = (over: Partial<PortalFileDTO>): PortalFileDTO => ({
  id: "f",
  name: "x.pdf",
  mimeType: "application/pdf",
  sizeBytes: 2048,
  modifiedAt: "2026-10-01T10:00:00.000Z",
  kind: "file",
  deliveredAs: "original",
  ...over,
});

describe("toPortalTramosDTO", () => {
  const rows: PortalTramoRow[] = [
    { id: "w3", key: "construccion", name: "Construcción", active: true, sortOrder: 3, startedAt: null, closedAt: null },
    { id: "w1", key: "presale", name: "Presale", active: true, sortOrder: 1, startedAt: new Date(), closedAt: new Date() },
    { id: "w2", key: "diseno", name: "Diseño", active: true, sortOrder: 2, startedAt: new Date(), closedAt: null },
    { id: "w4", key: "decoracion", name: "Decoración", active: false, sortOrder: 4, startedAt: null, closedAt: null },
  ];

  it("orders the catalog and maps the project's state, dropping inactive tramos never started", () => {
    expect(toPortalTramosDTO(rows, "w2")).toEqual([
      { key: "presale", name: "Presale", state: "completado" },
      { key: "diseno", name: "Diseño", state: "en_curso" },
      { key: "construccion", name: "Construcción", state: "por_iniciar" },
    ]);
  });

  it("copies only key, name and state", () => {
    for (const t of toPortalTramosDTO(rows, null)) expect(Object.keys(t).sort()).toEqual(["key", "name", "state"]);
  });
});

describe("buildPortalStepper", () => {
  it("points at the tramo in progress", () => {
    expect(
      buildPortalStepper([
        { key: "a", name: "Presale", state: "completado" },
        { key: "b", name: "Diseño", state: "en_curso" },
        { key: "c", name: "Construcción", state: "por_iniciar" },
      ]),
    ).toEqual({ steps: 3, current: 2, label: "Fase actual: Diseño · 2 de 3" });
  });

  it("handles none started, all done and no tramos", () => {
    expect(buildPortalStepper([{ key: "a", name: "Presale", state: "por_iniciar" }])?.label).toBe("Por iniciar");
    expect(buildPortalStepper([{ key: "a", name: "Presale", state: "completado" }])?.label).toBe("Todas las fases completadas");
    expect(buildPortalStepper([])).toBeNull();
  });
});

describe("buildPortalProgress / buildPortalEntregas", () => {
  it("lists overall progress first, then one row per partida", () => {
    const items = buildPortalProgress(project, schedule);
    expect(items.map((i) => [i.label, i.real])).toEqual([
      ["Avance general", 42],
      ["Cimentación", 100],
      ["Muros", 50],
      ["Losa", 0],
    ]);
    expect(items[2].sublabel).toBe("PB · 01-03-2026 – 15-12-2026");
    expect(buildPortalProgress(project, null)).toHaveLength(1);
  });

  it("deliveries are open sections ending today or later, soonest first", () => {
    expect(buildPortalEntregas(schedule, "2026-11-07").map((e) => [e.title, e.start])).toEqual([
      ["Losa", "2026-11-30"],
      ["Muros", "2026-12-15"],
    ]);
    expect(buildPortalEntregas(null, "2026-11-07")).toEqual([]);
  });
});

describe("buildPortalDocumentos", () => {
  it("is null without a listing, so the page shows no documents section", () => {
    expect(buildPortalDocumentos(null)).toBeNull();
  });

  it("keeps files only, newest first, with type, date and a size column for Analítico", () => {
    const data = buildPortalDocumentos([
      file({ id: "old", name: "Contrato.pdf", modifiedAt: "2026-09-15T00:00:00Z" }),
      file({ id: "dir", name: "Renders", kind: "folder", mimeType: "application/vnd.google-apps.folder" }),
      file({ id: "new", name: "Planta.dwg", mimeType: "application/acad", modifiedAt: "2026-10-28T00:00:00Z", sizeBytes: 3 * 1024 * 1024 }),
    ])!;
    expect(data.rows.map((r) => r.id)).toEqual(["new", "old"]);
    expect(data.rows[0]).toMatchObject({ tipo: "DWG", modifiedAt: "2026-10-28", size: "3.0 MB" });
    expect(data.columns.find((c) => c.key === "size")?.hideOn).toEqual(["visual", "esencial"]);
  });

  it("labels types and sizes", () => {
    expect(portalFileType({ name: "Doc", mimeType: "application/vnd.google-apps.document", deliveredAs: "pdf" })).toBe("PDF");
    expect(portalFileType({ name: "foto", mimeType: "image/png", deliveredAs: "original" })).toBe("Imagen");
    expect(portalFileType({ name: "nota", mimeType: "text/plain", deliveredAs: "original" })).toBe("Archivo");
    expect(formatPortalFileSize(null)).toBe("—");
    expect(formatPortalFileSize(512)).toBe("512 B");
    expect(formatPortalFileSize(4096)).toBe("4 KB");
  });
});

describe("buildPortalOverview", () => {
  it("has no field for approvals, messages or payments (no portal data today)", () => {
    const data = buildPortalOverview({ project, schedule, tramos: [], files: null, today: "2026-11-07" });
    expect(Object.keys(data).sort()).toEqual(["documentos", "entregas", "progress", "stepper", "tramos"]);
  });
});
