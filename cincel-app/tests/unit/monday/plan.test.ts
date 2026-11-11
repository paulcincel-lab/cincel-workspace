// @vitest-environment node
/**
 * scripts/monday/plan.ts (BE §6, §11, §12 #2; project flow BE §10.4, §16): the dry run.
 *
 * Runs against the translate fixtures with fake Cincel lookups and a fake
 * Drive. The command tests write the nested fixture out as an export folder.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import type { DriveAdmin } from "@/lib/google/drive-admin";
import type { ImportDb, ImportEntity } from "@/lib/import/refs";
import fixture from "@/scripts/monday/__fixtures__/translate-export.json";
import nestedFixture from "@/scripts/monday/__fixtures__/translate-nested-export.json";
import type { MondayDbHandle } from "@/scripts/monday/db";
import type { MappingInput } from "@/scripts/monday/mapping.schema";
import {
  BLOCKING_CODES,
  buildPlan,
  checkDriveConfigured,
  createPlanCommand,
  createPlanDbLookups,
  formatPlanMarkdown,
  parsePlanArgs,
  PLAN_FILE,
  readPlanExport,
  WARNING_CODES,
  type Plan,
  type PlanIssueCode,
  type PlanLookups,
} from "@/scripts/monday/plan";
import type { CliIo } from "@/scripts/monday/run";
import type { CincelLookups, ExportData } from "@/scripts/monday/translate";

const ANA = "11111111-1111-4111-8111-111111111111";
const BETO = "22222222-2222-4222-8222-222222222222";
const CUSTOM_OPEN = "44444444-4444-4444-8444-444444444444";
const CUSTOM_CLOSES = "55555555-5555-4555-8555-555555555555";
const TEMPLATE = "66666666-6666-4666-8666-666666666666";
const WORKFLOW = "77777777-7777-4777-8777-777777777777";
const BOARD_WORKFLOW = "88888888-8888-4888-8888-888888888888";
const SOL = "99999999-9999-4999-8999-999999999999";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PHASE_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PHASE_B = "b0000000-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GONE_STATUS = "f0000000-0000-4000-8000-0000000000aa";
const OTHER_WORKFLOW = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ROW = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PROVEEDOR = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface FakeDb {
  translate: CincelLookups;
  /** id → type */
  contacts: Record<string, "cliente" | "socio" | "proveedor">;
  /** existing contacts by type: lower(name) */
  contactNames: { type: "cliente" | "socio" | "proveedor"; name: string }[];
  projects: {
    name: string;
    code: string | null;
    status?: "activo" | "pausado" | "completado" | "cancelado";
  }[];
  workflows: string[];
  /** entity → externalId → row id */
  refs: Partial<Record<ImportEntity, Record<string, string>>>;
  assets: string[];
  tasks: { projectId: string; templateId: string }[];
  /** project ids with a project_schedules row not in import_refs */
  foreignSchedules: string[];
}

/** The project flow lookups (BE §10.3): tramos with fases, templates by fase, the saved status map. */
function translateLookups(): CincelLookups {
  return {
    customStatuses: {
      [CUSTOM_OPEN]: { name: "Revisión cliente", closes: false },
      [CUSTOM_CLOSES]: { name: "Hecho", closes: true },
    },
    statuses: { "revision cliente": CUSTOM_OPEN, hecho: CUSTOM_CLOSES },
    templates: { [TEMPLATE]: { workflowId: BOARD_WORKFLOW, phaseId: PHASE_A } },
    templateTitles: { [TEMPLATE]: "Cimentación" },
    phases: {
      [PHASE_A]: { workflowId: BOARD_WORKFLOW, name: "Estructura", key: null, sortOrder: 1 },
      [PHASE_B]: { workflowId: BOARD_WORKFLOW, name: "Albañilería", key: null, sortOrder: 2 },
    },
    staff: { [ANA]: { name: "Ana", admin: false }, [BETO]: { name: "Beto", admin: false } },
    workflows: {
      [WORKFLOW]: { name: "Presale", sortOrder: 1 },
      [BOARD_WORKFLOW]: { name: "Construcción", sortOrder: 3 },
      [OTHER_WORKFLOW]: { name: "Decoración", sortOrder: 4 },
    },
    statusMap: {
      pendiente: { target: { status: "pendiente" }, priority: null },
      listo: { target: { status: "completado" }, priority: null },
      detenido: { target: { status: "bloqueado" }, priority: null },
      "revisión cliente": { target: { customStatusId: CUSTOM_OPEN }, priority: null },
      "en curso": { target: { status: "en_proceso" }, priority: null },
    },
  };
}

function fakeDb(overrides: Partial<FakeDb> = {}): FakeDb {
  return {
    translate: translateLookups(),
    contacts: {
      [CLIENT]: "cliente",
      [SOL]: "cliente",
      [PROVEEDOR]: "proveedor",
    },
    contactNames: [],
    projects: [],
    workflows: [WORKFLOW, BOARD_WORKFLOW, OTHER_WORKFLOW],
    refs: {},
    assets: [],
    tasks: [],
    foreignSchedules: [],
    ...overrides,
  };
}

function lookupsOf(db: FakeDb): PlanLookups {
  return {
    translateLookups: async () => db.translate,
    importedRefs: async (entity, ids) =>
      new Map(
        ids.flatMap((id) =>
          db.refs[entity]?.[id] ? [[id, db.refs[entity]![id]] as const] : [],
        ),
      ),
    importedAssets: async (ids) =>
      new Set(ids.filter((id) => db.assets.includes(id))),
    contactTypes: async (ids) =>
      new Map(
        ids.flatMap((id) =>
          db.contacts[id] ? [[id, db.contacts[id]] as const] : [],
        ),
      ),
    contactNamesTaken: async (type, names) =>
      new Set(
        names.filter((n) =>
          db.contactNames.some(
            (c) => c.type === type && c.name.toLowerCase() === n,
          ),
        ),
      ),
    projectNamesTaken: async (names) =>
      new Set(
        names.filter((n) =>
          db.projects.some(
            (x) =>
              ["activo", "pausado"].includes(x.status ?? "activo") &&
              x.name.toLowerCase() === n,
          ),
        ),
      ),
    projectCodesTaken: async (codes) =>
      new Set(codes.filter((c) => db.projects.some((p) => p.code === c))),
    workflowIds: async (ids) =>
      new Set(ids.filter((id) => db.workflows.includes(id))),
    projectTemplatesTaken: async (pairs) =>
      new Set(
        pairs
          .filter((p) =>
            db.tasks.some(
              (t) =>
                t.projectId === p.projectId && t.templateId === p.templateId,
            ),
          )
          .map((p) => `${p.projectId}|${p.templateId}`),
      ),
    foreignSchedules: async (ids) =>
      new Set(ids.filter((id) => db.foreignSchedules.includes(id))),
  };
}

// ---------------------------------------------------------------------------
// Fixtures and mappings
// ---------------------------------------------------------------------------

/** translate-export.json without item 6003, whose relation column links no client. */
function exportData(): ExportData {
  const data = structuredClone(fixture) as unknown as ExportData;
  const obras = data.boards.find((b) => b.board.id === "501")!;
  obras.items = obras.items.filter((i) => i.id !== "6003");
  return data;
}
const nestedData = () =>
  structuredClone(nestedFixture) as unknown as ExportData;

/** A clean mapping of translate-export.json. */
function mappingInput(): MappingInput {
  return {
    version: 2,
    boards: [
      {
        mondayBoardId: "301",
        name: "Casa Lomas",
        strategy: "board_as_project",
        client: { kind: "contact", contactId: CLIENT },
        projectCode: "CL-01",
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
      },
      {
        mondayBoardId: "501",
        name: "Obras 2026",
        strategy: "item_as_project",
        client: { kind: "relation_column", columnId: "rel" },
        workflowId: BOARD_WORKFLOW,
        projectNames: { "6002": "Casa Sol (Polanco)" },
        projectCodes: { "6001": "OB-RUIZ" },
        columns: { name: "title", rel: "client" },
        subitemColumns: { name: "title", sstatus: "status" },
      },
      {
        mondayBoardId: "601",
        name: "Proveedores",
        strategy: "crm_contacts",
        contactType: "proveedor",
        providerSubtype: "contratista",
        columns: { name: "title" },
      },
      {
        mondayBoardId: "701",
        name: "Remodelaciones",
        strategy: "group_as_project",
        groupClients: { ga: { kind: "new", name: "Familia Pérez" } },
        client: { kind: "new", name: "Familia López" },
        workflowId: BOARD_WORKFLOW,
        columns: { name: "title" },
      },
    ],
    people: {
      "11": { action: "staff", staffId: ANA },
      "12": { action: "staff", staffId: BETO },
      "13": { action: "contact" },
      "14": { action: "ignore" },
    },
    options: { includeUpdates: true, includeFiles: false },
  };
}

/** The mapping of translate-nested-export.json (checklist, child tasks, item_as_project, crm). */
function nestedMapping(): MappingInput {
  return {
    version: 2,
    boards: [
      {
        mondayBoardId: "901",
        name: "Casa Nido",
        strategy: "board_as_project",
        client: { kind: "contact", contactId: CLIENT },
        workflowId: BOARD_WORKFLOW,
        columns: {
          name: "title",
          status: "status",
          people: "people",
          timeline: "timeline",
          costo: "import_data",
          planta: "ignore",
        },
        subitemColumns: { name: "title", sstatus: "status" },
        subitems: "checklist",
        schedule: { enabled: true, planta: { columnId: "planta" } },
      },
      {
        mondayBoardId: "902",
        name: "Casa Faro",
        strategy: "board_as_project",
        client: { kind: "contact", contactId: CLIENT },
        workflowId: BOARD_WORKFLOW,
        columns: { name: "title", status: "status" },
        subitemColumns: { name: "title", sstatus: "status" },
        subitems: "child_tasks",
      },
      {
        mondayBoardId: "903",
        name: "Obras",
        strategy: "item_as_project",
        client: { kind: "contact", contactId: CLIENT },
        workflowId: BOARD_WORKFLOW,
        columns: { name: "title", presupuesto: "import_data" },
        subitemColumns: { name: "title" },
      },
      {
        mondayBoardId: "904",
        name: "Clientes",
        strategy: "crm_contacts",
        contactType: "cliente",
        columns: { name: "title", rfc: "import_data" },
      },
    ],
    people: {
      "11": { action: "staff", staffId: ANA },
      "14": { action: "ignore" },
    },
    options: { includeUpdates: true, includeFiles: true },
  };
}

const driveOk = async () => null;

function plan(
  input: MappingInput | unknown = mappingInput(),
  db: FakeDb = fakeDb(),
  data: ExportData = exportData(),
  options: Parameters<typeof buildPlan>[3] = { checkDrive: driveOk },
) {
  return buildPlan(data, input, lookupsOf(db), options);
}

const codes = (p: Plan) => [...new Set(p.issues.map((i) => i.code))].sort();
const blocking = (p: Plan) => p.issues.filter((i) => i.blocking);
const ofCode = (p: Plan, code: PlanIssueCode) =>
  p.issues.filter((i) => i.code === code);

function board(input: MappingInput, id: string) {
  const b = input.boards.find((x) => x.mondayBoardId === id);
  if (!b) throw new Error(`board ${id}`);
  return b;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("plan: codes", () => {
  it("blocking and warning codes are the spec's (BE §6, project flow BE §10.4)", () => {
    expect([...BLOCKING_CODES]).toEqual([
      "MAPPING_INVALID",
      "CLIENT_UNRESOLVED",
      "CONTACT_NAME_TAKEN",
      "PROJECT_NAME_TAKEN",
      "PROJECT_CODE_TAKEN",
      "STATUS_UNMAPPED",
      "TEMPLATE_COLLISION",
      "TEMPLATE_INVALID",
      "PROVIDER_SUBTYPE_MISSING",
      "SCHEDULE_EXISTS",
      "DRIVE_NOT_CONFIGURED",
      "TRAMO_MISSING",
    ]);
    expect([...WARNING_CODES]).toEqual([
      "PERSON_UNMATCHED",
      "RELATION_MISSING",
      "DATES_MISSING",
      "FILE_MISSING",
      "STATUS_DEFAULTED",
      "PHASE_UNRESOLVED",
      "CLIENT_MISSING",
      "ADMIN_ASSIGNEE_CLEARED",
    ]);
  });

  it("has no área codes left, so no área warning is possible", () => {
    const all: string[] = [...BLOCKING_CODES, ...WARNING_CODES];
    expect(all.filter((c) => c.startsWith("AREA_"))).toEqual([]);
  });

  it("every issue carries its code as its group", async () => {
    const p = await plan();
    expect(p.issues.length).toBeGreaterThan(0);
    for (const i of p.issues) expect(i.group).toBe(i.code);
  });
});

describe("plan: counts", () => {
  it("matches the hand-counted nested fixture totals per board", async () => {
    const p = await plan(nestedMapping(), fakeDb(), nestedData());
    const by = Object.fromEntries(p.boards.map((b) => [b.boardId, b]));
    // 901: 1 project; tasks 2001-2003; subitems Aplanado, Fino, Pintura as
    // child tasks, the old checklist mode (#1046) (Borrado is deleted); comments u1, r1, u2, u8 (u3 is empty, u4 is on a
    // deleted subitem); files a1, a2, a3, a7 (a9 isn't in the index);
    // cronograma 2001, 2002 (2003 has no timeline).
    expect(by["901"]).toMatchObject({
      contacts: 0,
      projects: 1,
      tasks: 3,
      childTasks: 3,
      checklistItems: 0,
      dependencies: 0,
      comments: 4,
      cronogramaRows: 2,
      files: 4,
      skipped: 0,
    });
    // 902: 1 project; Instalaciones + children Eléctrica, Tablero, Breakers,
    // Hidráulica (flattened); comment u5; file a4.
    expect(by["902"]).toMatchObject({
      projects: 1,
      tasks: 1,
      childTasks: 4,
      checklistItems: 0,
      comments: 1,
      cronogramaRows: 0,
      files: 1,
    });
    // 903: item Casa Mar → project, subitem Demolición → task; u6; a5 as a project link.
    expect(by["903"]).toMatchObject({
      projects: 1,
      tasks: 1,
      comments: 1,
      files: 1,
    });
    // 904: Familia Mar → contact, u7; a6 has nowhere to go (contacts take no files).
    expect(by["904"]).toMatchObject({
      contacts: 1,
      projects: 0,
      tasks: 0,
      comments: 1,
      files: 0,
    });
    expect(p.totals).toMatchObject({
      contacts: 1,
      projects: 3,
      tasks: 5,
      childTasks: 7,
      checklistItems: 0,
      comments: 7,
      cronogramaRows: 2,
      files: 6,
      skipped: 0,
      projectSchedules: 1,
    });
    expect(blocking(p)).toEqual([]);
  });

  it("counts rows already in import_refs as skipped, not to create", async () => {
    const p = await plan(
      nestedMapping(),
      fakeDb({
        refs: {
          project: { "902": ROW },
          task: { "3001": ROW, "3101": ROW },
          history_event: { u5: ROW },
          contact: { "5001": ROW },
        },
        assets: ["a4", "a1"],
      }),
      nestedData(),
    );
    const by = Object.fromEntries(p.boards.map((b) => [b.boardId, b]));
    expect(by["902"]).toMatchObject({
      projects: 0,
      tasks: 0,
      childTasks: 3,
      comments: 0,
      files: 0,
      skipped: 5,
    });
    expect(by["901"]).toMatchObject({ files: 3, skipped: 1 });
    expect(by["904"]).toMatchObject({ contacts: 0, skipped: 1 });
    expect(p.totals.skipped).toBe(7);
  });

  it("writes the counts and issues into plan.md", async () => {
    const p = await plan(nestedMapping(), fakeDb(), nestedData());
    const md = formatPlanMarkdown(
      p,
      "/exports/acme",
      new Date("2026-10-30T12:00:00Z"),
    );
    expect(md).toContain(
      "| 901 | Casa Nido | board_as_project | 0 | 1 | 3 | 3 | 0 | 0 | 4 | 2 | 4 | 0 |",
    );
    expect(md).toContain("**Clean:**");
    expect(md).toMatch(/### DATES_MISSING \(\d+\)/);
    expect(md).toMatch(/### FILE_MISSING \(\d+\)/);
    expect(md).toContain("| 901 | 2003 |");
    expect(md).toContain("| 901 | 2002 |");
  });
});

describe("plan: the clean fixture", () => {
  it("has no blocking issues and only translate's warnings", async () => {
    const p = await plan();
    expect(blocking(p)).toEqual([]);
    expect(codes(p)).toContain("RELATION_MISSING");
    for (const code of codes(p)) expect(WARNING_CODES).toContain(code);
  });
});

describe("plan: blocking issues (each cleared by editing the mapping)", () => {
  it("MAPPING_INVALID: Zod path and message, with the board id", async () => {
    const input = mappingInput() as { boards: Record<string, unknown>[] };
    input.boards[0].strategy = "everything";
    const p = await plan(input);
    expect(p.boards).toEqual([]);
    expect(p.issues).toEqual([
      expect.objectContaining({
        code: "MAPPING_INVALID",
        blocking: true,
        boardId: "301",
        message: expect.stringMatching(/^boards\.0\.strategy: /),
      }),
    ]);
    expect(blocking(await plan(mappingInput()))).toEqual([]);
  });

  it("MAPPING_INVALID: references that don't exist", async () => {
    const input = mappingInput();
    board(input, "301").workflowId = "f0000000-0000-4000-8000-000000000001";
    board(input, "401").contactMatches = { "5002": PROVEEDOR };
    const p = await plan(input);
    expect(ofCode(p, "MAPPING_INVALID")).toEqual([
      expect.objectContaining({
        boardId: "301",
        message: expect.stringContaining("workflowId"),
      }),
      expect.objectContaining({
        boardId: "401",
        itemId: "5002",
        message: expect.stringContaining("not a cliente"),
      }),
    ]);
  });

  it("MAPPING_INVALID: a group mapped to a tramo that doesn't exist", async () => {
    const input = mappingInput();
    board(input, "301").groupTargets = {
      g_obra: { kind: "tramo", workflowId: "f0000000-0000-4000-8000-000000000002" },
      g_diseno: { kind: "tramo", workflowId: OTHER_WORKFLOW },
    };
    const p = await plan(input);
    expect(ofCode(p, "MAPPING_INVALID")).toEqual([
      expect.objectContaining({
        boardId: "301",
        message: expect.stringContaining("groupTargets.g_obra"),
      }),
    ]);
  });

  it("CLIENT_UNRESOLVED: a chosen client that isn't a live cliente", async () => {
    const p = await plan();
    expect(ofCode(p, "CLIENT_UNRESOLVED")).toEqual([]);
    const input = mappingInput();
    board(input, "301").client = { kind: "contact", contactId: PROVEEDOR };
    const bad = await plan(input);
    expect(
      ofCode(bad, "CLIENT_UNRESOLVED").map((i) => [
        i.boardId,
        i.itemId ?? null,
      ]),
    ).toEqual([["301", null]]);
    // The project was imported before: apply leaves its client alone.
    const again = await plan(input, fakeDb({ refs: { project: { "301": ROW } } }));
    expect(ofCode(again, "CLIENT_UNRESOLVED")).toEqual([]);
  });

  it("CONTACT_NAME_TAKEN: an existing contact, or twice in the import", async () => {
    const db = fakeDb({
      contactNames: [{ type: "cliente", name: "Familia Ruiz" }],
    });
    const taken = await plan(mappingInput(), db);
    expect(ofCode(taken, "CONTACT_NAME_TAKEN")).toEqual([
      expect.objectContaining({
        boardId: "401",
        itemId: "5001",
        message: expect.stringContaining("exists already"),
      }),
    ]);
    // Fixed with contactMatches (reuse the existing contact).
    const fixed = mappingInput();
    board(fixed, "401").contactMatches = { "5002": SOL, "5001": CLIENT };
    expect(ofCode(await plan(fixed, db), "CONTACT_NAME_TAKEN")).toEqual([]);

    const twice = mappingInput();
    board(twice, "701").client = { kind: "new", name: "familia ruiz" };
    expect(ofCode(await plan(twice), "CONTACT_NAME_TAKEN")).toEqual([
      expect.objectContaining({
        boardId: "401",
        message: expect.stringContaining("2 new cliente contacts"),
      }),
    ]);
  });

  it("PROJECT_NAME_TAKEN: a live active or paused project, or twice in the import", async () => {
    const db = fakeDb({
      projects: [{ name: "casa lomas", code: null, status: "activo" }],
    });
    const taken = await plan(mappingInput(), db);
    expect(ofCode(taken, "PROJECT_NAME_TAKEN")).toEqual([
      expect.objectContaining({
        boardId: "301",
        blocking: true,
        message: expect.stringContaining('"Casa Lomas"'),
      }),
    ]);
    // Firm-wide: the existing project needn't share the client.
    const paused = fakeDb({
      projects: [{ name: "CASA LOMAS", code: null, status: "pausado" }],
    });
    expect(ofCode(await plan(mappingInput(), paused), "PROJECT_NAME_TAKEN")).toHaveLength(1);
    // Archived projects free their name.
    const archived = fakeDb({
      projects: [
        { name: "Casa Lomas", code: null, status: "completado" },
        { name: "Casa Lomas", code: null, status: "cancelado" },
      ],
    });
    expect(ofCode(await plan(mappingInput(), archived), "PROJECT_NAME_TAKEN")).toEqual([]);
    // Cleared by renaming it.
    const fixed = mappingInput();
    board(fixed, "301").projectNames = { "301": "Casa Lomas (monday)" };
    expect(ofCode(await plan(fixed, db), "PROJECT_NAME_TAKEN")).toEqual([]);
    // The project is the one imported before: no issue.
    const reimported = fakeDb({
      projects: db.projects,
      refs: { project: { "301": ROW } },
    });
    expect(ofCode(await plan(mappingInput(), reimported), "PROJECT_NAME_TAKEN")).toEqual([]);
  });

  it("PROJECT_NAME_TAKEN: two planned projects with one name, even of different clients", async () => {
    const twice = mappingInput();
    board(twice, "701").projectNames = { ga: "Depto", gb: "depto" };
    const dup = await plan(twice);
    expect(ofCode(dup, "PROJECT_NAME_TAKEN")).toEqual([
      expect.objectContaining({
        boardId: "701",
        blocking: true,
        message: expect.stringContaining("2 new projects"),
      }),
    ]);
    // Across boards too: 701's group named like board 301's project.
    const across = mappingInput();
    board(across, "701").projectNames = { ga: "Casa Lomas" };
    expect(ofCode(await plan(across), "PROJECT_NAME_TAKEN")).toEqual([
      expect.objectContaining({ message: expect.stringContaining("2 new projects") }),
    ]);
  });

  it("PROJECT_CODE_TAKEN: an existing code, or twice in the import", async () => {
    const db = fakeDb({
      projects: [{ name: "Otro", code: "OB-RUIZ" }],
    });
    expect(
      ofCode(await plan(mappingInput(), db), "PROJECT_CODE_TAKEN"),
    ).toEqual([expect.objectContaining({ boardId: "501", itemId: "6001" })]);
    const twice = mappingInput();
    board(twice, "501").projectCodes = { "6001": "CL-01" };
    expect(ofCode(await plan(twice), "PROJECT_CODE_TAKEN")).toEqual([
      expect.objectContaining({
        message: expect.stringContaining("repeats in 2"),
      }),
    ]);
    expect(ofCode(await plan(), "PROJECT_CODE_TAKEN")).toEqual([]);
  });

  it("STATUS_UNMAPPED: a saved status map entry whose custom status is gone", async () => {
    const db = fakeDb();
    db.translate.statusMap!["revisión cliente"] = {
      target: { customStatusId: GONE_STATUS },
      priority: null,
    };
    expect(ofCode(await plan(mappingInput(), db), "STATUS_UNMAPPED")).toEqual([
      expect.objectContaining({ boardId: "301", itemId: "1002" }),
    ]);
  });

  it("TEMPLATE_COLLISION: two items, or an item and an existing task, on one template", async () => {
    const input = mappingInput();
    board(input, "301").templateMatches = {
      "1003": TEMPLATE,
      "1004": TEMPLATE,
    };
    expect(ofCode(await plan(input), "TEMPLATE_COLLISION")).toEqual([
      expect.objectContaining({ boardId: "301", itemId: "1004" }),
    ]);
    // The project was imported before; its existing task already has the template.
    const db = fakeDb({
      refs: { project: { "301": ROW } },
      tasks: [{ projectId: ROW, templateId: TEMPLATE }],
    });
    expect(
      ofCode(await plan(mappingInput(), db), "TEMPLATE_COLLISION"),
    ).toEqual([expect.objectContaining({ boardId: "301", itemId: "1003" })]);
  });

  it("TEMPLATE_INVALID: a template that doesn't exist", async () => {
    const unknown = mappingInput();
    board(unknown, "301").templateMatches = {
      "1003": "f0000000-0000-4000-8000-000000000002",
    };
    expect(ofCode(await plan(unknown), "TEMPLATE_INVALID")).toHaveLength(1);
    expect(ofCode(await plan(), "TEMPLATE_INVALID")).toEqual([]);
  });

  it("PROVIDER_SUBTYPE_MISSING: proveedor without a valid subtype", async () => {
    const missing = mappingInput();
    delete board(missing, "601").providerSubtype;
    const wrong = mappingInput();
    board(wrong, "601").providerSubtype = "carpintero";
    expect(ofCode(await plan(missing), "PROVIDER_SUBTYPE_MISSING")).toEqual([
      expect.objectContaining({ boardId: "601" }),
    ]);
    expect(
      ofCode(await plan(wrong), "PROVIDER_SUBTYPE_MISSING")[0].message,
    ).toContain('"carpintero"');
  });

  it("SCHEDULE_EXISTS: a cronograma not created by this import", async () => {
    const db = fakeDb({
      refs: { project: { "901": ROW } },
      foreignSchedules: [ROW],
    });
    expect(
      ofCode(await plan(nestedMapping(), db, nestedData()), "SCHEDULE_EXISTS"),
    ).toEqual([expect.objectContaining({ boardId: "901", blocking: true })]);
    const off = nestedMapping();
    board(off, "901").schedule = { enabled: false };
    expect(
      ofCode(await plan(off, db, nestedData()), "SCHEDULE_EXISTS"),
    ).toEqual([]);
    // The cronograma came from this import: skipped, not an issue.
    const own = fakeDb({
      refs: { project: { "901": ROW }, project_schedule: { "901": ROW } },
    });
    expect(
      ofCode(await plan(nestedMapping(), own, nestedData()), "SCHEDULE_EXISTS"),
    ).toEqual([]);
  });

  it("DRIVE_NOT_CONFIGURED: only while files are on", async () => {
    const checkDrive = vi.fn(async () => "GOOGLE_SHARED_DRIVE_ID is not set");
    const p = await plan(nestedMapping(), fakeDb(), nestedData(), {
      checkDrive,
    });
    expect(ofCode(p, "DRIVE_NOT_CONFIGURED")).toEqual([
      expect.objectContaining({
        blocking: true,
        message: "GOOGLE_SHARED_DRIVE_ID is not set",
      }),
    ]);
    const off = nestedMapping();
    off.options.includeFiles = false;
    checkDrive.mockClear();
    expect(
      ofCode(
        await plan(off, fakeDb(), nestedData(), { checkDrive }),
        "DRIVE_NOT_CONFIGURED",
      ),
    ).toEqual([]);
    expect(checkDrive).not.toHaveBeenCalled();
  });
});

describe("plan: warnings", () => {
  it("PERSON_UNMATCHED, RELATION_MISSING, DATES_MISSING, FILE_MISSING don't block", async () => {
    const input = nestedMapping();
    input.people["14"] = null;
    const p = await plan(input, fakeDb(), nestedData(), {
      checkDrive: driveOk,
      fileExists: (path) => path !== "files/a4/tablero.pdf",
    });
    expect(blocking(p)).toEqual([]);
    expect(codes(p)).toEqual(
      expect.arrayContaining(["DATES_MISSING", "FILE_MISSING", "PERSON_UNMATCHED"]),
    );
    // Not in the index (translate) and not on disk (plan).
    expect(ofCode(p, "FILE_MISSING").map((i) => i.message)).toEqual([
      expect.stringContaining("a9"),
      expect.stringContaining("files/a4/tablero.pdf is not on disk"),
    ]);
    expect(p.boards.find((b) => b.boardId === "902")!.files).toBe(0);
    expect(ofCode(await plan(), "RELATION_MISSING")).toEqual([
      expect.objectContaining({
        boardId: "301",
        itemId: "1002",
        blocking: false,
      }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// Project flow (BE §10.4, §16): re-runs, tramos, grouped report
// ---------------------------------------------------------------------------

/** Every row a plan would create, as import refs: what the database has after its apply. */
function appliedRefs(p: Plan): Pick<FakeDb, "refs" | "assets"> {
  const r = p.translation!.result;
  const ids = (rows: readonly { externalId: string }[]) =>
    Object.fromEntries(rows.map((row) => [row.externalId, ROW]));
  return {
    refs: {
      contact: ids(r.contacts),
      contact_person: ids(r.contactPeople),
      provider_profile: ids(r.providerProfiles),
      project: ids(r.projects),
      project_schedule: ids(r.projectSchedules),
      task: ids(r.tasks),
      checklist_item: ids(r.checklistItems),
      task_support: ids(r.taskSupport),
      task_dependency: ids(r.taskDependencies),
      history_event: ids(r.historyEvents),
      schedule_task: ids(r.scheduleTasks),
    },
    assets: r.files.map((f) => f.assetId),
  };
}

describe("plan: already imported items (brief §4.9)", () => {
  /** The nested fixture with an unmatched person and a project without a client. */
  function noisyMapping(): MappingInput {
    const input = nestedMapping();
    input.people["14"] = null;
    board(input, "903").client = null;
    return input;
  }

  it("re-planning the same export after its apply raises no issues", async () => {
    const options = {
      checkDrive: driveOk,
      fileExists: (path: string) => path !== "files/a4/tablero.pdf",
    };
    const first = await plan(noisyMapping(), fakeDb(), nestedData(), options);
    expect(first.issues.length).toBeGreaterThan(0);
    expect(codes(first)).toEqual(
      expect.arrayContaining(["CLIENT_MISSING", "DATES_MISSING", "PERSON_UNMATCHED"]),
    );

    // What the database holds after the apply: its refs, files, contacts and projects.
    const r = first.translation!.result;
    const db = fakeDb({
      ...appliedRefs(first),
      contactNames: r.contacts.map((c) => ({ type: c.type, name: c.name })),
      projects: r.projects.map((p) => ({ name: p.name, code: p.code })),
    });
    const again = await plan(noisyMapping(), db, nestedData(), options);
    expect(again.issues).toEqual([]);
    expect(again.totals).toMatchObject({ projects: 0, tasks: 0, childTasks: 0, contacts: 0 });
    expect(again.totals.skipped).toBeGreaterThan(0);
  });

  it("drops the issues of imported tasks and projects, keeps the new ones", async () => {
    const first = await plan(noisyMapping(), fakeDb(), nestedData());
    const missing = ofCode(first, "DATES_MISSING");
    expect(missing.map((i) => i.itemId)).toContain("2003");
    expect(ofCode(first, "CLIENT_MISSING").length).toBeGreaterThan(0);
    // Only task 2003 and the project of board 903 (item 4001) were imported before.
    const db = fakeDb({ refs: { task: { "2003": ROW }, project: { "4001": ROW } } });
    const again = await plan(noisyMapping(), db, nestedData());
    expect(ofCode(again, "DATES_MISSING").map((i) => i.itemId)).not.toContain("2003");
    expect(ofCode(again, "CLIENT_MISSING")).toEqual([]);
    expect(ofCode(again, "PERSON_UNMATCHED")).toEqual(
      ofCode(first, "PERSON_UNMATCHED").filter((i) => i.itemId !== "2003"),
    );
  });
});

describe("plan: TRAMO_MISSING", () => {
  it("blocks while a board's groups and items resolve no tramo", async () => {
    const input = mappingInput();
    board(input, "301").workflowId = null;
    const p = await plan(input);
    const missing = ofCode(p, "TRAMO_MISSING");
    expect(missing.length).toBeGreaterThan(0);
    for (const i of missing) {
      expect(i).toMatchObject({ boardId: "301", blocking: true });
      expect(i.message).toMatch(/resolves? no tramo/);
    }
    expect(blocking(p).map((i) => i.code)).toContain("TRAMO_MISSING");
  });

  it("clears with a tramo for each group, or the board's tramo", async () => {
    const perGroup = mappingInput();
    board(perGroup, "301").workflowId = null;
    board(perGroup, "301").groupTargets = Object.fromEntries(
      ["g_obra", "g_diseno", "g_extra", "g_final"].map((g) => [
        g,
        { kind: "tramo" as const, workflowId: BOARD_WORKFLOW },
      ]),
    );
    expect(ofCode(await plan(perGroup), "TRAMO_MISSING")).toEqual([]);
    expect(ofCode(await plan(mappingInput()), "TRAMO_MISSING")).toEqual([]);
  });

  it("doesn't count admin groups nor already imported tasks", async () => {
    const admin = mappingInput();
    board(admin, "301").workflowId = null;
    board(admin, "301").templateMatches = {};
    board(admin, "301").groupTargets = Object.fromEntries(
      ["g_obra", "g_diseno", "g_extra", "g_final"].map((g) => [g, { kind: "admin" as const }]),
    );
    expect(ofCode(await plan(admin), "TRAMO_MISSING")).toEqual([]);

    const input = mappingInput();
    board(input, "301").workflowId = null;
    const tasks = Object.fromEntries(
      ["1001", "1002", "1003", "1004", "1005"].map((id) => [id, ROW]),
    );
    const db = fakeDb({ refs: { project: { "301": ROW }, task: tasks } });
    expect(ofCode(await plan(input, db), "TRAMO_MISSING")).toEqual([]);
  });
});

describe("plan: grouped plan.md", () => {
  const issue = (
    code: PlanIssueCode,
    blocking: boolean,
    message: string,
    boardId?: string,
    itemId?: string,
  ): Plan["issues"][number] => ({
    code,
    group: code,
    blocking,
    message,
    ...(boardId ? { boardId } : {}),
    ...(itemId ? { itemId } : {}),
  });
  const counts = {
    contacts: 0,
    projects: 1,
    tasks: 5,
    childTasks: 0,
    checklistItems: 0,
    dependencies: 0,
    comments: 0,
    cronogramaRows: 0,
    files: 0,
    skipped: 2,
  };
  const grouped: Plan = {
    issues: [
      issue("PROJECT_NAME_TAKEN", true, 'An active project named "Casa Lomas" exists already; set another name in projectNames', "301"),
      issue("PHASE_UNRESOLVED", false, '"Muros" matches no fase of its tramo', "301", "1004"),
      issue("TRAMO_MISSING", true, '2 tasks of group "Depto Roma" resolve no tramo; choose the board\'s tramo or a tramo for the group', "701"),
      issue("PHASE_UNRESOLVED", false, '"Acabados | final" matches no fase of its tramo', "301", "1005"),
      issue("CLIENT_MISSING", false, '"Casa sin cliente" has no client', "501", "6003"),
    ],
    boards: [{ boardId: "301", name: "Casa Lomas", strategy: "board_as_project", ...counts }],
    totals: { ...counts, contactPeople: 0, providerProfiles: 0, taskSupport: 0, projectSchedules: 0 },
  };

  it("prints blocking issues and warnings grouped by code with counts (snapshot)", () => {
    const md = formatPlanMarkdown(grouped, "/exports/acme", new Date("2026-10-30T12:00:00Z"));
    expect(md).toBe(
      [
        "# monday import plan",
        "",
        "Export: `/exports/acme` · generated 2026-10-30T12:00:00.000Z",
        "",
        "**2 blocking issues**, 3 warnings. Edit mapping.json and run plan again.",
        "",
        "## Rows to create",
        "",
        "| Board | Name | Strategy | Contacts | Projects | Tasks | Child tasks | Checklist items | Dependencies | Comments | Cronograma rows | Files | Already imported |",
        "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
        "| 301 | Casa Lomas | board_as_project | 0 | 1 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |",
        "| **Total** | | | **0** | **1** | **5** | **0** | **0** | **0** | **0** | **0** | **0** | **2** |",
        "",
        "Also: 0 contact people, 0 provider profiles, 0 task support rows, 0 cronogramas.",
        "",
        "## Blocking issues",
        "",
        "### PROJECT_NAME_TAKEN (1)",
        "",
        "| Board | Item | Message |",
        "|---|---|---|",
        '| 301 | - | An active project named "Casa Lomas" exists already; set another name in projectNames |',
        "",
        "### TRAMO_MISSING (1)",
        "",
        "| Board | Item | Message |",
        "|---|---|---|",
        '| 701 | - | 2 tasks of group "Depto Roma" resolve no tramo; choose the board\'s tramo or a tramo for the group |',
        "",
        "## Warnings",
        "",
        "### PHASE_UNRESOLVED (2)",
        "",
        "| Board | Item | Message |",
        "|---|---|---|",
        '| 301 | 1004 | "Muros" matches no fase of its tramo |',
        '| 301 | 1005 | "Acabados \\| final" matches no fase of its tramo |',
        "",
        "### CLIENT_MISSING (1)",
        "",
        "| Board | Item | Message |",
        "|---|---|---|",
        '| 501 | 6003 | "Casa sin cliente" has no client |',
        "",
      ].join("\n"),
    );
  });

  it("prints None. for an empty group", () => {
    const md = formatPlanMarkdown(
      { ...grouped, issues: grouped.issues.filter((i) => i.blocking) },
      "/exports/acme",
      new Date("2026-10-30T12:00:00Z"),
    );
    expect(md).toContain("**2 blocking issues**, 0 warnings.");
    expect(md.endsWith("## Warnings\n\nNone.\n")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Drive check
// ---------------------------------------------------------------------------

describe("checkDriveConfigured", () => {
  const drive = (list: () => Promise<unknown>) =>
    ({ list }) as unknown as DriveAdmin;

  it("passes when the service account lists the Shared Drive", async () => {
    const list = vi.fn(async () => ({ files: [] }));
    expect(
      await checkDriveConfigured(() => drive(list), {
        GOOGLE_SHARED_DRIVE_ID: "sd1",
      }),
    ).toBeNull();
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "sd1", driveId: "sd1" }),
    );
  });

  it("reports missing credentials, a missing drive id and a failing list", async () => {
    expect(
      await checkDriveConfigured(
        () => {
          throw new Error(
            "Drive is not configured (GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY)",
          );
        },
        { GOOGLE_SHARED_DRIVE_ID: "sd1" },
      ),
    ).toContain("GOOGLE_SA_CLIENT_EMAIL");
    expect(
      await checkDriveConfigured(() => drive(async () => ({ files: [] })), {}),
    ).toBe("GOOGLE_SHARED_DRIVE_ID is not set");
    expect(
      await checkDriveConfigured(
        () =>
          drive(async () => {
            throw new Error("insufficientFilePermissions");
          }),
        { GOOGLE_SHARED_DRIVE_ID: "sd1" },
      ),
    ).toContain("can't list the Shared Drive sd1: insufficientFilePermissions");
  });
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

describe("plan command", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  /** Writes translate-nested-export.json out as an export folder (BE §4.1). */
  function exportFolder(): string {
    const dir = mkdtempSync(join(tmpdir(), "monday-plan-"));
    dirs.push(dir);
    const data = nestedData();
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({
        account: { id: "1" },
        boards: data.boards.map((b) => ({ id: b.board.id })),
      }),
    );
    writeFileSync(join(dir, "users.json"), JSON.stringify(data.users));
    for (const b of data.boards) {
      const bd = join(dir, "boards", b.board.id);
      mkdirSync(bd, { recursive: true });
      writeFileSync(join(bd, "board.json"), JSON.stringify(b.board));
      writeFileSync(
        join(bd, "items.ndjson"),
        b.items.map((i) => JSON.stringify(i)).join("\n"),
      );
      writeFileSync(
        join(bd, "updates.ndjson"),
        (b.updates ?? []).map((u) => JSON.stringify(u)).join("\n"),
      );
      writeFileSync(join(bd, ".done"), "");
    }
    for (const entry of Object.values(data.files ?? {})) {
      mkdirSync(join(dir, entry.path, ".."), { recursive: true });
      writeFileSync(join(dir, entry.path), "x");
    }
    writeFileSync(join(dir, "files", "index.json"), JSON.stringify(data.files));
    return dir;
  }

  function io() {
    const out: string[] = [];
    const err: string[] = [];
    const cli: CliIo = {
      stdout: (t) => out.push(t),
      stderr: (t) => err.push(t),
    };
    return { cli, out: () => out.join(""), err: () => err.join("") };
  }

  function command(db: FakeDb = fakeDb(), list = async () => ({ files: [] })) {
    const close = vi.fn(async () => {});
    const handler = createPlanCommand({
      openDb: () => ({ db: {}, close }) as unknown as MondayDbHandle,
      lookups: () => lookupsOf(db),
      openDrive: () => ({ list }) as unknown as DriveAdmin,
      env: { GOOGLE_SHARED_DRIVE_ID: "sd1" },
      now: () => new Date("2026-10-30T12:00:00Z"),
    });
    return { handler, close };
  }

  it("parses --export", () => {
    expect(parsePlanArgs(["--export", "exports/acme"])).toEqual({
      exportDir: "exports/acme",
    });
    expect(parsePlanArgs(["--export=exports/acme"])).toEqual({
      exportDir: "exports/acme",
    });
    expect(parsePlanArgs([])).toBe("--export exports/<client> is required");
    expect(parsePlanArgs(["--export", "x", "--by", "a"])).toBe(
      'unknown option "--by"',
    );
  });

  it("reads the export folder like translate expects it", async () => {
    const dir = exportFolder();
    const { data, incomplete } = await readPlanExport(dir);
    expect(incomplete).toEqual([]);
    expect(
      data.boards.map((b) => [b.board.id, b.items.length, b.updates?.length]),
    ).toEqual([
      ["901", 3, 5],
      ["902", 1, 1],
      ["903", 1, 1],
      ["904", 1, 1],
    ]);
    expect(Object.keys(data.files ?? {})).toHaveLength(7);
  });

  it("writes only plan.md; exits 1 on blocking issues and 0 once mapping.json is fixed", async () => {
    const dir = exportFolder();
    const input = nestedMapping();
    board(input, "901").client = { kind: "contact", contactId: PROVEEDOR };
    writeFileSync(join(dir, "mapping.json"), JSON.stringify(input));
    const before = readFileSync(join(dir, "mapping.json"), "utf8");

    const { handler, close } = command();
    const c = io();
    expect(await handler(["--export", dir], c.cli)).toBe(1);
    expect(close).toHaveBeenCalled();
    expect(c.err()).toContain("CLIENT_UNRESOLVED board 901: client: contact");
    const md = readFileSync(join(dir, PLAN_FILE), "utf8");
    expect(md).toContain("**1 blocking issue**");
    expect(md).toContain("### CLIENT_UNRESOLVED (1)");
    expect(readFileSync(join(dir, "mapping.json"), "utf8")).toBe(before);

    writeFileSync(join(dir, "mapping.json"), JSON.stringify(nestedMapping()));
    const again = io();
    expect(await handler(["--export", dir], again.cli)).toBe(0);
    expect(again.out()).toContain("0 blocking issues");
    expect(readFileSync(join(dir, PLAN_FILE), "utf8")).toContain("**Clean:**");
  });

  it("files missing on disk are FILE_MISSING warnings", async () => {
    const dir = exportFolder();
    rmSync(join(dir, "files", "a5"), { recursive: true });
    writeFileSync(join(dir, "mapping.json"), JSON.stringify(nestedMapping()));
    const c = io();
    expect(await command().handler(["--export", dir], c.cli)).toBe(0);
    expect(readFileSync(join(dir, PLAN_FILE), "utf8")).toContain(
      "files/a5/contrato.pdf is not on disk",
    );
  });

  it("DRIVE_NOT_CONFIGURED when the Shared Drive can't be listed", async () => {
    const dir = exportFolder();
    writeFileSync(join(dir, "mapping.json"), JSON.stringify(nestedMapping()));
    const c = io();
    const { handler } = command(fakeDb(), async () => {
      throw new Error("notFound");
    });
    expect(await handler(["--export", dir], c.cli)).toBe(1);
    expect(c.err()).toContain("DRIVE_NOT_CONFIGURED");
  });

  it("MAPPING_INVALID without a mapping.json or with invalid JSON, without opening the DB", async () => {
    const dir = exportFolder();
    const openDb = vi.fn();
    const handler = createPlanCommand({ openDb });
    const c = io();
    expect(await handler(["--export", dir], c.cli)).toBe(1);
    expect(c.err()).toContain("run init first");
    writeFileSync(join(dir, "mapping.json"), "{ nope");
    expect(await handler(["--export", dir], io().cli)).toBe(1);
    expect(readFileSync(join(dir, PLAN_FILE), "utf8")).toContain(
      "is not valid JSON",
    );
    expect(openDb).not.toHaveBeenCalled();
    expect(existsSync(join(dir, PLAN_FILE))).toBe(true);
  });

  it("rejects bad arguments", async () => {
    const c = io();
    expect(await createPlanCommand({ openDb: vi.fn() })([], c.cli)).toBe(1);
    expect(c.err()).toContain("--export exports/<client> is required");
  });
});

// ---------------------------------------------------------------------------
// DB lookups (need TEST_DATABASE_URL pointing at a migrated database; each
// test runs in a transaction that is rolled back)
// ---------------------------------------------------------------------------

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

describe.skipIf(!url)("plan lookups (test DB)", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  afterAll(() => client.end({ timeout: 5 }));

  async function inTx(fn: (tx: ImportDb) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        await fn(tx);
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
  }

  it("answers every check from the live rows", async () => {
    await inTx(async (tx) => {
      const [admin] = await tx
        .insert(schema.staff)
        .values({ name: "Plan Admin", email: "plan-admin@example.com" })
        .returning();
      const [cliente, proveedor] = await tx
        .insert(schema.contacts)
        .values([
          { type: "cliente", name: "Plan Cliente" },
          { type: "proveedor", name: "Plan Proveedor" },
        ])
        .returning();
      await tx
        .insert(schema.contacts)
        .values({
          type: "cliente",
          name: "Plan Borrado",
          deletedAt: new Date(),
        });
      const [wf, gone] = await tx
        .insert(schema.workflows)
        .values([
          { key: "plan-wf", name: "Plan WF" },
          { key: "plan-gone", name: "Plan Gone", deletedAt: new Date() },
        ])
        .returning();
      const [phase] = await tx
        .insert(schema.workflowPhases)
        .values({ workflowId: wf.id, name: "Plan fase" })
        .returning();
      const [template] = await tx
        .insert(schema.workflowTaskTemplates)
        .values({ workflowId: wf.id, phaseId: phase.id, title: "Plan plantilla" })
        .returning();
      const [project, other] = await tx
        .insert(schema.projects)
        .values([
          { name: "Plan Casa", code: "PLAN-01", clientId: cliente.id },
          { name: "Plan Otra", clientId: cliente.id },
        ])
        .returning();
      await tx.insert(schema.projects).values([
        { name: "Plan Pausada", status: "pausado" },
        { name: "Plan Archivada", status: "completado" },
        { name: "Plan Borrada", deletedAt: new Date() },
      ]);
      await tx.insert(schema.tasks).values({
        projectId: project.id,
        kind: "workflow",
        templateId: template.id,
        workflowId: wf.id,
        title: "Plan plantilla",
        createdById: admin.id,
      });
      const [batch] = await tx
        .insert(schema.importBatches)
        .values({
          accountId: "plan-1",
          exportedAt: new Date(),
          exportPath: "exports/plan",
          mapping: {},
          appliedById: admin.id,
        })
        .returning();
      const [, own] = await tx
        .insert(schema.projectSchedules)
        .values([{ projectId: project.id }, { projectId: other.id }])
        .returning();
      await tx.insert(schema.importRefs).values([
        {
          source: "monday",
          entity: "project",
          externalId: "plan-901",
          rowId: other.id,
          batchId: batch.id,
        },
        {
          source: "monday",
          entity: "project_schedule",
          externalId: "plan-901",
          rowId: own.id,
          batchId: batch.id,
        },
      ]);
      await tx.insert(schema.importFiles).values({
        batchId: batch.id,
        assetId: "plan-a1",
        projectId: other.id,
        fileName: "a.pdf",
        sha256: "x",
        localPath: "files/plan-a1/a.pdf",
      });

      const l = createPlanDbLookups(tx);
      const t = await l.translateLookups();
      expect(t.templates[template.id]).toEqual({ workflowId: wf.id, phaseId: phase.id });
      expect(t.staff[admin.id]).toMatchObject({ name: "Plan Admin" });
      expect(await l.importedRefs("project", ["plan-901", "plan-902"])).toEqual(
        new Map([["plan-901", other.id]]),
      );
      expect(await l.importedAssets(["plan-a1", "plan-a2"])).toEqual(
        new Set(["plan-a1"]),
      );
      expect(await l.contactTypes([cliente.id, proveedor.id, ROW])).toEqual(
        new Map([
          [cliente.id, "cliente"],
          [proveedor.id, "proveedor"],
        ]),
      );
      expect(
        await l.contactNamesTaken("cliente", [
          "plan cliente",
          "plan borrado",
          "plan proveedor",
        ]),
      ).toEqual(new Set(["plan cliente"]));
      expect(
        await l.projectNamesTaken([
          "plan casa",
          "plan nueva",
          "plan pausada",
          "plan archivada",
          "plan borrada",
        ]),
      ).toEqual(new Set(["plan casa", "plan pausada"]));
      expect(await l.projectCodesTaken(["PLAN-01", "PLAN-02"])).toEqual(
        new Set(["PLAN-01"]),
      );
      expect(await l.workflowIds([wf.id, gone.id])).toEqual(new Set([wf.id]));
      expect(
        await l.projectTemplatesTaken([
          { projectId: project.id, templateId: template.id },
          { projectId: other.id, templateId: template.id },
        ]),
      ).toEqual(new Set([`${project.id}|${template.id}`]));
      expect(await l.foreignSchedules([project.id, other.id])).toEqual(
        new Set([project.id]),
      );
    });
  });
});
