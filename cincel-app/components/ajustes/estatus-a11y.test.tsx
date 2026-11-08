// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { TaskStatusOption } from "@/lib/types/core";
import { THEME_IDS } from "@/lib/ui/themes";

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => null,
}));

const caps = vi.hoisted(() => ({ canViewTaskStatuses: true, canManageTaskStatuses: true }));
vi.mock("@/lib/auth/permissions", () => ({
  resolveTaskStatusesCapabilities: () => caps,
}));

const actions = vi.hoisted(() => ({
  fetchTaskStatusesAction: vi.fn(),
  createTaskStatusAction: vi.fn(),
  updateTaskStatusAction: vi.fn(),
  deleteTaskStatusAction: vi.fn(),
}));
vi.mock("@/lib/actions/task-statuses-actions", () => actions);

const pageData = vi.hoisted(() => ({ getAjustesEstatusPageData: vi.fn() }));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => pageData);

vi.mock("@/components/patterns/SettingsSection", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));
vi.mock("@/components/patterns/SettingsRow", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));
vi.mock("@/components/patterns/FormDialog", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));

import { EstatusSettings } from "./EstatusSettings";

const REVISION: TaskStatusOption = { id: "s1", name: "En revisión", closes: false, countsAsCompleted: false, sortOrder: 0 };
const ENTREGADO: TaskStatusOption = { id: "s2", name: "Entregado", closes: true, countsAsCompleted: true, sortOrder: 1 };
const CANCELADO: TaskStatusOption = { id: "s3", name: "Cancelado", closes: true, countsAsCompleted: false, sortOrder: 2 };
const STATUSES = [REVISION, ENTREGADO, CANCELADO];

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

/** Renders the page under a client hydrated with the statuses, as the page's prefetch leaves it. */
function renderPage(statuses: TaskStatusOption[] = STATUSES) {
  const client = createTestQueryClient();
  client.setQueryData(qk.ajustes.page("estatus"), { statuses });
  return renderWithQueryClient(<EstatusSettings />, { client });
}

function section(name: string) {
  return screen.getByRole("region", { name });
}

function applyTheme(theme: string, mode: "light" | "dark") {
  const root = document.documentElement;
  root.setAttribute("data-theme-id", theme);
  root.setAttribute("data-theme", mode);
  root.classList.toggle("dark", mode === "dark");
}

describe("Ajustes › Estatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    caps.canManageTaskStatuses = true;
    actions.fetchTaskStatusesAction.mockResolvedValue(STATUSES);
    actions.createTaskStatusAction.mockResolvedValue(REVISION);
    actions.updateTaskStatusAction.mockResolvedValue(ENTREGADO);
    actions.deleteTaskStatusAction.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    const root = document.documentElement;
    root.removeAttribute("data-theme-id");
    root.removeAttribute("data-theme");
    root.classList.remove("dark");
  });

  for (const theme of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      it(`has no serious or critical axe violations (${theme}, ${mode})`, async () => {
        applyTheme(theme, mode);
        const { container } = renderPage();
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }

  it("has no serious or critical axe violations with the editor open", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Editar Entregado" }));
    expect(screen.getByRole("dialog", { name: "Editar estatus" })).toBeTruthy();
    expect(await seriousViolations(document.body)).toEqual([]);
  });

  it("groups the custom statuses under the base whose color they take", () => {
    renderPage();

    for (const base of ["Pendiente", "En proceso", "Completado", "Bloqueado"]) {
      expect(section(base)).toBeTruthy();
    }
    expect(within(section("En proceso")).getByRole("group", { name: "En revisión" })).toBeTruthy();
    expect(within(section("Completado")).getByRole("group", { name: "Entregado" })).toBeTruthy();
    expect(within(section("Completado")).getByRole("group", { name: "Cancelado" })).toBeTruthy();
    expect(within(section("Completado")).getByText("Cierra la tarea · no cuenta como completada")).toBeTruthy();
    // Custom statuses only sit under En proceso or Completado.
    expect(within(section("Pendiente")).queryByRole("button", { name: /Agregar estatus/ })).toBeNull();
    expect(within(section("Bloqueado")).queryByRole("button", { name: /Agregar estatus/ })).toBeNull();
  });

  it("'Agregar estatus en Completado' creates a closing status with the same payload as before", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Agregar estatus en Completado" }));

    const dialog = screen.getByRole("dialog", { name: "Nuevo estatus" });
    expect(within(dialog).getByRole("checkbox", { name: /Cierra la tarea/ }).getAttribute("aria-checked")).toBe("true");
    expect(within(dialog).getByRole("switch", { name: /Cuenta como completada/ }).getAttribute("aria-checked")).toBe(
      "true",
    );
    fireEvent.change(within(dialog).getByLabelText("Nombre"), { target: { value: "Aprobado" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(actions.createTaskStatusAction).toHaveBeenCalledWith({
        name: "Aprobado",
        closes: true,
        countsAsCompleted: true,
        sortOrder: 3,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("'Agregar estatus en En proceso' starts as an open status", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Agregar estatus en En proceso" }));

    const dialog = screen.getByRole("dialog", { name: "Nuevo estatus" });
    expect(within(dialog).getByRole("checkbox", { name: /Cierra la tarea/ }).getAttribute("aria-checked")).toBe("false");
    expect(
      within(dialog).getByRole("switch", { name: /Cuenta como completada/ }).hasAttribute("data-disabled"),
    ).toBe(true);
  });

  it("edits a status with the existing update action", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Editar Entregado" }));

    const dialog = screen.getByRole("dialog", { name: "Editar estatus" });
    fireEvent.click(within(dialog).getByRole("switch", { name: /Cuenta como completada/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(actions.updateTaskStatusAction).toHaveBeenCalledWith("s2", {
        name: "Entregado",
        closes: true,
        countsAsCompleted: false,
      }),
    );
  });

  it("shows the existing copy when the name is taken", async () => {
    actions.createTaskStatusAction.mockRejectedValueOnce(new Error("TASK_STATUS_NAME_TAKEN"));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Agregar estatus en En proceso" }));

    const dialog = screen.getByRole("dialog", { name: "Nuevo estatus" });
    fireEvent.change(within(dialog).getByLabelText("Nombre"), { target: { value: "En revisión" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toBe("Ya existe un estatus con ese nombre."));
  });

  it("asks before deleting and then calls the existing delete action", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Cancelado" }));

    const dialog = screen.getByRole("dialog", { name: '¿Eliminar el estatus "Cancelado"?' });
    expect(within(dialog).getByText('Las tareas que lo usan pasarán a "Completado".')).toBeTruthy();
    expect(actions.deleteTaskStatusAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(actions.deleteTaskStatusAction).toHaveBeenCalledWith("s3"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("reads the hydrated list: no client call on mount", () => {
    renderPage();
    expect(screen.getByRole("group", { name: "En revisión" })).toBeTruthy();
    expect(pageData.getAjustesEstatusPageData).not.toHaveBeenCalled();
    expect(actions.fetchTaskStatusesAction).not.toHaveBeenCalled();
  });

  it("shows a created status from the result, without refetching the list", async () => {
    const APROBADO: TaskStatusOption = { id: "s4", name: "Aprobado", closes: true, countsAsCompleted: true, sortOrder: 3 };
    actions.createTaskStatusAction.mockResolvedValueOnce({ ok: true, data: APROBADO });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Agregar estatus en Completado" }));
    const dialog = screen.getByRole("dialog", { name: "Nuevo estatus" });
    fireEvent.change(within(dialog).getByLabelText("Nombre"), { target: { value: "Aprobado" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(within(section("Completado")).getByRole("group", { name: "Aprobado" })).toBeTruthy());
    expect(pageData.getAjustesEstatusPageData).not.toHaveBeenCalled();
    expect(actions.fetchTaskStatusesAction).not.toHaveBeenCalled();
  });

  it("shows the status copy for a failed result (production keeps the code)", async () => {
    actions.createTaskStatusAction.mockResolvedValueOnce({ ok: false, error: "TASK_STATUS_NAME_TAKEN" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Agregar estatus en En proceso" }));
    const dialog = screen.getByRole("dialog", { name: "Nuevo estatus" });
    fireEvent.change(within(dialog).getByLabelText("Nombre"), { target: { value: "En revisión" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toBe("Ya existe un estatus con ese nombre."));
  });

  it("removes a deleted status from the list", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Cancelado" }));
    const dialog = screen.getByRole("dialog", { name: '¿Eliminar el estatus "Cancelado"?' });
    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(screen.queryByRole("group", { name: "Cancelado" })).toBeNull());
    expect(pageData.getAjustesEstatusPageData).not.toHaveBeenCalled();
  });

  it("renders no edit entry point without the manage capability", () => {
    caps.canManageTaskStatuses = false;
    renderPage();

    expect(screen.queryByRole("button", { name: /Agregar estatus/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar|Eliminar/ })).toBeNull();
  });
});
