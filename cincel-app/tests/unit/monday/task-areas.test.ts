// @vitest-environment node
/**
 * Tasks take the área and workflow of their monday value (#686): translate, the plan checks and the Vista previa
 * samples over one small board whose items carry an Área column.
 */
import { describe, expect, it } from "vitest";

import { buildPreview } from "@/lib/monday-import/preview";
import { Mapping, type MappingInput } from "@/scripts/monday/mapping.schema";
import { buildPlan, type PlanLookups } from "@/scripts/monday/plan";
import {
  taskAreaValue,
  translate,
  type CincelLookups,
  type ExportData,
} from "@/scripts/monday/translate";

const ADMIN = "68600000-0000-4000-8000-000000000001";
const CLIENT = "68600000-0000-4000-8000-0000000000c1";
const AREA_DISENO = "68600000-0000-4000-8000-0000000000a1";
const AREA_OBRA = "68600000-0000-4000-8000-0000000000a2";
const AREA_BOARD = "68600000-0000-4000-8000-0000000000a3";
const WF_BOARD = "68600000-0000-4000-8000-0000000000f0";
const WF_DISENO = "68600000-0000-4000-8000-0000000000f1";
const WF_OBRA = "68600000-0000-4000-8000-0000000000f2";
const WF_DECO = "68600000-0000-4000-8000-0000000000f3";
const TPL_PLANOS = "68600000-0000-4000-8000-0000000000e1";
const TPL_BOARD = "68600000-0000-4000-8000-0000000000e2";

const text = (id: string, value: string | null) => ({ __typename: "TextValue", id, type: "text", text: value });
const status = (id: string, label: string | null) => ({
  __typename: "StatusValue",
  id,
  type: "status",
  text: label,
  label,
  index: null,
  is_done: false,
});

function item(id: string, name: string, groupId: string, area: string | null, subitems: unknown[] = []) {
  return {
    id,
    name,
    state: "active",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    creator_id: null,
    group: { id: groupId },
    parent_item: null,
    assets: [],
    column_values: [status("area", area), text("nota", null)],
    subitems,
  };
}

function exportData(): ExportData {
  return {
    users: [],
    boards: [
      {
        board: {
          id: "861",
          name: "Casa Prueba",
          workspace_id: null,
          hierarchy_type: "classic",
          columns: [
            { id: "name", title: "Name", type: "name", settings: {} },
            { id: "area", title: "Área", type: "status", settings: {} },
            { id: "nota", title: "Nota", type: "text", settings: {} },
          ],
          groups: [
            { id: "g_a", title: "Diseño", position: "1" },
            { id: "g_b", title: "Obra", position: "2" },
          ],
          subitem_columns: [{ id: "name", title: "Name", type: "name", settings: {} }],
        },
        items: [
          item("8601", "Planos", "g_a", "Diseño", [
            { ...item("8611", "Cotas", "g_a", null), column_values: [] },
          ]),
          item("8602", "Muros", "g_b", "Obra"),
          item("8603", "Cortinas", "g_b", "Decoración"),
          item("8604", "Limpieza", "g_b", "Mantenimiento"),
          item("8605", "Revisión", "g_b", null),
        ],
      },
    ],
  } as unknown as ExportData;
}

function mappingInput(overrides: Partial<MappingInput["boards"][number]> = {}): MappingInput {
  return {
    version: 1,
    boards: [
      {
        mondayBoardId: "861",
        name: "Casa Prueba",
        strategy: "board_as_project",
        client: { kind: "contact", contactId: CLIENT },
        areaId: AREA_BOARD,
        workflowId: WF_BOARD,
        columns: { name: "title", area: "ignore", nota: "ignore" },
        statusMaps: {},
        subitems: "child_tasks",
        templateMatches: { "8605": TPL_BOARD },
        taskAreaSource: { kind: "column", columnId: "area" },
        taskAreas: {
          Diseño: { action: "area", areaId: AREA_DISENO, workflowId: WF_DISENO },
          Obra: { action: "area", areaId: AREA_OBRA, workflowId: WF_OBRA },
          Decoración: { action: "create_area", name: "Decoración", workflowId: WF_DECO },
        },
        ...overrides,
      },
    ],
    people: {},
    options: { includeUpdates: false, includeFiles: false },
  };
}

const lookups: CincelLookups = {
  customStatuses: {},
  templates: {
    [TPL_PLANOS]: { workflowId: WF_DISENO },
    [TPL_BOARD]: { workflowId: WF_BOARD },
  },
  templateTitles: { [TPL_PLANOS]: "planos", [TPL_BOARD]: "Revisión" },
  staff: {},
  workflows: {
    [WF_BOARD]: { name: "General" },
    [WF_DISENO]: { name: "Diseño" },
    [WF_OBRA]: { name: "Construcción" },
    [WF_DECO]: { name: "Decoración" },
  },
  areas: {
    [AREA_DISENO]: { name: "Diseño" },
    [AREA_OBRA]: { name: "Construcción" },
    [AREA_BOARD]: { name: "Proyectos" },
  },
};

const run = (input: MappingInput = mappingInput()) =>
  translate(exportData(), Mapping.parse(input), lookups, { importedById: ADMIN });
const taskOf = (r: ReturnType<typeof run>, id: string) => r.tasks.find((t) => t.externalId === id)!;

describe("task área and workflow (#686)", () => {
  it("defaults to the board's workflow for every task", () => {
    const parsed = Mapping.parse(mappingInput({ taskAreaSource: undefined, taskAreas: undefined }));
    expect(parsed.boards[0].taskAreaSource).toEqual({ kind: "board" });
    const r = translate(exportData(), parsed, lookups, { importedById: ADMIN });
    expect(r.tasks.filter((t) => !t.parentTask).every((t) => t.workflowId === WF_BOARD && t.area === null)).toBe(true);
    expect(r.areas).toEqual([]);
    expect(r.projects[0].extraStages).toBeUndefined();
  });

  it("gives each task the área and workflow its column value maps to", () => {
    const r = run();
    expect(taskOf(r, "8601")).toMatchObject({
      workflowId: WF_DISENO,
      area: { value: "Diseño", status: "mapped", areaId: AREA_DISENO, newArea: null },
    });
    expect(taskOf(r, "8602")).toMatchObject({
      kind: "usuario",
      templateId: null,
      workflowId: WF_OBRA,
      area: { status: "mapped", areaId: AREA_OBRA },
    });
  });

  it("matches the template of the task's own workflow by name", () => {
    const r = run();
    expect(taskOf(r, "8601")).toMatchObject({ kind: "workflow", templateId: TPL_PLANOS, workflowId: WF_DISENO });
  });

  it("keeps the board's workflow and hand-picked template for values left unmapped or empty", () => {
    const r = run();
    expect(taskOf(r, "8604")).toMatchObject({
      workflowId: WF_BOARD,
      area: { value: "Mantenimiento", status: "unmapped" },
    });
    expect(taskOf(r, "8605")).toMatchObject({ kind: "workflow", templateId: TPL_BOARD, area: null });
    expect(r.issues.filter((i) => i.code === "AREA_UNMAPPED")).toEqual([
      expect.objectContaining({ boardId: "861", message: expect.stringContaining('"Mantenimiento"') }),
    ]);
  });

  it("ignores a value on request: the board's workflow, no issue", () => {
    const input = mappingInput();
    input.boards[0].taskAreas = { ...input.boards[0].taskAreas, Mantenimiento: { action: "ignore" } };
    const r = run(input);
    expect(taskOf(r, "8604")).toMatchObject({ workflowId: WF_BOARD, area: { status: "ignored" } });
    expect(r.issues.some((i) => i.code === "AREA_UNMAPPED")).toBe(false);
  });

  it("plans a new área once, linked to its workflow", () => {
    const r = run();
    expect(r.areas).toEqual([
      { entity: "area", externalId: "name:decoración", name: "Decoración", workflowIds: [WF_DECO] },
    ]);
    expect(taskOf(r, "8603")).toMatchObject({ workflowId: WF_DECO, area: { newArea: "Decoración" } });
  });

  it("lets child tasks without a value keep their parent's área and workflow", () => {
    const r = run();
    const child = taskOf(r, "8611");
    expect(child.parentTask).toEqual({ kind: "planned", entity: "task", externalId: "8601" });
    expect(child).toMatchObject({ workflowId: WF_DISENO, area: { status: "mapped", areaId: AREA_DISENO } });
  });

  it("adds every workflow its tasks use to the project's stages", () => {
    const [project] = run().projects;
    expect(project.workflowId).toBe(WF_BOARD);
    expect(new Set(project.extraStages)).toEqual(new Set([WF_DISENO, WF_OBRA, WF_DECO]));
    expect(project.data.stageWorkflowIds).toEqual(project.extraStages);
  });

  it("takes the área from the monday group", () => {
    const r = run(
      mappingInput({
        taskAreaSource: { kind: "group" },
        taskAreas: {
          g_a: { action: "area", areaId: AREA_DISENO, workflowId: WF_DISENO },
          g_b: { action: "area", areaId: AREA_OBRA, workflowId: WF_OBRA },
        },
      }),
    );
    expect(taskOf(r, "8601")).toMatchObject({ workflowId: WF_DISENO, area: { value: "Diseño" } });
    expect(["8602", "8603", "8604", "8605"].map((id) => taskOf(r, id).workflowId)).toEqual([
      WF_OBRA,
      WF_OBRA,
      WF_OBRA,
      WF_OBRA,
    ]);
    expect(r.areas).toEqual([]);
  });

  it("reads a dropdown's first label and a status label as the value", () => {
    const dropdown = { column_values: [{ __typename: "DropdownValue", id: "d", text: " Diseño, Obra " }] };
    const label = { column_values: [status("s", "Obra")] };
    expect(taskAreaValue(dropdown as never, "d")).toBe("Diseño");
    expect(taskAreaValue(label as never, "s")).toBe("Obra");
    expect(taskAreaValue(label as never, "missing")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// plan checks and Vista previa
// ---------------------------------------------------------------------------

function planLookups(overrides: { areaNames?: string[]; areaFlows?: Record<string, string[]> } = {}): PlanLookups {
  const areaFlows = overrides.areaFlows ?? {
    [AREA_DISENO]: [WF_DISENO],
    [AREA_OBRA]: [WF_OBRA],
    [AREA_BOARD]: [WF_BOARD],
  };
  const live = new Set([WF_BOARD, WF_DISENO, WF_OBRA, WF_DECO]);
  return {
    translateLookups: async () => lookups,
    importedRefs: async () => new Map(),
    importedAssets: async () => new Set(),
    contactTypes: async (ids) => new Map(ids.filter((id) => id === CLIENT).map((id) => [id, "cliente" as const])),
    contactNamesTaken: async () => new Set(),
    projectNamesTaken: async () => new Set(),
    projectCodesTaken: async () => new Set(),
    workflowIds: async (ids) => new Set(ids.filter((id) => live.has(id))),
    areaWorkflowIds: async (ids) => new Map(ids.filter((id) => areaFlows[id]).map((id) => [id, areaFlows[id]])),
    projectTemplatesTaken: async () => new Set(),
    foreignSchedules: async () => new Set(),
    areaNamesTaken: async (names) => new Set(names.filter((n) => (overrides.areaNames ?? []).includes(n))),
  };
}

describe("plan and Vista previa for task áreas (#686)", () => {
  it("warns about unmapped values without blocking", async () => {
    const plan = await buildPlan(exportData(), mappingInput(), planLookups());
    const unmapped = plan.issues.filter((i) => i.code === "AREA_UNMAPPED");
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0].blocking).toBe(false);
    expect(plan.issues.filter((i) => i.blocking)).toEqual([]);
  });

  it("blocks an área to create whose name exists already", async () => {
    const plan = await buildPlan(exportData(), mappingInput(), planLookups({ areaNames: ["decoración"] }));
    expect(plan.issues).toContainEqual(
      expect.objectContaining({ code: "AREA_NAME_TAKEN", blocking: true, boardId: "861" }),
    );
  });

  it("rejects a workflow that is not one of the área's, and an área that doesn't exist", async () => {
    const input = mappingInput();
    input.boards[0].taskAreas = {
      Diseño: { action: "area", areaId: AREA_DISENO, workflowId: WF_OBRA },
      Obra: { action: "area", areaId: "68600000-0000-4000-8000-0000000000a9", workflowId: null },
    };
    const plan = await buildPlan(exportData(), input, planLookups());
    const messages = plan.issues.filter((i) => i.code === "MAPPING_INVALID").map((i) => i.message);
    expect(messages).toContainEqual(expect.stringMatching(/^taskAreas\.Diseño: workflow .* is not a workflow of area/));
    expect(messages).toContainEqual(expect.stringMatching(/^taskAreas\.Obra: area .* does not exist/));
  });

  it("shows each sample task's área and workflow and flags the unmapped ones", async () => {
    const plan = await buildPlan(exportData(), mappingInput(), planLookups());
    const preview = buildPreview(plan, exportData(), lookups);
    const samples = preview.boards[0].samples.filter((s) => s.entity === "tarea");
    const byId = new Map(samples.map((s) => [s.mondayItemId, s.cincel]));
    expect(byId.get("8601")).toMatchObject({ area: "Diseño", workflow: "Diseño", areaUnmapped: false });
    expect(byId.get("8602")).toMatchObject({ area: "Construcción", workflow: "Construcción" });
    expect(byId.get("8603")).toMatchObject({ area: "Decoración (nueva)", workflow: "Decoración" });
    expect(byId.get("8604")).toMatchObject({ area: "Proyectos", workflow: "General", areaUnmapped: true });
    // The preview's workflows are the ones apply writes.
    for (const t of plan.translation!.result.tasks.filter((t) => !t.parentTask)) {
      if (!byId.has(t.externalId)) continue;
      expect(byId.get(t.externalId)!.workflow).toBe(lookups.workflows![t.workflowId!].name);
    }
  });
});
