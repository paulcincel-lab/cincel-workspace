import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ canViewProjects: true, implemented: true }));

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: async () => ({ member: { id: "s1", name: "Ana" }, access: "Colaborador" }),
}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveProjectsCapabilities: () => ({ canViewProjects: state.canViewProjects }),
}));
vi.mock("@/lib/actions/projects-actions.flags", () => ({
  IMPLEMENTED: {
    get fetchProjectsPortfolioAction() {
      return state.implemented;
    },
  },
}));

import { proyectosNavItem } from "./proyectos";

const SESSION = { staffId: "s1", name: "Ana", role: "Colaborador", isAdmin: false, photoUrl: null };

beforeEach(() => {
  state.canViewProjects = true;
  state.implemented = true;
});

describe("proyectos nav item", () => {
  it("is the Proyectos link with projects.canViewProjects", async () => {
    const item = await proyectosNavItem.resolve(SESSION);
    expect(item).toMatchObject({ key: "proyectos", label: "Proyectos", href: "/proyectos" });
    expect(proyectosNavItem.section).toBe("items");
  });


  it("is hidden for viewers who can't view projects", async () => {
    state.canViewProjects = false;
    expect(await proyectosNavItem.resolve(SESSION)).toBeNull();
  });

  it("is hidden while the portfolio action is a stub", async () => {
    state.implemented = false;
    expect(await proyectosNavItem.resolve(SESSION)).toBeNull();
  });
});
