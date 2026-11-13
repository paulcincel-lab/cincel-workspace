// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createPortal } from "react-dom";
import axe from "axe-core";
import type { ColumnDef } from "@tanstack/react-table";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { DataTable } from "@/components/ui/DataTable";
import type { CellEditorProps } from "@/components/widgets/CellEditor";
import { GroupedTable, type Group } from "@/components/widgets/GroupedTable";
import { RecordTable } from "@/components/widgets/RecordTable";
import { LOCK_REASON, OPEN_TASK_LABEL, type CellEdit } from "@/components/widgets/editable-cell";
import type { RecordColumn } from "@/lib/types/widgets";

// The table kit is tested against a stand-in editor (the real one has its own tests):
// a portal with the reason or "Elegir" / "Tab" / "Cerrar" buttons.
vi.mock("@/components/widgets/CellEditor", () => ({
  CellEditor: (props: CellEditorProps<unknown>) => {
    if (!props.open) return null;
    const pick = (next: boolean) => {
      props.onCommitted?.("nuevo");
      props.onOpenChange(false);
      if (next) props.onTabNext?.();
    };
    return createPortal(
      <div role="dialog" aria-label={`Editor ${props.label ?? ""}`} data-query={props.initialQuery ?? ""}>
        {props.canEdit === true ? (
          <>
            <button type="button" onClick={() => pick(false)}>
              Elegir
            </button>
            <button type="button" onClick={() => pick(true)}>
              Tab
            </button>
          </>
        ) : (
          <p>{props.canEdit}</p>
        )}
        <button
          type="button"
          onClick={() => {
            props.onOpenChange(false);
            props.anchor?.focus();
          }}
        >
          Cerrar
        </button>
      </div>,
      document.body,
    );
  },
}));

// Saves run `edit.commit` directly (the query cache side has its own tests).
vi.mock("@/components/widgets/use-cell-commit", () => ({
  useCellCommitContext: () => null,
  useCellCommit: () => ({
    commit: (edit: CellEdit<unknown>, row: unknown, value: string | null) => edit.commit(row, value).then(() => undefined),
    undo: () => {},
    pending: false,
  }),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type Task = Record<string, unknown> & { id: string; tarea: string; tramo: string; estatus: string; dias: number; bloqueada?: boolean };

const ok = { ok: true as const, data: null };

function editOf(key: "tarea" | "tramo" | "estatus", commit = vi.fn(async () => ok)): CellEdit<Task> {
  if (key === "tarea") return { kind: "text", required: true, value: (row) => row.tarea, commit };
  return {
    kind: "select",
    clearable: true,
    value: (row) => row[key] as string,
    options: () => [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ],
    commit,
  };
}

function columns(commit = vi.fn(async () => ok)): RecordColumn<Task>[] {
  return [
    { key: "tarea", label: "Tarea", edit: editOf("tarea", commit) },
    { key: "tramo", label: "Etapa", edit: editOf("tramo", commit), canEdit: (row) => (row.bloqueada ? LOCK_REASON.tramo : true) },
    { key: "dias", label: "Días de retraso", format: "days" },
    { key: "estatus", label: "Estatus", edit: editOf("estatus", commit) },
  ];
}

const t1: Task = { id: "t1", tarea: "Planos", tramo: "diseno", estatus: "abierta", dias: 2 };
const t2: Task = { id: "t2", tarea: "Permisos", tramo: "diseno", estatus: "abierta", dias: 0, bloqueada: true };
const t3: Task = { id: "t3", tarea: "Obra negra", tramo: "obra", estatus: "abierta", dias: 5 };

function groupsOf(rows: Task[]): Group<Task>[] {
  return [
    {
      id: "p1",
      label: "Casa Lomas",
      metrics: [],
      children: [
        { id: "diseno", label: "Diseño", metrics: [], rows: rows.filter((r) => r.tramo === "diseno") },
        { id: "obra", label: "Obra", metrics: [], rows: rows.filter((r) => r.tramo === "obra"), hasMore: true },
      ],
    },
    { id: "p2", label: "Torre Norte", metrics: [], rows: rows.filter((r) => r.tramo === "otro") },
  ];
}

function grouped(rows: Task[], cols: RecordColumn<Task>[] = columns()) {
  return (
    <GroupedTable<Task>
      label="Tareas"
      columns={cols}
      groups={groupsOf(rows)}
      rowHref={(row) => `/tareas/${row.id}`}
      onLoadMore={() => {}}
    />
  );
}

function cell(rowId: string, column: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-cell-row="${rowId}"][data-cell-column="${column}"]`);
  if (!el) throw new Error(`cell ${rowId}/${column} not found`);
  return el;
}

const key = (el: Element, k: string, init: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(el, { key: k, ...init });

describe("GroupedTable with editable columns", () => {
  it("renders as before without editable columns", () => {
    const { container } = render(
      <GroupedTable<Task> label="Tareas" columns={[{ key: "tarea", label: "Tarea" }]} groups={groupsOf([t1])} />,
    );
    expect(container.querySelector("[role='grid']")).toBeNull();
    expect(container.querySelector("[data-grid-cell]")).toBeNull();
    expect(container.querySelector("td")?.hasAttribute("tabindex")).toBe(false);
  });

  it("is one tab stop: a grid with a single cell at tabindex 0", () => {
    render(grouped([t1, t2, t3]));
    // One grid table per group card; one tab stop across all of them.
    expect(screen.getAllByRole("grid")).toHaveLength(2);
    const stops = [...document.querySelectorAll("[data-grid-cell]")].filter((el) => (el as HTMLElement).tabIndex === 0);
    expect(stops).toEqual([cell("t1", "tarea")]);
  });

  it("opens the editor on click and closes it on a second click", () => {
    render(grouped([t1, t3]));
    fireEvent.click(cell("t1", "estatus"));
    expect(screen.getByRole("dialog", { name: "Editor Estatus" })).toBeTruthy();
    expect(cell("t1", "estatus").hasAttribute("data-cell-open")).toBe(true);
    fireEvent.click(cell("t1", "estatus"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on Enter and F2, and Cerrar / Esc returns focus to the cell", () => {
    render(grouped([t1, t3]));
    const target = cell("t1", "tramo");
    target.focus();
    key(target, "Enter");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(target);
    key(target, "F2");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("keeps calculated columns inert", () => {
    render(grouped([t1]));
    const calc = cell("t1", "dias");
    expect(calc.dataset.cellState).toBe("inert");
    fireEvent.click(calc);
    key(calc, "Enter");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the lock reason on a locked cell and never clears it", () => {
    const commit = vi.fn(async () => ok);
    render(grouped([t2], columns(commit)));
    const locked = cell("t2", "tramo");
    expect(locked.dataset.cellState).toBe("locked");
    expect(locked.querySelector("[data-slot='cell-lock']")).toBeTruthy();
    key(locked, "Delete");
    expect(commit).not.toHaveBeenCalled();
    fireEvent.click(locked);
    expect(screen.getByText(LOCK_REASON.tramo)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Elegir" })).toBeNull();
  });

  it("moves with the arrows across tables, skipping group headers and Cargar más", () => {
    render(grouped([t1, t2, t3]));
    const start = cell("t1", "tramo");
    start.focus();
    key(start, "ArrowRight");
    expect(document.activeElement).toBe(cell("t1", "dias"));
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(cell("t2", "dias"));
    // Across the "Obra" header row.
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(cell("t3", "dias"));
    // "Cargar más" under Obra is not a grid row.
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(cell("t3", "dias"));
    key(document.activeElement!, "Home");
    expect(document.activeElement).toBe(cell("t3", "tarea"));
    expect(cell("t3", "tarea").tabIndex).toBe(0);
    expect(start.tabIndex).toBe(-1);
  });

  it("saves and moves to the next editable cell of the row on Tab", async () => {
    const commit = vi.fn(async () => ok);
    render(grouped([t1], columns(commit)));
    fireEvent.click(cell("t1", "tramo"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Tab" }));
    });
    expect(commit).toHaveBeenCalledWith(t1, "nuevo");
    // "Días de retraso" is calculated: Tab goes on to Estatus.
    expect(document.activeElement).toBe(cell("t1", "estatus"));
  });

  it("opens list editors on a letter with it in the search, not the title", () => {
    render(grouped([t1]));
    key(cell("t1", "estatus"), "c");
    expect(screen.getByRole("dialog").dataset.query).toBe("c");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    key(cell("t1", "tarea"), "c");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clears a clearable cell on Supr", async () => {
    const commit = vi.fn(async () => ok);
    render(grouped([t1], columns(commit)));
    await act(async () => {
      key(cell("t1", "estatus"), "Delete");
    });
    expect(commit).toHaveBeenCalledWith(t1, null);
  });

  it("edits the title on click and keeps an open icon for the task", () => {
    render(grouped([t1]));
    const title = cell("t1", "tarea");
    const open = within(title).getByRole("link", { name: OPEN_TASK_LABEL });
    expect(open.getAttribute("href")).toBe("/tareas/t1");
    const link = within(title).getByRole("link", { name: "Planos" });
    // A plain click on the title link doesn't navigate (fireEvent returns false when prevented).
    expect(fireEvent.click(link)).toBe(false);
    expect(screen.getByRole("dialog", { name: "Editor Tarea" })).toBeTruthy();
  });

  it("moves a regrouped row to its new group, keeps focus on it and flashes it once", async () => {
    let rows = [t1, t3];
    // The stand-in editor saves "nuevo"; the page moves the row to Obra.
    const commit = vi.fn(async () => {
      rows = rows.map((r) => (r.id === "t1" ? { ...r, tramo: "obra" } : r));
      return ok;
    });
    const cols = columns(commit);
    const { rerender } = render(grouped(rows, cols));
    expect(cell("t1", "tramo").closest("tr")?.getAttribute("data-grid-group")).toBe("diseno");
    fireEvent.click(cell("t1", "tramo"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Elegir" }));
    });
    rerender(grouped(rows, cols));
    const moved = cell("t1", "tramo");
    const tr = moved.closest("tr");
    expect(tr?.getAttribute("data-grid-group")).toBe("obra");
    expect(tr?.hasAttribute("data-row-flash")).toBe(true);
    expect(document.activeElement).toBe(moved);
  });

  it("passes axe as a grid", async () => {
    const { container } = render(<main lang="es">{grouped([t1, t2, t3])}</main>);
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious.map((v) => v.id)).toEqual([]);
  });
});

describe("DataTable with an editable column", () => {
  type R = { id: string; name: string; age: number };
  const data: R[] = [
    { id: "b", name: "Beto", age: 30 },
    { id: "a", name: "Ana", age: 25 },
  ];
  const nameEdit: CellEdit<R> = { kind: "text", value: (row) => row.name, commit: vi.fn(async () => ok) };
  const defs: ColumnDef<R, unknown>[] = [
    { accessorKey: "name", header: "Nombre", meta: { edit: nameEdit } },
    { accessorKey: "age", header: "Edad" },
  ];

  it("opens the editor without triggering onRowClick; inert cells still click the row", () => {
    const onRowClick = vi.fn();
    render(<DataTable<R> columns={defs} data={data} getRowId={(row) => row.id} onRowClick={onRowClick} />);
    expect(screen.getByRole("grid")).toBeTruthy();
    fireEvent.click(cell("b", "name"));
    expect(screen.getByRole("dialog", { name: "Editor Nombre" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onRowClick).not.toHaveBeenCalled();
    fireEvent.click(cell("b", "age"));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("keeps the tab stop on the same row id after sorting", () => {
    render(<DataTable<R> columns={defs} data={data} getRowId={(row) => row.id} />);
    cell("a", "name").focus();
    expect(cell("a", "name").tabIndex).toBe(0);
    fireEvent.click(screen.getByText("Edad"));
    expect(cell("a", "name").tabIndex).toBe(0);
    expect(cell("b", "name").tabIndex).toBe(-1);
  });

  it("navigates rows with the arrows and opens with Enter", () => {
    render(<DataTable<R> columns={defs} data={data} getRowId={(row) => row.id} />);
    const first = cell("b", "name");
    first.focus();
    key(first, "ArrowDown");
    expect(document.activeElement).toBe(cell("a", "name"));
    key(document.activeElement!, "Enter");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("RecordTable with an editable column", () => {
  it("makes the Analítico table a grid with editable cells", () => {
    const commit = vi.fn(async () => ok);
    render(
      <StyleProvider style="analitico" scope="staff">
        <RecordTable
          data={{
            columns: [
              { key: "name", label: "Nombre", edit: { kind: "text", value: (row) => String(row.name), commit } },
              { key: "horas", label: "Horas", format: "hours" },
            ],
            rows: [{ id: "r1", name: "Ana", horas: 4 }],
          }}
        />
      </StyleProvider>,
    );
    expect(screen.getByRole("grid")).toBeTruthy();
    expect(cell("r1", "horas").dataset.cellState).toBe("inert");
    fireEvent.click(cell("r1", "name"));
    expect(screen.getByRole("dialog", { name: "Editor Nombre" })).toBeTruthy();
  });
});
