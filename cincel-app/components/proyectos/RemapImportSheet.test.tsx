// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import type {
  MondayBoardSource,
  MondayImportChoices,
  MondayRemapPreview,
  MondayRemapState,
} from "@/lib/types/monday-import";

const actions = vi.hoisted(() => ({
  getMondayRemapAction: vi.fn(),
  previewMondayRemapAction: vi.fn(),
  applyMondayRemapAction: vi.fn(),
}));

vi.mock("@/lib/actions/monday-import-actions", () => actions);

// The wizard's table is covered by its own tests; here it only has to report a target change.
vi.mock("@/components/configuracion/monday-import/GroupTargetsTable", () => ({
  GroupTargetsTable: ({
    source,
    onBoardChange,
  }: {
    source: MondayBoardSource;
    onBoardChange: (update: (board: Record<string, unknown>) => Record<string, unknown>) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onBoardChange((board) => ({
          ...board,
          groupTargets: { ...((board.groupTargets as object) ?? {}), [source.groups[0].id]: { kind: "admin" } },
        }))
      }
    >
      Cambiar grupo de {source.name}
    </button>
  ),
}));

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";

import {
  canRemapImport,
  REMAP_BOARD_MISSING,
  REMAP_EXPORT_GONE,
  RemapImportSheet,
} from "./RemapImportSheet";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const PRESALE = "11111111-1111-4111-8111-111111111111";
const DISENO = "22222222-2222-4222-8222-222222222222";

const choices = {
  statuses: [],
  workflows: [
    { id: PRESALE, name: "Presale", phases: [] },
    { id: DISENO, name: "Diseño", phases: [] },
  ],
  templates: [],
  positions: [],
  clients: [],
  staff: [],
  providerSubtypes: [],
  statusMap: {},
} as unknown as MondayImportChoices;

function source(id: string, name: string): MondayBoardSource {
  return {
    id,
    name,
    columns: [],
    subitemColumns: [],
    groups: [{ id: `${id}-g1`, title: "Administrativo" }],
    statusLabels: {},
    itemCount: 0,
    items: [],
  } as unknown as MondayBoardSource;
}

function state(boards: Array<{ id: string; name: string; missing?: boolean }>): MondayRemapState {
  return {
    project: { id: PROJECT_ID, name: "Madrid 22" },
    boards: boards.map((board) => ({
      boardId: board.id,
      name: board.name,
      source: board.missing ? null : source(board.id, board.name),
      workflowId: DISENO,
      groupTargets: {},
    })),
    choices,
  };
}

const preview: MondayRemapPreview = {
  tasks: 210,
  changes: { etapa: 40, phase: 12, space: 3, admin: 5, otherProject: 0, unchanged: 150, phaseUnresolved: 2 },
  samples: [{ taskId: "t1", title: "Levantamiento", before: "Diseño · — · —", after: "Presale · Levantamiento · —" }],
  issues: [],
};

function renderSheet(onApplied = vi.fn(), onOpenChange = vi.fn()) {
  const client = createTestQueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  renderWithQueryClient(
    <RemapImportSheet projectId={PROJECT_ID} open onOpenChange={onOpenChange} onApplied={onApplied} />,
    { client },
  );
  const invalidated = () => invalidate.mock.calls.map((call) => (call[0] as { queryKey: unknown }).queryKey);
  return { onApplied, onOpenChange, client, invalidated };
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

beforeEach(() => {
  actions.getMondayRemapAction.mockResolvedValue({ ok: true, remap: state([{ id: "b1", name: "Madrid 22" }]) });
  actions.previewMondayRemapAction.mockResolvedValue({ ok: true, preview });
  actions.applyMondayRemapAction.mockResolvedValue({ ok: true, updated: 60 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("canRemapImport", () => {
  const admin = { access: "Administrador" } as never;
  const direccion = { access: "Dirección" } as never;
  const imported = { mondayImport: { boards: [{ id: "b1", name: "Madrid 22" }] } };

  it("is only for administrators on imported projects", () => {
    expect(canRemapImport(admin, imported)).toBe(true);
    expect(canRemapImport(direccion, imported)).toBe(false);
    expect(canRemapImport(null, imported)).toBe(false);
    expect(canRemapImport(admin, { mondayImport: null })).toBe(false);
  });
});

describe("RemapImportSheet", () => {
  it("shows the counts and samples of the preview, and enables Aplicar only after it", async () => {
    renderSheet();
    await screen.findByText("Cambiar grupo de Madrid 22");
    expect(button("Aplicar").disabled).toBe(true);

    fireEvent.click(button("Vista previa"));
    expect(
      await screen.findByText(
        "40 tareas cambian de etapa, 12 de fase, 3 de espacio, 5 pasan a administración, 150 sin cambios, 2 sin fase · revisar",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Levantamiento")).toBeTruthy();
    expect(screen.getByText("Presale · Levantamiento · —")).toBeTruthy();
    expect(button("Aplicar").disabled).toBe(false);
    expect(actions.previewMondayRemapAction).toHaveBeenCalledWith(PROJECT_ID, [
      { boardId: "b1", workflowId: DISENO, groupTargets: {} },
    ]);
  });

  it("clears the preview on any target change", async () => {
    renderSheet();
    await screen.findByText("Cambiar grupo de Madrid 22");
    fireEvent.click(button("Vista previa"));
    await screen.findByText(/40 tareas cambian de etapa/);

    fireEvent.click(button("Cambiar grupo de Madrid 22"));
    expect(screen.queryByText(/40 tareas cambian de etapa/)).toBeNull();
    expect(button("Aplicar").disabled).toBe(true);

    fireEvent.click(button("Vista previa"));
    await screen.findByText(/40 tareas cambian de etapa/);
    expect(actions.previewMondayRemapAction).toHaveBeenLastCalledWith(PROJECT_ID, [
      { boardId: "b1", workflowId: DISENO, groupTargets: { "b1-g1": { kind: "admin" } } },
    ]);
  });

  it("confirms in a dialog before applying, then closes and reports the updated tasks", async () => {
    const { onApplied, onOpenChange } = renderSheet();
    await screen.findByText("Cambiar grupo de Madrid 22");
    fireEvent.click(button("Vista previa"));
    await screen.findByText(/40 tareas cambian de etapa/);

    fireEvent.click(button("Aplicar"));
    expect(await screen.findByText("¿Reacomodar 60 tareas de Madrid 22?")).toBeTruthy();
    expect(actions.applyMondayRemapAction).not.toHaveBeenCalled();

    fireEvent.click(button("Reacomodar"));
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(60));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(actions.applyMondayRemapAction).toHaveBeenCalledWith(PROJECT_ID, [
      { boardId: "b1", workflowId: DISENO, groupTargets: {} },
    ]);
  });

  it("shows an apply error inline and keeps the sheet open", async () => {
    actions.applyMondayRemapAction.mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    const { onApplied } = renderSheet();
    await screen.findByText("Cambiar grupo de Madrid 22");
    fireEvent.click(button("Vista previa"));
    await screen.findByText(/40 tareas cambian de etapa/);
    fireEvent.click(button("Aplicar"));
    fireEvent.click(await screen.findByRole("button", { name: "Reacomodar" }));
    expect(await screen.findByText("No tienes permiso para realizar esta acción.")).toBeTruthy();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("marks a board missing from the stored export and leaves it out of the input", async () => {
    actions.getMondayRemapAction.mockResolvedValue({
      ok: true,
      remap: state([
        { id: "b1", name: "Madrid 22" },
        { id: "b2", name: "Madrid 22 · Obra", missing: true },
      ]),
    });
    renderSheet();
    expect(await screen.findByText(REMAP_BOARD_MISSING)).toBeTruthy();
    expect(screen.queryByText("Cambiar grupo de Madrid 22 · Obra")).toBeNull();

    fireEvent.click(button("Vista previa"));
    await screen.findByText(/40 tareas cambian de etapa/);
    expect(actions.previewMondayRemapAction).toHaveBeenCalledWith(PROJECT_ID, [
      { boardId: "b1", workflowId: DISENO, groupTargets: {} },
    ]);
  });

  it("shows the export-gone alert without Vista previa or Aplicar when every board is missing", async () => {
    actions.getMondayRemapAction.mockResolvedValue({
      ok: true,
      remap: state([{ id: "b1", name: "Madrid 22", missing: true }]),
    });
    renderSheet();
    expect(await screen.findByText(REMAP_EXPORT_GONE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Vista previa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aplicar" })).toBeNull();
  });

  it("shows the export-gone alert when the action answers EXPORT_MISSING", async () => {
    actions.getMondayRemapAction.mockResolvedValue({ ok: false, error: "EXPORT_MISSING" });
    renderSheet();
    expect(await screen.findByText(REMAP_EXPORT_GONE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Vista previa" })).toBeNull();
  });

  it("shows NOT_IMPORTED as a load error with Reintentar", async () => {
    actions.getMondayRemapAction.mockResolvedValue({ ok: false, error: "NOT_IMPORTED" });
    renderSheet();
    expect(await screen.findByText("No se pudo cargar la importación de este proyecto.")).toBeTruthy();
    expect(screen.getByText("Este proyecto no viene de una importación de monday.")).toBeTruthy();

    actions.getMondayRemapAction.mockResolvedValue({ ok: true, remap: state([{ id: "b1", name: "Madrid 22" }]) });
    fireEvent.click(button("Reintentar"));
    expect(await screen.findByText("Cambiar grupo de Madrid 22")).toBeTruthy();
  });

  it("reads the remap state under proyectos.detail(id), only while open", async () => {
    const { client } = renderSheet();
    await screen.findByText("Cambiar grupo de Madrid 22");
    expect(qk.proyectos.remap(PROJECT_ID).slice(0, 2)).toEqual(qk.proyectos.detail(PROJECT_ID));
    expect(client.getQueryData(qk.proyectos.remap(PROJECT_ID))).toMatchObject({ ok: true });

    cleanup();
    actions.getMondayRemapAction.mockClear();
    renderWithQueryClient(
      <RemapImportSheet projectId={PROJECT_ID} open={false} onOpenChange={vi.fn()} onApplied={vi.fn()} />,
    );
    expect(actions.getMondayRemapAction).not.toHaveBeenCalled();
  });

  it("previews without invalidating anything", async () => {
    const { invalidated } = renderSheet();
    await screen.findByText("Cambiar grupo de Madrid 22");
    fireEvent.click(button("Vista previa"));
    await screen.findByText(/40 tareas cambian de etapa/);
    expect(invalidated()).toEqual([]);
  });

  it("applies and invalidates the project (proyectos.detail prefix) and the list", async () => {
    const { onApplied, invalidated } = renderSheet();
    await screen.findByText("Cambiar grupo de Madrid 22");
    fireEvent.click(button("Vista previa"));
    await screen.findByText(/40 tareas cambian de etapa/);
    fireEvent.click(button("Aplicar"));
    fireEvent.click(await screen.findByRole("button", { name: "Reacomodar" }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(60));
    await waitFor(() => expect(invalidated()).toEqual([qk.proyectos.detail(PROJECT_ID), qk.proyectos.list()]));
  });
});
