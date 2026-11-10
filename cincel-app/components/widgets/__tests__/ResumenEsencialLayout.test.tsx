// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const caps = vi.hoisted(() => ({ canCreateActivity: true }));
const create = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/proyectos/p1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({
  getProyectoResumenData: vi.fn(),
  getProyectoTareasData: vi.fn(),
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => ({ canViewActivities: true, canCreateActivity: caps.canCreateActivity }),
}));
vi.mock("@/components/tareas/TaskSheet", () => ({
  TaskSheetRoute: () => null,
  taskSheetHref: (pathname: string, _search: unknown, id: string) => `${pathname}?tarea=${id}`,
}));
vi.mock("@/components/tareas/quick-add-create", () => ({ useQuickAddCreate: () => ({ create, undo: vi.fn() }) }));
// The quick-add and the row are their own issues' widgets: stand-ins that keep the props this layout passes.
vi.mock("@/components/widgets/QuickAddRow", () => ({
  QuickAddRow: ({
    context,
    onCreate,
  }: {
    context: { label: string; projectId: string | null; tramoId?: string | null; placeholder?: string };
    onCreate(d: unknown): Promise<unknown>;
  }) => (
    <label>
      <span className="sr-only">{context.placeholder}</span>
      <input
        placeholder={context.placeholder}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          void onCreate({
            title: (event.target as HTMLInputElement).value,
            projectId: context.projectId,
            tramoId: context.tramoId ?? null,
            assigneeId: null,
            dueDate: null,
            priority: "media",
          });
        }}
      />
    </label>
  ),
}));
vi.mock("@/components/widgets/EsencialItemRow", () => ({
  EsencialItemRow: ({
    title,
    href,
    status,
    isNew,
  }: {
    title: string;
    href?: string;
    status: { kind: "text"; label: string } | null;
    isNew?: boolean;
  }) => (
    <div data-testid="item-row" className={isNew ? "row-new" : undefined}>
      <a href={href}>{title}</a>
      {status ? <span>{status.label}</span> : null}
    </div>
  ),
}));

// The empty state's Iniciar tramo sheet (#1043) reads these; no test here starts a tramo.
vi.mock("@/lib/actions/tramo-start-actions", () => ({
  previewStartTramoAction: vi.fn(() => new Promise(() => {})),
  startTramoAction: vi.fn(),
  undoStartTramoAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/tareas-actions", () => ({ getTareasStartSlotData: vi.fn(() => new Promise(() => {})) }));

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { TaskListRow } from "@/lib/types/core";
import { TRAMOS, fixtureProject, fixtureSummaryInput } from "@/tests/unit/fixtures/project-summary";

import { ResumenEsencialLayout } from "../ResumenEsencialLayout";

function task(over: Partial<TaskListRow>): TaskListRow {
  return {
    id: "t",
    title: "Tarea",
    status: "pendiente",
    archived: false,
    commitmentDate: null,
    workflowId: "w-construccion",
    workflow: TRAMOS[2],
    phase: null,
    manager: { id: "s1", name: "Paul Langarica" },
    parentTaskId: null,
    subtaskCount: 0,
    subtaskDone: 0,
    ...over,
  } as TaskListRow;
}

const TASKS: TaskListRow[] = [
  task({ id: "a", title: "Colocar plafón", commitmentDate: "2026-11-01" }),
  task({ id: "b", title: "Instalar luminarias", status: "bloqueado", commitmentDate: "2026-11-20" }),
  task({ id: "c", title: "Pintar fachada", commitmentDate: "2026-11-14" }),
  task({ id: "d", title: "Cerrar Diseño", status: "completado", workflowId: "w-diseno", workflow: TRAMOS[1] }),
];

function renderLayout(opts: { tasks?: TaskListRow[]; input?: ReturnType<typeof fixtureSummaryInput> } = {}) {
  const client = createTestQueryClient();
  const input = opts.input ?? fixtureSummaryInput();
  client.setQueryData(qk.proyectos.tab(input.project.id, "tareas"), { tasks: opts.tasks ?? TASKS, includeAdmin: false });
  return renderWithQueryClient(<ResumenEsencialLayout data={input} />, { client });
}

beforeEach(() => {
  caps.canCreateActivity = true;
  create.mockReset();
});
afterEach(() => cleanup());

describe("ResumenEsencialLayout", () => {
  it("renders four cards", () => {
    const { container } = renderLayout();
    // EsencialCard names its section by its title (aria-labelledby).
    const sections = [...container.querySelectorAll("section")].map(
      (s) => s.getAttribute("aria-label") ?? document.getElementById(s.getAttribute("aria-labelledby") ?? "")?.textContent ?? null,
    );
    expect(sections).toEqual(["Tramos", "Próximas tareas", "Equipo", "Archivos recientes"]);

    const tramos = screen.getByRole("region", { name: "Tramos" });
    expect(within(tramos).getByRole("heading", { name: "En Construcción · Obra negra" })).toBeTruthy();
    expect(within(tramos).getByRole("img").getAttribute("aria-label")).toMatch(/^Tramos: Presale terminado/);

    const rows = screen.getAllByTestId("item-row");
    expect(rows.map((r) => r.textContent)).toEqual(["Colocar plafón5 d tarde", "Instalar luminariasBloqueada", "Pintar fachada14 nov"]);
    expect(screen.getByRole("link", { name: "Colocar plafón" }).getAttribute("href")).toBe("/proyectos/p1?tarea=a");
    expect(screen.getByRole("link", { name: "Ver todas →" }).getAttribute("href")).toBe("/proyectos/p1/tareas");

    expect(screen.getByText(/Paul Langarica/, { selector: "b" })).toBeTruthy();
    const files = screen.getByRole("region", { name: "Archivos recientes" });
    expect(within(files).getAllByRole("listitem")).toHaveLength(2);
    expect(within(files).getByRole("link", { name: "Abrir Drive →" }).getAttribute("target")).toBe("_blank");

    expect(container.querySelector("table, [role='progressbar'], [data-slot='chart']")).toBeNull();
  });

  it("quick-add creates and prepends with row-new", async () => {
    create.mockResolvedValueOnce({ id: "new-1", title: "Revisar plafones" });
    renderLayout();
    const input = screen.getByPlaceholderText("Agregar una tarea a Local Espinopapa");
    fireEvent.change(input, { target: { value: "Revisar plafones" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ title: "Revisar plafones", projectId: "p1", tramoId: "w-construccion" }));
    const rows = screen.getAllByTestId("item-row");
    expect(rows).toHaveLength(4);
    expect(rows[0]!.textContent).toBe("Revisar plafones");
    expect(rows[0]!.className).toContain("row-new");
  });

  it("no tasks state", () => {
    renderLayout({ tasks: [] });
    const card = screen.getByRole("region", { name: "Próximas tareas" });
    expect(within(card).getByText("Sin tareas abiertas")).toBeTruthy();
    expect(within(card).getByPlaceholderText("Agregar una tarea a Local Espinopapa")).toBeTruthy();
  });

  it("no team state", () => {
    renderLayout({
      input: fixtureSummaryInput({ project: fixtureProject({ manager: null, coordinator: null, members: [] }) }),
    });
    const card = screen.getByRole("region", { name: "Equipo" });
    expect(within(card).getByText("Sin equipo asignado")).toBeTruthy();
    expect(within(card).getByRole("link", { name: "Editar en Ficha" }).getAttribute("href")).toBe("/proyectos/p1/ficha");
  });

  it("quick-add hidden without permission", () => {
    caps.canCreateActivity = false;
    renderLayout();
    expect(screen.queryByPlaceholderText("Agregar una tarea a Local Espinopapa")).toBeNull();
  });

  it("shows the Drive states", () => {
    renderLayout({ input: fixtureSummaryInput({ files: null }) });
    expect(screen.getByText("No se pudo leer la carpeta de Drive")).toBeTruthy();
    cleanup();
    renderLayout({ input: fixtureSummaryInput({ files: [] }) });
    expect(screen.getByText("Este proyecto aún no tiene archivos")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Subir archivos" }).getAttribute("href")).toBe("/proyectos/p1/archivos");
  });

  it("no started tramo: the empty state with Iniciar un tramo, no suggested tramos (#1043)", () => {
    renderLayout({
      input: fixtureSummaryInput({
        project: fixtureProject({ needsTramo: true, currentWorkflowId: null, currentWorkflow: null, tramos: [] }),
      }),
    });
    const card = screen.getByRole("region", { name: "Tramos" });
    expect(card.textContent).toContain("Este proyecto aún no tiene tramo.");
    expect(card.textContent).not.toContain("Presale");
    expect(within(card).getByRole("button", { name: "Iniciar un tramo" })).toBeTruthy();
  });

  it("started in Diseño: only Diseño, plus Siguiente: Construcción (#1043)", () => {
    const diseno = TRAMOS[1]!;
    renderLayout({
      input: fixtureSummaryInput({
        project: fixtureProject({
          currentWorkflowId: diseno.id,
          currentWorkflow: diseno,
          tramos: [{ ...diseno, startedAt: "2026-06-01T00:00:00.000Z", closedAt: null, current: true }],
        }),
      }),
    });
    const card = screen.getByRole("region", { name: "Tramos" });
    expect(card.textContent).toContain("Siguiente: Construcción");
    expect(card.textContent).not.toContain("Presale");
  });
});
