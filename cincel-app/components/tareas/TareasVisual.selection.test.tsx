// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
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
  bulkUpdateTasksAction: vi.fn(),
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

const toast = vi.hoisted(() => Object.assign(vi.fn(() => "t1"), { error: vi.fn(), dismiss: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

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
    context: { label: string; projectId: string | null; status?: string; etapaId?: string | null };
    onCreate(d: unknown): Promise<unknown>;
  }) => (
    <input
      aria-label={`Nueva tarea en ${context.label}`}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        void onCreate({
          title: (e.target as HTMLInputElement).value,
          projectId: context.projectId,
          etapaId: context.etapaId ?? null,
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
      { date: "2026-11-09", due: 1, etapaKey: "presale" },
      { date: "2026-11-10", due: 0, etapaKey: null },
      { date: "2026-11-11", due: 2, etapaKey: "diseno" },
      { date: "2026-11-12", due: 3, etapaKey: "construccion" },
      { date: "2026-11-13", due: 3, etapaKey: "presale" },
      { date: "2026-11-14", due: 0, etapaKey: null },
      { date: "2026-11-15", due: 0, etapaKey: null },
    ],
  },
};

const FACETS: TareasFacets = {
  total: 48,
  byEtapa: { presale: 48 },
  projects: [],
  mostrar: { todas: 48, abiertas: 36, en_retraso: 8 },
  mine: 7,
};
const ETAPAS = [{ id: "w1", key: "presale", name: "Presale", sortOrder: 1 }];

const QUERY: TareasQuery = { ...DEFAULT_TAREAS_QUERY };
const F = tareasListFiltersOf(QUERY);
const PAGE: TareasPageData = { facets: FACETS, etapas: ETAPAS, staff: [] };

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
        etapas={ETAPAS}
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
const box = (title: string) => screen.getByRole("checkbox", { name: `Seleccionar «${title}»` });
const toggle = (title: string, shift = false) => {
  fireEvent.pointerDown(box(title), { shiftKey: shift });
  fireEvent.click(box(title));
};

beforeEach(() => {
  nav.search = "";
  toast.mockClear();
  toast.error.mockClear();
  for (const fn of Object.values(pageData)) fn.mockReset();
  pageData.getTareasTrend.mockResolvedValue(TREND);
  actions.bulkUpdateTasksAction.mockReset();
  actions.setTaskStatusAction
    .mockReset()
    .mockImplementation(async (id: string, status: string) => ({ ok: true, data: { id, projectId: "p1", status } }));
  seedSessionUser({ member: { id: "s1", name: "Luis Pérez" }, access: "Administrador" });
});

afterEach(() => cleanup());

describe("TareasVisual · card selection (#1168)", () => {
  it("every card has a checkbox and the bar shows the count", () => {
    renderVisual();
    expect(screen.queryByRole("toolbar")).toBeNull();
    toggle("Pendiente 1");
    toggle("Cotización de cancelería");
    expect(screen.getByRole("toolbar", { name: "2 seleccionadas" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Estatus" })).toBeTruthy();
  });

  it("shift-click selects the range of cards between the last one and this one", () => {
    renderVisual();
    toggle("Pendiente 1");
    toggle("Pendiente 3", true);
    expect(screen.getByRole("toolbar", { name: "3 seleccionadas" })).toBeTruthy();
    expect(box("Pendiente 2").getAttribute("aria-checked")).toBe("true");
  });

  it("Esc clears the selection", () => {
    renderVisual();
    toggle("Pendiente 1");
    expect(screen.getByRole("toolbar")).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("dropping a selected card on a column moves every selected card in one Estatus change", async () => {
    actions.bulkUpdateTasksAction.mockResolvedValue({
      ok: true,
      data: { updated: ["p1", "p2", "s1"], skipped: [], subtasks: [{ id: "s1", parentId: "p1", status: "pendiente", customStatusId: null }] },
    });
    const { container } = renderVisual();
    toggle("Pendiente 1");
    toggle("Pendiente 2");

    const dragged = container.querySelector<HTMLElement>('[data-task-id="p1"]')!;
    fireEvent.dragStart(dragged);
    const target = column("En proceso", 5);
    fireEvent.dragOver(target);
    fireEvent.drop(target);

    await waitFor(() => expect(actions.bulkUpdateTasksAction).toHaveBeenCalledWith(["p1", "p2"], { status: "en_proceso" }));
    expect(actions.setTaskStatusAction).not.toHaveBeenCalled();
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const [, options] = toast.mock.calls[0] as unknown as [string, { action: { label: string } }];
    expect(options.action.label).toBe("Deshacer");
  });

  it("dropping a card that is not selected moves only that card", async () => {
    const { container } = renderVisual();
    toggle("Pendiente 2");
    const dragged = container.querySelector<HTMLElement>('[data-task-id="p1"]')!;
    fireEvent.dragStart(dragged);
    const target = column("En proceso", 5);
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    await waitFor(() => expect(actions.setTaskStatusAction).toHaveBeenCalledWith("p1", "en_proceso"));
    expect(actions.bulkUpdateTasksAction).not.toHaveBeenCalled();
  });
});
