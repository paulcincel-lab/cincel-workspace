// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import type { TaskDetail, TaskRef } from "@/lib/types/core";

const actions = vi.hoisted(() => ({
  createSubtaskAction: vi.fn(),
  listSubtasksAction: vi.fn(),
  listTaskDependenciesAction: vi.fn(async () => ({ dependsOn: [], blocks: [] })),
}));

vi.mock("@/lib/actions/tasks-actions", () => actions);
vi.mock("@/lib/actions/import-actions", () => ({
  getImportDataAction: vi.fn().mockResolvedValue(null),
}));

import TaskSubtasks, { subtaskErrorMessage } from "./TaskSubtasks";

const PARENT_ID = "00000000-0000-4000-8000-0000000000a1";
const CHILD_ID = "00000000-0000-4000-8000-0000000000c1";

function makeTask(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: PARENT_ID,
    projectId: "00000000-0000-4000-8000-000000000001",
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
    project: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Casa Lomas",
      clientName: "Cliente",
    },
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

function renderSubtasks(task: TaskDetail, onOpenSubtask: (subtask: TaskRef) => void = vi.fn()) {
  return render(<TaskSubtasks parentId={task.id} onOpenSubtask={onOpenSubtask} />);
}

describe("TaskSubtasks", () => {
  beforeEach(() => {
    actions.listSubtasksAction.mockResolvedValue([childRef]);
    actions.createSubtaskAction.mockResolvedValue(childTask);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists the subtasks with status, title, manager and commitment date", async () => {
    renderSubtasks(parentTask);

    expect(screen.getByText("Subtareas")).toBeTruthy();
    expect(await screen.findByText("Fachada norte")).toBeTruthy();
    expect(actions.listSubtasksAction).toHaveBeenCalledWith(PARENT_ID);
    expect(screen.getAllByText("En proceso").length).toBeGreaterThan(0);
    expect(screen.getByText("LP")).toBeTruthy();
    expect(screen.getByText("05-11-2026")).toBeTruthy();
  });

  it("shows an empty state", async () => {
    actions.listSubtasksAction.mockResolvedValue([]);
    renderSubtasks(parentTask);
    expect(await screen.findByText("Sin subtareas.")).toBeTruthy();
  });

  it("adds a subtask and reloads the list", async () => {
    actions.listSubtasksAction
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([childRef]);
    renderSubtasks(parentTask);
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
    renderSubtasks(parentTask);
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
});
