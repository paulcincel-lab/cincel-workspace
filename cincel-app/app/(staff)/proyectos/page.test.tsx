// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

import type { ProyectosPageData } from "@/lib/loaders/proyectos";

const state = vi.hoisted(() => ({
  access: "Colaborador" as string,
  canViewProjects: true,
}));
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

/** What `loadProyectosPage` returns for the viewer: admin flags only for admins. */
function pageData(user: { access?: string }): ProyectosPageData {
  return {
    projects: [],
    portfolio: [],
    tramos: [
      { id: "w1", key: "presale", name: "Presale", sortOrder: 1 },
      { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 },
    ],
    presaleAutoStart: true,
    canSeeAdminData: user.access === "Administrador",
    canCreateProject: true,
    canChangeProjectStage: true,
    viewerStaffId: "s1",
    today: "2026-11-10",
  };
}
const loaders = vi.hoisted(() => ({ loadProyectosPage: vi.fn() }));
// The client query function: the first render must never need it.
const pageDataActions = vi.hoisted(() => ({ getProyectosPageData: vi.fn() }));

vi.mock("next/navigation", () => ({ notFound, useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: async () => ({ member: { id: "s1", name: "Ana" }, access: state.access }),
}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveProjectsCapabilities: () => ({ canViewProjects: state.canViewProjects, canCreateProject: true }),
}));
vi.mock("@/lib/loaders/proyectos", () => loaders);
vi.mock("@/lib/actions/page-data/proyectos-actions", () => pageDataActions);

const seen = vi.hoisted(() => ({ data: undefined as ProyectosPageData | undefined }));
vi.mock("@/components/proyectos/ProjectsPortfolio", async () => {
  const { useQueryClient } = await import("@tanstack/react-query");
  const { qk } = await import("@/lib/query/keys");
  return {
    ProjectsPortfolio: () => {
      // The hydrated cache, as the real component's `useSuspenseQuery` reads it.
      seen.data = useQueryClient().getQueryData<ProyectosPageData>(qk.proyectos.list());
      return <div data-testid="portfolio">{seen.data ? "hydrated" : "empty"}</div>;
    },
  };
});

import { renderWithQueryClient } from "@/lib/query/test-utils";

import ProyectosPage from "./page";

async function renderPage() {
  return renderWithQueryClient(await ProyectosPage());
}

beforeEach(() => {
  state.access = "Colaborador";
  state.canViewProjects = true;
  seen.data = undefined;
  vi.clearAllMocks();
  loaders.loadProyectosPage.mockImplementation(async (user: { access?: string }) => pageData(user));
});

afterEach(() => cleanup());

describe("/proyectos page", () => {
  it("prefetches one page-data read through the loader and hydrates it (no client action call)", async () => {
    await renderPage();
    expect(screen.getByTestId("portfolio").textContent).toBe("hydrated");
    expect(loaders.loadProyectosPage).toHaveBeenCalledTimes(1);
    expect(loaders.loadProyectosPage).toHaveBeenCalledWith(expect.objectContaining({ access: "Colaborador" }));
    expect(seen.data?.tramos.map((t) => t.key)).toEqual(["presale", "diseno"]);
    expect(seen.data?.presaleAutoStart).toBe(true);
    expect(pageDataActions.getProyectosPageData).not.toHaveBeenCalled();
  });

  it("non-admins get no admin data; the payload never carries clients or staff", async () => {
    await renderPage();
    expect(seen.data?.canSeeAdminData).toBe(false);
    expect(Object.keys(seen.data ?? {}).sort()).toEqual(
      ["canCreateProject", "canSeeAdminData", "portfolio", "presaleAutoStart", "projects", "tramos"].sort(),
    );
  });

  it("admins get canSeeAdminData, still without client or staff lists in the payload", async () => {
    state.access = "Administrador";
    await renderPage();
    expect(seen.data?.canSeeAdminData).toBe(true);
    expect(seen.data).not.toHaveProperty("adminOptions");
  });

  it("404 without projects.canViewProjects, before any read", async () => {
    state.canViewProjects = false;
    await expect(ProyectosPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(loaders.loadProyectosPage).not.toHaveBeenCalled();
  });
});
