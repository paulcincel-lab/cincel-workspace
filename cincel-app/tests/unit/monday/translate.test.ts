// @vitest-environment node
import { describe, expect, it } from "vitest";

import fixture from "@/scripts/monday/__fixtures__/translate-export.json";
import { Mapping, type MappingInput } from "@/scripts/monday/mapping.schema";
import {
  defaultStatusForLabel,
  groupRanks,
  priorityFromLabel,
  statusLabelId,
  toDate,
  translate,
  underlyingStatus,
  type CincelLookups,
  type ExportData,
} from "@/scripts/monday/translate";

const ANA = "11111111-1111-4111-8111-111111111111";
const BETO = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const CUSTOM_OPEN = "44444444-4444-4444-8444-444444444444";
const CUSTOM_CLOSES = "55555555-5555-4555-8555-555555555555";
const TEMPLATE = "66666666-6666-4666-8666-666666666666";
const WORKFLOW = "77777777-7777-4777-8777-777777777777";
const BOARD_WORKFLOW = "88888888-8888-4888-8888-888888888888";
const SOL = "99999999-9999-4999-8999-999999999999";
const EXISTING_CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function exportData(): ExportData {
  return structuredClone(fixture) as unknown as ExportData;
}

function mappingInput(): MappingInput {
  return {
    version: 1,
    boards: [
      {
        mondayBoardId: "301",
        name: "Casa Lomas",
        strategy: "board_as_project",
        client: { kind: "contact", contactId: EXISTING_CLIENT },
        projectCode: " CL-01 ",
        workflowId: BOARD_WORKFLOW,
        columns: {
          name: "title",
          status: "status",
          prio: "priority",
          people: "people",
          timeline: "timeline",
          entrega: "delivery_date",
          notas: "notes",
          deps: "dependencies",
        },
        statusMaps: {
          status: {
            "0": { status: "pendiente" },
            "1": { status: "completado" },
            "2": { status: "bloqueado" },
            "3": { customStatusId: CUSTOM_OPEN },
          },
        },
        templateMatches: { "1003": TEMPLATE },
      },
      {
        mondayBoardId: "401",
        name: "Clientes",
        strategy: "crm_contacts",
        contactType: "cliente",
        contactMatches: { "5002": SOL },
        columns: {
          name: "title",
          email: "contact_email",
          phone: "contact_phone",
        },
        statusMaps: {},
      },
      {
        mondayBoardId: "501",
        name: "Obras 2026",
        strategy: "item_as_project",
        client: { kind: "relation_column", columnId: "rel" },
        projectNames: { "6002": "Casa Sol (Polanco)" },
        projectCodes: { "6001": "OB-RUIZ" },
        columns: { name: "title", rel: "client" },
        subitemColumns: { name: "title", sstatus: "status" },
        statusMaps: {
          sstatus: {
            "5": { customStatusId: CUSTOM_CLOSES },
            "6": { status: "en_proceso" },
          },
        },
      },
      {
        mondayBoardId: "601",
        name: "Proveedores",
        strategy: "crm_contacts",
        contactType: "proveedor",
        providerSubtype: "contratista",
        columns: { name: "title" },
        statusMaps: {},
      },
      {
        mondayBoardId: "701",
        name: "Remodelaciones",
        strategy: "group_as_project",
        groupClients: { ga: { kind: "new", name: " Familia Pérez " } },
        client: { kind: "new", name: "familia pérez" },
        columns: { name: "title" },
        statusMaps: {},
      },
    ],
    people: {
      "11": { action: "staff", staffId: ANA },
      "12": { action: "staff", staffId: BETO },
      "13": { action: "contact" },
      "14": null,
    },
    options: { includeUpdates: true, includeFiles: true },
  };
}

const lookups: CincelLookups = {
  customStatuses: {
    [CUSTOM_OPEN]: { name: "Revisión cliente", closes: false },
    [CUSTOM_CLOSES]: { name: "Hecho", closes: true },
  },
  templates: { [TEMPLATE]: { workflowId: WORKFLOW } },
  staff: {
    [ANA]: { name: "Ana" },
    [BETO]: { name: "Beto" },
    [ADMIN]: { name: "Admin" },
  },
};

function run(data = exportData(), input = mappingInput()) {
  return translate(data, Mapping.parse(input), lookups, {
    importedById: ADMIN,
  });
}

const task = (r: ReturnType<typeof run>, id: string) =>
  r.tasks.find((t) => t.externalId === id)!;
const project = (r: ReturnType<typeof run>, id: string) =>
  r.projects.find((p) => p.externalId === id)!;

describe("translate helpers", () => {
  it("default status per label", () => {
    expect(defaultStatusForLabel("Done", true)).toBe("completado");
    expect(defaultStatusForLabel("Stuck", false)).toBe("bloqueado");
    expect(defaultStatusForLabel("Detenido", false)).toBe("bloqueado");
    expect(defaultStatusForLabel("Working on it", false)).toBe("en_proceso");
    expect(defaultStatusForLabel("En curso", false)).toBe("en_proceso");
    expect(defaultStatusForLabel("Nuevo", false)).toBe("pendiente");
  });

  it("priority per label", () => {
    expect(priorityFromLabel("Urgent")).toBe("alta");
    expect(priorityFromLabel("Low")).toBe("baja");
    expect(priorityFromLabel("Normal")).toBe("media");
    expect(priorityFromLabel(null)).toBe("media");
  });

  it("underlyingStatus: closes → completado, else en_proceso", () => {
    expect(underlyingStatus({ closes: true })).toBe("completado");
    expect(underlyingStatus({ closes: false })).toBe("en_proceso");
  });

  it("dense-ranks groups by decimal position", () => {
    const ranks = groupRanks([
      { id: "c", title: "C", position: "131072.5" },
      { id: "a", title: "A", position: "65536" },
      { id: "b", title: "B", position: "65536.0" },
      { id: "d", title: "D", position: "200000" },
    ]);
    expect(Object.fromEntries(ranks)).toEqual({ a: 1, b: 1, c: 2, d: 3 });
  });

  it("label id by label text, falling back to the value index", () => {
    const column = {
      settings: { labels: [{ id: 7, label: "Listo", index: 0 }] },
    };
    expect(statusLabelId(column, { label: "Listo", index: 3 })).toBe("7");
    expect(statusLabelId(column, { label: "Otro", index: 3 })).toBe("3");
    expect(
      statusLabelId(
        { settings: { labels: { "4": "Listo" } } },
        { label: "Listo", index: 0 },
      ),
    ).toBe("4");
    expect(statusLabelId(column, { label: null, index: null })).toBeNull();
  });

  it("dates from monday date and timestamp strings", () => {
    expect(toDate("2026-03-01T00:00:00+00:00")).toBe("2026-03-01");
    expect(toDate("2026-03-01")).toBe("2026-03-01");
    expect(toDate("")).toBeNull();
    expect(toDate("mañana")).toBeNull();
  });
});

describe("translate: board_as_project", () => {
  it("one project per board with name, code and client", () => {
    const r = run();
    const p = project(r, "301");
    expect(p).toMatchObject({
      name: "Casa Lomas",
      code: "CL-01",
      client: { kind: "existing", id: EXISTING_CLIENT },
      source: {
        boardId: "301",
        boardName: "Casa Lomas",
        groupId: null,
        groupTitle: null,
      },
    });
  });

  it("projectNames overrides the board name", () => {
    const input = mappingInput();
    input.boards[0].projectNames = { "301": "Residencia Lomas" };
    expect(project(run(exportData(), input), "301").name).toBe(
      "Residencia Lomas",
    );
  });

  it("group → phase and seccion with dense-rank seccion_order; sort_order per group", () => {
    const r = run();
    const rows = ["1001", "1002", "1003", "1004", "1005"].map((id) => {
      const t = task(r, id);
      return [t.phase, t.seccion, t.seccionOrder, t.sortOrder];
    });
    expect(rows).toEqual([
      ["Diseño", "Diseño", 1, 1],
      ["Diseño", "Diseño", 1, 2],
      ["Obra", "Obra", 2, 1],
      ["Obra", "Obra", 2, 2],
      ["Extras", "Extras", 1, 1],
    ]);
    expect(task(r, "1001").source).toEqual({
      boardId: "301",
      boardName: "Casa Lomas",
      groupId: "g_diseno",
      groupTitle: "Diseño",
    });
  });

  it("status by label id, custom status derivation, empty cell", () => {
    const r = run();
    expect(task(r, "1001")).toMatchObject({
      status: "completado",
      customStatusId: null,
    });
    expect(task(r, "1002")).toMatchObject({
      status: "en_proceso",
      customStatusId: CUSTOM_OPEN,
    });
    expect(task(r, "1003")).toMatchObject({
      status: "bloqueado",
      customStatusId: null,
    });
    expect(task(r, "1004")).toMatchObject({
      status: "pendiente",
      customStatusId: null,
    });
    expect(task(r, "1005")).toMatchObject({ status: "pendiente" });
  });

  it("custom status that closes sets status completado", () => {
    const r = run();
    expect(task(r, "6101")).toMatchObject({
      status: "completado",
      customStatusId: CUSTOM_CLOSES,
    });
  });

  it("reordered status labels give identical output (BE §12 #6)", () => {
    const before = run();
    const data = exportData();
    const board = data.boards.find((b) => b.board.id === "301")!.board;
    const status = board.columns.find((c) => c.id === "status")!;
    const labels = (
      status.settings as {
        labels: { id: number; label: string; index: number }[];
      }
    ).labels;
    labels.reverse();
    labels.forEach((l, i) => (l.index = i));
    const newIndex = new Map(labels.map((l) => [l.label, l.index]));
    for (const item of data.boards.find((b) => b.board.id === "301")!.items) {
      for (const v of item.column_values) {
        if (v.__typename === "StatusValue" && v.id === "status" && v.label) {
          v.index = newIndex.get(v.label)!;
        }
      }
    }
    expect(run(data)).toEqual(before);
  });

  it("unmapped status label is reported", () => {
    const input = mappingInput();
    delete input.boards[0].statusMaps.status["2"];
    const r = run(exportData(), input);
    expect(task(r, "1003").status).toBe("pendiente");
    expect(r.issues).toContainEqual(
      expect.objectContaining({
        code: "STATUS_UNMAPPED",
        boardId: "301",
        itemId: "1003",
      }),
    );
  });

  it("priority from the priority column", () => {
    const r = run();
    expect(task(r, "1001").priority).toBe("alta");
    expect(task(r, "1002").priority).toBe("baja");
    expect(task(r, "1003").priority).toBe("media");
  });

  it("people: first staff → manager, other staff → support, guests → contact people", () => {
    const r = run();
    expect(task(r, "1001").managerId).toBe(ANA);
    expect(
      r.taskSupport.filter(
        (s) => s.task.kind === "planned" && s.task.externalId === "1001",
      ),
    ).toEqual([
      {
        entity: "task_support",
        externalId: "1001:12",
        task: { kind: "planned", entity: "task", externalId: "1001" },
        staffId: BETO,
      },
    ]);
    // duplicates of the same person collapse; no self-support
    expect(task(r, "1002").managerId).toBe(BETO);
    expect(r.taskSupport.some((s) => s.externalId.startsWith("1002:"))).toBe(
      false,
    );
    // the guest appears on two tasks of the same client: one contact person
    expect(task(r, "1003").managerId).toBeNull();
    expect(r.contactPeople).toEqual([
      {
        entity: "contact_person",
        externalId: `13@${EXISTING_CLIENT}`,
        contact: { kind: "existing", id: EXISTING_CLIENT },
        name: "Carla Cliente",
        email: "carla@example.com",
      },
    ]);
  });

  it("unmatched assignee: no manager, name kept, warning", () => {
    const r = run();
    expect(task(r, "1001").unmatchedPeople).toEqual([
      { id: "14", name: "Dario Externo" },
    ]);
    expect(r.issues).toContainEqual(
      expect.objectContaining({ code: "PERSON_UNMATCHED", itemId: "1001" }),
    );
  });

  it("guest with an existing contact person creates nothing", () => {
    const input = mappingInput();
    input.people["13"] = { action: "contact", contactId: SOL };
    expect(run(exportData(), input).contactPeople).toEqual([]);
  });

  it("timeline → commitment date, start, milestone; date column → delivery; notes", () => {
    const r = run();
    expect(task(r, "1001")).toMatchObject({
      start: "2026-01-05",
      commitmentDate: "2026-01-20",
      deliveryDate: "2026-01-25",
      milestone: false,
      notes: "Revisar con el cliente",
      createdAt: "2025-12-01T10:00:00Z",
      createdById: ADMIN,
    });
    expect(task(r, "1002")).toMatchObject({
      start: "2026-02-01",
      commitmentDate: "2026-02-01",
      milestone: true,
    });
    expect(task(r, "1005")).toMatchObject({
      start: "2026-03-01",
      commitmentDate: "2026-03-31",
    });
    expect(task(r, "1004")).toMatchObject({
      start: null,
      commitmentDate: null,
      deliveryDate: null,
    });
  });

  it("dependencies: finish-to-start, missing and self links skipped", () => {
    const r = run();
    expect(r.taskDependencies).toEqual([
      {
        entity: "task_dependency",
        externalId: "1002:1001",
        task: { kind: "planned", entity: "task", externalId: "1002" },
        dependsOn: { kind: "planned", entity: "task", externalId: "1001" },
        kind: "finish_to_start",
      },
      {
        entity: "task_dependency",
        externalId: "1003:1002",
        task: { kind: "planned", entity: "task", externalId: "1003" },
        dependsOn: { kind: "planned", entity: "task", externalId: "1002" },
        kind: "finish_to_start",
      },
    ]);
    expect(r.issues).toContainEqual(
      expect.objectContaining({ code: "RELATION_MISSING", itemId: "1002" }),
    );
  });

  it("kind: workflow for template matches, usuario with the board workflow otherwise", () => {
    const r = run();
    expect(task(r, "1003")).toMatchObject({
      kind: "workflow",
      templateId: TEMPLATE,
      workflowId: WORKFLOW,
    });
    expect(task(r, "1001")).toMatchObject({
      kind: "usuario",
      templateId: null,
      workflowId: BOARD_WORKFLOW,
    });
  });

  it("unknown template falls back to usuario and is reported", () => {
    const input = mappingInput();
    input.boards[0].templateMatches = { "1003": SOL };
    const r = run(exportData(), input);
    expect(task(r, "1003").kind).toBe("usuario");
    expect(r.issues).toContainEqual(
      expect.objectContaining({ code: "TEMPLATE_INVALID" }),
    );
  });

  it("project progress, dates and status", () => {
    const p = project(run(), "301");
    expect(p).toMatchObject({
      progress: 20,
      status: "activo",
      startDate: "2026-01-05",
      endDate: "2026-03-31",
    });
  });
});

describe("translate: contacts and other strategies", () => {
  it("crm_contacts → contacts, reusing matches; proveedor → provider profile", () => {
    const r = run();
    expect(r.contacts.find((c) => c.externalId === "5001")).toMatchObject({
      type: "cliente",
      name: "Familia Ruiz",
      email: "ruiz@example.com",
      phone: "+525512345678",
    });
    expect(r.contacts.some((c) => c.externalId === "5002")).toBe(false);
    expect(r.contacts.find((c) => c.externalId === "7001")).toMatchObject({
      type: "proveedor",
    });
    expect(r.providerProfiles).toEqual([
      {
        entity: "provider_profile",
        externalId: "7001",
        contact: { kind: "planned", entity: "contact", externalId: "7001" },
        subtype: "contratista",
      },
    ]);
  });

  it("item_as_project: client by relation column, subitems → tasks, names and codes", () => {
    const r = run();
    expect(project(r, "6001")).toMatchObject({
      name: "Casa Ruiz",
      code: "OB-RUIZ",
      client: { kind: "planned", entity: "contact", externalId: "5001" },
      progress: 50,
      status: "activo",
    });
    expect(project(r, "6002")).toMatchObject({
      name: "Casa Sol (Polanco)",
      client: { kind: "existing", id: SOL },
      progress: 100,
      status: "completado",
    });
    expect(task(r, "6102")).toMatchObject({
      project: { externalId: "6001" },
      status: "en_proceso",
      sortOrder: 2,
      phase: null,
    });
    expect(project(r, "6003").client).toBeNull();
    expect(r.issues).toContainEqual(
      expect.objectContaining({
        code: "CLIENT_UNRESOLVED",
        boardId: "501",
        itemId: "6003",
      }),
    );
  });

  it("group_as_project: one project per group in position order, new clients deduped", () => {
    const r = run();
    const projects = r.projects.filter((p) => p.source.boardId === "701");
    expect(projects.map((p) => [p.externalId, p.name])).toEqual([
      ["701:ga", "Depto Condesa"],
      ["701:gb", "Depto Roma"],
    ]);
    const perez = r.contacts.filter(
      (c) => c.externalId === "new:familia pérez",
    );
    expect(perez).toHaveLength(1);
    expect(perez[0]).toMatchObject({
      type: "cliente",
      kind: "empresa",
      name: "Familia Pérez",
    });
    expect(projects.every((p) => p.client?.kind === "planned")).toBe(true);
    expect(["8001", "8003"].map((id) => task(r, id).sortOrder)).toEqual([1, 2]);
    expect(task(r, "8002")).toMatchObject({
      project: { externalId: "701:gb" },
      sortOrder: 1,
    });
    expect(project(r, "701:ga")).toMatchObject({
      status: "activo",
      progress: 0,
    });
  });

  it("skip boards and non-active items produce nothing", () => {
    const data = exportData();
    data.boards[0].items[0].state = "archived";
    const input = mappingInput();
    input.boards[4].strategy = "skip";
    const r = run(data, input);
    expect(r.tasks.some((t) => t.externalId === "1001")).toBe(false);
    expect(r.projects.some((p) => p.source.boardId === "701")).toBe(false);
  });

  it("is deterministic", () => {
    expect(run()).toEqual(run());
  });
});
