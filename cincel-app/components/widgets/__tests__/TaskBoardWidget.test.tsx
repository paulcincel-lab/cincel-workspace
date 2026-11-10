// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";

import { renderWithQueryClient } from "@/lib/query/test-utils";
import type { TaskListRow } from "@/lib/types/core";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { DistributionSegment, RecordTableData } from "@/lib/types/widgets";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (msg: string) => toastError(msg) } }));

const nav = vi.hoisted(() => ({ pathname: "/tareas", search: "" }));
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
          onNavigate?.({ preventDefault: () => e.preventDefault() });
        }}
      >
        {children}
      </a>
    );
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const caps = vi.hoisted(() => ({ canCreateActivity: true }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => ({ canCreateActivity: caps.canCreateActivity }),
}));

const pageData = vi.hoisted(() => ({ getTareasBoardColumn: vi.fn() }));
vi.mock("@/lib/actions/page-data/tareas-actions", () => pageData);

// Sibling widgets and shell states are rendered as plain markup so this file
// checks what TaskBoardWidget hands them, independent of their own styling.
vi.mock("@/components/widgets/DistributionWidget", () => ({
  DistributionWidget: ({ title, segments }: { title: string; segments: DistributionSegment[] }) => (
    <ul aria-label={title}>
      {segments.map((s) => (
        <li key={s.key} data-key={s.key} data-value={s.value} data-secondary={s.secondary}>
          {s.label}: {s.value}
        </li>
      ))}
    </ul>
  ),
}));
vi.mock("@/components/widgets/RecordTable", () => ({
  RecordTable: ({ data, density }: { data: RecordTableData; density?: string }) => (
    <table data-testid="record-table" data-density={density ?? "comoda"} data-totals={String(data.totals ?? "")}>
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
vi.mock("@/components/shell/EmptyState", () => ({
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      {description ? <p>{description}</p> : null}
    </div>
  ),
}));
vi.mock("@/components/shell/LoadingSkeleton", () => ({
  LoadingSkeleton: ({ variant }: { variant: string }) => <div data-testid="loading-skeleton" data-variant={variant} />,
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import {
  BOARD_COLUMN_EMPTY,
  BOARD_DROP_HINT,
  TaskBoardWidget,
  boardCardDelay,
  boardCardHref,
  boardColumnLabel,
  boardDueText,
  boardSegments,
} from "@/components/widgets/TaskBoardWidget";
import {
  emptyTaskBoardFixture,
  taskBoardExpected,
  taskBoardFixture,
  taskBoardTableFixture,
} from "@/components/widgets/fixtures/task-board";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import type { TaskBoard } from "@/lib/types/redesign";
import { seedSessionUser } from "@/tests/helpers/session-user";

const LABELS: Record<keyof typeof taskBoardExpected.counts, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  completado: "Completado",
  bloqueado: "Bloqueado",
  "custom:cs-rev": "En revisión",
};

function renderBoard(
  style: PresentationStyle,
  props: Partial<Parameters<typeof TaskBoardWidget>[0]> = {},
) {
  const onMove = props.onMove ?? vi.fn(() => Promise.resolve());
  const ui = (next: Partial<Parameters<typeof TaskBoardWidget>[0]>) => (
    <StyleProvider style={style} scope="staff">
      <TaskBoardWidget board={taskBoardFixture} table={taskBoardTableFixture} onMove={onMove} {...next} />
    </StyleProvider>
  );
  const utils = renderWithQueryClient(ui(props));
  return { ...utils, onMove, rerenderWith: (next: Partial<Parameters<typeof TaskBoardWidget>[0]>) => utils.rerender(ui(next)) };
}

function card(container: HTMLElement, taskId: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
  if (!el) throw new Error(`no card ${taskId}`);
  return el;
}

/** `board` with one task moved to another base status, as the page's cache hands it back. */
function withTaskIn(board: TaskBoard, taskId: string, status: keyof TaskBoard): TaskBoard {
  const all = Object.values(board).flat();
  const task = all.find((t) => t.id === taskId)!;
  const next: TaskBoard = { pendiente: [], en_proceso: [], completado: [], bloqueado: [] };
  for (const t of all) {
    if (t.id === taskId) continue;
    next[t.status].push(t);
  }
  next[status].push({ ...task, status, customStatus: null });
  return next;
}

beforeEach(() => {
  toastError.mockReset();
  pageData.getTareasBoardColumn.mockReset();
  nav.pathname = "/tareas";
  nav.search = "";
  caps.canCreateActivity = true;
  seedSessionUser({ member: { id: "s-1", name: "Ana" }, access: "Colaborador" });
});

describe("TaskBoardWidget · same fixture in every style", () => {
  it("Visual renders one column per status with the fixture counts and collapses the empty one", () => {
    const { container } = renderBoard("visual");

    for (const [key, count] of Object.entries(taskBoardExpected.counts)) {
      const column = screen.getByRole("region", { name: boardColumnLabel(LABELS[key as keyof typeof LABELS], count) });
      expect(column.querySelectorAll("[data-task-id]").length).toBe(count);
      expect(column.getAttribute("data-collapsed")).toBe(count === 0 ? "true" : null);
    }
    expect(container.querySelectorAll("[data-task-id]").length).toBe(taskBoardExpected.total);
    expect(screen.getByRole("link", { name: "Planos ejecutivos" }).getAttribute("href")).toBe("/tareas?tarea=t2");
    expect(within(card(container, "t1")).getByText("1/3")).toBeTruthy();
    // Overdue due date in a destructive chip with the days late; a future one in an outline chip.
    const overdue = card(container, "t1").querySelector('[data-slot="board-card-due"]')!;
    expect(overdue.textContent).toMatch(/^15 ene · \d+ d$/);
    expect(overdue.getAttribute("data-variant")).toBe("destructive");
    const future = card(container, "t2").querySelector('[data-slot="board-card-due"]')!;
    expect(future.textContent).toBe("15 jun");
    expect(future.getAttribute("data-variant")).toBe("outline");

    expect(screen.queryByTestId("task-board-esencial")).toBeNull();
    expect(screen.queryByTestId("task-board-analitico")).toBeNull();
  });

  it("Esencial renders one table per non-empty estatus with the same counts, Completado collapsed to a link", () => {
    renderBoard("esencial");

    for (const [key, count] of Object.entries(taskBoardExpected.counts)) {
      const label = LABELS[key as keyof typeof LABELS];
      const heading = screen.queryByRole("heading", { name: `${label} · ${count}` });
      if (count === 0) {
        expect(heading).toBeNull();
        continue;
      }
      expect(heading).toBeTruthy();
      const section = heading!.closest("section")!;
      if (key === "completado") {
        expect(within(section).queryByTestId("record-table")).toBeNull();
        expect(within(section).getByRole("link", { name: "Ver completadas en la lista" }).getAttribute("href")).toBe(
          "/tareas?vista=lista&estado=completado",
        );
      } else {
        expect(within(section).getByTestId("record-table").querySelectorAll("tr").length).toBe(count);
      }
    }

    expect(screen.queryByTestId("task-board")).toBeNull();
    expect(screen.queryByTestId("task-board-analitico")).toBeNull();
  });

  it("Analítico renders the estatus summary and one dense table with the same numbers", () => {
    renderBoard("analitico");

    const summary = screen.getByRole("list", { name: "Tareas por estatus" });
    for (const [key, count] of Object.entries(taskBoardExpected.counts)) {
      const item = summary.querySelector(`[data-key="${key}"]`);
      expect(item?.getAttribute("data-value")).toBe(String(count));
      expect(item?.getAttribute("data-secondary")).toBe(
        String(taskBoardExpected.overdue[key as keyof typeof taskBoardExpected.overdue]),
      );
    }

    const table = screen.getByTestId("record-table");
    expect(table.getAttribute("data-density")).toBe("compacta");
    expect(table.getAttribute("data-totals")).toBe("auto");
    expect(table.querySelectorAll("tr").length).toBe(taskBoardExpected.total);

    expect(screen.queryByTestId("task-board")).toBeNull();
    expect(screen.queryByTestId("task-board-esencial")).toBeNull();
  });

  it("boardSegments sums to the fixture total", () => {
    const segments = boardSegments(taskBoardFixture);
    expect(segments.reduce((n, s) => n + s.value, 0)).toBe(taskBoardExpected.total);
    expect(segments.find((s) => s.key === "bloqueado")?.colorVar).toBe("var(--destructive)");
  });
});

describe("TaskBoardWidget · Visual moves", () => {
  it("hands a drop to onMove and keeps no copy of its own: the card stays until the board changes", () => {
    const onMove = vi.fn();
    const { container } = renderBoard("visual", { onMove });

    fireEvent.dragStart(card(container, "t2"));
    const target = screen.getByRole("region", { name: boardColumnLabel("En proceso", 2) });
    fireEvent.dragOver(target);
    fireEvent.drop(target);

    expect(onMove).toHaveBeenCalledWith("t2", "en_proceso");
    expect(screen.getByRole("region", { name: boardColumnLabel("Pendiente", 3) }).contains(card(container, "t2"))).toBe(true);
  });

  it("shows the board it is handed: the moved card (the cache's optimistic patch) lands in its column", () => {
    const { container, rerenderWith } = renderBoard("visual");
    rerenderWith({ board: withTaskIn(taskBoardFixture, "t2", "en_proceso") });
    expect(screen.getByRole("region", { name: boardColumnLabel("En proceso", 3) }).contains(card(container, "t2"))).toBe(true);
    expect(screen.getByRole("region", { name: boardColumnLabel("Pendiente", 2) })).toBeTruthy();
  });

  it("shows the mapped error when onMove rejects", async () => {
    const onMove = vi.fn(() => Promise.reject(new Error("FORBIDDEN")));
    const { container } = renderBoard("visual", { onMove });

    fireEvent.dragStart(card(container, "t2"));
    const target = screen.getByRole("region", { name: boardColumnLabel("En proceso", 2) });
    fireEvent.dragOver(target);
    await act(async () => {
      fireEvent.drop(target);
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("No tienes permiso para realizar esta acción."));
  });

  it("expands a collapsed column once the board has a card in it", async () => {
    const onMove = vi.fn();
    const { container, rerenderWith } = renderBoard("visual", { onMove });

    fireEvent.dragStart(card(container, "t3"));
    const strip = screen.getByRole("region", { name: boardColumnLabel("Bloqueado", 0) });
    fireEvent.dragOver(strip);
    fireEvent.drop(strip);
    expect(onMove).toHaveBeenCalledWith("t3", "bloqueado");

    rerenderWith({ onMove, board: withTaskIn(taskBoardFixture, "t3", "bloqueado") });
    const column = screen.getByRole("region", { name: boardColumnLabel("Bloqueado", 1) });
    expect(column.getAttribute("data-collapsed")).toBeNull();
    expect(column.contains(card(container, "t3"))).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("does not call onMove when a card is dropped on its own column", () => {
    const onMove = vi.fn(() => Promise.resolve());
    const { container } = renderBoard("visual", { onMove });

    fireEvent.dragStart(card(container, "t1"));
    const own = screen.getByRole("region", { name: boardColumnLabel("Pendiente", 3) });
    fireEvent.dragOver(own);
    fireEvent.drop(own);

    expect(onMove).not.toHaveBeenCalled();
  });

  it("offers a keyboard “Mover a…” menu with the other columns", async () => {
    const onMove = vi.fn(() => Promise.resolve());
    renderBoard("visual", { onMove });

    fireEvent.click(screen.getByRole("button", { name: "Mover a… Planos ejecutivos" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["En proceso", "Completado", "Bloqueado", "En revisión"]);

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Bloqueado" }));
    });
    expect(onMove).toHaveBeenCalledWith("t2", "bloqueado");
  });
});

describe("TaskBoardWidget · card link", () => {
  it("keeps the view and every filter and adds tarea", () => {
    nav.search = "vista=tablero&tramo=diseno&responsable=yo&q=planos";
    renderBoard("visual");
    expect(screen.getByRole("link", { name: "Planos ejecutivos" }).getAttribute("href")).toBe(
      "/tareas?vista=tablero&tramo=diseno&responsable=yo&q=planos&tarea=t2",
    );
  });

  it("boardCardHref replaces an open tarea", () => {
    expect(boardCardHref("/tareas", "vista=tablero&estado=pendiente&tarea=old", "t9")).toBe(
      "/tareas?vista=tablero&estado=pendiente&tarea=t9",
    );
  });

  it("opens the sheet shallowly (history.pushState, no navigation)", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    nav.search = "vista=tablero&tramo=diseno";
    renderBoard("visual");
    fireEvent.click(screen.getByRole("link", { name: "Planos ejecutivos" }));
    expect(pushState).toHaveBeenCalledWith(null, "", "/tareas?vista=tablero&tramo=diseno&tarea=t2");
    pushState.mockRestore();
  });
});

describe("TaskBoardWidget · column totals and Cargar más", () => {
  const FILTERS = { tramo: null, proyecto: null, responsable: null, estado: null, q: null };

  it("counts every matching task and loads the rest of a column page by page", async () => {
    const t1 = Object.values(taskBoardFixture).flat().find((t) => t.id === "t1")!;
    const extra: TaskListRow = {
      ...t1,
      id: "t-extra",
      title: "Tarea de la segunda página",
      subtaskDone: 0,
      commentCount: 0,
      attachmentCount: 0,
      checklistTotal: 0,
      checklistDone: 0,
    };
    pageData.getTareasBoardColumn.mockResolvedValue({ rows: [extra], total: 30, nextCursor: null });

    const { container } = renderBoard("visual", {
      columnPages: { filters: FILTERS, columns: { pendiente: { total: 30, nextCursor: "c-1" } } },
    });
    const column = screen.getByRole("region", { name: boardColumnLabel("Pendiente", 30) });
    fireEvent.click(within(column).getByRole("button", { name: /^Ver \d+ más en Pendiente$/ }));

    await waitFor(() => expect(container.querySelector('[data-task-id="t-extra"]')).toBeTruthy());
    expect(pageData.getTareasBoardColumn).toHaveBeenCalledWith({ filters: FILTERS, columnId: "pendiente", cursor: "c-1" });
    expect(within(column).queryByRole("button", { name: /más en Pendiente$/ })).toBeNull();
  });

  it("loads nothing until asked", () => {
    renderBoard("visual", {
      columnPages: { filters: FILTERS, columns: { pendiente: { total: 30, nextCursor: "c-1" } } },
    });
    expect(pageData.getTareasBoardColumn).not.toHaveBeenCalled();
  });
});

describe("TaskBoardWidget · empty and loading", () => {
  it("Visual keeps every column open with 0 and a drop zone when the board is empty", () => {
    renderBoard("visual", { board: emptyTaskBoardFixture, table: { ...taskBoardTableFixture, rows: [] } });

    expect(screen.queryByTestId("empty-state")).toBeNull();
    expect(screen.getByTestId("task-board")).toBeTruthy();
    for (const label of ["Pendiente", "En proceso", "Completado", "Bloqueado"]) {
      const column = screen.getByRole("region", { name: boardColumnLabel(label, 0) });
      expect(column.getAttribute("data-collapsed")).toBeNull();
      expect(within(column).getByRole("heading", { name: label })).toBeTruthy();
      expect(within(column).getByText(BOARD_COLUMN_EMPTY)).toBeTruthy();
    }
    expect(screen.getAllByTestId("board-column-empty")).toHaveLength(4);
  });

  it("shows a column per configured custom status even when no task is in it", () => {
    renderBoard("visual", {
      board: emptyTaskBoardFixture,
      table: { ...taskBoardTableFixture, rows: [] },
      customStatuses: [{ id: "cs-qa", name: "QA en revisión" }],
    });
    expect(screen.getByRole("region", { name: boardColumnLabel("QA en revisión", 0) })).toBeTruthy();
  });

  it("collapses an empty configured custom status to a strip that takes a drop", async () => {
    const onMove = vi.fn(() => Promise.resolve());
    const { container } = renderBoard("visual", { onMove, customStatuses: [{ id: "cs-qa", name: "QA en revisión" }] });

    const strip = screen.getByRole("region", { name: boardColumnLabel("QA en revisión", 0) });
    expect(strip.getAttribute("data-collapsed")).toBe("true");

    fireEvent.dragStart(card(container, "t1"));
    fireEvent.dragOver(strip);
    await act(async () => {
      fireEvent.drop(strip);
    });

    expect(onMove).toHaveBeenCalledWith("t1", "custom:cs-qa");
  });

  it("lists a configured custom status once when tasks are also in it", () => {
    renderBoard("visual", { customStatuses: [{ id: "cs-rev", name: "En revisión" }] });
    expect(screen.getAllByRole("region", { name: /^En revisión, / })).toHaveLength(1);
  });

  it.each<PresentationStyle>(["esencial", "analitico"])("renders the default empty state in %s", (style) => {
    renderBoard(style, { board: emptyTaskBoardFixture, table: { ...taskBoardTableFixture, rows: [] } });
    expect(screen.getByTestId("empty-state").textContent).toContain("No hay tareas con estos filtros");
  });

  it("renders the emptyState prop when given", () => {
    renderBoard("esencial", {
      board: emptyTaskBoardFixture as TaskBoard,
      emptyState: { title: "Sin tareas en Diseño", description: "Quita filtros para ver más." },
    });
    expect(screen.getByText("Sin tareas en Diseño")).toBeTruthy();
    expect(screen.getByText("Quita filtros para ver más.")).toBeTruthy();
  });

  it.each<[PresentationStyle, string]>([
    ["visual", "board"],
    ["esencial", "list"],
    ["analitico", "table"],
  ])("renders the %s loading skeleton (%s)", (style, variant) => {
    renderBoard(style, { loading: true });
    const skeletons = screen.getAllByTestId("loading-skeleton");
    expect(skeletons.map((s) => s.getAttribute("data-variant"))).toEqual([variant]);
    expect(screen.queryByTestId("task-board")).toBeNull();
  });
});

describe("TaskBoardWidget · quick-add", () => {
  it("has no “+ Agregar” for a viewer who can't create tasks", () => {
    caps.canCreateActivity = false;
    renderBoard("visual");
    expect(screen.queryByRole("button", { name: /^Agregar tarea en / })).toBeNull();
  });

  it("ends every open column in “+ Agregar”, which opens the shell's dialog in that column's estatus", () => {
    renderBoard("visual");

    for (const [key, count] of Object.entries(taskBoardExpected.counts)) {
      const label = LABELS[key as keyof typeof LABELS];
      const column = screen.getByRole("region", { name: boardColumnLabel(label, count) });
      const button = within(column).queryByRole("button", { name: `Agregar tarea en ${label}` });
      // Collapsed strips (empty columns) stay as in the canvas: ring, 0, label.
      if (count === 0) {
        expect(button).toBeNull();
        continue;
      }
      expect(button?.textContent).toBe("+ Agregar");
      act(() => fireEvent.click(button!));
      expect(useNewTaskUi.getState()).toMatchObject({
        open: true,
        defaults: { status: key },
        source: "tablero-quick-add",
      });
    }
  });

  it("shows “+ Agregar” in every column of an empty board", () => {
    renderBoard("visual", { board: emptyTaskBoardFixture as TaskBoard });
    for (const label of ["Pendiente", "En proceso", "Completado", "Bloqueado"]) {
      expect(screen.getByRole("button", { name: `Agregar tarea en ${label}` })).toBeTruthy();
    }
  });

  it.each<PresentationStyle>(["esencial", "analitico"])("has no quick-add in %s", (style) => {
    renderBoard(style);
    expect(screen.queryByRole("button", { name: /^Agregar tarea en / })).toBeNull();
  });
});

describe("TaskBoardWidget · Visual motion and drag state (frame Tareas-Visual)", () => {
  it("card stagger delay by column and index", () => {
    const { container } = renderBoard("visual");
    expect(boardCardDelay(0, 0)).toBe("0ms");
    expect(boardCardDelay(2, 3)).toBe("260ms");
    // Capped at 10 cards per column.
    expect(boardCardDelay(1, 25)).toBe(boardCardDelay(1, 10));

    const pendiente = screen.getByRole("region", { name: boardColumnLabel("Pendiente", 3) });
    const cards = Array.from(pendiente.querySelectorAll<HTMLElement>('[data-testid="task-card"]'));
    expect(cards.map((c) => c.style.getPropertyValue("--anim-delay"))).toEqual(["0ms", "60ms", "120ms"]);
    for (const c of cards) expect(c.className).toContain("anim-in");

    const enProceso = screen.getByRole("region", { name: boardColumnLabel("En proceso", 2) });
    const first = enProceso.querySelector<HTMLElement>('[data-testid="task-card"]')!;
    expect(first.style.getPropertyValue("--anim-delay")).toBe("40ms");
    expect(container.querySelectorAll('[data-testid="task-card"]').length).toBe(taskBoardExpected.total);
  });

  it("dragged card gets drag-lift", () => {
    const { container } = renderBoard("visual");
    const dragged = card(container, "t2");
    expect(dragged.className).toContain("lift");
    expect(dragged.className).not.toContain("drag-lift");
    fireEvent.dragStart(dragged);
    expect(card(container, "t2").className).toContain("drag-lift");
    expect(card(container, "t2").className).toContain("border-primary");
    expect(card(container, "t1").className).not.toContain("drag-lift");
    fireEvent.dragEnd(card(container, "t2"));
    expect(card(container, "t2").className).not.toContain("drag-lift");
  });

  it("drop column shows Suelta aquí", () => {
    const { container } = renderBoard("visual");
    expect(screen.queryByText(BOARD_DROP_HINT)).toBeNull();

    fireEvent.dragStart(card(container, "t2"));
    const target = screen.getByRole("region", { name: boardColumnLabel("En proceso", 2) });
    fireEvent.dragOver(target);

    expect(within(target).getByText(BOARD_DROP_HINT)).toBeTruthy();
    expect(target.className).toContain("bg-tint-primary");
    expect(within(target).getByTestId("board-drop-placeholder")).toBeTruthy();
    // Only the column under the card.
    expect(screen.getAllByText(BOARD_DROP_HINT)).toHaveLength(1);
  });

  it("renderColumnFooter replaces + Agregar", () => {
    const renderColumnFooter = vi.fn((key: string) => <div data-testid={`footer-${key}`}>Agregar rápido</div>);
    renderBoard("visual", { renderColumnFooter });

    expect(screen.queryByRole("button", { name: /^Agregar tarea en / })).toBeNull();
    const pendiente = screen.getByRole("region", { name: boardColumnLabel("Pendiente", 3) });
    expect(within(pendiente).getByTestId("footer-pendiente")).toBeTruthy();
    expect(renderColumnFooter).toHaveBeenCalledWith("pendiente");
    // Collapsed strips have no footer.
    expect(renderColumnFooter).not.toHaveBeenCalledWith("bloqueado");
  });

  it("announces Movida a after a drop", () => {
    const onMove = vi.fn(() => Promise.resolve());
    const { container } = renderBoard("visual", { onMove });
    const live = screen.getByTestId("board-announcement");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("");

    fireEvent.dragStart(card(container, "t2"));
    const target = screen.getByRole("region", { name: boardColumnLabel("En proceso", 2) });
    fireEvent.dragOver(target);
    fireEvent.drop(target);

    expect(onMove).toHaveBeenCalledWith("t2", "en_proceso");
    expect(live.textContent).toBe("Movida a En proceso");
  });

  it("columns are labelled sections with a share bar, cards a tramo strip and a drag handle", () => {
    const { container } = renderBoard("visual");
    const pendiente = screen.getByRole("region", { name: boardColumnLabel("Pendiente", 3) });
    expect(pendiente.tagName).toBe("SECTION");
    const bar = pendiente.querySelector<HTMLElement>('[data-slot="board-column-bar"] > div')!;
    expect(bar.className).toContain("grow-x");
    expect(bar.style.width).toBe(`${Math.round((3 / taskBoardExpected.total) * 100)}%`);

    const t1 = card(container, "t1");
    expect(t1.querySelector('[data-slot="board-card-strip"]')).toBeTruthy();
    expect(within(t1).getByRole("button", { name: `Arrastrar ${t1.querySelector("a")!.textContent}` })).toBeTruthy();
    expect(within(t1).getByText("Subtareas")).toBeTruthy();
    expect(t1.querySelector('[data-slot="board-card-subtasks"] .grow-x')).toBeTruthy();
  });

  it("boardDueText: day and short month, overdue adds the days late", () => {
    expect(boardDueText("2026-11-20", false, "2026-11-09")).toBe("20 nov");
    expect(boardDueText("2026-10-31", true, "2026-11-09")).toBe("31 oct · 9 d");
  });

  it("boardColumnLabel pluralizes", () => {
    expect(boardColumnLabel("Pendiente", 1)).toBe("Pendiente, 1 tarea");
    expect(boardColumnLabel("Pendiente", 0)).toBe("Pendiente, 0 tareas");
  });
});
