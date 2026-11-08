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
}));

const portal = vi.hoisted(() => ({
  listProjectPortalAccessAction: vi.fn(),
  listInvitablePortalContactsAction: vi.fn(),
}));
const loadProjectTabShell = vi.hoisted(() => vi.fn());
const tabsSeen = vi.hoisted(() => [] as ProjectTabsProps[]);
const fichaSeen = vi.hoisted(() => [] as { tabs: ReactNode }[]);

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: async () => {
    if (!state.signedIn) throw new Error("UNAUTHENTICATED");
    return { member: { id: "s1", name: "Ana" }, access: state.admin ? "Administrador" : "Colaborador" };
  },
}));
vi.mock("@/lib/auth/permissions", () => ({
  canSeeAdminData: () => state.admin,
  resolvePortalCapabilities: () => ({ manageAccess: state.manageAccess, disableUsers: false }),
}));
vi.mock("@/lib/actions/portal-actions", () => ({ listProjectPortalAccessAction: portal.listProjectPortalAccessAction }));
vi.mock("@/lib/actions/portal-contacts-actions", () => ({
  listInvitablePortalContactsAction: portal.listInvitablePortalContactsAction,
}));
vi.mock("@/lib/projects/project-tab-shell", () => ({ loadProjectTabShell }));
vi.mock("@/components/proyectos/ProjectTabs", () => ({
  ProjectTabs: (props: ProjectTabsProps) => {
    tabsSeen.push(props);
    return <nav aria-label="Secciones del proyecto" data-testid={`tabs-${props.active}`} />;
  },
}));
vi.mock("@/components/proyectos/PortalAccessPanel", () => ({
  PortalAccessPanel: (props: { rows: unknown[]; hasClient: boolean; canAssignClient: boolean }) => (
    <div data-testid="portal-panel">
      {`${props.rows.length} accesos · cliente ${props.hasClient ? "sí" : "no"} · asignar ${props.canAssignClient ? "sí" : "no"}`}
    </div>
  ),
}));
vi.mock("./ficha/ProjectFichaClient", () => ({
  ProjectFichaClient: (props: { tabs: ReactNode }) => {
    fichaSeen.push(props);
    return <div data-testid="ficha-client">{props.tabs}</div>;
  },
}));

import ProjectClientesPage from "./clientes/page";
import ProjectFichaPage from "./ficha/page";

const PARAMS = { params: Promise.resolve({ id: "p1" }) };

const DETAIL = { id: "p1", name: "Casa Lomas", client: null, currentWorkflow: null };

beforeEach(() => {
  Object.assign(state, { manageAccess: true, admin: false, signedIn: true, shell: true });
  tabsSeen.length = 0;
  fichaSeen.length = 0;
  vi.clearAllMocks();
  portal.listProjectPortalAccessAction.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
  portal.listInvitablePortalContactsAction.mockResolvedValue([{ id: "c1", isProjectClient: true }]);
  loadProjectTabShell.mockImplementation(async (_id: string, _user: unknown, opts: { clientes?: number } = {}) =>
    state.shell
      ? {
          detail: DETAIL,
          project: { id: "p1", name: "Casa Lomas", tramo: null },
          counts: { tareas: 7, archivos: 3, clientes: opts.clientes ?? 0 },
          canManagePortal: state.manageAccess,
        }
      : null,
  );
});
afterEach(cleanup);

describe("Clientes tab", () => {
  it("is guarded by portal.manageAccess", async () => {
    state.manageAccess = false;
    render(await ProjectClientesPage(PARAMS));
    expect(screen.getByRole("heading", { name: "Sin permiso" })).toBeTruthy();
    expect(screen.queryByTestId("portal-panel")).toBeNull();
    expect(tabsSeen).toHaveLength(0);
    expect(portal.listProjectPortalAccessAction).not.toHaveBeenCalled();
  });

  it("renders the portal panel under ProjectTabs", async () => {
    render(await ProjectClientesPage(PARAMS));
    expect(screen.getByTestId("tabs-clientes")).toBeTruthy();
    expect(screen.getByTestId("portal-panel").textContent).toBe("2 accesos · cliente sí · asignar no");
    expect(tabsSeen.at(-1)).toMatchObject({ active: "clientes", canManagePortal: true, counts: { clientes: 2 } });
  });

  it("reads the client from the project only for admins", async () => {
    state.admin = true;
    render(await ProjectClientesPage(PARAMS));
    // The admin sees the project's own client field (null here), not the contacts' flag.
    expect(screen.getByTestId("portal-panel").textContent).toBe("2 accesos · cliente no · asignar sí");
  });

  it("shows not found when the project can't be read", async () => {
    state.shell = false;
    render(await ProjectClientesPage(PARAMS));
    expect(screen.getByRole("heading", { name: "Proyecto no encontrado" })).toBeTruthy();
    expect(tabsSeen).toHaveLength(0);
  });
});

describe("Ficha tab", () => {
  it("renders the ficha form under ProjectTabs", async () => {
    render(await ProjectFichaPage(PARAMS));
    expect(screen.getByTestId("tabs-ficha")).toBeTruthy();
    expect(tabsSeen.at(-1)).toMatchObject({ active: "ficha", counts: { tareas: 7, archivos: 3 } });
  });

  it("passes canManagePortal false without portal.manageAccess", async () => {
    state.manageAccess = false;
    render(await ProjectFichaPage(PARAMS));
    expect(tabsSeen.at(-1)).toMatchObject({ active: "ficha", canManagePortal: false });
  });

  it("asks to sign in without a session", async () => {
    state.signedIn = false;
    render(await ProjectFichaPage(PARAMS));
    expect(screen.getByRole("heading", { name: "Sin permiso" })).toBeTruthy();
    expect(fichaSeen).toHaveLength(0);
  });
});
