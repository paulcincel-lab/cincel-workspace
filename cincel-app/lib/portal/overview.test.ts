import { describe, expect, it } from "vitest";

import { toPortalEtapasDTO, type PortalEtapaRow } from "@/lib/portal/dto";
import {
  buildPortalDocumentos,
  buildPortalEntregas,
  buildPortalOverview,
  buildPortalProgress,
  buildPortalStepper,
  buildPortalStatusSentence,
  buildPortalEntregables,
  buildPortalFilesByFolder,
  buildPortalKpis,
  buildPortalPhaseTable,
  portalDateRange,
  portalPhaseTotals,
  formatPortalFileSize,
  portalFileType,
  portalScheduleHasRealDates,
} from "@/lib/portal/overview";
import type { PortalFileDTO, PortalProjectDTO, PortalScheduleDTO, PortalEtapaDTO } from "@/lib/types/portal";
import type { AgendaItem } from "@/lib/types/widgets";

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

describe("toPortalEtapasDTO", () => {
  const rows: PortalEtapaRow[] = [
    { id: "w3", key: "construccion", name: "Construcción", active: true, sortOrder: 3, startedAt: null, closedAt: null },
    { id: "w1", key: "presale", name: "Presale", active: true, sortOrder: 1, startedAt: new Date(), closedAt: new Date() },
    { id: "w2", key: "diseno", name: "Diseño", active: true, sortOrder: 2, startedAt: new Date(), closedAt: null },
    { id: "w4", key: "decoracion", name: "Decoración", active: false, sortOrder: 4, startedAt: null, closedAt: null },
  ];

  it("orders the catalog and maps the project's state, dropping inactive etapas never started", () => {
    expect(toPortalEtapasDTO(rows, "w2").map(({ key, name, state }) => ({ key, name, state }))).toEqual([
      { key: "presale", name: "Presale", state: "completado" },
      { key: "diseno", name: "Diseño", state: "en_curso" },
      { key: "construccion", name: "Construcción", state: "por_iniciar" },
    ]);
  });

  it("copies only key, name, state, progressPct and startMonth", () => {
    for (const t of toPortalEtapasDTO(rows, null)) {
      expect(Object.keys(t).sort()).toEqual(["key", "name", "progressPct", "startMonth", "state"]);
    }
  });

  it("progress: 100 when completado, 0 por iniciar, closed over live tasks en curso; month the etapa started", () => {
    const started = [
      { id: "w1", key: "presale", name: "Presale", active: true, sortOrder: 1, startedAt: "2026-01-12T10:00:00Z", closedAt: "2026-03-01T00:00:00Z" },
      { id: "w2", key: "diseno", name: "Diseño", active: true, sortOrder: 2, startedAt: new Date("2026-06-03T12:00:00Z"), closedAt: null },
      { id: "w3", key: "construccion", name: "Construcción", active: true, sortOrder: 3, startedAt: null, closedAt: null },
    ];
    const progress = [
      { workflowId: "w1", total: 4, done: 1 },
      { workflowId: "w2", total: "8", done: "5" },
      { workflowId: "w3", total: 3, done: 3 },
      { workflowId: null, total: 9, done: 9 },
    ];
    expect(toPortalEtapasDTO(started, "w2", progress).map((t) => [t.key, t.progressPct, t.startMonth])).toEqual([
      ["presale", 100, "2026-01"],
      ["diseno", 63, "2026-06"],
      ["construccion", 0, null],
    ]);
    expect(toPortalEtapasDTO(started, "w2", []).find((t) => t.key === "diseno")?.progressPct).toBe(0);
  });
});

describe("buildPortalStepper", () => {
  it("points at the etapa in progress", () => {
    expect(
      buildPortalStepper([
        { key: "a", name: "Presale", state: "completado", progressPct: 0, startMonth: null },
        { key: "b", name: "Diseño", state: "en_curso", progressPct: 0, startMonth: null },
        { key: "c", name: "Construcción", state: "por_iniciar", progressPct: 0, startMonth: null },
      ]),
    ).toEqual({ steps: 3, current: 2, label: "Fase actual: Diseño · 2 de 3" });
  });

  it("handles none started, all done and no etapas", () => {
    expect(buildPortalStepper([{ key: "a", name: "Presale", state: "por_iniciar", progressPct: 0, startMonth: null }])?.label).toBe("Por iniciar");
    expect(buildPortalStepper([{ key: "a", name: "Presale", state: "completado", progressPct: 0, startMonth: null }])?.label).toBe("Todas las fases completadas");
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
    const data = buildPortalOverview({ project, schedule, etapas: [], files: null, today: "2026-11-07" });
    for (const key of Object.keys(data)) expect(key).not.toMatch(/aprob|approval|mensaje|message|pago|payment/i);
    expect(data).toMatchObject({ heroEtapa: null, etapasActive: 0, recentFiles: [], team: [] });
  });

  const t = (key: string, name: string, state: PortalEtapaDTO["state"]): PortalEtapaDTO => ({
    key,
    name,
    state,
    progressPct: state === "completado" ? 100 : 0,
    startMonth: null,
  });
  const visualEtapas = [t("presale", "Presale", "completado"), t("diseno", "Diseño", "en_curso"), t("construccion", "Construcción", "por_iniciar")];

  it("heroEtapa is the en_curso etapa", () => {
    const data = buildPortalOverview({ project, schedule, etapas: visualEtapas, files: null, today: "2026-11-07" });
    expect(data.heroEtapa?.key).toBe("diseno");
    expect(buildPortalOverview({ project, schedule, etapas: [t("a", "A", "completado")], files: null, today: "2026-11-07" }).heroEtapa).toBeNull();
  });

  it("etapasActive counts completado and en_curso", () => {
    expect(buildPortalOverview({ project, schedule, etapas: visualEtapas, files: null, today: "2026-11-07" }).etapasActive).toBe(2);
  });

  it("nextEntrega is the first open section", () => {
    const data = buildPortalOverview({ project, schedule, etapas: [], files: null, today: "2026-11-07" });
    expect(data.nextEntrega).toEqual(data.entregas[0]);
    expect(data.nextEntrega?.title).toBe("Losa");
    expect(buildPortalOverview({ project, schedule: null, etapas: [], files: null, today: "2026-11-07" }).nextEntrega).toBeNull();
  });

  it("recentFiles are the 4 newest across folders with folder name", () => {
    const folders = [
      { folderId: "root", name: "General", files: [file({ id: "g1", modifiedAt: "2026-10-01T00:00:00Z" })] },
      {
        folderId: "d1",
        name: "Planos",
        files: [
          file({ id: "p1", modifiedAt: "2026-11-05T00:00:00Z" }),
          file({ id: "p2", modifiedAt: "2026-09-01T00:00:00Z" }),
        ],
      },
      {
        folderId: "d2",
        name: "Renders",
        files: [file({ id: "r1", modifiedAt: "2026-11-03T00:00:00Z" }), file({ id: "r2", modifiedAt: "2026-10-20T00:00:00Z" })],
      },
    ];
    const data = buildPortalOverview({ project, schedule, etapas: [], files: [], folders, today: "2026-11-07" });
    expect(data.recentFiles.map((f) => [f.id, f.folder])).toEqual([
      ["p1", "Planos"],
      ["r1", "Renders"],
      ["r2", "Renders"],
      ["g1", "General"],
    ]);
  });

  it("recentFiles fall back to the top of the client folder as General, files only", () => {
    const files = [file({ id: "a", modifiedAt: "2026-10-02T00:00:00Z" }), file({ id: "dir", kind: "folder" })];
    const data = buildPortalOverview({ project, schedule, etapas: [], files, today: "2026-11-07" });
    expect(data.recentFiles.map((f) => [f.id, f.folder])).toEqual([["a", "General"]]);
  });

  it("passes the team through, manager first", () => {
    const team = [{ name: "Laura Pérez", role: "Responsable del proyecto", email: "laura@cincel.mx" }, { name: "Ana Ruiz", role: null, email: null }];
    expect(buildPortalOverview({ project, schedule, etapas: [], files: null, team, today: "2026-11-07" }).team).toEqual(team);
  });
});

describe("buildPortalStatusSentence", () => {
  const etapa = (key: string, name: string, state: PortalEtapaDTO["state"], progressPct: number): PortalEtapaDTO => ({
    key,
    name,
    state,
    progressPct,
    startMonth: null,
  });
  const next: AgendaItem = { id: "PB::Muros", title: "Muros", start: "2026-11-14", allDay: true };

  it("status sentence en curso with next delivery", () => {
    const etapas = [etapa("presale", "Presale", "completado", 100), etapa("diseno", "Diseño", "en_curso", 62)];
    expect(buildPortalStatusSentence(etapas, next, 41)).toEqual({
      kind: "en_curso",
      etapa: "Diseño",
      slot: 2,
      pct: 62,
      next: "2026-11-14",
    });
  });

  it("status sentence en curso without next delivery", () => {
    const etapas = [etapa("presale", "Presale", "en_curso", 30.4)];
    expect(buildPortalStatusSentence(etapas, null, 10)).toEqual({ kind: "en_curso", etapa: "Presale", slot: 1, pct: 30, next: null });
  });

  it("status sentence terminado", () => {
    const etapas = [etapa("presale", "Presale", "completado", 100), etapa("diseno", "Diseño", "completado", 100)];
    expect(buildPortalStatusSentence(etapas, next, 100)).toEqual({ kind: "terminado" });
  });

  it("status sentence por iniciar", () => {
    const etapas = [etapa("presale", "Presale", "por_iniciar", 0), etapa("diseno", "Diseño", "por_iniciar", 0)];
    expect(buildPortalStatusSentence(etapas, next, 0)).toEqual({ kind: "por_iniciar", next: "2026-11-14" });
    expect(buildPortalStatusSentence(etapas, null)).toEqual({ kind: "por_iniciar", next: null });
  });

  it("status sentence falls back to project progress when etapa pct missing", () => {
    const legacy = { key: "diseno", name: "Diseño", state: "en_curso" } as unknown as PortalEtapaDTO;
    expect(buildPortalStatusSentence([legacy], next, 41.6)).toEqual({
      kind: "en_curso",
      etapa: "Diseño",
      slot: 2,
      pct: 42,
      next: "2026-11-14",
      general: true,
    });
  });

  it("status sentence without etapas uses the project progress", () => {
    expect(buildPortalStatusSentence([], null, 41.6)).toEqual({ kind: "sin_etapas", pct: 42, next: null });
  });

  it("status sentence between etapas stands on the last one finished", () => {
    const etapas = [etapa("presale", "Presale", "completado", 100), etapa("diseno", "Diseño", "por_iniciar", 0)];
    expect(buildPortalStatusSentence(etapas, null, 30)).toMatchObject({ kind: "en_curso", etapa: "Presale", pct: 100 });
  });
});

describe("Analítico builders", () => {
  const today = "2026-11-07";
  const sections: NonNullable<PortalScheduleDTO>["sections"] = [
    { key: "PB::Cimentación", planta: "PB", seccion: "Cimentación", start: "2026-10-06", end: "2026-10-17", progressPct: 100 },
    { key: "PB::Muros", planta: "PB", seccion: "Muros", start: "2026-10-27", end: "2026-11-20", progressPct: 50 },
    { key: "PA::Losa", planta: "PA", seccion: "Losa", start: "2026-12-08", end: "2026-11-30", progressPct: 0 },
  ];
  const analiticoSchedule: PortalScheduleDTO = { sections };
  const etapasNow: PortalEtapaDTO[] = [
    { key: "presale", name: "Presale", state: "completado", progressPct: 100, startMonth: "2026-01" },
    { key: "diseno", name: "Diseño", state: "en_curso", progressPct: 62, startMonth: "2026-03" },
  ];

  it("buildPortalKpis counts entregados and nuevos esta semana", () => {
    const kpis = buildPortalKpis(
      {
        project,
        schedule: analiticoSchedule,
        etapas: etapasNow,
        documents: null,
        documentFolders: [
          {
            folderId: "root",
            name: "General",
            files: [
              file({ id: "a", modifiedAt: "2026-11-05T10:00:00.000Z" }),
              file({ id: "b", modifiedAt: "2026-10-01T10:00:00.000Z" }),
            ],
          },
          { folderId: "planos", name: "Planos", files: [file({ id: "c", modifiedAt: "2026-11-07T08:00:00.000Z" })] },
        ],
      },
      today,
    );
    expect(kpis.avance).toBe(42);
    expect(kpis.avanceDelta).toBeNull();
    expect(kpis.etapa).toEqual({ name: "Diseño", pct: 62, slot: 2 });
    expect(kpis.entregables).toEqual({ done: 1, total: 3 });
    expect(kpis.desvio).toBeNull();
    expect(kpis.documentos).toEqual({ total: 3, nuevosSemana: 2 });
  });

  it("buildPortalPhaseTable groups by planta with estado rules", () => {
    const groups = buildPortalPhaseTable(analiticoSchedule, today);
    expect(groups.map((g) => [g.id, g.label, g.caption])).toEqual([
      ["planta:PB", "PB", "2 fases"],
      ["planta:PA", "PA", "1 fase"],
    ]);
    expect(groups[0].rows?.map((r) => [r.fase, r.plan, r.estado, r.avance, r.real, r.desvio])).toEqual([
      ["Cimentación", "6–17 oct", "Completado", 100, null, null],
      ["Muros", "27 oct–20 nov", "En curso", 50, null, null],
    ]);
    expect(groups[1].rows?.[0].estado).toBe("Por iniciar");
    expect(groups[1].metrics).toEqual([{ key: "estado", value: "por iniciar", tone: "muted" }]);
  });

  it("buildPortalPhaseTable totals average by section", () => {
    const groups = buildPortalPhaseTable(analiticoSchedule, today);
    expect(groups[0].metrics).toEqual([{ key: "avance", value: "75 %" }]);
    expect(portalPhaseTotals(groups)).toEqual({ fases: 3, avance: 50, desvio: null });
  });

  it("buildPortalPhaseTable computes desvío once real dates arrive", () => {
    const withReal: PortalScheduleDTO = {
      sections: [
        { ...sections[0], actualStart: "2026-10-06", actualEnd: "2026-10-20" },
        { ...sections[1], end: "2026-11-02", actualStart: "2026-10-27", actualEnd: null },
      ],
    };
    const [group] = buildPortalPhaseTable(withReal, today);
    expect(group.rows?.map((r) => [r.real, r.desvio])).toEqual([
      ["6–20 oct", 3],
      ["27 oct–", 5],
    ]);
    expect(portalPhaseTotals([group]).desvio).toBe(5);
  });

  it("Real and Desvío stay hidden while every emitted real date is null", () => {
    const emptyReal: PortalScheduleDTO = {
      sections: sections.map((s) => ({ ...s, actualStart: null, actualEnd: null, etapaKey: null })),
    };
    expect(portalScheduleHasRealDates(emptyReal)).toBe(false);
    expect(buildPortalPhaseTable(emptyReal, today).flatMap((g) => g.rows ?? []).every((r) => r.desvio === null)).toBe(true);
    expect(portalScheduleHasRealDates({ sections: [{ ...sections[0], actualStart: "2026-10-06", actualEnd: null }] })).toBe(true);
  });

  it("buildPortalEntregables orders by end", () => {
    const rows = buildPortalEntregables(analiticoSchedule, today);
    expect(rows.map((r) => [r.entregable, r.etapa, r.fechaPlan, r.estado, r.fechaReal, r.desvio])).toEqual([
      ["Cimentación", "PB", "17 oct", "Entregado", null, null],
      ["Muros", "PB", "20 nov", "En curso", null, null],
      ["Losa", "PA", "30 nov", "Por iniciar", null, null],
    ]);
  });

  it("buildPortalFilesByFolder sums sizes per folder", () => {
    expect(buildPortalFilesByFolder(null)).toBeNull();
    const groups = buildPortalFilesByFolder([
      {
        folderId: "root",
        name: "General",
        files: [file({ id: "a", sizeBytes: 1024 * 1024 }), file({ id: "b", sizeBytes: 512 * 1024 }), file({ id: "x", sizeBytes: null })],
      },
      { folderId: "vacia", name: "Vacía", files: [] },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups![0]).toMatchObject({ id: "carpeta:root", label: "General", caption: "3 archivos" });
    expect(groups![0].metrics).toEqual([{ key: "tamano", value: "1.5 MB" }]);
    expect(groups![0].rows?.map((r) => r.tamano)).toEqual(["1.0 MB", "512 KB", "—"]);
  });

  it("portalDateRange same and cross month", () => {
    expect(portalDateRange("2026-10-06", "2026-10-17")).toBe("6–17 oct");
    expect(portalDateRange("2026-10-27", "2026-11-07")).toBe("27 oct–7 nov");
    expect(portalDateRange("2026-12-08", "2027-02-26")).toBe("8 dic–26 feb");
  });

  it("subidoPor Tú for client uploads else Cincel", () => {
    const groups = buildPortalFilesByFolder([
      {
        folderId: "root",
        name: "General",
        files: [
          file({ id: "mine", uploadedBy: "cliente", modifiedAt: "2026-11-02T00:00:00.000Z" }),
          file({ id: "theirs", uploadedBy: "cincel", modifiedAt: "2026-11-01T00:00:00.000Z" }),
          file({ id: "unknown", modifiedAt: "2026-10-01T00:00:00.000Z" }),
        ],
      },
    ]);
    expect(groups![0].rows?.map((r) => [r.id, r.subidoPor])).toEqual([
      ["mine", "Tú"],
      ["theirs", "Cincel"],
      ["unknown", "Cincel"],
    ]);
  });
});
