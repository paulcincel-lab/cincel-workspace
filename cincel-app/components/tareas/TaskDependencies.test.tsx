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
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import type { TaskDetail, TaskListItem, TaskRef } from "@/lib/types/core";

const actions = vi.hoisted(() => ({
  listSubtasksAction: vi.fn(),
  createSubtaskAction: vi.fn(),
  listTaskDependenciesAction: vi.fn(),
  addTaskDependencyAction: vi.fn(),
  removeTaskDependencyAction: vi.fn(),
  fetchTasksAction: vi.fn(),
}));

vi.mock("@/lib/actions/tasks-actions", () => actions);

import TaskDrawer from "./TaskDrawer";
import { dependencyErrorMessage } from "./TaskDependencies";

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
    phase: null,
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
    areaColorSlot: null,
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
const noop = () => {};

function renderDrawer(
  shown: TaskDetail,
  onOpenTask: ((id: string) => void) | undefined = vi.fn(),
  onDependenciesChange?: () => void,
) {
  return render(
    <TaskDrawer
      open
      task={shown}
      onClose={noop}
      onAddComment={noop}
      onAddChecklistItem={noop}
      onToggleChecklistItem={noop}
      onRemoveChecklistItem={noop}
      onOpenTask={onOpenTask}
      onDependenciesChange={onDependenciesChange}
    />,
  );
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

describe("TaskDrawer Dependencias", () => {
  beforeEach(() => {
    actions.listSubtasksAction.mockResolvedValue([]);
    actions.listTaskDependenciesAction.mockResolvedValue({
      dependsOn: [depRef],
      blocks: [blockedRef],
    });
    actions.fetchTasksAction.mockResolvedValue([
      makeItem({ id: TASK_ID, title: "Planos arquitectónicos" }),
      makeItem({ id: DEP_ID, title: "Levantamiento topográfico" }),
      makeItem({ id: OTHER_ID, title: "Estudio de mecánica de suelos" }),
    ]);
    actions.addTaskDependencyAction.mockResolvedValue(undefined);
    actions.removeTaskDependencyAction.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists Depende de and Bloquea a", async () => {
    renderDrawer(task);

    expect(await screen.findByText("Levantamiento topográfico")).toBeTruthy();
    expect(screen.getByText("Licencia de construcción")).toBeTruthy();
    expect(screen.getByText("Depende de")).toBeTruthy();
    expect(screen.getByText("Bloquea a")).toBeTruthy();
    expect(screen.getByText("LP")).toBeTruthy();
    expect(screen.getByText("05-11-2026")).toBeTruthy();
    expect(actions.listTaskDependenciesAction).toHaveBeenCalledWith(TASK_ID);
    // Bloquea a is read-only: only the Depende de row has a remove button.
    expect(
      screen.getAllByRole("button", { name: /Quitar dependencia/ }),
    ).toHaveLength(1);
  });

  it("shows empty states", async () => {
    actions.listTaskDependenciesAction.mockResolvedValue({
      dependsOn: [],
      blocks: [],
    });
    renderDrawer(task);
    expect(await screen.findByText("No depende de otras tareas.")).toBeTruthy();
    expect(screen.getByText("Ninguna tarea espera a esta.")).toBeTruthy();
  });

  it("opens linked tasks in the drawer", async () => {
    const onOpenTask = vi.fn();
    renderDrawer(task, onOpenTask);
    fireEvent.click(await screen.findByText("Licencia de construcción"));
    expect(onOpenTask).toHaveBeenCalledWith(BLOCKED_ID);
  });

  it("searches only the task's project, without itself or existing dependencies", async () => {
    actions.fetchTasksAction.mockResolvedValue([
      makeItem({ id: TASK_ID, title: "Planos arquitectónicos" }),
      makeItem({ id: DEP_ID, title: "Levantamiento topográfico" }),
      makeItem({ id: OTHER_ID, title: "Estudio de mecánica de suelos" }),
      makeItem({
        id: "00000000-0000-4000-8000-0000000000e1",
        title: "Tarea de otro proyecto",
        projectId: "00000000-0000-4000-8000-000000000002",
      }),
    ]);
    renderDrawer(task);
    await screen.findByText("Levantamiento topográfico");

    fireEvent.click(screen.getByText("Agregar dependencia"));

    expect(
      await screen.findByText("Estudio de mecánica de suelos"),
    ).toBeTruthy();
    expect(actions.fetchTasksAction).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
    });
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Estudio de mecánica de suelos"]);
  });

  it("adds a dependency, reloads and notifies the caller", async () => {
    const onChange = vi.fn();
    renderDrawer(task, vi.fn(), onChange);
    await screen.findByText("Levantamiento topográfico");

    await pickCandidate("Estudio de mecánica de suelos");

    await waitFor(() =>
      expect(actions.addTaskDependencyAction).toHaveBeenCalledWith(
        TASK_ID,
        OTHER_ID,
      ),
    );
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(actions.listTaskDependenciesAction).toHaveBeenCalledTimes(2);
  });

  it("shows the cycle error copy inline", async () => {
    actions.addTaskDependencyAction.mockRejectedValue(
      new Error("CYCLE: dependency would close a cycle"),
    );
    const onChange = vi.fn();
    renderDrawer(task, vi.fn(), onChange);
    await screen.findByText("Levantamiento topográfico");

    await pickCandidate("Estudio de mecánica de suelos");

    expect(
      await screen.findByText(
        "No se puede agregar: la tarea elegida ya depende de esta, y se formaría un ciclo.",
      ),
    ).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a dependency after confirming", async () => {
    const onChange = vi.fn();
    renderDrawer(task, vi.fn(), onChange);
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
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  });

  it("keeps the dependency when the removal is cancelled", async () => {
    renderDrawer(task);
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

  it("hides the section when the drawer can't navigate between tasks", () => {
    render(
      <TaskDrawer
        open
        task={task}
        onClose={noop}
        onAddComment={noop}
        onAddChecklistItem={noop}
        onToggleChecklistItem={noop}
        onRemoveChecklistItem={noop}
      />,
    );
    expect(screen.queryByText("Dependencias")).toBeNull();
    expect(actions.listTaskDependenciesAction).not.toHaveBeenCalled();
  });
});

describe("TaskDrawer En espera badge", () => {
  beforeEach(() => {
    actions.listSubtasksAction.mockResolvedValue([]);
    actions.listTaskDependenciesAction.mockResolvedValue({
      dependsOn: [],
      blocks: [],
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows En espera next to the status when a dependency is open", () => {
    renderDrawer(makeTask({ waitingOn: 2 }));
    expect(screen.getByText("En espera")).toBeTruthy();
  });

  it("hides it when the only dependencies are completed, deleted or archived", async () => {
    // A completed dependency is still listed but doesn't count toward waitingOn.
    actions.listTaskDependenciesAction.mockResolvedValue({
      dependsOn: [{ ...depRef, status: "completado" }],
      blocks: [],
    });
    renderDrawer(makeTask({ waitingOn: 0 }));
    expect(await screen.findByText("Levantamiento topográfico")).toBeTruthy();
    expect(screen.queryByText("En espera")).toBeNull();
  });
});
