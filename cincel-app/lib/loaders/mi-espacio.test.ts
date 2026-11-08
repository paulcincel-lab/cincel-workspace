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

const { loadMiEspacio } = await import("./mi-espacio");

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

  it("skips the thread read when Gmail is not connected", async () => {
    h.loadGmailAccess.mockResolvedValue({ connected: false, scopeOk: false, canRead: false, account: null });
    const data = await loadMiEspacio(user);
    expect(h.listGmailThreadsPage).not.toHaveBeenCalled();
    expect(data.gmail).toMatchObject({ threads: [], nextCursor: null });
  });
});
