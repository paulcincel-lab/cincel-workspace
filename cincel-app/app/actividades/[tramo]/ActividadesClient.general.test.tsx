import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { ProjectListItem, TaskListItem } from "@/lib/types/core";
import { ActividadesClient } from "./ActividadesClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/actividades/general",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => null,
}));

vi.mock("@/lib/auth/permissions", () => ({
  resolveActivitiesCapabilities: () => ({}),
  canChangeActivityStatus: () => false,
}));

const storage = vi.hoisted(() => ({
  readStorage: vi.fn(() => "actividad"),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn((_key: string, fallback: unknown) => fallback),
}));
vi.mock("@/lib/repositories/browser-state-repository", () => storage);

vi.mock("@/components/v2/status/TramoBadge", () => ({
  TramoBadge: ({ tramo }: { tramo: { name: string } | null }) => <span>{tramo ? tramo.name : "Sin tramo"}</span>,
}));

vi.mock("@/lib/actions/task-statuses-actions", () => ({
  fetchTaskStatusesAction: () => Promise.resolve([]),
}));

vi.mock("@/lib/actions/tasks-actions", () => {
  // Never resolves, so the rows under test stay the initial ones.
  const pending = () => new Promise(() => {});
  return {
    fetchTasksAction: pending,
    fetchTaskAction: pending,
    createUserTaskAction: vi.fn(),
    updateTaskAction: vi.fn(),
    setTaskStatusAction: vi.fn(),
    setTaskCustomStatusAction: vi.fn(),
    assignTaskAction: vi.fn(),
    archiveTaskAction: vi.fn(),
    deleteTaskAction: vi.fn(),
    setTaskSupportAction: vi.fn(),
    addChecklistItemAction: vi.fn(),
    updateChecklistItemAction: vi.fn(),
    removeChecklistItemAction: vi.fn(),
    reorderChecklistAction: vi.fn(),
    reorderProjectTasksAction: vi.fn(),
    reorderTasksAction: vi.fn(),
    addTaskCommentAction: vi.fn(),
    addTaskAttachmentAction: vi.fn(),
    addTaskLinkAction: vi.fn(),
    removeTaskLinkAction: vi.fn(),
  };
});

const presale = { id: "wf-presale", key: "presale", name: "Presale", sortOrder: 0 };
const diseno = { id: "wf-diseno", key: "diseno", name: "Diseño", sortOrder: 1 };

function makeTask(overrides: Partial<TaskListItem>): TaskListItem {
  return {
    id: "t1",
    projectId: "p1",
    kind: "workflow",
    templateId: null,
    workflowId: null,
    phase: null,
    phaseId: null,
    spaceId: null,
    closedAt: null,
    title: "Tarea",
    notes: null,
    createdById: "u1",
    managerId: "u1",
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
    project: { id: "p1", name: "Casa Norte", clientName: null },
    workflow: null,
    areaColorSlot: null,
    phase: null,
    space: null,
    manager: { id: "u1", name: "Ana Ruiz" },
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

const casaNorte = {
  id: "p1",
  name: "Casa Norte",
  status: "activo",
  tramos: [
    { ...presale, startedAt: "2026-01-01", closedAt: "2026-02-01", current: false },
    { ...diseno, startedAt: "2026-02-01", closedAt: null, current: true },
  ],
} as unknown as ProjectListItem;

function renderGeneral(tasks: TaskListItem[], projects: ProjectListItem[] = [casaNorte]) {
  return render(
    <ActividadesClient slug="general" workflow={null} initialProjects={projects} initialStaff={[]} initialTasks={tasks} />,
  );
}

describe("ActividadesClient General mode", () => {
  beforeEach(() => {
    storage.readStorage.mockClear();
    storage.writeStorage.mockClear();
    storage.removeStorage.mockClear();
  });

  it("shows each project once with its tramo chips", () => {
    renderGeneral([
      makeTask({ id: "a", title: "Anteproyecto", workflow: diseno }),
      makeTask({ id: "b", title: "Levantamiento", workflow: presale }),
      makeTask({ id: "c", title: "Planos", project: { id: "p2", name: "Torre Sur", clientName: null }, workflow: presale }),
    ]);

    const headers = screen.getAllByRole("button", { name: /Casa Norte|Torre Sur/ });
    expect(headers).toHaveLength(2);
    const casa = headers.find((h) => h.textContent?.includes("Casa Norte"));
    if (!casa) throw new Error("no Casa Norte block");
    expect(within(casa).getByLabelText("Presale, cerrado")).toBeTruthy();
    expect(within(casa).getByText("Diseño")).toBeTruthy();
    expect(screen.queryByText("Sin área")).toBeNull();
  });

  it("orders rows by tramo, then fase, with a Tramo column", () => {
    renderGeneral([
      makeTask({ id: "d2", title: "Ejecutivo", workflow: diseno, phase: { id: "f2", name: "Ejecutivo", sortOrder: 2 } }),
      makeTask({ id: "d1", title: "Concepto", workflow: diseno, phase: { id: "f1", name: "Concepto", sortOrder: 1 } }),
      makeTask({ id: "p", title: "Levantamiento", workflow: presale }),
    ]);

    expect(screen.getByRole("columnheader", { name: /Tramo/ })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: /Área/ })).toBeNull();
    const titles = screen.getAllByRole("row").map((r) => r.textContent ?? "");
    const order = ["Levantamiento", "Concepto", "Ejecutivo"].map((t) => titles.findIndex((row) => row.includes(t)));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
  });

  it("has no grouping selector and no longer reads or writes its storage key", () => {
    renderGeneral([makeTask({ id: "a", title: "Anteproyecto", workflow: diseno })]);

    expect(screen.queryByRole("tablist", { name: "Agrupar por" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Actividad" })).toBeNull();
    expect(storage.readStorage).not.toHaveBeenCalledWith("cincel.actividades.general.groupBy.v1");
    expect(storage.writeStorage).not.toHaveBeenCalledWith("cincel.actividades.general.groupBy.v1", expect.anything());
    expect(storage.removeStorage).toHaveBeenCalledWith("cincel.actividades.general.groupBy.v1");
  });

  it("shows the empty copy when there are no tasks", () => {
    renderGeneral([]);
    expect(screen.getByText("No hay tareas.")).toBeTruthy();
  });
});
