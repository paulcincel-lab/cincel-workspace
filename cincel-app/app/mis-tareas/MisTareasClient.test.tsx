import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { TaskListItem } from "@/lib/types/core";
import { MisTareasClient } from "./MisTareasClient";

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => null,
}));

vi.mock("@/lib/auth/permissions", () => ({
  resolveActivitiesCapabilities: () => ({}),
  canChangeActivityStatus: () => false,
}));

vi.mock("@/lib/actions/task-statuses-actions", () => ({
  fetchTaskStatusesAction: () => Promise.resolve([]),
}));

vi.mock("@/lib/actions/tasks-actions", () => ({
  // Never resolves, so the rows under test stay the initial ones.
  fetchMyTasksAction: () => new Promise(() => {}),
  fetchTaskAction: () => new Promise(() => {}),
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
  addChecklistItemAction: vi.fn(),
  updateChecklistItemAction: vi.fn(),
  removeChecklistItemAction: vi.fn(),
  reorderProjectTasksAction: vi.fn(),
  addTaskCommentAction: vi.fn(),
  addTaskAttachmentAction: vi.fn(),
  addTaskLinkAction: vi.fn(),
  removeTaskLinkAction: vi.fn(),
}));

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
  };
}

function rowOf(title: string): HTMLElement {
  const row = screen.getByText(title).closest("tr");
  if (!row) throw new Error(`no row for ${title}`);
  return row;
}

describe("MisTareasClient rows", () => {
  it("renders the subtask line, subtareas badge and En espera badge", () => {
    render(
      <MisTareasClient
        initialTasks={[
          makeTask({
            id: "p",
            title: "Planos ejecutivos",
            subtaskCount: 3,
            subtaskDoneCount: 2,
          }),
          makeTask({
            id: "c",
            title: "Plano de cimentación",
            parentTaskId: "p",
            parentTitle: "Planos ejecutivos",
            waitingOn: 1,
          }),
          makeTask({ id: "x", title: "Render de fachada" }),
        ]}
      />,
    );

    const parent = rowOf("Planos ejecutivos");
    expect(within(parent).getByText("2/3 subtareas")).toBeTruthy();
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

describe("MisTareasClient Tramo · Fase column", () => {
  it("labels the column Tramo · Fase and shows tramo and fase as text", () => {
    render(
      <MisTareasClient
        initialTasks={[
          makeTask({
            id: "a",
            title: "Planos ejecutivos",
            kind: "workflow",
            workflowId: "w2",
            workflow: { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 },
            phaseId: "f1",
            phase: { id: "f1", name: "Ejecutivo", sortOrder: 1 },
          }),
          makeTask({
            id: "b",
            title: "Render de fachada",
            kind: "workflow",
            workflowId: "w2",
            workflow: { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 },
          }),
          makeTask({ id: "c", title: "Llamar al proveedor" }),
        ]}
      />,
    );

    expect(screen.getAllByText("Tramo · Fase").length).toBeGreaterThan(0);
    expect(screen.queryByText("Departamento")).toBeNull();
    expect(screen.queryByText("Sin departamento")).toBeNull();
    expect(within(rowOf("Planos ejecutivos")).getByText("Diseño · Ejecutivo")).toBeTruthy();
    expect(within(rowOf("Render de fachada")).getByText("Diseño")).toBeTruthy();
    expect(within(rowOf("Llamar al proveedor")).getByText("—")).toBeTruthy();
  });
});
