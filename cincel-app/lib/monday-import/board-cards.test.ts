// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  boardChip,
  boardProblems,
  buildBoardCards,
  cardWorkspaces,
  chipLabel,
  estimateBoardCounts,
  filterBoardCards,
  initials,
  needsExport,
  selectBoards,
  selectionTotals,
  toggleBoard,
  workspaceLabel,
} from "@/lib/monday-import/board-cards";
import { updateBoard, type BoardDraft } from "@/lib/monday-import/wizard-steps";
import type { MappingInput } from "@/scripts/monday/mapping.schema";
import type { MondayBoardSource, MondayConnection, MondayExportSource, MondayPreview } from "@/lib/types/monday-import";

const CLIENT = "33333333-3333-4333-8333-333333333333";
const DISENO = "44444444-4444-4444-8444-444444444441";
const OBRA = "44444444-4444-4444-8444-444444444442";
const FASE_OBRA = "55555555-5555-4555-8555-555555555551";

/** The catalog: tramo "Diseño", and "Construcción" with the fase "Obra". */
const choices = {
  workflows: [
    { id: DISENO, name: "Diseño", phases: [] },
    { id: OBRA, name: "Construcción", phases: [{ id: FASE_OBRA, name: "Obra", sortOrder: 1 }] },
  ],
};

const connection: MondayConnection = {
  account: { id: "1", slug: "acme", name: "Acme" },
  tokenUser: { name: "Ana Prueba", email: "ana@example.test" },
  tokenSource: "input",
  workspaces: [
    { id: "w1", name: "Obras" },
    { id: "w2", name: "Ventas" },
  ],
  boards: [
    { id: "b1", name: "Casa Ruiz", workspaceId: "w1", workspaceName: "Obras", itemsCount: 3, hierarchyType: null, estimatedCalls: 2 },
    { id: "b2", name: "Depto Gómez", workspaceId: "w1", workspaceName: "Obras", itemsCount: 2, hierarchyType: null, estimatedCalls: 2 },
    { id: "b3", name: "Clientes", workspaceId: "w2", workspaceName: "Ventas", itemsCount: 4, hierarchyType: null, estimatedCalls: 1 },
  ],
  estimatedCalls: 5,
};

const ruizSource: MondayBoardSource = {
  id: "b1",
  name: "Casa Ruiz",
  columns: [{ id: "status", title: "Estado", type: "status" }],
  subitemColumns: [],
  groups: [
    { id: "g1", title: "Diseño" },
    { id: "g2", title: "Obra" },
  ],
  statusLabels: { status: [{ id: "0", name: "Raro", isDone: false }] },
  itemCount: 3,
  items: [
    { id: "i1", name: "Planos", groupId: "g1" },
    { id: "i2", name: "Renders", groupId: "g1" },
    { id: "i3", name: "Cimentación", groupId: "g2" },
  ],
  userIds: ["u1", "u2"],
};

const source: MondayExportSource = {
  boards: [ruizSource],
  users: [
    { id: "u1", name: "Ana Prueba", email: "ana@example.test", kind: null },
    { id: "u2", name: "Beto", email: null, kind: null },
  ],
  hasFiles: false,
  hasUpdates: true,
};

function ruiz(overrides: Partial<BoardDraft> = {}): BoardDraft {
  return {
    mondayBoardId: "b1",
    name: "Casa Ruiz",
    strategy: "board_as_project",
    client: { kind: "contact", contactId: CLIENT },
    workflowId: DISENO,
    columns: { status: "status" },
    ...overrides,
  };
}

function mappingOf(...boards: BoardDraft[]): MappingInput {
  return { version: 2, boards, people: {}, options: { includeUpdates: true, includeFiles: false } };
}

const issueOf = (code: string, boardId: string, message: string, blocking = true) => ({
  code,
  blocking,
  boardId,
  itemId: null,
  boardName: null,
  itemName: null,
  message,
  fixStep: "equivalencias",
});

const previewWith = (...issues: ReturnType<typeof issueOf>[]) =>
  ({ canApply: false, totals: {} as MondayPreview["totals"], boards: [], issues }) as unknown as MondayPreview;

describe("board card problems and chips (#685)", () => {
  it("is «mapear» until exported and opened, «listo» once opened without problems", () => {
    expect(boardChip([], false, true)).toEqual({ kind: "mapear" });
    expect(boardChip([], true, false)).toEqual({ kind: "mapear" });
    expect(boardChip([], true, true)).toEqual({ kind: "listo" });
    expect(boardChip(["Elige un tramo."], true, false)).toEqual({ kind: "problemas", count: 1 });
    expect(chipLabel({ kind: "problemas", count: 3 })).toBe("⚠ 3");
  });

  it("no longer counts a missing client", () => {
    expect(boardProblems(mappingOf(ruiz({ client: null })), "b1", ruizSource)).toEqual([]);
  });

  it("asks for a tramo when some tasks resolve none, and clears it as soon as the draft fixes it", () => {
    const broken = mappingOf(ruiz({ workflowId: null }));
    expect(boardProblems(broken, "b1", ruizSource)).toEqual(["Elige un tramo."]);
    const fixed = updateBoard(broken, "b1", (board) => ({ ...board, workflowId: OBRA }));
    expect(boardProblems(fixed, "b1", ruizSource)).toEqual([]);
    // Every group with items placed in a tramo or fase needs no board tramo; an espacio does.
    const placed = mappingOf(
      ruiz({ workflowId: null, groupTargets: { g1: { kind: "tramo", workflowId: DISENO }, g2: { kind: "admin" } } }),
    );
    expect(boardProblems(placed, "b1", ruizSource)).toEqual([]);
    const space = mappingOf(
      ruiz({ workflowId: null, groupTargets: { g1: { kind: "tramo", workflowId: DISENO }, g2: { kind: "space" } } }),
    );
    expect(boardProblems(space, "b1", ruizSource)).toEqual(["Elige un tramo."]);
  });

  it("leaves status labels to the firm-wide status map: a defaulted label is no board problem", () => {
    const mapping = mappingOf(ruiz({ statusMaps: { status: { "0": { status: "pendiente", defaulted: true } } } }));
    expect(boardProblems(mapping, "b1", ruizSource)).toEqual([]);
  });

  it("counts groups named like a tramo or fase as placed when the catalog is given", () => {
    const mapping = mappingOf(ruiz({ workflowId: null }));
    // "Diseño" is a tramo and "Obra" a fase of Construcción.
    expect(boardProblems(mapping, "b1", ruizSource, null, choices)).toEqual([]);
    const other = { ...ruizSource, groups: [{ id: "g1", title: "Diseño" }, { id: "g2", title: "Varios" }] };
    expect(boardProblems(mapping, "b1", other, null, choices)).toEqual(["Elige un tramo."]);
  });

  it("warns about tasks without a fase and lists the preview's blocking issues of the board", () => {
    const preview = previewWith(
      issueOf("PHASE_UNRESOLVED", "b1", "«Planos» no coincide con ninguna fase.", false),
      issueOf("PHASE_UNRESOLVED", "b1", "«Renders» no coincide con ninguna fase.", false),
      issueOf("PHASE_UNRESOLVED", "b2", "Otro tablero.", false),
      issueOf("X", "b1", "Falta algo."),
      issueOf("X", "b2", "Otro tablero."),
    );
    expect(boardProblems(mappingOf(ruiz()), "b1", ruizSource, preview)).toEqual(["2 tareas sin fase.", "Falta algo."]);
    const one = previewWith(issueOf("PHASE_UNRESOLVED", "b1", "«Planos».", false));
    expect(boardProblems(mappingOf(ruiz()), "b1", ruizSource, one)).toEqual(["1 tarea sin fase."]);
  });

  it("doesn't repeat the preview's TRAMO_MISSING next to «Elige un tramo.»", () => {
    const preview = previewWith(issueOf("TRAMO_MISSING", "b1", "Elige un tramo: hay tareas sin tramo."));
    expect(boardProblems(mappingOf(ruiz({ workflowId: null })), "b1", ruizSource, preview)).toEqual(["Elige un tramo."]);
  });

  it("asks to export again when the board is in the draft but not in the export", () => {
    expect(boardProblems(mappingOf(ruiz()), "b1", undefined)).toEqual(["No está en la exportación. Exporta otra vez."]);
  });

  it("has no problems on a skipped board", () => {
    expect(boardProblems(mappingOf(ruiz({ strategy: "skip", client: null })), "b1", ruizSource)).toEqual([]);
  });
});

describe("board card counts (#685)", () => {
  it("estimates by strategy and leaves ignored groups out", () => {
    expect(estimateBoardCounts(ruiz(), ruizSource)).toEqual({ proyectos: 1, tareas: 3, contactos: 0 });
    expect(estimateBoardCounts(ruiz({ groupTargets: { g2: { kind: "ignore" } } }), ruizSource)).toMatchObject({ tareas: 2 });
    expect(estimateBoardCounts(ruiz({ groupTargets: { g2: { kind: "project" } } }), ruizSource)).toMatchObject({ proyectos: 2 });
    expect(estimateBoardCounts(ruiz({ strategy: "group_as_project" }), ruizSource)).toMatchObject({ proyectos: 2, tareas: 3 });
    expect(estimateBoardCounts(ruiz({ strategy: "item_as_project" }), ruizSource)).toMatchObject({ proyectos: 3, tareas: null });
    expect(estimateBoardCounts(ruiz({ strategy: "crm_contacts" }), ruizSource)).toEqual({ proyectos: 0, tareas: 0, contactos: 3 });
    expect(estimateBoardCounts(ruiz({ client: { kind: "new", name: "Nuevo" } }), ruizSource)).toMatchObject({ contactos: 1 });
  });

  it("takes the exact counts from a Vista previa when there is one", () => {
    const mapping = mappingOf(ruiz());
    const counts = { proyectos: 1, tareas: 2, subtareas: 1, checklist: 0, dependencias: 0, contactos: 0, comentarios: 0, archivos: 0, filasCronograma: 0, yaImportados: 0 };
    const preview = {
      canApply: true,
      totals: counts,
      boards: [{ boardId: "b1", name: "Casa Ruiz", strategy: "board_as_project", counts, samples: [] }],
      issues: [{ code: "X", blocking: false, boardId: "b1", itemId: null, boardName: null, itemName: null, message: "Aviso.", fixStep: "equivalencias" }],
    } as unknown as MondayPreview;
    const [card] = buildBoardCards({ connection, mapping, source, preview, reviewed: new Set() });
    expect(card).toMatchObject({ estimated: false, counts: { proyectos: 1, tareas: 3, contactos: 0, avisos: 1 } });
  });
});

describe("buildBoardCards (#685)", () => {
  it("lists every connected board, with the export's counts, people and chip on the exported ones", () => {
    const cards = buildBoardCards({ connection, mapping: mappingOf(ruiz()), source, preview: null, reviewed: new Set(["b1"]) });
    expect(cards.map((card) => card.id)).toEqual(["b1", "b2", "b3"]);
    expect(cards[0]).toMatchObject({
      exported: true,
      itemCount: 3,
      groupCount: 2,
      chip: { kind: "listo" },
      estimated: true,
      people: [
        { id: "u1", name: "Ana Prueba" },
        { id: "u2", name: "Beto" },
      ],
    });
    expect(cards[1]).toMatchObject({ exported: false, chip: { kind: "mapear" }, itemCount: 2, groupCount: null });
  });

  it("adds draft boards the connection doesn't list (a resumed run)", () => {
    const cards = buildBoardCards({ connection: null, mapping: mappingOf(ruiz()), source, preview: null, reviewed: new Set() });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: "b1", workspaceId: null, exported: true, chip: { kind: "mapear" } });
  });
});

describe("selection, search and filter (#685)", () => {
  const cards = buildBoardCards({ connection, mapping: null, source: null, preview: null, reviewed: new Set() });

  it("selects nothing by default and one board with one toggle", () => {
    expect(toggleBoard([], "b2", true)).toEqual(["b2"]);
    expect(toggleBoard(["b2", "b1"], "b2", false)).toEqual(["b1"]);
    expect(toggleBoard(["b1"], "b1", true)).toEqual(["b1"]);
  });

  it("selects all or none of the visible cards, keeping hidden picks", () => {
    const obras = filterBoardCards(cards, "", "w1");
    expect(selectBoards(["b3"], obras, true)).toEqual(["b3", "b1", "b2"]);
    expect(selectBoards(["b3", "b1"], obras, false)).toEqual(["b3"]);
  });

  it("searches names and workspaces ignoring accents and case, and filters by workspace", () => {
    expect(filterBoardCards(cards, "gomez", "").map((card) => card.id)).toEqual(["b2"]);
    expect(filterBoardCards(cards, "VENTAS", "").map((card) => card.id)).toEqual(["b3"]);
    expect(filterBoardCards(cards, "", "w2").map((card) => card.id)).toEqual(["b3"]);
    expect(filterBoardCards(cards, "casa", "w2")).toEqual([]);
    expect(cardWorkspaces(cards)).toEqual([
      { id: "w1", name: "Obras" },
      { id: "w2", name: "Ventas" },
    ]);
  });

  it("totals the selected cards; tasks are unknown when one board can't estimate them", () => {
    const mapped = buildBoardCards({ connection, mapping: mappingOf(ruiz()), source, preview: null, reviewed: new Set() });
    expect(selectionTotals(mapped, ["b1"])).toEqual({ n: 1, proyectos: 1, tareas: 3, contactos: 0, avisos: 0 });
    expect(selectionTotals(mapped, [])).toEqual({ n: 0, proyectos: 0, tareas: 0, contactos: 0, avisos: 0 });
    const items = buildBoardCards({
      connection,
      mapping: mappingOf(ruiz({ strategy: "item_as_project" })),
      source,
      preview: null,
      reviewed: new Set(),
    });
    expect(selectionTotals(items, ["b1", "b2"]).tareas).toBeNull();
  });

  it("exports again only when the picked boards aren't the exported ones", () => {
    expect(needsExport(false, [], ["b1"])).toBe(true);
    expect(needsExport(true, ["b1"], ["b1"])).toBe(false);
    expect(needsExport(true, ["b1"], ["b1", "b2"])).toBe(true);
    expect(needsExport(true, ["b1", "b2"], ["b2"])).toBe(true);
  });
});

describe("card labels (#685)", () => {
  it("names workspaces and initials", () => {
    expect(workspaceLabel("w1", "Obras")).toBe("Obras");
    expect(workspaceLabel("9", null)).toBe("Espacio 9");
    expect(workspaceLabel(null, null)).toBe("Sin espacio");
    expect(initials("Ana María Prueba")).toBe("AP");
    expect(initials("beto")).toBe("BE");
    expect(initials("  ")).toBe("?");
  });
});
