// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ClientRef,
  Mapping,
  StatusTarget,
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
    statusMaps: { status: { "0": { status: "pendiente" as const } } },
  };
}

function validMapping(): MappingInput {
  return {
    version: 1,
    boards: [
      {
        ...minimalBoard(),
        areaId: UUID_A,
        workflowId: null,
        client: { kind: "new", name: "Familia Lomas" },
        projectCode: "CL-01",
        projectNames: { "1001": "Casa Lomas" },
        subitemColumns: { status_sub: "status" },
        statusMaps: {
          status: {
            "0": { status: "pendiente" },
            "1": { status: "completado" },
            "2": { customStatusId: UUID_B },
          },
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
        statusMaps: {},
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
        statusMaps: {},
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
    expect(parsed.boards[0].statusMaps.status["2"]).toEqual({
      customStatusId: UUID_B,
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
      version: 1,
      boards: [minimalBoard()],
      people: {},
      options: {},
    });
    const board = parsed.boards[0];
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
      version: 1,
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
    expect(issuePaths({ ...validMapping(), version: 2 })).toEqual(["version"]);
  });

  it("rejects missing top-level fields", () => {
    expect(issuePaths({ version: 1 }).sort()).toEqual([
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

  it("rejects a status target with an unknown status", () => {
    const m = validMapping();
    m.boards[0].statusMaps = { status: { "7": { status: "hecho" as never } } };
    expect(issuePaths(m)).toEqual(["boards.0.statusMaps.status.7"]);
  });

  it("rejects a custom status target with a non-uuid id", () => {
    const m = validMapping();
    m.boards[0].statusMaps = { status: { "7": { customStatusId: "abc" } } };
    expect(issuePaths(m)).toEqual([
      "boards.0.statusMaps.status.7.customStatusId",
    ]);
  });

  it("rejects a non-uuid areaId, workflowId and template match", () => {
    const m = validMapping();
    m.boards[0] = {
      ...m.boards[0],
      areaId: "x",
      workflowId: "y",
      templateMatches: { "5001": "z" },
    };
    expect(issuePaths(m).sort()).toEqual([
      "boards.0.areaId",
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
      "boards.0.statusMaps",
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
