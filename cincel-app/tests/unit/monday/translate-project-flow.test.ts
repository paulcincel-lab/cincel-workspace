// @vitest-environment node
import { describe, expect, it } from "vitest";

import { Mapping, type MappingInput } from "@/scripts/monday/mapping.schema";
import {
  endOfDayIn,
  phaseFromTitle,
  translate,
  type CincelLookups,
  type ExportData,
  type TranslateResult,
} from "@/scripts/monday/translate";

// Tramos, fases and templates of the catalog.
const PRESALE = "a1000000-0000-4000-8000-000000000001";
const DISENO = "a1000000-0000-4000-8000-000000000002";
const CONSTRUCCION = "a1000000-0000-4000-8000-000000000003";
const P_COBRO = "b1000000-0000-4000-8000-000000000001";
const P_ANTE = "b1000000-0000-4000-8000-000000000002";
const P_EJEC = "b1000000-0000-4000-8000-000000000003";
const P_PEJEC = "b1000000-0000-4000-8000-000000000004";
const P_OBRA = "b1000000-0000-4000-8000-000000000005";
const P_OLD = "b1000000-0000-4000-8000-000000000006";
const T_PLANOS = "c1000000-0000-4000-8000-000000000001";
const T_COBRO = "c1000000-0000-4000-8000-000000000002";
// Staff, statuses, clients.
const ANA = "d1000000-0000-4000-8000-000000000001";
const BETO = "d1000000-0000-4000-8000-000000000002";
const IMPORTER = "d1000000-0000-4000-8000-000000000003";
const CANCELADO = "e1000000-0000-4000-8000-000000000001";
const ESPERA = "e1000000-0000-4000-8000-000000000002";
const CLIENT = "f1000000-0000-4000-8000-000000000001";

const lookups: CincelLookups = {
  customStatuses: {
    [CANCELADO]: { name: "Cancelado", closes: true },
    [ESPERA]: { name: "En espera", closes: false },
  },
  workflows: {
    [PRESALE]: { name: "Presale", sortOrder: 1 },
    [DISENO]: { name: "Diseño", sortOrder: 2 },
    [CONSTRUCCION]: { name: "Construcción", sortOrder: 3 },
  },
  phases: {
    [P_COBRO]: { workflowId: PRESALE, name: "Cobro", key: "cobro", sortOrder: 1 },
    [P_ANTE]: { workflowId: DISENO, name: "Anteproyecto", key: "anteproyecto", sortOrder: 1 },
    [P_EJEC]: { workflowId: DISENO, name: "Ejecutivo", key: "ejecutivo", sortOrder: 2 },
    [P_PEJEC]: { workflowId: DISENO, name: "Proyecto Ejecutivo", key: null, sortOrder: 3 },
    [P_OLD]: { workflowId: DISENO, name: "Varios", key: null, sortOrder: 4, active: false },
    [P_OBRA]: { workflowId: CONSTRUCCION, name: "Obra negra", key: "obra_negra", sortOrder: 1 },
  },
  templates: {
    [T_PLANOS]: { workflowId: DISENO, phaseId: P_ANTE },
    [T_COBRO]: { workflowId: PRESALE, phaseId: P_COBRO },
  },
  templateTitles: { [T_PLANOS]: "Planos", [T_COBRO]: "Cobro" },
  staff: {
    [ANA]: { name: "Ana", admin: true },
    [BETO]: { name: "Beto" },
    [IMPORTER]: { name: "Admin", admin: true },
  },
};

const STATUS_LABELS = ["Entregado", "Importante", "Cancelado", "Raro", "En Proceso", "En espera", "-"];

function column(id: string, title: string, type: string, settings: unknown = {}) {
  return { id, title, type, settings };
}

function status(id: string, label: string | null) {
  const index = label == null ? null : STATUS_LABELS.indexOf(label);
  return { __typename: "StatusValue", id, type: "status", text: label, label, index, is_done: false };
}

function item(
  id: string,
  name: string,
  groupId: string,
  values: Record<string, unknown>[],
  updatedAt: string | null = "2026-04-01T12:00:00Z",
) {
  return {
    id,
    name,
    state: "active",
    created_at: "2026-01-01T10:00:00Z",
    updated_at: updatedAt,
    creator_id: "11",
    group: { id: groupId },
    parent_item: null,
    assets: [],
    column_values: values,
    subitems: [],
  };
}

function exportData(): ExportData {
  const statusSettings = { labels: STATUS_LABELS.map((label, id) => ({ id, label, index: id })) };
  const columns = [
    column("name", "Elemento", "name"),
    column("status", "Estado", "status", statusSettings),
    column("prio", "Prioridad", "status", { labels: [{ id: 0, label: "Baja", index: 0 }] }),
    column("people", "Responsable", "people"),
    column("timeline", "Línea de tiempo", "timeline"),
    column("compromiso", "Compromiso", "date"),
    column("cierre", "Fecha que finalizó", "date"),
  ];
  const groups = [
    ["g_admin", "Administrativo"],
    ["g_ejec", "Ejecutivo"],
    ["g_presale", "Presale"],
    ["g_varios", "Varios"],
    ["g_sala", "Sala"],
    ["g_obra", "Obra negra"],
    ["g_skip", "Basura"],
  ].map(([id, title], i) => ({ id, title, position: String((i + 1) * 1000) }));
  const people = (...ids: string[]) => ({
    __typename: "PeopleValue",
    id: "people",
    type: "people",
    text: ids.join(", "),
    persons_and_teams: ids.map((id) => ({ id, kind: "person" })),
  });
  const date = (id: string, value: string) => ({ __typename: "DateValue", id, type: "date", text: value, date: value, time: null });
  return {
    users: [
      { id: "11", name: "Ana", email: "ana@example.com" },
      { id: "12", name: "Beto", email: "beto@example.com" },
    ],
    boards: [
      {
        board: { id: "100", name: "Casa Roble", columns, subitem_columns: [], groups },
        items: [
          item("i1", "1. Planos", "g_varios", [
            status("status", "Entregado"),
            {
              __typename: "TimelineValue",
              id: "timeline",
              type: "timeline",
              text: "2026-03-01 - 2026-03-20",
              from: "2026-03-01",
              to: "2026-03-20",
              visualization_type: null,
            },
            date("compromiso", "2026-03-15"),
            date("cierre", "2026-03-10"),
          ]),
          item("i2", "Anteproyecto final", "g_ejec", [
            status("status", "Importante"),
            { ...status("prio", "Baja") },
          ]),
          item("i3", "Planos del proyecto ejecutivo", "g_varios", [status("status", "Cancelado")]),
          item("i4", "Ejecutivos varios", "g_varios", [status("status", "Raro")]),
          item("i5", "Pagar luz", "g_admin", [people("11", "12")]),
          item("i6", "02 - Cobro", "g_presale", [status("status", "En Proceso")]),
          item("i7", "Muebles", "g_sala", [status("status", "En espera"), date("cierre", "2026-03-10")]),
          item("i8", "Colado", "g_obra", [status("status", "-")]),
          item("i9", "Nada", "g_skip", []),
          item("i10", "Raro también", "g_varios", [status("status", "Raro")], null),
        ],
      },
      {
        board: {
          id: "200",
          name: "Local Centro",
          columns: [column("name", "Elemento", "name")],
          subitem_columns: [],
          groups: [{ id: "g1", title: "General", position: "1000" }],
        },
        items: [item("j1", "1.5 m de muro", "g1", [])],
      },
    ],
  } as unknown as ExportData;
}

function mappingInput(): MappingInput {
  return {
    version: 2,
    boards: [
      {
        mondayBoardId: "100",
        name: "Casa Roble",
        strategy: "board_as_project",
        client: { kind: "contact", contactId: CLIENT },
        workflowId: DISENO,
        columns: {
          name: "title",
          status: "status",
          prio: "priority",
          people: "people",
          timeline: "timeline",
          compromiso: "commitment_date",
          cierre: "closed_date",
        },
        groupTargets: { g_sala: { kind: "space" }, g_skip: { kind: "ignore" } },
        templateMatches: { i1: T_PLANOS },
      },
      {
        mondayBoardId: "200",
        name: "Local Centro",
        strategy: "board_as_project",
        workflowId: PRESALE,
        columns: { name: "title" },
      },
    ],
    people: {
      "11": { action: "staff", staffId: ANA },
      "12": { action: "staff", staffId: BETO },
    },
    options: { includeUpdates: false, includeFiles: false },
    // The saved entry wins over the built-in default of the same label.
    statusMap: { "en proceso": { target: { status: "bloqueado" }, priority: "baja" } },
  };
}

function run(input: MappingInput = mappingInput(), l: CincelLookups = lookups): TranslateResult {
  return translate(exportData(), Mapping.parse(input), l, { importedById: IMPORTER });
}

const task = (r: TranslateResult, id: string) => {
  const t = r.tasks.find((x) => x.externalId === id);
  if (!t) throw new Error(`task ${id} not planned`);
  return t;
};
const issuesOf = (r: TranslateResult, code: string) => r.issues.filter((i) => i.code === code);

describe("translate: fase resolution order (brief §4.3)", () => {
  it("1) the item's template of the tramo gives its fase, even over the title", () => {
    expect(task(run(), "i1")).toMatchObject({
      kind: "workflow",
      templateId: T_PLANOS,
      workflowId: DISENO,
      phaseId: P_ANTE,
      phaseReview: false,
    });
  });

  it("1) a template titled like the cleaned title is matched within the task's tramo", () => {
    expect(task(run(), "i6")).toMatchObject({
      kind: "workflow",
      templateId: T_COBRO,
      workflowId: PRESALE,
      phaseId: P_COBRO,
    });
  });

  it("1) a hand-picked template of another tramo is not used; the title match still applies", () => {
    const input = mappingInput();
    input.boards[0].templateMatches = { i1: T_COBRO };
    const r = run(input);
    expect(task(r, "i1")).toMatchObject({ kind: "workflow", templateId: T_PLANOS, workflowId: DISENO, phaseId: P_ANTE });
    // T_COBRO is picked by hand for another item, so i6 isn't matched to it: its title names the fase (rule 3).
    expect(task(r, "i6")).toMatchObject({ kind: "usuario", templateId: null, workflowId: PRESALE, phaseId: P_COBRO });
  });

  it("2) the group's fase wins over a fase the title names", () => {
    expect(task(run(), "i2")).toMatchObject({ kind: "usuario", workflowId: DISENO, phaseId: P_EJEC });
  });

  it("3) the title names a fase as a whole word: the longest match wins", () => {
    expect(task(run(), "i3")).toMatchObject({ workflowId: DISENO, phaseId: P_PEJEC, phaseReview: false });
  });

  it("4) no match: no fase, flagged for review, PHASE_UNRESOLVED", () => {
    const r = run();
    expect(task(r, "i4")).toMatchObject({ workflowId: DISENO, phaseId: null, phaseReview: true });
    expect(issuesOf(r, "PHASE_UNRESOLVED")).toContainEqual(
      expect.objectContaining({ boardId: "100", itemId: "i4" }),
    );
  });

  it("a group never creates a fase; a group named like a fase of one other tramo takes it", () => {
    const r = run();
    expect(task(r, "i8")).toMatchObject({ workflowId: CONSTRUCCION, phaseId: P_OBRA });
  });

  it("phaseFromTitle: whole words by nameKey, inactive fases skipped", () => {
    expect(phaseFromTitle("Revisión EJÉCUTIVO", DISENO, lookups.phases)).toBe(P_EJEC);
    expect(phaseFromTitle("Ejecutivos", DISENO, lookups.phases)).toBeNull();
    expect(phaseFromTitle("Proyecto ejecutivo final", DISENO, lookups.phases)).toBe(P_PEJEC);
    expect(phaseFromTitle("Varios", DISENO, lookups.phases)).toBeNull();
    expect(phaseFromTitle("Cobro", DISENO, lookups.phases)).toBeNull();
  });
});

describe("translate: espacio, admin and ignored groups", () => {
  it("an Espacio group puts its tasks in a project espacio named after it; tramo and fase per task", () => {
    expect(task(run(), "i7")).toMatchObject({
      space: "Sala",
      spaceExternalId: "100:g_sala",
      workflowId: DISENO,
      phaseId: null,
      phaseReview: true,
      kind: "usuario",
    });
    expect(task(run(), "i1")).toMatchObject({ space: null, spaceExternalId: null });
  });

  it("an admin group: kind admin, no tramo, fase, espacio or template; non-admin assignees cleared", () => {
    const r = run();
    const t = task(r, "i5");
    expect(t).toMatchObject({
      kind: "admin",
      workflowId: null,
      phaseId: null,
      phaseReview: false,
      space: null,
      templateId: null,
      managerId: ANA,
    });
    expect(r.taskSupport.some((s) => s.externalId.startsWith("i5:"))).toBe(false);
    expect(t.data.columns).toEqual({ Responsable: "Beto" });
    expect(issuesOf(r, "ADMIN_ASSIGNEE_CLEARED")).toEqual([
      expect.objectContaining({ boardId: "100", itemId: "i5" }),
    ]);
    expect(issuesOf(r, "PHASE_UNRESOLVED").some((i) => i.itemId === "i5")).toBe(false);
  });

  it("an ignored group imports nothing", () => {
    expect(run().tasks.some((t) => t.externalId === "i9")).toBe(false);
  });
});

describe("translate: optional client (brief §4.4)", () => {
  it("no client: client null, one CLIENT_MISSING and the assign_client admin task", () => {
    const r = run();
    const project = r.projects.find((p) => p.externalId === "200")!;
    expect(project.client).toBeNull();
    expect(issuesOf(r, "CLIENT_MISSING")).toEqual([expect.objectContaining({ boardId: "200" })]);
    expect(issuesOf(r, "CLIENT_UNRESOLVED")).toEqual([]);
    expect(task(r, "200:assign_client")).toMatchObject({
      kind: "admin",
      systemKey: "assign_client",
      title: "Asignar cliente y origen",
      priority: "alta",
      managerId: null,
      workflowId: null,
      phaseId: null,
      project: { externalId: "200" },
    });
    // It doesn't count in the project's progress or tramos.
    expect(project).toMatchObject({ progress: 0, tramos: [PRESALE] });
  });

  it("a project with a client gets neither", () => {
    const r = run();
    expect(r.tasks.some((t) => t.externalId === "100:assign_client")).toBe(false);
    expect(issuesOf(r, "CLIENT_MISSING").some((i) => i.boardId === "100")).toBe(false);
  });
});

describe("translate: status map and defaults (brief §4.5)", () => {
  it("built-in defaults by label key (the table init and the wizard prefill from)", () => {
    const r = run();
    expect(task(r, "i1")).toMatchObject({ status: "completado", customStatusId: null });
    expect(task(r, "i8")).toMatchObject({ status: "pendiente", customStatusId: null });
  });

  it("Cancelado and En espera resolve to the seeded custom statuses by name", () => {
    const r = run();
    expect(task(r, "i3")).toMatchObject({ status: "completado", customStatusId: CANCELADO });
    expect(task(r, "i7")).toMatchObject({ status: "en_proceso", customStatusId: ESPERA });
  });

  it("the entry's priority overrides the priority column", () => {
    expect(task(run(), "i2")).toMatchObject({ status: "pendiente", priority: "alta" });
  });

  it("a saved entry wins over the default, with its priority", () => {
    expect(task(run(), "i6")).toMatchObject({ status: "bloqueado", priority: "baja" });
  });

  it("the lookups' saved map is used over the mapping snapshot", () => {
    const r = run(mappingInput(), {
      ...lookups,
      statusMap: { "en proceso": { target: { status: "completado" }, priority: null } },
    });
    expect(task(r, "i6")).toMatchObject({ status: "completado", priority: "media" });
  });

  it("an unknown label: pendiente and one STATUS_DEFAULTED per board and label", () => {
    const r = run();
    expect(task(r, "i4")).toMatchObject({ status: "pendiente", customStatusId: null });
    expect(issuesOf(r, "STATUS_DEFAULTED")).toEqual([
      {
        code: "STATUS_DEFAULTED",
        boardId: "100",
        message: 'Status label "Raro" has no equivalent; its tasks import as pendiente',
      },
    ]);
  });

  it("a default whose custom status doesn't exist falls back to pendiente + STATUS_DEFAULTED", () => {
    const r = run(mappingInput(), { ...lookups, customStatuses: {} });
    expect(task(r, "i3")).toMatchObject({ status: "pendiente", customStatusId: null });
    expect(issuesOf(r, "STATUS_DEFAULTED").map((i) => i.message)).toContain(
      'Status label "Cancelado" has no equivalent; its tasks import as pendiente',
    );
  });
});

describe("translate: dates (brief §4.6)", () => {
  it("Timeline → start, commitment and delivery; the commitment column wins", () => {
    expect(task(run(), "i1")).toMatchObject({
      start: "2026-03-01",
      commitmentDate: "2026-03-15",
      deliveryDate: "2026-03-20",
    });
  });

  it("closed_date → closedAt at the end of that day in Mexico City, for closing statuses only", () => {
    const r = run();
    expect(task(r, "i1").closedAt).toBe("2026-03-11T05:59:59.999Z");
    // En espera doesn't close: the column is ignored.
    expect(task(r, "i7").closedAt).toBeNull();
    expect(task(r, "i4").closedAt).toBeNull();
  });

  it("a closed task without the column takes the item's updated_at, else null", () => {
    const r = run();
    expect(task(r, "i3").closedAt).toBe("2026-04-01T12:00:00Z");
    const input = mappingInput();
    input.statusMap = { raro: { target: { status: "completado" } } };
    expect(task(run(input), "i10").closedAt).toBeNull();
  });

  it("endOfDayIn", () => {
    expect(endOfDayIn("2026-03-10")).toBe("2026-03-11T05:59:59.999Z");
    expect(endOfDayIn("2026-07-01", "UTC")).toBe("2026-07-01T23:59:59.999Z");
  });
});

describe("translate: titles (brief §4.7)", () => {
  it("monday numbering is stripped; the original goes to the import data source", () => {
    const r = run();
    expect(task(r, "i1").title).toBe("Planos");
    expect(task(r, "i1").data.source.originalTitle).toBe("1. Planos");
    expect(task(r, "i6").title).toBe("Cobro");
    expect(task(r, "j1").title).toBe("1.5 m de muro");
    // The row's own source stays the group's.
    expect(task(r, "i1").source).not.toHaveProperty("originalTitle");
  });
});

describe("translate: project tramos and current tramo", () => {
  it("tramos are the distinct tramos of the tasks by sort order; current = the highest", () => {
    const project = run().projects.find((p) => p.externalId === "100")!;
    expect(project).toMatchObject({
      workflowId: DISENO,
      tramos: [PRESALE, DISENO, CONSTRUCCION],
      currentWorkflowId: CONSTRUCCION,
    });
    expect(project.data.stageWorkflowIds).toEqual([PRESALE, DISENO, CONSTRUCCION]);
    expect(project).not.toHaveProperty("phases");
  });

  it("a project whose tasks have no tramo keeps the board's as current", () => {
    const input = mappingInput();
    input.boards[1].workflowId = null;
    const project = run(input).projects.find((p) => p.externalId === "200")!;
    expect(project).toMatchObject({ tramos: [], currentWorkflowId: null });
  });
});
