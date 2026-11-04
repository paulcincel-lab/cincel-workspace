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
  encodeClient,
  encodePerson,
  encodeStatusTarget,
  estimatedCallsFor,
  findBoard,
  groupEquivalent,
  initialStep,
  jobPercent,
  nextStep,
  previousStep,
  projectKeys,
  rollbackBlockerText,
  setBoardArea,
  setBoardWorkflow,
  setColumnTarget,
  setOptions,
  setPerson,
  setRecordEntry,
  setStatusTarget,
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
import { draftMapping, readExport, statusLabels, type InitLookups } from "@/scripts/monday/init";
import type { MappingInput } from "@/scripts/monday/mapping.schema";

const FIXTURE = resolve(__dirname, "../../scripts/monday/__fixtures__/export-init");

const ID = {
  ana: "00000000-0000-4000-8000-0000000000a1",
  area: "00000000-0000-4000-8000-0000000000f6",
  otherArea: "00000000-0000-4000-8000-0000000000f7",
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
  matchArea: async () => null,
  areaWorkflows: async () => [],
  templateCandidates: async () => [],
};

const choices: MondayImportChoices = {
  statuses: [{ id: ID.custom, name: "Revisión cliente", closes: false }],
  areas: [
    { id: ID.area, name: "Construcción", workflowIds: [ID.wfObra] },
    { id: ID.otherArea, name: "Diseño", workflowIds: [] },
  ],
  workflows: [
    { id: ID.wfObra, name: "Obra" },
    { id: ID.wfOther, name: "Otro" },
  ],
  templates: [
    { id: ID.tplObra, workflowId: ID.wfObra, name: "Levantamiento" },
    { id: ID.tplOther, workflowId: ID.wfOther, name: "Otro" },
  ],
  clients: [{ id: ID.acme, name: "Acme" }],
  staff: [{ id: ID.ana, name: "Ana Admin", email: "ana@cincel.mx" }],
  providerSubtypes: [],
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
  it("prefills every status label of a status column from init", () => {
    const board = findBoard(mapping, "101")!;
    const labelIds = boardSource("101").statusLabels.status.map((l) => l.id);
    expect(Object.keys(board.statusMaps.status).sort()).toEqual([...labelIds].sort());
  });

  it("adds a status map with defaults when a column becomes status, and drops it otherwise", () => {
    const board = findBoard(mapping, "101")!;
    const src = boardSource("101");
    const off = setColumnTarget(board, src, "status_1", "ignore");
    expect(off.statusMaps.status_1).toBeUndefined();
    const on = setColumnTarget(off, src, "status_1", "status");
    const listo = src.statusLabels.status_1.find((l) => l.name === "Listo")!;
    const detenido = src.statusLabels.status_1.find((l) => l.name === "Detenido")!;
    expect(on.statusMaps.status_1[listo.id]).toEqual({ status: "completado" });
    expect(on.statusMaps.status_1[detenido.id]).toEqual({ status: "pendiente" });
    expect(on.columns.status_1).toBe("status");
  });

  it("sets one status label, keeping the others", () => {
    const board = findBoard(mapping, "101")!;
    const [first, second] = Object.keys(board.statusMaps.status);
    const next = setStatusTarget(board, "status", first, { customStatusId: ID.custom });
    expect(next.statusMaps.status[first]).toEqual({ customStatusId: ID.custom });
    expect(next.statusMaps.status[second]).toEqual(board.statusMaps.status[second]);
  });

  it("picks the área's only workflow and drops templates of another workflow", () => {
    const board = { ...findBoard(mapping, "101")!, workflowId: ID.wfOther, templateMatches: { x: ID.tplOther } };
    const withArea = setBoardArea(board, ID.area, choices);
    expect(withArea.workflowId).toBe(ID.wfObra);
    expect(setBoardWorkflow(withArea, ID.wfObra, choices).templateMatches).toEqual({});
    const kept = setBoardWorkflow({ ...board, templateMatches: { x: ID.tplOther } }, ID.wfOther, choices);
    expect(kept.templateMatches).toEqual({ x: ID.tplOther });
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
