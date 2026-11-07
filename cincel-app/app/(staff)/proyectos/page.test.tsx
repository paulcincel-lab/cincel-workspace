// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { ProjectsPortfolioProps } from "@/components/proyectos/ProjectsPortfolio";
import type { ResolvedAppearance } from "@/lib/types/redesign";

const state = vi.hoisted(() => ({
  redesignEnabled: false,
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
      redesignEnabled: state.redesignEnabled,
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
vi.mock("@/components/layout/Sidebar", () => ({ default: () => <nav data-testid="legacy-sidebar" /> }));
vi.mock("@/components/layout/Header", () => ({ default: () => <header data-testid="legacy-header" /> }));
vi.mock("./ProyectosClient", () => ({
  ProyectosClient: (props: { presaleAutoStart: boolean }) => (
    <div data-testid="legacy-client">{props.presaleAutoStart ? "autostart" : "manual"}</div>
  ),
}));

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
  state.redesignEnabled = false;
  state.style = "visual";
  state.access = "Colaborador";
  state.canViewProjects = true;
  state.canCreateProject = true;
  portfolioProps.current = null;
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe("/proyectos page", () => {
  it("flag off: renders today's page with the legacy shell and no portfolio", async () => {
    await renderPage();
    expect(screen.getByTestId("legacy-sidebar")).toBeTruthy();
    expect(screen.getByTestId("legacy-header")).toBeTruthy();
    expect(screen.getByTestId("legacy-client").textContent).toBe("autostart");
    expect(screen.queryByTestId("portfolio")).toBeNull();
    expect(fetchProjectsPortfolioAction).not.toHaveBeenCalled();
  });

  it("flag on: renders the portfolio without the legacy shell, in the viewer's style", async () => {
    state.redesignEnabled = true;
    state.style = "esencial";
    await renderPage();
    expect(screen.queryByTestId("legacy-sidebar")).toBeNull();
    expect(screen.getByTestId("portfolio").textContent).toBe("esencial");
    expect(fetchProjectsPortfolioAction).toHaveBeenCalledTimes(1);
    expect(portfolioProps.current?.tramos?.map((t) => t.key)).toEqual(["presale", "diseno"]);
    expect(portfolioProps.current?.presaleAutoStart).toBe(true);
  });

  it("flag on: ?estilo= overrides the style for this render", async () => {
    state.redesignEnabled = true;
    await renderPage({ estilo: "analitico" });
    expect(screen.getByTestId("portfolio").textContent).toBe("analitico (url)");
  });

  it("flag on: non-admins get no admin data and no client/staff lookups", async () => {
    state.redesignEnabled = true;
    await renderPage();
    expect(portfolioProps.current?.canSeeAdminData).toBe(false);
    expect(portfolioProps.current?.adminOptions).toBeNull();
    expect(fetchContactsAction).not.toHaveBeenCalled();
    expect(fetchStaffAction).not.toHaveBeenCalled();
  });

  it("flag on: admins get the clients and active staff for the dialog", async () => {
    state.redesignEnabled = true;
    state.access = "Administrador";
    await renderPage();
    expect(portfolioProps.current?.canSeeAdminData).toBe(true);
    expect(portfolioProps.current?.adminOptions).toEqual({
      clients: [{ id: "c1", name: "Familia Gómez" }],
      staff: [{ id: "s1", name: "Ana López" }],
    });
  });

  it("flag on: passes canCreateProject through", async () => {
    state.redesignEnabled = true;
    state.canCreateProject = false;
    await renderPage();
    expect(portfolioProps.current?.canCreateProject).toBe(false);
  });

  it("flag on: 404 without projects.canViewProjects", async () => {
    state.redesignEnabled = true;
    state.canViewProjects = false;
    await expect(ProyectosPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
