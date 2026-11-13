// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ getCalendarioList: vi.fn() }));
vi.mock("@/lib/actions/page-data/calendario-actions", () => ({
  getCalendarioList: actions.getCalendarioList,
  getCalendarioRange: vi.fn(),
  getCalendarioDaySummary: vi.fn(),
  getCalendarioLoad: vi.fn(),
  getCalendarioWeekSummary: vi.fn(),
  getMeetingDetail: vi.fn(),
  getMeetingMinutes: vi.fn(),
  getMeetingPrep: vi.fn(),
  getPlanWeek: vi.fn(),
  getProposal: vi.fn(),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({ bulkUpdateTasksAction: vi.fn(), deleteTaskAction: vi.fn(), restoreTaskAction: vi.fn() }));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({
  fetchCatalogStaff: vi.fn(async () => []),
  fetchCatalogWorkflows: vi.fn(async () => []),
  fetchCatalogTaskStatuses: vi.fn(async () => []),
  fetchCatalogProjectSpaces: vi.fn(async () => []),
}));
const url = vi.hoisted(() => ({ replaceCalendarioUrl: vi.fn() }));
vi.mock("@/components/calendario/use-calendario-page", () => url);
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), dismiss: vi.fn() }) }));

import { emptyDay } from "@/lib/calendario/empty";
import { parseCalendarioQuery } from "@/lib/calendario/url-state";
import { resetCalendarioUi } from "@/lib/stores/calendario-ui-store";
import { renderWithQueryClient } from "@/lib/query/test-utils";
import type { CalTaskItem, CalendarioRange } from "@/lib/types/calendario";

import type { CalItem } from "@/lib/types/calendario";
import { CalendarioAnalitico, hoursOf } from "./CalendarioAnalitico";

function task(id: string, date: string, title: string): CalTaskItem {
  return {
    kind: "task",
    id: `t:${id}`,
    taskId: id,
    title,
    date,
    dateField: "commitmentDate",
    project: { id: "p1", name: "Madrid 22" },
    etapa: null,
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
  };
}

const range: CalendarioRange = {
  from: "2026-11-09",
  to: "2026-11-15",
  today: "2026-11-11",
  days: [
    { ...emptyDay("2026-11-09"), tasks: 1 },
    { ...emptyDay("2026-11-10") },
    { ...emptyDay("2026-11-11"), tasks: 2 },
  ],
  items: [],
  kpis: { tasks: 3, meetings: 0, meetingHours: 0, overdue: 1, overduePct: 33, unassigned: 3 },
  truncated: false,
  google: { connected: false, eventsGrant: false, syncedAt: null, error: null },
};
const query = parseCalendarioQuery("vista=semana&fecha=2026-11-11", { today: "2026-11-11" });

describe("CalendarioAnalitico", () => {
  beforeEach(() => {
    actions.getCalendarioList.mockReset();
    resetCalendarioUi();
    window.localStorage.clear();
  });
  afterEach(() => cleanup());

  it("shows the KPI strip and the group totals before the rows load", () => {
    actions.getCalendarioList.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<CalendarioAnalitico range={range} query={query} />);
    expect(screen.getByText("SIN RESPONSABLE")).toBeTruthy();
    expect(screen.getByText("33 % del rango")).toBeTruthy();
    expect(screen.getByText("Hoy · miércoles 11 nov")).toBeTruthy();
    expect(screen.getByText("2 elementos")).toBeTruthy();
    // The empty day has no group.
    expect(screen.queryByText("Martes 10 nov")).toBeNull();
  });

  it("places the rows in their group and pages with the next cursor", async () => {
    actions.getCalendarioList
      .mockResolvedValueOnce({ rows: [task("1", "2026-11-09", "Ingenierías"), task("2", "2026-11-11", "Planos")], nextCursor: "c1", total: 3 })
      .mockResolvedValueOnce({ rows: [task("3", "2026-11-11", "Cotización")], nextCursor: null, total: 3 });
    renderWithQueryClient(<CalendarioAnalitico range={range} query={query} />);
    await screen.findByText("Ingenierías");
    expect(screen.getByText("Planos")).toBeTruthy();
    const more = await screen.findByRole("button", { name: "Cargar más (1 restante)" });
    fireEvent.click(more);
    await screen.findByText("Cotización");
    expect(actions.getCalendarioList).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "c1", orderDir: "asc" }));
    expect(screen.queryByRole("button", { name: /Cargar más/ })).toBeNull();
  });

  it("toggles the server order from the FECHA header", async () => {
    actions.getCalendarioList.mockResolvedValue({ rows: [task("1", "2026-11-09", "Ingenierías")], nextCursor: null, total: 1 });
    renderWithQueryClient(<CalendarioAnalitico range={range} query={query} />);
    await screen.findByText("Ingenierías");
    fireEvent.click(screen.getAllByRole("button", { name: /FECHA/ })[0]);
    await waitFor(() => expect(actions.getCalendarioList).toHaveBeenCalledWith(expect.objectContaining({ orderDir: "desc" })));
  });

  it("opens the detail from the title", async () => {
    actions.getCalendarioList.mockResolvedValue({ rows: [task("1", "2026-11-09", "Ingenierías")], nextCursor: null, total: 1 });
    const onOpen = vi.fn();
    renderWithQueryClient(<CalendarioAnalitico range={range} query={query} onOpen={onOpen} />);
    fireEvent.click(await screen.findByRole("button", { name: "Ingenierías" }));
    expect(onOpen).toHaveBeenCalledWith("t:1");
  });

  it("turns the optional Horas column on and off, shows the hours and remembers the choice", async () => {
    actions.getCalendarioList.mockResolvedValue({ rows: [{ ...task("1", "2026-11-09", "Ingenierías"), hours: 2.5 }], nextCursor: null, total: 1 });
    renderWithQueryClient(<CalendarioAnalitico range={range} query={query} />);
    await screen.findByText("Ingenierías");
    expect(screen.queryAllByText("HORAS")).toHaveLength(0);
    const toggle = screen.getByRole("switch", { name: "Mostrar horas" });
    fireEvent.click(toggle);
    expect((await screen.findAllByText("HORAS")).length).toBeGreaterThan(0);
    expect(screen.getByText("2.5 h")).toBeTruthy();
    expect(window.localStorage.getItem("cincel:calendario:analitico:horas")).toBe("1");
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.queryAllByText("HORAS")).toHaveLength(0));
    expect(window.localStorage.getItem("cincel:calendario:analitico:horas")).toBe("0");
  });

  it("measures a meeting by its length and leaves an all-day one empty", () => {
    const base = { kind: "event", allDay: false, start: "2026-11-11T10:00:00-06:00", end: "2026-11-11T11:30:00-06:00" } as unknown as CalItem;
    expect(hoursOf(base)).toBe(1.5);
    expect(hoursOf({ ...base, allDay: true } as CalItem)).toBeNull();
  });
});
