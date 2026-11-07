// @vitest-environment node
/**
 * scripts/monday/init.ts (BE §5.3, project flow BE §10.6): drafting mapping.json (v2) from an export.
 *
 * The heuristics run against the fixture export in
 * scripts/monday/__fixtures__/export-init with fake Cincel lookups. The
 * pg_trgm lookups need TEST_DATABASE_URL pointing at a migrated database;
 * each test works inside a transaction that is rolled back.
 */
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import type { ImportDb } from "@/lib/import/refs";
import type { MondayDbHandle } from "@/scripts/monday/db";
import type { ColumnDef } from "@/scripts/monday/export";
import {
  boardWorkflowId,
  columnTargets,
  createDbLookups,
  createInitCommand,
  detectStrategy,
  draftGroupTargets,
  draftMapping,
  draftStatusLabels,
  isClosedDateTitle,
  MAPPING_FILE,
  parseInitArgs,
  pickTemplates,
  readExport,
  statusLabels,
  statusTarget,
  type InitLookups,
  type InitWorkflow,
  type TemplateCandidate,
} from "@/scripts/monday/init";
import { Mapping } from "@/scripts/monday/mapping.schema";
import type { MondayItem } from "@/scripts/monday/queries";
import type { CliIo } from "@/scripts/monday/run";

const FIXTURE = resolve(
  __dirname,
  "../../../scripts/monday/__fixtures__/export-init",
);

const ID = {
  ana: "00000000-0000-4000-8000-0000000000a1",
  beto: "00000000-0000-4000-8000-0000000000b2",
  revision: "00000000-0000-4000-8000-0000000000c3",
  perez: "00000000-0000-4000-8000-0000000000d4",
  acme: "00000000-0000-4000-8000-0000000000e5",
  faseObra: "00000000-0000-4000-8000-0000000000f6",
  faseEjecutivo: "00000000-0000-4000-8000-0000000000f7",
  wfObra: "00000000-0000-4000-8000-000000000101",
  wfDisenoEjecutivo: "00000000-0000-4000-8000-000000000102",
  wfDiseno: "00000000-0000-4000-8000-000000000104",
  tplLevantamiento: "00000000-0000-4000-8000-000000000201",
  tplEjecutivo: "00000000-0000-4000-8000-000000000202",
};

/** The catalog: tramo "Construcción" with the fase "Obra", tramo "Diseño" with the fase "Ejecutivo". */
const WORKFLOWS: InitWorkflow[] = [
  { id: ID.wfObra, name: "Construcción", phases: [{ id: ID.faseObra, name: "Obra", sortOrder: 1, active: true }] },
  { id: ID.wfDiseno, name: "Diseño", phases: [{ id: ID.faseEjecutivo, name: "Ejecutivo", sortOrder: 1, active: true }] },
];

/** Exact-name fake of the Cincel DB; template scores come from a table. */
function fakeLookups(overrides: Partial<InitLookups> = {}): InitLookups {
  const staff = new Map([
    ["ana@cincel.mx", ID.ana],
    ["beto@cincel.mx", ID.beto],
  ]);
  const scores: Record<string, Record<string, [string, number][]>> = {
    [ID.wfObra]: {
      Levantamiento: [[ID.tplLevantamiento, 1]],
      "Levantamiento previo": [[ID.tplLevantamiento, 0.9]],
    },
    [ID.wfDiseno]: {
      "Diseño ejecutivo": [[ID.tplEjecutivo, 1]],
      "Diseño ejecutivo v2": [[ID.tplEjecutivo, 0.88]],
    },
  };
  return {
    staffByEmail: async (emails) =>
      new Map(
        emails
          .map((e) => e.toLowerCase())
          .flatMap((e) => (staff.has(e) ? [[e, staff.get(e)!] as const] : [])),
      ),
    customStatuses: async () => new Map([["revisión cliente", ID.revision]]),
    matchClient: async (name) => (name === "Casa Pérez" ? ID.perez : null),
    contactsByName: async (type, names) =>
      new Map(
        type === "cliente" && names.some((n) => n.toLowerCase() === "acme")
          ? [["acme", ID.acme]]
          : [],
      ),
    workflows: async () => WORKFLOWS,
    savedStatusMap: async () => ({}),
    templateCandidates: async (workflowId, names) =>
      names.flatMap((name) =>
        (scores[workflowId]?.[name] ?? []).map(([templateId, score]) => ({
          name,
          templateId,
          score,
        })),
      ),
    ...overrides,
  };
}

const col = (
  id: string,
  type: string,
  title = id,
  settings: unknown = {},
): ColumnDef => ({ id, title, type, settings });
const item = (id: string, subitems: unknown[] = [], state = "active") =>
  ({
    id,
    name: id,
    state,
    subitems,
    column_values: [],
  }) as unknown as MondayItem;

describe("init: reading the export", () => {
  it("reads users, workspaces and boards in manifest order", async () => {
    const data = await readExport(FIXTURE);
    expect(data.boards.map((b) => b.board.id)).toEqual(["101", "202", "301"]);
    expect(data.boards.every((b) => b.done)).toBe(true);
    expect(data.boards[0].items.map((i) => i.id)).toEqual([
      "1001",
      "1002",
      "1003",
      "1004",
    ]);
    expect(data.users).toHaveLength(4);
    expect(data.workspaces.map((w) => w.name)).toEqual([
      "Construcción",
      "Diseño",
    ]);
  });
});

describe("init: the fixture draft", () => {
  async function draft() {
    return draftMapping(await readExport(FIXTURE), fakeLookups());
  }

  it("passes the Zod schema", async () => {
    const mapping = await draft();
    expect(Mapping.safeParse(JSON.parse(JSON.stringify(mapping))).success).toBe(
      true,
    );
    expect(mapping.options).toEqual({
      includeUpdates: true,
      includeFiles: true,
    });
  });

  it("matches people by lower(email), guests to contacts, the rest null", async () => {
    const { people } = await draft();
    expect(people).toEqual({
      "1": { action: "staff", staffId: ID.ana },
      "2": { action: "staff", staffId: ID.beto },
      "3": { action: "contact" },
      "4": null,
    });
  });

  it("detects each board's strategy", async () => {
    const { boards } = await draft();
    expect(boards.map((b) => [b.mondayBoardId, b.strategy])).toEqual([
      ["101", "board_as_project"],
      ["202", "item_as_project"],
      ["301", "crm_contacts"],
    ]);
  });

  it("targets columns by type, first of each kind", async () => {
    const [casa] = (await draft()).boards;
    expect(casa.columns).toEqual({
      name: "title",
      status: "status",
      priority: "priority",
      person: "people",
      timeline: "timeline",
      date4: "delivery_date",
      date5: "import_data",
      notes: "notes",
      text0: "import_data",
      dep: "dependencies",
      files: "files",
      cliente: "client",
      numbers: "import_data",
      status_1: "import_data",
      subitems: "ignore",
    });
    expect(casa.subitemColumns).toEqual({
      name: "title",
      status: "status",
      person: "people",
    });
  });

  it("drafts version 2 without per-board status maps", async () => {
    const mapping = await draft();
    expect(mapping.version).toBe(2);
    for (const board of mapping.boards) expect("statusMaps" in board).toBe(false);
  });

  it("drafts the firm-wide status map by label text with the defaults table and custom-status names", async () => {
    const { statusMap } = await draft();
    expect(statusMap).toEqual({
      "en proceso": { target: { status: "en_proceso" }, priority: null },
      listo: { target: { status: "completado" }, priority: null },
      detenido: { target: { status: "bloqueado" }, priority: null },
      "revisión cliente": { target: { customStatusId: ID.revision }, priority: null },
      // No equivalent: an open status flagged for review, never completado.
      "por iniciar": { target: { status: "pendiente", defaulted: true }, priority: null },
      // The defaults table: Entregado closes the task even though monday doesn't mark it done.
      entregado: { target: { status: "completado" }, priority: null },
      // From the subitem column.
      "en curso": { target: { status: "en_proceso" }, priority: null },
      // Old object-form labels with done_colors (Desarrollos).
      pendiente: { target: { status: "pendiente" }, priority: null },
      hecho: { target: { status: "completado" }, priority: null },
      stuck: { target: { status: "bloqueado" }, priority: null },
    });
    // A CRM board's status column describes contacts, not tasks.
    expect(statusMap).not.toHaveProperty("activo");
  });

  it("keeps the saved firm-wide status map, so a second import doesn't ask again", async () => {
    const saved = {
      "por iniciar": { target: { status: "en_proceso" as const }, priority: "alta" as const },
      "de otro tablero": { target: { status: "bloqueado" as const }, priority: null },
    };
    const { statusMap } = await draftMapping(
      await readExport(FIXTURE),
      fakeLookups({ savedStatusMap: async () => saved }),
    );
    expect(statusMap["por iniciar"]).toEqual(saved["por iniciar"]);
    expect(statusMap["de otro tablero"]).toEqual(saved["de otro tablero"]);
    expect(
      Object.values(statusMap).filter((e) => "status" in e.target && e.target.defaulted),
    ).toEqual([]);
  });

  it("resolves the client by relation column or name", async () => {
    const [casa, desarrollos, clientes] = (await draft()).boards;
    expect(casa.client).toEqual({
      kind: "relation_column",
      columnId: "cliente",
    });
    expect(desarrollos.client).toBeNull();
    expect(clientes.client).toBeUndefined();
  });

  it("uses the trigram client match when there is no relation column to a CRM board", async () => {
    const data = await readExport(FIXTURE);
    // Without the CRM board, the relation column is plain import data.
    data.boards = data.boards.filter((b) => b.board.id !== "301");
    const [casa] = (await draftMapping(data, fakeLookups())).boards;
    expect(casa.columns.cliente).toBe("import_data");
    expect(casa.client).toEqual({ kind: "contact", contactId: ID.perez });
  });

  it("reuses existing contacts on a CRM board and skips archived items", async () => {
    const clientes = (await draft()).boards[2];
    expect(clientes.contactType).toBe("cliente");
    expect(clientes.contactMatches).toEqual({ "3001": ID.acme });
    expect(clientes.columns).toEqual({
      name: "title",
      email: "contact_email",
      phone: "contact_phone",
      status: "status",
      text: "notes",
    });
  });

  it("maps groups with the defaults: a tramo's name, else a fase of one tramo; unresolved groups stay unset", async () => {
    const [casa, desarrollos, clientes] = (await draft()).boards;
    // "Casa Pérez" names no tramo.
    expect(casa.workflowId).toBeNull();
    expect(casa.groupTargets).toEqual({
      topics: { kind: "tramo", workflowId: ID.wfDiseno },
      g_obra: { kind: "phase", phaseId: ID.faseObra },
    });
    // "Activos" resolves no tramo and the board has none: left for the plan (TRAMO_MISSING).
    expect(desarrollos.groupTargets).toEqual({});
    expect(clientes.groupTargets).toEqual({});
  });

  it("matches templates within the tramo each group places its items in, one per template per project", async () => {
    const [casa] = (await draft()).boards;
    // Levantamiento (group Diseño) is in the Diseño tramo: no match there; Levantamiento previo (fase Obra) matches.
    expect(casa.templateMatches).toEqual({ "1003": ID.tplLevantamiento });
  });

  it("takes the board's tramo from its name, and its templates per project", async () => {
    const data = await readExport(FIXTURE);
    data.boards[1].board.name = "Desarrollos · Diseño";
    const [, desarrollos] = (await draftMapping(data, fakeLookups())).boards;
    expect(desarrollos.workflowId).toBe(ID.wfDiseno);
    expect(desarrollos.groupTargets).toEqual({ g1: { kind: "tramo", workflowId: ID.wfDiseno } });
    // item_as_project: subitems are the tasks; each item is its own project.
    expect(desarrollos.templateMatches).toEqual({
      "2101": ID.tplEjecutivo,
      "2201": ID.tplEjecutivo,
    });
  });

  it("enables the cronograma only for board_as_project with a timeline", async () => {
    const [casa, desarrollos, clientes] = (await draft()).boards;
    expect(casa.schedule).toEqual({
      enabled: true,
      planta: { fixed: "General" },
    });
    expect(desarrollos.schedule.enabled).toBe(false);
    expect(clientes.schedule.enabled).toBe(false);
  });
});

describe("init: heuristics", () => {
  it("detects crm_contacts when email/phone columns dominate", () => {
    const board = (columns: ColumnDef[]) => ({
      id: "1",
      name: "b",
      workspace_id: null,
      hierarchy_type: "classic",
      columns,
      groups: [],
      subitem_columns: [],
    });
    expect(
      detectStrategy(
        board([col("e", "email"), col("p", "phone"), col("s", "status")]),
        [],
      ),
    ).toBe("crm_contacts");
    expect(
      detectStrategy(
        board([col("e", "email"), col("s", "status"), col("t", "timeline")]),
        [],
      ),
    ).toBe("board_as_project");
  });

  it("detects item_as_project when most active items have subitems", () => {
    const board = {
      id: "1",
      name: "b",
      workspace_id: null,
      hierarchy_type: "classic",
      columns: [],
      groups: [],
      subitem_columns: [],
    };
    const sub = [item("s")];
    expect(
      detectStrategy(board, [item("a", sub), item("b", sub), item("c")]),
    ).toBe("item_as_project");
    expect(detectStrategy(board, [item("a", sub), item("b")])).toBe(
      "board_as_project",
    );
    // Archived items and archived subitems don't count.
    expect(
      detectStrategy(board, [
        item("a", sub),
        item("b", [item("x", [], "archived")]),
        item("c"),
      ]),
    ).toBe("board_as_project");
    expect(detectStrategy(board, [])).toBe("board_as_project");
  });

  it("uses email and phone as contact fields only on CRM boards", () => {
    const cols = [col("e", "email"), col("p", "phone")];
    expect(columnTargets(cols)).toEqual({ e: "import_data", p: "import_data" });
    expect(columnTargets(cols, { contactBoard: true })).toEqual({
      e: "contact_email",
      p: "contact_phone",
    });
  });

  it("targets a date column titled like «Fecha que finalizó» as closed_date", () => {
    expect(isClosedDateTitle("Fecha que finalizó")).toBe(true);
    expect(isClosedDateTitle("  FECHA DE FINALIZACIÓN ")).toBe(true);
    expect(isClosedDateTitle("Finalizado")).toBe(true);
    expect(isClosedDateTitle("Fecha")).toBe(false);
    expect(
      columnTargets([col("d1", "date", "Fecha que finalizó"), col("d2", "date", "Entrega"), col("s", "status", "Finalizado")]),
    ).toEqual({ d1: "closed_date", d2: "delivery_date", s: "status" });
  });

  it("picks the board's tramo by the longest tramo name the board name contains", () => {
    const workflows = [
      { id: ID.wfDiseno, name: "Diseño" },
      { id: ID.wfDisenoEjecutivo, name: "Diseño ejecutivo" },
      { id: ID.wfObra, name: "Construcción" },
    ];
    expect(boardWorkflowId("Casa Ruiz - DISEÑO EJECUTIVO", workflows)).toBe(ID.wfDisenoEjecutivo);
    expect(boardWorkflowId("Diseno Casa Ruiz", workflows)).toBe(ID.wfDiseno);
    expect(boardWorkflowId("Reconstrucción", workflows)).toBeNull();
    expect(boardWorkflowId("Casa Ruiz", workflows)).toBeNull();
  });

  it("drafts no group targets for strategies that don't map groups, and admin groups by name", () => {
    const catalog = { workflows: WORKFLOWS };
    const groups = [
      { id: "a", title: "Administrativo" },
      { id: "b", title: "Varios" },
    ];
    expect(draftGroupTargets({ strategy: "board_as_project", workflowId: ID.wfObra, groups }, catalog)).toEqual({
      a: { kind: "admin" },
      b: { kind: "tramo", workflowId: ID.wfObra },
    });
    expect(draftGroupTargets({ strategy: "group_as_project", workflowId: ID.wfObra, groups }, catalog)).toEqual({});
  });

  it("maps date columns titled like «Fecha que finalizó» to the closed date", () => {
    expect(
      columnTargets([
        col("d1", "date", "Fecha de entrega"),
        col("d2", "date", "Fecha que finalizó"),
        col("d3", "date", " fecha de  finalización "),
      ]),
    ).toEqual({ d1: "delivery_date", d2: "closed_date", d3: "import_data" });
    expect(columnTargets([col("d", "date", "Finalizado")])).toEqual({ d: "closed_date" });
  });

  it("prefers long text over text for notes, and targets other types as import data", () => {
    expect(
      columnTargets([
        col("t", "text"),
        col("l", "long_text"),
        col("m", "mirror"),
        col("f", "formula"),
      ]),
    ).toEqual({
      t: "import_data",
      l: "notes",
      m: "import_data",
      f: "import_data",
    });
    expect(columnTargets([col("t", "text")])).toEqual({ t: "notes" });
  });

  it("reads labels from string settings", () => {
    const labels = statusLabels(
      col(
        "s",
        "status",
        "Estado",
        JSON.stringify({
          labels: [{ id: 5, label: "Hecho", index: 2, is_done: true }],
        }),
      ),
    );
    expect(labels).toEqual([
      { id: "5", label: "Hecho", index: "2", isDone: true },
    ]);
  });

  it("applies the default status rules and the firm-wide table", () => {
    const t = (label: string, isDone = false) =>
      statusTarget({ id: "1", label, index: "1", isDone }, new Map());
    expect(t("Done", true)).toEqual({ status: "completado" });
    expect(t("Stuck")).toEqual({ status: "bloqueado" });
    expect(t("Bloqueado")).toEqual({ status: "bloqueado" });
    expect(t("Detenida")).toEqual({ status: "bloqueado" });
    expect(t("Working on it")).toEqual({ status: "en_proceso" });
    expect(t("En proceso")).toEqual({ status: "en_proceso" });
    expect(t("En curso")).toEqual({ status: "en_proceso" });
    expect(t("")).toEqual({ status: "pendiente", defaulted: true });
    expect(t("Pendiente")).toEqual({ status: "pendiente" });
    expect(t("EN PROCESO")).toEqual({ status: "en_proceso" });
    expect(t("Confirmado")).toEqual({ status: "completado" });
    expect(t("Importante")).toEqual({ status: "pendiente" });
    expect(t("-")).toEqual({ status: "pendiente" });
    expect(
      statusTarget({ id: "1", label: "No se requiere", index: null, isDone: false }, new Map([["cancelado", ID.revision]])),
    ).toEqual({ customStatusId: ID.revision });
    expect(
      statusTarget(
        { id: "1", label: " REVISIÓN cliente", index: null, isDone: true },
        new Map([["revisión cliente", ID.revision]]),
      ),
    ).toEqual({
      customStatusId: ID.revision,
    });
  });

  it("never drafts a label monday doesn't mark done as completado, unless the table says so", () => {
    const t = (label: string) =>
      statusTarget({ id: "3", label, index: "1", isDone: false }, new Map());
    for (const label of ["Urgente", "Completado", "Listo", "Hecho", "Done"])
      expect(t(label)).toEqual({ status: "pendiente", defaulted: true });
    expect(
      statusTarget(
        { id: "3", label: "Listo", index: "1", isDone: true },
        new Map(),
      ),
    ).toEqual({ status: "completado" });
  });

  it("drafts Urgente as an open status even when a done item shares its index", () => {
    const column = col(
      "s",
      "status",
      "Estado",
      JSON.stringify({
        labels: [
          { id: 1, label: "Listo", index: 0, is_done: true },
          { id: 5, label: "Urgente", index: 1, is_done: false },
        ],
      }),
    );
    // monday reports the done label "Listo" with index 1, the display index of "Urgente".
    const doneItem = {
      id: "1",
      name: "Tarea",
      column_values: [
        {
          __typename: "StatusValue",
          id: "s",
          label: "Listo",
          index: 1,
          is_done: true,
        },
      ],
      subitems: [],
    } as unknown as MondayItem;
    expect(
      draftStatusLabels([{ defs: [column], targets: { s: "status" } }], [doneItem]),
    ).toEqual([
      { name: "Listo", isDone: true },
      { name: "Urgente", isDone: false },
    ]);
  });

  it("gives labels the same targets whatever their order in the settings", async () => {
    const data = await readExport(FIXTURE);
    const reordered = structuredClone(data);
    const status = reordered.boards[0].board.columns.find(
      (c) => c.id === "status",
    )!;
    (status.settings as { labels: unknown[] }).labels.reverse();
    const a = await draftMapping(data, fakeLookups());
    const b = await draftMapping(reordered, fakeLookups());
    expect(b.statusMap).toEqual(a.statusMap);
  });

  it("picks one item per template per project, best score first", () => {
    const candidates: TemplateCandidate[] = [
      { name: "a", templateId: "t1", score: 0.86 },
      { name: "b", templateId: "t1", score: 0.95 },
      { name: "b", templateId: "t2", score: 0.9 },
      { name: "c", templateId: "t2", score: 0.9 },
    ];
    const tasks = [
      { id: "1", name: "a" },
      { id: "2", name: "b" },
      { id: "3", name: "c" },
    ];
    expect(pickTemplates([tasks], candidates)).toEqual({
      "2": "t1",
      "3": "t2",
    });
    expect(pickTemplates([[tasks[0]], [tasks[1]]], candidates)).toEqual({
      "1": "t1",
      "2": "t1",
    });
  });
});

function captureIo() {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = { stdout: (t) => out.push(t), stderr: (t) => err.push(t) };
  return { io, out: () => out.join(""), err: () => err.join("") };
}

describe("init command", () => {
  let dir: string;
  let closed = 0;
  const command = createInitCommand({
    openDb: () => ({
      db: {} as MondayDbHandle["db"],
      sql: {} as MondayDbHandle["sql"],
      close: async () => void closed++,
    }),
    lookups: () => fakeLookups(),
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "monday-init-"));
    cpSync(FIXTURE, dir, { recursive: true });
    closed = 0;
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const files = (root: string): string[] =>
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => join(d.parentPath, d.name).slice(root.length + 1))
      .sort();

  it("writes only mapping.json, valid against the schema", async () => {
    const before = files(dir);
    const c = captureIo();
    expect(await command(["--export", dir], c.io)).toBe(0);
    expect(files(dir)).toEqual([...before, MAPPING_FILE].sort());
    const written = JSON.parse(readFileSync(join(dir, MAPPING_FILE), "utf8"));
    expect(Mapping.safeParse(written).success).toBe(true);
    expect(c.out()).toContain("3 boards");
    expect(c.out()).toContain(
      "people: 2 staff, 1 guests as contacts, 1 unmatched",
    );
    expect(closed).toBe(1);
  });

  it("keeps an existing mapping unless --force", async () => {
    writeFileSync(join(dir, MAPPING_FILE), "{}\n");
    const c = captureIo();
    expect(await command([`--export=${dir}`], c.io)).toBe(1);
    expect(c.err()).toContain("--force");
    expect(readFileSync(join(dir, MAPPING_FILE), "utf8")).toBe("{}\n");
    expect(closed).toBe(0);

    expect(await command(["--export", dir, "--force"], captureIo().io)).toBe(0);
    expect(
      JSON.parse(readFileSync(join(dir, MAPPING_FILE), "utf8")).version,
    ).toBe(2);
  });

  it("warns about boards without .done", async () => {
    rmSync(join(dir, "boards/202/.done"));
    const c = captureIo();
    expect(await command(["--export", dir], c.io)).toBe(0);
    expect(c.err()).toContain("board 202 Desarrollos has no .done");
  });

  it("refuses a folder that isn't an export", async () => {
    rmSync(join(dir, "manifest.json"));
    await expect(command(["--export", dir], captureIo().io)).rejects.toThrow(
      /manifest\.json not found/,
    );
    expect(existsSync(join(dir, MAPPING_FILE))).toBe(false);
  });

  it("parses its arguments", () => {
    expect(parseInitArgs(["--export", "exports/acme"])).toEqual({
      exportDir: "exports/acme",
      force: false,
    });
    expect(parseInitArgs(["--export=exports/acme", "--force"])).toEqual({
      exportDir: "exports/acme",
      force: true,
    });
    expect(parseInitArgs([])).toMatch(/--export/);
    expect(parseInitArgs(["--export", "x", "--boards"])).toMatch(
      /unknown option/,
    );
  });
});

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

describe.skipIf(!url)("init lookups (test DB)", () => {
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

  it("matches staff by lower(email) and custom statuses by lower(name)", async () => {
    await inTx(async (tx) => {
      const [s] = await tx
        .insert(schema.staff)
        .values({ name: "Init Ana", email: "Init.Ana@Cincel.mx" })
        .returning();
      const [st] = await tx
        .insert(schema.taskStatuses)
        .values({ name: "Revisión Init" })
        .returning();
      const lookups = createDbLookups(tx);
      expect(
        await lookups.staffByEmail(["init.ana@cincel.MX", "nadie@x.mx"]),
      ).toEqual(new Map([["init.ana@cincel.mx", s.id]]));
      expect((await lookups.customStatuses()).get("revisión init")).toBe(st.id);
    });
  });

  it("matches clients by trigram ≥ 0.8 and contacts by lower(name)", async () => {
    await inTx(async (tx) => {
      const [c] = await tx
        .insert(schema.contacts)
        .values({ type: "cliente", name: "Residencial Lomas Init" })
        .returning();
      await tx
        .insert(schema.contacts)
        .values({ type: "proveedor", name: "Herrería Init" });
      const lookups = createDbLookups(tx);
      expect(await lookups.matchClient("residencial lomas init")).toBe(c.id);
      expect(await lookups.matchClient("Lomas")).toBeNull();
      expect(
        await lookups.contactsByName("cliente", [
          "RESIDENCIAL LOMAS INIT",
          "Herrería Init",
        ]),
      ).toEqual(new Map([["residencial lomas init", c.id]]));
    });
  });

  it("reads tramos with their fases, templates ≥ 0.85 with their fase, and the saved status map", async () => {
    await inTx(async (tx) => {
      const [wf] = await tx
        .insert(schema.workflows)
        .values({ key: "init-obra", name: "Obra Init" })
        .returning();
      const [fase] = await tx
        .insert(schema.workflowPhases)
        .values({ workflowId: wf.id, name: "Levantamiento Init", sortOrder: 1 })
        .returning();
      const [tpl] = await tx
        .insert(schema.workflowTaskTemplates)
        .values({ workflowId: wf.id, phaseId: fase.id, title: "Levantamiento topográfico" })
        .returning();
      await tx
        .insert(schema.workflowTaskTemplates)
        .values({ workflowId: wf.id, phaseId: fase.id, title: "Retirado", active: false });
      await tx
        .insert(schema.appSettings)
        .values({
          key: "monday.status_map",
          value: JSON.stringify({ "en proceso": { target: { status: "en_proceso" } } }),
        })
        .onConflictDoUpdate({
          target: schema.appSettings.key,
          set: { value: JSON.stringify({ "en proceso": { target: { status: "en_proceso" } } }) },
        });
      const lookups = createDbLookups(tx);
      const obra = (await lookups.workflows()).find((w) => w.id === wf.id);
      expect(obra).toEqual({
        id: wf.id,
        name: "Obra Init",
        phases: [{ id: fase.id, name: "Levantamiento Init", sortOrder: 1, active: true }],
      });
      const found = await lookups.templateCandidates(wf.id, [
        "Levantamiento Topográfico",
        "Planos",
        "Retirado",
      ]);
      expect(found.map((f) => [f.name, f.templateId, f.phaseId])).toEqual([
        ["Levantamiento Topográfico", tpl.id, fase.id],
      ]);
      expect(found[0].score).toBeGreaterThanOrEqual(0.85);
      expect(await lookups.savedStatusMap()).toEqual({
        "en proceso": { target: { status: "en_proceso" }, priority: null },
      });
    });
  });
});
