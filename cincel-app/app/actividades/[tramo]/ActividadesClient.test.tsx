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
  canSeeAdminData: () => false,
}));

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: () => null,
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
}));

vi.mock("@/lib/actions/tramo-start-actions", () => ({
  fetchTramoBoardAction: () => new Promise(() => {}),
  previewStartTramoAction: () => new Promise(() => {}),
  startTramoAction: vi.fn(),
  undoStartTramoAction: vi.fn(),
}));

vi.mock("@/lib/actions/projects-actions", () => ({
  fetchProjectSpacesAction: () => Promise.resolve([]),
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
  } as unknown as TaskListItem;
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
        workflows={[]}
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

const presaleWorkflow = {
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
} as unknown as WorkflowDetail;

describe("ActividadesClient tramo pages", () => {
  it.each([
    ["presale", "Presale"],
    ["diseno", "Diseño"],
    ["construccion", "Construcción"],
  ])("renders the table with an empty state on %s", (slug, label) => {
    capabilities.current = { canCreateActivity: true };
    render(
      <ActividadesClient
        slug={slug}
        workflow={{ ...presaleWorkflow, id: `wf-${slug}`, key: slug, name: label }}
        workflows={[{ ...presaleWorkflow, id: `wf-${slug}`, key: slug, name: label }]}
        initialProjects={[]}
        initialStaff={[]}
        initialTasks={[]}
      />,
    );

    expect(screen.getByText(`Sin tareas en ${label}.`)).toBeTruthy();
    expect(screen.getByPlaceholderText("Buscar tarea...")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /Fase/ })).toBeTruthy();
  });

  it("opens Nueva tarea from a tramo page", () => {
    capabilities.current = { canCreateActivity: true };
    render(
      <ActividadesClient
        slug="presale"
        workflow={presaleWorkflow}
        workflows={[presaleWorkflow]}
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

  it("lists the tramo's tasks grouped by project", () => {
    capabilities.current = {};
    render(
      <ActividadesClient
        slug="presale"
        workflow={presaleWorkflow}
        workflows={[presaleWorkflow]}
        initialProjects={[]}
        initialStaff={[]}
        initialTasks={[makeTask({ id: "a", title: "Levantamiento", workflowId: "wf-presale" })]}
      />,
    );

    expect(screen.getByText("Levantamiento")).toBeTruthy();
    expect(screen.queryByText("Sin tareas en Presale.")).toBeNull();
  });
});

describe("ActividadesClient tabs and template flow", () => {
  const disenoWorkflow: WorkflowDetail = {
    ...presaleWorkflow,
    id: "wf-diseno",
    key: "diseno",
    name: "Diseño",
    sortOrder: 1,
    autoStart: "on_ready",
    phases: [
      { id: "ph-2", name: "Ejecutivo", sortOrder: 1, workflowId: "wf-diseno", active: true, templateCount: 0 },
      { id: "ph-1", name: "Anteproyecto", sortOrder: 0, workflowId: "wf-diseno", active: true, templateCount: 0 },
    ],
  };
  const inactiveWorkflow: WorkflowDetail = {
    ...presaleWorkflow,
    id: "wf-old",
    key: "decoracion",
    name: "Decoración",
    active: false,
    sortOrder: 2,
  };

  it("builds the tabs from the active workflows in flow order", () => {
    capabilities.current = {};
    render(
      <ActividadesClient
        slug="presale"
        workflow={presaleWorkflow}
        workflows={[disenoWorkflow, inactiveWorkflow, presaleWorkflow]}
        initialProjects={[]}
        initialStaff={[]}
        initialTasks={[]}
      />,
    );

    // The first tablist is the tramo tabs (the filter bar has Activas / Archivadas).
    const tabs = within(screen.getAllByRole("tablist")[0]).getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["General", "Presale", "Diseño"]);
  });

  it("shows the tramo's fases in catalog order", () => {
    capabilities.current = {};
    render(
      <ActividadesClient
        slug="diseno"
        workflow={disenoWorkflow}
        workflows={[presaleWorkflow, disenoWorkflow]}
        initialProjects={[]}
        initialStaff={[]}
        initialTasks={[makeTask({ id: "a", title: "Planta", workflowId: "wf-diseno", phaseId: "ph-1", phase: { id: "ph-1", name: "Anteproyecto", sortOrder: 0 } })]}
      />,
    );

    expect(screen.getByLabelText("Fases").textContent).toBe("Anteproyecto · Ejecutivo");
  });

  it("no longer offers Iniciar plantilla", () => {
    capabilities.current = { canCreateActivity: true };
    render(
      <ActividadesClient
        slug="presale"
        workflow={presaleWorkflow}
        workflows={[presaleWorkflow]}
        initialProjects={[]}
        initialStaff={[]}
        initialTasks={[]}
      />,
    );

    expect(screen.queryByRole("button", { name: /Iniciar plantilla/ })).toBeNull();
    expect(screen.queryByText(/Iniciar plantilla/)).toBeNull();
  });
});

describe("ActividadesClient tramos from the database", () => {
  it("builds the tabs from the tramos it receives, in tramo order", () => {
    capabilities.current = {};
    const diseno: WorkflowDetail = { ...presaleWorkflow, id: "wf-diseno", key: "diseno", name: "Diseño", sortOrder: 1 };
    render(
      <ActividadesClient
        slug="diseno"
        workflow={diseno}
        workflows={[diseno, presaleWorkflow]}
        initialProjects={[]}
        initialStaff={[]}
        initialTasks={[]}
      />,
    );

    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs.slice(0, 3)).toEqual(["General", "Presale", "Diseño"]);
  });

  it("offers the tramo's active fases from its catalog and no template button", () => {
    capabilities.current = { canCreateActivity: true };
    render(
      <ActividadesClient
        slug="presale"
        workflow={{
          ...presaleWorkflow,
          phases: [
            { id: "f2", name: "Presentación", sortOrder: 1, workflowId: "wf-presale", active: true, templateCount: 0 },
            { id: "f1", name: "Inicial", sortOrder: 0, workflowId: "wf-presale", active: true, templateCount: 0 },
            { id: "f3", name: "Vieja", sortOrder: 2, workflowId: "wf-presale", active: false, templateCount: 0 },
          ],
        }}
        initialProjects={[]}
        initialStaff={[]}
        initialTasks={[makeTask({ id: "a", title: "Levantamiento", workflowId: "wf-presale" })]}
      />,
    );

    expect(screen.queryByRole("button", { name: /Iniciar plantilla/ })).toBeNull();
    expect(screen.getByLabelText("Fases").textContent).toBe("Inicial · Presentación");
  });
});
