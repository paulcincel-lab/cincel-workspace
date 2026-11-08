// @vitest-environment node
/**
 * `getProyectoShell` (#954): parses `{ id }` as a UUID, requires a staff
 * session (a guest gets FORBIDDEN) and passes the session user to the loader,
 * which re-checks `canViewProjects`.
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

const loader = vi.hoisted(() => ({ loadProyectoShell: vi.fn(async () => null) }));
vi.mock("@/lib/loaders/proyectos-shell", () => loader);

import { getProyectoShell } from "./proyectos-shell-actions";

beforeEach(() => {
  session.guest = false;
  loader.loadProyectoShell.mockClear();
});

describe("getProyectoShell", () => {
  it("hands the session user and the parsed id to the loader", async () => {
    expect(await getProyectoShell({ id: PROJECT })).toBeNull();
    expect(loader.loadProyectoShell).toHaveBeenCalledWith(VIEWER, { id: PROJECT });
  });

  it("a guest gets FORBIDDEN and the loader never runs", async () => {
    session.guest = true;
    await expect(getProyectoShell({ id: PROJECT })).rejects.toThrow("FORBIDDEN");
    expect(loader.loadProyectoShell).not.toHaveBeenCalled();
  });

  it("rejects an id that is not a UUID", async () => {
    await expect(getProyectoShell({ id: "nope" })).rejects.toThrow(/^INVALID/);
    expect(loader.loadProyectoShell).not.toHaveBeenCalled();
  });
});
