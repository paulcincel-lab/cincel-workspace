// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { ProjectTabsProps } from "@/components/proyectos/ProjectTabs";

const state = vi.hoisted(() => ({
  manageAccess: true,
  admin: false,
  signedIn: true,
  shell: true,
  editor: true,
}));

const tabsSeen = vi.hoisted(() => [] as ProjectTabsProps[]);
const fichaSeen = vi.hoisted(() => [] as { tabs: ReactNode; projectId: string }[]);
/** The ficha page's loaders (5b, #960): the shell, the ficha, its Bitácora and the editor catalogs. */
const loaders = vi.hoisted(() => ({
  loadProyectoShell: vi.fn(),
  loadProyectoFicha: vi.fn(),
  loadProyectoHistory: vi.fn(),
  loadCatalogStaff: vi.fn(),
  loadCatalogContacts: vi.fn(),
  loadCatalogWorkflows: vi.fn(),
}));
/** The Drive-counting shell of the server-rendered tabs: the ficha no longer uses it. */
const loadProjectTabShell = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: async () => {
    if (!state.signedIn) throw new Error("UNAUTHENTICATED");
    return { member: { id: "s1", name: "Ana" }, access: state.admin ? "Administrador" : "Colaborador" };
  },
}));
vi.mock("@/lib/auth/permissions", () => ({
  canSeeAdminData: () => state.admin,
  resolveProjectsCapabilities: () => ({ canEditProjectGeneral: state.editor, canChangeProjectStage: state.editor }),
}));
vi.mock("@/lib/projects/project-tab-shell", () => ({ loadProjectTabShell }));
vi.mock("@/lib/loaders/proyectos-shell", () => ({ loadProyectoShell: loaders.loadProyectoShell }));
vi.mock("@/lib/loaders/proyectos", () => ({
  loadProyectoFicha: loaders.loadProyectoFicha,
  loadProyectoHistory: loaders.loadProyectoHistory,
}));
vi.mock("@/lib/loaders/catalog", () => ({
  loadCatalogStaff: loaders.loadCatalogStaff,
  loadCatalogContacts: loaders.loadCatalogContacts,
  loadCatalogWorkflows: loaders.loadCatalogWorkflows,
}));
vi.mock("@/components/proyectos/ProjectTabs", () => ({
  ProjectTabs: (props: ProjectTabsProps) => {
    tabsSeen.push(props);
    return <nav aria-label="Secciones del proyecto" data-testid={`tabs-${props.active}`} />;
  },
}));
vi.mock("./ficha/ProjectFichaClient", () => ({
  ProjectFichaClient: (props: { tabs: ReactNode; projectId: string }) => {
    fichaSeen.push(props);
    return <div data-testid="ficha-client">{props.tabs}</div>;
  },
}));

import { qk } from "@/lib/query/keys";
import { renderWithQueryClient } from "@/lib/query/test-utils";

// The Clientes tab has its own test next to its page (`clientes/page.test.tsx`, 5d #962).
import ProjectFichaPage from "./ficha/page";

const PARAMS = { params: Promise.resolve({ id: "p1" }) };

const DETAIL = { id: "p1", name: "Casa Lomas", client: null, currentWorkflow: null };

beforeEach(() => {
  Object.assign(state, { manageAccess: true, admin: false, signedIn: true, shell: true, editor: true });
  tabsSeen.length = 0;
  fichaSeen.length = 0;
  vi.clearAllMocks();
  loaders.loadProyectoShell.mockImplementation(async () =>
    state.shell
      ? {
          detail: DETAIL,
          project: { id: "p1", name: "Casa Lomas", tramo: null },
          counts: { tareas: 7, archivos: 0, clientes: 2 },
          canManagePortal: state.manageAccess,
        }
      : null,
  );
  loaders.loadProyectoFicha.mockResolvedValue({ project: DETAIL, tasks: [], spaces: [], importData: null });
  loaders.loadProyectoHistory.mockResolvedValue({ events: [], nextCursor: null });
  loaders.loadCatalogStaff.mockResolvedValue([]);
  loaders.loadCatalogContacts.mockResolvedValue([]);
  loaders.loadCatalogWorkflows.mockResolvedValue([]);
});
afterEach(cleanup);

describe("Ficha tab", () => {
  it("prefetches the shell and the ficha and renders ProjectTabs from the shell query", async () => {
    const { client } = renderWithQueryClient(await ProjectFichaPage(PARAMS));
    expect(screen.getByTestId("tabs-ficha")).toBeTruthy();
    expect(tabsSeen.at(-1)).toMatchObject({ active: "ficha", counts: { tareas: 7, clientes: 2 } });
    expect(fichaSeen.at(-1)?.projectId).toBe("p1");
    expect(loaders.loadProyectoShell).toHaveBeenCalledWith(expect.anything(), { id: "p1" });
    expect(loaders.loadProyectoFicha).toHaveBeenCalledWith(expect.anything(), { id: "p1" });
    expect(loaders.loadProyectoHistory).toHaveBeenCalledWith(expect.anything(), { id: "p1", cursor: null });
    // Hydrated: the ficha payload also seeds the espacios and import data keys.
    expect(client.getQueryData(qk.proyectos.tab("p1", "ficha"))).toMatchObject({ project: { id: "p1" } });
    expect(client.getQueryData(qk.catalog.projectSpaces("p1"))).toEqual([]);
    expect(client.getQueryData(qk.importData("project", "p1"))).toBeNull();
    expect(client.getQueryData(qk.proyectos.history("p1"))).toMatchObject({ pages: [{ events: [] }] });
    // The Drive-counting tab shell is not used.
    expect(loadProjectTabShell).not.toHaveBeenCalled();
  });

  it("prefetches the editor catalogs only for editors", async () => {
    renderWithQueryClient(await ProjectFichaPage(PARAMS));
    expect(loaders.loadCatalogStaff).toHaveBeenCalled();
    expect(loaders.loadCatalogContacts).toHaveBeenCalledWith(expect.anything(), {});
    expect(loaders.loadCatalogWorkflows).toHaveBeenCalled();
    cleanup();
    vi.clearAllMocks();

    state.editor = false;
    renderWithQueryClient(await ProjectFichaPage(PARAMS));
    expect(loaders.loadCatalogStaff).not.toHaveBeenCalled();
    expect(loaders.loadCatalogContacts).not.toHaveBeenCalled();
    expect(loaders.loadCatalogWorkflows).not.toHaveBeenCalled();
  });

  it("passes canManagePortal false without portal.manageAccess", async () => {
    state.manageAccess = false;
    renderWithQueryClient(await ProjectFichaPage(PARAMS));
    expect(tabsSeen.at(-1)).toMatchObject({ active: "ficha", canManagePortal: false });
  });

  it("shows not found when the project can't be read", async () => {
    state.shell = false;
    renderWithQueryClient(await ProjectFichaPage(PARAMS));
    expect(screen.getByRole("heading", { name: "Proyecto no encontrado" })).toBeTruthy();
    expect(fichaSeen).toHaveLength(0);
    expect(loaders.loadProyectoFicha).not.toHaveBeenCalled();
  });

  it("asks to sign in without a session", async () => {
    state.signedIn = false;
    render(await ProjectFichaPage(PARAMS));
    expect(screen.getByRole("heading", { name: "Sin permiso" })).toBeTruthy();
    expect(fichaSeen).toHaveLength(0);
  });
});
