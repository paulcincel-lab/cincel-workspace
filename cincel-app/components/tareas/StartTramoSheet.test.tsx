// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { StartTramoPreview, StartTramoResult } from "@/lib/types/core";
import type { StartSlotCandidate } from "@/lib/types/tareas-start-slot";

const actions = vi.hoisted(() => ({
  previewStartTramoAction: vi.fn(),
  startTramoAction: vi.fn(),
  undoStartTramoAction: vi.fn(),
}));
vi.mock("@/lib/actions/tramo-start-actions", () => actions);
vi.mock("@/lib/actions/page-data/tareas-actions", () => ({ getTareasStartSlotData: vi.fn() }));

import { candidatesText, sampleTasksText, StartTramoSheet } from "./StartTramoSheet";

/** A real mouse press on a base-ui Select option: pointerdown, then click (base-ui ignores a bare click). */
function pressOption(option: HTMLElement) {
  fireEvent.pointerDown(option, { pointerType: "mouse" });
  fireEvent.click(option);
}

const workflow = { id: "w-diseno", key: "diseno", name: "Diseño", sortOrder: 2 };

const staff: StartSlotCandidate[] = [
  { id: "s-ana", name: "Ana López", suggested: true },
  { id: "s-luis", name: "Luis Pérez", suggested: true },
  { id: "s-eva", name: "Eva Ruiz", suggested: false },
];

function preview(overrides: Partial<StartTramoPreview> = {}): StartTramoPreview {
  return {
    project: { id: "p-1", name: "Casa Roble" },
    workflow,
    alreadyStarted: false,
    autoStart: false,
    phases: [
      {
        phase: { id: "f-ante", name: "Anteproyecto", sortOrder: 1 },
        templates: [
          { id: "t1", title: "Planos de conjunto" },
          { id: "t2", title: "Fachadas" },
        ],
        existing: 0,
        candidates: [
          { id: "s-luis", name: "Luis Pérez", positions: ["Proyectista"], openTasks: 7 },
          { id: "s-ana", name: "Ana López", positions: ["Proyectista ejecutivo"], openTasks: 2 },
        ],
      },
      {
        phase: { id: "f-ejec", name: "Ejecutivo", sortOrder: 3 },
        templates: [
          { id: "t3", title: "Planos de conjunto" },
          { id: "t4", title: "Fachadas" },
          { id: "t5", title: "Cortes" },
          { id: "t6", title: "Detalles" },
          { id: "t7", title: "Instalaciones" },
        ],
        existing: 0,
        candidates: [],
      },
      {
        phase: { id: "f-proy", name: "Proyecto Arquitectónico", sortOrder: 2 },
        templates: [],
        existing: 4,
        candidates: [],
      },
    ],
    ...overrides,
  };
}

const result: StartTramoResult = {
  batchId: "b-1",
  createdCount: 2,
  skippedCount: 0,
  stageCreated: true,
  project: { id: "p-1", name: "Casa Roble" },
  workflow,
};

type SheetProps = ComponentProps<typeof StartTramoSheet>;

function renderSheet(overrides: Partial<SheetProps> = {}, client = createTestQueryClient()) {
  const onStarted = vi.fn();
  const onClose = vi.fn();
  const element = (props: Partial<SheetProps>) => (
    <StartTramoSheet
      open
      projectId="p-1"
      workflow={workflow}
      viewerId="s-ana"
      isAdmin={false}
      staff={staff}
      onClose={onClose}
      onStarted={onStarted}
      {...props}
    />
  );
  const view = renderWithQueryClient(element(overrides), { client });
  return { onStarted, onClose, client, rerender: (props: Partial<SheetProps>) => view.rerender(element(props)) };
}

function createButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /^Crear \d+ tareas$/ }) as HTMLButtonElement;
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
});
afterEach(cleanup);

describe("sheet text helpers", () => {
  it("shows up to three sample tasks and a remainder", () => {
    expect(sampleTasksText(["A", "B"])).toBe("A, B");
    expect(sampleTasksText(["Planos de conjunto", "Fachadas", "Cortes", "D", "E", "F", "G"])).toBe(
      "Planos de conjunto, Fachadas, Cortes y 4 más",
    );
  });

  it("lists candidates by lower load with their puestos, or Sin candidatos", () => {
    expect(candidatesText([])).toBe("Sin candidatos");
    expect(
      candidatesText([
        { id: "a", name: "Luis P.", positions: [], openTasks: 5 },
        { id: "b", name: "Ana López", positions: ["Proyectista ejecutivo"], openTasks: 1 },
      ]),
    ).toBe("Candidatos: Ana López (Proyectista ejecutivo), Luis P.");
  });
});

describe("StartTramoSheet", () => {
  it("loads the preview and renders fases in catalog order with counts, samples and candidates", async () => {
    actions.previewStartTramoAction.mockResolvedValue(preview());
    renderSheet();

    expect(await screen.findByText("Iniciar Diseño · Casa Roble")).toBeTruthy();
    expect(actions.previewStartTramoAction).toHaveBeenCalledWith("p-1", "w-diseno");

    const boxes = screen.getAllByRole("checkbox", { name: /tareas$/ });
    expect(boxes.map((b) => b.getAttribute("aria-label"))).toEqual(["Anteproyecto · 2 tareas", "Ejecutivo · 5 tareas"]);
    expect(boxes.every((b) => b.getAttribute("aria-checked") === "true")).toBe(true);

    expect(screen.getByText("Planos de conjunto, Fachadas, Cortes y 2 más")).toBeTruthy();
    expect(screen.getByText("Candidatos: Ana López (Proyectista ejecutivo), Luis Pérez (Proyectista)")).toBeTruthy();
    expect(screen.getByText("Sin candidatos")).toBeTruthy();
  });

  it("leaves out fases whose tasks all exist and names them under the list", async () => {
    actions.previewStartTramoAction.mockResolvedValue(preview());
    renderSheet();

    expect(await screen.findByText("Ya tienen sus tareas: Proyecto Arquitectónico.")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Proyecto Arquitectónico/ })).toBeNull();
  });

  it("updates the Crear N tareas count as fases are unchecked", async () => {
    actions.previewStartTramoAction.mockResolvedValue(preview());
    renderSheet();

    await screen.findByText("Iniciar Diseño · Casa Roble");
    expect(createButton().textContent).toBe("Crear 7 tareas");

    fireEvent.click(screen.getByRole("checkbox", { name: "Ejecutivo · 5 tareas" }));
    await waitFor(() => expect(createButton().textContent).toBe("Crear 2 tareas"));

    fireEvent.click(screen.getByRole("checkbox", { name: "Anteproyecto · 2 tareas" }));
    await waitFor(() => expect(createButton().textContent).toBe("Crear 0 tareas"));
    expect(createButton().disabled).toBe(true);
  });

  it("starts only the checked fases with Asignarme todas by default", async () => {
    actions.previewStartTramoAction.mockResolvedValue(preview());
    actions.startTramoAction.mockResolvedValue(result);
    const { onStarted, onClose } = renderSheet();

    await screen.findByText("Iniciar Diseño · Casa Roble");
    fireEvent.click(screen.getByRole("checkbox", { name: "Ejecutivo · 5 tareas" }));
    await waitFor(() => expect(createButton().textContent).toBe("Crear 2 tareas"));
    fireEvent.click(createButton());

    await waitFor(() =>
      expect(actions.startTramoAction).toHaveBeenCalledWith({
        projectId: "p-1",
        workflowId: "w-diseno",
        phaseIds: ["f-ante"],
        assignment: { mode: "self" },
      }),
    );
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(result));
    expect(onClose).toHaveBeenCalled();
  });

  it("Por fase preselects the least-loaded candidate and leaves fases without candidates unassigned", async () => {
    actions.previewStartTramoAction.mockResolvedValue(preview());
    actions.startTramoAction.mockResolvedValue(result);
    renderSheet();

    await screen.findByText("Iniciar Diseño · Casa Roble");
    fireEvent.click(screen.getByRole("radio", { name: "Por fase con candidatos" }));

    const ante = await screen.findByRole("combobox", { name: "Responsable de Anteproyecto" });
    expect(ante.textContent).toContain("Ana López");
    const ejec = screen.getByRole("combobox", { name: "Responsable de Ejecutivo" });
    expect(ejec.textContent).toContain("Sin asignar");

    fireEvent.click(createButton());
    await waitFor(() =>
      expect(actions.startTramoAction).toHaveBeenCalledWith({
        projectId: "p-1",
        workflowId: "w-diseno",
        phaseIds: ["f-ante", "f-ejec"],
        assignment: { mode: "by_phase", managers: { "f-ante": "s-ana", "f-ejec": null } },
      }),
    );
  });

  it("Por fase lets any staff member be picked from Todo el equipo", async () => {
    actions.previewStartTramoAction.mockResolvedValue(preview());
    actions.startTramoAction.mockResolvedValue(result);
    renderSheet();

    await screen.findByText("Iniciar Diseño · Casa Roble");
    fireEvent.click(screen.getByRole("radio", { name: "Por fase con candidatos" }));
    fireEvent.click(await screen.findByRole("combobox", { name: "Responsable de Ejecutivo" }));
    pressOption(await screen.findByRole("option", { name: "Eva Ruiz" }));

    fireEvent.click(createButton());
    await waitFor(() =>
      expect(actions.startTramoAction).toHaveBeenCalledWith(
        expect.objectContaining({
          assignment: { mode: "by_phase", managers: { "f-ante": "s-ana", "f-ejec": "s-eva" } },
        }),
      ),
    );
  });

  it("sends Sin asignar", async () => {
    actions.previewStartTramoAction.mockResolvedValue(preview());
    actions.startTramoAction.mockResolvedValue(result);
    renderSheet();

    await screen.findByText("Iniciar Diseño · Casa Roble");
    fireEvent.click(screen.getByRole("radio", { name: "Sin asignar" }));
    fireEvent.click(createButton());
    await waitFor(() =>
      expect(actions.startTramoAction).toHaveBeenCalledWith(expect.objectContaining({ assignment: { mode: "none" } })),
    );
  });

  it("renders the auto-start checkbox only for admins and sends it only when changed", async () => {
    actions.previewStartTramoAction.mockResolvedValue(preview());
    renderSheet();
    await screen.findByText("Iniciar Diseño · Casa Roble");
    expect(screen.queryByText("Iniciar Diseño automáticamente en los próximos proyectos")).toBeNull();
    cleanup();

    actions.previewStartTramoAction.mockResolvedValue(preview({ autoStart: true }));
    actions.startTramoAction.mockResolvedValue(result);
    renderSheet({ isAdmin: true });
    await screen.findByText("Iniciar Diseño · Casa Roble");
    const box = screen.getByRole("checkbox", { name: "Iniciar Diseño automáticamente en los próximos proyectos" });
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Cambia la configuración para todo el despacho.")).toBeTruthy();

    fireEvent.click(box);
    await waitFor(() => expect(box.getAttribute("aria-checked")).toBe("false"));
    fireEvent.click(screen.getByRole("radio", { name: "Asignarme todas" }));
    fireEvent.click(createButton());
    await waitFor(() =>
      expect(actions.startTramoAction).toHaveBeenCalledWith(
        expect.objectContaining({ autoStart: false, assignment: { mode: "self" } }),
      ),
    );
  });

  it("does not send autoStart when the admin left it unchanged", async () => {
    actions.previewStartTramoAction.mockResolvedValue(preview());
    actions.startTramoAction.mockResolvedValue(result);
    renderSheet({ isAdmin: true });
    await screen.findByText("Iniciar Diseño · Casa Roble");
    fireEvent.click(createButton());
    await waitFor(() => expect(actions.startTramoAction).toHaveBeenCalled());
    expect(actions.startTramoAction.mock.calls[0][0]).not.toHaveProperty("autoStart");
  });

  it("shows the error copy inline when the start fails", async () => {
    actions.previewStartTramoAction.mockResolvedValue(preview());
    actions.startTramoAction.mockRejectedValue(new Error("FORBIDDEN: canCreateActivity"));
    const { onStarted } = renderSheet();

    await screen.findByText("Iniciar Diseño · Casa Roble");
    fireEvent.click(createButton());
    expect(await screen.findByText("No tienes permiso para realizar esta acción.")).toBeTruthy();
    expect(onStarted).not.toHaveBeenCalled();
  });

  it("shows the nothing-to-create state when the tramo is started and every fase has its tasks", async () => {
    actions.previewStartTramoAction.mockResolvedValue(
      preview({
        alreadyStarted: true,
        phases: [
          { phase: { id: "f-ante", name: "Anteproyecto", sortOrder: 1 }, templates: [], existing: 2, candidates: [] },
        ],
      }),
    );
    renderSheet();

    expect(await screen.findByText("Diseño ya está iniciado en Casa Roble y no hay tareas nuevas que crear.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Crear/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Cerrar" }).length).toBeGreaterThan(0);
  });

  it("shows the load error with Reintentar, which loads again", async () => {
    actions.previewStartTramoAction.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(preview());
    renderSheet();

    expect(await screen.findByText("No se pudo cargar la plantilla de Diseño.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Iniciar Diseño · Casa Roble")).toBeTruthy();
    expect(actions.previewStartTramoAction).toHaveBeenCalledTimes(2);
  });

  it("shows the error copy of a failed ActionResult inline and invalidates nothing", async () => {
    actions.previewStartTramoAction.mockResolvedValue(preview());
    actions.startTramoAction.mockResolvedValue({ ok: false, error: "NO_PHASES" });
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { onStarted } = renderSheet({}, client);

    await screen.findByText("Iniciar Diseño · Casa Roble");
    fireEvent.click(createButton());
    await waitFor(() => expect(actions.startTramoAction).toHaveBeenCalled());
    await waitFor(() => expect(createButton().textContent).toBe("Crear 7 tareas"));
    expect(onStarted).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("StartTramoSheet queries", () => {
  it("reads the preview only while the sheet is open", async () => {
    actions.previewStartTramoAction.mockResolvedValue(preview());
    const { rerender } = renderSheet({ open: false, projectId: null });
    await Promise.resolve();
    expect(actions.previewStartTramoAction).not.toHaveBeenCalled();

    rerender({ open: false, projectId: "p-1" });
    await Promise.resolve();
    expect(actions.previewStartTramoAction).not.toHaveBeenCalled();

    rerender({ open: true, projectId: "p-1" });
    expect(await screen.findByText("Iniciar Diseño · Casa Roble")).toBeTruthy();
    expect(actions.previewStartTramoAction).toHaveBeenCalledTimes(1);
    expect(actions.previewStartTramoAction).toHaveBeenCalledWith("p-1", "w-diseno");
  });

  it("reads a fresh preview every time the sheet opens (staleTime 0) under qk.tareas.startPreview", async () => {
    actions.previewStartTramoAction.mockResolvedValue(preview());
    const { rerender, client } = renderSheet();
    await screen.findByText("Iniciar Diseño · Casa Roble");
    expect(client.getQueryData(qk.tareas.startPreview("p-1", "w-diseno"))).toEqual(preview());

    rerender({ open: false });
    rerender({ open: true });
    await waitFor(() => expect(actions.previewStartTramoAction).toHaveBeenCalledTimes(2));
  });

  it("the start mutation invalidates the start slot, Tareas, the project, the options, Inicio and the badges", async () => {
    actions.previewStartTramoAction.mockResolvedValue(preview());
    actions.startTramoAction.mockResolvedValue({ ok: true, data: result });
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { onStarted, onClose } = renderSheet({}, client);

    await screen.findByText("Iniciar Diseño · Casa Roble");
    fireEvent.click(createButton());
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(result));
    expect(onClose).toHaveBeenCalled();

    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual([
      qk.tareas.startSlot("w-diseno"),
      qk.tareas.all,
      qk.proyectos.list(),
      qk.proyectos.detail("p-1"),
      qk.catalog.projectOptions(),
      qk.inicio(),
      qk.shell.badges(),
    ]);
  });
});
