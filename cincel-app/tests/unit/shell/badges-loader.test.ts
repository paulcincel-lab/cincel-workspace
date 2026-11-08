// @vitest-environment node
/**
 * `loadShellBadges` (plan §4.3 Shell): three COUNT-sized reads keyed by the
 * caller, 0 for a read that fails or is a stub, and the reminders still due
 * today. The DB-backed counterpart is `tests/db/shell-badges.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";

const m = vi.hoisted(() => ({
  canViewActivities: true,
  countOpenTasksFor: vi.fn(),
  countUnreadNotifications: vi.fn(),
  listReminders: vi.fn(),
  mySpace: { fetchRemindersAction: true } as Record<string, boolean>,
  notifications: { fetchNotificationsAction: true } as Record<string, boolean>,
}));

vi.mock("@/lib/db/client", () => ({ db: { marker: "db" } }));
vi.mock("@/lib/auth/permissions", () => ({
  canSeeAdminData: () => false,
  resolveActivitiesCapabilities: () => ({ canViewActivities: m.canViewActivities }),
}));
vi.mock("@/lib/repositories/tasks-repository", () => ({ countOpenTasksFor: m.countOpenTasksFor }));
vi.mock("@/lib/repositories/notifications-repository", () => ({ countUnreadNotifications: m.countUnreadNotifications }));
vi.mock("@/lib/my-space/reminder-service", () => ({ listReminders: m.listReminders }));
vi.mock("@/lib/actions/my-space-actions.flags", () => ({ IMPLEMENTED: m.mySpace }));
vi.mock("@/lib/actions/notifications-actions.flags", () => ({ IMPLEMENTED: m.notifications }));

import { capabilityUserOf, endOfLocalDay, loadDueReminders, loadShellBadges } from "@/lib/shell/badges";

const USER: AuthenticatedUser = {
  member: {
    id: "s1",
    name: "Ana",
    role: "Diseño",
    area: "",
    capacity: 0,
    availability: "",
    active: true,
    institutionalEmail: "",
    phone: "",
  },
  email: "ana@cincel.mx",
  access: "Colaborador",
};

const NOW = new Date("2026-11-07T17:00:00.000Z"); // 11:00 in Mexico City

function reminder(dueAt: string, patch: Record<string, unknown> = {}) {
  return { id: dueAt, text: "Llamar", dueAt, repeat: "none", channels: ["app"], taskId: null, projectId: null, firedAt: null, cancelledAt: null, ...patch };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.canViewActivities = true;
  m.mySpace.fetchRemindersAction = true;
  m.notifications.fetchNotificationsAction = true;
  m.countOpenTasksFor.mockResolvedValue(4);
  m.countUnreadNotifications.mockResolvedValue(3);
  m.listReminders.mockResolvedValue([reminder("2026-11-07T20:00:00.000Z")]);
});

describe("loadShellBadges", () => {
  it("composes my open tasks, the unread count and today's due reminders", async () => {
    await expect(loadShellBadges(USER, NOW)).resolves.toEqual({
      tareasOpen: 4,
      bandeja: { unreadCount: 3, dueReminders: ["2026-11-07T20:00:00.000Z"], renderedAt: NOW.getTime() },
    });
  });

  it("keys every read by the caller's own staff id", async () => {
    await loadShellBadges(USER, NOW);
    expect(m.countOpenTasksFor).toHaveBeenCalledWith("s1", { staffId: "s1", isAdmin: false });
    expect(m.countUnreadNotifications).toHaveBeenCalledWith({ marker: "db" }, "s1");
    expect(m.listReminders).toHaveBeenCalledWith(
      USER,
      { from: "2026-11-07T17:00:00.000Z", to: "2026-11-08T05:59:59.999Z" },
      NOW,
    );
  });

  it("counts 0 open tasks without the activities capability, without reading them", async () => {
    m.canViewActivities = false;
    expect((await loadShellBadges(USER, NOW)).tareasOpen).toBe(0);
    expect(m.countOpenTasksFor).not.toHaveBeenCalled();
  });

  it("counts 0 for a read that fails; the rest still counts", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.countOpenTasksFor.mockRejectedValue(new Error("db down"));
    m.countUnreadNotifications.mockRejectedValue(new Error("db down"));
    const badges = await loadShellBadges(USER, NOW);
    expect(badges.tareasOpen).toBe(0);
    expect(badges.bandeja.unreadCount).toBe(0);
    expect(badges.bandeja.dueReminders).toEqual(["2026-11-07T20:00:00.000Z"]);
  });

  it("reads no notification while the notifications read is a stub", async () => {
    m.notifications.fetchNotificationsAction = false;
    expect((await loadShellBadges(USER, NOW)).bandeja.unreadCount).toBe(0);
    expect(m.countUnreadNotifications).not.toHaveBeenCalled();
  });
});

describe("loadDueReminders", () => {
  it("skips fired and cancelled reminders", async () => {
    m.listReminders.mockResolvedValue([
      reminder("2026-11-07T20:00:00.000Z"),
      reminder("2026-11-07T21:00:00.000Z", { firedAt: "2026-11-07T21:00:05.000Z" }),
      reminder("2026-11-07T22:00:00.000Z", { cancelledAt: "2026-11-07T18:00:00.000Z" }),
    ]);
    expect(await loadDueReminders(USER, NOW)).toEqual(["2026-11-07T20:00:00.000Z"]);
  });

  it("counts none while the reminders read is a stub or fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.listReminders.mockRejectedValue(new Error("db down"));
    expect(await loadDueReminders(USER, NOW)).toEqual([]);
    m.mySpace.fetchRemindersAction = false;
    m.listReminders.mockClear();
    expect(await loadDueReminders(USER, NOW)).toEqual([]);
    expect(m.listReminders).not.toHaveBeenCalled();
  });

  it("ends the local day at midnight in Mexico City", () => {
    expect(endOfLocalDay(new Date("2026-11-08T03:00:00.000Z")).toISOString()).toBe("2026-11-08T05:59:59.999Z");
  });
});

describe("capabilityUserOf", () => {
  it("maps the session user like requireCapabilityUser", () => {
    expect(
      capabilityUserOf({
        id: "s1",
        name: "Ana",
        email: "ana@cincel.mx",
        role: null,
        area: null,
        active: true,
        mustChangePassword: false,
        googleLinked: true,
        access: "Administrador",
      }),
    ).toMatchObject({ member: { id: "s1", name: "Ana", role: "", area: "" }, email: "ana@cincel.mx", access: "Administrador" });
  });
});
