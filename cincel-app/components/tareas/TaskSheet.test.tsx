// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";

const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock("@/components/patterns/FormSheet", async () => {
  const { FormSheetDouble } = await import("./task-sheet.fixtures");
  return { FormSheet: FormSheetDouble };
});

// Loading goes through the seeded query cache; only the page-data call is observed.
vi.mock("@/lib/actions/page-data/tareas-actions", () => ({
  getTaskSheetData: vi.fn(),
  searchProjectTasksAction: vi.fn(async () => []),
  getTareasCalendarData: vi.fn(),
  getTareasStartSlotData: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({
  fetchCatalogProjectOptions: vi.fn(async () => []),
  fetchCatalogWorkflows: vi.fn(async () => []),
  fetchCatalogTaskStatuses: vi.fn(async () => []),
  fetchCatalogStaff: vi.fn(async () => []),
  fetchCatalogAssignableStaff: vi.fn(async () => []),
  fetchCatalogProjectSpaces: vi.fn(async () => []),
  fetchCatalogContacts: vi.fn(async () => []),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({
  updateTaskAction: vi.fn(),
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
  assignTaskAction: vi.fn(),
  addTaskCommentAction: vi.fn(),
  addTaskAttachmentAction: vi.fn(),
  createSubtaskAction: vi.fn(),
  listSubtasksAction: vi.fn(async () => []),
  listTaskDependenciesAction: vi.fn(async () => ({ dependsOn: [], blocks: [] })),
  addTaskDependencyAction: vi.fn(),
  removeTaskDependencyAction: vi.fn(),
}));
vi.mock("@/lib/actions/calendario-actions", () => ({ setTaskEstimatedHoursAction: vi.fn() }));
vi.mock("@/lib/actions/workflows-actions", () => ({ fetchWorkflowAction: vi.fn(async () => null) }));
vi.mock("@/lib/actions/etapa-start-actions", () => ({ previewStartEtapaAction: vi.fn() }));
vi.mock("@/lib/actions/import-actions", () => ({ getImportDataAction: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    resolveActivitiesCapabilities: () => ({
      canViewActivities: true,
      canCreateActivity: true,
      canChangeResponsible: true,
      canDeleteActivity: false,
      canReorderPhases: false,
      canExportData: false,
      statusScope: "all",
    }),
  };
});

import { fetchCatalogProjectSpaces } from "@/lib/actions/page-data/catalog-actions";
import { getTaskSheetData } from "@/lib/actions/page-data/tareas-actions";
import {
  addTaskCommentAction,
  assignTaskAction,
  setTaskStatusAction,
  updateTaskAction,
} from "@/lib/actions/tasks-actions";
import { setTaskEstimatedHoursAction } from "@/lib/actions/calendario-actions";
import { qk } from "@/lib/query/keys";
import { seedTaskSheet } from "@/lib/query/options/tareas";
import type { TaskSheetData } from "@/lib/types/task-sheet";
import type { HistoryEvent, TaskDetail } from "@/lib/types/core";
import { seedSessionUser } from "@/tests/helpers/session-user";

import {
  TaskSheet,
  TaskSheetRoute,
  activeMention,
  formatShortDate,
  insertMention,
  mentionSuggestions,
  taskSheetHref,
  taskSheetSearch,
} from "./TaskSheet";
import { PHASES, SPACES, STAFF, makeSheetData, makeTask } from "./task-sheet.fixtures";

/** A query client holding what `getTaskSheetData` seeds, plus empty subtareas and dependencies. */
function seededClient(data: TaskSheetData = makeSheetData()): QueryClient {
  const client = createTestQueryClient();
  seedTaskSheet(client, data);
  client.setQueryData(qk.tasks.detail(data.task.id), data.task);
  client.setQueryData(qk.tasks.subtasks(data.task.id), []);
  client.setQueryData(qk.tasks.dependencies(data.task.id), { dependsOn: [], blocks: [] });
  return client;
}

function render(ui: React.ReactElement, client: QueryClient = seededClient()) {
  return renderWithQueryClient(ui, { client });
}

/** A real mouse press on a base-ui Select option: pointerdown, then click (base-ui ignores a bare click). */
function pressOption(option: HTMLElement) {
  fireEvent.pointerDown(option, { pointerType: "mouse" });
  fireEvent.click(option);
}

/** The keys `invalidateQueries` was called with. */
function invalidatedKeys(spy: { mock: { calls: unknown[][] } }): unknown[] {
  return spy.mock.calls.map((call) => (call[0] as { queryKey: unknown }).queryKey);
}

/** The view under the sheet, with local state that must survive opening and closing it. */
function Board() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Contar
      </button>
      <output aria-label="Cuenta">{count}</output>
    </div>
  );
}

function Page() {
  return (
    <>
      <Board />
      <TaskSheetRoute />
    </>
  );
}

let pushState: { mock: { calls: unknown[][] } };
let replaceState: { mock: { calls: unknown[][] } };

beforeEach(() => {
  seedSessionUser({ member: { id: "s-1", name: "Ana López" } });
  nav.search = "";
  pushState = vi.spyOn(window.history, "pushState").mockImplementation(() => undefined);
  replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => undefined);
  vi.mocked(getTaskSheetData).mockReset().mockResolvedValue(makeSheetData());
  vi.mocked(fetchCatalogProjectSpaces).mockClear();
  vi.mocked(updateTaskAction).mockReset().mockResolvedValue({ ok: true, data: makeTask() });
  vi.mocked(setTaskStatusAction).mockReset().mockResolvedValue({ ok: true, data: makeTask({ status: "en_proceso" }) });
  vi.mocked(assignTaskAction).mockReset();
  vi.mocked(addTaskCommentAction).mockReset();
});

afterEach(() => {
  cleanup();
  vi.mocked(window.history.pushState).mockRestore();
  vi.mocked(window.history.replaceState).mockRestore();
});

describe("task sheet search params", () => {
  it("sets and removes tarea keeping the other params", () => {
    expect(taskSheetSearch("estilo=visual&etapa=diseno", "t-9")).toBe("?estilo=visual&etapa=diseno&tarea=t-9");
    expect(taskSheetSearch("estilo=visual&tarea=t-9", null)).toBe("?estilo=visual");
    expect(taskSheetSearch("tarea=t-9", null)).toBe("");
    expect(taskSheetHref("/tareas", new URLSearchParams("estilo=analitico"), "t-2")).toBe("/tareas?estilo=analitico&tarea=t-2");
  });

  it("formats a short date with the module formatter", () => {
    expect(formatShortDate("2026-09-29")).toBe("29 sep 2026");
    expect(formatShortDate("sin fecha")).toBe("sin fecha");
  });
});

describe("TaskSheet loading", () => {
  it("opens from the seeded cache without a request", async () => {
    nav.search = "estilo=visual&tarea=t-1";
    render(<Page />);
    expect(await screen.findByDisplayValue("Planos de conjunto")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Detalle de tarea" })).toBeTruthy();
    expect(getTaskSheetData).not.toHaveBeenCalled();
  });

  it("opening makes exactly one getTaskSheetData call, seeds the catalogs, and reopening makes none", async () => {
    const client = createTestQueryClient();
    nav.search = "tarea=t-1";
    const view = render(<Page />, client);
    expect(await screen.findByDisplayValue("Planos de conjunto")).toBeTruthy();
    expect(getTaskSheetData).toHaveBeenCalledTimes(1);
    expect(getTaskSheetData).toHaveBeenCalledWith({ id: "t-1" });
    expect(client.getQueryData(qk.catalog.workflows())).toEqual(makeSheetData().workflows);
    expect(client.getQueryData(qk.catalog.assignableStaff("w-diseno"))).toEqual(makeSheetData().assignable);
    expect(client.getQueryData(qk.catalog.taskStatuses())).toEqual([]);
    expect(client.getQueryData(qk.catalog.projectSpaces("p-1"))).toEqual([]);
    // No catalog action of its own: the selects read the seeded keys.
    expect(fetchCatalogProjectSpaces).not.toHaveBeenCalled();

    nav.search = "";
    view.rerender(<Page />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    nav.search = "tarea=t-1";
    view.rerender(<Page />);
    expect(await screen.findByDisplayValue("Planos de conjunto")).toBeTruthy();
    expect(getTaskSheetData).toHaveBeenCalledTimes(1);
  });

  it("renders nothing without the param", () => {
    nav.search = "estilo=visual";
    render(<Page />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getTaskSheetData).not.toHaveBeenCalled();
  });

  it("a task the viewer can't see (null) gets the not-found state and no task data", async () => {
    vi.mocked(getTaskSheetData).mockResolvedValue(null);
    nav.search = "tarea=t-admin";
    render(<Page />, createTestQueryClient());
    expect(await screen.findByText(/No encontramos esta tarea/)).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Tarea no disponible" })).toBeTruthy();
    expect(screen.queryByLabelText("Título")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Volver a la lista" }));
    await waitFor(() => expect(replaceState.mock.calls).toContainEqual([null, "", "/tareas"]));
  });

  it("a FORBIDDEN load shows Spanish copy", async () => {
    vi.mocked(getTaskSheetData).mockRejectedValue(new Error("FORBIDDEN: tareas"));
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />, createTestQueryClient());
    expect(await screen.findByText("No tienes permiso para realizar esta acción.")).toBeTruthy();
  });
});

describe("TaskSheet shallow navigation", () => {
  it("closing removes tarea with history.replaceState, not the router, and the view keeps its state", async () => {
    nav.search = "estilo=visual";
    const view = render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Contar" }));
    fireEvent.click(screen.getByRole("button", { name: "Contar" }));
    const output = screen.getByLabelText("Cuenta");

    nav.search = "estilo=visual&tarea=t-1";
    view.rerender(<Page />);
    await screen.findByDisplayValue("Planos de conjunto");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(replaceState.mock.calls).toContainEqual([null, "", "/tareas?estilo=visual"]);
    expect(pushState.mock.calls).toEqual([]);

    nav.search = "estilo=visual";
    view.rerender(<Page />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Same node, same state: the view never unmounted.
    expect(screen.getByLabelText("Cuenta")).toBe(output);
    expect(output.textContent).toBe("2");
  });

  it("browser back (the param disappears) closes the sheet without another navigation", async () => {
    nav.search = "estilo=analitico&tarea=t-1";
    const view = render(<Page />);
    await screen.findByDisplayValue("Planos de conjunto");

    nav.search = "estilo=analitico";
    view.rerender(<Page />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(replaceState.mock.calls).toEqual([]);
    expect(pushState.mock.calls).toEqual([]);
    expect(screen.getByLabelText("Cuenta")).toBeTruthy();
  });

  it("opens a parent task in place with history.pushState, so back returns to this one", async () => {
    nav.search = "estilo=visual&tarea=t-1";
    const task = makeTask({ parentTaskId: "t-0", parentTitle: "Proyecto ejecutivo" });
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />, seededClient(makeSheetData(task)));
    fireEvent.click(await screen.findByRole("button", { name: "Proyecto ejecutivo" }));
    expect(pushState.mock.calls).toContainEqual([null, "", "/tareas?estilo=visual&tarea=t-0"]);
    expect(replaceState.mock.calls).toEqual([]);
  });
});

describe("TaskSheet Horas estimadas (#1084)", () => {
  it("shows the 1 h placeholder and its hint while the task has no hours", async () => {
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />);
    const field = (await screen.findByLabelText("Horas estimadas")) as HTMLInputElement;
    expect(field.value).toBe("");
    expect(field.placeholder).toBe("1 h");
    expect(field.step).toBe("0.5");
    expect(screen.getByText("Sin estimar: el calendario cuenta 1 h.")).toBeTruthy();
  });

  it("saves on Enter through the hours action and refreshes the calendar", async () => {
    vi.mocked(setTaskEstimatedHoursAction).mockReset().mockResolvedValue({ ok: true, data: makeTask({ estimatedHours: 2.5 }) });
    const client = seededClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />, client);
    const field = await screen.findByLabelText("Horas estimadas");
    fireEvent.change(field, { target: { value: "2.5" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(setTaskEstimatedHoursAction).toHaveBeenCalledWith("t-1", 2.5));
    await waitFor(() => expect(invalidatedKeys(invalidate)).toContainEqual(qk.calendario.all));
    await waitFor(() => expect((client.getQueryData(qk.tasks.detail("t-1")) as TaskDetail).estimatedHours).toBe(2.5));
  });

  it("an empty field clears the hours and an out-of-range one shows the error without saving", async () => {
    vi.mocked(setTaskEstimatedHoursAction).mockReset().mockResolvedValue({ ok: true, data: makeTask({ estimatedHours: null }) });
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />, seededClient(makeSheetData(makeTask({ estimatedHours: 3 }))));
    const field = (await screen.findByLabelText("Horas estimadas")) as HTMLInputElement;
    expect(field.value).toBe("3");
    fireEvent.change(field, { target: { value: "99" } });
    fireEvent.blur(field);
    expect((await screen.findByRole("alert")).textContent).toBe("Escribe un valor entre 0.5 y 80 horas.");
    expect(setTaskEstimatedHoursAction).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.blur(field);
    await waitFor(() => expect(setTaskEstimatedHoursAction).toHaveBeenCalledWith("t-1", null));
  });
});

describe("TaskSheet properties", () => {
  it("shows the properties grid, adjuntos and actividad", async () => {
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />);
    await screen.findByDisplayValue("Planos de conjunto");
    for (const term of ["Estatus", "Responsable", "Proyecto", "Etapa", "Prioridad"]) {
      expect(screen.getAllByText(term).length).toBeGreaterThan(0);
    }
    expect(screen.getByLabelText("Fecha compromiso")).toBeTruthy();
    expect(screen.getByLabelText("Revisión")).toBeTruthy();
    expect(screen.getByLabelText("Descripción")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Casa Lomas" }).getAttribute("href")).toBe("/proyectos/p-1");
    expect(screen.getByRole("img", { name: "Baño PB antes.jpg" })).toBeTruthy();
    expect(screen.getByText("@Ana López ojo con el modelo.")).toBeTruthy();
  });

  it("renders Fase and Espacio from the seeded catalog keys", async () => {
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />, seededClient(makeSheetData(makeTask(), { spaces: SPACES })));
    expect(await screen.findByRole("combobox", { name: "Fase" })).toBeTruthy();
    expect(await screen.findByRole("combobox", { name: "Espacio" })).toBeTruthy();
    expect(fetchCatalogProjectSpaces).not.toHaveBeenCalled();
  });

  it("hides Fase and Espacio when there is no fase catalog and no espacios", async () => {
    const task = makeTask({ phaseId: null, phase: null });
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />, seededClient(makeSheetData(task, { phases: [] })));
    await screen.findByDisplayValue("Planos de conjunto");
    expect(screen.queryByRole("combobox", { name: "Fase" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Espacio" })).toBeNull();
    expect(screen.queryByText("Fase")).toBeNull();
    expect(screen.queryByText("Espacio")).toBeNull();
  });

  it("an admin task shows no etapa, fase or espacio and reads no espacios", async () => {
    const task = makeTask({ kind: "admin", workflowId: null, workflow: null, phaseId: null, phase: null });
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />, seededClient(makeSheetData(task)));
    await screen.findByDisplayValue("Planos de conjunto");
    expect(screen.getByText("Administración")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Fase" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Espacio" })).toBeNull();
    expect(fetchCatalogProjectSpaces).not.toHaveBeenCalled();
  });

  it("saving the fase writes the result into tasks.detail and invalidates the Tareas views, the project tab and Inicio", async () => {
    const saved = makeTask({ phaseId: "f-ejec", phase: PHASES[1] });
    vi.mocked(updateTaskAction).mockResolvedValue({ ok: true, data: saved });
    const client = seededClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />, client);
    fireEvent.click(await screen.findByRole("combobox", { name: "Fase" }));
    pressOption(await screen.findByRole("option", { name: PHASES[1].name }));
    await waitFor(() => expect(updateTaskAction).toHaveBeenCalledWith("t-1", { phaseId: "f-ejec" }));
    await waitFor(() => expect(client.getQueryData<TaskDetail>(qk.tasks.detail("t-1"))?.phaseId).toBe("f-ejec"));
    await waitFor(() =>
      expect(invalidatedKeys(invalidate)).toEqual(
        expect.arrayContaining([
          ["tareas", "page"],
          ["tareas", "list"],
          ["tareas", "board"],
          ["tareas", "facets"],
          qk.proyectos.tab("p-1", "tareas"),
          qk.inicio(),
        ]),
      ),
    );
    expect(getTaskSheetData).not.toHaveBeenCalled();
  });

  it("changes the status optimistically with setTaskStatusAction and invalidates the status keys", async () => {
    let resolve: (value: { ok: true; data: TaskDetail }) => void = () => undefined;
    vi.mocked(setTaskStatusAction).mockImplementation(() => new Promise((r) => (resolve = r)));
    const client = seededClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />, client);
    await screen.findByDisplayValue("Planos de conjunto");
    fireEvent.click(screen.getByRole("combobox", { name: "Estatus" }));
    pressOption(await screen.findByRole("option", { name: "En proceso" }));
    await waitFor(() => expect(setTaskStatusAction).toHaveBeenCalledWith("t-1", "en_proceso"));
    // Before the server answers, the detail already shows the new status.
    expect(client.getQueryData<TaskDetail>(qk.tasks.detail("t-1"))?.status).toBe("en_proceso");

    await act(async () => resolve({ ok: true, data: makeTask({ status: "en_proceso" }) }));
    await waitFor(() =>
      expect(invalidatedKeys(invalidate)).toEqual(
        expect.arrayContaining([
          ["tareas", "list"],
          ["tareas", "board"],
          ["tareas", "facets"],
          qk.proyectos.tab("p-1", "tareas"),
          qk.proyectos.resumen("p-1"),
          qk.proyectos.cronograma("p-1"),
          qk.inicio(),
          qk.shell.badges(),
        ]),
      ),
    );
  });

  it("a failed status change rolls the detail back and shows Spanish copy", async () => {
    vi.mocked(setTaskStatusAction).mockResolvedValue({ ok: false, error: "FORBIDDEN: task status change" });
    const client = seededClient();
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />, client);
    await screen.findByDisplayValue("Planos de conjunto");
    fireEvent.click(screen.getByRole("combobox", { name: "Estatus" }));
    pressOption(await screen.findByRole("option", { name: "En proceso" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No tienes permiso para realizar esta acción.");
    expect(client.getQueryData<TaskDetail>(qk.tasks.detail("t-1"))?.status).toBe("pendiente");
  });

  it("reassigning writes the result and invalidates the views, Inicio and the badges", async () => {
    vi.mocked(assignTaskAction).mockResolvedValue({
      ok: true,
      data: makeTask({ managerId: "s-3", manager: { id: "s-3", name: "Paul Langarica" } }),
    });
    const client = seededClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />, client);
    await screen.findByDisplayValue("Planos de conjunto");
    fireEvent.click(screen.getByRole("combobox", { name: "Responsable" }));
    pressOption(await screen.findByRole("option", { name: "Paul Langarica" }));
    await waitFor(() => expect(assignTaskAction).toHaveBeenCalledWith("t-1", "s-3"));
    await waitFor(() => expect(client.getQueryData<TaskDetail>(qk.tasks.detail("t-1"))?.managerId).toBe("s-3"));
    await waitFor(() =>
      expect(invalidatedKeys(invalidate)).toEqual(
        expect.arrayContaining([["tareas", "list"], ["tareas", "board"], qk.inicio(), qk.shell.badges()]),
      ),
    );
  });

  it("shows action errors in Spanish", async () => {
    vi.mocked(updateTaskAction).mockResolvedValue({ ok: false, error: "FORBIDDEN: task edit" });
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />);
    const date = await screen.findByLabelText("Fecha compromiso");
    fireEvent.change(date, { target: { value: "2026-12-01" } });
    await waitFor(() => expect(updateTaskAction).toHaveBeenCalledWith("t-1", { commitmentDate: "2026-12-01" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No tienes permiso para realizar esta acción.");
  });

  it("saves title and descripción with Guardar cambios", async () => {
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />);
    const title = await screen.findByLabelText("Título");
    fireEvent.change(title, { target: { value: "Planos de conjunto v2" } });
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Con cotas." } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() =>
      expect(updateTaskAction).toHaveBeenCalledWith("t-1", { title: "Planos de conjunto v2", notes: "Con cotas." }),
    );
  });
});

describe("TaskSheet without a checklist (#1046)", () => {
  it("shows no checklist section or items, only the subtareas", async () => {
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />);
    await screen.findByDisplayValue("Planos de conjunto");
    expect(screen.queryByRole("heading", { name: "Checklist" })).toBeNull();
    expect(screen.queryByRole("progressbar", { name: "Avance del checklist" })).toBeNull();
    // The fixture still carries read-only checklist items: none of them render.
    expect(screen.queryByRole("checkbox", { name: "Subir planos" })).toBeNull();
    expect(screen.queryByText("Medir baños")).toBeNull();
    expect(screen.queryByText("1/2")).toBeNull();
  });
});

describe("comment composer mentions", () => {
  it("finds the mention being typed", () => {
    expect(activeMention("Hola @an", 8)).toEqual({ start: 5, query: "an" });
    expect(activeMention("@", 1)).toEqual({ start: 0, query: "" });
    expect(activeMention("correo@cincel", 13)).toBeNull();
    expect(activeMention("Hola", 4)).toBeNull();
    expect(activeMention("@Ana\nya", 7)).toBeNull();
  });

  it("matches names ignoring case and accents, prefix matches first", () => {
    const staff = STAFF.map(({ id, name }) => ({ id, name }));
    expect(mentionSuggestions(staff, "an").map((s) => s.name)).toEqual(["Ana López", "Andrés Núñez", "Paul Langarica"]);
    expect(mentionSuggestions(staff, "nun").map((s) => s.name)).toEqual(["Andrés Núñez"]);
  });

  it("inserts the full staff name", () => {
    expect(insertMention("Hola @an y", 5, 8, "Ana López")).toEqual({ text: "Hola @Ana López  y", caret: 16 });
  });

  it("picks a mention with the keyboard and adds the comment to the detail's history", async () => {
    const event: HistoryEvent = {
      id: "h-2",
      entity: "task",
      entityId: "t-1",
      kind: "comentario",
      actor: { id: "s-1", name: "Ana López" },
      field: null,
      beforeValue: null,
      afterValue: null,
      comment: "Hola @Andrés Núñez revisa esto",
      eventAt: "2026-11-02T10:00:00.000Z",
    };
    vi.mocked(addTaskCommentAction).mockResolvedValue({ ok: true, data: event });
    const client = seededClient();
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />, client);
    await screen.findByDisplayValue("Planos de conjunto");
    const box = screen.getByLabelText("Comentario") as HTMLTextAreaElement;

    fireEvent.change(box, { target: { value: "Hola @and" } });
    const list = await screen.findByRole("listbox", { name: "Mencionar a" });
    expect(list.textContent).toContain("Andrés Núñez");
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(box.value).toBe("Hola @Andrés Núñez "));
    expect(screen.queryByRole("listbox", { name: "Mencionar a" })).toBeNull();

    fireEvent.change(box, { target: { value: "Hola @Andrés Núñez revisa esto" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Comentar" }));
    });
    expect(addTaskCommentAction).toHaveBeenCalledWith("t-1", "Hola @Andrés Núñez revisa esto");
    await waitFor(() => expect(box.value).toBe(""));
    expect(client.getQueryData<TaskDetail>(qk.tasks.detail("t-1"))?.history.map((h) => h.id)).toEqual(["h-2", "h-1"]);
    expect(await screen.findByText("Hola @Andrés Núñez revisa esto")).toBeTruthy();
    expect(getTaskSheetData).not.toHaveBeenCalled();
  });

  it("picks a mention with the mouse", async () => {
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />);
    await screen.findByDisplayValue("Planos de conjunto");
    const box = screen.getByLabelText("Comentario") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "@pa" } });
    fireEvent.mouseDown(await screen.findByRole("option", { name: "Paul Langarica" }));
    await waitFor(() => expect(box.value).toBe("@Paul Langarica "));
  });

  it("keeps the text and shows Spanish copy when the comment fails", async () => {
    vi.mocked(addTaskCommentAction).mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />);
    await screen.findByDisplayValue("Planos de conjunto");
    const box = screen.getByLabelText("Comentario") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Listo" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Comentar" }));
    });
    expect(await screen.findByText("No tienes permiso para realizar esta acción.")).toBeTruthy();
    expect(box.value).toBe("Listo");
  });
});
