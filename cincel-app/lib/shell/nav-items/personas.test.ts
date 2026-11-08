import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  implemented: { fetchPersonaDetailAction: false, fetchPeopleOverviewAction: false },
  user: { access: "Administrador" } as { access: string } | null,
  canViewTeam: true,
  canViewClients: true,
}));

vi.mock("@/lib/actions/people-actions.flags", () => ({
  get IMPLEMENTED() {
    return state.implemented;
  },
}));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => {
    if (!state.user) throw new Error("UNAUTHENTICATED");
    return state.user;
  }),
}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveTeamCapabilities: () => ({ canViewTeam: state.canViewTeam }),
  resolveClientsCapabilities: () => ({ canViewClients: state.canViewClients }),
}));

import { personasNavItem } from "./personas";

const session = { staffId: "s1", name: "Ana", role: "Administrador", isAdmin: true, photoUrl: null };

beforeEach(() => {
  state.implemented = { fetchPersonaDetailAction: true, fetchPeopleOverviewAction: true };
  state.user = { access: "Administrador" };
  state.canViewTeam = true;
  state.canViewClients = true;
});

describe("personas nav item", () => {
  it("links to /personas with the overview implemented", async () => {
    const item = await personasNavItem.resolve(session);
    expect(item).toMatchObject({ key: "personas", label: "Personas", href: "/personas" });
  });

  it("stays hidden while fetchPeopleOverviewAction is not implemented", async () => {
    state.implemented = { fetchPersonaDetailAction: false, fetchPeopleOverviewAction: false };
    expect(await personasNavItem.resolve(session)).toBeNull();
  });


  it("goes to the directory for a viewer who only sees clients", async () => {
    state.canViewTeam = false;
    expect(await personasNavItem.resolve(session)).toMatchObject({ href: "/personas/clientes" });
  });

  it("stays hidden for a viewer who sees neither the team nor the directory", async () => {
    state.canViewTeam = false;
    state.canViewClients = false;
    expect(await personasNavItem.resolve(session)).toBeNull();
  });

  it("stays hidden without a session", async () => {
    state.user = null;
    expect(await personasNavItem.resolve(session)).toBeNull();
  });
});
