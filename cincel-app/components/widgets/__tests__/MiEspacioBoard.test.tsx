// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";

import type { QuickAddRowProps } from "@/components/widgets/QuickAddRow";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { TaskListItem } from "@/lib/types/core";
import type { Checklist, Note, NotificationItem, TodayStatus, WeekHours } from "@/lib/types/redesign";

/**
 * Mi espacio Visual (#1001): the hero per clock state, time tracking off,
 * the column quick add and its preset date, the 5-card limit, the Bandeja
 * "Abrir" toggle, and the labels and axe run of the layout.
 */

vi.mock("@/lib/actions/my-space-actions.flags", () => ({
  IMPLEMENTED: new Proxy({}, { get: () => true }),
}));
vi.mock("@/lib/actions/notifications-actions.flags", () => ({
  IMPLEMENTED: new Proxy({}, { get: () => true }),
}));
vi.mock("@/lib/actions/time-tracking-actions.flags", () => ({
  IMPLEMENTED: new Proxy({}, { get: () => true }),
}));

const actions = vi.hoisted(() => ({
  createUserTaskAction: vi.fn(),
  fetchMyOpenTasksAction: vi.fn(async () => []),
  fetchMyTodayAction: vi.fn(),
  fetchMyWeekHoursAction: vi.fn(),
  clockInAction: vi.fn(),
  pauseWorkAction: vi.fn(),
  resumeWorkAction: vi.fn(),
  clockOutAction: vi.fn(),
  markNotificationsReadAction: vi.fn(),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({
  createUserTaskAction: actions.createUserTaskAction,
  fetchMyOpenTasksAction: actions.fetchMyOpenTasksAction,
}));
vi.mock("@/lib/actions/time-tracking-actions", () => ({
  fetchMyTodayAction: actions.fetchMyTodayAction,
  fetchMyWeekHoursAction: actions.fetchMyWeekHoursAction,
  clockInAction: actions.clockInAction,
  pauseWorkAction: actions.pauseWorkAction,
  resumeWorkAction: actions.resumeWorkAction,
  clockOutAction: actions.clockOutAction,
}));
vi.mock("@/lib/actions/notifications-actions", () => ({
  fetchNotificationsAction: vi.fn(),
  fetchNotificationsSummaryAction: vi.fn(),
  markNotificationsReadAction: actions.markNotificationsReadAction,
}));
vi.mock("@/lib/actions/my-space-actions", () => ({
  fetchRemindersAction: vi.fn(async () => []),
  addChecklistItemAction: vi.fn(),
  toggleChecklistItemAction: vi.fn(),
  createChecklistAction: vi.fn(),
}));
vi.mock("@/lib/actions/gmail-actions", () => ({}));
vi.mock("@/lib/actions/page-data/mi-espacio-actions", () => ({
  getMiEspacioPageData: vi.fn(),
  fetchMiEspacioNotesPage: vi.fn(),
  fetchMiEspacioChecklistsPage: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/me-actions", () => ({ fetchMyProfileAction: vi.fn() }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/mi-espacio",
}));

// Owned elsewhere: stand-ins.
vi.mock("@/components/shell/EstiloSwitch", () => ({
  EstiloSwitch: () => <div role="radiogroup" aria-label="Estilo" />,
}));
vi.mock("@/components/mi-espacio/Inbox", () => ({ Inbox: () => <section aria-label="Bandeja completa" /> }));
vi.mock("@/components/tareas/TaskSheet", () => ({ TASK_SHEET_PARAM: "tarea", TaskSheetRoute: () => null }));
vi.mock("@/components/tareas/NewTaskDialog", () => ({ newTaskInvalidations: () => [["tareas"]] }));
/** The quick add (#984): one button that sends a parsed draft with project and tramo tokens. */
vi.mock("@/components/widgets/QuickAddRow", () => ({
  QuickAddRow: ({ context, onCreate }: QuickAddRowProps) => (
    <button
      type="button"
      onClick={() =>
        void onCreate({
          title: "Revisar cortes",
          projectId: "p1",
          tramoId: "w1",
          assigneeId: null,
          dueDate: null,
          priority: "media",
        }).catch(() => undefined)
      }
    >
      {context.label}
    </button>
  ),
}));

import { MiEspacioBoard, hoursChartLabel, hoursDeltaText } from "@/components/widgets/MiEspacioBoard";

/** Monday 9 nov 2026, 10:00 in Mexico City. */
const NOW = new Date("2026-11-09T16:00:00Z");
const TODAY = "2026-11-09";

function task(id: string, commitmentDate: string | null, patch: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id,
    projectId: "p1",
    kind: "usuario",
    templateId: null,
    workflowId: "w1",
    phaseId: null,
    spaceId: null,
    closedAt: null,
    title: `Tarea ${id}`,
    notes: null,
    createdById: "me",
    managerId: "me",
    status: "pendiente",
    customStatusId: null,
    priority: "media",
    sortOrder: null,
    commitmentDate,
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    customStatus: null,
    project: { id: "p1", name: "Casa Lomas", clientName: null },
    workflow: { id: "w1", key: "diseno", name: "Diseño", sortOrder: 2 },
    phase: null,
    space: null,
    manager: { id: "me", name: "Ana López" },
    support: [],
    checklist: { total: 0, completed: 0 },
    parentTaskId: null,
    parentTitle: null,
    subtaskCount: 2,
    subtaskDoneCount: 1,
    waitingOn: 0,
    ...patch,
  };
}

function today(patch: Partial<TodayStatus> = {}): TodayStatus {
  return {
    state: "pausa",
    startedAt: "2026-11-09T15:05:00Z",
    workedSeconds: 2 * 3600 + 30 * 60,
    required: true,
    promptAtLogin: false,
    enabled: true,
    requiredFrom: null,
    hoursPerDay: 8,
    ...patch,
  };
}

const NOTIFICATION: NotificationItem = {
  id: "n1",
  kind: "asignacion",
  title: "Te asignaron Planos",
  body: "Casa Lomas",
  entity: null,
  entityId: null,
  url: null,
  readAt: null,
  createdAt: "2026-11-09T15:48:00Z",
};

const CHECKLIST: Checklist = {
  id: "c1",
  title: "Visita de obra",
  projectId: null,
  projectName: null,
  updatedAt: "2026-11-01T12:00:00.000Z",
  items: [
    { id: "i1", text: "Planos", done: true, sortOrder: 0 },
    { id: "i2", text: "Cotas", done: false, sortOrder: 1 },
  ],
};

const NOTE: Note = { id: "nt1", title: "Ideas", body: "Recepción", color: "blue", pinned: false, projectId: null, updatedAt: NOW.toISOString() };

function week(hours: number[], total: number): WeekHours {
  return {
    days: hours.map((h, i) => ({ date: `2026-11-0${2 + i}`, hours: h })),
    total,
    target: 40,
  };
}
const LAST_WEEK = week([7.5, 8.2, 6.8, 8, 5.5, 0, 0], 36);

function renderBoard(
  opts: { tasks?: TaskListItem[]; status?: TodayStatus; canCreateTask?: boolean } = {},
) {
  const client = createTestQueryClient();
  client.setQueryData(qk.me.profile(), { id: "me", name: "Ana López", photoUrl: null });
  client.setQueryData(qk.me.today(), opts.status ?? today());
  client.setQueryData(qk.me.tasks(), opts.tasks ?? [task("t1", TODAY), task("t2", "2026-11-06"), task("t3", "2026-11-12"), task("t4", null)]);
  client.setQueryData(qk.me.notifications({}), {
    pages: [{ items: [NOTIFICATION], nextCursor: null, unreadCount: 1 }],
    pageParams: [null],
  });
  client.setQueryData(qk.me.checklists(), { pages: [{ items: [CHECKLIST], nextCursor: null }], pageParams: [null] });
  client.setQueryData(qk.me.notes(), { pages: [{ items: [NOTE], nextCursor: null }], pageParams: [null] });
  client.setQueryData(qk.me.reminders("today-tomorrow"), []);
  client.setQueryData(qk.me.weekHours("2026-11-02"), LAST_WEEK);
  client.setQueryData(qk.me.weekHours("2026-10-26"), week([8, 8, 8, 6, 4, 0, 0], 34));
  const view = renderWithQueryClient(<MiEspacioBoard canCreateTask={opts.canCreateTask ?? true} />, { client });
  return { ...view, client };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("MiEspacioBoard", () => {
  it("renders the header, the greeting, the day sentence and the hero chips that match the board", () => {
    renderBoard();
    expect(screen.getByRole("heading", { level: 1, name: "Mi espacio" })).toBeTruthy();
    expect(screen.getByText("Tu día, tus tareas y tus pendientes, de un vistazo.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Buenos días, Ana" })).toBeTruthy();
    expect(screen.getByText("Lunes 9 de noviembre. Tienes 1 tarea para hoy.")).toBeTruthy();
    const hero = screen.getByRole("region", { name: "Mi día" });
    expect(within(hero).getByRole("link", { name: "1 para hoy" }).getAttribute("href")).toBe("#mis-tareas");
    expect(within(hero).getByRole("link", { name: "1 vencida" })).toBeTruthy();
    expect(within(hero).getByRole("link", { name: "1 sin leer" }).getAttribute("href")).toBe("#bandeja");
    // Hoy = overdue + today.
    expect(within(screen.getByRole("list", { name: "Hoy" })).getAllByRole("listitem")).toHaveLength(2);
    expect(within(screen.getByRole("list", { name: "Esta semana" })).getAllByRole("listitem")).toHaveLength(1);
    expect(within(screen.getByRole("list", { name: "Después" })).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Vencida · 6 nov")).toBeTruthy();
  });

  it("hero buttons per clock state", async () => {
    const names = (state: TodayStatus["state"]) => {
      const { unmount } = renderBoard({ status: today({ state }) });
      const hero = screen.getByRole("region", { name: "Mi día" });
      const labels = within(hero)
        .queryAllByRole("button")
        .map((b) => b.textContent);
      unmount();
      return labels;
    };
    expect(names("on")).toEqual(["Pausar jornada", "Registrar salida"]);
    expect(names("pausa")).toEqual(["Reanudar jornada", "Registrar salida"]);
    expect(names("off")).toEqual(["Registrar entrada"]);
    expect(names("done")).toEqual([]);

    actions.pauseWorkAction.mockResolvedValue({ ok: true, data: today({ state: "pausa" }) });
    const { client } = renderBoard({ status: today({ state: "on" }) });
    expect(screen.getByText("Jornada en curso · entrada 9:05")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pausar jornada" }));
    await waitFor(() => expect(actions.pauseWorkAction).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Jornada en pausa · entrada 9:05")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Jornada en pausa");
    expect(client.getQueryData<TodayStatus>(qk.me.today())?.state).toBe("pausa");
  });

  it("hides time tracking when disabled", () => {
    renderBoard({ status: today({ enabled: false }) });
    expect(screen.queryByRole("img", { name: /^Jornada:/ })).toBeNull();
    expect(screen.queryByText(/Jornada en/)).toBeNull();
    expect(screen.queryByRole("button", { name: /jornada|Registrar/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Horas · semana pasada" })).toBeNull();
    // Greeting and chips stay.
    expect(screen.getByRole("heading", { name: "Buenos días, Ana" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "1 para hoy" })).toBeTruthy();
  });

  it("column quick add presets the date", async () => {
    const created = task("nueva", "2026-11-13", { title: "Revisar cortes", subtaskCount: 0, subtaskDoneCount: 0 });
    actions.createUserTaskAction.mockResolvedValue({ ok: true, data: created });
    const { client } = renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "Agregar tarea para esta semana" }));

    await waitFor(() => expect(actions.createUserTaskAction).toHaveBeenCalledTimes(1));
    expect(actions.createUserTaskAction).toHaveBeenCalledWith({
      projectId: "p1",
      workflowId: "w1",
      title: "Revisar cortes",
      managerId: "me",
      priority: "media",
      commitmentDate: "2026-11-13",
    });
    const column = screen.getByRole("list", { name: "Esta semana" });
    expect(await within(column).findByText("Casa Lomas · recién creada")).toBeTruthy();
    expect(client.getQueryData<TaskListItem[]>(qk.me.tasks())?.some((t) => t.id === "nueva")).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("Tarea agregada a Esta semana");

    fireEvent.click(screen.getByRole("button", { name: "Agregar tarea para hoy" }));
    await waitFor(() => expect(actions.createUserTaskAction).toHaveBeenCalledTimes(2));
    expect(actions.createUserTaskAction).toHaveBeenLastCalledWith(expect.objectContaining({ commitmentDate: TODAY }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar tarea para después" }));
    await waitFor(() => expect(actions.createUserTaskAction).toHaveBeenCalledTimes(3));
    expect(actions.createUserTaskAction).toHaveBeenLastCalledWith(expect.objectContaining({ commitmentDate: "2026-11-16" }));
  });

  it("no quick add without canCreateTask", () => {
    renderBoard({ canCreateTask: false });
    expect(screen.queryByRole("button", { name: /^Agregar tarea/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nueva tarea" })).toBeNull();
  });

  it("5 cards then Ver más", () => {
    renderBoard({ tasks: Array.from({ length: 7 }, (_, i) => task(`h${i}`, TODAY)) });
    expect(within(screen.getByRole("list", { name: "Hoy" })).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "Ver 2 más →" }).getAttribute("href")).toBe("/tareas?responsable=yo");
    expect(within(screen.getByRole("list", { name: "Esta semana" })).getByText("Nada aquí")).toBeTruthy();
  });

  it("Abrir expands the Inbox", () => {
    renderBoard();
    const toggle = screen.getByRole("button", { name: "Abrir →" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "Bandeja completa" })).toBeNull();
    act(() => {
      fireEvent.click(toggle);
    });
    const open = screen.getByRole("button", { name: "Cerrar ↑" });
    expect(open.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(open.getAttribute("aria-controls")!);
    expect(panel?.querySelector('[aria-label="Bandeja completa"]')).toBeTruthy();
  });

  it("labels the rings, the subtask meters and the hours chart", () => {
    renderBoard();
    expect(screen.getByRole("img", { name: "Jornada: 2 h 30 min de 8 h" })).toBeTruthy();
    expect(screen.getAllByRole("img", { name: "Subtareas 1 de 2" }).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("img", {
        name: "Horas por día de la semana pasada: lunes 7.5, martes 8.2, miércoles 6.8, jueves 8, viernes 5.5. Meta 8 h.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("36 h")).toBeTruthy();
    expect(screen.getByText("+2 vs. anterior")).toBeTruthy();
    expect(screen.getByText("1 pendiente")).toBeTruthy();
  });

  it("formats the hours delta", () => {
    expect(hoursDeltaText(2)).toBe("+2 vs. anterior");
    expect(hoursDeltaText(-1.5)).toBe("−1.5 vs. anterior");
    expect(hoursDeltaText(0)).toBe("= vs. anterior");
    expect(hoursChartLabel(LAST_WEEK, 8)).toContain("viernes 5.5. Meta 8 h.");
  });

  it.each(["light", "dark"])("has no serious axe violations (%s)", async (mode) => {
    document.documentElement.classList.toggle("dark", mode === "dark");
    const { container } = renderBoard();
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    document.documentElement.classList.remove("dark");
  });
});
