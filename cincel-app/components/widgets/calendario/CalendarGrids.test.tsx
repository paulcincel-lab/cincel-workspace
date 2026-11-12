import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyCalendarioRange } from "@/lib/calendario/empty";
import { parseCalendarioQuery } from "@/lib/calendario/url-state";
import type { CalTaskItem } from "@/lib/types/calendario";
import { settle } from "@/tests/helpers/settle";

const bulk = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), dismiss: vi.fn() }));
const push = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/tasks-actions", () => ({ bulkUpdateTasksAction: bulk }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/calendario/use-calendario-page", () => ({ pushCalendarioUrl: push, replaceCalendarioUrl: vi.fn() }));
vi.mock("@/components/calendario/use-calendario-assistant-context", () => ({ useOpenCalendarioAssistant: () => vi.fn() }));

import { CalendarMonthGrid } from "./CalendarMonthGrid";
import { CalendarWeekColumns } from "./CalendarWeekColumns";

const task = (over: Partial<CalTaskItem> = {}): CalTaskItem => ({
  kind: "task",
  id: "t:1",
  taskId: "1",
  title: "Ingenierías",
  date: "2026-11-11",
  dateField: "commitmentDate",
  project: null,
  tramo: null,
  phase: null,
  status: "pendiente",
  statusLabel: "Pendiente",
  priority: "media",
  manager: null,
  support: [],
  overdue: false,
  completed: false,
  blocked: false,
  hours: 1,
  hoursSource: "default",
  parentTaskId: null,
  canEdit: true,
  ...over,
});

function setup(vista: "mes" | "semana", items: CalTaskItem[]) {
  const input = vista === "mes" ? { from: "2026-10-26", to: "2026-12-06" } : { from: "2026-11-09", to: "2026-11-15" };
  const base = emptyCalendarioRange(input, "2026-11-11");
  const range = { ...base, items };
  const query = parseCalendarioQuery(`vista=${vista}&fecha=2026-11-11`, { today: "2026-11-11" });
  const qc = new QueryClient();
  const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const node = vista === "mes" ? <CalendarMonthGrid range={range} query={query} /> : <CalendarWeekColumns range={range} query={query} />;
  return { ...render(node, { wrapper: wrap }), range, query };
}

beforeEach(() => {
  bulk.mockReset();
  toast.mockClear();
  toast.error.mockClear();
  push.mockClear();
});

describe("CalendarMonthGrid", () => {
  it("renders 6 weeks of 7 cells with today marked and the hint", () => {
    setup("mes", [task()]);
    expect(screen.getAllByRole("row")).toHaveLength(6);
    expect(screen.getAllByRole("gridcell")).toHaveLength(42);
    expect(document.querySelector("[aria-current=date]")?.getAttribute("data-cell-date")).toBe("2026-11-11");
    expect(screen.getByText("Clic en un número de día para abrir ese día")).toBeTruthy();
    expect(screen.getByRole("grid").getAttribute("aria-label")).toBe("Noviembre 2026");
  });

  it("shows up to 3 chips and +n más from the day counts", () => {
    const items = [1, 2, 3, 4, 5].map((n) => task({ id: `t:${n}`, taskId: `${n}`, title: `Tarea ${n}` }));
    const base = emptyCalendarioRange({ from: "2026-10-26", to: "2026-12-06" }, "2026-11-11");
    const range = { ...base, items: items.slice(0, 3), days: base.days.map((d) => (d.date === "2026-11-11" ? { ...d, tasks: 5, shown: 3 } : d)) };
    const query = parseCalendarioQuery("vista=mes&fecha=2026-11-11", { today: "2026-11-11" });
    render(<QueryClientProvider client={new QueryClient()}><CalendarMonthGrid range={range} query={query} /></QueryClientProvider>);
    expect(screen.getAllByText(/^Tarea \d$/)).toHaveLength(3);
    expect(screen.getByText("+2 más")).toBeTruthy();
  });

  it("opens Día from the day number", () => {
    setup("mes", []);
    fireEvent.click(screen.getByRole("button", { name: "Abrir el jueves 12" }));
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ vista: "dia", fecha: "2026-11-12" }));
  });

  it("moves the cursor with the arrows and changes month with PageDown", async () => {
    setup("mes", []);
    const cell = document.querySelector<HTMLElement>('[data-cell-date="2026-11-11"]')!;
    act(() => cell.focus());
    fireEvent.keyDown(cell, { key: "ArrowRight" });
    expect(document.querySelector<HTMLElement>('[data-cell-date="2026-11-12"]')?.tabIndex).toBe(0);
    fireEvent.keyDown(document.querySelector<HTMLElement>('[data-cell-date="2026-11-12"]')!, { key: "PageDown" });
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ fecha: "2026-12-12" }));
    await settle();
  });

  it("Alt+ArrowRight moves a task one day and announces it, Deshacer restores it", async () => {
    bulk.mockResolvedValue({ ok: true, data: { updated: ["1"], skipped: [] } });
    setup("mes", [task()]);
    fireEvent.keyDown(screen.getByRole("button", { name: "Ingenierías" }), { key: "ArrowRight", altKey: true });
    await waitFor(() => expect(bulk).toHaveBeenCalledWith(["1"], { dueDate: "2026-11-12", dueField: "commitmentDate" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Moviste Ingenierías al jueves 12. Deshacer disponible."));
    const [message, opts] = toast.mock.calls[0];
    expect(message).toBe("Moví «Ingenierías» al jueves 12 de noviembre.");
    expect(opts.action.label).toBe("Deshacer");
    opts.action.onClick();
    await waitFor(() => expect(bulk).toHaveBeenLastCalledWith(["1"], { dueDate: "2026-11-11", dueField: "commitmentDate" }));
  });

  it("does not offer drag or the move menu without permission", () => {
    setup("mes", [task({ canEdit: false })]);
    expect(document.querySelector("[data-slot=calendar-item-chip]")?.getAttribute("draggable")).not.toBe("true");
    expect(screen.queryByRole("button", { name: /Acciones de/ })).toBeNull();
  });

  it("rolls back and shows the error when the action fails", async () => {
    bulk.mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    setup("mes", [task()]);
    fireEvent.keyDown(screen.getByRole("button", { name: "Ingenierías" }), { key: "ArrowLeft", altKey: true });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast).not.toHaveBeenCalled();
  });

  it("drops a dragged task on another day", async () => {
    bulk.mockResolvedValue({ ok: true, data: { updated: ["1"], skipped: [] } });
    setup("mes", [task()]);
    const chip = document.querySelector<HTMLElement>("[data-slot=calendar-item-chip]")!;
    expect(chip.getAttribute("draggable")).toBe("true");
    fireEvent.dragStart(chip);
    const target = document.querySelector<HTMLElement>('[data-cell-date="2026-11-13"]')!;
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    await waitFor(() => expect(bulk).toHaveBeenCalledWith(["1"], { dueDate: "2026-11-13", dueField: "commitmentDate" }));
  });
});

describe("CalendarWeekColumns", () => {
  it("renders 7 columns with their headings and an Asistente button each", () => {
    setup("semana", [task()]);
    expect(screen.getAllByRole("gridcell")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Abrir el lunes 9" }).textContent).toBe("LUN 9");
    expect(screen.getAllByRole("button", { name: /Pedir al asistente para el/ })).toHaveLength(7);
    expect(screen.getByText("Ingenierías")).toBeTruthy();
  });

  it("shows the empty note", () => {
    setup("semana", []);
    expect(screen.getByText("No hay nada en este rango.")).toBeTruthy();
  });
});
