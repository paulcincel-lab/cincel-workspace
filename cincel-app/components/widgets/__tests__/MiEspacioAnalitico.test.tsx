// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";

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
import type { TaskListItem } from "@/lib/types/core";
import type { Checklist, NotificationKindSummary, TodayStatus, WeekHours } from "@/lib/types/redesign";
import { seedSessionUser } from "@/tests/helpers/session-user";

const flags = vi.hoisted(() => ({}) as Record<string, boolean>);
vi.mock("@/lib/actions/my-space-actions.flags", () => ({ IMPLEMENTED: flags }));
vi.mock("@/lib/actions/notifications-actions.flags", () => ({ IMPLEMENTED: flags }));
vi.mock("@/lib/actions/gmail-actions.flags", () => ({ IMPLEMENTED: flags }));
vi.mock("@/lib/actions/time-tracking-actions.flags", () => ({ IMPLEMENTED: flags }));

const tasksActions = vi.hoisted(() => ({
  fetchMyOpenTasksAction: vi.fn(),
  createUserTaskAction: vi.fn(),
}));
vi.mock("@/lib/actions/tasks-actions", () => tasksActions);
vi.mock("@/lib/actions/my-space-actions", () => ({
  fetchRemindersAction: vi.fn(),
  createChecklistAction: vi.fn(),
  toggleChecklistItemAction: vi.fn(),
  addChecklistItemAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/mi-espacio-actions", () => ({
  getMiEspacioPageData: vi.fn(),
  fetchMiEspacioNotesPage: vi.fn(),
  fetchMiEspacioChecklistsPage: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({
  fetchCatalogProjectOptions: vi.fn(async () => [
    { id: "p1", name: "Casa Lomas", status: "activo", currentWorkflowId: "w-dis" },
    { id: "p2", name: "Torre Sur", status: "activo", currentWorkflowId: "w-pre" },
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
vi.mock("@/components/widgets/GroupedTable", () => ({
  GroupedTable: (p: GroupedTableProps<Record<string, unknown>>) => (
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
  ),
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
              tramoId: null,
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

function renderAnalitico(over: { today?: TodayStatus; tasks?: TaskListItem[] } = {}) {
  const client = createTestQueryClient();
  client.setQueryData(qk.me.tasks(), over.tasks ?? TASKS);
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
  tasksActions.fetchMyOpenTasksAction.mockResolvedValue(TASKS);
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

  it("filters by estado and tramo and keeps the URL", () => {
    renderAnalitico();
    fireEvent.click(screen.getByRole("radio", { name: /En retraso/ }));
    expect(params.replaceMiEspacioParam).toHaveBeenCalledWith("estado", "retraso");
    fireEvent.click(screen.getByRole("radio", { name: /Presale/ }));
    expect(params.replaceMiEspacioParam).toHaveBeenCalledWith("tramo", "presale");
    cleanup();

    // A reload with the params shows the same filtered view.
    nav.search = "estado=retraso&tramo=presale";
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
    client.setQueryData(qk.me.tasks(), TASKS);
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
    tasksActions.fetchMyOpenTasksAction.mockResolvedValue([...TASKS, created]);
    renderAnalitico();

    const input = screen.getByRole("textbox", { name: "Agregar tarea en Casa Lomas" });
    expect(input.getAttribute("placeholder")).toBe(
      "Escribe para agregar una tarea en Casa Lomas…  #tramo  fecha  !prioridad",
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

  it("Exportar downloads visible rows", async () => {
    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:mi-espacio";
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    nav.search = "estado=retraso";
    renderAnalitico();

    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));
    expect(click).toHaveBeenCalled();
    const csv = await blobs[0]!.text();
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Proyecto;Tramo;Tarea;Estatus;Vence;Prioridad;Subtareas;Días de retraso");
    expect(lines.slice(1).map((line) => line.split(";")[2])).toEqual(["Planos de cimentación", "Permisos de obra"]);
    click.mockRestore();
  });

  it("renders table headers and has no serious or critical axe violations, light and dark", async () => {
    const { container } = renderAnalitico();
    for (const header of screen.getAllByRole("columnheader")) expect(header.getAttribute("scope")).toBe("col");
    for (const theme of ["light", "dark"]) {
      document.documentElement.classList.toggle("dark", theme === "dark");
      const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
      const blocking = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(blocking.map((v) => v.id), theme).toEqual([]);
    }
  });
});
