// @vitest-environment node
import { describe, expect, it } from "vitest";

import fixture from "@/scripts/monday/__fixtures__/translate-nested-export.json";
import { Mapping, type MappingInput } from "@/scripts/monday/mapping.schema";
import {
  columnKeys,
  scheduleStatus,
  translate,
  type CincelLookups,
  type ExportData,
  type TranslateResult,
} from "@/scripts/monday/translate";

const ANA = "11111111-1111-4111-8111-111111111111";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function exportData(): ExportData {
  return structuredClone(fixture) as unknown as ExportData;
}

const STATUS = {
  "0": { status: "pendiente" },
  "1": { status: "completado" },
  "2": { status: "en_proceso" },
} as const;
const SUB_STATUS = {
  "0": { status: "pendiente" },
  "1": { status: "completado" },
} as const;

function mappingInput(): MappingInput {
  return {
    version: 1,
    boards: [
      {
        mondayBoardId: "901",
        name: "Casa Nido",
        strategy: "board_as_project",
        client: { kind: "contact", contactId: CLIENT },
        columns: {
          name: "title",
          status: "status",
          people: "people",
          timeline: "timeline",
          costo: "import_data",
          costo2: "import_data",
          prov: "import_data",
          planta: "ignore",
        },
        subitemColumns: {
          name: "title",
          sstatus: "status",
          metros: "import_data",
          metros2: "import_data",
        },
        statusMaps: { status: STATUS, sstatus: SUB_STATUS },
        subitems: "checklist",
        schedule: { enabled: true, planta: { columnId: "planta" } },
      },
      {
        mondayBoardId: "902",
        name: "Casa Faro",
        strategy: "board_as_project",
        client: { kind: "contact", contactId: CLIENT },
        columns: { name: "title", status: "status" },
        subitemColumns: {
          name: "title",
          sstatus: "status",
          metros: "import_data",
        },
        statusMaps: { status: STATUS, sstatus: SUB_STATUS },
        subitems: "child_tasks",
      },
      {
        mondayBoardId: "903",
        name: "Obras",
        strategy: "item_as_project",
        client: { kind: "contact", contactId: CLIENT },
        columns: { name: "title", presupuesto: "import_data" },
        subitemColumns: { name: "title" },
        statusMaps: {},
      },
      {
        mondayBoardId: "904",
        name: "Clientes",
        strategy: "crm_contacts",
        contactType: "cliente",
        columns: { name: "title", rfc: "import_data" },
        statusMaps: {},
      },
    ],
    people: {
      "11": { action: "staff", staffId: ANA },
      "14": null,
    },
    options: { includeUpdates: true, includeFiles: true },
  };
}

const lookups: CincelLookups = {
  customStatuses: {},
  templates: {},
  staff: { [ANA]: { name: "Ana Arquitecta" } },
};

function run(
  data: ExportData = exportData(),
  input: MappingInput = mappingInput(),
): TranslateResult {
  return translate(data, Mapping.parse(input), lookups, {
    importedById: ADMIN,
  });
}

function task(r: TranslateResult, id: string) {
  const t = r.tasks.find((x) => x.externalId === id);
  if (!t) throw new Error(`task ${id} not planned`);
  return t;
}

describe("translate helpers: nested content", () => {
  it("column keys: title, with #<columnId> on later duplicates", () => {
    const keys = columnKeys([
      { id: "a", title: "Costo", type: "numbers", settings: {} },
      { id: "b", title: "Notas", type: "text", settings: {} },
      { id: "c", title: "Costo", type: "numbers", settings: {} },
    ]);
    expect(Object.fromEntries(keys)).toEqual({
      a: "Costo",
      b: "Notas",
      c: "Costo#c",
    });
  });

  it("cronograma status per task status", () => {
    expect(scheduleStatus("completado")).toBe("done");
    expect(scheduleStatus("en_proceso")).toBe("progress");
    expect(scheduleStatus("pendiente")).toBe("pending");
    expect(scheduleStatus("bloqueado")).toBe("pending");
  });
});

describe("translate: subitems", () => {
  it("checklist: depth-first items, prefixed titles, status → completed", () => {
    const r = run();
    expect(
      r.checklistItems.map((c) => [
        c.externalId,
        c.title,
        c.completed,
        c.sortOrder,
      ]),
    ).toEqual([
      ["2101", "Aplanado", true, 1],
      ["2111", "Aplanado › Fino", false, 2],
      ["2102", "Pintura", false, 3],
    ]);
    for (const c of r.checklistItems) {
      expect(c.task).toEqual({
        kind: "planned",
        entity: "task",
        externalId: "2001",
      });
    }
    // Checklist subitems are not tasks.
    expect(
      r.tasks.some((t) =>
        ["2101", "2111", "2102", "2103"].includes(t.externalId),
      ),
    ).toBe(false);
  });

  it("checklist: subitem column values in the parent's import data, keyed by id", () => {
    expect(task(run(), "2001").data.subitems).toEqual({
      "2101": {
        name: "Aplanado",
        columns: { Metros: "20", "Metros#metros2": "5" },
      },
      "2111": { name: "Fino", columns: {} },
      "2102": { name: "Pintura", columns: {} },
    });
  });

  it("child tasks: every level flattened under the item's task, path for deeper levels", () => {
    const r = run();
    const children = r.tasks.filter((t) => t.parentTask != null);
    expect(
      children.map((t) => [t.externalId, t.title, t.sortOrder, t.data.path]),
    ).toEqual([
      ["3101", "Eléctrica", 1, undefined],
      ["3111", "Tablero", 2, ["Eléctrica", "Tablero"]],
      ["3121", "Breakers", 3, ["Eléctrica", "Tablero", "Breakers"]],
      ["3102", "Hidráulica", 4, undefined],
    ]);
    for (const t of children) {
      expect(t.parentTask).toEqual({
        kind: "planned",
        entity: "task",
        externalId: "3001",
      });
      expect(t.project.externalId).toBe("902");
      expect(t.phase).toBe("Instalaciones");
    }
    expect(task(r, "3101")).toMatchObject({
      status: "completado",
      data: { columns: { Metros: "12" } },
    });
    expect(
      r.checklistItems.some(
        (c) => c.task.kind === "planned" && c.task.externalId === "3001",
      ),
    ).toBe(false);
  });

  it("child tasks don't count in the project rollup", () => {
    const p = run().projects.find((x) => x.externalId === "902")!;
    expect(p).toMatchObject({ progress: 0, status: "activo" });
  });

  it("ignore: no checklist items or child tasks", () => {
    const input = mappingInput();
    input.boards[0].subitems = "ignore";
    input.boards[1].subitems = "ignore";
    const r = run(exportData(), input);
    expect(r.checklistItems).toEqual([]);
    expect(r.tasks.filter((t) => t.parentTask)).toEqual([]);
    expect(task(r, "2001").data.subitems).toBeUndefined();
  });
});

describe("translate: import_refs data", () => {
  it("source, columns by title with duplicates suffixed, start, milestone", () => {
    const r = run();
    expect(task(r, "2001").data).toMatchObject({
      source: {
        boardId: "901",
        boardName: "Casa Nido",
        groupId: "g_obra",
        groupTitle: "Obra",
      },
      columns: {
        Costo: "100",
        "Costo#costo2": "200",
        Proveedor: "Concretos del Valle",
        Responsable: "Dario Externo",
      },
      start: "2026-02-01",
    });
    expect(task(r, "2001").data.milestone).toBeUndefined();
    expect(task(r, "2002").data).toMatchObject({
      start: "2026-01-15",
      milestone: true,
    });
    expect(task(r, "2003").data.start).toBeUndefined();
  });

  it("projects and contacts keep their own import data", () => {
    const r = run();
    expect(r.projects.find((p) => p.externalId === "4001")!.data).toEqual({
      source: {
        boardId: "903",
        boardName: "Obras",
        groupId: "g2",
        groupTitle: "2026",
      },
      columns: { Presupuesto: "5000" },
    });
    expect(r.projects.find((p) => p.externalId === "901")!.data).toEqual({
      source: {
        boardId: "901",
        boardName: "Casa Nido",
        groupId: null,
        groupTitle: null,
      },
      columns: {},
    });
    expect(r.contacts.find((c) => c.externalId === "5001")!.data).toEqual({
      source: {
        boardId: "904",
        boardName: "Clientes",
        groupId: "g3",
        groupTitle: "Activos",
      },
      columns: { RFC: "MAR010101AAA" },
    });
  });
});

describe("translate: updates → comments", () => {
  it("oldest first, replies included, empty and untranslated skipped", () => {
    const r = run();
    expect(r.historyEvents.map((e) => [e.externalId, e.eventAt])).toEqual([
      ["u7", "2026-01-01T09:00:00Z"],
      ["u6", "2026-01-02T09:00:00Z"],
      ["u5", "2026-01-03T09:00:00Z"],
      ["u2", "2026-01-05T09:00:00Z"],
      ["u8", "2026-01-06T09:00:00Z"],
      ["r1", "2026-01-09T08:00:00Z"],
      ["u1", "2026-01-10T10:00:00Z"],
    ]);
    expect(r.historyEvents.every((e) => e.kind === "comentario")).toBe(true);
  });

  it("mapped staff author keeps the text; others fall back to the admin with a prefix", () => {
    const r = run();
    const ev = (id: string) =>
      r.historyEvents.find((e) => e.externalId === id)!;
    expect(ev("u1")).toMatchObject({
      actorId: ANA,
      comment: "Listo muros",
      target: {
        entity: "task",
        ref: { kind: "planned", entity: "task", externalId: "2001" },
      },
    });
    expect(ev("r1")).toMatchObject({
      actorId: ADMIN,
      comment: "monday · Dario Externo: Ok, foto (https://x.mx/f)",
    });
  });

  it("checklist subitems: on the parent task with a [subitem] prefix", () => {
    const r = run();
    const ev = (id: string) =>
      r.historyEvents.find((e) => e.externalId === id)!;
    expect(ev("u2")).toMatchObject({
      actorId: ADMIN,
      comment: "monday · usuario 99: [Aplanado] Revisar esquinas",
      target: { entity: "task", ref: { externalId: "2001" } },
    });
    expect(ev("u8")).toMatchObject({
      actorId: ANA,
      comment: "[Fino] Fino listo",
      target: { entity: "task", ref: { externalId: "2001" } },
    });
  });

  it("child tasks, item_as_project items and contacts as targets", () => {
    const r = run();
    const ev = (id: string) =>
      r.historyEvents.find((e) => e.externalId === id)!;
    expect(ev("u5").target).toEqual({
      entity: "task",
      ref: { kind: "planned", entity: "task", externalId: "3111" },
    });
    expect(ev("u6").target).toEqual({
      entity: "project",
      ref: { kind: "planned", entity: "project", externalId: "4001" },
    });
    expect(ev("u7")).toMatchObject({
      target: {
        entity: "contact",
        ref: { kind: "planned", entity: "contact", externalId: "5001" },
      },
      comment: "monday · Dario Externo: Primer contacto",
    });
  });

  it("includeUpdates: false plans no comments", () => {
    const input = mappingInput();
    input.options = { includeUpdates: false, includeFiles: true };
    expect(run(exportData(), input).historyEvents).toEqual([]);
  });
});

describe("translate: files → links", () => {
  it("item, update and reply files on tasks; project files; checklist files on the parent", () => {
    const r = run();
    expect(
      r.files.map((f) => [
        f.assetId,
        f.link,
        f.project,
        f.task?.kind === "planned" ? f.task.externalId : null,
        f.groupName,
      ]),
    ).toEqual([
      [
        "a1",
        "task_link",
        { kind: "planned", entity: "project", externalId: "901" },
        "2001",
        "Obra",
      ],
      [
        "a3",
        "task_link",
        { kind: "planned", entity: "project", externalId: "901" },
        "2001",
        "Obra",
      ],
      [
        "a2",
        "task_link",
        { kind: "planned", entity: "project", externalId: "901" },
        "2001",
        "Obra",
      ],
      [
        "a7",
        "task_link",
        { kind: "planned", entity: "project", externalId: "901" },
        "2001",
        "Obra",
      ],
      [
        "a4",
        "task_link",
        { kind: "planned", entity: "project", externalId: "902" },
        "3111",
        "Instalaciones",
      ],
      [
        "a5",
        "project_link",
        { kind: "planned", entity: "project", externalId: "4001" },
        null,
        "2026",
      ],
    ]);
    expect(r.files.find((f) => f.assetId === "a1")).toMatchObject({
      entity: "import_file",
      externalId: "a1",
      fileName: "muros.pdf",
      sizeBytes: 1000,
      sha256: "sha-a1",
      localPath: "files/a1/muros.pdf",
    });
  });

  it("a file missing from the index is reported, contact files are not planned", () => {
    const r = run();
    expect(r.files.some((f) => f.assetId === "a9" || f.assetId === "a6")).toBe(
      false,
    );
    expect(r.issues.filter((i) => i.code === "FILE_MISSING")).toEqual([
      expect.objectContaining({ boardId: "901", itemId: "2002" }),
    ]);
  });

  it("includeFiles: false plans no files", () => {
    const input = mappingInput();
    input.options = { includeUpdates: true, includeFiles: false };
    const r = run(exportData(), input);
    expect(r.files).toEqual([]);
    expect(r.issues.some((i) => i.code === "FILE_MISSING")).toBe(false);
  });
});

describe("translate: cronograma rows", () => {
  it("one row per top-level task with a timeline, one schedule per project", () => {
    const r = run();
    expect(r.projectSchedules).toEqual([
      {
        entity: "project_schedule",
        externalId: "901",
        project: { kind: "planned", entity: "project", externalId: "901" },
        sourceFileName: "monday:901",
      },
    ]);
    expect(r.scheduleTasks).toEqual([
      {
        entity: "schedule_task",
        externalId: "2001",
        project: { kind: "planned", entity: "project", externalId: "901" },
        task: { kind: "planned", entity: "task", externalId: "2001" },
        stableKey: "monday:2001",
        planta: "Planta baja",
        seccion: "Obra",
        seccionOrder: 2,
        tarea: "Muros",
        inicio: "2026-02-01",
        fin: "2026-02-10",
        status: "done",
        responsable: "Ana Arquitecta",
        sortOrder: 1,
      },
      {
        entity: "schedule_task",
        externalId: "2002",
        project: { kind: "planned", entity: "project", externalId: "901" },
        task: { kind: "planned", entity: "task", externalId: "2002" },
        stableKey: "monday:2002",
        planta: "General",
        seccion: "Diseño",
        seccionOrder: 1,
        tarea: "Planos",
        inicio: "2026-01-15",
        fin: "2026-01-15",
        status: "progress",
        responsable: "Ana Arquitecta",
        sortOrder: 1,
      },
    ]);
  });

  it("items without a timeline are reported and stay tasks", () => {
    const r = run();
    expect(r.issues.filter((i) => i.code === "DATES_MISSING")).toEqual([
      expect.objectContaining({ boardId: "901", itemId: "2003" }),
    ]);
    expect(task(r, "2003").title).toBe("Limpieza");
  });

  it("fixed planta; boards without schedule.enabled get no rows", () => {
    const input = mappingInput();
    input.boards[0].schedule = { enabled: true, planta: { fixed: "Casa" } };
    const r = run(exportData(), input);
    expect(r.scheduleTasks.map((s) => s.planta)).toEqual(["Casa", "Casa"]);
    expect(
      r.scheduleTasks.some(
        (s) => s.project.kind === "planned" && s.project.externalId !== "901",
      ),
    ).toBe(false);
  });
});

describe("translate: purity", () => {
  it("doesn't mutate its input and is deterministic", () => {
    const data = exportData();
    const before = structuredClone(data);
    const a = run(data);
    expect(data).toEqual(before);
    expect(run(data)).toEqual(a);
  });
});
