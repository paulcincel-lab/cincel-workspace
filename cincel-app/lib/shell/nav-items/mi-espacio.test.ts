import { beforeEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({
  mySpace: {} as Record<string, boolean>,
  notifications: {} as Record<string, boolean>,
}));
vi.mock("@/lib/actions/my-space-actions.flags", () => ({ IMPLEMENTED: flags.mySpace }));
vi.mock("@/lib/actions/notifications-actions.flags", () => ({ IMPLEMENTED: flags.notifications }));

const actions = vi.hoisted(() => ({ fetchNotificationsAction: vi.fn() }));
vi.mock("@/lib/actions/notifications-actions", () => actions);
const mySpace = vi.hoisted(() => ({ fetchRemindersAction: vi.fn() }));
vi.mock("@/lib/actions/my-space-actions", () => mySpace);

import type { NavSession } from "@/lib/ui/nav";
import { bandejaBadgeSlot, endOfLocalDay, loadDueReminders } from "@/lib/shell/sidebar-slots/bandeja-badge";

import { miEspacioNavItem } from "./mi-espacio";

const SESSION: NavSession = { staffId: "s1", name: "Paul", role: "Diseño", isAdmin: false, photoUrl: null };

function setFlags(on: boolean) {
  Object.assign(flags.mySpace, {
    fetchNotesAction: on,
    fetchChecklistsAction: on,
    fetchRemindersAction: on,
  });
  Object.assign(flags.notifications, { fetchNotificationsAction: on });
}

beforeEach(() => {
  vi.clearAllMocks();
  setFlags(true);
  actions.fetchNotificationsAction.mockResolvedValue({ items: [], nextCursor: null, unreadCount: 3 });
  mySpace.fetchRemindersAction.mockResolvedValue([]);
});

function reminder(dueAt: string, patch: Record<string, unknown> = {}) {
  return { id: dueAt, text: "Llamar", dueAt, repeat: "none", channels: ["app"], taskId: null, projectId: null, firedAt: null, cancelledAt: null, ...patch };
}

describe("Mi espacio nav item", () => {
  it("shows the item with the unread badge when the actions are implemented", async () => {
    const item = await miEspacioNavItem.resolve(SESSION);
    expect(item).toMatchObject({ key: "mi-espacio", label: "Mi espacio", href: "/mi-espacio", badge: 3 });
    expect(actions.fetchNotificationsAction).toHaveBeenCalledWith({ unreadOnly: true });
  });

  it("adds the reminders still due today to the badge", async () => {
    mySpace.fetchRemindersAction.mockResolvedValue([
      reminder("2099-01-01T18:00:00.000Z"),
      reminder("2099-01-01T19:00:00.000Z"),
    ]);
    const item = await miEspacioNavItem.resolve(SESSION);
    expect(item?.badge).toBe(5);
  });

  it("counts the reminders alone when the unread read fails", async () => {
    actions.fetchNotificationsAction.mockRejectedValue(new Error("FORBIDDEN"));
    mySpace.fetchRemindersAction.mockResolvedValue([reminder("2099-01-01T18:00:00.000Z")]);
    expect((await miEspacioNavItem.resolve(SESSION))?.badge).toBe(1);
  });

  it("hides the badge at zero", async () => {
    actions.fetchNotificationsAction.mockResolvedValue({ items: [], nextCursor: null, unreadCount: 0 });
    const item = await miEspacioNavItem.resolve(SESSION);
    expect(item).not.toBeNull();
    expect(item?.badge).toBeUndefined();
  });

  it("keeps the item without a badge when the unread read fails", async () => {
    actions.fetchNotificationsAction.mockRejectedValue(new Error("FORBIDDEN"));
    const item = await miEspacioNavItem.resolve(SESSION);
    expect(item?.href).toBe("/mi-espacio");
    expect(item?.badge).toBeUndefined();
  });

  it("stays hidden while any page read is a stub", async () => {
    for (const key of ["fetchNotesAction", "fetchChecklistsAction", "fetchRemindersAction"]) {
      setFlags(true);
      flags.mySpace[key] = false;
      expect(await miEspacioNavItem.resolve(SESSION)).toBeNull();
    }
    setFlags(true);
    flags.notifications.fetchNotificationsAction = false;
    expect(await miEspacioNavItem.resolve(SESSION)).toBeNull();
    expect(actions.fetchNotificationsAction).not.toHaveBeenCalled();
  });
});

describe("Bandeja badge sidebar slot", () => {
  it("loads the unread count and today's pending reminders", async () => {
    mySpace.fetchRemindersAction.mockResolvedValue([reminder("2099-01-01T18:00:00.000Z")]);
    expect(await bandejaBadgeSlot.load(SESSION)).toMatchObject({
      unreadCount: 3,
      dueReminders: ["2099-01-01T18:00:00.000Z"],
      renderedAt: expect.any(Number),
    });
  });

  it("loads zero (the badge hides itself and the poll can raise it)", async () => {
    actions.fetchNotificationsAction.mockResolvedValue({ items: [], nextCursor: null, unreadCount: 0 });
    expect(await bandejaBadgeSlot.load(SESSION)).toMatchObject({ unreadCount: 0, dueReminders: [] });
  });

  it("reads the reminders from now to the end of the local day, skipping fired and cancelled ones", async () => {
    const now = new Date("2026-11-07T17:00:00.000Z"); // 11:00 in Mexico City
    mySpace.fetchRemindersAction.mockResolvedValue([
      reminder("2026-11-07T20:00:00.000Z"),
      reminder("2026-11-07T21:00:00.000Z", { firedAt: "2026-11-07T21:00:05.000Z" }),
      reminder("2026-11-07T22:00:00.000Z", { cancelledAt: "2026-11-07T18:00:00.000Z" }),
    ]);
    expect(await loadDueReminders(now)).toEqual(["2026-11-07T20:00:00.000Z"]);
    expect(mySpace.fetchRemindersAction).toHaveBeenCalledWith({
      from: "2026-11-07T17:00:00.000Z",
      to: "2026-11-08T05:59:59.999Z",
    });
  });

  it("ends the local day at midnight in Mexico City", () => {
    expect(endOfLocalDay(new Date("2026-11-08T03:00:00.000Z")).toISOString()).toBe("2026-11-08T05:59:59.999Z");
  });

  it("counts no reminders while their read is a stub or fails", async () => {
    mySpace.fetchRemindersAction.mockRejectedValue(new Error("db down"));
    expect(await loadDueReminders()).toEqual([]);
    flags.mySpace.fetchRemindersAction = false;
    mySpace.fetchRemindersAction.mockClear();
    expect(await loadDueReminders()).toEqual([]);
    expect(mySpace.fetchRemindersAction).not.toHaveBeenCalled();
  });

  it("stub phase: hidden and never calls the action while notifications are a stub", async () => {
    setFlags(false);
    expect(await bandejaBadgeSlot.load(SESSION)).toBeNull();
    expect(await miEspacioNavItem.resolve(SESSION)).toBeNull();
    expect(actions.fetchNotificationsAction).not.toHaveBeenCalled();
  });

  it("is hidden when the read fails", async () => {
    actions.fetchNotificationsAction.mockRejectedValue(new Error("INVALID"));
    expect(await bandejaBadgeSlot.load(SESSION)).toBeNull();
  });
});
