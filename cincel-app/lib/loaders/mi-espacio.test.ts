// @vitest-environment node
/**
 * The Mi espacio loader (Query Migration Phase 7, #941): one call composes
 * the five reads, `loadGmailAccess` runs once, and every read is keyed by the
 * viewer's own staff id.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

const h = vi.hoisted(() => ({
  loadGmailAccess: vi.fn(),
  listGmailThreadsPage: vi.fn(),
  listNotificationsPage: vi.fn(),
  listReminders: vi.fn(),
  listNotesPage: vi.fn(),
  listChecklistsPage: vi.fn(),
  myTaskSummary: vi.fn(),
  listTasksPage: vi.fn(),
}));

vi.mock("@/lib/gmail/access", () => ({ loadGmailAccess: h.loadGmailAccess }));
vi.mock("@/lib/gmail/threads-page", () => ({
  gmailStatusOf: (access: { connected: boolean; scopeOk: boolean }) => ({
    connected: access.connected,
    scopeOk: access.scopeOk,
    lastSyncedAt: null,
    lastError: null,
  }),
  listGmailThreadsPage: h.listGmailThreadsPage,
}));
vi.mock("@/lib/my-space/notifications-page", () => ({ listNotificationsPage: h.listNotificationsPage }));
vi.mock("@/lib/my-space/reminder-service", () => ({ listReminders: h.listReminders }));
vi.mock("@/lib/my-space/notes-checklists", () => ({
  listNotesPage: h.listNotesPage,
  listChecklistsPage: h.listChecklistsPage,
}));

vi.mock("@/lib/repositories/tasks-repository", () => ({ myTaskSummary: h.myTaskSummary, listTasksPage: h.listTasksPage }));
vi.mock("@/lib/auth/permissions", () => ({
  resolveActivitiesCapabilities: () => ({ canCreateActivity: true }),
  canSeeAdminData: () => false,
}));

const { loadMiEspacio } = await import("./mi-espacio");
const { EMPTY_MY_TASKS_COUNTS, EMPTY_MY_TASKS_SUMMARY, MY_TASKS_ALL } = await import("@/lib/my-space/my-tasks-summary");

const ESENCIAL = ["p1", "p2", "p3", "p4"].map((id) => ({ project: { id, name: id }, open: 1, overdue: 0, nearestDue: null }));
const PROJECTS = ["p1", "p2"].map((id) => ({
  project: { id, name: id },
  ...EMPTY_MY_TASKS_COUNTS,
  open: 2,
  tramos: [
    { tramo: { id: null, key: null, name: "Sin tramo", sortOrder: 2147483647 }, ...EMPTY_MY_TASKS_COUNTS, open: 1 },
    { tramo: { id: null, key: null, name: "Sin tramo", sortOrder: 2147483647 }, ...EMPTY_MY_TASKS_COUNTS, open: 1 },
  ],
}));

const user = {
  member: { id: "staff-ana", name: "Ana" },
  email: "ana@cincel.example",
  access: "Colaborador",
} as unknown as AuthenticatedUser;

const page = { items: [], nextCursor: null, unreadCount: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  h.loadGmailAccess.mockResolvedValue({ connected: true, scopeOk: true, canRead: true, account: null });
  h.listGmailThreadsPage.mockResolvedValue({ threads: [], nextCursor: "c1" });
  h.listNotificationsPage.mockResolvedValue(page);
  h.listReminders.mockResolvedValue([]);
  h.listNotesPage.mockResolvedValue({ items: [], nextCursor: "24" });
  h.listChecklistsPage.mockResolvedValue({ items: [], nextCursor: null });
  h.myTaskSummary.mockResolvedValue({ ...EMPTY_MY_TASKS_SUMMARY, esencial: ESENCIAL, projects: PROJECTS });
  h.listTasksPage.mockResolvedValue({ rows: [], nextCursor: null, total: 0 });
});

describe("loadMiEspacio", () => {
  it("computes Gmail access once and reads the first thread page", async () => {
    const data = await loadMiEspacio(user, new Date(Date.UTC(2026, 10, 8, 15, 0, 0)));

    expect(h.loadGmailAccess).toHaveBeenCalledTimes(1);
    expect(h.loadGmailAccess).toHaveBeenCalledWith(expect.anything(), "staff-ana");
    expect(h.listGmailThreadsPage).toHaveBeenCalledWith("staff-ana", {});
    expect(data.gmail).toEqual({
      status: { connected: true, scopeOk: true, lastSyncedAt: null, lastError: null },
      threads: [],
      nextCursor: "c1",
    });
  });

  it("reads every list as the viewer and returns the cursors of the bounded lists", async () => {
    const data = await loadMiEspacio(user, new Date(Date.UTC(2026, 10, 8, 15, 0, 0)));

    expect(h.listNotificationsPage).toHaveBeenCalledWith("staff-ana", {});
    expect(h.listReminders).toHaveBeenCalledWith(
      user,
      { from: expect.any(String), to: expect.any(String) },
      expect.any(Date),
    );
    expect(h.listNotesPage).toHaveBeenCalledWith(user);
    expect(h.listChecklistsPage).toHaveBeenCalledWith(user);
    expect(data).toMatchObject({ notesCursor: "24", checklistsCursor: null, notifications: page });
  });

  it("counts my tasks in one summary and reads only the first page of what the style shows (#1051)", async () => {
    const plain = await loadMiEspacio(user);
    // No style (the hover prefetch): the summary only.
    expect(h.myTaskSummary).toHaveBeenCalledTimes(1);
    expect(h.myTaskSummary.mock.calls[0]![0]).toEqual({ involvesStaffId: "staff-ana" });
    expect(h.listTasksPage).not.toHaveBeenCalled();
    expect(plain.tasks).toMatchObject({ input: MY_TASKS_ALL, lists: [] });
    expect(plain.canCreateTask).toBe(true);

    const visual = await loadMiEspacio(user, new Date(), { style: "visual" });
    expect(visual.tasks.lists.map((l) => l.filters.vence)).toEqual(["hoy", "semana", "despues"]);
    // Mine, open ones, by due date; the first page of a column is 5.
    expect(h.listTasksPage.mock.calls[0]![0]).toMatchObject({ involvesStaffId: "staff-ana", mostrar: "abiertas" });
    expect(h.listTasksPage.mock.calls[0]![2]).toMatchObject({ cursor: null, limit: 5, orderBy: "vence" });

    h.listTasksPage.mockClear();
    const esencial = await loadMiEspacio(user, new Date(), { style: "esencial" });
    expect(esencial.tasks.lists.map((l) => l.filters.proyecto)).toEqual(["p1", "p2", "p3"]);
    expect(h.listTasksPage.mock.calls[0]![2]).toMatchObject({ limit: 4 });

    h.listTasksPage.mockClear();
    const analitico = await loadMiEspacio(user, new Date(), { style: "analitico" });
    expect(analitico.tasks.lists).toHaveLength(3);
    expect(h.listTasksPage.mock.calls[0]![2]).toMatchObject({ limit: 30, orderBy: "retraso" });

    // The URL's Analítico filters narrow the counts in Analítico only.
    const narrowed = { tramo: null, q: "planos" };
    expect((await loadMiEspacio(user, new Date(), { style: "analitico", analiticoInput: narrowed })).tasks.input).toEqual(narrowed);
    expect((await loadMiEspacio(user, new Date(), { style: "visual", analiticoInput: narrowed })).tasks.input).toEqual(MY_TASKS_ALL);
  });

  it("skips the thread read when Gmail is not connected", async () => {
    h.loadGmailAccess.mockResolvedValue({ connected: false, scopeOk: false, canRead: false, account: null });
    const data = await loadMiEspacio(user);
    expect(h.listGmailThreadsPage).not.toHaveBeenCalled();
    expect(data.gmail).toMatchObject({ threads: [], nextCursor: null });
  });
});
