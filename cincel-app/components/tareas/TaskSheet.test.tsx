// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

const nav = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, refresh: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock("@/components/patterns/FormSheet", async () => {
  const { FormSheetDouble } = await import("./task-sheet.fixtures");
  return { FormSheet: FormSheetDouble };
});

vi.mock("@/lib/actions/tasks-actions", () => ({
  fetchTaskAction: vi.fn(),
  updateTaskAction: vi.fn(),
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
  assignTaskAction: vi.fn(),
  addTaskCommentAction: vi.fn(),
  addTaskAttachmentAction: vi.fn(),
  addChecklistItemAction: vi.fn(),
  updateChecklistItemAction: vi.fn(),
  removeChecklistItemAction: vi.fn(),
  reorderChecklistAction: vi.fn(),
  createSubtaskAction: vi.fn(),
  listSubtasksAction: vi.fn(async () => []),
  listTaskDependenciesAction: vi.fn(async () => ({ dependsOn: [], blocks: [] })),
  addTaskDependencyAction: vi.fn(),
  removeTaskDependencyAction: vi.fn(),
  fetchTasksAction: vi.fn(async () => []),
}));
vi.mock("@/lib/actions/task-statuses-actions", () => ({ fetchTaskStatusesAction: vi.fn(async () => []) }));
vi.mock("@/lib/actions/workflows-actions", () => ({ fetchWorkflowsAction: vi.fn(async () => []) }));
vi.mock("@/lib/actions/staff-actions", () => ({ fetchAssignableStaffAction: vi.fn(async () => []) }));
vi.mock("@/lib/actions/projects-actions", () => ({ fetchProjectSpacesAction: vi.fn(async () => []) }));
vi.mock("@/lib/actions/import-actions", () => ({ getImportDataAction: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => ({ member: { id: "s-1", name: "Ana López" } }),
}));
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

import {
  addTaskCommentAction,
  fetchTaskAction,
  setTaskStatusAction,
  updateTaskAction,
} from "@/lib/actions/tasks-actions";
import { fetchAssignableStaffAction } from "@/lib/actions/staff-actions";
import { fetchProjectSpacesAction } from "@/lib/actions/projects-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";

import {
  TaskSheet,
  TaskSheetRoute,
  activeMention,
  insertMention,
  mentionSuggestions,
  taskSheetHref,
  taskSheetSearch,
} from "./TaskSheet";
import { PHASES, SPACES, STAFF, makeTask, makeWorkflow } from "./task-sheet.fixtures";

/** A real mouse press on a base-ui Select option: pointerdown, then click (base-ui ignores a bare click). */
function pressOption(option: HTMLElement) {
  fireEvent.pointerDown(option, { pointerType: "mouse" });
  fireEvent.click(option);
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

beforeEach(() => {
  nav.search = "";
  nav.replace.mockReset();
  nav.push.mockReset();
  vi.mocked(fetchTaskAction).mockReset().mockResolvedValue(makeTask());
  vi.mocked(updateTaskAction).mockReset().mockResolvedValue(makeTask());
  vi.mocked(setTaskStatusAction).mockReset().mockResolvedValue(makeTask());
  vi.mocked(addTaskCommentAction).mockReset();
  vi.mocked(fetchWorkflowsAction).mockReset().mockResolvedValue([makeWorkflow()]);
  vi.mocked(fetchAssignableStaffAction).mockReset().mockResolvedValue(STAFF as never);
  vi.mocked(fetchProjectSpacesAction).mockReset().mockResolvedValue([]);
});

afterEach(cleanup);

describe("task sheet search params", () => {
  it("sets and removes tarea keeping the other params", () => {
    expect(taskSheetSearch("vista=tablero&tramo=diseno", "t-9")).toBe("?vista=tablero&tramo=diseno&tarea=t-9");
    expect(taskSheetSearch("vista=tablero&tarea=t-9", null)).toBe("?vista=tablero");
    expect(taskSheetSearch("tarea=t-9", null)).toBe("");
    expect(taskSheetHref("/tareas", new URLSearchParams("vista=lista"), "t-2")).toBe("/tareas?vista=lista&tarea=t-2");
  });
});

describe("TaskSheet deep link", () => {
  it("opens from ?tarea=<id> over the mounted view", async () => {
    nav.search = "vista=tablero&tarea=t-1";
    render(<Page />);
    expect(await screen.findByDisplayValue("Planos de conjunto")).toBeTruthy();
    expect(fetchTaskAction).toHaveBeenCalledWith("t-1");
    expect(screen.getByRole("dialog", { name: "Detalle de tarea" })).toBeTruthy();
  });

  it("renders nothing without the param", () => {
    nav.search = "vista=tablero";
    render(<Page />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchTaskAction).not.toHaveBeenCalled();
  });

  it("closing removes tarea with router.replace and the view keeps its state", async () => {
    nav.search = "vista=tablero";
    const view = render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Contar" }));
    fireEvent.click(screen.getByRole("button", { name: "Contar" }));
    const output = screen.getByLabelText("Cuenta");

    nav.search = "vista=tablero&tarea=t-1";
    view.rerender(<Page />);
    await screen.findByDisplayValue("Planos de conjunto");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(nav.replace).toHaveBeenCalledWith("/tareas?vista=tablero", { scroll: false });
    expect(nav.push).not.toHaveBeenCalled();

    nav.search = "vista=tablero";
    view.rerender(<Page />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Same node, same state: the view never unmounted.
    expect(screen.getByLabelText("Cuenta")).toBe(output);
    expect(output.textContent).toBe("2");
  });

  it("browser back (the param disappears) closes the sheet without another navigation", async () => {
    nav.search = "vista=lista&tarea=t-1";
    const view = render(<Page />);
    await screen.findByDisplayValue("Planos de conjunto");

    nav.search = "vista=lista";
    view.rerender(<Page />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Cuenta")).toBeTruthy();
  });

  it("a non-admin opening an admin task by id gets the not-found state and no task data", async () => {
    // The server returns null for an admin task the viewer can't see (BE §7.5).
    vi.mocked(fetchTaskAction).mockResolvedValue(null);
    nav.search = "tarea=t-admin";
    render(<Page />);
    expect(await screen.findByText(/No encontramos esta tarea/)).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Tarea no disponible" })).toBeTruthy();
    expect(screen.queryByLabelText("Título")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Volver a la lista" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/tareas", { scroll: false }));
  });
});

describe("TaskSheet properties", () => {
  it("shows the properties grid, checklist progress, adjuntos and actividad", async () => {
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />);
    await screen.findByDisplayValue("Planos de conjunto");
    for (const term of ["Estatus", "Responsable", "Proyecto", "Tramo", "Prioridad"]) {
      expect(screen.getAllByText(term).length).toBeGreaterThan(0);
    }
    expect(screen.getByLabelText("Fecha compromiso")).toBeTruthy();
    expect(screen.getByLabelText("Revisión")).toBeTruthy();
    expect(screen.getByLabelText("Descripción")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Casa Lomas" }).getAttribute("href")).toBe("/proyectos/p-1");
    expect(screen.getByText("1/2")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Avance del checklist" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Baño PB antes.jpg" })).toBeTruthy();
    expect(screen.getByText("@Ana López ojo con el modelo.")).toBeTruthy();
  });

  it("renders Fase and Espacio when the data exists", async () => {
    vi.mocked(fetchProjectSpacesAction).mockResolvedValue(SPACES);
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />);
    expect(await screen.findByRole("combobox", { name: "Fase" })).toBeTruthy();
    expect(await screen.findByRole("combobox", { name: "Espacio" })).toBeTruthy();
  });

  it("hides Fase and Espacio when there is no catalog and no espacios", async () => {
    vi.mocked(fetchWorkflowsAction).mockResolvedValue([makeWorkflow([])]);
    vi.mocked(fetchTaskAction).mockResolvedValue(makeTask({ phaseId: null, phase: null }));
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />);
    await screen.findByDisplayValue("Planos de conjunto");
    await waitFor(() => expect(fetchProjectSpacesAction).toHaveBeenCalledWith("p-1"));
    expect(screen.queryByRole("combobox", { name: "Fase" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Espacio" })).toBeNull();
    expect(screen.queryByText("Fase")).toBeNull();
    expect(screen.queryByText("Espacio")).toBeNull();
  });

  it("an admin task shows no tramo, fase or espacio", async () => {
    vi.mocked(fetchProjectSpacesAction).mockResolvedValue(SPACES);
    vi.mocked(fetchTaskAction).mockResolvedValue(
      makeTask({ kind: "admin", workflowId: null, workflow: null, phaseId: null, phase: null }),
    );
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />);
    await screen.findByDisplayValue("Planos de conjunto");
    expect(screen.getByText("Administración")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Fase" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Espacio" })).toBeNull();
    expect(fetchProjectSpacesAction).not.toHaveBeenCalled();
  });

  it("saves the fase through updateTaskAction", async () => {
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("combobox", { name: "Fase" }));
    pressOption(await screen.findByRole("option", { name: PHASES[1].name }));
    await waitFor(() => expect(updateTaskAction).toHaveBeenCalledWith("t-1", { phaseId: "f-ejec" }));
  });

  it("changes the status with setTaskStatusAction", async () => {
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />);
    await screen.findByDisplayValue("Planos de conjunto");
    fireEvent.click(screen.getByRole("combobox", { name: "Estatus" }));
    pressOption(await screen.findByRole("option", { name: "En proceso" }));
    await waitFor(() => expect(setTaskStatusAction).toHaveBeenCalledWith("t-1", "en_proceso"));
  });

  it("shows action errors in Spanish", async () => {
    vi.mocked(updateTaskAction).mockRejectedValue(new Error("FORBIDDEN: task edit"));
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

  it("opens a parent task in place with router.push, so back returns to this one", async () => {
    nav.search = "vista=tablero&tarea=t-1";
    vi.mocked(fetchTaskAction).mockResolvedValue(makeTask({ parentTaskId: "t-0", parentTitle: "Proyecto ejecutivo" }));
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Proyecto ejecutivo" }));
    expect(nav.push).toHaveBeenCalledWith("/tareas?vista=tablero&tarea=t-0", { scroll: false });
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

  it("picks a mention with the keyboard and submits through addTaskCommentAction", async () => {
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />);
    await screen.findByDisplayValue("Planos de conjunto");
    await waitFor(() => expect(fetchAssignableStaffAction).toHaveBeenCalled());
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
  });

  it("picks a mention with the mouse", async () => {
    render(<TaskSheet taskId="t-1" onClose={vi.fn()} />);
    await screen.findByDisplayValue("Planos de conjunto");
    await waitFor(() => expect(fetchAssignableStaffAction).toHaveBeenCalled());
    const box = screen.getByLabelText("Comentario") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "@pa" } });
    fireEvent.mouseDown(await screen.findByRole("option", { name: "Paul Langarica" }));
    await waitFor(() => expect(box.value).toBe("@Paul Langarica "));
  });

  it("keeps the text and shows Spanish copy when the comment fails", async () => {
    vi.mocked(addTaskCommentAction).mockRejectedValue(new Error("FORBIDDEN"));
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
