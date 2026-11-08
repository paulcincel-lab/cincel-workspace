// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  user: { member: { id: "s1" }, email: "ana@cincel.mx", access: "Administrador" } as unknown,
  resumen: null as unknown,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/ui/preferences-server", () => ({
  getResolvedAppearance: vi.fn(async () => ({ style: "visual" })),
}));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => {
    if (!state.user) throw new Error("UNAUTHENTICATED");
    return state.user;
  }),
}));
vi.mock("@/lib/proyectos/project-resumen", () => ({
  loadProjectResumen: vi.fn(async () => state.resumen),
}));
vi.mock("@/components/proyectos/ProjectTabs", () => ({
  ProjectTabs: (props: { active: string; showEstilo?: boolean; project: { name: string } }) => (
    <div data-testid="tabs" data-active={props.active} data-estilo={String(Boolean(props.showEstilo))}>
      {props.project.name}
    </div>
  ),
}));
vi.mock("@/components/proyectos/ProjectSummary", () => ({
  ProjectSummary: () => <div data-testid="summary" />,
}));
vi.mock("@/components/shell/StyleProvider", () => ({
  StyleProvider: (props: { style: string; isOverridden?: boolean; children: ReactNode }) => (
    <div data-testid="style" data-style={props.style} data-overridden={String(Boolean(props.isOverridden))}>
      {props.children}
    </div>
  ),
}));

import ProjectPage from "./page";

const RESUMEN = {
  tabs: {
    project: { id: "p1", name: "Local Espinopapa", tramo: null },
    counts: { tareas: 1, archivos: 2, clientes: 0 },
    canManagePortal: false,
  },
  summary: {},
};

async function renderPage(query: Record<string, string> = {}) {
  const ui = await ProjectPage({ params: Promise.resolve({ id: "p1" }), searchParams: Promise.resolve(query) });
  return render(ui);
}

beforeEach(() => {
  state.user = { member: { id: "s1" }, email: "ana@cincel.mx", access: "Administrador" };
  state.resumen = RESUMEN;
});

afterEach(cleanup);

describe("/proyectos/[id]", () => {
  it("renders the tabs (Resumen, with the style switch) and the Resumen", async () => {
    await renderPage();
    const tabs = screen.getByTestId("tabs");
    expect(tabs.getAttribute("data-active")).toBe("resumen");
    expect(tabs.getAttribute("data-estilo")).toBe("true");
    expect(screen.getByTestId("summary")).toBeTruthy();
    expect(screen.getByTestId("style").getAttribute("data-style")).toBe("visual");
  });

  it("honours ?estilo= for this render only", async () => {
    await renderPage({ estilo: "analitico" });
    const provider = screen.getByTestId("style");
    expect(provider.getAttribute("data-style")).toBe("analitico");
    expect(provider.getAttribute("data-overridden")).toBe("true");
  });

  it("ignores an unknown ?estilo=", async () => {
    await renderPage({ estilo: "otro" });
    expect(screen.getByTestId("style").getAttribute("data-overridden")).toBe("false");
  });

  it("shows «Proyecto no encontrado» when the project can't be read", async () => {
    state.resumen = null;
    await renderPage();
    expect(screen.getByRole("heading", { name: "Proyecto no encontrado" })).toBeTruthy();
    expect(screen.queryByTestId("tabs")).toBeNull();
  });

  it("asks to sign in without a session", async () => {
    state.user = null;
    await renderPage();
    expect(screen.getByRole("heading", { name: "Sin permiso" })).toBeTruthy();
  });
});
