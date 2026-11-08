// @vitest-environment happy-dom
/**
 * `/proyectos/[id]/clientes` (Query Migration 5d, #962): guarded by
 * `portal.manageAccess`; prefetches the shell, the Clientes data and the
 * activity in parallel and hydrates them, so the client view renders from the
 * cache with no action call. No Drive call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

import type { ProjectTabsProps } from "@/components/proyectos/ProjectTabs";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";

const state = vi.hoisted(() => ({ manageAccess: true, signedIn: true, shell: true, clientes: true }));
const loaders = vi.hoisted(() => ({
  loadProyectoShell: vi.fn(),
  loadProyectoClientes: vi.fn(),
  loadProyectoClientesActivity: vi.fn(),
}));
const pageData = vi.hoisted(() => ({
  getProyectoShell: vi.fn(),
  getProyectoClientesData: vi.fn(),
  getProyectoClientesActivity: vi.fn(),
}));
const drive = vi.hoisted(() => ({ getStaffFilesProject: vi.fn(), listStaffProjectFiles: vi.fn() }));
const tabsSeen = vi.hoisted(() => [] as ProjectTabsProps[]);

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: async () => {
    if (!state.signedIn) throw new Error("UNAUTHENTICATED");
    return { member: { id: "s1", name: "Ana" }, access: "Colaborador" };
  },
}));
vi.mock("@/lib/auth/permissions", () => ({
  resolvePortalCapabilities: () => ({ manageAccess: state.manageAccess, disableUsers: false }),
}));
vi.mock("@/lib/loaders/proyectos-shell", () => ({ loadProyectoShell: loaders.loadProyectoShell }));
vi.mock("@/lib/loaders/proyectos", () => ({
  loadProyectoClientes: loaders.loadProyectoClientes,
  loadProyectoClientesActivity: loaders.loadProyectoClientesActivity,
}));
vi.mock("@/lib/actions/page-data/proyectos-shell-actions", () => ({ getProyectoShell: pageData.getProyectoShell }));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => pageData);
vi.mock("@/lib/google/staff-files-app", () => drive);
// A fresh server client per render (the real one is request-scoped through React `cache`).
vi.mock("@/lib/query/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/query/server")>();
  const { createTestQueryClient: make } = await import("@/lib/query/test-utils");
  return { ...real, getQueryClient: () => make() };
});
vi.mock("@/components/proyectos/ProjectTabs", () => ({
  ProjectTabs: (props: ProjectTabsProps) => {
    tabsSeen.push(props);
    return <nav aria-label="Secciones del proyecto" data-testid={`tabs-${props.active}`} />;
  },
}));
vi.mock("@/components/proyectos/PortalAccessPanel", () => ({
  PortalAccessPanel: (props: { rows: unknown[]; hasClient: boolean; canAssignClient: boolean; projectName: string }) => (
    <div data-testid="portal-panel">
      {`${props.projectName}: ${props.rows.length} accesos · cliente ${props.hasClient ? "sí" : "no"} · asignar ${props.canAssignClient ? "sí" : "no"}`}
    </div>
  ),
}));

import ProjectClientesPage from "./page";

const ID = "22222222-2222-4222-8222-222222222222";
const PARAMS = { params: Promise.resolve({ id: ID }) };

beforeEach(() => {
  Object.assign(state, { manageAccess: true, signedIn: true, shell: true, clientes: true });
  tabsSeen.length = 0;
  vi.clearAllMocks();
  loaders.loadProyectoShell.mockImplementation(async () =>
    state.shell
      ? {
          detail: { id: ID },
          project: { id: ID, name: "Casa Lomas", tramo: null },
          counts: { tareas: 7, archivos: 0, clientes: 2 },
          canManagePortal: true,
        }
      : null,
  );
  loaders.loadProyectoClientes.mockImplementation(async () =>
    state.clientes
      ? {
          rows: [{ accessId: "a1" }, { accessId: "a2" }],
          contacts: [],
          capabilities: { manageAccess: true, disableUsers: false },
          hasClient: true,
          canAssignClient: false,
          clientFolderUrl: null,
        }
      : null,
  );
  loaders.loadProyectoClientesActivity.mockResolvedValue([]);
});
afterEach(cleanup);

async function renderPage() {
  return renderWithQueryClient(await ProjectClientesPage(PARAMS), { client: createTestQueryClient() });
}

describe("Clientes tab", () => {
  it("is guarded by portal.manageAccess and loads nothing without it", async () => {
    state.manageAccess = false;
    await renderPage();
    expect(screen.getByRole("heading", { name: "Sin permiso" })).toBeTruthy();
    expect(screen.queryByTestId("portal-panel")).toBeNull();
    expect(loaders.loadProyectoClientes).not.toHaveBeenCalled();
    expect(loaders.loadProyectoShell).not.toHaveBeenCalled();
  });

  it("asks for permission without a session", async () => {
    state.signedIn = false;
    await renderPage();
    expect(screen.getByRole("heading", { name: "Sin permiso" })).toBeTruthy();
  });

  it("prefetches the shell, the Clientes data and the activity, and renders from the cache", async () => {
    await renderPage();
    expect(loaders.loadProyectoShell).toHaveBeenCalledTimes(1);
    expect(loaders.loadProyectoClientes).toHaveBeenCalledWith(expect.anything(), { id: ID });
    expect(loaders.loadProyectoClientesActivity).toHaveBeenCalledWith(expect.anything(), { id: ID });
    expect(screen.getByTestId("tabs-clientes")).toBeTruthy();
    expect(screen.getByTestId("portal-panel").textContent).toBe("Casa Lomas: 2 accesos · cliente sí · asignar no");
    expect(tabsSeen.at(-1)).toMatchObject({ active: "clientes", canManagePortal: true, counts: { clientes: 2 } });
    // Hydrated: the client makes no page-data call, and Clientes never touches Drive.
    expect(pageData.getProyectoShell).not.toHaveBeenCalled();
    expect(pageData.getProyectoClientesData).not.toHaveBeenCalled();
    expect(pageData.getProyectoClientesActivity).not.toHaveBeenCalled();
    expect(drive.getStaffFilesProject).not.toHaveBeenCalled();
    expect(drive.listStaffProjectFiles).not.toHaveBeenCalled();
  });

  it("shows not found when the project can't be read", async () => {
    state.shell = false;
    await renderPage();
    expect(screen.getByRole("heading", { name: "Proyecto no encontrado" })).toBeTruthy();
    expect(tabsSeen).toHaveLength(0);
  });

  it("shows not found when the Clientes data is out of scope", async () => {
    state.clientes = false;
    await renderPage();
    expect(screen.getByRole("heading", { name: "Proyecto no encontrado" })).toBeTruthy();
  });
});
