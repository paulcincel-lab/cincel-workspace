// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The quick-add is its own issue's widget (#984): a stand-in that keeps the props this layout passes.
vi.mock("@/components/widgets/QuickAddRow", () => ({
  QuickAddRow: ({
    context,
    onCreate,
    variant,
  }: {
    context: { label: string; projectId: string | null; placeholder?: string };
    onCreate(draft: { title: string; projectId: string | null }): Promise<unknown>;
    variant: string;
  }) => (
    <label data-variant={variant}>
      <span className="sr-only">Nueva tarea en {context.label}</span>
      <input
        placeholder={context.placeholder}
        onKeyDown={(event) => {
          if (event.key === "Enter") void onCreate({ title: event.currentTarget.value, projectId: context.projectId });
        }}
      />
    </label>
  ),
}));

// The empty state's Iniciar tramo sheet (#1043) reads these; no test here starts a tramo.
vi.mock("@/lib/actions/tramo-start-actions", () => ({
  previewStartTramoAction: vi.fn(() => new Promise(() => {})),
  startTramoAction: vi.fn(),
  undoStartTramoAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/tareas-actions", () => ({ getTareasStartSlotData: vi.fn(() => new Promise(() => {})) }));

import { ResumenVisualLayout, type ResumenVisualLayoutProps } from "@/components/widgets/ResumenVisualLayout";
import { RESUMEN_NO_TRAMO } from "@/lib/proyectos/project-summary";
import { renderWithQueryClient } from "@/lib/query/test-utils";
import { fixtureProject, fixtureSummaryInput, fixtureTaskRow, HISTORY_EVENTS, TASK_ROWS, TRAMOS } from "@/tests/unit/fixtures/project-summary";
import { resumenSummaryOfRows } from "@/tests/unit/fixtures/resumen-summary";

/** The task numbers of these rows (`qk.proyectos.resumenSummary`). */
const numbers = (rows: Parameters<typeof resumenSummaryOfRows>[0]) => resumenSummaryOfRows(rows, "2026-11-06");

afterEach(cleanup);

const NOW = new Date("2026-11-06T18:00:00.000Z");

function renderLayout(overrides: Partial<ResumenVisualLayoutProps> = {}) {
  const props: ResumenVisualLayoutProps = {
    data: fixtureSummaryInput(),
    summary: numbers(TASK_ROWS),
    history: { events: HISTORY_EVENTS, status: "success", onRetry: vi.fn() },
    canCreate: true,
    onQuickAdd: vi.fn(async (draft) => ({ id: "t-new", title: draft.title })),
    onNewTask: vi.fn(),
    now: NOW,
    ...overrides,
  };
  return { props, ...render(<ResumenVisualLayout {...props} />) };
}

describe("ResumenVisualLayout", () => {
  it("renders hero, three cards, S-curve, next tasks, activity and files", () => {
    renderLayout();
    const hero = screen.getByRole("region", { name: "Avance del proyecto" });
    expect(within(hero).getByRole("img", { name: "Avance 82 %, plan 85 %" })).toBeTruthy();
    expect(hero.textContent).toContain("Construcción · Obra negra");
    expect(hero.textContent).toContain("100 %");
    expect(hero.textContent).toContain("50 % · 1 pendiente");
    expect(hero.textContent).toContain("25 % · en curso");
    // Decoración was never started (#1043): no "Inicia …" step for it.
    expect(hero.textContent).not.toContain("Decoración");
    // Chips from the task list; the "Próxima" chip from the portfolio row.
    expect(within(hero).getByText("5 tareas abiertas")).toBeTruthy();
    expect(within(hero).getByText("1 vencida")).toBeTruthy();
    expect(within(hero).getByText("1 bloqueada")).toBeTruthy();
    expect(hero.textContent).toContain("Próxima: entrega de acabados · 20 nov");

    const status = screen.getByRole("region", { name: "Tareas por estatus" });
    expect(
      within(status).getByRole("img", { name: "8 tareas: 1 en proceso, 3 pendientes, 1 bloqueada, 3 completadas" }),
    ).toBeTruthy();
    const tramos = screen.getByRole("region", { name: "Avance por tramo" });
    expect(within(tramos).getByRole("img", { name: /Presale 100 %, Diseño 50 %, Construcción 25 %$/ })).toBeTruthy();
    const team = screen.getByRole("region", { name: "Equipo y carga" });
    expect(within(team).getByRole("img", { name: "Carga 92 %" })).toBeTruthy();
    expect(team.textContent).toContain("92 % · 1 vencida");
    expect(team.textContent).toContain("60 % · 1 bloqueada");
    expect(team.textContent).toContain("40 % · al día");

    expect(screen.getByRole("img", { name: /^Avance real \d+ % contra plan \d+ % al 6 de noviembre$/ })).toBeTruthy();

    const next = screen.getByRole("region", { name: "Lo que sigue" });
    const cards = within(next).getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/tareas?tarea="));
    expect(cards.map((a) => a.getAttribute("href"))).toEqual([
      "/tareas?tarea=t-obra-1",
      "/tareas?tarea=t-obra-2",
      "/tareas?tarea=t-obra-3",
      "/tareas?tarea=t-diseno-2",
    ]);
    expect(cards[0]!.textContent).toContain("27 oct · 10 d");
    expect(cards[1]!.textContent).toContain("Bloqueado");
    expect(within(next).getByRole("link", { name: "Ver tareas →" }).getAttribute("href")).toBe("/proyectos/p1/tareas");

    const activity = screen.getByRole("region", { name: "Actividad reciente" });
    expect(activity.textContent).toContain("Paul Langarica comentó en el proyecto");
    expect(activity.textContent).toContain("hace 2 h");
    expect(activity.textContent).toContain("Alejandro Riofrio movió el proyecto a Construcción");

    const files = screen.getByRole("region", { name: "Archivos" });
    const drive = within(files).getByRole("link", { name: /Abrir en Drive/ });
    expect(drive.getAttribute("href")).toBe("https://drive.google.com/drive/folders/drive-p1");
    expect(drive.getAttribute("target")).toBe("_blank");
    expect(drive.textContent).toContain("(se abre en una pestaña nueva)");
    // Folders left out; the thumbnail when Drive gives one, else the type tile.
    expect(within(files).queryByText("Planos")).toBeNull();
    expect(within(files).getByText("Planta arquitectónica.pdf")).toBeTruthy();
    expect(files.querySelector("img")?.getAttribute("src")).toBe("https://lh3.googleusercontent.com/thumb-f2");
  });

  it("never renders budget data", () => {
    const { container } = renderLayout();
    expect(container.textContent).not.toMatch(/Presupuesto|ejercido|\$/);
  });

  it("hides S-curve without schedule", () => {
    renderLayout({ data: fixtureSummaryInput({ schedule: null }) });
    expect(screen.queryByRole("region", { name: "Avance contra plan" })).toBeNull();
    // No schedule: the hero's PLAN line goes too.
    expect(screen.getByRole("img", { name: "Avance 82 %" })).toBeTruthy();
    expect(screen.queryByText(/PLAN/)).toBeNull();
  });

  it("no started tramo: the empty state, no suggested tramos (#1043)", () => {
    const project = fixtureProject({ needsTramo: true, currentWorkflowId: null, currentWorkflow: null, tramos: [], stages: [] });
    renderWithQueryClient(
      <ResumenVisualLayout
        data={fixtureSummaryInput({ project })}
        summary={numbers([])}
        history={{ events: [], status: "success", onRetry: vi.fn() }}
        canCreate
        onQuickAdd={vi.fn()}
        onNewTask={vi.fn()}
        now={NOW}
      />,
    );
    const hero = screen.getByRole("region", { name: "Avance del proyecto" });
    expect(hero.textContent).toContain(RESUMEN_NO_TRAMO);
    expect(hero.textContent).not.toContain("Presale");
    expect(screen.getByRole("region", { name: "Avance por tramo" }).textContent).toContain(RESUMEN_NO_TRAMO);
  });

  it("started in Diseño: only Diseño, plus Siguiente: Construcción (#1043)", () => {
    const [, diseno] = TRAMOS;
    const project = fixtureProject({
      currentWorkflowId: diseno!.id,
      currentWorkflow: diseno!,
      tramos: [{ ...diseno!, startedAt: "2026-06-01T00:00:00.000Z", closedAt: null, current: true }],
      stages: [diseno!],
    });
    renderLayout({ data: fixtureSummaryInput({ project }), summary: numbers([]) });
    const hero = screen.getByRole("region", { name: "Avance del proyecto" });
    expect(hero.textContent).toContain("Siguiente: Construcción");
    expect(hero.textContent).not.toContain("Presale");
  });

  it("new project empty states", () => {
    const { props } = renderLayout({
      summary: numbers([]),
      history: { events: [], status: "success", onRetry: vi.fn() },
      data: fixtureSummaryInput({ portfolio: null, project: fixtureProject({ progress: 0 }), files: [] }),
    });
    expect(screen.getByRole("img", { name: /^Avance 0 %/ })).toBeTruthy();
    const status = screen.getByRole("region", { name: "Tareas por estatus" });
    expect(status.textContent).toContain("Este proyecto aún no tiene tareas");
    fireEvent.click(within(status).getByRole("button", { name: "Nueva tarea" }));
    expect(props.onNewTask).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("region", { name: "Equipo y carga" }).textContent).toContain("al día");
    const next = screen.getByRole("region", { name: "Lo que sigue" });
    expect(within(next).queryAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/tareas?tarea="))).toHaveLength(0);
    expect(within(next).getByPlaceholderText("Nueva tarea en Local Espinopapa")).toBeTruthy();
    expect(screen.getByText("Aún no hay actividad")).toBeTruthy();
    expect(screen.getByText("Este proyecto aún no tiene archivos")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Subir archivos" }).getAttribute("href")).toBe("/proyectos/p1/archivos");
  });

  it("quick-add prepends with row-new", async () => {
    const { props, rerender } = renderLayout();
    const input = screen.getByPlaceholderText("Nueva tarea en Local Espinopapa");
    fireEvent.change(input, { target: { value: "Revisar planos" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(props.onQuickAdd).toHaveBeenCalledWith(expect.objectContaining({ title: "Revisar planos", projectId: "p1" }));

    // The refreshed task numbers carry the new task; the store marks it recent.
    const created = fixtureTaskRow("t-new", { title: "Revisar planos", status: "pendiente" });
    rerender(<ResumenVisualLayout {...props} summary={numbers([...TASK_ROWS, { ...created, createdAt: "2026-11-06T17:00:00.000Z" }])} recentIds={["t-new"]} />);
    const next = screen.getByRole("region", { name: "Lo que sigue" });
    const first = within(next).getAllByRole("link").find((a) => a.getAttribute("href")?.startsWith("/tareas?tarea="))!;
    expect(first.getAttribute("href")).toBe("/tareas?tarea=t-new");
    expect(first.className).toContain("row-new");
    // Donut and chips follow the task numbers.
    expect(screen.getByRole("img", { name: /^9 tareas: 1 en proceso, 4 pendientes/ })).toBeTruthy();
    expect(screen.getByText("6 tareas abiertas")).toBeTruthy();
  });

  it("hides «Nueva tarea» and the quick-add without create permission", () => {
    renderLayout({ canCreate: false, summary: numbers([]) });
    expect(screen.queryByRole("button", { name: "Nueva tarea" })).toBeNull();
    expect(screen.queryByPlaceholderText("Nueva tarea en Local Espinopapa")).toBeNull();
  });

  it("Drive failure message", () => {
    renderLayout({ data: fixtureSummaryInput({ files: null }) });
    const files = screen.getByRole("region", { name: "Archivos" });
    expect(files.textContent).toContain("No se pudo leer la carpeta de Drive");
    expect(within(files).getByRole("link", { name: "Abrir Archivos" }).getAttribute("href")).toBe("/proyectos/p1/archivos");
    // The rest of the page keeps working.
    expect(screen.getByRole("region", { name: "Avance del proyecto" })).toBeTruthy();
  });

  it("history failure shows the section error with retry, the page stays usable", () => {
    const onRetry = vi.fn();
    renderLayout({ history: { events: [], status: "error", onRetry } });
    const activity = screen.getByRole("region", { name: "Actividad reciente" });
    expect(activity.textContent).toContain("No se pudo cargar esta sección");
    fireEvent.click(within(activity).getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("region", { name: "Lo que sigue" })).toBeTruthy();
  });

  it("shows at most six people, then +n to the Ficha", () => {
    const members = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, name: `Persona ${i}`, role: null, active: true }));
    renderLayout({ data: fixtureSummaryInput({ project: fixtureProject({ members }) }) });
    const team = screen.getByRole("region", { name: "Equipo y carga" });
    expect(within(team).getAllByRole("img")).toHaveLength(6);
    const more = within(team).getByRole("link", { name: "Ver 4 personas más en la ficha" });
    expect(more.textContent).toBe("+4");
    expect(more.getAttribute("href")).toBe("/proyectos/p1/ficha");
  });
});
