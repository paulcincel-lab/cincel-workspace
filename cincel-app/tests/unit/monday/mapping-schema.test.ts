// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ClientRef,
  Mapping,
  StatusTarget,
  statusLabelKey,
  type MappingInput,
} from "@/scripts/monday/mapping.schema";

const UUID_A = "6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const UUID_B = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

function minimalBoard() {
  return {
    mondayBoardId: "1001",
    name: "Casa Lomas",
    strategy: "board_as_project" as const,
    columns: { name: "title" as const, status: "status" as const },
  };
}

function validMapping(): MappingInput {
  return {
    version: 2,
    boards: [
      {
        ...minimalBoard(),
        workflowId: UUID_B,
        client: { kind: "new", name: "Familia Lomas" },
        projectCode: "CL-01",
        projectNames: { "1001": "Casa Lomas" },
        subitemColumns: { status_sub: "status", done: "closed_date" },
        groupTargets: {
          g_tramo: { kind: "tramo", workflowId: UUID_A },
          g_phase: { kind: "phase", phaseId: UUID_B },
          g_space: { kind: "space" },
          g_project: { kind: "project" },
          g_admin: { kind: "admin" },
          g_ignore: { kind: "ignore" },
        },
        subitems: "child_tasks",
        schedule: { enabled: true, planta: { columnId: "planta" } },
        templateMatches: { "5001": UUID_A },
      },
      {
        mondayBoardId: "2002",
        name: "Proveedores",
        strategy: "crm_contacts",
        contactType: "proveedor",
        providerSubtype: "material",
        contactMatches: { "7001": UUID_A },
        columns: {
          email: "contact_email",
          phone: "contact_phone",
          notes: "ignore",
        },
      },
      {
        mondayBoardId: "3003",
        name: "Obras",
        strategy: "group_as_project",
        groupClients: {
          topics: { kind: "contact", contactId: UUID_A },
          group_2: { kind: "relation_column", columnId: "connect_boards" },
        },
        projectCodes: { topics: "OB-01" },
        columns: {},
      },
    ],
    people: {
      "11": { action: "staff", staffId: UUID_A },
      "12": { action: "contact" },
      "13": { action: "contact", contactId: UUID_B },
      "14": { action: "ignore" },
      "15": null,
    },
    options: { includeUpdates: false, includeFiles: true },
    statusMap: {
      listo: { target: { status: "completado" }, priority: "alta" },
      "en espera": { target: { customStatusId: UUID_B } },
    },
  };
}

/** Paths of every issue, joined with "." for readable assertions. */
function issuePaths(input: unknown): string[] {
  const result = Mapping.safeParse(input);
  expect(result.success).toBe(false);
  return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
}

describe("Mapping", () => {
  it("parses a full valid mapping", () => {
    const parsed = Mapping.parse(validMapping());
    expect(parsed.boards).toHaveLength(3);
    expect(parsed.boards[0].groupTargets.g_phase).toEqual({
      kind: "phase",
      phaseId: UUID_B,
    });
    expect(Object.keys(parsed.boards[0].groupTargets)).toHaveLength(6);
    expect(parsed.boards[0].subitemColumns.done).toBe("closed_date");
    expect(parsed.statusMap["en espera"]).toEqual({
      target: { customStatusId: UUID_B },
      priority: null,
    });
    expect(parsed.boards[0].schedule).toEqual({
      enabled: true,
      planta: { columnId: "planta" },
    });
    expect(parsed.people["15"]).toBeNull();
    expect(parsed.options.includeUpdates).toBe(false);
  });

  it("applies the documented defaults", () => {
    const parsed = Mapping.parse({
      version: 2,
      boards: [minimalBoard()],
      people: {},
      options: {},
    });
    expect(parsed.statusMap).toEqual({});
    const board = parsed.boards[0];
    expect(board.groupTargets).toEqual({});
    expect(board.contactMatches).toEqual({});
    expect(board.projectNames).toEqual({});
    expect(board.projectCodes).toEqual({});
    expect(board.subitemColumns).toEqual({});
    expect(board.subitems).toBe("checklist");
    expect(board.schedule).toEqual({
      enabled: false,
      planta: { fixed: "General" },
    });
    expect(board.templateMatches).toEqual({});
    expect(parsed.options).toEqual({
      includeUpdates: true,
      includeFiles: true,
    });
  });

  it("defaults schedule.planta and ClientRef new.contactKind", () => {
    const parsed = Mapping.parse({
      version: 2,
      boards: [
        {
          ...minimalBoard(),
          schedule: { enabled: true },
          client: { kind: "new", name: "X" },
        },
      ],
      people: {},
      options: {},
    });
    expect(parsed.boards[0].schedule.planta).toEqual({ fixed: "General" });
    expect(parsed.boards[0].client).toEqual({
      kind: "new",
      name: "X",
      contactKind: "empresa",
    });
  });

  it("rejects a wrong version", () => {
    expect(issuePaths({ ...validMapping(), version: 1 })).toEqual(["version"]);
  });

  it.each(["areaId", "taskAreaSource", "taskAreas", "statusMaps"])(
    "rejects the removed board field %s",
    (field) => {
      const m = validMapping();
      m.boards[0] = { ...m.boards[0], [field]: field === "areaId" ? UUID_A : {} } as never;
      expect(issuePaths(m)).toEqual([`boards.0.${field}`]);
    },
  );

  it("rejects the v1 group kinds", () => {
    for (const target of [
      { kind: "stage", workflowId: UUID_A },
      { kind: "workflow_phase", phase: "Planos" },
    ]) {
      const m = validMapping();
      m.boards[0].groupTargets = { g: target as never };
      expect(issuePaths(m)).toEqual(["boards.0.groupTargets.g.kind"]);
    }
  });

  it("rejects a phase target without a uuid phaseId", () => {
    const m = validMapping();
    m.boards[0].groupTargets = { g: { kind: "phase" } as never };
    expect(issuePaths(m)).toEqual(["boards.0.groupTargets.g.phaseId"]);
  });

  it("rejects a status map entry with an unknown priority", () => {
    const m = validMapping();
    m.statusMap = { listo: { target: { status: "completado" }, priority: "urgente" as never } };
    expect(issuePaths(m)).toEqual(["statusMap.listo.priority"]);
  });

  it("rejects missing top-level fields", () => {
    expect(issuePaths({ version: 2 }).sort()).toEqual([
      "boards",
      "options",
      "people",
    ]);
  });

  it("rejects an unknown strategy with the board path", () => {
    const m = validMapping();
    m.boards[1] = { ...m.boards[1], strategy: "board_as_contacts" as never };
    expect(issuePaths(m)).toEqual(["boards.1.strategy"]);
  });

  it("rejects an unknown column target", () => {
    const m = validMapping();
    m.boards[0].columns = { name: "titulo" as never };
    expect(issuePaths(m)).toEqual(["boards.0.columns.name"]);
  });

  it("rejects an unknown subitem column target", () => {
    const m = validMapping();
    m.boards[0].subitemColumns = { s: "nope" as never };
    expect(issuePaths(m)).toEqual(["boards.0.subitemColumns.s"]);
  });

  it("rejects a status map target with an unknown status", () => {
    const m = validMapping();
    m.statusMap = { hecho: { target: { status: "hecho" as never } } };
    expect(issuePaths(m)).toEqual(["statusMap.hecho.target"]);
  });

  it("rejects a status map custom status with a non-uuid id", () => {
    const m = validMapping();
    m.statusMap = { hecho: { target: { customStatusId: "abc" } } };
    expect(issuePaths(m)).toEqual(["statusMap.hecho.target.customStatusId"]);
  });

  it("rejects a non-uuid workflowId and template match", () => {
    const m = validMapping();
    m.boards[0] = {
      ...m.boards[0],
      workflowId: "y",
      templateMatches: { "5001": "z" },
    };
    expect(issuePaths(m).sort()).toEqual([
      "boards.0.templateMatches.5001",
      "boards.0.workflowId",
    ]);
  });

  it("rejects a non-uuid contact match", () => {
    const m = validMapping();
    m.boards[1].contactMatches = { "7001": "not-a-uuid" };
    expect(issuePaths(m)).toEqual(["boards.1.contactMatches.7001"]);
  });

  it("rejects an unknown contactType", () => {
    const m = validMapping();
    m.boards[1].contactType = "cliente_final" as never;
    expect(issuePaths(m)).toEqual(["boards.1.contactType"]);
  });

  it("rejects an unknown subitems mode", () => {
    const m = validMapping();
    m.boards[0].subitems = "tasks" as never;
    expect(issuePaths(m)).toEqual(["boards.0.subitems"]);
  });

  it("rejects an empty fixed planta", () => {
    const m = validMapping();
    m.boards[0].schedule = { enabled: true, planta: { fixed: "" } };
    expect(issuePaths(m)).toEqual(["boards.0.schedule.planta.fixed"]);
  });

  it("rejects a schedule without enabled", () => {
    const m = validMapping();
    m.boards[0].schedule = {} as never;
    expect(issuePaths(m)).toEqual(["boards.0.schedule.enabled"]);
  });

  it("rejects a client with an unknown kind", () => {
    const m = validMapping();
    m.boards[0].client = { kind: "existing", contactId: UUID_A } as never;
    expect(issuePaths(m)).toEqual(["boards.0.client.kind"]);
  });

  it("rejects a new client with an empty name", () => {
    const m = validMapping();
    m.boards[0].client = { kind: "new", name: "" };
    expect(issuePaths(m)).toEqual(["boards.0.client.name"]);
  });

  it("rejects a group client with a non-uuid contact", () => {
    const m = validMapping();
    m.boards[2].groupClients = {
      topics: { kind: "contact", contactId: "nope" },
    };
    expect(issuePaths(m)).toEqual(["boards.2.groupClients.topics.contactId"]);
  });

  it("rejects a staff person without a uuid staffId", () => {
    const m = validMapping();
    m.people["11"] = { action: "staff", staffId: "s-1" };
    expect(issuePaths(m)).toEqual(["people.11.staffId"]);
  });

  it("rejects an unknown person action", () => {
    const m = validMapping();
    m.people["11"] = { action: "guest" } as never;
    expect(issuePaths(m)).toEqual(["people.11"]);
  });

  it("rejects non-boolean options", () => {
    const m = validMapping();
    m.options = { includeUpdates: "yes" as never };
    expect(issuePaths(m)).toEqual(["options.includeUpdates"]);
  });

  it("rejects a board missing its required fields", () => {
    const m = validMapping();
    m.boards[0] = { name: "Sin id" } as never;
    expect(issuePaths(m).sort()).toEqual([
      "boards.0.columns",
      "boards.0.mondayBoardId",
      "boards.0.strategy",
    ]);
  });
});

describe("ClientRef", () => {
  it("parses each kind", () => {
    expect(ClientRef.parse({ kind: "contact", contactId: UUID_A })).toEqual({
      kind: "contact",
      contactId: UUID_A,
    });
    expect(
      ClientRef.parse({ kind: "relation_column", columnId: "c1" }),
    ).toEqual({
      kind: "relation_column",
      columnId: "c1",
    });
    expect(
      ClientRef.parse({ kind: "new", name: "N", contactKind: "particular" })
        .kind,
    ).toBe("new");
  });
});

describe("StatusTarget", () => {
  it("accepts either a status or a custom status id", () => {
    expect(StatusTarget.parse({ status: "bloqueado" })).toEqual({
      status: "bloqueado",
    });
    expect(StatusTarget.parse({ customStatusId: UUID_A })).toEqual({
      customStatusId: UUID_A,
    });
  });

  it("rejects an empty target", () => {
    expect(StatusTarget.safeParse({}).success).toBe(false);
  });
});

describe("statusLabelKey", () => {
  it("trims, lower-cases and collapses spaces", () => {
    expect(statusLabelKey("  En   Proceso ")).toBe("en proceso");
    expect(statusLabelKey("Listo")).toBe("listo");
    expect(statusLabelKey("En\tespera\n")).toBe("en espera");
  });

  it("is stable: the key of a key is itself", () => {
    for (const label of ["Listo", " Trabajando en ello ", "ATORADO", "Revisión  cliente"]) {
      const key = statusLabelKey(label);
      expect(statusLabelKey(key)).toBe(key);
    }
  });

  it("keeps accents, so labels that differ only by them stay distinct", () => {
    expect(statusLabelKey("Revisión")).toBe("revisión");
    expect(statusLabelKey("Revisión")).not.toBe(statusLabelKey("Revision"));
  });
});
