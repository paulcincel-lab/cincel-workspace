// @vitest-environment node
/**
 * Step logic of the monday import wizard (#672) over the CLI fixture export
 * (scripts/monday/__fixtures__/export-init) drafted by init with fake lookups.
 */
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  canAdvance,
  clampOptions,
  countLabel,
  decodeClient,
  decodePerson,
  decodeStatusTarget,
  defaultStatusTarget,
  encodeClient,
  encodePerson,
  encodeStatusTarget,
  estimatedCallsFor,
  findBoard,
  groupEquivalent,
  initialStep,
  isDefaultedStatus,
  jobPercent,
  nextStep,
  previousStep,
  projectKeys,
  rollbackBlockerText,
  COLUMN_TARGET_LABELS,
  setBoardWorkflow,
  setColumnTarget,
  setOptions,
  setPerson,
  setRecordEntry,
  subitemsSection,
  suggestStaff,
  unmappedPeople,
  updateBoard,
  validateMapping,
  type WizardState,
} from "@/lib/monday-import/wizard-steps";
import type {
  MondayBoardSource,
  MondayConnection,
  MondayExportSource,
  MondayImportChoices,
  MondayImportJob,
  MondayImportRunState,
} from "@/lib/types/monday-import";
import { customStatusIndex } from "@/lib/monday-import/status-map";
import { draftMapping, readExport, statusLabels, type InitLookups } from "@/scripts/monday/init";
import type { MappingInput } from "@/scripts/monday/mapping.schema";

const FIXTURE = resolve(__dirname, "../../scripts/monday/__fixtures__/export-init");

const ID = {
  ana: "00000000-0000-4000-8000-0000000000a1",
  faseObra: "00000000-0000-4000-8000-0000000000f6",
  faseOther: "00000000-0000-4000-8000-0000000000f7",
  wfObra: "00000000-0000-4000-8000-000000000101",
  wfOther: "00000000-0000-4000-8000-000000000102",
  tplObra: "00000000-0000-4000-8000-000000000201",
  tplOther: "00000000-0000-4000-8000-000000000202",
  custom: "00000000-0000-4000-8000-0000000000c3",
  acme: "00000000-0000-4000-8000-0000000000e5",
};

/** Nothing exists in Cincel but Ana: init leaves the rest for the wizard. */
const lookups: InitLookups = {
  staffByEmail: async () => new Map([["ana@cincel.mx", ID.ana]]),
  customStatuses: async () => new Map(),
  matchClient: async () => null,
  contactsByName: async () => new Map(),
  workflows: async () => [],
  savedStatusMap: async () => ({}),
  templateCandidates: async () => [],
};

const choices: MondayImportChoices = {
  statuses: [{ id: ID.custom, name: "Revisión cliente", closes: false, countsAsCompleted: false }],
  workflows: [
    { id: ID.wfObra, name: "Obra", phases: [{ id: ID.faseObra, name: "Levantamiento", sortOrder: 1 }] },
    { id: ID.wfOther, name: "Otro", phases: [{ id: ID.faseOther, name: "Otra fase", sortOrder: 1 }] },
  ],
  templates: [
    { id: ID.tplObra, workflowId: ID.wfObra, phaseId: ID.faseObra, name: "Levantamiento" },
    { id: ID.tplOther, workflowId: ID.wfOther, phaseId: ID.faseOther, name: "Otro" },
  ],
  positions: [],
  clients: [{ id: ID.acme, name: "Acme" }],
  staff: [{ id: ID.ana, name: "Ana Admin", email: "ana@cincel.mx" }],
  providerSubtypes: [],
  statusMap: {},
};

let mapping: MappingInput;
let source: MondayExportSource;

beforeAll(async () => {
  const data = await readExport(FIXTURE);
  mapping = JSON.parse(JSON.stringify(await draftMapping(data, lookups))) as MappingInput;
  const labels = (cols: { id: string; type: string; title: string; settings: unknown }[]) => {
    const out: Record<string, { id: string; name: string; isDone: boolean }[]> = {};
    for (const c of cols.filter((col) => col.type === "status")) {
      const list = (out[c.id] ??= []);
      for (const l of statusLabels(c as never)) {
        if (!list.some((x) => x.id === l.id)) list.push({ id: l.id, name: l.label, isDone: l.isDone });
      }
    }
    return out;
  };
  source = {
    boards: data.boards.map(({ board, items }) => ({
      id: board.id,
      name: board.name,
      columns: board.columns.map((c) => ({ id: c.id, title: c.title, type: c.type })),
      subitemColumns: (board.subitem_columns ?? []).map((c) => ({ id: c.id, title: c.title, type: c.type })),
      groups: board.groups.map((g) => ({ id: g.id, title: g.title })),
      statusLabels: labels([...board.columns, ...(board.subitem_columns ?? [])]),
      itemCount: items.length,
      items: items.map((i) => ({ id: i.id, name: i.name, groupId: i.group?.id ?? null })),
    })),
    users: data.users.map((u) => ({ id: u.id, name: u.name, email: u.email ?? null, kind: u.kind ?? null })),
    hasFiles: false,
    hasUpdates: true,
  };
});

const boardSource = (id: string): MondayBoardSource => source.boards.find((b) => b.id === id)!;

function job(overrides: Partial<MondayImportJob> = {}): MondayImportJob {
  return {
    kind: "export",
    status: "running",
    startedAt: "2026-11-04T00:00:00.000Z",
    finishedAt: null,
    progress: { done: 1, total: 4, label: "Exportando tableros" },
    log: [],
    error: null,
    ...overrides,
  };
}

function run(overrides: Partial<MondayImportRunState> = {}): MondayImportRunState {
  return {
    runId: "run-1",
    createdAt: "2026-11-04T00:00:00.000Z",
    updatedAt: "2026-11-04T00:00:00.000Z",
    step: "conectar",
    account: null,
    boardIds: ["101"],
    exportOptions: { updates: true, files: true },
    exported: false,
    mapping: null,
    jobs: {},
    batchId: null,
    batchStatus: null,
    ...overrides,
  };
}

describe("steps", () => {
  it("walks the seven steps in order and stops at the ends", () => {
    expect(nextStep("conectar")).toBe("tableros");
    expect(nextStep("vista_previa")).toBe("importar");
    expect(nextStep("importar")).toBe("importar");
    expect(previousStep("conectar")).toBe("conectar");
    expect(previousStep("personas")).toBe("equivalencias");
  });

  it("resumes at the saved step once exported, else connects again", () => {
    expect(initialStep(null)).toBe("conectar");
    expect(initialStep(run())).toBe("conectar");
    expect(initialStep(run({ jobs: { export: job() } }))).toBe("tableros");
    expect(initialStep(run({ exported: true, mapping, step: "personas" }))).toBe("personas");
    expect(initialStep(run({ exported: true, mapping, step: "conectar" }))).toBe("tableros");
    expect(initialStep(run({ exported: true, mapping, step: "opciones", batchId: "b1" }))).toBe("importar");
  });

  it("enables Siguiente only when the step is done", () => {
    const base: WizardState = { connection: null, run: run(), selectedBoardIds: [], mapping: null, preview: null };
    expect(canAdvance("conectar", base)).toBe(false);
    expect(canAdvance("conectar", { ...base, connection: {} as MondayConnection })).toBe(true);
    expect(canAdvance("tableros", base)).toBe(false);
    const exported = { ...base, run: run({ exported: true, mapping }), mapping };
    expect(canAdvance("tableros", exported)).toBe(true);
    expect(canAdvance("tableros", { ...exported, run: run({ exported: true, jobs: { export: job() } }) })).toBe(false);
    expect(canAdvance("equivalencias", exported)).toBe(true);
    expect(canAdvance("vista_previa", exported)).toBe(false);
    expect(canAdvance("vista_previa", { ...exported, preview: { canApply: true } as never })).toBe(true);
    expect(canAdvance("importar", exported)).toBe(false);
  });

  it("validates the draft with mapping.schema.ts", () => {
    expect(validateMapping(mapping)).toEqual([]);
    expect(validateMapping(null)).toHaveLength(1);
    const broken = updateBoard(mapping, "101", (b) => ({ ...b, client: { kind: "new", name: "" } }));
    expect(validateMapping(broken)[0]).toMatch(/^boards\.0\.client\.name: /);
    expect(canAdvance("equivalencias", { connection: null, run: null, selectedBoardIds: [], mapping: broken, preview: null }))
      .toBe(false);
  });
});

describe("select encodings", () => {
  it("round-trips status targets", () => {
    for (const target of [{ status: "en_proceso" as const }, { customStatusId: ID.custom }]) {
      expect(decodeStatusTarget(encodeStatusTarget(target))).toEqual(target);
    }
    expect(decodeStatusTarget("status:otro")).toBeNull();
  });

  it("round-trips clients; new takes the board name", () => {
    expect(decodeClient(encodeClient({ kind: "contact", contactId: ID.acme }), "X")).toEqual({
      kind: "contact",
      contactId: ID.acme,
    });
    expect(decodeClient(encodeClient({ kind: "relation_column", columnId: "cliente" }), "X")).toEqual({
      kind: "relation_column",
      columnId: "cliente",
    });
    expect(decodeClient("new", "Casa Pérez")).toEqual({ kind: "new", name: "Casa Pérez", contactKind: "empresa" });
    expect(decodeClient(encodeClient(null), "X")).toBeNull();
  });

  it("round-trips people", () => {
    for (const target of [
      { action: "staff" as const, staffId: ID.ana },
      { action: "contact" as const },
      { action: "contact" as const, contactId: ID.acme },
      { action: "ignore" as const },
      null,
    ]) {
      expect(decodePerson(encodePerson(target))).toEqual(target);
    }
  });
});

describe("draft edits over the fixture", () => {
  it("drafts the firm-wide status map with every label of the status columns", () => {
    const keys = Object.keys(mapping.statusMap ?? {});
    for (const label of boardSource("101").statusLabels.status) expect(keys).toContain(label.name.trim().toLowerCase());
  });

  it("sets a column's field without touching the status map", () => {
    const board = findBoard(mapping, "101")!;
    const off = setColumnTarget(board, "status_1", "ignore");
    expect(off.columns.status_1).toBe("ignore");
    expect(setColumnTarget(off, "status", "people", true).subitemColumns?.status).toBe("people");
  });

  it("labels the date targets for the project flow", () => {
    expect(COLUMN_TARGET_LABELS.timeline).toBe("Línea de tiempo → compromiso y entrega");
    expect(COLUMN_TARGET_LABELS.closed_date).toBe("Fecha que finalizó");
  });

  it("defaults labels with the firm-wide table, never Completado unless done or the table says so", () => {
    expect(defaultStatusTarget({ name: "Urgente", isDone: false })).toEqual({ status: "pendiente", defaulted: true });
    expect(defaultStatusTarget({ name: "Completado", isDone: false })).toEqual({ status: "pendiente", defaulted: true });
    expect(defaultStatusTarget({ name: "Pendiente", isDone: false })).toEqual({ status: "pendiente" });
    expect(defaultStatusTarget({ name: "Listo", isDone: true })).toEqual({ status: "completado" });
    expect(defaultStatusTarget({ name: "Entregado", isDone: false })).toEqual({ status: "completado" });
    const seeded = customStatusIndex([{ id: ID.custom, name: "En espera" }]);
    expect(defaultStatusTarget({ name: "En Espera", isDone: false }, seeded)).toEqual({ customStatusId: ID.custom });
    expect(isDefaultedStatus({ status: "pendiente", defaulted: true })).toBe(true);
    expect(isDefaultedStatus({ status: "pendiente" })).toBe(false);
    expect(isDefaultedStatus(undefined)).toBe(false);
  });

  it("keeps template matches of the etapas the board's tasks land in when the etapa changes", () => {
    const board = { ...findBoard(mapping, "101")!, workflowId: ID.wfOther, templateMatches: { x: ID.tplOther } };
    expect(setBoardWorkflow(board, ID.wfObra, choices).templateMatches).toEqual({});
    expect(setBoardWorkflow(board, ID.wfOther, choices).templateMatches).toEqual({ x: ID.tplOther });
    // A group mapped to a fase of the other etapa keeps that etapa's templates.
    const grouped = { ...board, groupTargets: { topics: { kind: "phase" as const, phaseId: ID.faseOther } } };
    expect(setBoardWorkflow(grouped, ID.wfObra, choices).templateMatches).toEqual({ x: ID.tplOther });
  });

  it("names projects by board, group or item for each strategy", () => {
    const board = findBoard(mapping, "101")!;
    const src = boardSource("101");
    expect(projectKeys(board, src)).toEqual([{ id: "101", mondayName: src.name }]);
    expect(projectKeys({ ...board, strategy: "group_as_project" }, src).map((k) => k.id)).toEqual(["topics", "g_obra"]);
    expect(projectKeys({ ...board, strategy: "item_as_project" }, src)).toHaveLength(src.items.length);
    expect(projectKeys({ ...board, strategy: "skip" }, src)).toEqual([]);
    expect(groupEquivalent("board_as_project", "Obra")).toBe("Fase «Obra» del proyecto");
    expect(groupEquivalent("group_as_project", "Obra")).toBe("Proyecto «Obra»");
  });

  it("sets and clears record entries", () => {
    expect(setRecordEntry({ a: "1" }, "b", "2")).toEqual({ a: "1", b: "2" });
    expect(setRecordEntry({ a: "1" }, "a", " ")).toEqual({});
  });

  it("maps people and suggests staff by email", () => {
    expect(mapping.people["1"]).toEqual({ action: "staff", staffId: ID.ana });
    expect(unmappedPeople(mapping, source).map((u) => u.id)).toEqual(["2", "4"]);
    const next = setPerson(mapping, "2", { action: "ignore" });
    expect(unmappedPeople(next, source).map((u) => u.id)).toEqual(["4"]);
    expect(suggestStaff({ email: "ANA@cincel.mx " }, choices.staff)?.id).toBe(ID.ana);
    expect(suggestStaff({ email: null }, choices.staff)).toBeNull();
  });

  it("forces disabled options off", () => {
    const next = setOptions(mapping, { includeUpdates: true, includeFiles: true }, { updates: false, files: true });
    expect(next.options).toEqual({ includeUpdates: true, includeFiles: false });
    expect(validateMapping(next)).toEqual([]);
  });

  it("turns off files in the draft when Drive is not configured", () => {
    const withFiles = setOptions(mapping, { includeUpdates: true, includeFiles: true }, { updates: false, files: false });
    const noDrive = { filesDisabledReason: "Drive no está configurado.", updatesDisabledReason: null };
    expect(clampOptions(withFiles, noDrive).options).toEqual({ includeUpdates: true, includeFiles: false });
    const allowed = { filesDisabledReason: null, updatesDisabledReason: null };
    expect(clampOptions(withFiles, allowed)).toBe(withFiles);
    const off = setOptions(withFiles, { includeUpdates: true, includeFiles: false }, { updates: false, files: false });
    expect(clampOptions(off, noDrive)).toBe(off);
  });
});

describe("progress and results", () => {
  it("turns job progress into a percent", () => {
    expect(jobPercent(undefined)).toBeNull();
    expect(jobPercent(job())).toBe(25);
    expect(jobPercent(job({ progress: { done: 0, total: null, label: "" } }))).toBeNull();
    expect(jobPercent(job({ status: "succeeded" }))).toBe(100);
  });

  it("adds up the picked boards' calls", () => {
    const connection = {
      boards: [
        { id: "101", estimatedCalls: 3 },
        { id: "202", estimatedCalls: 5 },
      ],
    } as MondayConnection;
    expect(estimatedCallsFor(connection, ["202"])).toBe(5);
    expect(estimatedCallsFor(null, ["202"])).toBe(0);
  });

  it("explains rollback blockers", () => {
    expect(rollbackBlockerText({ kind: "edited", table: "core.tasks", id: "t1", what: "Tarea «Muro»" })).toBe(
      "Se editó en Cincel después de importar: Tarea «Muro»",
    );
  });
});

describe("copy", () => {
  it("uses the singular for exactly one", () => {
    expect(countLabel(1, "tarea", "tareas")).toBe("1 tarea");
    expect(countLabel(0, "tarea", "tareas")).toBe("0 tareas");
    expect(countLabel(3, "proyecto", "proyectos")).toBe("3 proyectos");
    expect(countLabel(1200, "contacto", "contactos")).toBe("1,200 contactos");
  });

  it("explains Subelementos when the items are the projects", () => {
    const asProject = subitemsSection("item_as_project", "ignore");
    expect(asProject.description).toContain("serán las tareas del proyecto");
    expect(asProject.selectLabel).toBe("Subelementos de las tareas");
    expect(asProject.showColumns).toBe(true);

    expect(subitemsSection("group_as_project", undefined)).toMatchObject({ selectLabel: "Subelementos", showColumns: true });
    expect(subitemsSection("group_as_project", "ignore").showColumns).toBe(false);
  });
});
