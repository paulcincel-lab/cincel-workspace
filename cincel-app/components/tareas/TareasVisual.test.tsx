// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { TaskListRow } from "@/lib/types/core";

// Next's Link only calls `onNavigate` inside a router; the stand-in calls it on every click.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    scroll,
    prefetch,
    onNavigate,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    scroll?: boolean;
    prefetch?: boolean | null;
    onNavigate?: (e: { preventDefault(): void }) => void;
  }) => {
    void scroll;
    void prefetch;
    return (
      <a
        href={href}
        {...rest}
        onClick={(e) => {
          e.preventDefault();
          onNavigate?.({ preventDefault: () => e.preventDefault() });
        }}
      >
        {children}
      </a>
    );
  },
}));

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const actions = vi.hoisted(() => ({
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
}));
vi.mock("@/lib/actions/tasks-actions", () => actions);

// Reads never reach the server here except the column pages: the cache is seeded as the page would.
const pageData = vi.hoisted(() => ({
  getTareasPageData: vi.fn(),
  getTareasBoard: vi.fn(),
  getTareasFacets: vi.fn(),
  getTareasListPage: vi.fn(),
  getTareasBoardColumn: vi.fn(),
  getTareasTrend: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/tareas-actions", () => pageData);

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (msg: string) => toastError(msg), success: vi.fn() } }));

vi.mock("@/components/shell/PageHeader", () => ({
  PageHeader: ({ title, description, actions: headerActions }: { title: string; description?: string; actions?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {headerActions}
    </header>
  ),
}));
vi.mock("@/components/shell/EstiloSwitch", () => ({ EstiloSwitch: () => null }));

// The quick-add line has its own tests (#984): here it is a plain input whose Enter hands its context to `onCreate`.
vi.mock("@/components/widgets/QuickAddRow", () => ({
  QuickAddRow: ({
    context,
    onCreate,
  }: {
    context: { label: string; projectId: string | null; status?: string; tramoId?: string | null };
    onCreate(d: unknown): Promise<unknown>;
  }) => (
    <input
      aria-label={`Nueva tarea en ${context.label}`}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        void onCreate({
          title: (e.target as HTMLInputElement).value,
          projectId: context.projectId,
          tramoId: context.tramoId ?? null,
          assigneeId: null,
          dueDate: null,
          priority: "media",
          status: context.status,
        });
      }}
    />
  ),
}));
const quickAdd = vi.hoisted(() => ({ create: vi.fn(), undo: vi.fn() }));
vi.mock("@/components/tareas/quick-add-create", () => ({ useQuickAddCreate: () => quickAdd }));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { TareasVisual } from "@/components/tareas/TareasVisual";
import { weekStripDays } from "@/components/tareas/tareas-visual-model";
import { boardColumnLabel } from "@/components/widgets/TaskBoardWidget";
import { qk } from "@/lib/query/keys";
import { tareasListFiltersOf, tareasPageKeyInputOf } from "@/lib/query/options/tareas";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import {
  emptyBoardColumns,
  type TareasBoardData,
  type TareasFacets,
  type TareasPageData,
  type TareasTrend,
} from "@/lib/tareas/page-data";
import { DEFAULT_TAREAS_QUERY, type TareasQuery } from "@/lib/tareas/query";
import { seedSessionUser } from "@/tests/helpers/session-user";

function makeRow(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: "t1",
    projectId: "p1",
    kind: "usuario",
    templateId: null,
    workflowId: "w1",
    phaseId: null,
    spaceId: null,
    closedAt: null,
    title: "Tarea",
    createdById: "s1",
    managerId: "s1",
    status: "pendiente",
    customStatusId: null,
    priority: "media",
    sortOrder: null,
    commitmentDate: null,
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    customStatus: null,
    project: { id: "p1", name: "Oficina Polanco", clientName: null },
    workflow: { id: "w1", key: "presale", name: "Presale", sortOrder: 1 },
    phase: null,
    space: null,
    manager: { id: "s1", name: "Luis Pérez" },
    support: [],
    checklist: { total: 0, completed: 0 },
    parentTaskId: null,
    parentTitle: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    waitingOn: 0,
    subtaskDone: 0,
    commentCount: 0,
    attachmentCount: 0,
    checklistTotal: 0,
    checklistDone: 0,
    ...overrides,
  } as TaskListRow;
}

const PENDIENTES = Array.from({ length: 6 }, (_, i) => makeRow({ id: `p${i + 1}`, title: `Pendiente ${i + 1}` }));
const EN_PROCESO = makeRow({ id: "e1", title: "Cotización de cancelería", status: "en_proceso" });
const BLOQUEADA = makeRow({ id: "b1", title: "Permiso de obra", status: "bloqueado", waitingOn: 2 });
const COMPLETADA = makeRow({ id: "c1", title: "Levantamiento", status: "completado" });

function boardData(): TareasBoardData {
  const columns = emptyBoardColumns([]);
  columns.pendiente = { rows: PENDIENTES, total: 30, nextCursor: "c-1" };
  columns.en_proceso = { rows: [EN_PROCESO], total: 5, nextCursor: null };
  columns.bloqueado = { rows: [BLOQUEADA], total: 1, nextCursor: null };
  columns.completado = { rows: [COMPLETADA], total: 12, nextCursor: null };
  return { columns, statuses: [] };
}

const TREND: TareasTrend = {
  kpis: [
    {
      key: "abiertas",
      label: "Abiertas",
      value: 36,
      series7: [30, 31, 33, 33, 34, 35, 36],
      delta: { value: 3, good: false, caption: "esta semana", label: "+3 esta semana", tone: "bad" },
    },
    {
      key: "vencidas",
      label: "Vencidas",
      value: 8,
      series7: [5, 6, 6, 6, 7, 7, 8],
      delta: { value: 2, good: false, caption: "desde el lunes", label: "+2 desde el lunes", tone: "bad" },
    },
    { key: "en_proceso", label: "En proceso", value: 5, series7: [4, 4, 5, 5, 5, 5, 5], caption: "5 personas trabajando" },
    {
      key: "completadas",
      label: "Completadas",
      value: 1234,
      series7: [1, 0, 2, 1, 3, 0, 1],
      delta: { value: 2, good: true, caption: "vs. semana pasada", label: "+2 vs. semana pasada", tone: "good" },
    },
  ],
  activeAssignees: 5,
  week: {
    from: "2026-11-09",
    to: "2026-11-15",
    total: 9,
    days: [
      { date: "2026-11-09", due: 1, tramoKey: "presale" },
      { date: "2026-11-10", due: 0, tramoKey: null },
      { date: "2026-11-11", due: 2, tramoKey: "diseno" },
      { date: "2026-11-12", due: 3, tramoKey: "construccion" },
      { date: "2026-11-13", due: 3, tramoKey: "presale" },
      { date: "2026-11-14", due: 0, tramoKey: null },
      { date: "2026-11-15", due: 0, tramoKey: null },
    ],
  },
};

const FACETS: TareasFacets = {
  total: 48,
  byTramo: { presale: 48 },
  projects: [],
  mostrar: { todas: 48, abiertas: 36, en_retraso: 8 },
  mine: 7,
};
const TRAMOS = [{ id: "w1", key: "presale", name: "Presale", sortOrder: 1 }];

const QUERY: TareasQuery = { ...DEFAULT_TAREAS_QUERY };
const F = tareasListFiltersOf(QUERY);
const PAGE: TareasPageData = { facets: FACETS, tramos: TRAMOS, staff: [] };

function seededClient(board: TareasBoardData = boardData()): QueryClient {
  const client = createTestQueryClient();
  client.setQueryData(qk.tareas.page(tareasPageKeyInputOf(QUERY, "visual")), PAGE);
  client.setQueryData(qk.tareas.board(F), board);
  client.setQueryData(qk.tareas.trend(F), TREND);
  return client;
}

const onQuery = vi.fn();

function renderVisual(client: QueryClient = seededClient()) {
  return renderWithQueryClient(
    <StyleProvider style="visual" scope="staff">
      <TareasVisual
        query={QUERY}
        facets={FACETS}
        tramos={TRAMOS}
        actions={null}
        search=""
        onSearch={vi.fn()}
        onQuery={onQuery}
        empty={{ title: "No hay tareas con estos filtros" }}
      />
    </StyleProvider>,
    { client },
  );
}

const column = (label: string, count: number) => screen.getByRole("region", { name: boardColumnLabel(label, count) });
const cardsIn = (el: HTMLElement) => el.querySelectorAll("[data-task-id]");

beforeEach(() => {
  nav.search = "";
  toastError.mockReset();
  onQuery.mockReset();
  for (const fn of Object.values(pageData)) fn.mockReset();
  // A move invalidates the tareas queries; the trend refetch gets the same trend back.
  pageData.getTareasTrend.mockResolvedValue(TREND);
  quickAdd.create.mockReset().mockImplementation(async (d: { title: string }) => ({ id: "new-1", title: d.title }));
  actions.setTaskStatusAction
    .mockReset()
    .mockImplementation(async (id: string, status: string) => ({ ok: true, data: { id, projectId: "p1", status } }));
  seedSessionUser({ member: { id: "s1", name: "Luis Pérez" }, access: "Administrador" });
});

afterEach(() => cleanup());

describe("TareasVisual · summary", () => {
  it("renders four tiles with captions", () => {
    renderVisual();
    const summary = screen.getByRole("region", { name: "Resumen" });
    const tiles = summary.querySelectorAll('[data-slot="kpi-spark-tile"]');
    expect(tiles).toHaveLength(4);
    expect(Array.from(tiles).map((t) => t.querySelector('[data-slot="kpi-spark-caption"]')?.textContent)).toEqual([
      "+3 esta semana",
      "+2 desde el lunes",
      "5 personas trabajando",
      "+2 vs. semana pasada",
    ]);
    // Values ≥ 1000 group with a space.
    expect(tiles[3].querySelector('[data-slot="kpi-spark-value"]')?.textContent).toBe("1 234");
    // A bad delta reads destructive, a good one success.
    expect(tiles[1].querySelector('[data-slot="kpi-spark-caption"] .text-destructive')?.textContent).toBe("+2");
    expect(tiles[3].querySelector('[data-slot="kpi-spark-caption"] .text-success')?.textContent).toBe("+2");
    // Vencidas reads destructive.
    expect(tiles[1].querySelector('[data-slot="kpi-spark-value"]')?.classList.contains("text-destructive")).toBe(true);
    // Tiles are not focusable.
    expect(summary.querySelector('[data-slot="kpi-spark-tiles"] [tabindex], [data-slot="kpi-spark-tiles"] a')).toBeNull();
  });

  it("donut legend counts", () => {
    renderVisual();
    const donut = screen.getByRole("region", { name: "Por estatus" });
    const legend = Array.from(donut.querySelectorAll('[data-slot="donut-legend"] li')).map((li) => li.textContent);
    expect(legend).toEqual(["Pendiente30", "En proceso5", "Bloqueado1", "Completado12"]);
    // The center total is the sum of the column totals.
    expect(within(donut).getByText("48")).toBeTruthy();
    expect(within(donut).getByRole("img").getAttribute("aria-label")).toBe(
      "Por estatus: Pendiente 30, En proceso 5, Bloqueado 1, Completado 12",
    );
  });

  it("week strip aria-labels", () => {
    renderVisual();
    const week = screen.getByRole("region", { name: "Esta semana" });
    expect(within(week).getByText("9 – 15 nov · 9 entregas")).toBeTruthy();
    expect(within(week).getByRole("list").querySelectorAll("li")).toHaveLength(7);

    const days = weekStripDays(TREND.week, "2026-11-09");
    expect(days.slice(0, 3).map((d) => d.ariaLabel)).toEqual([
      "Lunes 9, 1 entrega (hoy)",
      "Martes 10, sin entregas",
      "Miércoles 11, 2 entregas",
    ]);
    expect(days.map((d) => d.barHeight).slice(0, 4)).toEqual([14, 4, 26, 38]);
    expect(days.filter((d) => d.busiest).map((d) => d.date)).toEqual(["2026-11-12"]);
    expect(days[0].today).toBe(true);
    expect(days[1].barColor).toBe("var(--border)");
  });

  it("keeps the board when the trend fails, with Reintentar", async () => {
    const client = seededClient();
    client.removeQueries({ queryKey: qk.tareas.trend(F) });
    pageData.getTareasTrend.mockRejectedValue(new Error("boom"));
    renderVisual(client);
    expect(await screen.findByText("No se pudo cargar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
    expect(column("Pendiente", 30)).toBeTruthy();
  });
});

describe("TareasVisual · filters", () => {
  it("Mostrar, etapa and Solo mías are pressed buttons with the facet counts", () => {
    renderVisual();
    const group = screen.getByRole("group", { name: "Filtros" });
    const todas = within(group).getByRole("button", { name: /^Todas/ });
    expect(todas.getAttribute("aria-pressed")).toBe("true");
    expect(todas.textContent).toContain("48");
    expect(within(group).getByRole("button", { name: /^En retraso/ }).textContent).toContain("8");
    expect(within(group).getByRole("button", { name: /^Solo mías/ }).textContent).toContain("7");

    fireEvent.click(within(group).getByRole("button", { name: /^Abiertas/ }));
    expect(onQuery).toHaveBeenLastCalledWith({ mostrar: "abiertas" });
    fireEvent.click(within(group).getByRole("button", { name: /^Presale/ }));
    expect(onQuery).toHaveBeenLastCalledWith({ tramo: "presale" });
    fireEvent.click(within(group).getByRole("button", { name: /^Solo mías/ }));
    expect(onQuery).toHaveBeenLastCalledWith({ responsable: "yo" });
    fireEvent.click(todas);
    expect(onQuery).toHaveBeenLastCalledWith({ mostrar: "todas", tramo: null });
  });
});

describe("TareasVisual · board", () => {
  it("Ver N más reveals loaded cards then fetches", async () => {
    pageData.getTareasBoardColumn.mockResolvedValue({
      rows: [makeRow({ id: "p7", title: "Pendiente 7" })],
      total: 30,
      nextCursor: null,
    });
    renderVisual();
    const pendiente = column("Pendiente", 30);
    expect(cardsIn(pendiente)).toHaveLength(4);

    fireEvent.click(within(pendiente).getByRole("button", { name: "Ver 26 más en Pendiente" }));
    expect(cardsIn(pendiente)).toHaveLength(6);
    expect(pageData.getTareasBoardColumn).not.toHaveBeenCalled();

    fireEvent.click(within(pendiente).getByRole("button", { name: "Ver 24 más en Pendiente" }));
    await waitFor(() =>
      expect(pageData.getTareasBoardColumn).toHaveBeenCalledWith({ filters: F, columnId: "pendiente", cursor: "c-1" }),
    );
    await waitFor(() => expect(cardsIn(pendiente)).toHaveLength(7));
  });

  it("shows Completado compact and the blocked card with Bloqueada and its wait", () => {
    renderVisual();
    const done = column("Completado", 12).querySelector('[data-task-id="c1"]')!;
    expect(done.hasAttribute("data-compact")).toBe(true);
    expect(done.textContent).toContain("Oficina Polanco · Presale · Luis Pérez");
    const blocked = column("Bloqueado", 1).querySelector<HTMLElement>('[data-task-id="b1"]')!;
    expect(within(blocked).getByText("Bloqueada")).toBeTruthy();
    expect(within(blocked).getByText("Oficina Polanco · espera 2 tareas")).toBeTruthy();
  });

  it("quick-add creates in the column status", async () => {
    renderVisual();
    const input = within(column("En proceso", 5)).getByRole("textbox", { name: "Nueva tarea en En proceso" });
    fireEvent.change(input, { target: { value: "Revisar planos" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(quickAdd.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Revisar planos", status: "en_proceso", projectId: null }),
    );
  });

  it("n focuses the first column's quick-add, not while typing", () => {
    renderVisual();
    fireEvent.keyDown(document.body, { key: "n" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Nueva tarea en Pendiente");

    const search = screen.getByRole("searchbox", { name: "Buscar tareas" });
    search.focus();
    fireEvent.keyDown(search, { key: "n" });
    expect(document.activeElement).toBe(search);
  });

  it("drag rollback shows toast", async () => {
    actions.setTaskStatusAction.mockResolvedValue({ ok: false, error: "FORBIDDEN: task status change" });
    const client = seededClient();
    const { container } = renderVisual(client);
    const dragged = container.querySelector<HTMLElement>('[data-task-id="p1"]')!;

    fireEvent.dragStart(dragged);
    const target = column("En proceso", 5);
    fireEvent.dragOver(target);
    fireEvent.drop(target);

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("No tienes permiso para realizar esta acción."));
    await waitFor(() => expect(column("Pendiente", 30).contains(container.querySelector('[data-task-id="p1"]'))).toBe(true));
    expect(client.getQueryData<TareasBoardData>(qk.tareas.board(F))).toEqual(boardData());
  });

  it("card link opens ?tarea=", () => {
    nav.search = "mostrar=abiertas";
    const push = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    renderVisual();
    const link = screen.getByRole("link", { name: "Pendiente 1" });
    expect(link.getAttribute("href")).toBe("/tareas?mostrar=abiertas&tarea=p1");
    fireEvent.click(link);
    expect(push).toHaveBeenCalledWith(null, "", "/tareas?mostrar=abiertas&tarea=p1");
    push.mockRestore();
  });

  it("without permission to change the status, no drag handle and a disabled Mover a…", () => {
    // A Colaborador moves only the tasks they take part in; these are Luis's.
    seedSessionUser({ member: { id: "s9", name: "Otra" }, access: "Colaborador" });
    renderVisual();
    const card = screen.getByRole("link", { name: "Pendiente 1" }).closest("li")!;
    expect(within(card).queryByRole("button", { name: "Arrastrar Pendiente 1" })).toBeNull();
    expect(card.getAttribute("draggable")).not.toBe("true");
    const move = within(card).getByRole("button", { name: "Mover a… Pendiente 1" });
    expect(move.hasAttribute("disabled") || move.getAttribute("aria-disabled") === "true" || move.hasAttribute("data-disabled")).toBe(true);
  });
});
