/**
 * Proyectos query options. Ficha (5b, #960): `proyectoFichaOptions` reads
 * `qk.proyectos.tab(id,'ficha')` and seeds the espacios and import data keys;
 * `proyectoHistoryOptions` pages the Bitácora by cursor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ getProyectoFichaData: vi.fn(), getProyectoHistoryPage: vi.fn() }));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => actions);

import { qk, STALE } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";

import { proyectoFichaOptions, proyectoHistoryOptions } from "./proyectos";

const ID = "22222222-2222-4222-8222-222222222222";
const SPACES = [{ id: "e1", name: "Depto 201", projectId: ID, sortOrder: 0, taskCount: 1 }];

beforeEach(() => {
  actions.getProyectoFichaData.mockReset();
  actions.getProyectoHistoryPage.mockReset();
});

describe("proyectoFichaOptions", () => {
  it("uses the ficha tab key and the screen stale time", () => {
    const opts = proyectoFichaOptions(ID);
    expect(opts.queryKey).toEqual(qk.proyectos.tab(ID, "ficha"));
    expect(opts.staleTime).toBe(STALE.screen);
  });

  it("seeds catalog.projectSpaces(id) and importData('project', id) from the payload", async () => {
    actions.getProyectoFichaData.mockResolvedValue({ project: { id: ID }, tasks: [], spaces: SPACES, importData: null });
    const client = createTestQueryClient();
    await client.fetchQuery(proyectoFichaOptions(ID));
    expect(actions.getProyectoFichaData).toHaveBeenCalledWith({ id: ID });
    expect(client.getQueryData(qk.catalog.projectSpaces(ID))).toEqual(SPACES);
    expect(client.getQueryState(qk.importData("project", ID))?.status).toBe("success");
    expect(client.getQueryData(qk.importData("project", ID))).toBeNull();
  });

  it("seeds nothing for a project the viewer can't see", async () => {
    actions.getProyectoFichaData.mockResolvedValue(null);
    const client = createTestQueryClient();
    expect(await client.fetchQuery(proyectoFichaOptions(ID))).toBeNull();
    expect(client.getQueryData(qk.catalog.projectSpaces(ID))).toBeUndefined();
  });
});

describe("proyectoHistoryOptions", () => {
  it("uses the history key, starts without a cursor and follows nextCursor", async () => {
    actions.getProyectoHistoryPage.mockResolvedValue({ events: [{ id: "a" }], nextCursor: "a" });
    const opts = proyectoHistoryOptions(ID);
    expect(opts.queryKey).toEqual(qk.proyectos.history(ID));
    expect(opts.staleTime).toBe(STALE.screen);
    expect(opts.initialPageParam).toBeNull();

    const client = createTestQueryClient();
    const data = await client.fetchInfiniteQuery(opts);
    expect(actions.getProyectoHistoryPage).toHaveBeenCalledWith({ id: ID, cursor: null });
    expect(data.pages).toHaveLength(1);

    const page = { events: [], nextCursor: "a" };
    expect(opts.getNextPageParam(page, [page], null, [null])).toBe("a");
    const last = { events: [], nextCursor: null };
    expect(opts.getNextPageParam(last, [page, last], "a", [null, "a"])).toBeNull();
  });
});
