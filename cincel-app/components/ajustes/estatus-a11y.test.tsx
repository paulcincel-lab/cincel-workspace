// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { AjustesEstatusPageData } from "@/lib/types/ajustes-catalogs";
import type { TaskStatusOption } from "@/lib/types/core";
import { THEME_IDS } from "@/lib/ui/themes";

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => null,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const caps = vi.hoisted(() => ({ canViewTaskStatuses: true, canManageTaskStatuses: true }));
vi.mock("@/lib/auth/permissions", () => ({
  resolveTaskStatusesCapabilities: () => caps,
}));

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

import { EstatusSettings } from "./EstatusSettings";

const REVISION: TaskStatusOption = { id: "s1", name: "En revisión", closes: false, countsAsCompleted: false, sortOrder: 0 };
const ENTREGADO: TaskStatusOption = { id: "s2", name: "Entregado", closes: true, countsAsCompleted: true, sortOrder: 1 };
const CANCELADO: TaskStatusOption = { id: "s3", name: "Cancelado", closes: true, countsAsCompleted: false, sortOrder: 2 };
const STATUSES = [REVISION, ENTREGADO, CANCELADO];

const PAGE: AjustesEstatusPageData = {
  statuses: STATUSES,
  baseCounts: { pendiente: 7, en_proceso: 5, completado: 20, bloqueado: 0 },
  customUsage: { s2: { tasks: 12, projects: 3 }, s3: { tasks: 2, projects: 1 } },
};

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

/** Renders the page under a client hydrated with the page data, as the page's prefetch leaves it. */
function renderPage(data: AjustesEstatusPageData = PAGE) {
  const client = createTestQueryClient();
  client.setQueryData(qk.ajustes.page("estatus"), data);
  return renderWithQueryClient(<EstatusSettings />, { client });
}

function section(name: string) {
  return screen.getByRole("region", { name });
}

/** The custom status row whose name is `name`. */
function rowOf(name: string): HTMLElement {
  const row = within(section("Estatus personalizados"))
    .getAllByRole("row")
    .find((r) => within(r).queryByText(name, { selector: "span" }) !== null);
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

async function openRowAction(name: string, action: string) {
  fireEvent.click(screen.getByRole("button", { name: `Acciones de ${name}` }));
  fireEvent.click(await screen.findByRole("menuitem", { name: action }));
}

function editorPanel(title = "Editar estatus") {
  return screen.getByRole("complementary", { name: title });
}

function pressOn(name: string, key: string) {
  fireEvent.keyDown(screen.getByRole("button", { name }), { key });
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
    actions.createTaskStatusAction.mockResolvedValue({ ok: true, data: REVISION });
    actions.updateTaskStatusAction.mockResolvedValue({ ok: true, data: ENTREGADO });
    actions.deleteTaskStatusAction.mockResolvedValue({ ok: true, data: undefined });
    actions.reorderTaskStatusesAction.mockResolvedValue({ ok: true, data: undefined });
    pageData.getAjustesEstatusPageData.mockResolvedValue(PAGE);
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
    await openRowAction("Entregado", "Editar");
    expect(editorPanel()).toBeTruthy();
    expect(await seriousViolations(document.body)).toEqual([]);
  });

  it("lists the base statuses read-only with their color, task counts and customs", () => {
    renderPage();
    const base = section("Estatus base");
    const rows = within(base).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      "PendienteÁmbarNo7—",
      "En procesoVioletaNo51",
      "CompletadoAzulSí202",
      "BloqueadoRojo · reservadoNo0—",
    ]);
    expect(within(base).queryByRole("button", { name: /Acciones de/ })).toBeNull();
  });

  it("lists the custom statuses with their base, close copy and task count", () => {
    renderPage();
    expect(within(section("Estatus personalizados")).getByLabelText("3 en total").textContent).toBe("3");
    expect(rowOf("En revisión").textContent).toContain("En proceso");
    expect(rowOf("En revisión").textContent).toContain("No cierra la tarea");
    expect(rowOf("Entregado").textContent).toContain("Completado");
    expect(rowOf("Entregado").textContent).toContain("12");
  });

  it("shows the Nuevo pill for 24 h after creation", () => {
    const fresh = { ...REVISION, createdAt: new Date(Date.now() - 60_000).toISOString() };
    const old = { ...ENTREGADO, createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() };
    renderPage({ ...PAGE, statuses: [fresh, old] });
    expect(within(rowOf("En revisión")).getByText("Nuevo")).toBeTruthy();
    expect(within(rowOf("Entregado")).queryByText("Nuevo")).toBeNull();
  });

  it("shows the empty copy and the inline add row without custom statuses", () => {
    renderPage({ ...PAGE, statuses: [] });
    expect(screen.getByText("Aún no hay estatus personalizados.")).toBeTruthy();
    expect(screen.getByLabelText("Nuevo estatus personalizado")).toBeTruthy();
  });

  it("'Nuevo estatus' opens the editor and creates an open status under En proceso", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo estatus" }));
    const panel = editorPanel("Nuevo estatus");
    expect(within(panel).getByRole("radio", { name: "En proceso" }).getAttribute("aria-checked")).toBe("true");
    // Only a Completado status can count as completed.
    expect(within(panel).queryByRole("switch", { name: "Cuenta como completada" })).toBeNull();
    expect(within(panel).getByText("VISTA PREVIA")).toBeTruthy();
    expect(within(panel).getByText("Planos de instalación eléctrica")).toBeTruthy();

    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Aprobado" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(actions.createTaskStatusAction).toHaveBeenCalledWith({
        name: "Aprobado",
        closes: false,
        countsAsCompleted: false,
        sortOrder: 3,
      }),
    );
  });

  it("base Completado maps to closes and shows the counts-as-completed switch", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo estatus" }));
    const panel = editorPanel("Nuevo estatus");
    fireEvent.click(within(panel).getByRole("radio", { name: "Completado" }));

    const toggle = await within(panel).findByRole("switch", { name: "Cuenta como completada" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(within(panel).getByText("Las tareas en este estatus se cierran y dejan de vencer.")).toBeTruthy();

    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Aprobado" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(actions.createTaskStatusAction).toHaveBeenCalledWith({
        name: "Aprobado",
        closes: true,
        countsAsCompleted: true,
        sortOrder: 3,
      }),
    );
  });

  it("edits a status with the existing update action and shows its usage", async () => {
    renderPage();
    await openRowAction("Entregado", "Editar");
    const panel = editorPanel();
    expect(panel.textContent).toContain("Usado en 12 tareas de 3 proyectos.");

    fireEvent.click(within(panel).getByRole("switch", { name: "Cuenta como completada" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(actions.updateTaskStatusAction).toHaveBeenCalledWith("s2", {
        name: "Entregado",
        closes: true,
        countsAsCompleted: false,
      }),
    );
  });

  it("shows 'Sin tareas todavía.' for a status no task uses", async () => {
    renderPage();
    await openRowAction("En revisión", "Editar");
    expect(within(editorPanel()).getByText("Sin tareas todavía.")).toBeTruthy();
  });

  it("shows the save error as an alert in the editor footer", async () => {
    actions.createTaskStatusAction.mockResolvedValueOnce({ ok: false, error: "TASK_STATUS_NAME_TAKEN" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo estatus" }));
    const panel = editorPanel("Nuevo estatus");
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "En revisión" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(within(panel).getByRole("alert").textContent).toBe("Ya existe un estatus con ese nombre."));
  });

  it("asks before deleting and then calls the existing delete action", async () => {
    renderPage();
    await openRowAction("Cancelado", "Eliminar");

    const dialog = await screen.findByRole("alertdialog", { name: "¿Eliminar «Cancelado»?" });
    expect(within(dialog).getByText("Las 2 tareas vuelven a su estatus base.")).toBeTruthy();
    expect(actions.deleteTaskStatusAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(actions.deleteTaskStatusAction).toHaveBeenCalledWith("s3"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() =>
      expect(within(section("Estatus personalizados")).queryByText("Cancelado", { selector: "span" })).toBeNull(),
    );
  });

  it("'Eliminar estatus' in the editor asks with the task count", async () => {
    renderPage();
    await openRowAction("Entregado", "Editar");
    fireEvent.click(within(editorPanel()).getByRole("button", { name: "Eliminar estatus" }));
    const dialog = await screen.findByRole("alertdialog", { name: "¿Eliminar «Entregado»?" });
    expect(within(dialog).getByText("Las 12 tareas vuelven a su estatus base.")).toBeTruthy();
  });

  it("keyboard reorder announces the new position", async () => {
    renderPage();

    pressOn("Mover En revisión", " ");
    pressOn("Mover En revisión", "ArrowDown");
    expect(screen.getByText("En revisión movido a la posición 2 de 3")).toBeTruthy();
    expect(actions.reorderTaskStatusesAction).not.toHaveBeenCalled();
    pressOn("Mover En revisión", " ");

    await waitFor(() => expect(actions.reorderTaskStatusesAction).toHaveBeenCalledWith(["s2", "s1", "s3"]));
    expect(screen.getByText("En revisión movido a la posición 2 de 3")).toBeTruthy();
  });

  it("rolls the order back and shows a toast when the reorder fails", async () => {
    actions.reorderTaskStatusesAction.mockResolvedValueOnce({ ok: false, error: "FORBIDDEN" });
    const { client } = renderPage();
    pressOn("Mover Cancelado", " ");
    pressOn("Mover Cancelado", "ArrowUp");
    pressOn("Mover Cancelado", " ");

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const data = client.getQueryData<AjustesEstatusPageData>(qk.ajustes.page("estatus"));
    expect(data?.statuses.map((status) => status.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("editor returns focus to the row action on close", async () => {
    renderPage();
    const trigger = screen.getByRole("button", { name: "Acciones de Entregado" });
    await openRowAction("Entregado", "Editar");

    fireEvent.click(within(editorPanel()).getByRole("button", { name: "Cerrar" }));

    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Editar estatus" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("Escape closes the editor", async () => {
    renderPage();
    await openRowAction("Entregado", "Editar");
    fireEvent.keyDown(within(editorPanel()).getByLabelText("Nombre"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Editar estatus" })).toBeNull());
  });

  it("inline add creates on Enter and flashes the row", async () => {
    const APROBADO: TaskStatusOption = { id: "s4", name: "Aprobado", closes: false, countsAsCompleted: false, sortOrder: 3 };
    actions.createTaskStatusAction.mockResolvedValueOnce({ ok: true, data: APROBADO });
    renderPage();
    const input = screen.getByLabelText("Nuevo estatus personalizado") as HTMLInputElement;
    expect(input.getAttribute("placeholder")).toBe(
      "Escribe el nombre del estatus. Enter crea en En proceso; #completado para Completado",
    );

    fireEvent.change(input, { target: { value: "Aprobado" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    await waitFor(() =>
      expect(actions.createTaskStatusAction).toHaveBeenCalledWith({
        name: "Aprobado",
        closes: false,
        countsAsCompleted: false,
        sortOrder: 3,
      }),
    );
    await waitFor(() => expect(rowOf("Aprobado").className).toContain("row-new"));
    expect(input.value).toBe("");
    expect(pageData.getAjustesEstatusPageData).not.toHaveBeenCalled();
  });

  it("inline add with #completado creates a closing status", async () => {
    const LISTO: TaskStatusOption = { id: "s5", name: "Listo", closes: true, countsAsCompleted: true, sortOrder: 3 };
    actions.createTaskStatusAction.mockResolvedValueOnce({ ok: true, data: LISTO });
    renderPage();
    const input = screen.getByLabelText("Nuevo estatus personalizado");
    fireEvent.change(input, { target: { value: "Listo #completado" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    await waitFor(() =>
      expect(actions.createTaskStatusAction).toHaveBeenCalledWith({
        name: "Listo",
        closes: true,
        countsAsCompleted: true,
        sortOrder: 3,
      }),
    );
  });

  it("Escape clears the inline add row", () => {
    renderPage();
    const input = screen.getByLabelText("Nuevo estatus personalizado") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Borrador" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
    expect(actions.createTaskStatusAction).not.toHaveBeenCalled();
  });

  it("reads the hydrated list: no client call on mount", () => {
    renderPage();
    expect(rowOf("En revisión")).toBeTruthy();
    expect(pageData.getAjustesEstatusPageData).not.toHaveBeenCalled();
    expect(actions.fetchTaskStatusesAction).not.toHaveBeenCalled();
  });

  it("renders no edit entry point without the manage capability", () => {
    caps.canManageTaskStatuses = false;
    renderPage();

    expect(screen.queryByRole("button", { name: "Nuevo estatus" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Acciones de|Mover / })).toBeNull();
    expect(screen.queryByLabelText("Nuevo estatus personalizado")).toBeNull();
  });
});
