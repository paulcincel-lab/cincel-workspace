import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/proyectos/p1/cronograma",
}));

const getProyectoCronogramaData = vi.fn();
const setTaskStatusAction = vi.fn();
const toggleTaskFlagAction = vi.fn();

vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({
  getProyectoCronogramaData: (...args: unknown[]) => getProyectoCronogramaData(...args),
}));

vi.mock("@/lib/actions/schedule-actions", () => ({
  setTaskStatusAction: (...args: unknown[]) => setTaskStatusAction(...args),
  toggleTaskFlagAction: (...args: unknown[]) => toggleTaskFlagAction(...args),
  addImprevistoAction: vi.fn(),
  deleteImprevistoAction: vi.fn(),
  previewImportScheduleAction: vi.fn(),
  commitImportScheduleAction: vi.fn(),
  importLegacyStateAction: vi.fn(),
}));

import CronogramaView from "./cronograma-view";
import type { ScheduleViewData } from "@/lib/actions/schedule-actions";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { CronogramaData, ScheduleTask } from "@/lib/types/schedule";

function makeTask(overrides: Partial<ScheduleTask> = {}): ScheduleTask {
  return {
    id: "t1",
    stableKey: "PB-abc",
    legacyId: "PB-1",
    planta: "PB",
    seccion: "Preliminares",
    responsable: "Chava",
    inicio: "2026-09-14",
    fin: "2026-09-20",
    tarea: "Tarea interactiva de prueba",
    status: "pending",
    flagged: false,
    ...overrides,
  };
}

function makeData(task: ScheduleTask): CronogramaData {
  return {
    project: { id: "p1", name: "Proyecto Prueba", address: null },
    schedule: { id: "s1", version: 1, paymentCalendarLabel: null },
    tasks: [task],
    payments: [],
    imprevistos: [],
    adicionales: [],
  };
}

const KEY = qk.proyectos.cronograma("p1");

/** Renders the tab over a cache that already holds `view`, as after the page's prefetch. */
function renderView(view: ScheduleViewData) {
  const client = createTestQueryClient();
  client.setQueryData(KEY, view);
  return renderWithQueryClient(<CronogramaView projectId="p1" />, { client });
}

const cachedTask = (client: ReturnType<typeof createTestQueryClient>) =>
  client.getQueryData<ScheduleViewData>(KEY)!.data.tasks[0];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CronogramaView — status cycling", () => {
  it("shows the status change immediately (optimistic) on success", async () => {
    setTaskStatusAction.mockResolvedValue({ ok: true, status: "progress" });
    renderView({ data: makeData(makeTask({ status: "pending" })), today: "2026-09-18" });

    fireEvent.click(screen.getAllByRole("button", { name: /Estado: Pendiente/ })[0]);

    await waitFor(() => expect(setTaskStatusAction).toHaveBeenCalledWith("t1", "progress", "pending"));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Estado: En proceso/ }).length).toBeGreaterThan(0));
  });

  it("keeps the new status after the save settles (#947)", async () => {
    let resolve!: (value: unknown) => void;
    setTaskStatusAction.mockReturnValue(new Promise((r) => (resolve = r)));
    const { client } = renderView({ data: makeData(makeTask({ status: "pending" })), today: "2026-09-18" });

    fireEvent.click(screen.getAllByRole("button", { name: /Estado: Pendiente/ })[0]);
    // Optimistic: the cache already holds the new value while the POST is in flight.
    await waitFor(() => expect(cachedTask(client).status).toBe("progress"));

    resolve({ ok: true, status: "progress" });
    await waitFor(() => expect(client.isMutating()).toBe(0));

    expect(cachedTask(client).status).toBe("progress");
    expect(screen.getAllByRole("button", { name: /Estado: En proceso/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Estado: Pendiente/ })).toHaveLength(0);
    // No refetch of the schedule: the settled value is the optimistic one.
    expect(getProyectoCronogramaData).not.toHaveBeenCalled();
  });

  it("invalidates Resumen and the project list on settle, not the schedule", async () => {
    setTaskStatusAction.mockResolvedValue({ ok: true, status: "progress" });
    const { client } = renderView({ data: makeData(makeTask({ status: "pending" })), today: "2026-09-18" });
    const invalidate = vi.spyOn(client, "invalidateQueries");

    fireEvent.click(screen.getAllByRole("button", { name: /Estado: Pendiente/ })[0]);
    await waitFor(() => expect(client.isMutating()).toBe(0));

    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual([qk.proyectos.resumen("p1"), qk.proyectos.list()]);
  });

  it("rolls back, refetches the schedule and shows the conflict message on conflict", async () => {
    setTaskStatusAction.mockResolvedValue({ ok: false, conflict: true, current: "done" });
    // The refetch after a conflict returns the server's real current state.
    getProyectoCronogramaData.mockResolvedValue({ data: makeData(makeTask({ status: "done" })), today: "2026-09-18" });
    const { client } = renderView({ data: makeData(makeTask({ status: "pending" })), today: "2026-09-18" });

    fireEvent.click(screen.getAllByRole("button", { name: /Estado: Pendiente/ })[0]);

    await waitFor(() => expect(screen.getByText(/ya cambió de estado \(ahora: Realizada\)/)).toBeTruthy());
    await waitFor(() => expect(getProyectoCronogramaData).toHaveBeenCalledWith({ id: "p1" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Estado: Realizada/ }).length).toBeGreaterThan(0));
    expect(cachedTask(client).status).toBe("done");
  });

  it("rolls back and shows the action's error when it fails outright", async () => {
    setTaskStatusAction.mockResolvedValue({ ok: false, conflict: false, error: "No tienes permiso para editar este cronograma." });
    const { client } = renderView({ data: makeData(makeTask({ status: "pending" })), today: "2026-09-18" });

    fireEvent.click(screen.getAllByRole("button", { name: /Estado: Pendiente/ })[0]);

    await waitFor(() => expect(screen.getByText("No tienes permiso para editar este cronograma.")).toBeTruthy());
    await waitFor(() => expect(cachedTask(client).status).toBe("pending"));
    expect(screen.getAllByRole("button", { name: /Estado: Pendiente/ }).length).toBeGreaterThan(0);
    expect(getProyectoCronogramaData).not.toHaveBeenCalled();
  });
});

describe("CronogramaView — flag", () => {
  it("keeps the flag after the save settles", async () => {
    toggleTaskFlagAction.mockResolvedValue({ ok: true, data: { flagged: true } });
    const { client } = renderView({ data: makeData(makeTask({ flagged: false })), today: "2026-09-18" });

    fireEvent.click(screen.getAllByRole("button", { name: "Marcar atención especial" })[0]);

    await waitFor(() => expect(toggleTaskFlagAction).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(cachedTask(client).flagged).toBe(true);
    expect(screen.getAllByRole("button", { name: "Quitar atención especial" }).length).toBeGreaterThan(0);
  });

  it("rolls the flag back and shows the error on { ok: false }", async () => {
    toggleTaskFlagAction.mockResolvedValue({ ok: false, error: "Tarea no encontrada." });
    const { client } = renderView({ data: makeData(makeTask({ flagged: false })), today: "2026-09-18" });

    fireEvent.click(screen.getAllByRole("button", { name: "Marcar atención especial" })[0]);

    await waitFor(() => expect(screen.getByText("Tarea no encontrada.")).toBeTruthy());
    expect(cachedTask(client).flagged).toBe(false);
  });
});

describe("CronogramaView — no schedule", () => {
  it("shows the empty state for a null schedule and calls nothing", () => {
    const client = createTestQueryClient();
    client.setQueryData(KEY, null);
    renderWithQueryClient(<CronogramaView projectId="p1" />, { client });
    expect(screen.getByText("Este proyecto todavía no tiene un cronograma importado")).toBeTruthy();
    expect(getProyectoCronogramaData).not.toHaveBeenCalled();
  });
});
