// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const refresh = vi.fn();
const push = vi.fn();
const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push, replace: vi.fn() }),
  usePathname: () => "/proyectos/p1/tareas",
  useSearchParams: () => nav.params,
}));

// The page prefetches `qk.proyectos.tab(id, 'tareas')`; a client call here would be a bug.
const actions = vi.hoisted(() => ({ getProyectoTareasData: vi.fn() }));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => actions);

import { StyleProvider } from "@/components/shell/StyleProvider";
import { qk } from "@/lib/query/keys";
import { proyectoTareasOptions } from "@/lib/query/options/proyectos";
import { prefetch } from "@/lib/query/server";
import { createTestQueryClient, hydrationRoundtrip, renderWithQueryClient } from "@/lib/query/test-utils";
import { resetNewTaskUi, useNewTaskUi } from "@/lib/stores/new-task-store";
import {
  buildGroupsTable,
  buildTasksTable,
  dueDaysText,
  estadoCounts,
  filterByPersonAndSearch,
  formatDueDate,
  groupProjectTasks,
  parseProjectTasksQuery,
  projectTasksHref,
  topLevelTasks,
} from "@/lib/proyectos/project-tasks-by-fase";
import type { TaskListItem, TaskListRow, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";
import type { PresentationStyle } from "@/lib/types/redesign";

import { PROJECT_TASKS_SEARCH_DEBOUNCE_MS, ProjectTareasTab, ProjectTasksByFase } from "./ProjectTasksByFase";

const TODAY = "2026-11-06";
const PRESALE: WorkflowRef = { id: "w1", key: "presale", name: "Presale", sortOrder: 1 };
const CONSTRUCCION: WorkflowRef = { id: "w3", key: "construccion", name: "Construcción", sortOrder: 3 };
const DEMOLICIONES: WorkflowPhaseRef = { id: "f1", name: "Demoliciones", sortOrder: 1 };
const INSTALACIONES: WorkflowPhaseRef = { id: "f2", name: "Instalaciones", sortOrder: 2 };
const PAUL = { id: "s1", name: "Paul Langarica" };
const JUANMA = { id: "s2", name: "Juanma" };

function task(id: string, overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id,
    projectId: "p1",
    kind: "workflow",
    title: `Tarea ${id}`,
    status: "pendiente",
    customStatus: null,
    workflow: CONSTRUCCION,
    workflowId: CONSTRUCCION.id,
    phase: null,
    phaseId: null,
    manager: PAUL,
    managerId: PAUL.id,
    support: [],
    commitmentDate: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    parentTaskId: null,
    parentTitle: null,
    checklist: { total: 0, completed: 0 },
    archived: false,
    ...overrides,
  } as TaskListItem;
}

const FASE_TASKS: TaskListItem[] = [
  task("t1", { phase: DEMOLICIONES, status: "completado", title: "Retiro de muros interiores", subtaskCount: 3, subtaskDoneCount: 3 }),
  task("t2", { phase: DEMOLICIONES, status: "completado", title: "Retiro de cascajo" }),
  task("t3", {
    phase: INSTALACIONES,
    status: "en_proceso",
    title: "Pruebas de presión hidráulica",
    manager: JUANMA,
    managerId: JUANMA.id,
    commitmentDate: "2026-11-12",
    subtaskCount: 4,
    subtaskDoneCount: 2,
  }),
  task("t4", { phase: INSTALACIONES, title: "Cambiar tapas a WC", commitmentDate: "2026-10-02", manager: null, managerId: null }),
  task("t5", { phase: INSTALACIONES, status: "completado", title: "Tablero eléctrico" }),
  task("t6", { phase: INSTALACIONES, title: "Subtarea de tablero", parentTaskId: "t5" }),
  task("t7", { kind: "admin", workflow: null, workflowId: null, title: "Asignar cliente y origen" }),
];

const TRAMO_TASKS: TaskListItem[] = [
  task("a1", { workflow: PRESALE, workflowId: PRESALE.id, status: "completado", title: "Levantamiento" }),
  task("a2", { workflow: PRESALE, workflowId: PRESALE.id, title: "Cotización" }),
  task("a3", { title: "Obra negra" }),
  task("a4", { workflow: null, workflowId: null, kind: "usuario", title: "Tarea suelta" }),
];

afterEach(() => {
  cleanup();
  refresh.mockReset();
  push.mockReset();
  actions.getProyectoTareasData.mockReset();
  nav.params = new URLSearchParams();
  resetNewTaskUi();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

/** The estado chip with `label` in the filters bar. */
function estadoChip(label: string): HTMLElement {
  const chip = within(screen.getByRole("group", { name: "Filtros" })).getByText(label).closest("a");
  if (!chip) throw new Error(`no chip ${label}`);
  return chip;
}

/** The URL of the last `history.replaceState` call. */
function lastReplacedUrl(spy: { mock: { calls: unknown[][] } }): string | undefined {
  const call = spy.mock.calls.at(-1);
  return call ? String(call[2]) : undefined;
}

describe("groupProjectTasks", () => {
  it("groups by fase in catalog order with progress per group", () => {
    const { mode, groups } = groupProjectTasks(FASE_TASKS, { includeAdmin: false, today: TODAY });
    expect(mode).toBe("fase");
    expect(groups.map((g) => [g.label, g.total, g.completed, g.progressPct])).toEqual([
      ["Demoliciones", 2, 2, 100],
      ["Instalaciones", 3, 1, 33],
    ]);
    const instalaciones = groups[1];
    expect(instalaciones.inProgress).toBe(1);
    expect(instalaciones.pending).toBe(1);
    expect(instalaciones.lateOrBlocked).toBe(1);
    expect(instalaciones.tramo?.key).toBe("construccion");
  });

  it("lists subtareas on their parent, not as rows", () => {
    const { groups } = groupProjectTasks(FASE_TASKS, { includeAdmin: false, today: TODAY });
    expect(groups.flatMap((g) => g.tasks.map((t) => t.id))).not.toContain("t6");
    expect(topLevelTasks([task("x", { parentTaskId: "gone" })]).map((t) => t.id)).toEqual(["x"]);
  });

  it("falls back to tramo groups when no task has a fase", () => {
    const { mode, groups } = groupProjectTasks(TRAMO_TASKS, { includeAdmin: false, today: TODAY });
    expect(mode).toBe("tramo");
    expect(groups.map((g) => [g.label, g.kind, g.total, g.progressPct])).toEqual([
      ["Presale", "tramo", 2, 50],
      ["Construcción", "tramo", 1, 0],
      ["Sin tramo", "sin_tramo", 1, 0],
    ]);
    expect(groups.every((g) => g.phase === null)).toBe(true);
  });

  it("prefixes the tramo when fases of several tramos are shown", () => {
    const tasks = [
      task("p", { workflow: PRESALE, workflowId: PRESALE.id, phase: { id: "fp", name: "Inicial", sortOrder: 1 } }),
      task("c", { phase: DEMOLICIONES }),
    ];
    const { groups } = groupProjectTasks(tasks, { includeAdmin: false, today: TODAY });
    expect(groups.map((g) => g.label)).toEqual(["Presale · Inicial", "Construcción · Demoliciones"]);
  });

  it("keeps admin tasks out unless the viewer may see admin data", () => {
    const hidden = groupProjectTasks(FASE_TASKS, { includeAdmin: false, today: TODAY });
    expect(hidden.groups.some((g) => g.kind === "admin")).toBe(false);
    const shown = groupProjectTasks(FASE_TASKS, { includeAdmin: true, today: TODAY });
    expect(shown.groups.at(-1)?.label).toBe("Administración");
    expect(shown.groups.at(-1)?.tasks.map((t) => t.id)).toEqual(["t7"]);
  });

  it("does not turn admin fases into fase mode for non-admins", () => {
    const tasks = [task("a", { kind: "admin", phase: DEMOLICIONES }), task("b")];
    expect(groupProjectTasks(tasks, { includeAdmin: false, today: TODAY }).mode).toBe("tramo");
  });
});

describe("table data", () => {
  const { mode, groups } = groupProjectTasks(FASE_TASKS, { includeAdmin: false, today: TODAY });

  it("builds one grouped task table whose group label carries the progress", () => {
    const data = buildTasksTable(groups, TODAY);
    expect(data.groupBy).toBe("grupo");
    expect(data.rows.map((r) => r.grupo)).toEqual([
      "Demoliciones · 100%",
      "Demoliciones · 100%",
      "Instalaciones · 33%",
      "Instalaciones · 33%",
      "Instalaciones · 33%",
    ]);
    const late = data.rows.find((r) => r.id === "t4");
    expect(late).toMatchObject({ estatusTexto: "Vencida", responsable: "Sin asignar", vence: "2 oct", dias: "35 d tarde" });
    expect(data.rows.find((r) => r.id === "t3")).toMatchObject({ subtareas: "2/4", avance: 50, dias: "en 6 d" });
    // Status chip column off in Esencial, text status only in Esencial, Días and % only in Analítico.
    const hide = Object.fromEntries(data.columns.map((c) => [c.key, c.hideOn ?? []]));
    expect(hide).toMatchObject({
      estatus: ["esencial"],
      estatusTexto: ["visual", "analitico"],
      dias: ["visual", "esencial"],
      avance: ["visual", "esencial"],
      tarea: [],
    });
  });

  it("builds the per-group summary with the breakdown and totals for Analítico", () => {
    const data = buildGroupsTable(groups, mode);
    expect(data.columns[0].label).toBe("Fase");
    expect(data.rows.map((r) => [r.nombre, r.total, r.avance])).toEqual([
      ["Demoliciones", 2, 100],
      ["Instalaciones", 3, 33],
    ]);
    expect(data.totals).toMatchObject({ nombre: "Total", total: 5, completadas: 3, avance: 60 });
    const analiticoOnly = data.columns.filter((c) => c.hideOn?.includes("visual")).map((c) => c.key);
    expect(analiticoOnly).toEqual(["completadas", "enProceso", "pendientes", "vencidas"]);
    expect(buildGroupsTable([], "tramo").columns[0].label).toBe("Tramo");
  });

  it("formats dates and days in es-MX lowercase", () => {
    expect(formatDueDate("2026-07-22")).toBe("22 jul");
    expect(formatDueDate(null)).toBe("—");
    expect(dueDaysText(task("d", { commitmentDate: TODAY }), TODAY)).toBe("hoy");
    expect(dueDaysText(task("d", { commitmentDate: TODAY, status: "completado" }), TODAY)).toBe("—");
  });
});

describe("filters", () => {
  it("parses and writes the tab URL", () => {
    expect(parseProjectTasksQuery({})).toEqual({ estado: "todas", responsable: null, q: "" });
    const query = parseProjectTasksQuery({ estado: "vencidas", responsable: "s1", q: " muro " });
    expect(query).toEqual({ estado: "vencidas", responsable: "s1", q: "muro" });
    expect(parseProjectTasksQuery({ estado: "otra" }).estado).toBe("todas");
    expect(projectTasksHref("p1", query, { estado: "todas" })).toBe("/proyectos/p1/tareas?responsable=s1&q=muro");
    expect(projectTasksHref("p1", parseProjectTasksQuery({}))).toBe("/proyectos/p1/tareas");
  });

  it("counts estados and filters by responsable and search", () => {
    const rows = topLevelTasks(FASE_TASKS.filter((t) => t.kind !== "admin"));
    expect(estadoCounts(rows, TODAY)).toEqual({ todas: 5, abiertas: 2, vencidas: 1, completadas: 3 });
    expect(filterByPersonAndSearch(rows, { responsable: "s2", q: "" }).map((t) => t.id)).toEqual(["t3"]);
    expect(filterByPersonAndSearch(rows, { responsable: "sin", q: "" }).map((t) => t.id)).toEqual(["t4"]);
    expect(filterByPersonAndSearch(rows, { responsable: null, q: "presion" }).map((t) => t.id)).toEqual(["t3"]);
  });
});

function renderTab(style: PresentationStyle, props: Partial<Parameters<typeof ProjectTasksByFase>[0]> = {}) {
  return render(
    <StyleProvider style={style} scope="staff">
      <ProjectTasksByFase projectId="p1" tasks={FASE_TASKS} today={TODAY} {...props} />
    </StyleProvider>,
  );
}

describe("ProjectTasksByFase", () => {
  it.each<PresentationStyle>(["visual", "esencial", "analitico"])(
    "renders groups, task links and Agregar tarea per group in %s",
    (style) => {
      renderTab(style);
      expect(screen.getByRole("heading", { name: "Avance por fase" })).toBeTruthy();
      const link = screen.getByRole("link", { name: "Pruebas de presión hidráulica" });
      expect(link.getAttribute("href")).toBe("/tareas?tarea=t3");
      expect(screen.getByRole("button", { name: "Agregar tarea a Demoliciones" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Agregar tarea a Instalaciones" })).toBeTruthy();
      expect(screen.queryByText("Asignar cliente y origen")).toBeNull();
      expect(screen.queryByRole("link", { name: "Subtarea de tablero" })).toBeNull();
    },
  );

  it("groups by tramo when the project has no fase data", () => {
    renderTab("visual", { tasks: TRAMO_TASKS });
    expect(screen.getByRole("heading", { name: "Avance por tramo" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Avance por fase" })).toBeNull();
    expect(screen.getByRole("button", { name: "Agregar tarea a Presale" })).toBeTruthy();
  });

  it("shows admin tasks only with includeAdmin, without an Agregar tarea for that group", () => {
    renderTab("visual", { includeAdmin: true });
    expect(screen.getByRole("link", { name: "Asignar cliente y origen" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Agregar tarea a Administración" })).toBeNull();
  });

  it("applies the estado filter from the URL", () => {
    nav.params = new URLSearchParams("estado=vencidas");
    renderTab("visual");
    expect(screen.getByRole("link", { name: "Cambiar tapas a WC" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Retiro de cascajo" })).toBeNull();
    expect(screen.getByText(/1 de 5 mostradas/)).toBeTruthy();
  });

  it("opens the shell's new-task dialog through the store with the group's project and tramo", () => {
    const openNewTask = vi.spyOn(useNewTaskUi.getState(), "openNewTask");
    renderTab("visual");
    fireEvent.click(screen.getByRole("button", { name: "Agregar tarea a Instalaciones" }));
    expect(openNewTask).toHaveBeenCalledWith({ projectId: "p1", tramoKey: "construccion" }, "proyecto");
    expect(useNewTaskUi.getState()).toMatchObject({
      open: true,
      source: "proyecto",
      defaults: { projectId: "p1", tramoKey: "construccion" },
    });
    // No dialog of its own, and closing it never refreshes the route.
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => useNewTaskUi.getState().closeNewTask());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("opens the dialog with the project only from the empty state", () => {
    renderTab("visual", { tasks: [] });
    fireEvent.click(screen.getByRole("button", { name: "Agregar tarea" }));
    expect(useNewTaskUi.getState()).toMatchObject({ open: true, source: "proyecto", defaults: { projectId: "p1" } });
  });

  it("writes the estado chip to the URL with history.replaceState, without router.push", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderTab("visual");
    fireEvent.click(estadoChip("Vencidas"));
    expect(lastReplacedUrl(replaceState)).toBe("/proyectos/p1/tareas?estado=vencidas");
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("debounces the search into ?q= with history.replaceState, keeping the other filters", () => {
    vi.useFakeTimers();
    nav.params = new URLSearchParams("estado=abiertas");
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderTab("visual");
    fireEvent.change(screen.getByLabelText("Buscar en 5 tareas"), { target: { value: "presion" } });
    // The rows filter right away; the URL follows after the debounce.
    expect(screen.getByRole("link", { name: "Pruebas de presión hidráulica" })).toBeTruthy();
    expect(replaceState).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(PROJECT_TASKS_SEARCH_DEBOUNCE_MS));
    expect(lastReplacedUrl(replaceState)).toBe("/proyectos/p1/tareas?estado=abiertas&q=presion");
    expect(push).not.toHaveBeenCalled();
  });
});

/** The slim tab row of a fixture task (the shape `loadProyectoTareas` returns). */
function rowOf(task: TaskListItem): TaskListRow {
  const item: Partial<TaskListItem> & Omit<TaskListItem, "notes"> = { ...task };
  delete item.notes;
  return {
    ...item,
    subtaskCount: item.subtaskCount ?? 0,
    subtaskDone: item.subtaskDoneCount ?? 0,
    commentCount: 0,
    attachmentCount: 0,
    checklistTotal: 0,
    checklistDone: 0,
    waitingOn: 0,
  };
}

describe("ProjectTareasTab", () => {
  it("renders from the hydrated tab query with 0 client action calls", async () => {
    const { client, state } = await hydrationRoundtrip((server) =>
      prefetch(server, proyectoTareasOptions("p1"), async () => ({ tasks: FASE_TASKS.map(rowOf), includeAdmin: false })),
    );
    renderWithQueryClient(<ProjectTareasTab projectId="p1" />, { client, hydrate: state });
    expect(screen.getByRole("link", { name: "Pruebas de presión hidráulica" })).toBeTruthy();
    expect(actions.getProyectoTareasData).not.toHaveBeenCalled();
  });

  it("changing filters makes no action call when the rows are loaded", () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.proyectos.tab("p1", "tareas"), { tasks: FASE_TASKS, includeAdmin: false });
    renderWithQueryClient(<ProjectTareasTab projectId="p1" />, { client });
    fireEvent.click(estadoChip("Completadas"));
    expect(actions.getProyectoTareasData).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows an error state when the project is gone (null data)", () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.proyectos.tab("p1", "tareas"), null);
    renderWithQueryClient(<ProjectTareasTab projectId="p1" />, { client });
    expect(screen.getByText("No se pudieron cargar las tareas.")).toBeTruthy();
  });


  it("mounts no NewTaskDialog and calls no router.refresh (the shell's host owns the dialog)", () => {
    const source = readFileSync(join(__dirname, "ProjectTasksByFase.tsx"), "utf8");
    expect(source).not.toMatch(/NewTaskDialog/);
    expect(source).not.toMatch(/router\.(refresh|push)/);
  });

  it("keeps style differences inside the widget library (FE §18 item 15)", () => {
    for (const file of [
      join(__dirname, "ProjectTasksByFase.tsx"),
      join(__dirname, "../../app/(staff)/proyectos/[id]/tareas/page.tsx"),
      join(__dirname, "../../lib/proyectos/project-tasks-by-fase.ts"),
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/StyleView/);
      expect(source).not.toMatch(/useStyle\b/);
      expect(source).not.toMatch(/["'](visual|esencial|analitico)["']\s*(===|!==)|(===|!==)\s*["'](visual|esencial|analitico)["']/);
    }
  });
});
