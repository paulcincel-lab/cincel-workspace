// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
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
const pageData = vi.hoisted(() => ({ getAjustesPuestosPageData: vi.fn() }));

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => ({
    access: state.access,
    email: "ana@cincel.mx",
    member: { id: "viewer" },
  }),
}));
vi.mock("@/lib/actions/positions-actions", () => actions);
vi.mock("@/lib/actions/page-data/ajustes-actions", () => pageData);

import { PuestosClient, puestosTotals } from "./PuestosClient";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { seedSessionUser } from "@/tests/helpers/session-user";

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
    weeklyCapacityHours: 40,
    members: [
      { id: "s1", name: "Ana López", initials: "AL" },
      { id: "s2", name: "Beto Ruiz", initials: "BR" },
    ],
    ...overrides,
  };
}

const arquitecto = makePosition({});
const residente = makePosition({
  id: "p2",
  name: "Residente de obra",
  sortOrder: 1,
  staffCount: 1,
  phases: [],
  weeklyCapacityHours: 30,
  members: [{ id: "s3", name: "Cris Díaz", initials: "CD" }],
});

/** Renders under a client hydrated with the page data, as the page's prefetch leaves it. */
function renderPuestos(positions: Position[] = [arquitecto, residente]) {
  const client = createTestQueryClient();
  client.setQueryData(qk.ajustes.page("puestos"), { positions, workflows });
  // The refetch an invalidation triggers.
  pageData.getAjustesPuestosPageData.mockResolvedValue({ positions, workflows });
  return renderWithQueryClient(<PuestosClient />, { client });
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest("tr");
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

async function openRowAction(name: string, action: string) {
  fireEvent.click(within(rowOf(name)).getByLabelText(`Acciones de ${name}`));
  fireEvent.click(await screen.findByText(action));
}

/** The inline editor panel (happy-dom is 1024 px wide: the panel sits next to the list). */
function editor(name: string): Promise<HTMLElement> {
  return screen.findByRole("complementary", { name });
}

beforeEach(() => {
  state.access = "Administrador";
  seedSessionUser(getCurrentAuthenticatedUser());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PuestosClient table", () => {
  it("lists puestos with their candidate fases, members and capacity, with no call on mount", () => {
    renderPuestos();
    expect(pageData.getAjustesPuestosPageData).not.toHaveBeenCalled();
    expect(actions.fetchPositionsAction).not.toHaveBeenCalled();
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent?.replace(/[▲▼]/g, "").trim());
    expect(headers).toEqual(
      expect.arrayContaining(["Orden", "Puesto", "Fases candidatas", "Integrantes", "Capacidad / semananuevo"]),
    );
    expect(screen.getByRole("heading", { name: "Puestos" })).toBeTruthy();
    expect(within(rowOf("Arquitecto proyectista")).getByText("Diseño · Ejecutivo")).toBeTruthy();
    expect(within(rowOf("Arquitecto proyectista")).getByText("2")).toBeTruthy();
    expect(within(rowOf("Arquitecto proyectista")).getByText("40 h")).toBeTruthy();
    expect(
      screen.getByText("Las fases candidatas solo se sugieren al asignar tareas; cualquiera puede asignarse."),
    ).toBeTruthy();
  });

  it("collapses the candidate fases after two into +{n}", () => {
    const many = makePosition({
      phases: [
        { id: "f1", name: "Ejecutivo", sortOrder: 0, workflowId: "w1", workflowName: "Diseño" },
        { id: "f2", name: "Proyecto Estructural", sortOrder: 1, workflowId: "w1", workflowName: "Diseño" },
        { id: "f3", name: "Instalaciones", sortOrder: 2, workflowId: "w1", workflowName: "Diseño" },
      ],
    });
    renderPuestos([many]);
    expect(within(rowOf("Arquitecto proyectista")).getByText("+1")).toBeTruthy();
    expect(within(rowOf("Arquitecto proyectista")).queryByText("Diseño · Instalaciones")).toBeNull();
  });

  it("shows — for a puesto without capacity", () => {
    renderPuestos([makePosition({ weeklyCapacityHours: null })]);
    expect(within(rowOf("Arquitecto proyectista")).getByText("—")).toBeTruthy();
  });

  it("footer sums puestos, people and capacity × members", () => {
    renderPuestos();
    expect(screen.getByText("Total · 2 puestos")).toBeTruthy();
    expect(screen.getByText("3 personas")).toBeTruthy();
    // 40 h × 2 + 30 h × 1.
    expect(screen.getByText("110 h")).toBeTruthy();
    expect(puestosTotals([makePosition({ weeklyCapacityHours: null })]).hours).toBe(0);
  });

  it("shows the empty copy with the inline add", async () => {
    renderPuestos([]);
    expect(await screen.findByText("Aún no hay puestos.")).toBeTruthy();
    expect(screen.getByPlaceholderText("Agregar puesto…")).toBeTruthy();
  });

  it("gives admins the create button and row actions", () => {
    renderPuestos();
    expect(screen.getByRole("button", { name: "Nuevo puesto" })).toBeTruthy();
    expect(within(rowOf("Arquitecto proyectista")).getByLabelText("Acciones de Arquitecto proyectista")).toBeTruthy();
  });

  it("is read-only for non-admins", () => {
    state.access = "Colaborador";
    seedSessionUser(getCurrentAuthenticatedUser());
    renderPuestos();
    expect(screen.queryByRole("button", { name: "Nuevo puesto" })).toBeNull();
    expect(screen.queryByLabelText(/^Acciones de/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Mover/ })).toBeNull();
    expect(screen.queryByPlaceholderText("Agregar puesto…")).toBeNull();
  });

  it("disables Eliminar on a Google-managed puesto", async () => {
    renderPuestos([makePosition({ googleManaged: true })]);
    fireEvent.click(screen.getByLabelText("Acciones de Arquitecto proyectista"));
    const item = (await screen.findByText("Eliminar")).closest('[role="menuitem"]') as HTMLElement;
    expect(item.getAttribute("aria-disabled") === "true" || item.hasAttribute("data-disabled")).toBe(true);
    fireEvent.click(item);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("PuestosClient reorder", () => {
  it("keyboard reorder announces the new position", async () => {
    actions.reorderPositionsAction.mockResolvedValue({ ok: true, data: undefined });
    renderPuestos();

    fireEvent.keyDown(screen.getByRole("button", { name: "Mover Arquitecto proyectista" }), { key: " " });
    fireEvent.keyDown(screen.getByRole("button", { name: "Mover Arquitecto proyectista" }), { key: "ArrowDown" });
    expect(screen.getByText("Arquitecto proyectista movido a la posición 2 de 2")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: "Mover Arquitecto proyectista" }), { key: " " });

    await waitFor(() => expect(actions.reorderPositionsAction).toHaveBeenCalledWith(["p2", "p1"]));
    expect(screen.getByText("Arquitecto proyectista movido a la posición 2 de 2")).toBeTruthy();
  });
});

describe("PuestosClient inline add", () => {
  it("inline add creates on Enter and flashes the row", async () => {
    const created = makePosition({ id: "p9", name: "Dibujante", phases: [], staffCount: 0, members: [] });
    actions.createPositionAction.mockResolvedValue({ ok: true, data: created });
    renderPuestos();
    pageData.getAjustesPuestosPageData.mockResolvedValue({ positions: [arquitecto, residente, created], workflows });

    const input = screen.getByPlaceholderText("Agregar puesto…") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Dibujante " } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(actions.createPositionAction).toHaveBeenCalledWith({ name: "Dibujante" }));
    await waitFor(() => expect(rowOf("Dibujante").className).toContain("row-new"));
    await waitFor(() => expect(input.value).toBe(""));
  });

  it("Escape clears the inline add", () => {
    renderPuestos();
    const input = screen.getByPlaceholderText("Agregar puesto…") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Algo" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
    expect(actions.createPositionAction).not.toHaveBeenCalled();
  });
});

describe("PuestosClient editor", () => {
  it("creates a puesto and then saves its candidate fases", async () => {
    const created = makePosition({ id: "p9", name: "Dibujante", phases: [], staffCount: 0 });
    actions.createPositionAction.mockResolvedValue(created);
    actions.setPositionPhasesAction.mockResolvedValue(undefined);
    renderPuestos();

    fireEvent.click(screen.getByRole("button", { name: "Nuevo puesto" }));
    const panel = await editor("Nuevo puesto");
    // Fases grouped under their tramo legend.
    expect(within(panel).getByRole("group", { name: "Diseño" })).toBeTruthy();

    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "  Dibujante " } });
    const phaseRow = within(panel).getByText("Proyecto Estructural").parentElement as HTMLElement;
    fireEvent.click(within(phaseRow).getByRole("checkbox"));
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(actions.setPositionPhasesAction).toHaveBeenCalledWith("p9", ["f2"]));
    expect(actions.createPositionAction).toHaveBeenCalledWith({ name: "Dibujante", weeklyCapacityHours: null });
    expect(actions.updatePositionAction).not.toHaveBeenCalled();
  });

  it("a save invalidates Puestos, Personas, the assignee pickers and Google, and refetches only this page once", async () => {
    actions.createPositionAction.mockResolvedValue({ ok: true, data: makePosition({ id: "p9", name: "Dibujante" }) });
    actions.setPositionPhasesAction.mockResolvedValue({ ok: true, data: makePosition({ id: "p9", name: "Dibujante" }) });
    const { client } = renderPuestos();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    fireEvent.click(screen.getByRole("button", { name: "Nuevo puesto" }));
    const panel = await editor("Nuevo puesto");
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Dibujante" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4));
    expect(invalidate.mock.calls.map((call) => call[0]?.queryKey)).toEqual([
      qk.ajustes.page("puestos"),
      qk.personas.equipo(),
      ["catalog", "assignable-staff"],
      qk.ajustes.page("google"),
    ]);
    await waitFor(() => expect(pageData.getAjustesPuestosPageData).toHaveBeenCalledTimes(1));
    expect(actions.fetchPositionsAction).not.toHaveBeenCalled();
  });

  it("shows the NAME_TAKEN copy in the editor footer", async () => {
    actions.createPositionAction.mockRejectedValue(new Error("NAME_TAKEN"));
    renderPuestos();

    fireEvent.click(screen.getByRole("button", { name: "Nuevo puesto" }));
    const panel = await editor("Nuevo puesto");
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Arquitecto proyectista" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar" }));

    expect(await within(panel).findByText("Ya existe un puesto con ese nombre.")).toBeTruthy();
    expect(actions.setPositionPhasesAction).not.toHaveBeenCalled();
  });

  it("edits an existing puesto with update, not create, and lists its members read-only", async () => {
    actions.updatePositionAction.mockResolvedValue(arquitecto);
    actions.setPositionPhasesAction.mockResolvedValue(undefined);
    renderPuestos();

    await openRowAction("Arquitecto proyectista", "Editar");
    const panel = await editor("Editar puesto · Arquitecto proyectista");
    expect(within(panel).getByText("Ana López")).toBeTruthy();
    expect(within(panel).getByText("El puesto de cada persona se cambia en Personas.")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(actions.setPositionPhasesAction).toHaveBeenCalledWith("p1", ["f1"]));
    expect(actions.updatePositionAction).toHaveBeenCalledWith("p1", {
      name: "Arquitecto proyectista",
      weeklyCapacityHours: 40,
    });
    expect(actions.createPositionAction).not.toHaveBeenCalled();
  });

  it("capacity saves and validates 0–80", async () => {
    actions.updatePositionAction.mockResolvedValue(arquitecto);
    actions.setPositionPhasesAction.mockResolvedValue(undefined);
    renderPuestos([makePosition({ weeklyCapacityHours: null })]);

    await openRowAction("Arquitecto proyectista", "Editar");
    const panel = await editor("Editar puesto · Arquitecto proyectista");
    const capacity = within(panel).getByLabelText("Capacidad por semana (horas)");

    fireEvent.change(capacity, { target: { value: "81" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar" }));
    expect(await within(panel).findByText("Escribe un número de 0 a 80.")).toBeTruthy();
    expect(actions.updatePositionAction).not.toHaveBeenCalled();

    fireEvent.change(capacity, { target: { value: "40" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(actions.updatePositionAction).toHaveBeenCalledWith("p1", {
        name: "Arquitecto proyectista",
        weeklyCapacityHours: 40,
      }),
    );
  });

  it("editor returns focus to the row action on close", async () => {
    renderPuestos();
    await openRowAction("Arquitecto proyectista", "Editar");
    const panel = await editor("Editar puesto · Arquitecto proyectista");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(panel).getByRole("heading", { name: "Editar puesto · Arquitecto proyectista" }),
      ),
    );

    fireEvent.click(within(panel).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("Acciones de Arquitecto proyectista")),
    );
  });

  it("Escape closes the editor", async () => {
    renderPuestos();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo puesto" }));
    const panel = await editor("Nuevo puesto");
    fireEvent.keyDown(within(panel).getByLabelText("Nombre"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
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

  it("deletes from the editor's Eliminar puesto", async () => {
    actions.deletePositionAction.mockResolvedValue(undefined);
    renderPuestos();

    await openRowAction("Arquitecto proyectista", "Editar");
    const panel = await editor("Editar puesto · Arquitecto proyectista");
    fireEvent.click(within(panel).getByRole("button", { name: "Eliminar puesto" }));
    const dialog = await screen.findByRole("alertdialog");
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
