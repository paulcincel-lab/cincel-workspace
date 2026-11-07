// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { Staff, TaskListItem } from "@/lib/types/core";

const viewer = vi.hoisted(() => ({ access: "Administrador" as string | null }));

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () =>
    viewer.access
      ? { member: { id: "admin-1", name: "Paula" }, email: "paula@example.com", access: viewer.access }
      : null,
}));

const actions = vi.hoisted(() => ({
  fetchAdminTasksAction: vi.fn(),
  createAdminTaskAction: vi.fn(),
  assignTaskAction: vi.fn(),
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
}));
vi.mock("@/lib/actions/tasks-actions", () => actions);

const staffActions = vi.hoisted(() => ({ fetchStaffAction: vi.fn() }));
vi.mock("@/lib/actions/staff-actions", () => staffActions);

const projectActions = vi.hoisted(() => ({ fetchProjectsAction: vi.fn() }));
vi.mock("@/lib/actions/projects-actions", () => projectActions);

vi.mock("@/lib/actions/task-statuses-actions", () => ({
  fetchTaskStatusesAction: () => Promise.resolve([]),
}));

import NewTaskModal from "./NewTaskModal";
import {
  ADMIN_TASKS_EMPTY,
  ADMIN_TASKS_LOAD_ERROR,
  AdminTasksCard,
  adminStaffOptions,
  adminTaskErrorText,
} from "./AdminTasksCard";

function makeStaff(overrides: Partial<Staff>): Staff {
  return {
    id: "s",
    kind: "empleado",
    name: "Persona",
    lastName: null,
    phone: null,
    email: null,
    role: "Colaborador",
    capacity: 5,
    availability: null,
    active: true,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    googleManaged: false,
    lastLoginAt: null,
    accessRevokedAt: null,
    accessRevokedReason: null,
    ...overrides,
  } as Staff;
}

const STAFF: Staff[] = [
  makeStaff({ id: "admin-1", name: "Paula Admin", role: "Administrador" }),
  makeStaff({ id: "admin-2", name: "Juan Admin", role: "administrador" }),
  makeStaff({ id: "dir-1", name: "Diana Dirección", role: "Dirección" }),
  makeStaff({ id: "col-1", name: "Carlos Colaborador", role: "Colaborador" }),
  makeStaff({ id: "admin-off", name: "Inactiva Admin", role: "Administrador", active: false }),
];

function makeTask(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: "t1",
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
    createdById: "admin-1",
    managerId: null,
    status: "pendiente",
    customStatusId: null,
    priority: "alta",
    sortOrder: null,
    commitmentDate: "2020-01-15",
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2020-01-01",
    updatedAt: "2020-01-01",
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
    ...overrides,
  } as TaskListItem;
}

beforeEach(() => {
  viewer.access = "Administrador";
  actions.fetchAdminTasksAction.mockReset().mockResolvedValue([makeTask()]);
  actions.createAdminTaskAction.mockReset().mockResolvedValue(makeTask({ id: "t2" }));
  actions.assignTaskAction.mockReset();
  staffActions.fetchStaffAction.mockReset().mockResolvedValue(STAFF);
  projectActions.fetchProjectsAction
    .mockReset()
    .mockResolvedValue([{ id: "p1", name: "Casa Lomas", status: "activo" }]);
});

afterEach(() => cleanup());

describe("adminStaffOptions", () => {
  it("keeps only active administrators (Dirección doesn't count)", () => {
    expect(adminStaffOptions(STAFF)).toEqual([
      { id: "admin-1", name: "Paula Admin" },
      { id: "admin-2", name: "Juan Admin" },
    ]);
  });
});

describe("adminTaskErrorText", () => {
  it("maps ASSIGNEE_NOT_ADMIN to its copy", () => {
    expect(adminTaskErrorText(new Error("ASSIGNEE_NOT_ADMIN: col-1"))).toBe(
      "Las tareas de administración solo se asignan a administradores."
    );
  });

  it("falls back to the generic copy", () => {
    expect(adminTaskErrorText(new Error("boom"))).toBe("No se pudo completar la acción. Intenta de nuevo.");
  });
});

describe("AdminTasksCard", () => {
  it("renders nothing for non-admins and doesn't fetch", () => {
    viewer.access = "Dirección";
    const { container } = render(<AdminTasksCard limit={5} />);
    expect(container.innerHTML).toBe("");
    expect(actions.fetchAdminTasksAction).not.toHaveBeenCalled();
    expect(staffActions.fetchStaffAction).not.toHaveBeenCalled();
  });

  it("self-fetches on the dashboard and links to the Presale page", async () => {
    render(<AdminTasksCard limit={5} />);
    expect(screen.getByText("Para administración")).toBeTruthy();
    expect(await screen.findByText("Asignar cliente y origen")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Casa Lomas" }).getAttribute("href")).toBe("/proyectos/p1/ficha");
    expect(screen.getByRole("link", { name: "Ver todas →" }).getAttribute("href")).toBe("/actividades/presale");
    expect(actions.fetchAdminTasksAction).toHaveBeenCalledTimes(1);
  });

  it("uses the RSC tasks on Presale without fetching", () => {
    render(<AdminTasksCard initialTasks={[makeTask({ title: "Revisar contrato" })]} />);
    expect(screen.getByText("Revisar contrato")).toBeTruthy();
    expect(actions.fetchAdminTasksAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Ver todas →" })).toBeNull();
  });

  it("limits the rows", () => {
    const tasks = Array.from({ length: 7 }, (_, i) => makeTask({ id: `t${i}`, title: `Tarea ${i}` }));
    render(<AdminTasksCard initialTasks={tasks} limit={5} />);
    expect(screen.getByText("Tarea 4")).toBeTruthy();
    expect(screen.queryByText("Tarea 5")).toBeNull();
  });

  it("marks a late commitment date", () => {
    render(<AdminTasksCard initialTasks={[makeTask({ commitmentDate: "2020-01-15" })]} />);
    expect(screen.getByText(/15 ene/).className).toContain("text-destructive");
  });

  it("shows the empty state", async () => {
    actions.fetchAdminTasksAction.mockResolvedValue([]);
    render(<AdminTasksCard />);
    expect(await screen.findByText(ADMIN_TASKS_EMPTY)).toBeTruthy();
  });

  it("shows a loading skeleton, then an error with retry", async () => {
    actions.fetchAdminTasksAction.mockRejectedValueOnce(new Error("boom"));
    render(<AdminTasksCard />);
    expect(screen.getByLabelText("Cargando tareas de administración")).toBeTruthy();
    expect(await screen.findByText(ADMIN_TASKS_LOAD_ERROR)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Asignar cliente y origen")).toBeTruthy();
    expect(actions.fetchAdminTasksAction).toHaveBeenCalledTimes(2);
  });

  it("creates an admin task through createAdminTaskAction", async () => {
    render(<AdminTasksCard initialTasks={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Tarea de administración" }));
    expect(await screen.findByText("Nueva tarea de administración")).toBeTruthy();
    await waitFor(() => expect(projectActions.fetchProjectsAction).toHaveBeenCalled());
    await screen.findByText("Casa Lomas");
    fireEvent.change(screen.getByPlaceholderText("Describe la tarea..."), { target: { value: "Firmar contrato" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(actions.createAdminTaskAction).toHaveBeenCalledTimes(1));
    const input = actions.createAdminTaskAction.mock.calls[0][0];
    expect(input).toMatchObject({ projectId: "p1", title: "Firmar contrato", managerId: null });
    expect(input).not.toHaveProperty("workflowId");
    expect(input).not.toHaveProperty("phase");
    expect(input).not.toHaveProperty("phaseId");
    expect(input).not.toHaveProperty("spaceId");
    await waitFor(() => expect(actions.fetchAdminTasksAction).toHaveBeenCalled());
  });

  it("shows the ASSIGNEE_NOT_ADMIN copy when the action refuses", async () => {
    actions.createAdminTaskAction.mockRejectedValueOnce(new Error("ASSIGNEE_NOT_ADMIN"));
    render(<AdminTasksCard initialTasks={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Tarea de administración" }));
    await screen.findByText("Casa Lomas");
    fireEvent.change(screen.getByPlaceholderText("Describe la tarea..."), { target: { value: "Firmar" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(
      await screen.findByText("Las tareas de administración solo se asignan a administradores.")
    ).toBeTruthy();
  });
});

describe("NewTaskModal admin mode", () => {
  it("has the admin title and no Fase field", () => {
    render(
      <NewTaskModal
        open
        mode="admin"
        projects={[{ id: "p1", name: "Casa Lomas" }]}
        staff={[{ id: "admin-1", name: "Paula Admin" }]}
        onClose={() => {}}
        onSave={() => {}}
      />
    );
    expect(screen.getByText("Nueva tarea de administración")).toBeTruthy();
    expect(screen.queryByText("Fase")).toBeNull();
    expect(screen.queryByText("Espacio")).toBeNull();
  });

  it("keeps Fase in tramo mode", () => {
    render(
      <NewTaskModal
        open
        projects={[{ id: "p1", name: "Casa Lomas" }]}
        staff={[{ id: "s1", name: "Ana" }]}
        phaseOptions={["Anteproyecto"]}
        onClose={() => {}}
        onSave={() => {}}
      />
    );
    expect(screen.getByText("Nueva tarea")).toBeTruthy();
    expect(screen.getByText("Fase")).toBeTruthy();
  });

  it("sends an empty fase and no default responsable in admin mode", () => {
    const onSave = vi.fn();
    render(
      <NewTaskModal
        open
        mode="admin"
        projects={[{ id: "p1", name: "Casa Lomas" }]}
        staff={[{ id: "admin-1", name: "Paula Admin" }]}
        onClose={() => {}}
        onSave={onSave}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("Describe la tarea..."), { target: { value: "Cobro" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ phase: "", managerId: null, title: "Cobro" }));
  });
});
