// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const actions = vi.hoisted(() => ({
  createUserTaskAction: vi.fn(),
  createSubtaskAction: vi.fn(),
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
  deleteTaskAction: vi.fn(),
  fetchWorkflowsAction: vi.fn(),
  setTaskEstimatedHoursAction: vi.fn(),
}));
vi.mock("@/lib/actions/calendario-actions", () => ({ setTaskEstimatedHoursAction: actions.setTaskEstimatedHoursAction }));
vi.mock("@/lib/actions/tasks-actions", () => ({
  createUserTaskAction: actions.createUserTaskAction,
  createSubtaskAction: actions.createSubtaskAction,
  setTaskStatusAction: actions.setTaskStatusAction,
  setTaskCustomStatusAction: actions.setTaskCustomStatusAction,
  deleteTaskAction: actions.deleteTaskAction,
}));
vi.mock("@/lib/actions/workflows-actions", () => ({ fetchWorkflowsAction: actions.fetchWorkflowsAction }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

import type { QuickAddDraft } from "@/components/widgets/QuickAddRow";
import { createTestQueryClient } from "@/lib/query/test-utils";

import { DISENO, PRESALE, WORKFLOWS } from "./new-task-fixtures";
import {
  newTaskInvalidations,
  newTaskWorkflowsKey,
  quickAddSubtaskInput,
  quickAddSubtaskInvalidations,
  quickAddTaskVars,
  useQuickAddCreate,
} from "./quick-add-create";
import { qk } from "@/lib/query/keys";

const DRAFT: QuickAddDraft = {
  title: "  Revisar plafones ",
  projectId: "p-roble",
  tramoId: "w-diseno",
  assigneeId: "p-ana",
  dueDate: "2026-11-13",
  priority: "alta",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("quickAddTaskVars", () => {
  it("maps the draft to a UserTaskInput on the tramo's first fase", () => {
    expect(quickAddTaskVars(DRAFT, WORKFLOWS)).toEqual({
      input: {
        projectId: "p-roble",
        title: "Revisar plafones",
        notes: null,
        workflowId: "w-diseno",
        // DISENO's fases in catalog order: Anteproyecto (1), Ejecutivo (2).
        phaseId: "f-ante",
        managerId: "p-ana",
        priority: "alta",
        deliveryDate: "2026-11-13",
      },
      subtasks: [],
    });
    expect(DISENO.phases.some((p) => p.id === "f-ante")).toBe(true);
  });

  it("defaults: no fase without a catalog, no manager, no date, media", () => {
    const vars = quickAddTaskVars(
      { ...DRAFT, tramoId: PRESALE.id, assigneeId: null, dueDate: null, priority: undefined as never, status: "en_proceso" },
      WORKFLOWS,
    );
    expect(vars.input).toMatchObject({ workflowId: "w-presale", phaseId: null, managerId: null, deliveryDate: null, priority: "media" });
    expect(vars.statusKey).toBe("en_proceso");
  });

  it("falls back to the first tramo and rejects a draft without project", () => {
    expect(quickAddTaskVars({ ...DRAFT, tramoId: null }, WORKFLOWS).input.workflowId).toBe(WORKFLOWS[0].id);
    expect(() => quickAddTaskVars({ ...DRAFT, projectId: null }, WORKFLOWS)).toThrow("INVALID");
  });
});

describe("useQuickAddCreate", () => {
  function setup() {
    const client = createTestQueryClient();
    client.setQueryData(newTaskWorkflowsKey(), WORKFLOWS);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useQuickAddCreate(), { wrapper });
    return { result, invalidate };
  }

  const invalidatedKeys = (spy: ReturnType<typeof vi.spyOn>) =>
    spy.mock.calls.map((call: unknown[]) => (call[0] as { queryKey: unknown }).queryKey);

  it("creates without a success toast and invalidates the task views", async () => {
    actions.createUserTaskAction.mockResolvedValue({ id: "t-1", title: "Revisar plafones", status: "pendiente", customStatus: null });
    const { result, invalidate } = setup();
    let created: unknown;
    await act(async () => {
      created = await result.current.create(DRAFT);
    });
    expect(created).toEqual({ id: "t-1", title: "Revisar plafones" });
    expect(actions.createUserTaskAction).toHaveBeenCalledWith(expect.objectContaining({ phaseId: "f-ante", managerId: "p-ana" }));
    expect(toasts.success).not.toHaveBeenCalled();
    expect(invalidatedKeys(invalidate)).toEqual(newTaskInvalidations("p-roble"));
  });

  it("a ~2h draft saves the estimated hours after the create and refreshes the calendar", async () => {
    actions.createUserTaskAction.mockResolvedValue({ id: "t-1", title: "Revisar plafones", status: "pendiente", customStatus: null });
    actions.setTaskEstimatedHoursAction.mockResolvedValue({ ok: true, data: {} });
    const { result, invalidate } = setup();
    await act(async () => {
      await result.current.create({ ...DRAFT, estimatedHours: 2 });
    });
    expect(actions.setTaskEstimatedHoursAction).toHaveBeenCalledWith("t-1", 2);
    expect(invalidatedKeys(invalidate)).toEqual([...newTaskInvalidations("p-roble"), qk.calendario.all]);
  });

  it("a draft without hours never calls the hours action", async () => {
    actions.createUserTaskAction.mockResolvedValue({ id: "t-1", title: "Revisar plafones", status: "pendiente", customStatus: null });
    const { result } = setup();
    await act(async () => {
      await result.current.create(DRAFT);
    });
    expect(actions.setTaskEstimatedHoursAction).not.toHaveBeenCalled();
  });

  it("undo deletes the task with the same invalidations", async () => {
    actions.createUserTaskAction.mockResolvedValue({ id: "t-1", title: "Revisar plafones", status: "pendiente", customStatus: null });
    actions.deleteTaskAction.mockResolvedValue({ ok: true, data: undefined });
    const { result, invalidate } = setup();
    await act(async () => {
      await result.current.create(DRAFT);
    });
    invalidate.mockClear();
    await act(async () => {
      await result.current.undo("t-1");
    });
    expect(actions.deleteTaskAction).toHaveBeenCalledWith("t-1");
    expect(invalidatedKeys(invalidate)).toEqual(newTaskInvalidations("p-roble"));
  });

  it("a failed create rejects and shows the error toast", async () => {
    actions.createUserTaskAction.mockResolvedValue({ ok: false, error: "INVALID" });
    const { result } = setup();
    await act(async () => {
      await expect(result.current.create(DRAFT)).rejects.toThrow("INVALID");
    });
    expect(toasts.error).toHaveBeenCalled();
  });
});

describe("useQuickAddCreate · \"+ Subtarea…\" (#1048)", () => {
  it("a draft with parentTaskId creates a subtask of it and refreshes the parent's rows", async () => {
    actions.createSubtaskAction.mockResolvedValue({ id: "t-2", title: "Detalle", status: "pendiente", customStatus: null });
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useQuickAddCreate(), { wrapper });
    const draft: QuickAddDraft = { ...DRAFT, title: "Detalle", parentTaskId: "t-1" };
    let created: unknown;
    await act(async () => {
      created = await result.current.create(draft);
    });
    expect(created).toEqual({ id: "t-2", title: "Detalle" });
    expect(actions.createUserTaskAction).not.toHaveBeenCalled();
    expect(actions.createSubtaskAction).toHaveBeenCalledWith("t-1", quickAddSubtaskInput(draft));
    const keys = invalidate.mock.calls.map((call) => (call[0] as { queryKey: unknown }).queryKey);
    expect(keys).toEqual(quickAddSubtaskInvalidations("t-1", "p-roble"));
    expect(keys).toContainEqual(qk.tasks.children("t-1"));
  });

  it("maps the draft to the subtask input", () => {
    expect(quickAddSubtaskInput({ ...DRAFT, title: "Detalle", parentTaskId: "t-1" })).toEqual({
      title: "Detalle",
      managerId: "p-ana",
      deliveryDate: "2026-11-13",
      priority: "alta",
    });
  });
});
