import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { ProjectListItem, TaskListItem, TramoBoard, WorkflowDetail } from "@/lib/types/core";
import { ActividadesClient } from "./ActividadesClient";

const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/actividades/diseno",
  useSearchParams: () => new URLSearchParams(nav.search),
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
  removeStorage: vi.fn(),
  readJsonStorage: (_key: string, fallback: unknown) => fallback,
}));

vi.mock("@/lib/actions/task-statuses-actions", () => ({
  fetchTaskStatusesAction: () => Promise.resolve([]),
}));

vi.mock("@/lib/actions/projects-actions", () => ({
  fetchProjectSpacesAction: () => Promise.resolve([]),
}));

vi.mock("@/lib/actions/tramo-start-actions", () => ({
  fetchTramoBoardAction: () => new Promise(() => {}),
  previewStartTramoAction: () => new Promise(() => {}),
  startTramoAction: vi.fn(),
  undoStartTramoAction: vi.fn(),
}));

// The sheet has its own tests; here it only has to say which project it opened for.
vi.mock("@/components/tareas/StartTramoSheet", () => ({
  StartTramoSheet: ({ open, projectId }: { open: boolean; projectId: string | null }) =>
    open ? <div data-testid="start-tramo-sheet">{projectId}</div> : null,
}));

vi.mock("@/components/tareas/UndoStartTramoButton", () => ({
  UndoStartTramoButton: () => null,
}));

vi.mock("@/components/tareas/start-tramo-toast", () => ({
  notifyTramoStarted: vi.fn(),
}));

const tasksActions = vi.hoisted(() => ({
  createUserTaskAction: vi.fn(),
}));

vi.mock("@/lib/actions/tasks-actions", () => {
  // Never resolves, so the rows under test stay the initial ones.
  const pending = () => new Promise(() => {});
  return {
    fetchTasksAction: pending,
    fetchTaskAction: pending,
    fetchAdminTasksAction: pending,
    createUserTaskAction: tasksActions.createUserTaskAction,
    createAdminTaskAction: vi.fn(),
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

const diseno: WorkflowDetail = {
  id: "wf-diseno",
  key: "diseno",
  name: "Diseño",
  description: "Taller de diseño",
  active: true,
  sortOrder: 1,
  autoStart: "on_ready",
  phases: [
    { id: "f-ante", workflowId: "wf-diseno", name: "Anteproyecto", sortOrder: 0, active: true, templateCount: 2 },
    { id: "f-proy", workflowId: "wf-diseno", name: "Proyecto Arquitectónico", sortOrder: 1, active: true, templateCount: 3 },
    { id: "f-ejec", workflowId: "wf-diseno", name: "Ejecutivo", sortOrder: 2, active: true, templateCount: 4 },
  ],
  templates: [],
  readiness: null,
} as unknown as WorkflowDetail;

const presale = {
  ...diseno,
  id: "wf-presale",
  key: "presale",
  name: "Presale",
  sortOrder: 0,
  phases: [],
} as unknown as WorkflowDetail;

const construccion = {
  ...diseno,
  id: "wf-construccion",
  key: "construccion",
  name: "Construcción",
  sortOrder: 2,
  phases: [],
} as unknown as WorkflowDetail;

const phaseRef = (id: string) => {
  const p = diseno.phases.find((x) => x.id === id);
  return p ? { id: p.id, name: p.name, sortOrder: p.sortOrder } : null;
};

function makeTask(overrides: Partial<TaskListItem> & { id: string; title: string }): TaskListItem {
  const phaseId = (overrides.phaseId ?? null) as string | null;
  return {
    projectId: "p1",
    kind: "usuario",
    templateId: null,
    workflowId: "wf-diseno",
    phaseId,
    phase: phaseId ? phaseRef(phaseId) : null,
    spaceId: null,
    space: null,
    closedAt: null,
    notes: null,
    createdById: "u1",
    managerId: null,
    status: "pendiente",
    customStatusId: null,
    priority: "media",
    sortOrder: null,
    commitmentDate: null,
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    customStatus: null,
    project: { id: "p1", name: "Casa Lomas", clientName: null },
    workflow: { id: "wf-diseno", key: "diseno", name: "Diseño", sortOrder: 1 },
    manager: null,
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

function makeProject(id: string, name: string, currentWorkflowId: string | null): ProjectListItem {
  return { id, name, status: "activo", currentWorkflowId, tramos: [] } as unknown as ProjectListItem;
}

const emptyBoard: TramoBoard = {
  workflow: { id: "wf-diseno", key: "diseno", name: "Diseño", sortOrder: 1 },
  ready: [],
  upcoming: [],
  started: [],
};

function renderPage(props: Partial<Parameters<typeof ActividadesClient>[0]> = {}) {
  return render(
    <ActividadesClient
      slug="diseno"
      workflow={diseno}
      workflows={[presale, diseno, construccion]}
      initialProjects={[makeProject("p1", "Casa Lomas", "wf-diseno"), makeProject("p2", "Torre Norte", "wf-presale")]}
      initialStaff={[]}
      initialTasks={[]}
      initialBoard={emptyBoard}
      {...props}
    />
  );
}

beforeEach(() => {
  nav.search = "";
  capabilities.current = { canCreateActivity: true, canReorderPhases: true };
  tasksActions.createUserTaskAction.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe("ActividadesClient tramo page", () => {
  it("builds the header and tabs from the tramos, with no Área or Departamento copy", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Diseño" })).toBeTruthy();
    for (const name of ["General", "Presale", "Diseño", "Construcción"]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
    expect(screen.getByText("Sin tareas en Diseño.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Área|Departamento|Iniciar plantilla|Workflow/);
  });

  it("shows the fase strip in catalog order", () => {
    renderPage({ initialTasks: [makeTask({ id: "a", title: "Planos", phaseId: "f-proy" })] });
    const strip = screen.getByLabelText("Fases");
    expect(strip.textContent).toBe("Anteproyecto · Proyecto Arquitectónico · Ejecutivo");
  });

  it("orders a block's rows by fase, with Sin fase last, and badges the current tramo", () => {
    renderPage({
      initialTasks: [
        makeTask({ id: "x", title: "Sin clasificar" }),
        makeTask({ id: "e", title: "Detalles ejecutivos", phaseId: "f-ejec" }),
        makeTask({ id: "a", title: "Croquis", phaseId: "f-ante" }),
        makeTask({ id: "p", title: "Fachadas", phaseId: "f-proy" }),
        makeTask({
          id: "t",
          title: "Visita de obra",
          phaseId: "f-ante",
          project: { id: "p2", name: "Torre Norte", clientName: null },
        }),
      ],
    });

    const rows = screen.getAllByRole("row").map((r) => r.textContent ?? "");
    const order = ["Croquis", "Fachadas", "Detalles ejecutivos", "Sin clasificar"].map((title) =>
      rows.findIndex((text) => text.includes(title))
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(screen.getByText("Sin fase · revisar")).toBeTruthy();

    // Casa Lomas is in Diseño now; Torre Norte is still in Presale.
    const badges = screen.getAllByText("Tramo actual");
    expect(badges).toHaveLength(1);
    expect(badges[0].closest("[id^='proyecto-']")?.id).toBe("proyecto-p1");
  });

  it("collapses Próximos and lists what each project is missing", async () => {
    renderPage({
      initialBoard: {
        ...emptyBoard,
        upcoming: [
          {
            project: { id: "p2", name: "Torre Norte" },
            currentTramo: { id: "wf-presale", key: "presale", name: "Presale", sortOrder: 0 },
            readySince: null,
            pending: {
              tramo: { id: "wf-presale", key: "presale", name: "Presale", sortOrder: 0 },
              phase: { id: "f-x", name: "Levantamiento", sortOrder: 0 },
              open: 2,
              total: 5,
            },
          },
        ],
      },
    });

    const trigger = screen.getByRole("button", { name: "Próximos (1)" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(
      await screen.findByText("Torre Norte · falta Levantamiento de Presale: 2 de 5 tareas abiertas")
    ).toBeTruthy();
  });

  it("hides Próximos when nothing is upcoming", () => {
    renderPage();
    expect(screen.queryByText(/Próximos/)).toBeNull();
  });

  it("opens the Iniciar tramo sheet and scrolls to the block for ?project=", async () => {
    nav.search = "project=p1";
    renderPage({ initialTasks: [makeTask({ id: "a", title: "Croquis", phaseId: "f-ante" })] });

    expect((await screen.findByTestId("start-tramo-sheet")).textContent).toBe("p1");
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    const scrolled = (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.contexts as Element[];
    expect(scrolled.some((el) => el.id === "proyecto-p1")).toBe(true);
  });

  it("opens the sheet for ?project= even when the project isn't ready or has no block", async () => {
    nav.search = "project=p9";
    renderPage();
    expect((await screen.findByTestId("start-tramo-sheet")).textContent).toBe("p9");
  });

  it("doesn't open the sheet from ?project= without canCreateActivity", () => {
    nav.search = "project=p1";
    capabilities.current = {};
    renderPage({ initialTasks: [makeTask({ id: "a", title: "Croquis", phaseId: "f-ante" })] });
    expect(screen.queryByTestId("start-tramo-sheet")).toBeNull();
  });

  it("opens the sheet from Agregar fases on a block", () => {
    renderPage({ initialTasks: [makeTask({ id: "a", title: "Croquis", phaseId: "f-ante" })] });
    fireEvent.click(screen.getByRole("button", { name: "Agregar fases" }));
    expect(screen.getByTestId("start-tramo-sheet").textContent).toBe("p1");
  });

  it("defaults the quick-add fase to the block's last open task and creates the task in this tramo", async () => {
    tasksActions.createUserTaskAction.mockResolvedValue({});
    renderPage({
      initialTasks: [
        makeTask({ id: "a", title: "Croquis", phaseId: "f-ante" }),
        makeTask({ id: "p", title: "Fachadas", phaseId: "f-proy" }),
        makeTask({ id: "e", title: "Detalles", phaseId: "f-ejec", status: "completado" }),
      ],
    });

    const faseSelect = screen.getByLabelText("Fase de la nueva tarea en Casa Lomas");
    expect(faseSelect.textContent).toContain("Proyecto Arquitectónico");

    const input = screen.getByLabelText("Nueva tarea en Casa Lomas");
    fireEvent.change(input, { target: { value: "Cortes" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(tasksActions.createUserTaskAction).toHaveBeenCalledTimes(1));
    expect(tasksActions.createUserTaskAction.mock.calls[0][0]).toMatchObject({
      projectId: "p1",
      title: "Cortes",
      workflowId: "wf-diseno",
      phaseId: "f-proy",
    });
  });

  it("adds Fase and Espacio filters; Espacio only when a listed project has espacios", () => {
    const { unmount } = renderPage({ initialTasks: [makeTask({ id: "a", title: "Croquis", phaseId: "f-ante" })] });
    expect(screen.getByLabelText("Filtrar por fase")).toBeTruthy();
    expect(screen.queryByLabelText("Filtrar por espacio")).toBeNull();
    unmount();

    renderPage({
      initialTasks: [
        makeTask({ id: "a", title: "Croquis", phaseId: "f-ante", spaceId: "s1", space: { id: "s1", name: "Depto 201" } }),
      ],
    });
    expect(screen.getByLabelText("Filtrar por espacio")).toBeTruthy();
  });

  it("shows action errors in an inline Alert instead of window.alert", async () => {
    // happy-dom has no window.alert: stub it so a call would be seen.
    const alertSpy = vi.fn();
    vi.stubGlobal("alert", alertSpy);
    tasksActions.createUserTaskAction.mockRejectedValue(new Error("PHASE_MISMATCH"));
    renderPage({ initialTasks: [makeTask({ id: "a", title: "Croquis", phaseId: "f-ante" })] });

    const input = screen.getByLabelText("Nueva tarea en Casa Lomas");
    fireEvent.change(input, { target: { value: "Cortes" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const alert = await screen.findByText("Esa fase no pertenece al tramo de la tarea.");
    expect(alert.closest("[role='alert']")).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();

    fireEvent.click(within(alert.closest("[role='alert']") as HTMLElement).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByText("Esa fase no pertenece al tramo de la tarea.")).toBeNull();
    vi.unstubAllGlobals();
  });
});
