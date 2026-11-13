// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { CATALOG_STAFF, DISENO, PROJECT_OPTIONS, WORKFLOWS } from "./new-task-fixtures";

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(),
}));

const actions = vi.hoisted(() => ({
  fetchCatalogProjectOptions: vi.fn(),
  fetchWorkflowsAction: vi.fn(),
  fetchCatalogAssignableStaff: vi.fn(),
  createUserTaskAction: vi.fn(),
  createSubtaskAction: vi.fn(),
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({
  fetchCatalogProjectOptions: actions.fetchCatalogProjectOptions,
  fetchCatalogAssignableStaff: actions.fetchCatalogAssignableStaff,
}));
vi.mock("@/lib/actions/workflows-actions", () => ({ fetchWorkflowsAction: actions.fetchWorkflowsAction }));
vi.mock("@/lib/actions/tasks-actions", () => ({
  createUserTaskAction: actions.createUserTaskAction,
  createSubtaskAction: actions.createSubtaskAction,
  setTaskStatusAction: actions.setTaskStatusAction,
  setTaskCustomStatusAction: actions.setTaskCustomStatusAction,
}));

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

// The dialog shell is the shared `FormDialog` pattern; a plain shell keeps the
// test on this form's fields and behavior.
vi.mock("@/components/patterns/FormDialog", () => ({
  FormDialog: (props: {
    title: string;
    open: boolean;
    onOpenChange(o: boolean): void;
    onSubmit(): Promise<void>;
    submitLabel: string;
    pending?: boolean;
    error?: string | null;
    children: ReactNode;
  }) =>
    props.open ? (
      <div role="dialog" aria-label={props.title}>
        {props.children}
        {props.error ? <div role="alert">{props.error}</div> : null}
        <button type="button" onClick={() => props.onOpenChange(false)}>
          Cancelar
        </button>
        <button type="button" disabled={props.pending} onClick={() => void props.onSubmit()}>
          {props.submitLabel}
        </button>
      </div>
    ) : null,
}));

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";

import { NewTaskDialog, newTaskInvalidations, newTaskWorkflowsKey, type NewTaskDialogProps } from "./NewTaskDialog";
import { applyTemplate, initialStatusTarget, tramoFases, tramoTemplateTitles } from "./new-task-form";
import { newTaskDefaultsFromSearch, newTaskSearch } from "./use-new-task-param";

/** A real mouse press on a base-ui Select option: pointerdown, then click. */
function pressOption(option: HTMLElement) {
  fireEvent.pointerDown(option, { pointerType: "mouse" });
  fireEvent.click(option);
}

async function pick(trigger: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: trigger }));
  pressOption(await screen.findByRole("option", { name: option }));
}

async function renderDialog(props: Partial<NewTaskDialogProps> = {}, client: QueryClient = createTestQueryClient()) {
  const onOpenChange = vi.fn();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = renderWithQueryClient(<NewTaskDialog open onOpenChange={onOpenChange} {...props} />, { client });
  await waitFor(() => expect(screen.queryByText("Cargando…")).toBeNull());
  await waitFor(() => expect(actions.fetchCatalogAssignableStaff).toHaveBeenCalled());
  await screen.findByRole("combobox", { name: "Responsable" });
  return { onOpenChange, client, invalidate, view };
}

/** The query keys `invalidateQueries` was called with, in order. */
function invalidatedKeys(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map((call) => (call[0] as { queryKey: unknown }).queryKey);
}

function titleInput() {
  return screen.getByRole("textbox", { name: "Título" }) as HTMLInputElement;
}

function subtaskValues() {
  return screen.queryAllByRole("textbox", { name: /^Subtarea \d+$/ }).map((el) => (el as HTMLInputElement).value);
}

beforeEach(() => {
  actions.fetchCatalogProjectOptions.mockResolvedValue(PROJECT_OPTIONS);
  actions.fetchWorkflowsAction.mockResolvedValue(WORKFLOWS);
  actions.fetchCatalogAssignableStaff.mockResolvedValue(CATALOG_STAFF);
  actions.createUserTaskAction.mockResolvedValue({ id: "task-1" });
  actions.createSubtaskAction.mockResolvedValue({ id: "sub-1" });
  actions.setTaskStatusAction.mockResolvedValue({ id: "task-1" });
  actions.setTaskCustomStatusAction.mockResolvedValue({ id: "task-1" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("new-task-form helpers", () => {
  it("lists only the etapa's active fases in catalog order", () => {
    expect(tramoFases(DISENO).map((f) => f.name)).toEqual(["Anteproyecto", "Ejecutivo"]);
    expect(tramoFases(null)).toEqual([]);
  });

  it("takes the active templates of the selected fase, in order", () => {
    expect(tramoTemplateTitles(DISENO, "f-ante")).toEqual(["Levantamiento", "Medidas del sitio"]);
    expect(tramoTemplateTitles(DISENO, null)).toEqual(["Levantamiento", "Medidas del sitio", "Planos de conjunto"]);
  });

  it("appends template titles once and drops empty rows", () => {
    expect(applyTemplate(["", "levantamiento", "Otra"], ["Levantamiento", "Medidas"])).toEqual([
      "levantamiento",
      "Otra",
      "Medidas",
    ]);
  });

  it("sets and removes ?nueva keeping the other params", () => {
    expect(newTaskSearch(new URLSearchParams("estilo=analitico"), true)).toBe("?estilo=analitico&nueva=1");
    expect(newTaskSearch(new URLSearchParams("estilo=analitico&nueva=1"), false)).toBe("?estilo=analitico");
    expect(newTaskSearch(new URLSearchParams("nueva=1"), false)).toBe("");
  });

  it("reads the proyecto and etapa defaults from the URL", () => {
    expect(newTaskDefaultsFromSearch(new URLSearchParams("proyecto=p-1&etapa=diseno&nueva=1"))).toEqual({
      projectId: "p-1",
      tramoKey: "diseno",
    });
    expect(newTaskDefaultsFromSearch(new URLSearchParams("estilo=analitico"))).toEqual({});
  });
});

describe("NewTaskDialog", () => {
  it("loads active projects and etapas through the catalog queries when it opens", async () => {
    const { client } = await renderDialog();
    expect(actions.fetchCatalogProjectOptions).toHaveBeenCalledWith({});
    expect(actions.fetchWorkflowsAction).toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Proyecto" }).textContent).toContain("Casa Roble");
    // The project's current tramo is the default.
    expect(screen.getByRole("combobox", { name: "Etapa" }).textContent).toContain("Diseño");
    expect(actions.fetchCatalogAssignableStaff).toHaveBeenCalledWith({ workflowId: "w-diseno" });
    expect(client.getQueryData(qk.catalog.projectOptions())).toEqual(PROJECT_OPTIONS);
    expect(client.getQueryData(qk.catalog.assignableStaff("w-diseno"))).toEqual(CATALOG_STAFF);
    expect(client.getQueryData(newTaskWorkflowsKey())).toEqual(WORKFLOWS);
  });

  it("leaves non-active projects out of Proyecto", async () => {
    await renderDialog();
    fireEvent.click(screen.getByRole("combobox", { name: "Proyecto" }));
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Casa Roble", "Torre Norte"]);
  });

  it("lists the suggested responsables first", async () => {
    await renderDialog();
    fireEvent.click(screen.getByRole("combobox", { name: "Responsable" }));
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Sin responsable", "Ana López", "Luis Mora"]);
  });

  it("loads nothing while closed", () => {
    renderWithQueryClient(<NewTaskDialog open={false} onOpenChange={vi.fn()} />);
    expect(actions.fetchCatalogProjectOptions).not.toHaveBeenCalled();
    expect(actions.fetchWorkflowsAction).not.toHaveBeenCalled();
    expect(actions.fetchCatalogAssignableStaff).not.toHaveBeenCalled();
  });

  it("issues the catalog calls once when it opens twice in a session", async () => {
    const client = createTestQueryClient();
    const { view } = await renderDialog({}, client);
    view.rerender(<NewTaskDialog open={false} onOpenChange={vi.fn()} />);
    view.rerender(<NewTaskDialog open onOpenChange={vi.fn()} />);
    await screen.findByRole("combobox", { name: "Responsable" });
    expect(actions.fetchCatalogProjectOptions).toHaveBeenCalledTimes(1);
    expect(actions.fetchWorkflowsAction).toHaveBeenCalledTimes(1);
    expect(actions.fetchCatalogAssignableStaff).toHaveBeenCalledTimes(1);
  });

  it("shows a catalog load failure in the form", async () => {
    actions.fetchCatalogProjectOptions.mockRejectedValue(new Error("FORBIDDEN"));
    renderWithQueryClient(<NewTaskDialog open onOpenChange={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toBe("No tienes permiso para realizar esta acción.");
  });

  it("fills the Fase list from the selected etapa only", async () => {
    await renderDialog();
    const trigger = screen.getByRole("combobox", { name: "Fase" });
    expect(trigger.textContent).toContain("Anteproyecto");
    fireEvent.click(trigger);
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Anteproyecto", "Ejecutivo"]);
  });

  it("hides Fase when the etapa has no catalog", async () => {
    await renderDialog();
    await pick("Etapa", "Presale");
    await waitFor(() => expect(screen.queryByRole("combobox", { name: "Fase" })).toBeNull());
  });

  it("follows the project's current etapa until a etapa is picked", async () => {
    await renderDialog();
    await pick("Proyecto", "Torre Norte");
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Etapa" }).textContent).toContain("Presale"));
    expect(screen.queryByRole("combobox", { name: "Fase" })).toBeNull();
  });

  it("prefills project, etapa, title and description from defaults", async () => {
    await renderDialog({
      defaults: { projectId: "p-norte", tramoKey: "diseno", title: "Revisar planos", description: "Del correo" },
    });
    expect(screen.getByRole("combobox", { name: "Proyecto" }).textContent).toContain("Torre Norte");
    expect(screen.getByRole("combobox", { name: "Etapa" }).textContent).toContain("Diseño");
    expect(titleInput().value).toBe("Revisar planos");
    expect((screen.getByRole("textbox", { name: "Descripción" }) as HTMLTextAreaElement).value).toBe("Del correo");
  });

  it("fills subtareas from the etapa template of the selected fase", async () => {
    await renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Usar plantilla de la etapa" }));
    expect(subtaskValues()).toEqual(["Levantamiento", "Medidas del sitio"]);

    await pick("Fase", "Ejecutivo");
    fireEvent.click(screen.getByRole("button", { name: "Usar plantilla de la etapa" }));
    expect(subtaskValues()).toEqual(["Levantamiento", "Medidas del sitio", "Planos de conjunto"]);
  });

  it("hides the template link when the etapa has no templates", async () => {
    await renderDialog();
    await pick("Etapa", "Presale");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Usar plantilla de la etapa" })).toBeNull());
  });

  it("adds and removes subtareas by hand", async () => {
    await renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Agregar subtarea" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Subtarea 1" }), { target: { value: "Cotizar" } });
    expect(subtaskValues()).toEqual(["Cotizar"]);
    fireEvent.click(screen.getByRole("button", { name: "Quitar subtarea 1" }));
    expect(subtaskValues()).toEqual([]);
  });

  it("shows the FE §9 copy for an empty title and doesn't call the action", async () => {
    await renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Crear tarea" }));
    expect(await screen.findByText("Escribe un nombre.")).toBeTruthy();
    expect(titleInput().getAttribute("aria-invalid")).toBe("true");
    expect(titleInput().getAttribute("aria-describedby")).toBeTruthy();
    expect(actions.createUserTaskAction).not.toHaveBeenCalled();
  });

  it("shows INVALID copy when there is no active project", async () => {
    actions.fetchCatalogProjectOptions.mockResolvedValue([]);
    await renderDialog();
    expect(screen.getByText("No hay proyectos activos disponibles")).toBeTruthy();
    fireEvent.change(titleInput(), { target: { value: "Algo" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tarea" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.",
    );
    expect(actions.createUserTaskAction).not.toHaveBeenCalled();
  });

  it("shows server errors through actionErrorText and stays open", async () => {
    actions.createUserTaskAction.mockRejectedValue(new Error("FORBIDDEN"));
    const { onOpenChange, invalidate } = await renderDialog();
    fireEvent.change(titleInput(), { target: { value: "Planos" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tarea" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No tienes permiso para realizar esta acción.");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(toasts.error).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("maps PHASE_MISMATCH to its copy", async () => {
    actions.createUserTaskAction.mockRejectedValue(new Error("PHASE_MISMATCH: f-ante"));
    await renderDialog();
    fireEvent.change(titleInput(), { target: { value: "Planos" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tarea" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Esa fase no pertenece a la etapa de la tarea.");
  });

  it("creates the task and its subtareas, closes and invalidates the views showing tasks", async () => {
    const { onOpenChange, invalidate } = await renderDialog();
    fireEvent.change(titleInput(), { target: { value: "  Planos de fachada " } });
    await pick("Fase", "Ejecutivo");
    await pick("Responsable", "Ana López");
    fireEvent.change(screen.getByLabelText("Fecha de entrega"), { target: { value: "2026-11-20" } });
    fireEvent.click(screen.getByRole("radio", { name: "Alta" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Descripción" }), { target: { value: "Con cotas" } });
    fireEvent.click(screen.getByRole("button", { name: "Usar plantilla de la etapa" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear tarea" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(actions.createUserTaskAction).toHaveBeenCalledWith({
      projectId: "p-roble",
      title: "Planos de fachada",
      notes: "Con cotas",
      workflowId: "w-diseno",
      phaseId: "f-ejecutivo",
      managerId: "s-ana",
      priority: "alta",
      deliveryDate: "2026-11-20",
    });
    expect(actions.createSubtaskAction).toHaveBeenCalledWith("task-1", {
      title: "Planos de conjunto",
      managerId: "s-ana",
      priority: "alta",
    });
    expect(toasts.success).toHaveBeenCalledWith("Tarea creada");
    await waitFor(() =>
      expect(invalidatedKeys(invalidate)).toEqual(newTaskInvalidations("p-roble", { taskId: "task-1", withSubtasks: true })),
    );
    expect(invalidatedKeys(invalidate)).toEqual([
      ["tareas"],
      ["proyectos", "p-roble", "tareas"],
      ["proyectos", "p-roble", "shell"],
      ["proyectos", "p-roble", "resumen"],
      ["proyectos", "list"],
      ["inicio"],
      ["shell", "badges"],
      ["me", "tasks"],
      ["tasks", "task-1"],
      ["tasks", "task-1", "subtasks"],
    ]);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("invalidates no subtask keys for a task without subtareas", async () => {
    const { onOpenChange, invalidate } = await renderDialog();
    fireEvent.change(titleInput(), { target: { value: "Planos" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tarea" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    await waitFor(() => expect(invalidatedKeys(invalidate)).toEqual(newTaskInvalidations("p-roble")));
  });

  it("unwraps ActionResult-shaped results", async () => {
    actions.createUserTaskAction.mockResolvedValue({ ok: true, data: { id: "task-9" } });
    actions.createSubtaskAction.mockResolvedValue({ ok: false, error: "NESTED" });
    const { onOpenChange } = await renderDialog();
    fireEvent.change(titleInput(), { target: { value: "Planos" } });
    fireEvent.click(screen.getByRole("button", { name: "Usar plantilla de la etapa" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear tarea" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(actions.createSubtaskAction.mock.calls[0][0]).toBe("task-9");
    expect(toasts.error).toHaveBeenCalledWith("No se pudo completar la acción. Intenta de nuevo.");
  });

  it("saves no fase for a etapa without a catalog", async () => {
    await renderDialog();
    await pick("Etapa", "Presale");
    fireEvent.change(titleInput(), { target: { value: "Primera visita" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tarea" }));
    await waitFor(() => expect(actions.createUserTaskAction).toHaveBeenCalled());
    expect(actions.createUserTaskAction.mock.calls[0][0]).toMatchObject({ workflowId: "w-presale", phaseId: null });
  });

  it("reports a failed subtarea without blocking the created task", async () => {
    actions.createSubtaskAction.mockRejectedValue(new Error("NESTED"));
    const { onOpenChange } = await renderDialog();
    fireEvent.change(titleInput(), { target: { value: "Planos" } });
    fireEvent.click(screen.getByRole("button", { name: "Usar plantilla de la etapa" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear tarea" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(actions.createSubtaskAction).toHaveBeenCalledTimes(2);
    expect(toasts.success).toHaveBeenCalledWith("Tarea creada");
    expect(toasts.error).toHaveBeenCalledWith("No se pudo completar la acción. Intenta de nuevo.");
    expect(toasts.error).toHaveBeenCalledTimes(1);
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("NewTaskDialog · board column (Tablero “+ Agregar”)", () => {
  it("initialStatusTarget skips no column and the column the task already sits in", () => {
    expect(initialStatusTarget(undefined, { status: "pendiente" })).toBeNull();
    expect(initialStatusTarget("pendiente", { status: "pendiente", customStatus: null })).toBeNull();
    expect(initialStatusTarget("en_proceso", { status: "pendiente" })).toEqual({ kind: "base", status: "en_proceso" });
    expect(initialStatusTarget("custom:cs-qa", { status: "pendiente" })).toEqual({ kind: "custom", id: "cs-qa" });
    expect(initialStatusTarget("custom:cs-qa", { status: "pendiente", customStatus: { id: "cs-qa" } })).toBeNull();
  });

  it("creates the task, then moves it to the preselected base estatus", async () => {
    actions.createUserTaskAction.mockResolvedValue({ id: "task-1", status: "pendiente", customStatus: null });
    const { onOpenChange } = await renderDialog({ defaults: { status: "en_proceso" } });
    fireEvent.change(titleInput(), { target: { value: "Render sala" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tarea" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(actions.setTaskStatusAction).toHaveBeenCalledWith("task-1", "en_proceso");
    expect(actions.setTaskCustomStatusAction).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("moves it to a custom:<id> column through setTaskCustomStatusAction", async () => {
    actions.createUserTaskAction.mockResolvedValue({ id: "task-1", status: "pendiente", customStatus: null });
    await renderDialog({ defaults: { status: "custom:cs-qa" } });
    fireEvent.change(titleInput(), { target: { value: "Revisión QA" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tarea" }));

    await waitFor(() => expect(actions.setTaskCustomStatusAction).toHaveBeenCalledWith("task-1", "cs-qa"));
    expect(actions.setTaskStatusAction).not.toHaveBeenCalled();
  });

  it("makes no status call for the Pendiente column", async () => {
    actions.createUserTaskAction.mockResolvedValue({ id: "task-1", status: "pendiente", customStatus: null });
    const { onOpenChange } = await renderDialog({ defaults: { status: "pendiente" } });
    fireEvent.change(titleInput(), { target: { value: "Levantamiento" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tarea" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(actions.setTaskStatusAction).not.toHaveBeenCalled();
    expect(actions.setTaskCustomStatusAction).not.toHaveBeenCalled();
  });

  it("reports a failed status move without blocking the created task", async () => {
    actions.createUserTaskAction.mockResolvedValue({ id: "task-1", status: "pendiente", customStatus: null });
    actions.setTaskStatusAction.mockRejectedValue(new Error("FORBIDDEN: task status change"));
    const { onOpenChange } = await renderDialog({ defaults: { status: "bloqueado" } });
    fireEvent.change(titleInput(), { target: { value: "Permiso" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tarea" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(actions.createUserTaskAction).toHaveBeenCalledTimes(1);
    expect(toasts.success).toHaveBeenCalledWith("Tarea creada");
    expect(toasts.error).toHaveBeenCalledWith("No tienes permiso para realizar esta acción.");
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
