// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { WorkflowDetail, WorkflowPhase, WorkflowTaskTemplate } from "@/lib/types/core";

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => null,
}));

vi.mock("@/lib/auth/permissions", () => ({
  resolveWorkflowsCapabilities: () => ({ canViewWorkflows: true, canManageWorkflows: true }),
}));

const pageData = vi.hoisted(() => ({ getAjustesTramosPageData: vi.fn() }));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => pageData);

const actions = vi.hoisted(() => ({
  fetchWorkflowsAction: vi.fn(),
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

import { autoStartHelpText, sortTemplatesByPhase, TramosClient } from "./TramosClient";

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

/** Renders under a client hydrated with the tramos, as the page's prefetch leaves it. */
function renderTramos(workflows: WorkflowDetail[]): { client: QueryClient } {
  const client = createTestQueryClient();
  client.setQueryData(qk.ajustes.page("tramos"), { workflows });
  pageData.getAjustesTramosPageData.mockResolvedValue({ workflows });
  return renderWithQueryClient(<TramosClient />, { client });
}

function invalidatedKeys(spy: { mock: { calls: unknown[][] } }): unknown[] {
  return spy.mock.calls.map((call) => (call[0] as { queryKey: unknown }).queryKey);
}

function row(text: string) {
  return screen.getAllByRole("row").find((r) => r.textContent?.includes(text))!;
}

async function openRowAction(rowText: string, label: string) {
  fireEvent.click(within(row(rowText)).getByLabelText("Acciones"));
  fireEvent.click(await screen.findByText(label));
}

describe("TramosClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("shows the header, one tab per tramo in order and the first tramo's start text", () => {
    renderTramos([DISENO, PRESALE]);

    expect(screen.getByText("Tramos y fases")).toBeTruthy();
    expect(screen.getByText("Fases, tareas de plantilla e inicio automático de cada tramo.")).toBeTruthy();
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Presale", "Diseño"]);
    expect(screen.getByText("Se inicia al crear un proyecto.")).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Iniciar automáticamente/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("describes the read-only readiness rule for later tramos", () => {
    expect(autoStartHelpText(DISENO, false)).toBe(
      "Se inicia solo cuando el proyecto está listo (Cobro de Presale completada). Si está apagado, el proyecto aparece en «Listos para iniciar».",
    );
    expect(autoStartHelpText(PRESALE, true)).toBe("Se inicia al crear un proyecto.");
  });

  it("makes no call on mount: the tramos are hydrated", () => {
    renderTramos([DISENO, PRESALE]);
    expect(pageData.getAjustesTramosPageData).not.toHaveBeenCalled();
    expect(actions.fetchWorkflowsAction).not.toHaveBeenCalled();
  });

  it("saves the auto-start switch and invalidates Tramos, the catalog and the Proyectos list (no refresh helper)", async () => {
    actions.setWorkflowAutoStartAction.mockResolvedValue({ ok: true, data: { ...PRESALE, autoStart: "manual" } });
    const { client } = renderTramos([PRESALE, DISENO]);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    fireEvent.click(screen.getByRole("switch", { name: /Iniciar automáticamente/ }));

    await waitFor(() => expect(actions.setWorkflowAutoStartAction).toHaveBeenCalledWith("w-presale", false));
    await waitFor(() =>
      expect(invalidatedKeys(invalidate)).toEqual([
        qk.ajustes.page("tramos"),
        qk.catalog.workflows(),
        qk.proyectos.list(),
      ]),
    );
    // The active page query refetches once through its page-data action; the old list action is gone.
    await waitFor(() => expect(pageData.getAjustesTramosPageData).toHaveBeenCalledTimes(1));
    expect(actions.fetchWorkflowsAction).not.toHaveBeenCalled();
  });

  it("a fase change also invalidates Puestos, Tareas and Proyectos", async () => {
    actions.updateWorkflowPhaseAction.mockResolvedValue({ ok: true, data: phase({ id: "p-anteproyecto", active: false }) });
    const { client } = renderTramos([{ ...DISENO, sortOrder: 0 }]);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await openRowAction("Anteproyecto", "Desactivar");

    await waitFor(() =>
      expect(invalidatedKeys(invalidate)).toEqual([
        qk.ajustes.page("tramos"),
        qk.catalog.workflows(),
        qk.ajustes.page("puestos"),
        qk.tareas.all,
        qk.proyectos.all,
      ]),
    );
  });

  it("a template save invalidates only Tramos and the catalog", async () => {
    actions.updateTemplateAction.mockResolvedValue({ ok: true, data: DISENO.templates[0] });
    const { client } = renderTramos([{ ...DISENO, sortOrder: 0 }]);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await openRowAction("Planos ejecutivos", "Editar");
    fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(invalidatedKeys(invalidate)).toEqual([qk.ajustes.page("tramos"), qk.catalog.workflows()]));
  });

  it("shows the Tramos copy for a failed result (production keeps the code)", async () => {
    actions.setWorkflowAutoStartAction.mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    renderTramos([PRESALE, DISENO]);

    fireEvent.click(screen.getByRole("switch", { name: /Iniciar automáticamente/ }));

    expect(await screen.findByText("No tienes permiso para realizar esta acción.")).toBeTruthy();
  });

  it("lists fases with their template count and state", () => {
    renderTramos([{ ...DISENO, sortOrder: 0 }]);

    const cells = within(row("Ejecutivo")).getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toContain("Activa");
    expect(screen.getByRole("columnheader", { name: "Tareas de plantilla" })).toBeTruthy();
  });

  it("shows the empty text for a tramo without fases", () => {
    renderTramos([{ ...PRESALE, phases: [] }]);

    expect(screen.getByText("Este tramo aún no tiene fases.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "+ Nueva tarea de plantilla" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("groups template tasks by fase order", () => {
    const sorted = sortTemplatesByPhase(DISENO.templates, DISENO.phases);
    expect(sorted.map((t) => t.title)).toEqual(["Reporte Estado Actual", "Planos ejecutivos"]);
  });

  it("can't save a template task without a fase", async () => {
    renderTramos([{ ...DISENO, sortOrder: 0 }]);

    fireEvent.click(screen.getByRole("button", { name: "+ Nueva tarea de plantilla" }));
    fireEvent.change(await screen.findByLabelText("Tarea"), { target: { value: "Nueva tarea" } });

    const save = screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(actions.createTemplateAction).not.toHaveBeenCalled();
    expect(screen.getByText("Tramo: Diseño")).toBeTruthy();
  });

  it("shows NAME_TAKEN for a template task with the fase name", async () => {
    actions.updateTemplateAction.mockRejectedValue(new Error("NAME_TAKEN"));
    renderTramos([{ ...DISENO, sortOrder: 0 }]);

    await openRowAction("Planos ejecutivos", "Editar");
    fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Ya existe una tarea de plantilla con ese nombre en Ejecutivo.")).toBeTruthy();
    expect(actions.updateTemplateAction).toHaveBeenCalledWith(
      "t-planos",
      expect.objectContaining({ title: "Planos ejecutivos", phaseId: "p-ejecutivo" }),
    );
  });

  it("shows PHASE_MISMATCH for a template task", async () => {
    actions.updateTemplateAction.mockRejectedValue(new Error("PHASE_MISMATCH: p-ejecutivo"));
    renderTramos([{ ...DISENO, sortOrder: 0 }]);

    await openRowAction("Planos ejecutivos", "Editar");
    fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Esa fase no pertenece al tramo de la tarea.")).toBeTruthy();
  });

  it("creates a fase and shows NAME_TAKEN with the tramo name", async () => {
    actions.createWorkflowPhaseAction.mockRejectedValueOnce(new Error("NAME_TAKEN"));
    renderTramos([{ ...DISENO, sortOrder: 0 }]);

    fireEvent.click(screen.getByRole("button", { name: "+ Nueva fase" }));
    fireEvent.change(await screen.findByLabelText("Nombre"), { target: { value: "Ejecutivo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Ya existe una fase con ese nombre en Diseño.")).toBeTruthy();
    expect(actions.createWorkflowPhaseAction).toHaveBeenCalledWith("w-diseno", { name: "Ejecutivo" });
  });

  it("deactivates a fase through the row actions", async () => {
    actions.updateWorkflowPhaseAction.mockResolvedValue(phase({ id: "p-ejecutivo", active: false }));
    renderTramos([{ ...DISENO, sortOrder: 0 }]);

    await openRowAction("Anteproyecto", "Desactivar");

    await waitFor(() =>
      expect(actions.updateWorkflowPhaseAction).toHaveBeenCalledWith("p-anteproyecto", { active: false }),
    );
  });
});
