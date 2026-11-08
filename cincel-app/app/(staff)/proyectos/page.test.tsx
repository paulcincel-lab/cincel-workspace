// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { ProjectsPortfolioProps } from "@/components/proyectos/ProjectsPortfolio";
import type { ResolvedAppearance } from "@/lib/types/redesign";

const state = vi.hoisted(() => ({
  style: "visual" as "visual" | "esencial" | "analitico",
  access: "Colaborador" as string,
  canViewProjects: true,
  canCreateProject: true,
}));
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
const fetchProjectsAction = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
const fetchProjectsPortfolioAction = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
const fetchContactsAction = vi.hoisted(() =>
  vi.fn(async () => [
    { id: "c1", name: "Familia Gómez", type: "cliente" },
    { id: "c2", name: "Taller Norte", type: "proveedor" },
  ]),
);
const fetchStaffAction = vi.hoisted(() =>
  vi.fn(async () => [
    { id: "s1", name: "Ana", lastName: "López", active: true },
    { id: "s2", name: "Luis", lastName: null, active: false },
  ]),
);

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/ui/preferences-server", () => ({
  getResolvedAppearance: async () =>
    ({
      theme: "azul",
      mode: "light",
      style: state.style,
      density: "comoda",
      textSize: 14,
      cssVars: { light: {}, dark: {} },
      version: 1,
    }) as unknown as ResolvedAppearance,
}));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: async () => ({ member: { id: "s1", name: "Ana" }, access: state.access }),
}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveProjectsCapabilities: () => ({
    canViewProjects: state.canViewProjects,
    canCreateProject: state.canCreateProject,
  }),
}));
vi.mock("@/lib/tramos/compat", () => ({
  canSeeAdminData: (user: { access?: string } | null) => user?.access === "Administrador",
  listTramos: async () => [
    { id: "w1", key: "presale", name: "Presale", sortOrder: 1 },
    { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 },
  ],
}));
vi.mock("@/lib/actions/projects-actions", () => ({ fetchProjectsAction, fetchProjectsPortfolioAction }));
vi.mock("@/lib/actions/projects-actions.flags", () => ({ IMPLEMENTED: { fetchProjectsPortfolioAction: true } }));
vi.mock("@/lib/actions/workflows-actions", () => ({
  fetchWorkflowsAction: async () => [{ id: "w1", key: "presale", name: "Presale", sortOrder: 1, active: true, autoStart: "on_create" }],
}));
vi.mock("@/lib/actions/contacts-actions", () => ({ fetchContactsAction }));
vi.mock("@/lib/actions/staff-actions", () => ({ fetchStaffAction }));

const portfolioProps = vi.hoisted(() => ({ current: null as ProjectsPortfolioProps | null }));
vi.mock("@/components/proyectos/ProjectsPortfolio", async () => {
  const { useStyle } = await import("@/components/shell/StyleProvider");
  return {
    ProjectsPortfolio: (props: ProjectsPortfolioProps) => {
      portfolioProps.current = props;
      const { style, isOverridden } = useStyle();
      return <div data-testid="portfolio">{`${style}${isOverridden ? " (url)" : ""}`}</div>;
    },
  };
});

import ProyectosPage from "./page";

async function renderPage(searchParams: Record<string, string> = {}) {
  render(await ProyectosPage({ searchParams: Promise.resolve(searchParams) }));
}

beforeEach(() => {
  state.style = "visual";
  state.access = "Colaborador";
  state.canViewProjects = true;
  state.canCreateProject = true;
  portfolioProps.current = null;
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe("/proyectos page", () => {
  it("renders the portfolio in the viewer's style", async () => {
    state.style = "esencial";
    await renderPage();
    expect(screen.getByTestId("portfolio").textContent).toBe("esencial");
    expect(fetchProjectsPortfolioAction).toHaveBeenCalledTimes(1);
    expect(portfolioProps.current?.tramos?.map((t) => t.key)).toEqual(["presale", "diseno"]);
    expect(portfolioProps.current?.presaleAutoStart).toBe(true);
  });

  it("?estilo= overrides the style for this render", async () => {
    await renderPage({ estilo: "analitico" });
    expect(screen.getByTestId("portfolio").textContent).toBe("analitico (url)");
  });

  it("non-admins get no admin data and no client/staff lookups", async () => {
    await renderPage();
    expect(portfolioProps.current?.canSeeAdminData).toBe(false);
    expect(portfolioProps.current?.adminOptions).toBeNull();
    expect(fetchContactsAction).not.toHaveBeenCalled();
    expect(fetchStaffAction).not.toHaveBeenCalled();
  });

  it("admins get the clients and active staff for the dialog", async () => {
    state.access = "Administrador";
    await renderPage();
    expect(portfolioProps.current?.canSeeAdminData).toBe(true);
    expect(portfolioProps.current?.adminOptions).toEqual({
      clients: [{ id: "c1", name: "Familia Gómez" }],
      staff: [{ id: "s1", name: "Ana López" }],
    });
  });

  it("passes canCreateProject through", async () => {
    state.canCreateProject = false;
    await renderPage();
    expect(portfolioProps.current?.canCreateProject).toBe(false);
  });

  it("404 without projects.canViewProjects", async () => {
    state.canViewProjects = false;
    await expect(ProyectosPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
