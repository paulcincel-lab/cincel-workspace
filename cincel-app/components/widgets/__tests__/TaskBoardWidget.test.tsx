// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

import type { PresentationStyle } from "@/lib/types/redesign";
import type { DistributionSegment, RecordTableData } from "@/lib/types/widgets";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (msg: string) => toastError(msg) } }));

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
import { TaskBoardWidget, boardSegments } from "@/components/widgets/TaskBoardWidget";
import {
  emptyTaskBoardFixture,
  taskBoardExpected,
  taskBoardFixture,
  taskBoardTableFixture,
} from "@/components/widgets/fixtures/task-board";
import type { TaskBoard } from "@/lib/types/redesign";

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
  const utils = render(
    <StyleProvider style={style} scope="staff">
      <TaskBoardWidget board={taskBoardFixture} table={taskBoardTableFixture} onMove={onMove} {...props} />
    </StyleProvider>,
  );
  return { ...utils, onMove };
}

function card(container: HTMLElement, taskId: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
  if (!el) throw new Error(`no card ${taskId}`);
  return el;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  toastError.mockReset();
});

describe("TaskBoardWidget · same fixture in every style", () => {
  it("Visual renders one column per status with the fixture counts and collapses the empty one", () => {
    const { container } = renderBoard("visual");

    for (const [key, count] of Object.entries(taskBoardExpected.counts)) {
      const column = screen.getByRole("group", { name: `${LABELS[key as keyof typeof LABELS]} · ${count}` });
      expect(column.querySelectorAll("[data-task-id]").length).toBe(count);
      expect(column.getAttribute("data-collapsed")).toBe(count === 0 ? "true" : null);
    }
    expect(container.querySelectorAll("[data-task-id]").length).toBe(taskBoardExpected.total);
    expect(screen.getByRole("link", { name: "Planos ejecutivos" }).getAttribute("href")).toBe("/tareas?tarea=t2");
    expect(within(card(container, "t1")).getByText("1/3")).toBeTruthy();
    // Overdue due date in destructive; future one muted.
    expect(within(card(container, "t1")).getByText("15-01-2026").className).toContain("text-destructive");
    expect(within(card(container, "t2")).getByText("15-06-2030").className).not.toContain("text-destructive");

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
  it("moves a card optimistically on drop and rolls it back with a toast when onMove fails", async () => {
    const pending = deferred();
    const onMove = vi.fn(() => pending.promise);
    const { container } = renderBoard("visual", { onMove });

    fireEvent.dragStart(card(container, "t2"));
    const target = screen.getByRole("group", { name: "En proceso · 2" });
    fireEvent.dragOver(target);
    fireEvent.drop(target);

    expect(onMove).toHaveBeenCalledWith("t2", "en_proceso");
    expect(screen.getByRole("group", { name: "En proceso · 3" }).contains(card(container, "t2"))).toBe(true);
    expect(screen.getByRole("group", { name: "Pendiente · 2" })).toBeTruthy();

    await act(async () => {
      pending.reject(new Error("FORBIDDEN"));
      await pending.promise.catch(() => {});
    });

    expect(screen.getByRole("group", { name: "Pendiente · 3" }).contains(card(container, "t2"))).toBe(true);
    expect(screen.getByRole("group", { name: "En proceso · 2" })).toBeTruthy();
    expect(toastError).toHaveBeenCalledWith("No tienes permiso para realizar esta acción.");
  });

  it("keeps the move when onMove resolves and expands a collapsed column it drops into", async () => {
    const onMove = vi.fn(() => Promise.resolve());
    const { container } = renderBoard("visual", { onMove });

    fireEvent.dragStart(card(container, "t3"));
    const strip = screen.getByRole("group", { name: "Bloqueado · 0" });
    fireEvent.dragOver(strip);
    await act(async () => {
      fireEvent.drop(strip);
    });

    expect(onMove).toHaveBeenCalledWith("t3", "bloqueado");
    const column = screen.getByRole("group", { name: "Bloqueado · 1" });
    expect(column.getAttribute("data-collapsed")).toBeNull();
    expect(column.contains(card(container, "t3"))).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("does not call onMove when a card is dropped on its own column", () => {
    const onMove = vi.fn(() => Promise.resolve());
    const { container } = renderBoard("visual", { onMove });

    fireEvent.dragStart(card(container, "t1"));
    const own = screen.getByRole("group", { name: "Pendiente · 3" });
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

describe("TaskBoardWidget · empty and loading", () => {
  it.each<PresentationStyle>(["visual", "esencial", "analitico"])("renders the default empty state in %s", (style) => {
    renderBoard(style, { board: emptyTaskBoardFixture, table: { ...taskBoardTableFixture, rows: [] } });
    expect(screen.getByTestId("empty-state").textContent).toContain("No hay tareas con estos filtros");
    expect(screen.queryByTestId("task-board")).toBeNull();
  });

  it("renders the emptyState prop when given", () => {
    renderBoard("visual", {
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
