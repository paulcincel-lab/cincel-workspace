// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";
import type { StartTramoResult } from "@/lib/types/core";

const actions = vi.hoisted(() => ({
  previewStartTramoAction: vi.fn(),
  startTramoAction: vi.fn(),
  undoStartTramoAction: vi.fn(),
}));
vi.mock("@/lib/actions/tramo-start-actions", () => actions);
vi.mock("@/lib/actions/page-data/tareas-actions", () => ({ getTareasStartSlotData: vi.fn() }));

const sonner = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("sonner", () => sonner);

import { notifyTramoStarted, START_TRAMO_UNDO_MS, useUndoStartTramo } from "./start-tramo-toast";
import { ReadyToStartCard } from "./ReadyToStartCard";

const workflow = { id: "w-diseno", key: "diseno", name: "Diseño", sortOrder: 2 };

const result: StartTramoResult = {
  batchId: "b-1",
  createdCount: 5,
  skippedCount: 0,
  stageCreated: true,
  project: { id: "p-1", name: "Casa Roble" },
  workflow,
};

const UNDO_KEYS = [
  qk.tareas.startSlot("w-diseno"),
  qk.tareas.all,
  qk.proyectos.list(),
  qk.proyectos.detail("p-1"),
  qk.catalog.projectOptions(),
  qk.inicio(),
  qk.shell.badges(),
];

type ToastOptions = { duration?: number; action?: { label: string; onClick: () => void } };

function lastToastOptions(): ToastOptions {
  const call = sonner.toast.mock.calls.find((c) => c[1]?.action);
  return (call?.[1] ?? {}) as ToastOptions;
}

function renderUndo() {
  const client = createTestQueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useUndoStartTramo("Diseño"), { wrapper });
  return { hook, invalidate };
}

beforeEach(() => {
  sonner.toast.mockReset();
  sonner.toast.success.mockReset();
  sonner.toast.error.mockReset();
  for (const fn of Object.values(actions)) fn.mockReset();
});
afterEach(cleanup);

describe("notifyTramoStarted", () => {
  it("shows the created count with a 10 s Deshacer action", () => {
    notifyTramoStarted(result, { undo: vi.fn() });

    expect(sonner.toast).toHaveBeenCalledWith(
      "Se crearon 5 tareas de Diseño en Casa Roble.",
      expect.objectContaining({ duration: START_TRAMO_UNDO_MS }),
    );
    expect(START_TRAMO_UNDO_MS).toBe(10_000);
    expect(lastToastOptions().action?.label).toBe("Deshacer");
  });

  it("Deshacer hands the batch, project and etapa to the undo mutation", () => {
    const undo = vi.fn();
    notifyTramoStarted(result, { undo });

    lastToastOptions().action?.onClick();
    expect(undo).toHaveBeenCalledWith({ batchId: "b-1", projectId: "p-1", workflowId: "w-diseno" });
  });

  it("with nothing created only confirms the start, without Deshacer", () => {
    notifyTramoStarted({ ...result, batchId: null, createdCount: 0 }, { undo: vi.fn() });

    expect(sonner.toast).toHaveBeenCalledTimes(1);
    expect(sonner.toast).toHaveBeenCalledWith("Diseño iniciado en Casa Roble.");
  });
});

describe("useUndoStartTramo", () => {
  it("undoes the batch, confirms and invalidates what the start invalidated", async () => {
    actions.undoStartTramoAction.mockResolvedValue({ ok: true, data: undefined });
    const { hook, invalidate } = renderUndo();

    await act(async () => {
      await hook.result.current.mutateAsync({ batchId: "b-1", projectId: "p-1", workflowId: "w-diseno" });
    });

    expect(actions.undoStartTramoAction).toHaveBeenCalledWith("b-1");
    expect(sonner.toast.success).toHaveBeenCalledWith("Se deshizo el inicio de Diseño.");
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(UNDO_KEYS);
  });

  it("reports TOUCHED and still invalidates (the screen is stale)", async () => {
    actions.undoStartTramoAction.mockResolvedValue({ ok: false, error: "TOUCHED" });
    const { hook, invalidate } = renderUndo();

    act(() => {
      hook.result.current.mutate({ batchId: "b-1", projectId: "p-1", workflowId: "w-diseno" });
    });

    await waitFor(() =>
      expect(sonner.toast.error).toHaveBeenCalledWith(
        "No se puede deshacer: ya se editó una de las tareas creadas o Diseño se inició de nuevo después.",
      ),
    );
    expect(sonner.toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(UNDO_KEYS));
  });

  it("still runs after the component that created it unmounted (a late toast click)", async () => {
    actions.undoStartTramoAction.mockResolvedValue({ ok: true, data: undefined });
    const { hook, invalidate } = renderUndo();
    const mutate = hook.result.current.mutate;
    hook.unmount();

    act(() => {
      mutate({ batchId: "b-1", projectId: "p-1", workflowId: "w-diseno" });
    });

    await waitFor(() => expect(sonner.toast.success).toHaveBeenCalledWith("Se deshizo el inicio de Diseño."));
    expect(actions.undoStartTramoAction).toHaveBeenCalledWith("b-1");
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(UNDO_KEYS.length));
  });
});

describe("ReadyToStartCard", () => {
  const ready = [
    {
      project: { id: "p-1", name: "Casa Roble" },
      currentTramo: null,
      readySince: "2026-10-30T12:00:00.000Z",
      pending: null,
    },
  ];

  it("lists ready projects with Listo desde and an Iniciar button", () => {
    const onStart = vi.fn();
    render(<ReadyToStartCard workflow={workflow} ready={ready} canStart onStart={onStart} />);

    expect(screen.getByText("Listos para iniciar (1)")).toBeTruthy();
    expect(screen.getByText("Listo desde 30-10-2026")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar Diseño en Casa Roble" }));
    expect(onStart).toHaveBeenCalledWith("p-1");
  });

  it("shows the empty copy", () => {
    render(<ReadyToStartCard workflow={workflow} ready={[]} canStart onStart={vi.fn()} />);
    expect(screen.getByText("No hay proyectos listos para iniciar Diseño.")).toBeTruthy();
  });

  it("shows only a read-only count without canCreateActivity", () => {
    render(<ReadyToStartCard workflow={workflow} ready={ready} canStart={false} onStart={vi.fn()} />);
    expect(screen.getByText("Listos para iniciar: 1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Iniciar/ })).toBeNull();
  });
});
