import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/layout/Header", () => ({ default: () => <div data-testid="header" /> }));
vi.mock("@/components/layout/Sidebar", () => ({ default: () => <div data-testid="sidebar" /> }));

const fetchScheduleAction = vi.fn();
const setTaskStatusAction = vi.fn();
const toggleTaskFlagAction = vi.fn();

vi.mock("@/lib/actions/schedule-actions", () => ({
  fetchScheduleAction: (...args: unknown[]) => fetchScheduleAction(...args),
  setTaskStatusAction: (...args: unknown[]) => setTaskStatusAction(...args),
  toggleTaskFlagAction: (...args: unknown[]) => toggleTaskFlagAction(...args),
}));

import CronogramaView from "./cronograma-view";
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

describe("CronogramaView — status cycling", () => {
  it("shows the status change immediately (optimistic) on success", async () => {
    const task = makeTask({ status: "pending" });
    const view = { data: makeData(task), today: "2026-09-18" };
    setTaskStatusAction.mockResolvedValue({ ok: true, status: "progress" });

    render(<CronogramaView projectId="p1" initialView={view} />);

    const statusButtons = screen.getAllByRole("button", { name: /Estado: Pendiente/ });
    fireEvent.click(statusButtons[0]);

    await waitFor(() => expect(setTaskStatusAction).toHaveBeenCalledWith("t1", "progress", "pending"));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Estado: En proceso/ }).length).toBeGreaterThan(0));
  });

  it("reverts the optimistic update and shows an error on conflict", async () => {
    const task = makeTask({ status: "pending" });
    const view = { data: makeData(task), today: "2026-09-18" };
    setTaskStatusAction.mockResolvedValue({ ok: false, conflict: true, current: "done" });
    // loadSchedule() re-fetches after a conflict — return the server's real current state.
    fetchScheduleAction.mockResolvedValue({ data: makeData(makeTask({ status: "done" })), today: "2026-09-18" });

    render(<CronogramaView projectId="p1" initialView={view} />);

    const statusButtons = screen.getAllByRole("button", { name: /Estado: Pendiente/ });
    fireEvent.click(statusButtons[0]);

    await waitFor(() => expect(screen.getByText(/ya cambió de estado/)).toBeTruthy());
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Estado: Realizada/ }).length).toBeGreaterThan(0));
  });

  it("reverts and shows an error when the action fails outright", async () => {
    const task = makeTask({ status: "pending" });
    const view = { data: makeData(task), today: "2026-09-18" };
    setTaskStatusAction.mockResolvedValue({ ok: false, conflict: false, error: "No tienes permiso para editar este cronograma." });
    fetchScheduleAction.mockResolvedValue({ data: makeData(makeTask({ status: "pending" })), today: "2026-09-18" });

    render(<CronogramaView projectId="p1" initialView={view} />);

    const statusButtons = screen.getAllByRole("button", { name: /Estado: Pendiente/ });
    fireEvent.click(statusButtons[0]);

    await waitFor(() => expect(screen.getByText("No tienes permiso para editar este cronograma.")).toBeTruthy());
  });
});
