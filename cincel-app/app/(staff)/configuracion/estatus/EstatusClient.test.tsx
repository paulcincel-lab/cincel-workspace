// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { TaskStatusOption } from "@/lib/types/core";

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => null,
}));

vi.mock("@/lib/auth/permissions", () => ({
  resolveTaskStatusesCapabilities: () => ({ canViewTaskStatuses: true, canManageTaskStatuses: true }),
}));

const actions = vi.hoisted(() => ({
  fetchTaskStatusesAction: vi.fn(),
  createTaskStatusAction: vi.fn(),
  updateTaskStatusAction: vi.fn(),
  deleteTaskStatusAction: vi.fn(),
}));
vi.mock("@/lib/actions/task-statuses-actions", () => actions);

import { EstatusClient } from "./EstatusClient";

const REVISION: TaskStatusOption = { id: "s1", name: "En revisión", closes: false, countsAsCompleted: false, sortOrder: 0 };
const ENTREGADO: TaskStatusOption = { id: "s2", name: "Entregado", closes: true, countsAsCompleted: true, sortOrder: 1 };
const CANCELADO: TaskStatusOption = { id: "s3", name: "Cancelado", closes: true, countsAsCompleted: false, sortOrder: 2 };
const STATUSES = [REVISION, ENTREGADO, CANCELADO];

function row(name: string) {
  return screen.getAllByRole("row").find((r) => r.textContent?.includes(name))!;
}

function cells(name: string) {
  return within(row(name)).getAllByRole("cell").map((c) => c.textContent);
}

function countsSwitch() {
  return screen.getByRole("switch", { name: /Cuenta como completada/ });
}

function closesCheckbox() {
  return screen.getByRole("checkbox", { name: /Cierra la tarea/ });
}

describe("EstatusClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.fetchTaskStatusesAction.mockResolvedValue(STATUSES);
    actions.updateTaskStatusAction.mockResolvedValue(CANCELADO);
    actions.createTaskStatusAction.mockResolvedValue(CANCELADO);
  });

  afterEach(cleanup);

  it("shows a 'Cuenta como completada' column with Sí / No", () => {
    render(<EstatusClient initialStatuses={STATUSES} />);

    expect(screen.getByRole("columnheader", { name: "Cuenta como completada" })).toBeTruthy();
    expect(cells("En revisión").filter((c) => c === "No")).toHaveLength(2);
    expect(cells("Entregado").filter((c) => c === "Sí")).toHaveLength(2);
    const cancelado = cells("Cancelado");
    expect(cancelado).toContain("Sí");
    expect(cancelado).toContain("No");
  });

  it("disables the switch while the status does not close the task", () => {
    render(<EstatusClient initialStatuses={STATUSES} />);
    fireEvent.click(row("En revisión"));

    expect(countsSwitch().getAttribute("aria-checked")).toBe("false");
    expect(countsSwitch().hasAttribute("data-disabled")).toBe(true);
    expect(screen.getByText(/Apágalo para estatus como Cancelado/)).toBeTruthy();
  });

  it("loads the saved value and persists turning it off", async () => {
    render(<EstatusClient initialStatuses={STATUSES} />);
    fireEvent.click(row("Entregado"));

    expect(countsSwitch().getAttribute("aria-checked")).toBe("true");
    fireEvent.click(countsSwitch());
    expect(countsSwitch().getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(actions.updateTaskStatusAction).toHaveBeenCalledWith("s2", {
        name: "Entregado",
        closes: true,
        countsAsCompleted: false,
      }),
    );
    // The table reflects what the server returns after the save.
    await waitFor(() => expect(actions.fetchTaskStatusesAction).toHaveBeenCalledTimes(2));
  });

  it("resets the switch to off when 'Cierra la tarea' is turned off", async () => {
    render(<EstatusClient initialStatuses={STATUSES} />);
    fireEvent.click(row("Entregado"));

    fireEvent.click(closesCheckbox());
    expect(countsSwitch().getAttribute("aria-checked")).toBe("false");
    expect(countsSwitch().hasAttribute("data-disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(actions.updateTaskStatusAction).toHaveBeenCalledWith("s2", {
        name: "Entregado",
        closes: false,
        countsAsCompleted: false,
      }),
    );
  });

  it("sends the value when creating a closing status", async () => {
    render(<EstatusClient initialStatuses={STATUSES} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo estatus" }));

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Cancelado 2" } });
    fireEvent.click(closesCheckbox());
    expect(countsSwitch().getAttribute("aria-checked")).toBe("true");
    fireEvent.click(countsSwitch());
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(actions.createTaskStatusAction).toHaveBeenCalledWith({
        name: "Cancelado 2",
        closes: true,
        countsAsCompleted: false,
        sortOrder: 3,
      }),
    );
  });
});
