// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/proyectos/p1" }));
// Custom permission overrides live in localStorage; stub it so the tests use the default matrix.
vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn((_key: string, fallback: unknown) => fallback),
}));
vi.mock("@/components/shell/EstiloSwitch", () => ({
  EstiloSwitch: () => <div data-testid="estilo-switch" />,
}));
vi.mock("@/components/widgets/TramoBadge", () => ({
  TramoBadge: ({ tramo }: { tramo: { name: string } }) => <span data-testid="tramo-chip">{tramo.name}</span>,
}));

import type { SessionAccess } from "@/lib/auth/session";
import { useSessionStore } from "@/lib/stores/session-store";

import { ProjectTabs, type ProjectTabsProps, newTaskHref, reportHref } from "./ProjectTabs";

const PROJECT: ProjectTabsProps["project"] = {
  id: "p1",
  name: "Local Espinopapa",
  tramo: { id: "w3", key: "construccion", name: "Construcción", sortOrder: 3 },
  projectType: "Local comercial",
  addressCity: "CDMX",
  manager: { id: "s1", name: "Paul Langarica" },
};

const COUNTS = { tareas: 39, archivos: 48, clientes: 2 };

function renderTabs(props: Partial<ProjectTabsProps> = {}) {
  return render(<ProjectTabs project={PROJECT} active="resumen" counts={COUNTS} canManagePortal={false} {...props} />);
}

/** The tab link whose text starts with `label` (Base UI gives each tab role="tab"). */
function tab(label: string): HTMLAnchorElement | null {
  const nav = screen.getByRole("navigation", { name: "Secciones del proyecto" });
  return (
    Array.from(nav.querySelectorAll("a")).find((a) => a.textContent?.trim().startsWith(label)) ?? null
  );
}

afterEach(() => {
  cleanup();
  useSessionStore.setState({ access: { status: "guest", user: null } });
});

describe("ProjectTabs", () => {
  it("renders the tabs in order with counts, Resumen at the project URL and Ficha last", () => {
    renderTabs({ canManagePortal: true });
    const nav = screen.getByRole("navigation", { name: "Secciones del proyecto" });
    const labels = Array.from(nav.querySelectorAll("a")).map((a) => a.textContent?.trim());
    expect(labels).toEqual(["Resumen", "Tareas39", "Cronograma", "Archivos48", "Clientes2", "Ficha"]);
    expect(tab("Resumen")?.getAttribute("href")).toBe("/proyectos/p1");
    expect(tab("Tareas")?.getAttribute("href")).toBe("/proyectos/p1/tareas");
    expect(tab("Ficha")?.getAttribute("href")).toBe("/proyectos/p1/ficha");
  });

  it("hides the Clientes tab without portal.manageAccess", () => {
    renderTabs({ canManagePortal: false });
    expect(tab("Clientes")).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Clientes" })).toBeNull();
  });

  it("hides the Clientes tab even when the session would allow it, if the server said no", () => {
    const user = { id: "s1", name: "Ana", email: "ana@example.test", role: "Administrador", area: null, active: true, access: "Administrador" };
    useSessionStore.setState({ access: { status: "active", user } as unknown as SessionAccess });
    renderTabs({ canManagePortal: false });
    expect(tab("Clientes")).toBeNull();
  });

  it("shows the Clientes tab with its count with portal.manageAccess", () => {
    renderTabs({ canManagePortal: true });
    expect(tab("Clientes")?.getAttribute("href")).toBe("/proyectos/p1/clientes");
  });

  it("marks the active tab", () => {
    renderTabs({ active: "archivos" });
    expect(tab("Archivos")?.getAttribute("aria-current")).toBe("page");
    expect(tab("Resumen")?.getAttribute("aria-current")).toBeNull();
  });

  it("renders the header: breadcrumb, name, tramo chip, meta line and actions", () => {
    renderTabs();
    expect(screen.getByRole("heading", { level: 1, name: "Local Espinopapa" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Proyectos" }).getAttribute("href")).toBe("/proyectos");
    expect(screen.getByTestId("tramo-chip").textContent).toBe("Construcción");
    expect(screen.getByText("Local comercial · CDMX · Responsable: Paul Langarica")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Reporte" }).getAttribute("href")).toBe(reportHref("p1"));
    expect(screen.getByRole("link", { name: "Nueva tarea" }).getAttribute("href")).toBe(newTaskHref("p1"));
    expect(reportHref("p1")).toBe("/proyectos/p1/cronograma/reporte");
    expect(newTaskHref("p1")).toBe("/tareas?proyecto=p1&nueva=1");
  });

  it("leaves out the meta line and chip when the project has neither", () => {
    renderTabs({ project: { id: "p1", name: "Sin datos", tramo: null } });
    expect(screen.queryByTestId("tramo-chip")).toBeNull();
    expect(screen.queryByText(/Responsable:/)).toBeNull();
  });

  it("renders EstiloSwitch only when asked", () => {
    renderTabs();
    expect(screen.queryByTestId("estilo-switch")).toBeNull();
    cleanup();
    renderTabs({ showEstilo: true });
    expect(screen.getByTestId("estilo-switch")).toBeTruthy();
  });
});
