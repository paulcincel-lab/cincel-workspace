// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { TaskListRow } from "@/lib/types/core";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { DistributionSegment, RecordTableData } from "@/lib/types/widgets";

const nav = vi.hoisted(() => ({ search: "", refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: nav.refresh, replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const actions = vi.hoisted(() => ({
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
}));
vi.mock("@/lib/actions/tasks-actions", () => actions);

// Reads never reach the server here: the cache is seeded as the page would.
const pageData = vi.hoisted(() => ({
  getTareasPageData: vi.fn(),
  getTareasBoard: vi.fn(),
  getTareasFacets: vi.fn(),
  getTareasListPage: vi.fn(),
  getTareasBoardColumn: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/tareas-actions", () => pageData);


const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (msg: string) => toastError(msg), success: vi.fn() } }));

// Shell pieces and sibling widgets render as plain markup: this file checks
// what the Tablero view hands the board, not their own styling.
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
vi.mock("@/components/shell/EmptyState", () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}));
vi.mock("@/components/widgets/DistributionWidget", () => ({
  DistributionWidget: ({ title, segments }: { title: string; segments: DistributionSegment[] }) => (
    <ul aria-label={title}>
      {segments.map((s) => (
        <li key={s.key} data-key={s.key} data-value={s.value}>
          {s.label}: {s.value}
        </li>
      ))}
    </ul>
  ),
}));
vi.mock("@/components/widgets/RecordTable", () => ({
  RecordTable: ({ data }: { data: RecordTableData }) => (
    <table data-testid="record-table" data-columns={data.columns.map((c) => c.key).join(",")}>
      <tbody>
        {data.rows.map((r) => (
          <tr key={String(r.id)} data-row-id={String(r.id)}>
            <td>{String(r.tarea)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import {
  TABLERO_DESCRIPTION,
  TareasTablero,
  findBoardRow,
  moveTaskToColumnAction,
} from "@/components/tareas/TareasTablero";
import { boardColumnLabel } from "@/components/widgets/TaskBoardWidget";
import { qk } from "@/lib/query/keys";
import { tareasListFiltersOf, tareasPageKeyInputOf } from "@/lib/query/options/tareas";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import { emptyBoardColumns, type TareasBoardData, type TareasPageData } from "@/lib/tareas/page-data";
import { DEFAULT_TAREAS_QUERY, type TareasQuery } from "@/lib/tareas/query";
import { seedSessionUser } from "@/tests/helpers/session-user";

function makeRow(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: "t1",
    projectId: "p1",
    kind: "workflow",
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
    project: { id: "p1", name: "Casa Lomas", clientName: null },
    workflow: { id: "w1", key: "diseno", name: "Diseño", sortOrder: 2 },
    phase: null,
    space: null,
    manager: { id: "s1", name: "Ana Ruiz" },
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

const QA = { id: "cs-qa", name: "QA en revisión", closes: false, countsAsCompleted: false, sortOrder: 1 };

const ROWS = {
  t1: makeRow({ id: "t1", title: "Levantamiento", commitmentDate: "2026-01-15", subtaskCount: 3, subtaskDoneCount: 1 }),
  t2: makeRow({ id: "t2", title: "Planos ejecutivos", commitmentDate: "2030-06-15" }),
  t3: makeRow({ id: "t3", title: "Render sala", status: "en_proceso" }),
  t4: makeRow({ id: "t4", title: "Contrato firmado", status: "completado", closedAt: "2026-01-02" }),
};

function boardData(statuses: TareasBoardData["statuses"] = []): TareasBoardData {
  const columns = emptyBoardColumns(statuses);
  columns.pendiente = { rows: [ROWS.t1, ROWS.t2], total: 2, nextCursor: null };
  columns.en_proceso = { rows: [ROWS.t3], total: 1, nextCursor: null };
  columns.completado = { rows: [ROWS.t4], total: 1, nextCursor: null };
  return { columns, statuses };
}
const TOTAL = 4;

const QUERY: TareasQuery = { ...DEFAULT_TAREAS_QUERY };
const F = tareasListFiltersOf(QUERY);
const PAGE: TareasPageData = { facets: { total: TOTAL, byEtapa: {}, projects: [] }, etapas: [], staff: [] };

/** A client seeded as `/tareas` hydrates it: the page bundle and the board it seeded. */
function seededClient(board: TareasBoardData = boardData()): QueryClient {
  const client = createTestQueryClient();
  // The bundle is keyed by the style; seed it for every one the tests render.
  for (const estilo of ["visual", "esencial", "analitico"] as const) {
    client.setQueryData(qk.tareas.page(tareasPageKeyInputOf(QUERY, estilo)), PAGE);
  }
  client.setQueryData(qk.tareas.board(F), board);
  return client;
}

function renderTablero(style: PresentationStyle, client: QueryClient = seededClient()) {
  return renderWithQueryClient(
    <StyleProvider style={style} scope="staff">
      <TareasTablero query={QUERY} header={{ title: "Tareas" }} />
    </StyleProvider>,
    { client },
  );
}

function card(container: HTMLElement, taskId: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
  if (!el) throw new Error(`no card ${taskId}`);
  return el;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const okDetail = (id: string, status: string) => ({ ok: true as const, data: { id, projectId: "p1", status } });

beforeEach(() => {
  nav.search = "";
  nav.refresh.mockReset();
  nav.replace.mockReset();
  toastError.mockReset();
  for (const fn of Object.values(pageData)) fn.mockReset();
  actions.setTaskStatusAction.mockReset().mockImplementation(async (id: string, status: string) => okDetail(id, status));
  actions.setTaskCustomStatusAction.mockReset().mockImplementation(async (id: string) => okDetail(id, "en_proceso"));
  seedSessionUser({ member: { id: "s1", name: "Ana" }, access: "Colaborador" });
});

afterEach(() => cleanup());

describe("TareasTablero · three styles from tareas.board(f)", () => {
  it("renders the header with the Tablero description and fetches nothing on mount", () => {
    renderTablero("visual");
    expect(screen.getByRole("heading", { name: "Tareas" })).toBeTruthy();
    expect(screen.getByText(TABLERO_DESCRIPTION)).toBeTruthy();
    // Seeded by the page: nothing is fetched on mount.
    expect(pageData.getTareasBoard).not.toHaveBeenCalled();
    expect(pageData.getTareasPageData).not.toHaveBeenCalled();
  });

  it("Visual: one column per estatus, empty column collapsed, card links keep the view and filters", () => {
    nav.search = "etapa=diseno&estado=pendiente";
    const { container } = renderTablero("visual");

    expect(container.querySelectorAll("[data-task-id]").length).toBe(TOTAL);
    expect(screen.getByRole("region", { name: boardColumnLabel("Pendiente", 2) })).toBeTruthy();
    expect(screen.getByRole("region", { name: boardColumnLabel("En proceso", 1) })).toBeTruthy();
    expect(screen.getByRole("region", { name: boardColumnLabel("Completado", 1) })).toBeTruthy();
    expect(screen.getByRole("region", { name: boardColumnLabel("Bloqueado", 0) }).getAttribute("data-collapsed")).toBe("true");
    expect(screen.getByRole("link", { name: "Planos ejecutivos" }).getAttribute("href")).toBe(
      "/tareas?etapa=diseno&estado=pendiente&tarea=t2",
    );
  });

  it("Visual: the column count is the column's total, not the loaded cards", () => {
    const board = boardData();
    board.columns.pendiente = { ...board.columns.pendiente, total: 57, nextCursor: "c-1" };
    renderTablero("visual", seededClient(board));
    const column = screen.getByRole("region", { name: boardColumnLabel("Pendiente", 57) });
    expect(within(column).getByRole("button", { name: /^Ver \d+ más en Pendiente$/ })).toBeTruthy();
  });

  it("Esencial: groups by estatus with the same counts and Completado collapsed", () => {
    renderTablero("esencial");

    const pendiente = screen.getByRole("heading", { name: "Pendiente · 2" }).closest("section")!;
    const enProceso = screen.getByRole("heading", { name: "En proceso · 1" }).closest("section")!;
    const completado = screen.getByRole("heading", { name: "Completado · 1" }).closest("section")!;
    expect(pendiente.querySelectorAll("tr").length).toBe(2);
    expect(enProceso.querySelectorAll("tr").length).toBe(1);
    expect(completado.querySelector("table")).toBeNull();
    expect(screen.queryByRole("heading", { name: /Bloqueado/ })).toBeNull();
  });

  it("Analítico: estatus summary and one 10-column table with every task", () => {
    renderTablero("analitico");

    const summary = screen.getByRole("list", { name: "Tareas por estatus" });
    const values = Array.from(summary.querySelectorAll("li")).map((li) => Number(li.getAttribute("data-value")));
    expect(values.reduce((a, b) => a + b, 0)).toBe(TOTAL);

    const table = screen.getByTestId("record-table");
    expect(table.querySelectorAll("tr").length).toBe(TOTAL);
    expect(table.getAttribute("data-columns")?.split(",")).toHaveLength(10);
  });

  it("Visual: with no task matching the filters every column still shows with 0 (#919)", () => {
    renderTablero("visual", seededClient({ columns: emptyBoardColumns([]), statuses: [] }));

    expect(screen.queryByTestId("empty-state")).toBeNull();
    for (const label of ["Pendiente", "En proceso", "Completado", "Bloqueado"]) {
      expect(screen.getByRole("region", { name: boardColumnLabel(label, 0) })).toBeTruthy();
    }
    expect(screen.getAllByText("Sin tareas")).toHaveLength(4);
  });

  it("Visual: shows a column for every configured custom status, even when empty", () => {
    renderTablero("visual", seededClient({ columns: emptyBoardColumns([QA]), statuses: [QA] }));
    expect(screen.getByRole("region", { name: boardColumnLabel("QA en revisión", 0) })).toBeTruthy();
  });

  it.each<PresentationStyle>(["esencial", "analitico"])("shows the filters empty state in %s", (style) => {
    renderTablero(style, seededClient({ columns: emptyBoardColumns([]), statuses: [] }));
    expect(screen.getByTestId("empty-state").textContent).toBe("No hay tareas con estos filtros");
  });

  it("waits for the page bundle before reading the board on its own (one request per filter change)", () => {
    pageData.getTareasPageData.mockReturnValue(new Promise(() => {}));
    renderTablero("visual", createTestQueryClient());
    expect(pageData.getTareasPageData).toHaveBeenCalledTimes(1);
    expect(pageData.getTareasBoard).not.toHaveBeenCalled();
  });
});

describe("TareasTablero · drag (optimistic on tareas.board(f))", () => {
  it("moves the card in the cache at once, adjusts both totals and invalidates the dependent keys, not the board", async () => {
    const pending = deferred<unknown>();
    actions.setTaskStatusAction.mockReturnValue(pending.promise);
    const client = seededClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { container } = renderTablero("visual", client);

    fireEvent.dragStart(card(container, "t2"));
    const target = screen.getByRole("region", { name: boardColumnLabel("En proceso", 1) });
    fireEvent.dragOver(target);
    fireEvent.drop(target);

    await waitFor(() => expect(actions.setTaskStatusAction).toHaveBeenCalledWith("t2", "en_proceso"));
    // Moved before the server answers.
    expect(screen.getByRole("region", { name: boardColumnLabel("En proceso", 2) }).contains(card(container, "t2"))).toBe(true);
    const board = client.getQueryData<TareasBoardData>(qk.tareas.board(F))!;
    expect(board.columns.pendiente.total).toBe(1);
    expect(board.columns.en_proceso.total).toBe(2);

    await act(async () => {
      pending.resolve(okDetail("t2", "en_proceso"));
      await pending.promise;
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify(["tareas", "facets"]),
        JSON.stringify(["tareas", "list"]),
        JSON.stringify(qk.proyectos.tab("p1", "tareas")),
        JSON.stringify(qk.proyectos.cronograma("p1")),
        JSON.stringify(qk.inicio()),
        JSON.stringify(qk.shell.badges()),
      ]),
    );
    expect(keys.some((k) => k.startsWith('["tareas","board"'))).toBe(false);
    expect(toastError).not.toHaveBeenCalled();
    expect(nav.refresh).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("rolls the card back and shows the mapped Spanish error when the action fails", async () => {
    actions.setTaskStatusAction.mockResolvedValue({ ok: false, error: "FORBIDDEN: task status change" });
    const client = seededClient();
    const { container } = renderTablero("visual", client);

    fireEvent.dragStart(card(container, "t1"));
    const strip = screen.getByRole("region", { name: boardColumnLabel("Bloqueado", 0) });
    fireEvent.dragOver(strip);
    fireEvent.drop(strip);

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("No tienes permiso para realizar esta acción."));
    expect(screen.getByRole("region", { name: boardColumnLabel("Pendiente", 2) }).contains(card(container, "t1"))).toBe(true);
    expect(screen.getByRole("region", { name: boardColumnLabel("Bloqueado", 0) }).getAttribute("data-collapsed")).toBe("true");
    expect(client.getQueryData<TareasBoardData>(qk.tareas.board(F))).toEqual(boardData());
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("patches a cached task detail with the move and rolls it back on error", async () => {
    actions.setTaskStatusAction.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    const client = seededClient();
    const detail = { ...ROWS.t3, notes: null };
    client.setQueryData(qk.tasks.detail("t3"), detail);
    renderTablero("visual", client);

    fireEvent.click(screen.getByRole("button", { name: "Mover a… Render sala" }));
    const option = await screen.findByRole("menuitem", { name: "Bloqueado" });
    await act(async () => {
      fireEvent.click(option);
    });

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(client.getQueryData(qk.tasks.detail("t3"))).toEqual(detail);
  });

  it("moves a card from the keyboard through “Mover a…”", async () => {
    const { container } = renderTablero("visual");

    const trigger = screen.getByRole("button", { name: "Mover a… Render sala" });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    const option = await screen.findByRole("menuitem", { name: "Completado" });

    await act(async () => {
      fireEvent.click(option);
    });

    expect(actions.setTaskStatusAction).toHaveBeenCalledWith("t3", "completado");
    await waitFor(() =>
      expect(screen.getByRole("region", { name: boardColumnLabel("Completado", 2) }).contains(card(container, "t3"))).toBe(true),
    );
  });

  it("drops into an empty custom column through setTaskCustomStatusAction", async () => {
    const client = seededClient(boardData([QA]));
    const { container } = renderTablero("visual", client);

    fireEvent.dragStart(card(container, "t2"));
    const strip = screen.getByRole("region", { name: boardColumnLabel("QA en revisión", 0) });
    fireEvent.dragOver(strip);
    await act(async () => {
      fireEvent.drop(strip);
    });

    expect(actions.setTaskCustomStatusAction).toHaveBeenCalledWith("t2", "cs-qa");
    await waitFor(() =>
      expect(screen.getByRole("region", { name: boardColumnLabel("QA en revisión", 1) }).contains(card(container, "t2"))).toBe(true),
    );
    const moved = findBoardRow(client, F, "t2");
    expect(moved?.customStatus?.id).toBe("cs-qa");
    expect(moved?.status).toBe("en_proceso");
  });
});

describe("moveTaskToColumnAction", () => {
  it("sends base columns to setTaskStatusAction", async () => {
    await moveTaskToColumnAction({ taskId: "t1", columnKey: "bloqueado", projectId: "p1" });
    expect(actions.setTaskStatusAction).toHaveBeenCalledWith("t1", "bloqueado");
    expect(actions.setTaskCustomStatusAction).not.toHaveBeenCalled();
  });

  it("sends custom:<id> columns to setTaskCustomStatusAction", async () => {
    await moveTaskToColumnAction({ taskId: "t1", columnKey: "custom:cs-rev", projectId: "p1" });
    expect(actions.setTaskCustomStatusAction).toHaveBeenCalledWith("t1", "cs-rev");
    expect(actions.setTaskStatusAction).not.toHaveBeenCalled();
  });
});

describe("TareasTablero · quick-add", () => {
  it("shows “+ Agregar” at the end of every open column", () => {
    renderTablero("visual");
    for (const label of ["Pendiente", "En proceso", "Completado"]) {
      const column = screen.getByRole("region", { name: new RegExp(`^${label}, `) });
      expect(within(column).getByRole("button", { name: `Agregar tarea en ${label}` }).textContent).toBe("+ Agregar");
    }
  });

  it("opens the shell's dialog with that column's estatus (no dialog of its own)", () => {
    renderTablero("visual");
    act(() => fireEvent.click(screen.getByRole("button", { name: "Agregar tarea en En proceso" })));
    expect(useNewTaskUi.getState()).toMatchObject({
      open: true,
      defaults: { status: "en_proceso" },
      source: "tablero-quick-add",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("passes custom:<id> for a custom status column", () => {
    const board = boardData([QA]);
    board.columns["custom:cs-qa"] = {
      rows: [makeRow({ id: "t5", title: "Revisión QA", status: "en_proceso", customStatus: QA })],
      total: 1,
      nextCursor: null,
    };
    renderTablero("visual", seededClient(board));
    act(() => fireEvent.click(screen.getByRole("button", { name: "Agregar tarea en QA en revisión" })));
    expect(useNewTaskUi.getState().defaults).toEqual({ status: "custom:cs-qa" });
  });

  it("lands the created task in its column once the dialog invalidates tareas (no reload)", async () => {
    const client = seededClient();
    const created = makeRow({ id: "t9", title: "Nueva en proceso", status: "en_proceso" });
    const next = boardData();
    next.columns.en_proceso = { rows: [created, ROWS.t3], total: 2, nextCursor: null };
    pageData.getTareasBoard.mockResolvedValue(next);
    pageData.getTareasPageData.mockResolvedValue({ ...PAGE, board: next });
    const { container } = renderTablero("visual", client);

    // What the host dialog's `useActionMutation` does once the task is created.
    await act(async () => {
      await client.invalidateQueries({ queryKey: qk.tareas.all });
    });

    await waitFor(() =>
      expect(screen.getByRole("region", { name: boardColumnLabel("En proceso", 2) }).contains(card(container, "t9"))).toBe(true),
    );
    expect(nav.refresh).not.toHaveBeenCalled();
  });
});
