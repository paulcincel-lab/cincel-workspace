// @vitest-environment node
/**
 * Personas page data (#940): each action parses its input, requires a staff
 * session (a guest gets FORBIDDEN) and passes the session user to its loader.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const VIEWER = { member: { id: "viewer" }, email: "", access: "Colaborador" };

const session = vi.hoisted(() => ({ guest: false }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => {
    if (session.guest) throw new Error("FORBIDDEN");
    return VIEWER;
  }),
}));

const loader = vi.hoisted(() => ({
  loadPersonasEquipo: vi.fn(async () => ({ people: [], emails: {}, canCreate: false })),
  loadPersonasCounts: vi.fn(async () => ({ equipo: 0, clientes: 0, contratistas: 0, proveedores: 0 })),
  loadPersonasContacts: vi.fn(async () => null),
}));
vi.mock("@/lib/loaders/personas", () => loader);

import { getPersonasContactsPageData, getPersonasCountsAction, getPersonasEquipoPageData } from "./personas-actions";

beforeEach(() => {
  session.guest = false;
  loader.loadPersonasEquipo.mockClear();
  loader.loadPersonasCounts.mockClear();
  loader.loadPersonasContacts.mockClear();
});

describe("Personas page data", () => {
  it("hands the session user to each loader", async () => {
    await getPersonasEquipoPageData({});
    expect(loader.loadPersonasEquipo).toHaveBeenCalledWith(VIEWER);
    await getPersonasCountsAction({});
    expect(loader.loadPersonasCounts).toHaveBeenCalledWith(VIEWER);
    await getPersonasContactsPageData({ tab: "proveedores", tipo: "tiendas" });
    expect(loader.loadPersonasContacts).toHaveBeenCalledWith(VIEWER, { tab: "proveedores", tipo: "tiendas" });
  });

  it("a guest gets FORBIDDEN and no loader runs", async () => {
    session.guest = true;
    await expect(getPersonasEquipoPageData({})).rejects.toThrow("FORBIDDEN");
    await expect(getPersonasCountsAction({})).rejects.toThrow("FORBIDDEN");
    await expect(getPersonasContactsPageData({ tab: "clientes" })).rejects.toThrow("FORBIDDEN");
    expect(loader.loadPersonasEquipo).not.toHaveBeenCalled();
    expect(loader.loadPersonasCounts).not.toHaveBeenCalled();
    expect(loader.loadPersonasContacts).not.toHaveBeenCalled();
  });

  it("rejects an unknown tab", async () => {
    await expect(getPersonasContactsPageData({ tab: "equipo" as never })).rejects.toThrow(/^INVALID/);
    expect(loader.loadPersonasContacts).not.toHaveBeenCalled();
  });
});
