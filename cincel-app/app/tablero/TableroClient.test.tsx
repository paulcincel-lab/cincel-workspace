import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { TaskListItem, TaskStatus, WorkflowDetail, WorkflowRef } from "@/lib/types/core";

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => null,
}));

vi.mock("@/lib/auth/permissions", () => ({
  resolveActivitiesCapabilities: () => ({}),
  canChangeActivityStatus: () => false,
}));

vi.mock("@/components/tareas/TaskDrawer", () => ({ default: () => null }));

const fetchBoard = vi.fn();
vi.mock("@/lib/actions/tasks-actions", () => ({
  fetchBoardAction: (filters: unknown) => fetchBoard(filters),
  fetchTaskAction: () => new Promise(() => {}),
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
  addTaskCommentAction: vi.fn(),
  addTaskAttachmentAction: vi.fn(),
  addTaskLinkAction: vi.fn(),
  removeTaskLinkAction: vi.fn(),
  addChecklistItemAction: vi.fn(),
  updateChecklistItemAction: vi.fn(),
  removeChecklistItemAction: vi.fn(),
}));

import { TableroClient } from "./TableroClient";

const DISENO: WorkflowRef = { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 };
const CONSTRUCCION: WorkflowRef = { id: "w3", key: "construccion", name: "Construcción", sortOrder: 3 };

function workflow(ref: WorkflowRef, active = true): WorkflowDetail {
  return {
    ...ref,
    description: null,
    active,
    autoStart: "manual",
    phases: [],
    templates: [],
    readiness: null,
    areas: [],
  } as unknown as WorkflowDetail;
}

function makeTask(overrides: Partial<TaskListItem>): TaskListItem {
  return {
    id: "t1",
    projectId: "p1",
    kind: "workflow",
    templateId: null,
    workflowId: DISENO.id,
    phaseId: null,
    spaceId: null,
    closedAt: null,
    title: "Tarea",
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
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    customStatus: null,
    project: { id: "p1", name: "Residencia Valle Alto", clientName: null },
    workflow: DISENO,
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

function board(tasks: TaskListItem[]): Record<TaskStatus, TaskListItem[]> {
  return { pendiente: tasks, en_proceso: [], completado: [], bloqueado: [] };
}

function cardOf(title: string): HTMLElement {
  const card = screen.getByText(title).parentElement;
  if (!card) throw new Error(`no card for ${title}`);
  return card;
}

describe("TableroClient tramo labels", () => {
  const tasks = [
    makeTask({
      id: "a",
      title: "Planos ejecutivos",
      phaseId: "f1",
      phase: { id: "f1", name: "Ejecutivo", sortOrder: 1 },
    }),
    makeTask({ id: "b", title: "Cimbra", workflowId: CONSTRUCCION.id, workflow: CONSTRUCCION }),
  ];

  beforeEach(() => {
    fetchBoard.mockReset();
    fetchBoard.mockResolvedValue(board(tasks));
  });

  it("builds the tabs from the active workflows, starting with Todos", () => {
    render(
      <TableroClient
        initialBoard={board(tasks)}
        customStatuses={[]}
        workflows={[workflow(CONSTRUCCION), workflow(DISENO), workflow({ ...DISENO, id: "old", name: "Viejo" }, false)]}
      />,
    );

    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Todos", "Diseño", "Construcción"]);
    expect(fetchBoard).toHaveBeenCalledWith({});
  });

  it("shows Tramo · Fase on each card and the project's current tramo when it differs", () => {
    render(
      <TableroClient
        initialBoard={board(tasks)}
        customStatuses={[]}
        workflows={[workflow(DISENO), workflow(CONSTRUCCION)]}
        projectTramos={{ p1: CONSTRUCCION }}
      />,
    );

    const planos = cardOf("Planos ejecutivos");
    expect(within(planos).getByText("Diseño · Ejecutivo")).toBeTruthy();
    expect(within(planos).getByText("Tramo actual del proyecto: Construcción")).toBeTruthy();

    const cimbra = cardOf("Cimbra");
    expect(within(cimbra).getByText("Construcción")).toBeTruthy();
    expect(within(cimbra).queryByText(/Tramo actual del proyecto/)).toBeNull();
  });
});
