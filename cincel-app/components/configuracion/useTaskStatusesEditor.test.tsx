// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";
import type { TaskStatusOption } from "@/lib/types/core";

const caps = vi.hoisted(() => ({ canViewTaskStatuses: true, canManageTaskStatuses: true }));
vi.mock("@/lib/auth/permissions", () => ({ resolveTaskStatusesCapabilities: () => caps }));

const actions = vi.hoisted(() => ({
  fetchTaskStatusesAction: vi.fn(),
  createTaskStatusAction: vi.fn(),
  updateTaskStatusAction: vi.fn(),
  deleteTaskStatusAction: vi.fn(),
  reorderTaskStatusesAction: vi.fn(),
}));
vi.mock("@/lib/actions/task-statuses-actions", () => actions);

const pageData = vi.hoisted(() => ({ getAjustesEstatusPageData: vi.fn() }));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => pageData);

import {
  parseInlineStatus,
  reorderCachedStatuses,
  TASK_STATUS_INVALIDATIONS,
  useTaskStatusesEditor,
} from "./useTaskStatusesEditor";

const REVISION: TaskStatusOption = { id: "s1", name: "En revisión", closes: false, countsAsCompleted: false, sortOrder: 0 };
const ENTREGADO: TaskStatusOption = { id: "s2", name: "Entregado", closes: true, countsAsCompleted: true, sortOrder: 1 };

function setup() {
  const client = createTestQueryClient();
  client.setQueryData(qk.ajustes.page("estatus"), { statuses: [REVISION, ENTREGADO] });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useTaskStatusesEditor(), { wrapper });
  return { client, invalidate, hook };
}

function invalidatedKeys(spy: ReturnType<typeof vi.spyOn>): unknown[] {
  return spy.mock.calls.map((call: unknown[]) => (call[0] as { queryKey: unknown }).queryKey);
}

beforeEach(() => {
  vi.clearAllMocks();
  caps.canManageTaskStatuses = true;
});

describe("useTaskStatusesEditor", () => {
  it("reads the hydrated page data and makes no call on mount", () => {
    const { hook } = setup();
    expect(hook.result.current.statuses).toEqual([REVISION, ENTREGADO]);
    expect(pageData.getAjustesEstatusPageData).not.toHaveBeenCalled();
    expect(actions.fetchTaskStatusesAction).not.toHaveBeenCalled();
  });

  it("a create writes the result into the page and invalidates the catalog, Tareas and the other status readers", async () => {
    const created: TaskStatusOption = { id: "s3", name: "Aprobado", closes: false, countsAsCompleted: false, sortOrder: 2 };
    actions.createTaskStatusAction.mockResolvedValue({ ok: true, data: created });
    const { client, invalidate, hook } = setup();

    act(() => hook.result.current.openEditor(null));
    act(() => hook.result.current.setName("Aprobado"));
    let saved = false;
    await act(async () => {
      saved = await hook.result.current.save();
    });

    expect(saved).toBe(true);
    expect(actions.createTaskStatusAction).toHaveBeenCalledWith({
      name: "Aprobado",
      closes: false,
      countsAsCompleted: false,
      sortOrder: 2,
    });
    expect(client.getQueryData(qk.ajustes.page("estatus"))).toEqual({ statuses: [REVISION, ENTREGADO, created] });
    await waitFor(() => expect(invalidatedKeys(invalidate)).toEqual([...TASK_STATUS_INVALIDATIONS]));
    expect(invalidatedKeys(invalidate)).toContainEqual(qk.catalog.taskStatuses());
    expect(invalidatedKeys(invalidate)).toContainEqual(qk.tareas.all);
    // The list itself is written, not refetched.
    expect(invalidatedKeys(invalidate)).not.toContainEqual(qk.ajustes.page("estatus"));
    expect(pageData.getAjustesEstatusPageData).not.toHaveBeenCalled();
  });

  it("an update replaces the row in place", async () => {
    const renamed = { ...ENTREGADO, name: "Entregada" };
    actions.updateTaskStatusAction.mockResolvedValue({ ok: true, data: renamed });
    const { client, hook } = setup();

    act(() => hook.result.current.openEditor(ENTREGADO));
    act(() => hook.result.current.setName("Entregada"));
    await act(async () => {
      await hook.result.current.save();
    });

    expect(actions.updateTaskStatusAction).toHaveBeenCalledWith("s2", {
      name: "Entregada",
      closes: true,
      countsAsCompleted: true,
    });
    expect(client.getQueryData(qk.ajustes.page("estatus"))).toEqual({ statuses: [REVISION, renamed] });
  });

  it("a delete drops the row and invalidates the same keys", async () => {
    actions.deleteTaskStatusAction.mockResolvedValue({ ok: true, data: undefined });
    const { client, invalidate, hook } = setup();

    await act(async () => {
      await hook.result.current.remove(REVISION);
    });

    expect(actions.deleteTaskStatusAction).toHaveBeenCalledWith("s1");
    expect(client.getQueryData(qk.ajustes.page("estatus"))).toEqual({ statuses: [ENTREGADO] });
    await waitFor(() => expect(invalidatedKeys(invalidate)).toContainEqual(qk.tareas.all));
  });

  it("keeps the editor open with the status copy on a failed save, and leaves the list alone", async () => {
    actions.createTaskStatusAction.mockResolvedValue({ ok: false, error: "TASK_STATUS_NAME_TAKEN" });
    const { client, hook } = setup();

    act(() => hook.result.current.openEditor(null));
    act(() => hook.result.current.setName("En revisión"));
    let saved = true;
    await act(async () => {
      saved = await hook.result.current.save();
    });

    expect(saved).toBe(false);
    expect(hook.result.current.showEditor).toBe(true);
    expect(hook.result.current.formError).toBe("Ya existe un estatus con ese nombre.");
    expect(client.getQueryData(qk.ajustes.page("estatus"))).toEqual({ statuses: [REVISION, ENTREGADO] });
  });

  it("createQuick sends #completado to Completado and appends the status", async () => {
    const created: TaskStatusOption = { id: "s3", name: "Listo", closes: true, countsAsCompleted: true, sortOrder: 2 };
    actions.createTaskStatusAction.mockResolvedValue({ ok: true, data: created });
    const { client, hook } = setup();

    await act(async () => {
      await hook.result.current.createQuick("Listo #completado");
    });

    expect(actions.createTaskStatusAction).toHaveBeenCalledWith({
      name: "Listo",
      closes: true,
      countsAsCompleted: true,
      sortOrder: 2,
    });
    expect(client.getQueryData(qk.ajustes.page("estatus"))).toEqual({ statuses: [REVISION, ENTREGADO, created] });
  });

  it("reorder persists the new order", async () => {
    actions.reorderTaskStatusesAction.mockResolvedValue({ ok: true, data: undefined });
    const { hook } = setup();
    act(() => hook.result.current.reorder(["s2", "s1"]));
    await waitFor(() => expect(actions.reorderTaskStatusesAction).toHaveBeenCalledWith(["s2", "s1"]));
  });
});

describe("parseInlineStatus", () => {
  it("creates in En proceso by default and in Completado with #completado", () => {
    expect(parseInlineStatus("  Revisión cliente ")).toEqual({ name: "Revisión cliente", closes: false });
    expect(parseInlineStatus("Entregado #completado")).toEqual({ name: "Entregado", closes: true });
    expect(parseInlineStatus("#Completado Firmado")).toEqual({ name: "Firmado", closes: true });
    expect(parseInlineStatus("Pago#completado")).toEqual({ name: "Pago#completado", closes: false });
  });
});

describe("reorderCachedStatuses", () => {
  it("reorders the cached statuses, renumbers sortOrder and returns the previous data", async () => {
    const client = createTestQueryClient();
    const before = { statuses: [REVISION, ENTREGADO], baseCounts: { pendiente: 0, en_proceso: 0, completado: 0, bloqueado: 0 }, customUsage: {} };
    client.setQueryData(qk.ajustes.page("estatus"), before);

    const previous = await reorderCachedStatuses(client, ["s2", "s1"]);

    expect(previous).toBe(before);
    expect(client.getQueryData(qk.ajustes.page("estatus"))).toEqual({
      ...before,
      statuses: [
        { ...ENTREGADO, sortOrder: 0 },
        { ...REVISION, sortOrder: 1 },
      ],
    });
  });
});
