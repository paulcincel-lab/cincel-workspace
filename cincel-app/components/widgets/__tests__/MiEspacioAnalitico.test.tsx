// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";

import { LOCK_REASON, type CellEdit } from "@/components/widgets/editable-cell";
import type { Group, GroupedTableProps } from "@/components/widgets/GroupedTable";
import type { QuickAddRowProps } from "@/components/widgets/QuickAddRow";
import { qk } from "@/lib/query/keys";
import { meTodayOptions } from "@/lib/query/options/me";
import {
  meChecklistsOptions,
  meGmailStatusOptions,
  meNotificationsOptions,
  meNotificationsSummaryOptions,
  meWeekHoursOptions,
} from "@/lib/query/options/mi-espacio";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { addDays, localDate, mondayOf, weekDates } from "@/lib/time-tracking/local-time";
import type { TaskRow } from "@/lib/my-space/my-tasks";
import type { TaskListItem, TaskStatusOption } from "@/lib/types/core";
import type { RecordColumn } from "@/lib/types/widgets";
import type { Checklist, NotificationKindSummary, TodayStatus, WeekHours } from "@/lib/types/redesign";
import { seedSessionUser } from "@/tests/helpers/session-user";
import { fakeMyTasks, type FakeMyTasks } from "@/tests/helpers/my-tasks-fake";
import { myTasksSummaryInput, type MeTasksListFilters, type MyTasksSummaryInput } from "@/lib/my-space/my-tasks-summary";
import { parseMiEspacioFilters } from "@/components/mi-espacio/search-params";
import { settle } from "@/tests/helpers/settle";

const flags = vi.hoisted(() => ({}) as Record<string, boolean>);
vi.mock("@/lib/actions/my-space-actions.flags", () => ({ IMPLEMENTED: flags }));
vi.mock("@/lib/actions/notifications-actions.flags", () => ({ IMPLEMENTED: flags }));
vi.mock("@/lib/actions/gmail-actions.flags", () => ({ IMPLEMENTED: flags }));
vi.mock("@/lib/actions/time-tracking-actions.flags", () => ({ IMPLEMENTED: flags }));

const tasksActions = vi.hoisted(() => ({
  createUserTaskAction: vi.fn(),
  updateTaskAction: vi.fn(),
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
}));
vi.mock("@/lib/actions/tasks-actions", () => tasksActions);
vi.mock("@/lib/actions/my-space-actions", () => ({
  fetchRemindersAction: vi.fn(),
  createChecklistAction: vi.fn(),
  toggleChecklistItemAction: vi.fn(),
  addChecklistItemAction: vi.fn(),
}));
// Mi espacio's task reads (#1051), answered from the fixture by the fake.
const myTasks = vi.hoisted(() => ({ server: null as FakeMyTasks | null }));
vi.mock("@/lib/actions/page-data/mi-espacio-actions", () => ({
  getMiEspacioPageData: vi.fn(),
  fetchMiEspacioNotesPage: vi.fn(),
  fetchMiEspacioChecklistsPage: vi.fn(),
  getMyTasksSummary: vi.fn(async (input: MyTasksSummaryInput) => myTasks.server!.summary(input)),
  getMyTasksPage: vi.fn(async (input: { filters: MeTasksListFilters; cursor: string | null }) => myTasks.server!.page(input)),
}));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({
  fetchCatalogProjectOptions: vi.fn(async () => [
    { id: "p1", name: "Casa Lomas", status: "activo", currentWorkflowId: "w-dis" },
    { id: "p2", name: "Torre Sur", status: "activo", currentWorkflowId: "w-pre" },
  ]),
  fetchCatalogTaskStatuses: vi.fn(async (): Promise<TaskStatusOption[]> => [
    { id: "cs-rev", name: "En revisión cliente", closes: false, countsAsCompleted: false, sortOrder: 1 },
    { id: "cs-ent", name: "Entregada", closes: true, countsAsCompleted: true, sortOrder: 2 },
  ]),
}));
vi.mock("@/lib/actions/page-data/me-actions", () => ({ fetchMyProfileAction: vi.fn() }));
vi.mock("@/lib/actions/time-tracking-actions", () => ({ fetchMyTodayAction: vi.fn(), fetchMyWeekHoursAction: vi.fn() }));
vi.mock("@/lib/actions/gmail-actions", () => ({}));
vi.mock("@/lib/actions/notifications-actions", () => ({
  fetchNotificationsAction: vi.fn(),
  fetchNotificationsSummaryAction: vi.fn(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/mi-espacio",
}));

const params = vi.hoisted(() => ({ replaceMiEspacioParam: vi.fn() }));
vi.mock("@/components/mi-espacio/search-params", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/mi-espacio/search-params")>()),
  replaceMiEspacioParam: params.replaceMiEspacioParam,
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
vi.mock("@/components/mi-espacio/QuickCapture", () => ({ QuickCapture: () => <input aria-label="Captura" /> }));
vi.mock("@/components/mi-espacio/ChecklistCard", () => ({
  ChecklistCard: ({ checklist }: { checklist: Checklist }) => <p data-testid="checklist-card">{checklist.title}</p>,
}));
vi.mock("@/components/tareas/TaskSheet", () => ({
  TaskSheetRoute: () => null,
  taskSheetHref: (pathname: string, _search: string, id: string) => `${pathname}?tarea=${id}`,
}));
vi.mock("@/components/tareas/NewTaskDialog", () => ({
  newTaskInvalidations: (projectId: string) => [["tareas"], ["proyectos", projectId, "tareas"], ["me", "tasks"]],
}));
// The grouped table (#982): groups, their rows through `renderCell`, the quick add and the totals.
// The last props are kept so the tests can drive a column's `edit` like the cell editor does.
const grouped = vi.hoisted(() => ({ props: null as GroupedTableProps<Record<string, unknown>> | null }));
vi.mock("@/components/widgets/GroupedTable", () => ({
  GroupedTable: (p: GroupedTableProps<Record<string, unknown>>) => {
    grouped.props = p;
    return (
      <div data-testid="grouped-table" data-expanded={(p.expanded ?? []).join(",")}>
        {p.groups.map((group: Group<Record<string, unknown>>) => (
          <table key={group.id} aria-label={group.label}>
            <thead>
              <tr>
                {p.columns.map((column) => (
                  <th key={column.key} scope="col">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            {(group.children ?? []).map((child) => (
              <tbody key={child.id} aria-label={child.label}>
                {(child.rows ?? []).map((row) => (
                  <tr key={String(row.id)} data-new={p.isRowNew?.(row) ? "" : undefined}>
                    {p.columns.map((column) => (
                      <td key={column.key}>{p.renderCell?.(column.key, row) ?? String(row[column.key])}</td>
                    ))}
                  </tr>
                ))}
                {child.quickAdd}
              </tbody>
            ))}
          </table>
        ))}
        {p.totals ? <p data-testid="totals">{`${p.totals.label} | ${p.totals.summary}`}</p> : null}
      </div>
    );
  },
}));
// The smart quick add (#984): Enter hands the context as the draft.
vi.mock("@/components/widgets/QuickAddRow", () => ({
  QuickAddRow: ({ context, onCreate }: QuickAddRowProps) => (
    <tr>
      <td>
        <input
          aria-label={context.label}
          placeholder={context.placeholder}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            void onCreate({
              title: (event.target as HTMLInputElement).value,
              projectId: context.projectId,
              etapaId: null,
              assigneeId: context.assigneeId ?? null,
              dueDate: null,
              priority: "media",
            }).catch(() => undefined);
          }}
        />
      </td>
    </tr>
  ),
}));

import { fetchMyWeekHoursAction } from "@/lib/actions/time-tracking-actions";
import { MiEspacioAnalitico } from "@/components/widgets/MiEspacioAnalitico";

const NOW = new Date();
const TODAY = localDate(NOW);
const THIS_MONDAY = mondayOf(TODAY);
const LAST_MONDAY = addDays(THIS_MONDAY, -7);

const DISENO = { id: "w-dis", key: "diseno", name: "Diseño", sortOrder: 2 };
const PRESALE = { id: "w-pre", key: "presale", name: "Presale", sortOrder: 1 };

function task(id: string, title: string, over: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id,
    projectId: "p1",
    kind: "workflow",
    templateId: null,
    workflowId: DISENO.id,
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
    commitmentDate: addDays(TODAY, 3),
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    customStatus: null,
    project: { id: "p1", name: "Casa Lomas", clientName: null },
    workflow: DISENO,
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

const TORRE = { projectId: "p2", project: { id: "p2", name: "Torre Sur", clientName: null }, workflow: PRESALE, workflowId: PRESALE.id };

const TASKS = [
  task("t1", "Planos de cimentación", { commitmentDate: addDays(TODAY, -6) }),
  task("t2", "Revisar presupuesto"),
  task("t3", "Visita de obra", { ...TORRE, commitmentDate: null }),
  task("t4", "Permisos de obra", { ...TORRE, commitmentDate: addDays(TODAY, -2) }),
];

function detail(t: TaskListItem) {
  return { ...t, createdBy: { id: "me", name: "Ana López" }, checklistItems: [], attachments: [], links: [], history: [] };
}

const TODAY_STATUS: TodayStatus = {
  state: "off",
  startedAt: null,
  workedSeconds: 0,
  required: false,
  promptAtLogin: false,
  enabled: true,
  requiredFrom: null,
  hoursPerDay: 8,
};

function week(monday: string, hours: number[]): WeekHours {
  const days = weekDates(monday).map((date, i) => ({ date, hours: hours[i] ?? 0 }));
  return { days, total: days.reduce((sum, d) => sum + d.hours, 0), target: 40 };
}

const SUMMARY: NotificationKindSummary[] = [
  { kind: "mencion", unread: 2, total: 3, latestAt: NOW.toISOString() },
  { kind: "asignacion", unread: 0, total: 4, latestAt: "2026-11-02T15:00:00.000Z" },
  { kind: "sistema", unread: 0, total: 0, latestAt: null },
];

const CHECKLISTS: Checklist[] = [
  {
    id: "c1",
    title: "Visita de obra · Ensenada",
    projectId: "p1",
    projectName: "Casa Lomas",
    updatedAt: NOW.toISOString(),
    items: [
      { id: "i1", text: "Planos", done: true, sortOrder: 0 },
      { id: "i2", text: "Fotos", done: false, sortOrder: 1 },
    ],
  },
];

/** The summary and the first page of every etapa group of the URL's filters, as the page seeds them. */
function seedTasks(client: ReturnType<typeof createTestQueryClient>, tasks: TaskListItem[] = TASKS) {
  const server = fakeMyTasks(tasks, TODAY);
  myTasks.server = server;
  const f = parseMiEspacioFilters(new URLSearchParams(nav.search));
  const input = myTasksSummaryInput({ etapa: f.etapa, q: f.q, retraso: f.estado === "retraso" });
  const withClosed = new URLSearchParams(nav.search).get("completadas") === "1";
  server.seed(client, input, server.analiticoLists(input, withClosed));
  return server;
}

function renderAnalitico(over: { today?: TodayStatus; tasks?: TaskListItem[] } = {}) {
  const client = createTestQueryClient();
  seedTasks(client, over.tasks);
  client.setQueryData(meTodayOptions().queryKey, over.today ?? TODAY_STATUS);
  client.setQueryData(meWeekHoursOptions(THIS_MONDAY).queryKey, week(THIS_MONDAY, [8, 0, 0, 0, 0]));
  client.setQueryData(meWeekHoursOptions(LAST_MONDAY).queryKey, week(LAST_MONDAY, [8, 8, 8, 8, 6]));
  client.setQueryData(meNotificationsSummaryOptions().queryKey, SUMMARY);
  client.setQueryData(meNotificationsOptions().queryKey, {
    pages: [{ items: [], nextCursor: null, unreadCount: 2 }],
    pageParams: [null],
  });
  client.setQueryData(meGmailStatusOptions().queryKey, { connected: false, scopeOk: false, lastSyncedAt: null, lastError: null });
  client.setQueryData(meChecklistsOptions().queryKey, { pages: [{ items: CHECKLISTS, nextCursor: null }], pageParams: [null] });
  const view = renderWithQueryClient(<MiEspacioAnalitico />, { client });
  return { ...view, client };
}

const sectionToggle = (name: RegExp) => screen.getByRole("button", { name });

beforeEach(() => {
  vi.clearAllMocks();
  nav.search = "";
  for (const key of Object.keys(flags)) delete flags[key];
  Object.assign(flags, {
    fetchChecklistsAction: true,
    createChecklistAction: true,
    toggleChecklistItemAction: true,
    addChecklistItemAction: true,
    fetchNotificationsAction: true,
    fetchNotificationsSummaryAction: true,
    markNotificationsReadAction: true,
    fetchMyTodayAction: true,
    fetchMyWeekHoursAction: true,
  });
  caps.canCreateActivity = true;
  caps.statusScope = "all";
  grouped.props = null;
  myTasks.server = fakeMyTasks(TASKS, TODAY);
  // A test that leaves the week-hours cache empty still gets a week back from the fetch.
  vi.mocked(fetchMyWeekHoursAction).mockImplementation(async (input) => week(input?.weekStart ?? THIS_MONDAY, []));
  seedSessionUser({ member: { id: "me", name: "Ana López" }, access: "Colaborador" });
});

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
});

describe("MiEspacioAnalitico", () => {
  it("renders the KPIs, groups and footer from real data", () => {
    renderAnalitico();
    expect(screen.getByRole("heading", { name: /Mi espacio/ })).toBeTruthy();
    expect(screen.getByText("Mis abiertas")).toBeTruthy();
    expect(screen.getByText("Horas semana")).toBeTruthy();
    // The current week has hours: 8 h, against 38 h the week before.
    expect(screen.getAllByText("8 h").length).toBeGreaterThan(0);
    expect(sectionToggle(/Mis tareas/).textContent).toMatch(/4 abiertas · 2 proyectos/);
    expect(sectionToggle(/Mis tareas/).textContent).toMatch(/50 % vencidas/);
    expect(sectionToggle(/Mis tareas/).textContent).toMatch(/Retraso prom\. 4 d/);
    expect(screen.getByTestId("totals").textContent).toBe("Total · 4 tareas | 8 d");
    const planos = screen.getByText("Planos de cimentación").closest("tr")!;
    expect(within(planos).getByText("6").className).toMatch(/bg-warning/);
    // Bandeja por tipo: kinds with rows, in order; total 0 hidden.
    const bandeja = screen.getByRole("region", { name: /Bandeja por tipo/ });
    const kinds = within(bandeja)
      .getAllByRole("rowheader")
      .map((cell) => cell.textContent);
    expect(kinds).toEqual(["Asignaciones", "Menciones"]);
    expect(within(bandeja).getByRole("button", { name: /Bandeja por tipo/ }).textContent).toMatch(/Sin leer 2 de 7/);
    // Checklists from the DTO: project name and progress.
    const checklists = screen.getByRole("region", { name: /Checklists/ });
    expect(within(checklists).getByText("Casa Lomas")).toBeTruthy();
    expect(within(checklists).getAllByText("50 %").length).toBeGreaterThan(0);
  });

  it("filters by estado and etapa and keeps the URL", () => {
    renderAnalitico();
    fireEvent.click(screen.getByRole("radio", { name: /En retraso/ }));
    expect(params.replaceMiEspacioParam).toHaveBeenCalledWith("estado", "retraso");
    fireEvent.click(screen.getByRole("radio", { name: /Presale/ }));
    expect(params.replaceMiEspacioParam).toHaveBeenCalledWith("etapa", "presale");
    cleanup();

    // A reload with the params shows the same filtered view.
    nav.search = "estado=retraso&etapa=presale";
    renderAnalitico();
    expect(screen.getByRole("radio", { name: /En retraso/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Permisos de obra")).toBeTruthy();
    expect(screen.queryByText("Planos de cimentación")).toBeNull();
    expect(screen.queryByText("Visita de obra")).toBeNull();
    expect(screen.getByTestId("totals").textContent).toBe("Total · 1 tarea | 2 d");
    cleanup();

    nav.search = "q=zzz";
    renderAnalitico();
    expect(screen.getAllByText("Nada coincide con estos filtros.").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Quitar filtros" })[0]!);
    expect(params.replaceMiEspacioParam).toHaveBeenCalledWith("q", null);
  });

  it("Expandir todo / Contraer todo", () => {
    nav.search = "abiertos=p2";
    renderAnalitico();
    expect(screen.getByTestId("grouped-table").getAttribute("data-expanded")!.split(",")).not.toContain("p1");
    const navBar = screen.getByRole("navigation", { name: "Ir a sección" });
    fireEvent.click(within(navBar).getByRole("button", { name: "Expandir todo" }));
    expect(params.replaceMiEspacioParam).toHaveBeenLastCalledWith("abiertos", null);
    cleanup();

    nav.search = "";
    renderAnalitico();
    const bar = screen.getByRole("navigation", { name: "Ir a sección" });
    fireEvent.click(within(bar).getByRole("button", { name: "Contraer todo" }));
    expect(params.replaceMiEspacioParam).toHaveBeenLastCalledWith("abiertos", "");
    for (const name of [/Mis tareas/, /Horas de la semana/, /Bandeja por tipo/, /^Checklists/]) {
      expect(sectionToggle(name).getAttribute("aria-expanded")).toBe("false");
    }
    expect(within(bar).getByRole("button", { name: "Expandir todo" })).toBeTruthy();
  });

  it("Ir a moves focus to the section heading", () => {
    renderAnalitico();
    fireEvent.click(sectionToggle(/Horas de la semana/));
    expect(sectionToggle(/Horas de la semana/).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("link", { name: /^Horas/ }));
    expect(document.activeElement).toBe(sectionToggle(/Horas de la semana/));
    expect(sectionToggle(/Horas de la semana/).getAttribute("aria-expanded")).toBe("true");
  });

  it("type row opens the Inbox sheet on its tab", async () => {
    renderAnalitico();
    fireEvent.click(screen.getByRole("button", { name: "Menciones" }));
    expect(params.replaceMiEspacioParam).toHaveBeenCalledWith("bandeja", "menciones");
    expect(await screen.findByTestId("inbox")).toBeTruthy();
  });

  it("hides Bandeja por tipo alone when the summary fails", () => {
    const client = createTestQueryClient();
    seedTasks(client);
    client.setQueryData(meTodayOptions().queryKey, TODAY_STATUS);
    flags.fetchNotificationsSummaryAction = false;
    renderWithQueryClient(<MiEspacioAnalitico />, { client });
    expect(screen.queryByRole("region", { name: /Bandeja por tipo/ })).toBeNull();
    expect(screen.getByRole("region", { name: /Mis tareas/ })).toBeTruthy();
  });

  it("hides Horas when time tracking is off", () => {
    renderAnalitico({ today: { ...TODAY_STATUS, enabled: false } });
    expect(screen.getByText("El registro de horas está desactivado.")).toBeTruthy();
    expect(screen.queryByText("Horas semana")).toBeNull();
  });

  it("quick add adds a nueva row and updates the footer", async () => {
    const created = task("t9", "Cotizar herrería");
    tasksActions.createUserTaskAction.mockResolvedValue({ ok: true, data: detail(created) });
    renderAnalitico();
    myTasks.server!.tasks = [...TASKS, created];

    const input = screen.getByRole("textbox", { name: "Agregar tarea en Casa Lomas" });
    expect(input.getAttribute("placeholder")).toBe(
      "Escribe para agregar una tarea en Casa Lomas…  #etapa  fecha  !prioridad",
    );
    fireEvent.change(input, { target: { value: "Cotizar herrería" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(tasksActions.createUserTaskAction).toHaveBeenCalled());
    expect(tasksActions.createUserTaskAction.mock.calls[0]![0]).toMatchObject({
      projectId: "p1",
      title: "Cotizar herrería",
      managerId: "me",
    });
    const row = (await screen.findByText("Cotizar herrería")).closest("tr")!;
    expect(row.hasAttribute("data-new")).toBe(true);
    await waitFor(() =>
      expect(screen.getByTestId("totals").textContent).toBe("Total · 5 tareas (4 abiertas + 1 nueva) | 8 d"),
    );
  });

  it("Exportar downloads every matching row, also the ones not loaded yet", async () => {
    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:mi-espacio";
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    nav.search = "estado=retraso";
    const { client } = renderAnalitico();
    await settle(client);

    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    const csv = await blobs[0]!.text();
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Proyecto;Etapa;Tarea;Estatus;Vence;Prioridad;Subtareas;Días de retraso");
    expect(lines.slice(1).map((line) => line.split(";")[2])).toEqual(["Planos de cimentación", "Permisos de obra"]);
    click.mockRestore();
  });

  it("renders table headers and has no serious or critical axe violations, light and dark", async () => {
    const { container, client } = renderAnalitico();
    await settle(client);
    for (const header of screen.getAllByRole("columnheader")) expect(header.getAttribute("scope")).toBe("col");
    for (const theme of ["light", "dark"]) {
      document.documentElement.classList.toggle("dark", theme === "dark");
      const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
      const blocking = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(blocking.map((v) => v.id), theme).toEqual([]);
    }
  });
});

describe("MiEspacioAnalitico paging (#1051)", () => {
  const MANY = Array.from({ length: 35 }, (_, i) =>
    task(`m${String(i).padStart(2, "0")}`, `Tarea ${String(i).padStart(2, "0")}`, { commitmentDate: addDays(TODAY, 1 + i) }),
  );
  const diseno = () => grouped.props!.groups.find((g) => g.id === "p1")!.children!.find((c) => c.id === "p1:w-dis")!;

  it("an etapa group loads 30 rows, says how many remain and loads the next page", async () => {
    const { client } = renderAnalitico({ tasks: MANY });
    expect(diseno().rows).toHaveLength(30);
    expect(diseno()).toMatchObject({ hasMore: true, remaining: 5 });
    // Counts come from the summary, not from the loaded rows.
    expect(screen.getByTestId("totals").textContent).toBe("Total · 35 tareas | 0 d");
    await act(async () => grouped.props!.onLoadMore!("p1:w-dis"));
    await settle(client);
    await waitFor(() => expect(diseno().rows).toHaveLength(35));
    expect(diseno()).toMatchObject({ hasMore: false, remaining: 0 });
  });

  it("closed tasks: counted per project while hidden, listed last in their group when shown", () => {
    const done = task("t5", "Entrega cerrada", { status: "completado", commitmentDate: addDays(TODAY, -30) });
    renderAnalitico({ tasks: [...TASKS, done] });
    expect(screen.queryByText("Entrega cerrada")).toBeNull();
    expect(within(screen.getByRole("table", { name: "Casa Lomas" })).getByText(/1 completada/)).toBeTruthy();
    cleanup();

    nav.search = "completadas=1";
    renderAnalitico({ tasks: [...TASKS, done] });
    expect(diseno().rows!.map((r) => r.id)).toEqual(["t1", "t2", "t5"]);
    expect(screen.getByTestId("totals").textContent).toBe("Total · 5 tareas | 8 d");
  });
});

describe("MiEspacioAnalitico editable cells", () => {
  const ok = (t: TaskListItem) => ({ ok: true as const, data: detail(t) });

  function column(key: string): RecordColumn<TaskRow> & { edit?: CellEdit<TaskRow> } {
    const found = grouped.props!.columns.find((c) => c.key === key);
    if (!found) throw new Error(`no column ${key}`);
    return found as unknown as RecordColumn<TaskRow> & { edit?: CellEdit<TaskRow> };
  }

  function row(id: string): TaskRow {
    const rows = grouped.props!.groups.flatMap((g) => (g.children ?? []).flatMap((c) => c.rows ?? []));
    const found = rows.find((r) => r.id === id);
    if (!found) throw new Error(`no row ${id}`);
    return found as unknown as TaskRow;
  }

  /** Commits like the cell editor: the column's `commit`, then `CellCommitProvider` invalidates `me.tasks` on settle. */
  async function commit(key: string, id: string, value: string | null) {
    const edit = column(key).edit!;
    let result: Awaited<ReturnType<typeof edit.commit>> | undefined;
    await act(async () => {
      result = await edit.commit(row(id), value);
    });
    await settle();
    await act(async () => {
      await view!.client.invalidateQueries({ queryKey: qk.me.tasks() });
    });
    await settle();
    return result!;
  }

  let view: ReturnType<typeof renderAnalitico> | null = null;
  const renderTable = () => {
    view = renderAnalitico();
    return view;
  };

  /** Lets the query cache notify its observers (batched on a timer). */
  const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

  const kpi = (label: string) =>
    screen
      .getAllByText(label)
      .find((el) => el.tagName === "DT")!
      .parentElement!.querySelector('[data-slot="kpi-value"]')!.textContent;

  it("Tarea, Estatus, Vence and Prioridad edit; Subtareas and Días de retraso stay calculated", () => {
    renderTable();
    const kinds = Object.fromEntries(grouped.props!.columns.map((c) => [c.key, c.edit?.kind ?? null]));
    expect(kinds).toEqual({
      title: "text",
      apoyo: "people",
      estatus: "select",
      vence: "date",
      prioridad: "select",
      subtareas: null,
      retraso: null,
    });
    expect(column("title").edit).toMatchObject({ required: true });
    expect(column("vence").edit).toMatchObject({ quickPicks: true, clearable: true });
    // Rest state unchanged: the title is still plain text inside the row link.
    expect(screen.getByText("Revisar presupuesto").tagName).toBe("SPAN");
  });

  it("Tarea saves the trimmed title through updateTaskAction and shows it at once", async () => {
    let resolve!: (value: unknown) => void;
    tasksActions.updateTaskAction.mockReturnValue(new Promise((r) => (resolve = r)));
    renderTable();
    const edit = column("title").edit!;
    expect(edit.value(row("t2"))).toBe("Revisar presupuesto");
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = edit.commit(row("t2"), "  Revisar presupuesto v2 ");
    });
    await settle();
    expect(tasksActions.updateTaskAction).toHaveBeenCalledWith("t2", { title: "Revisar presupuesto v2" });
    // Optimistic: the new title shows before the server answers.
    expect(screen.getByText("Revisar presupuesto v2")).toBeTruthy();
    await act(async () => {
      resolve(ok(task("t2", "Revisar presupuesto v2")));
      await pending;
    });
    expect(screen.getByText("Revisar presupuesto v2")).toBeTruthy();
  });

  it("Estatus lists base and custom statuses with colours", async () => {
    renderTable();
    await waitFor(() => {
      const edit = column("estatus").edit!;
      if (edit.kind !== "select") throw new Error("select");
      expect(edit.options(row("t2")).map((o) => o.label)).toEqual([
        "Pendiente",
        "En proceso",
        "Completado",
        "Bloqueado",
        "En revisión cliente",
        "Entregada",
      ]);
    });
    const edit = column("estatus").edit!;
    if (edit.kind !== "select") throw new Error("select");
    for (const option of edit.options(row("t2"))) expect(option.color).toMatch(/^var\(--/);
    expect(edit.value(row("t2"))).toBe("pendiente");
  });

  it("completing a task takes it out of the table and the summary follows", async () => {
    tasksActions.setTaskStatusAction.mockResolvedValue(ok(task("t1", "Planos de cimentación", { status: "completado" })));
    renderTable();
    myTasks.server!.tasks = TASKS.filter((t) => t.id !== "t1");
    expect(kpi("Mis abiertas")).toBe("4");
    expect(kpi("Vencidas")).toBe("2");
    const result = await commit("estatus", "t1", "completado");
    expect(result.ok).toBe(true);
    expect(tasksActions.setTaskStatusAction).toHaveBeenCalledWith("t1", "completado");
    expect(screen.queryByText("Planos de cimentación")).toBeNull();
    expect(kpi("Mis abiertas")).toBe("3");
    expect(kpi("Vencidas")).toBe("1");
    expect(sectionToggle(/Mis tareas/).textContent).toMatch(/3 abiertas · 2 proyectos/);
    expect(screen.getByTestId("totals").textContent).toBe("Total · 3 tareas | 2 d");
  });

  it("a status that stays open keeps the row and moves its label", async () => {
    tasksActions.setTaskCustomStatusAction.mockResolvedValue(ok(task("t2", "Revisar presupuesto")));
    renderTable();
    await waitFor(() => expect(column("estatus").edit!.kind).toBe("select"));
    await waitFor(() => {
      const edit = column("estatus").edit!;
      if (edit.kind !== "select") throw new Error("select");
      expect(edit.options(row("t2")).length).toBe(6);
    });
    const rev = { id: "cs-rev", name: "En revisión cliente", closes: false, countsAsCompleted: false };
    myTasks.server!.tasks = TASKS.map((t) => (t.id === "t2" ? { ...t, customStatusId: rev.id, customStatus: rev } : t));
    await commit("estatus", "t2", "custom:cs-rev");
    expect(tasksActions.setTaskCustomStatusAction).toHaveBeenCalledWith("t2", "cs-rev");
    expect(within(screen.getByText("Revisar presupuesto").closest("tr")!).getByText("En revisión cliente")).toBeTruthy();
    expect(kpi("Mis abiertas")).toBe("4");
  });

  it("a closing custom status takes the task out", async () => {
    tasksActions.setTaskCustomStatusAction.mockResolvedValue(ok(task("t2", "Revisar presupuesto")));
    renderTable();
    await waitFor(() => {
      const edit = column("estatus").edit!;
      if (edit.kind !== "select") throw new Error("select");
      expect(edit.options(row("t2")).length).toBe(6);
    });
    myTasks.server!.tasks = TASKS.filter((t) => t.id !== "t2");
    await commit("estatus", "t2", "custom:cs-ent");
    expect(screen.queryByText("Revisar presupuesto")).toBeNull();
    expect(kpi("Mis abiertas")).toBe("3");
  });

  it("a refused save puts the row and the KPIs back", async () => {
    tasksActions.setTaskStatusAction.mockResolvedValue({ ok: false, error: "FORBIDDEN: task status change" });
    renderTable();
    const result = await commit("estatus", "t1", "completado");
    expect(result.ok).toBe(false);
    expect(screen.getByText("Planos de cimentación")).toBeTruthy();
    expect(kpi("Mis abiertas")).toBe("4");
    expect(kpi("Vencidas")).toBe("2");
  });

  it("undoing a completion puts the task back", async () => {
    tasksActions.setTaskStatusAction.mockImplementation(async (id: string, status: TaskListItem["status"]) =>
      ok(task(id, "Planos de cimentación", { status })),
    );
    renderTable();
    myTasks.server!.tasks = TASKS.filter((t) => t.id !== "t1");
    await commit("estatus", "t1", "completado");
    expect(screen.queryByText("Planos de cimentación")).toBeNull();
    // Deshacer commits the previous value with the row it had; the refetch brings the row back.
    const edit = column("estatus").edit!;
    const previous = { ...row("t2"), id: "t1", projectId: "p1", title: "Planos de cimentación" };
    myTasks.server!.tasks = TASKS;
    await act(async () => {
      await edit.commit(previous, "pendiente");
    });
    await settle();
    await act(async () => {
      await view!.client.invalidateQueries({ queryKey: qk.me.tasks() });
    });
    await settle();
    expect(tasksActions.setTaskStatusAction).toHaveBeenLastCalledWith("t1", "pendiente");
    expect(screen.getByText("Planos de cimentación")).toBeTruthy();
    expect(kpi("Mis abiertas")).toBe("4");
  });

  it("Vence saves the commitment date and the overdue figures follow", async () => {
    tasksActions.updateTaskAction.mockResolvedValue(ok(task("t2", "Revisar presupuesto")));
    renderTable();
    expect(column("vence").edit!.value(row("t2"))).toBe(addDays(TODAY, 3));
    const past = addDays(TODAY, -6);
    myTasks.server!.tasks = TASKS.map((t) => (t.id === "t2" ? { ...t, commitmentDate: past } : t));
    await commit("vence", "t2", past);
    expect(tasksActions.updateTaskAction).toHaveBeenCalledWith("t2", { commitmentDate: past });
    expect(kpi("Vencidas")).toBe("3");
    const cell = within(screen.getByText("Revisar presupuesto").closest("tr")!).getByText("6");
    expect(cell.className).toMatch(/bg-warning/);
    // Sin fecha clears it.
    myTasks.server!.tasks = TASKS.map((t) => (t.id === "t2" ? { ...t, commitmentDate: null } : t));
    await commit("vence", "t2", null);
    expect(tasksActions.updateTaskAction).toHaveBeenLastCalledWith("t2", { commitmentDate: null });
    expect(kpi("Vencidas")).toBe("2");
  });

  it("Prioridad offers Alta, Media and Baja and saves through updateTaskAction", async () => {
    tasksActions.updateTaskAction.mockResolvedValue(ok(task("t2", "Revisar presupuesto", { priority: "alta" })));
    renderTable();
    const edit = column("prioridad").edit!;
    if (edit.kind !== "select") throw new Error("select");
    expect(edit.options(row("t2")).map((o) => o.value)).toEqual(["alta", "media", "baja"]);
    expect(edit.value(row("t2"))).toBe("media");
    myTasks.server!.tasks = TASKS.map((t) => (t.id === "t2" ? { ...t, priority: "alta" as const } : t));
    await commit("prioridad", "t2", "alta");
    expect(tasksActions.updateTaskAction).toHaveBeenCalledWith("t2", { priority: "alta" });
    expect(within(screen.getByText("Revisar presupuesto").closest("tr")!).getByText("Alta")).toBeTruthy();
  });

  it("locks the cells the viewer can't change, with the reason", () => {
    caps.canCreateActivity = false;
    caps.statusScope = "none";
    renderTable();
    const t2 = row("t2");
    expect(column("title").canEdit!(t2)).toBe(LOCK_REASON.taskWriter);
    expect(column("vence").canEdit!(t2)).toBe(LOCK_REASON.taskWriter);
    expect(column("prioridad").canEdit!(t2)).toBe(LOCK_REASON.taskWriter);
    expect(column("estatus").canEdit!(t2)).toBe(LOCK_REASON.status);
  });

  it("an owner with status rights edits every editable column", () => {
    caps.statusScope = "assigned_or_participant";
    renderTable();
    const t2 = row("t2");
    for (const key of ["title", "estatus", "vence", "prioridad"]) expect(column(key).canEdit!(t2)).toBe(true);
  });
});
