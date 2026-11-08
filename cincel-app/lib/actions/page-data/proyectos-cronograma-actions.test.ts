// @vitest-environment node
/**
 * `getProyectoCronogramaData` (#961): parses `{ id }` as a UUID, requires a
 * staff session (a guest gets FORBIDDEN) and passes the session user to
 * `loadProyectoCronograma`, which re-checks `canViewProjects`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT = "22222222-2222-4222-8222-222222222222";
const VIEWER = { member: { id: "viewer" }, email: "", access: "Colaborador" };

const session = vi.hoisted(() => ({ guest: false }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => {
    if (session.guest) throw new Error("FORBIDDEN");
    return VIEWER;
  }),
}));

const loader = vi.hoisted(() => ({ loadProyectoCronograma: vi.fn(async () => null) }));
vi.mock("@/lib/loaders/proyectos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/loaders/proyectos")>()),
  loadProyectoCronograma: loader.loadProyectoCronograma,
}));

import { getProyectoCronogramaData } from "./proyectos-actions";

beforeEach(() => {
  session.guest = false;
  loader.loadProyectoCronograma.mockClear();
});

describe("getProyectoCronogramaData", () => {
  it("hands the session user and the parsed id to the loader", async () => {
    expect(await getProyectoCronogramaData({ id: PROJECT })).toBeNull();
    expect(loader.loadProyectoCronograma).toHaveBeenCalledWith(VIEWER, { id: PROJECT });
  });

  it("a guest gets FORBIDDEN and the loader never runs", async () => {
    session.guest = true;
    await expect(getProyectoCronogramaData({ id: PROJECT })).rejects.toThrow("FORBIDDEN");
    expect(loader.loadProyectoCronograma).not.toHaveBeenCalled();
  });

  it("rejects an id that is not a UUID", async () => {
    await expect(getProyectoCronogramaData({ id: "nope" })).rejects.toThrow(/^INVALID/);
    expect(loader.loadProyectoCronograma).not.toHaveBeenCalled();
  });
});
