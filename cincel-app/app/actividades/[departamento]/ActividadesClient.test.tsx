import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import type { TaskListItem, WorkflowDetail } from "@/lib/types/core";
import { ActividadesClient } from "./ActividadesClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/actividades/general",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => null,
}));

const capabilities = vi.hoisted(() => ({ current: {} as Record<string, boolean> }));

vi.mock("@/lib/auth/permissions", () => ({
  resolveActivitiesCapabilities: () => capabilities.current,
  canChangeActivityStatus: () => false,
}));

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: () => null,
  writeStorage: vi.fn(),
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

function makeTask(overrides: Partial<TaskListItem>): TaskListItem {
  return {
    id: "t1",
    projectId: "p1",
    kind: "usuario",
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
    project: { id: "p1", name: "Residencia Valle Alto", clientName: "Cliente" },
    workflow: null,
    areaColorSlot: null,
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
  };
}

function rowOf(title: string): HTMLElement {
  const row = screen.getByText(title).closest("tr");
  if (!row) throw new Error(`no row for ${title}`);
  return row;
}

describe("ActividadesClient rows", () => {
  it("renders the subtask line, subtareas badge and En espera badge", () => {
    render(
      <ActividadesClient
        slug="general"
        workflow={null}
        initialProjects={[]}
        initialStaff={[]}
        initialTasks={[
          makeTask({
            id: "p",
            title: "Planos ejecutivos",
            subtaskCount: 3,
            subtaskDoneCount: 1,
          }),
          makeTask({
            id: "c",
            title: "Plano de cimentación",
            parentTaskId: "p",
            parentTitle: "Planos ejecutivos",
            waitingOn: 2,
          }),
          makeTask({ id: "x", title: "Render de fachada" }),
        ]}
      />,
    );

    const parent = rowOf("Planos ejecutivos");
    expect(within(parent).getByText("1/3 subtareas")).toBeTruthy();
    expect(within(parent).queryByText("En espera")).toBeNull();

    const child = rowOf("Plano de cimentación");
    expect(
      within(child).getByText("Subtarea de Planos ejecutivos"),
    ).toBeTruthy();
    expect(within(child).getByText("En espera")).toBeTruthy();
    expect(within(child).queryByText(/subtareas/)).toBeNull();

    const plain = rowOf("Render de fachada");
    expect(
      within(plain).queryByText(/Subtarea de|subtareas|En espera/),
    ).toBeNull();
  });
});

const presaleWorkflow: WorkflowDetail = {
  id: "wf-presale",
  key: "presale",
  name: "Presale",
  description: null,
  active: true,
  sortOrder: 0,
  autoStart: "on_create",
  phases: [],
  readiness: null,
  templates: [],
  areas: [],
};

describe("ActividadesClient department pages", () => {
  it.each([
    ["presale", "Presale"],
    ["diseno", "Taller de Diseño"],
    ["construccion", "Construcción"],
  ])("renders the table with an empty state on %s", (slug, label) => {
    capabilities.current = { canCreateActivity: true };
    render(
      <ActividadesClient
        slug={slug}
        workflow={{ ...presaleWorkflow, id: `wf-${slug}`, key: slug, name: label }}
        initialProjects={[]}
        initialStaff={[]}
        initialTasks={[]}
      />,
    );

    expect(screen.getByText(`Sin tareas en ${label}.`)).toBeTruthy();
    expect(screen.getByPlaceholderText("Buscar tarea...")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /Fase/ })).toBeTruthy();
  });

  it("opens Nueva tarea from a department page", () => {
    capabilities.current = { canCreateActivity: true };
    render(
      <ActividadesClient
        slug="presale"
        workflow={presaleWorkflow}
        initialProjects={[]}
        initialStaff={[]}
        initialTasks={[]}
      />,
    );

    const button = screen.getByRole("button", { name: "+ Nueva tarea" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(screen.getAllByText("Nueva tarea").length).toBeGreaterThan(0);
  });

  it("lists the department's tasks grouped by project", () => {
    capabilities.current = {};
    render(
      <ActividadesClient
        slug="presale"
        workflow={presaleWorkflow}
        initialProjects={[]}
        initialStaff={[]}
        initialTasks={[makeTask({ id: "a", title: "Levantamiento", workflowId: "wf-presale" })]}
      />,
    );

    expect(screen.getByText("Levantamiento")).toBeTruthy();
    expect(screen.queryByText("Sin tareas en Presale.")).toBeNull();
  });

  it("still renders the table but blocks creation when the workflow is missing", () => {
    capabilities.current = { canCreateActivity: true };
    render(
      <ActividadesClient slug="presale" workflow={null} initialProjects={[]} initialStaff={[]} initialTasks={[]} />,
    );

    expect(screen.getByText("Sin tareas en Presale.")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Configuración → Workflows");
    const button = screen.getByRole("button", { name: "+ Nueva tarea" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
