// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  applyGroupAsProject,
  currentGroupTarget,
  decodeGroupTarget,
  encodeGroupTarget,
  groupTargetChoices,
  ownProjectGroups,
  pruneGroupTargets,
  setGroupTarget,
  suggestsGroupAsProject,
} from "@/lib/monday-import/group-targets";
import { projectKeys, type BoardDraft } from "@/lib/monday-import/wizard-steps";
import {
  groupPlacement,
  groupTargetCatalog,
  groupTargetKinds,
  groupsLookLikeClients,
  resolveGroupTarget,
} from "@/scripts/monday/group-targets";
import type { GroupTarget } from "@/scripts/monday/mapping.schema";
import type { MondayBoardSource, MondayImportChoices } from "@/lib/types/monday-import";

const PRESALE = "10000000-0000-4000-8000-000000000000";
const DISENO = "11111111-1111-4111-8111-111111111111";
const OBRA = "22222222-2222-4222-8222-222222222222";
const CLIENT = "33333333-3333-4333-8333-333333333333";

const ANTE = "a1000000-0000-4000-8000-000000000001";
const EJEC = "a1000000-0000-4000-8000-000000000002";
const RESID = "a2000000-0000-4000-8000-000000000001";
const POSTV = "a2000000-0000-4000-8000-000000000002";
const MINUTAS_P = "a0000000-0000-4000-8000-000000000001";
const MINUTAS_D = "a1000000-0000-4000-8000-000000000003";

const choices = {
  statuses: [],
  workflows: [
    { id: PRESALE, name: "Presale", phases: [{ id: MINUTAS_P, name: "Minutas", sortOrder: 0 }] },
    {
      id: DISENO,
      name: "Diseño",
      phases: [
        { id: ANTE, name: "Anteproyecto", sortOrder: 0 },
        { id: EJEC, name: "Ejecutivo", sortOrder: 1 },
        { id: MINUTAS_D, name: "Minutas", sortOrder: 2 },
      ],
    },
    {
      id: OBRA,
      name: "Construcción",
      phases: [
        { id: RESID, name: "Residencia", sortOrder: 0 },
        { id: POSTV, name: "Postventa", sortOrder: 1 },
      ],
    },
  ],
  templates: [],
  positions: [],
  clients: [
    { id: CLIENT, name: "Familia Pérez" },
    { id: "44444444-4444-4444-8444-444444444444", name: "Grupo Norte" },
  ],
  staff: [],
  providerSubtypes: [],
  statusMap: {},
} as unknown as MondayImportChoices;

const source: MondayBoardSource = {
  id: "301",
  name: "Casa Lomas",
  columns: [],
  subitemColumns: [],
  groups: [
    { id: "g_ante", title: "Anteproyecto" },
    { id: "g_extra", title: "Extras" },
  ],
  statusLabels: {},
  itemCount: 0,
  items: [],
};

function board(overrides: Partial<BoardDraft> = {}): BoardDraft {
  return {
    mondayBoardId: "301",
    name: "Casa Lomas",
    strategy: "board_as_project",
    workflowId: DISENO,
    columns: {},
    ...overrides,
  } as BoardDraft;
}

const group = (title: string, id = "g") => ({ id, title });

describe("groupTargetKinds", () => {
  it("offers the six kinds on board_as_project and all but project on item_as_project", () => {
    expect(groupTargetKinds("board_as_project")).toEqual(["etapa", "phase", "space", "project", "admin", "ignore"]);
    expect(groupTargetKinds("item_as_project")).toEqual(["etapa", "phase", "space", "admin", "ignore"]);
    expect(groupTargetKinds("group_as_project")).toEqual([]);
    expect(groupTargetKinds("crm_contacts")).toEqual([]);
    expect(groupTargetKinds("skip")).toEqual([]);
  });
});

describe("resolveGroupTarget defaults", () => {
  for (const strategy of ["board_as_project", "item_as_project"] as const) {
    describe(strategy, () => {
      const b = (overrides: Partial<BoardDraft> = {}) => board({ strategy, ...overrides });

      it("a title equal to a etapa name (case and accents aside) → that etapa", () => {
        expect(resolveGroupTarget(b(), group("CONSTRUCCION"), choices)).toEqual({ kind: "etapa", workflowId: OBRA });
        expect(resolveGroupTarget(b(), group(" diseno "), choices)).toEqual({ kind: "etapa", workflowId: DISENO });
      });

      it("a fase of the board's etapa → that fase, even when other etapas have one of that name", () => {
        expect(resolveGroupTarget(b(), group("anteproyecto"), choices)).toEqual({ kind: "phase", phaseId: ANTE });
        expect(resolveGroupTarget(b(), group("Minutas"), choices)).toEqual({ kind: "phase", phaseId: MINUTAS_D });
      });

      it("a fase of exactly one other etapa → that fase", () => {
        expect(resolveGroupTarget(b(), group("Residencia"), choices)).toEqual({ kind: "phase", phaseId: RESID });
      });

      it("a fase name shared by several other etapas falls back to the board's etapa", () => {
        const onObra = b({ workflowId: OBRA });
        expect(resolveGroupTarget(onObra, group("Minutas"), choices)).toEqual({ kind: "etapa", workflowId: OBRA });
      });

      it("“Administrativo” → tareas de administración", () => {
        expect(resolveGroupTarget(b(), group("ADMINISTRATIVO"), choices)).toEqual({ kind: "admin" });
      });

      it("anything else → the board's etapa, or the unresolved etapa without one", () => {
        expect(resolveGroupTarget(b(), group("Extras"), choices)).toEqual({ kind: "etapa", workflowId: DISENO });
        expect(resolveGroupTarget(b({ workflowId: null }), group("Extras"), choices)).toEqual({
          kind: "etapa",
          workflowId: null,
        });
      });

      it("an inactive fase is not matched", () => {
        const withInactive = {
          ...choices,
          workflows: choices.workflows.map((w) =>
            w.id === OBRA ? { ...w, phases: [{ id: RESID, name: "Residencia", sortOrder: 0, active: false }] } : w,
          ),
        } as MondayImportChoices;
        expect(resolveGroupTarget(b(), group("Residencia"), withInactive)).toEqual({
          kind: "etapa",
          workflowId: DISENO,
        });
      });

      it("a saved choice wins; one the strategy or catalog doesn't allow falls back to the default", () => {
        expect(resolveGroupTarget(b({ groupTargets: { g: { kind: "ignore" } } }), group("Extras"), choices)).toEqual({
          kind: "ignore",
        });
        const gone = b({ groupTargets: { g: { kind: "phase", phaseId: "a9000000-0000-4000-8000-000000000009" } } });
        expect(resolveGroupTarget(gone, group("Extras"), choices)).toEqual({ kind: "etapa", workflowId: DISENO });
        const ownProject = resolveGroupTarget(b({ groupTargets: { g: { kind: "project" } } }), group("Extras"), choices);
        expect(ownProject).toEqual(strategy === "board_as_project" ? { kind: "project" } : { kind: "etapa", workflowId: DISENO });
      });
    });
  }
});

describe("groupPlacement", () => {
  it("places a group's tasks per target", () => {
    expect(groupPlacement({ kind: "etapa", workflowId: OBRA }, group("x"))).toEqual({ workflowId: OBRA });
    expect(groupPlacement({ kind: "etapa", workflowId: null }, group("x"))).toEqual({});
    expect(groupPlacement({ kind: "phase", phaseId: RESID }, group("x"), choices)).toEqual({
      workflowId: OBRA,
      phaseId: RESID,
    });
    expect(groupPlacement({ kind: "phase", phaseId: RESID }, group("x"))).toEqual({ phaseId: RESID });
    expect(groupPlacement({ kind: "space" }, group(" Recámara principal "))).toEqual({ space: "Recámara principal" });
    expect(groupPlacement({ kind: "admin" }, group("x"))).toEqual({ admin: true });
    expect(groupPlacement({ kind: "project" }, group("x"))).toEqual({ project: true });
    expect(groupPlacement({ kind: "ignore" }, group("x"))).toEqual({});
  });

  it("builds the catalog from translate's lookups, fases by sort order", () => {
    const catalog = groupTargetCatalog(
      { [OBRA]: { name: "Construcción" } },
      {
        [POSTV]: { workflowId: OBRA, name: "Postventa", sortOrder: 1 },
        [RESID]: { workflowId: OBRA, name: "Residencia", sortOrder: 0 },
      },
    );
    expect(catalog.workflows[0].phases?.map((p) => p.id)).toEqual([RESID, POSTV]);
    expect(resolveGroupTarget(board(), group("Postventa"), catalog)).toEqual({ kind: "phase", phaseId: POSTV });
  });
});

describe("group target encoding", () => {
  it("round-trips all six kinds", () => {
    const targets: GroupTarget[] = [
      { kind: "etapa", workflowId: OBRA },
      { kind: "phase", phaseId: RESID },
      { kind: "space" },
      { kind: "project" },
      { kind: "admin" },
      { kind: "ignore" },
    ];
    expect(targets.map((t) => encodeGroupTarget(t))).toEqual([
      `etapa:${OBRA}`,
      `phase:${RESID}`,
      "space",
      "project",
      "admin",
      "ignore",
    ]);
    for (const target of targets) expect(decodeGroupTarget(encodeGroupTarget(target))).toEqual(target);
  });

  it("reads the old `tramo:<id>` select value as `etapa:<id>`", () => {
    expect(decodeGroupTarget(`tramo:${OBRA}`)).toEqual({ kind: "etapa", workflowId: OBRA });
    expect(decodeGroupTarget("tramo:")).toBeNull();
  });

  it("rejects empty ids, removed kinds and unknown values", () => {
    expect(encodeGroupTarget({ kind: "etapa", workflowId: null })).toBe("");
    expect(decodeGroupTarget("")).toBeNull();
    expect(decodeGroupTarget("etapa:")).toBeNull();
    expect(decodeGroupTarget("phase: ")).toBeNull();
    expect(decodeGroupTarget("workflow_phase:Anteproyecto")).toBeNull();
    expect(decodeGroupTarget(`stage:${OBRA}`)).toBeNull();
    expect(decodeGroupTarget("otra")).toBeNull();
  });
});

describe("group target choices", () => {
  it("offers etapas, fases by etapa, espacio, proyecto aparte, administración and ignorar", () => {
    expect(groupTargetChoices(board(), source.groups[1], choices)).toEqual([
      { value: `etapa:${PRESALE}`, label: "Etapa «Presale»" },
      { value: `etapa:${DISENO}`, label: "Etapa «Diseño»" },
      { value: `etapa:${OBRA}`, label: "Etapa «Construcción»" },
      { value: `phase:${MINUTAS_P}`, label: "Fase «Minutas» · Presale", group: "Presale" },
      { value: `phase:${ANTE}`, label: "Fase «Anteproyecto» · Diseño", group: "Diseño" },
      { value: `phase:${EJEC}`, label: "Fase «Ejecutivo» · Diseño", group: "Diseño" },
      { value: `phase:${MINUTAS_D}`, label: "Fase «Minutas» · Diseño", group: "Diseño" },
      { value: `phase:${RESID}`, label: "Fase «Residencia» · Construcción", group: "Construcción" },
      { value: `phase:${POSTV}`, label: "Fase «Postventa» · Construcción", group: "Construcción" },
      { value: "space", label: "Espacio «Extras»" },
      { value: "project", label: "Proyecto aparte «Extras»" },
      { value: "admin", label: "Tareas de administración" },
      { value: "ignore", label: "Ignorar" },
    ]);
    const items = groupTargetChoices(board({ strategy: "item_as_project" }), source.groups[1], choices);
    expect(items.map((choice) => choice.value)).not.toContain("project");
    expect(groupTargetChoices(board({ strategy: "group_as_project" }), source.groups[1], choices)).toEqual([]);
  });

  it("the current target's value is always one of the choices", () => {
    for (const g of source.groups) {
      const value = encodeGroupTarget(currentGroupTarget(board(), g, choices));
      expect(groupTargetChoices(board(), g, choices).map((c) => c.value)).toContain(value);
    }
  });
});

describe("pruneGroupTargets", () => {
  it("keeps a board whose targets all still apply", () => {
    const draft = board({
      groupTargets: { g_ante: { kind: "phase", phaseId: ANTE }, g_extra: { kind: "etapa", workflowId: OBRA } },
    });
    expect(pruneGroupTargets(draft, choices, source)).toBe(draft);
  });

  it("drops targets of groups no longer in the export", () => {
    const draft = board({
      groupTargets: { g_ante: { kind: "space" }, g_gone: { kind: "admin" } },
    });
    expect(pruneGroupTargets(draft, choices, source).groupTargets).toEqual({ g_ante: { kind: "space" } });
    expect(pruneGroupTargets(draft, choices)).toBe(draft);
  });

  it("drops fase targets whose fase is inactive or gone, and etapas that are gone", () => {
    const withInactive = {
      ...choices,
      workflows: choices.workflows.map((w) =>
        w.id === DISENO ? { ...w, phases: (w.phases ?? []).map((p) => (p.id === ANTE ? { ...p, active: false } : p)) } : w,
      ),
    } as MondayImportChoices;
    const draft = board({
      groupTargets: {
        g_ante: { kind: "phase", phaseId: ANTE },
        g_extra: { kind: "etapa", workflowId: "55555555-5555-4555-8555-555555555555" },
        g_keep: { kind: "phase", phaseId: RESID },
      },
    });
    expect(pruneGroupTargets(draft, withInactive).groupTargets).toEqual({ g_keep: { kind: "phase", phaseId: RESID } });
  });
});

describe("group mapping edits", () => {
  it("leaving its own project drops the group's client, name and code", () => {
    const own = setGroupTarget(
      board({ projectNames: { g_extra: "Extras" }, projectCodes: { g_extra: "EX" } }),
      "g_extra",
      { kind: "project" },
    );
    const withClient: BoardDraft = { ...own, groupClients: { g_extra: { kind: "contact", contactId: CLIENT } } };
    expect(ownProjectGroups(withClient, source).map((g) => g.id)).toEqual(["g_extra"]);
    expect(projectKeys(withClient, source).map((key) => key.id)).toEqual(["301", "g_extra"]);

    const back = setGroupTarget(withClient, "g_extra", { kind: "space" });
    expect(back.groupClients).toEqual({});
    expect(back.projectNames).toEqual({});
    expect(back.projectCodes).toEqual({});
    expect(projectKeys(back, source).map((key) => key.id)).toEqual(["301"]);
  });

  it("suggests Grupo como proyecto when most groups are named like clients", () => {
    const clientsBoard: MondayBoardSource = {
      ...source,
      groups: [
        { id: "g1", title: "familia perez" },
        { id: "g2", title: "Grupo  Norte" },
        { id: "g3", title: "Pendientes" },
      ],
    };
    expect(groupsLookLikeClients(clientsBoard.groups, choices.clients)).toBe(true);
    expect(groupsLookLikeClients(source.groups, choices.clients)).toBe(false);
    expect(groupsLookLikeClients([{ title: "Familia Pérez" }], choices.clients)).toBe(false);
    expect(suggestsGroupAsProject(board(), clientsBoard, choices)).toBe(true);
    expect(suggestsGroupAsProject(board({ strategy: "group_as_project" }), clientsBoard, choices)).toBe(false);

    const applied = applyGroupAsProject(board({ groupTargets: { g3: { kind: "ignore" } } }), clientsBoard, choices);
    expect(applied.strategy).toBe("group_as_project");
    expect(applied.groupTargets).toEqual({});
    expect(applied.groupClients).toEqual({
      g1: { kind: "contact", contactId: CLIENT },
      g2: { kind: "contact", contactId: "44444444-4444-4444-8444-444444444444" },
    });
  });
});
