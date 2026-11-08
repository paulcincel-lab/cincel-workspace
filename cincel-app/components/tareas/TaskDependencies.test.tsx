// @vitest-environment happy-dom
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";

import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { TaskDetail, TaskListItem, TaskRef } from "@/lib/types/core";

const actions = vi.hoisted(() => ({
  listSubtasksAction: vi.fn(),
  createSubtaskAction: vi.fn(),
  listTaskDependenciesAction: vi.fn(),
  addTaskDependencyAction: vi.fn(),
  removeTaskDependencyAction: vi.fn(),
}));
const pageData = vi.hoisted(() => ({
  getTaskSheetData: vi.fn(),
  searchProjectTasksAction: vi.fn(),
}));

vi.mock("@/lib/actions/tasks-actions", () => actions);
vi.mock("@/lib/actions/page-data/tareas-actions", () => pageData);
vi.mock("@/lib/actions/workflows-actions", () => ({ fetchWorkflowAction: vi.fn(async () => null) }));
vi.mock("@/lib/actions/tramo-start-actions", () => ({ previewStartTramoAction: vi.fn() }));

import { qk } from "@/lib/query/keys";

import TaskDependencies, { dependencyErrorMessage } from "./TaskDependencies";

const TASK_ID = "00000000-0000-4000-8000-0000000000a1";
const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const DEP_ID = "00000000-0000-4000-8000-0000000000d1";
const OTHER_ID = "00000000-0000-4000-8000-0000000000d2";
const BLOCKED_ID = "00000000-0000-4000-8000-0000000000b1";

function makeItem(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: TASK_ID,
    projectId: PROJECT_ID,
    kind: "usuario",
    templateId: null,
    workflowId: null,
    phaseId: null,
    spaceId: null,
    closedAt: null,
    title: "Planos arquitectónicos",
    notes: null,
    createdById: "00000000-0000-4000-8000-000000000009",
    managerId: null,
    status: "pendiente",
    customStatusId: null,
    priority: "media",
    sortOrder: null,
    commitmentDate: null,
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    customStatus: null,
    project: { id: PROJECT_ID, name: "Casa Lomas", clientName: "Cliente" },
    workflow: null,
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
  };
}

function makeTask(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    ...makeItem(),
    createdBy: {
      id: "00000000-0000-4000-8000-000000000009",
      name: "Ana López",
    },
    checklistItems: [],
    attachments: [],
    links: [],
    history: [],
    ...overrides,
  };
}

const depRef: TaskRef = {
  id: DEP_ID,
  title: "Levantamiento topográfico",
  status: "en_proceso",
  managerName: "Luis Pérez",
  commitmentDate: "2026-11-05",
};

const blockedRef: TaskRef = {
  id: BLOCKED_ID,
  title: "Licencia de construcción",
  status: "pendiente",
  managerName: null,
  commitmentDate: null,
};

const task = makeTask();

function renderDependencies(
  shown: TaskDetail,
  onOpenTask: (task: TaskRef) => void = vi.fn(),
  client = createTestQueryClient(),
) {
  return renderWithQueryClient(
    <TaskDependencies taskId={shown.id} projectId={shown.projectId} onOpenTask={onOpenTask} />,
    { client },
  );
}

function ref(id: string, title: string, status: TaskRef["status"] = "pendiente"): TaskRef {
  return { id, title, status, managerName: null, commitmentDate: null };
}

async function pickCandidate(title: string) {
  fireEvent.click(await screen.findByText("Agregar dependencia"));
  fireEvent.click(await screen.findByText(title));
}

beforeAll(() => {
  // cmdk scrolls the selected item into view and observes its list size.
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe("TaskDependencies", () => {
  beforeEach(() => {
    actions.listSubtasksAction.mockResolvedValue([]);
    actions.listTaskDependenciesAction.mockResolvedValue({
      dependsOn: [depRef],
      blocks: [blockedRef],
    });
    pageData.searchProjectTasksAction.mockResolvedValue([
      ref(TASK_ID, "Planos arquitectónicos"),
      ref(DEP_ID, "Levantamiento topográfico", "en_proceso"),
      ref(OTHER_ID, "Estudio de mecánica de suelos"),
    ]);
    actions.addTaskDependencyAction.mockResolvedValue({ ok: true, data: undefined });
    actions.removeTaskDependencyAction.mockResolvedValue({ ok: true, data: undefined });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists Depende de and Bloquea a from qk.tasks.dependencies", async () => {
    const client = createTestQueryClient();
    renderDependencies(task, vi.fn(), client);

    expect(await screen.findByText("Levantamiento topográfico")).toBeTruthy();
    expect(screen.getByText("Licencia de construcción")).toBeTruthy();
    expect(screen.getByText("Depende de")).toBeTruthy();
    expect(screen.getByText("Bloquea a")).toBeTruthy();
    expect(screen.getByText("LP")).toBeTruthy();
    expect(screen.getByText("05-11-2026")).toBeTruthy();
    expect(actions.listTaskDependenciesAction).toHaveBeenCalledWith(TASK_ID);
    expect(client.getQueryData(qk.tasks.dependencies(TASK_ID))).toEqual({ dependsOn: [depRef], blocks: [blockedRef] });
    // Bloquea a is read-only: only the Depende de row has a remove button.
    expect(
      screen.getAllByRole("button", { name: /Quitar dependencia/ }),
    ).toHaveLength(1);
  });

  it("reads a seeded dependencies key without a request", async () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.tasks.dependencies(TASK_ID), { dependsOn: [depRef], blocks: [] });
    renderDependencies(task, vi.fn(), client);
    expect(await screen.findByText("Levantamiento topográfico")).toBeTruthy();
    expect(actions.listTaskDependenciesAction).not.toHaveBeenCalled();
  });

  it("shows empty states", async () => {
    actions.listTaskDependenciesAction.mockResolvedValue({
      dependsOn: [],
      blocks: [],
    });
    renderDependencies(task);
    expect(await screen.findByText("No depende de otras tareas.")).toBeTruthy();
    expect(screen.getByText("Ninguna tarea espera a esta.")).toBeTruthy();
  });

  it("opens linked tasks", async () => {
    const onOpenTask = vi.fn();
    renderDependencies(task, onOpenTask);
    fireEvent.click(await screen.findByText("Licencia de construcción"));
    expect(onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ id: BLOCKED_ID }));
  });

  it("searches the project with searchProjectTasksAction (20 rows), without itself or existing dependencies", async () => {
    renderDependencies(task);
    await screen.findByText("Levantamiento topográfico");
    // Nothing is searched until the picker opens.
    expect(pageData.searchProjectTasksAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Agregar dependencia"));

    expect(
      await screen.findByText("Estudio de mecánica de suelos"),
    ).toBeTruthy();
    expect(pageData.searchProjectTasksAction).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      q: "",
      limit: 20,
    });
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Estudio de mecánica de suelos"]);
  });

  it("typing searches the server under tasks.options(projectId, q)", async () => {
    const client = createTestQueryClient();
    renderDependencies(task, vi.fn(), client);
    await screen.findByText("Levantamiento topográfico");
    fireEvent.click(screen.getByText("Agregar dependencia"));
    await screen.findByText("Estudio de mecánica de suelos");

    pageData.searchProjectTasksAction.mockResolvedValue([ref(OTHER_ID, "Estudio de mecánica de suelos")]);
    fireEvent.change(screen.getByPlaceholderText("Buscar tarea del proyecto..."), { target: { value: "  suelos " } });
    await waitFor(() =>
      expect(pageData.searchProjectTasksAction).toHaveBeenCalledWith({ projectId: PROJECT_ID, q: "suelos", limit: 20 }),
    );
    await waitFor(() =>
      expect(client.getQueryData(qk.tasks.options(PROJECT_ID, "suelos"))).toEqual([
        ref(OTHER_ID, "Estudio de mecánica de suelos"),
      ]),
    );
  });

  it("adds a dependency and refreshes both dependency lists and the En espera views", async () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.tasks.detail(TASK_ID), task);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderDependencies(task, vi.fn(), client);
    await screen.findByText("Levantamiento topográfico");

    await pickCandidate("Estudio de mecánica de suelos");

    await waitFor(() =>
      expect(actions.addTaskDependencyAction).toHaveBeenCalledWith(
        TASK_ID,
        OTHER_ID,
      ),
    );
    await waitFor(() => expect(actions.listTaskDependenciesAction).toHaveBeenCalledTimes(2));
    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        qk.tasks.dependencies(TASK_ID),
        qk.tasks.dependencies(OTHER_ID),
        ["tareas", "list"],
      ]),
    );
    // The open pending dependency counts toward "En espera" right away.
    expect(client.getQueryData<TaskDetail>(qk.tasks.detail(TASK_ID))?.waitingOn).toBe(1);
  });

  it("shows the cycle error copy inline", async () => {
    actions.addTaskDependencyAction.mockResolvedValue({
      ok: false,
      error: "CYCLE: dependency would close a cycle",
    });
    renderDependencies(task);
    await screen.findByText("Levantamiento topográfico");

    await pickCandidate("Estudio de mecánica de suelos");

    expect(
      await screen.findByText(
        "No se puede agregar: la tarea elegida ya depende de esta, y se formaría un ciclo.",
      ),
    ).toBeTruthy();
  });

  it("removes a dependency after confirming", async () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.tasks.detail(TASK_ID), makeTask({ waitingOn: 1 }));
    renderDependencies(task, vi.fn(), client);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Quitar dependencia Levantamiento topográfico",
      }),
    );

    expect(await screen.findByText("¿Quitar esta dependencia?")).toBeTruthy();
    expect(actions.removeTaskDependencyAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));

    await waitFor(() =>
      expect(actions.removeTaskDependencyAction).toHaveBeenCalledWith(
        TASK_ID,
        DEP_ID,
      ),
    );
    await waitFor(() => expect(client.getQueryData<TaskDetail>(qk.tasks.detail(TASK_ID))?.waitingOn).toBe(0));
  });

  it("keeps the dependency when the removal is cancelled", async () => {
    renderDependencies(task);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Quitar dependencia Levantamiento topográfico",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() =>
      expect(screen.queryByText("¿Quitar esta dependencia?")).toBeNull(),
    );
    expect(actions.removeTaskDependencyAction).not.toHaveBeenCalled();
  });

  it("maps every error code to Spanish", () => {
    expect(dependencyErrorMessage(new Error("FORBIDDEN: x"))).toBe(
      "No tienes permiso para editar las dependencias de esta tarea.",
    );
    expect(dependencyErrorMessage(new Error("NOT_FOUND: x"))).toBe(
      "La tarea o la dependencia ya no existe.",
    );
    expect(dependencyErrorMessage(new Error("OTHER_PROJECT: x"))).toBe(
      "Solo puedes depender de tareas del mismo proyecto.",
    );
    expect(dependencyErrorMessage(new Error("SELF: x"))).toBe(
      "Una tarea no puede depender de sí misma.",
    );
    expect(dependencyErrorMessage(new Error("DUPLICATE: x"))).toBe(
      "Esta tarea ya depende de la tarea elegida.",
    );
    expect(dependencyErrorMessage(new Error("CYCLE: x"))).toBe(
      "No se puede agregar: la tarea elegida ya depende de esta, y se formaría un ciclo.",
    );
    expect(dependencyErrorMessage(new Error("boom"))).toBe(
      "No se pudo actualizar la dependencia.",
    );
  });
});
