// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";

import type { TaskDetail, TaskRef } from "@/lib/types/core";

const actions = vi.hoisted(() => ({
  createSubtaskAction: vi.fn(),
  listSubtasksAction: vi.fn(),
}));

vi.mock("@/lib/actions/tasks-actions", () => actions);
vi.mock("@/lib/actions/import-actions", () => ({
  getImportDataAction: vi.fn().mockResolvedValue(null),
}));

import TaskDrawer from "./TaskDrawer";
import { subtaskErrorMessage } from "./TaskSubtasks";

const PARENT_ID = "00000000-0000-4000-8000-0000000000a1";
const CHILD_ID = "00000000-0000-4000-8000-0000000000c1";

function makeTask(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: PARENT_ID,
    projectId: "00000000-0000-4000-8000-000000000001",
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
    project: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Casa Lomas",
      clientName: "Cliente",
    },
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

const childRef: TaskRef = {
  id: CHILD_ID,
  title: "Fachada norte",
  status: "en_proceso",
  managerName: "Luis Pérez",
  commitmentDate: "2026-11-05",
};

const parentTask = makeTask();
const childTask = makeTask({
  id: CHILD_ID,
  title: "Fachada norte",
  status: "en_proceso",
  parentTaskId: PARENT_ID,
  parentTitle: "Planos arquitectónicos",
});

const noop = () => {};

function renderDrawer(task: TaskDetail, onOpenTask?: (id: string) => void) {
  return render(
    <TaskDrawer
      open
      task={task}
      onClose={noop}
      onAddComment={noop}
      onAddChecklistItem={noop}
      onToggleChecklistItem={noop}
      onRemoveChecklistItem={noop}
      onOpenTask={onOpenTask}
    />,
  );
}

/** Drawer wired like the pages: onOpenTask swaps the task shown. */
function NavigableDrawer() {
  const tasksById: Record<string, TaskDetail> = {
    [PARENT_ID]: parentTask,
    [CHILD_ID]: childTask,
  };
  const [taskId, setTaskId] = useState(PARENT_ID);
  return (
    <TaskDrawer
      open
      task={tasksById[taskId]}
      onClose={noop}
      onAddComment={noop}
      onAddChecklistItem={noop}
      onToggleChecklistItem={noop}
      onRemoveChecklistItem={noop}
      onOpenTask={setTaskId}
    />
  );
}

describe("TaskDrawer Subtareas", () => {
  beforeEach(() => {
    actions.listSubtasksAction.mockResolvedValue([childRef]);
    actions.createSubtaskAction.mockResolvedValue(childTask);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists the subtasks with status, title, manager and commitment date", async () => {
    renderDrawer(parentTask, vi.fn());

    expect(screen.getByText("Subtareas")).toBeTruthy();
    expect(await screen.findByText("Fachada norte")).toBeTruthy();
    expect(actions.listSubtasksAction).toHaveBeenCalledWith(PARENT_ID);
    expect(screen.getAllByText("En proceso").length).toBeGreaterThan(0);
    expect(screen.getByText("LP")).toBeTruthy();
    expect(screen.getByText("05-11-2026")).toBeTruthy();
  });

  it("shows an empty state", async () => {
    actions.listSubtasksAction.mockResolvedValue([]);
    renderDrawer(parentTask, vi.fn());
    expect(await screen.findByText("Sin subtareas.")).toBeTruthy();
  });

  it("adds a subtask and reloads the list", async () => {
    actions.listSubtasksAction
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([childRef]);
    renderDrawer(parentTask, vi.fn());
    await screen.findByText("Sin subtareas.");

    fireEvent.change(screen.getByLabelText("Título de la subtarea"), {
      target: { value: "  Fachada norte  " },
    });
    fireEvent.click(screen.getByText("Agregar subtarea"));

    await waitFor(() =>
      expect(actions.createSubtaskAction).toHaveBeenCalledWith(PARENT_ID, {
        title: "Fachada norte",
      }),
    );
    expect(await screen.findByText("Fachada norte")).toBeTruthy();
    expect(actions.listSubtasksAction).toHaveBeenCalledTimes(2);
  });

  it("shows Spanish copy when adding fails", async () => {
    actions.createSubtaskAction.mockRejectedValue(new Error("NESTED"));
    renderDrawer(parentTask, vi.fn());
    await screen.findByText("Fachada norte");

    fireEvent.change(screen.getByLabelText("Título de la subtarea"), {
      target: { value: "Otra" },
    });
    fireEvent.click(screen.getByText("Agregar subtarea"));

    expect(
      await screen.findByText("Una subtarea no puede tener subtareas."),
    ).toBeTruthy();
  });

  it("maps every error code to Spanish", () => {
    expect(subtaskErrorMessage(new Error("NESTED"))).toBe(
      "Una subtarea no puede tener subtareas.",
    );
    expect(subtaskErrorMessage(new Error("FORBIDDEN"))).toBe(
      "No tienes permiso para agregar subtareas.",
    );
    expect(subtaskErrorMessage(new Error("NOT_FOUND"))).toBe(
      "La tarea ya no existe.",
    );
    expect(subtaskErrorMessage(new Error("boom"))).toBe(
      "No se pudo agregar la subtarea.",
    );
  });

  it("opens a child in the same drawer with a back link to the parent", async () => {
    render(<NavigableDrawer />);

    fireEvent.click(await screen.findByText("Fachada norte"));

    expect(screen.getByText("← Planos arquitectónicos")).toBeTruthy();
    expect(screen.getByText("Subtarea de")).toBeTruthy();
    expect(screen.queryByText("Subtareas")).toBeNull();

    fireEvent.click(screen.getByText("← Planos arquitectónicos"));

    expect(screen.getByText("Subtareas")).toBeTruthy();
    expect(screen.queryByText("← Planos arquitectónicos")).toBeNull();
  });

  it("hides the section and the add button for subtasks and links to the parent", () => {
    const onOpenTask = vi.fn();
    renderDrawer(childTask, onOpenTask);

    expect(screen.queryByText("Subtareas")).toBeNull();
    expect(screen.queryByText("Agregar subtarea")).toBeNull();
    expect(actions.listSubtasksAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Planos arquitectónicos"));
    expect(onOpenTask).toHaveBeenCalledWith(PARENT_ID);
  });

  it("shows the deleted-parent state and treats the task as top-level", async () => {
    renderDrawer(
      makeTask({
        id: CHILD_ID,
        title: "Fachada norte",
        parentTaskId: PARENT_ID,
        parentTitle: null,
      }),
      vi.fn(),
    );

    expect(screen.getByText("Tarea padre eliminada")).toBeTruthy();
    expect(screen.queryByText("Subtarea de")).toBeNull();
    expect(screen.getByText("Subtareas")).toBeTruthy();
    await waitFor(() =>
      expect(actions.listSubtasksAction).toHaveBeenCalledWith(CHILD_ID),
    );
  });

  it("hides the section when the drawer can't navigate between tasks", () => {
    renderDrawer(parentTask);
    expect(screen.queryByText("Subtareas")).toBeNull();
  });
});
