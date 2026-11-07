// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push, replace: vi.fn() }),
  usePathname: () => "/proyectos/p1/tareas",
  useSearchParams: () => new URLSearchParams(),
}));

const dialogCalls: Array<{ open: boolean; defaults?: unknown }> = [];
vi.mock("@/components/tareas/NewTaskDialog", () => ({
  NewTaskDialog: (props: { open: boolean; defaults?: unknown; onOpenChange(open: boolean): void }) => {
    dialogCalls.push({ open: props.open, defaults: props.defaults });
    return props.open ? (
      <div role="dialog" aria-label="Nueva tarea">
        <button type="button" onClick={() => props.onOpenChange(false)}>
          Cerrar
        </button>
      </div>
    ) : null;
  },
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
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
import type { TaskListItem, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";
import type { PresentationStyle } from "@/lib/types/redesign";

import { ProjectTasksByFase } from "./ProjectTasksByFase";

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
  dialogCalls.length = 0;
});

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
    renderTab("visual", { query: { estado: "vencidas", responsable: null, q: "" } });
    expect(screen.getByRole("link", { name: "Cambiar tapas a WC" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Retiro de cascajo" })).toBeNull();
    expect(screen.getByText(/1 de 5 mostradas/)).toBeTruthy();
  });

  it("opens the existing create flow with the group's project and tramo, and refreshes on close", () => {
    renderTab("visual");
    fireEvent.click(screen.getByRole("button", { name: "Agregar tarea a Instalaciones" }));
    expect(dialogCalls.at(-1)).toEqual({ open: true, defaults: { projectId: "p1", tramoKey: "construccion" } });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(dialogCalls.at(-1)?.open).toBe(false);
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
