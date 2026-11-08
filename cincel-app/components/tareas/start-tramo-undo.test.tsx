// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { StartTramoResult } from "@/lib/types/core";

const actions = vi.hoisted(() => ({
  previewStartTramoAction: vi.fn(),
  startTramoAction: vi.fn(),
  undoStartTramoAction: vi.fn(),
  fetchTramoBoardAction: vi.fn(),
}));
vi.mock("@/lib/actions/tramo-start-actions", () => actions);

const sonner = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("sonner", () => sonner);

import { notifyTramoStarted, START_TRAMO_UNDO_MS } from "./start-tramo-toast";
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

type ToastOptions = { duration?: number; action?: { label: string; onClick: () => void } };

function lastToastOptions(): ToastOptions {
  const call = sonner.toast.mock.calls.find((c) => c[1]?.action);
  return (call?.[1] ?? {}) as ToastOptions;
}

beforeEach(() => {
  sonner.toast.mockReset();
  for (const fn of Object.values(actions)) fn.mockReset();
});
afterEach(cleanup);

describe("notifyTramoStarted", () => {
  it("shows the created count with a 10 s Deshacer action", () => {
    notifyTramoStarted(result, { refresh: vi.fn() });

    expect(sonner.toast).toHaveBeenCalledWith(
      "Se crearon 5 tareas de Diseño en Casa Roble.",
      expect.objectContaining({ duration: START_TRAMO_UNDO_MS }),
    );
    expect(START_TRAMO_UNDO_MS).toBe(10_000);
    expect(lastToastOptions().action?.label).toBe("Deshacer");
  });

  it("Deshacer undoes the batch, confirms and refreshes", async () => {
    actions.undoStartTramoAction.mockResolvedValue(undefined);
    const refresh = vi.fn();
    notifyTramoStarted(result, { refresh });

    lastToastOptions().action?.onClick();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(actions.undoStartTramoAction).toHaveBeenCalledWith("b-1");
    expect(sonner.toast).toHaveBeenLastCalledWith("Se deshizo el inicio de Diseño.");
  });

  it("Deshacer after a task was edited reports TOUCHED", async () => {
    actions.undoStartTramoAction.mockRejectedValue(new Error("TOUCHED"));
    const refresh = vi.fn();
    notifyTramoStarted(result, { refresh });

    lastToastOptions().action?.onClick();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(sonner.toast).toHaveBeenLastCalledWith("No se puede deshacer: ya se editó una de las tareas creadas.");
  });

  it("with nothing created only confirms the start, without Deshacer", () => {
    notifyTramoStarted({ ...result, batchId: null, createdCount: 0 }, { refresh: vi.fn() });

    expect(sonner.toast).toHaveBeenCalledTimes(1);
    expect(sonner.toast).toHaveBeenCalledWith("Diseño iniciado en Casa Roble.");
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
