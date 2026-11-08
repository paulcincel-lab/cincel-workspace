import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  getTareasPageData: vi.fn(),
  getTareasBoard: vi.fn(),
  getTareasFacets: vi.fn(),
  getTareasListPage: vi.fn(),
  getTareasBoardColumn: vi.fn(),
  getTareasCalendarData: vi.fn(),
  getTareasStartSlotData: vi.fn(),
  getTaskSheetData: vi.fn(),
  searchProjectTasksAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/tareas-actions", () => actions);
vi.mock("@/lib/actions/tasks-actions", () => ({ listSubtasksAction: vi.fn(), listTaskDependenciesAction: vi.fn() }));
vi.mock("@/lib/actions/tramo-start-actions", () => ({ previewStartTramoAction: vi.fn() }));
vi.mock("@/lib/actions/workflows-actions", () => ({ fetchWorkflowAction: vi.fn() }));

import { qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";
import type { TareasPageData } from "@/lib/tareas/page-data";
import { DEFAULT_TAREAS_QUERY } from "@/lib/tareas/query";

import {
  seedTareasPage,
  tableroMoveInvalidations,
  tareasBoardColumnOptions,
  tareasListFiltersOf,
  tareasListInfiniteOptions,
  tareasPageKeyInputOf,
  tareasPageOptions,
} from "./tareas";

const FILTERS = { tramo: "diseno", proyecto: null, responsable: "yo" as const, estado: null, q: "plano" };
const KEY = { vista: "tablero" as const, cal: "mes" as const, ...FILTERS };

const PAGE: TareasPageData = {
  facets: { total: 3, byTramo: { diseno: 3 }, projects: [] },
  tramos: [{ id: "w1", key: "diseno", name: "Diseño", sortOrder: 1 }],
  staff: [{ id: "s1", name: "Ana Ruiz" }],
  board: { columns: { pendiente: { rows: [], total: 0, nextCursor: null } }, statuses: [] },
  list: { rows: [], nextCursor: "n1", total: 70 },
};

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
});

describe("tareasPageKeyInputOf", () => {
  it("keys the view, the calendar mode and the filters: never nueva, fecha, cursor or limit", () => {
    const key = tareasPageKeyInputOf({ ...DEFAULT_TAREAS_QUERY, ...FILTERS, nueva: true, fecha: "2026-11-08" });
    expect(key).toEqual(KEY);
    expect(qk.tareas.page(key)).toEqual(["tareas", "page", KEY]);
  });

  it("changes the key when a filter changes", () => {
    const a = tareasPageOptions(tareasPageKeyInputOf({ ...DEFAULT_TAREAS_QUERY }));
    const b = tareasPageOptions(tareasPageKeyInputOf({ ...DEFAULT_TAREAS_QUERY, estado: "pendiente" }));
    expect(a.queryKey).not.toEqual(b.queryKey);
  });
});

describe("seedTareasPage / tareasPageOptions", () => {
  it("seeds the facets, the board and the first Lista page, and keeps the bundle without the rows", () => {
    const client = createTestQueryClient();
    const kept = seedTareasPage(client, KEY, PAGE);
    expect(kept).toEqual({ facets: PAGE.facets, tramos: PAGE.tramos, staff: PAGE.staff });
    expect(client.getQueryData(qk.tareas.facets(FILTERS))).toEqual(PAGE.facets);
    expect(client.getQueryData(qk.tareas.board(FILTERS))).toEqual(PAGE.board);
    expect(client.getQueryData(qk.tareas.list(FILTERS))).toEqual({ pages: [PAGE.list], pageParams: [null] });
  });

  it("the page query reads one getTareasPageData (no cursor / limit) and seeds the view keys", async () => {
    actions.getTareasPageData.mockResolvedValue(PAGE);
    const client = createTestQueryClient();
    const data = await client.fetchQuery(tareasPageOptions(KEY));

    expect(actions.getTareasPageData).toHaveBeenCalledTimes(1);
    expect(actions.getTareasPageData).toHaveBeenCalledWith({ vista: "tablero", cal: "mes", ...FILTERS });
    expect(data.board).toBeUndefined();
    expect(client.getQueryData(qk.tareas.board(FILTERS))).toEqual(PAGE.board);
    expect(actions.getTareasBoard).not.toHaveBeenCalled();
  });
});

describe("tareasListInfiniteOptions / tareasBoardColumnOptions", () => {
  it("pages Lista by cursor under qk.tareas.list(f)", async () => {
    actions.getTareasListPage.mockImplementation(async ({ cursor }: { cursor: string | null }) => ({
      rows: [],
      nextCursor: cursor === null ? "c2" : null,
      total: 2,
    }));
    const client = createTestQueryClient();
    const options = tareasListInfiniteOptions(FILTERS);
    expect(options.queryKey).toEqual(qk.tareas.list(FILTERS));
    await client.fetchInfiniteQuery(options);
    expect(actions.getTareasListPage).toHaveBeenLastCalledWith({ filters: FILTERS, cursor: null });
    await client.fetchInfiniteQuery({ ...options, pages: 2, staleTime: 0 });
    expect(actions.getTareasListPage).toHaveBeenLastCalledWith({ filters: FILTERS, cursor: "c2" });
  });

  it("loads a board column from the board's cursor under qk.tareas.board(f, columnId)", async () => {
    actions.getTareasBoardColumn.mockResolvedValue({ rows: [], total: 9, nextCursor: null });
    const client = createTestQueryClient();
    const options = tareasBoardColumnOptions(FILTERS, "pendiente", "first");
    expect(options.queryKey).toEqual(qk.tareas.board(FILTERS, "pendiente"));
    await client.fetchInfiniteQuery(options);
    expect(actions.getTareasBoardColumn).toHaveBeenCalledWith({ filters: FILTERS, columnId: "pendiente", cursor: "first" });
  });
});

describe("tableroMoveInvalidations", () => {
  it("lists the facets, Lista, calendar, project tabs, Inicio and badges, never the board", () => {
    const keys = tableroMoveInvalidations("p1").map((k) => JSON.stringify(k));
    expect(keys).toEqual([
      JSON.stringify(["tareas", "facets"]),
      JSON.stringify(["tareas", "list"]),
      JSON.stringify(["tareas", "calendar"]),
      JSON.stringify(qk.proyectos.tab("p1", "tareas")),
      JSON.stringify(qk.proyectos.resumen("p1")),
      JSON.stringify(qk.proyectos.cronograma("p1")),
      JSON.stringify(qk.inicio()),
      JSON.stringify(qk.shell.badges()),
    ]);
    expect(keys.some((k) => k.includes('"board"'))).toBe(false);
    expect(tableroMoveInvalidations(null)).toHaveLength(5);
  });

  it("tareasListFiltersOf drops the view", () => {
    expect(tareasListFiltersOf({ ...DEFAULT_TAREAS_QUERY, vista: "lista", ...FILTERS })).toEqual(FILTERS);
  });
});
