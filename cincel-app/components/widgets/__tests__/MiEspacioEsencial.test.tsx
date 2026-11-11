// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";

import {
  meChecklistsOptions,
  meGmailStatusOptions,
  meGmailThreadsOptions,
  meNotesOptions,
  meNotificationsOptions,
  meRemindersOptions,
} from "@/lib/query/options/mi-espacio";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { TaskListItem } from "@/lib/types/core";
import type { Checklist, Note, NotificationItem } from "@/lib/types/redesign";
import { seedSessionUser } from "@/tests/helpers/session-user";
import { settle } from "@/tests/helpers/settle";

import type { QuickAddRowProps } from "@/components/widgets/QuickAddRow";

/** The flags on: the layout reads some (Bandeja, Gmail) once, when its module loads. */
const FLAGS_ON = vi.hoisted(() => ({
  fetchNotesAction: true,
  createNoteAction: true,
  fetchChecklistsAction: true,
  toggleChecklistItemAction: true,
  addChecklistItemAction: true,
  fetchRemindersAction: true,
  fetchNotificationsAction: true,
}));
const flags = vi.hoisted(() => ({ ...FLAGS_ON }) as Record<string, boolean>);
vi.mock("@/lib/actions/my-space-actions.flags", () => ({ IMPLEMENTED: flags }));
vi.mock("@/lib/actions/notifications-actions.flags", () => ({ IMPLEMENTED: flags }));
vi.mock("@/lib/actions/gmail-actions.flags", () => ({ IMPLEMENTED: flags }));

const tasksActions = vi.hoisted(() => ({
  setTaskStatusAction: vi.fn(),
  createUserTaskAction: vi.fn(),
  deleteTaskAction: vi.fn(),
}));
vi.mock("@/lib/actions/tasks-actions", () => tasksActions);
vi.mock("@/lib/actions/my-space-actions", () => ({
  fetchRemindersAction: vi.fn(),
  toggleChecklistItemAction: vi.fn(),
  addChecklistItemAction: vi.fn(),
}));
// Mi espacio's task reads (#1051), answered from the fixture by the fake.
const myTasks = vi.hoisted(() => ({
  server: null as FakeMyTasks | null,
  /** A test can hold the refetches (a promise that never answers). */
  hold: false,
}));
vi.mock("@/lib/actions/page-data/mi-espacio-actions", () => ({
  getMiEspacioPageData: vi.fn(),
  fetchMiEspacioNotesPage: vi.fn(),
  fetchMiEspacioChecklistsPage: vi.fn(),
  getMyTasksSummary: vi.fn((input: MyTasksSummaryInput) =>
    myTasks.hold ? new Promise(() => undefined) : Promise.resolve(myTasks.server!.summary(input)),
  ),
  getMyTasksPage: vi.fn((input: { filters: MeTasksListFilters; cursor: string | null }) =>
    myTasks.hold ? new Promise(() => undefined) : Promise.resolve(myTasks.server!.page(input)),
  ),
}));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({
  fetchCatalogProjectOptions: vi.fn(async () => [
    { id: "p1", name: "Casa Lomas", status: "activo", currentWorkflowId: "w-current" },
  ]),
}));
vi.mock("@/lib/actions/gmail-actions", () => ({}));
vi.mock("@/lib/actions/notifications-actions", () => ({}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/mi-espacio",
}));

const caps = vi.hoisted(() => ({
  canViewActivities: true,
  canCreateActivity: true,
  canChangeResponsible: true,
  canDeleteActivity: true,
  canReorderPhases: false,
  canExportData: false,
  statusScope: "all" as "all" | "assigned_or_participant" | "none",
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => caps,
}));

// Parts owned by other issues: stand-ins.
vi.mock("@/components/shell/EstiloSwitch", () => ({ EstiloSwitch: () => null }));
vi.mock("@/components/mi-espacio/Inbox", () => ({ Inbox: () => <section data-testid="inbox">bandeja completa</section> }));
vi.mock("@/components/mi-espacio/QuickCapture", () => ({
  QuickCapture: () => <input aria-label="Captura" data-testid="quick-capture" />,
}));
vi.mock("@/components/tareas/TaskSheet", () => ({
  TaskSheetRoute: () => null,
  taskSheetHref: (pathname: string, _search: string, id: string) => `${pathname}?tarea=${id}`,
}));
vi.mock("@/components/tareas/NewTaskDialog", () => ({
  newTaskInvalidations: (projectId: string) => [["tareas"], ["proyectos", projectId, "tareas"], ["me", "tasks"]],
}));
// The smart quick add (#984): Enter hands the context as the draft.
vi.mock("@/components/widgets/QuickAddRow", () => ({
  QuickAddRow: ({ context, onCreate }: QuickAddRowProps) => (
    <input
      aria-label={context.label}
      placeholder={context.placeholder}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        const title = (event.target as HTMLInputElement).value;
        void onCreate({
          title,
          projectId: context.projectId,
          tramoId: context.tramoId ?? null,
          assigneeId: context.assigneeId ?? null,
          dueDate: null,
          priority: "media",
        }).catch(() => undefined);
      }}
    />
  ),
}));

import { CREATED_UNDO_MS, MiEspacioEsencial } from "@/components/widgets/MiEspacioEsencial";
import { MY_TASKS_ALL, type MeTasksListFilters, type MyTasksSummaryInput } from "@/lib/my-space/my-tasks-summary";
import { localDate } from "@/lib/time-tracking/local-time";
import { fakeMyTasks, type FakeMyTasks } from "@/tests/helpers/my-tasks-fake";

const NOW = new Date();

function task(id: string, title: string, over: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id,
    projectId: "p1",
    kind: "workflow",
    templateId: null,
    workflowId: "w1",
    phaseId: null,
    spaceId: null,
    closedAt: null,
    title,
    notes: null,
    createdById: "me",
    managerId: "me",
    status: "pendiente",
    customStatusId: null,
    priority: "media",
    sortOrder: null,
    commitmentDate: "2030-06-15",
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
    subtaskCount: 0,
    subtaskDoneCount: 0,
    waitingOn: 0,
    ...over,
  };
}

function detail(t: TaskListItem) {
  return { ...t, createdBy: { id: "me", name: "Ana López" }, checklistItems: [], attachments: [], links: [], history: [] };
}

const TASKS = [
  task("t1", "Planos de cimentación", { commitmentDate: "2026-01-10" }),
  task("t2", "Revisar presupuesto"),
  task("t3", "Visita de obra", {
    projectId: "p2",
    project: { id: "p2", name: "Torre Sur", clientName: null },
    managerId: "otro",
    manager: { id: "otro", name: "Luis" },
  }),
];

const NOTIFICATION: NotificationItem = {
  id: "n1",
  kind: "mencion",
  title: "Luis te mencionó",
  body: "En Planos",
  entity: null,
  entityId: null,
  url: null,
  readAt: null,
  createdAt: NOW.toISOString(),
};

const CHECKLIST: Checklist = {
  id: "c1",
  title: "Visita de obra",
  projectId: "p1",
  projectName: "Casa Lomas",
  updatedAt: "2026-11-01T12:00:00.000Z",
  items: [
    { id: "i1", text: "Planos", done: true, sortOrder: 0 },
    { id: "i2", text: "Fotos", done: false, sortOrder: 1 },
  ],
};

const NOTE: Note = {
  id: "n-1",
  title: "Ideas recepción",
  body: "Mármol",
  color: "neutral",
  pinned: true,
  projectId: null,
  updatedAt: NOW.toISOString(),
};

function renderEsencial(tasks: TaskListItem[] = TASKS) {
  const client = createTestQueryClient();
  const server = fakeMyTasks(tasks, localDate(NOW));
  myTasks.server = server;
  server.seed(client, MY_TASKS_ALL, server.esencialLists());
  client.setQueryData(meNotificationsOptions().queryKey, {
    pages: [{ items: [NOTIFICATION], nextCursor: null, unreadCount: 1 }],
    pageParams: [null],
  });
  client.setQueryData(meGmailStatusOptions().queryKey, { connected: false, scopeOk: false, lastSyncedAt: null, lastError: null });
  client.setQueryData(meGmailThreadsOptions().queryKey, { pages: [{ threads: [], nextCursor: null }], pageParams: [null] });
  client.setQueryData(meRemindersOptions().queryKey, []);
  client.setQueryData(meChecklistsOptions().queryKey, { pages: [{ items: [CHECKLIST], nextCursor: null }], pageParams: [null] });
  client.setQueryData(meNotesOptions().queryKey, { pages: [{ items: [NOTE], nextCursor: null }], pageParams: [null] });
  const view = renderWithQueryClient(<MiEspacioEsencial />, { client });
  return { ...view, client };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(flags)) delete flags[key];
  Object.assign(flags, FLAGS_ON);
  caps.statusScope = "all";
  caps.canCreateActivity = true;
  caps.canDeleteActivity = true;
  myTasks.hold = false;
  seedSessionUser({ member: { id: "me", name: "Ana López" }, access: "Colaborador" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.classList.remove("dark");
});

describe("MiEspacioEsencial", () => {
  it("groups tasks by project with counts, due labels and the remainder-free list", () => {
    renderEsencial();
    expect(screen.getByRole("heading", { name: "Mis tareas" })).toBeTruthy();
    expect(screen.getByText("abiertas").textContent).toMatch(/^3\s+abiertas$/);
    expect(screen.getByText("vencida").textContent).toMatch(/^1\s+vencida$/);
    const casa = screen.getByRole("region", { name: "Casa Lomas" });
    expect(within(casa).getByRole("checkbox", { name: "Completar Planos de cimentación" })).toBeTruthy();
    expect(within(casa).getByText(/d tarde/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Torre Sur" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Ver todas/ }).getAttribute("href")).toBe("/tareas?responsable=yo");
  });

  it("4 rows per project, Ver más loads the rest; projects past the third go to the remainder (#1051)", async () => {
    const at = (p: string, name: string) => ({ projectId: p, project: { id: p, name, clientName: null } });
    const many = [
      ...Array.from({ length: 6 }, (_, i) => task(`a${i}`, `Lomas ${i}`, { commitmentDate: `2030-06-1${i}` })),
      task("b1", "Torre 1", { ...at("p2", "Torre Sur"), commitmentDate: "2030-07-01" }),
      task("c1", "Loft 1", { ...at("p3", "Loft"), commitmentDate: "2030-07-02" }),
      task("d1", "Bodega 1", { ...at("p4", "Bodega"), commitmentDate: "2030-07-03" }),
      task("d2", "Bodega 2", { ...at("p4", "Bodega"), commitmentDate: null }),
    ];
    renderEsencial(many);
    const casa = screen.getByRole("region", { name: "Casa Lomas" });
    expect(within(casa).getAllByRole("checkbox")).toHaveLength(4);
    expect(screen.getByRole("link", { name: /2 tareas más en Bodega/ })).toBeTruthy();
    fireEvent.click(within(casa).getByRole("button", { name: "Ver más (2 restantes)" }));
    await waitFor(() => expect(within(casa).getAllByRole("checkbox")).toHaveLength(6));
    expect(within(casa).queryByRole("button", { name: /^Ver más/ })).toBeNull();
  });

  it("completes a task optimistically and rolls back on error", async () => {
    const pending = deferred<{ ok: false; error: string }>();
    tasksActions.setTaskStatusAction.mockReturnValue(pending.promise);
    renderEsencial();
    // The settle refetch never answers, so only the rollback can bring the row back.
    myTasks.hold = true;

    fireEvent.click(screen.getByRole("checkbox", { name: "Completar Revisar presupuesto" }));
    await waitFor(() => expect(tasksActions.setTaskStatusAction).toHaveBeenCalledWith("t2", "completado"));
    await waitFor(() => expect(screen.queryByText("Revisar presupuesto")).toBeNull());

    await act(async () => {
      pending.resolve({ ok: false, error: "FORBIDDEN" });
    });
    expect(await screen.findByText("Revisar presupuesto")).toBeTruthy();
    expect(toast.error).toHaveBeenCalled();
  });

  it("undo restores the status", async () => {
    tasksActions.setTaskStatusAction.mockImplementation(async (id: string, status: string) => ({
      ok: true,
      data: detail({ ...TASKS[1]!, id, status: status as TaskListItem["status"] }),
    }));
    renderEsencial();

    fireEvent.click(screen.getByRole("checkbox", { name: "Completar Revisar presupuesto" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [message, options] = toast.success.mock.calls[0]!;
    expect(message).toBe("Tarea completada");
    expect(screen.getByRole("status").textContent).toBe("Tarea completada");

    await act(async () => {
      options.action.onClick();
    });
    await waitFor(() => expect(tasksActions.setTaskStatusAction).toHaveBeenLastCalledWith("t2", "pendiente"));
  });

  it("quick add presets the project and shows Agregada · Deshacer", async () => {
    const created = task("t9", "Cotizar herrería");
    tasksActions.createUserTaskAction.mockResolvedValue({ ok: true, data: detail(created) });
    renderEsencial();
    myTasks.server!.tasks = [...TASKS, created];

    const input = await screen.findByRole("textbox", { name: "Agregar tarea en Casa Lomas" });
    expect(input.getAttribute("placeholder")).toBe("Escribe para agregar…");
    fireEvent.change(input, { target: { value: "Cotizar herrería" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(tasksActions.createUserTaskAction).toHaveBeenCalled());
    expect(tasksActions.createUserTaskAction.mock.calls[0]![0]).toMatchObject({
      projectId: "p1",
      title: "Cotizar herrería",
      managerId: "me",
    });
    expect(await screen.findByText("Cotizar herrería")).toBeTruthy();
    expect(screen.getByText(/Agregada/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Tarea agregada");
  });

  it("Deshacer deletes the created task", async () => {
    const created = task("t9", "Cotizar herrería");
    tasksActions.createUserTaskAction.mockResolvedValue({ ok: true, data: detail(created) });
    tasksActions.deleteTaskAction.mockResolvedValue({ ok: true, data: undefined });
    renderEsencial();
    // The create's refetch has the new task; the delete's refetch no longer does.
    myTasks.server!.tasks = [...TASKS, created];
    tasksActions.deleteTaskAction.mockImplementation(async () => {
      myTasks.server!.tasks = TASKS;
      return { ok: true, data: undefined };
    });

    const input = await screen.findByRole("textbox", { name: "Agregar tarea en Casa Lomas" });
    fireEvent.change(input, { target: { value: "Cotizar herrería" } });
    fireEvent.keyDown(input, { key: "Enter" });

    fireEvent.click(await screen.findByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(tasksActions.deleteTaskAction).toHaveBeenCalledWith("t9"));
    await waitFor(() => expect(screen.queryByText("Cotizar herrería")).toBeNull());
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
  });

  it(`the undo is gone after ${CREATED_UNDO_MS / 1000} s`, async () => {
    const created = task("t9", "Cotizar herrería");
    tasksActions.createUserTaskAction.mockResolvedValue({ ok: true, data: detail(created) });
    renderEsencial();
    myTasks.server!.tasks = [...TASKS, created];

    const input = await screen.findByRole("textbox", { name: "Agregar tarea en Casa Lomas" });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.change(input, { target: { value: "Cotizar herrería" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Deshacer" })).toBeTruthy());
    await act(async () => {
      vi.advanceTimersByTime(CREATED_UNDO_MS + 10);
    });
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
  });

  it("Captura rápida opens the popover", async () => {
    renderEsencial();
    expect(screen.queryByTestId("quick-capture")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Captura rápida" }));
    expect(await screen.findByTestId("quick-capture")).toBeTruthy();
  });

  it("disabled checkbox without status permission", () => {
    caps.statusScope = "assigned_or_participant";
    renderEsencial();
    const own = screen.getByRole("checkbox", { name: "Completar Revisar presupuesto" }) as HTMLInputElement;
    const other = screen.getByRole("checkbox", { name: "Completar Visita de obra" }) as HTMLInputElement;
    expect(own.disabled).toBe(false);
    expect(other.disabled).toBe(true);
    expect(other.getAttribute("title")).toBe("No puedes cambiar el estatus");
  });

  it("empty Mis tareas offers Nueva tarea and hides the pills", () => {
    renderEsencial([]);
    expect(screen.getByText("No tienes tareas abiertas.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nueva tarea" })).toBeTruthy();
    expect(screen.queryByText("abiertas")).toBeNull();
  });

  it("Bandeja lists unread rows and Ver bandeja expands the full Inbox", () => {
    renderEsencial();
    expect(screen.getByText("Luis te mencionó")).toBeTruthy();
    const toggle = screen.getByRole("button", { name: /Ver bandeja/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByTestId("inbox")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ocultar bandeja/ }).getAttribute("aria-expanded")).toBe("true");
  });

  it("shows the first checklist with its count and the newest notes", () => {
    renderEsencial();
    expect(screen.getByRole("heading", { name: "Visita de obra" })).toBeTruthy();
    expect(screen.getByText("1/2")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Visita de obra" })).getByText("Casa Lomas")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Agregar elemento" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Ideas recepción/ })).toBeTruthy();
    expect(screen.getByText("Sin recordatorios para hoy y mañana")).toBeTruthy();
  });

  it.each(["light", "dark"])("has no serious axe violations (%s)", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark");
    const { container, client } = renderEsencial();
    await settle(client);
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
});
