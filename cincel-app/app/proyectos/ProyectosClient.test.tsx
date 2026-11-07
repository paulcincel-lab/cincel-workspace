import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import type { ProjectItem } from "@/lib/proyectos/use-projects-data";
import { ProyectosClient, currentTramoOf } from "./ProyectosClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/proyectos",
  useSearchParams: () => new URLSearchParams(),
}));

const viewer = vi.hoisted(() => ({ access: "Administrador" as string }));
const rows = vi.hoisted(() => ({ current: [] as unknown[] }));

vi.mock("@/lib/proyectos/use-projects-data", () => ({
  useProjectsData: () => ({
    projectsData: rows.current,
    isLoadingData: false,
    fetchError: null,
    activeStaff: [],
    authenticatedUser: { member: { id: "u1", name: "Ana" }, email: "ana@example.com", access: viewer.access },
    refresh: vi.fn(),
    addProject: vi.fn(),
    updateProject: vi.fn(),
    archiveProject: vi.fn(),
    removeProject: vi.fn(),
  }),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveProjectsCapabilities: () => ({
    canViewProjects: true,
    canCreateProject: true,
    canEditProjectGeneral: true,
    canChangeProjectStage: true,
    canArchiveProject: false,
    canDeleteProject: false,
    canEditProtectedProjectData: false,
    canExportData: true,
  }),
}));

vi.mock("@/lib/utils/export-service", () => ({ exportTableData: vi.fn() }));

const DISENO = { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 };

function makeProject(overrides: Partial<ProjectItem>): ProjectItem {
  return {
    id: "p1",
    code: null,
    name: "Casa Lomas",
    clientId: "c1",
    origin: null,
    originStaffId: null,
    status: "activo",
    currentWorkflowId: DISENO.id,
    projectType: null,
    addressStreet: null,
    addressCity: null,
    addressState: null,
    managerId: null,
    coordinatorId: null,
    progress: 0,
    startDate: null,
    endDate: null,
    contractAmountMxn: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    client: { id: "c1", name: "Familia Ruiz", type: "cliente" },
    currentWorkflow: DISENO,
    tramos: [{ ...DISENO, startedAt: "2026-11-01T00:00:00.000Z", closedAt: null, current: true }],
    activePhase: { id: "f1", name: "Ejecutivo", sortOrder: 3 },
    needsTramo: false,
    manager: null,
    coordinator: null,
    taskCounts: { total: 4, open: 2, blocked: 0 },
    ...overrides,
  } as ProjectItem;
}

const WITH_TRAMO = makeProject({});
const WITHOUT_TRAMO = makeProject({
  id: "p2",
  name: "Oficinas Centro",
  clientId: null,
  client: null,
  currentWorkflowId: null,
  currentWorkflow: null,
  tramos: [],
  activePhase: null,
  needsTramo: true,
});

function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest("tr") as HTMLElement;
}

afterEach(() => {
  cleanup();
});

describe("currentTramoOf", () => {
  it("returns the current tramo, or null when the project needs one", () => {
    expect(currentTramoOf(WITH_TRAMO)?.name).toBe("Diseño");
    expect(currentTramoOf(WITHOUT_TRAMO)).toBeNull();
  });
});

describe("ProyectosClient columns", () => {
  it("shows Tramo and Fase activa for admins, with Asignar tramo and Por asignar", () => {
    viewer.access = "Administrador";
    rows.current = [WITH_TRAMO, WITHOUT_TRAMO];
    render(<ProyectosClient initialProjects={[]} />);

    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent?.replace(/[▲▼]/g, "").trim());
    expect(headers).toEqual(
      expect.arrayContaining(["Proyecto", "Tramo", "Fase activa", "Encargado", "Tareas abiertas", "Estado", "Cliente"])
    );
    expect(headers).not.toContain("Etapas");
    expect(headers.indexOf("Tramo")).toBeLessThan(headers.indexOf("Fase activa"));
    expect(headers.indexOf("Estado")).toBeLessThan(headers.indexOf("Cliente"));

    const withTramo = within(rowOf("Casa Lomas"));
    expect(withTramo.getByText("Diseño")).toBeTruthy();
    expect(withTramo.getByText("Ejecutivo")).toBeTruthy();
    expect(withTramo.getByText("Familia Ruiz")).toBeTruthy();

    const withoutTramo = within(rowOf("Oficinas Centro"));
    const assign = withoutTramo.getByRole("link", { name: "Asignar tramo" });
    expect(assign.getAttribute("href")).toBe("/proyectos/p2/ficha#tramos");
    expect(withoutTramo.getByText("—")).toBeTruthy();
    expect(withoutTramo.getByText("Por asignar")).toBeTruthy();
  });

  it("shows Sin tramo and no Cliente column for non-admins", () => {
    viewer.access = "Colaborador";
    rows.current = [WITH_TRAMO, WITHOUT_TRAMO];
    render(<ProyectosClient initialProjects={[]} />);

    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent?.replace(/[▲▼]/g, "").trim());
    expect(headers).not.toContain("Cliente");

    const withoutTramo = within(rowOf("Oficinas Centro"));
    expect(withoutTramo.getByText("Sin tramo")).toBeTruthy();
    expect(withoutTramo.queryByText("Asignar tramo")).toBeNull();
    expect(screen.queryByText("Familia Ruiz")).toBeNull();
  });
});
