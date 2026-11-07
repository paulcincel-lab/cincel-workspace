import { readFileSync } from "fs";
import { resolve } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { ProjectDetail, TaskListItem } from "@/lib/types/core";

const state = vi.hoisted(() => ({ admin: false }));

const actions = vi.hoisted(() => ({
  fetchProjectAction: vi.fn(),
  updateProjectAction: vi.fn(),
  setProjectStagesAction: vi.fn(),
  setProjectMembersAction: vi.fn(),
  setProjectContactsAction: vi.fn(),
  addProjectLinkAction: vi.fn(),
  removeProjectLinkAction: vi.fn(),
  previewApplyWorkflowAction: vi.fn(),
  applyWorkflowAction: vi.fn(),
}));

const taskActions = vi.hoisted(() => ({
  fetchTasksAction: vi.fn(),
  fetchAdminTasksAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "p1" }) }));
vi.mock("@/components/layout/Sidebar", () => ({ default: () => null }));
vi.mock("@/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/components/proyectos/ProjectSectionNav", () => ({ ProjectSectionNav: () => null }));
vi.mock("@/components/proyectos/ProjectBitacoraCard", () => ({ ProjectBitacoraCard: () => null }));
vi.mock("@/components/ui/DriveLinksEditor", () => ({ DriveLinksEditor: () => null }));
vi.mock("@/components/ui/ImportDataPanel", () => ({
  hasImportData: () => false,
  ImportDataPanel: () => null,
  useImportData: () => null,
}));
vi.mock("@/lib/google/use-google-connect-result", () => ({ useGoogleConnectResult: () => null }));
vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => ({ access: state.admin ? "Administrador" : "Colaborador" }),
}));
vi.mock("@/lib/auth/permissions", () => ({
  canSeeAdminData: (user: { access?: string } | null) => user?.access === "Administrador",
  resolveProjectsCapabilities: () => ({
    canEditProjectGeneral: true,
    canChangeProjectStage: false,
    canEditProtectedProjectData: false,
  }),
}));
vi.mock("@/lib/actions/projects-actions", () => actions);
vi.mock("@/lib/actions/tasks-actions", () => taskActions);
vi.mock("@/lib/actions/staff-actions", () => ({ fetchStaffAction: () => Promise.resolve([]) }));
vi.mock("@/lib/actions/workflows-actions", () => ({ fetchWorkflowsAction: () => Promise.resolve([]) }));
vi.mock("@/lib/actions/contacts-actions", () => ({
  fetchContactsAction: () =>
    Promise.resolve([
      { id: "c1", name: "Familia Ruiz", type: "cliente" },
      { id: "c2", name: "Grupo Norte", type: "cliente" },
    ]),
}));
// Stands in for the Select-based fields so the test can pick a client directly.
vi.mock("@/components/proyectos/ProjectAdminFields", () => ({
  ProjectAdminFields: ({ onChange, value }: { onChange: (v: unknown) => void; value: Record<string, unknown> }) => (
    <button type="button" onClick={() => onChange({ ...value, clientId: "c2" })}>
      Elegir Grupo Norte
    </button>
  ),
  projectAdminPatch: (v: unknown) => v,
}));

import ProjectFichaPage from "./page";

function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: "p1",
    code: null,
    name: "Casa Lomas",
    clientId: null,
    origin: null,
    originStaffId: null,
    status: "activo",
    currentWorkflowId: null,
    phase: null,
    phases: [],
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
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    client: null,
    currentWorkflow: null,
    tramos: [],
    needsTramo: true,
    stages: [],
    manager: null,
    coordinator: null,
    originStaff: null,
    mondayImport: null,
    members: [],
    contacts: [],
    links: [],
    ...overrides,
  };
}

function adminTask(): TaskListItem {
  return {
    id: "t-admin",
    projectId: "p1",
    kind: "admin",
    templateId: null,
    workflowId: null,
    phase: null,
    phaseId: null,
    spaceId: null,
    closedAt: null,
    title: "Asignar cliente y origen",
    notes: null,
    createdById: null,
    managerId: null,
    status: "pendiente",
    customStatusId: null,
    priority: "media",
    sortOrder: null,
    commitmentDate: null,
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    customStatus: null,
    project: { id: "p1", name: "Casa Lomas", clientName: null },
    workflow: null,
    areaColorSlot: null,
    phase: null,
    space: null,
    manager: null,
    support: [],
    checklist: { total: 0, completed: 0 },
    parentTaskId: null,
    parentTitle: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    waitingOn: 0,
  } as TaskListItem;
}

beforeEach(() => {
  state.admin = false;
  vi.clearAllMocks();
  actions.fetchProjectAction.mockResolvedValue(project());
  actions.updateProjectAction.mockResolvedValue(project());
  taskActions.fetchTasksAction.mockResolvedValue([]);
  taskActions.fetchAdminTasksAction.mockResolvedValue([adminTask()]);
});

afterEach(cleanup);

describe("ficha admin data", () => {
  it("shows no client line, admin fields or Administración group to non-admins", async () => {
    render(<ProjectFichaPage />);
    await screen.findByRole("heading", { name: "Casa Lomas" });
    expect(screen.queryByText("Cliente:")).toBeNull();
    expect(screen.queryByText("Por asignar")).toBeNull();
    expect(screen.queryByText("Administración")).toBeNull();
    expect(taskActions.fetchAdminTasksAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.queryByRole("button", { name: "Elegir Grupo Norte" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(actions.updateProjectAction).toHaveBeenCalled());
    const patch = actions.updateProjectAction.mock.calls[0][1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty("clientId");
    expect(patch).not.toHaveProperty("origin");
    expect(patch).not.toHaveProperty("originStaffId");
  });

  it("shows admins the Por asignar client line and the Administración group", async () => {
    state.admin = true;
    render(<ProjectFichaPage />);
    await screen.findByRole("heading", { name: "Casa Lomas" });
    expect(screen.getByText("Cliente:")).toBeTruthy();
    expect(screen.getByText("Por asignar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Asignar" })).toBeTruthy();
    expect(screen.getByText("Administración")).toBeTruthy();
    expect(taskActions.fetchAdminTasksAction).toHaveBeenCalledWith({ projectId: "p1", includeClosed: true });
  });

  it("confirms a client change with an AlertDialog, saves and refetches", async () => {
    state.admin = true;
    render(<ProjectFichaPage />);
    await screen.findByRole("heading", { name: "Casa Lomas" });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    fireEvent.click(screen.getByRole("button", { name: "Elegir Grupo Norte" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await screen.findByText("¿Cambiar el cliente del proyecto?");
    expect(actions.updateProjectAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cambiar cliente" }));
    await waitFor(() =>
      expect(actions.updateProjectAction).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ clientId: "c2", origin: null, originStaffId: null }),
      ),
    );
    await waitFor(() => expect(actions.fetchProjectAction).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(taskActions.fetchAdminTasksAction).toHaveBeenCalledTimes(2));
  });

  it("no longer uses window.confirm", () => {
    const source = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
    expect(source).not.toContain("window.confirm");
  });
});
