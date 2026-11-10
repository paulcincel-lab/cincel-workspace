// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const toastMock = vi.hoisted(() => {
  const fn = vi.fn(() => "toast-id") as ReturnType<typeof vi.fn> & {
    error: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
  };
  fn.error = vi.fn();
  fn.dismiss = vi.fn();
  return fn;
});
vi.mock("sonner", () => ({ toast: toastMock }));

import { GroupedTable, type Group } from "@/components/widgets/GroupedTable";
import { CellCommitProvider } from "@/components/widgets/use-cell-commit";
import { SAVED_TOAST, type CellEdit } from "@/components/widgets/editable-cell";
import type { RecordColumn } from "@/lib/types/widgets";

/**
 * The table kit with the real editor (`CellEditor`) and the real save hook
 * (`useCellCommit`): the other suites stand each one in for the other.
 */

type Task = Record<string, unknown> & { id: string; tarea: string; estatus: string; prioridad: string };

const ok = { ok: true as const, data: null };

const estatusOptions = () => [
  { value: "abierta", label: "Abierta" },
  { value: "curso", label: "En curso" },
  { value: "cerrada", label: "Cerrada" },
];

const prioridadOptions = () => [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baja", label: "Baja" },
];

function setup() {
  const estatusCommit = vi.fn(async () => ok);
  const prioridadCommit = vi.fn(async () => ok);
  const estatus: CellEdit<Task> = {
    kind: "select",
    options: estatusOptions,
    value: (row) => row.estatus,
    commit: estatusCommit,
  };
  const prioridad: CellEdit<Task> = {
    kind: "select",
    options: prioridadOptions,
    value: (row) => row.prioridad,
    commit: prioridadCommit,
  };
  const columns: RecordColumn<Task>[] = [
    { key: "tarea", label: "Tarea" },
    { key: "estatus", label: "Estatus", edit: estatus },
    { key: "prioridad", label: "Prioridad", edit: prioridad },
  ];
  const row: Task = { id: "t1", tarea: "Planos", estatus: "abierta", prioridad: "media" };
  const groups: Group<Task>[] = [{ id: "p1", label: "Casa Lomas", metrics: [], rows: [row] }];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (children: ReactNode) => (
    <QueryClientProvider client={client}>
      <CellCommitProvider queryKeys={[["tasks"]]}>{children}</CellCommitProvider>
    </QueryClientProvider>
  );
  render(wrap(<GroupedTable<Task> label="Tareas" columns={columns} groups={groups} />));
  return { estatusCommit, prioridadCommit, row };
}

function cell(rowId: string, column: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-cell-row="${rowId}"][data-cell-column="${column}"]`);
  if (!el) throw new Error(`cell ${rowId}/${column} not found`);
  return el;
}

const popup = () => document.querySelector<HTMLElement>("[data-slot=popover-content]");
const cmdkRoot = () => document.querySelector<HTMLElement>("[cmdk-root]");

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  toastMock.mockClear();
});

describe("GroupedTable with the real CellEditor and useCellCommit", () => {
  it("opens on click, a pick saves once and shows the toast", async () => {
    const { estatusCommit, row } = setup();
    fireEvent.click(cell("t1", "estatus"));
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));
    expect(cell("t1", "estatus").hasAttribute("data-cell-open")).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByText("En curso"));
    });
    await waitFor(() => expect(estatusCommit).toHaveBeenCalledTimes(1));
    expect(estatusCommit).toHaveBeenCalledWith(row, "curso");
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(SAVED_TOAST("Estatus"), expect.anything()));
    await waitFor(() => expect(popup()).toBeNull());
  });

  it("Esc closes without saving", async () => {
    const { estatusCommit } = setup();
    fireEvent.click(cell("t1", "estatus"));
    await waitFor(() => expect(cmdkRoot()).toBeTruthy());
    fireEvent.keyDown(cmdkRoot()!, { key: "Escape" });
    await waitFor(() => expect(popup()).toBeNull());
    expect(cell("t1", "estatus").hasAttribute("data-cell-open")).toBe(false);
    expect(estatusCommit).not.toHaveBeenCalled();
  });

  it("Tab saves the highlighted option and moves to the next editable cell", async () => {
    const { estatusCommit, prioridadCommit, row } = setup();
    fireEvent.click(cell("t1", "estatus"));
    await waitFor(() => expect(cmdkRoot()).toBeTruthy());
    fireEvent.keyDown(cmdkRoot()!, { key: "ArrowDown" });
    await act(async () => {
      fireEvent.keyDown(cmdkRoot()!, { key: "Tab" });
    });
    await waitFor(() => expect(estatusCommit).toHaveBeenCalledTimes(1));
    expect(estatusCommit).toHaveBeenCalledWith(row, "curso");
    await waitFor(() => expect(document.activeElement).toBe(cell("t1", "prioridad")));
    expect(prioridadCommit).not.toHaveBeenCalled();
  });

  it("a second press on the open cell closes it and keeps it closed", async () => {
    const { estatusCommit } = setup();
    const target = cell("t1", "estatus");
    fireEvent.click(target);
    await waitFor(() => expect(cmdkRoot()).toBeTruthy());
    // The press outside the popover closes it first; the click that follows must not reopen it.
    fireEvent.pointerDown(target);
    fireEvent.mouseDown(target);
    fireEvent.pointerUp(target);
    fireEvent.mouseUp(target);
    fireEvent.click(target);
    await waitFor(() => expect(popup()).toBeNull());
    expect(target.hasAttribute("data-cell-open")).toBe(false);
    expect(estatusCommit).not.toHaveBeenCalled();
  });

  it("Prioridad offers no clear entry", async () => {
    setup();
    fireEvent.click(cell("t1", "prioridad"));
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Alta", "Media", "Baja"]);
  });
});
