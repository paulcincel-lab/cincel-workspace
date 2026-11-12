// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  bulkUpdateTasksAction: vi.fn(),
}));
vi.mock("@/lib/actions/tasks-actions", () => actions);
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({ fetchCatalogTaskStatuses: vi.fn(async () => []) }));

const toast = vi.hoisted(() => Object.assign(vi.fn(() => "t1"), { error: vi.fn(), dismiss: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { useSessionStore } from "@/lib/stores/session-store";
import type { SessionAccess } from "@/lib/auth/session";

import type { TaskBulkTask } from "./task-bulk";
import { TaskBulkBar } from "./TaskBulkBar";
import type { TaskSelection } from "./use-task-selection";

function task(id: string, patch: Partial<TaskBulkTask> = {}): TaskBulkTask {
  return {
    id,
    projectId: "p1",
    kind: "usuario",
    title: `Tarea ${id}`,
    workflowId: null,
    workflow: null,
    phaseId: null,
    phase: null,
    spaceId: null,
    space: null,
    status: "pendiente",
    customStatus: null,
    managerId: null,
    manager: null,
    priority: "media",
    commitmentDate: null,
    reviewDate: null,
    deliveryDate: null,
    parentTaskId: null,
    support: [],
    ...patch,
  } as TaskBulkTask;
}

const TASKS = new Map([
  ["a", task("a")],
  ["b", task("b", { status: "en_proceso" })],
]);

function selectionOf(ids: string[]): TaskSelection {
  const set = new Set(ids);
  return {
    selectedIds: set,
    count: set.size,
    isSelected: (id) => set.has(id),
    toggle: vi.fn(),
    setMany: vi.fn(),
    clear: vi.fn(),
    onSelectionChange: vi.fn(),
  };
}

function signIn(access: "Administrador" | "Colaborador") {
  const user = { id: "s1", name: "Ana Ruiz", email: "ana@example.test", role: access, area: null, active: true, access };
  useSessionStore.setState({ access: { status: "active", user: { member: user, email: user.email, access } } as unknown as SessionAccess });
}

function renderBar(selection: TaskSelection, request = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <TaskBulkBar
        selection={selection}
        taskOf={(id) => TASKS.get(id)}
        staff={[{ id: "m1", name: "Bruno Díaz" }]}
        deletes={{ canDelete: true, request }}
      />
    </QueryClientProvider>,
  );
  return { invalidate, request };
}

beforeEach(() => {
  signIn("Administrador");
  actions.bulkUpdateTasksAction.mockReset();
  toast.mockClear();
  toast.error.mockClear();
});
afterEach(cleanup);

describe("TaskBulkBar (#1040)", () => {
  it("renders nothing without a selection", () => {
    renderBar(selectionOf([]));
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("shows the count, the fields, Eliminar and Quitar selección", () => {
    const selection = selectionOf(["a", "b"]);
    renderBar(selection);
    expect(screen.getByRole("toolbar", { name: "2 seleccionadas" })).toBeTruthy();
    for (const label of ["Estatus", "Responsable", "Apoyo", "Fase", "Vence", "Horas estimadas", "Eliminar"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "Quitar selección" }));
    expect(selection.clear).toHaveBeenCalledTimes(1);
  });

  it("a Colaborador gets no Responsable or Apoyo (they can't change them on any task)", () => {
    signIn("Colaborador");
    renderBar(selectionOf(["a"]));
    expect(screen.queryByRole("button", { name: "Responsable" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Apoyo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Estatus" })).toBeTruthy();
  });

  it("Horas estimadas saves the hours for every selected task and undoes to the previous ones", async () => {
    TASKS.set("c", task("c", { estimatedHours: 3 }));
    actions.bulkUpdateTasksAction.mockResolvedValue({ ok: true, data: { updated: ["a", "c"], skipped: [] } });
    renderBar(selectionOf(["a", "c"]));
    fireEvent.click(screen.getByRole("button", { name: "Horas estimadas" }));
    const field = await screen.findByRole("spinbutton", { name: "Horas estimadas" });
    fireEvent.change(field, { target: { value: "2.5" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(actions.bulkUpdateTasksAction).toHaveBeenCalledWith(["a", "c"], { estimatedHours: 2.5 }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const [, options] = toast.mock.calls[0] as unknown as [string, { action: { onClick(): void } }];
    await act(async () => options.action.onClick());
    await waitFor(() => {
      expect(actions.bulkUpdateTasksAction).toHaveBeenCalledWith(["a"], { estimatedHours: null });
      expect(actions.bulkUpdateTasksAction).toHaveBeenCalledWith(["c"], { estimatedHours: 3 });
    });
    TASKS.delete("c");
  });

  it("Horas estimadas rejects a value out of range without saving", async () => {
    renderBar(selectionOf(["a"]));
    fireEvent.click(screen.getByRole("button", { name: "Horas estimadas" }));
    const field = await screen.findByRole("spinbutton", { name: "Horas estimadas" });
    fireEvent.change(field, { target: { value: "120" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect((await screen.findByRole("alert")).textContent).toBe("Escribe un valor entre 0.5 y 80 horas.");
    expect(actions.bulkUpdateTasksAction).not.toHaveBeenCalled();
  });

  it("a pick saves every selected task in one call; the toast reports the skipped ones and undoes", async () => {
    actions.bulkUpdateTasksAction.mockResolvedValue({
      ok: true,
      data: { updated: ["a"], skipped: [{ id: "b", reason: "FORBIDDEN" }] },
    });
    const { invalidate } = renderBar(selectionOf(["a", "b"]));
    fireEvent.click(screen.getByRole("button", { name: "Estatus" }));
    fireEvent.click(await screen.findByRole("option", { name: /Completado/ }));
    await waitFor(() => expect(actions.bulkUpdateTasksAction).toHaveBeenCalledWith(["a", "b"], { status: "completado" }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const [message, options] = toast.mock.calls[0] as unknown as [string, { action: { label: string; onClick(): void } }];
    expect(message).toBe("1 tarea actualizada. 1 tarea no se cambió por permisos.");
    expect(invalidate).toHaveBeenCalled();

    // Deshacer: only the updated task goes back to its previous status.
    actions.bulkUpdateTasksAction.mockResolvedValue({ ok: true, data: { updated: ["a"], skipped: [] } });
    expect(options.action.label).toBe("Deshacer");
    await act(async () => options.action.onClick());
    await waitFor(() => expect(actions.bulkUpdateTasksAction).toHaveBeenLastCalledWith(["a"], { status: "pendiente" }));
  });

  it("a failed call shows the error and changes nothing", async () => {
    actions.bulkUpdateTasksAction.mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    renderBar(selectionOf(["a"]));
    fireEvent.click(screen.getByRole("button", { name: "Estatus" }));
    fireEvent.click(await screen.findByRole("option", { name: /Completado/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast).not.toHaveBeenCalled();
  });

  it("Eliminar hands the selected tasks to the delete flow and clears the selection after it", () => {
    const selection = selectionOf(["a", "b"]);
    const { request } = renderBar(selection);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(request).toHaveBeenCalledWith(
      [
        { id: "a", title: "Tarea a", projectId: "p1" },
        { id: "b", title: "Tarea b", projectId: "p1" },
      ],
      expect.objectContaining({ onDeleted: expect.any(Function) }),
    );
    request.mock.calls[0][1].onDeleted(["a", "b"]);
    expect(selection.clear).toHaveBeenCalled();
  });
});
