// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { Position, WorkflowDetail } from "@/lib/types/core";

const state = vi.hoisted(() => ({ access: "Administrador" as string }));

const actions = vi.hoisted(() => ({
  fetchPositionsAction: vi.fn(),
  createPositionAction: vi.fn(),
  updatePositionAction: vi.fn(),
  deletePositionAction: vi.fn(),
  reorderPositionsAction: vi.fn(),
  setPositionPhasesAction: vi.fn(),
}));
const workflowActions = vi.hoisted(() => ({ fetchWorkflowsAction: vi.fn() }));

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => ({
    access: state.access,
    email: "ana@cincel.mx",
    member: { id: "viewer" },
  }),
}));
vi.mock("@/lib/actions/positions-actions", () => actions);
vi.mock("@/lib/actions/workflows-actions", () => workflowActions);

import { PuestosClient } from "./PuestosClient";

const workflows = [
  {
    id: "w1",
    key: "diseno",
    name: "Diseño",
    description: null,
    active: true,
    sortOrder: 1,
    autoStart: "manual",
    readiness: null,
    templates: [],
    phases: [
      { id: "f1", name: "Ejecutivo", sortOrder: 0, workflowId: "w1", active: true, templateCount: 3 },
      { id: "f2", name: "Proyecto Estructural", sortOrder: 1, workflowId: "w1", active: true, templateCount: 2 },
    ],
  },
] as WorkflowDetail[];

function makePosition(overrides: Partial<Position>): Position {
  return {
    id: "p1",
    name: "Arquitecto proyectista",
    sortOrder: 0,
    active: true,
    staffCount: 2,
    googleManaged: false,
    phases: [{ id: "f1", name: "Ejecutivo", sortOrder: 0, workflowId: "w1", workflowName: "Diseño" }],
    ...overrides,
  };
}

const arquitecto = makePosition({});
const residente = makePosition({ id: "p2", name: "Residente de obra", sortOrder: 1, staffCount: 0, phases: [] });

function renderPuestos(positions: Position[] = [arquitecto, residente]) {
  actions.fetchPositionsAction.mockResolvedValue(positions);
  workflowActions.fetchWorkflowsAction.mockResolvedValue(workflows);
  return render(<PuestosClient initialPositions={positions} initialWorkflows={workflows} />);
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest("tr");
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

async function openRowAction(name: string, action: string) {
  fireEvent.click(within(rowOf(name)).getByLabelText("Acciones"));
  fireEvent.click(await screen.findByText(action));
}

beforeEach(() => {
  state.access = "Administrador";
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PuestosClient table", () => {
  it("lists puestos with their candidate fases and member count", async () => {
    renderPuestos();
    await waitFor(() => expect(actions.fetchPositionsAction).toHaveBeenCalled());
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent?.trim());
    expect(headers).toEqual(expect.arrayContaining(["Orden", "Puesto", "Fases candidatas", "Integrantes"]));
    expect(within(rowOf("Arquitecto proyectista")).getByText("Diseño · Ejecutivo")).toBeTruthy();
    expect(within(rowOf("Arquitecto proyectista")).getByText("2")).toBeTruthy();
    expect(screen.getByText("Los candidatos solo se sugieren al asignar tareas; cualquiera puede asignarse.")).toBeTruthy();
  });

  it("shows the empty copy", async () => {
    renderPuestos([]);
    expect(await screen.findByText("Aún no hay puestos.")).toBeTruthy();
  });

  it("gives admins the create button and row actions", async () => {
    renderPuestos();
    expect(screen.getByRole("button", { name: "+ Nuevo puesto" })).toBeTruthy();
    expect(within(rowOf("Arquitecto proyectista")).getByLabelText("Acciones")).toBeTruthy();
  });

  it("is read-only for non-admins", async () => {
    state.access = "Colaborador";
    renderPuestos();
    await waitFor(() => expect(actions.fetchPositionsAction).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "+ Nuevo puesto" })).toBeNull();
    expect(screen.queryByLabelText("Acciones")).toBeNull();
  });
});

describe("PuestosClient editor", () => {
  it("creates a puesto and then saves its candidate fases", async () => {
    const created = makePosition({ id: "p9", name: "Dibujante", phases: [], staffCount: 0 });
    actions.createPositionAction.mockResolvedValue(created);
    actions.setPositionPhasesAction.mockResolvedValue(undefined);
    renderPuestos();

    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo puesto" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Nuevo puesto")).toBeTruthy();
    // Fases grouped under their tramo heading.
    expect(within(sheet).getByText("Diseño")).toBeTruthy();

    fireEvent.change(within(sheet).getByLabelText("Nombre"), { target: { value: "  Dibujante " } });
    const phaseRow = within(sheet).getByText("Proyecto Estructural").parentElement as HTMLElement;
    fireEvent.click(within(phaseRow).getByRole("checkbox"));
    fireEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(actions.setPositionPhasesAction).toHaveBeenCalledWith("p9", ["f2"]));
    expect(actions.createPositionAction).toHaveBeenCalledWith({ name: "Dibujante" });
    expect(actions.updatePositionAction).not.toHaveBeenCalled();
  });

  it("shows the NAME_TAKEN copy", async () => {
    actions.createPositionAction.mockRejectedValue(new Error("NAME_TAKEN"));
    renderPuestos();

    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo puesto" }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.change(within(sheet).getByLabelText("Nombre"), { target: { value: "Arquitecto proyectista" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));

    expect(await within(sheet).findByText("Ya existe un puesto con ese nombre.")).toBeTruthy();
    expect(actions.setPositionPhasesAction).not.toHaveBeenCalled();
  });

  it("edits an existing puesto with update, not create", async () => {
    actions.updatePositionAction.mockResolvedValue(arquitecto);
    actions.setPositionPhasesAction.mockResolvedValue(undefined);
    renderPuestos();

    await openRowAction("Arquitecto proyectista", "Editar");
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(actions.setPositionPhasesAction).toHaveBeenCalledWith("p1", ["f1"]));
    expect(actions.updatePositionAction).toHaveBeenCalledWith("p1", { name: "Arquitecto proyectista" });
    expect(actions.createPositionAction).not.toHaveBeenCalled();
  });
});

describe("PuestosClient delete", () => {
  it("confirms with the member count and deletes", async () => {
    actions.deletePositionAction.mockResolvedValue(undefined);
    renderPuestos();

    await openRowAction("Arquitecto proyectista", "Eliminar");
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("¿Eliminar el puesto Arquitecto proyectista?")).toBeTruthy();
    expect(within(dialog).getByText("2 integrantes lo perderán.")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(actions.deletePositionAction).toHaveBeenCalledWith("p1"));
  });

  it("explains IN_USE when a Google group assigns the puesto", async () => {
    actions.deletePositionAction.mockRejectedValue(new Error("IN_USE"));
    renderPuestos();

    await openRowAction("Arquitecto proyectista", "Eliminar");
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));

    expect(
      await screen.findByText(
        "Este puesto se asigna desde un grupo de Google. Quita el grupo en Configuración → Google primero.",
      ),
    ).toBeTruthy();
  });
});
