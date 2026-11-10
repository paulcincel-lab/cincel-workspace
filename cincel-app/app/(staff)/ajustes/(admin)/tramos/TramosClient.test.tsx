// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { TRAMO_INVALIDATIONS } from "@/lib/tramos/invalidations";
import type { AjustesTramosPageData } from "@/lib/types/ajustes-catalogs";
import type { WorkflowDetail, WorkflowPhase, WorkflowTaskTemplate } from "@/lib/types/core";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => null,
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveWorkflowsCapabilities: () => ({ canViewWorkflows: true, canManageWorkflows: true }),
}));

const pageData = vi.hoisted(() => ({ getAjustesTramosPageData: vi.fn() }));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => pageData);

const actions = vi.hoisted(() => ({
  fetchWorkflowsAction: vi.fn(),
  createWorkflowAction: vi.fn(),
  updateWorkflowAction: vi.fn(),
  deleteWorkflowAction: vi.fn(),
  reorderWorkflowsAction: vi.fn(),
  createTemplateAction: vi.fn(),
  updateTemplateAction: vi.fn(),
  deactivateTemplateAction: vi.fn(),
  reorderTemplatesAction: vi.fn(),
  createWorkflowPhaseAction: vi.fn(),
  updateWorkflowPhaseAction: vi.fn(),
  reorderWorkflowPhasesAction: vi.fn(),
  setWorkflowAutoStartAction: vi.fn(),
}));
vi.mock("@/lib/actions/workflows-actions", () => actions);

import { autoStartHelpText, sortTemplatesByPhase, tramoKeyFor, TramosClient } from "./TramosClient";

function phase(overrides: Partial<WorkflowPhase>): WorkflowPhase {
  return { id: "p", name: "Fase", sortOrder: 0, workflowId: "w-diseno", active: true, templateCount: 0, ...overrides };
}

function template(overrides: Partial<WorkflowTaskTemplate>): WorkflowTaskTemplate {
  return {
    id: "t",
    workflowId: "w-diseno",
    phaseId: "p-ejecutivo",
    phaseName: "Ejecutivo",
    title: "Tarea",
    notes: null,
    defaultPriority: "media",
    commitmentOffsetDays: null,
    reviewOffsetDays: null,
    deliveryOffsetDays: null,
    sortOrder: 0,
    active: true,
    ...overrides,
  };
}

const PRESALE: WorkflowDetail = {
  id: "w-presale",
  key: "presale",
  name: "Presale",
  description: null,
  active: true,
  sortOrder: 1,
  autoStart: "on_create",
  colorSlot: null,
  phases: [phase({ id: "p-cobro", name: "Cobro", workflowId: "w-presale", templateCount: 1 })],
  templates: [],
  readiness: null,
};

const DISENO: WorkflowDetail = {
  id: "w-diseno",
  key: "diseno",
  name: "Diseño",
  description: null,
  active: true,
  sortOrder: 2,
  autoStart: "manual",
  colorSlot: null,
  phases: [
    phase({ id: "p-anteproyecto", name: "Anteproyecto", sortOrder: 0, templateCount: 1 }),
    phase({ id: "p-ejecutivo", name: "Ejecutivo", sortOrder: 1, templateCount: 1 }),
  ],
  templates: [
    template({ id: "t-planos", title: "Planos ejecutivos", phaseId: "p-ejecutivo", phaseName: "Ejecutivo", sortOrder: 0 }),
    template({ id: "t-reporte", title: "Reporte Estado Actual", phaseId: "p-anteproyecto", phaseName: "Anteproyecto", sortOrder: 1 }),
  ],
  readiness: {
    afterWorkflow: { id: "w-presale", key: "presale", name: "Presale", sortOrder: 1 },
    afterPhase: { id: "p-cobro", name: "Cobro", sortOrder: 0 },
  },
};

const ACTIVE_PROJECTS = { "w-presale": 3 };
const PHASE_TASKS = { "p-anteproyecto": 1, "p-ejecutivo": 4 };

function pageOf(workflows: WorkflowDetail[]): AjustesTramosPageData {
  return { workflows, activeProjects: ACTIVE_PROJECTS, phaseTaskCounts: PHASE_TASKS };
}

/** Renders under a client hydrated with the tramos, as the page's prefetch leaves it. */
function renderTramos(workflows: WorkflowDetail[] = [PRESALE, DISENO]): { client: QueryClient } {
  const client = createTestQueryClient();
  client.setQueryData(qk.ajustes.page("tramos"), pageOf(workflows));
  pageData.getAjustesTramosPageData.mockResolvedValue(pageOf(workflows));
  return renderWithQueryClient(<TramosClient />, { client });
}

function invalidatedKeys(spy: { mock: { calls: unknown[][] } }): unknown[] {
  return spy.mock.calls.map((call) => (call[0] as { queryKey: unknown }).queryKey);
}

function row(text: string) {
  return screen.getAllByRole("row").find((r) => r.textContent?.includes(text))!;
}

function tramoNames(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => r.querySelectorAll("td")[1]?.textContent ?? "");
}

async function openRowAction(name: string, label: string) {
  fireEvent.click(screen.getByRole("button", { name: `Acciones de ${name}` }));
  fireEvent.click(await screen.findByText(label));
}

async function openEditor(name: string) {
  await openRowAction(name, "Editar");
  return screen.findByRole("complementary", { name: `Editar tramo · ${name}` });
}

describe("TramosClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("lists the tramos in flow order with color, fases, templates and active projects", () => {
    renderTramos([DISENO, PRESALE]);

    expect(screen.getByRole("heading", { name: "Tramos y fases" })).toBeTruthy();
    expect(screen.getByText("El orden define el flujo de cada proyecto. Arrastra para reordenar.")).toBeTruthy();
    expect(screen.getByLabelText("2 en total")).toBeTruthy();
    expect(tramoNames()).toEqual(["Presale", "Diseño"]);
    for (const header of ["Orden", "Tramo", "Color", "Fases", "Plantillas", "Proyectos activos"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeTruthy();
    }
    const presale = within(row("Presale")).getAllByRole("cell").map((c) => c.textContent);
    expect(presale).toEqual(expect.arrayContaining(["Azul", "1", "0", "3"]));
    const diseno = within(row("Diseño")).getAllByRole("cell").map((c) => c.textContent);
    expect(diseno).toEqual(expect.arrayContaining(["Violeta", "2", "2", "0"]));
  });

  it("shows the color an admin chose over the derived one", () => {
    renderTramos([{ ...PRESALE, colorSlot: 5 }]);
    expect(within(row("Presale")).getByText("Verde")).toBeTruthy();
  });

  it("makes no call on mount: the tramos are hydrated", () => {
    renderTramos();
    expect(pageData.getAjustesTramosPageData).not.toHaveBeenCalled();
    expect(actions.fetchWorkflowsAction).not.toHaveBeenCalled();
  });

  it("shows the empty text and the inline add without tramos", () => {
    renderTramos([]);
    expect(screen.getByText("Aún no hay tramos.")).toBeTruthy();
    expect(screen.getByPlaceholderText("Agregar tramo…")).toBeTruthy();
  });

  it("keyboard reorder announces the new position", async () => {
    actions.reorderWorkflowsAction.mockResolvedValue({ ok: true, data: undefined });
    const { client } = renderTramos();
    // The refetch after the write reads the saved order.
    pageData.getAjustesTramosPageData.mockResolvedValue(
      pageOf([
        { ...DISENO, sortOrder: 0 },
        { ...PRESALE, sortOrder: 1 },
      ]),
    );
    const invalidate = vi.spyOn(client, "invalidateQueries");

    const handle = screen.getByRole("button", { name: "Mover Presale" });
    fireEvent.keyDown(handle, { key: " " });
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Mover Presale" }), { key: " " });

    expect(screen.getByText("Presale movido a la posición 2 de 2")).toBeTruthy();
    await waitFor(() => expect(actions.reorderWorkflowsAction).toHaveBeenCalledWith(["w-diseno", "w-presale"]));
    await waitFor(() => expect(tramoNames()).toEqual(["Diseño", "Presale"]));
    await waitFor(() => expect(invalidatedKeys(invalidate)).toEqual([...TRAMO_INVALIDATIONS]));
  });

  it("rolls the order back and shows the Tramos copy when the reorder fails", async () => {
    actions.reorderWorkflowsAction.mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    renderTramos();

    const handle = screen.getByRole("button", { name: "Mover Diseño" });
    fireEvent.keyDown(handle, { key: " " });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Mover Diseño" }), { key: " " });

    expect(await screen.findByText("No tienes permiso para realizar esta acción.")).toBeTruthy();
    expect(tramoNames()).toEqual(["Presale", "Diseño"]);
  });

  it("inline add creates on Enter and flashes the row", async () => {
    const created = { ...PRESALE, id: "w-deco", key: "decoracion", name: "Decoración", sortOrder: 3, autoStart: "manual" as const };
    renderTramos();
    // The refetch after the create reads the new tramo too.
    actions.createWorkflowAction.mockImplementation(async () => {
      pageData.getAjustesTramosPageData.mockResolvedValue(pageOf([PRESALE, DISENO, { ...created, phases: [], templates: [], readiness: null }]));
      return created;
    });

    const input = screen.getByLabelText("Agregar tramo");
    fireEvent.change(input, { target: { value: "Decoración" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(actions.createWorkflowAction).toHaveBeenCalledWith({ key: "decoracion", name: "Decoración", sortOrder: 3 }),
    );
    await waitFor(() => expect(row("Decoración").className).toContain("row-new"));
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("Escape clears the inline add without creating", () => {
    renderTramos();
    const input = screen.getByLabelText("Agregar tramo") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Otro" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
    expect(actions.createWorkflowAction).not.toHaveBeenCalled();
  });

  it("color saves: Verde, Guardar cambios → updateWorkflowAction with slot 5", async () => {
    actions.updateWorkflowAction.mockResolvedValue({ ...DISENO, colorSlot: 5 });
    const { client } = renderTramos();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const panel = await openEditor("Diseño");

    const group = within(panel).getByRole("radiogroup", { name: "Color del tramo" });
    expect(within(group).getByRole("radio", { name: "Violeta" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(group).getByRole("radio", { name: "Verde" }));
    expect(within(group).getByRole("radio", { name: "Verde" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(actions.updateWorkflowAction).toHaveBeenCalledWith("w-diseno", { colorSlot: 5 }));
    expect(actions.updateWorkflowPhaseAction).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
    await waitFor(() => expect(invalidatedKeys(invalidate)).toEqual([...TRAMO_INVALIDATIONS]));
  });

  it("saves a renamed fase and the tramo name with Guardar cambios", async () => {
    actions.updateWorkflowAction.mockResolvedValue({ ...DISENO, name: "Diseño arquitectónico" });
    actions.updateWorkflowPhaseAction.mockResolvedValue({ ok: true, data: phase({ id: "p-ejecutivo", name: "Proyecto ejecutivo" }) });
    renderTramos();
    const panel = await openEditor("Diseño");

    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Diseño arquitectónico" } });
    fireEvent.change(within(panel).getByLabelText("Nombre de la fase Ejecutivo"), {
      target: { value: "Proyecto ejecutivo" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(actions.updateWorkflowAction).toHaveBeenCalledWith("w-diseno", { name: "Diseño arquitectónico" }),
    );
    await waitFor(() =>
      expect(actions.updateWorkflowPhaseAction).toHaveBeenCalledWith("p-ejecutivo", { name: "Proyecto ejecutivo" }),
    );
  });

  it("shows the save error in the editor footer", async () => {
    actions.updateWorkflowPhaseAction.mockResolvedValue({ ok: false, error: "NAME_TAKEN" });
    renderTramos();
    const panel = await openEditor("Diseño");

    fireEvent.change(within(panel).getByLabelText("Nombre de la fase Ejecutivo"), { target: { value: "Anteproyecto" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar cambios" }));

    expect(await within(panel).findByText("Ya existe una fase con ese nombre en Diseño.")).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Editar tramo · Diseño" })).toBeTruthy();
  });

  it("lists each fase with its index and task count", async () => {
    renderTramos();
    const panel = await openEditor("Diseño");

    const list = within(panel).getByRole("list", { name: "Fases de Diseño" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("1 tarea");
    expect(items[1].textContent).toContain("4 tareas");
    expect(within(panel).getByText("Diseño (2 plantillas)")).toBeTruthy();
  });

  it("fase keyboard reorder persists on drop", async () => {
    actions.reorderWorkflowPhasesAction.mockResolvedValue({ ok: true, data: undefined });
    renderTramos();
    const panel = await openEditor("Diseño");

    const handle = within(panel).getByRole("button", { name: "Mover Ejecutivo" });
    fireEvent.keyDown(handle, { key: " " });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(within(panel).getByText("Ejecutivo movido a la posición 1 de 2")).toBeTruthy();
    expect(actions.reorderWorkflowPhasesAction).not.toHaveBeenCalled();
    fireEvent.keyDown(within(panel).getByRole("button", { name: "Mover Ejecutivo" }), { key: " " });

    await waitFor(() =>
      expect(actions.reorderWorkflowPhasesAction).toHaveBeenCalledWith("w-diseno", ["p-ejecutivo", "p-anteproyecto"]),
    );
  });

  it("adds a fase inline and marks it Nueva", async () => {
    const created = phase({ id: "p-obra", name: "Obra", sortOrder: 2 });
    actions.createWorkflowPhaseAction.mockResolvedValue({ ok: true, data: created });
    const { client } = renderTramos();
    pageData.getAjustesTramosPageData.mockResolvedValue(pageOf([PRESALE, { ...DISENO, phases: [...DISENO.phases, created] }]));
    const panel = await openEditor("Diseño");

    const input = within(panel).getByLabelText("Agregar fase a Diseño");
    fireEvent.change(input, { target: { value: "Obra" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(actions.createWorkflowPhaseAction).toHaveBeenCalledWith("w-diseno", { name: "Obra" }));
    await client.refetchQueries({ queryKey: qk.ajustes.page("tramos") });
    expect(await within(panel).findByText("Nueva")).toBeTruthy();
  });

  it("shows NAME_TAKEN with the tramo name when a new fase repeats one", async () => {
    actions.createWorkflowPhaseAction.mockRejectedValueOnce(new Error("NAME_TAKEN"));
    renderTramos();
    const panel = await openEditor("Diseño");

    const input = within(panel).getByLabelText("Agregar fase a Diseño") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Ejecutivo" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await within(panel).findByText("Ya existe una fase con ese nombre en Diseño.")).toBeTruthy();
    expect(input.value).toBe("Ejecutivo");
  });

  it("deactivates a fase from its menu", async () => {
    actions.updateWorkflowPhaseAction.mockResolvedValue({ ok: true, data: phase({ id: "p-anteproyecto", active: false }) });
    renderTramos();
    const panel = await openEditor("Diseño");

    fireEvent.click(within(panel).getByRole("button", { name: "Acciones de Anteproyecto" }));
    fireEvent.click(await screen.findByText("Desactivar"));

    await waitFor(() =>
      expect(actions.updateWorkflowPhaseAction).toHaveBeenCalledWith("p-anteproyecto", { active: false }),
    );
  });

  it("saves the auto-start switch from the editor", async () => {
    actions.setWorkflowAutoStartAction.mockResolvedValue({ ok: true, data: { ...PRESALE, autoStart: "manual" } });
    const { client } = renderTramos();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const panel = await openEditor("Presale");

    expect(within(panel).getByText("Se inicia al crear un proyecto.")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("switch", { name: /Iniciar automáticamente/ }));

    await waitFor(() => expect(actions.setWorkflowAutoStartAction).toHaveBeenCalledWith("w-presale", false));
    await waitFor(() =>
      expect(invalidatedKeys(invalidate)).toEqual([qk.ajustes.page("tramos"), qk.catalog.workflows(), qk.proyectos.list()]),
    );
  });

  it("editor returns focus to the row action on close", async () => {
    renderTramos();
    const panel = await openEditor("Diseño");

    fireEvent.click(within(panel).getByRole("button", { name: "Cerrar" }));

    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Acciones de Diseño" })),
    );
  });

  it("Escape closes the editor", async () => {
    renderTramos();
    const panel = await openEditor("Diseño");
    fireEvent.keyDown(within(panel).getByLabelText("Nombre"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
  });

  it("can't delete a tramo with active projects", async () => {
    renderTramos();
    fireEvent.click(screen.getByRole("button", { name: "Acciones de Presale" }));
    const item = (await screen.findByText("Eliminar")).closest('[role="menuitem"]')!;
    expect(item.hasAttribute("data-disabled") || item.getAttribute("aria-disabled") === "true").toBe(true);
    fireEvent.click(item);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("asks before deleting a tramo and then deletes it", async () => {
    actions.deleteWorkflowAction.mockResolvedValue(undefined);
    renderTramos();
    await openRowAction("Diseño", "Eliminar");

    const dialog = await screen.findByRole("alertdialog", { name: "¿Eliminar el tramo «Diseño»?" });
    expect(actions.deleteWorkflowAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(actions.deleteWorkflowAction).toHaveBeenCalledWith("w-diseno"));
  });

  it("describes the read-only readiness rule for later tramos", () => {
    expect(autoStartHelpText(DISENO, false)).toBe(
      "Se inicia solo cuando el proyecto está listo (Cobro de Presale completada). Si está apagado, el proyecto aparece en «Listos para iniciar».",
    );
    expect(autoStartHelpText(PRESALE, true)).toBe("Se inicia al crear un proyecto.");
  });

  it("groups template tasks by fase order", () => {
    const sorted = sortTemplatesByPhase(DISENO.templates, DISENO.phases);
    expect(sorted.map((t) => t.title)).toEqual(["Reporte Estado Actual", "Planos ejecutivos"]);
  });

  it("derives a unique key from the tramo name", () => {
    expect(tramoKeyFor("Decoración", new Set())).toBe("decoracion");
    expect(tramoKeyFor("  Diseño de interiores ", new Set(["diseno-de-interiores"]))).toBe("diseno-de-interiores-2");
    expect(tramoKeyFor("¡!", new Set())).toBe("tramo");
  });
});
