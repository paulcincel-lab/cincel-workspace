import { beforeEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({
  mySpace: {} as Record<string, boolean>,
  notifications: {} as Record<string, boolean>,
}));
vi.mock("@/lib/actions/my-space-actions.flags", () => ({ IMPLEMENTED: flags.mySpace }));
vi.mock("@/lib/actions/notifications-actions.flags", () => ({ IMPLEMENTED: flags.notifications }));

const actions = vi.hoisted(() => ({ fetchNotificationsAction: vi.fn() }));
vi.mock("@/lib/actions/notifications-actions", () => actions);

import type { NavSession } from "@/lib/ui/nav";
import { bandejaBadgeSlot } from "@/lib/shell/sidebar-slots/bandeja-badge";

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
});

describe("Mi espacio nav item", () => {
  it("shows the item with the unread badge when the actions are implemented", async () => {
    const item = await miEspacioNavItem.resolve(SESSION);
    expect(item).toMatchObject({ key: "mi-espacio", label: "Mi espacio", href: "/mi-espacio", badge: 3 });
    expect(actions.fetchNotificationsAction).toHaveBeenCalledWith({ unreadOnly: true });
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
  it("loads the unread count", async () => {
    expect(await bandejaBadgeSlot.load(SESSION)).toEqual({ unreadCount: 3 });
  });

  it("loads zero (the badge hides itself and the poll can raise it)", async () => {
    actions.fetchNotificationsAction.mockResolvedValue({ items: [], nextCursor: null, unreadCount: 0 });
    expect(await bandejaBadgeSlot.load(SESSION)).toEqual({ unreadCount: 0 });
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
